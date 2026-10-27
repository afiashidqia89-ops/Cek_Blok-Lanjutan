import { db } from '@/lib/db'
import { logAudit } from '@/lib/log'

/**
 * Pastikan SELALU ada minimal satu akun SUPERADMIN.
 * Dipanggil saat login dan saat /api/auth/me — bila belum ada Super Admin,
 * akun ADMIN tertua (fallback: pengguna tertua) otomatis dinaikkan.
 * Dengan ini menu Data Master / Token / Pengaturan pasti muncul untuk
 * pemilik akun utama tanpa perlu menjalankan workflow manual.
 */
export async function ensureSuperAdminExists(): Promise<void> {
  try {
    const ada = await db.user.findFirst({ where: { role: 'SUPERADMIN' }, select: { id: true } })
    if (ada) return
    const kandidat =
      (await db.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true },
      })) ??
      (await db.user.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true },
      }))
    if (!kandidat) return
    await db.user.update({ where: { id: kandidat.id }, data: { role: 'SUPERADMIN' } })
    await logAudit(
      { uid: kandidat.id, username: kandidat.username },
      'PROMOSI_SUPERADMIN',
      `Otomatis: belum ada Super Admin — akun "${kandidat.username}" dinaikkan menjadi Super Admin`
    )
  } catch {
    // Jangan pernah menggagalkan login/me karena langkah ini
  }
}
