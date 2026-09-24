import { describe, expect, test } from 'bun:test'
import { createBuildQueue } from './queue'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('createBuildQueue', () => {
  test('jalanin job satu per satu', async () => {
    const urutan: string[] = []
    let bersamaan = 0

    const q = createBuildQueue<string>(async (job) => {
      bersamaan += 1
      expect(bersamaan).toBe(1)
      urutan.push(`mulai:${job}`)
      await tick()
      urutan.push(`selesai:${job}`)
      bersamaan -= 1
    })

    q.enqueue('a')
    q.enqueue('b')
    q.enqueue('c')

    await q.onIdle()

    expect(urutan).toEqual([
      'mulai:a',
      'selesai:a',
      'mulai:b',
      'selesai:b',
      'mulai:c',
      'selesai:c',
    ])
  })

  test('job gagal nggak nyetop antrean', async () => {
    const diproses: string[] = []
    const q = createBuildQueue<string>(async (job) => {
      diproses.push(job)
      if (job === 'a') throw new Error('gagal')
    })

    const hasilA = await q.enqueue('a')
    await q.enqueue('b')

    expect(diproses).toEqual(['a', 'b'])
    expect(hasilA.ok).toBe(false)
    expect(hasilA.ok === false && hasilA.error).toContain('gagal')
  })

  test('enqueue nggak pernah reject, kegagalan jadi nilai balikan', async () => {
    const q = createBuildQueue<string>(async () => {
      throw new Error('bum')
    })

    const hasil = await q.enqueue('a')
    expect(hasil.ok).toBe(false)
  })

  test('enqueue bisa di-await sampai job-nya kelar', async () => {
    let selesai = false
    const q = createBuildQueue<string>(async () => {
      await tick()
      selesai = true
    })

    const hasil = await q.enqueue('a')
    expect(selesai).toBe(true)
    expect(hasil.ok).toBe(true)
  })

  test('isBusy true pas lagi kerja', async () => {
    const q = createBuildQueue<string>(async () => {
      await tick()
    })
    q.enqueue('a')
    expect(q.isBusy()).toBe(true)
    await q.onIdle()
    expect(q.isBusy()).toBe(false)
  })

  test('size nunjukin jumlah yang nunggu', async () => {
    const q = createBuildQueue<string>(async () => {
      await tick()
    })
    q.enqueue('a')
    q.enqueue('b')
    expect(q.size()).toBeGreaterThanOrEqual(1)
    await q.onIdle()
    expect(q.size()).toBe(0)
  })
})
