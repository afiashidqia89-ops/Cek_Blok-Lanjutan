'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Save, ChevronLeft, ChevronRight } from 'lucide-react'

interface Settings {
  siteTitle: string; siteDesc: string; maxUploadMB: string;
  syncEnabled: string; usersCanSeeAllData: string; usersCanDeleteOwnData: string
}
interface LogRow {
  id: string; username: string | null; action: string; detail: string; createdAt: string
}

import GuardSuperAdmin from '@/components/guard-superadmin'

export default function SettingsPage() {
  return (
    <GuardSuperAdmin>
      <SettingsIsi />
    </GuardSuperAdmin>
  )
}

function SettingsIsi() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  const [logs, setLogs] = useState<LogRow[] | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(async (r) => { const d = await r.json(); if (!d.ok) throw new Error(d.error); setS(d.settings) })
      .catch((e) => toast.error(String(e.message || e)))
  }, [])

  const loadLogs = useCallback(() => {
    fetch(`/api/admin/logs?page=${page}`)
      .then(async (r) => { const d = await r.json(); if (!d.ok) throw new Error(d.error); setLogs(d.logs); setPages(d.pages) })
      .catch((e) => toast.error(String(e.message || e)))
  }, [page])

  useEffect(() => { loadLogs() }, [loadLogs])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menyimpan'); return }
      toast.success('Pengaturan tersimpan')
    } finally { setSaving(false) }
  }

  const on = (v?: string) => v === '1'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan &amp; Log</h1>
        <p className="text-sm text-muted-foreground">Kontrol penuh server dilakukan dari halaman ini.</p>
      </div>

      <Tabs defaultValue="pengaturan">
        <TabsList>
          <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
          <TabsTrigger value="log">Log Aktivitas</TabsTrigger>
        </TabsList>

        <TabsContent value="pengaturan" className="mt-4">
          {!s ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <div className="space-y-4 max-w-2xl">
              <Card className="border-green-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Identitas Server</CardTitle>
                  <CardDescription>Tampilan nama server pada web & aplikasi</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="st">Nama server</Label>
                    <Input id="st" value={s.siteTitle} onChange={(e) => setS({ ...s, siteTitle: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sd">Deskripsi</Label>
                    <Input id="sd" value={s.siteDesc} onChange={(e) => setS({ ...s, siteDesc: e.target.value })} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sinkronisasi Aplikasi</CardTitle>
                  <CardDescription>Upload/download data dari aplikasi Cek Blok di HP</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>Aktifkan sinkronisasi</Label>
                      <p className="text-xs text-muted-foreground">Bila mati, Kirim/Ambil dari Server ditolak sementara</p>
                    </div>
                    <Switch checked={on(s.syncEnabled)} onCheckedChange={(v) => setS({ ...s, syncEnabled: v ? '1' : '0' })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mu">Ukuran maksimal upload (MB)</Label>
                    <Input id="mu" type="number" min={1} max={200} value={s.maxUploadMB}
                      onChange={(e) => setS({ ...s, maxUploadMB: e.target.value })} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Hak Pengguna</CardTitle>
                  <CardDescription>Aturan akses untuk pengguna biasa (bukan admin)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>Lihat semua data</Label>
                      <p className="text-xs text-muted-foreground">Pengguna bisa melihat & mengunduh semua transaksi (bukan hanya miliknya)</p>
                    </div>
                    <Switch checked={on(s.usersCanSeeAllData)} onCheckedChange={(v) => setS({ ...s, usersCanSeeAllData: v ? '1' : '0' })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>Hapus data sendiri</Label>
                      <p className="text-xs text-muted-foreground">Pengguna boleh menghapus transaksi yang dia unggah sendiri</p>
                    </div>
                    <Switch checked={on(s.usersCanDeleteOwnData)} onCheckedChange={(v) => setS({ ...s, usersCanDeleteOwnData: v ? '1' : '0' })} />
                  </div>
                </CardContent>
              </Card>

              <Button onClick={save} disabled={saving} className="bg-green-700 hover:bg-green-800">
                <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card className="border-green-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Pengguna</TableHead>
                      <TableHead>Aksi</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!logs && [0, 1, 2].map((i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}
                      </TableRow>
                    ))}
                    {logs?.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(l.createdAt).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-sm">{l.username ? `@${l.username}` : '-'}</TableCell>
                        <TableCell><span className="font-medium text-sm">{l.action}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.detail || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {logs && logs.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada log.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between border-t p-3">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">Halaman {page} dari {pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
