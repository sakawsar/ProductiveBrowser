import { EventEmitter } from 'node:events'
import { connect, type Socket } from 'node:net'
import { lineReader, SERVICE_HOST, type Method, type Methods, type Push, type Response } from '../shared/protocol'
import { PRESETS } from '../shared/presets'
import type { ServiceState } from '../shared/types'

const RECONNECT_MS = 2000
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Connection to the background service. While it can't be reached, every known site reports as
 * blocked ("fail closed"), so stopping the service doesn't unlock anything.
 */
export class ServiceClient extends EventEmitter<{ state: [ServiceState]; connected: [boolean] }> {
  private sock: Socket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  private last: ServiceState | null = null
  connected = false

  constructor(private readonly port: number) {
    super()
  }

  start(): void {
    const sock = connect(this.port, SERVICE_HOST)
    this.sock = sock
    sock.on('connect', () => {
      this.connected = true
      this.emit('connected', true)
      this.request('getState').then((s) => this.update(s), () => undefined)
    })
    sock.on('data', lineReader((msg) => this.onMessage(msg as Response | Push)))
    sock.on('error', () => undefined)
    sock.on('close', () => {
      const was = this.connected
      this.connected = false
      this.sock = null
      for (const p of this.pending.values()) {
        clearTimeout(p.timer)
        p.reject(new Error('Service disconnected'))
      }
      this.pending.clear()
      if (was) {
        this.emit('connected', false)
        this.emit('state', this.state())
      }
      setTimeout(() => this.start(), RECONNECT_MS)
    })
  }

  private onMessage(msg: Response | Push): void {
    if ('event' in msg) return this.update(msg.state)
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error))
  }

  private update(s: ServiceState): void {
    this.last = s
    this.emit('state', this.state())
  }

  request<M extends Method>(method: M, params?: Methods[M]['params']): Promise<Methods[M]['result']> {
    const sock = this.sock
    if (!sock || !this.connected) return Promise.reject(new Error('The Productive Browser service is not running'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Service timed out'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      sock.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  /** The service's state, or an all-blocked stand-in when disconnected. */
  state(): ServiceState {
    if (this.connected && this.last) return this.last
    const sites = (this.last?.config?.sites ?? PRESETS).map((s) => ({
      id: s.id, name: s.name, domains: s.domains, dailyMinutes: s.dailyMinutes, usedSec: 0,
      allowed: false, reason: 'offline' as const
    }))
    return { now: new Date().toISOString(), configured: !!this.last?.configured, locked: true, strict: false, config: this.last?.config ?? null, sites }
  }
}
