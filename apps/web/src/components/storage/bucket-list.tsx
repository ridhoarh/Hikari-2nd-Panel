import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { BucketRecord } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, CardBody } from '../ui/card'

export function BucketList({ projectId }: { projectId: string }) {
  const [buckets, setBuckets] = useState<BucketRecord[]>([])
  const [nama, setNama] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kredensial, setKredensial] = useState<{
    name: string
    accessKey: string
    secretKey: string
    endpoint: string
  } | null>(null)
  const [minioJalan, setMinioJalan] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<{ buckets: BucketRecord[] }>(
      `/projects/${projectId}/buckets`
    )
    if (res.ok) setBuckets(res.data?.buckets ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function nyalainMinio() {
    setBusy(true)
    setError(null)
    const res = await api.post<{ endpoint: string }>('/storage/start')
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMinioJalan(true)
  }

  async function bikinBucket(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post<{
      bucket: { name: string; access_key: string; secret_key: string }
      endpoint: string
    }>(`/projects/${projectId}/buckets`, { name: nama, isPublic })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setKredensial({
      name: res.data!.bucket.name,
      accessKey: res.data!.bucket.access_key,
      secretKey: res.data!.bucket.secret_key,
      endpoint: res.data!.endpoint,
    })
    setNama('')
    setIsPublic(false)
    await load()
  }

  async function hapus(id: string) {
    await api.del(`/buckets/${id}`)
    await load()
  }

  const inputClass =
    'mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand'

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">MinIO</p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Storage S3-compatible buat file. Volume-nya awet.
              </p>
            </div>
            <Button variant="ghost" onClick={nyalainMinio} disabled={busy}>
              {busy ? 'Nyalain...' : minioJalan ? 'Nyalain ulang' : 'Nyalain MinIO'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <form onSubmit={bikinBucket} className="space-y-3">
            <div>
              <label htmlFor="bname" className="block text-sm font-medium">
                Nama bucket
              </label>
              <input
                id="bname"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="aset"
                className={`${inputClass} font-mono`}
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Buka endpoint S3-nya ke internet
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? 'Membikin...' : 'Bikin bucket'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {kredensial && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium">
              Bucket <span className="font-mono">{kredensial.name}</span> siap
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Kredensial ini <strong>cuma muncul sekali</strong>. Simpen dulu.
            </p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Endpoint</dt>
                <dd className="truncate font-mono">{kredensial.endpoint}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Access key</dt>
                <dd className="truncate font-mono">{kredensial.accessKey}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Secret key</dt>
                <dd className="truncate font-mono">{kredensial.secretKey}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}

      {buckets.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada bucket.</p>
      ) : (
        <div className="space-y-2">
          {buckets.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{b.name}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {b.is_public === 1 ? 'Endpoint publik' : 'Internal'}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => hapus(b.id)}>
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
