import { gotoTxn, selectTreeObject, expandProjectTree, treeRows, clickTitle, cellState, findByLabel, captureDom, openProjectFromWorklist, settle } from './sap.mjs'
import { costReport } from './recipes.mjs'
import { PREDECESSORS } from '../../shared/pack.js'

const GROUP = { wbs: 'tree', activities: 'tree', pstext: 'tree', milestones: 'tree', release: 'tree', rels: 'rels', task10: 'task10', reportRuns: 'report', labor: 'report', plan8000: 'report', invoice: 'report', finalActual: 'report' }

export class Checker {
  constructor(page, ctx, d, onResult = () => {}) { this.page = page; this.ctx = ctx; this.d = d; this.done = new Set(); this.results = []; this.say = onResult }

  rec(id, check, ok, detail) { const r = { id, check, ok: !!ok, detail: String(detail ?? '') }; this.results.push(r); this.say(r); return r }

  async run(ids) {
    const groups = [...new Set(ids.map((i) => GROUP[i]).filter(Boolean))]
    for (const g of groups) {
      if (this.done.has(g)) continue
      this.done.add(g)
      try { await this[g]() } catch (e) { this.rec(g, `${g} checks`, false, e.message) }
    }
    return this.results.filter((r) => ids.includes(r.id) || groups.includes(r.id))
  }

  async openProject() {
    await gotoTxn(this.page, this.ctx, 'CJ20N')
    if (!(await openProjectFromWorklist(this.page, this.d.project))) throw new Error(`Could not open ${this.d.project} in CJ20N`)
  }

  async tree() {
    const { page, d } = this
    await this.openProject()
    const clicks = await expandProjectTree(page)
    const rows = await treeRows(page)
    const acts = rows.filter((r) => /^\d{5,} \d{4}$/.test(r.ident)).map((r) => r.ident.split(' ')[1])
    const expActs = [...d.activities.map((a) => a.act), '0045', '0135']
    const missingWbs = d.wbs.filter((w) => !rows.some((r) => r.ident === w.wbs)).map((w) => w.wbs)
    this.rec('wbs', `${d.wbs.length} WBS elements ${d.project} to ${d.project}-5`, !missingWbs.length, missingWbs.length ? `missing ${missingWbs.join(', ')}` : 'all present')
    const missing = expActs.filter((a) => !acts.includes(a)), extra = acts.filter((a) => !expActs.includes(a))
    this.rec('activities', '16 activities incl. 0045 and 0135', !missing.length && !extra.length, `${acts.length} found after ${clicks} expands; missing ${missing.join(',') || 'none'}; extra ${extra.join(',') || 'none'}`)
    const ps = rows.some((r) => r.ident === d.psText)
    this.rec('pstext', `PS text ${d.psText}`, ps, ps ? 'node under top WBS' : 'not in tree')
    const ms = d.milestones.filter((m) => !rows.some((r) => r.text === m.desc))
    this.rec('milestones', 'milestones 00004, 00005, 00006', !ms.length, ms.length ? `missing ${ms.map((m) => m.desc).join(', ')}` : 'all three in tree')
    await selectTreeObject(page, { ident: d.project, level: 0 }).catch(() => null)
    const st = await findByLabel(page, ['System Status'])
    this.rec('release', 'System status contains REL', /REL/.test(st?.v || ''), st?.v || 'field not found')
  }

  async rels() {
    const { page } = this
    if (!this.done.has('tree')) await this.openProject()
    let good = 0; const bad = []
    for (const [act, preds] of Object.entries(PREDECESSORS)) {
      const s = await selectTreeObject(page, { act })
      if (!s.ok) { bad.push(`${act}: ${s.reason}`); continue }
      await clickTitle(page, ['Relationship Overview']); await settle(page, 1200)
      const g = await page.evaluate(() => { const e = [...document.querySelectorAll('[id$="[1,3]_c"]')].find((x) => x.getAttribute('role') === 'checkbox'); return e ? e.id.split('[')[0] : null })
      const got = []
      for (let r = 1; r < 15 && g; r++) { const a = await cellState(page, g, r, 1); if (!a?.v) continue; const c = await cellState(page, g, r, 3); if (!c?.checked) got.push(a.v) }
      if (preds.every((p) => got.includes(p)) && got.length === preds.length) good += preds.length
      else bad.push(`${act} expected ${preds.join(',')} read ${got.join(',') || 'none'}`)
    }
    this.rec('rels', '22 finish-to-start predecessor links', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `${good} links read back`)
  }

  async task10() {
    const { page } = this
    await this.openProject()
    const s = await selectTreeObject(page, { act: '0135' })
    const cost = await findByLabel(page, ['Costs in the activity'])
    const flex = (await captureDom(page)).els.find((e) => e.k === 'check' && /flexible duration/i.test(e.t))
    this.rec('task10', '0135 costs 8,000.00 and flexible duration', s.ok && cost?.v?.trim() === '8,000.00' && flex?.v === 'true', `${cost?.v?.trim() || 'no value'}, flexible=${flex?.v ?? 'not found'}`)
  }

  async report() {
    const { page, d } = this
    await gotoTxn(page, this.ctx, 'S_ALR_87013542')
    const vars = {}
    const r = await costReport({ page, vars }, { project: d.project, coArea: d.controllingArea })
    const m = vars.report || {}
    const f = (n) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    this.rec('reportRuns', 'S_ALR_87013542 runs for the project', r.ok && (m.total?.plan || 0) > 0, r.note || r.reason)
    this.rec('labor', 'actual 8000000 Labor 1,750.00', m['8000000']?.actual === 1750, `8000000 actual ${f(m['8000000']?.actual)}`)
    this.rec('plan8000', 'plan 6300000 = 8,000.00', m['6300000']?.plan === 8000, `6300000 plan ${f(m['6300000']?.plan)}`)
    this.rec('invoice', 'actual 6300000 = 9,700.00', m['6300000']?.actual === 9700, `6300000 actual ${f(m['6300000']?.actual)}`)
    this.rec('finalActual', 'all cost elements actual 11,450.00', m.total?.actual === 11450, `all cost elements actual ${f(m.total?.actual)}`)
  }
}
