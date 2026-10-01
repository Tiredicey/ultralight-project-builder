export const VIEW = { width: 1920, height: 1200 }

export const webgui = (host, client, txn) => {
  const u = new URL(`https://${host}/sap/bc/gui/sap/its/webgui`)
  u.searchParams.set('sap-client', client)
  u.searchParams.set('sap-language', 'EN')
  if (txn) u.searchParams.set('~transaction', txn)
  return u.toString()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function settle(page, ms = 600) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
  const end = Date.now() + 20000
  while (Date.now() < end) {
    const busy = await page.evaluate(() => {
      const b = document.querySelector('#ur-loading, .lsBusyIndicator, .urBusyIndicator, [id$="-busy"]')
      if (!b) return false
      const r = b.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'
    }).catch(() => false)
    if (!busy) break
    await sleep(250)
  }
  await sleep(ms)
}

export async function captureDom(page, target) {
  return page.evaluate((target) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) return null; if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return null; return r }
    const labelOf = (el) => el.getAttribute('title') || el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || el.getAttribute('placeholder') || ''
    const out = []
    const push = (el, k) => { const r = vis(el); if (!r || out.length >= 450) return; out.push({ i: out.length, k, id: el.id || '', t: (labelOf(el) || (k !== 'input' ? el.textContent : '') || '').trim().replace(/\s+/g, ' ').slice(0, 90), v: 'value' in el && el.type !== 'password' ? String(el.value).slice(0, 80) : el.getAttribute('aria-checked') || '', ro: el.readOnly || el.getAttribute('aria-readonly') === 'true' || false, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }) }
    document.querySelectorAll('input:not([type=hidden]), textarea, select').forEach((el) => push(el, 'input'))
    document.querySelectorAll('[role=button], button, .lsButton').forEach((el) => push(el, 'button'))
    document.querySelectorAll('[role=tab]').forEach((el) => push(el, 'tab'))
    document.querySelectorAll('[role=checkbox], [role=radio]').forEach((el) => push(el, 'check'))
    document.querySelectorAll('[role=treeitem]').forEach((el) => push(el, 'tree'))
    return { els: out, target: target || null, title: document.title }
  }, target || null)
}

export async function statusbar(page) {
  return page.evaluate(() => {
    const cands = [...document.querySelectorAll('[id*="sbar"], [id*="Sbar"], .lsMessageBar, .urMsgBarTxt, [role=status]')]
    const t = cands.map((el) => (el.innerText || el.textContent || '').trim()).filter(Boolean)
    return (t.sort((a, b) => b.length - a.length)[0] || '').replace(/\s+/g, ' ').slice(0, 400)
  }).catch(() => '')
}

export async function popupText(page) {
  return page.evaluate(() => {
    const p = [...document.querySelectorAll('[role=dialog], .lsPopupWindow, .urPWFloatLeft')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && el.id !== 'sysInfoAreaMenu' && el.getAttribute('role') !== 'menu' })
    return p.map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 600)
  }).catch(() => '')
}

export async function isLoginPage(page) {
  return page.evaluate(() => !!document.querySelector('input[name="sap-password"], #sap-password')).catch(() => false)
}

export async function login(page, { host, client, user, password }) {
  await page.goto(webgui(host, client), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await settle(page, 800)
  if (!(await isLoginPage(page))) return { ok: true, note: 'session already active' }
  const u = page.locator('input[name="sap-user"], #sap-user').first()
  const p = page.locator('input[name="sap-password"], #sap-password').first()
  await u.click(); await u.fill(user)
  await p.click(); await p.fill(password)
  await page.keyboard.press('Enter')
  await settle(page, 1500)
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000))
  if (/already logged on|bereits angemeldet/i.test(text)) {
    const opt = page.getByText(/without ending any other logons|ohne andere Anmeldungen/i).first()
    if (await opt.count()) { await opt.click(); await clickButton(page, [/^Continue$/i, /Weiter/i, /^OK$/i]); await settle(page, 1500) } else return { ok: false, needsHuman: true, reason: 'SAP reports this user is already logged on. Pick an option on the canvas.' }
  }
  if (/new password|neues Kennwort|password.*(expired|change)/i.test(text) && (await page.locator('input[type=password]').count()) > 1) return { ok: false, needsHuman: true, reason: 'SAP requires a password change. Set the new password on the canvas, then press continue.' }
  if (await isLoginPage(page)) {
    const msg = await statusbar(page) || (await page.evaluate(() => document.querySelector('.lsMessageArea, [role=alert], .urMsgBarTxt')?.innerText || '').catch(() => ''))
    return { ok: false, reason: `Login rejected: ${msg || 'unknown reason'}` }
  }
  return { ok: true }
}

