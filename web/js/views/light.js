// Noise traffic light: one big, unmistakable color for a classroom, an
// office or a workshop. It follows the Leq of the last few seconds, so a
// single slammed door does not flip it to red.

import { meter } from '../meter.js'
import { getSettings, onSettings } from '../store.js'
import { t } from '../i18n.js'
import { fmtDb, icon } from '../format.js'

export default {
  title: () => t('nav.light'),
  mount,
}

function mount(root) {
  root.innerHTML = template()
  const $ = (id) => root.querySelector('#' + id)
  const view = root.querySelector('.light')
  let color = ''
  let redTime = 0, totalTime = 0
  let lastUpdate = 0

  function colorFor(level) {
    const s = getSettings()
    if (level >= s.lightRed) return 'red'
    if (level >= s.lightGreen) return 'yellow'
    return 'green'
  }

  function update(frame) {
    const s = getSettings()
    const level = meter.recentLeq(s.weighting, s.lightAvg)
    if (level == null) return
    totalTime += frame.dt
    const c = colorFor(level)
    if (c === 'red') redTime += frame.dt
    if (c !== color) {
      color = c
      view.dataset.color = c
      $('msg').textContent = t('light.' + c)
      if (c === 'red' && navigator.vibrate && s.alertVibrate) navigator.vibrate([200, 100, 200])
    }
    const now = performance.now()
    if (now - lastUpdate > 250) {
      lastUpdate = now
      $('num').textContent = fmtDb(level, 0)
      $('red').textContent = totalTime > 5 ? t('light.redFor', { pct: Math.round(redTime / totalTime * 100) }) : ''
    }
  }

  function renderState() {
    const st = meter.state
    const live = st === 'running' || st === 'paused' || (st === 'starting' && meter.session.seconds > 0)
    view.dataset.live = String(live)
    $('tap').hidden = live
    const busy = st === 'running' || st === 'starting'
    $('pp').hidden = !live
    $('pp').innerHTML = icon(busy ? 'pause' : 'play') + `<span>${t(busy ? 'ctl.pause' : 'ctl.resume')}</span>`
    view.classList.toggle('is-paused', st === 'paused')
    if (!live) {
      view.dataset.color = ''
      color = ''
      $('num').textContent = '––'
      $('msg').textContent = ''
    }
    renderCaption()
  }

  function renderCaption() {
    const s = getSettings()
    $('cap').textContent = t('light.avg', { s: s.lightAvg, w: s.weighting })
    $('thr').innerHTML = `<span class="g">&lt; ${s.lightGreen}</span><span class="y">${s.lightGreen}–${s.lightRed}</span><span class="r">≥ ${s.lightRed}</span>`
  }

  function onFull() {
    const full = !!document.fullscreenElement
    document.documentElement.classList.toggle('is-immersive', full)
    $('fs').innerHTML = icon(full ? 'shrink' : 'expand') + `<span>${t(full ? 'light.exitFullscreen' : 'light.fullscreen')}</span>`
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#pp')) {
      meter.toggle()
      return
    }
    if (e.target.closest('#fs')) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // No Fullscreen API (iOS): at least hide our own chrome.
        document.documentElement.classList.toggle('is-immersive')
      })
      return
    }
    if (meter.state === 'idle' || meter.state === 'error') meter.start()
  })

  const onFrame = (e) => update(e.detail)
  meter.addEventListener('frame', onFrame)
  meter.addEventListener('state', renderState)
  document.addEventListener('fullscreenchange', onFull)
  const offSettings = onSettings((key) => {
    if (key.startsWith('light') || key === 'weighting') { renderCaption(); color = '' }
  })

  renderState()
  onFull()

  return () => {
    meter.removeEventListener('frame', onFrame)
    meter.removeEventListener('state', renderState)
    document.removeEventListener('fullscreenchange', onFull)
    offSettings()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    document.documentElement.classList.remove('is-immersive')
  }
}

function template() {
  return `
<section class="light" data-color="" data-live="false">
  <div class="lamps" aria-hidden="true">
    <span class="lamp lamp-red"></span>
    <span class="lamp lamp-yellow"></span>
    <span class="lamp lamp-green"></span>
  </div>
  <div class="light-read">
    <div class="light-num" id="num">––</div>
    <div class="light-msg" id="msg" aria-live="polite"></div>
    <div class="light-cap k" id="cap"></div>
    <div class="light-thr" id="thr"></div>
    <div class="light-red k" id="red"></div>
  </div>
  <button type="button" class="light-tap" id="tap">${icon('mic')}<span>${t('light.start')}</span></button>
  <p class="light-hint">${t('light.hint')}</p>
  <div class="light-ctl">
    <button type="button" class="btn-ghost" id="pp" hidden></button>
    <button type="button" class="btn-ghost" id="fs"></button>
  </div>
</section>`
}
