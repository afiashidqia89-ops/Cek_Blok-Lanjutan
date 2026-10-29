import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ingestTransfer } from '@/lib/ingest'
import { dbErrorResponse } from '@/lib/api'
import { logAudit } from '@/lib/log'

/**
 * Impor berkas transfer JSON hasil "Transfer Data Antar HP" aplikasi Cek Blok
 * (nama berkas biasanya: CekBlok_<NamaHP>_<tanggal>_bagian1dari1.json).
 * Bedanya dengan impor Excel: FOTO TEMUAN IKUT TERIMPOR karena tersimpan di
 * dalam JSON (base64). Format diterima persis seperti "Kirim ke Server":
 * {app:'cekblok-transfer', v:1, perangkat, records:[...]}
 *
 * Aman diimpor berulang:
 *  - transaksi yang isinya sama persis -> dilewati (duplikat)
 *  - transaksi yang sudah ada tapi isinya berubah (mis. dulu tanpa foto,
 *    kini ada foto) -> ISI DI SERVER DIPERBARUI
 */
export async function POST(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Berkas JSON tidak valid' }, { status: 400 })
    }
    const app = String(body.app || '')
    if (app && app !== 'cekblok-transfer') {
      return NextResponse.json(
        { ok: false, error: 'Ini bukan berkas transfer Cek Blok — gunakan berkas JSON hasil "Transfer Data Antar HP" di aplikasi' },
        { status: 400 }
      )
    }
    if (!Array.isArray(body.records)) {
      return NextResponse.json(
        { ok: false, error: 'Berkas tidak berisi data transaksi (field "records" tidak ditemukan)' },
        { status: 400 }
      )
    }
    if (body.records.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Terlalu banyak data sekali kirim (maks 2000 transaksi per bagian)' },
        { status: 400 }
      )
    }

    const hasil = await ingestTransfer(body, { userId: s.uid, perangkatFallback: 'IMPOR-JSON' })

    if (hasil.baru > 0 || hasil.diperbarui > 0) {
      await logAudit(
        s,
        'IMPOR_JSON',
        `${hasil.baru} baru, ${hasil.duplikat} duplikat, ${hasil.diperbarui} diperbarui, ${hasil.diterima} diterima (perangkat: ${hasil.perangkat || '?'})`
      )
    }
    return NextResponse.json({
      ok: true,
      diterima: hasil.diterima,
      baru: hasil.baru,
      duplikat: hasil.duplikat,
      diperbarui: hasil.diperbarui,
    })
  } catch (e) {
    if (e instanceof Error && e.message) {
      // pesan ingestTransfer sudah berbahasa Indonesia yang mudah dipahami
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
    }
    return dbErrorResponse(e)
  }
}
