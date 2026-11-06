import { expect, test } from '@playwright/test'
import {
  acceptNextConfirm,
  cleanRegistry,
  familyRow,
  fixtureFolder,
  isWindows,
  launch,
  navItem,
  newUserData,
  quit,
  readJson,
  removeUserData,
  ROOT,
  search,
  stubOpenDialog,
  typeshelfRegistryEntries,
  type Running
} from './harness'

test.describe('library', () => {
  let r: Running

  test.beforeAll(async () => {
    r = await launch()
  })
  test.afterAll(async () => {
    await quit(r)
    removeUserData(r.userData)
  })

  test('starts and lists the installed fonts', async () => {
    const { page } = r
    await expect(page.locator('.list [role="listitem"]').first()).toBeVisible()
    const count = Number(await navItem(page, 'All fonts').locator('.count').innerText())
    expect(count).toBeGreaterThan(20)
    await expect(page.getByRole('heading', { name: /^All fonts/ })).toBeVisible()
  })

  test('search narrows the list and puts name matches first', async () => {
    const { page } = r
    const all = Number(await navItem(page, 'All fonts').locator('.count').innerText())
    await search(page, 'Segoe UI')
    const rows = page.locator('.list [role="listitem"]')
    await expect(rows.first()).toHaveAttribute('aria-label', /^Segoe UI/)
    const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
    expect(labels.length).toBeLessThan(all)
    // Families named "Segoe UI…" come before ones that only match on designer credits.
    const firstOther = labels.findIndex((l) => !l.toLowerCase().includes('segoe ui'))
    if (firstOther >= 0) expect(labels.slice(firstOther).every((l) => !l.toLowerCase().includes('segoe ui'))).toBe(true)
    await search(page, '')
  })

  test('family detail tabs all render', async () => {
    const { page } = r
    await search(page, 'Segoe UI')
    await familyRow(page, 'Segoe UI').click()
    await expect(page.locator('.detail')).toBeVisible()

    await page.getByRole('tab', { name: 'Type tester' }).click()
    await expect(page.getByLabel('Type tester, editable')).toBeVisible()
    await page.getByRole('slider', { name: 'Size' }).fill('96')

    await page.getByRole('tab', { name: 'Glyphs' }).click()
    await page.getByLabel('Search glyphs').fill('U+0041')
    await expect(page.locator('.detail-body').getByText('A', { exact: true }).first()).toBeVisible()

    await page.getByRole('tab', { name: 'Info' }).click()
    await expect(page.locator('.detail-body table').first()).toBeVisible()

    await page.getByRole('tab', { name: 'CSS' }).click()
    await expect(page.locator('.detail-body')).toContainText('@font-face')

    await page.getByLabel('Back to list').click()
    await search(page, '')
  })

  test('favourites a family', async () => {
    const { page } = r
    await search(page, 'Segoe UI')
    const row = familyRow(page, 'Segoe UI')
    await row.hover()
    await row.getByRole('button', { name: 'Add to favorites' }).click()
    await expect(navItem(page, 'Favorites').locator('.count')).toHaveText('1')
    await row.hover()
    await row.getByRole('button', { name: 'Remove from favorites' }).click()
    await expect(navItem(page, 'Favorites').locator('.count')).toHaveText('0')
    await search(page, '')
  })

  test('no errors in the window', async () => {
    expect(r.errors).toEqual([])
  })
})

