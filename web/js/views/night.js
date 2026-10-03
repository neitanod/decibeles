// Night mode: measure all night with an almost black screen. The wake lock
// keeps the measurement alive (a sleeping screen lets the phone throttle the
// page), the dim digits cost next to nothing on an OLED screen, and they
// drift a little every minute so nothing burns in.

import { meter } from '../meter.js'
import { getSettings } from '../store.js'
import { t } from '../i18n.js'
import { navigate } from '../router.js'
import { fmtClock, fmtDate } from '../format.js'

export default {
  title: () => t('night.title'),
  mount,
}

function mount(root) {
  root.innerHTML = `
    <section class="night" aria-live="off">
      <div class="night-box" id="box">
        <div class="night-num" id="num">--</div>
        <div class="night-unit" id="unit"></div>
        <div class="night-meta"><span id="nClock"></span><i></i><span id="nDur"></span><i></i><span id="nEv"></span></div>
      </div>
      <p class="night-hint" id="hint">${t('night.hint')}</p>
    </section>`
  const $ = (id) => root.querySelector('#' + id)
  const html = document.documentElement
  html.classList.add('is-immersive', 'is-night')
  // The status bar goes black too.
  const meta = document.querySelector('meta[name="theme-color"]')
  const themeColor = meta.getAttribute('content')
  meta.setAttribute('content', '#000000')

  if (meter.state === 'idle' || meter.state === 'error' || meter.state === 'paused') meter.start()

  function tick() {
    const s = getSettings()
    const level = meter.state === 'running' ? meter.recentLeq(s.weighting, 1) : null
    $('num').textContent = level == null ? '--' : Math.round(level)
    $('unit').textContent = `dB(${s.weighting})`
    $('nClock').textContent = fmtDate(Date.now(), { timeStyle: 'short' })
    $('nDur').textContent = fmtClock(meter.session.seconds)
    const n = meter.session.allEvents().length
    $('nEv').textContent = t('night.events', { n })
  }

  function drift() {
    const x = Math.round((Math.random() - 0.5) * 60)
    const y = Math.round((Math.random() - 0.5) * 120)
    $('box').style.transform = `translate(${x}px, ${y}px)`
  }

  function exit() {
    if (history.length > 1) history.back()
    else navigate('/')
  }

  const onKey = (e) => { if (e.key === 'Escape') exit() }
  root.addEventListener('dblclick', exit)
  document.addEventListener('keydown', onKey)

  // Touch devices do not always fire dblclick; two taps within 350 ms do.
  let lastTap = 0
  const onTouch = () => {
    const now = Date.now()
    if (now - lastTap < 350) exit()
    lastTap = now
    $('hint').classList.remove('is-gone')
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => $('hint').classList.add('is-gone'), 4000)
  }
  root.addEventListener('touchend', onTouch)
  let hintTimer = setTimeout(() => $('hint').classList.add('is-gone'), 5000)

  tick()
  const every = setInterval(tick, 1000)
  const drifting = setInterval(drift, 60000)

  return () => {
    clearInterval(every)
    clearInterval(drifting)
    clearTimeout(hintTimer)
    document.removeEventListener('keydown', onKey)
    html.classList.remove('is-immersive', 'is-night')
    meta.setAttribute('content', themeColor)
  }
}
