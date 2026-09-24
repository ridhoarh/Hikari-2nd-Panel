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
    .query(
      'SELECT * FROM deployments WHERE app_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
    )
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

/**
 * Hapus baris deployment lama, sisain `keep` yang terbaru.
 * Nggak nyentuh app-nya — cuma riwayat.
 */
export function pruneOldDeploymentsIn(
  db: Database,
  appId: string,
  keep = 50
): number {
  const rows = db
    .query(
      'SELECT id FROM deployments WHERE app_id = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?'
    )
    .all(appId, keep) as { id: string }[]

  for (const row of rows) {
    db.query('DELETE FROM deployments WHERE id = ?').run(row.id)
  }

  return rows.length
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
