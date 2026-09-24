import { useEffect, useRef } from 'react'

/** Interval minimum. Lebih cepet dari ini bikin panel polling terus. */
export const MIN_INTERVAL_MS = 10_000

export function shouldPoll(opts: { visible: boolean; active: boolean }): boolean {
  return opts.visible && opts.active
}

/**
 * Jalanin callback tiap `intervalMs`, TAPI cuma pas tab-nya kelihatan.
 * Pas tab disembunyiin, interval-nya dimatiin — biar tab yang dibiarin
 * kebuka semalaman nggak nembak Docker API terus.
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  active = true
): void {
  const saved = useRef(callback)
  saved.current = callback

  useEffect(() => {
    if (!active) return

    const jarak = Math.max(intervalMs, MIN_INTERVAL_MS)
    let id: ReturnType<typeof setInterval> | undefined

    function mulai() {
      if (id !== undefined) return
      id = setInterval(() => saved.current(), jarak)
    }

    function stop() {
      if (id === undefined) return
      clearInterval(id)
      id = undefined
    }

    function onVisibility() {
      if (shouldPoll({ visible: document.visibilityState === 'visible', active })) {
        saved.current()
        mulai()
      } else {
        stop()
      }
    }

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [intervalMs, active])
}
