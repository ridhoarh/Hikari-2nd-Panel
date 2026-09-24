import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { getApp } from '../repositories/apps'
import {
  getOrCreateWebhookSecret,
  hasProcessedDelivery,
  recordDelivery,
} from '../repositories/webhooks'

export function verifyGithubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type WebhookDeps = {
  db: Database
  onPush: (appId: string) => void
}

export function createWebhookRoutes(deps: WebhookDeps): Hono {
  const { db } = deps
  const router = new Hono()

  router.post('/webhooks/github/:appId', async (c) => {
    const appId = c.req.param('appId')
    const app = getApp(db, appId)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const raw = await c.req.text()
    const signature = c.req.header('x-hub-signature-256') ?? ''
    const secret = getOrCreateWebhookSecret(db, appId)

    if (!verifyGithubSignature(raw, signature, secret)) {
      return c.json({ error: 'Signature nggak valid' }, 401)
    }

    const deliveryId = c.req.header('x-github-delivery') ?? ''
    const event = c.req.header('x-github-event') ?? 'unknown'

    if (deliveryId && hasProcessedDelivery(db, deliveryId)) {
      return c.json({ ok: true, skipped: 'duplikat' }, 202)
    }

    if (event !== 'push') {
      recordDelivery(db, appId, deliveryId, event, 'ignored')
      return c.json({ ok: true, skipped: event }, 202)
    }

    try {
      const body = JSON.parse(raw) as { ref?: string }
      const pushedBranch = (body.ref ?? '').replace('refs/heads/', '')

      recordDelivery(db, appId, deliveryId, event, 'accepted')

      // Push ke branch lain tetap dijawab 202 (biar GitHub nggak retry),
      // tapi cuma branch app-nya yang beneran memicu deploy.
      if (pushedBranch === (app.branch ?? 'main')) {
        deps.onPush(appId)
      }

      return c.json({ ok: true }, 202)
    } catch {
      return c.json({ error: 'Body bukan JSON valid' }, 400)
    }
  })

  return router
}

export function createWebhookInfoRoute(db: Database): Hono {
  const router = new Hono()

  router.get('/apps/:id/webhook', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    return c.json({
      url: `/api/webhooks/github/${id}`,
      secret: getOrCreateWebhookSecret(db, id),
      events: ['push'],
    })
  })

  return router
}
