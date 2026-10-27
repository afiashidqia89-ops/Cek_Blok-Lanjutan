import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'
import { dbErrorResponse, scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * GET /api/report — agregasi untuk halaman Laporan (grafik & kartu).
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD (opsional; kosong = semua), kebun (admin saja)
 * Lingkup: user non-admin dengan kebun penugasan otomatis dibatasi ke kebunnya;
 * user tanpa penugasan & tanpa izin lihat-semua hanya melihat unggahannya sendiri.
 */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const sp = new URL(req.url).searchParams
    const from = (sp.get('from') || '').trim()
    const to = (sp.get('to') || '').trim()
    const settings = await getSettings()
    const seeAll = s.role !== 'USER' || boolSetting(settings.usersCanSeeAllData)
    const sc = scopeUser(s)

    const where: Record<string, unknown> = {}
    if (!sc.semua) Object.assign(where, scopeRecordWhere(s))
    else if (!seeAll) where.uploadedById = s.uid
    // admin/super admin boleh pilih kebun bebas lewat dropdown
    if (sc.semua && s.role !== 'USER' && sp.get('kebun')) where.kebun = sp.get('kebun')
    if (from || to) {
      where.tanggal = {}
      if (from) (where.tanggal as Record<string, string>).gte = from
      if (to) (where.tanggal as Record<string, string>).lte = to
    }

    const [total, perHari, perKebun, perAfdeling, perStatus, perBlok, perPemeriksa, sizeAgg] =
      await Promise.all([
        db.dataRecord.count({ where }),
        db.dataRecord.groupBy({ by: ['tanggal'], _count: { _all: true }, where }),
        db.dataRecord.groupBy({ by: ['kebun'], _count: { _all: true }, where }),
        db.dataRecord.groupBy({ by: ['afdeling'], _count: { _all: true }, where }),
        db.dataRecord.groupBy({ by: ['status'], _count: { _all: true }, where }),
        db.dataRecord.groupBy({ by: ['blok'], _count: { _all: true }, where }),
        db.dataRecord.groupBy({ by: ['pemeriksa'], _count: { _all: true }, where }),
        db.dataRecord.aggregate({ _sum: { sizeBytes: true }, where }),
      ])

    const cnt = (x: { _count: { _all: number } }) => x._count._all
    const hari = perHari
      .filter((x) => x.tanggal)
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)))
      .map((x) => ({ tanggal: String(x.tanggal), jumlah: cnt(x) }))

    return NextResponse.json({
      ok: true,
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
      scope: sc,
      from,
      to,
      total,
      totalSize: sizeAgg._sum.sizeBytes || 0,
      blokUnik: perBlok.filter((x) => x.blok).length,
      pemeriksaAktif: perPemeriksa.filter((x) => x.pemeriksa).length,
      kebunAktif: perKebun.filter((x) => x.kebun).length,
      perHari: hari.slice(-60),
      perKebun: perKebun
        .filter((x) => x.kebun)
        .sort((a, b) => cnt(b) - cnt(a))
        .slice(0, 12)
        .map((x) => ({ kebun: String(x.kebun), jumlah: cnt(x) })),
      perAfdeling: perAfdeling
        .filter((x) => x.afdeling)
        .sort((a, b) => cnt(b) - cnt(a))
        .slice(0, 12)
        .map((x) => ({ afdeling: String(x.afdeling), jumlah: cnt(x) })),
      perStatus: perStatus
        .filter((x) => x.status)
        .sort((a, b) => cnt(b) - cnt(a))
        .map((x) => ({ status: String(x.status), jumlah: cnt(x) })),
      topBlok: perBlok
        .filter((x) => x.blok)
        .sort((a, b) => cnt(b) - cnt(a))
        .slice(0, 10)
        .map((x) => ({ blok: String(x.blok), jumlah: cnt(x) })),
      perPemeriksa: perPemeriksa
        .filter((x) => x.pemeriksa)
        .sort((a, b) => cnt(b) - cnt(a))
        .slice(0, 10)
        .map((x) => ({ pemeriksa: String(x.pemeriksa), jumlah: cnt(x) })),
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
