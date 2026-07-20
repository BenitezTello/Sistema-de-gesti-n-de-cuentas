'use strict'
const express = require('express')
const router = express.Router()
const db = require('../db')

// Mismo whitelist de plataformas que ya usa server/routes/data.js.
const PLATFORMS = ['Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'Crunchyroll', 'Movistar+', 'Otro']

// GET /api/integration/stock?platform=Netflix — consumido por gateway /stock (ABT Portal Cliente).
router.get('/stock', (req, res) => {
  const platform = String(req.query.platform || '')
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'PLATAFORMA_INVALIDA' })
  res.json({
    available: db.countAvailableProfiles(platform),
    price: db.getPlatformPrice(platform),
  })
})

// POST /api/integration/assign-profile — consumido por gateway /orquestar-compra.
// Reserva el primer perfil disponible dentro de una transacción síncrona (db.assignProfileForPortal).
router.post('/assign-profile', (req, res) => {
  const { platform, orderCode, clientName, clientPhone } = req.body || {}
  if (!platform || !orderCode) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'PLATAFORMA_INVALIDA' })

  const result = db.assignProfileForPortal({ platform, orderCode, clientName, clientPhone })
  if (!result) return res.status(409).json({ error: 'SIN_STOCK' })
  res.status(200).json(result)
})

// POST /api/integration/tickets — consumido por gateway /tickets.
router.post('/tickets', (req, res) => {
  const { orderCode, subject, description, clientName, clientPhone } = req.body || {}
  if (!orderCode || !subject) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  const ticket = db.insertIntegrationTicket({ orderCode, subject, description, clientName, clientPhone })
  res.status(201).json({ ticketId: ticket.id })
})

// POST /api/integration/tickets/lookup — consumido por gateway /tickets/lookup.
router.post('/tickets/lookup', (req, res) => {
  const { orderCodes } = req.body || {}
  if (!Array.isArray(orderCodes)) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  res.json({ tickets: db.getIntegrationTicketsByOrderCodes(orderCodes) })
})

// GET /api/integration/order-status?orderCode=NV-XXXXX — consumido por gateway /order-status.
// Estado EN VIVO del perfil vigente de un pedido (refleja reasignaciones y ediciones
// hechas después de la compra, sin necesidad de que TPS-1 le avise nada al portal).
router.get('/order-status', (req, res) => {
  const orderCode = String(req.query.orderCode || '')
  if (!orderCode) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  const result = db.getOrderCurrentProfile(orderCode)
  if (!result) return res.status(404).json({ error: 'PEDIDO_NO_ENCONTRADO' })
  res.json(result)
})

// POST /api/integration/renew-profile — consumido por gateway /renovar-suscripcion (PLAN.md Día 5).
// A diferencia de assign-profile, no reasigna: extiende el vencimiento del MISMO
// perfil vigente del pedido. El portal ya cobró en Culqi antes de llamar esto.
router.post('/renew-profile', (req, res) => {
  const { orderCode } = req.body || {}
  if (!orderCode) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })

  const result = db.renewProfileForPortal(orderCode)
  if (!result) return res.status(404).json({ error: 'PEDIDO_NO_ENCONTRADO' })
  res.status(200).json(result)
})

// POST /api/integration/tickets/notifications — consumido por gateway /tickets/notifications
// (job de polling del portal, PLAN.md Día 5). Body: { orderCodes: [...] } — mismo shape
// que /tickets/lookup, con pending_credentials incluido cuando hubo una reasignación.
router.post('/tickets/notifications', (req, res) => {
  const { orderCodes } = req.body || {}
  if (!Array.isArray(orderCodes)) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  res.json({ tickets: db.getTicketNotificationsByOrderCodes(orderCodes) })
})

// POST /api/integration/tickets/ack-credentials — el portal confirma que ya mandó el
// correo con las credenciales nuevas de ese ticket; se borran para no reenviarlas.
router.post('/tickets/ack-credentials', (req, res) => {
  const { ticketId } = req.body || {}
  if (!ticketId) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' })
  db.ackTicketCredentials(ticketId)
  res.json({ ok: true })
})

// GET /api/integration/bi-summary — consumido por gateway /bi (Power BI, PLAN.md Día 5).
router.get('/bi-summary', (_req, res) => {
  res.json({
    monthly: db.getMonthlySummary(),
    financial: db.getFinancialSummary({}),
    tickets: db.getTicketsCountByStatus(),
  })
})

module.exports = router
