'use strict'
/**
 * seed-complete-demo.js
 *
 * Genera la BD completa para la rama demo académica:
 *   - 1 usuario admin  →  demo / demo
 *   - 2 proveedores
 *   - 13 cuentas (8 Netflix · 3 Disney+ · 2 HBO Max) con perfiles
 *   - ~50 perfiles asignados (activos, por vencer, vencidos) + libres
 *   - 15 clientes guardados
 *   - 6 meses de transacciones históricas
 *
 * Uso: node server/scripts/seed-complete-demo.js
 */

const Database = require('better-sqlite3')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const path     = require('path')
const fs       = require('fs')

// ── Clave de cifrado fija para la demo ────────────────────────────────────────
// Debe coincidir con ENCRYPTION_KEY del .env de la demo
const DEMO_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
const ALGO     = 'aes-256-gcm'

function encrypt(text) {
  if (!text) return text
  const key    = Buffer.from(DEMO_KEY, 'hex')
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

const uid     = () => Math.random().toString(36).slice(2,9) + Math.random().toString(36).slice(2,6)
const TODAY   = new Date('2026-05-29')

function addDays(n) {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function randDate(year, month, dayFrom, dayTo) {
  const day  = dayFrom + Math.floor(Math.random() * (dayTo - dayFrom + 1))
  const h    = 8 + Math.floor(Math.random() * 10)
  const m    = Math.floor(Math.random() * 60)
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
}

// ── Crear / limpiar BD ────────────────────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, '../data')
fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'streammanager.db')
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'user',
    permissions   TEXT DEFAULT '[]',
    created_at    TEXT DEFAULT (datetime('now')),
    is_active     INTEGER DEFAULT 1
  );
  CREATE TABLE suppliers (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    contact TEXT DEFAULT ''
  );
  CREATE TABLE accounts (
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
    full_client      TEXT DEFAULT '{}',
    is_down          INTEGER DEFAULT 0,
    access           TEXT DEFAULT ''
  );
  CREATE TABLE profiles (
    id               TEXT PRIMARY KEY,
    account_id       TEXT NOT NULL,
    number           INTEGER NOT NULL,
    pin              TEXT DEFAULT '0000',
    client_name      TEXT DEFAULT '',
    phone            TEXT DEFAULT '',
    status           TEXT DEFAULT 'available',
    expiry_date      TEXT DEFAULT '',
    needs_pin_change INTEGER DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
  CREATE TABLE saved_clients (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    phone TEXT DEFAULT ''
  );
  CREATE TABLE platform_prices (
    id         TEXT PRIMARY KEY,
    platform   TEXT UNIQUE NOT NULL,
    price      REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE transactions (
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
  );
  CREATE TABLE audit_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   TEXT DEFAULT '',
    description TEXT NOT NULL,
    ip_address  TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );
`)

// ── Prepared statements ───────────────────────────────────────────────────────
const insUser    = db.prepare('INSERT INTO users (id,username,password_hash,role,permissions) VALUES (?,?,?,?,?)')
const insSupp    = db.prepare('INSERT INTO suppliers (id,name,contact) VALUES (?,?,?)')
const insAcc     = db.prepare(`INSERT INTO accounts (id,platform,email,password,supplier_id,cost,expiry_date,max_profiles) VALUES (?,?,?,?,?,?,?,?)`)
const insProf    = db.prepare(`INSERT INTO profiles (id,account_id,number,pin,client_name,phone,status,expiry_date) VALUES (?,?,?,?,?,?,?,?)`)
const insClient  = db.prepare('INSERT OR IGNORE INTO saved_clients (id,name,phone) VALUES (?,?,?)')
const insPrice   = db.prepare('INSERT INTO platform_prices (id,platform,price) VALUES (?,?,?)')
const insTx      = db.prepare(`INSERT INTO transactions (id,type,category,platform,amount,client_name,client_phone,profile_id,account_id,supplier_id,notes,user_id,username,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

// ── 1. Usuario demo ───────────────────────────────────────────────────────────
console.log('Creando usuario demo...')
const demoHash = bcrypt.hashSync('demo', 12)
insUser.run('usr_demo', 'demo', demoHash, 'admin', '["all"]')

// ── 2. Proveedores ────────────────────────────────────────────────────────────
console.log('Creando proveedores...')
insSupp.run('sup1', 'StreamPro Peru',  '51987100001')
insSupp.run('sup2', 'CuentasHD Shop',  '51987100002')

// ── 3. Precios de plataforma ──────────────────────────────────────────────────
insPrice.run('pp1', 'Netflix',     13.0)
insPrice.run('pp2', 'Disney+',      6.5)
insPrice.run('pp3', 'HBO Max',      6.0)
insPrice.run('pp4', 'Prime Video',  6.0)
insPrice.run('pp5', 'Crunchyroll',  5.0)
insPrice.run('pp6', 'Movistar+',    5.0)

// ── 4. Clientes (nombres ficticios) ───────────────────────────────────────────
const CLIENTES = [
  ['Carlos Mamani',   '51987200001'],
  ['Sandra Quispe',   '51987200002'],
  ['Luis Torres',     '51987200003'],
  ['Ana Flores',      '51987200004'],
  ['Pedro Ramos',     '51987200005'],
  ['María García',    '51987200006'],
  ['Jorge Herrera',   '51987200007'],
  ['Rosa Mendoza',    '51987200008'],
  ['Diego Castro',    '51987200009'],
  ['Lucia Vega',      '51987200010'],
  ['Andrés Paredes',  '51987200011'],
  ['Carmen Rojas',    '51987200012'],
  ['Fabio Soto',      '51987200013'],
  ['Elena Mora',      '51987200014'],
  ['Miguel Cano',     '51987200015'],
  ['Valeria Ortiz',   '51987200016'],
  ['Renato Vargas',   '51987200017'],
  ['Patricia Lima',   '51987200018'],
  ['César Navarro',   '51987200019'],
  ['Gloria Díaz',     '51987200020'],
  ['Oscar Fuentes',   '51987200021'],
  ['Claudia Reyes',   '51987200022'],
  ['Marcos Peña',     '51987200023'],
  ['Xiomara Lara',    '51987200024'],
  ['Hernán Paz',      '51987200025'],
  ['Ricardo Solis',   '51987200026'],
  ['Fernanda Cruz',   '51987200027'],
  ['David Rios',      '51987200028'],
  ['Isabel Campos',   '51987200029'],
  ['Héctor Lima',     '51987200030'],
  ['Natalia Torres',  '51987200031'],
  ['Gabriel Moreno',  '51987200032'],
  ['Paola Ruiz',      '51987200033'],
  ['Sebastián Vega',  '51987200034'],
  ['Adriana Paz',     '51987200035'],
  ['Joaquín Soto',    '51987200036'],
  ['Daniela Reyes',   '51987200037'],
  ['Rodrigo Herrera', '51987200038'],
  ['Camila Díaz',     '51987200039'],
  ['Felipe Castro',   '51987200040'],
  ['Bruno Salas',     '51987200041'],
  ['Karla Espinoza',  '51987200042'],
  ['Nico Paredes',    '51987200043'],
  ['Gaby Morales',    '51987200044'],
  ['Tomás Ríos',      '51987200045'],
  ['Luciana Fuentes', '51987200046'],
  ['Emilio Vera',     '51987200047'],
  ['Sofía Castillo',  '51987200048'],
  ['Álvaro Meza',     '51987200049'],
  ['Pamela Loza',     '51987200050'],
]

for (const [name, phone] of CLIENTES) {
  insClient.run(phone, name, phone)
}

let clientIdx = 0
const nextClient = () => CLIENTES[clientIdx++ % CLIENTES.length]

// ── 5. Cuentas y perfiles ─────────────────────────────────────────────────────
console.log('Creando cuentas y perfiles...')

// Distribución de estados de perfiles para que los gráficos muestren variedad
// expiry relativo a hoy (2026-05-29):
//  expired   → addDays(-15) a addDays(-3)
//  expiring  → addDays(0)  a addDays(2)
//  active    → addDays(10) a addDays(45)
//  available → sin fecha

function makeExpiry(type) {
  if (type === 'expired')   return addDays(-5  - Math.floor(Math.random() * 15))
  if (type === 'expiring')  return addDays(Math.floor(Math.random() * 3))
  if (type === 'active')    return addDays(12 + Math.floor(Math.random() * 35))
  return ''
}

const CUENTAS_DEF = [
  // [platform, qty, supplier, cost, accExpiry, passw, profilePattern]
  // profilePattern: array de 5 tipos ('expired','expiring','active','available')
  ['Netflix', 'sup1', 35.0, [
    { pass: 'NetflixDemo01!', exp: addDays(15), perfiles: ['active','active','active','active','active'] },
    { pass: 'NetflixDemo02!', exp: addDays(18), perfiles: ['active','active','active','expiring','available'] },
    { pass: 'NetflixDemo03!', exp: addDays(22), perfiles: ['active','active','expiring','expiring','available'] },
    { pass: 'NetflixDemo04!', exp: addDays(12), perfiles: ['active','active','active','expired','available'] },
    { pass: 'NetflixDemo05!', exp: addDays(30), perfiles: ['active','active','active','active','active'] },
    { pass: 'NetflixDemo06!', exp: addDays(5),  perfiles: ['active','expired','expired','available','available'] },
    { pass: 'NetflixDemo07!', exp: addDays(20), perfiles: ['active','active','active','expiring','active'] },
    { pass: 'NetflixDemo08!', exp: addDays(8),  perfiles: ['available','available','available','available','available'] },
  ]],
  ['Disney+', 'sup1', 14.0, [
    { pass: 'DisneyDemo01!', exp: addDays(20), perfiles: ['active','active','active','expiring','available'] },
    { pass: 'DisneyDemo02!', exp: addDays(10), perfiles: ['active','active','expired','available','available'] },
    { pass: 'DisneyDemo03!', exp: addDays(25), perfiles: ['active','active','active','active','active'] },
  ]],
  ['HBO Max', 'sup2', 5.0, [
    { pass: 'HBODemo01!', exp: addDays(15), perfiles: ['active','active','expiring','available','available'] },
    { pass: 'HBODemo02!', exp: addDays(28), perfiles: ['active','active','active','active','expired'] },
  ]],
]

for (const [platform, suppId, cost, cuentas] of CUENTAS_DEF) {
  cuentas.forEach((c, i) => {
    const accId = uid()
    const num   = String(i + 1).padStart(2, '0')
    const email = `${platform.toLowerCase().replace(/[^a-z]/g,'')}.demo${num}@gmail.com`
    insAcc.run(accId, platform, email, encrypt(c.pass), suppId, cost, c.exp, 5)

    c.perfiles.forEach((tipo, j) => {
      const profId = uid()
      let clientName = '', phone = '', status = 'available', expiry = ''
      if (tipo !== 'available') {
        const [name, ph] = nextClient()
        clientName = name
        phone      = ph
        status     = 'occupied'
        expiry     = makeExpiry(tipo)
      }
      insProf.run(profId, accId, j + 1, `${1000 + j + 1}`, clientName, phone, status, expiry)
    })
  })
}

// ── 6. Transacciones históricas (6 meses) ─────────────────────────────────────
console.log('Generando transacciones históricas...')

const PRECIO  = { Netflix: 13.0, 'Disney+': 6.5, 'HBO Max': 6.0 }
const COSTO   = { Netflix: 35.0, 'Disney+': 14.0, 'HBO Max': 5.0 }
const RENOVAC = { Netflix: 8, 'Disney+': 3, 'HBO Max': 2 }

const MESES = [
  [2025, 12, { Netflix: 145, 'Disney+': 30, 'HBO Max': 50 }, 28],
  [2026,  1, { Netflix: 168, 'Disney+': 36, 'HBO Max': 58 }, 28],
  [2026,  2, { Netflix: 190, 'Disney+': 42, 'HBO Max': 64 }, 28],
  [2026,  3, { Netflix: 210, 'Disney+': 48, 'HBO Max': 70 }, 28],
  [2026,  4, { Netflix: 232, 'Disney+': 55, 'HBO Max': 78 }, 28],
  [2026,  5, { Netflix: 198, 'Disney+': 46, 'HBO Max': 65 }, 25],
]

const pick = arr => arr[Math.floor(Math.random() * arr.length)]

const seedTx = db.transaction(() => {
  let total = 0
  for (const [year, month, clientes, dayMax] of MESES) {
    // Egresos: renovación de cuentas al proveedor
    for (const [plat, qty] of Object.entries(RENOVAC)) {
      for (let i = 0; i < qty; i++) {
        insTx.run(uid(), 'expense', 'account_purchase', plat, COSTO[plat],
          '', '', '', '', 'sup1', 'DEMO_DATA', 'usr_demo', 'demo',
          randDate(year, month, 1, 15))
        total++
      }
    }
    // Ingresos: cobros a clientes
    for (const [plat, qty] of Object.entries(clientes)) {
      for (let i = 0; i < qty; i++) {
        const [nombre, phone] = pick(CLIENTES)
        insTx.run(uid(), 'income', 'subscription', plat, PRECIO[plat],
          nombre, phone, '', '', '', 'DEMO_DATA', 'usr_demo', 'demo',
          randDate(year, month, 1, dayMax))
        total++
      }
    }
  }
  return total
})

const totalTx = seedTx()

// ── 7. Audit log de muestra ───────────────────────────────────────────────────
const insAudit = db.prepare(`INSERT INTO audit_log (id,user_id,username,action,entity,entity_id,description,ip_address,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
const AUDIT_SAMPLES = [
  ['CREATE','account','','Cuenta Netflix creada'],
  ['UPDATE','profile','','Perfil asignado a cliente'],
  ['CREATE','transaction','','Ingreso registrado — Netflix'],
  ['DELETE','profile','','Perfil liberado'],
  ['UPDATE','account','','Contraseña de cuenta actualizada'],
  ['CREATE','supplier','','Proveedor agregado'],
  ['LOGIN','user','','Inicio de sesión'],
  ['CREATE','transaction','','Egreso registrado — compra de cuenta'],
]
for (const [action, entity, entityId, desc] of AUDIT_SAMPLES) {
  insAudit.run(uid(), 'usr_demo', 'demo', action, entity, entityId, desc, '127.0.0.1',
    randDate(2026, 5, 1, 28))
}

db.close()

// ── Resumen ───────────────────────────────────────────────────────────────────
const db2 = new Database(DB_PATH)
const accounts = db2.prepare('SELECT COUNT(*) as c FROM accounts').get().c
const profiles = db2.prepare('SELECT COUNT(*) as c FROM profiles').get().c
const occupied = db2.prepare("SELECT COUNT(*) as c FROM profiles WHERE status='occupied'").get().c
const clients  = db2.prepare('SELECT COUNT(*) as c FROM saved_clients').get().c
const txCount  = db2.prepare('SELECT COUNT(*) as c FROM transactions').get().c
db2.close()

console.log('\n✅  BD demo generada correctamente')
console.log(`   Cuentas   : ${accounts}`)
console.log(`   Perfiles  : ${profiles} total (${occupied} ocupados)`)
console.log(`   Clientes  : ${clients}`)
console.log(`   Transacc. : ${totalTx} (${txCount} en BD)`)
console.log(`   BD en     : ${DB_PATH}\n`)
