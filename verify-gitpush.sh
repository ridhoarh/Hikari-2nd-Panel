#!/usr/bin/env bash
# Verifikasi git push deploy: bare repo, hook post-receive, dan endpoint-nya.
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
DATA=/tmp/hik-fase3
C=$DATA/cookies
rm -rf "$DATA"; mkdir -p "$DATA"

cd "${ROOT}/apps/server"
HIKARI_PORT=2508 HIKARI_DATA="$DATA" HIKARI_VPS_IP=127.0.0.1 \
  HIKARI_GIT_HOST=127.0.0.1 HIKARI_GIT_PORT=2222 \
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
PID=$(curl -s -b "$C" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"Produksi"}' | sed 's/.*"id":"\([^"]*\)".*/\1/')

echo "--- 1. bikin app sumber git-url (buat target push) ---"
REPO=$DATA/sumber
mkdir -p "$REPO"
cat > "$REPO/Dockerfile" <<'DOCKER'
FROM alpine:3.20
RUN echo "versi 1" > /srv/index.html
WORKDIR /srv
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080"]
DOCKER
cd "$REPO" && git init -q -b main && git add -A
GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t \
  git commit -q -m "init"

APP=$(curl -s -b "$C" -X POST "$B/api/projects/$PID/apps" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Web\",\"sourceType\":\"giturl\",\"repoUrl\":\"$REPO\",\"branch\":\"main\",\"containerPort\":8080}")
AID=$(printf '%s' "$APP" | sed 's/.*"id":"\([^"]*\)".*/\1/')
SLUG=$(printf '%s' "$APP" | sed 's/.*"slug":"\([^"]*\)".*/\1/')
ok "app dibuat (slug=$SLUG)"

echo "--- 2. bare repo + hook dibikin otomatis ---"
sleep 1
REPOPATH="$DATA/repos/$SLUG.git"
[ -d "$REPOPATH" ] && ok "bare repo ada di $REPOPATH" || bad "bare repo nggak ada"
[ -f "$REPOPATH/hooks/post-receive" ] && ok "hook post-receive ada" || bad "hook nggak ada"
[ -x "$REPOPATH/hooks/post-receive" ] && ok "hook executable" || bad "hook nggak executable"
grep -q "git-push/$AID" "$REPOPATH/hooks/post-receive" \
  && ok "hook nunjuk ke app yang bener" || bad "hook salah app"

echo "--- 3. push ke bare repo, hook manggil Hikari ---"
cd "$REPO"
git remote add hikari "$REPOPATH" 2>/dev/null || git remote set-url hikari "$REPOPATH"
echo "perubahan" > file-baru.txt
git add -A
GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t \
  git commit -q -m "perubahan lewat push"
PUSHOUT=$(git push hikari main 2>&1)
echo "$PUSHOUT" | tail -3

echo "--- 4. Hikari nyatet push-nya (deployment kebikin) ---"
FOUND=0
for i in $(seq 1 20); do
  sleep 2
  DEP=$(curl -s -b "$C" "$B/api/apps/$AID/deployments")
  case "$DEP" in
    *'"status":"success"'*) FOUND=1; break;;
    *'"id"'*) FOUND=2; break;;
  esac
done
if [ "$FOUND" = "1" ]; then ok "push memicu deploy yang SUKSES"
elif [ "$FOUND" = "2" ]; then ok "push memicu deploy (masih jalan)"
else bad "push nggak memicu deployment: $(printf '%s' "$DEP" | cut -c1-200)"; fi

echo "--- 5. endpoint git info buat user ---"
GI=$(curl -s -b "$C" "$B/api/apps/$AID/git")
case "$GI" in *"127.0.0.1:2222"*) ok "ssh URL pakai host & port yang bener";; *) bad "git info: $GI";; esac
case "$GI" in *"git remote add"*) ok "perintah push ditampilin";; *) bad "perintah push nggak ada";; esac

echo "--- 6. hook DITOLAK tanpa secret yang bener ---"
NOPE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/git-push/$AID" \
  -H 'Content-Type: application/json' -H 'x-hikari-push-secret: salah' \
  -d '{"ref":"refs/heads/main"}')
[ "$NOPE" = "401" ] && ok "secret salah ditolak 401" || bad "secret salah dapet $NOPE"

echo "--- 7. authorized_keys ngunci ke git-shell ---"
GEN=$(curl -s -b "$C" -X POST "$B/api/git/deploy-key")
case "$GEN" in *publicKey*) ok "deploy key dibikin";; *) bad "deploy-key: $GEN";; esac

AK=$(curl -s -b "$C" "$B/api/git/authorized-keys")
echo "$AK" | grep -q "git-shell" \
  && ok "authorized_keys pakai git-shell (nggak bisa dapet shell)" \
  || bad "authorized_keys: $AK"
echo "$AK" | grep -q "no-pty" && ok "pty dimatiin" || bad "no-pty nggak ada"
echo "$AK" | grep -q "no-port-forwarding" && ok "port forwarding dimatiin" || bad "no-port-forwarding nggak ada"

echo "--- 8. endpoint git butuh login ---"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/apps/$AID/git")
[ "$NOAUTH" = "401" ] && ok "info git butuh login" || bad "tanpa login dapet $NOAUTH"

echo "--- 9. git-push dari shell TETAP jalan tanpa login ---"
PSECRET=$(cd "${ROOT}/apps/server" && bun -e "
const {Database}=require('bun:sqlite')
const db=new Database('$DATA/hikari.sqlite')
const r=db.query('SELECT value FROM settings WHERE key = ?').get('git_push_secret:$AID')
console.log(r ? r.value : '')
")
OKPUSH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/git-push/$AID" \
  -H 'Content-Type: application/json' -H "x-hikari-push-secret: $PSECRET" \
  -d '{"ref":"refs/heads/main"}')
[ "$OKPUSH" = "202" ] && ok "hook jalan tanpa cookie (dijaga secret)" || bad "hook dapet $OKPUSH"

echo
if [ "$FAIL" = "0" ]; then
  printf '\033[0;32m=== SEMUA VERIFIKASI GIT PUSH LOLOS ===\033[0m\n'
else
  printf '\033[0;31m=== ADA YANG GAGAL ===\033[0m\n'
fi

echo
echo "--- bersihin ---"
docker rm -f "hikari-app-$SLUG" > /dev/null 2>&1 || true
docker buildx rm hikari-buildkit > /dev/null 2>&1 || true
exit "$FAIL"
