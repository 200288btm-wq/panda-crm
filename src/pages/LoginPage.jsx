import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const PandaLogo = () => (
  <svg width="52" height="52" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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

export default function LoginPage() {
  const [mode, setMode] = useState('login') // login | forgot | sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Неверный email или пароль')
    setLoading(false)
  }

  const sendReset = async (e) => {
    e.preventDefault()
    if (!email) { setError('Введите email'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/?reset=true',
    })
    if (error) {
      setError('Ошибка отправки. Проверьте email.')
    } else {
      setMode('sent')
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <PandaLogo />
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: T.ink, marginTop: 8 }}>PandaCRM</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Академия Панды</div>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        {/* ── Login form ── */}
        {mode === 'login' && (
          <form onSubmit={login}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ margin: 0 }}>Пароль</label>
                <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                  style={{ background: 'none', border: 'none', color: T.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                  Забыли пароль?
                </button>
              </div>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px' }}>
              {loading ? 'Вход...' : '→ Войти'}
            </button>
          </form>
        )}

        {/* ── Forgot password form ── */}
        {mode === 'forgot' && (
          <form onSubmit={sendReset}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Введите email — мы отправим ссылку для установки пароля.
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
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

        {/* ── Email sent confirmation ── */}
        {mode === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📨</div>
            <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Письмо отправлено!</div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 20 }}>
              Проверьте почту <strong>{email}</strong>.<br />
              Перейдите по ссылке в письме чтобы установить пароль.
            </div>
            <button className="btn btn-outline" onClick={() => { setMode('login'); setError('') }}
              style={{ width: '100%', justifyContent: 'center' }}>
              ← Вернуться ко входу
            </button>
          </div>
        )}

        {mode === 'login' && (
          <div style={{ marginTop: 18, padding: '12px 14px', background: T.cream, borderRadius: 12, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
            <strong style={{ color: T.ink }}>Первый вход:</strong><br />
            Нажмите «Забыли пароль?» и введите свой email — придёт ссылка для установки пароля.
          </div>
        )}
      </div>
    </div>
  )
}
