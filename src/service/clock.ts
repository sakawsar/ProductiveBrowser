import { request } from 'node:https'

/** Sites that also serve as time sources: blocking them to fake the time also blocks the sites themselves. */
const TIME_HOSTS = ['www.youtube.com', 'www.google.com', 'www.cloudflare.com', 'www.microsoft.com']

export type TimeFetcher = (host: string) => Promise<number>

/** Reads the HTTPS `Date` header, adjusted by half the round trip. */
export const fetchHttpsDate: TimeFetcher = (host) =>
  new Promise((resolve, reject) => {
    const started = Date.now()
    const req = request({ host, method: 'HEAD', path: '/', timeout: 5000 }, (res) => {
      res.resume()
      const date = Date.parse(res.headers.date ?? '')
      if (Number.isNaN(date)) reject(new Error(`No Date header from ${host}`))
      else resolve(date + 500 + (Date.now() - started) / 2) // header has 1s resolution
    })
    req.on('timeout', () => req.destroy(new Error(`Timeout from ${host}`)))
    req.on('error', reject)
    req.end()
  })

const monoMs = (): number => Number(process.hrtime.bigint() / 1_000_000n)

/**
 * A clock the user can't move by changing the system time.
 * - After a successful network sync, the system clock is ignored and time advances monotonically.
 * - Before any sync (offline), it uses the system clock but never goes below the last time seen,
 *   which is saved across restarts as the watermark.
 */
export class TrustedClock {
  private anchor: { at: number; mono: number }
  private synced = false

  constructor(
    watermark: number,
    private readonly fetcher: TimeFetcher = fetchHttpsDate,
    private readonly systemNow: () => number = Date.now,
    private readonly mono: () => number = monoMs
  ) {
    this.anchor = { at: Math.max(systemNow(), watermark), mono: mono() }
  }

  now(): Date {
    const elapsed = this.mono() - this.anchor.mono
    const fromAnchor = this.anchor.at + elapsed
    return new Date(this.synced ? fromAnchor : Math.max(this.systemNow(), fromAnchor))
  }

  isSynced(): boolean {
    return this.synced
  }

  async sync(): Promise<boolean> {
    const results = await Promise.allSettled(TIME_HOSTS.map((h) => this.fetcher(h)))
    const times = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])).sort((a, b) => a - b)
    if (times.length === 0) return false
    this.anchor = { at: times[Math.floor(times.length / 2)], mono: this.mono() }
    this.synced = true
    return true
  }
}
