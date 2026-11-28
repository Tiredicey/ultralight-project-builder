import { loadEnv, localAccounts } from './env.mjs'
import { VERSION } from './version.mjs'

const hasEnv = loadEnv()
const out = []
const rec = (ok, check, detail, fix) => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${check.padEnd(30)} ${detail}${!ok && fix ? `\n      fix: ${fix}` : ''}`) }
const CONTROL = (process.env.CONTROL_URL || '').replace(/\/$/, '')
const HOST = process.env.SAP_HOST || 'm53p.ucc.cloud'
const acc = localAccounts()

console.log(`Ultralight runner ${VERSION} doctor · node ${process.version} · ${process.platform}/${process.arch}\n`)
rec(Number(process.versions.node.split('.')[0]) >= 20, 'Node 20 or newer', process.version, 'install Node 20 LTS')
rec(hasEnv, 'runner/.env present', hasEnv ? 'found' : 'missing', 'cp .env.example .env and fill it in')
rec(/^https?:\/\//.test(CONTROL), 'CONTROL_URL', CONTROL || 'not set', 'CONTROL_URL=https://ultralight-project-builder.pages.dev')
rec(/^ucr_/.test(process.env.RUNNER_TOKEN || ''), 'RUNNER_TOKEN format', process.env.RUNNER_TOKEN ? `${process.env.RUNNER_TOKEN.slice(0, 8)}...` : 'not set', 'Owner console > Runners > Create token')
const bad = Object.entries(acc).filter(([u, p]) => !/^LEARN-\d{3}$/.test(u) || !p).map(([u]) => u)
rec(Object.keys(acc).length > 0 && !bad.length, 'SAP_ACCOUNTS', Object.keys(acc).length ? `${Object.keys(acc).join(', ')}${bad.length ? `; bad: ${bad.join(', ')}` : ''}` : 'none (runs must carry a password)', 'SAP_ACCOUNTS=LEARN-###:password')

if (CONTROL) {
  try {
    const h = await (await fetch(`${CONTROL}/api/health`, { signal: AbortSignal.timeout(10000) })).json()
    rec(!!h.ok, 'control site reachable', `${CONTROL} ok`, 'check the URL and outbound HTTPS')
    const r = await fetch(`${CONTROL}/api/runner/hello`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RUNNER_TOKEN || ''}`, 'x-runner-version': VERSION }, body: JSON.stringify({ info: { doctor: true, version: VERSION } }), signal: AbortSignal.timeout(10000) })
    const b = await r.json().catch(() => ({}))
    rec(r.ok, 'runner token accepted', r.ok ? `runner "${b.name}"${b.accounts?.length ? `, limited to ${b.accounts.join(', ')}` : ', all accounts'}` : b.error || `HTTP ${r.status}`, 'create a new token; revoked tokens stop working')
    if (r.ok && b.accounts?.length) { const miss = Object.keys(acc).filter((a) => !b.accounts.includes(a)); rec(!miss.length, 'token covers local accounts', miss.length ? `token does not cover ${miss.join(', ')}` : 'yes', 'create a token without an account limit, or include them') }
    if (r.ok && b.latest) rec(b.latest === VERSION, 'runner version', b.latest === VERSION ? `${VERSION}, current` : `${VERSION}, site expects ${b.latest}`, 'git pull && npm install')
  } catch (e) { rec(false, 'control site reachable', e.message, 'check CONTROL_URL and outbound HTTPS') }
}

try {
  const t = Date.now()
  const r = await fetch(`https://${HOST}/sap/bc/gui/sap/its/webgui?sap-client=${process.env.SAP_CLIENT || '236'}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  rec(r.status < 500, `SAP ${HOST} reachable`, `HTTP ${r.status} in ${Date.now() - t} ms`, 'the machine needs outbound HTTPS to the SAP host')
} catch (e) { rec(false, `SAP ${HOST} reachable`, e.message, 'the machine needs outbound HTTPS to the SAP host') }

try {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
  rec(true, 'Chromium launches', b.version())
  await b.close()
} catch (e) { rec(false, 'Chromium launches', e.message.split('\n')[0], 'npx playwright install --with-deps chromium') }

const failed = out.filter((x) => !x).length
console.log(`\n${out.length - failed}/${out.length} passed${failed ? '' : '. Start with: npm start'}`)
process.exit(failed ? 1 : 0)
