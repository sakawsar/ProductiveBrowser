import { run, log } from './env'
import { dohTemplate } from '../shared/filter'
import type { ContentFilter } from '../shared/types'

/**
 * Blocks the listed sites in other browsers, and forces the content filter's DNS, through their
 * admin-only enterprise policies. This service owns these keys: it replaces the whole blocklist,
 * so entries set by hand are removed.
 * Productive Browser is unaffected because Electron does not read Chrome policies.
 */
const CHROMIUM_KEYS = [
  'HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\URLBlocklist',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist',
  'HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave\\URLBlocklist'
]
const FIREFOX_KEY = 'HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter\\Block'

/** Blocklist entries per browser family. Chromium's "youtube.com" also covers subdomains; Firefox needs patterns. */
export function blocklists(domains: string[]): { chromium: string[]; firefox: string[] } {
  const uniq = [...new Set(domains)].sort()
  return { chromium: uniq, firefox: uniq.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]) }
}

export function policyEntries(domains: string[]): Map<string, string[]> {
  const { chromium, firefox } = blocklists(domains)
  const entries = new Map<string, string[]>()
  for (const key of CHROMIUM_KEYS) entries.set(key, chromium)
  entries.set(FIREFOX_KEY, firefox)
  return entries
}

interface RegValue {
  key: string
  name: string
  type: 'REG_SZ' | 'REG_DWORD'
  /** null removes the value. */
  data: string | null
}

/** DNS-over-HTTPS policies that point other browsers at the content filter, with no fallback. */
export function dnsPolicyValues(filter: ContentFilter | undefined): RegValue[] {
  const template = dohTemplate(filter)
  const values: RegValue[] = []
  for (const root of CHROMIUM_KEYS.map((k) => k.replace(/\\URLBlocklist$/, ''))) {
    values.push({ key: root, name: 'DnsOverHttpsMode', type: 'REG_SZ', data: template ? 'secure' : null })
    values.push({ key: root, name: 'DnsOverHttpsTemplates', type: 'REG_SZ', data: template })
  }
  const ff = 'HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\DNSOverHTTPS'
  values.push({ key: ff, name: 'Enabled', type: 'REG_DWORD', data: template ? '1' : null })
  values.push({ key: ff, name: 'ProviderURL', type: 'REG_SZ', data: template })
  values.push({ key: ff, name: 'Locked', type: 'REG_DWORD', data: template ? '1' : null })
  values.push({ key: ff, name: 'Fallback', type: 'REG_DWORD', data: template ? '0' : null })
  return values
}

async function readValue(key: string, name: string): Promise<string | null> {
  try {
    const { stdout } = await run('reg', ['query', key, '/v', name])
    const m = /\s(REG_SZ|REG_DWORD)\s+(.*)$/m.exec(stdout)
    if (!m) return null
    return m[1] === 'REG_DWORD' ? String(Number(m[2].trim())) : m[2].trim()
  } catch {
    return null
  }
}

async function readList(key: string): Promise<string[]> {
  try {
    const { stdout } = await run('reg', ['query', key])
    return stdout
      .split(/\r?\n/)
      .map((l) => /^\s+(\d+)\s+REG_SZ\s+(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2].trim())
  } catch {
    return []
  }
}

async function writeList(key: string, values: string[]): Promise<void> {
  await run('reg', ['delete', key, '/f']).catch(() => undefined)
  if (values.length === 0) return
  await run('reg', ['add', key, '/f'])
  for (const [i, v] of values.entries()) {
    await run('reg', ['add', key, '/v', String(i + 1), '/t', 'REG_SZ', '/d', v, '/f'])
  }
}

/** Rewrites only what differs, so browsers don't reload policy needlessly. */
export async function applyPolicies(domains: string[], filter: ContentFilter | undefined): Promise<void> {
  for (const v of dnsPolicyValues(filter)) {
    if ((await readValue(v.key, v.name)) === v.data) continue
    try {
      if (v.data === null) await run('reg', ['delete', v.key, '/v', v.name, '/f'])
      else await run('reg', ['add', v.key, '/v', v.name, '/t', v.type, '/d', v.data, '/f'])
      log('policy updated', v.key, v.name)
    } catch (e) {
      log('policy write failed', v.key, v.name, e)
    }
  }
  for (const [key, values] of policyEntries(domains)) {
    const current = await readList(key)
    if (current.join('\n') === values.join('\n')) continue
    try {
      await writeList(key, values)
      log('policy updated', key, values.length)
    } catch (e) {
      log('policy write failed', key, e)
    }
  }
}
