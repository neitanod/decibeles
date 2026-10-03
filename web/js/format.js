// Formatting and small shared helpers.

import { t, getLang } from './i18n.js'

export const ZONES = [
  { max: 55, key: 'zone.quiet', css: '--z1' },
  { max: 70, key: 'zone.moderate', css: '--z2' },
  { max: 85, key: 'zone.loud', css: '--z3' },
  { max: 100, key: 'zone.veryLoud', css: '--z4' },
  { max: Infinity, key: 'zone.danger', css: '--z5' },
]

export function zoneIndex(db) {
  if (db == null || !Number.isFinite(db)) return 0
  for (let i = 0; i < ZONES.length; i++) if (db < ZONES[i].max) return i
  return ZONES.length - 1
}

export function zoneColor(db) {
  return cssVar(ZONES[zoneIndex(db)].css)
}

// Reference sounds, used for the descriptor under the gauge and the scale panel.
export const SCALE = [130, 120, 110, 100, 90, 85, 80, 70, 60, 50, 40, 30, 20, 10, 0]

export function describe(db) {
  if (db == null || !Number.isFinite(db)) return ''
  const levels = SCALE.filter((l) => l !== 85)
  let best = levels[levels.length - 1]
  for (const l of levels) if (db >= l - 5) { best = l; break }
  return t('scale.' + best)
}

export function fmtDb(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '–' + (digits ? '.–' : '')
  return v.toFixed(digits)
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const two = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`
}

// "8 h", "1 h 30 min", "15 min", "45 s"
export function fmtSpan(seconds) {
  if (!Number.isFinite(seconds)) return '∞'
  const s = Math.round(seconds)
  if (s < 60) return `${s} ${t('units.s')}`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} ${t('units.min')}`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} ${t('units.h')} ${rm} ${t('units.min')}` : `${h} ${t('units.h')}`
}

export function fmtDate(ts, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  try {
    return new Intl.DateTimeFormat(getLang(), opts).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export function fmtFreq(f) {
  if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz'
  return Math.round(f) + ' Hz'
}

const NOTES_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const NOTES_ES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si']

export function noteName(f) {
  if (!(f > 0)) return ''
  const n = 12 * Math.log2(f / 440) + 69
  const r = Math.round(n)
  const cents = Math.round((n - r) * 100)
  const names = getLang() === 'es' ? NOTES_ES : NOTES_EN
  const name = names[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1)
  return `${name} ${cents >= 0 ? '+' : '−'}${Math.abs(cents)}¢`
}

export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`
}

// Canvas sized to its CSS box at device pixel ratio. Returns the 2D context
// already scaled, plus the CSS width and height.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h, dpr }
}

// Vertical gradient that paints each height with the color of its zone.
export function zoneGradient(ctx, yOf) {
  const g = ctx.createLinearGradient(0, yOf(130), 0, yOf(20))
  const stops = [[130, '--z5'], [100, '--z5'], [92, '--z4'], [80, '--z3'], [65, '--z2'], [50, '--z1'], [20, '--z1']]
  for (const [db, v] of stops) g.addColorStop((130 - db) / 110, cssVar(v))
  return g
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
