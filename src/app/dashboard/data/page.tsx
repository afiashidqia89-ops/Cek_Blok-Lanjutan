'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Upload, Download, Link2, Search, RefreshCw, Trash2, Eye, ChevronLeft, ChevronRight, Copy, FileSpreadsheet, MapPin, Camera,
} from 'lucide-react'
import { fmtBytes } from '../page'
import { jsonFetch } from '@/lib/api'
import { parseXlsx, pickCol, buildWorkbook, downloadWorkbook } from '@/lib/excel-client'

interface Row {
  id: string; kodeTransaksi: string; tanggal: string; pemeriksa: string;
  estate: string; kebun: string; afdeling: string; blok: string; status: string;
  perangkat: string; sizeBytes: number; createdAt: string; uploadedById: string;
  foto?: number; lokasi?: number;
  record?: Record<string, unknown>;
  uploadedBy?: { username: string } | null
}
interface ListData {
  rows: Row[]; total: number; pages: number; seeAll: boolean; canDeleteOwn: boolean; scopeKebun?: string
}
interface DetailRow extends Row { record: Record<string, unknown> }
interface ShareItem {
  id: string; token: string; name: string; tanggalFrom: string; tanggalTo: string;
  downloads: number; createdAt: string
}

const emptyFilters = { q: '', tanggalFrom: '', tanggalTo: '', kebun: '', afdeling: '', blok: '', pemeriksa: '' }

interface Facets { kebun: string[]; afdeling: string[]; blok: string[]; pemeriksa: string[] }

function statusColor(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('kritis') || st.includes('buruk')) return 'bg-red-100 text-red-800'
  if (st.includes('perhatian') || st.includes('waspada') || st.includes('sedang')) return 'bg-amber-100 text-amber-800'
  if (st) return 'bg-green-100 text-green-800'
  return 'bg-muted text-muted-foreground'
}

const LABEL_TM: Record<string, string> = { semak: 'Semak', tunasan: 'Tunasan Bermasalah', titi: 'Tidak Ada Titi Panen', kerdil: 'Pokok Kerdil', banjir: 'Areal Banjir' }
const SATUAN: Record<string, string> = { semak: 'Ha', tunasan: 'Pkk', titi: 'Unit', kerdil: 'Pkk', banjir: 'Ha' }
const METRICS = ['semak', 'tunasan', 'titi', 'kerdil', 'banjir'] as const

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** nilai temuan: utamakan details[key].value (+extras), fallback angka top-level */
function nilai(r: Record<string, unknown>, key: string): number {
  const details = ((r.details || {}) as Record<string, { value?: unknown; extras?: { value?: unknown }[] }>)
  const d = details[key]
  let total = 0
  if (d && d.value !== undefined) {
    total += num(d.value)
    for (const ex of Array.isArray(d.extras) ? d.extras : []) total += num(ex?.value)
  } else {
    total = num(r[key])
  }
  return total
}

function worstStatus(list: string[]): string {
  const P = ['PRIORITAS TINGGI', 'PERLU PERBAIKAN', 'BAIK']
  let worst = ''
  for (const s of list) {
    const u = (s || '').toUpperCase()
    const i = P.findIndex((p) => u.includes(p))
    const cur = worst ? P.findIndex((p) => worst.includes(p)) : 99
    if (i >= 0 && i < cur) worst = u
  }
  return worst
}

interface FotoItem { key: string; label: string; sample: number; url: string }

