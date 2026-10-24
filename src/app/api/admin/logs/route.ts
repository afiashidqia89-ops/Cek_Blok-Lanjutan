import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

/** Riwayat aktivitas (admin) */
export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const take = 30
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * take,
      take,
    }),
    db.auditLog.count(),
  ])
  return NextResponse.json({ ok: true, logs, total, page, pages: Math.ceil(total / take) })
}
