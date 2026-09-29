import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { VIEW, login, gotoTxn, settle, statusbar, findByLabel, typeInto } from './sap.mjs'
import { loadEnv } from './env.mjs'
import { suffixOf } from '../../shared/pack.js'

loadEnv()
const user = (process.env.PROBE_USER || '').toUpperCase()
const password = process.env.PROBE_PASS || ''
const HOST = process.env.SAP_HOST || 'm53p.ucc.cloud'
const CLIENT = process.env.SAP_CLIENT || '236'
const OUT = new URL('../validation/', import.meta.url)
mkdirSync(OUT, { recursive: true })
if (!suffixOf(user) || !password) { console.error('Set PROBE_USER=LEARN-### and PROBE_PASS'); process.exit(1) }
const project = process.env.PROBE_PROJECT || `P/2${suffixOf(user)}`
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
const page = await (await browser.newContext({ viewport: VIEW, locale: 'en-US' })).newPage()
const ctx = { host: HOST, client: CLIENT, user, password }
const report = { user, project, host: HOST, client: CLIENT, at: new Date().toISOString(), steps: [] }
const tag = user.replace(/\W/g, '')
try {
  const l = await login(page, ctx)
  report.steps.push({ step: 'login', ok: l.ok, reason: l.reason || null })
  if (!l.ok) throw new Error(l.reason)
  await gotoTxn(page, ctx, 'CJ20N')
  await settle(page, 3000)
  const text = await page.evaluate(() => document.body.innerText)
  report.steps.push({ step: 'CJ20N worklist', projects: [...new Set(text.match(/P\/\d{4}(?:-\d)?/g) || [])] })
  await page.screenshot({ path: new URL(`probe-${tag}-cj20n.png`, OUT).pathname })
  await gotoTxn(page, ctx, 'CJ03')
  const f = await findByLabel(page, [/Project def/i, /Project Definition/i])
  if (f) {
    await typeInto(page, f, project)
    await page.keyboard.press('Enter')
    await settle(page, 2500)
  }
  const sb = await statusbar(page)
  const title = await page.title()
  report.steps.push({ step: `CJ03 ${project}`, fieldFound: !!f, title, statusbar: sb, exists: !/does not exist|not found|nicht vorhanden/i.test(sb) && !/Initial|Selection/i.test(title) })
  await page.screenshot({ path: new URL(`probe-${tag}-cj03.png`, OUT).pathname })
} catch (e) {
  report.error = e.message
} finally {
  writeFileSync(new URL(`probe-${tag}.json`, OUT), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
}
