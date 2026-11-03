import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'
import { dbErrorResponse, scopeRecordWhere, scopeUser } from '@/lib/api'

/**
 * GET /api/report/rekap-blok — REKAP TEMUAN KUMULATIF per Kebun → Afdeling → Blok.
 *
 * Menu Rekap & Analitik: menampilkan kebun/afdeling/blok yang sudah diperiksa
 * lengkap dengan item temuan dan jumlahnya, contoh:
 *   BLOK A001 (Tunasan 5 Pkk, Titi Panen 2 Unit)
 * Rekap selalu menumpuk (kumulatif semua waktu — TANPA filter tanggal): setiap
 * pemeriksaan baru otomatis menambah angka blok/afdeling/kebun terkait.
 *
 * Lingkup data mengikuti penugasan akun (kolom Kebun/Estate/Afdeling di menu
 * Pengguna): user biasa hanya melihat kebun tempatnya terdaftar; admin & super
 * admin melihat semuanya (admin boleh memilih kebun lewat ?kebun=).
 *
 * Cara hitung "temuan" = banyaknya baris pada sheet "Detail Temuan" aplikasi HP:
 * satu sampel bernilai > 0, atau punya foto, atau punya koordinat = 1 temuan.
 * Nilai per item = jumlah seluruh sampel (sampel 1 mundur ke kolom rekap bila
 * kosong) — sama persis dengan ekspor Excel.
 */

const METRICS = ['semak', 'tunasan', 'titi', 'kerdil', 'banjir'] as const

type KunciMetrik = (typeof METRICS)[number]
type Nilai = Partial<Record<KunciMetrik, number>>

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const r2 = (n: number) => Math.round(n * 100) / 100

interface Slot {
  value?: unknown
  photo?: unknown
  location?: { latitude?: unknown; longitude?: unknown } | null
  extras?: Slot[]
}

/** Analisa satu payload transaksi → jumlah temuan + total nilai per item.
 *  Aturan dijiplak baris-per-baris dari barisTemuan() di halaman Data. */
function analisaRec(rec: Record<string, unknown>): { temuan: number; nilai: Nilai } {
  const details = (rec.details && typeof rec.details === 'object' ? rec.details : {}) as Record<string, Slot>
  let temuan = 0
  const nilai: Nilai = {}
  for (const key of METRICS) {
    const d0: Slot = details[key] || {}
    const extras = Array.isArray(d0.extras) ? d0.extras : []
    const slots: Slot[] = [d0, ...extras]
    let totalKey = 0
    slots.forEach((sl, ix) => {
      const s = sl || {}
      // sampel 1 boleh mundur ke nilai rekap di payload (sama seperti Detail Temuan)
      const val = s.value !== undefined ? num(s.value) : ix === 0 ? num(rec[key]) : 0
      const loc = s.location || null
      const okLoc = !!loc && Number.isFinite(Number(loc.latitude))
      if (val > 0 || s.photo || okLoc) temuan++
      if (val > 0) totalKey += val
    })
    if (totalKey > 0) nilai[key] = r2(totalKey)
  }
  const dbukti = details.bukti
  if (dbukti && (dbukti.photo || (dbukti.location && Number.isFinite(Number(dbukti.location.latitude))))) temuan++
  return { temuan, nilai }
}

interface Agg {
  nama: string
  transaksi: number
  temuan: number
  nilai: Nilai
  terakhir: string
  statusTerakhir: string
  pemeriksaTerakhir: string
  anak: Map<string, Agg>
}

function buatAgg(nama: string): Agg {
  return { nama, transaksi: 0, temuan: 0, nilai: {}, terakhir: '', statusTerakhir: '', pemeriksaTerakhir: '', anak: new Map() }
}

function gabung(a: Agg, temuan: number, nilai: Nilai, tanggal: string, status: string, pemeriksa: string): void {
  a.transaksi++
  a.temuan += temuan
  for (const k of METRICS) {
    const v = nilai[k]
    if (v && v > 0) a.nilai[k] = r2((a.nilai[k] || 0) + v)
  }
  // baris diproses urut createdAt naik → isi ulang saat tanggal sama = data sinkron paling baru
  if (tanggal && tanggal >= a.terakhir) {
    a.terakhir = tanggal
    a.statusTerakhir = status
    a.pemeriksaTerakhir = pemeriksa
  }
}

