import { describe, expect, it } from 'vitest'
import { links, tracked, windowsName } from '../src/shared/links'

describe('outbound links', () => {
  it('tags CenoDigital links with UTM parameters', () => {
    const u = new URL(links.services('1.2.0'))
    expect(u.origin + u.pathname).toBe('https://cenodigital.com/services')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      utm_source: 'typeshelf',
      utm_medium: 'app',
      utm_campaign: 'services',
      utm_content: 'v1.2.0'
    })
    expect(new URL(links.newsletter()).hash).toBe('#newsletter')
    expect(new URL(tracked('/', 'about')).searchParams.has('utm_content')).toBe(false)
  })

  it('pre-fills the GitHub bug report form', () => {
    const u = new URL(links.bugReport('1.0.0', 'Windows 11'))
    expect(u.pathname).toBe('/aashifahd/typeshelf/issues/new')
    expect(u.searchParams.get('template')).toBe('bug_report.yml')
    expect(u.searchParams.get('version')).toBe('1.0.0')
    expect(u.searchParams.get('os')).toBe('Windows 11')
  })

  it('tells Windows 10 and 11 apart by build number', () => {
    expect(windowsName('10.0.26100')).toBe('Windows 11')
    expect(windowsName('10.0.19045')).toBe('Windows 10')
    expect(windowsName('6.3.9600')).toMatch(/^Other/)
  })
})
