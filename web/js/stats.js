// Session statistics: everything that turns a stream of readings into numbers
// worth keeping. Pure module, no DOM: the Node tests import it directly.

export const WEIGHTINGS = ['A', 'C', 'Z']

const BINS = 1600 // 0.1 dB bins from 0 to 160 dB
const WARMUP_SECONDS = 1.5

export function toDb(meanSquare, offset = 0) {
  return 10 * Math.log10(Math.max(meanSquare, 1e-20)) + offset
}

export function toEnergy(db) {
  return Math.pow(10, db / 10)
}

export function energyToDb(e) {
  return e > 0 ? 10 * Math.log10(e) : -Infinity
}

// NIOSH recommended exposure limit: 85 dBA over 8 hours, 3 dB exchange rate.
// Levels under 80 dBA do not add to the dose.
export const NIOSH = { criterion: 85, exchange: 3, hours: 8, threshold: 80 }

export function allowedSeconds(dbA) {
  return NIOSH.hours * 3600 / Math.pow(2, (dbA - NIOSH.criterion) / NIOSH.exchange)
}

// Statistical level Ln: the level exceeded during n % of the time.
export function percentileLevel(hist, total, n) {
  if (!total) return null
  const target = total * n / 100
  let acc = 0
  for (let i = hist.length - 1; i >= 0; i--) {
    acc += hist[i]
    if (acc >= target) return (i + 0.5) * 160 / hist.length
  }
  return 0
}

function emptyWeighting() {
  return {
    e: 0, t: 0,
    maxF: -Infinity, minF: Infinity, maxS: -Infinity, minS: Infinity,
    hist: new Uint32Array(BINS), histN: 0,
  }
}

function binOf(db) {
  return Math.min(BINS - 1, Math.max(0, Math.floor(db * 10)))
}

// A noise event starts when LAF reaches the threshold, and ends after a full
// second below it. Shorter than half a second does not count.
const EVENT_MIN_SECONDS = 0.5
const EVENT_GAP_SECONDS = 1
const MAX_EVENTS = 500

export class SessionStats {
  constructor({ id, startedAt, eventThreshold = 70 } = {}) {
    this.id = id || newId()
    this.startedAt = startedAt || Date.now()
    this.updatedAt = this.startedAt
    this.seconds = 0
    this.w = { A: emptyWeighting(), C: emptyWeighting(), Z: emptyWeighting() }
    this.peak = -Infinity
    this.dose = 0
    this.series = { A: [], C: [], Z: [], AFmax: [] }
    this.acc = { A: 0, C: 0, Z: 0, t: 0, afmax: -Infinity }
    this.markers = []
    this.eventThreshold = eventThreshold
    this.events = []
    this.current = null
    this.name = ''
    this.note = ''
  }

  // frame: { A: {f, s, eq}, C: {...}, Z: {...}, peak, dt }, all in calibrated dB.
  add(frame) {
    const dt = frame.dt
    this.seconds += dt
    this.updatedAt = Date.now()
    const warm = this.seconds > WARMUP_SECONDS
    for (const k of WEIGHTINGS) {
      const l = frame[k], w = this.w[k]
      const e = toEnergy(l.eq)
      w.e += e * dt
      w.t += dt
      this.acc[k] += e * dt
      if (warm) {
        if (l.f > w.maxF) w.maxF = l.f
        if (l.f < w.minF) w.minF = l.f
        if (l.s > w.maxS) w.maxS = l.s
        if (l.s < w.minS) w.minS = l.s
        w.hist[binOf(l.f)]++
        w.histN++
      }
    }
    if (warm && frame.peak > this.peak) this.peak = frame.peak
    if (warm) this.trackEvent(frame.A.f, dt)
    if (frame.A.s >= NIOSH.threshold) this.dose += dt / allowedSeconds(frame.A.s)
    if (frame.A.f > this.acc.afmax) this.acc.afmax = frame.A.f
    this.acc.t += dt
    if (this.acc.t >= 1) this.flushSecond()
  }

  trackEvent(laf, dt) {
    const c = this.current
    if (laf >= this.eventThreshold) {
      if (!c) this.current = { t: this.seconds - dt, d: dt, max: laf, quiet: 0 }
      else {
        c.d += c.quiet + dt
        c.quiet = 0
        if (laf > c.max) c.max = laf
      }
    } else if (c) {
      c.quiet += dt
      if (c.quiet >= EVENT_GAP_SECONDS) {
        this.closeEvent()
      }
    }
  }

  closeEvent() {
    const c = this.current
    this.current = null
    if (c && c.d >= EVENT_MIN_SECONDS && this.events.length < MAX_EVENTS) {
      this.events.push(eventRecord(c))
    }
  }

  // Closed events plus the one still going on, if it already counts.
  allEvents() {
    const c = this.current
    return c && c.d >= EVENT_MIN_SECONDS ? [...this.events, eventRecord(c)] : this.events.slice()
  }

  flushSecond() {
    const a = this.acc
    for (const k of WEIGHTINGS) {
      this.series[k].push(Math.round(energyToDb(a[k] / a.t) * 10))
      a[k] = 0
    }
    this.series.AFmax.push(Math.round(a.afmax * 10))
    a.afmax = -Infinity
    a.t = 0
  }

  leq(k) {
    const w = this.w[k]
    return w.t ? energyToDb(w.e / w.t) : null
  }

  addMarker(label) {
    this.markers.push({ t: Math.round(this.seconds * 10) / 10, label: label || '' })
  }

  summary() {
    const out = { peak: finite(this.peak), dose: this.dose }
    for (const k of WEIGHTINGS) {
      const w = this.w[k]
      out[k] = {
        leq: this.leq(k),
        maxF: finite(w.maxF), minF: finite(w.minF),
        maxS: finite(w.maxS), minS: finite(w.minS),
        l10: percentileLevel(w.hist, w.histN, 10),
        l50: percentileLevel(w.hist, w.histN, 50),
        l90: percentileLevel(w.hist, w.histN, 90),
      }
    }
    return out
  }

  // Distribution of the Fast level in 1 dB bins, for the session histogram.
  histogram(k) {
    const src = this.w[k].hist, out = new Array(160).fill(0)
    for (let i = 0; i < src.length; i++) out[Math.floor(i / 10)] += src[i]
    return out
  }

  toRecord() {
    return {
      id: this.id,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      seconds: Math.round(this.seconds * 10) / 10,
      name: this.name,
      note: this.note,
      summary: this.summary(),
      series: {
        A: this.series.A.slice(), C: this.series.C.slice(),
        Z: this.series.Z.slice(), AFmax: this.series.AFmax.slice(),
      },
      hist: { A: this.histogram('A'), C: this.histogram('C'), Z: this.histogram('Z') },
      markers: this.markers.slice(),
      eventThreshold: this.eventThreshold,
      events: this.allEvents(),
    }
  }
}

function eventRecord(c) {
  return { t: round1(c.t), d: round1(c.d), max: round1(c.max) }
}

function round1(v) {
  return Math.round(v * 10) / 10
}

function finite(v) {
  return Number.isFinite(v) ? v : null
}

export function newId() {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 7)
  return `${t}-${r}`
}
