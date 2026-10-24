#!/bin/bash
# ============================================================
# Membangun cek-blok-server-github.zip
# = paket proyek bersih siap unggah ke repo GitHub
# Isi: kode src/, prisma/, public/, docs/, workflows, konfigurasi
# Keluar: node_modules/.next/.env/db/worklog/artefak asisten
# ============================================================
set -euo pipefail

ROOT="/home/z/my-project"
OUT_DIR="$ROOT/download"
STAGE="$ROOT/.zipstage"
ZIP="$OUT_DIR/cek-blok-server-github.zip"

cd "$ROOT"

# Folder keluaran
mkdir -p "$OUT_DIR"

# Siapkan staging bersih
rm -rf "$STAGE"
mkdir -p "$STAGE"

# --- Daftar file & folder proyek yang disertakan ---
INCLUDE_FILES=(
  package.json
  bun.lock
  next.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  eslint.config.mjs
  components.json
  .gitignore
  .env.example
  README.md
)
INCLUDE_DIRS=(
  src
  prisma
  public
  docs
  scripts
  tests
  .github
)

for f in "${INCLUDE_FILES[@]}"; do
  [ -e "$f" ] || { echo "HILANG: $f" >&2; exit 1; }
  cp --parents "$f" "$STAGE/"
done

for d in "${INCLUDE_DIRS[@]}"; do
  [ -d "$d" ] || { echo "HILANG DIR: $d" >&2; exit 1; }
  cp -r "$d" "$STAGE/"
done

# --- Buang artefak yang bukan bagian proyek ---
rm -f "$STAGE/scripts/cover-only-check.html" \
      "$STAGE/scripts/patch_apk.py" \
      "$STAGE/scripts/preview-cover.png" \
      "$STAGE/scripts/preview-isi.png" \
      "$STAGE/scripts/preview-penutup.png" \
      "$STAGE/scripts/stamp_pages.py" \
      "$STAGE/public/app/.DS_Store"
find "$STAGE" -name ".DS_Store" -delete
find "$STAGE" -name "*.log" -delete

# --- Validasi file kunci sebelum zip ---
for kritikal in \
  "$STAGE/.github/workflows/db-migrate.yml" \
  "$STAGE/.github/workflows/ci.yml" \
  "$STAGE/prisma/schema.postgres.prisma" \
  "$STAGE/prisma/seed.ts" \
  "$STAGE/public/app/index.html" \
  "$STAGE/src/app/api/setup/route.ts" \
  "$STAGE/.env.example" \
  "$STAGE/docs/PANDUAN-LENGKAP-PEMULA.md"; do
  [ -e "$kritikal" ] || { echo "KRITIKAL HILANG: $kritikal" >&2; exit 1; }
done

# --- Buat zip ---
rm -f "$ZIP"
cd "$STAGE"
zip -r -q "$ZIP" .
cd "$ROOT"
rm -rf "$STAGE"

echo "=== SELESAI ==="
ls -lh "$ZIP"
echo "Jumlah file: $(unzip -l "$ZIP" | grep -cE '^\s+[0-9]+\s+[0-9]{4}-')"
