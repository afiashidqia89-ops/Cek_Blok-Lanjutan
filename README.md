# Cek Blok Server

Server (backend + web admin) untuk aplikasi **Cek Blok** (Pemeriksaan Kondisi Blok).
Mendukung login username/password, akun admin dengan kontrol penuh, upload/download
data dari/ke aplikasi, dan sinkronisasi antar HP **tanpa file manager**.

## Fitur

| # | Fitur | Status |
|---|-------|--------|
| 1 | Login username & password (sesi JWT, cookie httpOnly) | ✅ |
| 2 | Akun ADMIN kontrol penuh: pengguna, pengaturan, log aktivitas — semua dari web | ✅ |
| 3 | Upload/download data aplikasi ↔ server (API + halaman web) | ✅ |
| 4 | Hosting gratis tanpa kartu kredit (Vercel + Neon, alternatif: Netlify/Cloudflare/Koyeb) | ✅ |
| 5 | Admin bisa mendaftarkan user baru dari web | ✅ |
| 6 | Terima data langsung di aplikasi Cek Blok tanpa file manager (tombol **Kirim/Ambil dari Server**) | ✅ |

## Cara Kerja Singkat

1. Admin membuka web → login → menu **Pengguna** mendaftarkan akun tim.
2. User/admin membuat **Token Perangkat** (`cbk_...`) per HP.
3. Di aplikasi Cek Blok (APK atau versi web di `/app/`), buka
   **Riwayat → Data Report → Sinkronisasi Server → ⚙️ Server & Token**,
   isi alamat server + token.
4. Tombol **☁️ Kirim ke Server** mengunggah semua transaksi (duplikat otomatis dilewati).
   Tombol **⬇️ Ambil dari Server** menggabungkan data dari server langsung ke aplikasi —
   **penerima tidak perlu file manager**.
5. Admin dapat mengunduh data (format berkas transfer .json yang bisa di-gabung di aplikasi
   mana pun lewat menu *Terima & Gabung Data*), membuat **tautan berbagi** untuk WhatsApp,
   dan memantau semuanya dari web.

## Struktur Proyek

```
├─ prisma/
│  ├─ schema.prisma              # Skema DB (SQLite utk development lokal)
│  ├─ schema.postgres.prisma     # Skema DB (PostgreSQL utk deploy serverless)
│  └─ seed.ts                    # Buat admin pertama + pengaturan default
├─ src/
│  ├─ proxy.ts                   # Penjaga rute (login wajib utk /dashboard)
│  ├─ app/
│  │  ├─ login, setup            # Halaman publik
│  │  ├─ dashboard/              # Ringkasan, Data, Token, Pengguna, Pengaturan
│  │  ├─ share/[token]/          # Halaman unduhan tautan berbagi (publik)
│  │  └─ api/                    # auth, admin, data, share, sync (lihat docs/)
├─ public/app/                   # Aplikasi Cek Blok versi web (sudah dipatch integrasi server)
├─ .github/workflows/
│  ├─ ci.yml                     # Cek lint + build tiap push
│  └─ db-migrate.yml             # Buat tabel database lewat tombol di tab Actions
├─ scripts/
│  ├─ patch_apk.py               # Regenerasi public/app/index.html dari APK baru
│  ├─ use-postgres.sh            # Alihkan skema ke PostgreSQL utk deploy
│  └─ test_api.sh                # Uji end-to-end API
└─ docs/
   ├─ PANDUAN-DEPLOY-GITHUB.md   # Deploy 100% gratis tanpa kartu kredit
   ├─ API-DOKUMENTASI.md         # Referensi API (integrasi aplikasi)
   └─ PANDUAN-APLIKASI-CEK-BLOK.md  # Cara pakai + rebuild APK
```

## Menjalankan di Komputer (Development)

```bash
bun install                # atau npm install
cp .env.example .env       # sesuaikan DATABASE_URL bila perlu
bun run db:push            # buat tabel
bun run db:seed            # buat admin: admin / admin123
bun run dev                # buka http://localhost:3000
```

> **Wajib ganti password admin** setelah login pertama (menu Pengguna).

## Deploy 100% Lewat GitHub (gratis, tanpa kartu kredit)

Panduan lengkap langkah-demi-langkah: **[docs/PANDUAN-DEPLOY-GITHUB.md](docs/PANDUAN-DEPLOY-GITHUB.md)**

Semua bisa dikerjakan **hanya dari browser**: unggah ZIP ke repo GitHub → buat
tabel database lewat **tombol Actions** (workflow bawaan repo) → import repo ke
Vercel → selesai. Stack: **GitHub (kode) + Neon (database) + Vercel (aplikasi)** —
login ketiganya bisa memakai satu akun GitHub, tanpa kartu kredit.

Setiap perubahan kode di GitHub (edit via web/codespace) → otomatis deploy ulang.

## Dokumentasi Lain

- [docs/PANDUAN-LENGKAP-PEMULA.md](docs/PANDUAN-LENGKAP-PEMULA.md) — **panduan paling detail
  untuk pemula** (setiap klik dijelaskan, + troubleshooting) — versi PDF tersedia terpisah
- [docs/API-DOKUMENTASI.md](docs/API-DOKUMENTASI.md) — referensi endpoint API sinkronisasi
- [docs/PANDUAN-APLIKASI-CEK-BLOK.md](docs/PANDUAN-APLIKASI-CEK-BLOK.md) —
  penggunaan fitur Kirim/Ambil dari Server + cara memasukkan patch ke APK
