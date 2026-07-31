import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { cpSync } from 'fs'

function copyRendererStatic() {
  return {
    name: 'copy-renderer-static',
    apply: 'build',
    closeBundle() {
      const src = resolve('src/renderer')
      const out = resolve('out/renderer')
      for (const name of ['assets']) cpSync(resolve(src, name), resolve(out, name), { recursive: true })
      cpSync(resolve(src, 'mobile.html'), resolve(out, 'mobile.html'))
      cpSync(resolve('version.json'), resolve(out, 'version.json'))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.js') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.js') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    publicDir: false,
    plugins: [copyRendererStatic()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
