/**
 * Versi yang ditampilin panel, dibaca dari `/api/health` dan halaman Settings.
 *
 * Ini TERPISAH dari tag git rilis: CI yang bikin tarball dari tag `v*`, tapi
 * angka ini yang jalan di kode. Kalau lupa dinaikin, panel bakal lapor versi
 * lama — pernah kejadian: tag udah `v0.1.1` tapi panelnya masih bilang
 * `0.1.0`.
 *
 * Jadi tiap mau tag rilis, naikin dua-duanya: file ini DAN tag git-nya.
 * Test di `version.test.ts` mastiin formatnya bener, tapi nggak bisa mastiin
 * angkanya sama dengan tag — itu bagian mengingat, bukan bagian tes.
 */
export const HIKARI_VERSION = '0.1.5'
