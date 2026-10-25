import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const DEV = process.argv.includes('--dev')
export const MAC = process.platform === 'darwin'

function dataDir(): string {
  if (MAC) {
    return DEV
      ? join(homedir(), 'Library', 'Application Support', 'ProductiveBrowserDev')
      : '/Library/Application Support/ProductiveBrowser'
  }
  return DEV
    ? join(process.env.LOCALAPPDATA ?? '.', 'ProductiveBrowserDev')
    : join(process.env.ProgramData ?? 'C:\\ProgramData', 'ProductiveBrowser')
}
export const DATA_DIR = dataDir()

/**
 * Records that rules were ever saved, outside the data folder (detects a deleted state file).
 * Windows: a registry value. macOS: a root-owned file in /Library/Preferences.
 */
export const MARKER_KEY = DEV ? 'HKCU\\Software\\ProductiveBrowserDev' : 'HKLM\\SOFTWARE\\ProductiveBrowser'
export const MARKER_FILE = DEV
  ? join(homedir(), 'Library', 'Preferences', 'com.productivebrowser.dev.configured')
  : '/Library/Preferences/com.productivebrowser.configured'

export const run = promisify(execFile)

export function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), ...args)
}
