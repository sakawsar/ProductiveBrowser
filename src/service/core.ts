import { seal, unseal } from './crypto'
import { TrustedClock } from './clock'
import { PRESETS } from '../shared/presets'
import { evaluate, isStricter, localDate, validateConfig } from '../shared/rules'
import type { Config, ServiceState, Usage } from '../shared/types'

interface PersistedState {
  config: Config | null
  usage: Usage
  /** Latest trusted time seen, so a clock rolled back while offline can't go below it. */
  watermark: number
  /** Set after tampering: every preset site is blocked until the strict lock expires. */
  strict: boolean
}

export interface Persistence {
  read(): Buffer | null
  write(data: Buffer): void
  /** Whether rules were ever saved on this machine (kept outside the state file). */
  isMarked(): Promise<boolean>
  mark(): Promise<void>
}

export const STRICT_DAYS = 7
const MAX_REPORT_SEC = 60

export class Core {
  private listeners = new Set<(s: ServiceState) => void>()
  private saveTimer: NodeJS.Timeout | null = null

  private constructor(
    private state: PersistedState,
    readonly clock: TrustedClock,
    private readonly key: Buffer,
    private readonly store: Persistence,
    readonly tampered: boolean
  ) {}

  static async open(store: Persistence, key: Buffer, makeClock: (watermark: number) => TrustedClock): Promise<Core> {
    const raw = store.read()
    let state: PersistedState | null = null
    if (raw) {
      try {
        state = unseal<PersistedState>(key, raw)
      } catch {
        state = null
      }
    }
    const tampered = raw ? state === null : await store.isMarked()
    const clock = makeClock(state?.watermark ?? 0)
    const now = clock.now()
    if (!state || tampered) {
      state = { config: null, usage: { date: localDate(now), seconds: {} }, watermark: now.getTime(), strict: false }
    }
    const core = new Core(state, clock, key, store, tampered)
    if (tampered) core.enterStrict()
    return core
  }

  /** Replaces the rules with "all presets blocked, family filter on" and locks them for STRICT_DAYS. */
  private enterStrict(): void {
    const now = this.clock.now()
    this.state.config = {
      version: 1,
      sites: PRESETS.map((p) => ({ ...p, dailyMinutes: 0, windows: [] })),
      filter: 'family',
      lockUntil: new Date(now.getTime() + STRICT_DAYS * 86_400_000).toISOString(),
      createdAt: now.toISOString()
    }
    this.state.strict = true
    this.persist()
  }

  getState(): ServiceState {
    const now = this.clock.now()
    const { config } = this.state
    const locked = !!config && now.getTime() < Date.parse(config.lockUntil)
    const strict = this.state.strict && locked
    let sites = config ? evaluate(config, this.state.usage, now) : []
    if (strict && config) {
      sites = sites.map((s) => ({ ...s, allowed: false, reason: 'strict', remainingSec: undefined, nextOpenAt: config.lockUntil }))
    }
    return { now: now.toISOString(), configured: !!config, locked, strict, config, sites }
  }

  reportUsage(siteId: string, seconds: number): ServiceState {
    if (!Number.isFinite(seconds)) throw new Error('Invalid seconds')
    const sec = Math.min(MAX_REPORT_SEC, Math.max(0, Math.round(seconds)))
    if (!this.state.config?.sites.some((s) => s.id === siteId)) throw new Error('Unknown site')
    const today = localDate(this.clock.now())
    if (this.state.usage.date !== today) this.state.usage = { date: today, seconds: {} }
    this.state.usage.seconds[siteId] = (this.state.usage.seconds[siteId] ?? 0) + sec
    this.scheduleSave()
    return this.changed()
  }

  async saveConfig(next: Config): Promise<ServiceState> {
    const problem = validateConfig(next)
    if (problem) throw new Error(problem)
    const now = this.clock.now()
    if (Date.parse(next.lockUntil) <= now.getTime()) throw new Error('Pick a lock date in the future')
    const current = this.getState()
    if (current.locked && this.state.config) {
      const check = isStricter(this.state.config, next)
      if (!check.ok) throw new Error(`Locked until ${new Date(this.state.config.lockUntil).toLocaleString()}: ${check.reason}`)
    } else {
      this.state.strict = false
    }
    this.state.config = { ...next, createdAt: now.toISOString() }
    this.persist()
    await this.store.mark()
    return this.changed()
  }

  onChange(fn: (s: ServiceState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  changed(): ServiceState {
    const s = this.getState()
    for (const fn of this.listeners) fn(s)
    return s
  }

  persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.state.watermark = Math.max(this.state.watermark, this.clock.now().getTime())
    this.store.write(seal(this.key, this.state))
  }

  private scheduleSave(): void {
    this.saveTimer ??= setTimeout(() => this.persist(), 2000)
  }
}
