import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { addMonths, addDays, format } from 'date-fns'
import {
  MessageSquare, Send, CheckCircle, Clock, AlertCircle,
  Copy, Info, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, RefreshCw, Tv, Users, Search, X, Eye, EyeOff
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useWAEvents } from '../hooks/useWAEvents'
import WAStatus from './WAStatus'

/* ── Fecha relativa ─────────────────────────────────────────────────── */
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

/* ── Templates ─────────────────────────────────────────────────────── */
const DEFAULT_TEMPLATES = {
  expired: `Hola *{{nombre}}*! ⚠️ Tu perfil de *{{plataforma}}* venció {{fecha}}. Si deseas renovar, escríbenos. 🎬`,
  today:   `¡Hola *{{nombre}}*! 🚀 Tu suscripción de *{{plataforma}}* vence *{{fecha}}*. Envíanos el comprobante para renovar. 🙏`,
  soon:    `Hola *{{nombre}}*! 👋 Tu perfil de *{{plataforma}}* vence *{{fecha}}*. ¿Deseas renovar? 😊`,
}
function fillTemplate(t, sub) {
  return t
    .replace(/{{nombre}}/g,     sub.clientName || '')
    .replace(/{{plataforma}}/g, sub.platform   || '')
    .replace(/{{fecha}}/g,      relativeDateText(sub.expiryDate))
}

