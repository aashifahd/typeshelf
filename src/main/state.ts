import { app } from 'electron'
import { join } from 'node:path'
import { JsonStore } from './store'
import type {
  ActivationRecord,
  BrokenFont,
  Collection,
  FaceInfo,
  FontUpdate,
  InstalledProviderFamily,
  Settings,
  Source
} from '@shared/types'

export const DEFAULT_PREVIEW = 'The quick brown fox jumps over the lazy dog'

export const settingsStore = new JsonStore<Settings>('settings', {
  theme: 'system',
  previewText: DEFAULT_PREVIEW,
  previewSize: 40,
  activationMode: 'permanent',
  autoCheckUpdates: true,
  autoInstallUpdates: true,
  updateCheckHours: 6,
  preferVariable: true,
  launchAtLogin: false,
  minimizeToTray: true,
  startMinimized: false,
  hotReloadActiveFonts: true,
  managedFontsDir: join(app.getPath('userData'), 'fonts')
})

export interface LibraryState {
  version: number
  sources: Source[]
  faces: FaceInfo[]
  broken: BrokenFont[]
}

export const LIBRARY_VERSION = 1

export const libraryStore = new JsonStore<LibraryState>('library', {
  version: LIBRARY_VERSION,
  sources: [],
  faces: [],
  broken: []
})

export const activationStore = new JsonStore<{ records: Record<string, ActivationRecord> }>('activations', {
  records: {}
})

export const collectionsStore = new JsonStore<{ collections: Collection[] }>('collections', {
  collections: [
    { id: 'favorites', name: 'Favorites', color: '#f5b83d', families: [], createdAt: Date.now() }
  ]
})

export const providerStore = new JsonStore<{
  installed: InstalledProviderFamily[]
  updates: FontUpdate[]
}>('providers', { installed: [], updates: [] })

export function flushAll(): void {
  for (const s of [settingsStore, libraryStore, activationStore, collectionsStore, providerStore]) s.flush()
}
