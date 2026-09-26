# DEPLOYMENT.md — Infrastruktur dan Rilis

## Yang dibutuhkan di VPS

| Kebutuhan | Minimum | Dipasang oleh |
|---|---|---|
| OS | Ubuntu 24.04 / Debian | — |
| Docker | terbaru | `install.sh` |
| git | terbaru | `install.sh` |
| openssl | terbaru | `install.sh` |
| Bun | terbaru | `install.sh` (ke `/usr/local`) |
| Caddy | 2.x | `install.sh` (repo Cloudsmith) |
| RAM | 2 GB | — |
| Disk | 10 GB | — |

Cuma Ubuntu/Debian. Di distro lain `install.sh` berhenti sopan (baca
`/etc/os-release`).

## Variabel environment

Semua di-set di `/etc/systemd/system/hikari.service`.

### Bisa diatur user (dari `install.sh`)

| Variabel | Default | Buat apa |
|---|---|---|
| `HIKARI_VERSION` | `latest` | Tag rilis yang di-download (`v0.2.1`) |
| `HIKARI_PORT` | `2508` | Port panel |
| `HIKARI_VPS_IP` | auto | IP publik buat connection string database |
| `HIKARI_ACME_EMAIL` | kosong | Email pendaftaran Let's Encrypt |
| `HIKARI_ENV` | `development` | Penanda environment (lihat di bawah) |

### `HIKARI_ENV` — penanda environment

Cuma penanda buat manusia, **bukan** pengubah perilaku. Tujuannya satu:
biar gampang bedain "instance yang dipakai beneran" sama "tempat uji".

Ini bukan teori. Satu-satunya VPS pernah dipakai buat nguji dari kondisi
bersih berkali-kali, dan data yang ada di situ (akun, project) kehapus tanpa
sadar.

| Nilai | Efek |
|---|---|
| `development` (default) | Log nulis peringatan pas nyala; sidebar nampilin badge kuning "Development" |
| `production` | Nggak ada peringatan, nggak ada badge |
| Nilai lain | Ditolak `install.sh`; kalau di-set manual, jatuh ke `development` |

**Default-nya sengaja `development`.** Anggapannya: kalau nggak ada yang
bilang ini produksi, lebih baik diperlakukan sebagai tempat uji.

Buat bikin instance ini production:

```bash
sudo HIKARI_ENV=production bash install.sh
```

Terbaca di tiga tempat: log pas nyala, `/api/health`, dan sidebar.

Cara pakai:

```bash
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh -o install.sh
sudo HIKARI_VERSION=v0.2.1 HIKARI_ACME_EMAIL=kamu@contoh.com bash install.sh
```

Buat instance uji, arahkan `HIKARI_DATA` dan `HIKARI_PORT` ke tempat lain biar
data utama nggak kesentuh:

```bash
HIKARI_PORT=2600 HIKARI_DATA=/tmp/hikari-uji HIKARI_STATIC=/tmp/hikari-uji/www \
  bun run apps/server/src/index.ts
```

**`HIKARI_VPS_IP` — perhatikan:** kalau dikosongin, `install.sh` nanya ke
layanan luar (`api.ipify.org`, `ifconfig.me`, `icanhazip.com`) dulu. Di VPS
yang di belakang NAT (Oracle, GCP, AWS), `hostname -I` cuma nunjukin IP privat
(contoh nyata: `10.3.10.80`, padahal publiknya `43.153.202.107`). Kalau
jaringan keluar diblokir, baru jatuh ke `hostname -I`.

**`HIKARI_ACME_EMAIL` — penting:** kalau kosong, barisnya **sengaja nggak
ditulis** sama sekali. Nulis `HIKARI_ACME_EMAIL=` kosong bikin panel nge-set
email kosong ke Caddyfile, dan Let's Encrypt nolak pendaftaran tanpa email.

### Diatur `install.sh` (jangan diubah manual)

