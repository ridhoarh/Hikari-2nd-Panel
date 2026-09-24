type Options = { max: number; windowMs: number }
type Entry = { count: number; resetAt: number }

export function createRateLimiter(opts: Options): (key: string) => boolean {
  const entries = new Map<string, Entry>()

  return function allow(key: string): boolean {
    const now = Date.now()
    const entry = entries.get(key)

    if (!entry || entry.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + opts.windowMs })
      return true
    }

    if (entry.count >= opts.max) return false

    entry.count += 1
    return true
  }
}
