# AGENTS.md — Aturan Kode

Dokumen ini buat agen AI (dan manusia) yang nulis kode di repo ini. Isinya
aturan yang **wajib** diikuti, bukan saran. Kalau ada yang kelihatan aneh,
baca alasannya dulu sebelum ngubah — hampir semua aturan di sini lahir dari
bug yang pernah kejadian.

## Aturan yang nggak boleh dilanggar

### 1. Nggak ada dependency baru tanpa alasan kuat

Runtime-nya cuma **Bun**. Server pakai `hono`, `zod`, `dockerode`, `ulid`.
Web pakai `react`, `@tanstack/react-router`. Udah, itu aja.

Sebelum nambah package, tanya dulu: bisa nggak dengan yang udah ada? Contoh
nyata: ikon nggak pakai `lucide-react`, cukup teks dan tipografi. Tema warna
nggak pakai `class-variance-authority`, cukup objek biasa.

Alasannya bukan "biar hemat" — tiap dependency nambah permukaan yang harus
diperbarui kalau ada celah keamanan, dan panel ini jalan di VPS yang harus
bisa dipercaya.

### 2. TypeScript strict, nggak ada `any`

`any` dilarang. Kalau tipenya beneran nggak diketahui (misal `res.json()` di
tes), pakai helper dengan generic dan cast eksplisit:

```ts
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}
```

`@ts-ignore` dan `@ts-expect-error` juga dilarang — kalau butuh itu, berarti
tipe aslinya yang salah dan harus dibenerin.

### 3. Validasi semua input pakai Zod

Semua body request di-parse pakai schema Zod. Nggak ada `await c.req.json()`
yang langsung dipakai:

```ts
const parsed = schema.safeParse(await c.req.json().catch(() => null))
if (!parsed.success) return c.json({ error: 'Data nggak valid' }, 400)
```

Yang penting: `.catch(() => null)`. Tanpa itu, body yang bukan JSON bikin
handler-nya lempar, bukan balikin 400.

### 4. Password hash dan secret nggak pernah keluar dari server

- Password database diambil lewat `readPassword()` yang butuh `cryptoKey`, dan
  **cuma** dikirim balik pas mode aksesnya dibuka (`/databases/:id/access`).
  Endpoint daftar **wajib** menulis `password: undefined` secara eksplisit —
  lihat `routes/databases.ts` dan `routes/overview.ts`.
- Kredensial database disimpan terenkripsi (`lib/crypto.ts`), bukan plaintext.
- `HIKARI_SECRET_KEY` dan sejenisnya nggak pernah masuk log.

### 5. Tiap route baru WAJIB dicek di daftar `requireAuth`

Ini yang paling gampang kelewat dan paling berbahaya. Di `app.ts` ada daftar
manual:

```ts
app.use('/api/settings', auth)
app.use('/api/applications', auth)
// ...dan seterusnya
```

Hono match berdasarkan prefix, jadi route yang prefix-nya nggak ada di daftar
itu **bisa diakses tanpa login**. Ini bukan teori:

- `/api/settings` pernah kelewat → versi Hikari, path data, pemakaian disk,
  dan status Docker kebaca siapa pun yang tau URL-nya.
- `/api/applications`, `/api/domains`, `/api/activity` juga pernah kelewat
  waktu pertama kali dibikin.

Endpoin daftar lintas project udah dikunci pakai tes
(`routes/overview.test.ts`). Buat yang lain: **inget-inget cek daftarnya**.

### 5b. Tiap endpoint baru juga WAJIB punya jalan masuk dari panel

Sisi sebaliknya dari aturan di atas, dan sama-sama pernah kejadian. Delapan
endpoint — termasuk info webhook GitHub dan deploy key — udah lengkap di
server tapi halamannya kelupaan dibikin. Akibatnya auto-deploy dari GitHub
dan clone repo privat praktis nggak bisa dipakai, dan nggak ada satu tes pun
yang gagal.

Sekarang ada `apps/web/src/lib/endpoint-coverage.test.ts` yang ngecek tiap
endpoint server punya pemakaian di frontend, atau terdaftar sebagai
pengecualian **beserta alasannya**. Kalau nambah endpoint tanpa halaman,
tesnya bakal gagal dan nyebut path-nya.

Pengecualian hanya buat yang beneran bukan buat panel: dipanggil pihak luar
(webhook), dipanggil internal server (`/github/token`), atau bagian alur
login/setup.

### 6. Operasi yang lama nggak boleh ngeblok request

