import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import log from './log'

const { autoUpdater } = electronUpdater

/**
 * App self-update via electron-updater. Only active in packaged builds that were
 * built with a `publish` target (which produces resources/app-update.yml).
 */
function configured(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

export function initAppUpdater(): void {
  if (!configured()) return
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  setTimeout(() => void autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn('app update check', e)), 60_000)
  setInterval(() => void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined), 6 * 3600 * 1000)
}

export async function checkAppUpdate(): Promise<{ available: boolean; version?: string; message?: string }> {
  if (!configured()) {
    return { available: false, message: app.isPackaged ? 'Update feed not configured for this build' : 'Updates are disabled in development' }
  }
  const r = await autoUpdater.checkForUpdates()
  const v = r?.updateInfo?.version
  return v && v !== app.getVersion()
    ? { available: true, version: v, message: `Version ${v} is downloading and installs when you quit.` }
    : { available: false, message: 'You are on the latest version.' }
}