/** Galeri foto temuan satu transaksi (diambil on-demand dari /api/data/[id]/photos) */
function FotoTemuan({ id }: { id: string }) {
  const [photos, setPhotos] = useState<FotoItem[] | null>(null)
  const [zoom, setZoom] = useState<FotoItem | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/data/${id}/photos`)
      .then(r => r.json())
      .then(d => { if (alive) setPhotos(d.photos || []) })
      .catch(() => { if (alive) setPhotos([]) })
    return () => { alive = false }
  }, [id])

  if (!photos) return <Skeleton className="h-20 w-full" />
  if (!photos.length) {
    return (
      <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
        Tidak ada foto pada transaksi ini.
      </p>
    )
  }
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <figure key={`${p.key}-${p.sample}-${i}`} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.label}
              className="h-20 w-20 rounded-md border object-cover cursor-zoom-in bg-muted"
              onClick={() => setZoom(p)}
            />
            <figcaption className="text-[10px] text-muted-foreground mt-0.5 max-w-20 truncate">{p.label}</figcaption>
          </figure>
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={zoom.label} className="max-h-[80vh] max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}

interface RekapRow {
  nama: string; sub: string; jumlah: number; semak: number; tunasan: number; titi: number;
  kerdil: number; banjir: number; lokasi: number; foto: number; status: string
}

export default function DataPage() {
  const [me, setMe] = useState<{ uid: string; role: string; kebun?: string } | null>(null)
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detail, setDetail] = useState<DetailRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [withPhoto, setWithPhoto] = useState(true)
  const [shareName, setShareName] = useState('Data Pemeriksaan Blok')
  const [shareUrl, setShareUrl] = useState('')
  const [shares, setShares] = useState<ShareItem[]>([])
  const [facets, setFacets] = useState<Facets>({ kebun: [], afdeling: [], blok: [], pemeriksa: [] })
  const [rekap, setRekap] = useState<RekapRow[] | null>(null)
  const [rekapBy, setRekapBy] = useState<'afdeling' | 'blok'>('afdeling')
  const [exporting, setExporting] = useState(false)
  const [rekapRecords, setRekapRecords] = useState<Record<string, unknown>[]>([])

  const kbScope = me && me.role === 'USER' ? (me.kebun || '').trim() : ''

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), take: '25', ringkas: '1' })
    Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (kbScope) p.set('kebun', kbScope) // lingkup kebun user (server juga mengunci)
    jsonFetch<ListData & { ok: boolean; error?: string }>(`/api/data?${p}`)
      .then((d) => { if (!d.ok) throw new Error(d.error); setData(d) })
      .catch((e) => toast.error(String((e as Error).message || e)))
      .finally(() => setLoading(false))
  }, [applied, page, kbScope])

  // Data untuk REKAP: semua transaksi cocok (payload ringan, foto jadi penanda ADA)
  const loadRekap = useCallback(() => {
    setRekap(null)
    const p = new URLSearchParams({ max: '1000' })
    const ff = kbScope ? { ...applied, kebun: applied.kebun || '' } : applied
    Object.entries(ff).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (kbScope) p.set('kebun', kbScope)
    fetch(`/api/map-records?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'gagal memuat rekap')
        const rows = (d.records || []) as Record<string, unknown>[]
        setRekapRecords(rows)
        setRekap(buatRekap(rows))
      })
      .catch((e) => toast.error(String((e as Error).message || e)))
  }, [applied, kbScope])

  useEffect(() => { jsonFetch<{ user?: { uid: string; role: string; kebun?: string } }>('/api/auth/me').then((d) => setMe(d.user || null)).catch(() => {}) }, [])
  useEffect(() => {
    // dukung tautan dari halaman Peta: /dashboard/data?blok=...&kebun=...&afdeling=...
    const sp = new URLSearchParams(window.location.search)
    const pre = { ...emptyFilters }
    let ada = false
    ;(['kebun', 'afdeling', 'blok', 'pemeriksa', 'tanggalFrom', 'tanggalTo'] as const).forEach((k) => {
      const v = sp.get(k)
      if (v) { (pre as Record<string, string>)[k] = v; ada = true }
    })
    if (ada) { setFilters(pre); setApplied(pre) }
    jsonFetch<Facets & { ok: boolean; scopeKebun?: string }>('/api/data/facets').then((d) => {
      if (d.ok) setFacets({ kebun: d.kebun || [], afdeling: d.afdeling || [], blok: d.blok || [], pemeriksa: d.pemeriksa || [] })
    }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { loadRekap() }, [loadRekap])

  async function loadShares() {
    try {
      const d = await (await fetch('/api/share')).json()
      if (d.ok) setShares(d.shares || [])
    } catch { /* abaikan */ }
  }

  function applyFilters() {
    setPage(1)
    setApplied({ ...filters })
  }

  /** ---- UNGGAH EXCEL: baca .xlsx di browser → kirim records JSON ke server ---- */
  async function doUpload() {
    if (!file) { toast.error('Pilih berkas Excel (.xlsx) dulu'); return }
    if (!/\.xlsx$/i.test(file.name)) { toast.error('Format harus .xlsx — format Excel saja'); return }
    setUploading(true)
    try {
      const parsed = await parseXlsx(file)
      const records = parsed.rows.map((r, i) => rowToRecord(r, i)).filter(Boolean) as Record<string, unknown>[]
      if (!records.length) throw new Error('Tidak ada baris valid — pastikan ada kolom Tanggal & Blok')
      const res = await fetch('/api/data/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, perangkat: 'WEB-EXCEL' }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Upload gagal'); return }
      toast.success(`Diterima ${d.diterima} transaksi: ${d.baru} baru, ${d.duplikat} duplikat dilewati. Data ke HP dikirim otomatis dalam bentuk JSON (sinkronisasi).`)
      setUploadOpen(false); setFile(null); load(); loadRekap()
    } catch (e) {
      toast.error(String((e as Error).message || e))
    } finally { setUploading(false) }
  }

  /** ---- Unduh TEMPLATE excel unggahan ---- */
  async function unduhTemplate() {
    try {
      const headers = TEMPLATE_HEADERS
      const wb = await buildWorkbook([{
        name: 'Data Pemeriksaan',
        columns: headers.map((h) => ({ header: h, key: h, width: h === 'Catatan' ? 40 : 14 })),
        rows: [contohTemplate()],
        colorStatusKey: 'Status',
      }])
      await downloadWorkbook(wb, 'template_unggah_pemeriksaan.xlsx')
      toast.success('Template Excel diunduh — isi lalu unggah kembali')
    } catch (e) { toast.error(String((e as Error).message || e)) }
  }

  /** ---- EKSPOR XLSX sama seperti aplikasi (Rekap + Detail Temuan + Foto) ---- */
  async function eksporXlsx(denganFoto: boolean) {
    setExporting(true)
    toast.info(denganFoto ? 'Menyiapkan Excel + foto…' : 'Menyiapkan Excel rekap…')
    try {
      const p = new URLSearchParams()
      Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
      p.set('foto', denganFoto ? '1' : '0')
      const res = await fetch(`/api/data/export?${p}`)
      const d = await res.json()
      if (!d.ok) throw new Error(d.error || 'gagal mengambil data')
      const rows = (d.records || []) as Record<string, unknown>[]
      if (!rows.length) throw new Error('Tidak ada data pada filter ini')

      // luas & pokok dari Data Master (fallback bila record tidak membawanya)
      const master = await muatMasterLuasPokok()

      const wb = await buildWorkbook(eksporSheets(rows, master), 'Server Cek Blok')
      const stamp = new Date().toISOString().slice(0, 10)
      await downloadWorkbook(wb, `pemeriksaan_kondisi_blok_${stamp}.xlsx`)
      toast.success(`${rows.length} transaksi diekspor (sheet Rekap + Detail Temuan${denganFoto ? ' + foto tertanam' : ''})`)
    } catch (e) { toast.error(String((e as Error).message || e)) }
    finally { setExporting(false) }
  }

  async function doShare() {
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: shareName, ...applied, withPhoto }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal membuat tautan'); return }
      const url = `${window.location.origin}/share/${d.share.token}`
      setShareUrl(url)
      loadShares()
      toast.success('Tautan berbagi dibuat')
    } catch { toast.error('Tidak bisa terhubung ke server') }
  }

  async function openDetail(id: string) {
    setDetailLoading(true)
    try {
      const d = await (await fetch(`/api/data/${id}`)).json()
      if (!d.ok) throw new Error(d.error)
      setDetail(d.row)
    } catch (e) { toast.error(String((e as Error).message || e)) }
    finally { setDetailLoading(false) }
  }

  async function doDelete(row: Row) {
    if (!confirm(`Hapus transaksi ${row.kodeTransaksi || row.blok || ''} (${row.tanggal})? Tindakan ini tidak bisa dibatalkan.`)) return
    const res = await fetch(`/api/data/${row.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menghapus'); return }
    toast.success('Data dihapus')
    load(); loadRekap()
  }

  const canDelete = (row: Row) => {
    if (me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') return true
    if (!data?.canDeleteOwn) return false
    return row.uploadedById === me?.uid
  }

  function exportUrl() {
    const p = new URLSearchParams()
    Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('foto', withPhoto ? '1' : '0')
    return `/api/data/export?${p}`
  }

  const ringkas = useMemo(() => {
    const r = rekapRecords || []
    return {
      pemeriksaan: r.length,
      blok: new Set(r.map((x) => String(x.blok || '').toUpperCase()).filter(Boolean)).size,
      lokasi: r.reduce((s, x) => s + (Number((x as { lokasi?: number }).lokasi) || hitungLokasi(x)), 0),
      foto: r.reduce((s, x) => s + hitungFoto(x), 0),
    }
  }, [rekapRecords])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Pemeriksaan</h1>
          <p className="text-sm text-muted-foreground">
            {kbScope
              ? `Lingkup kebun ${kbScope} — hanya transaksi kebun Anda yang tampil di sini.`
              : data?.seeAll
                ? 'Semua transaksi dari seluruh perangkat.'
                : 'Transaksi yang Anda unggah.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setUploadOpen(true)} className="bg-green-700 hover:bg-green-800">
            <Upload className="h-4 w-4 mr-1.5" /> Unggah Berkas (Excel)
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" /> Unduh Excel / JSON
          </Button>
          <Button variant="outline" onClick={() => { setShareOpen(true); setShareUrl(''); loadShares() }}>
            <Link2 className="h-4 w-4 mr-1.5" /> Tautan Berbagi
          </Button>
        </div>
      </div>

      <Card className="border-green-100">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="q">Cari</Label>
              <Input id="q" placeholder="kode, pemeriksa, blok…" value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fk">Kebun</Label>
              {kbScope ? (
                <div className="flex h-9 items-center rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-800" id="fk">
                  <span className="truncate">{kbScope} (terkunci)</span>
                </div>
              ) : (
                <Select value={filters.kebun || 'ALL'} onValueChange={(v) => setFilters({ ...filters, kebun: v === 'ALL' ? '' : v })}>
                  <SelectTrigger id="fk"><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="ALL">Semua</SelectItem>
                    {facets.kebun.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fa">Afdeling</Label>
              <Select value={filters.afdeling || 'ALL'} onValueChange={(v) => setFilters({ ...filters, afdeling: v === 'ALL' ? '' : v })}>
                <SelectTrigger id="fa"><SelectValue placeholder="Semua" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="ALL">Semua</SelectItem>
                  {facets.afdeling.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df">Dari tanggal</Label>
              <Input id="df" type="date" value={filters.tanggalFrom} onChange={(e) => setFilters({ ...filters, tanggalFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt">Sampai tanggal</Label>
              <Input id="dt" type="date" value={filters.tanggalTo} onChange={(e) => setFilters({ ...filters, tanggalTo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb">Blok</Label>
              <Input id="fb" placeholder="mis. H031" value={filters.blok} onChange={(e) => setFilters({ ...filters, blok: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp">Pemeriksa</Label>
              <Input id="fp" value={filters.pemeriksa} onChange={(e) => setFilters({ ...filters, pemeriksa: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={applyFilters} size="sm" className="bg-green-700 hover:bg-green-800">
              <Search className="h-4 w-4 mr-1.5" /> Tampilkan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1) }}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Reset
            </Button>
            <div className="ml-auto text-sm text-muted-foreground self-center">
              {data ? `${data.total.toLocaleString('id-ID')} transaksi` : '…'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="rekap">
        <TabsList>
          <TabsTrigger value="rekap">Rekap</TabsTrigger>
          <TabsTrigger value="temuan">Hasil Temuan</TabsTrigger>
        </TabsList>

        {/* ============ SUB-MENU REKAP ============ */}
        <TabsContent value="rekap" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { l: 'Pemeriksaan', v: ringkas.pemeriksaan.toLocaleString('id-ID') },
              { l: 'Blok Diperiksa', v: ringkas.blok.toLocaleString('id-ID') },
              { l: 'Titik Lokasi', v: ringkas.lokasi.toLocaleString('id-ID') },
              { l: 'Foto Temuan', v: ringkas.foto.toLocaleString('id-ID') },
              { l: 'Afdeling', v: new Set(rekapRecords.map((x) => String(x.afdeling || '').toUpperCase()).filter(Boolean)).size.toLocaleString('id-ID') },
              { l: 'Kebun', v: new Set(rekapRecords.map((x) => String(x.kebun || '').toUpperCase()).filter(Boolean)).size.toLocaleString('id-ID') },
            ].map((k) => (
              <Card key={k.l} className="border-green-100">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{k.l}</p>
                  <p className="text-lg font-bold text-green-800">{k.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={rekapBy} onValueChange={(v) => setRekapBy(v as 'afdeling' | 'blok')}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="afdeling">Rekap per Estate / Kebun / Afdeling</SelectItem>
                <SelectItem value="blok">Rekap per Blok</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => eksporXlsx(false)}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Unduh Rekap (XLSX)
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">Angka & kolom sama dengan rekap di aplikasi HP.</div>
          </div>

          <Card className="border-green-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {rekapBy === 'blok' && <TableHead>Estate / Kebun / Afd</TableHead>}
                      <TableHead>{rekapBy === 'blok' ? 'Blok' : 'Estate / Kebun / Afdeling'}</TableHead>
                      <TableHead className="text-right">Pemeriksaan</TableHead>
                      <TableHead className="text-right">Semak (Ha)</TableHead>
                      <TableHead className="text-right">Tunasan (Pkk)</TableHead>
                      <TableHead className="text-right">Titi (Unit)</TableHead>
                      <TableHead className="text-right">Kerdil (Pkk)</TableHead>
                      <TableHead className="text-right">Banjir (Ha)</TableHead>
                      <TableHead className="text-right"><MapPin className="inline h-3.5 w-3.5" /> Lokasi</TableHead>
                      <TableHead className="text-right"><Camera className="inline h-3.5 w-3.5" /> Foto</TableHead>
                      <TableHead>Status tertinggi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!rekap && Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: rekapBy === 'blok' ? 11 : 10 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                    ))}
                    {rekap && rekap.length === 0 && (
                      <TableRow><TableCell colSpan={rekapBy === 'blok' ? 11 : 10} className="text-center text-muted-foreground py-10">Belum ada data rekap pada filter ini.</TableCell></TableRow>
                    )}
                    {rekap && rekapBy === 'afdeling' && rekap.map((r) => (
                      <TableRow key={r.nama}>
                        <TableCell className="font-medium">{r.nama}</TableCell>
                        <TableCell className="text-right">{r.jumlah}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.semak.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.tunasan}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.titi}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.kerdil}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.banjir.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{r.lokasi}</TableCell>
                        <TableCell className="text-right">{r.foto}</TableCell>
                        <TableCell>{r.status ? <Badge className={`border-transparent ${statusColor(r.status)}`}>{r.status}</Badge> : '-'}</TableCell>
                      </TableRow>
                    ))}
                    {rekap && rekapBy === 'blok' && rekap.map((r) => (
                      <TableRow key={r.nama}>
                        <TableCell className="text-xs text-muted-foreground">{r.sub}</TableCell>
                        <TableCell className="font-medium">{r.nama}</TableCell>
                        <TableCell className="text-right">{r.jumlah}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.semak.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.tunasan}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.titi}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.kerdil}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.banjir.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{r.lokasi}</TableCell>
                        <TableCell className="text-right">{r.foto}</TableCell>
                        <TableCell>{r.status ? <Badge className={`border-transparent ${statusColor(r.status)}`}>{r.status}</Badge> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ SUB-MENU HASIL TEMUAN ============ */}
        <TabsContent value="temuan" className="mt-4 space-y-4">
          <Card className="border-green-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Blok / Lokasi</TableHead>
                      <TableHead>Ancak</TableHead>
                      <TableHead className="text-right">Semak</TableHead>
                      <TableHead className="text-right">Tunasan</TableHead>
                      <TableHead className="text-right">Titi</TableHead>
                      <TableHead className="text-right">Kerdil</TableHead>
                      <TableHead className="text-right">Banjir</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Temuan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      [0, 1, 2, 3].map((i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 12 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                    {!loading && data?.rows.map((r) => {
                      const rec = r.record || {}
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">{r.tanggal || '-'}</TableCell>
                          <TableCell><code className="text-xs">{r.kodeTransaksi || '-'}</code></TableCell>
                          <TableCell>
                            <span className="font-medium">{r.blok || '-'}</span>
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {[r.estate, r.kebun, r.afdeling].filter(Boolean).join(' / ') || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {String(rec.ancak || '-')}{rec.ancakStatus ? <div className="text-muted-foreground">{String(rec.ancakStatus)}</div> : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'semak').toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'tunasan')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'titi')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'kerdil')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'banjir').toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={`border-transparent ${statusColor(r.status)}`}>{r.status || '-'}</Badge>
                            <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
                              {r.lokasi ?? 0} lokasi · {r.foto ?? 0} foto
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.perangkat || r.uploadedBy?.username || '-'}
                            <div>{fmtBytes(r.sizeBytes)}</div>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Detail" onClick={() => openDetail(r.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canDelete(r) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" aria-label="Hapus" onClick={() => doDelete(r)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {!loading && data && data.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-10">
                          Belum ada data yang cocok. Unggah berkas Excel dari tombol &quot;Unggah Berkas (Excel)&quot;, atau kirim langsung dari aplikasi (Kirim ke Server).
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {data && data.pages > 1 && (
                <div className="flex items-center justify-between border-t p-3">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">Halaman {page} dari {data.pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Unggah Excel */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unggah Berkas Excel (.xlsx)</DialogTitle>
            <DialogDescription>
              Format Excel saja. Gunakan <b>Unduh Template</b> untuk melihat kolom yang benar (sama dengan ekspor aplikasi).
              Data duplikat otomatis dilewati. Data yang diterima HP tetap berbentuk JSON lewat sinkronisasi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".xlsx" multiple={false} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Button variant="outline" size="sm" onClick={unduhTemplate}>
              <Download className="h-4 w-4 mr-1.5" /> Unduh Template Excel
            </Button>
            <p className="text-xs text-muted-foreground">Berkas besar membutuhkan waktu beberapa saat.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Batal</Button>
            <Button onClick={doUpload} disabled={!file || uploading} className="bg-green-700 hover:bg-green-800">
              {uploading ? 'Mengunggah…' : 'Unggah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Unduh Data */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unduh Data</DialogTitle>
            <DialogDescription>
              Excel (XLSX, sama seperti ekspor aplikasi) atau JSON transfer untuk digabung di HP lewat menu
              &quot;Terima &amp; Gabung Data&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              Filter aktif diterapkan: {Object.entries(applied).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'semua data'}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Sertakan foto temuan</Label>
                <p className="text-xs text-muted-foreground">Matikan bila data besar / koneksi lambat</p>
              </div>
              <Switch checked={withPhoto} onCheckedChange={setWithPhoto} />
            </div>
            <div className="grid gap-2">
              <Button disabled={exporting} className="bg-green-700 hover:bg-green-800" onClick={() => eksporXlsx(withPhoto)}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> {exporting ? 'Menyiapkan…' : 'Unduh Excel (Rekap + Detail Temuan)'}
              </Button>
              <Button asChild variant="outline" onClick={() => setExportOpen(false)}>
                <a href={exportUrl()} download><Download className="h-4 w-4 mr-1.5" /> Unduh JSON (untuk HP)</a>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Tautan Berbagi */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tautan Berbagi Data</DialogTitle>
            <DialogDescription>
              Kirim tautan via WhatsApp dsb. Penerima membuka tautan, mengunduh berkas, lalu menggabungkannya di aplikasi Cek Blok.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sn">Nama berkas</Label>
              <Input id="sn" value={shareName} onChange={(e) => setShareName(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Sertakan foto temuan</Label>
              <Switch checked={withPhoto} onCheckedChange={setWithPhoto} />
            </div>
            <Button onClick={doShare} className="w-full bg-green-700 hover:bg-green-800">
              <Link2 className="h-4 w-4 mr-1.5" /> Buat Tautan (filter aktif diterapkan)
            </Button>
            {shareUrl && (
              <div className="flex items-center gap-2 rounded-md border bg-green-50 p-2">
                <code className="text-xs flex-1 truncate">{shareUrl}</code>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Salin"
                  onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Tautan disalin') }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
            {shares.length > 0 && (
              <div className="max-h-48 overflow-y-auto divide-y rounded-md border">
                {shares.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.tanggalFrom || s.tanggalTo ? `${s.tanggalFrom || 'awal'} s/d ${s.tanggalTo || 'kini'}` : 'semua tanggal'} · diunduh {s.downloads}×
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Salin tautan"
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/share/${s.token}`); toast.success('Tautan disalin') }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Transaksi</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.tanggal} · ${detail.blok || '-'} · ${detail.pemeriksa || '-'}` : 'Memuat…'}
            </DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Kode Transaksi', detail.kodeTransaksi],
                  ['Status', detail.status],
                  ['Estate / PT', detail.estate],
                  ['Kebun', detail.kebun],
                  ['Afdeling', detail.afdeling],
                  ['Blok', detail.blok],
                  ['Pasar Kanan', detail.record?.noPasarKanan],
                  ['Pasar Kiri', detail.record?.noPasarKiri],
                  ['Ancak', detail.record?.ancak],
                  ['Kategori Ancak', detail.record?.ancakStatus],
                  ['Sumber perangkat', detail.perangkat],
                  ['Diunggah', new Date(detail.createdAt).toLocaleString('id-ID')],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{String(k)}</p>
                    <p className="font-medium break-words">{String((v as string | number | undefined) || '-')}</p>
                  </div>
                ))}
              </div>
              <FotoTemuan id={detail.id} />
              <div>
                <p className="text-sm font-semibold mb-2">Temuan / Rincian</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(detail.record, (k, v) => (k === 'photo' && typeof v === 'string' && v.startsWith('data:image') ? '[foto]' : v), 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ==================== Fungsi bantu rekap & ekspor ==================== */

const TEMPLATE_HEADERS = [
  'Kode Transaksi', 'Tanggal', 'Pemeriksa', 'Estate', 'Kebun', 'Afdeling', 'Blok',
  'Luas (Ha)', 'Jumlah Pokok', 'Pasar Kanan', 'Nomor Baris Kanan', 'Pasar Kiri', 'Nomor Baris Kiri',
  'Ancak', 'Kategori Ancak', 'Semak (Ha)', 'Tunasan (Pkk)', 'Titi (Unit)', 'Kerdil (Pkk)', 'Banjir (Ha)',
  'Status', 'Catatan',
]

function contohTemplate(): Record<string, unknown> {
  return {
    'Kode Transaksi': 'TRX-001', Tanggal: new Date().toISOString().slice(0, 10), Pemeriksa: 'Nama Pemeriksa',
    Estate: 'KBM', Kebun: 'KBM 1', Afdeling: 'A', Blok: 'H031', 'Luas (Ha)': 36.8, 'Jumlah Pokok': 2573,
    'Pasar Kanan': 'Ya', 'Nomor Baris Kanan': '12', 'Pasar Kiri': 'Ya', 'Nomor Baris Kiri': '15',
    Ancak: 3, 'Kategori Ancak': 'TEMbus', 'Semak (Ha)': 1.25, 'Tunasan (Pkk)': 4, 'Titi (Unit)': 0, 'Kerdil (Pkk)': 2, 'Banjir (Ha)': 0,
    Status: 'PERLU PERBAIKAN', Catatan: 'contoh catatan',
  }
}

/** baris Excel → record format transfer Cek Blok */
function rowToRecord(r: Record<string, unknown>, i: number): Record<string, unknown> | null {
  const tanggal = pickCol(r, ['Tanggal', 'tanggal', 'Date'])
  const blok = pickCol(r, ['Blok', 'Block'])
  const kebun = pickCol(r, ['Kebun'])
  const afdeling = pickCol(r, ['Afdeling', 'Afd', 'Divisi'])
  if (!blok && !tanggal) return null
  const numF = (names: string[]) => {
    const v = pickCol(r, names)
    if (v === '') return null
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return {
    kodeTransaksi: pickCol(r, ['Kode Transaksi', 'Kode', 'kodeTransaksi']),
    tanggal,
    pemeriksa: pickCol(r, ['Pemeriksa', 'Pemeriksa/Tim']),
    estate: pickCol(r, ['Estate', 'PT']),
    kebun, afdeling, blok,
    luas: numF(['Luas (Ha)', 'Luas']),
    pokok: numF(['Jumlah Pokok', 'Pokok']),
    noPasarKanan: pickCol(r, ['Nomor Baris Kanan']),
    noPasarKiri: pickCol(r, ['Nomor Baris Kiri']),
    ancak: numF(['Ancak']),
    ancakStatus: pickCol(r, ['Kategori Ancak']),
    semak: numF(['Semak (Ha)', 'Semak']) ?? 0,
    tunasan: numF(['Tunasan (Pkk)', 'Tunasan']) ?? 0,
    titi: numF(['Titi (Unit)', 'Titi']) ?? 0,
    kerdil: numF(['Kerdil (Pkk)', 'Kerdil']) ?? 0,
    banjir: numF(['Banjir (Ha)', 'Banjir']) ?? 0,
    status: pickCol(r, ['Status']),
    catatan: pickCol(r, ['Catatan', 'Catatan/Keterangan']),
    savedAt: Date.now() + i,
  }
}

function hitungLokasi(r: Record<string, unknown>): number {
  const details = (((r.record as Record<string, unknown> | undefined)?.details || r.details || {}) as Record<string, { location?: { latitude?: unknown }; extras?: { location?: { latitude?: unknown } }[]; value?: unknown }>)
  let n = 0
  for (const k of Object.keys(details)) {
    const d = details[k] || {}
    const samples = [d as { location?: { latitude?: unknown } }, ...(Array.isArray(d.extras) ? d.extras : [])]
    for (const sm of samples) if (sm?.location && Number.isFinite(Number(sm.location.latitude))) n++
  }
  return n
}

function hitungFoto(r: Record<string, unknown>): number {
  const details = (((r.record as Record<string, unknown> | undefined)?.details || r.details || {}) as Record<string, { photo?: unknown; extras?: { photo?: unknown }[] }>)
  let n = 0
  for (const k of Object.keys(details)) {
    const d = details[k] || {}
    const samples = [d as { photo?: unknown }, ...(Array.isArray(d.extras) ? d.extras : [])]
    for (const sm of samples) if (sm && sm.photo) n++
  }
  return n
}

function buatRekap(rows: Record<string, unknown>[]): RekapRow[] {
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const estate = String(r.estate || '').toUpperCase()
    const kebun = String(r.kebun || '').toUpperCase()
    const afd = String(r.afdeling || '').toUpperCase()
    const blok = String(r.blok || '').toUpperCase()
    const nama = `${estate || '-'} / ${kebun || '-'} / ${afd || '-'} / ${blok || '-'}`
    const arr = groups.get(nama) || []
    arr.push(r)
    groups.set(nama, arr)
  }
  return [...groups.entries()].map(([nama, rs]) => ({
    nama,
    sub: '',
    jumlah: rs.length,
    semak: rs.reduce((s, r) => s + nilai(r, 'semak'), 0),
    tunasan: rs.reduce((s, r) => s + nilai(r, 'tunasan'), 0),
    titi: rs.reduce((s, r) => s + nilai(r, 'titi'), 0),
    kerdil: rs.reduce((s, r) => s + nilai(r, 'kerdil'), 0),
    banjir: rs.reduce((s, r) => s + nilai(r, 'banjir'), 0),
    lokasi: rs.reduce((s, r) => s + hitungLokasi(r), 0),
    foto: rs.reduce((s, r) => s + hitungFoto(r), 0),
    status: worstStatus(rs.map((r) => String(r.status || ''))),
  })).sort((a, b) => a.nama.localeCompare(b.nama, undefined, { numeric: true }))
}

async function muatMasterLuasPokok(): Promise<Map<string, { luas: number | null; pokok: number | null }>> {
  const map = new Map<string, { luas: number | null; pokok: number | null }>()
  try {
    let p = 1
    while (p <= 10) {
      const d = await jsonFetch<{ ok: boolean; rows: { kebun: string; afdeling: string; blok: string; luas: number | null; pokok: number | null }[]; total: number }>(`/api/master?page=${p}&limit=1000`)
      if (!d.ok) break
      for (const r of d.rows) map.set(`${String(r.kebun).toUpperCase()}|${String(r.afdeling).toUpperCase()}|${String(r.blok).toUpperCase()}`, { luas: r.luas, pokok: r.pokok })
      if (d.rows.length < 1000 || map.size >= d.total) break
      p++
    }
  } catch { /* biarkan kosong — luas/pokok tampil '-' */ }
  return map
}

/** Sheet ekspor persis seperti aplikasi HP: Rekap (1 baris/pemeriksaan) + Detail Temuan (+foto) */
function eksporSheets(
  rows: Record<string, unknown>[],
  master: Map<string, { luas: number | null; pokok: number | null }>
) {
  const kode = (r: Record<string, unknown>, i: number) => String(r.kodeTransaksi || `TRX-${i + 1}`)
  const rekapRows = rows.map((r, i) => {
    const kunci = `${String(r.kebun || '').toUpperCase()}|${String(r.afdeling || '').toUpperCase()}|${String(r.blok || '').toUpperCase()}`
    const m = master.get(kunci)
    return {
      no: i + 1,
      kode: kode(r, i), tgl: r.tanggal || '', pem: r.pemeriksa || '',
      pt: r.estate || r.pt || '', kebun: r.kebun || '', afd: r.afdeling || '', blok: r.blok || '',
      luas: r.luas != null ? Number(r.luas) : m?.luas ?? null,
      pokok: r.pokok != null ? Number(r.pokok) : m?.pokok ?? null,
      pasarKanan: r.noPasarKanan ? 'Ya' : '', noKanan: r.noPasarKanan || '',
      pasarKiri: r.noPasarKiri ? 'Ya' : '', noKiri: r.noPasarKiri || '',
      ancak: r.ancak ?? '', ancakSt: r.ancakStatus || '',
      semak: nilai(r, 'semak'), tunasan: nilai(r, 'tunasan'), titi: nilai(r, 'titi'),
      kerdil: nilai(r, 'kerdil'), banjir: nilai(r, 'banjir'),
      foto: hitungFoto(r), status: r.status || '', cat: r.catatan || '',
    }
  })

  const detailRows: Record<string, unknown>[] = []
  let n = 0
  rows.forEach((r, i) => {
    const details = (r.details || {}) as Record<string, { value?: unknown; photo?: string; location?: { latitude?: number; longitude?: number; accuracy?: number; source?: string }; extras?: { value?: unknown; photo?: string; location?: { latitude?: number; longitude?: number; accuracy?: number; source?: string } }[] }>
    for (const key of METRICS) {
      const d0 = details[key] || {}
      const extras = Array.isArray(d0.extras) ? d0.extras : []
      const samples = [{ no: 1, val: d0.value !== undefined ? num(d0.value) : num(r[key]), d: d0 }, ...extras.map((x, ix) => ({ no: ix + 2, val: num(x?.value), d: x }))]
      for (const sm of samples) {
        const d = sm.d || {}
        const loc = d.location || null
        const val = sm.val
        if (!(val > 0 || d.photo || loc)) continue
        n++
        detailRows.push({
          no: n, kode: kode(r, i), tgl: r.tanggal || '', pt: r.estate || r.pt || '', kebun: r.kebun || '', afd: r.afdeling || '', blok: r.blok || '',
          pasarKanan: r.noPasarKanan ? 'Ya' : '', noKanan: r.noPasarKanan || '', pasarKiri: r.noPasarKiri ? 'Ya' : '', noKiri: r.noPasarKiri || '',
          ancak: r.ancak ?? '', katAncak: r.ancakStatus || '',
          tem: LABEL_TM[key], sam: sm.no, nilai: val, sat: SATUAN[key],
          lat: loc ? Number(Number(loc.latitude).toFixed(6)) : null,
          lng: loc ? Number(Number(loc.longitude).toFixed(6)) : null,
          akr: loc && loc.accuracy != null ? loc.accuracy : null,
          src: loc ? (loc.source || 'GPS') : '',
          peta: loc ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}` : '',
          foto: d.photo ? (d.photo === 'ADA' ? 'ADA (lihat aplikasi)' : 'Tertanam di kolom Foto') : 'Tidak ada foto',
        })
      }
    }
    const db = details.bukti || null
    if (db && (db.photo || db.location)) {
      const loc = db.location || null
      n++
      detailRows.push({
        no: n, kode: kode(r, i), tgl: r.tanggal || '', pt: r.estate || r.pt || '', kebun: r.kebun || '', afd: r.afdeling || '', blok: r.blok || '',
        pasarKanan: r.noPasarKanan ? 'Ya' : '', noKanan: r.noPasarKanan || '', pasarKiri: r.noPasarKiri ? 'Ya' : '', noKiri: r.noPasarKiri || '',
        ancak: r.ancak ?? '', katAncak: r.ancakStatus || '',
        tem: 'Foto Bukti Kondisi Ancak', sam: 1, nilai: null, sat: '',
        lat: loc ? Number(Number(loc.latitude).toFixed(6)) : null,
        lng: loc ? Number(Number(loc.longitude).toFixed(6)) : null,
        akr: loc && loc.accuracy != null ? loc.accuracy : null,
        src: loc ? (loc.source || 'GPS') : '',
        peta: loc ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}` : '',
        foto: db.photo ? 'ADA (lihat aplikasi)' : 'Tidak ada foto',
      })
    }
  })

  return [
    {
      name: 'Rekap',
      columns: [
        { header: 'No', key: 'no', width: 6 }, { header: 'Kode Transaksi', key: 'kode', width: 28 }, { header: 'Tanggal', key: 'tgl', width: 12 }, { header: 'Pemeriksa', key: 'pem', width: 20 },
        { header: 'Estate', key: 'pt', width: 8 }, { header: 'Kebun', key: 'kebun', width: 10 }, { header: 'Afdeling', key: 'afd', width: 10 }, { header: 'Blok', key: 'blok', width: 10 },
        { header: 'Luas (Ha)', key: 'luas', width: 10 }, { header: 'Jumlah Pokok', key: 'pokok', width: 13 },
        { header: 'Pasar Kanan', key: 'pasarKanan', width: 13 }, { header: 'Nomor Baris Kanan', key: 'noKanan', width: 16 },
        { header: 'Pasar Kiri', key: 'pasarKiri', width: 13 }, { header: 'Nomor Baris Kiri', key: 'noKiri', width: 16 },
        { header: 'Ancak', key: 'ancak', width: 8 }, { header: 'Kategori Ancak', key: 'ancakSt', width: 18 },
        { header: 'Semak (Ha)', key: 'semak', width: 11 }, { header: 'Tunasan (Pkk)', key: 'tunasan', width: 13 }, { header: 'Titi (Unit)', key: 'titi', width: 11 },
        { header: 'Kerdil (Pkk)', key: 'kerdil', width: 12 }, { header: 'Banjir (Ha)', key: 'banjir', width: 11 }, { header: 'Jumlah Foto', key: 'foto', width: 11 },
        { header: 'Status', key: 'status', width: 20 }, { header: 'Catatan', key: 'cat', width: 45 },
      ],
      rows: rekapRows,
      colorStatusKey: 'status',
    },
    {
      name: 'Detail Temuan',
      columns: [
        { header: 'No', key: 'no', width: 6 }, { header: 'Kode Transaksi', key: 'kode', width: 28 }, { header: 'Tanggal', key: 'tgl', width: 12 },
        { header: 'Estate', key: 'pt', width: 8 }, { header: 'Kebun', key: 'kebun', width: 10 }, { header: 'Afdeling', key: 'afd', width: 10 }, { header: 'Blok', key: 'blok', width: 10 },
        { header: 'Pasar Kanan', key: 'pasarKanan', width: 13 }, { header: 'Nomor Baris Kanan', key: 'noKanan', width: 16 },
        { header: 'Pasar Kiri', key: 'pasarKiri', width: 13 }, { header: 'Nomor Baris Kiri', key: 'noKiri', width: 16 },
        { header: 'Ancak', key: 'ancak', width: 8 }, { header: 'Kategori Ancak', key: 'katAncak', width: 18 },
        { header: 'Temuan', key: 'tem', width: 24 }, { header: 'Sampel', key: 'sam', width: 9 }, { header: 'Nilai', key: 'nilai', width: 9 }, { header: 'Satuan', key: 'sat', width: 9 },
        { header: 'Latitude', key: 'lat', width: 13 }, { header: 'Longitude', key: 'lng', width: 13 }, { header: 'Akurasi (m)', key: 'akr', width: 11 }, { header: 'Sumber Lokasi', key: 'src', width: 18 },
        { header: 'Peta', key: 'peta', width: 14 }, { header: 'Foto', key: 'foto', width: 34 },
      ],
      rows: detailRows,
    },
  ]
}

