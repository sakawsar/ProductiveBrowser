import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'

// Defines <browser-action-list>, the row of extension buttons in the toolbar.
injectBrowserAction()

contextBridge.exposeInMainWorld('browserApi', {
  newTab: () => ipcRenderer.send('tab:new'),
  closeTab: (id: number) => ipcRenderer.send('tab:close', id),
  activate: (id: number) => ipcRenderer.send('tab:activate', id),
  go: (input: string) => ipcRenderer.send('nav:go', input),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  settings: () => ipcRenderer.send('nav:settings'),
  extensions: () => ipcRenderer.send('nav:extensions'),
  onTabs: (cb: (tabs: unknown) => void) => ipcRenderer.on('tabs', (_e, tabs) => cb(tabs)),
  onStatus: (cb: (status: unknown) => void) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onFocusAddress: (cb: () => void) => ipcRenderer.on('focus-address', () => cb()),
  adblockMenu: (x: number, y: number) => ipcRenderer.send('adblock:menu', { x, y }),
  onAdBlock: (cb: (status: unknown) => void) => ipcRenderer.on('adblock', (_e, s) => cb(s))
})
