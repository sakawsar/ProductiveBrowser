import { app } from 'electron'
import { dohTemplate } from '../shared/filter'
import type { ContentFilter } from '../shared/types'

let applied: string | null | undefined

/**
 * Sends all of this browser's DNS lookups through the chosen CleanBrowsing filter.
 * "secure" mode has no fallback to normal DNS, so blocking the filter blocks browsing instead of bypassing it.
 */
export function applyContentFilter(filter: ContentFilter | undefined): void {
  const template = dohTemplate(filter)
  if (template === applied) return
  applied = template
  app.configureHostResolver(
    template
      ? { enableBuiltInResolver: true, secureDnsMode: 'secure', secureDnsServers: [template] }
      : { enableBuiltInResolver: true, secureDnsMode: 'automatic', secureDnsServers: [] }
  )
}
