#!/usr/bin/env python3
"""
Terafikasi proyek Android hasil `npx cap add android` agar setara APK asli:
1. Menambah IJIN (permission) kamera, GPS, dan Bluetooth ke AndroidManifest.xml
   — WebView/Capacitor otomatis menampilkan dialog perijinan runtime saat
   aplikasi memakai kamera (getUserMedia), GPS (geolocation), dsb.
2. Memasang IKON launcher asli Cek Blok (dibuat dari assets icon-512.png asli,
   tersimpan di apk-build/icons/) — menimpa ikon bawaan Capacitor.

Idempoten: aman dijalankan berulang (dipanggil GitHub Actions build-apk.yml).
Dijalankan dari folder apk-build/ :  python3 patch_android.py
"""
import os
import re
import shutil
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ANDROID = os.path.join(BASE, "android")
MAIN = os.path.join(ANDROID, "app", "src", "main")
MANIFEST = os.path.join(MAIN, "AndroidManifest.xml")
RES = os.path.join(MAIN, "res")
ICONS_SRC = os.path.join(BASE, "icons")

# Ijin yang dibutuhkan aplikasi (INTERNET sudah ada dari template Capacitor)
PERMISSIONS = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
]

DPI = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]


def pasang_manifest():
    if not os.path.isfile(MANIFEST):
        print(f"TIDAK ADA: {MANIFEST}")
        sys.exit(1)
    with open(MANIFEST, "r", encoding="utf-8") as f:
        xml = f.read()
    ditambah = 0
    for p in PERMISSIONS:
        if p in xml:
            continue
        # sisipkan sebelum <application ...>
        idx = xml.find("<application")
        if idx < 0:
            print("Anchor <application tidak ditemukan di manifest")
            sys.exit(1)
        xml = xml[:idx] + "    " + p + "\n    " + xml[idx:]
        ditambah += 1
    with open(MANIFEST, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Manifest: {ditambah} ijin ditambahkan (total {len(PERMISSIONS)} target).")


def pasang_ikon():
    if not os.path.isdir(ICONS_SRC):
        print(f"PERINGATAN: folder ikon tidak ada ({ICONS_SRC}) — ikon tidak diganti.")
        return
    # 1. hapus adaptive icon XML (agar launcher memakai PNG kita)
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    if os.path.isdir(anydpi):
        for name in os.listdir(anydpi):
            if name.startswith("ic_launcher"):
                os.remove(os.path.join(anydpi, name))
                print(f"  hapus adaptive: mipmap-anydpi-v26/{name}")
    # 2. salin PNG per-dpi
    for dpi in DPI:
        src_dir = os.path.join(ICONS_SRC, dpi)
        if not os.path.isdir(src_dir):
            continue
        dst_dir = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(dst_dir, exist_ok=True)
        for name in os.listdir(src_dir):
            shutil.copy2(os.path.join(src_dir, name), os.path.join(dst_dir, name))
            print(f"  ikon: mipmap-{dpi}/{name}")
    # 3. warna latar adaptive (dipakai bila launcher memakai background color)
    values = os.path.join(RES, "values")
    os.makedirs(values, exist_ok=True)
    with open(os.path.join(values, "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FDFDFF</color>\n</resources>\n')
    print("  latar adaptive: #FDFDFF (putih, sesuai ikon asli)")


def versi_aplikasi():
    """Set versionName agar mudah dikenali sebagai build baru."""
    gradle = os.path.join(ANDROID, "app", "build.gradle")
    if not os.path.isfile(gradle):
        print(f"PERINGATAN: {gradle} tidak ada — versionName tidak diubah.")
        return
    with open(gradle, "r", encoding="utf-8") as f:
        g = f.read()
    g2 = re.sub(r'versionName "[^"]*"', 'versionName "1.1"', g)
    if g2 != g:
        with open(gradle, "w", encoding="utf-8") as f:
            f.write(g2)
        print("versionName diset 1.1")


if __name__ == "__main__":
    if not os.path.isdir(ANDROID):
        print(f"Proyek android tidak ada: {ANDROID} (jalankan npx cap add android dulu)")
        sys.exit(1)
    print("== Patch proyek Android (ijin + ikon asli) ==")
    pasang_manifest()
    pasang_ikon()
    versi_aplikasi()
    print("Selesai.")
