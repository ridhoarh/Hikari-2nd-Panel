import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Tes ini mastiin endpoint nggak "yatim": ada di server, tapi nggak ada
 * jalan masuknya dari panel.
 *
 * Kenapa perlu: ini kejadian beneran. Tujuh endpoint — termasuk info webhook
 * dan deploy key — udah lengkap di server tapi halamannya kelupaan dibikin.
 * Akibatnya fitur inti (auto-deploy dari GitHub, clone repo privat) nggak
 * bisa dipakai sama sekali, dan nggak ada satu tes pun yang gagal.
 *
 * Cara kerjanya: kumpulin path dari pemanggilan `api.*()` di frontend, terus
 * bandingkan sama daftar endpoint server.
 *
 * Dua pendekatan yang GAGAL, dicatat biar nggak dicoba lagi:
 *
 * 1. Nyari potongan kata terakhir (`token`) di seluruh teks — kata itu
 *    muncul di komentar dan variabel lain, jadi selalu "ketemu".
 * 2. Nyari segmen berurutan di seluruh teks — `/github` di satu file dan
 *    `/token` di file lain dihitung cocok, padahal beda endpoint. Sementara
 *    `/apps/:id/deploy` yang beneran dipakai malah nggak ketemu, karena
 *    `/apps` pertama yang ditemukan ada di komponen lain.
 *
 * Yang bener: cuma lihat path yang beneran dikirim ke `api.*()`, dan biarkan
 * template literal jadi wildcard. Tesnya juga harus dibuktikan BISA gagal —
 * lihat test "penjaga" di bawah.
 */

// `import.meta.dir` bisa beda-beda tergantung cara tes dijalankan, jadi akar
// repo dicari dengan naik sampai ketemu folder `apps/` dan `docs/`.
function cariAkar(start: string): string {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'apps')) && existsSync(join(dir, 'docs'))) return dir
    dir = dirname(dir)
  }
  throw new Error(`Nggak nemu akar repo dari ${start}`)
}

const AKAR = cariAkar(import.meta.dir)

/**
 * Endpoint yang SENGAJA nggak punya UI, plus alasannya.
 *
 * Tiap entri di sini harus punya alasan yang jelas — daftar ini bukan tempat
 * buat "ah, nanti aja". Kalau endpoint-nya ada tapi belum dibikin halamannya,
 * masukin ke sini TIDAK boleh; yang bener ya dibikin halamannya.
 */
const DIKECUALIKAN: Record<string, string> = {
  // Dipanggil dari dalam server, bukan lewat HTTP oleh frontend.
  '/github/token': 'internal, dipanggil pipeline deploy',
  '/github/status': 'dikirim server ke GitHub, bukan dari panel',

  // Dipanggil pihak luar, bukan panel.
  '/webhooks/github/:appId': 'dipanggil GitHub, dijaga HMAC',
  '/git-push/:appId': 'dipanggil hook git dari shell',

  // Bagian dari alur login/setup, bukan tombol biasa.
  '/setup': 'form di halaman /setup',
  '/setup/status': 'dipanggil penjaga halaman (use-setup-gate)',
  '/auth/login': 'form di halaman /login',
  '/auth/logout': 'tombol Keluar di sidebar',
  '/auth/me': 'dipakai hook use-auth',
  '/auth/password': 'form di halaman /account',

  // Bukan dipanggil lewat fetch: link unduh langsung, atau perintah curl di
  // panduan setup.
  '/backups/:id/download': 'link unduh di kartu backup',
  '/git/authorized-keys': 'diambil lewat curl pas setup SSH',
}

function fileSumber(dir: string): string[] {
  const hasil: string[] = []
  for (const nama of readdirSync(dir)) {
    const path = join(dir, nama)
    if (statSync(path).isDirectory()) hasil.push(...fileSumber(path))
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(path)
  }
  return hasil
}

/**
 * Kumpulin semua path yang beneran dikirim ke `api.<method>(...)`.
 *
 * Selain string literal, ada dua pola lain yang dipakai di proyek ini:
 *
 * - `api.post(`/apps/${appId}${path}`)` — bagian akhirnya dari variabel,
 *   isinya `'/deploy'`, `'/restart'`, `'/stop'`. Segmen variabelnya jadi
 *   wildcard, dan pemanggilnya nyumbang daftar aksi.
 * - `useList('/applications', 'applications')` — path dikirim ke hook, terus
 *   hook-nya yang manggil `api.get`. Jadi argumen pertama `useList` ikut
 *   dihitung.
 */
