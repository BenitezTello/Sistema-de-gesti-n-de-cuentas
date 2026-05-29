import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Download, RefreshCw, Filter,
  TrendingUp, Users,
} from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { downloadXLSX } from '../utils/excel'

const PLATFORMS = ['Netflix','Disney+','HBO Max','Prime Video','Crunchyroll','Movistar+']

const CATEGORY_LABEL = {
  sale:             'Venta',
  renewal:          'Renovación',
  account_purchase: 'Compra cuenta',
  account_renewal:  'Renovación cuenta',
}

const TYPE_CFG = {
  income:  { label: 'Ingreso', bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', sign: '+' },
  expense: { label: 'Egreso',  bg: 'rgba(239,68,68,0.12)',  color: '#f87171', sign: '-' },
}

const STATUS_CFG = {
  active:  { label: 'Activo',    bg: 'rgba(34,197,94,0.12)',  color: '#4ade80' },
  today:   { label: 'Vence hoy', bg: 'rgba(234,179,8,0.12)',  color: '#facc15' },
  soon:    { label: 'Pronto',    bg: 'rgba(249,115,22,0.12)', color: '#fb923c' },
  expired: { label: 'Vencido',   bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
}

const PLATFORM_CLASS = {
  'Netflix':     'plat-netflix',
  'Disney+':     'plat-disney',
  'HBO Max':     'plat-hbo',
  'Prime Video': 'plat-prime',
  'Crunchyroll': 'plat-crunchyroll',
  'Movistar+':   'plat-movistar',
}

function thisMonthRange() {
  const now = new Date()
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to:   format(endOfMonth(now),   'yyyy-MM-dd'),
  }
}

async function apiFetch(path) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/data${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

function fmtDate(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str.includes('T') ? str : str.replace(' ', 'T'))
    return format(d, 'dd/MM/yy HH:mm', { locale: es })
  } catch { return str }
}

function ExportBtn({ rows, onClick }) {
  const hasRows = rows !== null && rows.length > 0
  return (
    <button
      onClick={onClick}
      disabled={!hasRows}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
      style={{
        background: hasRows ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.08)',
        color:      hasRows ? '#4ade80'               : '#475569',
        border:     `1px solid ${hasRows ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.15)'}`,
        cursor:     hasRows ? 'pointer' : 'default',
      }}
    >
      <Download size={14}/> Exportar Excel
    </button>
  )
}

// ── Gráfico donut SVG ─────────────────────────────────────────────────
function DonutChart({ segments, size = 100 }) {
  const r = 34, cx = 50, cy = 50
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (!total) return null
  let cum = 0
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={13}/>
      {segments.map((seg, i) => {
        const len = (seg.value / total) * circ
        const off = cum
        cum += len
        if (len < 0.5) return null
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={13}
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={-off}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        )
      })}
    </svg>
  )
}

