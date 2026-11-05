import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { execFile } from 'node:child_process'
import type { ActivationMode, ActivationRecord, ActivationResult } from '@shared/types'
import { activationStore } from '../state'
import log from '../log'
import * as win from './win32'

export const REG_SUFFIX = ' (Typeshelf)'
const isWin = process.platform === 'win32'
const NOT_ACTIVATABLE = new Set(['.woff', '.woff2'])

const key = (p: string): string => p.toLowerCase()

/** Directory where we symlink fonts on macOS / Linux. */
function posixFontsDir(): string {
  return process.platform === 'darwin' ? join(homedir(), 'Library', 'Fonts') : join(homedir(), '.local', 'share', 'fonts')
}

function posixLinkPath(path: string): string {
  return join(posixFontsDir(), `typeshelf-${basename(path)}`)
}

function refreshPosixCache(): void {
  if (process.platform === 'linux') execFile('fc-cache', ['-f'], () => undefined)
}

export class ActivationManager {
  /** Paths registered in HKCU by something other than Typeshelf. */
  private external = new Set<string>()

  get records(): Record<string, ActivationRecord> {
    return activationStore.get().records
  }

  externallyRegistered(): string[] {
    return [...this.external]
  }

  isActive(path: string): boolean {
    return Boolean(this.records[key(path)])
  }

  /** Reconcile stored state with the OS on startup. */
  async init(): Promise<void> {
    if (!isWin) return
    const reg = await win.listUserFonts()
    const ours = new Map<string, string>() // path -> value name
    this.external.clear()
    for (const [name, path] of reg) {
      if (name.endsWith(REG_SUFFIX)) ours.set(key(path), name)
      else if (/^[a-z]:\\/i.test(path)) this.external.add(key(path))
    }

    activationStore.update((s) => {
      for (const [k, rec] of Object.entries(s.records)) {
        // Session activations don't survive a reboot or a crash; start clean.
        if (rec.mode === 'session') {
          try {
            win.removeFontResource(rec.path)
          } catch {
            /* ignore */
          }
          delete s.records[k]
          continue
        }
        if (!existsSync(rec.path)) {
          log.warn('activated font file disappeared, cleaning up', rec.path)
          if (rec.regName) this.safeUnregister(rec.regName)
          delete s.records[k]
          continue
        }
        if (!ours.has(k)) {
          // Someone removed our registry entry (e.g. via Windows Settings). Restore it.
          try {
            win.registerUserFont(rec.regName ?? basename(rec.path) + REG_SUFFIX, rec.path)
          } catch (e) {
            log.error('failed to restore registration', rec.path, e)
            delete s.records[k]
          }
        }
      }
      // Adopt or remove orphaned registrations carrying our suffix.
      for (const [k, name] of ours) {
        if (s.records[k]) continue
        const path = reg.get(name)!
        if (existsSync(path)) {
          s.records[k] = { path, mode: 'permanent', regName: name, activatedAt: Date.now() }
        } else {
          this.safeUnregister(name)
        }
      }
    })
  }

  private safeUnregister(name: string): void {
    try {
      win.unregisterUserFont(name)
    } catch (e) {
      log.warn('unregister failed', name, e)
    }
  }

  private uniqueRegName(displayName: string): string {
    const taken = new Set(Object.values(this.records).map((r) => r.regName))
    let name = `${displayName}${REG_SUFFIX}`
    for (let i = 2; taken.has(name); i++) name = `${displayName} #${i}${REG_SUFFIX}`
    return name
  }

  /**
   * Activate files. `displayNames` maps path -> human name used for the registry value.
   */
  activate(paths: string[], mode: ActivationMode, displayNames: Map<string, string>): ActivationResult {
    const result: ActivationResult = { activated: 0, deactivated: 0, skipped: [] }
    const unique = [...new Set(paths)]
    activationStore.update((s) => {
      for (const path of unique) {
        const k = key(path)
        if (NOT_ACTIVATABLE.has(extname(path).toLowerCase())) {
          result.skipped.push({ path, reason: 'Web fonts (WOFF/WOFF2) can only be previewed' })
          continue
        }
        if (!existsSync(path)) {
          result.skipped.push({ path, reason: 'File not found' })
          continue
        }
        if (this.external.has(k)) {
          result.skipped.push({ path, reason: 'Already installed in Windows' })
          continue
        }
        const existing = s.records[k]
        if (existing && existing.mode === mode) continue
        try {
          if (existing) this.teardown(existing)
          const rec: ActivationRecord = { path, mode, activatedAt: Date.now() }
          if (isWin) {
            if (mode === 'permanent') {
              rec.regName = this.uniqueRegName(displayNames.get(path) ?? basename(path, extname(path)))
              win.registerUserFont(rec.regName, path)
            }
            if (!win.addFontResource(path)) {
              if (rec.regName) this.safeUnregister(rec.regName)
              throw new Error('Windows rejected the font file')
            }
          } else {
            mkdirSync(posixFontsDir(), { recursive: true })
            const link = posixLinkPath(path)
            if (!existsSync(link)) symlinkSync(path, link)
          }
          s.records[k] = rec
          result.activated++
        } catch (e) {
          log.error('activation failed', path, e)
          result.skipped.push({ path, reason: (e as Error).message })
        }
      }
    })
    this.notifyOs()
    return result
  }

  private teardown(rec: ActivationRecord): void {
    if (isWin) {
      win.removeFontResource(rec.path)
      if (rec.regName) this.safeUnregister(rec.regName)
    } else {
      const link = posixLinkPath(rec.path)
      try {
        if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
      } catch {
        /* not there */
      }
    }
  }

  deactivate(paths: string[]): ActivationResult {
    const result: ActivationResult = { activated: 0, deactivated: 0, skipped: [] }
    activationStore.update((s) => {
      for (const path of new Set(paths)) {
        const rec = s.records[key(path)]
        if (!rec) continue
        try {
          this.teardown(rec)
          delete s.records[key(path)]
          result.deactivated++
        } catch (e) {
          result.skipped.push({ path, reason: (e as Error).message })
        }
      }
    })
    this.notifyOs()
    return result
  }

  /** Re-load a font whose file changed on disk so apps pick up the new version. */
  reload(path: string): boolean {
    const rec = this.records[key(path)]
    if (!rec || !isWin) return false
    try {
      win.removeFontResource(path)
      win.addFontResource(path)
      this.notifyOs()
      return true
    } catch (e) {
      log.error('hot reload failed', path, e)
      return false
    }
  }

  /** Remove session-only fonts when the app quits. */
  shutdown(): void {
    const session = Object.values(this.records).filter((r) => r.mode === 'session')
    if (session.length) this.deactivate(session.map((r) => r.path))
    activationStore.flush()
  }

  private notifyOs(): void {
    try {
      if (isWin) win.broadcastFontChange()
      else refreshPosixCache()
    } catch (e) {
      log.warn('font change broadcast failed', e)
    }
  }
}

export const activation = new ActivationManager()
export const activationSupported = true
