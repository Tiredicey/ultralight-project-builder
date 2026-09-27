import { readFileSync, existsSync } from 'node:fs'

// Loads runner/.env (KEY=value lines) without overriding variables already set, e.g. by systemd.
export function loadEnv(file = new URL('../.env', import.meta.url)) {
  if (!existsSync(file)) return false
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return true
}

export const localAccounts = () => Object.fromEntries((process.env.SAP_ACCOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(':'); return i > 0 ? [s.slice(0, i).toUpperCase(), s.slice(i + 1)] : [s.toUpperCase(), ''] }))
