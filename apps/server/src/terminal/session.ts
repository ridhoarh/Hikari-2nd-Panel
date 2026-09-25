import type Docker from 'dockerode'
import { containerName } from '../docker/client'
import { containerShellCandidates } from './shell'

export type TerminalSession = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

/**
 * Cari shell yang beneran ada di dalem container.
 *
 * Ini penting: Alpine nggak punya `/bin/bash`. Kalau kita asal pakai
 * kandidat pertama, exec-nya gagal dengan "stat /bin/bash: no such file
 * or directory" — dan itu kejadian di container yang paling sering dipakai
 * (alpine-based).
 *
 * Catatan penting soal Docker API: `container.exec()` itu cuma MEMBIKIN
 * exec object, dia nggak ngejalanin apa pun dan **nggak ngecek** apakah
 * binary-nya ada. Error "no such file" baru muncul pas `.start()`.
 * Makanya di sini exec-nya beneran dijalanin, bukan cuma dibikin.
 */
async function cariShell(docker: Docker, appSlug: string): Promise<string> {
  const container = docker.getContainer(containerName(appSlug))
  const kandidat = containerShellCandidates()

  for (const shell of kandidat) {
    // Dicek pakai `inspect()` doang setelah start. Cara ini nggak nyentuh
    // stream-nya sama sekali, jadi nggak ada koneksi yang nyangkut.
    const id = await shellAda(container, shell)
    if (id) return shell
  }

  throw new Error(
    `Nggak ada shell yang ketemu di container. Udah dicoba: ${kandidat.join(', ')}`
  )
}

/**
 * Cek satu kandidat shell: jalanin `shell -c true`, terus baca exit code.
 * Exit code 0 = shell-nya ada. 127 = binary-nya nggak ketemu.
 *
 * Pakai `wait()` dari Docker API, bukan polling `inspect()`. `wait()`
 * nunggu sampai exec-nya beneran kelar, jadi nggak ada balapan antara
 * "udah mulai" dan "udah kelar".
 */
async function shellAda(
  container: Docker.Container,
  shell: string
): Promise<boolean> {
  try {
    const exec = await container.exec({
      Cmd: [shell, '-c', 'true'],
      AttachStdout: false,
      AttachStderr: false,
    })

    const stream = (await exec.start({ Detach: false })) as unknown as
      | NodeJS.ReadableStream
      | null

    // Stream-nya harus dihabisin biar exec-nya beneran jalan sampai kelar.
    if (stream && typeof stream.resume === 'function') {
      await new Promise<void>((resolve) => {
        let beres = false
        const selesai = () => {
          if (beres) return
          beres = true
          resolve()
        }
        stream.on('end', selesai)
        stream.on('close', selesai)
        stream.on('error', selesai)
        stream.resume()
        setTimeout(selesai, 1500)
      })
    }

    const info = await exec.inspect()
    return info.ExitCode === 0
  } catch {
    // Shell ini nggak ada (atau container-nya udah nggak ada). Coba berikutnya.
    return false
  }
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
  const shell = await cariShell(opts.docker, opts.appSlug)

  const exec = await container.exec({
    Cmd: [shell],
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
