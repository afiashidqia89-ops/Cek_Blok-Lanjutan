'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Menu "Token Perangkat" dipindah ke dalam halaman Pengaturan
 * (tab "Token Perangkat") atas permintaan pengguna.
 * Halaman lama /dashboard/tokens kini hanya mengalihkan ke sana,
 * supaya tautan/bookmark lama tetap berfungsi.
 */
export default function TokensPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/settings?tab=token')
  }, [router])
  return (
    <p className="p-8 text-center text-sm text-muted-foreground">Membuka Token Perangkat&hellip;</p>
  )
}
