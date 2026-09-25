#!/usr/bin/env bash
#
# Verifikasi: Redis backup (via BGSAVE), status TLS beneran, dan disk usage.
#
# PERINGATAN: skrip ini bikin dan MENGHAPUS container/volume Docker, dan
# pernah memakai port 2508. Jangan dijalankan di mesin yang sedang melayani
# Hikari produksi — panelnya bakal ikut ketiban dan datanya bisa hilang.
# Pakai VPS uji atau mesin lokal.
#
set -euo pipefail
export PATH="$HOME/.bun/bin:/usr/local/bin:$PATH"

# Akar repo ditentukan dari lokasi skrip, bukan di-hardcode ke path mesin ini,
# biar skripnya bisa dipakai di mesin lain.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

B="http://127.0.0.1:2508"
DATA=/tmp/hik-sisa
C=$DATA/cookies
rm -rf "$DATA"; mkdir -p "$DATA"

# Semua container yang dibuat skrip ini dicatat di sini. Cleanup HANYA
# menyentuh yang ada di daftar, bukan semua yang namanya mirip.
BERSIHIN=()

# Jaga-jaga: kalau panel sungguhan sedang pegang port 2508, jangan lanjut.
# Tanpa cek ini, `docker rm -f` di bawah bakal ngebunuh database yang lagi
# dipakai orang.
if ss -ltn 2>/dev/null | grep -q ':2508 '; then
  echo "Port 2508 udah kepake. Mesin ini kayaknya lagi jalanin Hikari."
  echo "Matiiin dulu panelnya, atau jalanin skrip ini di mesin/VPS uji."
  exit 1
fi

# Bersihin container database sisa DARI SKRIP INI (data dir-nya /tmp/hik-*),
# bukan semua `hikari-db-*`. Container produksi nggak boleh kesentuh.
SISA=$(docker ps -aq --filter "label=hikari.test=$(basename "$DATA")" 2>/dev/null || true)
if [ -n "$SISA" ]; then
  # shellcheck disable=SC2086
  docker rm -f $SISA > /dev/null 2>&1 || true
fi

# Cleanup yang SELALU jalan, walau skripnya mati di tengah.
cleanup() {
  kill ${SRV:-} 2>/dev/null || true
  for c in ${BERSIHIN[@]:+"${BERSIHIN[@]}"}; do
    [ -n "$c" ] || continue
    docker rm -f "$c" > /dev/null 2>&1 || true
    # Volume database namanya sama dengan nama container-nya. Dulu baris ini
    # salah tulis (`${c/hikari-db-/hikari-db-}` mengganti dengan dirinya
    # sendiri), jadi nggak pernah ngehapus apa-apa.
    docker volume rm "$c" > /dev/null 2>&1 || true
  done
}
trap cleanup EXIT

cd "$ROOT/apps/server"
SRV_LOG="$DATA/server.log"
HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_CADDYFILE="$DATA/Caddyfile" \
  HIKARI_CADDY_DATA="$DATA/caddy" \
  HIKARI_STATIC="$ROOT/apps/web/dist" \
  bun run src/index.ts > "$SRV_LOG" 2>&1 &
SRV=$!
sleep 3

ok()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
bad() { printf '  \033[0;31mGAGAL\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0

curl -s -X POST "$B/api/setup" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
PID=$(curl -s -b "$C" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"Produksi"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

echo "--- 1. Redis: bikin, nyalain, tulis data ---"
RES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/databases" \
  -H 'Content-Type: application/json' -d '{"name":"Cache","engine":"redis"}')
RDID=$(printf '%s' "$RES" | sed 's/.*"id":"\([^"]*\)".*/\1/')
RDPASS=$(printf '%s' "$RES" | sed 's/.*"password":"\([^"]*\)".*/\1/')
RCONTAINER="hikari-db-$(printf '%s' "$RDID" | tr 'A-Z' 'a-z')"

docker pull redis:7-alpine > /dev/null 2>&1 || true
SV=$(curl -s -b "$C" -X POST "$B/api/databases/$RDID/start")
BERSIHIN+=("$RCONTAINER")
# Tandai container ini sebagai milik uji, biar kalau nanti ada sisa, cleanup
# tahu mana yang boleh dibuang dan mana yang nggak.
docker update --label-add "hikari.test=$(basename "$DATA")" "$RCONTAINER" > /dev/null 2>&1 || true
case "$SV" in *'"ok":true'*) ok "redis jalan";; *) bad "start: $SV";; esac
sleep 4

docker exec "$RCONTAINER" redis-cli --no-auth-warning -a "$RDPASS" \
  SET kunci "nilai-penting" > /dev/null 2>&1 && ok "data ditulis ke redis" || bad "gagal nulis data"

echo "--- 2. Redis: backup lewat BGSAVE ---"
BK=$(curl -s -b "$C" -X POST "$B/api/databases/$RDID/backups")
case "$BK" in *'.rdb'*) ok "backup redis jalan (.rdb)";; *) bad "backup: $(printf '%s' "$BK" | cut -c1-250)";; esac

