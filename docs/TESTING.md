# TESTING.md — Jaminan Mutu

Dokumen ini ngejelasin **cara nguji** dan **apa yang harus diuji**. Bagian
terpentingnya bukan angkanya, tapi satu pelajaran yang didapat dengan mahal:
**tes yang lolos belum berarti fiturnya jalan.**

## Perintah

Semua dari root repo:

```bash
bun test              # 541 tes, ~14 detik
bun run typecheck     # server + web (tsc --noEmit)
bun run build         # build frontend
```

Jalankan satu file:

```bash
bun test apps/server/src/routes/auth.test.ts
bun test apps/server/src/caddy/service.test.ts
```

Kalau butuh Docker (skrip verifikasi), lihat bagian bawah.

## Pelajaran yang paling mahal

Bug paling serius di proyek ini **lolos typecheck, unit test, dan review kode**,
dan cuma ketemu waktu dijalanin di VPS sungguhan.

| Bug | Kenapa tesnya lolos |
|---|---|
| `redisCliEnv` nggak pernah berguna | Fungsinya punya unit test sendiri. Bug-nya di perilaku `docker exec` — env host nggak diteruskan ke container; itu nggak bisa dites tanpa container nyata |
| `reloadCaddy` kirim POST tanpa body | Unit test cuma memalsukan `fetch` dan ngecek `ok`-nya. Body-nya nggak pernah diperiksa |
| Caddyfile `root:root` 644 | Nggak ada tes yang nyentuh izin file. Gejalanya baru kelihatan waktu panel (user `hikari`) nyoba nulis |
| `HIKARI_VERSION` tetap `0.1.0` | Tesnya cuma ngecek **format** semver. Nggak ada yang bisa mastiin angkanya sama dengan tag git |
| IP publik salah (`hostname -I` di belakang NAT) | Bug-nya di lingkungan jaringan, bukan di logika aplikasi |
| `/api/settings` terbuka tanpa login | Nggak ada tes yang nyisir semua endpoint |

**Kesimpulannya bukan "tes nggak guna"**, tapi: tulis tes yang nangkep **arti**,
bukan yang cuma manggil fungsi.

## Cara nulis tes di proyek ini

### Tes yang menangkap bug nyata

**Periksa argumen yang dikirim, bukan cuma hasil akhirnya:**

```ts
// caddy/service.test.ts — ini yang nangkep bug body kosong
function captureFetch(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return response
  }) as unknown as typeof fetch
  return { fetch: fn, calls }
}

expect(calls[0].init?.body).toBe('contoh.com {\n}\n')  // ← inti masalahnya
```

**Pisahkan keputusan jadi fungsi murni** biar bisa dites tanpa DOM:

```ts
// hooks/use-setup-gate.ts
export function resolveAuthRedirect(expected, needsSetup) {
  if (needsSetup === true && expected !== 'setup') return '/setup'
  if (needsSetup === false && expected === 'setup') return '/login'
  return null
}
```

Ini penting karena bug aslinya (halaman `/login` nampilin form padahal belum
ada user) cuma kelihatan di browser.

**Uji jalur penolakan, bukan cuma jalur sukses:**

```ts
// auth.test.ts — mastiin password TIDAK berubah waktu ditolak
test('password lama salah ditolak, password-nya nggak berubah', async () => {
  const ganti = await a.request('/api/auth/password', { ... })
  expect(ganti.status).toBe(401)

  const loginLama = await a.request('/api/auth/login', {
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })
  expect(loginLama.status).toBe(200)   // ← yg lama harus tetap jalan
})
```

**Nyisir semua endpoint yang mirip:**

```ts
// overview.test.ts — ini yang nangkep 3 endpoint kebuka sekaligus
for (const path of [
  '/api/applications', '/api/databases', '/api/storage', '/api/domains',
  '/api/backups', '/api/activity', '/api/settings', '/api/backup-schedule',
]) {
  test(`GET ${path} tanpa login 401`, async () => {
    expect((await app.request(path)).status).toBe(401)
  })
}
```

### Aturan praktis

1. **Tulis tes lebih dulu kalau bugunya udah ada.** Pastikan tesnya GAGAL
   dulu, baru perbaiki. Kalau nggak pernah gagal, berarti tesnya salah.
2. **Satu tes satu alasan gagal.** Nggak ada `expect` bertumpuk tanpa
   keterangan.
3. **Nama tes pakai bahasa Indonesia** yang ngejelasin perilakunya:
   `'nolak password yang kekecilan'`, bukan `'test password validation'`.
