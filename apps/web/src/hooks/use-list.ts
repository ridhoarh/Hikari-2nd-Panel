import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * Ambil satu daftar dari API, sekali, dengan state yang seragam.
 *
 * Enam halaman datar (Applications, Databases, Storage, Domains, Backups,
 * Aktivitas) polanya sama: memuat → data / error. Kalau tiap halaman nulis
 * useState + useEffect sendiri, yang kelupaan cuma beda-beda tipis — dan
 * state "loading"-nya gampang salah (misal kelupaan dimatiin pas error,
 * jadi layarnya nyangkut di "Memuat..." selamanya).
 *
 * Kuncinya: pakai `responseKey` buat nyomot array-nya dari body respons.
 */
export function useList<T>(path: string, responseKey: string) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.get<Record<string, T[]>>(path)

    if (!res.ok) {
      // Loading HARUS dimatiin juga di jalur error; kalau nggak, layarnya
      // nyangkut di "Memuat..." padahal requestnya udah kelar.
      setError(res.error)
      setLoading(false)
      return
    }

    setError(null)
    setItems(res.data?.[responseKey] ?? [])
    setLoading(false)
  }, [path, responseKey])

  useEffect(() => {
    void load()
  }, [load])

  return { items, loading, error, reload: load }
}
