const $ = (s, r = document) => r.querySelector(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '')
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago` }

const S = { user: null, view: 'launch', pack: null, accounts: [], runnersOnline: 0, jobs: [], job: null, events: [], evidence: [], plan: null, frame: null, frameSeq: -1, lastEvent: 0, overlay: true, timers: [], admin: null, health: null, selTasks: new Set(), selAccount: '', mode: 'assist', typeBuf: '', hot: null }

async function http(path, opts = {}) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e }
  return data
}

function toast(msg, err = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove())
  const t = document.createElement('div')
  t.className = `toast${err ? ' err' : ''}`
  t.setAttribute('role', err ? 'alert' : 'status')
  t.textContent = msg
  document.body.append(t)
  setTimeout(() => t.remove(), 4200)
}

const run = (fn) => async (...a) => { try { await fn(...a) } catch (e) { toast(e.message, true) } }

function stopTimers() { S.timers.forEach(clearInterval); S.timers = [] }

const theme = localStorage.getItem('uc_theme')
if (theme) document.documentElement.dataset.theme = theme
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const next = cur === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem('uc_theme', next)
}

async function boot() {
  S.health = await http('/health').catch(() => ({ initialized: true }))
  S.user = (await http('/auth/me')).user
  const hash = location.hash.slice(1)
  if (hash) { S.view = hash.split('/')[0]; if (S.view === 'canvas' && hash.split('/')[1]) S.pendingJob = Number(hash.split('/')[1]) }
  render()
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1).split('/')[0]; if (v && v !== S.view) go(v, location.hash.slice(1).split('/')[1]) })
}

function render() {
  stopTimers()
  if (!S.user) return renderAuth()
  if (S.user.status !== 'approved') return renderPending()
  renderShell()
}

function renderAuth(mode = S.health && !S.health.initialized ? 'register' : 'login') {
  const first = S.health && !S.health.initialized
  $('#app').innerHTML = `
  <main class="auth">
    <section class="auth-story">
      <div class="brand"><img src="/static/icon.svg" alt="">Ultralight Project Builder</div>
      <div>
        <h1>Drive SAP PS and FI from a live canvas, with the owner holding the keys.</h1>
        <p class="lead">A browser subagent runs the IT2406 Performance Task 1 pack on SAP WebGUI, streams every frame with a DOM map, and hands control back to you whenever SAP needs a human.</p>
      </div>
      <div class="auth-facts small muted">
        <div><b>M53 / 236</b>SAP system and client</div>
        <div><b>14 tasks</b>Project P/2### end to end</div>
        <div><b>Owner gate</b>No access until approved</div>
      </div>
    </section>
    <section class="auth-form">
      <form id="authForm" novalidate>
        <div class="seg" role="group" aria-label="Choose form">
          <button type="button" data-m="login" aria-pressed="${mode === 'login'}">Sign in</button>
          <button type="button" data-m="register" aria-pressed="${mode === 'register'}">Request access</button>
        </div>
        <h2>${mode === 'login' ? 'Sign in' : first ? 'Create the owner account' : 'Request access'}</h2>
        ${first && mode === 'register' ? '<p class="small muted">No accounts exist yet. The first account becomes the owner who approves everyone else.</p>' : ''}
        ${mode === 'register' ? '<div class="field"><label for="name">Name</label><input class="input" id="name" name="name" autocomplete="name" required></div>' : ''}
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="10" required></div>
        ${mode === 'register' && first && S.health.setupKeyRequired ? '<div class="field"><label for="setupKey">Setup key</label><input class="input" id="setupKey" name="setupKey" type="password" required></div>' : ''}
        ${mode === 'register' && !first ? '<div class="field"><label for="note">Why you need access (optional)</label><input class="input" id="note" name="note" placeholder="Section, SAP user LEARN-###"></div>' : ''}
        <button class="btn primary" type="submit">${mode === 'login' ? 'Sign in' : first ? 'Create owner' : 'Send request'}</button>
      </form>
    </section>
  </main>`
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.m)))
  $('#authForm').addEventListener('submit', run(async (e) => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.target))
    const r = await http(`/auth/${mode}`, { method: 'POST', body })
    S.user = r.user
    S.health = { ...S.health, initialized: true }
    render()
  }))
}

function renderPending() {
  $('#app').innerHTML = `
  <main class="center"><div class="stack" style="max-width:460px">
    <div class="brand" style="justify-content:center"><img src="/static/icon.svg" alt="">Ultralight Project Builder</div>
    <h1>Waiting for the owner</h1>
    <p class="muted">Your request as <b>${esc(S.user.email)}</b> is <span class="pill ${S.user.status === 'pending' ? 'warn' : 'err'}">${esc(S.user.status)}</span>. The owner must approve you and grant a SAP account before the canvas unlocks. This page checks every 15 seconds.</p>
    <div class="row" style="justify-content:center"><button class="btn" id="recheck">Check now</button><button class="btn ghost" id="out">Sign out</button></div>
  </div></main>`
  const check = run(async () => { const r = await http('/auth/me'); S.user = r.user; if (!S.user || S.user.status === 'approved') render() })
  $('#recheck').onclick = check
  $('#out').onclick = logout
  S.timers.push(setInterval(check, 15000))
}

const logout = run(async () => { await http('/auth/logout', { method: 'POST' }); S.user = null; render() })

const NAV = [['launch', 'Run pack'], ['canvas', 'Live canvas'], ['sheet', 'Task sheet'], ['ready', 'Readiness'], ['jobs', 'Runs and evidence'], ['plan', 'Project data'], ['guide', 'Setup guide']]

function navHtml() {
  const items = [...NAV, ...(S.user.role === 'owner' || S.user.role === 'admin' ? [['admin', 'Owner console']] : [])]
  return `<nav class="nav" aria-label="Main">${items.map(([k, l]) => `<button data-v="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${l}${k === 'canvas' && S.job && ['running', 'paused', 'waiting', 'claimed', 'queued'].includes(S.job.status) ? '<span class="pill accent">live</span>' : ''}${k === 'admin' && S.admin && S.admin.users.some((u) => u.status === 'pending') ? `<span class="pill warn">${S.admin.users.filter((u) => u.status === 'pending').length}</span>` : ''}</button>`).join('')}</nav>`
}

function renderShell() {
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="/static/icon.svg" alt="">Ultralight Builder</div>
      ${navHtml()}
      <div class="side-foot">
        <div class="muted">${esc(S.user.name)} <span class="pill">${esc(S.user.role)}</span></div>
        <div class="row"><button class="btn sm" id="theme">Theme</button><button class="btn sm ghost" id="logout">Sign out</button></div>
      </div>
    </aside>
    <header class="topbar"><div class="brand"><img src="/static/icon.svg" alt=""></div>${navHtml()}<button class="btn sm ghost" id="logout2">Sign out</button></header>
    <main class="main" id="view"></main>
  </div>`
  document.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)))
  $('#theme').onclick = toggleTheme
  $('#logout').onclick = logout
  $('#logout2').onclick = logout
  const views = { launch: viewLaunch, canvas: viewCanvas, sheet: viewSheet, ready: viewReady, jobs: viewJobs, plan: viewPlan, guide: viewGuide, admin: viewAdmin }
  ;(views[S.view] || viewLaunch)()
}

function go(view, arg) {
  S.view = view
  if (view === 'canvas' && arg) S.pendingJob = Number(arg)
  const h = arg ? `${view}/${arg}` : view
  if (location.hash.slice(1) !== h) history.replaceState(null, '', `#${h}`)
  render()
}

