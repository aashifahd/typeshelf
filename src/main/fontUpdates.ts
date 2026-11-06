import { Notification, shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { ActivationMode, CatalogFamily, FontUpdate, InstalledProviderFamily, ProviderId } from '@shared/types'
import { google } from './providers/google'
import { fontshare } from './providers/fontshare'
import { isNewerVersion } from './providers/select'
import { safeName, type Provider } from './providers/types'
import { providerStore, settingsStore } from './state'
import { scanPool } from './scanner/pool'
import { library } from './library'
import { activation } from './activation'
import { activateFaces, facesUnder } from './ops'
import log from './log'

export const providers: Record<ProviderId, Provider> = { google, fontshare }

type Emit = {
  updates: (u: FontUpdate[]) => void
  toast: (kind: 'info' | 'success' | 'error', text: string) => void
  progress: (p: { provider: ProviderId; key: string; done: number; total: number }) => void
}

let emit: Emit = { updates: () => undefined, toast: () => undefined, progress: () => undefined }
export function setUpdateEmitter(e: Emit): void {
  emit = e
}

const managedRoot = (): string => settingsStore.get().managedFontsDir
const updKey = (p: ProviderId, k: string): string => `${p}:${k}`

/** Serialize install/update operations so two never touch the same folder. */
let chain: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => undefined)
  return next
}

export function installed(): InstalledProviderFamily[] {
  return providerStore.get().installed
}

function findInstalled(provider: ProviderId, key: string): InstalledProviderFamily | undefined {
  return installed().find((i) => i.provider === provider && i.key === key)
}

async function downloadValidated(
  provider: Provider,
  key: string,
  preferVariable: boolean
): Promise<{ staging: string; files: string[]; version: string; variable: boolean }> {
  const staging = join(managedRoot(), '.staging', randomUUID())
  emit.progress({ provider: provider.id, key, done: 0, total: 1 })
  try {
    const dl = await provider.download(key, staging, preferVariable)
    const errors = await scanPool.validate(dl.files)
    if (errors.length) throw new Error(`Downloaded font failed validation: ${errors[0].error}`)
    emit.progress({ provider: provider.id, key, done: 1, total: 1 })
    return { staging, ...dl }
  } catch (e) {
    await rm(staging, { recursive: true, force: true })
    throw e
  }
}

export function installFamily(
  providerId: ProviderId,
  key: string,
  opts: { variable?: boolean; activate?: boolean } = {}
): Promise<InstalledProviderFamily> {
  return serialized(async () => {
    if (findInstalled(providerId, key)) throw new Error('This family is already installed')
    const provider = providers[providerId]
    const catalog = await provider.catalog()
    const entry = catalog.find((c) => c.key === key)
    if (!entry) throw new Error('Family not found in catalog')

    const dl = await downloadValidated(provider, key, opts.variable ?? settingsStore.get().preferVariable)
    const dir = join(managedRoot(), providerId, safeName(entry.name))
    await rm(dir, { recursive: true, force: true })
    await mkdir(join(managedRoot(), providerId), { recursive: true })
    await renameRetry(dl.staging, dir)

    const rec: InstalledProviderFamily = {
      provider: providerId,
      key,
      name: entry.name,
      version: dl.version || entry.version,
      dir,
      files: dl.files.map((f) => join(dir, f.split(/[\\/]/).pop()!)),
      variable: dl.variable,
      installedAt: Date.now()
    }
    providerStore.update((s) => {
      s.installed.push(rec)
    })
    await library.scan([providerId])
    if (opts.activate !== false) activateFaces(facesUnder(dir))
    library.notifyChanged()
    log.info(`installed ${providerId}/${key} v${rec.version}`)
    return rec
  })
}

