import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { T, ROLE_COLORS } from '../styles.jsx'
import Dashboard from './Dashboard'
import ClientsPage from './ClientsPage'
import PaymentsPage from './PaymentsPage'
import ExpensesPage from './ExpensesPage'
import DirectionsPage from './DirectionsPage'
import TeachersPage from './TeachersPage'
import CalendarPage from './CalendarPage'
import FinancePage from './FinancePage'
import StaffPage from './StaffPage'
import SubscriptionsPage from './SubscriptionsPage'

const PAGE_TITLES = {
  dashboard: 'Дашборд', calendar: 'Расписание', clients: 'Клиенты',
  payments: 'Оплаты', expenses: 'Расходы', directions: 'Направления',
  teachers: 'Педагоги', finance: 'Финансы', staff: 'Сотрудники',
}

// Real logo from public/logo.svg
const Logo = ({ size = 36 }) => (
  <img src="/logo.svg" alt="Академия Панды" width={size} height={Math.round(size * 271/803)} style={{ flexShrink: 0, display: 'block' }} />
)

// Compact icon for collapsed sidebar
const PandaIcon = ({ size = 40 }) => (
  <img src="/logo-icon.svg" alt="" width={size} height={size} style={{ flexShrink: 0, display: 'block', objectFit: 'contain' }} />
)

export default function CRM({ session, staff }) {
  const [page, setPage] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [directions, setDirections] = useState([])
  const [teachers, setTeachers] = useState([])
  const [staffList, setStaffList] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [newCount, setNewCount] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const role = staff?.role || 'Преподаватель'
  const isDirector = role === 'Директор'
  const isAdmin = role === 'Директор' || role === 'Администратор'

  const load = useCallback(async () => {
    const [c, p, e, d, t, s, sub] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('directions').select('*').order('id'),
      supabase.from('teachers').select('*').order('id'),
      supabase.from('staff').select('*').order('id'),
      supabase.from('subscriptions').select('*').order('id'),
    ])
    if (c.data) { setClients(c.data); setNewCount(c.data.filter(x => x.status === 'Новый').length) }
    if (p.data) setPayments(p.data)
    if (e.data) setExpenses(e.data)
    if (d.data) setDirections(d.data)
    if (t.data) setTeachers(t.data)
    if (s.data) setStaffList(s.data)
    if (sub.data) setSubscriptions(sub.data)
  }, [])

  useEffect(() => { load() }, [load])

  const logout = () => supabase.auth.signOut()

  const navigate = (id) => { setPage(id); setMobileOpen(false) }

  const nav = [
    { section: 'Главная', items: [
      { id: 'dashboard', icon: '📊', label: 'Дашборд', show: true },
      { id: 'calendar', icon: '📅', label: 'Расписание', show: true },
    ]},
    { section: 'Учёт', items: [
      { id: 'clients', icon: '👨‍👧', label: 'Клиенты', badge: newCount || null, show: isAdmin },
      { id: 'payments', icon: '💳', label: 'Оплаты', show: isAdmin },
      { id: 'expenses', icon: '📤', label: 'Расходы', show: isDirector },
    ]},
    { section: 'Организация', items: [
      { id: 'directions', icon: '🎯', label: 'Направления', show: true },
      { id: 'teachers', icon: '👩‍🏫', label: 'Педагоги', show: isAdmin },
    ]},
    { section: 'Управление', items: [
      { id: 'subscriptions', icon: '🎟️', label: 'Стоимость', show: isAdmin },
      { id: 'finance', icon: '💰', label: 'Финансы', show: isDirector },
      { id: 'staff', icon: '🔑', label: 'Сотрудники', show: isDirector },
    ]},
  ]

  const props = { clients, setClients, payments, setPayments, expenses, setExpenses, directions, teachers, staffList, setStaffList, subscriptions, reload: load, role, isAdmin, isDirector, staff }

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo">
        <div className="logo-row">
          {collapsed && !isMobile ? (
            <PandaIcon size={32} />
          ) : (
            <Logo size={isMobile ? 140 : 160} />
          )}
        </div>
      </div>

      {nav.map(s => (
        <div key={s.section} className="nav-section">
          <div className="nav-label">{s.section}</div>
          {s.items.filter(i => i.show).map(item => (
            <div key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label-text">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </div>
          ))}
        </div>
      ))}

      <div className="sidebar-user" onClick={logout} title="Выйти из системы">
        <div className="avatar" style={{ background: T.green, width: 32, height: 32, fontSize: 13, flexShrink: 0 }}>
          {(staff?.name || 'U')[0]}
        </div>
        <div className="user-info">
          <div className="user-name">{staff?.name || 'Пользователь'}</div>
          <div className="user-role">{staff?.role} · Выйти</div>
        </div>
      </div>
    </>
  )

  return (
    <div className="app">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="sidebar-wrapper">
          <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <SidebarContent />
          </div>
          <div className="sidebar-toggle" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '→' : '←'}
          </div>
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && (
        <div className={`sidebar-wrapper ${mobileOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
          <div className="sidebar">
            <SidebarContent />
          </div>
        </div>
      )}

      <main className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <button className="topbar-hamburger" onClick={() => setMobileOpen(true)}>☰</button>
            )}
            <div className="page-title">{PAGE_TITLES[page]}</div>
          </div>
          <div className="topbar-right">
            <span className={`badge ${ROLE_COLORS[role]}`}>{role}</span>
            {!isMobile && (
              <span style={{ fontSize: 11, color: T.muted }}>
                {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="content">
          {page === 'dashboard'  && <Dashboard {...props} />}
          {page === 'calendar'   && <CalendarPage {...props} />}
          {page === 'clients'    && isAdmin && <ClientsPage {...props} />}
          {page === 'payments'   && isAdmin && <PaymentsPage {...props} />}
          {page === 'expenses'   && isDirector && <ExpensesPage {...props} />}
          {page === 'directions' && <DirectionsPage {...props} />}
          {page === 'teachers'   && isAdmin && <TeachersPage {...props} />}
          {page === 'finance'    && isDirector && <FinancePage {...props} />}
          {page === 'staff'      && isDirector && <StaffPage {...props} />}
        </div>

        {/* Mobile bottom nav */}
        {isMobile && (
          <div className="mobile-nav">
            {[
              { id: 'dashboard', icon: '📊', label: 'Главная', show: true },
              { id: 'calendar', icon: '📅', label: 'Расписание', show: true },
              { id: 'clients', icon: '👨‍👧', label: 'Клиенты', show: isAdmin, badge: newCount },
              { id: 'payments', icon: '💳', label: 'Оплаты', show: isAdmin },
              { id: 'directions', icon: '🎯', label: 'Ещё', show: true },
            ].filter(i => i.show).map(item => (
              <div key={item.id} className={`mobile-nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
                {item.badge ? <span className="mobile-nav-badge">{item.badge}</span> : null}
                <span className="mobile-nav-icon">{item.icon}</span>
                <span className="mobile-nav-label">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
