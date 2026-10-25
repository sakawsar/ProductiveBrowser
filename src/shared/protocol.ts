import type { Config, ServiceState } from './types'

/**
 * The app and service talk newline-delimited JSON over loopback TCP. Raw TCP (not HTTP) keeps web
 * pages from reaching it. The channel itself is not trusted: the service validates every request.
 */
export const SERVICE_HOST = '127.0.0.1'
export const servicePort = (dev: boolean): number => (dev ? 47616 : 47615)

export interface Methods {
  getState: { params: undefined; result: ServiceState }
  reportUsage: { params: { siteId: string; seconds: number }; result: ServiceState }
  saveConfig: { params: { config: Config }; result: ServiceState }
}
export type Method = keyof Methods

export type Request = { id: number; method: Method; params?: unknown }
export type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
export type Push = { event: 'state'; state: ServiceState }

/** Splits a socket stream into JSON messages. */
export function lineReader(onMessage: (msg: unknown) => void): (chunk: Buffer) => void {
  let buf = ''
  return (chunk) => {
    buf += chunk.toString('utf8')
    if (buf.length > 1_000_000) throw new Error('Message too large')
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (line.trim()) onMessage(JSON.parse(line))
    }
  }
}
