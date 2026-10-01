const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const once = (el, key) => { if (!el || el.dataset[key]) return false; el.dataset[key] = '1'; return true }
const mins = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'under 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }
const clockOf = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}` }
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) }
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

let ctx = null
const tick = (anchor, fn, ms) => { const t = setInterval(() => { if (!anchor.isConnected) { clearInterval(t); return } fn() }, ms); return t }

async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); ctx.toast(label) } catch { ctx.toast('Clipboard is blocked in this browser', true) }
}

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function tableCsv(t) {
  const cell = (c) => { const v = (c.innerText || '').replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
  return $$('tr', t).map((r) => $$('th,td', r).map(cell).join(',')).join('\n')
}

function filterBar(t, label) {
  if (!once(t, 'xf')) return
  const bar = document.createElement('div')
  bar.className = 'x-filter no-print'
  bar.innerHTML = `<input class="input" type="search" placeholder="Filter ${esc(label)}" aria-label="Filter ${esc(label)}"><span class="small muted" aria-live="polite"></span><button class="btn sm" type="button">CSV</button>`
  t.before(bar)
  const [inp, out, csv] = [$('input', bar), $('span', bar), $('button', bar)]
  const rows = () => $$('tbody tr', t)
  inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); let n = 0; rows().forEach((r) => { const hit = !q || r.innerText.toLowerCase().includes(q); r.hidden = !hit; if (hit) n++ }); out.textContent = q ? `${n} of ${rows().length}` : '' })
  csv.onclick = () => download(`${label.replace(/\W+/g, '-').toLowerCase()}.csv`, tableCsv(t))
}

const KEYS = [['l', 'launch'], ['c', 'canvas'], ['s', 'sheet'], ['r', 'ready'], ['j', 'jobs'], ['p', 'plan'], ['e', 'export'], ['g', 'guide'], ['o', 'admin']]

function dialog(id, cls, label) {
  let d = $(`#${id}`)
  if (d) return [d, false]
  d = document.createElement('dialog')
  d.id = id
  d.className = `x-dialog ${cls}`
  d.setAttribute('aria-label', label)
  document.body.append(d)
  d.addEventListener('click', (e) => { if (e.target === d) d.close() })
  return [d, true]
}

function palette() {
  const [d, fresh] = dialog('xPal', 'x-pal', 'Command palette')
  if (fresh) {
    d.innerHTML = '<form method="dialog" class="stack"><input class="input" id="xPalQ" placeholder="Go to a page, a task, or an action" autocomplete="off" aria-controls="xPalL"><ul id="xPalL" role="listbox"></ul><p class="small muted">Enter opens, arrows move, Esc closes. <kbd>g</kbd> then a letter jumps straight to a page, <kbd>?</kbd> lists them.</p></form>'
    const q = $('#xPalQ', d), list = $('#xPalL', d)
    let items = [], sel = 0
    d.paint = () => {
      const s = q.value.trim().toLowerCase()
      items = ctx.commands().filter((c) => !s || c.label.toLowerCase().includes(s) || (c.hint || '').toLowerCase().includes(s)).slice(0, 12)
      sel = Math.min(sel, Math.max(0, items.length - 1))
      list.innerHTML = items.map((c, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}"><b>${esc(c.label)}</b>${c.hint ? `<span class="small muted">${esc(c.hint)}</span>` : ''}</li>`).join('') || '<li class="muted">Nothing matches</li>'
    }
    const fire = (i) => { const c = items[i]; if (!c) return; d.close(); c.run() }
    q.addEventListener('input', () => { sel = 0; d.paint() })
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); d.paint() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); d.paint() }
      else if (e.key === 'Enter') { e.preventDefault(); fire(sel) }
    })
    list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) fire(Number(li.dataset.i)) })
  }
  $('#xPalQ', d).value = ''
  d.paint()
  d.showModal()
  $('#xPalQ', d).focus()
}

