# Panduan Lengkap Pemula — Menjalankan Cek Blok 100% Lewat GitHub

Panduan ini ditulis untuk orang yang **belum pernah pakai GitHub sekalipun**.
Semua langkah dikerjakan dari browser (laptop atau HP), tanpa memasang program
apa pun di komputer, tanpa kartu kredit. Ikuti urutannya dari atas ke bawah —
total waktu ± 30 menit.

---

## Daftar Isi

1. [Gambaran Besar](#1-gambaran-besar)
2. [Yang Perlu Disiapkan](#2-yang-perlu-disiapkan)
3. [Langkah 1 — Buat Akun GitHub](#3-langkah-1--buat-akun-github)
4. [Langkah 2 — Buat Repo & Unggah ZIP](#4-langkah-2--buat-repo--unggah-zip)
5. [Langkah 3 — Ekstrak ZIP via Codespaces](#5-langkah-3--ekstrak-zip-via-codespaces)
6. [Langkah 4 — Database Gratis di Neon](#6-langkah-4--database-gratis-di-neon)
7. [Langkah 5 — Simpan Secret di GitHub](#7-langkah-5--simpan-secret-di-github)
8. [Langkah 6 — Buat Tabel dengan Satu Klik](#8-langkah-6--buat-tabel-dengan-satu-klik)
9. [Langkah 7 — Deploy di Vercel](#9-langkah-7--deploy-di-vercel)
10. [Langkah 8 — Akun Admin Pertama](#10-langkah-8--akun-admin-pertama)
11. [Langkah 9 — Uji Coba End-to-End](#11-langkah-9--uji-coba-end-to-end)
12. [Pemakaian Sehari-hari](#12-pemakaian-sehari-hari)
13. [Mengubah Kode di Kemudian Hari](#13-mengubah-kode-di-kemudian-hari)
14. [Kalau Terjadi Masalah (Troubleshooting)](#14-kalau-terjadi-masalah-troubleshooting)
15. [Checklist Akhir & Tips Keamanan](#15-checklist-akhir--tips-keamanan)

---

## 1. Gambaran Besar

Sistem yang akan berjalan terdiri dari 3 layanan gratis yang saling terhubung:

```
┌─────────────┐      kode program       ┌───────────────┐
│   GITHUB    │ ───────────────────────▶ │    VERCEL     │  ← alamat web Anda
│  (gudang    │    otomatis ter-deploy   │ (menjalankan  │     https://cek-blok-
│   kode)     │                          │  web + API)   │      xxxx.vercel.app
└─────────────┘                          └───────┬───────┘
                                          │ simpan/baca data
                                          ▼
                                 ┌─────────────────┐
                                 │      NEON       │
                                 │  (database logam│
                                 │   semua transaksi)│
                                 └─────────────────┘
     ▲                                        ▲
     │                                        │
 HP petani lapangan (APK Cek Blok)      Browser admin (kelola user,
 "Kirim ke Server / Ambil dari Server"  lihat data, unduh, pengaturan)
```

- **GitHub** = gudang kode. Semua file program disimpan di sini. Setiap kali
  kode diubah, layanan lain mengikuti otomatis.
- **Neon** = database (tempat data transaksi disimpan secara permanen).
- **Vercel** = "mesin" yang menjalankan web admin + API, bisa diakses siapa pun
  lewat alamat internet yang Anda dapatkan di akhir panduan ini.

Ketiganya login memakai **satu akun GitHub** saja dan **semuanya gratis**.

---

## 2. Yang Perlu Disiapkan

- [ ] File **`cek-blok-server-github.zip`** (unduh dari folder download percakapan ini)
- [ ] Alamat email aktif (untuk daftar akun)
- [ ] Kertas/catatan HP untuk menyimpan kredensial penting:
      password GitHub, koneksi database, password admin. **Jangan sampai hilang.**
- [ ] Kuota internet ± 50 MB (upload ZIP 1,8 MB + proses deploy)

---

## 3. Langkah 1 — Buat Akun GitHub

> Lewati langkah ini jika sudah punya akun GitHub.

1. Buka **https://github.com** → klik **Sign up** (kanan atas).
2. Masukkan **email**, buat **password**, buat **username**.
   - Username akan muncul di alamat repo (mis. `github.com/budi72`), pilih yang
     mudah diingat.
3. Selesaikan verifikasi (tekan tombol puzzle sesuai instruksi), lalu buka email
   Anda → klik kode/link verifikasi dari GitHub.
4. Setelah masuk, aktifkan juga verifikasi 2 langkah bila diminta (disarankan).

✅ **Hasil: Anda punya akun GitHub dan sedang login.**

---

## 4. Langkah 2 — Buat Repo & Unggah ZIP

*"Repo" (repository) = folder proyek di GitHub.*

1. Setelah login di GitHub, klik **tombol `+`** di kanan atas → **New repository**.
2. Isi formulir:
   - **Repository name**: `cek-blok-server`
   - **Visibility**: pilih **Private** ⚠️ (penting — kode tidak bisa dilihat orang umum)
   - Jangan centang "Add a README file", "Add .gitignore", maupun "Choose a license"
     (biarkan kosong supaya proses unggah lancar).
3. Klik **Create repository**.
4. Di halaman repo yang kosong, cari tulisan **"uploading an existing file"**
   (biru, di tengah halaman) → klik.
5. Klik **"choose your files"**, pilih file **`cek-blok-server-github.zip`**
   (file ZIP-nya saja, tidak perlu diekstrak dulu).
6. Tunggu sampai muncul nama file-nya, lalu klik **Commit changes**
   (pesan commit boleh dibiarkan default).

✅ **Hasil: repo `cek-blok-server` berisi 1 file ZIP.**

---

## 5. Langkah 3 — Ekstrak ZIP via Codespaces

*Codespaces = "komputer kerja" di dalam GitHub yang dibuka lewat browser. Gratis.*

1. Di halaman repo (`github.com/USERNAME-ANDA/cek-blok-server`), klik tombol
   hijau **`<> Code`** → pilih tab **Codespaces**.
2. Klik **Create codespace on main**. Tunggu ± 30–60 detik sampai muncul
   tampilan editor (mirip Word/VS Code di browser).
3. Klik sekali di kotak **terminal** (area hitam bagian bawah), lalu tempel
   (Ctrl+V / tahan lama → Paste) perintah berikut lalu tekan **Enter**:

   ```bash
   unzip -o cek-blok-server-github.zip -d . && rm -f cek-blok-server-github.zip worklog.md
   ```

   Kolom kiri akan tiba-tiba penuh daftar folder — itu tanda berhasil.

4. Tempel perintah kedua lalu **Enter**:

   ```bash
   git add -A && git commit -m "Cek Blok Server" && git push
   ```

5. Buka kembali tab repo di browser dan **refresh (F5)** — sekarang semua folder
   (`src`, `prisma`, `docs`, dll.) sudah muncul.
6. Rapikan: di Codespace, klik menu **☰ (kiri atas) → Terminal → New Terminal**
   tidak perlu — cukup tutup tab Codespace. Untuk hemat kuota, hentikan:
   buka **github.com/codespaces** → cari codespace aktif → titik tiga **⋯** →
   **Stop codespace**. (Boleh juga dibiarkan; kuota gratis 120 jam/bulan.)

✅ **Hasil: seluruh kode (171 file) ada di repo GitHub Anda.**

> **Cara alternatif tanpa Codespace:** di langkah unggah file, seret isi folder
> hasil ekstrak ZIP per kelompok (maks ± 100 file per tarikan): dulu semua file
> di akar, lalu folder `src`, lalu `public` + `prisma` + `scripts` + `docs` +
> `.github`. Struktur folder ikut tersimpan otomatis.

---

## 6. Langkah 4 — Database Gratis di Neon

1. Buka **https://neon.tech** → klik **Sign Up** → pilih **Continue with GitHub**
   → **Authorize Neon** (tanpa kartu kredit).
2. Klik **Create project**:
   - Project name: `cek-blok`
   - Postgres version: biarkan default
   - Cloud region: pilih **Singapore** (paling dekat dengan Indonesia)
3. Setelah jadi, layar akan menampilkan **Connection string** — teks panjang
   yang diawali `postgresql://user:...@ep-...region.aws.neon.tech/neondb?sslmode=require`.
4. **Salin (copy) teks itu** dan simpan di catatan Anda. Sebutannya: *koneksi
   database Neon*.

✅ **Hasil: database PostgreSQL aktif + koneksi database tersimpan di catatan.**

> Kalau connection string tidak otomatis muncul: klik tombol **Connect** /
> **Connection Details** di dashboard Neon → pilih **Pooled connection** → Copy.

---

## 7. Langkah 5 — Simpan Secret di GitHub

*Kredensial database tidak boleh ditulis langsung di kode. GitHub punya tempat
khusus bernama "Secrets".*

1. Buka repo `cek-blok-server` → klik tab **Settings** (paling kanan deretan tab).
2. Di menu kiri: **Secrets and variables** → **Actions**.
3. Klik tombol **New repository secret**. Isi:
   - **Name**: `DATABASE_URL`  ← harus persis seperti ini (huruf besar semua)
   - **Secret**: tempel koneksi database Neon dari Langkah 4
4. Klik **Add secret**.

✅ **Hasil: GitHub menyimpan koneksi database secara aman untuk dipakai
workflow otomatis di langkah berikutnya.**

---

## 8. Langkah 6 — Buat Tabel dengan Satu Klik

*Ini langkah "ajaib" yang menggantikan perintah teknis di komputer — cukup
menekan tombol.*

1. Di repo, klik tab **Actions** (deretan tab atas).
2. Di kolom kiri, klik **"Terapkan Skema Database (Postgres)"**.
3. Di kanan muncul kotak kuning "This workflow has a workflow_dispatch event
   trigger" → klik tombol **Run workflow** → muncul dropdown → langsung klik
   **Run workflow** (tidak perlu centang apa pun).
4. Klik baris proses yang baru muncul ("Terapkan Skema Database…") untuk melihat
   progres. Tunggu **1–3 menit**.
5. Lingkaran berputar → berubah jadi **✅ centang hijau** = semua tabel sudah
   dibuat di Neon.

✅ **Hasil: database siap menampung data (tabel user, data, token, pengaturan,
log).**

> **Kalau hasilnya ❌ merah:** klik prosesnya → klik bagian yang merah untuk
> membaca pesan error. Penyebab paling umum: `DATABASE_URL` di Secret salah
> ketik / belum benar. Perbaiki di Langkah 5 lalu jalankan ulang **Run workflow**.

---

## 9. Langkah 7 — Deploy di Vercel

1. Buka **https://vercel.com** → **Sign Up** → **Continue with GitHub** →
   **Authorize Vercel** (tanpa kartu kredit).
2. Di dashboard: klik **Add New...** → **Project**.
3. Cari baris repo **`cek-blok-server`** → klik **Import**.
   - Kalau tidak muncul: klik **"Adjust GitHub App Permissions"** → **Select
     repositories** → centang `cek-blok-server` → **Save** → kembali ke Vercel.
4. Di halaman konfigurasi, **jangan dulu klik Deploy**. Buka bagian
   **Environment Variables** dan tambahkan 2 baris (tiap baris: isi Name,
   tempel di Value, klik Add):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | koneksi database Neon (sama dengan Langkah 4/5) |
   | `JWT_SECRET`   | kunci rahasia acak — buat dengan situs generator password (mis. 40+ karakter campuran huruf besar/kecil/angka), lalu salin |

5. Klik **Deploy**. Tunggu **2–4 menit** (ada layar berputar + log).
6. Muncul layar selamat 🎉 dengan tombol **Continue to Dashboard**. Di dashboard
   ada **Domains** berisi alamat seperti:

   ```
   https://cek-blok-server-xxxx.vercel.app
   ```

   **Salin alamat ini** ke catatan — ini alamat server Anda selamanya.

✅ **Hasil: web admin + API Cek Blok hidup di internet, gratis.**

> Setiap kali repo GitHub berubah, Vercel **otomatis** deploy ulang ± 2 menit.

---

## 10. Langkah 8 — Akun Admin Pertama

1. Buka di browser: `https://ALAMAT-VERCEL-ANDA/setup`
   (ganti sesuai alamat langkah 9).
2. Isi:
   - **Username**: huruf kecil tanpa spasi, mis. `budiadmin`
   - **Nama tampilan**: mis. `Budi (Admin)`
   - **Password**: minimal 6 karakter, disarankan 8+ campuran.
3. Klik **Buat Akun Admin** → akan diarahkan ke halaman login.
4. Login dengan username & password tadi.

⚠️ **PENTING:**
- Halaman `/setup` hanya bisa dipakai **SEKALI** — setelah admin pertama dibuat,
  halaman itu terkunci selamanya. Jadi jangan asal buat; catat kredensialnya.
- Setelah login, segera buka menu **Pengguna** dan **ganti password** admin
  lewat tombol edit.

✅ **Hasil: Anda masuk ke dashboard admin (Ringkasan, Data, Token, Pengguna,
Pengaturan, Log).**

---

## 11. Langkah 9 — Uji Coba End-to-End

Lakukan 5 menit tes ini agar yakin semuanya jalan:

1. **Daftarkan user tes**: menu **Pengguna** → **Daftarkan User** →
   username `tes01`, password `tes12345`, peran `USER`.
2. **Buat token perangkat**: menu **Token** → **Buat Token** →
   beri nama `HP Tes` → salin token (diawali `cbk_...`).
3. **Buka aplikasi versi web** di HP: alamat server + `/app/`
   (mis. `https://cek-blok-server-xxxx.vercel.app/app/`) → login sebagai `tes01`.
4. Masuk ke **Riwayat → Data Report → Sinkronisasi Server → ⚙️ Server & Token**:
   - **Alamat server**: `https://ALAMAT-VERCEL-ANDA` (tanpa garis miring di akhir)
   - **Token**: tempel `cbk_...` → Simpan → tes koneksi harus "Terhubung".
5. Buat 1–2 transaksi palsu → **☁️ Kirim ke Server** → muncul notifikasi jumlah
   yang terkirim.
6. Buka web admin → menu **Data** → transaksi tadi sudah terlihat → coba
   **Unduh** dan **Buat Tautan Berbagi**.
7. Di HP lain (atau hapus 1 transaksi), klik **⬇️ Ambil dari Server** → data
   masuk langsung ke aplikasi **tanpa file manager sama sekali** ✅.

✅ **Hasil: sistem siap dipakai tim di lapangan.**

---

## 12. Pemakaian Sehari-hari

### Untuk Admin (Anda)
| Kebutuhan | Caranya |
|---|---|
| Daftarkan anggota tim baru | Web → **Pengguna** → **Daftarkan User** → beri username + password awal + peran `USER` (atau `ADMIN` untuk asisten admin) |
| Anggota lupa password | Web → **Pengguna** → cari namanya → **Reset Password** → beri password baru |
| Nonaktifkan anggota yang keluar | **Pengguna** → toggle **Nonaktifkan** (data-nya tetap aman) |
| Lihat/unduh semua data | Web → **Data** → filter → **Unduh** (berkas .json yang bisa digabung di aplikasi) |
| Bagikan data via WhatsApp | **Data** → **Buat Tautan Berbagi** → kirim linknya (penerima unduh tanpa login) |
| Atur batas upload, judul situs, dll. | Web → **Pengaturan** |
| Audit siapa melakukan apa | Web → **Log** |

### Untuk Petugas Lapangan (di HP)
1. Buka aplikasi Cek Blok (APK atau versi web `/app/`), login sekali.
2. Isi **Server & Token** sekali saja (lihat Langkah 9 poin 4).
3. Rutin: **Kirim ke Server** saat sinyal ada; **Ambil dari Server** untuk
   menyatukan data dari rekan kerja. Duplikat otomatis dilewati, aman dipakai
   berulang.
4. **Tidak perlu file manager, tidak perlu salin file manual** — semuanya
   langsung di dalam aplikasi.

> Ingin memakai **APK asli** yang sudah dipatch fitur sinkronisasi? Ikuti
> `docs/PANDUAN-APLIKASI-CEK-BLOK.md` di repo (cara memasukkan patch ke APK).

---

## 13. Mengubah Kode di Kemudian Hari

Semua perubahan lewat GitHub saja:

| Aksi | Caranya |
|---|---|
| Edit satu file (teks, konfigurasi kecil) | Buka file di GitHub → ikon **pensil ✏️** → ubah → **Commit changes** → Vercel deploy otomatis |
| Menambah file/folder | Repo → **Add file** → **Upload files** |
| Mengubah banyak file sekaligus | Buka **Codespaces** lagi → edit → jalankan `git add -A && git commit -m "pesan" && git push` |
| Skema database berubah (jarang) | Jalankan ulang workflow **"Terapkan Skema Database (Postgres)"** di tab Actions. ⚠️ Centang "paksa" hanya jika diminta — bisa menghapus data |
| Melihat riwayat deploy | Vercel dashboard → **Deployments** |
| Rollback (kembali ke versi lama) | Vercel → Deployments → pilih versi lama → **⋯ → Promote to Production** |

---

## 14. Kalau Terjadi Masalah (Troubleshooting)

| Gejala | Penyebab Umum | Solusi |
|---|---|---|
| Tombol **Run workflow** tidak muncul di Actions | Folder `.github` belum ter-upload / salah tempat | Pastikan `.github/workflows/db-migrate.yml` ada di repo (lihat di tab Code) |
| Workflow gagal (❌) pesan `Authentication failed` | `DATABASE_URL` salah/kadaluarsa | Perbaiki Secret di Settings → Actions → jalankan ulang |
| Workflow gagal pesan `P1001: Can't reach database` | Salin connection string kurang lengkap (mis. tanpa `?sslmode=require`) | Salin ulang dari Neon (pilih *Pooled connection*) |
| Deploy Vercel gagal (Build error) | Environment Variables kosong/salah nama | Cek ejaan `DATABASE_URL` & `JWT_SECRET` → Deployments → **⋯ → Redeploy** |
| Halaman web `503 / sedang down` | Sedang deploy / kuota harian | Tunggu 2 menit, refresh; cek status di Vercel Deployments |
| `/setup` menolak: "Setup sudah dilakukan" | Admin pertama sudah pernah dibuat | Login saja di `/login`; lupa password → lihat baris berikutnya |
| Admin lupa password | — | Admin lain bisa reset dari menu Pengguna. Jika satu-satunya admin, buat issue di repo / minta bantuan reset database |
| Aplikasi: "Tidak terhubung" | Alamat server salah (pakai `http://` atau ada `/` di akhir) / token salah | Isi `https://ALAMAT` tanpa garis miring akhir; salin ulang token `cbk_...` |
| Kirim data gagal "terlalu besar" | Satu batch melebihi batas server (4,5 MB di Vercel) | Aplikasi versi patch sudah otomatis memecah; kalau tetap gagal, kirim dua kali / kurangi foto |
| Data duplikat menumpuk | — | Tidak akan terjadi: kunci dedupe `kodeTransaksi|pemeriksa|savedAt` melewatkan data yang sama |
| Codespace gagal `git push` | Sesi login GitHub hang | Refresh tab Codespace, ulangi perintah; atau buat codespace baru |
| Lupa password GitHub | — | github.com/password_reset |

---

## 15. Checklist Akhir & Tips Keamanan

**Checklist teknis:**
- [ ] Repo GitHub berisi semua folder (bukan hanya ZIP)
- [ ] Workflow "Terapkan Skema Database" pernah berjalan sukses (✅)
- [ ] Vercel aktif & web `/login` bisa dibuka di HP
- [ ] `/setup` sudah dipakai, admin dibuat, password diganti
- [ ] User tim terdaftar & token perangkat terpasang di tiap HP
- [ ] Tes Kirim/Ambil dari Server sukses dari ≥ 2 HP

**Tips keamanan:**
1. **Jangan bagikan** `DATABASE_URL` & `JWT_SECRET` ke siapa pun (termasuk lewat
   chat). Keduanya hanya hidup di GitHub Secrets & Vercel Environment Variables.
2. Password awal yang Anda berikan ke anggota tim **wajib diganti** oleh mereka
   setelah login pertama. Dorong password 8+ karakter.
3. Repo tetap **Private** selamanya.
4. Unduh cadangan data rutin (menu **Data → Unduh**) — minimal seminggu sekali.
5. Neon punya fitur branch/backup gratis — buat branch cadangan sebelum
   perubahan besar.

---

*Panduan ini bagian dari proyek Cek Blok Server. Referensi lain:
`docs/PANDUAN-DEPLOY-GITHUB.md` (ringkasan + alternatif hosting),
`docs/API-DOKUMENTASI.md` (integrasi aplikasi lain),
`docs/PANDUAN-APLIKASI-CEK-BLOK.md` (APK & patch).*
