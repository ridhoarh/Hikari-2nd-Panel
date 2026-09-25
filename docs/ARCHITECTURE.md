# ARCHITECTURE.md — Peta Kode

Dokumen ini buat agen AI biar nggak bikin folder duplikat atau file yang mirip
tapi beda tempat. Sebelum nambah file, cek dulu di sini — kemungkinan besar
tempatnya udah ada.

## Bentuk repo

```
Hikari-2nd-Panel/
├── apps/
│   ├── server/          # Bun + Hono — API, Docker, Caddy, build
│   └── web/             # React + Vite + TanStack Router + Tailwind
├── docs/                # Dokumen ini
├── plan/                # Rencana lama (arsip, jangan diedit)
├── install.sh           # Installer buat VPS
├── verify-*.sh          # Skrip verifikasi (jalanin di mesin uji)
└── .github/workflows/   # CI: build + rilis tarball
```

Dua workspace, diatur `package.json` root. Nggak ada monorepo tool — cukup
`bun run --filter '*' <script>`.

## Server (`apps/server/src/`)

```
index.ts              # Titik masuk: baca config, jalanin Bun.serve
app.ts                # Wiring semua route + middleware. SEMUA route didaftarkan di sini
static.ts             # Serve frontend + fallback SPA

routes/               # Handler HTTP. Tipis — logika bisnisnya di tempat lain
  auth.ts             #   setup, login, logout, ganti password
  projects.ts         #   CRUD project
  apps.ts             #   CRUD app + deploy/kontrol + env + domain
  databases.ts        #   CRUD database + backup/restore + mode akses
  storage.ts          #   Bucket MinIO
  settings.ts         #   Info panel (versi, disk, RAM, port)
  overview.ts         #   Daftar lintas project (buat halaman datar di sidebar)
  webhooks.ts         #   Webhook GitHub (publik, dijaga HMAC)

repositories/         # Akses database. Cuma SQL, nggak ada HTTP
  users.ts, projects.ts, apps.ts, databases.ts, domains.ts,
  deployments.ts, env-vars.ts, storage-buckets.ts

docker/               # Semua yang nyentuh Docker
  client.ts           #   Koneksi Docker + penamaan container/network/image
  containers.ts       #   Bikin + jalanin container app
  db-containers.ts    #   Container database (postgres/mysql/redis)
  stats.ts            #   Statistik CPU/RAM on-demand
  maintenance.ts      #   Bersihin resource yang nggak kepake
  minio.ts            #   Container MinIO

build/                # Pipeline build
  queue.ts            #   Antrean build (satu-satunya, satu per satu)
  buildkit.ts         #   BuildKit terbatas 768 MB
  git.ts              #   Clone repo pakai deploy key
  railpack.ts         #   Build tanpa Dockerfile
  exec.ts             #   Bungkus proses shell

caddy/                # Reverse proxy
  config.ts           #   Bikin isi Caddyfile dari daftar domain
  service.ts          #   Tulis file + reload lewat admin API

cloudflare/           # Auto-DNS
github/               # GitHub App (clone repo privat, commit status)
git-push/             # Git push deploy (bare repo + hook)
terminal/             # WebSocket terminal ke container

db/                   # SQLite
  client.ts           #   Buka database
  schema.ts           #   SEMUA tabel didefinisikan di sini
  migrate.ts          #   Jalanin migrasi
  service.ts          #   Nyalain/matiin container database
  backup.ts           #   Bikin file backup
  restore.ts          #   Restore dari file
  auto-backup.ts      #   Jadwal backup (dicek abis deploy)

lib/                  # Helper murni, nggak nyentuh I/O
  crypto.ts           #   Enkripsi kredensial
  password.ts         #   Hash + cek kekuatan password
  session.ts          #   Cookie sesi
  id.ts               #   ULID + waktu
  db-engines.ts       #   Definisi engine (versi default, port, password)
  ssh-key.ts          #   Bikin keypair
  version.ts          #   HIKARI_VERSION

middleware/
  auth.ts             #   requireAuth
  rate-limit.ts       #   Batas percobaan login
```

### Aturan penempatan file

| Kalau butuh... | Taruh di... |
|---|---|
| Endpoint HTTP baru | `routes/` — daftarkan juga di `app.ts` + cek `requireAuth` |
| Query SQL baru | `repositories/` |
| Nyentuh Docker | `docker/` |
| Helper tanpa I/O | `lib/` |
| Tabel baru | `db/schema.ts` |

**Jangan** bikin folder `services/`, `utils/`, atau `helpers/` — tempatnya
udah ada di atas.

## Web (`apps/web/src/`)

```
main.tsx              # Titik masuk
router.tsx            # Instance router
routeTree.gen.ts      # DIHASILKAN OTOMATIS — jangan diedit
styles.css            # Token warna + dasar

routes/               # TanStack Router file-based
  __root.tsx          #   Kerangka akar (h-screen overflow-hidden)
  _panel.tsx          #   Layout panel + penjaga login
  _panel.index.tsx    #   / → Ringkasan
  _panel.<nama>.tsx   #   /<nama> → halaman datar
  login.tsx, setup.tsx

components/
  layout/             #   app-shell.tsx, sidebar.tsx
  ui/                 #   button, card, list, status-dot
  apps/               #   Panel detail app (logs, terminal, env, domains, git)
  databases/          #   Kartu + dialog database
  projects/           #   Daftar + dialog project
  settings/           #   Panel GitHub, Cloudflare, backup
  storage/            #   Daftar bucket

hooks/
  use-auth.ts         #   Sesi + username
  use-list.ts         #   Ambil daftar dari API (loading/error seragam)
  use-setup-gate.ts   #   Penjaga redirect /login ↔ /setup
  use-visible-interval.ts  # Polling yang sadar tab

lib/
  api.ts              # Klien fetch
  types.ts            # SEMUA tipe data — jangan bikin tipe lokal
```

