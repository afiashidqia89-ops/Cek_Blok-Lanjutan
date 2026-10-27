import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, ShieldCheck } from 'lucide-react'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const exp = await db.dataExport.findUnique({ where: { token }, include: { createdBy: { select: { username: true } } } })
  if (!exp || !exp.isActive) notFound()

  const where: Record<string, unknown> = {}
  if (exp.tanggalFrom || exp.tanggalTo) {
    where.tanggal = {}
    if (exp.tanggalFrom) (where.tanggal as Record<string, string>).gte = exp.tanggalFrom
    if (exp.tanggalTo) (where.tanggal as Record<string, string>).lte = exp.tanggalTo
  }
  if (exp.blok) where.blok = { contains: exp.blok }
  if (exp.pemeriksa) where.pemeriksa = { contains: exp.pemeriksa }
  const count = await db.dataRecord.count({ where })

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 via-background to-emerald-50">
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-green-100">
          <CardHeader className="text-center space-y-2">
            <Image src="/icon-512.png" alt="Cek Blok" width={64} height={64} className="mx-auto rounded-xl" />
            <CardTitle className="text-xl text-green-800">{exp.name}</CardTitle>
            <CardDescription>Berkas data pemeriksaan blok siap diunduh</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Jumlah transaksi</p>
                <p className="text-lg font-bold">{count.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Foto temuan</p>
                <p className="text-lg font-bold">{exp.withPhoto ? 'Disertakan' : 'Tidak'}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Periode</p>
                <p className="font-medium">{exp.tanggalFrom || 'awal'} s/d {exp.tanggalTo || 'kini'}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Diunduh</p>
                <p className="font-medium">{exp.downloads}×</p>
              </div>
            </div>
            <Button asChild className="w-full h-12 bg-green-700 hover:bg-green-800">
              <a href={`/api/share/${exp.token}`} download>
                <Download className="h-5 w-5 mr-2" /> Unduh Berkas (.json)
              </a>
            </Button>
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="font-medium mb-1">Cara memasukkan data ke aplikasi Cek Blok:</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-sm">
                <li>Unduh berkas ini (otomatis masuk ke folder Unduhan/Download).</li>
                <li>Buka aplikasi <b>Cek Blok</b>.</li>
                <li>Menu <b>Riwayat → Transfer Data Antar HP → Terima &amp; Gabung Data</b>.</li>
                <li>Pilih berkas yang barusan diunduh — duplikat otomatis dilewati.</li>
              </ol>
            </div>
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-green-700" />
              Tautan dibuat oleh @{exp.createdBy?.username || 'admin'}
            </p>
          </CardContent>
        </Card>
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">Cek Blok Server</Link>
      </footer>
    </div>
  )
}
