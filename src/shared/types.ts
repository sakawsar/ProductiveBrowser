/** A weekly time window. `days` uses JS weekday numbers (0 = Sunday). End before start means it crosses midnight. */
export interface TimeWindow {
  days: number[]
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export interface Site {
  id: string
  name: string
  domains: string[]
  dailyMinutes: number
  /** Empty means "any time of day". */
  windows: TimeWindow[]
}

export type ContentFilter = 'off' | 'security' | 'adult' | 'family'

export interface Config {
  version: 1
  sites: Site[]
  /** CleanBrowsing DNS filter. Missing means off (configs saved before it existed). */
  filter?: ContentFilter
  lockUntil: string // ISO timestamp
  createdAt: string
}

export interface Usage {
  date: string // local "YYYY-MM-DD"
  seconds: Record<string, number>
}

export type BlockReason = 'quota' | 'window' | 'strict' | 'offline'

export interface SiteStatus {
  id: string
  name: string
  domains: string[]
  dailyMinutes: number
  usedSec: number
  allowed: boolean
  reason?: BlockReason
  /** Seconds until access ends (quota or window, whichever comes first). Only when allowed. */
  remainingSec?: number
  /** ISO time access opens again. Only when blocked. */
  nextOpenAt?: string
}

export interface ServiceState {
  now: string
  configured: boolean
  locked: boolean
  strict: boolean
  config: Config | null
  sites: SiteStatus[]
}

export interface TabInfo {
  id: number
  title: string
  url: string
  favicon?: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  active: boolean
}

/** Shown in the toolbar when the active tab is on a tracked site. */
export interface SiteBadge {
  name: string
  allowed: boolean
  remainingSec?: number
}

export interface ExtensionInfo {
  id: string
  name: string
  version: string
}

/** Ad blocker state for the active tab, shown on the toolbar shield. */
export interface AdBlockStatus {
  enabled: boolean
  site: string | null
  siteAllowed: boolean
  blocked: number
}
