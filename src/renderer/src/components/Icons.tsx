import type { ReactElement, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: P): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const I = {
  Search: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  Fonts: (p: P) => (
    <Svg {...p}>
      <path d="M4 20 9.5 5h1L16 20M6.2 14h7.6" />
      <path d="M17 11h4M19 9v8" />
    </Svg>
  ),
  Power: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v8" />
      <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
    </Svg>
  ),
  Windows: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17" />
    </Svg>
  ),
  Folder: (p: P) => (
    <Svg {...p}>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  Star: (p: P & { filled?: boolean }) => {
    const { filled, ...rest } = p
    return (
      <Svg {...rest} fill={filled ? 'currentColor' : 'none'}>
        <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z" />
      </Svg>
    )
  },
  Globe: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5s1.1-5.9 3.6-8.5z" />
    </Svg>
  ),
  Sparkle: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z" />
    </Svg>
  ),
  Refresh: (p: P) => (
    <Svg {...p}>
      <path d="M20 11a8 8 0 0 0-14.7-4.3L3.5 9" />
      <path d="M3.5 4.5V9H8" />
      <path d="M4 13a8 8 0 0 0 14.7 4.3l1.8-2.3" />
      <path d="M20.5 19.5V15H16" />
    </Svg>
  ),
  Download: (p: P) => (
    <Svg {...p}>
      <path d="M12 4v11M7 10.5 12 15.5l5-5M5 19.5h14" />
    </Svg>
  ),
  Heart: (p: P) => (
    <Svg {...p}>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />
    </Svg>
  ),
  Settings: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  Health: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5 4.5 6.5v5c0 4.6 3.2 8 7.5 9 4.3-1 7.5-4.4 7.5-9v-5z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  Columns: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M12 4.5v15" />
    </Svg>
  ),
  Back: (p: P) => (
    <Svg {...p}>
      <path d="M15 5 8 12l7 7" />
    </Svg>
  ),
  More: (p: P) => (
    <Svg {...p}>
      <circle cx="5.5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1" fill="currentColor" />
    </Svg>
  ),
  External: (p: P) => (
    <Svg {...p}>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
      <path d="M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </Svg>
  ),
  Pin: (p: P) => (
    <Svg {...p}>
      <path d="M9 4.5h6l-1 5 3.5 3.5h-11L10 9.5z" />
      <path d="M12 13v6.5" />
    </Svg>
  ),
  Undo: (p: P) => (
    <Svg {...p}>
      <path d="M9 14 4.5 9.5 9 5" />
      <path d="M4.5 9.5h10a5 5 0 0 1 0 10H11" />
    </Svg>
  ),
  Trash: (p: P) => (
    <Svg {...p}>
      <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9.5 7V4.5h5V7" />
    </Svg>
  ),
  Import: (p: P) => (
    <Svg {...p}>
      <path d="M12 15V4M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15" />
    </Svg>
  )
}
