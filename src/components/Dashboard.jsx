import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Bell, Clock, CheckCircle,
  Copy, MessageSquare, Send, Download, Loader2, CheckCheck,
  MonitorPlay, Tv, Users, Truck, Wifi, WifiOff, TrendingUp, Package
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { differenceInCalendarDays } from 'date-fns'
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

export default function Dashboard({ onNavigate }) {
  const { accounts, getSubscriptionStatus, copyToClipboard, exportToCSV, showToast } = useApp()
  const [filter,   setFilter]   = useState('all')
  const [page,     setPage]     = useState(1)
  const [sending,  setSending]  = useState(new Set())
  const [sent,     setSent]     = useState(new Set())

  // ── Métricas de suscripciones ────────────────────────────────────────
  const allSubs = accounts.flatMap(acc =>
    acc.profiles
      .filter(p => p.clientName)
      .map(p => ({
        ...p,
        platform: acc.platform,
        email:    acc.email,
        password: acc.password,
        accountId: acc.id,
        status:   getSubscriptionStatus(p.expiryDate),
      }))
  ).sort((a, b) => {
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
      stat: `${allSubs.length} activos`,
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
          { type:'active',  icon: CheckCircle,   label:'Activos',       count: counts.active,  nav:'accounts', color:'#10b981' },
        ].map(({ type, icon: Icon, label, count, nav, color }, i) => (
          <motion.button key={type}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => onNavigate(nav)}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-2xl text-left transition-all hover:-translate-y-0.5"
            style={{ padding:'1.1rem 1rem', background:'rgba(15,23,42,0.8)', border:`1px solid rgba(255,255,255,0.07)`, borderLeft:`3px solid ${color}`, boxShadow:'0 4px 20px rgba(0,0,0,0.25)' }}>
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

        {/* Exportar CSV */}
        <motion.button
          initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
          onClick={exportToCSV}
          className="glass-card flex items-center gap-4 text-left hover:-translate-y-0.5 transition-all"
          style={{ borderLeft:'3px solid #60a5fa' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background:'rgba(96,165,250,0.12)', color:'#93c5fd' }}>
            <Download size={20}/>
          </div>
          <div>
            <p className="font-bold text-slate-200">Exportar CSV</p>
            <p className="text-sm text-slate-500 mt-0.5">{allSubs.length} suscripciones activas</p>
          </div>
        </motion.button>
      </div>

      {/* ── Distribución por plataforma ── */}
      {(() => {
        const byPlat = {}
        accounts.forEach(acc => {
          if (!byPlat[acc.platform]) byPlat[acc.platform] = { total: 0, occupied: 0 }
          byPlat[acc.platform].total    += acc.profiles.length
          byPlat[acc.platform].occupied += acc.profiles.filter(p => p.clientName).length
        })
        const entries = Object.entries(byPlat).sort((a,b) => b[1].occupied - a[1].occupied)
        if (!entries.length) return null
        return (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.45 }}
            className="glass-card">
            <h3 className="font-bold text-slate-200 mb-4">Ocupación por plataforma</h3>
            <div className="space-y-3">
              {entries.map(([plat, data]) => {
                const pct = data.total > 0 ? Math.round(data.occupied / data.total * 100) : 0
                const cls = PLATFORM_CLASS[plat] || 'plat-default'
                return (
                  <div key={plat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{plat}</span>
                      <span className="text-xs text-slate-500">{data.occupied}/{data.total} · {pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background:'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width:`${pct}%`, background: pct>90?'#f87171': pct>70?'#4ade80':'#60a5fa' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )
      })()}
    </div>
  )
}
