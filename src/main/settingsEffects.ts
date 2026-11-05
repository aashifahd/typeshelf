import { app, BrowserWindow, nativeTheme } from 'electron'
import type { Settings } from '@shared/types'
import { settingsStore } from './state'
import { rescheduleUpdates } from './fontUpdates'

export function overlayColors(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors
  return { color: '#00000000', symbolColor: dark ? '#c9cbd3' : '#3a3d47', height: 44 }
}

export function applyTitleBar(): void {
  if (process.platform !== 'win32') return
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.setTitleBarOverlay(overlayColors())
    } catch {
      /* window without overlay */
    }
  }
}

export function applySettingsSideEffects(changed: Partial<Settings>, initial = false): void {
  const s = settingsStore.get()
  if (initial || changed.theme !== undefined) {
    nativeTheme.themeSource = s.theme
    applyTitleBar()
  }
  if ((initial || changed.launchAtLogin !== undefined) && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] })
  }
  if (!initial && changed.updateCheckHours !== undefined) rescheduleUpdates()
}
