#!/usr/bin/env bash
#
# Jalanin Hikari langsung dari kode sumber — buat ngerjain, bukan buat deploy.
#
# Kenapa ini ada: `install.sh` itu cara DEPLOY. Dia download tarball rilis,
# ekstrak ke /opt/hikari, dan jalanin dari situ. Buat ngubah satu baris kode,
# alurnya jadi: commit -> tag -> tunggu CI -> install ulang. Itu kebalik;
# yang berubah cuma satu baris.
#
# Skrip ini jalanin kode yang lagi ada di folder ini, pakai data terpisah,
# di port terpisah. Jadi:
#
#   - Perubahan kode langsung kepakai (tinggal restart)
#   - Data di /var/lib/hikari NGGAK kesentuh
#   - Bisa jalan barengan sama instance yang lagi dipakai
#
# Contoh:
#   ./dev.sh              # port 2600, data di /tmp/hikari-dev
#   ./dev.sh --port 3000  # ganti port
#   ./dev.sh --fresh      # mulai dari data kosong
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=2600
DATA=/tmp/hikari-dev
FRESH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --data) DATA="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Argumen nggak dikenal: $1" >&2; exit 1 ;;
  esac
done

# Pastiin port-nya bebas. Salah port = nembak instance lain tanpa sadar.
if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "[dev] Port ${PORT} udah kepake." >&2
  echo "[dev] Cari prosesnya: ss -ltnp | grep :${PORT}" >&2
  exit 1
fi

# Kalau port-nya 2508, itu port default panel — hampir pasti salah.
if [ "${PORT}" = "2508" ]; then
  echo "[dev] Port 2508 itu port panel yang lagi jalan. Pakai port lain," >&2
  echo "[dev] biar instance develop nggak ketuker sama yang dipakai." >&2
  exit 1
fi

if [ "${FRESH}" = "1" ] && [ -d "${DATA}" ]; then
  echo "[dev] --fresh: buang data lama di ${DATA}"
  rm -rf "${DATA}"
fi

mkdir -p "${DATA}"/{logs,keys,work,repos,www}

# Frontend disalin dari hasil build lokal, bukan dari /opt/hikari.
#
# Buat ngembangin halaman, pakai `bun run --filter @hikari/web dev` (Vite di
# port 5173, udah ada proxy ke panel). Yang ini cuma biar panelnya ada yang
# diserve waktu cuma ngutak-ngatik sisi server.
if [ -d "${ROOT}/apps/web/dist" ]; then
  cp -r "${ROOT}/apps/web/dist/." "${DATA}/www/"
else
  echo "[dev] Catatan: apps/web/dist belum ada. Jalanin dulu:" >&2
  echo "[dev]   bun run build" >&2
fi

echo "[dev] ─────────────────────────────────────────────"
echo "[dev] Kode   : ${ROOT}  (langsung dari sumber)"
echo "[dev] Data   : ${DATA}  (terpisah dari /var/lib/hikari)"
echo "[dev] Panel  : http://127.0.0.1:${PORT}"
echo "[dev] ─────────────────────────────────────────────"
echo "[dev] Perubahan kode langsung kepakai abis restart."
echo "[dev] Ctrl+C buat matiin."
echo

# `--watch` bikin Bun restart sendiri tiap file berubah — nggak perlu
# matiin-nyalain manual tiap abis edit.
cd "${ROOT}/apps/server"
exec env \
  HIKARI_PORT="${PORT}" \
  HIKARI_DATA="${DATA}" \
  HIKARI_STATIC="${DATA}/www" \
  HIKARI_CADDYFILE="${DATA}/Caddyfile" \
  HIKARI_ENV=development \
  HIKARI_VPS_IP=127.0.0.1 \
  bun run --watch src/index.ts
