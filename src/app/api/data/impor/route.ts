import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getSession } from '@/lib/auth'
import { computeKey } from '@/lib/ingest'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/log'

/**
 * Impor transaksi dari berkas Excel (.xlsx) — halaman Data Pemeriksaan.
 * Berkas diparse di browser (ExcelJS); endpoint ini menerima baris yang
 * sudah dipetakan: {tanggal, pemeriksa, pt, kebun, afdeling, blok, status,
 * catatan, semak?, tunasan?, titi?, kerdil?, banjir?, kodeTransaksi?}.
 *
 * Bedanya dengan /api/data/impor (JSON transfer HP):
 *  - TIDAK ADA FOTO — Excel tidak membawa foto, data foto di server tidak
 *    tersentuh sama sekali.
 *  - AMAN TERHADAP PENIMPAAAN: transaksi asli dari HP yang kuncinya sama
 *    TIDAK PERNAH ditimpa (hanya dilewati sebagai "sudahAda"). Baris Excel
 *    baru dibuat dengan kunci berawalan "xlsx-" sehingga tidak mungkin
 *    menabrak / mengubah data asli dari aplikasi HP.
 *  - Aman diulang: baris Excel yang sama diimpor ulang otomatis dilewati.
 */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as { records?: unknown[] } | null
    if (!body || !Array.isArray(body.records)) {
      return NextResponse.json({ ok: false, error: 'Data tidak valid' }, { status: 400 })
    }
    if (body.records.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Terlalu banyak data sekali kirim (maks 2000 baris)' },
        { status: 400 }
      )
    }

    let diterima = 0
    let baru = 0
    let sudahAda = 0
    let duplikat = 0

    for (const raw of body.records) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      if (!r.blok && !r.tanggal) continue
      diterima++

      // (1) transaksi asli dari HP dengan kunci sama? lewati — JANGAN ditimpa
      const kunciAsli = computeKey(r)
      const ada = await db.dataRecord.findUnique({ where: { trfKey: kunciAsli }, select: { id: true } })
      if (ada) { sudahAda++; continue }

      // (2) kunci stabil untuk baris Excel: xlsx-<hash isi baris>
      const pem = String(r.pemeriksa || '').trim().toLowerCase()
      const saved = typeof r.savedAt === 'number' ? r.savedAt : ''
      const h = createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16)
      const key = `xlsx-${h}|${pem}|${saved}`
      const payload = JSON.stringify(r)

      try {
        await db.dataRecord.create({
          data: {
            trfKey: key,
            kodeTransaksi: String(r.kodeTransaksi || ''),
            tanggal: String(r.tanggal || ''),
            pemeriksa: String(r.pemeriksa || ''),
            estate: String(r.pt ?? r.estate ?? ''),
            kebun: String(r.kebun ?? ''),
            afdeling: String(r.afdeling ?? ''),
            blok: String(r.blok ?? ''),
            status: String(r.status ?? ''),
            savedAt: typeof r.savedAt === 'number' ? r.savedAt : null,
            payload,
            perangkat: 'IMPOR-XLSX',
            sizeBytes: Buffer.byteLength(payload, 'utf8'),
            uploadedById: s.uid,
          },
        })
        baru++
      } catch {
        duplikat++ // balapan unique constraint — baris identik sudah dibuat
      }
    }

    if (baru > 0) {
      await logAudit(s, 'IMPOR_XLSX', `${baru} baru, ${sudahAda} sudah ada (dilewati), ${duplikat} kembar, ${diterima} diterima`)
    }
    return NextResponse.json({ ok: true, diterima, baru, sudahAda, duplikat })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 })
  }
}
