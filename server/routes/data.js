'use strict'
const express                        = require('express')
const router                         = express.Router()
const db                             = require('../db')
const { adminMiddleware, hashPassword } = require('../auth')

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const getIp = (req) =>
  (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').toString().split(',')[0].trim()

const audit = (req, action, entity, entityId, description) =>
  db.logAction(req.user?.id || '', req.user?.username || 'sistema', action, entity, entityId, description, getIp(req))

// ── Validación de inputs ──────────────────────────────────────────────
const str  = (v, max = 200) => typeof v === 'string' ? v.slice(0, max).trim() : ''
const num  = (v, min = 0, max = 9999) => { const n = Number(v); return isNaN(n) ? min : Math.min(max, Math.max(min, Math.floor(n))) }
const date = (v) => str(v, 20) // acepta cualquier formato, solo limita longitud
const bool = (v) => v === true || v === 1 || v === '1'

const PLATFORMS = ['Netflix','Disney+','HBO Max','Prime Video','Crunchyroll','Movistar+','Otro']
const plat = (v) => PLATFORMS.includes(v) ? v : 'Otro'

// ── Accounts ─────────────────────────────────────────────────────────
router.get('/accounts', (req, res) => {
  let accounts = db.getAllAccounts()
  if (req.user?.role !== 'admin') {
    const perms = req.user?.permissions || []
    accounts = accounts.filter(a => perms.includes(a.platform))
  }
  res.json(accounts)
})

router.post('/accounts', (req, res) => {
  const b = req.body || {}
  const maxP    = num(b.maxProfiles, 1, 10)
  const cost    = num(b.cost, 0, 99999)
  const accountId = id()
  const DEFAULT_PINS = ['3522','3622','3722','3822','3922','4022','4122']
  const profiles  = Array.from({ length: maxP }, (_, i) => ({
    id: id(), accountId, number: i + 1, pin: DEFAULT_PINS[i] || '0000',
  }))
  const acc = db.createAccount({
    id: accountId,
    platform:    plat(b.platform),
    email:       str(b.email, 200),
    password:    str(b.password, 200),
    supplierId:  str(b.supplierId, 50),
    cost,
    expiryDate:  date(b.expiryDate),
    maxProfiles: maxP,
    profiles,
  })
  audit(req, 'CREATE', 'account', accountId,
    `Creó cuenta ${acc.platform} (${acc.email}) con ${maxP} perfil${maxP !== 1 ? 'es' : ''}`)
  if (cost > 0) {
    db.createTransaction({
      type: 'expense', category: 'account_purchase',
      platform: acc.platform, amount: cost,
      accountId, supplierId: str(b.supplierId, 50),
      notes: `Compra cuenta ${acc.platform} (${acc.email})`,
      userId: req.user?.id || '', username: req.user?.username || 'sistema',
    })
  }
  res.json(acc)
})

router.put('/accounts/:id', (req, res) => {
  const b = req.body || {}
  const prevAcc = db.getAccountById(req.params.id)
  const clean = {}
  if (b.platform    !== undefined) clean.platform    = plat(b.platform)
  if (b.email       !== undefined) clean.email       = str(b.email, 200)
  if (b.password    !== undefined) clean.password    = str(b.password, 200)
  if (b.supplierId  !== undefined) clean.supplierId  = str(b.supplierId, 50)
  if (b.cost        !== undefined) clean.cost        = num(b.cost, 0, 99999)
  if (b.expiryDate  !== undefined) clean.expiryDate  = date(b.expiryDate)
  if (b.maxProfiles !== undefined) clean.maxProfiles = num(b.maxProfiles, 1, 10)
  if (b.passwordChanged !== undefined) clean.passwordChanged = bool(b.passwordChanged)
  if (b.isFullAccount   !== undefined) clean.isFullAccount   = bool(b.isFullAccount)
  if (b.isDown          !== undefined) clean.isDown          = bool(b.isDown)
  if (b.access         !== undefined) clean.access          = str(b.access, 100)
  if (b.fullClient      !== undefined) clean.fullClient      = b.fullClient
  const acc = db.updateAccount(req.params.id, clean)
  if (acc) {
    let desc = `Actualizó cuenta ${acc.platform} (${acc.email})`
    if (clean.expiryDate) desc = `Renovó cuenta ${acc.platform} (${acc.email}) hasta ${clean.expiryDate}`
    else if (clean.isDown !== undefined) desc = `${clean.isDown ? 'Marcó como caída' : 'Restauró'} cuenta ${acc.platform} (${acc.email})`
    audit(req, 'UPDATE', 'account', req.params.id, desc)
    // Registrar egreso si se renueva la fecha y la cuenta tiene costo
    if (clean.expiryDate && prevAcc && clean.expiryDate !== prevAcc.expiryDate) {
      const cost = clean.cost ?? prevAcc.cost ?? 0
      if (cost > 0) {
        db.createTransaction({
          type: 'expense', category: 'account_renewal',
          platform: acc.platform, amount: cost,
          accountId: req.params.id, supplierId: acc.supplierId || '',
          notes: `Renovación cuenta ${acc.platform} (${acc.email}) hasta ${clean.expiryDate}`,
          userId: req.user?.id || '', username: req.user?.username || 'sistema',
        })
      }
    }
    // Registrar ingreso si se renueva el cliente de cuenta completa
    const fcRenewAmount = Number(b.renewAmount) || 0
    if (b.saleType === 'renewal' && fcRenewAmount > 0 && clean.fullClient?.expiryDate) {
      const prevFC = prevAcc?.fullClient || {}
      if (clean.fullClient.expiryDate !== prevFC.expiryDate) {
        db.createTransaction({
          type: 'income', category: 'renewal',
          platform: acc.platform, amount: fcRenewAmount,
          clientName: clean.fullClient.clientName || prevFC.clientName || '',
          clientPhone: clean.fullClient.phone || prevFC.phone || '',
          accountId: req.params.id,
          userId: req.user?.id || '', username: req.user?.username || 'sistema',
        })
      }
    }
  }
  res.json(acc || { error: 'not found' })
})

router.delete('/accounts/:id', (req, res) => {
  const acc = db.getAccountById(req.params.id)
  // Preservar clientes en saved_clients antes de que el CASCADE los borre
  if (acc) {
    acc.profiles.forEach(p => {
      if (p.clientName) db.saveClient(p.clientName, p.phone)
    })
    if (acc.isFullAccount && acc.fullClient?.clientName) {
      db.saveClient(acc.fullClient.clientName, acc.fullClient.phone)
    }
  }
  db.deleteAccount(req.params.id)
  audit(req, 'DELETE', 'account', req.params.id,
    acc ? `Eliminó cuenta ${acc.platform} (${acc.email})` : `Eliminó cuenta ${req.params.id}`)
  res.json({ ok: true })
})

// ── Profiles ─────────────────────────────────────────────────────────
router.post('/accounts/:id/profiles', (req, res) => {
  const { number, pin } = req.body
  if (!number) return res.status(400).json({ error: 'Falta número de perfil' })
  const profileId = db.addProfile(req.params.id, number, pin)
  const acc = db.getAccountById(req.params.id)
  audit(req, 'CREATE', 'profile', profileId,
    acc ? `Agregó perfil #${number} a cuenta ${acc.platform} (${acc.email})` : `Agregó perfil #${number}`)
  res.json(acc)
})

router.delete('/profiles/:id', (req, res) => {
  const pwa = db.getProfileWithAccount(req.params.id)
  db.deleteProfile(req.params.id)
  audit(req, 'DELETE', 'profile', req.params.id,
    pwa ? `Eliminó perfil #${pwa.number} de ${pwa.platform} (${pwa.email})` : `Eliminó perfil ${req.params.id}`)
  res.json({ ok: true })
})

router.put('/profiles/:id', (req, res) => {
  const b = req.body || {}
  const clean = {}
  if (b.clientName !== undefined) clean.clientName = str(b.clientName, 100)
  if (b.phone      !== undefined) clean.phone      = str(b.phone, 30)
  if (b.pin        !== undefined) clean.pin        = str(b.pin, 10)
  if (b.status        !== undefined) clean.status        = ['available','active'].includes(b.status) ? b.status : 'available'
  if (b.needsPinChange !== undefined) clean.needsPinChange = b.needsPinChange ? 1 : 0
  if (b.isReseller     !== undefined) clean.isReseller     = b.isReseller ? 1 : 0
  if (b.expiryDate !== undefined) clean.expiryDate = date(b.expiryDate)

  const pwa = db.getProfileWithAccount(req.params.id)
  db.updateProfile(req.params.id, clean)

  if (pwa) {
    let desc
    if (clean.status === 'active') {
      desc = `Asignó perfil #${pwa.number} de ${pwa.platform} a ${clean.clientName || '—'}${clean.phone ? ` (${clean.phone})` : ''}`
    } else if (clean.status === 'available') {
      const prev = pwa.client_name || 'sin cliente'
      desc = `Liberó perfil #${pwa.number} de ${pwa.platform} (cliente anterior: ${prev})`
    } else if (clean.expiryDate && !clean.status) {
      const who = pwa.client_name || '—'
      desc = `Renovó perfil #${pwa.number} de ${pwa.platform} de ${who} hasta ${clean.expiryDate}`
    } else {
      desc = `Actualizó perfil #${pwa.number} de ${pwa.platform}`
    }
    audit(req, 'UPDATE', 'profile', req.params.id, desc)

    // Registrar ingreso si es asignación nueva tipo "venta"
    const saleAmount = Number(b.saleAmount) || 0
    if (b.saleType === 'sale' && clean.status === 'active' && saleAmount > 0) {
      db.createTransaction({
        type: 'income', category: 'sale',
        platform: pwa.platform, amount: saleAmount,
        clientName: clean.clientName || '', clientPhone: clean.phone || '',
        profileId: req.params.id, accountId: pwa.account_id,
        userId: req.user?.id || '', username: req.user?.username || 'sistema',
      })
    }
    // Registrar ingreso si es renovación de perfil existente
    const renewAmount = Number(b.renewAmount) || 0
    if (b.saleType === 'renewal' && clean.expiryDate && renewAmount > 0) {
      db.createTransaction({
        type: 'income', category: 'renewal',
        platform: pwa.platform, amount: renewAmount,
        clientName: pwa.client_name || clean.clientName || '',
        clientPhone: pwa.phone || clean.phone || '',
        profileId: req.params.id, accountId: pwa.account_id,
        userId: req.user?.id || '', username: req.user?.username || 'sistema',
      })
    }
  }

  res.json({ ok: true })
})

// Actualizar cliente en todos sus perfiles (por teléfono)
router.post('/clients/update', (req, res) => {
  const { matchPhone, matchName, newName, newPhone } = req.body
  db.updateClientGlobal(matchPhone, matchName, newName, newPhone)
  audit(req, 'UPDATE', 'client', matchPhone || matchName,
    `Actualizó datos de cliente ${newName || matchName} (${newPhone || matchPhone || '—'})`)
  res.json({ ok: true })
})

// Extender vencimiento de todos los perfiles de un cliente (combo)
router.post('/clients/extend', (req, res) => {
  const { matchPhone, matchName, newDateStr } = req.body
  db.extendClientAllProfiles(matchPhone, matchName, newDateStr)
  audit(req, 'UPDATE', 'client', matchPhone || matchName,
    `Renovó todos los perfiles de ${matchName || matchPhone} hasta ${newDateStr}`)
  res.json({ ok: true })
})

router.post('/clients/reseller', (req, res) => {
  const { phone, name, isReseller } = req.body
  db.setClientResellerStatus(phone, name, !!isReseller)
  audit(req, 'UPDATE', 'client', phone || name,
    `${isReseller ? 'Marcó' : 'Desmarcó'} como revendedor a ${name || phone}`)
  res.json({ ok: true })
})

// ── Saved Clients ──────────────────────────────────────────────────────
router.get('/clients', (req, res) => {
  res.json(db.getSavedClients())
})

router.post('/clients', (req, res) => {
  const b = req.body || {}
  const client = db.saveClient(str(b.name, 100), str(b.phone, 30))
  if (client?.id) {
    audit(req, 'CREATE', 'client', client.id, `Guardó cliente ${client.name} en historial`)
  }
  res.json(client || { error: 'Nombre requerido' })
})

router.delete('/clients/:id', (req, res) => {
  const client = db.getSavedClientById(req.params.id)
  db.deleteClient(req.params.id)
  audit(req, 'DELETE', 'client', req.params.id,
    client ? `Eliminó cliente ${client.name} del historial` : `Eliminó cliente ${req.params.id} del historial`)
  res.json({ ok: true })
})

// ── Suppliers ─────────────────────────────────────────────────────────
router.get('/suppliers', (req, res) => {
  res.json(db.getAllSuppliers())
})

router.post('/suppliers', (req, res) => {
  const b = req.body || {}
  const sup = db.createSupplier({ id: id(), name: str(b.name, 100), contact: str(b.contact, 50) })
  audit(req, 'CREATE', 'supplier', sup.id, `Creó proveedor ${sup.name}`)
  res.json(sup)
})

router.put('/suppliers/:id', (req, res) => {
  const b = req.body || {}
  db.updateSupplier(req.params.id, { name: str(b.name, 100), contact: str(b.contact, 50) })
  audit(req, 'UPDATE', 'supplier', req.params.id, `Actualizó proveedor ${str(b.name, 100)}`)
  res.json({ ok: true })
})

router.delete('/suppliers/:id', (req, res) => {
  const sup = db.getSupplierById(req.params.id)
  db.deleteSupplier(req.params.id)
  audit(req, 'DELETE', 'supplier', req.params.id,
    sup ? `Eliminó proveedor ${sup.name}` : `Eliminó proveedor ${req.params.id}`)
  res.json({ ok: true })
})

// ── Users (solo admin) ────────────────────────────────────────────────
router.get('/users', adminMiddleware, (req, res) => {
  res.json(db.getAllUsers())
})

router.post('/users', adminMiddleware, (req, res) => {
  const b = req.body || {}
  if (!b.username || !b.password) return res.status(400).json({ error: 'Faltan usuario y contraseña' })
  const username    = str(b.username, 50).toLowerCase().replace(/\s/g, '')
  if (!username) return res.status(400).json({ error: 'Usuario inválido' })
  const role        = b.role === 'admin' ? 'admin' : 'user'
  const permissions = role === 'admin'
    ? ['all']
    : (Array.isArray(b.permissions) ? b.permissions.filter(p => PLATFORMS.includes(p)) : [])
  const hash   = hashPassword(str(b.password, 200))
  const userId = id()
  try {
    db.createUser(userId, username, hash, role, permissions)
    const permStr = role === 'admin' ? 'todas las plataformas' : (permissions.join(', ') || 'ninguna')
    audit(req, 'CREATE', 'user', userId, `Creó usuario '${username}' con permisos: ${permStr}`)
    res.json({ id: userId, username, role, permissions, is_active: true, created_at: new Date().toISOString() })
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El usuario ya existe' })
    res.status(500).json({ error: 'Error al crear usuario' })
  }
})

router.put('/users/:id', adminMiddleware, (req, res) => {
  const b       = req.body || {}
  const updates = {}
  if (b.role !== undefined) {
    updates.role        = b.role === 'admin' ? 'admin' : 'user'
    updates.permissions = updates.role === 'admin'
      ? ['all']
      : (Array.isArray(b.permissions) ? b.permissions.filter(p => PLATFORMS.includes(p)) : [])
  } else if (b.permissions !== undefined) {
    updates.permissions = Array.isArray(b.permissions) ? b.permissions.filter(p => PLATFORMS.includes(p)) : []
  }
  if (b.is_active !== undefined) updates.is_active = bool(b.is_active)
  if (b.password)                updates.password_hash = hashPassword(str(b.password, 200))
  const target = db.getUserById(req.params.id)
  db.updateUser(req.params.id, updates)
  let desc = `Actualizó usuario '${target?.username || req.params.id}'`
  if (b.is_active !== undefined) desc = `${bool(b.is_active) ? 'Reactivó' : 'Desactivó'} usuario '${target?.username || req.params.id}'`
  else if (b.password) desc = `Cambió contraseña de usuario '${target?.username || req.params.id}'`
  else if (b.role !== undefined || b.permissions !== undefined) desc = `Actualizó permisos de usuario '${target?.username || req.params.id}'`
  audit(req, 'UPDATE', 'user', req.params.id, desc)
  res.json({ ok: true })
})

router.delete('/users/:id', adminMiddleware, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' })
  const all = db.getAllUsers()
  const target = all.find(u => u.id === req.params.id)
  if (target?.role === 'admin' && all.filter(u => u.role === 'admin' && u.is_active).length <= 1) {
    return res.status(400).json({ error: 'No puedes eliminar al único administrador activo' })
  }
  db.deleteUser(req.params.id)
  audit(req, 'DELETE', 'user', req.params.id,
    target ? `Eliminó usuario '${target.username}'` : `Eliminó usuario ${req.params.id}`)
  res.json({ ok: true })
})