async function viewLaunch() {
  const v = $('#view')
  v.innerHTML = '<p class="muted">Loading pack</p>'
  const [pack, acc] = await Promise.all([S.pack || http('/pack'), http('/me/accounts')])
  S.pack = pack; S.accounts = acc.accounts; S.runnersOnline = acc.runnersOnline
  if (!S.selAccount && S.accounts[0]) S.selAccount = S.accounts[0].sap_user
  if (!S.selTasks.size) pack.tasks.forEach((t) => S.selTasks.add(t.id))
  const a = S.accounts.find((x) => x.sap_user === S.selAccount)
  v.innerHTML = `
  <div class="head"><div><h1>Run the PS and FI pack</h1><p>Pick an allowlisted SAP account in client ${esc(pack.client)}, choose tasks, then watch and steer on the live canvas. Runs are one at a time per SAP user because WebGUI allows one dialog session per run.</p></div>
  <span class="pill ${S.runnersOnline ? 'ok' : 'err'}">${S.runnersOnline ? `${S.runnersOnline} runner online` : 'No runner online'}</span></div>
  ${S.accounts.length ? '' : `<div class="card" style="margin-bottom:1rem"><h3>No SAP account granted yet</h3><p class="muted small">${S.user.role === 'owner' ? 'Add LEARN-### accounts in the Owner console, then grant them.' : 'Ask the owner to grant you a LEARN-### account.'}</p></div>`}
  <form class="launch" id="launch">
    <section class="card stack">
      <div class="row" style="justify-content:space-between"><h2>Tasks</h2><div class="row"><button type="button" class="btn sm" id="all">All</button><button type="button" class="btn sm" id="none">None</button><button type="button" class="btn sm" id="shots">Screenshot tasks</button></div></div>
      <div class="tasks">${pack.tasks.map((t) => `<label class="task"><input type="checkbox" name="t" value="${t.id}" ${S.selTasks.has(t.id) ? 'checked' : ''}><b>${t.id}. ${esc(t.title)}</b><span>${esc(t.role)} · ${esc(t.area)} · <code>${esc(t.txn)}</code>${t.shot ? ' · screenshot' : ''}</span></label>`).join('')}</div>
    </section>
    <aside class="stack">
      <section class="card stack">
        <h2>Account</h2>
        <div class="field"><label for="acc">SAP user (client 236)</label><select class="input" id="acc">${S.accounts.map((x) => `<option value="${esc(x.sap_user)}" ${x.sap_user === S.selAccount ? 'selected' : ''}>${esc(x.sap_user)}${x.label ? ` · ${esc(x.label)}` : ''}</option>`).join('')}</select></div>
        ${a ? `<dl class="kv"><dt>Project</dt><dd>${esc(a.project)}</dd><dt>Supplier</dt><dd>114${esc(a.suffix)}</dd><dt>PS text</dt><dd>PH-${esc(a.suffix)}-1</dd><dt>Runner</dt><dd>${a.runnerOnline ? '<span class="pill ok">ready</span>' : '<span class="pill err">offline</span>'}</dd></dl>` : ''}
        <div class="field"><label for="pw">SAP password for this run</label><input class="input" id="pw" type="password" autocomplete="off" placeholder="Leave empty if the runner holds it"></div>
        <p class="small muted">Sealed with AES-GCM in D1, handed once to the runner at claim time, then wiped. Passwords may differ per account.</p>
      </section>
      <section class="card stack">
        <h2>Mode</h2>
        <div class="modes">
          ${[['assist', 'Assist', 'Automation runs, pauses on manual steps and failures, you finish on the canvas.'], ['auto', 'Autopilot', 'Only stops on errors. Manual steps still wait for you.'], ['observe', 'Observe', 'Login and read-back only. Canvas input is blocked.'], ['validate', 'Validate', 'Read-only. Checks in SAP whether each selected task is already done and reports pass or fail per task.']].map(([k, l, d]) => `<label class="mode"><input type="radio" name="mode" value="${k}" ${S.mode === k ? 'checked' : ''}><b>${l}</b><span class="small muted">${d}</span></label>`).join('')}
        </div>
        <button class="btn primary" type="submit" ${S.accounts.length ? '' : 'disabled'}>Start run</button>
      </section>
    </aside>
  </form>`
  const sync = () => { S.selTasks = new Set([...document.querySelectorAll('input[name=t]:checked')].map((i) => Number(i.value))) }
  document.querySelectorAll('input[name=t]').forEach((i) => i.addEventListener('change', sync))
  $('#all').onclick = () => { pack.tasks.forEach((t) => S.selTasks.add(t.id)); viewLaunch() }
  $('#none').onclick = () => { S.selTasks.clear(); viewLaunch() }
  $('#shots').onclick = () => { S.selTasks = new Set(pack.tasks.filter((t) => t.shot).map((t) => t.id)); viewLaunch() }
  $('#acc')?.addEventListener('change', (e) => { S.selAccount = e.target.value; viewLaunch() })
  document.querySelectorAll('input[name=mode]').forEach((i) => i.addEventListener('change', () => { S.mode = i.value }))
  $('#launch').addEventListener('submit', run(async (e) => {
    e.preventDefault()
    sync()
    if (!S.selTasks.size) throw new Error('Pick at least one task')
    const r = await http('/jobs', { method: 'POST', body: { sapUser: S.selAccount, tasks: [...S.selTasks].sort((a, b) => a - b), mode: S.mode, password: $('#pw').value || undefined } }).catch((err) => { if (err.data?.jobId) { go('canvas', err.data.jobId); return null } throw err })
    if (r) { toast(r.warning || `Run #${r.id} queued`, !!r.warning); go('canvas', r.id) }
  }))
}

async function loadJob(id) {
  const r = await http(`/jobs/${id}?after=${S.job && S.job.id === id ? S.lastEvent : 0}`)
  if (!S.job || S.job.id !== id) { S.events = []; S.plan = await http(`/jobs/${id}/plan`); S.frame = null; S.frameSeq = -1 }
  S.job = r.job
  S.events.push(...r.events)
  if (r.events.length) S.lastEvent = r.events[r.events.length - 1].id
  S.evidence = r.evidence
}

async function viewCanvas() {
  const v = $('#view')
  if (!S.pendingJob && !S.job) {
    const r = await http('/jobs')
    const live = r.jobs.find((x) => ['running', 'paused', 'waiting', 'claimed', 'queued'].includes(x.status)) || r.jobs[0]
    if (!live) { v.innerHTML = '<div class="center"><div class="stack"><h1>No runs yet</h1><p class="muted">Start a run to open the live canvas.</p><div><button class="btn primary" id="toLaunch">Run pack</button></div></div></div>'; $('#toLaunch').onclick = () => go('launch'); return }
    S.pendingJob = live.id
  }
  const id = S.pendingJob || S.job.id
  S.pendingJob = null
  S.lastEvent = S.job && S.job.id === id ? S.lastEvent : 0
  await loadJob(id)
  if (location.hash.slice(1) !== `canvas/${id}`) history.replaceState(null, '', `#canvas/${id}`)
  v.innerHTML = `
  <div class="head"><div><h1>Run #${id} · ${esc(S.job.sap_user)}</h1><p id="jobline"></p></div><div class="row" id="jobactions"></div></div>
  <div class="canvas-wrap">
    <section>
      <div class="viewport" id="vp" tabindex="0" aria-label="Live SAP canvas. Click to interact, type while focused.">
        <div class="empty" id="vpEmpty">Waiting for the runner to stream the first frame.</div>
        <img id="vpImg" alt="Live SAP WebGUI frame" hidden>
        <div class="overlay" id="ov"></div>
        <div class="hud"><span id="hudL"></span><span id="hudR"></span></div>
      </div>
      <div class="controls" id="ctl">
        <button class="btn sm" data-c="pause">Pause</button>
        <button class="btn sm" data-c="resume">Resume</button>
        <button class="btn sm" data-c="step">Step once</button>
        <button class="btn sm" data-c="retry">Retry step</button>
        <button class="btn sm" data-c="skip">Skip step</button>
        <button class="btn sm" data-c="capture">Capture evidence</button>
        <button class="btn sm" id="ovBtn" aria-pressed="${S.overlay}">DOM map</button>
        <button class="btn sm" id="sheetBtn" aria-expanded="false" aria-controls="drawer">Task sheet</button>
        <button class="btn sm danger" data-c="abort">Abort</button>
      </div>
      <form class="typebar" id="typebar">
        <input class="input" id="typeIn" placeholder="Type into the focused SAP field, Enter sends" autocomplete="off">
        <button class="btn sm" type="submit">Send</button>
        <select class="input" id="keySel" style="max-width:9rem" aria-label="Special key"><option value="">Key</option>${['Enter', 'Tab', 'Shift+Tab', 'Escape', 'F4', 'F8', 'Control+S', 'F3', 'Backspace', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].map((k) => `<option>${k}</option>`).join('')}</select>
      </form>
      <p class="small muted" style="margin-top:.5rem">Click the canvas to focus it, then type directly. Hover shows the SAP field title from the DOM capture. Double-click to open rows.</p>
    </section>
    <aside class="panel">
      <div id="prompt"></div>
      <div class="card stack"><div class="row" style="justify-content:space-between"><h3>Steps</h3><span class="small muted" id="stepCount"></span></div><div class="progress"><i id="bar"></i></div><div class="steps" id="steps"></div></div>
      <div class="card stack"><h3>Activity log</h3><div class="log" id="log"></div></div>
    </aside>
  </div>`
  v.insertAdjacentHTML('beforeend', '<aside class="drawer" id="drawer" hidden aria-label="Task sheet for the current task"></aside>')
  wireCanvas()
  $('#sheetBtn').onclick = run(async () => { const d = $('#drawer'); const open = d.hidden; d.hidden = !open; $('#sheetBtn').setAttribute('aria-expanded', String(open)); if (open) await paintDrawer() })
  paintJob()
  pollFrame()
  S.timers.push(setInterval(run(async () => { if (!S.job) return; const was = S.job.status; await loadJob(S.job.id); paintJob(); if (was !== S.job.status && ['done', 'failed', 'aborted'].includes(S.job.status)) toast(`Run ${S.job.status}`) }), 1500))
  S.timers.push(setInterval(pollFrame, 700))
}

const send = run(async (cmd) => { if (!S.job) return; await http(`/jobs/${S.job.id}/commands`, { method: 'POST', body: cmd }) })

