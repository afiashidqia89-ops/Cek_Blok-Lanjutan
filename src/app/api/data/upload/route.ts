import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ingestTransfer } from '@/lib/ingest'
import { getSettings } from '@/lib/settings'
import { logAudit } from '@/lib/log'

export const maxDuration = 60

/**
 * Unggah berkas transfer JSON dari dashboard (tombol "Unggah Berkas").
 * Menerima multipart/form-data (field "file") atau raw JSON body.
 * Deduplikasi otomatis berdasarkan kodeTransaksi|pemeriksa|savedAt.
 */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const settings = await getSettings()
  const maxMB = Math.max(1, Number(settings.maxUploadMB) || 25)
  const maxBytes = maxMB * 1024 * 1024

  const ct = req.headers.get('content-type') || ''
  let text = ''
  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const f = form.get('file')
      if (!f || typeof f === 'string') {
        return NextResponse.json({ ok: false, error: 'Berkas tidak ditemukan pada field "file"' }, { status: 400 })
      }
      if (f.size > maxBytes) {
        return NextResponse.json(
          { ok: false, error: `Berkas terlalu besar (maks ${maxMB} MB)` },
          { status: 413 }
        )
      }
      text = await f.text()
    } else {
      const declared = Number(req.headers.get('content-length') || 0)
      if (declared && declared > maxBytes) {
        return NextResponse.json(
          { ok: false, error: `Berkas terlalu besar (maks ${maxMB} MB)` },
          { status: 413 }
        )
      }
      text = await req.text()
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Gagal membaca berkas' }, { status: 400 })
  }

  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: 'Berkas kosong' }, { status: 400 })
  }

  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Berkas bukan JSON transfer Cek Blok yang valid' },
      { status: 400 }
    )
  }

  try {
    const r = await ingestTransfer(obj, { userId: s.uid, perangkatFallback: 'dashboard' })
    await logAudit(s, 'UPLOAD', `diterima ${r.diterima}, baru ${r.baru}, duplikat ${r.duplikat}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 400 })
  }
}
