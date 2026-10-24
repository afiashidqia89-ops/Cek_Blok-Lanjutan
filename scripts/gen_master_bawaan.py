#!/usr/bin/env python3
"""Generate src/lib/master-bawaan.ts dari scripts/master_data.json.

Format kompak: satu string, satu blok per baris: estate|kebun|afdeling|blok|luas|pokok
Dipakai tombol "Muat DB Aresta Bawaan" di web Data Master.
"""
import json

SRC = "/home/z/my-project/scripts/master_data.json"
OUT = "/home/z/my-project/src/lib/master-bawaan.ts"

data = json.load(open(SRC, encoding="utf-8"))
lines = []
for r in data:
    luas = r["luas"]
    luas_s = ("%.2f" % luas).rstrip("0").rstrip(".") if luas is not None else ""
    lines.append(f"{r['estate']}|{r['kebun']}|{r['afdeling']}|{r['blok']}|{luas_s}|{r['pokok'] if r['pokok'] is not None else ''}")

body = "\n".join(lines)
content = f'''// ===== DB Aresta Bawaan (data master blok dari aplikasi Cek Blok) =====
// Dibuat otomatis oleh scripts/gen_master_bawaan.py — JANGAN edit manual.
// Format: satu baris = "estate|kebun|afdeling|blok|luas|pokok"
// Dipakai tombol "Muat DB Aresta Bawaan" di halaman web Data Master,
// sehingga server bisa mengisi DB Master tanpa perlu unggah berkas.

export const MASTER_BAWAAN_VERSI = "2026-10-24"

export const MASTER_BAWAAN = {json.dumps(body)}
'''
with open(OUT, "w", encoding="utf-8") as f:
    f.write(content)
print(f"OK: {OUT} ({len(data)} blok, {len(content)/1024:.0f} KB)")
