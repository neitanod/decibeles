// The main screen: dial, readout, session numbers, controls and the panels
// (history, spectrum, waterfall, dose, reference scale).

import { meter } from '../meter.js'
import { getSettings, setSetting, onSettings } from '../store.js'
import { t } from '../i18n.js'
import { Gauge } from '../ui/gauge.js'
import { drawHistory } from '../ui/history.js'
import { Spectrum, Waterfall, waterfallY } from '../ui/spectrum.js'
import { shareRecord } from '../ui/sharecard.js'
import { allowedSeconds, NIOSH } from '../stats.js'
import { toast } from '../toast.js'
import {
  fmtDb, fmtClock, fmtSpan, fmtFreq, noteName, describe, zoneIndex, ZONES, SCALE, icon,
} from '../format.js'

const PANELS = ['history', 'spectrum', 'waterfall', 'dose', 'scale']
const READOUT_MS = 200

export default {
  title: () => t('nav.meter'),
  mount,
}

function mount(root) {
  root.innerHTML = template()
  const $ = (id) => root.querySelector('#' + id)
  const section = root.querySelector('.meter')
  const gauge = new Gauge($('gauge'))
  const spectrum = new Spectrum()
  const waterfall = new Waterfall()
  let raf = 0
  let lastReadout = 0
  let dirty = true

  // --- State and readout -----------------------------------------------

  function renderState() {
    const st = meter.state
    section.dataset.state = st
    section.classList.toggle('is-hold', !!meter.hold)
    // A resume goes through 'starting' too; the screen keeps the session up.
    const live = st === 'running' || st === 'paused' || (st === 'starting' && meter.session.seconds > 0)
    $('cta').hidden = live
    $('desc').hidden = !live
    $('startBtn').disabled = st === 'starting'
    $('startLabel').textContent = t(st === 'starting' ? 'start.starting' : 'start.button')
    const err = $('err')
    if (st === 'error' && meter.error) {
      err.hidden = false
      err.textContent = t(meter.error.key, { msg: meter.error.msg })
      $('startLabel').textContent = t('err.retry')
    } else err.hidden = true
    const busy = st === 'running' || st === 'starting'
    $('btnToggle').innerHTML = icon(busy ? 'pause' : 'play')
    $('btnToggle').setAttribute('aria-label', t(busy ? 'ctl.pause' : st === 'paused' ? 'ctl.resume' : 'start.button'))
    for (const id of ['btnReset', 'btnHold', 'btnMark', 'btnShare']) $(id).disabled = !live
    $('btnHold').setAttribute('aria-pressed', meter.hold ? 'true' : 'false')
    if (!live) {
      gauge.rest()
      $('num').textContent = '--.-'
    }
    $('num').classList.toggle('is-empty', !live)
    renderModes()
    renderStats(true)
  }

  function renderModes() {
    const s = getSettings()
    root.querySelectorAll('#segW button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.weighting)))
    root.querySelectorAll('#segT button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.timeWeighting)))
    $('unit').textContent = `dB(${s.weighting})`
    $('tw').textContent = s.timeWeighting === 'S' ? 'SLOW' : 'FAST'
    $('leqK').textContent = `L${s.weighting}eq`
  }

  function renderStats(force) {
    const now = performance.now()
    if (!force && now - lastReadout < READOUT_MS) return
    lastReadout = now
    const s = getSettings()
    const ses = meter.session
    const w = ses.w[s.weighting]
    const min = s.timeWeighting === 'S' ? w.minS : w.minF
    const max = s.timeWeighting === 'S' ? w.maxS : w.maxF
    $('sMin').textContent = fmtDb(min)
    $('sLeq').textContent = fmtDb(ses.leq(s.weighting))
    $('sMax').textContent = fmtDb(max)
    $('sPeak').textContent = fmtDb(ses.peak)
    $('clock').textContent = fmtClock(ses.seconds)
    const level = meter.display()
    if (level != null && !meter.hold && meter.state !== 'idle') {
      $('num').textContent = fmtDb(level)
      const z = zoneIndex(level)
      $('descZone').textContent = t(ZONES[z].key)
      $('descText').textContent = describe(level)
      section.style.setProperty('--zone', `var(${ZONES[z].css})`)
      section.style.setProperty('--glow-a', String(Math.min(0.55, Math.max(0.08, (level - 30) / 120))))
    }
    $('sat').hidden = !meter.overloaded
    section.classList.toggle('is-alert', s.alertOn && level != null && level >= s.alertLevel)
  }

  function onFrame() {
    if (meter.hold) return
    const s = getSettings()
    const level = meter.display()
    const w = meter.session.w[s.weighting]
    gauge.set(level, {
      peak: s.timeWeighting === 'S' ? w.maxS : w.maxF,
      leq: meter.session.leq(s.weighting),
    })
    renderStats(false)
    dirty = true
  }

  // --- Panels ------------------------------------------------------------

  function renderTabs() {
    const p = getSettings().panel
    root.querySelectorAll('.tabs button').forEach((b) => {
      const on = b.dataset.p === p
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    })
    const panel = $('panel')
    panel.dataset.panel = p
    panel.innerHTML = panelTemplate(p)
    panel.querySelectorAll('[data-range]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.range === getSettings().historyRange))
    })
    if (p === 'waterfall') positionWaterfallAxis()
    dirty = true
  }

  function positionWaterfallAxis() {
    const fs = meter.sampleRate
    root.querySelectorAll('.wf-axis span').forEach((s) => {
      s.style.top = (waterfallY(Number(s.dataset.f), fs) * 100).toFixed(2) + '%'
    })
  }

  function drawPanel() {
    const s = getSettings()
    const p = s.panel
    const panel = $('panel')
    if (p === 'history') {
      if (!dirty) return
      const canvas = panel.querySelector('canvas')
      const live = s.historyRange !== 'session'
      const values = live
        ? meter.liveValues(s.weighting, s.timeWeighting)
        : meter.session.series[s.weighting].map((v) => v / 10)
      const easing = drawHistory(canvas, values, {
        mode: live ? 'live' : 'session',
        leq: meter.session.leq(s.weighting),
        alert: s.alertOn ? s.alertLevel : null,
        markers: meter.session.markers.map((m) => m.t),
        events: live ? null : meter.session.allEvents(),
      })
      dirty = easing
    } else if (p === 'spectrum') {
      if (!meter.analyser || meter.state !== 'running' || meter.hold) return
      const canvas = panel.querySelector('canvas')
      const ref = meter.levels ? meter.levels[s.weighting].f : null
      const d = spectrum.draw(canvas, meter.analyser, meter.sampleRate, s.weighting, ref)
      const dom = panel.querySelector('#dom')
      if (dom && performance.now() - (dom._t || 0) > 250) {
        dom._t = performance.now()
        dom.textContent = `${fmtFreq(d.dominant)} · ${noteName(d.dominant)}`
      }
    } else if (p === 'waterfall') {
      if (!meter.analyser || meter.state !== 'running' || meter.hold) return
      waterfall.draw(panel.querySelector('canvas'), meter.analyser, meter.sampleRate)
    } else if (p === 'dose') {
      if (!dirty) return
      renderDose(panel)
      dirty = false
    } else if (p === 'scale') {
      if (!dirty) return
      renderScale(panel)
      dirty = false
    }
  }

  function renderDose(panel) {
    const ses = meter.session
    const pct = ses.dose * 100
    const ring = panel.querySelector('.ring-fg')
    const C = 2 * Math.PI * 52
    ring.style.strokeDasharray = `${(Math.min(100, pct) / 100) * C} ${C}`
    // A round cap on a zero-length stroke still paints a dot.
    ring.style.opacity = pct > 0.05 ? '1' : '0'
    ring.style.stroke = `var(${pct >= 100 ? '--z5' : pct >= 50 ? '--z4' : pct >= 25 ? '--z3' : '--z1'})`
    panel.querySelector('#dosePct').textContent = pct < 10 ? pct.toFixed(1) : Math.round(pct)
    const las = meter.levels ? meter.levels.A.s : null
    const laeq = ses.leq('A')
    panel.querySelector('#doseNow').textContent = las != null ? `${fmtDb(las)} dB` : '–'
    panel.querySelector('#doseLeq').textContent = laeq != null ? `${fmtDb(laeq)} dB` : '–'
    const proj = laeq != null && laeq >= NIOSH.threshold ? (8 * 3600 / allowedSeconds(laeq)) * 100 : 0
    panel.querySelector('#doseProj').textContent = laeq != null ? `${Math.round(proj)} %` : '–'
    panel.querySelector('#doseMsg').textContent = las == null
      ? ''
      : las < NIOSH.threshold
        ? t('dose.belowThreshold')
        : t('dose.allowed', { level: Math.round(las), time: fmtSpan(allowedSeconds(las)) })
  }

  function renderScale(panel) {
    const level = meter.display()
    const marker = panel.querySelector('.scale-you')
    const rows = [...panel.querySelectorAll('.scale-row')]
    if (level == null || meter.state === 'idle' || !rows.length) { marker.hidden = true; return }
    marker.hidden = false
    // Interpolate between the two rows around the level.
    const lv = rows.map((r) => Number(r.dataset.l))
    const ys = rows.map((r) => r.offsetTop + r.offsetHeight / 2)
    let y = level >= lv[0] ? ys[0] : ys[ys.length - 1]
    for (let i = 0; i < lv.length - 1; i++) {
      if (level <= lv[i] && level >= lv[i + 1]) {
        const f = (lv[i] - level) / (lv[i] - lv[i + 1])
        y = ys[i] + (ys[i + 1] - ys[i]) * f
        break
      }
    }
    marker.style.transform = `translateY(${y.toFixed(1)}px)`
    marker.querySelector('b').textContent = fmtDb(level)
  }

  function loop() {
    drawPanel()
    raf = requestAnimationFrame(loop)
  }

  // --- Events ------------------------------------------------------------

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.id === 'startBtn') meter.start()
    else if (b.id === 'btnToggle') meter.toggle()
    else if (b.id === 'btnReset') {
      const saved = meter.session.seconds >= 10 && getSettings().autosave
      meter.reset()
      if (saved) toast(t('ctl.resetDone'))
      dirty = true
      renderStats(true)
    } else if (b.id === 'btnHold') {
      meter.hold = !meter.hold
      meter.dispatchEvent(new CustomEvent('state', { detail: meter.state }))
    } else if (b.id === 'btnMark') {
      const n = meter.addMarker()
      toast(t('ctl.markerAdded', { n }))
      if (navigator.vibrate) navigator.vibrate(30)
    } else if (b.id === 'btnShare') {
      const r = await shareRecord(meter.session.toRecord(), getSettings().weighting)
      if (r === 'downloaded') toast(t('share.saved'))
    } else if (b.dataset.w) setSetting('weighting', b.dataset.v)
    else if (b.dataset.t) setSetting('timeWeighting', b.dataset.v)
    else if (b.dataset.p) setSetting('panel', b.dataset.p)
    else if (b.dataset.range) {
      setSetting('historyRange', b.dataset.range)
      root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      dirty = true
    }
  })

  // Arrow keys move between panel tabs, as in any tablist.
  root.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = PANELS.indexOf(getSettings().panel)
    const next = PANELS[(i + (e.key === 'ArrowRight' ? 1 : PANELS.length - 1)) % PANELS.length]
    setSetting('panel', next)
    root.querySelector(`.tabs [data-p="${next}"]`).focus()
  })

  const offs = [
    on(meter, 'state', renderState),
    on(meter, 'frame', onFrame),
    on(meter, 'reset', () => { dirty = true; renderStats(true) }),
    onSettings((key) => {
      if (key === 'panel') renderTabs()
      if (key === 'weighting' || key === 'timeWeighting') { renderModes(); renderStats(true); dirty = true }
      if (key === 'theme') dirty = true
    }),
  ]
  const onResize = () => { dirty = true; if (getSettings().panel === 'waterfall') positionWaterfallAxis() }
  window.addEventListener('resize', onResize)

  renderTabs()
  renderState()
  raf = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(raf)
    gauge.destroy()
    offs.forEach((off) => off())
    window.removeEventListener('resize', onResize)
  }
}

