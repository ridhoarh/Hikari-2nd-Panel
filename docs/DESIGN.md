# DESIGN.md — Token Warna, Tipografi, dan Aturan Tampilan

Halaman ini sumber kebenaran buat tampilan. Kalau bikin komponen baru, pakai
token di sini — **jangan** tulis warna literal (`bg-blue-500`, `#0ea5e9`).

## Tema

**Biru gelap, dark-only.** Nggak ada tema terang dan nggak ada tombol ganti
tema. Alasannya: panel ini sering dibuka malam buat cek app, dan ngurus dua
tema nggak sepadan buat panel satu-orang.

Prinsipnya:

1. **Datar, bukan bertumpuk.** Nggak ada gradient, nggak ada shadow tebal.
   Pemisah antar kartu pakai garis 1px, bukan bayangan.
2. **Satu warna aksen.** Biru dipakai buat hal yang bisa diklik atau yang lagi
   aktif. Status (hijau/kuning/merah) **jangan** dicampur sama biru.
3. **Tenang.** Nggak ada animasi kedip, nggak ada badge berkedip. Yang penting:
   bisa dibaca lama tanpa capek.
4. **Mobile-first.** Default-nya tata letak sempit; melebar cuma kalau layarnya
   memang lebar. Nav-nya buka-tutup di HP.

## Token warna

Semua didefinisikan di `src/styles.css` sebagai CSS variable dalam format
`R G B` (spasi, tanpa koma — Tailwind butuh itu buat opacity modifier).

```css
:root {
  /* Latar — dari paling dalam ke paling terang */
  --bg: 11 15 26;              /* #0b0f1a — latar halaman */
  --surface: 17 24 39;         /* #111827 — kartu */
  --surface-muted: 22 30 48;   /* #161e30 — sidebar, area tenggelam */
  --border: 34 45 68;          /* #222d44 — garis pemisah */

  /* Teks */
  --text: 226 232 240;         /* #e2e8f0 — teks utama */
  --text-muted: 148 163 184;   /* #94a3b8 — label, keterangan */
  --text-subtle: 100 116 139;  /* #64748b — paling redup, masih kebaca */

  /* Aksen — biru */
  --brand: 56 149 250;         /* #3895fa — tombol utama, tab aktif */
  --brand-hover: 96 175 255;   /* #60afff */
  --brand-soft: 30 58 95;      /* #1e3a5f — latar item aktif di sidebar */
  --brand-text: 125 190 255;   /* #7dbeff — teks/tautan di atas gelap */

  /* Status — JANGAN dipakai buat aksen */
  --ok: 52 211 153;            /* running */
  --warn: 251 191 36;          /* pending, disk hampir penuh */
  --danger: 248 113 113;       /* gagal, error */
  --idle: 100 116 139;         /* mati */
}
```

### Cara pakai di Tailwind

Token ini diekspos di `tailwind.config.ts`:

| Utility | Hasil |
|---|---|
| `bg-bg` | Latar halaman |
| `bg-surface` | Kartu |
| `bg-muted` | Sidebar, area tenggelam |
| `border-line` | Garis 1px |
| `text-ink` / `text-ink-muted` / `text-ink-subtle` | Tiga tingkat teks |
| `bg-brand` / `hover:bg-brand-hover` | Tombol utama |
| `bg-brand-soft` / `text-brand-text` | Item aktif di sidebar |
| `text-ok` / `text-warn` / `text-danger` / `text-idle` | Status |

Opacity boleh: `bg-danger/10` buat latar pesan error.

### Aturan warna

- **Jangan pakai warna Tailwind bawaan** (`bg-slate-800`, `text-blue-400`).
  Selalu token. Kalau butuh nuansa baru, tambahkan token baru di `styles.css`
  — biar bisa diubah dari satu tempat.
- **Biru cuma buat yang bisa diklik / aktif.** Kalau semua biru, nggak ada
  yang menonjol.
- **Merah cuma buat yang benar-benar rusak.** Bukan buat "stop" (stop itu
  normal, pakai `ghost`).
- **Teks di atas latar berwarna** pakai `text-white` cuma kalau latarnya
  `bg-brand` atau `bg-danger`. Sisanya token teks.

## Tipografi

Font sistem, nggak ada font kustom (nggak perlu nunggu download):

```
ui-sans-serif, system-ui, -apple-system, sans-serif
ui-monospace, SFMono-Regular, Menlo, monospace   /* font-mono */
```

Ukuran yang dipakai:

| Peran | Class | Catatan |
|---|---|---|
| Judul halaman | `text-lg font-semibold` | Di header |
| Judul kartu | `text-sm font-medium` | Konsisten di semua kartu |
| Isi | `text-sm` | Default |
| Label | `text-sm text-ink-muted` | Pasangan nilai di `Field` |
| Keterangan | `text-xs text-ink-subtle` | Paling sering buat penjelasan |
| Label grup sidebar | `text-[11px] uppercase tracking-wider text-ink-subtle` | Huruf kecil, huruf kapital |
| Angka/ID | `text-xs font-mono` | Slug, port, IP, ID |

