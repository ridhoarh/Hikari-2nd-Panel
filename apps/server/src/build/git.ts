import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Host yang known_hosts-nya di-pin sekali pas install. */
export const KNOWN_SSH_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org']

export function gitEnv(
  privateKeyPath: string,
  knownHostsPath: string
): Record<string, string> {
  return {
    GIT_SSH_COMMAND: [
      'ssh',
      `-i ${privateKeyPath}`,
      `-o UserKnownHostsFile=${knownHostsPath}`,
      '-o StrictHostKeyChecking=yes',
      '-o BatchMode=yes',
    ].join(' '),
  }
}

/**
 * Ambil host key dari daftar host dan tulis ke satu file known_hosts.
 * Dipanggil sekali pas install — `ssh-keyscan` butuh network, jadi nggak
 * cocok dijalani di tiap deploy.
 */
export async function pinKnownHosts(destPath: string): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })

  const hasil: string[] = []
  for (const host of KNOWN_SSH_HOSTS) {
    const proc = Bun.spawn(['ssh-keyscan', '-t', 'ed25519,rsa', host], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const text = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code === 0 && text.trim()) hasil.push(text.trim())
  }

  if (hasil.length === 0) {
    throw new Error('ssh-keyscan nggak dapet host key sama sekali')
  }

  await Bun.write(destPath, `${hasil.join('\n')}\n`)
}

export function repoDirName(appSlug: string, deploymentId: string): string {
  return `${appSlug}-${deploymentId}`
}

export type CloneOptions = {
  repoUrl: string
  branch: string
  privateKeyPath: string
  knownHostsPath: string
  workDir: string
  appSlug: string
  deploymentId: string
}

export async function cloneRepo(opts: CloneOptions): Promise<{
  commitSha: string
  commitMessage: string
  repoDir: string
}> {
  const repoDir = join(opts.workDir, repoDirName(opts.appSlug, opts.deploymentId))

  if (existsSync(repoDir)) rmSync(repoDir, { recursive: true, force: true })
  mkdirSync(opts.workDir, { recursive: true })

  const env = { ...process.env, ...gitEnv(opts.privateKeyPath, opts.knownHostsPath) }

  async function git(args: string[], cwd?: string): Promise<string> {
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    if (code !== 0) throw new Error(`git ${args[0]} gagal (exit ${code})\n${err}`)
    return out
  }

  await git(['clone', '--depth', '1', '--branch', opts.branch, opts.repoUrl, repoDir])

  const commitSha = (await git(['rev-parse', 'HEAD'], repoDir)).trim()
  const commitMessage = (await git(['log', '-1', '--pretty=%s'], repoDir)).trim()

  return { commitSha, commitMessage, repoDir }
}
