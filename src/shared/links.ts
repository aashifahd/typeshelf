// Outbound links. cenodigital.com URLs use the site's canonical trailing-slash
// form, so there's no redirect hop. They carry UTM tags so visits from the app
// show up as source "typeshelf" in analytics (and as a lead source in the CRM).
// Nothing is sent anywhere until the user clicks a link.

export const WEBSITE = 'https://cenodigital.com'
export const REPO = 'https://github.com/aashifahd/typeshelf'

export type LinkPlace = 'about' | 'services' | 'newsletter' | 'installer'

export function tracked(path: string, campaign: LinkPlace, version?: string): string {
  const u = new URL(path, WEBSITE)
  u.searchParams.set('utm_source', 'typeshelf')
  u.searchParams.set('utm_medium', 'app')
  u.searchParams.set('utm_campaign', campaign)
  if (version) u.searchParams.set('utm_content', `v${version}`)
  return u.toString()
}

export const links = {
  credit: (v?: string) => tracked('/', 'about', v),
  services: (v?: string) => tracked('/services/', 'services', v),
  newsletter: (v?: string) => tracked('/typeshelf/#newsletter', 'newsletter', v),
  source: () => REPO,
  /** Pre-filled GitHub issue form (field ids match .github/ISSUE_TEMPLATE/bug_report.yml). */
  bugReport: (version: string, windows: string) => {
    const u = new URL(`${REPO}/issues/new`)
    u.searchParams.set('template', 'bug_report.yml')
    u.searchParams.set('version', version)
    u.searchParams.set('os', windows)
    return u.toString()
  }
}

/** Windows 11 reports itself as 10.0 with build 22000 or later. */
export function windowsName(osRelease: string): string {
  const [major, , build] = osRelease.split('.').map((n) => parseInt(n, 10))
  if (major !== 10) return 'Other (please say in the description)'
  return build >= 22000 ? 'Windows 11' : 'Windows 10'
}
