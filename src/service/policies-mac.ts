import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './env'
import { blocklists } from './policies'
import { dohTemplate } from '../shared/filter'
import type { ContentFilter } from '../shared/types'

/**
 * macOS version of policies.ts. Chromium browsers read root-owned plists in /Library/Managed Preferences;
 * Firefox reads distribution/policies.json inside its app bundle.
 * The service owns the Chromium plists outright. An MDM profile for the same browser would replace them.
 */
const MANAGED_DIR = '/Library/Managed Preferences'
const CHROMIUM_IDS = ['com.google.Chrome', 'com.microsoft.Edge', 'com.brave.Browser']
const FIREFOX_POLICIES = '/Applications/Firefox.app/Contents/Resources/distribution/policies.json'

type PlistValue = string | number | boolean | string[]

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function value(v: PlistValue): string {
  if (Array.isArray(v)) return `<array>${v.map((x) => `<string>${xml(x)}</string>`).join('')}</array>`
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>'
  if (typeof v === 'number') return `<integer>${v}</integer>`
  return `<string>${xml(v)}</string>`
}

export function plist(dict: Record<string, PlistValue>): string {
  const body = Object.entries(dict)
    .map(([k, v]) => `\t<key>${xml(k)}</key>\n\t${value(v)}`)
    .join('\n')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`
  )
}

/** The managed-preferences dictionary for a Chromium browser, or null when there is nothing to enforce. */
export function chromiumPolicy(domains: string[], filter: ContentFilter | undefined): Record<string, PlistValue> | null {
  const template = dohTemplate(filter)
  const dict: Record<string, PlistValue> = {}
  const { chromium } = blocklists(domains)
  if (chromium.length) dict.URLBlocklist = chromium
  if (template) {
    dict.DnsOverHttpsMode = 'secure'
    dict.DnsOverHttpsTemplates = template
  }
  return Object.keys(dict).length ? dict : null
}

/** Returns Firefox's policies with our keys set or removed, keeping any others. */
export function firefoxPolicies(existing: { policies?: Record<string, unknown> }, domains: string[], filter: ContentFilter | undefined) {
  const policies = { ...(existing.policies ?? {}) }
  const { firefox } = blocklists(domains)
  const template = dohTemplate(filter)
  if (firefox.length) policies.WebsiteFilter = { Block: firefox }
  else delete policies.WebsiteFilter
  if (template) policies.DNSOverHTTPS = { Enabled: true, ProviderURL: template, Locked: true, Fallback: false }
  else delete policies.DNSOverHTTPS
  return { ...existing, policies }
}

function writeIfChanged(path: string, content: string | null): void {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current === content) return
  try {
    if (content === null) rmSync(path, { force: true })
    else writeFileSync(path, content, { mode: 0o644 })
    log('policy updated', path)
  } catch (e) {
    log('policy write failed', path, e)
  }
}

export async function applyMacPolicies(domains: string[], filter: ContentFilter | undefined): Promise<void> {
  mkdirSync(MANAGED_DIR, { recursive: true })
  const dict = chromiumPolicy(domains, filter)
  for (const id of CHROMIUM_IDS) writeIfChanged(join(MANAGED_DIR, `${id}.plist`), dict ? plist(dict) : null)

  // Only when Firefox is installed: creating the folder elsewhere would do nothing.
  if (!existsSync('/Applications/Firefox.app')) return
  let existing = {}
  try {
    existing = JSON.parse(readFileSync(FIREFOX_POLICIES, 'utf8'))
  } catch {
    // Missing or unreadable: start fresh.
  }
  mkdirSync(join(FIREFOX_POLICIES, '..'), { recursive: true })
  writeIfChanged(FIREFOX_POLICIES, JSON.stringify(firefoxPolicies(existing, domains, filter), null, 2) + '\n')
}