function shortcutSheet() {
  const [d] = dialog('xKeys', '', 'Keyboard shortcuts')
  const names = Object.fromEntries(ctx.nav())
  d.innerHTML = `<form method="dialog" class="stack"><h2>Keyboard shortcuts</h2><dl class="x-keys">
    <dt><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd></dt><dd>Command palette</dd>
    ${KEYS.filter(([, v]) => names[v]).map(([k, v]) => `<dt><kbd>g</kbd> <kbd>${k}</kbd></dt><dd>${esc(names[v])}</dd>`).join('')}
    <dt><kbd>t</kbd></dt><dd>Switch theme</dd>
    <dt><kbd>f</kbd></dt><dd>Live canvas full screen</dd>
    <dt><kbd>?</kbd></dt><dd>This list</dd></dl>
    <p class="small muted">Shortcuts are off while you type in a field or while the live canvas has focus.</p>
    <div><button class="btn primary">Close</button></div></form>`
  d.showModal()
}

function fullscreen() {
  const vp = $('#vp'); if (!vp) return
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else vp.requestFullscreen?.().catch(() => ctx.toast('Full screen is not allowed here', true))
}

function wireGlobal() {
  if (document.documentElement.dataset.xg) return
  document.documentElement.dataset.xg = '1'
  let g = 0
  document.addEventListener('keydown', (e) => {
    if (!ctx?.user()) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return }
    if (e.target.closest('input, textarea, select, [contenteditable], dialog, #vp') || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === '/') { e.preventDefault(); palette(); return }
    if (e.key === '?') { e.preventDefault(); shortcutSheet(); return }
    if (g && Date.now() - g < 1200) { g = 0; const hit = KEYS.find(([k]) => k === e.key.toLowerCase()); if (hit && ctx.nav().some(([v]) => v === hit[1])) { e.preventDefault(); ctx.go(hit[1]) } return }
    if (e.key === 'g') { g = Date.now(); return }
    if (e.key === 't') { ctx.toggleTheme(); return }
    if (e.key === 'f' && $('#vp')) { e.preventDefault(); fullscreen() }
  })
}

export const openShortcuts = () => shortcutSheet()

function capsHint(input) {
  if (!input || !once(input, 'xcaps')) return
  const h = document.createElement('p')
  h.className = 'small x-caps'
  h.hidden = true
  h.setAttribute('role', 'status')
  h.textContent = 'Caps Lock is on'
  input.closest('.field')?.append(h)
  const f = (e) => { if (e.getModifierState) h.hidden = !e.getModifierState('CapsLock') }
  input.addEventListener('keydown', f); input.addEventListener('keyup', f)
}

async function launch() {
  const form = $('#launch')
  if (!once(form, 'x')) return
  const box = document.createElement('section')
  box.className = 'card stack x-eta'
  box.innerHTML = '<div class="row" style="justify-content:space-between"><h2>Before you start</h2><span class="pill" id="xEtaN">…</span></div><p class="small" id="xEta">Estimating from your past runs</p><div class="row" id="xPick"></div>'
  $('aside.stack', form).prepend(box)
  const [jobs, ready] = await Promise.all([ctx.http('/jobs').then((r) => r.jobs).catch(() => []), ctx.http('/me/readiness').catch(() => null)])
  const fin = jobs.filter((j) => j.status === 'done' && j.started_at && j.finished_at && j.step_total && j.mode !== 'validate')
  const perStep = fin.length ? fin.reduce((s, j) => s + (j.finished_at - j.started_at), 0) / fin.reduce((s, j) => s + j.step_total, 0) : 0
  let seq = 0
  const estimate = async () => {
    const my = ++seq
    const sap = $('#acc')?.value, tasks = $$('input[name=t]:checked', form).map((i) => i.value)
    if (!box.isConnected) return
    if (!sap || !tasks.length) { $('#xEta').textContent = 'Pick at least one task.'; $('#xEtaN').textContent = '0 steps'; return }
    const plan = await ctx.http(`/me/plan/${encodeURIComponent(sap)}?tasks=${tasks.join(',')}`).catch(() => null)
    if (my !== seq || !plan || !box.isConnected) return
    const n = plan.steps.length
    $('#xEtaN').textContent = `${n} steps`
    $('#xEta').innerHTML = perStep ? `About <b>${mins(n * perStep)}</b>, from ${fin.length} finished run${fin.length > 1 ? 's' : ''} at ${(perStep / 1000).toFixed(1)} s per step. Steps already done in SAP are skipped, so a rerun is faster.` : 'No finished run yet to time against. The first run sets the estimate.'
  }
  const accs = ready?.accounts || []
  const missing = () => { const a = accs.find((x) => x.sapUser === $('#acc')?.value); if (!a?.validation) return null; return Object.entries(a.validation.tasks).filter(([, x]) => x.level !== 'ok').map(([k]) => Number(k)) }
  const m = missing()
  const pick = $('#xPick')
  if (!pick || !form.isConnected) return
  pick.innerHTML = m == null ? '<span class="small muted">Run Validate once to pick only the tasks SAP still lacks.</span>' : m.length ? `<button type="button" class="btn sm" id="xMissing">Only the ${m.length} task${m.length > 1 ? 's' : ''} not verified in SAP</button>` : '<span class="pill ok">Validate found every task done in SAP</span>'
  $('#xMissing')?.addEventListener('click', () => { $$('input[name=t]', form).forEach((i) => { i.checked = m.includes(Number(i.value)) }); $$('input[name=t]', form)[0]?.dispatchEvent(new Event('change', { bubbles: true })) })
  form.addEventListener('change', (e) => { if (e.target.name === 't') estimate() })
  estimate()
}

