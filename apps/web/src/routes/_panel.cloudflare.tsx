import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { CloudflarePanel } from '../components/settings/cloudflare-panel'

export const Route = createFileRoute('/_panel/cloudflare')({ component: CloudflarePage })

function CloudflarePage() {
  const { username } = useAuth()

  return (
    <AppShell username={username ?? 'admin'} title="Cloudflare">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Cloudflare</h2>
          </CardHeader>
          <CardBody>
            <CloudflarePanel />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
