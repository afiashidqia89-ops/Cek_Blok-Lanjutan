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
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  ClipboardList, MapPin, Users2, TreePalm, BarChart3, Database, Map as MapIcon, Sprout,
  ChevronDown, ChevronRight, Search, CalendarDays, User as UserIcon, Flag, ListTree, Layers3,
} from 'lucide-react'
import { jsonFetch } from '@/lib/api'

/* ============================== TIPE DATA ============================== */

interface Nilai { semak?: number; tunasan?: number; titi?: number; kerdil?: number; banjir?: number }

interface BlokAgg {
  nama: string; transaksi: number; temuan: number; nilai: Nilai
  terakhir: string; statusTerakhir: string; pemeriksaTerakhir: string
}
interface AfdelingAgg {
  nama: string; transaksi: number; temuan: number; nilai: Nilai
  terakhir: string; blokList: BlokAgg[]
}
interface KebunAgg {
  nama: string; transaksi: number; temuan: number; nilai: Nilai
  terakhir: string; afdelingList: AfdelingAgg[]
}
interface RekapData {
  ok: boolean; error?: string
  scopeKebun: string; lingkupSemua: boolean
  total: number; terpotong: boolean
  totalTemuan: number; blokUnik: number; afdelingAktif: number
  kebunAktif: number; pemeriksaAktif: number
  nilaiTotal: Nilai
  kebunList: KebunAgg[]
}

interface ReportData {
  ok: boolean; error?: string
  scopeKebun: string
  total: number; totalSize: number
  blokUnik: number; pemeriksaAktif: number; kebunAktif: number
  perHari: { tanggal: string; jumlah: number }[]
  perStatus: { status: string; jumlah: number }[]
  topBlok: { blok: string; jumlah: number }[]
  perPemeriksa: { pemeriksa: string; jumlah: number }[]
}

interface FacetsData { ok: boolean; kebun: string[] }

/* ============================== KONSTANTA & FORMAT ============================== */

