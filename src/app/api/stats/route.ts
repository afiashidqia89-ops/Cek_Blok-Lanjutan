import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { dbErrorResponse, scopeKebun } from '@/lib/api'

/** Statistik ringkas untuk dashboard (role-aware, + lingkup kebun user) */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const now = Date.now()
    const hariIni = new Date(now - 24 * 60 * 60 * 1000)
    const mingguIni = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const kb = scopeKebun(s)

    if (s.role === 'ADMIN') {
      const [totalUsers, activeUsers, totalRecords, sizeAgg, records24h, records7d, tokens, logs] =
        await Promise.all([
          db.user.count(),
          db.user.count({ where: { isActive: true } }),
          db.dataRecord.count(),
          db.dataRecord.aggregate({ _sum: { sizeBytes: true } }),
          db.dataRecord.count({ where: { createdAt: { gte: hariIni } } }),
          db.dataRecord.count({ where: { createdAt: { gte: mingguIni } } }),
          db.deviceToken.count({ where: { isActive: true } }),
          db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
        ])
      const recent = await db.dataRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true, tanggal: true, pemeriksa: true, blok: true, afdeling: true, kebun: true,
          estate: true, status: true, perangkat: true, sizeBytes: true, createdAt: true,
          uploadedBy: { select: { username: true } },
        },
      })
      return NextResponse.json({
        ok: true,
        role: 'ADMIN',
        totalUsers,
        activeUsers,
        totalRecords,
        totalSize: sizeAgg._sum.sizeBytes || 0,
        records24h,
        records7d,
        activeTokens: tokens,
        recent,
        logs,
      })
    }

    // USER — bila ditugaskan kebun: seluruh angka terkait kebun itu
    const baseWhere: Record<string, unknown> = kb ? { kebun: kb } : {}
    const [totalRecords, sizeAgg, ownRecords, records24h, myTokens] = await Promise.all([
      db.dataRecord.count({ where: baseWhere }),
      db.dataRecord.aggregate({ _sum: { sizeBytes: true }, where: baseWhere }),
      db.dataRecord.count({ where: { uploadedById: s.uid } }),
      db.dataRecord.count({ where: { ...baseWhere, createdAt: { gte: hariIni } } }),
      db.deviceToken.count({ where: { userId: s.uid, isActive: true } }),
    ])
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
    return NextResponse.json({
      ok: true,
      role: 'USER',
      scopeKebun: kb,
      totalRecords,
      totalSize: sizeAgg._sum.sizeBytes || 0,
      ownRecords,
      records24h,
      activeTokens: myTokens,
      recent,
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
