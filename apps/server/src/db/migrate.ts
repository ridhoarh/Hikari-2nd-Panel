import type { Database } from './client'
import { SCHEMA_SQL } from './schema'

export function runMigrations(db: Database): void {
  db.exec(SCHEMA_SQL)
}