Backup Redis butuh `BGSAVE` + nunggu selesai. Waktu itu dikerjain di dalam
satu request dan ketemu dua masalah: `Bun.serve` default-nya motong koneksi
di 10 detik, dan nunggu `LASTSAVE` nggak pernah berhasil di mode
`--appendonly yes`.

Aturannya:

- Proses panjang dikerjain di background (lihat antrean build di `app.ts`).
- Kalau terpaksa di dalam request, naikin `idleTimeout` di `Bun.serve` **dan**
  jelaskan alasannya di komentar.
- Jangan pernah andelin `LASTSAVE` — pakai `rdb_bgsave_in_progress`.

### 7. `docker exec` nggak nerusin environment host

Env yang ditempel di proses `docker` di host **nggak kebaca** di dalam
container. Ini pernah bikin backup Redis gagal terus dengan `NOAUTH`.

Kalau perlu ngirim variable ke dalam container, pakai flag `-e`:

```ts
await run('docker', ['exec', '-e', `REDISCLI_AUTH=${password}`, name, 'redis-cli', ...])
```

### 8. Tulis tes buat keputusan, bukan buat baris kode

Tes di repo ini ngunci **perilaku**, dan sengaja dibuat buat nangkep bug yang
cuma kelihatan di runtime. Contoh yang bagus:

- `caddy/service.test.ts` — nangkep request dan periksa **body**-nya. Tes lama
  cuma memalsukan `fetch` tanpa cek body, jadi bug `EOF` lolos.
- `auth.test.ts` — mastiin password lama beneran nggak berubah waktu ganti
  password ditolak.

Kalau nulis fungsi yang keputusannya penting (redirect, validasi, izin),
pisahkan jadi fungsi murni biar bisa dites tanpa DOM atau container.

### 9. Komentar ngejelasin ALASAN, bukan APA

```ts
// SALAH: increment counter
counter++

// BENER: Caddy nolak config kalau body-nya kosong — pesannya menyesatkan
// ("adapting config using caddyfile adapter: EOF"), kelihatan kayak file
// yang rusak padahal request-nya yang nggak ngirim apa-apa.
await fetch(adminUrl, { method: 'POST', body: content })
```

Komentar yang bagus bikin orang nggak "merapikan" kode jadi rusak lagi. Kalau
ada baris yang kelihatan aneh tapi sengaja, jelasin kenapa.

### 10. Nggak ada operasi destruktif tanpa pagar

- Skrip verifikasi nggak boleh hapus apa pun tanpa ngecek label/pola dulu.
  `verify-sisa.sh` sempet mau hapus semua container `hikari-db-*` — di VPS
  produksi itu artinya database pelanggan hilang.
- Perintah yang nyentuh `/var/lib/hikari` atau `/etc/caddy` harus lewat
  `systemctl stop` dulu.

## Konvensi gaya

### Bahasa

Kode (identifier, tipe, nama file): **Inggris**. Komentar, pesan error, dan
teks UI: **Indonesia santai**, kayak ngomong ke teman. Hindari bahasa baku
kaku — "Nggak bisa baca Caddyfile" lebih baik dari "Gagal membaca Caddyfile".

### Penamaan file

- Route server: `routes/<nama>.ts`, ekspor `create<Nama>Routes`
- Repository: `repositories/<nama>.ts`, fungsi `list*` / `get*` / `create*`
- Route web: `_panel.<nama>.tsx` (TanStack Router file-based)
- Komponen: `components/<grup>/<nama>.tsx`

### Format

Nggak pakai Prettier. Gaya yang dipakai: tanpa titik koma, kutip tunggal,
indentasi 2 spasi. Ikuti file sekitarnya.

## Sebelum bilang "selesai"

Jalanin ketiganya dan pastikan hijau:

```bash
bun run typecheck    # server + web
bun test             # 541 tes
bun run build
```

Kalau ada yang gagal, **jangan** bilang selesai. Kalau nggak bisa jalanin
(misal butuh Docker), bilang jelas dan jelasin alasannya.

Perubahan yang nyentuh banyak file (`app.ts`, `caddy/service.ts`,
`install.sh`) harus diuji **di VPS sungguhan**. Bug paling serius di repo ini
lolos typecheck, unit test, dan review — cuma ketemu waktu dijalanin:

- `redisCliEnv` punya tes sendiri yang lolos, padahal fungsinya nggak pernah
  berguna (bug-nya di perilaku `docker exec`).
- `reloadCaddy` kirim POST tanpa body; unit test lolos karena cuma memalsukan
  `fetch`.
- Caddyfile `root:root` 644 → panel jalan sebagai `hikari`, nggak bisa nulis.
- IP publik salah karena `hostname -I` di VPS di belakang NAT nunjukin IP
  privat.
