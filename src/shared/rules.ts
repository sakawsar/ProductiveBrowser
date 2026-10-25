import { FILTERS, filterRank } from './filter'
import type { Config, Site, SiteStatus, TimeWindow, Usage } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseHM(hm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm)
  if (!m) throw new Error(`Invalid time "${hm}"`)
  return Number(m[1]) * 60 + Number(m[2])
}

/** Whether a weekday + minute-of-day falls inside any window. No windows means always. */
export function inWindowsAt(windows: TimeWindow[], weekday: number, minute: number): boolean {
  if (windows.length === 0) return true
  return windows.some((w) => {
    const s = parseHM(w.start)
    const e = parseHM(w.end)
    if (s === e) return w.days.includes(weekday)
    if (s < e) return w.days.includes(weekday) && minute >= s && minute < e
    // Crosses midnight: the tail end belongs to the previous day's window.
    return (w.days.includes(weekday) && minute >= s) || (w.days.includes((weekday + 6) % 7) && minute < e)
  })
}

export function inWindows(windows: TimeWindow[], d: Date): boolean {
  return inWindowsAt(windows, d.getDay(), d.getHours() * 60 + d.getMinutes())
}

/** Seconds from `now` until the current window closes, or Infinity if it never closes within 2 days. */
function secondsUntilWindowEnds(windows: TimeWindow[], now: Date): number {
  if (windows.length === 0) return Infinity
  const t = new Date(now)
  t.setSeconds(0, 0)
  for (let i = 0; i < 2 * 24 * 60; i++) {
    t.setMinutes(t.getMinutes() + 1)
    if (!inWindows(windows, t)) return Math.max(0, Math.round((t.getTime() - now.getTime()) / 1000))
  }
  return Infinity
}

/** Earliest time after `now` when the site is usable again, searching 8 days ahead. */
function nextOpen(site: Site, usedToday: number, now: Date): Date | undefined {
  if (site.dailyMinutes <= 0) return undefined
  const candidates: Date[] = []
  for (let day = 0; day <= 8; day++) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day)
    candidates.push(base)
    for (const w of site.windows) {
      const s = parseHM(w.start)
      candidates.push(new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(s / 60), s % 60))
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime())
  const today = localDate(now)
  for (const c of candidates) {
    if (c.getTime() <= now.getTime()) continue
    const used = localDate(c) === today ? usedToday : 0
    if (used < site.dailyMinutes * 60 && inWindows(site.windows, c)) return c
  }
  return undefined
}

export function evaluateSite(site: Site, usedSec: number, now: Date): SiteStatus {
  const base = { id: site.id, name: site.name, domains: site.domains, dailyMinutes: site.dailyMinutes, usedSec }
  const quotaLeft = site.dailyMinutes * 60 - usedSec
  const windowOpen = inWindows(site.windows, now)
  if (windowOpen && quotaLeft > 0) {
    const remainingSec = Math.min(quotaLeft, secondsUntilWindowEnds(site.windows, now))
    return { ...base, allowed: true, remainingSec }
  }
  return {
    ...base,
    allowed: false,
    reason: quotaLeft <= 0 ? 'quota' : 'window',
    nextOpenAt: nextOpen(site, usedSec, now)?.toISOString()
  }
}

export function evaluate(config: Config, usage: Usage, now: Date): SiteStatus[] {
  const sameDay = usage.date === localDate(now)
  return config.sites.map((s) => evaluateSite(s, sameDay ? (usage.seconds[s.id] ?? 0) : 0, now))
}

/** Returns null when valid, otherwise a human-readable problem. */
export function validateConfig(c: Config): string | null {
  if (c.version !== 1) return 'Unsupported config version'
  if (Number.isNaN(Date.parse(c.lockUntil))) return 'Invalid lock date'
  if (c.filter !== undefined && !FILTERS.some((f) => f.id === c.filter)) return 'Invalid content filter'
  const ids = new Set<string>()
  for (const s of c.sites) {
    if (!s.id || ids.has(s.id)) return `Duplicate or empty site id "${s.id}"`
    ids.add(s.id)
    if (!s.name.trim()) return 'Every site needs a name'
    if (s.domains.length === 0) return `${s.name}: add at least one domain`
    if (s.domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) return `${s.name}: invalid domain`
    if (!Number.isInteger(s.dailyMinutes) || s.dailyMinutes < 0 || s.dailyMinutes > 1440) return `${s.name}: minutes must be 0–1440`
    for (const w of s.windows) {
      try {
        parseHM(w.start)
        parseHM(w.end)
      } catch {
        return `${s.name}: invalid window time`
      }
      if (w.days.length === 0 || w.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return `${s.name}: pick at least one day`
    }
  }
  return null
}

/**
 * Whether `next` is at least as strict as `old`, so it may be saved while locked.
 * Sites may be added, but existing ones may not lose domains, gain minutes or gain window time,
 * and the content filter may not get less strict.
 */
export function isStricter(old: Config, next: Config): { ok: true } | { ok: false; reason: string } {
  if (Date.parse(next.lockUntil) < Date.parse(old.lockUntil)) return { ok: false, reason: 'The lock cannot be shortened' }
  if (filterRank(next.filter) < filterRank(old.filter)) return { ok: false, reason: 'The content filter cannot be made less strict' }
  for (const o of old.sites) {
    const n = next.sites.find((s) => s.id === o.id)
    if (!n) return { ok: false, reason: `${o.name} cannot be removed while locked` }
    const lostDomain = o.domains.find((d) => !n.domains.includes(d))
    if (lostDomain) return { ok: false, reason: `${o.name}: ${lostDomain} cannot be removed while locked` }
    if (n.dailyMinutes > o.dailyMinutes) return { ok: false, reason: `${o.name}: minutes cannot be increased while locked` }
    for (let wd = 0; wd < 7; wd++) {
      for (let m = 0; m < 1440; m++) {
        if (inWindowsAt(n.windows, wd, m) && !inWindowsAt(o.windows, wd, m)) {
          return { ok: false, reason: `${o.name}: allowed hours cannot be extended while locked` }
        }
      }
    }
  }
  return { ok: true }
}
