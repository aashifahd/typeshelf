import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  ActivationMode,
  Collection,
  ProviderId,
  Settings,
  TypeshelfApi,
  TypeshelfEvents
} from '@shared/types'
import { library } from './library'
import { activation, activationSupported } from './activation'
import { activateFaces, deactivateFaces } from './ops'
import { scanPool } from './scanner/pool'
import { collectionsStore, settingsStore } from './state'
import { isFontFile } from './scanner/parse'
import * as updates from './fontUpdates'
import { providerStore } from './state'
import { checkAppUpdate } from './appUpdater'
import { applySettingsSideEffects } from './settingsEffects'
import log from './log'

type Handlers = Omit<TypeshelfApi, 'on'>

const PROVIDERS: ProviderId[] = ['google', 'fontshare']

function assertProvider(p: unknown): asserts p is ProviderId {
  if (!PROVIDERS.includes(p as ProviderId)) throw new Error('Unknown provider')
}
function assertIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw new Error('Invalid ids')
}
function assertMode(m: unknown): asserts m is ActivationMode | undefined {
  if (m !== undefined && m !== 'permanent' && m !== 'session') throw new Error('Invalid mode')
}

export function send<E extends keyof TypeshelfEvents>(event: E, payload: TypeshelfEvents[E]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(`ts:event:${event}`, payload)
  }
}

let toastSeq = 0
export function toast(kind: 'info' | 'success' | 'error', text: string): void {
  send('toast', { id: `t${++toastSeq}`, kind, text })
}

const SETTING_KEYS: (keyof Settings)[] = [
  'theme',
  'previewText',
  'previewSize',
  'activationMode',
  'autoCheckUpdates',
  'autoInstallUpdates',
  'updateCheckHours',
  'preferVariable',
  'launchAtLogin',
  'minimizeToTray',
  'startMinimized',
  'hotReloadActiveFonts'
]

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const handlers: Handlers = {
    appInfo: async () => ({
      version: app.getVersion(),
      platform: process.platform,
      userData: app.getPath('userData'),
      activationSupported
    }),
    getLibrary: async () => library.snapshot(),
    rescan: () => library.scan(),
    addFolder: async () => {
      const win = getWindow()
      const r = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'], title: 'Add font folder' })
        : await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
      if (r.canceled || !r.filePaths.length) return null
      let last = null
      for (const p of r.filePaths) last = library.addFolder(p)
      return last
    },
    removeSource: async (id) => library.removeSource(String(id)),
    activate: async (ids, mode) => {
      assertIds(ids)
      assertMode(mode)
      const r = activateFaces(library.faces(ids), mode)
      library.notifyChanged()
      return r
    },
    deactivate: async (ids) => {
      assertIds(ids)
      const r = deactivateFaces(library.faces(ids))
      library.notifyChanged()
      return r
    },
    getGlyphs: async (id) => {
      const f = library.face(String(id))
      if (!f) throw new Error('Font not found')
      return scanPool.glyphs(f.path, f.index)
    },
    revealFile: async (path) => {
      // Only reveal files we know about.
      const known = library.snapshot().faces.some((f) => f.path === path) || library.sources().some((s) => s.path === path)
      if (known && existsSync(path)) shell.showItemInFolder(path)
    },
    openExternal: async (url) => {
      const u = new URL(String(url))
      if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') await shell.openExternal(u.toString())
    },
    exportFaces: async (ids) => {
      assertIds(ids)
      const win = getWindow()
      const opts = { properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[], title: 'Export fonts to…' }
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (r.canceled || !r.filePaths[0]) return 0
      const paths = [...new Set(library.faces(ids).map((f) => f.path))]
      await mkdir(r.filePaths[0], { recursive: true })
      for (const p of paths) await copyFile(p, join(r.filePaths[0], basename(p)))
      shell.openPath(r.filePaths[0])
      return paths.length
    },
    importFiles: async () => {
      const win = getWindow()
      const opts = {
        properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc', 'otc', 'woff', 'woff2'] }]
      }
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (r.canceled) return 0
      const dest = join(settingsStore.get().managedFontsDir, 'imported')
      await mkdir(dest, { recursive: true })
      let n = 0
      for (const p of r.filePaths.filter(isFontFile)) {
        await copyFile(p, join(dest, basename(p)))
        n++
      }
      library.addFolder(dest)
      await library.scan()
      return n
    },

    getSettings: async () => settingsStore.get(),
    setSettings: async (patch) => {
      const clean: Partial<Settings> = {}
      for (const k of SETTING_KEYS) {
        if (patch && k in patch) (clean as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k]
      }
      if (clean.updateCheckHours !== undefined) clean.updateCheckHours = Math.min(168, Math.max(1, Number(clean.updateCheckHours) || 6))
      if (clean.previewSize !== undefined) clean.previewSize = Math.min(300, Math.max(8, Number(clean.previewSize) || 40))
      const next = settingsStore.update((s) => Object.assign(s, clean))
      applySettingsSideEffects(clean)
      return next
    },

    getCollections: async () => collectionsStore.get().collections,
    saveCollection: async (c: Collection) => {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !Array.isArray(c.families)) throw new Error('Invalid collection')
      const clean: Collection = {
        id: c.id,
        name: c.name.slice(0, 80) || 'Untitled',
        color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#7c8cff',
        families: [...new Set(c.families.map(String))],
        createdAt: Number(c.createdAt) || Date.now()
      }
      collectionsStore.update((s) => {
        const i = s.collections.findIndex((x) => x.id === clean.id)
        if (i >= 0) s.collections[i] = clean
        else s.collections.push(clean)
      })
      return collectionsStore.get().collections
    },
    deleteCollection: async (id) => {
      if (id === 'favorites') throw new Error('Favorites cannot be deleted')
      collectionsStore.update((s) => {
        s.collections = s.collections.filter((c) => c.id !== id)
      })
      return collectionsStore.get().collections
    },

    getCatalog: async (provider, force) => {
      assertProvider(provider)
      return updates.providers[provider].catalog(Boolean(force))
    },
    getPreviewCss: async (provider, keys) => {
      assertProvider(provider)
      assertIds(keys)
      const catalog = await updates.providers[provider].catalog()
      const set = new Set(keys.slice(0, 60))
      return updates.providers[provider].previewCss(catalog.filter((c) => set.has(c.key)))
    },
    getInstalledProviderFamilies: async () => updates.installed(),
    installFamily: async (provider, key, opts) => {
      assertProvider(provider)
      const rec = await updates.installFamily(provider, String(key), {
        variable: opts?.variable,
        activate: opts?.activate
      })
      toast('success', `Installed ${rec.name}`)
      return rec
    },
    uninstallFamily: async (provider, key) => {
      assertProvider(provider)
      await updates.uninstallFamily(provider, String(key))
    },
    setFamilyPinned: async (provider, key, pinned) => {
      assertProvider(provider)
      updates.setPinned(provider, String(key), Boolean(pinned))
    },
    checkFontUpdates: () => updates.checkForUpdates(),
    getFontUpdates: async () => providerStore.get().updates,
    applyFontUpdates: (keys) => updates.applyUpdates(keys),
    rollbackFamily: async (provider, key) => {
      assertProvider(provider)
      await updates.rollback(provider, String(key))
    },
    checkAppUpdate: () => checkAppUpdate()
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`ts:${name}`, async (_e, ...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args)
      } catch (e) {
        log.error(`ipc ${name} failed`, e)
        throw e
      }
    })
  }

  // keep reference used by tray/menu
  void activation
}
