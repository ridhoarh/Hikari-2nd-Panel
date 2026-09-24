#!/usr/bin/env bash
set -euo pipefail

REPO="ridhoarh/Hikari-2nd-Panel"
VERSION="${HIKARI_VERSION:-latest}"
PORT="${HIKARI_PORT:-2508}"
INSTALL_DIR="/opt/hikari"
DATA_DIR="/var/lib/hikari"
SERVICE_USER="hikari"

log()  { printf '\033[0;36m[hikari]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Jalanin pakai sudo: curl -fsSL ... | sudo bash"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) fail "Cuma Ubuntu/Debian yang didukung. Ketemu: ${ID:-unknown}" ;;
  esac
else
  fail "Nggak bisa baca /etc/os-release"
fi

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

command -v bun >/dev/null 2>&1 || {
  log "Install Bun..."
  curl -fsSL https://bun.sh/install | bash
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
}

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
