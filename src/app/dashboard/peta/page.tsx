'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Map as MapIcon, Upload, FileText, Trash2, Search, RefreshCw, ZoomIn, ZoomOut,
  Maximize2, Layers, Eye, EyeOff, Loader2,
} from 'lucide-react'
import { loadPetaEngine, PetaEngine, type PetaInstance } from '@/lib/peta-loader'

interface LayerMeta {
  id: string; name: string; type: string; sizeBytes: number
  createdAt: string; uploadedBy?: { username: string } | null
}
interface TemuanLoc { latitude: number; longitude: number; accuracy?: number; source?: string }
interface MapRecord {
  id: string; kodeTransaksi: string; tanggal: string; pemeriksa: string
  estate: string; kebun: string; afdeling: string; blok: string; status: string
  record: {
    details?: Record<string, {
      value?: number; status?: string; location?: TemuanLoc
      extras?: { value?: number; location?: TemuanLoc }[]
    }>
    catatan?: string
  }
}
interface Temuan {
  type: string; value: number; status: string; sample: number; lat: number; lon: number
  acc?: number; src?: string; kebun: string; afd: string; blok: string; tanggal: string
  pemeriksa: string; rstatus: string; catatan: string; rid?: string
}
interface FotoItem { key: string; label: string; sample: number; url: string }

const STATUS_COLORS: Record<string, string> = {
  'PRIORITAS TINGGI': 'rgba(239,68,68,.55)',
  'PERLU PERBAIKAN': 'rgba(250,204,21,.6)',
  'BAIK': 'rgba(34,197,94,.45)',
}
const LEGEND = [
  { key: 'semak', label: 'Semak', color: '#dc2626' },
  { key: 'tunasan', label: 'Tunasan Bermasalah', color: '#7c3aed' },
  { key: 'titi', label: 'Tidak Ada Titi Panen', color: '#92400e' },
  { key: 'kerdil', label: 'Pokok Kerdil', color: '#db2777' },
  { key: 'banjir', label: 'Areal Banjir', color: '#0891b2' },
  { key: 'bukti', label: 'Bukti Ancak', color: '#0f766e' },
]
const UNIT: Record<string, string> = { semak: 'Ha', tunasan: 'Pkk', titi: 'Unit', kerdil: 'Pkk', banjir: 'Ha', bukti: '' }
const NAMA_TM: Record<string, string> = { semak: 'Semak', tunasan: 'Tunasan Bermasalah', titi: 'Tidak Ada Titi Panen', kerdil: 'Pokok Kerdil', banjir: 'Areal Banjir', bukti: 'Bukti Ancak' }

const normBlok = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
function worstStatus(list: string[]): string {
  const P = ['PRIORITAS TINGGI', 'PERLU PERBAIKAN', 'BAIK']
  let worst = ''
  for (const s of list) {
    const u = (s || '').toUpperCase()
    const i = P.findIndex(p => u.includes(p))
    const cur = worst ? P.findIndex(p => worst.includes(p)) : 99
    if (i >= 0 && i < cur) worst = u
  }
  return worst
}

const emptyFilters = { kebun: '', afdeling: '', blok: '', tanggalFrom: '', tanggalTo: '' }

