import type Docker from 'dockerode'
import { containerName } from './client'

export type LogLine = { stream: 'stdout' | 'stderr'; text: string }

export function parseLogChunk(raw: Buffer | string): LogLine[] {
  const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw
  const lines: LogLine[] = []

  let offset = 0
  const looksMultiplexed =
    buf.length >= 8 && (buf[0] === 0 || buf[0] === 1 || buf[0] === 2)

  if (!looksMultiplexed) {
    return buf
      .toString('utf8')
      .split('\n')
      .map((t) => t.trimEnd())
      .filter((t) => t.length > 0)
      .map((text) => ({ stream: 'stdout' as const, text }))
  }

  while (offset + 8 <= buf.length) {
    const streamByte = buf[offset]
    const size = buf.readUInt32BE(offset + 4)

    if (offset + 8 + size > buf.length) break

    const text = buf.subarray(offset + 8, offset + 8 + size).toString('utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd()
      if (trimmed.length > 0) {
        lines.push({ stream: streamByte === 2 ? 'stderr' : 'stdout', text: trimmed })
      }
    }
    offset += 8 + size
  }

  return lines
}

export async function getLogs(
  docker: Docker,
  appSlug: string,
  tail = 200
): Promise<LogLine[]> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    const raw = (await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    })) as unknown as Buffer
    return parseLogChunk(raw)
  } catch {
    return []
  }
}
