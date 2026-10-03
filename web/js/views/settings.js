// Settings: measurement, calibration, alert, traffic light, appearance,
// data, install and about.

import { meter } from '../meter.js'
import { getSettings, setSetting, DEFAULT_OFFSET } from '../store.js'
import { t } from '../i18n.js'
import { toast } from '../toast.js'
import { canInstall, promptInstall, isStandalone } from '../install.js'
import { BUILD } from '../build.js'
import { icon, fmtDb } from '../format.js'

export default {
  title: () => t('nav.settings'),
  mount,
}

const REPO = 'https://github.com/neitanod/decibeles'

function radio(name, value, current, label) {
  return `<label class="opt"><input type="radio" name="${name}" value="${value}"${value === current ? ' checked' : ''}><span>${label}</span></label>`
}

function toggle(key, label, on) {
  return `<label class="switch"><span>${label}</span><input type="checkbox" data-key="${key}"${on ? ' checked' : ''}><i></i></label>`
}

function stepper(key, value, min, max, step, unit) {
  return `
    <div class="stepper" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}">
      <button type="button" data-d="-1" aria-label="−">−</button>
      <output>${value}</output><span class="unit">${unit}</span>
      <button type="button" data-d="1" aria-label="+">+</button>
    </div>`
}

function mount(root) {
  function render() {
    const s = getSettings()
    root.innerHTML = `
<section class="settings">
  <header class="page-head"><h1>${t('nav.settings')}</h1></header>

  <div class="group">
    <h2 class="h2">${t('set.measure')}</h2>
    <div class="card">
      <div class="row-label">${t('set.weighting')}</div>
      <div class="opts">
        ${radio('weighting', 'A', s.weighting, t('set.wA'))}
        ${radio('weighting', 'C', s.weighting, t('set.wC'))}
        ${radio('weighting', 'Z', s.weighting, t('set.wZ'))}
      </div>
      <div class="row-label">${t('set.time')}</div>
      <div class="opts">
        ${radio('timeWeighting', 'F', s.timeWeighting, t('set.tF'))}
        ${radio('timeWeighting', 'S', s.timeWeighting, t('set.tS'))}
      </div>
      <div class="row row-top"><span>${t('set.eventLevel')}</span>${stepper('eventLevel', s.eventLevel, 40, 130, 1, 'dB(A)')}</div>
      <p class="fine">${t('set.eventHint')}</p>
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.calibration')}</h2>
    <div class="card">
      <div class="row">
        <span>${t('set.offset')}</span>
        ${stepper('offset', s.offset.toFixed(1), 60, 140, 0.5, 'dB')}
      </div>
      <input type="range" class="range" id="offRange" min="60" max="140" step="0.1" value="${s.offset}" aria-label="${t('set.offset')}">
      <p class="fine">${t('set.offsetHint')}</p>
      <div class="calib">
        <label for="refIn">${t('set.refLabel')}</label>
        <div class="calib-row">
          <input id="refIn" type="number" inputmode="decimal" step="0.1" min="0" max="160" placeholder="${fmtDb(meter.display()) === '–.–' ? '65.0' : fmtDb(meter.display())}">
          <span class="unit">dB</span>
          <button type="button" class="btn-primary" id="calBtn">${t('set.calibrate')}</button>
        </div>
      </div>
      <button type="button" class="link" id="offReset">${t('set.resetOffset')} (${DEFAULT_OFFSET.toFixed(1)} dB)</button>
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.alert')}</h2>
    <div class="card">
      ${toggle('alertOn', t('set.alertOn'), s.alertOn)}
      <div class="row"><span></span>${stepper('alertLevel', s.alertLevel, 40, 130, 1, 'dB')}</div>
      ${toggle('alertVibrate', t('set.vibrate'), s.alertVibrate)}
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.light')}</h2>
    <div class="card">
      <div class="row"><span><i class="dot g"></i>${t('set.greenUntil')}</span>${stepper('lightGreen', s.lightGreen, 30, 120, 1, 'dB')}</div>
      <div class="row"><span><i class="dot r"></i>${t('set.redFrom')}</span>${stepper('lightRed', s.lightRed, 31, 130, 1, 'dB')}</div>
      <div class="row"><span>${t('set.average')}</span>${stepper('lightAvg', s.lightAvg, 1, 30, 1, 's')}</div>
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.appearance')}</h2>
    <div class="card">
      <div class="row-label">${t('set.theme')}</div>
      <div class="themes">
        ${['estudio', 'fosforo', 'papel'].map((th) => `
          <label class="theme-opt" data-preview="${th}">
            <input type="radio" name="theme" value="${th}"${s.theme === th ? ' checked' : ''}>
            <span class="swatch"><i></i><i></i><i></i></span>
            <span>${t('set.theme.' + th)}</span>
          </label>`).join('')}
      </div>
      <div class="row-label">${t('set.language')}</div>
      <div class="opts opts-inline">
        ${radio('lang', 'auto', s.lang, t('set.lang.auto'))}
        ${radio('lang', 'es', s.lang, 'Español')}
        ${radio('lang', 'en', s.lang, 'English')}
      </div>
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.data')}</h2>
    <div class="card">
      ${toggle('autosave', t('set.autosave'), s.autosave)}
      ${toggle('wakeLock', t('set.wakelock'), s.wakeLock)}
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.install')}</h2>
    <div class="card">
      ${isStandalone()
        ? `<p class="fine">${t('set.installed')}</p>`
        : canInstall()
          ? `<button type="button" class="btn-primary" id="instBtn">${icon('install')}<span>${t('install.button')}</span></button>`
          : `<p class="fine">${t('set.installManual')}</p>`}
      ${s.installDismissed && !isStandalone() ? `<button type="button" class="link" id="instAgain">${t('set.showInstall')}</button>` : ''}
    </div>
  </div>

  <div class="group">
    <h2 class="h2">${t('set.about')}</h2>
    <div class="card about">
      <p>${t('set.aboutText')}</p>
      <p class="fine">${t('set.disclaimer')}</p>
      <p><a href="${REPO}" target="_blank" rel="noopener">${icon('code')}<span>${t('set.source')}</span></a></p>
      <p class="k">${t('set.version')} ${BUILD}</p>
    </div>
  </div>
</section>`
  }

  function applyOffset(v) {
    v = Math.round(Math.min(140, Math.max(60, v)) * 10) / 10
    setSetting('offset', v)
    const out = root.querySelector('[data-key="offset"] output')
    if (out) out.textContent = v.toFixed(1)
    const range = root.querySelector('#offRange')
    if (range && Number(range.value) !== v) range.value = v
  }

  root.addEventListener('change', (e) => {
    const el = e.target
    if (el.type === 'radio') {
      setSetting(el.name, el.value)
      if (el.name === 'lang') render()
    } else if (el.type === 'checkbox' && el.dataset.key) {
      setSetting(el.dataset.key, el.checked)
      if (el.dataset.key === 'autosave' && el.checked) meter.autosave(true)
    }
  })

  root.addEventListener('input', (e) => {
    if (e.target.id === 'offRange') applyOffset(Number(e.target.value))
  })

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const st = b.closest('.stepper')
    if (st && b.dataset.d) {
      const key = st.dataset.key
      const step = Number(st.dataset.step)
      const s = getSettings()
      let v = Math.round((s[key] + step * Number(b.dataset.d)) * 10) / 10
      v = Math.min(Number(st.dataset.max), Math.max(Number(st.dataset.min), v))
      if (key === 'offset') return applyOffset(v)
      // Keep green below red.
      if (key === 'lightGreen' && v >= s.lightRed) v = s.lightRed - 1
      if (key === 'lightRed' && v <= s.lightGreen) v = s.lightGreen + 1
      setSetting(key, v)
      st.querySelector('output').textContent = v
      return
    }
    if (b.id === 'calBtn') {
      const ref = parseFloat(root.querySelector('#refIn').value)
      if (meter.state !== 'running' || !meter.levels) return toast(t('set.calibrateNeedsRun'))
      if (!Number.isFinite(ref)) return root.querySelector('#refIn').focus()
      // Compare against the last 3 s, which smooths out the moment of tapping.
      const now = meter.recentLeq(getSettings().weighting, 3)
      applyOffset(getSettings().offset + (ref - now))
      toast(t('set.calibrated', { v: getSettings().offset.toFixed(1) }))
    } else if (b.id === 'offReset') {
      applyOffset(DEFAULT_OFFSET)
    } else if (b.id === 'instBtn') {
      await promptInstall()
      render()
    } else if (b.id === 'instAgain') {
      setSetting('installDismissed', false)
      render()
    }
  })

  render()
  return () => {}
}
