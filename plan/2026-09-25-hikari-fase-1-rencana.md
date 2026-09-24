# Hikari Fase 1 — Rencana Implementasi

> **Buat yang ngerjain:** WAJIB pakai skill `subagent-driven-development` atau
> `executing-plans` buat ngerjain rencana ini task per task. Centang (`- [ ]`)
> buat nandain progress.
>
> **Baca dulu "Kesepakatan yang Mengikat Semua Task"** di bawah — sepuluh aturan
> itu yang bikin dokumen ini konsisten. Kalau ada langkah yang kelihatan
> bertentangan, yang menang kesepakatannya.

**Tujuan:** Bikin Hikari bisa dipakai buat login, ngatur project & app, deploy app
dari GitHub/Docker Image ke Docker, dan ngasih domain + HTTPS otomatis.

**Pendekatan:** Satu proses Bun + Hono di port 2508 yang ngasih API sekaligus file
statis hasil build Vite. State di SQLite. Ngobrol sama Docker lewat dockerode.
Caddy ngurus HTTPS. Build lewat BuildKit terpisah yang dibatasin RAM.

**Teknologi:** Bun 1.4+, Hono, Vite, React, TanStack Router, Tailwind,
komponen UI ditulis sendiri, SQLite (bun:sqlite), dockerode, Caddy, BuildKit, Zod

**Rancangan:** `plan/2026-09-24-hikari-design.md` — baca dua-duanya.

---

## Aturan yang Nggak Boleh Dilanggar

- **Bun 1.4 ke atas.** Node nggak dipakai sama sekali.
- **Port panel 2508.** Jangan diganti.
- **Semua container WAJIB punya memory limit.** Default 512MB.
- **BuildKit dibatasin 768MB,** dan cuma satu build jalan sekaligus.
- **Nggak ada proses background yang nyala terus.** Metrik, log, statistik diambil
  pas diminta. Nggak ada cron, nggak ada daemon tambahan.
- **Frontend SPA.** Nggak pakai SSR. Nggak pakai TanStack Start.
- **Default tampilan terang.** Dark mode disiapin tapi bukan default.
- **Warna:** netral + aksen light blue buat brand. Status pakai warna sendiri
  (hijau/kuning/merah/abu). Jangan campur.
- **Semua waktu UTC ISO-8601.** ID pakai ULID.
- **Hapus project nggak hapus volume Docker.** Harus konfirmasi terpisah.
- **Kalau build gagal, container lama tetap jalan.** Jangan pernah matiin app
  gara-gara deploy gagal.
- **Test dulu, kode belakangan.** Tiap task mulai dari test yang gagal.

## Kesepakatan yang Mengikat Semua Task

Sepuluh keputusan di bawah ini berlaku buat **semua** task. Kalau ada langkah di
bawah yang kelihatannya bertentangan, yang menang adalah kesepakatan ini.

1. **`app.ts` punya satu bentuk final.** Task 1–23 nggak boleh nyentuh `app.ts`
   sama sekali. Bentuk finalnya baru ditulis lengkap di **Task 36**, dan task
   sesudahnya cuma boleh nambah baris, bukan ngeganti isi file. Nggak ada lagi
   "Ganti `apps/server/src/app.ts` jadi:" — itu sumber kekacauan.
2. **Router dipasang sekali.** Tiap file route punya satu fungsi `create*Routes`
   yang nerima satu objek `deps` (bukan argumen posisional), biar nambah field
   nggak bikin signature berubah.
3. **Build asynchronous.** Nggak boleh `execFileSync` di jalur build/deploy.
   Semua proses git/docker/railpack pakai `Bun.spawn`, dengan timeout, dan
   log-nya ngalir ke file. Alasan: proses sinkron bikin seluruh panel freeze.
4. **Frontend dikirim async.** Nggak boleh `readFileSync` di handler route.
   Pakai `Bun.file()`. Ada `Cache-Control` buat file ber-hash.
5. **Auto-refresh cuma saat tab kelihatan.** Semua `setInterval` di frontend
   wajib lewat hook `useVisibleInterval`, dan cuma jalan kalau
   `document.visibilityState === 'visible'`. Interval minimum 10 detik.
6. **Env var bukan rahasia ditampilin apa adanya.** Yang `is_secret` dikasih
   `MASK`, yang biasa didekripsi dan dikirim nilainya.
7. **Nama variabel enkripsi selalu `cryptoKey`.** Jangan pernah pakai `key` buat
   Buffer kunci, biar nggak ketuker sama nama key env var.
8. **`packages/shared` nggak dipakai.** Workspace cuma `apps/*`. Tipe frontend
   hidup di `apps/web/src/lib/types.ts`.
9. **Komponen UI ditulis sendiri.** Bukan shadcn/ui. Nggak ada `components.json`,
   nggak ada CLI. Semua ada di `apps/web/src/components/ui/`.
10. **Tiap task ditutup dengan `bun run typecheck` di root.** Kalau typecheck
    merah, task-nya belum kelar — jangan lanjut ke task berikutnya.

## Yang Perlu Diawasi Lebih

Lima hal yang paling mungkin bikin masalah tapi nggak ketangkep tes biasa. Tiap
poin di bawah udah ada tesnya di task yang bersangkutan:

1. **Deploy gagal setelah container lama dimatiin** → app mati total. Test: build
   gagal, pastiin container lama masih `running`.
2. **Container tanpa memory limit** → satu app bocor RAM bisa matiin VPS. Test:
   bikin container tanpa limit, harusnya ditolak atau dikasih default 512MB.
3. **Hapus project ikut hapus volume** → data hilang. Test: hapus project yang
   punya app + volume, volume harus tetap ada.
4. **Webhook dengan signature salah tetap diproses** → orang bisa trigger deploy.
   Test: kirim signature ngawur, harusnya 401 dan nggak bikin deployment.
5. **Nama app nabrak** → dua app punya slug sama, container bentrok. Test: bikin
   dua app dengan nama sama di project beda, slug harus unik.

---

# BAGIAN 1 — FONDASI

## Task 1: Setup Repo & Tooling

**File:**
- Create: `package.json`, `bunfig.toml`, `.gitignore`, `tsconfig.json`, `README.md`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`

**Antarmuka:**
- Menghasilkan: workspace Bun yang `bun install` jalan dari root, `bun test` jalan,
  `bun run dev` nyalain dua app

- [ ] **Step 1: Bikin `package.json` root**

```json
{
  "name": "hikari",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "build": "bun run --filter web build",
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Bikin `.gitignore`**

```
node_modules/
dist/
*.log
.env
.env.local
/var/
*.sqlite
*.sqlite-journal
```

- [ ] **Step 3: Bikin `tsconfig.json` root**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Bikin `apps/server/package.json`**

```json
{
  "name": "@hikari/server",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "zod": "^3.23.0",
    "dockerode": "^4.0.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@types/dockerode": "^3.3.0",
    "bun-types": "latest"
  }
}
```

- [ ] **Step 5: Bikin `apps/web/package.json`**

```json
{
  "name": "@hikari/web",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-router": "^1.80.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 6: Install & verifikasi**

Run: `bun install`
Expected: selesai tanpa error, `node_modules` muncul

- [ ] **Step 7: Commit**

```bash
git add .
GIT_EDITOR=true git commit -m "chore: setup monorepo skeleton"
```

---

## Task 2: Database & Migrasi

**File:**
- Create: `apps/server/src/db/client.ts`
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/migrate.ts`
- Create: `apps/server/src/db/client.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `openDatabase(path: string): Database` — buka SQLite, aktifin WAL + foreign keys
  - `runMigrations(db: Database): void` — bikin semua tabel kalau belum ada
  - `Database` = tipe dari `bun:sqlite`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/db/client.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { openDatabase } from './client'
import { runMigrations } from './migrate'

describe('database', () => {
  test('bikin semua tabel yang dibutuhin', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)

    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const tables = rows.map((r) => r.name)

    expect(tables).toContain('settings')
    expect(tables).toContain('users')
    expect(tables).toContain('projects')
    expect(tables).toContain('apps')
    expect(tables).toContain('env_vars')
    expect(tables).toContain('deployments')
    expect(tables).toContain('domains')
    expect(tables).toContain('webhook_deliveries')
  })

  test('foreign key aktif', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    const row = db.query('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
  })

  test('jalanin migrasi dua kali nggak error', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/db/client.test.ts`
Expected: FAIL — "Cannot find module './client'"

- [ ] **Step 3: Bikin `apps/server/src/db/client.ts`**

```typescript
import { Database } from 'bun:sqlite'

export { Database }

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}
```

- [ ] **Step 4: Bikin `apps/server/src/db/schema.ts`**

```typescript
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apps (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  source_type     TEXT NOT NULL CHECK (source_type IN ('github','giturl','image')),
  repo_url        TEXT,
  branch          TEXT,
  build_strategy  TEXT NOT NULL DEFAULT 'dockerfile'
                  CHECK (build_strategy IN ('dockerfile','railpack')),
  dockerfile_path TEXT NOT NULL DEFAULT 'Dockerfile',
  root_dir        TEXT NOT NULL DEFAULT '.',
  image_ref       TEXT,
  container_port  INTEGER NOT NULL,
  memory_limit_mb INTEGER NOT NULL DEFAULT 512,
  cpu_limit       REAL NOT NULL DEFAULT 1.0,
  status          TEXT NOT NULL DEFAULT 'stopped'
                  CHECK (status IN ('stopped','building','running','failed')),
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_project ON apps(project_id);

CREATE TABLE IF NOT EXISTS env_vars (
  id        TEXT PRIMARY KEY,
  app_id    TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  UNIQUE(app_id, key)
);

CREATE TABLE IF NOT EXISTS deployments (
  id             TEXT PRIMARY KEY,
  app_id         TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','building','deploying','success','failed')),
  commit_sha     TEXT,
  commit_message TEXT,
  image_tag      TEXT,
  build_log_path TEXT,
  started_at     TEXT,
  finished_at    TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deployments_app ON deployments(app_id, created_at DESC);

CREATE TABLE IF NOT EXISTS domains (
  id         TEXT PRIMARY KEY,
  app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  hostname   TEXT NOT NULL UNIQUE,
  tls_status TEXT NOT NULL DEFAULT 'pending'
             CHECK (tls_status IN ('pending','active','failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          TEXT PRIMARY KEY,
  app_id      TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL,
  event       TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'received'
);
`
```

- [ ] **Step 5: Bikin `apps/server/src/db/migrate.ts`**

```typescript
import type { Database } from './client'
import { SCHEMA_SQL } from './schema'

export function runMigrations(db: Database): void {
  db.exec(SCHEMA_SQL)
}
```

- [ ] **Step 6: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/db/client.test.ts`
Expected: PASS — 3 tes lolos

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
GIT_EDITOR=true git commit -m "feat(db): sqlite client and schema migrations"
```

---

## Task 3: ULID & Helper Waktu

**File:**
- Create: `apps/server/src/lib/id.ts`
- Create: `apps/server/src/lib/id.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `newId(): string` — ULID baru
  - `nowIso(): string` — waktu sekarang UTC ISO-8601
  - `slugify(input: string): string` — ubah nama jadi slug yang aman buat nama container

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/lib/id.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { newId, nowIso, slugify } from './id'

describe('newId', () => {
  test('bikin 26 karakter', () => {
    expect(newId()).toHaveLength(26)
  })

  test('urut naik secara leksikografis', () => {
    const a = newId()
    const b = newId()
    expect(a < b).toBe(true)
  })
})

describe('nowIso', () => {
  test('format ISO-8601 UTC dengan Z di akhir', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('slugify', () => {
  test('huruf kecil dan tanda hubung', () => {
    expect(slugify('Blog API')).toBe('blog-api')
  })

  test('buang karakter yang nggak aman buat nama container', () => {
    expect(slugify('my_app!! @2024')).toBe('my-app-2024')
  })

  test('teks panjang dipotong jadi 32 karakter', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(32)
  })

  test('teks kosong setelah dibersihin jadi "app"', () => {
    expect(slugify('!!!')).toBe('app')
  })

  test('nggak mulai atau berakhir dengan tanda hubung', () => {
    expect(slugify('--hello--')).toBe('hello')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/lib/id.test.ts`
Expected: FAIL — "Cannot find module './id'"

- [ ] **Step 3: Bikin `apps/server/src/lib/id.ts`**

```typescript
import { ulid } from 'ulid'

export function newId(): string {
  return ulid()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')

  return slug.length > 0 ? slug : 'app'
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/lib/id.test.ts`
Expected: PASS — 8 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib
GIT_EDITOR=true git commit -m "feat(lib): ulid, iso time, and slug helpers"
```

---

## Task 4: Enkripsi Kredensial

**File:**
- Create: `apps/server/src/lib/crypto.ts`
- Create: `apps/server/src/lib/crypto.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `generateKey(): Buffer` — kunci 32 byte acak
  - `encrypt(plain: string, key: Buffer): string` — hasil format `v1:<iv-hex>:<tag-hex>:<cipher-hex>`
  - `decrypt(payload: string, key: Buffer): string`
  - `loadOrCreateKey(path: string): Buffer` — baca kunci dari file, bikin kalau belum ada

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/lib/crypto.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decrypt, encrypt, generateKey, loadOrCreateKey } from './crypto'

describe('enkripsi', () => {
  const key = generateKey()

  test('bolak-balik ngasih hasil yang sama', () => {
    const asli = 'postgresql://user:rahasia123@localhost:5432/db'
    expect(decrypt(encrypt(asli, key), key)).toBe(asli)
  })

  test('hasil enkripsi beda tiap kali (IV acak)', () => {
    const a = encrypt('sama', key)
    const b = encrypt('sama', key)
    expect(a).not.toBe(b)
  })

  test('formatnya v1:iv:tag:cipher', () => {
    const parts = encrypt('x', key).split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
  })

  test('kunci salah bikin gagal, bukan ngasih teks ngawur', () => {
    const payload = encrypt('rahasia', key)
    const kunciLain = generateKey()
    expect(() => decrypt(payload, kunciLain)).toThrow()
  })

  test('payload rusak bikin gagal', () => {
    expect(() => decrypt('nggak-valid', key)).toThrow()
  })

  test('teks kosong tetep bisa dibalikin', () => {
    expect(decrypt(encrypt('', key), key)).toBe('')
  })
})

describe('loadOrCreateKey', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hikari-key-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('bikin file kunci baru kalau belum ada', () => {
    const path = join(dir, 'secret.key')
    const key = loadOrCreateKey(path)
    expect(key).toHaveLength(32)
    expect(existsSync(path)).toBe(true)
  })

  test('file kunci izinnya cuma buat pemilik (0600)', () => {
    const path = join(dir, 'secret.key')
    loadOrCreateKey(path)
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('baca kunci yang udah ada, bukan bikin baru', () => {
    const path = join(dir, 'secret.key')
    const first = loadOrCreateKey(path)
    const second = loadOrCreateKey(path)
    expect(second.equals(first)).toBe(true)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/lib/crypto.test.ts`
Expected: FAIL — "Cannot find module './crypto'"

- [ ] **Step 3: Bikin `apps/server/src/lib/crypto.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

export function generateKey(): Buffer {
  return randomBytes(32)
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Format payload terenkripsi nggak dikenali')
  }
  const [, ivHex, tagHex, dataHex] = parts
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function loadOrCreateKey(path: string): Buffer {
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim()
    const key = Buffer.from(raw, 'hex')
    if (key.length !== 32) {
      throw new Error(`Kunci di ${path} rusak (harus 32 byte)`)
    }
    return key
  }

  const key = generateKey()
  writeFileSync(path, key.toString('hex'), { mode: 0o600 })
  return key
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/lib/crypto.test.ts`
Expected: PASS — 9 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/crypto.ts apps/server/src/lib/crypto.test.ts
GIT_EDITOR=true git commit -m "feat(lib): aes-256-gcm credential encryption"
```

---

## Task 5: Password Hashing

**File:**
- Create: `apps/server/src/lib/password.ts`
- Create: `apps/server/src/lib/password.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `hashPassword(plain: string): Promise<string>` — pakai Bun.password argon2id
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `checkPasswordStrength(plain: string): { ok: boolean; reason?: string }`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/lib/password.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { checkPasswordStrength, hashPassword, verifyPassword } from './password'

describe('password', () => {
  test('hash beda dari teks aslinya', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(hash).not.toBe('rahasiaBgt123')
    expect(hash.length).toBeGreaterThan(20)
  })

  test('verify true buat password yang bener', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(await verifyPassword('rahasiaBgt123', hash)).toBe(true)
  })

  test('verify false buat password yang salah', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(await verifyPassword('salah', hash)).toBe(false)
  })

  test('hash sama password beda hasil (salt beda)', async () => {
    const a = await hashPassword('sama')
    const b = await hashPassword('sama')
    expect(a).not.toBe(b)
  })
})

describe('checkPasswordStrength', () => {
  test('nolak password di bawah 12 karakter', () => {
    const r = checkPasswordStrength('pendek')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('12')
  })

  test('terima password 12 karakter', () => {
    expect(checkPasswordStrength('duabelaschar').ok).toBe(true)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/lib/password.test.ts`
Expected: FAIL — "Cannot find module './password'"

- [ ] **Step 3: Bikin `apps/server/src/lib/password.ts`**

```typescript
const MIN_LENGTH = 12

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash)
  } catch {
    return false
  }
}

export function checkPasswordStrength(plain: string): { ok: boolean; reason?: string } {
  if (plain.length < MIN_LENGTH) {
    return { ok: false, reason: `Password minimal ${MIN_LENGTH} karakter` }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/lib/password.test.ts`
Expected: PASS — 6 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/password.ts apps/server/src/lib/password.test.ts
GIT_EDITOR=true git commit -m "feat(lib): argon2id password hashing"
```

---

## Task 6: Kerangka Hono + Health Check

**File:**
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/app.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `createApp(config: AppConfig): Hono` — bikin app tanpa nyalain server
  - `AppConfig` = `{ dbPath, keyPath, port }`
  - `GET /api/health` → `{ status: 'ok', version: string }`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/app.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { createApp } from './app'

function testApp() {
  return createApp({ dbPath: ':memory:', keyPath: '/tmp/hikari-test.key', port: 2508 })
}

describe('GET /api/health', () => {
  test('balikin status ok', async () => {
    const app = testApp()
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { status: string; version: string }
    expect(body.status).toBe('ok')
    expect(typeof body.version).toBe('string')
  })
})

describe('route yang nggak ada', () => {
  test('balikin 404 dalam bentuk JSON', async () => {
    const app = testApp()
    const res = await app.request('/api/nggak-ada')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBeDefined()
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/app.test.ts`
Expected: FAIL — "Cannot find module './app'"

- [ ] **Step 3: Bikin `apps/server/src/app.ts`**

```typescript
import { Hono } from 'hono'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'

export const HIKARI_VERSION = '0.1.0'

/**
 * Versi ditaruh di file sendiri biar `settings.ts` bisa makai tanpa ngimpor
 * `app.ts` — impor muter kayak gitu bikin bundler bingung.
 */

export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
}

export function createApp(config: AppConfig): Hono {
  const db = openDatabase(config.dbPath)
  runMigrations(db)

  const app = new Hono()

  app.get('/api/health', (c) => c.json({ status: 'ok', version: HIKARI_VERSION }))

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
```

- [ ] **Step 4: Bikin `apps/server/src/index.ts`**

```typescript
import { createApp } from './app'

const PORT = Number(process.env.HIKARI_PORT ?? 2508)
const DB_PATH = process.env.HIKARI_DB ?? '/var/lib/hikari/hikari.sqlite'
const KEY_PATH = process.env.HIKARI_KEY ?? '/var/lib/hikari/secret.key'

const app = createApp({ dbPath: DB_PATH, keyPath: KEY_PATH, port: PORT })

console.log(`[hikari] jalan di http://0.0.0.0:${PORT}`)

export default { port: PORT, fetch: app.fetch }
```

- [ ] **Step 5: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/app.test.ts`
Expected: PASS — 2 tes lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/index.ts apps/server/src/app.test.ts
GIT_EDITOR=true git commit -m "feat(server): hono app skeleton with health check"
```

---

## Task 7: Session & Cookie

**File:**
- Create: `apps/server/src/lib/session.ts`
- Create: `apps/server/src/lib/session.test.ts`

**Antarmuka:**
- Menghasilkan:
  - `createSession(userId: string, key: Buffer): string` — token bertanda tangan
  - `verifySession(token: string, key: Buffer): { userId: string } | null`
  - `SESSION_COOKIE = 'hikari_session'`
  - `cookieOptions(secure: boolean)` — opsi cookie HttpOnly + SameSite=Lax

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/lib/session.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { createSession, verifySession, generateSessionKey } from './session'

describe('session', () => {
  const key = generateSessionKey()

  test('token yang bener bisa diverifikasi', () => {
    const token = createSession('user-1', key)
    const result = verifySession(token, key)
    expect(result?.userId).toBe('user-1')
  })

  test('token yang diutak-atik ditolak', () => {
    const token = createSession('user-1', key)
    const rusak = token.slice(0, -2) + 'xx'
    expect(verifySession(rusak, key)).toBeNull()
  })

  test('token dari kunci lain ditolak', () => {
    const token = createSession('user-1', key)
    const kunciLain = generateSessionKey()
    expect(verifySession(token, kunciLain)).toBeNull()
  })

  test('token ngawur ditolak, bukan error', () => {
    expect(verifySession('nggak-valid', key)).toBeNull()
  })

  test('token kosong ditolak', () => {
    expect(verifySession('', key)).toBeNull()
  })

  test('token punya masa berlaku', () => {
    const token = createSession('user-1', key)
    const result = verifySession(token, key)
    expect(result).not.toBeNull()
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/lib/session.test.ts`
Expected: FAIL — "Cannot find module './session'"

- [ ] **Step 3: Bikin `apps/server/src/lib/session.ts`**

```typescript
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'hikari_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function generateSessionKey(): Buffer {
  return randomBytes(32)
}

type Payload = { userId: string; exp: number }

function sign(data: string, key: Buffer): string {
  return createHmac('sha256', key).update(data).digest('base64url')
}

export function createSession(userId: string, key: Buffer): string {
  const payload: Payload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, key)}`
}

export function verifySession(token: string, key: Buffer): { userId: string } | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [body, signature] = parts
  const expected = sign(body, key)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload
    if (!payload.userId || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/lib/session.test.ts`
Expected: PASS — 6 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/session.ts apps/server/src/lib/session.test.ts
GIT_EDITOR=true git commit -m "feat(lib): signed session tokens"
```

---

## Task 8: Endpoint Setup Awal & Login

**File:**
- Create: `apps/server/src/routes/auth.ts`
- Create: `apps/server/src/repositories/users.ts`
- Create: `apps/server/src/routes/auth.test.ts`
- Modify: `apps/server/src/app.ts`

**Antarmuka:**
- **Konsumsi:** `hashPassword`, `verifyPassword`, `createSession`, `verifySession`,
  `newId`, `nowIso`, `openDatabase`
- **Menghasilkan:**
  - `GET /api/setup/status` → `{ needsSetup: boolean }`
  - `POST /api/setup` body `{ username, password }` → `{ ok: true }` (cuma kalau belum ada user)
  - `POST /api/auth/login` body `{ username, password }` → set cookie, `{ ok: true }`
  - `POST /api/auth/logout` → hapus cookie
  - `GET /api/auth/me` → `{ username }` atau 401
  - `createAuthRoutes(db, cryptoKey): Hono`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/routes/auth.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { createApp } from '../app'

function app() {
  return createApp({ dbPath: ':memory:', keyPath: '/tmp/hikari-auth-test.key', port: 2508 })
}

async function setup(app: ReturnType<typeof createApp>, username = 'admin', password = 'passwordkuat123') {
  return app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

describe('GET /api/setup/status', () => {
  test('needsSetup true kalau belum ada user', async () => {
    const res = await app().request('/api/setup/status')
    const body = (await res.json()) as { needsSetup: boolean }
    expect(body.needsSetup).toBe(true)
  })
})

describe('POST /api/setup', () => {
  test('bikin user admin pertama', async () => {
    const a = app()
    const res = await setup(a)
    expect(res.status).toBe(201)

    const status = await a.request('/api/setup/status')
    expect(((await status.json()) as { needsSetup: boolean }).needsSetup).toBe(false)
  })

  test('nolak setup kedua kalinya', async () => {
    const a = app()
    await setup(a)
    const res = await setup(a, 'admin2', 'passwordkuat456')
    expect(res.status).toBe(409)
  })

  test('nolak password yang kekecilan', async () => {
    const res = await setup(app(), 'admin', 'pendek')
    expect(res.status).toBe(400)
  })

  test('nolak username kosong', async () => {
    const a = app()
    const res = await a.request('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  test('login bener ngasih cookie', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('hikari_session')
  })

  test('password salah ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'salahbgt12345' }),
    })
    expect(res.status).toBe(401)
  })

  test('username nggak ada ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hantu', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  test('401 kalau nggak ada cookie', async () => {
    const res = await app().request('/api/auth/me')
    expect(res.status).toBe(401)
  })

  test('balikin username kalau udah login', async () => {
    const a = app()
    await setup(a)
    const login = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })

    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const res = await a.request('/api/auth/me', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { username: string }).username).toBe('admin')
  })

  test('cookie yang diutak-atik ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/me', {
      headers: { Cookie: 'hikari_session=nggak.valid' },
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/routes/auth.test.ts`
Expected: FAIL — endpoint setup belum ada (404)

- [ ] **Step 3: Bikin `apps/server/src/repositories/users.ts`**

```typescript
import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export type User = {
  id: string
  username: string
  password_hash: string
  created_at: string
}

export function countUsers(db: Database): number {
  const row = db.query('SELECT COUNT(*) as n FROM users').get() as { n: number }
  return row.n
}

export function findUserByUsername(db: Database, username: string): User | null {
  return db.query('SELECT * FROM users WHERE username = ?').get(username) as User | null
}

export function findUserById(db: Database, id: string): User | null {
  return db.query('SELECT * FROM users WHERE id = ?').get(id) as User | null
}

export function createUser(db: Database, username: string, passwordHash: string): User {
  const user: User = {
    id: newId(),
    username,
    password_hash: passwordHash,
    created_at: nowIso(),
  }
  db.query(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(user.id, user.username, user.password_hash, user.created_at)
  return user
}
```

- [ ] **Step 4: Bikin `apps/server/src/routes/auth.ts`**

```typescript
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { Database } from '../db/client'
import { checkPasswordStrength, hashPassword, verifyPassword } from '../lib/password'
import { cookieOptions, createSession, SESSION_COOKIE, verifySession } from '../lib/session'
import {
  countUsers,
  createUser,
  findUserById,
  findUserByUsername,
} from '../repositories/users'

const setupSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export function createAuthRoutes(db: Database, cryptoKey: Buffer): Hono {
  const router = new Hono()

  router.get('/setup/status', (c) => {
    return c.json({ needsSetup: countUsers(db) === 0 })
  })

  router.post('/setup', async (c) => {
    if (countUsers(db) > 0) {
      return c.json({ error: 'Setup udah pernah dilakuin' }, 409)
    }

    const parsed = setupSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Username dan password wajib diisi' }, 400)
    }

    const strength = checkPasswordStrength(parsed.data.password)
    if (!strength.ok) {
      return c.json({ error: strength.reason }, 400)
    }

    const hash = await hashPassword(parsed.data.password)
    createUser(db, parsed.data.username, hash)
    return c.json({ ok: true }, 201)
  })

  router.post('/auth/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Username dan password wajib diisi' }, 400)
    }

    const user = findUserByUsername(db, parsed.data.username)
    if (!user) {
      return c.json({ error: 'Username atau password salah' }, 401)
    }

    const cocok = await verifyPassword(parsed.data.password, user.password_hash)
    if (!cocok) {
      return c.json({ error: 'Username atau password salah' }, 401)
    }

    const token = createSession(user.id, cryptoKey)
    setCookie(c, SESSION_COOKIE, token, cookieOptions(false))
    return c.json({ ok: true })
  })

  router.post('/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  router.get('/auth/me', (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return c.json({ error: 'Belum login' }, 401)

    const session = verifySession(token, cryptoKey)
    if (!session) return c.json({ error: 'Session nggak valid' }, 401)

    const user = findUserById(db, session.userId)
    if (!user) return c.json({ error: 'Belum login' }, 401)

    return c.json({ username: user.username })
  })

  return router
}
```

- [ ] **Step 5: Jalanin semua tes**

Jangan nyentuh `app.ts` dulu. Bentuk finalnya baru ditulis sekali di Task 36.

Run: `cd apps/server && bun test`
Expected: PASS — semua tes lolos, termasuk yang lama

- [ ] **Step 6: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(auth): first-run setup, login, and route guards"
```

---

## Task 8b: Kerangka Routes + Wiring `app.ts`

**File:**
- Create: `apps/server/src/middleware/auth.ts`
- Create: `apps/server/src/middleware/rate-limit.ts`
- Create: `apps/server/src/middleware/rate-limit.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/auth.ts`

**Antarmuka:**
- **Konsumsi:** `verifySession`, `findUserById`
- **Menghasilkan:**
  - `requireAuth(db, cryptoKey)` — middleware Hono, nolak 401 kalau nggak login
  - `createRateLimiter(opts: { max: number; windowMs: number }): (key: string) => boolean`
  - Login dibatasi 5 percobaan per menit per IP

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/middleware/rate-limit.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  test('ngizinin sampai batasnya', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(true)
  })

  test('nolak setelah lewat batas', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 })
    limiter('ip-1')
    limiter('ip-1')
    expect(limiter('ip-1')).toBe(false)
  })

  test('kunci beda punya hitungan sendiri', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-2')).toBe(true)
    expect(limiter('ip-1')).toBe(false)
  })

  test('hitungan reset setelah jendela waktunya lewat', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 50 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(limiter('ip-1')).toBe(true)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/middleware/rate-limit.test.ts`
Expected: FAIL — "Cannot find module './rate-limit'"

- [ ] **Step 3: Bikin `apps/server/src/middleware/rate-limit.ts`**

```typescript
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
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/middleware/rate-limit.test.ts`
Expected: PASS — 4 tes lolos

- [ ] **Step 5: Bikin `apps/server/src/middleware/auth.ts`**

```typescript
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Database } from '../db/client'
import { SESSION_COOKIE, verifySession } from '../lib/session'
import { findUserById } from '../repositories/users'

export type AuthVariables = { username: string; userId: string }

export function requireAuth(db: Database, cryptoKey: Buffer) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return c.json({ error: 'Belum login' }, 401)

    const session = verifySession(token, cryptoKey)
    if (!session) return c.json({ error: 'Session nggak valid' }, 401)

    const user = findUserById(db, session.userId)
    if (!user) return c.json({ error: 'Belum login' }, 401)

    c.set('userId', user.id)
    c.set('username', user.username)
    await next()
  })
}
```

- [ ] **Step 6: Tambah batas login ke `routes/auth.ts`**

Ganti fungsi `createAuthRoutes` jadi nerima limiter:

```typescript
export function createAuthRoutes(
  db: Database,
  cryptoKey: Buffer,
  loginLimiter = createRateLimiter({ max: 5, windowMs: 60_000 })
): Hono {
```

Terus di dalam `router.post('/auth/login', ...)`, tambahin di paling atas handler:

```typescript
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown'

    if (!loginLimiter(ip)) {
      return c.json({ error: 'Kebanyakan percobaan login. Coba lagi nanti.' }, 429)
    }
```

Import `createRateLimiter` di atas file:

```typescript
import { createRateLimiter } from '../middleware/rate-limit'
```

- [ ] **Step 7: Tambah tes rate limit di `routes/auth.test.ts`**

Tambahin blok describe baru:

```typescript
describe('batas percobaan login', () => {
  test('nolak setelah 5 percobaan gagal', async () => {
    const a = app()
    await setup(a)

    for (let i = 0; i < 5; i++) {
      await a.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ username: 'admin', password: 'salahbanget123' }),
      })
    }

    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(429)
  })

  test('IP lain nggak kena batas', async () => {
    const a = app()
    await setup(a)

    for (let i = 0; i < 6; i++) {
      await a.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ username: 'admin', password: 'salahbanget123' }),
      })
    }

    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 8: Jalanin semua tes**

