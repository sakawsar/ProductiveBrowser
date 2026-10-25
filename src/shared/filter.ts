import type { ContentFilter } from './types'

/** CleanBrowsing DNS-over-HTTPS filters, from least to most strict. */
export const FILTERS: { id: ContentFilter; name: string; description: string }[] = [
  { id: 'off', name: 'Off', description: 'Normal DNS. Nothing is filtered.' },
  { id: 'security', name: 'Security', description: 'Blocks malware and phishing sites.' },
  { id: 'adult', name: 'Adult', description: 'Also blocks adult content, and turns on SafeSearch in Google and Bing.' },
  { id: 'family', name: 'Family', description: 'Also blocks proxies and VPNs used to get around filters, and puts YouTube in Restricted Mode.' }
]

export const filterRank = (f: ContentFilter | undefined): number => Math.max(0, FILTERS.findIndex((x) => x.id === (f ?? 'off')))

export function dohTemplate(f: ContentFilter | undefined): string | null {
  return !f || f === 'off' ? null : `https://doh.cleanbrowsing.org/doh/${f}-filter/`
}
