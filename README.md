# Typeshelf

A fast, modern font manager for Windows (macOS/Linux supported for core features). Covers the jobs FontBase does: library folders, activation, previews, collections, and Google Fonts. Adds automatic font updates, Fontshare, hot-reload, library health and more.

Original code. No FontBase code, assets or branding were used.

## Features

| Area | What it does |
| --- | --- |
| **Library** | Indexes Windows fonts, per-user fonts and any folders you add (recursive, TTF/OTF/TTC/OTC/WOFF/WOFF2). Parsing runs in a worker-thread pool and results are cached by size + mtime. 789 files index in about 2 s on first run and near-instantly after that. |
| **Activation** | Per-user install via `HKCU\…\Fonts` + `AddFontResourceW` + `WM_FONTCHANGE`. **No admin rights.** *Permanent* (survives restarts) or *session* (removed when the app quits). Startup reconciles the registry, restores entries Windows Settings removed, and cleans up orphans and missing files. Skips fonts another app already installed. |
| **Auto-updating fonts** | Fonts installed from **Google Fonts** (version = `lastModified`) and **Fontshare** (version = `version`) are checked every N hours, including right after launch if the PC was off. Updates download to a staging folder, are validated by parsing, then swap in atomically. The old version is kept for **one-click rollback**, active fonts are re-activated, and failures roll back automatically. You can pause updates per family. |
| **Hot-reload** | When an *active* font file in a watched folder changes (e.g. a designer drops in v1.1), it's reloaded so apps see the new version. |
| **Discover** | Browse the full Google Fonts and Fontshare catalogs with live previews. Install variable or static styles in one click. The catalog is cached for offline use. |
| **Previews** | Virtualized list with custom text and size; filter by category, variable, monospaced and **language support** (Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari, **Tamil, Sinhala**, Thai, CJK…); sort by name, newest or style count. |
| **Family detail** | Styles (per-style toggles), **Type tester** (editable, variable-axis sliders, OpenType feature toggles, tracking, line height, waterfall, copy CSS), **Glyph browser** (search by name, character or `U+`, copy char / HTML entity / CSS escape), **Info** (designer, license, files, metrics), **@font-face CSS** generator and file export. |
| **Organise** | Favorites + colour-coded collections, activate/deactivate a whole collection, compare up to 6 families side by side. |
| **Library health** | Duplicate / conflicting PostScript names across files, unreadable files, disk usage. |
| **App** | Tray icon, launch at login (hidden), single instance, light/dark/system theme, native Windows title bar, toasts and notifications, electron-updater self-update (when a publish feed is configured). |

## Architecture

```
src/
  shared/      types + pure family logic (used by UI and tests)
  main/        Electron main process
    scanner/   fontkit parsing in worker_threads (parse.ts, worker.ts, pool.ts)
    activation/ Win32 via koffi FFI (win32.ts) + ActivationManager (index.ts)
    providers/ google.ts, fontshare.ts, select.ts (pure), cache.ts, http.ts
    library.ts       sources, scan cache, chokidar watchers, hot-reload
    fontUpdates.ts   install / update / rollback / scheduler
    fontProtocol.ts  tsfont:// — serves only indexed files; splits TTC faces (sfnt.ts)
    ipc.ts           validated IPC surface
  preload/     contextBridge API (sandboxed, contextIsolation)
  renderer/    React 19 + zustand + @tanstack/react-virtual
```

Security: `sandbox: true`, `contextIsolation`, no `nodeIntegration`, strict CSP in production, IPC argument validation, navigation and new windows blocked, the font protocol serves only files in the index, zip extraction uses base names only (no zip-slip), provider download hosts are checked.

## Development

```bash
npm install
npm run dev        # Electron app with hot reload
npm run dev:web    # UI only, in a browser, with a mock API (http://localhost:5199)
npm run typecheck
npm test           # unit + real-font tests
LIVE=1 npm test    # also hits Google Fonts / Fontshare
node scripts/activation-e2e.mts   # real activate → verify → deactivate on this PC
```

## Building

```bash
npm run dist       # → dist/Typeshelf-Setup-<version>.exe (NSIS, per-user, no admin)
npm run dist:dir   # unpacked app in dist/win-unpacked
node scripts/make-icon.cjs   # regenerate build/icon.png from code
```

### Before shipping to other people

1. **Code-sign the installer** (an OV or EV certificate; set `CSC_LINK` / `CSC_KEY_PASSWORD`). Unsigned Electron apps trigger SmartScreen and are more likely to hit antivirus false positives.
2. **Enable app self-updates**: add a `publish` block to `build` in `package.json` (e.g. `{ "provider": "github", "owner": "<org>", "repo": "typeshelf" }`). electron-updater then checks every 6 h and installs on quit. Without it, the updater stays off.
3. Bump `version` in `package.json` for each release.

## Data locations

- Settings, library index, activations and collections: `%APPDATA%\Typeshelf\*.json` (atomic writes; a corrupt file is backed up and reset)
- Downloaded fonts: `%APPDATA%\Typeshelf\fonts\{google,fontshare}`, with backups in `fonts\.backup`
- Logs: `%APPDATA%\Typeshelf\logs\main.log`
