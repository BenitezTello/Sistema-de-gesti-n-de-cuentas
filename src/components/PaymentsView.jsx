'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, DollarSign, RefreshCw,
  Filter, ChevronLeft, ChevronRight, Edit2, Save, X,
} from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'

const PLATFORMS = ['Netflix','Disney+','HBO Max','Prime Video','Crunchyroll','Movistar+']

const CATEGORY_LABEL = {
  sale:             'Venta',
  renewal:          'Renovación',
  account_purchase: 'Compra cuenta',
  account_renewal:  'Renovación cuenta',
}

const TYPE_CFG = {
  income:  { label: 'Ingreso',  bg: 'rgba(34,197,94,0.12)',  color: '#4ade80',  sign: '+' },
  expense: { label: 'Egreso',   bg: 'rgba(239,68,68,0.12)',  color: '#f87171',  sign: '-' },
}

const PLATFORM_CLASS = {
  'Netflix':     'plat-netflix',
  'Disney+':     'plat-disney',
  'HBO Max':     'plat-hbo',
  'Prime Video': 'plat-prime',
  'Crunchyroll': 'plat-crunchyroll',
  'Movistar+':   'plat-movistar',
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T'))
    return format(d, 'dd/MM/yy HH:mm', { locale: es })
  } catch { return dateStr }
}

function thisMonthRange() {
  const now  = new Date()
  const from = format(startOfMonth(now), 'yyyy-MM-dd')
  const to   = format(endOfMonth(now),   'yyyy-MM-dd')
  return { from, to }
}

