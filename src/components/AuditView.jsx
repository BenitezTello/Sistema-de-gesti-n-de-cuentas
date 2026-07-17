import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, RefreshCw, ChevronLeft, ChevronRight, Trash2, AlertTriangle } from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

const ENTITY_LABELS = {
  account:  'Cuenta',
  profile:  'Perfil',
  supplier: 'Proveedor',
  client:   'Cliente',
  user:     'Usuario',
  ticket:   'Ticket',
}

const ACTION_STYLES = {
  CREATE: { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80',  label: 'Creó' },
  UPDATE: { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd',  label: 'Editó' },
  DELETE: { bg: 'rgba(239,68,68,0.12)',  color: '#f87171',  label: 'Eliminó' },
}

const ENTITY_OPTIONS = [
  { value: '',         label: 'Todas las entidades' },
  { value: 'account',  label: 'Cuentas' },
  { value: 'profile',  label: 'Perfiles' },
  { value: 'supplier', label: 'Proveedores' },
  { value: 'client',   label: 'Clientes' },
  { value: 'user',     label: 'Usuarios' },
  { value: 'ticket',   label: 'Tickets' },
]

async function fetchAudit(params) {
  const token = localStorage.getItem('token')
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/data/audit?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al cargar auditoría')
  return res.json()
}

function formatDate(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str.includes('T') ? str : str.replace(' ', 'T'))
    return format(d, "dd/MM/yyyy HH:mm", { locale: es })
  } catch {
    return str
  }
}

