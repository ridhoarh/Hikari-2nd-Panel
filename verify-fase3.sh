#!/usr/bin/env bash
# Verifikasi sisa Fase 3: restore, backup terjadwal, dan terminal container.
set -euo pipefail
export PATH="/home/ubuntu/.bun/bin:$PATH"

B="http://127.0.0.1:2508"
DATA=/tmp/hik-fase3b
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

RES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/databases" \
  -H 'Content-Type: application/json' -d '{"name":"Produksi","engine":"postgres"}')
DBID=$(printf '%s' "$RES" | sed 's/.*"id":"\([^"]*\)".*/\1/')
DBPASS=$(printf '%s' "$RES" | sed 's/.*"password":"\([^"]*\)".*/\1/')
CONTAINER="hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')"

curl -s -b "$C" -X POST "$B/api/databases/$DBID/start" > /dev/null
sleep 5

echo "--- 1. siapin data awal ---"
docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi \
  -c "CREATE TABLE penting (isi text); INSERT INTO penting VALUES ('data-asli');" \
  > /dev/null 2>&1 && ok "data awal ditulis" || bad "gagal nulis data awal"

echo "--- 2. backup ---"
BK=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/backups")
BKID=$(printf '%s' "$BK" | sed 's/.*"id":"\([^"]*\)".*/\1/')
case "$BK" in *backup-*) ok "backup jalan";; *) bad "backup: $(printf '%s' "$BK" | cut -c1-150)";; esac
curl -s -b "$C" "$B/api/backups/$BKID/download" -o "$DATA/dump.sql"
grep -q "data-asli" "$DATA/dump.sql" && ok "dump berisi data awal" || bad "dump kosong"

echo "--- 3. ubah data, terus RESTORE dari dump ---"
docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi \
  -c "DELETE FROM penting; INSERT INTO penting VALUES ('data-rusak');" > /dev/null 2>&1
SEBELUM=$(docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi -tAc "SELECT isi FROM penting;" 2>/dev/null | tr -d ' ')
[ "$SEBELUM" = "data-rusak" ] && ok "data udah diubah jadi 'data-rusak'" || bad "data: $SEBELUM"

REST=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/restore" \
  -H 'Content-Type: text/plain' --data-binary "@$DATA/dump.sql")
case "$REST" in *'"ok":true'*) ok "restore diterima";; *) bad "restore: $(printf '%s' "$REST" | cut -c1-250)";; esac

SESUDAH=$(docker run --rm --network hikari -e PGPASSWORD="$DBPASS" postgres:16-alpine \
  psql -h "$CONTAINER" -U hikari -d produksi -tAc "SELECT isi FROM penting LIMIT 1;" 2>/dev/null | tr -d ' ')
[ "$SESUDAH" = "data-asli" ] && ok "DATA BALIK ke 'data-asli' — restore beneran jalan" \
  || bad "data setelah restore: '$SESUDAH' (harusnya 'data-asli')"

echo "--- 4. restore nolak file sampah ---"
NOLAK=$(curl -s -b "$C" -X POST "$B/api/databases/$DBID/restore" \
  -H 'Content-Type: text/plain' --data-binary "ini bukan dump sql sama sekali")
case "$NOLAK" in *"bukan dump"*) ok "file sampah ditolak";; *) bad "harusnya ditolak: $NOLAK";; esac

echo "--- 5. jadwal backup otomatis ---"
SCH=$(curl -s -b "$C" "$B/api/backup-schedule")
case "$SCH" in *'"aktif":false'*) ok "default-nya mati";; *) bad "jadwal awal: $SCH";; esac

SET=$(curl -s -b "$C" -X POST "$B/api/backup-schedule" -H 'Content-Type: application/json' \
  -d '{"intervalHours":24}')
case "$SET" in *'"aktif":true'*) ok "jadwal dinyalain (24 jam)";; *) bad "set jadwal: $SET";; esac

SET0=$(curl -s -b "$C" -X POST "$B/api/backup-schedule" -H 'Content-Type: application/json' \
  -d '{"intervalHours":0}')
case "$SET0" in *'"aktif":false'*) ok "jadwal bisa dimatiin lagi";; *) bad "matiin jadwal: $SET0";; esac

TOLAK=$(curl -s -o /dev/null -w '%{http_code}' -b "$C" -X POST "$B/api/backup-schedule" \
  -H 'Content-Type: application/json' -d '{"intervalHours":99999}')
[ "$TOLAK" = "400" ] && ok "interval ngawur ditolak" || bad "interval ngawur dapet $TOLAK"

echo "--- 6. backup manual via jadwal ---"
RUN=$(curl -s -b "$C" -X POST "$B/api/backup-schedule/run")
case "$RUN" in *'"berhasil":1'*) ok "backup manual lewat jadwal berhasil";; *) bad "run: $(printf '%s' "$RUN" | cut -c1-200)";; esac

echo "--- 7. terminal: shell container ke-deteksi ---"
SHELLS=$(docker exec "$CONTAINER" sh -c 'for s in /bin/bash /bin/ash /bin/sh sh; do command -v $s 2>/dev/null && break; done' 2>/dev/null || echo "")
[ -n "$SHELLS" ] && ok "shell di container ketemu: $SHELLS" || bad "nggak ada shell di container"

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI FASE 3 (BAGIAN 2) LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
docker volume rm "hikari-db-$(printf '%s' "$DBID" | tr 'A-Z' 'a-z')" > /dev/null 2>&1 || true
exit "$FAIL"
