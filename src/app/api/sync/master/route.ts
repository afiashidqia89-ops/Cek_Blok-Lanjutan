import { corsJson, corsOptions } from '@/lib/api'
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
 * Data yang dikirim mengikuti kebun user:
 *  - user.kebun terisi  -> hanya blok kebun tersebut (daftar pilih blok di HP
 *                          otomatis sesuai kebun tempat user didaftarkan)
 *  - user.kebun kosong  -> semua blok (semua kebun), biasanya admin
 *
 * Format rows = [[estate,kebun,afdeling,blok,luas,pokok],...] — persis format
 * DB Aresta aplikasi, langsung diterapkan ke daftar blok di HP.
 *
 * Alur update: admin memperbarui Data Master di web -> HP menekan
 * "Ambil Data Master" -> daftar blok di HP ikut terbaru.
 */
export async function GET(req: Request) {
  const tk = await authDevice(req)
  if (!tk) return corsJson({ ok: false, error: 'Token perangkat tidak valid' }, 401)

  // lingkup ceklis: daftar kebun (atau estate) dipisah koma
  const split = (v?: string | null) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
  const kbs = split(tk.user.kebun)
  const ests = split((tk.user as unknown as { estate?: string }).estate)
  const whereBlok: Record<string, unknown> = kbs.length
    ? { kebun: { in: kbs } }
    : ests.length
      ? { estate: { in: ests } }
      : {}
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

  await logAudit(
    { uid: tk.userId, username: tk.user.username },
    'SYNC_MASTER',
    `${rows.length} blok (lingkup: ${kbs.length ? kbs.join(',') : ests.length ? 'estate ' + ests.join(',') : 'semua'})`
  )

  return corsJson({
    ok: true,
    kebun: kbs.join(', '),
    lingkup: kbs.length ? 'KEBUN' : ests.length ? 'ESTATE' : 'SEMUA',
    total: rows.length,
    versi,
    diperbarui: versi,
    rows: rows.map((r) => [r.estate, r.kebun, r.afdeling, r.blok, r.luas, r.pokok]),
  })
}