export default function AuditView() {
  const [data,    setData]    = useState({ rows: [], total: 0, pages: 1, page: 1 })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [filters, setFilters] = useState({
    user:   '',
    entity: '',
    from:   '',
    to:     '',
  })
  const [page, setPage] = useState(1)

  // ── Purga ──────────────────────────────────────────────────────────
  const [showPurge,   setShowPurge]   = useState(false)
  const [purgeDate,   setPurgeDate]   = useState(() => format(subMonths(new Date(), 3), 'yyyy-MM-dd'))
  const [purging,     setPurging]     = useState(false)
  const [purgeMsg,    setPurgeMsg]    = useState('')
  const [purgeConfirm,setPurgeConfirm]= useState(false)

  const doPurge = async () => {
    if (!purgeConfirm) { setPurgeConfirm(true); return }
    setPurging(true); setPurgeMsg('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/data/audit?before=${purgeDate}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setPurgeMsg(`✓ ${data.deleted} registro${data.deleted !== 1 ? 's' : ''} eliminado${data.deleted !== 1 ? 's' : ''}`)
        setPurgeConfirm(false)
        load(1)
      } else {
        setPurgeMsg(`Error: ${data.error}`)
      }
    } catch { setPurgeMsg('Error de red') }
    finally { setPurging(false) }
  }

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchAudit({ ...filters, page: p, limit: 50 })
      setData(result)
      setPage(p)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load(1) }, [load])

  function handleFilter(e) {
    e.preventDefault()
    load(1)
  }

  function clearFilters() {
    setFilters({ user: '', entity: '', from: '', to: '' })
  }

  const hasFilters = filters.user || filters.entity || filters.from || filters.to

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Auditoría</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.total} registro{data.total !== 1 ? 's' : ''} · página {data.page} de {data.pages}
          </p>
        </div>
        <button
          className="btn-icon"
          title="Recargar"
          onClick={() => load(page)}
          disabled={loading}
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Purga de registros */}
      <div className="glass-card p-4 space-y-3"
        style={{ borderColor: showPurge ? 'rgba(239,68,68,0.25)' : undefined }}>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium w-full text-left"
          style={{ color: showPurge ? '#f87171' : '#64748b' }}
          onClick={() => { setShowPurge(v => !v); setPurgeConfirm(false); setPurgeMsg('') }}
        >
          <Trash2 size={14}/>
          Limpiar registros antiguos
          <span className="ml-auto text-xs" style={{ color: '#334155' }}>{showPurge ? '▲' : '▼'}</span>
        </button>

        {showPurge && (
          <div className="space-y-3 pt-1 border-t border-white/[0.05]">
            <p className="text-xs text-slate-500">
              Elimina permanentemente todos los registros <strong className="text-slate-400">anteriores</strong> a la fecha seleccionada. Esta acción no se puede deshacer.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="form-label">Eliminar registros anteriores a</label>
                <input
                  type="date"
                  className="form-input"
                  value={purgeDate}
                  onChange={e => { setPurgeDate(e.target.value); setPurgeConfirm(false); setPurgeMsg('') }}
                />
              </div>
              <button
                type="button"
                onClick={doPurge}
                disabled={purging}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: purgeConfirm ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
                  color: '#f87171',
                  border: `1px solid ${purgeConfirm ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)'}`,
                  opacity: purging ? 0.6 : 1,
                }}
              >
                <AlertTriangle size={14}/>
                {purging ? 'Eliminando…' : purgeConfirm ? '¿Confirmar? Clic de nuevo' : 'Limpiar'}
              </button>
            </div>
            {purgeMsg && (
              <p className="text-sm font-medium" style={{ color: purgeMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>
                {purgeMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <form onSubmit={handleFilter}
        className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="form-label flex items-center gap-1">
            <Search size={12} /> Usuario
          </label>
          <input
            className="form-input"
            placeholder="Buscar usuario…"
            value={filters.user}
            onChange={e => setFilters(p => ({ ...p, user: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="form-label flex items-center gap-1">
            <Filter size={12} /> Entidad
          </label>
          <select
            className="form-select"
            value={filters.entity}
            onChange={e => setFilters(p => ({ ...p, entity: e.target.value }))}
          >
            {ENTITY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="form-label">Desde</label>
          <input
            className="form-input"
            type="date"
            value={filters.from}
            onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="form-label">Hasta</label>
          <input
            className="form-input"
            type="date"
            value={filters.to}
            onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn-primary">Filtrar</button>
          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Limpiar
            </button>
          )}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 px-1">{error}</div>
      )}

      {/* Tabla */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: '130px' }}>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Descripción</th>
                <th style={{ minWidth: '110px' }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-600 text-sm">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-600 text-sm">
                    No hay registros de auditoría
                  </td>
                </tr>
              )}
              {!loading && data.rows.map(row => {
                const act = ACTION_STYLES[row.action] || ACTION_STYLES.UPDATE
                const ent = ENTITY_LABELS[row.entity] || row.entity
                return (
                  <tr key={row.id}>
                    {/* Fecha */}
                    <td>
                      <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </span>
                    </td>

                    {/* Usuario */}
                    <td>
                      <span className="text-sm font-medium text-slate-200">{row.username}</span>
                    </td>

                    {/* Acción */}
                    <td>
                      <span className="badge" style={{ background: act.bg, color: act.color }}>
                        {row.action}
                      </span>
                    </td>

                    {/* Entidad */}
                    <td>
                      <span className="text-xs text-slate-400">{ent}</span>
                    </td>

                    {/* Descripción */}
                    <td>
                      <span className="text-sm text-slate-300">{row.description}</span>
                    </td>

                    {/* IP */}
                    <td>
                      <span className="text-xs text-slate-600 font-mono">{row.ip_address || '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="btn-icon"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            style={{ opacity: page <= 1 ? 0.3 : 1 }}
          >
            <ChevronLeft size={16} />
          </button>

          {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
            let p
            if (data.pages <= 7) {
              p = i + 1
            } else if (page <= 4) {
              p = i + 1
            } else if (page >= data.pages - 3) {
              p = data.pages - 6 + i
            } else {
              p = page - 3 + i
            }
            return (
              <button
                key={p}
                onClick={() => load(p)}
                className="btn-icon"
                style={{
                  minWidth: '32px',
                  background: p === page ? 'rgba(168,85,247,0.2)' : undefined,
                  color:      p === page ? '#d8b4fe' : undefined,
                  fontWeight: p === page ? 700 : undefined,
                }}
              >
                {p}
              </button>
            )
          })}

          <button
            className="btn-icon"
            disabled={page >= data.pages}
            onClick={() => load(page + 1)}
            style={{ opacity: page >= data.pages ? 0.3 : 1 }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
