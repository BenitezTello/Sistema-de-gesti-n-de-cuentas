import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { isToday, isBefore, format, differenceInCalendarDays } from 'date-fns'
import { downloadXLSX } from '../utils/excel'

const AppContext = createContext()

// ── Utilidades de fecha ────────────────────────────────────────────────
const parseLocal = (dateStr) => {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── API helper ─────────────────────────────────────────────────────────
async function api(path, method = 'GET', body) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/data${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.reload()
    return
  }
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`)
  return res.json()
}

export const AppProvider = ({ children, user }) => {
  const [accounts,        setAccounts]        = useState([])
  const [suppliers,       setSuppliers]       = useState([])
  const [savedClients,    setSavedClients]    = useState([])
  const [users,           setUsers]           = useState([])
  const [toasts,          setToasts]          = useState([])
  const [loading,         setLoading]         = useState(true)
  const [lastAssigned,    setLastAssigned]    = useState(null)
  const [platformPrices,  setPlatformPrices]  = useState([])
  const [comboPrices,     setComboPrices]     = useState([])
  const [financialSummary,setFinancialSummary]= useState(null)

  // ── Cargar datos desde la API al montar ────────────────────────────
  useEffect(() => {
    Promise.all([api('/accounts'), api('/suppliers')])
      .then(([accs, sups]) => { setAccounts(accs); setSuppliers(sups) })
      .catch(err => console.error('[DB] Error cargando datos:', err))
      .finally(() => setLoading(false))
    api('/clients').then(c => setSavedClients(c || [])).catch(() => {})
    api('/platform-prices').then(p => setPlatformPrices(p || [])).catch(() => {})
    api('/combo-prices').then(c => setComboPrices(c || [])).catch(() => {})
    if (user?.role === 'admin') {
      api('/users').then(u => setUsers(u || [])).catch(() => {})
    }
  }, [user?.role])

  // ── Toast ──────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Clipboard ──────────────────────────────────────────────────────
  const copyToClipboard = useCallback((text, label = '') => {
    if (!text) { showToast('Sin valor para copiar', 'warning'); return }
    navigator.clipboard.writeText(text)
      .then(() => showToast(`${label ? label + ' ' : ''}copiado ✓`, 'success'))
      .catch(() => showToast('Error al copiar', 'error'))
  }, [showToast])

  // ── Status logic ───────────────────────────────────────────────────
  const getSubscriptionStatus = useCallback((dateStr) => {
    if (!dateStr) return 'available'
    const exp = parseLocal(dateStr)
    const now = new Date()
    if (isToday(exp)) return 'today'
    if (isBefore(exp, now)) return 'expired'
    const days = differenceInCalendarDays(exp, now)
    if (days <= 2) return 'soon'
    return 'active'
  }, [])

  const getDaysRemaining = useCallback((dateStr) => {
    if (!dateStr) return null
    return differenceInCalendarDays(parseLocal(dateStr), new Date())
  }, [])

  const getSupplierName = useCallback((supplierId) => {
    return suppliers.find(s => s.id === supplierId)?.name || '—'
  }, [suppliers])

  // ── Accounts CRUD ──────────────────────────────────────────────────
  const addAccount = useCallback(async (data) => {
    try {
      const acc = await api('/accounts', 'POST', data)
      setAccounts(prev => [acc, ...prev])
      showToast('Cuenta agregada', 'success')
    } catch { showToast('Error al agregar cuenta', 'error') }
  }, [showToast])

  const updateAccount = useCallback(async (id, data) => {
    try {
      const acc = await api(`/accounts/${id}`, 'PUT', data)
      setAccounts(prev => prev.map(a => a.id === id ? acc : a))
      showToast('Cuenta actualizada', 'success')
    } catch { showToast('Error al actualizar cuenta', 'error') }
  }, [showToast])

  const deleteAccount = useCallback(async (id) => {
    try {
      await api(`/accounts/${id}`, 'DELETE')
      setAccounts(prev => prev.filter(a => a.id !== id))
      showToast('Cuenta eliminada', 'info')
    } catch { showToast('Error al eliminar cuenta', 'error') }
  }, [showToast])

  const markPasswordChanged = useCallback(async (accountId, newPassword) => {
    await updateAccount(accountId, { password: newPassword, passwordChanged: true })
    showToast('Contraseña actualizada', 'success')
  }, [updateAccount, showToast])

  const setFullAccount = useCallback(async (accountId, isFullAccount, fullClient = null) => {
    const acc = accounts.find(a => a.id === accountId)
    const data = {
      isFullAccount,
      fullClient: fullClient !== null ? fullClient : (acc?.fullClient || {}),
    }
    await updateAccount(accountId, data)
  }, [accounts, updateAccount])

  // ── Profile helpers (actualiza en API y en estado local) ───────────
  const _patchProfile = useCallback(async (accountId, profileId, data) => {
    await api(`/profiles/${profileId}`, 'PUT', data)
    setAccounts(prev => prev.map(acc => {
      if (acc.id !== accountId) return acc
      return { ...acc, profiles: acc.profiles.map(p => p.id === profileId ? { ...p, ...data } : p) }
    }))
  }, [])

  const addProfile = useCallback(async (accountId, number, pin) => {
    try {
      const acc = await api(`/accounts/${accountId}/profiles`, 'POST', { number, pin: pin || '0000' })
      setAccounts(prev => prev.map(a => a.id === accountId ? acc : a))
      showToast(`Perfil ${number} agregado`, 'success')
    } catch { showToast('Error al agregar perfil', 'error') }
  }, [showToast])

  const deleteProfile = useCallback(async (accountId, profileId) => {
    try {
      await api(`/profiles/${profileId}`, 'DELETE')
      setAccounts(prev => prev.map(a => a.id !== accountId ? a : {
        ...a, profiles: a.profiles.filter(p => p.id !== profileId)
      }))
      showToast('Perfil eliminado', 'info')
    } catch { showToast('Error al eliminar perfil', 'error') }
  }, [showToast])

  const deleteClientFromHistory = useCallback(async (clientId) => {
    try {
      await api(`/clients/${clientId}`, 'DELETE')
      setSavedClients(prev => prev.filter(c => c.id !== clientId))
    } catch {}
  }, [])

  const setClientReseller = useCallback(async (phone, name, isReseller) => {
    await api('/clients/reseller', 'POST', { phone, name, isReseller })
    const id = (phone || '').replace(/\D/g,'') || name?.toLowerCase()?.trim()
    setSavedClients(prev => {
      const exists = prev.find(c => c.id === id)
      if (exists) return prev.map(c => c.id === id ? { ...c, is_reseller: isReseller ? 1 : 0 } : c)
      return [...prev, { id, name: name || '', phone: phone || '', is_reseller: isReseller ? 1 : 0 }]
    })
  }, [])

  const saveClientToHistory = useCallback(async (name, phone) => {
    if (!name?.trim()) return
    try {
      const client = await api('/clients', 'POST', { name, phone: phone || '' })
      if (client?.id) {
        setSavedClients(prev => {
          const exists = prev.find(c => c.id === client.id)
          return exists ? prev.map(c => c.id === client.id ? client : c) : [...prev, client]
        })
      }
    } catch {}
  }, [])

  const assignClientToProfile = useCallback(async (accountId, profileId, clientData) => {
    await _patchProfile(accountId, profileId, { ...clientData, status: 'active' })
    setLastAssigned(accountId)
    if (clientData.clientName) saveClientToHistory(clientData.clientName, clientData.phone)
    const msg = clientData.saleType === 'sale' ? 'Cliente asignado · ingreso registrado ✓' : 'Cliente asignado'
    showToast(msg, 'success')
  }, [_patchProfile, showToast, saveClientToHistory])

  const releaseProfile = useCallback(async (accountId, profileId) => {
    const acc  = accounts.find(a => a.id === accountId)
    const prof = acc?.profiles.find(p => p.id === profileId)
    if (prof?.clientName) saveClientToHistory(prof.clientName, prof.phone)
    await _patchProfile(accountId, profileId, { clientName: '', phone: '', status: 'available', expiryDate: '', needsPinChange: 1 })
    showToast('Perfil liberado', 'info')
  }, [_patchProfile, showToast, accounts, saveClientToHistory])

  // Renueva la fecha del cliente de cuenta completa
  const extendFullAccountClient = useCallback(async (accountId, newDateStr, label, renewAmount = 0) => {
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) return
    const newFullClient = { ...(acc.fullClient || {}), expiryDate: newDateStr }
    const payload = { fullClient: newFullClient }
    if (renewAmount > 0) { payload.saleType = 'renewal'; payload.renewAmount = renewAmount }
    await updateAccount(accountId, payload)
    const msg = renewAmount > 0 ? `Renovado ${label} · ingreso registrado ✓` : `Renovado ${label} ✓`
    showToast(msg, 'success')
  }, [accounts, updateAccount, showToast])

  // Libera cliente de cuenta completa
  const releaseFullClient = useCallback(async (accountId) => {
    const acc = accounts.find(a => a.id === accountId)
    if (acc?.fullClient?.clientName) saveClientToHistory(acc.fullClient.clientName, acc.fullClient.phone)
    await updateAccount(accountId, { fullClient: {} })
    showToast('Cliente liberado', 'info')
  }, [accounts, updateAccount, showToast, saveClientToHistory])

  // Libera completamente el perfil, guarda al cliente en historial y cambia el PIN
  const releaseProfileWithPIN = useCallback(async (accountId, profileId, newPin) => {
    const acc  = accounts.find(a => a.id === accountId)
    const prof = acc?.profiles.find(p => p.id === profileId)
    if (prof?.clientName) saveClientToHistory(prof.clientName, prof.phone)
    await _patchProfile(accountId, profileId, {
      clientName: '', phone: '', status: 'available', expiryDate: '',
      pin: newPin || prof?.pin || '0000', needsPinChange: 1
    })
    showToast('Perfil liberado · PIN actualizado', 'success')
  }, [_patchProfile, showToast, accounts, saveClientToHistory])

  const extendProfile = useCallback(async (accountId, profileId, newDateStr, label, renewAmount = 0) => {
    const payload = { expiryDate: newDateStr }
    if (renewAmount > 0) { payload.saleType = 'renewal'; payload.renewAmount = renewAmount }
    await _patchProfile(accountId, profileId, payload)
    const msg = renewAmount > 0 ? `Renovado ${label} · ingreso registrado ✓` : `Renovado ${label} ✓`
    showToast(msg, 'success')
  }, [_patchProfile, showToast])

  const extendAccount = useCallback(async (accountId, newDateStr, label) => {
    await updateAccount(accountId, { expiryDate: newDateStr })
    showToast(`Cuenta renovada ${label} ✓`, 'success')
  }, [updateAccount, showToast])

  const extendClientAllProfiles = useCallback(async (matchPhone, matchName, newDateStr, label) => {
    await api('/clients/extend', 'POST', { matchPhone, matchName, newDateStr })
    // Recargar cuentas para reflejar los cambios
    const accs = await api('/accounts')
    setAccounts(accs)
    showToast(`Combo renovado ${label} ✓`, 'success')
  }, [showToast])

  // ── Global client update ───────────────────────────────────────────
  const updateClientGlobal = useCallback(async (matchPhone, matchName, newName, newPhone) => {
    await api('/clients/update', 'POST', { matchPhone, matchName, newName, newPhone })
    // Sincronizar también en saved_clients
    await saveClientToHistory(newName, newPhone)
    const accs = await api('/accounts')
    setAccounts(accs)
    // Actualizar saved_clients state
    setSavedClients(prev => {
      const oldKey = (matchPhone || '').replace(/\D/g,'') || matchName?.toLowerCase()?.trim()
      const newKey = (newPhone  || '').replace(/\D/g,'') || newName?.toLowerCase()?.trim()
      return prev.map(c => c.id === oldKey ? { ...c, id: newKey, name: newName, phone: newPhone || c.phone } : c)
    })
    showToast('Cliente actualizado en todos sus perfiles ✓', 'success')
  }, [showToast, saveClientToHistory])

  // ── Users CRUD (solo admin) ────────────────────────────────────────
  const createAppUser = useCallback(async (data) => {
    const u = await api('/users', 'POST', data)
    if (u?.id) setUsers(prev => [...prev, u])
    showToast('Usuario creado', 'success')
    return u
  }, [showToast])

  const updateAppUser = useCallback(async (id, data) => {
    await api(`/users/${id}`, 'PUT', data)
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u))
    showToast('Usuario actualizado', 'success')
  }, [showToast])

  const deleteAppUser = useCallback(async (id) => {
    await api(`/users/${id}`, 'DELETE')
    setUsers(prev => prev.filter(u => u.id !== id))
    showToast('Usuario eliminado', 'info')
  }, [showToast])

  // ── Platform Prices ────────────────────────────────────────────────
  const getPlatformPrice = useCallback((platform) => {
    return platformPrices.find(p => p.platform === platform)?.price ?? 0
  }, [platformPrices])

  const updatePlatformPrice = useCallback(async (platform, price) => {
    await api(`/platform-prices/${encodeURIComponent(platform)}`, 'PUT', { price })
    setPlatformPrices(prev => prev.map(p => p.platform === platform ? { ...p, price } : p))
    showToast(`Precio venta de ${platform} actualizado`, 'success')
  }, [showToast])

  const getPlatformRenewalPrice = useCallback((platform) => {
    return platformPrices.find(p => p.platform === platform)?.renewal_price ?? 0
  }, [platformPrices])

  const updatePlatformRenewalPrice = useCallback(async (platform, price) => {
    await api(`/platform-prices/${encodeURIComponent(platform)}/renewal`, 'PUT', { price })
    setPlatformPrices(prev => prev.map(p => p.platform === platform ? { ...p, renewal_price: price } : p))
    showToast(`Precio renovación de ${platform} actualizado`, 'success')
  }, [showToast])

  const getPlatformResellerPrice = useCallback((platform) => {
    return platformPrices.find(p => p.platform === platform)?.reseller_price ?? 0
  }, [platformPrices])

  const updatePlatformResellerPrice = useCallback(async (platform, price) => {
    await api(`/platform-prices/${encodeURIComponent(platform)}/reseller`, 'PUT', { price })
    setPlatformPrices(prev => prev.map(p => p.platform === platform ? { ...p, reseller_price: price } : p))
    showToast(`Precio revendedor de ${platform} actualizado`, 'success')
  }, [showToast])

  // ── Financial Summary ──────────────────────────────────────────────
  const loadFinancialSummary = useCallback(async (from = '', to = '') => {
    try {
      const qs = new URLSearchParams({ from, to }).toString()
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/data/summary?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setFinancialSummary(data)
      return data
    } catch { return null }
  }, [])

  // ── Suppliers CRUD ──────────────────────────────────────────────────
  const addSupplier = useCallback(async (data) => {
    try {
      const sup = await api('/suppliers', 'POST', data)
      setSuppliers(prev => [...prev, sup])
      showToast('Proveedor agregado', 'success')
    } catch { showToast('Error al agregar proveedor', 'error') }
  }, [showToast])

  const updateSupplier = useCallback(async (id, data) => {
    try {
      await api(`/suppliers/${id}`, 'PUT', data)
      setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    } catch { showToast('Error al actualizar proveedor', 'error') }
  }, [showToast])

  const deleteSupplier = useCallback(async (id) => {
    try {
      await api(`/suppliers/${id}`, 'DELETE')
      setSuppliers(prev => prev.filter(s => s.id !== id))
      showToast('Proveedor eliminado', 'info')
    } catch { showToast('Error al eliminar proveedor', 'error') }
  }, [showToast])

  // ── Combo Prices ───────────────────────────────────────────────────
  const getComboPriceByPlatforms = useCallback((platformsArray) => {
    const key = [...platformsArray].sort().join('|')
    return comboPrices.find(c => c.platforms === key)?.price ?? null
  }, [comboPrices])

  const upsertComboPrice = useCallback(async (platforms, price) => {
    const row = await api('/combo-prices', 'PUT', { platforms, price })
    setComboPrices(prev => {
      const exists = prev.find(c => c.id === row.id)
      return exists ? prev.map(c => c.id === row.id ? row : c) : [...prev, row]
    })
    showToast('Precio de combo guardado', 'success')
  }, [showToast])

  const deleteComboPrice = useCallback(async (id) => {
    await api(`/combo-prices/${id}`, 'DELETE')
    setComboPrices(prev => prev.filter(c => c.id !== id))
    showToast('Combo eliminado', 'info')
  }, [showToast])

  // Renueva todos los perfiles de un combo + registra UNA transacción
  const renewCombo = useCallback(async (profiles, newDateStr, label, comboPrice, clientName, clientPhone, platform) => {
    await Promise.all(profiles.map(p =>
      p.isFullAccount
        ? api(`/accounts/${p.accountId}`, 'PUT', { fullClient: { ...p.fullClientData, expiryDate: newDateStr } })
        : api(`/profiles/${p.profileId}`, 'PUT', { expiryDate: newDateStr })
    ))
    if (comboPrice > 0) {
      await api('/transactions/manual', 'POST', {
        type: 'income', category: 'renewal',
        platform, amount: comboPrice,
        clientName, clientPhone,
        notes: `Combo ${label}`,
      })
    }
    const accs = await api('/accounts')
    setAccounts(accs)
    showToast(`Combo renovado ${label} · ingreso registrado ✓`, 'success')
  }, [showToast])

  // ── Export Excel ───────────────────────────────────────────────────
  const exportToXLSX = useCallback(() => {
    const STATUS_LABEL = { active: 'Activo', today: 'Vence hoy', soon: 'Pronto', expired: 'Vencido', available: 'Disponible' }
    const rows = [['Plataforma','Correo','Perfil','PIN','Cliente','Celular','Vencimiento','Estado']]
    accounts.forEach(acc => {
      if (acc.isFullAccount) {
        const fc = acc.fullClient
        if (!fc?.clientName) return
        const st = getSubscriptionStatus(fc.expiryDate)
        rows.push([acc.platform, acc.email, 'Completa', '—', fc.clientName, fc.phone || '', fc.expiryDate, STATUS_LABEL[st] || st])
      } else {
        acc.profiles.forEach(p => {
          if (!p.clientName) return
          const st = getSubscriptionStatus(p.expiryDate)
          rows.push([acc.platform, acc.email, p.number, p.pin, p.clientName, p.phone, p.expiryDate, STATUS_LABEL[st] || st])
        })
      }
    })
    downloadXLSX(rows, 'Suscripciones', `suscripciones_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    showToast('Excel exportado', 'success')
  }, [accounts, getSubscriptionStatus, showToast])

  return (
    <AppContext.Provider value={{
      accounts, suppliers, toasts, loading,
      currentUser: user,
      showToast, dismissToast, copyToClipboard,
      getSubscriptionStatus, getDaysRemaining, getSupplierName,
      addAccount, updateAccount, deleteAccount, markPasswordChanged, setFullAccount,
      lastAssigned, savedClients, deleteClientFromHistory, setClientReseller,
      addProfile, deleteProfile, patchProfile: _patchProfile,
      assignClientToProfile, releaseProfile, releaseProfileWithPIN, releaseFullClient,
      extendProfile, extendFullAccountClient, extendAccount, extendClientAllProfiles,
      addSupplier, updateSupplier, deleteSupplier,
      updateClientGlobal, exportToXLSX,
      users, createAppUser, updateAppUser, deleteAppUser,
      platformPrices, getPlatformPrice, updatePlatformPrice, getPlatformRenewalPrice, updatePlatformRenewalPrice, getPlatformResellerPrice, updatePlatformResellerPrice,
      comboPrices, getComboPriceByPlatforms, upsertComboPrice, deleteComboPrice, renewCombo,
      financialSummary, loadFinancialSummary,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
