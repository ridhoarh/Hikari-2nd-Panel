# SECURITY.md — Protokol Perlindungan

Aturan keamanan yang **wajib** diikuti. Setiap butir di sini lahir dari insiden
nyata atau dari sifat arsitektur yang nggak bisa diubah, bukan dari daftar
periksa umum.

## Prinsip dasar

Panel ini **terekspos ke internet** dan **memegang akses root-equivalent**: dia
bisa bikin container, baca file, dan nulis ke `/etc/caddy`. Satu celah di sini
artinya seluruh VPS jatuh.

Jadi anggapannya bukan "aman karena nggak ada yang tau URL-nya", tapi "aman
karena nggak bisa ditembus walau URL-nya ketahuan".

## 1. Autentikasi

### Middleware auth wajib terdaftar per prefix

Hono match route berdasarkan prefix, jadi middleware **nggak berlaku otomatis**.
Di `app.ts` ada daftar eksplisit:

```ts
const auth = requireAuth(db, cryptoKey)
app.use('/api/projects', auth)
app.use('/api/projects/*', auth)
app.use('/api/apps/*', auth)
// ...
app.use('/api/settings', auth)
```

**Endpoint baru yang nggak didaftarkan di sini bisa diakses tanpa login.**

Ini udah kejadian dua kali:

| Endpoint | Yang bocor |
|---|---|
| `/api/settings` | Versi Hikari, path data, pemakaian disk, status Docker |
| `/api/applications`, `/api/domains`, `/api/activity` | Daftar semua app dan domain |

`/api/settings` dan `/api/backup-schedule` juga sempat kelewat meski udah lama
ada. **Cek daftar ini tiap nambah route.**

Endpoint daftar lintas project udah dikunci pakai tes di
`routes/overview.test.ts` — kalau nambah endpoint baru, tambahkan juga ke
daftar di tes itu.

### Pengecualian yang disengaja

| Path | Alasan | Dijaga oleh |
|---|---|---|
| `/api/webhooks/github/:appId` | GitHub nggak punya cookie | HMAC signature |
| `/api/git-push/*` | Hook `post-receive` dari shell | Push secret per app |
| `/api/setup/status` | Frontend butuh tau harus ke `/setup` atau `/login` | — (cuma boolean) |
| `/api/health` | Cek hidup | — (cuma status + versi) |

Kalaupun nggak ada auth, `/api/setup/status` cuma balikin `{ needsSetup: boolean }`
dan `/api/health` cuma `{ status, version }`. Jangan tambahkan data sensitif ke
dua endpoint itu.

### Setup cuma sekali

`POST /api/setup` nolak dengan 409 kalau `countUsers(db) > 0`. Tanpa ini,
siapa pun bisa bikin akun admin selama ada celah waktu.

### Batas percobaan login

5 percobaan per menit per IP (`middleware/rate-limit.ts`). Ini pengganti
kompleksitas password — makanya batas panjang password cuma 6 karakter.

IP diambil dari `x-forwarded-for` → `x-real-ip` → `'unknown'`. Kalau ada satu
IP `'unknown'`, semua request tanpa header itu masuk ke keranjang yang sama.

### Ganti password wajib ketik password lama

Tanpa itu, sesi yang kecolongan (cookie ketinggalan di komputer lain) bisa
dipakai buat ngunci pemilik aslinya keluar dari akunnya sendiri.

## 2. Rahasia dan kredensial

### Password database

- Disimpan **terenkripsi** (`lib/crypto.ts`), bukan plaintext
- Diambil lewat `readPassword()` yang butuh `cryptoKey`
- **Cuma** dikirim pas mode aksesnya dibuka (`POST /databases/:id/access`)
- Endpoint daftar **wajib** menulis `password: undefined` eksplisit

```ts
// routes/databases.ts DAN routes/overview.ts
const databases = listDatabases(db).map((d) => ({
  ...d,
  password: undefined,     // ← jangan dihapus
}))
```

