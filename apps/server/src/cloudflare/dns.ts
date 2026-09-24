export type CfZone = { id: string; name: string }

export type DnsRecordPayload = {
  type: 'A'
  name: string
  content: string
  ttl: number
  proxied: boolean
  comment: string
}

/** Ambil dua label terakhir: `a.b.c.contoh.com` -> `contoh.com`. */
export function rootDomainOf(hostname: string): string {
  const bagian = hostname.split('.').filter(Boolean)
  if (bagian.length <= 2) return bagian.join('.')
  return bagian.slice(-2).join('.')
}

/** Bagian sebelum root domain. Domain apex jadi `@` (format Cloudflare). */
export function subdomainOf(hostname: string): string {
  const root = rootDomainOf(hostname)
  if (hostname === root) return '@'
  return hostname.slice(0, hostname.length - root.length - 1)
}

/**
 * Cari zone yang paling cocok. Dicek pakai suffix lengkap (`endsWith('.' +
 * nama)`) biar `xcontoh.com` nggak dianggap masuk zone `contoh.com`.
 */
export function findZoneForHostname(
  zones: CfZone[],
  hostname: string
): CfZone | null {
  const host = hostname.toLowerCase()
  let terpilih: CfZone | null = null

  for (const zone of zones) {
    const nama = zone.name.toLowerCase()
    const cocok = host === nama || host.endsWith(`.${nama}`)
    if (!cocok) continue
    // Pilih yang namanya paling panjang, biar `sub.contoh.com` menang
    // dibanding `contoh.com` kalau dua-duanya ada.
    if (!terpilih || nama.length > terpilih.name.length) terpilih = zone
  }

  return terpilih
}

/**
 * `proxied: false` itu SENGAJA walaupun buat app HTTP.
 *
 * Alasannya: proxy Cloudflare cuma free buat HTTP/HTTPS di port tertentu.
 * Database (TCP mentah) nggak bisa lewat proxy sama sekali, dan kalau
 * record app di-proxy, Caddy jadi rebutan sama Cloudflare. Jadi semua
 * record dibikin DNS-only — TLS-nya tetap dari Caddy.
 */
export function buildDnsPayload(opts: {
  hostname: string
  ip: string
  proxied?: boolean
}): DnsRecordPayload {
  return {
    type: 'A',
    name: subdomainOf(opts.hostname),
    content: opts.ip,
    // 1 = automatic (Cloudflare yang nentuin).
    ttl: 1,
    proxied: opts.proxied ?? false,
    comment: 'Dibikin otomatis sama Hikari',
  }
}

export type CfDnsRecord = {
  id: string
  name: string
  type: string
  content: string
}

/**
 * Bikin atau update record A. Kalau record-nya udah ada, di-update — biar
 * nggak numpuk record dobel tiap kali domain disimpen ulang.
 */
export async function upsertDnsRecord(opts: {
  token: string
  zoneId: string
  payload: DnsRecordPayload
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  const base = `https://api.cloudflare.com/client/v4/zones/${opts.zoneId}/dns_records`
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  }

  try {
    // Cloudflare nggak punya filter exact-match yang gampang, jadi kita
    // listing terus cocokin sendiri.
    const list = await doFetch(`${base}?type=A`, { headers })
    if (!list.ok) {
      return { ok: false, error: `Cloudflare nolak: ${list.status}` }
    }

    const data = (await list.json()) as { result?: CfDnsRecord[] }
    const records = data.result ?? []

    // Nama lengkap yang kita incer.
    const target = opts.payload.name === '@' ? '' : opts.payload.name

    const existing = records.find((r) => {
      const label = r.name.includes('.')
        ? r.name.slice(0, r.name.length - rootDomainOf(r.name).length - 1)
        : ''
      return r.type === 'A' && label === target
    })

    const res = existing
      ? await doFetch(`${base}/${existing.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(opts.payload),
        })
      : await doFetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify(opts.payload),
        })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Cloudflare nolak: ${res.status} ${text.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Nggak bisa nyambung ke Cloudflare: ${message}` }
  }
}

export async function listZones(opts: {
  token: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; zones: CfZone[]; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(
      'https://api.cloudflare.com/client/v4/zones?per_page=50',
      { headers: { Authorization: `Bearer ${opts.token}` } }
    )
    if (!res.ok) return { ok: false, zones: [], error: `Cloudflare: ${res.status}` }

    const data = (await res.json()) as { result?: CfZone[] }
    return { ok: true, zones: data.result ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, zones: [], error: message }
  }
}
