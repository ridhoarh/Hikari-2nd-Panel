import { describe, expect, test } from 'bun:test'
import { chooseBuildPlan, dockerBuildArgs, railpackArgs } from './strategy'

describe('chooseBuildPlan', () => {
  test('sumber image langsung, nggak usah build', () => {
    const plan = chooseBuildPlan({
      sourceType: 'image',
      imageRef: 'redis:7-alpine',
      dockerfilePath: 'Dockerfile',
    })
    expect(plan.kind).toBe('image')
  })

  test('pakai Dockerfile kalau ada', () => {
    const plan = chooseBuildPlan({
      sourceType: 'github',
      repoDir: '/tmp/repo',
      dockerfilePath: 'Dockerfile',
      dockerfileExists: true,
    })
    expect(plan.kind).toBe('dockerfile')
  })

  test('fallback ke railpack kalau Dockerfile nggak ada', () => {
    const plan = chooseBuildPlan({
      sourceType: 'github',
      repoDir: '/tmp/repo',
      dockerfilePath: 'Dockerfile',
      dockerfileExists: false,
    })
    expect(plan.kind).toBe('railpack')
  })

  test('pilihan railpack eksplisit dipakai walau Dockerfile ada', () => {
    const plan = chooseBuildPlan({
      sourceType: 'github',
      repoDir: '/tmp/repo',
      dockerfilePath: 'Dockerfile',
      dockerfileExists: true,
      preferred: 'railpack',
    })
    expect(plan.kind).toBe('railpack')
  })

  test('sumber image tanpa imageRef bikin error', () => {
    expect(() =>
      chooseBuildPlan({
        sourceType: 'image',
        imageRef: null,
        dockerfilePath: 'Dockerfile',
      })
    ).toThrow()
  })
})

describe('dockerBuildArgs', () => {
  const args = dockerBuildArgs({
    contextDir: '/tmp/repo',
    dockerfile: 'Dockerfile',
    tag: 'hikari-blog:01HXYZ',
    buildkitHost: 'docker-container://hikari-buildkit',
  })

  test('pakai buildx', () => {
    expect(args[0]).toBe('buildx')
    expect(args).toContain('build')
  })

  test('set builder ke buildkit host', () => {
    const idx = args.indexOf('--builder')
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe('docker-container://hikari-buildkit')
  })

  test('kasih tag yang bener', () => {
    const idx = args.indexOf('-t')
    expect(args[idx + 1]).toBe('hikari-blog:01HXYZ')
  })

  test('pakai path Dockerfile yang diminta', () => {
    const idx = args.indexOf('-f')
    expect(args[idx + 1]).toBe('Dockerfile')
  })

  test('load hasilnya ke docker lokal', () => {
    expect(args).toContain('--load')
  })

  test('context dir jadi argumen terakhir', () => {
    expect(args[args.length - 1]).toBe('/tmp/repo')
  })
})

describe('railpackArgs', () => {
  test('build pakai railpack dengan tag', () => {
    const args = railpackArgs({ contextDir: '/tmp/repo', tag: 'hikari-blog:01HXYZ' })
    expect(args[0]).toBe('build')
    expect(args).toContain('--name')
    expect(args).toContain('hikari-blog:01HXYZ')
  })
})
