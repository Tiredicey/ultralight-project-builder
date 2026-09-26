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
    const p = [...document.querySelectorAll('[role=dialog], .lsPopupWindow, .urPWFloatLeft')].filter((el) => el.getBoundingClientRect().width > 0)
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

export async function findByLabel(page, labels, kinds = ['input']) {
  const els = (await captureDom(page)).els.filter((e) => kinds.includes(e.k))
  for (const l of labels) { const re = reOf(l); const hit = els.find((e) => re.test(e.t) && !e.ro); if (hit) return hit }
  for (const l of labels) { const re = reOf(l); const hit = els.find((e) => re.test(e.t)); if (hit) return hit }
  return null
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
      if (!m || m[4]) return
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
      Object.entries(g.cols).forEach(([c, info]) => { const firstRow = rows.find((r) => g.cells[`${r},${c}`]); const top = firstRow != null ? g.cells[`${firstRow},${c}`].y : 0; const h = headers.filter((h) => h.l <= info.x && h.rr >= info.x && h.top < top).sort((a, b) => b.top - a.top)[0]; if (h) colHdr[c] = h.t })
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
    const chk = el.querySelector('[aria-checked]') || (el.getAttribute('aria-checked') != null ? el : null)
    return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2, checked: chk ? chk.getAttribute('aria-checked') : null }
  }, { id })
  if (!res) return { ok: false, reason: `cell ${id} not in DOM` }
  if (typeof value === 'boolean') {
    if ((res.checked === 'true') !== value) { await page.mouse.click(res.x, res.y); await sleep(250) }
    return { ok: true }
  }
  await page.mouse.click(res.x, res.y)
  await sleep(150)
  const twin = await page.evaluate(({ id }) => { const t = document.getElementById(`${id}_c`); if (!t) return null; const r = t.getBoundingClientRect(); return r.width > 2 ? { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 } : null }, { id })
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
  const menuBtn = await clickButton(page, [/^More$/i, /^Menu$/i, /Mehr/i])
  if (!menuBtn) return { ok: false, reason: 'menu button not found' }
  for (const item of path) {
    const loc = page.locator('[role=menuitem], [role=menuitemcheckbox], .lsMnuItem, tr[ct="MI"]').filter({ hasText: new RegExp(`^\\s*${item}`, 'i') }).first()
    if (!(await loc.count())) return { ok: false, reason: `menu item "${item}" not found` }
    await loc.hover().catch(() => {})
    await loc.click()
    await sleep(500)
  }
  await settle(page, 1200)
  return { ok: true }
}

export async function handlePopups(page, prefer = [/^Yes$/i, /^Ja$/i, /^Continue$/i, /^OK$/i, /^Save$/i]) {
  const txt = await popupText(page)
  if (!txt) return null
  const hit = await clickButton(page, prefer)
  return hit ? { popup: txt, clicked: hit.t } : { popup: txt }
}
