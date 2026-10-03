// One-third octave spectrum (25 Hz – 16 kHz) and a scrolling waterfall,
// both fed by the AnalyserNode. Band levels are shifted so that their energy
// sum matches the meter's reading, which keeps the bars and the big number
// speaking the same calibrated dB.

import { fitCanvas, cssVar, zoneGradient } from '../format.js'
import { weightingSections, magnitudeDb } from '../weighting.js'

const BANDS = []
for (let n = -16; n <= 12; n++) BANDS.push(1000 * Math.pow(2, n / 3))
const NOMINAL = ['25', '31.5', '40', '50', '63', '80', '100', '125', '160', '200', '250', '315', '400', '500', '630', '800', '1k', '1.25k', '1.6k', '2k', '2.5k', '3.15k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k']
const LABELED = new Set(['31.5', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'])
const PAD = { l: 30, r: 8, t: 10, b: 20 }

const weightCache = new Map()
function bandWeights(w, fs) {
  const key = w + fs
  if (!weightCache.has(key)) {
    const sec = weightingSections(w, fs)
    weightCache.set(key, BANDS.map((f) => (f < fs / 2 ? Math.pow(10, magnitudeDb(sec, f, fs) / 10) : 0)))
  }
  return weightCache.get(key)
}

export class Spectrum {
  constructor() {
    this.buf = null
    this.peaks = new Float32Array(BANDS.length).fill(-Infinity)
    this.levels = new Float32Array(BANDS.length).fill(-Infinity)
    this.hi = 90
    this.last = 0
  }

  read(analyser) {
    if (!this.buf || this.buf.length !== analyser.frequencyBinCount) {
      this.buf = new Float32Array(analyser.frequencyBinCount)
    }
    analyser.getFloatFrequencyData(this.buf)
    return this.buf
  }

  // Returns { dominant, dominantDb } for the readout.
  draw(canvas, analyser, fs, weighting, reference) {
    const buf = this.read(analyser)
    const binHz = fs / (buf.length * 2)
    const weights = bandWeights(weighting, fs)
    const power = new Float64Array(BANDS.length)
    let total = 0
    BANDS.forEach((fc, i) => {
      const lo = Math.max(1, Math.floor(fc * Math.pow(2, -1 / 6) / binHz))
      const hi = Math.max(lo + 1, Math.floor(fc * Math.pow(2, 1 / 6) / binHz))
      let p = 0
      for (let k = lo; k < hi && k < buf.length; k++) p += Math.pow(10, buf[k] / 10)
      p *= weights[i]
      power[i] = p
      total += p
    })
    const shift = Number.isFinite(reference) && total > 0 ? reference - 10 * Math.log10(total) : 0

    const now = performance.now()
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016
    this.last = now
    let top = -Infinity
    for (let i = 0; i < BANDS.length; i++) {
      const l = power[i] > 0 ? 10 * Math.log10(power[i]) + shift : -Infinity
      this.levels[i] = l
      this.peaks[i] = Math.max(l, this.peaks[i] - 14 * dt)
      if (this.peaks[i] > top) top = this.peaks[i]
    }
    const wantHi = Math.max(60, Math.ceil((top + 8) / 10) * 10)
    this.hi += (wantHi - this.hi) * 0.05

    const { ctx, w, h } = fitCanvas(canvas)
    ctx.clearRect(0, 0, w, h)
    const pw = w - PAD.l - PAD.r
    const ph = h - PAD.t - PAD.b
    const hiDb = this.hi, loDb = hiDb - 70
    const yRaw = (db) => PAD.t + ph * (1 - (db - loDb) / (hiDb - loDb))
    const yOf = (db) => yRaw(Math.max(loDb, Math.min(hiDb, db)))

    ctx.font = '500 9px "Martian Mono", ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.lineWidth = 1
    for (let db = Math.ceil(loDb / 10) * 10; db <= hiDb; db += 10) {
      const y = Math.round(yOf(db)) + 0.5
      ctx.strokeStyle = cssVar('--grid')
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
      ctx.fillStyle = cssVar('--ink-faint')
      ctx.fillText(String(db), PAD.l - 6, y)
    }

    const slot = pw / BANDS.length
    const bw = Math.max(2, slot * 0.68)
    // The gradient needs the unclamped mapping, or every zone squeezes into
    // the visible range and a quiet band already looks orange.
    const grad = zoneGradient(ctx, yRaw)
    const ink = cssVar('--ink')
    for (let i = 0; i < BANDS.length; i++) {
      const x = PAD.l + i * slot + (slot - bw) / 2
      const y = yOf(this.levels[i])
      ctx.fillStyle = grad
      ctx.globalAlpha = 0.9
      if (Number.isFinite(this.levels[i])) ctx.fillRect(x, y, bw, PAD.t + ph - y)
      ctx.globalAlpha = 1
      if (Number.isFinite(this.peaks[i])) {
        ctx.fillStyle = ink
        ctx.fillRect(x, yOf(this.peaks[i]) - 1, bw, 2)
      }
    }

    ctx.fillStyle = cssVar('--ink-faint')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    NOMINAL.forEach((name, i) => {
      if (LABELED.has(name)) ctx.fillText(name.replace('31.5', '31'), PAD.l + (i + 0.5) * slot, h - 5)
    })

    return dominant(buf, binHz, shift)
  }
}

// Strongest bin between 40 Hz and 12 kHz, refined with a parabola through
// its neighbors.
function dominant(buf, binHz, shift) {
  const a = Math.ceil(40 / binHz)
  const b = Math.min(buf.length - 2, Math.floor(12000 / binHz))
  let k = a
  for (let i = a; i <= b; i++) if (buf[i] > buf[k]) k = i
  const y0 = buf[k - 1], y1 = buf[k], y2 = buf[k + 1]
  const den = y0 - 2 * y1 + y2
  const d = den ? 0.5 * (y0 - y2) / den : 0
  return { dominant: (k + d) * binHz, dominantDb: y1 + shift }
}

// --- Waterfall -------------------------------------------------------------

function hexToRgb(c) {
  const m = c.trim().match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  const r = c.match(/\d+(\.\d+)?/g)
  return r ? r.slice(0, 3).map(Number) : [0, 0, 0]
}

function buildLut() {
  const stops = [
    [0, hexToRgb(cssVar('--wf-0'))],
    [0.35, hexToRgb(cssVar('--wf-1'))],
    [0.6, hexToRgb(cssVar('--wf-2'))],
    [0.82, hexToRgb(cssVar('--wf-3'))],
    [1, hexToRgb(cssVar('--wf-4'))],
  ]
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let j = 0
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++
    const [t0, c0] = stops[j], [t1, c1] = stops[j + 1]
    const f = (t - t0) / (t1 - t0)
    for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = c0[ch] + (c1[ch] - c0[ch]) * f
  }
  return lut
}

export const WF_FMIN = 30
export const WF_FMAX = 16000

export class Waterfall {
  constructor() {
    this.buf = null
    this.lut = null
    this.theme = ''
    this.rows = null
    this.ceil = -40
    this.acc = 0
    this.last = 0
    this.column = null
  }

  draw(canvas, analyser, fs) {
    const theme = document.documentElement.dataset.theme
    if (theme !== this.theme) { this.lut = buildLut(); this.theme = theme; this.reset = true }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.round(canvas.clientWidth * dpr)
    const H = Math.round(canvas.clientHeight * dpr)
    if (!W || !H) return
    const ctx = canvas.getContext('2d')
    if (canvas.width !== W || canvas.height !== H || this.reset) {
      canvas.width = W
      canvas.height = H
      ctx.fillStyle = cssVar('--wf-0')
      ctx.fillRect(0, 0, W, H)
      this.rows = null
      this.reset = false
    }
    if (!this.buf || this.buf.length !== analyser.frequencyBinCount) {
      this.buf = new Float32Array(analyser.frequencyBinCount)
      this.rows = null
    }
    const binHz = fs / (this.buf.length * 2)
    const fmax = Math.min(WF_FMAX, fs / 2)
    if (!this.rows) {
      this.rows = new Float32Array(H)
      for (let y = 0; y < H; y++) {
        const f = WF_FMIN * Math.pow(fmax / WF_FMIN, 1 - (y + 0.5) / H)
        this.rows[y] = f / binHz
      }
    }

    const now = performance.now()
    this.acc += this.last ? (now - this.last) / 1000 : 0
    this.last = now
    // 30 columns per second, whatever the display refresh rate.
    const cols = Math.min(8, Math.floor(this.acc * 30))
    if (!cols) return
    this.acc -= cols / 30
    const step = Math.max(1, Math.round(dpr))
    analyser.getFloatFrequencyData(this.buf)

    let colMax = -200
    const lo = Math.floor(WF_FMIN / binHz), hi = Math.min(this.buf.length - 1, Math.ceil(fmax / binHz))
    for (let k = lo; k <= hi; k++) if (this.buf[k] > colMax) colMax = this.buf[k]
    this.ceil += (Math.max(colMax, -90) - this.ceil) * 0.03
    const top = this.ceil + 4, range = 62

    const shift = cols * step
    ctx.drawImage(canvas, shift, 0, W - shift, H, 0, 0, W - shift, H)
    if (!this.column || this.column.width !== shift || this.column.height !== H) {
      this.column = ctx.createImageData(shift, H)
    }
    const data = this.column.data
    for (let y = 0; y < H; y++) {
      const fb = this.rows[y]
      const k = Math.floor(fb), fr = fb - k
      const v = k + 1 < this.buf.length ? this.buf[k] * (1 - fr) + this.buf[k + 1] * fr : this.buf[k]
      const idx = Math.max(0, Math.min(255, Math.round(((v - (top - range)) / range) * 255)))
      for (let x = 0; x < shift; x++) {
        const o = (y * shift + x) * 4
        data[o] = this.lut[idx * 3]
        data[o + 1] = this.lut[idx * 3 + 1]
        data[o + 2] = this.lut[idx * 3 + 2]
        data[o + 3] = 255
      }
    }
    ctx.putImageData(this.column, W - shift, 0)
  }
}

// Vertical position (0 = top, 1 = bottom) of a frequency on the waterfall.
export function waterfallY(f, fs) {
  const fmax = Math.min(WF_FMAX, fs / 2)
  return 1 - Math.log(f / WF_FMIN) / Math.log(fmax / WF_FMIN)
}
