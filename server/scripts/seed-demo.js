'use strict'
/**
 * seed-demo.js  —  Datos históricos de demostración para ABT Streaming
 *
 * Basado en la operación REAL aproximada:
 *   ~50 cuentas Netflix  (S/35 c/u)
 *    ~8 cuentas Disney+  (S/14 c/u)
 *   ~10 cuentas HBO Max  (S/5 c/u)
 *   ~400 clientes activos distribuidos entre plataformas
 *
 * Corre:   node server/scripts/seed-demo.js
 * Borra:   node server/scripts/seed-demo.js --clean
 *          node server/scripts/clean-demo.js
 */

const Database = require('better-sqlite3')
const path     = require('path')

process.env.DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data')
const DB_PATH = path.join(process.env.DB_DIR, 'streammanager.db')
const db = new Database(DB_PATH)

// ── Borrado ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--clean')) {
  const r = db.prepare("DELETE FROM transactions WHERE notes = 'DEMO_DATA'").run()
  console.log(`🗑️  ${r.changes} transacciones demo eliminadas.`)
  db.close(); process.exit(0)
}

// ── Costos reales de tu operación ────────────────────────────────────────────
const PRECIO = { 'Netflix': 13.0, 'Disney+': 6.5, 'HBO Max': 6.0 }
const COSTO  = { 'Netflix': 35.0, 'Disney+': 14.0, 'HBO Max': 5.0 }

// Cuántas cuentas tenés (= cuántas renovaciones se generan por mes)
const CUENTAS = { 'Netflix': 50, 'Disney+': 8, 'HBO Max': 10 }

// ── Nombres ──────────────────────────────────────────────────────────────────
const NOMBRES = [
  'Carlos Mamani','Sandra Quispe','Luis Torres','Ana Flores','Pedro Ramos',
  'María García','Jorge Herrera','Rosa Mendoza','Diego Castro','Lucia Vega',
  'Andrés Paredes','Carmen Rojas','Fabio Soto','Elena Mora','Miguel Cano',
  'Valeria Ortiz','Renato Vargas','Patricia Lima','César Navarro','Gloria Díaz',
  'Oscar Fuentes','Claudia Reyes','Marcos Peña','Xiomara Lara','Hernán Paz',
  'Ricardo Solis','Fernanda Cruz','David Rios','Isabel Campos','Héctor Lima',
  'Natalia Torres','Gabriel Moreno','Paola Ruiz','Sebastián Vega','Adriana Paz',
  'Joaquín Soto','Daniela Reyes','Rodrigo Herrera','Camila Díaz','Felipe Castro',
  'Bruno Salas','Karla Espinoza','Nico Paredes','Gaby Morales','Tomás Ríos',
  'Luciana Fuentes','Emilio Vera','Sofía Castillo','Álvaro Meza','Pamela Loza',
]

const pick = arr => arr[Math.floor(Math.random() * arr.length)]
const uid  = () => Math.random().toString(36).slice(2,9) + Math.random().toString(36).slice(2,6)

function randDate(year, month, dayFrom, dayTo) {
  const day  = dayFrom + Math.floor(Math.random() * (Math.max(dayTo - dayFrom, 0) + 1))
  const hour = 8 + Math.floor(Math.random() * 10)
  const min  = Math.floor(Math.random() * 60)
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ` +
         `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
}

const INSERT = db.prepare(`
  INSERT INTO transactions
    (id, type, category, platform, amount, client_name, client_phone,
     profile_id, account_id, supplier_id, notes, user_id, username, created_at)
  VALUES
    (@id, @type, @category, @platform, @amount, @nombre, '',
     '', '', '', 'DEMO_DATA', 'seed', 'admin', @fecha)
`)

// ── Plan mensual de clientes ──────────────────────────────────────────────────
//
// Distribución basada en tus ~400 clientes actuales:
//   Netflix ~60% · HBO Max ~25% · Disney+ ~15%
//
// Con 50 cuentas Netflix × 5 perfiles = 250 slots → creciendo hasta 240 clientes
// Con 10 cuentas HBO Max × 5 perfiles = 50 slots  → con más perfiles disponibles
// Con  8 cuentas Disney+ × 5 perfiles = 40 slots  → ~60 clientes (cuentas en expansión)
//
// dayMax = último día del mes con datos (Mayo es parcial porque vamos en día 26)

