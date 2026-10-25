import { TrustedClock } from './clock'
import { Core } from './core'
import { loadOrCreateKey } from './crypto'
import { DEV, MAC, log } from './env'
import { applyPolicies } from './policies'
import { applyMacPolicies } from './policies-mac'
import { startServer } from './server'
import { fileStore, KEY_FILE, prepareDataDir } from './store'
import { servicePort } from '../shared/protocol'

const CLOCK_SYNC_MS = 15 * 60_000
const WATERMARK_SAVE_MS = 60_000
const POLICY_CHECK_MS = 5 * 60_000

async function main(): Promise<void> {
  // Used by the uninstaller: clear the other-browser blocklists and filter DNS, then exit.
  if (process.argv.includes('--remove-policies')) {
    await (MAC ? applyMacPolicies : applyPolicies)([], 'off')
    process.exit(0)
  }
  log(`Productive Browser service starting${DEV ? ' (dev)' : ''}`)
  await prepareDataDir()
  const key = loadOrCreateKey(KEY_FILE)
  const core = await Core.open(fileStore, key, (watermark) => new TrustedClock(watermark))
  if (core.tampered) log('state file missing or modified: strict mode enabled')

  const sync = async (): Promise<void> => {
    const ok = await core.clock.sync()
    log(ok ? `clock synced: ${core.clock.now().toISOString()}` : 'clock sync failed, using system clock floor')
    core.changed()
  }
  await sync()
  setInterval(sync, CLOCK_SYNC_MS)
  // A timer that fires far later than scheduled means the PC slept: resync then.
  let lastTick = Date.now()
  setInterval(() => {
    if (Date.now() - lastTick > 3 * 30_000) void sync()
    lastTick = Date.now()
  }, 30_000)
  setInterval(() => core.persist(), WATERMARK_SAVE_MS)

  // Writing browser policies needs admin/root rights, so dev mode skips it.
  if (!DEV) {
    const wanted = () => {
      const config = core.getState().config
      return { domains: config?.sites.flatMap((s) => s.domains) ?? [], filter: config?.filter }
    }
    const enforce = (): Promise<void> => {
      const w = wanted()
      return (MAC ? applyMacPolicies : applyPolicies)(w.domains, w.filter)
    }
    let applied = JSON.stringify(wanted())
    await enforce()
    setInterval(() => void enforce(), POLICY_CHECK_MS)
    core.onChange(() => {
      if (JSON.stringify(wanted()) === applied) return
      applied = JSON.stringify(wanted())
      void enforce()
    })
  }

  await startServer(core, servicePort(DEV))

  const shutdown = (): void => {
    core.persist()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  log('fatal', e)
  process.exit(1)
})