function canvas() {
  const ctl = $('#ctl')
  if (!once(ctl, 'x')) return
  const bar = document.createElement('div')
  bar.className = 'x-runbar'
  bar.innerHTML = '<span class="pill" id="xElapsed" title="Time since the runner started">0:00</span><span class="small muted" id="xRemain"></span><span class="x-spacer"></span><button class="btn sm" type="button" id="xShot">Save frame</button><button class="btn sm" type="button" id="xFull" title="Shortcut f">Full screen</button><button class="btn sm" type="button" id="xNotify" aria-pressed="false">Alert me</button>'
  ctl.after(bar)
  const job = () => ctx.job()
  const fin = (s) => ['done', 'failed', 'aborted'].includes(s)
  const paint = () => {
    const j = job(); if (!j) return
    const start = j.started_at || j.created_at
    $('#xElapsed').textContent = clockOf((fin(j.status) ? j.finished_at || Date.now() : Date.now()) - start)
    const total = ctx.steps() || j.step_total, done = Math.min(j.step_idx || 0, total)
    $('#xRemain').textContent = fin(j.status) ? `${j.status} after ${done} of ${total} steps` : done > 2 && j.started_at ? `about ${mins(((Date.now() - j.started_at) / done) * (total - done))} left at this pace` : 'timing starts after the first steps'
  }
  paint()
  tick(bar, paint, 1000)
  $('#xShot').onclick = () => {
    const f = ctx.frame(); if (!f) return ctx.toast('No frame yet', true)
    const a = document.createElement('a'); a.href = `data:image/jpeg;base64,${f.image}`; a.download = `run-${job().id}-frame-${f.seq}.jpg`; a.click()
  }
  $('#xFull').onclick = fullscreen
  const nb = $('#xNotify')
  if (!('Notification' in window)) { nb.hidden = true; return }
  const on = () => store.get('x_notify', false) && Notification.permission === 'granted'
  const paintN = () => { nb.setAttribute('aria-pressed', String(on())); nb.textContent = on() ? 'Alerts on' : 'Alert me' }
  paintN()
  nb.onclick = async () => {
    if (on()) { store.set('x_notify', false); return paintN() }
    const p = await Notification.requestPermission()
    store.set('x_notify', p === 'granted'); paintN()
    if (p !== 'granted') ctx.toast('The browser blocked notifications for this site', true)
  }
  let last = job()?.status
  tick(bar, () => {
    const j = job(); if (!j || j.status === last) return
    last = j.status
    if (!on() || !document.hidden || !['waiting', 'done', 'failed', 'aborted'].includes(j.status)) return
    new Notification(`Run #${j.id} ${j.status}`, { body: j.status === 'waiting' ? (j.prompt?.title || 'A step needs you') : (j.result?.summary || j.sap_user), tag: `run-${j.id}` })
  }, 1500)
}

