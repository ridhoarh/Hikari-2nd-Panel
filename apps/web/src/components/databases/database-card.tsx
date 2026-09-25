import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { AccessMode, BackupRecord, DbInfo, DbRecord } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, CardBody } from '../ui/card'
import { StatusDot } from '../ui/status-dot'

const ENGINE_LABEL: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  redis: 'Redis',
}

const MODE_LABEL: Record<AccessMode, string> = {
  internal: 'Internal',
  tunnel: 'Tunnel SSH',
  public: 'Public (IP)',
  domain: 'Public (domain)',
}

const MODE_KETERANGAN: Record<AccessMode, string> = {
  internal: 'Cuma bisa diakses app di VPS yang sama.',
  tunnel: 'Nggak ada port yang kebuka. Akses lewat SSH tunnel.',
  public: 'Port kebuka ke internet. Bot bakal nyoba masuk.',
  domain: 'Lewat domain + TLS. Port tetap ada, jadi IP:port masih kebuka.',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DatabaseCard({
  database,
  onChanged,
}: {
  database: DbRecord
  onChanged: () => void
}) {
  const [info, setInfo] = useState<DbInfo | null>(null)
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [buka, setBuka] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [fileRestore, setFileRestore] = useState<File | null>(null)

  // Mode akses yang lagi dipilih di form, plus konfirmasi + domain.
  const [mode, setMode] = useState<AccessMode>(database.access_mode)
  const [domain, setDomain] = useState(database.expose_domain ?? '')
  const [ngertiRisiko, setNgertiRisiko] = useState(false)

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([
      api.get<{ info: DbInfo }>(`/databases/${database.id}`),
      api.get<{ backups: BackupRecord[] }>(`/databases/${database.id}/backups`),
    ])
    if (d.ok) setInfo(d.data?.info ?? null)
    if (b.ok) setBackups(b.data?.backups ?? [])
  }, [database.id])

  useEffect(() => {
    void load()
  }, [load])

  async function act(label: string, path: string, body?: unknown) {
    setBusy(label)
    setError(null)
    setPesan(null)
    const res = body
      ? await api.post(`/databases/${database.id}${path}`, body)
      : await api.post(`/databases/${database.id}${path}`)
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged()
    await load()
  }

  async function simpanMode() {
    setBusy('mode')
    setError(null)
    setPesan(null)

    const res = await api.post<{ info: DbInfo }>(`/databases/${database.id}/access`, {
      mode,
      domain: mode === 'domain' ? domain : null,
      understandRisk: ngertiRisiko,
    })
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setPesan('Mode akses diganti. Container-nya dibikin ulang dengan port baru.')
    setNgertiRisiko(false)
    onChanged()
    await load()
  }

  async function backup() {
    setBusy('backup')
    setError(null)
    setPesan(null)
    const res = await api.post(`/databases/${database.id}/backups`)
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    await load()
  }

  async function hapusDb() {
    setBusy('hapus')
    setError(null)
    const res = await api.del<{ pesan: string }>(`/databases/${database.id}`)
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged()
  }

  async function restore() {
    if (!fileRestore) return
    setBusy('restore')
    setError(null)
    setPesan(null)

    const isi = await fileRestore.text()
    const res = await api.postText<{ pesan: string }>(
      `/databases/${database.id}/restore`,
      isi
    )
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setPesan(res.data?.pesan ?? 'Data-nya udah di-restore.')
    setFileRestore(null)
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{database.name}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-subtle">
              {ENGINE_LABEL[database.engine]} {database.version} · port{' '}
              {database.host_port}
            </p>
          </div>
          <StatusDot status={database.status} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => act('start', '/start')}
            disabled={busy !== null}
          >
            {busy === 'start' ? 'Nyalain...' : 'Nyalain'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => act('stop', '/stop')}
            disabled={busy !== null}
          >
            {busy === 'stop' ? 'Matikan...' : 'Matikan'}
          </Button>
          <Button variant="ghost" onClick={backup} disabled={busy !== null}>
            {busy === 'backup' ? 'Nge-dump...' : 'Backup'}
          </Button>
          <Button variant="ghost" onClick={() => setBuka(!buka)}>
            {buka ? 'Tutup detail' : 'Detail'}
          </Button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {pesan && (
          <p className="mt-3 rounded-card bg-brand-soft px-3 py-2 text-sm text-brand-text">
            {pesan}
          </p>
        )}

        {buka && info && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <div>
              <p className="text-xs font-medium text-ink-muted">Connection string</p>
              <pre className="mt-1 overflow-x-auto rounded-card bg-bg px-3 py-2 font-mono text-xs text-ink-muted">
                {info.connectionString}
              </pre>
            </div>

            {info.tunnelCommand && (
              <div>
                <p className="text-xs font-medium text-ink-muted">
                  Perintah tunnel (jalanin di laptop kamu)
                </p>
                <pre className="mt-1 overflow-x-auto rounded-card bg-bg px-3 py-2 font-mono text-xs text-ink-muted">
                  {info.tunnelCommand}
                </pre>
              </div>
            )}

            {info.warnings.length > 0 && (
              <div className="rounded-card border border-warn/40 bg-warn/10 px-3 py-2">
                {info.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-ink">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* --- Ganti mode akses --- */}
            <div className="border-t border-line pt-4">
              <p className="text-sm font-medium">Mode akses</p>
              <p className="mt-0.5 text-xs text-ink-subtle">{MODE_KETERANGAN[mode]}</p>

              <div className="mt-2 space-y-1.5">
                {(['internal', 'tunnel', 'public', 'domain'] as AccessMode[]).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`mode-${database.id}`}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />
                    {MODE_LABEL[m]}
                  </label>
                ))}
              </div>

              {mode === 'domain' && (
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="db.contoh.com"
                  className="mt-2 w-full rounded-card border border-line px-3 py-2 font-mono text-sm transition-hikari focus:border-brand"
                />
              )}

              {mode === 'public' && database.access_mode !== 'public' && (
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ngertiRisiko}
                    onChange={(e) => setNgertiRisiko(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Aku ngerti risikonya: port-nya kebuka ke internet dan bot
                    bakal nyoba masuk terus-terusan.
                  </span>
                </label>
              )}

              <div className="mt-3">
                <Button
                  onClick={simpanMode}
                  disabled={
                    busy !== null ||
                    (mode === database.access_mode && mode !== 'domain') ||
                    (mode === 'public' &&
                      database.access_mode !== 'public' &&
                      !ngertiRisiko)
                  }
                >
                  {busy === 'mode' ? 'Nyimpen...' : 'Simpan mode'}
                </Button>
              </div>
            </div>

            {/* --- Backup --- */}
            <div className="border-t border-line pt-4">
              <p className="text-sm font-medium">Backup manual</p>
              {database.engine === 'redis' ? (
                <p className="mt-1 text-xs text-ink-subtle">
                  Redis belum didukung backup manual. Datanya tersimpan di volume
                  dan ikut awet.
                </p>
              ) : backups.length === 0 ? (
                <p className="mt-1 text-xs text-ink-subtle">Belum ada backup.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {backups.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-mono text-ink-subtle">{b.filename}</span>
                      <span className="text-ink-muted">{formatSize(b.size_bytes)}</span>
                      <a
                        href={`/api/backups/${b.id}/download`}
                        className="text-brand-text hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {database.engine !== 'redis' && (
                <div className="mt-3">
                  <label
                    htmlFor={`restore-${database.id}`}
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Restore dari file
                  </label>
                  <input
                    id={`restore-${database.id}`}
                    type="file"
                    accept=".sql,text/plain"
                    onChange={(e) => setFileRestore(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-xs"
                  />
                  <p className="mt-1 text-xs text-ink-subtle">
                    Isi file backup bakal dimasukin ke database yang ada sekarang.
                    Tabel yang namanya sama bisa ketimpa.
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="danger"
                      onClick={restore}
                      disabled={busy !== null || !fileRestore}
                    >
                      {busy === 'restore' ? 'Nge-restore...' : 'Restore sekarang'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* --- Hapus --- */}
            <div className="border-t border-line pt-4">
              <p className="text-xs text-ink-subtle">
                Hapus database <strong>nggak</strong> hapus volume{' '}
                <span className="font-mono">{database.volume_name}</span>. Datanya
                tetap ada, dan harus dibersihin manual kalau emang mau dihapus.
              </p>
              <div className="mt-2">
                <Button variant="danger" onClick={hapusDb} disabled={busy !== null}>
                  {busy === 'hapus' ? 'Ngehapus...' : 'Hapus database'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