4. **Jangan tes detail implementasi.** Tes `readFileSync` dipanggil 2x itu
   rapuh; tes "file-nya berisi X" itu tahan refactor.
5. **Data uji pakai `dataDir` sementara**, jangan `/var/lib` — lihat pola di
   `apps.test.ts` (`mkdtempSync`).

## Cakupan

**Target: 100% keputusan penting tertutup**, bukan angka persen baris.

Yang **wajib** ada tesnya:

- Semua endpoint: 401 tanpa login
- Validasi input: body kosong, bukan JSON, nilai di luar batas
- Operasi merusak: hapus project nggak hapus volume (`verify-volume.sh`)
- Alur keamanan: setup sekali, batas login, ganti password
- Keputusan redirect dan penjaga halaman
- Parser yang rapuh (parsing `INFO` Redis toleran `\r`)
- Format yang dikonsumsi sistem lain (semver tanpa awalan `v`)

Yang **nggak perlu**:

- Getter/setter sepele
- Tampilan murni (warna, jarak)
- Yang cuma bisa diverifikasi di VPS → pakai skrip verifikasi, bukan unit test

## Skrip verifikasi (butuh Docker)

Delapan skrip di root repo. Semuanya jalanin server di port **2508** dan
**bikin + menghapus container/volume Docker**.

> ⚠️ **Jangan jalanin di VPS yang melayani produksi.** Panelnya bakal ketiban
> dan datanya bisa hilang. Pakai mesin uji, atau VPS yang datanya boleh hilang.

| Skrip | Yang diverifikasi |
|---|---|
| `verify-e2e.sh` | Alur lengkap dari nol: deploy app sungguhan |
| `verify-fase2.sh` | Database sungguhan + storage |
| `verify-fase3.sh` | Restore, backup terjadwal, terminal |
| `verify-volume.sh` | Hapus project **nggak** hapus volume (soal kehilangan data) |
| `verify-sisa.sh` | Backup Redis, status TLS asli, disk usage |
| `verify-terminal.sh` | Terminal WebSocket beneran nyambung |
| `verify-github.sh` | GitHub App pakai mock server |
| `verify-gitpush.sh` | Bare repo, hook `post-receive`, endpoint |

Cara jalanin:

```bash
bash verify-volume.sh          # satu skrip
for s in verify-*.sh; do bash "$s" || echo "GAGAL: $s"; done
```

**`verify-sisa.sh` sengaja nolak jalan** kalau port 2508 udah kepakai. Itu
perilaku yang benar (pagar keamanan), bukan bug — dulu skrip itu mau hapus
semua container `hikari-db-*` tanpa pandang bulu, yang di produksi artinya
database pelanggan hilang.

Skrip-skrip ini aman dipindah-pindah: sumbernya `install.sh` (bukan path
relatif ke git), dan penanda ujinya label, bukan nama.

## Yang wajib diuji di VPS sungguhan

Sebelum tag rilis, kalau perubahan menyentuh:

| File | Yang harus dibuktikan |
|---|---|
| `install.sh` | Install dari nol selesai tanpa error |
| `caddy/service.ts` | Tambah domain → config Caddy aktif memuat domainnya, log bersih |
| `app.ts` | Semua endpoint 401 tanpa login |
| `docker/` atau `db/` | Container beneran jalan, backup/restore jalan |
| `Bun.serve` | Request panjang nggak kepotong (`idleTimeout`) |

Setelah install, cek daftar minimum:

```bash
systemctl is-active hikari && systemctl show hikari -p NRestarts   # 0 = stabil
curl -s localhost:2508/api/health                                  # versi benar
sudo -u hikari test -w /etc/caddy/Caddyfile && echo bisa tulis
for ep in settings applications domains activity; do
  curl -s -o /dev/null -w "%{http_code} $ep\n" "localhost:2508/api/$ep"
done
```

## Alur rilis

```bash
bun test && bun run typecheck && bun run build
git push origin main
GIT_EDITOR=true git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Workflow CI bikin tarball dan nerbitin rilis. Verifikasi isinya:

```bash
curl -sL .../releases/download/vX.Y.Z/hikari.tar.gz -o h.tar.gz
tar -xzf h.tar.gz apps/server/src/lib/version.ts && grep HIKARI_VERSION ...
```

Jangan lupa naikin `HIKARI_VERSION` **sebelum** tag — pernah kejadian tag
`v0.1.1` tapi panelnya masih lapor `0.1.0`.
