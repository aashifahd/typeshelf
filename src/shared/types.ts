// Shared contract between the main process, preload and renderer.

export type SourceKind = 'system' | 'user' | 'folder' | 'google' | 'fontshare'
export type ProviderId = 'google' | 'fontshare'

export type Category =
  | 'sans-serif'
  | 'serif'
  | 'monospace'
  | 'display'
  | 'handwriting'
  | 'symbol'
  | 'other'

export const CATEGORIES: Category[] = [
  'sans-serif',
  'serif',
  'monospace',
  'display',
  'handwriting',
  'symbol',
  'other'
]

export const SCRIPTS = [
  'latin',
  'latin-ext',
  'cyrillic',
  'greek',
  'arabic',
  'hebrew',
  'devanagari',
  'tamil',
  'sinhala',
  'thai',
  'cjk',
  'japanese',
  'korean'
] as const
export type Script = (typeof SCRIPTS)[number]

export interface Source {
  id: string
  kind: SourceKind
  name: string
  path: string
  /** Fonts in read-only sources are already installed in the OS and cannot be toggled. */
  readonly: boolean
  /** Watch for file changes (added / removed / modified fonts). */
  watch: boolean
}

export interface Axis {
  tag: string
  name: string
  min: number
  default: number
  max: number
}

export interface FaceInfo {
  id: string
  sourceId: string
  path: string
  /** Index inside a TrueType/OpenType collection (0 for single fonts). */
  index: number
  format: 'ttf' | 'otf' | 'ttc' | 'otc' | 'woff' | 'woff2'
  family: string
  style: string
  fullName: string
  postscriptName: string
  weight: number
  width: number
  italic: boolean
  monospace: boolean
  category: Category
  variable: boolean
  axes: Axis[]
  instances: string[]
  features: string[]
  scripts: Script[]
  version: string
  designer?: string
  designerUrl?: string
  manufacturer?: string
  vendorUrl?: string
  license?: string
  licenseUrl?: string
  copyright?: string
  description?: string
  glyphCount: number
  unitsPerEm: number
  size: number
  mtime: number
}

export interface BrokenFont {
  path: string
  sourceId: string
  error: string
}

export type ActivationMode = 'permanent' | 'session'

export interface ActivationRecord {
  path: string
  mode: ActivationMode
  /** Registry value name for permanent activations (Windows). */
  regName?: string
  activatedAt: number
}

export interface Collection {
  id: string
  name: string
  color: string
  /** Family names. */
  families: string[]
  createdAt: number
}

export interface InstalledProviderFamily {
  provider: ProviderId
  /** Provider family key (Google family name, Fontshare slug). */
  key: string
  name: string
  version: string
  dir: string
  files: string[]
  variable: boolean
  installedAt: number
  updatedAt?: number
  /** Opt this family out of automatic updates. */
  pinned?: boolean
  previousVersion?: string
}

export interface CatalogFamily {
  provider: ProviderId
  key: string
  name: string
  category: Category
  designers: string[]
  version: string
  variants: string[]
  axes: Axis[]
  subsets: string[]
  popularity: number
  dateAdded?: string
  /** CSS font-family name used by the provider preview stylesheet. */
  previewFamily: string
  previewWeight: number
  previewItalic: boolean
}

export interface FontUpdate {
  provider: ProviderId
  key: string
  name: string
  fromVersion: string
  toVersion: string
  status: 'available' | 'installing' | 'installed' | 'failed'
  error?: string
  checkedAt: number
}

export type Theme = 'system' | 'dark' | 'light'

export interface Settings {
  theme: Theme
  previewText: string
  previewSize: number
  activationMode: ActivationMode
  autoCheckUpdates: boolean
  autoInstallUpdates: boolean
  updateCheckHours: number
  preferVariable: boolean
  launchAtLogin: boolean
  minimizeToTray: boolean
  startMinimized: boolean
  hotReloadActiveFonts: boolean
  managedFontsDir: string
  lastUpdateCheck?: number
}

