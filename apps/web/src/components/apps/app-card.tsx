import { Link } from '@tanstack/react-router'
import type { AppRecord } from '../../lib/types'
import { Card, CardBody } from '../ui/card'
import { StatusDot } from '../ui/status-dot'

export function AppCard({ app }: { app: AppRecord }) {
  return (
    <Link to="/apps/$appId" params={{ appId: app.id }} className="block">
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