function pathDipakai(): Set<string> {
  const hasil = new Set<string>()

  for (const file of fileSumber(join(AKAR, 'apps/web/src'))) {
    // File tes dikecualikan: kalau ikut dibaca, tes ini nemu daftar
    // pengecualiannya sendiri dan nggak akan pernah bisa gagal.
    if (file.includes('.test.')) continue

    const isi = readFileSync(file, 'utf8')

    // 1. Path langsung di pemanggilan api.*()
    const re = /\bapi\.(?:get|post|patch|del|postText)\s*(?:<[^>]*>)?\s*\(\s*[`'"]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(isi)) !== null) {
      const mulai = m.index + m[0].length
      const pembuka = m[0].slice(-1)
      const akhir = isi.indexOf(pembuka, mulai)
      if (akhir === -1) continue
      const raw = isi.slice(mulai, akhir)
      // Template literal `${...}` jadi wildcard; query string dibuang.
      const bersih = raw.replace(/\$\{[^}]*\}/g, ':param').replace(/\?.*$/, '')
      if (bersih.startsWith('/')) hasil.add(bersih)
    }

    // 2. Aksi yang path-nya dari variabel: cari daftar `act('<aksi>', '/x')`
    //    dan gabungin sama path dasarnya.
    const basisAksi = /api\.(?:get|post)\s*\(\s*`([^`]*)\$\{path\}`/g
    let ba: RegExpExecArray | null
    while ((ba = basisAksi.exec(isi)) !== null) {
      const basis = ba[1].replace(/\$\{[^}]*\}/g, ':param')
      const re2 = /[a-zA-Z]*\([^,)]*,\s*'([^']+)'/g
      let aksi: RegExpExecArray | null
      while ((aksi = re2.exec(isi)) !== null) {
        hasil.add(`${basis}${aksi[1]}`)
      }
    }

    // 3. Path lewat hook useList('/applications', 'applications')
    const reList = /useList(?:<[^>]*>)?\s*\(\s*'([^']+)'/g
    let ul: RegExpExecArray | null
    while ((ul = reList.exec(isi)) !== null) hasil.add(ul[1])
  }

  return hasil
}

function endpointServer(): string[] {
  const hasil = new Set<string>()

  const cari = (dir: string) => {
    for (const nama of readdirSync(dir)) {
      const path = join(dir, nama)
      if (statSync(path).isDirectory()) {
        cari(path)
        continue
      }
      if (!nama.endsWith('.ts') || nama.endsWith('.test.ts')) continue
      const isi = readFileSync(path, 'utf8')
      const re = /router\.(?:get|post|patch|delete)\(\s*'([^']+)'/g
      let m: RegExpExecArray | null
      while ((m = re.exec(isi)) !== null) hasil.add(m[1])
    }
  }
  cari(join(AKAR, 'apps/server/src'))

  return [...hasil].sort()
}

/**
 * Samain bentuk: `/apps/:id/env/:key` (server) vs `/apps/:param/env/:param`
 * (frontend). Yang dibandingkan cuma jumlah dan nama segmen statisnya.
 */
function bentuk(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? '*' : s))
    .join('/')
}

describe('endpoint punya jalan masuk dari panel', () => {
  const dipakai = pathDipakai()
  const endpoint = endpointServer()

  test('nemu endpoint di server', () => {
    // Penjaga: kalau regex-nya rusak, tes di bawah bakal lolos semua.
    expect(endpoint.length).toBeGreaterThan(50)
  })

  test('nemu path yang dipakai frontend', () => {
    // Penjaga yang sama buat sisi frontend.
    expect(dipakai.size).toBeGreaterThan(20)
  })

  test('nggak ada endpoint yatim tanpa alasan', () => {
    // Cocokkan per-bentuk: jumlah segmen harus sama, dan tiap segmen statis
    // harus sama. `/apps/:id/env` cocok sama `/apps/:param/env`.
    const daftarDipakai = [...dipakai].map(bentuk)

    const yatim = endpoint.filter((ep) => {
      if (DIKECUALIKAN[ep]) return false
      const b = bentuk(ep)
      const bagianEp = b.split('/').length

      return !daftarDipakai.some((d) => {
        const bagianD = d.split('/').length
        if (bagianD !== bagianEp) return false
        // Cocok kalau tiap segmen sama, atau salah satunya wildcard.
        const se = b.split('/')
        const sd = d.split('/')
        return se.every((s, i) => s === sd[i] || s === '*' || sd[i] === '*')
      })
    })

    expect(yatim).toEqual([])
  })

  test('pengecualian cuma buat endpoint yang memang ada', () => {
    const daftar = new Set(endpoint)
    const hantu = Object.keys(DIKECUALIKAN).filter((ep) => !daftar.has(ep))
    // Kalau endpoint-nya udah dihapus tapi pengecualiannya ketinggalan,
    // itu sampah yang bikin bingung.
    expect(hantu).toEqual([])
  })
})
