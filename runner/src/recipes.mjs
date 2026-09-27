import { settle, captureDom, statusbar, popupText, findByLabel, typeInto, clickTitle, selectTreeObject, treeRows, expandProjectTree, grids, cellState, dialogButton, dialogPickRow, handlePopups, clickTab } from './sap.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (v) => String(v ?? '').trim()
const num = (v) => norm(v).replace(/[,.]00$/, '').replace(/,/g, '')

export async function gridByField(page, field) {
  return page.evaluate((field) => {
    const e = [...document.querySelectorAll('[id$="_c"]')].find((x) => /\[\d+,\d+\]_c$/.test(x.id) && (x.getAttribute('lsdata') || '').includes(field))
    if (!e) return null
    const m = e.id.match(/^(.*)\[(\d+),(\d+)\]_c$/)
    return { grid: m[1], col: +m[3] }
  }, field)
}

async function gridWithHeader(page, re) {
  const all = await grids(page)
  const g = all.find((g) => Object.values(g.colHdr).some((h) => re.test(h)))
  if (!g) return null
  const colOf = (hre) => { const e = Object.entries(g.colHdr).find(([, h]) => hre.test(h)); return e ? +e[0] : null }
  return { id: g.id, rows: g.rows, colOf }
}

export async function putCell(page, gridId, row, col, value) {
  if (!(await cellState(page, gridId, row, col))) return { ok: false, reason: `cell ${gridId}[${row},${col}] not in DOM` }
  await page.evaluate((id) => document.getElementById(`${id}_c`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), `${gridId}[${row},${col}]`)
  const p = await cellState(page, gridId, row, col)
  await page.mouse.click(p.x, p.y); await sleep(350)
  const q = await cellState(page, gridId, row, col)
  await page.mouse.click(q.x, q.y); await sleep(200)
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace')
  if (value !== '') await page.keyboard.type(String(value), { delay: 35 })
  await page.keyboard.press('Tab'); await sleep(450)
  return { ok: true }
}

async function setCheck(page, gridId, row, col, want) {
  const s = await cellState(page, gridId, row, col)
  if (!s || s.checked == null) return false
  if (s.checked !== want) { await page.mouse.click(s.x, s.y); await sleep(900) }
  return true
}

const checkboxes = (page) => page.evaluate(() => [...document.querySelectorAll('[role=checkbox]')].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('title') || e.getAttribute('aria-label') || '').trim(), ck: e.getAttribute('aria-checked') === 'true', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } }).filter((o) => o.w > 0 && o.x > 300))

async function openOverview(ctx, sel, titles) {
  const r = await selectTreeObject(ctx.page, sel)
  if (!r.ok) return r
  if (r.network) ctx.vars.network = r.network
  const b = await clickTitle(ctx.page, titles)
  if (!b) return { ok: false, reason: `Button ${titles[0]} not found` }
  await settle(ctx.page, 1200)
  return { ok: true, header: r.header }
}

export async function treeSelect(ctx, s) {
  const r = await selectTreeObject(ctx.page, s)
  if (r.ok && r.network) ctx.vars.network = r.network
  return r.ok ? { ok: true, note: `Selected ${r.header.join(' / ')}` } : { ok: false, reason: r.reason }
}

export async function relationsPred(ctx, s) {
  const p = ctx.page
  const o = await openOverview(ctx, { act: s.act }, ['Relationship Overview'])
  if (!o.ok) return o
  const g = await gridWithHeader(p, /Successor indicator/i)
  if (!g) return { ok: false, reason: 'Relationship grid not found' }
  const read = async () => { const out = []; for (let r = 1; r < 40; r++) { const a = await cellState(p, g.id, r, 1); if (!a) continue; const c = await cellState(p, g.id, r, 3); out.push({ r, a: a.v, scs: !!(c && c.checked), vis: a.vis && a.y > 300 && a.y < 700 }) } return out }
  let rows = await read()
  const have = new Set(rows.filter((x) => x.a && !x.scs).map((x) => x.a))
  const todo = s.preds.filter((x) => !have.has(x))
  const log = []
  for (const pred of todo) {
    rows = await read()
    const slot = rows.find((x) => !x.a && x.vis)
    if (!slot) { log.push(`no empty row for ${pred}`); continue }
    await putCell(p, g.id, slot.r, 1, pred)
    if (ctx.vars.network) await putCell(p, g.id, slot.r, 2, ctx.vars.network)
    if ((await cellState(p, g.id, slot.r, 1))?.v !== pred) await putCell(p, g.id, slot.r, 1, pred)
    await p.keyboard.press('Enter'); await settle(p, 2500)
    if (await popupText(p)) await dialogButton(p, ['Cancel'])
    await setCheck(p, g.id, slot.r, 3, false)
    const sb = await statusbar(p)
    if (/error|exist|itself/i.test(sb)) log.push(sb)
    ctx.dirty = true
  }
  rows = await read()
  const now = new Set(rows.filter((x) => x.a && !x.scs).map((x) => x.a))
  const miss = s.preds.filter((x) => !now.has(x))
  if (miss.length) return { ok: false, reason: `${s.act}: predecessors missing after Enter: ${miss.join(', ')}. ${log.join(' ')}` }
  return { ok: true, note: `${s.act} predecessors ${s.preds.join(', ')}${todo.length ? ` (added ${todo.join(', ')})` : ' (already present)'}`, readback: rows.filter((x) => x.a).map((x) => x.a + (x.scs ? 'S' : 'P')).join(',') }
}

