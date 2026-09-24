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
