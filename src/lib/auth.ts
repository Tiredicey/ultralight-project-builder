const enc = new TextEncoder()

export const now = () => Date.now()

export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export const randomToken = (n = 32) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return b64(a).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const sha256 = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)))

export const hashPassword = async (password: string, salt?: string) => {
  const s = salt || randomToken(16)
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(s), iterations: 100000 }, key, 256)
  return { hash: b64(bits), salt: s }
}

export const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export const verifyPassword = async (password: string, hash: string, salt: string) => safeEqual((await hashPassword(password, salt)).hash, hash)

export const emailOk = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e)