export async function GET(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  try {
    const sp = new URL(req.url).searchParams
    const settings = await getSettings()
    const seeAll = s.role !== 'USER' || boolSetting(settings.usersCanSeeAllData)
    const sc = scopeUser(s)

    const where: Record<string, unknown> = {}
    if (!sc.semua) Object.assign(where, scopeRecordWhere(s))
    else if (!seeAll) where.uploadedById = s.uid
    // admin/super admin boleh memilih kebun lewat dropdown
    if (sc.semua && s.role !== 'USER' && sp.get('kebun')) where.kebun = sp.get('kebun')

    // ---- baca seluruh transaksi bertahap (hemat memori serverless) ----
    const PAGE = 200
    const MAKS = 50_000
    let kursor: string | undefined
    let diproses = 0
    let terpotong = false

    const kebunMap = new Map<string, Agg>()
    const pemeriksaSet = new Set<string>()
    let totalTemuan = 0

    while (diproses < MAKS) {
      const rows = await db.dataRecord.findMany({
        where: where as never,
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, kebun: true, afdeling: true, blok: true, status: true, tanggal: true, pemeriksa: true, payload: true },
        take: PAGE,
        ...(kursor ? { skip: 1, cursor: { id: kursor } } : {}),
      })
      if (!rows.length) break
      for (const row of rows) {
        let rec: Record<string, unknown> = {}
        try { rec = JSON.parse(String(row.payload || '{}')) as Record<string, unknown> } catch { rec = {} }
        const { temuan, nilai } = analisaRec(rec)
        totalTemuan += temuan
        if (row.pemeriksa) pemeriksaSet.add(String(row.pemeriksa))

        const kbNama = String(row.kebun || '').trim() || '(Tanpa Nama Kebun)'
        const afNama = String(row.afdeling || '').trim() || '(Tanpa Afdeling)'
        const blNama = String(row.blok || '').trim() || '(Tanpa Kode Blok)'
        const kbKey = kbNama.toUpperCase()
        const afKey = afNama.toUpperCase()
        const blKey = blNama.toUpperCase()
        if (!kebunMap.has(kbKey)) kebunMap.set(kbKey, buatAgg(kbNama))
        const kb = kebunMap.get(kbKey)!
        if (!kb.anak.has(afKey)) kb.anak.set(afKey, buatAgg(afNama))
        const af = kb.anak.get(afKey)!
        if (!af.anak.has(blKey)) af.anak.set(blKey, buatAgg(blNama))
        const bl = af.anak.get(blKey)!
        const tgl = String(row.tanggal || '')
        const st = String(row.status || '')
        const pem = String(row.pemeriksa || '')
        gabung(kb, temuan, nilai, tgl, st, pem)
        gabung(af, temuan, nilai, tgl, st, pem)
        gabung(bl, temuan, nilai, tgl, st, pem)
      }
      diproses += rows.length
      kursor = rows[rows.length - 1].id
      if (rows.length < PAGE) break
    }
    if (diproses >= MAKS) terpotong = true

    const urutkan = (a: Agg, b: Agg) => (b.temuan - a.temuan) || (b.transaksi - a.transaksi) || a.nama.localeCompare(b.nama, 'id')
    const nilaiTotal: Nilai = {}
    for (const k of METRICS) {
      let t = 0
      for (const kb of kebunMap.values()) t += kb.nilai[k] || 0
      if (t > 0) nilaiTotal[k] = r2(t)
    }

    let blokUnik = 0
    let afdelingAktif = 0
    const kebunList = [...kebunMap.values()].sort(urutkan).map((kb) => {
      const afdelingList = [...kb.anak.values()].sort(urutkan).map((af) => {
        const blokList = [...af.anak.values()].sort(urutkan).map((bl) => ({
          nama: bl.nama, transaksi: bl.transaksi, temuan: bl.temuan, nilai: bl.nilai,
          terakhir: bl.terakhir, statusTerakhir: bl.statusTerakhir, pemeriksaTerakhir: bl.pemeriksaTerakhir,
        }))
        blokUnik += blokList.length
        afdelingAktif++
        return {
          nama: af.nama, transaksi: af.transaksi, temuan: af.temuan, nilai: af.nilai,
          terakhir: af.terakhir, blokList,
        }
      })
      return {
        nama: kb.nama, transaksi: kb.transaksi, temuan: kb.temuan, nilai: kb.nilai,
        terakhir: kb.terakhir, afdelingList,
      }
    })

    return NextResponse.json({
      ok: true,
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
      lingkupSemua: sc.semua,
      total: diproses,
      terpotong,
      totalTemuan,
      blokUnik,
      afdelingAktif,
      kebunAktif: kebunList.length,
      pemeriksaAktif: pemeriksaSet.size,
      nilaiTotal,
      kebunList,
    })
  } catch (e) {
    return dbErrorResponse(e)
  }
}