function wireCanvas() {
  const vp = $('#vp'), img = $('#vpImg')
  const toPage = (e) => {
    if (!S.frame) return null
    const r = img.getBoundingClientRect()
    const scale = Math.min(r.width / S.frame.width, r.height / S.frame.height)
    const ox = (r.width - S.frame.width * scale) / 2, oy = (r.height - S.frame.height * scale) / 2
    const x = (e.clientX - r.left - ox) / scale, y = (e.clientY - r.top - oy) / scale
    if (x < 0 || y < 0 || x > S.frame.width || y > S.frame.height) return null
    return { x: Math.round(x), y: Math.round(y) }
  }
  vp.addEventListener('click', (e) => { vp.focus(); const p = toPage(e); if (p && S.job?.mode !== 'observe') send({ type: 'click', ...p }) })
  vp.addEventListener('dblclick', (e) => { const p = toPage(e); if (p && S.job?.mode !== 'observe') send({ type: 'dblclick', ...p }) })
  vp.addEventListener('wheel', (e) => { if (!S.frame || S.job?.mode === 'observe') return; e.preventDefault(); const p = toPage(e) || { x: S.frame.width / 2, y: S.frame.height / 2 }; send({ type: 'scroll', ...p, dy: Math.sign(e.deltaY) * 300 }) }, { passive: false })
  vp.addEventListener('mousemove', (e) => {
    const p = toPage(e)
    const boxes = S.frame?.dom?.els || []
    const hit = p && boxes.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
    const key = hit ? hit.i : null
    if (key === S.hot) return
    S.hot = key
    document.querySelectorAll('.box.hot').forEach((b) => b.classList.remove('hot'))
    if (hit) { $(`.box[data-i="${hit.i}"]`)?.classList.add('hot'); $('#hudR').textContent = `${hit.t || hit.k}${hit.v ? ` = ${hit.v}` : ''}` } else $('#hudR').textContent = S.frame?.statusbar || ''
  })
  vp.addEventListener('focus', () => vp.classList.add('focus'))
  vp.addEventListener('blur', () => { vp.classList.remove('focus'); flushType() })
  vp.addEventListener('keydown', (e) => {
    if (S.job?.mode === 'observe') return
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); S.typeBuf += e.key; clearTimeout(S.typeT); S.typeT = setTimeout(flushType, 250); return }
    const map = { Enter: 'Enter', Tab: e.shiftKey ? 'Shift+Tab' : 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', ArrowDown: 'ArrowDown', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', PageDown: 'PageDown', PageUp: 'PageUp', Home: 'Home', End: 'End' }
    let k = map[e.key] || (/^F\d{1,2}$/.test(e.key) ? e.key : null)
    if ((e.ctrlKey || e.metaKey) && /^[a-z]$/i.test(e.key)) k = `Control+${e.key.toUpperCase()}`
    if (!k) return
    e.preventDefault()
    flushType()
    send({ type: 'key', key: k })
  })
  $('#typebar').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#typeIn').value; if (t) send([{ type: 'type', text: t }, { type: 'key', key: 'Enter' }]); $('#typeIn').value = '' })
  $('#keySel').addEventListener('change', (e) => { if (e.target.value) send({ type: 'key', key: e.target.value }); e.target.value = '' })
  document.querySelectorAll('#ctl [data-c]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.c === 'abort' && !confirm('Abort this run? SAP keeps whatever was already saved.')) return; send({ type: b.dataset.c }); toast(`${b.textContent} sent`) }))
  $('#ovBtn').onclick = () => { S.overlay = !S.overlay; $('#ovBtn').setAttribute('aria-pressed', S.overlay); $('#ov').classList.toggle('show', S.overlay) }
}

function flushType() { if (S.typeBuf) { send({ type: 'type', text: S.typeBuf }); S.typeBuf = '' } }

const pollFrame = run(async () => {
  if (!S.job || !$('#vp')) return
  const f = await http(`/jobs/${S.job.id}/frame?since=${S.frameSeq}`)
  if (!f) return
  S.frame = f; S.frameSeq = f.seq
  const img = $('#vpImg')
  img.src = `data:image/jpeg;base64,${f.image}`
  img.hidden = false
  $('#vpEmpty').hidden = true
  $('#vp').classList.toggle('live', S.job.mode !== 'observe')
  $('#hudL').textContent = `${f.title || 'SAP'} · ${ago(f.updated_at)}`
  $('#hudR').textContent = f.statusbar || ''
  paintOverlay()
})

function paintOverlay() {
  const ov = $('#ov'), img = $('#vpImg')
  if (!ov || !S.frame) return
  ov.classList.toggle('show', S.overlay)
  const r = img.getBoundingClientRect()
  const scale = Math.min(r.width / S.frame.width, r.height / S.frame.height)
  const ox = (r.width - S.frame.width * scale) / 2, oy = (r.height - S.frame.height * scale) / 2
  const target = S.frame.dom?.target
  ov.innerHTML = (S.frame.dom?.els || []).map((b) => `<div class="box ${b.k === 'button' || b.k === 'tab' ? 'button' : 'input'}${target === b.id ? ' target' : ''}" data-i="${b.i}" style="left:${ox + b.x * scale}px;top:${oy + b.y * scale}px;width:${b.w * scale}px;height:${b.h * scale}px"></div>`).join('')
}
window.addEventListener('resize', () => paintOverlay())

function paintJob() {
  const j = S.job
  if (!j || !$('#jobline')) return
  const cls = { done: 'ok', failed: 'err', aborted: 'err', running: 'accent', paused: 'warn', waiting: 'warn', queued: '', claimed: 'accent' }[j.status] || ''
  $('#jobline').innerHTML = `<span class="pill ${cls}">${esc(j.status)}</span> ${esc(j.mode)} mode · tasks ${j.tasks.join(', ')} · started ${esc(fmtTime(j.started_at || j.created_at))}`
  $('#jobactions').innerHTML = `<button class="btn sm" id="toEv">Evidence (${S.evidence.length})</button>${['done', 'failed', 'aborted'].includes(j.status) ? '<button class="btn sm primary" id="again">Run again</button>' : ''}`
  $('#toEv').onclick = () => go('jobs', j.id)
  if ($('#again')) $('#again').onclick = () => { S.selAccount = j.sap_user; S.selTasks = new Set(j.tasks); S.mode = j.mode; go('launch') }
  const steps = S.plan?.steps || []
  const status = {}
  for (const e of S.events) if (e.step_key) status[e.step_key] = e.level
  $('#stepCount').textContent = `${Math.min(j.step_idx, steps.length)} of ${steps.length}`
  $('#bar').style.width = `${steps.length ? (Math.min(j.step_idx, steps.length) / steps.length) * 100 : 0}%`
  const stepsEl = $('#steps')
  stepsEl.innerHTML = steps.map((s, i) => { const st = status[s.key]; const c = i === j.step_idx && !['done', 'failed', 'aborted'].includes(j.status) ? 'cur' : st === 'ok' ? 'ok' : st === 'error' ? 'err' : st === 'warn' ? 'warn' : ''; return `<div class="step ${c}" data-i="${i}"><span class="k">${s.key}</span><span>${esc(s.label || s.op)}</span><span class="s small">${st === 'ok' ? 'done' : st === 'error' ? 'failed' : st === 'warn' ? 'check' : s.op === 'manual' ? 'you' : ''}</span></div>` }).join('')
  stepsEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest' })
  const log = $('#log')
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30
  log.innerHTML = S.events.filter((e) => e.level !== 'dom').slice(-200).map((e) => `<div class="${e.level}"><time>${clock(e.created_at)}</time><span>${e.step_key ? `[${esc(e.step_key)}] ` : ''}${esc(e.message)}</span></div>`).join('')
  if (atBottom) log.scrollTop = log.scrollHeight
  const p = j.prompt
  $('#prompt').innerHTML = p && ['paused', 'waiting'].includes(j.status) ? `
    <div class="prompt" role="alert">
      <div class="row" style="justify-content:space-between"><h3>${esc(p.title || 'Your turn')}</h3><span class="pill warn">${esc(p.stepKey || '')}</span></div>
      <p class="small">${esc(p.instruction || p.reason || '')}</p>
      ${p.values ? `<dl>${Object.entries(p.values).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd><button class="btn sm" data-copy="${esc(val)}" type="button">Copy</button>`).join('')}</dl>` : ''}
      ${p.error ? `<p class="small" style="color:var(--err)">${esc(p.error)}</p>` : ''}
      <div class="row"><button class="btn primary sm" id="pContinue">Done, continue</button><button class="btn sm" id="pRetry">Retry automation</button><button class="btn sm" id="pSkip">Skip</button></div>
    </div>` : ''
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => { navigator.clipboard?.writeText(b.dataset.copy); send({ type: 'type', text: b.dataset.copy }); toast('Typed into the focused SAP field') }))
  if ($('#pContinue')) { $('#pContinue').onclick = () => send({ type: 'continue' }); $('#pRetry').onclick = () => send({ type: 'retry' }); $('#pSkip').onclick = () => send({ type: 'skip' }) }
}

async function viewJobs() {
  const v = $('#view')
  const all = S.user.role !== 'user' && S.jobsAll
  const r = await http(`/jobs${all ? '?all=1' : ''}`)
  S.jobs = r.jobs
  const focus = Number(location.hash.split('/')[1]) || S.jobs[0]?.id
  let detail = null
  if (focus) detail = await http(`/jobs/${focus}`).catch(() => null)
  v.innerHTML = `
  <div class="head"><div><h1>Runs and evidence</h1><p>Every screenshot and DOM capture a run produced, labelled by task and transaction. Download them for the Word deliverable.</p></div>${S.user.role !== 'user' ? `<label class="row small"><input type="checkbox" id="allJobs" ${all ? 'checked' : ''}> Show all users</label>` : ''}</div>
  <div class="grid3">
    <section class="card scroll" style="grid-column:span 1">
      <table class="t"><thead><tr><th>#</th><th>Account</th><th>Status</th><th>When</th></tr></thead><tbody>
      ${S.jobs.map((j) => `<tr><td><button class="btn sm ghost" data-j="${j.id}">${j.id}</button></td><td>${esc(j.sap_user)}${all ? `<div class="small muted">${esc(j.email)}</div>` : ''}</td><td><span class="pill ${j.status === 'done' ? 'ok' : ['failed', 'aborted'].includes(j.status) ? 'err' : 'accent'}">${esc(j.status)}</span></td><td class="small muted">${esc(ago(j.created_at))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No runs yet</td></tr>'}
      </tbody></table>
    </section>
    <section class="stack" style="grid-column:span 2">
      ${detail ? `
      <div class="card row" style="justify-content:space-between"><div><h2>Run #${detail.job.id} · ${esc(detail.job.sap_user)}</h2><p class="small muted">Tasks ${detail.job.tasks.join(', ')} · ${esc(detail.job.mode)} · ${esc(fmtTime(detail.job.created_at))}${detail.job.result ? ` · ${esc(detail.job.result.summary || '')}` : ''}</p></div><button class="btn sm" id="openCanvas">Open canvas</button></div>
      <div class="gallery">${detail.evidence.filter((e) => e.kind === 'screenshot').map((e) => `<figure><a href="/api/jobs/${detail.job.id}/evidence/${e.id}" target="_blank" rel="noopener"><img loading="lazy" src="/api/jobs/${detail.job.id}/evidence/${e.id}" alt="${esc(e.caption || e.name)}"></a><figcaption><b>${e.task ? `Task ${e.task}` : 'Manual capture'}</b><span class="muted">${esc(e.caption || e.name)}</span><a class="small" href="/api/jobs/${detail.job.id}/evidence/${e.id}?dl=1">Download</a></figcaption></figure>`).join('') || '<p class="muted">No screenshots in this run.</p>'}</div>
      ${detail.evidence.some((e) => e.kind === 'dom') ? `<div class="card"><h3>DOM captures</h3><ul class="small">${detail.evidence.filter((e) => e.kind === 'dom').map((e) => `<li><a href="/api/jobs/${detail.job.id}/evidence/${e.id}">${esc(e.name)}</a> <span class="muted">${esc(e.caption || '')}</span></li>`).join('')}</ul></div>` : ''}
      <div class="card"><h3>Verified results</h3>${verifiedTable(detail.events)}</div>` : '<div class="card muted">Pick a run.</div>'}
    </section>
  </div>`
  document.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => { history.replaceState(null, '', `#jobs/${b.dataset.j}`); viewJobs() }))
  $('#allJobs')?.addEventListener('change', (e) => { S.jobsAll = e.target.checked; viewJobs() })
  $('#openCanvas')?.addEventListener('click', () => go('canvas', detail.job.id))
}

