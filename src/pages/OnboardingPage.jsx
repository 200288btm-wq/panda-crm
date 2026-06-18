import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

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
      // Создаём студию
      const { data: studio, error: studioErr } = await supabase
        .from('studios')
        .insert({ name: studioName.trim(), owner_id: session.user.id })
        .select()
        .single()

      if (studioErr) throw studioErr

      // Добавляем себя как Директора в studio_members
      const { error: memberErr } = await supabase
        .from('studio_members')
        .insert({ studio_id: studio.id, user_id: session.user.id, role: 'Директор' })

      if (memberErr) throw memberErr

      // Создаём запись в staff
      const { error: staffErr } = await supabase
        .from('staff')
        .insert({
          user_id: session.user.id,
          studio_id: studio.id,
          name: session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          role: 'Директор',
          is_active: true,
        })

      if (staffErr) throw staffErr

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
      // Ищем приглашение по коду
      const { data: inv, error: invErr } = await supabase
        .from('invitations')
        .select('*, studios(id, name)')
        .eq('code', code.trim().toUpperCase())
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (invErr) throw invErr
      if (!inv) {
        setError('Код не найден или истёк срок действия')
        setLoading(false)
        return
      }

      // Добавляем в studio_members
      const { error: memberErr } = await supabase
        .from('studio_members')
        .insert({ studio_id: inv.studio_id, user_id: session.user.id, role: inv.role })

      if (memberErr && !memberErr.message.includes('duplicate')) throw memberErr

      // Создаём запись в staff если нет
      const { data: existingStaff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('studio_id', inv.studio_id)
        .maybeSingle()

      if (!existingStaff) {
        await supabase.from('staff').insert({
          user_id: session.user.id,
          studio_id: inv.studio_id,
          name: session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          role: inv.role,
          is_active: true,
        })
      }

      // Отмечаем приглашение использованным
      await supabase
        .from('invitations')
        .update({ used_at: new Date().toISOString(), used_by: session.user.id })
        .eq('id', inv.id)

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