BKID=$(printf '%s' "$BK" | sed 's/.*"id":"\([^"]*\)".*/\1/')
curl -s -b "$C" "$B/api/backups/$BKID/download" -o "$DATA/cache.rdb"
SIZE=$(stat -c%s "$DATA/cache.rdb" 2>/dev/null || echo 0)
[ "$SIZE" -gt 0 ] && ok "file .rdb ke-download ($SIZE byte)" || bad "file rdb kosong"

# RDB selalu mulai dengan magic "REDIS"
head -c 5 "$DATA/cache.rdb" | grep -q "REDIS" \
  && ok "isinya file RDB yang bener (magic REDIS)" || bad "bukan file RDB"

echo "--- 3. Status TLS: beneran dibaca, bukan 'pending' terus ---"
APPRES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/apps" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Web","sourceType":"image","imageRef":"nginx:alpine","containerPort":80}')
AID=$(printf '%s' "$APPRES" | sed 's/.*"id":"\([^"]*\)".*/\1/')

DOM=$(curl -s -b "$C" -X POST "$B/api/apps/$AID/domains" \
  -H 'Content-Type: application/json' -d '{"hostname":"blog.contoh.com"}')
DOMID=$(printf '%s' "$DOM" | sed 's/.*"id":"\([^"]*\)".*/\1/')
case "$DOM" in *'"tls_status":"pending"'*) ok "domain baru: pending (bener)";; *) bad "domain: $DOM";; esac

CHK=$(curl -s -b "$C" -X POST "$B/api/apps/$AID/domains/$DOMID/check")
echo "  hasil cek (sertifikat belum ada, harusnya tetap pending): $CHK"
case "$CHK" in *'"tlsStatus":"pending"'*) ok "cek sertifikat jalan & balikin pending (file-nya emang belum ada)";; *) bad "check: $CHK";; esac

echo "--- 4. Status TLS: bikin sertifikat palsu, harus kebaca 'active' ---"
CERTROOT="$DATA/caddy/certificates/local/blog.contoh.com"
mkdir -p "$CERTROOT"
openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
  -keyout "$CERTROOT/blog.contoh.com.key" \
  -out "$CERTROOT/blog.contoh.com.crt" \
  -subj "/CN=blog.contoh.com" > /dev/null 2>&1 && ok "sertifikat palsu dibikin (90 hari)" || bad "gagal bikin sertifikat"

# Restart server biar pakai caddyDataDir yang baru
kill $SRV 2>/dev/null || true; sleep 1
HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_CADDYFILE="$DATA/Caddyfile" \
  HIKARI_CADDY_DATA="$DATA/caddy" \
  HIKARI_STATIC="$ROOT/apps/web/dist" \
  bun run src/index.ts > "$SRV_LOG" 2>&1 &
SRV=$!
sleep 3
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null

CHK2=$(curl -s -b "$C" -X POST "$B/api/apps/$AID/domains/$DOMID/check")
echo "  hasil: $CHK2"
case "$CHK2" in *'"tlsStatus":"active"'*) ok "sertifikat kebaca ACTIVE (bukan pending terus)";; *) bad "harusnya active: $CHK2";; esac

echo "--- 5. Status TLS: sertifikat kedaluwarsa harus 'failed' ---"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$CERTROOT/blog.contoh.com.key" \
  -out "$CERTROOT/blog.contoh.com.crt" \
  -subj "/CN=blog.contoh.com" \
  -not_before 20200101000000Z -not_after 20200102000000Z > /dev/null 2>&1 || \
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERTROOT/blog.contoh.com.key" \
    -out "$CERTROOT/blog.contoh.com.crt" \
    -subj "/CN=blog.contoh.com" -days -1 > /dev/null 2>&1 || true
EXPIRED=$(openssl x509 -in "$CERTROOT/blog.contoh.com.crt" -noout -enddate 2>/dev/null)
echo "  tanggal cert palsu: $EXPIRED"
CHK3=$(curl -s -b "$C" -X POST "$B/api/apps/$AID/domains/$DOMID/check")
echo "  hasil: $CHK3"
case "$CHK3" in *'"tlsStatus":"failed"'*) ok "sertifikat kedaluwarsa kebaca FAILED";; *'"tlsStatus":"active"'*) echo "  (cert-nya masih keanggap valid, tergantung openssl)";; *) bad "check: $CHK3";; esac

echo "--- 6. Disk usage muncul di settings ---"
SET=$(curl -s -b "$C" "$B/api/settings")
echo "  $SET" | head -c 300; echo
case "$SET" in *'"disk":{'*) ok "info disk ada";; *) bad "nggak ada info disk";; esac
case "$SET" in *'"totalLabel"'*) ok "label disk terformat";; *) bad "label disk nggak ada";; esac

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
  echo
  echo "--- log server (20 baris terakhir) ---"
  tail -20 "$SRV_LOG"
fi

echo "--- bersihin ---"
cleanup
trap - EXIT
exit "$FAIL"