function verifiedTable(events) {
  const rows = events.filter((e) => e.level === 'ok' || e.level === 'error' || e.level === 'warn')
  if (!rows.length) return '<p class="small muted">No step results yet.</p>'
  return `<div class="scroll"><table class="t"><thead><tr><th>Step</th><th>Result</th><th>Read-back</th></tr></thead><tbody>${rows.slice(-120).map((e) => `<tr><td class="mono">${esc(e.step_key || '')}</td><td><span class="pill ${e.level === 'ok' ? 'ok' : e.level === 'error' ? 'err' : 'warn'}">${e.level === 'ok' ? 'verified' : e.level === 'error' ? 'failed' : 'unconfirmed'}</span> ${esc(e.message)}</td><td class="small mono">${esc(e.data?.statusbar || e.data?.readback || '')}</td></tr>`).join('')}</tbody></table></div>`
}

function cpm(acts, rels) {
  const ids = acts.map((a) => a.act)
  const dur = Object.fromEntries(acts.map((a) => [a.act, Number(a.dur) || 0]))
  const pred = Object.fromEntries(ids.map((i) => [i, []])), succ = Object.fromEntries(ids.map((i) => [i, []]))
  rels.forEach((r) => { if (pred[r.to] && succ[r.from]) { pred[r.to].push(r.from); succ[r.from].push(r.to) } })
  const order = [], seen = new Set()
  const visit = (n) => { if (seen.has(n)) return; seen.add(n); pred[n].forEach(visit); order.push(n) }
  ids.forEach(visit)
  const es = {}, ef = {}
  order.forEach((n) => { es[n] = Math.max(0, ...pred[n].map((p) => ef[p])); ef[n] = es[n] + dur[n] })
  const end = Math.max(...ids.map((n) => ef[n]))
  const lf = {}, ls = {}
  ;[...order].reverse().forEach((n) => { lf[n] = succ[n].length ? Math.min(...succ[n].map((s) => ls[s])) : end; ls[n] = lf[n] - dur[n] })
  const level = {}
  order.forEach((n) => { level[n] = pred[n].length ? Math.max(...pred[n].map((p) => level[p])) + 1 : 0 })
  return { es, ef, ls, lf, end, level, crit: new Set(ids.filter((n) => ls[n] - es[n] === 0)) }
}

async function viewPlan() {
  const v = $('#view')
  if (!S.accounts.length) { const acc = await http('/me/accounts'); S.accounts = acc.accounts }
  const sap = S.selAccount || S.accounts[0]?.sap_user || 'LEARN-000'
  const plan = await http(`/me/plan/${encodeURIComponent(sap)}`)
  const d = plan.data
  const acts = [...d.activities, { act: '0045', desc: d.external.desc, dur: '0', work: '', wc: 'external', wbs: `${d.project}-1` }, { act: '0135', desc: d.primCost.desc, dur: '0', work: '', wc: 'primary cost', wbs: `${d.project}-5` }]
  const c = cpm(acts, d.relationships)
  const cols = {}
  acts.forEach((a) => { (cols[c.level[a.act]] = cols[c.level[a.act]] || []).push(a.act) })
  const W = 118, H = 44, GX = 44, GY = 18
  const maxRows = Math.max(...Object.values(cols).map((x) => x.length))
  const pos = {}
  Object.entries(cols).forEach(([lv, list]) => list.sort().forEach((id, i) => { pos[id] = { x: 10 + Number(lv) * (W + GX), y: 10 + (i + (maxRows - list.length) / 2) * (H + GY) } }))
  const svgW = 20 + Object.keys(cols).length * (W + GX), svgH = 20 + maxRows * (H + GY)
  const desc = Object.fromEntries(acts.map((a) => [a.act, a.desc]))
  const svg = `<svg class="net" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Network plan with critical path"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="currentColor" stroke="none"/></marker></defs>${d.relationships.map((r) => { const a = pos[r.from], b = pos[r.to]; if (!a || !b) return ''; const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2; const crit = c.crit.has(r.from) && c.crit.has(r.to) && c.ef[r.from] === c.es[r.to]; return `<path class="${crit ? 'crit' : ''}" style="color:var(${crit ? '--accent' : '--muted'})" marker-end="url(#ar)" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2 - 2} ${y2}"/>` }).join('')}${acts.map((a) => { const p = pos[a.act]; return `<g class="node${c.crit.has(a.act) && Number(a.dur) > 0 ? ' crit' : ''}"><title>${esc(a.act)} ${esc(a.desc)}, ES ${c.es[a.act]} EF ${c.ef[a.act]}</title><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="8"/><text x="${p.x + 10}" y="${p.y + 18}">${a.act}${Number(a.dur) ? ` · ${a.dur}d` : ''}</text><text class="d" x="${p.x + 10}" y="${p.y + 34}">${esc(desc[a.act].slice(0, 20))}${desc[a.act].length > 20 ? '…' : ''}</text></g>` }).join('')}</svg>`
  v.innerHTML = `
  <div class="head"><div><h1>Project data for ${esc(d.project)}</h1><p>Every value the pack types, generated from the task sheet with suffix ${esc(d.suffix)}. The network is computed from the 22 relationships with finish-to-start logic and normal durations.</p></div>
  <select class="input" id="planAcc" style="max-width:14rem" aria-label="Account">${S.accounts.map((x) => `<option ${x.sap_user === sap ? 'selected' : ''}>${esc(x.sap_user)}</option>`).join('')}</select></div>
  <section class="card stack" style="margin-bottom:1rem">
    <div class="row" style="justify-content:space-between"><h2>Network plan</h2><span class="small muted">Zero-float activities ${[...c.crit].filter((n) => Number(acts.find((a) => a.act === n).dur) > 0).sort().join(', ')} · project length ${c.end} working days</span></div>
    <div class="scroll">${svg}</div>
    <p class="small muted">0045 and 0135 carry no normal duration in the task sheet, so they show as zero-length here. In SAP, 0135 becomes flexible in Task 10 and stretches to match 0130.</p>
  </section>
  <div class="grid2">
    <section class="card scroll"><h2>WBS and responsibilities</h2><table class="t"><thead><tr><th>Lvl</th><th>WBS</th><th>Description</th><th>Resp. cost centre</th></tr></thead><tbody>${d.wbs.map((w) => `<tr><td>${w.level}</td><td class="mono">${esc(w.wbs)}</td><td>${esc(w.desc)}</td><td class="mono">${w.costCenter}</td></tr>`).join('')}</tbody></table></section>
    <section class="card"><h2>Key values</h2><dl class="kv" style="margin-top:.6rem"><dt>Project</dt><dd>${esc(d.project)}</dd><dt>Text</dt><dd>${esc(d.projectText)}</dd><dt>Profile</dt><dd>${d.profile}</dd><dt>CO area / CoCd</dt><dd>${d.controllingArea} / ${d.companyCode}</dd><dt>External 0045</dt><dd>2,000 + 3,000 EUR</dd><dt>Primary 0135</dt><dd>10,000 → 8,000 EUR, 6300000</dd><dt>PS text</dt><dd>${esc(d.psText)}, ST 01, DE</dd><dt>Confirmation</dt><dd>0010: 35 h, remaining 45 h</dd><dt>Invoice</dt><dd>${esc(d.supplier)}, 9,700 EUR, A0</dd><dt>Expected actuals</dt><dd>1,750 → 11,450 EUR</dd></dl></section>
  </div>
  <section class="card scroll" style="margin-top:1rem"><h2>Activities</h2><table class="t"><thead><tr><th>Act</th><th>Description</th><th>Days</th><th>Work h</th><th>Work centre</th><th>WBS</th><th>ES</th><th>EF</th><th>Float</th></tr></thead><tbody>${acts.map((a) => `<tr><td class="mono">${a.act}</td><td>${esc(a.desc)}</td><td>${a.dur}</td><td>${a.work}</td><td class="mono">${esc(a.wc)}</td><td class="mono">${esc(a.wbs)}</td><td>${c.es[a.act]}</td><td>${c.ef[a.act]}</td><td>${c.ls[a.act] - c.es[a.act]}</td></tr>`).join('')}</tbody></table></section>
  <div class="grid2" style="margin-top:1rem">
    <section class="card"><h2>Milestones</h2><table class="t"><tbody>${d.milestones.map((m) => `<tr><td class="mono">${m.usage}</td><td>${esc(m.desc)}</td><td class="mono">${m.act}</td></tr>`).join('')}</tbody></table></section>
    <section class="card"><h2>Cost bridge</h2><p class="small muted" style="margin:.4rem 0">Actual cost figures quoted by the task sheet. Labour rate follows from 1,750 EUR over 35 h.</p><table class="t"><tbody><tr><td>Confirmation 0010</td><td class="mono">35 h × 50 EUR</td><td class="mono">1,750.00</td></tr><tr><td>Invoice 0135</td><td class="mono">${esc(d.supplier)}</td><td class="mono">9,700.00</td></tr><tr><td><b>Actual after Task 13</b></td><td></td><td class="mono"><b>11,450.00</b></td></tr></tbody></table></section>
  </div>`
  $('#planAcc')?.addEventListener('change', (e) => { S.selAccount = e.target.value; viewPlan() })
}

