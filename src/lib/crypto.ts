import { b64 } from './auth'

const enc = new TextEncoder()
const dec = new TextDecoder()

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const keyFor = async (secret: string) => {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export const seal = async (secret: string, plain: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(secret), enc.encode(plain))
  return `${b64(iv)}.${b64(ct)}`
}

export const open = async (secret: string, sealed: string) => {
  const [iv, ct] = sealed.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await keyFor(secret), fromB64(ct))
  return dec.decode(pt)
}
