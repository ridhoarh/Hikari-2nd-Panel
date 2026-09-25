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

### Mau versi tertentu

```bash
sudo HIKARI_VERSION=v0.1.5 bash install.sh
```

Kalau dikosongin, dia pakai rilis terbaru. Ganti `v0.1.5` dengan tag yang ada di
[halaman Releases](https://github.com/ridhoarh/Hikari-2nd-Panel/releases).

### Opsi lain

```bash
# Port panel (default 2508)
sudo HIKARI_PORT=8080 bash install.sh

# IP publik VPS, buat nampilin connection string database dari luar.
# Kalau kosong, dideteksi otomatis: ditanya ke layanan luar dulu, jadi VPS
# di belakang NAT (Oracle/GCP/AWS) tetap dapet IP publik yang bener.
sudo HIKARI_VPS_IP=203.0.113.10 bash install.sh

# Email buat pendaftaran Let's Encrypt
sudo HIKARI_ACME_EMAIL=kamu@contoh.com bash install.sh
```

## Yang Dilakuin `install.sh`

Cek OS → pastiin Docker, git & openssl ada → cek port 2508 kosong → bikin user
`hikari` → tambahin ke grup `docker` → download tarball dari GitHub Releases →
pasang Bun ke `/usr/local` → pasang Caddy (kalau belum ada) → siapin Caddyfile &
hak aksesnya → pin host key SSH → pasang systemd unit → nyalain service.

Beberapa hal yang sengaja dilakuin hati-hati:

- **Bun dipasang ke `/usr/local`, bukan `/root/.bun`.** Cara yang gampang
  (`curl bun.sh/install | bash`) naruh Bun di `/root/.bun` terus di-symlink.
  Itu gagal: `/root` mode-nya `700`, jadi user `hikari` nggak bisa nembus dan
  systemd-nya error `203/EXEC` — service-nya crash-loop tanpa henti.
- **`HIKARI_VERSION` dibaca sebelum `/etc/os-release` di-source.** File itu
  punya variabel `VERSION` yang isinya versi Ubuntu, dan kalau kebaca duluan,
  URL download-nya jadi ngaco.
- **Caddy dipasang dari repo resmi Cloudsmith**, bukan dari apt default Ubuntu
  (versi di sana terlalu tua). Kalau port 80/443 udah kepakai proses lain
  (misal Dokploy), install-nya tetap jalan tapi dikasih peringatan: fitur domain
  nggak bakal aktif sampai port-nya bebas.
- **`/etc/caddy/Caddyfile` di-`chown root:hikari` + `chmod 664`.** Panel nulis
  ulang file ini tiap ada domain baru, dan dia jalan sebagai user `hikari`.
  Paket Caddy nyimpennya sebagai `root:root` 644, jadi tanpa langkah ini tiap
  sinkronisasi gagal `EACCES: permission denied` — dan gejalanya baru kelihatan
  saat domainnya dicoba.
- **`HIKARI_VPS_IP` dideteksi lewat layanan luar, bukan `hostname -I`.** Di VPS
  yang di belakang NAT, `hostname -I` cuma mengembalikan IP privat, jadi
  connection string database-nya menunjuk alamat yang nggak bisa diakses dari
  luar. Kalau jaringan keluar diblokir, baru jatuh ke `hostname -I`.

Panel cuma jalan sebagai user `hikari`; akses Docker-nya lewat
`SupplementaryGroups=docker` di unit systemd. Tambahin `hikari` ke grup `docker`
juga biar `docker ps` manual nggak `permission denied` waktu lagi nge-debug.

Update = jalanin `install.sh` lagi. **Nggak ada tombol update di panel**
(nambah attack surface, nggak perlu).

## Fitur

- Deploy dari GitHub, Git URL, atau Docker Image langsung
- Auto deploy tiap push (webhook GitHub)
- **Git push deploy** — push ke remote Hikari, langsung build
- Build Dockerfile, atau Railpack kalau nggak ada Dockerfile
- Domain + HTTPS otomatis lewat Caddy (*installer* yang pasang Caddy), status TLS
  dibaca dari file sertifikat
- **Cloudflare auto-DNS** — bikin record A sendiri
- Log container
- Statistik CPU/RAM (diambil saat dibuka, nggak ada riwayat)
- Batas RAM/CPU per app — **wajib**, biar satu app nggak matiin seluruh VPS
- **Database terkelola**: PostgreSQL, MySQL, Redis
- **Object storage** MinIO (S3-compatible)
- Backup manual + **terjadwal**, restore dari file, bisa di-download
- **Terminal web** ke container lewat WebSocket
- **GitHub App** — clone repo privat + kirim commit status
- Pemakaian disk di halaman Settings, plus peringatan di 80%

## Git Push Deploy

Hikari nggak ngejalanin SSH server sendiri. Yang dipakai sshd bawaan VPS,
dengan `authorized_keys` yang command-nya dikunci ke `git-shell` — jadi deploy
key-nya cuma bisa buat git, nggak bisa dapet shell.

Setup sekali di VPS:

```bash
# 1. bikin user git
sudo useradd -m -s /usr/bin/git-shell git
sudo mkdir -p /home/git/.ssh && sudo chmod 700 /home/git/.ssh

# 2. ambil authorized_keys dari Hikari (bikin deploy key dulu di tab Git)
sudo curl -s http://127.0.0.1:2508/api/git/authorized-keys \
  -H "Cookie: hikari_session=<cookie-kamu>" \
  > /home/git/.ssh/authorized_keys
sudo chown -R git:git /home/git/.ssh && sudo chmod 600 /home/git/.ssh/authorized_keys
```

Terus di folder repo kamu:

```bash
git remote add hikari git@IP-VPS:web.git
git push hikari main
```

Bare repo-nya dibikin otomatis di `<dataDir>/repos/<slug>.git` tiap app dibuat.

## Backup

Backup manual lewat tombol di kartu database. Backup terjadwal **nggak pakai
cron** — jadwalnya dicek tiap abis deploy sukses, jadi kalau nggak ada aktivitas,
nggak ada backup. File-nya disimpen di `<dataDir>/backups`, dipangkas otomatis
setelah 14 hari.

Formatnya beda per engine:

| Engine | File | Cara bikin |
|---|---|---|
| PostgreSQL | `.sql` | `pg_dump --clean --if-exists` |
| MySQL | `.sql` | `mysqldump --add-drop-table` |
| Redis | `.rdb` | `BGSAVE`, terus `dump.rdb` dibaca keluar |

Restore dari file `.sql` lewat tombol di kartu database. Dump-nya dibikin pakai
`--clean --if-exists`, jadi bisa di-restore berulang kali tanpa bentrok tabel.

**Redis restore belum didukung** — yang bisa cuma backup dan download. Untuk
balikin, matiin database-nya, taruh `.rdb` ke volume-nya, terus nyalain lagi.

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

- **Restore Redis** — backup dan download udah jalan, balikinnya masih manual.
- **MongoDB** — sengaja nggak didukung, sesuai rancangan.
- **Update dari panel** — sengaja: jalanin `install.sh` lagi.

## Verifikasi

Unit test cepet, tapi banyak bug di proyek ini cuma ketemu kalau dijalankan
sungguhan — salah satunya `install.sh` yang "sukses" tapi service-nya
crash-loop tanpa henti. Jadi ada skrip yang nyalain server terus nguji pakai
Docker beneran.

```bash
bun run build   # skrip-skrip ini butuh frontend ke-build dulu

bash verify-e2e.sh        # app: build BuildKit, memory limit, port isolation, SPA
bash verify-fase2.sh      # database: postgres sungguhan, ganti mode, minio
bash verify-fase3.sh      # restore sungguhan, jadwal backup, terminal
bash verify-volume.sh     # hapus project nggak boleh hapus volume
bash verify-terminal.sh   # WebSocket terminal, resize, shell ngawur ditolak
bash verify-gitpush.sh    # bare repo, hook, git-shell
bash verify-github.sh     # GitHub App, JWT diverifikasi pakai public key
bash verify-sisa.sh       # backup redis, status TLS, pemakaian disk
```

> **PERINGATAN.** Skrip-skrip ini bikin dan **menghapus** container serta volume
> Docker, dan pakai port `2508`. **Jangan dijalankan di mesin yang sedang
> melayani Hikari produksi** — panelnya bakal ketiban dan volume database bisa
> kehapus. Pakai VPS uji atau mesin lokal.
>
> `verify-sisa.sh` udah dilengkapi pengaman: dia nolak jalan kalau port `2508`
> udah kepake, dan cuma nyentuh container yang dia bikin sendiri.

Semuanya balikin kode keluar bukan-nol kalau ada yang gagal, jadi bisa dipakai
di CI.

### Nulis skrip verifikasi baru

Semua skrip rata-rata pakai pola yang sama. Tiga hal yang wajib diikutin:

1. **Tentukan akar repo dari lokasi skrip**, jangan di-hardcode:
   ```bash
   ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   ```
   Tanpa ini, skripnya cuma jalan di mesin yang bikin.
2. **Pakai data di `/tmp`, jangan `/var/lib/hikari`.** Yang terakhir itu data
   produksi; skrip yang salah bisa ngehapus database yang lagi dipakai.
3. **Bersihin cuma yang kamu bikin.** Catat nama container di satu array terus
   hapus dari daftar itu. Jangan `docker rm -f $(docker ps -aq --filter ...)`
   dengan filter longgar — itu gampang kena container lain.

Pasang `trap ... EXIT` biar bersih walau skripnya mati di tengah.

## Yang Sengaja Nggak Ada

Multi-server, multi user, Prometheus, Grafana, AI gateway, marketplace template.
Ini platform pribadi, bukan produk.

## Update

Jalanin `install.sh` lagi:

```bash
sudo HIKARI_VERSION=v0.2.0 bash install.sh
```

Data kamu di `/var/lib/hikari` nggak disentuh. Nggak ada tombol update di panel,
sengaja.

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
apps/server         Bun + Hono, API + serve frontend
apps/web            Vite + React + TanStack Router
plan/               Rancangan dan rencana implementasi
verify-*.sh         Verifikasi end-to-end, butuh Docker (lihat bagian Verifikasi)
install.sh          Pemasang buat VPS (dipakai pengguna)
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
