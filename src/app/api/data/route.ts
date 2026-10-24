import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { recordWhere, type RecordFilter } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'

/**
 * Daftar transaksi pemeriksaan (untuk tabel halaman Data).
 * Admin: semua data. User: semua (jika usersCanSeeAllData aktif) atau hanya miliknya.
 */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const url = new URL(req.url)
  const sp = url.searchParams
  const page = Math.max(1, Number(sp.get('page') || 1))
  const take = Math.min(100, Math.max(10, Number(sp.get('take') || 25)))

  const settings = await getSettings()
  const seeAll = s.role === 'ADMIN' || boolSetting(settings.usersCanSeeAllData)

  const f: RecordFilter = {
    q: sp.get('q') || undefined,
    tanggalFrom: sp.get('tanggalFrom') || undefined,
    tanggalTo: sp.get('tanggalTo') || undefined,
    blok: sp.get('blok') || undefined,
    pemeriksa: sp.get('pemeriksa') || undefined,
    perangkat: sp.get('perangkat') || undefined,
  }
  const where: Parameters<typeof db.dataRecord.findMany>[0]['where'] = recordWhere(f)
  if (!seeAll) where.uploadedById = s.uid

  const select = {
    id: true, kodeTransaksi: true, tanggal: true, pemeriksa: true, estate: true,
    kebun: true, afdeling: true, blok: true, status: true, perangkat: true,
    sizeBytes: true, createdAt: true, uploadedById: true,
    uploadedBy: { select: { username: true } },
  } as const

  const [rows, total] = await Promise.all([
    db.dataRecord.findMany({
      where,
      orderBy: [{ tanggal: 'desc' }, { savedAt: 'desc' }],
      skip: (page - 1) * take,
      take,
      select: { ...select, payload: false } as never,
    }),
    db.dataRecord.count({ where }),
  ])

  return NextResponse.json({
    ok: true,
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    seeAll,
    canDeleteOwn: boolSetting(settings.usersCanDeleteOwnData),
  })
}