export async function gotoTxn(page, ctx, code) {
  page.once('dialog', (d) => d.accept().catch(() => {}))
  await page.goto(webgui(ctx.host, ctx.client, code), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await settle(page, 1500)
  if (await isLoginPage(page)) {
    const r = await login(page, ctx)
    if (!r.ok) return r
    await page.goto(webgui(ctx.host, ctx.client, code), { waitUntil: 'domcontentloaded', timeout: 60000 })
    await settle(page, 1500)
  }
  const sb = await statusbar(page)
  if (/not authorized|keine Berechtigung|does not exist/i.test(sb)) return { ok: false, reason: sb }
  return { ok: true, statusbar: sb }
}

const reOf = (x) => (x instanceof RegExp ? x : new RegExp(`^\\s*${String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))

const subOf = (x) => new RegExp(String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

export async function findByLabel(page, labels, kinds = ['input'], nth = 0) {
  const els = (await captureDom(page)).els.filter((e) => kinds.includes(e.k))
  for (const mk of [reOf, subOf]) {
    for (const l of labels) { const re = mk(l); const hits = els.filter((e) => re.test(e.t) && !e.ro); if (hits[nth]) return hits[nth] }
  }
  for (const l of labels) { const re = reOf(l); const hits = els.filter((e) => re.test(e.t)); if (hits[nth]) return hits[nth] }
  return null
}

export async function clickTitle(page, names) {
  for (const n of names) {
    const hit = await page.evaluate((src) => { const re = new RegExp(src, 'i'); const e = [...document.querySelectorAll('[title]')].map((x) => ({ x, r: x.getBoundingClientRect() })).find(({ x, r }) => r.width > 0 && r.height > 0 && re.test(x.getAttribute('title') || '')); return e ? { x: e.r.left + e.r.width / 2, y: e.r.top + e.r.height / 2, t: e.x.getAttribute('title') } : null }, `^\\s*${String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    if (hit) { await page.mouse.click(hit.x, hit.y); await settle(page, 1200); return hit }
  }
  return null
}

export async function headerValues(page) {
  return page.evaluate(() => [...document.querySelectorAll('input')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 100 && r.top < 280 && r.width > 20 && r.left > 300 && !/\[\d+,\d+\]/.test(e.id) }).map((e) => e.value.trim()))
}

export async function openProjectFromWorklist(page, project) {
  const exact = new RegExp(`^\\s*${project.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`)
  const end = Date.now() + 25000
  while (Date.now() < end) {
    if ((await page.title()).includes(project)) return true
    const loc = page.locator('tr[id*="mrss-cont-none-Row"] td, td, span').filter({ hasText: exact })
    const n = await loc.count()
    for (let i = 0; i < n; i++) {
      const box = await loc.nth(i).boundingBox().catch(() => null)
      if (!box || box.width < 4 || box.height < 4) continue
      await page.mouse.dblclick(box.x + Math.min(box.width / 2, 30), box.y + box.height / 2)
      const t = Date.now() + 15000
      while (Date.now() < t) { await sleep(700); if ((await page.title()).includes(project)) { await settle(page, 1500); return true } }
      break
    }
    await sleep(1000)
  }
  return (await page.title()).includes(project)
}

async function altTreeRows(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('[id^="tree#"]')]
    const by = new Map()
    for (const e of els) {
      const m = e.id.match(/^tree#(C\d+)#(\d+)#(.*)$/)
      if (!m) continue
      const key = `${m[1]}#${m[2]}`
      const o = by.get(key) || { pre: `tree#${m[1]}`, row: m[2], cols: [] }
      const r = e.getBoundingClientRect()
      const txt = (e.getAttribute('title') || e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim()
      if (m[3] === 'ni') { o.kind = txt; o.ix = r.left }
      else o.cols.push({ id: e.id, tech: /TECH_KEY/i.test(m[3]), txt, x: r.left })
      by.set(key, o)
    }
    const rows = [...by.values()].filter((o) => o.kind != null && o.cols.length)
    const ctl = new Map()
    for (const o of rows) { const c = o.pre; if (!ctl.has(c)) ctl.set(c, []); ctl.get(c).push(o) }
    const proj = [...ctl.values()].find((list) => list.some((o) => /Project Definition|WBS Element|Network/i.test(o.kind))) || []
    const xs = [...new Set(proj.map((o) => Math.round(o.ix ?? 0)))].sort((a, b) => a - b)
    let net = ''
    return proj.sort((a, b) => +a.row - +b.row).map((o) => {
      const tech = o.cols.find((c) => c.tech)
      const text = o.cols.filter((c) => !c.tech).sort((a, b) => a.x - b.x)[0]
      let ident = tech ? tech.txt : ''
      if (/Network header/i.test(o.kind) && /^\d{5,}$/.test(ident)) net = ident
      if (/Network Activity|Activity/i.test(o.kind) && !/WBS/i.test(o.kind) && /^\d{4}$/.test(ident) && net) ident = `${net} ${ident}`
      return { pre: o.pre, row: o.row, iidx: o.row, alt: true, sel: text ? text.id : tech?.id, kind: o.kind, lv: String(Math.max(0, xs.indexOf(Math.round(o.ix ?? 0)))), text: text ? text.txt : '', ident }
    })
  })
}

