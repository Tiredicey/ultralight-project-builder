import { Hono, type Context, type Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { now, randomToken, sha256, hashPassword, verifyPassword, emailOk, safeEqual } from './lib/auth'
import { seal, open } from './lib/crypto'
import { planFor, taskSummary, suffixOf, dataFor, taskSheet, validatePlan, SAP_CLIENT, SAP_HOST } from '../shared/pack.js'

export type Bindings = { DB: D1Database; APP_SECRET?: string; SETUP_KEY?: string; CF_ACCOUNT_ID?: string; CF_ANALYTICS_TOKEN?: string; SIMULATE_D1_WRITE_LIMIT?: string }
type User = { id: number; email: string; name: string; role: string; status: string }
type Runner = { id: number; name: string; accounts: string }
type Env = { Bindings: Bindings; Variables: { user: User; runner: Runner } }

const SESSION_DAYS = 14
const FRAME_MAX = 1_800_000
const EVIDENCE_MAX = 1_900_000
const ACTIVE = ['queued', 'claimed', 'running', 'paused', 'waiting']
export const RUNNER_LATEST = '1.3.5'
const ONLINE_MS = 75_000
const HEARTBEAT_MS = 30_000
const WATCH_MS = 45_000
const WATCH_WRITE_MS = 20_000
const FALLBACK_HOURS = 12
const QUOTA_RE = /exceeded D1's free tier daily row (write|read) limit/i
export const quotaKind = (e: unknown) => { const m = QUOTA_RE.exec(String((e as any)?.message || e || '')); return m ? (m[1].toLowerCase() as 'write' | 'read') : null }
export const nextUtcMidnight = (t = Date.now()) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) }
let quotaSeen: { kind: string; at: number; retryAt: number } | null = null
const noteQuota = (kind: string) => { quotaSeen = { kind, at: now(), retryAt: nextUtcMidnight() } }
const quotaNow = () => (quotaSeen && quotaSeen.retryAt > now() ? quotaSeen : null)
const soft = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p } catch (e) { const k = quotaKind(e); if (k) { noteQuota(k); return null } throw e } }
const DOC_CHUNK = 900_000
const DOC_MAX = 20 * 1024 * 1024

