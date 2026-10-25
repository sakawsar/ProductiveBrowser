import { app, ipcMain, Menu, session, webContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { AdBlock } from './adblock'
import { Browser } from './browser'
import { applyContentFilter } from './dns'
import { evictBlocked, installEnforcer, siteForUrl } from './enforcer'
import { listExtensions, removeExtension, setupExtensions } from './extensions'
import { handleScheme, registerScheme } from './protocol'
import { ServiceClient } from './serviceClient'
import { UsageTracker } from './usage'
import { servicePort } from '../shared/protocol'
import type { Config } from '../shared/types'

const DEV = !app.isPackaged
// Keep dev runs out of the installed browser's profile (cookies, extensions) and its single-instance lock.
if (DEV) app.setPath('userData', app.getPath('userData') + ' Dev')
const service = new ServiceClient(servicePort(DEV))

// Used by the uninstaller: exit 1 while the rules are locked, 0 otherwise.
if (process.argv.includes('--can-uninstall')) {
  service.start()
  service.once('connected', () => {
    service.request('getState').then(
      (s) => process.exit(s.locked ? 1 : 0),
      () => process.exit(0)
    )
  })
  setTimeout(() => process.exit(0), 5000)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Dev only: PB_REMOTE_DEBUG=9222 exposes the Chrome DevTools Protocol for scripted testing.
  if (DEV && process.env.PB_REMOTE_DEBUG) app.commandLine.appendSwitch('remote-debugging-port', process.env.PB_REMOTE_DEBUG)
  registerScheme()
  void app.whenReady().then(startApp)
}

let devService: ChildProcess | null = null

/** In development the service runs as a child process; installed builds use the Windows service. */
function startDevService(): void {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  devService = spawn(process.execPath, [join(__dirname, 'service.js'), '--dev'], { env, stdio: 'inherit' })
}

async function startApp(): Promise<void> {
  // Sites (and the Chrome Web Store) treat the browser as Chrome only without the Electron/app tokens.
  app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|productive-browser)\/\S+/g, '')
  if (DEV) startDevService()
  handleScheme()
  service.start()
  const adblock = new AdBlock()
  await adblock.start(session.defaultSession)
  installEnforcer(() => service.state().sites, adblock)

  let browser: Browser | null = null
  const tracker = new UsageTracker(() => browser, service, () => sendStatus())

  const sendStatus = (): void => {
    const wc = browser?.toolbarContents
    if (!wc || wc.isDestroyed()) return
    const site = siteForUrl(browser?.active()?.getURL() ?? '', service.state().sites)
    wc.send('status', site ? { name: site.name, allowed: site.allowed, remainingSec: tracker.remaining(site) } : null)
    const tab = browser?.active()
    if (tab) wc.send('adblock', adblock.status(tab.getURL(), tab.id))
  }

  // The toolbar shield's menu: per-site and global switches, then reload so the change shows.
  ipcMain.on('adblock:menu', (e, at: { x: number; y: number }) => {
    const tab = browser?.active()
    if (!browser || e.sender !== browser.toolbarContents || !tab) return
    const status = adblock.status(tab.getURL(), tab.id)
    const apply = (change: () => void): void => {
      change()
      tab.reload()
      sendStatus()
    }
    Menu.buildFromTemplate([
      { label: `${status.blocked} ads and trackers blocked on this page`, enabled: false },
      { type: 'separator' },
      ...(status.site
        ? [{
            label: `Block ads on ${status.site}`,
            type: 'checkbox' as const,
            checked: status.enabled && !status.siteAllowed,
            enabled: status.enabled,
            click: () => apply(() => adblock.setSiteAllowed(status.site!, !status.siteAllowed))
          }]
        : []),
      { label: 'Block ads everywhere', type: 'checkbox', checked: status.enabled, click: () => apply(() => adblock.setEnabled(!status.enabled)) }
    ]).popup({ window: browser.window, x: Math.round(at.x), y: Math.round(at.y) })
  })

  const internalPages = (): Electron.WebContents[] =>
    webContents.getAllWebContents().filter((wc) => !wc.isDestroyed() && wc.getURL().startsWith('pb://'))

  service.on('state', (state) => {
    applyContentFilter(state.config?.filter)
    if (browser) evictBlocked(browser.allContents(), state.sites)
    for (const wc of internalPages()) wc.send('pb:state', state)
    sendStatus()
  })

  // Only pb:// pages get these; the preload also refuses to expose them anywhere else.
  const isInternal = (e: Electron.IpcMainInvokeEvent): boolean => e.senderFrame?.url.startsWith('pb://') ?? false
  ipcMain.handle('pb:getState', (e) => (isInternal(e) ? service.state() : null))
  const fromExtensionsPage = (e: Electron.IpcMainInvokeEvent): boolean => e.senderFrame?.url.startsWith('pb://extensions/') ?? false
  ipcMain.handle('pb:listExtensions', (e) => (fromExtensionsPage(e) ? listExtensions() : []))
  ipcMain.handle('pb:removeExtension', async (e, id: string) => {
    if (!fromExtensionsPage(e)) throw new Error('Not allowed')
    await removeExtension(id)
    return listExtensions()
  })
  ipcMain.handle('pb:saveConfig', async (e, config: Config) => {
    if (!e.senderFrame?.url.startsWith('pb://settings/')) throw new Error('Not allowed')
    await tracker.flush()
    return service.request('saveConfig', { config })
  })

  const extensions = await setupExtensions(() => browser)
  browser = new Browser(sendStatus, extensions)
  browser.registerIpc()
  tracker.start()

  app.on('before-quit', () => {
    void tracker.flush()
    devService?.kill()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('second-instance', () => browser?.window.focus())
}
