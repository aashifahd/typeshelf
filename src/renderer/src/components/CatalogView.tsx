import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CATEGORIES, type CatalogFamily, type Category, type ProviderId } from '@shared/types'
import { api, run, useStore } from '../store'
import { requestProviderPreview } from '../lib/fontLoader'
import { Menu, Spinner } from './common'
import { I } from './Icons'

const LABEL: Record<ProviderId, string> = { google: 'Google Fonts', fontshare: 'Fontshare' }
const BLURB: Record<ProviderId, string> = {
  google: 'Open-source families. Installed fonts update automatically when Google publishes a new version.',
  fontshare: 'Free fonts from Indian Type Foundry (free for personal and commercial use — check each license).'
}
const CAT_LABEL: Partial<Record<Category, string>> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  monospace: 'Mono',
  display: 'Display',
  handwriting: 'Handwriting'
}

type Sort = 'popular' | 'newest' | 'name'

function CatalogRow({
  fam,
  top,
  height,
  text,
  size,
  busy,
  onInstall
}: {
  fam: CatalogFamily
  top: number
  height: number
  text: string
  size: number
  busy: boolean
  onInstall: (variable?: boolean) => void
}): ReactElement {
  const installed = useStore((s) => s.installedProvider.find((i) => i.provider === fam.provider && i.key === fam.key))
  const update = useStore((s) => s.updates.find((u) => u.provider === fam.provider && u.key === fam.key))
  useEffect(() => requestProviderPreview(fam.provider, fam.key), [fam.provider, fam.key])
  const hasVariable = fam.axes.length > 0

  return (
    <div className="row" style={{ transform: `translateY(${top}px)`, height, cursor: 'default' }} role="listitem" aria-label={fam.name}>
      <div className="row-head">
        <span className="row-name">{fam.name}</span>
        <span className="row-meta">
          {fam.variants.length || 1} style{fam.variants.length === 1 ? '' : 's'}
          {fam.designers.length ? ` · ${fam.designers.slice(0, 2).join(', ')}` : ''}
        </span>
        {hasVariable && <span className="pill var">Variable</span>}
        {installed && <span className="pill ok">Installed · {installed.version}</span>}
        {update && <span className="pill warn">Update {update.toVersion}</span>}
        <div className="row-actions">
          {busy ? (
            <span className="btn sm ghost">
              <Spinner /> Installing…
            </span>
          ) : installed ? (
            <Menu trigger={<I.More />} label="Installed family actions">
              {(close) => (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      void run(api().setFamilyPinned(fam.provider, fam.key, !installed.pinned).then(refreshInstalled))
                    }}
                  >
                    <I.Pin /> {installed.pinned ? 'Resume auto-updates' : 'Pause auto-updates'}
                  </button>
                  <hr />
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      if (confirm(`Uninstall ${fam.name}? It will be deactivated and its files moved to the Recycle Bin.`))
                        void run(api().uninstallFamily(fam.provider, fam.key).then(refreshInstalled), `Uninstalled ${fam.name}`)
                    }}
                  >
                    <I.Trash /> Uninstall
                  </button>
                </>
              )}
            </Menu>
          ) : (
            <>
              <button type="button" className="btn sm primary" onClick={() => onInstall()}>
                <I.Download size={14} /> Install
              </button>
              {hasVariable && (
                <Menu trigger={<I.More />} label="Install options">
                  {(close) => (
                    <>
                      <button type="button" onClick={() => (close(), onInstall(true))}>
                        Install variable font
                      </button>
                      <button type="button" onClick={() => (close(), onInstall(false))}>
                        Install static styles
                      </button>
                    </>
                  )}
                </Menu>
              )}
            </>
          )}
        </div>
      </div>
      <div
        className="row-preview"
        style={{
          fontFamily: `"${fam.previewFamily}", var(--ui-font)`,
          fontWeight: fam.previewWeight,
          fontStyle: fam.previewItalic ? 'italic' : 'normal',
          fontSize: size
        }}
      >
        {text || fam.name}
      </div>
    </div>
  )
}

async function refreshInstalled(): Promise<void> {
  const installedProvider = await api().getInstalledProviderFamilies()
  useStore.setState({ installedProvider })
}

