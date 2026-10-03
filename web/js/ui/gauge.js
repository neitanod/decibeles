// The dial: a 240° arc from 20 to 130 dB, with zone colors that light up as
// the level climbs, a needle with spring physics, a peak-hold marker and an
// Leq marker. The digital readout sits in the middle, as HTML over the SVG.

const NS = 'http://www.w3.org/2000/svg'
const CX = 212, CY = 212
const MIN = 20, MAX = 130
const START = 150, SWEEP = 240
const ZONE_EDGES = [MIN, 55, 70, 85, 100, MAX]

function angle(v) {
  const c = Math.min(MAX, Math.max(MIN, v))
  return START + SWEEP * (c - MIN) / (MAX - MIN)
}

function pt(r, a) {
  const rad = a * Math.PI / 180
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)]
}

function arc(r, a0, a1) {
  const [x0, y0] = pt(r, a0)
  const [x1, y1] = pt(r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  if (parent) parent.appendChild(n)
  return n
}

let uid = 0

export class Gauge {
  constructor(host) {
    this.id = 'g' + (++uid)
    this.host = host
    this.target = MIN
    this.pos = MIN
    this.vel = 0
    this.peak = null
    this.leq = null
    this.raf = 0
    this.last = 0
    this.build()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  build() {
    const svg = el('svg', { viewBox: '0 0 424 330', class: 'gauge-svg', 'aria-hidden': 'true' })
    const defs = el('defs', {}, svg)
    const glow = el('filter', { id: `${this.id}-glow`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs)
    el('feGaussianBlur', { stdDeviation: '4', result: 'b' }, glow)
    const merge = el('feMerge', {}, glow)
    el('feMergeNode', { in: 'b' }, merge)
    el('feMergeNode', { in: 'SourceGraphic' }, merge)

    const shaft = el('linearGradient', { id: `${this.id}-shaft`, x1: '0', x2: '1', y1: '0', y2: '0' }, defs)
    // CSS variables only resolve inside style, not in presentation attributes.
    el('stop', { offset: '0', style: 'stop-color:var(--needle);stop-opacity:0' }, shaft)
    el('stop', { offset: '0.55', style: 'stop-color:var(--needle);stop-opacity:.85' }, shaft)
    el('stop', { offset: '1', style: 'stop-color:var(--needle);stop-opacity:1' }, shaft)

    const mask = el('mask', { id: `${this.id}-mask` }, defs)
    this.maskArc = el('path', { d: '', stroke: '#fff', 'stroke-width': '14', fill: 'none' }, mask)

    // Face: a recessed disc behind the readout, and a dotted ring around it.
    el('circle', { cx: CX, cy: CY, r: 116, class: 'g-face' }, svg)
    el('circle', { cx: CX, cy: CY, r: 126, class: 'g-face-ring' }, svg)
    el('path', { d: arc(150, START, START + SWEEP), class: 'g-track' }, svg)

    // Zone band: dim everywhere, bright up to the current level through the mask.
    const dim = el('g', { class: 'g-zones-dim' }, svg)
    const lit = el('g', { class: 'g-zones-lit', mask: `url(#${this.id}-mask)`, filter: `url(#${this.id}-glow)` }, svg)
    for (let i = 0; i < 5; i++) {
      const a0 = angle(ZONE_EDGES[i]) + (i ? 0.6 : 0)
      const a1 = angle(ZONE_EDGES[i + 1]) - (i < 4 ? 0.6 : 0)
      el('path', { d: arc(150, a0, a1), class: `g-zone z${i + 1}` }, dim)
      el('path', { d: arc(150, a0, a1), class: `g-zone z${i + 1}` }, lit)
    }

    // Ticks and labels
    const ticks = el('g', { class: 'g-ticks' }, svg)
    for (let v = MIN; v <= MAX; v += 2) {
      const a = angle(v)
      const major = v % 10 === 0
      const [x0, y0] = pt(major ? 164 : 170, a)
      const [x1, y1] = pt(major ? 182 : 177, a)
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: major ? 'g-tick major' : 'g-tick' }, ticks)
      if (major) {
        const [lx, ly] = pt(196, a)
        const label = el('text', { x: lx, y: ly, class: 'g-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, ticks)
        label.textContent = v
      }
    }
    // The 85 dB line: the 8-hour exposure limit.
    const [lx0, ly0] = pt(140, angle(85))
    const [lx1, ly1] = pt(184, angle(85))
    el('line', { x1: lx0, y1: ly0, x2: lx1, y2: ly1, class: 'g-limit' }, svg)

    // Leq and peak-hold markers
    this.leqMark = el('g', { class: 'g-leq', opacity: '0' }, svg)
    el('path', { d: 'M0 -5 L5 0 L0 5 L-5 0 Z', transform: 'translate(150 0)' }, this.leqMark)
    this.peakMark = el('g', { class: 'g-peak', opacity: '0' }, svg)
    el('path', { d: 'M0 -5 L8 0 L0 5 Z', transform: 'translate(130 0)' }, this.peakMark)

    // Needle: a shaft that fades toward the center, so the readout stays clean.
    this.needle = el('g', { class: 'g-needle' }, svg)
    el('polygon', { points: '112,-1.4 186,-0.7 186,0.7 112,1.4', fill: `url(#${this.id}-shaft)` }, this.needle)
    el('circle', { cx: 150, cy: 0, r: 5.5, class: 'g-bead', filter: `url(#${this.id}-glow)` }, this.needle)

    this.svg = svg
    this.host.prepend(svg)
    this.render()
  }

  set(value, { peak, leq } = {}) {
    if (value != null && Number.isFinite(value)) this.target = value
    this.peak = peak
    this.leq = leq
  }

  rest() {
    this.target = MIN
    this.peak = null
    this.leq = null
  }

  loop(ts) {
    const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016
    this.last = ts
    // Slightly underdamped spring: the needle settles fast with a small
    // overshoot, like an analog meter.
    const k = 140, c = 2 * Math.sqrt(k) * 0.72
    const acc = k * (this.target - this.pos) - c * this.vel
    this.vel += acc * dt
    this.pos += this.vel * dt
    this.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  render() {
    const a = angle(this.pos)
    this.needle.setAttribute('transform', `translate(${CX} ${CY}) rotate(${a.toFixed(2)})`)
    this.maskArc.setAttribute('d', a - START > 0.5 ? arc(150, START, a) : '')
    if (this.peak != null && Number.isFinite(this.peak)) {
      this.peakMark.setAttribute('opacity', '1')
      this.peakMark.setAttribute('transform', `translate(${CX} ${CY}) rotate(${angle(this.peak).toFixed(2)})`)
    } else this.peakMark.setAttribute('opacity', '0')
    if (this.leq != null && Number.isFinite(this.leq)) {
      this.leqMark.setAttribute('opacity', '1')
      this.leqMark.setAttribute('transform', `translate(${CX} ${CY}) rotate(${angle(this.leq).toFixed(2)})`)
    } else this.leqMark.setAttribute('opacity', '0')
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.svg.remove()
  }
}
