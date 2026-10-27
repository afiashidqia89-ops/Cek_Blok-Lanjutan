'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Database, HardDrive, Users, KeyRound, TrendingUp, FileClock, BarChart3, Map, Layers, ArrowRight } from 'lucide-react'
import { jsonFetch } from '@/lib/api'

interface StatsData {
  role: 'ADMIN' | 'USER'
  totalRecords: number
  totalSize: number
  records24h?: number
  records7d?: number
  ownRecords?: number
  totalUsers?: number
  activeUsers?: number
  activeTokens?: number
  scopeKebun?: string
  recent?: Array<{
    id: string; tanggal: string; pemeriksa: string; blok: string; afdeling: string;
    kebun: string; estate: string; status: string; perangkat: string;
    createdAt: string; uploadedBy?: { username: string } | null
  }>
  logs?: Array<{ id: string; username: string | null; action: string; detail: string; createdAt: string }>
}

export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

function statusColor(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('kritis') || st.includes('buruk')) return 'bg-red-100 text-red-800'
  if (st.includes('perhatian') || st.includes('waspada') || st.includes('sedang')) return 'bg-amber-100 text-amber-800'
  if (st) return 'bg-green-100 text-green-800'
  return 'bg-muted text-muted-foreground'
}

export default function DashboardHome() {
  const [data, setData] = useState<StatsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    jsonFetch<StatsData & { ok?: boolean; error?: string }>('/api/stats')
      .then((d) => { if (!d.ok) throw new Error(d.error); setData(d) })
      .catch((e) => setError(String((e as Error).message || e)))
  }, [])

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 text-sm text-red-800">
          <p className="font-semibold">Gagal memuat ringkasan</p>
          <p className="mt-1 text-red-700">{error}</p>
          <Button size="sm" variant="outline" className="mt-2 border-red-300 text-red-800 hover:bg-red-100" onClick={() => location.reload()}>
            Muat Ulang
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    )
  }

  const admin = data.role === 'ADMIN'
  const scoped = (data.scopeKebun || '').trim()
  const cards = [
    { t: 'Total Transaksi', v: String(data.totalRecords), i: Database, d: 'seluruh data di server' },
    { t: 'Ukuran Data', v: fmtBytes(data.totalSize), i: HardDrive, d: 'termasuk foto temuan' },
    admin
      ? { t: 'Pengguna', v: `${data.activeUsers ?? 0}/${data.totalUsers ?? 0}`, i: Users, d: 'aktif / terdaftar' }
      : { t: 'Unggahan Saya', v: String(data.ownRecords ?? 0), i: FileClock, d: 'dari perangkat saya' },
    { t: 'Token Aktif', v: String(data.activeTokens ?? 0), i: KeyRound, d: 'terhubung ke aplikasi' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ringkasan</h1>
          <p className="text-sm text-muted-foreground">
            {scoped
              ? `Lingkup data: kebun ${scoped} (sesuai penugasan akun Anda).`
              : admin
                ? 'Kontrol penuh server: pengguna, data, dan sinkronisasi.'
                : 'Data pemeriksaan Anda dan tim.'}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="outline" className="bg-white"><TrendingUp className="h-3 w-3 mr-1 text-green-700" />24 jam: {data.records24h ?? 0}</Badge>
          {admin && <Badge variant="outline" className="bg-white">7 hari: {data.records7d ?? 0}</Badge>}
        </div>
      </div>

      {/* Tautan cepat */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: '/dashboard/laporan', i: BarChart3, t: 'Laporan & Grafik', d: 'Tren, status, dan rekap per kebun/afdeling' },
          { href: '/dashboard/peta', i: Map, t: 'Peta Blok', d: 'Hasil pemeriksaan di-layout ke peta' },
          { href: '/dashboard/data-master', i: Layers, t: 'Data Master', d: 'Daftar blok, luas, dan jumlah pokok' },
        ].map((q) => {
          const Icon = q.i
          return (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-xl border border-green-100 bg-white/70 p-4 transition-all hover:border-green-300 hover:shadow-md"
            >
              <div className="rounded-lg bg-green-100 p-2.5 text-green-700 transition-colors group-hover:bg-green-700 group-hover:text-white">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-green-900">{q.t}</p>
                <p className="truncate text-xs text-muted-foreground">{q.d}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-green-300 transition-transform group-hover:translate-x-0.5 group-hover:text-green-600" />
            </Link>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.i
          return (
            <Card key={c.t} className="border-green-100">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="rounded-xl bg-green-100 p-3 text-green-700"><Icon className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight">{c.v}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.t} · {c.d}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-green-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
            <CardDescription>8 pemeriksaan terakhir yang masuk ke server</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Blok</TableHead>
                    <TableHead>Pemeriksa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sumber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.recent || []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.tanggal || '-'}</TableCell>
                      <TableCell>
                        <span className="font-medium">{r.blok || '-'}</span>
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {[r.estate, r.kebun, r.afdeling].filter(Boolean).join(' / ') || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.pemeriksa || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`border-transparent ${statusColor(r.status)}`}>{r.status || '-'}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.perangkat || r.uploadedBy?.username || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(data.recent || []).length && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada data. Kirim data dari aplikasi atau unggah berkas transfer.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-green-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aktivitas Terakhir</CardTitle>
            <CardDescription>{admin ? 'Log server (admin)' : 'Catatan aktivitas Anda'}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto divide-y">
              {(data.logs || []).map((l) => (
                <div key={l.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{l.action}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{l.username || 'sistem'} · {l.detail || '-'}</p>
                </div>
              ))}
              {!(data.logs || []).length && (
                <p className="py-8 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
              )}
            </div>
            {admin && (
              <div className="border-t p-3">
                <Link href="/dashboard/settings" className="text-sm font-medium text-green-700 hover:underline">
                  Lihat semua log →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
