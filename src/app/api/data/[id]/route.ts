import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'
import { logAudit } from '@/lib/log'
import { dbErrorResponse, scopeKebun } from '@/lib/api'

type Ctx = { params: Promise<{ id: string }> }

/** Detail satu transaksi (payload lengkap: temuan, GPS, foto) */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const { id } = await ctx.params

  try {
    const settings = await getSettings()
    const seeAll = s.role === 'ADMIN' || boolSetting(settings.usersCanSeeAllData)
    const row = await db.dataRecord.findUnique({
      where: { id },
      include: { uploadedBy: { select: { username: true } } },
    })
    if (!row) return NextResponse.json({ ok: false, error: 'Data tidak ditemukan' }, { status: 404 })
    // lingkup kebun: user non-admin dengan kebun penugasan hanya boleh detail kebunnya
    const kb = scopeKebun(s)
    if (kb && String(row.kebun || '').trim() !== kb) {
      return NextResponse.json({ ok: false, error: 'Data di luar kebun Anda' }, { status: 403 })
    }
    if (!seeAll && row.uploadedById !== s.uid) {
      return NextResponse.json({ ok: false, error: 'Tidak berhak' }, { status: 403 })
    }
    return NextResponse.json({
      ok: true,
      row: { ...row, record: JSON.parse(row.payload) },
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}

/** Hapus satu transaksi: admin boleh semua, user hanya miliknya (jika diizinkan pengaturan) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const { id } = await ctx.params

  try {
    const row = await db.dataRecord.findUnique({ where: { id }, select: { id: true, uploadedById: true, kebun: true, kodeTransaksi: true } })
    if (!row) return NextResponse.json({ ok: false, error: 'Data tidak ditemukan' }, { status: 404 })

    const kb = scopeKebun(s)
    if (kb && String(row.kebun || '').trim() !== kb) {
      return NextResponse.json({ ok: false, error: 'Data di luar kebun Anda' }, { status: 403 })
    }

    if (s.role !== 'ADMIN') {
      const settings = await getSettings()
      const canDeleteOwn = boolSetting(settings.usersCanDeleteOwnData)
      if (!canDeleteOwn || row.uploadedById !== s.uid) {
        return NextResponse.json({ ok: false, error: 'Tidak berhak menghapus data ini' }, { status: 403 })
      }
    }
    await db.dataRecord.delete({ where: { id } })
    await logAudit(s, 'HAPUS_DATA', `kode: ${row.kodeTransaksi}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
