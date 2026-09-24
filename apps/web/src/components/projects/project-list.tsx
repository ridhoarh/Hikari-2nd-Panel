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
