// The measuring engine. One instance for the whole app: it keeps running while
// the user moves between views, and every view reads from it.
//
// Events: 'state' (idle/starting/running/paused/error), 'frame' (a new
// reading, 20 per second), 'reset', 'saved' and 'alert'.

import { SessionStats, toDb, WEIGHTINGS } from './stats.js'
import { getSettings, onSettings, saveSession } from './store.js'

const LIVE_FRAMES = 1200 // 60 s at 20 frames per second
const AUTOSAVE_MS = 15000
const MIN_SAVE_SECONDS = 10
const ALERT_GAP_MS = 4000

function liveRing() {
  return { F: new Float32Array(LIVE_FRAMES), S: new Float32Array(LIVE_FRAMES) }
}

class Meter extends EventTarget {
  constructor() {
    super()
    this.state = 'idle'
    this.error = null
    this.ctx = null
    this.stream = null
    this.node = null
    this.analyser = null
    this.levels = null
    this.session = new SessionStats()
    this.live = { A: liveRing(), C: liveRing(), Z: liveRing() }
    this.liveHead = 0
    this.liveCount = 0
    this.overloadUntil = 0
    this.lastSave = 0
    this.lastAlert = 0
    this.wakeLock = null

    document.addEventListener('visibilitychange', () => this.onVisibility())
    window.addEventListener('pagehide', () => this.autosave(true))
    onSettings((key) => {
      if (key === 'wakeLock') this.syncWakeLock()
    })
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000
  }

  setState(state) {
    this.state = state
    this.dispatchEvent(new CustomEvent('state', { detail: state }))
  }

