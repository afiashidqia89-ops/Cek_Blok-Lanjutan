import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, signSession, COOKIE_NAME, sessionCookieOptions } from '@/lib/auth'
import { ensureSuperAdminExists } from '@/lib/superadmin'

/**
 * Info akun yang sedang masuk.
 * Peran (role) diambil SEGAR dari database (bukan dari sesi lama), sehingga
 * kenaikan jabatan menjadi Super Admin langsung terlihat tanpa harus
 * keluar-masuk lagi. Bila peran/nama berubah, sesi (cookie) diperbarui diam-diam.
 */
export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })

  // Jaga-jaga: pastikan minimal satu Super Admin selalu ada.
  await ensureSuperAdminExists()

  const fresh = await db.user.findUnique({
    where: { id: s.uid },
    select: { role: true, name: true, isActive: true },
  })
  if (!fresh || !fresh.isActive) {
    return NextResponse.json({ ok: false, error: 'Akun tidak aktif' }, { status: 401 })
  }

  if (fresh.role !== s.role || fresh.name !== s.name) {
    // Peran/nama berubah di database → segarkan sesi (cookie) otomatis
    const session = { ...s, role: fresh.role as typeof s.role, name: fresh.name }
    const token = await signSession(session)
    const res = NextResponse.json({ ok: true, user: session, roleRefreshed: true })
    res.cookies.set(COOKIE_NAME, token, sessionCookieOptions())
    return res
  }

  return NextResponse.json({ ok: true, user: s })
}
