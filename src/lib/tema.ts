/**
 * Mode tema web: terang / gelap.
 * Disimpan di localStorage ('tema-cek-blok'), diterapkan lewat class 'dark'
 * pada <html>. Script pembuka di layout.tsx menerapkan tema sebelum halaman
 * digambar agar tidak berkedip.
 */
export const TEMA_KEY = 'tema-cek-blok'

export function temaGelap(): boolean {
  try {
    const t = localStorage.getItem(TEMA_KEY)
    if (t) return t === 'gelap'
  } catch { /* abaikan */ }
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function temaSet(gelap: boolean): void {
  try {
    document.documentElement.classList.toggle('dark', gelap)
    localStorage.setItem(TEMA_KEY, gelap ? 'gelap' : 'terang')
  } catch { /* abaikan */ }
}

/** Skrip inline untuk dipasang di <head> — terapkan tema sebelum render */
export const TEMA_SKRIP_AWAL = `(function(){try{var t=localStorage.getItem('${TEMA_KEY}');var g=t?t==='gelap':window.matchMedia('(prefers-color-scheme: dark)').matches;if(g)document.documentElement.classList.add('dark');}catch(e){}})();`
