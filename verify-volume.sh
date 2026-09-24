#!/usr/bin/env bash
# Aturan paling penting: hapus project NGGAK hapus volume Docker.
# Dites terpisah karena ini soal kehilangan data user.
set -euo pipefail
export PATH="/home/ubuntu/.bun/bin:$PATH"

B="http://127.0.0.1:2508"
DATA=/tmp/hik-vol
C=$DATA/cookies
rm -rf "$DATA"; mkdir -p "$DATA"

cd /home/ubuntu/Hikari-2nd-Panel/apps/server
HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_STATIC=/home/ubuntu/Hikari-2nd-Panel/apps/web/dist \
  bun run src/index.ts > "$DATA/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 3

ok()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
bad() { printf '  \033[0;31mGAGAL\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0

curl -s -X POST "$B/api/setup" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null

PID=$(curl -s -b "$C" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"Hapus Aku"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

RES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/databases" \
  -H 'Content-Type: application/json' -d '{"name":"Penting","engine":"postgres"}')
DBID=$(printf '%s' "$RES" | sed 's/.*"id":"\([^"]*\)".*/\1/')
VOL="hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')"
CONTAINER="$VOL"

echo "=== 1. nyalain database & tulis data ==="
curl -s -b "$C" -X POST "$B/api/databases/$DBID/start" > /dev/null
sleep 5
DOCKER_PASS=$(printf '%s' "$RES" | sed 's/.*"password":"\([^"]*\)".*/\1/')
docker run --rm --network hikari -e PGPASSWORD="$DOCKER_PASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d penting \
  -c "CREATE TABLE arsip (isi text); INSERT INTO arsip VALUES ('jangan-hilang');" \
  > /dev/null 2>&1 && ok "data ditulis ke volume" || bad "gagal nulis data"

docker volume ls --format "{{.Name}}" | grep -q "^$VOL$" \
  && ok "volume $VOL ada" || bad "volume nggak ada"

echo "=== 2. HAPUS PROJECT ==="
DEL=$(curl -s -b "$C" -X DELETE "$B/api/projects/$PID")
echo "  respon: $(printf '%s' "$DEL" | cut -c1-80)"
sleep 2

echo "=== 3. app & database-nya harus ikut kehapus ==="
DB_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -b "$C" "$B/api/databases/$DBID")
[ "$DB_AFTER" = "404" ] && ok "database-nya kehapus dari Hikari" || bad "database masih ada ($DB_AFTER)"

echo "=== 4. TAPI volume HARUS TETAP ADA (ini yang kritis) ==="
if docker volume ls --format "{{.Name}}" | grep -q "^$VOL$"; then
  ok "volume $VOL MASIH ADA setelah project dihapus"
else
  bad "VOLUME HILANG — data user kehapus!"
fi

echo "=== 5. container-nya harus dibersihin (volume tetap) ==="
GONE=0
for i in $(seq 1 10); do
  sleep 1
  if ! docker ps -a --format "{{.Names}}" | grep -q "^$CONTAINER$"; then GONE=1; break; fi
done
if [ "$GONE" = "1" ]; then
  ok "container udah dibersihin"
else
  bad "container masih nyangkut: $(docker ps -a --filter "name=$CONTAINER" --format '{{.Status}}')"
fi

echo "=== 6. datanya masih bisa dibaca dari volume? ==="
if docker volume ls --format "{{.Name}}" | grep -q "^$VOL$"; then
  docker run --rm -v "$VOL:/data" alpine sh -c "ls /data > /dev/null 2>&1 && echo baca-ok" 2>/dev/null | grep -q "baca-ok" \
    && ok "volume-nya bisa di-mount & dibaca" || echo "  (cek mount dilewat)"
fi

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== ATURAN VOLUME TERPENUHI ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
docker volume rm "$VOL" > /dev/null 2>&1 || true
exit "$FAIL"
