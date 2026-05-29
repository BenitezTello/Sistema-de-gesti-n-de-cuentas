'use strict'
const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')
const { encrypt, decrypt } = require('./crypto-utils')

// Directorio y archivo de la base de datos
const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data')
const DB_PATH  = path.join(DATA_DIR, 'streammanager.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Migraciones
try { db.exec('ALTER TABLE accounts ADD COLUMN is_down INTEGER DEFAULT 0') } catch (_) {}

try { db.exec("ALTER TABLE accounts ADD COLUMN access TEXT DEFAULT ''") } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN needs_pin_change INTEGER DEFAULT 0") } catch (_) {}

// Limpiar perfiles liberados que aún tienen clientName (versiones anteriores)
try {
  const fixed = db.prepare(
    "UPDATE profiles SET client_name='', phone='' WHERE status='available' AND client_name != ''"
  ).run()
  if (fixed.changes > 0) console.log(`[DB] Limpieza: ${fixed.changes} perfil(es) liberados correctamente`)
} catch (_) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_clients (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    phone TEXT DEFAULT ''
  )`)
} catch (_) {}

// ── Esquema ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    contact TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id               TEXT PRIMARY KEY,
    platform         TEXT NOT NULL,
    email            TEXT NOT NULL,
    password         TEXT NOT NULL,
    supplier_id      TEXT DEFAULT '',
    cost             REAL DEFAULT 0,
    expiry_date      TEXT DEFAULT '',
    max_profiles     INTEGER DEFAULT 5,
    password_changed INTEGER DEFAULT 0,
    is_full_account  INTEGER DEFAULT 0,
    full_client      TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    number      INTEGER NOT NULL,
    pin         TEXT DEFAULT '0000',
    client_name TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    status      TEXT DEFAULT 'available',
    expiry_date TEXT DEFAULT '',
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`)

// ── Migraciones Feature 1: Roles y permisos ───────────────────────────
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
  db.exec("UPDATE users SET role='admin'") // usuarios existentes → admin
} catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'") } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))") } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1") } catch (_) {}
try {
  db.exec(`UPDATE users SET permissions='["all"]' WHERE role='admin' AND (permissions='' OR permissions='[]' OR permissions IS NULL)`)
} catch (_) {}

// ── Migraciones Feature 3: Pagos ─────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_prices (
    id         TEXT PRIMARY KEY,
    platform   TEXT UNIQUE NOT NULL,
    price      REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  const ppCount = db.prepare('SELECT COUNT(*) as c FROM platform_prices').get().c
  if (ppCount === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO platform_prices (id, platform, price) VALUES (?, ?, ?)')
    ;[
      ['pp1','Netflix',13.0], ['pp2','Disney+',6.5],   ['pp3','HBO Max',6.0],
      ['pp4','Prime Video',6.0], ['pp5','Crunchyroll',5.0], ['pp6','Movistar+',5.0],
    ].forEach(([id, p, pr]) => ins.run(id, p, pr))
  }
} catch (_) {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    category     TEXT NOT NULL,
    platform     TEXT DEFAULT '',
    amount       REAL NOT NULL,
    client_name  TEXT DEFAULT '',
    client_phone TEXT DEFAULT '',
    profile_id   TEXT DEFAULT '',
    account_id   TEXT DEFAULT '',
    supplier_id  TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now'))
  )`)
} catch (_) {}

// ── Migraciones Feature 2: Audit Log ──────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   TEXT DEFAULT '',
    description TEXT NOT NULL,
    ip_address  TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  )`)
} catch (_) {}

// ── Helpers de mapeo (DB → JS) ──────────────────────────────────────
function mapProfile(p) {
  return {
    id:            p.id,
    number:        p.number,
    pin:           p.pin,
    clientName:    p.client_name,
    phone:         p.phone,
    status:        p.status,
    expiryDate:    p.expiry_date,
    needsPinChange: p.needs_pin_change === 1,
  }
}

