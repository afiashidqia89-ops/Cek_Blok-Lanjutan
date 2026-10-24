# Panduan Aplikasi Cek Blok — Integrasi Server (Solusi Poin 6)

## Latar Belakang

Aplikasi Cek Blok (APK) mengirim data antar HP lewat **berkas** (Bluetooth /
Quick Share). Yang menerima harus mencari berkas lalu menggabungkannya — praktisnya
sering melibatkan file manager. Kebutuhan: **penerima cukup menambahkan data
langsung dari aplikasi**.

Dari analisis APK (`id.plantdigital.cekblok`, Capacitor), aplikasi menyimpan
data di IndexedDB dan punya dua mekanisme bawaan:

1. **Kirim Data ke HP Lain** → berkas `.json` (format `cekblok-transfer`)
2. **Terima & Gabung Data** → pilih berkas lewat picker, duplikat otomatis dilewati

## Solusi: Patch Aplikasi + Server Sinkronisasi

`public/app/index.html` di repo ini **adalah aplikasi Cek Blok yang sudah
dipatch** dengan fitur baru di menu **Riwayat → Data Report**:

> **Sinkronisasi Server (Internet)**
> - ☁️ **Kirim ke Server** — semua transaksi di HP diunggah ke server (terpecah
>   per ± 3 MB, duplikat dilewati; bila terlalu besar otomatis coba ulang tanpa foto)
> - ⬇️ **Ambil dari Server** — transaksi dari server digabung langsung ke
>   aplikasi. **Tidak perlu file manager, tidak perlu berkas.**
> - ⚙️ **Server & Token** — isi alamat server + token perangkat (sekali saja,
>   tersimpan di HP)

### Alur kirim-terima antar HP yang baru

```
HP A (pengirim)                       HP B (penerima)
Kirim ke Server  ──►  SERVER  ──►  Ambil dari Server
                     (dedupe)      data langsung gabung
                                   di aplikasi ✔
```

Bila satu HP **offline**, tetap bisa lewat jalur lama: web admin membuat
**Tautan Berbagi** → dikirim via WhatsApp → penerima unduh berkas →
*Terima & Gabung Data* (dedupe tetap jalan).

## Dua Cara Memakai Aplikasi Patched

### Cara 1 — Tanpa mengubah APK (langsung pakai)

Server ini menyajikan aplikasi patched di **`https://SERVER-ANDA/app/`**.
Buka di Chrome HP (bisa di-*Add to Home screen*). Data tersimpan di perangkat
browser tersebut, terpisah dari data di APK.

> Cocok untuk: mulai pakai segera, atau HP penerima yang ingin serbasempurna.

### Cara 2 — Masukkan patch ke APK (data menyatu dengan APK lama)

Karena aplikasi ini Capacitor (web app dibungkus Android), patch = mengganti
satu berkas di proyek APK:

1. Salin `public/app/index.html` dari repo ini ke folder `www/` proyek APK
   (menggantikan `www/index.html` lama).
2. Sinkronkan & bangun:
   ```bash
   npm install
   npx cap sync android
   cd android && ./gradlew assembleRelease   # atau assembleDebug
   ```
3. Pasang APK hasil build. Semua fitur lama tetap utuh + fitur server baru.

**Tidak punya proyek sumber APK?** Dua opsi:
- Pakai Cara 1 (versi web) — tanpa build apa pun.
- Rebuild APK langsung dari APK lama dengan [apktool](https://apktool.org):
  - `apktool d Cek-Blok.apk -d cekblok` (dekompilasi)
  - ganti `cekblok/assets/public/index.html` dengan versi patched
  - `apktool b cekblok -o Cek-Blok-baru.apk` lalu tanda tangani
    (`uber-apk-signer --apks Cek-Blok-baru.apk`)
  - Catatan: tanda tangan berubah → perlu **uninstall APK lama** dulu
    (data lama ikut terhapus — ekspor dulu bila perlu).

### Regenerasi patch (untuk pengembang aplikasi)

Saat versi baru aplikasi tersedia, patch otomatis bisa dibuat ulang:

```bash
# ekstrak APK baru, lalu:
python3 scripts/patch_apk.py
# hasil: public/app/index.html (panel + tombol server disuntik otomatis)
```

Script menambahkan:
- Panel `serverSyncBox` (HTML) sebelum kartu *Data Master Blok (DB Aresta)*
- Blok `<script>` sinkronisasi sebelum `</body>` yang memakai fungsi bawaan
  aplikasi: `records()`, `trfKey()`, `ensureTransactionCode()`, `saveRecords()`,
  `renderHistory()` — sehingga perilaku merge/dedupe **identik** dengan aplikasi.

## Pengaturan di HP (sekali saja)

1. Web admin → **Token Perangkat** → *Buat Token* → salin `cbk_...`
2. Aplikasi → **Riwayat → Data Report → ⚙️ Server & Token**
3. Alamat server: `https://SERVER-ANDA` · Token: `cbk_...` → **Simpan**
4. **Tes Koneksi** → muncul `Terhubung ✓ (N transaksi di server)`

Setiap HP sebaiknya punya token sendiri (nama HP di kolom label) agar admin
bisa mencabut akses per HP.

## Catatan Teknis

- **Dedupe dua lapis**: server menolak duplikat (kunci
  `kodeTransaksi|pemeriksa|savedAt`), aplikasi juga mengecek ulang saat menggabung.
- **Sinkron inkremental**: waktu terakhir sync disimpan di HP
  (`cekBlokServerLastSync`), jadi *Ambil dari Server* hanya menarik data baru.
- **Foto temuan** ikut tersimpan (base64 di dalam record). Bila payload melebihi
  batas upload server, pengiriman otomatis diulang tanpa foto.
- **Keamanan**: token per HP bisa dicabut dari web; semua aktivitas tercatat di
  log admin; sinkronisasi bisa dimatikan sementara dari pengaturan.