export function uninstallFamily(providerId: ProviderId, key: string): Promise<void> {
  return serialized(async () => {
    const rec = findInstalled(providerId, key)
    if (!rec) return
    activation.deactivate(facesUnder(rec.dir).map((f) => f.path))
    // Just-deactivated fonts (and fresh downloads being scanned by antivirus)
    // can stay locked for a moment, so retry before giving up.
    let trashed = false
    for (let attempt = 0; attempt < 4 && !trashed; attempt++) {
      try {
        await shell.trashItem(rec.dir)
        trashed = true
      } catch (e) {
        log.warn(`uninstall: moving ${rec.dir} to the Recycle Bin failed (attempt ${attempt + 1})`, e)
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      }
    }
    if (!trashed) await rm(rec.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
    await rm(backupDir(rec), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
    providerStore.update((s) => {
      s.installed = s.installed.filter((i) => i !== rec)
      s.updates = s.updates.filter((u) => updKey(u.provider, u.key) !== updKey(providerId, key))
    })
    await library.scan([providerId])
    emit.updates(providerStore.get().updates)
  })
}

export function setPinned(providerId: ProviderId, key: string, pinned: boolean): void {
  providerStore.update((s) => {
    const rec = s.installed.find((i) => i.provider === providerId && i.key === key)
    if (rec) rec.pinned = pinned
    if (pinned) s.updates = s.updates.filter((u) => !(u.provider === providerId && u.key === key))
  })
  emit.updates(providerStore.get().updates)
}

/**
 * rename() that retries briefly on Windows sharing errors. Right after a font is
 * deactivated, Windows (or an antivirus scanner) can keep its file open for a
 * moment, which makes renaming the folder fail with EPERM/EBUSY/EACCES.
 */
async function renameRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (attempt >= 9 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw e
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
    }
  }
}

function backupDir(rec: InstalledProviderFamily): string {
  return join(managedRoot(), '.backup', rec.provider, safeName(rec.name))
}

/** Which activation mode (if any) the family's faces are currently using. */
function activeMode(rec: InstalledProviderFamily): ActivationMode | null {
  const faces = facesUnder(rec.dir)
  for (const f of faces) {
    const r = activation.records[f.path.toLowerCase()]
    if (r) return r.mode
  }
  return null
}

/** Swap `incoming` into `rec.dir`, keeping the old version as a backup. Rolls back on failure. */
async function swapIn(rec: InstalledProviderFamily, incoming: string): Promise<void> {
  const mode = activeMode(rec)
  const oldPaths = facesUnder(rec.dir).map((f) => f.path)
  if (mode) activation.deactivate(oldPaths)
  const backup = backupDir(rec)
  try {
    await rm(backup, { recursive: true, force: true })
    await mkdir(join(backup, '..'), { recursive: true })
    if (existsSync(rec.dir)) await renameRetry(rec.dir, backup)
    try {
      await renameRetry(incoming, rec.dir)
    } catch (e) {
      if (existsSync(backup)) await renameRetry(backup, rec.dir)
      throw e
    }
  } catch (e) {
    // Put the old fonts back exactly how they were.
    await library.scan([rec.provider])
    if (mode) activateFaces(facesUnder(rec.dir), mode)
    throw new Error(
      `Could not replace font files (they may be in use by another app): ${(e as Error).message}`
    )
  }
  await library.scan([rec.provider])
  if (mode) activateFaces(facesUnder(rec.dir), mode)
}

export async function checkForUpdates(): Promise<FontUpdate[]> {
  const inst = installed()
  const byProvider = new Map<ProviderId, InstalledProviderFamily[]>()
  for (const i of inst) {
    if (!byProvider.has(i.provider)) byProvider.set(i.provider, [])
    byProvider.get(i.provider)!.push(i)
  }
  const found: FontUpdate[] = []
  for (const [pid, list] of byProvider) {
    let catalog: CatalogFamily[]
    try {
      catalog = await providers[pid].catalog(true)
    } catch (e) {
      log.warn(`update check failed for ${pid}`, e)
      continue
    }
    const byKey = new Map(catalog.map((c) => [c.key, c]))
    for (const rec of list) {
      const remote = byKey.get(rec.key)
      if (!remote || rec.pinned) continue
      if (isNewerVersion(remote.version, rec.version)) {
        found.push({
          provider: pid,
          key: rec.key,
          name: rec.name,
          fromVersion: rec.version,
          toVersion: remote.version,
          status: 'available',
          checkedAt: Date.now()
        })
      }
    }
  }
  providerStore.update((s) => {
    s.updates = found
  })
  settingsStore.update((s) => {
    s.lastUpdateCheck = Date.now()
  })
  emit.updates(found)
  return found
}

function setUpdateStatus(provider: ProviderId, key: string, status: FontUpdate['status'], error?: string): void {
  providerStore.update((s) => {
    const u = s.updates.find((x) => x.provider === provider && x.key === key)
    if (u) {
      u.status = status
      u.error = error
    }
  })
  emit.updates(providerStore.get().updates)
}

