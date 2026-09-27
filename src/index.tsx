import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { api, type Bindings } from './api'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    frameSrc: ["'self'", 'blob:'],
    mediaSrc: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  },
  referrerPolicy: 'same-origin'
}))

app.route('/api', api)

const shell = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>Ultralight Project Builder, SAP PS and FI canvas</title>
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link href="/static/style.css" rel="stylesheet">
</head>
<body>
<div id="app" aria-live="polite"></div>
<script type="module" src="/static/app.js"></script>
</body>
</html>`

app.get('*', (c) => (c.req.path.startsWith('/api') ? c.json({ error: 'Not found' }, 404) : c.html(shell)))

export default app
