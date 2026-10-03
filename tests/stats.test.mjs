import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionStats, allowedSeconds, percentileLevel, toDb } from '../web/js/stats.js'

function frame(db, dt = 0.05) {
  const l = { f: db, s: db, eq: db }
  return { A: l, C: l, Z: l, peak: db + 3, dt }
}

test('Leq of a constant level is that level', () => {
  const s = new SessionStats()
  for (let i = 0; i < 200; i++) s.add(frame(70))
  assert.ok(Math.abs(s.leq('A') - 70) < 1e-9)
})

test('Leq averages energy, not decibels', () => {
  const s = new SessionStats()
  for (let i = 0; i < 100; i++) s.add(frame(60))
  for (let i = 0; i < 100; i++) s.add(frame(80))
  // Half the time at 60 and half at 80 gives 77.03 dB, not 70.
  assert.ok(Math.abs(s.leq('A') - 77.03) < 0.01)
})

test('statistical levels come from the Fast histogram', () => {
  const s = new SessionStats()
  for (let i = 0; i < 40; i++) s.add(frame(50)) // warm-up, discarded
  for (let i = 0; i < 850; i++) s.add(frame(50))
  for (let i = 0; i < 150; i++) s.add(frame(90))
  const sum = s.summary()
  assert.ok(Math.abs(sum.A.l90 - 50) < 0.1)
  assert.ok(Math.abs(sum.A.l50 - 50) < 0.1)
  assert.ok(sum.A.l10 > 89.9)
  assert.equal(Math.round(sum.A.maxF), 90)
  assert.equal(Math.round(sum.A.minF), 50)
})

test('one value per second goes to the series', () => {
  const s = new SessionStats()
  for (let i = 0; i < 20 * 5; i++) s.add(frame(65))
  assert.equal(s.series.A.length, 5)
  assert.equal(s.series.A[0], 650)
})

test('NIOSH: 85 dBA allows 8 h and every 3 dB halves it', () => {
  assert.equal(allowedSeconds(85), 8 * 3600)
  assert.equal(allowedSeconds(88), 4 * 3600)
  assert.equal(allowedSeconds(100), 15 * 60)
})

test('dose reaches 100 % after the allowed time', () => {
  const s = new SessionStats()
  // 15 minutes at 100 dBA
  for (let i = 0; i < 15 * 60 * 20; i++) s.add(frame(100))
  assert.ok(Math.abs(s.dose - 1) < 1e-6)
})

test('levels under the threshold add no dose', () => {
  const s = new SessionStats()
  for (let i = 0; i < 1000; i++) s.add(frame(79))
  assert.equal(s.dose, 0)
})

test('percentile of an empty histogram is null', () => {
  assert.equal(percentileLevel(new Uint32Array(10), 0, 50), null)
})

test('toDb applies the calibration offset', () => {
  assert.equal(toDb(1, 100), 100)
  assert.ok(Math.abs(toDb(0.01, 100) - 80) < 1e-9)
})

test('record round-trips through JSON', () => {
  const s = new SessionStats()
  for (let i = 0; i < 60; i++) s.add(frame(55))
  s.addMarker('bus')
  const r = JSON.parse(JSON.stringify(s.toRecord()))
  assert.equal(r.series.A.length, 3)
  assert.equal(r.markers[0].label, 'bus')
  assert.ok(Math.abs(r.summary.A.leq - 55) < 1e-9)
})
