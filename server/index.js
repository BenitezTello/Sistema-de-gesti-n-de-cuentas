'use strict'
const express    = require('express')
const cors       = require('cors')
const path       = require('path')
const http       = require('http')
const db         = require('./db')
const dataRoutes = require('./routes/data')
const { router: authRoutes, authMiddleware } = require('./auth')

const app = express()
const ALLOWED = process.env.NODE_ENV === 'production'
  ? ['https://www.abtstreaming.site', 'https://abtstreaming.site']
  : true

app.use(cors({
  origin: ALLOWED,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Security headers adicionales en Express
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'ABT')   // oculta que usas Express
  next()
})
app.use(express.json())

// ── Auth (público) ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)

// ── Rutas de datos (protegidas) ───────────────────────────────────────
app.use('/api/data', authMiddleware, dataRoutes)

// ── Proxy a servidor WhatsApp (protegido) ─────────────────────────────
const WA_HOST = process.env.WA_HOST || 'localhost'
const WA_PORT = parseInt(process.env.WA_PORT || '3001')

app.use('/api/wa', authMiddleware, (req, res) => {
  // Re-serializar body ya que express.json() consumió el stream original
  const rawBody = req.body && Object.keys(req.body).length
    ? JSON.stringify(req.body)
    : null

  const headers = {
    host:             `${WA_HOST}:${WA_PORT}`,
    'content-type':   'application/json',
    ...(rawBody ? { 'content-length': Buffer.byteLength(rawBody) } : {}),
  }

  const options = {
    hostname: WA_HOST,
    port:     WA_PORT,
    path:     `/api/wa${req.url}`,
    method:   req.method,
    headers,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res, { end: true })
  })

  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(503).json({ error: 'Servidor WhatsApp no disponible' })
  })

  if (rawBody) {
    proxyReq.write(rawBody)
    proxyReq.end()
  } else {
    proxyReq.end()
  }
})

// ── En producción: servir el build de React ───────────────────────────
const DIST = path.join(__dirname, '..', 'dist')
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(DIST))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) res.sendFile(path.join(DIST, 'index.html'))
  })
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`\n🚀 ABT Streaming App → http://localhost:${PORT}`)
  console.log(`   Modo: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Proxy WA: http://${WA_HOST}:${WA_PORT}\n`)
  db.seedIfEmpty()
})