**Label status di layar kecil boleh tetap `text-xs`** — jangan dikecilkan lagi.

## Jarak dan bentuk

- Sudut: `rounded-card` (12px). Itu aja, nggak ada variasi.
- Padding kartu: `px-4 py-3` (dari `CardBody`).
- Jarak antar kartu: `gap-4`.
- Jarak antar bagian di halaman: `space-y-4` atau `space-y-6` buat pemisahan
  yang lebih tegas.
- Lebar maksimum teks panjang: `max-w-2xl` atau `max-w-3xl`. Tapi **jangan**
  paksa `max-w-xl` buat seluruh halaman — itu yang bikin layar lebar kelihatan
  kosong.

## Tata letak

### Kerangka panel

```
h-screen overflow-hidden          ← root
├── Sidebar (w-60, scroll sendiri)
└── flex-col
    ├── header (shrink-0)
    └── main (flex-1, overflow-y-auto)   ← cuma ini yang scroll
```

**Jangan** pakai `min-h-screen` di dalam panel. Tinggi harus dikunci ke layar,
kalau nggak scrollbar halaman muncul walau nggak ada yang perlu di-scroll.
Bug ini pernah kejadian dan bikin layar lebar kelihatan kayak ada ruang kosong
yang bisa digeser.

### Grid

Pakai grid yang ngisi lebar layar, bukan satu kolom sempit:

```tsx
<CardGrid>            {/* 1 kolom → 2 → 3 sesuai lebar */}
```

Buat tata letak campuran, pakai grid eksplisit:

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
  <div>...</div>                      {/* 1 kolom di HP */}
  <div className="lg:col-span-2">...</div>
</div>
```

## Mobile-first

Ini yang paling sering salah. Aturannya:

1. **Tulis class buat layar sempit dulu**, baru tambah `md:` / `lg:` buat
   melebar. Jangan kebalik.
2. **Target sentuh minimum 44px.** Tombol di HP: `py-2.5` ke atas.
3. **Nav di HP pakai drawer**, bukan sidebar yang mengecil jadi ikon (ikon
   nggak ada di proyek ini). Tombol buka-tutup di header.
4. **Tabel panjang → kartu.** Di layar sempit, tabel yang harus digeser
   horizontal itu menyiksa. Pecah jadi kartu.
5. **Teks panjang jangan dipaksa `truncate`** kalau informasinya penting;
   `break-words` lebih baik daripada hilang.
6. **Jangan sembunyikan fungsi di HP.** Kalau di desktop ada tombol, di HP
   juga harus ada — mungkin di tempat lain, tapi ada.

## Aksesibilitas

Bukan opsional, dan ini juga bikin tampilan lebih rapi.

- **Kontras minimal 4.5:1** buat teks normal. Token di atas udah dipilih buat
  lolos di latar gelap; kalau bikin kombinasi baru, cek dulu.
- **Fokus keyboard harus kelihatan** — `:focus-visible` udah diatur di
  `styles.css` (outline biru 2px). Jangan dihilangkan.
- **Tombol ikon wajib punya `aria-label`.** Di proyek ini hampir semua tombol
  ada teksnya, jadi jarang kena.
- **Status jangan cuma warna.** `StatusDot` disertai teks status. Jangan andelin
  warna doang buat nyampein arti.
- **`role="alert"`** buat pesan error yang muncul setelah aksi.
- **Elemen semantik**: `<nav aria-label="...">`, `<main>`, `<header>`,
  `<section>`.

## Komponen yang ada

Jangan bikin ulang — pakai yang ini:

| Komponen | File | Buat apa |
|---|---|---|
| `Button` | `ui/button.tsx` | `variant`: primary, ghost, danger |
| `Card`, `CardHeader`, `CardBody` | `ui/card.tsx` | Wadah standar |
| `CardGrid`, `EmptyState`, `Field`, `Tag` | `ui/list.tsx` | Tata letak daftar |
| `StatusDot` | `ui/status-dot.tsx` | Titik status app |
| `AppShell` | `layout/app-shell.tsx` | Kerangka halaman |
| `Sidebar` | `layout/sidebar.tsx` | Navigasi bergrup |

Kalau butuh variasi tombol baru, tambahkan `variant` di `button.tsx` — jangan
bikin komponen tombol kedua.

## Yang dilarang

- Gradient sebagai latar utama
- Shadow tebal / `shadow-2xl`
- Lebih dari satu warna aksen di satu layar
- Animasi selain `transition-hikari` (400ms, `cubic-bezier(0.32, 0.72, 0, 1)`)
- Emoji sebagai ikon
- Warna literal di komponen — selalu token
- `min-h-screen` di dalam kerangka panel
- Tata letak yang cuma bagus di desktop