// ── Platform Prices ───────────────────────────────────────────────────
router.get('/platform-prices', (req, res) => {
  res.json(db.getPlatformPrices())
})

router.put('/platform-prices/:platform', adminMiddleware, (req, res) => {
  const price = Number(req.body?.price)
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Precio inválido' })
  db.updatePlatformPrice(req.params.platform, price)
  audit(req, 'UPDATE', 'payment', req.params.platform,
    `Actualizó precio de venta de ${req.params.platform} a S/ ${price}`)
  res.json({ ok: true })
})

router.put('/platform-prices/:platform/renewal', adminMiddleware, (req, res) => {
  const price = Number(req.body?.price)
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Precio inválido' })
  db.updatePlatformRenewalPrice(req.params.platform, price)
  audit(req, 'UPDATE', 'payment', req.params.platform,
    `Actualizó precio de renovación de ${req.params.platform} a S/ ${price}`)
  res.json({ ok: true })
})

router.put('/platform-prices/:platform/reseller', adminMiddleware, (req, res) => {
  const price = Number(req.body?.price)
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Precio inválido' })
  db.updatePlatformResellerPrice(req.params.platform, price)
  audit(req, 'UPDATE', 'payment', req.params.platform,
    `Actualizó precio de revendedor de ${req.params.platform} a S/ ${price}`)
  res.json({ ok: true })
})