// ---------- Task sheet: every value per task, how to check it, print to PDF, optional uploaded PDF ----------
const sheetCache = {}
async function loadSheet(sap) { return (sheetCache[sap] = sheetCache[sap] || await http(`/me/sheet/${encodeURIComponent(sap)}`)) }

const valuesHtml = (v) => {
  if (!v) return ''
  if (v.rows) return `<ol class="vals rows">${v.rows.map((r) => `<li class="mono">${esc(r)}</li>`).join('')}</ol>`
  return `<dl class="vals">${Object.entries(v).map(([k, x]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(x)}</dd>`).join('')}</dl>`
}

const taskCard = (t, status, docLink) => `
  <article class="card sheet-task" id="task-${t.id}">
    <header class="row" style="justify-content:space-between">
      <h2>${t.id}. ${esc(t.title)}</h2>
      <div class="row small">${status || ''}<span class="pill">${esc(t.role)}</span><code>${esc(t.txn)}</code>${t.shot ? '<span class="pill accent">screenshot</span>' : ''}${docLink || ''}</div>
    </header>
    <p class="check-how"><b>How to check it yourself:</b> ${esc(t.how)}</p>
    <ol class="sheet-steps">${t.steps.map((s) => `<li><span class="k mono">${esc(s.key)}</span><div><div>${esc(s.label)}${s.op === 'manual' ? ' <span class="pill warn">you</span>' : ''}</div>${s.instruction ? `<p class="small muted">${esc(s.instruction)}</p>` : ''}${valuesHtml(s.values)}</div></li>`).join('')}</ol>
  </article>`

const valPill = (v) => !v ? '<span class="pill">not checked</span>' : v.level === 'ok' ? '<span class="pill ok">done in SAP</span>' : v.level === 'warn' ? '<span class="pill warn">check evidence</span>' : '<span class="pill err">not done</span>'

async function viewSheet() {
  const v = $('#view')
  v.innerHTML = '<p class="muted">Loading task sheet</p>'
  if (!S.accounts.length) { const acc = await http('/me/accounts'); S.accounts = acc.accounts }
  const sap = S.selAccount || S.accounts[0]?.sap_user || 'LEARN-000'
  const [sheet, docs, ready] = await Promise.all([loadSheet(sap), http('/me/docs'), http('/me/readiness').catch(() => null)])
  const doc = docs.docs[0]
  const val = ready?.accounts.find((a) => a.sapUser === sap)?.validation
  const focus = Number(location.hash.split('/')[1]) || 0
  const d = sheet.data
  v.innerHTML = `
  <div class="head no-print"><div><h1>Task sheet for ${esc(sheet.project)}</h1><p>Every value the pack types for ${esc(sheet.sapUser)}, task by task, with what a correct result looks like in SAP. Print it or save it as a PDF to keep beside SAP, or check your own work against it.</p></div>
    <div class="row">
      <select class="input" id="sheetAcc" style="max-width:12rem" aria-label="SAP account">${S.accounts.map((x) => `<option ${x.sap_user === sap ? 'selected' : ''}>${esc(x.sap_user)}</option>`).join('')}</select>
      <button class="btn primary" id="printSheet">Print / Save as PDF</button>
    </div></div>
  <div class="sheet-layout">
    <nav class="card sheet-toc no-print" aria-label="Tasks">
      <h3>Tasks</h3>
      <ol>${sheet.tasks.map((t) => `<li><a href="#sheet/${t.id}" data-jump="${t.id}">${esc(t.title)}</a>${val ? ` ${valPill(val.tasks[t.id])}` : ''}</li>`).join('')}</ol>
      ${val ? `<p class="small muted">Status from validate run #${val.jobId}, ${esc(ago(val.at))}. <a href="#ready">Readiness</a></p>` : '<p class="small muted">Start a run in <b>Validate</b> mode to see which tasks are already done in SAP.</p>'}
      ${doc ? `<p class="small"><a href="#" id="openDoc">Open ${esc(doc.name)}</a></p>` : S.user.role !== 'user' ? '<p class="small muted">Upload the official task PDF in the Owner console to link its pages here.</p>' : ''}
    </nav>
    <div class="stack sheet-body">
      <section class="card print-only"><h1>IT2406 Performance Task 1 · ${esc(sheet.sapUser)} · ${esc(sheet.project)}</h1><p>Generated ${esc(new Date().toLocaleString())} from the Ultralight Project Builder pack.</p></section>
      <section class="card"><h2>Key values</h2><dl class="kv" style="margin-top:.6rem">
        <dt>Project</dt><dd class="mono">${esc(d.project)} · ${esc(d.projectText)}</dd><dt>Profile</dt><dd class="mono">${esc(d.profile)}</dd>
        <dt>CO area / company code</dt><dd class="mono">${esc(d.controllingArea)} / ${esc(d.companyCode)}</dd><dt>Supplier</dt><dd class="mono">${esc(d.supplier)}</dd>
        <dt>PS text</dt><dd class="mono">${esc(d.psText)}</dd><dt>Expected actual costs</dt><dd class="mono">1,750.00 after Task 11 · 11,450.00 after Task 13</dd></dl></section>
      ${sheet.tasks.map((t) => taskCard(t, val ? valPill(val.tasks[t.id]) : '', doc?.task_pages?.[t.id] ? `<a class="btn sm no-print" href="#" data-docpage="${doc.task_pages[t.id]}">PDF p.${doc.task_pages[t.id]}</a>` : '')).join('')}
    </div>
  </div>
  <div class="pdfview" id="pdfview" hidden><div class="pdfbar"><b id="pdfname"></b><button class="btn sm" id="pdfclose">Close</button></div><iframe id="pdfframe" title="Task PDF"></iframe></div>`
  $('#sheetAcc').onchange = (e) => { S.selAccount = e.target.value; viewSheet() }
  $('#printSheet').onclick = () => window.print()
  document.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', `#sheet/${a.dataset.jump}`); $(`#task-${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }))
  const openDoc = run(async (page) => { await showPdf(doc, page) })
  $('#openDoc')?.addEventListener('click', (e) => { e.preventDefault(); openDoc(1) })
  document.querySelectorAll('[data-docpage]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openDoc(Number(b.dataset.docpage)) }))
  $('#pdfclose').onclick = () => { $('#pdfview').hidden = true }
  if (focus) requestAnimationFrame(() => $(`#task-${focus}`)?.scrollIntoView({ block: 'start' }))
}

