import { useRef, type ReactElement } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CATEGORIES, SCRIPTS, type Category, type Script } from '@shared/types'
import type { Family } from '@shared/families'
import { api, run, useStore, type Nav, type SortKey } from '../store'
import { useDerived, useVisibleFamilies } from '../lib/derived'
import { fontStack, useFace } from '../lib/fontLoader'
import { setFamiliesActive, toggleInCollection } from '../lib/actions'
import { Menu, Toggle } from './common'
import { I } from './Icons'

const CATEGORY_LABEL: Record<Category, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  monospace: 'Mono',
  display: 'Display',
  handwriting: 'Script',
  symbol: 'Symbol',
  other: 'Other'
}

function title(nav: Nav, names: { source?: string; collection?: string }): string {
  switch (nav.kind) {
    case 'all':
      return 'All fonts'
    case 'active':
      return 'Active fonts'
    case 'installed':
      return 'Installed in Windows'
    case 'source':
      return names.source ?? 'Folder'
    case 'collection':
      return names.collection ?? 'Collection'
    default:
      return ''
  }
}

export function PreviewText({ family, size, text }: { family: Family; size: number; text: string }): ReactElement {
  const status = useFace(family.primary)
  return (
    <div
      className={`row-preview ${status === 'loading' ? 'loading' : ''} ${status === 'failed' ? 'failed' : ''}`}
      style={{ fontFamily: fontStack(family.primary), fontSize: size }}
    >
      {status === 'failed' ? 'Preview unavailable for this file' : text || family.name}
    </div>
  )
}

function Row({ family, top, height }: { family: Family; top: number; height: number }): ReactElement {
  const previewText = useStore((s) => s.previewText)
  const size = useStore((s) => s.previewSize)
  const selected = useStore((s) => s.selectedFamily === family.name)
  const compare = useStore((s) => s.compare.includes(family.name))
  const collections = useStore((s) => s.collections)
  const select = useStore((s) => s.select)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const d = useDerived()
  const state = d.stateOf(family)
  const fav = collections.find((c) => c.id === 'favorites')?.families.includes(family.name)
  const sourceName = family.sourceIds.map((id) => d.sources.get(id)?.name).filter(Boolean)[0]

  return (
    <div
      className={`row ${selected ? 'selected' : ''}`}
      style={{ transform: `translateY(${top}px)`, height }}
      onClick={() => select(family.name)}
      role="listitem"
      aria-label={family.name}
    >
      <div className="row-head">
        <Toggle state={state} onChange={(on) => void setFamiliesActive([family], on)} />
        <span className="row-name">{family.name}</span>
        <span className="row-meta">
          {family.faces.length} style{family.faces.length === 1 ? '' : 's'} · {CATEGORY_LABEL[family.category]}
          {sourceName ? ` · ${sourceName}` : ''}
        </span>
        {family.variable && <span className="pill var">Variable</span>}
        {state === 'installed' && <span className="pill">System</span>}
        <div className="row-actions">
          <button
            type="button"
            className={`icon-btn ${fav ? 'on' : ''}`}
            title={fav ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => {
              e.stopPropagation()
              void toggleInCollection('favorites', family.name)
            }}
          >
            <I.Star filled={fav} />
          </button>
          <button
            type="button"
            className={`icon-btn ${compare ? 'accent-on' : ''}`}
            title={compare ? 'Remove from compare' : 'Add to compare'}
            aria-label={compare ? 'Remove from compare' : 'Add to compare'}
            onClick={(e) => {
              e.stopPropagation()
              toggleCompare(family.name)
            }}
          >
            <I.Columns />
          </button>
          <Menu trigger={<I.More />} label="More actions">
            {(close) => (
              <>
                {collections
                  .filter((c) => c.id !== 'favorites')
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        void toggleInCollection(c.id, family.name)
                        close()
                      }}
                    >
                      <span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                      {c.families.includes(family.name) ? `Remove from ${c.name}` : `Add to ${c.name}`}
                    </button>
                  ))}
                {collections.length > 1 && <hr />}
                <button
                  type="button"
                  onClick={() => {
                    void run(api().revealFile(family.primary.path))
                    close()
                  }}
                >
                  <I.Folder /> Show in folder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void run(
                      api().exportFaces(family.faces.map((f) => f.id)),
                      'Exported font files'
                    )
                    close()
                  }}
                >
                  <I.Download /> Export files…
                </button>
              </>
            )}
          </Menu>
        </div>
      </div>
      <PreviewText family={family} size={size} text={previewText} />
    </div>
  )
}