let ensured = false
let hasWatch = false
const LATE_TABLES: Record<string, string> = {
  runner_info: 'CREATE TABLE IF NOT EXISTS runner_info (runner_id INTEGER PRIMARY KEY, info TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  docs: "CREATE TABLE IF NOT EXISTS docs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, task_pages TEXT NOT NULL DEFAULT '{}', complete INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER, created_at INTEGER NOT NULL)",
  doc_chunks: 'CREATE TABLE IF NOT EXISTS doc_chunks (doc_id INTEGER NOT NULL, idx INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (doc_id, idx))'
}
const ensureSchema = async (c: Context<Env>) => {
  if (ensured) return
  const names = Object.keys(LATE_TABLES)
  const have = new Set((await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names.map(() => '?').join(',')})`).bind(...names).all<{ name: string }>()).results.map((r) => r.name))
  const missing = names.filter((t) => !have.has(t))
  if (missing.length && !(await soft(c.env.DB.batch(missing.map((t) => c.env.DB.prepare(LATE_TABLES[t])))))) return
  const watch = await c.env.DB.prepare("SELECT COUNT(*) n FROM pragma_table_info('jobs') WHERE name = 'watched_at'").first<{ n: number }>()
  if (!watch?.n && !(await soft(c.env.DB.prepare('ALTER TABLE jobs ADD COLUMN watched_at INTEGER').run()))) return
  hasWatch = true
  ensured = true
}
const planOf = (sapUser: string, tasks: number[], mode: string) => (mode === 'validate' ? validatePlan(sapUser, tasks) : planFor(sapUser, tasks))

const secretOf = (c: Context<Env>) => c.env.APP_SECRET || 'local-dev-secret-change-me'
const j = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) : d } catch { return d } }

const audit = (c: Context<Env>, userId: number | null, action: string, detail?: unknown) =>
  soft(c.env.DB.prepare('INSERT INTO audit (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)').bind(userId, action, detail ? JSON.stringify(detail) : null, now()).run())

const event = (c: Context<Env>, jobId: number, level: string, message: string, stepKey?: string | null, data?: unknown) =>
  c.env.DB.prepare('INSERT INTO events (job_id, step_key, level, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(jobId, stepKey || null, level, message.slice(0, 2000), data ? JSON.stringify(data).slice(0, 20000) : null, now()).run()

const setting = async (c: Context<Env>, key: string, d: string) => ((await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? d)

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status })

const enc = new TextEncoder()
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const hmac = async (secret: string, msg: string) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}
const fallbackToken = async (c: Context<Env>, id: number, passHash: string) => {
  const exp = now() + FALLBACK_HOURS * 36e5
  return `f1.${id}.${exp}.${await hmac(secretOf(c), `${id}.${exp}.${passHash}`)}`
}
const loadFallback = async (c: Context<Env>, token: string): Promise<User | null> => {
  const [, id, exp, sig] = token.split('.')
  if (!id || !exp || !sig || !(Number(exp) > now())) return null
  const u = await c.env.DB.prepare('SELECT id, email, name, role, status, pass_hash FROM users WHERE id = ?').bind(Number(id)).first<User & { pass_hash: string }>()
  if (!u || !safeEqual(await hmac(secretOf(c), `${id}.${exp}.${u.pass_hash}`), sig)) return null
  const { pass_hash, ...user } = u
  return user
}

const loadUser = async (c: Context<Env>): Promise<User | null> => {
  const token = getCookie(c, 'uc_session') || (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  if (token.startsWith('f1.')) return loadFallback(c, token)
  const row = await c.env.DB.prepare('SELECT u.id, u.email, u.name, u.role, u.status, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(await sha256(token)).first<User & { expires_at: number }>()
  if (!row || row.expires_at < now()) return null
  return row
}

const needUser = async (c: Context<Env>, next: Next) => {
  const u = await loadUser(c)
  if (!u) return c.json({ error: 'Sign in required' }, 401)
  if (u.status !== 'approved') return c.json({ error: 'Your access is waiting for owner approval', status: u.status }, 403)
  c.set('user', u)
  await next()
}

const needOwner = async (c: Context<Env>, next: Next) => {
  const u = c.get('user')
  if (u.role !== 'owner' && u.role !== 'admin') return c.json({ error: 'Owner or admin only' }, 403)
  await next()
}

const needRunner = async (c: Context<Env>, next: Next) => {
  const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return c.json({ error: 'Runner token required' }, 401)
  const r = await c.env.DB.prepare('SELECT id, name, accounts FROM runners WHERE token_hash = ? AND revoked = 0').bind(await sha256(token)).first<Runner>()
  if (!r) return c.json({ error: 'Runner token invalid or revoked' }, 401)
  c.set('runner', r)
  const v = c.req.header('x-runner-version') || null
  await soft(c.env.DB.prepare('UPDATE runners SET last_seen = ?, version = COALESCE(?, version) WHERE id = ? AND (last_seen IS NULL OR last_seen < ? OR (? IS NOT NULL AND version IS NOT ?))').bind(now(), v, r.id, now() - HEARTBEAT_MS, v, v).run())
  await next()
}

const startSession = async (c: Context<Env>, userId: number, passHash: string) => {
  const token = randomToken(32)
  const secure = new URL(c.req.url).protocol === 'https:'
  const stored = await soft(c.env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now(), now() + SESSION_DAYS * 864e5).run())
  if (stored) { setCookie(c, 'uc_session', token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 }); return 'stored' }
  setCookie(c, 'uc_session', await fallbackToken(c, userId, passHash), { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: FALLBACK_HOURS * 3600 })
  return 'fallback'
}

const jobFor = async (c: Context<Env>, id: number) => {
  const u = c.get('user')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<any>()
  if (!job) return null
  if (job.user_id !== u.id && u.role !== 'owner' && u.role !== 'admin') return null
  return job
}

const jobView = (job: any) => {
  const { secret, watched_at, ...rest } = job
  return { ...rest, tasks: j(job.tasks, []), prompt: j(job.prompt, null), result: j(job.result, null), hasSecret: !!secret }
}


const recoverStale = (c: Context<Env>) => soft(recoverStaleNow(c))
const recoverStaleNow = async (c: Context<Env>) => {
  const t = now()
  await c.env.DB.prepare("UPDATE jobs SET status = 'queued', runner_id = NULL WHERE status = 'claimed' AND started_at < ?").bind(t - 120000).run()
  const dead = (await c.env.DB.prepare("SELECT j.id FROM jobs j LEFT JOIN runners r ON r.id = j.runner_id WHERE j.status IN ('running', 'paused', 'waiting') AND (r.id IS NULL OR r.revoked = 1 OR r.last_seen < ?)").bind(t - 180000).all<{ id: number }>()).results
  for (const d of dead) {
    await c.env.DB.prepare("UPDATE jobs SET status = 'failed', finished_at = ?, secret = NULL, result = ? WHERE id = ?").bind(t, JSON.stringify({ summary: 'Runner stopped reporting for 3 minutes; job released so the SAP account is free again' }), d.id).run()
    await event(c, d.id, 'error', 'Runner went silent for 3 minutes. Job marked failed and the SAP account released.')
  }
}

export const api = new Hono<Env>()

api.onError((err, c) => {
  const kind = quotaKind(err)
  if (kind) {
    noteQuota(kind)
    const retryAt = nextUtcMidnight()
    c.header('Retry-After', String(Math.max(60, Math.ceil((retryAt - now()) / 1000))))
    return c.json({ error: kind === 'write' ? 'The free database write allowance for today is used up. Viewing still works; saving resumes at 00:00 UTC.' : 'The free database read allowance for today is used up. The site resumes at 00:00 UTC.', code: kind === 'write' ? 'D1_WRITE_LIMIT' : 'D1_READ_LIMIT', retryAt }, 503)
  }
  console.error('API error', c.req.method, c.req.path, err.message)
  return c.json({ error: err.message || 'Server error' }, 500)
})

const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i
const LIMIT_MSG = "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue."
const simulated = (db: D1Database): D1Database => {
  const fail = () => Promise.reject(new Error(LIMIT_MSG))
  const wrap = (sql: string, st: any): any => new Proxy(st, { get: (t, k) => (k === 'bind' ? (...a: unknown[]) => wrap(sql, t.bind(...a)) : k === 'run' && WRITE_SQL.test(sql) ? fail : k === '__sql' ? sql : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) })
  return new Proxy(db, { get: (t: any, k) => (k === 'prepare' ? (sql: string) => wrap(sql, t.prepare(sql)) : k === 'batch' ? (list: any[]) => (list.some((x) => WRITE_SQL.test(x.__sql || '')) ? fail() : t.batch(list)) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) })
}
api.use('*', async (c, next) => {
  if (c.env.SIMULATE_D1_WRITE_LIMIT === '1' && ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname)) c.env = { ...c.env, DB: simulated(c.env.DB) }
  await ensureSchema(c)
  await next()
})

api.get('/health', async (c) => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>()
  return c.json({ ok: true, sap: { host: SAP_HOST, client: SAP_CLIENT }, initialized: (users?.n || 0) > 0, setupKeyRequired: !!c.env.SETUP_KEY, time: now(), quota: quotaNow() })
})

api.post('/auth/register', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  const name = String(b.name || '').trim().slice(0, 80)
  const password = String(b.password || '')
  if (!emailOk(email)) return c.json({ error: 'Enter a valid email' }, 400)
  if (!name) return c.json({ error: 'Enter your name' }, 400)
  if (password.length < 10) return c.json({ error: 'Password needs at least 10 characters' }, 400)
  const count = (await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>())?.n || 0
  const first = count === 0
  if (first && c.env.SETUP_KEY && String(b.setupKey || '') !== c.env.SETUP_KEY) return c.json({ error: 'The first account is the owner. Enter the setup key from your Cloudflare secrets.' }, 403)
  if (!first && (await setting(c, 'registration', 'open')) === 'closed') return c.json({ error: 'Registration is closed by the owner' }, 403)
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exists) return c.json({ error: 'That email is already registered' }, 409)
  const { hash, salt } = await hashPassword(password)
  const r = await c.env.DB.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, role, status, note, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(email, name, hash, salt, first ? 'owner' : 'user', first ? 'approved' : 'pending', String(b.note || '').slice(0, 300) || null, now(), first ? now() : null).run()
  const id = Number(r.meta.last_row_id)
  await audit(c, id, first ? 'owner.bootstrap' : 'user.register', { email })
  await startSession(c, id, hash)
  return c.json({ user: { id, email, name, role: first ? 'owner' : 'user', status: first ? 'approved' : 'pending' } })
})

api.post('/auth/login', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<any>()
  if (!u || !(await verifyPassword(String(b.password || ''), u.pass_hash, u.pass_salt))) return c.json({ error: 'Email or password is wrong' }, 401)
  const session = await startSession(c, u.id, u.pass_hash)
  await audit(c, u.id, 'user.login')
  return c.json({ user: publicUser(u), session, ...(session === 'fallback' ? { notice: `Signed in with a ${FALLBACK_HOURS}-hour backup session because today's free database write allowance is used up. Viewing works; saving resumes at 00:00 UTC.`, retryAt: nextUtcMidnight() } : {}) })
})

