// One session in detail: every number worth keeping, the timeline, the level
// distribution, markers, a name and notes, and the exports.

import { meter } from '../meter.js'
import { getSession, saveSession, deleteSession, getSettings } from '../store.js'
import { t } from '../i18n.js'
import { toast } from '../toast.js'
import { navigate } from '../router.js'
import { drawHistory, drawDistribution } from '../ui/history.js'
import { shareRecord } from '../ui/sharecard.js'
import { fmtDb, fmtDate, fmtSpan, fmtClock, zoneIndex, ZONES, describe, esc, icon, download } from '../format.js'

export default {
  title: () => t('nav.sessions'),
  mount,
}

function mount(root, params) {
  const id = params[0]
  let record = null
  let w = getSettings().weighting
  let live = false

  async function load() {
    live = meter.session.id === id && meter.state !== 'idle'
    record = live ? meter.record() : await getSession(id)
    if (live) {
      // Keep the name and note typed on a saved copy of the running session.
      const saved = await getSession(id)
      if (saved) { record.name = saved.name; record.note = saved.note }
    }
  }

  function render() {
    if (!record) {
      root.innerHTML = `
        <section class="detail">
          <a class="back" href="/sessions">${icon('back')}<span>${t('detail.back')}</span></a>
          <div class="empty">${icon('wave')}<p>${t('detail.notFound')}</p></div>
        </section>`
      return
    }
    const s = record.summary[w]
    const z = ZONES[zoneIndex(s.leq)]
    const seg = (v) => `<button type="button" role="radio" data-w="${v}" aria-checked="${v === w}">${v}</button>`
    root.innerHTML = `
      <section class="detail" style="--zc: var(${z.css})">
        <div class="print-only print-head"><b>DECIBELES</b><span>${t('print.title')}</span></div>
        <a class="back" href="/sessions">${icon('back')}<span>${t('detail.back')}</span></a>
        ${live ? `<p class="notice">${icon('wave')}<span>${t('detail.inProgress')}</span></p>` : ''}
        <header class="detail-head">
          <div>
            <div class="k">${fmtDate(record.startedAt, { dateStyle: 'full', timeStyle: 'short' })}</div>
            <div class="detail-big"><b id="dLeq">${fmtDb(s.leq)}</b><span>L${w}eq · dB(${w})</span></div>
            <div class="descriptor"><span class="zdot"></span><b>${t(z.key)}</b><span>${describe(s.leq)}</span></div>
          </div>
          <div class="seg" role="radiogroup" aria-label="${t('set.weighting')}">${seg('A')}${seg('C')}${seg('Z')}</div>
        </header>

        <div class="grid-stats">
          ${cell(t('detail.duration'), fmtSpan(record.seconds))}
          ${cell(`L${w}Fmax`, fmtDb(s.maxF))}
          ${cell(`L${w}Fmin`, fmtDb(s.minF))}
          ${cell(t('stat.peak'), fmtDb(record.summary.peak))}
          ${cell(`L${w}Smax`, fmtDb(s.maxS))}
          ${cell(`L${w}Smin`, fmtDb(s.minS))}
          ${cell(t('stat.dose') + ' NIOSH', `${(record.summary.dose * 100).toFixed(record.summary.dose < 0.1 ? 1 : 0)} %`)}
          ${cell('LAeq · LCeq', `${fmtDb(record.summary.A.leq, 0)} · ${fmtDb(record.summary.C.leq, 0)}`)}
        </div>

        <h2 class="h2">${t('detail.timeline')}</h2>
        <div class="card"><canvas class="chart" id="cTime"></canvas></div>

        <h2 class="h2">${t('detail.statistical')}</h2>
        <div class="lstats">
          ${lrow('L10', s.l10, t('detail.l10'))}
          ${lrow('L50', s.l50, t('detail.l50'))}
          ${lrow('L90', s.l90, t('detail.l90'))}
        </div>

        <h2 class="h2">${t('detail.distribution')}</h2>
        <div class="card"><canvas class="chart chart-short" id="cDist"></canvas></div>

        ${eventsSection(record)}

        ${record.markers && record.markers.length ? `
          <h2 class="h2">${t('detail.markers')}</h2>
          <ol class="markers">${record.markers.map((m) => `<li><b>${fmtClock(m.t)}</b>${esc(m.label)}</li>`).join('')}</ol>` : ''}

        ${record.name || record.note ? `<div class="print-only print-note"><b>${esc(record.name)}</b><p>${esc(record.note)}</p></div>` : ''}
        <p class="print-only fine">${t('print.footer', { offset: (record.offset ?? getSettings().offset).toFixed(1) })}</p>

        <div class="fields">
          <label class="field"><span class="k">${t('detail.name')}</span>
            <input id="fName" type="text" maxlength="80" value="${esc(record.name)}" placeholder="${t('detail.namePlaceholder')}"></label>
          <label class="field"><span class="k">${t('detail.note')}</span>
            <textarea id="fNote" rows="3" maxlength="2000" placeholder="${t('detail.notePlaceholder')}">${esc(record.note)}</textarea></label>
        </div>

        <div class="page-actions">
          <button type="button" class="btn-primary" id="aShare">${icon('share')}<span>${t('detail.share')}</span></button>
          <button type="button" class="btn-ghost" id="aPrint">${icon('print')}<span>${t('detail.print')}</span></button>
          <button type="button" class="btn-ghost" id="aCsv">${icon('download')}<span>${t('detail.csv')}</span></button>
          <button type="button" class="btn-ghost" id="aJson">${icon('download')}<span>${t('detail.json')}</span></button>
          ${live ? '' : `<button type="button" class="btn-ghost danger" id="aDel">${icon('trash')}<span>${t('detail.delete')}</span></button>`}
        </div>
      </section>`
    draw()
  }

  function draw() {
    const time = root.querySelector('#cTime')
    if (!time) return
    drawHistory(time, record.series[w].map((v) => v / 10), {
      mode: 'session',
      leq: record.summary[w].leq,
      markers: (record.markers || []).map((m) => m.t),
      events: record.events || [],
    })
    time._range = null
    drawDistribution(root.querySelector('#cDist'), record.hist[w])
  }

  let saveTimer = 0
  function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      record.name = root.querySelector('#fName').value.trim()
      record.note = root.querySelector('#fNote').value
      if (live) {
        meter.session.name = record.name
        meter.session.note = record.note
      }
      await saveSession(live ? meter.record() : record)
      toast(t('detail.saved'), { ms: 1200 })
    }, 600)
  }

  root.addEventListener('input', (e) => {
    if (e.target.id === 'fName' || e.target.id === 'fNote') scheduleSave()
  })

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b || !record) return
    if (b.dataset.w) { w = b.dataset.w; render() }
    else if (b.id === 'aShare') {
      const r = await shareRecord(record, w)
      if (r === 'downloaded') toast(t('share.saved'))
    } else if (b.id === 'aPrint') {
      window.print()
    } else if (b.id === 'aCsv') {
      const rows = ['second,LAeq_1s,LCeq_1s,LZeq_1s,LAFmax_1s']
      const sr = record.series
      for (let i = 0; i < sr.A.length; i++) {
        rows.push([i, sr.A[i] / 10, sr.C[i] / 10, sr.Z[i] / 10, sr.AFmax[i] / 10].join(','))
      }
      download(`${fileBase(record)}.csv`, new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }))
    } else if (b.id === 'aJson') {
      download(`${fileBase(record)}.json`, new Blob([JSON.stringify(record, null, 1)], { type: 'application/json' }))
    } else if (b.id === 'aDel') {
      if (!confirm(t('detail.confirmDelete'))) return
      await deleteSession(record.id)
      navigate('/sessions')
    }
  })

  // A running session refreshes its numbers every few seconds.
  let tick = 0
  if (meter.session.id === id) {
    tick = setInterval(() => {
      if (meter.session.id !== id || meter.state === 'idle') return
      const focused = document.activeElement && ['fName', 'fNote'].includes(document.activeElement.id)
      if (focused) return
      record = { ...meter.record(), name: record.name, note: record.note }
      render()
    }, 5000)
  }

  const onResize = () => record && draw()
  window.addEventListener('resize', onResize)

  // Paper prints well on paper: switch the skin for the printout and redraw
  // the charts with its colors, then put everything back.
  let themeBefore = null
  const beforePrint = () => {
    themeBefore = document.documentElement.dataset.theme
    document.documentElement.dataset.theme = 'papel'
    if (record) draw()
  }
  const afterPrint = () => {
    if (themeBefore) document.documentElement.dataset.theme = themeBefore
    themeBefore = null
    if (record) draw()
  }
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)

  load().then(render)

  return () => {
    clearInterval(tick)
    clearTimeout(saveTimer)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('beforeprint', beforePrint)
    window.removeEventListener('afterprint', afterPrint)
  }
}

