import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Edit2, Save, Truck, Copy, MessageSquare,
  ChevronDown, ChevronUp, AlertTriangle, Bell
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal } from './Modals'

const PLATFORM_CLASS = {
  'Netflix':'plat-netflix', 'Disney+':'plat-disney', 'HBO Max':'plat-hbo',
  'Prime Video':'plat-prime', 'Crunchyroll':'plat-crunchyroll', 'Movistar+':'plat-movistar',
}

/* ── Supplier form ─────────────────────────────────────────────────── */
function SupplierForm({ onSave, onClose, initialData = {} }) {
  const [form, setForm] = useState({ name: initialData.name || '', contact: initialData.contact || '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
      <div>
        <label className="form-label">Nombre del proveedor</label>
        <input type="text" required className="form-input" placeholder="Ej: Juan Streaming"
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div>
        <label className="form-label">WhatsApp / Celular</label>
        <input type="tel" className="form-input" placeholder="519XXXXXXXX"
          value={form.contact} onChange={e => set('contact', e.target.value)} />
        <p className="text-xs text-slate-600 mt-1">Con código de país sin + (ej: 51987654321)</p>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1"><Save size={15} /> Guardar</button>
      </div>
    </form>
  )
}

/* ── Expiring accounts section per supplier ────────────────────────── */
function SupplierExpiringSection({ supplier, accounts, getSubscriptionStatus }) {
  const [open, setOpen] = useState(false)

  const expiring = accounts
    .filter(a => a.supplierId === supplier.id)
    .filter(a => {
      const st = getSubscriptionStatus(a.expiryDate)
      return st === 'expired' || st === 'today'
    })

  if (expiring.length === 0) return null

  // Build WA message for the supplier
  const buildSupplierMsg = () => {
    const lines = expiring.map(a => {
      const clients = a.profiles.filter(p => p.clientName).length
      return `• *${a.platform}* (${a.email}) — vence: ${a.expiryDate} — ${clients} cliente${clients !== 1 ? 's' : ''}`
    })
    return (
      `Hola *${supplier.name}*! 👋 Las siguientes cuentas están vencidas o vencen hoy y necesitan renovación:\n\n` +
      lines.join('\n') +
      `\n\nPor favor confirmar la renovación. ¡Gracias! 🙏`
    )
  }

  const waPhone = supplier.contact?.replace(/\D/g, '')
  const waHref  = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(buildSupplierMsg())}`
    : null

  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border:'1px solid rgba(245,158,11,0.2)', background:'rgba(245,158,11,0.04)' }}>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-amber-400">
          <AlertTriangle size={13} />
          {expiring.length} cuenta{expiring.length !== 1 ? 's' : ''} vence{expiring.length !== 1 ? 'n' : ''} hoy / vencida{expiring.length !== 1 ? 's' : ''}
        </span>
        {open ? <ChevronUp size={13} className="text-amber-400" /> : <ChevronDown size={13} className="text-amber-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {expiring.map(acc => {
                const platClass = PLATFORM_CLASS[acc.platform] || 'plat-default'
                const clientCount = acc.profiles.filter(p => p.clientName).length
                return (
                  <div key={acc.id} className="flex items-center gap-2 py-1 border-b border-white/[0.04] last:border-0">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${platClass}`}>{acc.platform}</span>
                    <span className="text-xs text-slate-400 flex-1 truncate font-mono">{acc.email}</span>
                    <span className="text-[10px] text-slate-600">{acc.expiryDate}</span>
                    <span className="text-[10px] text-slate-500">{clientCount} cliente{clientCount !== 1 ? 's' : ''}</span>
                  </div>
                )
              })}

              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full justify-center !py-2 !text-xs mt-2"
                  style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)' }}
                >
                  <MessageSquare size={13} /> Avisar a {supplier.name} por WhatsApp
                </a>
              )}
              {!waHref && (
                <p className="text-xs text-slate-600 text-center py-1">Sin celular registrado para enviar WA</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────────────────── */
export default function SuppliersView() {
  const { suppliers, accounts, addSupplier, updateSupplier, deleteSupplier, copyToClipboard, getSubscriptionStatus } = useApp()
  const [addModal, setAddModal]   = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null) // supplierId en espera de confirmación

  const getAccountCount   = (id) => accounts.filter(a => a.supplierId === id).length
  const getExpiringCount  = (id) => accounts.filter(a => a.supplierId === id && ['expired','today'].includes(getSubscriptionStatus(a.expiryDate))).length

  const handleDeleteClick = (id) => {
    if (confirmDel !== id) {
      setConfirmDel(id)
      setTimeout(() => setConfirmDel(null), 3000)
      return
    }
    deleteSupplier(id)
    setConfirmDel(null)
  }

  // Global alert: how many accounts need renewal today
  const totalExpiring = accounts.filter(a => ['expired','today'].includes(getSubscriptionStatus(a.expiryDate))).length

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proveedores</h2>
          <p className="text-slate-500 text-sm mt-0.5">{suppliers.length} proveedores registrados</p>
        </div>
        <button className="btn-primary" onClick={() => setAddModal(true)}>
          <Plus size={16} /> Nuevo proveedor
        </button>
      </div>

      {/* ── Global alert ── */}
      {totalExpiring > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)' }}
        >
          <Bell size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-bold">{totalExpiring} cuenta{totalExpiring !== 1 ? 's' : ''}</span> vence{totalExpiring !== 1 ? 'n' : ''} hoy o ya vencieron.
            Avisa a tus proveedores para renovar.
          </p>
        </motion.div>
      )}

      {/* ── Cards ── */}
      {suppliers.length === 0 && (
        <div className="glass-card text-center py-16 text-slate-600">
          <Truck size={40} className="mx-auto mb-3 opacity-20" />
          <p>No hay proveedores registrados.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((sup, idx) => {
          const accsCount = getAccountCount(sup.id)
          const expiringCount = getExpiringCount(sup.id)
          const waPhone = sup.contact?.replace(/\D/g, '')

          return (
            <motion.div key={sup.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="glass-card flex flex-col gap-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                    <Truck size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200">{sup.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{sup.contact || 'Sin celular'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="btn-icon btn-icon-indigo" onClick={() => setEditItem(sup)} title="Editar">
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="btn-icon btn-icon-danger"
                    title={confirmDel === sup.id ? 'Clic de nuevo para confirmar' : 'Eliminar'}
                    style={confirmDel === sup.id ? { background:'rgba(239,68,68,0.15)', color:'#f87171' } : {}}
                    onClick={() => handleDeleteClick(sup.id)}
                  >
                    {confirmDel === sup.id
                      ? <span style={{ fontSize:'9px', fontWeight:700 }}>¿OK?</span>
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-xl font-bold text-indigo-400">{accsCount}</span>
                  <span className="text-[10px] text-slate-600">Cuentas</span>
                </div>
                <div className="flex flex-col items-center py-2 rounded-xl"
                  style={{ background: expiringCount > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)', border: expiringCount > 0 ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                  <span className={`text-xl font-bold ${expiringCount > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{expiringCount}</span>
                  <span className="text-[10px] text-slate-600">Vencen hoy</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {sup.contact && (
                  <button className="btn-ghost flex-1 text-xs"
                    onClick={() => copyToClipboard(sup.contact, 'Celular')}>
                    <Copy size={12} /> Copiar
                  </button>
                )}
                {waPhone && (
                  <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost flex-1 text-xs" style={{ color:'#25d366' }}>
                    <MessageSquare size={12} /> WhatsApp
                  </a>
                )}
              </div>

              {/* Expiring accounts expandable */}
              <SupplierExpiringSection
                supplier={sup}
                accounts={accounts}
                getSubscriptionStatus={getSubscriptionStatus}
              />
            </motion.div>
          )
        })}
      </div>

      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Nuevo proveedor">
        <SupplierForm onSave={(data) => { addSupplier(data); setAddModal(false) }} onClose={() => setAddModal(false)} />
      </Modal>

      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title={`Editar: ${editItem?.name}`}>
        <SupplierForm
          initialData={editItem || {}}
          onSave={(data) => { updateSupplier(editItem.id, data); setEditItem(null) }}
          onClose={() => setEditItem(null)}
        />
      </Modal>
    </div>
  )
}
