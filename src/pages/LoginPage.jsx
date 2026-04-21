import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

export default function LoginPage() {
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

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🐾</div>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: T.ink }}>PandaCRM</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Академия Панды</div>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <form onSubmit={login}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '11px' }}>
            {loading ? 'Вход...' : '→ Войти'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '12px 14px', background: T.cream, borderRadius: 12, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
          <strong style={{ color: T.ink }}>Первый вход:</strong><br />
          Попросите директора создать для вас аккаунт в разделе «Сотрудники»
        </div>
      </div>
    </div>
  )
}
