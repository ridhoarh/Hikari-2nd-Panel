# Hikari — Rancangan

**Status:** Draf — nunggu kamu baca
**Tanggal:** 24 September 2026
**Ini apa:** PaaS pribadi — self-host, satu server, ada WebUI-nya

---

## 1. Hikari Itu Apa Sih

Hikari itu platform deploy yang jalan di server kamu sendiri. Kamu sambungin repo
GitHub, Hikari yang build jadi container, yang jalanin, terus yang bikinin domain
plus HTTPS otomatis.

**Bukan** PaaS yang dipakai banyak orang. **Bukan** juga klon Coolify atau Dokploy.
Hikari ngambil sekitar 20% fitur Dokploy yang beneran kamu pakai tiap hari, sisanya
dibuang.

- **Yang pakai:** kamu sendiri. Satu akun admin.
- **Skalanya:** satu VPS, satu server. Nggak ada cluster.
- **Target RAM:** sekitar 250–300MB waktu nganggur, dari jatah 1GB.

### Prinsipnya

1. **Nggak ada proses yang nyala terus tanpa diminta.** Metrik, log, dan statistik
   diambil pas halamannya dibuka, bukan di-scrape terus-terusan. Ini satu aturan
   yang paling nentuin hemat RAM-nya.
2. **YAGNI, tegas.** Fitur baru masuk daftar "Nanti", nggak masuk rancangan.
   Aturan ini berlaku setelah rancangan ini kamu setujui.
3. **Pakai yang udah matang.** Caddy buat proxy, Docker buat runtime, dockerode
   buat ngobrol sama Docker. Hikari cuma ngatur-ngatur doang.

---

## 2. Server Kamu Kayak Apa

| Item | Isinya |
|---|---|
| VPS | Sumopod (Tencent) |
| Total RAM | 4GB |
| Jatah buat platform | ~1GB (targetnya pakai cuma ~300MB) |
| Jatah buat kerjaan | ~3GB |
| Domain | Di Sumopod, DNS-nya di Cloudflare |
| Port 80/443 | Kebuka (udah kebukti — Dokploy pernah jalan pakai LE) |
| Port panel | **2508** (wajib) |
| Sekarang isinya | Dokploy masih jalan di server yang sama |

**Soal pindahan:** Hikari sama Dokploy nggak bisa barengan pakai port 80/443.
Hikari dibangun di port 2508 dan nggak nyentuh 80/443 sampai Fase 3 (Domain + SSL).
Jadi selama ngoprek, Dokploy tetep aman jalan.

---

## 3. Bentuknya

### Hikari jalan di host, bukan di dalam container

Hikari dijalanin langsung di host pakai systemd, bukan dibungkus container.

Alasannya:
- **Git push deploy** (Fase 3) butuh SSH server dan akses folder host. Kalau SSH
  server-nya harus jalan dari dalam container, ngurusin izinnya bikin pusing.
- **Akses Docker socket.** Container yang megang `/var/run/docker.sock` itu
  sebenernya sama aja kayak root host. Jadi "isolasi"-nya cuma di atas kertas.
- **Biar awet.** Hikari harus hidup selama container yang dia urusin. Kalau Hikari
  sendiri container, malah ribet pas upgrade.

### Gambaran waktu jalan

```
┌─────────────────────────────────────────────────────────┐
│  VPS (4GB)                                              │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Hikari — Bun + Hono, systemd, port 2508          │  │
│  │  ngasih API + hasil build frontend                │  │
│  │  SQLite (file doang, nggak ada proses tambahan)   │  │
│  │  ~100MB                                           │  │
│  └───────────────────────────────────────────────────┘  │
│              │                                          │
│              │  unix socket /var/run/docker.sock        │
│              ▼                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Docker Engine        ~100MB                      │  │
│  └───────────────────────────────────────────────────┘  │
│              │                                          │
│              ├── Caddy                    ~40MB         │
│              ├── BuildKit (cuma pas build, max 768MB)   │
│              ├── App kamu                 sisa RAM      │
│              └── Database kamu            sisa RAM      │
│                                                         │
│  NGANGGUR: Hikari + Docker + Caddy ≈ 250–300MB          │
└─────────────────────────────────────────────────────────┘
```