function sheet() {
  const body = $('.sheet-body')
  if (!once(body, 'x')) return
  const key = `x_sheet_${$('#sheetAcc')?.value || 'acc'}`
  const done = new Set(store.get(key, []))
  const tools = document.createElement('section')
  tools.className = 'card stack no-print x-sheet-tools'
  tools.innerHTML = '<div class="row" style="justify-content:space-between"><h2>Find and tick off</h2><span class="small muted" id="xSheetN"></span></div><input class="input" type="search" id="xSheetQ" placeholder="Find a value, field or transaction, e.g. 6300000, CN25, PH-" aria-label="Search the task sheet"><div class="meter" aria-label="Tasks you ticked"><i id="xSheetBar"></i></div><p class="small muted">Click any value to copy it. Ticks stay in this browser.</p>'
  body.prepend(tools)
  const cards = $$('.sheet-task', body)
  const paintDone = () => {
    cards.forEach((c) => c.classList.toggle('x-done', done.has(c.id)))
    $('#xSheetBar').style.width = `${Math.round((done.size / cards.length) * 100)}%`
    $('#xSheetN').textContent = `${done.size} of ${cards.length} ticked`
  }
  cards.forEach((c) => {
    const b = document.createElement('label')
    b.className = 'x-tick no-print'
    b.innerHTML = `<input type="checkbox" ${done.has(c.id) ? 'checked' : ''}> Done`
    $('input', b).addEventListener('change', (e) => { e.target.checked ? done.add(c.id) : done.delete(c.id); store.set(key, [...done]); paintDone() })
    $('header .row', c)?.prepend(b)
  })
  $$('.vals dd, .vals li', body).forEach((el) => { el.classList.add('x-copy'); el.tabIndex = 0; el.title = 'Copy'; el.setAttribute('role', 'button') })
  const doCopy = (el) => copy(el.innerText.trim(), `Copied ${el.innerText.trim().slice(0, 40)}`)
  body.addEventListener('click', (e) => { const el = e.target.closest('.x-copy'); if (el) doCopy(el) })
  body.addEventListener('keydown', (e) => { const el = e.target.closest('.x-copy'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doCopy(el) } })
  const q = $('#xSheetQ')
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase()
    let hits = 0
    cards.forEach((c) => {
      const title = $('h2', c).innerText.toLowerCase().includes(s)
      let any = !s || title
      $$('.sheet-steps > li', c).forEach((li) => { const m = !s || li.innerText.toLowerCase().includes(s); li.classList.toggle('x-hit', !!s && m); li.hidden = !!s && !m && !title; if (m) any = true })
      c.hidden = !any
      if (any && s) hits++
    })
    $('#xSheetN').textContent = s ? `${hits} task${hits === 1 ? '' : 's'} match` : `${done.size} of ${cards.length} ticked`
  })
  paintDone()
}

function ready() {
  const h = $('.hero-ready .hero-actions') || $('.hero-ready')
  if (!once(h, 'x')) return
  const wrap = document.createElement('div')
  wrap.className = 'row x-auto'
  wrap.innerHTML = '<label class="small row"><input type="checkbox" id="xAuto"> Refresh every 30 s</label><span class="small muted" id="xAutoN"></span><button class="btn sm" type="button" id="xDiag">Copy diagnostics</button>'
  h.append(wrap)
  const auto = $('#xAuto')
  auto.checked = store.get('x_auto_ready', false)
  let left = 30
  tick(wrap, () => {
    if (!auto.checked) { $('#xAutoN').textContent = ''; return }
    left--
    $('#xAutoN').textContent = `next in ${left} s`
    if (left <= 0) { left = 30; ctx.rerender() }
  }, 1000)
  auto.onchange = () => { store.set('x_auto_ready', auto.checked); left = 30 }
  $('#xDiag').onclick = () => {
    const lines = [`Ultralight readiness ${new Date().toISOString()}`, location.origin]
    $$('#view .card').forEach((c) => {
      const t = $('h2', c)?.innerText; if (!t) return
      lines.push('', `## ${t}`)
      $$('.ready-item', c).forEach((li) => lines.push(`- [${li.classList.contains('ok') ? 'ok' : li.classList.contains('err') ? 'FAIL' : 'warn'}] ${$('b', li)?.innerText || ''}: ${$('.small', li)?.innerText || ''}`))
      $$('.val-cell', c).forEach((v) => lines.push(`- ${v.innerText.replace(/\s+/g, ' ')} ${v.classList.contains('ok') ? 'ok' : v.classList.contains('err') ? 'not done' : v.classList.contains('warn') ? 'check' : 'unchecked'}`))
    })
    copy(lines.join('\n'), 'Diagnostics copied, paste them into a message')
  }
}

