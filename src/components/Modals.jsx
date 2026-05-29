import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Eye, EyeOff, CalendarDays, CheckCircle, Loader2, User, MessageSquare, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, addMonths, format } from 'date-fns'
import { useApp } from '../context/AppContext'

/* ── Smart date input ──────────────────────────────────────────────────
   Acepta: 6/5/26 · 6/5/2026 · 06-05-26 · 6.5.2026 · yyyy-mm-dd
   Botones rápidos: +15d, +1m, +2m, +3m
   Almacena siempre como yyyy-MM-dd internamente
─────────────────────────────────────────────────────────────────────── */
function parseDate(str) {
  if (!str) return null
  str = str.trim()

  // Ya es formato ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  // d/m/yy, d/m/yyyy, d-m-yy, d.m.yyyy, etc.
  const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    d = parseInt(d); mo = parseInt(mo); y = parseInt(y)
    if (y < 100) y += 2000
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const date = new Date(y, mo - 1, d)
    if (isNaN(date.getTime())) return null
    return format(date, 'yyyy-MM-dd')
  }
  return null
}

function toShort(iso) {
  if (!iso) return ''
  const [y, mo, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(mo)}/${y.slice(2)}`
}

const QUICK = [
  { label: '+15d', fn: () => addDays(new Date(), 15)    },
  { label: '+1m',  fn: () => addMonths(new Date(), 1)   },
  { label: '+2m',  fn: () => addMonths(new Date(), 2)   },
  { label: '+3m',  fn: () => addMonths(new Date(), 3)   },
]

function SmartDateInput({ value, onChange, required = false, label }) {
  // text = lo que muestra el input; puede ser corto o lo que escriba el usuario
  const [text, setText] = useState(value ? toShort(value) : '')
  const [error, setError] = useState(false)

  const commit = (raw) => {
    const iso = parseDate(raw)
    if (iso) {
      setError(false)
      setText(toShort(iso))
      onChange(iso)
    } else if (raw.trim()) {
      setError(true)   // muestra borde rojo pero no bloquea
    }
  }

  const setQuick = (fn) => {
    const iso = format(fn(), 'yyyy-MM-dd')
    setText(toShort(iso))
    setError(false)
    onChange(iso)
  }

  return (
    <div>
      {label && <label className="form-label">{label}</label>}

      {/* Botones rápidos */}
      <div className="flex gap-1 mb-1.5 flex-wrap">
        {QUICK.map(q => (
          <button
            key={q.label} type="button"
            className="btn-ghost !px-2 !py-0.5 text-xs"
            style={{ border:'1px solid rgba(99,102,241,0.25)', borderRadius:'0.375rem' }}
            onClick={() => setQuick(q.fn)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Campo de texto */}
      <div className="relative">
        <CalendarDays size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: error ? '#f87171' : '#475569' }}
        />
        <input
          type="text"
          className="form-input"
          style={{
            paddingLeft: '2.1rem',
            borderColor: error ? '#f87171' : undefined,
          }}
          placeholder="6/5/26 ó 06/05/2026"
          value={text}
          onChange={e => { setText(e.target.value); setError(false) }}
          onBlur={e => commit(e.target.value)}
          // Para que el form pueda validar "required", ponemos un input oculto
        />
      </div>
      {/* Input oculto con el valor ISO real para validación del form */}
      <input type="hidden" value={value || ''} required={required} />
      {error && (
        <p className="text-xs text-red-400 mt-1">
          Formato no reconocido. Prueba: 6/5/26 ó 06/05/2026
        </p>
      )}
    </div>
  )
}

/* ── Generic Modal wrapper ─────────────────────────────────────────── */
// Usa createPortal para renderizar en document.body y evitar que los
// CSS transforms de Framer Motion rompan el position:fixed del modal.
export function Modal({ isOpen, onClose, title, children }) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-100">{title}</h3>
              <button className="btn-icon btn-icon-danger" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ── Account Form ──────────────────────────────────────────────────── */
export function AccountForm({ onSave, onClose, initialData = {}, suppliers = [], isEdit = false }) {
  const [form, setForm] = useState({
    platform:    initialData.platform    || 'Netflix',
    email:       initialData.email       || '',
    password:    initialData.password    || '',
    access:      initialData.access      || '',
    supplierId:  initialData.supplierId  || suppliers[0]?.id || '',
    cost:        initialData.cost        || '',
    expiryDate:  initialData.expiryDate  || '',
    maxProfiles: initialData.maxProfiles || 5,
  })
  const [showPass, setShowPass] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.expiryDate) return
    onSave({ ...form, maxProfiles: Number(form.maxProfiles), cost: Number(form.cost) || 0 })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">Plataforma</label>
          <select className="form-select" value={form.platform} onChange={e => set('platform', e.target.value)}>
            {['Netflix','Disney+','HBO Max','Prime Video','Crunchyroll','Movistar+'].map(p =>
              <option key={p}>{p}</option>
            )}
          </select>
        </div>

        <div className="col-span-2">
          <label className="form-label">Correo de la cuenta</label>
          <input type="email" required className="form-input" placeholder="cuenta@gmail.com"
            value={form.email} onChange={e => set('email', e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className="form-label">Contraseña</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} required className="form-input"
              style={{ paddingRight: '2.5rem' }} placeholder="••••••••"
              value={form.password} onChange={e => set('password', e.target.value)}
            />
            <button type="button"
              className="btn-icon absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowPass(v => !v)}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {form.platform === 'Disney+' && (
          <div className="col-span-2">
            <label className="form-label">Acceso Disney+</label>
            <input type="text" className="form-input" placeholder="Código de acceso"
              value={form.access} onChange={e => set('access', e.target.value)} />
            <p className="text-[11px] text-slate-600 mt-1">Se enviará al cliente junto con sus credenciales.</p>
          </div>
        )}

        <div className="col-span-2">
          <SmartDateInput
            label="Vence cuenta"
            value={form.expiryDate}
            onChange={v => set('expiryDate', v)}
            required
          />
        </div>

        {!isEdit && (
          <div>
            <label className="form-label">N° perfiles</label>
            <input type="number" min="1" max="10" className="form-input"
              value={form.maxProfiles} onChange={e => set('maxProfiles', e.target.value)} />
          </div>
        )}

        <div>
          <label className="form-label">Costo (S/.)</label>
          <input type="number" min="0" step="0.01" className="form-input" placeholder="0.00"
            value={form.cost} onChange={e => set('cost', e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className="form-label">Proveedor</label>
          <select className="form-select" value={form.supplierId} onChange={e => set('supplierId', e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">
          <Save size={15} /> Guardar
        </button>
      </div>
    </form>
  )
}

/* ── Assign / Edit client Form ─────────────────────────────────────── */
export function AssignClientForm({ onSave, onClose, initialData = {}, platformName = '', platformPrice = 0 }) {
  const { accounts, savedClients } = useApp()
  const isNewAssignment = !initialData.clientName

  const [form, setForm] = useState({
    clientName: initialData.clientName || '',
    phone:      initialData.phone      || '',
    pin:        initialData.pin        || '',
    expiryDate: initialData.expiryDate || '',
  })
  const [search,      setSearch]      = useState('')
  const [saleType,    setSaleType]    = useState('sale')     // 'sale'|'replacement'|'gift'  (nueva asignación)
  const [isRenewal,   setIsRenewal]   = useState(false)      // renovación en modo edición
  const [saleAmount,  setSaleAmount]  = useState(platformPrice || 0)

  // Sincronizar monto si cambia el precio de plataforma desde fuera
  useState(() => { setSaleAmount(platformPrice || 0) }, [platformPrice])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Clientes existentes únicos (por teléfono) para autocomplete
  const existingClients = useMemo(() => {
    const map = new Map()
    accounts.forEach(acc => acc.profiles.forEach(p => {
      if (!p.clientName) return
      const key = p.phone?.replace(/\D/g,'') || p.clientName.toLowerCase()
      if (!map.has(key)) map.set(key, { name: p.clientName, phone: p.phone || '' })
    }))
    ;(savedClients || []).forEach(c => {
      const key = c.phone?.replace(/\D/g,'') || c.name?.toLowerCase()
      if (key && !map.has(key)) map.set(key, { name: c.name, phone: c.phone || '' })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [accounts, savedClients])

  const suggestions = useMemo(() => {
    if (search.length < 2) return []
    const q = search.toLowerCase()
    return existingClients
      .filter(c => c.name.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 6)
  }, [search, existingClients])

  const pickClient = (c) => {
    setForm(f => ({ ...f, clientName: c.name, phone: c.phone }))
    setSearch('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.expiryDate) return
    let extra = {}
    if (isNewAssignment) {
      extra = {
        saleType,
        saleAmount: saleType === 'sale' ? Number(saleAmount) || 0 : 0,
      }
    } else {
      extra = {
        saleType:   isRenewal ? 'renewal' : 'edit',
        renewAmount: isRenewal ? Number(saleAmount) || 0 : 0,
      }
    }
    onSave({ ...form, ...extra })
  }

  const SALE_OPTS = [
    { v: 'sale',        l: 'Compra',    desc: 'Registra ingreso',   color: '#4ade80' },
    { v: 'replacement', l: 'Reemplazo', desc: 'Sin registro',       color: '#94a3b8' },
    { v: 'gift',        l: 'Regalo',    desc: 'Sin registro',       color: '#94a3b8' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ── Buscar cliente existente ── */}
      <div>
        <label className="form-label">Buscar cliente existente</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input type="text" className="form-input" style={{ paddingLeft:'2.25rem' }}
            placeholder="Escribe nombre o celular…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-1 rounded-xl border border-white/10 overflow-hidden"
            style={{ background:'#111827' }}>
            {suggestions.map((c, i) => (
              <button key={i} type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.07] transition-colors border-b border-white/[0.05] last:border-0"
                onClick={() => pickClient(c)}>
                <User size={13} className="text-indigo-400 flex-shrink-0"/>
                <div>
                  <p className="text-sm text-slate-200 font-medium">{c.name}</p>
                  {c.phone && <p className="text-xs text-slate-500 font-mono">{c.phone}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        {search.length >= 2 && suggestions.length === 0 && (
          <p className="text-xs text-slate-600 mt-1">No encontrado — registra como nuevo</p>
        )}
      </div>

      <div className="border-t border-white/[0.05] pt-3">
        <div>
          <label className="form-label">Nombre del cliente</label>
          <input type="text" required className="form-input" placeholder="Nombre completo"
            value={form.clientName} onChange={e => set('clientName', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="form-label">Celular (WhatsApp)</label>
        <input type="tel" className="form-input" placeholder="519XXXXXXXX"
          value={form.phone} onChange={e => set('phone', e.target.value)} />
        <p className="text-xs text-slate-600 mt-1">Con código de país sin + (ej: 51987654321)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">PIN del perfil</label>
          <input type="text" maxLength="6" className="form-input font-mono" placeholder="0000"
            value={form.pin} onChange={e => set('pin', e.target.value)} />
        </div>
        <div>
          <SmartDateInput
            label="Vencimiento"
            value={form.expiryDate}
            onChange={v => set('expiryDate', v)}
            required
          />
        </div>
      </div>

      {/* ── Tipo de operación (nueva asignación) ── */}
      {isNewAssignment && (
        <div className="border-t border-white/[0.05] pt-3 space-y-2">
          <label className="form-label">Tipo de operación</label>
          <div className="flex gap-2">
            {SALE_OPTS.map(o => (
              <button key={o.v} type="button"
                onClick={() => setSaleType(o.v)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: saleType === o.v ? `${o.color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${saleType === o.v ? o.color + '60' : 'rgba(255,255,255,0.07)'}`,
                  color: saleType === o.v ? o.color : '#64748b',
                }}>
                {o.l}
                <span style={{ color:'#475569', fontWeight:400, fontSize:'10px' }}>{o.desc}</span>
              </button>
            ))}
          </div>
          {saleType === 'sale' && (
            <div>
              <label className="form-label">Monto cobrado (S/.)</label>
              <input type="number" min="0" step="0.5" className="form-input"
                value={saleAmount}
                onChange={e => setSaleAmount(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* ── Opción renovación (edición de cliente existente) ── */}
      {!isNewAssignment && (
        <div className="border-t border-white/[0.05] pt-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setIsRenewal(v => !v)}
              className="w-9 h-5 rounded-full transition-all flex-shrink-0 relative cursor-pointer"
              style={{ background: isRenewal ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)', border: `1px solid ${isRenewal ? '#4ade80' : 'rgba(255,255,255,0.1)'}` }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                style={{ background: isRenewal ? '#4ade80' : '#475569', left: isRenewal ? '18px' : '2px' }}/>
            </div>
            <span className="text-sm text-slate-300">Registrar como renovación</span>
          </label>
          {isRenewal && (
            <div className="mt-2">
              <label className="form-label">Monto cobrado (S/.)</label>
              <input type="number" min="0" step="0.5" className="form-input"
                value={saleAmount}
                onChange={e => setSaleAmount(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">
          <Save size={15} /> Guardar
        </button>
      </div>
    </form>
  )
}

/* ── Password Change Form ──────────────────────────────────────────── */
// Paso 1: ingresar nueva clave  → Paso 2: confirmar + notificar clientes por WA
async function trySendViaWAServer(messages) {
  try {
    const token = localStorage.getItem('token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    const r = await fetch('/api/wa/status', { headers })
    if (!r.ok) return false
    const { status } = await r.json()
    if (status !== 'connected') return false
    const s = await fetch('/api/wa/send-bulk', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
    })
    return s.ok
  } catch { return false }
}

export function PasswordChangeForm({ onSave, onClose, currentPassword = '', account = null }) {
  const [newPass,   setNewPass]   = useState(currentPassword)
  const [show,      setShow]      = useState(true)
  const [sending,   setSending]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [sentCount, setSentCount] = useState(0)

  const clients = (account?.profiles || []).filter(p => p.clientName && p.phone?.replace(/\D/g,''))
  const noPhone  = (account?.profiles || []).filter(p => p.clientName && !p.phone?.replace(/\D/g,''))

  const buildMsg = (p) =>
    `Hola *${p.clientName}*! 🔑 Actualizamos la clave de *${account?.platform}*:\n\n` +
    `📧 Correo: ${account?.email}\n🔑 Nueva clave: ${newPass}\n📌 Perfil ${p.number} · PIN: ${p.pin}\n\n¡Que lo disfrutes! 😊`

  const handleSaveOnly = (e) => {
    e.preventDefault()
    onSave(newPass)
    setDone(true)
  }

  const handleSaveAndNotify = async (e) => {
    e.preventDefault()
    onSave(newPass)
    setSending(true)
    const messages = clients.map(p => ({ phone: p.phone.replace(/\D/g,''), text: buildMsg(p) }))
    const serverOk = await trySendViaWAServer(messages)
    setSentCount(serverOk ? messages.length : 0)
    setSending(false)
    setDone(true)
  }

  if (sending) return (
    <div className="py-8 flex flex-col items-center gap-4">
      <Loader2 size={44} className="text-indigo-400 animate-spin"/>
      <p className="font-bold text-slate-200">Enviando credenciales…</p>
    </div>
  )

  if (done) return (
    <div className="py-6 flex flex-col items-center gap-4 text-center">
      <CheckCircle size={48} className="text-emerald-400"/>
      <p className="font-bold text-lg">¡Listo!</p>
      <p className="text-sm text-slate-400">
        {sentCount > 0
          ? `Clave guardada y notificada a ${sentCount} cliente${sentCount !== 1 ? 's' : ''} por WhatsApp.`
          : clients.length > 0
          ? 'Clave guardada. WhatsApp no conectado — conecta en Cobros WA para notificar.'
          : 'Clave guardada correctamente.'}
      </p>
      <button className="btn-primary" onClick={onClose}>Cerrar</button>
    </div>
  )

  return (
    <form className="space-y-4">
      {/* Nueva clave */}
      <div>
        <label className="form-label">Nueva contraseña</label>
        <div className="relative">
          <input type={show ? 'text' : 'password'} required className="form-input font-mono"
            style={{ paddingRight:'2.5rem' }}
            value={newPass} onChange={e => setNewPass(e.target.value)}/>
          <button type="button" className="btn-icon absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setShow(v => !v)}>
            {show ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        </div>
      </div>

      {/* Clientes afectados */}
      {(clients.length > 0 || noPhone.length > 0) && (
        <div>
          <p className="form-label mb-1.5">
            Clientes afectados · <span className="text-emerald-500">{clients.length} con WA</span>
            {noPhone.length > 0 && <span className="text-slate-600"> · {noPhone.length} sin celular</span>}
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {clients.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.03]">
                <User size={11} className="text-indigo-400 flex-shrink-0"/>
                <span className="text-sm text-slate-300 flex-1">{p.clientName}</span>
                <span className="text-[10px] font-mono text-slate-500">P{p.number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones — todo en una pantalla */}
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1 text-xs" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-secondary flex-1 text-xs"
          onClick={handleSaveOnly} disabled={!newPass}>
          <Save size={13}/> Solo guardar
        </button>
        <button type="button" className="btn-primary flex-1 text-xs"
          onClick={handleSaveAndNotify}
          disabled={!newPass || clients.length === 0}
          style={{ background:'linear-gradient(135deg,#128c7e,#25d366)' }}>
          <MessageSquare size={13}/> Guardar + WA ({clients.length})
        </button>
      </div>
    </form>
  )
}
