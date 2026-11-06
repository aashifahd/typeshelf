// In-memory implementation of the Typeshelf API so the UI can be previewed in a
// normal browser (`npm run dev:web`). Never used inside Electron.
import type {
  ActivationResult,
  CatalogFamily,
  Collection,
  FaceInfo,
  FontUpdate,
  InstalledProviderFamily,
  LibrarySnapshot,
  Settings,
  TypeshelfApi,
  TypeshelfEvents
} from '@shared/types'

type Spec = [family: string, style: string, weight: number, italic: boolean, cat: FaceInfo['category'], source: string, extra?: Partial<FaceInfo>]

const SPECS: Spec[] = [
  ['Segoe UI', 'Regular', 400, false, 'sans-serif', 'system'],
  ['Segoe UI', 'Light', 300, false, 'sans-serif', 'system'],
  ['Segoe UI', 'Semibold', 600, false, 'sans-serif', 'system'],
  ['Segoe UI', 'Bold', 700, false, 'sans-serif', 'system'],
  ['Segoe UI', 'Italic', 400, true, 'sans-serif', 'system'],
  ['Georgia', 'Regular', 400, false, 'serif', 'system'],
  ['Georgia', 'Bold', 700, false, 'serif', 'system'],
  ['Times New Roman', 'Regular', 400, false, 'serif', 'system'],
  ['Consolas', 'Regular', 400, false, 'monospace', 'system', { monospace: true }],
  ['Courier New', 'Regular', 400, false, 'monospace', 'system', { monospace: true }],
  ['Verdana', 'Regular', 400, false, 'sans-serif', 'system'],
  ['Trebuchet MS', 'Regular', 400, false, 'sans-serif', 'system'],
  ['Impact', 'Regular', 400, false, 'display', 'system'],
  ['Segoe Script', 'Regular', 400, false, 'handwriting', 'system'],
  ['Segoe Print', 'Regular', 400, false, 'handwriting', 'system'],
  ['Palatino Linotype', 'Regular', 400, false, 'serif', 'system'],
  ['Calibri', 'Regular', 400, false, 'sans-serif', 'f-brand'],
  ['Calibri', 'Bold', 700, false, 'sans-serif', 'f-brand'],
  ['Calibri', 'Italic', 400, true, 'sans-serif', 'f-brand'],
  ['Cambria', 'Regular', 400, false, 'serif', 'f-brand'],
  ['Candara', 'Regular', 400, false, 'sans-serif', 'f-brand'],
  ['Corbel', 'Regular', 400, false, 'sans-serif', 'f-brand'],
  ['Constantia', 'Regular', 400, false, 'serif', 'f-brand'],
  ['Gabriola', 'Regular', 400, false, 'display', 'f-brand'],
  ['Ink Free', 'Regular', 400, false, 'handwriting', 'f-brand'],
  [
    'Bahnschrift',
    'Regular',
    400,
    false,
    'sans-serif',
    'f-clients',
    {
      variable: true,
      axes: [
        { tag: 'wght', name: 'Weight', min: 300, default: 400, max: 700 },
        { tag: 'wdth', name: 'Width', min: 75, default: 100, max: 100 }
      ],
      instances: ['Light', 'Regular', 'SemiBold', 'Bold', 'Condensed']
    }
  ],
  [
    'Cascadia Code',
    'Regular',
    400,
    false,
    'monospace',
    'f-clients',
    { monospace: true, variable: true, axes: [{ tag: 'wght', name: 'Weight', min: 200, default: 400, max: 700 }], features: ['calt', 'liga', 'ss01', 'ss02', 'ss19', 'ss20', 'zero', 'onum'] }
  ],
  ['Lucida Console', 'Regular', 400, false, 'monospace', 'f-clients', { monospace: true }],
  ['Sitka Text', 'Regular', 400, false, 'serif', 'f-clients'],
  ['Comic Sans MS', 'Regular', 400, false, 'handwriting', 'f-clients']
]

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0') + ((h * 31) >>> 0).toString(16).padStart(8, '0')
}