Yang nyala waktu nganggur: **cuma tiga.** Nggak ada Prometheus, Grafana, cAdvisor,
Redis, atau Postgres buat nyimpen data platform.

### Isi folder repo-nya

Satu repo aja (monorepo).

```
hikari/
├── plan/                       # dokumen ini + rencana implementasi
├── apps/
│   ├── web/                    # Vite + React + TanStack Router
│   └── server/                 # Bun + Hono
├── docker/
│   ├── buildkit/               # setelan BuildKit
│   └── caddy/                  # template Caddyfile
└── systemd/
    └── hikari.service
```

---

## 4. Pakai Apa Aja

| Bagian | Pilihannya | Kenapa |
|---|---|---|
| Frontend | Vite + React + TanStack Router | TanStack Start masih RC; Router-nya udah v1 stabil. Panel admin nggak butuh SSR |
| Tampilan | Tailwind + komponen ditulis sendiri | Cukup card, tombol, tab, status dot. Nggak perlu design system lengkap buat panel satu orang |
| Backend | Bun + Hono | Satu proses, sekaligus ngasih API + file statis. Bun ~60–90MB, lebih hemat dari Node |
| Bahasa | TypeScript dari depan sampai belakang | Satu bahasa. Tipe yang dipakai bareng dikit, jadi ditulis langsung di `apps/web/src/lib/types.ts` — nggak perlu paket workspace sendiri |
| Database internal | SQLite pakai `bun:sqlite` | Nggak ada proses tambahan. Hemat ~200MB dibanding Postgres |
| Ngobrol sama Docker | `dockerode` | API-nya lengkap, udah matang (4.9k ⭐ di 2026) |
| Proxy | Caddy | HTTPS otomatis tanpa setelan ribet; Caddyfile cuma 2 baris per app |
| Build | BuildKit di container terpisah | Bisa dibatasin RAM-nya; bisa dimatiin pas nggak dipakai |
| Cara build | Dockerfile dulu → kalau nggak ada baru Railpack | Dockerfile pasti jalan; Railpack buat repo yang males nulis Dockerfile |
| Sertifikat | Let's Encrypt lewat DNS challenge Cloudflare | Nggak butuh port 80 pas verifikasi; bisa wildcard |

**Versi minimal:** Bun 1.4 ke atas, Docker Engine 24 ke atas. Node nggak dipakai.

### Kenapa nggak pakai SSR (TanStack Start)

SSR itu bagus buat SEO dan biar halaman cepet muncul. Panel rahasia nggak butuh
dua-duanya — malah harusnya nggak boleh diindeks Google. TanStack Start juga masih
RC, jadi API-nya bisa berubah di tengah proyek 3–5 bulan. TanStack Router ngasih
routing type-safe yang sama tanpa lapisan yang belum stabil. RAM-nya juga sama aja.

Waktu ngoprek: Vite dev server (5173) nerusin `/api` ke Hono (2508).
Waktu produksi: satu proses Hono di 2508 ngasih API plus hasil build frontend.

---

## 5. Datanya Disimpen Kayak Apa

Semua waktu disimpen UTC format ISO-8601. ID-nya pakai ULID.

