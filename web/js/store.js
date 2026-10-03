// Persistence: settings in localStorage, sessions in IndexedDB.

const SETTINGS_KEY = 'decibeles.settings'

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
let settings = load()

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function getSettings() {
  return settings
}

export function setSetting(key, value) {
  if (settings[key] === value) return
  settings = { ...settings, [key]: value }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
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
