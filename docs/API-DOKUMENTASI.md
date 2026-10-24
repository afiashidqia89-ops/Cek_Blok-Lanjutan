# Dokumentasi API — Cek Blok Server

Semua respons JSON berbentuk `{ ok: true, ... }` atau `{ ok: false, error: "pesan" }`.

## Autentikasi

Ada dua cara:

1. **Sesi web (cookie)** — dipakai halaman web. Cookie `cb_session` (JWT, masa
   berlaku 7 hari) diberikan saat login.
2. **Token perangkat (header)** — dipakai aplikasi Cek Blok di HP:
   ```
   Authorization: Bearer cbk_xxxxxxxxxxxxxxxx
   ```
   Token dibuat oleh admin/user lewat web (menu **Token Perangkat**) atau API
   `POST /api/tokens`. Satu token = satu HP; bisa dicabut kapan saja.

## Endpoint Utama

### Auth (web)

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → set cookie sesi |
| POST | `/api/auth/logout` | hapus sesi |
| GET | `/api/auth/me` | info user yang sedang login |
| GET | `/api/setup` | `{perluSetup: true}` bila belum ada user |
| POST | `/api/setup` | buat **admin pertama** (hanya saat database kosong) |

### Admin (perlu role ADMIN)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/admin/users` | daftar pengguna + jumlah data/token (+ field `kebun`) |
| POST | `/api/admin/users` | daftarkan user baru `{username, name, password, role, kebun?}` |
| PATCH | `/api/admin/users/:id` | ubah nama/role/aktif/kebun, reset password `{password}` |
| DELETE | `/api/admin/users/:id` | hapus user (data pemeriksaannya tetap ada) |
| GET | `/api/admin/settings` | baca pengaturan |
| PUT | `/api/admin/settings` | ubah pengaturan (siteTitle, maxUploadMB, syncEnabled, dll.) |
| GET | `/api/admin/logs?page=1` | log aktivitas server |
| GET | `/api/stats` | statistik dashboard |
| GET | `/api/tokens?all=1` | daftar semua token (admin) |

### Data (sesi web)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/data?page=1&q=&tanggalFrom=&tanggalTo=&blok=&pemeriksa=` | daftar transaksi |
| POST | `/api/data/upload` | unggah berkas transfer (multipart field `file`, atau body JSON mentah) |
| GET | `/api/data/:id` | detail satu transaksi (payload lengkap) |
| DELETE | `/api/data/:id` | hapus transaksi (admin, atau pemilik bila diizinkan) |
| GET | `/api/data/export?foto=1` | **unduh berkas transfer .json** (bisa di-gabung di aplikasi) |
| POST | `/api/share` | buat tautan berbagi `{name, tanggalFrom, tanggalTo, blok, pemeriksa, withPhoto}` |
| GET | `/api/share` | daftar tautan berbagi |
| GET | `/api/share/:token` | **publik** — unduh berkas sesuai tautan |

### Sinkronisasi Perangkat (Bearer token, CORS terbuka)

