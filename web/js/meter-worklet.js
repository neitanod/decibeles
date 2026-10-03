// AudioWorklet that turns raw microphone samples into sound level readings.
//
// For every sample it runs the A, C and Z (flat) chains in parallel, so the UI
// can switch weightings instantly and the exposure dose can always use A. Each
// chain keeps the two standard exponential time weightings (Fast = 125 ms,
// Slow = 1 s) plus the plain mean square of the current block, which is what
// Leq integrates. Every REPORT_SECONDS it posts mean-square values in linear
// full-scale units; the main thread applies calibration and converts to dB.

import { weightingSections } from './weighting.js'

const REPORT_SECONDS = 0.05
const FLOOR = 1e-14

function makeChain(sections) {
  const n = sections.length
  const c = new Float64Array(n * 5)
  sections.forEach((s, i) => {
    c.set([s.b0, s.b1, s.b2, s.a1, s.a2], i * 5)
  })
  return { n, c, z: new Float64Array(n * 2) }
}

// Transposed direct form II, one section after the other.
function run(chain, x) {
  const { n, c, z } = chain
  let v = x
  for (let i = 0; i < n; i++) {
    const k = i * 5, j = i * 2
    const y = c[k] * v + z[j]
    z[j] = c[k + 1] * v - c[k + 3] * y + z[j + 1]
    z[j + 1] = c[k + 2] * v - c[k + 4] * y
    v = y
  }
  return v
}

class MeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    const fs = sampleRate
    this.chainA = makeChain(weightingSections('A', fs))
    this.chainC = makeChain(weightingSections('C', fs))
    this.kF = 1 - Math.exp(-1 / (fs * 0.125))
    this.kS = 1 - Math.exp(-1 / (fs * 1.0))
    this.reportEvery = Math.round(fs * REPORT_SECONDS)
    // [fast, slow, block sum] for A, C and Z
    this.st = new Float64Array(9)
    this.primed = false
    this.peak = 0
    this.count = 0
    this.port.onmessage = (e) => {
      if (e.data === 'reset') this.primed = false
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const out = outputs[0] && outputs[0][0]
    if (out) out.fill(0)
    if (!input || !input[0]) return true
    const x = input[0]
    const st = this.st
    const kF = this.kF, kS = this.kS

    // Seed the time weightings with the first block's energy, so the reading
    // starts where the room is instead of climbing up from silence.
    if (!this.primed) {
      let e = 0
      for (let i = 0; i < x.length; i++) e += x[i] * x[i]
      e = Math.max(e / x.length, FLOOR)
      for (let w = 0; w < 3; w++) { st[w * 3] = e; st[w * 3 + 1] = e }
      this.primed = true
    }

    for (let i = 0; i < x.length; i++) {
      const z = x[i]
      const az = z < 0 ? -z : z
      if (az > this.peak) this.peak = az

      const a = run(this.chainA, z)
      const c = run(this.chainC, z)
      const ea = a * a, ec = c * c, ez = z * z

      st[0] += (ea - st[0]) * kF; st[1] += (ea - st[1]) * kS; st[2] += ea
      st[3] += (ec - st[3]) * kF; st[4] += (ec - st[4]) * kS; st[5] += ec
      st[6] += (ez - st[6]) * kF; st[7] += (ez - st[7]) * kS; st[8] += ez

      if (++this.count >= this.reportEvery) this.report()
    }
    return true
  }

  report() {
    const st = this.st, n = this.count
    this.port.postMessage({
      n,
      dt: n / sampleRate,
      A: [Math.max(st[0], FLOOR), Math.max(st[1], FLOOR), Math.max(st[2] / n, FLOOR)],
      C: [Math.max(st[3], FLOOR), Math.max(st[4], FLOOR), Math.max(st[5] / n, FLOOR)],
      Z: [Math.max(st[6], FLOOR), Math.max(st[7], FLOOR), Math.max(st[8] / n, FLOOR)],
      peak: this.peak,
    })
    st[2] = 0; st[5] = 0; st[8] = 0
    this.peak = 0
    this.count = 0
  }
}

registerProcessor('meter', MeterProcessor)
