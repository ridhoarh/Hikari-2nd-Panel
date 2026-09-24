import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { slugify } from '../lib/id'

export function repoSlugFromApp(appSlug: string): string {
  const bersih = slugify(appSlug)
  return bersih.length > 0 ? bersih : 'app'
}

export function bareRepoPath(dataDir: string, appSlug: string): string {
  return join(dataDir, 'repos', `${repoSlugFromApp(appSlug)}.git`)
}

/**
 * URL yang dipakai user buat `git remote add`. Port 22 nggak ditulis karena
 * udah default dan bikin URL-nya lebih enak dibaca.
 */
export function sshUrlFor(appSlug: string, host: string, port: number): string {
  const slug = repoSlugFromApp(appSlug)
  if (port === 22) return `git@${host}:${slug}.git`
  return `ssh://git@${host}:${port}/${slug}.git`
}

/**
 * Hook `post-receive`.
 *
 * `|| true` di akhir itu SENGAJA: kalau Hikari lagi mati atau endpoint-nya
 * error, push-nya tetap harus sukses. Commit-nya udah masuk ke repo, jadi
 * nge-fail-in push cuma bikin user bingung.
 */
export function hookScript(opts: {
  appId: string
  apiUrl: string
  pushSecret: string
}): string {
  return `#!/bin/sh
# Dibikin otomatis sama Hikari. Jangan diedit manual.
while read oldrev newrev refname; do
  if [ "$newrev" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi
  curl -fsS -X POST "${opts.apiUrl}/api/git-push/${opts.appId}" \\
    -H "Content-Type: application/json" \\
    -H "x-hikari-push-secret: ${opts.pushSecret}" \\
    -d "{\\"ref\\":\\"$refname\\",\\"sha\\":\\"$newrev\\"}" >/dev/null 2>&1 || true
done
exit 0
`
}

export function parsePushCommand(command: string): string | null {
  const m = /git-receive-pack '?([^']+?)'?$/.exec(command.trim())
  if (!m) return null
  return m[1].replace(/\.git$/, '').replace(/^\/+/, '')
}

/** Bikin bare repo + hook post-receive. Aman dijalanin berkali-kali. */
export async function ensureBareRepo(opts: {
  dataDir: string
  appSlug: string
  appId: string
  apiUrl: string
  pushSecret: string
}): Promise<string> {
  const repoPath = bareRepoPath(opts.dataDir, opts.appSlug)

  if (!existsSync(repoPath)) {
    mkdirSync(join(opts.dataDir, 'repos'), { recursive: true })
    const proc = Bun.spawn(['git', 'init', '--bare', '-b', 'main', repoPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const err = await new Response(proc.stderr).text()
    if ((await proc.exited) !== 0) {
      throw new Error(`git init --bare gagal: ${err.trim()}`)
    }
  }

  const hooksDir = join(repoPath, 'hooks')
  mkdirSync(hooksDir, { recursive: true })

  const hookPath = join(hooksDir, 'post-receive')
  writeFileSync(
    hookPath,
    hookScript({
      appId: opts.appId,
      apiUrl: opts.apiUrl,
      pushSecret: opts.pushSecret,
    }),
    'utf8'
  )
  // Git nggak jalanin hook yang nggak executable.
  chmodSync(hookPath, 0o755)

  return repoPath
}

export function hapusBareRepo(dataDir: string, appSlug: string): boolean {
  const repoPath = bareRepoPath(dataDir, appSlug)
  if (!existsSync(repoPath)) return false
  try {
    const proc = Bun.spawnSync(['rm', '-rf', repoPath])
    return proc.exitCode === 0
  } catch {
    return false
  }
}
