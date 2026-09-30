const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const M = '/static/media/'

export const THEMES = {
  launch: { hue: ['#ff7a18', '#ffb347', '#ff3d77'], title: 'Launch', kicker: 'Run pack', shape: 'orbit', img: 'shot-launch.webp', line: 'Pick an account, pick tasks, press start.' },
  canvas: { hue: ['#00d2ff', '#3a7bd5', '#00ffa3'], title: 'Live', kicker: 'Live canvas', shape: 'scan', img: 'sap-activities.webp', line: 'The real SAP screen, streamed while the runner works.' },
  sheet: { hue: ['#f7971e', '#ffd200', '#f45c43'], title: 'Sheet', kicker: 'Task sheet', shape: 'lines', img: 'sap-wbs.webp', line: 'Every value for your LEARN number, step by step.' },
  ready: { hue: ['#11998e', '#38ef7d', '#a8ff78'], title: 'Ready', kicker: 'Readiness', shape: 'pulse', img: 'shot-ready.webp', line: 'Green means go. Anything red says how to fix it.' },
  jobs: { hue: ['#8e2de2', '#4a00e0', '#ff6ec4'], title: 'Proof', kicker: 'Runs and evidence', shape: 'film', img: 'sap-costs.webp', line: 'Screenshots and read-backs from every run.' },
  plan: { hue: ['#fc466b', '#3f5efb', '#00c9ff'], title: 'Model', kicker: 'Project data', shape: 'graph', img: 'sap-network.webp', line: 'The network, WBS and costs the pack types in.' },
  guide: { hue: ['#43cea2', '#185a9d', '#f8ff00'], title: 'Setup', kicker: 'Setup guide', shape: 'steps', img: 'shot-guide.webp', line: 'Site, runner, approvals. Three pieces, done once.' },
  export: { hue: ['#2af598', '#009efd', '#b721ff'], title: 'Submit', kicker: 'Submission package', shape: 'doc', img: 'sap-structure.webp', line: 'Screenshots, timestamps, task tables and a conclusion in one Word file.' },
  admin: { hue: ['#ee0979', '#ff6a00', '#ffd452'], title: 'Keys', kicker: 'Owner console', shape: 'shield', img: 'sap-invoice.webp', line: 'Who gets in, which accounts, which runners.' }
}

const svgShape = (shape, [a, b, c]) => {
  const g = `<defs><linearGradient id="hg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`
  const s = {
    orbit: `<circle cx="100" cy="100" r="70" class="fx-ring"/><circle cx="100" cy="100" r="46" class="fx-ring r2"/><g class="fx-spin"><circle cx="170" cy="100" r="7" fill="url(#hg)"/></g><g class="fx-spin s2"><circle cx="100" cy="54" r="5" fill="${c}"/></g><circle cx="100" cy="100" r="16" fill="url(#hg)" class="fx-beat"/>`,
    scan: `<rect x="30" y="40" width="140" height="110" rx="10" class="fx-ring"/><rect x="30" y="40" width="140" height="6" fill="url(#hg)" class="fx-scan"/>${[0, 1, 2, 3].map((i) => `<rect x="44" y="${62 + i * 20}" width="${60 + (i % 2) * 40}" height="8" rx="4" fill="${i % 2 ? b : a}" opacity=".55" class="fx-blink" style="animation-delay:${i * .4}s"/>`).join('')}`,
    lines: [0, 1, 2, 3, 4].map((i) => `<rect x="40" y="${44 + i * 24}" width="120" height="10" rx="5" fill="url(#hg)" class="fx-grow" style="animation-delay:${i * .25}s"/>`).join('') + '<circle cx="30" cy="49" r="4" fill="#fff" class="fx-beat"/>',
    pulse: `<circle cx="100" cy="100" r="24" fill="url(#hg)"/>${[0, 1, 2].map((i) => `<circle cx="100" cy="100" r="24" class="fx-wave" style="animation-delay:${i * .9}s"/>`).join('')}<path d="M88 100l8 8 16-18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    film: [0, 1, 2].map((i) => `<rect x="${24 + i * 54}" y="60" width="46" height="72" rx="6" fill="url(#hg)" opacity="${.5 + i * .2}" class="fx-float" style="animation-delay:${i * .5}s"/>`).join('') + '<rect x="18" y="50" width="164" height="92" rx="10" class="fx-ring"/>',
    graph: (() => { const n = [[30, 100], [80, 55], [80, 145], [130, 100], [175, 100]]; const e = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]]; return e.map(([x, y]) => `<line x1="${n[x][0]}" y1="${n[x][1]}" x2="${n[y][0]}" y2="${n[y][1]}" class="fx-edge"/>`).join('') + n.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="11" fill="url(#hg)" class="fx-beat" style="animation-delay:${i * .3}s"/>`).join('') })(),
    steps: [0, 1, 2].map((i) => `<rect x="${30 + i * 50}" y="${130 - i * 34}" width="44" height="${34 + i * 34}" rx="6" fill="url(#hg)" opacity="${.55 + i * .2}" class="fx-rise" style="animation-delay:${i * .3}s"/>`).join('') + '<circle cx="175" cy="50" r="8" fill="#fff" class="fx-beat"/>',
    doc: `<rect x="52" y="26" width="96" height="128" rx="10" fill="url(#hg)" class="fx-float"/>${[0, 1, 2, 3].map((i) => `<rect x="66" y="${50 + i * 18}" width="${68 - (i % 2) * 20}" height="7" rx="3.5" fill="#fff" opacity=".85" class="fx-grow" style="animation-delay:${i * .3}s"/>`).join('')}<path d="M100 150v28M86 166l14 14 14-14" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" class="fx-drop"/>`,
    shield: `<path d="M100 30l58 22v44c0 38-26 64-58 76-32-12-58-38-58-76V52z" fill="url(#hg)" class="fx-beat"/><circle cx="100" cy="94" r="14" fill="#fff" opacity=".9"/><rect x="95" y="100" width="10" height="26" rx="4" fill="#fff" opacity=".9"/><path d="M100 30l58 22v44c0 38-26 64-58 76-32-12-58-38-58-76V52z" class="fx-wave"/>`
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true" class="fx-art">${g}${s[shape] || s.orbit}</svg>`
}

