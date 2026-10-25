import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { seal, unseal } from '../src/service/crypto'
import { TrustedClock } from '../src/service/clock'
import { Core, type Persistence } from '../src/service/core'
import type { Config } from '../src/shared/types'

describe('crypto', () => {
  const key = randomBytes(32)
  it('round-trips', () => {
    expect(unseal(key, seal(key, { a: 1 }))).toEqual({ a: 1 })
  })
  it('detects any modified byte', () => {
    const data = seal(key, { minutes: 30 })
    data[data.length - 1] ^= 1
    expect(() => unseal(key, data)).toThrow()
  })
  it('rejects another key', () => {
    expect(() => unseal(randomBytes(32), seal(key, {}))).toThrow()
  })
})

/** A fake world: system clock and monotonic clock move independently. */
function fakeTime(start: number) {
  const t = { system: start, mono: 0 }
  return {
    t,
    advance(ms: number) {
      t.system += ms
      t.mono += ms
    },
    clock(watermark: number, network: number | null = null) {
      const fetcher = async () => {
        if (network === null) throw new Error('offline')
        return network + t.mono
      }
      return new TrustedClock(watermark, fetcher, () => t.system, () => t.mono)
    }
  }
}

describe('TrustedClock', () => {
  const real = Date.parse('2026-10-26T12:00:00Z')

  it('ignores system clock changes after a network sync', async () => {
    const w = fakeTime(real)
    const c = w.clock(0, real)
    await c.sync()
    w.t.system -= 86_400_000 // user turns the clock back a day
    w.advance(1000)
    expect(c.now().getTime()).toBe(real + 1000)
    w.t.system += 3 * 86_400_000 // ...or forward
    expect(c.now().getTime()).toBe(real + 1000)
  })

  it('offline: never goes below the saved watermark', () => {
    const w = fakeTime(real - 86_400_000) // clock rolled back before boot
    const c = w.clock(real)
    w.advance(5000)
    expect(c.now().getTime()).toBe(real + 5000)
  })
})

function memoryStore(): Persistence & { data: Buffer | null; marked: boolean } {
  const s = {
    data: null as Buffer | null,
    marked: false,
    read: () => s.data,
    write: (d: Buffer) => void (s.data = d),
    isMarked: async () => s.marked,
    mark: async () => void (s.marked = true)
  }
  return s
}

describe('Core', () => {
  const key = randomBytes(32)
  const now = new Date(2026, 9, 26, 20, 0).getTime()
  const day = 86_400_000
  const cfg = (minutes: number, lockUntil = now + day): Config => ({
    version: 1,
    createdAt: '',
    lockUntil: new Date(lockUntil).toISOString(),
    sites: [{ id: 'yt', name: 'YouTube', domains: ['youtube.com'], dailyMinutes: minutes, windows: [] }]
  })
  const open = (store: Persistence, at = now) => Core.open(store, key, (wm) => fakeTime(at).clock(wm, at))

  it('refuses loosening while locked but allows tightening', async () => {
    const store = memoryStore()
    const core = await open(store)
    await core.saveConfig(cfg(30))
    await expect(core.saveConfig(cfg(60))).rejects.toThrow(/Locked/)
    await expect(core.saveConfig(cfg(10))).resolves.toMatchObject({ locked: true })
  })

  it('counts usage and blocks at the quota, surviving a restart', async () => {
    const store = memoryStore()
    const core = await open(store)
    await core.saveConfig(cfg(1))
    core.reportUsage('yt', 59)
    expect(core.getState().sites[0].allowed).toBe(true)
    core.reportUsage('yt', 5)
    expect(core.getState().sites[0]).toMatchObject({ allowed: false, reason: 'quota' })
    core.persist()
    const again = await open(store, now + 60_000)
    expect(again.getState().sites[0].allowed).toBe(false)
  })

  it('caps a single usage report so it cannot be gamed', async () => {
    const core = await open(memoryStore())
    await core.saveConfig(cfg(5))
    expect(core.reportUsage('yt', -500).sites[0].usedSec).toBe(0)
    expect(core.reportUsage('yt', 10_000).sites[0].usedSec).toBe(60)
  })

  it('enters strict mode when the state file is edited', async () => {
    const store = memoryStore()
    const core = await open(store)
    await core.saveConfig(cfg(30))
    store.data![store.data!.length - 1] ^= 1
    const after = await open(store)
    expect(after.tampered).toBe(true)
    const s = after.getState()
    expect(s.strict).toBe(true)
    expect(s.sites.every((x) => !x.allowed && x.reason === 'strict')).toBe(true)
    await expect(after.saveConfig(cfg(30, now + 30 * day))).rejects.toThrow(/Locked/)
  })

  it('enters strict mode when the state file is deleted after setup', async () => {
    const store = memoryStore()
    await (await open(store)).saveConfig(cfg(30))
    store.data = null
    expect((await open(store)).getState().strict).toBe(true)
  })

  it('first run is unconfigured, not strict', async () => {
    const s = (await open(memoryStore())).getState()
    expect(s).toMatchObject({ configured: false, strict: false, locked: false })
  })
})
