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
import { Save, ChevronLeft, ChevronRight, KeyRound, Plus, Copy, Trash2, Eye, EyeOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Settings {
  siteTitle: string; siteDesc: string; maxUploadMB: string;
  syncEnabled: string; usersCanSeeAllData: string; usersCanDeleteOwnData: string
}
interface LogRow {
  id: string; username: string | null; action: string; detail: string; createdAt: string
}
interface TokenRow {
  id: string; token: string; label: string; isActive: boolean;
  lastUsedAt: string | null; createdAt: string;
  user?: { username: string; name: string }
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
  // dukung tautan sidebar "Log Aktivitas" -> /dashboard/settings?tab=log
  const [tabAwal, setTabAwal] = useState('pengaturan')

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'log' || t === 'token') setTabAwal(t)
  }, [])

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
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Kontrol penuh server dilakukan dari halaman ini.</p>
      </div>

      <Tabs defaultValue={tabAwal} key={tabAwal}>
        <TabsList>
          <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
          <TabsTrigger value="token">Token Perangkat</TabsTrigger>
          <TabsTrigger value="log">Log Aktivitas</TabsTrigger>
        </TabsList>

        <TabsContent value="pengaturan" className="mt-4">
          {!s ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <div className="space-y-4 max-w-2xl">
              <Card className="border-emerald-600/15">
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

              <Card className="border-emerald-600/15">
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

              <Card className="border-emerald-600/15">
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

              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="token" className="mt-4">
          <TokenPerangkatTab />
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card className="border-emerald-600/15">
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

/** Tab "Token Perangkat" — dipindah dari halaman /dashboard/tokens ke dalam halaman Pengaturan */
function TokenPerangkatTab() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null)
  const [all, setAll] = useState(false)
  const [me, setMe] = useState<{ role: string; uid: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [targetUser, setTargetUser] = useState('me')
  const [users, setUsers] = useState<Array<{ id: string; username: string; name: string }>>([])
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/tokens${all ? '?all=1' : ''}`)
      .then(async (r) => { const d = await r.json(); if (!d.ok) throw new Error(d.error); setTokens(d.tokens); setAll(d.all) })
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [all])

  useEffect(() => {
    load()
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user || null))
  }, [load])

  async function openCreate() {
    setOpen(true); setLabel(''); setTargetUser('me'); setNewToken('')
    if (me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') {
      try {
        const d = await (await fetch('/api/admin/users')).json()
        if (d.ok) setUsers(d.users || [])
      } catch { /* abaikan */ }
    }
  }

  async function create() {
    setCreating(true)
    try {
      const body: Record<string, string> = { label }
      if ((me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') && targetUser !== 'me') body.userId = targetUser
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal membuat token'); return }
      setNewToken(d.token.token)
      load()
    } finally { setCreating(false) }
  }

  async function revoke(t: TokenRow) {
    if (!confirm(`Cabut token "${t.label}"? Perangkat yang memakainya tidak bisa lagi kirim/ambil data.`)) return
    const res = await fetch(`/api/tokens/${t.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal'); return }
    toast.success('Token dicabut')
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Kunci koneksi antara aplikasi Cek Blok di HP dan server ini.
        </p>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> Buat Token
        </Button>
      </div>

      <Card className="border-emerald-600/15 bg-emerald-600/10">
        <CardContent className="p-4 flex gap-3 text-sm">
          <KeyRound className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-emerald-950">Cara memakai di aplikasi Cek Blok:</p>
            <ol className="list-decimal ml-4 text-muted-foreground space-y-0.5">
              <li>Buat token di sini, lalu salin (cbk_…).</li>
              <li>Buka aplikasi Cek Blok (APK atau di <code>/app/</code>), masuk menu <b>Riwayat → Transfer Data Antar HP</b>.</li>
              <li>Buka <b>Server &amp; Token</b>, isi alamat server ini: <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code> dan token-nya.</li>
              <li>Gunakan tombol <b>Kirim ke Server</b> / <b>Ambil dari Server</b> — tanpa file manager.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-600/15">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <p className="text-sm font-medium">{all ? 'Semua token (admin)' : 'Token milik saya'}</p>
            {me?.role === 'ADMIN' && (
              <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
                {all ? 'Lihat milik saya' : 'Lihat semua'}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  {all && <TableHead>Pemilik</TableHead>}
                  <TableHead>Token</TableHead>
                  <TableHead>Terakhir dipakai</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && [0, 1].map((i) => (
                  <TableRow key={i}>
                    {Array.from({ length: all ? 6 : 5 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}
                  </TableRow>
                ))}
                {!loading && tokens?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    {all && <TableCell className="text-sm">@{t.user?.username}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs">{reveal[t.id] ? t.token : t.token.slice(0, 10) + '…'}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Tampilkan/sembunyikan"
                          onClick={() => setReveal((r) => ({ ...r, [t.id]: !r[t.id] }))}>
                          {reveal[t.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Salin"
                          onClick={() => { navigator.clipboard.writeText(t.token); toast.success('Token disalin') }}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString('id-ID') : 'belum pernah'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label="Cabut" onClick={() => revoke(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && tokens && tokens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Belum ada token. Klik &quot;Buat Token&quot; lalu pasang di aplikasi Cek Blok.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buat Token Perangkat</DialogTitle>
            <DialogDescription>Beri nama sesuai HP yang akan dipasangkan, mis. &quot;HP Pengecek 1&quot;.</DialogDescription>
          </DialogHeader>
          {newToken ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-emerald-600/10 p-3">
                <p className="text-sm font-medium text-emerald-950 mb-1">Token berhasil dibuat!</p>
                <code className="text-xs break-all">{newToken}</code>
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => { navigator.clipboard.writeText(newToken); toast.success('Token disalin') }}>
                <Copy className="h-4 w-4 mr-1.5" /> Salin Token
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tl">Label perangkat</Label>
                  <Input id="tl" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mis. HP Pengecek 1" />
                </div>
                {me?.role === 'ADMIN' && (
                  <div className="space-y-1.5">
                    <Label>Pemilik token</Label>
                    <Select value={targetUser} onValueChange={setTargetUser}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="me">Saya sendiri</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>@{u.username} — {u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button onClick={create} disabled={creating || !label.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                  {creating ? 'Membuat…' : 'Buat Token'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
