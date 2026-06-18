import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import LoginPage from './pages/LoginPage'
import CRM from './pages/CRM'
import BookingPage from './pages/BookingPage'
import OnboardingPage from './pages/OnboardingPage'
import { GlobalStyles, T } from './styles.jsx'
import { checkBirthdays } from './birthdays.js'

function SetPasswordPage({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return }
    if (password !== confirm) { setError('Пароли не совпадают'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError('Ошибка: ' + error.message); setLoading(false); return }
    onDone()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-icon.svg" alt="" style={{ width: 60, marginBottom: 8 }} />
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20 }}>Установите пароль</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Придумайте пароль для входа в систему</div>
        </div>
        {error && <div className="alert alert-error">⚠️ {error}</div>}
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Новый пароль</label>
            <input className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="минимум 6 символов" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Повторите пароль</label>
            <input className="form-input" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="повторите пароль" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 4 }}>
            {loading ? 'Сохранение...' : '✅ Сохранить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}

const Loader = () => (
  <>
    <GlobalStyles />
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F0EDD8' }}>
      <div style={{ textAlign:'center' }}>
        <img src="/logo-icon.svg" alt="" style={{ width: 60, marginBottom: 12 }} />
        <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:18 }}>Учтено</div>
        <div style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Загрузка...</div>
      </div>
    </div>
  </>
)

export default function App() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [studio, setStudio] = useState(null)      // активная студия
  const [studios, setStudios] = useState([])       // все студии пользователя
  const [loading, setLoading] = useState(true)
  const [needPassword, setNeedPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadUserData(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') {
        setNeedPassword(true)
        setLoading(false)
        return
      }
      if (event === 'USER_UPDATED') {
        setNeedPassword(false)
        if (session) loadUserData(session.user.id)
        return
      }
      if (event === 'SIGNED_IN') {
        if (session) loadUserData(session.user.id)
      }
      if (event === 'SIGNED_OUT') {
        setStaff(null)
        setStudio(null)
        setStudios([])
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadUserData = async (userId) => {
    setLoading(true)
    try {
      // Загружаем все студии пользователя через studio_members
      const { data: memberships } = await supabase
        .from('studio_members')
        .select('studio_id, role, studios(id, name)')
        .eq('user_id', userId)

      const userStudios = memberships?.map(m => ({ ...m.studios, role: m.role })) || []
      setStudios(userStudios)

      if (userStudios.length > 0) {
        // Берём первую студию (или последнюю выбранную из localStorage)
        const savedStudioId = parseInt(localStorage.getItem('activeStudioId'))
        const activeStudio = userStudios.find(s => s.id === savedStudioId) || userStudios[0]
        setStudio(activeStudio)
        await loadStaff(userId, activeStudio.id)
      } else {
        // Нет студий — показываем онбординг
        setStaff(null)
        setStudio(null)
      }
    } catch (e) {
      console.error('loadUserData error:', e)
    }
    setLoading(false)
    setTimeout(() => checkBirthdays(), 3000)
  }

  const loadStaff = async (userId, studioId) => {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .eq('studio_id', studioId)
      .maybeSingle()
    setStaff(data)
  }

  const switchStudio = async (newStudio) => {
    setLoading(true)
    localStorage.setItem('activeStudioId', newStudio.id)
    setStudio(newStudio)
    await loadStaff(session.user.id, newStudio.id)
    setLoading(false)
  }

  const handleOnboardingDone = async () => {
    await loadUserData(session.user.id)
  }

  if (loading) return <Loader />

  if (window.location.pathname === '/zapis') return (
    <><GlobalStyles /><BookingPage /></>
  )

  return (
    <>
      <GlobalStyles />
      {needPassword
        ? <SetPasswordPage onDone={() => setNeedPassword(false)} />
        : !session
          ? <LoginPage />
          : studios.length === 0
            ? <OnboardingPage session={session} onDone={handleOnboardingDone} />
            : <CRM
                session={session}
                staff={staff}
                studio={studio}
                studios={studios}
                onSwitchStudio={switchStudio}
              />
      }
    </>
  )
}