export interface LibrarySnapshot {
  sources: Source[]
  faces: FaceInfo[]
  broken: BrokenFont[]
  activations: Record<string, ActivationRecord>
  /** Lower-cased paths registered in Windows by other apps (e.g. installed manually). */
  externallyRegistered: string[]
}

export interface ScanProgress {
  phase: 'idle' | 'discovering' | 'parsing' | 'done'
  done: number
  total: number
  current?: string
}

export interface GlyphInfo {
  cp: number
  name: string
}

export interface ToastMessage {
  id: string
  kind: 'info' | 'success' | 'error'
  text: string
}

export interface AppInfo {
  version: string
  platform: string
  /** os.release(), e.g. "10.0.26100" */
  osRelease: string
  userData: string
  activationSupported: boolean
}

export interface ActivationResult {
  activated: number
  deactivated: number
  skipped: { path: string; reason: string }[]
}

/** Everything the renderer can call. Implemented in main/ipc.ts, exposed by preload. */
export interface TypeshelfApi {
  appInfo(): Promise<AppInfo>
  getLibrary(): Promise<LibrarySnapshot>
  rescan(): Promise<void>
  addFolder(): Promise<Source | null>
  removeSource(id: string): Promise<void>
  activate(faceIds: string[], mode?: ActivationMode): Promise<ActivationResult>
  deactivate(faceIds: string[]): Promise<ActivationResult>
  getGlyphs(faceId: string): Promise<GlyphInfo[]>
  revealFile(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  /** Opens the folder that holds main.log, for attaching to bug reports. */
  openLogFolder(): Promise<void>
  exportFaces(faceIds: string[]): Promise<number>
  importFiles(): Promise<number>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>

  getCollections(): Promise<Collection[]>
  saveCollection(c: Collection): Promise<Collection[]>
  deleteCollection(id: string): Promise<Collection[]>

  getCatalog(provider: ProviderId, force?: boolean): Promise<CatalogFamily[]>
  /** Fetches provider @font-face CSS for previews (URLs rewritten to https). */
  getPreviewCss(provider: ProviderId, keys: string[]): Promise<string>
  getInstalledProviderFamilies(): Promise<InstalledProviderFamily[]>
  installFamily(provider: ProviderId, key: string, opts?: { variable?: boolean; activate?: boolean }): Promise<InstalledProviderFamily>
  uninstallFamily(provider: ProviderId, key: string): Promise<void>
  setFamilyPinned(provider: ProviderId, key: string, pinned: boolean): Promise<void>

  checkFontUpdates(): Promise<FontUpdate[]>
  getFontUpdates(): Promise<FontUpdate[]>
  applyFontUpdates(keys?: string[]): Promise<FontUpdate[]>
  rollbackFamily(provider: ProviderId, key: string): Promise<void>

  checkAppUpdate(): Promise<{ available: boolean; version?: string; message?: string }>
  getAppUpdateState(): Promise<AppUpdateState>
  /** Quits, installs the downloaded update and restarts. */
  installAppUpdate(): Promise<void>

  on<E extends keyof TypeshelfEvents>(event: E, cb: (payload: TypeshelfEvents[E]) => void): () => void
}

export interface TypeshelfEvents {
  'library:changed': LibrarySnapshot
  'scan:progress': ScanProgress
  'updates:changed': FontUpdate[]
  'toast': ToastMessage
  'install:progress': { provider: ProviderId; key: string; done: number; total: number }
  'appUpdate:changed': AppUpdateState
}

/** Self-update of the Typeshelf app itself (not fonts). */
export interface AppUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

export const IPC_EVENTS: (keyof TypeshelfEvents)[] = [
  'library:changed',
  'scan:progress',
  'updates:changed',
  'toast',
  'install:progress',
  'appUpdate:changed'
]