function mapAccount(a, profiles) {
  return {
    id:              a.id,
    platform:        a.platform,
    email:           a.email,
    password:        decrypt(a.password),
    supplierId:      a.supplier_id,
    cost:            a.cost,
    expiryDate:      a.expiry_date,
    maxProfiles:     a.max_profiles,
    passwordChanged: a.password_changed === 1,
    isFullAccount:   a.is_full_account === 1,
    isDown:          a.is_down === 1,
    access:          a.access || '',
    fullClient:      JSON.parse(a.full_client || '{}'),
    profiles:        profiles.map(mapProfile),
  }
}

// ── Prepared statements ────────────────────────────────────────────────
const stmts = {
  getProfiles:   db.prepare('SELECT * FROM profiles WHERE account_id = ? ORDER BY number ASC'),
  getAccount:    db.prepare('SELECT * FROM accounts WHERE id = ?'),
  allAccounts:   db.prepare('SELECT * FROM accounts ORDER BY expiry_date ASC'),
  allSuppliers:  db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),
  insertSupplier:db.prepare('INSERT INTO suppliers (id,name,contact) VALUES (@id,@name,@contact)'),
  deleteSupplier:db.prepare('DELETE FROM suppliers WHERE id = ?'),
  deleteAccount: db.prepare('DELETE FROM accounts WHERE id = ?'),
  allProfilesWithClient: db.prepare("SELECT * FROM profiles WHERE client_name != ''"),
  allProfilesWithPhone:  db.prepare("SELECT * FROM profiles WHERE phone != ''"),
}

// ── Accounts ────────────────────────────────────────────────────────────
function getAllAccounts() {
  const accounts = stmts.allAccounts.all()
  if (!accounts.length) return []
  const allProfiles = db.prepare('SELECT * FROM profiles ORDER BY number ASC').all()
  const profileMap  = new Map()
  for (const p of allProfiles) {
    if (!profileMap.has(p.account_id)) profileMap.set(p.account_id, [])
    profileMap.get(p.account_id).push(p)
  }
  return accounts.map(a => mapAccount(a, profileMap.get(a.id) || []))
}

function getAccountById(id) {
  const a = stmts.getAccount.get(id)
  if (!a) return null
  return mapAccount(a, stmts.getProfiles.all(id))
}

const insertAccountStmt = db.prepare(`
  INSERT INTO accounts (id,platform,email,password,supplier_id,cost,expiry_date,max_profiles,password_changed,is_full_account,full_client,access)
  VALUES (@id,@platform,@email,@password,@supplierId,@cost,@expiryDate,@maxProfiles,0,0,'{}',@access)
`)

const insertProfileStmt = db.prepare(`
  INSERT INTO profiles (id,account_id,number,pin,client_name,phone,status,expiry_date)
  VALUES (@id,@accountId,@number,@pin,'','','available','')
`)

function createAccount(acc) {
  db.transaction(() => {
    insertAccountStmt.run({ ...acc, password: encrypt(acc.password), access: acc.access || '' })
    ;(acc.profiles || []).forEach(p => insertProfileStmt.run({ ...p, accountId: acc.id }))
  })()
  return getAccountById(acc.id)
}

function updateAccount(id, data) {
  const cols = {
    platform:        'platform',
    email:           'email',
    password:        'password',
    supplierId:      'supplier_id',
    cost:            'cost',
    expiryDate:      'expiry_date',
    maxProfiles:     'max_profiles',
    passwordChanged: 'password_changed',
    isFullAccount:   'is_full_account',
  }
  const sets  = []
  const params = { id }

  Object.entries(data).forEach(([k, v]) => {
    if (k === 'fullClient') { sets.push('full_client = @fullClient');    params.fullClient = JSON.stringify(v); return }
    if (k === 'passwordChanged') { sets.push('password_changed = @pwc'); params.pwc = v ? 1 : 0; return }
    if (k === 'isFullAccount')   { sets.push('is_full_account = @ifa');  params.ifa = v ? 1 : 0; return }
    if (k === 'isDown')          { sets.push('is_down = @isd');          params.isd = v ? 1 : 0; return }
    if (k === 'access')          { sets.push('access = @access');        params.access = v || ''; return }
    if (k === 'password') { sets.push('password = @password'); params.password = encrypt(v); return }
    const col = cols[k]
    if (col) { sets.push(`${col} = @${k}`); params[k] = v }
  })

  if (sets.length) db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getAccountById(id)
}

