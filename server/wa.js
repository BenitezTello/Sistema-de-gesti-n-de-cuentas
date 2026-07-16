'use strict'
// ═══════════════════════════════════════════════════════════════
//  Servidor WhatsApp — corre en su propio contenedor Docker
//  Maneja: QR, conexión, envío de mensajes, SSE, bot IA
//  Puerto interno: 3001 (no expuesto al exterior)
// ═══════════════════════════════════════════════════════════════
const express   = require('express')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
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

// ═══════════════════════════════════════════════════════════════
//  BOT IA — GPT-4o-mini + anti-ban
// ═══════════════════════════════════════════════════════════════

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || ''
const BOT_ADMIN_PHONE = process.env.BOT_ADMIN_PHONE || '' // 51999999999
const BOT_ENABLED     = !!OPENAI_API_KEY
const BOT_ADMIN_ID    = BOT_ADMIN_PHONE ? BOT_ADMIN_PHONE.replace(/\D/g, '') + '@c.us' : ''

// ── Conexión con la API principal (contenedor "app") ─────────────────
const APP_HOST    = process.env.APP_HOST    || 'app'
const APP_PORT    = process.env.APP_PORT    || 3000
const BOT_API_KEY = process.env.BOT_API_KEY || ''

async function botApiCall(path, options = {}) {
  if (!BOT_API_KEY) return null
  try {
    const res = await fetch(`http://${APP_HOST}:${APP_PORT}/api/bot${path}`, {
      ...options,
      headers: { 'X-Bot-Key': BOT_API_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
    })
    return await res.json()
  } catch (err) {
    console.error('[BOT] Error llamando API interna:', err.message)
    return null
  }
}

const consultarDisponibilidad = (platform) =>
  botApiCall(`/disponibilidad?platform=${encodeURIComponent(platform)}`)

const asignarPerfil = (platform, clientName, phone) =>
  botApiCall('/asignar', { method: 'POST', body: JSON.stringify({ platform, clientName, phone }) })

// ── Detección de plataforma mencionada en el mensaje ──────────────────
const PLATFORM_KEYWORDS = {
  'Netflix':     /netflix/i,
  'Disney+':     /disney/i,
  'HBO Max':     /\bhbo\b/i,
  'Prime Video': /\bprime\b/i,
  'Crunchyroll': /crunchy/i,
}

function detectarPlataforma(texto) {
  for (const [platform, rx] of Object.entries(PLATFORM_KEYWORDS)) {
    if (rx.test(texto)) return platform
  }
  return null
}

// ── Identifica si un mensaje viene del admin, incluso con @lid ───────
// WhatsApp a veces representa el chat del admin con un ID "@lid" (oculta
// el número real) en vez de "<numero>@c.us" — hay que resolver el contacto.
async function esMensajeDelAdmin(msg) {
  if (!BOT_ADMIN_PHONE) return false
  if (msg.from === BOT_ADMIN_ID) return true
  if (!msg.from.endsWith('@lid')) return false
  try {
    const contact = await msg.getContact()
    const digits  = (contact?.number || '').replace(/\D/g, '')
    return !!digits && digits === BOT_ADMIN_PHONE.replace(/\D/g, '')
  } catch {
    return false
  }
}

// ── Pedidos pendientes de confirmación del admin ─────────────────────
// phone → { clientName, platform, monto, media, timestamp }
const pendingOrders = new Map()

const SYSTEM_PROMPT = `Eres el asistente de ventas y soporte de ABT zone, negocio peruano de cuentas de streaming.

TONO: Casual y amigable, como un amigo que atiende. Ejemplos de respuestas naturales:
- Saludo inicial: "Hola, sí tengo 😊 ¿En qué plataforma estás interesad@?"
- Disponibilidad: "Hola, sí estoy atendiendo, ¿en qué te puedo ayudar?"
- Confirmación: "Claro, ya te ayudo"
- Espera: "Dame un momento que verifico"
Mensajes cortos. Sin emojis en exceso.

━━ PRECIOS (soles peruanos) ━━
• Netflix perfil:  S/. 13  |  Renovación: S/. 12
• Disney+:         S/. 6.50
• HBO Max:         S/. 6
• Prime Video:     S/. 6
• Crunchyroll:     S/. 6
• Otras plataformas: preguntar disponibilidad antes de dar precio

PRECIOS REVENDEDOR (solo si el cliente lo menciona explícitamente):
• Netflix: S/. 10  |  HBO Max / Prime Video / Crunchyroll: S/. 4

━━ ANTES DE DAR LOS DATOS DE PAGO ━━
Si el cliente no te dijo su nombre todavía, pregúntaselo de forma natural ("¿A nombre de quién registro el pedido?"). Necesitas el nombre y la plataforma elegida antes de pasar al pago — esto es importante para procesar la venta correctamente.

━━ MÉTODOS DE PAGO ━━
Principal → Lemon Cash al número 929614643
Pasos para pagar con Lemon Cash:
  1. Entra a tu billetera digital Lemon Cash
  2. Ingresa el monto a pagar
  3. Ve a "Otros bancos"
  4. Dale clic a "DALE" (eso es Lemon Cash)
  5. Mándame la captura del comprobante

Si el cliente no sabe usar Lemon Cash o no tiene: acepta Yape al mismo número 929614643.

Después del pago di siempre: "En unos minutitos te envío tus datos 🙌"

━━ ENTREGA ━━
2 a 3 minutos después de verificar el pago. El equipo lo procesa y envía las credenciales.

━━ SOPORTE NETFLIX — "Tu TV no forma parte del Hogar" ━━
PASO 1 → "Haz clic en 'Esta es mi cuenta' y mándame foto de lo que aparece después"
PASO 2 → Analiza la foto que te mandan:
  • Si aparece botón "Estoy de viaje": clic "Estoy de viaje" → clic "Enviar email" → que avise cuando lo hizo
  • Si solo aparece "Actualizar Hogar con Netflix": clic "Actualizar Hogar" → clic "Enviar email" → que avise
PASO 3 → Cuando confirme que mandó el email:
  "Perfecto, dame unos minutitos que proceso tu código. No cierres la pantalla 🙌"
REGLA: Nunca pases al siguiente paso sin confirmación. Si no manda foto, pídela de nuevo.

━━ CUANDO EL CLIENTE ESPERA EL CÓDIGO ━━
"Ya estoy procesando tu código, en breve te lo envío. Mantén la pantalla abierta."
El código lo envía el equipo manualmente — nunca lo inventes.

━━ GARANTÍA ━━
• Código temporal, bloqueo de PIN, problema de hogar: se resuelve al momento
• Cuenta caída o membresía expirada: reemplazo de cuenta sin costo

━━ LÍMITES ESTRICTOS ━━
- No confirmes pagos recibidos — di siempre "dame un momento que verifico"
- No envíes credenciales — el equipo las envía tras verificar el pago
- No inventes precios fuera de la lista ni fechas de vencimiento
- Si algo está fuera de tu alcance: "Dame un momento que consulto"
- Solo respondes temas relacionados al negocio: ventas, precios, pagos y soporte técnico de streaming. Si el cliente habla de otro tema (fútbol, clima, chistes, etc.) di amablemente: "Jaja, solo puedo ayudarte con temas de streaming 😄 ¿En qué te ayudo?"`

// ── Memoria de conversaciones (in-memory) ────────────────────────────
const conversations = new Map() // phone → { messages: [], lastActivity: number }
const CONV_MAX_MSGS  = 10
const CONV_TIMEOUT   = 3 * 60 * 60 * 1000 // 3 horas sin actividad → reset

function getHistory(phone) {
  const conv = conversations.get(phone)
  if (!conv) return []
  if (Date.now() - conv.lastActivity > CONV_TIMEOUT) {
    conversations.delete(phone)
    return []
  }
  return conv.messages
}

function addToHistory(phone, role, content) {
  const conv = conversations.get(phone) || { messages: [], lastActivity: 0 }
  conv.messages.push({ role, content })
  if (conv.messages.length > CONV_MAX_MSGS)
    conv.messages = conv.messages.slice(-CONV_MAX_MSGS)
  conv.lastActivity = Date.now()
  conversations.set(phone, conv)
}

// ── Rate limiter (anti-ban) ──────────────────────────────────────────
// Máximo 8 respuestas automáticas por minuto por número
const rateLimits   = new Map()
const RATE_MAX     = 8
const RATE_WINDOW  = 60_000

function isRateLimited(phone) {
  const now = Date.now()
  const rl  = rateLimits.get(phone)
  if (!rl || now > rl.resetAt) {
    rateLimits.set(phone, { count: 1, resetAt: now + RATE_WINDOW })
    return false
  }
  rl.count++
  return rl.count > RATE_MAX
}

// ── Cooldown de alertas al admin (máximo 1 cada 10 min por cliente) ──
const lastAlert      = new Map()
const ALERT_COOLDOWN = 10 * 60_000

function puedeAlertar(phone) {
  const now  = Date.now()
  const last = lastAlert.get(phone) || 0
  if (now - last < ALERT_COOLDOWN) return false
  lastAlert.set(phone, now)
  return true
}

// ── Delay humano aleatorio (anti-ban) ────────────────────────────────
// Simula tiempo de escritura: 3 a 8 segundos
const sleep      = ms => new Promise(r => setTimeout(r, ms))
const humanDelay = ()  => sleep(3000 + Math.floor(Math.random() * 5000))

// ── Horario de atención (hora Perú UTC-5) — bot activo 9am a 2am ─────
function enHorarioAtencion() {
  const hora = new Date(Date.now() - 5 * 3600_000).getUTCHours()
  return hora >= 9 || hora < 2
}

// ── Llamada a OpenAI ─────────────────────────────────────────────────
async function callOpenAI(history, stockNote) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
  if (stockNote) {
    messages.push({ role: 'system', content:
      `Inventario en tiempo real (dato real de la base de datos — úsalo, no inventes otro): ${stockNote}` })
  }
  messages.push(...history)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'gpt-4o-mini',
      messages,
      max_tokens: 400,
      temperature: 0.7,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)
  const data = await res.json()
  return data.choices[0].message.content.trim()
}