function eventsSection(r) {
  const events = r.events || []
  const level = r.eventThreshold ?? 70
  if (!events.length) {
    return `<h2 class="h2">${t('detail.events', { level })}</h2><p class="fine ev-none">${t('detail.noEvents', { level })}</p>`
  }
  const total = events.reduce((a, e) => a + e.d, 0)
  const summary = events.length === 1
    ? t('detail.eventsSummaryOne', { time: fmtSeconds(total) })
    : t('detail.eventsSummary', { n: events.length, time: fmtSeconds(total) })
  const rows = events.map((e, i) => `
    <tr>
      <td class="ev-n">${i + 1}</td>
      <td>${fmtDate(r.startedAt + e.t * 1000, { timeStyle: 'medium' })} <span class="k">+${fmtClock(e.t)}</span></td>
      <td>${fmtSeconds(e.d)}</td>
      <td class="ev-max" style="--zc: var(${ZONES[zoneIndex(e.max)].css})">${fmtDb(e.max)}</td>
    </tr>`).join('')
  return `
    <h2 class="h2">${t('detail.events', { level })}</h2>
    <p class="k ev-sum">${summary}</p>
    <div class="ev-table"><table>
      <thead><tr><th>#</th><th>${t('detail.colTime')}</th><th>${t('detail.colDuration')}</th><th>${t('detail.colMax')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
}

function fmtSeconds(s) {
  return s < 60 ? `${s.toFixed(1)} ${t('units.s')}` : fmtSpan(s)
}

function cell(k, v) {
  return `<div class="gcell"><span class="k">${k}</span><b>${v}</b></div>`
}

function lrow(name, v, label) {
  return `<div class="lrow" style="--zc: var(${ZONES[zoneIndex(v)].css})"><b>${name}</b><span>${label}</span><em>${fmtDb(v)}</em></div>`
}

function fileBase(r) {
  return 'decibeles-' + new Date(r.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')
}
