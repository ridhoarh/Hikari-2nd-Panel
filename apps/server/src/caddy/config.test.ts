import { describe, expect, test } from 'bun:test'
import { renderCaddyfile, validateHostname } from './config'

describe('validateHostname', () => {
  test('terima domain biasa', () => {
    expect(validateHostname('blog.contoh.com').ok).toBe(true)
  })

  test('terima subdomain', () => {
    expect(validateHostname('a.b.c.contoh.com').ok).toBe(true)
  })

  test('tolak yang ada port-nya', () => {
    expect(validateHostname('blog.com:3000').ok).toBe(false)
  })

  test('tolak yang pakai protokol', () => {
    expect(validateHostname('https://blog.com').ok).toBe(false)
  })

  test('protokol dikasih alasan http, bukan alasan port', () => {
    expect(validateHostname('https://blog.com').reason).toContain('http')
  })

  test('tolak yang ada spasinya', () => {
    expect(validateHostname('blog .com').ok).toBe(false)
  })

  test('tolak IP polos', () => {
    expect(validateHostname('1.2.3.4').ok).toBe(false)
  })

  test('tolak yang kosong', () => {
    expect(validateHostname('').ok).toBe(false)
  })

  test('tolak wildcard', () => {
    expect(validateHostname('*.contoh.com').ok).toBe(false)
  })

  test('tolak domain tanpa titik', () => {
    expect(validateHostname('blog').ok).toBe(false)
  })

  test('tolak label yang diawali tanda hubung', () => {
    expect(validateHostname('-blog.contoh.com').ok).toBe(false)
  })
})

describe('renderCaddyfile', () => {
  test('satu domain jadi satu blok', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [{ hostname: 'blog.contoh.com', upstreamPort: 3000, tls: true }],
    })
    expect(out).toContain('blog.contoh.com {')
    expect(out).toContain('reverse_proxy 127.0.0.1:3000')
  })

  test('pakai reverse_proxy ke 127.0.0.1, bukan 0.0.0.0', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [{ hostname: 'a.com', upstreamPort: 80, tls: true }],
    })
    expect(out).toContain('reverse_proxy 127.0.0.1:80')
  })

  test('domain panel ikut ditulis', () => {
    const out = renderCaddyfile({
      panelDomain: 'panel.contoh.com',
      panelPort: 2508,
      entries: [],
    })
    expect(out).toContain('panel.contoh.com {')
    expect(out).toContain('reverse_proxy 127.0.0.1:2508')
  })

  test('daftar kosong tetep ngasih file yang valid', () => {
    const out = renderCaddyfile({ panelPort: 2508, entries: [] })
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain('{')
  })

  test('beberapa domain ditulis semua', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [
        { hostname: 'a.com', upstreamPort: 3000, tls: true },
        { hostname: 'b.com', upstreamPort: 3001, tls: true },
      ],
    })
    expect(out).toContain('a.com {')
    expect(out).toContain('b.com {')
  })

  test('pasang blok global buat email dan admin', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [],
      acmeEmail: 'aku@contoh.com',
    })
    expect(out).toContain('email aku@contoh.com')
    expect(out).toContain('admin 127.0.0.1:2019')
  })

  test('kalau dns challenge dipakai, tulis blok tls', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [
        { hostname: 'db.contoh.com', upstreamPort: 5433, tls: true, dnsChallenge: true },
      ],
      dnsProvider: 'cloudflare',
    })
    expect(out).toContain('cloudflare')
  })

  test('selalu nutup setiap blok', () => {
    const out = renderCaddyfile({
      panelDomain: 'panel.contoh.com',
      panelPort: 2508,
      entries: [{ hostname: 'a.com', upstreamPort: 3000, tls: true }],
    })
    const buka = (out.match(/\{/g) ?? []).length
    const tutup = (out.match(/\}/g) ?? []).length
    expect(buka).toBe(tutup)
  })
})
