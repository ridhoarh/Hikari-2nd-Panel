#!/usr/bin/env bash
# Verifikasi terminal WebSocket: beneran nyambung ke container & bisa ngetik.
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
DATA=/tmp/hik-term
C=$DATA/cookies
rm -rf "$DATA"; mkdir -p "$DATA"

cd "${ROOT}/apps/server"
HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_STATIC="${ROOT}/apps/web/dist" \
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
COOKIE=$(grep hikari_session "$C" | awk '{print $7}')
PID=$(curl -s -b "$C" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"Term"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

APP=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/apps" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Shell","sourceType":"image","imageRef":"alpine:3.20","containerPort":80}')
AID=$(printf '%s' "$APP" | sed 's/.*"id":"\([^\"]*\)".*/\1/')
SLUG=$(printf '%s' "$APP" | sed 's/.*"slug":"\([^\"]*\)".*/\1/')

echo "--- 1. container alpine yang prosesnya lama (biar bisa di-exec) ---"
# alpine:3.20 tanpa CMD langsung keluar, jadi Docker restart terus dan
# `docker exec` nggak bisa jalan. Pakai image yang emang punya proses lama.
docker pull alpine:3.20 > /dev/null 2>&1 || true
docker run -d --name "hikari-app-$SLUG" --network hikari \
  --memory 128m --memory-swap 128m --restart unless-stopped \
  alpine:3.20 sh -c 'while true; do sleep 3600; done' > /dev/null
sleep 3
docker ps --filter "name=hikari-app-$SLUG" --format "{{.Names}} | {{.Status}}" | head -2
docker ps --format "{{.Names}}" | grep -q "hikari-app-$SLUG" \
  && ok "container jalan & bisa di-exec" || bad "container nggak jalan"

echo "--- 2. handshake TANPA cookie harus 401 ---"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "$B/api/apps/$AID/terminal")
[ "$NOAUTH" = "401" ] && ok "tanpa cookie ditolak 401" || bad "tanpa cookie dapet $NOAUTH"

echo "--- 3. handshake dengan cookie harus 101 (upgrade) ---"
WITH=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Cookie: hikari_session=$COOKIE" \
  "$B/api/apps/$AID/terminal")
[ "$WITH" = "101" ] && ok "cookie bener -> 101 Switching Protocols" || bad "dapet $WITH (harusnya 101)"

echo "--- 4. app yang nggak ada harus 404 ---"
GONE=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Cookie: hikari_session=$COOKIE" \
  "$B/api/apps/nggak-ada/terminal")
[ "$GONE" = "404" ] && ok "app nggak ada -> 404" || bad "dapet $GONE"

echo "--- 5. alur penuh: kirim perintah, baca hasilnya ---"
HASIL=$(bun -e '
const url = process.argv[1]
const cookie = process.argv[2]
const ws = new WebSocket(url, { headers: { Cookie: `hikari_session=${cookie}` } })
let out = ""
ws.onmessage = (e) => { out += typeof e.data === "string" ? e.data : "" }
ws.onopen = () => {
  // Tunggu dikit: server baru selesai nyiapin sesi Docker-nya di `open`.
  // Kalau langsung kirim, sesinya belum tentu siap.
  setTimeout(() => {
    // Terminal butuh \r (carriage return), bukan \n.
    ws.send("echo HALO-DARI-TERMINAL\r")
  }, 800)
  setTimeout(() => { ws.close() }, 3000)
}
ws.onclose = () => {
  console.log(out.includes("HALO-DARI-TERMINAL") ? "KETEMU" : "NGGAK:" + JSON.stringify(out.slice(0,200)))
  process.exit(0)
}
setTimeout(() => { console.log("TIMEOUT"); process.exit(1) }, 8000)
' "ws://127.0.0.1:2508/api/apps/$AID/terminal" "$COOKIE" 2>&1 | tail -3)

case "$HASIL" in
  KETEMU) ok "ketik perintah, hasilnya balik lewat WebSocket" ;;
  *) bad "terminal: $HASIL" ;;
esac

echo "--- 6. resize & shell ngawur ditolak, sesi tetap hidup ---"
HASIL2=$(bun -e '
const ws = new WebSocket(process.argv[1], { headers: { Cookie: `hikari_session=${process.argv[2]}` } })
let out = ""
ws.onmessage = (e) => { out += typeof e.data === "string" ? e.data : "" }
ws.onopen = () => {
  setTimeout(() => {
    ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }))
    ws.send(JSON.stringify({ type: "resize", cols: 999999, rows: 999999 }))
    ws.send(JSON.stringify({ type: "shell", shell: "rm -rf /" }))
    ws.send("echo MASIH-HIDUP\r")
  }, 800)
  setTimeout(() => ws.close(), 3000)
}
ws.onclose = () => {
  console.log(out.includes("MASIH-HIDUP") ? "AMAN" : "MATI:" + JSON.stringify(out.slice(0,200)))
  process.exit(0)
}
setTimeout(() => { console.log("TIMEOUT"); process.exit(1) }, 8000)
' "ws://127.0.0.1:2508/api/apps/$AID/terminal" "$COOKIE" 2>&1 | tail -3)

case "$HASIL2" in
  AMAN) ok "pesan ngawur diabaikan, sesi tetap hidup" ;;
  *) bad "protokol: $HASIL2" ;;
esac

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI TERMINAL LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "hikari-app-$SLUG" > /dev/null 2>&1 || true
exit "$FAIL"