// ── Combo Prices ──────────────────────────────────────────────────────
router.get('/combo-prices', (req, res) => {
  res.json(db.getComboPrices())
})

router.put('/combo-prices', adminMiddleware, (req, res) => {
  const { platforms, price } = req.body || {}
  if (!Array.isArray(platforms) || platforms.length < 2) return res.status(400).json({ error: 'Mínimo 2 plataformas' })
  const p = Number(price)
  if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Precio inválido' })
  const row = db.upsertComboPrice(platforms, p)
  audit(req, 'UPDATE', 'payment', row.id, `Configuró precio de combo ${row.platforms} a S/ ${p}`)
  res.json(row)
})

router.delete('/combo-prices/:id', adminMiddleware, (req, res) => {
  db.deleteComboPrice(req.params.id)
  audit(req, 'DELETE', 'payment', req.params.id, `Eliminó precio de combo ${req.params.id}`)
  res.json({ ok: true })
})

// ── Manual transaction (para combos) ─────────────────────────────────
router.post('/transactions/manual', (req, res) => {
  const b = req.body || {}
  if (!b.type || !b.amount) return res.status(400).json({ error: 'Faltan campos' })
  db.createTransaction({
    type:        String(b.type),
    category:    String(b.category || 'renewal'),
    platform:    String(b.platform || ''),
    amount:      Number(b.amount) || 0,
    clientName:  String(b.clientName || ''),
    clientPhone: String(b.clientPhone || ''),
    notes:       String(b.notes || ''),
    userId:      req.user?.id || '',
    username:    req.user?.username || 'sistema',
  })
  res.json({ ok: true })
})

