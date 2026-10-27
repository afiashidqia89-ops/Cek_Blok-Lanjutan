import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildTransferFile } from '@/lib/ingest'

type Ctx = { params: Promise<{ token: string }> }

/**
 * Unduhan publik berkas transfer (tanpa login, via tautan berbagi).
 * Output: berkas JSON format aplikasi Cek Blok — bisa langsung
 * digabung lewat menu "Terima & Gabung Data".
 */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const exp = await db.dataExport.findUnique({ where: { token } })
  if (!exp || !exp.isActive) {
    return NextResponse.json({ ok: false, error: 'Tautan tidak ditemukan / sudah dinonaktifkan' }, { status: 404 })
  }

  const where: Record<string, unknown> = {}
  if (exp.tanggalFrom || exp.tanggalTo) {
    where.tanggal = {}
    if (exp.tanggalFrom) (where.tanggal as Record<string, string>).gte = exp.tanggalFrom
    if (exp.tanggalTo) (where.tanggal as Record<string, string>).lte = exp.tanggalTo
  }
  if (exp.kebun) where.kebun = { contains: exp.kebun }
  if (exp.afdeling) where.afdeling = { contains: exp.afdeling }
  if (exp.blok) where.blok = { contains: exp.blok }
  if (exp.pemeriksa) where.pemeriksa = { contains: exp.pemeriksa }

  const rows = await db.dataRecord.findMany({
    where,
    orderBy: [{ tanggal: 'asc' }, { savedAt: 'asc' }],
    select: { payload: true },
  })
  const file = buildTransferFile(rows.map((r) => r.payload), { perangkat: 'SERVER', withPhoto: exp.withPhoto })

  db.dataExport.update({ where: { id: exp.id }, data: { downloads: { increment: 1 } } }).catch(() => {})

  const stamp = new Date().toISOString().slice(0, 10)
  const safeName = String(exp.name || 'CekBlok').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)
  return new NextResponse(JSON.stringify(file), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}_${stamp}.json"`,
    },
  })
}
