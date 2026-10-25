import { Notification } from 'electron'
import type { Browser } from './browser'
import { siteForUrl } from './enforcer'
import type { ServiceClient } from './serviceClient'
import type { SiteStatus } from '../shared/types'

const FLUSH_MS = 5000
const WARN_AT_SEC = [5 * 60, 60]

/**
 * Counts one second for a site when its tab is the active tab of the focused window,
 * or when any tab on it is playing audio (e.g. a video in the background).
 */
export class UsageTracker {
  private pending = new Map<string, number>()
  private warned = new Set<string>()
  private lastFlush = Date.now()

  constructor(
    private readonly browser: () => Browser | null,
    private readonly service: ServiceClient,
    private readonly onTick: () => void
  ) {}

  start(): void {
    setInterval(() => this.tick(), 1000)
  }

  /** Remaining seconds for a site, counting time not yet sent to the service. */
  remaining(site: SiteStatus): number | undefined {
    return site.remainingSec === undefined ? undefined : Math.max(0, site.remainingSec - (this.pending.get(site.id) ?? 0))
  }

  private tick(): void {
    const b = this.browser()
    if (!b) return
    const sites = this.service.state().sites
    const counted = new Set<SiteStatus>()
    const active = b.active()
    if (active && b.window.isFocused() && !b.window.isMinimized()) {
      const s = siteForUrl(active.getURL(), sites)
      if (s) counted.add(s)
    }
    for (const wc of b.allContents()) {
      if (!wc.isCurrentlyAudible()) continue
      const s = siteForUrl(wc.getURL(), sites)
      if (s) counted.add(s)
    }
    let mustFlush = false
    for (const s of counted) {
      if (!s.allowed) continue
      this.pending.set(s.id, (this.pending.get(s.id) ?? 0) + 1)
      const left = this.remaining(s) ?? Infinity
      if (left <= 0) mustFlush = true
      this.warn(s, left)
    }
    if (mustFlush || Date.now() - this.lastFlush >= FLUSH_MS) void this.flush()
    this.onTick()
  }

  private warn(site: SiteStatus, left: number): void {
    for (const at of WARN_AT_SEC) {
      const key = `${site.id}:${at}:${new Date().toDateString()}`
      if (left <= at && left > at - 5 && !this.warned.has(key)) {
        this.warned.add(key)
        new Notification({ title: 'Productive Browser', body: `${site.name}: ${Math.ceil(left / 60)} minute${left > 60 ? 's' : ''} left today` }).show()
      }
    }
  }

  async flush(): Promise<void> {
    this.lastFlush = Date.now()
    if (!this.service.connected) return
    const batch = [...this.pending]
    this.pending.clear()
    for (const [siteId, seconds] of batch) {
      try {
        await this.service.request('reportUsage', { siteId, seconds })
      } catch {
        this.pending.set(siteId, (this.pending.get(siteId) ?? 0) + seconds)
      }
    }
  }
}
