import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Bell, Clock, CheckCircle,
  MessageSquare, Send, Download, Loader2, CheckCheck,
  MonitorPlay, Tv, Users, Truck, Wifi, WifiOff, TrendingUp, TrendingDown, DollarSign, Package,
  Target, BarChart2, Percent, CalendarClock,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { differenceInCalendarDays, format, startOfMonth, endOfMonth, parseISO, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import Pagination from './Pagination'

const PLATFORM_CLASS = {
  'Netflix':     'plat-netflix',
  'Disney+':     'plat-disney',
  'HBO Max':     'plat-hbo',
  'Prime Video': 'plat-prime',
  'Crunchyroll': 'plat-crunchyroll',
  'Movistar+':   'plat-movistar',
}

const STATUS_CFG = {
  expired:   { label: 'Vencido',    badge: 'badge-expired',   text: 'text-red-400'    },
  today:     { label: 'Vence hoy',  badge: 'badge-today',     text: 'text-amber-400'  },
  soon:      { label: 'Próximo',    badge: 'badge-soon',      text: 'text-yellow-400' },
  active:    { label: 'Activo',     badge: 'badge-active',    text: 'text-emerald-400'},
  available: { label: 'Disponible', badge: 'badge-available', text: 'text-indigo-400' },
}

const TABS = [
  { id: 'all',     label: 'Todos'      },
  { id: 'expired', label: 'Vencidos'   },
  { id: 'today',   label: 'Vence Hoy'  },
  { id: 'soon',    label: 'Próximos'   },
  { id: 'active',  label: 'Activos'    },
]

const PER_PAGE = 25

function daysText(dateStr) {
  const d = differenceInCalendarDays(new Date(dateStr), new Date())
  if (d < 0)  return `Hace ${Math.abs(d)}d`
  if (d === 0) return 'Hoy'
  return `en ${d}d`
}

function relativeDateText(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const expiry = new Date(y, m - 1, d)
  const today  = new Date(); today.setHours(0,0,0,0)
  const diff   = Math.round((expiry - today) / 86400000)
  if (diff ===  0) return 'hoy'
  if (diff ===  1) return 'mañana'
  if (diff ===  2) return 'pasado mañana'
  if (diff === -1) return 'ayer'
  if (diff  <  0)  return `hace ${Math.abs(diff)} días`
  return `en ${diff} días`
}

function buildMsg(sub) {
  const fechaRel = relativeDateText(sub.expiryDate)
  const estado = sub.status === 'expired'
    ? `venció *${fechaRel}*`
    : `vence *${fechaRel}*`
  return (
    `Hola *${sub.clientName}*! 👋\n\n` +
    `Tu suscripción de *${sub.platform}* ${estado}.\n\n` +
    `📧 Correo: ${sub.email}\n` +
    `🔑 Contraseña: ${sub.password}\n` +
    `👤 Perfil ${sub.number} · PIN: *${sub.pin}*\n\n` +
    `Para renovar escríbenos. 🙏`
  )
}

async function fetchJson(path) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/data${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(res.status)
  return res.json()
}

export default function Dashboard({ onNavigate }) {
  const { accounts, savedClients, getSubscriptionStatus, copyToClipboard, exportToXLSX, showToast, loadFinancialSummary, currentUser, platformPrices, getPlatformPrice, getPlatformRenewalPrice, getPlatformResellerPrice, getComboPriceByPlatforms } = useApp()

  const isClientReseller = (phone) => {
    const norm = (phone || '').replace(/\D/g,'')
    return norm ? (savedClients || []).some(c => c.id === norm && c.is_reseller === 1) : false
  }
  const isAdmin = currentUser?.role === 'admin'
  const [filter,        setFilter]        = useState('all')
  const [page,          setPage]          = useState(1)
  const [sending,       setSending]       = useState(new Set())
  const [sent,          setSent]          = useState(new Set())
  const [summary,       setSummary]       = useState(null)
  const [monthlyData,   setMonthlyData]   = useState([])

  useEffect(() => {
    if (!isAdmin) return
    const now  = new Date()
    const from = format(startOfMonth(now), 'yyyy-MM-dd')
    const to   = format(endOfMonth(now),   'yyyy-MM-dd')
    loadFinancialSummary(from, to).then(s => { if (s) setSummary(s) })
    fetchJson('/monthly-summary?months=6').then(d => setMonthlyData(d)).catch(() => {})
  }, [loadFinancialSummary, isAdmin])

  // ── Métricas de suscripciones ────────────────────────────────────────
  const allSubs = [
    ...accounts.flatMap(acc =>
      acc.profiles.filter(p => p.clientName).map(p => ({
        ...p, platform: acc.platform, email: acc.email, password: acc.password,
        accountId: acc.id, status: getSubscriptionStatus(p.expiryDate),
      }))
    ),
    ...accounts
      .filter(acc => acc.isFullAccount && acc.fullClient?.clientName)
      .map(acc => ({
        id: `full-${acc.id}`, clientName: acc.fullClient.clientName,
        phone: acc.fullClient.phone || '', expiryDate: acc.fullClient.expiryDate || '',
        platform: acc.platform, email: acc.email, password: acc.password, accountId: acc.id,
        status: getSubscriptionStatus(acc.fullClient.expiryDate),
      })),
  ].sort((a, b) => {
    const order = { expired: 0, today: 1, soon: 2, active: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  const counts = {
    expired: allSubs.filter(s => s.status === 'expired').length,
    today:   allSubs.filter(s => s.status === 'today').length,
    soon:    allSubs.filter(s => s.status === 'soon').length,
    active:  allSubs.filter(s => s.status === 'active').length,
  }

  // ── Métricas de cuentas ───────────────────────────────────────────────
  const totalAccounts  = accounts.length
  const downAccounts   = accounts.filter(a => a.isDown).length
  const freeSlots = accounts.reduce((n, a) => {
    if (a.isDown || a.isFullAccount) return n
    return n + a.profiles.filter(p => !p.clientName).length
  }, 0)
  const platforms = [...new Set(accounts.map(a => a.platform))].length

  // Libres por plataforma
  const freeByPlat = {}
  accounts.forEach(a => {
    if (a.isDown || a.isFullAccount) return
    const free = a.profiles.filter(p => !p.clientName).length
    if (free > 0) freeByPlat[a.platform] = (freeByPlat[a.platform] || 0) + free
  })

  const filtered  = filter === 'all' ? allSubs : allSubs.filter(s => s.status === filter)
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)

  const handleFilterChange = (f) => { setFilter(f); setPage(1) }

  // ── Envío WA directo ─────────────────────────────────────────────────
  const sendWA = useCallback(async (sub) => {
    const phone = sub.phone?.replace(/\D/g, '')
    if (!phone) { showToast('Sin número de teléfono', 'warning'); return }
    setSending(prev => new Set([...prev, sub.id]))
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/wa/send-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ messages: [{ phone, text: buildMsg(sub) }] }),
      })
      if (res.ok) {
        setSent(prev => new Set([...prev, sub.id]))
        showToast(`Enviado a ${sub.clientName} ✓`, 'success')
        setTimeout(() => setSent(prev => { const n = new Set(prev); n.delete(sub.id); return n }), 4000)
      } else {
        showToast('WhatsApp no conectado', 'error')
      }
    } catch { showToast('Error al enviar', 'error') }
    finally { setSending(prev => { const n = new Set(prev); n.delete(sub.id); return n }) }
  }, [showToast])

  // ── Navegación móvil ─────────────────────────────────────────────────
  const mobileNav = [
    {
      id: 'accounts', icon: MonitorPlay, label: 'Ventas',
      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',
      stat: `${freeSlots} libre${freeSlots !== 1 ? 's' : ''}`,
    },
    {
      id: 'accounts-list', icon: Tv, label: 'Cuentas',
      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',
      stat: `${totalAccounts} cuentas`,
    },
    {
      id: 'clients', icon: Users, label: 'Clientes',
      color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',
      stat: `${allSubs.length} perfiles asignados`,
    },
    {
      id: 'whatsapp', icon: MessageSquare, label: 'Cobros WA',
      color: '#34d399', bg: 'rgba(52,211,153,0.12)',
      stat: counts.expired + counts.today > 0 ? `${counts.expired + counts.today} urgentes` : 'Al día ✓',
    },
    {
      id: 'suppliers', icon: Truck, label: 'Proveedores',
      color: '#fb923c', bg: 'rgba(251,146,60,0.12)',
      stat: `${platforms} plataforma${platforms !== 1 ? 's' : ''}`,
    },
    {
      id: 'accounts', icon: downAccounts > 0 ? WifiOff : Wifi, label: downAccounts > 0 ? 'Cuentas caídas' : 'Sin caídas',
      color: downAccounts > 0 ? '#f87171' : '#4ade80',
      bg: downAccounts > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.10)',
      stat: downAccounts > 0 ? `${downAccounts} caída${downAccounts !== 1 ? 's' : ''}` : 'Todo estable',
    },
  ]

  return (
    <div className="space-y-5 pb-10">

      {/* ── Stats urgentes (siempre visibles) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { type:'expired', icon: AlertTriangle, label:'Vencidos',      count: counts.expired, nav:'whatsapp', color:'#ef4444' },
          { type:'today',   icon: Bell,          label:'Vencen hoy',    count: counts.today,   nav:'whatsapp', color:'#f59e0b' },
          { type:'soon',    icon: Clock,         label:'Próximos (2d)', count: counts.soon,    nav:'whatsapp', color:'#eab308' },
          { type:'active',  icon: CheckCircle,   label:'Al día',           count: counts.active,  nav:'accounts', color:'#10b981' },
        ].map(({ type, icon: Icon, label, count, nav, color }, i) => (
          <motion.button key={type}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => onNavigate(nav)}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-2xl text-left transition-all hover:-translate-y-0.5"
            style={{ padding:'1.1rem 1rem', background:'rgba(11,20,12,0.88)', border:`1px solid rgba(255,255,255,0.07)`, borderLeft:`3px solid ${color}`, boxShadow:'0 2px 12px rgba(0,0,0,0.28)' }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background:`${color}18`, color }}>
              <Icon size={20}/>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className="text-3xl font-bold mt-0.5 leading-none">{count}</p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* ── Segunda fila: métricas de cuentas (solo desktop) ── */}
      <div className="hidden md:grid grid-cols-4 gap-3">
        {[
          { icon: Package,    label:'Total cuentas',    value: totalAccounts,          color:'#60a5fa' },
          { icon: TrendingUp, label:'Perfiles libres',  value: freeSlots,              color:'#4ade80' },
          { icon: WifiOff,    label:'Cuentas caídas',   value: downAccounts,           color: downAccounts>0?'#f87171':'#475569' },
          { icon: Tv,         label:'Plataformas',      value: platforms,              color:'#a78bfa' },
        ].map(({ icon: Icon, label, value, color }, i) => (
          <motion.div key={label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background:`${color}15`, color }}>
              <Icon size={15}/>
            </div>
            <div>
              <p className="text-[11px] text-slate-600">{label}</p>
              <p className="text-lg font-bold text-slate-200">{value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Resumen financiero del mes (solo admin) ── */}
      {isAdmin && summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Ingresos mes', value: summary.income_total,  icon: TrendingUp,   color: '#4ade80', nav: 'payments' },
            { label: 'Egresos mes',  value: summary.expense_total, icon: TrendingDown, color: '#f87171', nav: 'payments' },
            { label: 'Ganancia neta',value: summary.net_profit,    icon: DollarSign,   color: summary.net_profit >= 0 ? '#a78bfa' : '#fb923c', nav: 'payments' },
          ].map(({ label, value, icon: Icon, color, nav }, i) => (
            <motion.button key={label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              onClick={() => onNavigate(nav)}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-2xl text-left transition-all hover:-translate-y-0.5"
              style={{ padding:'0.9rem 1rem', background:'rgba(11,20,12,0.88)', border:`1px solid rgba(255,255,255,0.07)`, borderLeft:`3px solid ${color}`, boxShadow:'0 2px 12px rgba(0,0,0,0.28)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:`${color}18`, color }}>
                <Icon size={17}/>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium leading-tight">{label}</p>
                <p className="text-xl font-bold mt-0.5 leading-none" style={{ color }}>
                  S/. {Number(value || 0).toFixed(2)}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Navegación rápida móvil (solo móvil) ── */}
      <div className="grid grid-cols-3 gap-3 md:hidden">
        {mobileNav.map(({ id, icon: Icon, label, color, bg, stat }, i) => (
          <motion.button key={i}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onNavigate(id)}
            className="flex flex-col items-center gap-3 rounded-2xl text-center transition-all active:scale-95"
            style={{ padding:'1.25rem 0.75rem', background: bg, border:`1px solid ${color}35` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background:`${color}25`, color }}>
              <Icon size={26}/>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 leading-tight">{label}</p>
              <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>{stat}</p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* ── Acciones rápidas (desktop) ── */}
      <div className="hidden md:grid grid-cols-3 gap-4">

        {/* Ir a cobros urgentes */}
        <motion.button
          initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}
          onClick={() => onNavigate('whatsapp')}
          className="glass-card flex items-center gap-4 text-left hover:-translate-y-0.5 transition-all"
          style={{ borderLeft:'3px solid #ef4444' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(239,68,68,0.12)', color:'#f87171' }}>
            <Send size={20}/>
          </div>
          <div>
            <p className="font-bold text-slate-200">Cobros urgentes</p>
            <p className="text-sm text-slate-500 mt-0.5">{counts.expired + counts.today} clientes a contactar</p>
          </div>
        </motion.button>

        {/* Ir a ventas */}
        <motion.button
          initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}
          onClick={() => onNavigate('accounts')}
          className="glass-card flex items-center gap-4 text-left hover:-translate-y-0.5 transition-all"
          style={{ borderLeft:'3px solid #22c55e' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(34,197,94,0.12)', color:'#4ade80' }}>
            <MonitorPlay size={20}/>
          </div>
          <div>
            <p className="font-bold text-slate-200">Perfiles libres — {freeSlots} total</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {Object.entries(freeByPlat).map(([plat, n]) => (
                <span key={plat} className="text-xs text-slate-500">
                  <span className="text-slate-300 font-medium">{plat}:</span> {n}
                </span>
              ))}
            </div>
          </div>
        </motion.button>

        {/* Exportar Excel */}
        <motion.button
          initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
          onClick={exportToXLSX}
          className="glass-card flex items-center gap-4 text-left hover:-translate-y-0.5 transition-all"
          style={{ borderLeft:'3px solid #60a5fa' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(96,165,250,0.12)', color:'#93c5fd' }}>
            <Download size={20}/>
          </div>
          <div>
            <p className="font-bold text-slate-200">Exportar Excel</p>
            <p className="text-sm text-slate-500 mt-0.5">{allSubs.length} perfiles asignados</p>
          </div>
        </motion.button>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 1 — Tasa de ocupación en tiempo real
          ════════════════════════════════════════════════════════ */}
      {(() => {
        const byPlat = {}
        let totalSlots = 0, totalOccupied = 0
        accounts.forEach(acc => {
          if (!byPlat[acc.platform]) byPlat[acc.platform] = { total: 0, occupied: 0 }
          const occ = acc.isFullAccount
            ? (acc.fullClient?.clientName ? 1 : 0)
            : acc.profiles.filter(p => p.clientName).length
          const tot = acc.isFullAccount ? 1 : acc.profiles.length
          byPlat[acc.platform].total    += tot
          byPlat[acc.platform].occupied += occ
          totalSlots    += tot
          totalOccupied += occ
        })
        const globalPct = totalSlots > 0 ? Math.round(totalOccupied / totalSlots * 100) : 0
        const entries = Object.entries(byPlat).sort((a, b) => b[1].occupied - a[1].occupied)
        if (!entries.length) return null

        const gaugeColor = globalPct >= 90 ? '#f87171' : globalPct >= 70 ? '#4ade80' : '#60a5fa'
        // SVG ring gauge
        const r = 36, circ = 2 * Math.PI * r
        const dash = (globalPct / 100) * circ

        return (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.45 }}
            className="glass-card">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} style={{ color:'#a78bfa' }}/>
              <h3 className="font-bold text-slate-200 text-sm">Tasa de ocupación</h3>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              {/* Gauge circular */}
              <div className="flex flex-col items-center flex-shrink-0">
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
                  <circle cx="48" cy="48" r={r} fill="none"
                    stroke={gaugeColor} strokeWidth="8"
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 48 48)"
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                  <text x="48" y="44" textAnchor="middle" fontSize="18" fontWeight="700" fill={gaugeColor}>{globalPct}%</text>
                  <text x="48" y="58" textAnchor="middle" fontSize="9" fill="#475569">ocupado</text>
                </svg>
                <p className="text-xs text-slate-500 mt-1">{totalOccupied}/{totalSlots} perfiles</p>
              </div>

              {/* Barras por plataforma */}
              <div className="flex-1 space-y-2.5 w-full">
                {entries.map(([plat, data]) => {
                  const pct = data.total > 0 ? Math.round(data.occupied / data.total * 100) : 0
                  const bar = pct >= 90 ? '#f87171' : pct >= 70 ? '#4ade80' : '#60a5fa'
                  return (
                    <div key={plat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${PLATFORM_CLASS[plat] || ''}`}>
                          {plat}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{data.occupied}/{data.total}</span>
                          <span className="text-xs font-bold tabular-nums" style={{ color: bar, minWidth:'36px', textAlign:'right' }}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background:'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width:`${pct}%`, background: bar }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 2 — Gráfico ingresos/egresos últimos 6 meses (admin)
          ════════════════════════════════════════════════════════ */}
      {isAdmin && monthlyData.length > 0 && (() => {
        const maxVal = Math.max(...monthlyData.flatMap(m => [m.income, m.expense]), 1)
        const BAR_H  = 100 // px máximo de barra

        return (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
            className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} style={{ color:'#a78bfa' }}/>
                <h3 className="font-bold text-slate-200 text-sm">Tendencia mensual</h3>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background:'#4ade80' }}/> Ingresos</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background:'#f87171' }}/> Egresos</span>
              </div>
            </div>

            <div className="flex items-end justify-around gap-1" style={{ height: `${BAR_H + 36}px` }}>
              {monthlyData.map((m) => {
                const inH  = Math.round((m.income  / maxVal) * BAR_H)
                const exH  = Math.round((m.expense / maxVal) * BAR_H)
                const [y, mo] = m.month.split('-')
                const label = format(new Date(Number(y), Number(mo) - 1, 1), 'MMM', { locale: es })

                return (
                  <div key={m.month} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: `${BAR_H}px` }}>
                      {/* Ingreso */}
                      <div title={`Ingreso: S/. ${m.income.toFixed(2)}`}
                        className="rounded-t-md transition-all duration-700 cursor-default"
                        style={{ width:'40%', height:`${inH || 2}px`, background: inH ? '#4ade80' : 'rgba(74,222,128,0.15)', minHeight:'2px' }}/>
                      {/* Egreso */}
                      <div title={`Egreso: S/. ${m.expense.toFixed(2)}`}
                        className="rounded-t-md transition-all duration-700 cursor-default"
                        style={{ width:'40%', height:`${exH || 2}px`, background: exH ? '#f87171' : 'rgba(248,113,113,0.15)', minHeight:'2px' }}/>
                    </div>
                    <span className="text-[10px] text-slate-500 capitalize truncate w-full text-center">{label}</span>
                    {m.income > 0 && (
                      <span className="text-[9px] font-bold" style={{ color:'#4ade80' }}>
                        +{m.income.toFixed(0)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 3 — ROI por plataforma (admin)
          ════════════════════════════════════════════════════════ */}
      {isAdmin && summary?.by_platform?.length > 0 && (() => {
        const plats = summary.by_platform
          .filter(p => p.income > 0 || p.expense > 0)
          .map(p => ({
            ...p,
            roi: p.expense > 0 ? Math.round(((p.income - p.expense) / p.expense) * 100) : null,
          }))
          .sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity))
        if (!plats.length) return null

        return (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.55 }}
            className="glass-card">
            <div className="flex items-center gap-2 mb-4">
              <Percent size={16} style={{ color:'#a78bfa' }}/>
              <h3 className="font-bold text-slate-200 text-sm">ROI por plataforma <span className="text-slate-600 font-normal text-xs">(mes actual)</span></h3>
            </div>
            <div className="space-y-2">
              {plats.map(p => {
                const roi = p.roi
                const roiColor = roi === null ? '#475569' : roi >= 100 ? '#4ade80' : roi >= 0 ? '#fbbf24' : '#f87171'
                const roiLabel = roi === null ? 'Sin egreso' : `${roi >= 0 ? '+' : ''}${roi}%`
                return (
                  <div key={p.platform} className="flex items-center gap-3 py-2 px-3 rounded-xl"
                    style={{ background:'rgba(255,255,255,0.03)' }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${PLATFORM_CLASS[p.platform] || 'bg-slate-800 text-slate-300'}`}>
                      {p.platform || '—'}
                    </span>
                    <div className="flex-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="text-emerald-500">+{p.income.toFixed(2)}</span>
                      <span>/</span>
                      <span className="text-red-400">-{p.expense.toFixed(2)}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: roiColor }}>
                      {roiLabel}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-600 mt-3 px-1">
              ROI = (Ingreso − Egreso) / Egreso × 100. Verde ≥ 100%, Amarillo ≥ 0%, Rojo = pérdida.
            </p>
          </motion.div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 4 — Proyección de cobros pendientes (admin)
          ════════════════════════════════════════════════════════ */}
      {isAdmin && (() => {
        const now = new Date(); now.setHours(0,0,0,0)
        const endMonth = endOfMonth(now)

        // ── Ingresos: perfiles con cliente que vencen este mes ────────
        // Paso 1: recolectar todos los perfiles pendientes con su metadata
        const rawItems = []
        accounts.forEach(acc => {
          if (acc.isDown) return
          if (acc.isFullAccount) {
            const fc = acc.fullClient
            if (!fc?.clientName || !fc?.expiryDate) return
            const exp = new Date(fc.expiryDate + 'T00:00:00')
            if (exp <= endMonth) rawItems.push({ platform: acc.platform, phone: fc.phone || '', expiryDate: fc.expiryDate, expired: exp < now })
          } else {
            acc.profiles.forEach(p => {
              if (!p.clientName || !p.expiryDate) return
              const exp = new Date(p.expiryDate + 'T00:00:00')
              if (exp <= endMonth) rawItems.push({ platform: acc.platform, phone: p.phone || '', expiryDate: p.expiryDate, expired: exp < now })
            })
          }
        })
        // Paso 2: agrupar por (teléfono + fecha) para detectar combos
        const clientGroups = new Map()
        rawItems.forEach(item => {
          const norm = item.phone.replace(/\D/g,'')
          if (!norm) { /* sin teléfono: tratar como individual */ return }
          const key = norm + '_' + item.expiryDate
          if (!clientGroups.has(key)) clientGroups.set(key, [])
          clientGroups.get(key).push(item)
        })
        // Paso 3: calcular precio por grupo
        const incomeItems    = []
        const resellerItems  = []
        const processedPhoneDates = new Set()
        rawItems.forEach(item => {
          const norm = item.phone.replace(/\D/g,'')
          const key  = norm + '_' + item.expiryDate
          if (processedPhoneDates.has(key)) return
          processedPhoneDates.add(key)
          const reseller = norm ? isClientReseller(item.phone) : false
          if (reseller) {
            // Revendedor: siempre precio individual por plataforma
            const group = clientGroups.get(key) || [item]
            group.forEach(i => resellerItems.push({ platform: i.platform, price: getPlatformResellerPrice(i.platform), expired: i.expired }))
            return
          }
          const group = clientGroups.get(key) || [item]
          const plats = [...new Set(group.map(i => i.platform))]
          if (plats.length >= 2) {
            // Combo: buscar precio de combo configurado
            const comboPrice = getComboPriceByPlatforms(plats)
            const price = comboPrice !== null ? comboPrice : group.reduce((t, i) => t + getPlatformRenewalPrice(i.platform), 0)
            incomeItems.push({ platform: plats.join('+'), price, expired: item.expired })
          } else {
            incomeItems.push({ platform: item.platform, price: getPlatformRenewalPrice(item.platform), expired: item.expired })
          }
        })
        // Items sin teléfono: tratar como individuales
        rawItems.filter(i => !i.phone.replace(/\D/g,'')).forEach(i => {
          incomeItems.push({ platform: i.platform, price: getPlatformRenewalPrice(i.platform), expired: i.expired })
        })

        // ── Egresos: cuentas con expiryDate este mes y cost > 0 ───────
        const expenseItems = []
        accounts.forEach(acc => {
          if (acc.isDown || !acc.expiryDate || !(acc.cost > 0)) return
          const exp = new Date(acc.expiryDate + 'T00:00:00')
          if (exp <= endMonth)
            expenseItems.push({ platform: acc.platform, cost: acc.cost, expired: exp < now })
        })

        // ── Potencial: perfiles libres disponibles para vender ────────
        const availableItems = []
        accounts.forEach(acc => {
          if (acc.isDown || acc.isFullAccount) return
          acc.profiles.forEach(p => {
            if (!p.clientName)
              availableItems.push({ platform: acc.platform, price: getPlatformPrice(acc.platform) })
          })
        })

        if (!incomeItems.length && !resellerItems.length && !expenseItems.length && !availableItems.length) return null

        const totalIncome    = incomeItems.reduce((s, i) => s + i.price, 0)
        const totalReseller  = resellerItems.reduce((s, i) => s + i.price, 0)
        const totalCost      = expenseItems.reduce((s, i) => s + i.cost,  0)
        const totalAvailable = availableItems.reduce((s, i) => s + i.price, 0)
        const netProjected   = totalIncome + totalReseller + totalAvailable - totalCost
        const netColor       = netProjected >= 0 ? '#4ade80' : '#f87171'

        // Agrupar por plataforma
        const byIncome = {}
        incomeItems.forEach(i => {
          if (!byIncome[i.platform]) byIncome[i.platform] = { count: 0, total: 0 }
          byIncome[i.platform].count++
          byIncome[i.platform].total += i.price
        })
        const byExpense = {}
        expenseItems.forEach(i => {
          if (!byExpense[i.platform]) byExpense[i.platform] = { count: 0, total: 0 }
          byExpense[i.platform].count++
          byExpense[i.platform].total += i.cost
        })
        const byReseller = {}
        resellerItems.forEach(i => {
          if (!byReseller[i.platform]) byReseller[i.platform] = { count: 0, total: 0 }
          byReseller[i.platform].count++
          byReseller[i.platform].total += i.price
        })
        const byAvailable = {}
        availableItems.forEach(i => {
          if (!byAvailable[i.platform]) byAvailable[i.platform] = { count: 0, total: 0 }
          byAvailable[i.platform].count++
          byAvailable[i.platform].total += i.price
        })

        const PlatRow = ({ plat, count, total, sign, color, unit }) => (
          <div className="flex items-center gap-3 py-1.5 px-3 rounded-xl" style={{ background:'rgba(255,255,255,0.03)' }}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${PLATFORM_CLASS[plat] || ''}`}>
              {plat}
            </span>
            <span className="text-xs text-slate-500 flex-1">{count} {unit}{count !== 1 ? 's' : ''}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color }}>
              {sign}S/. {total.toFixed(2)}
            </span>
          </div>
        )

        return (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.6 }}
            className="glass-card"
            style={{ borderLeft:'3px solid #fbbf24' }}>

            <div className="flex items-center gap-2 mb-4">
              <CalendarClock size={16} style={{ color:'#fbbf24' }}/>
              <h3 className="font-bold text-slate-200 text-sm">Proyección del mes</h3>
            </div>

            {/* ── Ingresos ── */}
            {incomeItems.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                  Ingresos proyectados · {incomeItems.length} cliente{incomeItems.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {Object.entries(byIncome).sort((a,b) => b[1].total - a[1].total).map(([plat, d]) => (
                    <PlatRow key={plat} plat={plat} count={d.count} total={d.total} sign="+" color="#4ade80" unit="cliente" />
                  ))}
                </div>
                <div className="flex justify-end mt-1.5 pr-3">
                  <span className="text-sm font-bold text-emerald-400">Total: +S/. {totalIncome.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* ── Revendedores ── */}
            {resellerItems.length > 0 && (
              <>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.05)', margin:'0.75rem 0' }}/>
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                    Renovaciones revendedores · {resellerItems.length} cliente{resellerItems.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {Object.entries(byReseller).sort((a,b) => b[1].total - a[1].total).map(([plat, d]) => (
                      <PlatRow key={plat} plat={plat} count={d.count} total={d.total} sign="+" color="#fb923c" unit="revendedor" />
                    ))}
                  </div>
                  <div className="flex justify-end mt-1.5 pr-3">
                    <span className="text-sm font-bold" style={{ color:'#fb923c' }}>Total: +S/. {totalReseller.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Egresos ── */}
            {expenseItems.length > 0 && (
              <>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.05)', margin:'0.75rem 0' }}/>
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                    Egresos proyectados · {expenseItems.length} cuenta{expenseItems.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {Object.entries(byExpense).sort((a,b) => b[1].total - a[1].total).map(([plat, d]) => (
                      <PlatRow key={plat} plat={plat} count={d.count} total={d.total} sign="-" color="#f87171" unit="cuenta" />
                    ))}
                  </div>
                  <div className="flex justify-end mt-1.5 pr-3">
                    <span className="text-sm font-bold text-red-400">Total: -S/. {totalCost.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Perfiles disponibles ── */}
            {availableItems.length > 0 && (
              <>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.05)', margin:'0.75rem 0' }}/>
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                    Ventas potenciales · {availableItems.length} perfil{availableItems.length !== 1 ? 'es' : ''} libre{availableItems.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {Object.entries(byAvailable).sort((a,b) => b[1].total - a[1].total).map(([plat, d]) => (
                      <PlatRow key={plat} plat={plat} count={d.count} total={d.total} sign="+" color="#60a5fa" unit="perfil" />
                    ))}
                  </div>
                  <div className="flex justify-end mt-1.5 pr-3">
                    <span className="text-sm font-bold text-blue-400">Potencial: +S/. {totalAvailable.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Comparativa final ── */}
            {(incomeItems.length > 0 || resellerItems.length > 0 || availableItems.length > 0) && expenseItems.length > 0 && (
              <>
                <div style={{ height:'1px', background:'rgba(255,255,255,0.05)', margin:'0.75rem 0' }}/>
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: netProjected >= 0 ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)', border:`1px solid ${netColor}25` }}>
                  <span className="text-xs font-bold text-slate-400">Ganancia proyectada</span>
                  <span className="text-lg font-bold" style={{ color: netColor }}>
                    {netProjected >= 0 ? '+' : ''}S/. {netProjected.toFixed(2)}
                  </span>
                </div>
              </>
            )}

          </motion.div>
        )
      })()}
    </div>
  )
}