Ada tes yang ngunci ini (`overview.test.ts` — "password nggak pernah ikut
kekirim"). Kalau tes itu gagal, jangan "perbaiki" tes-nya.

### Password admin

Di-hash argon2id (`memoryCost: 19456, timeCost: 2`), nggak pernah disimpan
atau di-log dalam bentuk asli.

### Sesi

Cookie `hikari_session`, ditandatangani pakai `secretKey` yang dibikin sekali
di `<dataDir>/secret.key` (mode `600`). Cookie yang diutak-atik ditolak —
`verifySession()` cek signature-nya.

### File rahasia yang nggak boleh masuk git

`.gitignore` harus menahan: `secret.key`, `*.key`, `.env`, `known_hosts`,
`graphify-out/cost.json`.

### Jangan pernah taruh rahasia di env yang di-log

Pesan error dan log nggak boleh memuat password, token, atau isi secret.
Kalau butuh debug, cetak statusnya doaang (`401` / `403`), bukan isinya.

## 3. Input dan validasi

### Semua body di-parse Zod

```ts
const parsed = schema.safeParse(await c.req.json().catch(() => null))
if (!parsed.success) return c.json({ error: 'Data nggak valid' }, 400)
```

**`.catch(() => null)` itu wajib.** Tanpa itu, body non-JSON bikin handler-nya
lempar — bukan balikin 400 — dan itu bisa jadi 500 yang bocorin stack trace.

### Hostname divalidasi sebelum masuk Caddy

`validateHostname()` di `caddy/config.ts`. Caddyfile itu file teks; hostname
yang nggak divalidasi bisa nyuntik direktif Caddy ke config. Ini vektor yang
paling serius karena Caddy jalan sebagai **root**.

### Path nggak boleh dibikin dari input user

Kalau butuh nama file dari input (misal nama backup), sanitasi dulu. Jangan
pernah `join(userInput, ...)` langsung.

### Command shell: array, bukan string

```ts
// BENER
await run('docker', ['exec', '-e', `KEY=${val}`, name, 'cmd'])

// SALAH — rawan injeksi
await run(`docker exec -e KEY=${val} ${name} cmd`)
```

## 4. Docker dan isolasi

### Port app nggak pernah bocor ke publik

Container app cuma di-bind ke network Docker; aksesnya lewat Caddy. Ini
diverifikasi di VPS: dari IP publik, port app balikin `HTTP 000`.

### Batas resource wajib

- App: `memory_limit_mb` dan `cpu_limit` **wajib** diisi
- Build: BuildKit dibatasi 768 MB
- Database: `memory_limit_mb` default 512

Tanpa batas, satu app bocor bisa matiin seluruh VPS.

### Container jalan tanpa hak istimewa

Jangan tambahkan `--privileged` atau mount `/var/run/docker.sock` ke container
app. Panel yang butuh Docker, app-nya nggak.

### Env host nggak diteruskan ke `docker exec`

Ini pernah bikin backup Redis gagal terus dengan `NOAUTH` — env yang ditempel
di proses `docker` di host nggak kebaca `redis-cli` di dalam container. Pakai
`-e` eksplisit. (Ini soal kebenaran, bukan keamanan, tapi satu-satunya cara
ngirim rahasia ke dalam container memang lewat `-e`.)

## 5. Akses database publik

Mode akses database, dari paling aman:

| Mode | Bind | TLS | Catatan |
|---|---|---|---|
| `internal` | — | — | Cuma app di VPS yang sama |
| `tunnel` | `127.0.0.1` | lewat SSH | Paling aman buat akses luar |
| `public` (domain) | `127.0.0.1` | ✅ | Caddy TCP proxy |
| `public` (IP) | `0.0.0.0` | ❌ | **Port kebuka, bot bakal nyoba masuk** |

Mode `public` butuh `understandRisk: true` di body — user harus nyatain ngerti
risikonya. Jangan hapus flag itu.

Penting: pakai **domain** bukan berarti aman. Port `IP:port` tetap kebuka, dan
satu port cuma bisa ngelayani satu database (PostgreSQL nggak bawa nama host di
protokol TCP-nya).

## 6. Caddy dan file sistem

### Caddyfile harus bisa ditulis user `hikari`

Panel jalan sebagai `hikari`, **bukan root**. Paket Caddy nulis file-nya
`root:root` 644, jadi tanpa perbaikan ini tiap sync gagal `EACCES` — dan
gejalanya baru kelihatan waktu domainnya dicoba.

`install.sh` menyetel: `chown root:hikari` + `chmod 664`.

### Admin API Caddy cuma di loopback

`admin 127.0.0.1:2019`. Jangan pernah bind ke `0.0.0.0` — siapa pun yang bisa
nembak API itu bisa nulis config Caddy, dan Caddy jalan sebagai root.

### Reload Caddy pakai body

Endpoint `/load` butuh **isi Caddyfile dikirim sebagai body**. Tanpa body,
Caddy balas `400 adapting config using caddyfile adapter: EOF` — pesan yang
menyesatkan, kelihatan kayak file rusak padahal request-nya kosong.

## 7. Deploy key dan Git

### Deploy key cuma buat git

`authorized_keys` di VPS dikunci ke `git-shell` — pemilik key-nya nggak bisa
dapet shell. Tanpa penguncian itu, siapa pun yang punya deploy key bisa masuk
sebagai user `git`.

### Host key SSH di-pin

`install.sh` mengisi `known_hosts` sekali. Tanpa itu, `git clone` nggak bisa
verifikasi identitas server, dan deploy key bisa dicuri lewat MITM.

### Webhook diverifikasi HMAC

Webhook GitHub publik, jadi signature-nya **wajib** dicek. Tanpa itu, siapa pun
bisa memicu deploy.

## 8. Yang wajib dicek tiap nambah fitur

- [ ] Route baru terdaftar di daftar `requireAuth`?
- [ ] Body di-parse Zod, dengan `.catch(() => null)`?
- [ ] Ada yang bocorin password / token / secret di respons?
- [ ] Input yang masuk file path atau command shell udah disanitasi?
- [ ] Operasi destruktif punya pagar (cek label/pola, bukan `rm` polos)?
- [ ] Kalau butuh Docker privileged — beneran butuh, atau ada cara lain?
- [ ] Ada tes yang ngunci perilaku keamanannya?

## 9. Menghadapi temuan

Kalau nemu celah:

1. **Jangan** langsung tulis di dokumen ini seolah udah beres.
2. Bikin tes yang membuktikan celahnya dulu (harus gagal sebelum diperbaiki).
3. Perbaiki, pastikan tesnya lolos.
4. Baru catat di sini kalau polanya bisa berulang.

Contoh yang benar: waktu `/api/settings` ketemu terbuka, tes proteksi ditulis
dulu — dan tes itu langsung nangkep tiga endpoint baru lain yang juga terbuka.
