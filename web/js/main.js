// Boot: language and theme before the first render, then routes, chrome
// (status chip, tab bar, install bar, build stamp) and the service worker.

import { getSettings, onSettings } from './store.js'
import { setLang, translateStatic, t } from './i18n.js'
import { route, startRouter, rerender } from './router.js'
import { meter } from './meter.js'
import { initInstallBar, markDisplayMode } from './install.js'
import { toast } from './toast.js'
import { BUILD } from './build.js'
import meterView from './views/meter.js'
import lightView from './views/light.js'
import sessionsView from './views/sessions.js'
import sessionView from './views/session.js'
import settingsView from './views/settings.js'
import nightView from './views/night.js'
import notFound from './views/notfound.js'

const THEME_COLORS = { estudio: '#0f0e0c', fosforo: '#030805', papel: '#ece5d8' }

function applyTheme(theme) {
  if (!THEME_COLORS[theme]) theme = 'estudio'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLORS[theme])
}

setLang(getSettings().lang)
applyTheme(getSettings().theme)
markDisplayMode()
translateStatic()

// --- Status chip -----------------------------------------------------------

const status = document.getElementById('status')
let shownStatus = ''
function renderStatus() {
  let key = 'status.idle'
  if (meter.state === 'running') key = meter.hold ? 'status.hold' : meter.overloaded ? 'status.overload' : 'status.live'
  else if (meter.state === 'paused') key = 'status.paused'
  else if (meter.state === 'starting') key = 'start.starting'
  const state = key.split('.')[1]
  if (key === shownStatus) return
  shownStatus = key
  status.dataset.state = state
  status.querySelector('span').textContent = t(key)
}
meter.addEventListener('state', renderStatus)
meter.addEventListener('frame', renderStatus)

meter.addEventListener('alert', (e) => {
  const root = document.documentElement
  root.classList.remove('flash')
  void root.offsetWidth
  root.classList.add('flash')
  toast(t('alert.over', { level: getSettings().alertLevel }) + ` · ${e.detail.toFixed(1)} dB`, { tone: 'bad' })
})

// --- Routes ----------------------------------------------------------------

const nav = document.querySelectorAll('[data-nav]')
function highlightNav(path) {
  nav.forEach((a) => {
    const target = a.dataset.nav
    const on = target === '/' ? path === '/' : path.startsWith(target)
    if (on) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  document.documentElement.dataset.view = path === '/' ? 'meter' : path.split('/')[1]
}

route(/^\/$/, meterView)
route(/^\/traffic-light$/, lightView)
route(/^\/sessions$/, sessionsView)
route(/^\/sessions\/([^/]+)$/, sessionView)
route(/^\/settings$/, settingsView)
route(/^\/night$/, nightView)
startRouter(document.getElementById('view'), { notFound, changed: highlightNav })

onSettings((key, value) => {
  if (key === 'theme') applyTheme(value)
  if (key === 'lang') {
    setLang(value)
    translateStatic()
    shownStatus = ''
    renderStatus()
    syncInstall()
    rerender()
  }
})

const syncInstall = initInstallBar(document.getElementById('install-bar'))
document.getElementById('build-stamp').textContent = BUILD
renderStatus()

// Pull-to-refresh is pure cost in an installed app: it reloads and drops the
// running measurement.
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', markDisplayMode)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  })
}
