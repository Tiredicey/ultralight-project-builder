import { chromium } from 'playwright'
const url = process.env.SITE || 'http://localhost:3000'
const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
const res = []
const ok = (c, m, d = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'} ${m}${d ? `  (${d})` : ''}`) }
for (const [tag, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['reduced', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }]]) {
  const c = await b.newContext({ ...opts, permissions: ['clipboard-read', 'clipboard-write'] })
  const p = await c.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|409/.test(m.text())) errs.push(m.text()) })
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500)
  if (tag === 'desk') { await p.focus('#password'); await p.keyboard.down('CapsLock'); await p.keyboard.press('a'); await p.keyboard.up('CapsLock'); ok(await p.locator('.x-caps').count() === 1, `${tag} login: Caps Lock hint present`) }
  await p.fill('#email', process.env.EMAIL); await p.fill('#password', process.env.PASS)
  await p.click('button[type=submit]'); await p.waitForTimeout(2500)
  const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(3000) }
  const ovf = () => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  await go('launch')
  ok(await p.locator('.x-eta').count() === 1, `${tag} launch: estimate card`, await p.locator('#xEta').innerText().catch(() => ''))
  const n0 = await p.locator('#xEtaN').innerText()
  await p.locator('input[name=t]').first().uncheck(); await p.waitForTimeout(1500)
  const n1 = await p.locator('#xEtaN').innerText()
  ok(n0 !== n1 && /\d+ steps/.test(n1), `${tag} launch: step count follows task ticks`, `${n0} -> ${n1}`)
  await p.locator('input[name=t]').first().check()
  ok(!(await ovf()), `${tag} launch: no sideways scroll`)
  if (tag !== 'phone') {
    await p.locator('h1').first().click()
    await p.keyboard.press('Control+K'); await p.waitForTimeout(300)
    ok(await p.locator('#xPal[open]').count() === 1, `${tag} palette opens with Ctrl+K`)
    await p.keyboard.type('task 10'); await p.waitForTimeout(200)
    const first = await p.locator('#xPal li').first().innerText()
    ok(/Task 10/.test(first), `${tag} palette filters`, first.replace(/\n/g, ' '))
    await p.keyboard.press('Enter'); await p.waitForTimeout(3000)
    ok((await p.evaluate(() => location.hash)).startsWith('#sheet'), `${tag} palette Enter opens the task sheet`, await p.evaluate(() => location.hash))
    await p.locator('h1').first().click()
    await p.keyboard.press('g'); await p.keyboard.press('p'); await p.waitForTimeout(3000)
    ok(await p.evaluate(() => location.hash) === '#plan', `${tag} g p jumps to Project data`)
    await p.locator('h1').first().click()
    await p.keyboard.press('?'); await p.waitForTimeout(300)
    ok(await p.locator('#xKeys[open]').count() === 1, `${tag} ? opens shortcut list`)
    await p.keyboard.press('Escape')
  }
  await go('sheet')
  ok(await p.locator('.x-sheet-tools').count() === 1, `${tag} sheet: find and tick tools`)
  await p.fill('#xSheetQ', 'CN25'); await p.waitForTimeout(300)
  const vis = await p.locator('.sheet-task:visible').count()
  ok(vis >= 1 && vis < 14, `${tag} sheet: search narrows tasks`, `${vis} visible`)
  await p.fill('#xSheetQ', ''); await p.waitForTimeout(200)
  await p.locator('.x-tick input').first().check(); await p.waitForTimeout(200)
  ok(/1 of 14/.test(await p.locator('#xSheetN').innerText()), `${tag} sheet: tick counts`, await p.locator('#xSheetN').innerText())
  await p.locator('.x-tick input').first().uncheck()
  if (tag === 'desk') { await p.locator('.x-copy').first().click(); await p.waitForTimeout(300); const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(clip.length > 0, `${tag} sheet: value click copies`, clip.slice(0, 30)) }
  ok(!(await ovf()), `${tag} sheet: no sideways scroll`)
  await go('ready')
  ok(await p.locator('#xAuto').count() === 1 && await p.locator('#xDiag').count() === 1, `${tag} readiness: auto refresh and diagnostics`)
  if (tag === 'desk') { await p.click('#xDiag'); await p.waitForTimeout(300); const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(/Ultralight readiness/.test(clip) && /\[(ok|FAIL|warn)\]/.test(clip), `${tag} readiness: diagnostics copied`, `${clip.split('\n').length} lines`) }
  await go('jobs')
  ok(await p.locator('.x-chips [data-s]').count() >= 2, `${tag} runs: status chips`, (await p.locator('.x-chips').innerText().catch(() => '')).replace(/\n/g, ' '))
  if (await p.locator('.x-chips [data-s="done"]').count()) { await p.click('.x-chips [data-s="done"]'); const bad = await p.locator('.grid3 table.t').first().locator('tbody tr:visible .pill').evaluateAll((x) => x.filter((e) => e.innerText.trim() !== 'done').length); ok(bad === 0, `${tag} runs: chip filters rows`) }
  if (await p.locator('.gallery figure > a').count()) { await p.locator('.gallery figure > a').first().click(); await p.waitForTimeout(400); ok(await p.locator('#xLb[open]').count() === 1, `${tag} runs: screenshot viewer opens`); await p.keyboard.press('ArrowRight'); ok(/^2 of|^1 of 1/.test(await p.locator('#xLbCap').innerText()), `${tag} runs: viewer arrow keys`, await p.locator('#xLbCap').innerText()); await p.keyboard.press('Escape') }
  await go('plan')
  ok(await p.locator('.net .node[tabindex="0"]').count() === 16, `${tag} plan: 16 focusable nodes`)
  await p.locator('.net .node').nth(6).hover(); await p.waitForTimeout(200)
  const info = await p.locator('.x-net-info').innerText()
  ok(/waits for \d+/.test(info), `${tag} plan: trace shows predecessors`, info.slice(0, 90))
  ok(await p.locator('.net.x-focus .node.x-up, .net.x-focus .node.x-down').count() > 0, `${tag} plan: chain highlighted`)
  ok(await p.locator('.x-filter').count() >= 1, `${tag} plan: activity table filter`)
  await go('export')
  ok(await p.locator('.fig[tabindex="0"]').count() >= 1, `${tag} export: figures accept drop and paste`, String(await p.locator('.fig[tabindex="0"]').count()))
  await go('guide')
  ok(await p.locator('.x-pre-copy').count() >= 3, `${tag} guide: copy buttons on commands`, String(await p.locator('.x-pre-copy').count()))
  if (tag === 'desk') { await p.locator('.x-pre-copy').first().click(); await p.waitForTimeout(300); const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(/^git clone/.test(clip) && !/Copy$/.test(clip), `${tag} guide: copies the command only`, clip.split('\n')[0]) }
  await p.locator('.x-step').first().check()
  ok(/^1 of/.test(await p.locator('#xGuideN').innerText()), `${tag} guide: progress`, await p.locator('#xGuideN').innerText())
  await p.locator('.x-step').first().uncheck()
  await go('admin')
  ok(await p.locator('.x-filter').count() >= 2, `${tag} owner console: table filters`, String(await p.locator('.x-filter').count()))
  await go('canvas')
  if (await p.locator('#ctl').count()) { ok(await p.locator('.x-runbar #xElapsed').count() === 1, `${tag} canvas: run bar`); ok(/^\d+:\d{2}/.test(await p.locator('#xElapsed').innerText()), `${tag} canvas: elapsed clock`, await p.locator('#xElapsed').innerText()) }
  else ok(true, `${tag} canvas: no run in this database, run bar not applicable`)
  ok(!(await ovf()), `${tag} canvas: no sideways scroll`)
  ok(errs.length === 0, `${tag} no script errors`, errs.slice(0, 3).join(' | '))
  await c.close()
}
await b.close()
const f = res.filter((x) => !x).length
console.log(f ? `${f} FAILED of ${res.length}` : `ALL ${res.length} PASS`)
process.exit(f ? 1 : 0)
