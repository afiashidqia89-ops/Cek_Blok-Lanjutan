'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  ClipboardList, MapPin, Users2, TreePalm, BarChart3, Database, Map as MapIcon, Sprout,
} from 'lucide-react'
import { jsonFetch } from '@/lib/api'

interface ReportData {
  ok: boolean
  error?: string
  scopeKebun: string
  total: number
  totalSize: number
  blokUnik: number
  pemeriksaAktif: number
  kebunAktif: number
  perHari: { tanggal: string; jumlah: number }[]
  perKebun: { kebun: string; jumlah: number }[]
  perAfdeling: { afdeling: string; jumlah: number }[]
  perStatus: { status: string; jumlah: number }[]
  topBlok: { blok: string; jumlah: number }[]
  perPemeriksa: { pemeriksa: string; jumlah: number }[]
}

interface FacetsData {
  ok: boolean
  kebun: string[]
  scopeKebun?: string
}

const HIJAU = '#34d399'
const HIJAU_MUDA = '#6ee7b7'

const TIP = { contentStyle: { background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(22,101,52,0.20)', borderRadius: 12, color: '#14532d', fontSize: 12, boxShadow: '0 12px 32px rgba(20,60,35,0.15)' }, labelStyle: { color: '#166534', fontWeight: 600 }, itemStyle: { color: '#14532d' } }
const AMBER = '#f59e0b'
const MERAH = '#dc2626'

function warnaStatus(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('kritis') || st.includes('buruk') || st.includes('merah')) return MERAH
  if (st.includes('perhatian') || st.includes('waspada') || st.includes('sedang') || st.includes('kuning')) return AMBER
  return HIJAU
}

function labelTanggal(iso: string): string {
  // 2026-10-25 -> 25/10
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso
}

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

export default function HalamanLaporan() {
  const router = useRouter()
  const [rentang, setRentang] = useState<'7' | '30' | 'all'>('30')
  const [kebunPilih, setKebunPilih] = useState('')
  const [data, setData] = useState<ReportData | null>(null)
  const [facets, setFacets] = useState<FacetsData | null>(null)
  const [error, setError] = useState('')
  const [me, setMe] = useState<{ role: string; kebun?: string } | null>(null)

  useEffect(() => {
    jsonFetch<{ ok: boolean; user?: { role: string; kebun?: string } }>('/api/auth/me')
      .then((d) => { if (d.user) setMe(d.user) })
      .catch(() => {})
    jsonFetch<FacetsData>('/api/data/facets')
      .then(setFacets)
      .catch(() => {})
  }, [])

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (rentang !== 'all') {
      const to = new Date()
      const from = new Date(Date.now() - (Number(rentang) - 1) * 86400000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      p.set('from', iso(from))
      p.set('to', iso(to))
    }
    const kb = me?.role === 'ADMIN' ? kebunPilih : ''
    if (kb) p.set('kebun', kb)
    return p.toString()
  }, [rentang, kebunPilih, me])

  const muat = useCallback(() => {
    setError('')
    setData(null)
    jsonFetch<ReportData>(`/api/report?${qs}`)
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Gagal memuat laporan')
        setData(d)
      })
      .catch((e) => setError(String(e.message || e)))
  }, [qs])

  useEffect(() => { muat() }, [muat])

  const scoped = !!data?.scopeKebun
  const kosong = !!data && data.total === 0

  return (
    <div className="space-y-6">
      {/* Kepala halaman + kontrol */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-emerald-700" /> Laporan Pemeriksaan
          </h1>
          <p className="text-sm text-muted-foreground">
            Grafik & rekap data pemeriksaan blok {scoped ? `— lingkup kebun ${data?.scopeKebun}` : 'seluruh data yang dapat Anda akses'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me?.role === 'ADMIN' && (
            <select
              value={kebunPilih}
              onChange={(e) => setKebunPilih(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter kebun"
            >
              <option value="">Semua Kebun</option>
              {(facets?.kebun || []).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          <div className="flex rounded-lg border border-emerald-600/20 bg-emerald-600/10 p-1">
            {([['7', '7 Hari'], ['30', '30 Hari'], ['all', 'Semua']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setRentang(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${rentang === v ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-900 hover:bg-emerald-600/12'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-600">
            <span className="mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Gagal memuat laporan</p>
              <p className="mt-0.5 text-red-600">{error}</p>
              <Button size="sm" variant="outline" className="mt-2 border-red-500/40 text-red-600 hover:bg-red-500/15" onClick={muat}>
                Coba Lagi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!error && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {data && (
        <>
          {/* Kartu ringkas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: 'Total Transaksi', v: String(data.total), i: ClipboardList, d: 'pemeriksaan pada rentang ini' },
              { t: 'Blok Unik', v: String(data.blokUnik), i: MapPin, d: 'blok berbeda yang diperiksa' },
              { t: 'Pemeriksa Aktif', v: String(data.pemeriksaAktif), i: Users2, d: 'orang yang melakukan pemeriksaan' },
              { t: 'Kebun Aktif', v: String(data.kebunAktif), i: TreePalm, d: 'kebun dengan aktivitas pemeriksaan' },
            ].map((c) => {
              const Icon = c.i
              return (
                <Card key={c.t} className="border-emerald-600/15 transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-3 text-white shadow-sm">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold leading-tight">{c.v}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.t} · {c.d}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {kosong ? (
            <Card className="border-dashed border-emerald-600/20 bg-emerald-600/10">
              <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
                <Sprout className="h-10 w-10 text-green-300" />
                <p className="font-semibold text-emerald-950">Belum ada data pada rentang ini</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Data muncul otomatis setelah aplikasi HP menekan &quot;Kirim ke Server&quot; atau berkas transfer diunggah lewat menu Data Pemeriksaan. Coba ubah rentang waktu atau filter kebun.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Grafik utama: tren harian */}
              <Card className="border-emerald-600/15">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tren Pemeriksaan per Hari</CardTitle>
                  <CardDescription>Jumlah transaksi pemeriksaan yang masuk setiap hari</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.perHari} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradHijau" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={HIJAU} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={HIJAU} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,83,45,0.10)" vertical={false} />
                        <XAxis dataKey="tanggal" tickFormatter={labelTanggal} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                        <Tooltip
                          {...TIP}
                          formatter={(v: number) => [`${v} transaksi`, 'Pemeriksaan']}
                          labelFormatter={(l: string) => `Tanggal ${l}`}
                        />
                        <Area type="monotone" dataKey="jumlah" stroke={HIJAU} strokeWidth={2.5} fill="url(#gradHijau)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Status temuan */}
                <Card className="border-emerald-600/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Komposisi Status Blok</CardTitle>
                    <CardDescription>Perbandingan kondisi blok hasil pemeriksaan</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {data.perStatus.length ? (
                      <div className="h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.perStatus}
                              dataKey="jumlah"
                              nameKey="status"
                              innerRadius={52}
                              outerRadius={85}
                              paddingAngle={3}
                              label={({ name, value }) => `${name}: ${value}`}
                              labelLine={false}
                            >
                              {data.perStatus.map((s) => (
                                <Cell key={s.status} fill={warnaStatus(s.status)} />
                              ))}
                            </Pie>
                            <Tooltip {...TIP} formatter={(v: number, n: string) => [`${v} transaksi`, n]} />
                            <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 12, color: '#166534' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="py-16 text-center text-sm text-muted-foreground">Belum ada status tercatat.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Per kebun */}
                <Card className="border-emerald-600/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Pemeriksaan per Kebun</CardTitle>
                    <CardDescription>12 kebun dengan transaksi terbanyak</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.perKebun} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,83,45,0.10)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                          <YAxis type="category" dataKey="kebun" width={64} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                          <Tooltip {...TIP} formatter={(v: number) => [`${v} transaksi`, 'Jumlah']} />
                          <Bar dataKey="jumlah" fill={HIJAU} radius={[0, 6, 6, 0]} barSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Per afdeling */}
                <Card className="border-emerald-600/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Pemeriksaan per Afdeling</CardTitle>
                    <CardDescription>12 afdeling dengan transaksi terbanyak</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.perAfdeling} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,83,45,0.10)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                          <YAxis type="category" dataKey="afdeling" width={72} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
                          <Tooltip {...TIP} formatter={(v: number) => [`${v} transaksi`, 'Jumlah']} />
                          <Bar dataKey="jumlah" fill={HIJAU_MUDA} radius={[0, 6, 6, 0]} barSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Per pemeriksa */}
                <Card className="border-emerald-600/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Aktivitas Pemeriksa</CardTitle>
                    <CardDescription>10 pemeriksa dengan transaksi terbanyak</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="max-h-60 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pemeriksa</TableHead>
                            <TableHead className="text-right">Transaksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.perPemeriksa.map((p) => (
                            <TableRow key={p.pemeriksa}>
                              <TableCell className="font-medium">{p.pemeriksa}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="bg-emerald-600/10 text-emerald-900">{p.jumlah}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {!data.perPemeriksa.length && (
                            <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top blok */}
              <Card className="border-emerald-600/15">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Blok Paling Sering Diperiksa</CardTitle>
                  <CardDescription>10 blok teratas pada rentang ini</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    {data.topBlok.map((b) => (
                      <Badge key={b.blok} variant="outline" className="border-emerald-600/20 bg-emerald-600/10 px-3 py-1.5 text-sm text-emerald-950">
                        {b.blok} <span className="ml-1.5 font-bold text-emerald-700">×{b.jumlah}</span>
                      </Badge>
                    ))}
                    {!data.topBlok.length && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Tautan cepat */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-emerald-600/20 text-emerald-900 hover:bg-emerald-600/10" onClick={() => router.push('/dashboard/data')}>
              <Database className="mr-2 h-4 w-4" /> Lihat Data Lengkap
            </Button>
            <Button variant="outline" className="border-emerald-600/20 text-emerald-900 hover:bg-emerald-600/10" onClick={() => router.push('/dashboard/peta')}>
              <MapIcon className="mr-2 h-4 w-4" /> Buka Peta Blok
            </Button>
            <span className="ml-auto self-center text-xs text-muted-foreground">
              Ukuran data rentang ini: {fmtBytes(data.totalSize)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
