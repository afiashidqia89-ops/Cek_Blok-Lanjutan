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
import { Database, TrendingUp, BarChart3, Map, Layers, ArrowRight, MapPin, Camera } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts'
import { jsonFetch } from '@/lib/api'

interface StatsData {
  role: 'SUPERADMIN' | 'ADMIN' | 'USER'
  totalRecords: number
  totalSize: number
  records24h?: number
  records7d?: number
  ownRecords?: number
  totalUsers?: number
  activeUsers?: number
  activeTokens?: number
  totalBlokMaster?: number
  blokDiperiksa?: number
  scopeKebun?: string
  tren14?: { tanggal: string; jumlah: number }[]
  perStatus?: { status: string; jumlah: number }[]
  perKebun?: { kebun: string; jumlah: number }[]
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

const WARNA_STATUS: Record<string, string> = {
  BAIK: '#22c55e',
  'PERLU PERBAIKAN': '#f59e0b',
  'PRIORITAS TINGGI': '#ef4444',
}
const WARNA_LAIN = ['#34d399', '#38bdf8', '#c084fc', '#fb923c', '#94a3b8', '#2dd4bf', '#facc15', '#f472b6']

const TIP = { contentStyle: { background: 'rgba(4,22,14,0.94)', border: '1px solid rgba(52,211,153,0.28)', borderRadius: 12, color: '#d1fae5', fontSize: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }, labelStyle: { color: '#a7f3d0', fontWeight: 600 }, itemStyle: { color: '#ecfdf5' } }

function statusColor(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('kritis') || st.includes('buruk')) return 'bg-red-500/15 text-red-300'
  if (st.includes('perhatian') || st.includes('waspada') || st.includes('sedang')) return 'bg-amber-500/15 text-amber-300'
  if (st) return 'bg-emerald-500/15 text-emerald-300'
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
      <Card className="border-red-500/30 bg-red-500/10">
        <CardContent className="p-4 text-sm text-red-300">
          <p className="font-semibold">Gagal memuat ringkasan</p>
          <p className="mt-1 text-red-400">{error}</p>
          <Button size="sm" variant="outline" className="mt-2 border-red-500/40 text-red-300 hover:bg-red-500/15" onClick={() => location.reload()}>
            Muat Ulang
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-3" />
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-2" />
        </div>
      </div>
    )
  }

  const adminish = data.role !== 'USER'
  const superadmin = data.role === 'SUPERADMIN'
  const scoped = (data.scopeKebun || '').trim()

  const tautan = [
    { href: '/dashboard/laporan', i: BarChart3, t: 'Laporan & Grafik', d: 'Tren, status, dan rekap per kebun/afdeling' },
    { href: '/dashboard/data', i: Database, t: 'Data Pemeriksaan', d: 'Rekap & hasil temuan, unggah Excel' },
    { href: '/dashboard/peta', i: Map, t: 'Peta Blok', d: 'Hasil pemeriksaan di-layout ke peta' },
    ...(superadmin ? [{ href: '/dashboard/data-master', i: Layers, t: 'Data Master', d: 'Impor XLSX, daftar blok, luas, pokok' }] : []),
  ]

  const perStatus = (data.perStatus || []).slice(0, 8)
  const totalStatus = perStatus.reduce((s, x) => s + x.jumlah, 0) || 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ringkasan</h1>
          <p className="text-sm text-muted-foreground">
            {scoped
              ? `Lingkup data: kebun ${scoped} (sesuai penugasan akun Anda).`
              : adminish
                ? 'Kontrol penuh server: pengguna, data, dan sinkronisasi.'
                : 'Data pemeriksaan Anda dan tim.'}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="outline" className="bg-card"><TrendingUp className="h-3 w-3 mr-1 text-emerald-300" />7 hari: {data.records7d ?? 0}</Badge>
          <Badge variant="outline" className="bg-card"><Camera className="h-3 w-3 mr-1 text-emerald-300" />Data master: {data.totalBlokMaster != null ? data.totalBlokMaster.toLocaleString('id-ID') + ' blok' : '—'}</Badge>
        </div>
      </div>

      {/* Tautan cepat */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tautan.map((q) => {
          const Icon = q.i
          return (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-card/70 p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-950/50"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 text-emerald-300 ring-1 ring-emerald-400/25 transition-all group-hover:from-emerald-500 group-hover:to-emerald-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-emerald-950/50">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-100">{q.t}</p>
                <p className="truncate text-xs text-muted-foreground">{q.d}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-green-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300" />
            </Link>
          )
        })}
      </div>

      {/* Grafik */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tren Pemeriksaan 14 Hari</CardTitle>
            <CardDescription>Jumlah transaksi masuk per tanggal</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.tren14 || []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="tanggal" tickFormatter={(v: string) => v.slice(5)} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <RTooltip {...TIP} formatter={(v) => [`${v} transaksi`, 'Jumlah']} labelFormatter={(l) => `Tanggal ${l}`} />
                <Bar dataKey="jumlah" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Blok</CardTitle>
            <CardDescription>Distribusi kondisi blok yang diperiksa</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {perStatus.length ? (
              <div className="flex h-full items-center gap-3">
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie data={perStatus} dataKey="jumlah" nameKey="status" innerRadius="62%" outerRadius="88%" paddingAngle={2}>
                      {perStatus.map((x, i) => (
                        <Cell key={x.status} fill={WARNA_STATUS[x.status.toUpperCase()] || WARNA_LAIN[i % WARNA_LAIN.length]} />
                      ))}
                    </Pie>
                    <RTooltip {...TIP} formatter={(v, n) => [`${v} transaksi`, String(n)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 text-xs">
                  {perStatus.map((x, i) => (
                    <div key={x.status} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: WARNA_STATUS[x.status.toUpperCase()] || WARNA_LAIN[i % WARNA_LAIN.length] }} />
                      <span className="truncate flex-1">{x.status || '-'}</span>
                      <span className="font-semibold tabular-nums">{Math.round((x.jumlah / totalStatus) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">Belum ada data status.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Kebun teratas + tabel terbaru */}
      {(data.perKebun || []).length > 0 && (
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><MapPin className="h-4 w-4 text-emerald-300" /> Kebun Tersibuk</CardTitle>
            <CardDescription>8 kebun dengan transaksi terbanyak</CardDescription>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.perKebun} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="kebun" width={90} fontSize={11} tickLine={false} axisLine={false} />
                <RTooltip {...TIP} formatter={(v) => [`${v} transaksi`, 'Jumlah']} />
                <Bar dataKey="jumlah" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-emerald-500/20">
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
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada data. Kirim data dari aplikasi atau unggah berkas Excel.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aktivitas Terakhir</CardTitle>
            <CardDescription>{adminish ? 'Log server (admin)' : 'Catatan aktivitas Anda'}</CardDescription>
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
            {adminish && (
              <div className="border-t p-3">
                <Link href="/dashboard/settings" className="text-sm font-medium text-emerald-300 hover:underline">
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
