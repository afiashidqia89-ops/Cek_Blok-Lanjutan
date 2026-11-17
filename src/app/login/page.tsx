'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { Map as MapIcon, BarChart3, Camera } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = sp.get('next') || '/dashboard'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [perluSetup, setPerluSetup] = useState(false)

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => setPerluSetup(!!d.perluSetup))
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) {
        toast.error(d.error || 'Login gagal')
        return
      }
      toast.success('Berhasil masuk')
      router.replace(next)
      router.refresh()
    } catch {
      toast.error('Tidak bisa terhubung ke server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ===== Panel form (kiri) ===== */}
      <div className="flex w-full flex-col justify-center px-6 py-10 lg:w-[46%] lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <Image
              src="/icon-512.png"
              alt="Logo Cek Blok"
              width={56}
              height={56}
              className="rounded-full shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-600/30"
            />
            <div className="leading-tight">
              <p className="text-lg font-bold text-foreground">Cek Blok</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 dark:text-emerald-400">
                HPI Sustainable Palm Oil
              </p>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Selamat Datang Kembali
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Masuk untuk memantau pemeriksaan blok kebun sawit Anda secara real-time.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Nama Pengguna</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="mis. admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Kata Sandi</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Lupa kata sandi? Hubungi Super Admin Anda.
            </p>
            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-emerald-700 hover:bg-emerald-800"
            >
              {loading ? 'Memproses…' : 'Masuk ke Dashboard'}
            </Button>
          </form>

          {perluSetup && (
            <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Belum ada akun admin di server ini.{' '}
              <Link href="/setup" className="font-semibold underline">
                Buat akun admin pertama →
              </Link>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Aplikasi Cek Blok bisa dibuka di{' '}
            <Link href="/app/" className="font-medium text-emerald-700 dark:text-emerald-400 underline dark:text-emerald-400">
              /app/
            </Link>{' '}
            (browser HP) — fitur Kirim/Ambil dari Server aktif di sana.
          </p>
        </div>
      </div>

      {/* ===== Panel foto kebun (kanan, hanya layar besar) ===== */}
      <div className="relative hidden flex-1 lg:block">
        <Image
          src="/banner-kebun.jpg"
          alt="Kebun sawit HPI Sustainable Palm Oil"
          fill
          priority
          sizes="60vw"
          className="object-cover"
        />
        {/* lapisan gelap agar teks terbaca */}
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-950/10 to-transparent" />
        {/* penanda status server */}
        <div className="absolute right-6 top-6 flex items-center gap-2 rounded-full bg-emerald-950/45 px-3.5 py-1.5 text-xs font-semibold text-emerald-100 ring-1 ring-white/20 backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Server aktif · real-time
        </div>
        {/* kartu informasi di bawah */}
        <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-emerald-950/55 p-6 text-white ring-1 ring-white/15 backdrop-blur-sm">
          <h2 className="text-xl font-bold leading-snug">
            Satu server untuk seluruh pemeriksaan blok kebun Anda.
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-emerald-50/90">
            Data dari aplikasi HP masuk otomatis, langsung tampil di dashboard, peta, dan
            laporan — dari mana saja, kapan saja.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <MapIcon className="h-3.5 w-3.5" /> Peta Blok Interaktif
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <BarChart3 className="h-3.5 w-3.5" /> Rekap Otomatis
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <Camera className="h-3.5 w-3.5" /> Foto Temuan
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
