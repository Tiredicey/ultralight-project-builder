import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { VIEW, webgui, settle, captureDom, statusbar, popupText, login, gotoTxn, findByLabel, typeInto, clickButton, clickTab, selectNode, grids, resolveColumns, writeCell, readCell, clickMenu, handlePopups, clickTitle, selectTreeObject, expandProjectTree, treeRows, openProjectFromWorklist, clearOwnLocks, waitPopup, popupInput } from './sap.mjs'
import { RECIPES, saveProject } from './recipes.mjs'
import { Checker } from './checks.mjs'
import { loadEnv, localAccounts } from './env.mjs'
import { VERSION } from './version.mjs'
import { hostname, cpus, totalmem } from 'node:os'

const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toRe = (v) => (v instanceof RegExp ? v : new RegExp(String(v), 'i'))
const reviveArgs = (a = {}) => ({ ...a, flags: a.flags ? a.flags.map(toRe) : a.flags, checks: a.checks ? a.checks.map(toRe) : a.checks })

loadEnv()

const CONTROL = (process.env.CONTROL_URL || '').replace(/\/$/, '')
const TOKEN = process.env.RUNNER_TOKEN || ''
const SAP_HOST = process.env.SAP_HOST || 'm53p.ucc.cloud'
const SAP_CLIENT = process.env.SAP_CLIENT || '236'
const HEADLESS = process.env.HEADLESS !== 'false'
const LOCAL = localAccounts()
const MAX_JOBS = Math.max(1, Math.min(4, Number(process.env.MAX_JOBS) || 1))
const ONLY = (process.env.ONLY_ACCOUNTS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
if (!CONTROL || !TOKEN) { process.stderr.write('Set CONTROL_URL and RUNNER_TOKEN in runner/.env\n'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}\n`)

async function call(path, body) {
  const res = await fetch(`${CONTROL}/api/runner${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-runner-version': VERSION }, body: JSON.stringify(body || {}) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const ERR_RE = /(does not exist|not allowed|not authorized|keine Berechtigung|invalid|ungültig|is locked|gesperrt|error|fehler|not possible|cannot be|must be)/i
const isErr = async (page) => page.evaluate(() => !!document.querySelector('[class*="MessageBar"][class*="rror"], [class*="sbar"] [class*="rror"], [class*="Msg"][class*="rror"] , [title="Error"], [aria-label="Error"]')).catch(() => false)

class Job {
  constructor(job, plan, browser) {
    this.job = job; this.plan = plan; this.browser = browser
    this.steps = plan.steps; this.idx = 0; this.status = 'running'; this.prompt = null
    this.events = []; this.paused = false
    this.stepOnce = false; this.aborted = false; this.seq = 0; this.lastHash = ''; this.lastFrameAt = 0; this.activeAt = Date.now(); this.target = null
    this.ctx = { host: SAP_HOST, client: SAP_CLIENT, user: job.sapUser, password: job.password || LOCAL[job.sapUser] || '' }
    this.results = { ok: 0, failed: 0, manual: 0, skipped: 0 }
    this.rctx = { page: null, vars: {}, dirty: false, sap: { host: SAP_HOST, client: SAP_CLIENT } }
  }

  ev(level, message, stepKey, data) { this.events.push({ level, message, stepKey, data }); log(level.toUpperCase(), stepKey || '', message) }

  async start() {
    this.context = await this.browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, locale: 'en-US', ignoreHTTPSErrors: false })
    this.page = await this.context.newPage()
    this.page.on('dialog', (d) => d.accept().catch(() => {}))
    this.rctx.page = this.page
    this.alive = true
    this.syncLoop = this.loopSync()
    this.frameLoop = this.loopFrames()
    try {
      await this.flush('running')
      if (!this.ctx.password) { await this.page.goto(webgui(SAP_HOST, SAP_CLIENT), { waitUntil: 'domcontentloaded', timeout: 60000 }); await settle(this.page, 1000); await this.handoff({ title: 'SAP password needed', instruction: `No password for ${this.ctx.user}. Log in on the canvas yourself, then press Done.` }, 'login') }
      else {
        const r = await login(this.page, this.ctx)
        if (!r.ok && r.needsHuman) await this.handoff({ title: 'SAP needs you at login', instruction: r.reason }, 'login')
        else if (!r.ok) { this.ev('error', r.reason, 'login'); await this.handoff({ title: 'Login failed', instruction: `${r.reason}. Log in on the canvas or abort.`, error: r.reason }, 'login') }
        else this.ev('ok', `Logged in as ${this.ctx.user} on ${SAP_HOST} client ${SAP_CLIENT}`, 'login', { statusbar: await statusbar(this.page) })
      }
      this.ctx.password = ''
      while (this.idx < this.steps.length && !this.aborted) {
        await this.gate()
        if (this.aborted) break
        const s = this.steps[this.idx]
        const out = await this.exec(s).catch((e) => ({ ok: false, reason: e.message }))
        if (this.aborted) break
        if (out.redo) continue
        if (out.ok) {
          if (out.manual) this.results.manual++; else this.results.ok++
          this.ev(out.warn ? 'warn' : 'ok', out.note || s.label || s.op, s.key, { statusbar: out.statusbar, readback: out.readback }); this.idx++
          if (out.skipTask) { let n = 0; while (this.idx < this.steps.length && this.steps[this.idx].task === s.task) { this.idx++; n++ } this.results.skipped += n; this.ev('info', `Task ${s.task}: already done in SAP, ${n} remaining step(s) skipped (no duplicate posting, no new screenshot)`, s.key) }
        }
        else if (out.skipped) { this.results.skipped++; this.ev('warn', `Skipped: ${out.reason || s.label}`, s.key); this.idx++ }
        else if (out.soft) { this.results.failed++; this.ev('error', out.reason, s.key); this.idx++ }
        else {
          this.ev('error', out.reason || 'Step failed', s.key, { statusbar: await statusbar(this.page), popup: await popupText(this.page) })
          const d = await this.handoff({ title: `Step ${s.key} needs you`, instruction: `${s.label}. Automation could not finish this. Fix it on the canvas and press Done, or retry.`, error: out.reason, values: s.values || valuesOf(s) }, s.key)
          if (d === 'retry') continue
          if (d === 'skip') { this.results.skipped++; this.idx++; continue }
          this.results.manual++; this.ev('warn', 'Marked done by operator, not verified by automation', s.key, { statusbar: await statusbar(this.page) }); this.idx++
        }
        if (this.stepOnce) { this.paused = true; this.stepOnce = false }
      }
      const ev = this.steps.filter((x) => x.evidenceOnly).length
      const passed = Math.max(0, this.results.ok - this.steps.slice(0, this.idx).filter((x) => x.evidenceOnly).length)
      const summary = this.plan.validate ? `${passed} of ${this.steps.length - ev} checkable tasks pass in SAP${this.results.failed ? `, ${this.results.failed} not complete` : ''}${ev ? `; ${ev} screenshot task(s) to check by eye` : ''}` : `${this.results.ok} verified, ${this.results.manual} by operator, ${this.results.skipped} skipped`
      await this.flush(this.aborted ? 'aborted' : 'done', { result: { ...this.results, summary } })
      this.ev('info', `Finished: ${summary}`)
    } catch (e) {
      this.ev('error', `Runner crashed: ${e.message}`)
      await this.flush('failed', { result: { ...this.results, summary: e.message } }).catch(() => {})
    } finally {
      this.alive = false
      await sleep(1200)
      await this.pushFrame(true).catch(() => {})
      await this.flush(this.aborted ? 'aborted' : this.status === 'failed' ? 'failed' : 'done').catch(() => {})
      await this.context.close().catch(() => {})
    }
  }

  async flush(status, extra = {}) {
    if (status) this.status = status
    const events = this.events.splice(0, 50)
    const r = await call(`/jobs/${this.job.id}/state`, { status: this.status, stepIdx: this.idx, prompt: this.prompt, events, ...extra }).catch((e) => { this.events.unshift(...events); log('WARN sync', e.message); return { commands: [] } })
    for (const c of r.commands || []) await this.onCommand(c)
  }

  async loopSync() { while (this.alive) { await this.flush().catch(() => {}); await sleep(this.prompt || this.paused ? 700 : 1000) } }

  async loopFrames() {
    while (this.alive) {
      const fast = Date.now() - this.activeAt < 8000
      await this.pushFrame().catch(() => {})
      await sleep(fast ? 450 : 1500)
    }
  }

  async pushFrame(force = false) {
    if (!this.page || this.page.isClosed()) return
    const buf = await this.snap(55).catch(() => null)
    if (!buf) return
    const hash = createHash('sha1').update(buf).digest('hex')
    if (!force && hash === this.lastHash && Date.now() - this.lastFrameAt < 10000) return
    this.lastHash = hash; this.lastFrameAt = Date.now()
    const dom = await captureDom(this.page, this.target).catch(() => null)
    await call(`/jobs/${this.job.id}/frame`, { seq: ++this.seq, width: VIEW.width, height: VIEW.height, image: buf.toString('base64'), dom, url: this.page.url(), title: await this.page.title().catch(() => ''), statusbar: await statusbar(this.page) })
  }

  async onCommand(c) {
    const p = this.page
    this.activeAt = Date.now()
    const input = ['click', 'dblclick', 'type', 'key', 'scroll', 'goto', 'fill'].includes(c.type)
    if (input && ['observe', 'validate'].includes(this.job.mode)) return
    if (input && !this.prompt && !this.paused) { this.paused = true; this.ev('info', 'Operator took control, automation paused') }
    try {
      if (c.type === 'click') await p.mouse.click(c.x, c.y)
      else if (c.type === 'dblclick') await p.mouse.dblclick(c.x, c.y)
      else if (c.type === 'type') await p.keyboard.type(String(c.text || ''), { delay: 15 })
      else if (c.type === 'key') await p.keyboard.press(String(c.key))
      else if (c.type === 'scroll') { await p.mouse.move(c.x, c.y); await p.mouse.wheel(0, Number(c.dy) || 300) }
      else if (c.type === 'goto' && c.txn) await gotoTxn(p, this.ctx, String(c.txn))
      else if (c.type === 'pause') { this.paused = true; this.ev('info', 'Paused by operator') }
      else if (c.type === 'resume') { this.paused = false; this.ev('info', 'Resumed') }
      else if (c.type === 'step') { this.paused = false; this.stepOnce = true }
      else if (c.type === 'abort') { this.aborted = true; this.decide('abort'); this.ev('warn', 'Aborted by operator') }
      else if (['continue', 'retry', 'skip'].includes(c.type)) { if (this.prompt) this.decide(c.type); else if (c.type === 'skip') { this.idx = Math.min(this.idx + 1, this.steps.length); this.ev('warn', 'Step skipped by operator') } else this.paused = false }
      else if (c.type === 'capture') await this.evidence(`manual-${Date.now()}`, 'Manual capture from the canvas', null)
    } catch (e) { this.ev('warn', `Command ${c.type} failed: ${e.message}`) }
  }

  decide(d) { const r = this.resolver; this.resolver = null; this.prompt = null; if (r) r(d) }

  async handoff(prompt, stepKey) {
    this.prompt = { ...prompt, stepKey }
    this.ev('warn', `Waiting for operator: ${prompt.title}`, stepKey)
    await this.flush('waiting')
    const d = await new Promise((r) => { this.resolver = r })
    this.paused = false
    await this.flush('running')
    return d
  }

  async gate() {
    if (!this.paused) return
    await this.flush('paused')
    while (this.paused && !this.aborted) await sleep(300)
    if (!this.aborted) await this.flush('running')
  }

  async snap(quality = 82) {
    const fast = this.rctx.vars.fastShot
    const buf = await this.page.screenshot({ type: 'jpeg', quality, timeout: fast ? 8000 : 30000, animations: 'disabled' }).catch(() => null)
    if (buf) return buf
    const cdp = await this.page.context().newCDPSession(this.page)
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality }).finally(() => cdp.detach().catch(() => {}))
    return Buffer.from(r.data, 'base64')
  }

  async evidence(name, caption, task) {
    const buf = await this.snap(82)
    await call(`/jobs/${this.job.id}/evidence`, { name, caption, task, kind: 'screenshot', mime: 'image/jpeg', body: buf.toString('base64') })
    const dom = await captureDom(this.page)
    const sb = await statusbar(this.page)
    await call(`/jobs/${this.job.id}/evidence`, { name: `${name}-dom`, caption: `DOM capture: ${dom.els.length} elements, status "${sb}"`, task, kind: 'dom', mime: 'application/json', body: JSON.stringify({ url: this.page.url(), title: dom.title, statusbar: sb, elements: dom.els, grids: await grids(this.page).then((g) => g.slice(0, 3).map(({ id, rows, cols, colHdr, cells }) => ({ id, rows, cols, colHdr, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.v])) }))).catch(() => []) }) })
    this.ev('ok', `Evidence captured: ${caption}`, null)
  }

  observeBlocked(s) { return this.job.mode === 'observe' && !['txn', 'openProject', 'overview', 'tab', 'shot', 'expectText', 'expect', 'expectField', 'node', 'dismiss', 'popupField'].includes(s.op) && !(s.op === 'recipe' && ['treeSelect', 'costReport', 'networkGraph'].includes(s.name)) }

  async verify(note, extra = {}) {
    const sb = await statusbar(this.page)
    if (await isErr(this.page) || (sb && ERR_RE.test(sb) && !/saved|gesichert|posted|created|changed/i.test(sb))) return { ok: false, reason: `SAP says: ${sb || 'error indicator shown'}`, statusbar: sb }
    return { ok: true, note, statusbar: sb, ...extra }
  }

  async exec(s) {
    const p = this.page, d = this.plan.data
    this.target = null
    if (this.observeBlocked(s)) return { skipped: true, reason: `${s.label} (observe mode is read-only)` }
    if (s.op === 'validate') return this.validateTask(s)
    if (s.op === 'manual') {
      if (s.optional && this.job.mode === 'auto') return { skipped: true, reason: `${s.label} is optional` }
      const dcs = await this.handoff({ title: s.label, instruction: s.instruction, values: s.values }, s.key)
      if (dcs === 'skip') return { skipped: true, reason: s.label }
      if (dcs === 'retry') return { redo: true }
      return { ok: true, warn: true, manual: true, note: `${s.label}: done by operator`, statusbar: await statusbar(p) }
    }
    if (s.op !== 'shot') this.rctx.vars.fastShot = false
    if (s.op === 'txn') { const r = await gotoTxn(p, this.ctx, s.code); return r.ok ? { ok: true, note: `${s.code} open`, statusbar: r.statusbar } : r }
    if (s.op === 'dismiss') { const r = await handlePopups(p, (s.buttons || []).map((b) => new RegExp(`^${b}$`, 'i'))); return { ok: true, note: r ? `Popup handled: ${r.clicked || 'left open'}` : 'No popup' } }
    if (s.op === 'key') { await p.keyboard.press(s.press); await settle(p, 900); await handlePopups(p, [/^Yes$/i, /^Continue$/i, /^OK$/i]); return this.verify(`${s.press} pressed`) }
    if (s.op === 'tab') { const t = await clickTab(p, s.names); if (!t) return s.optional ? { ok: true, note: 'Tab not present, continuing' } : { ok: false, reason: `Tab ${s.names.join(' / ')} not found` }; return { ok: true, note: `Tab ${t.t}` } }
    if (s.op === 'shot') { await settle(p, 500); await this.evidence(s.name, s.caption, s.task); return { ok: true, note: `Screenshot ${s.name}` } }
    if (s.op === 'save') return saveProject(this.rctx, s)
    if (s.op === 'recipe') {
      const fn = RECIPES[s.name]
      if (!fn) return { ok: false, reason: `Unknown recipe ${s.name}` }
      const r = await fn(this.rctx, reviveArgs(s.args))
      return r.ok ? { ...r, statusbar: r.statusbar || await statusbar(p) } : r
    }
    if (s.op === 'openProject') {
      const r = await gotoTxn(p, this.ctx, 'CJ20N'); if (!r.ok) return r
      await handlePopups(p, [/^Continue$/i, /^Cancel$/i])
      let hit = (await openProjectFromWorklist(p, s.project)) ? s.project : null
      if (!hit) {
        const open = await clickButton(p, [/^Open$/i, /Open project/i, /Öffnen/i])
        if (open) { const f = await findByLabel(p, [/Project def/i, /Project Definition/i]); if (f) { await typeInto(p, f, s.project); await p.keyboard.press('Enter'); await settle(p, 2500); hit = s.project } }
      }
      if (!hit) return { ok: false, reason: `Could not open ${s.project} from the worklist or Open dialog` }
      await settle(p, 2500)
      if (/not all objects were locked|locked by|is currently being processed/i.test(await statusbar(p)) || /Display (project|network)/i.test(await p.title())) {
        this.lockTries = (this.lockTries || 0) + 1
        if (this.lockTries > 2) return { ok: false, reason: `${s.project} opens in display mode: still locked after releasing stale locks twice` }
        const lk = await clearOwnLocks(p, this.ctx)
        this.ev(lk.ok ? 'warn' : 'error', lk.ok ? `Released ${lk.cleared} stale SAP lock(s) of ${this.ctx.user} left by an earlier session` : `Project locked: ${lk.reason}`, s.key)
        if (!lk.ok) return { ok: false, reason: `${s.project} is locked and the lock could not be released: ${lk.reason}` }
        return { redo: true }
      }
      this.lockTries = 0
      const title = await p.title()
      if (!title.includes(s.project)) return { ok: false, reason: `${s.project} not open, title is "${title}"` }
      await expandProjectTree(p)
      const net = (await treeRows(p)).map((r) => r.ident.match(/^(\d{5,})$/)).find(Boolean)
      if (net) this.rctx.vars.network = net[1]
      this.rctx.dirty = false
      return { ok: true, note: `${s.project} open${net ? `, network ${net[1]}` : ''}`, readback: title }
    }
    if (s.op === 'node') { const t = await selectNode(p, s.text); return t ? { ok: true, note: `Selected ${t}` } : { ok: false, reason: `Tree node ${s.text.join(' / ')} not found` } }
    if (s.op === 'overview') {
      const sel = /^\d{4}$/.test(s.node) ? { act: s.node } : { ident: s.node, level: s.level ?? 1 }
      const t = await selectTreeObject(p, sel)
      if (!t.ok) return t
      if (t.network) this.rctx.vars.network = t.network
      const b = await clickTitle(p, s.button) || await clickButton(p, s.button)
      if (!b) return { ok: false, reason: `Button ${s.button.join(' / ')} not found` }
      return { ok: true, note: `${b.t} on ${t.header.join(' / ')}` }
    }
    if (s.op === 'menu') { const r = await clickMenu(p, s.path); if (!r.ok) return r; await handlePopups(p); return this.verify(`Menu ${s.path.join(' > ')}`) }
    if (s.op === 'expect') { const sb = await statusbar(p); return new RegExp(s.statusbar, 'i').test(sb) ? { ok: true, note: `Status bar: ${sb}`, statusbar: sb } : { ok: false, reason: `Expected status /${s.statusbar}/, got "${sb}"` } }
    if (s.op === 'expectText') { await settle(p, 800); const found = await p.evaluate((t) => (document.body?.innerText || '').includes(t), s.text); return found ? { ok: true, note: `Found ${s.text}`, readback: s.text } : { ok: false, reason: `Value ${s.text} not on screen. Verify the report manually.` } }
    if (s.op === 'expectField') { const f = await findByLabel(p, s.titles); if (!f) return { ok: false, reason: `Field ${s.titles[0]} not found` }; if (s.contains) return String(f.v).includes(s.contains) ? { ok: true, note: `${f.t} = ${f.v}`, readback: f.v } : { ok: false, reason: `${f.t} is "${f.v}", expected to contain ${s.contains}` }; const v = (f.v || '').replace(/[^\d.,]/g, ''); return parseFloat(v.replace(/,/g, '')) === Number(s.value) ? { ok: true, note: `${f.t} = ${f.v}`, readback: f.v } : { ok: false, reason: `${f.t} is "${f.v}", expected ${s.value}` } }
    if (s.op === 'popupField') {
      const txt = await waitPopup(p, new RegExp(s.titles.map(escRe).join('|'), 'i'), s.wait || 8000) || await popupText(p)
      if (!txt) return s.optional ? { ok: true, note: 'No popup, value not required' } : { ok: false, reason: 'Popup not shown' }
      const f = await findByLabel(p, s.titles) || (new RegExp(s.titles.map(escRe).join('|'), 'i').test(txt) ? await popupInput(p) : null)
      if (!f) return s.optional ? { ok: true, warn: true, note: `Popup "${txt.slice(0, 60)}" without ${s.titles[0]}` } : { ok: false, reason: `${s.titles[0]} not in popup` }
      await typeInto(p, f, s.value); await p.keyboard.press('Enter'); await settle(p, 1200)
      return this.verify(`${s.titles[0]} = ${s.value}`)
    }
    if (s.op === 'fill') {
      const done = []
      for (const [labels, raw] of s.fields) {
        const v = subst(raw)
        const f = await findByLabel(p, labels)
        if (!f) return { ok: false, reason: `Field "${labels[0]}" not found on screen` }
        this.target = f.id
        await typeInto(p, f, v)
        done.push(`${labels[0]}=${v}`)
      }
      await p.keyboard.press('Tab'); await settle(p, 400)
      return { ok: true, note: done.join(', ') }
    }
    if (s.op === 'clear') { let n = 0; for (const t of s.titles) { const f = await findByLabel(p, [t]); if (f && f.v) { await typeInto(p, f, ''); n++ } } return { ok: true, note: `Cleared ${n} field(s)` } }
    if (s.op === 'check') {
      const els = (await captureDom(p)).els.filter((e) => e.k === 'check' || e.k === 'input')
      const hit = els.find((e) => s.titles.some((t) => new RegExp(t, 'i').test(e.t)))
      if (!hit) return s.optional ? { ok: true, note: `${s.titles[0]} not present` } : { ok: false, reason: `Checkbox ${s.titles[0]} not found` }
      if (hit.v !== 'true') { await p.mouse.click(hit.x + 6, hit.y + hit.h / 2); await settle(p, 300) }
      return { ok: true, note: `${s.titles[0]} ticked` }
    }
    if (s.op === 'grid') { const r = await this.gridOp(s); if (r.ok) this.rctx.dirty = true; return r }
    return { ok: false, reason: `Unknown op ${s.op}` }
  }

  // Read-only per-task check. Each group (tree, relationships, report) is read once per job and reused.
  async validateTask(s) {
    if (s.evidenceOnly || !s.checks.length) return { ok: true, warn: true, note: `Task ${s.task}: screenshot task, check the evidence image by eye`, readback: 'evidence only' }
    this.checker = this.checker || new Checker(this.page, this.ctx, this.plan.data)
    const res = await this.checker.run(s.checks)
    const detail = res.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.check}: ${r.detail}`).join(' | ')
    if (s.checks.some((c) => ['labor', 'invoice', 'finalActual', 'reportRuns', 'plan8000'].includes(c)) && !this.reportShot) { this.reportShot = true; await this.evidence('v-report', 'Validate: cost report as read', s.task).catch(() => {}) }
    if (res.length && res.every((r) => r.ok)) return { ok: true, note: `Task ${s.task} verified in SAP: ${detail}`, readback: detail }
    return { ok: false, soft: true, reason: `Task ${s.task} not complete in SAP: ${detail || 'no result'}` }
  }

  async gridOp(s) {
    const p = this.page
    const want = [...s.rows]
    const written = []
    for (let round = 0; round < 6 && want.length; round++) {
      const all = await grids(p)
      const spec = { ...s.columns, ...(s.match ? { __key: s.match.columns } : {}) }
      const g = all.find((g) => { const c = resolveColumns(g, spec, s.fallback); return Object.keys(s.columns).every((k) => c[k] != null) }) || (s.fallback ? all[0] : null)
      if (!g) return { ok: false, reason: `No table with columns ${Object.values(s.columns).map((x) => x[0]).join(', ')}` }
      const cols = resolveColumns(g, spec, s.fallback)
      const missing = Object.keys(s.columns).filter((k) => cols[k] == null)
      if (missing.length) return { ok: false, reason: `Columns not located: ${missing.join(', ')}. Headers seen: ${Object.values(g.colHdr).slice(0, 12).join(' | ')}` }
      let progress = 0
      if (s.match) {
        for (const r of [...want]) {
          const row = g.rows.find((ri) => normalize(g.cells[`${ri},${cols.__key}`]?.v) === normalize(r[s.match.key]))
          if (row == null) continue
          for (const k of Object.keys(s.columns)) { const w = await writeCell(p, g.id, row, cols[k], r[k]); if (!w.ok) return w }
          want.splice(want.indexOf(r), 1); written.push({ row, r }); progress++
        }
      } else {
        const keyCol = cols[Object.keys(s.columns)[0]]
        const existing = new Set(g.rows.map((ri) => normalize(g.cells[`${ri},${keyCol}`]?.v)).filter(Boolean))
        for (const r of [...want]) if (existing.has(normalize(r[Object.keys(s.columns)[0]]))) { const row = g.rows.find((ri) => normalize(g.cells[`${ri},${keyCol}`]?.v) === normalize(r[Object.keys(s.columns)[0]])); for (const k of Object.keys(s.columns)) { const cur = g.cells[`${row},${cols[k]}`]?.v; if (typeof r[k] !== 'boolean' && normalize(cur) !== normalize(r[k])) { const w = await writeCell(p, g.id, row, cols[k], r[k]); if (!w.ok) return w } } want.splice(want.indexOf(r), 1); written.push({ row, r }); progress++ }
        const empty = g.rows.filter((ri) => !normalize(g.cells[`${ri},${keyCol}`]?.v))
        for (const row of empty) {
          const r = want.shift(); if (!r) break
          this.target = `${g.id}[${row},${keyCol}]`
          for (const k of Object.keys(s.columns)) { const w = await writeCell(p, g.id, row, cols[k], r[k]); if (!w.ok) return w }
          written.push({ row, r }); progress++
        }
      }
      if (want.length) {
        await p.keyboard.press('Enter'); await settle(p, 1500)
        if (!progress) {
          const last = g.rows[g.rows.length - 1]
          const cell = g.cells[`${last},${cols[Object.keys(s.columns)[0]]}`]
          if (cell) { await p.mouse.move(cell.x + 5, cell.y + 5); await p.mouse.wheel(0, 600); await settle(p, 1000) }
          if (round >= 3) break
        }
      }
    }
    if (want.length) return { ok: false, reason: `${want.length} row(s) not written: ${want.map((r) => Object.values(r)[0]).join(', ')}` }
    await p.keyboard.press('Enter'); await settle(p, 1500)
    await handlePopups(p, [/^Continue$/i, /^OK$/i, /^Yes$/i])
    const after = await grids(p)
    const g = after[0]
    let verified = 0
    if (g) {
      const keyName = s.match ? s.match.key : Object.keys(s.columns)[0]
      const cols = resolveColumns(g, { ...s.columns, ...(s.match ? { __key: s.match.columns } : {}) }, s.fallback)
      const kc = s.match ? cols.__key : cols[keyName]
      const vals = new Set(g.rows.map((ri) => normalize(g.cells[`${ri},${kc}`]?.v)))
      verified = s.rows.filter((r) => vals.has(normalize(r[keyName]))).length
    }
    const base = await this.verify(`${s.label}: ${written.length} row(s) written, ${verified} read back`, { readback: `${verified}/${s.rows.length} rows present after Enter` })
    if (base.ok && verified < s.rows.length) return { ...base, warn: true, note: `${base.note}. Some rows scrolled out of view, check them on the canvas.` }
    return base
  }
}

const normalize = (v) => String(v ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '').replace(/\s+/g, ' ')
const subst = (v) => { const y = new Date().getFullYear(); const t = new Date(); return String(v).replace('{YEAR+1}', String(y + 1)).replace('{YEAR}', String(y)).replace('{TODAY}', `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}/${y}`) }
const valuesOf = (s) => {
  if (s.rows) return Object.fromEntries(s.rows.slice(0, 16).map((r, i) => [`Row ${i + 1}`, Object.values(r).map((v) => (v === true ? 'X' : v)).join(' · ')]))
  if (s.fields) return Object.fromEntries(s.fields.map(([l, v]) => [l[0], subst(v)]))
  if (s.value) return { [s.titles?.[0] || 'Value']: s.value }
  return undefined
}

const STARTED = Date.now()

async function main() {
  log(`Runner ${VERSION} → ${CONTROL} · SAP ${SAP_HOST}/${SAP_CLIENT} · local accounts: ${Object.keys(LOCAL).join(', ') || 'none'} · ${HEADLESS ? 'headless' : 'headed'}`)
  const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-dev-shm-usage', '--disable-gpu', ...(totalmem() < 1.6e9 ? ['--js-flags=--max-old-space-size=384', '--renderer-process-limit=1'] : [])] })
  // Self-report for the Readiness page: host, versions, local accounts (names only) and SAP reachability.
  const hello = async () => {
    let sap = null
    try { const t = Date.now(); const r = await fetch(webgui(SAP_HOST, SAP_CLIENT), { redirect: 'manual', signal: AbortSignal.timeout(15000) }); sap = { ok: r.status < 500, status: r.status, ms: Date.now() - t } } catch (e) { sap = { ok: false, error: e.message } }
    const info = { version: VERSION, host: hostname(), platform: `${process.platform}/${process.arch}`, node: process.version, cpus: cpus().length, memMb: Math.round(totalmem() / 1048576), chromium: browser.version(), headless: HEADLESS, accounts: Object.keys(LOCAL), accountsWithPassword: Object.entries(LOCAL).filter(([, p]) => p).map(([u]) => u), sapHost: SAP_HOST, sapClient: SAP_CLIENT, sap, startedAt: STARTED, maxJobs: MAX_JOBS, only: ONLY }
    const r = await call('/hello', { info }).catch((e) => { log('WARN hello', e.message); return null })
    if (r?.latest && r.latest !== VERSION && !hello.warned) { hello.warned = true; log(`NOTE site expects runner ${r.latest}, this is ${VERSION}. git pull && npm install`) }
  }
  await hello()
  setInterval(hello, 10 * 60 * 1000)
  let idle = 0
  const active = new Map()
  for (;;) {
    try {
      if (active.size < MAX_JOBS) {
        const r = await call('/claim', { accounts: Object.keys(LOCAL), only: ONLY, busy: [...active.keys()] })
        if (r.job) {
          idle = 0
          log(`Job #${r.job.id} ${r.job.sapUser} tasks ${r.job.tasks.join(',')} (${r.plan.steps.length} steps), slot ${active.size + 1}/${MAX_JOBS}`)
          const run = new Job(r.job, r.plan, browser).start().catch((e) => log('ERROR job', r.job.id, e.message)).finally(() => active.delete(r.job.sapUser))
          active.set(r.job.sapUser, run)
          if (MAX_JOBS === 1) await run
          continue
        }
        if (++idle % 60 === 1) log(`Waiting for jobs${ONLY.length ? ` (only ${ONLY.join(', ')})` : ''}`)
      }
    } catch (e) { log('WARN', e.message) }
    await sleep(3000)
  }
}

process.on('SIGINT', () => process.exit(0))
main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exit(1) })
