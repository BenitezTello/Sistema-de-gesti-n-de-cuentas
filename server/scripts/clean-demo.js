'use strict'
const Database = require('better-sqlite3')
const path     = require('path')

process.env.DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data')
const DB_PATH = path.join(process.env.DB_DIR, 'streammanager.db')

const db     = new Database(DB_PATH)
const result = db.prepare("DELETE FROM transactions WHERE notes = 'DEMO_DATA'").run()
console.log(`🗑️  ${result.changes} transacciones demo eliminadas.`)
db.close()
