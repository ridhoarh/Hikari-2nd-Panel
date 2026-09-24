import { mkdirSync, chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

export function generateDeployKey(privateKeyPath: string): {
  publicKey: string
  privateKey: string
} {
  const dir = dirname(privateKeyPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })

  if (existsSync(privateKeyPath)) rmSync(privateKeyPath)
  if (existsSync(`${privateKeyPath}.pub`)) rmSync(`${privateKeyPath}.pub`)

  const proc = Bun.spawnSync(
    ['ssh-keygen', '-t', 'ed25519', '-N', '', '-f', privateKeyPath],
    { stdout: 'pipe', stderr: 'pipe' }
  )

  if (proc.exitCode !== 0) {
    throw new Error(
      `ssh-keygen gagal: ${proc.stderr.toString().trim() || `exit ${proc.exitCode}`}`
    )
  }

  chmodSync(privateKeyPath, 0o600)

  return {
    privateKey: readFileSync(privateKeyPath, 'utf8'),
    publicKey: readFileSync(`${privateKeyPath}.pub`, 'utf8'),
  }
}

export function formatPublicKey(publicKey: string, label: string): string {
  const parts = publicKey.trim().split(/\s+/)
  const [algorithm, key] = parts
  return `${algorithm} ${key} hikari-${label}`
}
