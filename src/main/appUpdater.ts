import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import type { AppUpdateState } from '@shared/types'
import log from './log'

const { autoUpdater } = electronUpdater

/**
 * App self-update via electron-updater. Only active in packaged builds that were
 * built with a `publish` target (which produces resources/app-update.yml).
 * Updates download in the background and install when the app quits, or
 * straight away when the user clicks "Restart to update".
 */
function configured(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

let state: AppUpdateState = { status: 'idle' }
let onChange: (s: AppUpdateState) => void = () => undefined

function set(next: AppUpdateState): void {
  state = next
  onChange(state)
}

export function getAppUpdateState(): AppUpdateState {
  return state
}

export function initAppUpdater(emit: (s: AppUpdateState) => void): void {
  onChange = emit
  if (!configured()) return
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => state.status !== 'ready' && set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => state.status !== 'ready' && set({ status: 'idle' }))
  autoUpdater.on('update-available', (i) => set({ status: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => {
    log.info(`app update ${i.version} downloaded`)
    set({ status: 'ready', version: i.version })
  })
  autoUpdater.on('error', (e) => {
    log.warn('app update error', e)
    if (state.status !== 'ready') set({ status: 'error', message: e?.message ?? String(e) })
  })
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  setTimeout(check, 60_000)
  setInterval(check, 6 * 3600 * 1000)
}

export async function checkAppUpdate(): Promise<{ available: boolean; version?: string; message?: string }> {
  if (!configured()) {
    return { available: false, message: app.isPackaged ? 'Update feed not configured for this build' : 'Updates are disabled in development' }
  }
  if (state.status === 'ready') return { available: true, version: state.version, message: `Version ${state.version} is ready. Restart to update.` }
  const r = await autoUpdater.checkForUpdates()
  const v = r?.updateInfo?.version
  return v && v !== app.getVersion()
    ? { available: true, version: v, message: `Version ${v} is downloading.` }
    : { available: false, message: 'You are on the latest version.' }
}

/** Quit, install the downloaded update silently and start the new version. */
export function installAppUpdate(beforeQuit: () => void): void {
  if (state.status !== 'ready') throw new Error('No update is ready to install')
  beforeQuit()
  autoUpdater.quitAndInstall(true, true)
}
