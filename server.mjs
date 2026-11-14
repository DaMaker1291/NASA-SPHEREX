import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'

const assetRoot = new URL('./frontend/', import.meta.url)
const publicRoot = new URL('./public/', import.meta.url)
const workerEntry = new URL('./dist/creative_agency/index.js', import.meta.url)

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.fits': 'application/fits',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function readAsset(request) {
  const url = new URL(request.url)
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const roots = [assetRoot, publicRoot]

  for (const root of roots) {
    const assetUrl = new URL(relative, root)
    if (!assetUrl.href.startsWith(root.href)) continue
    try {
      const body = await readFile(fileURLToPath(assetUrl))
      const headers = new Headers({
        'Content-Type': contentTypes[extname(assetUrl.pathname).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': /^(index\.html|.*\.(?:js|css))$/.test(relative) ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })
      return new Response(request.method === 'HEAD' ? null : body, { headers })
    } catch {
      // Try the next asset root.
    }
  }

  if (extname(relative)) return new Response('Not found', { status: 404 })
  const body = await readFile(fileURLToPath(new URL('index.html', assetRoot)))
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': contentTypes['.html'],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

const { default: app } = await import(workerEntry)

const server = serve(
  {
    fetch: (request) =>
      app.fetch(request, {
        ASSETS: { fetch: (assetRequest) => readAsset(assetRequest) },
      }),
    hostname: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Drift listening on http://${info.address}:${info.port}`)
  },
)

function shutdown(signal) {
  console.log(`${signal} received; closing server`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 8000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
