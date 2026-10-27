import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, requireSuperAdmin, normRole, hashPassword } from '@/lib/auth'
import { splitList } from '@/lib/api'
import { logAudit } from '@/lib/log'
import { dbErrorResponse } from '@/lib/api'

/** Daftar semua user (admin / super admin) */
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, username: true, name: true, role: true, isActive: true,
        estate: true, kebun: true, afdeling: true,
        createdAt: true,
        _count: { select: { records: true, tokens: true } },
      },
    })
    return NextResponse.json({ ok: true, users })
  } catch (e) {
    return dbErrorResponse(e)
  }
}

/** Terima input ceklis: array/string → string dipisah koma, HURUF BESAR */
function joinList(v: unknown): string {
  const arr = Array.isArray(v)
    ? v.map((x) => String(x ?? '').trim()).filter(Boolean)
    : splitList(typeof v === 'string' ? v : '')
  return [...new Set(arr.map((x) => x.toUpperCase()))].join(', ')
}

/** Admin mendaftarkan user baru. Estate/Kebun/Afdeling berupa ceklis (array). */
export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })

  let body: {
    username?: string; name?: string; password?: string; role?: string
    kebun?: unknown; estate?: unknown; afdeling?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const username = String(body.username || '').trim().toLowerCase()
  const name = String(body.name || '').trim() || username
  const password = String(body.password || '')

  // role: hanya SUPERADMIN boleh membuat ADMIN/SUPERADMIN
  let role = 'USER'
  const reqRole = normRole(body.role)
  if (reqRole !== 'USER') {
    if (admin.role !== 'SUPERADMIN') {
      return NextResponse.json({ ok: false, error: 'Hanya Super Admin yang bisa membuat akun Admin' }, { status: 403 })
    }
    role = reqRole
  }

  const estate = joinList(body.estate)
  const kebun = joinList(body.kebun)
  const afdeling = joinList(body.afdeling)

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
      data: { username, name, passwordHash: await hashPassword(password), role, estate, kebun, afdeling },
      select: { id: true, username: true, name: true, role: true, isActive: true, estate: true, kebun: true, afdeling: true, createdAt: true },
    })
    await logAudit(
      admin,
      'BUAT_USER',
      `username: ${username}, role: ${role}${estate ? `, estate: ${estate}` : ''}${kebun ? `, kebun: ${kebun}` : ''}${afdeling ? `, afdeling: ${afdeling}` : ''}`
    )
    return NextResponse.json({ ok: true, user })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
