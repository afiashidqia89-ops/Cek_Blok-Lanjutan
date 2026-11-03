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
 *    TIDAK PERNAH ditimpa (hanya dilewati sebagai "sudahAda").
 *  - PERBAIKAN SAAT IMPOR ULANG: baris yang berasal dari impor Excel lama
 *    (perangkat "IMPOR-XLSX") dengan isi berbeda akan DIPERBARUI dengan
 *    hasil parse terbaru — sehingga kolom yang dulu kosong (mis. Pemeriksa,
 *    Luas, Pokok, Detail Temuan) ikut terisi cukup dengan mengimpor ulang
 *    berkas Excel yang sama, tanpa perlu hapus-manual satu per satu.
 *  - Aman diulang: baris Excel yang identik otomatis dilewati (duplikat).
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
    let diperbarui = 0

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

      // (3) baris Excel identik yang sudah pernah diimpor? lewati
      const sama = await db.dataRecord.findUnique({ where: { trfKey: key }, select: { id: true } })
      if (sama) { duplikat++; continue }

      // (4) PERBAIKAN: baris lama berasal dari impor Excel (bukan dari HP) yang
      //     isinya berbeda → perbarui seluruh kolomnya dengan hasil parse terbaru.
      //     Dicocokkan lewat Kode Transaksi (bila ada), atau Tanggal+Kebun+
      //     Afdeling+Blok. Hanya menyentuh baris perangkat "IMPOR-XLSX".
      const kode = String(r.kodeTransaksi || '')
      const tanggal = String(r.tanggal || '')
      const kunciLama = kode
        ? { perangkat: 'IMPOR-XLSX', kodeTransaksi: kode }
        : { perangkat: 'IMPOR-XLSX', tanggal, kebun: String(r.kebun ?? ''), afdeling: String(r.afdeling ?? ''), blok: String(r.blok ?? '') }
      const lama = await db.dataRecord.findMany({ where: kunciLama, select: { id: true }, take: 20 })
      if (lama.length) {
        const dataBaru = {
          trfKey: key,
          tanggal,
          pemeriksa: String(r.pemeriksa || ''),
          estate: String(r.pt ?? r.estate ?? ''),
          kebun: String(r.kebun ?? ''),
          afdeling: String(r.afdeling ?? ''),
          blok: String(r.blok ?? ''),
          status: String(r.status ?? ''),
          savedAt: typeof r.savedAt === 'number' ? r.savedAt : null,
          payload,
          sizeBytes: Buffer.byteLength(payload, 'utf8'),
        }
        // Baris pertama dapat kunci baru; duplikat hasil impor lama (bila berkas
        // pernah diimpor beberapa kali) ikut diperbarui isinya tanpa ganti kunci.
        for (let i = 0; i < lama.length; i++) {
          try {
            await db.dataRecord.update({
              where: { id: lama[i].id },
              data: i === 0 ? dataBaru : { ...dataBaru, trfKey: undefined },
            })
            diperbarui++
          } catch { duplikat++ }
        }
        continue
      }

      // (5) benar-benar baris baru
      try {
        await db.dataRecord.create({
          data: {
            trfKey: key,
            kodeTransaksi: kode,
            tanggal,
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

    if (baru > 0 || diperbarui > 0) {
      await logAudit(s, 'IMPOR_XLSX', `${baru} baru, ${diperbarui} diperbarui, ${sudahAda} sudah ada (dilewati), ${duplikat} kembar, ${diterima} diterima`)
    }
    return NextResponse.json({ ok: true, diterima, baru, sudahAda, duplikat, diperbarui })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 })
  }
}