export async function psText(ctx, s) {
  const p = ctx.page
  const o = await openOverview(ctx, { ident: s.wbs, level: 1 }, ['PS Text Overview'])
  if (!o.ok) return o
  const f = await gridByField(p, 'PSTX-PSTXTAR')
  if (!f) return { ok: false, reason: 'PS text grid not found' }
  const G = f.grid
  if (norm((await cellState(p, G, 1, 3))?.v) === s.desc) return { ok: true, note: `PS text ${s.desc} already present` }
  await putCell(p, G, 1, 1, s.st)
  await putCell(p, G, 1, 3, s.desc)
  if (/\[1,4\]/.test(await p.evaluate(() => document.activeElement?.id || ''))) await p.keyboard.press('Tab')
  await p.keyboard.press('Control+A'); await p.keyboard.type(s.lang, { delay: 50 }); await p.keyboard.press('Tab'); await sleep(400)
  await p.keyboard.press('Enter'); await settle(p, 3000)
  for (let k = 0; k < 3 && /Text format/.test(await popupText(p)); k++) await dialogPickRow(p, 'SAPScript format')
  if (/Change PS Text/.test(await p.title())) {
    const ed = await p.evaluate(() => { const e = [...document.querySelectorAll('input, [role=textbox]')].map((x) => ({ x, r: x.getBoundingClientRect() })).filter(({ r }) => r.width > 300 && r.top > 150 && r.top < 260)[0]; return e ? { x: e.r.left + 30, y: e.r.top + e.r.height / 2 } : null })
    if (ed) { await p.mouse.click(ed.x, ed.y); await sleep(500) }
    await p.keyboard.type(s.body, { delay: 20 }); await p.keyboard.press('Enter'); await settle(p, 1500)
    await p.keyboard.press('F3'); await settle(p, 2500)
    for (let k = 0; k < 3; k++) { if (!(await popupText(p))) break; await dialogButton(p, ['Yes', 'Ja', 'OK']) }
  }
  const after = await cellState(p, G, 1, 3)
  ctx.dirty = true
  return norm(after?.v) === s.desc ? { ok: true, note: `PS text ${s.desc} (${s.lang}) entered`, statusbar: await statusbar(p) } : { ok: false, reason: `PS text row shows "${after?.v || ''}" after editor` }
}

export async function milestone(ctx, s) {
  const p = ctx.page
  const o = await openOverview(ctx, { act: s.act }, ['Milestone Overview'])
  if (!o.ok) return o
  const f = await gridByField(p, 'MLSTD-MLSTN')
  if (!f) return { ok: false, reason: 'Milestone grid not found' }
  if (norm((await cellState(p, f.grid, 1, 1))?.v) !== s.usage) {
    await putCell(p, f.grid, 1, 1, s.usage)
    await putCell(p, f.grid, 1, 2, s.desc)
    await p.keyboard.press('Enter'); await settle(p, 2500)
    if (await popupText(p)) await dialogButton(p, ['Cancel'])
    ctx.dirty = true
  }
  await expandProjectTree(p)
  const node = (await treeRows(p)).find((r) => r.text === s.desc)
  if (!node) return { ok: false, reason: `Milestone ${s.desc} not in tree after Enter` }
  const sel = await selectTreeObject(p, { ident: node.ident })
  if (!sel.ok) return sel
  const pick = async () => (await checkboxes(p)).filter((c) => s.flags.some((re) => re.test(c.t)))
  const before = await pick()
  if (before.some((c) => !c.ck)) { for (const c of before.filter((c) => !c.ck)) { await p.mouse.click(c.x, c.y); await sleep(700) } await p.keyboard.press('Enter'); await settle(p, 1500); ctx.dirty = true }
  const after = await pick()
  const bad = after.filter((c) => !c.ck)
  if (after.length < s.flags.length || bad.length) return { ok: false, reason: `Flags not set: ${bad.map((c) => c.t).join(', ') || 'checkbox missing'}` }
  return { ok: true, note: `Milestone ${s.usage} ${s.desc} on ${s.act}, flags ${after.map((c) => c.t.slice(0, 24)).join(' / ')}` }
}