const HIJAU = '#34d399'
const TIP = { contentStyle: { background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(22,101,52,0.20)', borderRadius: 12, color: '#14532d', fontSize: 12, boxShadow: '0 12px 32px rgba(20,60,35,0.15)' }, labelStyle: { color: '#166534', fontWeight: 600 }, itemStyle: { color: '#14532d' } }
const AMBER = '#f59e0b'
const MERAH = '#dc2626'

/** 5 item pemeriksaan (sama seperti aplikasi HP) + warna chip masing-masing */
const ITEM_INFO: { key: keyof Nilai; label: string; satuan: string; kelas: string }[] = [
  { key: 'semak', label: 'Semak', satuan: 'Ha', kelas: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25' },
  { key: 'tunasan', label: 'Tunasan', satuan: 'Pkk', kelas: 'bg-amber-600/10 text-amber-800 border-amber-600/25' },
  { key: 'titi', label: 'Titi Panen', satuan: 'Unit', kelas: 'bg-rose-600/10 text-rose-800 border-rose-600/25' },
  { key: 'kerdil', label: 'Pokok Kerdil', satuan: 'Pkk', kelas: 'bg-purple-600/10 text-purple-800 border-purple-600/25' },
  { key: 'banjir', label: 'Banjir', satuan: 'Ha', kelas: 'bg-sky-600/10 text-sky-800 border-sky-600/25' },
]

const fmtN = (n: number) => Number(n || 0).toLocaleString('id-ID')
const fmtV = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const fmtTgl = (iso: string) => {
  const p = String(iso || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || '')
}
// pendek untuk sumbu grafik: 25/10
const fmtTglPendek = (iso: string) => {
  const p = String(iso || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : String(iso || '')
}
const fmtBytes = (n: number): string => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

/** Chip temuan: "Tunasan 5 Pkk", "Titi Panen 2 Unit", dst. — urut nilai terbesar */
function chipsTemuan(nilai: Nilai): { key: string; teks: string; kelas: string }[] {
  return ITEM_INFO
    .map((i) => ({ i, v: Number(nilai?.[i.key] || 0) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .map(({ i, v }) => ({ key: i.key, teks: `${i.label} ${fmtV(v)} ${i.satuan}`, kelas: i.kelas }))
}

function kelasStatus(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('prioritas') || st.includes('kritis') || st.includes('buruk') || st.includes('merah')) return 'border-red-600/25 bg-red-600/10 text-red-700'
  if (st.includes('perbaikan') || st.includes('perhatian') || st.includes('waspada') || st.includes('sedang') || st.includes('kuning')) return 'border-amber-500/25 bg-amber-500/10 text-amber-700'
  if (st.includes('baik') || st.includes('bagus') || st.includes('hijau')) return 'border-emerald-600/25 bg-emerald-600/10 text-emerald-700'
  return 'border-slate-400/25 bg-slate-500/10 text-slate-600'
}

/** Aksen kiri kartu blok sesuai berat temuan (mudah dipindai mata) */
function aksenBlok(temuan: number): string {
  if (temuan >= 10) return 'border-l-4 border-l-red-500'
  if (temuan >= 5) return 'border-l-4 border-l-amber-500'
  if (temuan >= 1) return 'border-l-4 border-l-emerald-500'
  return 'border-l-4 border-l-slate-300'
}

function warnaStatus(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('prioritas') || st.includes('kritis') || st.includes('buruk') || st.includes('merah')) return MERAH
  if (st.includes('perbaikan') || st.includes('perhatian') || st.includes('waspada') || st.includes('sedang') || st.includes('kuning')) return AMBER
  return HIJAU
}

/* ============================== HALAMAN ============================== */

export default function HalamanLaporan() {
  const router = useRouter()
  const [rentang, setRentang] = useState<'7' | '30' | 'all'>('30')
  const [kebunPilih, setKebunPilih] = useState('')
  const [report, setReport] = useState<ReportData | null>(null)
  const [rekap, setRekap] = useState<RekapData | null>(null)
  const [error, setError] = useState('')
  const [errorK, setErrorK] = useState('')
  const [me, setMe] = useState<{ role: string; kebun?: string } | null>(null)
  const [facets, setFacets] = useState<FacetsData | null>(null)
  const [cari, setCari] = useState('')
  const [urut, setUrut] = useState<'temuan' | 'nama'>('temuan')
  const [buka, setBuka] = useState<Set<string>>(new Set())

  const admin = me?.role === 'ADMIN' || me?.role === 'SUPERADMIN'

  useEffect(() => {
    jsonFetch<{ ok: boolean; user?: { role: string; kebun?: string } }>('/api/auth/me')
      .then((d) => { if (d.user) setMe(d.user) })
      .catch(() => {})
    jsonFetch<FacetsData>('/api/data/facets')
      .then(setFacets)
      .catch(() => {})
  }, [])

  // ---- REKAP TEMUAN (kumulatif semua waktu; hanya filter kebun) ----
  const muatRekap = useCallback(() => {
    setErrorK('')
    setRekap(null)
    const p = new URLSearchParams()
    if (admin && kebunPilih) p.set('kebun', kebunPilih)
    jsonFetch<RekapData>(`/api/report/rekap-blok${p.toString() ? `?${p.toString()}` : ''}`)
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Gagal memuat rekap temuan')
        setRekap(d)
        setBuka((prev) => {
          const n = new Set(prev)
          d.kebunList.forEach((k) => n.add(`kb:${k.nama}`))
          return n
        })
      })
      .catch((e) => setErrorK(String(e.message || e)))
  }, [admin, kebunPilih])

  useEffect(() => { muatRekap() }, [muatRekap])

  // ---- ANALITIK (mengikuti rentang waktu) ----
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (rentang !== 'all') {
      const to = new Date()
      const from = new Date(Date.now() - (Number(rentang) - 1) * 86400000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      p.set('from', iso(from))
      p.set('to', iso(to))
    }
    if (admin && kebunPilih) p.set('kebun', kebunPilih)
    return p.toString()
  }, [rentang, kebunPilih, admin])

  const muat = useCallback(() => {
    setError('')
    setReport(null)
    jsonFetch<ReportData>(`/api/report?${qs}`)
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Gagal memuat laporan')
        setReport(d)
      })
      .catch((e) => setError(String(e.message || e)))
  }, [qs])

  useEffect(() => { muat() }, [muat])

  // ---- pohon kebun→afdeling→blok setelah disaring & diurutkan ----
  const pohon = useMemo(() => {
    if (!rekap) return []
    const cmpNama = (a: { nama: string }, b: { nama: string }) => a.nama.localeCompare(b.nama, 'id')
    const cmpTemuan = (a: { nama: string; temuan: number; transaksi: number }, b: { nama: string; temuan: number; transaksi: number }) =>
      (b.temuan - a.temuan) || (b.transaksi - a.transaksi) || a.nama.localeCompare(b.nama, 'id')
    const cmp = urut === 'nama' ? cmpNama : cmpTemuan
    const q = cari.trim().toLowerCase()
    let list = rekap.kebunList
    if (q) {
      list = list
        .map((k) => ({
          ...k,
          afdelingList: k.afdelingList
            .map((a) => ({
              ...a,
              // cocok di nama kebun/afdeling → tampilkan seluruh bloknya
              blokList: a.blokList.filter((b) =>
                b.nama.toLowerCase().includes(q) || a.nama.toLowerCase().includes(q) || k.nama.toLowerCase().includes(q)),
            }))
            .filter((a) => a.blokList.length > 0 || a.nama.toLowerCase().includes(q) || k.nama.toLowerCase().includes(q)),
        }))
        .filter((k) => k.afdelingList.length > 0 || k.nama.toLowerCase().includes(q))
    }
    return list
      .map((k) => ({ ...k, afdelingList: k.afdelingList.map((a) => ({ ...a, blokList: [...a.blokList].sort(cmp) })).sort(cmp) }))
      .sort(cmp)
  }, [rekap, cari, urut])

  const toggleBuka = (k: string) =>
    setBuka((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const bukaSemua = () => {
    const n = new Set<string>()
    pohon.forEach((k) => { n.add(`kb:${k.nama}`); k.afdelingList.forEach((a) => n.add(`af:${k.nama}|${a.nama}`)) })
    setBuka(n)
  }
  const tutupSemua = () => setBuka(new Set())

  const scoped = !!rekap && !rekap.lingkupSemua
  const kosong = !!rekap && rekap.total === 0

  /* ---- kartu ringkasan (kumulatif) ---- */
  const kartu = rekap ? [
    { t: 'Total Transaksi', v: fmtN(rekap.total), i: ClipboardList, d: 'pemeriksaan seluruh waktu' },
    { t: 'Jumlah Temuan', v: fmtN(rekap.totalTemuan), i: Flag, d: 'butir temuan (nilai/foto/titik)' },
    { t: 'Blok Diperiksa', v: fmtN(rekap.blokUnik), i: MapPin, d: 'blok berbeda yang sudah diperiksa' },
    { t: 'Afdeling Aktif', v: fmtN(rekap.afdelingAktif), i: Layers3, d: 'afdeling dengan pemeriksaan' },
    { t: 'Kebun Aktif', v: fmtN(rekap.kebunAktif), i: TreePalm, d: 'kebun dengan pemeriksaan' },
    { t: 'Pemeriksa Aktif', v: fmtN(rekap.pemeriksaAktif), i: Users2, d: 'orang yang melakukan pemeriksaan' },
  ] : []

  return (
    <div className="space-y-6">
      {/* ============ KEPALA HALAMAN + KONTROL ============ */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-emerald-700" /> Rekap &amp; Analitik
          </h1>
          <p className="text-sm text-muted-foreground">
            {scoped
              ? `Lingkup akun Anda: kebun ${rekap?.scopeKebun} (sesuai penugasan di menu Pengguna).`
              : 'Rekap temuan kebun → afdeling → blok, otomatis bertambah setiap ada pemeriksaan baru.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {admin && (
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

      {errorK && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-600">
            <span className="mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Gagal memuat rekap temuan</p>
              <p className="mt-0.5 text-red-600">{errorK}</p>
              <Button size="sm" variant="outline" className="mt-2 border-red-500/40 text-red-600 hover:bg-red-500/15" onClick={muatRekap}>
                Coba Lagi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ KARTU RINGKAS (KUMULATIF) ============ */}
      {rekap ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kartu.map((c) => {
            const Icon = c.i
            return (
              <Card key={c.t} className="border-emerald-600/15 transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-2.5 text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold leading-tight">{c.v}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.t} · {c.d}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        !errorK && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        )
      )}

      {rekap && (
        <p className="text-xs text-muted-foreground">
          Satuan: Pkk = pokok · Unit = unit titi panen · Ha = hektar. Jumlah temuan = banyaknya butir temuan
          (nilai &gt; 0, foto, atau titik koordinat) — cara hitung sama dengan sheet &quot;Detail Temuan&quot; aplikasi HP.
          {rekap.terpotong && ' ⚠️ Data sangat besar — rekap menampilkan 50.000 transaksi terlama saja.'}
        </p>
      )}

      {/* ============ REKAP TEMUAN PER KEBUN → AFDELING → BLOK ============ */}
      {rekap && !kosong && (
        <Card className="border-emerald-600/15">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListTree className="h-5 w-5 text-emerald-700" /> Rekap Temuan per Kebun, Afdeling &amp; Blok
                </CardTitle>
                <CardDescription>
                  Contoh bacaan: <b>BLOK A001 (Tunasan 5 Pkk, Titi Panen 2 Unit)</b> — kumulatif seluruh waktu.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={cari}
                    onChange={(e) => setCari(e.target.value)}
                    placeholder="Cari blok / afdeling / kebun…"
                    className="h-9 w-52 rounded-lg border border-input bg-background pl-8 pr-3 text-sm"
                  />
                </div>
                <select
                  value={urut}
                  onChange={(e) => setUrut(e.target.value as 'temuan' | 'nama')}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  aria-label="Urutkan"
                >
                  <option value="temuan">Urut: Temuan Terbanyak</option>
                  <option value="nama">Urut: Nama A-Z</option>
                </select>
                <Button size="sm" variant="outline" className="border-emerald-600/25 text-emerald-900 hover:bg-emerald-600/10" onClick={bukaSemua}>
                  Buka Semua
                </Button>
                <Button size="sm" variant="outline" className="border-emerald-600/25 text-emerald-900 hover:bg-emerald-600/10" onClick={tutupSemua}>
                  Tutup Semua
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {pohon.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Tidak ada blok/afdeling yang cocok dengan pencarian &quot;{cari}&quot;.
              </p>
            )}
            {pohon.map((k) => {
              const kunciKb = `kb:${k.nama}`
              const kBuka = buka.has(kunciKb)
              return (
                <section key={k.nama} className="overflow-hidden rounded-xl border border-emerald-600/15">
                  {/* ---- Baris KEBUN ---- */}
                  <button
                    onClick={() => toggleBuka(kunciKb)}
                    className="flex w-full flex-wrap items-center gap-2 bg-gradient-to-r from-emerald-600/10 to-emerald-600/5 px-3 py-3 text-left transition-colors hover:from-emerald-600/15 sm:px-4"
                  >
                    {kBuka ? <ChevronDown className="h-5 w-5 shrink-0 text-emerald-700" /> : <ChevronRight className="h-5 w-5 shrink-0 text-emerald-700" />}
                    <TreePalm className="h-5 w-5 shrink-0 text-emerald-700" />
                    <span className="font-bold text-emerald-950">{k.nama}</span>
                    <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">{fmtN(k.transaksi)} transaksi</span>
                    <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-[11px] font-semibold text-red-700">{fmtN(k.temuan)} temuan</span>
                    <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{k.afdelingList.length} afdeling</span>
                    <span className="flex flex-wrap gap-1">
                      {chipsTemuan(k.nilai).map((c) => (
                        <span key={c.key} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.kelas}`}>{c.teks}</span>
                      ))}
                    </span>
                    <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                      <CalendarDays className="h-3 w-3" /> Terakhir {k.terakhir ? fmtTgl(k.terakhir) : '—'}
                    </span>
                  </button>

                  {kBuka && (
                    <div className="divide-y divide-emerald-600/10 border-t border-emerald-600/10">
                      {k.afdelingList.length === 0 && (
                        <p className="px-4 py-3 text-sm text-muted-foreground">Belum ada afdeling.</p>
                      )}
                      {k.afdelingList.map((a) => {
                        const kunciAf = `af:${k.nama}|${a.nama}`
                        const aBuka = buka.has(kunciAf)
                        return (
                          <div key={a.nama}>
                            {/* ---- Baris AFDELING ---- */}
                            <button
                              onClick={() => toggleBuka(kunciAf)}
                              className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-emerald-600/5 sm:px-6"
                            >
                              {aBuka ? <ChevronDown className="h-4 w-4 shrink-0 text-emerald-700" /> : <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />}
                              <Sprout className="h-4 w-4 shrink-0 text-emerald-700" />
                              <span className="font-semibold text-emerald-950">Afdeling {a.nama}</span>
                              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">{fmtN(a.transaksi)} transaksi</span>
                              <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-[11px] font-semibold text-red-700">{fmtN(a.temuan)} temuan</span>
                              <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{a.blokList.length} blok</span>
                              <span className="flex flex-wrap gap-1">
                                {chipsTemuan(a.nilai).map((c) => (
                                  <span key={c.key} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.kelas}`}>{c.teks}</span>
                                ))}
                              </span>
                              <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                                <CalendarDays className="h-3 w-3" /> Terakhir {a.terakhir ? fmtTgl(a.terakhir) : '—'}
                              </span>
                            </button>

                            {aBuka && (
                              <div className="grid gap-2 bg-emerald-600/[0.04] px-3 py-3 sm:grid-cols-2 xl:grid-cols-3 sm:px-6">
                                {a.blokList.length === 0 && (
                                  <p className="text-sm text-muted-foreground">Belum ada blok.</p>
                                )}
                                {a.blokList.map((b) => {
                                  const chips = chipsTemuan(b.nilai)
                                  return (
                                    /* ---- Kartu BLOK: BLOK A001 (Tunasan 5 Pkk, Titi Panen 2 Unit) ---- */
                                    <div key={b.nama} className={`rounded-lg border border-emerald-600/15 bg-white p-3 shadow-sm ${aksenBlok(b.temuan)}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="truncate font-bold text-emerald-950">{b.nama}</p>
                                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">×{fmtN(b.transaksi)} transaksi</span>
                                      </div>
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {chips.length
                                          ? chips.map((c) => (
                                            <span key={c.key} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.kelas}`}>{c.teks}</span>
                                          ))
                                          : <span className="text-[11px] text-muted-foreground">Tidak ada temuan bernilai</span>}
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <CalendarDays className="h-3 w-3" /> {b.terakhir ? `Terakhir ${fmtTgl(b.terakhir)}` : 'Tanggal kosong'}
                                        </span>
                                        {b.pemeriksaTerakhir && (
                                          <span className="flex items-center gap-1">
                                            <UserIcon className="h-3 w-3" /> {b.pemeriksaTerakhir}
                                          </span>
                                        )}
                                        {b.statusTerakhir && (
                                          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] leading-none ${kelasStatus(b.statusTerakhir)}`}>
                                            {b.statusTerakhir}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ============ KOSONG ============ */}
      {rekap && kosong && (
        <Card className="border-dashed border-emerald-600/20 bg-emerald-600/10">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Sprout className="h-10 w-10 text-green-300" />
            <p className="font-semibold text-emerald-950">Belum ada data pemeriksaan</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Data muncul otomatis setelah aplikasi HP menekan &quot;Kirim ke Server&quot; atau berkas transfer/Excel diunggah lewat menu Data Pemeriksaan.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ============ ANALITIK (MENGIKUTI RENTANG WAKTU) ============ */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-600">
            <span className="mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Gagal memuat analitik</p>
              <p className="mt-0.5 text-red-600">{error}</p>
              <Button size="sm" variant="outline" className="mt-2 border-red-500/40 text-red-600 hover:bg-red-500/15" onClick={muat}>
                Coba Lagi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!error && !report && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      )}

      {report && (
        <>
          <p className="text-sm font-semibold text-emerald-950">Analitik {rentang === 'all' ? 'seluruh waktu' : `${rentang} hari terakhir`}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Tren harian */}
            <Card className="border-emerald-600/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tren Pemeriksaan per Hari</CardTitle>
                <CardDescription>Jumlah transaksi pemeriksaan yang masuk setiap hari</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {report.perHari.length ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.perHari} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradHijau" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={HIJAU} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={HIJAU} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,83,45,0.10)" vertical={false} />
                        <XAxis dataKey="tanggal" tickFormatter={fmtTglPendek} tick={{ fontSize: 11 }} stroke="rgba(20,83,45,0.35)" />
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
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data pada rentang ini.</p>
                )}
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="border-emerald-600/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Komposisi Status Blok</CardTitle>
                <CardDescription>Perbandingan kondisi blok hasil pemeriksaan</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {report.perStatus.length ? (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={report.perStatus}
                          dataKey="jumlah"
                          nameKey="status"
                          innerRadius={52}
                          outerRadius={85}
                          paddingAngle={3}
                          label={({ name, value }) => `${name}: ${value}`}
                          labelLine={false}
                        >
                          {report.perStatus.map((s) => (
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

            {/* Aktivitas pemeriksa */}
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
                      {report.perPemeriksa.map((p) => (
                        <TableRow key={p.pemeriksa}>
                          <TableCell className="font-medium">{p.pemeriksa}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="bg-emerald-600/10 text-emerald-900">{p.jumlah}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!report.perPemeriksa.length && (
                        <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Blok tersibuk pada rentang */}
            <Card className="border-emerald-600/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Blok Paling Sering Diperiksa</CardTitle>
                <CardDescription>10 blok teratas pada rentang ini</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex flex-wrap gap-2">
                  {report.topBlok.map((b) => (
                    <Badge key={b.blok} variant="outline" className="border-emerald-600/20 bg-emerald-600/10 px-3 py-1.5 text-sm text-emerald-950">
                      {b.blok} <span className="ml-1.5 font-bold text-emerald-700">×{b.jumlah}</span>
                    </Badge>
                  ))}
                  {!report.topBlok.length && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tautan cepat */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-emerald-600/20 text-emerald-900 hover:bg-emerald-600/10" onClick={() => router.push('/dashboard/data')}>
              <Database className="mr-2 h-4 w-4" /> Lihat Data Lengkap
            </Button>
            <Button variant="outline" className="border-emerald-600/20 text-emerald-900 hover:bg-emerald-600/10" onClick={() => router.push('/dashboard/peta')}>
              <MapIcon className="mr-2 h-4 w-4" /> Buka Peta Blok
            </Button>
            <span className="ml-auto self-center text-xs text-muted-foreground">
              Ukuran data rentang ini: {fmtBytes(report.totalSize)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
