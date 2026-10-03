// One URL per view, with real history. The active view is always read from
// the URL; nothing else keeps a copy of it.

const routes = []
let current = null
let outlet = null
let onChange = () => {}

export function route(pattern, view) {
  routes.push({ pattern, view })
}

export function startRouter(el, { notFound, changed }) {
  outlet = el
  onChange = changed || onChange
  routes.push({ pattern: /.*/, view: notFound })

  // Links keep their real href; plain left clicks stay inside the app, while
  // modifiers (new tab, new window, download) are left to the browser.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = e.target.closest('a[href]')
    if (!a || a.target || a.hasAttribute('download')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin) return
    e.preventDefault()
    navigate(url.pathname + url.search + url.hash)
  })
  window.addEventListener('popstate', render)
  render()
}

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search + location.hash) return
  history[replace ? 'replaceState' : 'pushState'](null, '', path)
  render()
}

function render() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  for (const r of routes) {
    const m = path.match(r.pattern)
    if (!m) continue
    if (current && current.cleanup) current.cleanup()
    outlet.scrollTop = 0
    window.scrollTo(0, 0)
    const params = m.slice(1).map(decodeURIComponent)
    const cleanup = r.view.mount(outlet, params)
    current = { view: r.view, cleanup }
    document.title = `${r.view.title(params)} · Decibeles`
    onChange(path)
    return
  }
}

export function rerender() {
  render()
}
