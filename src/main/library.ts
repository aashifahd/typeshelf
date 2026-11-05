import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { BrokenFont, FaceInfo, LibrarySnapshot, ScanProgress, Source } from '@shared/types'
import { isFontFile } from './scanner/parse'
import { scanPool } from './scanner/pool'
import type { ParseJob } from './scanner/worker'
import { LIBRARY_VERSION, libraryStore, settingsStore } from './state'
import { activation } from './activation'
import log from './log'

const MAX_DEPTH = 10

function defaultSources(): Source[] {
  const managed = settingsStore.get().managedFontsDir
  const list: Source[] = []
  if (process.platform === 'win32') {
    const windir = process.env.WINDIR ?? 'C:\\Windows'
    list.push({ id: 'system', kind: 'system', name: 'Windows fonts', path: join(windir, 'Fonts'), readonly: true, watch: false })
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    list.push({ id: 'user', kind: 'user', name: 'Installed for me', path: join(local, 'Microsoft', 'Windows', 'Fonts'), readonly: true, watch: true })
  } else if (process.platform === 'darwin') {
    list.push({ id: 'system', kind: 'system', name: 'System fonts', path: '/System/Library/Fonts', readonly: true, watch: false })
    list.push({ id: 'user', kind: 'user', name: 'Installed for me', path: join(homedir(), 'Library', 'Fonts'), readonly: true, watch: true })
  } else {
    list.push({ id: 'system', kind: 'system', name: 'System fonts', path: '/usr/share/fonts', readonly: true, watch: false })
  }
  list.push({ id: 'google', kind: 'google', name: 'Google Fonts', path: join(managed, 'google'), readonly: false, watch: true })
  list.push({ id: 'fontshare', kind: 'fontshare', name: 'Fontshare', path: join(managed, 'fontshare'), readonly: false, watch: true })
  return list
}

async function walk(dir: string, depth = 0, out: string[] = []): Promise<string[]> {
  if (depth > MAX_DEPTH) return out
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, depth + 1, out)
    else if (e.isFile() && isFontFile(e.name)) out.push(full)
  }
  return out
}

type Listener = (snap: LibrarySnapshot) => void
type ProgressListener = (p: ScanProgress) => void

export class Library {
  private watchers = new Map<string, FSWatcher>()
  private scanning: Promise<void> | null = null
  private queued: Promise<void> | null = null
  private queuedAll = false
  private queuedIds = new Set<string>()
  private dirty = new Set<string>()
  private dirtyTimer: NodeJS.Timeout | null = null
  private listeners: Listener[] = []
  private progressListeners: ProgressListener[] = []
  /** Paths changed on disk while active, reloaded after the next scan. */
  private changedActive = new Set<string>()
  onHotReload: (names: string[]) => void = () => undefined

  init(): void {
    const state = libraryStore.get()
    if (state.version !== LIBRARY_VERSION) {
      libraryStore.set({ version: LIBRARY_VERSION, sources: [], faces: [], broken: [] })
    }
    // Merge defaults with user-added folders, keeping managed paths in sync with settings.
    const defaults = defaultSources()
    const custom = libraryStore.get().sources.filter((s) => s.kind === 'folder')
    libraryStore.update((s) => {
      s.sources = [...defaults, ...custom]
    })
    for (const src of defaults) if (!src.readonly) mkdirSync(src.path, { recursive: true })
    this.restartWatchers()
  }

  onChange(l: Listener): void {
    this.listeners.push(l)
  }
  onProgress(l: ProgressListener): void {
    this.progressListeners.push(l)
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
  }

  private progress(p: ScanProgress): void {
    for (const l of this.progressListeners) l(p)
  }

  snapshot(): LibrarySnapshot {
    const s = libraryStore.get()
    return {
      sources: s.sources,
      faces: s.faces,
      broken: s.broken,
      activations: activation.records,
      externallyRegistered: activation.externallyRegistered()
    }
  }

  sources(): Source[] {
    return libraryStore.get().sources
  }

  face(id: string): FaceInfo | undefined {
    return libraryStore.get().faces.find((f) => f.id === id)
  }

  faces(ids: string[]): FaceInfo[] {
    const set = new Set(ids)
    return libraryStore.get().faces.filter((f) => set.has(f.id))
  }

  /** Lookup used by the font protocol: only files we indexed may be served. */
  private pathIndex: Map<string, FaceInfo> | null = null
  faceById(id: string): FaceInfo | undefined {
    if (!this.pathIndex) this.pathIndex = new Map(libraryStore.get().faces.map((f) => [f.id, f]))
    return this.pathIndex.get(id)
  }