test.describe('font folders and activation', () => {
  test.skip(!isWindows, 'activation uses the Windows font registry')
  let r: Running
  let folder: string

  test.beforeAll(async () => {
    cleanRegistry('Silkscreen')
    folder = fixtureFolder()
    r = await launch()
  })
  test.afterAll(async () => {
    await quit(r)
    cleanRegistry('Silkscreen')
    removeUserData(r.userData)
    removeUserData(folder)
  })

  test('adds a folder and finds its fonts', async () => {
    const { app, page } = r
    await stubOpenDialog(app, [folder])
    await page.getByRole('button', { name: 'Add folder' }).first().click()
    await search(page, 'Silkscreen')
    await expect(familyRow(page, 'Silkscreen')).toBeVisible()
  })

  test('activates and deactivates a font in Windows', async () => {
    const { page } = r
    const row = familyRow(page, 'Silkscreen')
    await row.getByRole('switch', { name: 'Activate' }).click()
    await expect(row.getByRole('switch', { name: 'Deactivate' })).toHaveAttribute('aria-checked', 'true')

    const entries = typeshelfRegistryEntries('Silkscreen')
    expect(entries.size).toBe(1)
    expect([...entries.values()][0].toLowerCase()).toContain(folder.toLowerCase())
    const stored = readJson<{ records: Record<string, { mode: string }> }>(r.userData, 'activations.json')
    expect(Object.values(stored.records).some((x) => x.mode === 'permanent')).toBe(true)

    await row.getByRole('switch', { name: 'Deactivate' }).click()
    await expect(row.getByRole('switch', { name: 'Activate' })).toHaveAttribute('aria-checked', 'false')
    expect(typeshelfRegistryEntries('Silkscreen').size).toBe(0)
  })

  test('session activation is removed when the app quits', async () => {
    const { page } = r
    await navItem(page, 'Settings').click()
    await page.getByLabel('Activation mode').selectOption('session')
    await navItem(page, 'All fonts').click()
    await search(page, 'Silkscreen')
    await familyRow(page, 'Silkscreen').getByRole('switch', { name: 'Activate' }).click()
    await expect.poll(() => typeshelfRegistryEntries('Silkscreen').size).toBe(0) // session fonts aren't registered
    await expect(familyRow(page, 'Silkscreen').getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    await quit(r)
    // (The store may also hold fonts adopted from this PC's registry; only check ours.)
    const stored = readJson<{ records: Record<string, { mode: string }> }>(r.userData, 'activations.json')
    expect(Object.keys(stored.records).filter((k) => k.includes('silkscreen'))).toEqual([])
    expect(Object.values(stored.records).filter((x) => x.mode === 'session')).toEqual([])
    r = await launch(r.userData) // reopen for afterAll
  })

  test('removing the folder keeps the files', async () => {
    const { page } = r
    await acceptNextConfirm(page)
    const folderItem = navItem(page, folder.split(/[\\/]/).pop()!)
    await folderItem.hover()
    await folderItem.getByRole('button', { name: /^Remove folder / }).click()
    await search(page, 'Silkscreen')
    await expect(familyRow(page, 'Silkscreen')).toHaveCount(0)
    const { existsSync } = await import('node:fs')
    expect(existsSync(`${folder}\\Silkscreen-Regular.ttf`)).toBe(true)
  })
})

test.describe('settings', () => {
  test('theme choice survives a restart', async () => {
    const userData = newUserData()
    let r = await launch(userData)
    await navItem(r.page, 'Settings').click()
    await r.page.getByLabel('Theme').selectOption('light')
    await expect(r.page.locator('html')).toHaveAttribute('data-theme', 'light')
    await quit(r)

    r = await launch(userData)
    await expect(r.page.locator('html')).toHaveAttribute('data-theme', 'light')
    await navItem(r.page, 'Settings').click()
    await expect(r.page.getByLabel('Theme')).toHaveValue('light')
    expect(r.errors).toEqual([])
    await quit(r)
    removeUserData(userData)
  })
})

test.describe('uninstaller cleanup', () => {
  // --deactivate-all-fonts turns off *every* Typeshelf font on the machine, so it
  // only runs on disposable CI machines, never on a developer's PC.
  test.skip(!isWindows || !process.env.CI, 'turns off all Typeshelf fonts on this PC; CI only')

  test('--deactivate-all-fonts turns off activated fonts and exits', async () => {
    const folder = fixtureFolder()
    const r = await launch()
    await stubOpenDialog(r.app, [folder])
    await r.page.getByRole('button', { name: 'Add folder' }).first().click()
    await search(r.page, 'Silkscreen')
    await familyRow(r.page, 'Silkscreen').getByRole('switch', { name: 'Activate' }).click()
    await expect.poll(() => typeshelfRegistryEntries('Silkscreen').size).toBe(1)
    await quit(r)

    const { spawnSync } = await import('node:child_process')
    const electronPath = (await import('electron')).default as unknown as string
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const res = spawnSync(electronPath, [ROOT, `--user-data-dir=${r.userData}`, '--deactivate-all-fonts'], { env, timeout: 60_000 })
    expect(res.status).toBe(0)
    expect(typeshelfRegistryEntries('Silkscreen').size).toBe(0)
    const stored = readJson<{ records: Record<string, unknown> }>(r.userData, 'activations.json')
    expect(Object.keys(stored.records)).toHaveLength(0)
    removeUserData(r.userData)
    removeUserData(folder)
  })
})
