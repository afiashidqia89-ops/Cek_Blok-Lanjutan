#!/bin/bash
# Uji end-to-end API Cek Blok Server
set -e
BASE="http://localhost:3000"
JAR="/tmp/cb_cookies.txt"
rm -f "$JAR"

echo "== 1. Login admin =="
curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | head -c 200; echo

echo "== 2. Info sesi =="
curl -s -b "$JAR" "$BASE/api/auth/me" | head -c 200; echo

echo "== 3. Admin daftarkan user baru (fitur no.5) =="
curl -s -b "$JAR" -X POST "$BASE/api/admin/users" -H 'Content-Type: application/json' \
  -d '{"username":"pengecek1","name":"Budi Santoso","password":"rahasia1","role":"USER"}' | head -c 250; echo

echo "== 4. Daftar user =="
curl -s -b "$JAR" "$BASE/api/admin/users" | python3 -c "import json,sys; d=json.load(sys.stdin); print('jumlah user:', len(d['users']), [u['username'] for u in d['users']])"

echo "== 5. Buat token perangkat utk pengecek1 =="
UID1=$(curl -s -b "$JAR" "$BASE/api/admin/users" | python3 -c "import json,sys; d=json.load(sys.stdin); print([u['id'] for u in d['users'] if u['username']=='pengecek1'][0])")
TOKEN=$(curl -s -b "$JAR" -X POST "$BASE/api/tokens" -H 'Content-Type: application/json' \
  -d "{\"label\":\"HP Pengecek 1\",\"userId\":\"$UID1\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['token']['token'])")
echo "token: ${TOKEN:0:16}..."

echo "== 6. Tes koneksi sync (Bearer) =="
curl -s "$BASE/api/sync/status" -H "Authorization: Bearer $TOKEN" | head -c 200; echo

echo "== 7. Upload transfer JSON via sync (dari 'aplikasi') =="
cat > /tmp/transfer1.json <<'EOF'
{"app":"cekblok-transfer","v":1,"perangkat":"HP-Andi","dibuat":1700000000000,"foto":true,"bagian":1,"dari":1,"jumlah":3,"records":[
{"kodeTransaksi":"H031-20240101-001","savedAt":1700000000001,"tanggal":"2024-01-01","pemeriksa":"Andi","pt":"KBM","kebun":"KBM","afdeling":"1","blok":"H031","luas":36.8,"pokok":2573,"semak":1.5,"tunasan":10,"titi":0,"kerdil":2,"banjir":0,"catatan":"uji coba 1","status":"Perhatian","details":[{"label":"Semak","value":1.5}]},
{"kodeTransaksi":"H032-20240101-002","savedAt":1700000000002,"tanggal":"2024-01-01","pemeriksa":"Andi","pt":"KBM","kebun":"KBM","afdeling":"1","blok":"H032","semak":0,"tunasan":0,"titi":1,"kerdil":0,"banjir":0,"catatan":"uji coba 2","status":"Baik","details":[]},
{"kodeTransaksi":"H033-20240101-003","savedAt":1700000000003,"tanggal":"2024-01-01","pemeriksa":"Andi","pt":"KBM","kebun":"KBM","afdeling":"1","blok":"H033","semak":0,"tunasan":0,"titi":0,"kerdil":0,"banjir":3.2,"catatan":"uji coba 3","status":"Kritis","details":[]}]}
EOF
curl -s -X POST "$BASE/api/sync/upload" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data @/tmp/transfer1.json; echo

echo "== 8. Upload ULANG (harus semua duplikat) =="
curl -s -X POST "$BASE/api/sync/upload" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data @/tmp/transfer1.json; echo

echo "== 9. Download via sync =="
curl -s "$BASE/api/sync/download?cursor=0&dari=0" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok:',d['ok'],'| jumlah:',d['jumlah'],'| total:',d['total'],'| selesai:',d['selesai'],'| app:',d['app'])
print('blok:', [r.get('blok') for r in d['records']])"

echo "== 10. Daftar data via web (admin) =="
curl -s -b "$JAR" "$BASE/api/data?page=1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok:',d['ok'],'| total:',d['total'],'| seeAll:',d['seeAll'])"

echo "== 11. Upload berkas via web multipart =="
curl -s -b "$JAR" -X POST "$BASE/api/data/upload" -F "file=@/tmp/transfer1.json" | head -c 250; echo

echo "== 12. Ekspor web (unduh berkas transfer) =="
curl -s -b "$JAR" -D /tmp/hdr.txt "$BASE/api/data/export?foto=1" -o /tmp/eksport.json && grep -i 'content-disposition' /tmp/hdr.txt && python3 -c "
import json
d=json.load(open('/tmp/eksport.json'))
print('app:',d['app'],'| perangkat:',d['perangkat'],'| jumlah:',d['jumlah'])"

echo "== 13. Buat tautan berbagi =="
SHARE=$(curl -s -b "$JAR" -X POST "$BASE/api/share" -H 'Content-Type: application/json' \
  -d '{"name":"Data Januari 2024","tanggalFrom":"2024-01-01","tanggalTo":"2024-01-31","withPhoto":true}')
STOKEN=$(echo "$SHARE" | python3 -c "import json,sys; print(json.load(sys.stdin)['share']['token'])")
echo "share token: $STOKEN"

echo "== 14. Unduh via tautan publik =="
curl -s -D /tmp/hdr2.txt "$BASE/api/share/$STOKEN" -o /tmp/share.json && grep -i 'content-disposition' /tmp/hdr2.txt && python3 -c "
import json
d=json.load(open('/tmp/share.json'))
print('jumlah:',d['jumlah'],'| app:',d['app'])"

echo "== 15. Halaman publik share =="
curl -s -o /dev/null -w "%{http_code}" "$BASE/share/$STOKEN"; echo " /share/$STOKEN"

echo "== 16. Statistik admin =="
curl -s -b "$JAR" "$BASE/api/stats" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('role:',d['role'],'| totalRecords:',d['totalRecords'],'| totalUsers:',d['totalUsers'],'| tokens:',d['activeTokens'])"

echo "== 17. Ubah pengaturan =="
curl -s -b "$JAR" -X PUT "$BASE/api/admin/settings" -H 'Content-Type: application/json' \
  -d '{"siteTitle":"Cek Blok Server","maxUploadMB":"25","syncEnabled":"1"}' | head -c 150; echo

echo "== 18. Log aktivitas =="
curl -s -b "$JAR" "$BASE/api/admin/logs?page=1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('total log:',d['total'],'| terbaru:',[l['action'] for l in d['logs'][:6]])"

echo "== 19. Aplikasi patched tersaji =="
curl -s -o /dev/null -w "%{http_code}" "$BASE/app/"; echo " /app/"
curl -s "$BASE/app/" | grep -c 'srvSendBtn' | xargs echo "kemunculan srvSendBtn:"

echo "== 20. Sync ditolak tanpa token =="
curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sync/download"; echo " (harap 401)"

echo ""
echo "SEMUAPENGUJIANSELESAI"
