# Panduan Deploy 100% Lewat GitHub (gratis, tanpa kartu kredit)

Seluruh proyek ini bisa dikerjakan **mulai sampai selesai hanya dari browser**:
kode disimpan di **GitHub**, database gratis di **Neon** (login pakai akun GitHub),
dan aplikasi dijalankan **Vercel** (login pakai akun GitHub). Tidak ada satu pun
layanan yang meminta kartu kredit, dan tidak perlu memasang git/Node.js di komputer.

## Ringkasan Peran Tiap Layanan

| Layanan | Peran | Kartu Kredit | Catatan |
|---|---|---|---|
| **GitHub** | Kode + membuat tabel database (tombol Actions) | ❌ Tidak | Pusat proyek — semua perubahan lewat sini |
| **Neon** | Database PostgreSQL | ❌ Tidak | Gratis 0,5 GB, login pakai akun GitHub |
| **Vercel** (Hobby) | Menjalankan web admin + API | ❌ Tidak | Otomatis deploy ulang tiap repo berubah |
| Netlify / Cloudflare / Koyeb | Alternatif Vercel | ❌ Tidak | Lihat bagian F di bawah |

> Mengapa perlu PostgreSQL (Neon)? Karena hosting serverless tidak punya penyimpanan
> file permanen, jadi SQLite hanya untuk komputer sendiri.

---

## A. Alur Utama: 100% Lewat GitHub (semua di browser, ± 25 menit)

### Langkah 1 — Buat repo dan unggah proyek ke GitHub

1. Buat repo baru: **GitHub → tombol `+` kanan atas → New repository**
   → nama mis. `cek-blok-server` → pilih **Private** → **Create repository**.
2. Di halaman repo yang masih kosong, klik link **"uploading an existing file"**.
3. **Unggah berkas ZIP proyek** (`cek-blok-server-github.zip`) — cukup 1 file ini,
   tidak perlu diekstrak dulu — lalu klik **Commit changes**.
4. Buka **GitHub Codespaces** (masih di GitHub, tab baru):
   - Klik tombol hijau **`<> Code`** → tab **Codespaces** → **Create codespace on main**.
   - Tunggu sampai editor terbuka di browser (± 30 detik).
   - Di kotak terminal bagian bawah, tempel (paste) lalu Enter:
     ```bash
     unzip -o cek-blok-server-github.zip -d . && rm -f cek-blok-server-github.zip worklog.md
     git add -A && git commit -m "Cek Blok Server" && git push
     ```
   - Selesai — seluruh isi proyek (172 file) sudah masuk repo. Codespace boleh
     ditutup (menu `...` → Stop) atau dihapus.

> **Cara alternatif tanpa Codespace:** klik "uploading an existing file" lalu
> seret isi folder hasil ekstrak ZIP per kelompok (batas unggah web ± 100 file per
> tarikan, jadi 2–3 kali: folder `src`, lalu `public` + `prisma` + `scripts` + `docs`
> + `.github`, lalu file di akar). Struktur folder ikut tersimpan.

### Langkah 2 — Buat database gratis di Neon

