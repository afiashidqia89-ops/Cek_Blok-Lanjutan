import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

export const COOKIE_NAME = 'cb_session'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-cek-blok-ganti-di-produksi'
)

export type Role = 'ADMIN' | 'USER'

export interface SessionUser {
  uid: string
  username: string
  name: string
  role: Role
  kebun?: string
}

export function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 10)
}

export function verifyPassword(p: string, h: string): Promise<boolean> {
  return bcrypt.compare(p, h)
}

export async function signSession(u: SessionUser): Promise<string> {
  return await new SignJWT({ uid: u.uid, username: u.username, name: u.name, role: u.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    if (!payload.uid) return null
    return {
      uid: String(payload.uid),
      username: String(payload.username || ''),
      name: String(payload.name || ''),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
      kebun: String(payload.kebun ?? ''),
    }
  } catch {
    return null
  }
}

/** Ambil sesi user yang sedang login (dari cookie). kebun selalu FRESH dari DB */
export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies()
  const t = c.get(COOKIE_NAME)?.value
  if (!t) return null
  const s = await verifySessionToken(t)
  if (!s) return null
  // pastikan user masih ada & aktif + ambil kebun terkini (bisa berubah kapan saja oleh admin)
  const u = await db.user
    .findUnique({ where: { id: s.uid }, select: { isActive: true, kebun: true } })
    .catch(() => null)
  if (!u || !u.isActive) return null
  return { ...s, kebun: (u as { kebun?: string }).kebun || '' }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  }
}

/** Autentikasi token perangkat (Authorization: Bearer cbk_...) untuk API sinkronisasi aplikasi */
export async function authDevice(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const tk = await db.deviceToken.findUnique({ where: { token: m[1].trim() }, include: { user: true } })
  if (!tk || !tk.isActive || !tk.user || !tk.user.isActive) return null
  db.deviceToken.update({ where: { id: tk.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return tk
}

export function generateDeviceToken(): string {
  return 'cbk_' + randomBytes(24).toString('hex')
}

export function randomShareToken(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 24)
}

/** Guard sederhana untuk route handler */
export async function requireUser(): Promise<SessionUser | null> {
  return getSession()
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const s = await getSession()
  if (!s || s.role !== 'ADMIN') return null
  return s
}