```
settings           — key/value: branding, domain panel, token cloudflare
                     (dienkripsi), batas RAM BuildKit, batas RAM container default
users              — satu baris aja: username, hash password, tanggal dibuat
projects           — id, nama, slug, deskripsi, tanggal dibuat
apps               — id, project_id, nama, slug, sumber (github|giturl|image),
                     url repo, branch, cara build (dockerfile|railpack),
                     path Dockerfile, folder root, nama image, port container,
                     batas RAM, batas CPU, status, tanggal dibuat
env_vars           — id, app_id, key, value (dienkripsi), is_secret
deployments        — id, app_id, status (queued|building|deploying|success|failed),
                     sha commit, pesan commit, tag image, path log build,
                     mulai, selesai, error
domains            — id, app_id, hostname, status tls (pending|active|failed),
                     tanggal dibuat
databases          — id, project_id, engine (postgres|mysql|redis), versi, nama,
                     password (dienkripsi), mode akses (internal|tunnel|public),
                     domain expose, port expose, nama volume, status
storage_buckets    — id, project_id, nama, access key minio,
                     secret key minio (dienkripsi)
webhook_deliveries — id, app_id, delivery_id, event, waktu diterima, status
```

**Aturan hapus:** hapus project = hapus app, deployment, env var, dan domain di
dalamnya. Tapi **volume Docker nggak ikut kehapus**. Hikari bakal ngingetin dan
minta konfirmasi terpisah. Ini biar kamu nggak kehilangan data gara-gara salah klik.

---

## 6. Yang Dibikin

### Fase 1 — Fondasi + Deploy

**Installer & Setup Awal**

Script `install.sh` diambil dari GitHub raw — bukan dari domain Hikari, karena
Hikari-nya belum jalan. Dua cara, dua-duanya ditulis di README:

```bash
# Cepat
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh | sudo bash

# Aman (baca dulu, baru jalanin)
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh -o install.sh
less install.sh && sudo bash install.sh
```

Yang dilakuin `install.sh`:
- Cek OS (Ubuntu/Debian aja). Kalau bukan, berhenti sopan
- Cek Docker; kalau belum ada, install
- Cek port 2508 kosong; kalau kepake, kasih tau dan berhenti
- Bikin user `hikari`
- Download binary dari GitHub Releases ke `/opt/hikari`
- Bikin `/var/lib/hikari` buat SQLite + kunci enkripsi
- Pasang systemd unit `hikari.service`
- Nyalain service, terus kasih tau "buka http://IP:2508"

Catatan teknis: karena dijalanin lewat `curl | bash`, script-nya **nggak punya file
sendiri di disk**. Jadi dia harus berdiri sendiri — ambil semua yang dibutuhin dari
GitHub Releases, jangan pakai `$0`, jangan `read` dari stdin, jangan ngarep ada file
lain di sebelahnya.

Wizard setup pertama kali di browser:
- Bikin akun admin (password di-hash argon2id)
- Nama panel, domain panel
- Opsional token Cloudflare (kalau dilewat, bisa diisi nanti di setelan)
- **Cuma muncul sekali.** Kalau di database udah ada admin, halaman setup nolak dan
  balik ke login — biar nggak ada yang bisa bikin admin baru kalau server ketemu orang

Update Hikari = jalanin `install.sh` lagi. **Nggak ada tombol update di panel**
(nambah attack surface, nggak perlu).

Sengaja **bukan** installer yang jalan dari browser: itu butuh web root yang bisa
eksekusi shell sebagai root (bahaya), nggak menghilangkan kebutuhan SSH (cuma
mindahin ke depan), dan butuh ~600 baris kode buat nyelesaiin masalah yang kamu
nggak punya.

**Login & panel**
- Setup pertama kali: bikin akun admin, password di-hash argon2id
- Login, logout, session pakai cookie (HttpOnly, SameSite=Lax, Secure kalau HTTPS)
- Semua route `/api/*` dijaga, kecuali setup sama login
- Setelan panel: nama panel, logo, domain panel, port panel (2508)
- Layout: sidebar, header, tombol gelap/terang (default terang)

**Project & App**
- Bikin/ubah/hapus Project. Bikin/ubah/hapus App di dalamnya.
- Tiga jenis sumber (tab, kayak Temps):
  - **GitHub** — repo + branch
  - **Git URL** — repo git umum (GitLab, Gitea, self-host)
  - **Docker Image** — langsung dari image, nggak usah build
