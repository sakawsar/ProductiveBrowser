import { session, type WebContents } from 'electron'
import { hostOf, matchSite } from '../shared/domains'
import type { AdBlock } from './adblock'
import type { SiteStatus } from '../shared/types'

export const blockedUrl = (siteId: string, url: string): string =>
  `pb://blocked/?site=${encodeURIComponent(siteId)}&url=${encodeURIComponent(url)}`

export function siteForUrl(url: string, sites: SiteStatus[]): SiteStatus | undefined {
  const host = hostOf(url)
  return host ? matchSite(host, sites) : undefined
}

/**
 * The session's only webRequest listeners (Electron allows one per event).
 * Time limits come first: every request to a tracked site that isn't currently allowed is blocked, and page
 * loads go to the blocked page. Whatever passes then goes through the ad blocker.
 */
export function installEnforcer(getSites: () => SiteStatus[], adblock: AdBlock): void {
  const { webRequest } = session.defaultSession
  webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const site = siteForUrl(details.url, getSites())
    if (!site || site.allowed) return adblock.onBeforeRequest(details, callback)
    if (details.resourceType === 'mainFrame') return callback({ redirectURL: blockedUrl(site.id, details.url) })
    callback({ cancel: true })
  })
  webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, adblock.onHeadersReceived)
}

/** Sends tabs that are on a now-blocked site to the blocked page. */
export function evictBlocked(contents: WebContents[], sites: SiteStatus[]): void {
  for (const wc of contents) {
    const site = siteForUrl(wc.getURL(), sites)
    if (site && !site.allowed) void wc.loadURL(blockedUrl(site.id, wc.getURL()))
  }
}