Run: `cd apps/server && bun test`
Expected: PASS — semua tes lolos

- [ ] **Step 9: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(auth): requireAuth middleware and login rate limiting"
```

---

## Task 10: Repository Project

**File:**
- Create: `apps/server/src/repositories/projects.ts`
- Create: `apps/server/src/repositories/projects.test.ts`

**Antarmuka:**
- **Konsumsi:** `newId`, `nowIso`, `slugify`
- **Menghasilkan:**
  - `type Project = { id, name, slug, description, created_at }`
  - `listProjects(db): Project[]`
  - `getProject(db, id): Project | null`
  - `createProject(db, { name, description }): Project` — slug dibikin otomatis & unik
  - `updateProject(db, id, { name, description }): Project | null`
  - `deleteProject(db, id): boolean`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/repositories/projects.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
})

describe('createProject', () => {
  test('bikin project dengan slug dari nama', () => {
    const p = createProject(db, { name: 'Blog Saya' })
    expect(p.slug).toBe('blog-saya')
    expect(p.name).toBe('Blog Saya')
  })

  test('slug unik walau namanya sama', () => {
    const a = createProject(db, { name: 'Blog' })
    const b = createProject(db, { name: 'Blog' })
    expect(a.slug).not.toBe(b.slug)
    expect(b.slug).toBe('blog-2')
  })

  test('slug unik sampai tiga kali', () => {
    createProject(db, { name: 'Blog' })
    createProject(db, { name: 'Blog' })
    const c = createProject(db, { name: 'Blog' })
    expect(c.slug).toBe('blog-3')
  })

  test('deskripsi opsional', () => {
    const p = createProject(db, { name: 'Tanpa Deskripsi' })
    expect(p.description).toBeNull()
  })
})

describe('listProjects', () => {
  test('kosong di awal', () => {
    expect(listProjects(db)).toEqual([])
  })

  test('balikin yang terbaru duluan', () => {
    createProject(db, { name: 'Pertama' })
    createProject(db, { name: 'Kedua' })
    const list = listProjects(db)
    expect(list[0].name).toBe('Kedua')
  })
})

describe('updateProject', () => {
  test('ganti nama', () => {
    const p = createProject(db, { name: 'Lama' })
    const updated = updateProject(db, p.id, { name: 'Baru' })
    expect(updated?.name).toBe('Baru')
    expect(updated?.slug).toBe('lama')
  })

  test('balikin null kalau id nggak ada', () => {
    expect(updateProject(db, 'nggak-ada', { name: 'X' })).toBeNull()
  })
})

describe('deleteProject', () => {
  test('hapus project yang ada', () => {
    const p = createProject(db, { name: 'Hapus Aku' })
    expect(deleteProject(db, p.id)).toBe(true)
    expect(getProject(db, p.id)).toBeNull()
  })

  test('balikin false kalau id nggak ada', () => {
    expect(deleteProject(db, 'nggak-ada')).toBe(false)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/repositories/projects.test.ts`
Expected: FAIL — "Cannot find module './projects'"

- [ ] **Step 3: Bikin `apps/server/src/repositories/projects.ts`**

```typescript
import type { Database } from '../db/client'
import { newId, nowIso, slugify } from '../lib/id'

export type Project = {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
}

function uniqueSlug(db: Database, name: string): string {
  const base = slugify(name)
  let candidate = base
  let n = 2

  while (db.query('SELECT 1 FROM projects WHERE slug = ?').get(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }

  return candidate
}

export function listProjects(db: Database): Project[] {
  return db
    .query('SELECT * FROM projects ORDER BY created_at DESC')
    .all() as Project[]
}

export function getProject(db: Database, id: string): Project | null {
  return db.query('SELECT * FROM projects WHERE id = ?').get(id) as Project | null
}

export function createProject(
  db: Database,
  input: { name: string; description?: string | null }
): Project {
  const project: Project = {
    id: newId(),
    name: input.name,
    slug: uniqueSlug(db, input.name),
    description: input.description ?? null,
    created_at: nowIso(),
  }

  db.query(
    'INSERT INTO projects (id, name, slug, description, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    project.id,
    project.name,
    project.slug,
    project.description,
    project.created_at
  )

  return project
}

export function updateProject(
  db: Database,
  id: string,
  input: { name?: string; description?: string | null }
): Project | null {
  const existing = getProject(db, id)
  if (!existing) return null

  const name = input.name ?? existing.name
  const description =
    input.description === undefined ? existing.description : input.description

  db.query('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
    name,
    description,
    id
  )

  return getProject(db, id)
}

export function deleteProject(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/repositories/projects.test.ts`
Expected: PASS — 11 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/repositories/projects.ts apps/server/src/repositories/projects.test.ts
GIT_EDITOR=true git commit -m "feat(projects): project repository with unique slugs"
```

---

## Task 11: Endpoint Project

**File:**
- Create: `apps/server/src/routes/projects.ts`
- Create: `apps/server/src/routes/projects.test.ts`
- Modify: `apps/server/src/app.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `GET /api/projects` → `{ projects: Project[] }`
  - `POST /api/projects` body `{ name, description? }` → `{ project }` status 201
  - `GET /api/projects/:id` → `{ project }`
  - `PATCH /api/projects/:id` → `{ project }`
  - `DELETE /api/projects/:id` → `{ ok: true }`
  - Semua endpoint butuh login

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/routes/projects.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string

beforeEach(async () => {
  app = createApp({
    dbPath: ':memory:',
    keyPath: '/tmp/hikari-projects-test.key',
    port: 2508,
  })

  await app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })
  cookie = login.headers.get('set-cookie')!.split(';')[0]
})

const auth = () => ({ Cookie: cookie, 'Content-Type': 'application/json' })

describe('proteksi login', () => {
  test('GET tanpa login 401', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(401)
  })

  test('POST tanpa login 401', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/projects', () => {
  test('kosong di awal', async () => {
    const res = await app.request('/api/projects', { headers: auth() })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { projects: unknown[] }).projects).toEqual([])
  })
})

describe('POST /api/projects', () => {
  test('bikin project', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Blog' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { project: { name: string; slug: string } }
    expect(body.project.name).toBe('Blog')
    expect(body.project.slug).toBe('blog')
  })

  test('nolak nama kosong', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })

  test('nama kepanjangan ditolak', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'a'.repeat(101) }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects/:id', () => {
  test('balikin 404 kalau nggak ada', async () => {
    const res = await app.request('/api/projects/nggak-ada', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  test('hapus project', async () => {
    const created = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Hapus' }),
    })
    const { project } = (await created.json()) as { project: { id: string } }

    const res = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)

    const get = await app.request(`/api/projects/${project.id}`, { headers: auth() })
    expect(get.status).toBe(404)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/routes/projects.test.ts`
Expected: FAIL — endpoint projects belum ada

- [ ] **Step 3: Bikin `apps/server/src/routes/projects.ts`**

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../repositories/projects'

const upsertSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
})

export function createProjectRoutes(db: Database): Hono {
  const router = new Hono()

  router.get('/projects', (c) => {
    return c.json({ projects: listProjects(db) })
  })

  router.post('/projects', async (c) => {
    const parsed = upsertSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Nama project wajib diisi, maksimal 100 karakter' }, 400)
    }
    return c.json({ project: createProject(db, parsed.data) }, 201)
  })

  router.get('/projects/:id', (c) => {
    const project = getProject(db, c.req.param('id'))
    if (!project) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ project })
  })

  router.patch('/projects/:id', async (c) => {
    const parsed = upsertSchema.partial().safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Data yang dikirim nggak valid' }, 400)
    }

    const project = updateProject(db, c.req.param('id'), parsed.data)
    if (!project) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ project })
  })

  router.delete('/projects/:id', (c) => {
    const ok = deleteProject(db, c.req.param('id'))
    if (!ok) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 4: Jalanin semua tes**

Jangan nyentuh `app.ts` dulu — nanti di Task 36.

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(projects): CRUD endpoints behind auth"
```

---

# BAGIAN 2 — DOCKER

## Task 12: Client Docker + Cek Koneksi

**File:**
- Create: `apps/server/src/docker/client.ts`
- Create: `apps/server/src/docker/client.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `getDocker(): Docker` — bikin instance dockerode dari `/var/run/docker.sock`
  - `pingDocker(docker): Promise<boolean>`
  - `containerName(appSlug: string): string` — `hikari-app-<slug>`
  - `imageTag(appSlug: string, deploymentId: string): string` — `hikari-<slug>:<id>`
  - `networkName(): string` — `hikari`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/docker/client.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { containerName, imageTag, networkName } from './client'

describe('penamaan Docker', () => {
  test('nama container pakai prefix hikari-app-', () => {
    expect(containerName('blog')).toBe('hikari-app-blog')
  })

  test('tag image pakai prefix hikari-', () => {
    expect(imageTag('blog', '01HXYZ')).toBe('hikari-blog:01HXYZ')
  })

  test('nama network konsisten', () => {
    expect(networkName()).toBe('hikari')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/client.test.ts`
Expected: FAIL — "Cannot find module './client'"

- [ ] **Step 3: Bikin `apps/server/src/docker/client.ts`**

```typescript
import Docker from 'dockerode'

let instance: Docker | null = null

export function getDocker(): Docker {
  if (!instance) {
    instance = new Docker({ socketPath: '/var/run/docker.sock' })
  }
  return instance
}

export async function pingDocker(docker: Docker = getDocker()): Promise<boolean> {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}

export function containerName(appSlug: string): string {
  return `hikari-app-${appSlug}`
}

export function imageTag(appSlug: string, deploymentId: string): string {
  return `hikari-${appSlug}:${deploymentId}`
}

export function networkName(): string {
  return 'hikari'
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/client.test.ts`
Expected: PASS — 3 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/docker
GIT_EDITOR=true git commit -m "feat(docker): client and naming helpers"
```

---

## Task 13: Bikin & Jalanin Container

**File:**
- Create: `apps/server/src/docker/containers.ts`
- Create: `apps/server/src/docker/containers.test.ts`

**Antarmuka:**
- **Konsumsi:** `getDocker`, `containerName`
- **Menghasilkan:**
  - `type RunOptions = { appSlug, image, containerPort, env, memoryLimitMb, cpuLimit, network, labels? }`
  - `buildContainerConfig(opts: RunOptions): Docker.ContainerCreateOptions` — fungsi murni, bisa dites tanpa Docker
  - `runContainer(opts): Promise<string>` — balikin container id
  - `stopContainer(docker, appSlug): Promise<void>`
  - `removeContainer(docker, appSlug): Promise<void>`
  - `inspectContainer(docker, appSlug): Promise<{ running: boolean; startedAt?: string } | null>`

**Aturan penting:** `buildContainerConfig` **wajib** masang `Memory` dan `NanoCpus`.
Kalau `memoryLimitMb` nggak dikasih atau nol, pakai 512.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/docker/containers.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { buildContainerConfig } from './containers'

const base = {
  appSlug: 'blog',
  image: 'hikari-blog:01HXYZ',
  containerPort: 3000,
  env: { NODE_ENV: 'production' },
  memoryLimitMb: 512,
  cpuLimit: 1.0,
  network: 'hikari',
}

describe('buildContainerConfig', () => {
  test('pakai nama container dari slug', () => {
    expect(buildContainerConfig(base).name).toBe('hikari-app-blog')
  })

  test('set memory limit dalam byte', () => {
    expect(buildContainerConfig(base).HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('set CPU limit dalam nanocpus', () => {
    expect(buildContainerConfig(base).HostConfig?.NanoCpus).toBe(1_000_000_000)
  })

  test('memory limit nol diganti jadi default 512MB', () => {
    const cfg = buildContainerConfig({ ...base, memoryLimitMb: 0 })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('memory limit negatif diganti jadi default', () => {
    const cfg = buildContainerConfig({ ...base, memoryLimitMb: -100 })
    expect(cfg.HostConfig?.Memory).toBe(512 * 1024 * 1024)
  })

  test('port cuma di-bind ke localhost, bukan 0.0.0.0', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.HostConfig?.PortBindings?.['3000/tcp']).toEqual([
      { HostIp: '127.0.0.1', HostPort: '' },
    ])
  })

  test('env diteruskan dalam format KEY=VALUE', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.Env).toContain('NODE_ENV=production')
  })

  test('pakai network yang diminta', () => {
    expect(buildContainerConfig(base).HostConfig?.NetworkMode).toBe('hikari')
  })

  test('container TIDAK dihapus otomatis (dibersihin manual oleh Hikari)', () => {
    expect(buildContainerConfig(base).HostConfig?.AutoRemove).toBe(false)
  })

  test('restart policy unless-stopped', () => {
    expect(buildContainerConfig(base).HostConfig?.RestartPolicy?.Name).toBe('unless-stopped')
  })

  test('label hikari kepasang biar gampang difilter', () => {
    const cfg = buildContainerConfig(base)
    expect(cfg.Labels?.['hikari.managed']).toBe('true')
    expect(cfg.Labels?.['hikari.app']).toBe('blog')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/containers.test.ts`
Expected: FAIL — "Cannot find module './containers'"

- [ ] **Step 3: Bikin `apps/server/src/docker/containers.ts`**

```typescript
import type Docker from 'dockerode'
import { containerName, getDocker } from './client'

export const DEFAULT_MEMORY_MB = 512

export type RunOptions = {
  appSlug: string
  image: string
  containerPort: number
  env: Record<string, string>
  memoryLimitMb: number
  cpuLimit: number
  network: string
  labels?: Record<string, string>
}

export function buildContainerConfig(opts: RunOptions): Docker.ContainerCreateOptions {
  const memoryMb =
    Number.isFinite(opts.memoryLimitMb) && opts.memoryLimitMb > 0
      ? opts.memoryLimitMb
      : DEFAULT_MEMORY_MB

  const cpuNano = Math.round(
    (Number.isFinite(opts.cpuLimit) && opts.cpuLimit > 0 ? opts.cpuLimit : 1) * 1_000_000_000
  )

  return {
    name: containerName(opts.appSlug),
    Image: opts.image,
    Env: Object.entries(opts.env).map(([k, v]) => `${k}=${v}`),
    Labels: { 'hikari.managed': 'true', 'hikari.app': opts.appSlug, ...opts.labels },
    ExposedPorts: { [`${opts.containerPort}/tcp`]: {} },
    HostConfig: {
      Memory: memoryMb * 1024 * 1024,
      MemorySwap: memoryMb * 1024 * 1024,
      NanoCpus: cpuNano,
      NetworkMode: opts.network,
      AutoRemove: false,
      RestartPolicy: { Name: 'unless-stopped' },
      PortBindings: {
        [`${opts.containerPort}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],
      },
    },
  }
}

export async function runContainer(
  opts: RunOptions,
  docker: Docker = getDocker()
): Promise<string> {
  await removeContainer(docker, opts.appSlug).catch(() => undefined)
  const container = await docker.createContainer(buildContainerConfig(opts))
  await container.start()
  return container.id
}

export async function stopContainer(
  docker: Docker,
  appSlug: string
): Promise<void> {
  try {
    await docker.getContainer(containerName(appSlug)).stop({ t: 10 })
  } catch {
    // container emang udah mati atau nggak ada
  }
}

export async function removeContainer(
  docker: Docker,
  appSlug: string
): Promise<void> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    await container.stop({ t: 5 }).catch(() => undefined)
    await container.remove({ force: true, v: false })
  } catch {
    // nggak ada container, nggak apa-apa
  }
}

