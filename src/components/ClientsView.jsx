import { useState, useMemo, useEffect } from 'react'
import Pagination from './Pagination'
import { motion } from 'framer-motion'
import { addMonths, addDays, format } from 'date-fns'
import {
  Search, Edit2, Save, X, User,
  MessageSquare, RefreshCw, Layers, Trash2
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { createPortal } from 'react-dom'
import { motion as m, AnimatePresence } from 'framer-motion'

/* ── Helpers ─────────────────────────────────────────────────────────  */
const PLATFORM_CLASS = {
  'Netflix':'plat-netflix','Disney+':'plat-disney','HBO Max':'plat-hbo',
  'Prime Video':'plat-prime','Crunchyroll':'plat-crunchyroll','Movistar+':'plat-movistar',
}
const STATUS_CFG = {
  expired:  { badge:'badge-expired',  dot:'#f87171' },
  today:    { badge:'badge-today',    dot:'#fbbf24' },
  soon:     { badge:'badge-soon',     dot:'#facc15' },
  active:   { badge:'badge-active',   dot:'#34d399' },
  available:{ badge:'badge-available',dot:'#818cf8' },
}

function normalizePhone(p) { return p?.replace(/\D/g,'') || '' }

// Elimina caracteres invisibles y normaliza para comparación
function cleanStr(s) {
  if (!s) return ''
  let r = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    // Conserva ASCII imprimible (32-126) y Latin Extended (160-591)
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 591)) r += ch
  }
  return r.toLowerCase().trim()
}

/* ── Deduplication ───────────────────────────────────────────────────── */
function buildUniqueClients(accounts, savedClients, getSubscriptionStatus) {
  const map = new Map()

  // 1. Clientes guardados (historial sin suscripción activa)
  ;(savedClients || []).forEach(c => {
    const key = normalizePhone(c.phone) || c.name.toLowerCase().trim()
    if (!map.has(key)) map.set(key, { id: key, name: c.name, phone: c.phone || '', subs: [] })
  })

  // 2. Fusionar con clientes de perfiles activos
  accounts.forEach(acc => {
    // Perfiles normales
    acc.profiles.forEach(p => {
      if (!p.clientName) return
      const key = normalizePhone(p.phone) || p.clientName.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { id: key, name: p.clientName, phone: p.phone || '', subs: [] })
      const client = map.get(key)
      if (p.clientName && client.name !== p.clientName) client.name = p.clientName
      client.subs.push({
        accountId:  acc.id,
        profileId:  p.id,
        platform:   acc.platform,
        expiryDate: p.expiryDate,
        pin:        p.pin,
        number:     p.number,
        status:     getSubscriptionStatus(p.expiryDate),
        isDown:     !!acc.isDown,
      })
    })

    // Clientes de cuentas completas
    if (acc.isFullAccount && acc.fullClient?.clientName) {
      const fc  = acc.fullClient
      const key = normalizePhone(fc.phone) || fc.clientName.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { id: key, name: fc.clientName, phone: fc.phone || '', subs: [] })
      const client = map.get(key)
      if (fc.clientName && client.name !== fc.clientName) client.name = fc.clientName
      client.subs.push({
        accountId:  acc.id,
        profileId:  null,
        platform:   acc.platform,
        expiryDate: fc.expiryDate || '',
        pin:        '',
        number:     null,
        status:     getSubscriptionStatus(fc.expiryDate),
        isDown:     !!acc.isDown,
        isFullAccount: true,
      })
    }
  })

  return Array.from(map.values()).map(c => ({
    ...c,
    isFromDownAccount: c.subs.some(s => s.isDown),
    worstStatus: c.subs.length === 0 ? 'available' : c.subs.reduce((worst, s) => {
      const order = { expired:0, today:1, soon:2, active:3, available:4 }
      return (order[s.status]??9) < (order[worst]??9) ? s.status : worst
    }, 'active'),
    earliestExpiry: c.subs.map(s => s.expiryDate).filter(Boolean).sort()[0] || '9999-99-99',
  }))
}

