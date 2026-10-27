'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Pembatas halaman: hanya SUPERADMIN yang boleh melihat isinya.
 * Dipakai halaman Data Master, Token Perangkat, dan Pengaturan & Log.
 */
export default function GuardSuperAdmin({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setRole(d?.user?.role || null))
      .catch(() => setRole(null))
  }, [])

  if (role === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  if (role !== 'SUPERADMIN') {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
          <h1 className="mt-2 text-lg font-bold text-amber-900">Akses Khusus Super Admin</h1>
          <p className="mt-1 text-sm text-amber-800">
            Menu ini hanya tersedia untuk akun <b>Super Admin</b>.
            {role === 'ADMIN'
              ? ' Akun Anda admin biasa — minta Super Admin untuk menaikkan peran akun bila diperlukan.'
              : ' Hubungi admin/super admin untuk akses.'}
          </p>
          <Button variant="outline" className="mt-3" onClick={() => (window.location.href = '/dashboard')}>
            Kembali ke Ringkasan
          </Button>
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
