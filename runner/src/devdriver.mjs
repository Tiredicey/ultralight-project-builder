import { chromium } from 'playwright'
import { createServer } from 'node:http'
import * as sap from './sap.mjs'
import * as recipes from './recipes.mjs'
import * as pack from '../../shared/pack.js'

const PORT = Number(process.env.DRIVER_PORT || 9333)
const ctx = { host: process.env.SAP_HOST || 'm53p.ucc.cloud', client: process.env.SAP_CLIENT || '236', user: (process.env.PROBE_USER || '').toUpperCase(), password: process.env.PROBE_PASS || '' }
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
const page = await (await browser.newContext({ viewport: sap.VIEW, locale: 'en-US' })).newPage()
page.on('dialog', (d) => d.accept().catch(() => {}))
const rctx = { page, vars: {}, dirty: false }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  try {
    const out = await new AsyncFunction('page', 'sap', 'recipes', 'pack', 'ctx', 'rctx', body)(page, sap, recipes, pack, ctx, rctx)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(out ?? null, null, 1))
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(String(e.stack || e))
  }
}).listen(PORT, '127.0.0.1')
process.stdout.write(`driver on ${PORT}\n`)
