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
  const profiles  = Array.from({ length: maxP }, (_, i) => ({
    id: id(), accountId, number: i + 1, pin: '0000',
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
  }
  res.json(acc || { error: 'not found' })
})

router.delete('/accounts/:id', (req, res) => {
  const acc = db.getAccountById(req.params.id)
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
    `Actualizó precio de ${req.params.platform} a S/ ${price}`)
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