// ── Transactions ──────────────────────────────────────────────────────
router.get('/transactions', (req, res) => {
  const { from = '', to = '', type = '', platform = '', page = 1, limit = 50 } = req.query
  const result = db.getTransactions({
    from:     String(from).trim(),
    to:       String(to).trim(),
    type:     String(type).trim(),
    platform: String(platform).trim(),
    page:     Number(page),
    limit:    Math.min(Number(limit) || 50, 200),
  })
  res.json(result)
})

router.get('/summary', (req, res) => {
  const { from = '', to = '' } = req.query
  res.json(db.getFinancialSummary({
    from: String(from).trim(),
    to:   String(to).trim(),
  }))
})

router.get('/monthly-summary', (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24)
  res.json(db.getMonthlySummary(months))
})

// ── Reports ───────────────────────────────────────────────────────────
router.get('/reports/transactions', (req, res) => {
  const { from = '', to = '', type = '', platform = '' } = req.query
  let rows = db.getTransactionsAll({
    from:     String(from).trim(),
    to:       String(to).trim(),
    type:     String(type).trim(),
    platform: String(platform).trim(),
  })
  if (req.user?.role !== 'admin') {
    const perms = req.user?.permissions || []
    rows = rows.filter(r => !r.platform || perms.includes(r.platform))
  }
  res.json(rows)
})

