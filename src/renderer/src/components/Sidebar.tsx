import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { api, run, useStore, type Nav } from '../store'
import { useDerived } from '../lib/derived'
import { saveCollection } from '../lib/actions'
import { I } from './Icons'
import { COLLECTION_COLORS, Modal } from './common'

function same(a: Nav, b: Nav): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function Item({
  nav,
  icon,
  label,
  count,
  badge,
  extra
}: {
  nav: Nav
  icon: ReactNode
  label: string
  count?: number
  badge?: number
  extra?: ReactNode
}): ReactElement {
  const current = useStore((s) => s.nav)
  const setNav = useStore((s) => s.setNav)
  return (
    <button type="button" className={`nav-item ${same(current, nav) ? 'active' : ''}`} onClick={() => setNav(nav)}>
      {icon}
      <span className="label">{label}</span>
      {extra}
      {badge ? <span className="badge">{badge}</span> : count !== undefined ? <span className="count">{count}</span> : null}
    </button>
  )
}

export function Sidebar(): ReactElement {
  const families = useStore((s) => s.families)
  const library = useStore((s) => s.library)
  const collections = useStore((s) => s.collections)
  const updates = useStore((s) => s.updates)
  const compare = useStore((s) => s.compare)
  const d = useDerived()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLLECTION_COLORS[1])

  const counts = useMemo(() => {
    const bySource = new Map<string, Set<string>>()
    let active = 0
    let installed = 0
    for (const f of families) {
      const st = d.stateOf(f)
      if (st === 'on' || st === 'partial') active++
      if (f.faces.some((x) => d.sources.get(x.sourceId)?.readonly)) installed++
      for (const x of f.faces) {
        if (!bySource.has(x.sourceId)) bySource.set(x.sourceId, new Set())
        bySource.get(x.sourceId)!.add(f.name)
      }
    }
    return { active, installed, bySource }
  }, [families, d])

  const folders = library.sources.filter((s) => s.kind === 'folder')
  const managed = library.sources.filter((s) => (s.kind === 'google' || s.kind === 'fontshare') && counts.bySource.get(s.id)?.size)
  const pendingUpdates = updates.filter((u) => u.status !== 'installed').length
  const problems = library.broken.length

  const create = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    await saveCollection({ id: `c-${Date.now().toString(36)}`, name: n, color, families: [], createdAt: Date.now() })
    setCreating(false)
    setName('')
  }

  return (
    <nav className="sidebar" aria-label="Library navigation">
      <Item nav={{ kind: 'all' }} icon={<I.Fonts />} label="All fonts" count={families.length} />
      <Item nav={{ kind: 'active' }} icon={<I.Power />} label="Active" count={counts.active} />
      <Item nav={{ kind: 'installed' }} icon={<I.Windows />} label="Installed in Windows" count={counts.installed} />

      <div className="nav-section">
        Library folders
        <button type="button" title="Add folder" aria-label="Add folder" onClick={() => void run(api().addFolder())}>
          <I.Plus size={14} />
        </button>
      </div>
      {folders.length === 0 && managed.length === 0 && (
        <button type="button" className="nav-item" onClick={() => void run(api().addFolder())}>
          <I.Plus />
          <span className="label">Add a font folder…</span>
        </button>
      )}
      {managed.map((s) => (
        <Item key={s.id} nav={{ kind: 'source', id: s.id }} icon={<I.Download />} label={s.name} count={counts.bySource.get(s.id)?.size ?? 0} />
      ))}
      {folders.map((s) => (
        <Item
          key={s.id}
          nav={{ kind: 'source', id: s.id }}
          icon={<I.Folder />}
          label={s.name}
          count={counts.bySource.get(s.id)?.size ?? 0}
          extra={
            <span
              role="button"
              tabIndex={0}
              className="remove"
              title={`Remove ${s.path} from library (files are not deleted)`}
              aria-label={`Remove folder ${s.name}`}
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Remove "${s.path}" from Typeshelf?\n\nActive fonts from this folder will be deactivated. Files on disk are not deleted.`))
                  void run(api().removeSource(s.id))
              }}
            >
              <I.Close size={13} />
            </span>
          }
        />
      ))}

      <div className="nav-section">Discover</div>
      <Item nav={{ kind: 'catalog', provider: 'google' }} icon={<I.Globe />} label="Google Fonts" />
      <Item nav={{ kind: 'catalog', provider: 'fontshare' }} icon={<I.Sparkle />} label="Fontshare" />

      <div className="nav-section">
        Collections
        <button type="button" title="New collection" aria-label="New collection" onClick={() => setCreating(true)}>
          <I.Plus size={14} />
        </button>
      </div>
      {collections.map((c) => (
        <Item
          key={c.id}
          nav={{ kind: 'collection', id: c.id }}
          icon={c.id === 'favorites' ? <I.Star size={16} style={{ color: c.color }} /> : <span className="dot" style={{ background: c.color }} />}
          label={c.name}
          count={c.families.length}
        />
      ))}

      <div className="spacer" />
      <div className="nav-section">Tools</div>
      {compare.length > 0 && <Item nav={{ kind: 'compare' }} icon={<I.Columns />} label="Compare" count={compare.length} />}
      <Item nav={{ kind: 'updates' }} icon={<I.Refresh />} label="Font updates" badge={pendingUpdates} />
      <Item nav={{ kind: 'health' }} icon={<I.Health />} label="Library health" badge={problems} />
      <Item nav={{ kind: 'settings' }} icon={<I.Settings />} label="Settings" />

      {creating && (
        <Modal
          title="New collection"
          onClose={() => setCreating(false)}
          actions={
            <>
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void create()} disabled={!name.trim()}>
                Create
              </button>
            </>
          }
        >
          <input
            className="field"
            autoFocus
            placeholder="e.g. Client – Brand refresh"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <div className="swatches">
            {COLLECTION_COLORS.map((c) => (
              <span
                key={c}
                role="button"
                aria-label={`Color ${c}`}
                tabIndex={0}
                className={`swatch ${c === color ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </Modal>
      )}
    </nav>
  )
}
