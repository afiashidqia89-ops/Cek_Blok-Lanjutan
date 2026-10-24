import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { logAudit } from '@/lib/log'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/master/[id] (admin) — ubah satu blok: luas, jumlah pokok,
 * atau pindah afdeling/kebun/estate/blok.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const { id } = await ctx.params

  const existing = await db.blokMaster.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Blok tidak ditemukan' }, { status: 404 })

  let body: { luas?: unknown; pokok?: unknown; estate?: string; kebun?: string; afdeling?: string; blok?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.luas === null || body.luas === '') data.luas = null
  else if (body.luas !== undefined) {
    const n = Number(body.luas)
    if (!isFinite(n) || n < 0) return NextResponse.json({ ok: false, error: 'Luas tidak valid' }, { status: 400 })
    data.luas = n
  }
  if (body.pokok === null || body.pokok === '') data.pokok = null
  else if (body.pokok !== undefined) {
    const n = Math.round(Number(body.pokok))
    if (!isFinite(n) || n < 0) return NextResponse.json({ ok: false, error: 'Jumlah pokok tidak valid' }, { status: 400 })
    data.pokok = n
  }
  for (const k of ['estate', 'kebun', 'afdeling', 'blok'] as const) {
    if (typeof body[k] === 'string' && body[k]?.trim()) data[k] = body[k]!.trim()
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'Tidak ada perubahan' }, { status: 400 })
  }

  // pastikan kombinasi unik tetap unik
  const cek = { ...existing, ...data } as { estate: string; kebun: string; afdeling: string; blok: string }
  const dup = await db.blokMaster.findFirst({
    where: { estate: cek.estate, kebun: cek.kebun, afdeling: cek.afdeling, blok: cek.blok, NOT: { id } },
    select: { id: true },
  })
  if (dup) return NextResponse.json({ ok: false, error: 'Kombinasi kebun/afdeling/blok sudah ada' }, { status: 409 })

  const row = await db.blokMaster.update({ where: { id }, data })
  await logAudit(admin, 'MASTER_UBAH', `${cek.kebun}/${cek.afdeling}/${cek.blok}: ${Object.keys(data).join(',')}`)
  return NextResponse.json({ ok: true, row })
}

/** DELETE /api/master/[id] (admin) — hapus satu blok dari data master */
export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const { id } = await ctx.params

  const existing = await db.blokMaster.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Blok tidak ditemukan' }, { status: 404 })

  await db.blokMaster.delete({ where: { id } })
  await logAudit(admin, 'MASTER_HAPUS', `${existing.kebun}/${existing.afdeling}/${existing.blok}`)
  return NextResponse.json({ ok: true })
}