api.post('/auth/logout', async (c) => {
  const token = getCookie(c, 'uc_session')
  if (token && !token.startsWith('f1.')) await soft(c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run())
  deleteCookie(c, 'uc_session', { path: '/' })
  return c.json({ ok: true })
})

api.get('/auth/me', async (c) => {
  const u = await loadUser(c)
  if (!u) return c.json({ user: null })
  return c.json({ user: publicUser(u) })
})

api.get('/pack', (c) => c.json({ tasks: taskSummary(), host: SAP_HOST, client: SAP_CLIENT }))

api.use('/me/*', needUser)
api.use('/jobs/*', needUser)
api.use('/jobs', needUser)
api.use('/admin/*', needUser, needOwner)
api.use('/runner/*', needRunner)

api.get('/me/accounts', async (c) => {
  const u = c.get('user')
  const q = u.role === 'owner' || u.role === 'admin'
    ? c.env.DB.prepare('SELECT * FROM sap_accounts ORDER BY sap_user')
    : c.env.DB.prepare('SELECT a.* FROM sap_accounts a JOIN grants g ON g.account_id = a.id WHERE g.user_id = ? ORDER BY a.sap_user').bind(u.id)
  const { results } = await q.all<any>()
  const runners = (await c.env.DB.prepare('SELECT id, name, accounts, last_seen FROM runners WHERE revoked = 0').all<any>()).results
  const online = runners.filter((r) => r.last_seen && now() - r.last_seen < ONLINE_MS)
  return c.json({
    accounts: results.map((a) => ({ ...a, suffix: suffixOf(a.sap_user), project: suffixOf(a.sap_user) ? dataFor(suffixOf(a.sap_user)!).project : null, runnerOnline: online.some((r) => { const acc = j<string[]>(r.accounts, []); return acc.length === 0 || acc.includes(a.sap_user) }) })),
    runnersOnline: online.length
  })
})

api.get('/me/plan/:sapUser', async (c) => {
  const tasks = (c.req.query('tasks') || '').split(',').filter(Boolean).map(Number)
  return c.json(planFor(c.req.param('sapUser'), tasks))
})

api.get('/me/sheet/:sapUser', (c) => c.json(taskSheet(c.req.param('sapUser'))))

api.get('/me/readiness', async (c) => {
  const u = c.get('user')
  const priv = u.role === 'owner' || u.role === 'admin'
  const q = priv
    ? c.env.DB.prepare('SELECT * FROM sap_accounts ORDER BY sap_user')
    : c.env.DB.prepare('SELECT a.* FROM sap_accounts a JOIN grants g ON g.account_id = a.id WHERE g.user_id = ? ORDER BY a.sap_user').bind(u.id)
  const accounts = (await q.all<any>()).results
  const runners = (await c.env.DB.prepare('SELECT r.id, r.name, r.accounts, r.version, r.last_seen, i.info, i.updated_at FROM runners r LEFT JOIN runner_info i ON i.runner_id = r.id WHERE r.revoked = 0 ORDER BY r.id DESC').all<any>()).results
    .map((r) => ({ id: r.id, name: r.name, accounts: j<string[]>(r.accounts, []), version: r.version, online: !!r.last_seen && now() - r.last_seen < ONLINE_MS, lastSeen: r.last_seen, info: j<any>(r.info, null), infoAt: r.updated_at }))
  const runs = (await (priv
    ? c.env.DB.prepare("SELECT * FROM jobs WHERE status IN ('done', 'failed', 'aborted') ORDER BY id DESC LIMIT 200")
    : c.env.DB.prepare("SELECT * FROM jobs WHERE user_id = ? AND status IN ('done', 'failed', 'aborted') ORDER BY id DESC LIMIT 200").bind(u.id)).all<any>()).results
  const out = []
  for (const a of accounts) {
    const cover = runners.filter((r) => !r.accounts.length || r.accounts.includes(a.sap_user))
    const val = runs.find((x) => x.sap_user === a.sap_user && x.mode === 'validate' && x.status === 'done')
    const last = runs.find((x) => x.sap_user === a.sap_user && x.mode !== 'validate')
    const tasks: Record<string, any> = {}
    if (val) for (const e of (await c.env.DB.prepare("SELECT step_key, level, message, created_at FROM events WHERE job_id = ? AND step_key LIKE '%.v' ORDER BY id").bind(val.id).all<any>()).results) tasks[e.step_key.split('.')[0]] = { level: e.level, message: e.message, at: e.created_at }
    out.push({
      sapUser: a.sap_user, label: a.label, project: suffixOf(a.sap_user) ? dataFor(suffixOf(a.sap_user)!).project : null,
      runners: cover.map((r) => ({ id: r.id, name: r.name, online: r.online, holdsPassword: !!r.info?.accountsWithPassword?.includes(a.sap_user) })),
      lastRun: last ? jobView(last) : null,
      validation: val ? { jobId: val.id, at: val.finished_at, result: j(val.result, null), tasks } : null
    })
  }
  return c.json({ latest: RUNNER_LATEST, runners: priv ? runners : runners.map(({ info, ...r }) => ({ ...r, info: info ? { version: info.version, sap: info.sap, sapHost: info.sapHost } : null })), accounts: out, sap: { host: SAP_HOST, client: SAP_CLIENT } })
})

