// Level-over-time chart. The line and its fill take the color of the zone at
// each height, so a loud stretch reads red before you look at the numbers.

import { fitCanvas, cssVar, zoneGradient, fmtClock } from '../format.js'

const PAD = { l: 30, r: 10, t: 10, b: 20 }

function rangeOf(values) {
  let min = Infinity, max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Infinity) return [30, 90]
  let lo = Math.floor((min - 6) / 10) * 10
  let hi = Math.ceil((max + 6) / 10) * 10
  while (hi - lo < 40) { lo -= 5; hi += 5 }
  return [Math.max(0, lo), Math.min(150, hi)]
}

// Averages in the energy domain, so a bucket with one loud second still shows it.
function bucket(values, n) {
  if (values.length <= n) return Array.from(values)
  const out = new Array(n)
  const size = values.length / n
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * size), b = Math.max(a + 1, Math.floor((i + 1) * size))
    let e = 0, c = 0
    for (let j = a; j < b; j++) {
      if (Number.isFinite(values[j])) { e += Math.pow(10, values[j] / 10); c++ }
    }
    out[i] = c ? 10 * Math.log10(e / c) : NaN
  }
  return out
}

// opts: { mode: 'live' | 'session', perSecond, leq, alert, markers: [seconds] }
export function drawHistory(canvas, values, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas)
  ctx.clearRect(0, 0, w, h)
  const pw = w - PAD.l - PAD.r
  const ph = h - PAD.t - PAD.b

  const target = rangeOf(values)
  const prev = canvas._range || target
  const range = [prev[0] + (target[0] - prev[0]) * 0.15, prev[1] + (target[1] - prev[1]) * 0.15]
  canvas._range = range
  const [lo, hi] = range
  const yOf = (db) => PAD.t + ph * (1 - (db - lo) / (hi - lo))

  const faint = cssVar('--ink-faint')
  const dim = cssVar('--ink-dim')
  ctx.font = '500 9px "Martian Mono", ui-monospace, monospace'
  ctx.textBaseline = 'middle'

  // Grid
  ctx.lineWidth = 1
  for (let db = Math.ceil(lo / 10) * 10; db <= hi; db += 10) {
    const y = Math.round(yOf(db)) + 0.5
    ctx.strokeStyle = cssVar('--grid')
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
    ctx.fillStyle = faint
    ctx.textAlign = 'right'
    ctx.fillText(String(db), PAD.l - 6, y)
  }

  const live = opts.mode !== 'session'
  const span = live ? 60 : Math.max(1, values.length / (opts.perSecond || 1))
  const pts = live ? Array.from(values) : bucket(values, Math.max(2, Math.floor(pw * 1.5)))
  const n = pts.length
  const xOf = live
    ? (i) => w - PAD.r - ((n - 1 - i) / (20 * 60)) * pw
    : (i) => PAD.l + (n > 1 ? i / (n - 1) : 0) * pw

  // X labels
  ctx.fillStyle = faint
  ctx.textBaseline = 'alphabetic'
  const labels = live
    ? [[PAD.l, '−60 s', 'left'], [PAD.l + pw / 2, '−30 s', 'center'], [w - PAD.r, '0', 'right']]
    : [[PAD.l, '0:00', 'left'], [PAD.l + pw / 2, fmtClock(span / 2), 'center'], [w - PAD.r, fmtClock(span), 'right']]
  for (const [x, txt, align] of labels) {
    ctx.textAlign = align
    ctx.fillText(txt, x, h - 5)
  }

  // Alert threshold
  if (opts.alert != null && opts.alert > lo && opts.alert < hi) {
    const y = Math.round(yOf(opts.alert)) + 0.5
    ctx.strokeStyle = cssVar('--z5')
    ctx.globalAlpha = 0.6
    ctx.setLineDash([2, 4])
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  if (n > 1) {
    const grad = zoneGradient(ctx, yOf)
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD.l, PAD.t - 2, pw, ph + 4)
    ctx.clip()
    // Fill
    ctx.beginPath()
    let started = false, firstX = 0, lastX = 0
    for (let i = 0; i < n; i++) {
      const v = pts[i]
      if (!Number.isFinite(v)) continue
      const x = xOf(i), y = yOf(Math.max(lo, v))
      if (!started) { ctx.moveTo(x, y); firstX = x; started = true } else ctx.lineTo(x, y)
      lastX = x
    }
    if (started) {
      const line = new Path2D()
      // Reuse the same points for the stroke
      ctx.lineTo(lastX, PAD.t + ph)
      ctx.lineTo(firstX, PAD.t + ph)
      ctx.closePath()
      ctx.globalAlpha = 0.16
      ctx.fillStyle = grad
      ctx.fill()
      ctx.globalAlpha = 1
      let s = false
      for (let i = 0; i < n; i++) {
        const v = pts[i]
        if (!Number.isFinite(v)) continue
        const x = xOf(i), y = yOf(Math.max(lo, v))
        if (!s) { line.moveTo(x, y); s = true } else line.lineTo(x, y)
      }
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.75
      ctx.lineJoin = 'round'
      ctx.stroke(line)
    }
    ctx.restore()
  }

  // Markers (session mode)
  if (!live && opts.markers && opts.markers.length) {
    ctx.strokeStyle = cssVar('--accent')
    ctx.fillStyle = cssVar('--accent')
    ctx.setLineDash([3, 3])
    opts.markers.forEach((m, i) => {
      const x = PAD.l + Math.min(1, m / span) * pw
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + ph); ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x, PAD.t + 8)
    })
    ctx.setLineDash([])
  }

  // Leq line
  if (opts.leq != null && Number.isFinite(opts.leq) && opts.leq > lo && opts.leq < hi) {
    const y = Math.round(yOf(opts.leq)) + 0.5
    ctx.strokeStyle = dim
    ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = dim
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`Leq ${opts.leq.toFixed(1)}`, PAD.l + 4, y - 3)
  }

  // Ask for another frame while the range is still easing.
  return Math.abs(range[0] - target[0]) > 0.2 || Math.abs(range[1] - target[1]) > 0.2
}