export async function inspectContainer(
  docker: Docker,
  appSlug: string
): Promise<{ running: boolean; startedAt?: string } | null> {
  try {
    const info = await docker.getContainer(containerName(appSlug)).inspect()
    return { running: info.State.Running, startedAt: info.State.StartedAt }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/containers.test.ts`
Expected: PASS — 11 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/docker/containers.ts apps/server/src/docker/containers.test.ts
GIT_EDITOR=true git commit -m "feat(docker): container config builder and lifecycle"
```

---

## Task 14: Statistik Container (On-Demand)

**File:**
- Create: `apps/server/src/docker/stats.ts`
- Create: `apps/server/src/docker/stats.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `type ContainerStats = { cpuPercent: number; memoryUsedMb: number; memoryLimitMb: number; memoryPercent: number }`
  - `parseStats(raw): ContainerStats` — fungsi murni
  - `getContainerStats(docker, appSlug): Promise<ContainerStats | null>` — pakai `stream: false`, diambil sekali, nggak nyimpen riwayat

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/docker/stats.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { parseStats } from './stats'

const raw = {
  cpu_stats: {
    cpu_usage: { total_usage: 2_000_000_000 },
    system_cpu_usage: 10_000_000_000,
    online_cpus: 2,
  },
  precpu_stats: {
    cpu_usage: { total_usage: 1_000_000_000 },
    system_cpu_usage: 8_000_000_000,
  },
  memory_stats: {
    usage: 200 * 1024 * 1024,
    limit: 512 * 1024 * 1024,
  },
}

describe('parseStats', () => {
  test('hitung persen CPU', () => {
    // delta cpu = 1e9, delta system = 2e9, 2 core -> 1e9/2e9*2*100 = 100
    expect(parseStats(raw).cpuPercent).toBe(100)
  })

  test('hitung memori terpakai dalam MB', () => {
    expect(parseStats(raw).memoryUsedMb).toBe(200)
  })

  test('hitung memori limit dalam MB', () => {
    expect(parseStats(raw).memoryLimitMb).toBe(512)
  })

  test('hitung persen memori', () => {
    expect(parseStats(raw).memoryPercent).toBeCloseTo(39.06, 1)
  })

  test('nggak error kalau delta system nol', () => {
    const nol = {
      ...raw,
      precpu_stats: { ...raw.precpu_stats, system_cpu_usage: 10_000_000_000 },
    }
    expect(parseStats(nol).cpuPercent).toBe(0)
  })

  test('nggak error kalau memory limit nol', () => {
    const nol = { ...raw, memory_stats: { usage: 100, limit: 0 } }
    const hasil = parseStats(nol)
    // Harus angka 0, bukan NaN atau Infinity.
    expect(hasil.memoryPercent).toBe(0)
    expect(Number.isFinite(hasil.memoryPercent)).toBe(true)
    expect(Number.isFinite(hasil.memoryUsedMb)).toBe(true)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/stats.test.ts`
Expected: FAIL — "Cannot find module './stats'"

- [ ] **Step 3: Bikin `apps/server/src/docker/stats.ts`**

```typescript
import type Docker from 'dockerode'
import { containerName } from './client'

export type ContainerStats = {
  cpuPercent: number
  memoryUsedMb: number
  memoryLimitMb: number
  memoryPercent: number
}

type RawStats = {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
    online_cpus?: number
  }
  precpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
  }
  memory_stats?: { usage?: number; limit?: number }
}

const MB = 1024 * 1024

export function parseStats(raw: RawStats): ContainerStats {
  const cpuDelta =
    (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (raw.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0)
  const cores = raw.cpu_stats?.online_cpus ?? 1

  const cpuPercent =
    systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cores * 100 : 0

  const usage = raw.memory_stats?.usage ?? 0
  const limit = raw.memory_stats?.limit ?? 0

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsedMb: Math.round((usage / MB) * 100) / 100,
    memoryLimitMb: Math.round((limit / MB) * 100) / 100,
    memoryPercent: limit > 0 ? Math.round((usage / limit) * 10000) / 100 : 0,
  }
}

export async function getContainerStats(
  docker: Docker,
  appSlug: string
): Promise<ContainerStats | null> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    const info = await container.inspect()
    if (!info.State.Running) return null

    const raw = (await container.stats({ stream: false })) as RawStats
    return parseStats(raw)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/stats.test.ts`
Expected: PASS — 6 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/docker/stats.ts apps/server/src/docker/stats.test.ts
GIT_EDITOR=true git commit -m "feat(docker): on-demand container stats"
```

---

## Task 15: Aliran Log Container

**File:**
- Create: `apps/server/src/docker/logs.ts`
- Create: `apps/server/src/docker/logs.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `type LogLine = { stream: 'stdout' | 'stderr'; text: string }`
  - `parseLogChunk(raw: Buffer | string): LogLine[]` — handle header 8 byte dari Docker multiplex
  - `getLogs(docker, appSlug, tail): Promise<LogLine[]>`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/docker/logs.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { parseLogChunk } from './logs'

function dockerFrame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header[0] = stream
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

describe('parseLogChunk', () => {
  test('baca satu baris stdout', () => {
    const lines = parseLogChunk(dockerFrame(1, 'halo dunia\n'))
    expect(lines).toHaveLength(1)
    expect(lines[0].stream).toBe('stdout')
    expect(lines[0].text).toBe('halo dunia')
  })

  test('baca baris stderr', () => {
    const lines = parseLogChunk(dockerFrame(2, 'ada error\n'))
    expect(lines[0].stream).toBe('stderr')
  })

  test('baca beberapa frame sekaligus', () => {
    const raw = Buffer.concat([dockerFrame(1, 'satu\n'), dockerFrame(1, 'dua\n')])
    const lines = parseLogChunk(raw)
    expect(lines).toHaveLength(2)
    expect(lines[1].text).toBe('dua')
  })

  test('buang baris kosong', () => {
    const lines = parseLogChunk(dockerFrame(1, '\n\n'))
    expect(lines).toHaveLength(0)
  })

  test('teks tanpa header tetep kebaca (mode TTY)', () => {
    const lines = parseLogChunk('baris polos\n')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('baris polos')
  })

  test('data kosong balikin array kosong', () => {
    expect(parseLogChunk(Buffer.alloc(0))).toEqual([])
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/logs.test.ts`
Expected: FAIL — "Cannot find module './logs'"

- [ ] **Step 3: Bikin `apps/server/src/docker/logs.ts`**

```typescript
import type Docker from 'dockerode'
import { containerName } from './client'

export type LogLine = { stream: 'stdout' | 'stderr'; text: string }

export function parseLogChunk(raw: Buffer | string): LogLine[] {
  const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw
  const lines: LogLine[] = []

  let offset = 0
  let looksMultiplexed = buf.length >= 8 && (buf[0] === 0 || buf[0] === 1 || buf[0] === 2)

  if (!looksMultiplexed) {
    return buf
      .toString('utf8')
      .split('\n')
      .map((t) => t.trimEnd())
      .filter((t) => t.length > 0)
      .map((text) => ({ stream: 'stdout' as const, text }))
  }

  while (offset + 8 <= buf.length) {
    const streamByte = buf[offset]
    const size = buf.readUInt32BE(offset + 4)

    if (offset + 8 + size > buf.length) break

    const text = buf.subarray(offset + 8, offset + 8 + size).toString('utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd()
      if (trimmed.length > 0) {
        lines.push({ stream: streamByte === 2 ? 'stderr' : 'stdout', text: trimmed })
      }
    }
    offset += 8 + size
  }

  return lines
}

export async function getLogs(
  docker: Docker,
  appSlug: string,
  tail = 200
): Promise<LogLine[]> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    const raw = (await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    })) as unknown as Buffer
    return parseLogChunk(raw)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/logs.test.ts`
Expected: PASS — 6 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/docker/logs.ts apps/server/src/docker/logs.test.ts
GIT_EDITOR=true git commit -m "feat(docker): container log parsing and fetch"
```

---

## Task 16: Network & Pembersihan

**File:**
- Create: `apps/server/src/docker/maintenance.ts`
- Create: `apps/server/src/docker/maintenance.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `ensureNetwork(docker): Promise<void>` — bikin network `hikari` kalau belum ada
  - `pruneImages(docker): Promise<{ deleted: number }>`
  - `selectImagesToKeep(tags: string[], keep = 2): string[]` — fungsi murni, balikin yang harus dihapus
  - `pruneOldDeployments(db, appId, keep): number` — hapus baris deployment lama (nggak hapus app)

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/docker/maintenance.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { selectImagesToKeep } from './maintenance'

describe('selectImagesToKeep', () => {
  test('pertahankan dua yang terbaru, sisanya dihapus', () => {
    const tags = ['a:3', 'a:2', 'a:1']
    expect(selectImagesToKeep(tags, 2)).toEqual(['a:1'])
  })

  test('nggak hapus apa-apa kalau cuma dua', () => {
    expect(selectImagesToKeep(['a:2', 'a:1'], 2)).toEqual([])
  })

  test('nggak hapus apa-apa kalau cuma satu', () => {
    expect(selectImagesToKeep(['a:1'], 2)).toEqual([])
  })

  test('daftar kosong balikin kosong', () => {
    expect(selectImagesToKeep([], 2)).toEqual([])
  })

  test('keep=1 pertahankan cuma yang terbaru', () => {
    expect(selectImagesToKeep(['a:3', 'a:2', 'a:1'], 1)).toEqual(['a:2', 'a:1'])
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/maintenance.test.ts`
Expected: FAIL — "Cannot find module './maintenance'"

- [ ] **Step 3: Bikin `apps/server/src/docker/maintenance.ts`**

```typescript
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import { networkName } from './client'

export function selectImagesToKeep(tags: string[], keep = 2): string[] {
  if (tags.length <= keep) return []
  return tags.slice(keep)
}

export async function ensureNetwork(docker: Docker): Promise<void> {
  const name = networkName()
  const networks = await docker.listNetworks({ filters: { name: [name] } })
  if (networks.some((n) => n.Name === name)) return
  await docker.createNetwork({ Name: name, Driver: 'bridge' })
}

export async function pruneImages(docker: Docker): Promise<{ deleted: number }> {
  const result = await docker.pruneImages({ filters: { dangling: { true: true } } })
  const deleted = Array.isArray(result.ImagesDeleted) ? result.ImagesDeleted.length : 0
  return { deleted }
}

export function pruneOldDeployments(db: Database, appId: string, keep = 50): number {
  const rows = db
    .query(
      'SELECT id FROM deployments WHERE app_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?'
    )
    .all(appId, keep) as { id: string }[]

  for (const row of rows) {
    db.query('DELETE FROM deployments WHERE id = ?').run(row.id)
  }

  return rows.length
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/maintenance.test.ts`
Expected: PASS — 5 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/docker/maintenance.ts apps/server/src/docker/maintenance.test.ts
GIT_EDITOR=true git commit -m "feat(docker): network setup and image pruning"
```

---

## Task 17: Repository App

**File:**
- Create: `apps/server/src/repositories/apps.ts`
- Create: `apps/server/src/repositories/apps.test.ts`

**Antarmuka:**
- **Konsumsi:** `newId`, `nowIso`, `slugify`
- **Menghasilkan:**
  - `type App = { ... }` — sesuai skema
  - `listApps(db, projectId?): App[]`
  - `getApp(db, id): App | null`
  - `getAppBySlug(db, slug): App | null`
  - `createApp(db, input): App` — slug unik global
  - `updateApp(db, id, input): App | null`
  - `setAppStatus(db, id, status): void`
  - `deleteApp(db, id): boolean`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/repositories/apps.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject, deleteProject } from './projects'
import {
  createApp,
  deleteApp,
  getApp,
  getAppBySlug,
  listApps,
  setAppStatus,
  updateApp,
} from './apps'

let db: Database
let projectId: string
let projectId2: string

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  projectId = createProject(db, { name: 'Blog' }).id
  projectId2 = createProject(db, { name: 'Lain' }).id
})

const githubInput = {
  projectId: '',
  name: 'Web',
  sourceType: 'github' as const,
  repoUrl: 'git@github.com:user/repo.git',
  branch: 'main',
  containerPort: 3000,
}

describe('createApp', () => {
  test('bikin app dengan slug unik dalam project', () => {
    const a = createApp(db, { ...githubInput, projectId })
    expect(a.slug).toBe('web')
    expect(a.containerPort).toBe(3000)
    expect(a.memoryLimitMb).toBe(512)
    expect(a.status).toBe('stopped')
  })

  test('slug unik global walau beda project', () => {
    const a = createApp(db, { ...githubInput, projectId })
    const b = createApp(db, { ...githubInput, projectId: projectId2 })
    expect(a.slug).not.toBe(b.slug)
    expect(b.slug).toBe('web-2')
  })

  test('app docker image nggak butuh repo url', () => {
    const a = createApp(db, {
      projectId,
      name: 'Redis',
      sourceType: 'image',
      imageRef: 'redis:7-alpine',
      containerPort: 6379,
    })
    expect(a.imageRef).toBe('redis:7-alpine')
    expect(a.repoUrl).toBeNull()
  })

  test('memory limit bisa dikustom', () => {
    const a = createApp(db, { ...githubInput, projectId, memoryLimitMb: 1024 })
    expect(a.memoryLimitMb).toBe(1024)
  })
})

describe('getAppBySlug', () => {
  test('nemu app lewat slug', () => {
    createApp(db, { ...githubInput, projectId })
    expect(getAppBySlug(db, 'web')?.name).toBe('Web')
  })

  test('balikin null kalau slug nggak ada', () => {
    expect(getAppBySlug(db, 'hantu')).toBeNull()
  })
})

describe('listApps', () => {
  test('difilter per project', () => {
    createApp(db, { ...githubInput, projectId })
    createApp(db, { ...githubInput, projectId: projectId2 })
    expect(listApps(db, projectId)).toHaveLength(1)
  })

  test('tanpa filter balikin semua', () => {
    createApp(db, { ...githubInput, projectId })
    createApp(db, { ...githubInput, projectId: projectId2 })
    expect(listApps(db)).toHaveLength(2)
  })
})

describe('updateApp', () => {
  test('ganti port dan memory limit', () => {
    const a = createApp(db, { ...githubInput, projectId })
    const updated = updateApp(db, a.id, { containerPort: 8080, memoryLimitMb: 256 })
    expect(updated?.containerPort).toBe(8080)
    expect(updated?.memoryLimitMb).toBe(256)
    expect(updated?.slug).toBe('web')
  })
})

describe('setAppStatus', () => {
  test('ubah status', () => {
    const a = createApp(db, { ...githubInput, projectId })
    setAppStatus(db, a.id, 'running')
    expect(getApp(db, a.id)?.status).toBe('running')
  })
})

describe('deleteApp', () => {
  test('hapus app', () => {
    const a = createApp(db, { ...githubInput, projectId })
    expect(deleteApp(db, a.id)).toBe(true)
    expect(getApp(db, a.id)).toBeNull()
  })

  test('hapus project ikut hapus app di dalamnya', () => {
    const a = createApp(db, { ...githubInput, projectId })
    deleteProject(db, projectId)
    expect(getApp(db, a.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/repositories/apps.test.ts`
Expected: FAIL — "Cannot find module './apps'"

- [ ] **Step 3: Bikin `apps/server/src/repositories/apps.ts`**

```typescript
import type { Database } from '../db/client'
import { newId, nowIso, slugify } from '../lib/id'

export type AppStatus = 'stopped' | 'building' | 'running' | 'failed'
export type SourceType = 'github' | 'giturl' | 'image'
export type BuildStrategy = 'dockerfile' | 'railpack'

export type App = {
  id: string
  project_id: string
  name: string
  slug: string
  source_type: SourceType
  repo_url: string | null
  branch: string | null
  build_strategy: BuildStrategy
  dockerfile_path: string
  root_dir: string
  image_ref: string | null
  container_port: number
  memory_limit_mb: number
  cpu_limit: number
  status: AppStatus
  created_at: string
}

export type CreateAppInput = {
  projectId: string
  name: string
  sourceType: SourceType
  repoUrl?: string | null
  branch?: string | null
  buildStrategy?: BuildStrategy
  dockerfilePath?: string
  rootDir?: string
  imageRef?: string | null
  containerPort: number
  memoryLimitMb?: number
  cpuLimit?: number
}

function uniqueSlug(db: Database, name: string): string {
  const base = slugify(name)
  let candidate = base
  let n = 2
  while (db.query('SELECT 1 FROM apps WHERE slug = ?').get(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

export function listApps(db: Database, projectId?: string): App[] {
  if (projectId) {
    return db
      .query('SELECT * FROM apps WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as App[]
  }
  return db.query('SELECT * FROM apps ORDER BY created_at DESC').all() as App[]
}

export function getApp(db: Database, id: string): App | null {
  return db.query('SELECT * FROM apps WHERE id = ?').get(id) as App | null
}

export function getAppBySlug(db: Database, slug: string): App | null {
  return db.query('SELECT * FROM apps WHERE slug = ?').get(slug) as App | null
}

export function createApp(db: Database, input: CreateAppInput): App {
  const app: App = {
    id: newId(),
    project_id: input.projectId,
    name: input.name,
    slug: uniqueSlug(db, input.name),
    source_type: input.sourceType,
    repo_url: input.repoUrl ?? null,
    branch: input.branch ?? (input.sourceType === 'image' ? null : 'main'),
    build_strategy: input.buildStrategy ?? 'dockerfile',
    dockerfile_path: input.dockerfilePath ?? 'Dockerfile',
    root_dir: input.rootDir ?? '.',
    image_ref: input.imageRef ?? null,
    container_port: input.containerPort,
    memory_limit_mb: input.memoryLimitMb ?? 512,
    cpu_limit: input.cpuLimit ?? 1.0,
    status: 'stopped',
    created_at: nowIso(),
  }

  db.query(
    `INSERT INTO apps (
      id, project_id, name, slug, source_type, repo_url, branch,
      build_strategy, dockerfile_path, root_dir, image_ref,
      container_port, memory_limit_mb, cpu_limit, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    app.id,
    app.project_id,
    app.name,
    app.slug,
    app.source_type,
    app.repo_url,
    app.branch,
    app.build_strategy,
    app.dockerfile_path,
    app.root_dir,
    app.image_ref,
    app.container_port,
    app.memory_limit_mb,
    app.cpu_limit,
    app.status,
    app.created_at
  )

  return app
}

export function updateApp(
  db: Database,
  id: string,
  input: Partial<Omit<CreateAppInput, 'projectId' | 'sourceType'>>
): App | null {
  const existing = getApp(db, id)
  if (!existing) return null

  db.query(
    `UPDATE apps SET
      name = ?, repo_url = ?, branch = ?, build_strategy = ?,
      dockerfile_path = ?, root_dir = ?, image_ref = ?,
      container_port = ?, memory_limit_mb = ?, cpu_limit = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.repoUrl === undefined ? existing.repo_url : input.repoUrl,
    input.branch === undefined ? existing.branch : input.branch,
    input.buildStrategy ?? existing.build_strategy,
    input.dockerfilePath ?? existing.dockerfile_path,
    input.rootDir ?? existing.root_dir,
    input.imageRef === undefined ? existing.image_ref : input.imageRef,
    input.containerPort ?? existing.container_port,
    input.memoryLimitMb ?? existing.memory_limit_mb,
    input.cpuLimit ?? existing.cpu_limit,
    id
  )

  return getApp(db, id)
}

export function setAppStatus(db: Database, id: string, status: AppStatus): void {
  db.query('UPDATE apps SET status = ? WHERE id = ?').run(status, id)
}

export function deleteApp(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM apps WHERE id = ?').run(id)
  return result.changes > 0
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/repositories/apps.test.ts`
Expected: PASS — 12 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/repositories/apps.ts apps/server/src/repositories/apps.test.ts
GIT_EDITOR=true git commit -m "feat(apps): app repository with globally unique slugs"
```

---

## Task 18: Repository Env Var & Deployment

**File:**
- Create: `apps/server/src/repositories/env-vars.ts`
- Create: `apps/server/src/repositories/deployments.ts`
- Create: `apps/server/src/repositories/env-vars.test.ts`

**Antarmuka:**
- **Menghasilkan (env-vars):**
  - `listEnvVars(db, appId): EnvVar[]` — value terenkripsi
  - `setEnvVar(db, appId, key, value, isSecret, keyBuf): void`
  - `deleteEnvVar(db, appId, key): boolean`
  - `resolveEnvVars(db, appId, keyBuf): Record<string, string>` — didekripsi, siap dipakai Docker
- **Menghasilkan (deployments):**
  - `createDeployment(db, appId): Deployment`
  - `setDeploymentStatus(db, id, status, patch?): void`
  - `listDeployments(db, appId, limit): Deployment[]`
  - `getDeployment(db, id): Deployment | null`
  - `buildLogPath(logDir, deploymentId): string`
  - `appendBuildLog(logDir, deploymentId, line): void`
  - `readBuildLog(logDir, deploymentId): string`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/repositories/env-vars.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { generateKey } from '../lib/crypto'
import { createProject } from './projects'
import { createApp } from './apps'
import { deleteEnvVar, listEnvVars, resolveEnvVars, setEnvVar } from './env-vars'

let db: Database
let appId: string
const key = generateKey()

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  const projectId = createProject(db, { name: 'Blog' }).id
  appId = createApp(db, {
    projectId,
    name: 'Web',
    sourceType: 'github',
    containerPort: 3000,
  }).id
})

describe('setEnvVar', () => {
  test('simpan env var biasa', () => {
    setEnvVar(db, appId, 'NODE_ENV', 'production', false, key)
    const vars = listEnvVars(db, appId)
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('NODE_ENV')
    expect(vars[0].is_secret).toBe(0)
  })

  test('nilai rahasia disimpen terenkripsi, bukan teks asli', () => {
    setEnvVar(db, appId, 'DB_PASSWORD', 'superrahasia', true, key)
    const stored = db
      .query('SELECT value FROM env_vars WHERE key = ?')
      .get('DB_PASSWORD') as { value: string }
    expect(stored.value).not.toContain('superrahasia')
    expect(stored.value.startsWith('v1:')).toBe(true)
  })

  test('set ulang key yang sama menimpa nilainya', () => {
    setEnvVar(db, appId, 'FOO', 'satu', false, key)
    setEnvVar(db, appId, 'FOO', 'dua', false, key)
    expect(listEnvVars(db, appId)).toHaveLength(1)
    expect(resolveEnvVars(db, appId, key).FOO).toBe('dua')
  })
})

describe('resolveEnvVars', () => {
  test('balikin nilai yang udah didekripsi', () => {
    setEnvVar(db, appId, 'PLAIN', 'biasa', false, key)
    setEnvVar(db, appId, 'SECRET', 'rahasia123', true, key)
    const resolved = resolveEnvVars(db, appId, key)
    expect(resolved.PLAIN).toBe('biasa')
    expect(resolved.SECRET).toBe('rahasia123')
  })

  test('kosong kalau belum ada env var', () => {
    expect(resolveEnvVars(db, appId, key)).toEqual({})
  })

  test('kunci salah bikin error, bukan nilai ngawur', () => {
    setEnvVar(db, appId, 'SECRET', 'rahasia123', true, key)
    const kunciLain = generateKey()
    expect(() => resolveEnvVars(db, appId, kunciLain)).toThrow()
  })
})

describe('deleteEnvVar', () => {
  test('hapus env var', () => {
    setEnvVar(db, appId, 'FOO', 'bar', false, key)
    expect(deleteEnvVar(db, appId, 'FOO')).toBe(true)
    expect(listEnvVars(db, appId)).toHaveLength(0)
  })

  test('balikin false kalau nggak ada', () => {
    expect(deleteEnvVar(db, appId, 'HANTU')).toBe(false)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/repositories/env-vars.test.ts`
Expected: FAIL — "Cannot find module './env-vars'"

- [ ] **Step 3: Bikin `apps/server/src/repositories/env-vars.ts`**

Catatan: parameter Buffer kunci namanya `keyBuf` di layer repository, dan
`cryptoKey` di layer route. Jangan pernah pakai nama `key` buat Buffer kunci —
itu nama key env var.

```typescript
import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'
import { newId } from '../lib/id'

export type EnvVar = {
  id: string
  app_id: string
  key: string
  value: string
  is_secret: number
}

export function listEnvVars(db: Database, appId: string): EnvVar[] {
  return db
    .query('SELECT * FROM env_vars WHERE app_id = ? ORDER BY key')
    .all(appId) as EnvVar[]
}

export function setEnvVar(
  db: Database,
  appId: string,
  key: string,
  value: string,
  isSecret: boolean,
  keyBuf: Buffer
): void {
  const encrypted = encrypt(value, keyBuf)
  db.query(
    `INSERT INTO env_vars (id, app_id, key, value, is_secret)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret`
  ).run(newId(), appId, key, encrypted, isSecret ? 1 : 0)
}

export function deleteEnvVar(db: Database, appId: string, key: string): boolean {
  const result = db
    .query('DELETE FROM env_vars WHERE app_id = ? AND key = ?')
    .run(appId, key)
  return result.changes > 0
}

export function resolveEnvVars(
  db: Database,
  appId: string,
  keyBuf: Buffer
): Record<string, string> {
  const rows = listEnvVars(db, appId)
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = decrypt(row.value, keyBuf)
  }
  return result
}
```

- [ ] **Step 4: Bikin `apps/server/src/repositories/deployments.ts`**

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'success'
  | 'failed'

export type Deployment = {
  id: string
  app_id: string
  status: DeploymentStatus
  commit_sha: string | null
  commit_message: string | null
  image_tag: string | null
  build_log_path: string | null
  started_at: string | null
  finished_at: string | null
  error: string | null
  created_at: string
}

export function createDeployment(db: Database, appId: string): Deployment {
  const deployment: Deployment = {
    id: newId(),
    app_id: appId,
    status: 'queued',
    commit_sha: null,
    commit_message: null,
    image_tag: null,
    build_log_path: null,
    started_at: null,
    finished_at: null,
    error: null,
    created_at: nowIso(),
  }

  db.query(
    `INSERT INTO deployments (id, app_id, status, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(deployment.id, deployment.app_id, deployment.status, deployment.created_at)

  return deployment
}

export function getDeployment(db: Database, id: string): Deployment | null {
  return db.query('SELECT * FROM deployments WHERE id = ?').get(id) as Deployment | null
}

export function listDeployments(
  db: Database,
  appId: string,
  limit = 20
): Deployment[] {
  return db
    .query('SELECT * FROM deployments WHERE app_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(appId, limit) as Deployment[]
}

export function setDeploymentStatus(
  db: Database,
  id: string,
  status: DeploymentStatus,
  patch: {
    commitSha?: string
    commitMessage?: string
    imageTag?: string
    buildLogPath?: string
    error?: string
    startedAt?: string
    finishedAt?: string
  } = {}
): void {
  const current = getDeployment(db, id)
  if (!current) return

  db.query(
    `UPDATE deployments SET
      status = ?, commit_sha = ?, commit_message = ?, image_tag = ?,
      build_log_path = ?, error = ?, started_at = ?, finished_at = ?
     WHERE id = ?`
  ).run(
    status,
    patch.commitSha ?? current.commit_sha,
    patch.commitMessage ?? current.commit_message,
    patch.imageTag ?? current.image_tag,
    patch.buildLogPath ?? current.build_log_path,
    patch.error ?? current.error,
    patch.startedAt ?? current.started_at,
    patch.finishedAt ?? current.finished_at,
    id
  )
}

export function buildLogPath(logDir: string, deploymentId: string): string {
  return join(logDir, `${deploymentId}.log`)
}

export function appendBuildLog(
  logDir: string,
  deploymentId: string,
  line: string
): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  appendFileSync(buildLogPath(logDir, deploymentId), `${line}\n`, 'utf8')
}

export function readBuildLog(logDir: string, deploymentId: string): string {
  const path = buildLogPath(logDir, deploymentId)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}
```

- [ ] **Step 5: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/repositories/env-vars.test.ts`
Expected: PASS — 8 tes lolos

- [ ] **Step 6: Jalanin semua tes**

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/repositories
GIT_EDITOR=true git commit -m "feat(repos): env var encryption and deployment records"
```

---

# BAGIAN 3 — DEPLOY

## Task 19: Build dengan BuildKit (Terbatas 768MB)

**File:**
- Create: `apps/server/src/build/buildkit.ts`
- Create: `apps/server/src/build/buildkit.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `BUILDKIT_CONTAINER = 'hikari-buildkit'`
  - `BUILDKIT_MEMORY_MB = 768`
  - `BUILDKIT_VOLUME = 'hikari-buildkit-cache'`
  - `ensureBuildKit(docker): Promise<void>` — bikin container BuildKit yang dibatasin RAM
  - `stopBuildKit(docker): Promise<void>` — matiin setelah build, biar RAM balik

Catatan: ada `buildkitRunArgs()` di versi lama rencana ini yang balikin array
argumen `docker run`, tapi nggak pernah dipanggil karena pembuatan container
lewat dockerode. Fungsi itu dihapus bareng tesnya — nyimpen kode mati yang
dites doang itu jebakan, bukan pengaman.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/build/buildkit.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import {
  BUILDKIT_CONTAINER,
  BUILDKIT_MEMORY_MB,
  BUILDKIT_VOLUME,
  buildkitHost,
} from './buildkit'

describe('konfigurasi BuildKit', () => {
  test('nama container buildkit bener', () => {
    expect(BUILDKIT_CONTAINER).toBe('hikari-buildkit')
  })

  test('batas memory 768MB', () => {
    expect(BUILDKIT_MEMORY_MB).toBe(768)
  })

  test('volume cache punya nama tetap', () => {
    expect(BUILDKIT_VOLUME).toBe('hikari-buildkit-cache')
  })

  test('host buildkit nunjuk ke container-nya', () => {
    expect(buildkitHost()).toBe(`docker-container://${BUILDKIT_CONTAINER}`)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/buildkit.test.ts`
Expected: FAIL — "Cannot find module './buildkit'"

- [ ] **Step 3: Bikin `apps/server/src/build/buildkit.ts`**

```typescript
import type Docker from 'dockerode'

export const BUILDKIT_CONTAINER = 'hikari-buildkit'
export const BUILDKIT_MEMORY_MB = 768
export const BUILDKIT_VOLUME = 'hikari-buildkit-cache'

export function buildkitHost(): string {
  return `docker-container://${BUILDKIT_CONTAINER}`
}

export async function ensureBuildKit(docker: Docker): Promise<void> {
  try {
    const info = await docker.getContainer(BUILDKIT_CONTAINER).inspect()
    if (info.State.Running) return
    await docker.getContainer(BUILDKIT_CONTAINER).remove({ force: true })
  } catch {
    // belum ada, lanjut bikin
  }

  await docker.createContainer({
    name: BUILDKIT_CONTAINER,
    Image: 'moby/buildkit:latest',
    HostConfig: {
      Privileged: true,
      AutoRemove: false,
      RestartPolicy: { Name: 'no' },
      Memory: BUILDKIT_MEMORY_MB * 1024 * 1024,
      MemorySwap: BUILDKIT_MEMORY_MB * 1024 * 1024,
      Binds: [`${BUILDKIT_VOLUME}:/var/lib/buildkit`],
    },
  })

  await docker.getContainer(BUILDKIT_CONTAINER).start()
}

export async function stopBuildKit(docker: Docker): Promise<void> {
  try {
    await docker.getContainer(BUILDKIT_CONTAINER).stop({ t: 5 })
  } catch {
    // emang udah mati
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/buildkit.test.ts`
Expected: PASS — 4 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/build
GIT_EDITOR=true git commit -m "feat(build): memory-capped buildkit container"
```

---

## Task 20: Antrean Build (Satu Sekaligus)

**File:**
- Create: `apps/server/src/build/queue.ts`
- Create: `apps/server/src/build/queue.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `createBuildQueue(run: (job: T) => Promise<void>): { enqueue(job: T): Promise<void>; size(): number; isBusy(): boolean }`
  - Hanya satu job jalan sekaligus; sisanya menunggu FIFO
  - Job yang gagal **tidak** menghentikan antrean

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/build/queue.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { createBuildQueue } from './queue'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('createBuildQueue', () => {
  test('jalanin job satu per satu', async () => {
    const urutan: string[] = []
    let bersamaan = 0

    const q = createBuildQueue<string>(async (job) => {
      bersamaan += 1
      expect(bersamaan).toBe(1)
      urutan.push(`mulai:${job}`)
      await tick()
      urutan.push(`selesai:${job}`)
      bersamaan -= 1
    })

    q.enqueue('a')
    q.enqueue('b')
    q.enqueue('c')

    await new Promise((r) => setTimeout(r, 100))

    expect(urutan).toEqual([
      'mulai:a',
      'selesai:a',
      'mulai:b',
      'selesai:b',
      'mulai:c',
      'selesai:c',
    ])
  })

  test('job gagal nggak nyetop antrean', async () => {
    const diproses: string[] = []
    const q = createBuildQueue<string>(async (job) => {
      diproses.push(job)
      if (job === 'a') throw new Error('gagal')
    })

    q.enqueue('a')
    q.enqueue('b')

    await new Promise((r) => setTimeout(r, 50))
    expect(diproses).toEqual(['a', 'b'])
  })

  test('isBusy true pas lagi kerja', async () => {
    const q = createBuildQueue<string>(async () => {
      await tick()
    })
    q.enqueue('a')
    expect(q.isBusy()).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(q.isBusy()).toBe(false)
  })

  test('size nunjukin jumlah yang nunggu', async () => {
    const q = createBuildQueue<string>(async () => {
      await tick()
    })
    q.enqueue('a')
    q.enqueue('b')
    expect(q.size()).toBeGreaterThanOrEqual(1)
    await new Promise((r) => setTimeout(r, 100))
    expect(q.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/queue.test.ts`
Expected: FAIL — "Cannot find module './queue'"

- [ ] **Step 3: Bikin `apps/server/src/build/queue.ts`**

```typescript
export type BuildQueue<T> = {
  enqueue: (job: T) => void
  size: () => number
  isBusy: () => boolean
}

export function createBuildQueue<T>(run: (job: T) => Promise<void>): BuildQueue<T> {
  const waiting: T[] = []
  let busy = false

  async function drain(): Promise<void> {
    if (busy) return
    busy = true

    while (waiting.length > 0) {
      const job = waiting.shift() as T
      try {
        await run(job)
      } catch (err) {
        console.error('[hikari] job build gagal:', err)
      }
    }

    busy = false
  }

  return {
    enqueue(job: T) {
      waiting.push(job)
      void drain()
    },
    size: () => waiting.length,
    isBusy: () => busy,
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/queue.test.ts`
Expected: PASS — 4 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/build/queue.ts apps/server/src/build/queue.test.ts
GIT_EDITOR=true git commit -m "feat(build): serial build queue"
```

---

## Task 21: Git Clone dengan Deploy Key

**File:**
- Create: `apps/server/src/build/git.ts`
- Create: `apps/server/src/build/git.test.ts`
- Create: `apps/server/src/lib/ssh-key.ts`
- Create: `apps/server/src/lib/ssh-key.test.ts`

**Antarmuka:**
- **Menghasilkan (ssh-key):**
  - `generateDeployKey(): { publicKey: string; privateKey: string }` — pakai `ssh-keygen` ed25519
  - `formatPublicKey(publicKey: string, label: string): string` — buat ditampilin ke user
- **Menghasilkan (git):**
  - `gitEnv(privateKeyPath: string, knownHostsPath: string): Record<string, string>` — `GIT_SSH_COMMAND` yang bener
  - `pinKnownHosts(destPath: string): Promise<void>` — ambil host key GitHub/GitLab/Gitea sekali, buat verifikasi
  - `cloneRepo(opts): Promise<{ commitSha, commitMessage, repoDir }>`
  - `repoDirName(appSlug, deploymentId): string`

Catatan keamanan: versi lama rencana ini pakai `StrictHostKeyChecking=no` +
`UserKnownHostsFile=/dev/null`, yang artinya **nggak ada verifikasi host sama
sekali** — MITM bisa nyolong deploy key. Diganti jadi pin host key sekali lewat
`ssh-keyscan` pas install, terus `StrictHostKeyChecking=yes`.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/lib/ssh-key.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { formatPublicKey } from './ssh-key'

describe('formatPublicKey', () => {
  test('tambahin komentar hikari', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@host'
    expect(formatPublicKey(key, 'blog')).toContain('hikari-blog')
  })

  test('buang komentar bawaan', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@laptop'
    expect(formatPublicKey(key, 'blog')).not.toContain('admin@laptop')
  })

  test('hasil akhir satu baris', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@host\n'
    expect(formatPublicKey(key, 'blog').split('\n')).toHaveLength(1)
  })
})
```

Bikin `apps/server/src/build/git.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { gitEnv, repoDirName } from './git'

describe('gitEnv', () => {
  test('set GIT_SSH_COMMAND ke kunci yang dikasih', () => {
    const env = gitEnv('/tmp/key', '/tmp/known_hosts')
    expect(env.GIT_SSH_COMMAND).toContain('/tmp/key')
  })

  test('pakai file known_hosts, bukan /dev/null', () => {
    const cmd = gitEnv('/tmp/key', '/tmp/known_hosts').GIT_SSH_COMMAND
    expect(cmd).toContain('UserKnownHostsFile=/tmp/known_hosts')
    expect(cmd).not.toContain('/dev/null')
  })

  test('host key diverifikasi, bukan dimatiin', () => {
    const cmd = gitEnv('/tmp/key', '/tmp/known_hosts').GIT_SSH_COMMAND
    expect(cmd).toContain('StrictHostKeyChecking=yes')
  })

  test('matiin prompt password', () => {
    expect(gitEnv('/tmp/key', '/tmp/kh').GIT_SSH_COMMAND).toContain('BatchMode=yes')
  })
})

describe('repoDirName', () => {
  test('gabungin slug dan deployment id', () => {
    expect(repoDirName('blog', '01HXYZ')).toBe('blog-01HXYZ')
  })

  test('aman buat nama folder', () => {
    expect(repoDirName('blog', '01HXYZ')).not.toContain('/')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/git.test.ts`
Expected: FAIL — "Cannot find module './git'"

- [ ] **Step 3: Bikin `apps/server/src/lib/ssh-key.ts`**

```typescript
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

export function generateDeployKey(privateKeyPath: string): {
  publicKey: string
  privateKey: string
} {
  const dir = dirname(privateKeyPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })

  if (existsSync(privateKeyPath)) rmSync(privateKeyPath)
  if (existsSync(`${privateKeyPath}.pub`)) rmSync(`${privateKeyPath}.pub`)

  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', privateKeyPath], {
    stdio: 'pipe',
  })

  chmodSync(privateKeyPath, 0o600)

  return {
    privateKey: readFileSync(privateKeyPath, 'utf8'),
    publicKey: readFileSync(`${privateKeyPath}.pub`, 'utf8'),
  }
}

export function formatPublicKey(publicKey: string, label: string): string {
  const parts = publicKey.trim().split(/\s+/)
  const [algorithm, key] = parts
  return `${algorithm} ${key} hikari-${label}`
}
```

- [ ] **Step 4: Bikin `apps/server/src/build/git.ts`**

```typescript
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Host yang known_hosts-nya perlu di-pin sekali. `ssh-keyscan` butuh network,
 * jadi ini dijalani pas install, bukan tiap deploy.
 */
export const KNOWN_SSH_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org']

export function gitEnv(
  privateKeyPath: string,
  knownHostsPath: string
): Record<string, string> {
  return {
    GIT_SSH_COMMAND: [
      'ssh',
      `-i ${privateKeyPath}`,
      `-o UserKnownHostsFile=${knownHostsPath}`,
      '-o StrictHostKeyChecking=yes',
      '-o BatchMode=yes',
    ].join(' '),
  }
}

/**
 * Ambil host key dari daftar host dan tulis ke satu file known_hosts.
 * Dipanggil pas install / sekali doang. Kalau gagal (server tanpa network),
 * biarin aja — clone-nya nanti bakal error jelas, bukan diam-diam nggak aman.
 */
export async function pinKnownHosts(destPath: string): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })

  const hasil: string[] = []
  for (const host of KNOWN_SSH_HOSTS) {
    const proc = Bun.spawn(['ssh-keyscan', '-t', 'ed25519,rsa', host], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const text = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code === 0 && text.trim()) hasil.push(text.trim())
  }

  if (hasil.length === 0) {
    throw new Error('ssh-keyscan nggak dapet host key sama sekali')
  }

  await Bun.write(destPath, `${hasil.join('\n')}\n`)
}

export function repoDirName(appSlug: string, deploymentId: string): string {
  return `${appSlug}-${deploymentId}`
}

export type CloneOptions = {
  repoUrl: string
  branch: string
  privateKeyPath: string
  knownHostsPath: string
  workDir: string
  appSlug: string
  deploymentId: string
}

export async function cloneRepo(opts: CloneOptions): Promise<{
  commitSha: string
  commitMessage: string
  repoDir: string
}> {
  const repoDir = join(opts.workDir, repoDirName(opts.appSlug, opts.deploymentId))

  if (existsSync(repoDir)) rmSync(repoDir, { recursive: true, force: true })
  mkdirSync(opts.workDir, { recursive: true })

  const env = { ...process.env, ...gitEnv(opts.privateKeyPath, opts.knownHostsPath) }

  async function git(args: string[], cwd?: string): Promise<string> {
    const proc = Bun.spawn(['git', ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    if (code !== 0) throw new Error(`git ${args[0]} gagal (exit ${code})\n${err}`)
    return out
  }

  await git(['clone', '--depth', '1', '--branch', opts.branch, opts.repoUrl, repoDir])

  const commitSha = (await git(['rev-parse', 'HEAD'], repoDir)).trim()
  const commitMessage = (await git(['log', '-1', '--pretty=%s'], repoDir)).trim()

  return { commitSha, commitMessage, repoDir }
}
```

Catatan: `rmSync` + clone ulang tiap deploy itu boros buat repo gede. Ini
keputusan sadar buat Fase 1 — clone bersih tiap deploy lebih gampang dipercaya
daripada state repo yang bisa ketarik ke mana-mana. Ganti ke `git fetch` +
reset di Fase 3.

- [ ] **Step 5: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/git.test.ts src/lib/ssh-key.test.ts`
Expected: PASS — 7 tes lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/build/git.ts apps/server/src/build/git.test.ts apps/server/src/lib/ssh-key.ts apps/server/src/lib/ssh-key.test.ts
GIT_EDITOR=true git commit -m "feat(build): deploy key generation and pinned-host git clone"
```

---

## Task 22: Strategi Build (Dockerfile atau Railpack)

**File:**
- Create: `apps/server/src/build/strategy.ts`
- Create: `apps/server/src/build/strategy.test.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `type BuildPlan = { kind: 'dockerfile'; dockerfile: string } | { kind: 'railpack' } | { kind: 'image'; image: string }`
  - `chooseBuildPlan(input: { sourceType, repoDir?, imageRef?, dockerfilePath }): BuildPlan`
  - `railpackArgs(opts): string[]` — argumen buat `railpack build`
  - `dockerBuildArgs(opts): string[]` — argumen buat `docker buildx build` lewat BuildKit

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/build/strategy.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { chooseBuildPlan, dockerBuildArgs, railpackArgs } from './strategy'

describe('chooseBuildPlan', () => {
  test('sumber image langsung, nggak usah build', () => {
    const plan = chooseBuildPlan({
      sourceType: 'image',
      imageRef: 'redis:7-alpine',
      dockerfilePath: 'Dockerfile',
    })
    expect(plan.kind).toBe('image')
  })

  test('pakai Dockerfile kalau ada', () => {
    const plan = chooseBuildPlan({
      sourceType: 'github',
      repoDir: '/tmp/repo',
      dockerfilePath: 'Dockerfile',
      dockerfileExists: true,
    })
    expect(plan.kind).toBe('dockerfile')
  })

  test('fallback ke railpack kalau Dockerfile nggak ada', () => {
    const plan = chooseBuildPlan({
      sourceType: 'github',
      repoDir: '/tmp/repo',
      dockerfilePath: 'Dockerfile',
      dockerfileExists: false,
    })
    expect(plan.kind).toBe('railpack')
  })
})

describe('dockerBuildArgs', () => {
  const args = dockerBuildArgs({
    contextDir: '/tmp/repo',
    dockerfile: 'Dockerfile',
    tag: 'hikari-blog:01HXYZ',
    buildkitHost: 'docker-container://hikari-buildkit',
  })

  test('pakai buildx', () => {
    expect(args[0]).toBe('buildx')
    expect(args).toContain('build')
  })

  test('set builder ke buildkit host', () => {
    const idx = args.indexOf('--builder')
    expect(idx).toBeGreaterThan(-1)
  })

  test('kasih tag yang bener', () => {
    const idx = args.indexOf('-t')
    expect(args[idx + 1]).toBe('hikari-blog:01HXYZ')
  })

  test('pakai path Dockerfile yang diminta', () => {
    const idx = args.indexOf('-f')
    expect(args[idx + 1]).toBe('Dockerfile')
  })

  test('load hasilnya ke docker lokal', () => {
    expect(args).toContain('--load')
  })
})

describe('railpackArgs', () => {
  test('build pakai railpack dengan tag', () => {
    const args = railpackArgs({ contextDir: '/tmp/repo', tag: 'hikari-blog:01HXYZ' })
    expect(args[0]).toBe('build')
    expect(args).toContain('--name')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/strategy.test.ts`
Expected: FAIL — "Cannot find module './strategy'"

- [ ] **Step 3: Bikin `apps/server/src/build/strategy.ts`**

```typescript
import type { BuildStrategy, SourceType } from '../repositories/apps'

export type BuildPlan =
  | { kind: 'dockerfile'; dockerfile: string }
  | { kind: 'railpack' }
  | { kind: 'image'; image: string }

export type PlanInput = {
  sourceType: SourceType
  repoDir?: string
  imageRef?: string | null
  dockerfilePath: string
  dockerfileExists?: boolean
  preferred?: BuildStrategy
}

export function chooseBuildPlan(input: PlanInput): BuildPlan {
  if (input.sourceType === 'image') {
    if (!input.imageRef) throw new Error('App dari image harus punya image_ref')
    return { kind: 'image', image: input.imageRef }
  }

  if (input.preferred === 'railpack') return { kind: 'railpack' }

  if (input.dockerfileExists) {
    return { kind: 'dockerfile', dockerfile: input.dockerfilePath }
  }

  return { kind: 'railpack' }
}

export function dockerBuildArgs(opts: {
  contextDir: string
  dockerfile: string
  tag: string
  buildkitHost: string
}): string[] {
  return [
    'buildx',
    'build',
    '--builder',
    opts.buildkitHost,
    '-f',
    opts.dockerfile,
    '-t',
    opts.tag,
    '--load',
    opts.contextDir,
  ]
}

export function railpackArgs(opts: { contextDir: string; tag: string }): string[] {
  return ['build', '--name', opts.tag, opts.contextDir]
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/strategy.test.ts`
Expected: PASS — 8 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/build/strategy.ts apps/server/src/build/strategy.test.ts
GIT_EDITOR=true git commit -m "feat(build): dockerfile-first build strategy with railpack fallback"
```

---

## Task 22b: Eksekusi Build (Jalanin Docker Build / Railpack)

**File:**
- Create: `apps/server/src/build/execute.ts`
- Create: `apps/server/src/build/execute.test.ts`

**Antarmuka:**
- **Konsumsi:** `chooseBuildPlan`, `dockerBuildArgs`, `railpackArgs`, `imageTag`,
  `ensureBuildKit`, `stopBuildKit`, `cloneRepo`, `appendBuildLog`
- **Menghasilkan:**
  - `type ExecuteDeps = { db, docker, logDir, workDir, deployKeyDir }`
  - `createBuildFn(deps): (app: App, deploymentId: string) => Promise<{ imageTag: string }>`
  - Fungsi yang dibalikin **juga nge-tag `latest`**, biar tombol Restart punya image
  - BuildKit **dimatiin** setelah build selesai (biar RAM-nya balik)
  - `shouldTagLatest(kind): boolean` — image dari registry nggak perlu di-tag ulang
  - `run(cmd, args, opts)` — proses async pakai `Bun.spawn`, dengan timeout,
    keluaran digabung dan dibatasi 1MB

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/build/execute.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { shouldTagLatest, latestTagFor } from './execute'

describe('shouldTagLatest', () => {
  test('hasil build dockerfile perlu di-tag latest', () => {
    expect(shouldTagLatest('dockerfile')).toBe(true)
  })

  test('hasil build railpack perlu di-tag latest', () => {
    expect(shouldTagLatest('railpack')).toBe(true)
  })

  test('image dari registry nggak perlu di-tag latest', () => {
    expect(shouldTagLatest('image')).toBe(false)
  })
})

describe('latestTagFor', () => {
  test('bikin tag latest dari slug', () => {
    expect(latestTagFor('blog')).toBe('hikari-blog:latest')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/execute.test.ts`
Expected: FAIL — "Cannot find module './execute'"

- [ ] **Step 3: Bikin `apps/server/src/build/execute.ts`**

```typescript
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import { imageTag } from '../docker/client'
import { appendBuildLog } from '../repositories/deployments'
import type { App } from '../repositories/apps'
import { buildkitHost, ensureBuildKit, stopBuildKit } from './buildkit'
import { cloneRepo } from './git'
import { chooseBuildPlan, dockerBuildArgs, railpackArgs } from './strategy'

/** Build bisa lama, tapi nggak boleh nggantung selamanya. */
const BUILD_TIMEOUT_MS = 30 * 60 * 1000
const PULL_TIMEOUT_MS = 10 * 60 * 1000

export function shouldTagLatest(kind: 'dockerfile' | 'railpack' | 'image'): boolean {
  return kind !== 'image'
}

export function latestTagFor(appSlug: string): string {
  return `hikari-${appSlug}:latest`
}

export type ExecuteDeps = {
  db: Database
  docker: Docker
  logDir: string
  workDir: string
  deployKeyDir: string
}

function log(deps: ExecuteDeps, deploymentId: string, line: string): void {
  appendBuildLog(deps.logDir, deploymentId, line)
}

/**
 * Jalanin proses tanpa nge-block event loop. `execFileSync` bikin seluruh panel
 * freeze selama build, jadi nggak boleh dipakai di jalur ini.
 *
 * Keluaran digabung stdout+stderr, dibatasi BUFFER_MAX biar log raksasa nggak
 * ngabisin RAM, dan dipotong kalau lewat timeout.
 */
const BUFFER_MAX = 1024 * 1024
const TAIL_MAX = 16 * 1024

async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}
): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let buang = ''
  let simpan = ''

  async function baca(stream: ReadableStream<Uint8Array>, label: string) {
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true })
      proses(text)
      simpan += text
      if (simpan.length > BUFFER_MAX) {
        // Yang dibuang tetep ditulis biar user nggak kehilangan error.
        buang += simpan.slice(0, simpan.length - TAIL_MAX)
        simpan = simpan.slice(-TAIL_MAX)
      }
      void label
    }
  }

  function proses(_text: string): void {
    // Sengaja kosong: log live ngalir ke file lewat streamBuildLog di Task 22c.
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`${cmd} kelamaan, dimatiin setelah ${BUILD_TIMEOUT_MS / 60000} menit`))
    }, opts.timeoutMs ?? BUILD_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      (async () => {
        await Promise.all([baca(proc.stdout, 'stdout'), baca(proc.stderr, 'stderr')])
        const code = await proc.exited
        if (code !== 0) {
          throw new Error(`${cmd} gagal (exit ${code})\n${buang}${simpan}`)
        }
      })(),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }

  return buang + simpan
}

export function createBuildFn(
  deps: ExecuteDeps
): (app: App, deploymentId: string) => Promise<{ imageTag: string }> {
  return async function build(app, deploymentId) {
    const tag = imageTag(app.slug, deploymentId)
    const latest = latestTagFor(app.slug)

    // App dari registry: nggak usah build, cukup pull.
    if (app.source_type === 'image') {
      if (!app.image_ref) throw new Error('App dari image nggak punya image_ref')
      log(deps, deploymentId, `Pull image: ${app.image_ref}`)
      await run('docker', ['pull', app.image_ref], { timeoutMs: PULL_TIMEOUT_MS })
      await run('docker', ['tag', app.image_ref, tag])
      await run('docker', ['tag', app.image_ref, latest])
      return { imageTag: tag }
    }

    if (!app.repo_url) throw new Error('App git nggak punya repo_url')

    const privateKeyPath = join(deps.deployKeyDir, app.slug)
    log(deps, deploymentId, `Clone ${app.repo_url} (${app.branch})`)

    const cloned = await cloneRepo({
      repoUrl: app.repo_url,
      branch: app.branch ?? 'main',
      privateKeyPath,
      workDir: deps.workDir,
      appSlug: app.slug,
      deploymentId,
    })

    log(deps, deploymentId, `Commit: ${cloned.commitSha}`)

    const contextDir = join(cloned.repoDir, app.root_dir)
    const dockerfileFull = join(contextDir, app.dockerfile_path)

    const plan = chooseBuildPlan({
      sourceType: app.source_type,
      imageRef: app.image_ref,
      dockerfilePath: app.dockerfile_path,
      dockerfileExists: existsSync(dockerfileFull),
      preferred: app.build_strategy,
    })

    log(deps, deploymentId, `Cara build: ${plan.kind}`)

    // BuildKit cuma nyala pas build, terus dimatiin lagi biar RAM-nya balik.
    await ensureBuildKit(deps.docker)
    try {
      if (plan.kind === 'dockerfile') {
        const args = dockerBuildArgs({
          contextDir,
          dockerfile: app.dockerfile_path,
          tag,
          buildkitHost: buildkitHost(),
        })
        log(deps, deploymentId, await run('docker', args))
      } else {
        log(deps, deploymentId, await run('railpack', railpackArgs({ contextDir, tag })))
      }
    } finally {
      await stopBuildKit(deps.docker).catch(() => undefined)
    }

    if (shouldTagLatest(plan.kind)) {
      await run('docker', ['tag', tag, latest])
    }

    log(deps, deploymentId, `Image siap: ${tag}`)
    return { imageTag: tag }
  }
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/execute.test.ts`
Expected: PASS — 4 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/build/execute.ts apps/server/src/build/execute.test.ts
GIT_EDITOR=true git commit -m "feat(build): build executor with latest tagging"
```

---

## Task 23: Pipeline Deploy Lengkap

**File:**
- Create: `apps/server/src/build/pipeline.ts`
- Create: `apps/server/src/build/pipeline.test.ts`
- Modify: `apps/server/src/app.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `type DeployDeps` — semua yang dibutuhin pipeline (db, docker, key, path)
  - `deployApp(deps, appId, opts?): Promise<{ deploymentId, status, error? }>`
  - `runDeployStep(...)` — dipisah biar bisa dites
- **Aturan penting:** kalau build gagal, **container lama tetap jalan**. `setAppStatus` tetap `running` kalau sebelumnya `running`.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/build/pipeline.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { generateKey } from '../lib/crypto'
import { createProject } from '../repositories/projects'
import { createApp, getApp, setAppStatus } from '../repositories/apps'
import { createDeployment, getDeployment } from '../repositories/deployments'
import { markDeployResult } from './pipeline'

let db: Database
let appId: string
const key = generateKey()

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  const projectId = createProject(db, { name: 'Blog' }).id
  appId = createApp(db, {
    projectId,
    name: 'Web',
    sourceType: 'github',
    containerPort: 3000,
  }).id
  setAppStatus(db, appId, 'running')
})

describe('markDeployResult', () => {
  test('sukses nandain app running', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'hikari-web:1' })
    expect(getDeployment(db, dep.id)?.status).toBe('success')
    expect(getApp(db, appId)?.status).toBe('running')
  })

  test('gagal nggak matiin app yang udah running', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: false, error: 'build gagal' })
    expect(getDeployment(db, dep.id)?.status).toBe('failed')
    expect(getDeployment(db, dep.id)?.error).toBe('build gagal')
    expect(getApp(db, appId)?.status).toBe('running')
  })

  test('gagal pas app pertama kali deploy, status jadi failed', () => {
    setAppStatus(db, appId, 'stopped')
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: false, error: 'build gagal' })
    expect(getApp(db, appId)?.status).toBe('failed')
  })

  test('sukses nyimpen tag image', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'hikari-web:9' })
    expect(getDeployment(db, dep.id)?.image_tag).toBe('hikari-web:9')
  })

  test('sukses nyatet waktu selesai', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'x:1' })
    expect(getDeployment(db, dep.id)?.finished_at).not.toBeNull()
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/build/pipeline.test.ts`
Expected: FAIL — "Cannot find module './pipeline'"

- [ ] **Step 3: Bikin `apps/server/src/build/pipeline.ts`**

```typescript
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import {
  inspectContainer,
  removeContainer,
  runContainer,
  stopContainer,
} from '../docker/containers'
import {
  ensureNetwork,
  pruneBuildLogs,
  pruneImages,
  pruneOldDeployments,
} from '../docker/maintenance'
import { nowIso } from '../lib/id'
import type { App } from '../repositories/apps'
import { getApp, setAppStatus } from '../repositories/apps'
import {
  appendBuildLog,
  createDeployment,
  setDeploymentStatus,
} from '../repositories/deployments'
import { resolveEnvVars } from '../repositories/env-vars'

