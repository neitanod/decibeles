// Saved sessions: a list of cards with a sparkline each, plus export and
// import of the whole history as JSON.

import { meter } from '../meter.js'
import { listSessions, importSessions, clearSessions, getSettings } from '../store.js'
import { t } from '../i18n.js'
import { toast } from '../toast.js'
import { fmtDb, fmtDate, fmtSpan, zoneIndex, ZONES, esc, icon, download } from '../format.js'

export default {
  title: () => t('nav.sessions'),
  mount,
}

function sparkline(series) {
  const v = (series || []).map((x) => x / 10)
  if (v.length < 2) return ''
  const n = Math.min(v.length, 80)
  const step = v.length / n
  const pts = []
  const lo = Math.min(...v), hi = Math.max(...v)
  const span = Math.max(10, hi - lo)
  for (let i = 0; i < n; i++) {
    const y = 28 - ((v[Math.floor(i * step)] - lo) / span) * 26
    pts.push(`${(i / (n - 1) * 100).toFixed(1)},${y.toFixed(1)}`)
  }
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}"/></svg>`
}

function card(r, current) {
  const s = r.summary.A
  const z = ZONES[zoneIndex(s.leq)]
  return `
    <a class="ses-card" href="/sessions/${encodeURIComponent(r.id)}" style="--zc: var(${z.css})">
      <div class="ses-main">
        <div class="ses-title">${esc(r.name) || t('sessions.unnamed')}${current ? ` <span class="pill">${t('sessions.current')}</span>` : ''}</div>
        <div class="ses-meta k">${fmtDate(r.startedAt)} · ${fmtSpan(r.seconds)}</div>
        ${sparkline(r.series.A)}
      </div>
      <div class="ses-num">
        <b>${fmtDb(s.leq)}</b>
        <span class="k">LAeq</span>
        <span class="ses-max k">${t('stat.max')} ${fmtDb(s.maxF)}</span>
      </div>
    </a>`
}

function mount(root) {
  let records = []

  async function render() {
    records = await listSessions()
    const auto = getSettings().autosave
    const count = records.length === 1 ? t('sessions.countOne') : t('sessions.count', { n: records.length })
    root.innerHTML = `
      <section class="sessions">
        <header class="page-head">
          <h1>${t('sessions.title')}</h1>
          <span class="k">${records.length ? count : ''}</span>
        </header>
        ${records.length
          ? `<div class="ses-list">${records.map((r) => card(r, r.id === meter.session.id && meter.state !== 'idle')).join('')}</div>`
          : `<div class="empty">${icon('wave')}<p>${t(auto ? 'sessions.empty' : 'sessions.emptyOff')}</p></div>`}
        <div class="page-actions">
          ${records.length ? `<button type="button" class="btn-ghost" id="exp">${icon('download')}<span>${t('sessions.export')}</span></button>` : ''}
          <label class="btn-ghost">${icon('upload')}<span>${t('sessions.import')}</span><input type="file" id="imp" accept="application/json,.json" hidden></label>
          ${records.length ? `<button type="button" class="btn-ghost danger" id="del">${icon('trash')}<span>${t('sessions.deleteAll')}</span></button>` : ''}
        </div>
      </section>`
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.id === 'exp') {
      const blob = new Blob([JSON.stringify({ app: 'decibeles', version: 1, exportedAt: Date.now(), sessions: records }, null, 1)], { type: 'application/json' })
      download(`decibeles-${new Date().toISOString().slice(0, 10)}.json`, blob)
    } else if (b.id === 'del') {
      if (!confirm(t('sessions.confirmDeleteAll', { n: records.length }))) return
      await clearSessions()
      render()
    }
  })

  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'imp' || !e.target.files[0]) return
    try {
      const data = JSON.parse(await e.target.files[0].text())
      const list = Array.isArray(data) ? data : data.sessions
      if (!Array.isArray(list)) throw new Error('format')
      const n = await importSessions(list)
      toast(t('sessions.imported', { n }))
      render()
    } catch {
      toast(t('sessions.importError'), { tone: 'bad' })
    }
  })

  const onSaved = () => render()
  meter.addEventListener('saved', onSaved)
  render()
  return () => meter.removeEventListener('saved', onSaved)
}
