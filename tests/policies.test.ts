import { describe, expect, it } from 'vitest'
import { dnsPolicyValues, policyEntries } from '../src/service/policies'

describe('policyEntries', () => {
  it('blocks each domain once in every browser', () => {
    const e = policyEntries(['youtube.com', 'youtu.be', 'youtube.com'])
    expect(e.get('HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\URLBlocklist')).toEqual(['youtu.be', 'youtube.com'])
    expect(e.get('HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter\\Block')).toEqual([
      '*://youtu.be/*', '*://*.youtu.be/*', '*://youtube.com/*', '*://*.youtube.com/*'
    ])
  })
})

describe('dnsPolicyValues', () => {
  it('forces the filter DNS in other browsers', () => {
    const v = dnsPolicyValues('family')
    expect(v).toContainEqual({ key: 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome', name: 'DnsOverHttpsMode', type: 'REG_SZ', data: 'secure' })
    expect(v).toContainEqual({
      key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'DnsOverHttpsTemplates', type: 'REG_SZ',
      data: 'https://doh.cleanbrowsing.org/doh/family-filter/'
    })
    expect(v).toContainEqual({ key: 'HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\DNSOverHTTPS', name: 'Fallback', type: 'REG_DWORD', data: '0' })
  })
  it('removes every value when off', () => {
    expect(dnsPolicyValues('off').every((x) => x.data === null)).toBe(true)
  })
})