export function FamilyList(): ReactElement {
  const nav = useStore((s) => s.nav)
  const library = useStore((s) => s.library)
  const collections = useStore((s) => s.collections)
  const previewText = useStore((s) => s.previewText)
  const size = useStore((s) => s.previewSize)
  const categories = useStore((s) => s.categories)
  const variableOnly = useStore((s) => s.variableOnly)
  const monospaceOnly = useStore((s) => s.monospaceOnly)
  const script = useStore((s) => s.script)
  const sort = useStore((s) => s.sort)
  const set = useStore((s) => s.set)
  const toggleCategory = useStore((s) => s.toggleCategory)
  const progress = useStore((s) => s.progress)
  const d = useDerived()
  const families = useVisibleFamilies(nav)
  const parentRef = useRef<HTMLDivElement>(null)
  const rowHeight = Math.round(Math.max(90, size * 1.3 + 58))

  const virtualizer = useVirtualizer({
    count: families.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 6
  })

  const source = nav.kind === 'source' ? library.sources.find((s) => s.id === nav.id) : undefined
  const collection = nav.kind === 'collection' ? collections.find((c) => c.id === nav.id) : undefined
  const togglable = families.filter((f) => {
    const st = d.stateOf(f)
    return st === 'on' || st === 'off' || st === 'partial'
  })
  const anyOff = togglable.some((f) => d.stateOf(f) !== 'on')

  return (
    <>
      <div className="toolbar">
        <h1>
          {title(nav, { source: source?.name, collection: collection?.name })}
          <small>
            {families.length.toLocaleString()} famil{families.length === 1 ? 'y' : 'ies'}
          </small>
        </h1>
        <input
          className="preview-input"
          placeholder="Type to preview…"
          aria-label="Preview text"
          value={previewText}
          onChange={(e) => set('previewText', e.target.value)}
        />
        <div className="size-control">
          <input
            type="range"
            min={12}
            max={140}
            value={size}
            aria-label="Preview size"
            onChange={(e) => set('previewSize', Number(e.target.value))}
          />
          {size}px
        </div>
        {(nav.kind === 'collection' || nav.kind === 'source') && togglable.length > 0 && (
          <button type="button" className="btn" onClick={() => void setFamiliesActive(togglable, anyOff)}>
            <I.Power /> {anyOff ? 'Activate all' : 'Deactivate all'}
          </button>
        )}
        {nav.kind === 'source' && source && (
          <button type="button" className="btn ghost" onClick={() => void run(api().revealFile(source.path))}>
            <I.Folder /> Open
          </button>
        )}
      </div>
      <div className="chips" role="toolbar" aria-label="Filters">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`chip ${categories.includes(c) ? 'on' : ''}`} onClick={() => toggleCategory(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
        <button type="button" className={`chip ${variableOnly ? 'on' : ''}`} onClick={() => set('variableOnly', !variableOnly)}>
          Variable
        </button>
        <button type="button" className={`chip ${monospaceOnly ? 'on' : ''}`} onClick={() => set('monospaceOnly', !monospaceOnly)}>
          Monospaced
        </button>
        <select
          className="select"
          style={{ height: 26, fontSize: 12 }}
          aria-label="Language support"
          value={script}
          onChange={(e) => set('script', e.target.value as Script | '')}
        >
          <option value="">Any language</option>
          {SCRIPTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="grow" style={{ flex: 1 }} />
        <select
          className="select"
          style={{ height: 26, fontSize: 12 }}
          aria-label="Sort"
          value={sort}
          onChange={(e) => set('sort', e.target.value as SortKey)}
        >
          <option value="name">Name</option>
          <option value="newest">Recently added</option>
          <option value="styles">Most styles</option>
        </select>
      </div>

      {families.length === 0 ? (
        <div className="empty">
          {progress.phase === 'parsing' || progress.phase === 'discovering' ? (
            <>
              <h3>Scanning your fonts…</h3>
              <p>
                {progress.done.toLocaleString()} / {progress.total.toLocaleString()} files
              </p>
            </>
          ) : nav.kind === 'collection' ? (
            <>
              <h3>This collection is empty</h3>
              <p>Use ★ or the ⋯ menu on any family to add it here.</p>
            </>
          ) : (
            <>
              <h3>No fonts match</h3>
              <p>Try clearing filters, or add a folder that contains fonts.</p>
              <button type="button" className="btn primary" onClick={() => void run(api().addFolder())}>
                <I.Plus /> Add folder
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="list" ref={parentRef} role="list">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => (
              <Row key={families[v.index].name} family={families[v.index]} top={v.start} height={rowHeight} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
