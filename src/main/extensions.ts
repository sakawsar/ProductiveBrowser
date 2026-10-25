import { dialog, session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore, uninstallExtension } from 'electron-chrome-web-store'
import type { Browser } from './browser'
import type { ExtensionInfo } from '../shared/types'

// Not exported by the library, so taken from its beforeInstall hook.
type BeforeInstall = NonNullable<NonNullable<Parameters<typeof installChromeWebStore>[0]>['beforeInstall']>
type ExtensionInstallDetails = Parameters<BeforeInstall>[0]

/**
 * Chrome extension support: chrome.tabs/action/contextMenus etc. come from electron-chrome-extensions,
 * installs and updates from the Chrome Web Store from electron-chrome-web-store.
 * Extensions run in the same session as the tabs, so the time-limit blocking applies to them too.
 */
export async function setupExtensions(getBrowser: () => Browser | null): Promise<ElectronChromeExtensions> {
  const ses = session.defaultSession
  const extensions = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    async createTab(details) {
      const b = getBrowser()
      if (!b) throw new Error('No browser window')
      const wc = b.newTab(details.url ?? 'pb://newtab/', details.active !== false)
      return [wc, b.window as Electron.BrowserWindow]
    },
    selectTab: (wc) => getBrowser()?.activateContents(wc),
    removeTab: (wc) => getBrowser()?.closeContents(wc),
    async createWindow(details) {
      // Single-window browser: open the requested pages as tabs instead.
      const b = getBrowser()
      if (!b) throw new Error('No browser window')
      const urls = Array.isArray(details.url) ? details.url : [details.url ?? 'pb://newtab/']
      for (const url of urls) b.newTab(url)
      return b.window as Electron.BrowserWindow
    }
  })
  // Serves extension icons to the toolbar's <browser-action-list>.
  ElectronChromeExtensions.handleCRXProtocol(ses)
  await installChromeWebStore({
    session: ses,
    beforeInstall: (details) => confirmInstall(details, getBrowser()?.window)
  })
  return extensions
}

const PERMISSION_TEXT: Record<string, string> = {
  tabs: 'Read your browsing history',
  history: 'Read and change your browsing history',
  bookmarks: 'Read and change your bookmarks',
  cookies: 'Read and change cookies',
  downloads: 'Manage your downloads',
  clipboardRead: 'Read data you copy and paste',
  clipboardWrite: 'Change data you copy and paste',
  nativeMessaging: 'Communicate with cooperating native applications',
  proxy: 'Read and change all your data on all websites',
  debugger: 'Access the page debugger backend'
}

/** Summarizes what an extension can access, like Chrome's install prompt. */
function describeAccess(manifest: ExtensionInstallDetails['manifest']): string[] {
  const m = manifest as { permissions?: string[]; host_permissions?: string[]; content_scripts?: { matches?: string[] }[] }
  const hosts = [...(m.host_permissions ?? []), ...(m.permissions ?? []).filter((p) => p.includes('://') || p === '<all_urls>')]
  for (const cs of m.content_scripts ?? []) hosts.push(...(cs.matches ?? []))
  const lines: string[] = []
  if (hosts.some((h) => h === '<all_urls>' || /^\*:\/\/\*\//.test(h) || /^https?:\/\/\*\//.test(h))) {
    lines.push('Read and change all your data on all websites')
  } else if (hosts.length) {
    const domains = [...new Set(hosts.map((h) => h.replace(/^.*?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '')))]
    lines.push(`Read and change your data on ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? ` and ${domains.length - 3} more` : ''}`)
  }
  for (const p of m.permissions ?? []) if (PERMISSION_TEXT[p] && !lines.includes(PERMISSION_TEXT[p])) lines.push(PERMISSION_TEXT[p])
  return lines
}

async function confirmInstall(details: ExtensionInstallDetails, window?: Electron.BaseWindow): Promise<{ action: 'allow' | 'deny' }> {
  const access = describeAccess(details.manifest)
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: 'Add extension',
    message: `Add "${details.localizedName}"?`,
    detail: access.length ? `It can:\n${access.map((a) => `• ${a}`).join('\n')}` : 'It needs no special permissions.',
    icon: details.icon,
    buttons: ['Add extension', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
  return { action: response === 0 ? 'allow' : 'deny' }
}

export function listExtensions(): ExtensionInfo[] {
  return session.defaultSession.extensions
    .getAllExtensions()
    .map((e) => ({ id: e.id, name: e.name, version: e.version }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function removeExtension(id: string): Promise<void> {
  return uninstallExtension(id, { session: session.defaultSession })
}
