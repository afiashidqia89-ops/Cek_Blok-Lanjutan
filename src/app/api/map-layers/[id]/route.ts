import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAdmin } from '@/lib/auth'
import { logAudit } from '@/lib/log'

type Ctx = { params: Promise<{ id: string }> }

/** Ambil isi lengkap satu lapisan peta (geojson text / dataURL raster) */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const { id } = await ctx.params
  const row = await db.mapLayer.findUnique({ where: { id } })
  if (!row || !row.isActive) {
    return NextResponse.json({ ok: false, error: 'Lapisan tidak ditemukan' }, { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    layer: { id: row.id, name: row.name, type: row.type, content: row.content, meta: row.meta, sizeBytes: row.sizeBytes },
  })
}

/** Hapus lapisan peta (admin) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) {
    const s = await getSession()
    if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
    return NextResponse.json({ ok: false, error: 'Hanya admin yang bisa menghapus lapisan peta' }, { status: 403 })
  }
  const { id } = await ctx.params
  const row = await db.mapLayer.findUnique({ where: { id }, select: { name: true } })
  if (!row) return NextResponse.json({ ok: false, error: 'Lapisan tidak ditemukan' }, { status: 404 })
  await db.mapLayer.delete({ where: { id } })
  await logAudit(admin, 'PETA_DELETE', row.name)
  return NextResponse.json({ ok: true })
}
