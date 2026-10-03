import { t } from '../i18n.js'
import { icon } from '../format.js'

export default {
  title: () => t('notfound.title'),
  mount(root) {
    root.innerHTML = `
      <section class="notfound">
        <div class="nf-num">404</div>
        <p>${t('notfound.title')}</p>
        <a class="btn-primary" href="/">${icon('gauge')}<span>${t('notfound.back')}</span></a>
      </section>`
    return () => {}
  },
}