1. Buka [neon.tech](https://neon.tech) → **Sign up with GitHub** (tanpa kartu kredit).
2. Buat project baru, misal `cek-blok` → region bebas (pilih **Singapore** agar cepat).
3. Salin **Connection string** (bentuknya
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`).

### Langkah 3 — Simpan koneksi database sebagai Secret di GitHub

1. Di repo GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Klik **New repository secret**:
   - Name: `DATABASE_URL`
   - Secret: tempel connection string Neon dari Langkah 2.

### Langkah 4 — Buat semua tabel dengan satu klik (tanpa terminal)

1. Di repo GitHub → tab **Actions** → kiri pilih
   **"Terapkan Skema Database (Postgres)"**.
2. Klik **Run workflow** → **Run workflow** (tidak perlu centang "paksa").
3. Tunggu ± 2 menit sampai muncul **centang hijau** ✅ — semua tabel sudah jadi
   di Neon. (Ini menggantikan perintah `use-postgres.sh` — tidak perlu komputer.)

### Langkah 5 — Deploy aplikasi di Vercel

1. Buka [vercel.com](https://vercel.com) → **Sign Up with GitHub**.
2. **Add New → Project** → pilih repo `cek-blok-server` → **Import**.
3. Sebelum klik Deploy, buka **Environment Variables** dan isi 2 baris:

   | Nama | Isi |
   |---|---|
   | `DATABASE_URL` | connection string Neon (sama dengan Langkah 3) |
   | `JWT_SECRET` | kunci rahasia acak — buat di browser lewat situs generator
     password (mis. 40+ karakter huruf-angka acak), salin hasilnya ke sini |

4. Klik **Deploy** → tunggu ± 2 menit → dapat alamat seperti
   `https://cek-blok-server.vercel.app`.

### Langkah 6 — Buat akun admin pertama

1. Buka `https://ALAMAT-VERCEL-ANDA/setup` → isi username & password →
   **Buat Akun Admin**.
2. Login di `/login` → menu **Pengguna** → **ganti password admin** segera.

### Langkah 7 — Selesai ✅

- Web admin: `https://ALAMAT-VERCEL-ANDA/login`
- Aplikasi Cek Blok versi web: `https://ALAMAT-VERCEL-ANDA/app/`
- Alamat server yang diisi di aplikasi HP: `https://ALAMAT-VERCEL-ANDA`

**Rutinitas berikutnya:** mau mengubah kode? Edit langsung di GitHub (klik file →
ikon pensil ✏️ → Commit). GitHub menyimpan versi baru → **Vercel otomatis deploy
ulang** dalam ± 2 menit. Kalau skema database berubah, jalankan lagi workflow
Langkah 4.

> **Catatan kuota Vercel Hobby:** batas satu permintaan upload ± 4,5 MB.
> Aplikasi yang sudah dipatch otomatis memecah data per ± 3 MB dan mengurungkan
> foto bila terlalu besar, jadi tetap aman.

---

## B. Alternatif: Pakai Komputer dengan Git (hasil sama)

```bash
git init
git add .
git commit -m "Cek Blok Server"
git branch -M main
git remote add origin https://github.com/USERNAME/cek-blok-server.git
git push -u origin main
```

Untuk membuat tabel bisa pakai tombol Actions (Langkah 4) atau dari komputer:

```bash
nano .env                        # isi DATABASE_URL dengan connection string Neon
bash scripts/use-postgres.sh     # alihkan skema + buat tabel di Neon
```

Langkah Neon/Vercel/setup selanjutnya sama dengan Langkah 2–6 di atas.

---

## C. Alternatif: Netlify + Neon

Sama seperti Cara A (Neon tetap dipakai). Netlify perlu `@netlify/plugin-nextjs`
yang ditambahkan otomatis saat menghubungkan repo Next.js. Isi variabel
`DATABASE_URL` + `JWT_SECRET` di **Site settings → Environment variables**.

## D. Alternatif: Cloudflare Pages/Workers

Kuota gratis paling longgar. Gunakan `@opennextjs/cloudflare` (adapter resmi) atau
pilih template Next.js saat membuat project di dashboard Cloudflare. Database tetap
Neon (driver HTTP `@prisma/adapter-neon` disarankan). Untuk pengguna non-teknis,
Cara A/B lebih sederhana.

## E. Alternatif: Koyeb (bisa tetap SQLite)

1. Daftar [koyeb.com](https://www.koyeb.com) (tanpa kartu kredit).
2. Create Service → GitHub → pilih repo → Buildpack.
3. Perhatikan: instance gratis **tidak punya disk permanen**, data SQLite hilang
   saat restart. Untuk data permanen tetap gunakan Neon. Koyeb cocok untuk demo.

## F. Jalankan di Komputer/HP Sendiri (tanpa hosting)

```bash
npm install
cp .env.example .env
npm run db:push && npm run db:seed
npm run build && npm run start   # jalan di port 3000
```

Dengan `ngrok`/Cloudflare Tunnel (gratis), HP di lapangan bisa mengakses server
di komputer Anda.

---

## Checklist Setelah Deploy

- [ ] `/login` bisa dibuka, admin terdaftar lewat `/setup`
- [ ] Password admin default sudah **diganti**
- [ ] `JWT_SECRET` sudah diisi acak panjang (bukan default)
- [ ] Buat **Token Perangkat** dan pasang di aplikasi Cek Blok
- [ ] Tes **Kirim ke Server** dan **Ambil dari Server** dari aplikasi
- [ ] Cadangkan database secara berkala (Neon: branch/backup gratis)
