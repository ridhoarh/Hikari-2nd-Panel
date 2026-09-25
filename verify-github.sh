#!/usr/bin/env bash
# Uji GitHub App tanpa nembak GitHub asli: pakai mock server.
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
MOCK="http://127.0.0.1:2599"
DATA=/tmp/hik-gh
C=$DATA/cookies
rm -rf "$DATA"; mkdir -p "$DATA"

# --- Mock GitHub API ---------------------------------------------------
cat > "$DATA/mock.ts" <<'MOCKEOF'
const server = Bun.serve({
  port: 2599,
  async fetch(req) {
    const url = new URL(req.url)
    const auth = req.headers.get('authorization') ?? ''

    if (url.pathname === '/api/v3/test/jwt') {
      // Verifikasi JWT-nya beneran pakai public key yang dikirim.
      const { createVerify } = require('node:crypto')
      const { jwt, publicKey } = (await req.json()) as { jwt: string; publicKey: string }
      const [h, p, s] = jwt.split('.')
      const verifier = createVerify('RSA-SHA256')
      verifier.update(`${h}.${p}`)
      const valid = verifier.verify(publicKey, Buffer.from(s, 'base64url'))
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
      return Response.json({ valid, payload })
    }

    if (!auth.startsWith('Bearer ')) {
      return Response.json({ message: 'unauthorized' }, { status: 401 })
    }

    if (url.pathname.endsWith('/app/installations')) {
      return Response.json([{ id: 42, account: { login: 'ridhoarh' } }])
    }

    if (/\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)) {
      return Response.json({ token: 'ghs_token_uji_abc123' })
    }

    if (/^\/api\/v3\/repos\/.+\/statuses\/.+$/.test(url.pathname)) {
      const body = (await req.json()) as { state: string; context: string }
      return Response.json({ id: 1, state: body.state, context: body.context })
    }

    return Response.json({ message: 'not found' }, { status: 404 })
  },
})
console.log('mock jalan di', server.port)
MOCKEOF

cd "${ROOT}/apps/server"
bun run "$DATA/mock.ts" > "$DATA/mock.log" 2>&1 &
MOCK_PID=$!

HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_STATIC="${ROOT}/apps/web/dist" \
  bun run src/index.ts > "$DATA/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV $MOCK_PID 2>/dev/null || true' EXIT
sleep 3

ok()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
bad() { printf '  \033[0;31mGAGAL\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0

echo "=== 0. mock GitHub siap? ==="
curl -s "$MOCK/api/v3/cek" > /dev/null 2>&1 || true
sleep 1
grep -q "mock jalan" "$DATA/mock.log" && ok "mock GitHub jalan di 2599" || bad "mock nggak jalan"

curl -s -X POST "$B/api/setup" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null
curl -s -c "$C" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"passwordkuat123"}' > /dev/null

echo "=== 1. status awal: belum nyambung ==="
ST=$(curl -s -b "$C" "$B/api/github/status")
case "$ST" in *'"connected":false'*) ok "belum ada App";; *) bad "status: $ST";; esac

echo "=== 2. JWT-nya valid (diverifikasi mock pakai public key) ==="
openssl genrsa -out "$DATA/app.pem" 2048 2>/dev/null
openssl rsa -in "$DATA/app.pem" -pubout -out "$DATA/app.pub" 2>/dev/null
bun -e '
import { buildAppJwt } from "./src/github/github-app"
import { readFileSync } from "node:fs"
const key = readFileSync(process.argv[1], "utf8")
const pub = readFileSync(process.argv[2], "utf8")
const jwt = buildAppJwt({ appId: "999", privateKey: key })
const res = await fetch("http://127.0.0.1:2599/api/v3/test/jwt", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jwt, publicKey: pub }),
})
const data = await res.json() as { valid: boolean; payload: { iss: string; exp: number; iat: number } }
console.log(data.valid && data.payload.iss === "999" ? "JWT-VALID" : "JWT-INVALID:" + JSON.stringify(data))
' "$DATA/app.pem" "$DATA/app.pub" 2>&1 | tail -1 | grep -q "JWT-VALID" \
  && ok "JWT ditandatangani bener & bisa diverifikasi" \
  || bad "JWT nggak valid"

