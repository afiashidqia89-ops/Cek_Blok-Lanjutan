import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireSuperAdmin } from '@/lib/auth'
import { logAudit } from '@/lib/log'
import { MASTER_BAWAAN } from '@/lib/master-bawaan'
import { dbErrorResponse, scopeBlokWhere, scopeUser } from '@/lib/api'

export const maxDuration = 60

export interface BarisMaster {
  estate: string
  kebun: string
  afdeling: string
  blok: string
  luas: number | null
  pokok: number | null
}

/** Ubah satu baris teks "estate|kebun|afd|blok|luas|pokok" jadi objek */
function parseBaris(s: string): BarisMaster | null {
  const p = s.split('|')
  if (p.length < 4) return null
  const estate = String(p[0] || '').trim()
  const kebun = String(p[1] || '').trim()
  const afdeling = String(p[2] || '').trim()
  const blok = String(p[3] || '').trim()
  if (!estate || !kebun || !afdeling || !blok) return null
  const luas = p.length > 4 && String(p[4]).trim() !== '' ? Number(p[4]) : null
  const pokok = p.length > 5 && String(p[5]).trim() !== '' ? Math.round(Number(p[5])) : null
  return {
    estate,
    kebun,
    afdeling,
    blok,
    luas: luas != null && isFinite(luas) ? luas : null,
    pokok: pokok != null && isFinite(pokok) ? pokok : null,
  }
}

/** Parse CSV dengan pemisah otomatis (; , tab) + header fleksibel */
function parseCsv(text: string): BarisMaster[] {
  const clean = text.replace(/^\ufeff/, '')
  const first = clean.split(/\r?\n/, 1)[0] || ''
  const sep = ([';', '\t', ','] as const)
    .map((c) => [c, first.split(c).length] as [string, number])
    .sort((a, b) => b[1] - a[1])[0][0]
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return []
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')))
  // deteksi header
  const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h))
  let m = {
    estate: idx(['estate', 'pt', 'perusahaan']),
    kebun: idx(['kebun']),
    afdeling: idx(['afdeling', 'afd', 'divisi']),
    blok: idx(['blok', 'block']),
    luas: idx(['luas', 'luas ha', 'ha']),
    pokok: idx(['pokok', 'jumlah pokok', 'jml pokok', 'pkk']),
  }
  let start = 0
  if (m.blok < 0 || m.kebun < 0) {
    // tanpa header: pakai urutan kolom aplikasi
    m = { estate: 0, kebun: 1, afdeling: 2, blok: 3, luas: 4, pokok: 5 }
  } else {
    start = 1
  }
  const out: BarisMaster[] = []
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    const estate = r[m.estate] || ''
    const kebun = r[m.kebun] || ''
    const afdeling = r[m.afdeling] || ''
    const blok = r[m.blok] || ''
    if (!kebun || !afdeling || !blok) continue
    const luas = m.luas >= 0 && r[m.luas] !== undefined && r[m.luas] !== '' ? Number(r[m.luas].replace(/\s/g, '').replace(',', '.')) : null
    const pokok = m.pokok >= 0 && r[m.pokok] !== undefined && r[m.pokok] !== '' ? Math.round(Number(r[m.pokok].replace(/[.\s]/g, '').replace(',', '.'))) : null
    out.push({
      estate,
      kebun,
      afdeling,
      blok,
      luas: luas != null && isFinite(luas) ? luas : null,
      pokok: pokok != null && isFinite(pokok) ? pokok : null,
    })
  }
  return out
}

/** Parse JSON: array of [e,k,a,b,luas,pokok] atau array of object */
function parseJsonRows(v: unknown): BarisMaster[] {
  if (!Array.isArray(v)) return []
  const out: BarisMaster[] = []
  for (const it of v) {
    if (Array.isArray(it)) {
      const b = parseBaris(it.map((x) => String(x ?? '')).join('|'))
      if (b) out.push(b)
    } else if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>
      const estate = String(o.estate ?? o.pt ?? '').trim()
      const kebun = String(o.kebun ?? '').trim()
      const afdeling = String(o.afdeling ?? o.afd ?? '').trim()
      const blok = String(o.blok ?? o.block ?? '').trim()
      if (!kebun || !afdeling || !blok) continue
      const luas = o.luas != null ? Number(o.luas) : null
      const pokok = o.pokok != null ? Math.round(Number(o.pokok)) : null
      out.push({
        estate,
        kebun,
        afdeling,
        blok,
        luas: luas != null && isFinite(luas) ? luas : null,
        pokok: pokok != null && isFinite(pokok) ? pokok : null,
      })
    }
  }
  return out
}

/**
 * GET /api/master — daftar data master (blok) + ringkasan.
 * Query:
 *  - facets=1          : ringkasan per kebun (untuk dropdown & kartu ringkas)
 *  - kebun, afdeling   : filter
 *  - q                 : cari kode blok
 *  - page, limit       : paginasi (default 1 / 200, maks 1000)
 * User non-admin dengan kebun penugasan otomatis dibatasi ke kebunnya.
 */
