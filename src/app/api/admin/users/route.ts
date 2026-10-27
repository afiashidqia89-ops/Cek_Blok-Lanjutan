import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/log'
import { dbErrorResponse } from '@/lib/api'

/** Daftar semua user (admin) */
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, username: true, name: true, role: true, isActive: true, kebun: true,
        createdAt: true,
        _count: { select: { records: true, tokens: true } },
      },
    })
    return NextResponse.json({ ok: true, users })
  } catch (e) {
    return dbErrorResponse(e)
  }
}

/** Admin mendaftarkan user baru (fitur no. 5) */
export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })

  let body: { username?: string; name?: string; password?: string; role?: string; kebun?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const username = String(body.username || '').trim().toLowerCase()
  const name = String(body.name || '').trim() || username
  const password = String(body.password || '')
  const role = body.role === 'ADMIN' ? 'ADMIN' : 'USER'
  const kebun = String(body.kebun || '').trim().toUpperCase()

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { ok: false, error: 'Username 3-32 karakter: huruf kecil, angka, titik, garis bawah/strip' },
      { status: 400 }
    )
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: 'Password minimal 6 karakter' }, { status: 400 })
  }
  const exists = await db.user.findUnique({ where: { username }, select: { id: true } })
  if (exists) {
    return NextResponse.json({ ok: false, error: 'Username sudah dipakai' }, { status: 409 })
  }
  try {
    const user = await db.user.create({
      data: { username, name, passwordHash: await hashPassword(password), role, kebun },
      select: { id: true, username: true, name: true, role: true, isActive: true, kebun: true, createdAt: true },
    })
    await logAudit(admin, 'BUAT_USER', `username: ${username}, role: ${role}${kebun ? `, kebun: ${kebun}` : ''}`)
    return NextResponse.json({ ok: true, user })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
