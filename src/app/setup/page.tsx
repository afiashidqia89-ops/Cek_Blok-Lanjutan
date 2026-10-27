'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'

export default function SetupPage() {
  const [checked, setChecked] = useState(false)
  const [perluSetup, setPerluSetup] = useState(false)
  const [username, setUsername] = useState('admin')
  const [name, setName] = useState('Administrator')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => setPerluSetup(!!d.perluSetup))
      .catch(() => toast.error('Gagal memeriksa status server'))
      .finally(() => setChecked(true))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter')
      return
    }
    if (password !== confirm) {
      toast.error('Konfirmasi password tidak sama')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) {
        toast.error(d.error || 'Setup gagal')
        return
      }
      toast.success('Admin pertama dibuat! Silakan login.')
    } catch {
      toast.error('Tidak bisa terhubung ke server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 via-background to-emerald-50">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <Image
              src="/icon-512.png"
              alt="Logo Cek Blok"
              width={72}
              height={72}
              className="mx-auto rounded-2xl shadow-md"
            />
            <h1 className="text-2xl font-bold tracking-tight text-green-800">Setup Awal Server</h1>
            <p className="text-sm text-muted-foreground">Buat akun admin pertama untuk Cek Blok Server</p>
          </div>
          <Card className="shadow-lg border-green-100">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Akun Admin</CardTitle>
              <CardDescription>Hanya bisa dilakukan satu kali, saat server masih kosong</CardDescription>
            </CardHeader>
            <CardContent>
              {!checked ? (
                <p className="text-sm text-muted-foreground">Memeriksa server…</p>
              ) : !perluSetup ? (
                <div className="space-y-3 text-sm">
                  <p className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
                    Server sudah memiliki akun. Setup tidak diperlukan lagi.
                  </p>
                  <Button asChild className="w-full bg-green-700 hover:bg-green-800">
                    <Link href="/login">Ke Halaman Login</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Huruf kecil, angka, titik, garis bawah/strip (3-32 karakter)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama tampilan</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Ulangi password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-green-700 hover:bg-green-800"
                  >
                    {loading ? 'Membuat akun…' : 'Buat Akun Admin'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
