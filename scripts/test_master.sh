#!/bin/bash
# Uji end-to-end fitur Data Master + kebun user + sync master
# Server: http://localhost:3000 (dev)
set -e
B=http://localhost:3000
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✔ $1"; }
ng(){ FAIL=$((FAIL+1)); echo "  ✘ $1"; }

echo "== 1. Login admin web =="
curl -s -c /tmp/cb_admin.txt -X POST $B/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' > /tmp/r.json
grep -q '"ok":true' /tmp/r.json && ok "login admin" || ng "login admin: $(cat /tmp/r.json)"

echo "== 2. Muat DB Aresta bawaan (admin) =="
curl -s -b /tmp/cb_admin.txt -X POST $B/api/master -H 'Content-Type: application/json' \
  -d '{"sumber":"bawaan","mode":"merge"}' > /tmp/r.json
echo "   -> $(head -c 200 /tmp/r.json)"
grep -q '"masuk":6041' /tmp/r.json && ok "impor bawaan 6041 blok" || ng "impor bawaan: $(cat /tmp/r.json)"

echo "== 3. Facets/ringkasan =="
curl -s -b /tmp/cb_admin.txt "$B/api/master?facets=1" > /tmp/r.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/r.json'))
assert d['ok'] and d['totalBlok'] == 6041, d.get('totalBlok')
assert d['totalKebun'] == 33, d.get('totalKebun')
assert d['totalEstate'] == 24, d.get('totalEstate')
k = [f for f in d['facets'] if f['kebun'] == 'KBM'][0]
assert k['bloks'] == 188, k
print(f"   -> total blok={d['totalBlok']} kebun={d['totalKebun']} estate={d['totalEstate']} luas={d['totalLuas']} pokok={d['totalPokok']}")
print("   ✔ facets benar (33 kebun, KBM=188 blok)")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ facets"; }

echo "== 4. Filter kebun=KBM afd=1 + cari H031 =="
curl -s -b /tmp/cb_admin.txt "$B/api/master?kebun=KBM&afdeling=1&q=H031" > /tmp/r.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/r.json'))
assert d['ok'] and d['total'] == 1, d['total']
r = d['rows'][0]
assert r['blok'] == 'H031' and r['luas'] == 36.8 and r['pokok'] == 2573, r
print(f"   ✔ filter ketemu: {r['kebun']}/{r['afdeling']}/{r['blok']} luas={r['luas']} pokok={r['pokok']}")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ filter"; }

echo "== 5. Edit luas/pokok blok (admin) =="
ID=$(python3 -c "import json;d=json.load(open('/tmp/r.json'));print(d['rows'][0]['id'])")
curl -s -b /tmp/cb_admin.txt -X PATCH $B/api/master/$ID -H 'Content-Type: application/json' \
  -d '{"luas":40.25,"pokok":2600}' > /tmp/r.json
grep -q '"luas":40.25' /tmp/r.json && ok "PATCH luas=40.25 pokok=2600" || ng "PATCH: $(cat /tmp/r.json)"
# kembalikan nilai asli
curl -s -b /tmp/cb_admin.txt -X PATCH $B/api/master/$ID -H 'Content-Type: application/json' -d '{"luas":36.8,"pokok":2573}' > /dev/null

echo "== 6. Impor CSV (2 blok baru) + gabung =="
curl -s -b /tmp/cb_admin.txt -X POST $B/api/master -H 'Content-Type: application/json' \
  -d '{"csv":"Estate;Kebun;Afdeling;Blok;Luas (Ha);Jumlah Pokok\nKBM;KBM;99;ZTEST1;1.5;100\nKBM;KBM;99;ZTEST2;2.0;200","mode":"merge"}' > /tmp/r.json
grep -q '"masuk":2' /tmp/r.json && ok "impor CSV 2 blok" || ng "impor CSV: $(cat /tmp/r.json)"
curl -s -b /tmp/cb_admin.txt "$B/api/master?kebun=KBM&afdeling=99" > /tmp/r.json
grep -q '"total":2' /tmp/r.json && ok "blok ZTEST ada" || ng "blok ZTEST: $(cat /tmp/r.json)"

echo "== 7. Buat user kebun KBM =="
curl -s -b /tmp/cb_admin.txt -X POST $B/api/admin/users -H 'Content-Type: application/json' \
  -d '{"username":"pengecekblok","name":"Pengecek KBM","password":"rahasia123","role":"USER","kebun":"KBM"}' > /tmp/r.json
grep -q '"kebun":"KBM"' /tmp/r.json && ok "user dibuat dengan kebun KBM" || ng "buat user: $(cat /tmp/r.json)"
UID_=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['user']['id'])" 2>/dev/null || true)

echo "== 8. Login HP pakai user itu -> respons harus berisi kebun =="
curl -s -X POST $B/api/app/login -H 'Content-Type: application/json' \
  -d '{"username":"pengecekblok","password":"rahasia123","device":"Test-Lab"}' > /tmp/r.json