function lightbox(list, start) {
  const [d, fresh] = dialog('xLb', 'x-lb', 'Screenshot viewer')
  if (fresh) {
    d.innerHTML = '<figure><img alt=""><figcaption class="row" style="justify-content:space-between"><span class="small" id="xLbCap"></span><span class="row"><button class="btn sm" type="button" data-d="-1">Previous</button><button class="btn sm" type="button" data-d="1">Next</button><a class="btn sm" id="xLbDl">Download</a><button class="btn sm primary" type="button" id="xLbX">Close</button></span></figcaption></figure>'
    $('#xLbX', d).onclick = () => d.close()
  }
  let i = start
  const show = () => { const it = list[i]; $('img', d).src = it.src; $('img', d).alt = it.cap; $('#xLbCap', d).textContent = `${i + 1} of ${list.length} · ${it.cap}`; $('#xLbDl', d).href = `${it.src}?dl=1` }
  const step = (n) => { i = (i + n + list.length) % list.length; show() }
  $$('[data-d]', d).forEach((b) => { b.onclick = () => step(Number(b.dataset.d)) })
  d.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1) } }
  show()
  d.showModal()
}

function jobs() {
  const t = $('#view .grid3 table.t')
  if (t && once(t, 'xj')) {
    const bar = document.createElement('div')
    bar.className = 'x-chips no-print'
    const pills = $$('tbody .pill', t).map((p) => p.innerText.trim())
    const st = [...new Set(pills)]
    bar.innerHTML = ['all', ...st].map((s, i) => `<button type="button" class="btn sm${i ? '' : ' x-on'}" data-s="${esc(s)}" aria-pressed="${!i}">${esc(s)} <span class="muted">${s === 'all' ? pills.length : pills.filter((p) => p === s).length}</span></button>`).join('')
    t.before(bar)
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return
      $$('[data-s]', bar).forEach((x) => { x.classList.toggle('x-on', x === b); x.setAttribute('aria-pressed', String(x === b)) })
      $$('tbody tr', t).forEach((r) => { r.hidden = b.dataset.s !== 'all' && $('.pill', r)?.innerText.trim() !== b.dataset.s })
    })
  }
  const g = $('#view .gallery')
  if (g && once(g, 'xl')) {
    const figs = $$('figure', g)
    const list = figs.map((f) => ({ src: $('img', f).getAttribute('src'), cap: $('figcaption', f)?.innerText.split('\n').slice(0, 2).join(' · ') || '' }))
    g.addEventListener('click', (e) => { const a = e.target.closest('figure > a'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); lightbox(list, figs.indexOf(a.closest('figure'))) })
  }
}

function exportPage() {
  const figs = $('#view .figs')
  if (!once(figs, 'x')) return
  const attach = (f, file) => { const inp = $('input[type=file]', f); if (!inp) return; const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change')) }
  $$('.fig', figs).forEach((f) => {
    f.tabIndex = 0
    const on = (e) => { e.preventDefault(); f.classList.add('x-drop') }
    const off = () => f.classList.remove('x-drop')
    f.addEventListener('dragenter', on); f.addEventListener('dragover', on); f.addEventListener('dragleave', off)
    f.addEventListener('drop', (e) => { e.preventDefault(); off(); const file = e.dataTransfer?.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) return ctx.toast('Drop an image file', true); attach(f, file) })
    f.addEventListener('paste', (e) => { const file = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (!file) return; e.preventDefault(); attach(f, new File([file], `pasted-${Date.now()}.png`, { type: file.type })) })
  })
  const hint = document.createElement('p')
  hint.className = 'small muted no-print'
  hint.textContent = 'Drag an image from your computer onto any figure to attach it, or click a figure and paste a screenshot with Ctrl+V.'
  figs.before(hint)
}

function guide() {
  const g = $('#view .guide')
  if (!once(g, 'x')) return
  $$('pre', g).forEach((p) => {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'btn sm x-pre-copy'; b.textContent = 'Copy'
    b.onclick = () => copy(p.firstChild?.textContent?.trim() || p.innerText.replace(/Copy$/, '').trim(), 'Command copied')
    p.classList.add('x-pre'); p.append(b)
  })
  const key = 'x_guide'
  const done = new Set(store.get(key, []))
  const items = $$('ol > li', g)
  const meter = document.createElement('div')
  meter.className = 'card stack x-guide-meter no-print'
  meter.innerHTML = '<div class="row" style="justify-content:space-between"><h2>Your setup progress</h2><span class="small muted" id="xGuideN"></span></div><div class="meter"><i id="xGuideBar"></i></div><p class="small muted">Tick each step as you finish it. Saved in this browser.</p>'
  g.before(meter)
  const paint = () => { $('#xGuideN').textContent = `${done.size} of ${items.length}`; $('#xGuideBar').style.width = `${Math.round((done.size / items.length) * 100)}%` }
  items.forEach((li, i) => {
    const id = `${$('h2', li.closest('.card'))?.innerText || ''}#${i}`
    const c = document.createElement('input')
    c.type = 'checkbox'; c.className = 'x-step'; c.checked = done.has(id); c.setAttribute('aria-label', 'Done')
    li.classList.toggle('x-done', c.checked)
    c.onchange = () => { c.checked ? done.add(id) : done.delete(id); li.classList.toggle('x-done', c.checked); store.set(key, [...done]); paint() }
    li.prepend(c)
  })
  paint()
}