export async function GET(req: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Belum masuk' }, { status: 401 })

  try {
    const sp = new URL(req.url).searchParams
    const sc = scopeUser(user)
    const kbWhere = scopeBlokWhere(user)

    if (sp.get('facets')) {
      const rows = await db.blokMaster.findMany({
        where: Object.keys(kbWhere).length ? kbWhere : undefined,
        select: { estate: true, kebun: true, afdeling: true, luas: true, pokok: true },
      })
    const map = new Map<string, { kebun: string; estate: string; afdelings: Set<string>; bloks: number; luas: number; pokok: number }>()
    let totalLuas = 0
    let totalPokok = 0
    for (const r of rows) {
      totalLuas += r.luas || 0
      totalPokok += r.pokok || 0
      let e = map.get(r.kebun)
      if (!e) {
        e = { kebun: r.kebun, estate: r.estate, afdelings: new Set(), bloks: 0, luas: 0, pokok: 0 }
        map.set(r.kebun, e)
      }
      e.afdelings.add(r.afdeling)
      e.bloks++
      e.luas += r.luas || 0
      e.pokok += r.pokok || 0
    }
    const facets = [...map.values()]
      .sort((a, b) => a.kebun.localeCompare(b.kebun))
      .map((e) => ({
        kebun: e.kebun,
        estate: e.estate,
        afdelings: [...e.afdelings].sort(),
        jumlahAfdeling: e.afdelings.size,
        bloks: e.bloks,
        luas: Math.round(e.luas * 100) / 100,
        pokok: e.pokok,
      }))
    const estates = [...new Set(rows.map((r) => r.estate))].sort()
    return NextResponse.json({
      ok: true,
      facets,
      estates,
      totalBlok: rows.length,
      totalKebun: facets.length,
      totalAfdeling: facets.reduce((s, f) => s + f.jumlahAfdeling, 0),
      totalEstate: estates.length,
      totalLuas: Math.round(totalLuas * 100) / 100,
      totalPokok: totalPokok,
      kosong: rows.length === 0,
      scopeKebun: sc.semua ? '' : sc.kebun.join(', '),
    })
  }

  const kebun = sp.get('kebun') || ''
  const afdeling = sp.get('afdeling') || ''
  const q = (sp.get('q') || '').trim()
  const page = Math.max(1, Number(sp.get('page') || 1))
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit') || 200)))

  const where: Record<string, unknown> = {}
  if (kebun) where.kebun = kebun
  if (afdeling) where.afdeling = afdeling
  if (q) where.blok = { contains: q }
  if (Object.keys(kbWhere).length) Object.assign(where, kbWhere) // lingkup user (menimpa filter bebas)

  const total = await db.blokMaster.count({ where })
  const rows = await db.blokMaster.findMany({
    where,
    orderBy: [{ kebun: 'asc' }, { afdeling: 'asc' }, { blok: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  })
  return NextResponse.json({ ok: true, total, page, limit, scopeKebun: sc.semua ? '' : sc.kebun.join(', '), rows })
  } catch (e) {
    return dbErrorResponse(e)
  }
}

/**
 * POST /api/master (admin) — impor data master.
 * Body salah satu:
 *  - { sumber:'bawaan', mode? }            : muat DB Aresta bawaan aplikasi (6.041 blok)
 *  - { csv:'...' , mode? }                 : impor teks CSV (header opsional)
 *  - { rows:[[e,k,a,b,luas,pokok],...] }   : impor array (format sama dgn aplikasi)
 * mode: 'merge' (default, perbarui/tambah tanpa hapus) | 'replace' (hapus dulu
 *       baris kebun yang muncul di data baru, lalu isi — cocok untuk update besar)
 */
export async function POST(req: Request) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus Super Admin' }, { status: 403 })

  let body: { sumber?: string; csv?: string; rows?: unknown; mode?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const mode = body.mode === 'replace' ? 'replace' : 'merge'

  let rows: BarisMaster[] = []
  let sumberLabel = ''

  if (body.sumber === 'bawaan') {
    rows = MASTER_BAWAAN.split('\n')
      .map((s) => parseBaris(s))
      .filter((r): r is BarisMaster => !!r)
    sumberLabel = 'DB Aresta bawaan aplikasi'
  } else if (typeof body.csv === 'string' && body.csv.trim()) {
    rows = parseCsv(body.csv)
    sumberLabel = 'CSV'
    if (!rows.length) {
      // mungkin JSON yang ditempel
      try {
        rows = parseJsonRows(JSON.parse(body.csv))
        sumberLabel = 'JSON'
      } catch {
        /* biarkan kosong */
      }
    }
  } else if (body.rows != null) {
    rows = parseJsonRows(body.rows)
    sumberLabel = 'JSON rows'
  }

  if (!rows.length) {
    return NextResponse.json(
      { ok: false, error: 'Tidak ada baris blok yang valid. Pastikan ada kolom Estate, Kebun, Afdeling, Blok.' },
      { status: 400 }
    )
  }

  // dedupe dalam data masuk (pakai kunci terakhir)
  const map = new Map<string, BarisMaster>()
  for (const r of rows) map.set(`${r.estate}|${r.kebun}|${r.afdeling}|${r.blok}`, r)
  const unik = [...map.values()]

  const kebunTerlibat = [...new Set(unik.map((r) => r.kebun))]
  let dihapus = 0
  if (mode === 'replace') {
    const res = await db.blokMaster.deleteMany({ where: { kebun: { in: kebunTerlibat } } })
    dihapus = res.count
  }

  let masuk = 0
  for (const r of unik) {
    await db.blokMaster.upsert({
      where: { estate_kebun_afdeling_blok: { estate: r.estate, kebun: r.kebun, afdeling: r.afdeling, blok: r.blok } },
      create: { estate: r.estate, kebun: r.kebun, afdeling: r.afdeling, blok: r.blok, luas: r.luas, pokok: r.pokok },
      update: { luas: r.luas, pokok: r.pokok },
    })
    masuk++
  }

  await logAudit(
    admin,
    'MASTER_IMPOR',
    `${sumberLabel}: ${masuk} blok (mode ${mode}${dihapus ? `, hapus ${dihapus}` : ''}), kebun: ${kebunTerlibat.slice(0, 8).join(',')}${kebunTerlibat.length > 8 ? '…' : ''}`
  )
  return NextResponse.json({ ok: true, masuk, dihapus, mode, sumber: sumberLabel, total: await db.blokMaster.count() })
}
