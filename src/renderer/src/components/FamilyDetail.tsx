import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FaceInfo, GlyphInfo } from '@shared/types'
import { faceActive, formatBytes, weightName, type Family } from '@shared/families'
import { api, run, useStore } from '../store'
import { useDerived } from '../lib/derived'
import { cssName, fontStack, useFace } from '../lib/fontLoader'
import { copyText, setFaceActive, setFamiliesActive, toggleInCollection } from '../lib/actions'
import { Spinner, Toggle } from './common'
import { I } from './Icons'

type Tab = 'styles' | 'tester' | 'glyphs' | 'info' | 'css'

const SAMPLES: Record<string, string> = {
  Pangram: 'The quick brown fox jumps over the lazy dog',
  Paragraph:
    'Typography is the craft of endowing human language with a durable visual form. Good type disappears; it lets the reader focus on meaning while rhythm, spacing and contrast quietly guide the eye from one line to the next.',
  Alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !@#$%&*()[]{}',
  Numbers: '0123456789 ½ ¾ $1,234.56 €98 £76 12:45 3×4=12',
  Headline: 'Bold ideas, beautifully set'
}

/** Features worth toggling (others like ccmp/kern are always on). */
const FEATURE_LABELS: Record<string, string> = {
  liga: 'Ligatures',
  dlig: 'Discretionary ligatures',
  calt: 'Contextual alternates',
  salt: 'Stylistic alternates',
  swsh: 'Swash',
  smcp: 'Small caps',
  c2sc: 'Caps to small caps',
  case: 'Case-sensitive forms',
  onum: 'Oldstyle figures',
  lnum: 'Lining figures',
  tnum: 'Tabular figures',
  pnum: 'Proportional figures',
  frac: 'Fractions',
  zero: 'Slashed zero',
  sups: 'Superscript',
  subs: 'Subscript',
  ordn: 'Ordinals',
  hist: 'Historical forms',
  titl: 'Titling'
}
const DEFAULT_ON = new Set(['liga', 'calt', 'kern'])

function isToggleFeature(tag: string): boolean {
  return tag in FEATURE_LABELS || /^(ss\d\d|cv\d\d)$/.test(tag)
}

function FaceLine({ face, text, size, extraStyle }: { face: FaceInfo; text: string; size: number; extraStyle?: CSSProperties }): ReactElement {
  const status = useFace(face)
  return (
    <div
      className={`row-preview ${status === 'loading' ? 'loading' : ''} ${status === 'failed' ? 'failed' : ''}`}
      style={{ fontFamily: fontStack(face), fontSize: size, ...extraStyle }}
    >
      {status === 'failed' ? 'Preview unavailable for this file' : text}
    </div>
  )
}

function StylesTab({ family }: { family: Family }): ReactElement {
  const previewText = useStore((s) => s.previewText)
  const size = useStore((s) => s.previewSize)
  const library = useStore((s) => s.library)
  const d = useDerived()
  return (
    <div>
      {family.faces.map((f) => {
        const ro = d.sources.get(f.sourceId)?.readonly
        const web = f.format === 'woff' || f.format === 'woff2'
        const on = faceActive(f, d.sources, library.activations, d.external)
        return (
          <div key={f.id} className="face-row">
            <div className="row-head">
              <Toggle state={ro ? 'installed' : web ? 'web-only' : on} onChange={(v) => void setFaceActive(f, v)} />
              <span className="row-name">{f.style}</span>
              <span className="row-meta">
                {f.weight} · {f.format.toUpperCase()}
                {f.variable ? ` · ${f.axes.map((a) => a.tag).join(', ')}` : ''}
              </span>
              {library.activations[f.path.toLowerCase()]?.mode === 'session' && <span className="pill warn">Until quit</span>}
              {d.external.has(f.path.toLowerCase()) && <span className="pill">Installed elsewhere</span>}
              <div className="row-actions">
                <button type="button" className="icon-btn" title="Copy PostScript name" aria-label="Copy PostScript name" onClick={() => void copyText(f.postscriptName, `Copied ${f.postscriptName}`)}>
                  <I.Copy />
                </button>
                <button type="button" className="icon-btn" title="Show in folder" aria-label="Show in folder" onClick={() => void run(api().revealFile(f.path))}>
                  <I.Folder />
                </button>
              </div>
            </div>
            <FaceLine face={f} text={previewText || family.name} size={size} />
          </div>
        )
      })}
    </div>
  )
}

