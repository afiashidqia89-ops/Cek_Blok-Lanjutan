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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { UserPlus, Pencil, Trash2, ShieldCheck, ShieldOff } from 'lucide-react'

interface UserRow {
  id: string; username: string; name: string; role: 'ADMIN' | 'USER'; isActive: boolean;
  createdAt: string; _count: { records: number; tokens: number }
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [me, setMe] = useState<{ uid: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const [addOpen, setAddOpen] = useState(false)
  const [fUsername, setFUsername] = useState('')
  const [fName, setFName] = useState('')
  const [fPassword, setFPassword] = useState('')
  const [fRole, setFRole] = useState('USER')
  const [adding, setAdding] = useState(false)

  const [edit, setEdit] = useState<UserRow | null>(null)
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState('USER')
  const [eActive, setEActive] = useState(true)
  const [ePassword, setEPassword] = useState('')
  const [saving, setSaving] = useState(false)

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
  }, [load])

  async function addUser() {
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fUsername, name: fName, password: fPassword, role: fRole }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal membuat user'); return }
      toast.success(`Pengguna ${fUsername} terdaftar`)
      setAddOpen(false); setFUsername(''); setFName(''); setFPassword(''); setFRole('USER')
      load()
    } finally { setAdding(false) }
  }

  function openEdit(u: UserRow) {
    setEdit(u); setEName(u.name); setERole(u.role); setEActive(u.isActive); setEPassword('')
  }

  async function saveEdit() {
    if (!edit) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name: eName, role: eRole, isActive: eActive }
      if (ePassword) body.password = ePassword
      const res = await fetch(`/api/admin/users/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.error || 'Gagal menyimpan'); return }
      toast.success('Perubahan tersimpan')
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Daftarkan akun baru, atur role, dan aktif/nonaktifkan akses.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-green-700 hover:bg-green-800">
          <UserPlus className="h-4 w-4 mr-1.5" /> Daftarkan Pengguna
        </Button>
      </div>

      <Card className="border-green-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Nama</TableHead>
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
                    {Array.from({ length: 7 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}
                  </TableRow>
                ))}
                {!loading && users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">@{u.username}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}
                        className={u.role === 'ADMIN' ? 'bg-green-700' : ''}>
                        {u.role === 'ADMIN' ? 'Admin' : 'Pengguna'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge className="border-transparent bg-green-100 text-green-800">Aktif</Badge>
                      ) : (
                        <Badge className="border-transparent bg-red-100 text-red-800">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u._count.records}</TableCell>
                    <TableCell>{u._count.tokens}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ubah" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.id !== me?.uid && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label="Hapus" onClick={() => deleteUser(u)}>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Daftarkan Pengguna Baru</DialogTitle>
            <DialogDescription>Akun langsung bisa dipakai untuk login web & sinkronisasi aplikasi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={fRole} onValueChange={setFRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Pengguna biasa</SelectItem>
                  <SelectItem value="ADMIN">Admin (kontrol penuh)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={addUser} disabled={adding || !fUsername || fPassword.length < 6} className="bg-green-700 hover:bg-green-800">
              {adding ? 'Menyimpan…' : 'Daftarkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog edit user */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Pengguna {edit ? `@${edit.username}` : ''}</DialogTitle>
            <DialogDescription>Reset password, ubah role, atau aktif/nonaktifkan akun.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="en">Nama tampilan</Label>
              <Input id="en" value={eName} onChange={(e) => setEName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={eRole} onValueChange={setERole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Pengguna biasa</SelectItem>
                  <SelectItem value="ADMIN">Admin (kontrol penuh)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Akun aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktif = tidak bisa login & sinkron</p>
              </div>
              <Switch checked={eActive} onCheckedChange={setEActive} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep">Password baru (opsional)</Label>
              <Input id="ep" type="password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} placeholder="kosongkan bila tidak diubah" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-green-700 hover:bg-green-800">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-green-700" /> Admin: kontrol penuh (pengguna, data, pengaturan)</span>
        <span className="flex items-center gap-1"><ShieldOff className="h-3.5 w-3.5" /> Pengguna: unggah/unduh data & kelola token sendiri</span>
      </div>
    </div>
  )
}
