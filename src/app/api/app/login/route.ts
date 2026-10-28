import { corsJson, corsOptions } from '@/lib/api'
import { verifyPassword, generateDeviceToken } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/log'

export const maxDuration = 30

export async function OPTIONS() {
  return corsOptions()
}

/**
 * Login aplikasi HP (Cek Blok) memakai akun user yang didaftarkan di web.
 * Body: {username, password, device?}
 * Respons: {ok, user:{username,name,role,estate,kebun,afdeling}, token}
 * Token = token perangkat (cbk_...) milik user tsb — dipakai otomatis oleh
 * aplikasi untuk Kirim/Ambil dari Server. Token dipakai ulang bila sudah ada,
 * jadi daftar Token Perangkat tidak menumpuk; admin tetap bisa mencabutnya.
 * user.estate/kebun/afdeling = penugasan user — aplikasi HP memakainya untuk
 * membatasi daftar blok (Download Data Server) & data transaksi yang diterima.
 * Dibatasi 5 percobaan gagal / menit / username (memori server).
 */
const attempts = new Map<string, { n: number; until: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000

function tooManyAttempts(key: string): boolean {
  const now = Date.now()
  const a = attempts.get(key)
  if (a && now < a.until && a.n >= MAX_ATTEMPTS) return true
  if (!a || now >= a.until) attempts.set(key, { n: 0, until: now + WINDOW_MS })
  return false
}

function recordFailure(key: string) {
  const a = attempts.get(key)
  if (a) a.n++
}

export async function POST(req: Request) {
  let body: { username?: string; password?: string; device?: string }
  try {
    body = await req.json()
  } catch {
    return corsJson({ ok: false, error: 'Body tidak valid' }, 400)
  }

  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const device = String(body.device || '').trim().slice(0, 60)
  if (!username || !password) {
    return corsJson({ ok: false, error: 'Username dan password wajib diisi' }, 400)
  }

  const key = username.toLowerCase()
  if (tooManyAttempts(key)) {
    return corsJson({ ok: false, error: 'Terlalu banyak percobaan gagal. Tunggu 1 menit lalu coba lagi.' }, 429)
  }

  const user = await db.user.findUnique({ where: { username } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(key)
    await logAudit({ username }, 'APP_LOGIN_GAGAL', `username: ${username}`)
    return corsJson({ ok: false, error: 'Username atau password salah' }, 401)
  }
  if (!user.isActive) {
    return corsJson({ ok: false, error: 'Akun dinonaktifkan. Hubungi admin.' }, 403)
  }
  attempts.delete(key)

  // Cari token login HP milik user ini; buat baru bila belum ada / dinonaktifkan semua
  const label = `Login HP: ${username}`
  let tokenRow = await db.deviceToken.findFirst({
    where: { userId: user.id, label, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!tokenRow) {
    tokenRow = await db.deviceToken.create({
      data: {
        token: generateDeviceToken(),
        label: device ? `${label} (${device})` : label,
        userId: user.id,
      },
    })
  }
  db.deviceToken.update({ where: { id: tokenRow.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  await logAudit({ uid: user.id, username: user.username }, 'APP_LOGIN', `login aplikasi HP${device ? ` (${device})` : ''}`)

  return corsJson({
    ok: true,
    user: {
      username: user.username,
      name: user.name,
      role: user.role,
      estate: user.estate || '',
      kebun: user.kebun || '',
      afdeling: user.afdeling || '',
    },
    token: tokenRow.token,
    serverTime: Date.now(),
  })
}