api.get('/me/submission/:sapUser', async (c) => {
  const u = c.get('user')
  const sapUser = c.req.param('sapUser').toUpperCase()
  const sfx = suffixOf(sapUser)
  if (!sfx) return c.json({ error: 'SAP user must look like LEARN-###' }, 400)
  const priv = u.role === 'owner' || u.role === 'admin'
  if (!priv) {
    const g = await c.env.DB.prepare('SELECT 1 FROM grants g JOIN sap_accounts a ON a.id = g.account_id WHERE g.user_id = ? AND a.sap_user = ?').bind(u.id, sapUser).first()
    if (!g) return c.json({ error: 'The owner has not granted you this SAP account' }, 403)
  }
  const jobs = (await (priv
    ? c.env.DB.prepare('SELECT id, mode, status, tasks, created_at, finished_at, result FROM jobs WHERE sap_user = ? ORDER BY id DESC LIMIT 60').bind(sapUser)
    : c.env.DB.prepare('SELECT id, mode, status, tasks, created_at, finished_at, result FROM jobs WHERE sap_user = ? AND user_id = ? ORDER BY id DESC LIMIT 60').bind(sapUser, u.id)).all<any>()).results
  const ids = jobs.map((x) => x.id)
  const evidence = ids.length ? (await c.env.DB.prepare(`SELECT id, job_id, task, name, caption, mime, created_at FROM evidence WHERE kind = 'screenshot' AND job_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`).bind(...ids).all<any>()).results : []
  const checks = ids.length ? (await c.env.DB.prepare(`SELECT job_id, step_key, level, message, created_at FROM events WHERE job_id IN (${ids.map(() => '?').join(',')}) AND step_key IS NOT NULL AND level IN ('ok', 'warn', 'error') ORDER BY id DESC LIMIT 2000`).bind(...ids).all<any>()).results : []
  const notes = ids.length ? (await c.env.DB.prepare(`SELECT job_id, step_key, message FROM events WHERE job_id IN (${ids.map(() => '?').join(',')}) AND step_key IS NOT NULL AND (message LIKE '%skipped, already done%' OR message LIKE '%already done in SAP%' OR message LIKE '%distinct earliest start%' OR message LIKE 'Report totals%')`).bind(...ids).all<any>()).results : []
  const flagged = evidence.map((e) => {
    const mine = notes.filter((n) => n.job_id === e.job_id && String(n.step_key).split('.')[0] === String(e.task))
    if (mine.some((n) => /skipped, already done|already done in SAP/.test(n.message))) return { ...e, flag: 'skipped', flagNote: `Task ${e.task} was already done in SAP, so run #${e.job_id} skipped it; this capture shows another screen` }
    const m = mine.map((n) => /(\d+) distinct earliest start/.exec(n.message)).find(Boolean)
    const want: Record<string, [number, string]> = { 't8-costs-planned': [0, 'no actual cost yet'], 't12-costs-after-confirmation': [1750, 'actual 1,750.00'], 't14-costs-final': [11450, 'actual 11,450.00'] }
    const tot = mine.map((n) => /Report totals Actual ([\d,.]+)/.exec(n.message)).find(Boolean)
    if (want[e.name] && tot) { const got = Number(tot[1].replace(/,/g, '')); if (Math.abs(got - want[e.name][0]) > 0.005) return { ...e, flag: 'state', flagNote: `This report shows actual ${tot[1]} EUR; Task ${e.task} should show ${want[e.name][1]}. It was re-run after later postings` } }
    if (e.name === 't3-network-before' && m && Number(m[1]) > 1) return { ...e, flag: 'after', flagNote: `Captured after the relationships existed (${m[1]} different earliest start dates, a true before-state has one)` }
    return e
  })
  return c.json({ sapUser, data: dataFor(sfx), sap: { host: SAP_HOST, client: SAP_CLIENT }, jobs: jobs.map((x) => ({ ...x, tasks: j(x.tasks, []), result: j(x.result, null) })), evidence: flagged, checks, generatedAt: now(), user: { name: u.name, email: u.email } })
})

api.get('/me/docs', async (c) => c.json({ docs: (await c.env.DB.prepare('SELECT id, name, size, chunks, task_pages, created_at FROM docs WHERE complete = 1 ORDER BY id DESC').all<any>()).results.map((d) => ({ ...d, task_pages: j(d.task_pages, {}) })) }))

api.get('/me/docs/:id/:idx', async (c) => {
  const r = await c.env.DB.prepare('SELECT c.body FROM doc_chunks c JOIN docs d ON d.id = c.doc_id WHERE d.complete = 1 AND c.doc_id = ? AND c.idx = ?').bind(Number(c.req.param('id')), Number(c.req.param('idx'))).first<{ body: string }>()
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.body(r.body, 200, { 'content-type': 'text/plain', 'cache-control': 'private, max-age=86400' })
})

api.get('/jobs', async (c) => {
  const u = c.get('user')
  const all = c.req.query('all') === '1' && (u.role === 'owner' || u.role === 'admin')
  const { results } = await (all
    ? c.env.DB.prepare('SELECT j.*, u.email FROM jobs j JOIN users u ON u.id = j.user_id ORDER BY j.id DESC LIMIT 100')
    : c.env.DB.prepare('SELECT j.*, u.email FROM jobs j JOIN users u ON u.id = j.user_id WHERE j.user_id = ? ORDER BY j.id DESC LIMIT 50').bind(u.id)).all<any>()
  return c.json({ jobs: results.map(jobView) })
})

