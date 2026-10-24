import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { recordWhere, type RecordFilter } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'

/**
 * Data pemeriksaan untuk halaman Peta (dengan payload untuk menggambar titik temuan).
 * Foto dihapus otomatis agar respons ringan — posisi GPS temuan tetap ada.
 * Filter: kebun, afdeling, blok, tanggalFrom, tanggalTo, pemeriksa, max (default 400, maks 1000)
 */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const settings = await getSettings()
  const seeAll = s.role === 'ADMIN' || boolSetting(settings.usersCanSeeAllData)

  const f: RecordFilter = {
    q: sp.get('q') || undefined,
    tanggalFrom: sp.get('tanggalFrom') || undefined,
    tanggalTo: sp.get('tanggalTo') || undefined,
    kebun: sp.get('kebun') || undefined,
    afdeling: sp.get('afdeling') || undefined,
    blok: sp.get('blok') || undefined,
    pemeriksa: sp.get('pemeriksa') || undefined,
  }
  const where = recordWhere(f)
  if (!seeAll) where.uploadedById = s.uid

  const max = Math.min(1000, Math.max(1, Number(sp.get('max') || 400)))
  const total = await db.dataRecord.count({ where })
  const rows = await db.dataRecord.findMany({
    where,
    orderBy: [{ tanggal: 'desc' }, { savedAt: 'desc' }],
    take: max,
    select: {
      id: true, kodeTransaksi: true, tanggal: true, pemeriksa: true, estate: true,
      kebun: true, afdeling: true, blok: true, status: true, savedAt: true, payload: true,
    },
  })

  const stripPhoto = (_k: string, v: unknown) => (typeof v === 'string' && v.startsWith('data:image') && _k === 'photo' ? '' : v)
  const records = rows.map((r) => ({
    id: r.id,
    kodeTransaksi: r.kodeTransaksi,
    tanggal: r.tanggal,
    pemeriksa: r.pemeriksa,
    estate: r.estate,
    kebun: r.kebun,
    afdeling: r.afdeling,
    blok: r.blok,
    status: r.status,
    savedAt: r.savedAt,
    record: JSON.parse(JSON.stringify(r.payload ? JSON.parse(r.payload) : {}, stripPhoto)),
  }))

  return NextResponse.json({ ok: true, total, diambil: records.length, terpotong: total > records.length, records })
}
