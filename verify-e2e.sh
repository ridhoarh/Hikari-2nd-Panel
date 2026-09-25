#!/usr/bin/env bash
# Verifikasi final dari kondisi bersih: deploy app sungguhan dari nol.
set -euo pipefail
#
# PERINGATAN: skrip ini bikin dan MENGHAPUS container/volume Docker, dan
# pernah memakai port 2508. Jangan dijalankan di mesin yang sedang melayani
# Hikari produksi — panelnya bakal ikut ketiban dan datanya bisa hilang.
# Pakai VPS uji atau mesin lokal.
#

# Akar repo ditentukan dari lokasi skrip, bukan di-hardcode ke path
# mesin ini, biar skripnya bisa dipakai di mesin lain.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.bun/bin:/usr/local/bin:$PATH"

B="http://127.0.0.1:2508"
DATA=/tmp/hik-final
C=$DATA/cookies

# Selalu mulai dari nol biar bisa dijalanin berulang kali.
rm -rf "$DATA"
mkdir -p "$DATA"

cd "${ROOT}/apps/server"
HIKARI_PORT=2508 HIKARI_DATA="$DATA" \
  HIKARI_STATIC="${ROOT}/apps/web/dist" \
  bun run src/index.ts > "$DATA/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 3

ok()   { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[0;31mGAGAL\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0

echo "--- 1. setup & login ---"
curl -s -X POST "$B/api/setup" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
ME=$(curl -s -b "$C" "$B/api/auth/me")
case "$ME" in *admin*) ok "login jalan";; *) bad "login: $ME";; esac

echo "--- 2. project & app ---"
PID=$(curl -s -b "$C" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"Produksi"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

# Repo git lokal dengan Dockerfile + server HTTP sederhana.
REPO=$DATA/repo
mkdir -p "$REPO"
cat > "$REPO/Dockerfile" <<'DOCKER'
FROM alpine:3.20
RUN apk add --no-cache busybox-extras > /dev/null 2>&1 || true
RUN echo "halo dari hikari" > /srv/index.html
WORKDIR /srv
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080"]
DOCKER

cd "$REPO"
git init -q -b main
git add -A
GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t \
  git commit -q -m "app pertama"

APPRES=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/apps" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Web\",\"sourceType\":\"giturl\",\"repoUrl\":\"$REPO\",\"branch\":\"main\",\"containerPort\":8080,\"memoryLimitMb\":96}")
AID=$(printf '%s' "$APPRES" | sed 's/.*"id":"\([^"]*\)".*/\1/')
SLUG=$(printf '%s' "$APPRES" | sed 's/.*"slug":"\([^"]*\)".*/\1/')
ok "app dibuat (slug=$SLUG, batas RAM 96MB)"

echo "--- 3. env var ---"
curl -s -b "$C" -X POST "$B/api/apps/$AID/env" -H 'Content-Type: application/json' \
  -d '{"key":"NODE_ENV","value":"production","isSecret":false}' > /dev/null
curl -s -b "$C" -X POST "$B/api/apps/$AID/env" -H 'Content-Type: application/json' \
  -d '{"key":"TOKEN","value":"rahasia123","isSecret":true}' > /dev/null
ENV=$(curl -s -b "$C" "$B/api/apps/$AID/env")
case "$ENV" in *'"value":"production"'*) ok "env biasa keliatan";; *) bad "env biasa: $ENV";; esac
case "$ENV" in *'rahasia123'*) bad "env rahasia BOCOR";; *) ok "env rahasia ketutup";; esac

echo "--- 4. deploy sungguhan ---"
curl -s -b "$C" -X POST "$B/api/apps/$AID/deploy" > /dev/null
STATUS=""
for i in $(seq 1 60); do
  sleep 3
  S=$(curl -s -b "$C" "$B/api/apps/$AID/status")
  case "$S" in *'"status":"running"'*'"running":true'*) STATUS=running; break;; esac
  case "$S" in *'"status":"failed"'*) STATUS=failed; break;; esac
done
if [ "$STATUS" = running ]; then ok "deploy berhasil, container jalan"; else
  bad "deploy: $S"
  echo "  log: $(cat "$(ls -t $DATA/logs/*.log 2>/dev/null | head -1)" 2>/dev/null | tail -5)"
fi

echo "--- 5. container benar-benar jalan & kebatas ---"
ENC=$(docker inspect "hikari-app-$SLUG" \
  --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{range $p,$c := .NetworkSettings.Ports}}{{(index $c 0).HostIp}}:{{(index $c 0).HostPort}}{{end}}' 2>/dev/null || echo "")
MEM=$(printf '%s' "$ENC" | cut -d'|' -f1)
SWAP=$(printf '%s' "$ENC" | cut -d'|' -f2)
HOST=$(printf '%s' "$ENC" | cut -d'|' -f3)
[ "$MEM" = "100663296" ] && ok "memory limit 96MB kepasang" || bad "memory=$MEM (harus 100663296)"
[ "$MEM" = "$SWAP" ] && ok "swap = memory (nggak bisa bocor ke disk)" || bad "swap=$SWAP"
case "$HOST" in 127.0.0.1:*) ok "port cuma di localhost ($HOST)";; *) bad "port bind: $HOST";; esac

PORT=$(printf '%s' "$HOST" | cut -d: -f2)
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || echo 000)
[ "$CODE" = "200" ] && ok "app jawab HTTP 200" || bad "app jawab HTTP $CODE"

IP=$(hostname -I | awk '{print $1}')
# --max-time bikin curl gagal >1 kali, jadi keluaran ganda kayak "000000".
# Pakai --max-time 3 + --retry 0 dan ambil 3 karakter terakhir.
EXT=$(curl -s --max-time 3 --retry 0 -o /dev/null -w '%{http_code}' "http://$IP:$PORT/" 2>/dev/null | tail -c 3 || true)
EXT=${EXT:-000}
[ "$EXT" = "000" ] && ok "nggak bisa diakses dari luar (HTTP 000)" || bad "BISA diakses dari luar: $EXT"

echo "--- 6. env var masuk ke container ---"
DOCKER_ENV=$(docker inspect "hikari-app-$SLUG" --format '{{json .Config.Env}}')
case "$DOCKER_ENV" in *NODE_ENV=production*) ok "env var kepasang di container";; *) bad "env: $DOCKER_ENV";; esac

echo "--- 7. SPA & API 404 ---"
curl -s "$B/" | grep -q "doctype" && ok "index.html diserve" || bad "index.html"
C404=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/nggak-ada")
[ "$C404" = "404" ] && ok "API nggak ada -> 404 JSON" || bad "API 404: $C404"
curl -s "$B/projects/apa-saja" | grep -q "doctype" && ok "SPA fallback jalan" || bad "SPA fallback"

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "hikari-app-$SLUG" > /dev/null 2>&1 || true
docker buildx rm hikari-buildkit > /dev/null 2>&1 || true
exit "$FAIL"
