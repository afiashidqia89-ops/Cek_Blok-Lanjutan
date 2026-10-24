'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Database, Map, Layers, KeyRound, Users, Settings, LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export interface ShellUser {
  uid: string
  username: string
  name: string
  role: 'ADMIN' | 'USER'
}

const NAV = [
  { href: '/dashboard', label: 'Ringkasan', icon: LayoutDashboard, admin: false },
  { href: '/dashboard/data-master', label: 'Data Master', icon: Layers, admin: false },
  { href: '/dashboard/data', label: 'Data Pemeriksaan', icon: Database, admin: false },
  { href: '/dashboard/peta', label: 'Peta Blok', icon: Map, admin: false },
  { href: '/dashboard/tokens', label: 'Token Perangkat', icon: KeyRound, admin: false },
  { href: '/dashboard/users', label: 'Pengguna', icon: Users, admin: true },
  { href: '/dashboard/settings', label: 'Pengaturan & Log', icon: Settings, admin: true },
]

function NavLinks(pathname: string, isAdmin: boolean) {
  return NAV.filter((n) => !n.admin || isAdmin).map((n) => {
    const active = pathname === n.href
    const Icon = n.icon
    return (
      <Link
        key={n.href}
        href={n.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
          active
            ? 'bg-green-700 text-white shadow-sm'
            : 'text-muted-foreground hover:bg-green-100 hover:text-green-900'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {n.label}
      </Link>
    )
  })
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-green-50/60 to-background">
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
              <nav className="space-y-1" onClick={() => setMenuOpen(false)}>
                {NavLinks(pathname, user.role === 'ADMIN')}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-green-800">
            <Image src="/icon-512.png" alt="" width={28} height={28} className="rounded-lg hidden sm:block" />
            <span className="truncate max-w-[180px] sm:max-w-none">{siteTitle}</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block text-right leading-tight mr-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                @{user.username} · {user.role === 'ADMIN' ? 'Admin' : 'Pengguna'}
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
          <nav className="sticky top-20 space-y-1">{NavLinks(pathname, user.role === 'ADMIN')}</nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        {siteTitle} — data tersimpan di server & bisa diakses semua perangkat Anda
      </footer>
    </div>
  )
}
