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
warn() { printf '\033[0;33m[hikari]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Jalanin pakai sudo: curl -fsSL ... | sudo bash"

# Simpen nilai dari environment SEBELUM os-release di-source. File itu punya
# variabel `VERSION`, `NAME`, `ID`, `HOME_URL`, dan sejenisnya — kalau kita
# baca sesudahnya, nilai dari file yang menang dan env user ketiban.
ENV_HIKARI_VERSION="${HIKARI_VERSION:-}"
ENV_HIKARI_PORT="${HIKARI_PORT:-}"
ENV_HIKARI_VPS_IP="${HIKARI_VPS_IP:-}"
ENV_HIKARI_ACME_EMAIL="${HIKARI_ACME_EMAIL:-}"

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
VPS_IP="${ENV_HIKARI_VPS_IP:-}"
ACME_EMAIL="${ENV_HIKARI_ACME_EMAIL:-}"

# Kalau IP nggak dikasih, tebak dari interface utama. Dipakai buat nampilin
# alamat koneksi database publik — tanpa ini panel bakal nulis 127.0.0.1,
# yang bikin connection string-nya menyesatkan kalau di-copy ke luar.
if [ -z "${VPS_IP}" ]; then
  VPS_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

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

# `openssl` dipakai panel buat baca tanggal kedaluwarsa sertifikat waktu
# ngecek status TLS domain. Tanpa ini, endpoint cek sertifikat bakal error.
if command -v openssl >/dev/null 2>&1; then
  log "openssl udah ada"
else
  log "Install openssl..."
  apt-get update -qq && apt-get install -y -qq openssl
fi

log "Bikin user ${SERVICE_USER}..."
id -u "${SERVICE_USER}" >/dev/null 2>&1 || \
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

# Masukin user `hikari` ke grup `docker`.
#
# systemd unit juga punya `SupplementaryGroups=docker`, dan itu yang bikin
# SERVICE-nya bisa akses Docker. Tapi tanpa baris ini, user `hikari` sendiri
# (kalau login shell buat debug) nggak bisa jalanin `docker ps` --
# `permission denied`. Bikin bingung waktu nyari masalah.
if getent group docker >/dev/null 2>&1; then
  if id -nG "${SERVICE_USER}" | tr ' ' '\n' | grep -qx docker; then
    log "User ${SERVICE_USER} udah di grup docker"
  else
    log "Masukin ${SERVICE_USER} ke grup docker..."
    usermod -aG docker "${SERVICE_USER}"
  fi
fi

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

# --- Caddy -------------------------------------------------------------
#
# Caddy yang ngurus domain + HTTPS otomatis. Tanpa ini, fitur domain nggak
# jalan sama sekali: `syncCaddy` bakal gagal nyambung ke admin API-nya, dan
# panel cuma bisa diakses lewat `IP:2508` tanpa TLS.
#
# Dipasang dari repo resmi Caddy, BUKAN dari apt default Ubuntu — yang di
# apt itu versi lama dan nggak punya beberapa direktif yang kita pakai.
repair_caddy() {
  if ! command -v caddy >/dev/null 2>&1; then
    return 1
  fi

  # Caddy wajib punya admin API di 127.0.0.1:2019 — panel nembak ke situ
  # buat reload config. Kalau nggak nyala, domain tersimpen tapi config-nya
  # nggak pernah kepasang.
  if curl -fsS -m 3 http://127.0.0.1:2019/config/ >/dev/null 2>&1; then
    return 0
  fi

  log "Nyalain ulang Caddy..."
  systemctl restart caddy >/dev/null 2>&1 || true
  for _ in $(seq 1 10); do
    sleep 1
    if curl -fsS -m 3 http://127.0.0.1:2019/config/ >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

if command -v caddy >/dev/null 2>&1; then
  log "Caddy udah ada: $(caddy version | head -1)"
else
  # Port 80/443 dipakai buat ACME HTTP-01 challenge dan HTTPS. Kalau udah
  # ditempati (misal Dokploy atau nginx), pemasangan bakal gagal start —
  # jadi dicek dulu dan dikasih pesan yang jelas.
  KETEMU=""
  for p in 80 443; do
    if ss -ltn 2>/dev/null | grep -q ":${p} "; then
      KETEMU="${KETEMU} ${p}"
    fi
  done
  if [ -n "${KETEMU}" ]; then
    warn "Port${KETEMU} udah kepake proses lain."
    warn "Caddy butuh port 80 & 443 buat HTTPS otomatis. Fitur domain bakal"
    warn "nggak jalan sampai port-nya dibebasin. Panelnya sendiri tetap hidup"
    warn "di port ${PORT}."
  fi

  log "Install Caddy..."
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    || fail "Gagal ambil GPG key Caddy"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null \
    || fail "Gagal nambah repo Caddy"
  apt-get update -qq
  apt-get install -y -qq caddy || fail "Gagal install Caddy"
fi

# Caddyfile awal. `syncCaddy` bakal nimpa isinya tiap ada domain baru, jadi
# yang penting di sini cuma bikin file-nya ada plus admin API di loopback.
if [ ! -f /etc/caddy/Caddyfile ]; then
  log "Bikin Caddyfile awal..."
  mkdir -p /etc/caddy
  cat > /etc/caddy/Caddyfile <<'CADDYEOF'
{
	admin 127.0.0.1:2019
}
CADDYEOF
fi

# PENTING: panel nulis ulang Caddyfile tiap ada domain baru, dan panelnya
# jalan sebagai user `hikari` — BUKAN root.
#
# Paket Caddy nyimpen file-nya sebagai `root:root` mode 644, jadi user
# `hikari` nggak bisa nulis dan tiap sinkronisasi gagal dengan
# `EACCES: permission denied, open '/etc/caddy/Caddyfile'`.
# Gejalanya: domain kesimpen di panel, tapi Caddy nggak pernah dapet
# config-nya — dan itu nggak kelihatan sampai domainnya dicoba.
#
# Solusinya: kasih grup `hikari` kepemilikan file-nya, mode 664. Group-nya
# tetap punya akses, `caddy` (jalan sebagai root) tetap bisa baca.
if [ -f /etc/caddy/Caddyfile ]; then
  if ! sudo -u "${SERVICE_USER}" test -w /etc/caddy/Caddyfile 2>/dev/null; then
    log "Kasih akses tulis Caddyfile ke user ${SERVICE_USER}..."
    chown root:"${SERVICE_USER}" /etc/caddy/Caddyfile
    chmod 664 /etc/caddy/Caddyfile
  fi
fi

# Folder sertifikat harus bisa dibaca panel buat ngecek status TLS domain.
# `caddy` bikin folder-nya pas pertama kali nyala, jadi bisa aja belum ada.
mkdir -p /var/lib/caddy/.local/share/caddy
chown -R caddy:caddy /var/lib/caddy/.local/share/caddy 2>/dev/null || true
chmod 755 /var/lib/caddy /var/lib/caddy/.local /var/lib/caddy/.local/share 2>/dev/null || true
# Panel cuma perlu BACA isinya (nama file + tanggal kedaluwarsa).
chmod -R a+rX /var/lib/caddy/.local/share/caddy 2>/dev/null || true

systemctl enable caddy >/dev/null 2>&1 || true
if ! repair_caddy; then
  warn "Caddy belum bisa dihubungi di 127.0.0.1:2019."
  warn "Cek manual: systemctl status caddy && journalctl -u caddy -n 30"
  warn "Domain nggak bakal kepasang sampai ini beres."
fi

# Pin host key sekali. Tanpa ini, git clone nggak bisa verifikasi identitas
# server git, jadi deploy key bisa dicuri lewat MITM.
log "Pin host key SSH..."
ssh-keyscan -t ed25519,rsa github.com gitlab.com codeberg.org \
  > "${DATA_DIR}/known_hosts" 2>/dev/null || true
chmod 644 "${DATA_DIR}/known_hosts"

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" "${DATA_DIR}"

log "Pasang systemd unit..."

# Kalau `HIKARI_ACME_EMAIL` kosong, barisnya SENGAJA nggak ditulis sama sekali.
# Nulis `HIKARI_ACME_EMAIL=` kosong bikin panel nge-set email kosong ke
# Caddyfile (`email `), dan Let's Encrypt nolak pendaftaran tanpa email.
ACME_LINE=""
if [ -n "${ACME_EMAIL}" ]; then
  ACME_LINE="Environment=HIKARI_ACME_EMAIL=${ACME_EMAIL}"
fi

cat > /etc/systemd/system/hikari.service <<UNIT
[Unit]
Description=Hikari
# Caddy ikut ditunggu: panel nembak admin API-nya buat pasang config domain.
# Tanpa ini, panel bisa nyala duluan dan reload pertama-nya gagal (nggak fatal,
# tapi bikin log kotor dan domain telat kepasang).
After=network.target docker.service caddy.service
Wants=caddy.service
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
# Dibaca panel buat nampilin alamat publik di connection string database.
Environment=HIKARI_VPS_IP=${VPS_IP}
# Lokasi sertifikat Caddy, dipakai buat ngecek status TLS domain beneran.
Environment=HIKARI_CADDY_DATA=/var/lib/caddy/.local/share/caddy
${ACME_LINE}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
SupplementaryGroups=docker

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now hikari

IP="${VPS_IP:-}"
log "Selesai."
log "Panel: http://${IP:-IP-VPS-KAMU}:${PORT}"
log "DB:    /var/lib/hikari"

if [ -n "${IP}" ]; then
  log "Connection string publik bakal pakai IP ${IP}."
fi

if ! curl -fsS -m 3 http://127.0.0.1:2019/config/ >/dev/null 2>&1; then
  warn "Caddy belum jalan, jadi domain + HTTPS belum aktif. Panel tetap bisa"
  warn "dipakai lewat IP:${PORT}. Beresin Caddy dulu, terus restart service:"
  warn "  sudo systemctl status caddy"
  warn "  sudo systemctl restart hikari"
fi