// Histogram of levels in 1 dB bins, for the session detail.
export function drawDistribution(canvas, hist) {
  const { ctx, w, h } = fitCanvas(canvas)
  ctx.clearRect(0, 0, w, h)
  let first = hist.findIndex((c) => c > 0)
  let last = hist.length - 1 - [...hist].reverse().findIndex((c) => c > 0)
  if (first < 0) return
  first = Math.max(0, Math.floor((first - 3) / 10) * 10)
  last = Math.min(159, Math.ceil((last + 3) / 10) * 10)
  const total = hist.reduce((a, b) => a + b, 0)
  const max = Math.max(...hist.slice(first, last + 1))
  const pw = w - PAD.l - PAD.r
  const ph = h - PAD.t - PAD.b
  const bw = pw / (last - first + 1)
  for (let i = first; i <= last; i++) {
    const v = hist[i] / max
    const bh = v * ph
    ctx.fillStyle = cssVar(i < 55 ? '--z1' : i < 70 ? '--z2' : i < 85 ? '--z3' : i < 100 ? '--z4' : '--z5')
    ctx.globalAlpha = 0.85
    ctx.fillRect(PAD.l + (i - first) * bw + 0.5, PAD.t + ph - bh, Math.max(1, bw - 1), bh)
  }
  ctx.globalAlpha = 1
  ctx.font = '500 9px "Martian Mono", ui-monospace, monospace'
  ctx.fillStyle = cssVar('--ink-faint')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (let db = first; db <= last; db += 10) {
    ctx.fillText(String(db), PAD.l + (db - first + 0.5) * bw, h - 5)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(max / total * 100)}%`, PAD.l - 6, PAD.t + 4)
}
