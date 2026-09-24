import { describe, expect, test } from 'bun:test'
import {
  buildMinioConfig,
  MINIO_CONTAINER,
  MINIO_VOLUME,
  minioEndpoint,
  minioPublicEndpoint,
} from './minio'

const base = { rootUser: 'hikari', rootPassword: 'rahasia123' }

describe('buildMinioConfig', () => {
  test('pakai nama container & volume tetap', () => {
    const cfg = buildMinioConfig(base)
    expect(cfg.name).toBe(MINIO_CONTAINER)
    expect(cfg.HostConfig?.Binds).toEqual([`${MINIO_VOLUME}:/data`])
  })

  test('volume awet: AutoRemove false', () => {
    expect(buildMinioConfig(base).HostConfig?.AutoRemove).toBe(false)
  })

  test('memory limit wajib kepasang', () => {
    const cfg = buildMinioConfig(base)
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
    expect(cfg.HostConfig?.MemorySwap).toBe(512 * 1024 * 1024)
  })

  test('memory limit nol diganti default', () => {
    expect(buildMinioConfig({ ...base, memoryLimitMb: 0 }).HostConfig?.Memory).toBe(
      512 * 1024 * 1024
    )
  })

  test('API cuma di localhost kalau nggak publik', () => {
    const cfg = buildMinioConfig(base)
    expect(cfg.HostConfig?.PortBindings?.['9000/tcp']?.[0].HostIp).toBe('127.0.0.1')
  })

  test('API kebuka kalau publik', () => {
    const cfg = buildMinioConfig({ ...base, publicApi: true })
    expect(cfg.HostConfig?.PortBindings?.['9000/tcp']?.[0].HostIp).toBe('0.0.0.0')
  })

  test('console SELALU localhost walau API publik', () => {
    const cfg = buildMinioConfig({ ...base, publicApi: true })
    expect(cfg.HostConfig?.PortBindings?.['9001/tcp']?.[0].HostIp).toBe('127.0.0.1')
  })

  test('env root user & password kepasang', () => {
    const cfg = buildMinioConfig(base)
    expect(cfg.Env).toContain('MINIO_ROOT_USER=hikari')
    expect(cfg.Env).toContain('MINIO_ROOT_PASSWORD=rahasia123')
  })

  test('console-address diarahin ke port konsol', () => {
    expect(buildMinioConfig(base).Cmd?.join(' ')).toContain('--console-address')
  })
})

describe('endpoint', () => {
  test('endpoint internal pakai nama container (network Docker)', () => {
    expect(minioEndpoint()).toBe('http://hikari-minio:9000')
  })

  test('endpoint publik pakai IP VPS', () => {
    expect(minioPublicEndpoint('203.0.113.5')).toBe('http://203.0.113.5:9000')
  })

  test('endpoint publik tanpa IP kasih placeholder yang jelas', () => {
    expect(minioPublicEndpoint()).toContain('ip-vps-kamu')
  })
})
