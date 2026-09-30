const plan = pack.planFor(ctx.user, TASKS)
const out = []
const revive = (a = {}) => ({ ...a, flags: a.flags?.map((f) => new RegExp(f, 'i')), checks: a.checks?.map((f) => new RegExp(f, 'i')) })
let skip = null
for (const s of plan.steps) {
  if (skip === s.task && s.op !== 'shot') { out.push(`${s.key} skipped (already done)`); continue }
  let r
  try {
    if (s.op === 'openProject') {
      await sap.gotoTxn(page, ctx, 'CJ20N'); await sap.handlePopups(page, [/^Continue$/i, /^Cancel$/i])
      const ok = await sap.openProjectFromWorklist(page, s.project); await sap.settle(page, 1500)
      await sap.expandProjectTree(page)
      const net = (await sap.treeRows(page)).map((x) => x.ident.match(/^(\d{5,})$/)).find(Boolean)
      if (net) rctx.vars.network = net[1]
      rctx.dirty = false
      r = { ok, note: `${await page.title()} net=${rctx.vars.network}` }
    } else if (s.op === 'txn') r = await sap.gotoTxn(page, ctx, s.code)
    else if (s.op === 'recipe') r = await recipes[s.name](rctx, revive(s.args))
    else if (s.op === 'save') r = await recipes.saveProject(rctx, s)
    else if (s.op === 'menu') { r = await sap.clickMenu(page, s.path); await sap.handlePopups(page) }
    else if (s.op === 'expect') { const sb = await sap.statusbar(page); r = { ok: new RegExp(s.statusbar, 'i').test(sb), note: sb } }
    else if (s.op === 'expectField') { const f = await sap.findByLabel(page, s.titles); r = { ok: !!f && String(f.v).includes(s.contains), note: f?.v } }
    else if (s.op === 'popupField') { const t = await sap.popupText(page); if (t) { const f = await sap.findByLabel(page, s.titles); if (f) { await sap.typeInto(page, f, s.value); await page.keyboard.press('Enter'); await sap.settle(page, 2000) } } r = { ok: true, note: t ? 'popup filled' : 'no popup' } }
    else if (s.op === 'fill') { for (const [labels, v] of s.fields) { const f = await sap.findByLabel(page, labels); if (!f) { r = { ok: false, reason: `field ${labels[0]}` }; break } await sap.typeInto(page, f, v); await page.keyboard.press('Tab') } r = r || { ok: true } }
    else if (s.op === 'key') { await page.keyboard.press(s.press); await sap.settle(page, 2500); r = { ok: true, note: await sap.statusbar(page) } }
    else if (s.op === 'shot') r = { ok: true, note: 'shot' }
    else r = { ok: false, reason: `op ${s.op} not simulated` }
  } catch (e) { r = { ok: false, reason: e.message } }
  if (r.skipTask) skip = s.task
  out.push(`${s.key} ${s.op}${s.name ? ':' + s.name : ''} ${r.ok ? 'OK' : 'FAIL'} ${(r.note || r.reason || '').slice(0, 200)}`)
  if (!r.ok) { out.push(`  sb=${await sap.statusbar(page)} pop=${(await sap.popupText(page)).slice(0, 160)} title=${await page.title()}`); break }
}
return out
