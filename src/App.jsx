import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import LoginPage from './pages/LoginPage'
import CRM from './pages/CRM'
import BookingPage from './pages/BookingPage'
import OnboardingPage from './pages/OnboardingPage'
import { GlobalStyles, T } from './styles.jsx'
import UiHost from './components/UiHost'

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

// Страница вступления по коду из письма-приглашения (/join?code=XXXX)
function JoinPage({ session }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code')
    if (c) setCode(c.toUpperCase())
  }, [])

  const join = async () => {
    if (!code.trim()) { setError('Введите код'); return }
    setLoading(true); setError('')
    try {
      // Запоминаем, в каких студиях человек состоял ДО вступления —
      // так мы потом точно поймём, какая студия новая, независимо от
      // того, что именно возвращает RPC.
      const before = await supabase.from('studio_members').select('studio_id')
      const beforeIds = new Set((before.data || []).map(r => r.studio_id))

      const { data, error } = await supabase.rpc('redeem_invitation', { p_code: code.trim().toUpperCase() })
      if (error) throw error
      if (data?.error) {
        setError(
          data.error === 'invalid_code' ? 'Код не найден или истёк'
          : data.error === 'already_member' ? 'Вы уже состоите в этой студии'
          : 'Ошибка: ' + data.error
        )
        setLoading(false); return
      }
      // Открываем именно ту студию, в которую вступили, а не последнюю
      // выбранную: человек нажал «Вступить» и ждёт увидеть её.
      let newStudioId = data?.studio_id ?? null
      if (!newStudioId) {
        const after = await supabase.from('studio_members').select('studio_id')
        newStudioId = (after.data || []).map(r => r.studio_id).find(id => !beforeIds.has(id)) ?? null
      }
      if (newStudioId) {
        localStorage.setItem('activeStudioId', String(newStudioId))
        localStorage.setItem('crmPage', 'dashboard')
      }

      setDone(true)
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch (e) {
      setError('Ошибка: ' + e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0EDD8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '28px 32px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <img src="/logo-icon.svg" alt="" style={{ width: 52, marginBottom: 12 }} />
        {done ? (
          <>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, marginBottom: 8, color: T.ink }}>Готово! 🎉</div>
            <div style={{ color: T.muted, fontSize: 14 }}>Вы вступили в студию. Открываем…</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, marginBottom: 6, color: T.ink }}>Вступление в студию</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Вы вошли как <b>{session.user.email}</b>. Подтвердите код приглашения.</div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
            <input className="form-input" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX" style={{ letterSpacing: 3, fontSize: 18, textAlign: 'center', fontFamily: 'monospace', marginBottom: 12 }} />
            <button className="btn btn-primary" onClick={join} disabled={loading || !code}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {loading ? 'Вступаем…' : '✅ Вступить в студию'}
            </button>
            <button onClick={() => { window.location.href = '/' }}
              style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer' }}>
              Позже
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [studio, setStudio] = useState(null)      // активная студия
  const [studios, setStudios] = useState([])       // все студии пользователя
  const [loading, setLoading] = useState(true)
  const [needPassword, setNeedPassword] = useState(false)
  const loadedUserRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadedUserRef.current = session.user.id
        loadUserData(session.user.id)
      }
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
        // Загружаем данные только при первом входе.
        // При возврате фокуса на вкладку Supabase повторно шлёт SIGNED_IN /
        // TOKEN_REFRESHED — в этом случае не перезагружаем, иначе закроются
        // открытые формы и потеряются введённые данные.
        if (session && !loadedUserRef.current) {
          loadedUserRef.current = session.user.id
          loadUserData(session.user.id)
        }
      }
      if (event === 'SIGNED_OUT') {
        loadedUserRef.current = null
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

  // Публичная страница записи: только со слагом — /zapis/<slug>
  {
    const m = window.location.pathname.match(/^\/zapis\/([^/]+)\/?$/)
    if (m) return (<><GlobalStyles /><BookingPage slug={decodeURIComponent(m[1])} /></>)
    // Без слага (старый /zapis или /zapis/) — показываем заглушку, а не студию №1
    if (window.location.pathname.replace(/\/+$/, '') === '/zapis') return (
      <><GlobalStyles />
        <div style={{ minHeight:'100vh', background:'#F0EDD8', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ textAlign:'center', maxWidth:380 }}>
            <img src="/logo-icon.svg" alt="" style={{ width:56, marginBottom:12 }} />
            <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:20, marginBottom:8 }}>Ссылка неполная</div>
            <div style={{ color:'#6b7280', fontSize:14 }}>Проверьте адрес страницы записи — он должен содержать имя студии, например <b>/zapis/akademiya-pandy</b>.</div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <GlobalStyles />
      {/* Плашки и окна подтверждения — вместо нативных alert/confirm */}
      <UiHost />
      {needPassword
        ? <SetPasswordPage onDone={() => setNeedPassword(false)} />
        : !session
          ? <LoginPage />
          : window.location.pathname.replace(/\/+$/, '') === '/join'
            ? <JoinPage session={session} />
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