export default function PetaPage() {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const engRef = useRef<PetaInstance | null>(null)
  const recRef = useRef<MapRecord[]>([])
  const firstFit = useRef(false)
  const loadedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [layers, setLayers] = useState<LayerMeta[]>([])
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set())
  const [fields, setFields] = useState<string[]>([])
  const [labelField, setLabelField] = useState('')
  const [facets, setFacets] = useState<{ kebun: string[]; afdeling: string[]; blok: string[] }>({ kebun: [], afdeling: [], blok: [] })
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<'' | 'geojson' | 'pdf'>('')
  const [showTemuan, setShowTemuan] = useState(true)
  const [colorByStatus, setColorByStatus] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [kbScope, setKbScope] = useState('')
  const [info, setInfo] = useState<{ kind: 'temuan' | 'feature'; html: string } | null>(null)
  const [records, setRecords] = useState<MapRecord[]>([])
  const [truncated, setTruncated] = useState(false)
  const [temuanCount, setTemuanCount] = useState(0)
  const [curTm, setCurTm] = useState<Temuan | null>(null)
  const [tmPhotos, setTmPhotos] = useState<{ loading: boolean; items: FotoItem[] }>({ loading: false, items: [] })
  const [zoom, setZoom] = useState<FotoItem | null>(null)

  // tutup popup → bersihkan foto & lightbox
  useEffect(() => {
    if (!info || info.kind !== 'temuan') { setCurTm(null); setZoom(null) }
  }, [info])

  // ambil foto temuan yang sedang dibuka (on-demand, ringan)
  useEffect(() => {
    if (!curTm || !curTm.rid) { setTmPhotos({ loading: false, items: [] }); return }
    let alive = true
    setTmPhotos({ loading: true, items: [] })
    fetch(`/api/data/${curTm.rid}/photos`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const all: FotoItem[] = d.ok ? d.photos || [] : []
        setTmPhotos({ loading: false, items: all.filter(p => p.key === curTm.type && p.sample === curTm.sample) })
      })
      .catch(() => { if (alive) setTmPhotos({ loading: false, items: [] }) })
    return () => { alive = false }
  }, [curTm])

  const refreshFields = useCallback(() => {
    const eng = engRef.current; if (!eng) return
    setFields(eng.fieldsList())
    setLabelField(eng.autoLabelField())
  }, [])

  async function attachLayer(meta: LayerMeta) {
    const eng = engRef.current; if (!eng) return
    const d = await (await fetch(`/api/map-layers/${meta.id}`)).json()
    if (!d.ok) throw new Error(d.error || 'gagal memuat lapisan')
    const L = d.layer as { id: string; name: string; type: string; content: string; meta: string }
    if (L.type === 'GEOJSON') {
      eng.addVectorLayer(L.id, L.name, JSON.parse(L.content))
    } else {
      let gt: number[] | null = null
      try { gt = (JSON.parse(L.meta || '{}') as { gt?: number[] }).gt || null } catch { gt = null }
      const img = new Image()
      await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = () => rej(new Error('gambar peta gagal dimuat')); img.src = L.content })
      if (gt) eng.addRasterLayer(L.id, L.name, img, gt, 1)
    }
    refreshFields()
  }

  const loadLayersAll = useCallback(async () => {
    try {
      const d = await (await fetch('/api/map-layers')).json()
      if (!d.ok) return
      const list: LayerMeta[] = d.layers || []
      setLayers(list)
      for (const L of list) {
        try { await attachLayer(L) } catch (e) { toast.error(`Lapisan "${L.name}": ${String((e as Error).message || e)}`) }
      }
      if (list.length) {
        toast.success(`${list.length} lapisan peta dimuat dari server`)
        if (!firstFit.current && engRef.current) { engRef.current.fit(); }
      }
    } catch { /* jaringan */ }
     
  }, [])

  const loadRecords = useCallback(async (f: typeof emptyFilters) => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      const ff = kbScope ? { ...f, kebun: kbScope } : f
      Object.entries(ff).forEach(([k, v]) => { if (v) p.set(k, v) })
      const d = await (await fetch(`/api/map-records?${p}&max=600`)).json()
      if (!d.ok) throw new Error(d.error)
      const rows: MapRecord[] = d.records || []
      setRecords(rows); setTruncated(!!d.terpotong)
      recRef.current = rows
      const eng = engRef.current
      if (eng) {
        const tm = PetaEngine.extractTemuan(rows) as Temuan[]
        eng.setTemuan(tm)
        setTemuanCount(tm.length)
        if (!firstFit.current) { eng.fit(); firstFit.current = true }
      }
      applyColors(rows)
      toast.success(`${d.total.toLocaleString('id-ID')} transaksi cocok — ${temuanCountText(rows)} titik temuan digambar${d.terpotong ? ' (dipotong 600)' : ''}`)
    } catch (e) {
      toast.error(String((e as Error).message || e))
    } finally { setLoading(false) }
     
  }, [kbScope])

  function temuanCountText(rows: MapRecord[]): number {
    return (PetaEngine.extractTemuan(rows) as Temuan[]).length
  }

  function applyColors(rows: MapRecord[]) {
    const eng = engRef.current; if (!eng) return
    if (!colorByStatus) { eng.setBlokFill(null); return }
    const m: Record<string, string> = {}
    const byBlok: Record<string, string[]> = {}
    rows.forEach(r => { const k = normBlok(r.blok); if (!k) return; (byBlok[k] = byBlok[k] || []).push(r.status) })
    Object.entries(byBlok).forEach(([k, list]) => {
      const w = worstStatus(list)
      if (w && STATUS_COLORS[w]) m[k] = STATUS_COLORS[w]
    })
    eng.setBlokFill(m)
  }

  useEffect(() => { engRef.current?.setTemuanVisible(showTemuan) }, [showTemuan])

  useEffect(() => {
    if (engRef.current) applyColors(recRef.current)
     
  }, [colorByStatus])

  // init
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    let ro: ResizeObserver | null = null
    loadPetaEngine().then(() => {
      const cv = cvRef.current; if (!cv || !window.PetaEngine) return
      const eng = window.PetaEngine.create({
        canvas: cv,
        onTap: (hit) => {
          if (hit.kind === 'temuan' && hit.data) return showTemuanInfo(hit.data as Temuan)
          const f = hit.data as { label?: string; key?: string; k?: string; p?: Record<string, unknown> } | null
          if (!f) { setInfo(null); return }
          const attrs = Object.keys(f.p || {}).filter(k => !String(k).startsWith('__')).slice(0, 12)
            .map(k => `<tr><th>${esc(k)}</th><td>${esc(String(f.p?.[k] ?? ''))}</td></tr>`).join('')
          const key = f.key || normBlok(f.label || '')
          const rows = recRef.current.filter(r => normBlok(r.blok) === key)
          const worst = worstStatus(rows.map(r => r.status))
          const q = new URLSearchParams()
          if (f.label) q.set('blok', f.label)
          if (applied.kebun) q.set('kebun', applied.kebun)
          if (applied.afdeling) q.set('afdeling', applied.afdeling)
          setInfo({
            kind: 'feature',
            html: `<strong>${esc(f.label || (f.k === 'poly' ? 'Poligon' : 'Fitur'))}</strong>` +
              (attrs ? `<table>${attrs}</table>` : '') +
              `<div class="peta-note">Pemeriksaan tercatat untuk blok ini: <b>${rows.length}</b>${worst ? ` &middot; status terburuk: <b>${esc(worst)}</b>` : ''}</div>` +
              (key ? `<a class="peta-link" href="/dashboard/data?${q.toString()}">Lihat data blok ini di menu Data &rarr;</a>` : ''),
          })
        },
      })
      engRef.current = eng
      setReady(true)
      ro = new ResizeObserver(() => eng.resize())
      ro.observe(cv)
      fetch('/api/auth/me').then(r => r.json()).then(d => {
        const u = d.user || null
        setIsAdmin(u?.role === 'ADMIN')
        setKbScope(u && u.role !== 'ADMIN' ? (u.kebun || '').trim() : '')
      }).catch(() => {})
      fetch('/api/data/facets').then(r => r.json()).then(d => { if (d.ok) setFacets({ kebun: d.kebun || [], afdeling: d.afdeling || [], blok: d.blok || [] }) }).catch(() => {})
      loadLayersAll()
      loadRecords(emptyFilters)
    }).catch(e => toast.error(String(e.message || e)))
    return () => { ro?.disconnect(); engRef.current = null; loadedRef.current = false }
     
  }, [])

  function showTemuanInfo(t: Temuan) {
    setCurTm(t)
    const tgl = t.tanggal ? new Date(t.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
    const val = t.type === 'bukti' ? esc(t.status || '-') : esc(String(t.value)) + ' ' + (UNIT[t.type] || '')
    setInfo({
      kind: 'temuan',
      html: `<strong>${esc(NAMA_TM[t.type] || t.type)}${t.sample > 1 ? ' – sampel ' + t.sample : ''}</strong>` +
        `<table><tr><th>Blok</th><td>${esc(t.blok || '-')} (Afd ${esc(t.afd || '-')}, ${esc(t.kebun || '-')})</td></tr>` +
        `<tr><th>${t.type === 'bukti' ? 'Kondisi' : 'Nilai'}</th><td>${val}</td></tr>` +
        `<tr><th>Tanggal</th><td>${esc(tgl)}${t.pemeriksa ? ' • ' + esc(t.pemeriksa) : ''}</td></tr>` +
        (t.rstatus ? `<tr><th>Status blok</th><td>${esc(t.rstatus)}</td></tr>` : '') +
        `<tr><th>Koordinat</th><td>${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}${t.acc != null ? ' (±' + esc(t.acc) + ' m)' : ''}</td></tr>` +
        (t.src ? `<tr><th>Sumber</th><td>${esc(t.src)}</td></tr>` : '') +
        (t.catatan ? `<tr><th>Catatan</th><td>${esc(t.catatan)}</td></tr>` : '') +
        `</table><a class="peta-link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${t.lat},${t.lon}">Buka di Google Maps &rarr;</a>`,
    })
  }

  async function importGeoJson(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setImporting('geojson')
    try {
      const text = await f.text()
      JSON.parse(text)
      const name = f.name.replace(/\.(geojson|json)$/i, '')
      const res = await fetch('/api/map-layers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'GEOJSON', content: text }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) throw new Error(d.error || 'Gagal menyimpan lapisan')
      await attachLayer(d.layer)
      setLayers(v => [d.layer, ...v])
      engRef.current?.fit()
      toast.success(`Peta GeoJSON "${name}" tersimpan di server`)
    } catch (err) { toast.error(`Gagal impor GeoJSON: ${String((err as Error).message || err)}`) }
    finally { setImporting('') }
  }

  async function importPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setImporting('pdf')
    toast.info('Memproses PDF peta… bisa beberapa detik')
    try {
      const prep = await PetaEngine.pdfPrepare(f)
      const name = f.name.replace(/\.pdf$/i, '')
      const res = await fetch('/api/map-layers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type: 'RASTER', content: prep.dataUrl,
          meta: JSON.stringify({ gt: prep.gt, w: prep.w, h: prep.h, note: prep.note, georef: prep.georef }),
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) throw new Error(d.error || 'Gagal menyimpan lapisan')
      const img = new Image()
      await new Promise((res2, rej) => { img.onload = () => res2(null); img.onerror = () => rej(new Error('gambar gagal dimuat')); img.src = prep.dataUrl })
      engRef.current?.addRasterLayer(d.layer.id, name, img, prep.gt, 1)
      setLayers(v => [d.layer, ...v])
      engRef.current?.fit()
      toast.success(`Peta PDF "${name}" tersimpan${prep.georef ? ' (georeferensi terbaca dari PDF)' : ' (kalibrasi manual)'}${prep.note ? ' — ' + prep.note : ''}`)
    } catch (err) { toast.error(`Gagal impor PDF: ${String((err as Error).message || err)}`) }
    finally { setImporting('') }
  }

  async function deleteLayer(L: LayerMeta) {
    if (!confirm(`Hapus lapisan peta "${L.name}"? Tindakan ini permanen.`)) return
    try {
      const res = await fetch(`/api/map-layers/${L.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok || !d.ok) throw new Error(d.error || 'Gagal menghapus')
      engRef.current?.removeLayer(L.id)
      setLayers(v => v.filter(x => x.id !== L.id))
      refreshFields()
      toast.success('Lapisan dihapus')
    } catch (e) { toast.error(String((e as Error).message || e)) }
  }

  function toggleLayer(id: string) {
    const eng = engRef.current; if (!eng) return
    setHiddenLayers(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id); eng.setLayerVisible(id, true) }
      else { n.add(id); eng.setLayerVisible(id, false) }
      return n
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Peta Blok</h1>
          <p className="text-sm text-muted-foreground">
            Hasil pemeriksaan digambar di peta — sama seperti aplikasi Android. Impor peta GeoJSON atau PDF map (GeoPDF/Avenza).
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <label>
              <input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={importGeoJson} />
              <Button asChild size="sm" className="bg-green-700 hover:bg-green-800 cursor-pointer" disabled={importing !== ''}>
                <span>{importing === 'geojson' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Impor GeoJSON</span>
              </Button>
            </label>
            <label>
              <input type="file" accept="application/pdf,.pdf" hidden onChange={importPdf} />
              <Button asChild size="sm" variant="outline" className="cursor-pointer" disabled={importing !== ''}>
                <span>{importing === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />} Impor PDF Map</span>
              </Button>
            </label>
          </div>
        )}
      </div>

      {/* Filter */}
      <Card className="border-green-100">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Kebun</Label>
              {kbScope ? (
                <div className="flex h-9 items-center rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-800">
                  <span className="truncate">{kbScope} (terkunci)</span>
                </div>
              ) : (
                <Select value={filters.kebun || 'ALL'} onValueChange={(v) => setFilters({ ...filters, kebun: v === 'ALL' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Semua kebun" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="ALL">Semua kebun</SelectItem>
                    {facets.kebun.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Afdeling</Label>
              <Select value={filters.afdeling || 'ALL'} onValueChange={(v) => setFilters({ ...filters, afdeling: v === 'ALL' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Semua afdeling" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="ALL">Semua afdeling</SelectItem>
                  {facets.afdeling.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Blok</Label>
              <Select value={filters.blok || 'ALL'} onValueChange={(v) => setFilters({ ...filters, blok: v === 'ALL' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Semua blok" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="ALL">Semua blok</SelectItem>
                  {facets.blok.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dari tanggal</Label>
              <Input type="date" value={filters.tanggalFrom} onChange={(e) => setFilters({ ...filters, tanggalFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sampai tanggal</Label>
              <Input type="date" value={filters.tanggalTo} onChange={(e) => setFilters({ ...filters, tanggalTo: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => { setApplied({ ...filters }); loadRecords({ ...filters }) }} size="sm" className="bg-green-700 hover:bg-green-800" disabled={loading || !ready}>
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />} Tampilkan di Peta
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters) }}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Reset filter
            </Button>
            <div className="flex items-center gap-2">
              <Switch checked={showTemuan} onCheckedChange={setShowTemuan} id="sw-tm" />
              <Label htmlFor="sw-tm">Titik temuan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={colorByStatus} onCheckedChange={setColorByStatus} id="sw-col" />
              <Label htmlFor="sw-col">Warnai blok sesuai status</Label>
            </div>
            {fields.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-nowrap">Label peta</Label>
                <Select value={labelField || 'NONE'} onValueChange={(v) => { const f = v === 'NONE' ? '' : v; setLabelField(f); engRef.current?.setLabelField(f) }}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="NONE">(tanpa label)</SelectItem>
                    {fields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Kanvas peta */}
        <Card className="border-green-100 overflow-hidden">
          <CardContent className="p-0 relative">
            <canvas ref={cvRef} className="w-full h-[70vh] min-h-[420px] touch-none block bg-[#eef3ef]" />
            <div className="absolute top-2 right-2 flex flex-col gap-1.5">
              <Button size="icon" variant="outline" className="h-9 w-9 bg-background" onClick={() => engRef.current?.zoomIn()} aria-label="Perbesar"><ZoomIn className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" className="h-9 w-9 bg-background" onClick={() => engRef.current?.zoomOut()} aria-label="Perkecil"><ZoomOut className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" className="h-9 w-9 bg-background" onClick={() => engRef.current?.fit()} aria-label="Sesuaikan tampilan"><Maximize2 className="h-4 w-4" /></Button>
            </div>
            {info && (
              <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md max-h-[45%] overflow-y-auto rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg">
                <button className="absolute top-1.5 right-2 text-muted-foreground hover:text-foreground text-lg leading-none" onClick={() => setInfo(null)} aria-label="Tutup">×</button>
                <div className="peta-info [&_table]:w-full [&_table]:text-xs [&_table]:mt-2 [&_th]:text-left [&_th]:pr-3 [&_th]:text-muted-foreground [&_th]:font-normal [&_th]:align-top [&_td]:font-medium [&_td]:break-words [&_.peta-note]:mt-2 [&_.peta-note]:text-xs [&_.peta-note]:text-muted-foreground [&_.peta-link]:mt-2 [&_.peta-link]:inline-block [&_.peta-link]:text-sm [&_.peta-link]:text-green-700 [&_.peta-link]:underline"
                  dangerouslySetInnerHTML={{ __html: info.html }} />
                {info.kind === 'temuan' && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold mb-1.5">Foto temuan</p>
                    {tmPhotos.loading ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat foto…</p>
                    ) : tmPhotos.items.length ? (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {tmPhotos.items.map((p, i) => (
                          <figure key={`${p.key}-${p.sample}-${i}`} className="shrink-0 min-w-0">
                            <img
                              src={p.url}
                              alt={p.label}
                              loading="lazy"
                              onClick={() => setZoom(p)}
                              className="h-20 w-20 rounded-md border object-cover cursor-zoom-in bg-muted"
                            />
                            <figcaption className="text-[10px] text-muted-foreground truncate max-w-20">{p.label}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tidak ada foto untuk temuan ini (foto ikut terkirim bila dikirim lewat tombol Kirim ke Server).</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel kanan */}
        <div className="space-y-4">
          <Card className="border-green-100">
            <CardContent className="p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> Lapisan peta ({layers.length})</p>
              {!isAdmin && <p className="text-xs text-muted-foreground">Hanya admin yang bisa mengimpor/menghapus lapisan.</p>}
              {layers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada lapisan. Tekan <b>Impor GeoJSON</b> atau <b>Impor PDF Map</b>. Peta tersimpan di server — semua pengguna web memakai peta yang sama, tanpa impor ulang.
                </p>
              )}
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {layers.map(L => (
                  <div key={L.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    {L.type === 'RASTER' ? <FileText className="h-4 w-4 shrink-0 text-amber-600" /> : <MapIcon className="h-4 w-4 shrink-0 text-green-700" />}
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium truncate ${hiddenLayers.has(L.id) ? 'line-through text-muted-foreground' : ''}`}>{L.name}</p>
                      <p className="text-[11px] text-muted-foreground">{L.type === 'RASTER' ? 'PDF map' : 'GeoJSON'} · {Math.max(1, Math.round(L.sizeBytes / 1024))} KB</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Tampil/sembunyi" onClick={() => toggleLayer(L.id)}>
                      {hiddenLayers.has(L.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" aria-label="Hapus" onClick={() => deleteLayer(L)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-100">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold">Keterangan</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {LEGEND.map(s => (
                  <div key={s.key} className="flex items-center gap-1.5 min-w-0">
                    <span className="h-3 w-3 shrink-0 rotate-45 rounded-[2px] border border-white ring-1 ring-black/30" style={{ background: s.color }} />
                    <span className="truncate">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 mt-2 space-y-1 text-xs">
                {Object.entries(STATUS_COLORS).map(([st, col]) => (
                  <div key={st} className="flex items-center gap-2">
                    <span className="h-3 w-5 rounded-sm border" style={{ background: col }} />
                    <span>{st}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="h-3 w-5 rounded-sm border" style={{ background: 'rgba(34,197,94,.28)' }} />
                  <span>Belum diperiksa / tanpa status</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-100">
            <CardContent className="p-4 space-y-1 text-xs text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">Ringkasan tampilan</p>
              <p>Transaksi tampil: <b className="text-foreground">{records.length.toLocaleString('id-ID')}{truncated ? ' (dipotong)' : ''}</b></p>
              <p>Titik temuan: <b className="text-foreground">{temuanCount.toLocaleString('id-ID')}</b></p>
              <p>PDF tanpa georeferensi: diminta koordinat 2 pojok peta (kiri-atas &amp; kanan-bawah), sekali saja.</p>
              <p>Sentuh/klik poligon blok → info &amp; jumlah pemeriksaan. Sentuh simbol temuan → detail temuan.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lightbox foto temuan */}
      {zoom && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoom(null)}
        >
          <div className="max-w-full max-h-full space-y-2" onClick={e => e.stopPropagation()}>
            <img src={zoom.url} alt={zoom.label} className="max-h-[75vh] max-w-full rounded-lg object-contain mx-auto block" />
            <p className="text-center text-xs text-white/90">{zoom.label} · ketuk area gelap untuk menutup</p>
          </div>
        </div>
      )}
    </div>
  )
}
