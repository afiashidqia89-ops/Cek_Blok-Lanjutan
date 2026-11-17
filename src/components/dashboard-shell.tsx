'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, ClipboardList, Map, Sprout, Users, Settings, LogOut,
  Menu, BarChart3, Search, Bell, ChevronDown,
  MapPin, FileDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { jsonFetch } from '@/lib/api'
import { TombolTema } from '@/components/tombol-tema'

export interface ShellUser {
  uid: string
  username: string
  name: string
  role: 'SUPERADMIN' | 'ADMIN' | 'USER'
  kebun?: string
}

type Role = 'SUPERADMIN' | 'ADMIN' | 'USER'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** akses: 'all' = semua, 'admin' = admin + super admin, 'super' = super admin saja */
  akses: 'all' | 'admin' | 'super'
  /** cara menentukan item aktif */
  aktif?: 'default' | 'ekspor'
}

const NAV_GRUP: { judul?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home, akses: 'all' },
    ],
  },
  {
    judul: 'Data',
    items: [
      { href: '/dashboard/data', label: 'Data Pemeriksaan', icon: ClipboardList, akses: 'all', aktif: 'default' },
      { href: '/dashboard/peta', label: 'Peta Blok', icon: Map, akses: 'all' },
    ],
  },
  {
    judul: 'Laporan',
    items: [
      { href: '/dashboard/laporan', label: 'Rekap & Analitik', icon: BarChart3, akses: 'all' },
    ],
  },
  {
    judul: 'Data Master',
    items: [
      // Data Master (estate/kebun/afdeling/blok) — super admin
      { href: '/dashboard/data-master', label: 'Estate & Kebun', icon: Sprout, akses: 'super' },
      { href: '/dashboard/users', label: 'Pengguna', icon: Users, akses: 'admin' },
    ],
  },
  {
    judul: 'Pengaturan',
    items: [
      // Token Perangkat bukan menu tersendiri — pindah ke dalam halaman Pengaturan (tab "Token Perangkat")
      // Log Aktivitas bukan menu tersendiri — ada di dalam halaman Pengaturan (tab "Log Aktivitas")
      { href: '/dashboard/settings', label: 'Pengaturan', icon: Settings, akses: 'super', aktif: 'default' },
    ],
  },
]

function bolehLihat(akses: NavItem['akses'], role: Role): boolean {
  if (akses === 'all') return true
  if (akses === 'admin') return role === 'ADMIN' || role === 'SUPERADMIN'
  return role === 'SUPERADMIN'
}

/** Logo resmi HPI Sustainable Palm Oil — tampilan bulat (rounded), gambar asli tanpa diubah */
export function LogoBulat({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-hpi.png"
      alt="Logo HPI Sustainable Palm Oil"
      width={256}
      height={256}
      className={cn('shrink-0 select-none object-cover', className)}
    />
  )
}

function isActiveItem(n: NavItem, pathname: string, eksporParam: string): boolean {
  const base = n.href.split('?')[0]
  if (n.aktif === 'ekspor') return pathname === base && eksporParam === '1'
  if (n.aktif === 'default' && base === '/dashboard/data') return pathname === base && eksporParam !== '1'
  if (n.aktif === 'default' && base === '/dashboard/settings') return pathname === base
  if (base === '/dashboard') return pathname === '/dashboard'
  return pathname === base || (pathname.startsWith(base + '/') && base !== '/dashboard')
}

/** Tautan menu untuk sidebar gelap (desktop & panel HP) */
function NavLinks(
  pathname: string,
  role: Role,
  eksporParam: string,
  onKlik?: () => void
) {
  return NAV_GRUP.map((g, gi) => {
    const items = g.items.filter((n) => bolehLihat(n.akses, role))
    if (!items.length) return null
    return (
      <div key={g.judul || gi} className="space-y-1">
        {g.judul && (
          <p className="px-3 pb-0.5 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200/50">
            {g.judul}
          </p>
        )}
        {items.map((n) => {
          const active = isActiveItem(n, pathname, eksporParam)
          const Icon = n.icon
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onKlik}
              className={cn(
                'group flex min-h-[42px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-emerald-500/25 text-white shadow-md shadow-emerald-950/30 ring-1 ring-emerald-400/30'
                  : 'text-emerald-50/75 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-emerald-200/80 group-hover:text-white')} />
              <span className="flex-1 truncate">{n.label}</span>
            </Link>
          )
        })}
      </div>
    )
  })
}