/* ── Date helpers ───────────────────────────────────────────────────── */
// Parsea como fecha LOCAL para evitar desfase UTC
function parseLocal(dateStr) {
  if (!dateStr) return new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toShort(iso) {
  if (!iso) return ''
  const [y, mo, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(mo)}/${y.slice(2)}`
}

/* ── Renew popover ──────────────────────────────────────────────────── */
// addMonths maneja automáticamente: jan31→feb28/29, mar31→apr30, etc.
const QUICK_OPTIONS = [
  { label: '+15 días', getDate: (b) => addDays(b, 15)   },
  { label: '+1 mes',   getDate: (b) => addMonths(b, 1)  },
  { label: '+2 meses', getDate: (b) => addMonths(b, 2)  },
  { label: '+3 meses', getDate: (b) => addMonths(b, 3)  },
]

function RenewButton({ name, currentExpiry, onApply }) {
  const [open,    setOpen]    = useState(false)
  const [custom,  setCustom]  = useState('')
  const [pending, setPending] = useState(null)
  const [pos,     setPos]     = useState({ top:0, right:0 })
  const btnRef = useRef(null)

  const base = parseLocal(currentExpiry)

  const calcPos = () => {
    if (!btnRef.current) return
    const r   = btnRef.current.getBoundingClientRect()
    const pw  = 240 // ancho del popup
    const top = Math.min(r.bottom + 6, window.innerHeight - 320) // no salir abajo
    // en móvil: centrar horizontalmente; en desktop: alinear a la derecha del botón
    const isMobile = window.innerWidth < 640
    if (isMobile) {
      setPos({ top, left: Math.max(8, (window.innerWidth - pw) / 2), right: undefined })
    } else {
      const right = window.innerWidth - r.right
      setPos({ top, right: Math.max(8, right), left: undefined })
    }
  }

  const openPopover = () => { calcPos(); setOpen(v => !v) }

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', calcPos, true)
    window.addEventListener('resize', calcPos)
    return () => {
      window.removeEventListener('scroll', calcPos, true)
      window.removeEventListener('resize', calcPos)
    }
  }, [open])

  const select  = (newDate, label) => setPending({ newDateStr: format(newDate, 'yyyy-MM-dd'), label })
  const confirm = () => { onApply(pending.newDateStr, pending.label); setOpen(false); setPending(null); setCustom('') }
  const cancel  = () => { setPending(null); setCustom('') }
  const close   = () => { setOpen(false); setPending(null); setCustom('') }

  const popup = (
    <>
      <div className="fixed inset-0 z-[998]" onClick={close}/>
      <div
        style={{ position:'fixed', top: pos.top, right: pos.right, left: pos.left, zIndex:999, minWidth:'220px', maxWidth:'92vw',
          background:'#111827', borderRadius:'0.75rem', border:'1px solid rgba(255,255,255,0.1)',
          boxShadow:'0 20px 60px rgba(0,0,0,0.6)', overflow:'hidden' }}>

        {pending ? (
          <div className="p-3 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Confirmar renovación</p>
            <div className="p-3 rounded-xl text-center"
              style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)' }}>
              <p className="text-xs text-slate-400">{name}</p>
              <p className="text-sm font-bold text-slate-200 mt-1">{pending.label}</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5 font-mono">{toShort(pending.newDateStr)}</p>
              <p className="text-[10px] text-slate-600 mt-1">nueva fecha de vencimiento</p>
            </div>
            <div className="flex gap-1.5">
              <button className="btn-secondary flex-1 !py-1.5 !text-xs" onClick={cancel}>← Volver</button>
              <button className="btn-primary flex-1 !py-1.5 !text-xs" onClick={confirm}
                style={{ background:'linear-gradient(135deg,#059669,#10b981)' }}>✓ Confirmar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3 pt-2.5 pb-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                Renovar · {name}
              </p>
            </div>
            {QUICK_OPTIONS.map(opt => {
              const newDate    = opt.getDate(base)
              const newDateStr = format(newDate, 'yyyy-MM-dd')
              return (
                <button key={opt.label}
                  className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.07] transition-colors flex items-center justify-between"
                  onClick={() => select(newDate, opt.label)}>
                  <span>{opt.label}</span>
                  <span className="text-xs text-emerald-500 font-mono">{toShort(newDateStr)}</span>
                </button>
              )
            })}
            <div className="px-3 py-2.5 border-t border-white/[0.06]">
              <p className="text-[10px] text-slate-500 mb-1.5">Días personalizados</p>
              <div className="flex gap-1.5">
                <input type="number" min="1" max="365" placeholder="ej: 45"
                  className="form-input !py-1 !text-xs flex-1"
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && custom && select(addDays(base, parseInt(custom)), `+${custom} días`)}
                  autoFocus
                />
                <button className="btn-primary !py-1 !px-2.5 !text-xs"
                  onClick={() => custom && select(addDays(base, parseInt(custom)), `+${custom} días`)}
                  disabled={!custom}>→</button>
              </div>
              {custom && (
                <p className="text-[10px] text-emerald-500 mt-1 font-mono">
                  → {toShort(format(addDays(base, parseInt(custom) || 0), 'yyyy-MM-dd'))}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )

  return (
    <>
      <button ref={btnRef} className="btn-icon btn-icon-success" title="Renovar" onClick={openPopover}>
        <RefreshCw size={15}/>
      </button>
      {open && createPortal(popup, document.body)}
    </>
  )
}

/* ── Sending overlay ────────────────────────────────────────────────── */
function SendingOverlay({ progress, bulkDone, onClose }) {
  if (!progress && !bulkDone) return null
  const isDone = !!bulkDone
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
      <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }}
        className="glass-card w-full max-w-sm !py-8 text-center">
        {isDone ? (
          <>
            {bulkDone.failed === 0
              ? <CheckCircle size={52} className="text-emerald-400 mx-auto mb-4"/>
              : <AlertTriangle size={52} className="text-amber-400 mx-auto mb-4"/>}
            <p className="text-xl font-bold">¡Envío completado!</p>
            <p className="text-sm text-emerald-400 mt-2">✓ {bulkDone.sent} enviado{bulkDone.sent !== 1 ? 's' : ''}</p>
            {bulkDone.failed > 0 && <p className="text-sm text-red-400">✗ {bulkDone.failed} con error</p>}
            <button className="btn-primary mx-auto mt-6" onClick={onClose}>Cerrar</button>
          </>
        ) : (
          <>
            <Loader2 size={48} className="text-indigo-400 mx-auto mb-4 animate-spin"/>
            <p className="text-lg font-bold">Enviando mensajes…</p>
            <p className="text-slate-500 text-sm mt-1">{progress.current} de {progress.total}</p>
            {progress.phone && <p className="text-xs text-slate-600 mt-1 font-mono">{progress.phone}</p>}
            <div className="h-2 bg-white/[0.06] rounded-full mt-5 mx-4 overflow-hidden">
              <motion.div className="h-full rounded-full"
                style={{ background:'linear-gradient(90deg,#6366f1,#25d366)' }}
                animate={{ width:`${(progress.current/progress.total)*100}%` }}
                transition={{ duration:0.4 }}/>
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-1.5 mx-4">
              <span className="text-emerald-500">✓ {progress.sent} ok</span>
              {progress.failed > 0 && <span className="text-red-400">✗ {progress.failed} error</span>}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────  */
const PLATFORM_CLASS = {
  'Netflix':'plat-netflix','Disney+':'plat-disney','HBO Max':'plat-hbo',
  'Prime Video':'plat-prime','Crunchyroll':'plat-crunchyroll','Movistar+':'plat-movistar',
}
const STATUS_CFG = {
  expired:{ label:'VENCIDO',   badge:'badge-expired', Icon:AlertCircle },
  today:  { label:'VENCE HOY', badge:'badge-today',   Icon:Clock       },
  soon:   { label:'PRÓXIMO',   badge:'badge-soon',    Icon:Clock       },
}
const STATUS_TABS = [
  { id:'all', label:'Todos' },{ id:'expired', label:'Vencidos' },
  { id:'today', label:'Vence hoy' },{ id:'soon', label:'Próximos (2d)' },
]
const ACC_TABS = [
  { id:'all', label:'Todas' },{ id:'expired', label:'Vencidas' },
  { id:'today', label:'Vence hoy' },{ id:'soon', label:'Próximas (2d)' },
]

/* ── Client item ─────────────────────────────────────────────────────  */
function ClientItem({ sub, template, status, onCopyMsg, onRenew, onRelease, onReleaseFull }) {
  const [expanded,  setExpanded]  = useState(false)
  const [showPass,  setShowPass]  = useState(false)
  const [step,      setStep]      = useState('idle') // idle | pin | done
  const [newPin,    setNewPin]    = useState('')

  const msg       = fillTemplate(template, sub)
  const phone     = sub.phone?.replace(/\D/g,'')
  const waHref    = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : null
  const cfg       = STATUS_CFG[status] || STATUS_CFG.soon
  const platClass = PLATFORM_CLASS[sub.platform] || 'plat-default'

  const handleRelease = () => {
    setNewPin(sub.pin) // pre-rellena con el PIN actual
    setStep('pin')
  }

  const handleConfirm = async () => {
    if (sub.isFullAccount) {
      await onReleaseFull(sub.accountId)
    } else {
      await onRelease(sub.accountId, sub.id, newPin || sub.pin)
    }
    setStep('idle')
    setExpanded(false)
  }

  return (
    <div className="wa-item flex-col !items-stretch gap-0 !p-0 overflow-hidden">
      {/* Fila principal — clickeable */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          status==='expired'?'bg-red-500/12 text-red-400':
          status==='today'  ?'bg-amber-500/12 text-amber-400':'bg-yellow-500/12 text-yellow-400'}`}>
          <cfg.Icon size={16}/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-200 text-sm">{sub.clientName}</p>
            <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${platClass}`}>{sub.platform}</span>
            <span className="text-xs text-slate-500">{sub.expiryDate}</span>
            {sub.phone && <span className="text-xs font-mono text-slate-600">{sub.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <RenewButton
            name={sub.clientName}
            currentExpiry={sub.expiryDate}
            onApply={(newDateStr, label) => onRenew(sub.accountId, sub.id, newDateStr, label)}
          />
          <button className="btn-icon btn-icon-indigo" title="Copiar mensaje" onClick={() => onCopyMsg(msg)}>
            <Copy size={15}/>
          </button>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="btn-icon btn-icon-wa" title="Abrir WhatsApp">
              <MessageSquare size={15}/>
            </a>
          )}
        </div>
      </div>

      {/* Panel expandido con credenciales */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }}
            exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }}
            className="overflow-hidden border-t border-white/[0.06]"
            style={{ background:'rgba(0,0,0,0.25)' }}>
            <div className="px-4 py-3 space-y-2">
              {/* Correo */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase w-16">Correo</span>
                <span className="text-xs font-mono text-slate-300 flex-1 truncate">{sub.email}</span>
                <button className="btn-icon btn-icon-indigo" style={{width:'1.5rem',height:'1.5rem'}}
                  onClick={() => navigator.clipboard.writeText(sub.email)}>
                  <Copy size={11}/>
                </button>
              </div>
              {/* Contraseña */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase w-16">Clave</span>
                <span className="text-xs font-mono text-slate-300 flex-1">
                  {showPass ? sub.password : '••••••••'}
                </span>
                <button className="btn-icon" style={{width:'1.5rem',height:'1.5rem',color:'#475569'}}
                  onClick={() => setShowPass(v=>!v)}>
                  {showPass ? <EyeOff size={11}/> : <Eye size={11}/>}
                </button>
                <button className="btn-icon btn-icon-indigo" style={{width:'1.5rem',height:'1.5rem'}}
                  onClick={() => navigator.clipboard.writeText(sub.password)}>
                  <Copy size={11}/>
                </button>
              </div>
              {/* Perfil y PIN (solo cuentas normales) */}
              {!sub.isFullAccount && sub.number && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-600 uppercase w-16">Perfil</span>
                  <span className="text-xs text-slate-300">
                    P{sub.number} · PIN: <span className="font-mono font-bold">{sub.pin}</span>
                  </span>
                  <button className="btn-icon btn-icon-indigo" style={{width:'1.5rem',height:'1.5rem'}}
                    onClick={() => navigator.clipboard.writeText(sub.pin)}>
                    <Copy size={11}/>
                  </button>
                </div>
              )}
              {/* Liberar */}
              <div className="pt-1 space-y-2">
                {step === 'idle' && (
                  <button onClick={handleRelease}
                    className="w-full py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background:'rgba(255,255,255,0.04)', color:'#64748b', border:'1px solid rgba(255,255,255,0.08)' }}>
                    {sub.isFullAccount ? 'Liberar cliente (no renovó)' : 'Liberar perfil (no renovó)'}
                  </button>
                )}
                {step === 'pin' && !sub.isFullAccount && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500">Nuevo PIN para el perfil liberado:</p>
                    <div className="flex items-center gap-2">
                      <input
                        className="form-input !py-1.5 !px-3 text-sm font-mono flex-1"
                        placeholder="Nuevo PIN"
                        value={newPin}
                        maxLength={6}
                        autoFocus
                        onChange={e => setNewPin(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                      />
                      <button onClick={handleConfirm}
                        className="btn-primary !py-1.5 !px-3 !text-xs whitespace-nowrap"
                        style={{ background:'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                        Liberar
                      </button>
                      <button onClick={() => setStep('idle')}
                        className="btn-secondary !py-1.5 !px-3 !text-xs">
                        Cancelar
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-600">El cliente se conserva en el historial. El perfil quedará libre con el nuevo PIN.</p>
                  </div>
                )}
                {step === 'pin' && sub.isFullAccount && (
                  <div className="flex gap-2">
                    <button onClick={handleConfirm}
                      className="btn-primary flex-1 !py-1.5 !text-xs"
                      style={{ background:'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                      Confirmar liberación
                    </button>
                    <button onClick={() => setStep('idle')} className="btn-secondary !py-1.5 !text-xs">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Account item (proveedor) ────────────────────────────────────────  */
function AccountItem({ account, supplier, status, onRenew }) {
  const { copyToClipboard } = useApp()
  const cfg       = STATUS_CFG[status] || STATUS_CFG.soon
  const platClass = PLATFORM_CLASS[account.platform] || 'plat-default'
  const clientCount = account.profiles.filter(p => p.clientName).length
  const waPhone = supplier?.contact?.replace(/\D/g,'')
  const waMsg   = waPhone && encodeURIComponent(
    `Hola *${supplier.name}*! 👋 Necesito renovar la cuenta de *${account.platform}* ` +
    `(${account.email}) que vence el *${account.expiryDate}*. ` +
    `Tiene ${clientCount} cliente${clientCount!==1?'s':''} activo${clientCount!==1?'s':''}. ¿Me confirmas? 🙏`
  )

  return (
    <div className="wa-item">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          status==='expired'?'bg-red-500/12 text-red-400':
          status==='today'  ?'bg-amber-500/12 text-amber-400':'bg-yellow-500/12 text-yellow-400'}`}>
          <cfg.Icon size={16}/>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${platClass}`}>{account.platform}</span>
            {status === 'soon' ? (() => {
              const [y,m,d] = account.expiryDate.split('-').map(Number)
              const diff = Math.round((new Date(y,m-1,d) - new Date().setHours(0,0,0,0)) / 86400000)
              return (
                <span className="badge text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{background:'rgba(249,115,22,0.15)',color:'#fb923c',border:'1px solid rgba(249,115,22,0.3)'}}>
                  {diff === 1 ? '1 día' : `${diff} días`}
                </span>
              )
            })() : (
              <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-slate-400 truncate font-mono">{account.email}</p>
            <button className="btn-icon flex-shrink-0" style={{width:'1.4rem',height:'1.4rem',color:'#475569'}}
              title="Copiar correo" onClick={() => copyToClipboard(account.email,'Correo')}>
              <Copy size={11}/>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">Vence {account.expiryDate}</span>
            {supplier && <span className="text-[11px] text-slate-600">· {supplier.name}</span>}
            <span className="text-[11px] text-slate-600">· {clientCount} cliente{clientCount!==1?'s':''}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <RenewButton
          name={account.platform}
          currentExpiry={account.expiryDate}
          onApply={(newDateStr, label) => onRenew(account.id, newDateStr, label)}
        />
        {waPhone && waMsg && (
          <a href={`https://wa.me/${waPhone}?text=${waMsg}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-primary !py-1.5 !px-3 !text-xs !gap-1.5"
            style={{ background:'linear-gradient(135deg,#128c7e,#25d366)' }}>
            <MessageSquare size={13}/> {supplier?.name}
          </a>
        )}
      </div>
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────────────────── */
export default function WhatsAppView() {
  const {
    accounts, suppliers,
    getSubscriptionStatus, copyToClipboard,
    extendProfile, extendFullAccountClient, extendAccount, releaseProfileWithPIN, releaseFullClient,
  } = useApp()
  const { status, qr, progress, bulkDone, isSending, backendOk, connect, disconnect, sendBulk, resetDone } = useWAEvents()

  const [mainTab,       setMainTab]       = useState('clients')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [platFilter,    setPlatFilter]    = useState('all')
  const [accFilter,     setAccFilter]     = useState('all')
  const [templates,     setTemplates]     = useState(DEFAULT_TEMPLATES)
  const [showTemplates, setShowTemplates] = useState(false)
  const [search,        setSearch]        = useState('')

  /* ── Clientes pendientes ── */
  const allPending = [
    // Perfiles normales con cliente asignado
    ...accounts.flatMap(acc =>
      acc.profiles.filter(p => p.clientName)
        .map(p => ({ ...p, platform: acc.platform, accountId: acc.id, email: acc.email, password: acc.password, isFullAccount: false }))
    ),
    // Cuentas completas con cliente asignado
    ...accounts
      .filter(acc => acc.isFullAccount && acc.fullClient?.clientName)
      .map(acc => ({
        id:            `full-${acc.id}`,
        clientName:    acc.fullClient.clientName,
        phone:         acc.fullClient.phone || '',
        expiryDate:    acc.fullClient.expiryDate || '',
        pin:           '',
        number:        null,
        platform:      acc.platform,
        accountId:     acc.id,
        email:         acc.email,
        password:      acc.password,
        isFullAccount: true,
      })),
  ].filter(s => ['expired','today','soon'].includes(getSubscriptionStatus(s.expiryDate)))
   .sort((a,b) => {
     const o = { expired:0, today:1, soon:2 }
     return (o[getSubscriptionStatus(a.expiryDate)]??9) - (o[getSubscriptionStatus(b.expiryDate)]??9)
   })

  // Plataformas disponibles en los pendientes
  const availablePlats = ['all', ...new Set(allPending.map(s => s.platform))]

  const statusFiltered = statusFilter==='all' ? allPending : allPending.filter(s => getSubscriptionStatus(s.expiryDate)===statusFilter)
  const platFiltered   = platFilter==='all'   ? statusFiltered : statusFiltered.filter(s => s.platform===platFilter)
  const q = search.toLowerCase().trim()
  const filteredClients = !q ? platFiltered : platFiltered.filter(s => {
    const nameMatch  = (s.clientName || '').toLowerCase().includes(q)
    const qDigits    = q.replace(/\D/g,'')
    const phoneMatch = qDigits.length > 0 && (s.phone || '').replace(/\D/g,'').includes(qDigits)
    return nameMatch || phoneMatch
  })

  const statusCounts = {
    all:     allPending.length,
    expired: allPending.filter(s=>getSubscriptionStatus(s.expiryDate)==='expired').length,
    today:   allPending.filter(s=>getSubscriptionStatus(s.expiryDate)==='today').length,
    soon:    allPending.filter(s=>getSubscriptionStatus(s.expiryDate)==='soon').length,
  }
  const sendable = filteredClients.filter(s => s.phone?.replace(/\D/g,''))

  /* ── Cuentas por proveedor ── */
  const allExpAccounts = accounts
    .filter(a => ['expired','today','soon'].includes(getSubscriptionStatus(a.expiryDate)))
    .sort((a,b) => {
      const o = { expired:0, today:1, soon:2 }
      return (o[getSubscriptionStatus(a.expiryDate)]??9) - (o[getSubscriptionStatus(b.expiryDate)]??9)
    })

  const accCounts = {
    all:     allExpAccounts.length,
    expired: allExpAccounts.filter(a=>getSubscriptionStatus(a.expiryDate)==='expired').length,
    today:   allExpAccounts.filter(a=>getSubscriptionStatus(a.expiryDate)==='today').length,
    soon:    allExpAccounts.filter(a=>getSubscriptionStatus(a.expiryDate)==='soon').length,
  }
  const filteredAccounts = accFilter==='all' ? allExpAccounts : allExpAccounts.filter(a=>getSubscriptionStatus(a.expiryDate)===accFilter)

  const getSupplier = (id) => suppliers.find(s => s.id === id)

  /* ── Bulk send ── */
  const handleBulkSend = async () => {
    const messages = sendable.map(sub => {
      const st  = getSubscriptionStatus(sub.expiryDate)
      const tpl = templates[st] || templates.soon
      return { phone: sub.phone, text: fillTemplate(tpl, sub) }
    })
    await sendBulk(messages)
  }

  const isConnected = status === 'connected'

  return (
    <div className="space-y-5 pb-10">
      <AnimatePresence>
        {(isSending || bulkDone) && (
          <SendingOverlay progress={progress} bulkDone={bulkDone} onClose={resetDone}/>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold">Cobros WhatsApp</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {allPending.length} clientes · {allExpAccounts.length} cuentas pendientes
          </p>
        </div>
        {mainTab==='clients' && (
          <button className="btn-primary" onClick={handleBulkSend}
            disabled={!isConnected || sendable.length===0 || isSending}>
            {isSending
              ? <><Loader2 size={16} className="animate-spin"/> Enviando…</>
              : <><Send size={16}/> Enviar a todos ({sendable.length})</>}
          </button>
        )}
      </div>

      {/* ── WA Status ── */}
      <WAStatus status={status} qr={qr} backendOk={backendOk} onConnect={connect} onDisconnect={disconnect}/>

      {/* ── Main tabs ── */}
      <div className="flex gap-2">
        {[
          { id:'clients',  Icon:Users, label:'Mis Clientes', count:allPending.length,     color:'indigo' },
          { id:'accounts', Icon:Tv,    label:'Mis Cuentas',  count:allExpAccounts.length, color:'amber'  },
        ].map(tab => (
          <button key={tab.id} onClick={() => setMainTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={mainTab===tab.id
              ? tab.color==='indigo'
                ? { background:'rgba(99,102,241,0.18)',  color:'#818cf8', border:'1px solid rgba(99,102,241,0.3)'  }
                : { background:'rgba(245,158,11,0.15)',  color:'#fbbf24', border:'1px solid rgba(245,158,11,0.3)'  }
              : { background:'rgba(255,255,255,0.04)', color:'#475569', border:'1px solid rgba(255,255,255,0.07)' }
            }>
            <tab.Icon size={16}/>
            {tab.label}
            {tab.count > 0 && (
              <span className="w-5 h-5 rounded-full bg-white/10 text-[11px] font-bold flex items-center justify-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ CLIENTES ══ */}
      {mainTab==='clients' && (
        <>
          {/* Plantillas */}
          <div className="glass-card !py-3 !px-4">
            <button className="flex items-center justify-between w-full text-sm font-semibold text-slate-300"
              onClick={() => setShowTemplates(v=>!v)}>
              <span className="flex items-center gap-2"><MessageSquare size={15} className="text-indigo-400"/>Plantillas de mensajes</span>
              {showTemplates ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </button>
            {showTemplates && (
              <div className="mt-4 space-y-3">
                {[{key:'expired',label:'Vencido'},{key:'today',label:'Vence hoy'},{key:'soon',label:'Próximo'}].map(({key,label})=>(
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="form-label">{label}</label>
                      <span className="text-[10px] text-slate-600 italic">{'{{nombre}} {{plataforma}} {{fecha}}'}</span>
                    </div>
                    <textarea className="form-input text-xs leading-relaxed" rows={2}
                      style={{ resize:'vertical', fontFamily:'inherit' }}
                      value={templates[key]}
                      onChange={e=>setTemplates(p=>({...p,[key]:e.target.value}))}/>
                  </div>
                ))}
                <button className="btn-secondary text-xs" onClick={()=>setTemplates(DEFAULT_TEMPLATES)}>
                  Restaurar por defecto
                </button>
              </div>
            )}
          </div>

          {/* Estado tabs */}
          <div className="tab-bar">
            {STATUS_TABS.map(tab=>(
              <button key={tab.id} className={`tab-item ${statusFilter===tab.id?'active':''}`}
                onClick={()=>setStatusFilter(tab.id)}>
                {tab.label}
                {statusCounts[tab.id]>0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-[10px] font-bold">
                    {statusCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtro por plataforma */}
          {availablePlats.length > 2 && (
            <div className="flex gap-1.5 flex-wrap">
              {availablePlats.map(p => (
                <button key={p}
                  onClick={() => setPlatFilter(p)}
                  className="text-xs font-bold px-3 py-1 rounded-full transition-all"
                  style={platFilter===p
                    ? { background:'rgba(99,102,241,0.2)', color:'#818cf8', border:'1px solid rgba(99,102,241,0.35)' }
                    : { background:'rgba(255,255,255,0.04)', color:'#475569', border:'1px solid rgba(255,255,255,0.08)' }
                  }>
                  {p==='all' ? 'Todas las plataformas' : p}
                </button>
              ))}
            </div>
          )}

          {/* Búsqueda por nombre o teléfono */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
            <input
              type="text"
              placeholder="Buscar por nombre o celular…"
              className="form-input w-full"
              style={{ paddingLeft:'2.25rem', paddingRight: search ? '2.25rem' : undefined }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setSearch('')}>
                <X size={14}/>
              </button>
            )}
          </div>

          {isConnected && sendable.length < filteredClients.length && (
            <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl"
              style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.18)' }}>
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-400/80">
                {filteredClients.length-sendable.length} cliente{filteredClients.length-sendable.length!==1?'s':''} sin número.
                Agrégalo en <strong>Cuentas → Perfil → Editar cliente</strong>.
              </p>
            </div>
          )}

          {filteredClients.length===0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle size={44} className="text-emerald-500 opacity-20"/>
              <p className="text-slate-600 text-sm">No hay clientes pendientes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredClients.map((sub,idx)=>{
                const st=getSubscriptionStatus(sub.expiryDate)
                return (
                  <motion.div key={sub.id}
                    initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                    transition={{delay:Math.min(idx*0.03,0.35)}}>
                    <ClientItem sub={sub} status={st}
                      template={templates[st]||templates.soon}
                      onCopyMsg={msg=>copyToClipboard(msg,'Mensaje')}
                      onRenew={(accountId, profileId, newDateStr, label) =>
                        sub.isFullAccount
                          ? extendFullAccountClient(accountId, newDateStr, label)
                          : extendProfile(accountId, profileId, newDateStr, label)
                      }
                      onRelease={releaseProfileWithPIN}
                      onReleaseFull={releaseFullClient}/>
                  </motion.div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══ CUENTAS ══ */}
      {mainTab==='accounts' && (
        <>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)' }}>
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-amber-300/80">
              Tus cuentas de streaming que vencen pronto. Usa 🔄 para registrar la renovación
              y el botón verde para avisar al proveedor por WhatsApp.
            </p>
          </div>

          <div className="tab-bar">
            {ACC_TABS.map(tab=>(
              <button key={tab.id} className={`tab-item ${accFilter===tab.id?'active':''}`}
                onClick={()=>setAccFilter(tab.id)}>
                {tab.label}
                {accCounts[tab.id]>0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-[10px] font-bold">
                    {accCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {filteredAccounts.length===0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle size={44} className="text-emerald-500 opacity-20"/>
              <p className="text-slate-600 text-sm">No hay cuentas pendientes de renovar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAccounts.map((acc,idx)=>(
                <motion.div key={acc.id}
                  initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  transition={{delay:Math.min(idx*0.03,0.35)}}>
                  <AccountItem account={acc}
                    supplier={getSupplier(acc.supplierId)}
                    status={getSubscriptionStatus(acc.expiryDate)}
                    onRenew={extendAccount}/>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.18)' }}>
        <Info size={15} className="text-indigo-400 flex-shrink-0 mt-0.5"/>
        <p className="text-xs text-slate-500">
          <span className="text-indigo-400 font-semibold">🔄 Renovar:</span> suma meses calendario exactos
          (ej: 14 feb → 14 mar; 31 ene → 28 feb). El popover muestra la fecha exacta resultante antes de confirmar.
        </p>
      </div>
    </div>
  )
}
