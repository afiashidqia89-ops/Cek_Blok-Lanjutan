import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { recordWhere, type RecordFilter } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'
import { logAudit } from '@/lib/log'
import { dbErrorResponse, scopeRecordWhere } from '@/lib/api'

/**
 * Hapus BANYAK transaksi sekaligus (menu Data Pemeriksaan):
 *  - body { ids: [...] }                  -> hapus sesuai daftar id (ceklis)
 *  - body { semua: true, filter: {...} }  -> hapus SEMUA data yang cocok dengan filter aktif
 *
 * Hak akses:
 *  - SUPERADMIN/ADMIN : boleh hapus semua data yang dilihatnya
 *  - USER             : hanya miliknya, dan hanya bila pengaturan
 *                       "user boleh hapus data sendiri" aktif; plus lingkup penugasan.
 */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      ids?: unknown
      semua?: unknown
      filter?: Record<string, unknown>
    }
    const adminish = s.role === 'ADMIN' || s.role === 'SUPERADMIN'

    // where dasar hak akses
    let aksesWhere: Record<string, unknown> = {}
    if (!adminish) {
      const settings = await getSettings()
      const canDeleteOwn = boolSetting(settings.usersCanDeleteOwnData)
      if (!canDeleteOwn) {
        return NextResponse.json(
          { ok: false, error: 'Pengaturan tidak mengizinkan penghapusan data oleh pengguna. Minta admin.' },
          { status: 403 }
        )
      }
      aksesWhere = { uploadedById: s.uid, ...(scopeRecordWhere(s) as Record<string, unknown>) }
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((x) => String(x)).filter(Boolean).slice(0, 2000)
      : []

    if (!ids.length && body.semua !== true) {
      return NextResponse.json({ ok: false, error: 'Tidak ada data yang dipilih' }, { status: 400 })
    }

    let where: Record<string, unknown>
    let ringkasan: string
    if (ids.length) {
      where = { id: { in: ids }, ...aksesWhere }
      ringkasan = `${ids.length} data terpilih`
    } else {
      const f = (body.filter || {}) as Record<string, string | undefined>
      const rf: RecordFilter = {
        q: f.q || undefined,
        tanggalFrom: f.tanggalFrom || undefined,
        tanggalTo: f.tanggalTo || undefined,
        estate: f.estate || undefined,
        kebun: f.kebun || undefined,
        afdeling: f.afdeling || undefined,
        blok: f.blok || undefined,
        pemeriksa: f.pemeriksa || undefined,
      }
      where = { ...recordWhere(rf), ...aksesWhere } as Record<string, unknown>
      const aktif = Object.entries(rf).filter(([, v]) => v)
      ringkasan = aktif.length
        ? `semua data filter: ${aktif.map(([k, v]) => `${k}=${v}`).join(', ')}`
        : 'SEMUA data tanpa filter'
    }

    // jumlah dulu untuk konfirmasi audit
    const akan = await db.dataRecord.count({ where: where as never })
    if (!akan) {
      return NextResponse.json({ ok: false, error: 'Tidak ada data yang cocok untuk dihapus' }, { status: 404 })
    }

    const hasil = await db.dataRecord.deleteMany({ where: where as never })
    await logAudit(s, 'HAPUS_DATA_BATCH', `${hasil.count} data dihapus (${ringkasan})`)

    return NextResponse.json({ ok: true, terhapus: hasil.count })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