export type DeployDeps = {
  db: Database
  docker: Docker
  cryptoKey: Buffer
  logDir: string
  workDir: string
  buildFn: (app: App, deploymentId: string) => Promise<{ imageTag: string }>
}

export type DeployResult = { deploymentId: string; ok: boolean; error?: string }

export function markDeployResult(
  db: Database,
  deploymentId: string,
  appId: string,
  result: { ok: true; imageTag: string } | { ok: false; error: string }
): void {
  const app = getApp(db, appId)

  if (result.ok) {
    setDeploymentStatus(db, deploymentId, 'success', {
      imageTag: result.imageTag,
      finishedAt: nowIso(),
    })
    setAppStatus(db, appId, 'running')
    return
  }

  setDeploymentStatus(db, deploymentId, 'failed', {
    error: result.error,
    finishedAt: nowIso(),
  })

  // Kalau app-nya sebelumnya jalan, JANGAN diubah jadi failed.
  // Deploy gagal nggak boleh bikin app yang hidup jadi mati.
  if (app?.status !== 'running') {
    setAppStatus(db, appId, 'failed')
  }
}

export async function deployApp(
  deps: DeployDeps,
  appId: string
): Promise<DeployResult> {
  const { db, docker, cryptoKey, logDir } = deps

  const app = getApp(db, appId)
  if (!app) return { deploymentId: '', ok: false, error: 'App nggak ketemu' }

  const deployment = createDeployment(db, appId)
  setDeploymentStatus(db, deployment.id, 'building', { startedAt: nowIso() })
  setAppStatus(db, appId, 'building')

  try {
    await ensureNetwork(docker)

    const built = await deps.buildFn(app, deployment.id)
    setDeploymentStatus(db, deployment.id, 'deploying', { imageTag: built.imageTag })

    const env = resolveEnvVars(db, appId, cryptoKey)
    const wasRunning = (await inspectContainer(docker, app.slug)) !== null

    if (wasRunning) {
      await stopContainer(docker, app.slug)
    }
    await removeContainer(docker, app.slug)

    await runContainer(
      {
        appSlug: app.slug,
        image: built.imageTag,
        containerPort: app.container_port,
        env,
        memoryLimitMb: app.memory_limit_mb,
        cpuLimit: app.cpu_limit,
        network: networkName(),
      },
      docker
    )

    markDeployResult(db, deployment.id, appId, { ok: true, imageTag: built.imageTag })

    await pruneImages(docker).catch(() => undefined)
    pruneOldDeployments(db, appId, 50)

    // Pembersihan disk nempel di jalur deploy, bukan cron — sesuai prinsip
    // nggak ada proses yang nyala terus.
    pruneBuildLogs(logDir, 30)

    return { deploymentId: deployment.id, ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    appendBuildLog(logDir, deployment.id, `ERROR: ${message}`)
    markDeployResult(db, deployment.id, appId, { ok: false, error: message })
    return { deploymentId: deployment.id, ok: false, error: message }
  }
}
```

Catatan: nggak ada lagi `export { containerName, getLogs, imageTag }` di bawah —
re-export itu nggak dipakai siapa pun dan nyamarin arah impornya.

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/build/pipeline.test.ts`
Expected: PASS — 5 tes lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/build
GIT_EDITOR=true git commit -m "feat(build): deploy pipeline that never kills a running app"
```

---

## Task 24: Endpoint App (CRUD + Deploy + Kontrol)

**File:**
- Create: `apps/server/src/routes/apps.ts`
- Create: `apps/server/src/routes/apps.test.ts`
- Modify: `apps/server/src/app.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `GET /api/projects/:projectId/apps` → `{ apps }`
  - `POST /api/projects/:projectId/apps` → `{ app }` 201
  - `GET /api/apps/:id` → `{ app }`
  - `PATCH /api/apps/:id` → `{ app }`
  - `DELETE /api/apps/:id` → `{ ok: true }`
  - `POST /api/apps/:id/deploy` → `{ deploymentId }` 202
  - `POST /api/apps/:id/stop` / `/restart` → `{ ok: true }`

Catatan buat `restart`: dia **nggak** build ulang. Dia pakai image
`hikari-<slug>:latest` dari deploy terakhir yang sukses, terus jalanin ulang
container dengan env var yang diresolve ulang dari database. Env var wajib
ikut — restart tanpa env var bikin app jalan tanpa konfigurasi.
  - `GET /api/apps/:id/status` → `{ status, container: { running, startedAt } | null, stats }`
  - `GET /api/apps/:id/logs?tail=200` → `{ lines }`
  - `GET /api/apps/:id/deployments` → `{ deployments }`
  - `POST /api/apps/:id/env` body `{ key, value, isSecret }`
  - `DELETE /api/apps/:id/env/:key`
  - `GET /api/apps/:id/deploy-key` → `{ publicKey }`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/routes/apps.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string
let projectId: string

beforeEach(async () => {
  app = createApp({
    dbPath: ':memory:',
    keyPath: '/tmp/hikari-apps-test.key',
    port: 2508,
  })

  await app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })
  cookie = login.headers.get('set-cookie')!.split(';')[0]

  const project = await app.request('/api/projects', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Blog' }),
  })
  projectId = ((await project.json()) as { project: { id: string } }).project.id
})