export function applyUpdates(keys?: string[]): Promise<FontUpdate[]> {
  return serialized(async () => {
    const pending = providerStore
      .get()
      .updates.filter((u) => u.status === 'available' || u.status === 'failed')
      .filter((u) => !keys || keys.includes(updKey(u.provider, u.key)))
    for (const u of pending) {
      const rec = findInstalled(u.provider, u.key)
      if (!rec) continue
      setUpdateStatus(u.provider, u.key, 'installing')
      try {
        const dl = await downloadValidated(providers[u.provider], u.key, rec.variable)
        await swapIn(rec, dl.staging)
        providerStore.update((s) => {
          const r = s.installed.find((i) => i.provider === u.provider && i.key === u.key)!
          r.previousVersion = r.version
          r.version = dl.version || u.toVersion
          r.files = dl.files.map((f) => join(r.dir, f.split(/[\\/]/).pop()!))
          r.updatedAt = Date.now()
        })
        setUpdateStatus(u.provider, u.key, 'installed')
        log.info(`updated ${u.provider}/${u.key} ${u.fromVersion} -> ${u.toVersion}`)
      } catch (e) {
        log.error(`update failed ${u.provider}/${u.key}`, e)
        setUpdateStatus(u.provider, u.key, 'failed', (e as Error).message)
      }
    }
    // Drop completed entries so the badge clears.
    providerStore.update((s) => {
      s.updates = s.updates.filter((x) => x.status !== 'installed')
    })
    library.notifyChanged()
    emit.updates(providerStore.get().updates)
    return pending
  })
}

export function rollback(providerId: ProviderId, key: string): Promise<void> {
  return serialized(async () => {
    const rec = findInstalled(providerId, key)
    if (!rec || !rec.previousVersion) throw new Error('No previous version to roll back to')
    const backup = backupDir(rec)
    if (!existsSync(backup)) throw new Error('Backup not found')
    const tmp = join(managedRoot(), '.staging', randomUUID())
    await mkdir(join(tmp, '..'), { recursive: true })
    await renameRetry(backup, tmp)
    try {
      await swapIn(rec, tmp)
    } catch (e) {
      // Keep the previous version available so the user can try again.
      if (existsSync(tmp)) await renameRetry(tmp, backup).catch((err) => log.error('could not restore backup', err))
      throw e
    }
    providerStore.update((s) => {
      const r = s.installed.find((i) => i.provider === providerId && i.key === key)!
      const v = r.version
      r.version = r.previousVersion!
      r.previousVersion = v
      // Keep the family on this version until the user unpins it.
      r.pinned = true
    })
    emit.toast('success', `${rec.name} rolled back to ${rec.previousVersion}. Auto-updates paused for this family.`)
  })
}

let timer: NodeJS.Timeout | null = null

/** Background schedule: check shortly after launch, then every N hours. */
export function startUpdateScheduler(): void {
  const tick = async (): Promise<void> => {
    const s = settingsStore.get()
    if (!s.autoCheckUpdates || !installed().length) return
    try {
      const updates = await checkForUpdates()
      if (!updates.length) return
      if (s.autoInstallUpdates) {
        const done = await applyUpdates()
        const ok = done.filter((u) => !providerStore.get().updates.some((x) => x.key === u.key && x.status === 'failed'))
        if (ok.length) notify(`Updated ${ok.length} font famil${ok.length === 1 ? 'y' : 'ies'}`, ok.map((u) => u.name).join(', '))
      } else {
        notify(`${updates.length} font update${updates.length === 1 ? '' : 's'} available`, updates.map((u) => u.name).join(', '))
      }
    } catch (e) {
      log.error('scheduled update check failed', e)
    }
  }
  const schedule = (): void => {
    if (timer) clearInterval(timer)
    const hours = Math.max(1, settingsStore.get().updateCheckHours)
    timer = setInterval(tick, hours * 3600 * 1000)
  }
  const last = settingsStore.get().lastUpdateCheck ?? 0
  const hours = Math.max(1, settingsStore.get().updateCheckHours)
  // If the last check is older than the interval (e.g. PC was off), check soon after launch.
  const firstDelay = Date.now() - last > hours * 3600 * 1000 ? 20_000 : 5 * 60_000
  setTimeout(tick, firstDelay)
  schedule()
}

export function rescheduleUpdates(): void {
  if (timer) startUpdateScheduler()
}

function notify(title: string, body: string): void {
  emit.toast('info', `${title}: ${body}`)
  if (Notification.isSupported()) new Notification({ title, body: body.slice(0, 200) }).show()
}
