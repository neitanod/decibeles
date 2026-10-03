import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weightingSections, magnitudeDb } from '../web/js/weighting.js'

// Nominal values from IEC 61672-1, table 3.
const A = { 31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6, 500: -3.2, 1000: 0, 2000: 1.2, 4000: 1.0, 8000: -1.1, 16000: -6.6 }
const C = { 31.5: -3.0, 63: -0.8, 125: -0.2, 250: 0, 500: 0, 1000: 0, 2000: -0.2, 4000: -0.8, 8000: -3.0, 16000: -8.5 }

// Stricter than class 1 up to 4 kHz; above that, the class 1 limits of
// IEC 61672-1, which are asymmetric because the bilinear transform pulls the
// curve down near Nyquist.
function tolerance(f) {
  if (f <= 4000) return [0.5, 0.5]
  if (f <= 8000) return [1.5, 2.5]
  return [3.5, 17]
}

for (const fs of [44100, 48000]) {
  for (const [name, table] of [['A', A], ['C', C]]) {
    test(`${name} weighting at ${fs} Hz follows IEC 61672`, () => {
      const sections = weightingSections(name, fs)
      for (const [f, expected] of Object.entries(table)) {
        const got = magnitudeDb(sections, Number(f), fs)
        const [plus, minus] = tolerance(Number(f))
        assert.ok(got - expected <= plus && expected - got <= minus,
          `${name} @ ${f} Hz: got ${got.toFixed(2)} dB, expected ${expected} dB`)
      }
    })

    test(`${name} weighting at ${fs} Hz is stable`, () => {
      for (const s of weightingSections(name, fs)) {
        // Both poles inside the unit circle: |a2| < 1 and |a1| < 1 + a2.
        assert.ok(Math.abs(s.a2) < 1 && Math.abs(s.a1) < 1 + s.a2)
      }
    })
  }
}

test('Z weighting is flat', () => {
  assert.deepEqual(weightingSections('Z', 48000), [])
})