function makeFaces(): FaceInfo[] {
  return SPECS.map(([family, style, weight, italic, category, sourceId, extra]) => {
    const fullName = style === 'Regular' ? family : `${family} ${style}`
    const folder = sourceId === 'system' ? 'C:\\Windows\\Fonts' : sourceId === 'f-brand' ? 'D:\\Design\\Brand Fonts' : 'D:\\Design\\Client Work'
    const path = `${folder}\\${fullName.replace(/\s+/g, '')}.ttf`
    return {
      id: hash(path).slice(0, 16),
      sourceId,
      path,
      index: 0,
      format: 'ttf',
      family,
      style,
      fullName,
      postscriptName: fullName.replace(/\s+/g, ''),
      weight,
      width: 5,
      italic,
      monospace: false,
      category,
      variable: false,
      axes: [],
      instances: [],
      features: ['kern', 'liga', 'onum', 'lnum', 'tnum', 'frac', 'smcp'],
      scripts: ['latin', 'latin-ext', 'cyrillic', 'greek'],
      version: '7.01',
      designer: 'Sample Designer',
      manufacturer: 'Sample Foundry',
      license: 'Sample license text for preview mode.',
      glyphCount: 1200,
      unitsPerEm: 2048,
      size: 120000 + weight * 100,
      mtime: 1700000000000 + weight,
      ...extra
    } as FaceInfo
  })
}

const GOOGLE: [string, FaceInfo['category'], boolean][] = [
  ['Inter', 'sans-serif', true],
  ['Roboto', 'sans-serif', true],
  ['Poppins', 'sans-serif', false],
  ['Playfair Display', 'serif', true],
  ['Lora', 'serif', true],
  ['JetBrains Mono', 'monospace', true],
  ['Caveat', 'handwriting', true],
  ['Bebas Neue', 'display', false],
  ['Noto Sans Sinhala', 'sans-serif', true],
  ['DM Serif Display', 'serif', false]
]

