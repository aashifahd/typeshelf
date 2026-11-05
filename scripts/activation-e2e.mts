// End-to-end check of real per-user font activation on Windows using the app's
// own Win32 module. Downloads an OFL font that is not installed, activates it,
// verifies Windows lists it, deactivates it, verifies it's gone, cleans up.
// Usage: node scripts/activation-e2e.mts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as win from '../src/main/activation/win32.ts'

const FAMILY = 'Rubik Doodle Shadow'
const NAME = `${FAMILY} (Typeshelf)`

function listed(): boolean {
  const ps = `Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }`
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).split(/\r?\n/).includes(FAMILY)
}

/** Windows updates the font list asynchronously; poll until it matches. */
async function waitFor(expected: boolean, timeoutMs = 15000): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (listed() === expected) return { ok: true, ms: Date.now() - t0 }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { ok: false, ms: timeoutMs }
}

const dir = mkdtempSync(join(tmpdir(), 'typeshelf-e2e-'))
const file = join(dir, 'RubikDoodleShadow-Regular.ttf')
let ok = true
try {
  const list = JSON.parse(
    (await (await fetch(`https://fonts.google.com/download/list?family=${encodeURIComponent(FAMILY)}`)).text()).replace(/^\)\]\}'\s*/, '')
  )
  const ref = list.manifest.fileRefs.find((r: { filename: string }) => r.filename.endsWith('.ttf'))
  writeFileSync(file, Buffer.from(await (await fetch(ref.url)).arrayBuffer()))

  const before = await waitFor(false, 3000)
  console.log(`not installed before test: ${before.ok}`)
  if (!before.ok) throw new Error(`${FAMILY} is already installed; pick another family`)

  // Activate exactly like ActivationManager does for "permanent" mode.
  win.registerUserFont(NAME, file)
  const added = win.addFontResource(file)
  win.broadcastFontChange()
  const reg = (await win.listUserFonts()).get(NAME)
  const on = await waitFor(true)
  console.log(`AddFontResource=${added}  registry=${reg === file}  listed by Windows=${on.ok} (after ${on.ms}ms)`)
  if (!added || reg !== file || !on.ok) ok = false

  // Deactivate.
  win.removeFontResource(file)
  win.unregisterUserFont(NAME)
  win.broadcastFontChange()
  const off = await waitFor(false)
  const regAfter = (await win.listUserFonts()).has(NAME)
  console.log(`after deactivate: registry entry=${regAfter}  still listed=${!off.ok} (checked ${off.ms}ms)`)
  if (regAfter || !off.ok) ok = false
} finally {
  // Safety net: always leave the system clean.
  try {
    win.removeFontResource(file)
    win.unregisterUserFont(NAME)
    win.broadcastFontChange()
  } catch {
    /* already clean */
  }
  rmSync(dir, { recursive: true, force: true })
  console.log('cleanup done, temp font file deleted (Windows released the file)')
}
console.log(ok ? 'ACTIVATION E2E PASS' : 'ACTIVATION E2E FAIL')
process.exit(ok ? 0 : 1)