function TesterTab({ family }: { family: Family }): ReactElement {
  const [faceId, setFaceId] = useState(family.primary.id)
  const face = family.faces.find((f) => f.id === faceId) ?? family.primary
  const [text, setText] = useState(SAMPLES.Paragraph)
  const [size, setSize] = useState(36)
  const [lineHeight, setLineHeight] = useState(1.35)
  const [tracking, setTracking] = useState(0)
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left')
  const [waterfall, setWaterfall] = useState(false)
  const [axes, setAxes] = useState<Record<string, number>>({})
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const status = useFace(face)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAxes(Object.fromEntries(face.axes.map((a) => [a.tag, a.default])))
    setFeatures({})
  }, [face.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== text) editorRef.current.innerText = text
  }, [text, waterfall])

  const toggles = face.features.filter(isToggleFeature)
  const variation = Object.entries(axes)
    .map(([t, v]) => `"${t}" ${v}`)
    .join(', ')
  const featureSettings = Object.entries(features)
    .map(([t, on]) => `"${t}" ${on ? 1 : 0}`)
    .join(', ')
  const style: CSSProperties = {
    fontFamily: fontStack(face),
    fontSize: size,
    lineHeight,
    letterSpacing: `${tracking / 1000}em`,
    textAlign: align,
    fontVariationSettings: variation || undefined,
    fontFeatureSettings: featureSettings || undefined,
    opacity: status === 'loading' ? 0.2 : 1
  }

  return (
    <div className="tester">
      {waterfall ? (
        <div className="tester-canvas" style={{ userSelect: 'text' }}>
          {[12, 14, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((s) => (
            <div key={s} className="waterfall-line" style={{ ...style, fontSize: s, textAlign: 'left' }}>
              <span className="size">{s}</span>
              <span style={{ fontFamily: fontStack(face) }}>{text.split('\n')[0]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={editorRef}
          className="tester-canvas"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          aria-label="Type tester, editable"
          style={style}
          onInput={(e) => setText((e.target as HTMLDivElement).innerText)}
        />
      )}
      <aside className="tester-controls" aria-label="Type tester controls">
        <div className="control">
          <span className="control-label">Style</span>
          <select className="select" value={face.id} onChange={(e) => setFaceId(e.target.value)} aria-label="Style">
            {family.faces.map((f) => (
              <option key={f.id} value={f.id}>
                {f.style}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <span className="control-label">Sample</span>
          <div className="feature-grid">
            {Object.keys(SAMPLES).map((k) => (
              <button key={k} type="button" className="chip" style={{ fontFamily: 'inherit' }} onClick={() => setText(SAMPLES[k])}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="seg" role="group" aria-label="Mode">
          <button type="button" className={!waterfall ? 'on' : ''} onClick={() => setWaterfall(false)}>
            Editor
          </button>
          <button type="button" className={waterfall ? 'on' : ''} onClick={() => setWaterfall(true)}>
            Waterfall
          </button>
        </div>
        <div className="control">
          <label>
            Size <span>{size}px</span>
          </label>
          <input type="range" min={8} max={240} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Size" />
        </div>
        <div className="control">
          <label>
            Line height <span>{lineHeight.toFixed(2)}</span>
          </label>
          <input type="range" min={0.8} max={2.5} step={0.05} value={lineHeight} onChange={(e) => setLineHeight(+e.target.value)} aria-label="Line height" />
        </div>
        <div className="control">
          <label>
            Tracking <span>{tracking}</span>
          </label>
          <input type="range" min={-100} max={300} step={5} value={tracking} onChange={(e) => setTracking(+e.target.value)} aria-label="Letter spacing" />
        </div>
        <div className="seg" role="group" aria-label="Alignment">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} type="button" className={align === a ? 'on' : ''} onClick={() => setAlign(a)}>
              {a[0].toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>

        {face.axes.length > 0 && (
          <div className="control">
            <span className="control-label">Variable axes</span>
            {face.axes.map((a) => (
              <div key={a.tag} className="control">
                <label>
                  {a.name} <span>{Math.round((axes[a.tag] ?? a.default) * 10) / 10}</span>
                </label>
                <input
                  type="range"
                  min={a.min}
                  max={a.max}
                  step={(a.max - a.min) / 200}
                  value={axes[a.tag] ?? a.default}
                  aria-label={a.name}
                  onChange={(e) => setAxes((x) => ({ ...x, [a.tag]: +e.target.value }))}
                />
              </div>
            ))}
            {face.instances.length > 0 && (
              <span className="muted" style={{ fontSize: 11.5 }}>
                Named instances: {face.instances.slice(0, 12).join(', ')}
                {face.instances.length > 12 ? '…' : ''}
              </span>
            )}
          </div>
        )}

        {toggles.length > 0 && (
          <div className="control">
            <span className="control-label">OpenType features</span>
            <div className="feature-grid">
              {toggles.map((t) => {
                const on = features[t] ?? DEFAULT_ON.has(t)
                return (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${on ? 'on' : ''}`}
                    title={FEATURE_LABELS[t] ?? (t.startsWith('ss') ? `Stylistic set ${+t.slice(2)}` : `Character variant ${+t.slice(2)}`)}
                    onClick={() => setFeatures((f) => ({ ...f, [t]: !on }))}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <button
          type="button"
          className="btn"
          onClick={() =>
            void copyText(
              [
                `font-family: '${family.name}';`,
                `font-size: ${size}px;`,
                `line-height: ${lineHeight};`,
                tracking ? `letter-spacing: ${tracking / 1000}em;` : '',
                variation ? `font-variation-settings: ${variation};` : '',
                featureSettings ? `font-feature-settings: ${featureSettings};` : ''
              ]
                .filter(Boolean)
                .join('\n'),
              'Copied CSS for these settings'
            )
          }
        >
          <I.Copy /> Copy CSS
        </button>
      </aside>
    </div>
  )
}

const CELL = 76

function GlyphsTab({ family }: { family: Family }): ReactElement {
  const [faceId, setFaceId] = useState(family.primary.id)
  const face = family.faces.find((f) => f.id === faceId) ?? family.primary
  const [glyphs, setGlyphs] = useState<GlyphInfo[] | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<GlyphInfo | null>(null)
  const [width, setWidth] = useState(800)
  const scrollRef = useRef<HTMLDivElement>(null)
  useFace(face)

  useEffect(() => {
    let alive = true
    setGlyphs(null)
    setSel(null)
    void api()
      .getGlyphs(face.id)
      .then((g) => alive && setGlyphs(g))
      .catch(() => alive && setGlyphs([]))
    return () => {
      alive = false
    }
  }, [face.id])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [glyphs])

  const filtered = useMemo(() => {
    if (!glyphs) return []
    const s = q.trim().toLowerCase()
    if (!s) return glyphs
    const hex = s.replace(/^(u\+|0x)/, '')
    return glyphs.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        String.fromCodePoint(g.cp) === q.trim() ||
        g.cp.toString(16).padStart(4, '0') === hex.padStart(4, '0')
    )
  }, [glyphs, q])

  const cols = Math.max(1, Math.floor(width / CELL))
  const rows = Math.ceil(filtered.length / cols)
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL,
    overscan: 4
  })
  const hex = (cp: number): string => cp.toString(16).toUpperCase().padStart(4, '0')

  return (
    <div className="glyph-layout">
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="chips">
          <select className="select" style={{ height: 28 }} value={face.id} onChange={(e) => setFaceId(e.target.value)} aria-label="Style">
            {family.faces.map((f) => (
              <option key={f.id} value={f.id}>
                {f.style}
              </option>
            ))}
          </select>
          <input className="field" style={{ height: 28, width: 260 }} placeholder="Search by name, character or U+0041" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search glyphs" />
          <span className="muted">{glyphs ? `${filtered.length.toLocaleString()} of ${glyphs.length.toLocaleString()} characters` : ''}</span>
        </div>
        {!glyphs ? (
          <div className="empty">
            <Spinner />
          </div>
        ) : (
          <div className="glyph-scroll" ref={scrollRef} style={{ flex: 1 }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().flatMap((row) =>
                filtered.slice(row.index * cols, row.index * cols + cols).map((g, i) => (
                  <div
                    key={g.cp}
                    className={`glyph-cell ${sel?.cp === g.cp ? 'sel' : ''}`}
                    style={{ top: row.start, left: i * CELL, width: CELL, height: CELL, fontFamily: fontStack(face) }}
                    title={`U+${hex(g.cp)} ${g.name}`}
                    onClick={() => setSel(g)}
                    onDoubleClick={() => void copyText(String.fromCodePoint(g.cp), `Copied ${String.fromCodePoint(g.cp)}`)}
                  >
                    {String.fromCodePoint(g.cp)}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <aside className="glyph-side" aria-label="Glyph details">
        <div className="glyph-big" style={{ fontFamily: fontStack(face) }}>
          {sel ? String.fromCodePoint(sel.cp) : ''}
        </div>
        {sel ? (
          <>
            <dl className="info" style={{ padding: 0, gridTemplateColumns: '80px 1fr' }}>
              <dt>Unicode</dt>
              <dd className="mono">U+{hex(sel.cp)}</dd>
              <dt>Name</dt>
              <dd className="mono">{sel.name || '—'}</dd>
              <dt>Decimal</dt>
              <dd className="mono">{sel.cp}</dd>
            </dl>
            <button type="button" className="btn" onClick={() => void copyText(String.fromCodePoint(sel.cp), 'Copied character')}>
              <I.Copy /> Copy character
            </button>
            <button type="button" className="btn" onClick={() => void copyText(`&#x${hex(sel.cp)};`, 'Copied HTML entity')}>
              <I.Copy /> Copy HTML entity
            </button>
            <button type="button" className="btn" onClick={() => void copyText(`\\${hex(sel.cp)}`, 'Copied CSS escape')}>
              <I.Copy /> Copy CSS escape
            </button>
          </>
        ) : (
          <p className="muted">Select a glyph to inspect it. Double-click copies it.</p>
        )}
      </aside>
    </div>
  )
}

function InfoTab({ family }: { family: Family }): ReactElement {
  const f = family.primary
  const d = useDerived()
  const totalSize = [...new Map(family.faces.map((x) => [x.path, x.size])).values()].reduce((a, b) => a + b, 0)
  const link = (url?: string): ReactElement | string =>
    url && /^https?:\/\//.test(url) ? (
      <a onClick={() => void run(api().openExternal(url))}>{url}</a>
    ) : (
      url ?? '—'
    )
  return (
    <div>
      <dl className="info">
        <dt>Family</dt>
        <dd>{family.name}</dd>
        <dt>Styles</dt>
        <dd>{family.faces.length}</dd>
        <dt>Designer</dt>
        <dd>{f.designer ?? '—'}</dd>
        <dt>Designer URL</dt>
        <dd>{link(f.designerUrl)}</dd>
        <dt>Foundry</dt>
        <dd>{f.manufacturer ?? '—'}</dd>
        <dt>Vendor URL</dt>
        <dd>{link(f.vendorUrl)}</dd>
        <dt>Version</dt>
        <dd>{f.version || '—'}</dd>
        <dt>Category</dt>
        <dd>{family.category}</dd>
        <dt>Languages</dt>
        <dd>{family.scripts.join(', ') || '—'}</dd>
        <dt>Glyphs</dt>
        <dd>{f.glyphCount.toLocaleString()}</dd>
        <dt>Units per em</dt>
        <dd>{f.unitsPerEm}</dd>
        <dt>Variable axes</dt>
        <dd>{f.axes.length ? f.axes.map((a) => `${a.name} (${a.tag}) ${a.min}–${a.max}`).join(' · ') : '—'}</dd>
        <dt>OpenType features</dt>
        <dd className="mono">{f.features.join(' ') || '—'}</dd>
        <dt>Copyright</dt>
        <dd>{f.copyright ?? '—'}</dd>
        <dt>License</dt>
        <dd style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{f.license ?? '—'}</dd>
        <dt>License URL</dt>
        <dd>{link(f.licenseUrl)}</dd>
        {f.description && (
          <>
            <dt>Description</dt>
            <dd>{f.description}</dd>
          </>
        )}
        <dt>Total size</dt>
        <dd>{formatBytes(totalSize)}</dd>
      </dl>
      <div style={{ padding: '0 18px 18px' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Style</th>
              <th>Weight</th>
              <th>File</th>
              <th>Source</th>
              <th>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {family.faces.map((x) => (
              <tr key={x.id}>
                <td>{x.style}</td>
                <td>
                  {x.weight} <span className="muted">{weightName(x.weight)}</span>
                </td>
                <td className="mono" style={{ wordBreak: 'break-all' }}>
                  {x.path}
                  {x.index ? ` #${x.index}` : ''}
                </td>
                <td>{d.sources.get(x.sourceId)?.name}</td>
                <td>{formatBytes(x.size)}</td>
                <td>
                  <button type="button" className="icon-btn" aria-label="Show in folder" title="Show in folder" onClick={() => void run(api().revealFile(x.path))}>
                    <I.Folder />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CssTab({ family }: { family: Family }): ReactElement {
  const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p
  const fmt = (f: FaceInfo): string => ({ ttf: 'truetype', ttc: 'truetype', otf: 'opentype', otc: 'opentype', woff: 'woff', woff2: 'woff2' })[f.format]
  const blocks = family.faces
    .map((f) => {
      const wght = f.axes.find((a) => a.tag === 'wght')
      return `@font-face {
  font-family: '${family.name}';
  src: url('./fonts/${fileName(f.path)}') format('${fmt(f)}');
  font-weight: ${wght ? `${wght.min} ${wght.max}` : f.weight};
  font-style: ${f.italic ? 'italic' : 'normal'};
  font-display: swap;
}`
    })
    .join('\n\n')
  const usage = `.text {\n  font-family: '${family.name}', ${family.category === 'serif' ? 'serif' : family.category === 'monospace' ? 'monospace' : 'sans-serif'};\n}`
  const full = `${blocks}\n\n${usage}`
  return (
    <div>
      <div style={{ padding: '14px 18px 0', display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={() => void copyText(full, 'Copied @font-face CSS')}>
          <I.Copy /> Copy CSS
        </button>
        <button type="button" className="btn" onClick={() => void run(api().exportFaces(family.faces.map((f) => f.id)), 'Exported font files')}>
          <I.Download /> Export font files…
        </button>
      </div>
      <pre className="code">{full}</pre>
      <p className="muted" style={{ padding: '0 18px' }}>
        Check the font's license before embedding it on a website. Desktop fonts are often licensed separately for web use.
      </p>
    </div>
  )
}

export function FamilyDetail({ family }: { family: Family }): ReactElement {
  const [tab, setTab] = useState<Tab>('styles')
  const select = useStore((s) => s.select)
  const collections = useStore((s) => s.collections)
  const compare = useStore((s) => s.compare.includes(family.name))
  const toggleCompare = useStore((s) => s.toggleCompare)
  const d = useDerived()
  const fav = collections.find((c) => c.id === 'favorites')?.families.includes(family.name)
  useFace(family.primary)

  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).isContentEditable) select(null)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [select])

  return (
    <div className="detail">
      <div className="detail-head">
        <button type="button" className="icon-btn" onClick={() => select(null)} aria-label="Back to list" title="Back (Esc)">
          <I.Back />
        </button>
        <Toggle state={d.stateOf(family)} onChange={(on) => void setFamiliesActive([family], on)} />
        <h2 style={{ fontFamily: `"${cssName(family.primary)}", var(--ui-font)` }}>{family.name}</h2>
        <span className="row-meta">
          {family.faces.length} styles{family.designer ? ` · ${family.designer}` : ''}
        </span>
        {family.variable && <span className="pill var">Variable</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className={`icon-btn ${fav ? 'on' : ''}`} onClick={() => void toggleInCollection('favorites', family.name)} aria-label="Favorite" title="Favorite">
          <I.Star filled={fav} />
        </button>
        <button type="button" className={`btn ${compare ? 'primary' : ''}`} onClick={() => toggleCompare(family.name)}>
          <I.Columns /> {compare ? 'In compare' : 'Compare'}
        </button>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['styles', 'Styles'],
            ['tester', 'Type tester'],
            ['glyphs', 'Glyphs'],
            ['info', 'Info'],
            ['css', 'CSS']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="detail-body">
        {tab === 'styles' && <StylesTab family={family} />}
        {tab === 'tester' && <TesterTab family={family} />}
        {tab === 'glyphs' && <GlyphsTab family={family} />}
        {tab === 'info' && <InfoTab family={family} />}
        {tab === 'css' && <CssTab family={family} />}
      </div>
    </div>
  )
}