- Env var per app (yang rahasia dienkripsi, ditampilin tersamar)
- Port container, batas RAM (default 512MB), batas CPU

**Deploy**
- SSH deploy key: Hikari yang bikin keypair, kamu tinggal copy public key-nya
- Clone / pull repo
- Build pakai Dockerfile; kalau nggak ada, baru Railpack
- BuildKit di container terpisah, `--memory=768m`, **cuma satu build sekaligus** (antre)
- Jalanin container dari image hasil build
- Cara deploy: **mati dulu baru nyala** (downtime 2–5 detik)
- Riwayat deploy + log build disimpen (dipangkas otomatis)
- Auto deploy: webhook dari GitHub, cek tanda tangan HMAC, langsung deploy
- Bersihin image lama setelah deploy sukses (sisain 2 tag terbaru)
- Tombol nyala / mati / restart / hapus
- Log container live (streaming dari Docker API pas halaman log dibuka)

**Domain & SSL** (masuk Fase 1, karena Caddy sama app butuhnya barengan)
- Set domain per app
- Hikari yang bikin setelan Caddy dari domain yang kedaftar
- Reload Caddy tanpa bikin app mati (lewat admin API)
- Let's Encrypt lewat DNS challenge Cloudflare
- Token API Cloudflare disimpen terenkripsi di setelan
- Status sertifikat ditampilin per domain

**Ngeliatin keadaan** (cuma kalau diminta)
- Halaman app nampilin status: jalan / mati / gagal
- Statistik diambil pas dibuka aja (panggil `stats` Docker tanpa stream): CPU, RAM, uptime
- Nggak ada riwayat metrik. Nggak ada grafik.

**Ngatur sumber daya**
- Slider buat batas RAM sama CPU per container
- Semua container **wajib** punya batas RAM (biar satu app nggak bisa matiin seluruh VPS)

### Fase 2 — Database & Storage

**Database**
- Yang didukung: PostgreSQL, MySQL, Redis
- Bikin database: password 32 karakter dibikin otomatis, volume otomatis
- Tiga mode akses:
  - **Internal** (default) — cuma bisa diakses app di VPS yang sama
  - **Tunnel** — Hikari nampilin perintah `ssh -L` yang tinggal kamu copy
  - **Public** — port-nya dibuka ke internet
- Kalau mode Public:
  - Bisa lewat domain (`db-*.domain`) atau IP, kamu pilih
  - Port-nya beda-beda per database (PostgreSQL nggak bawa nama host di protokol
    TCP-nya, jadi satu port cuma bisa ngelayanin satu database)
  - TLS lewat Caddy sebagai TCP proxy, `sslmode=require`
  - Password wajib 32 karakter; tombol "Pasang Public" baru aktif setelah checkbox
    "Aku ngerti risikonya" dicentang
  - Hikari bakal bilang terang-terangan: pakai domain **bukan** berarti aman;
    bot tetap nyoba masuk lewat IP:port
- Tampilin connection string yang tinggal copy
- **Backup manual:** tombol export jalanin `pg_dump` / `mysqldump` terus file-nya
  bisa kamu download. Backup otomatis nggak ada di fase ini.

**Storage**
- MinIO jalan sebagai container, volume-nya awet
- Bucket dibikin dari Hikari (nama + access key + secret key)
- Bisa dibuka: Internal doang atau Public endpoint S3
- Tampilin endpoint + kredensial yang tinggal copy

### Fase 3 — Biar Enak Dipakai

- Git push deploy: SSH server di host, bare repo per app, hook `post-receive`
- Terminal web ke container (WebSocket → `docker exec`)
- Backup otomatis terjadwal (tetap kamu yang nyalain; nggak ada proses yang nyala terus)
- Tombol restore (dari file backup yang kamu upload)
- Cloudflare auto-DNS (bikin record A sendiri)
- GitHub App (bisa akses semua repo + kirim status balik ke GitHub)

### Nggak Akan Dibikin — Selamanya

