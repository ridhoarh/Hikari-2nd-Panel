/** Build boleh lama, tapi nggak boleh nggantung selamanya. */
export const BATAS_BUILD_MS = 30 * 60 * 1000
export const BATAS_PULL_MS = 10 * 60 * 1000

const BUFFER_MAX = 1024 * 1024
const EKOR_MAX = 16 * 1024

export type RunOptions = {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  onLine?: (line: string) => void
}

/**
 * Jalanin proses tanpa nge-block event loop. `execFileSync` bikin seluruh
 * panel freeze selama build, jadi nggak boleh dipakai di jalur ini.
 *
 * Keluaran digabung stdout+stderr, dibatasi biar log raksasa nggak ngabisin
 * RAM, dan dipotong kalau lewat timeout.
 */
export async function run(
  cmd: string,
  args: string[],
  opts: RunOptions = {}
): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let awal = ''
  let ekor = ''
  let sisaBaris = ''

  function catat(text: string) {
    if (!opts.onLine) return
    sisaBaris += text
    const baris = sisaBaris.split('\n')
    sisaBaris = baris.pop() ?? ''
    for (const b of baris) opts.onLine(b)
  }

  async function baca(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true })
      catat(text)
      ekor += text
      if (ekor.length > BUFFER_MAX) {
        awal += ekor.slice(0, ekor.length - EKOR_MAX)
        awal = awal.slice(-BUFFER_MAX)
        ekor = ekor.slice(-EKOR_MAX)
      }
    }
  }

  const batas = opts.timeoutMs ?? BATAS_BUILD_MS
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill()
      reject(
        new Error(`${cmd} kelamaan, dimatiin setelah ${Math.round(batas / 60000)} menit`)
      )
    }, batas)
  })

  try {
    await Promise.race([
      (async () => {
        await Promise.all([baca(proc.stdout), baca(proc.stderr)])
        const code = await proc.exited
        if (code !== 0) {
          throw new Error(`${cmd} gagal (exit ${code})\n${awal}${ekor}`)
        }
      })(),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }

  return awal + ekor
}

/**
 * Sama kayak `run`, tapi stdin-nya diisi dari string. Dipakai buat restore
 * database: isinya dikirim langsung, nggak perlu ditulis ke disk dulu.
 */
export async function runDenganInput(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs: number
): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], {
    stdin: new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`${cmd} kelamaan`))
    }, timeoutMs)
  })

  try {
    const code = await Promise.race([proc.exited, timeout])
    if (code !== 0) throw new Error(`${cmd} gagal (exit ${code})\n${err}`)
    return out
  } finally {
    if (timer) clearTimeout(timer)
  }
}
