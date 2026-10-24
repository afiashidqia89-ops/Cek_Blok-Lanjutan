import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/log'

type Ctx = { params: Promise<{ id: string }> }

/** Hapus/cabut token perangkat (pemilik atau admin) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const { id } = await ctx.params

  const token = await db.deviceToken.findUnique({ where: { id }, include: { user: true } })
  if (!token) return NextResponse.json({ ok: false, error: 'Token tidak ditemukan' }, { status: 404 })
  if (token.userId !== s.uid && s.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'Tidak berhak' }, { status: 403 })
  }
  await db.deviceToken.delete({ where: { id } })
  await logAudit(s, 'HAPUS_TOKEN', `label: ${token.label}`)
  return NextResponse.json({ ok: true })
}
