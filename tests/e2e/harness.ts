// Shared helpers for the end-to-end tests.
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(__dirname, '../..')
export const FIXTURES = join(ROOT, 'tests', 'fixtures', 'fonts')
export const isWindows = process.platform === 'win32'

export interface Running {
  app: ElectronApplication
  page: Page
  userData: string
  /** Console errors and uncaught page errors seen so far. */
  errors: string[]
}

export function newUserData(): string {
  return mkdtempSync(join(tmpdir(), 'typeshelf-e2e-'))
}

/** Launches the built app (out/) with an isolated data folder. */
export async function launch(userData = newUserData(), env: Record<string, string> = {}): Promise<Running> {
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>), ...env }
  delete childEnv.ELECTRON_RENDERER_URL // always load the built page, never a dev server
  delete childEnv.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [ROOT, `--user-data-dir=${userData}`],
    cwd: ROOT,
    env: childEnv,
    timeout: 60_000
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('nav.sidebar')).toBeVisible()
  return { app, page, userData, errors }
}

/** Quits the app properly (runs before-quit, flushes stores). */
export async function quit(r: Running): Promise<void> {
  await r.app.evaluate(({ app }) => app.quit()).catch(() => undefined)
  await r.app.close().catch(() => undefined)
}

export function removeUserData(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

// ---------------------------------------------------------------- UI helpers

export function navItem(page: Page, label: string): Locator {
  return page.locator('nav.sidebar .nav-item', { has: page.locator('.label', { hasText: new RegExp(`^${escape(label)}$`) }) })
}

export function familyRow(page: Page, name: string): Locator {
  return page.locator(`.list [role="listitem"][aria-label="${name}"]`)
}

export async function search(page: Page, text: string): Promise<void> {
  const box = page.getByPlaceholder(/Search fonts/)
  await box.fill(text)
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Makes the next "choose folder/files" dialog return `paths` without showing it. */
export async function stubOpenDialog(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    const original = dialog.showOpenDialog
    ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => {
      ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = original
      return { canceled: false, filePaths: p }
    }
  }, paths)
}

/** Accept the next window.confirm() in the page. */
export async function acceptNextConfirm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = window.confirm
    window.confirm = () => {
      window.confirm = original
      return true
    }
  })
}

// ---------------------------------------------------------------- Fixtures

/** Copies the test font into a fresh folder and returns that folder. */
export function fixtureFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'typeshelf-e2e-fonts-'))
  copyFileSync(join(FIXTURES, 'Silkscreen-Regular.ttf'), join(dir, 'Silkscreen-Regular.ttf'))
  copyFileSync(join(FIXTURES, 'OFL.txt'), join(dir, 'OFL.txt'))
  return dir
}

// ---------------------------------------------------------------- Windows state

const FONTS_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'

/** Typeshelf registry entries (name → path) whose name contains `match`. */
export function typeshelfRegistryEntries(match: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!isWindows) return out
  const text = execFileSync('reg', ['query', FONTS_KEY], { encoding: 'utf8', windowsHide: true })
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s{4}(.+?)\s{4}REG_\w+\s{4}(.*)$/.exec(line)
    if (m && m[1].endsWith('(Typeshelf)') && m[1].toLowerCase().includes(match.toLowerCase())) out.set(m[1], m[2])
  }
  return out
}

/** Safety net: remove any Typeshelf registry entry for `match` left by a failed test. */
export function cleanRegistry(match: string): void {
  for (const name of typeshelfRegistryEntries(match).keys()) {
    try {
      execFileSync('reg', ['delete', FONTS_KEY, '/v', name, '/f'], { windowsHide: true })
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------- Stored data

export function readJson<T>(userData: string, file: string): T {
  return JSON.parse(readFileSync(join(userData, file), 'utf8')) as T
}

export function writeJson(userData: string, file: string, data: unknown): void {
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, file), JSON.stringify(data))
}
