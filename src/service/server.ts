import { createServer, type Server, type Socket } from 'node:net'
import { lineReader, SERVICE_HOST, type Push, type Request, type Response } from '../shared/protocol'
import type { Core } from './core'
import type { Config } from '../shared/types'
import { log } from './env'

const PUSH_INTERVAL_MS = 5000

export function startServer(core: Core, port: number): Promise<Server> {
  const sockets = new Set<Socket>()
  const send = (sock: Socket, msg: Response | Push): void => {
    if (!sock.destroyed) sock.write(JSON.stringify(msg) + '\n')
  }
  const broadcast = (): void => {
    const state = core.getState()
    for (const s of sockets) send(s, { event: 'state', state })
  }
  core.onChange((state) => {
    for (const s of sockets) send(s, { event: 'state', state })
  })
  setInterval(broadcast, PUSH_INTERVAL_MS).unref()

  async function handle(req: Request): Promise<unknown> {
    const p = (req.params ?? {}) as Record<string, unknown>
    switch (req.method) {
      case 'getState':
        return core.getState()
      case 'reportUsage':
        return core.reportUsage(String(p.siteId), Number(p.seconds))
      case 'saveConfig':
        return core.saveConfig(p.config as Config)
      default:
        throw new Error(`Unknown method ${String(req.method)}`)
    }
  }

  const server = createServer((sock) => {
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    sock.on('error', () => sock.destroy())
    const read = lineReader((msg) => {
      const req = msg as Request
      handle(req).then(
        (result) => send(sock, { id: req.id, ok: true, result }),
        (e: Error) => send(sock, { id: req.id, ok: false, error: e.message })
      )
    })
    sock.on('data', (chunk) => {
      try {
        read(chunk as Buffer)
      } catch {
        sock.destroy()
      }
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, SERVICE_HOST, () => {
      log(`listening on ${SERVICE_HOST}:${port}`)
      resolve(server)
    })
  })
}
