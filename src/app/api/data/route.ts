import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { recordWhere, type RecordFilter } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'
import { dbErrorResponse, scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * Daftar transaksi pemeriksaan (untuk tabel halaman Data).
 * Admin: semua data. User: sesuai kebun penugasan (bila ada), lalu pengaturan
 * usersCanSeeAllData, selanjutnya hanya miliknya.
 */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
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
      kebun: sp.get('kebun') || undefined,
      afdeling: sp.get('afdeling') || undefined,
      blok: sp.get('blok') || undefined,
      pemeriksa: sp.get('pemeriksa') || undefined,
      perangkat: sp.get('perangkat') || undefined,
    }
    const where = recordWhere(f)
    const sc = scopeUser(s)
    if (!sc.semua) {
      // user ditugaskan (ceklis kebun/estate/afdeling): hanya data lingkupnya (filter kunci)
      Object.assign(where, scopeRecordWhere(s))
    } else if (!seeAll) {
      where.uploadedById = s.uid
    }

    const select = {
      id: true, kodeTransaksi: true, tanggal: true, pemeriksa: true, estate: true,
      kebun: true, afdeling: true, blok: true, status: true, perangkat: true,
      sizeBytes: true, createdAt: true, uploadedById: true,
      uploadedBy: { select: { username: true } },
    } as const

    // ringkas=1: sertakan isi record (foto diganti penanda 'ADA') + hitungan
    // foto & lokasi per transaksi — dipakai sub-menu Rekap & Hasil Temuan.
    const ringkas = sp.get('ringkas') === '1'

    const [rawRows, total] = await Promise.all([
      db.dataRecord.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { savedAt: 'desc' }],
        skip: (page - 1) * take,
        take,
        select: { ...select, payload: ringkas } as never,
      }),
      db.dataRecord.count({ where }),
    ])

    const rows = rawRows.map((r) => {
      const base = r as Record<string, unknown>
      if (!ringkas || !('payload' in r) || !r.payload) return base
      let rec: Record<string, unknown> = {}
      try {
        rec = JSON.parse(
          JSON.stringify(JSON.parse(String(r.payload)), (_k: string, v: unknown) =>
            typeof v === 'string' && v.startsWith('data:image') ? 'ADA' : v
          )
        )
      } catch {
        rec = {}
      }
      let foto = 0
      let lokasi = 0
      const details = (rec.details || {}) as Record<
        string,
        { photo?: string; location?: { latitude?: unknown }; extras?: { photo?: string; location?: { latitude?: unknown } }[] }
      >
      for (const k of Object.keys(details)) {
        const d = details[k] || {}
        const samples = [{ photo: d.photo, location: d.location }, ...(Array.isArray(d.extras) ? d.extras : [])]
        for (const sm of samples) {
          if (sm && sm.photo) foto++
          if (sm && sm.location && Number.isFinite(Number(sm.location.latitude))) lokasi++
        }
      }
      return { ...base, record: rec, foto, lokasi }
    })

    return NextResponse.json({
      ok: true,
      rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / take)),
      seeAll: sc.semua ? true : seeAll,
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
      scope: sc,
      canDeleteOwn: boolSetting(settings.usersCanDeleteOwnData),
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