export function hero(view, { title, text, meta = '', actions = '' }) {
  const t = THEMES[view] || THEMES.launch
  const [a, b, c] = t.hue
  return `<header class="hero hero-${view}" style="--h1:${a};--h2:${b};--h3:${c}">
    <div class="hero-bg" aria-hidden="true"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><img class="hero-shot" src="${M}${t.img}" alt="" loading="lazy" decoding="async"></div>
    <div class="hero-copy">
      <span class="kicker"><span class="kdot"></span>${t.kicker}</span>
      <h1 class="hero-title">${title}</h1>
      <p class="hero-text">${text || t.line}</p>
      ${meta ? `<div class="hero-meta">${meta}</div>` : ''}
    </div>
    <div class="hero-side">${svgShape(t.shape, t.hue)}${actions ? `<div class="hero-actions">${actions}</div>` : ''}</div>
    <span class="hero-word" aria-hidden="true">${t.title}</span>
  </header>`
}

export function mountBackdrop() {
  if (document.querySelector('.aurora')) return
  const d = document.createElement('div')
  d.className = 'aurora'
  d.setAttribute('aria-hidden', 'true')
  d.innerHTML = '<i></i><i></i><i></i><canvas></canvas>'
  document.body.prepend(d)
  if (reduced()) return
  const cv = d.querySelector('canvas'), ctx = cv.getContext('2d')
  let w, h, pts
  const size = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; pts = Array.from({ length: Math.min(70, Math.round(w * h / 24000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 })) }
  size(); addEventListener('resize', size)
  let last = 0
  const tick = (t) => {
    requestAnimationFrame(tick)
    if (document.hidden || t - last < 33) return
    last = t
    ctx.clearRect(0, 0, w, h)
    const col = getComputedStyle(document.documentElement).getPropertyValue('--dot').trim() || 'rgba(255,255,255,.5)'
    ctx.fillStyle = col; ctx.strokeStyle = col
    for (const p of pts) { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, 7); ctx.fill() }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, q = dx * dx + dy * dy; if (q < 14000) { ctx.globalAlpha = (1 - q / 14000) * .25; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke() } }
  }
  requestAnimationFrame(tick)
}

export function setScene(view) {
  const t = THEMES[view]
  const r = document.documentElement.style
  if (!t) { ['--s1', '--s2', '--s3'].forEach((k) => r.removeProperty(k)); return }
  r.setProperty('--s1', t.hue[0]); r.setProperty('--s2', t.hue[1]); r.setProperty('--s3', t.hue[2])
}

let io
export function reveal(root = document) {
  if (reduced() || !('IntersectionObserver' in window)) return
  const els = root.querySelectorAll('.card:not(.rv), .task:not(.rv), .mode:not(.rv), .gallery figure:not(.rv), .val-cell:not(.rv), .ready-item:not(.rv), .sheet-task:not(.rv)')
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0, rootMargin: '0px 0px 40px 0px' })
  let i = 0
  const vh = innerHeight
  els.forEach((el) => {
    if (el.closest('.drawer, .pdfview, .hero')) return
    el.classList.add('rv')
    el.style.setProperty('--d', `${Math.min(i++, 14) * 38}ms`)
    if (el.getBoundingClientRect().top < vh) requestAnimationFrame(() => el.classList.add('in'))
    else io.observe(el)
  })
  setTimeout(() => root.querySelectorAll('.rv:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in') }), 1500)
}

export function tilt(root = document) {
  if (reduced() || !matchMedia('(pointer: fine)').matches) return
  root.querySelectorAll('[data-tilt]:not([data-tilted])').forEach((el) => {
    el.dataset.tilted = '1'
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)` })
    el.addEventListener('pointerleave', () => { el.style.transform = '' })
  })
}

export function typeLine(el, lines, speed = 34) {
  if (!el) return
  if (reduced()) { el.textContent = lines[0]; return }
  let li = 0, ci = 0, del = false
  const step = () => {
    if (!el.isConnected) return
    const s = lines[li]
    el.textContent = s.slice(0, ci)
    if (!del && ci < s.length) { ci++; return setTimeout(step, speed) }
    if (!del) { del = true; return setTimeout(step, 2400) }
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
    const t0 = performance.now(), dur = 1400
    const f = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(end * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(f) }
    requestAnimationFrame(f)
  })
}

export function transition(fn) {
  if (!document.startViewTransition || reduced()) return fn()
  document.startViewTransition(fn)
}

export const media = M
