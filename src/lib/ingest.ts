import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const TRF_APP = 'cekblok-transfer'

/** Replikasi trfKey aplikasi: kodeTransaksi|pemeriksa(lowercase)|savedAt */
export function computeKey(r: Record<string, unknown>): string {
  const kode = String(r?.kodeTransaksi || '')
  const pem = String((r?.pemeriksa as string) || '').trim().toLowerCase()
  const saved = String((r?.savedAt as number | undefined) ?? '')
  if (kode) return `${kode}|${pem}|${saved}`
  // fallback deterministik bila kode transaksi kosong
  const h = createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16)
  return `auto-${h}|${pem}|${saved}`
}

export interface IngestResult {
  diterima: number
  baru: number
  duplikat: number
  perangkat: string
}

/**
 * Menerima isi berkas transfer Cek Blok ({app, v, perangkat, records:[...]})
 * lalu menggabungkannya ke database dengan deduplikasi (sama seperti logika aplikasi).
 */
export async function ingestTransfer(
  obj: unknown,
  opts: { userId?: string | null; perangkatFallback?: string }
): Promise<IngestResult> {
  if (!obj || typeof obj !== 'object') throw new Error('JSON tidak valid')
  const o = obj as Record<string, unknown>
  if (o.app && o.app !== TRF_APP) throw new Error('Bukan berkas transfer Cek Blok (app != cekblok-transfer)')
  if (!Array.isArray(o.records)) throw new Error('Field "records" tidak ditemukan / bukan array')

  const perangkat = String(o.perangkat || opts.perangkatFallback || '')
  let diterima = 0
  let baru = 0
  let duplikat = 0

  for (const raw of o.records) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (!r.blok && !r.tanggal) continue
    diterima++
    const key = computeKey(r)
    const payload = JSON.stringify(r)
    const exists = await db.dataRecord.findUnique({ where: { trfKey: key }, select: { id: true } })
    if (exists) {
      duplikat++
      continue
    }
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
          perangkat,
          sizeBytes: Buffer.byteLength(payload, 'utf8'),
          uploadedById: opts.userId ?? null,
        },
      })
      baru++
    } catch {
      duplikat++ // aman terhadap race condition unique constraint
    }
  }
  return { diterima, baru, duplikat, perangkat }
}

/** Bangun berkas transfer JSON persis seperti format aplikasi Cek Blok */
export function buildTransferFile(
  payloads: string[],
  meta: { perangkat?: string; withPhoto?: boolean } = {}
) {
  const withPhoto = meta.withPhoto !== false
  const records = payloads.map((p) => {
    const r = JSON.parse(p)
    if (!withPhoto) {
      // strip semua field foto (rekursif, sama seperti replacer di aplikasi)
      return JSON.parse(JSON.stringify(r, (_k: string, v: unknown) => (_k === 'photo' ? '' : v)))
    }
    return r
  })
  return {
    app: TRF_APP,
    v: 1,
    perangkat: meta.perangkat || 'SERVER',
    dibuat: Date.now(),
    foto: withPhoto,
    bagian: 1,
    dari: 1,
    jumlah: records.length,
    records,
  }
}

export interface RecordFilter {
  q?: string
  tanggalFrom?: string
  tanggalTo?: string
  kebun?: string
  afdeling?: string
  blok?: string
  pemeriksa?: string
  perangkat?: string
  dariMs?: number
}

export function recordWhere(f: RecordFilter): Prisma.DataRecordWhereInput {
  const w: Prisma.DataRecordWhereInput = {}
  const OR: Prisma.DataRecordWhereInput['OR'] = []
  if (f.q) {
    const s = { contains: f.q }
    OR.push(
      { kodeTransaksi: s },
      { pemeriksa: s },
      { blok: s },
      { afdeling: s },
      { kebun: s },
      { estate: s }
    )
  }
  if (OR.length) w.OR = OR
  if (f.tanggalFrom || f.tanggalTo) {
    w.tanggal = {}
    if (f.tanggalFrom) w.tanggal.gte = f.tanggalFrom
    if (f.tanggalTo) w.tanggal.lte = f.tanggalTo
  }
  if (f.kebun) w.kebun = { contains: f.kebun }
  if (f.afdeling) w.afdeling = { contains: f.afdeling }
  if (f.blok) w.blok = { contains: f.blok }
  if (f.pemeriksa) w.pemeriksa = { contains: f.pemeriksa }
  if (f.perangkat) w.perangkat = { contains: f.perangkat }
  if (typeof f.dariMs === 'number' && f.dariMs > 0) {
    w.createdAt = { gt: new Date(f.dariMs) }
  }
  return w
}
