import { createSign } from 'node:crypto'

export type GithubInstallation = {
  id: number
  account: { login: string }
}

/** `git@github.com:user/repo.git` atau URL https -> `user/repo`. */
export function parseRepoFullName(repoUrl: string): string | null {
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(repoUrl)
  if (ssh) return `${ssh[1]}/${ssh[2]}`

  const https = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(repoUrl)
  if (https) return `${https[1]}/${https[2]}`

  return null
}

/**
 * JWT buat autentikasi sebagai GitHub App.
 *
 * Dua hal yang gampang salah dan bikin GitHub nolak:
 * - `exp` nggak boleh lebih dari 10 menit dari sekarang.
 * - `iat` dimundurin 60 detik buat ngehindarin clock skew antar mesin.
 */
export function buildAppJwt(opts: {
  appId: string
  privateKey: string
  now?: number
}): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: opts.appId,
  }

  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const body = `${enc(header)}.${enc(payload)}`

  const signer = createSign('RSA-SHA256')
  signer.update(body)
  // Kalau kuncinya rusak, `sign` bakal throw — dan itu memang yang
  // diinginkan: lebih baik gagal jelas daripada kirim JWT kosong.
  const signature = signer.sign(opts.privateKey, 'base64url')

  return `${body}.${signature}`
}

/**
 * URL clone pakai installation token.
 *
 * Format `x-access-token:<token>@` itu yang didokumentasiin GitHub buat
 * App installation token. Token-nya bakal kelihatan di error message git,
 * jadi jangan di-log.
 */
export function cloneUrlWithToken(repoFullName: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${repoFullName}.git`
}

/**
 * Pilih instalasi yang punya akses ke repo-nya. Kalau cuma ada satu
 * instalasi, dipakai itu — biar app yang baru dipasang langsung jalan.
 */
export function pickInstallation(
  installations: GithubInstallation[],
  repoInstallationIds: Set<number>
): GithubInstallation | null {
  for (const inst of installations) {
    if (repoInstallationIds.has(inst.id)) return inst
  }
  if (installations.length === 1) return installations[0]
  return null
}

const GITHUB_API = 'https://api.github.com'

export async function listInstallations(opts: {
  jwt: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; installations: GithubInstallation[]; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(`${GITHUB_API}/app/installations`, {
      headers: {
        Authorization: `Bearer ${opts.jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        installations: [],
        error: `GitHub nolak: ${res.status} ${text.slice(0, 200)}`,
      }
    }
    const data = (await res.json()) as GithubInstallation[]
    return { ok: true, installations: data }
  } catch (err) {
    return {
      ok: false,
      installations: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Token instalasi berlaku 1 jam, jadi selalu diambil baru. */
export async function createInstallationToken(opts: {
  jwt: string
  installationId: number
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(
      `${GITHUB_API}/app/installations/${opts.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `GitHub nolak: ${res.status} ${text.slice(0, 200)}` }
    }
    const data = (await res.json()) as { token: string }
    return { ok: true, token: data.token }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Kirim status balik ke GitHub, biar commit-nya dapet centang hijau/silang.
 *
 * `target_url` diisi ke panel Hikari kalau ada, biar bisa diklik.
 */
export async function postCommitStatus(opts: {
  token: string
  repoFullName: string
  sha: string
  state: 'pending' | 'success' | 'failure' | 'error'
  description: string
  targetUrl?: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(
      `${GITHUB_API}/repos/${opts.repoFullName}/statuses/${opts.sha}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: opts.state,
          description: opts.description.slice(0, 140),
          context: 'hikari/deploy',
          ...(opts.targetUrl ? { target_url: opts.targetUrl } : {}),
        }),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `GitHub nolak: ${res.status} ${text.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