const auth = () => ({ Cookie: cookie, 'Content-Type': 'application/json' })

describe('POST /api/projects/:projectId/apps', () => {
  test('bikin app dari github', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Web',
        sourceType: 'github',
        repoUrl: 'git@github.com:user/repo.git',
        branch: 'main',
        containerPort: 3000,
      }),
    })
    expect(res.status).toBe(201)
    const { app: created } = (await res.json()) as { app: { slug: string } }
    expect(created.slug).toBe('web')
  })

  test('nolak app tanpa port', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'github', repoUrl: 'x', containerPort: 0 }),
    })
    expect(res.status).toBe(400)
  })

  test('tolak sourceType aneh', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'ftp', containerPort: 3000 }),
    })
    expect(res.status).toBe(400)
  })

  test('nolak kalau project nggak ada', async () => {
    const res = await app.request('/api/projects/nggak-ada/apps', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'github', repoUrl: 'x', containerPort: 3000 }),
    })
    expect(res.status).toBe(404)
  })

  test('memory limit default 512 kalau nggak diisi', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Default',
        sourceType: 'image',
        imageRef: 'nginx:alpine',
        containerPort: 80,
      }),
    })
    const { app: created } = (await res.json()) as { app: { memoryLimitMb: number } }
    expect(created.memoryLimitMb).toBe(512)
  })
})

describe('env var', () => {
  let appId: string

  beforeEach(async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Env',
        sourceType: 'github',
        repoUrl: 'x',
        containerPort: 3000,
      }),
    })
    appId = ((await res.json()) as { app: { id: string } }).app.id
  })

  test('set env var biasa', async () => {
    const res = await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'NODE_ENV', value: 'production', isSecret: false }),
    })
    expect(res.status).toBe(200)
  })

  test('env var rahasia nggak balikin nilainya di GET', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'PASSWORD', value: 'rahasia123', isSecret: true }),
    })

    const res = await app.request(`/api/apps/${appId}/env`, { headers: auth() })
    const { envVars } = (await res.json()) as {
      envVars: { key: string; value: string }[]
    }
    const secret = envVars.find((v) => v.key === 'PASSWORD')!
    expect(secret.value).toBe('••••••••')
  })

  test('hapus env var', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'FOO', value: 'bar', isSecret: false }),
    })
    const res = await app.request(`/api/apps/${appId}/env/FOO`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
  })
})

describe('kontrol app', () => {
  let appId: string

  beforeEach(async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Ctrl',
        sourceType: 'image',
        imageRef: 'nginx:alpine',
        containerPort: 80,
      }),
    })
    appId = ((await res.json()) as { app: { id: string } }).app.id
  })

  test('GET status balikin struktur yang bener', async () => {
    const res = await app.request(`/api/apps/${appId}/status`, { headers: auth() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; dockerAvailable: boolean }
    expect(typeof body.status).toBe('string')
    expect(typeof body.dockerAvailable).toBe('boolean')
  })

  test('GET logs nggak error walau container belum ada', async () => {
    const res = await app.request(`/api/apps/${appId}/logs`, { headers: auth() })
    expect(res.status).toBe(200)
  })

  test('GET deployments kosong di awal', async () => {
    const res = await app.request(`/api/apps/${appId}/deployments`, { headers: auth() })
    const { deployments } = (await res.json()) as { deployments: unknown[] }
    expect(deployments).toEqual([])
  })

  test('GIT deploy key bisa diambil', async () => {
    const res = await app.request(`/api/apps/${appId}/deploy-key`, { headers: auth() })
    expect(res.status).toBe(200)
    const { publicKey } = (await res.json()) as { publicKey: string }
    expect(publicKey).toContain('ssh-ed25519')
    expect(publicKey).toContain('hikari-ctrl')
  })

  test('hapus app', async () => {
    const res = await app.request(`/api/apps/${appId}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
  })
})

describe('restart', () => {
  let appId: string

  beforeEach(async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Restart',
        sourceType: 'image',
        imageRef: 'nginx:alpine',
        containerPort: 80,
      }),
    })
    appId = ((await res.json()) as { app: { id: string } }).app.id
  })

  test('env var tetep kebaca setelah restart', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'DATABASE_URL', value: 'postgres://x', isSecret: false }),
    })

    const res = await app.request(`/api/apps/${appId}/restart`, {
      method: 'POST',
      headers: auth(),
    })

    // Tanpa Docker jalan, restart balikin 409. Yang penting: endpoint-nya
    // nggak 500, dan env var-nya masih utuh.
    expect([200, 409]).toContain(res.status)

    const env = await app.request(`/api/apps/${appId}/env`, { headers: auth() })
    const { envVars } = (await env.json()) as {
      envVars: { key: string; value: string }[]
    }
    expect(envVars.find((v) => v.key === 'DATABASE_URL')?.value).toBe('postgres://x')
  })
})

describe('proteksi login', () => {
  test('semua endpoint app butuh login', async () => {
    const paths = [
      ['GET', `/api/projects/${projectId}/apps`],
      ['GET', '/api/apps/apa-saja'],
      ['POST', '/api/apps/apa-saja/deploy'],
      ['GET', '/api/apps/apa-saja/logs'],
      ['GET', '/api/apps/apa-saja/deploy-key'],
    ] as const

    for (const [method, path] of paths) {
      const res = await app.request(path, { method })
      expect(res.status).toBe(401)
    }
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/routes/apps.test.ts`
Expected: FAIL — endpoint apps belum ada

- [ ] **Step 3: Bikin `apps/server/src/routes/apps.ts`**

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import {
  createApp as createAppRecord,
  deleteApp,
  getApp,
  listApps,
  setAppStatus,
  updateApp,
} from '../repositories/apps'
import { getProject } from '../repositories/projects'
import {
  deleteEnvVar,
  listEnvVars,
  resolveEnvVars,
  setEnvVar,
} from '../repositories/env-vars'
import { listDeployments } from '../repositories/deployments'
import { getDocker, networkName, pingDocker } from '../docker/client'
import { decrypt } from '../lib/crypto'
import { getContainerStats } from '../docker/stats'
import { getLogs } from '../docker/logs'
import { inspectContainer, removeContainer, stopContainer, runContainer } from '../docker/containers'
import { ensureNetwork } from '../docker/maintenance'
import { formatPublicKey, generateDeployKey } from '../lib/ssh-key'
import type { Database } from '../db/client'

const MASK = '••••••••'

const createSchema = z.object({
  name: z.string().min(1).max(64),
  sourceType: z.enum(['github', 'giturl', 'image']),
  repoUrl: z.string().min(1).nullable().optional(),
  branch: z.string().min(1).max(128).nullable().optional(),
  buildStrategy: z.enum(['dockerfile', 'railpack']).optional(),
  dockerfilePath: z.string().min(1).optional(),
  rootDir: z.string().optional(),
  imageRef: z.string().min(1).nullable().optional(),
  containerPort: z.number().int().min(1).max(65535),
  memoryLimitMb: z.number().int().min(64).max(32768).optional(),
  cpuLimit: z.number().min(0.1).max(8).optional(),
})

const envSchema = z.object({
  key: z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().max(8192),
  isSecret: z.boolean().optional(),
})

export type AppRoutesDeps = {
  db: Database
  cryptoKey: Buffer
  deployKeyDir: string
  onDeploy: (appId: string) => void
  onDomainChange: () => void
}

export function createAppRoutes(deps: AppRoutesDeps): Hono {
  const { db, cryptoKey, deployKeyDir } = deps
  const router = new Hono()

  router.get('/projects/:projectId/apps', (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }
    return c.json({ apps: listApps(db, projectId) })
  })

  router.post('/projects/:projectId/apps', async (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }

    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Data app nggak valid. Port wajib 1-65535.' }, 400)
    }

    if (parsed.data.sourceType !== 'image' && !parsed.data.repoUrl) {
      return c.json({ error: 'Repo URL wajib buat sumber git' }, 400)
    }
    if (parsed.data.sourceType === 'image' && !parsed.data.imageRef) {
      return c.json({ error: 'Image wajib buat sumber image' }, 400)
    }

    const app = createAppRecord(db, { ...parsed.data, projectId })
    return c.json({ app }, 201)
  })

  router.get('/apps/:id', (c) => {
    const app = getApp(db, c.req.param('id'))
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ app })
  })

  router.patch('/apps/:id', async (c) => {
    const parsed = createSchema
      .omit({ sourceType: true })
      .partial()
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Data nggak valid' }, 400)

    const app = updateApp(db, c.req.param('id'), parsed.data)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ app })
  })

  router.delete('/apps/:id', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const docker = getDocker()
    await removeContainer(docker, app.slug).catch(() => undefined)

    deleteApp(db, id)
    return c.json({ ok: true })
  })

  router.post('/apps/:id/deploy', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    deps.onDeploy(id)
    return c.json({ ok: true, queued: true }, 202)
  })

  router.post('/apps/:id/stop', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    await stopContainer(getDocker(), app.slug)
    setAppStatus(db, id, 'stopped')
    return c.json({ ok: true })
  })

  router.post('/apps/:id/restart', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const docker = getDocker()
    const info = await inspectContainer(docker, app.slug)
    if (!info) {
      return c.json({ error: 'Container belum pernah dibuat. Deploy dulu.' }, 409)
    }

    // Restart = matiin terus nyalain pakai image terakhir yang sukses.
    // Env var HARUS diresolve ulang — kalau dikosongin, app-nya jalan tanpa
    // konfigurasi dan gagal dengan gejala yang nggak nunjuk ke Hikari.
    const image = `hikari-${app.slug}:latest`
    const env = resolveEnvVars(db, id, cryptoKey)

    await stopContainer(docker, app.slug)
    await runContainer(
      {
        appSlug: app.slug,
        image,
        containerPort: app.container_port,
        env,
        memoryLimitMb: app.memory_limit_mb,
        cpuLimit: app.cpu_limit,
        network: networkName(),
      },
      docker
    )

    setAppStatus(db, id, 'running')
    return c.json({ ok: true })
  })

  router.get('/apps/:id/status', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const docker = getDocker()
    const available = await pingDocker(docker)
    if (!available) {
      return c.json({
        status: app.status,
        dockerAvailable: false,
        container: null,
        stats: null,
      })
    }

    const container = await inspectContainer(docker, app.slug)
    const stats = container?.running ? await getContainerStats(docker, app.slug) : null

    return c.json({
      status: app.status,
      dockerAvailable: true,
      container,
      stats,
    })
  })

  router.get('/apps/:id/logs', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const tail = Number(c.req.query('tail') ?? 200)
    const lines = await getLogs(getDocker(), app.slug, Number.isFinite(tail) ? tail : 200)
    return c.json({ lines })
  })

  router.get('/apps/:id/deployments', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ deployments: listDeployments(db, id, 20) })
  })

  router.get('/apps/:id/env', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const envVars = listEnvVars(db, id).map((v) => ({
      key: v.key,
      isSecret: v.is_secret === 1,
      // Yang rahasia ditutup total. Yang bukan rahasia didekripsi biar
      // nilainya keliatan di panel — dia bukan rahasia, jadi nggak ada
      // alasan nyembunyiin.
      value: v.is_secret === 1 ? MASK : decrypt(v.value, cryptoKey),
    }))

    return c.json({ envVars })
  })

  router.post('/apps/:id/env', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const parsed = envSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Key env var harus huruf/angka/underscore' }, 400)
    }

    setEnvVar(db, id, parsed.data.key, parsed.data.value, parsed.data.isSecret ?? false, cryptoKey)
    return c.json({ ok: true })
  })

  router.delete('/apps/:id/env/:key', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const ok = deleteEnvVar(db, id, c.req.param('key'))
    if (!ok) return c.json({ error: 'Env var nggak ketemu' }, 404)
    return c.json({ ok: true })
  })

  router.get('/apps/:id/deploy-key', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const keyPath = join(deployKeyDir, app.slug)
    const { publicKey } = generateDeployKey(keyPath)
    return c.json({ publicKey: formatPublicKey(publicKey, app.slug) })
  })

  return router
}
```

- [ ] **Step 4: Jalanin semua tes**

Jangan nyentuh `app.ts` dulu — nanti di Task 36.

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(apps): CRUD, deploy, control, logs, and env endpoints"
```

---

## Task 25: Caddy — Bikin Config dari Daftar Domain

**File:**
- Create: `apps/server/src/caddy/config.ts`
- Create: `apps/server/src/caddy/config.test.ts`
- Create: `apps/server/src/repositories/domains.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `renderCaddyfile(input: { panelDomain?, panelPort, entries: CaddyEntry[] }): string`
  - `type CaddyEntry = { hostname: string; upstreamPort: number; tls: boolean }`
  - `validateHostname(hostname): { ok: boolean; reason?: string }`
  - Domain repo: `listDomains(db, appId)`, `addDomain(db, appId, hostname)`, `removeDomain(db, id)`, `setTlsStatus(db, id, status)`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/caddy/config.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { renderCaddyfile, validateHostname } from './config'

describe('validateHostname', () => {
  test('terima domain biasa', () => {
    expect(validateHostname('blog.contoh.com').ok).toBe(true)
  })

  test('terima subdomain', () => {
    expect(validateHostname('a.b.c.contoh.com').ok).toBe(true)
  })

  test('tolak yang ada port-nya', () => {
    expect(validateHostname('blog.com:3000').ok).toBe(false)
  })

  test('tolak yang pakai protokol', () => {
    expect(validateHostname('https://blog.com').ok).toBe(false)
  })

  test('tolak yang ada spasinya', () => {
    expect(validateHostname('blog .com').ok).toBe(false)
  })

  test('tolak IP polos', () => {
    expect(validateHostname('1.2.3.4').ok).toBe(false)
  })

  test('tolak yang kosong', () => {
    expect(validateHostname('').ok).toBe(false)
  })

  test('tolak wildcard', () => {
    expect(validateHostname('*.contoh.com').ok).toBe(false)
  })

  test('tolak domain tanpa titik', () => {
    expect(validateHostname('blog').ok).toBe(false)
  })

  test('protokol dikasih alasan http, bukan alasan port', () => {
    expect(validateHostname('https://blog.com').reason).toContain('http')
  })
})

describe('renderCaddyfile', () => {
  test('satu domain jadi satu blok', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [{ hostname: 'blog.contoh.com', upstreamPort: 3000, tls: true }],
    })
    expect(out).toContain('blog.contoh.com {')
    expect(out).toContain('reverse_proxy 127.0.0.1:3000')
  })

  test('pakai reverse_proxy ke 127.0.0.1, bukan 0.0.0.0', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [{ hostname: 'a.com', upstreamPort: 80, tls: true }],
    })
    expect(out).toContain('reverse_proxy 127.0.0.1:80')
  })

  test('domain panel ikut ditulis', () => {
    const out = renderCaddyfile({
      panelDomain: 'panel.contoh.com',
      panelPort: 2508,
      entries: [],
    })
    expect(out).toContain('panel.contoh.com {')
    expect(out).toContain('reverse_proxy 127.0.0.1:2508')
  })

  test('daftar kosong tetep ngasih file yang valid', () => {
    const out = renderCaddyfile({ panelPort: 2508, entries: [] })
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain('{')
  })

  test('beberapa domain ditulis semua', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [
        { hostname: 'a.com', upstreamPort: 3000, tls: true },
        { hostname: 'b.com', upstreamPort: 3001, tls: true },
      ],
    })
    expect(out).toContain('a.com {')
    expect(out).toContain('b.com {')
  })

  test('pasang blok global buat email dan admin', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [],
      acmeEmail: 'aku@contoh.com',
    })
    expect(out).toContain('email aku@contoh.com')
  })

  test('kalau dns challenge dipakai, tulis blok tls', () => {
    const out = renderCaddyfile({
      panelPort: 2508,
      entries: [
        { hostname: 'db.contoh.com', upstreamPort: 5433, tls: true, dnsChallenge: true },
      ],
      dnsProvider: 'cloudflare',
    })
    expect(out).toContain('cloudflare')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/caddy/config.test.ts`
Expected: FAIL — "Cannot find module './config'"

- [ ] **Step 3: Bikin `apps/server/src/caddy/config.ts`**

