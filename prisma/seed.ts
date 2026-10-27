/**
 * Seed database: buat akun ADMIN pertama + pengaturan default.
 * Jalankan: bun run db:seed
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEFAULT_SETTINGS: Record<string, string> = {
  siteTitle: 'Cek Blok Server',
  siteDesc: 'Server sinkronisasi data pemeriksaan kondisi blok',
  maxUploadMB: '25',
  syncEnabled: '1',
  usersCanSeeAllData: '1',
  usersCanDeleteOwnData: '1',
}

async function main() {
  const adminUser = process.env.SEED_ADMIN_USER || 'admin'
  const adminPass = process.env.SEED_ADMIN_PASS || 'admin123'

  const count = await prisma.user.count()
  if (count === 0) {
    const passwordHash = await bcrypt.hash(adminPass, 10)
    await prisma.user.create({
      data: {
        username: adminUser,
        name: 'Administrator',
        passwordHash,
        role: 'ADMIN',
      },
    })
    console.log(`Akun admin dibuat -> username: ${adminUser} | password: ${adminPass}`)
    console.log('PENTING: segera ganti password melalui menu Pengguna setelah login!')
  } else {
    console.log('Database sudah berisi user, seed admin dilewati.')
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
  console.log('Pengaturan default siap.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