- Multi-server, cluster, auto-scale
- Multi user, tim, role, billing
- Prometheus, Grafana, cAdvisor, alarm-alarm
- AI gateway, MCP server, sandbox, email
- Toko template / one-click install
- 19 preset framework (cukup Dockerfile + Railpack)
- SSR di panel
- Monaco editor atau editor kode di dalam panel

---

## 7. Alurnya

### 7.1 Deploy dari GitHub

```
1. Kamu push ke GitHub
2. GitHub kirim webhook ke /api/webhooks/github/:appId
3. Hikari cek tanda tangan HMAC (rahasianya beda per app)
4. Bikin baris deployment (status: queued). Masuk antrean (maks 1 jalan sekaligus)
5. Antreannya mulai:
   a. Clone/pull repo pakai SSH deploy key (depth 1)
   b. Cek cara build: ada Dockerfile? -> pakai. Nggak ada? -> Railpack
   c. Build lewat BuildKit (--memory=768m), log-nya ngalir ke file
   d. Sukses? -> kasih tag image <app-slug>:<deployment-id>
6. Matiin container lama, hapus, jalanin container baru dari image baru
   (mati dulu baru nyala: ada downtime 2–5 detik)
7. Daftarin ke Caddy -> reload
8. Update status deployment (sukses/gagal). Kalau gagal, error-nya dicatat
9. Bersihin image lama (sisain 2 tag terbaru)
```

**Kalau build gagal:** container lama **tetap jalan**. Deployment-nya ditandai
`failed` plus log-nya. Jadi kalau deploy gagal, app yang udah jalan nggak ikut mati.

### 7.2 Buka Akses Database

```
Internal:
  -p 127.0.0.1:<port>:<port>
  -> cuma bisa diakses dari dalam VPS

Tunnel:
  -p 127.0.0.1:<port>:<port>   (sama kayak internal)
  -> Hikari cuma nampilin perintah: ssh -L <port>:localhost:<port> user@vps
  -> nggak ada port yang dibuka ke internet

Public (lewat IP):
  -p 0.0.0.0:<port>:<port>
  -> wajib lewat peringatan + checkbox konfirmasi

Public (lewat domain):
  -p 127.0.0.1:<port>:<port>
  -> Caddy dengerin domain:port terus nerusin TCP ke 127.0.0.1:<port>
  -> Caddy pakai sertifikat Lets Encrypt yang sama
  -> connection string-nya pakai sslmode=require
```

Ganti mode itu artinya bikin ulang container dengan pemetaan port yang beda (bukan
restart), karena pemetaan port nggak bisa diubah di container yang udah jadi.

### 7.3 Bersihin Sampah (biar disk nggak penuh)

Dijalanin tiap abis deploy sukses:
- `docker image prune` buat image yang nggak ketag
- Sisain 2 tag terbaru per app, sisanya hapus
- Pangkas log build yang lebih tua dari 30 hari atau lebih dari 50 deploy per app
- Tampilin pemakaian disk di setelan panel

Disk penuh itu penyebab VPS mati yang paling sering dan paling susah ketahuan.
Makanya ditaruh di jalur deploy, bukan jadi cron — biar nggak ada proses yang
nyala terus.

---

## 8. Keamanan

| Bagian | Ditangani gimana |
|---|---|
| Password admin | argon2id |
| Session | Cookie HttpOnly + SameSite=Lax + Secure kalau HTTPS |
| Env var & password DB | Dienkripsi di SQLite, kuncinya dari file terpisah (mode 600) |
| Webhook GitHub | Tanda tangan HMAC-SHA256, rahasianya beda per app |
| Token API Cloudflare | Dienkripsi di setelan; izinnya minimal (Edit DNS zone aja) |
| Database Public | Wajib password 32 karakter + checkbox konfirmasi + peringatan |
| Setelah login | Wajib ganti password default, kunci enkripsi dibikin otomatis |
| Batas login | 5x percobaan per menit per IP |

