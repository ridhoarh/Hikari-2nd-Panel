import { describe, expect, test } from 'bun:test'
import { run } from './exec'

describe('run', () => {
  test('balikin stdout', async () => {
    const out = await run('echo', ['halo'])
    expect(out.trim()).toBe('halo')
  })

  test('gabungin stderr ke keluaran', async () => {
    const out = await run('sh', ['-c', 'echo ke-stdout; echo ke-stderr >&2'])
    expect(out).toContain('ke-stdout')
    expect(out).toContain('ke-stderr')
  })

  test('exit code non-nol dilempar, keluaran ikut disertakan', async () => {
    await expect(run('sh', ['-c', 'echo pesan-error >&2; exit 3'])).rejects.toThrow(
      /exit 3/
    )
  })

  test('timeout beneran matiin proses', async () => {
    await expect(run('sleep', ['10'], { timeoutMs: 200 })).rejects.toThrow(/kelamaan/)
  })

  test('nggak nge-block event loop', async () => {
    let tick = 0
    const iv = setInterval(() => tick++, 10)
    await run('sleep', ['0.3'])
    clearInterval(iv)
    expect(tick).toBeGreaterThan(5)
  })

  test('onLine ngalir per baris', async () => {
    const baris: string[] = []
    await run('sh', ['-c', 'echo satu; echo dua'], { onLine: (l) => baris.push(l) })
    expect(baris).toEqual(['satu', 'dua'])
  })

  test('cwd dihormati', async () => {
    const out = await run('pwd', [], { cwd: '/tmp' })
    expect(out.trim()).toMatch(/\/tmp$/)
  })

  test('keluaran raksasa nggak bikin kehabisan memori', async () => {
    const out = await run('sh', [
      '-c',
      'for i in $(seq 1 20000); do echo "baris panjang nomor $i dan seterusnya"; done',
    ])
    expect(out.length).toBeLessThanOrEqual(1024 * 1024)
  })
})