function admin() {
  $$('#view table.t').forEach((t) => filterBar(t, $('h2', t.closest('.card'))?.innerText || 'rows'))
}

function plan() {
  $$('#view table.t').forEach((t) => { if ($$('tbody tr', t).length > 5) filterBar(t, $('h2', t.closest('.card'))?.innerText || 'rows') })
  const svg = $('#view svg.net')
  if (!once(svg, 'x')) return
  const nodes = $$('g.node', svg)
  const paths = $$('path', svg).filter((p) => p.getAttribute('marker-end'))
  const idOf = (g) => $('text', g)?.textContent.split(' ')[0]
  const rel = ctx.planRels()
  const hint = 'Hover or tab to an activity to trace what it waits for and what it holds up.'
  const info = document.createElement('p')
  info.className = 'small muted x-net-info'
  info.setAttribute('aria-live', 'polite')
  info.textContent = hint
  svg.closest('.scroll')?.after(info)
  const walk = (a, dir, acc = new Set()) => { rel.filter((r) => (dir ? r.from : r.to) === a).forEach((r) => { const n = dir ? r.to : r.from; if (!acc.has(n)) { acc.add(n); walk(n, dir, acc) } }); return acc }
  const clear = () => { svg.classList.remove('x-focus'); nodes.forEach((n) => n.classList.remove('x-on', 'x-up', 'x-down')); paths.forEach((p) => p.classList.remove('x-on')) }
  const focus = (a) => {
    clear(); if (!a) return
    const u = walk(a, false), d = walk(a, true)
    const U = new Set([a, ...u]), D = new Set([a, ...d])
    svg.classList.add('x-focus')
    nodes.forEach((n) => { const id = idOf(n); n.classList.toggle('x-on', id === a); n.classList.toggle('x-up', u.has(id)); n.classList.toggle('x-down', d.has(id)) })
    rel.forEach((r, i) => { if ((U.has(r.from) && U.has(r.to)) || (D.has(r.from) && D.has(r.to))) paths[i]?.classList.add('x-on') })
    info.innerHTML = `<b>${esc(a)}</b> waits for ${u.size} activit${u.size === 1 ? 'y' : 'ies'}${u.size ? ` (${[...u].sort().join(', ')})` : ''} and holds up ${d.size}${d.size ? ` (${[...d].sort().join(', ')})` : ''}. Click to jump to its row.`
  }
  const pick = (a) => { const row = $$('#view table.t tbody tr').find((r) => r.cells[0]?.innerText.trim() === a); if (!row) return; row.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); row.classList.remove('x-flash'); void row.offsetWidth; row.classList.add('x-flash') }
  nodes.forEach((n) => {
    n.setAttribute('tabindex', '0'); n.setAttribute('role', 'button'); n.setAttribute('aria-label', $('title', n)?.textContent || '')
    n.addEventListener('mouseenter', () => focus(idOf(n)))
    n.addEventListener('focus', () => focus(idOf(n)))
    n.addEventListener('click', () => pick(idOf(n)))
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(idOf(n)) } })
  })
  svg.addEventListener('mouseleave', () => { clear(); info.textContent = hint })
  svg.addEventListener('focusout', (e) => { if (!svg.contains(e.relatedTarget)) { clear(); info.textContent = hint } })
}

export function enhance(c) {
  ctx = c
  wireGlobal()
  if (!ctx.user()) { capsHint($('#password')); return }
  ;({ launch, canvas, sheet, ready, jobs, export: exportPage, guide, admin, plan })[ctx.view()]?.()
}
