'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Upload, Download, Pencil, Trash2, Search, BookOpen, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { jsonFetch } from '@/lib/api'

interface BlokRow {
  id: string; estate: string; kebun: string; afdeling: string; blok: string; luas: number | null; pokok: number | null
}
interface Facet {
  kebun: string; estate: string; afdelings: string[]; jumlahAfdeling: number; bloks: number; luas: number; pokok: number
}
interface FacetsResp {
  ok: boolean; facets: Facet[]; estates: string[]; totalBlok: number; totalKebun: number
  totalAfdeling: number; totalEstate: number; totalLuas: number; totalPokok: number; kosong: boolean
}

const fmt = (n: number) => n.toLocaleString('id-ID')
const fmt2 = (n: number) => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DataMasterPage() {
  const [me, setMe] = useState<{ role: 'ADMIN' | 'USER'; kebun?: string } | null>(null)
  const isAdmin = me?.role === 'ADMIN'
  const kbScope = me && me.role !== 'ADMIN' ? (me.kebun || '').trim() : ''

  const [facets, setFacets] = useState<FacetsResp | null>(null)
  const [rows, setRows] = useState<BlokRow[] | null>(null)
  const [total, setTotal] = useState(0)

  const [fKebun, setFKebun] = useState('')
  const [fAfd, setFAfd] = useState('')
  const [fQ, setFQ] = useState('')
  const [page, setPage] = useState(1)
  const LIMIT = 200

  const [edit, setEdit] = useState<BlokRow | null>(null)
  const [eLuas, setELuas] = useState('')
  const [ePokok, setEPokok] = useState('')
  const [saving, setSaving] = useState(false)

  const [impOpen, setImpOpen] = useState(false)
  const [impText, setImpText] = useState('')
  const [impMode, setImpMode] = useState('merge')
  const [impBusy, setImpBusy] = useState(false)

  const afdOptions = useMemo(() => {
    if (!facets) return []
    const src = fKebun ? facets.facets.filter((f) => f.kebun === fKebun) : facets.facets
    return [...new Set(src.flatMap((f) => f.afdelings))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [facets, fKebun])

  const loadFacets = useCallback(() => {
    jsonFetch<FacetsResp & { error?: string }>('/api/master?facets=1')
      .then((d) => { if (!d.ok) throw new Error(d.error); setFacets(d) })
      .catch((e) => toast.error(String((e as Error).message || e)))
  }, [])

  const loadRows = useCallback(() => {
    setRows(null)
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (kbScope) p.set('kebun', kbScope)
    else if (fKebun) p.set('kebun', fKebun)
    if (fAfd) p.set('afdeling', fAfd)
    if (fQ.trim()) p.set('q', fQ.trim())
    jsonFetch<{ ok: boolean; error?: string; rows: BlokRow[]; total: number }>(`/api/master?${p}`)
      .then((d) => { if (!d.ok) throw new Error(d.error); setRows(d.rows); setTotal(d.total) })
      .catch((e) => toast.error(String((e as Error).message || e)))
  }, [fKebun, fAfd, fQ, page, kbScope])

  useEffect(() => {
    jsonFetch<{ user?: { role: 'ADMIN' | 'USER'; kebun?: string } }>('/api/auth/me').then((d) => setMe(d.user || null)).catch(() => {})
    loadFacets()
  }, [loadFacets])
  useEffect(() => { loadRows() }, [loadRows])

  async function simpanEdit() {
    if (!edit) return
    setSaving(true)
    try {
      const res = await fetch(`/api/master/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ luas: eLuas === '' ? null : eLuas, pokok: ePokok === '' ? null : ePokok }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menyimpan'); return }
      toast.success(`Blok ${edit.blok} diperbarui`)
      setEdit(null); loadRows(); loadFacets()
    } finally { setSaving(false) }
  }

  async function hapusBlok(b: BlokRow) {
    if (!confirm(`Hapus blok ${b.kebun} / Afd ${b.afdeling} / ${b.blok} dari data master?`)) return
    const res = await fetch(`/api/master/${b.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menghapus'); return }
    toast.success('Blok dihapus')
    loadRows(); loadFacets()
  }

  async function muatBawaan() {
    const f = facets
    const ada = f && !f.kosong
    if (ada && !confirm(`Data master sudah berisi ${fmt(f!.totalBlok)} blok.\nMuat DB Aresta bawaan akan MENGGABUNGKAN/memperbarui ${fmt(6041)} blok bawaan aplikasi. Lanjutkan?`)) return
    if (!ada && !confirm('Muat DB Aresta bawaan aplikasi (6.041 blok: estate, kebun, afdeling, luas, jumlah pokok) ke server?')) return
    setImpBusy(true)
    try {
      const res = await fetch('/api/master', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sumber: 'bawaan', mode: 'merge' }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal memuat'); return }
      toast.success(`DB Aresta bawaan dimuat: ${fmt(d.masuk)} blok`)
      loadRows(); loadFacets()
    } finally { setImpBusy(false) }
  }

  async function prosesImpor() {
    if (!impText.trim()) { toast.error('Tempel data CSV/JSON atau pilih berkas dulu'); return }
    setImpBusy(true)
    try {
      const res = await fetch('/api/master', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: impText, mode: impMode }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal mengimpor'); return }
      toast.success(`Impor selesai: ${fmt(d.masuk)} blok${d.dihapus ? `, ${fmt(d.dihapus)} baris lama diganti` : ''}`)
      setImpOpen(false); setImpText(''); loadRows(); loadFacets()
    } finally { setImpBusy(false) }
  }

  function onFile(f: File | null) {
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => setImpText(String(rd.result || ''))
    rd.readAsText(f)
  }

  async function unduhCsv() {
    toast.info('Menyiapkan berkas CSV…')
    try {
      const all: BlokRow[] = []
      let p = 1
      while (true) {
        const qp = new URLSearchParams({ page: String(p), limit: '1000' })
        if (fKebun) qp.set('kebun', fKebun)
        if (fAfd) qp.set('afdeling', fAfd)
        if (fQ.trim()) qp.set('q', fQ.trim())
        const res = await fetch(`/api/master?${qp}`)
        const d = await res.json()
        if (!d.ok) throw new Error(d.error)
        all.push(...d.rows)
        if (all.length >= d.total || !d.rows.length) break
        p++
      }
      const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
      const lines = ['Estate;Kebun;Afdeling;Blok;Luas (Ha);Jumlah Pokok']
      for (const r of all) lines.push([r.estate, r.kebun, r.afdeling, r.blok, r.luas ?? '', r.pokok ?? ''].map(esc).join(';'))
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `data-master${fKebun ? '-' + fKebun : ''}.csv`
      a.click(); URL.revokeObjectURL(a.href)
      toast.success(`${fmt(all.length)} blok diunduh sebagai CSV`)
    } catch (e) { toast.error(String((e as Error).message || e)) }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Master (Blok)</h1>
          <p className="text-sm text-muted-foreground">
            {kbScope
              ? `Lingkup kebun ${kbScope} — daftar blok kebun Anda (luas & jumlah pokok). Perubahan di web ikut ke HP saat pengguna menekan “Ambil Data Master”.`
              : 'Daftar blok: estate, kebun, afdeling, luas & jumlah pokok — sama dengan DB di aplikasi. Perubahan di sini otomatis ikut ke HP saat pengguna menekan “Ambil Data Master”.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={unduhCsv}><Download className="h-4 w-4 mr-1.5" /> Unduh CSV</Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImpOpen(true)}><Upload className="h-4 w-4 mr-1.5" /> Impor Data</Button>
              <Button onClick={muatBawaan} disabled={impBusy} className="bg-green-700 hover:bg-green-800">
                <BookOpen className="h-4 w-4 mr-1.5" /> {impBusy ? 'Memuat…' : 'Muat DB Aresta Bawaan'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { l: 'Estate', v: facets ? fmt(facets.totalEstate) : '…' },
          { l: 'Kebun', v: facets ? fmt(facets.totalKebun) : '…' },
          { l: 'Afdeling', v: facets ? fmt(facets.totalAfdeling) : '…' },
          { l: 'Blok', v: facets ? fmt(facets.totalBlok) : '…' },
          { l: 'Luas Total (ha)', v: facets ? fmt2(facets.totalLuas) : '…' },
          { l: 'Jumlah Pokok', v: facets ? fmt(facets.totalPokok) : '…' },
        ].map((k) => (
          <Card key={k.l} className="border-green-100">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="text-lg font-bold text-green-800">{k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {facets?.kosong && isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            <b>Data master masih kosong.</b> Klik <b>Muat DB Aresta Bawaan</b> untuk menyalin database blok
            dari aplikasi (6.041 blok) ke server, atau gunakan <b>Impor Data</b> untuk CSV/JSON milik Anda.
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label className="text-xs">Kebun</Label>
          {kbScope ? (
            <div className="mt-1 flex h-9 items-center rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-800">
              <span className="truncate">{kbScope} (terkunci)</span>
            </div>
          ) : (
            <Select value={fKebun || 'semua'} onValueChange={(v) => { setFKebun(v === 'semua' ? '' : v); setFAfd(''); setPage(1) }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua kebun</SelectItem>
                {facets?.facets.map((f) => (<SelectItem key={f.kebun} value={f.kebun}>{f.kebun}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="w-36">
          <Label className="text-xs">Afdeling</Label>
          <Select value={fAfd || 'semua'} onValueChange={(v) => { setFAfd(v === 'semua' ? '' : v); setPage(1) }}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua</SelectItem>
              {afdOptions.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label className="text-xs">Cari blok</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={fQ} onChange={(e) => { setFQ(e.target.value); setPage(1) }} placeholder="mis. H031" className="pl-8" />
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Segarkan" onClick={() => { loadRows(); loadFacets() }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{facets ? `${fmt(total)} blok (hal. ${page}/${totalPages})` : ''}</span>
      </div>

      {/* Tabel */}
      <Card className="border-green-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estate</TableHead>
                  <TableHead>Kebun</TableHead>
                  <TableHead>Afdeling</TableHead>
                  <TableHead>Blok</TableHead>
                  <TableHead className="text-right">Luas (ha)</TableHead>
                  <TableHead className="text-right">Jumlah Pokok</TableHead>
                  {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows && Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: isAdmin ? 7 : 6 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                ))}
                {rows?.length === 0 && (
                  <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center text-muted-foreground">
                    Tidak ada blok pada filter ini.
                  </TableCell></TableRow>
                )}
                {rows?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.estate}</TableCell>
                    <TableCell><Badge variant="secondary" className="bg-green-50 text-green-800">{r.kebun}</Badge></TableCell>
                    <TableCell>{r.afdeling}</TableCell>
                    <TableCell className="font-medium">{r.blok}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.luas == null ? '-' : fmt2(r.luas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.pokok == null ? '-' : fmt(r.pokok)}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ubah"
                          onClick={() => { setEdit(r); setELuas(r.luas == null ? '' : String(Math.round(r.luas * 100) / 100)); setEPokok(r.pokok == null ? '' : String(r.pokok)) }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label="Hapus" onClick={() => hapusBlok(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
          <span className="text-sm text-muted-foreground">Halaman {page} dari {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya <ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Dialog edit blok */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah Blok {edit?.blok}</DialogTitle>
            <DialogDescription>
              {edit ? `${edit.estate} / Kebun ${edit.kebun} / Afdeling ${edit.afdeling}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lu">Luas (ha)</Label>
              <Input id="lu" type="number" step="0.01" min="0" value={eLuas} onChange={(e) => setELuas(e.target.value)} placeholder="mis. 36.8" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pk">Jumlah pokok</Label>
              <Input id="pk" type="number" step="1" min="0" value={ePokok} onChange={(e) => setEPokok(e.target.value)} placeholder="mis. 2573" />
            </div>
            <p className="text-xs text-muted-foreground">Kosongkan bila tidak ada data. Perubahan otomatis tampil di HP setelah &ldquo;Ambil Data Master&rdquo;.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={simpanEdit} disabled={saving} className="bg-green-700 hover:bg-green-800">{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog impor */}
      <Dialog open={impOpen} onOpenChange={setImpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Impor Data Master</DialogTitle>
            <DialogDescription>
              Unggah berkas CSV atau tempel data. Kolom: <b>Estate; Kebun; Afdeling; Blok; Luas; Jumlah Pokok</b>
              {' '}(header opsional, pemisah titik-koma / koma / tab).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="impfile">Berkas CSV / TXT / JSON</Label>
              <Input id="impfile" type="file" accept=".csv,.txt,.json,.tsv" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imptext">Atau tempel data di sini</Label>
              <textarea
                id="imptext"
                className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                placeholder={'KBM;KBM;1;H031;36.8;2573\nKBM;KBM;1;H032;33.45;864'}
                value={impText}
                onChange={(e) => setImpText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cara impor</Label>
              <Select value={impMode} onValueChange={setImpMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Gabungkan / perbarui (tidak menghapus)</SelectItem>
                  <SelectItem value="replace">Ganti kebun terkait (hapus dulu baris kebun di data baru)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImpOpen(false)}>Batal</Button>
            <Button onClick={prosesImpor} disabled={impBusy || !impText.trim()} className="bg-green-700 hover:bg-green-800">
              {impBusy ? 'Memproses…' : 'Impor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
