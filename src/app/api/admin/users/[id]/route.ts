import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, requireSuperAdmin, normRole, hashPassword } from '@/lib/auth'
import { splitList, dbErrorResponse } from '@/lib/api'
import { logAudit } from '@/lib/log'

type Ctx = { params: Promise<{ id: string }> }

/** Terima input ceklis: array/string → string dipisah koma, HURUF BESAR */
function joinList(v: unknown): string {
  const arr = Array.isArray(v)
    ? v.map((x) => String(x ?? '').trim()).filter(Boolean)
    : splitList(typeof v === 'string' ? v : '')
  return [...new Set(arr.map((x) => x.toUpperCase()))].join(', ')
}

/** Update user: nama, role, penugasan ceklis, aktif/nonaktif, reset password */
export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const { id } = await ctx.params

  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ ok: false, error: 'User tidak ditemukan' }, { status: 404 })

  let body: {
    name?: string; role?: string; isActive?: boolean; password?: string
    kebun?: unknown; estate?: unknown; afdeling?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (body.estate !== undefined) data.estate = joinList(body.estate)
  if (body.kebun !== undefined) data.kebun = joinList(body.kebun)
  if (body.afdeling !== undefined) data.afdeling = joinList(body.afdeling)
  if (body.role !== undefined) {
    const newRole = normRole(body.role)
    const bolehRole = admin.role === 'SUPERADMIN'
    if (newRole !== 'USER' && !bolehRole) {
      return NextResponse.json({ ok: false, error: 'Hanya Super Admin yang bisa mengatur peran Admin' }, { status: 403 })
    }
    if (target.role === 'SUPERADMIN' && admin.role !== 'SUPERADMIN') {
      return NextResponse.json({ ok: false, error: 'Hanya Super Admin yang bisa mengubah akun Super Admin' }, { status: 403 })
    }
    if (target.id === admin.uid && newRole !== target.role && newRole !== 'SUPERADMIN') {
      return NextResponse.json({ ok: false, error: 'Tidak bisa menurunkan peran akun sendiri' }, { status: 400 })
    }
    data.role = newRole
  }
  if (typeof body.isActive === 'boolean') {
    if (target.id === admin.uid && body.isActive === false) {
      return NextResponse.json({ ok: false, error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 })
    }
    if (target.role === 'SUPERADMIN' && admin.role !== 'SUPERADMIN') {
      return NextResponse.json({ ok: false, error: 'Hanya Super Admin yang bisa menonaktifkan akun Super Admin' }, { status: 403 })
    }
    data.isActive = body.isActive
  }
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password minimal 6 karakter' }, { status: 400 })
    }
    data.passwordHash = await hashPassword(body.password)
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, role: true, isActive: true, estate: true, kebun: true, afdeling: true },
  })
  await logAudit(admin, 'UBAH_USER', `username: ${target.username}, fields: ${Object.keys(data).join(',')}`)
  return NextResponse.json({ ok: true, user })
}

/** Hapus user (data pemeriksaannya tetap tersimpan) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus Super Admin' }, { status: 403 })
  const { id } = await ctx.params

  if (id === admin.uid) {
    return NextResponse.json({ ok: false, error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 })
  }
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ ok: false, error: 'User tidak ditemukan' }, { status: 404 })
  if (target.role === 'SUPERADMIN') {
    return NextResponse.json({ ok: false, error: 'Akun Super Admin tidak bisa dihapus' }, { status: 400 })
  }

  await db.user.delete({ where: { id } })
  await logAudit(admin, 'HAPUS_USER', `username: ${target.username}`)
  return NextResponse.json({ ok: true })
}
