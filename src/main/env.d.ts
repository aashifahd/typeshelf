/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Google Fonts Developer API key, embedded at build time. Optional. */
  readonly MAIN_VITE_GOOGLE_FONTS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
