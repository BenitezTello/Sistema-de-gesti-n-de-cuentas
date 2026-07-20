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
  db.exec("ALTER TABLE platform_prices ADD COLUMN renewal_price REAL DEFAULT 0")
  db.exec("UPDATE platform_prices SET renewal_price = price WHERE renewal_price = 0")
} catch (_) {}

try {
  db.exec("ALTER TABLE platform_prices ADD COLUMN reseller_price REAL DEFAULT 0")
  db.exec("UPDATE platform_prices SET reseller_price = price WHERE reseller_price = 0")
} catch (_) {}

try { db.exec("ALTER TABLE profiles ADD COLUMN is_reseller INTEGER DEFAULT 0") } catch (_) {}
try { db.exec("ALTER TABLE saved_clients ADD COLUMN is_reseller INTEGER DEFAULT 0") } catch (_) {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS combo_prices (
    id         TEXT PRIMARY KEY,
    platforms  TEXT UNIQUE NOT NULL,
    price      REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
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

// ── Integración Portal Cliente (TPS-2), Día 4: tickets ─────────────────
// Los reportes/tickets viven acá (no en el portal) porque el admin que los
// resuelve ya trabaja en TPS-1 (PLAN.md sección 3 de ABT-Portal-Cliente).
try {
  db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id             TEXT PRIMARY KEY,
    order_code     TEXT NOT NULL,
    profile_id     TEXT DEFAULT '',
    account_id     TEXT DEFAULT '',
    client_name    TEXT DEFAULT '',
    client_phone   TEXT DEFAULT '',
    subject        TEXT NOT NULL,
    description    TEXT DEFAULT '',
    status         TEXT DEFAULT 'abierto',
    admin_response TEXT DEFAULT '',
    created_at     TEXT DEFAULT (datetime('now')),
    resolved_at    TEXT DEFAULT ''
  )`)
} catch (_) {}

// Día 5 (ABT-Portal-Cliente): credenciales nuevas pendientes de entregar al cliente
// cuando el admin reasigna la cuenta de un ticket. Vive acá como JSON transitorio —
// el portal la consume una sola vez (job de polling) y la confirma con /ack-credentials,
// que la borra. Mismo criterio de "se muestra una vez" que ya usa el resto del sistema,
// solo que estirado a "una vez, en el próximo chequeo del portal" en vez de síncrono.
try { db.exec("ALTER TABLE tickets ADD COLUMN pending_credentials TEXT DEFAULT ''") } catch (_) {}

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
    isReseller:     p.is_reseller === 1,
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
    isReseller:    'is_reseller',
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
  db.prepare('INSERT OR IGNORE INTO saved_clients (id, name, phone) VALUES (?, ?, ?)')
    .run(id, name.trim(), phone || '')
  db.prepare('UPDATE saved_clients SET name = ?, phone = ? WHERE id = ?')
    .run(name.trim(), phone || '', id)
  return { id, name: name.trim(), phone: phone || '' }
}

function setClientResellerStatus(phone, name, isReseller) {
  const id = (phone || '').replace(/\D/g,'') || name?.toLowerCase()?.trim()
  if (!id) return
  db.prepare('INSERT OR IGNORE INTO saved_clients (id, name, phone) VALUES (?, ?, ?)').run(id, name || '', phone || '')
  db.prepare('UPDATE saved_clients SET is_reseller = ? WHERE id = ?').run(isReseller ? 1 : 0, id)
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

function getPlatformRenewalPrice(platform) {
  const row = db.prepare('SELECT renewal_price FROM platform_prices WHERE platform = ?').get(platform)
  return row ? (row.renewal_price ?? 0) : 0
}

function updatePlatformRenewalPrice(platform, price) {
  db.prepare("UPDATE platform_prices SET renewal_price = ?, updated_at = datetime('now') WHERE platform = ?")
    .run(price, platform)
}

function getPlatformResellerPrice(platform) {
  const row = db.prepare('SELECT reseller_price FROM platform_prices WHERE platform = ?').get(platform)
  return row ? (row.reseller_price ?? 0) : 0
}

function updatePlatformResellerPrice(platform, price) {
  db.prepare("UPDATE platform_prices SET reseller_price = ?, updated_at = datetime('now') WHERE platform = ?")
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

// ── Clients Analytics ────────────────────────────────────────────────
function getClientsAnalytics() {
  const now       = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  // Primera transacción de cada cliente (para detectar "nuevo")
  const firstTx = db.prepare(`
    SELECT client_name, MIN(date(created_at)) as first_date
    FROM transactions
    WHERE type='income' AND client_name != ''
    GROUP BY client_name
  `).all()

  const newThisMonth = firstTx.filter(r => r.first_date && r.first_date.startsWith(thisMonth)).length

  // Por día de semana (0=Dom … 6=Sáb)
  const wdRows = db.prepare(`
    SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow, COUNT(*) as count
    FROM transactions
    WHERE type='income' AND client_name != ''
    GROUP BY dow ORDER BY dow
  `).all()
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const wdMap = {}
  wdRows.forEach(r => { wdMap[r.dow] = r.count })
  const byWeekday = DAYS.map((day, i) => ({ day, count: wdMap[i] || 0 }))

  // Nuevos clientes por mes (últimos 6 meses)
  const LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const monthlyNew = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const count = firstTx.filter(r => r.first_date && r.first_date.startsWith(key)).length
    monthlyNew.push({ month: key, label: LABELS[d.getMonth()], count })
  }

  // Top 10 clientes por número de transacciones
  const topClients = db.prepare(`
    SELECT client_name as name, client_phone as phone,
           COUNT(*) as tx_count, ROUND(SUM(amount),2) as total
    FROM transactions
    WHERE type='income' AND client_name != ''
    GROUP BY client_name
    ORDER BY tx_count DESC
    LIMIT 10
  `).all()

  return { newThisMonth, byWeekday, monthlyNew, topClients }
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

// ── Combo Prices ─────────────────────────────────────────────────────────
function normalizePlatforms(arr) {
  return [...arr].sort().join('|')
}
function getComboPrices() {
  return db.prepare('SELECT * FROM combo_prices ORDER BY platforms ASC').all()
}
function getComboPriceByPlatforms(platformsArray) {
  const key = normalizePlatforms(platformsArray)
  const row = db.prepare('SELECT price FROM combo_prices WHERE platforms = ?').get(key)
  return row ? row.price : null
}
function upsertComboPrice(platformsArray, price) {
  const key = normalizePlatforms(platformsArray)
  const existing = db.prepare('SELECT id FROM combo_prices WHERE platforms = ?').get(key)
  const cid = existing ? existing.id : Date.now().toString(36) + Math.random().toString(36).slice(2,6)
  db.prepare("INSERT OR REPLACE INTO combo_prices (id, platforms, price, updated_at) VALUES (?, ?, ?, datetime('now'))")
    .run(cid, key, price)
  return { id: cid, platforms: key, price }
}
function deleteComboPrice(id) {
  db.prepare('DELETE FROM combo_prices WHERE id = ?').run(id)
}

// ── Integración Portal Cliente (TPS-2), Día 4 ──────────────────────────
// GET /api/integration/stock — cuenta perfiles disponibles de una plataforma
// (misma noción de "disponible" que usa el admin: status='available' y la
// cuenta dueña no está caída).
const _integrationFindAvailableProfile = db.prepare(`
  SELECT p.id as profile_id, p.number, p.pin, a.id as account_id, a.email, a.password
  FROM profiles p
  JOIN accounts a ON p.account_id = a.id
  WHERE a.platform = ? AND (a.is_down IS NULL OR a.is_down = 0) AND p.status = 'available'
  ORDER BY p.number ASC
  LIMIT 1
`)

// Variante para reassignProfileForTicket: el botón "Reasignar cuenta" existe porque
// la cuenta ACTUAL tiene un problema — excluye esa cuenta explícitamente, no solo las
// marcadas is_down. Sin esto, si la cuenta actual tenía otro perfil libre, se le podía
// devolver al mismo cliente un perfil de la MISMA cuenta problemática (bug real
// encontrado el 2026-07-19: no resolvía nada, solo cambiaba el número de perfil).
const _integrationFindAvailableProfileExcludingAccount = db.prepare(`
  SELECT p.id as profile_id, p.number, p.pin, a.id as account_id, a.email, a.password
  FROM profiles p
  JOIN accounts a ON p.account_id = a.id
  WHERE a.platform = ? AND a.id != ? AND (a.is_down IS NULL OR a.is_down = 0) AND p.status = 'available'
  ORDER BY p.number ASC
  LIMIT 1
`)

function countAvailableProfiles(platform) {
  return db.prepare(`
    SELECT COUNT(*) as c
    FROM profiles p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.platform = ? AND (a.is_down IS NULL OR a.is_down = 0) AND p.status = 'available'
  `).get(platform).c
}

const _integrationAssignProfile = db.prepare(`
  UPDATE profiles SET status = 'active', client_name = @clientName, phone = @clientPhone, expiry_date = @expiryDate
  WHERE id = @profileId
`)

// POST /api/integration/assign-profile — todo en una única transacción síncrona:
// better-sqlite3 es síncrono y Node single-thread, así que no hay forma de que dos
// compras concurrentes intercalen el SELECT del perfil disponible y el UPDATE que lo
// marca 'active' (PLAN.md sección 3 de ABT-Portal-Cliente). Devuelve null si no hay stock.
function assignProfileForPortal({ platform, orderCode, clientName, clientPhone }) {
  return db.transaction(() => {
    const found = _integrationFindAvailableProfile.get(platform)
    if (!found) return null

    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)
    const expiryDate = expiry.toISOString().slice(0, 10)

    _integrationAssignProfile.run({
      profileId: found.profile_id,
      clientName: clientName || '',
      clientPhone: clientPhone || '',
      expiryDate,
    })

    const price = getPlatformPrice(platform)
    createTransaction({
      type: 'income', category: 'venta-portal',
      platform, amount: price,
      clientName: clientName || '', clientPhone: clientPhone || '',
      profileId: found.profile_id, accountId: found.account_id,
      notes: orderCode, // orders/order_code viven en el portal, no acá — se cruzan por este campo
      userId: 'portal-system', username: 'Portal Cliente',
    })

    logAction('portal-system', 'Portal Cliente', 'assign_profile', 'profile', found.profile_id,
      `Asignó perfil #${found.number} de ${platform} a ${clientName || '—'} vía Portal Cliente (pedido ${orderCode})`)

    return {
      profileId: found.profile_id,
      profileNumber: found.number,
      accountEmail: found.email,
      accountPassword: decrypt(found.password),
      profilePin: found.pin,
      expiryDate,
    }
  })()
}

