import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-wasm',
      buildStart() {
        const wasmFiles = ['web-ifc.wasm', 'web-ifc-mt.wasm']
        wasmFiles.forEach(file => {
          try {
            copyFileSync(
              resolve(__dirname, `node_modules/web-ifc/${file}`),
              resolve(__dirname, `public/${file}`)
            )
          } catch (e) {
            console.warn(`Could not copy ${file}:`, e)
          }
        })
      }
    }
  ],
  server: {
    port: 5180,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  optimizeDeps: {
    include: ['@thatopen/components', '@thatopen/fragments'],
    exclude: ['web-ifc-three']
  },
  publicDir: 'public',
  assetsInclude: ['**/*.wasm']
})

