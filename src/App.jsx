import { useState, useEffect } from 'react'
import Login from './components/Login'
import { LayoutDashboard, Tv, MonitorPlay, MessageSquare, Truck, Users, UserCog, Shield, Menu, X, LogOut, Bell, ClipboardList, Wallet, FileText, Ticket } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AppProvider, useApp } from './context/AppContext'
import Dashboard from './components/Dashboard'
import AccountsView from './components/AccountsView'
import AccountsListView from './components/AccountsListView'
import WhatsAppView from './components/WhatsAppView'
import SuppliersView from './components/SuppliersView'
import ClientsView from './components/ClientsView'
import UsersView from './components/UsersView'
import AuditView from './components/AuditView'
import PaymentsView from './components/PaymentsView'
import ReportsView from './components/ReportsView'
import TicketsView from './components/TicketsView'
import ToastContainer from './components/Toast'

const BASE_NAV = [
  { id: 'dashboard',     icon: LayoutDashboard, label: 'Dashboard',  adminOnly: false },
  { id: 'accounts',      icon: MonitorPlay,      label: 'Ventas',     adminOnly: false },
  { id: 'accounts-list', icon: Tv,               label: 'Cuentas',    adminOnly: false },
  { id: 'clients',       icon: Users,            label: 'Clientes',   adminOnly: false },
  { id: 'whatsapp',      icon: MessageSquare,    label: 'Cobros WA',  adminOnly: false },
  { id: 'payments',      icon: Wallet,           label: 'Pagos',      adminOnly: false },
  { id: 'reports',       icon: FileText,         label: 'Reportes',   adminOnly: false },
  { id: 'tickets',       icon: Ticket,           label: 'Tickets',    adminOnly: false },
  { id: 'suppliers',     icon: Truck,            label: 'Proveedores',adminOnly: true  },
  { id: 'users',         icon: UserCog,          label: 'Usuarios',   adminOnly: true  },
  { id: 'audit',         icon: ClipboardList,    label: 'Auditoría',  adminOnly: true  },
]

const PAGE_TITLES = {
  dashboard:       { title: 'Dashboard' },
  accounts:        { title: 'Ventas' },
  'accounts-list': { title: 'Cuentas' },
  clients:         { title: 'Clientes' },
  whatsapp:        { title: 'Cobros WA' },
  payments:        { title: 'Pagos' },
  reports:         { title: 'Reportes' },
  tickets:         { title: 'Tickets' },
  suppliers:       { title: 'Proveedores' },
  users:           { title: 'Usuarios' },
  audit:           { title: 'Auditoría' },
}

function TopBar({ activeTab, onNavigate, onMenuOpen }) {
  const { accounts, getSubscriptionStatus } = useApp()
  const urgentCount = accounts.flatMap(a => a.profiles).filter(p =>
    p.clientName && ['expired', 'today'].includes(getSubscriptionStatus(p.expiryDate))
  ).length

  const { title } = PAGE_TITLES[activeTab] || PAGE_TITLES.dashboard
  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/[0.05]"
      style={{ background: 'rgba(4,9,5,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button className="btn-icon md:hidden" onClick={onMenuOpen}>
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">{title}</h1>
          <p className="text-xs text-slate-600 mt-0.5 hidden sm:block capitalize">{today}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Urgent bell */}
        {urgentCount > 0 && (
          <button
            className="relative btn-icon btn-icon-warning"
            title={`${urgentCount} clientes urgentes`}
            onClick={() => onNavigate('whatsapp')}
          >
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
              {urgentCount > 9 ? '9+' : urgentCount}
            </span>
          </button>
        )}
        <p className="text-xs text-slate-600 hidden md:block capitalize">{today}</p>
      </div>
    </header>
  )
}

function AppShell({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const NAV = BASE_NAV.filter(item => !item.adminOnly || isAdmin)

  const navigate = (tab) => { setActiveTab(tab); setSidebarOpen(false) }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg,rgba(22,163,74,0.3),rgba(34,197,94,0.2))', border: '1px solid rgba(34,197,94,0.3)' }}>
            <img src="/logo.png" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
            <span style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Tv size={15} className="text-green-400" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none" style={{color:'#4ade80'}}>ABT Streaming</p>
            <p className="text-[10px] mt-0.5" style={{color:'#166534'}}>Gestión de cuentas</p>
          </div>
          <button className="btn-icon ml-auto md:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={15} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-0.5 mt-1">
          {NAV.map(({ id, icon: Icon, label }) => (
            <button key={id} className={`sidebar-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => navigate(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[0.05] pt-3 flex flex-col gap-1">
          {/* Usuario actual */}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: isAdmin ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)' }}>
              {isAdmin
                ? <Shield size={12} style={{ color: '#d8b4fe' }} />
                : <UserCog size={12} style={{ color: '#93c5fd' }} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user?.username}</p>
              <p className="text-[10px]" style={{ color: isAdmin ? '#d8b4fe' : '#93c5fd' }}>
                {isAdmin ? 'Administrador' : 'Usuario'}
              </p>
            </div>
          </div>
          <button className="sidebar-item w-full" style={{ color: '#475569' }} onClick={onLogout}>
            <LogOut size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeTab={activeTab} onNavigate={navigate} onMenuOpen={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-7">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard'     && <Dashboard onNavigate={navigate} />}
            {activeTab === 'accounts'      && <AccountsView />}
            {activeTab === 'accounts-list' && <AccountsListView />}
            {activeTab === 'clients'       && <ClientsView />}
            {activeTab === 'whatsapp'      && <WhatsAppView />}
            {activeTab === 'payments'      && <PaymentsView />}
            {activeTab === 'reports'       && <ReportsView />}
            {activeTab === 'tickets'       && <TicketsView />}
            {activeTab === 'suppliers'     && isAdmin && <SuppliersView />}
            {activeTab === 'users'         && isAdmin && <UsersView />}
            {activeTab === 'audit'         && isAdmin && <AuditView />}
          </div>
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}

export default function App() {
  const [authUser, setAuthUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setAuthChecked(true); return }
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) setAuthUser({
          username:    d.username,
          role:        d.role        || 'admin',
          permissions: d.permissions || ['all'],
        })
      })
      .catch(() => { })
      .finally(() => setAuthChecked(true))
  }, [])

  if (!authChecked) return null
  if (!authUser) return <Login onLogin={setAuthUser} />

  return (
    <AppProvider user={authUser}>
      <AppShell user={authUser} onLogout={() => { localStorage.removeItem('token'); setAuthUser(null) }} />
    </AppProvider>
  )
}
