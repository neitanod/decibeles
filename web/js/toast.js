// Small transient messages above the tab bar.

let timer = 0

export function toast(text, { ms = 2600, tone = '' } = {}) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = text
  el.dataset.tone = tone
  el.classList.add('is-visible')
  clearTimeout(timer)
  timer = setTimeout(() => el.classList.remove('is-visible'), ms)
}