function roleLabel(role: Role): string {
  if (role === 'SUPERADMIN') return 'Super Admin'
  if (role === 'ADMIN') return 'Administrator'
  return 'Pengguna'
}

function inisial(nama: string): string {
  const bag = nama.trim().split(/\s+/).slice(0, 2)
  return bag.map((x) => x[0]?.toUpperCase() || '').join('') || 'U'
}

function BadgeKebun({ user, className }: { user: ShellUser; className?: string }) {
  const kb = user.role === 'USER' ? (user.kebun || '').trim() : ''
  if (!kb) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300',
        className
      )}
      title={`Akun ini ditugaskan ke kebun ${kb} — data dibatasi ke kebun ini`}
    >
      <MapPin className="h-3 w-3" /> Kebun {kb}
    </span>
  )
}

interface StatBell {
  records24h?: number
  logs?: Array<{ id: string; username: string | null; action: string; detail: string; createdAt: string }>
  role?: Role
}

export default function DashboardShell({
  user,
  siteTitle,
  children,
}: {
  user: ShellUser
  siteTitle: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [eksporParam, setEksporParam] = useState('')
  const [cari, setCari] = useState('')
  const [bell, setBell] = useState<StatBell | null>(null)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setEksporParam(sp.get('ekspor') || '')
  }, [pathname])

  // lonceng notifikasi: jumlah data 24 jam terakhir + log terbaru (dipakai juga dropdown)
  useEffect(() => {
    let alive = true
    jsonFetch<StatBell & { ok?: boolean }>('/api/stats')
      .then((d) => { if (alive && d.ok) setBell(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [pathname])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  function kirimCari(e: React.FormEvent) {
    e.preventDefault()
    const q = cari.trim()
    if (!q) return
    router.push(`/dashboard/data?q=${encodeURIComponent(q)}`)
  }

  /** Isi sidebar gelap (dipakai desktop & panel menu HP) */
  function isiSidebar(tutupJuga?: () => void) {
    return (
      <div className="flex h-full flex-col">
        <Link href="/dashboard" onClick={tutupJuga} className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <LogoBulat className="h-10 w-10 rounded-full shadow-lg ring-2 ring-emerald-400/40" />
          <span className="leading-tight">
            <span className="block truncate text-[15px] font-bold text-white">{siteTitle}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
              Pemeriksaan Blok Sawit
            </span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {NavLinks(pathname, user.role, eksporParam, tutupJuga)}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow">
              {inisial(user.name)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
              <span className="block truncate text-[11px] text-emerald-200/80">{roleLabel(user.role)}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 shrink-0 text-emerald-100 hover:bg-white/10 hover:text-white"
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // navigasi bawah untuk HP (web dibuka lewat browser HP)
  const NAV_BAWAH: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: '/dashboard', label: 'Beranda', icon: Home },
    { href: '/dashboard/data', label: 'Data', icon: ClipboardList },
    { href: '/dashboard/peta', label: 'Peta', icon: Map },
    { href: '/dashboard/laporan', label: 'Laporan', icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* ===== Sidebar gelap (desktop) ===== */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[248px] md:block">
        <div className="relative flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#054434_0%,#032d23_58%,#021f19_100%)] text-emerald-50">
          {/* cahaya daun halus di pojok sidebar */}
          <div
            className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.16) 0%, rgba(52,211,153,0) 70%)' }}
          />
          {isiSidebar()}
        </div>
      </aside>

      {/* ===== Panel menu HP ===== */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-0 bg-[#032d23] p-0 text-emerald-50">
          <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
          {isiSidebar(() => setMenuOpen(false))}
        </SheetContent>
      </Sheet>

      {/* ===== Konten ===== */}
      <div className="flex min-h-screen flex-col md:pl-[248px]">
        <header className="sticky top-0 z-40 border-b border-emerald-600/10 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80 dark:border-emerald-400/10">
          <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4">
            {/* Logo kecil di HP (di desktop logo sudah ada di sidebar) */}
            <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
              <LogoBulat className="h-8 w-8 rounded-full ring-1 ring-emerald-600/25 dark:ring-emerald-400/25" />
              <span className="max-w-[130px] truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {siteTitle}
              </span>
            </Link>

            {/* Pencarian global (tengah) */}
            <form onSubmit={kirimCari} className="mx-auto hidden w-full max-w-md lg:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari blok, kebun, afdeling atau pemeriksa..."
                  className="h-10 w-full rounded-full border border-input bg-background pl-10 pr-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-emerald-600/40 focus:ring-2 focus:ring-emerald-600/15"
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1.5">
              {/* Lonceng notifikasi */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Notifikasi">
                    <Bell className="h-5 w-5 text-emerald-900 dark:text-emerald-200" />
                    {!!bell?.records24h && (
                      <span className="absolute -right-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {bell.records24h > 99 ? '99+' : bell.records24h}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifikasi</span>
                    {!!bell?.records24h && (
                      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                        {bell.records24h} data 24 jam terakhir
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto">
                    {(bell?.logs || []).slice(0, 6).map((l) => (
                      <DropdownMenuItem key={l.id} className="flex-col items-start gap-0.5 py-2">
                        <span className="w-full text-sm font-medium">{l.action}</span>
                        <span className="w-full truncate text-xs text-muted-foreground">
                          {l.username || 'sistem'} · {l.detail || '-'}
                        </span>
                      </DropdownMenuItem>
                    ))}
                    {!(bell?.logs || []).length && (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/data" className="flex w-full items-center gap-2 text-emerald-800 dark:text-emerald-300">
                      <FileDown className="h-4 w-4" /> Lihat data terbaru
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Ganti tema terang/gelap */}
              <TombolTema />

              {/* Avatar + menu pengguna */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-emerald-600/10 dark:hover:bg-emerald-400/10"
                    aria-label="Menu pengguna"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-800 text-sm font-bold text-white shadow-sm">
                      {inisial(user.name)}
                    </span>
                    <span className="hidden text-left leading-tight sm:block">
                      <span className="block max-w-[140px] truncate text-sm font-semibold text-emerald-950 dark:text-emerald-100">{user.name}</span>
                      <span className="block text-xs text-muted-foreground">{roleLabel(user.role)}</span>
                    </span>
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs font-normal text-muted-foreground">@{user.username} · {roleLabel(user.role)}</p>
                    <div className="mt-1.5"><BadgeKebun user={user} /></div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700 focus:bg-red-500/10">
                    <LogOut className="h-4 w-4" /> Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-6 md:pb-8">
          <main className="min-w-0">{children}</main>
        </div>

        <footer className="mt-auto border-t border-emerald-600/10 py-4 text-center text-xs text-muted-foreground dark:border-emerald-400/10 md:pb-4">
          {siteTitle} — data tersimpan aman di server & dapat diakses dari semua perangkat
        </footer>
      </div>

      {/* ===== Navigasi bawah (khusus layar HP) ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-600/10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 dark:border-emerald-400/10 md:hidden">
        <div className="grid h-16 grid-cols-5">
          {NAV_BAWAH.map((n) => {
            const active = pathname === n.href
            const Icon = n.icon
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')} />
                {n.label}
              </Link>
            )
          })}
          <button
            onClick={logout}
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <LogOut className="h-5 w-5" />
            Keluar
          </button>
        </div>
      </nav>
    </div>
  )
}
