'use strict'
const express = require('express')
const router  = express.Router()
const db      = require('../db')

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// ── Validación de inputs ──────────────────────────────────────────────
const str  = (v, max = 200) => typeof v === 'string' ? v.slice(0, max).trim() : ''
const num  = (v, min = 0, max = 9999) => { const n = Number(v); return isNaN(n) ? min : Math.min(max, Math.max(min, Math.floor(n))) }
const date = (v) => str(v, 20) // acepta cualquier formato, solo limita longitud
const bool = (v) => v === true || v === 1 || v === '1'

const PLATFORMS = ['Netflix','Disney+','HBO Max','Prime Video','Crunchyroll','Movistar+','Otro']
const plat = (v) => PLATFORMS.includes(v) ? v : 'Otro'

// ── Accounts ─────────────────────────────────────────────────────────
router.get('/accounts', (req, res) => {
  res.json(db.getAllAccounts())
})

router.post('/accounts', (req, res) => {
  const b = req.body || {}
  const maxP    = num(b.maxProfiles, 1, 10)
  const accountId = id()
  const profiles  = Array.from({ length: maxP }, (_, i) => ({
    id: id(), accountId, number: i + 1, pin: '0000',
  }))
  const acc = db.createAccount({
    id: accountId,
    platform:    plat(b.platform),
    email:       str(b.email, 200),
    password:    str(b.password, 200),
    supplierId:  str(b.supplierId, 50),
    cost:        num(b.cost, 0, 99999),
    expiryDate:  date(b.expiryDate),
    maxProfiles: maxP,
    profiles,
  })
  res.json(acc)
})

router.put('/accounts/:id', (req, res) => {
  const b = req.body || {}
  const clean = {}
  if (b.platform    !== undefined) clean.platform    = plat(b.platform)
  if (b.email       !== undefined) clean.email       = str(b.email, 200)
  if (b.password    !== undefined) clean.password    = str(b.password, 200)
  if (b.supplierId  !== undefined) clean.supplierId  = str(b.supplierId, 50)
  if (b.cost        !== undefined) clean.cost        = num(b.cost, 0, 99999)
  if (b.expiryDate  !== undefined) clean.expiryDate  = date(b.expiryDate)
  if (b.maxProfiles !== undefined) clean.maxProfiles = num(b.maxProfiles, 1, 10)
  if (b.passwordChanged !== undefined) clean.passwordChanged = bool(b.passwordChanged)
  if (b.isFullAccount   !== undefined) clean.isFullAccount   = bool(b.isFullAccount)
  if (b.isDown          !== undefined) clean.isDown          = bool(b.isDown)
  if (b.access         !== undefined) clean.access          = str(b.access, 100)
  if (b.fullClient      !== undefined) clean.fullClient      = b.fullClient
  const acc = db.updateAccount(req.params.id, clean)
  res.json(acc || { error: 'not found' })
})

router.delete('/accounts/:id', (req, res) => {
  db.deleteAccount(req.params.id)
  res.json({ ok: true })
})

// ── Profiles ─────────────────────────────────────────────────────────
router.post('/accounts/:id/profiles', (req, res) => {
  const { number, pin } = req.body
  if (!number) return res.status(400).json({ error: 'Falta número de perfil' })
  const profileId = db.addProfile(req.params.id, number, pin)
  const acc = db.getAccountById(req.params.id)
  res.json(acc)
})

router.delete('/profiles/:id', (req, res) => {
  db.deleteProfile(req.params.id)
  res.json({ ok: true })
})

router.put('/profiles/:id', (req, res) => {
  const b = req.body || {}
  const clean = {}
  if (b.clientName !== undefined) clean.clientName = str(b.clientName, 100)
  if (b.phone      !== undefined) clean.phone      = str(b.phone, 30)
  if (b.pin        !== undefined) clean.pin        = str(b.pin, 10)
  if (b.status        !== undefined) clean.status        = ['available','active'].includes(b.status) ? b.status : 'available'
  if (b.needsPinChange !== undefined) clean.needsPinChange = b.needsPinChange ? 1 : 0
  if (b.expiryDate !== undefined) clean.expiryDate = date(b.expiryDate)
  db.updateProfile(req.params.id, clean)
  res.json({ ok: true })
})

// Actualizar cliente en todos sus perfiles (por teléfono)
router.post('/clients/update', (req, res) => {
  const { matchPhone, matchName, newName, newPhone } = req.body
  db.updateClientGlobal(matchPhone, matchName, newName, newPhone)
  res.json({ ok: true })
})

// Extender vencimiento de todos los perfiles de un cliente (combo)
router.post('/clients/extend', (req, res) => {
  const { matchPhone, matchName, newDateStr } = req.body
  db.extendClientAllProfiles(matchPhone, matchName, newDateStr)
  res.json({ ok: true })
})

// ── Saved Clients ──────────────────────────────────────────────────────
router.get('/clients', (req, res) => {
  res.json(db.getSavedClients())
})

router.post('/clients', (req, res) => {
  const b = req.body || {}
  const client = db.saveClient(str(b.name, 100), str(b.phone, 30))
  res.json(client || { error: 'Nombre requerido' })
})

router.delete('/clients/:id', (req, res) => {
  db.deleteClient(req.params.id)
  res.json({ ok: true })
})

// ── Suppliers ─────────────────────────────────────────────────────────
router.get('/suppliers', (req, res) => {
  res.json(db.getAllSuppliers())
})

router.post('/suppliers', (req, res) => {
  const b = req.body || {}
  const sup = db.createSupplier({ id: id(), name: str(b.name, 100), contact: str(b.contact, 50) })
  res.json(sup)
})

router.put('/suppliers/:id', (req, res) => {
  const b = req.body || {}
  db.updateSupplier(req.params.id, { name: str(b.name, 100), contact: str(b.contact, 50) })
  res.json({ ok: true })
})

router.delete('/suppliers/:id', (req, res) => {
  db.deleteSupplier(req.params.id)
  res.json({ ok: true })
})

module.exports = router
