import { describe, expect, it } from 'vitest'
import { evaluate, evaluateSite, inWindowsAt, isStricter, validateConfig } from '../src/shared/rules'
import { hostMatches, matchSite, normalizeDomain } from '../src/shared/domains'
import type { Config, Site } from '../src/shared/types'

const site = (over: Partial<Site> = {}): Site => ({
  id: 'yt', name: 'YouTube', domains: ['youtube.com'], dailyMinutes: 30, windows: [], ...over
})
const config = (sites: Site[], lockUntil = '2030-01-01T00:00:00.000Z'): Config => ({
  version: 1, sites, lockUntil, createdAt: '2026-01-01T00:00:00.000Z'
})
// Monday 2026-10-26, local time
const at = (h: number, m = 0, day = 26): Date => new Date(2026, 9, day, h, m)
const evening = [{ days: [1, 2, 3, 4, 5], start: '20:00', end: '21:00' }]

describe('domains', () => {
  it('matches subdomains but not lookalikes', () => {
    expect(hostMatches('m.youtube.com', 'youtube.com')).toBe(true)
    expect(hostMatches('youtube.com', 'youtube.com')).toBe(true)
    expect(hostMatches('notyoutube.com', 'youtube.com')).toBe(false)
    expect(matchSite('www.youtube.com', [site()])?.id).toBe('yt')
  })
  it('normalizes pasted URLs', () => {
    expect(normalizeDomain('https://www.YouTube.com/feed?x=1')).toBe('youtube.com')
  })
})

describe('windows', () => {
  it('handles windows that cross midnight', () => {
    const late = [{ days: [5], start: '23:00', end: '01:00' }] // Friday night
    expect(inWindowsAt(late, 5, 23 * 60 + 30)).toBe(true)
    expect(inWindowsAt(late, 6, 30)).toBe(true) // Saturday 00:30
    expect(inWindowsAt(late, 6, 90)).toBe(false)
    expect(inWindowsAt(late, 5, 30)).toBe(false) // Friday 00:30 belongs to Thursday
  })
  it('treats no windows as always open', () => {
    expect(inWindowsAt([], 0, 0)).toBe(true)
  })
})

describe('evaluateSite', () => {
  it('allows inside window with quota and reports the smaller remaining time', () => {
    const s = evaluateSite(site({ windows: evening }), 0, at(20, 50))
    expect(s.allowed).toBe(true)
    expect(s.remainingSec).toBe(10 * 60) // window closes before the 30 min quota
  })
  it('blocks outside window and finds the next opening', () => {
    const s = evaluateSite(site({ windows: evening }), 0, at(9))
    expect(s).toMatchObject({ allowed: false, reason: 'window' })
    expect(new Date(s.nextOpenAt!).getTime()).toBe(at(20).getTime())
  })
  it('blocks when the quota is used and reopens the next day', () => {
    const s = evaluateSite(site({ windows: evening }), 30 * 60, at(20, 10))
    expect(s).toMatchObject({ allowed: false, reason: 'quota' })
    expect(new Date(s.nextOpenAt!).getTime()).toBe(at(20, 0, 27).getTime())
  })
  it('skips days without a window (Friday -> Monday)', () => {
    const s = evaluateSite(site({ windows: evening }), 30 * 60, at(20, 10, 30))
    expect(new Date(s.nextOpenAt!).getTime()).toBe(at(20, 0, 2 + 31).getTime()) // Mon Nov 2
  })
  it('never opens a 0-minute site', () => {
    expect(evaluateSite(site({ dailyMinutes: 0 }), 0, at(12)).nextOpenAt).toBeUndefined()
  })
})

describe('evaluate', () => {
  it('resets usage on a new day', () => {
    const [s] = evaluate(config([site()]), { date: '2026-10-25', seconds: { yt: 9999 } }, at(12))
    expect(s.allowed).toBe(true)
    expect(s.usedSec).toBe(0)
  })
})

describe('isStricter', () => {
  const old = config([site({ windows: evening })])
  it('accepts tightening', () => {
    const next = config([
      site({ dailyMinutes: 10, domains: ['youtube.com', 'youtu.be'], windows: [{ days: [1], start: '20:00', end: '20:30' }] }),
      site({ id: 'new', name: 'New' })
    ], '2031-01-01T00:00:00.000Z')
    expect(isStricter(old, next).ok).toBe(true)
  })
  it.each([
    ['more minutes', config([site({ dailyMinutes: 31, windows: evening })])],
    ['removed site', config([])],
    ['removed domain', config([site({ domains: ['youtu.be'], windows: evening })])],
    ['longer window', config([site({ windows: [{ days: [1, 2, 3, 4, 5], start: '19:00', end: '21:00' }] })])],
    ['removed windows', config([site()])],
    ['shorter lock', config([site({ windows: evening })], '2029-01-01T00:00:00.000Z')]
  ])('rejects %s', (_, next) => {
    expect(isStricter(old, next).ok).toBe(false)
  })
})

describe('validateConfig', () => {
  it('rejects bad input', () => {
    expect(validateConfig(config([site({ dailyMinutes: -1 })]))).toMatch(/minutes/)
    expect(validateConfig(config([site({ domains: ['not a domain'] })]))).toMatch(/domain/)
    expect(validateConfig(config([site(), site()]))).toMatch(/Duplicate/)
    expect(validateConfig(config([site({ windows: evening })]))).toBeNull()
  })
})

describe('content filter', () => {
  const withFilter = (filter: Config['filter']): Config => ({ ...config([site()]), filter })
  it('may only get stricter while locked', () => {
    expect(isStricter(withFilter('adult'), withFilter('family')).ok).toBe(true)
    expect(isStricter(withFilter(undefined), withFilter('security')).ok).toBe(true)
    expect(isStricter(withFilter('family'), withFilter('adult')).ok).toBe(false)
    expect(isStricter(withFilter('security'), withFilter(undefined)).ok).toBe(false)
  })
  it('rejects unknown filters', () => {
    expect(validateConfig(withFilter('strictest' as Config['filter']))).toMatch(/filter/)
  })
})
