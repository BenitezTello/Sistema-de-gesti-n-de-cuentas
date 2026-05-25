'use strict'
const bcrypt = require('bcryptjs')
const path   = require('path')

process.env.DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data')

const db = require('../db')

const [,, username, password] = process.argv

if (!username || !password) {
  console.error('Uso: node server/scripts/add-user.js <usuario> <contraseña>')
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 12)
const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

try {
  db.createUser(id, username, hash)
  console.log(`✅ Usuario "${username}" creado correctamente`)
} catch (err) {
  if (err.message.includes('UNIQUE')) {
    console.error(`❌ El usuario "${username}" ya existe`)
  } else {
    console.error('❌ Error:', err.message)
  }
  process.exit(1)
}
