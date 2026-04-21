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

const PAGE_TITLES = {
  dashboard: 'Дашборд',
  calendar: 'Расписание',
  clients: 'Клиенты',
  payments: 'Оплаты',
  expenses: 'Расходы',
  directions: 'Направления',
  teachers: 'Педагоги',
  finance: 'Финансы и аналитика',
  staff: 'Сотрудники',
}

// Panda SVG logo
const PandaLogo = () => (
  <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="48" r="28" fill="white" stroke="#1A1A1A" strokeWidth="4"/>
    <circle cx="28" cy="26" r="12" fill="#1A1A1A"/>
    <circle cx="72" cy="26" r="12" fill="#1A1A1A"/>
    <circle cx="38" cy="44" r="10" fill="#1A1A1A"/>
    <circle cx="62" cy="44" r="10" fill="#1A1A1A"/>
    <circle cx="38" cy="44" r="5" fill="white"/>
    <circle cx="62" cy="44" r="5" fill="white"/>
    <circle cx="39" cy="43" r="3" fill="#1A1A1A"/>
    <circle cx="63" cy="43" r="3" fill="#1A1A1A"/>
    <ellipse cx="50" cy="58" rx="6" ry="4" fill="#1A1A1A"/>
    <path d="M42 65 Q50 72 58 65" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
  </svg>
)

export default function CRM({ session, staff }) {
  const [page, setPage] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [directions, setDirections] = useState([])
  const [teachers, setTeachers] = useState([])
  const [staffList, setStaffList] = useState([])
  const [newCount, setNewCount] = useState(0)

  const role = staff?.role || 'Преподаватель'
  const isDirector = role === 'Директор'
  const isAdmin = role === 'Директор' || role === 'Администратор'

  const load = useCallback(async () => {
    const [c, p, e, d, t, s] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('directions').select('*').order('id'),
      supabase.from('teachers').select('*').order('id'),
      supabase.from('staff').select('*').order('id'),
    ])
    if (c.data) { setClients(c.data); setNewCount(c.data.filter(x => x.status === 'Новый').length) }
    if (p.data) setPayments(p.data)
    if (e.data) setExpenses(e.data)
    if (d.data) setDirections(d.data)
    if (t.data) setTeachers(t.data)
    if (s.data) setStaffList(s.data)
  }, [])

  useEffect(() => { load() }, [load])

  const logout = () => supabase.auth.signOut()

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
      { id: 'finance', icon: '💰', label: 'Финансы', show: isDirector },
      { id: 'staff', icon: '🔑', label: 'Сотрудники', show: isDirector },
    ]},
  ]

  const props = { clients, setClients, payments, setPayments, expenses, setExpenses, directions, teachers, staffList, setStaffList, reload: load, role, isAdmin, isDirector, staff }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <PandaLogo />
            <div>
              <div className="logo-name">PandaCRM</div>
              <div className="logo-sub">Академия Панды</div>
            </div>
          </div>
        </div>

        {nav.map(s => (
          <div key={s.section} className="nav-section">
            <div className="nav-label">{s.section}</div>
            {s.items.filter(i => i.show).map(item => (
              <div key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </div>
            ))}
          </div>
        ))}

        <div className="sidebar-user" onClick={logout} title="Выйти из системы">
          <div className="avatar" style={{ background: T.green, width: 32, height: 32, fontSize: 12 }}>
            {(staff?.name || 'U')[0]}
          </div>
          <div>
            <div className="user-name">{staff?.name || 'Пользователь'}</div>
            <div className="user-role">{staff?.role} · Выйти</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="page-title">{PAGE_TITLES[page]}</div>
          <div className="topbar-right">
            <span className={`badge ${ROLE_COLORS[role]}`}>{role}</span>
            <span style={{ fontSize: 12, color: T.muted }}>
              {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="content">
          {page === 'dashboard'   && <Dashboard {...props} />}
          {page === 'calendar'    && <CalendarPage {...props} />}
          {page === 'clients'     && isAdmin && <ClientsPage {...props} />}
          {page === 'payments'    && isAdmin && <PaymentsPage {...props} />}
          {page === 'expenses'    && isDirector && <ExpensesPage {...props} />}
          {page === 'directions'  && <DirectionsPage {...props} />}
          {page === 'teachers'    && isAdmin && <TeachersPage {...props} />}
          {page === 'finance'     && isDirector && <FinancePage {...props} />}
          {page === 'staff'       && isDirector && <StaffPage {...props} />}
        </div>
      </main>
    </div>
  )
}
