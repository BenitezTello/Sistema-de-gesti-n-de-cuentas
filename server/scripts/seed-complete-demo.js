'use strict'
/**
 * seed-complete-demo.js
 *
 * Genera la BD completa para la rama demo académica:
 *   - 1 usuario admin  →  demo / demo
 *   - 2 proveedores
 *   - 82 cuentas (50 Netflix · 15 Disney+ · 10 HBO Max · 5 Prime Video · 2 Crunchyroll)
 *   - ~400 perfiles asignados + libres
 *   - 50 clientes guardados
 *   - 6 meses de transacciones históricas (~4000 registros)
 *
 * Uso: node server/scripts/seed-complete-demo.js
 */

const Database = require('better-sqlite3')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const path     = require('path')
const fs       = require('fs')

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
  const d = new Date(TODAY); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10)
}

function randDate(year, month, dayFrom, dayTo) {
  const day  = dayFrom + Math.floor(Math.random() * (dayTo - dayFrom + 1))
  const h    = 8 + Math.floor(Math.random() * 12)
  const m    = Math.floor(Math.random() * 60)
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
}

// ── Crear BD ──────────────────────────────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, '../data')
fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'streammanager.db')
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user', permissions TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')), is_active INTEGER DEFAULT 1
  );
  CREATE TABLE suppliers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT DEFAULT ''
  );
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, platform TEXT NOT NULL, email TEXT NOT NULL,
    password TEXT NOT NULL, supplier_id TEXT DEFAULT '', cost REAL DEFAULT 0,
    expiry_date TEXT DEFAULT '', max_profiles INTEGER DEFAULT 5,
    password_changed INTEGER DEFAULT 0, is_full_account INTEGER DEFAULT 0,
    full_client TEXT DEFAULT '{}', is_down INTEGER DEFAULT 0, access TEXT DEFAULT ''
  );
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, number INTEGER NOT NULL,
    pin TEXT DEFAULT '0000', client_name TEXT DEFAULT '', phone TEXT DEFAULT '',
    status TEXT DEFAULT 'available', expiry_date TEXT DEFAULT '',
    needs_pin_change INTEGER DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
  CREATE TABLE saved_clients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT ''
  );
  CREATE TABLE platform_prices (
    id TEXT PRIMARY KEY, platform TEXT UNIQUE NOT NULL, price REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, category TEXT NOT NULL,
    platform TEXT DEFAULT '', amount REAL NOT NULL,
    client_name TEXT DEFAULT '', client_phone TEXT DEFAULT '',
    profile_id TEXT DEFAULT '', account_id TEXT DEFAULT '',
    supplier_id TEXT DEFAULT '', notes TEXT DEFAULT '',
    user_id TEXT NOT NULL, username TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
    action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT DEFAULT '',
    description TEXT NOT NULL, ip_address TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

const insUser   = db.prepare('INSERT INTO users (id,username,password_hash,role,permissions) VALUES (?,?,?,?,?)')
const insSupp   = db.prepare('INSERT INTO suppliers (id,name,contact) VALUES (?,?,?)')
const insAcc    = db.prepare('INSERT INTO accounts (id,platform,email,password,supplier_id,cost,expiry_date,max_profiles) VALUES (?,?,?,?,?,?,?,?)')
const insProf   = db.prepare('INSERT INTO profiles (id,account_id,number,pin,client_name,phone,status,expiry_date) VALUES (?,?,?,?,?,?,?,?)')
const insClient = db.prepare('INSERT OR IGNORE INTO saved_clients (id,name,phone) VALUES (?,?,?)')
const insPrice  = db.prepare('INSERT INTO platform_prices (id,platform,price) VALUES (?,?,?)')
const insTx     = db.prepare(`INSERT INTO transactions (id,type,category,platform,amount,client_name,client_phone,profile_id,account_id,supplier_id,notes,user_id,username,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

// ── 1. Usuario demo ───────────────────────────────────────────────────────────
console.log('Creando usuario...')
insUser.run('usr_demo', 'demo', bcrypt.hashSync('demo', 12), 'admin', '["all"]')

// ── 2. Proveedores ────────────────────────────────────────────────────────────
insSupp.run('sup1', 'StreamPro Peru',  '51987100001')
insSupp.run('sup2', 'CuentasHD Shop',  '51987100002')

// ── 3. Precios ────────────────────────────────────────────────────────────────
insPrice.run('pp1','Netflix',13.0); insPrice.run('pp2','Disney+',6.5)
insPrice.run('pp3','HBO Max',6.0);  insPrice.run('pp4','Prime Video',6.0)
insPrice.run('pp5','Crunchyroll',5.0); insPrice.run('pp6','Movistar+',5.0)

// ── 4. Clientes ───────────────────────────────────────────────────────────────
const CLIENTES = [
  ['Carlos Mamani','51987200001'],   ['Sandra Quispe','51987200002'],
  ['Luis Torres','51987200003'],     ['Ana Flores','51987200004'],
  ['Pedro Ramos','51987200005'],     ['María García','51987200006'],
  ['Jorge Herrera','51987200007'],   ['Rosa Mendoza','51987200008'],
  ['Diego Castro','51987200009'],    ['Lucia Vega','51987200010'],
  ['Andrés Paredes','51987200011'],  ['Carmen Rojas','51987200012'],
  ['Fabio Soto','51987200013'],      ['Elena Mora','51987200014'],
  ['Miguel Cano','51987200015'],     ['Valeria Ortiz','51987200016'],
  ['Renato Vargas','51987200017'],   ['Patricia Lima','51987200018'],
  ['César Navarro','51987200019'],   ['Gloria Díaz','51987200020'],
  ['Oscar Fuentes','51987200021'],   ['Claudia Reyes','51987200022'],
  ['Marcos Peña','51987200023'],     ['Xiomara Lara','51987200024'],
  ['Hernán Paz','51987200025'],      ['Ricardo Solis','51987200026'],
  ['Fernanda Cruz','51987200027'],   ['David Rios','51987200028'],
  ['Isabel Campos','51987200029'],   ['Héctor Lima','51987200030'],
  ['Natalia Torres','51987200031'],  ['Gabriel Moreno','51987200032'],
  ['Paola Ruiz','51987200033'],      ['Sebastián Vega','51987200034'],
  ['Adriana Paz','51987200035'],     ['Joaquín Soto','51987200036'],
  ['Daniela Reyes','51987200037'],   ['Rodrigo Herrera','51987200038'],
  ['Camila Díaz','51987200039'],     ['Felipe Castro','51987200040'],
  ['Bruno Salas','51987200041'],     ['Karla Espinoza','51987200042'],
  ['Nico Paredes','51987200043'],    ['Gaby Morales','51987200044'],
  ['Tomás Ríos','51987200045'],      ['Luciana Fuentes','51987200046'],
  ['Emilio Vera','51987200047'],     ['Sofía Castillo','51987200048'],
  ['Álvaro Meza','51987200049'],     ['Pamela Loza','51987200050'],
  ['Roberto Chávez','51987200051'],  ['Miriam Santos','51987200052'],
  ['Gustavo Quispe','51987200053'],  ['Alicia Mamani','51987200054'],
  ['Fernando Torres','51987200055'], ['Cecilia Flores','51987200056'],
  ['Raúl Ramos','51987200057'],      ['Lorena García','51987200058'],
  ['Iván Herrera','51987200059'],    ['Patricia Mendoza','51987200060'],
  ['Cristian Castro','51987200061'], ['Verónica Vega','51987200062'],
  ['Javier Paredes','51987200063'],  ['Roxana Rojas','51987200064'],
  ['Óscar Soto','51987200065'],      ['Magaly Mora','51987200066'],
  ['Wilfredo Cano','51987200067'],   ['Noemi Ortiz','51987200068'],
  ['Humberto Vargas','51987200069'], ['Yolanda Lima','51987200070'],
  ['Alfredo Navarro','51987200071'], ['Beatriz Díaz','51987200072'],
  ['Leandro Fuentes','51987200073'], ['Violeta Reyes','51987200074'],
  ['Ernesto Peña','51987200075'],    ['Consuelo Lara','51987200076'],
  ['Mariano Paz','51987200077'],     ['Esperanza Solis','51987200078'],
  ['Salvador Cruz','51987200079'],   ['Yeni Rios','51987200080'],
  ['Arturo Campos','51987200081'],   ['Soledad Lima','51987200082'],
  ['Germán Torres','51987200083'],   ['Flor Moreno','51987200084'],
  ['Beto Ruiz','51987200085'],       ['Tania Vega','51987200086'],
  ['Charly Soto','51987200087'],     ['Karina Reyes','51987200088'],
  ['Marco Castro','51987200089'],    ['Diana Díaz','51987200090'],
  ['Hugo Salas','51987200091'],      ['Leslie Espinoza','51987200092'],
  ['Raúl Paredes','51987200093'],    ['Vanessa Morales','51987200094'],
  ['Darwin Ríos','51987200095'],     ['Wendy Fuentes','51987200096'],
  ['Jhon Vera','51987200097'],       ['Angie Castillo','51987200098'],
  ['Elder Meza','51987200099'],      ['Nadia Loza','51987200100'],
]

for (const [name, phone] of CLIENTES) insClient.run(phone, name, phone)

let clientIdx = 0
const nextClient = () => CLIENTES[clientIdx++ % CLIENTES.length]

function makeExpiry(type) {
  if (type === 'expired')  return addDays(-5 - Math.floor(Math.random() * 20))
  if (type === 'expiring') return addDays(Math.floor(Math.random() * 3))
  if (type === 'active')   return addDays(10 + Math.floor(Math.random() * 45))
  return ''
}

// ── 5. Cuentas con perfiles ───────────────────────────────────────────────────
console.log('Creando cuentas y perfiles...')

const DEFS = [
  // [platform, suppId, cost, qty, profilePatterns]
  ['Netflix',     'sup1', 35.0, 50, ['active','active','active','active','active'],      addDays(18)],
  ['Disney+',     'sup1', 14.0, 15, ['active','active','active','expiring','available'], addDays(22)],
  ['HBO Max',     'sup2',  5.0, 10, ['active','active','expiring','available','available'], addDays(15)],
  ['Prime Video', 'sup2',  6.0,  5, ['active','active','active','active','available'],   addDays(20)],
  ['Crunchyroll', 'sup2',  5.0,  2, ['active','active','active','available','available'],addDays(25)],
]

// Para variar los patrones, alternamos entre varias combinaciones
const PATTERNS = [
  ['active','active','active','active','active'],
  ['active','active','active','expiring','available'],
  ['active','active','expiring','expiring','available'],
  ['active','active','active','expired','available'],
  ['active','active','active','active','active'],
  ['active','expired','expired','available','available'],
  ['active','active','active','expiring','active'],
  ['available','available','available','available','available'],
  ['active','active','active','active','expired'],
  ['active','active','active','active','expiring'],
]

for (const [platform, suppId, cost, qty, , baseExp] of DEFS) {
  for (let i = 0; i < qty; i++) {
    const accId   = uid()
    const num     = String(i+1).padStart(2,'0')
    const email   = `${platform.toLowerCase().replace(/[^a-z]/g,'')}.demo${num}@gmail.com`
    const expiry  = addDays(Math.floor(Math.random() * 30) + 5)
    const pattern = PATTERNS[i % PATTERNS.length]
    insAcc.run(accId, platform, email, encrypt(`${platform.replace(' ','').replace('+','Plus')}Demo${num}!`), suppId, cost, expiry, 5)
    pattern.forEach((tipo, j) => {
      const profId = uid()
      let clientName = '', phone = '', status = 'available', exp = ''
      if (tipo !== 'available') {
        const [name, ph] = nextClient()
        clientName = name; phone = ph; status = 'occupied'; exp = makeExpiry(tipo)
      }
      insProf.run(profId, accId, j+1, `${1000+j+1}`, clientName, phone, status, exp)
    })
  }
}

// ── 6. Transacciones históricas (6 meses) ─────────────────────────────────────
console.log('Generando transacciones...')

const PRECIO  = { 'Netflix':13.0, 'Disney+':6.5, 'HBO Max':6.0, 'Prime Video':6.0, 'Crunchyroll':5.0 }
const COSTO   = { 'Netflix':35.0, 'Disney+':14.0,'HBO Max':5.0, 'Prime Video':6.0, 'Crunchyroll':5.0 }
const RENOVAC = { 'Netflix':50, 'Disney+':15, 'HBO Max':10, 'Prime Video':5, 'Crunchyroll':2 }

const MESES = [
  [2025, 12, { 'Netflix':240, 'Disney+':55, 'HBO Max':90, 'Prime Video':20, 'Crunchyroll':8  }, 28],
  [2026,  1, { 'Netflix':265, 'Disney+':62, 'HBO Max':98, 'Prime Video':22, 'Crunchyroll':9  }, 28],
  [2026,  2, { 'Netflix':285, 'Disney+':68, 'HBO Max':105,'Prime Video':23, 'Crunchyroll':9  }, 28],
  [2026,  3, { 'Netflix':305, 'Disney+':72, 'HBO Max':112,'Prime Video':24, 'Crunchyroll':10 }, 28],
  [2026,  4, { 'Netflix':330, 'Disney+':78, 'HBO Max':120,'Prime Video':25, 'Crunchyroll':10 }, 28],
  [2026,  5, { 'Netflix':298, 'Disney+':68, 'HBO Max':108,'Prime Video':22, 'Crunchyroll':9  }, 25],
]

const pick = arr => arr[Math.floor(Math.random() * arr.length)]

const seedTx = db.transaction(() => {
  let total = 0
  for (const [year, month, clientes, dayMax] of MESES) {
    for (const [plat, qty] of Object.entries(RENOVAC)) {
      for (let i = 0; i < qty; i++) {
        insTx.run(uid(),'expense','account_purchase',plat,COSTO[plat],'','','','','sup1','DEMO_DATA','usr_demo','demo',randDate(year,month,1,15))
        total++
      }
    }
    for (const [plat, qty] of Object.entries(clientes)) {
      if (!PRECIO[plat]) continue
      for (let i = 0; i < qty; i++) {
        const [nombre, phone] = pick(CLIENTES)
        insTx.run(uid(),'income','subscription',plat,PRECIO[plat],nombre,phone,'','','','DEMO_DATA','usr_demo','demo',randDate(year,month,1,dayMax))
        total++
      }
    }
  }
  return total
})

const totalTx = seedTx()

// ── 7. Audit log ──────────────────────────────────────────────────────────────
const insAudit = db.prepare(`INSERT INTO audit_log (id,user_id,username,action,entity,entity_id,description,ip_address,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
const AUDITS = [
  ['CREATE','account','','Cuenta Netflix creada'],
  ['UPDATE','profile','','Perfil asignado a cliente'],
  ['CREATE','transaction','','Ingreso registrado — Netflix'],
  ['DELETE','profile','','Perfil liberado'],
  ['UPDATE','account','','Contraseña de cuenta actualizada'],
  ['CREATE','supplier','','Proveedor agregado'],
  ['LOGIN','user','','Inicio de sesión'],
  ['CREATE','transaction','','Egreso registrado — compra de cuenta'],
]
for (const [action, entity, entityId, desc] of AUDITS) {
  insAudit.run(uid(),'usr_demo','demo',action,entity,entityId,desc,'127.0.0.1',randDate(2026,5,1,28))
}

db.close()

// ── Resumen ───────────────────────────────────────────────────────────────────
const db2      = new Database(DB_PATH)
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
