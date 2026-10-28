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
  Download, Link2, Search, RefreshCw, Trash2, Eye, ChevronLeft, ChevronRight, Copy, FileSpreadsheet, MapPin, Camera,
} from 'lucide-react'
import { jsonFetch } from '@/lib/api'
import { buildWorkbook, downloadWorkbook, type ExcelSheetImage, type ExcelWorksheet } from '@/lib/excel-client'

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
  const v = (s || '').toLowerCase()
  if (v.includes('kritis') || v.includes('buruk')) return 'bg-red-100 text-red-800'
  if (v.includes('perhatian') || v.includes('waspada') || v.includes('sedang')) return 'bg-amber-100 text-amber-800'
  if (v) return 'bg-green-100 text-green-800'
  return 'bg-muted text-muted-foreground'
}

const LABEL_TM: Record<string, string> = { semak: 'Semak', tunasan: 'Tunasan Bermasalah', titi: 'Tidak Ada Titi Panen', kerdil: 'Pokok Kerdil', banjir: 'Areal Banjir' }
const SATUAN: Record<string, string> = { semak: 'Ha', tunasan: 'Pkk', titi: 'Unit', kerdil: 'Pkk', banjir: 'Ha' }
const METRICS = ['semak', 'tunasan', 'titi', 'kerdil', 'banjir'] as const

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Tampilan sel gaya Excel: kosong/null = "*" (sama seperti ekspor aplikasi HP) */
function st(v: unknown): string {
  const s = String(v ?? '').trim()
  return s === '' ? '*' : s
}
/** Angka gaya Excel: kosong = "*" (persis seperti kolom kosong di ekspor HP) */
function angka(v: unknown, dec = 2): string {
  const n = Number(v)
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n.toFixed(dec) : '*'
}

interface TmLoc { latitude?: unknown; longitude?: unknown; accuracy?: unknown; source?: unknown }

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

/** Satu baris rincian temuan (sama seperti sheet "Detail Temuan" pada ekspor aplikasi HP) */
function barisTemuan(rec: Record<string, unknown>): Array<{
  tem: string; sam: number; nilai: number | null; sat: string
  lat: number | null; lng: number | null; akr: number | null; src: string; foto: boolean
}> {
  const out: ReturnType<typeof barisTemuan> = []
  const details = (rec.details || {}) as Record<string, {
    value?: unknown; photo?: unknown; location?: TmLoc
    extras?: { value?: unknown; photo?: unknown; location?: TmLoc }[]
  }>
  const push = (tem: string, sam: number, d: { value?: unknown; photo?: unknown; location?: TmLoc }, fallback: unknown, sat: string) => {
    const loc = d?.location || null
    const okLoc = loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))
    const val = d && d.value !== undefined ? num(d.value) : num(fallback)
    if (!(val > 0 || (d && d.photo) || okLoc)) return
    out.push({
      tem, sam, nilai: val > 0 ? val : null, sat,
      lat: okLoc ? Number(loc!.latitude) : null,
      lng: okLoc ? Number(loc!.longitude) : null,
      akr: okLoc && loc!.accuracy != null && Number.isFinite(Number(loc!.accuracy)) ? Number(loc!.accuracy) : null,
      src: okLoc ? String(loc!.source || 'GPS') : '',
      foto: !!(d && d.photo),
    })
  }
  for (const key of METRICS) {
    const d0 = details[key] || {}
    push(LABEL_TM[key] || key, 1, d0, rec[key], SATUAN[key] || '')
    ;(Array.isArray(d0.extras) ? d0.extras : []).forEach((x, ix) => push(`${LABEL_TM[key] || key}`, ix + 2, x || {}, rec[key], SATUAN[key] || ''))
  }
  const db = details.bukti
  if (db && (db.photo || db.location)) {
    const loc = db.location || null
    const okLoc = loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))
    out.push({
      tem: 'Foto Bukti Kondisi Ancak', sam: 1, nilai: null, sat: '',
      lat: okLoc ? Number(loc!.latitude) : null,
      lng: okLoc ? Number(loc!.longitude) : null,
      akr: okLoc && loc!.accuracy != null && Number.isFinite(Number(loc!.accuracy)) ? Number(loc!.accuracy) : null,
      src: okLoc ? String(loc!.source || 'GPS') : '',
      foto: !!db.photo,
    })
  }
  return out
}

