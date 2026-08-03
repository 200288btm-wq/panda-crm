import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

// Создать студию: студия -> членство -> staff -> settings со слагом.
// Вынесено, чтобы использовать и при онбординге, и из личного кабинета.
export async function createStudioFlow(session, studioName) {
  // Создание студии выполняется на сервере (SECURITY DEFINER), чтобы вписать
  // владельца в studio_members привилегированно — прямая вставка с клиента закрыта.
  const { data, error } = await supabase.rpc('create_studio', { p_name: studioName.trim() })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export default function OnboardingPage({ session, onDone }) {
  const [mode, setMode] = useState(null) // null | 'create' | 'code'
  const [studioName, setStudioName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const createStudio = async (e) => {
    e.preventDefault()
    if (!studioName.trim()) { setError('Введите название студии'); return }
    setLoading(true); setError('')
    try {
      await createStudioFlow(session, studioName)
      onDone()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    }
    setLoading(false)
  }

  const joinByCode = async (e) => {
    e.preventDefault()
    if (!code.trim()) { setError('Введите код приглашения'); return }
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('redeem_invitation', { p_code: code.trim().toUpperCase() })
      if (error) throw error
      if (data?.error) {
        setError(
          data.error === 'invalid_code' ? 'Код не найден или истёк срок действия'
          : data.error === 'already_member' ? 'Вы уже состоите в этой студии'
          : 'Ошибка: ' + data.error
        )
        setLoading(false)
        return
      }
      onDone()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    }
    setLoading(false)
  }

  const logout = () => supabase.auth.signOut()

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-icon.svg" alt="" style={{ width: 60, marginBottom: 8 }} />
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: T.ink }}>Учтено</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Вы вошли как <strong>{session.user.email}</strong>
          </div>
        </div>

        {!mode && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito,sans-serif', textAlign: 'center', marginBottom: 20, color: T.ink }}>
              Добро пожаловать! Что хотите сделать?
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', marginBottom: 12, fontSize: 15 }}
              onClick={() => { setMode('create'); setError('') }}>
              🏫 Создать новую студию
            </button>
            <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}
              onClick={() => { setMode('code'); setError('') }}>
              🔑 Войти по коду приглашения
            </button>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}`, textAlign: 'center' }}>
              <button onClick={logout} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer' }}>
                ← Выйти из аккаунта
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito,sans-serif', marginBottom: 16, color: T.ink }}>
              🏫 Создать новую студию
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <form onSubmit={createStudio}>
              <div className="form-group">
                <label className="form-label">Название студии *</label>
                <input className="form-input" value={studioName}
                  onChange={e => setStudioName(e.target.value)}
                  placeholder="Например: Академия Панды" autoFocus required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 4 }}>
                {loading ? 'Создание...' : '✅ Создать студию'}
              </button>
            </form>
            <button onClick={() => { setMode(null); setError('') }}
              style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', padding: '8px' }}>
              ← Назад
            </button>
          </>
        )}

        {mode === 'code' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito,sans-serif', marginBottom: 8, color: T.ink }}>
              🔑 Код приглашения
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Введите код который прислал вам руководитель студии. Код действует 24 часа.
            </div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}
            <form onSubmit={joinByCode}>
              <div className="form-group">
                <label className="form-label">Код приглашения *</label>
                <input className="form-input" value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX" autoFocus required
                  style={{ letterSpacing: 3, fontSize: 18, textAlign: 'center', fontFamily: 'monospace' }} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 4 }}>
                {loading ? 'Проверка...' : '→ Войти в студию'}
              </button>
            </form>
            <button onClick={() => { setMode(null); setError('') }}
              style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', padding: '8px' }}>
              ← Назад
            </button>
          </>
        )}
      </div>
    </div>
  )
}