async function apiFetch(path) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/data${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

// ── Price editor (admin only) ─────────────────────────────────────────
function PriceRow({ pp, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(pp.price))

  const commit = () => {
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) onSave(pp.platform, n)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${PLATFORM_CLASS[pp.platform] || ''}`}>
        {pp.platform}
      </span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">S/.</span>
          <input
            type="number" min="0" step="0.5"
            className="form-input !py-0.5 !px-2 text-xs w-20"
            value={val}
            onChange={e => setVal(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          />
          <button className="btn-icon" style={{ width:'1.6rem',height:'1.6rem' }} onClick={commit}>
            <Save size={11}/>
          </button>
          <button className="btn-icon btn-icon-danger" style={{ width:'1.6rem',height:'1.6rem' }} onClick={() => setEditing(false)}>
            <X size={11}/>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-200">S/. {pp.price.toFixed(2)}</span>
          <button className="btn-icon btn-icon-indigo" style={{ width:'1.6rem',height:'1.6rem' }} onClick={() => { setVal(String(pp.price)); setEditing(true) }}>
            <Edit2 size={11}/>
          </button>
        </div>
      )}
    </div>
  )
}

export default function PaymentsView() {
  const { platformPrices, updatePlatformPrice, currentUser } = useApp()
  const isAdmin = currentUser?.role === 'admin'

  const [summary, setSummary]   = useState(null)
  const [txData,  setTxData]    = useState({ rows: [], total: 0, pages: 1, page: 1 })
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState('')
  const [page,    setPage]      = useState(1)

  const [filters, setFilters] = useState(() => {
    const { from, to } = thisMonthRange()
    return { from, to, type: '', platform: '' }
  })

  const load = useCallback(async (p = 1) => {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ ...filters, page: p, limit: 50 }).toString()
      const sqr = new URLSearchParams({ from: filters.from, to: filters.to }).toString()
      const [tx, sum] = await Promise.all([
        apiFetch(`/transactions?${qs}`),
        apiFetch(`/summary?${sqr}`),
      ])
      setTxData(tx)
      setSummary(sum)
      setPage(p)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load(1) }, [load])

  const setMonth = (offset) => {
    const now = new Date()
    now.setMonth(now.getMonth() + offset)
    const from = format(startOfMonth(now), 'yyyy-MM-dd')
    const to   = format(endOfMonth(now),   'yyyy-MM-dd')
    setFilters(f => ({ ...f, from, to }))
  }

  const SummaryCard = ({ label, value, icon: Icon, color, sign }) => (
    <motion.div
      initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
      className="flex items-center gap-3 rounded-2xl p-4"
      style={{ background:'rgba(15,23,42,0.8)', border:`1px solid rgba(255,255,255,0.07)`, borderLeft:`3px solid ${color}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background:`${color}18`, color }}>
        <Icon size={20}/>
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color }}>
          {sign}{Number(value || 0).toFixed(2)}
        </p>
      </div>
    </motion.div>
  )

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── Header + controles mes ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Pagos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Ingresos y egresos registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-icon" onClick={() => setMonth(-1)} title="Mes anterior">
            <ChevronLeft size={16}/>
          </button>
          <span className="text-xs text-slate-400 font-medium min-w-[110px] text-center capitalize">
            {filters.from ? format(new Date(filters.from + 'T00:00:00'), 'MMMM yyyy', { locale: es }) : '—'}
          </span>
          <button className="btn-icon" onClick={() => setMonth(1)} title="Mes siguiente">
            <ChevronRight size={16}/>
          </button>
          <button className="btn-icon" onClick={() => load(page)} disabled={loading}
            style={{ opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* ── Tarjetas resumen ── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard label="Ingresos"     value={summary.income_total}  icon={TrendingUp}   color="#4ade80" sign="S/. "/>
          <SummaryCard label="Egresos"      value={summary.expense_total} icon={TrendingDown} color="#f87171" sign="S/. "/>
          <SummaryCard label="Ganancia neta" value={summary.net_profit}   icon={DollarSign}   color={summary.net_profit >= 0 ? '#a78bfa' : '#fb923c'} sign="S/. "/>
        </div>
      )}

      {/* ── Por plataforma ── */}
      {summary?.by_platform?.length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.15 }}
          className="glass-card">
          <h3 className="font-bold text-slate-200 mb-4 text-sm">Por plataforma</h3>
          <div className="space-y-2">
            {summary.by_platform.filter(p => p.income > 0 || p.expense > 0).map(p => (
              <div key={p.platform} className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${PLATFORM_CLASS[p.platform] || 'bg-slate-800 text-slate-300'}`}>
                  {p.platform || 'Sin plataforma'}
                </span>
                <span className="text-xs text-slate-500 flex-1 text-right">
                  +{p.income.toFixed(2)} / -{p.expense.toFixed(2)}
                </span>
                <span className="text-xs font-bold" style={{ color: p.profit >= 0 ? '#4ade80' : '#f87171', minWidth:'70px', textAlign:'right' }}>
                  = S/. {p.profit.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Precios por plataforma (solo admin) ── */}
      {isAdmin && platformPrices.length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
          className="glass-card">
          <h3 className="font-bold text-slate-200 mb-3 text-sm">Precios de venta por defecto</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {platformPrices.map(pp => (
              <PriceRow key={pp.platform} pp={pp} onSave={updatePlatformPrice}/>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 mt-2 px-3">
            Se usan como valor por defecto al registrar nuevas ventas.
          </p>
        </motion.div>
      )}

      {/* ── Filtros ── */}
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
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
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
        <button className="btn-primary" onClick={() => load(1)}>Filtrar</button>
      </div>

      {error && <div className="text-sm text-red-400 px-1">{error}</div>}

      {/* ── Tabla ── */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
          <span className="text-xs text-slate-500">
            {txData.total} transacción{txData.total !== 1 ? 'es' : ''} · pág. {txData.page} de {txData.pages}
          </span>
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
              {loading && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-sm">Cargando…</td></tr>
              )}
              {!loading && txData.rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-sm">Sin transacciones en este período</td></tr>
              )}
              {!loading && txData.rows.map(row => {
                const cfg = TYPE_CFG[row.type] || TYPE_CFG.income
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="text-xs font-mono text-slate-400 whitespace-nowrap">{fmt(row.created_at)}</span>
                    </td>
                    <td>
                      <span className="badge text-xs" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">{CATEGORY_LABEL[row.category] || row.category}</span>
                    </td>
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
                    <td>
                      <span className="text-xs text-slate-500">{row.username}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Paginación ── */}
      {txData.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-icon" disabled={page <= 1} onClick={() => load(page - 1)}
            style={{ opacity: page <= 1 ? 0.3 : 1 }}>
            <ChevronLeft size={16}/>
          </button>
          {Array.from({ length: Math.min(txData.pages, 7) }, (_, i) => {
            let p
            if (txData.pages <= 7) p = i + 1
            else if (page <= 4) p = i + 1
            else if (page >= txData.pages - 3) p = txData.pages - 6 + i
            else p = page - 3 + i
            return (
              <button key={p} onClick={() => load(p)} className="btn-icon"
                style={{
                  minWidth:'32px',
                  background: p === page ? 'rgba(168,85,247,0.2)' : undefined,
                  color:      p === page ? '#d8b4fe' : undefined,
                  fontWeight: p === page ? 700 : undefined,
                }}>
                {p}
              </button>
            )
          })}
          <button className="btn-icon" disabled={page >= txData.pages} onClick={() => load(page + 1)}
            style={{ opacity: page >= txData.pages ? 0.3 : 1 }}>
            <ChevronRight size={16}/>
          </button>
        </div>
      )}
    </div>
  )
}
