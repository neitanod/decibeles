// Persistence: settings in IndexedDB with a copy in localStorage, sessions in
// IndexedDB.
//
// localStorage alone lost settings. Chrome keeps its writes in memory and puts
// them on disk several seconds later, and later still after a few changes in a
// row, so a phone that kills the app when it is closed drops the calibration
// that was just made. An IndexedDB write is on disk once its transaction
// completes, so that copy wins at startup. The localStorage copy is the one
// the theme script in index.html reads before the first paint.

const SETTINGS_KEY = 'decibeles.settings'
// A database of its own: adding a store to the sessions one needs a version
// upgrade, and an older tab that has it open blocks the upgrade.
const SETTINGS_DB = 'decibeles-settings'
const SETTINGS_STORE = 'settings'
// Past this, the app starts with the localStorage copy.
const SETTINGS_READ_TIMEOUT_MS = 1500

export const DEFAULT_OFFSET = 100

export const DEFAULTS = {
  weighting: 'A',
  timeWeighting: 'F',
  offset: DEFAULT_OFFSET,
  theme: 'estudio',
  lang: 'auto',
  alertOn: false,
  alertLevel: 85,
  alertVibrate: true,
  eventLevel: 70,
  lightGreen: 55,
  lightRed: 70,
  lightAvg: 3,
  autosave: true,
  wakeLock: true,
  panel: 'history',
  historyRange: 'live',
  installDismissed: false,
}

const listeners = new Set()
let settingsDbPromise = null
let settings = await load()

export function mergeSettings(local, durable) {
  return { ...DEFAULTS, ...local, ...durable }
}

async function load() {
  const local = readLocal()
  const durable = await readDurable()
  const merged = mergeSettings(local, durable)
  if (durable) {
    // Settings saved before the IndexedDB copy existed go into it now.
    const missing = Object.keys(local).filter((k) => !(k in durable))
    if (missing.length) writeDurable(Object.fromEntries(missing.map((k) => [k, local[k]])))
    // A localStorage copy that lost writes is brought up to date.
    if (Object.keys(durable).some((k) => durable[k] !== local[k])) writeLocal(merged)
  }
  return merged
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeLocal(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

function settingsDb() {
  if (!settingsDbPromise) {
    settingsDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(SETTINGS_DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(SETTINGS_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return settingsDbPromise
}

// Resolves to null when IndexedDB fails or takes too long.
function readDurable() {
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, SETTINGS_READ_TIMEOUT_MS, null) })
  const read = settingsDb().then((d) => new Promise((resolve, reject) => {
    const out = {}
    const t = d.transaction(SETTINGS_STORE)
    const cursor = t.objectStore(SETTINGS_STORE).openCursor()
    cursor.onsuccess = () => {
      const c = cursor.result
      if (c) { out[c.key] = c.value; c.continue() }
    }
    t.oncomplete = () => resolve(out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
  return Promise.race([read, timeout]).catch(() => null).finally(() => clearTimeout(timer))
}

// One record per setting, so an older tab that changes one setting leaves
// the rest alone.
function writeDurable(entries) {
  settingsDb().then((d) => {
    const s = d.transaction(SETTINGS_STORE, 'readwrite').objectStore(SETTINGS_STORE)
    for (const [k, v] of Object.entries(entries)) s.put(v, k)
  }).catch(() => {})
}

export function getSettings() {
  return settings
}

export function setSetting(key, value) {
  if (settings[key] === value) return
  settings = { ...settings, [key]: value }
  writeLocal(settings)
  writeDurable({ [key]: value })
  for (const fn of listeners) fn(key, value, settings)
}

export function onSettings(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// --- Sessions ------------------------------------------------------------

const DB_NAME = 'decibeles'
const STORE = 'sessions'
let dbPromise = null

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id' })
        s.createIndex('startedAt', 'startedAt')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    Promise.resolve(fn(store)).then((r) => { result = r })
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export function saveSession(record) {
  return tx('readwrite', (s) => req(s.put(record)))
}

export function getSession(id) {
  return tx('readonly', (s) => req(s.get(id)))
}

export function deleteSession(id) {
  return tx('readwrite', (s) => req(s.delete(id)))
}

export function clearSessions() {
  return tx('readwrite', (s) => req(s.clear()))
}

export async function listSessions() {
  const all = await tx('readonly', (s) => req(s.getAll()))
  return (all || []).sort((a, b) => b.startedAt - a.startedAt)
}

export async function importSessions(records) {
  let n = 0
  await tx('readwrite', (s) => {
    for (const r of records) {
      if (r && typeof r.id === 'string' && typeof r.startedAt === 'number' && r.summary) {
        s.put(r)
        n++
      }
    }
  })
  return n
}
