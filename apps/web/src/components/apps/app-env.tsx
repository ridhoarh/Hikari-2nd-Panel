import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { Card, CardBody } from '../ui/card'

type EnvVar = { key: string; value: string; isSecret: boolean }

export function AppEnv({ appId }: { appId: string }) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<{ envVars: EnvVar[] }>(`/apps/${appId}/env`)
    if (res.ok) setEnvVars(res.data?.envVars ?? [])
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post(`/apps/${appId}/env`, { key, value, isSecret })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setKey('')
    setValue('')
    setIsSecret(false)
    await load()
  }

  async function remove(k: string) {
    await api.del(`/apps/${appId}/env/${k}`)
    await load()
  }

  const inputClass =
    'rounded-card border border-line px-3 py-2 text-sm transition-hikari focus:border-brand'

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form onSubmit={add} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="ekey" className="block text-sm font-medium">
                  Key
                </label>
                <input
                  id="ekey"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="DATABASE_URL"
                  className={`mt-1 w-full font-mono ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label htmlFor="evalue" className="block text-sm font-medium">
                  Nilai
                </label>
                <input
                  id="evalue"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={`mt-1 w-full ${inputClass}`}
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(e) => setIsSecret(e.target.checked)}
              />
              Anggap rahasia (disimpen terenkripsi, nilainya disembunyiin)
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Tambah env var'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {envVars.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada env var.</p>
      ) : (
        <div className="space-y-2">
          {envVars.map((v) => (
            <Card key={v.key}>
              <CardBody>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">{v.key}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-subtle">
                      {v.value}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => remove(v.key)}>
                    Hapus
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
