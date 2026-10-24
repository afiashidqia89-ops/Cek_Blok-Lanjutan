import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'

/**
 * Daftar nilai unik untuk dropdown filter halaman Data & Peta:
 * kebun, afdeling, blok, pemeriksa (dipotong 200 nilai per field).
 */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const settings = await getSettings()
  const seeAll = s.role === 'ADMIN' || boolSetting(settings.usersCanSeeAllData)
  const where = seeAll ? {} : { uploadedById: s.uid }

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
    kebun: clean(kebun as never, 'kebun'),
    afdeling: clean(afdeling as never, 'afdeling'),
    blok: clean(blok as never, 'blok'),
    pemeriksa: clean(pemeriksa as never, 'pemeriksa'),
  })
}
