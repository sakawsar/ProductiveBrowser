import { net, protocol } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const INTERNAL_HOSTS = ['newtab', 'blocked', 'settings', 'extensions']
export const NEW_TAB_URL = 'pb://newtab/'

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'pb', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/**
 * pb://<page>/ serves the shared pages app; other paths serve its assets.
 * Dev proxies to the Vite server, production reads from out/renderer.
 */
export function handleScheme(): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const root = join(__dirname, '../renderer')
  protocol.handle('pb', (req) => {
    const url = new URL(req.url)
    if (!INTERNAL_HOSTS.includes(url.host)) return new Response('Not found', { status: 404 })
    const path = url.pathname === '/' ? '/pages/index.html' : url.pathname
    if (devUrl) return net.fetch(devUrl + path + url.search)
    const file = normalize(join(root, path))
    if (!file.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
