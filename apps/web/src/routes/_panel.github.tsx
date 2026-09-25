import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { GithubPanel } from '../components/settings/github-panel'

export const Route = createFileRoute('/_panel/github')({ component: GithubPage })

function GithubPage() {
  const { username } = useAuth()

  return (
    <AppShell username={username ?? 'admin'} title="GitHub App">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">GitHub App</h2>
          </CardHeader>
          <CardBody>
            <GithubPanel />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
