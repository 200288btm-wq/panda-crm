import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import { Modal } from '../components/Modal'
import Dashboard from './Dashboard'
import ClientsPage from './ClientsPage'
import PaymentsPage from './PaymentsPage'
import ExpensesPage from './ExpensesPage'
import DirectionsPage from './DirectionsPage'
import TeachersPage from './TeachersPage'
import CalendarPage from './CalendarPage'
import FinancePage from './FinancePage'
import StaffPage from './StaffPage'
import ProfilePage from './ProfilePage'
import StudioSettingsPage from './StudioSettingsPage'
import SubscriptionsPage from './SubscriptionsPage'
import LeadsPage from './Leads'
import AddressesPage from './AddressesPage'
import BookingSettingsPage from './BookingSettingsPage'

const PAGE_TITLES = {
  dashboard: 'Дашборд', calendar: 'Расписание', clients: 'Клиенты',
  payments: 'Оплаты', expenses: 'Расходы', directions: 'Направления',
  teachers: 'Педагоги', finance: 'Финансы', staff: 'Сотрудники',
  leads: 'Заявки', addresses: 'Адреса', booking: 'Онлайн-запись',
  profile: 'Личный кабинет',
  studio_settings: 'Настройки студии',
}

// Real logo from public/logo.svg
const Logo = ({ size = 36 }) => (
  <img src="/logo.svg" alt="Академия Панды" width={size} height={Math.round(size * 271/803)} style={{ flexShrink: 0, display: 'block' }} />
)

// Compact icon for collapsed sidebar
const PandaIcon = ({ size = 40 }) => (
  <img src="/logo-icon.svg" alt="" width={size} height={size} style={{ flexShrink: 0, display: 'block', objectFit: 'contain' }} />
)

