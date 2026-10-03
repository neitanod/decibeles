// A 1080×1350 image of a session, ready to post: the Leq big, the key
// numbers, the timeline and the date. Shared with the Web Share API when the
// browser can share files, downloaded otherwise.

import { t } from '../i18n.js'
import { cssVar, fmtDb, fmtSpan, fmtDate, describe, zoneIndex, ZONES, download } from '../format.js'

const W = 1080, H = 1350

function font(weight, size, family) {
  return `${weight} ${size}px ${family}`
}

const DISPLAY = '"Big Shoulders Display", Impact, sans-serif'
const MONO = '"Martian Mono", ui-monospace, monospace'

export async function renderCard(record, weighting = 'A') {
  await document.fonts.ready
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const s = record.summary[weighting]
  const leq = s.leq
  const zone = ZONES[zoneIndex(leq)]
  const zc = cssVar(zone.css)

  // Background with a glow in the color of the zone
  ctx.fillStyle = cssVar('--bg')
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W / 2, 470, 40, W / 2, 470, 720)
  g.addColorStop(0, hexA(zc, 0.34))
  g.addColorStop(1, hexA(zc, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = cssVar('--ink')
  ctx.font = font(800, 54, DISPLAY)
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('DECIBELES', 80, 130)
  ctx.font = font(500, 24, MONO)
  ctx.fillStyle = cssVar('--ink-dim')
  ctx.textAlign = 'right'
  ctx.fillText(fmtDate(record.startedAt).toUpperCase(), W - 80, 128)
  ctx.textAlign = 'left'

  if (record.name) {
    ctx.font = font(600, 34, '"Instrument Sans", sans-serif')
    ctx.fillStyle = cssVar('--ink')
    ctx.fillText(record.name.slice(0, 48), 80, 200)
  }

  // Big number
  ctx.textAlign = 'center'
  ctx.fillStyle = cssVar('--ink')
  ctx.font = font(800, 330, DISPLAY)
  ctx.fillText(fmtDb(leq), W / 2, 560)
  ctx.font = font(600, 36, MONO)
  ctx.fillStyle = cssVar('--accent')
  ctx.fillText(`L${weighting}eq · dB(${weighting})`, W / 2, 630)

  // Zone pill
  const label = `${t(zone.key)} — ${describe(leq)}`
  ctx.font = font(600, 30, '"Instrument Sans", sans-serif')
  const tw = ctx.measureText(label).width + 80
  roundRect(ctx, (W - tw) / 2, 670, tw, 64, 32)
  ctx.fillStyle = hexA(zc, 0.18)
  ctx.fill()
  ctx.strokeStyle = zc
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = zc
  ctx.fillText(label, W / 2, 713)

  // Stats
  const stats = [
    [t('stat.min'), fmtDb(s.minF)],
    [t('stat.max'), fmtDb(s.maxF)],
    [t('stat.peak'), fmtDb(record.summary.peak)],
    ['L90', fmtDb(s.l90)],
  ]
  const cw = (W - 160) / stats.length
  stats.forEach(([k, v], i) => {
    const x = 80 + cw * i + cw / 2
    ctx.fillStyle = cssVar('--ink-dim')
    ctx.font = font(500, 22, MONO)
    ctx.fillText(k.toUpperCase(), x, 820)
    ctx.fillStyle = cssVar('--ink')
    ctx.font = font(700, 76, DISPLAY)
    ctx.fillText(v, x, 900)
  })

  // Timeline
  const series = (record.series[weighting] || []).map((v) => v / 10)
  const top = 960, bottom = 1180, left = 80, right = W - 80
  ctx.strokeStyle = cssVar('--grid')
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke()
  if (series.length > 1) {
    const lo = Math.max(0, Math.floor((Math.min(...series) - 5) / 10) * 10)
    const hi = Math.ceil((Math.max(...series) + 5) / 10) * 10
    const yOf = (v) => bottom - (v - lo) / Math.max(10, hi - lo) * (bottom - top)
    const n = Math.min(series.length, 540)
    const step = series.length / n
    const grad = ctx.createLinearGradient(0, yOf(130), 0, yOf(20))
    ;[[130, '--z5'], [100, '--z5'], [92, '--z4'], [80, '--z3'], [65, '--z2'], [50, '--z1'], [20, '--z1']]
      .forEach(([db, v]) => grad.addColorStop((130 - db) / 110, cssVar(v)))
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const v = series[Math.floor(i * step)]
      const x = left + (i / (n - 1)) * (right - left)
      if (i) ctx.lineTo(x, yOf(v)); else ctx.moveTo(x, yOf(v))
    }
    ctx.strokeStyle = grad
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // Footer
  ctx.textAlign = 'left'
  ctx.fillStyle = cssVar('--ink-dim')
  ctx.font = font(500, 24, MONO)
  ctx.fillText(`${t('detail.duration').toUpperCase()} ${fmtSpan(record.seconds)}`, 80, 1260)
  ctx.textAlign = 'right'
  ctx.fillStyle = cssVar('--accent')
  ctx.fillText('decibeles.ip1.cc', W - 80, 1260)

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

export async function shareRecord(record, weighting) {
  const blob = await renderCard(record, weighting)
  const name = `decibeles-${new Date(record.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('share.title') })
      return 'shared'
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled'
    }
  }
  download(name, blob)
  return 'downloaded'
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hexA(hex, a) {
  const m = hex.trim().match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}