router.get('/reports/subscriptions', (req, res) => {
  const { status = '', platform = '' } = req.query
  let platforms = null
  if (req.user?.role !== 'admin') {
    const perms = req.user?.permissions || []
    platforms = platform
      ? (perms.includes(String(platform).trim()) ? [String(platform).trim()] : [])
      : perms
  } else if (platform) {
    platforms = [String(platform).trim()]
  }
  const rows = db.getSubscriptionsReport({ platforms, status: String(status).trim() })
  res.json(rows)
})

// ── Clients Analytics ─────────────────────────────────────────────────
router.get('/clients/analytics', (req, res) => {
  res.json(db.getClientsAnalytics())
})

// ── Tickets (reportes de clientes del Portal Cliente, PLAN.md Día 4) ──
const TICKET_STATUSES = ['abierto', 'en_revision', 'resuelto']

router.get('/tickets', (req, res) => {
  const status = String(req.query.status || '').trim()
  res.json(db.getTickets({ status: TICKET_STATUSES.includes(status) ? status : '' }))
})

// Reasigna el ticket a otro perfil disponible de la MISMA plataforma (la cuenta vieja
// se cayó/tiene problemas) — busca el nuevo antes de liberar el viejo, ver db.js.
router.post('/tickets/:id/reassign', (req, res) => {
  const result = db.reassignProfileForTicket(req.params.id)

  if (result.error === 'TICKET_NO_ENCONTRADO') return res.status(404).json({ error: result.error })
  if (result.error === 'SIN_PLATAFORMA') return res.status(400).json({ error: result.error })
  if (result.error === 'SIN_STOCK') return res.status(409).json({ error: 'SIN_STOCK', platform: result.platform })

  audit(req, 'UPDATE', 'ticket', req.params.id,
    `Reasignó ticket "${result.ticket.subject}" (${result.ticket.order_code}) de ${result.ticket.client_name || '—'} al perfil #${result.profileNumber} de ${result.platform}`)

  res.json({
    profileId: result.profileId,
    profileNumber: result.profileNumber,
    accountEmail: result.accountEmail,
    accountPassword: result.accountPassword,
    profilePin: result.profilePin,
    expiryDate: result.expiryDate,
    platform: result.platform,
  })
})

