# PRD.md — Product Requirements Document

## Apa ini

**Hikari** adalah PaaS pribadi buat VPS sendiri. Sambungin repo GitHub, Hikari
yang build, yang jalanin, yang kasih domain plus HTTPS otomatis.

**Bukan** PaaS multi-tenant. **Bukan** klon Coolify. Ini versi kecil yang
dipakai sehari-hari oleh satu orang (pemiliknya) di satu VPS.

### Kenapa dibikin

PaaS yang ada sekarang berat: butuh Postgres sendiri buat state-nya, punya
belasan container buat dirinya sendiri, dan jalanin proses yang nyala terus
buat polling. Di VPS 2 CPU / 4 GB, itu kalah sama aplikasinya sendiri.

Prinsipnya cuma satu: **nggak ada proses yang nyala terus buat hal yang bisa
dicek pas dibutuhkan.**

Contoh penerapannya:

- Backup terjadwal **nggak pakai cron**. Jadwalnya dicek tiap abis deploy sukses.
- Statistik container diambil **pas halamannya dibuka**, nggak ada riwayat.
- Log dibaca on-demand, bukan di-stream terus ke database.
- State-nya satu file SQLite, bukan server database terpisah.

## Siapa yang pakai

Satu orang: pemilik VPS, yang juga developer. Dia:

- Punya beberapa project (kelas produksi vs eksperimen)
- Deploy dari repo GitHub atau image Docker
- Mau domain + HTTPS tanpa ngurus sertifikat manual
- Pengin data (database, backup) ada di VPS-nya sendiri
- Nggak mau kelola user, peran, atau organisasi

## User story

### Deploy

**US-1** — Sebagai pemilik, saya mau nyambungin repo GitHub terus Deploy, biar
kode saya jalan di VPS tanpa masuk SSH.

**US-2** — Sebagai pemilik, saya mau auto-deploy tiap push ke GitHub, biar
nggak perlu klik apa-apa.

**US-3** — Sebagai pemilik, saya mau push ke remote Hikari (git push deploy),
biar bisa deploy tanpa setup webhook GitHub.

**US-4** — Sebagai pemilik, saya mau repo tanpa Dockerfile tetap bisa di-build,
biar nggak perlu nulis Dockerfile buat proyek kecil.

**US-5** — Sebagai pemilik, saya mau lihat log build dan status deployment, biar
tau kenapa deploy-nya gagal.

**US-6** — Sebagai pemilik, saya mau batas RAM/CPU per app **wajib** diisi,
biar satu app bocor nggak matiin seluruh VPS.

### Domain dan HTTPS

**US-7** — Sebagai pemilik, saya mau kasih domain ke app dan HTTPS-nya otomatis,
biar nggak ngurus sertifikat.

**US-8** — Sebagai pemilik, saya mau lihat status TLS tiap domain (aktif /
pending / gagal), biar tau kalau ada yang salah.

**US-9** — Sebagai pemilik, saya mau record DNS-nya dibikin otomatis di
Cloudflare, biar nggak klik-klik dashboard.

### Database

**US-10** — Sebagai pemilik, saya mau bikin PostgreSQL / MySQL / Redis dari
panel, dengan password dibikin otomatis.

**US-11** — Sebagai pemilik, saya mau atur akses database: internal, tunnel SSH,
public lewat IP, atau public lewat domain (TLS).

**US-12** — Sebagai pemilik, saya mau lihat connection string dan perintah
tunnel-nya, biar tinggal copy.

**US-13** — Sebagai pemilik, saya mau backup manual + terjadwal, bisa
di-download, dan bisa di-restore.

**US-14** — Sebagai pemilik, saya mau data tetap ada walau database-nya dihapus
(volume nggak ikut kehapus).

### Object storage

**US-15** — Sebagai pemilik, saya mau bikin bucket MinIO dari panel, biar ada
S3-compatible di VPS sendiri.

### Operasional

**US-16** — Sebagai pemilik, saya mau lihat log container, biar bisa debug
tanpa SSH.

**US-17** — Sebagai pemilik, saya mau terminal web ke container, biar bisa
ngoprek pas kebetulan nggak punya akses SSH.

**US-18** — Sebagai pemilik, saya mau lihat statistik CPU/RAM, biar tau app-nya
sehat.

