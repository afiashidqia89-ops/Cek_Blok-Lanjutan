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
 * Lingkup kebun untuk sesi web: user non-admin yang ditugaskan kebun
 * hanya boleh melihat data kebunnya. Admin melihat semuanya.
 */
export function scopeKebun(user: { role: string; kebun?: string | null }): string {
  if (user.role === 'ADMIN') return ''
  return (user.kebun || '').trim()
}
