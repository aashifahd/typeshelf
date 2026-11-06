// Google Fonts install → automatic update → rollback, against the real service.
// Uses the official API when GOOGLE_FONTS_API_KEY is set (CI), otherwise the
// keyless fallback. Needs network access.
import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { acceptNextConfirm, familyRow, launch, navItem, newUserData, quit, readJson, removeUserData, search, writeJson, type Running } from './harness'
import type { InstalledProviderFamily } from '../../src/shared/types'

const FAMILY = 'Silkscreen'
const OLD = '2000-01-01'

type Providers = { installed: InstalledProviderFamily[]; updates: unknown[] }
/** The stored record, or undefined until the app has saved it (saves are slightly delayed). */
const record = (userData: string): InstalledProviderFamily | undefined => {
  try {
    return readJson<Providers>(userData, 'providers.json').installed.find((i) => i.key === FAMILY)
  } catch {
    return undefined
  }
}

test.describe.serial('Google Fonts: install, auto-update, roll back', () => {
  const userData = newUserData()
  let r: Running
  let currentVersion = ''

  test.afterAll(async () => {
    if (r) await quit(r)
    removeUserData(userData)
  })

  test('installs a family from the catalogue', async () => {
    r = await launch(userData)
    const { page } = r
    await navItem(page, 'Google Fonts').last().click()
    await page.getByLabel('Search catalog').fill(FAMILY)
    const row = familyRow(page, FAMILY)
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('button', { name: 'Install' }).click()
    await expect(row.getByText(/^Installed · /)).toBeVisible({ timeout: 60_000 })

    await expect.poll(() => record(userData)?.version ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const rec = record(userData)!
    expect(rec.files.length).toBeGreaterThan(0)
    for (const f of rec.files) expect(existsSync(f)).toBe(true)
    currentVersion = rec.version

    // It also shows up in the library under the Google Fonts folder.
    await navItem(page, 'All fonts').click()
    await search(page, FAMILY)
    await expect(familyRow(page, FAMILY)).toBeVisible()
    expect(r.errors).toEqual([])
    await quit(r)
  })

  test('updates an out-of-date family automatically after launch', async () => {
    // Pretend the installed copy is old and the last check was long ago.
    const providers = readJson<Providers>(userData, 'providers.json')
    providers.installed.find((i) => i.key === FAMILY)!.version = OLD
    providers.updates = []
    writeJson(userData, 'providers.json', providers)
    const settings = readJson<Record<string, unknown>>(userData, 'settings.json')
    settings.lastUpdateCheck = 0
    writeJson(userData, 'settings.json', settings)

    r = await launch(userData)
    // The scheduler checks 20 s after launch when a check is overdue, then installs.
    await expect.poll(() => record(userData)?.version, { timeout: 90_000, intervals: [2000] }).toBe(currentVersion)
    const rec = record(userData)!
    expect(rec.previousVersion).toBe(OLD)
    for (const f of rec.files) expect(existsSync(f)).toBe(true)

    await navItem(r.page, 'Font updates').click()
    const row = r.page.locator('tr', { hasText: FAMILY })
    await expect(row).toContainText(currentVersion)
  })

  test('rolls back to the previous version and pauses updates', async () => {
    const { page } = r
    const row = page.locator('tr', { hasText: FAMILY })
    await row.getByRole('button', { name: /Roll back/ }).click()
    await expect(row).toContainText(OLD)
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false') // auto-update paused
    await expect.poll(() => record(userData)?.version).toBe(OLD)
    const rec = record(userData)!
    expect(rec.pinned).toBe(true)
    for (const f of rec.files) expect(existsSync(f)).toBe(true)
    expect(r.errors).toEqual([])
  })

  test('uninstalls the family', async () => {
    // Uninstall moves files to the Recycle Bin, so only run it on CI machines.
    test.skip(!process.env.CI && !process.env.E2E_UNINSTALL, 'moves files to the Recycle Bin; CI only (or set E2E_UNINSTALL=1)')
    const { page } = r
    const dir = record(userData)!.dir
    await navItem(page, 'Google Fonts').last().click()
    await page.getByLabel('Search catalog').fill(FAMILY)
    const row = familyRow(page, FAMILY)
    await acceptNextConfirm(page)
    await row.getByRole('button', { name: 'Installed family actions' }).click()
    await page.getByRole('menu').getByRole('button', { name: /Uninstall/ }).click()
    await expect(row.getByRole('button', { name: 'Install' })).toBeVisible()
    await expect.poll(() => record(userData)).toBeUndefined()

    // Gone from the library straight away, even if a locked file had to wait.
    await navItem(page, 'All fonts').click()
    await search(page, FAMILY)
    await expect(familyRow(page, FAMILY)).toHaveCount(0)

    // Anything that was locked is deleted on the next start.
    await quit(r)
    r = await launch(userData)
    await expect.poll(() => existsSync(dir)).toBe(false)
    await expect
      .poll(() => readJson<{ pendingDelete?: string[] }>(userData, 'providers.json').pendingDelete ?? [])
      .toEqual([])
    expect(r.errors).toEqual([])
  })
})
