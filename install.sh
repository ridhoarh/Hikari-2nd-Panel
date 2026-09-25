#!/usr/bin/env bash
set -euo pipefail

REPO="ridhoarh/Hikari-2nd-Panel"
INSTALL_DIR="/opt/hikari"
DATA_DIR="/var/lib/hikari"
SERVICE_USER="hikari"

# PENTING: variabel di bawah dibaca pakai nama ber-prefix `HIKARI_`, dan
# itu bukan gaya-gayaan. `/etc/os-release` di-source di bawah, dan file itu
# punya variabel `VERSION` yang isinya "24.04.4 LTS (Noble Numbat)".
# Kalau script ini baca `VERSION` telanjang, dia bakal kepakai dan URL
# download-nya jadi ngaco.
#
# Selain itu, semua env-nya dibaca SETELAH os-release di-source, biar
# nilai dari sistem nggak ketiban.
log()  { printf '\033[0;36m[hikari]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Jalanin pakai sudo: curl -fsSL ... | sudo bash"

# Simpen nilai dari environment SEBELUM os-release di-source. File itu punya
# variabel `VERSION`, `NAME`, `ID`, `HOME_URL`, dan sejenisnya — kalau kita
# baca sesudahnya, nilai dari file yang menang dan env user ketiban.
ENV_HIKARI_VERSION="${HIKARI_VERSION:-}"
ENV_HIKARI_PORT="${HIKARI_PORT:-}"

if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) fail "Cuma Ubuntu/Debian yang didukung. Ketemu: ${ID:-unknown}" ;;
  esac
  log "Sistem: ${PRETTY_NAME:-$ID}"
else
  fail "Nggak bisa baca /etc/os-release"
fi

VERSION="${ENV_HIKARI_VERSION:-latest}"
PORT="${ENV_HIKARI_PORT:-2508}"

# Validasi versi: cuma "latest" atau tag rilis yang bentuknya `v` + angka titik.
# Tanpa ini, nilai yang kebetulan ke-set di sistem (umpamanya VERSION dari
# os-release) bisa bikin URL download ngaco dengan error yang nggak jelas.
case "$VERSION" in
  latest) ;;
  v[0-9]*.[0-9]*.[0-9]*) ;;
  v[0-9]*.[0-9]*) ;;
  *) fail "HIKARI_VERSION='$VERSION' nggak valid. Isi 'latest' atau tag kayak v0.1.0." ;;
esac

case "$PORT" in
  ''|*[!0-9]*) fail "HIKARI_PORT='$PORT' harus angka" ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  log "Docker belum ada, install dulu..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker udah ada: $(docker --version)"
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  fail "Port ${PORT} udah kepake. Matiin dulu prosesnya."
fi

if command -v git >/dev/null 2>&1; then
  log "Git udah ada"
else
  log "Install git..."
  apt-get update -qq && apt-get install -y -qq git
fi

if command -v ssh-keyscan >/dev/null 2>&1; then
  log "SSH client udah ada"
else
  log "Install openssh-client..."
  apt-get update -qq && apt-get install -y -qq openssh-client
fi

log "Bikin user ${SERVICE_USER}..."
id -u "${SERVICE_USER}" >/dev/null 2>&1 || \
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

log "Siapin folder..."
mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${DATA_DIR}/keys" "${DATA_DIR}/logs" \
  "${DATA_DIR}/work" "${DATA_DIR}/www"

# Tarball udah termasuk node_modules. Yang bikin: .github/workflows/release.yml
if [ "${VERSION}" = "latest" ]; then
  TARBALL="https://github.com/${REPO}/releases/latest/download/hikari.tar.gz"
else
  TARBALL="https://github.com/${REPO}/releases/download/${VERSION}/hikari.tar.gz"
fi

log "Download Hikari..."
if ! curl -fsSL "${TARBALL}" | tar -xz -C "${INSTALL_DIR}"; then
  fail "Gagal download ${TARBALL}. Pastiin rilis-nya udah ada di GitHub Releases."
fi

# Frontend hasil build dipindah ke DATA_DIR/www biar HIKARI_STATIC nemu.
if [ -d "${INSTALL_DIR}/apps/web/dist" ]; then
  cp -r "${INSTALL_DIR}/apps/web/dist/." "${DATA_DIR}/www/"
fi

log "Siapin Bun..."
if ! command -v bun >/dev/null 2>&1 || ! [ -x /usr/local/bin/bun ]; then
  # PENTING: Bun di-install ke /usr/local biar bisa diakses user `hikari`.
  #
  # Cara yang gampang (curl bun.sh/install | bash) naruh Bun di
  # /root/.bun, terus di-symlink. Itu GAGAL: /root mode-nya 700, jadi user
  # `hikari` nggak bisa nembus folder-nya dan systemd-nya error
  # "Failed to execute /usr/local/bin/bun: Permission denied" (203/EXEC)
  # -- service-nya crash-loop tanpa henti.
  #
  # Jadi: pasang ke /usr/local/bin, sesuai dokumentasi Bun buat system-wide.
  if ! command -v unzip >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq unzip
  fi

  BUN_VERSION="${HIKARI_BUN_VERSION:-latest}"
  curl -fsSL https://bun.sh/install -o /tmp/hikari-bun-install.sh
  BUN_INSTALL=/usr/local bash /tmp/hikari-bun-install.sh
  rm -f /tmp/hikari-bun-install.sh

  if [ ! -x /usr/local/bin/bun ]; then
    fail "Gagal masang Bun ke /usr/local/bin"
  fi
fi

log "Bun: $(/usr/local/bin/bun --version)"

# Pin host key sekali. Tanpa ini, git clone nggak bisa verifikasi identitas
# server git, jadi deploy key bisa dicuri lewat MITM.
log "Pin host key SSH..."
ssh-keyscan -t ed25519,rsa github.com gitlab.com codeberg.org \
  > "${DATA_DIR}/known_hosts" 2>/dev/null || true
chmod 644 "${DATA_DIR}/known_hosts"

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" "${DATA_DIR}"

log "Pasang systemd unit..."
cat > /etc/systemd/system/hikari.service <<UNIT
[Unit]
Description=Hikari
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/local/bin/bun run ${INSTALL_DIR}/apps/server/src/index.ts
Restart=always
RestartSec=5
# Bun nge-spawn subprocess (git, docker, railpack). KillMode=mixed biar
# proses anak-nya ikut mati pas service-nya distop.
KillMode=mixed
TimeoutStopSec=30
Environment=HIKARI_PORT=${PORT}
Environment=HIKARI_DATA=${DATA_DIR}
Environment=HIKARI_STATIC=${DATA_DIR}/www
Environment=HIKARI_CADDYFILE=/etc/caddy/Caddyfile
Environment=PATH=/usr/local/bin:/usr/bin:/bin
SupplementaryGroups=docker

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now hikari

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
log "Selesai."
log "Buka http://${IP:-IP-VPS-KAMU}:${PORT} buat setup akun admin."
