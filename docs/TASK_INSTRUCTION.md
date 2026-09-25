# TASK_INSTRUCTION.md — Lembar Kerja Bertahap

Ini prompt kerja buat agen AI. Jalanin **fase per fase**, berurutan. Jangan
lompat. Jangan gabung fase.

## Aturan yang berlaku di semua fase

1. **Baca dulu** `docs/AGENTS.md` dan `docs/ARCHITECTURE.md` sebelum nulis kode.
   Aturan penempatan file ada di sana.
2. **Satu fase satu commit.** Commit message pakai gaya `feat:` / `fix:` /
   `docs:` / `chore:`.
3. **Jalankan validasi tiap akhir fase:** `bun test`, `bun run typecheck`,
   `bun run build`. Kalau ada yang merah, **jangan lanjut**.
4. **Jangan bilang "selesai"** kalau belum lihat hasilnya sendiri. Laporkan
   perintah yang dijalankan dan hasilnya.
5. **Kalau ada yang nggak bisa dijalankan** (misal butuh Docker), bilang jelas
   dan jelasin alasannya. Jangan diem-diem dilewatin.
6. **Jangan nambah dependency** tanpa alasan kuat yang dijelaskan.
7. **Jangan ubah** file di `plan/` — itu arsip.

---

## FASE 0 — Orientasi

**Tujuan:** paham kode sebelum nyentuh apa pun.

- [ ] Baca `docs/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`
- [ ] Baca `README.md`
- [ ] Jalanin `bun test` — catat jumlah tes dan pastikan 0 gagal
- [ ] Jalanin `bun run typecheck` — pastikan bersih
- [ ] Bikin daftar: file apa yang bakal disentuh untuk tugas ini

**Output:** laporan singkat — jumlah tes, kondisi typecheck, daftar file.

**Jangan** nulis kode di fase ini.

---

## FASE 1 — Perencanaan

**Tujuan:** rencana yang bisa dikoreksi sebelum nulis kode.

- [ ] Tulis rencana: file apa dibuat/diubah, dan **kenapa**
- [ ] Cek di `ARCHITECTURE.md` apakah tempatnya udah ada (jangan bikin folder baru)
- [ ] Kalau nambah endpoint: **tulis dulu** dia bakal didaftarkan di
      `requireAuth` mana
- [ ] Kalau nambah halaman: tulis dia masuk grup sidebar mana
- [ ] Kalau nambah tabel: tulis skemanya
- [ ] Kalau nambah dependency: tulis alasannya

**Output:** rencana tertulis. Tunggu konfirmasi user sebelum lanjut.

---

## FASE 2 — Tes dulu (kalau memperbaiki bug)

**Tujuan:** membuktikan bug-nya ada, bukan berasumsi.

- [ ] Tulis tes yang **GAGAL** dengan kode sekarang
- [ ] Jalanin, tunjukkan output gagalnya
- [ ] Kalau tesnya langsung lolos → berarti tesnya salah, atau bug-nya bukan
      di situ. **Berhenti dan periksa ulang.**

**Output:** output tes yang gagal, sebelum ada perbaikan apa pun.

Lewati fase ini kalau bikin fitur baru (bukan memperbaiki bug) — langsung ke
Fase 3, api tulis tesnya bersamaan.

---

## FASE 3 — Implementasi

**Tujuan:** kode yang menyelesaikan tugas tanpa merusak yang lain.

Urutan:

- [ ] Skema database (kalau perlu) — `db/schema.ts`
- [ ] Repository (query SQL) — `repositories/`
- [ ] Logika bisnis — `docker/`, `build/`, `caddy/`, atau `lib/`
- [ ] Route HTTP — `routes/`, **lalu daftarkan di `app.ts`**
- [ ] Halaman / komponen frontend
- [ ] Tes

### Pengingat saat implementasi

| Kalau... | Ingat |
|---|---|
| Nambah route | Daftarkan di `app.ts` + cek daftar `requireAuth` |
| Ngirim data ke frontend | Jangan pernah ikutkan password/secret. `password: undefined` eksplisit |
| Parse body | Zod, dengan `.catch(() => null)` |
| Panggil shell | Pakai array, bukan string |
| `docker exec` | Pakai `-e`, bukan env host |
| Operasi lama di request | Naikin `idleTimeout` + jelasin di komentar |
| Bikin UI | Pakai token warna dari `DESIGN.md`, jangan warna literal |
| Bikin tata letak | Mobile-first: class sempit dulu, baru `md:` / `lg:` |
| Bikin tipe baru | Taruh di `lib/types.ts`, bukan file lokal |

---

## FASE 4 — Validasi

**Tujuan:** membuktikan kodenya jalan, bukan cuma "kelihatannya benar".

- [ ] `bun test` — semua hijau
- [ ] `bun run typecheck` — bersih
- [ ] `bun run build` — sukses
- [ ] Tes yang ditulis di Fase 2 sekarang **lolos**
- [ ] Kalau nyentuh endpoint: uji manual pakai `curl`, tunjukkan hasilnya
- [ ] Kalau nyentuh UI: sebutkan halaman mana yang harus dilihat user

