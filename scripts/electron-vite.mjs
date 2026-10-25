// Runs electron-vite with ELECTRON_RUN_AS_NODE cleared. VS Code sets it for child processes,
// which would make Electron start as plain Node instead of opening the browser.
import { spawn } from 'node:child_process'

delete process.env.ELECTRON_RUN_AS_NODE
const child = spawn(['npx', 'electron-vite', ...process.argv.slice(2)].join(' '), { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 1))
