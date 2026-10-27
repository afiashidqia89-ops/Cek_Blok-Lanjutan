import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, signSession, COOKIE_NAME, sessionCookieOptions } from '@/lib/auth'
import { ensureSuperAdminExists } from '@/lib/superadmin'
import { logAudit } from '@/lib/log'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'Username dan password wajib diisi' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { username } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await logAudit({ username }, 'LOGIN_GAGAL', `username: ${username}`)
    return NextResponse.json({ ok: false, error: 'Username atau password salah' }, { status: 401 })
  }
  if (!user.isActive) {
    return NextResponse.json({ ok: false, error: 'Akun dinonaktifkan. Hubungi admin.' }, { status: 403 })
  }

  // Pastikan ada Super Admin; bila belum ada, akun admin tertua otomatis dinaikkan
  // sehingga peran terbaru ikut tersimpan dalam sesi yang baru dibuat.
  await ensureSuperAdminExists()
  const roleKini = (await db.user.findUnique({ where: { id: user.id }, select: { role: true } }))?.role || user.role

  const session = { uid: user.id, username: user.username, name: user.name, role: roleKini as 'SUPERADMIN' | 'ADMIN' | 'USER' }
  const token = await signSession(session)
  await logAudit(session, 'LOGIN', 'Login berhasil')

  const res = NextResponse.json({ ok: true, user: session })
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions())
  return res
}
