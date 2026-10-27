import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, randomShareToken } from '@/lib/auth'
import { logAudit } from '@/lib/log'

/** Buat tautan berbagi publik untuk berkas transfer sesuai filter */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  let body: {
    name?: string
    tanggalFrom?: string
    tanggalTo?: string
    kebun?: string
    afdeling?: string
    blok?: string
    pemeriksa?: string
    withPhoto?: boolean
  }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const exp = await db.dataExport.create({
    data: {
      token: randomShareToken(),
      name: String(body.name || 'Berkas Cek Blok').slice(0, 80),
      tanggalFrom: String(body.tanggalFrom || ''),
      tanggalTo: String(body.tanggalTo || ''),
      kebun: String(body.kebun || ''),
      afdeling: String(body.afdeling || ''),
      blok: String(body.blok || ''),
      pemeriksa: String(body.pemeriksa || ''),
      withPhoto: body.withPhoto !== false,
      createdById: s.uid,
    },
  })
  await logAudit(s, 'BUAT_SHARE', `${exp.name} -> /share/${exp.token}`)
  return NextResponse.json({ ok: true, share: exp })
}

/** Daftar tautan berbagi yang pernah dibuat (admin: semua, user: miliknya) */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const shares = await db.dataExport.findMany({
    where: s.role === 'ADMIN' ? {} : { createdById: s.uid },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { createdBy: { select: { username: true } } },
  })
  return NextResponse.json({ ok: true, shares })
}
