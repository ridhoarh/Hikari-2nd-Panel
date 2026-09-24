#!/usr/bin/env bash
# Verifikasi Fase 2 dari kondisi bersih: database sungguhan + storage.
set -euo pipefail
export PATH="/home/ubuntu/.bun/bin:$PATH"

B="http://127.0.0.1:2508"
DATA=/tmp/hik-fase2
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
  -d '{"name":"Produksi"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

echo "--- 1. bikin database postgres ---"
RES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/databases" \
  -H 'Content-Type: application/json' -d '{"name":"Produksi","engine":"postgres"}')
DBID=$(printf '%s' "$RES" | sed 's/.*"id":"\([^"]*\)".*/\1/')
DBPASS=$(printf '%s' "$RES" | sed 's/.*"password":"\([^"]*\)".*/\1/')
[ "${#DBPASS}" = "32" ] && ok "password 32 karakter" || bad "password: ${#DBPASS} karakter"
ok "database dibuat (id=$DBID)"

echo "--- 2. nyalain postgres sungguhan ---"
docker pull postgres:16-alpine > /dev/null 2>&1 || true
START=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/start")
case "$START" in *'"ok":true'*) ok "container postgres jalan";; *) bad "start: $START";; esac
sleep 4
docker ps --filter "name=hikari-db-" --format "{{.Names}} | {{.Status}}" | head -5

echo "--- 3. batas & isolasi container ---"
ENC=$(docker inspect "hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')" \
  --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{range $p,$c := .NetworkSettings.Ports}}{{(index $c 0).HostIp}}:{{(index $c 0).HostPort}}{{end}}' 2>/dev/null || echo "")
MEM=$(printf '%s' "$ENC" | cut -d'|' -f1)
HOST=$(printf '%s' "$ENC" | cut -d'|' -f3)
[ "$MEM" = "536870912" ] && ok "memory limit 512MB kepasang" || bad "memory=$MEM"
case "$HOST" in 127.0.0.1:*) ok "port cuma di localhost ($HOST)";; *) bad "port: $HOST";; esac

HPORT=$(printf '%s' "$HOST" | cut -d: -f2)
echo "  host port = $HPORT (harus di range 20000-an)"
case "$HPORT" in 2[0-9][0-9][0-9][0-9]) ok "host port di range database";; *) bad "host port: $HPORT";; esac

echo "--- 4. beneran bisa disambungin? ---"
docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')" -U hikari -d produksi \
  -c "SELECT 'sambung-ok' AS hasil;" 2>&1 | grep -q "sambung-ok" \
  && ok "psql bisa nyambung lewat network Docker" \
  || bad "psql gagal nyambung"

echo "--- 5. connection string ---"
INFO=$(curl -s -b "$C" "$B/api/databases/$DBID")
CS=$(printf '%s' "$INFO" | sed 's/.*"connectionString":"\([^"]*\)".*/\1/')
case "$CS" in postgresql://hikari:*@127.0.0.1:2*) ok "connection string bener ($(printf '%s' "$CS" | cut -c1-40)...)";; *) bad "connection string: $CS";; esac
case "$CS" in *"$DBPASS"*) ok "password di connection string udah didekripsi";; *) bad "password nggak muncul di connection string";; esac

echo "--- 6. tulis data, terus backup ---"
CONTAINER="hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')"
docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi \
  -c "CREATE TABLE tes (id int); INSERT INTO tes VALUES (42);" > /dev/null 2>&1 \
  && ok "data ditulis ke database" || bad "gagal nulis data"

BK=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/backups")
BKID=$(printf '%s' "$BK" | sed 's/.*"id":"\([^"]*\)".*/\1/')
case "$BK" in *backup-*) ok "backup jalan";; *) bad "backup: $(printf '%s' "$BK" | cut -c1-200)";; esac

DL=$(curl -s -b "$C" "$B/api/backups/$BKID/download" -o "$DATA/hasil.sql" -w '%{http_code}')
[ "$DL" = "200" ] && ok "file backup bisa di-download" || bad "download: $DL"
grep -q "42" "$DATA/hasil.sql" 2>/dev/null && ok "isi backup ada data (INSERT 42)" || bad "isi backup kosong"

echo "--- 7. ganti mode: internal -> public butuh konfirmasi ---"
NOACK=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/access" \
  -H 'Content-Type: application/json' -d '{"mode":"public"}')
case "$NOACK" in *risiko*) ok "public tanpa konfirmasi ditolak";; *) bad "harusnya ditolak: $NOACK";; esac

YESACK=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/access" \
  -H 'Content-Type: application/json' -d '{"mode":"public","understandRisk":true}')
case "$YESACK" in *'"ok":true'*) ok "public dengan konfirmasi diterima";; *) bad "public: $(printf '%s' "$YESACK" | cut -c1-200)";; esac
sleep 3
ENC2=$(docker inspect "$CONTAINER" --format '{{range $p,$c := .NetworkSettings.Ports}}{{(index $c 0).HostIp}}{{end}}' 2>/dev/null || echo "")
[ "$ENC2" = "0.0.0.0" ] && ok "container dibikin ulang, port kebuka ke 0.0.0.0" || bad "HostIp jadi: $ENC2"

echo "--- 8. data masih ada setelah ganti mode? ---"
docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi -tAc "SELECT id FROM tes;" 2>&1 | grep -q "42" \
  && ok "data selamat (volume nggak kehapus)" || bad "data hilang setelah ganti mode"

echo "--- 9. mode domain + sslmode ---"
DOM=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/access" \
  -H 'Content-Type: application/json' -d '{"mode":"domain","domain":"db.contoh.com"}')
case "$DOM" in *sslmode=require*) ok "mode domain nambahin sslmode=require";; *) bad "domain: $(printf '%s' "$DOM" | cut -c1-200)";; esac

echo "--- 10. MinIO + bucket ---"
docker pull minio/minio:latest > /dev/null 2>&1 || true
MO=$(curl -s -b "$C" -X POST "$B/api/storage/start")
case "$MO" in *'"ok":true'*) ok "MinIO jalan";; *) bad "minio: $MO";; esac
BKT=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/buckets" \
  -H 'Content-Type: application/json' -d '{"name":"aset"}')
case "$BKT" in *secret_key*) ok "bucket dibuat, secret key dikasih";; *) bad "bucket: $BKT";; esac
LIST=$(curl -s -b "$C" "$B/api/projects/$PID/buckets")
case "$LIST" in *'••••••••'*) ok "list bucket nyembunyiin secret key";; *) bad "list bocorin secret: $LIST";; esac
docker ps --filter "name=hikari-minio" --format "{{.Names}} | {{.Status}}" | head -2

echo "--- 11. hapus database: volume HARUS tetap ada ---"
VOL=$(curl -s -b "$C" "$B/api/databases/$DBID" | sed 's/.*"volume_name":"\([^"]*\)".*/\1/')
DEL=$(curl -s -b "$C" -X DELETE "$B/api/databases/$DBID")
case "$DEL" in *volumeKept*) ok "respon infokan volume dipertahankan";; *) bad "hapus: $DEL";; esac
docker volume ls --format "{{.Name}}" | grep -q "$VOL" \
  && ok "volume $VOL MASIH ADA setelah database dihapus" \
  || bad "volume hilang!"

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI FASE 2 LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')" hikari-minio > /dev/null 2>&1 || true
docker volume rm "$VOL" > /dev/null 2>&1 || true
docker volume rm hikari-minio-data > /dev/null 2>&1 || true
exit "$FAIL"