export async function expandProjectTree(page) {
  const alt = await page.evaluate(() => !document.querySelector('tr[id*="mrss-cont-none-Row"]') && !!document.querySelector('[id^="tree#"]')).catch(() => false)
  if (alt) {
    const btn = await page.evaluate(() => { const e = [...document.querySelectorAll('[title="Expand All"]')].map((x) => ({ x, r: x.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.top > 100 && r.left < 500).sort((a, b) => a.r.top - b.r.top)[0]; return e ? { x: e.r.left + e.r.width / 2, y: e.r.top + e.r.height / 2 } : null }).catch(() => null)
    if (btn) { await page.mouse.click(btn.x, btn.y); await settle(page, 1200); return 1 }
    return 0
  }
  let clicks = 0
  for (let i = 0; i < 60; i++) {
    const ex = await page.evaluate(() => {
      const root = [...document.querySelectorAll('tr[id*="mrss-cont-none-Row"]')].find((r) => /^P\/\S+$/.test((r.textContent || '').trim()))
      if (!root) return null
      const prefix = root.id.split('-mrss')[0]
      const rowOf = (x) => { let n = x; while (n && !(n.tagName === 'TR' && /-mrss-cont-left-Row-\d+$/.test(n.id || ''))) n = n.parentElement; return n }
      const ok = (x) => { const tr = rowOf(x); if (!tr || !tr.id.startsWith(`${prefix}-mrss`)) return false; const r = document.getElementById(tr.id.replace('-cont-left-', '-cont-none-')); return !!r && !!(r.textContent || '').trim() && (x.closest('td[lsdata]')?.getAttribute('lsdata') || '').includes('COLLAPSED') }
      const e = [...document.querySelectorAll('span[title="Expand Node"]')].filter(ok).pop()
      if (!e) return null
      e.scrollIntoView({ block: 'center' })
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    if (!ex) break
    await page.mouse.click(ex.x, ex.y); await settle(page, 900); clicks++
  }
  return clicks
}

export async function treeRows(page) {
  const main = await mrssTreeRows(page)
  if (main.some((r) => r.ident)) return main
  const alt = await altTreeRows(page).catch(() => [])
  return alt.some((r) => r.ident || r.text) ? alt : main
}

export function pickTreeRow(rows, { ident, act, text, level }) {
  const match = (r) => (ident ? r.ident === ident : act ? new RegExp(`^(\\d{5,} )?${act}$`).test(r.ident) && (!r.alt || !/WBS|Project Definition/i.test(r.kind || '')) : r.text.includes(text))
  const exact = rows.find((r) => match(r) && (level == null || r.lv === String(level)))
  if (exact || level == null) return exact
  const same = rows.filter(match)
  if (!same.length) return undefined
  if (level === 0) return same.find((r) => /Project Definition/i.test(r.kind || '')) || same[0]
  return same.find((r) => r.kind ? !/Project Definition/i.test(r.kind) : false) || same[Math.min(level, same.length - 1)]
}

async function mrssTreeRows(page) {
  return page.evaluate(() => {
    const L = [...document.querySelectorAll('tr[id*="mrss-cont-left-Row"]')]
    const R = [...document.querySelectorAll('tr[id*="mrss-cont-none-Row"]')]
    return L.map((l) => { const pre = l.id.split('-mrss')[0]; const idx = l.id.split('-Row-')[1]; const r = document.getElementById(`${pre}-mrss-cont-none-Row-${idx}`) || R.find((x) => x.id.startsWith(pre) && x.getAttribute('iidx') === l.getAttribute('iidx')); const lv = l.querySelector('td[lv]'); const t = [...l.querySelectorAll('.lsTextView')].map((x) => (x.innerText || x.textContent || '').trim()).find(Boolean); return { pre, row: idx, iidx: l.getAttribute('iidx'), lv: lv ? lv.getAttribute('lv') : '', text: (t || l.textContent || '').replace(/\s+/g, ' ').trim().replace(/^Level \d+( Expanded| Collapsed)?/, '').trim(), ident: r ? (r.innerText || r.textContent || '').replace(/\s+/g, ' ').trim() : '' } }).filter((o) => o.text || o.ident)
  })
}

export async function selectTreeObject(page, { ident, act, text, level }) {
  await expandProjectTree(page)
  const rows = await treeRows(page)
  const hit = pickTreeRow(rows, { ident, act, text, level })
  if (!hit) return { ok: false, reason: `Tree object ${ident || act || text} not found (${rows.length} tree rows read${rows.length ? `: ${rows.slice(0, 6).map((r) => r.ident || r.text).join(', ')}` : ''})`, rows }
  const want = act || (ident && ident.split(' ').pop()) || null
  if (hit.alt) return selectAltRow(page, hit, rows, { want, text })
  const where = (h) => page.evaluate(({ pre, row }) => { const l = document.getElementById(`${pre}-mrss-cont-left-Row-${row}`); if (!l) return null; l.scrollIntoView({ block: 'center' }); const t = l.querySelector('.lsTextView') || l; const r = t.getBoundingClientRect(); let top = 0, bottom = innerHeight; for (let n = l.parentElement; n; n = n.parentElement) { const s = getComputedStyle(n); if (/hidden|auto|scroll|clip/.test(s.overflowY)) { const b = n.getBoundingClientRect(); if (b.height > 40) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom) } } } const y = r.top + r.height / 2; return { x: r.left + Math.min(20, r.width / 2), y, visible: r.height > 0 && y > top + 2 && y < bottom - 2 } }, h)
  const collapseOthers = () => page.evaluate(({ pre, row }) => { const target = +row; const rows = [...document.querySelectorAll(`tr[id^="${pre}-mrss-cont-left-Row-"]`)].map((l) => ({ l, i: +l.id.split('-Row-')[1], lv: +(l.querySelector('td[lv]')?.getAttribute('lv') ?? 9) })); const lv1 = rows.filter((r) => r.lv === 1).sort((a, b) => a.i - b.i); const own = lv1.filter((r) => r.i <= target).pop(); const c = lv1.filter((r) => r !== own).map((r) => r.l.querySelector('span[title="Collapse Node"]')).find(Boolean); if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, hit)
  let hdr = []
  for (let attempt = 0; attempt < 4; attempt++) {
    let cur = (await treeRows(page)).find((r) => r.ident === hit.ident && r.text === hit.text) || hit
    await where(cur); await sleep(700)
    let pos = await where(cur)
    for (let k = 0; pos && pos.y < 1 && k < 8; k++) {
      const tb = await page.evaluate((pre) => { const e = document.getElementById(`${pre}-mrss-cont-left`); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, cur.pre)
      if (!tb) break
      const dir = await page.evaluate(({ pre, row }) => { const v = [...document.querySelectorAll(`tr[id^="${pre}-mrss-cont-left-Row-"]`)].filter((l) => l.getBoundingClientRect().height > 0).map((l) => +l.id.split('-Row-')[1]); return v.length && +row < Math.min(...v) ? -1 : 1 }, cur)
      await page.mouse.move(tb.x, tb.y); await page.mouse.wheel(0, 400 * dir); await settle(page, 900)
      cur = (await treeRows(page)).find((r) => r.ident === hit.ident && r.text === hit.text) || cur
      pos = await where(cur)
    }
    for (let k = 0; pos && !pos.visible && k < 6; k++) {
      Object.assign(hit, cur)
      const c = await collapseOthers()
      if (!c) break
      await page.mouse.click(c.x, c.y); await settle(page, 1200)
      cur = (await treeRows(page)).find((r) => r.ident === hit.ident && r.text === hit.text) || cur
      pos = await where(cur)
    }
    if (!pos) break
    await page.mouse.click(pos.x, pos.y); await settle(page, 1500)
    hdr = await headerValues(page)
    if (!want || hdr.includes(want)) break
  }
  if (want && !hdr.includes(want)) return { ok: false, reason: `Clicked tree row but header shows ${hdr.join(' / ') || 'nothing'}, expected ${want}` }
  if (text && !hdr.some((h) => h.includes(text.slice(0, 20)))) return { ok: false, reason: `Header shows ${hdr.join(' / ')}, expected ${text}` }
  const net = rows.map((r) => r.ident.match(/^(\d{5,}) \d{4}$/)).find(Boolean)
  return { ok: true, hit, header: hdr, network: net ? net[1] : null }
}

async function selectAltRow(page, hit, rows, { want, text }) {
  let hdr = []
  for (let attempt = 0; attempt < 4; attempt++) {
    const pos = await page.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return r.height > 0 ? { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 } : null }, hit.sel)
    if (!pos) { await expandProjectTree(page); const again = (await treeRows(page)).find((r) => r.ident === hit.ident && r.text === hit.text && r.kind === hit.kind); if (again) Object.assign(hit, again); continue }
    await sleep(300)
    await page.mouse.click(pos.x, pos.y); await settle(page, 1500)
    hdr = await headerValues(page)
    if (!want || hdr.includes(want)) break
  }
  if (want && !hdr.includes(want)) return { ok: false, reason: `Clicked tree row but header shows ${hdr.join(' / ') || 'nothing'}, expected ${want}` }
  if (text && !hdr.some((h) => h.includes(text.slice(0, 20)))) return { ok: false, reason: `Header shows ${hdr.join(' / ')}, expected ${text}` }
  const net = rows.map((r) => r.ident.match(/^(\d{5,}) \d{4}$/) || (/Network header/i.test(r.kind || '') && r.ident.match(/^(\d{5,})$/))).find(Boolean)
  return { ok: true, hit, header: hdr, network: net ? net[1] : null }
}

export async function projectBuilderWelcome(page) {
  const done = []
  for (let k = 0; k < 4; k++) {
    const t = await popupText(page)
    if (!t) break
    if (/Welcome to the Project Builder|Project Builder: Options/i.test(t)) {
      const skip = (await captureDom(page)).els.find((e) => e.k === 'check' && /Skip this in future/i.test(e.t))
      if (skip && skip.v !== 'true') { await page.mouse.click(skip.x + 6, skip.y + skip.h / 2); await sleep(600) }
      const b = await clickTitle(page, ['Set options']) || await clickButton(page, [/Set options/i, /^Continue/i])
      if (!b) await page.keyboard.press('Enter')
      await settle(page, 1500); done.push('welcome dialog: skip ticked, options set'); continue
    }
    if (/User-specific options|Hierarchy levels/i.test(t)) {
      const f = await findByLabel(page, [/Expanded hierarchy levels/i, /Hierarchy levels/i])
      if (f && f.v !== '99') { await typeInto(page, f, '99'); await page.keyboard.press('Tab'); await sleep(500) }
      const b = await clickTitle(page, ['Continue']) || await clickButton(page, [/^Continue/i, /^OK$/i])
      if (!b) await page.keyboard.press('Enter')
      await settle(page, 1500); done.push('user options: hierarchy levels 99'); continue
    }
    break
  }
  return done
}

export async function recoverSession(page, ctx) {
  const notes = []
  const pop = await popupText(page)
  if (/timed out|session.*(expired|ended)|Sitzung/i.test(pop)) {
    const b = await dialogButton(page, ['Reload', 'OK', 'Neu laden'])
    notes.push(b ? `SAP session timeout popup: clicked ${b.t}` : 'SAP session timeout popup seen')
    if (!b) await page.goto(webgui(ctx.host, ctx.client), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    await settle(page, 1500)
  }
  if (await isLoginPage(page)) {
    if (!ctx.password) return { ok: false, notes, reason: 'SAP session ended and no password is held for re-login' }
    const r = await login(page, ctx)
    if (!r.ok) return { ok: false, notes, reason: r.reason }
    notes.push('Logged in again after the SAP session ended')
  }
  return { ok: true, notes }
}

export async function typeInto(page, el, value) {
  await page.mouse.click(el.x + Math.min(el.w - 3, 12), el.y + el.h / 2)
  await sleep(120)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  if (value !== '') await page.keyboard.type(String(value), { delay: 25 })
}

export async function clickButton(page, names) {
  const els = (await captureDom(page)).els.filter((e) => e.k === 'button' || e.k === 'tab')
  for (const n of names) { const re = reOf(n); const hit = els.find((e) => re.test(e.t)); if (hit) { await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2); await settle(page, 900); return hit } }
  return null
}

export async function clickTab(page, names) {
  const els = (await captureDom(page)).els.filter((e) => e.k === 'tab')
  for (const n of names) { const re = reOf(n); const hit = els.find((e) => re.test(e.t)); if (hit) { await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2); await settle(page, 1000); return hit } }
  return null
}

export async function selectNode(page, texts, dbl = false) {
  for (const t of texts) {
    const loc = page.locator('[role=treeitem], [role=gridcell], td, span').filter({ hasText: new RegExp(String(t).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')) })
    const n = await loc.count()
    for (let i = 0; i < Math.min(n, 40); i++) {
      const el = loc.nth(i)
      const box = await el.boundingBox().catch(() => null)
      if (!box || box.width < 4 || box.height < 4) continue
      const txt = (await el.innerText().catch(() => '')).trim()
      if (txt.length > 120) continue
      if (dbl) await page.mouse.dblclick(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2)
      else await page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2)
      await settle(page, 1000)
      return txt
    }
  }
  return null
}

export async function grids(page) {
  return page.evaluate(() => {
    const map = {}
    document.querySelectorAll('[id*="["]').forEach((el) => {
      const m = el.id.match(/^(.*)\[(\d+),(\d+)\](_c)?$/)
      if (!m || m[4] || m[2] === '0') return
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      const g = (map[m[1]] = map[m[1]] || { id: m[1], cells: {}, rows: new Set(), cols: {} })
      const row = +m[2], col = +m[3]
      g.rows.add(row)
      g.cols[col] = g.cols[col] || { x: r.left + r.width / 2, w: r.width }
      const inner = el.querySelector('input') || el
      g.cells[`${row},${col}`] = { v: ('value' in inner ? inner.value : el.innerText || '').trim(), x: r.left, y: r.top, w: r.width, h: r.height, checked: el.querySelector('[aria-checked]')?.getAttribute('aria-checked') || el.getAttribute('aria-checked') }
    })
    const headers = [...document.querySelectorAll('[role=columnheader], th')].map((h) => { const r = h.getBoundingClientRect(); return { t: (h.getAttribute('title') || h.innerText || '').replace(/\s+/g, ' ').trim(), l: r.left, rr: r.right, top: r.top } }).filter((h) => h.t && h.rr > h.l)
    return Object.values(map).map((g) => {
      const rows = [...g.rows].sort((a, b) => a - b)
      const colHdr = {}
      Object.keys(g.cols).forEach((c) => { const h = document.getElementById(`${g.id}[0,${c}]`); const t = h && (h.getAttribute('title') || h.innerText || '').replace(/\s+/g, ' ').trim(); if (t) colHdr[c] = t })
      Object.entries(g.cols).forEach(([c, info]) => { if (colHdr[c]) return; const firstRow = rows.find((r) => g.cells[`${r},${c}`]); const top = firstRow != null ? g.cells[`${firstRow},${c}`].y : 0; const h = headers.filter((h) => h.l <= info.x && h.rr >= info.x && h.top < top).sort((a, b) => b.top - a.top)[0]; if (h) colHdr[c] = h.t })
      return { id: g.id, rows, cols: Object.keys(g.cols).map(Number).sort((a, b) => a - b), colHdr, cells: g.cells }
    }).sort((a, b) => b.rows.length * b.cols.length - a.rows.length * a.cols.length)
  })
}

export function resolveColumns(grid, spec, fallback) {
  const out = {}
  for (const [key, names] of Object.entries(spec)) {
    const hit = grid.cols.find((c) => names.some((n) => reOf(n).test(grid.colHdr[c] || '')))
    if (hit != null) out[key] = hit
    else if (fallback && fallback[key] != null && grid.cols.includes(fallback[key])) out[key] = fallback[key]
  }
  return out
}

export async function writeCell(page, gridId, row, col, value) {
  const id = `${gridId}[${row},${col}]`
  const res = await page.evaluate(({ id }) => {
    const el = document.getElementById(id)
    if (!el) return null
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    const tw = document.getElementById(`${id}_c`)
    const chk = tw?.getAttribute('aria-checked') != null ? tw : el.querySelector('[aria-checked]') || (el.getAttribute('aria-checked') != null ? el : null)
    const cr = chk ? chk.getBoundingClientRect() : r
    return { x: chk ? cr.left + cr.width / 2 : r.left + Math.min(r.width / 3, 20), y: cr.top + cr.height / 2, checked: chk ? chk.getAttribute('aria-checked') : null }
  }, { id })
  if (!res) return { ok: false, reason: `cell ${id} not in DOM` }
  if (typeof value === 'boolean') {
    if ((res.checked === 'true') !== value) { await page.mouse.click(res.x, res.y); await sleep(250) }
    return { ok: true }
  }
  await page.mouse.click(res.x, res.y)
  await sleep(150)
  const twin = await page.evaluate(({ id }) => { const t = document.getElementById(`${id}_c`); if (!t) return null; const r = t.getBoundingClientRect(); return r.width > 2 ? { x: r.left + Math.min(r.width / 3, 20), y: r.top + r.height / 2 } : null }, { id })
  if (twin) { await page.mouse.click(twin.x, twin.y); await sleep(100) }
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(String(value), { delay: 20 })
  await page.keyboard.press('Tab')
  await sleep(120)
  return { ok: true }
}

export async function readCell(page, gridId, row, col) {
  return page.evaluate(({ id }) => { const el = document.getElementById(id); if (!el) return null; const i = el.querySelector('input') || document.getElementById(`${id}_c`) || el; return ('value' in i ? i.value : i.innerText || '').trim() }, { id: `${gridId}[${row},${col}]` })
}

export async function clickMenu(page, path) {
  const items = () => page.evaluate(() => [...document.querySelectorAll('[role=menuitem], [role=menuitemcheckbox]')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.replace(/\s+/g, ' ').trim(), x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, w: r.width, top: r.top, left: r.left, dis: e.getAttribute('aria-disabled') === 'true' } }).filter((o) => o.w > 0 && o.top > -1000))
  const mb = await page.evaluate(() => { const e = document.getElementById('cua2sapmenu_btn') || [...document.querySelectorAll('[role=button]')].find((x) => /^Menu/.test((x.innerText || '').trim()) && x.getBoundingClientRect().top < 90); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (!mb) return { ok: false, reason: 'menu button not found' }
  await page.mouse.click(mb.x, mb.y); await sleep(1400)
  let minLeft = -1, prev = null
  for (const [i, item] of path.entries()) {
    const re = new RegExp(`^\\s*${item}`, 'i')
    let it = null
    for (let k = 0; k < 6 && !it; k++) { it = (await items()).filter((o) => o.left > minLeft && re.test(o.t)).pop(); if (!it) await sleep(500) }
    if (!it) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); return { ok: false, reason: `menu item "${item}" not available${prev ? ` under ${prev}` : ''} (select the right tree node first)` } }
    if (it.dis) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); return { ok: false, reason: `menu item "${it.t}" is disabled` } }
    if (i < path.length - 1) {
      if (prev) await page.mouse.move(it.x - 30, it.y, { steps: 4 })
      await page.mouse.move(it.x, it.y, { steps: 5 }); await sleep(1600)
      await page.mouse.move(it.left + it.w - 12, it.y, { steps: 6 }); await sleep(400)
      minLeft = it.left + 20
    } else {
      await page.mouse.move(it.x, it.y, { steps: 5 }); await sleep(300)
      await page.mouse.click(it.x, it.y)
    }
    prev = it.t
  }
  await settle(page, 2500)
  return { ok: true }
}

