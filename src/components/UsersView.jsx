import { useState } from 'react'
import { UserPlus, Edit2, Trash2, Shield, User, X, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'

const PLATFORMS = ['Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'Crunchyroll', 'Movistar+', 'Otro']

function platClass(p) {
  const m = {
    'Netflix': 'plat-netflix', 'Disney+': 'plat-disney', 'HBO Max': 'plat-hbo',
    'Prime Video': 'plat-prime', 'Crunchyroll': 'plat-crunchyroll', 'Movistar+': 'plat-movistar',
  }
  return m[p] || 'plat-default'
}

const EMPTY_FORM = { username: '', password: '', role: 'user', permissions: [], is_active: true }

export default function UsersView() {
  const { users, currentUser, createAppUser, updateAppUser, deleteAppUser, showToast } = useApp()

  const [modal, setModal]         = useState(null)   // 'create' | 'edit'
  const [editing, setEditing]     = useState(null)   // user object being edited
  const [confirmId, setConfirmId] = useState(null)   // id to delete
  const [form, setForm]           = useState(EMPTY_FORM)
  const [showPass, setShowPass]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState('')

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormErr('')
    setShowPass(false)
    setModal('create')
  }

  function openEdit(u) {
    setEditing(u)
    setForm({ username: u.username, password: '', role: u.role, permissions: u.permissions || [], is_active: u.is_active })
    setFormErr('')
    setShowPass(false)
    setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null) }

  function togglePlatform(p) {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(p)
        ? prev.permissions.filter(x => x !== p)
        : [...prev.permissions, p],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormErr('')
    if (!form.username.trim()) return setFormErr('El usuario es requerido')
    if (modal === 'create' && !form.password) return setFormErr('La contraseña es requerida')
    if (form.role === 'user' && form.permissions.length === 0) return setFormErr('Asigna al menos una plataforma')

    setSaving(true)
    try {
      if (modal === 'create') {
        await createAppUser({
          username:    form.username.trim().toLowerCase(),
          password:    form.password,
          role:        form.role,
          permissions: form.role === 'admin' ? ['all'] : form.permissions,
        })
      } else {
        const payload = {
          role:        form.role,
          permissions: form.role === 'admin' ? ['all'] : form.permissions,
          is_active:   form.is_active,
        }
        if (form.password) payload.password = form.password
        await updateAppUser(editing.id, payload)
      }
      closeModal()
    } catch (err) {
      setFormErr(err?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmId) return
    try {
      await deleteAppUser(confirmId)
    } catch (err) {
      showToast(err?.message || 'Error al eliminar', 'error')
    } finally {
      setConfirmId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Gestión de Usuarios</h2>
          <p className="text-xs text-slate-500 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <UserPlus size={15} />
          Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Plataformas</th>
                <th>Estado</th>
                <th style={{ width: '80px' }}></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-600 text-sm">
                    No hay usuarios registrados
                  </td>
                </tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  {/* Username */}
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: u.role === 'admin' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)' }}>
                        {u.role === 'admin'
                          ? <Shield size={13} style={{ color: '#d8b4fe' }} />
                          : <User   size={13} style={{ color: '#93c5fd' }} />}
                      </div>
                      <span className="font-medium text-slate-200">{u.username}</span>
                      {u.id === currentUser?.id && (
                        <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: '0.6rem' }}>tú</span>
                      )}
                    </div>
                  </td>

                  {/* Rol */}
                  <td>
                    <span className="badge" style={
                      u.role === 'admin'
                        ? { background: 'rgba(168,85,247,0.12)', color: '#d8b4fe' }
                        : { background: 'rgba(59,130,246,0.12)',  color: '#93c5fd' }
                    }>
                      {u.role === 'admin' ? 'Admin' : 'Usuario'}
                    </span>
                  </td>

                  {/* Plataformas */}
                  <td>
                    {u.role === 'admin' || (u.permissions || []).includes('all') ? (
                      <span className="text-xs text-slate-400">Todas las plataformas</span>
                    ) : (u.permissions || []).length === 0 ? (
                      <span className="text-xs text-slate-600">Sin acceso</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(u.permissions || []).map(p => (
                          <span key={p} className={`badge ${platClass(p)}`}>{p}</span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Estado */}
                  <td>
                    {u.is_active
                      ? <span className="badge badge-active">Activo</span>
                      : <span className="badge badge-danger">Inactivo</span>}
                  </td>

                  {/* Acciones */}
                  <td>
                    <div className="flex items-center gap-1">
                      <button className="btn-icon btn-icon-indigo" title="Editar" onClick={() => openEdit(u)}>
                        <Edit2 size={14} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button className="btn-icon btn-icon-danger" title="Eliminar" onClick={() => setConfirmId(u.id)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal crear / editar ── */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-100">
                {modal === 'create' ? 'Nuevo usuario' : `Editar — ${editing?.username}`}
              </h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {/* Username */}
              <div>
                <label className="form-label">Usuario</label>
                <input
                  className="form-input"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="nombre de usuario"
                  disabled={modal === 'edit'}
                  required
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="form-label">
                  {modal === 'create' ? 'Contraseña' : 'Nueva contraseña (opcional)'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder={modal === 'create' ? 'contraseña' : 'dejar vacío para no cambiar'}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4ade80', opacity: 0.7 }}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Rol */}
              <div>
                <label className="form-label">Rol</label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value, permissions: [] }))}
                >
                  <option value="admin">Administrador — acceso total</option>
                  <option value="user">Usuario — acceso por plataforma</option>
                </select>
              </div>

              {/* Plataformas (solo si rol = user) */}
              {form.role === 'user' && (
                <div>
                  <label className="form-label">Plataformas permitidas</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PLATFORMS.map(p => {
                      const sel = form.permissions.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          className={`badge ${platClass(p)}`}
                          style={{
                            cursor: 'pointer',
                            opacity: sel ? 1 : 0.35,
                            outline: sel ? '2px solid currentColor' : 'none',
                            outlineOffset: '2px',
                            transition: 'all 0.15s',
                            padding: '0.3rem 0.7rem',
                            fontSize: '0.75rem',
                          }}
                        >
                          {sel && <CheckCircle size={11} style={{ marginRight: '4px', display: 'inline' }} />}
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Activo (solo edición) */}
              {modal === 'edit' && editing?.id !== currentUser?.id && (
                <div className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div>
                    <p className="text-sm font-medium text-slate-300">Estado de cuenta</p>
                    <p className="text-xs text-slate-500">{form.is_active ? 'El usuario puede iniciar sesión' : 'El usuario no puede iniciar sesión'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                    className={`badge ${form.is_active ? 'badge-active' : 'badge-danger'}`}
                    style={{ cursor: 'pointer', padding: '0.35rem 0.75rem' }}
                  >
                    {form.is_active ? <><CheckCircle size={11} style={{ display: 'inline', marginRight: '4px' }} />Activo</> : <><XCircle size={11} style={{ display: 'inline', marginRight: '4px' }} />Inactivo</>}
                  </button>
                </div>
              )}

              {/* Error */}
              {formErr && (
                <div className="text-xs text-red-400 px-1">{formErr}</div>
              )}

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Guardando…' : modal === 'create' ? 'Crear usuario' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirmar eliminación ── */}
      {confirmId && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setConfirmId(null)}>
          <div className="modal-box" style={{ maxWidth: '22rem' }}>
            <h3 className="font-bold text-slate-100 mb-2">¿Eliminar usuario?</h3>
            <p className="text-sm text-slate-400 mb-5">
              El usuario <strong className="text-slate-200">{users.find(u => u.id === confirmId)?.username}</strong> será eliminado permanentemente.
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setConfirmId(null)}>Cancelar</button>
              <button className="btn-primary flex-1" style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)' }}
                onClick={handleDelete}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