| Variabel | Nilai | Buat apa |
|---|---|---|
| `HIKARI_DATA` | `/var/lib/hikari` | Database, backup, keys, repos, log |
| `HIKARI_STATIC` | `/var/lib/hikari/www` | Hasil build frontend |
| `HIKARI_CADDYFILE` | `/etc/caddy/Caddyfile` | Config Caddy |
| `HIKARI_CADDY_DATA` | `/var/lib/caddy/.local/share/caddy` | Baca tanggal sertifikat |
| `HIKARI_GIT_HOST` | `localhost` | Host buat repo git push |
| `HIKARI_GIT_PORT` | `22` | Port SSH |
| `HIKARI_SECRET_KEY` | — | Kunci enkripsi (kalau nggak diset, dibaca dari `<dataDir>/secret.key`) |

## Yang dilakuin `install.sh`

1. Cek root, cek OS
2. Pastiin Docker, git, openssh-client, openssl ada
3. Bikin user `hikari` (system user, shell `nologin`)
4. Tambahin `hikari` ke grup `docker`
5. Siapin folder data
6. Download tarball dari GitHub Releases
7. Pasang Bun ke `/usr/local`
8. Pasang Caddy (kalau belum ada), cek port 80/443
9. Siapin Caddyfile + hak akses tulis
10. Pin host key SSH
11. Pasang systemd unit
12. Nyalain service

### Empat hal yang sengaja dilakuin hati-hati

**1. Bun ke `/usr/local`, bukan `/root/.bun`**
Cara gampang (`curl bun.sh/install | bash`) naruh Bun di `/root/.bun` terus
di-symlink. Itu gagal: `/root` mode-nya `700`, user `hikari` nggak bisa nembus,
dan systemd error `203/EXEC` — service crash-loop tanpa henti.

**2. `HIKARI_VERSION` dibaca SEBELUM `/etc/os-release` di-source**
File itu punya variabel `VERSION` isinya versi Ubuntu. Kalau kebaca duluan, URL
download jadi ngaco.

**3. Caddyfile di-`chown root:hikari` + `chmod 664`**
Panel nulis ulang file ini tiap ada domain baru, dan panel jalan sebagai user
`hikari`. Paket Caddy nyimpennya `root:root` 644. Tanpa langkah ini, tiap sync
gagal `EACCES`, dan gejalanya baru kelihatan saat domainnya dicoba.

**4. IP publik dideteksi lewat layanan luar**
Lihat penjelasan `HIKARI_VPS_IP` di atas.

## Update

**Update = jalanin `install.sh` lagi.** Nggak ada tombol update di panel —
nambah attack surface, nggak perlu.

```bash
sudo HIKARI_VERSION=v0.1.6 bash install.sh
```

Data di `/var/lib/hikari` **nggak** disentuh. Container app dan database juga
nggak diganggu.

## Tata letak sistem setelah install

```
/opt/hikari/                       # Kode aplikasi
├── apps/server/src/               #   Dijalankan langsung sebagai TypeScript
├── apps/web/dist/                 #   Frontend (disalin ke /var/lib/hikari/www)
├── node_modules/
└── install.sh

/var/lib/hikari/                   # Data (JANGAN dihapus)
├── hikari.sqlite                  #   Database + -wal, -shm
├── secret.key                     #   Kunci enkripsi sesi & kredensial (mode 600)
├── keys/                          #   Deploy key per app
├── backups/                       #   File backup database
├── repos/                         #   Bare repo git push (<slug>.git)
├── logs/                          #   Log build
├── www/                           #   Frontend yang diserve
└── work/                          #   Folder kerja build

/etc/caddy/Caddyfile               # root:hikari 664
/var/lib/caddy/.local/share/caddy/ # Sertifikat (panel cuma baca)
/etc/systemd/system/hikari.service
```

Service:

```ini
[Unit]
After=network.target docker.service caddy.service
Wants=caddy.service
Requires=docker.service

[Service]
User=hikari
SupplementaryGroups=docker      # ← ini yang bikin panel bisa akses Docker
Environment=HIKARI_PORT=2508
...
```

Panel jalan sebagai user `hikari`. Akses Docker-nya lewat
`SupplementaryGroups=docker`, bukan dengan jalan sebagai root.

## Port yang dipakai

