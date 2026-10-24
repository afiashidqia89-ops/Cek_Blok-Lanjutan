import { corsJson, corsOptions } from '@/lib/api'
import { authDevice } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings, boolSetting } from '@/lib/settings'

export async function OPTIONS() {
  return corsOptions()
}

/** Cek token perangkat + status sinkronisasi (dipakai tombol "Tes Koneksi" di aplikasi) */
export async function GET(req: Request) {
  const settings = await getSettings()
  const tk = await authDevice(req)
  if (!tk) return corsJson({ ok: false, error: 'Token perangkat tidak valid' }, 401)
  const total = await db.dataRecord.count()
  return corsJson({
    ok: true,
    user: tk.user.name || tk.user.username,
    label: tk.label,
    syncEnabled: boolSetting(settings.syncEnabled),
    totalRecords: total,
    lastUsedAt: tk.lastUsedAt,
  })
}
