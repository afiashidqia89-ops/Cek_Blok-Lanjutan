'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'

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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-background to-white">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <Image
              src="/icon-512.png"
              alt="Logo Cek Blok"
              width={72}
              height={72}
              className="mx-auto rounded-2xl shadow-xl shadow-emerald-900/20 ring-1 ring-emerald-600/30"
            />
            <h1 className="bg-gradient-to-r from-emerald-700 to-emerald-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">Cek Blok Server</h1>
            <p className="text-sm text-muted-foreground">
              Masuk untuk mengelola data pemeriksaan kondisi blok
            </p>
          </div>
          <Card className="shadow-2xl shadow-emerald-900/15 border-emerald-600/15">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Login</CardTitle>
              <CardDescription>Gunakan username dan password akun Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
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
                  <Label htmlFor="password">Password</Label>
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
                <Button
                  type="submit"
                  disabled={loading || !username || !password}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {loading ? 'Memproses…' : 'Masuk'}
                </Button>
              </form>
              {perluSetup && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                  Belum ada akun admin di server ini.{' '}
                  <Link href="/setup" className="font-semibold underline">
                    Buat akun admin pertama →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-center text-xs text-muted-foreground">
            Aplikasi Cek Blok bisa dibuka di{' '}
            <Link href="/app/" className="font-medium text-emerald-700 underline">
              /app/
            </Link>{' '}
            (browser HP) — fitur Kirim/Ambil dari Server aktif di sana.
          </p>
        </div>
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        Cek Blok Server — sinkronisasi data pemeriksaan blok
      </footer>
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
