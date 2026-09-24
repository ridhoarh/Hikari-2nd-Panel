import { describe, expect, test } from 'bun:test'
import { parseLogChunk } from './logs'

function dockerFrame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header[0] = stream
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

describe('parseLogChunk', () => {
  test('baca satu baris stdout', () => {
    const lines = parseLogChunk(dockerFrame(1, 'halo dunia\n'))
    expect(lines).toHaveLength(1)
    expect(lines[0].stream).toBe('stdout')
    expect(lines[0].text).toBe('halo dunia')
  })

  test('baca baris stderr', () => {
    const lines = parseLogChunk(dockerFrame(2, 'ada error\n'))
    expect(lines[0].stream).toBe('stderr')
  })

  test('baca beberapa frame sekaligus', () => {
    const raw = Buffer.concat([dockerFrame(1, 'satu\n'), dockerFrame(1, 'dua\n')])
    const lines = parseLogChunk(raw)
    expect(lines).toHaveLength(2)
    expect(lines[1].text).toBe('dua')
  })

  test('buang baris kosong', () => {
    const lines = parseLogChunk(dockerFrame(1, '\n\n'))
    expect(lines).toHaveLength(0)
  })

  test('teks tanpa header tetep kebaca (mode TTY)', () => {
    const lines = parseLogChunk('baris polos\n')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('baris polos')
  })

  test('data kosong balikin array kosong', () => {
    expect(parseLogChunk(Buffer.alloc(0))).toEqual([])
  })

  test('frame yang kepotong di tengah nggak bikin error', () => {
    const penuh = dockerFrame(1, 'lengkap\n')
    const kepotong = penuh.subarray(0, penuh.length - 3)
    expect(() => parseLogChunk(kepotong)).not.toThrow()
  })
})