```typescript
export type CaddyEntry = {
  hostname: string
  upstreamPort: number
  tls: boolean
  dnsChallenge?: boolean
}

export type CaddyInput = {
  panelDomain?: string | null
  panelPort: number
  entries: CaddyEntry[]
  acmeEmail?: string
  dnsProvider?: string
}

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

export function validateHostname(hostname: string): { ok: boolean; reason?: string } {
  if (!hostname) return { ok: false, reason: 'Domain wajib diisi' }
  if (hostname.includes('://')) return { ok: false, reason: 'Domain nggak boleh pakai http://' }
  if (/\s/.test(hostname)) return { ok: false, reason: 'Domain nggak boleh ada spasi' }
  if (hostname.includes(':')) return { ok: false, reason: 'Domain nggak boleh pakai port' }
  if (hostname.startsWith('*')) return { ok: false, reason: 'Wildcard nggak didukung di sini' }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return { ok: false, reason: 'Pakai domain, bukan alamat IP' }
  }
  if (!HOSTNAME_RE.test(hostname)) {
    return { ok: false, reason: 'Format domain nggak valid' }
  }
  return { ok: true }
}

function block(hostname: string, upstreamPort: number, entry?: CaddyEntry): string {
  const lines: string[] = [`${hostname} {`]
  if (entry?.dnsChallenge) {
    lines.push('  tls {')
    lines.push('    dns cloudflare {env.CLOUDFLARE_API_TOKEN}')
    lines.push('  }')
  }
  lines.push(`  reverse_proxy 127.0.0.1:${upstreamPort}`)
  lines.push('}')
  return lines.join('\n')
}

export function renderCaddyfile(input: CaddyInput): string {
  const parts: string[] = []

  const globalLines: string[] = ['{', '  admin 127.0.0.1:2019']
  if (input.acmeEmail) globalLines.push(`  email ${input.acmeEmail}`)
  globalLines.push('}')
  parts.push(globalLines.join('\n'))

  if (input.panelDomain) {
    parts.push(block(input.panelDomain, input.panelPort))
  }

  for (const entry of input.entries) {
    parts.push(block(entry.hostname, entry.upstreamPort, entry))
  }

  return `${parts.join('\n\n')}\n`
}
```

- [ ] **Step 4: Bikin `apps/server/src/repositories/domains.ts`**

```typescript
import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export type TlsStatus = 'pending' | 'active' | 'failed'

export type Domain = {
  id: string
  app_id: string
  hostname: string
  tls_status: TlsStatus
  created_at: string
}

export function listDomains(db: Database, appId: string): Domain[] {
  return db
    .query('SELECT * FROM domains WHERE app_id = ? ORDER BY created_at')
    .all(appId) as Domain[]
}

export function listAllDomains(db: Database): Domain[] {
  return db.query('SELECT * FROM domains ORDER BY hostname').all() as Domain[]
}

export function addDomain(db: Database, appId: string, hostname: string): Domain {
  const domain: Domain = {
    id: newId(),
    app_id: appId,
    hostname,
    tls_status: 'pending',
    created_at: nowIso(),
  }
  db.query(
    'INSERT INTO domains (id, app_id, hostname, tls_status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(domain.id, domain.app_id, domain.hostname, domain.tls_status, domain.created_at)
  return domain
}

export function removeDomain(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM domains WHERE id = ?').run(id)
  return result.changes > 0
}

export function setTlsStatus(db: Database, id: string, status: TlsStatus): void {
  db.query('UPDATE domains SET tls_status = ? WHERE id = ?').run(status, id)
}
```

- [ ] **Step 5: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/caddy/config.test.ts`
Expected: PASS — 14 tes lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/caddy apps/server/src/repositories/domains.ts
GIT_EDITOR=true git commit -m "feat(caddy): caddyfile generation from domain list"
```

---

## Task 26: Kelola Caddy (Tulis Config + Reload)

**File:**
- Create: `apps/server/src/caddy/service.ts`
- Create: `apps/server/src/caddy/service.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/apps.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `writeCaddyfile(path: string, content: string): void`
  - `reloadCaddy(adminUrl: string, fetchImpl?): Promise<{ ok: boolean; error?: string }>`
  - `syncCaddy(deps: { db, caddyfilePath, panelDomain, panelPort, adminUrl }): Promise<void>`
  `onDomainChange` **wajib** (nggak ada default). Bentuk final `AppRoutesDeps`
  jadinya lima field: `db`, `key`, `deployKeyDir`, `onDeploy`, `onDomainChange`.
  Task 24 nge-update signature jadi lima field ini, tapi isi body-nya sama.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/caddy/service.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject } from '../repositories/projects'
import { createApp } from '../repositories/apps'
import { addDomain } from '../repositories/domains'
import { reloadCaddy, syncCaddy, writeCaddyfile } from './service'

let db: Database
let dir: string
let appSlug: string

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  dir = mkdtempSync(join(tmpdir(), 'hikari-caddy-'))
  const projectId = createProject(db, { name: 'Blog' }).id
  appSlug = createApp(db, {
    projectId,
    name: 'Web',
    sourceType: 'github',
    repoUrl: 'x',
    containerPort: 3000,
  }).slug
})

describe('writeCaddyfile', () => {
  test('tulis isinya ke disk', () => {
    const path = join(dir, 'Caddyfile')
    writeCaddyfile(path, 'contoh.com {\n}\n')
    expect(readFileSync(path, 'utf8')).toContain('contoh.com')
  })
})

describe('reloadCaddy', () => {
  test('balikin ok kalau Caddy bales 200', async () => {
    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(true)
  })

  test('balikin gagal kalau Caddy mati', async () => {
    const fakeFetch = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('refused')
  })

  test('balikin gagal kalau Caddy bales error', async () => {
    const fakeFetch = (async () =>
      new Response('config jelek', { status: 400 })) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(false)
  })
})

describe('syncCaddy', () => {
  test('nulis config yang isinya domain app', async () => {
    const path = join(dir, 'Caddyfile')
    const projectId = db.query('SELECT id FROM projects LIMIT 1').get() as { id: string }
    const app = createApp(db, {
      projectId: projectId.id,
      name: 'Satu',
      sourceType: 'github',
      repoUrl: 'x',
      containerPort: 3000,
    })
    addDomain(db, app.id, 'satu.contoh.com')

    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('satu.contoh.com')
  })

  test('nggak ada domain tetep nulis file valid', async () => {
    const path = join(dir, 'Caddyfile')
    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('admin 127.0.0.1:2019')
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/caddy/service.test.ts`
Expected: FAIL — "Cannot find module './service'"

- [ ] **Step 3: Bikin `apps/server/src/caddy/service.ts`**

```typescript
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Database } from '../db/client'
import { getApp } from '../repositories/apps'
import { listAllDomains } from '../repositories/domains'
import { renderCaddyfile, type CaddyEntry } from './config'

export function writeCaddyfile(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, content, 'utf8')
}

export async function reloadCaddy(
  adminUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(adminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Caddy nolak config: ${res.status} ${text}` }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Nggak bisa nyambung ke Caddy: ${message}` }
  }
}

export type SyncDeps = {
  db: Database
  caddyfilePath: string
  panelPort: number
  panelDomain?: string | null
  adminUrl: string
  acmeEmail?: string
  fetchImpl?: typeof fetch
}

export async function syncCaddy(deps: SyncDeps): Promise<void> {
  const entries: CaddyEntry[] = []

  for (const domain of listAllDomains(deps.db)) {
    const app = getApp(deps.db, domain.app_id)
    if (!app) continue
    entries.push({ hostname: domain.hostname, upstreamPort: app.container_port, tls: true })
  }

  const content = renderCaddyfile({
    panelDomain: deps.panelDomain,
    panelPort: deps.panelPort,
    entries,
    acmeEmail: deps.acmeEmail,
  })

  writeCaddyfile(deps.caddyfilePath, content)

  const result = await reloadCaddy(deps.adminUrl, deps.fetchImpl ?? fetch)
  if (!result.ok) {
    console.error('[hikari] gagal reload Caddy:', result.error)
  }
}
```

- [ ] **Step 4: Tambah endpoint domain di `routes/apps.ts`**

Tambahin import:

```typescript
import { addDomain, listDomains, removeDomain, setTlsStatus } from '../repositories/domains'
import { validateHostname } from '../caddy/config'
```

Tambahin ke `AppRoutesDeps`:

```typescript
  onDomainChange: () => void
```

Tambahin route sebelum `return router`:

```typescript
  router.get('/apps/:id/domains', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ domains: listDomains(db, id) })
  })

  router.post('/apps/:id/domains', async (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const body = (await c.req.json().catch(() => null)) as { hostname?: string } | null
    const check = validateHostname(body?.hostname ?? '')
    if (!check.ok) return c.json({ error: check.reason }, 400)

    const hostname = (body!.hostname as string).toLowerCase()

    try {
      const domain = addDomain(db, id, hostname)
      deps.onDomainChange()
      return c.json({ domain }, 201)
    } catch {
      return c.json({ error: 'Domain itu udah dipakai app lain' }, 409)
    }
  })

  router.delete('/apps/:id/domains/:domainId', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const ok = removeDomain(db, c.req.param('domainId'))
    if (!ok) return c.json({ error: 'Domain nggak ketemu' }, 404)

    deps.onDomainChange()
    return c.json({ ok: true })
  })

  router.post('/apps/:id/domains/:domainId/check', async (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    setTlsStatus(db, c.req.param('domainId'), 'pending')
    return c.json({ ok: true, tlsStatus: 'pending' })
  })
```

- [ ] **Step 5: Jalanin semua tes**

Jangan nyentuh `app.ts` dulu — nanti di Task 36.

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(caddy): config sync and domain endpoints"
```

---

## Task 27: Webhook GitHub

**File:**
- Create: `apps/server/src/routes/webhooks.ts`
- Create: `apps/server/src/routes/webhooks.test.ts`
- Create: `apps/server/src/repositories/webhooks.ts`
- Modify: `apps/server/src/app.ts`

**Antarmuka:**
- **Menghasilkan:**
  - `verifyGithubSignature(payload: string, signature: string, secret: string): boolean`
  - `POST /api/webhooks/github/:appId` → 202 kalau valid, 401 kalau signature salah, 404 kalau app nggak ada
  - `getOrCreateWebhookSecret(db, appId): string`
  - `GET /api/apps/:id/webhook` → `{ url, secret }`

Catatan: Hono nge-match middleware berdasarkan prefix path, bukan urutan
registrasi. `/api/webhooks/github/:appId` nggak pernah kena `requireAuth`
karena middleware-nya dipasang di `/api/projects`, `/api/projects/*`, dan
`/api/apps/*` — tiga prefix yang nggak nyentuh `/api/webhooks`. Jadi nggak ada
urutan ajaib yang perlu dijaga; cukup pastiin `app.ts` (Task 36) masang
`createWebhookRoutes` dan `createWebhookInfoRoute`.

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/routes/webhooks.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string
let appId: string
let secret: string

beforeEach(async () => {
  app = createApp({
    dbPath: ':memory:',
    keyPath: '/tmp/hikari-webhook-test.key',
    port: 2508,
  })

  await app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })
  cookie = login.headers.get('set-cookie')!.split(';')[0]

  const auth = { Cookie: cookie, 'Content-Type': 'application/json' }

  const project = await app.request('/api/projects', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'Blog' }),
  })
  const projectId = ((await project.json()) as { project: { id: string } }).project.id

  const created = await app.request(`/api/projects/${projectId}/apps`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: 'Hook',
      sourceType: 'github',
      repoUrl: 'git@github.com:user/repo.git',
      branch: 'main',
      containerPort: 3000,
    }),
  })
  appId = ((await created.json()) as { app: { id: string } }).app.id

  const info = await app.request(`/api/apps/${appId}/webhook`, { headers: auth })
  secret = ((await info.json()) as { secret: string }).secret
})

function sign(payload: string, withSecret: string): string {
  return `sha256=${createHmac('sha256', withSecret).update(payload).digest('hex')}`
}

const payload = JSON.stringify({ ref: 'refs/heads/main' })

function hook(signature: string, body = payload, targetId = appId) {
  return app.request(`/api/webhooks/github/${targetId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-event': 'push',
      'x-github-delivery': 'abc-123',
    },
    body,
  })
}

describe('POST /api/webhooks/github/:appId', () => {
  test('signature bener diterima', async () => {
    const res = await hook(sign(payload, secret))
    expect(res.status).toBe(202)
  })

  test('signature salah ditolak 401', async () => {
    const res = await hook(sign(payload, 'rahasia-salah'))
    expect(res.status).toBe(401)
  })

  test('signature kosong ditolak 401', async () => {
    const res = await hook('')
    expect(res.status).toBe(401)
  })

  test('signature yang diutak-atik ditolak', async () => {
    const res = await hook(sign(`${payload} `, secret))
    expect(res.status).toBe(401)
  })

  test('app nggak ada balikin 404', async () => {
    const res = await hook(sign(payload, secret), payload, 'nggak-ada')
    expect(res.status).toBe(404)
  })

  test('push ke branch lain tetap diterima webhook (difilter di handler)', () => {
    const lain = JSON.stringify({ ref: 'refs/heads/feature' })
    const res = await hook(sign(lain, secret), lain)
    expect(res.status).toBe(202)
  })

  test('event yang bukan push diabaikan', async () => {
    const res = await app.request(`/api/webhooks/github/${appId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sign(payload, secret),
        'x-github-event': 'issues',
        'x-github-delivery': 'xyz',
      },
      body: payload,
    })
    expect(res.status).toBe(202)
  })
})

describe('GET /api/apps/:id/webhook', () => {
  test('butuh login', async () => {
    const res = await app.request(`/api/apps/${appId}/webhook`)
    expect(res.status).toBe(401)
  })

  test('balikin secret yang sama tiap kali', async () => {
    const a = await app.request(`/api/apps/${appId}/webhook`, {
      headers: { Cookie: cookie },
    })
    const b = await app.request(`/api/apps/${appId}/webhook`, {
      headers: { Cookie: cookie },
    })
    const sa = ((await a.json()) as { secret: string }).secret
    const sb = ((await b.json()) as { secret: string }).secret
    expect(sa).toBe(sb)
    expect(sa.length).toBeGreaterThan(20)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/routes/webhooks.test.ts`
Expected: FAIL — endpoint webhook belum ada

- [ ] **Step 3: Bikin `apps/server/src/repositories/webhooks.ts`**

```typescript
import { randomBytes } from 'node:crypto'
import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export function getOrCreateWebhookSecret(db: Database, appId: string): string {
  const key = `webhook_secret:${appId}`
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | null

  if (row) return row.value

  const secret = randomBytes(32).toString('hex')
  db.query('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, secret)
  return secret
}

export function recordDelivery(
  db: Database,
  appId: string,
  deliveryId: string,
  event: string,
  status: string
): void {
  db.query(
    `INSERT INTO webhook_deliveries (id, app_id, delivery_id, event, received_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId(), appId, deliveryId, event, nowIso(), status)
}

export function hasProcessedDelivery(db: Database, deliveryId: string): boolean {
  const row = db
    .query('SELECT 1 FROM webhook_deliveries WHERE delivery_id = ? LIMIT 1')
    .get(deliveryId)
  return Boolean(row)
}
```

- [ ] **Step 4: Bikin `apps/server/src/routes/webhooks.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { getApp } from '../repositories/apps'
import {
  getOrCreateWebhookSecret,
  hasProcessedDelivery,
  recordDelivery,
} from '../repositories/webhooks'

export function verifyGithubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type WebhookDeps = {
  db: Database
  onPush: (appId: string) => void
}

export function createWebhookRoutes(deps: WebhookDeps): Hono {
  const { db } = deps
  const router = new Hono()

  router.post('/webhooks/github/:appId', async (c) => {
    const appId = c.req.param('appId')
    const app = getApp(db, appId)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const raw = await c.req.text()
    const signature = c.req.header('x-hub-signature-256') ?? ''
    const secret = getOrCreateWebhookSecret(db, appId)

    if (!verifyGithubSignature(raw, signature, secret)) {
      return c.json({ error: 'Signature nggak valid' }, 401)
    }

    const deliveryId = c.req.header('x-github-delivery') ?? ''
    const event = c.req.header('x-github-event') ?? 'unknown'

    if (deliveryId && hasProcessedDelivery(db, deliveryId)) {
      return c.json({ ok: true, skipped: 'duplikat' }, 202)
    }

    if (event !== 'push') {
      recordDelivery(db, appId, deliveryId, event, 'ignored')
      return c.json({ ok: true, skipped: event }, 202)
    }

    try {
      const body = JSON.parse(raw) as { ref?: string }
      const pushedBranch = (body.ref ?? '').replace('refs/heads/', '')

      recordDelivery(db, appId, deliveryId, event, 'accepted')

      if (pushedBranch === (app.branch ?? 'main')) {
        deps.onPush(appId)
      }

      return c.json({ ok: true }, 202)
    } catch {
      return c.json({ error: 'Body bukan JSON valid' }, 400)
    }
  })

  return router
}

export function createWebhookInfoRoute(db: Database): Hono {
  const router = new Hono()

  router.get('/apps/:id/webhook', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    return c.json({
      url: `/api/webhooks/github/${id}`,
      secret: getOrCreateWebhookSecret(db, id),
      events: ['push'],
    })
  })

  return router
}
```

- [ ] **Step 5: Jalanin semua tes**

Jangan nyentuh `app.ts` dulu — nanti di Task 36.

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(webhooks): github push webhook with hmac verification"
```

---

# BAGIAN 4 — FRONTEND

## Task 28: Setup Vite + React + TanStack Router

**File:**
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx`

**Antarmuka:**
- Dev server di 5173, proxy `/api` ke 2508
- Build hasil ke `apps/web/dist`, diserve Hono

- [ ] **Step 1: Bikin `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2508',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 2: Bikin `apps/web/index.html`**

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Hikari</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Bikin `apps/web/src/routes/__root.tsx`**

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <Outlet />
    </div>
  ),
})
```

- [ ] **Step 4: Bikin `apps/web/src/routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Hikari</h1>
      <p className="mt-2 text-neutral-600">Panel-nya belum jadi. Sabar.</p>
    </main>
  ),
})
```

- [ ] **Step 5: Bikin `apps/web/src/router.tsx`**

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

- [ ] **Step 6: Bikin `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
```

- [ ] **Step 7: Tambah plugin router ke `vite.config.ts`**

Update `apps/web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [TanStackRouterVite({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:2508', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
```

Dan tambahin ke `apps/web/package.json` devDependencies:

```json
"@tanstack/router-plugin": "^1.80.0"
```

- [ ] **Step 8: Install & verifikasi**

Run: `bun install && cd apps/web && bun run build`
Expected: folder `dist/` muncul dengan `index.html`

- [ ] **Step 9: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): vite + react + tanstack router setup"
```

---

## Task 29: Tailwind + Token Warna

**File:**
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/postcss.config.js`
- Modify: `apps/web/package.json`

**Antarmuka:**
- Default terang
- Aksen light blue, warna status terpisah

- [ ] **Step 1: Bikin `apps/web/src/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* netral */
  --bg: 255 255 255;
  --surface: 255 255 255;
  --surface-muted: 248 250 252;
  --border: 226 232 240;
  --text: 15 23 42;
  --text-muted: 71 85 105;
  --text-subtle: 148 163 184;

  /* brand — light blue */
  --brand: 14 165 233;
  --brand-hover: 2 132 199;
  --brand-soft: 224 242 254;
  --brand-text: 3 105 161;

  /* status — jangan dicampur sama brand */
  --ok: 16 185 129;
  --warn: 245 158 11;
  --danger: 239 68 68;
  --idle: 148 163 184;
}

html {
  color-scheme: light;
}

body {
  background: rgb(var(--bg));
  color: rgb(var(--text));
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* semua transisi pakai kurva ini, jangan linear/ease-in-out */
.transition-hikari {
  transition: all 400ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* fokus keyboard harus keliatan */
:focus-visible {
  outline: 2px solid rgb(var(--brand));
  outline-offset: 2px;
  border-radius: 4px;
}
```

- [ ] **Step 2: Bikin `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        muted: 'rgb(var(--surface-muted) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--text) / <alpha-value>)',
        'ink-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--text-subtle) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          text: 'rgb(var(--brand-text) / <alpha-value>)',
        },
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        idle: 'rgb(var(--idle) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 3: Bikin `apps/web/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Tambahin dependensi ke `apps/web/package.json`**

```json
"dependencies": {
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "@tanstack/react-router": "^1.80.0",
  "@tanstack/router-plugin": "^1.80.0"
},
"devDependencies": {
  "@vitejs/plugin-react": "^4.3.0",
  "vite": "^6.0.0",
  "typescript": "^5.6.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "tailwindcss": "^3.4.0",
  "autoprefixer": "^10.4.0",
  "postcss": "^8.4.0"
}
```

- [ ] **Step 5: Verifikasi build**

Run: `bun install && cd apps/web && bun run build`
Expected: build sukses, tidak ada error CSS

- [ ] **Step 6: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): tailwind with light-blue brand tokens"
```

---

## Task 30: Klien API + Hook Auth

**File:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/api.test.ts`
- Create: `apps/web/src/hooks/use-auth.ts`
- Create: `apps/web/src/routes/login.tsx`
- Create: `apps/web/src/routes/setup.tsx`

**Antarmuka:**
- `api.get/post/patch/del(path, body?)` — balikin `{ ok, data, error }`, otomatis kirim cookie
- `useAuth()` → `{ username, loading, error, refetch }`
- Redirect ke `/setup` kalau `needsSetup`, ke `/login` kalau belum login

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/web/src/lib/api.test.ts`:

```typescript
import { describe, expect, test, mock } from 'bun:test'
import { createApiClient } from './api'

