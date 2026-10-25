/** Normalizes user input like "https://www.YouTube.com/feed" to "youtube.com". */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0]
  return d.replace(/^www\./, '').replace(/\.$/, '')
}

/** True when `hostname` is `domain` or one of its subdomains. */
export function hostMatches(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return h === domain || h.endsWith('.' + domain)
}

export function matchSite<T extends { domains: string[] }>(hostname: string, sites: T[]): T | undefined {
  return sites.find((s) => s.domains.some((d) => hostMatches(hostname, d)))
}

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:' || u.protocol === 'wss:' ? u.hostname : null
  } catch {
    return null
  }
}
