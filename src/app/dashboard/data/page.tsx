'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Upload, Download, Link2, Search, RefreshCw, Trash2, Eye, ChevronLeft, ChevronRight, Copy,
} from 'lucide-react'
import { fmtBytes } from '../page'

interface Row {
  id: string; kodeTransaksi: string; tanggal: string; pemeriksa: string;
  estate: string; kebun: string; afdeling: string; blok: string; status: string;
  perangkat: string; sizeBytes: number; createdAt: string; uploadedById: string;
  uploadedBy?: { username: string } | null
}
interface ListData {
  rows: Row[]; total: number; pages: number; seeAll: boolean; canDeleteOwn: boolean
}
interface DetailRow extends Row { record: Record<string, unknown> }
interface ShareItem {
  id: string; token: string; name: string; tanggalFrom: string; tanggalTo: string;
  downloads: number; createdAt: string
}

const emptyFilters = { q: '', tanggalFrom: '', tanggalTo: '', blok: '', pemeriksa: '' }

function statusColor(s: string): string {
  const st = (s || '').toLowerCase()
  if (st.includes('kritis') || st.includes('buruk')) return 'bg-red-100 text-red-800'
  if (st.includes('perhatian') || st.includes('waspada') || st.includes('sedang')) return 'bg-amber-100 text-amber-800'
  if (st) return 'bg-green-100 text-green-800'
  return 'bg-muted text-muted-foreground'
}

export default function DataPage() {
  const [me, setMe] = useState<{ uid: string; role: string } | null>(null)
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

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), take: '25' })
    Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
    fetch(`/api/data?${p}`)
      .then(async (r) => { const d = await r.json(); if (!d.ok) throw new Error(d.error); setData(d) })
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [applied, page])

  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user || null)) }, [])
  useEffect(() => { load() }, [load])

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

  async function doUpload() {
    if (!file) { toast.error('Pilih berkas .json transfer Cek Blok dulu'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/data/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Upload gagal'); return }
      toast.success(`Diterima ${d.diterima} transaksi: ${d.baru} baru, ${d.duplikat} duplikat dilewati`)
      setUploadOpen(false); setFile(null); load()
    } catch {
      toast.error('Tidak bisa terhubung ke server')
    } finally { setUploading(false) }
  }

  function exportUrl() {
    const p = new URLSearchParams()
    Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('foto', withPhoto ? '1' : '0')
    return `/api/data/export?${p}`
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
    load()
  }

  const canDelete = (row: Row) => {
    if (me?.role === 'ADMIN') return true
    if (!data?.canDeleteOwn) return false
    return row.uploadedById === me?.uid
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Pemeriksaan</h1>
          <p className="text-sm text-muted-foreground">
            {data?.seeAll ? 'Semua transaksi dari seluruh perangkat.' : 'Transaksi yang Anda unggah.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setUploadOpen(true)} className="bg-green-700 hover:bg-green-800">
            <Upload className="h-4 w-4 mr-1.5" /> Unggah Berkas
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" /> Unduh Data
          </Button>
          <Button variant="outline" onClick={() => { setShareOpen(true); setShareUrl(''); loadShares() }}>
            <Link2 className="h-4 w-4 mr-1.5" /> Tautan Berbagi
          </Button>
        </div>
      </div>

      <Card className="border-green-100">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="q">Cari</Label>
              <Input id="q" placeholder="kode, pemeriksa, blok…" value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
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

      <Card className="border-green-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Blok / Lokasi</TableHead>
                  <TableHead>Pemeriksa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead>Ukuran</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  [0, 1, 2, 3].map((i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
                {!loading && data?.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.tanggal || '-'}</TableCell>
                    <TableCell><code className="text-xs">{r.kodeTransaksi || '-'}</code></TableCell>
                    <TableCell>
                      <span className="font-medium">{r.blok || '-'}</span>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
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
                    <TableCell className="text-xs whitespace-nowrap">{fmtBytes(r.sizeBytes)}</TableCell>
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
                ))}
                {!loading && data && data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      Belum ada data yang cocok. Unggah berkas transfer dari aplikasi, atau kirim data langsung dari aplikasi (tombol Kirim ke Server).
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

      {/* Dialog Unggah */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unggah Berkas Transfer</DialogTitle>
            <DialogDescription>
              Pilih berkas <code>.json</code> hasil &quot;Kirim Data ke HP Lain&quot; dari aplikasi Cek Blok. Duplikat otomatis dilewati.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".json,application/json" multiple={false} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-muted-foreground">Berkas besar berisi foto membutuhkan waktu beberapa saat.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Batal</Button>
            <Button onClick={doUpload} disabled={!file || uploading} className="bg-green-700 hover:bg-green-800">
              {uploading ? 'Mengunggah…' : 'Unggah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ekspor */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unduh Data (format aplikasi)</DialogTitle>
            <DialogDescription>
              Berkas JSON siap di-gabung di aplikasi Cek Blok mana pun lewat menu &quot;Terima &amp; Gabung Data&quot; — tanpa file manager.
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Batal</Button>
            <Button asChild className="bg-green-700 hover:bg-green-800" onClick={() => setExportOpen(false)}>
              <a href={exportUrl()} download><Download className="h-4 w-4 mr-1.5" /> Unduh Berkas</a>
            </Button>
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
                  ['Sumber perangkat', detail.perangkat],
                  ['Diunggah', new Date(detail.createdAt).toLocaleString('id-ID')],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-medium break-words">{String(v || '-')}</p>
                  </div>
                ))}
              </div>
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
