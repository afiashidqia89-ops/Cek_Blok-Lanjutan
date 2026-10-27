import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { recordWhere, buildTransferFile, type RecordFilter } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'
import { logAudit } from '@/lib/log'
import { scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * Unduh berkas transfer JSON (format persis seperti aplikasi Cek Blok).
 * Berkas hasil unduhan bisa langsung di-import lewat menu
 * "Terima & Gabung Data" di aplikasi — tanpa perlu membuka file manager.
 */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const settings = await getSettings()
  const seeAll = s.role !== 'USER' || boolSetting(settings.usersCanSeeAllData)

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
  const sc = scopeUser(s)
  if (!sc.semua) Object.assign(where, scopeRecordWhere(s))
  else if (!seeAll) where.uploadedById = s.uid

  const rows = await db.dataRecord.findMany({
    where,
    orderBy: [{ tanggal: 'asc' }, { savedAt: 'asc' }],
    select: { payload: true },
  })
  const withPhoto = sp.get('foto') !== '0'
  const file = buildTransferFile(rows.map((r) => r.payload), { perangkat: 'SERVER', withPhoto })

  await logAudit(s, 'DOWNLOAD', `${rows.length} transaksi, foto: ${withPhoto ? 'ya' : 'tidak'}`)

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(file), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="CekBlok_SERVER_${stamp}.json"`,
    },
  })
}