function deleteAccount(id) { stmts.deleteAccount.run(id) }

// ── Profiles ────────────────────────────────────────────────────────────
function addProfile(accountId, number, pin) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  insertProfileStmt.run({ id, accountId, number, pin: pin || '0000' })
  return id
}

function deleteProfile(id) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
}

function updateProfile(id, data) {
  const map = {
    clientName:    'client_name',
    phone:         'phone',
    pin:           'pin',
    status:        'status',
    expiryDate:    'expiry_date',
    needsPinChange:'needs_pin_change',
  }
  const sets   = []
  const params = { id }
  Object.entries(data).forEach(([k, v]) => {
    const col = map[k]
    if (col) { sets.push(`${col} = @${k}`); params[k] = v }
  })
  if (sets.length) db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

// Actualiza nombre/teléfono de un cliente en perfiles Y cuentas completas
function updateClientGlobal(matchPhone, matchName, newName, newPhone) {
  const norm  = p => p?.replace(/\D/g,'') || ''
  const mKey  = norm(matchPhone) || matchName?.toLowerCase()
  const profs = stmts.allProfilesWithClient.all()
  const upd   = db.prepare("UPDATE profiles SET client_name=@n, phone=@p WHERE id=@id")
  const updFC = db.prepare("UPDATE accounts SET full_client=@fc WHERE id=@id")

  db.transaction(() => {
    // Actualizar perfiles normales
    profs.forEach(p => {
      const pKey = norm(p.phone) || p.client_name?.toLowerCase()
      if (pKey && pKey === mKey) upd.run({ n: newName||p.client_name, p: newPhone??p.phone, id: p.id })
    })
    // Actualizar cuentas completas
    const fullAccs = db.prepare("SELECT id, full_client FROM accounts WHERE is_full_account=1").all()
    fullAccs.forEach(a => {
      try {
        const fc = JSON.parse(a.full_client || '{}')
        if (!fc.clientName) return
        const fcKey = norm(fc.phone) || fc.clientName?.toLowerCase()
        if (fcKey && fcKey === mKey) {
          fc.clientName = newName || fc.clientName
          fc.phone = newPhone ?? fc.phone
          updFC.run({ fc: JSON.stringify(fc), id: a.id })
        }
      } catch {}
    })
  })()
}

// Extiende la fecha de vencimiento de todos los perfiles de un cliente
function extendClientAllProfiles(matchPhone, matchName, newDateStr) {
  const norm  = p => p?.replace(/\D/g,'') || ''
  const mKey  = norm(matchPhone) || matchName?.toLowerCase()
  const profs = stmts.allProfilesWithClient.all()
  const upd   = db.prepare("UPDATE profiles SET expiry_date=@d WHERE id=@id")
  db.transaction(() => {
    profs.forEach(p => {
      const pKey = norm(p.phone) || p.client_name?.toLowerCase()
      if (pKey && pKey === mKey) upd.run({ d: newDateStr, id: p.id })
    })
  })()
}

// ── Suppliers ────────────────────────────────────────────────────────────
function getAllSuppliers() {
  return stmts.allSuppliers.all().map(s => ({ id: s.id, name: s.name, contact: s.contact }))
}

function createSupplier(s) { stmts.insertSupplier.run(s); return s }

function updateSupplier(id, data) {
  const sets   = []
  const params = { id }
  if (data.name    !== undefined) { sets.push('name = @name');       params.name    = data.name    }
  if (data.contact !== undefined) { sets.push('contact = @contact'); params.contact = data.contact }
  if (sets.length) db.prepare(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

function deleteSupplier(id) { stmts.deleteSupplier.run(id) }

// ── Seed inicial (solo si la BD está vacía) ────────────────────────────
function migratePasswords() {
  const rows = db.prepare('SELECT id, password FROM accounts').all()
  const upd  = db.prepare('UPDATE accounts SET password = ? WHERE id = ?')
  let n = 0
  rows.forEach(r => {
    if (!r.password.startsWith('enc:')) {
      upd.run(encrypt(r.password), r.id)
      n++
    }
  })
  if (n > 0) console.log(`[DB] ${n} contraseña(s) migradas a formato cifrado`)
}

function seedIfEmpty() {
  migratePasswords()
  const count = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c
  const countSup = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c
  if (count > 0 || countSup > 0) return

  console.log('[DB] BD vacía — insertando datos iniciales…')
  createSupplier({ id: 's1', name: 'Juan Streaming', contact: '51987654321' })
  createSupplier({ id: 's2', name: 'María Cuentas',  contact: '51912345678' })
  console.log('[DB] ✅ Datos iniciales insertados. Agrega tus cuentas desde la app.')
}

// ── Saved Clients ─────────────────────────────────────────────────────────
function getSavedClients() {
  return db.prepare('SELECT * FROM saved_clients ORDER BY name ASC').all()
}

function deleteClient(id) {
  db.prepare('DELETE FROM saved_clients WHERE id = ?').run(id)
}

function saveClient(name, phone) {
  if (!name?.trim()) return null
  const id = (phone || '').replace(/\D/g,'') || name.toLowerCase().trim()
  db.prepare('INSERT OR REPLACE INTO saved_clients (id, name, phone) VALUES (?, ?, ?)')
    .run(id, name.trim(), phone || '')
  return { id, name: name.trim(), phone: phone || '' }
}

// ── Audit Log ────────────────────────────────────────────────────────────
const _auditInsert = db.prepare(`
  INSERT INTO audit_log (id, user_id, username, action, entity, entity_id, description, ip_address)
  VALUES (@id, @userId, @username, @action, @entity, @entityId, @description, @ip)
`)

function logAction(userId, username, action, entity, entityId, description, ip) {
  try {
    const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    _auditInsert.run({
      id: logId, userId, username, action, entity,
      entityId: entityId || '',
      description,
      ip: ip || '',
    })
  } catch (err) {
    console.error('[AUDIT] Error al guardar log:', err.message)
  }
}

function purgeAuditLog(beforeDate) {
  const result = db.prepare("DELETE FROM audit_log WHERE date(created_at) < ?").run(beforeDate)
  return result.changes
}

function getAuditLog({ page = 1, limit = 50, user = '', entity = '', from = '', to = '' } = {}) {
  const where  = []
  const params = {}
  if (user)   { where.push('username LIKE @user');   params.user   = `%${user}%` }
  if (entity) { where.push('entity = @entity');      params.entity = entity }
  if (from)   { where.push("date(created_at) >= @from"); params.from = from }
  if (to)     { where.push("date(created_at) <= @to");   params.to   = to }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (Math.max(1, page) - 1) * limit
  const total  = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${whereClause}`).get(params).c
  const rows   = db.prepare(
    `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset })
  return { rows, total, page: Number(page), limit, pages: Math.ceil(total / limit) || 1 }
}

// ── Helpers para audit (lookup antes de delete) ───────────────────────
function getProfileWithAccount(profileId) {
  return db.prepare(`
    SELECT p.*, a.platform, a.email
    FROM profiles p
    JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ?
  `).get(profileId)
}

function getSavedClientById(id) {
  return db.prepare('SELECT * FROM saved_clients WHERE id = ?').get(id)
}

function getSupplierById(id) {
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

// ── Users ────────────────────────────────────────────────────────────────
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}

function createUser(id, username, passwordHash, role = 'user', permissions = []) {
  db.prepare('INSERT INTO users (id, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, passwordHash, role, JSON.stringify(permissions))
}

function getAllUsers() {
  return db.prepare(
    'SELECT id, username, role, permissions, created_at, is_active FROM users ORDER BY created_at ASC'
  ).all().map(u => ({
    ...u,
    permissions: JSON.parse(u.permissions || '[]'),
    is_active:   u.is_active !== 0,
  }))
}

function updateUser(id, data) {
  const sets   = []
  const params = { id }
  if (data.role         !== undefined) { sets.push('role = @role');                 params.role         = data.role }
  if (data.permissions  !== undefined) { sets.push('permissions = @permissions');   params.permissions  = JSON.stringify(data.permissions) }
  if (data.is_active    !== undefined) { sets.push('is_active = @is_active');       params.is_active    = data.is_active ? 1 : 0 }
  if (data.password_hash !== undefined){ sets.push('password_hash = @password_hash'); params.password_hash = data.password_hash }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

// ── Platform Prices ──────────────────────────────────────────────────
function getPlatformPrices() {
  return db.prepare('SELECT * FROM platform_prices ORDER BY platform ASC').all()
}

function getPlatformPrice(platform) {
  const row = db.prepare('SELECT price FROM platform_prices WHERE platform = ?').get(platform)
  return row ? row.price : 0
}

function updatePlatformPrice(platform, price) {
  db.prepare("UPDATE platform_prices SET price = ?, updated_at = datetime('now') WHERE platform = ?")
    .run(price, platform)
}

// ── Transactions ─────────────────────────────────────────────────────
const _txInsert = db.prepare(`
  INSERT INTO transactions
    (id, type, category, platform, amount, client_name, client_phone,
     profile_id, account_id, supplier_id, notes, user_id, username)
  VALUES
    (@id, @type, @category, @platform, @amount, @clientName, @clientPhone,
     @profileId, @accountId, @supplierId, @notes, @userId, @username)
`)

function createTransaction(data) {
  const txId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  _txInsert.run({
    id: txId,
    type:        data.type,
    category:    data.category,
    platform:    data.platform    || '',
    amount:      data.amount,
    clientName:  data.clientName  || '',
    clientPhone: data.clientPhone || '',
    profileId:   data.profileId   || '',
    accountId:   data.accountId   || '',
    supplierId:  data.supplierId  || '',
    notes:       data.notes       || '',
    userId:      data.userId,
    username:    data.username,
  })
  return txId
}

function getTransactions({ from = '', to = '', type = '', platform = '', page = 1, limit = 50 } = {}) {
  const where  = []
  const params = {}
  if (from)     { where.push("date(created_at) >= @from"); params.from     = from }
  if (to)       { where.push("date(created_at) <= @to");   params.to       = to }
  if (type)     { where.push('type = @type');               params.type     = type }
  if (platform) { where.push('platform = @platform');       params.platform = platform }
  const wc     = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (Math.max(1, page) - 1) * limit
  const total  = db.prepare(`SELECT COUNT(*) as c FROM transactions ${wc}`).get(params).c
  const rows   = db.prepare(
    `SELECT * FROM transactions ${wc} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset })
  return { rows, total, page: Number(page), limit, pages: Math.ceil(total / limit) || 1 }
}

function getMonthlySummary(months = 6) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - (months - 1))
  const fromStr = d.toISOString().slice(0, 10)

  const rows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, type, SUM(amount) as total
    FROM transactions
    WHERE date(created_at) >= ?
    GROUP BY month, type
    ORDER BY month ASC
  `).all(fromStr)

  const result = []
  for (let i = months - 1; i >= 0; i--) {
    const cur = new Date()
    cur.setDate(1)
    cur.setMonth(cur.getMonth() - i)
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const income  = rows.find(r => r.month === key && r.type === 'income' )?.total || 0
    const expense = rows.find(r => r.month === key && r.type === 'expense')?.total || 0
    result.push({ month: key, income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 })
  }
  return result
}

function getFinancialSummary({ from = '', to = '' } = {}) {
  const where  = []
  const params = {}
  if (from) { where.push("date(created_at) >= @from"); params.from = from }
  if (to)   { where.push("date(created_at) <= @to");   params.to   = to }
  const wc   = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db.prepare(
    `SELECT type, platform, SUM(amount) as total FROM transactions ${wc} GROUP BY type, platform`
  ).all(params)

  let incomeTotal = 0, expenseTotal = 0
  const byPlatform = {}
  rows.forEach(r => {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { platform: r.platform, income: 0, expense: 0 }
    if (r.type === 'income') {
      incomeTotal += r.total
      byPlatform[r.platform].income += r.total
    } else {
      expenseTotal += r.total
      byPlatform[r.platform].expense += r.total
    }
  })

  const round = (n) => Math.round(n * 100) / 100
  return {
    income_total:  round(incomeTotal),
    expense_total: round(expenseTotal),
    net_profit:    round(incomeTotal - expenseTotal),
    by_platform:   Object.values(byPlatform)
      .map(p => ({ ...p, income: round(p.income), expense: round(p.expense), profit: round(p.income - p.expense) }))
      .sort((a, b) => b.income - a.income),
    period: { from, to },
  }
}

// ── Reports ──────────────────────────────────────────────────────────
function getTransactionsAll({ from = '', to = '', type = '', platform = '' } = {}) {
  const where  = []
  const params = {}
  if (from)     { where.push("date(created_at) >= @from"); params.from     = from }
  if (to)       { where.push("date(created_at) <= @to");   params.to       = to }
  if (type)     { where.push('type = @type');               params.type     = type }
  if (platform) { where.push('platform = @platform');       params.platform = platform }
  const wc   = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT * FROM transactions ${wc} ORDER BY created_at DESC`)
  return Object.keys(params).length ? stmt.all(params) : stmt.all()
}

function getSubscriptionsReport({ platforms = null, status = '' } = {}) {
  if (platforms !== null && platforms.length === 0) return []
  const rows = db.prepare(`
    SELECT p.id, p.number, p.client_name, p.phone, p.expiry_date,
           a.platform, a.email
    FROM profiles p
    JOIN accounts a ON p.account_id = a.id
    WHERE p.client_name != ''
    ORDER BY a.platform ASC, p.expiry_date ASC
  `).all()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return rows
    .filter(r => !platforms || platforms.includes(r.platform))
    .map(r => {
      let rowStatus = 'active'
      let daysRemaining = null
      if (r.expiry_date) {
        const [y, m, d] = r.expiry_date.split('-').map(Number)
        const exp = new Date(y, m - 1, d)
        daysRemaining = Math.round((exp - today) / 86400000)
        if      (daysRemaining < 0)   rowStatus = 'expired'
        else if (daysRemaining === 0) rowStatus = 'today'
        else if (daysRemaining <= 2)  rowStatus = 'soon'
        else                          rowStatus = 'active'
      }
      return { ...r, status: rowStatus, days_remaining: daysRemaining }
    })
    .filter(r => !status || r.status === status)
}

module.exports = {
  getAllAccounts, getAccountById, createAccount, updateAccount, deleteAccount,
  addProfile, deleteProfile,
  updateProfile, updateClientGlobal, extendClientAllProfiles,
  getAllSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getSavedClients, saveClient, deleteClient,
  getUserByUsername, createUser, getAllUsers, updateUser, deleteUser,
  logAction, getAuditLog, purgeAuditLog,
  getProfileWithAccount, getSavedClientById, getSupplierById, getUserById,
  getPlatformPrices, getPlatformPrice, updatePlatformPrice,
  createTransaction, getTransactions, getFinancialSummary, getMonthlySummary,
  getTransactionsAll, getSubscriptionsReport,
  seedIfEmpty,
}
