import { contextBridge, ipcRenderer } from 'electron'
import type { TypeshelfApi, TypeshelfEvents } from '../shared/types'

const METHODS = [
  'appInfo',
  'getLibrary',
  'rescan',
  'addFolder',
  'removeSource',
  'activate',
  'deactivate',
  'getGlyphs',
  'revealFile',
  'openExternal',
  'exportFaces',
  'importFiles',
  'getSettings',
  'setSettings',
  'getCollections',
  'saveCollection',
  'deleteCollection',
  'getCatalog',
  'getPreviewCss',
  'getInstalledProviderFamilies',
  'installFamily',
  'uninstallFamily',
  'setFamilyPinned',
  'checkFontUpdates',
  'getFontUpdates',
  'applyFontUpdates',
  'rollbackFamily',
  'checkAppUpdate'
] as const

const EVENTS: (keyof TypeshelfEvents)[] = ['library:changed', 'scan:progress', 'updates:changed', 'toast', 'install:progress']

const api: Record<string, unknown> = {}
for (const m of METHODS) {
  api[m] = (...args: unknown[]) => ipcRenderer.invoke(`ts:${m}`, ...args)
}
api.on = (event: keyof TypeshelfEvents, cb: (payload: unknown) => void) => {
  if (!EVENTS.includes(event)) throw new Error(`Unknown event ${event}`)
  const listener = (_: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on(`ts:event:${event}`, listener)
  return () => ipcRenderer.removeListener(`ts:event:${event}`, listener)
}

contextBridge.exposeInMainWorld('typeshelf', api as unknown as TypeshelfApi)
