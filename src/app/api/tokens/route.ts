import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAdmin, generateDeviceToken } from '@/lib/auth'
import { logAudit } from '@/lib/log'

/** Daftar token. User: token miliknya. Admin: ?all=1 untuk semua token. */
export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const url = new URL(req.url)
  const all = url.searchParams.get('all') === '1' && s.role === 'ADMIN'
  const tokens = await db.deviceToken.findMany({
    where: all ? {} : { userId: s.uid },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { username: true, name: true } } },
  })
  return NextResponse.json({ ok: true, tokens, all })
}

/** Buat token perangkat baru (untuk dipasang di aplikasi Cek Blok) */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  let body: { label?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  let userId = s.uid
  if (s.role === 'ADMIN' && body.userId && body.userId !== s.uid) {
    const target = await db.user.findUnique({ where: { id: body.userId }, select: { id: true } })
    if (!target) return NextResponse.json({ ok: false, error: 'User tujuan tidak ditemukan' }, { status: 404 })
    userId = target.id
  }
  const label = String(body.label || '').trim().slice(0, 60) || 'Perangkat'
  const token = await db.deviceToken.create({
    data: { token: generateDeviceToken(), label, userId },
    include: { user: { select: { username: true, name: true } } },
  })
  await logAudit(s, 'BUAT_TOKEN', `label: ${label}`)
  return NextResponse.json({ ok: true, token })
}
