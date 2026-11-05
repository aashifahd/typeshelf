import { create } from 'zustand'
import type {
  AppInfo,
  Category,
  Collection,
  FontUpdate,
  InstalledProviderFamily,
  LibrarySnapshot,
  ScanProgress,
  Script,
  Settings,
  ToastMessage
} from '@shared/types'
import { groupFamilies, type Family } from '@shared/families'

export type Nav =
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'installed' }
  | { kind: 'source'; id: string }
  | { kind: 'collection'; id: string }
  | { kind: 'catalog'; provider: 'google' | 'fontshare' }
  | { kind: 'updates' }
  | { kind: 'health' }
  | { kind: 'compare' }
  | { kind: 'settings' }

export type SortKey = 'name' | 'newest' | 'styles'

interface State {
  ready: boolean
  info: AppInfo | null
  library: LibrarySnapshot
  families: Family[]
  settings: Settings | null
  collections: Collection[]
  updates: FontUpdate[]
  installedProvider: InstalledProviderFamily[]
  progress: ScanProgress
  toasts: ToastMessage[]

  nav: Nav
  selectedFamily: string | null
  query: string
  categories: Category[]
  variableOnly: boolean
  monospaceOnly: boolean
  script: Script | ''
  sort: SortKey
  previewText: string
  previewSize: number
  compare: string[]

  setNav(n: Nav): void
  select(name: string | null): void
  set<K extends keyof State>(k: K, v: State[K]): void
  toggleCategory(c: Category): void
  toggleCompare(name: string): void
  toast(kind: ToastMessage['kind'], text: string): void
  dismissToast(id: string): void
  setLibrary(s: LibrarySnapshot): void
}

let toastId = 0

export const useStore = create<State>((set, get) => ({
  ready: false,
  info: null,
  library: { sources: [], faces: [], broken: [], activations: {}, externallyRegistered: [] },
  families: [],
  settings: null,
  collections: [],
  updates: [],
  installedProvider: [],
  progress: { phase: 'idle', done: 0, total: 0 },
  toasts: [],

  nav: { kind: 'all' },
  selectedFamily: null,
  query: '',
  categories: [],
  variableOnly: false,
  monospaceOnly: false,
  script: '',
  sort: 'name',
  previewText: '',
  previewSize: 40,
  compare: [],

  setNav: (nav) => set({ nav, selectedFamily: null }),
  select: (selectedFamily) => set({ selectedFamily }),
  set: (k, v) => set({ [k]: v } as Partial<State>),
  toggleCategory: (c) => {
    const cur = get().categories
    set({ categories: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] })
  },
  toggleCompare: (name) => {
    const cur = get().compare
    if (cur.includes(name)) set({ compare: cur.filter((x) => x !== name) })
    else if (cur.length >= 6) get().toast('info', 'You can compare up to 6 families')
    else set({ compare: [...cur, name] })
  },
  toast: (kind, text) => {
    const id = `r${++toastId}`
    set({ toasts: [...get().toasts, { id, kind, text }].slice(-4) })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setLibrary: (library) => set({ library, families: groupFamilies(library.faces) })
}))

export const api = (): typeof window.typeshelf => window.typeshelf

/** Run an API call and surface failures as toasts. */
export async function run<T>(p: Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await p
    if (success) useStore.getState().toast('success', success)
    return r
  } catch (e) {
    const msg = (e as Error).message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') ?? String(e)
    useStore.getState().toast('error', msg)
    return undefined
  }
}

export async function bootstrap(): Promise<void> {
  const a = api()
  const s = useStore.getState()
  const [info, library, settings, collections, updates, installedProvider] = await Promise.all([
    a.appInfo(),
    a.getLibrary(),
    a.getSettings(),
    a.getCollections(),
    a.getFontUpdates(),
    a.getInstalledProviderFamilies()
  ])
  s.setLibrary(library)
  useStore.setState({
    info,
    settings,
    collections,
    updates,
    installedProvider,
    previewText: settings.previewText,
    previewSize: settings.previewSize,
    ready: true
  })

  a.on('library:changed', (snap) => {
    useStore.getState().setLibrary(snap)
    void a.getInstalledProviderFamilies().then((installedProvider) => useStore.setState({ installedProvider }))
  })
  a.on('scan:progress', (progress) => useStore.setState({ progress }))
  a.on('updates:changed', (updates) => useStore.setState({ updates }))
  a.on('toast', (t) => useStore.getState().toast(t.kind, t.text))
}
