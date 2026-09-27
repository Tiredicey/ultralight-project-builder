import { chromium } from 'playwright'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { VIEW, login, gotoTxn, selectTreeObject, expandProjectTree, treeRows, clickTitle, cellState, findByLabel, captureDom, openProjectFromWorklist, settle } from './sap.mjs'
import { costReport } from './recipes.mjs'
import { planFor, PREDECESSORS, dataFor, suffixOf } from '../../shared/pack.js'

if (existsSync(new URL('../.env', import.meta.url))) for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '') }
const HOST = process.env.SAP_HOST || 'm53p.ucc.cloud'
const CLIENT = process.env.SAP_CLIENT || '236'
const first = (process.env.SAP_ACCOUNTS || '').split(',')[0]
const user = first.slice(0, first.indexOf(':')).toUpperCase()
const password = first.slice(first.indexOf(':') + 1)
const only = process.argv.slice(2)
const OUT = new URL('../validation/', import.meta.url)
mkdirSync(OUT, { recursive: true })
if (!suffixOf(user) || !password) { console.error('Set SAP_ACCOUNTS=LEARN-###:password in runner/.env'); process.exit(1) }
const d = dataFor(suffixOf(user))
const results = []
const rec = (area, check, ok, detail) => { results.push({ area, check, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${area.padEnd(10)} ${check.padEnd(44)} ${detail}`) }
const want = (a) => !only.length || only.includes(a)

const plan = planFor(user)
rec('pack', 'plan builds', plan.steps.length > 50, `${plan.steps.length} steps`)
rec('pack', '22 relationships as predecessors', Object.values(PREDECESSORS).flat().length === 22, `${Object.keys(PREDECESSORS).length} successor activities`)
rec('pack', 'plan survives JSON (D1 hop)', JSON.parse(JSON.stringify(plan)).steps.length === plan.steps.length, 'recipe args are strings')

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
const page = await (await browser.newContext({ viewport: VIEW, locale: 'en-US' })).newPage()
const ctx = { host: HOST, client: CLIENT, user, password }
try {
  const l = await login(page, ctx)
  rec('login', `${user} on ${HOST}/${CLIENT}`, l.ok, l.reason || l.note || 'ok')
  if (!l.ok) throw new Error('login failed')

  if (want('project')) {
    await gotoTxn(page, ctx, 'CJ20N')
    rec('project', `open ${d.project}`, await openProjectFromWorklist(page, d.project), await page.title())
    const clicks = await expandProjectTree(page)
    const rows = await treeRows(page)
    const acts = rows.filter((r) => /^\d{5,} \d{4}$/.test(r.ident)).map((r) => r.ident.split(' ')[1])
    const expActs = [...d.activities.map((a) => a.act), '0045', '0135']
    rec('project', 'all 16 activities in tree', expActs.every((a) => acts.includes(a)), `${acts.length} found after ${clicks} expands; missing ${expActs.filter((a) => !acts.includes(a)).join(',') || 'none'}`)
    rec('project', 'no stray activities', acts.every((a) => expActs.includes(a)), `extra ${acts.filter((a) => !expActs.includes(a)).join(',') || 'none'}`)
    for (const w of d.wbs) rec('wbs', w.wbs, rows.some((r) => r.ident === w.wbs), w.desc)
    rec('pstext', d.psText, rows.some((r) => r.ident === d.psText), 'node under top WBS')
    for (const m of d.milestones) rec('milestone', `${m.usage} ${m.desc}`, rows.some((r) => r.text === m.desc), `under ${m.act}`)
    const st = await findByLabel(page, ['System Status'])
    rec('release', 'System status', /REL/.test(st?.v || ''), st?.v || 'not found')

    if (want('rels') || !only.length) {
      for (const [act, preds] of Object.entries(PREDECESSORS)) {
        const s = await selectTreeObject(page, { act })
        if (!s.ok) { rec('rels', act, false, s.reason); continue }
        await clickTitle(page, ['Relationship Overview']); await settle(page, 1200)
        const g = await page.evaluate(() => { const e = [...document.querySelectorAll('[id$="[1,3]_c"]')].find((x) => x.getAttribute('role') === 'checkbox'); return e ? e.id.split('[')[0] : null })
        const got = []
        for (let r = 1; r < 15 && g; r++) { const a = await cellState(page, g, r, 1); if (!a?.v) continue; const c = await cellState(page, g, r, 3); if (!c?.checked) got.push(a.v) }
        rec('rels', `${act} <- ${preds.join(',')}`, preds.every((p) => got.includes(p)) && got.length === preds.length, `read ${got.join(',') || 'none'}`)
      }
    }
    await gotoTxn(page, ctx, 'CJ20N'); await openProjectFromWorklist(page, d.project)
    const s135 = await selectTreeObject(page, { act: '0135' })
    const cost = await findByLabel(page, ['Costs in the activity'])
    const flex = (await captureDom(page)).els.find((e) => e.k === 'check' && /flexible duration/i.test(e.t))
    rec('task10', '0135 costs 8,000 + flexible', s135.ok && cost?.v?.trim() === '8,000.00' && flex?.v === 'true', `${cost?.v?.trim()} flexible=${flex?.v}`)
    await page.screenshot({ path: new URL('project.png', OUT).pathname })
  }

  if (want('costs')) {
    await gotoTxn(page, ctx, 'S_ALR_87013542')
    const r = await costReport({ page, vars: {} }, { project: d.project, coArea: d.controllingArea })
    rec('costs', 'report runs', r.ok, r.note || r.reason)
    const txt = await page.evaluate(() => document.body.innerText)
    rec('costs', 'actual labor 1,750.00 (Task 11/12)', txt.includes('1,750.00'), '8000000 Labor')
    rec('costs', 'plan 0135 = 8,000.00 (Task 10)', /6300000[\s\S]{0,80}8,000\.00/.test(txt), '6300000 Other operating expenses')
    rec('costs', 'invoice 9,700.00 (Task 13)', txt.includes('9,700.00'), txt.includes('9,700.00') ? 'posted' : 'not posted')
    await page.screenshot({ path: new URL('costs.png', OUT).pathname })
  }
} catch (e) {
  rec('run', 'exception', false, e.message)
} finally {
  await browser.close()
  writeFileSync(new URL('results.json', OUT), JSON.stringify({ at: new Date().toISOString(), user, host: HOST, client: CLIENT, results }, null, 2))
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
}