api.post('/jobs', async (c) => {
  const u = c.get('user')
  const b = await c.req.json().catch(() => ({}))
  const sapUser = String(b.sapUser || '').toUpperCase().trim()
  const acc = await c.env.DB.prepare('SELECT * FROM sap_accounts WHERE sap_user = ?').bind(sapUser).first<any>()
  if (!acc) return c.json({ error: 'That SAP account is not on the allowlist' }, 403)
  if (u.role !== 'owner' && u.role !== 'admin') {
    const g = await c.env.DB.prepare('SELECT 1 FROM grants WHERE user_id = ? AND account_id = ?').bind(u.id, acc.id).first()
    if (!g) return c.json({ error: 'The owner has not granted you this SAP account' }, 403)
  }
  await recoverStale(c)
  const busy = await c.env.DB.prepare(`SELECT id FROM jobs WHERE sap_user = ? AND status IN (${ACTIVE.map(() => '?').join(',')})`).bind(sapUser, ...ACTIVE).first<{ id: number }>()
  if (busy) return c.json({ error: `Job #${busy.id} is already active on ${sapUser}. SAP allows one dialog session per run.`, jobId: busy.id }, 409)
  const tasks = (Array.isArray(b.tasks) ? b.tasks : []).map(Number).filter((n: number) => n >= 1 && n <= 14)
  const mode = ['assist', 'auto', 'observe', 'validate'].includes(b.mode) ? b.mode : 'assist'
  const plan = planOf(sapUser, tasks, mode)
  const secret = b.password ? await seal(secretOf(c), String(b.password)) : null
  const r = await c.env.DB.prepare('INSERT INTO jobs (user_id, account_id, sap_user, tasks, mode, status, step_total, secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.id, acc.id, sapUser, JSON.stringify(tasks.length ? tasks : plan.steps.map((s: any) => s.task).filter((v: number, i: number, a: number[]) => a.indexOf(v) === i)), mode, 'queued', plan.steps.length, secret, now()).run()
  const id = Number(r.meta.last_row_id)
  await event(c, id, 'info', `Queued ${plan.steps.length} steps for ${sapUser} (${plan.data.project}) in ${mode} mode`)
  const fleet = (await c.env.DB.prepare('SELECT r.accounts, r.last_seen, i.info FROM runners r LEFT JOIN runner_info i ON i.runner_id = r.id WHERE r.revoked = 0').all<any>()).results
  const able = fleet.filter((r) => {
    const lim = j<string[]>(r.accounts, [])
    const info = j<any>(r.info, {}) || {}
    const only = Array.isArray(info.only) ? info.only : []
    const pw = !!secret || (info.accountsWithPassword || []).includes(sapUser)
    return (!lim.length || lim.includes(sapUser)) && (!only.length || only.includes(sapUser)) && pw
  })
  const online = able.filter((r) => r.last_seen && now() - r.last_seen < ONLINE_MS)
  const warning = !able.length
    ? `No runner can take ${sapUser}: every runner is limited to other accounts or holds no password for it. Enter the SAP password here, or add ${sapUser} to a runner's SAP_ACCOUNTS / limit.`
    : !online.length ? `A runner can take ${sapUser} but none is online right now. The job waits in the queue until one connects.` : null
  if (warning) await event(c, id, 'warn', warning)
  await audit(c, u.id, 'job.create', { id, sapUser, tasks, mode })
  return c.json({ id, warning })
})

api.get('/jobs/:id', async (c) => {
  const job = await jobFor(c, Number(c.req.param('id')))
  if (!job) return c.json({ error: 'Not found' }, 404)
  const after = Number(c.req.query('after') || 0)
  const events = (await c.env.DB.prepare('SELECT id, step_key, level, message, data, created_at FROM events WHERE job_id = ? AND id > ? ORDER BY id LIMIT 300').bind(job.id, after).all<any>()).results.map((e) => ({ ...e, data: j(e.data, null) }))
  const evidence = (await c.env.DB.prepare('SELECT id, task, name, caption, kind, mime, created_at FROM evidence WHERE job_id = ? ORDER BY id').bind(job.id).all<any>()).results
  return c.json({ job: jobView(job), events, evidence })
})

api.get('/jobs/:id/plan', async (c) => {
  const job = await jobFor(c, Number(c.req.param('id')))
  if (!job) return c.json({ error: 'Not found' }, 404)
  return c.json(planOf(job.sap_user, j(job.tasks, []), job.mode))
})

api.get('/jobs/:id/frame', async (c) => {
  const job = await jobFor(c, Number(c.req.param('id')))
  if (!job) return c.json({ error: 'Not found' }, 404)
  const since = Number(c.req.query('since') || -1)
  if (hasWatch && ACTIVE.includes(job.status) && !(job.watched_at > now() - WATCH_WRITE_MS)) await soft(c.env.DB.prepare('UPDATE jobs SET watched_at = ? WHERE id = ? AND (watched_at IS NULL OR watched_at < ?)').bind(now(), job.id, now() - WATCH_WRITE_MS).run())
  const f = await c.env.DB.prepare('SELECT seq, width, height, image, dom, url, title, statusbar, updated_at FROM frames WHERE job_id = ?').bind(job.id).first<any>()
  if (!f) return c.body(null, 204)
  if (f.seq <= since) return c.body(null, 204)
  return c.json({ ...f, dom: j(f.dom, null) })
})

api.post('/jobs/:id/commands', async (c) => {
  const job = await jobFor(c, Number(c.req.param('id')))
  if (!job) return c.json({ error: 'Not found' }, 404)
  if (!ACTIVE.includes(job.status)) return c.json({ error: `Job is ${job.status}` }, 409)
  const b = await c.req.json().catch(() => ({}))
  const allowed = ['click', 'dblclick', 'type', 'key', 'scroll', 'pause', 'resume', 'step', 'skip', 'retry', 'continue', 'abort', 'capture', 'goto', 'fill']
  const list = (Array.isArray(b) ? b : [b]).filter((x: any) => allowed.includes(x?.type)).slice(0, 40)
  if (!list.length) return c.json({ error: 'No valid command' }, 400)
  if (['observe', 'validate'].includes(job.mode) && list.some((x: any) => ['click', 'dblclick', 'type', 'key', 'scroll', 'goto', 'fill'].includes(x.type))) return c.json({ error: `${job.mode === 'validate' ? 'Validate' : 'Observe'} mode is read-only` }, 403)
  const u = c.get('user')
  const stmt = c.env.DB.prepare('INSERT INTO commands (job_id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)')
  await c.env.DB.batch(list.map((x: any) => { const { type, ...payload } = x; return stmt.bind(job.id, u.id, type, JSON.stringify(payload), now()) }))
  if (list.some((x: any) => x.type === 'abort') && job.status === 'queued') {
    await c.env.DB.prepare("UPDATE jobs SET status = 'aborted', finished_at = ?, secret = NULL WHERE id = ?").bind(now(), job.id).run()
    await event(c, job.id, 'warn', 'Aborted before a runner claimed it')
  }
  return c.json({ ok: true, queued: list.length })
})

api.get('/jobs/:id/evidence/:eid', async (c) => {
  const job = await jobFor(c, Number(c.req.param('id')))
  if (!job) return c.json({ error: 'Not found' }, 404)
  const e = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ? AND job_id = ?').bind(Number(c.req.param('eid')), job.id).first<any>()
  if (!e) return c.json({ error: 'Not found' }, 404)
  if (e.kind === 'dom') return c.body(e.body, 200, { 'content-type': e.mime, 'content-disposition': `attachment; filename="${e.name}.json"` })
  const bin = Uint8Array.from(atob(e.body), (ch) => ch.charCodeAt(0))
  return c.body(bin, 200, { 'content-type': e.mime, 'cache-control': 'private, max-age=86400', 'content-disposition': `${c.req.query('dl') ? 'attachment' : 'inline'}; filename="${e.name}.${e.mime.split('/')[1]}"` })
})

api.get('/admin/overview', async (c) => {
  const users = (await c.env.DB.prepare(`SELECT id, email, name, role, status, note, created_at, decided_at FROM users ORDER BY status = 'pending' DESC, created_at DESC`).all<any>()).results
  const accounts = (await c.env.DB.prepare('SELECT * FROM sap_accounts ORDER BY sap_user').all<any>()).results
  const grants = (await c.env.DB.prepare('SELECT * FROM grants').all<any>()).results
  const runners = (await c.env.DB.prepare('SELECT id, name, accounts, version, last_seen, revoked, created_at FROM runners ORDER BY id DESC').all<any>()).results.map((r) => ({ ...r, accounts: j(r.accounts, []), online: !!r.last_seen && now() - r.last_seen < ONLINE_MS }))
  const auditRows = (await c.env.DB.prepare('SELECT a.*, u.email FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 80').all<any>()).results
  return c.json({ users, accounts, grants, runners, audit: auditRows, registration: await setting(c, 'registration', 'open') })
})

api.post('/admin/users/:id', async (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  const b = await c.req.json().catch(() => ({}))
  const target = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>()
  if (!target) return c.json({ error: 'Not found' }, 404)
  if (target.role === 'owner' && me.role !== 'owner') return c.json({ error: 'Only the owner can change the owner' }, 403)
  if (target.id === me.id && b.status && b.status !== 'approved') return c.json({ error: 'You cannot lock yourself out' }, 400)
  if (b.status && ['approved', 'rejected', 'suspended', 'pending'].includes(b.status)) {
    await c.env.DB.prepare('UPDATE users SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').bind(b.status, now(), me.id, id).run()
    if (b.status !== 'approved') await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  }
  if (b.role && ['user', 'admin'].includes(b.role) && me.role === 'owner' && target.role !== 'owner') await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(b.role, id).run()
  if (Array.isArray(b.accounts)) {
    await c.env.DB.prepare('DELETE FROM grants WHERE user_id = ?').bind(id).run()
    const ins = c.env.DB.prepare('INSERT OR IGNORE INTO grants (user_id, account_id, created_at) VALUES (?, ?, ?)')
    if (b.accounts.length) await c.env.DB.batch(b.accounts.map((a: number) => ins.bind(id, Number(a), now())))
  }
  await audit(c, me.id, 'admin.user', { id, ...b })
  return c.json({ ok: true })
})

api.post('/admin/accounts', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const list = [...new Set(String(b.sapUser || '').toUpperCase().split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))]
  if (!list.length) return c.json({ error: 'Enter at least one LEARN-###' }, 400)
  const bad = list.filter((x) => !suffixOf(x))
  if (bad.length) return c.json({ error: `Not LEARN-### (three digits): ${bad.join(', ')}` }, 400)
  const ins = c.env.DB.prepare('INSERT OR IGNORE INTO sap_accounts (sap_user, client, label, created_at) VALUES (?, ?, ?, ?)')
  await c.env.DB.batch(list.map((u) => ins.bind(u, SAP_CLIENT, String(b.label || '').slice(0, 80) || null, now())))
  await audit(c, c.get('user').id, 'admin.account.add', { sapUsers: list })
  return c.json({ ok: true, added: list })
})

