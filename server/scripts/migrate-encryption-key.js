'use strict'
/**
 * Uso: node server/scripts/migrate-encryption-key.js OLD_KEY NEW_KEY
 *
 * Re-encripta todas las contraseñas de cuentas de la BD
 * pasándolas de OLD_KEY a NEW_KEY (ambas en hex de 64 chars).
 *
 * Ejemplo:
 *   node server/scripts/migrate-encryption-key.js \
 *     REPLACED \
 *     c05b78ecf2c878017bcfee59294991f3eb9d3d33a73777e6506e5cb8b10b7e2c
 */

const Database = require('better-sqlite3')
const crypto   = require('crypto')
const path     = require('path')

const OLD_KEY = process.argv[2]
const NEW_KEY = process.argv[3]

if (!OLD_KEY || !NEW_KEY) {
  console.error('Uso: node migrate-encryption-key.js OLD_KEY NEW_KEY')
  process.exit(1)
}
if (OLD_KEY.length !== 64 || NEW_KEY.length !== 64) {
  console.error('Ambas claves deben ser 64 caracteres hex (32 bytes)')
  process.exit(1)
}

const ALGO = 'aes-256-gcm'

function decrypt(text, keyHex) {
  if (!text || !text.startsWith('enc:')) return text
  try {
    const [, ivHex, tagHex, encHex] = text.split(':')
    const key      = Buffer.from(keyHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
  } catch {
    return null
  }
}

function encrypt(text, keyHex) {
  if (!text) return text
  const key    = Buffer.from(keyHex, 'hex')
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

const DB_DIR  = process.env.DB_DIR || path.join(__dirname, '../data')
const DB_PATH = path.join(DB_DIR, 'streammanager.db')

console.log(`\n[migrate] BD: ${DB_PATH}`)

const db   = new Database(DB_PATH)
const rows = db.prepare('SELECT id, password FROM accounts').all()
const upd  = db.prepare('UPDATE accounts SET password = ? WHERE id = ?')

let ok = 0, skip = 0, fail = 0

const run = db.transaction(() => {
  for (const row of rows) {
    const plain = decrypt(row.password, OLD_KEY)
    if (plain === null) {
      console.warn(`  [!] No se pudo descifrar cuenta ${row.id} — omitida`)
      fail++
      continue
    }
    if (!row.password.startsWith('enc:')) {
      console.log(`  [skip] cuenta ${row.id} ya estaba en texto plano`)
      skip++
      continue
    }
    upd.run(encrypt(plain, NEW_KEY), row.id)
    ok++
  }
})

run()
db.close()

console.log(`\n[migrate] Listo: ${ok} migradas, ${skip} omitidas, ${fail} fallidas`)
if (fail > 0) {
  console.error('[migrate] ATENCIÓN: algunas contraseñas no se migraron. No cambies la clave aún.')
  process.exit(1)
}
console.log('[migrate] Ahora actualiza ENCRYPTION_KEY en tu .env y reinicia los contenedores.\n')