/** Tabel rincian temuan satu transaksi — tampilan sama seperti ekspor "Detail Temuan" di HP */
function TabelTemuan({ rec }: { rec: Record<string, unknown> }) {
  const rows = barisTemuan(rec)
  if (!rows.length) {
    return (
      <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
        Tidak ada rincian temuan pada transaksi ini.
      </p>
    )
  }
  return (
    <div>
      <p className="text-sm font-semibold mb-2">Temuan / Rincian</p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Temuan</TableHead>
              <TableHead className="text-right">Sampel</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead>Koordinat</TableHead>
              <TableHead>Foto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs font-medium">{b.tem}</TableCell>
                <TableCell className="text-right text-xs">{b.sam}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{b.nilai != null ? `${b.nilai} ${b.sat}` : '-'}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {b.lat != null && b.lng != null ? (
                    <a className="text-green-700 underline decoration-dotted" target="_blank" rel="noopener"
                      href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}>
                      {b.lat.toFixed(6)}, {b.lng.toFixed(6)}{b.akr != null ? ` (±${b.akr} m)` : ''}
                    </a>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-xs">{b.foto ? 'ADA' : '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export default function DataPage() {
  const [me, setMe] = useState<{ uid: string; role: string; kebun?: string } | null>(null)
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)

  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detail, setDetail] = useState<DetailRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [galleryId, setGalleryId] = useState<string | null>(null)
  const [withPhoto, setWithPhoto] = useState(true)
  const [shareName, setShareName] = useState('Data Pemeriksaan Blok')
  const [shareUrl, setShareUrl] = useState('')
  const [shares, setShares] = useState<ShareItem[]>([])
  const [facets, setFacets] = useState<Facets>({ kebun: [], afdeling: [], blok: [], pemeriksa: [] })
  const [exporting, setExporting] = useState(false)
  const [rekapRecords, setRekapRecords] = useState<Record<string, unknown>[]>([])
  const [masterMap, setMasterMap] = useState<Map<string, { luas: number | null; pokok: number | null }>>(new Map())

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

  // Ringkasan kartu: semua transaksi cocok (payload ringan, foto jadi penanda ADA)
  const loadRekap = useCallback(() => {
    const p = new URLSearchParams({ max: '1000' })
    const ff = kbScope ? { ...applied, kebun: applied.kebun || '' } : applied
    Object.entries(ff).forEach(([k, v]) => { if (v) p.set(k, v) })
    if (kbScope) p.set('kebun', kbScope)
    fetch(`/api/map-records?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'gagal memuat ringkasan')
        setRekapRecords((d.records || []) as Record<string, unknown>[])
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
  // Peta luas & jumlah pokok dari Data Master — dipakai kolom Luas (Ha) & Jumlah Pokok
  useEffect(() => { muatMasterLuasPokok().then(setMasterMap).catch(() => {}) }, [])

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

  /** ---- EKSPOR XLSX sama seperti aplikasi (Rekap + Detail Temuan + foto) ----
   * Endpoint /api/data/export mengembalikan BERKAS TRANSFER format aplikasi
   * ({app:'cekblok-transfer', records:[...]}) — bukan {ok:true}. */
  async function eksporXlsx(denganFoto: boolean) {
    setExporting(true)
    toast.info(denganFoto ? 'Menyiapkan Excel + foto tertanam…' : 'Menyiapkan Excel…')
    try {
      const p = new URLSearchParams()
      Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
      p.set('foto', denganFoto ? '1' : '0')
      // jsonFetch: pesan error selalu jelas (tidak pernah "JSON.parse: unexpected character")
      const d = await jsonFetch<{ records?: Record<string, unknown>[]; jumlah?: number; error?: string }>(`/api/data/export?${p}`)
      const rows = d.records || []
      if (!rows.length) throw new Error('Tidak ada data pada filter ini')

      // luas & pokok dari Data Master (fallback bila record tidak membawanya)
      const master = await muatMasterLuasPokok()

      toast.info(denganFoto ? 'Menanam foto ke sheet Detail Temuan…' : 'Menyusun sheet…')
      const sheets = await eksporSheets(rows, master, denganFoto)
      const wb = await buildWorkbook(sheets, 'Server Cek Blok')
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

  /** Baris tabel "Hasil Temuan" — format sama dengan sheet "Detail Temuan" pada
   * ekspor Excel: satu baris per temuan / sampel / foto bukti, lengkap dengan
   * koordinat, akurasi, sumber lokasi, tautan peta dan penanda foto. */
  const temuanTampil = useMemo(() => {
    const out: Array<{
      key: string; id: string; no: number; kode: string; tgl: string
      pt: string; kb: string; afd: string; blok: string
      pasarKanan: string; noKanan: string; pasarKiri: string; noKiri: string
      ancak: string; kat: string
      tem: string; sam: number; nilai: number | null; sat: string
      lat: number | null; lng: number | null; akr: number | null; src: string; fotoAda: boolean
    }> = []
    let n = 0
    for (const r of data?.rows || []) {
      const rec = r.record || {}
      for (const b of barisTemuan(rec)) {
        n++
        out.push({
          key: `${r.id}-t${n}`, id: r.id, no: n,
          kode: st(r.kodeTransaksi), tgl: st(r.tanggal),
          pt: st(r.estate), kb: st(r.kebun), afd: st(r.afdeling), blok: st(r.blok),
          pasarKanan: rec.noPasarKanan ? 'Ya' : '*', noKanan: st(rec.noPasarKanan),
          pasarKiri: rec.noPasarKiri ? 'Ya' : '*', noKiri: st(rec.noPasarKiri),
          ancak: st(rec.ancak), kat: st(rec.ancakStatus),
          tem: b.tem, sam: b.sam, nilai: b.nilai, sat: b.sat,
          lat: b.lat, lng: b.lng, akr: b.akr, src: b.src, fotoAda: b.foto,
        })
      }
    }
    return out
  }, [data])

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
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => eksporXlsx(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Unduh Rekap (XLSX + Foto)
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">Kolom sama persis dengan sheet &quot;Rekap&quot; pada ekspor Excel.</div>
          </div>

          <Card className="border-green-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">No</TableHead>
                      <TableHead>Kode Transaksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pemeriksa</TableHead>
                      <TableHead>Estate</TableHead>
                      <TableHead>Kebun</TableHead>
                      <TableHead>Afdeling</TableHead>
                      <TableHead>Blok</TableHead>
                      <TableHead className="text-right">Luas (Ha)</TableHead>
                      <TableHead className="text-right">Jumlah Pokok</TableHead>
                      <TableHead>Pasar Kanan</TableHead>
                      <TableHead className="text-right">Nomor Baris Kanan</TableHead>
                      <TableHead>Pasar Kiri</TableHead>
                      <TableHead className="text-right">Nomor Baris Kiri</TableHead>
                      <TableHead className="text-right">Ancak</TableHead>
                      <TableHead>Kategori Ancak</TableHead>
                      <TableHead className="text-right">Semak (Ha)</TableHead>
                      <TableHead className="text-right">Tunasan (Pkk)</TableHead>
                      <TableHead className="text-right">Titi (Unit)</TableHead>
                      <TableHead className="text-right">Kerdil (Pkk)</TableHead>
                      <TableHead className="text-right">Banjir (Ha)</TableHead>
                      <TableHead className="text-right"><Camera className="inline h-3.5 w-3.5" /> Jumlah Foto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 26 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                    ))}
                    {!loading && data && data.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={26} className="text-center text-muted-foreground py-10">
                          Belum ada data pada filter ini. Kirim data dari aplikasi HP lewat menu <b>Sinkronisasi Server → Kirim Data ke Server</b>.
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && data?.rows.map((r, i) => {
                      const rec = r.record || {}
                      const m = masterMap.get(`${String(r.kebun || '').toUpperCase()}|${String(r.afdeling || '').toUpperCase()}|${String(r.blok || '').toUpperCase()}`)
                      const luas = rec.luas != null ? Number(rec.luas) : m?.luas ?? null
                      const pokok = rec.pokok != null ? Math.round(Number(rec.pokok)) : m?.pokok != null ? Math.round(m.pokok) : null
                      const nFoto = r.foto ?? 0
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-right text-xs text-muted-foreground">{(page - 1) * 25 + i + 1}</TableCell>
                          <TableCell><code className="text-[11px] whitespace-nowrap">{st(r.kodeTransaksi)}</code></TableCell>
                          <TableCell className="whitespace-nowrap">{st(r.tanggal)}</TableCell>
                          <TableCell>{st(r.pemeriksa)}</TableCell>
                          <TableCell>{st(r.estate)}</TableCell>
                          <TableCell>{st(r.kebun)}</TableCell>
                          <TableCell>{st(r.afdeling)}</TableCell>
                          <TableCell className="font-medium">{st(r.blok)}</TableCell>
                          <TableCell className="text-right tabular-nums">{luas != null ? luas.toFixed(2) : '*'}</TableCell>
                          <TableCell className="text-right tabular-nums">{pokok != null ? pokok.toLocaleString('id-ID') : '*'}</TableCell>
                          <TableCell>{rec.noPasarKanan ? 'Ya' : '*'}</TableCell>
                          <TableCell className="text-right">{st(rec.noPasarKanan)}</TableCell>
                          <TableCell>{rec.noPasarKiri ? 'Ya' : '*'}</TableCell>
                          <TableCell className="text-right">{st(rec.noPasarKiri)}</TableCell>
                          <TableCell className="text-right">{st(rec.ancak)}</TableCell>
                          <TableCell>{st(rec.ancakStatus)}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'semak').toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'tunasan')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'titi')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'kerdil')}</TableCell>
                          <TableCell className="text-right tabular-nums">{nilai(rec, 'banjir').toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            {nFoto > 0 ? (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setGalleryId(r.id)}>
                                <Camera className="h-3.5 w-3.5 mr-1 text-green-700" /> {nFoto}
                              </Button>
                            ) : 0}
                          </TableCell>
                          <TableCell>{r.status ? <Badge className={`border-transparent ${statusColor(r.status)}`}>{r.status}</Badge> : '*'}</TableCell>
                          <TableCell className="text-xs">{st(rec.catatan)}</TableCell>
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

        {/* ============ SUB-MENU HASIL TEMUAN ============ */}
        <TabsContent value="temuan" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ml-auto text-xs text-muted-foreground">
              Kolom sama persis dengan sheet &quot;Detail Temuan&quot; pada ekspor Excel — satu baris per temuan / sampel / foto.
            </div>
          </div>
          <Card className="border-green-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">No</TableHead>
                      <TableHead>Kode Transaksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Estate</TableHead>
                      <TableHead>Kebun</TableHead>
                      <TableHead>Afdeling</TableHead>
                      <TableHead>Blok</TableHead>
                      <TableHead>Pasar Kanan</TableHead>
                      <TableHead className="text-right">Nomor Baris Kanan</TableHead>
                      <TableHead>Pasar Kiri</TableHead>
                      <TableHead className="text-right">Nomor Baris Kiri</TableHead>
                      <TableHead className="text-right">Ancak</TableHead>
                      <TableHead>Kategori Ancak</TableHead>
                      <TableHead>Temuan</TableHead>
                      <TableHead className="text-right">Sampel</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Latitude</TableHead>
                      <TableHead className="text-right">Longitude</TableHead>
                      <TableHead className="text-right">Akurasi (m)</TableHead>
                      <TableHead>Sumber Lokasi</TableHead>
                      <TableHead>Peta</TableHead>
                      <TableHead>Foto</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 24 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {!loading && temuanTampil.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={24} className="text-center text-muted-foreground py-10">
                          Belum ada temuan pada halaman ini. Kirim data dari aplikasi HP lewat menu <b>Sinkronisasi Server → Kirim Data ke Server</b>.
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && temuanTampil.map((b) => (
                      <TableRow key={b.key}>
                        <TableCell className="text-right text-xs text-muted-foreground">{b.no}</TableCell>
                        <TableCell><code className="text-[11px] whitespace-nowrap">{b.kode}</code></TableCell>
                        <TableCell className="whitespace-nowrap">{b.tgl}</TableCell>
                        <TableCell>{b.pt}</TableCell>
                        <TableCell>{b.kb}</TableCell>
                        <TableCell>{b.afd}</TableCell>
                        <TableCell className="font-medium">{b.blok}</TableCell>
                        <TableCell>{b.pasarKanan}</TableCell>
                        <TableCell className="text-right">{b.noKanan}</TableCell>
                        <TableCell>{b.pasarKiri}</TableCell>
                        <TableCell className="text-right">{b.noKiri}</TableCell>
                        <TableCell className="text-right">{b.ancak}</TableCell>
                        <TableCell>{b.kat}</TableCell>
                        <TableCell className="text-xs font-medium">{b.tem}</TableCell>
                        <TableCell className="text-right">{b.sam}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.nilai != null ? b.nilai : '*'}</TableCell>
                        <TableCell>{b.sat || '*'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{b.lat != null ? b.lat.toFixed(6) : '*'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{b.lng != null ? b.lng.toFixed(6) : '*'}</TableCell>
                        <TableCell className="text-right text-xs">{b.akr != null ? `±${b.akr}` : '*'}</TableCell>
                        <TableCell className="text-xs">{b.src || '*'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {b.lat != null && b.lng != null ? (
                            <a className="text-xs text-green-700 underline decoration-dotted" target="_blank" rel="noopener"
                              href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}>
                              <MapPin className="inline h-3 w-3 mr-0.5" />Buka Peta
                            </a>
                          ) : '*'}
                        </TableCell>
                        <TableCell>
                          {b.fotoAda ? (
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setGalleryId(b.id)}>
                              <Camera className="h-3.5 w-3.5 mr-1 text-green-700" /> Lihat
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Tidak ada foto</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Detail transaksi" onClick={() => openDetail(b.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(() => {
                            const row = data?.rows.find((x) => x.id === b.id)
                            return row && canDelete(row) ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" aria-label="Hapus" onClick={() => doDelete(row)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
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
              <TabelTemuan rec={detail.record} />
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Lihat data mentah (JSON)</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(detail.record, (k, v) => (k === 'photo' && typeof v === 'string' && v.startsWith('data:image') ? '[foto]' : v), 2)}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Galeri Foto (dibuka dari kolom Foto di tabel Hasil Temuan) */}
      <Dialog open={!!galleryId} onOpenChange={(o) => !o && setGalleryId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Foto Temuan</DialogTitle>
            <DialogDescription>Foto yang dikirim dari aplikasi HP bersama transaksi ini.</DialogDescription>
          </DialogHeader>
          {galleryId ? <FotoTemuan id={galleryId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ==================== Fungsi bantu rekap & ekspor ==================== */

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

/** Ukuran + data URL foto siap tanam (dikecilkan bila besar agar berkas Excel tetap ringan) */
const fotoCache = new Map<string, { url: string; w: number; h: number }>()
function ukuranFoto(dataUrl: string): Promise<{ url: string; w: number; h: number }> {
  const ada = fotoCache.get(dataUrl)
  if (ada) return Promise.resolve(ada)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.width || 230
      const h = img.height || 170
      let url = dataUrl
      // kecilkan bila foto besar (sisi terpanjang > 1280px atau base64 > 400KB)
      if (Math.max(w, h) > 1280 || dataUrl.length > 400_000) {
        try {
          const sc = Math.min(1, 1280 / Math.max(w, h))
          const cv = document.createElement('canvas')
          cv.width = Math.max(1, Math.round(w * sc))
          cv.height = Math.max(1, Math.round(h * sc))
          cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
          const kecil = cv.toDataURL('image/jpeg', 0.72)
          if (kecil && kecil.length > 30 && kecil.length < dataUrl.length) url = kecil
        } catch { /* pakai foto asli */ }
      }
      const ratio = Math.min(230 / w, 170 / h) // kotak foto sama seperti aplikasi HP (230x170)
      const out = { url, w: Math.max(40, Math.round(w * ratio)), h: Math.max(30, Math.round(h * ratio)) }
      fotoCache.set(dataUrl, out)
      resolve(out)
    }
    img.onerror = () => resolve({ url: dataUrl, w: 230, h: 170 })
    img.src = dataUrl
  })
}

/** Sheet ekspor persis seperti aplikasi HP: Rekap (1 baris/pemeriksaan) + Detail Temuan (foto tertanam) */
async function eksporSheets(
  rows: Record<string, unknown>[],
  master: Map<string, { luas: number | null; pokok: number | null }>,
  denganFoto: boolean
): Promise<ExcelWorksheet[]> {
  const kode = (r: Record<string, unknown>, i: number) => String(r.kodeTransaksi || `TRX-${i + 1}`)
  const bintang = (v: unknown) => (v === '' || v == null ? '*' : v)
  const rekapRows = rows.map((r, i) => {
    const kunci = `${String(r.kebun || '').toUpperCase()}|${String(r.afdeling || '').toUpperCase()}|${String(r.blok || '').toUpperCase()}`
    const m = master.get(kunci)
    const luas = r.luas != null ? Number(r.luas) : m?.luas ?? null
    const pokok = r.pokok != null ? Math.round(Number(r.pokok)) : m?.pokok != null ? Math.round(m.pokok) : null
    return {
      no: i + 1,
      kode: kode(r, i), tgl: r.tanggal || '', pem: r.pemeriksa || '',
      pt: r.estate || r.pt || '', kebun: r.kebun || '', afd: r.afdeling || '', blok: r.blok || '',
      luas: luas != null ? luas : '*', pokok: pokok != null ? pokok : '*',
      pasarKanan: r.noPasarKanan ? 'Ya' : '*', noKanan: bintang(r.noPasarKanan),
      pasarKiri: r.noPasarKiri ? 'Ya' : '*', noKiri: bintang(r.noPasarKiri),
      ancak: bintang(r.ancak), ancakSt: bintang(r.ancakStatus),
      semak: nilai(r, 'semak'), tunasan: nilai(r, 'tunasan'), titi: nilai(r, 'titi'),
      kerdil: nilai(r, 'kerdil'), banjir: nilai(r, 'banjir'),
      foto: hitungFoto(r), status: r.status || '', cat: bintang(r.catatan),
    }
  })

  const detailRows: Record<string, unknown>[] = []
  const images: ExcelSheetImage[] = []
  const rowHeights: Record<number, number> = {}
  const fotoTertunda: { di: number; excelRow: number; photo: string }[] = []
  let n = 0
  rows.forEach((r, i) => {
    const details = (r.details || {}) as Record<string, { value?: unknown; photo?: string; location?: { latitude?: number; longitude?: number; accuracy?: number; source?: string }; extras?: { value?: unknown; photo?: string; location?: { latitude?: number; longitude?: number; accuracy?: number; source?: string } }[] }>
    const tambahBaris = (
      tem: string, sam: number, val: number | null, sat: string,
      loc: { latitude?: number; longitude?: number; accuracy?: number; source?: string } | null,
      photo: string | undefined
    ) => {
      n++
      const di = detailRows.length
      detailRows.push({
        no: n, kode: kode(r, i), tgl: r.tanggal || '', pt: r.estate || r.pt || '', kebun: r.kebun || '', afd: r.afdeling || '', blok: r.blok || '',
        pasarKanan: r.noPasarKanan ? 'Ya' : '*', noKanan: bintang(r.noPasarKanan), pasarKiri: r.noPasarKiri ? 'Ya' : '*', noKiri: bintang(r.noPasarKiri),
        ancak: bintang(r.ancak), katAncak: bintang(r.ancakStatus),
        tem, sam, nilai: val != null ? val : '*', sat: sat || '*',
        lat: loc ? Number(Number(loc.latitude).toFixed(6)) : '*',
        lng: loc ? Number(Number(loc.longitude).toFixed(6)) : '*',
        akr: loc && loc.accuracy != null ? loc.accuracy : '*',
        src: loc ? (loc.source || 'GPS') : '*',
        peta: loc ? { text: 'Buka Peta', hyperlink: `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}` } : '*',
        foto: '',
      })
      // kolom Foto = kolom terakhir (indeks kolom 0-based = 22); foto diproses di tahap 2
      const excelRow = di + 2 // baris ExcelJS 1-based (baris 1 = header)
      if (photo && photo.startsWith('data:image')) {
        fotoTertunda.push({ di, excelRow, photo })
      } else {
        rowHeights[excelRow] = 22
        detailRows[di].foto = 'Tidak ada foto'
      }
    }
    for (const key of METRICS) {
      const d0 = details[key] || {}
      const extras = Array.isArray(d0.extras) ? d0.extras : []
      const samples = [{ no: 1, val: d0.value !== undefined ? num(d0.value) : num(r[key]), d: d0 }, ...extras.map((x, ix) => ({ no: ix + 2, val: num(x?.value), d: x }))]
      for (const sm of samples) {
        const d = sm.d || {}
        const loc = d.location || null
        const val = sm.val
        if (!(val > 0 || d.photo || loc)) continue
        tambahBaris(LABEL_TM[key], sm.no, val, SATUAN[key], loc, d.photo)
      }
    }
    const db = details.bukti || null
    if (db && (db.photo || db.location)) {
      const loc = db.location || null
      tambahBaris('Foto Bukti Kondisi Ancak', 1, null, '', loc, db.photo)
    }
  })

  // Tahap 2: ukur & kecilkan foto satu per satu, lalu pasang tinggi baris + gambar
  for (const t of fotoTertunda) {
    const f = await ukuranFoto(t.photo)
    rowHeights[t.excelRow] = Math.round((f.h + 10) * 0.75)
    if (denganFoto) {
      images.push({ dataUrl: f.url, col: 22, row: t.excelRow - 1, width: f.w, height: f.h })
    } else {
      detailRows[t.di].foto = 'ADA (lihat aplikasi)'
    }
  }

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
      cellStyles: { I: { numFmt: '0.00' }, Q: { numFmt: '0.00' }, U: { numFmt: '0.00' } },
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
      images,
      rowHeights,
    },
  ]
}

