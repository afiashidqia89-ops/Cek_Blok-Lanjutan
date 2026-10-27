import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAdmin } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { logAudit } from '@/lib/log'

/**
 * Lapisan peta tersimpan di server (dipakai bersama semua pengguna web).
 * GET  : daftar lapisan (tanpa isi berkas, ringan)
 * POST : tambah lapisan {name, type:'GEOJSON'|'RASTER', content, meta?} (admin)
 */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const rows = await db.mapLayer.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, type: true, sizeBytes: true, createdAt: true,
      uploadedBy: { select: { username: true } },
    },
  })
  return NextResponse.json({ ok: true, layers: rows })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) {
    const s = await getSession()
    if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
    return NextResponse.json({ ok: false, error: 'Hanya admin yang bisa menambah lapisan peta' }, { status: 403 })
  }

  let body: { name?: string; type?: string; content?: string; meta?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }

  const type = body.type === 'RASTER' ? 'RASTER' : 'GEOJSON'
  const content = String(body.content || '')
  const name = String(body.name || '').trim().slice(0, 120)
  const meta = String(body.meta || '').slice(0, 200_000)

  if (!name) return NextResponse.json({ ok: false, error: 'Nama lapisan wajib diisi' }, { status: 400 })
  if (!content) return NextResponse.json({ ok: false, error: 'Isi lapisan kosong' }, { status: 400 })

  if (type === 'GEOJSON') {
    try {
      const o = JSON.parse(content)
      if (!o || typeof o !== 'object') throw new Error('x')
    } catch {
      return NextResponse.json({ ok: false, error: 'Berkas bukan GeoJSON yang valid' }, { status: 400 })
    }
  } else if (!content.startsWith('data:image/')) {
    return NextResponse.json({ ok: false, error: 'Lapisan raster harus berupa gambar (dataURL)' }, { status: 400 })
  }

  const settings = await getSettings()
  const maxMB = Math.max(1, Number(settings.maxUploadMB) || 25)
  const sizeBytes = Buffer.byteLength(content, 'utf8')
  if (sizeBytes > maxMB * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: `Lapisan terlalu besar (maks ${maxMB} MB). Kompres PDF/GeoJSON dulu.` }, { status: 413 })
  }

  const row = await db.mapLayer.create({
    data: { name, type, content, meta, sizeBytes, uploadedById: admin.uid },
  })
  await logAudit(admin, 'PETA_UPLOAD', `${type}: ${name} (${Math.round(sizeBytes / 1024)} KB)`)
  return NextResponse.json({
    ok: true,
    layer: { id: row.id, name: row.name, type: row.type, sizeBytes: row.sizeBytes, createdAt: row.createdAt },
  })
}