// ── Tickets (Portal Cliente, vía gateway) ──────────────────────────────
const _insertIntegrationTicket = db.prepare(`
  INSERT INTO tickets (id, order_code, profile_id, account_id, client_name, client_phone, subject, description)
  VALUES (@id, @orderCode, @profileId, @accountId, @clientName, @clientPhone, @subject, @description)
`)

function insertIntegrationTicket({ orderCode, subject, description, clientName, clientPhone }) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  // orders/order_code viven en el portal, no acá — se resuelve profile_id/account_id
  // cruzando el orderCode guardado en transactions.notes por assignProfileForPortal.
  const tx = db.prepare(
    "SELECT profile_id, account_id FROM transactions WHERE notes = ? AND category = 'venta-portal' LIMIT 1"
  ).get(orderCode)
  _insertIntegrationTicket.run({
    id,
    orderCode,
    profileId: tx?.profile_id || '',
    accountId: tx?.account_id || '',
    clientName: clientName || '',
    clientPhone: clientPhone || '',
    subject,
    description: description || '',
  })
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
}

function getIntegrationTicketsByOrderCodes(orderCodes) {
  if (!orderCodes.length) return []
  const placeholders = orderCodes.map(() => '?').join(',')
  return db.prepare(
    `SELECT * FROM tickets WHERE order_code IN (${placeholders}) ORDER BY created_at DESC`
  ).all(...orderCodes)
}

function getTicketsCountByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) as c FROM tickets GROUP BY status').all()
  const result = { abierto: 0, en_revision: 0, resuelto: 0 }
  rows.forEach(r => { result[r.status] = r.c })
  return result
}

// ── Tickets — panel admin (lectura/resolución, consumido por server/routes/data.js) ──
function getTickets({ status = '' } = {}) {
  const where = []
  const params = {}
  if (status) { where.push('t.status = @status'); params.status = status }
  const wc = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return db.prepare(`
    SELECT t.*, a.platform as platform
    FROM tickets t
    LEFT JOIN accounts a ON t.account_id = a.id
    ${wc}
    ORDER BY t.created_at DESC
  `).all(params)
}

// ── Estado en vivo de un pedido del Portal Cliente ──────────────────────
// No hay ningún "puntero" que haya que mantener sincronizado a mano: se resuelve
// mirando el ticket más reciente con perfil asignado para ese order_code (si hubo
// una reasignación) o, si no hay ninguno, la venta original en 'transactions'.
// Compartido por getOrderCurrentProfile y renewProfileForPortal (PLAN.md Día 5,
// ABT-Portal-Cliente) para no duplicar esta resolución en dos sitios.
function _resolveProfileIdForOrder(orderCode) {
  const fromTicket = db.prepare(`
    SELECT profile_id FROM tickets
    WHERE order_code = @orderCode AND profile_id != ''
    ORDER BY created_at DESC LIMIT 1
  `).get({ orderCode })
  if (fromTicket?.profile_id) return fromTicket.profile_id

  const fromTx = db.prepare(`
    SELECT profile_id FROM transactions
    WHERE notes = @orderCode AND category = 'venta-portal' LIMIT 1
  `).get({ orderCode })
  return fromTx?.profile_id || null
}

