# Hikari

PaaS pribadi buat VPS sendiri. Sambungin repo GitHub, Hikari yang build, yang
jalanin, yang kasih domain plus HTTPS otomatis.

Bukan PaaS multi-tenant. Bukan klon Coolify. Ini versi kecil yang dipakai
sehari-hari.

## Install

```bash
# Cepat
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh | sudo bash

# Aman: baca dulu, baru jalanin
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh -o install.sh
less install.sh && sudo bash install.sh
```

Buka `http://IP-VPS:2508` buat bikin akun admin.

Cuma Ubuntu/Debian yang didukung. Di distro lain, install script bakal berhenti
sopan.

## Yang Bisa Dilakuin

- Deploy dari GitHub, Git URL, atau Docker Image langsung
- Auto deploy tiap push (webhook GitHub)
- Build Dockerfile, atau Railpack kalau nggak ada Dockerfile
- Domain + HTTPS otomatis lewat Caddy
- Log container
- Statistik CPU/RAM (diambil saat dibuka, nggak ada riwayat)
- Batas RAM/CPU per app — **wajib**, biar satu app nggak matiin seluruh VPS
- **Database terkelola**: PostgreSQL, MySQL, Redis
- **Object storage** MinIO (S3-compatible)
- Backup manual database, bisa di-download

## Database

Bikin PostgreSQL / MySQL / Redis dari panel, password 32 karakter dibikin
otomatis, volume otomatis. Ada tiga mode akses:

| Mode | Port di VPS | Cara akses |
|---|---|---|
| Internal | `127.0.0.1` | cuma app di VPS yang sama |
| Tunnel | `127.0.0.1` | `ssh -L`, perintahnya ditampilin di panel |
| Public (IP) | `0.0.0.0` | dari mana aja, **tanpa TLS** |
| Public (domain) | `127.0.0.1` | lewat Caddy TCP proxy, pakai TLS |

**Port database ada di range 20001–29999.** Caddy dengerin port itu kalau
kamu pakai mode domain. Kalau pakai firewall, buka port-nya sesuai mode yang
dipakai.

Catatan penting soal mode public: pakai domain **bukan** berarti aman. Port
`IP:port` tetap kebuka, dan bot bakal nyoba masuk lewat situ. Satu port cuma
bisa ngelayanin satu database — PostgreSQL nggak bawa nama host di protokol
TCP-nya.

**Hapus database nggak hapus volume.** Data kamu aman, tapi harus dibersihin
manual: `docker volume rm <nama-volume>`.

## Storage

MinIO jalan sebagai container dengan volume awet. Bikin bucket dari panel,
kredensialnya (access key + secret key) cuma muncul sekali.

Image MinIO bisa diganti kalau pull-nya gagal:

```bash
# di /etc/systemd/system/hikari.service, tambahin:
Environment=HIKARI_MINIO_IMAGE=minio/minio:latest
```

## Yang Belum Ada

Git push deploy, terminal web, backup otomatis terjadwal, Cloudflare
auto-DNS, GitHub App. Lihat `plan/2026-09-24-hikari-design.md` bagian Fase 3.

## Yang Sengaja Nggak Ada

Multi-server, multi user, Prometheus, Grafana, AI gateway, marketplace template.
Ini platform pribadi, bukan produk.

## Update

Jalanin `install.sh` lagi. Nggak ada tombol update di panel, sengaja.

## Jalanin dari Source

```bash
bun install
bun run dev        # server di 2508, web di 5173
bun test
bun run typecheck
bun run build
```

## Verifikasi

Ada skrip yang nyalain server terus nguji deploy sungguhan — bukan cuma unit
test. Butuh Docker jalan:

```bash
bun run build
bash verify-e2e.sh     # app: build, memory limit, port isolation, SPA
bash verify-fase2.sh   # database: postgres sungguhan, backup, minio
```

## Butuh

- Ubuntu/Debian
- Bun 1.4+
- Docker Engine 24+
- Domain yang DNS-nya bisa diatur (buat HTTPS)

## Struktur

```
apps/server   Bun + Hono, API + serve frontend
apps/web      Vite + React + TanStack Router
plan/         Rancangan dan rencana implementasi
```

Nggak ada `packages/shared`. Tipe yang dipakai bareng ditulis di
`apps/web/src/lib/types.ts` — cuma segelintir, nggak sepadan sama satu paket
workspace sendiri.

## Rilis

Push tag `v*`:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

`.github/workflows/release.yml` bakal build frontend, bungkus semuanya sama
`node_modules`, terus nempelin `hikari.tar.gz` ke GitHub Releases.
`install.sh` ngambil dari situ.

## Catatan

- Kalau pakai Dokploy di server yang sama, Hikari nggak bisa jalan bareng di
  port 80/443. Hikari di 2508, jadi aman sampai fitur domain dipakai.
- Build dibatasin 768MB dan cuma satu sekaligus. App berat (Next.js, Java, Rust)
  sebaiknya deploy lewat tab **Docker Image**, build-nya di tempat lain.
- Hapus project **nggak** hapus volume Docker. Data kamu aman, tapi harus
  dibersihin manual kalau emang mau dihapus.
- `ssh-keyscan` dijalani sekali pas install buat pin host key GitHub/GitLab.
  Kalau VPS-nya belum ada network pas install, clone bakal gagal jelas —
  itu sengaja, lebih baik gagal jelas daripada jalan tanpa verifikasi.
- Build dibatalin otomatis setelah 30 menit, pull image setelah 10 menit.
  Nggak ada build yang bisa nggantung dan nahan panel.
