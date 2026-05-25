import { useState, useMemo, useEffect } from 'react'
import Pagination from './Pagination'
import { motion } from 'framer-motion'
import { differenceInCalendarDays } from 'date-fns'
import { Search, MessageSquare, Copy } from 'lucide-react'
import { useApp } from '../context/AppContext'

/* ── Helpers ─────────────────────────────────────────────────────────  */
const PLATFORM_CLASS = {
  'Netflix':     'plat-netflix',
  'Disney+':     'plat-disney',
  'HBO Max':     'plat-hbo',
  'Prime Video': 'plat-prime',
  'Crunchyroll': 'plat-crunchyroll',
  'Movistar+':   'plat-movistar',
}

const STATUS_CFG = {
  expired:  { badge: 'badge-expired',  dot: '#f87171', label: 'Vencida'    },
  today:    { badge: 'badge-today',    dot: '#fbbf24', label: 'Vence hoy'  },
  soon:     { badge: 'badge-soon',     dot: '#facc15', label: 'Próxima'    },
  active:   { badge: 'badge-active',   dot: '#34d399', label: 'Activa'     },
  available:{ badge: 'badge-available',dot: '#818cf8', label: 'Sin asignar'},
}

function parseLocal(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysLabel(dateStr) {
  if (!dateStr) return '—'
  const d = differenceInCalendarDays(parseLocal(dateStr), new Date())
  if (d < 0)   return `Hace ${Math.abs(d)}d`
  if (d === 0) return 'Hoy'
  return `${d}d`
}

/* ── Main view ─────────────────────────────────────────────────────── */
export default function AccountsListView() {
  const { accounts, suppliers, getSubscriptionStatus, copyToClipboard } = useApp()

  const [search,      setSearch]      = useState('')
  const [platFilter,  setPlatFilter]  = useState('all')
  const [statusFilter,setStatusFilter]= useState('all')
  const [page,        setPage]        = useState(1)
  const PER_PAGE = 15

  useEffect(() => setPage(1), [search, platFilter, statusFilter])

  const platforms = ['all', ...new Set(accounts.map(a => a.platform))]

  /* Ordenar por fecha de vencimiento (más próxima primero) */
  const sorted = useMemo(() => {
    const order = { expired: 0, today: 1, soon: 2, active: 3 }
    return [...accounts]
      .filter(a => {
        const matchPlat   = platFilter   === 'all' || a.platform === platFilter
        const matchStatus = statusFilter === 'all' || getSubscriptionStatus(a.expiryDate) === statusFilter
        const matchSearch = !search ||
          a.platform.toLowerCase().includes(search.toLowerCase()) ||
          a.email.toLowerCase().includes(search.toLowerCase()) ||
          suppliers.find(s => s.id === a.supplierId)?.name.toLowerCase().includes(search.toLowerCase())
        return matchPlat && matchStatus && matchSearch
      })
      .sort((a, b) => {
        const sa = getSubscriptionStatus(a.expiryDate)
        const sb = getSubscriptionStatus(b.expiryDate)
        const oa = order[sa] ?? 9
        const ob = order[sb] ?? 9
        if (oa !== ob) return oa - ob
        // Mismo grupo → ordenar por fecha exacta
        const da = parseLocal(a.expiryDate)?.getTime() ?? 0
        const db = parseLocal(b.expiryDate)?.getTime() ?? 0
        return da - db
      })
  }, [accounts, suppliers, platFilter, statusFilter, search, getSubscriptionStatus])

  const getSupplier = (id) => suppliers.find(s => s.id === id)

  const counts = useMemo(() => ({
    expired: accounts.filter(a => getSubscriptionStatus(a.expiryDate) === 'expired').length,
    today:   accounts.filter(a => getSubscriptionStatus(a.expiryDate) === 'today').length,
    soon:    accounts.filter(a => getSubscriptionStatus(a.expiryDate) === 'soon').length,
    active:  accounts.filter(a => getSubscriptionStatus(a.expiryDate) === 'active').length,
  }), [accounts, getSubscriptionStatus])

  const freeCount = useMemo(() => accounts.reduce((n, a) => {
    if (a.isDown || a.isFullAccount) return n
    return n + a.profiles.filter(p => !p.clientName).length
  }, 0), [accounts])

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-bold">Cuentas</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          {accounts.length} cuentas · <span className="text-green-400">{freeCount} libres para vender</span> · ordenadas por vencimiento ·{' '}
          <span className="text-red-400">{counts.expired} vencidas</span> ·{' '}
          <span className="text-amber-400">{counts.today} hoy</span> ·{' '}
          <span className="text-yellow-400">{counts.soon} próximas</span>
        </p>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input type="text" placeholder="Buscar plataforma, correo o proveedor…"
            className="form-input" style={{ paddingLeft: '2.25rem' }}
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="tab-bar w-auto">
          {platforms.map(p => (
            <button key={p} className={`tab-item ${platFilter === p ? 'active' : ''}`}
              onClick={() => setPlatFilter(p)}>
              {p === 'all' ? 'Todas' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Estado pills */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { id: 'all',     label: `Todas (${accounts.length})`,  dot: null       },
          { id: 'expired', label: `Vencidas (${counts.expired})`,dot: '#f87171'  },
          { id: 'today',   label: `Hoy (${counts.today})`,       dot: '#fbbf24'  },
          { id: 'soon',    label: `Próximas (${counts.soon})`,   dot: '#facc15'  },
          { id: 'active',  label: `Activas (${counts.active})`,  dot: '#34d399'  },
        ].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            className="text-xs font-semibold px-3 py-1 rounded-full transition-all"
            style={statusFilter === f.id
              ? { background: f.dot ? `${f.dot}20` : 'rgba(99,102,241,0.2)',
                  color:      f.dot || '#818cf8',
                  border:     `1px solid ${f.dot ? `${f.dot}40` : 'rgba(99,102,241,0.35)'}` }
              : { background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div className="glass-card !p-0 overflow-hidden">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '2rem' }}></th>
                <th>Plataforma</th>
                <th>Correo</th>
                <th>Vencimiento</th>
                <th>Días</th>
                <th>Perfiles</th>
                <th>Proveedor</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice((page-1)*PER_PAGE, page*PER_PAGE).map((acc, idx) => {
                const status    = getSubscriptionStatus(acc.expiryDate)
                const cfg       = STATUS_CFG[status] || STATUS_CFG.active
                const platClass = PLATFORM_CLASS[acc.platform] || 'plat-default'
                const supplier  = getSupplier(acc.supplierId)
                const waPhone   = supplier?.contact?.replace(/\D/g, '')
                const occupied  = acc.isFullAccount
                  ? (acc.fullClient?.clientName ? 1 : 0)
                  : acc.profiles.filter(p => p.clientName).length
                const total = acc.isFullAccount ? 1 : acc.profiles.length
                const days      = daysLabel(acc.expiryDate)
                const daysNum   = acc.expiryDate
                  ? differenceInCalendarDays(parseLocal(acc.expiryDate), new Date())
                  : null

                return (
                  <motion.tr key={acc.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                  >
                    {/* Dot de estado */}
                    <td style={{ width: '2rem' }}>
                      <span className="w-2.5 h-2.5 rounded-full block mx-auto"
                        style={{ background: cfg.dot }}/>
                    </td>

                    {/* Plataforma */}
                    <td>
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${platClass}`}>
                        {acc.platform}
                      </span>
                    </td>

                    {/* Correo */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 font-mono truncate max-w-[180px]">
                          {acc.email}
                        </span>
                        <button className="btn-icon btn-icon-indigo flex-shrink-0"
                          style={{ width: '1.5rem', height: '1.5rem' }}
                          title="Copiar correo"
                          onClick={() => copyToClipboard(acc.email, 'Correo')}>
                          <Copy size={11}/>
                        </button>
                      </div>
                    </td>

                    {/* Vencimiento */}
                    <td>
                      <p className="text-sm text-slate-300">{acc.expiryDate || '—'}</p>
                      <span className={`badge ${cfg.badge} mt-0.5`}>{cfg.label}</span>
                    </td>

                    {/* Días restantes */}
                    <td>
                      <span className="text-sm font-bold"
                        style={{
                          color: daysNum === null ? '#475569'
                            : daysNum < 0  ? '#f87171'
                            : daysNum === 0 ? '#fbbf24'
                            : daysNum <= 2  ? '#facc15'
                            : '#34d399'
                        }}>
                        {days}
                      </span>
                    </td>

                    {/* Perfiles */}
                    <td>
                      {acc.isFullAccount ? (
                        <span className="text-xs font-bold"
                          style={{ color: acc.fullClient?.clientName ? '#34d399' : '#475569' }}>
                          {acc.fullClient?.clientName ? 'COMPLETA' : 'LIBRE'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          <span className="text-slate-200 font-semibold">{occupied}</span>/{total}
                        </span>
                      )}
                    </td>

                    {/* Proveedor */}
                    <td>
                      <span className="text-xs text-slate-400">{supplier?.name || '—'}</span>
                    </td>

                    {/* Acciones */}
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {waPhone && (
                          <a
                            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                              `Hola *${supplier.name}*! Necesito información sobre la cuenta de *${acc.platform}* (${acc.email}) que vence el ${acc.expiryDate}. ¿Me puedes confirmar? 🙏`
                            )}`}
                            target="_blank" rel="noopener noreferrer"
                            className="btn-primary !py-1.5 !px-2.5 !text-xs !gap-1"
                            style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)' }}
                            title={`WhatsApp a ${supplier.name}`}
                          >
                            <MessageSquare size={12}/> {supplier.name}
                          </a>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-slate-600 text-sm">
                    No se encontraron cuentas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} total={sorted.length} perPage={PER_PAGE} onChange={setPage}/>
    </div>
  )
}
