'use strict'
const fs   = require('fs')
const path = require('path')

process.env.DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data')

const db = require('../db')

// ── Columnas del Excel (índice 0) ─────────────────────────────────────
// A=0  B=1  C=2(perfil#)  D=3(nombre)  E=4(teléfono)  F=5(PIN)
// G=6(email)  H=7(password)  I=8  J=9(venc.cliente)
// K=10  L=11  M=12  N=13  O=14(proveedor)  P=15  Q=16(venc.cuenta)  R=17

const CSV_FILE = process.argv[2]
if (!CSV_FILE) {
  console.error('\n❌  Uso: node server/scripts/import-excel.js /app/archivo.csv\n')
  process.exit(1)
}

// ── Utilidades ────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function parseDate(str) {
  if (!str || !str.trim()) return ''
  const clean = str.trim().replace(/['"]/g, '')
  const parts  = clean.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts.map(p => p.trim())
  if (!y || y.length < 4) return ''
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

function cleanPhone(str) {
  if (!str) return ''
  return str.trim().replace(/\s+/g,'').replace(/['"]/g,'')
}

function parseCSVLine(line) {
  const sep = line.includes(';') ? ';' : ','
  const result = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === sep && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result.map(v => v.trim().replace(/^"|"$/g,''))
}

function getOrCreateSupplier(name) {
  if (!name || !name.trim()) return ''
  const clean = name.trim()
  const found = db.getAllSuppliers().find(s => s.name.toLowerCase() === clean.toLowerCase())
  if (found) return found.id
  const newId = genId()
  db.createSupplier({ id: newId, name: clean, contact: '' })
  console.log(`  → Proveedor creado: "${clean}"`)
  return newId
}

// ── Leer CSV ──────────────────────────────────────────────────────────
const content = fs.readFileSync(CSV_FILE, 'utf8').replace(/\r/g,'')
let rows = content.split('\n')
  .filter(l => l.trim())
  .map(parseCSVLine)

// Saltar encabezado si existe
if (rows.length && isNaN(parseInt(rows[0][2]))) rows = rows.slice(1)

// ── Agrupar filas por email ───────────────────────────────────────────
const accountMap = new Map()
for (const row of rows) {
  const email = (row[6] || '').trim()
  if (!email || !email.includes('@')) continue
  if (!accountMap.has(email)) accountMap.set(email, [])
  accountMap.get(email).push(row)
}

console.log(`\n📋  ${accountMap.size} cuentas encontradas en el CSV\n`)

// ── Obtener emails ya existentes en la BD ─────────────────────────────
const existingEmails = new Set(
  db.getAllAccounts().map(a => a.email.toLowerCase())
)

// ── Importar ──────────────────────────────────────────────────────────
let ok = 0, skipped = 0, errors = 0

for (const [email, rows] of accountMap) {
  // Saltar si ya existe
  if (existingEmails.has(email.toLowerCase())) {
    console.log(`⚠️   Saltando ${email} — ya existe en la BD`)
    skipped++
    continue
  }

  try {
    const first        = rows[0]
    const password     = (first[7]  || '').trim()
    const supplierName = (first[14] || '').trim()
    const acctExpiry   = parseDate(first[16] || '')
    const supplierId   = getOrCreateSupplier(supplierName)
    const accountId    = genId()

    // Preparar perfiles
    const profilesData = rows
      .map(row => ({
        id:         genId(),
        number:     parseInt(row[2]) || 1,
        pin:        (row[5] || '0000').trim(),
        clientName: (row[3] || '').trim(),
        phone:      cleanPhone(row[4] || ''),
        expiryDate: parseDate(row[9] || ''),
      }))
      .sort((a, b) => a.number - b.number)

    // Crear cuenta en la BD
    db.createAccount({
      id:          accountId,
      platform:    'Netflix',
      email,
      password,
      supplierId,
      cost:        0,
      expiryDate:  acctExpiry,
      maxProfiles: 5,
      profiles:    profilesData.map(p => ({
        id: p.id, accountId, number: p.number, pin: p.pin,
      })),
    })

    // Actualizar perfiles con datos del cliente
    const created = db.getAccountById(accountId)
    for (const prof of created.profiles) {
      const data = profilesData.find(p => p.number === prof.number)
      if (data && (data.clientName || data.phone || data.expiryDate)) {
        db.updateProfile(prof.id, {
          clientName: data.clientName,
          phone:      data.phone,
          status:     data.clientName ? 'active' : 'available',
          expiryDate: data.expiryDate,
        })
      }
    }

    const conCliente = profilesData.filter(p => p.clientName).length
    console.log(`✅  ${email} → ${profilesData.length} perfiles (${conCliente} con cliente)`)
    ok++

  } catch (err) {
    console.error(`❌  Error con ${email}:`, err.message)
    errors++
  }
}

console.log(`\n════════════════════════════════════`)
console.log(`✅  Importadas:  ${ok} cuentas`)
console.log(`⚠️   Saltadas:    ${skipped} (ya existían)`)
console.log(`❌  Errores:     ${errors}`)
console.log(`════════════════════════════════════\n`)
