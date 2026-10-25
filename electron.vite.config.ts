import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          service: resolve(__dirname, 'src/service/main.ts')
        }
      }
    }
  },
  preload: {
    build: {
      // Sandboxed preloads can't require node_modules, so the toolbar's extension buttons are bundled in.
      externalizeDeps: { exclude: ['electron-chrome-extensions'] },
      rollupOptions: {
        input: {
          toolbar: resolve(__dirname, 'src/preload/toolbar.ts'),
          pages: resolve(__dirname, 'src/preload/pages.ts')
        },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          toolbar: resolve(__dirname, 'src/renderer/toolbar/index.html'),
          pages: resolve(__dirname, 'src/renderer/pages/index.html')
        }
      }
    }
  }
})
