import { chromium } from 'playwright'
import { createServer } from 'node:http'
import * as sap from './sap.mjs'
import * as recipes from './recipes.mjs'
import * as pack from '../../shared/pack.js'

const PORT = Number(process.env.DRIVER_PORT || 9333)
const ctx = { host: process.env.SAP_HOST || 'm53p.ucc.cloud', client: process.env.SAP_CLIENT || '236', user: (process.env.PROBE_USER || '').toUpperCase(), password: process.env.PROBE_PASS || '' }
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=384', '--renderer-process-limit=1', '--disable-gpu'] })
const page = await (await browser.newContext({ viewport: sap.VIEW, locale: 'en-US' })).newPage()
page.on('dialog', (d) => d.accept().catch(() => {}))
const rctx = { page, vars: {}, dirty: false, sap: { host: ctx.host, client: ctx.client } }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

createServer(async (req, res) => {
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') { res.writeHead(403); res.end(); return }
  let body = ''
  for await (const c of req) body += c
  try {
    const out = await new AsyncFunction('page', 'sap', 'recipes', 'pack', 'ctx', 'rctx', body)(page, sap, recipes, pack, ctx, rctx)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(out ?? null, null, 1))
  } catch (e) {
    process.stderr.write(`${e.stack || e}\n`)
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(`Error: ${e instanceof Error ? e.message : 'driver script failed'}`)
  }
}).listen(PORT, '127.0.0.1')
process.stdout.write(`driver on ${PORT}\n`)