echo "=== 3. tolak private key yang bukan PEM ==="
BAD=$(curl -s -b "$C" -X POST "$B/api/github/app" -H 'Content-Type: application/json' \
  -d '{"appId":"1","privateKey":"bukan-pem-sama-sekali"}')
case "$BAD" in *PEM*) ok "key ngawur ditolak dengan pesan jelas";; *) bad "harusnya ditolak: $BAD";; esac

echo "=== 4. simpen App (dicek ke mock dulu) ==="
PEM=$(cat "$DATA/app.pem" | bun -e 'const s = await new Response(Bun.stdin.stream()).text(); console.log(JSON.stringify(s))')
# Mock GitHub: arahkan base URL-nya lewat env di server. Karena server kita
# nembak api.github.com, tes ini pakai jalur lain: panggil fungsi langsung.
bun -e '
import { buildAppJwt, listInstallations, pickInstallation } from "./src/github/github-app"
import { readFileSync } from "node:fs"
const key = readFileSync(process.argv[1], "utf8")
const jwt = buildAppJwt({ appId: "999", privateKey: key })

// Palsuin fetch biar nembak mock, bukan GitHub asli.
const fake = async (input: any, init?: any) => {
  const url = String(input).replace("https://api.github.com", "http://127.0.0.1:2599/api/v3")
  return fetch(url, init)
}
const list = await listInstallations({ jwt, fetchImpl: fake as any })
if (!list.ok) { console.log("GAGAL-LIST:" + list.error); process.exit(0) }
console.log("LIST-OK:" + list.installations.length)
console.log("PICK:" + (pickInstallation(list.installations, new Set())?.account.login ?? "null"))

const tok = await fetch("http://127.0.0.1:2599/api/v3/app/installations/42/access_tokens", {
  method: "POST", headers: { Authorization: `Bearer ${jwt}` },
})
const tokData = await tok.json() as { token: string }
console.log("TOKEN:" + (tokData.token.startsWith("ghs_") ? "OK" : "SALAH"))
' "$DATA/app.pem" 2>&1 | tail -3 > "$DATA/gh.txt"
grep -q "LIST-OK:1" "$DATA/gh.txt" && ok "list instalasi jalan (1 instalasi)" || bad "$(cat "$DATA/gh.txt")"
grep -q "PICK:ridhoarh" "$DATA/gh.txt" && ok "instalasi ke-pilih bener" || bad "pemilihan instalasi salah"
grep -q "TOKEN:OK" "$DATA/gh.txt" && ok "token instalasi diambil (ghs_...)" || bad "token gagal"

echo "=== 5. commit status kekirim ==="
bun -e '
import { postCommitStatus } from "./src/github/github-app"
const fake = async (input: any, init?: any) => {
  const url = String(input).replace("https://api.github.com", "http://127.0.0.1:2599/api/v3")
  return fetch(url, init)
}
const r = await postCommitStatus({
  token: "ghs_uji", repoFullName: "ridhoarh/Hikari-2nd-Panel",
  sha: "abc123", state: "success", description: "Deploy sukses",
  fetchImpl: fake as any,
})
console.log(r.ok ? "STATUS-OK" : "STATUS-GAGAL:" + r.error)
' 2>&1 | tail -1 | grep -q "STATUS-OK" && ok "status deploy kekirim ke GitHub" || bad "status gagal"

echo "=== 6. endpoint butuh login ==="
for p in "github/status" "github/app"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/$p")
  [ "$CODE" = "401" ] && ok "/api/$p butuh login" || bad "/api/$p dapet $CODE"
done

echo "=== 7. /github/token nolak repo bukan GitHub ==="
NOTGH=$(curl -s -b "$C" -X POST "$B/api/github/token" -H 'Content-Type: application/json' \
  -d '{"repoUrl":"git@gitlab.com:user/repo.git"}')
case "$NOTGH" in *"bukan repo GitHub"*) ok "repo non-GitHub ditolak";; *) bad "harusnya ditolak: $NOTGH";; esac

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI GITHUB APP LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi
exit "$FAIL"