// Como consulta el estado ACTUAL de profiles/accounts (no una foto vieja), también
// refleja solo cambiar el PIN o extender el vencimiento sin necesidad de reasignar.
// No incluye la contraseña a propósito — ese dato solo se muestra una vez, igual que
// en la compra original (mismo criterio de seguridad que ya usa el portal). Incluye
// platform/renewalPrice (Día 5) para que el portal pueda cotizar la renovación sin
// necesitar un endpoint nuevo — este mismo ya viaja por el job diario y "Actualizar".
function getOrderCurrentProfile(orderCode) {
  const profileId = _resolveProfileIdForOrder(orderCode)
  if (!profileId) return null

  const row = db.prepare(`
    SELECT p.id as profile_id, p.number, p.pin, p.expiry_date, p.status, a.email, a.platform
    FROM profiles p JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ?
  `).get(profileId)
  if (!row) return null

  return {
    profileId: row.profile_id,
    profileNumber: row.number,
    accountEmail: row.email,
    profilePin: row.pin,
    expiryDate: row.expiry_date,
    status: row.status,
    platform: row.platform,
    renewalPrice: getPlatformRenewalPrice(row.platform),
  }
}

// POST /api/integration/renew-profile — extiende el vencimiento del perfil VIGENTE
// de un pedido (mismo profile_id, a diferencia de reassignProfileForTicket que asigna
// uno nuevo). A diferencia de la reasignación de ticket, acá SÍ hay un cobro nuevo
// (ya efectivizado en Culqi del lado del portal antes de llamar esto), así que sí se
// registra una transacción de ingreso — con el precio de renovación que TPS-1 mismo
// calcula (nunca confía en un monto que le mande el portal, mismo criterio que
// assignProfileForPortal). Si el perfil aún no vencía, extiende desde su vencimiento
// actual (no se pierden días ya pagados); si ya venció, extiende desde hoy.
function renewProfileForPortal(orderCode) {
  return db.transaction(() => {
    const profileId = _resolveProfileIdForOrder(orderCode)
    if (!profileId) return null

    const row = db.prepare(`
      SELECT p.id as profile_id, p.number, p.pin, p.expiry_date, p.client_name, p.phone, a.id as account_id, a.platform
      FROM profiles p JOIN accounts a ON p.account_id = a.id
      WHERE p.id = ?
    `).get(profileId)
    if (!row) return null

    const today = new Date()
    const currentExpiry = row.expiry_date ? new Date(row.expiry_date) : null
    const base = currentExpiry && currentExpiry > today ? currentExpiry : today
    base.setDate(base.getDate() + 30)
    const expiryDate = base.toISOString().slice(0, 10)

    db.prepare('UPDATE profiles SET expiry_date = ? WHERE id = ?').run(expiryDate, profileId)

    const price = getPlatformRenewalPrice(row.platform)
    createTransaction({
      type: 'income', category: 'renovacion-portal',
      platform: row.platform, amount: price,
      clientName: row.client_name || '', clientPhone: row.phone || '',
      profileId: row.profile_id, accountId: row.account_id,
      notes: orderCode,
      userId: 'portal-system', username: 'Portal Cliente',
    })

    logAction('portal-system', 'Portal Cliente', 'renew_profile', 'profile', profileId,
      `Renovó perfil de ${row.platform} vía Portal Cliente (pedido ${orderCode}), nuevo vencimiento ${expiryDate}`)

    return { profileId, profileNumber: row.number, profilePin: row.pin, expiryDate, amountCharged: price, platform: row.platform }
  })()
}

