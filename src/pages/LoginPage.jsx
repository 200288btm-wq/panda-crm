import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const PandaLogo = () => (
  <img src="/logo-icon.svg" alt="Учтено" style={{ width: 64, height: 64, objectFit: 'contain' }} />
)

export default function LoginPage() {
  const [mode, setMode] = useState('login') // login | register | forgot | sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Неверный email или пароль')
    setLoading(false)
  }

  const register = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Введите ваше имя'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } }
    })
    if (error) {
      setError('Ошибка регистрации: ' + error.message)
    } else {
      setMode('sent')
    }
    setLoading(false)
  }

  const loginWithGoogle = async () => {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) { setError('Ошибка входа через Google: ' + error.message); setLoading(false) }
  }

  const sendReset = async (e) => {
    e.preventDefault()
    if (!email) { setError('Введите email'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/?reset=true',
    })
    if (error) {
      if (error.message.includes('rate limit')) {
        setError('Слишком много запросов. Попробуйте через час.')
      } else {
        setError('Ошибка отправки: ' + error.message)
      }
    } else {
      setMode('sent')
    }
    setLoading(false)
  }

  const GoogleButton = () => (
    <button type="button" onClick={loginWithGoogle} disabled={loading}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '11px', borderRadius: 12, border: `1.5px solid ${T.border}`,
        background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
        fontFamily: 'Nunito Sans, sans-serif', color: T.ink, marginBottom: 16,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
        <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
        <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
        <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
      </svg>
      Войти через Google
    </button>
  )

  const Divider = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ fontSize: 12, color: T.muted }}>или</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  )

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <PandaLogo />
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: T.ink, marginTop: 8 }}>Учтено</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>CRM для детских студий</div>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        {/* ── Login ── */}
        {mode === 'login' && (
          <>
            <GoogleButton />
            <Divider />
            <form onSubmit={login}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>Пароль</label>
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                    style={{ background: 'none', border: 'none', color: T.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                    Забыли пароль?
                  </button>
                </div>
                <input className="form-input" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px' }}>
                {loading ? 'Вход...' : '→ Войти'}
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
              <span style={{ color: T.muted }}>Ещё нет аккаунта? </span>
              <button onClick={() => { setMode('register'); setError('') }}
                style={{ background: 'none', border: 'none', color: T.green, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'Nunito Sans, sans-serif' }}>
                Зарегистрироваться
              </button>
            </div>
          </>
        )}

        {/* ── Register ── */}
        {mode === 'register' && (
          <>
            <GoogleButton />
            <Divider />
            <form onSubmit={register}>
              <div className="form-group">
                <label className="form-label">Ваше имя *</label>
                <input className="form-input" value={name}
                  onChange={e => setName(e.target.value)} placeholder="Иванова Мария" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Пароль *</label>
                <input className="form-input" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="минимум 6 символов" required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px' }}>
                {loading ? 'Регистрация...' : '✅ Создать аккаунт'}
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
              <span style={{ color: T.muted }}>Уже есть аккаунт? </span>
              <button onClick={() => { setMode('login'); setError('') }}
                style={{ background: 'none', border: 'none', color: T.green, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'Nunito Sans, sans-serif' }}>
                Войти
              </button>
            </div>
          </>
        )}

        {/* ── Forgot password ── */}
        {mode === 'forgot' && (
          <form onSubmit={sendReset}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Введите email — мы отправим ссылку для установки пароля.
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px' }}>
              {loading ? 'Отправка...' : '📨 Отправить ссылку'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError('') }}
              style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif', padding: '8px' }}>
              ← Вернуться ко входу
            </button>
          </form>
        )}

        {/* ── Sent confirmation ── */}
        {mode === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📨</div>
            <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Письмо отправлено!</div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 20 }}>
              Проверьте почту <strong>{email}</strong>.<br />
              Перейдите по ссылке в письме.
            </div>
            <button className="btn btn-outline" onClick={() => { setMode('login'); setError('') }}
              style={{ width: '100%', justifyContent: 'center' }}>
              ← Вернуться ко входу
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
