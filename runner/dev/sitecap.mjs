import { chromium } from 'playwright'
const url = process.env.SITE || 'https://ultralight-project-builder.pages.dev'
const out = process.env.OUT || '/tmp/shots'
const theme = process.env.THEME || 'dark'
const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme })
const p = await c.newPage()
await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.screenshot({ path: `${out}/login.jpg`, quality: 88, type: 'jpeg' })
await p.fill('#email', process.env.EMAIL); await p.fill('#password', process.env.PASS)
await p.click('button[type=submit]'); await p.waitForTimeout(2500)
for (const v of (process.env.VIEWS || 'launch,canvas,sheet,ready,jobs,plan,guide,admin').split(',')) {
  await p.evaluate((h) => { location.hash = h }, v === 'canvas' && process.env.JOB ? `canvas/${process.env.JOB}` : v)
  await p.waitForTimeout(3500)
  await p.screenshot({ path: `${out}/${v}.jpg`, quality: 88, type: 'jpeg' })
}
await b.close()