export async function activityFields(ctx, s) {
  const p = ctx.page
  const r = await selectTreeObject(p, { act: s.act })
  if (!r.ok) return r
  if (s.fields?.length && !(await findByLabel(p, s.fields[0][0]))) { await clickTitle(p, ['Detail', 'Choose <detail>']); await settle(p, 1200) }
  for (const [labels, v] of s.fields || []) {
    const f = await findByLabel(p, labels)
    if (!f) return { ok: false, reason: `Field ${labels[0]} not found on activity ${s.act}` }
    if (num(f.v) !== String(v)) { await typeInto(p, f, v); await p.keyboard.press('Tab'); await sleep(400); ctx.dirty = true }
  }
  for (const re of s.checks || []) {
    const c = (await checkboxes(p)).find((o) => re.test(o.t))
    if (!c) return { ok: false, reason: `Checkbox ${re.source} not found` }
    if (!c.ck) { await p.mouse.click(c.x, c.y); await sleep(700); ctx.dirty = true }
  }
  await p.keyboard.press('Enter'); await settle(p, 1500)
  const rb = []
  for (const [labels, v] of s.fields || []) { const f = await findByLabel(p, labels); rb.push(`${labels[0]}=${norm(f?.v)}`); if (!f || num(f.v) !== String(v)) return { ok: false, reason: `${labels[0]} reads "${f?.v}" after Enter` } }
  for (const re of s.checks || []) { const c = (await checkboxes(p)).find((o) => re.test(o.t)); rb.push(`${c?.t}=${c?.ck}`); if (!c?.ck) return { ok: false, reason: `${re.source} not ticked after Enter` } }
  return { ok: true, note: `Activity ${s.act}: ${rb.join(', ')}`, readback: rb.join(', ') }
}

export async function confirmActivity(ctx, s) {
  const p = ctx.page
  const net = s.network || ctx.vars.network
  if (!net) return { ok: false, reason: 'Network number unknown. Run a Project Builder step first or type it on the canvas.' }
  const o = await findByLabel(p, ['Order Number']); const a = await findByLabel(p, ['Activity Number'])
  if (!o || !a) return { ok: false, reason: 'CN25 initial screen fields not found' }
  await typeInto(p, o, net); await p.keyboard.press('Tab')
  await typeInto(p, a, s.act); await p.keyboard.press('Tab')
  await p.keyboard.press('Enter'); await settle(p, 3000)
  const els = () => captureDom(p).then((d) => d.els)
  let e = await els()
  const aw = e.find((x) => x.k === 'input' && /^Actual Work$/i.test(x.t))
  if (!aw) return { ok: false, reason: 'Actual Work field not found in confirmation dialog' }
  for (const re of [/Partial\/Final Confirmation/i, /No Remaining Work Expected/i]) { const c = e.find((x) => x.k === 'check' && re.test(x.t)); if (c && c.v === 'true') { await p.mouse.click(c.x + c.w / 2, c.y + c.h / 2); await sleep(700) } }
  e = await els()
  for (const d of e.filter((x) => x.k === 'input' && Math.abs(x.y - aw.y) < 6 && /\d{2}\/\d{2}\/\d{4}/.test(x.v))) { await typeInto(p, d, ''); await p.keyboard.press('Tab'); await sleep(250) }
  await typeInto(p, aw, s.actual); await p.keyboard.press('Tab'); await sleep(400)
  await p.keyboard.press('Enter'); await settle(p, 2500)
  e = await els()
  const rem = e.find((x) => x.k === 'input' && /^Remaining Work$/i.test(x.t))
  const act = e.find((x) => x.k === 'input' && /^Actual Work$/i.test(x.t))
  if (norm(rem?.v) !== `${s.remaining}.0` || norm(act?.v) !== `${s.actual}.0`) return { ok: false, reason: `After Enter: actual ${act?.v}, remaining ${rem?.v}` }
  ctx.dirty = true
  return { ok: true, note: `Actual ${act.v} h, remaining ${rem.v} h`, readback: `${act.v}/${rem.v}` }
}

export async function confirmSave(ctx) {
  const p = ctx.page
  if (!(await dialogButton(p, ['Save']))) await p.keyboard.press('Control+S')
  await settle(p, 3000)
  const sb = await statusbar(p)
  return /saved/i.test(sb) ? { ok: true, note: sb, statusbar: sb } : { ok: false, reason: `Confirmation save not confirmed: "${sb}"` }
}

