import { describe, expect, test } from 'bun:test'
import { buildDbContainerConfig, dbContainerName, dbVolumeName } from './db-containers'

const base = {
  id: '01HXYZ',
  name: 'Produksi',
  engine: 'postgres' as const,
  version: '16',
  dbName: 'produksi',
  dbUser: 'hikari',
  password: 'rahasia32karakter',
  volumeName: 'hikari-db-01hxyz',
  containerPort: 5432,
  hostPort: 20001,
  accessMode: 'internal' as const,
  memoryLimitMb: 512,
}

describe('penamaan', () => {
  test('nama container pakai prefix hikari-db-', () => {
    expect(dbContainerName('01HXYZ')).toBe('hikari-db-01hxyz')
  })

  test('nama volume dari record', () => {
    expect(dbVolumeName('hikari-db-01hxyz')).toBe('hikari-db-01hxyz')
  })
})

describe('buildDbContainerConfig - internal', () => {
  const cfg = buildDbContainerConfig(base)

  test('port cuma di localhost', () => {
    expect(cfg.HostConfig?.PortBindings?.['5432/tcp']).toEqual([
      { HostIp: '127.0.0.1', HostPort: '20001' },
    ])
  })

  test('memory limit kepasang', () => {
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
    expect(cfg.HostConfig?.MemorySwap).toBe(512 * 1024 * 1024)
  })

  test('nggak dihapus otomatis', () => {
    expect(cfg.HostConfig?.AutoRemove).toBe(false)
  })

  test('restart policy unless-stopped', () => {
    expect(cfg.HostConfig?.RestartPolicy?.Name).toBe('unless-stopped')
  })

  test('volume data kepasang dengan path yang bener per engine', () => {
    expect(cfg.HostConfig?.Binds).toEqual([
      'hikari-db-01hxyz:/var/lib/postgresql/data',
    ])
  })

  test('env postgres bener', () => {
    expect(cfg.Env).toContain('POSTGRES_USER=hikari')
    expect(cfg.Env).toContain('POSTGRES_PASSWORD=rahasia32karakter')
    expect(cfg.Env).toContain('POSTGRES_DB=produksi')
  })

  test('label hikari kepasang', () => {
    expect(cfg.Labels?.['hikari.managed']).toBe('true')
    expect(cfg.Labels?.['hikari.db']).toBe('01HXYZ')
  })

  test('pakai image versi yang diminta', () => {
    expect(cfg.Image).toBe('postgres:16-alpine')
  })
})

describe('buildDbContainerConfig - mode akses', () => {
  test('internal bind ke 127.0.0.1', () => {
    const cfg = buildDbContainerConfig({ ...base, accessMode: 'internal' })
    expect(cfg.HostConfig?.PortBindings?.['5432/tcp']?.[0].HostIp).toBe('127.0.0.1')
  })

  test('tunnel bind ke 127.0.0.1 juga', () => {
    const cfg = buildDbContainerConfig({ ...base, accessMode: 'tunnel' })
    expect(cfg.HostConfig?.PortBindings?.['5432/tcp']?.[0].HostIp).toBe('127.0.0.1')
  })

  test('public bind ke 0.0.0.0', () => {
    const cfg = buildDbContainerConfig({ ...base, accessMode: 'public' })
    expect(cfg.HostConfig?.PortBindings?.['5432/tcp']?.[0].HostIp).toBe('0.0.0.0')
  })

  test('domain tetap localhost, karena Caddy yang nerusin', () => {
    const cfg = buildDbContainerConfig({ ...base, accessMode: 'domain' })
    expect(cfg.HostConfig?.PortBindings?.['5432/tcp']?.[0].HostIp).toBe('127.0.0.1')
  })

  test('public tetap punya memory limit (nggak bisa dimatiin)', () => {
    const cfg = buildDbContainerConfig({
      ...base,
      accessMode: 'public',
      memoryLimitMb: 0,
    })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })
})

describe('buildDbContainerConfig - redis', () => {
  test('redis butuh argumen requirepass', () => {
    const cfg = buildDbContainerConfig({
      ...base,
      engine: 'redis',
      containerPort: 6379,
      volumeName: 'hikari-db-redis',
    })
    expect(cfg.Image).toBe('redis:16-alpine')
    expect(cfg.Cmd?.join(' ')).toContain('--requirepass')
    expect(cfg.Cmd?.join(' ')).toContain('rahasia32karakter')
  })

  test('redis simpen data di /data', () => {
    const cfg = buildDbContainerConfig({
      ...base,
      engine: 'redis',
      containerPort: 6379,
    })
    expect(cfg.HostConfig?.Binds?.[0]).toBe('hikari-db-01hxyz:/data')
  })
})

describe('buildDbContainerConfig - mysql', () => {
  test('mysql pakai port 3306 & image yang bener', () => {
    const cfg = buildDbContainerConfig({
      ...base,
      engine: 'mysql',
      version: '8',
      containerPort: 3306,
    })
    expect(cfg.Image).toBe('mysql:8')
    expect(cfg.ExposedPorts?.['3306/tcp']).toBeDefined()
  })
})
