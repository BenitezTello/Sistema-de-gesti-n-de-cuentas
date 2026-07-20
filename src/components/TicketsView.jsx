import { useState, useEffect, useCallback } from 'react'
import { Ticket, RefreshCw, Send, RefreshCcwDot, MessageCircle, Copy, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const STATUS_CFG = {
  abierto:     { label: 'Abierto',     bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
  en_revision: { label: 'En revisión', bg: 'rgba(234,179,8,0.12)',  color: '#facc15' },
  resuelto:    { label: 'Resuelto',    bg: 'rgba(34,197,94,0.12)',  color: '#4ade80' },
}
const STATUS_OPTIONS = ['abierto', 'en_revision', 'resuelto']

async function apiFetch(path, method = 'GET', body) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/data${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) { localStorage.removeItem('token'); window.location.reload(); return }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error === 'SIN_STOCK' ? `Sin stock disponible en ${body.platform || 'esa plataforma'}` : body.error || `Error ${res.status}`)
  }
  return res.json()
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  try { return format(parseISO(dateStr.replace(' ', 'T')), "d MMM yyyy, HH:mm", { locale: es }) } catch { return dateStr }
}

export default function TicketsView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')
  const [drafts, setDrafts] = useState({})
  const [draftStatus, setDraftStatus] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [reassigningId, setReassigningId] = useState(null)
  const [reassignResults, setReassignResults] = useState({})
  const [notifiedId, setNotifiedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = filter ? `?status=${filter}` : ''
      setRows(await apiFetch(`/tickets${qs}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function updateTicket(id, patch) {
    setSavingId(id)
    setError(null)
    try {
      const result = await apiFetch(`/tickets/${id}`, 'PUT', patch)
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r
          const next = { ...r, ...patch }
          if (patch.status) next.resolved_at = patch.status === 'resuelto' ? new Date().toISOString() : ''
          return next
        })
      )
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setSavingId(null)
    }
  }

  // Guarda estado/respuesta Y avisa al cliente por correo de inmediato (Día 5) — TPS-1
  // le pega directo al portal (única excepción a "portal -> gateway -> TPS-1"), en vez
  // de esperar al job de polling de 15 min. Si el portal está caído justo en ese
  // momento, el job de todas formas lo recoge después, así que no se pierde el aviso.
  async function saveAndNotify(id, status, adminResponse) {
    const result = await updateTicket(id, { status, adminResponse, notify: true })
    setNotifiedId(result?.notified ? id : null)
    if (result?.notified) setTimeout(() => setNotifiedId((cur) => (cur === id ? null : cur)), 3000)
  }

  // Reasigna a otra cuenta/perfil de la misma plataforma (la cuenta vieja tenía
  // problemas). Busca el nuevo antes de tocar el viejo — ver server/db.js.
  async function reassignTicket(id) {
    setReassigningId(id)
    setError(null)
    setReassignResults((r) => ({ ...r, [id]: null }))
    try {
      const result = await apiFetch(`/tickets/${id}/reassign`, 'POST')
      setReassignResults((r) => ({ ...r, [id]: result }))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setReassigningId(null)
    }
  }

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = rows.filter((r) => r.status === s).length
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ticket size={17} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">Reportes de clientes — Portal Cliente</h2>
          </div>
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterPill active={filter === ''} onClick={() => setFilter('')}>
            Todos ({rows.length})
          </FilterPill>
          {STATUS_OPTIONS.map((s) => (
            <FilterPill key={s} active={filter === s} onClick={() => setFilter(s)}>
              {STATUS_CFG[s].label} {filter === '' ? `(${counts[s]})` : ''}
            </FilterPill>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-400">Cargando…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-slate-400">
            No hay reportes{filter ? ` en estado "${STATUS_CFG[filter]?.label}"` : ''}.
          </p>
        )}

        {rows.map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            draft={drafts[t.id] ?? t.admin_response ?? ''}
            draftStatus={draftStatus[t.id] ?? t.status}
            onDraftChange={(v) => setDrafts((d) => ({ ...d, [t.id]: v }))}
            onStatusDraftChange={(status) => setDraftStatus((d) => ({ ...d, [t.id]: status }))}
            onSaveAndNotify={() =>
              saveAndNotify(t.id, draftStatus[t.id] ?? t.status, drafts[t.id] ?? t.admin_response ?? '')
            }
            saving={savingId === t.id}
            notified={notifiedId === t.id}
            onReassign={() => reassignTicket(t.id)}
            reassigning={reassigningId === t.id}
            reassignResult={reassignResults[t.id]}
          />
        ))}
      </div>
    </div>
  )
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function whatsappLink(phone, ticket) {
  const digits = String(phone || '').replace(/\D/g, '')
  const msg = `Hola! Sobre tu reporte "${ticket.subject}" del pedido ${ticket.order_code}: `
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

function TicketRow({
  ticket, draft, draftStatus, onDraftChange, onStatusDraftChange, onSaveAndNotify,
  saving, notified, onReassign, reassigning, reassignResult,
}) {
  const cfg = STATUS_CFG[ticket.status] || STATUS_CFG.abierto
  const [copied, setCopied] = useState(false)

  function copyCreds() {
    if (!reassignResult) return
    const text = `Usuario: ${reassignResult.accountEmail}\nContraseña: ${reassignResult.accountPassword}\nPerfil: #${reassignResult.profileNumber}\nPIN: ${reassignResult.profilePin}\nVence: ${reassignResult.expiryDate}`
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{ticket.subject}</span>
            <span className="badge text-xs" style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {ticket.order_code} · {ticket.platform || 'plataforma no identificada'} · {ticket.client_name || 'cliente sin nombre'}
            {ticket.client_phone ? ` · ${ticket.client_phone}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Creado {fmt(ticket.created_at)}
            {ticket.resolved_at ? ` · Resuelto ${fmt(ticket.resolved_at)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ticket.client_phone && (
            <a
              href={whatsappLink(ticket.client_phone, ticket)}
              target="_blank"
              rel="noreferrer"
              className="btn-icon btn-icon-wa"
              title="Contactar por WhatsApp"
            >
              <MessageCircle size={15} />
            </a>
          )}
          <select
            value={draftStatus}
            onChange={(e) => onStatusDraftChange(e.target.value)}
            disabled={saving}
            className="form-select text-xs"
            title="Se guarda recién al hacer click en 'Guardar y notificar'"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_CFG[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ticket.description && <p className="mt-3 text-sm text-slate-300">{ticket.description}</p>}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Respuesta para el cliente…"
          rows={2}
          className="form-input flex-1 text-xs"
        />
        <button
          onClick={onSaveAndNotify}
          disabled={saving}
          className="btn-primary flex items-center gap-1.5 text-xs"
          title="Guarda el estado y la respuesta, y le manda un correo al cliente ahora mismo (con las credenciales nuevas si reasignaste la cuenta)"
        >
          <Send size={13} className={saving ? 'animate-pulse' : ''} /> {notified ? '¡Notificado!' : 'Guardar y notificar'}
        </button>
        <button
          onClick={onReassign}
          disabled={reassigning}
          className="btn-secondary flex items-center gap-1.5 text-xs"
          title="La cuenta actual tiene un problema — mover al cliente a otra de la misma plataforma"
        >
          <RefreshCcwDot size={13} className={reassigning ? 'animate-spin' : ''} /> Reasignar cuenta
        </button>
      </div>

      {reassignResult && !reassignResult.error && (
        <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Cuenta nueva asignada ({reassignResult.platform}) — cópiala y envíasela al cliente:</p>
            <button onClick={copyCreds} className="btn-icon" title="Copiar credenciales">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <p className="mt-1">Usuario: {reassignResult.accountEmail}</p>
          <p>Contraseña: {reassignResult.accountPassword}</p>
          <p>Perfil: #{reassignResult.profileNumber} · PIN: {reassignResult.profilePin}</p>
          <p>Vence: {reassignResult.expiryDate}</p>
        </div>
      )}
    </div>
  )
}