// Reassembles the uploaded PDF from its chunks into a blob URL, cached for the session.
const pdfUrls = {}
async function pdfUrl(doc) {
  if (pdfUrls[doc.id]) return pdfUrls[doc.id]
  const parts = []
  for (let i = 0; i < doc.chunks; i++) { const r = await fetch(`/api/me/docs/${doc.id}/${i}`, { credentials: 'same-origin' }); if (!r.ok) throw new Error('Could not load the PDF'); parts.push(await r.text()) }
  const bin = atob(parts.join(''))
  const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return (pdfUrls[doc.id] = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })))
}
async function showPdf(doc, page = 1) {
  toast('Loading PDF')
  const u = await pdfUrl(doc)
  $('#pdfname').textContent = `${doc.name} · page ${page}`
  $('#pdfframe').src = `${u}#page=${page}`
  $('#pdfview').hidden = false
}

// Canvas side drawer: the sheet entry for the task the run is on.
async function paintDrawer() {
  const d = $('#drawer')
  if (!d || d.hidden || !S.job) return
  const sheet = await loadSheet(S.job.sap_user)
  const steps = S.plan?.steps || []
  const cur = steps[Math.min(S.job.step_idx, Math.max(steps.length - 1, 0))]
  const tid = S.drawerTask || cur?.task || S.job.tasks[0]
  const t = sheet.tasks.find((x) => x.id === tid) || sheet.tasks[0]
  d.innerHTML = `<div class="row" style="justify-content:space-between"><h3>Task sheet</h3><button class="btn sm ghost" id="drClose">Close</button></div>
    <select class="input" id="drTask" aria-label="Task">${sheet.tasks.map((x) => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${x.id}. ${esc(x.title)}${cur?.task === x.id ? ' (current)' : ''}</option>`).join('')}</select>
    ${taskCard(t, '', '')}
    <a class="btn sm" href="#sheet/${t.id}">Open full sheet</a>`
  $('#drClose').onclick = () => { d.hidden = true; $('#sheetBtn').setAttribute('aria-expanded', 'false') }
  $('#drTask').onchange = run(async (e) => { S.drawerTask = Number(e.target.value); await paintDrawer() })
}

// ---------- Readiness: is everything set up for a run to succeed? ----------
async function viewReady() {
  const v = $('#view')
  v.innerHTML = '<p class="muted">Checking</p>'
  const [r, pack] = await Promise.all([http('/me/readiness'), S.pack || http('/pack').catch(() => null)])
  S.pack = pack
  const onlineRunners = r.runners.filter((x) => x.online)
  const owner = S.user.role !== 'user'
  const item = (ok, title, detail, fix) => `<li class="ready-item ${ok === true ? 'ok' : ok === false ? 'err' : 'warn'}"><span class="dot" aria-hidden="true"></span><div><b>${esc(title)}</b><div class="small muted">${detail}</div>${ok !== true && fix ? `<div class="small fix">${fix}</div>` : ''}</div><span class="pill ${ok === true ? 'ok' : ok === false ? 'err' : 'warn'}">${ok === true ? 'ready' : ok === false ? 'fix' : 'check'}</span></li>`
  const runnerCards = r.runners.map((x) => {
    const i = x.info || {}
    const ver = x.version || i.version || 'unknown'
    return `<section class="card stack"><div class="row" style="justify-content:space-between"><h2>${esc(x.name)}</h2>${x.online ? '<span class="pill ok">online</span>' : `<span class="pill err">offline · seen ${esc(ago(x.lastSeen))}</span>`}</div><ul class="ready">
      ${item(x.online, 'Connected to this site', `last poll ${esc(ago(x.lastSeen))}`, 'Start the runner: <code>npm start</code>. On Oracle: <code>sudo systemctl start ultralight-runner</code>')}
      ${item(ver === r.latest, `Runner version ${esc(ver)}`, ver === r.latest ? 'current' : `this site expects ${esc(r.latest)}`, 'On the runner machine: <code>git pull && cd runner && npm install</code>, then restart it')}
      ${owner ? (i.host ? item(true, `Host ${esc(i.host)}`, `${esc(i.platform)} · Node ${esc(i.node)} · ${esc(i.cpus)} CPU · ${esc(i.memMb)} MB · Chromium ${esc(i.chromium)}`) : item(null, 'Host details', 'Runner 1.2 reports its host, SAP reachability and local accounts. Older runners do not.', 'Update the runner to 1.2')) : ''}
      ${i.sap ? item(!!i.sap.ok, `Reaches SAP ${esc(i.sapHost)}`, i.sap.ok ? `HTTP ${esc(i.sap.status)} in ${esc(i.sap.ms)} ms, ${esc(ago(x.infoAt))}` : esc(i.sap.error || `HTTP ${i.sap.status}`), 'The machine needs outbound HTTPS to the SAP host') : ''}
      ${owner && i.accounts ? item(i.accounts.length > 0, 'Local SAP accounts', i.accounts.length ? esc(i.accounts.join(', ')) : 'none: every run must carry its password', 'Add <code>SAP_ACCOUNTS=LEARN-###:password</code> to <code>runner/.env</code>') : ''}
      ${item(true, 'Token scope', x.accounts.length ? esc(x.accounts.join(', ')) : 'all accounts')}
    </ul></section>`
  }).join('')
  v.innerHTML = `
  <div class="head"><div><h1>Readiness</h1><p>Everything a run needs, checked from here. Runners report their host and SAP reachability every 10 minutes. The task grid comes from the last <b>Validate</b> run, which reads SAP without changing anything.</p></div><button class="btn" id="reRead">Refresh</button></div>
  <section class="card" style="margin-bottom:1rem"><ul class="ready">
    ${item(r.runners.length > 0, 'Runner token issued', r.runners.length ? `${r.runners.length} active token(s)` : 'none', owner ? 'Owner console > Runners > Create token' : 'Ask the owner')}
    ${item(onlineRunners.length > 0, 'A runner is online', onlineRunners.length ? esc(onlineRunners.map((x) => x.name).join(', ')) : 'none online right now', 'Start a runner. To keep one running with your PC off, host it on Oracle Cloud (Setup guide)')}
    ${item(r.accounts.length > 0, 'SAP account available to you', r.accounts.length ? esc(r.accounts.map((a) => a.sapUser).join(', ')) : 'none granted', owner ? 'Owner console > SAP accounts, then tick it for the user' : 'Ask the owner to grant a LEARN-### account')}
  </ul></section>
  ${r.accounts.map((a) => {
    const on = a.runners.filter((x) => x.online)
    const pw = a.runners.some((x) => x.holdsPassword)
    const val = a.validation
    return `<section class="card stack" style="margin-bottom:1rem"><div class="row" style="justify-content:space-between"><h2>${esc(a.sapUser)} · ${esc(a.project)}</h2><div class="row"><button class="btn sm primary" data-val="${esc(a.sapUser)}" ${on.length ? '' : 'disabled title="No runner online"'}>Validate all tasks in SAP</button><a class="btn sm" href="#sheet">Task sheet</a></div></div>
      <ul class="ready">
        ${item(on.length > 0, 'Runner can take this account', on.length ? esc(on.map((x) => x.name).join(', ')) : a.runners.length ? 'the runner that covers it is offline' : 'no runner token covers it', 'Start the runner, or issue a token without an account limit')}
        ${item(pw ? true : null, 'SAP password on the runner', pw ? 'held in runner/.env, runs start without asking' : 'not held: type it on Run pack for each run', 'Optional: add it to SAP_ACCOUNTS in runner/.env')}
        ${a.lastRun ? item(a.lastRun.status === 'done' ? true : null, `Last run #${a.lastRun.id} ${esc(a.lastRun.status)}`, `${esc(a.lastRun.mode)} · tasks ${esc(a.lastRun.tasks.join(', '))} · ${esc(a.lastRun.result?.summary || '')} · ${esc(ago(a.lastRun.finished_at || a.lastRun.created_at))}`) : ''}
      </ul>
      <h3>Tasks in SAP</h3>
      ${val ? `<p class="small muted">From validate run #${val.jobId}, ${esc(ago(val.at))}: ${esc(val.result?.summary || '')}</p>` : '<p class="small muted">No validate run yet. It logs in, opens the project and the cost report, and reads what is there. Nothing is saved.</p>'}
      <div class="val-grid">${(S.pack?.tasks || []).map((t) => { const x = val?.tasks[t.id]; return `<a class="val-cell ${!x ? '' : x.level === 'ok' ? 'ok' : x.level === 'warn' ? 'warn' : 'err'}" href="#sheet/${t.id}" title="${esc(x?.message || 'not checked yet')}"><b>${t.id}</b><span>${esc(t.title)}</span><em>${!x ? 'not checked' : x.level === 'ok' ? 'done' : x.level === 'warn' ? 'check evidence' : 'not done'}</em></a>` }).join('')}</div>
      ${val ? `<details><summary class="small">What the runner read</summary><ul class="small mono val-detail">${Object.entries(val.tasks).map(([k, x]) => `<li><b>${esc(k)}</b> ${esc(x.message)}</li>`).join('')}</ul></details>` : ''}
    </section>` }).join('')}
  <h2 style="margin:1.4rem 0 .8rem">Runners</h2>
  <div class="grid2">${runnerCards || '<p class="muted">No runner tokens yet.</p>'}</div>`
  $('#reRead').onclick = () => viewReady()
  document.querySelectorAll('[data-val]').forEach((b) => b.addEventListener('click', run(async () => {
    const res = await http('/jobs', { method: 'POST', body: { sapUser: b.dataset.val, tasks: [], mode: 'validate' } }).catch((err) => { if (err.data?.jobId) { go('canvas', err.data.jobId); return null } throw err })
    if (res) { toast(`Validate run #${res.id} queued`); go('canvas', res.id) }
  })))
}

async function paintDocs() {
  const el = $('#docList'); if (!el) return
  const { docs } = await http('/me/docs')
  el.innerHTML = docs.length ? docs.map((d, n) => `<div class="stack doc-item">
    <div class="row" style="justify-content:space-between"><div><b>${esc(d.name)}</b> <span class="small muted">${(d.size / 1048576).toFixed(1)} MB · ${esc(fmtTime(d.created_at))}${n === 0 ? ' · shown to users' : ''}</span></div><button class="btn sm danger" data-deldoc="${d.id}">Remove</button></div>
    <details ${n === 0 && !Object.keys(d.task_pages).length ? 'open' : ''}><summary class="small">Task to page map (${Object.keys(d.task_pages).length} of 14 set)</summary>
      <form class="pagemap" data-pm="${d.id}">${Array.from({ length: 14 }, (_, i) => `<label class="small">Task ${i + 1}<input class="input" type="number" min="1" name="${i + 1}" value="${esc(d.task_pages[i + 1] || '')}"></label>`).join('')}<button class="btn sm">Save pages</button></form>
    </details></div>`).join('') : '<p class="small muted">No PDF uploaded yet.</p>'
  el.querySelectorAll('[data-deldoc]').forEach((b) => b.addEventListener('click', run(async () => { if (!confirm('Remove this PDF?')) return; await http(`/admin/docs/${b.dataset.deldoc}`, { method: 'DELETE' }); paintDocs() })))
  el.querySelectorAll('[data-pm]').forEach((f) => f.addEventListener('submit', run(async (e) => { e.preventDefault(); const taskPages = Object.fromEntries([...new FormData(f)].filter(([, x]) => x)); await http(`/admin/docs/${f.dataset.pm}`, { method: 'POST', body: { taskPages } }); toast('Page map saved') })))
}

function viewGuide() {
  const origin = location.origin
  $('#view').innerHTML = `
  <div class="head"><div><h1>Setup guide</h1><p>Three pieces: this control site on Cloudflare, one runner on a machine that can reach SAP, and your approval for every user.</p></div></div>
  <div class="grid2 guide">
    <section class="card"><h2>Owner: first run</h2><ol>
      <li>Sign up first. The first account becomes the owner. If <code>SETUP_KEY</code> is set, enter it.</li>
      <li>Owner console → <b>SAP accounts</b>: add each <code>LEARN-###</code> you own in client 236.</li>
      <li>Owner console → <b>Runners</b>: create a runner token and copy it. It is shown once.</li>
      <li>Set <b>Registration</b> to closed once your users have requested access.</li>
      <li>Approve each request and tick the SAP accounts that user may drive.</li>
    </ol></section>
    <section class="card"><h2>Runner machine</h2><ol>
      <li>Needs Node 20+ and outbound HTTPS to <code>${esc(origin)}</code> and <code>m53p.ucc.cloud</code>.</li>
      <li>Install:<pre>git clone https://github.com/Tiredicey/ultralight-project-builder
cd ultralight-project-builder/runner
npm install
npx playwright install --with-deps chromium</pre></li>
      <li>Configure <code>runner/.env</code>:<pre>CONTROL_URL=${esc(origin)}
RUNNER_TOKEN=ucr_xxxxxxxx
SAP_ACCOUNTS=LEARN-###:password,LEARN-###:otherpassword</pre>Passwords here stay on the runner. Leave them out to require the password per run.</li>
      <li>Start it:<pre>npm start</pre>The Owner console shows it online within 5 seconds.</li>
    </ol></section>
    <section class="card"><h2>Always on: Oracle Cloud runner</h2><ol>
      <li>Oracle console → Compute → <b>Create instance</b>. Image <b>Ubuntu 22.04</b> or <b>24.04</b>. Shape <b>VM.Standard.A1.Flex</b> (Always Free Ampere, 1 OCPU / 6 GB is plenty) or VM.Standard.E2.1.Micro (1 GB, the script adds swap). Keep the default public subnet, add your SSH key.</li>
      <li>No inbound ports are needed. The runner only makes outbound HTTPS calls to this site and to <code>m53p.ucc.cloud</code>.</li>
      <li>Owner console → Runners → create a token named <code>oracle</code>. Revoke the token of the runner on your PC once Oracle shows online, so only one runner claims jobs.</li>
      <li>SSH in and run:<pre>curl -fsSL https://raw.githubusercontent.com/Tiredicey/ultralight-project-builder/main/deploy/oracle/setup.sh | bash</pre>It installs Node 20 and Chromium, asks for the site URL, the token and <code>LEARN-###:password</code>, runs the self-check, and installs a systemd service that starts on boot.</li>
      <li>Open <b>Readiness</b>: the Oracle runner shows online with its host name and SAP reachability. You can shut your PC down.</li>
      <li>Logs <code>sudo journalctl -u ultralight-runner -f</code>. Update by running the same command again.</li>
    </ol></section>
    <section class="card"><h2>Check your setup</h2><ol>
      <li>On the runner machine: <code>cd runner && npm run doctor</code>. It checks Node, <code>.env</code>, the token against this site, SAP reachability and Chromium, and prints a fix for every failure. It does not log in to SAP.</li>
      <li>Here: <b>Readiness</b> lists every runner (version, host, SAP reachability) and every SAP account you can use.</li>
      <li>Press <b>Validate all tasks in SAP</b> there, or start a run in <b>Validate</b> mode. The runner logs in, reads the project tree, relationships, activity 0135 and the cost report, and marks each task done or not done. Nothing is saved.</li>
      <li><b>Task sheet</b> lists every value per task with how to check it by hand, and prints to PDF.</li>
    </ol></section>
    <section class="card"><h2>Running a pack</h2><ol>
      <li>Run pack → pick account and tasks → mode. Assist is the safe default.</li>
      <li>The canvas streams the real SAP WebGUI page. Boxes are the captured DOM fields; hover shows their SAP titles.</li>
      <li>When a step needs you, the right panel shows exact values with Copy buttons that also type into the focused SAP field.</li>
      <li>Every step is verified by reading the SAP status bar after the action. Unconfirmed steps show as "check", never as done.</li>
      <li>Runs and evidence hold every screenshot labelled by task for the Word report.</li>
    </ol></section>
    <section class="card"><h2>Known limits, checked</h2><ol>
      <li>Fiori tiles <b>Project Network Graph</b> and the GBI grading monitor were not assigned to automation sessions in previous runs. Tasks 3 and 5 use <code>CJ2B</code> with a manual hand-off.</li>
      <li>Host <code>m53.ucc.cloud</code> is dead. Only <code>m53p.ucc.cloud</code> resolves (checked 2026-09-26, 141.44.39.20, WebGUI login page HTTP 200).</li>
      <li>SAP control ids differ per screen and release. Grid steps locate columns by header text and fall back to the column numbers proven in earlier runs. When both fail the step hands control to you instead of guessing.</li>
      <li>Cloudflare cannot run a browser for this. The runner must be a machine you control.</li>
    </ol></section>
  </div>`
}

async function viewAdmin() {
  const v = $('#view')
  const a = await http('/admin/overview')
  S.admin = a
  v.innerHTML = `
  <div class="head"><div><h1>Owner console</h1><p>Nobody reaches the canvas until you approve them and grant a SAP account. Every decision lands in the audit log.</p></div>
  <label class="row small">Registration <select class="input" id="reg" style="width:auto"><option ${a.registration === 'open' ? 'selected' : ''} value="open">open</option><option ${a.registration === 'closed' ? 'selected' : ''} value="closed">closed</option></select></label></div>
  <section class="card scroll" style="margin-bottom:1rem"><h2>People</h2>
    <table class="t" style="margin-top:.5rem"><thead><tr><th>User</th><th>Status</th><th>Role</th><th>SAP accounts</th><th></th></tr></thead><tbody>
    ${a.users.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)}</div>${u.note ? `<div class="small">${esc(u.note)}</div>` : ''}</td>
      <td><span class="pill ${u.status === 'approved' ? 'ok' : u.status === 'pending' ? 'warn' : 'err'}">${esc(u.status)}</span></td>
      <td>${u.role === 'owner' ? '<span class="pill accent">owner</span>' : `<select class="input" data-role="${u.id}" style="width:auto"><option ${u.role === 'user' ? 'selected' : ''}>user</option><option ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>`}</td>
      <td>${u.role === 'owner' ? '<span class="small muted">all</span>' : `<div class="row">${a.accounts.map((acc) => `<label class="small row" style="gap:.25rem"><input type="checkbox" data-grant="${u.id}" value="${acc.id}" ${a.grants.some((g) => g.user_id === u.id && g.account_id === acc.id) ? 'checked' : ''}>${esc(acc.sap_user)}</label>`).join('') || '<span class="small muted">add accounts first</span>'}</div>`}</td>
      <td class="row">${u.role === 'owner' ? '' : `${u.status !== 'approved' ? `<button class="btn sm primary" data-st="approved" data-u="${u.id}">Approve</button>` : ''}${u.status === 'pending' ? `<button class="btn sm" data-st="rejected" data-u="${u.id}">Reject</button>` : ''}${u.status === 'approved' ? `<button class="btn sm danger" data-st="suspended" data-u="${u.id}">Suspend</button>` : ''}`}</td></tr>`).join('')}
    </tbody></table></section>
  <div class="grid2">
    <section class="card stack"><h2>SAP accounts, client 236</h2>
      <form class="row" id="addAcc"><input class="input" name="sapUser" placeholder="LEARN-###, LEARN-### ..." required aria-label="One or more LEARN-### accounts, comma separated" style="max-width:16rem"><input class="input" name="label" placeholder="Label (optional)" style="max-width:12rem"><button class="btn sm primary">Add</button></form>
      <table class="t"><tbody>${a.accounts.map((acc) => `<tr><td class="mono">${esc(acc.sap_user)}</td><td>${esc(acc.label || '')}</td><td class="mono small">P/2${esc(acc.sap_user.slice(-3))}</td><td><button class="btn sm danger" data-delacc="${acc.id}">Remove</button></td></tr>`).join('') || '<tr><td class="muted">None yet</td></tr>'}</tbody></table>
    </section>
    <section class="card stack"><h2>Runners</h2>
      <form class="row" id="addRun"><input class="input" name="name" placeholder="Runner name" required style="max-width:12rem"><input class="input" name="accounts" placeholder="Limit to LEARN-### (comma, optional)"><button class="btn sm primary">Create token</button></form>
      <div id="newTok"></div>
      <table class="t"><tbody>${a.runners.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="small muted">${r.accounts.length ? esc(r.accounts.join(', ')) : 'all accounts'}${r.version ? ` · v${esc(r.version)}` : ''}</div></td><td>${r.revoked ? '<span class="pill err">revoked</span>' : r.online ? '<span class="pill ok">online</span>' : `<span class="pill">seen ${esc(ago(r.last_seen))}</span>`}</td><td>${r.revoked ? '' : `<div class="row"><input class="input" data-limit="${r.id}" value="${esc(r.accounts.join(', '))}" placeholder="all accounts" aria-label="Accounts this runner may drive" style="width:11rem"><button class="btn sm" data-savelimit="${r.id}">Save limit</button><button class="btn sm danger" data-rev="${r.id}">Revoke</button></div>`}</td></tr>`).join('') || '<tr><td class="muted">No runners</td></tr>'}</tbody></table>
    </section>
  </div>
  <section class="card scroll" style="margin-top:1rem"><h2>Audit log</h2><table class="t"><tbody>${a.audit.map((x) => `<tr><td class="small muted">${esc(fmtTime(x.created_at))}</td><td>${esc(x.email || '')}</td><td class="mono small">${esc(x.action)}</td><td class="small mono">${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></section>`
  v.insertAdjacentHTML('beforeend', `
  <div class="grid2" style="margin-top:1rem">
    <section class="card stack" style="align-content:start"><h2>Task PDF</h2>
      <p class="small muted">Upload the official task sheet. Everyone you approved can open it from Task sheet, and each task links to its page. Stored in D1, max 20 MB.</p>
      <form class="row" id="docForm"><input class="input" type="file" id="docFile" accept="application/pdf,.pdf" required style="max-width:22rem"><button class="btn sm primary">Upload</button></form>
      <div id="docProg" class="small muted" aria-live="polite"></div>
      <div id="docList"></div>
    </section>
    <section class="card stack" style="align-content:start"><h2>Demo video</h2>
      <p class="small muted">65 s walkthrough: real SAP execution with DOM-target highlighting, then this console. Royalty-free soundtrack.</p>
      <video class="demo" controls preload="none" playsinline poster="/static/demo-poster.jpg"><source src="/static/demo.mp4" type="video/mp4"><a href="/static/demo.mp4">Download the video</a></video>
      <div class="row small"><a href="/static/demo.mp4" download>Download MP4</a><span class="muted">1920×1080 · 14 MB</span></div>
    </section>
  </div>`)
  paintDocs()
  $('#docForm').onsubmit = run(async (e) => {
    e.preventDefault()
    const f = $('#docFile').files[0]
    if (!f) throw new Error('Pick a PDF')
    if (f.size > 20 * 1024 * 1024) throw new Error('PDF is larger than 20 MB')
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f) })
    const meta = await http('/admin/docs', { method: 'POST', body: { name: f.name, size: f.size } })
    for (let i = 0; i < meta.chunks; i++) {
      $('#docProg').textContent = `Uploading part ${i + 1} of ${meta.chunks}`
      const res = await fetch(`/api/admin/docs/${meta.id}/${i}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'text/plain' }, body: b64.slice(i * meta.chunkSize, (i + 1) * meta.chunkSize) })
      if (!res.ok) { await http(`/admin/docs/${meta.id}`, { method: 'DELETE' }).catch(() => {}); throw new Error((await res.json().catch(() => ({}))).error || `Upload failed at part ${i + 1}`) }
    }
    $('#docProg').textContent = `${f.name} uploaded. Set the task pages below.`
    $('#docFile').value = ''
    toast('Task PDF uploaded')
    paintDocs()
  })
  const refresh = () => viewAdmin()
  $('#reg').onchange = run(async (e) => { await http('/admin/settings', { method: 'POST', body: { registration: e.target.value } }); toast(`Registration ${e.target.value}`) })
  document.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', run(async () => { await http(`/admin/users/${b.dataset.u}`, { method: 'POST', body: { status: b.dataset.st } }); toast(`User ${b.dataset.st}`); refresh() })))
  document.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', run(async () => { await http(`/admin/users/${s.dataset.role}`, { method: 'POST', body: { role: s.value } }); toast('Role updated') })))
  document.querySelectorAll('[data-grant]').forEach((c) => c.addEventListener('change', run(async () => { const uid = c.dataset.grant; const ids = [...document.querySelectorAll(`[data-grant="${uid}"]:checked`)].map((x) => Number(x.value)); await http(`/admin/users/${uid}`, { method: 'POST', body: { accounts: ids } }); toast('Grants saved') })))
  $('#addAcc').onsubmit = run(async (e) => { e.preventDefault(); const r = await http('/admin/accounts', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(`Allowlisted ${r.added.join(', ')}`); refresh() })
  document.querySelectorAll('[data-delacc]').forEach((b) => b.addEventListener('click', run(async () => { if (!confirm('Remove this SAP account and its grants?')) return; await http(`/admin/accounts/${b.dataset.delacc}`, { method: 'DELETE' }); refresh() })))
  $('#addRun').onsubmit = run(async (e) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    const r = await http('/admin/runners', { method: 'POST', body: { name: f.name, accounts: String(f.accounts || '').split(',').map((s) => s.trim()).filter(Boolean) } })
    await viewAdmin()
    $('#newTok').innerHTML = `<div class="prompt"><b>Copy this token now. It is shown once.</b><code style="word-break:break-all">${esc(r.token)}</code><div><button class="btn sm" id="cpTok">Copy</button></div></div>`
    $('#cpTok').onclick = () => { navigator.clipboard?.writeText(r.token); toast('Token copied') }
  })
  document.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', run(async () => { if (!confirm('Revoke this runner token?')) return; await http(`/admin/runners/${b.dataset.rev}`, { method: 'DELETE' }); refresh() })))
  document.querySelectorAll('[data-savelimit]').forEach((b) => b.addEventListener('click', run(async () => { const v = document.querySelector(`[data-limit="${b.dataset.savelimit}"]`).value; const r = await http(`/admin/runners/${b.dataset.savelimit}`, { method: 'PUT', body: { accounts: v } }); toast(r.accounts.length ? `Runner limited to ${r.accounts.join(', ')}` : 'Runner may drive all accounts'); refresh() })))
}

boot().catch((e) => { $('#app').innerHTML = `<div class="center"><div class="stack"><h1>Could not load</h1><p class="muted">${esc(e.message)}</p></div></div>` })
