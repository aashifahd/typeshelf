// Direct Win32 calls via koffi (prebuilt FFI, no native compilation needed).
// Per-user font install = HKCU\...\Fonts value pointing at the file + AddFontResourceW.
// This needs no admin rights and is supported on Windows 10 1809+.
import koffi from 'koffi'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const FONTS_KEY = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
// HKEY_CURRENT_USER is (HKEY)(LONG)0x80000001, i.e. sign-extended on x64.
const HKEY_CURRENT_USER = -2147483647
const KEY_SET_VALUE = 0x0002
const KEY_QUERY_VALUE = 0x0001
const REG_SZ = 1
const HWND_BROADCAST = 0xffff
const WM_FONTCHANGE = 0x001d

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any

interface Bindings {
  AddFontResourceW: Fn
  RemoveFontResourceW: Fn
  PostMessageW: Fn
  RegCreateKeyExW: Fn
  RegSetValueExW: Fn
  RegDeleteValueW: Fn
  RegCloseKey: Fn
}

let bindings: Bindings | null = null

function b(): Bindings {
  if (bindings) return bindings
  const gdi32 = koffi.load('gdi32.dll')
  const user32 = koffi.load('user32.dll')
  const advapi32 = koffi.load('advapi32.dll')
  bindings = {
    AddFontResourceW: gdi32.func('int __stdcall AddFontResourceW(const char16_t *name)'),
    RemoveFontResourceW: gdi32.func('int __stdcall RemoveFontResourceW(const char16_t *name)'),
    PostMessageW: user32.func('int __stdcall PostMessageW(intptr_t hWnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)'),
    RegCreateKeyExW: advapi32.func(
      'long __stdcall RegCreateKeyExW(intptr_t hKey, const char16_t *subKey, uint32_t reserved, const char16_t *cls, uint32_t options, uint32_t sam, void *security, _Out_ void **result, _Out_ uint32_t *disposition)'
    ),
    RegSetValueExW: advapi32.func(
      'long __stdcall RegSetValueExW(void *hKey, const char16_t *name, uint32_t reserved, uint32_t type, const uint8_t *data, uint32_t cbData)'
    ),
    RegDeleteValueW: advapi32.func('long __stdcall RegDeleteValueW(void *hKey, const char16_t *name)'),
    RegCloseKey: advapi32.func('long __stdcall RegCloseKey(void *hKey)')
  }
  return bindings
}

function withFontsKey<T>(sam: number, fn: (hKey: unknown) => T): T {
  const out: unknown[] = [null]
  const disp = [0]
  const rc = b().RegCreateKeyExW(HKEY_CURRENT_USER, FONTS_KEY, 0, null, 0, sam, null, out, disp)
  if (rc !== 0) throw new Error(`RegCreateKeyExW failed (${rc})`)
  try {
    return fn(out[0])
  } finally {
    b().RegCloseKey(out[0])
  }
}

/** Load a font into the current session (visible to apps that listen for WM_FONTCHANGE). */
export function addFontResource(path: string): boolean {
  return b().AddFontResourceW(path) > 0
}

export function removeFontResource(path: string): boolean {
  // A file can be added multiple times; remove until the count drops to zero.
  let removed = false
  for (let i = 0; i < 8; i++) {
    if (b().RemoveFontResourceW(path) === 0) break
    removed = true
  }
  return removed
}

export function broadcastFontChange(): void {
  b().PostMessageW(HWND_BROADCAST, WM_FONTCHANGE, 0, 0)
}

export function registerUserFont(valueName: string, path: string): void {
  const data = Buffer.from(path + '\0', 'utf16le')
  withFontsKey(KEY_SET_VALUE, (h) => {
    const rc = b().RegSetValueExW(h, valueName, 0, REG_SZ, data, data.length)
    if (rc !== 0) throw new Error(`RegSetValueExW failed (${rc})`)
  })
}

export function unregisterUserFont(valueName: string): void {
  withFontsKey(KEY_SET_VALUE | KEY_QUERY_VALUE, (h) => {
    const rc = b().RegDeleteValueW(h, valueName)
    // 2 = ERROR_FILE_NOT_FOUND (already gone) is fine.
    if (rc !== 0 && rc !== 2) throw new Error(`RegDeleteValueW failed (${rc})`)
  })
}

/** Read all per-user font registrations: value name -> file path. */
export async function listUserFonts(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { stdout } = await execFileAsync('reg', ['query', `HKCU\\${FONTS_KEY}`], { windowsHide: true })
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}REG_(?:EXPAND_)?SZ\s{4}(.*)$/)
      if (m) map.set(m[1], m[2])
    }
  } catch {
    /* key may not exist yet */
  }
  return map
}
