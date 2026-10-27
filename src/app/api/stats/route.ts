import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { dbErrorResponse, scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * Statistik untuk halaman Ringkasan (gaya dashboard).
 * - SUPERADMIN/ADMIN: angka seluruh server + agregat grafik
 * - USER: angka sesuai penugasan ceklis (kebun/estate/afdeling), bila kosong
 *   mengikuti pengaturan usersCanSeeAllData, selanjutnya data miliknya.
 */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const now = Date.now()
    const hariIni = new Date(now - 24 * 60 * 60 * 1000)
    const mingguIni = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const adminish = s.role !== 'USER'
    const sc = scopeUser(s)

    // where dasar sesuai lingkup
    const baseWhere: Record<string, unknown> = sc.semua ? {} : scopeRecordWhere(s)
    if (sc.semua && !adminish) {
      // user tanpa penugasan: ikuti pengaturan lihat-semua
      const settings = await getSettingsSafe()
      if (!settings.seeAll) {
        baseWhere.uploadedById = s.uid
        sc.semua = false
      }
    }

    const [totalRecords, sizeAgg, records24h, records7d, blokAgg, statusAgg, kebunAgg, afdAgg] =
      await Promise.all([
        db.dataRecord.count({ where: baseWhere }),
        db.dataRecord.aggregate({ _sum: { sizeBytes: true }, where: baseWhere }),
        db.dataRecord.count({ where: { ...baseWhere, createdAt: { gte: hariIni } } }),
        db.dataRecord.count({ where: { ...baseWhere, createdAt: { gte: mingguIni } } }),
        db.dataRecord.groupBy({ by: ['blok'], _count: { _all: true }, where: baseWhere }),
        db.dataRecord.groupBy({ by: ['status'], _count: { _all: true }, where: baseWhere }),
        db.dataRecord.groupBy({ by: ['kebun'], _count: { _all: true }, where: baseWhere }),
        db.dataRecord.groupBy({ by: ['afdeling'], _count: { _all: true }, where: baseWhere }),
      ])

    // tren 14 hari
    const batas14 = new Date(now - 13 * 24 * 60 * 60 * 1000)
    const perHariRaw = await db.dataRecord.groupBy({
      by: ['tanggal'],
      _count: { _all: true },
      where: { ...baseWhere, tanggal: { gte: batas14.toISOString().slice(0, 10) } },
    })
    const mapHari = new Map<string, number>()
    for (const x of perHariRaw) if (x.tanggal) mapHari.set(String(x.tanggal), x._count._all)
    const tren14: { tanggal: string; jumlah: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      tren14.push({ tanggal: d, jumlah: mapHari.get(d) || 0 })
    }

    const cnt = (x: { _count: { _all: number } }) => x._count._all
    const perStatus = statusAgg.filter((x) => x.status).sort((a, b) => cnt(b) - cnt(a)).map((x) => ({ status: String(x.status), jumlah: cnt(x) }))
    const perKebun = kebunAgg.filter((x) => x.kebun).sort((a, b) => cnt(b) - cnt(a)).slice(0, 8).map((x) => ({ kebun: String(x.kebun), jumlah: cnt(x) }))
    const perAfdeling = afdAgg.filter((x) => x.afdeling).sort((a, b) => cnt(b) - cnt(a)).slice(0, 8).map((x) => ({ afdeling: String(x.afdeling), jumlah: cnt(x) }))
    const blokDiperiksa = blokAgg.filter((x) => x.blok).length

    const recent = await db.dataRecord.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, tanggal: true, pemeriksa: true, blok: true, afdeling: true, kebun: true,
        estate: true, status: true, perangkat: true, sizeBytes: true, createdAt: true,
        uploadedBy: { select: { username: true } },
      },
    })

    if (adminish) {
      const [totalUsers, activeUsers, activeTokens, logs, totalBlokMaster] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { isActive: true } }),
        db.deviceToken.count({ where: { isActive: true } }),
        db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
        db.blokMaster.count().catch(() => 0),
      ])
      return NextResponse.json({
        ok: true,
        role: s.role,
        totalUsers,
        activeUsers,
        totalRecords,
        totalSize: sizeAgg._sum.sizeBytes || 0,
        records24h,
        records7d,
        activeTokens,
        totalBlokMaster,
        blokDiperiksa,
        tren14,
        perStatus,
        perKebun,
        perAfdeling,
        recent,
        logs,
      })
    }

    const [ownRecords, myTokens] = await Promise.all([
      db.dataRecord.count({ where: { uploadedById: s.uid } }),
      db.deviceToken.count({ where: { userId: s.uid, isActive: true } }),
    ])
    return NextResponse.json({
      ok: true,
      role: 'USER',
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
      scope: sc,
      totalRecords,
      totalSize: sizeAgg._sum.sizeBytes || 0,
      ownRecords,
      records24h,
      activeTokens: myTokens,
      blokDiperiksa,
      tren14,
      perStatus,
      perKebun,
      perAfdeling,
      recent,
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}

async function getSettingsSafe(): Promise<{ seeAll: boolean }> {
  try {
    const { getSettings, boolSetting } = await import('@/lib/settings')
    const st = await getSettings()
    return { seeAll: boolSetting(st.usersCanSeeAllData) }
  } catch {
    return { seeAll: false }
  }
}
