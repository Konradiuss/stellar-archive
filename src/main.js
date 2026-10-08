// Before anything of Pixi: Pixi without `new Function`, as the CSP allows no eval.
import 'pixi.js/unsafe-eval'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/fonts.css'
import './style.css'
import './styles/crt.css'
import './styles/reading.css'
import App from './App.vue'
import { safeStorage } from './composables/usePersistentState'
import { reloadForStaleBuild } from './utils/staleBuild'
import { installErrorReport } from './utils/errorReport'
import { useUIStore } from './stores/uiStore'

// A file of an older build the host no longer has: the page reloads once (utils/staleBuild.js).
window.addEventListener('vite:preloadError', event => {
  reloadForStaleBuild(event, { storage: safeStorage('sessionStorage'), reload: () => window.location.reload() })
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
// An error while a screen is built behind the shutters is shown in the loader (utils/errorReport.js).
installErrorReport(app, () => useUIStore(pinia))
app.mount('#app')