### Aturan penempatan file

| Kalau butuh... | Taruh di... |
|---|---|
| Halaman baru | `routes/_panel.<nama>.tsx`, lalu tambahkan di `sidebar.tsx` |
| Komponen dipakai >1 halaman | `components/<grup>/` |
| Hook | `hooks/` |
| Tipe data | `lib/types.ts` |

**Semua** tipe data di satu tempat (`lib/types.ts`). Kalau butuh tipe baru,
tambahkan di sana — jangan bikin `types.ts` lokal di komponen.

## Alur data

```
Browser (React)
   │  fetch, cookie sesi
   ▼
Hono (routes/)  ── middleware/auth.ts (cek cookie)
   │
   ├── repositories/ ──► SQLite (satu file, /var/lib/hikari/hikari.sqlite)
   │
   ├── docker/  ──────► Docker daemon (container app + database)
   │
   ├── build/queue.ts ► BuildKit ──► image
   │
   └── caddy/service  ► Tulis /etc/caddy/Caddyfile
                        reload admin API (127.0.0.1:2019)
```

### Alur deploy

```
Push GitHub ─► webhook  ─┐
Push git    ─► hook     ─┼─► antrean (satu-satunya)
Klik Deploy ────────────┘        │
                                 ▼
              clone repo (deploy key)
                                 ▼
              build (Dockerfile / Railpack, batas 768 MB)
                                 ▼
              stop container lama ─► jalanin image baru
                                 ▼
              status 'running'  ─► cek jadwal backup
                                 ▼
              sync Caddy (tulis + reload)
```

Caddy selalu di-sync **setelah** perubahan domain, bukan lewat polling.

## Skema database

SQLite, **satu file**. Semua tabel di `db/schema.ts`. Waktu disimpan sebagai
teks ISO 8601; ID pakai **ULID** (urut waktu, jadi bisa jadi kunci sortir).

```
settings          key, value                          # konfigurasi key-value
users             id, username, password_hash, created_at
projects          id, name, slug, description, created_at

apps              id, project_id ─┐
                  name, slug      │  source_type: github | giturl | image
                  source_type     │  build_strategy: dockerfile | railpack
                  repo_url, branch, dockerfile_path, root_dir, image_ref
                  container_port, memory_limit_mb, cpu_limit
                  status (stopped | building | running | failed)
                                  │
env_vars          app_id ─────────┤  UNIQUE(app_id, key)
deployments       app_id ─────────┤  status: queued|building|deploying|success|failed
domains           app_id ─────────┤  hostname UNIQUE, tls_status
webhook_deliveries app_id ────────┘

databases         project_id ──► projects.id
                  engine: postgres | mysql | redis
                  access_mode: internal | tunnel | public | domain
                  host_port UNIQUE (range 20001–29999)
                  password TERENKRIPSI

storage_buckets   project_id ──► projects.id  (name UNIQUE)

backups           database_id ──► databases.id
```

### Jebakan skema

- **`ON DELETE CASCADE` di mana-mana.** Hapus project → app, database, bucket,
  domain-nya ikut kehapus. Yang **nggak** ikut: volume Docker. Data database
  tetap ada di volume, sesuai janji di UI.
- **`host_port UNIQUE`.** Satu port cuma bisa buat satu database. Ini batasan
  protokol: PostgreSQL nggak bawa nama host di TCP-nya, jadi Caddy nggak bisa
  route berdasarkan nama.
- **`password` di tabel `databases` terenkripsi.** Ambilnya lewat
  `readPassword()` yang butuh `cryptoKey`.
- **`domains.hostname UNIQUE`** global, bukan per app — supaya nggak ada dua
  app rebutan domain yang sama.
- **Indeks** ada di `apps(project_id)`, `databases(project_id)`,
  `deployments(app_id, created_at DESC)`, `backups(database_id, created_at DESC)`.
  Tabel `domains` dan `env_vars` nggak punya indeks tambahan — jumlahnya kecil
  per project.

## Keputusan desain yang perlu diketahui

| Keputusan | Alasan |
|---|---|
| SQLite, bukan Postgres | State-nya harus nggak butuh server database sendiri |
| BuildKit dibatasi 768 MB | Build nggak boleh matiin VPS |
| Build satu-satu (antrean) | VPS 2 CPU nggak kuat build paralel |
| Caddy ditulis ulang penuh, bukan di-append | Satu sumber kebenaran: tabel `domains` |
| Backup Redis tanpa restore | Restore butuh container mati; belum dibikin |
| Backup dicek abis deploy, bukan cron | Prinsip: nggak ada proses nyala terus |
| Port app cuma lewat Caddy | Nggak ada port yang bocor ke publik |
| `docker exec` pakai `-e`, bukan env host | Env host nggak diteruskan ke container |