/* ── Edit client modal ─────────────────────────────────────────────── */
function EditClientModal({ client, onSave, onClose }) {
  const [name,  setName]  = useState(client.name)
  const [phone, setPhone] = useState(client.phone)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(name.trim(), phone.trim())
  }

  return createPortal(
    <AnimatePresence>
      <m.div className="modal-backdrop"
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <m.div className="modal-box"
          initial={{scale:0.95,y:16}} animate={{scale:1,y:0}} exit={{scale:0.95,y:16}}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-100">Editar cliente</h3>
            <button className="btn-icon" onClick={onClose}><X size={16}/></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="form-label">Nombre</label>
              <input className="form-input" value={name} onChange={e=>setName(e.target.value)} required/>
            </div>
            <div>
              <label className="form-label">Celular</label>
              <input className="form-input" value={phone} onChange={e=>setPhone(e.target.value)}/>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1 gap-1.5"><Save size={14}/> Guardar</button>
              <button type="button" className="btn-secondary" onClick={onClose}><X size={14}/></button>
            </div>
          </form>
        </m.div>
      </m.div>
    </AnimatePresence>,
    document.body
  )
}

/* ── Renew button ───────────────────────────────────────────────────── */
function RenewButton({ client }) {
  const { extendClientAllProfiles } = useApp()
  const [open,   setOpen]   = useState(false)
  const [custom, setCustom] = useState('')

  const baseDate = useMemo(() => {
    const dates = client.subs.map(s => s.expiryDate).filter(Boolean).sort()
    if (!dates.length) return format(new Date(), 'yyyy-MM-dd')
    return dates[0]
  }, [client.subs])

  function parseLocal(d) { const [y,m,dd] = d.split('-').map(Number); return new Date(y,m-1,dd) }
  function toShort(iso)  { const [y,mo,d] = iso.split('-'); return `${parseInt(d)}/${parseInt(mo)}/${y.slice(2)}` }

  const OPTS = [
    { label:'+15 días', fn: b => addDays(b,15)  },
    { label:'+1 mes',   fn: b => addMonths(b,1) },
    { label:'+2 meses', fn: b => addMonths(b,2) },
    { label:'+3 meses', fn: b => addMonths(b,3) },
  ]

  const apply = (newDate, label) => {
    extendClientAllProfiles(client.phone, client.name, format(newDate,'yyyy-MM-dd'), label)
    setOpen(false); setCustom('')
  }

  return (
    <div className="relative">
      <button className="btn-icon btn-icon-success" title="Actualizar membresía" onClick={() => setOpen(v=>!v)}>
        <RefreshCw size={14}/>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
            <m.div initial={{opacity:0,scale:0.9,y:-4}} animate={{opacity:1,scale:1,y:0}}
              exit={{opacity:0,scale:0.9}} transition={{duration:0.15}}
              className="absolute right-0 top-9 z-50 min-w-[200px] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
              style={{background:'#111827'}}>
              <div className="px-3 pt-2.5 pb-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Renovar · {client.subs.length} suscripción{client.subs.length!==1?'es':''}
                </p>
              </div>
              {OPTS.map(opt => {
                const base = parseLocal(baseDate)
                const nd   = opt.fn(base)
                return (
                  <button key={opt.label} onClick={() => apply(nd, opt.label)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.07] flex items-center justify-between">
                    <span>{opt.label}</span>
                    <span className="text-xs text-emerald-500 font-mono">{toShort(format(nd,'yyyy-MM-dd'))}</span>
                  </button>
                )
              })}
              <div className="px-3 py-2.5 border-t border-white/[0.06]">
                <div className="flex gap-1.5">
                  <input type="number" min="1" max="365" placeholder="días" autoFocus
                    className="form-input !py-1 !text-xs flex-1"
                    value={custom} onChange={e => setCustom(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && custom && apply(addDays(parseLocal(baseDate),parseInt(custom)),`+${custom}d`)}/>
                  <button className="btn-primary !py-1 !px-2 !text-xs"
                    onClick={() => custom && apply(addDays(parseLocal(baseDate),parseInt(custom)),`+${custom}d`)}
                    disabled={!custom}>✓</button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Client row ────────────────────────────────────────────────────── */
function ClientRow({ client, idx, onEdit, onDelete }) {
  const cfg     = STATUS_CFG[client.worstStatus] || STATUS_CFG.active
  const waPhone = normalizePhone(client.phone)
  // COMBO = tiene suscripciones de DISTINTAS plataformas
  const uniquePlatforms = [...new Set(client.subs.map(s => s.platform))]
  const isCombo = uniquePlatforms.length > 1

  // Agrupar subs por plataforma para mostrar conteo
  const subsByPlat = {}
  client.subs.forEach(s => {
    if (!subsByPlat[s.platform]) subsByPlat[s.platform] = []
    subsByPlat[s.platform].push(s)
  })
  // Peor estado por plataforma
  const worstByPlat = (subs) => subs.reduce((w, s) => {
    const o = { expired:0, today:1, soon:2, active:3, available:4 }
    return (o[s.status]??9) < (o[w]??9) ? s.status : w
  }, 'active')

  const buildComboMsg = () => {
    const lines = client.subs.map(s => `🎬 *${s.platform}* → vence: ${s.expiryDate}`)
    return encodeURIComponent(
      `Hola *${client.name}*! 👋 Tus suscripciones:\n\n${lines.join('\n')}\n\n¡Que los disfrutes! 😊`
    )
  }

  return (
    <motion.tr initial={{opacity:0}} animate={{opacity:1}} transition={{delay:Math.min(idx*0.015,0.4)}}>
      <td style={{width:'2rem'}}>
        <span className="w-2.5 h-2.5 rounded-full block mx-auto" style={{background:cfg.dot}}/>
      </td>
      <td>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-200 text-sm">{client.name}</p>
          {isCombo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{background:'rgba(139,92,246,0.15)',color:'#c084fc',border:'1px solid rgba(139,92,246,0.3)'}}>
              <Layers size={9}/> COMBO
            </span>
          )}
          {client.isFromDownAccount && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{background:'rgba(239,68,68,0.12)',color:'#f87171',border:'1px solid rgba(239,68,68,0.3)'}}>
              ⚠️ Cuenta caída
            </span>
          )}
        </div>
      </td>
      <td>
        <span className="text-xs font-mono text-slate-400">{client.phone || '—'}</span>
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {Object.entries(subsByPlat).map(([plat, subs]) => {
            const platClass = PLATFORM_CLASS[plat] || 'plat-default'
            const wStatus   = worstByPlat(subs)
            const sCfg      = STATUS_CFG[wStatus] || STATUS_CFG.active
            return (
              <span key={plat} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${platClass}`}>
                {plat}
                {subs.length > 1
                  ? <span className="opacity-80">×{subs.length}</span>
                  : <span className="w-1.5 h-1.5 rounded-full" style={{background:sCfg.dot}}/>
                }
              </span>
            )
          })}
        </div>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <RenewButton client={client}/>
          <button className="btn-icon btn-icon-indigo" title="Editar cliente" onClick={() => onEdit(client)}>
            <Edit2 size={14}/>
          </button>
          <button className="btn-icon btn-icon-danger" title="Eliminar del historial" onClick={() => onDelete(client)}>
            <Trash2 size={14}/>
          </button>
          {waPhone && (
            <a href={`https://wa.me/${waPhone}${isCombo ? '?text='+buildComboMsg() : ''}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-icon btn-icon-wa" title={isCombo ? 'WA combo' : 'WhatsApp'}>
              <MessageSquare size={14}/>
            </a>
          )}
        </div>
      </td>
    </motion.tr>
  )
}

/* ── Main view ─────────────────────────────────────────────────────── */
export default function ClientsView() {
  const { accounts, savedClients, getSubscriptionStatus, updateClientGlobal, deleteClientFromHistory } = useApp()

  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('expiry')
  const [statusFilter,setStatusFilter]= useState('all')
  const [editTarget,  setEditTarget]  = useState(null)
  const [delTarget,   setDelTarget]   = useState(null)
  const [page,        setPage]        = useState(1)
  const PAGE_SIZE = 20

  const allClients = useMemo(
    () => buildUniqueClients(accounts, savedClients, getSubscriptionStatus),
    [accounts, savedClients, getSubscriptionStatus]
  )

  useEffect(() => setPage(1), [search, sortBy, statusFilter])

  // Filtrar y ordenar directo — sin useMemo para evitar closures stale
  const q = search.toLowerCase().trim()
  const filtered = allClients
    .filter(c => {
      if (statusFilter !== 'all' && c.worstStatus !== statusFilter) return false
      if (!q) return true
      const nameMatch  = (c.name || '').toLowerCase().includes(q)
      const qDigits    = q.replace(/\D/g,'')
      const phoneMatch = qDigits.length > 0 && normalizePhone(c.phone).includes(qDigits)
      return nameMatch || phoneMatch
    })
    .sort((a, b) => {
      if (a.isFromDownAccount && !b.isFromDownAccount) return -1
      if (!a.isFromDownAccount && b.isFromDownAccount) return 1
      if (sortBy === 'expiry') return (a.earliestExpiry || '').localeCompare(b.earliestExpiry || '')
      if (sortBy === 'name')   return cleanStr(a.name).localeCompare(cleanStr(b.name))
      if (sortBy === 'subs')   return b.subs.length - a.subs.length
      if (sortBy === 'status') {
        const order = { expired:0, today:1, soon:2, active:3, available:4 }
        return (order[a.worstStatus]??9) - (order[b.worstStatus]??9)
      }
      return 0
    })

  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  const counts = useMemo(() => ({
    expired:  allClients.filter(c => c.worstStatus==='expired').length,
    today:    allClients.filter(c => c.worstStatus==='today').length,
    soon:     allClients.filter(c => c.worstStatus==='soon').length,
    active:   allClients.filter(c => c.worstStatus==='active').length,
  }), [allClients])

  const handleSave = (newName, newPhone) => {
    updateClientGlobal(editTarget.phone, editTarget.name, newName, newPhone)
    setEditTarget(null)
  }

  const handleDelete = () => {
    deleteClientFromHistory(delTarget.id)
    setDelTarget(null)
  }

  const SORT_OPTS = [
    { value:'expiry', label:'Vencimiento ↑' },
    { value:'status', label:'Estado urgente' },
    { value:'name',   label:'A → Z'         },
    { value:'subs',   label:'Más suscripciones' },
  ]

  const STATUS_TABS = [
    { id:'all',     label:'Todos',      count: allClients.length },
    { id:'expired', label:'Vencidos',   count: counts.expired    },
    { id:'today',   label:'Hoy',        count: counts.today      },
    { id:'soon',    label:'Próximos',   count: counts.soon       },
    { id:'active',  label:'Activos',    count: counts.active     },
  ]

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {allClients.length} clientes únicos ·{' '}
            <span className="text-red-400">{counts.expired} vencidos</span> ·{' '}
            <span className="text-amber-400">{counts.today} hoy</span> ·{' '}
            <span className="text-yellow-400">{counts.soon} próximos</span>
          </p>
        </div>
      </div>

      {/* ── Search + sort ── */}
      <div className="flex items-center gap-2">
        <div className="relative" style={{flex:'1 1 0', minWidth:0}}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input
            type="text"
            placeholder="Buscar por nombre o celular…"
            className="form-input w-full"
            style={{ paddingLeft:'2.25rem' }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="form-select flex-shrink-0" style={{width:'160px'}} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Status tabs ── */}
      <div className="tab-bar">
        {STATUS_TABS.map(tab => (
          <button key={tab.id}
            className={`tab-item ${statusFilter===tab.id?'active':''}`}
            onClick={() => { setStatusFilter(tab.id); setPage(1) }}>
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-slate-300 text-[10px] font-bold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div className="glass-card !p-0 overflow-hidden">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'2rem'}}></th>
                <th>Nombre</th>
                <th>Celular</th>
                <th>Suscripciones</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((client, idx) => (
                <ClientRow key={client.id} client={client} idx={idx} onEdit={setEditTarget} onDelete={setDelTarget}/>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-14 text-slate-600 text-sm">
                    No se encontraron clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} total={filtered.length} perPage={PAGE_SIZE} onChange={setPage}/>

      {editTarget && (
        <EditClientModal
          client={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Modal confirmación eliminar */}
      {delTarget && createPortal(
        <m.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
          <m.div className="modal-box" style={{maxWidth:'22rem'}}
            initial={{scale:0.95,y:16}} animate={{scale:1,y:0}}>
            <h3 className="font-bold text-slate-100 mb-1">Eliminar cliente</h3>
            <p className="text-sm text-slate-400 mb-1">
              ¿Estás seguro de eliminar a <strong className="text-slate-200">{delTarget.name}</strong> del historial?
            </p>
            {delTarget.subs?.length > 0 && (
              <p className="text-xs text-amber-400 mb-3">
                ⚠️ Este cliente tiene {delTarget.subs.length} suscripción(es) activa(s). Solo se elimina del historial, no de las cuentas.
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setDelTarget(null)}>Cancelar</button>
              <button className="btn-primary flex-1" onClick={handleDelete}
                style={{background:'linear-gradient(135deg,#dc2626,#ef4444)'}}>
                Sí, eliminar
              </button>
            </div>
          </m.div>
        </m.div>,
        document.body
      )}
    </div>
  )
}