Dipakai aplikasi Cek Blok (patch) di HP.

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/sync/status` | tes koneksi: `{ok, user, totalRecords, syncEnabled}` |
| POST | `/api/sync/upload` | kirim transaksi ke server |
| GET | `/api/sync/download?cursor=0&dari=<epochMs>` | ambil transaksi dari server (hanya kebun user bila user ditugaskan) |
| GET | `/api/sync/master` | **AMBIL DATA MASTER** — daftar blok sesuai kebun user (format array seperti DB Aresta aplikasi) |
| POST | `/api/app/login` | login HP `{username, password, device?}` → `{ok, user:{username,name,role,kebun}, token}` |

#### Format `POST /api/sync/upload`

Body = berkas transfer aplikasi (persis format "Kirim Data ke HP Lain"):

```json
{
  "app": "cekblok-transfer",
  "v": 1,
  "perangkat": "HP-Andi",
  "dibuat": 1700000000000,
  "foto": true,
  "bagian": 1,
  "dari": 1,
  "jumlah": 2,
  "records": [
    {
      "kodeTransaksi": "H031-20240101-001",
      "savedAt": 1700000000001,
      "tanggal": "2024-01-01",
      "pemeriksa": "Andi",
      "pt": "KBM", "kebun": "KBM", "afdeling": "1", "blok": "H031",
      "semak": 1.5, "tunasan": 10, "titi": 0, "kerdil": 2, "banjir": 0,
      "catatan": "...", "status": "Perhatian", "details": []
    }
  ]
}
```

Respons:

```json
{ "ok": true, "diterima": 2, "baru": 2, "duplikat": 0, "perangkat": "HP-Andi" }
```

**Deduplikasi otomatis** memakai kunci yang sama dengan aplikasi:
`kodeTransaksi|pemeriksa(lowercase)|savedAt`. Mengirim berulang aman — hanya data
baru yang tersimpan.

#### Format `GET /api/sync/download`

- `cursor` — offset untuk pengambilan bertahap (respons dibatasi ± 3 MB/batch)
- `dari` — epoch ms: hanya data yang **masuk ke server** setelah waktu ts
  (sinkron inkremental; simpan waktu terakhir sync di aplikasi)

Respons berisi `records` dengan format yang sama seperti berkas transfer, plus:

```json
{ "records": [...], "nextCursor": 3, "selesai": true, "total": 3, "jumlah": 3 }
```

Aplikasi mengulang permintaan sampai `selesai: true`, lalu menggabungkan data
(dedup ulang di sisi HP) — **tanpa file manager**.

## Catatan Error Umum

| Kode | Arti |
|---|---|
| 401 | Token perangkat tidak valid / belum login |
| 403 | Bukan admin / akun nonaktif |
| 413 | Data melebihi `maxUploadMB` (pengaturan admin). Aplikasi patched otomatis mencoba ulang tanpa foto |
| 503 | Sinkronisasi dimatikan admin (pengaturan `syncEnabled`) |

## API Baru (update Oktober 2026)

### `POST /api/app/login` — Login aplikasi HP pakai akun web

Body: `{ "username": "andi", "password": "rahasia", "device": "HP-Andi" }`
Respons: `{ "ok": true, "user": { "username", "name", "role" }, "token": "cbk_..." }`

- Memakai akun yang dibuat admin di web (menu **Pengguna**).
- Token perangkat (`cbk_...`) **dibuat otomatis** per user dan dipakai ulang saat login
  berikutnya (label: `Login HP: <username>`) — admin tetap bisa mencabutnya di menu Token Perangkat.
- Dibatasi ± 5 percobaan gagal per menit per username (HTTP 429 bila melebihi).
- Dibuka untuk CORS (dipakai WebView aplikasi / APK).

### `POST /api/sync/upload` — Kirim data dari aplikasi (sebelumnya hilang, sudah dipulihkan)

Auth: `Authorization: Bearer cbk_...` · Body: berkas transfer `cekblok-transfer`.
Respons: `{ "ok": true, "diterima": 2, "baru": 2, "duplikat": 0, "perangkat": "HP-Andi" }`.
HTTP 413 bila melebihi `maxUploadMB` → aplikasi otomatis mengulang tanpa foto.

### `POST /api/data/upload` — Unggah berkas transfer dari dashboard (sebelumnya hilang)

Auth: sesi web (cookie). Menerima `multipart/form-data` field `file` (atau raw JSON).
Deduplikasi sama dengan sinkronisasi. Respons seperti `sync/upload`.

### Lapisan peta (halaman web **Peta Blok**)

| Endpoint | Metode | Keterangan |
|---|---|---|
| `/api/map-layers` | GET | Daftar lapisan (meta, tanpa isi berkas) |
| `/api/map-layers` | POST | Tambah lapisan (admin) `{name, type:'GEOJSON'\|'RASTER', content, meta?}` |
| `/api/map-layers/:id` | GET | Isi lengkap satu lapisan |
| `/api/map-layers/:id` | DELETE | Hapus lapisan (admin) |
| `/api/map-records` | GET | Data + payload untuk digambar di peta. Filter: `kebun, afdeling, blok, tanggalFrom, tanggalTo, max`. Foto dihapus otomatis, posisi GPS temuan tetap ada |
| `/api/data/facets` | GET | Nilai unik `kebun, afdeling, blok, pemeriksa` untuk dropdown filter |

Tabel database baru: **MapLayer** (skema diperbarui — jalankan ulang workflow
"Terapkan Skema Database" di GitHub setelah commit update ini).

### Filter baru di API lama

`/api/data`, `/api/data/export`, `/api/share` kini mendukung parameter/filter
**`kebun`** dan **`afdeling`** (selain tanggal, blok, pemeriksa, perangkat).

### `GET /api/data/:id/photos` — Foto temuan satu transaksi (baru)

Auth: sesi web (cookie). Respons:

```json
{ "ok": true, "jumlah": 2, "photos": [
  { "key": "semak",   "label": "Semak",                        "sample": 1, "url": "data:image/jpeg;base64,..." },
  { "key": "tunasan", "label": "Tunasan Bermasalah – sampel 2", "sample": 2, "url": "data:image/jpeg;base64,..." }
] }
```

- Foto diambil on-demand (dipakai dialog Detail di menu Data dan popup titik
  temuan di Peta Blok — klik thumbnail untuk perbesar).
- Hak akses sama dengan detail transaksi: admin/lihat-semua boleh semua,
  user biasa hanya data unggahannya sendiri.
- Foto masuk ke server lewat **Kirim ke Server** dari aplikasi; foto otomatis
  dikompres (maks sisi 1280 px, JPEG ~72%) sebelum dikirim agar muat batas
  unggah hosting (4,5 MB per permintaan di Vercel). Foto asli di HP tidak berubah.

### Foto di sinkronisasi

- **Kirim ke Server**: foto ikut terkirim (terkompresi otomatis). Bila tetap
  terlalu besar (HTTP 413), aplikasi otomatis mengulang tanpa foto seperti
  sebelumnya.
- **Ambil dari Server**: foto ikut kembali ke aplikasi (HP lain menerima data
  lengkap dengan foto).

## API Data Master & Kebun (update Oktober 2026 — bagian 2)

### `GET /api/master` — Data master blok (sesi web)

| Parameter | Arti |
|---|---|
| `facets=1` | ringkasan per kebun: `{facets:[{kebun,estate,afdelings,jumlahAfdeling,bloks,luas,pokok}], totalBlok, totalKebun, totalEstate, totalAfdeling, totalLuas, totalPokok, kosong}` |
| `kebun=`, `afdeling=`, `q=` | filter (q = cari kode blok) |
| `page=`, `limit=` | paginasi (default 1 / 200, maks 1000) |

Respons list: `{ok, total, page, limit, rows:[{id, estate, kebun, afdeling, blok, luas, pokok}]}`.

### `POST /api/master` — Impor data master (admin)

Body salah satu:

```json
{ "sumber": "bawaan", "mode": "merge" }
{ "csv": "Estate;Kebun;Afdeling;Blok;Luas;Pokok\nKBM;KBM;1;H031;36.8;2573", "mode": "replace" }
{ "rows": [["KBM","KBM","1","H031",36.8,2573]] }
```

- `mode: "merge"` — tambah/perbarui tanpa menghapus (aman, default).
- `mode: "replace"` — hapus dulu seluruh baris kebun yang muncul di data baru,
  lalu isi ulang (cocok untuk pembaruan besar dari Excel).
- `sumber: "bawaan"` — muat DB Aresta bawaan aplikasi (6.041 blok) yang sudah
  tertanam di server.

Respons: `{ok, masuk, dihapus, mode, sumber, total}`.

### `PATCH/DELETE /api/master/:id` (admin)

- `PATCH {luas?, pokok?, estate?, kebun?, afdeling?, blok?}` — ubah satu blok
  (paling sering: koreksi luas / jumlah pokok).
- `DELETE` — hapus satu blok.

### `GET /api/sync/master` — Ambil Data Master untuk HP (Bearer token)

Lingkup otomatis mengikuti kebun user pemilik token:

```json
{ "ok": true, "kebun": "KBM", "lingkup": "KEBUN", "total": 188, "versi": 1761000000000,
  "rows": [["KBM","KBM","1","H031",36.8,2573], ["KBM","KBM","1","H032",33.45,864]] }
