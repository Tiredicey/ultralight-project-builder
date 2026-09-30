const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const M = '/static/media/'

export const THEMES = {
  launch: { kicker: 'Run pack', line: 'Pick an account, pick tasks, press start.' },
  canvas: { kicker: 'Live canvas', line: 'The real SAP screen, streamed while the runner works.' },
  sheet: { kicker: 'Task sheet', line: 'Every value for your LEARN number, step by step.' },
  ready: { kicker: 'Readiness', line: 'Green means go. Anything red says how to fix it.' },
  jobs: { kicker: 'Runs and evidence', line: 'Screenshots and read-backs from every run.' },
  plan: { kicker: 'Project data', line: 'The network, WBS and costs the pack types in.' },
  guide: { kicker: 'Setup guide', line: 'Site, runner, approvals. Three pieces, done once.' },
  export: { kicker: 'Submission package', line: 'Screenshots, timestamps, task tables and a conclusion in one Word file.' },
  admin: { kicker: 'Owner console', line: 'Who gets in, which accounts, which runners.' }
}

export function hero(view, { title, text, meta = '', actions = '' }) {
  const t = THEMES[view] || THEMES.launch
  return `<header class="hero hero-${view}">
    <div class="hero-copy">
      <span class="kicker">${t.kicker}</span>
      <h1 class="hero-title">${title}</h1>
      <p class="hero-text">${text || t.line}</p>
      ${meta ? `<div class="hero-meta">${meta}</div>` : ''}
    </div>
    ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
  </header>`
}

export function mountBackdrop() {
  if (document.querySelector('.backdrop')) return
  const d = document.createElement('div')
  d.className = 'backdrop'
  d.setAttribute('aria-hidden', 'true')
  document.body.prepend(d)
}

let io
export function reveal(root = document) {
  if (reduced() || !('IntersectionObserver' in window)) return
  const els = root.querySelectorAll('.card:not(.rv), .gallery figure:not(.rv), .val-cell:not(.rv), .sheet-task:not(.rv), .fig:not(.rv)')
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0, rootMargin: '0px 0px 40px 0px' })
  let i = 0
  const vh = innerHeight
  els.forEach((el) => {
    if (el.closest('.drawer, .pdfview, .hero')) return
    el.classList.add('rv')
    el.style.setProperty('--d', `${Math.min(i++, 8) * 30}ms`)
    if (el.getBoundingClientRect().top < vh) requestAnimationFrame(() => el.classList.add('in'))
    else io.observe(el)
  })
  setTimeout(() => root.querySelectorAll('.rv:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in') }), 1200)
}

export function typeLine(el, lines, speed = 38) {
  if (!el) return
  if (reduced()) { el.textContent = lines[0]; return }
  let li = 0, ci = 0, del = false
  const step = () => {
    if (!el.isConnected) return
    const s = lines[li]
    el.textContent = s.slice(0, ci)
    if (!del && ci < s.length) { ci++; return setTimeout(step, speed) }
    if (!del) { del = true; return setTimeout(step, 2600) }
    if (ci > 0) { ci--; return setTimeout(step, speed / 2) }
    del = false; li = (li + 1) % lines.length; setTimeout(step, 300)
  }
  step()
}

export function countUp(root = document) {
  root.querySelectorAll('[data-count]:not([data-counted])').forEach((el) => {
    el.dataset.counted = '1'
    const end = Number(el.dataset.count), dec = Number(el.dataset.dec || 0)
    const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    if (reduced()) { el.textContent = fmt(end); return }
    const t0 = performance.now(), dur = 1100
    const f = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(end * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(f) }
    requestAnimationFrame(f)
  })
}

export function transition(fn) {
  if (!document.startViewTransition || reduced()) return fn()
  const t = document.startViewTransition(fn)
  ;[t.ready, t.finished].forEach((pr) => pr.catch(() => {}))
}

export const media = M
