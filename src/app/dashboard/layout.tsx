import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import DashboardShell from '@/components/dashboard-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession()
  if (!s) redirect('/login')
  const settings = await getSettings()
  return (
    <DashboardShell
      user={{ uid: s.uid, username: s.username, name: s.name, role: s.role, kebun: s.kebun }}
      siteTitle={settings.siteTitle || 'Cek Blok Server'}
    >
      {children}
    </DashboardShell>
  )
}
