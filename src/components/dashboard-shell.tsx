'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, ClipboardList, Map, Sprout, Users, KeyRound, Settings, LogOut,
  Menu, BarChart3, Download, ScrollText, Search, Bell, ChevronDown, TreePalm,
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
  aktif?: 'default' | 'log' | 'ekspor'
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
    judul: 'Data Master',
    items: [
      // Data Master (estate/kebun/afdeling/blok) — super admin
      { href: '/dashboard/data-master', label: 'Estate & Kebun', icon: Sprout, akses: 'super' },
      { href: '/dashboard/users', label: 'Pengguna', icon: Users, akses: 'admin' },
    ],
  },
  {
    judul: 'Laporan',
    items: [
      { href: '/dashboard/laporan', label: 'Rekap & Analitik', icon: BarChart3, akses: 'all' },
      { href: '/dashboard/data?ekspor=1', label: 'Ekspor Data', icon: Download, akses: 'all', aktif: 'ekspor' },
    ],
  },
  {
    judul: 'Pengaturan',
    items: [
      { href: '/dashboard/tokens', label: 'Token Perangkat', icon: KeyRound, akses: 'super' },
      { href: '/dashboard/settings', label: 'Pengaturan', icon: Settings, akses: 'super', aktif: 'default' },
      { href: '/dashboard/settings?tab=log', label: 'Log Aktivitas', icon: ScrollText, akses: 'super', aktif: 'log' },
    ],
  },
]

function bolehLihat(akses: NavItem['akses'], role: Role): boolean {
  if (akses === 'all') return true
  if (akses === 'admin') return role === 'ADMIN' || role === 'SUPERADMIN'
  return role === 'SUPERADMIN'
}

/** Logo daun sawit "HPI Sustainable Palm Oil" (SVG inline, mirip desain) */
export function LogoHPI({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <path d="M24 45 C24 32 23.4 22 22.6 15" stroke="#14532d" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23 16 C14 15 8 19.5 5 27 C13.5 26.5 20 23 23 16Z" fill="#16a34a" />
      <path d="M23.4 15.5 C32 13.6 39 17 42.6 24 C34.4 24.6 27.4 21.6 23.4 15.5Z" fill="#15803d" />
      <path d="M23 15 C20.5 8.5 21.5 4 24.5 1.6 C28 5 27.6 10.6 24.4 15.2Z" fill="#22c55e" />
      <path d="M24 17 C29.5 11.6 36 10.6 41 12.6 C37.4 18.6 30 20.6 24 17Z" fill="#16a34a" />
      <path d="M23.6 17.4 C18 12.4 11.6 11.8 7 14 C10.8 19.8 18 21.2 23.6 17.4Z" fill="#15803d" />
    </svg>
  )
}

function LogoLockup({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoHPI className="h-9 w-9 shrink-0" />
      <span className="leading-none">
        <span className="block font-serif text-[22px] font-bold italic tracking-tight text-emerald-800">
          HPI
        </span>
        {subtitle && (
          <span className="block text-[8.5px] font-bold uppercase leading-[1.15] tracking-[0.14em] text-emerald-700">
            Sustainable
            <br />
            Palm Oil
          </span>
        )}
      </span>
    </span>
  )
}

function isActiveItem(n: NavItem, pathname: string, tabParam: string, eksporParam: string): boolean {
  const base = n.href.split('?')[0]
  if (n.aktif === 'log') return pathname === base && tabParam === 'log'
  if (n.aktif === 'ekspor') return pathname === base && eksporParam === '1'
  if (n.aktif === 'default' && base === '/dashboard/data') return pathname === base && eksporParam !== '1'
  if (n.aktif === 'default' && base === '/dashboard/settings') return pathname === base && tabParam !== 'log'
  if (base === '/dashboard') return pathname === '/dashboard'
  return pathname === base || (pathname.startsWith(base + '/') && base !== '/dashboard')
}

function NavLinks(
  pathname: string,
  role: Role,
  tabParam: string,
  eksporParam: string,
  onKlik?: () => void
) {
  return NAV_GRUP.map((g, gi) => {
    const items = g.items.filter((n) => bolehLihat(n.akses, role))
    if (!items.length) return null
    return (
      <div key={g.judul || gi} className="space-y-1">
        {g.judul && (
          <p className="px-3 pb-0.5 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700/60">
            {g.judul}
          </p>
        )}
        {items.map((n) => {
          const active = isActiveItem(n, pathname, tabParam, eksporParam)
          const Icon = n.icon
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onKlik}
              className={cn(
                'group flex min-h-[42px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-emerald-800 text-white shadow-md shadow-emerald-800/25'
                  : 'text-emerald-950/75 hover:bg-emerald-600/10 hover:text-emerald-900'
              )}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-emerald-700/80 group-hover:text-emerald-800')} />
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
        'inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800',
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
  const [tabParam, setTabParam] = useState('')
  const [eksporParam, setEksporParam] = useState('')
  const [cari, setCari] = useState('')
  const [bell, setBell] = useState<StatBell | null>(null)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setTabParam(sp.get('tab') || '')
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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2 pt-1">
        <LogoLockup subtitle />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto pb-2">{NavLinks(pathname, user.role, tabParam, eksporParam)}</nav>
      <div className="relative mt-2 overflow-hidden rounded-xl border border-emerald-600/15 bg-gradient-to-br from-emerald-50 to-white p-3">
        <TreePalm className="absolute -bottom-3 -right-3 h-16 w-16 text-emerald-600/10" />
        <p className="truncate text-sm font-semibold text-emerald-900">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username} · {roleLabel(user.role)}
        </p>
        <div className="mt-1.5"><BadgeKebun user={user} /></div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-emerald-600/10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-1">
                <LogoLockup subtitle />
              </SheetTitle>
              <nav className="space-y-0.5" onClick={() => setMenuOpen(false)}>
                {NavLinks(pathname, user.role, tabParam, eksporParam, () => setMenuOpen(false))}
              </nav>
              <div className="mt-3 rounded-xl border border-emerald-600/15 bg-emerald-50 p-3">
                <p className="truncate text-sm font-semibold text-emerald-900">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                <div className="mt-1.5"><BadgeKebun user={user} /></div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-emerald-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-800 text-white shadow-sm">
              <TreePalm className="h-5 w-5" />
            </span>
            <span className="truncate text-lg max-w-[150px] sm:max-w-none">{siteTitle}</span>
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
                  <Bell className="h-5 w-5 text-emerald-900" />
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
                    <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
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
                  <Link href="/dashboard/data" className="flex w-full items-center gap-2 text-emerald-800">
                    <FileDown className="h-4 w-4" /> Lihat data terbaru
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Avatar + menu pengguna */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-emerald-600/10"
                  aria-label="Menu pengguna"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-800 text-sm font-bold text-white shadow-sm">
                    {inisial(user.name)}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block max-w-[140px] truncate text-sm font-semibold text-emerald-950">{user.name}</span>
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

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-6 px-4 py-6">
        {/* Sidebar desktop */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">{sidebar}</div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="mt-auto border-t border-emerald-600/10 py-4 text-center text-xs text-muted-foreground">
        {siteTitle} — data tersimpan aman di server & dapat diakses dari semua perangkat
      </footer>
    </div>
  )
}
