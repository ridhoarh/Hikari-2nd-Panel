import type Docker from 'dockerode'
import { containerName } from '../docker/client'
import { containerShellCandidates } from './shell'

export type TerminalSession = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

/**
 * Buka sesi interaktif ke dalam container lewat Docker `exec`.
 *
 * Catatan: ini exec, BUKAN shell di host. Yang bisa dilakuin user cuma
 * sebanyak yang ada di dalem container itu.
 */
export async function openTerminal(opts: {
  docker: Docker
  appSlug: string
  onData: (chunk: string) => void
  onClose: () => void
  cols?: number
  rows?: number
}): Promise<TerminalSession> {
  const container = opts.docker.getContainer(containerName(opts.appSlug))

  const exec = await container.exec({
    Cmd: [containerShellCandidates()[0]],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ['TERM=xterm-256color'],
  })

  const stream = (await exec.start({
    hijack: true,
    stdin: true,
    Tty: true,
  })) as unknown as NodeJS.ReadWriteStream

  const cols = opts.cols ?? 80
  const rows = opts.rows ?? 24
  await exec.resize({ h: rows, w: cols }).catch(() => undefined)

  stream.on('data', (chunk: Buffer) => {
    opts.onData(chunk.toString('utf8'))
  })
  stream.on('end', () => opts.onClose())
  stream.on('close', () => opts.onClose())

  return {
    write: (data) => {
      stream.write(data)
    },
    resize: (w, h) => {
      void exec.resize({ w, h }).catch(() => undefined)
    },
    close: () => {
      try {
        stream.end()
      } catch {
        // stream-nya emang udah ketutup
      }
    },
  }
}