```

- `lingkup: "KEBUN"` bila user ditugaskan (menu Pengguna di web), `"SEMUA"`
  bila tidak (mis. admin).
- `rows` memakai format array yang sama dengan DB Aresta aplikasi
  `[estate, kebun, afdeling, blok, luas, pokok]`, sehingga aplikasi langsung
  menerapkannya ke daftar blok (tombol "Ambil Data Master").

### Kebun penugasan user

- Field `kebun` pada model User (kosong = semua kebun).
- Diatur admin lewat menu **Pengguna** (web) — dropdown "Kebun penugasan"
  diisi otomatis dari Data Master.
- Efeknya di HP:
  1. `POST /api/app/login` mengembalikan `user.kebun` — ditampilkan sebagai
     "Kebun Anda: XX".
  2. `GET /api/sync/master` hanya mengirim blok kebun tsb (pilihan
     Estate/Kebun/Afdeling/Blok di HP ikut terbatas).
  3. `GET /api/sync/download` hanya mengirim transaksi kebun tsb
     (data kebun lain tidak terkirim ke HP user).

### Alur update Data Master web -> HP

1. Admin mengubah Data Master di web (edit luas/pokok, impor CSV, dsb).
2. User di HP menekan tombol **Ambil Data Master**.
3. HP mengunduh `rows` sesuai kebunnya, menyimpan ke penyimpanan DB
   (localStorage `cekBlokDbAresta`, mekanisme yang sama dengan impor Excel
   bawaan aplikasi), lalu membangun ulang daftar blok + pencarian.
4. Form pemeriksaan langsung memakai data baru (termasuk luas & jumlah pokok
   otomatis per blok).
