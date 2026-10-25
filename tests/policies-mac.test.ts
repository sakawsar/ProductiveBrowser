import { describe, expect, it } from 'vitest'
import { chromiumPolicy, firefoxPolicies, plist } from '../src/service/policies-mac'

describe('macOS policies', () => {
  it('builds the Chromium managed-preferences plist', () => {
    const dict = chromiumPolicy(['youtube.com', 'x.com'], 'family')
    expect(dict).toEqual({
      URLBlocklist: ['x.com', 'youtube.com'],
      DnsOverHttpsMode: 'secure',
      DnsOverHttpsTemplates: 'https://doh.cleanbrowsing.org/doh/family-filter/'
    })
    const xml = plist(dict!)
    expect(xml).toContain('<key>URLBlocklist</key>\n\t<array><string>x.com</string><string>youtube.com</string></array>')
    expect(xml).toContain('<key>DnsOverHttpsMode</key>\n\t<string>secure</string>')
  })

  it('removes the plist when there is nothing to enforce', () => {
    expect(chromiumPolicy([], 'off')).toBeNull()
  })

  it('escapes XML', () => {
    expect(plist({ a: 'x<y&z' })).toContain('<string>x&lt;y&amp;z</string>')
  })

  it("sets Firefox's keys and keeps others", () => {
    const out = firefoxPolicies({ policies: { DisableTelemetry: true } }, ['youtube.com'], 'adult')
    expect(out.policies).toEqual({
      DisableTelemetry: true,
      WebsiteFilter: { Block: ['*://youtube.com/*', '*://*.youtube.com/*'] },
      DNSOverHTTPS: { Enabled: true, ProviderURL: 'https://doh.cleanbrowsing.org/doh/adult-filter/', Locked: true, Fallback: false }
    })
    expect(firefoxPolicies(out, [], 'off').policies).toEqual({ DisableTelemetry: true })
  })
})
