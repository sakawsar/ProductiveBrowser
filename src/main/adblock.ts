import { app, ipcMain, type Session } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hostOf } from '../shared/domains'
import type { AdBlockStatus } from '../shared/types'

const REFRESH_MS = 24 * 60 * 60_000
/**
 * Some pages retry a blocked request in a tight loop (thousands per second). After this many blocks of the
 * same URL on one page, each further block is answered only after a delay, which slows the loop to a crawl.
 * (Chromium refuses to redirect page requests to an empty data: response instead.)
 */
const RETRY_LOOP_LIMIT = 10
const RETRY_LOOP_DELAY_MS = 5000
// Same file the library registers itself (its preload_path module isn't exported).
const PRELOAD_PATH = require.resolve('@ghostery/adblocker-electron-preload')

interface Prefs {
  enabled: boolean
  /** Sites (hostnames without "www.") where ads are allowed, e.g. ones that break with blocking. */
  allowedSites: string[]
}

type BeforeRequest = (details: Electron.OnBeforeRequestListenerDetails, callback: (r: Electron.CallbackResponse) => void) => void
type HeadersReceived = (details: Electron.OnHeadersReceivedListenerDetails, callback: (r: Electron.HeadersReceivedResponse) => void) => void

const siteOf = (url: string): string | null => hostOf(url)?.replace(/^www\./, '') ?? null

/**
 * Ad and tracker blocking with Ghostery's filter engine. Electron allows only one webRequest listener
 * per event, so instead of letting the library register its own, the enforcer calls `onBeforeRequest`
 * and `onHeadersReceived` after the time-limit check.
 */
export class AdBlock {
  private engine: ElectronBlocker | null = null
  private prefs: Prefs = { enabled: true, allowedSites: [] }
  /** Per tab: how often each URL was blocked on the current page. */
  private blocked = new Map<number, Map<string, number>>()
  private readonly dir = join(app.getPath('userData'), 'adblock')
  private readonly prefsFile = join(this.dir, 'prefs.json')
  private readonly engineFile = join(this.dir, 'engine.bin')

  async start(ses: Session): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    try {
      this.prefs = { ...this.prefs, ...JSON.parse(readFileSync(this.prefsFile, 'utf8')) }
    } catch {
      // First run: defaults.
    }
    this.registerCosmetics(ses)
    app.on('web-contents-created', (_e, wc) => {
      const id = wc.id
      wc.once('destroyed', () => this.blocked.delete(id))
    })
    if (existsSync(this.engineFile)) {
      try {
        this.engine = ElectronBlocker.deserialize(readFileSync(this.engineFile))
      } catch {
        this.engine = null // corrupt or from an older engine version: refetch below
      }
    }
    const stale = !this.engine || Date.now() - statSync(this.engineFile).mtimeMs > REFRESH_MS
    // Don't hold up startup on the download; requests pass unfiltered until the first lists load.
    if (stale) void this.refresh()
    setInterval(() => void this.refresh(), REFRESH_MS)
  }

  private async refresh(): Promise<void> {
    try {
      const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
      writeFileSync(this.engineFile, engine.serialize())
      this.engine = engine
    } catch (e) {
      console.error('Ad blocker: could not update filter lists', e)
    }
  }

  /** Whether blocking applies to a page (by its top-level URL). Internal and extension pages are left alone. */
  activeFor(pageUrl: string): boolean {
    const site = siteOf(pageUrl)
    return this.prefs.enabled && !!site && !this.prefs.allowedSites.includes(site)
  }

  private pageUrl(details: { webContents?: Electron.WebContents; url: string; resourceType?: string }): string {
    if (details.resourceType === 'mainFrame') return details.url
    return details.webContents && !details.webContents.isDestroyed() ? details.webContents.getURL() : ''
  }

  onBeforeRequest: BeforeRequest = (details, callback) => {
    const id = details.webContentsId
    if (details.resourceType === 'mainFrame' && id !== undefined) this.blocked.set(id, new Map())
    if (!this.engine || !this.activeFor(this.pageUrl(details))) return callback({})
    this.engine.onBeforeRequest(details, (response) => {
      if (id === undefined || !(response.cancel || response.redirectURL)) return callback(response)
      const page = this.blocked.get(id) ?? new Map<string, number>()
      this.blocked.set(id, page)
      const times = (page.get(details.url) ?? 0) + 1
      page.set(details.url, times)
      if (times > RETRY_LOOP_LIMIT) setTimeout(() => callback(response), RETRY_LOOP_DELAY_MS)
      else callback(response)
    })
  }

  onHeadersReceived: HeadersReceived = (details, callback) => {
    if (!this.engine || !this.activeFor(this.pageUrl(details))) return callback({})
    this.engine.onHeadersReceived(details, callback)
  }

  /** Hides ad placeholders and runs the lists' scriptlets, through the library's preload script. */
  private registerCosmetics(ses: Session): void {
    ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD_PATH })
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url: string, msg) => {
      if (!this.engine || !this.activeFor(event.sender.getURL())) return
      return this.engine.onInjectCosmeticFilters(event, url, msg)
    })
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) =>
      this.engine ? this.engine.onIsMutationObserverEnabled(event) : false
    )
  }

  status(pageUrl: string, contentsId: number): AdBlockStatus {
    const site = siteOf(pageUrl)
    return {
      enabled: this.prefs.enabled,
      site,
      siteAllowed: !!site && this.prefs.allowedSites.includes(site),
      blocked: this.blocked.get(contentsId)?.size ?? 0
    }
  }

  setEnabled(enabled: boolean): void {
    this.prefs.enabled = enabled
    this.save()
  }

  setSiteAllowed(site: string, allowed: boolean): void {
    const others = this.prefs.allowedSites.filter((s) => s !== site)
    this.prefs.allowedSites = allowed ? [...others, site].sort() : others
    this.save()
  }

  private save(): void {
    writeFileSync(this.prefsFile, JSON.stringify(this.prefs, null, 2))
  }
}
