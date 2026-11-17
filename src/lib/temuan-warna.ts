/**
 * Warna tetap untuk 5 jenis temuan Cek Blok — konsisten di seluruh web
 * (tabel data, rincian temuan, rekap/laporan). Sama dengan warna di aplikasi HP.
 * Urutan & kode warna TIDAK boleh diubah sembarangan agar makna warna tetap.
 */
export const TEMUAN_WARNA: { kunci: string; cocok: RegExp; hex: string; teks: string; latar: string; label: string }[] = [
  { kunci: 'semak',   cocok: /semak/i,   hex: '#DC2626', teks: '#B91C1C', latar: 'rgba(220,38,38,0.10)',  label: 'Semak' },
  { kunci: 'tunasan', cocok: /tunasan/i, hex: '#7C3AED', teks: '#6D28D9', latar: 'rgba(124,58,237,0.10)', label: 'Tunasan' },
  { kunci: 'titi',    cocok: /titi/i,    hex: '#92400E', teks: '#92400E', latar: 'rgba(146,64,14,0.10)',  label: 'Titi Panen' },
  { kunci: 'kerdil',  cocok: /kerdil/i,  hex: '#DB2777', teks: '#BE185D', latar: 'rgba(219,39,119,0.10)', label: 'Pokok Kerdil' },
  { kunci: 'banjir',  cocok: /banjir|areal/i, hex: '#0891B2', teks: '#0E7490', latar: 'rgba(8,145,178,0.10)', label: 'Areal Banjir' },
]

/** Cari definisi warna untuk nama/jenis temuan; null bila bukan 5 temuan utama */
export function cariWarnaTemuan(nama: string) {
  const n = (nama || '').toLowerCase()
  return TEMUAN_WARNA.find((t) => t.cocok.test(n)) || null
}

/** Kelas Tailwind untuk titik (dot) status pemeriksaan */
export function kelasTitikStatus(status: string): string {
  const v = (status || '').toLowerCase()
  if (v.includes('kritis') || v.includes('buruk') || v.includes('prioritas')) return 'bg-red-500'
  if (v.includes('perhatian') || v.includes('waspada') || v.includes('sedang') || v.includes('perbaikan')) return 'bg-amber-500'
  if (v.includes('baik')) return 'bg-emerald-500'
  return 'bg-muted-foreground/40'
}

/** Kelas Tailwind untuk badge status pemeriksaan */
export function kelasBadgeStatus(status: string): string {
  const v = (status || '').toLowerCase()
  if (v.includes('kritis') || v.includes('buruk') || v.includes('prioritas')) return 'bg-red-500/12 text-red-700 dark:text-red-400'
  if (v.includes('perhatian') || v.includes('waspada') || v.includes('sedang') || v.includes('perbaikan')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  if (v.includes('baik')) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  if (v) return 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'
  return 'bg-muted text-muted-foreground'
}