api.delete('/admin/accounts/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM grants WHERE account_id = ?').bind(id), c.env.DB.prepare('DELETE FROM sap_accounts WHERE id = ?').bind(id)])
  await audit(c, c.get('user').id, 'admin.account.remove', { id })
  return c.json({ ok: true })
})

api.post('/admin/runners', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const token = `ucr_${randomToken(32)}`
  const accounts = (Array.isArray(b.accounts) ? b.accounts : []).map((s: string) => String(s).toUpperCase()).filter((s: string) => suffixOf(s))
  await c.env.DB.prepare('INSERT INTO runners (name, token_hash, accounts, created_at) VALUES (?, ?, ?, ?)').bind(String(b.name || 'runner').slice(0, 60), await sha256(token), JSON.stringify(accounts), now()).run()
  await audit(c, c.get('user').id, 'admin.runner.create', { name: b.name, accounts })
  return c.json({ token })
})

api.put('/admin/runners/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const raw = Array.isArray(b.accounts) ? b.accounts : String(b.accounts || '').split(/[\s,;]+/)
  const accounts = [...new Set(raw.map((s: string) => String(s).toUpperCase().trim()).filter(Boolean))]
  const bad = accounts.filter((s) => !suffixOf(s))
  if (bad.length) return c.json({ error: `Not LEARN-### (three digits): ${bad.join(', ')}` }, 400)
  const r = await c.env.DB.prepare('UPDATE runners SET accounts = ? WHERE id = ? AND revoked = 0').bind(JSON.stringify(accounts), Number(c.req.param('id'))).run()
  if (!r.meta.changes) return c.json({ error: 'Runner not found or revoked' }, 404)
  await audit(c, c.get('user').id, 'admin.runner.limit', { id: c.req.param('id'), accounts })
  return c.json({ ok: true, accounts })
})

api.delete('/admin/runners/:id', async (c) => {
  await c.env.DB.prepare('UPDATE runners SET revoked = 1 WHERE id = ?').bind(Number(c.req.param('id'))).run()
  await audit(c, c.get('user').id, 'admin.runner.revoke', { id: c.req.param('id') })
  return c.json({ ok: true })
})

