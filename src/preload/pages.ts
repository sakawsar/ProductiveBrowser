import { contextBridge, ipcRenderer } from 'electron'

// Every tab gets this preload, but websites must never see the API: only pb:// pages do.
if (location.protocol === 'pb:') {
  contextBridge.exposeInMainWorld('pb', {
    getState: () => ipcRenderer.invoke('pb:getState'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('pb:saveConfig', config),
    onState: (cb: (state: unknown) => void) => ipcRenderer.on('pb:state', (_e, s) => cb(s)),
    listExtensions: () => ipcRenderer.invoke('pb:listExtensions'),
    removeExtension: (id: string) => ipcRenderer.invoke('pb:removeExtension', id)
  })
}
