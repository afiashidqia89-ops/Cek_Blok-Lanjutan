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
| GET | `/api/admin/users` | daftar pengguna + jumlah data/token |
| POST | `/api/admin/users` | daftarkan user baru `{username, name, password, role}` |
| PATCH | `/api/admin/users/:id` | ubah nama/role/aktif, reset password `{password}` |
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
| GET | `/api/sync/download?cursor=0&dari=<epochMs>` | ambil transaksi dari server |

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