// ── Barras horizontales ───────────────────────────────────────────────
function HBars({ items }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-2.5">
      {items.map(({ label, value, color, display }, i) => (
        <div key={i}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-300 truncate" style={{ maxWidth: '55%' }}>{label}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color }}>{display ?? value}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((value / max) * 100, 2)}%`, background: color }}/>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Transactions Tab ──────────────────────────────────────────────────
function TransactionsReport({ allowedPlatforms }) {
  const { from, to } = thisMonthRange()
  const [filters, setFilters] = useState({ from, to, type: '', platform: '' })
  const [rows,    setRows]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs   = new URLSearchParams(filters).toString()
      const data = await apiFetch(`/reports/transactions?${qs}`)
      setRows(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters])

  const exportXLSX = () => {
    if (!rows?.length) return
    const headers = ['Fecha','Tipo','Categoría','Plataforma','Monto (S/.)','Cliente','Teléfono','Registrado por']
    const data    = rows.map(r => [
      fmtDate(r.created_at),
      TYPE_CFG[r.type]?.label || r.type,
      CATEGORY_LABEL[r.category] || r.category,
      r.platform    || '',
      Number(r.amount),
      r.client_name || '',
      r.client_phone || '',
      r.username,
    ])
    downloadXLSX([headers, ...data], 'Transacciones', `transacciones_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const platforms    = allowedPlatforms === 'all' ? PLATFORMS : allowedPlatforms
  const incomeTotal  = (rows || []).filter(r => r.type === 'income' ).reduce((s, r) => s + r.amount, 0)
  const expenseTotal = (rows || []).filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const netTotal     = incomeTotal - expenseTotal

  // Agrupar por plataforma para gráfico de barras
  const byPlat = {}
  ;(rows || []).forEach(r => {
    if (!r.platform) return
    if (!byPlat[r.platform]) byPlat[r.platform] = { income: 0, expense: 0 }
    if (r.type === 'income')  byPlat[r.platform].income  += r.amount
    else                      byPlat[r.platform].expense += r.amount
  })
  const platBars = Object.entries(byPlat)
    .sort((a, b) => b[1].income - a[1].income)
    .map(([plat, d]) => ({
      label:   plat,
      value:   d.income,
      color:   '#4ade80',
      display: `+S/.${d.income.toFixed(2)}`,
    }))

  const showCharts = rows !== null && rows.length > 0 && (incomeTotal > 0 || expenseTotal > 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="form-label flex items-center gap-1"><Filter size={12}/> Tipo</label>
          <select className="form-select" value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Egresos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Plataforma</label>
          <select className="form-select" value={filters.platform}
            onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}>
            <option value="">Todas</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Desde</label>
          <input type="date" className="form-input" value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}/>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Hasta</label>
          <input type="date" className="form-input" value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}/>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Cargar
        </button>
        {rows !== null && <ExportBtn rows={rows} onClick={exportXLSX}/>}
      </div>

      {error && <div className="text-sm text-red-400 px-1">{error}</div>}

      {/* ── Gráficos ── */}
      {showCharts && (
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Donut: composición ingreso/egreso */}
          <div className="glass-card">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
              Composición del período
            </p>
            <div className="flex items-center gap-5">
              <DonutChart segments={[
                { value: incomeTotal,  color: '#4ade80' },
                { value: expenseTotal, color: '#f87171' },
              ]} size={100} />
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#4ade80' }}/>
                    <span className="text-xs text-slate-400">Ingresos</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">S/. {incomeTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#f87171' }}/>
                    <span className="text-xs text-slate-400">Egresos</span>
                  </div>
                  <span className="text-xs font-bold text-red-400">S/. {expenseTotal.toFixed(2)}</span>
                </div>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.06)' }}/>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Neto</span>
                  <span className="text-sm font-bold" style={{ color: netTotal >= 0 ? '#a78bfa' : '#fb923c' }}>
                    {netTotal >= 0 ? '+' : ''}S/. {netTotal.toFixed(2)}
                  </span>
                </div>
                {incomeTotal > 0 && (
                  <p className="text-[10px] text-slate-600">
                    Margen: {Math.round((netTotal / incomeTotal) * 100)}%
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Barras: ingresos por plataforma */}
          {platBars.length > 0 && (
            <div className="glass-card">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                Ingresos por plataforma
              </p>
              <HBars items={platBars} />
            </div>
          )}
        </motion.div>
      )}

      {/* ── Tabla ── */}
      {rows !== null && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
          className="glass-card p-0 overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-white/[0.05]">
            <span className="text-xs text-slate-500">
              {rows.length} transacción{rows.length !== 1 ? 'es' : ''}
              {rows.length > 100 && ' · mostrando primeras 100'}
            </span>
            {rows.length > 0 && (
              <span className="text-xs text-slate-600 flex items-center gap-3">
                <span>Ingresos: <strong className="text-green-400">S/. {incomeTotal.toFixed(2)}</strong></span>
                <span>Egresos: <strong className="text-red-400">S/. {expenseTotal.toFixed(2)}</strong></span>
                <span>Neto: <strong style={{ color: netTotal >= 0 ? '#a78bfa' : '#fb923c' }}>
                  S/. {netTotal.toFixed(2)}
                </strong></span>
              </span>
            )}
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth:'110px' }}>Fecha</th>
                  <th>Tipo</th>
                  <th>Categoría</th>
                  <th>Plataforma</th>
                  <th style={{ minWidth:'90px' }}>Monto</th>
                  <th>Cliente / Notas</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-sm">
                    Sin resultados para los filtros aplicados
                  </td></tr>
                )}
                {rows.slice(0, 100).map(row => {
                  const cfg = TYPE_CFG[row.type] || TYPE_CFG.income
                  return (
                    <tr key={row.id}>
                      <td><span className="text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(row.created_at)}</span></td>
                      <td><span className="badge text-xs" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span></td>
                      <td><span className="text-xs text-slate-400">{CATEGORY_LABEL[row.category] || row.category}</span></td>
                      <td>
                        {row.platform
                          ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${PLATFORM_CLASS[row.platform] || 'bg-slate-800 text-slate-400'}`}>{row.platform}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td>
                        <span className="text-sm font-bold" style={{ color: cfg.color }}>
                          {cfg.sign} S/. {Number(row.amount).toFixed(2)}
                        </span>
                      </td>
                      <td>
                        {row.client_name
                          ? <span className="text-sm text-slate-300">{row.client_name}</span>
                          : row.notes
                          ? <span className="text-xs text-slate-500 italic">{row.notes}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td><span className="text-xs text-slate-500">{row.username}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Subscriptions Tab ─────────────────────────────────────────────────
function SubscriptionsReport({ allowedPlatforms }) {
  const [filters, setFilters] = useState({ status: '', platform: '' })
  const [rows,    setRows]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs   = new URLSearchParams(filters).toString()
      const data = await apiFetch(`/reports/subscriptions?${qs}`)
      setRows(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters])

  const exportXLSX = () => {
    if (!rows?.length) return
    const headers = ['Cliente','Teléfono','Plataforma','Perfil','Vencimiento','Estado','Días restantes']
    const data    = rows.map(r => [
      r.client_name,
      r.phone || '',
      r.platform,
      `Perfil ${r.number}`,
      r.expiry_date || '',
      STATUS_CFG[r.status]?.label || r.status,
      r.days_remaining !== null ? Number(r.days_remaining) : '',
    ])
    downloadXLSX([headers, ...data], 'Suscripciones', `suscripciones_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const platforms = allowedPlatforms === 'all' ? PLATFORMS : allowedPlatforms

  // Datos para gráficos
  const statusCount = { active: 0, today: 0, soon: 0, expired: 0 }
  const platCount   = {}
  ;(rows || []).forEach(r => {
    if (statusCount[r.status] !== undefined) statusCount[r.status]++
    platCount[r.platform] = (platCount[r.platform] || 0) + 1
  })

  const statusSegments = [
    { value: statusCount.active,  color: '#4ade80', label: 'Activos'   },
    { value: statusCount.soon,    color: '#fb923c', label: 'Pronto'    },
    { value: statusCount.today,   color: '#facc15', label: 'Vence hoy' },
    { value: statusCount.expired, color: '#f87171', label: 'Vencidos'  },
  ].filter(s => s.value > 0)

  const platBars = Object.entries(platCount)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: '#60a5fa', display: `${value} cliente${value !== 1 ? 's' : ''}` }))

  const showCharts = rows !== null && rows.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="form-label flex items-center gap-1"><Filter size={12}/> Estado</label>
          <select className="form-select" value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="today">Vence hoy</option>
            <option value="soon">Pronto (≤ 2 días)</option>
            <option value="expired">Vencidos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Plataforma</label>
          <select className="form-select" value={filters.platform}
            onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}>
            <option value="">Todas</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Cargar
        </button>
        {rows !== null && <ExportBtn rows={rows} onClick={exportXLSX}/>}
      </div>

      {error && <div className="text-sm text-red-400 px-1">{error}</div>}

      {/* ── Gráficos ── */}
      {showCharts && (
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Donut: estado de suscripciones */}
          <div className="glass-card">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
              Estado de suscripciones
            </p>
            <div className="flex items-center gap-5">
              <DonutChart segments={statusSegments} size={100} />
              <div className="flex-1 space-y-2">
                {statusSegments.map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }}/>
                      <span className="text-xs text-slate-400">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: s.color }}>{s.value}</span>
                      <span className="text-[10px] text-slate-600">
                        ({Math.round((s.value / rows.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{ height:'1px', background:'rgba(255,255,255,0.06)', margin:'4px 0' }}/>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Total</span>
                  <span className="text-xs font-bold text-slate-300">{rows.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barras: clientes por plataforma */}
          {platBars.length > 0 && (
            <div className="glass-card">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                Clientes por plataforma
              </p>
              <HBars items={platBars} />
            </div>
          )}
        </motion.div>
      )}

      {/* ── Tabla ── */}
      {rows !== null && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
          className="glass-card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <span className="text-xs text-slate-500">
              {rows.length} suscripción{rows.length !== 1 ? 'es' : ''}
              {rows.length > 100 && ' · mostrando primeras 100'}
            </span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Plataforma</th>
                  <th>Perfil</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th style={{ minWidth:'55px' }}>Días</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-sm">
                    Sin resultados para los filtros aplicados
                  </td></tr>
                )}
                {rows.slice(0, 100).map(row => {
                  const cfg = STATUS_CFG[row.status] || STATUS_CFG.active
                  return (
                    <tr key={row.id}>
                      <td><span className="text-sm font-medium text-slate-200">{row.client_name}</span></td>
                      <td><span className="text-xs text-slate-400 font-mono">{row.phone || '—'}</span></td>
                      <td>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${PLATFORM_CLASS[row.platform] || 'bg-slate-800 text-slate-400'}`}>
                          {row.platform}
                        </span>
                      </td>
                      <td><span className="text-xs text-slate-400">Perfil {row.number}</span></td>
                      <td><span className="text-xs font-mono text-slate-300">{row.expiry_date || '—'}</span></td>
                      <td>
                        <span className="badge text-xs" style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm font-bold" style={{ color: cfg.color }}>
                          {row.days_remaining !== null ? row.days_remaining : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function ReportsView() {
  const { currentUser } = useApp()
  const [tab, setTab] = useState('transactions')

  const isAdmin = currentUser?.role === 'admin'
  const perms   = currentUser?.permissions || []
  const allowedPlatforms = isAdmin || perms.includes('all') ? 'all' : perms

  const TAB_STYLE = (active) => ({
    background: active ? 'rgba(168,85,247,0.2)' : 'transparent',
    color:      active ? '#d8b4fe'               : '#64748b',
  })

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h2 className="text-lg font-bold text-slate-100">Reportes</h2>
        <p className="text-xs text-slate-500 mt-0.5">Análisis de datos y exportación por período</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={TAB_STYLE(tab === 'transactions')}
          onClick={() => setTab('transactions')}
        >
          <TrendingUp size={15}/> Transacciones
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={TAB_STYLE(tab === 'subscriptions')}
          onClick={() => setTab('subscriptions')}
        >
          <Users size={15}/> Suscripciones
        </button>
      </div>

      {tab === 'transactions' && <TransactionsReport allowedPlatforms={allowedPlatforms}/>}
      {tab === 'subscriptions' && <SubscriptionsReport allowedPlatforms={allowedPlatforms}/>}
    </div>
  )
}
