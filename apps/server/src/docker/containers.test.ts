import { describe, expect, test } from 'bun:test'
import { buildContainerConfig } from './containers'

const base = {
  appSlug: 'blog',
  image: 'hikari-blog:01HXYZ',
  containerPort: 3000,
  env: { NODE_ENV: 'production' },
  memoryLimitMb: 512,
  cpuLimit: 1.0,
  network: 'hikari',
}

describe('buildContainerConfig', () => {
  test('pakai nama container dari slug', () => {
    expect(buildContainerConfig(base).name).toBe('hikari-app-blog')
  })

  test('set memory limit dalam byte', () => {
    expect(buildContainerConfig(base).HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('set CPU limit dalam nanocpus', () => {
    expect(buildContainerConfig(base).HostConfig?.NanoCpus).toBe(1_000_000_000)
  })

  test('memory limit nol diganti jadi default 512MB', () => {
    const cfg = buildContainerConfig({ ...base, memoryLimitMb: 0 })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('memory limit negatif diganti jadi default', () => {
    const cfg = buildContainerConfig({ ...base, memoryLimitMb: -100 })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('memory limit NaN diganti jadi default', () => {
    const cfg = buildContainerConfig({ ...base, memoryLimitMb: Number.NaN })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('MemorySwap sama dengan Memory biar nggak ngambil dari disk', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.HostConfig?.MemorySwap).toBe(cfg.HostConfig?.Memory)
  })

  test('port cuma di-bind ke localhost, bukan 0.0.0.0', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.HostConfig?.PortBindings?.['3000/tcp']).toEqual([
      { HostIp: '127.0.0.1', HostPort: '' },
    ])
  })

  test('env diteruskan dalam format KEY=VALUE', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.Env).toContain('NODE_ENV=production')
  })

  test('pakai network yang diminta', () => {
    expect(buildContainerConfig(base).HostConfig?.NetworkMode).toBe('hikari')
  })

  test('container TIDAK dihapus otomatis, Hikari yang bersihin', () => {
    expect(buildContainerConfig(base).HostConfig?.AutoRemove).toBe(false)
  })

  test('restart policy unless-stopped', () => {
    expect(buildContainerConfig(base).HostConfig?.RestartPolicy?.Name).toBe('unless-stopped')
  })

  test('label hikari kepasang biar gampang difilter', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.Labels?.['hikari.managed']).toBe('true')
    expect(cfg.Labels?.['hikari.app']).toBe('blog')
  })
})
