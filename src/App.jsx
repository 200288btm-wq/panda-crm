import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import LoginPage from './pages/LoginPage'
import CRM from './pages/CRM'
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
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Придумайте пароль для входа в PandaCRM</div>
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

export default function App() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needPassword, setNeedPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchStaff(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') {
        // User came from reset password link — show set password form
        setNeedPassword(true)
        setLoading(false)
        return
      }
      if (event === 'USER_UPDATED') {
        // Password was just set — go to CRM
        setNeedPassword(false)
        if (session) fetchStaff(session.user.id)
        return
      }
      if (session) fetchStaff(session.user.id)
      else { setStaff(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchStaff = async (userId) => {
    const { data } = await supabase.from('staff').select('*').eq('user_id', userId).single()
    setStaff(data)
    setLoading(false)
    setTimeout(() => checkBirthdays(), 3000)
  }

  if (loading) return (
    <>
      <GlobalStyles />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F0EDD8' }}>
        <div style={{ textAlign:'center' }}>
          <img src="/logo-icon.svg" alt="" style={{ width: 60, marginBottom: 12 }} />
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:18 }}>PandaCRM</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Загрузка...</div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <GlobalStyles />
      {needPassword
        ? <SetPasswordPage onDone={() => setNeedPassword(false)} />
        : !session
          ? <LoginPage />
          : <CRM session={session} staff={staff} />
      }
    </>
  )
}
