'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Database, Map, Layers, KeyRound, Users, Settings, LogOut,
  Menu, X, BarChart3, ChevronRight, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

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
}

const NAV_GRUP: { judul: string; items: NavItem[] }[] = [
  {
    judul: 'Utama',
    items: [
      { href: '/dashboard', label: 'Ringkasan', icon: LayoutDashboard, akses: 'all' },
      { href: '/dashboard/laporan', label: 'Laporan', icon: BarChart3, akses: 'all' },
    ],
  },
  {
    judul: 'Data',
    items: [
      { href: '/dashboard/data', label: 'Data Pemeriksaan', icon: Database, akses: 'all' },
      { href: '/dashboard/peta', label: 'Peta Blok', icon: Map, akses: 'all' },
    ],
  },
  {
    judul: 'Administrasi',
    // Data Master sengaja paling atas — di atas menu Pengguna, Token & Pengaturan/Log
    items: [
      { href: '/dashboard/data-master', label: 'Data Master', icon: Layers, akses: 'super' },
      { href: '/dashboard/users', label: 'Pengguna', icon: Users, akses: 'admin' },
      { href: '/dashboard/tokens', label: 'Token Perangkat', icon: KeyRound, akses: 'super' },
      { href: '/dashboard/settings', label: 'Pengaturan & Log', icon: Settings, akses: 'super' },
    ],
  },
]

function bolehLihat(akses: NavItem['akses'], role: Role): boolean {
  if (akses === 'all') return true
  if (akses === 'admin') return role === 'ADMIN' || role === 'SUPERADMIN'
  return role === 'SUPERADMIN'
}

function NavLinks(pathname: string, role: Role) {
  return NAV_GRUP.map((g) => {
    const items = g.items.filter((n) => bolehLihat(n.akses, role))
    if (!items.length) return null
    return (
      <div key={g.judul} className="space-y-1">
        <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-green-700/60">
          {g.judul}
        </p>
        {items.map((n) => {
          const active = pathname === n.href
          const Icon = n.icon
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'group flex min-h-[42px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-green-700 text-white shadow-sm shadow-green-700/30'
                  : 'text-muted-foreground hover:bg-green-100/70 hover:text-green-900'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-green-700/70 group-hover:text-green-800')} />
              <span className="flex-1">{n.label}</span>
              {active && <ChevronRight className="h-3.5 w-3.5 opacity-80" />}
            </Link>
          )
        })}
      </div>
    )
  })
}

function roleLabel(role: Role): string {
  if (role === 'SUPERADMIN') return 'Super Admin'
  if (role === 'ADMIN') return 'Admin'
  return 'Pengguna'
}

function BadgeKebun({ user, className }: { user: ShellUser; className?: string }) {
  const kb = user.role === 'USER' ? (user.kebun || '').trim() : ''
  if (!kb) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800',
        className
      )}
      title={`Akun ini ditugaskan ke kebun ${kb} — data dibatasi ke kebun ini`}
    >
      <MapPin className="h-3 w-3" /> Kebun {kb}
    </span>
  )
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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-0.5 overflow-y-auto">{NavLinks(pathname, user.role)}</nav>
      <div className="mt-3 rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-3">
        <p className="truncate text-sm font-semibold text-green-900">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username} · {roleLabel(user.role)}
        </p>
        <div className="mt-1.5"><BadgeKebun user={user} /></div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-green-50/70 via-background to-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-2 flex items-center gap-2 text-green-800">
                <Image src="/icon-512.png" alt="" width={28} height={28} className="rounded-lg" />
                {siteTitle}
              </SheetTitle>
              <nav className="space-y-0.5" onClick={() => setMenuOpen(false)}>
                {NavLinks(pathname, user.role)}
              </nav>
              <div className="mt-3 rounded-xl border border-green-100 bg-green-50 p-3">
                <p className="truncate text-sm font-semibold text-green-900">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                <div className="mt-1.5"><BadgeKebun user={user} /></div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-green-800">
            <Image src="/icon-512.png" alt="" width={28} height={28} className="rounded-lg hidden sm:block" />
            <span className="truncate max-w-[180px] sm:max-w-none">{siteTitle}</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <BadgeKebun user={user} className="hidden md:inline-flex" />
            <div className="hidden sm:block text-right leading-tight mr-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                @{user.username} · {roleLabel(user.role)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        {/* Sidebar desktop */}
        <aside className="hidden md:block w-60 shrink-0">
          <div className="sticky top-20">{sidebar}</div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        {siteTitle} — data tersimpan aman di server & dapat diakses dari semua perangkat
      </footer>
    </div>
  )
}