// ── Detección de comprobantes de pago en imágenes (visión + JSON) ────
async function detectarPago(history) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content:
            'Analiza la conversación y la última imagen enviada por el cliente. ' +
            'Determina si la imagen es un comprobante de pago (captura de Lemon Cash, Yape, Plin o transferencia). ' +
            'Si lo es, extrae de la conversación el nombre del cliente (si lo mencionó) y la plataforma de streaming ' +
            'que está comprando (una de: Netflix, Disney+, HBO Max, Prime Video, Crunchyroll). ' +
            'Responde ÚNICAMENTE un JSON con esta forma exacta: ' +
            '{"esPago": boolean, "clientName": string|null, "platform": string|null, "monto": number|null}' },
          ...history.slice(-8),
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
        temperature: 0,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return JSON.parse(data.choices[0].message.content)
  } catch (err) {
    console.error('[BOT] Error detectando pago:', err.message)
    return null
  }
}

// ── Construye el mensaje de credenciales para el cliente ─────────────
function mensajeCredenciales(clientName, c) {
  return `Hola *${clientName}*! 🎬\n\n` +
    `Aquí tus datos de *${c.platform}*:\n` +
    `📧 Correo: ${c.email}\n` +
    `🔑 Contraseña: ${c.password}\n` +
    (c.access ? `🔐 Acceso adicional: ${c.access}\n` : '') +
    `👤 Perfil: ${c.profileNumber}` + (c.pin ? ` · PIN: *${c.pin}*` : '') + `\n` +
    `📅 Vence: ${c.expiryDate}\n\n` +
    `Cualquier cosa me avisas, ¡que disfrutes! 🚀`
}