const USAGE_LIMITS = { rowsWritten: 100_000, rowsRead: 5_000_000 }
let usageCache: { at: number; body: any } | null = null
api.get('/admin/usage', async (c) => {
  const day = new Date().toISOString().slice(0, 10)
  const base = { day, resetsAt: nextUtcMidnight(), limits: USAGE_LIMITS, quota: quotaNow() }
  if (!c.env.CF_ACCOUNT_ID || !c.env.CF_ANALYTICS_TOKEN) return c.json({ ...base, configured: false })
  if (usageCache && now() - usageCache.at < 60_000 && usageCache.body.day === day) return c.json({ ...usageCache.body, quota: quotaNow() })
  const query = 'query($a: string!, $d: Date!) { viewer { accounts(filter: { accountTag: $a }) { d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $d, date_leq: $d }) { sum { rowsRead rowsWritten } dimensions { databaseId } } } } }'
  let data: any = {}, status = 0
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.env.CF_ANALYTICS_TOKEN}` }, body: JSON.stringify({ query, variables: { a: c.env.CF_ACCOUNT_ID, d: day } }) })
    status = res.status
    data = await res.json().catch(() => ({}))
  } catch (e: any) { data = { errors: [{ message: e.message }] } }
  if (status !== 200 || data.errors?.length) return c.json({ ...base, configured: true, error: data.errors?.[0]?.message || `Cloudflare analytics HTTP ${status}` })
  const groups = data.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || []
  const databases = groups.map((g: any) => ({ id: g.dimensions?.databaseId, rowsRead: g.sum?.rowsRead || 0, rowsWritten: g.sum?.rowsWritten || 0 })).sort((x: any, y: any) => y.rowsWritten - x.rowsWritten)
  const total = databases.reduce((t: any, g: any) => ({ rowsRead: t.rowsRead + g.rowsRead, rowsWritten: t.rowsWritten + g.rowsWritten }), { rowsRead: 0, rowsWritten: 0 })
  const body = { ...base, configured: true, source: 'cloudflare-graphql', total, databases }
  usageCache = { at: now(), body }
  return c.json(body)
})

api.post('/admin/settings', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (b.registration && ['open', 'closed'].includes(b.registration)) await c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('registration', b.registration).run()
  await audit(c, c.get('user').id, 'admin.settings', b)
  return c.json({ ok: true })
})

api.post('/admin/docs', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const size = Number(b.size) || 0
  if (!/\.pdf$/i.test(String(b.name || '')) || size <= 0 || size > DOC_MAX) return c.json({ error: 'Upload a PDF up to 20 MB' }, 400)
  const chunks = Math.ceil((Math.ceil(size / 3) * 4) / DOC_CHUNK)
  const r = await c.env.DB.prepare('INSERT INTO docs (name, size, chunks, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(String(b.name).slice(0, 120), size, chunks, c.get('user').id, now()).run()
  return c.json({ id: Number(r.meta.last_row_id), chunks, chunkSize: DOC_CHUNK })
})

api.put('/admin/docs/:id/:idx', async (c) => {
  const id = Number(c.req.param('id')), idx = Number(c.req.param('idx'))
  const d = await c.env.DB.prepare('SELECT * FROM docs WHERE id = ?').bind(id).first<any>()
  if (!d || !(idx >= 0 && idx < d.chunks)) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.text()
  if (!body || body.length > DOC_CHUNK || !/^[A-Za-z0-9+/=]+$/.test(body)) return c.json({ error: 'Bad chunk' }, 400)
  if (idx === 0 && !atob(body.slice(0, 8)).startsWith('%PDF')) return c.json({ error: 'That file is not a PDF' }, 400)
  await c.env.DB.prepare('INSERT OR REPLACE INTO doc_chunks (doc_id, idx, body) VALUES (?, ?, ?)').bind(id, idx, body).run()
  const n = (await c.env.DB.prepare('SELECT COUNT(*) n FROM doc_chunks WHERE doc_id = ?').bind(id).first<{ n: number }>())?.n || 0
  if (n === d.chunks && !d.complete) { await c.env.DB.prepare('UPDATE docs SET complete = 1 WHERE id = ?').bind(id).run(); await audit(c, c.get('user').id, 'admin.doc.upload', { id, name: d.name, size: d.size }) }
  return c.json({ ok: true, complete: n === d.chunks })
})

api.post('/admin/docs/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const pages: Record<string, number> = {}
  for (const [k, v] of Object.entries(b.taskPages || {})) if (Number(k) >= 1 && Number(k) <= 14 && Number(v) >= 1) pages[k] = Math.floor(Number(v))
  await c.env.DB.prepare('UPDATE docs SET task_pages = ? WHERE id = ?').bind(JSON.stringify(pages), Number(c.req.param('id'))).run()
  return c.json({ ok: true, taskPages: pages })
})

api.delete('/admin/docs/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM doc_chunks WHERE doc_id = ?').bind(id), c.env.DB.prepare('DELETE FROM docs WHERE id = ?').bind(id)])
  await audit(c, c.get('user').id, 'admin.doc.remove', { id })
  return c.json({ ok: true })
})

api.post('/runner/hello', async (c) => {
  const r = c.get('runner')
  const b = await c.req.json().catch(() => ({}))
  if (b.info && !b.info.doctor) {
    const info = { ...b.info, sap: b.info.sap && Number.isFinite(b.info.sap.ms) ? { ...b.info.sap, ms: Math.round(b.info.sap.ms / 500) * 500 } : b.info.sap }
    await soft(c.env.DB.prepare('INSERT INTO runner_info (runner_id, info, updated_at) VALUES (?, ?, ?) ON CONFLICT(runner_id) DO UPDATE SET info = excluded.info, updated_at = excluded.updated_at WHERE runner_info.info IS NOT excluded.info OR runner_info.updated_at < ?').bind(r.id, JSON.stringify(info).slice(0, 8000), now(), now() - 6 * 36e5).run())
  }
  return c.json({ ok: true, name: r.name, accounts: j<string[]>(r.accounts, []), latest: RUNNER_LATEST, quota: quotaNow() })
})

api.post('/runner/claim', async (c) => {
  const r = c.get('runner')
  const b = await c.req.json().catch(() => ({}))
  const local = (Array.isArray(b.accounts) ? b.accounts : []).map((s: string) => String(s).toUpperCase())
  const allowed = j<string[]>(r.accounts, [])
  const only = (Array.isArray(b.only) ? b.only : []).map((s: string) => String(s).toUpperCase())
  const busy = (Array.isArray(b.busy) ? b.busy : []).map((s: string) => String(s).toUpperCase())
  await recoverStale(c)
  if (Array.isArray(b.active)) {
    const live = b.active.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
    const keep = live.length ? ` AND id NOT IN (${live.map(() => '?').join(',')})` : ''
    const lost = (await c.env.DB.prepare(`SELECT id FROM jobs WHERE runner_id = ? AND status IN ('claimed', 'running', 'paused', 'waiting')${keep}`).bind(r.id, ...live).all<{ id: number }>()).results
    for (const d of lost) {
      if (quotaNow()) break
      await soft(c.env.DB.prepare("UPDATE jobs SET status = 'failed', finished_at = ?, secret = NULL, prompt = NULL, result = ? WHERE id = ?").bind(now(), JSON.stringify({ summary: 'Runner restarted while this job was open; job closed so the SAP account is free. Start a new run to continue.' }), d.id).run())
      await soft(event(c, d.id, 'error', `Runner "${r.name}" restarted and no longer holds this job. Job closed; start a new run (finished tasks are skipped).`))
    }
  }
  const skip = busy.length ? ` AND sap_user NOT IN (${busy.map(() => '?').join(',')})` : ''
  const { results } = await c.env.DB.prepare(`SELECT * FROM jobs WHERE status = 'queued'${skip} ORDER BY id LIMIT 500`).bind(...busy).all<any>()
  const job = results.find((x) => (allowed.length === 0 || allowed.includes(x.sap_user)) && (only.length === 0 || only.includes(x.sap_user)) && !busy.includes(x.sap_user) && (local.includes(x.sap_user) || !!x.secret))
  if (!job) return c.json({ job: null, quota: quotaNow() })
  const upd = await soft(c.env.DB.prepare("UPDATE jobs SET status = 'claimed', runner_id = ?, started_at = ? WHERE id = ? AND status = 'queued'").bind(r.id, now(), job.id).run())
  if (!upd) return c.json({ job: null, quota: quotaNow() })
  if (!upd.meta.changes) return c.json({ job: null })
  const password = job.secret ? await open(secretOf(c), job.secret).catch(() => null) : null
  await c.env.DB.prepare('UPDATE jobs SET secret = NULL WHERE id = ?').bind(job.id).run()
  await event(c, job.id, 'info', `Claimed by runner "${r.name}"`)
  return c.json({ job: { id: job.id, sapUser: job.sap_user, mode: job.mode, tasks: j(job.tasks, []), password }, plan: planOf(job.sap_user, j(job.tasks, []), job.mode) })
})

const runnerJob = async (c: Context<Env>) => {
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND runner_id = ?').bind(Number(c.req.param('id')), c.get('runner').id).first<any>()
  return job
}

api.post('/runner/jobs/:id/state', async (c) => {
  const job = await runnerJob(c)
  if (!job) return c.json({ error: 'Not your job' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const status = ['running', 'paused', 'waiting', 'done', 'failed', 'aborted'].includes(b.status) ? b.status : job.status
  const final = ['done', 'failed', 'aborted'].includes(status)
  const stepIdx = Number.isFinite(b.stepIdx) ? b.stepIdx : job.step_idx
  const prompt = b.prompt ? JSON.stringify(b.prompt) : null
  const result = b.result ? JSON.stringify(b.result) : job.result
  const writes: D1PreparedStatement[] = []
  if (status !== job.status || stepIdx !== job.step_idx || prompt !== job.prompt || result !== job.result)
    writes.push(c.env.DB.prepare('UPDATE jobs SET status = ?, step_idx = ?, prompt = ?, result = ?, finished_at = CASE WHEN ? AND finished_at IS NULL THEN ? ELSE finished_at END WHERE id = ?').bind(status, stepIdx, prompt, result, final ? 1 : 0, now(), job.id))
  const events = Array.isArray(b.events) ? b.events.slice(0, 50) : []
  if (events.length) {
    const stmt = c.env.DB.prepare('INSERT INTO events (job_id, step_key, level, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    writes.push(...events.map((e: any) => stmt.bind(job.id, e.stepKey || null, ['info', 'ok', 'warn', 'error', 'dom'].includes(e.level) ? e.level : 'info', String(e.message || '').slice(0, 2000), e.data ? JSON.stringify(e.data).slice(0, 20000) : null, now())))
  }
  const acking = Array.isArray(b.ack)
  const ack = acking ? b.ack.map(Number).filter(Number.isFinite).slice(0, 90) : []
  if (ack.length) writes.push(c.env.DB.prepare(`UPDATE commands SET status = 'delivered' WHERE job_id = ? AND status = 'pending' AND id IN (${ack.map(() => '?').join(',')})`).bind(job.id, ...ack))
  const stored = writes.length ? !!(await soft(c.env.DB.batch(writes))) : true
  if (!stored && !acking) throw new Error(LIMIT_MSG)
  const cmds = (await c.env.DB.prepare("SELECT id, type, payload FROM commands WHERE job_id = ? AND status = 'pending' ORDER BY id LIMIT 60").bind(job.id).all<any>()).results
  if (!acking && cmds.length) await soft(c.env.DB.prepare(`UPDATE commands SET status = 'delivered' WHERE id IN (${cmds.map(() => '?').join(',')})`).bind(...cmds.map((x) => x.id)).run())
  return c.json({ commands: cmds.map((x) => ({ id: x.id, type: x.type, ...j(x.payload, {}) })), stored, watched: !hasWatch || job.watched_at > now() - WATCH_MS, quota: stored ? null : quotaNow() })
})

api.post('/runner/jobs/:id/frame', async (c) => {
  const job = await runnerJob(c)
  if (!job) return c.json({ error: 'Not your job' }, 404)
  const b = await c.req.json().catch(() => ({}))
  if (!b.image || String(b.image).length > FRAME_MAX) return c.json({ error: 'Frame missing or too large' }, 413)
  const watched = !hasWatch || job.watched_at > now() - WATCH_MS
  if (!watched && !b.final && ACTIVE.includes(job.status)) return c.json({ ok: true, stored: false, watched })
  const dom = b.dom ? JSON.stringify(b.dom).slice(0, 180000) : null
  await c.env.DB.prepare('INSERT INTO frames (job_id, seq, width, height, image, dom, url, title, statusbar, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET seq = excluded.seq, width = excluded.width, height = excluded.height, image = excluded.image, dom = excluded.dom, url = excluded.url, title = excluded.title, statusbar = excluded.statusbar, updated_at = excluded.updated_at')
    .bind(job.id, Number(b.seq) || 0, Number(b.width) || 0, Number(b.height) || 0, b.image, dom, String(b.url || '').replace(/sap-password=[^&]*/gi, ''), String(b.title || '').slice(0, 200), String(b.statusbar || '').slice(0, 500), now()).run()
  return c.json({ ok: true, stored: true, watched })
})

api.post('/runner/jobs/:id/evidence', async (c) => {
  const job = await runnerJob(c)
  if (!job) return c.json({ error: 'Not your job' }, 404)
  const b = await c.req.json().catch(() => ({}))
  if (!b.body || String(b.body).length > EVIDENCE_MAX) return c.json({ error: 'Evidence missing or too large' }, 413)
  const r = await c.env.DB.prepare('INSERT INTO evidence (job_id, task, name, caption, kind, mime, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(job.id, Number(b.task) || null, String(b.name || 'capture').slice(0, 80), String(b.caption || '').slice(0, 400), b.kind === 'dom' ? 'dom' : 'screenshot', String(b.mime || 'image/jpeg'), b.body, now()).run()
  return c.json({ id: Number(r.meta.last_row_id) })
})
