import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, nativeTheme, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import log from './log'
import { registerFontScheme, handleFontScheme, invalidateFontCache } from './fontProtocol'
import { library } from './library'
import { activation } from './activation'
import { registerIpc, send, toast } from './ipc'
import { flushAll, settingsStore } from './state'
import { scanPool } from './scanner/pool'
import { setUpdateEmitter, startUpdateScheduler, checkForUpdates, applyUpdates, purgePendingDeletes } from './fontUpdates'
import { initAppUpdater } from './appUpdater'
import { applySettingsSideEffects, applyTitleBar, overlayColors } from './settingsEffects'
import iconPath from '../../build/icon.png?asset'

const SMOKE = process.argv.includes('--smoke')
/** Run by the uninstaller: turn off all fonts Typeshelf activated, then exit. */
const DEACTIVATE_ALL = process.argv.includes('--deactivate-all-fonts')
const STARTED_HIDDEN = process.argv.includes('--hidden') || settingsStore.get().startMinimized

if (!SMOKE && !DEACTIVATE_ALL && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('com.cenodigital.typeshelf')
registerFontScheme()

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

process.on('uncaughtException', (e) => log.error('uncaught', e))
process.on('unhandledRejection', (e) => log.error('unhandled rejection', e))

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Typeshelf',
    icon: iconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14151a' : '#f6f6f8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? overlayColors() : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  w.once('ready-to-show', () => {
    if (!STARTED_HIDDEN || SMOKE) w.show()
  })

  // Never navigate away from the app or open new windows inside it.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (url !== w.webContents.getURL()) e.preventDefault()
  })

  w.on('close', (e) => {
    if (!quitting && settingsStore.get().minimizeToTray && !SMOKE) {
      e.preventDefault()
      w.hide()
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function showWindow(): void {
  if (!win || win.isDestroyed()) win = createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(): void {
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(img)
  tray.setToolTip('Typeshelf')
  const menu = Menu.buildFromTemplate([
    { label: 'Open Typeshelf', click: showWindow },
    { type: 'separator' },
    {
      label: 'Check for font updates',
      click: async () => {
        const u = await checkForUpdates()
        if (u.length && settingsStore.get().autoInstallUpdates) await applyUpdates()
        else if (!u.length) toast('info', 'All installed fonts are up to date')
      }
    },
    { label: 'Rescan library', click: () => void library.scan() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
}

async function runSmokeTest(): Promise<void> {
  // Used by `npm run smoke`: load, scan, screenshot, exit with status.
  const out = process.env.SMOKE_OUT ?? join(app.getPath('temp'), 'typeshelf-smoke.png')
  try {
    await library.scan()
    await new Promise((r) => setTimeout(r, 4000))
    const img = await win!.webContents.capturePage()
    writeFileSync(out, img.toPNG())
    const snap = library.snapshot()
    console.log(`SMOKE OK faces=${snap.faces.length} broken=${snap.broken.length} screenshot=${out}`)
    app.exit(0)
  } catch (e) {
    console.error('SMOKE FAIL', e)
    app.exit(1)
  }
}

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
  if (DEACTIVATE_ALL) {
    try {
      const n = await activation.deactivateAll()
      log.info(`uninstall: turned off ${n} font file(s)`)
      flushAll()
      app.exit(0)
    } catch (e) {
      log.error('uninstall: turning off fonts failed', e)
      app.exit(1)
    }
    return
  }
  Menu.setApplicationMenu(null)
  applySettingsSideEffects({}, true)
  nativeTheme.on('updated', applyTitleBar)
  handleFontScheme()

  library.init()
  library.onChange((snap) => {
    invalidateFontCacheIfNeeded()
    send('library:changed', snap)
  })
  library.onProgress((p) => send('scan:progress', p))
  library.onHotReload = (names) => toast('success', `Reloaded updated font${names.length > 1 ? 's' : ''}: ${names.slice(0, 3).join(', ')}`)

  setUpdateEmitter({
    updates: (u) => send('updates:changed', u),
    toast,
    progress: (p) => send('install:progress', p)
  })

  registerIpc(
    () => win,
    () => {
      quitting = true // let the window close instead of hiding to the tray
    }
  )
  await activation.init().catch((e) => log.error('activation init failed', e))

  win = createWindow()
  if (!SMOKE) createTray()

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => void runSmokeTest())
    return
  }
  await purgePendingDeletes().catch((e) => log.error('purging pending deletes failed', e))
  void library.scan()
  startUpdateScheduler()
  initAppUpdater((s) => {
    send('appUpdate:changed', s)
    if (s.status === 'ready') {
      toast('success', `Typeshelf ${s.version} is ready. Restart from Settings → About, or it installs when you quit.`)
      if (Notification.isSupported())
        new Notification({ title: `Typeshelf ${s.version} is ready`, body: 'It installs the next time Typeshelf quits.' }).show()
    }
  })
})

let lastFaceCount = -1
function invalidateFontCacheIfNeeded(): void {
  const n = library.snapshot().faces.length
  if (n !== lastFaceCount) {
    lastFaceCount = n
    invalidateFontCache()
  }
}

app.on('before-quit', () => {
  quitting = true
  try {
    activation.shutdown()
  } catch (e) {
    log.error('shutdown deactivate failed', e)
  }
  library.dispose()
  scanPool.dispose()
  flushAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !settingsStore.get().minimizeToTray) app.quit()
})

app.on('activate', showWindow)