export async function dialogButton(page, names) {
  for (const n of names) {
    const hit = await page.evaluate((src) => { const re = new RegExp(`^\\s*${src}\\s*$`, 'i'); const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getBoundingClientRect().width > 0).pop(); if (!d) return null; const e = [...d.querySelectorAll('*')].find((x) => x.children.length <= 1 && re.test(x.textContent || '') && x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: e.textContent.trim() } }, String(n))
    if (hit) { await page.mouse.click(hit.x, hit.y); await settle(page, 1500); return hit }
  }
  return null
}

export async function dialogPickRow(page, text) {
  const hit = await page.evaluate((t) => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getBoundingClientRect().width > 0).pop(); if (!d) return null; const e = [...d.querySelectorAll('td, span')].find((x) => x.children.length === 0 && x.textContent.trim() === t && x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 } }, text)
  if (!hit) return false
  await page.mouse.dblclick(hit.x, hit.y); await settle(page, 2000)
  return true
}

export async function handlePopups(page, prefer = [/^Yes$/i, /^Ja$/i, /^Continue$/i, /^OK$/i, /^Save$/i]) {
  const txt = await popupText(page)
  if (!txt) return null
  const hit = await clickButton(page, prefer) || await dialogButton(page, prefer.map((r) => r.source.replace(/^\^|\$$/g, '')))
  return hit ? { popup: txt, clicked: hit.t } : { popup: txt }
}

