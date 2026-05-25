'use strict'
const express   = require('express')
const jwt       = require('jsonwebtoken')
const bcrypt    = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const db        = require('./db')

const router = express.Router()
const SECRET = process.env.JWT_SECRET || 'cambiar-en-produccion'

// ── Rate limiting: max 5 intentos cada 15 minutos por IP ─────────────
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  message:         { error: 'Demasiados intentos fallidos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
})

// ── Login ─────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' })

  const user = db.getUserByUsername(username)
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
  if (user.is_active === 0) return res.status(401).json({ error: 'Usuario desactivado' })

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

  const role        = user.role        || 'admin'
  const permissions = JSON.parse(user.permissions || '["all"]')

  const token = jwt.sign(
    { id: user.id, username: user.username, role, permissions },
    SECRET,
    { expiresIn: '24h' }
  )
  res.json({ token, username: user.username, role, permissions })
})

// ── Verify ────────────────────────────────────────────────────────────
router.get('/verify', authMiddleware, (req, res) => {
  res.json({
    ok:          true,
    username:    req.user.username,
    role:        req.user.role        || 'admin',
    permissions: req.user.permissions || ['all'],
  })
})

// ── SSE Token (vida corta: 5 min, solo para EventSource) ─────────────
router.get('/sse-token', authMiddleware, (req, res) => {
  const sseToken = jwt.sign(
    { id: req.user.id, username: req.user.username, role: req.user.role, permissions: req.user.permissions, aud: 'sse' },
    SECRET,
    { expiresIn: '5m' }
  )
  res.json({ token: sseToken })
})

// ── Logout ────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // El cliente elimina el token del localStorage — stateless logout
  res.json({ ok: true })
})

// ── Middleware de autenticación ───────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  const token  = (header ? header.replace('Bearer ', '') : null) || req.query.token
  if (!token) return res.status(401).json({ error: 'No autorizado' })
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Sesión expirada, inicia sesión de nuevo' })
  }
}

// ── Middleware de admin ────────────────────────────────────────────────
function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' })
  next()
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12)
}

module.exports = { router, authMiddleware, adminMiddleware, hashPassword }
