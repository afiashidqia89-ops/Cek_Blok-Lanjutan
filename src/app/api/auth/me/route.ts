import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  return NextResponse.json({ ok: true, user: s })
}