// ── Notifica al admin sobre un nuevo pedido con comprobante ──────────
async function notificarAdminPedido(phone, order) {
  if (!BOT_ADMIN_ID) return
  const numero = phone.replace('@c.us', '')
  const caption = `🛒 *Nuevo pedido*\n` +
    `Cliente: ${order.clientName}\n` +
    `Tel: ${numero}\n` +
    `Plataforma: ${order.platform}` +
    (order.monto ? `\nMonto del comprobante: S/. ${order.monto}` : '') +
    `\n\nResponde *SI* para asignar y enviar la cuenta, o *NO* para rechazar este pedido.`

  try {
    if (order.media) {
      const match = order.media.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        const media = new MessageMedia(match[1], match[2])
        await waClient.sendMessage(BOT_ADMIN_ID, media, { caption })
        return
      }
    }
    await waClient.sendMessage(BOT_ADMIN_ID, caption)
  } catch (err) {
    console.error('[BOT] Error notificando pedido al admin:', err.message)
  }
}

// ── Resuelve un pedido pendiente: busca perfil, asigna y envía ───────
// Devuelve 'ok' | 'needs_pin_change' | 'sin_disponibilidad'
async function resolverPedido(clientPhone, order) {
  const result = await asignarPerfil(order.platform, order.clientName, clientPhone.replace('@c.us', ''))

  if (result?.ok) {
    await waClient.sendMessage(clientPhone, mensajeCredenciales(order.clientName, result.credentials))
    pendingOrders.delete(clientPhone)
    return 'ok'
  }
  if (result?.error === 'needs_pin_change') {
    return 'needs_pin_change'
  }
  return 'sin_disponibilidad'
}

