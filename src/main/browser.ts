import { BaseWindow, Menu, WebContentsView, ipcMain, nativeTheme, type WebContents } from 'electron'
import { join } from 'node:path'
import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { NEW_TAB_URL } from './protocol'
import type { TabInfo } from '../shared/types'

export const TOOLBAR_HEIGHT = 80

interface Tab {
  id: number
  view: WebContentsView
  favicon?: string
}

/** Turns address-bar text into a URL: full URLs pass through, bare domains get https, the rest is a search. */
export function toUrl(input: string): string {
  const text = input.trim()
  if (/^(https?|pb|chrome-extension):\/\//i.test(text)) return text
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)) return 'https://' + text
  return 'https://www.google.com/search?q=' + encodeURIComponent(text)
}

export class Browser {
  readonly window: BaseWindow
  private toolbar: WebContentsView
  private tabs: Tab[] = []
  private activeId = -1
  private nextId = 1

  constructor(
    private readonly onTabsChanged: () => void,
    private readonly extensions: ElectronChromeExtensions | null = null
  ) {
    this.window = new BaseWindow({
      width: 1280,
      height: 860,
      title: 'Productive Browser',
      autoHideMenuBar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#18181b' : '#ffffff'
    })
    // macOS has one menu bar for the whole app; elsewhere each window gets a hidden menu.
    if (process.platform === 'darwin') Menu.setApplicationMenu(this.shortcuts())
    else this.window.setMenu(this.shortcuts())
    this.toolbar = new WebContentsView({
      webPreferences: { preload: join(__dirname, '../preload/toolbar.js'), sandbox: true }
    })
    this.window.contentView.addChildView(this.toolbar)
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) void this.toolbar.webContents.loadURL(devUrl + '/toolbar/index.html')
    else void this.toolbar.webContents.loadFile(join(__dirname, '../renderer/toolbar/index.html'))
    this.window.on('resize', () => this.layout())
    this.window.on('focus', () => this.onTabsChanged())
    this.window.on('closed', () => {
      for (const t of this.tabs) t.view.webContents.close()
      this.toolbar.webContents.close()
    })
    this.toolbar.webContents.once('did-finish-load', () => this.sendTabs())
    this.newTab(NEW_TAB_URL)
    this.layout()
  }

  get toolbarContents(): WebContents {
    return this.toolbar.webContents
  }

  allContents(): WebContents[] {
    return this.tabs.map((t) => t.view.webContents)
  }

  active(): WebContents | undefined {
    return this.tabs.find((t) => t.id === this.activeId)?.view.webContents
  }

  newTab(url: string, focus = true): WebContents {
    const view = new WebContentsView({
      webPreferences: { preload: join(__dirname, '../preload/pages.js'), sandbox: true }
    })
    const tab: Tab = { id: this.nextId++, view }
    const wc = view.webContents
    const update = (): void => this.sendTabs()
    wc.on('page-title-updated', update)
    wc.on('did-start-loading', update)
    wc.on('did-stop-loading', update)
    wc.on('did-navigate', () => {
      tab.favicon = undefined // the new page sends its own via page-favicon-updated
      update()
    })
    wc.on('did-navigate-in-page', update)
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons[0]
      update()
    })
    wc.on('context-menu', (_e, params) => {
      Menu.buildFromTemplate([
        ...(params.linkURL ? [{ label: 'Open link in new tab', click: () => this.newTab(params.linkURL) }, { type: 'separator' as const }] : []),
        ...(this.extensions?.getContextMenuItems(wc, params) ?? []),
        { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Reload', click: () => wc.reload() },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) }
      ]).popup()
    })
    wc.setWindowOpenHandler(({ url: target }) => {
      this.newTab(target)
      return { action: 'deny' }
    })
    this.tabs.push(tab)
    this.extensions?.addTab(wc, this.window)
    void wc.loadURL(url)
    if (focus) this.activate(tab.id)
    else this.sendTabs()
    return wc
  }

  closeTab(id: number): void {
    const i = this.tabs.findIndex((t) => t.id === id)
    if (i < 0) return
    const [tab] = this.tabs.splice(i, 1)
    this.extensions?.removeTab(tab.view.webContents)
    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    if (this.tabs.length === 0) return this.window.close()
    if (id === this.activeId) this.activate(this.tabs[Math.min(i, this.tabs.length - 1)].id)
    else this.sendTabs()
  }

  activate(id: number): void {
    const next = this.tabs.find((t) => t.id === id)
    if (!next) return
    const prev = this.tabs.find((t) => t.id === this.activeId)
    if (prev && prev !== next) this.window.contentView.removeChildView(prev.view)
    this.activeId = id
    this.window.contentView.addChildView(next.view)
    this.extensions?.selectTab(next.view.webContents)
    this.layout()
    this.sendTabs()
  }

  activateContents(wc: WebContents): void {
    const tab = this.tabs.find((t) => t.view.webContents === wc)
    if (tab) this.activate(tab.id)
  }

  closeContents(wc: WebContents): void {
    const tab = this.tabs.find((t) => t.view.webContents === wc)
    if (tab) this.closeTab(tab.id)
  }

  navigate(input: string): void {
    void this.active()?.loadURL(toUrl(input))
  }

  private layout(): void {
    const { width, height } = this.window.getContentBounds()
    this.toolbar.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT })
    this.tabs.find((t) => t.id === this.activeId)?.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT })
  }

  tabInfo(): TabInfo[] {
    return this.tabs.map((t) => {
      const wc = t.view.webContents
      return {
        id: t.id,
        title: wc.getTitle() || 'New Tab',
        url: wc.getURL(),
        favicon: t.favicon,
        loading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        active: t.id === this.activeId
      }
    })
  }

  private sendTabs(): void {
    if (this.toolbar.webContents.isDestroyed()) return
    this.toolbar.webContents.send('tabs', this.tabInfo())
    this.onTabsChanged()
  }

  /** The menu that carries the usual browser shortcuts (hidden on Windows). */
  private shortcuts(): Menu {
    const item = (accelerator: string, click: () => void): Electron.MenuItemConstructorOptions => ({ label: accelerator, accelerator, click })
    const switchBy = (step: number): void => {
      const i = this.tabs.findIndex((t) => t.id === this.activeId)
      this.activate(this.tabs[(i + step + this.tabs.length) % this.tabs.length].id)
    }
    const mac = process.platform === 'darwin'
    return Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Browser',
        submenu: [
          item('CmdOrCtrl+T', () => this.newTab(NEW_TAB_URL)),
          item('CmdOrCtrl+W', () => this.closeTab(this.activeId)),
          item('CmdOrCtrl+L', () => {
            this.toolbar.webContents.focus()
            this.toolbar.webContents.send('focus-address')
          }),
          item('CmdOrCtrl+R', () => this.active()?.reload()),
          item('F5', () => this.active()?.reload()),
          item('Alt+Left', () => this.active()?.navigationHistory.goBack()),
          item('Alt+Right', () => this.active()?.navigationHistory.goForward()),
          item('Ctrl+Tab', () => switchBy(1)),
          item('Ctrl+Shift+Tab', () => switchBy(-1)),
          item('F12', () => this.active()?.toggleDevTools()),
          item('CmdOrCtrl+Shift+I', () => this.active()?.toggleDevTools()),
          ...(mac
            ? [
                item('Cmd+[', () => this.active()?.navigationHistory.goBack()),
                item('Cmd+]', () => this.active()?.navigationHistory.goForward()),
                item('Cmd+Alt+I', () => this.active()?.toggleDevTools())
              ]
            : []),
          { role: 'copy' },
          { role: 'paste' },
          { role: 'cut' },
          { role: 'selectAll' },
          { role: 'undo' },
          { role: 'redo' }
        ]
      }
    ])
  }

  registerIpc(): void {
    const fromToolbar = (e: Electron.IpcMainEvent): boolean => e.sender === this.toolbar.webContents
    ipcMain.on('tab:new', (e) => fromToolbar(e) && this.newTab(NEW_TAB_URL))
    ipcMain.on('tab:close', (e, id: number) => fromToolbar(e) && this.closeTab(id))
    ipcMain.on('tab:activate', (e, id: number) => fromToolbar(e) && this.activate(id))
    ipcMain.on('nav:go', (e, input: string) => fromToolbar(e) && this.navigate(input))
    ipcMain.on('nav:back', (e) => fromToolbar(e) && this.active()?.navigationHistory.goBack())
    ipcMain.on('nav:forward', (e) => fromToolbar(e) && this.active()?.navigationHistory.goForward())
    ipcMain.on('nav:reload', (e) => fromToolbar(e) && this.active()?.reload())
    ipcMain.on('nav:settings', (e) => fromToolbar(e) && this.newTab('pb://settings/'))
    ipcMain.on('nav:extensions', (e) => fromToolbar(e) && this.newTab('pb://extensions/'))
  }
}
