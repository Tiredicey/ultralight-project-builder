import { chromium } from 'playwright'
const url = process.env.SITE || 'https://ultralight-project-builder.pages.dev'
const out = process.env.OUT || '/tmp/live'
const views = (process.env.VIEWS || 'launch,canvas,sheet,ready,jobs,plan,guide,admin').split(',')
const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] })
const shot = (p, path) => p.screenshot({ path, quality: 82, type: 'jpeg', animations: 'disabled', timeout: 60000 })
const report = {}
for (const [tag, opts] of [['d', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }], ['l', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }], ['m', { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true }], ['r', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' }]]) {
  if (process.env.TAGS && !process.env.TAGS.includes(tag)) continue
  const c = await b.newContext(opts)
  const p = await c.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const login = await p.evaluate(() => { const v = document.querySelector('.dmz-video video'); return { video: v ? { playing: !v.paused, t: +v.currentTime.toFixed(1), ready: v.readyState } : null, marquee: document.querySelectorAll('.marquee img').length, overflowX: document.documentElement.scrollWidth > innerWidth } })
  await shot(p, `${out}/${tag}-login.jpg`)
  await p.fill('#email', process.env.EMAIL); await p.fill('#password', process.env.PASS)
  await p.click('button[type=submit]'); await p.waitForTimeout(2500)
  const pages = {}
  for (const v of tag === 'd' ? views : ['launch', 'plan']) {
    await p.evaluate((h) => { location.hash = h }, v)
    await p.waitForTimeout(3000); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600)
    pages[v] = await p.evaluate(() => ({ h1: [...document.querySelectorAll('h1')].filter((h) => h.offsetParent).length, title: document.querySelector('.hero-title')?.textContent, word: document.querySelector('.hero-word')?.textContent, hiddenAfter: [...document.querySelectorAll('.rv')].filter((e) => e.getBoundingClientRect().top < innerHeight && getComputedStyle(e).opacity === '0').length, overflowX: document.documentElement.scrollWidth > innerWidth }))
    await shot(p, `${out}/${tag}-${v}.jpg`)
  }
  report[tag] = { login, pages, errs }
  await c.close()
}
console.log(JSON.stringify(report))
await b.close()
