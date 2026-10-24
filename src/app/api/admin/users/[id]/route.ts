import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/log'

type Ctx = { params: Promise<{ id: string }> }

/** Update user: nama, role, aktif/nonaktif, reset password */
export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const { id } = await ctx.params

  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ ok: false, error: 'User tidak ditemukan' }, { status: 404 })

  let body: { name?: string; role?: string; isActive?: boolean; password?: string; kebun?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.kebun === 'string') data.kebun = body.kebun.trim().toUpperCase()
  if (body.role === 'ADMIN' || body.role === 'USER') {
    if (target.id === admin.uid && body.role === 'USER') {
      return NextResponse.json({ ok: false, error: 'Tidak bisa menurunkan role akun sendiri' }, { status: 400 })
    }
    data.role = body.role
  }
  if (typeof body.isActive === 'boolean') {
    if (target.id === admin.uid && body.isActive === false) {
      return NextResponse.json({ ok: false, error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 })
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
    select: { id: true, username: true, name: true, role: true, isActive: true, kebun: true },
  })
  await logAudit(admin, 'UBAH_USER', `username: ${target.username}, fields: ${Object.keys(data).join(',')}`)
  return NextResponse.json({ ok: true, user })
}

/** Hapus user (data pemeriksaannya tetap tersimpan) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const { id } = await ctx.params

  if (id === admin.uid) {
    return NextResponse.json({ ok: false, error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 })
  }
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ ok: false, error: 'User tidak ditemukan' }, { status: 404 })

  await db.user.delete({ where: { id } })
  await logAudit(admin, 'HAPUS_USER', `username: ${target.username}`)
  return NextResponse.json({ ok: true })
}
