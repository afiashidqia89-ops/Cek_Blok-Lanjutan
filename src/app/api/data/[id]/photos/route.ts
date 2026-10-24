import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, boolSetting } from '@/lib/settings'

type Ctx = { params: Promise<{ id: string }> }

const LABELS: Record<string, string> = {
  semak: 'Semak',
  tunasan: 'Tunasan Bermasalah',
  titi: 'Titi Panen',
  kerdil: 'Pokok Kerdil',
  banjir: 'Areal Banjir',
  bukti: 'Foto Bukti Ancak',
}

interface DetailItem { photo?: unknown; extras?: { photo?: unknown }[] }

/**
 * Daftar foto temuan milik satu transaksi.
 * Foto tersimpan di dalam payload (data URL) — dipetakan per jenis temuan:
 * semak/tunasan/titi/kerdil/banjir/bukti + sampel tambahan (extras).
 * Auth sama dengan detail transaksi: admin/lihat-semua boleh semua,
 * user biasa hanya data unggahannya sendiri.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 })
  const { id } = await ctx.params

  const settings = await getSettings()
  const seeAll = s.role === 'ADMIN' || boolSetting(settings.usersCanSeeAllData)
  const row = await db.dataRecord.findUnique({
    where: { id },
    select: { payload: true, uploadedById: true },
  })
  if (!row) return NextResponse.json({ ok: false, error: 'Data tidak ditemukan' }, { status: 404 })
  if (!seeAll && row.uploadedById !== s.uid) {
    return NextResponse.json({ ok: false, error: 'Tidak berhak' }, { status: 403 })
  }

  const photos: { key: string; label: string; sample: number; url: string }[] = []
  try {
    const r = JSON.parse(row.payload || '{}') as { details?: Record<string, DetailItem> }
    const D = r.details || {}
    for (const key of Object.keys(D)) {
      const d = D[key]
      if (!d) continue
      if (typeof d.photo === 'string' && d.photo.startsWith('data:image')) {
        photos.push({ key, label: LABELS[key] || key, sample: 1, url: d.photo })
      }
      const extras = Array.isArray(d.extras) ? d.extras : []
      extras.forEach((x, i) => {
        if (x && typeof x.photo === 'string' && x.photo.startsWith('data:image')) {
          photos.push({
            key,
            label: `${LABELS[key] || key} – sampel ${i + 2}`,
            sample: i + 2,
            url: x.photo,
          })
        }
      })
    }
  } catch {
    // payload rusak → kirim daftar kosong, jangan 500
  }

  return NextResponse.json({ ok: true, jumlah: photos.length, photos })
}