grep -q '"kebun":"KBM"' /tmp/r.json && ok "login HP mengembalikan kebun KBM" || ng "login HP: $(cat /tmp/r.json)"
TOK=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['token'])" 2>/dev/null || true)

echo "== 9. Ambil Data Master (HP) -> hanya KBM =="
curl -s -H "Authorization: Bearer $TOK" "$B/api/sync/master" > /tmp/r.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/r.json'))
assert d['ok'] and d['kebun'] == 'KBM' and d['lingkup'] == 'KEBUN', (d.get('kebun'), d.get('lingkup'))
assert d['total'] == 190, d['total']  # 188 asli + 2 ZTEST
kebuns = set(r[1] for r in d['rows'])
assert kebuns == {'KBM'}, kebuns
r0 = [r for r in d['rows'] if r[3] == 'H031'][0]
assert abs(r0[4] - 36.8) < 0.001 and r0[5] == 2573, r0
print(f"   ✔ {d['total']} blok, hanya kebun KBM, format array [e,k,a,b,luas,pokok] benar")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ sync/master"; }

echo "== 10. Admin (tanpa kebun) -> semua blok =="
curl -s -b /tmp/cb_admin.txt -c /tmp/cb_admin.txt "$B/api/auth/me" > /dev/null
# pakai token admin: buat token lewat API tokens
curl -s -b /tmp/cb_admin.txt -X POST $B/api/tokens -H 'Content-Type: application/json' -d '{"label":"uji-admin"}' > /tmp/r.json
TOKA=$(python3 -c "import json;print(json.load(open('/tmp/r.json'))['token']['token'])" 2>/dev/null || true)
curl -s -H "Authorization: Bearer $TOKA" "$B/api/sync/master" > /tmp/r.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/r.json'))
assert d['ok'] and d['lingkup'] == 'SEMUA' and d['total'] > 6000, d['total']
print(f"   ✔ admin menerima {d['total']} blok (semua kebun)")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ sync/master admin"; }

echo "== 11. Sync download user KBM -> hanya transaksi KBM =="
# masukkan 2 transaksi: 1 KBM, 1 KRU (via sync/upload pakai token admin)
NOW=$(date +%s)000
curl -s -H "Authorization: Bearer $TOKA" -X POST $B/api/sync/upload -H 'Content-Type: application/json' > /tmp/r.json -d "{\"app\":\"cekblok-transfer\",\"v\":1,\"perangkat\":\"UjiLab\",\"dibuat\":$NOW,\"records\":[{\"kodeTransaksi\":\"UJIKBM1\",\"tanggal\":\"2026-10-24\",\"pemeriksa\":\"Pengecek KBM\",\"pt\":\"KBM\",\"kebun\":\"KBM\",\"afdeling\":\"1\",\"blok\":\"H031\",\"status\":\"B\",\"savedAt\":$NOW},{\"kodeTransaksi\":\"UJIKRU1\",\"tanggal\":\"2026-10-24\",\"pemeriksa\":\"Pengecek KBM\",\"pt\":\"KRU\",\"kebun\":\"KRU\",\"afdeling\":\"1\",\"blok\":\"B001\",\"status\":\"B\",\"savedAt\":$NOW}]}"
grep -q '"baru":2' /tmp/r.json && ok "upload 2 transaksi (KBM+KRU)" || ng "upload: $(cat /tmp/r.json)"
curl -s -H "Authorization: Bearer $TOK" "$B/api/sync/download" > /tmp/r.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/r.json'))
kebuns = set(r.get('kebun') for r in d['records'])
assert all(k == 'KBM' for k in kebuns), kebuns
print(f"   ✔ HP user KBM hanya menerima {d['total']} transaksi kebun KBM (KRU tidak ikut)")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ sync/download filter"; }

echo "== 12. Keamanan: tanpa login / token salah =="
C1=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/master?facets=1")
[ "$C1" = "401" ] && ok "GET /api/master tanpa login = 401" || ng "GET /api/master = $C1"
C2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer cbk_salah" "$B/api/sync/master")
[ "$C2" = "401" ] && ok "sync/master token salah = 401" || ng "sync/master token salah = $C2"
C3=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/cb_admin.txt -X POST $B/api/master -H 'Content-Type: application/json' -d '{"csv":"X"}')
echo "   (C3=$C3 — 400 wajar bila CSV tak valid, 403 bila bukan admin)"

echo "== 13. Hapus blok uji (admin) =="
curl -s -b /tmp/cb_admin.txt "$B/api/master?kebun=KBM&afdeling=99" > /tmp/r.json
python3 - <<'EOF'
import json, subprocess
d = json.load(open('/tmp/r.json'))
for r in d['rows']:
    subprocess.run(['curl','-s','-b','/tmp/cb_admin.txt','-X','DELETE',f"http://localhost:3000/api/master/{r['id']}"], capture_output=True)
print("   ✔ blok uji dihapus")
EOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  ✘ hapus"; }

echo ""
echo "==================================="
echo "HASIL: $PASS lulus, $FAIL gagal"
[ $FAIL -eq 0 ] && echo "SEMUA TES LULUS ✔" || echo "ADA TES GAGAL ✘"