const MESES = [
  // [año, mes, clientes{N,D,H}, dayMax]
  [2025, 12, { N: 145, D:  35, H:  65 }, 28],  // Dic 2025 — operación establecida
  [2026,  1, { N: 165, D:  40, H:  75 }, 28],  // Ene 2026
  [2026,  2, { N: 185, D:  48, H:  78 }, 28],  // Feb 2026
  [2026,  3, { N: 205, D:  55, H:  85 }, 28],  // Mar 2026
  [2026,  4, { N: 230, D:  60, H:  95 }, 28],  // Abr 2026 — pico
  [2026,  5, { N: 195, D:  50, H:  80 }, 25],  // May 2026 — parcial (hasta hoy)
]

const seed = db.transaction(() => {
  let total = 0

  for (const [year, month, clientes, dayMax] of MESES) {

    // ── EGRESOS: renovación mensual de cuentas al proveedor ──────────────────
    // Cada cuenta = 1 transacción (igual que en el flujo real de la app).
    // Las 50 cuentas Netflix no se renuevan todas el día 1; se van
    // escalonando los primeros 15 días según cuándo vencen.
    for (const [plat, qty] of Object.entries(CUENTAS)) {
      for (let i = 0; i < qty; i++) {
        INSERT.run({
          id: uid(), type: 'expense', category: 'account_purchase',
          platform: plat, amount: COSTO[plat], nombre: '',
          fecha: randDate(year, month, 1, 15),   // escalonadas en la quincena
        })
        total++
      }
    }

    // ── INGRESOS: cobros mensuales a clientes ────────────────────────────────
    for (const [plat, qty] of [['Netflix', clientes.N], ['Disney+', clientes.D], ['HBO Max', clientes.H]]) {
      for (let i = 0; i < qty; i++) {
        INSERT.run({
          id: uid(), type: 'income', category: 'subscription',
          platform: plat, amount: PRECIO[plat], nombre: pick(NOMBRES),
          fecha: randDate(year, month, 1, dayMax),
        })
        total++
      }
    }
  }
  return total
})

const n = seed()

// ── Resumen ───────────────────────────────────────────────────────────────────
const rows = db.prepare(`
  SELECT strftime('%Y-%m', created_at) as mes,
         COUNT(CASE WHEN type='income'  THEN 1 END) as cobros,
         COUNT(CASE WHEN type='expense' THEN 1 END) as compras,
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as ingresos,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as egresos
  FROM transactions WHERE notes='DEMO_DATA'
  GROUP BY mes ORDER BY mes
`).all()

const fw = (n, w=9) => `S/${n.toFixed(2)}`.padStart(w)

console.log(`\n✅  ${n} transacciones demo insertadas\n`)
console.log('  Mes       │ Clientes │ Renovac. │   Ingresos   │   Egresos    │     Neto')
console.log('  ──────────┼──────────┼──────────┼──────────────┼──────────────┼──────────────')
rows.forEach(r => {
  const neto = r.ingresos - r.egresos
  console.log(
    `  ${r.mes}  │    ${String(r.cobros).padStart(4)}  │    ${String(r.compras).padStart(4)}  │` +
    `  ${fw(r.ingresos,10)}  │  ${fw(r.egresos,10)}  │  ${fw(neto,10)}`
  )
})

const tot = rows.reduce((a,r)=>({ i:a.i+r.ingresos, e:a.e+r.egresos }), { i:0, e:0 })
console.log('  ──────────┴──────────┴──────────┴──────────────┴──────────────┴──────────────')
console.log(`  TOTAL 6 meses                          ${fw(tot.i,10)}    ${fw(tot.e,10)}    ${fw(tot.i-tot.e,10)}`)
console.log('\n  Para eliminar: node server/scripts/clean-demo.js\n')
db.close()