function on(target, type, fn) {
  target.addEventListener(type, fn)
  return () => target.removeEventListener(type, fn)
}

function template() {
  const s = getSettings()
  const seg = (attr, v, label) => `<button type="button" role="radio" data-${attr}="1" data-v="${v}">${label}</button>`
  return `
<section class="meter" data-state="idle">
  <div class="hero">
    <div class="gauge" id="gauge">
      <div class="readout">
        <div class="readout-num is-empty" id="num">--.-</div>
        <div class="readout-unit"><span id="unit">dB(${s.weighting})</span><i></i><span id="tw">FAST</span></div>
      </div>
      <div class="sat" id="sat" hidden>${t('status.overload')}</div>
    </div>
    <div class="descriptor" id="desc" hidden>
      <span class="zdot"></span><b id="descZone"></b><span id="descText"></span>
    </div>
    <div class="cta" id="cta">
      <button type="button" class="btn-start" id="startBtn">${icon('mic')}<span id="startLabel">${t('start.button')}</span></button>
      <p class="cta-note">${t('start.privacy')}</p>
      <p class="cta-error" id="err" role="alert" hidden></p>
    </div>
  </div>

  <div class="deck">
    <div class="stats">
      <div class="stat"><span class="k">${t('stat.min')}</span><span class="v" id="sMin">–.–</span></div>
      <div class="stat stat-leq"><span class="k" id="leqK">LAeq</span><span class="v" id="sLeq">–.–</span></div>
      <div class="stat"><span class="k">${t('stat.max')}</span><span class="v" id="sMax">–.–</span></div>
      <div class="stat"><span class="k">${t('stat.peak')}</span><span class="v" id="sPeak">–.–</span></div>
    </div>
    <div class="modes">
      <div class="seg" id="segW" role="radiogroup" aria-label="${t('set.weighting')}">
        ${seg('w', 'A', 'A')}${seg('w', 'C', 'C')}${seg('w', 'Z', 'Z')}
      </div>
      <div class="clock"><span class="k">${t('stat.session')}</span><span id="clock">00:00</span></div>
      <div class="seg" id="segT" role="radiogroup" aria-label="${t('set.time')}">
        ${seg('t', 'F', 'F')}${seg('t', 'S', 'S')}
      </div>
    </div>
    <div class="controls">
      <button type="button" class="ctl" id="btnReset" title="${t('ctl.reset')}">${icon('reset')}<span>${t('ctl.resetShort')}</span></button>
      <button type="button" class="ctl" id="btnHold" aria-pressed="false">${icon('hold')}<span>${t('ctl.hold')}</span></button>
      <button type="button" class="ctl ctl-main" id="btnToggle">${icon('play')}</button>
      <button type="button" class="ctl" id="btnMark">${icon('flag')}<span>${t('ctl.marker')}</span></button>
      <button type="button" class="ctl" id="btnShare">${icon('share')}<span>${t('ctl.share')}</span></button>
    </div>
  </div>

  <div class="panels">
    <div class="tabs" role="tablist">
      ${PANELS.map((p) => `<button type="button" role="tab" data-p="${p}" aria-controls="panel">${t('panel.' + p)}</button>`).join('')}
    </div>
    <div class="panel" id="panel" role="tabpanel"></div>
  </div>
</section>`
}