// Reasigna un ticket a un perfil distinto de la MISMA plataforma — resuelve "la
// cuenta se cayó, muevo al cliente a otra" sin dejarlo sin nada: busca el perfil
// nuevo ANTES de tocar el viejo, todo en una única transacción atómica. No genera
// ninguna transacción de ingreso nueva (no hubo cobro, es un reemplazo de servicio).
function reassignProfileForTicket(ticketId) {
  return db.transaction(() => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId)
    if (!ticket) return { error: 'TICKET_NO_ENCONTRADO' }

    let platform = ''
    if (ticket.account_id) {
      platform = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(ticket.account_id)?.platform || ''
    }
    if (!platform) return { error: 'SIN_PLATAFORMA' }

    const found = _integrationFindAvailableProfileExcludingAccount.get(platform, ticket.account_id)
    if (!found) return { error: 'SIN_STOCK', platform }

    if (ticket.profile_id) {
      db.prepare("UPDATE profiles SET status='available', client_name='', phone='' WHERE id = ?").run(ticket.profile_id)
    }

    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)
    const expiryDate = expiry.toISOString().slice(0, 10)

    _integrationAssignProfile.run({
      profileId: found.profile_id,
      clientName: ticket.client_name || '',
      clientPhone: ticket.client_phone || '',
      expiryDate,
    })

    const accountPassword = decrypt(found.password)

    // Queda pendiente de entregar al cliente por correo — el portal la recoge en su
    // próximo chequeo (job de polling, PLAN.md Día 5) y la confirma con /ack-credentials,
    // que borra este campo. No se guarda en ningún otro lado más que acá, transitoriamente.
    const pendingCredentials = JSON.stringify({
      profileId: found.profile_id,
      profileNumber: found.number,
      accountEmail: found.email,
      accountPassword,
      profilePin: found.pin,
      expiryDate,
    })

    db.prepare('UPDATE tickets SET profile_id = ?, account_id = ?, pending_credentials = ? WHERE id = ?')
      .run(found.profile_id, found.account_id, pendingCredentials, ticketId)

    return {
      ticket,
      profileId: found.profile_id,
      profileNumber: found.number,
      accountEmail: found.email,
      accountPassword,
      profilePin: found.pin,
      expiryDate,
      platform,
    }
  })()
}

// GET /api/integration/tickets/notifications — consumido por el job de polling del
// portal (PLAN.md Día 5): trae los tickets de esos order_codes con su estado actual
// (status/admin_response) y, si hubo una reasignación pendiente de avisar, las
// credenciales nuevas. El portal decide localmente si hay algo nuevo que notificar
// comparando contra su propio snapshot — acá no se guarda ningún "ya avisado".
function getTicketNotificationsByOrderCodes(orderCodes) {
  if (!orderCodes.length) return []
  const placeholders = orderCodes.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT * FROM tickets WHERE order_code IN (${placeholders}) ORDER BY created_at DESC`
  ).all(...orderCodes)
  return rows.map(t => ({
    ...t,
    pending_credentials: t.pending_credentials ? JSON.parse(t.pending_credentials) : null,
  }))
}

// POST /api/integration/tickets/ack-credentials — el portal ya mandó el correo con
// las credenciales nuevas, se borran para que no se vuelvan a entregar.
function ackTicketCredentials(ticketId) {
  db.prepare("UPDATE tickets SET pending_credentials = '' WHERE id = ?").run(ticketId)
}

function updateTicket(id, data) {
  const sets = []
  const params = { id }
  if (data.status !== undefined) {
    sets.push('status = @status', 'resolved_at = @resolvedAt')
    params.status = data.status
    params.resolvedAt = data.status === 'resuelto' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : ''
  }
  if (data.adminResponse !== undefined) {
    sets.push('admin_response = @adminResponse')
    params.adminResponse = data.adminResponse
  }
  if (sets.length) db.prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
}

module.exports = {
  getAllAccounts, getAccountById, createAccount, updateAccount, deleteAccount,
  addProfile, deleteProfile,
  updateProfile, updateClientGlobal, extendClientAllProfiles,
  getAllSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getSavedClients, saveClient, deleteClient, setClientResellerStatus,
  getUserByUsername, createUser, getAllUsers, updateUser, deleteUser,
  logAction, getAuditLog, purgeAuditLog,
  getProfileWithAccount, getSavedClientById, getSupplierById, getUserById,
  getPlatformPrices, getPlatformPrice, updatePlatformPrice, getPlatformRenewalPrice, updatePlatformRenewalPrice, getPlatformResellerPrice, updatePlatformResellerPrice,
  createTransaction, getTransactions, getFinancialSummary, getMonthlySummary,
  getTransactionsAll, getSubscriptionsReport,
  getComboPrices, getComboPriceByPlatforms, upsertComboPrice, deleteComboPrice,
  getClientsAnalytics,
  seedIfEmpty,
  countAvailableProfiles, assignProfileForPortal,
  insertIntegrationTicket, getIntegrationTicketsByOrderCodes, getTicketsCountByStatus,
  getTickets, updateTicket,
  getOrderCurrentProfile, reassignProfileForTicket, renewProfileForPortal,
  getTicketNotificationsByOrderCodes, ackTicketCredentials,
}