export async function costReport(ctx, s) {
  const p = ctx.page
  if (/Database prof/i.test(await popupText(p))) { const f = await findByLabel(p, ['Database prof', 'Profile']); if (f) { await typeInto(p, f, 'GL01000'); await p.keyboard.press('Enter'); await settle(p, 2000) } }
  const y = new Date().getFullYear()
  const fill = [[['Project definition'], 0, s.project], [['Controlling Area'], 0, s.coArea], [['Version'], 0, '0'], [['Fiscal Year'], 0, String(y)], [['Fiscal Year'], 1, String(y + 1)], [['Period Block', 'Period'], 0, '1'], [['Period Block', 'Period'], 1, '12']]
  for (const [labels, n, v] of fill) { const f = await findByLabel(p, labels, ['input'], n); if (!f) return { ok: false, reason: `Selection field ${labels[0]} #${n + 1} not found` }; await typeInto(p, f, v); await p.keyboard.press('Tab'); await sleep(200) }
  await p.keyboard.press('F8'); await settle(p, 5000)
  const text = await p.evaluate(() => document.body.innerText)
  const nums = ((text.match(/All Cost Elements[\s\S]{0,200}/) || [''])[0].match(/[\d,]+\.\d{2}/g)) || []
  if (s.expect && !text.includes(s.expect)) return { ok: false, reason: `Expected ${s.expect} on the report. Totals seen: ${nums.join(' | ') || 'none'}` }
  return { ok: true, note: `Report totals Actual/Commitment/Total/Plan: ${nums.slice(0, 4).join(' / ') || 'not parsed'}`, readback: nums.slice(0, 4).join(' / ') }
}

export async function extService(ctx, s) {
  const p = ctx.page
  const o = await openOverview(ctx, { ident: ctx.vars.network || s.network }, ['Activity Overview'])
  if (!o.ok) return o
  if (!(await clickTab(p, ['Ext. Processing', 'External Processing']))) return { ok: false, reason: 'External processing tab not found' }
  const g = await gridWithHeader(p, /Purch|Info Rec/i)
  if (!g) return { ok: false, reason: 'External processing grid not found' }
  for (let r = 1; r < 20; r++) { const a = await cellState(p, g.id, r, 1); if (a && a.v === s.act) { const c = await cellState(p, g.id, r, 2); if (c?.checked) return { ok: true, note: `${s.act} already exists with service flag` } } }
  await putCell(p, g.id, 1, 1, s.act)
  await setCheck(p, g.id, 1, 2, true)
  await putCell(p, g.id, 1, 3, s.desc)
  await p.keyboard.press('Enter'); await settle(p, 3000)
  if (!/Service Specifications/.test(await p.title())) return { ok: false, reason: `Service specification screen not opened (${await p.title()})` }
  const sg = await gridWithHeader(p, /Gross Price/i)
  if (!sg) return { ok: false, reason: 'Service lines grid not found' }
  const c = { text: sg.colOf(/Short Text/i) || 4, qty: sg.colOf(/Quantity/i) || 5, un: sg.colOf(/^Un/i) || 6, price: sg.colOf(/Gross Price/i) || 7 }
  for (const [i, l] of s.lines.entries()) { await putCell(p, sg.id, i + 1, c.text, l.text); await putCell(p, sg.id, i + 1, c.qty, l.qty); await putCell(p, sg.id, i + 1, c.un, l.unit); await putCell(p, sg.id, i + 1, c.price, l.price) }
  await p.keyboard.press('Enter'); await settle(p, 2500)
  const tv = await findByLabel(p, ['Total Value'])
  await p.keyboard.press('F3'); await settle(p, 3000)
  if (await popupText(p)) await dialogButton(p, ['Yes', 'OK'])
  ctx.dirty = true
  return { ok: true, note: `${s.act} service lines entered, total value ${tv?.v || '?'}` }
}

export async function saveProject(ctx, s) {
  const p = ctx.page
  await p.keyboard.press('Control+S'); await settle(p, 4000)
  for (let i = 0; i < 4; i++) { const t = await popupText(p); if (!t) break; if (/Network number|Search and Select/.test(t)) await dialogButton(p, ['Cancel']); else if (!(await handlePopups(p, [/^Yes$/i, /^Ja$/i, /^Save$/i, /^Continue$/i, /^OK$/i]))?.clicked) await p.keyboard.press('Enter'); await settle(p, 1500) }
  const sb = await statusbar(p)
  const wrote = ctx.dirty
  ctx.dirty = false
  if (new RegExp(s.expect || 'saved|being changed|created|posted', 'i').test(sb)) return { ok: true, note: `Saved: ${sb}`, statusbar: sb }
  if (/data not changed|no changes/i.test(sb) && !wrote) return { ok: true, note: `Nothing to save, SAP already holds the data (${sb})`, statusbar: sb }
  return { ok: false, reason: `Save not confirmed. Status bar: "${sb || 'empty'}"` }
}

export const RECIPES = { treeSelect, relationsPred, psText, milestone, activityFields, confirmActivity, confirmSave, costReport, extService, saveProject }
