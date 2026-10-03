// Install offer. `beforeinstallprompt` fires once and early, so it is caught
// at module load, before the app mounts. The bar shows by itself; "Not now"
// is remembered and the way back lives in Settings.

import { getSettings, setSetting } from './store.js'
import { t } from './i18n.js'

let deferred = null
const listeners = new Set()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  listeners.forEach((fn) => fn())
})

window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((fn) => fn())
})

const APP_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']

export function isStandalone() {
  const mm = window.matchMedia
  if (mm && APP_MODES.some((m) => mm.call(window, `(display-mode: ${m})`).matches)) return true
  return window.navigator.standalone === true
}

export function canInstall() {
  return !!deferred
}

export async function promptInstall() {
  if (!deferred) return false
  const e = deferred
  deferred = null // the event is single-use
  e.prompt()
  const choice = await e.userChoice.catch(() => null)
  listeners.forEach((fn) => fn())
  return choice && choice.outcome === 'accepted'
}

export function initInstallBar(bar) {
  function sync() {
    const show = canInstall() && !getSettings().installDismissed && !isStandalone()
    bar.hidden = !show
    document.documentElement.classList.toggle('has-install-bar', show)
    if (show) {
      bar.querySelector('[data-text]').textContent = t('install.text')
      bar.querySelector('[data-install]').textContent = t('install.button')
      bar.querySelector('[data-later]').textContent = t('install.later')
    }
  }
  bar.addEventListener('click', async (e) => {
    if (e.target.closest('[data-install]')) await promptInstall()
    else if (e.target.closest('[data-later]')) setSetting('installDismissed', true)
    sync()
  })
  listeners.add(sync)
  sync()
  return sync
}

export function markDisplayMode() {
  document.documentElement.dataset.display = isStandalone() ? 'standalone' : 'browser'
}