**US-19** — Sebagai pemilik, saya mau lihat pemakaian disk, biar keburu
bersihin sebelum penuh.

**US-20** — Sebagai pemilik, saya mau ganti password admin dari panel.

### Keamanan

**US-21** — Sebagai pemilik, saya mau setup awal cuma bisa dilakuin sekali, biar
nggak ada yang bikin akun admin kedua.

**US-22** — Sebagai pemilik, saya mau login dibatasi percobaannya, biar
brute-force nggak gampang.

**US-23** — Sebagai pemilik, saya mau port app nggak kebuka ke publik (cuma
lewat Caddy), biar nggak ada yang akses langsung.

## Fitur: apa adanya

Semua ini **udah jalan** dan diverifikasi di VPS sungguhan.

| Fitur | Status | Catatan |
|---|---|---|
| Deploy dari GitHub / Git URL / image Docker | ✅ | |
| Auto deploy tiap push (webhook) | ✅ | URL + secret-nya ada di halaman app |
| Git push deploy | ✅ | butuh setup manual user `git` + `authorized_keys` |
| Build Dockerfile atau Railpack | ✅ | Railpack kalau nggak ada Dockerfile |
| Domain + HTTPS otomatis (Caddy) | ✅ | |
| Cek status TLS manual | ✅ | tombol per domain, nggak nunggu sinkronisasi otomatis |
| Cloudflare auto-DNS | ✅ | |
| Log container | ✅ | |
| Statistik CPU/RAM | ✅ | diambil saat dibuka, nggak ada riwayat |
| Batas RAM/CPU per app | ✅ | wajib diisi |
| Database: PostgreSQL, MySQL, Redis | ✅ | password 32 karakter otomatis |
| Object storage MinIO | ✅ | S3-compatible; bisa dinyalain/dimatiin |
| Bucket publik/privat | ✅ | bisa diubah kapan aja |
| Backup manual + terjadwal | ✅ | |
| Restore dari file | ✅ | `.sql` aja; Redis belum |
| Hapus file backup | ✅ | |
| Terminal web ke container | ✅ | WebSocket |
| GitHub App | ✅ | clone repo privat + commit status |
| Deploy key per app | ✅ | public key-nya bisa disalin dari panel |
| Disk usage + peringatan 80% | ✅ | |
| Ganti password dari panel | ✅ | |

### Yang belum ada

Dicatat di sini biar nggak dianggap "lupa".

| Yang belum | Kenapa belum |
|---|---|
| Restore backup Redis | Cuma backup + download. Buat restore: matiin DB, taruh `.rdb` ke volume, nyalain lagi |
| Kelola user (daftar/hapus) | Panel satu-orang; keputusan sadar |
| Kelola sesi / API token | Belum bisa logout paksa dari perangkat lain |
| Log historis | Log dibaca on-demand, nggak disimpan |
| Riwayat statistik | Cuma snapshot saat halaman dibuka |
| Multi-server | Satu VPS satu panel |
| HTTPS panel dengan domain | `panelDomain` + `HIKARI_ACME_EMAIL` ada di kode, belum pernah diuji dengan domain asli |

## Kriteria sukses

Panel ini berhasil kalau:

1. **Install dari nol selesai tanpa error** — `curl | sudo bash`, terus bisa
   dipakai.
2. **Deploy app pertama berhasil** tanpa masuk SSH.
3. **Domain + HTTPS jalan** tanpa sentuh sertifikat manual.
4. **VPS nggak mati kehabisan RAM** karena satu app bocor.
5. **Data bisa di-restore** dari backup kalau ada apa-apa.
6. **Bug ketemu di runtime**, bukan di produksi — makanya semua perubahan
   besar diuji di VPS dulu.

## Batasan yang disengaja

| Batasan | Alasan |
|---|---|
| Cuma Ubuntu/Debian | `install.sh` pakai apt; distro lain berhenti sopan |
| Satu user admin | Panel pribadi |
| SQLite, bukan Postgres | Nggak ada server database buat state-nya sendiri |
| Nggak ada tombol update di panel | Nambah attack surface, nggak perlu — update = jalanin `install.sh` lagi |
| Batch build satu-satu | Antrean; VPS 2 CPU nggak kuat build paralel |
| Build RAM dibatasi 768 MB | Biar build nggak matiin VPS |