describe('createApiClient', () => {
  test('GET balikin data kalau sukses', async () => {
    const fakeFetch = mock(async () =>
      new Response(JSON.stringify({ projects: [] }), { status: 200 })
    )
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects')
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ projects: [] })
  })

  test('balikin error pesan dari server', async () => {
    const fakeFetch = mock(async () =>
      new Response(JSON.stringify({ error: 'Project nggak ketemu' }), { status: 404 })
    )
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects/hantu')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Project nggak ketemu')
    expect(result.status).toBe(404)
  })

  test('nggak error kalau body bukan JSON', async () => {
    const fakeFetch = mock(async () => new Response('', { status: 500 }))
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/apa-saja')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
  })

  test('POST ngirim body JSON', async () => {
    let terkirim = ''
    const fakeFetch = mock(async (_url: string, init?: RequestInit) => {
      terkirim = init?.body as string
      return new Response('{}', { status: 200 })
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    await api.post('/projects', { name: 'Blog' })
    expect(JSON.parse(terkirim)).toEqual({ name: 'Blog' })
  })

  test('selalu pakai credentials include', async () => {
    let init: RequestInit | undefined
    const fakeFetch = mock(async (_url: string, i?: RequestInit) => {
      init = i
      return new Response('{}', { status: 200 })
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    await api.get('/projects')
    expect(init?.credentials).toBe('include')
  })

  test('nangkep error jaringan', async () => {
    const fakeFetch = mock(async () => {
      throw new Error('offline')
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/web && bun test src/lib/api.test.ts`
Expected: FAIL — "Cannot find module './api'"

- [ ] **Step 3: Bikin `apps/web/src/lib/api.ts`**

```typescript
export type ApiResult<T> = {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export type ApiClient = {
  get: <T>(path: string) => Promise<ApiResult<T>>
  post: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>
  patch: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>
  del: <T>(path: string) => Promise<ApiResult<T>>
}

export function createApiClient(fetchImpl: typeof fetch = fetch): ApiClient {
  async function request<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    const url = path.startsWith('/api') ? path : `/api${path}`
    try {
      const res = await fetchImpl(url, {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      })

      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Server bales ${res.status}`
        return { ok: false, status: res.status, data: null, error: message }
      }

      return { ok: true, status: res.status, data: data as T, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nggak bisa nyambung ke server'
      return { ok: false, status: 0, data: null, error: message }
    }
  }

  return {
    get: (path) => request(path, { method: 'GET' }),
    post: (path, body) =>
      request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: (path, body) =>
      request(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
    del: (path) => request(path, { method: 'DELETE' }),
  }
}

export const api = createApiClient()
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/web && bun test src/lib/api.test.ts`
Expected: PASS — 6 tes lolos

- [ ] **Step 5: Bikin `apps/web/src/hooks/use-auth.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useAuth() {
  const [username, setUsername] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)

    const status = await api.get<{ needsSetup: boolean }>('/setup/status')
    if (status.ok) {
      setNeedsSetup(status.data?.needsSetup ?? false)
      if (status.data?.needsSetup) {
        setUsername(null)
        setLoading(false)
        return
      }
    }

    const me = await api.get<{ username: string }>('/auth/me')
    setUsername(me.ok ? (me.data?.username ?? null) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { username, needsSetup, loading, refetch }
}
```

- [ ] **Step 6: Bikin `apps/web/src/routes/setup.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../lib/api'

export const Route = createFileRoute('/setup')({ component: SetupPage })

function SetupPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== konfirmasi) {
      setError('Password sama konfirmasinya beda')
      return
    }

    setBusy(true)
    const res = await api.post<{ ok: boolean }>('/setup', { username, password })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    const login = await api.post('/auth/login', { username, password })
    if (login.ok) {
      await navigate({ to: '/' })
    } else {
      await navigate({ to: '/login' })
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Selamat datang di Hikari</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Bikin akun admin dulu. Password minimal 12 karakter.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label htmlFor="konfirmasi" className="block text-sm font-medium">
            Ulangi password
          </label>
          <input
            id="konfirmasi"
            type="password"
            value={konfirmasi}
            onChange={(e) => setKonfirmasi(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-card bg-brand px-4 py-2.5 font-medium text-white transition-hikari hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? 'Menyimpan...' : 'Bikin akun admin'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Bikin `apps/web/src/routes/login.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../lib/api'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post('/auth/login', { username, password })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    await navigate({ to: '/' })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Masuk ke Hikari</h1>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-card bg-brand px-4 py-2.5 font-medium text-white transition-hikari hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? 'Masuk...' : 'Masuk'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 9: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): api client and auth pages"
```

---

## Task 31: Layout Panel + Sidebar

**File:**
- Create: `apps/web/src/components/layout/sidebar.tsx`
- Create: `apps/web/src/components/layout/app-shell.tsx`
- Create: `apps/web/src/components/ui/status-dot.tsx`
- Modify: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/_panel.tsx`

**Antarmuka:**
- Tiga halaman aja di sidebar: **Projects**, **Settings**, (keluar)
- Status dot: warna status **terpisah** dari brand

- [ ] **Step 1: Bikin `apps/web/src/components/ui/status-dot.tsx`**

```tsx
export type StatusKind = 'running' | 'stopped' | 'building' | 'failed'

const WARNA: Record<StatusKind, string> = {
  running: 'bg-ok',
  stopped: 'bg-idle',
  building: 'bg-warn',
  failed: 'bg-danger',
}

const LABEL: Record<StatusKind, string> = {
  running: 'Jalan',
  stopped: 'Mati',
  building: 'Lagi build',
  failed: 'Gagal',
}

export function StatusDot({ status }: { status: StatusKind }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${WARNA[status]}`}
      />
      <span className="text-sm text-ink-muted">{LABEL[status]}</span>
    </span>
  )
}
```

- [ ] **Step 2: Bikin `apps/web/src/components/layout/sidebar.tsx`**

```tsx
import { Link, useRouter } from '@tanstack/react-router'
import { api } from '../../lib/api'

export function Sidebar({ username }: { username: string }) {
  const router = useRouter()

  async function logout() {
    await api.post('/auth/logout')
    await router.navigate({ to: '/login' })
  }

  const itemClass =
    'block rounded-card px-3 py-2 text-sm text-ink-muted transition-hikari hover:bg-muted hover:text-ink'
  const activeClass = 'bg-brand-soft text-brand-text font-medium'

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex w-56 shrink-0 flex-col border-r border-line bg-muted px-3 py-4"
    >
      <div className="px-3 pb-4">
        <span className="text-base font-semibold">Hikari</span>
      </div>

      <div className="space-y-1">
        <Link
          to="/"
          className={itemClass}
          activeProps={{ className: `${itemClass} ${activeClass}` }}
        >
          Projects
        </Link>
        <Link
          to="/settings"
          className={itemClass}
          activeProps={{ className: `${itemClass} ${activeClass}` }}
        >
          Settings
        </Link>
      </div>

      <div className="mt-auto border-t border-line pt-4">
        <p className="px-3 text-xs text-ink-subtle">Masuk sebagai</p>
        <p className="px-3 pb-2 text-sm font-medium">{username}</p>
        <button
          type="button"
          onClick={logout}
          className={`${itemClass} w-full text-left`}
        >
          Keluar
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Bikin `apps/web/src/components/layout/app-shell.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'

export function AppShell({
  username,
  title,
  actions,
  children,
}: {
  username: string
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar username={username} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h1 className="text-lg font-semibold">{title}</h1>
          {actions}
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Bikin `apps/web/src/routes/_panel.tsx`**

```tsx
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../hooks/use-auth'

export const Route = createFileRoute('/_panel')({ component: PanelLayout })

function PanelLayout() {
  const navigate = useNavigate()
  const { username, needsSetup, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (needsSetup) {
      void navigate({ to: '/setup' })
      return
    }
    if (!username) {
      void navigate({ to: '/login' })
    }
  }, [loading, needsSetup, username, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Memuat...
      </div>
    )
  }

  if (!username) return null

  return <Outlet />
}
```

- [ ] **Step 5: Update `__root.tsx`**

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-bg text-ink">
      <Outlet />
    </div>
  ),
})
```

- [ ] **Step 6: Pindahin `index.tsx` jadi children dari `_panel`**

Hapus `apps/web/src/routes/index.tsx`, bikin `apps/web/src/routes/_panel.index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { AppShell } from '../components/layout/app-shell'

export const Route = createFileRoute('/_panel/')({ component: ProjectsPage })

function ProjectsPage() {
  const { username } = useAuth()

  return (
    <AppShell username={username ?? 'admin'} title="Projects">
      <p className="text-sm text-ink-muted">Belum ada project. Bikin dulu nanti.</p>
    </AppShell>
  )
}
```

- [ ] **Step 7: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 8: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): panel shell with sidebar and auth guard"
```

---

## Task 32: Halaman Projects (Daftar + Bikin)

**File:**
- Create: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/projects/project-list.tsx`
- Create: `apps/web/src/components/projects/create-project-dialog.tsx`
- Modify: `apps/web/src/routes/_panel.index.tsx`

**Antarmuka:**
- `type Project = { id, name, slug, description, createdAt }`
- Halaman nampilin daftar project, tombol "Project baru", dialog form
- Tiap project bisa diklik → `/projects/$projectId`

- [ ] **Step 1: Bikin `apps/web/src/lib/types.ts`**

```typescript
export type Project = {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
}

export type AppStatus = 'stopped' | 'building' | 'running' | 'failed'
export type SourceType = 'github' | 'giturl' | 'image'

export type AppRecord = {
  id: string
  project_id: string
  name: string
  slug: string
  source_type: SourceType
  repo_url: string | null
  branch: string | null
  image_ref: string | null
  container_port: number
  memory_limit_mb: number
  cpu_limit: number
  status: AppStatus
  created_at: string
}

export type Deployment = {
  id: string
  status: 'queued' | 'building' | 'deploying' | 'success' | 'failed'
  commit_sha: string | null
  commit_message: string | null
  image_tag: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

export type Domain = {
  id: string
  hostname: string
  tls_status: 'pending' | 'active' | 'failed'
}

export type ContainerStats = {
  cpuPercent: number
  memoryUsedMb: number
  memoryLimitMb: number
  memoryPercent: number
}
```

- [ ] **Step 2: Bikin `apps/web/src/components/ui/card.tsx`**

```tsx
import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="border-b border-line px-4 py-3">{children}</div>
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3">{children}</div>
}
```

- [ ] **Step 3: Bikin `apps/web/src/components/ui/button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  ghost: 'border border-line bg-surface hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-card px-3.5 py-2 text-sm font-medium transition-hikari disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    />
  )
}
```

- [ ] **Step 4: Bikin `apps/web/src/components/projects/create-project-dialog.tsx`**

```tsx
import { useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

export function CreateProjectDialog({
  onCreated,
  onClose,
}: {
  onCreated: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post('/projects', {
      name,
      description: description || null,
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    onCreated()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dlg-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dlg-title" className="text-base font-semibold">
          Project baru
        </h2>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="pname" className="block text-sm font-medium">
              Nama
            </label>
            <input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Blog"
              className="mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="pdesc" className="block text-sm font-medium">
              Deskripsi <span className="text-ink-subtle">(opsional)</span>
            </label>
            <input
              id="pdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Bikin'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Bikin `apps/web/src/components/projects/project-list.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import type { Project } from '../../lib/types'
import { Card, CardBody } from '../ui/card'

export function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">
            Belum ada project. Bikin project pertama buat mulai.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <Link
          key={project.id}
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="block rounded-card border border-line bg-surface px-4 py-3 transition-hikari hover:border-brand/40 hover:bg-brand-soft/30"
        >
          <p className="font-medium">{project.name}</p>
          {project.description && (
            <p className="mt-0.5 text-sm text-ink-muted">{project.description}</p>
          )}
          <p className="mt-1 font-mono text-xs text-ink-subtle">{project.slug}</p>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Ganti isi `apps/web/src/routes/_panel.index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { ProjectList } from '../components/projects/project-list'
import { CreateProjectDialog } from '../components/projects/create-project-dialog'

export const Route = createFileRoute('/_panel/')({ component: ProjectsPage })

function ProjectsPage() {
  const { username } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.get<{ projects: Project[] }>('/projects')
    setLoading(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setProjects(res.data?.projects ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell
      username={username ?? 'admin'}
      title="Projects"
      actions={<Button onClick={() => setDialogOpen(true)}>Project baru</Button>}
    >
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && <ProjectList projects={projects} />}

      {dialogOpen && (
        <CreateProjectDialog onCreated={load} onClose={() => setDialogOpen(false)} />
      )}
    </AppShell>
  )
}
```

- [ ] **Step 7: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 8: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): projects list and create dialog"
```

---

## Task 33: Halaman Project (Daftar App)

**File:**
- Create: `apps/web/src/routes/_panel.projects.$projectId.tsx`
- Create: `apps/web/src/components/apps/app-card.tsx`
- Create: `apps/web/src/components/apps/create-app-dialog.tsx`

**Antarmuka:**
- Nampilin app dalam project, tombol "App baru"
- Dialog punya 3 tab: GitHub / Git URL / Docker Image

- [ ] **Step 1: Bikin `apps/web/src/components/apps/app-card.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import type { AppRecord } from '../../lib/types'
import { Card, CardBody } from '../ui/card'
import { StatusDot } from '../ui/status-dot'

export function AppCard({ app }: { app: AppRecord }) {
  return (
    <Link
      to="/apps/$appId"
      params={{ appId: app.id }}
      className="block"
    >
      <Card className="transition-hikari hover:border-brand/40">
        <CardBody>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">{app.name}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-subtle">{app.slug}</p>
            </div>
            <StatusDot status={app.status} />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>{app.source_type === 'image' ? 'Docker Image' : 'Git'}</span>
            <span>Port {app.container_port}</span>
            <span>{app.memory_limit_mb} MB</span>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: Bikin `apps/web/src/components/apps/create-app-dialog.tsx`**

```tsx
import { useState } from 'react'
import { api } from '../../lib/api'
import type { SourceType } from '../../lib/types'
import { Button } from '../ui/button'

const TABS: { id: SourceType; label: string }[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'giturl', label: 'Git URL' },
  { id: 'image', label: 'Docker Image' },
]

export function CreateAppDialog({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string
  onCreated: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<SourceType>('github')
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [imageRef, setImageRef] = useState('')
  const [containerPort, setContainerPort] = useState('3000')
  const [memoryLimitMb, setMemoryLimitMb] = useState('512')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const payload = {
      name,
      sourceType: tab,
      repoUrl: tab === 'image' ? null : repoUrl,
      branch: tab === 'image' ? null : branch,
      imageRef: tab === 'image' ? imageRef : null,
      containerPort: Number(containerPort),
      memoryLimitMb: Number(memoryLimitMb),
    }

    const res = await api.post(`/projects/${projectId}/apps`, payload)
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    onCreated()
    onClose()
  }

  const inputClass =
    'mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dlg"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-dlg" className="text-base font-semibold">
          App baru
        </h2>

        <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-hikari ${
                tab === t.id
                  ? 'border-brand font-medium text-brand-text'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="aname" className="block text-sm font-medium">
              Nama app
            </label>
            <input
              id="aname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="web"
              className={inputClass}
              required
              autoFocus
            />
          </div>

          {tab !== 'image' && (
            <>
              <div>
                <label htmlFor="repo" className="block text-sm font-medium">
                  Repo URL
                </label>
                <input
                  id="repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={
                    tab === 'github'
                      ? 'git@github.com:user/repo.git'
                      : 'https://gitlab.com/user/repo.git'
                  }
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>

              <div>
                <label htmlFor="branch" className="block text-sm font-medium">
                  Branch
                </label>
                <input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>
            </>
          )}

          {tab === 'image' && (
            <div>
              <label htmlFor="img" className="block text-sm font-medium">
                Image
              </label>
              <input
                id="img"
                value={imageRef}
                onChange={(e) => setImageRef(e.target.value)}
                placeholder="nginx:alpine"
                className={`${inputClass} font-mono`}
                required
              />
              <p className="mt-1 text-xs text-ink-subtle">
                Nggak usah build. Cocok buat app berat yang gagal kalau di-build di VPS.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="port" className="block text-sm font-medium">
                Port container
              </label>
              <input
                id="port"
                type="number"
                min="1"
                max="65535"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="mem" className="block text-sm font-medium">
                Batas RAM (MB)
              </label>
              <input
                id="mem"
                type="number"
                min="64"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Bikin app'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Bikin `apps/web/src/routes/_panel.projects.$projectId.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { AppRecord, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { AppCard } from '../components/apps/app-card'
import { CreateAppDialog } from '../components/apps/create-app-dialog'

export const Route = createFileRoute('/_panel/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { username } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [apps, setApps] = useState<AppRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [p, a] = await Promise.all([
      api.get<{ project: Project }>(`/projects/${projectId}`),
      api.get<{ apps: AppRecord[] }>(`/projects/${projectId}/apps`),
    ])

    setLoading(false)

    if (!p.ok) {
      setError(p.error)
      return
    }

    setError(null)
    setProject(p.data?.project ?? null)
    setApps(a.data?.apps ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell
      username={username ?? 'admin'}
      title={project?.name ?? 'Project'}
      actions={<Button onClick={() => setDialogOpen(true)}>App baru</Button>}
    >
      <div className="mb-4">
        <Link to="/" className="text-sm text-brand-text transition-hikari hover:underline">
          ← Semua project
        </Link>
      </div>

      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && apps.length === 0 && (
        <p className="text-sm text-ink-muted">
          Belum ada app di project ini. Bikin app pertama buat mulai deploy.
        </p>
      )}

      {!loading && !error && apps.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}

      {dialogOpen && (
        <CreateAppDialog
          projectId={projectId}
          onCreated={load}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </AppShell>
  )
}
```

- [ ] **Step 4: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 5: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): project detail with app list and create dialog"
```

---

## Task 34: Halaman Detail App

**File:**
- Create: `apps/web/src/routes/_panel.apps.$appId.tsx`
- Create: `apps/web/src/components/apps/app-actions.tsx`
- Create: `apps/web/src/components/apps/app-stats.tsx`
- Create: `apps/web/src/components/apps/app-logs.tsx`

**Antarmuka:**
- Tab: Overview / Deployments / Logs / Env / Domains
- Tombol: Deploy, Stop, Restart
- Stats diambil **cuma pas tab Overview dibuka**
- Log diambil **cuma pas tab Logs dibuka**

- [ ] **Step 1: Bikin `apps/web/src/components/apps/app-actions.tsx`**

```tsx
import { useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

export function AppActions({
  appId,
  onChanged,
}: {
  appId: string
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(label: string, path: string) {
    setBusy(label)
    setError(null)
    const res = await api.post(`/apps/${appId}${path}`)
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act('deploy', '/deploy')} disabled={busy !== null}>
          {busy === 'deploy' ? 'Ngantre...' : 'Deploy'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => act('restart', '/restart')}
          disabled={busy !== null}
        >
          {busy === 'restart' ? 'Restart...' : 'Restart'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => act('stop', '/stop')}
          disabled={busy !== null}
        >
          {busy === 'stop' ? 'Ngasih stop...' : 'Stop'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Bikin `apps/web/src/components/apps/app-stats.tsx`**

```tsx
import type { ContainerStats } from '../../lib/types'
import { Card, CardBody } from '../ui/card'

export function AppStats({
  stats,
  dockerAvailable,
  running,
}: {
  stats: ContainerStats | null
  dockerAvailable: boolean
  running: boolean
}) {
  if (!dockerAvailable) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            Nggak bisa nyambung ke Docker. Cek apakah Docker jalan:
            <code className="ml-1 font-mono">systemctl status docker</code>
          </p>
        </CardBody>
      </Card>
    )
  }

  if (!running || !stats) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">Container lagi nggak jalan.</p>
        </CardBody>
      </Card>
    )
  }

  const rows = [
    { label: 'CPU', value: `${stats.cpuPercent}%` },
    { label: 'RAM', value: `${stats.memoryUsedMb} / ${stats.memoryLimitMb} MB` },
    { label: 'Pemakaian RAM', value: `${stats.memoryPercent}%` },
  ]

  return (
    <Card>
      <CardBody>
        <dl className="grid grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-ink-subtle">{row.label}</dt>
              <dd className="mt-0.5 font-mono text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-subtle">
          Angka ini diambil saat halaman dibuka. Nggak ada riwayat.
        </p>
      </CardBody>
    </Card>
  )
}
```

- [ ] **Step 3: Bikin `apps/web/src/components/apps/app-logs.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

type LogLine = { stream: 'stdout' | 'stderr'; text: string }

export function AppLogs({ appId }: { appId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<{ lines: LogLine[] }>(`/apps/${appId}/logs?tail=200`)
    setLoading(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setLines(res.data?.lines ?? [])
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => void load(), 3000)
    return () => clearInterval(id)
  }, [auto, load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={load}>
          Muat ulang
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Ikutin otomatis (3 detik)
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="max-h-[32rem] overflow-auto rounded-card border border-line bg-neutral-950 p-4">
        {loading && <p className="text-xs text-neutral-400">Memuat...</p>}

        {!loading && lines.length === 0 && (
          <p className="text-xs text-neutral-400">Belum ada log.</p>
        )}

        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={line.stream === 'stderr' ? 'text-red-400' : 'text-neutral-200'}
            >
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Bikin `apps/web/src/routes/_panel.apps.$appId.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { AppRecord, ContainerStats, Deployment, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { StatusDot } from '../components/ui/status-dot'
import { AppActions } from '../components/apps/app-actions'
import { AppStats } from '../components/apps/app-stats'
import { AppLogs } from '../components/apps/app-logs'

export const Route = createFileRoute('/_panel/apps/$appId')({ component: AppDetailPage })

type Tab = 'overview' | 'deployments' | 'logs' | 'env' | 'domains'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'logs', label: 'Logs' },
  { id: 'env', label: 'Env' },
  { id: 'domains', label: 'Domains' },
]

function AppDetailPage() {
  const { appId } = Route.useParams()
  const { username } = useAuth()

  const [app, setApp] = useState<AppRecord | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [running, setRunning] = useState(false)
  const [dockerAvailable, setDockerAvailable] = useState(true)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const load = useCallback(async () => {
    const detail = await api.get<{ app: AppRecord }>(`/apps/${appId}`)
    if (!detail.ok) {
      setError(detail.error)
      setLoading(false)
      return
    }

    const record = detail.data!.app
    setApp(record)

    const [p, s, d] = await Promise.all([
      api.get<{ project: Project }>(`/projects/${record.project_id}`),
      api.get<{
        status: string
        dockerAvailable: boolean
        container: { running: boolean } | null
        stats: ContainerStats | null
      }>(`/apps/${appId}/status`),
      api.get<{ deployments: Deployment[] }>(`/apps/${appId}/deployments`),
    ])

    if (p.ok) setProject(p.data?.project ?? null)
    if (s.ok) {
      setDockerAvailable(s.data?.dockerAvailable ?? true)
      setRunning(s.data?.container?.running ?? false)
      setStats(s.data?.stats ?? null)
    }
    if (d.ok) setDeployments(d.data?.deployments ?? [])

    setLoading(false)
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab !== 'overview') return
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [tab, load])

  return (
    <AppShell username={username ?? 'admin'} title={app?.name ?? 'App'}>
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {app && (
        <div className="space-y-4">
          <div>
            <Link
              to="/projects/$projectId"
              params={{ projectId: app.project_id }}
              className="text-sm text-brand-text transition-hikari hover:underline"
            >
              ← {project?.name ?? 'Project'}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-xs text-ink-subtle">{app.slug}</span>
              <StatusDot status={app.status} />
            </div>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-hikari ${
                  tab === t.id
                    ? 'border-brand font-medium text-brand-text'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <AppActions appId={appId} onChanged={load} />
              <AppStats
                stats={stats}
                dockerAvailable={dockerAvailable}
                running={running}
              />
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-medium">Konfigurasi</h2>
                </CardHeader>
                <CardBody>
                  <dl className="space-y-1.5 text-sm">
                    <Row label="Sumber" value={app.source_type} mono />
                    {app.repo_url && <Row label="Repo" value={app.repo_url} mono />}
                    {app.branch && <Row label="Branch" value={app.branch} mono />}
                    {app.image_ref && <Row label="Image" value={app.image_ref} mono />}
                    <Row label="Port" value={String(app.container_port)} mono />
                    <Row label="Batas RAM" value={`${app.memory_limit_mb} MB`} mono />
                    <Row label="Batas CPU" value={String(app.cpu_limit)} mono />
                  </dl>
                </CardBody>
              </Card>
            </div>
          )}

          {tab === 'deployments' && (
            <div>
              {deployments.length === 0 && (
                <p className="text-sm text-ink-muted">Belum ada deployment.</p>
              )}
              <div className="space-y-2">
                {deployments.map((d) => (
                  <Card key={d.id}>
                    <CardBody>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-ink-subtle">
                          {d.id.slice(0, 10)}
                        </span>
                        <span className="text-sm">{d.status}</span>
                      </div>
                      {d.commit_message && (
                        <p className="mt-1.5 text-sm text-ink-muted">{d.commit_message}</p>
                      )}
                      {d.error && (
                        <p className="mt-1.5 font-mono text-xs text-danger">{d.error}</p>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === 'logs' && <AppLogs appId={appId} />}
        </div>
      )}
    </AppShell>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
```

- [ ] **Step 5: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 6: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): app detail page with tabs, stats, and logs"
```

---

## Task 35: Tab Env & Domains

**File:**
- Create: `apps/web/src/components/apps/app-env.tsx`
- Create: `apps/web/src/components/apps/app-domains.tsx`
- Modify: `apps/web/src/routes/_panel.apps.$appId.tsx`

**Antarmuka:**
- Tab Env: tambah/hapus env var, yang rahasia ditampilin `••••••••`
- Tab Domains: tambah/hapus domain, tampilin status TLS, tunjukin perintah `ssh -L` buat tunnel

- [ ] **Step 1: Bikin `apps/web/src/components/apps/app-env.tsx`**

```tsx
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
              Anggap rahasia (disimpen terenkripsi)
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
                      {v.isSecret ? '••••••••' : v.value}
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
```

- [ ] **Step 2: Bikin `apps/web/src/components/apps/app-domains.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Domain } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, CardBody } from '../ui/card'

const TLS_LABEL: Record<Domain['tls_status'], string> = {
  pending: 'Nunggu sertifikat',
  active: 'HTTPS aktif',
  failed: 'Gagal',
}

export function AppDomains({
  appId,
  containerPort,
}: {
  appId: string
  containerPort: number
}) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [hostname, setHostname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<{ domains: Domain[] }>(`/apps/${appId}/domains`)
    if (res.ok) setDomains(res.data?.domains ?? [])
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post(`/apps/${appId}/domains`, { hostname })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setHostname('')
    await load()
  }

  async function remove(id: string) {
    await api.del(`/apps/${appId}/domains/${id}`)
    await load()
  }

  const tunnelCommand = `ssh -L ${containerPort}:localhost:${containerPort} user@ip-vps-kamu`

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label htmlFor="host" className="block text-sm font-medium">
                Domain
              </label>
              <input
                id="host"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="app.contoh.com"
                className="mt-1 w-full rounded-card border border-line px-3 py-2 font-mono text-sm transition-hikari focus:border-brand"
                required
              />
              <p className="mt-1 text-xs text-ink-subtle">
                Arahin record A domain ini ke IP VPS dulu. Sertifikat HTTPS-nya
                diterbitin otomatis.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Tambah domain'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {domains.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada domain.</p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <Card key={d.id}>
              <CardBody>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{d.hostname}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {TLS_LABEL[d.tls_status]}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => remove(d.id)}>
                    Hapus
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardBody>
          <h3 className="text-sm font-medium">Akses tanpa domain</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Kalau cuma mau ngakses dari laptop sendiri, pakai SSH tunnel aja. Lebih
            aman karena port-nya nggak kebuka ke internet.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-card bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200">
            {tunnelCommand}
          </pre>
        </CardBody>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Sambungin ke halaman app**

Di `apps/web/src/routes/_panel.apps.$appId.tsx`, tambahin import:

```typescript
import { AppEnv } from '../components/apps/app-env'
import { AppDomains } from '../components/apps/app-domains'
```

Terus ganti bagian tab `logs` jadi:

```tsx
          {tab === 'logs' && <AppLogs appId={appId} />}
          {tab === 'env' && <AppEnv appId={appId} />}
          {tab === 'domains' && app && (
            <AppDomains appId={appId} containerPort={app.container_port} />
          )}
```

- [ ] **Step 4: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 5: Commit**

```bash
git add apps/web
GIT_EDITOR=true git commit -m "feat(web): env and domains tabs"
```

---

<!-- TASK36-START -->
## Task 36: Wiring Final `app.ts`

Ini **satu-satunya** tempat `app.ts` ditulis. Task 1–26 udah bikin semua fungsi
`create*Routes`, tapi belum ada yang dipasang. Task ini yang nyatuin semuanya.

Dikerjain **setelah Task 27–35 selesai**, karena butuh semua route dan
komponen udah ada.

**File:**
- Modify (tuntas): `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Ganti isi `apps/server/src/app.ts`**

```typescript
import { Hono } from 'hono'
import { join } from 'node:path'
import { runDeployQueue } from './build/deploy-queue'
import { syncCaddy } from './caddy/service'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { loadOrCreateKey } from './lib/crypto'
import { requireAuth } from './middleware/auth'
import { createAppRoutes } from './routes/apps'
import { createAuthRoutes } from './routes/auth'
import { createProjectRoutes } from './routes/projects'
import { createWebhookInfoRoute, createWebhookRoutes } from './routes/webhooks'

/**
 * Handler rute dikumpulin di satu objek deps, bukan argumen posisional.
 * Nambah field nggak bikin signature pecah.
 */
export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
  dataDir?: string
  staticDir?: string
  caddyfilePath?: string
  panelDomain?: string | null
  acmeEmail?: string
}

export function createApp(config: AppConfig): Hono {
  const dataDir = config.dataDir ?? '/var/lib/hikari'

  const db = openDatabase(config.dbPath)
  runMigrations(db)
  const cryptoKey = loadOrCreateKey(config.keyPath)

  const deployKeyDir = join(dataDir, 'keys')
  const logDir = join(dataDir, 'logs')
  const workDir = join(dataDir, 'work')
  const knownHostsPath = join(dataDir, 'known_hosts')

  const app = new Hono()

  // --- Health ---------------------------------------------------------
  app.get('/api/health', (c) => c.json({ status: 'ok', version: HIKARI_VERSION }))

  // --- Auth (publik) ---------------------------------------------------
  app.route('/api', createAuthRoutes(db, cryptoKey))

  // --- Webhook (publik, dijaga HMAC sendiri) ---------------------------
  app.route('/api', createWebhookRoutes({ db, onPush: queue.enqueue }))

  // --- Semua sisanya butuh login --------------------------------------
  const auth = requireAuth(db, cryptoKey)
  app.use('/api/projects', auth)
  app.use('/api/projects/*', auth)
  app.use('/api/apps/*', auth)

  app.route('/api', createProjectRoutes(db))
  app.route('/api', createWebhookInfoRoute(db))
  app.route(
    '/api',
    createAppRoutes({
      db,
      cryptoKey,
      deployKeyDir,
      onDeploy: queue.enqueue,
      onDomainChange: () => {
        void syncCaddy({
          db,
          caddyfilePath: config.caddyfilePath ?? '/etc/caddy/Caddyfile',
          panelPort: config.port,
          panelDomain: config.panelDomain ?? null,
          adminUrl: 'http://127.0.0.1:2019/load',
          acmeEmail: config.acmeEmail,
        }).catch((err) => console.error('[hikari] sync caddy gagal:', err))
      },
    })
  )

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
```

- [ ] **Step 2: Bikin `apps/server/src/build/deploy-queue.ts`**

Antrean cuma boleh satu build jalan. Ini pembungkus tipis di atas
`createBuildQueue` yang udah dites di Task 20.

```typescript
import type { App } from '../repositories/apps'
import { deployApp, type DeployDeps } from './pipeline'
import { createBuildQueue } from './queue'

export type DeployQueueDeps = {
  db: DeployDeps['db']
  docker: DeployDeps['docker']
  cryptoKey: Buffer
  logDir: string
  workDir: string
  buildFn: (app: App, deploymentId: string) => Promise<{ imageTag: string }>
}

export function createDeployQueue(deps: DeployQueueDeps) {
  return createBuildQueue(async (appId: string) => {
    const hasil = await deployApp(
      {
        db: deps.db,
        docker: deps.docker,
        cryptoKey: deps.cryptoKey,
        logDir: deps.logDir,
        workDir: deps.workDir,
        buildFn: deps.buildFn,
      },
      appId
    )
    if (!hasil.ok) {
      console.error(`[hikari] deploy ${appId} gagal: ${hasil.error}`)
    }
  })
}
```

- [ ] **Step 3: Ganti isi `apps/server/src/index.ts`**

```typescript
import { createApp } from './app'

const PORT = Number(process.env.HIKARI_PORT ?? 2508)
const DATA_DIR = process.env.HIKARI_DATA ?? '/var/lib/hikari'

const app = createApp({
  dbPath: process.env.HIKARI_DB ?? `${DATA_DIR}/hikari.sqlite`,
  keyPath: process.env.HIKARI_KEY ?? `${DATA_DIR}/secret.key`,
  port: PORT,
  dataDir: DATA_DIR,
  staticDir: process.env.HIKARI_STATIC ?? `${DATA_DIR}/www`,
  caddyfilePath: process.env.HIKARI_CADDYFILE ?? '/etc/caddy/Caddyfile',
  panelDomain: process.env.HIKARI_PANEL_DOMAIN ?? null,
  acmeEmail: process.env.HIKARI_ACME_EMAIL,
})

console.log(`[hikari] jalan di http://0.0.0.0:${PORT}`)

export default { port: PORT, fetch: app.fetch }
```

- [ ] **Step 4: Jalanin semua tes**

Run: `bun run typecheck && bun test`
Expected: PASS — semua lolos, nggak ada error tipe

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(server): single authoritative app wiring"
```

---

## Task 36b: Halaman Settings

**File:**
- Create: `apps/web/src/routes/_panel.settings.tsx`

**Antarmuka:**
- Nama panel, domain panel, port panel (semua **read-only**, nilainya dari
  env systemd — panel nggak nyimpen ini ke database)
- Tampilin versi + status server
- Tombol "Sync Caddy" yang **beneran manggil endpoint**

Catatan: versi lama rencana ini nyuruh nampilin logo, status Docker, dan
pemakaian disk — nggak ada satu pun yang punya endpoint-nya di Fase 1. Field
nama/domain/port juga `defaultValue` tanpa handler, jadi kelihatan bisa
disimpen padahal nggak. Di Fase 1 halaman ini **cuma nampilin**, nggak ngubah.

- [ ] **Step 1: Bikin endpoint settings di `apps/server/src/routes/settings.ts`**

```typescript
import { Hono } from 'hono'
import { totalmem, freemem } from 'node:os'
import type { Database } from '../db/client'
import { HIKARI_VERSION } from '../lib/version'
import { pingDocker, getDocker } from '../docker/client'

const MB = 1024 * 1024

export type SettingsDeps = {
  db: Database
  dataDir: string
  onSyncCaddy: () => void
}

export function createSettingsRoutes(deps: SettingsDeps): Hono {
  const router = new Hono()

  router.get('/settings', async (c) => {
    const dockerAvailable = await pingDocker(getDocker())
    return c.json({
      version: HIKARI_VERSION,
      dataDir: deps.dataDir,
      dockerAvailable,
      ramUsedMb: Math.round((totalmem() - freemem()) / MB),
      ramTotalMb: Math.round(totalmem() / MB),
    })
  })

  router.post('/settings/sync-caddy', (c) => {
    deps.onSyncCaddy()
    return c.json({ ok: true })
  })

  return router
}
```

Terus di `app.ts`, di dalem blok yang butuh login, tambahin:

```typescript
  app.route(
    '/api',
    createSettingsRoutes({
      db,
      dataDir,
      onSyncCaddy: () => {
        void syncCaddy({...})
      },
    })
  )
```

Catatan: `onSyncCaddy` dan `onDomainChange` manggil `syncCaddy` yang sama —
bikin satu fungsi `syncCaddySekarang()` di `app.ts` biar nggak duplikat
argumennya.

- [ ] **Step 2: Ganti isi `apps/web/src/routes/_panel.settings.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardBody, CardHeader } from '../components/ui/card'

export const Route = createFileRoute('/_panel/settings')({ component: SettingsPage })

type Settings = {
  version: string
  dataDir: string
  dockerAvailable: boolean
  ramUsedMb: number
  ramTotalMb: number
}

function SettingsPage() {
  const { username } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Settings>('/settings')
    if (res.ok) setSettings(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function syncCaddy() {
    const res = await api.post('/settings/sync-caddy')
    setPesan(res.ok ? 'Config Caddy disinkron ulang.' : res.error)
  }

  return (
    <AppShell username={username ?? 'admin'} title="Settings">
      <div className="max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Panel</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Versi Hikari</dt>
                <dd className="font-mono text-xs">{settings?.version ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Folder data</dt>
                <dd className="font-mono text-xs">{settings?.dataDir ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Port panel</dt>
                <dd className="font-mono text-xs">2508</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-subtle">
              Nama, domain, dan port panel diatur lewat file systemd
              (<span className="font-mono">/etc/systemd/system/hikari.service</span>),
              bukan dari halaman ini.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Status</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Docker</dt>
                <dd className="font-mono text-xs">
                  {settings ? (settings.dockerAvailable ? 'nyambung' : 'nggak nyambung') : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">RAM VPS</dt>
                <dd className="font-mono text-xs">
                  {settings ? `${settings.ramUsedMb} / ${settings.ramTotalMb} MB` : '—'}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Proxy</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Kalau domain nggak kebaca sama Caddy, coba sinkron ulang.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="ghost" onClick={syncCaddy}>
                Sync Caddy
              </Button>
              {pesan && <span className="text-xs text-ink-muted">{pesan}</span>}
            </div>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 3: Verifikasi build**

Run: `cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 4: Commit**

```bash
GIT_EDITOR=true git commit -m "feat(web): read-only settings page with real endpoints"
```

---

## Task 36c: Hook Interval yang Sadar Tab

Ini yang bikin aturan "nggak ada proses yang nyala terus" beneran berlaku di
frontend. Semua polling wajib lewat hook ini.

**File:**
- Create: `apps/web/src/hooks/use-visible-interval.ts`
- Create: `apps/web/src/hooks/use-visible-interval.test.ts`
- Modify: `apps/web/src/routes/_panel.apps.$appId.tsx`
- Modify: `apps/web/src/components/apps/app-logs.tsx`

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/web/src/hooks/use-visible-interval.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { shouldPoll } from './use-visible-interval'

describe('shouldPoll', () => {
  test('jalan kalau tab kelihatan', () => {
    expect(shouldPoll({ visible: true, active: true })).toBe(true)
  })

  test('nggak jalan kalau tab disembunyiin', () => {
    expect(shouldPoll({ visible: false, active: true })).toBe(false)
  })

  test('nggak jalan kalau fitur polling dimatiin', () => {
    expect(shouldPoll({ visible: true, active: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/web && bun test src/hooks/use-visible-interval.test.ts`
Expected: FAIL — "Cannot find module './use-visible-interval'"

- [ ] **Step 3: Bikin `apps/web/src/hooks/use-visible-interval.ts`**

```typescript
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
```

- [ ] **Step 4: Sambungin ke halaman app**

Di `apps/web/src/routes/_panel.apps.$appId.tsx`, ganti effect polling jadi:

```tsx
import { useVisibleInterval } from '../hooks/use-visible-interval'

// ...

  // Cuma polling pas tab Overview kebuka DAN tab browser-nya kelihatan.
  useVisibleInterval(() => void load(), 15_000, tab === 'overview')
```

Hapus blok `useEffect` yang lama (`setInterval(load, 5000)`).

Di `apps/web/src/components/apps/app-logs.tsx`, ganti:

```tsx
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => void load(), 3000)
    return () => clearInterval(id)
  }, [auto, load])
```

jadi:

```tsx
  useVisibleInterval(() => void load(), 10_000, auto)
```

Dan tambahin importnya. Label checkbox-nya ganti jadi `"Ikutin otomatis (10 detik)"`.

- [ ] **Step 5: Verifikasi build**

Run: `bun run typecheck && cd apps/web && bun run build`
Expected: build sukses

- [ ] **Step 6: Commit**

```bash
GIT_EDITOR=true git commit -m "feat(web): visibility-aware polling instead of always-on intervals"
```

---
<!-- TASK36-END -->

# BAGIAN 5 — PENUTUP

## Task 37: Serve Frontend dari Hono

**File:**
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/src/static.ts`
- Create: `apps/server/src/static.test.ts`

**Antarmuka:**
- Hono nyerve `apps/web/dist` sebagai file statis
- Semua route yang bukan `/api/*` balikin `index.html` (SPA fallback)
- `/api/*` yang nggak ketemu tetep balikin 404 JSON

- [ ] **Step 1: Tulis tes yang gagal**

Bikin `apps/server/src/static.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mountStatic } from './static'
import { Hono } from 'hono'

let dir: string
let staticDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hikari-static-'))
  staticDir = join(dir, 'dist')
  mkdirSync(staticDir, { recursive: true })
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><h1>Hikari</h1>')
  writeFileSync(join(staticDir, 'app.js'), 'console.log("hai")')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** App minimal: mountStatic didaftarin SEBELUM notFound. */
function staticApp() {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  mountStatic(app, staticDir)
  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))
  return app
}

describe('serve frontend', () => {
  test('route root balikin index.html', async () => {
    const res = await staticApp().request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hikari')
  })

  test('route SPA yang nggak ada tetep balikin index.html', async () => {
    const res = await staticApp().request('/projects/abc')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hikari')
  })

  test('file statis bisa diambil', async () => {
    const res = await staticApp().request('/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('console.log')
  })

  test('API yang nggak ada tetep 404 JSON, bukan index.html', async () => {
    const res = await staticApp().request('/api/nggak-ada')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  test('health tetep jalan', async () => {
    const res = await staticApp().request('/api/health')
    expect(res.status).toBe(200)
  })

  test('path traversal ditolak', async () => {
    const res = await staticApp().request('/../secret.txt')
    expect(res.status).toBe(200)
    // Harus fallback ke index.html, bukan bocorin file di luar staticDir.
    expect(await res.text()).toContain('Hikari')
  })

  test('aset ber-hash di-cache lama, index.html nggak', async () => {
    const a = staticApp()
    const js = await a.request('/app.js')
    expect(js.headers.get('cache-control')).toBe('no-cache')

    writeFileSync(join(staticDir, 'app-9f3a2b1c.js'), 'console.log(1)')
    const hashed = await a.request('/app-9f3a2b1c.js')
    expect(hashed.headers.get('cache-control')).toContain('immutable')
  })
})
```

Catatan: tes ini nge-mount `mountStatic` sendiri, **nggak** lewat `createApp`.
Alasannya: urutan registrasi middleware harus dites apa adanya, bukan
ketelen sama wiring `app.ts` yang gede.

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/static.test.ts`
Expected: FAIL — "Cannot find module './static'"

- [ ] **Step 3: Bikin `apps/server/src/static.ts`**

Baca file pakai `Bun.file()`, **bukan** `readFileSync`. Kalau pakai file sync,
tiap request nurunin seluruh proses Hono — satu file 5MB bikin panel freeze
beberapa ratus milidetik.

```typescript
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

/** Vite nge-hash nama file aset, jadi aman di-cache lama. */
function cacheHeader(filePath: string): string {
  return /\.[0-9a-f]{8,}\./.test(filePath)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
}

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

    // Cegah path traversal: normalisasi, buang awalan ../, terus pastiin
    // hasilnya masih di dalem staticDir.
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
```

- [ ] **Step 4: Update `app.ts`**

Tambahin ke `AppConfig`:

```typescript
  staticDir?: string
```

Tambahin import:

```typescript
import { mountStatic } from './static'
```

**Urutannya penting.** `mountStatic` harus dipanggil **sebelum**
`app.notFound(...)`:

```typescript
  if (config.staticDir) {
    mountStatic(app, config.staticDir)
  }

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))
```

Dokumentasi Hono juga nyaranin `serveStatic` dari `hono/bun` kalau mau lebih
ringkas — `mountStatic` di atas ditulis tangan biar aturan "`/api/*` tetep 404
JSON" dan SPA fallback-nya eksplisit dan bisa dites.

- [ ] **Step 5: Tambah tes cache header**

Udah termasuk di blok tes di atas. Jalanin semuanya:

Run: `cd apps/server && bun test src/static.test.ts`
Expected: PASS — 7 tes lolos

- [ ] **Step 5: Jalanin semua tes**

Run: `cd apps/server && bun test`
Expected: PASS — semua lolos

- [ ] **Step 6: Commit**

```bash
git add apps/server/src
GIT_EDITOR=true git commit -m "feat(server): async static serving with SPA fallback"
```

---

## Task 38: Pembersihan Log Build Terjadwal (Saat Deploy)

**File:**
- Modify: `apps/server/src/docker/maintenance.ts`
- Modify: `apps/server/src/docker/maintenance.test.ts`

**Antarmuka:**
- `pruneBuildLogs(logDir, maxAgeDays): number` — hapus file log yang tua
- Dipanggil **di jalur deploy**, bukan cron (biar nggak ada proses permanen)

- [ ] **Step 1: Tambahin tes yang gagal**

Tambahkan ke `apps/server/src/docker/maintenance.test.ts`:

```typescript
import { mkdtempSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneBuildLogs } from './maintenance'

describe('pruneBuildLogs', () => {
  test('hapus log yang lebih tua dari batas hari', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hikari-logs-'))

    const tua = join(dir, 'tua.log')
    const baru = join(dir, 'baru.log')
    writeFileSync(tua, 'log lama')
    writeFileSync(baru, 'log baru')

    const delapanHariLalu = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(tua, delapanHariLalu, delapanHariLalu)

    const dihapus = pruneBuildLogs(dir, 7)
    expect(dihapus).toBe(1)
    expect(readdirSync(dir)).toEqual(['baru.log'])

    rmSync(dir, { recursive: true, force: true })
  })

  test('nggak error kalau folder-nya nggak ada', () => {
    expect(pruneBuildLogs('/folder/nggak/ada', 7)).toBe(0)
  })

  test('nggak hapus apa-apa kalau semua masih baru', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hikari-logs-'))
    writeFileSync(join(dir, 'a.log'), 'x')
    expect(pruneBuildLogs(dir, 7)).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Jalanin tes, pastiin gagal**

Run: `cd apps/server && bun test src/docker/maintenance.test.ts`
Expected: FAIL — `pruneBuildLogs` belum ada

- [ ] **Step 3: Tambahin implementasi**

Tambahkan di `apps/server/src/docker/maintenance.ts`. Perhatiin impor `node:fs`
udah dipakai `pruneOldDeployments` dari Task 16 — gabungin, jangan duplikat:

```typescript
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function pruneBuildLogs(logDir: string, maxAgeDays: number): number {
  if (!existsSync(logDir)) return 0

  const batas = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let dihapus = 0

  for (const nama of readdirSync(logDir)) {
    if (!nama.endsWith('.log')) continue

    const path = join(logDir, nama)
    try {
      if (statSync(path).mtimeMs < batas) {
        rmSync(path)
        dihapus += 1
      }
    } catch {
      // file udah nggak ada, lanjut
    }
  }

  return dihapus
}
```

- [ ] **Step 4: Jalanin tes, pastiin lolos**

Run: `cd apps/server && bun test src/docker/maintenance.test.ts`
Expected: PASS — 8 tes lolos

- [ ] **Step 5: Sambungin ke pipeline deploy**

Udah disambungin di Task 23 (`pruneBuildLogs(logDir, 30)` tepat setelah
`pruneOldDeployments`). Langkah ini cuma buat verifikasi bahwa panggilannya ada:

Run: `grep -n "pruneBuildLogs" apps/server/src/build/pipeline.ts`
Expected: satu baris ketemu, dipanggil di dalem blok `try` jalur sukses

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/docker
GIT_EDITOR=true git commit -m "feat(docker): prune stale build logs on deploy path"
```

---

## Task 39: Install Script

**File:**
- Create: `install.sh`

- [ ] **Step 1: Bikin `install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="ridhoarh/Hikari-2nd-Panel"
VERSION="${HIKARI_VERSION:-latest}"
PORT="${HIKARI_PORT:-2508}"
INSTALL_DIR="/opt/hikari"
DATA_DIR="/var/lib/hikari"
SERVICE_USER="hikari"

log()  { printf '\033[0;36m[hikari]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Jalanin pakai sudo: curl -fsSL ... | sudo bash"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) fail "Cuma Ubuntu/Debian yang didukung. Ketemu: ${ID:-unknown}" ;;
  esac
else
  fail "Nggak bisa baca /etc/os-release"
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker belum ada, install dulu..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker udah ada: $(docker --version)"
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  fail "Port ${PORT} udah kepake. Matiin dulu prosesnya."
fi

if command -v git >/dev/null 2>&1; then
  log "Git udah ada"
else
  log "Install git..."
  apt-get update -qq && apt-get install -y -qq git
fi

log "Bikin user ${SERVICE_USER}..."
id -u "${SERVICE_USER}" >/dev/null 2>&1 || \
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

log "Siapin folder..."
mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${DATA_DIR}/keys" "${DATA_DIR}/logs" "${DATA_DIR}/work"

# Tarball harus udah ada node_modules-nya di dalem, karena ExecStart ngejalanin
# TypeScript source langsung dan `bun install` nggak dijalani pas install.
# Yang bikin tarball: `.github/workflows/release.yml` (bun install --production,
# build web, tar semuanya). Kalau rilis-nya belum ada, curl bakal 404 dan kita
# kasih pesan yang jelas, bukan gagal di tengah jalan.
if [ "${VERSION}" = "latest" ]; then
  TARBALL="https://github.com/${REPO}/releases/latest/download/hikari.tar.gz"
else
  TARBALL="https://github.com/${REPO}/releases/download/${VERSION}/hikari.tar.gz"
fi

log "Download Hikari..."
if ! curl -fsSL "${TARBALL}" | tar -xz -C "${INSTALL_DIR}"; then
  fail "Gagal download ${TARBALL}. Pastiin rilis-nya udah ada di GitHub Releases."
fi

# Frontend hasil build harus ada di DATA_DIR/www biar HIKARI_STATIC nemu.
mkdir -p "${DATA_DIR}/www"
if [ -d "${INSTALL_DIR}/apps/web/dist" ]; then
  cp -r "${INSTALL_DIR}/apps/web/dist/." "${DATA_DIR}/www/"
fi

command -v bun >/dev/null 2>&1 || {
  log "Install Bun..."
  curl -fsSL https://bun.sh/install | bash
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
}

# Pin host key SSH sekali. Tanpa ini, git clone nggak bisa verifikasi identitas
# server git, jadi deploy key bisa dicuri lewat MITM.
if command -v ssh-keyscan >/dev/null 2>&1; then
  log "Pin host key SSH..."
  ssh-keyscan -t ed25519,rsa github.com gitlab.com codeberg.org \
    > "${DATA_DIR}/known_hosts" 2>/dev/null || true
  chmod 644 "${DATA_DIR}/known_hosts"
fi

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" "${DATA_DIR}"

log "Pasang systemd unit..."
cat > /etc/systemd/system/hikari.service <<UNIT
[Unit]
Description=Hikari
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/local/bin/bun run ${INSTALL_DIR}/apps/server/src/index.ts
Restart=always
RestartSec=5
# Bun nge-spawn subprocess (git, docker, railpack). KillMode=mixed biar
# proses anak-nya ikut mati pas service-nya distop.
KillMode=mixed
TimeoutStopSec=30
Environment=HIKARI_PORT=${PORT}
Environment=HIKARI_DATA=${DATA_DIR}
Environment=HIKARI_DB=${DATA_DIR}/hikari.sqlite
Environment=HIKARI_KEY=${DATA_DIR}/secret.key
Environment=HIKARI_STATIC=${DATA_DIR}/www
Environment=HIKARI_CADDYFILE=/etc/caddy/Caddyfile
Environment=PATH=/usr/local/bin:/usr/bin:/bin
SupplementaryGroups=docker

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now hikari

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
log "Selesai."
log "Buka http://${IP:-IP-VPS-KAMU}:${PORT} buat setup akun admin."
```

- [ ] **Step 2: Bikin file executable**

Run: `chmod +x install.sh`
Expected: nggak ada output

- [ ] **Step 3: Cek sintaks**

Run: `bash -n install.sh`
Expected: nggak ada output (sintaks valid)

- [ ] **Step 4: Bikin `.github/workflows/release.yml`**

Tanpa ini, `install.sh` nggak punya apa-apa buat di-download.

```yaml
name: release

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run build
      - run: bun install --production
      - run: tar -czf hikari.tar.gz apps packages bunfig.toml package.json node_modules
      - uses: softprops/action-gh-release@v2
        with:
          files: hikari.tar.gz
```

- [ ] **Step 5: Commit**

```bash
git add install.sh .github/workflows/release.yml
GIT_EDITOR=true git commit -m "feat: install script with pinned ssh hosts and release workflow"
```

---

## Task 40: README

**File:**
- Create: `README.md`

- [ ] **Step 1: Bikin `README.md`**

```markdown
# Hikari

PaaS pribadi buat VPS sendiri. Sambungin repo GitHub, Hikari yang build, yang
jalanin, yang kasih domain plus HTTPS otomatis.

Bukan PaaS multi-tenant. Bukan klon Coolify. Ini versi kecil yang dipakai
sehari-hari.

## Install

```bash
# Cepat
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh | sudo bash

# Aman: baca dulu, baru jalanin
curl -fsSL https://raw.githubusercontent.com/ridhoarh/Hikari-2nd-Panel/main/install.sh -o install.sh
less install.sh && sudo bash install.sh
```

Buka `http://IP-VPS:2508` buat bikin akun admin.

Cuma Ubuntu/Debian yang didukung. Di distro lain, install script bakal berhenti
sopan.

## Yang Bisa Dilakuin

- Deploy dari GitHub, Git URL, atau Docker Image langsung
- Auto deploy tiap push (webhook GitHub)
- Build Dockerfile, atau Railpack kalau nggak ada Dockerfile
- Domain + HTTPS otomatis lewat Caddy
- Log container
- Statistik CPU/RAM (diambil saat dibuka, nggak ada riwayat)
- Batas RAM/CPU per app — **wajib**, biar satu app nggak matiin seluruh VPS

## Yang Belum Ada

Database, storage, git push deploy, backup otomatis. Lihat
`plan/2026-09-24-hikari-design.md` bagian Fase 2 dan 3.

## Yang Sengaja Nggak Ada

Multi-server, multi user, Prometheus, Grafana, AI gateway, marketplace template.
Ini platform pribadi, bukan produk.

## Update

Jalanin `install.sh` lagi. Nggak ada tombol update di panel, sengaja.

## Jalanin dari Source

```bash
bun install
bun run dev     # server di 2508, web di 5173
bun test
bun run typecheck
bun run build
```

## Butuh

- Ubuntu/Debian
- Bun 1.4+
- Docker Engine 24+
- Domain yang DNS-nya bisa diatur (buat HTTPS)

## Struktur

```
apps/server   Bun + Hono, API + serve frontend
apps/web      Vite + React + TanStack Router
plan/         Rancangan dan rencana implementasi
```

Nggak ada `packages/shared`. Tipe yang dipakai bareng ditulis di
`apps/web/src/lib/types.ts` — cuma segelintir, nggak sepadan sama satu paket
workspace sendiri.

## Rilis

Push tag `v*` (misal `git tag v0.1.0 && git push origin v0.1.0`). Workflow
di `.github/workflows/release.yml` bakal build frontend, bungkus semuanya
sama `node_modules`, terus nempelin `hikari.tar.gz` ke GitHub Releases.
`install.sh` ngambil dari situ.

## Catatan

- Kalau pakai Dokploy di server yang sama, Hikari nggak bisa jalan bareng di
  port 80/443. Hikari di 2508, jadi aman sampai fitur domain dipakai.
- Build dibatasin 768MB dan cuma satu sekaligus. App berat (Next.js, Java, Rust)
  sebaiknya deploy lewat tab **Docker Image**, build-nya di tempat lain.
- Hapus project **nggak** hapus volume Docker. Data kamu aman, tapi harus
  dibersihin manual kalau emang mau dihapus.
- `ssh-keyscan` dijalani sekali pas install buat pin host key GitHub/GitLab.
  Kalau VPS-nya belum ada network pas install, clone bakal gagal jelas —
  itu sengaja, lebih baik gagal jelas daripada jalan tanpa verifikasi.
- Build dibatalin otomatis setelah 30 menit, pull image setelah 10 menit.
  Nggak ada build yang bisa nggantung dan nahan panel.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
GIT_EDITOR=true git commit -m "docs: readme with install and usage"
```

---

# Ringkasan Urutan

| Task | Isi | Bagian |
|---|---|---|
| 1 | Setup repo & tooling | 1 |
| 2 | Database & migrasi | 1 |
| 3 | ULID & helper | 1 |
| 4 | Enkripsi kredensial | 1 |
| 5 | Password hashing | 1 |
| 6 | Kerangka Hono + health | 1 |
| 7 | Session & cookie | 1 |
| 8 | Setup awal & login | 1 |
| 8b | Wiring `app.ts` awal + requireAuth | 1 |
| 9 | Rate limit login | 1 |
| 10 | Repo project | 1 |
| 11 | Endpoint project | 1 |
| 12 | Client Docker | 2 |
| 13 | Bikin & jalanin container | 2 |
| 14 | Statistik container | 2 |
| 15 | Aliran log | 2 |
| 16 | Network & pembersihan | 2 |
| 17 | Repo app | 2 |
| 18 | Repo env var & deployment | 2 |
| 19 | BuildKit | 3 |
| 20 | Antrean build | 3 |
| 21 | Git clone + pin host key | 3 |
| 22 | Strategi build | 3 |
| 22b | Eksekusi build async + tag latest | 3 |
| 23 | Pipeline deploy | 3 |
| 24 | Endpoint app | 3 |
| 25 | Caddy config | 3 |
| 26 | Kelola Caddy | 3 |
| 27 | Webhook GitHub | 3 |
| 28 | Setup frontend | 4 |
| 29 | Tailwind & token warna | 4 |
| 30 | Klien API & login | 4 |
| 31 | Layout & sidebar | 4 |
| 32 | Halaman projects | 4 |
| 33 | Halaman project | 4 |
| 34 | Halaman app | 4 |
| 35 | Tab env & domains | 4 |
| 36 | **Wiring final `app.ts`** | 4 |
| 36b | Halaman settings | 4 |
| 36c | Hook interval sadar-tab | 4 |
| 37 | Serve frontend (async) | 5 |
| 38 | Pembersihan log build | 5 |
| 39 | Install script + release workflow | 5 |
| 40 | README | 5 |

**Urutan pengerjaan:** nomor task di tabel ini adalah urutan asli. Task 36
(wiring `app.ts`) sengaja ditulis belakangan di dokumen supaya nggak ada
versi `app.ts` yang saling bertentangan selama Bagian 1–4 dikerjain.
Sebelum itu, `app.ts` cuma berisi health check dan auth (Task 8b).

**Selesai Task 40 = Fase 1 kelar.** Terus deploy satu app asli, pakai beberapa
hari, baru masuk Fase 2.
