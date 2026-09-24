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

CREATE TABLE IF NOT EXISTS databases (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  engine        TEXT NOT NULL CHECK (engine IN ('postgres','mysql','redis')),
  version       TEXT NOT NULL,
  db_name       TEXT NOT NULL,
  db_user       TEXT NOT NULL,
  password      TEXT NOT NULL,
  volume_name   TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  host_port     INTEGER NOT NULL UNIQUE,
  access_mode   TEXT NOT NULL DEFAULT 'internal'
                CHECK (access_mode IN ('internal','tunnel','public','domain')),
  expose_domain TEXT,
  status        TEXT NOT NULL DEFAULT 'stopped'
                CHECK (status IN ('stopped','running','failed')),
  memory_limit_mb INTEGER NOT NULL DEFAULT 512,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_databases_project ON databases(project_id);

CREATE TABLE IF NOT EXISTS storage_buckets (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL UNIQUE,
  access_key     TEXT NOT NULL,
  secret_key     TEXT NOT NULL,
  is_public      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buckets_project ON storage_buckets(project_id);

CREATE TABLE IF NOT EXISTS backups (
  id          TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_db ON backups(database_id, created_at DESC);
`