// ── Maneja los comandos del admin (SI / NO / LISTO) por WhatsApp ─────
async function manejarComandoAdmin(msg) {
  const text = (msg.body || '').trim().toLowerCase()
  if (!/^(si|sí|no|listo|ya|dale|ok)$/i.test(text)) return false

  const entries = [...pendingOrders.entries()].sort((a, b) => b[1].timestamp - a[1].timestamp)
  if (!entries.length) return false
  const [clientPhone, order] = entries[0]

  if (/^(si|sí|dale|ok)$/i.test(text)) {
    const outcome = await resolverPedido(clientPhone, order)
    if (outcome === 'ok') {
      await waClient.sendMessage(BOT_ADMIN_ID, `✅ Cuenta de *${order.platform}* enviada a ${order.clientName}.`)
    } else if (outcome === 'needs_pin_change') {
      await waClient.sendMessage(BOT_ADMIN_ID,
        `⚠️ Tienes perfiles de *${order.platform}* disponibles, pero necesitan cambio de PIN antes de poder venderse.\n` +
        `Cámbialos y respóndeme *LISTO* para asignarle uno a ${order.clientName} automáticamente.`)
    } else {
      await waClient.sendMessage(BOT_ADMIN_ID, `❌ No hay disponibilidad de *${order.platform}* en este momento. Coordina con ${order.clientName} manualmente.`)
      pendingOrders.delete(clientPhone)
    }
    return true
  }

  if (/^(no)$/i.test(text)) {
    await waClient.sendMessage(clientPhone, `Hola ${order.clientName}, no logramos verificar tu comprobante de pago 🙁 Por favor escríbenos para revisarlo.`)
    await waClient.sendMessage(BOT_ADMIN_ID, `🚫 Pedido de ${order.clientName} (${order.platform}) rechazado y notificado al cliente.`)
    pendingOrders.delete(clientPhone)
    return true
  }

  if (/^(listo|ya)$/i.test(text)) {
    const outcome = await resolverPedido(clientPhone, order)
    if (outcome === 'ok') {
      await waClient.sendMessage(BOT_ADMIN_ID, `✅ Cuenta de *${order.platform}* enviada a ${order.clientName}.`)
    } else {
      await waClient.sendMessage(BOT_ADMIN_ID, `Aún no hay perfiles listos de *${order.platform}*. Verifica que el cambio de PIN se haya guardado.`)
    }
    return true
  }

  return false
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

  // ── Listener del bot ───────────────────────────────────────────────
  if (!BOT_ENABLED) {
    console.log('[BOT] OPENAI_API_KEY no configurada — bot desactivado')
    return
  }

  console.log('[BOT] ✅ Bot activado — GPT-4o-mini')

  // Agrupa mensajes del mismo número en ventana de 5s antes de responder
  const pending = new Map() // phone → { timer, parts: [] }

  async function procesarMensajes(phone, parts) {
    try {
      if (isRateLimited(phone)) {
        console.log(`[BOT] Rate limit — ${phone}`)
        return
      }

      // Combinar todas las partes recibidas en la ventana de 5s
      // Si hay imagen, usarla; si hay varios textos, unirlos
      let userContent
      const imagePart = parts.find(p => Array.isArray(p))
      const textParts = parts.filter(p => typeof p === 'string' && p.trim()).join(' ')

      if (imagePart) {
        // Actualizar el texto de la imagen con todos los textos juntos
        userContent = [
          { type: 'text', text: textParts || '(imagen adjunta)' },
          imagePart[1], // el image_url
        ]
      } else {
        userContent = textParts
      }

      if (!userContent) return

      addToHistory(phone, 'user', userContent)

      // ── Consultar stock real si el cliente menciona una plataforma ─
      let stockNote = ''
      const platform = detectarPlataforma(textParts)
      if (platform) {
        const stock = await consultarDisponibilidad(platform)
        if (stock) {
          stockNote = stock.disponible
            ? `${platform}: hay ${stock.cantidad} cuenta(s) lista(s) para vender ahora, precio S/. ${stock.precio}.`
            : `${platform}: por el momento no hay cuentas listas para vender (avisa que confirmas disponibilidad y te encargas).`
        }
      }

      // Simular escritura humana
      const chat = await waClient.getChatById(phone)
      await chat.sendStateTyping()
      await humanDelay()

      const history = getHistory(phone)
      const reply   = await callOpenAI(history, stockNote)

      await waClient.sendMessage(phone, reply)
      await chat.clearState()

      addToHistory(phone, 'assistant', reply)
      console.log(`[BOT] ✅ Respondido → ${phone}`)

      // ── Detectar comprobante de pago en la imagen recibida ─────────
      if (imagePart) {
        const deteccion = await detectarPago(getHistory(phone))
        if (deteccion?.esPago && deteccion.platform) {
          const order = {
            clientName: deteccion.clientName || 'Cliente',
            platform:   deteccion.platform,
            monto:      deteccion.monto || null,
            media:      imagePart[1]?.image_url?.url || null,
            timestamp:  Date.now(),
          }
          pendingOrders.set(phone, order)
          await notificarAdminPedido(phone, order)
          console.log(`[BOT] 🛒 Pedido pendiente registrado — ${phone} (${order.platform})`)
        }
      }

      // Alerta al admin si el cliente espera un código (máx. 1 cada 10 min por cliente)
      if (BOT_ADMIN_ID && /código|codigo|code/i.test(reply) && puedeAlertar(phone)) {
        await waClient.sendMessage(BOT_ADMIN_ID, `⚠️ BOT: El cliente ${phone} espera un código. Revisar correo y enviar manualmente.`)
      }

    } catch (err) {
      console.error('[BOT] Error procesando:', err.message)
    }
  }

  waClient.on('message', async (msg) => {
    try {
      if (msg.fromMe) return
      if (msg.from.endsWith('@g.us')) return
      if (Date.now() - msg.timestamp * 1000 > 60_000) return

      // ── Comandos del admin (SI/NO/LISTO) — siempre activos, sin IA ─
      if (msg.type === 'chat' && await esMensajeDelAdmin(msg)) {
        const manejado = await manejarComandoAdmin(msg)
        if (manejado) return
      }

      // ── Filtros anti-ban (solo aplican a respuestas automáticas) ──
      if (botPaused) return
      if (!enHorarioAtencion()) return              // Fuera de 9am-10pm hora Perú
      if (!['chat', 'image'].includes(msg.type)) return

      const phone = msg.from

      // ── Construir contenido ─────────────────────────────────────
      let part
      if (msg.hasMedia && msg.type === 'image') {
        try {
          const media = await msg.downloadMedia()
          part = [
            { type: 'text', text: msg.body || '' },
            { type: 'image_url', image_url: { url: `data:${media.mimetype};base64,${media.data}`, detail: 'low' } },
          ]
        } catch {
          part = msg.body || ''
        }
      } else {
        part = msg.body || ''
      }

      // ── Acumular en ventana de 5s ───────────────────────────────
      if (pending.has(phone)) {
        clearTimeout(pending.get(phone).timer)
        pending.get(phone).parts.push(part)
      } else {
        pending.set(phone, { parts: [part], timer: null })
      }

      const entry = pending.get(phone)
      entry.timer = setTimeout(() => {
        pending.delete(phone)
        procesarMensajes(phone, entry.parts)
      }, 5000)

    } catch (err) {
      console.error('[BOT] Error en listener:', err.message)
    }
  })
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

let botPaused = false

app.get('/api/wa/status', (_, res) => res.json({
  status:     waStatus,
  qr:         currentQR,
  botEnabled: BOT_ENABLED,
  botPaused,
}))

// Pausar/reanudar el bot sin reiniciar el contenedor
app.post('/api/wa/bot-toggle', (_, res) => {
  if (!BOT_ENABLED) return res.status(400).json({ error: 'Bot no configurado (falta OPENAI_API_KEY)' })
  botPaused = !botPaused
  console.log(`[BOT] ${botPaused ? '⏸ Pausado' : '▶ Reanudado'} manualmente`)
  res.json({ botPaused })
})

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
