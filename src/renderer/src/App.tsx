import { Component, useEffect, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { FamilyList } from './components/FamilyList'
import { FamilyDetail } from './components/FamilyDetail'
import { CatalogView } from './components/CatalogView'
import { CompareView, HealthView, SettingsView, UpdatesView } from './components/Pages'
import { I } from './components/Icons'

function useTheme(): void {
  const theme = useStore((s) => s.settings?.theme ?? 'system')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function ScanStatus(): ReactElement | null {
  const p = useStore((s) => s.progress)
  if (p.phase !== 'parsing' && p.phase !== 'discovering') return null
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
  return (
    <div className="scan-status" aria-live="polite">
      <span>{p.phase === 'discovering' ? 'Finding fonts…' : `Indexing ${p.done.toLocaleString()} / ${p.total.toLocaleString()}`}</span>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Toasts(): ReactElement {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

function CompareTray(): ReactElement | null {
  const compare = useStore((s) => s.compare)
  const nav = useStore((s) => s.nav)
  const setNav = useStore((s) => s.setNav)
  if (!compare.length || nav.kind === 'compare') return null
  return (
    <div className="compare-tray">
      <I.Columns />
      <span className="names">{compare.join(' · ')}</span>
      <button type="button" className="btn sm primary" onClick={() => setNav({ kind: 'compare' })}>
        Compare {compare.length}
      </button>
      <button type="button" className="icon-btn" aria-label="Clear compare" onClick={() => useStore.setState({ compare: [] })}>
        <I.Close />
      </button>
    </div>
  )
}

function Main(): ReactElement {
  const nav = useStore((s) => s.nav)
  const selected = useStore((s) => s.selectedFamily)
  const family = useStore((s) => (s.selectedFamily ? s.families.find((f) => f.name === s.selectedFamily) : undefined))

  let content: ReactElement
  if (nav.kind === 'catalog') content = <CatalogView provider={nav.provider} />
  else if (nav.kind === 'updates') content = <UpdatesView />
  else if (nav.kind === 'health') content = <HealthView />
  else if (nav.kind === 'settings') content = <SettingsView />
  else if (nav.kind === 'compare') content = <CompareView />
  else if (selected && family) content = <FamilyDetail family={family} />
  else content = <FamilyList />

  return (
    <main className="main">
      {content}
      <CompareTray />
    </main>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty">
        <h3>Something went wrong</h3>
        <p className="mono">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}

export function App(): ReactElement {
  useTheme()
  const ready = useStore((s) => s.ready)
  const query = useStore((s) => s.query)
  const set = useStore((s) => s.set)
  const nav = useStore((s) => s.nav)
  const setNav = useStore((s) => s.setNav)

  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">T</span> Typeshelf
        </div>
        <div className="search">
          <I.Search size={14} />
          <input
            id="global-search"
            placeholder="Search fonts, designers, foundries…  (Ctrl+F)"
            aria-label="Search fonts"
            value={query}
            onChange={(e) => {
              set('query', e.target.value)
              if (!['all', 'active', 'installed', 'source', 'collection'].includes(nav.kind)) setNav({ kind: 'all' })
              useStore.getState().select(null)
            }}
          />
        </div>
        <ScanStatus />
      </header>
      <Sidebar />
      <ErrorBoundary>{ready ? <Main /> : <div className="empty">Loading…</div>}</ErrorBoundary>
      <Toasts />
    </div>
  )
}
