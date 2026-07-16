'use strict'
// ═══════════════════════════════════════════════════════════════
//  Endpoints para el bot de WhatsApp — autenticados con X-Bot-Key
//  (no usan JWT porque el bot no tiene sesión de usuario)
// ═══════════════════════════════════════════════════════════════
const express = require('express')
const router  = express.Router()
const db      = require('../db')

// Un perfil está "listo para vender" si está disponible Y no requiere cambio de PIN
function perfilesListos(platform) {
  const accounts = db.getAllAccounts().filter(a => a.platform === platform && !a.isDown)
  let listos = 0, pendientesPin = 0
  for (const acc of accounts) {
    for (const p of acc.profiles) {
      if (p.status !== 'available') continue
      if (p.needsPinChange) pendientesPin++
      else listos++
    }
  }
  return { accounts, listos, pendientesPin }
}

// GET /api/bot/disponibilidad?platform=Netflix
router.get('/disponibilidad', (req, res) => {
  const platform = req.query.platform
  if (!platform) return res.status(400).json({ error: 'Falta platform' })

  const { listos, pendientesPin } = perfilesListos(platform)

  res.json({
    platform,
    disponible:    listos > 0,
    cantidad:      listos,
    pendientesPin, // perfiles que existen pero necesitan cambio de PIN antes de vender
    precio:        db.getPlatformPrice(platform),
  })
})

// POST /api/bot/asignar  { platform, clientName, phone }
// Busca el primer perfil LISTO (disponible y sin pendiente de cambio de PIN),
// lo asigna, registra la venta y devuelve credenciales.
router.post('/asignar', (req, res) => {
  const { platform, clientName, phone } = req.body || {}
  if (!platform || !clientName || !phone) return res.status(400).json({ error: 'Datos incompletos' })

  const { accounts, pendientesPin } = perfilesListos(platform)
  let match = null
  for (const acc of accounts) {
    const free = acc.profiles.find(p => p.status === 'available' && !p.needsPinChange)
    if (free) { match = { account: acc, profile: free }; break }
  }

  if (!match) {
    // No hay perfiles listos — si hay perfiles que solo necesitan cambio de PIN, avisar
    if (pendientesPin > 0) {
      return res.status(409).json({ error: 'needs_pin_change', cantidad: pendientesPin })
    }
    return res.status(404).json({ error: 'sin_disponibilidad' })
  }

  const { account, profile } = match
  const price = db.getPlatformPrice(platform)

  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + 1)
  const expiryDate = expiry.toISOString().slice(0, 10)

  db.updateProfile(profile.id, { status: 'active', clientName, phone, expiryDate })

  db.createTransaction({
    type: 'income', category: 'sale',
    platform, amount: price,
    clientName, clientPhone: phone,
    profileId: profile.id, accountId: account.id,
    userId: '', username: 'bot',
  })

  db.logAction('', 'bot', 'UPDATE', 'profile', profile.id,
    `Bot asignó perfil #${profile.number} de ${platform} a ${clientName} (${phone}) — venta automática S/.${price}`, '')

  res.json({
    ok: true,
    credentials: {
      platform,
      email:         account.email,
      password:      account.password,
      access:        account.access || '',
      profileNumber: profile.number,
      pin:           profile.pin,
      expiryDate,
      price,
    },
  })
})

module.exports = router
