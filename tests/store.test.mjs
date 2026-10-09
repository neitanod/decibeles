import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSettings, DEFAULTS } from '../web/js/store.js'

test('the IndexedDB copy wins over a localStorage copy that lost writes', () => {
  const local = { offset: 100, theme: 'papel' }
  const durable = { offset: 93.5 }
  const s = mergeSettings(local, durable)
  assert.equal(s.offset, 93.5)
  assert.equal(s.theme, 'papel')
  assert.equal(s.weighting, DEFAULTS.weighting)
})

test('with no IndexedDB copy the localStorage one is used', () => {
  const s = mergeSettings({ offset: 97 }, null)
  assert.equal(s.offset, 97)
  assert.equal(s.lightRed, DEFAULTS.lightRed)
})