  addFolder(path: string): Source {
    const existing = this.sources().find((s) => s.path.toLowerCase() === path.toLowerCase())
    if (existing) return existing
    const src: Source = {
      id: 'f-' + createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 10),
      kind: 'folder',
      name: basename(path) || path,
      path,
      readonly: false,
      watch: true
    }
    libraryStore.update((s) => {
      s.sources.push(src)
    })
    this.restartWatchers()
    void this.scan([src.id])
    return src
  }

  removeSource(id: string): void {
    const src = this.sources().find((s) => s.id === id)
    if (!src || src.kind !== 'folder') throw new Error('Only library folders can be removed')
    const paths = libraryStore.get().faces.filter((f) => f.sourceId === id).map((f) => f.path)
    activation.deactivate(paths)
    libraryStore.update((s) => {
      s.sources = s.sources.filter((x) => x.id !== id)
      s.faces = s.faces.filter((f) => f.sourceId !== id)
      s.broken = s.broken.filter((b) => b.sourceId !== id)
    })
    this.pathIndex = null
    this.restartWatchers()
    this.emit()
  }

  /** Scan all (or some) sources. Unchanged files are reused from cache. */
  scan(sourceIds?: string[]): Promise<void> {
    if (this.scanning) {
      // Merge into one follow-up scan that resolves only after it has run.
      if (!sourceIds) this.queuedAll = true
      else sourceIds.forEach((id) => this.queuedIds.add(id))
      if (!this.queued) {
        this.queued = this.scanning.then(() => {
          const ids = this.queuedAll ? undefined : [...this.queuedIds]
          this.queued = null
          this.queuedAll = false
          this.queuedIds.clear()
          return this.scan(ids)
        })
      }
      return this.queued
    }
    this.scanning = this.doScan(sourceIds)
      .catch((e) => log.error('scan failed', e))
      .finally(() => {
        this.scanning = null
      })
    return this.scanning
  }

  private async doScan(sourceIds?: string[]): Promise<void> {
    const t0 = Date.now()
    const sources = this.sources().filter((s) => !sourceIds || sourceIds.includes(s.id))
    this.progress({ phase: 'discovering', done: 0, total: 0 })

    const state = libraryStore.get()
    const cache = new Map<string, FaceInfo[]>()
    for (const f of state.faces) {
      const k = f.path.toLowerCase()
      if (!cache.has(k)) cache.set(k, [])
      cache.get(k)!.push(f)
    }
    const brokenCache = new Map(state.broken.map((b) => [b.path.toLowerCase(), b]))

    const keptFaces: FaceInfo[] = []
    const keptBroken: BrokenFont[] = []
    const jobs: ParseJob[] = []
    const seen = new Set<string>()

    for (const src of sources) {
      if (!existsSync(src.path)) continue
      const files = await walk(src.path)
      for (const path of files) {
        const k = path.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        let st
        try {
          st = await stat(path)
        } catch {
          continue
        }
        const size = st.size
        const mtime = Math.floor(st.mtimeMs)
        const cached = cache.get(k)
        if (cached && cached[0].size === size && cached[0].mtime === mtime) {
          keptFaces.push(...cached.map((f) => ({ ...f, sourceId: src.id })))
          continue
        }
        const b = brokenCache.get(k)
        if (b && !cached) {
          // Only retry broken files when they change; we don't store their stat, so retry on full scans.
          if (sourceIds) {
            keptBroken.push(b)
            continue
          }
        }
        jobs.push({ path, sourceId: src.id, size, mtime })
      }
    }

    this.progress({ phase: 'parsing', done: 0, total: jobs.length })
    const { faces, broken } = await scanPool.parse(jobs, (done, total, current) =>
      this.progress({ phase: 'parsing', done, total, current })
    )

    const scannedSourceIds = new Set(sources.map((s) => s.id))
    libraryStore.update((s) => {
      // Keep faces from sources we didn't scan this time.
      const others = s.faces.filter((f) => !scannedSourceIds.has(f.sourceId))
      const othersBroken = s.broken.filter((b) => !scannedSourceIds.has(b.sourceId))
      s.faces = [...others, ...keptFaces, ...faces]
      s.broken = [...othersBroken, ...keptBroken, ...broken]
    })
    this.pathIndex = null

    // Re-load active fonts whose files changed on disk.
    const reloaded: string[] = []
    for (const p of this.changedActive) {
      if (activation.reload(p)) {
        const f = faces.find((x) => x.path.toLowerCase() === p.toLowerCase())
        reloaded.push(f ? f.fullName : basename(p))
      }
    }
    this.changedActive.clear()
    if (reloaded.length) this.onHotReload(reloaded)

    // Drop activations whose file is gone from an indexed folder.
    const gone = Object.values(activation.records)
      .filter((r) => !existsSync(r.path))
      .map((r) => r.path)
    if (gone.length) activation.deactivate(gone)

    log.info(`scan: ${jobs.length} parsed, ${keptFaces.length} cached, ${broken.length} broken in ${Date.now() - t0}ms`)
    this.progress({ phase: 'done', done: jobs.length, total: jobs.length })
    this.emit()
  }

  private restartWatchers(): void {
    for (const w of this.watchers.values()) void w.close()
    this.watchers.clear()
    for (const src of this.sources()) {
      if (!src.watch || !existsSync(src.path)) continue
      const w = watch(src.path, {
        ignoreInitial: true,
        depth: MAX_DEPTH,
        awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
        ignored: (p: string, stats?: { isFile(): boolean }) => Boolean(stats?.isFile() && !isFontFile(p))
      })
      const onEvent = (path: string): void => {
        if (!isFontFile(path)) return
        if (settingsStore.get().hotReloadActiveFonts && activation.isActive(path)) this.changedActive.add(path)
        this.dirty.add(src.id)
        if (this.dirtyTimer) clearTimeout(this.dirtyTimer)
        this.dirtyTimer = setTimeout(() => {
          const ids = [...this.dirty]
          this.dirty.clear()
          void this.scan(ids)
        }, 1200)
      }
      w.on('add', onEvent).on('change', onEvent).on('unlink', onEvent)
      w.on('error', (e) => log.warn('watcher error', src.path, e))
      this.watchers.set(src.id, w)
    }
  }

  dispose(): void {
    for (const w of this.watchers.values()) void w.close()
    this.watchers.clear()
  }

  notifyChanged(): void {
    this.emit()
  }
}

export const library = new Library()