export async function cellState(page, gridId, row, col) {
  return page.evaluate((id) => { const t = document.getElementById(`${id}_c`); const e = t || document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); const ck = e.getAttribute('aria-checked'); return { v: ('value' in e ? e.value : e.innerText || '').trim(), checked: ck == null ? null : ck === 'true', x: r.left + r.width / 2, y: r.top + r.height / 2, vis: r.height > 0 } }, `${gridId}[${row},${col}]`)
}

export async function clearOwnLocks(page, ctx) {
  await gotoTxn(page, ctx, 'SM12')
  const f = await findByLabel(page, [/User name/i])
  if (!f) return { ok: false, reason: 'SM12 user field not found' }
  await typeInto(page, f, ctx.user); await page.keyboard.press('F8'); await settle(page, 2500)
  const n = Number(((await statusbar(page)).match(/(\d+) locks? ha/) || [])[1] || 0)
  if (!n) return { ok: true, cleared: 0 }
  const own = await page.evaluate((u) => [...document.querySelectorAll('tr')].filter((r) => r.innerText.includes(u)).length, ctx.user)
  if (own < n) return { ok: false, reason: `SM12 shows locks of other users (${own}/${n}); left untouched` }
  const sel = await page.evaluate(() => { const hs = [...document.querySelectorAll('[role=columnheader]')].filter((h) => h.getBoundingClientRect().width > 0); const h = hs.find((x) => /select all/i.test(x.innerText + (x.getAttribute('title') || '') + (x.getAttribute('aria-label') || ''))) || hs[0]; if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (!sel) return { ok: false, reason: 'SM12 select-all not found' }
  await page.mouse.click(sel.x, sel.y); await settle(page, 800)
  if (!(await clickTitle(page, ['Delete Selected Locks']))) return { ok: false, reason: 'SM12 delete button not found' }
  await settle(page, 1500)
  await dialogButton(page, ['Delete', 'Yes'])
  await typeInto(page, (await findByLabel(page, [/User name/i])), ctx.user); await page.keyboard.press('F8'); await settle(page, 2500)
  const left = Number(((await statusbar(page)).match(/(\d+) locks? ha/) || [])[1] || 0)
  return { ok: left === 0, cleared: n - left, reason: left ? `${left} lock(s) remain` : null }
}

export async function waitPopup(page, re, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) { const t = await popupText(page); if (t && (!re || re.test(t))) return t; await sleep(400) }
  return ''
}

export async function popupInput(page) {
  const r = await page.evaluate(() => {
    const p = [...document.querySelectorAll('[role=dialog], .lsPopupWindow, .urPWFloatLeft')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && el.id !== 'sysInfoAreaMenu' && el.getAttribute('role') !== 'menu' }).pop()
    if (!p) return null
    const i = [...p.querySelectorAll('input')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 20 && b.height > 0 && !x.readOnly && x.type !== 'hidden' && x.type !== 'checkbox' && x.getAttribute('aria-readonly') !== 'true' })
    if (!i) return null
    const b = i.getBoundingClientRect()
    return { x: b.left, y: b.top, w: b.width, h: b.height, v: i.value }
  }).catch(() => null)
  return r
}
