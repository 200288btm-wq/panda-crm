import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import { createStudioFlow } from './OnboardingPage'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Вынесены на уровень модуля: если объявлять внутри ProfilePage, React пересоздаёт
// их на каждый ре-рендер и поля ввода теряют фокус (печать «по одному символу»).
const Section = ({ title, children }) => (
  <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 16, border: `1px solid ${T.border}` }}>
    <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 16 }}>{title}</div>
    {children}
  </div>
)

const Msg = ({ msg }) => msg ? (
  <div style={{ fontSize: 12, marginTop: 8, color: msg.type === 'error' ? '#e05a5a' : T.greenDark, fontWeight: 600 }}>
    {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
  </div>
) : null

export default function ProfilePage({ session, staff, studio, studios, onSwitchStudio, onAddStudio, onDone }) {
  const [name, setName] = useState(staff?.name || session?.user?.user_metadata?.full_name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState(null)

  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeMsg, setCodeMsg] = useState(null)

  // Создание студии из ЛК
  const [showCreate, setShowCreate] = useState(false)
  const [newStudioName, setNewStudioName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState(null)

  const saveName = async () => {
    if (!name.trim()) return
    setNameSaving(true); setNameMsg(null)
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
    if (!error && staff?.id) {
      await supabase.from('staff').update({ name: name.trim() }).eq('id', staff.id)
    }
    setNameMsg(error ? { type: 'error', text: 'Ошибка: ' + error.message } : { type: 'success', text: 'Имя сохранено' })
    setNameSaving(false)
    setTimeout(() => setNameMsg(null), 2000)
  }

  const savePassword = async () => {
    if (newPwd.length < 6) { setPwdMsg({ type: 'error', text: 'Минимум 6 символов' }); return }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'error', text: 'Пароли не совпадают' }); return }
    setPwdSaving(true); setPwdMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) {
      setPwdMsg({ type: 'error', text: 'Ошибка: ' + error.message })
    } else {
      setPwdMsg({ type: 'success', text: 'Пароль изменён' })
      setNewPwd(''); setConfirmPwd('')
    }
    setPwdSaving(false)
    setTimeout(() => setPwdMsg(null), 2000)
  }

  const createStudio = async () => {
    if (!newStudioName.trim()) { setCreateMsg({ type: 'error', text: 'Введите название' }); return }
    setCreating(true); setCreateMsg(null)
    try {
      await createStudioFlow(session, newStudioName)
      setCreateMsg({ type: 'success', text: `Студия «${newStudioName.trim()}» создана` })
      setNewStudioName('')
      // Обновляем список студий. Членство грузится на уровне приложения,
      // поэтому надёжнее всего перезагрузить, чтобы новая студия появилась в переключателе.
      setTimeout(() => {
        if (onAddStudio) onAddStudio()
        window.location.reload()
      }, 1200)
    } catch (e) {
      setCreateMsg({ type: 'error', text: 'Ошибка: ' + e.message })
    }
    setCreating(false)
  }

  const joinByCode = async () => {
    if (!code.trim()) { setCodeMsg({ type: 'error', text: 'Введите код' }); return }
    setCodeLoading(true); setCodeMsg(null)
    try {
      const { data, error } = await supabase.rpc('redeem_invitation', { p_code: code.trim().toUpperCase() })
      if (error) throw error
      if (data?.error) {
        setCodeMsg({ type: 'error', text:
          data.error === 'invalid_code' ? 'Код не найден или истёк'
          : data.error === 'already_member' ? 'Вы уже состоите в этой студии'
          : 'Ошибка: ' + data.error
        })
        setCodeLoading(false)
        return
      }
      setCodeMsg({ type: 'success', text: 'Вы добавлены в студию' })
      setCode('')
      // Список студий грузится на уровне приложения — перезагрузка покажет новую
      setTimeout(() => {
        if (onAddStudio) onAddStudio()
        window.location.reload()
      }, 1200)
    } catch (e) {
      setCodeMsg({ type: 'error', text: 'Ошибка: ' + e.message })
    }
    setCodeLoading(false)
  }

  const logout = () => supabase.auth.signOut()

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>

      {/* Профиль */}
      <Section title="👤 Профиль">
        <div className="form-group">
          <label className="form-label">Имя</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ваше имя" style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={saveName} disabled={nameSaving}>
              {nameSaving ? '...' : 'Сохранить'}
            </button>
          </div>
          <Msg msg={nameMsg} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Email</label>
          <input className="form-input" value={session?.user?.email || ''} disabled
            style={{ background: T.cream, color: T.muted }} />
        </div>
      </Section>

      {/* Пароль */}
      <Section title="🔑 Сменить пароль">
        <div className="form-group">
          <label className="form-label">Новый пароль</label>
          <input className="form-input" type="password" value={newPwd}
            onChange={e => setNewPwd(e.target.value)} placeholder="минимум 6 символов" />
        </div>
        <div className="form-group">
          <label className="form-label">Повторите пароль</label>
          <input className="form-input" type="password" value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)} placeholder="повторите пароль" />
        </div>
        <button className="btn btn-primary" onClick={savePassword} disabled={pwdSaving || !newPwd || !confirmPwd}>
          {pwdSaving ? 'Сохранение...' : 'Изменить пароль'}
        </button>
        <Msg msg={pwdMsg} />
      </Section>

      {/* Мои студии */}
      <Section title="🏫 Мои студии">
        {studios?.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10, marginBottom: 8,
            background: s.id === studio?.id ? T.greenBg : T.cream,
            border: `1px solid ${s.id === studio?.id ? T.green + '44' : T.border}`
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{s.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.role}</div>
            </div>
            {s.id === studio?.id
              ? <span style={{ fontSize: 11, color: T.greenDark, fontWeight: 700 }}>✅ Активна</span>
              : <button className="btn btn-outline btn-sm" onClick={() => onSwitchStudio && onSwitchStudio(s)}>
                  Переключить
                </button>
            }
          </div>
        ))}

        {/* Создать новую студию */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          {!showCreate ? (
            <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { setShowCreate(true); setCreateMsg(null) }}>
              ➕ Создать новую студию
            </button>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Новая студия</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={newStudioName}
                  onChange={e => setNewStudioName(e.target.value)}
                  placeholder="Название студии" style={{ flex: 1 }} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') createStudio() }} />
                <button className="btn btn-primary" onClick={createStudio} disabled={creating || !newStudioName.trim()}>
                  {creating ? '...' : 'Создать'}
                </button>
              </div>
              <button onClick={() => { setShowCreate(false); setNewStudioName(''); setCreateMsg(null) }}
                style={{ marginTop: 8, background: 'none', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer' }}>
                Отмена
              </button>
              <Msg msg={createMsg} />
            </>
          )}
        </div>

        {/* Добавить по коду */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Войти в другую студию по коду</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX" style={{ flex: 1, letterSpacing: 2, fontFamily: 'monospace', textAlign: 'center' }} />
            <button className="btn btn-outline" onClick={joinByCode} disabled={codeLoading || !code}>
              {codeLoading ? '...' : 'Войти'}
            </button>
          </div>
          <Msg msg={codeMsg} />
        </div>
      </Section>

      {/* Выход */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button onClick={logout}
          style={{ background: 'none', border: 'none', color: '#e05a5a', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 20px' }}>
          🚪 Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
