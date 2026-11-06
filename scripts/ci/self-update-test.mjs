// End-to-end test of the app updating itself (CI only: it installs Typeshelf
// for the current Windows user and then uninstalls it).
//
//   node scripts/ci/self-update-test.mjs <old-installer.exe> <new-release-dir>
//
// 1. Serves <new-release-dir> (latest.yml + installer) on http://127.0.0.1:8765
// 2. Silently installs the old version
// 3. Starts it, asks it to check for updates, waits until the update is downloaded
// 4. Clicks "Restart to update" (installAppUpdate) and waits for Windows to
//    report the new version installed
import { execFileSync, spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, dirname, join } from 'node:path'

const [oldInstaller, newDir] = process.argv.slice(2)
if (!oldInstaller || !newDir) throw new Error('usage: self-update-test.mjs <old-installer.exe> <new-release-dir>')
const newVersion = /version:\s*(\S+)/.exec(readFileSync(join(newDir, 'latest.yml'), 'utf8'))[1]
const PORT = 8765
const DEBUG_PORT = 9339
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[self-update ${new Date().toISOString().slice(11, 19)}]`, ...a)

async function waitFor(what, fn, timeoutMs, everyMs = 2000) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${what}`)
    await sleep(everyMs)
  }
}

function installed() {
  const ps = `Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Typeshelf*' } | Select-Object DisplayVersion, InstallLocation, UninstallString | ConvertTo-Json -Compress`
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()
  if (!out) return null
  const i = JSON.parse(out)
  // electron-builder doesn't set InstallLocation; the uninstaller sits in the install folder.
  const uninstaller = /^"([^"]+)"/.exec(i.UninstallString ?? '')?.[1]
  return { ...i, InstallLocation: i.InstallLocation || (uninstaller ? dirname(uninstaller) : null) }
}

// ---- 1. update server
const server = createServer((req, res) => {
  const file = join(newDir, basename(decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end()
    return
  }
  log('served', basename(file))
  res.writeHead(200, { 'Content-Length': statSync(file).size })
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

let exitCode = 1
try {
  // ---- 2. install the old version
  log('installing', basename(oldInstaller))
  execFileSync(oldInstaller, ['/S'], { stdio: 'inherit' })
  const before = await waitFor('the old version to be registered', async () => installed(), 60_000)
  log('installed version', before.DisplayVersion, 'at', before.InstallLocation)
  if (before.DisplayVersion === newVersion) throw new Error('old and new versions are the same')

  // ---- 3. start it and let it download the update
  const exe = join(before.InstallLocation, 'Typeshelf.exe')
  spawn(exe, [`--remote-debugging-port=${DEBUG_PORT}`], { detached: true, stdio: 'ignore' }).unref()
  const page = await waitFor(
    'the app window',
    async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('index.html')),
    60_000
  )
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id)
  }
  const evaluate = (expression) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, (msg) => resolve(msg.result?.result?.value))
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  await waitFor('the preload API', () => evaluate('typeof window.typeshelf === "object"'), 30_000, 500)

  log('checking for updates:', JSON.stringify(await evaluate('window.typeshelf.checkAppUpdate()')))
  const ready = await waitFor(
    'the update to download',
    async () => {
      const s = await evaluate('window.typeshelf.getAppUpdateState()')
      log('state', JSON.stringify(s))
      if (s?.status === 'error') throw new Error(`update error: ${s.message}`)
      return s?.status === 'ready' ? s : undefined
    },
    180_000,
    3000
  )
  if (ready.version !== newVersion) throw new Error(`downloaded ${ready.version}, expected ${newVersion}`)

  // ---- 4. restart to update
  log('restart to update')
  void evaluate('window.typeshelf.installAppUpdate()').catch(() => undefined)
  const after = await waitFor(
    `Windows to report version ${newVersion}`,
    async () => {
      const i = installed()
      return i?.DisplayVersion === newVersion ? i : undefined
    },
    240_000,
    3000
  )
  const exeVersion = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${join(after.InstallLocation, 'Typeshelf.exe')}').VersionInfo.ProductVersion`], {
    encoding: 'utf8'
  }).trim()
  log('installed version is now', after.DisplayVersion, '- exe version', exeVersion)
  if (!exeVersion.startsWith(newVersion)) throw new Error(`exe reports ${exeVersion}`)
  log('SELF-UPDATE PASS')
  exitCode = 0
} catch (e) {
  console.error('SELF-UPDATE FAIL', e)
} finally {
  server.close()
  try {
    execFileSync('taskkill', ['/IM', 'Typeshelf.exe', '/F'], { stdio: 'ignore' })
  } catch {
    /* not running */
  }
  const i = installed()
  if (i?.UninstallString) {
    const m = /^"([^"]+)"/.exec(i.UninstallString)
    if (m) execFileSync(m[1], ['/S', '/currentuser'], { stdio: 'ignore' })
  }
}
process.exit(exitCode)
