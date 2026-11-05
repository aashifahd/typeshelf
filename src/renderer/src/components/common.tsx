import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { ActiveState } from '@shared/families'

export function Toggle({
  state,
  onChange,
  title
}: {
  state: ActiveState | boolean
  onChange: (on: boolean) => void
  title?: string
}): ReactElement {
  const s: ActiveState = typeof state === 'boolean' ? (state ? 'on' : 'off') : state
  const disabled = s === 'installed' || s === 'web-only'
  const cls = s === 'on' || s === 'installed' ? 'on' : s === 'partial' ? 'partial' : ''
  const label =
    title ??
    (s === 'installed'
      ? 'Installed in the OS'
      : s === 'web-only'
        ? 'Web fonts can only be previewed'
        : s === 'on'
          ? 'Deactivate'
          : 'Activate')
  return (
    <button
      type="button"
      role="switch"
      aria-checked={s === 'on' || s === 'installed'}
      aria-label={label}
      title={label}
      className={`toggle ${cls}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!(s === 'on' || s === 'partial'))
      }}
    />
  )
}

export function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', h)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('keydown', k)
    }
  }, [open, onClose])
  return ref
}

export function Menu({
  trigger,
  children,
  label
}: {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  label: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const close = (): void => setOpen(false)
  const ref = useClickOutside<HTMLDivElement>(open, close)
  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className="menu" role="menu">
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  actions
}: {
  title: string
  children: ReactNode
  onClose: () => void
  actions: ReactNode
}): ReactElement {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>
  )
}

export function Spinner(): ReactElement {
  return <span className="spinner" aria-label="Loading" />
}

export function timeAgo(ts?: number): string {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const COLLECTION_COLORS = ['#f5b83d', '#8b7cff', '#3fb6ff', '#3ccf91', '#ff6b9a', '#ff8a4c', '#a0a4b8']
