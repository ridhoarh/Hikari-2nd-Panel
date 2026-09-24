import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import type { Hono } from 'hono'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/**
 * Vite nge-hash nama file aset (`index-D6aJq44q.js`), jadi aman di-cache lama.
 * Yang dicek: ada hash 8+ karakter di akhir nama file, sebelum ekstensinya.
 */
function cacheHeader(filePath: string): string {
  const nama = filePath.slice(filePath.lastIndexOf('/') + 1)
  const tanpaExt = nama.slice(0, nama.lastIndexOf('.'))
  return /-[0-9a-zA-Z_]{8,}$/.test(tanpaExt)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
}

/**
 * Baca file pakai `Bun.file()`, bukan `readFileSync`. Kalau sync, tiap
 * request nurunin seluruh proses Hono.
 */
function serve(filePath: string, contentType: string, cache: string): Response {
  return new Response(Bun.file(filePath), {
    headers: { 'Content-Type': contentType, 'Cache-Control': cache },
  })
}

/**
 * Dipanggil SEBELUM `app.notFound(...)`. Kalau didaftarin setelah notFound,
 * route SPA bakal ketelen sama notFound dan browser dapet JSON 404, bukan
 * index.html.
 */
export function mountStatic(app: Hono, staticDir: string): void {
  const indexPath = join(staticDir, 'index.html')

  app.get('*', (c) => {
    const pathname = c.req.path

    // /api/* yang nyampe sini berarti emang nggak ada route-nya.
    if (pathname.startsWith('/api/')) {
      return c.json({ error: 'Nggak ketemu' }, 404)
    }

    // Cegah path traversal: normalisasi, buang awalan ../ dan garis miring,
    // terus pastiin hasilnya masih di dalem staticDir.
    const bersih = normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
    const filePath = join(staticDir, bersih)

    if (
      (filePath === staticDir || filePath.startsWith(staticDir + sep)) &&
      existsSync(filePath) &&
      statSync(filePath).isFile()
    ) {
      const ext = extname(filePath)
      return serve(
        filePath,
        MIME[ext] ?? 'application/octet-stream',
        cacheHeader(filePath)
      )
    }

    if (existsSync(indexPath)) {
      return serve(indexPath, MIME['.html'], 'no-cache')
    }

    return c.json({ error: 'Frontend belum di-build' }, 404)
  })
}