| Port | Buat apa |
|---|---|
| `2508` | Panel |
| `80`, `443` | Caddy (HTTP/HTTPS) |
| `2019` | Admin API Caddy (**cuma loopback**) |
| `20001–29999` | Database yang mode aksesnya dibuka |
| `22` | SSH (git push deploy) |

Port app **nggak pernah kebuka ke publik** — semua lewat Caddy.

**Kalau port 80/443 udah kepakai** (misal Dokploy): install tetap jalan tapi
dikasih peringatan. Fitur domain nggak aktif sampai port-nya bebas.

## Rilis

```bash
# 1. Naikin versi DULU (pernah kejadian: tag v0.1.1, panel lapor 0.1.0)
#    Ubah HIKARI_VERSION di apps/server/src/lib/version.ts

# 2. Validasi
bun test && bun run typecheck && bun run build

# 3. Push + tag
git push origin main
GIT_EDITOR=true git tag -a v0.1.6 -m "v0.1.6"
git push origin v0.1.6
```

Workflow `.github/workflows/release.yml` jalan di tag `v*`:

1. Install Bun
2. `bun install`, build, typecheck, test
3. Cek semua file yang mau dibungkus ada (dulu `bunfig.toml` ikut didaftarin
   padahal nggak pernah dibikin → `tar` gagal `Cannot stat`)
4. `bun install --production`
5. Bungkus `hikari.tar.gz` (~30 MB) — `node_modules` ikut karena `install.sh`
   jalanin TypeScript langsung
6. Verifikasi isi tarball
7. Upload ke GitHub Releases

### Verifikasi tarball rilis

```bash
curl -sL https://github.com/ridhoarh/Hikari-2nd-Panel/releases/download/v0.1.6/hikari.tar.gz -o h.tar.gz
tar -xzf h.tar.gz apps/server/src/lib/version.ts
grep HIKARI_VERSION apps/server/src/lib/version.ts
```

## Masalah yang pernah kejadian

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| Service crash-loop `203/EXEC` | Bun di `/root/.bun`, `/root` mode 700 | Bun ke `/usr/local` |
| Log selalu `gagal reload Caddy` | Caddy nggak dipasang `install.sh` | Caddy dipasang installer |
| Log `gagal reload Caddy: ...EOF` | POST tanpa body | Kirim isi Caddyfile |
| `EACCES: open '/etc/caddy/Caddyfile'` | File `root:root` 644 | `chown root:hikari` + `chmod 664` |
| Connection string nunjuk `127.0.0.1` | `HIKARI_VPS_IP` kosong | Auto-detect IP publik |
| Port 2508 kepakai | Panel lama masih jalan | `systemctl stop hikari` |
| `install.sh` gagal `Cannot stat` | File nggak ada tapi didaftarin di `tar` | Cek file dulu di CI |

## Perintah operasional

```bash
# Status
systemctl status hikari
journalctl -u hikari -n 50 --no-pager
journalctl -u hikari --since "10 minutes ago" --no-pager

# Service
sudo systemctl restart hikari
sudo systemctl stop hikari

# Caddy
systemctl status caddy
curl -s localhost:2019/config/ | head -c 300
sudo cat /etc/caddy/Caddyfile

# Docker
docker ps
docker ps -a --filter "name=hikari-"
docker system prune -a          # kalau disk penuh

# Data
sudo sqlite3 /var/lib/hikari/hikari.sqlite ".tables"
sudo ls -la /var/lib/hikari/backups/
```

**Sebelum `systemctl stop hikari`** buat ngoprek data: pastikan nggak ada
deploy yang jalan.

## Checklist rilis

- [ ] `bun test` hijau
- [ ] `bun run typecheck` hijau
- [ ] `bun run build` sukses
- [ ] `HIKARI_VERSION` udah dinaikin
- [ ] Perubahan di `install.sh` / Caddy / `app.ts` diuji di VPS
- [ ] Semua endpoint baru 401 tanpa login
- [ ] Commit + push `main`
- [ ] Tag + push tag
- [ ] Workflow CI sukses
- [ ] Tarball rilis diverifikasi isinya
