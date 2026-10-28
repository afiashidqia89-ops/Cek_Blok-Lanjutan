'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { UserPlus, Pencil, Trash2, ShieldCheck, ShieldOff } from 'lucide-react'

type Role = 'SUPERADMIN' | 'ADMIN' | 'USER'

interface UserRow {
  id: string; username: string; name: string; role: Role; isActive: boolean
  estate: string; kebun: string; afdeling: string
  createdAt: string; _count: { records: number; tokens: number }
}
interface Facet { kebun: string; estate: string; afdelings: string[] }

const roleLabel = (r: Role) => (r === 'SUPERADMIN' ? 'Super Admin' : r === 'ADMIN' ? 'Admin' : 'Pengguna')
const splitList = (s?: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)

/** Panel ceklis bertingkat: Estate → Kebun → Afdeling (bisa pilih lebih dari satu) */
function CeklisLingkup({
  facets,
  selEstate, setSelEstate,
  selKebun, setSelKebun,
  selAfd, setSelAfd,
}: {
  facets: Facet[]
  selEstate: string[]; setSelEstate: (v: string[]) => void
  selKebun: string[]; setSelKebun: (v: string[]) => void
  selAfd: string[]; setSelAfd: (v: string[]) => void
}) {
  const estates = useMemo(() => [...new Set(facets.map((f) => f.estate).filter(Boolean))].sort(), [facets])
  const kebunByEstate = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const f of facets) {
      if (!f.estate) continue
      const arr = m.get(f.estate) || []
      arr.push(f.kebun)
      m.set(f.estate, arr)
    }
    for (const [k, v] of m) m.set(k, [...new Set(v)].sort())
    return m
  }, [facets])

  const daftarKebun = useMemo(() => {
    if (selEstate.length) return facets.filter((f) => selEstate.includes(f.estate)).map((f) => f.kebun)
    return facets.map((f) => f.kebun)
  }, [facets, selEstate])

  const daftarAfd = useMemo(() => {
    const src = selKebun.length ? facets.filter((f) => selKebun.includes(f.kebun)) : selEstate.length ? facets.filter((f) => selEstate.includes(f.estate)) : facets
    return [...new Set(src.flatMap((f) => f.afdelings || []))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [facets, selKebun, selEstate])

  const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  if (!facets.length) {
    return (
      <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
        Daftar estate/kebun/afdeling belum tersedia — muat <b>Data Master</b> dulu (menu Data Master → Muat DB Aresta Bawaan).
        Tanpa penugasan, user ini dapat melihat semua data.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs font-semibold">Estate</Label>
            <button type="button" className="text-[11px] text-emerald-300 hover:underline"
              onClick={() => { setSelEstate([]); setSelKebun([]); setSelAfd([]) }}>Semua / bersihkan</button>
          </div>
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {estates.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selEstate.includes(e)} onCheckedChange={() => { const n = tog(selEstate, e); setSelEstate(n); setSelKebun([]); setSelAfd([]) }} />
                <span className="truncate">{e}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-md border p-2.5">
          <Label className="text-xs font-semibold mb-1.5 block">Kebun {selEstate.length ? `(estate ${selEstate.join(', ')})` : ''}</Label>
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {daftarKebun.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selKebun.includes(k)} onCheckedChange={() => { const n = tog(selKebun, k); setSelKebun(n); setSelAfd([]) }} />
                <span className="truncate">{k}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-md border p-2.5">
          <Label className="text-xs font-semibold mb-1.5 block">Afdeling</Label>
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {daftarAfd.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selAfd.includes(a)} onCheckedChange={() => setSelAfd(tog(selAfd, a))} />
                <span className="truncate">{a}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Kosongkan semua ceklis = <b>tanpa batasan</b> (melihat semua data). Kalau dipilih, user hanya melihat
        blok &amp; transaksi pada ceklis tersebut — di web maupun di aplikasi HP.
      </p>
    </div>
  )
}

function LingkupBadges({ u }: { u: Pick<UserRow, 'estate' | 'kebun' | 'afdeling' | 'role'> }) {
  if (u.role !== 'USER') return <span className="text-xs text-muted-foreground">Semua data</span>
  const e = splitList(u.estate)
  const k = splitList(u.kebun)
  const a = splitList(u.afdeling)
  if (!e.length && !k.length && !a.length) return <span className="text-xs text-muted-foreground">Semua data</span>
  return (
    <div className="flex flex-wrap gap-1">
      {e.map((x) => <Badge key={`e${x}`} variant="secondary" className="bg-emerald-500/10 text-emerald-300 text-[10px]">Estate {x}</Badge>)}
      {k.map((x) => <Badge key={`k${x}`} variant="secondary" className="bg-emerald-500/10 text-emerald-200 text-[10px]">Kebun {x}</Badge>)}
      {a.map((x) => <Badge key={`a${x}`} variant="secondary" className="bg-lime-500/15 text-lime-300 text-[10px]">Afd {x}</Badge>)}
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [me, setMe] = useState<{ uid: string; role: Role } | null>(null)
  const [loading, setLoading] = useState(true)

  const [addOpen, setAddOpen] = useState(false)
  const [fUsername, setFUsername] = useState('')
  const [fName, setFName] = useState('')
  const [fPassword, setFPassword] = useState('')
  const [fRole, setFRole] = useState<'USER' | 'ADMIN'>('USER')
  const [fEstate, setFEstate] = useState<string[]>([])
  const [fKebun, setFKebun] = useState<string[]>([])
  const [fAfd, setFAfd] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const [edit, setEdit] = useState<UserRow | null>(null)
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState<Role>('USER')
  const [eActive, setEActive] = useState(true)
  const [ePassword, setEPassword] = useState('')
  const [eEstate, setEEstate] = useState<string[]>([])
  const [eKebun, setEKebun] = useState<string[]>([])
  const [eAfd, setEAfd] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [kebunOpts, setKebunOpts] = useState<Facet[]>([])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/users')
      .then(async (r) => { const d = await r.json(); if (!d.ok) throw new Error(d.error); setUsers(d.users) })
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user || null))
    // daftar estate/kebun/afdeling untuk ceklis penugasan (dari Data Master)
    fetch('/api/master?facets=1').then((r) => r.json()).then((d) => {
      if (d.ok) setKebunOpts(d.facets || [])
    }).catch(() => {})
  }, [load])

  async function addUser() {
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fUsername, name: fName, password: fPassword, role: fRole, estate: fEstate, kebun: fKebun, afdeling: fAfd }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal membuat user'); return }
      toast.success(`Pengguna ${fUsername} terdaftar`)
      setAddOpen(false); setFUsername(''); setFName(''); setFPassword(''); setFRole('USER'); setFEstate([]); setFKebun([]); setFAfd([])
      load()
    } finally { setAdding(false) }
  }

  function openEdit(u: UserRow) {
    setEdit(u); setEName(u.name); setERole(u.role); setEActive(u.isActive); setEPassword('')
    setEEstate(splitList(u.estate)); setEKebun(splitList(u.kebun)); setEAfd(splitList(u.afdeling))
  }

  async function saveEdit() {
    if (!edit) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name: eName, role: eRole, isActive: eActive, estate: eEstate, kebun: eKebun, afdeling: eAfd }
      if (ePassword) body.password = ePassword
      const res = await fetch(`/api/admin/users/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menyimpan'); return }
      toast.success('Perubahan tersimpan — lingkup data user ini langsung berlaku di web & HP')
      setEdit(null); load()
    } finally { setSaving(false) }
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`Hapus pengguna "${u.username}"? Data pemeriksaannya tetap tersimpan di server.`)) return
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menghapus'); return }
    toast.success('Pengguna dihapus')
    load()
  }

  const superadmin = me?.role === 'SUPERADMIN'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Daftarkan akun + ceklis estate/kebun/afdelingnya — data web &amp; HP otomatis menyesuaikan.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="h-4 w-4 mr-1.5" /> Daftarkan Pengguna
        </Button>
      </div>

      <Card className="border-emerald-500/20">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Estate / Kebun / Afdeling</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}
                  </TableRow>
                ))}
                {!loading && users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">@{u.username}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="max-w-[260px]"><LingkupBadges u={u} /></TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'USER' ? 'secondary' : 'default'}
                        className={u.role === 'USER' ? '' : 'bg-emerald-600'}>
                        {roleLabel(u.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge className="border-transparent bg-emerald-500/15 text-emerald-200">Aktif</Badge>
                      ) : (
                        <Badge className="border-transparent bg-red-500/15 text-red-300">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u._count.records}</TableCell>
                    <TableCell>{u._count.tokens}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ubah" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {superadmin && u.id !== me?.uid && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" aria-label="Hapus" onClick={() => deleteUser(u)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog daftarkan user */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Daftarkan Pengguna Baru</DialogTitle>
            <DialogDescription>Akun langsung bisa dipakai untuk login web &amp; sinkronisasi aplikasi HP.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="nu">Username</Label>
                <Input id="nu" value={fUsername} onChange={(e) => setFUsername(e.target.value)} placeholder="mis. pengecek1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nn">Nama tampilan</Label>
                <Input id="nn" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="mis. Budi Santoso" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np">Password</Label>
                <Input id="np" type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Penugasan lingkup data (ceklis — boleh lebih dari satu)</Label>
              <CeklisLingkup facets={kebunOpts} selEstate={fEstate} setSelEstate={setFEstate} selKebun={fKebun} setSelKebun={setFKebun} selAfd={fAfd} setSelAfd={setFAfd} />
            </div>
            <div className="space-y-1.5 sm:w-64">
              <Label>Role</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={fRole}
                onChange={(e) => setFRole(e.target.value as 'USER' | 'ADMIN')}
              >
                <option value="USER">Pengguna biasa</option>
                {superadmin && <option value="ADMIN">Admin</option>}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={addUser} disabled={adding || !fUsername || fPassword.length < 6} className="bg-emerald-600 hover:bg-emerald-700">
              {adding ? 'Menyimpan…' : 'Daftarkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog edit user */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ubah Pengguna {edit ? `@${edit.username}` : ''}</DialogTitle>
            <DialogDescription>Reset password, ubah peran, ceklis penugasan, atau aktif/nonaktifkan akun.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="en">Nama tampilan</Label>
                <Input id="en" value={eName} onChange={(e) => setEName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={eRole}
                  disabled={!superadmin || edit?.id === me?.uid}
                  onChange={(e) => setERole(e.target.value as Role)}
                >
                  <option value="USER">Pengguna biasa</option>
                  <option value="ADMIN">Admin</option>
                  {superadmin && <option value="SUPERADMIN">Super Admin</option>}
                </select>
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Penugasan lingkup data (ceklis — boleh lebih dari satu)</Label>
              <CeklisLingkup facets={kebunOpts} selEstate={eEstate} setSelEstate={setEEstate} selKebun={eKebun} setSelKebun={setEKebun} selAfd={eAfd} setSelAfd={setEAfd} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Akun aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktif = tidak bisa login &amp; sinkron</p>
              </div>
              <Switch checked={eActive} onCheckedChange={setEActive} disabled={!superadmin && edit?.role === 'SUPERADMIN'} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep">Password baru (opsional)</Label>
              <Input id="ep" type="password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} placeholder="kosongkan bila tidak diubah" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Super Admin: Data Master, Token, Pengaturan &amp; Log, peran akun</span>
        <span className="flex items-center gap-1"><ShieldOff className="h-3.5 w-3.5" /> Pengguna: data sesuai ceklis penugasannya</span>
      </div>
    </div>
  )
}
