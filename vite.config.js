import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { cspMeta } from './scripts/contentSecurityPolicy.js'
import { socialPreview } from './scripts/socialPreview.js'

export default defineConfig({
  // Relative links: the site works from any folder of a static host (https://<user>.github.io/<repo>/).
  base: './',
  plugins: [vue(), cspMeta(), socialPreview()],
  build: {
    rollupOptions: {
      output: {
        // Vue and Pinia apart: they stay cached when only the site changes. Pixi splits its renderers itself.
        manualChunks(id) {
          if (/node_modules[\\/](@vue|vue|pinia)[\\/]/.test(id)) return 'vue'
        }
      }
    }
  },
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
