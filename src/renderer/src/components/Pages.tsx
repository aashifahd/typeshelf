import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AppUpdateState, Settings } from '@shared/types'
import { links, windowsName } from '@shared/links'
import { findDuplicates, formatBytes } from '@shared/families'
import { api, run, useStore } from '../store'
import { useDerived } from '../lib/derived'
import { PreviewText } from './FamilyList'
import { Spinner, Toggle, timeAgo } from './common'
import { I } from './Icons'

// ---------------- Updates ----------------
export function UpdatesView(): ReactElement {
  const updates = useStore((s) => s.updates)
  const installed = useStore((s) => s.installedProvider)
  const settings = useStore((s) => s.settings)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)

  const check = async (): Promise<void> => {
    setChecking(true)
    const r = await run(api().checkFontUpdates())
    setChecking(false)
    if (r && !r.length) useStore.getState().toast('success', 'All installed fonts are up to date')
  }
  const applyAll = async (keys?: string[]): Promise<void> => {
    setApplying(true)
    await run(api().applyFontUpdates(keys))
    useStore.setState({ installedProvider: await api().getInstalledProviderFamilies() })
    setApplying(false)
  }
  const refresh = async (): Promise<void> => useStore.setState({ installedProvider: await api().getInstalledProviderFamilies() })

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Font updates</h1>
        <span className="muted">Last checked {timeAgo(settings?.lastUpdateCheck)}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
          {checking ? <Spinner /> : <I.Refresh />} Check now
        </button>
        {updates.length > 0 && (
          <button type="button" className="btn primary" onClick={() => void applyAll()} disabled={applying}>
            {applying ? <Spinner /> : <I.Download />} Update all ({updates.length})
          </button>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <b>{installed.length}</b>
          <span>Families managed</span>
        </div>
        <div className="stat">
          <b>{updates.filter((u) => u.status === 'available').length}</b>
          <span>Updates available</span>
        </div>
        <div className="stat">
          <b>{settings?.autoInstallUpdates ? 'Auto' : 'Manual'}</b>
          <span>Every {settings?.updateCheckHours ?? 6} h</span>
        </div>
        <div className="stat">
          <b>{installed.filter((i) => i.pinned).length}</b>
          <span>Paused families</span>
        </div>
      </div>

      {updates.length > 0 && (
        <div className="card">
          <h3>Available</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Source</th>
                <th>Installed</th>
                <th>New</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {updates.map((u) => (
                <tr key={`${u.provider}:${u.key}`}>
                  <td>{u.name}</td>
                  <td>{u.provider === 'google' ? 'Google Fonts' : 'Fontshare'}</td>
                  <td className="mono">{u.fromVersion}</td>
                  <td className="mono">{u.toVersion}</td>
                  <td>
                    {u.status === 'installing' ? (
                      <Spinner />
                    ) : u.status === 'failed' ? (
                      <span className="pill danger" title={u.error}>
                        Failed
                      </span>
                    ) : (
                      <span className="pill warn">Available</span>
                    )}
                    {u.error && <div className="muted" style={{ fontSize: 11.5 }}>{u.error}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn sm" disabled={applying} onClick={() => void applyAll([`${u.provider}:${u.key}`])}>
                      Update
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Managed families</h3>
        {installed.length === 0 ? (
          <p className="muted">Install fonts from Google Fonts or Fontshare and Typeshelf keeps them up to date for you.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Source</th>
                <th>Version</th>
                <th>Format</th>
                <th>Updated</th>
                <th>Auto-update</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {installed
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((i) => (
                  <tr key={`${i.provider}:${i.key}`}>
                    <td>{i.name}</td>
                    <td>{i.provider === 'google' ? 'Google Fonts' : 'Fontshare'}</td>
                    <td className="mono">{i.version}</td>
                    <td>{i.variable ? 'Variable' : 'Static'}</td>
                    <td>{timeAgo(i.updatedAt ?? i.installedAt)}</td>
                    <td>
                      <Toggle
                        state={!i.pinned}
                        title={i.pinned ? 'Resume auto-updates' : 'Pause auto-updates'}
                        onChange={(on) => void run(api().setFamilyPinned(i.provider, i.key, !on).then(refresh))}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {i.previousVersion && (
                        <button
                          type="button"
                          className="btn sm"
                          title={`Restore version ${i.previousVersion}`}
                          onClick={() => void run(api().rollbackFamily(i.provider, i.key).then(refresh))}
                        >
                          <I.Undo size={14} /> Roll back
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted">
        Updated files are validated before they replace the old ones, the previous version is kept for one-click rollback, and active fonts are re-activated automatically. Fonts in your own folders are hot-reloaded when their files change.
      </p>
    </div>
  )
}

// ---------------- Health ----------------
export function HealthView(): ReactElement {
  const library = useStore((s) => s.library)
  const families = useStore((s) => s.families)
  const progress = useStore((s) => s.progress)
  const d = useDerived()
  const dups = useMemo(() => findDuplicates(library.faces), [library.faces])
  const total = useMemo(() => {
    const seen = new Map<string, number>()
    library.faces.forEach((f) => seen.set(f.path, f.size))
    return [...seen.values()].reduce((a, b) => a + b, 0)
  }, [library.faces])
  const active = Object.keys(library.activations).length
  const scanning = progress.phase === 'parsing' || progress.phase === 'discovering'

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Library health</h1>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" disabled={scanning} onClick={() => void run(api().rescan())}>
          {scanning ? <Spinner /> : <I.Refresh />} Rescan everything
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <b>{families.length.toLocaleString()}</b>
          <span>Families</span>
        </div>
        <div className="stat">
          <b>{library.faces.length.toLocaleString()}</b>
          <span>Styles</span>
        </div>
        <div className="stat">
          <b>{active}</b>
          <span>Files activated by Typeshelf</span>
        </div>
        <div className="stat">
          <b>{formatBytes(total)}</b>
          <span>On disk</span>
        </div>
        <div className="stat">
          <b style={{ color: dups.length ? 'var(--warn)' : undefined }}>{dups.length}</b>
          <span>Duplicate / conflicting names</span>
        </div>
        <div className="stat">
          <b style={{ color: library.broken.length ? 'var(--danger)' : undefined }}>{library.broken.length}</b>
          <span>Unreadable files</span>
        </div>
      </div>

      <div className="card">
        <h3>Duplicates & conflicts</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          The same PostScript name in several files. Activating two of them at once can make apps pick the wrong version.
        </p>
        {dups.length === 0 ? (
          <p className="muted">No duplicates found. 🎉</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>PostScript name</th>
                <th>Version</th>
                <th>Source</th>
                <th>File</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dups.slice(0, 300).flatMap((group) =>
                group.map((f, i) => (
                  <tr key={f.id}>
                    <td className="mono">{i === 0 ? f.postscriptName : ''}</td>
                    <td className="mono">{f.version}</td>
                    <td>{d.sources.get(f.sourceId)?.name}</td>
                    <td className="mono" style={{ wordBreak: 'break-all' }}>
                      {f.path}
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-label="Show in folder" onClick={() => void run(api().revealFile(f.path))}>
                        <I.Folder />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Unreadable files</h3>
        {library.broken.length === 0 ? (
          <p className="muted">Every font file could be read.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {library.broken.map((b) => (
                <tr key={b.path}>
                  <td className="mono" style={{ wordBreak: 'break-all' }}>
                    {b.path}
                  </td>
                  <td className="muted">{b.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------------- Compare ----------------
export function CompareView(): ReactElement {
  const compare = useStore((s) => s.compare)
  const families = useStore((s) => s.families)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const select = useStore((s) => s.select)
  const setNav = useStore((s) => s.setNav)
  const [text, setText] = useState('Handgloves & Quartz 0123')
  const [size, setSize] = useState(56)
  const list = compare.map((n) => families.find((f) => f.name === n)).filter((f): f is NonNullable<typeof f> => Boolean(f))

  return (
    <>
      <div className="toolbar">
        <h1>
          Compare <small>{list.length} of 6</small>
        </h1>
        <input className="preview-input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Comparison text" />
        <div className="size-control">
          <input type="range" min={14} max={160} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Size" />
          {size}px
        </div>
        <button type="button" className="btn ghost" onClick={() => useStore.setState({ compare: [] })}>
          Clear
        </button>
      </div>
      <div className="list">
        {list.map((f) => (
          <div key={f.name} className="face-row" style={{ position: 'relative' }}>
            <div className="row-head">
              <span className="row-name" style={{ cursor: 'pointer' }} onClick={() => (setNav({ kind: 'all' }), select(f.name))}>
                {f.name}
              </span>
              <span className="row-meta">
                {f.faces.length} styles · {f.category}
              </span>
              <div className="row-actions">
                <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => toggleCompare(f.name)}>
                  <I.Close />
                </button>
              </div>
            </div>
            <PreviewText family={f} size={size} text={text} />
          </div>
        ))}
        {list.length === 0 && (
          <div className="empty">
            <h3>Nothing to compare yet</h3>
            <p>Use the compare button on any family to add it here.</p>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------- Settings ----------------
export function SettingsView(): ReactElement {
  const settings = useStore((s) => s.settings)
  const info = useStore((s) => s.info)
  const library = useStore((s) => s.library)
  const [appUpdate, setAppUpdate] = useState<string>('')
  const [updateState, setUpdateState] = useState<AppUpdateState>({ status: 'idle' })
  useEffect(() => {
    void api().getAppUpdateState().then(setUpdateState)
    return api().on('appUpdate:changed', setUpdateState)
  }, [])
  if (!settings) return <div className="page" />

  const patch = async (p: Partial<Settings>): Promise<void> => {
    const next = await run(api().setSettings(p))
    if (next) useStore.setState({ settings: next })
  }

  const Row = ({ title, desc, children }: { title: string; desc?: string; children: ReactElement }): ReactElement => (
    <div className="setting">
      <div className="desc">
        {title}
        {desc && <small>{desc}</small>}
      </div>
      {children}
    </div>
  )

  return (
    <div className="page">
      <h1 style={{ margin: 0, fontSize: 20 }}>Settings</h1>

      <div className="card">
        <h3>Appearance</h3>
        <Row title="Theme">
          <select className="select" value={settings.theme} onChange={(e) => void patch({ theme: e.target.value as Settings['theme'] })} aria-label="Theme">
            <option value="system">Match Windows</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Row>
        <Row title="Default preview text" desc="Used when the preview box is empty after restart.">
          <input
            className="field"
            style={{ width: 340 }}
            defaultValue={settings.previewText}
            aria-label="Default preview text"
            onBlur={(e) => void patch({ previewText: e.target.value })}
          />
        </Row>
      </div>

      <div className="card">
        <h3>Activation</h3>
        <Row
          title="Activation mode"
          desc="Permanent fonts stay installed for your Windows account (no admin needed). Session fonts are removed when Typeshelf quits."
        >
          <select
            className="select"
            value={settings.activationMode}
            onChange={(e) => void patch({ activationMode: e.target.value as Settings['activationMode'] })}
            aria-label="Activation mode"
          >
            <option value="permanent">Permanent (recommended)</option>
            <option value="session">Until Typeshelf quits</option>
          </select>
        </Row>
        <Row title="Hot-reload active fonts" desc="When an active font file changes in a watched folder, reload it so apps see the new version.">
          <Toggle state={settings.hotReloadActiveFonts} onChange={(v) => void patch({ hotReloadActiveFonts: v })} />
        </Row>
      </div>

      <div className="card">
        <h3>Font updates</h3>
        <Row title="Check for font updates automatically">
          <Toggle state={settings.autoCheckUpdates} onChange={(v) => void patch({ autoCheckUpdates: v })} />
        </Row>
        <Row title="Install updates automatically" desc="Updates are validated first and the previous version is kept for rollback.">
          <Toggle state={settings.autoInstallUpdates} onChange={(v) => void patch({ autoInstallUpdates: v })} />
        </Row>
        <Row title="Check every">
          <select className="select" value={settings.updateCheckHours} onChange={(e) => void patch({ updateCheckHours: +e.target.value })} aria-label="Check interval">
            {[1, 3, 6, 12, 24, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h < 24 ? `${h} hour${h > 1 ? 's' : ''}` : h === 168 ? 'week' : `${h / 24} day${h > 24 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Prefer variable fonts" desc="When a family offers both, install the single variable file instead of many static styles.">
          <Toggle state={settings.preferVariable} onChange={(v) => void patch({ preferVariable: v })} />
        </Row>
      </div>

      <div className="card">
        <h3>System</h3>
        <Row title="Launch at login" desc="Starts hidden in the tray so updates keep running.">
          <Toggle state={settings.launchAtLogin} onChange={(v) => void patch({ launchAtLogin: v })} />
        </Row>
        <Row title="Keep running in the tray when closed">
          <Toggle state={settings.minimizeToTray} onChange={(v) => void patch({ minimizeToTray: v })} />
        </Row>
        <Row title="Start minimized">
          <Toggle state={settings.startMinimized} onChange={(v) => void patch({ startMinimized: v })} />
        </Row>
      </div>

      <div className="card">
        <h3>Library</h3>
        <Row title="Font sources" desc={library.sources.map((s) => s.path).join(' · ')}>
          <button type="button" className="btn" onClick={() => void run(api().addFolder())}>
            <I.Plus /> Add folder
          </button>
        </Row>
        <Row title="Import font files" desc="Copies selected files into Typeshelf's library.">
          <button type="button" className="btn" onClick={() => void run(api().importFiles().then((n) => useStore.getState().toast('success', `Imported ${n} file(s)`)))}>
            <I.Import /> Import…
          </button>
        </Row>
        <Row title="Downloaded fonts folder" desc={settings.managedFontsDir}>
          <button type="button" className="btn" onClick={() => void run(api().revealFile(library.sources.find((s) => s.kind === 'google')?.path ?? ''))}>
            <I.Folder /> Open
          </button>
        </Row>
      </div>

      <div className="card">
        <h3>About</h3>
        <Row
          title={`Typeshelf ${info?.version ?? ''}`}
          desc={
            updateState.status === 'ready'
              ? `Version ${updateState.version} is ready to install.`
              : updateState.status === 'downloading'
                ? `Downloading version ${updateState.version}… ${updateState.percent ?? 0}%`
                : appUpdate || `Data: ${info?.userData ?? ''}`
          }
        >
          {updateState.status === 'ready' ? (
            <button type="button" className="btn primary" onClick={() => void run(api().installAppUpdate())}>
              <I.Refresh /> Restart to update
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={updateState.status === 'downloading' || updateState.status === 'checking'}
              onClick={() =>
                void run(api().checkAppUpdate()).then((r) => r && setAppUpdate(r.message ?? (r.available ? `Version ${r.version} available` : 'Up to date')))
              }
            >
              <I.Refresh /> Check for app updates
            </button>
          )}
        </Row>
        <Row title="Font news and tips" desc="An occasional email about new fonts and Typeshelf releases. Opens a sign-up page in your browser; nothing is sent from the app.">
          <button type="button" className="btn" onClick={() => void run(api().openExternal(links.newsletter(info?.version)))}>
            <I.External /> Subscribe
          </button>
        </Row>
        <Row title="Report a problem" desc="Opens a bug report on GitHub with your version filled in. Attach main.log from the log folder if you can.">
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => void run(api().openLogFolder())}>
              <I.Folder /> Log folder
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void run(api().openExternal(links.bugReport(info?.version ?? '', windowsName(info?.osRelease ?? ''))))}
            >
              <I.External /> Report
            </button>
          </div>
        </Row>
        <Row title="Free and open source" desc="Licensed under GPL-3.0-or-later. Source code, issues and releases are on GitHub.">
          <button type="button" className="btn" onClick={() => void run(api().openExternal(links.source()))}>
            <I.External /> Source code
          </button>
        </Row>
      </div>

      <div className="card credit">
        <h3>Made by CenoDigital</h3>
        <p className="muted">
          Typeshelf is built and maintained by CenoDigital, a digital studio. We design brands and build websites and custom apps like this one.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={() => void run(api().openExternal(links.services(info?.version)))}>
            <I.External /> Work with us
          </button>
          <button type="button" className="btn" onClick={() => void run(api().openExternal(links.credit(info?.version)))}>
            cenodigital.com
          </button>
        </div>
      </div>
    </div>
  )
}
