import { corsJson, corsOptions } from '@/lib/api'
import { authDevice } from '@/lib/auth'
import { recordWhere, type RecordFilter } from '@/lib/ingest'
import { db } from '@/lib/db'
import { getSettings, boolSetting } from '@/lib/settings'
import { logAudit } from '@/lib/log'

export const maxDuration = 60

export async function OPTIONS() {
  return corsOptions()
}

/**
 * Ambil data dari server ke aplikasi (Authorization: Bearer <token perangkat>).
 * Parameter:
 *  - dari=<epochMs>  : hanya data yang masuk ke server setelah waktu ts (sinkron inkremental)
 *  - cursor=<int>    : offset untuk pengambilan bertahap (hemat kuota & ukuran respons)
 *  - maxBytes=<int>  : batas ukuran per batch (default 3 MB)
 * Respons: {ok, records:[...], nextCursor, selesai, total}
 * Format records = persis berkas transfer aplikasi, langsung digabung tanpa file manager.
 * Bila user ditugaskan di kebun tertentu (lihat menu Pengguna di web), hanya
 * transaksi kebun itu yang dikirim ke HP — data kebun lain tidak ikut.
 */
export async function GET(req: Request) {
  const settings = await getSettings()
  if (!boolSetting(settings.syncEnabled)) {
    return corsJson({ ok: false, error: 'Sinkronisasi sedang dinonaktifkan admin' }, 503)
  }
  const tk = await authDevice(req)
  if (!tk) return corsJson({ ok: false, error: 'Token perangkat tidak valid' }, 401)

  const sp = new URL(req.url).searchParams
  const dariMs = Number(sp.get('dari') || 0) || 0
  const cursor = Math.max(0, Number(sp.get('cursor') || 0))
  const maxBytes = Math.min(4_000_000, Math.max(200_000, Number(sp.get('maxBytes') || 3_000_000)))
  const hardLimit = 500

  const f: RecordFilter = { dariMs }
  const where = recordWhere(f)

  // Pengguna yang ditugaskan di kebun tertentu hanya menerima transaksi kebun itu
  const kebunUser = (tk.user.kebun || '').trim()
  if (kebunUser) where.kebun = kebunUser

  const total = await db.dataRecord.count({ where })
  const batch = await db.dataRecord.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }],
    skip: cursor,
    take: hardLimit,
    select: { payload: true, sizeBytes: true },
  })

  // potong batch agar ukuran respons aman
  let size = 0
  let count = 0
  for (const r of batch) {
    if (count > 0 && size + r.sizeBytes > maxBytes) break
    size += r.sizeBytes
    count++
  }
  const page = batch.slice(0, count)
  const nextCursor = cursor + count
  const selesai = nextCursor >= total

  const records = page.map((r) => JSON.parse(r.payload))
  if (count > 0) {
    await logAudit(
      { uid: tk.userId, username: tk.user.username },
      'SYNC_DOWNLOAD',
      `${count} transaksi (cursor ${nextCursor}/${total})${kebunUser ? ` — kebun ${kebunUser}` : ''}`
    )
  }

  return corsJson({
    ok: true,
    app: 'cekblok-transfer',
    v: 1,
    perangkat: 'SERVER',
    dibuat: Date.now(),
    foto: true,
    bagian: 1,
    dari: 1,
    jumlah: records.length,
    records,
    nextCursor,
    selesai,
    total,
  })
}
