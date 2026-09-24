export type JobResult = { ok: true } | { ok: false; error: string }

export type BuildQueue<T> = {
  /**
   * Masukin job ke antrean. Promise-nya kelar pas job INI selesai.
   *
   * Nggak pernah reject — kegagalan job dilaporkan lewat nilai balikan.
   * Alasannya: pemanggilnya (webhook GitHub, endpoint deploy) nggak bisa
   * nunggu hasilnya, jadi rejection-nya cuma jadi unhandled rejection.
   */
  enqueue: (job: T) => Promise<JobResult>
  size: () => number
  isBusy: () => boolean
  /** Nunggu sampai antrean beneran kosong dan nggak ada job jalan. */
  onIdle: () => Promise<void>
}

type Entry<T> = { job: T; lapor: (result: JobResult) => void }

export function createBuildQueue<T>(run: (job: T) => Promise<void>): BuildQueue<T> {
  const waiting: Entry<T>[] = []
  const idleWaiters: (() => void)[] = []
  let busy = false

  function beresJob() {
    if (!busy && waiting.length === 0) {
      for (const resolve of idleWaiters.splice(0)) resolve()
    }
  }

  async function drain(): Promise<void> {
    if (busy) return
    busy = true

    while (waiting.length > 0) {
      const entry = waiting.shift() as Entry<T>
      try {
        await run(entry.job)
        entry.lapor({ ok: true })
      } catch (err) {
        // Job gagal nggak boleh nyetop antrean — lanjut ke job berikutnya.
        const message = err instanceof Error ? err.message : String(err)
        console.error('[hikari] job antrean gagal:', message)
        entry.lapor({ ok: false, error: message })
      }
    }

    busy = false
    beresJob()
  }

  return {
    enqueue(job: T) {
      return new Promise<JobResult>((resolve) => {
        waiting.push({ job, lapor: resolve })
        void drain()
      })
    },
    size: () => waiting.length,
    isBusy: () => busy,
    onIdle: () =>
      new Promise<void>((resolve) => {
        idleWaiters.push(resolve)
        beresJob()
      }),
  }
}