export function installMock(): void {
  ;(window as unknown as { __TYPESHELF_MOCK__: boolean }).__TYPESHELF_MOCK__ = true
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const emit = <E extends keyof TypeshelfEvents>(e: E, p: TypeshelfEvents[E]): void => listeners.get(e)?.forEach((cb) => cb(p))

  const faces = makeFaces()
  const lib: LibrarySnapshot = {
    sources: [
      { id: 'system', kind: 'system', name: 'Windows fonts', path: 'C:\\Windows\\Fonts', readonly: true, watch: false },
      { id: 'google', kind: 'google', name: 'Google Fonts', path: 'C:\\Typeshelf\\fonts\\google', readonly: false, watch: true },
      { id: 'f-brand', kind: 'folder', name: 'Brand Fonts', path: 'D:\\Design\\Brand Fonts', readonly: false, watch: true },
      { id: 'f-clients', kind: 'folder', name: 'Client Work', path: 'D:\\Design\\Client Work', readonly: false, watch: true }
    ],
    faces,
    broken: [{ path: 'D:\\Design\\Client Work\\corrupted-font.otf', sourceId: 'f-clients', error: 'Unknown font format' }],
    activations: {},
    externallyRegistered: []
  }
  // Pre-activate a couple so the UI shows mixed state.
  for (const f of faces.filter((x) => x.family === 'Calibri' && x.style !== 'Italic')) {
    lib.activations[f.path.toLowerCase()] = { path: f.path, mode: 'permanent', activatedAt: Date.now() }
  }

  let settings: Settings = {
    theme: 'system',
    previewText: 'The quick brown fox jumps over the lazy dog',
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
    managedFontsDir: 'C:\\Typeshelf\\fonts',
    lastUpdateCheck: Date.now() - 3600 * 1000
  }
  let collections: Collection[] = [
    { id: 'favorites', name: 'Favorites', color: '#f5b83d', families: ['Georgia', 'Bahnschrift'], createdAt: Date.now() },
    { id: 'c-acme', name: 'Acme rebrand', color: '#3fb6ff', families: ['Calibri', 'Cambria'], createdAt: Date.now() }
  ]
  const installed: InstalledProviderFamily[] = [
    { provider: 'google', key: 'Inter', name: 'Inter', version: '2025-03-01', dir: '', files: [], variable: true, installedAt: Date.now() - 86400e3 * 30 },
    { provider: 'google', key: 'Lora', name: 'Lora', version: '2025-09-01', dir: '', files: [], variable: true, installedAt: Date.now() - 86400e3 * 3, previousVersion: '2024-11-02', updatedAt: Date.now() - 86400e3 }
  ]
  let updates: FontUpdate[] = [
    { provider: 'google', key: 'Inter', name: 'Inter', fromVersion: '2025-03-01', toVersion: '2025-09-10', status: 'available', checkedAt: Date.now() }
  ]
  const catalog: CatalogFamily[] = GOOGLE.map(([name, category, variable], i) => ({
    provider: 'google',
    key: name,
    name,
    category,
    designers: ['Various'],
    version: '2025-09-10',
    variants: ['400', '700'],
    axes: variable ? [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }] : [],
    subsets: ['latin'],
    popularity: i + 1,
    dateAdded: `2020-0${(i % 9) + 1}-01`,
    previewFamily: name,
    previewWeight: 400,
    previewItalic: false
  }))

  const toggle = (ids: string[], on: boolean): ActivationResult => {
    const r: ActivationResult = { activated: 0, deactivated: 0, skipped: [] }
    for (const f of faces.filter((x) => ids.includes(x.id))) {
      if (lib.sources.find((s) => s.id === f.sourceId)?.readonly) continue
      const k = f.path.toLowerCase()
      if (on && !lib.activations[k]) {
        lib.activations[k] = { path: f.path, mode: settings.activationMode, activatedAt: Date.now() }
        r.activated++
      } else if (!on && lib.activations[k]) {
        delete lib.activations[k]
        r.deactivated++
      }
    }
    lib.activations = { ...lib.activations }
    setTimeout(() => emit('library:changed', { ...lib }), 0)
    return r
  }

  const api: TypeshelfApi = {
    appInfo: async () => ({
      version: '1.0.0-preview',
      platform: 'browser',
      osRelease: '10.0.26100',
      userData: '(browser preview)',
      activationSupported: false
    }),
    getLibrary: async () => ({ ...lib }),
    rescan: async () => {
      for (let i = 0; i <= 10; i++) {
        setTimeout(() => emit('scan:progress', { phase: i === 10 ? 'done' : 'parsing', done: i * 30, total: 300 }), i * 120)
      }
    },
    addFolder: async () => null,
    removeSource: async () => undefined,
    activate: async (ids) => toggle(ids, true),
    deactivate: async (ids) => toggle(ids, false),
    getGlyphs: async () => {
      const g = []
      for (let cp = 0x21; cp < 0x250; cp++) if (cp < 0x7f || cp > 0xa0) g.push({ cp, name: `uni${cp.toString(16).toUpperCase().padStart(4, '0')}` })
      return g
    },
    revealFile: async () => undefined,
    openExternal: async (u) => void window.open(u, '_blank'),
    openLogFolder: async () => undefined,
    exportFaces: async (ids) => ids.length,
    importFiles: async () => 0,
    getSettings: async () => settings,
    setSettings: async (p) => (settings = { ...settings, ...p }),
    getCollections: async () => collections,
    saveCollection: async (c) => {
      collections = collections.some((x) => x.id === c.id) ? collections.map((x) => (x.id === c.id ? c : x)) : [...collections, c]
      return collections
    },
    deleteCollection: async (id) => (collections = collections.filter((c) => c.id !== id)),
    getCatalog: async (provider) => (provider === 'google' ? catalog : []),
    getPreviewCss: async (_p, keys) =>
      keys.map((k) => `@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(k).replace(/%20/g, '+')}&display=swap");`).join('\n'),
    getInstalledProviderFamilies: async () => installed,
    installFamily: async (_p, key) => {
      await new Promise((r) => setTimeout(r, 900))
      const rec: InstalledProviderFamily = { provider: 'google', key, name: key, version: '2025-09-10', dir: '', files: [], variable: true, installedAt: Date.now() }
      installed.push(rec)
      return rec
    },
    uninstallFamily: async (_p, key) => void installed.splice(installed.findIndex((i) => i.key === key), 1),
    setFamilyPinned: async (_p, key, pinned) => {
      const i = installed.find((x) => x.key === key)
      if (i) i.pinned = pinned
    },
    checkFontUpdates: async () => updates,
    getFontUpdates: async () => updates,
    applyFontUpdates: async () => {
      const done = updates
      updates = []
      const inter = installed.find((i) => i.key === 'Inter')
      if (inter) Object.assign(inter, { previousVersion: inter.version, version: '2025-09-10', updatedAt: Date.now() })
      emit('updates:changed', updates)
      return done
    },
    rollbackFamily: async () => undefined,
    checkAppUpdate: async () => ({ available: false, message: 'Updates are disabled in browser preview' }),
    getAppUpdateState: async () => ({ status: 'idle' }),
    installAppUpdate: async () => undefined,
    on: (event, cb) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(cb as (p: unknown) => void)
      return () => listeners.get(event)?.delete(cb as (p: unknown) => void)
    }
  }
  window.typeshelf = api
}