**Yang nggak dilindungin Hikari:** kalau server host-nya udah dijebol, semua
kredensial bisa dibaca. Hikari bukan sistem buat banyak orang, dan nggak pura-pura
jadi begitu.

---

## 9. Ngetesnya Gimana

Ngetesnya pakai TDD buat bagian yang logikanya murni, dan tes integrasi buat yang
nyentuh Docker.

**Unit (vitest):**
- Baca & validasi setelan build
- Bikin setelan Caddy dari daftar domain
- Bikin perintah `ssh -L` dan connection string
- Enkripsi/dekripsi kredensial
- Cek tanda tangan webhook
- Validasi input (skema zod) buat semua endpoint

**Integrasi (butuh Docker, jalanin manual):**
- Bikin, jalanin, matiin, hapus container
- Build image dari contoh Dockerfile
- Streaming log container
- Pastikan batas RAM beneran berlaku

**Manual (checklist):**
- Deploy dari repo GitHub asli, dari awal sampai jalan
- Sertifikat Let's Encrypt beneran terbit
- Ganti mode akses database

Nggak ada tes otomatis buat yang nyentuh Let's Encrypt atau API Cloudflare —
dua-duanya butuh kredensial asli dan domain asli.

---

## 10. Yang Kamu Terima Apa Adanya

Ini bukan daftar kekurangan yang harus dibenerin. Ini keputusan sadar.

1. **Build-nya di VPS.** App berat (Next.js, Java, Rust) bisa gagal build karena
   kehabisan RAM di batas 768MB. Solusinya: pakai tab "Docker Image", build di
   GitHub Actions terus push ke registry.
2. **Mati dulu baru nyala.** Ada downtime 2–5 detik tiap deploy.
3. **Nggak ada riwayat metrik.** Statistik cuma nilai saat itu.
4. **Nggak ada rollback.** Riwayat deploy disimpen, tapi balikin ke versi lama belum ada.
5. **Bentrok sama Dokploy.** Nggak bisa jalan bareng di port 80/443.
6. **Let's Encrypt butuh domain.** Nggak bisa bikin sertifikat buat alamat IP.
7. **Installer cuma buat Ubuntu/Debian.** Di Fedora, Arch, atau Alpine bakal gagal.
   Itu diterima, bukan bug — VPS-mu Ubuntu.
8. **Nggak ada tombol update di panel.** Update = jalanin `install.sh` lagi.

---

## 11. Yang Masih Belum Diputusin

Nggak ada. Semua udah dikunci:

- [x] Hikari di host, bukan di container
- [x] Satu repo (monorepo)
- [x] Mati dulu baru nyala, bukan zero-downtime
- [x] Backup manual dulu
- [x] Storage = API S3 (MinIO), bukan file browser
- [x] Database: Internal / Tunnel / Public, domain + TLS opsional
- [x] Frontend SPA (TanStack Router + Vite), bukan SSR
- [x] Caddy, bukan Traefik
- [x] SQLite, bukan Postgres
- [x] Bun + Hono
- [x] BuildKit dibatasin 768MB, satu build sekaligus

---

## 12. Yang Bikin Proyek Ini Berisiko

| Risiko | Cara ngehindarin |
|---|---|
| Proyeknya nggak kelar (ini yang paling mungkin) | Fase 1 wajib dipakai deploy app asli sebelum masuk Fase 2 |
| Fitur nambah terus | Fitur baru masuk daftar "Nanti"; rancangan ini nggak diubah setelah disetujui |
| Disk penuh bikin VPS mati | Bersihin otomatis di jalur deploy + tampilan pemakaian disk |
| Build gagal gara-gara RAM | Tab Docker Image jadi jalan alternatif |
| API TanStack Router berubah | Router-nya udah v1 stabil; jangan pakai TanStack Start |

**Perkiraan waktu:** 3–5 bulan kalau seminggu ngoprek 10 jam. Fase 1 doang: 8–12 minggu.
