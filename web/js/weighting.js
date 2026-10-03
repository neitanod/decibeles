// IEC 61672 frequency weightings (A and C) as cascades of biquads.
//
// The analog prototype poles are mapped to the z-plane with the bilinear
// transform. Each pole is pre-warped so it lands on its nominal frequency,
// which keeps the A curve within ~1 dB of the standard up to 10 kHz at 44.1
// and 48 kHz. Zeros at s = 0 map to z = 1; the zeros at infinity map to z = -1.
//
// Plain ES module with no DOM access: the AudioWorklet imports it, and so do
// the Node tests.

const F1 = 20.598997
const F2 = 107.65265
const F3 = 737.86223
const F4 = 12194.217

function zPole(f, fs) {
  const k = Math.tan(Math.PI * f / fs)
  return (1 - k) / (1 + k)
}

function biquad(z1, z2, p1, p2) {
  return {
    b0: 1, b1: -(z1 + z2), b2: z1 * z2,
    a1: -(p1 + p2), a2: p1 * p2,
  }
}

function sectionGain(s, f, fs) {
  const w = 2 * Math.PI * f / fs
  const c1 = Math.cos(w), s1 = Math.sin(w)
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
  const nr = s.b0 + s.b1 * c1 + s.b2 * c2
  const ni = -(s.b1 * s1 + s.b2 * s2)
  const dr = 1 + s.a1 * c1 + s.a2 * c2
  const di = -(s.a1 * s1 + s.a2 * s2)
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di))
}

export function magnitude(sections, f, fs) {
  let g = 1
  for (const s of sections) g *= sectionGain(s, f, fs)
  return g
}

export function magnitudeDb(sections, f, fs) {
  return 20 * Math.log10(magnitude(sections, f, fs))
}

// Returns the biquad sections for 'A', 'C' or 'Z' (flat: no sections),
// normalized to 0 dB at 1 kHz.
export function weightingSections(type, fs) {
  const p1 = zPole(F1, fs)
  const p4 = zPole(F4, fs)
  let sections
  if (type === 'A') {
    sections = [
      biquad(1, 1, p1, p1),
      biquad(1, 1, zPole(F2, fs), zPole(F3, fs)),
      biquad(-1, -1, p4, p4),
    ]
  } else if (type === 'C') {
    sections = [
      biquad(1, 1, p1, p1),
      biquad(-1, -1, p4, p4),
    ]
  } else {
    return []
  }
  const g = magnitude(sections, 1000, fs)
  const s0 = sections[0]
  s0.b0 /= g
  s0.b1 /= g
  s0.b2 /= g
  return sections
}
