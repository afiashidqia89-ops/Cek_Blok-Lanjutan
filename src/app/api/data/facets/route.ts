import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'
import { dbErrorResponse, scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * Daftar nilai unik untuk dropdown filter halaman Data & Peta:
 * kebun, afdeling, blok, pemeriksa (dipotong 200 nilai per field).
 * User non-admin dengan kebun penugasan: hanya melihat pilihan kebunnya.
 */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const settings = await getSettings()
    const seeAll = s.role !== 'USER' || boolSetting(settings.usersCanSeeAllData)
    const sc = scopeUser(s)

    let where: Record<string, unknown> = {}
    if (!sc.semua) where = scopeRecordWhere(s)
    else if (!seeAll) where = { uploadedById: s.uid }

    const [kebun, afdeling, blok, pemeriksa] = await Promise.all([
      db.dataRecord.findMany({ where, distinct: ['kebun'], select: { kebun: true } }),
      db.dataRecord.findMany({ where, distinct: ['afdeling'], select: { afdeling: true } }),
      db.dataRecord.findMany({ where, distinct: ['blok'], select: { blok: true } }),
      db.dataRecord.findMany({ where, distinct: ['pemeriksa'], select: { pemeriksa: true } }),
    ])

    const clean = (rows: { [k: string]: string }[], k: string) =>
      rows.map((r) => String(r[k] || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).slice(0, 200)

    return NextResponse.json({
      ok: true,
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
      scope: sc,
      kebun: clean(kebun as never, 'kebun'),
      afdeling: clean(afdeling as never, 'afdeling'),
      blok: clean(blok as never, 'blok'),
      pemeriksa: clean(pemeriksa as never, 'pemeriksa'),
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
