import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/log'
import { SETTING_DEFAULTS } from '@/lib/settings'

/** GET: cek apakah perlu setup (belum ada user) */
export async function GET() {
  const count = await db.user.count()
  return NextResponse.json({ ok: true, perluSetup: count === 0 })
}

/** POST: buat admin pertama — hanya bisa dilakukan saat belum ada user sama sekali */
export async function POST(req: Request) {
  const count = await db.user.count()
  if (count > 0) {
    return NextResponse.json(
      { ok: false, error: 'Setup sudah dilakukan. Gunakan halaman login.' },
      { status: 403 }
    )
  }
  let body: { username?: string; name?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const username = String(body.username || '').trim().toLowerCase()
  const name = String(body.name || '').trim() || username
  const password = String(body.password || '')
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { ok: false, error: 'Username 3-32 karakter, hanya huruf kecil, angka, titik, garis bawah/strip' },
      { status: 400 }
    )
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: 'Password minimal 6 karakter' }, { status: 400 })
  }
  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: { username, name, passwordHash, role: 'ADMIN' },
  })
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
  await logAudit({ uid: user.id, username }, 'SETUP', 'Admin pertama dibuat')
  return NextResponse.json({ ok: true })
}
