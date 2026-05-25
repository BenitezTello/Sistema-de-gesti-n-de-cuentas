/* WhatsApp utilities — el envío se maneja directamente en WhatsAppView con wa.me links */

export function buildWALink(phone, message) {
  const clean = phone?.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

export function openBulkWhatsApp(subscriptions, getTemplate) {
  const withPhone = subscriptions.filter(s => s.phone?.replace(/\D/g, ''))
  withPhone.forEach((sub, i) => {
    const msg = getTemplate(sub)
    const link = buildWALink(sub.phone, msg)
    if (link) setTimeout(() => window.open(link, '_blank'), i * 800)
  })
}
