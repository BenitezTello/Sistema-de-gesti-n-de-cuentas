'use strict'
// ═══════════════════════════════════════════════════════════════
//  Servidor WhatsApp — corre en su propio contenedor Docker
//  Solo maneja: QR, conexión, envío de mensajes, SSE
//  Puerto interno: 3001 (no expuesto al exterior)
// ═══════════════════════════════════════════════════════════════
const express   = require('express')
const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode    = require('qrcode')
const cors      = require('cors')
const path      = require('path')
const fs        = require('fs')

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

// ── Estado global ────────────────────────────────────────────────────
let waClient = null
let waStatus  = 'disconnected'
let currentQR = null
const sseClients = new Set()

// ── SSE helpers ──────────────────────────────────────────────────────
function broadcast(type, data) {
  const msg = `data: ${JSON.stringify({ type, data })}\n\n`
  sseClients.forEach(res => res.write(msg))
}

function setStatus(s) {
  waStatus = s
  broadcast('status', s)
  console.log(`[WA] Status → ${s}`)
}

// ── Limpiar locks de Chromium ────────────────────────────────────────
function clearChromiumLocks() {
  const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session')
  const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
  locks.forEach(f => {
    try { fs.unlinkSync(path.join(sessionDir, f)) } catch (_) {}
  })
}

// ── Init WhatsApp ────────────────────────────────────────────────────
function initWhatsApp() {
  if (waClient) return

  clearChromiumLocks()
  console.log('[WA] Iniciando cliente…')

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: {
      headless: true,
      protocolTimeout: 60000,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--no-zygote',
      ],
    },
  })

  waClient.on('qr', async (qr) => {
    currentQR = await qrcode.toDataURL(qr)
    setStatus('qr')
    broadcast('qr', currentQR)
    console.log('[WA] QR generado — esperando escaneo…')
  })

  waClient.on('authenticated', () => { currentQR = null; setStatus('connecting') })
  waClient.on('ready',         () => { currentQR = null; setStatus('connected');  console.log('[WA] ✅ Listo') })
  waClient.on('auth_failure',  () => { waClient = null;  setStatus('disconnected') })
  waClient.on('disconnected',  () => { waClient = null;  setStatus('disconnected') })

  waClient.initialize().catch(err => {
    console.error('[WA] Error al inicializar:', err.message)
    waClient = null
    setStatus('disconnected')
  })

  setStatus('connecting')
}

// ── Rutas ────────────────────────────────────────────────────────────

app.get('/api/wa/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  sseClients.add(res)
  res.write(`data: ${JSON.stringify({ type: 'status', data: waStatus })}\n\n`)
  if (currentQR) res.write(`data: ${JSON.stringify({ type: 'qr', data: currentQR })}\n\n`)

  req.on('close', () => sseClients.delete(res))
})

app.get('/api/wa/status', (_, res) => res.json({ status: waStatus, qr: currentQR }))

app.post('/api/wa/connect', (_, res) => { initWhatsApp(); res.json({ ok: true }) })

app.post('/api/wa/disconnect', async (_, res) => {
  try {
    if (waClient) { await waClient.destroy(); waClient = null }
    currentQR = null
    setStatus('disconnected')
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/wa/send-bulk', async (req, res) => {
  if (waStatus !== 'connected') return res.status(400).json({ error: 'WhatsApp no conectado' })

  const { messages } = req.body
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Sin mensajes' })

  res.json({ ok: true, total: messages.length })

  ;(async () => {
    let sent = 0, failed = 0
    for (let i = 0; i < messages.length; i++) {
      const { phone, text } = messages[i]
      try {
        if (!waClient) throw new Error('Cliente WhatsApp no disponible')
        await waClient.sendMessage(phone.replace(/\D/g,'') + '@c.us', text)
        sent++
        broadcast('progress', { current: i+1, total: messages.length, phone, ok: true, sent, failed })
        console.log(`[WA] ✅ ${i+1}/${messages.length} → ${phone}`)
      } catch (err) {
        failed++
        broadcast('progress', { current: i+1, total: messages.length, phone, ok: false, sent, failed })
        console.error(`[WA] ❌ ${phone}:`, err.message)
      }
      if (i < messages.length - 1) {
        const delay = 25000 + Math.floor(Math.random() * 10000) // 25-35 seg aleatorio
        console.log(`[WA] Esperando ${Math.round(delay/1000)}s antes del siguiente…`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
    broadcast('bulk-done', { total: messages.length, sent, failed })
    console.log(`[WA] Finalizado — ${sent} OK, ${failed} errores`)
  })()
})

// ── Arranque ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n📱 StreamManager WA Server → puerto ${PORT}`)
  initWhatsApp()
})
