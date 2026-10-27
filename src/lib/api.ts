import { NextResponse } from 'next/server'

/** Header CORS untuk API sinkronisasi perangkat (dipakai WebView aplikasi Cek Blok) */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

export function corsJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS })
}

export function corsOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export function jsonOk(data: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status })
}

/**
 * Respons error database yang RAMAH (JSON, bukan body kosong).
 * Dipakai route handler supaya frontend tidak pernah menampilkan
 * error "JSON.parse: unexpected end of data" saat skema DB belum diterapkan.
 */
export function dbErrorResponse(e: unknown) {
  console.error('[db-error]', e)
  return NextResponse.json(
    {
      ok: false,
      kode: 'DB_BELUM_SIAP',
      error:
        'Database belum siap (tabel/kolom baru belum diterapkan). Buka repo GitHub → tab Actions → jalankan workflow "Terapkan Skema Database (Postgres)", lalu muat ulang halaman ini.',
    },
    { status: 503 }
  )
}

/**
 * fetch + parse JSON yang AMAN untuk frontend.
 * Jaminan: selalu mengembalikan objek hasil JSON, atau melempar Error
 * berbahasa Indonesia yang jelas — TIDAK PERNAH crash "JSON.parse".
 */
export async function jsonFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error(
      'Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.'
    )
  }
  let text = ''
  try {
    text = await res.text()
  } catch {
    /* abaikan */
  }
  if (!text.trim()) {
    if (res.status === 503) {
      throw new Error(
        'Database belum siap: jalankan workflow "Terapkan Skema Database" di GitHub Actions, lalu muat ulang halaman.'
      )
    }
    throw new Error(
      `Server menolak permintaan (kode ${res.status}). Muat ulang halaman; bila berulang, jalankan workflow "Terapkan Skema Database" di GitHub Actions.`
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `Respons server tidak valid (kode ${res.status}). Muat ulang halaman; bila berulang, jalankan workflow "Terapkan Skema Database" di GitHub Actions.`
    )
  }
}

/**
 * Lingkup data user sesuai PENUGASAN (estate/kebun/afdeling bisa ceklis lebih dari satu,
 * disimpan dipisah koma). Role SUPERADMIN/ADMIN selalu melihat semuanya.
 *  - kebun terisi  -> hanya data kebun-kebun itu
 *  - kebun kosong tapi estate terisi -> hanya data estate-estate itu
 *  - keduanya kosong -> semua data
 */
export interface UserScope {
  semua: boolean
  kebun: string[]
  estate: string[]
  afdeling: string[]
}

export function splitList(v?: string | null): string[] {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export function scopeUser(user: {
  role: string
  kebun?: string | null
  estate?: string | null
  afdeling?: string | null
}): UserScope {
  if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
    return { semua: true, kebun: [], estate: [], afdeling: [] }
  }
  const kebun = splitList(user.kebun)
  const estate = splitList(user.estate)
  const afdeling = splitList(user.afdeling)
  return { semua: kebun.length === 0 && estate.length === 0, kebun, estate, afdeling }
}

/** Prisma where untuk tabel DataRecord sesuai lingkup user (dipakai semua API baca data) */
export function scopeRecordWhere(user: {
  role: string
  kebun?: string | null
  estate?: string | null
  afdeling?: string | null
}): Record<string, unknown> {
  const sc = scopeUser(user)
  if (sc.semua) return {}
  const and: Record<string, unknown>[] = []
  if (sc.kebun.length) and.push({ kebun: { in: sc.kebun } })
  if (sc.estate.length) and.push({ estate: { in: sc.estate } })
  if (sc.afdeling.length) and.push({ afdeling: { in: sc.afdeling } })
  return and.length ? { AND: and } : {}
}

/** Prisma where untuk tabel BlokMaster sesuai lingkup user */
export function scopeBlokWhere(user: {
  role: string
  kebun?: string | null
  estate?: string | null
}): Record<string, unknown> {
  const sc = scopeUser(user)
  if (sc.semua) return {}
  if (sc.kebun.length) return { kebun: { in: sc.kebun } }
  if (sc.estate.length) return { estate: { in: sc.estate } }
  return {}
}

/** Kompatibilitas lama: "" = semua, selain itu daftar kebun dipisah koma */
export function scopeKebun(user: { role: string; kebun?: string | null }): string {
  const sc = scopeUser(user)
  return sc.semua ? '' : sc.kebun.join(', ')
}