// Notifica al portal DIRECTO (sin pasar por portal->gateway->TPS-1) — dispara solo
// cuando el admin hace click en "Guardar y notificar" en TicketsView.jsx (b.notify).
// Es la única llamada TPS-1 -> portal de todo el sistema, deliberada y de un solo uso
// por click, no un webhook automático. El job de polling del portal
// (server/lib/ticketNotifyJob.js, cada 15 min) sigue como red de seguridad si esto
// falla — ej. el portal está caído justo en ese instante.
async function notifyPortal(payload) {
  const url = process.env.PORTAL_NOTIFY_URL
  const key = process.env.PORTAL_NOTIFY_KEY
  if (!url || !key) {
    console.warn('[notifyPortal] PORTAL_NOTIFY_URL/PORTAL_NOTIFY_KEY no configurados — se omite el aviso inmediato (el job de polling del portal lo recogerá en su próxima corrida)')
    return { ok: false }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TPS1-Notify-Key': key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok }
  } catch (err) {
    console.error('[notifyPortal] error', err.message)
    return { ok: false }
  }
}

router.put('/tickets/:id', async (req, res) => {
  const b = req.body || {}
  const clean = {}
  if (b.status !== undefined) clean.status = TICKET_STATUSES.includes(b.status) ? b.status : 'abierto'
  if (b.adminResponse !== undefined) clean.adminResponse = str(b.adminResponse, 1000)

  const ticket = db.updateTicket(req.params.id, clean)
  if (ticket) {
    audit(req, 'UPDATE', 'ticket', req.params.id,
      `Actualizó ticket "${ticket.subject}" de ${ticket.client_name || ticket.order_code} → ${ticket.status}`)
  }

  let notified = false
  if (ticket && b.notify) {
    const credentials = ticket.pending_credentials ? JSON.parse(ticket.pending_credentials) : null
    const result = await notifyPortal({
      orderCode: ticket.order_code,
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      adminResponse: ticket.admin_response,
      credentials,
    })
    if (result.ok) {
      notified = true
      // Ya se entregó sincrónicamente — se borra para que el job de polling del portal
      // no la vuelva a mandar cuando corra su chequeo de rutina.
      if (credentials) db.ackTicketCredentials(ticket.id)
    }
  }

  res.json({ ok: true, notified })
})

// ── Audit Log (solo admin) ────────────────────────────────────────────
router.get('/audit', adminMiddleware, (req, res) => {
  const { page = 1, limit = 50, user = '', entity = '', from = '', to = '' } = req.query
  const result = db.getAuditLog({
    page:   Number(page),
    limit:  Math.min(Number(limit) || 50, 200),
    user:   String(user).trim(),
    entity: String(entity).trim(),
    from:   String(from).trim(),
    to:     String(to).trim(),
  })
  res.json(result)
})

router.delete('/audit', adminMiddleware, (req, res) => {
  const before = String(req.query.before || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return res.status(400).json({ error: 'Fecha inválida. Usa formato YYYY-MM-DD' })
  }
  const deleted = db.purgeAuditLog(before)
  audit(req, 'DELETE', 'audit', '', `Purgó ${deleted} registro${deleted !== 1 ? 's' : ''} de auditoría anteriores a ${before}`)
  res.json({ ok: true, deleted })
})

module.exports = router
