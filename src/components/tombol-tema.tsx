'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { temaGelap, temaSet } from '@/lib/tema'

/**
 * Tombol ganti tema terang/gelap untuk bilah atas.
 * Kondisi awal dibaca setelah mount (hindari beda hasil render server vs browser).
 */
export function TombolTema() {
  const [gelap, setGelap] = useState<boolean | null>(null)

  useEffect(() => {
    setGelap(temaGelap())
  }, [])

  function klik() {
    const berikut = !gelap
    setGelap(berikut)
    temaSet(berikut)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={klik}
      className="rounded-full"
      aria-label={gelap ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      title={gelap ? 'Mode terang' : 'Mode gelap'}
    >
      {/* ukuran tetap agar tidak bergeser saat ikon berganti */}
      <span className="grid h-5 w-5 place-items-center">
        {gelap === null ? null : gelap ? <Sun className="h-5 w-5 text-emerald-900 dark:text-emerald-200" /> : <Moon className="h-5 w-5 text-emerald-900 dark:text-emerald-200" />}
      </span>
    </Button>
  )
}