### Kalau perubahan menyentuh file ini, WAJIB uji di VPS

| File | Cara uji |
|---|---|
| `install.sh` | Install dari nol, pastikan selesai tanpa error |
| `caddy/service.ts` | Tambah domain, cek `curl localhost:2019/config/` memuat domainnya |
| `app.ts` | Cek semua endpoint baru 401 tanpa login |
| `docker/`, `db/` | Container beneran jalan, backup/restore jalan |
| `Bun.serve` | Request panjang nggak kepotong |

**Output:** daftar perintah + hasilnya. Kalau ada yang gagal, laporkan apa
adanya — jangan dibulatkan jadi "sepertinya beres".

---

## FASE 5 — Dokumentasi

**Tujuan:** dokumen ikut berubah bareng kode.

- [ ] Fitur baru → tambahkan di `docs/PRD.md` (tabel fitur)
- [ ] Endpoint/tabel baru → update `docs/ARCHITECTURE.md`
- [ ] Token warna / komponen baru → update `docs/DESIGN.md`
- [ ] Aturan keamanan baru → update `docs/SECURITY.md`
- [ ] Cara uji baru → update `docs/TESTING.md`
- [ ] Variabel / langkah deploy baru → update `docs/DEPLOYMENT.md`
- [ ] Fitur yang kelihatan user → update `README.md`
- [ ] Naikin `HIKARI_VERSION` di `apps/server/src/lib/version.ts` (kalau rilis)

**Jangan** bikin dokumen baru kalau yang lama bisa diperbarui.

---

## FASE 6 — Commit dan rilis

- [ ] `git --no-optional-locks status` — pastikan nggak ada file nyasar
- [ ] Commit terpisah per perubahan logis (jangan satu commit buat semua)
- [ ] Commit message: subjek ≤ 50 karakter, imperatif, tanpa titik di akhir
- [ ] Body ngejelasin **kenapa**, bukan ngulang **apa**
- [ ] `git push origin main`
- [ ] Tag (kalau rilis): `GIT_EDITOR=true git tag -a vX.Y.Z -m "vX.Y.Z"`
- [ ] Push tag, tunggu CI sukses
- [ ] Verifikasi isi tarball rilis

---

## FASE 7 — Laporan

Laporkan singkat:

1. **Apa yang berubah** — file kunci, bukan daftar semua file
2. **Perintah validasi yang dijalankan** + hasilnya
3. **Yang nggak bisa diuji** + alasannya
4. **Temuan sampingan** — bug lain yang kelihatan tapi nggak diperbaiki
5. **Langkah berikutnya** — kalau ada

Jangan lebay. Kalau ada yang gagal, bilang.

---

## Prompt siap pakai

### Perbaiki bug

```
Baca docs/AGENTS.md. Lalu perbaiki: <deskripsi bug>

Ikuti alurnya:
1. Tulis tes yang GAGAL dulu, tunjukkan outputnya (Fase 2)
2. Perbaiki akar masalahnya, bukan gejalanya
3. Pastikan tesnya lolos
4. Jalanin bun test, typecheck, build
5. Update dokumen yang relevan

Kalau bug-nya cuma muncul di VPS, bilang — jangan diam-diam dilewatin.
```

### Fitur baru

```
Baca docs/AGENTS.md, ARCHITECTURE.md, DESIGN.md.

Bikin: <deskripsi fitur>

Ketentuan:
- Taruh file sesuai aturan penempatan di ARCHITECTURE.md
- Route baru WAJIB didaftarkan di requireAuth (lihat SECURITY.md)
- Body divalidasi Zod dengan .catch(() => null)
- UI pakai token warna DESIGN.md, mobile-first
- Tulis tes
- Update dokumen yang relevan

Rencananya tunjukkan dulu sebelum nulis kode.
```

### Revisi UI

```
Baca docs/DESIGN.md.

Revisi: <deskripsi>

Ketentuan:
- Token warna saja, jangan warna literal
- Mobile-first: class sempit dulu, baru md:/lg:
- Target sentuh minimal 44px
- Jangan pakai min-h-screen di dalam panel
- Jangan bikin komponen baru kalau yang ada bisa dipakai
- Pastikan nggak ada yang hilang di layar sempit
```

---

## Yang paling sering salah

Dicatat biar nggak keulang:

1. **Route baru nggak didaftarkan di `requireAuth`** → endpoint kebuka tanpa
   login. Ini udah kejadian 3 kali.
2. **Bilang "selesai" tanpa jalanin tes** → padahal masih merah.
3. **Nambah dependency** padahal bisa dengan yang ada.
4. **Nulis `any`** buat lewatin error TypeScript.
5. **Bikin folder `utils/`** padahal tempatnya udah ada.
6. **`max-w-xl` buat seluruh halaman** → layar lebar kelihatan kosong.
7. **Nambah `min-h-screen`** di dalam panel → scrollbar hantu.
8. **Nyimpen password di respons daftar** → kebocoran.
9. **Hapus sesuatu tanpa pagar** → data user hilang.
10. **Tes cuma memalsukan fungsi** tanpa cek argumennya → bug lolos.
