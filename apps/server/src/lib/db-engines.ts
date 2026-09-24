export type DbEngine = 'postgres' | 'mysql' | 'redis'

export type EngineSpec = {
  engine: DbEngine
  image: (version: string) => string
  /** Port di dalem container. */
  containerPort: number
  /** Env yang dibutuhin buat nyalain container-nya. */
  env: (opts: { user: string; password: string; dbName: string }) => Record<string, string>
  /** Data disimpen di sini di dalem container, biar bisa di-volume. */
  dataDir: string
  /** Perintah buat nge-dump, null kalau nggak didukung. */
  dumpArgs: (opts: {
    user: string
    password: string
    dbName: string
  }) => string[] | null
}

export const ENGINES: Record<DbEngine, EngineSpec> = {
  postgres: {
    engine: 'postgres',
    image: (v) => `postgres:${v}-alpine`,
    containerPort: 5432,
    env: ({ user, password, dbName }) => ({
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: dbName,
      // Password-nya udah dikasih lewat env, jadi auth-nya bisa lebih ketat.
      POSTGRES_HOST_AUTH_METHOD: 'scram-sha-256',
    }),
    dataDir: '/var/lib/postgresql/data',
    dumpArgs: ({ user, dbName }) => ['pg_dump', '-U', user, '-d', dbName],
  },
  mysql: {
    engine: 'mysql',
    image: (v) => `mysql:${v}`,
    containerPort: 3306,
    env: ({ user, password, dbName }) => ({
      MYSQL_USER: user,
      MYSQL_PASSWORD: password,
      MYSQL_DATABASE: dbName,
      MYSQL_ROOT_PASSWORD: password,
    }),
    dataDir: '/var/lib/mysql',
    dumpArgs: ({ user, password, dbName }) => [
      'mysqldump',
      '-u',
      user,
      `-p${password}`,
      dbName,
    ],
  },
  redis: {
    engine: 'redis',
    image: (v) => `redis:${v}-alpine`,
    containerPort: 6379,
    env: ({ password }) => ({
      REDIS_PASSWORD: password,
    }),
    dataDir: '/data',
    // Redis nggak punya dump ke stdout yang gampang; backup pakai BGSAVE
    // ke volume. Jadi nggak ada perintah dump manual di Fase 2.
    dumpArgs: () => null,
  },
}

/** Argumen `redis-server` biar wajib password. */
export function redisArgs(password: string): string[] {
  return ['redis-server', '--requirepass', password, '--appendonly', 'yes']
}

export const DB_VERSION_DEFAULT: Record<DbEngine, string> = {
  postgres: '16',
  mysql: '8',
  redis: '7',
}

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Password 32 karakter alfanumerik. Sengaja tanpa simbol: `:`, `/`, `@`, `?`
 * dan `#` bikin connection string URL rusak atau harus di-escape.
 */
export function generateDbPassword(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALFABET[b % ALFABET.length]
  return out
}

export type ConnectionInput = {
  engine: DbEngine
  user: string
  password: string
  dbName: string
  host: string
  port: number
  tls?: boolean
}

export function buildConnectionString(input: ConnectionInput): string {
  const { engine, user, password, dbName, host, port, tls } = input

  if (engine === 'redis') {
    const skema = tls ? 'rediss' : 'redis'
    // Redis nggak pakai user di URL-nya, cuma password.
    return `${skema}://:${password}@${host}:${port}`
  }

  if (engine === 'mysql') {
    const dasar = `mysql://${user}:${password}@${host}:${port}/${dbName}`
    return tls ? `${dasar}?ssl-mode=REQUIRED` : dasar
  }

  const dasar = `postgresql://${user}:${password}@${host}:${port}/${dbName}`
  return tls ? `${dasar}?sslmode=require` : dasar
}

/**
 * Perintah yang tinggal dicopy user. Pakai host port karena itu yang kebuka
 * di VPS; port container cuma ada di dalem network Docker.
 */
export function buildSshTunnel(opts: {
  hostPort: number
  containerPort: number
}): string {
  return `ssh -L ${opts.hostPort}:localhost:${opts.hostPort} user@ip-vps-kamu`
}
