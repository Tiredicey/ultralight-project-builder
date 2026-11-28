import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { VIEW, login } from './sap.mjs'
import { Checker } from './checks.mjs'
import { loadEnv, localAccounts } from './env.mjs'
import { planFor, PREDECESSORS, dataFor, suffixOf, CHECKS } from '../../shared/pack.js'

loadEnv()
const HOST = process.env.SAP_HOST || 'm53p.ucc.cloud'
const CLIENT = process.env.SAP_CLIENT || '236'
const [user, secret] = Object.entries(localAccounts())[0] || ['', '']
const OUT = new URL('../validation/', import.meta.url)
mkdirSync(OUT, { recursive: true })
if (!suffixOf(user) || !secret) { console.error('Set SAP_ACCOUNTS=LEARN-###:password in runner/.env'); process.exit(1) }
const d = dataFor(suffixOf(user))
const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set(Object.values(CHECKS).flatMap((c) => c.ids))]
const results = []
const redact = (v) => String(v ?? '').split(secret).join('***')
const rec = (id, check, ok, detail) => { const line = { id: redact(id), check: redact(check), ok: !!ok, detail: redact(detail) }; results.push(line); process.stdout.write(`${line.ok ? 'PASS' : 'FAIL'}  ${line.id.padEnd(12)} ${line.check.padEnd(44)} ${line.detail}\n`) }

const plan = planFor(user)
rec('pack', `plan builds for ${user}`, plan.steps.length > 50, `${plan.steps.length} steps`)
rec('pack', '22 relationships as predecessors', Object.values(PREDECESSORS).flat().length === 22, `${Object.keys(PREDECESSORS).length} successor activities`)
rec('pack', 'plan survives JSON (D1 hop)', JSON.parse(JSON.stringify(plan)).steps.length === plan.steps.length, 'recipe args are strings')

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
const page = await (await browser.newContext({ viewport: VIEW, locale: 'en-US' })).newPage()
const ctx = { host: HOST, client: CLIENT, user, password: secret }
try {
  const l = await login(page, ctx)
  rec('login', `${user} on ${HOST}/${CLIENT}`, l.ok, l.reason || l.note || 'ok')
  if (!l.ok) throw new Error('login failed')
  await new Checker(page, ctx, d, (r) => rec(r.id, r.check, r.ok, r.detail)).run(ids)
  await page.screenshot({ path: new URL('last.png', OUT).pathname })
} catch (e) {
  rec('run', 'exception', false, e.message)
} finally {
  await browser.close()
  writeFileSync(new URL('results.json', OUT), JSON.stringify({ at: new Date().toISOString(), user, host: HOST, client: CLIENT, results }, null, 2))
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
}
