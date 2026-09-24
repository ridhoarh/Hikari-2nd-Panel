import { describe, expect, test } from 'bun:test'
import { parseStats } from './stats'

const raw = {
  cpu_stats: {
    cpu_usage: { total_usage: 2_000_000_000 },
    system_cpu_usage: 10_000_000_000,
    online_cpus: 2,
  },
  precpu_stats: {
    cpu_usage: { total_usage: 1_000_000_000 },
    system_cpu_usage: 8_000_000_000,
  },
  memory_stats: {
    usage: 200 * 1024 * 1024,
    limit: 512 * 1024 * 1024,
  },
}

describe('parseStats', () => {
  test('hitung persen CPU', () => {
    // delta cpu = 1e9, delta system = 2e9, 2 core -> 1e9/2e9*2*100 = 100
    expect(parseStats(raw).cpuPercent).toBe(100)
  })

  test('hitung memori terpakai dalam MB', () => {
    expect(parseStats(raw).memoryUsedMb).toBe(200)
  })

  test('hitung memori limit dalam MB', () => {
    expect(parseStats(raw).memoryLimitMb).toBe(512)
  })

  test('hitung persen memori', () => {
    expect(parseStats(raw).memoryPercent).toBeCloseTo(39.06, 1)
  })

  test('nggak error kalau delta system nol', () => {
    const nol = {
      ...raw,
      precpu_stats: { ...raw.precpu_stats, system_cpu_usage: 10_000_000_000 },
    }
    expect(parseStats(nol).cpuPercent).toBe(0)
  })

  test('nggak error kalau memory limit nol', () => {
    const nol = { ...raw, memory_stats: { usage: 100, limit: 0 } }
    const hasil = parseStats(nol)
    expect(hasil.memoryPercent).toBe(0)
    expect(Number.isFinite(hasil.memoryPercent)).toBe(true)
    expect(Number.isFinite(hasil.memoryUsedMb)).toBe(true)
  })

  test('nggak error kalau stats-nya kosong', () => {
    const kosong = parseStats({})
    expect(kosong.cpuPercent).toBe(0)
    expect(kosong.memoryUsedMb).toBe(0)
    expect(kosong.memoryPercent).toBe(0)
  })
})
