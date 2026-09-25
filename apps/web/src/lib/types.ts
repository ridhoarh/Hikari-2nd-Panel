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
  build_strategy: 'dockerfile' | 'railpack'
  dockerfile_path: string
  root_dir: string
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

export type DbEngine = 'postgres' | 'mysql' | 'redis'
export type AccessMode = 'internal' | 'tunnel' | 'public' | 'domain'
export type DbStatus = 'stopped' | 'running' | 'failed'

export type DbRecord = {
  id: string
  project_id: string
  name: string
  engine: DbEngine
  version: string
  db_name: string
  db_user: string
  volume_name: string
  container_port: number
  host_port: number
  access_mode: AccessMode
  expose_domain: string | null
  status: DbStatus
  memory_limit_mb: number
  created_at: string
}

export type DbInfo = {
  connectionString: string
  tunnelCommand: string | null
  endpoint: { host: string; port: number }
  warnings: string[]
}

export type BackupRecord = {
  id: string
  database_id: string
  filename: string
  size_bytes: number
  created_at: string
}

export type BucketRecord = {
  id: string
  project_id: string
  name: string
  access_key: string
  secret_key: string
  is_public: number
  created_at: string
}

/**
 * Data gabungan lintas project — dipakai halaman datar di sidebar.
 *
 * Server nempelin `project_name` (dan `app_name` buat domain) supaya halaman
 * nggak perlu manggil /projects dulu cuma buat nampilin asal-usulnya.
 */
export type AppWithProject = AppRecord & { project_name: string | null }

export type DbWithProject = DbRecord & { project_name: string | null }

export type BucketWithProject = BucketRecord & { project_name: string | null }

export type DomainWithApp = Domain & {
  app_id: string
  app_name: string | null
  project_id: string | null
  project_name: string | null
}

export type BackupWithContext = BackupRecord & {
  database_name: string
  database_engine: DbEngine
  project_name: string | null
}

export type ActivityItem = Deployment & {
  app_id: string
  app_name: string | null
  project_id: string | null
  project_name: string | null
}
