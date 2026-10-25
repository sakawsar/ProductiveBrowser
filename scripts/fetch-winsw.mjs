// Downloads the WinSW service wrapper used by the installer (named to match its .xml config).
import { existsSync, writeFileSync } from 'node:fs'

const VERSION = 'v2.12.0'
const target = new URL('../build/winsw/ProductiveBrowserService.exe', import.meta.url)

if (existsSync(target)) {
  console.log('WinSW already present')
} else {
  const res = await fetch(`https://github.com/winsw/winsw/releases/download/${VERSION}/WinSW-x64.exe`)
  if (!res.ok) throw new Error(`WinSW download failed: ${res.status}`)
  writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  console.log(`Downloaded WinSW ${VERSION}`)
}
