import { describe, expect, test } from 'bun:test'
import {
  buildDnsPayload,
  findZoneForHostname,
  rootDomainOf,
  subdomainOf,
} from './dns'

describe('rootDomainOf', () => {
  test('ambil dua label terakhir', () => {
    expect(rootDomainOf('blog.contoh.com')).toBe('contoh.com')
  })

  test('subdomain bertingkat tetep ambil dua terakhir', () => {
    expect(rootDomainOf('a.b.c.contoh.com')).toBe('contoh.com')
  })

  test('domain dua label balikin dirinya sendiri', () => {
    expect(rootDomainOf('contoh.com')).toBe('contoh.com')
  })
})

describe('subdomainOf', () => {
  test('buang root domain-nya', () => {
    expect(subdomainOf('blog.contoh.com')).toBe('blog')
  })

  test('subdomain bertingkat dijaga', () => {
    expect(subdomainOf('a.b.contoh.com')).toBe('a.b')
  })

  test('domain apex balikin @', () => {
    expect(subdomainOf('contoh.com')).toBe('@')
  })
})

describe('findZoneForHostname', () => {
  const zones = [
    { id: 'z1', name: 'contoh.com' },
    { id: 'z2', name: 'lain.id' },
  ]

  test('nemu zone yang cocok', () => {
    expect(findZoneForHostname(zones, 'blog.contoh.com')?.id).toBe('z1')
  })

  test('nemu zone buat domain apex', () => {
    expect(findZoneForHostname(zones, 'contoh.com')?.id).toBe('z1')
  })

  test('null kalau nggak ada zone-nya', () => {
    expect(findZoneForHostname(zones, 'blog.nggak-ada.com')).toBeNull()
  })

  test('nggak ketuker sama domain yang mirip', () => {
    // 'xcontoh.com' nggak boleh dianggap masuk zone 'contoh.com'.
    expect(findZoneForHostname(zones, 'xcontoh.com')).toBeNull()
  })

  test('cocok sama subdomain dari zone', () => {
    expect(findZoneForHostname(zones, 'a.b.lain.id')?.id).toBe('z2')
  })
})

describe('buildDnsPayload', () => {
  test('bikin record A ke IP yang dituju', () => {
    expect(buildDnsPayload({ hostname: 'blog.contoh.com', ip: '203.0.113.5' })).toEqual({
      type: 'A',
      name: 'blog',
      content: '203.0.113.5',
      ttl: 1,
      proxied: false,
      comment: 'Dibikin otomatis sama Hikari',
    })
  })

  test('domain apex pakai nama @', () => {
    const p = buildDnsPayload({ hostname: 'contoh.com', ip: '1.2.3.4' })
    expect(p.name).toBe('@')
  })

  test('proxied false secara default', () => {
    // Proxy Cloudflare cuma nge-handle HTTP, bukan TCP database. Kalau
    // di-proxy, koneksi database-nya rusak.
    const p = buildDnsPayload({ hostname: 'db.contoh.com', ip: '1.2.3.4' })
    expect(p.proxied).toBe(false)
  })
})
