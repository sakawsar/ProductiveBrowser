import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, DEV, MAC, MARKER_FILE, MARKER_KEY, run } from './env'
import type { Persistence } from './core'

export const STATE_FILE = join(DATA_DIR, 'state.sealed')
export const KEY_FILE = join(DATA_DIR, 'key.bin')

/**
 * Creates the data folder. In production only the service's account can access it:
 * Windows: SYSTEM and Administrators (SIDs avoid localized names). macOS: root (the daemon's user).
 */
export async function prepareDataDir(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  if (DEV) return
  if (MAC) chmodSync(DATA_DIR, 0o700)
  else await run('icacls', [DATA_DIR, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'])
}

const windowsMarker = {
  isMarked: async (): Promise<boolean> => {
    try {
      const { stdout } = await run('reg', ['query', MARKER_KEY, '/v', 'Configured'])
      return /0x1\b/.test(stdout)
    } catch {
      return false
    }
  },
  mark: async (): Promise<void> => {
    await run('reg', ['add', MARKER_KEY, '/v', 'Configured', '/t', 'REG_DWORD', '/d', '1', '/f'])
  }
}

const macMarker = {
  isMarked: async (): Promise<boolean> => existsSync(MARKER_FILE),
  mark: async (): Promise<void> => writeFileSync(MARKER_FILE, '1', { mode: 0o644 })
}

export const fileStore: Persistence = {
  read: () => (existsSync(STATE_FILE) ? readFileSync(STATE_FILE) : null),
  write: (data) => {
    const tmp = STATE_FILE + '.tmp'
    writeFileSync(tmp, data, { mode: 0o600 })
    renameSync(tmp, STATE_FILE)
  },
  ...(MAC ? macMarker : windowsMarker)
}
