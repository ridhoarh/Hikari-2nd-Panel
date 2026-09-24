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

## Yang Belum Ada

Database, storage, git push deploy, backup otomatis. Lihat
`plan/2026-09-24-hikari-design.md` bagian Fase 2 dan 3.

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
