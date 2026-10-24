import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getSettings, saveSettings, SETTING_DEFAULTS } from '@/lib/settings'
import { logAudit } from '@/lib/log'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  const settings = await getSettings()
  return NextResponse.json({ ok: true, settings, defaults: SETTING_DEFAULTS })
}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: 'Khusus admin' }, { status: 403 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }
  const patch: Record<string, string> = {}
  for (const k of Object.keys(SETTING_DEFAULTS)) {
    if (body[k] !== undefined) patch[k] = String(body[k])
  }
  if (patch.maxUploadMB !== undefined) {
    const n = Number(patch.maxUploadMB)
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return NextResponse.json({ ok: false, error: 'Ukuran upload maksimal: 1-200 MB' }, { status: 400 })
    }
  }
  const settings = await saveSettings(patch)
  await logAudit(admin, 'UBAH_PENGATURAN', Object.keys(patch).join(','))
  return NextResponse.json({ ok: true, settings })
}