// Возвращает инициалы по полному имени: "Татьяна Бондаренко" -> "ТБ"
function getInitials(fullName) {
  if (!fullName) return 'U'
  const parts = String(fullName).trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function CRM({ session, staff, studio, studios, onSwitchStudio }) {
  const [page, setPage] = useState(() => localStorage.getItem('crmPage') || 'dashboard')
  const [deepLink, setDeepLink] = useState(null)
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [directions, setDirections] = useState([])
  const [teachers, setTeachers] = useState([])
  const [staffList, setStaffList] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [addresses, setAddresses] = useState([])
  const [studioSettings, setStudioSettings] = useState(null)

  const features = {
    teachers:   studioSettings?.feature_teachers   !== false,
    addresses:  studioSettings?.feature_addresses  !== false,
    subgroups:  studioSettings?.feature_subgroups  !== false,
    categories: studioSettings?.feature_categories !== false,
    freeze:     studioSettings?.feature_freeze     !== false,
  }
  const [clientStatuses, setClientStatuses] = useState([])
  const [newCount, setNewCount] = useState(0)
  const [leadsCount, setLeadsCount] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)  // фоновое обновление внутри студии (не гасим контент)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMessage, setPwdMessage] = useState(null) // { type: 'success' | 'error', text: string }
  const userMenuRef = useRef(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Закрытие меню юзера по клику вне
  useEffect(() => {
    if (!userMenuOpen) return
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('touchstart', onClick)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('touchstart', onClick)
    }
  }, [userMenuOpen])

  // Смена пароля через Supabase Auth
  const changePassword = async () => {
    setPwdMessage(null)
    if (newPwd.length < 6) {
      setPwdMessage({ type: 'error', text: 'Пароль должен быть не короче 6 символов' })
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdMessage({ type: 'error', text: 'Пароли не совпадают' })
      return
    }
    setPwdSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setPwdSaving(false)
    if (error) {
      setPwdMessage({ type: 'error', text: 'Не получилось обновить пароль: ' + error.message })
      return
    }
    setPwdMessage({ type: 'success', text: 'Пароль успешно обновлён' })
    setNewPwd('')
    setConfirmPwd('')
    setTimeout(() => {
      setPwdModalOpen(false)
      setPwdMessage(null)
    }, 1500)
  }

  const role = staff?.role || 'Преподаватель'
  const isDirector = role === 'Директор'
  const isAdmin = role === 'Директор' || role === 'Администратор'

  const load = useCallback(async (background = false) => {
    const sid = studio?.id
    if (!sid) return
    if (background) setRefreshing(true); else setDataLoading(true)
    const [c, p, e, d, t, s, sub, l, addr, ss, cs] = await Promise.all([
      supabase.from('clients').select('*').eq('studio_id', sid).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('studio_id', sid).order('payment_date', { ascending: false }),
      supabase.from('expenses').select('*').eq('studio_id', sid).order('expense_date', { ascending: false }),
      supabase.from('directions').select('*, groups:direction_groups(*)').eq('studio_id', sid).order('id'),
      supabase.from('teachers').select('*').eq('studio_id', sid).order('id'),
      supabase.from('staff').select('*').eq('studio_id', sid).order('id'),
      supabase.from('subscriptions').select('*').eq('studio_id', sid).order('id'),
      supabase.from('leads').select('id, status').eq('studio_id', sid).eq('status', 'new'),
      supabase.from('addresses').select('*').eq('studio_id', sid).order('id'),
      supabase.from('studio_settings').select('*').eq('studio_id', sid).maybeSingle(),
      supabase.from('client_statuses').select('*').eq('studio_id', sid).order('sort_order'),
    ])
    if (c.data) { setClients(c.data); setNewCount(c.data.filter(x => x.status === 'Новый').length) }
    if (p.data) setPayments(p.data)
    if (e.data) setExpenses(e.data)
    if (d.data) setDirections(d.data)
    if (t.data) setTeachers(t.data)
    if (s.data) setStaffList(s.data)
    if (sub.data) setSubscriptions(sub.data)
    if (l.data) setLeadsCount(l.data.length)
    if (addr.data) setAddresses(addr.data)
    if (ss.data) setStudioSettings(ss.data)
    if (cs.data) setClientStatuses(cs.data)
    if (background) setRefreshing(false); else setDataLoading(false)
  }, [studio])

  const reloadBg = useCallback(() => load(true), [load])
  useEffect(() => { load(false) }, [load])

  const logout = () => supabase.auth.signOut()

  const navigate = (id, link = null) => { setPage(id); localStorage.setItem('crmPage', id); setMobileOpen(false); setDeepLink(link) }

  const nav = [
    { section: 'Главная', items: [
      { id: 'dashboard', icon: '📊', label: 'Дашборд', show: true },
      { id: 'calendar', icon: '📅', label: 'Расписание', show: true },
    ]},
    { section: 'Учёт', items: [
      { id: 'leads', icon: '📋', label: 'Заявки', badge: leadsCount || null, show: isAdmin },
      { id: 'clients', icon: '👨‍👧', label: 'Клиенты', badge: newCount || null, show: isAdmin },
      { id: 'payments', icon: '💳', label: 'Оплаты', show: isAdmin },
      { id: 'expenses', icon: '📤', label: 'Расходы', show: isDirector },
    ]},
    { section: 'Организация', items: [
      { id: 'directions', icon: '🎯', label: 'Направления', show: true },
      { id: 'teachers', icon: '👩‍🏫', label: 'Педагоги', show: isAdmin && features.teachers },
      { id: 'subscriptions', icon: '🎟️', label: 'Стоимость', show: isAdmin },
    ]},
    { section: 'Управление', items: [
      { id: 'studio_settings', icon: '⚙️', label: 'Настройки', show: isDirector },
    ]},
  ]

  const props = { clients, setClients, payments, setPayments, expenses, setExpenses, directions, teachers, staffList, setStaffList, subscriptions, addresses, reload: reloadBg, role, isAdmin, isDirector, staff, navigate, deepLink, setDeepLink, studioId: studio?.id, currentUserId: session?.user?.id, clientStatuses, features, studioSettings }
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
            {studio && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {studioSettings?.logo_url && (
                  <img src={studioSettings.logo_url} alt="" style={{ height: 32, maxWidth: 80, objectFit: 'contain' }} />
                )}
                <div style={{ fontSize: 12, color: T.muted, background: T.cream, borderRadius: 8, padding: '3px 10px', fontWeight: 600 }}>
                  {studio.name}
                </div>
              </div>
            )}
          </div>
          <div className="topbar-right">
            {!isMobile && (
              <span style={{ fontSize: 11, color: T.muted }}>
                {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}

            {/* Аватарка пользователя с выпадающим меню */}
            <div className="user-avatar-wrapper" ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                className="avatar user-avatar-btn"
                onClick={() => setUserMenuOpen(o => !o)}
                title={staff?.name || 'Пользователь'}
                style={{ background: T.green, width: 36, height: 36, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
              >
                {getInitials(staff?.name)}
              </button>

              {userMenuOpen && (
                <div className="user-dropdown" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'white', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', minWidth: 240, zIndex: 100, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 3 }}>{staff?.name || 'Пользователь'}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 2 }}>{role}</div>
                    <div style={{ fontSize: 11, color: T.muted, wordBreak: 'break-all' }}>{session?.user?.email}</div>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('profile') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.ink, fontFamily: 'inherit', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.cream}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    👤 Личный кабинет
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); setPwdModalOpen(true); setPwdMessage(null); setNewPwd(''); setConfirmPwd('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.ink, fontFamily: 'inherit', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.cream}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    🔑 Сменить пароль
                  </button>
                  {studios && studios.length > 1 && (
                    <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 0' }}>
                      <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, padding: '4px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Мои студии</div>
                      {studios.map(s => (
                        <button key={s.id}
                          onClick={() => { setUserMenuOpen(false); onSwitchStudio && onSwitchStudio(s) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: s.id === studio?.id ? T.green : T.ink, fontFamily: 'inherit', textAlign: 'left', fontWeight: s.id === studio?.id ? 700 : 400 }}
                          onMouseEnter={e => e.currentTarget.style.background = T.cream}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {s.id === studio?.id ? '✅' : '🏫'} {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setUserMenuOpen(false); logout() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.red, fontFamily: 'inherit', textAlign: 'left', borderTop: `1px solid ${T.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = T.cream}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    🚪 Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="content">
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          {refreshing && !dataLoading && (
            <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 10, width: 'fit-content', background: 'rgba(255,255,255,0.9)', border: `1px solid ${T.border}`, borderRadius: 20, fontSize: 12, color: T.muted, fontWeight: 600 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${T.border}`, borderTopColor: T.green, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Обновляем…
            </div>
          )}
          {dataLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 140px)', flexDirection: 'column', gap: 4 }}>
              <img src="/logo-icon.svg" alt="" style={{ width: 60, marginBottom: 8 }} />
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18 }}>Учтено</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Загрузка...</div>
            </div>
          )}
          {!dataLoading && page === 'dashboard'     && <Dashboard {...props} />}
          {!dataLoading && page === 'calendar'      && <CalendarPage {...props} />}
          {!dataLoading && page === 'leads' && isAdmin && <LeadsPage directions={directions} studioId={studio?.id} reload={reloadBg} />}
          {!dataLoading && page === 'clients'       && isAdmin && <ClientsPage {...props} />}
          {!dataLoading && page === 'payments'      && isAdmin && <PaymentsPage {...props} />}
          {!dataLoading && page === 'expenses'      && isDirector && <ExpensesPage {...props} />}
          {!dataLoading && page === 'directions'    && <DirectionsPage {...props} />}
          {!dataLoading && page === 'teachers'      && isAdmin && <TeachersPage {...props} />}
          {!dataLoading && page === 'subscriptions' && isAdmin && <SubscriptionsPage {...props} />}
          {!dataLoading && page === 'finance'       && isDirector && <FinancePage {...props} />}
          {!dataLoading && page === 'staff'         && isDirector && <StaffPage {...props} />}
          {page === 'profile'       && <ProfilePage session={session} staff={staff} studio={studio} studios={studios} onSwitchStudio={onSwitchStudio} onAddStudio={load} />}
          {page === 'studio_settings' && isDirector && <StudioSettingsPage studio={studio} studioId={studio?.id} directions={directions} staffList={staffList} reload={reloadBg} clientStatuses={clientStatuses} clients={clients} payments={payments} expenses={expenses} teachers={teachers} subscriptions={subscriptions} features={features} />}
          {!dataLoading && page === 'addresses'     && isAdmin && <AddressesPage addresses={addresses} reload={reloadBg} isAdmin={isAdmin} studioId={studio?.id} />}
          {!dataLoading && page === 'booking'       && isAdmin && <BookingSettingsPage directions={directions} studioId={studio?.id} />}
        </div>

        {/* Mobile bottom nav */}
        {isMobile && (
          <div className="mobile-nav">
            {[
              { id: 'dashboard', icon: '📊', label: 'Главная', show: true },
              { id: 'calendar', icon: '📅', label: 'Расписание', show: true },
              { id: 'leads', icon: '📋', label: 'Заявки', show: isAdmin, badge: leadsCount },
              { id: 'clients', icon: '👨‍👧', label: 'Клиенты', show: isAdmin, badge: newCount },
              { id: 'payments', icon: '💳', label: 'Оплаты', show: isAdmin },
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

      {/* Модалка смены пароля */}
      {pwdModalOpen && (
        <Modal title="Сменить пароль" onClose={() => { setPwdModalOpen(false); setPwdMessage(null) }}>
          <div className="form-group">
            <label className="form-label">Новый пароль</label>
            <input
              type="password"
              className="form-input"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Минимум 6 символов"
              autoComplete="new-password"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Подтвердите пароль</label>
            <input
              type="password"
              className="form-input"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Повторите новый пароль"
              autoComplete="new-password"
              onKeyDown={e => { if (e.key === 'Enter') changePassword() }}
              style={{ fontSize: 16 }}
            />
          </div>
          {pwdMessage && (
            <div className={pwdMessage.type === 'success' ? 'alert alert-success' : 'alert alert-error'}>
              {pwdMessage.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setPwdModalOpen(false); setPwdMessage(null) }} disabled={pwdSaving}>
              Отмена
            </button>
            <button className="btn btn-primary" onClick={changePassword} disabled={pwdSaving || !newPwd || !confirmPwd}>
              {pwdSaving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
