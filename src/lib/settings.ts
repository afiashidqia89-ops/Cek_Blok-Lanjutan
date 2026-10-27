import { db } from '@/lib/db'

export const SETTING_DEFAULTS: Record<string, string> = {
  siteTitle: 'Cek Blok Server',
  siteDesc: 'Server sinkronisasi data pemeriksaan kondisi blok',
  maxUploadMB: '25',
  syncEnabled: '1',
  usersCanSeeAllData: '1',
  usersCanDeleteOwnData: '1',
}

export type AppSettings = typeof SETTING_DEFAULTS

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany()
  const out: Record<string, string> = { ...SETTING_DEFAULTS }
  for (const r of rows) out[r.key] = r.value
  return out as AppSettings
}

export async function saveSettings(patch: Record<string, string>) {
  const allowed = Object.keys(SETTING_DEFAULTS)
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue
    await db.setting.upsert({
      where: { key: k },
      create: { key: k, value: String(v) },
      update: { value: String(v) },
    })
  }
  return getSettings()
}

export function boolSetting(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'on'
}
