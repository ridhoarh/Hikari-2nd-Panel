import { run } from './exec'

/**
 * Builder buildx yang dikelola sendiri. Container BuildKit-nya dibikin dan
 * diurus buildx, jadi Hikari nggak perlu bikin/dimatiin container manual.
 */
export const BUILDKIT_BUILDER = 'hikari-buildkit'
export const BUILDKIT_MEMORY_MB = 768

export function builderName(): string {
  return BUILDKIT_BUILDER
}

/**
 * Pastiin builder-nya ada dan jalan.
 *
 * Catatan: `docker buildx build --builder <nama>` butuh **nama builder yang
 * terdaftar**, bukan URL container. Versi awal rencana pakai
 * `docker-container://hikari-buildkit` dan itu selalu gagal dengan
 * `no builder ... found`. Driver `docker-container` yang bikin buildx
 * yang nyalain container BuildKit-nya, dan batas RAM dipasang lewat
 * driver-opt.
 */
export async function ensureBuildKit(): Promise<void> {
  const ls = await run('docker', ['buildx', 'ls', '--format', '{{.Name}}']).catch(
    () => ''
  )

  const sudahAda = ls
    .split('\n')
    .map((s) => s.trim())
    .includes(BUILDKIT_BUILDER)

  if (!sudahAda) {
    await run('docker', [
      'buildx',
      'create',
      '--name',
      BUILDKIT_BUILDER,
      '--driver',
      'docker-container',
      // Swap = memory, jadi beneran limit dan nggak pindah ke disk.
      '--driver-opt',
      `memory=${BUILDKIT_MEMORY_MB}m`,
      '--driver-opt',
      `memory-swap=${BUILDKIT_MEMORY_MB}m`,
    ])
  }

  // Bootstrap bikin container BuildKit-nya nyala kalau belum.
  await run('docker', ['buildx', 'inspect', BUILDKIT_BUILDER, '--bootstrap'])
}

/**
 * Matiin container BuildKit biar RAM-nya balik. Builder-nya tetep terdaftar,
 * jadi build berikutnya cuma perlu bootstrap lagi.
 */
export async function stopBuildKit(): Promise<void> {
  await run('docker', ['buildx', 'stop', BUILDKIT_BUILDER]).catch(() => undefined)
}
