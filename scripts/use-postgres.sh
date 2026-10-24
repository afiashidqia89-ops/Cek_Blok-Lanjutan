#!/usr/bin/env bash
# Alihkan skema Prisma ke PostgreSQL (untuk deploy Vercel/Netlify + Neon/Supabase).
# Jalankan SETELAH DATABASE_URL di .env menunjuk ke database PostgreSQL Anda.
set -e
cd "$(dirname "$0")/.."

if [ ! -f prisma/schema.prisma ]; then
  echo "prisma/schema.prisma tidak ditemukan"; exit 1
fi

cp prisma/schema.prisma prisma/schema.sqlite.backup.prisma
cp prisma/schema.postgres.prisma prisma/schema.prisma

echo ">> Skema dialihkan ke PostgreSQL (cadangan SQLite: prisma/schema.sqlite.backup.prisma)"
npx prisma generate
npx prisma db push
echo ">> Selesai. Tabel dibuat di PostgreSQL. Jangan lupa buat admin pertama:"
echo "   bun run db:seed   (atau buka https://DOMAIN-ANDA/setup setelah deploy)"