function panelTemplate(p) {
  if (p === 'history') {
    return `
      <div class="panel-head">
        <div class="seg small" role="radiogroup">
          <button type="button" role="radio" data-range="live">${t('history.live')}</button>
          <button type="button" role="radio" data-range="session">${t('history.session')}</button>
        </div>
      </div>
      <canvas class="chart"></canvas>`
  }
  if (p === 'spectrum') {
    return `
      <div class="panel-head">
        <span class="k">${t('spectrum.relative')}</span>
        <span class="dom"><span class="k">${t('spectrum.dominant')}</span> <b id="dom">–</b></span>
      </div>
      <canvas class="chart"></canvas>`
  }
  if (p === 'waterfall') {
    const marks = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
    return `
      <div class="wf">
        <canvas class="chart wf-canvas"></canvas>
        <div class="wf-axis">${marks.map((f) => `<span data-f="${f}">${f >= 1000 ? f / 1000 + 'k' : f}</span>`).join('')}</div>
      </div>`
  }
  if (p === 'dose') {
    return `
      <div class="dose">
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-bg" cx="60" cy="60" r="52"/>
            <circle class="ring-fg" cx="60" cy="60" r="52" transform="rotate(-90 60 60)"/>
          </svg>
          <div class="ring-text"><b><span id="dosePct">0</span><small>%</small></b><span>${t('dose.ofDaily')}</span></div>
        </div>
        <div class="dose-info">
          <div class="kv"><span>${t('dose.now')}</span><b id="doseNow">–</b></div>
          <div class="kv"><span>${t('dose.sessionLeq')}</span><b id="doseLeq">–</b></div>
          <div class="kv"><span>${t('dose.projected')}</span><b id="doseProj">–</b></div>
          <p class="dose-msg" id="doseMsg"></p>
          <p class="fine">${t('dose.reference')}</p>
        </div>
      </div>`
  }
  return `
    <div class="scale">
      <div class="scale-title k">${t('scale.title')}</div>
      <div class="scale-list">
        ${SCALE.map((l) => `
          <div class="scale-row${l === 85 ? ' is-limit' : ''}" data-l="${l}" style="--zc: var(${ZONES[zoneIndex(l)].css})">
            <b>${l}</b><span>${t('scale.' + l)}</span>
          </div>`).join('')}
        <div class="scale-you" hidden><i></i><span>${t('scale.you')}</span><b></b></div>
      </div>
    </div>`
}
