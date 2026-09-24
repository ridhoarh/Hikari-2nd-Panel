import { monotonicFactory } from 'ulid'

/**
 * `ulid()` biasa nggak monotonik dalam milidetik yang sama — cek empiris:
 * dua ULID berurutan bisa keluar dengan urutan terbalik karena bagian
 * acaknya beda. Karena ULID dipakai sebagai primary key dan sebagian
 * pengurutan bergantung ke dia, kita pakai factory monotonik: yang
 * dibikin belakangan selalu lebih besar.
 */
const ulid = monotonicFactory()

export function newId(): string {
  return ulid()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')

  return slug.length > 0 ? slug : 'app'
}
