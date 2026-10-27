import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ingestTransfer } from '@/lib/ingest'
import { dbErrorResponse } from '@/lib/api'
import { logAudit } from '@/lib/log'

export const maxDuration = 60

/**
 * POST /api/data/upload — unggah data pemeriksaan dari WEB.
 * Dua format diterima:
 *  1) multipart/form-data, field "file" = berkas .json transfer Cek Blok
 *     (hasil "Kirim Data ke HP Lain" di aplikasi) — mode lama, tetap didukung.
 *  2) application/json { records: [ {...}, ... ] } — hasil konversi berkas
 *     EXCEL (.xlsx) di browser (diparse lewat ExcelJS sebelum dikirim), jadi
 *     unggahan dari web berformat Excel, sedangkan HP menerima JSON.
 * Deduplikasi otomatis memakai trfKey (sama seperti aplikasi).
 */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  const ct = (req.headers.get('content-type') || '').toLowerCase()

  try {
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      const f = fd.get('file')
      if (!f || typeof f === 'string') {
        return NextResponse.json({ ok: false, error: 'Berkas tidak ditemukan' }, { status: 400 })
      }
      if (!/\.(json|txt)$/i.test(f.name)) {
        return NextResponse.json({ ok: false, error: 'Berkas harus .json transfer Cek Blok' }, { status: 400 })
      }
      const text = await f.text()
      let obj: unknown
      try {
        obj = JSON.parse(text)
      } catch {
        return NextResponse.json({ ok: false, error: 'Berkas bukan JSON yang valid' }, { status: 400 })
      }
      const res = await ingestTransfer(obj, { userId: s.uid, perangkatFallback: f.name.replace(/\.[^.]+$/, '').slice(0, 40) })
      await logAudit(s, 'UPLOAD', `berkas ${f.name}: ${res.baru} baru / ${res.duplikat} duplikat`)
      return NextResponse.json({ ok: true, ...res })
    }

    if (ct.includes('application/json')) {
      let body: { records?: unknown; perangkat?: string }
      try {
        body = await req.json()
      } catch {
        return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
      }
      if (!Array.isArray(body.records)) {
        return NextResponse.json({ ok: false, error: 'Field "records" tidak ditemukan / bukan array' }, { status: 400 })
      }
      const res = await ingestTransfer(
        { records: body.records },
        { userId: s.uid, perangkatFallback: String(body.perangkat || 'WEB-EXCEL').slice(0, 40) }
      )
      await logAudit(s, 'UPLOAD', `excel web: ${res.baru} baru / ${res.duplikat} duplikat`)
      return NextResponse.json({ ok: true, ...res })
    }

    return NextResponse.json({ ok: false, error: 'Content-Type tidak didukung' }, { status: 400 })
  } catch (e) {
    const msg = String((e as Error).message || e)
    if (msg.includes('Bukan berkas transfer') || msg.includes('records')) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }
    return dbErrorResponse(e)
  }
}
