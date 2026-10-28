import { corsJson, corsOptions } from '@/lib/api'
import { authDevice } from '@/lib/auth'
import { ingestTransfer } from '@/lib/ingest'
import { getSettings, boolSetting } from '@/lib/settings'
import { logAudit } from '@/lib/log'

export const maxDuration = 60

export async function OPTIONS() {
  return corsOptions()
}

/**
 * Terima data dari aplikasi Cek Blok (tombol "Kirim ke Server").
 * Auth: Authorization: Bearer <token perangkat> (cbk_...)
 * Body: berkas transfer {app:'cekblok-transfer', v:1, perangkat, records:[...]}
 * Respons: {ok, diterima, baru, duplikat, perangkat}
 * 413 bila ukuran melebihi batas pengaturan "maxUploadMB" — aplikasi otomatis
 * mengulang pengiriman tanpa foto bila menerima kode ini.
 */
export async function POST(req: Request) {
  // Cek token DULU (401 lebih tepat daripada 500 bila pengaturan gagal dibaca)
  const tk = await authDevice(req)
  if (!tk) return corsJson({ ok: false, error: 'Token perangkat tidak valid' }, 401)

  let syncAktif = true
  let maxMB = 25
  try {
    const settings = await getSettings()
    syncAktif = boolSetting(settings.syncEnabled)
    maxMB = Math.max(1, Number(settings.maxUploadMB) || 25)
  } catch {
    // Pengaturan gagal dibaca → pakai nilai bawaan, jangan gagalkan sinkronisasi
  }
  if (!syncAktif) {
    return corsJson({ ok: false, error: 'Sinkronisasi sedang dinonaktifkan admin' }, 503)
  }

  const maxBytes = maxMB * 1024 * 1024
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared && declared > maxBytes) {
    return corsJson({ ok: false, error: `Data terlalu besar (maks ${maxMB} MB). Kirim tanpa foto.` }, 413)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return corsJson({ ok: false, error: 'JSON tidak valid' }, 400)
  }
  if (JSON.stringify(body ?? {}).length > maxBytes) {
    return corsJson({ ok: false, error: `Data terlalu besar (maks ${maxMB} MB). Kirim tanpa foto.` }, 413)
  }

  try {
    const r = await ingestTransfer(body, { userId: tk.userId, perangkatFallback: tk.label })
    await logAudit(
      { uid: tk.userId, username: tk.user.username },
      'SYNC_UPLOAD',
      `diterima ${r.diterima}, baru ${r.baru}, duplikat ${r.duplikat}, diperbarui ${r.diperbarui ?? 0} (perangkat: ${r.perangkat || '-'})`
    )
    return corsJson({ ok: true, ...r })
  } catch (e) {
    return corsJson({ ok: false, error: String((e as Error).message || e) }, 400)
  }
}
