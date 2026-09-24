export type CaddyEntry = {
  hostname: string
  upstreamPort: number
  tls: boolean
  dnsChallenge?: boolean
}

/**
 * Database yang dibuka lewat domain. Bedanya sama CaddyEntry: yang ini TCP
 * mentah, bukan HTTP, jadi nggak ada `reverse_proxy` — pakai `layer4`.
 */
export type CaddyTcpEntry = {
  hostname: string
  listenPort: number
  upstreamPort: number
}

export type CaddyInput = {
  panelDomain?: string | null
  panelPort: number
  entries: CaddyEntry[]
  tcpEntries?: CaddyTcpEntry[]
  acmeEmail?: string
  dnsProvider?: string
}

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i
const IPV4_RE = /^\d+\.\d+\.\d+\.\d+$/

export function validateHostname(hostname: string): { ok: boolean; reason?: string } {
  if (!hostname) return { ok: false, reason: 'Domain wajib diisi' }
  // Urutannya penting: cek protokol DULU, karena `https://x` juga mengandung
  // ':' dan bakal ketolak dengan alasan yang salah kalau port dicek duluan.
  if (hostname.includes('://')) return { ok: false, reason: 'Domain nggak boleh pakai http://' }
  if (/\s/.test(hostname)) return { ok: false, reason: 'Domain nggak boleh ada spasi' }
  if (hostname.includes(':')) return { ok: false, reason: 'Domain nggak boleh pakai port' }
  if (hostname.startsWith('*')) return { ok: false, reason: 'Wildcard nggak didukung di sini' }
  if (IPV4_RE.test(hostname)) {
    return { ok: false, reason: 'Pakai domain, bukan alamat IP' }
  }
  if (!HOSTNAME_RE.test(hostname)) {
    return { ok: false, reason: 'Format domain nggak valid' }
  }
  return { ok: true }
}

function block(hostname: string, upstreamPort: number, entry?: CaddyEntry): string {
  const lines: string[] = [`${hostname} {`]
  if (entry?.dnsChallenge) {
    lines.push('  tls {')
    lines.push('    dns cloudflare {env.CLOUDFLARE_API_TOKEN}')
    lines.push('  }')
  }
  lines.push(`  reverse_proxy 127.0.0.1:${upstreamPort}`)
  lines.push('}')
  return lines.join('\n')
}

function tcpBlock(entry: CaddyTcpEntry): string {
  return [
    `${entry.hostname}:${entry.listenPort} {`,
    `  proxy 127.0.0.1:${entry.upstreamPort}`,
    '}',
  ].join('\n')
}

export function renderCaddyfile(input: CaddyInput): string {
  const parts: string[] = []

  const globalLines: string[] = ['{', '  admin 127.0.0.1:2019']
  if (input.acmeEmail) globalLines.push(`  email ${input.acmeEmail}`)
  globalLines.push('}')
  parts.push(globalLines.join('\n'))

  if (input.panelDomain) {
    parts.push(block(input.panelDomain, input.panelPort))
  }

  for (const entry of input.entries) {
    parts.push(block(entry.hostname, entry.upstreamPort, entry))
  }

  // Database lewat domain: TCP mentah ke 127.0.0.1:<host port>.
  for (const entry of input.tcpEntries ?? []) {
    parts.push(tcpBlock(entry))
  }

  return `${parts.join('\n\n')}\n`
}