  async start() {
    if (this.state === 'running' || this.state === 'starting') return
    if (this.state === 'paused') return this.resume()
    this.error = null
    this.setState('starting')
    try {
      if (!window.isSecureContext) throw named('InsecureError')
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioWorkletNode) {
        throw named('UnsupportedError')
      }
      // Every voice-call processing step off: echo cancellation, noise
      // suppression and automatic gain would each bend the reading.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      })
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      this.ctx = ctx
      await ctx.audioWorklet.addModule('/js/meter-worklet.js')
      const source = ctx.createMediaStreamSource(this.stream)
      this.node = new AudioWorkletNode(ctx, 'meter', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      })
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 8192
      this.analyser.smoothingTimeConstant = 0.55
      this.analyser.minDecibels = -140
      this.analyser.maxDecibels = 0
      // The worklet has to reach the destination to be pulled by the graph;
      // the gain of zero keeps the microphone out of the speaker.
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(this.node)
      source.connect(this.analyser)
      this.node.connect(mute)
      mute.connect(ctx.destination)
      this.node.port.onmessage = (e) => this.onFrame(e.data)
      const track = this.stream.getAudioTracks()[0]
      if (track) track.addEventListener('ended', () => this.stop())
      await ctx.resume()
      this.setState('running')
      this.syncWakeLock()
    } catch (e) {
      this.teardown()
      this.error = classify(e)
      this.setState('error')
    }
  }

  pause() {
    if (this.state !== 'running') return
    this.ctx.suspend()
    this.setState('paused')
    this.autosave(true)
    this.syncWakeLock()
  }

  async resume() {
    if (this.state !== 'paused') return
    await this.ctx.resume()
    this.setState('running')
    this.syncWakeLock()
  }

  toggle() {
    if (this.state === 'running') this.pause()
    else this.start()
  }

  stop() {
    this.autosave(true)
    this.teardown()
    this.setState('idle')
    this.syncWakeLock()
  }

  teardown() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop())
    if (this.ctx) this.ctx.close().catch(() => {})
    this.stream = null
    this.ctx = null
    this.node = null
    this.analyser = null
  }

  reset() {
    const saved = this.autosave(true)
    this.session = new SessionStats()
    this.lastSave = 0
    this.dispatchEvent(new CustomEvent('reset', { detail: { saved } }))
  }

  addMarker(label) {
    this.session.addMarker(label)
    this.autosave(true)
    return this.session.markers.length
  }

  onFrame(raw) {
    const off = getSettings().offset
    const frame = { dt: raw.dt, peak: 20 * Math.log10(Math.max(raw.peak, 1e-10)) + off }
    for (const k of WEIGHTINGS) {
      const v = raw[k]
      frame[k] = { f: toDb(v[0], off), s: toDb(v[1], off), eq: toDb(v[2], off) }
    }
    this.levels = frame
    const now = performance.now()
    if (raw.peak >= 0.99) this.overloadUntil = now + 1500

    this.session.add(frame)

    const h = this.liveHead
    for (const k of WEIGHTINGS) {
      this.live[k].F[h] = frame[k].f
      this.live[k].S[h] = frame[k].s
    }
    this.liveHead = (h + 1) % LIVE_FRAMES
    if (this.liveCount < LIVE_FRAMES) this.liveCount++

    this.checkAlert(now)
    if (Date.now() - this.lastSave > AUTOSAVE_MS) this.autosave(false)
    this.dispatchEvent(new CustomEvent('frame', { detail: frame }))
  }

  // The level the user chose to look at: weighting and time weighting.
  display(frame = this.levels) {
    if (!frame) return null
    const s = getSettings()
    const l = frame[s.weighting]
    return s.timeWeighting === 'S' ? l.s : l.f
  }

  get overloaded() {
    return performance.now() < this.overloadUntil
  }

  // Chronological copy of the last minute of readings.
  liveValues(k, tw) {
    const ring = this.live[k][tw]
    const n = this.liveCount
    const out = new Float32Array(n)
    const start = (this.liveHead - n + LIVE_FRAMES) % LIVE_FRAMES
    for (let i = 0; i < n; i++) out[i] = ring[(start + i) % LIVE_FRAMES]
    return out
  }

  // Leq over the last `seconds` of the live buffer, for the traffic light.
  recentLeq(k, seconds) {
    const n = Math.min(this.liveCount, Math.max(1, Math.round(seconds * 20)))
    if (!n) return null
    const ring = this.live[k].F
    let e = 0
    for (let i = 1; i <= n; i++) {
      e += Math.pow(10, ring[(this.liveHead - i + LIVE_FRAMES) % LIVE_FRAMES] / 10)
    }
    return 10 * Math.log10(e / n)
  }

  checkAlert(now) {
    const s = getSettings()
    if (!s.alertOn) return
    const level = this.display()
    if (level < s.alertLevel || now - this.lastAlert < ALERT_GAP_MS) return
    this.lastAlert = now
    if (s.alertVibrate && navigator.vibrate) navigator.vibrate([120, 80, 120])
    this.dispatchEvent(new CustomEvent('alert', { detail: level }))
  }

  autosave(force) {
    if (!getSettings().autosave) return false
    if (this.session.seconds < MIN_SAVE_SECONDS) return false
    if (!force && Date.now() - this.lastSave < AUTOSAVE_MS) return false
    this.lastSave = Date.now()
    const record = this.session.toRecord()
    saveSession(record)
      .then(() => this.dispatchEvent(new CustomEvent('saved', { detail: record })))
      .catch(() => {})
    return true
  }

  onVisibility() {
    if (document.hidden) {
      this.autosave(true)
      return
    }
    if (this.state === 'running' && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    this.syncWakeLock()
  }

  async syncWakeLock() {
    const want = getSettings().wakeLock && this.state === 'running' && !document.hidden
    if (want && !this.wakeLock && navigator.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen')
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null })
      } catch { this.wakeLock = null }
    } else if (!want && this.wakeLock) {
      this.wakeLock.release().catch(() => {})
      this.wakeLock = null
    }
  }
}

function named(name) {
  const e = new Error(name)
  e.name = name
  return e
}

function classify(e) {
  switch (e && e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { key: 'err.denied' }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { key: 'err.nomic' }
    case 'InsecureError':
      return { key: 'err.insecure' }
    case 'UnsupportedError':
      return { key: 'err.unsupported' }
    default:
      return { key: 'err.generic', msg: (e && e.message) || String(e) }
  }
}

export const meter = new Meter()
