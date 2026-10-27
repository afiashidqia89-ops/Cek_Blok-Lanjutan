import { db } from '@/lib/db'

export async function logAudit(
  user: { uid?: string; username?: string } | null,
  action: string,
  detail: string = ''
) {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.uid || null,
        username: user?.username || null,
        action,
        detail: detail.slice(0, 500),
      },
    })
  } catch {
    // jangan biarkan logging menggagalkan request utama
  }
}
