import type { BuildStrategy, SourceType } from '../repositories/apps'

export type BuildPlan =
  | { kind: 'dockerfile'; dockerfile: string }
  | { kind: 'railpack' }
  | { kind: 'image'; image: string }

export type PlanInput = {
  sourceType: SourceType
  repoDir?: string
  imageRef?: string | null
  dockerfilePath: string
  dockerfileExists?: boolean
  preferred?: BuildStrategy
}

export function chooseBuildPlan(input: PlanInput): BuildPlan {
  if (input.sourceType === 'image') {
    if (!input.imageRef) throw new Error('App dari image harus punya image_ref')
    return { kind: 'image', image: input.imageRef }
  }

  if (input.preferred === 'railpack') return { kind: 'railpack' }

  if (input.dockerfileExists) {
    return { kind: 'dockerfile', dockerfile: input.dockerfilePath }
  }

  return { kind: 'railpack' }
}

export function dockerBuildArgs(opts: {
  contextDir: string
  dockerfile: string
  tag: string
  builder: string
}): string[] {
  return [
    'buildx',
    'build',
    '--builder',
    opts.builder,
    // Path Dockerfile DIKIRIM ABSOLUT. Kalau cuma 'Dockerfile', buildx
    // nyarinya relatif ke cwd proses, bukan ke context dir — dan itu gagal
    // dengan "failed to read dockerfile: open Dockerfile: no such file".
    '-f',
    opts.dockerfile,
    '-t',
    opts.tag,
    '--load',
    opts.contextDir,
  ]
}

export function railpackArgs(opts: { contextDir: string; tag: string }): string[] {
  return ['build', '--name', opts.tag, opts.contextDir]
}