export function CatalogView({ provider }: { provider: ProviderId }): ReactElement {
  const [catalog, setCatalog] = useState<CatalogFamily[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const [variableOnly, setVariableOnly] = useState(false)
  const [onlyInstalled, setOnlyInstalled] = useState(false)
  const [sort, setSort] = useState<Sort>('popular')
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const previewText = useStore((s) => s.previewText)
  const size = useStore((s) => s.previewSize)
  const set = useStore((s) => s.set)
  const installed = useStore((s) => s.installedProvider)
  const parentRef = useRef<HTMLDivElement>(null)

  const load = (force = false): void => {
    setError(null)
    if (force) setCatalog(null)
    api()
      .getCatalog(provider, force)
      .then(setCatalog)
      .catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    setCatalog(null)
    load()
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (!catalog) return []
    const s = q.trim().toLowerCase()
    const inst = new Set(installed.filter((i) => i.provider === provider).map((i) => i.key))
    let l = catalog.filter(
      (f) =>
        (!cat || f.category === cat) &&
        (!variableOnly || f.axes.length > 0) &&
        (!onlyInstalled || inst.has(f.key)) &&
        (!s || f.name.toLowerCase().includes(s) || f.designers.some((d) => d.toLowerCase().includes(s)))
    )
    if (sort === 'popular') l = [...l].sort((a, b) => a.popularity - b.popularity)
    else if (sort === 'newest') l = [...l].sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
    else l = [...l].sort((a, b) => a.name.localeCompare(b.name))
    return l
  }, [catalog, q, cat, variableOnly, onlyInstalled, sort, installed, provider])

  const rowHeight = Math.round(Math.max(90, size * 1.3 + 58))
  const virtualizer = useVirtualizer({
    count: list.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4
  })

  const install = async (fam: CatalogFamily, variable?: boolean): Promise<void> => {
    setBusy((b) => new Set(b).add(fam.key))
    await run(api().installFamily(provider, fam.key, { variable, activate: true }))
    await refreshInstalled()
    setBusy((b) => {
      const n = new Set(b)
      n.delete(fam.key)
      return n
    })
  }

  return (
    <>
      <div className="toolbar">
        <h1>
          {LABEL[provider]}
          <small>{catalog ? `${list.length.toLocaleString()} of ${catalog.length.toLocaleString()} families` : ''}</small>
        </h1>
        <input className="field" style={{ width: 220 }} placeholder="Search families or designers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalog" />
        <input className="preview-input" placeholder="Type to preview…" value={previewText} onChange={(e) => set('previewText', e.target.value)} aria-label="Preview text" />
        <div className="size-control">
          <input type="range" min={12} max={120} value={size} onChange={(e) => set('previewSize', +e.target.value)} aria-label="Preview size" />
          {size}px
        </div>
        <button type="button" className="icon-btn" title="Refresh catalog" aria-label="Refresh catalog" onClick={() => load(true)}>
          <I.Refresh />
        </button>
      </div>
      <div className="chips">
        <span className="muted" style={{ marginRight: 6 }}>
          {BLURB[provider]}
        </span>
      </div>
      <div className="chips">
        {CATEGORIES.filter((c) => CAT_LABEL[c]).map((c) => (
          <button key={c} type="button" className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(cat === c ? '' : c)}>
            {CAT_LABEL[c]}
          </button>
        ))}
        <button type="button" className={`chip ${variableOnly ? 'on' : ''}`} onClick={() => setVariableOnly(!variableOnly)}>
          Variable
        </button>
        <button type="button" className={`chip ${onlyInstalled ? 'on' : ''}`} onClick={() => setOnlyInstalled(!onlyInstalled)}>
          Installed
        </button>
        <span style={{ flex: 1 }} />
        <select className="select" style={{ height: 26, fontSize: 12 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="popular">Popular</option>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>
      {error ? (
        <div className="empty">
          <h3>Couldn't load {LABEL[provider]}</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => load(true)}>
            Try again
          </button>
        </div>
      ) : !catalog ? (
        <div className="empty">
          <Spinner />
          <p>Loading catalog…</p>
        </div>
      ) : (
        <div className="list" ref={parentRef} role="list">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const fam = list[v.index]
              return (
                <CatalogRow
                  key={fam.key}
                  fam={fam}
                  top={v.start}
                  height={rowHeight}
                  text={previewText}
                  size={size}
                  busy={busy.has(fam.key)}
                  onInstall={(variable) => void install(fam, variable)}
                />
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
