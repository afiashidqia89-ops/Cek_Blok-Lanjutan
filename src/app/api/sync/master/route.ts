import { corsJson, corsOptions, scopeUser } from '@/lib/api'
import { authDevice } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/log'

export const maxDuration = 60

export async function OPTIONS() {
  return corsOptions()
}

/**
 * AMBIL DATA MASTER (blok) dari server ke aplikasi HP.
 * Authorization: Bearer <token perangkat> (atau token dari Login akun web).
 *
 * Data yang dikirim mengikuti PENUGASAN user (estate + kebun + afdeling,
 * bisa lebih dari satu dipisah koma — semua disaring bersamaan):
 *  - user budi didaftarkan estate KSA1G, kebun KSA1, afdeling 1
 *    -> hanya blok KSA1G / KSA1 / afdeling 1 yang dikirim ke HP-nya
 *  - admin/super-admin (tanpa penugasan) -> semua blok
 *
 * Format rows = [[estate,kebun,afdeling,blok,luas,pokok],...] — persis format
 * DB Aresta aplikasi, langsung diterapkan ke daftar blok di HP.
 *
 * Alur update: admin memperbarui Data Master di web -> HP menekan
 * "Download Data Server" -> daftar blok + transaksi lingkupnya ikut terbaru.
 */
export async function GET(req: Request) {
  const tk = await authDevice(req)
  if (!tk) return corsJson({ ok: false, error: 'Token perangkat tidak valid' }, 401)

  // Lingkup PENUGASAN user: estate, kebun, afdeling (semuanya disaring AND —
  // persis seperti data transaksi di /api/sync/download supaya master dan
  // transaksi yang masuk ke HP selalu satu wilayah yang sama).
  // Catatan: scopeUser mengembalikan array kosong untuk ADMIN/SUPERADMIN,
  // jadi admin otomatis menerima semua blok.
  const sc = scopeUser(tk.user as never)
  const whereBlok: Record<string, unknown> = {}
  if (sc.kebun.length) whereBlok.kebun = { in: sc.kebun }
  if (sc.estate.length) whereBlok.estate = { in: sc.estate }
  if (sc.afdeling.length) whereBlok.afdeling = { in: sc.afdeling }
  const rows = await db.blokMaster.findMany({
    where: whereBlok,
    orderBy: [{ kebun: 'asc' }, { afdeling: 'asc' }, { blok: 'asc' }],
    select: { estate: true, kebun: true, afdeling: true, blok: true, luas: true, pokok: true, updatedAt: true },
  })

  let versi = 0
  for (const r of rows) {
    const t = r.updatedAt?.getTime() || 0
    if (t > versi) versi = t
  }
  if (!versi) versi = Date.now()

  const labelLingkup = [
    sc.estate.length ? 'estate ' + sc.estate.join(',') : '',
    sc.kebun.length ? 'kebun ' + sc.kebun.join(',') : '',
    sc.afdeling.length ? 'afdeling ' + sc.afdeling.join(',') : '',
  ].filter(Boolean).join(' / ')

  await logAudit(
    { uid: tk.userId, username: tk.user.username },
    'SYNC_MASTER',
    `${rows.length} blok (lingkup: ${labelLingkup || 'semua'})`
  )

  return corsJson({
    ok: true,
    kebun: labelLingkup || '(semua kebun)',
    lingkup: sc.kebun.length ? 'KEBUN' : sc.estate.length ? 'ESTATE' : 'SEMUA',
    total: rows.length,
    versi,
    diperbarui: versi,
    rows: rows.map((r) => [r.estate, r.kebun, r.afdeling, r.blok, r.luas, r.pokok]),
  })
}
