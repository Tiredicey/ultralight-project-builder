import { chromium } from 'playwright'
const url = process.env.SITE || 'https://ultralight-project-builder.pages.dev'
const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', acceptDownloads: true })
const p = await c.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(url, { waitUntil: 'load', timeout: 60000 })
await p.fill('#email', process.env.EMAIL); await p.fill('#password', process.env.PASS); await p.click('button[type=submit]'); await p.waitForTimeout(2500)
await p.evaluate(() => { location.hash = 'export' }); await p.waitForSelector('#expGo', { timeout: 30000 }); await p.waitForTimeout(2500)
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500)
await p.screenshot({ path: '/tmp/exp-page.jpg', quality: 82, type: 'jpeg', animations: 'disabled', fullPage: true, timeout: 60000 })
const first = await p.textContent('#cvText')
await p.click('#cvNext'); const second = await p.textContent('#cvText')
await p.click('#cvBase'); const back = await p.textContent('#cvText')
for (const pair of (process.env.ATTACH || '').split(',').filter(Boolean)) { const [name, file] = pair.split('='); await p.setInputFiles(`[data-over="${name}"]`, file); await p.waitForSelector(`[data-unover="${name}"]`, { timeout: 30000 }); await p.waitForTimeout(1500) }
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400)
await p.screenshot({ path: '/tmp/exp-page.jpg', quality: 82, type: 'jpeg', animations: 'disabled', fullPage: true, timeout: 60000 })
await p.fill('#expName', process.env.NAME || 'Test Student'); await p.fill('#expSec', 'BSIT 3A')
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#expGo')])
const out = `/tmp/${dl.suggestedFilename()}`
await dl.saveAs(out)
console.log(JSON.stringify({ file: out, prog: await p.textContent('#expProg'), conclusionChanges: first !== second, baseRestored: first === back, errs }))
await b.close()
