import { useState, useEffect, useCallback } from 'react'
import Pagination from './Pagination'
import { motion } from 'framer-motion'
import {
  Copy, Key, Plus, Trash2, Search, Eye, EyeOff,
  LogOut, MessageSquare, User, ChevronDown, ChevronUp, Edit2,
  Users, UserCheck, Loader2, CheckCheck
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Modal, AccountForm, AssignClientForm, PasswordChangeForm } from './Modals'

const PLATFORM_CLASS = {
  'Netflix':'plat-netflix','Disney+':'plat-disney','HBO Max':'plat-hbo',
  'Prime Video':'plat-prime','Crunchyroll':'plat-crunchyroll','Movistar+':'plat-movistar',
}
const STATUS_BADGE = { expired:'badge-expired',today:'badge-today',soon:'badge-soon',active:'badge-active',available:'badge-available' }
const STATUS_LABEL = { expired:'Vencido',today:'Hoy',soon:'Próximo',active:'Activo',available:'Libre' }

/* ── Account card ─────────────────────────────────────────────────── */
function AccountCard({ account }) {
  const {
    copyToClipboard, deleteAccount, updateAccount,
    assignClientToProfile, releaseProfile,
    markPasswordChanged, setFullAccount,
    getSubscriptionStatus, getSupplierName,
    suppliers, showToast,
    addProfile, deleteProfile, patchProfile,
    getPlatformPrice, getPlatformResellerPrice,
  } = useApp()

  const [addingProfile,  setAddingProfile]  = useState(false)
  const [newProfNum,     setNewProfNum]     = useState(1)
  const [confirmDelProf, setConfirmDelProf] = useState(null)
  const [editingPin,     setEditingPin]     = useState(null)
  const [pinValue,       setPinValue]       = useState('')

  const handleDeleteProfile = (profile) => {
    if (confirmDelProf === profile.id) {
      deleteProfile(account.id, profile.id)
      setConfirmDelProf(null)
    } else {
      setConfirmDelProf(profile.id)
      setTimeout(() => setConfirmDelProf(null), 3000)
    }
  }

  const [showPass, setShowPass]       = useState(false)
  const [waSending, setWaSending]     = useState(new Set())
  const [waSent,    setWaSent]        = useState(new Set())

  const sendWA = useCallback(async (profile) => {
    const phone = profile.phone?.replace(/\D/g,'')
    if (!phone) { showToast('Sin número de teléfono', 'warning'); return }
    setWaSending(prev => new Set([...prev, profile.id]))
    try {
      const token = localStorage.getItem('token')
      const text  =
        `Hola *${profile.clientName}*! 🎬\n\n` +
        `Tus datos de *${account.platform}*:\n` +
        `📧 Correo: ${account.email}\n` +
        `🔑 Contraseña: ${account.password}\n` +
        (['Disney+', 'HBO Max'].includes(account.platform) && account.access ? `🔑 Acceso: ${account.access}\n` : '') +
        `👤 Perfil ${profile.number} · PIN: *${profile.pin}*\n` +
        `📅 Vencimiento: ${profile.expiryDate}\n\n` +
        `¡Disfruta tu suscripción! 🚀`
      const res = await fetch('/api/wa/send-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ messages: [{ phone, text }] }),
      })
      if (res.ok) {
        setWaSent(prev => new Set([...prev, profile.id]))
        showToast(`Enviado a ${profile.clientName} ✓`, 'success')
        setTimeout(() => setWaSent(prev => { const n = new Set(prev); n.delete(profile.id); return n }), 4000)
      } else {
        showToast('WhatsApp no conectado', 'error')
      }
    } catch { showToast('Error al enviar', 'error') }
    finally { setWaSending(prev => { const n = new Set(prev); n.delete(profile.id); return n }) }
  }, [account, showToast])
  const [expanded, setExpanded]       = useState(true)
  const [assignModal, setAssignModal] = useState(false)
  const [editModal, setEditModal]     = useState(false)
  const [editAccModal, setEditAccModal] = useState(false)   // editar cuenta
  const [passModal, setPassModal]     = useState(false)
  const [selProfile, setSelProfile]   = useState(null)
  const [confirmDel, setConfirmDel]   = useState(false)
  const [confirmRel, setConfirmRel]   = useState(null)
  // full account
  const [fullModal, setFullModal]     = useState(false)     // asignar cliente completo
  const [editFullModal, setEditFullModal] = useState(false) // editar cliente completo

  /* Perfil handlers */
  const openAssign = (p) => { setSelProfile(p); setAssignModal(true) }
  const openEdit   = (p) => { setSelProfile(p); setEditModal(true) }

  const handleAssign = (data) => { assignClientToProfile(account.id, selProfile.id, data); setAssignModal(false) }
  const handleEdit   = (data) => { assignClientToProfile(account.id, selProfile.id, data); setEditModal(false) }
  // onSave solo guarda la clave; PasswordChangeForm llama a onClose cuando termina todo
  const handlePassSave = (pw) => { markPasswordChanged(account.id, pw) }

  /* Editar cuenta completa (correo, clave, plataforma, etc.) */
  const handleEditAccount = (data) => {
    // updateAccount solo actualiza los campos enviados, no toca perfiles
    const { profiles: _p, ...rest } = data  // descartamos profiles si viniera
    updateAccount(account.id, rest)
    setEditAccModal(false)
  }

  /* Doble-clic delete */
  const handleDeleteClick = () => {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return }
    deleteAccount(account.id)
  }
  const handleReleaseClick = (p) => {
    if (confirmRel !== p.id) { setConfirmRel(p.id); setTimeout(() => setConfirmRel(null), 3000); return }
    releaseProfile(account.id, p.id); setConfirmRel(null)
  }

  /* Full-account toggle */
  const toggleFullAccount = () => {
    if (!account.isFullAccount) {
      // Activar: abrir modal para asignar cliente
      setFullModal(true)
    } else {
      // Desactivar: volver a modo perfiles (guarda los datos del cliente)
      setFullAccount(account.id, false)
    }
  }
  const handleFullAssign = (data) => {
    setFullAccount(account.id, true, data)
    setFullModal(false)
  }
  const handleFullEdit = (data) => {
    setFullAccount(account.id, true, data)
    setEditFullModal(false)
  }
  const handleFullRelease = () => {
    setFullAccount(account.id, true, {})
  }

  const platClass     = PLATFORM_CLASS[account.platform] || 'plat-default'
  const occupiedCount = account.profiles.filter(p => p.clientName && p.status !== 'available').length
  const buildPassMsg  = (p) => encodeURIComponent(
    `Hola *${p.clientName}*, actualizamos la contraseña de *${account.platform}*.\n\n` +
    `📧 Correo: ${account.email}\n🔑 Nueva clave: ${account.password}\n📌 Perfil ${p.number} · PIN: ${p.pin}\n\n¡Gracias! 😊`
  )
  const buildFullPassMsg = () => encodeURIComponent(
    `Hola *${account.fullClient?.clientName}*, actualizamos la contraseña de *${account.platform}*.\n\n` +
    `📧 Correo: ${account.email}\n🔑 Nueva clave: ${account.password}\n\n¡Gracias! 😊`
  )

  const fullStatus = account.fullClient?.expiryDate
    ? getSubscriptionStatus(account.fullClient.expiryDate)
    : 'available'
  const fullPhone = account.fullClient?.phone?.replace(/\D/g,'')

  return (
    <motion.div layout initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }}
      className="glass-card !p-0 overflow-hidden"
      style={account.isDown ? { borderColor:'rgba(239,68,68,0.4)', boxShadow:'0 0 0 1px rgba(239,68,68,0.2)' } : {}}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold flex-shrink-0 ${platClass}`}>
          {account.platform}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate">{account.email}</p>
        </div>

        {/* Cuenta completa toggle */}
        <button
          onClick={toggleFullAccount}
          title={account.isFullAccount ? 'Volver a modo perfiles' : 'Marcar como cuenta completa'}
          className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all"
          style={account.isFullAccount
            ? { background:'rgba(16,185,129,0.15)', color:'#34d399', border:'1px solid rgba(16,185,129,0.3)' }
            : { background:'rgba(255,255,255,0.04)', color:'#475569', border:'1px solid rgba(255,255,255,0.08)' }
          }
        >
          {account.isFullAccount ? <UserCheck size={11}/> : <Users size={11}/>}
          <span className="hidden sm:inline">{account.isFullAccount ? 'Completa' : 'Completa'}</span>
        </button>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!account.isFullAccount && (
            <span className="text-[11px] text-slate-600 mr-1">{occupiedCount}/{account.profiles.length}</span>
          )}
          {/* Caída toggle */}
          <button
            title={account.isDown ? 'Marcar como recuperada' : 'Marcar como caída'}
            className="btn-icon"
            style={account.isDown ? { color:'#f87171', background:'rgba(239,68,68,0.12)' } : { color:'#374151' }}
            onClick={() => updateAccount(account.id, { isDown: !account.isDown })}>
            ⚠️
          </button>
          {/* Editar cuenta */}
          <button className="btn-icon btn-icon-indigo" title="Editar cuenta" onClick={() => setEditAccModal(true)}>
            <Edit2 size={13} />
          </button>
          <button className="btn-icon btn-icon-warning" title="Cambiar contraseña" onClick={() => setPassModal(true)}>
            <Key size={14} />
          </button>
          <button className="btn-icon btn-icon-danger" title="Eliminar cuenta"
            style={confirmDel ? { background:'rgba(239,68,68,0.15)', color:'#f87171' } : {}}
            onClick={handleDeleteClick}>
            {confirmDel
              ? <span style={{fontSize:'9px',fontWeight:700}}>¿OK?</span>
              : <Trash2 size={14} />
            }
          </button>
          <button className="btn-icon" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* ── Credentials ── */}
          <div className="cred-row">
            <span className="cred-label">Correo</span>
            <span className="cred-value revealed">{account.email}</span>
            <button className="btn-icon btn-icon-indigo flex-shrink-0" title="Copiar correo"
              onClick={() => copyToClipboard(account.email,'Correo')}><Copy size={13}/></button>
          </div>
          <div className="cred-row">
            <span className="cred-label">Clave</span>
            <span className={`cred-value ${showPass?'revealed':''}`}>
              {showPass ? account.password : '••••••••'}
            </span>
            <button className="btn-icon flex-shrink-0" onClick={() => setShowPass(v=>!v)}>
              {showPass ? <EyeOff size={13}/> : <Eye size={13}/>}
            </button>
            {showPass && (
              <button className="btn-icon btn-icon-indigo flex-shrink-0" title="Copiar clave"
                onClick={() => copyToClipboard(account.password,'Contraseña')}><Copy size={13}/></button>
            )}
          </div>
          {['Disney+', 'HBO Max'].includes(account.platform) && account.access && (
            <div className="cred-row">
              <span className="cred-label">Acceso</span>
              <span className="cred-value revealed">{account.access}</span>
              <button className="btn-icon btn-icon-indigo flex-shrink-0" title="Copiar acceso"
                onClick={() => copyToClipboard(account.access,'Acceso')}><Copy size={13}/></button>
            </div>
          )}
          <div className="cred-row">
            <span className="cred-label">Vence</span>
            <span className="cred-value revealed">{account.expiryDate}</span>
            {account.cost > 0 && <span className="text-xs text-slate-600 font-mono mr-2">S/.{account.cost}</span>}
            <span className="text-xs text-slate-600">{getSupplierName(account.supplierId)}</span>
          </div>

          {/* ── CUENTA COMPLETA: bloque único de cliente ── */}
          {account.isFullAccount ? (
            <div className="p-3 border-t border-white/[0.04]">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5">
                <UserCheck size={11}/> Cuenta completa
              </p>
              {account.fullClient?.clientName ? (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-200 flex items-center gap-1.5">
                      <UserCheck size={13} className="text-emerald-400"/>
                      {account.fullClient.clientName}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {account.fullClient.phone && (
                        <span className="text-xs font-mono text-slate-500">{account.fullClient.phone}</span>
                      )}
                      {account.fullClient.expiryDate && (
                        <span className={`badge ${STATUS_BADGE[fullStatus]}`}>
                          {STATUS_LABEL[fullStatus]} · {account.fullClient.expiryDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="btn-icon btn-icon-indigo" title="Copiar correo"
                      style={{width:'1.6rem',height:'1.6rem'}}
                      onClick={() => copyToClipboard(account.email,'Correo')}>
                      <Copy size={11}/>
                    </button>
                    {fullPhone && (
                      <a href={`https://wa.me/${fullPhone}?text=${buildFullPassMsg()}`}
                        target="_blank" rel="noopener noreferrer"
                        className="btn-icon btn-icon-wa" style={{width:'1.6rem',height:'1.6rem'}}
                        title="WhatsApp">
                        <MessageSquare size={11}/>
                      </a>
                    )}
                    <button className="btn-icon btn-icon-indigo" title="Editar cliente"
                      style={{width:'1.6rem',height:'1.6rem'}}
                      onClick={() => setEditFullModal(true)}>
                      <Edit2 size={11}/>
                    </button>
                    <button className="btn-icon btn-icon-danger" title="Quitar cliente"
                      style={{width:'1.6rem',height:'1.6rem'}}
                      onClick={handleFullRelease}>
                      <LogOut size={11}/>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold text-emerald-500 hover:text-emerald-400 transition-colors"
                  style={{ border:'1px dashed rgba(16,185,129,0.25)' }}
                  onClick={() => setFullModal(true)}>
                  <Plus size={14}/> Asignar cliente de cuenta completa
                </button>
              )}
            </div>
          ) : (
            /* ── PERFILES NORMALES ── */
            <div className="p-3 border-t border-white/[0.04]">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 px-1">Perfiles</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {account.profiles.map(profile => {
                  const isOccupied = !!profile.clientName
                  const status   = isOccupied ? getSubscriptionStatus(profile.expiryDate) : 'available'
                  const waPhone  = profile.phone?.replace(/\D/g,'')
                  return (
                    <div key={profile.id}
                      className={`profile-slot ${profile.clientName?'occupied':'available'}`}
                      style={profile.needsPinChange ? {borderColor:'rgba(245,158,11,0.5)',background:'rgba(245,158,11,0.04)'} : {}}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Perfil {profile.number}
                        </span>
                        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
                      </div>
                      {profile.clientName ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 min-w-0">
                              <User size={12} className="text-indigo-400 flex-shrink-0"/>
                              <span className="truncate">{profile.clientName}</span>
                            </p>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <button className="btn-icon btn-icon-indigo" title="Editar cliente"
                                style={{width:'1.6rem',height:'1.6rem'}} onClick={() => openEdit(profile)}>
                                <Edit2 size={11}/>
                              </button>
                              <button className="btn-icon btn-icon-indigo" title="Copiar PIN"
                                style={{width:'1.6rem',height:'1.6rem'}}
                                onClick={() => copyToClipboard(profile.pin,'PIN')}>
                                <Copy size={11}/>
                              </button>
                              {waPhone && (
                                <button
                                  className={`btn-icon ${waSent.has(profile.id) ? 'btn-icon-success' : 'btn-icon-wa'}`}
                                  title={waSent.has(profile.id) ? 'Enviado ✓' : 'Enviar por WhatsApp'}
                                  style={{width:'1.6rem',height:'1.6rem'}}
                                  disabled={waSending.has(profile.id)}
                                  onClick={() => sendWA(profile)}>
                                  {waSending.has(profile.id)
                                    ? <Loader2 size={11} className="animate-spin"/>
                                    : waSent.has(profile.id)
                                    ? <CheckCheck size={11}/>
                                    : <MessageSquare size={11}/>
                                  }
                                </button>
                              )}
                              <button className="btn-icon btn-icon-danger" title="Liberar perfil"
                                style={{
                                  width:'1.6rem',height:'1.6rem',
                                  ...(confirmRel===profile.id?{background:'rgba(239,68,68,0.15)',color:'#f87171'}:{})
                                }}
                                onClick={() => handleReleaseClick(profile)}>
                                {confirmRel===profile.id
                                  ? <span style={{fontSize:'8px',fontWeight:700}}>¿OK?</span>
                                  : <LogOut size={11}/>
                                }
                              </button>
                              <button
                                title={confirmDelProf===profile.id ? '¿Eliminar perfil?' : 'Eliminar perfil'}
                                style={{
                                  width:'1.6rem', height:'1.6rem',
                                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                                  borderRadius:'0.5rem', border:'none', cursor:'pointer',
                                  background: confirmDelProf===profile.id ? 'rgba(239,68,68,0.2)' : 'transparent',
                                  color: confirmDelProf===profile.id ? '#f87171' : '#374151',
                                  transition:'all 0.15s',
                                }}
                                onClick={() => handleDeleteProfile(profile)}>
                                {confirmDelProf===profile.id
                                  ? <span style={{fontSize:'7px',fontWeight:800}}>DEL</span>
                                  : <Trash2 size={10}/>
                                }
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-500">
                              PIN: <span className="font-mono font-bold text-slate-300">{profile.pin}</span>
                            </span>
                            {profile.phone && <span className="text-xs font-mono text-slate-600">{profile.phone}</span>}
                            <span className="text-xs text-slate-600">{profile.expiryDate}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {/* Alerta de PIN pendiente */}
                          {profile.needsPinChange && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-amber-400">⚠️ Cambiar PIN antes de vender</span>
                              <button className="text-[10px] text-slate-600 hover:text-slate-400"
                                onClick={() => patchProfile(account.id, profile.id, { needsPinChange: 0 })}>
                                ✓ Listo
                              </button>
                            </div>
                          )}
                          {/* PIN editable */}
                          {editingPin === profile.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                className="form-input !py-0.5 !px-2 text-xs font-mono w-20"
                                value={pinValue}
                                maxLength={6}
                                onChange={e => setPinValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { patchProfile(account.id, profile.id, { pin: pinValue }); setEditingPin(null) }
                                  if (e.key === 'Escape') setEditingPin(null)
                                }}
                                autoFocus
                              />
                              <button className="btn-primary !py-0.5 !px-2 !text-xs"
                                onClick={() => { patchProfile(account.id, profile.id, { pin: pinValue }); setEditingPin(null) }}>
                                OK
                              </button>
                              <button className="btn-ghost !py-0.5 !px-1 !text-xs"
                                onClick={() => setEditingPin(null)}>✕</button>
                            </div>
                          ) : (
                            <button className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                              onClick={() => { setEditingPin(profile.id); setPinValue(profile.pin) }}>
                              <Edit2 size={10}/>
                              PIN: <span className="font-mono font-bold text-slate-400">{profile.pin}</span>
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                          <button
                            className="flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-indigo-500 hover:text-indigo-400 transition-colors"
                            onClick={() => openAssign(profile)}>
                            <Plus size={12}/> Asignar cliente
                          </button>
                          <button
                            title={confirmDelProf===profile.id ? '¿Eliminar?' : 'Eliminar perfil'}
                            style={{
                              width:'1.6rem', height:'1.6rem', flexShrink:0,
                              display:'inline-flex', alignItems:'center', justifyContent:'center',
                              borderRadius:'0.5rem', border:'none', cursor:'pointer',
                              background: confirmDelProf===profile.id ? 'rgba(239,68,68,0.2)' : 'transparent',
                              color: confirmDelProf===profile.id ? '#f87171' : '#374151',
                              transition:'all 0.15s',
                            }}
                            onClick={() => handleDeleteProfile(profile)}>
                            {confirmDelProf===profile.id
                              ? <span style={{fontSize:'7px',fontWeight:800}}>DEL</span>
                              : <Trash2 size={10}/>
                            }
                          </button>
                        </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Agregar perfil extra ── */}
              {!addingProfile ? (
                <button
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-400 transition-colors rounded-lg border border-dashed border-white/[0.06] hover:border-white/[0.12]"
                  onClick={() => { setAddingProfile(true); setNewProfNum(1) }}>
                  <Plus size={11}/> Agregar perfil extra
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs text-slate-500 whitespace-nowrap">Perfil #</span>
                  <select
                    className="form-select text-xs py-1"
                    value={newProfNum}
                    onChange={e => setNewProfNum(Number(e.target.value))}>
                    {Array.from({ length: account.maxProfiles }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>
                        {n} {account.profiles.filter(p => p.number === n).length > 0 ? `(ya existe ×${account.profiles.filter(p => p.number === n).length})` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary !py-1 !px-2 !text-xs whitespace-nowrap"
                    onClick={() => { addProfile(account.id, newProfNum); setAddingProfile(false) }}>
                    Agregar
                  </button>
                  <button className="btn-ghost !py-1 !px-2 !text-xs"
                    onClick={() => setAddingProfile(false)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      <Modal isOpen={assignModal} onClose={() => setAssignModal(false)}
        title={`Asignar cliente → Perfil ${selProfile?.number}`}>
        <AssignClientForm onSave={handleAssign} onClose={() => setAssignModal(false)}
          initialData={selProfile}
          platformName={account.platform}
          platformPrice={getPlatformPrice(account.platform)}
          platformResellerPrice={getPlatformResellerPrice(account.platform)}/>
      </Modal>

      <Modal isOpen={editModal} onClose={() => setEditModal(false)}
        title={`Editar cliente — Perfil ${selProfile?.number}`}>
        <AssignClientForm onSave={handleEdit} onClose={() => setEditModal(false)}
          initialData={selProfile}
          platformName={account.platform}
          platformPrice={getPlatformPrice(account.platform)}
          platformResellerPrice={getPlatformResellerPrice(account.platform)}/>
      </Modal>

      <Modal isOpen={passModal} onClose={() => setPassModal(false)} title="Actualizar contraseña">
        <PasswordChangeForm
          onSave={handlePassSave}
          onClose={() => setPassModal(false)}
          currentPassword={account.password}
          account={account}
        />
      </Modal>

      {/* Editar datos de la cuenta */}
      <Modal isOpen={editAccModal} onClose={() => setEditAccModal(false)} title={`Editar cuenta — ${account.platform}`}>
        <AccountForm
          isEdit
          initialData={account}
          onSave={handleEditAccount}
          onClose={() => setEditAccModal(false)}
          suppliers={suppliers}
        />
      </Modal>

      {/* Asignar cliente completo */}
      <Modal isOpen={fullModal} onClose={() => setFullModal(false)} title="Asignar cliente — Cuenta completa">
        <AssignClientForm
          onSave={handleFullAssign}
          onClose={() => setFullModal(false)}
          initialData={account.fullClient || {}}
        />
      </Modal>

      {/* Editar cliente completo */}
      <Modal isOpen={editFullModal} onClose={() => setEditFullModal(false)} title="Editar cliente — Cuenta completa">
        <AssignClientForm
          onSave={handleFullEdit}
          onClose={() => setEditFullModal(false)}
          initialData={account.fullClient || {}}
        />
      </Modal>
    </motion.div>
  )
}

/* ── AccountsView ─────────────────────────────────────────────────── */
export default function AccountsView() {
  const { accounts, suppliers, addAccount, lastAssigned, updateAccount } = useApp()
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)
  const [showDown,  setShowDown]  = useState(false)
  const [pinnedId,  setPinnedId]  = useState(null)
  const PER_PAGE = 10

  useEffect(() => {
    if (!lastAssigned) return
    setPinnedId(lastAssigned)
    const t = setTimeout(() => setPinnedId(null), 10000)
    return () => clearTimeout(t)
  }, [lastAssigned])
  const [addModal, setAddModal]     = useState(false)
  const [platFilter, setPlatFilter] = useState('all')

  const platforms = ['all', ...new Set(accounts.map(a => a.platform))]

  useEffect(() => { setPage(1) }, [search, platFilter, showDown])

  const freeSlots = (acc) => {
    if (acc.isDown || acc.isFullAccount) return 0
    return acc.profiles.filter(p => !p.clientName).length
  }

  const downCount = accounts.filter(a => a.isDown).length

  const filtered = accounts.filter(acc => {
    if (showDown !== acc.isDown) return false
    const matchSearch = !search ||
      acc.platform.toLowerCase().includes(search.toLowerCase()) ||
      acc.email.toLowerCase().includes(search.toLowerCase()) ||
      acc.profiles.some(p => p.clientName?.toLowerCase().includes(search.toLowerCase())) ||
      acc.fullClient?.clientName?.toLowerCase().includes(search.toLowerCase())
    const matchPlat = platFilter === 'all' || acc.platform === platFilter
    return matchSearch && matchPlat
  })

  const totalOccupied = accounts.reduce((n,a) => {
    if (a.isDown || a.isFullAccount) return n
    return n + a.profiles.filter(p => p.clientName).length
  }, 0)
  const totalFree = accounts.reduce((n,a) => {
    if (a.isDown || a.isFullAccount) return n
    return n + a.profiles.filter(p => !p.clientName).length
  }, 0)
  const freeByPlat = {}
  accounts.forEach(a => {
    if (a.isDown || a.isFullAccount) return
    const n = a.profiles.filter(p => !p.clientName).length
    if (n > 0) freeByPlat[a.platform] = (freeByPlat[a.platform] || 0) + n
  })

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Mis Cuentas</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {accounts.length} cuentas · <span className="text-emerald-500">{totalOccupied} ocupados</span> · <span className="text-slate-600">{totalFree} libres</span>
          </p>
          {Object.keys(freeByPlat).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5">
              {Object.entries(freeByPlat).map(([plat, n]) => (
                <span key={plat} className="text-xs text-slate-600">
                  <span className="text-slate-400">{plat}:</span> {n} libre{n!==1?'s':''}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          {downCount > 0 && (
            <button
              className={`btn-secondary !text-sm gap-1.5 ${showDown ? '!border-red-500/50 !text-red-400' : ''}`}
              onClick={() => setShowDown(v => !v)}>
              ⚠️ Caídas {downCount > 0 && `(${downCount})`}
            </button>
          )}
          <button className="btn-primary" onClick={() => setAddModal(true)}>
            <Plus size={16}/> Nueva cuenta
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input type="text" placeholder="Buscar cuenta o cliente…" className="form-input"
            style={{ paddingLeft:'2.25rem' }}
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="tab-bar w-auto">
          {platforms.map(p => (
            <button key={p} className={`tab-item ${platFilter===p?'active':''}`} onClick={() => setPlatFilter(p)}>
              {p === 'all' ? 'Todas' : p}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        const hasPinPending = (acc) => acc.profiles.some(p => p.needsPinChange)
        const sorted = [...filtered].sort((a, b) => {
          if (a.id === pinnedId) return -1
          if (b.id === pinnedId) return 1
          // Cuentas con PIN pendiente primero (entre las libres)
          const aPending = hasPinPending(a), bPending = hasPinPending(b)
          if (aPending && !bPending) return -1
          if (!aPending && bPending) return 1
          const fA = freeSlots(a), fB = freeSlots(b)
          if (fA === 0 && fB === 0) return 0
          if (fA === 0) return 1
          if (fB === 0) return -1
          return fA - fB
        })
        const paginated = sorted.slice((page-1)*PER_PAGE, page*PER_PAGE)
        return <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {paginated.map(acc => <AccountCard key={acc.id} account={acc}/>)}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center py-20 text-slate-600">No se encontraron cuentas.</div>
            )}
          </div>
          <Pagination page={page} total={sorted.length} perPage={PER_PAGE} onChange={setPage}/>
        </>
      })()}

      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Nueva cuenta de streaming">
        <AccountForm
          onSave={(data) => { addAccount(data); setAddModal(false) }}
          onClose={() => setAddModal(false)}
          suppliers={suppliers}
        />
      </Modal>
    </div>
  )
}
