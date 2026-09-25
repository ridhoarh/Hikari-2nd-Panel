import { Hono } from 'hono'
import type { Database } from '../db/client'
import {
  buildAppJwt,
  createInstallationToken,
  listInstallations,
  parseRepoFullName,
  pickInstallation,
  postCommitStatus,
  type GithubInstallation,
} from './github-app'
import {
  clearTokenCache,
  deleteGithubApp,
  getCachedToken,
  getGithubAppId,
  getGithubAppKey,
  setCachedToken,
  setGithubApp,
} from './settings'

export type GithubRoutesDeps = {
  db: Database
  cryptoKey: Buffer
  fetchImpl?: typeof fetch
}

const PEM_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/

export function createGithubRoutes(deps: GithubRoutesDeps): Hono {
  const { db, cryptoKey } = deps
  const router = new Hono()
  const doFetch = deps.fetchImpl ?? fetch

  router.get('/github/status', async (c) => {
    const appId = getGithubAppId(db)
    const key = getGithubAppKey(db, cryptoKey)

    if (!appId || !key) return c.json({ connected: false, installations: [] })

    try {
      const jwt = buildAppJwt({ appId, privateKey: key })
      const hasil = await listInstallations({ jwt, fetchImpl: doFetch })
      return c.json({
        connected: hasil.ok,
        appId,
        installations: hasil.installations,
        error: hasil.error,
      })
    } catch (err) {
      return c.json({
        connected: false,
        appId,
        installations: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  router.post('/github/app', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appId?: string
      privateKey?: string
    } | null

    const appId = body?.appId?.trim()
    const privateKey = body?.privateKey?.trim()

    if (!appId) return c.json({ error: 'App ID wajib diisi' }, 400)
    if (!privateKey) return c.json({ error: 'Private key wajib diisi' }, 400)
    if (!PEM_RE.test(privateKey)) {
      return c.json(
        { error: 'Private key-nya bukan format PEM. Ambil file .pem dari halaman GitHub App.' },
        400
      )
    }

    // Dicek dulu sebelum disimpen: App ID + key yang nggak cocok mending
    // ketahuan sekarang.
    try {
      const jwt = buildAppJwt({ appId, privateKey })
      const hasil = await listInstallations({ jwt, fetchImpl: doFetch })
      if (!hasil.ok) {
        return c.json({ error: `Nggak bisa dipakai: ${hasil.error}` }, 400)
      }
      setGithubApp(db, cryptoKey, appId, privateKey)
      clearTokenCache()
      return c.json({ ok: true, installations: hasil.installations })
    } catch (err) {
      return c.json(
        { error: `Private key-nya nggak valid: ${err instanceof Error ? err.message : err}` },
        400
      )
    }
  })

  router.delete('/github/app', (c) => {
    deleteGithubApp(db)
    clearTokenCache()
    return c.json({ ok: true })
  })

  /**
   * Token instalasi buat repo tertentu. Dipakai pipeline deploy: kalau repo
   * asalnya GitHub dan App-nya terpasang, clone-nya pakai token — nggak
   * perlu deploy key.
   */
  router.post('/github/token', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { repoUrl?: string } | null
    const fullName = parseRepoFullName(body?.repoUrl ?? '')
    if (!fullName) return c.json({ error: 'Itu bukan repo GitHub' }, 400)

    const appId = getGithubAppId(db)
    const key = getGithubAppKey(db, cryptoKey)
    if (!appId || !key) {
      return c.json({ error: 'GitHub App belum diatur' }, 400)
    }

    const jwt = buildAppJwt({ appId, privateKey: key })
    const list = await listInstallations({ jwt, fetchImpl: doFetch })
    if (!list.ok) return c.json({ error: list.error }, 400)

    const inst = pilihUntukRepo(list.installations, fullName)
    if (!inst) {
      return c.json(
        { error: `App-nya belum dipasang di ${fullName.split('/')[0]}` },
        400
      )
    }

    const cached = getCachedToken(inst.id)
    if (cached) return c.json({ ok: true, token: cached, installationId: inst.id })

    const token = await createInstallationToken({
      jwt,
      installationId: inst.id,
      fetchImpl: doFetch,
    })
    if (!token.ok || !token.token) return c.json({ error: token.error }, 400)

    setCachedToken(inst.id, token.token)
    return c.json({ ok: true, token: token.token, installationId: inst.id })
  })

  /**
   * Kirim status deploy balik ke GitHub, biar commit-nya dapet centang.
   * Gagal kirim status bukan error fatal — deploy-nya tetap dianggap sukses.
   */
  router.post('/github/status', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      repoUrl?: string
      sha?: string
      state?: 'pending' | 'success' | 'failure' | 'error'
      description?: string
    } | null

    const fullName = parseRepoFullName(body?.repoUrl ?? '')
    if (!fullName || !body?.sha || !body.state) {
      return c.json({ error: 'Data nggak lengkap' }, 400)
    }

    const appId = getGithubAppId(db)
    const key = getGithubAppKey(db, cryptoKey)
    if (!appId || !key) return c.json({ error: 'GitHub App belum diatur' }, 400)

    const jwt = buildAppJwt({ appId, privateKey: key })
    const list = await listInstallations({ jwt, fetchImpl: doFetch })
    if (!list.ok) return c.json({ error: list.error }, 400)

    const inst = pickInstallation(list.installations, new Set<number>())
    if (!inst) return c.json({ error: 'Nggak ada instalasi' }, 400)

    let token = getCachedToken(inst.id)
    if (!token) {
      const baru = await createInstallationToken({
        jwt,
        installationId: inst.id,
        fetchImpl: doFetch,
      })
      if (!baru.ok || !baru.token) return c.json({ error: baru.error }, 400)
      setCachedToken(inst.id, baru.token)
      token = baru.token
    }

    const hasil = await postCommitStatus({
      token,
      repoFullName: fullName,
      sha: body.sha,
      state: body.state,
      description: body.description ?? 'Deploy lewat Hikari',
      fetchImpl: doFetch,
    })

    return c.json({ ok: hasil.ok, error: hasil.error })
  })

  return router
}

/**
 * GitHub nggak ngasih tau instalasi mana yang punya repo mana tanpa nembak
 * API tambahan per instalasi. Buat panel satu orang, instalasi pertama
 * itu jawaban yang benar hampir selalu.
 */
function pilihUntukRepo(
  installations: GithubInstallation[],
  _fullName: string
): GithubInstallation | null {
  return pickInstallation(installations, new Set<number>())
}
