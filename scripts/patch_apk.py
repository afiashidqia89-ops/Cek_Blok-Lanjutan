#!/usr/bin/env python3
"""
Patch index.html aplikasi Cek Blok (APK Capacitor):
- Menambah panel "Sinkronisasi Server" + LOGIN akun web di halaman Riwayat
- Menambah tombol Kirim ke Server / Ambil dari Server / Ambil Data Master
- Menambah pengaturan alamat server + login username/password (token otomatis)
- Menambah jembatan update DB Aresta (daftar blok sesuai kebun user)

Sumber patch: scripts/patch_payload/sync-panel.html + sync-script.html
  (diedit di sana bila ingin mengubah panel/tombol)
Asli tidak diubah: index.html di dalam APK (upload/Cek-Blok.apk)
Hasil: /home/z/my-project/public/app/index.html (+ aset pendukung)
"""
import os
import re
import shutil
import sys
import tempfile
import zipfile

ROOT = "/home/z/my-project"
SRC_DIR = os.path.join(ROOT, "apk-analysis/extracted/assets/public")
APK = os.path.join(ROOT, "upload/Cek-Blok.apk")
PAYLOAD_DIR = os.path.join(ROOT, "scripts/patch_payload")
OUT = os.path.join(ROOT, "public/app")

SUPPORT_ASSETS = [
    "exceljs.min.js", "pdf.min.js", "pdf.worker.min.js",
    "icon-192.png", "icon-512.png", "manifest.json",
]


def sumber_index_html():
    """Ambil index.html ASLI (tanpa patch) dari folder ekstraksi atau langsung dari APK."""
    src_index = os.path.join(SRC_DIR, "index.html")
    if os.path.isfile(src_index):
        with open(src_index, "r", encoding="utf-8") as f:
            return f.read(), SRC_DIR
    if not os.path.isfile(APK):
        print(f"Sumber tidak ada: {SRC_DIR} dan {APK}")
        sys.exit(1)
    tmp = tempfile.mkdtemp(prefix="apk-extract-")
    with zipfile.ZipFile(APK) as z:
        z.extractall(tmp)
    d = os.path.join(tmp, "assets", "public")
    if not os.path.isfile(os.path.join(d, "index.html")):
        print("index.html tidak ditemukan di dalam APK (assets/public/)")
        sys.exit(1)
    return open(os.path.join(d, "index.html"), "r", encoding="utf-8").read(), d


def baca_payload():
    panel = open(os.path.join(PAYLOAD_DIR, "sync-panel.html"), "r", encoding="utf-8").read().strip()
    script = open(os.path.join(PAYLOAD_DIR, "sync-script.html"), "r", encoding="utf-8").read().strip()
    return panel, script


def main():
    html, src_dir = sumber_index_html()
    panel, script = baca_payload()
    os.makedirs(OUT, exist_ok=True)

    # --- Patch 1: panel UI sebelum kartu DB Aresta ---
    anchor_html = '<div class="history-data-tools db-tools report-box"'
    if html.count(anchor_html) != 1:
        print(f"anchor HTML tidak unik: {html.count(anchor_html)}")
        sys.exit(1)
    html = html.replace(anchor_html, panel + "\n      " + anchor_html)

    # --- Patch 2: script sebelum </body> terakhir ---
    idx = html.rfind("</body>")
    if idx <= 0:
        print("anchor </body> tidak ditemukan")
        sys.exit(1)
    html = html[:idx] + script + "\n" + html[idx:]

    # --- Patch 3: ekspos jembatan update DB Aresta (dipakai tombol Ambil Data Master) ---
    # IIFE DB Aresta diakhiri "  status();\n})();" (unik di berkas asli).
    # Kita menambah window.cekApplyDb(rows) yang: simpan override localStorage + applyRows
    # (rebuild DB + DB_INDEX + dropdown) — persis mekanisme impor Excel bawaan aplikasi.
    anchor_db = "  status();\n})();"
    if html.count(anchor_db) != 1:
        print(f"anchor DB Aresta tidak unik: {html.count(anchor_db)}")
        sys.exit(1)
    jembatan = (
        "  status();\n"
        "  /* Jembatan Sinkronisasi Server: update daftar blok dari server */\n"
        "  window.cekApplyDb = function(rows){\n"
        "    try{ localStorage.setItem(KEY, JSON.stringify({rows:rows, updated:Date.now(), name:'Data Master (server)'})); }\n"
        "    catch(err){ alert('DB tidak bisa disimpan di perangkat (penyimpanan penuh).'); return; }\n"
        "    applyRows(rows);\n"
        "    try{ var el=$('dbArestaStatus'); if(el) el.scrollIntoView({block:'nearest'}); }catch(e){}\n"
        "  };\n"
        "})();"
    )
    html = html.replace(anchor_db, jembatan)

    # --- Patch 4: tanda versi build (dipakai untuk membedakan APK hasil rebuild) ---
    html = re.sub(
        r'(<meta name="cek-blok-build" content=")[^"]*(")',
        r'\g<1>2026-10-24-v33-master-data\g<2>',
        html,
    )

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # --- Salin aset pendukung aplikasi ---
    for name in SUPPORT_ASSETS:
        src_path = os.path.join(src_dir, name)
        if os.path.isfile(src_path):
            shutil.copy2(src_path, os.path.join(OUT, name))
            print(f"  disalin: {name}")

    size = os.path.getsize(os.path.join(OUT, "index.html"))
    print(f"OK: public/app/index.html dibuat ({size/1024:.0f} KB) — panel server + login + Kirim/Ambil/Data Master aktif.")


if __name__ == "__main__":
    main()
