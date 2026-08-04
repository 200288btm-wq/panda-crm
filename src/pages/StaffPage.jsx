import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, ROLES, ROLE_COLORS, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

// Генерация случайного кода приглашения
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function InviteModal({ onClose, onDone, studioId, currentUserId }) {
  const [step, setStep] = useState('form') // form | checking | result_email | result_code
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('Администратор')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')

  const invite = async () => {
    if (!email || !name) { setError('Заполните имя и email'); return }
    setLoading(true); setError('')

    try {
      // Зарегистрирован ли уже такой email (проверка по auth.users на сервере).
      // Раньше проверяли по staff, но под RLS видна только своя студия — и человек
      // из другой студии ошибочно считался новым.
      const { data: alreadyRegistered } = await supabase
        .rpc('email_is_registered', { p_email: email.trim() })

      if (alreadyRegistered) {
        // Уже зарегистрирован — приглашаем через функцию: она создаёт код,
        // предсоздаёт staff и отправляет письмо со ссылкой /join?code=... и кодом.
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(
          `https://dmvqiuminxrtcaylfcwg.supabase.co/functions/v1/invite-existing`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ email, name, role, phone, studio_id: studioId }),
          }
        )
        const result = await res.json()
        if (!res.ok || result.error) {
          setError('Ошибка: ' + (
            result.error === 'already_member' ? 'Этот человек уже в вашей студии'
            : result.error === 'not_registered' ? 'Пользователь не зарегистрирован'
            : (result.error || 'Неизвестная ошибка')
          ))
          setLoading(false)
          return
        }
        setGeneratedCode(result.code)
        setStep('result_code')
      } else {
        // Новый пользователь — отправляем email через Edge Function
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(
          `https://dmvqiuminxrtcaylfcwg.supabase.co/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ email, name, role, phone, studio_id: studioId }),
          }
        )
        const result = await res.json()
        if (!res.ok || result.error) {
          setError('Ошибка: ' + (result.error || 'Неизвестная ошибка'))
          setLoading(false)
          return
        }
        setStep('result_email')
      }
    } catch (e) {
      setError('Ошибка: ' + e.message)
    }
    setLoading(false)
  }

  if (step === 'result_email') return (
    <Modal title="✅ Приглашение отправлено" onClose={() => { onDone(); onClose() }}
      footer={<button className="btn btn-primary" onClick={() => { onDone(); onClose() }}>Готово</button>}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📨</div>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{name} приглашён</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, background: T.cream, borderRadius: 12, padding: '12px 16px', textAlign: 'left' }}>
          <strong style={{ color: T.ink }}>Что делать дальше:</strong><br />
          1. Сотруднику отправлено письмо на <strong>{email}</strong><br />
          2. Пусть перейдёт по ссылке, зарегистрируется и войдёт<br />
          3. После входа выберет «Войти по коду приглашения» если нужно<br />
          <br />
          <strong style={{ color: T.orange }}>⚠️ Если письмо не пришло:</strong><br />
          Попросите сотрудника зарегистрироваться самостоятельно на странице входа
        </div>
      </div>
    </Modal>
  )

  if (step === 'result_code') return (
    <Modal title="✅ Код приглашения создан" onClose={() => { onDone(); onClose() }}
      footer={<button className="btn btn-primary" onClick={() => { onDone(); onClose() }}>Готово</button>}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
          {name} уже зарегистрирован
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Пользователь с адресом <strong>{email}</strong> уже есть в системе.<br />
          Передайте ему этот код — он действует 24 часа:
        </div>
        <div style={{
          fontSize: 32, fontFamily: 'monospace', fontWeight: 900, letterSpacing: 6,
          background: T.greenBg, color: T.greenDark, borderRadius: 14, padding: '16px 24px',
          marginBottom: 12, border: `2px solid ${T.green}33`
        }}>
          {generatedCode}
        </div>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Сотрудник вводит этот код в своём кабинете<br />
          в разделе «Добавить студию»
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal title="+ Новый сотрудник" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={invite} disabled={loading}>{loading ? 'Проверка...' : 'Добавить'}</button></>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group"><label className="form-label">Имя и фамилия *</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Иванова Мария Алексеевна" autoFocus />
      </div>
      <div className="form-group"><label className="form-label">Email *</label>
        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@example.com" />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Роль</label>
          <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Телефон</label>
          <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 xxx" />
        </div>
      </div>
      <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
        Если пользователь уже зарегистрирован — система автоматически сгенерирует код приглашения вместо письма.
      </div>
    </Modal>
  )
}

function EditStaffModal({ member, onClose, onSave }) {
  const [f, setF] = useState({
    name: member.name || '',
    role: member.role || 'Преподаватель',
    phone: member.phone || '',
    email: member.email || '',
    is_active: member.is_active ?? true
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`✏️ ${member.name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Имя и фамилия</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="form-group"><label className="form-label">Email</label>
        <input className="form-input" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Роль</label>
          <select className="form-input" value={f.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Телефон</label>
          <input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} style={{ accentColor: T.green, width: 16, height: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Активный сотрудник (имеет доступ)</span>
        </label>
      </div>
    </Modal>
  )
}

export default function StaffPage({ staffList, reload, studioId, currentUserId }) {
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const save = async (f) => {
    const { error } = await supabase.from('staff').update({
      name: f.name, role: f.role, phone: f.phone, email: f.email, is_active: f.is_active,
    }).eq('id', showEdit.id)
    if (error) { alert('Ошибка сохранения: ' + error.message); return }
    setShowEdit(null); reload()
  }

  const deactivate = async (id) => {
    if (!confirm('Отозвать доступ у сотрудника?')) return
    await supabase.from('staff').update({ is_active: false }).eq('id', id)
    reload()
  }

  const deleteStaff = async (s) => {
    if (!confirm(`Удалить сотрудника «${s.name}»? Это действие нельзя отменить.`)) return
    await supabase.from('staff').delete().eq('id', s.id)
    reload()
  }

  const active = staffList.filter(s => s.is_active)
  const inactive = staffList.filter(s => !s.is_active)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['Всего', staffList.length, T.ink], ['Активных', active.length, T.greenDark], ['Неактивных', inactive.length, T.muted]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 22, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Добавить сотрудника</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { role: 'Директор', icon: '👑', color: '#7c3aed', bg: '#f5f3ff', desc: 'Полный доступ ко всем данным, финансам и настройкам' },
          { role: 'Администратор', icon: '🗂️', color: '#3b82f6', bg: '#eff6ff', desc: 'Клиенты, оплаты, расписание, педагоги' },
          { role: 'Преподаватель', icon: '👩‍🏫', color: T.greenDark, bg: T.greenBg, desc: 'Только расписание и список своих групп' },
        ].map(r => (
          <div key={r.role} style={{ background: r.bg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${r.color}22` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{r.icon}</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, color: r.color, marginBottom: 3 }}>{r.role}</div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4, marginBottom: 6 }}>{r.desc}</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: r.color }}>
              {staffList.filter(s => s.role === r.role).length}
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap" style={{ display: isMobile ? 'none' : 'block' }}>
        <table>
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Email</th><th>Телефон</th><th>Вход</th><th>Статус</th><th>Добавлен</th><th></th></tr></thead>
          <tbody>
            {staffList.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <div className="avatar" style={{ background: s.is_active ? hashColor(s.name) : '#d1d5db', width: 34, height: 34, fontSize: 13 }}>
                      {(s.name || '?')[0]}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  </div>
                </td>
                <td><span className={`badge ${ROLE_COLORS[s.role] || 'badge-gray'}`}>{s.role}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{s.email || '—'}</td>
                <td style={{ fontSize: 12, color: T.muted }}>{s.phone || '—'}</td>
                <td>
                  {s.user_id
                    ? <span className="badge badge-green">✅ Активирован</span>
                    : <span className="badge badge-orange">⏳ Не входил</span>
                  }
                </td>
                <td><span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>{s.is_active ? 'Активен' : 'Отключён'}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{s.created_at?.slice(0, 10) || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(s)}>✏️</button>
                    {s.is_active && <button className="btn btn-ghost btn-sm" onClick={() => deactivate(s.id)} title="Отозвать доступ">🚫</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteStaff(s)} style={{ color: '#e05a5a' }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
            {!staffList.length && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">🔑</div><div className="empty-text">Сотрудников нет</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Карточки для мобильных */}
      <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {staffList.map(s => (
          <div key={s.id} className="card card-pad" style={{ borderRadius: 14, background: 'white', border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div className="avatar" style={{ background: s.is_active ? hashColor(s.name) : '#d1d5db', width: 38, height: 38, fontSize: 14 }}>
                {(s.name || '?')[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{s.name}</div>
              </div>
              <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>{s.is_active ? 'Активен' : 'Отключён'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Роль</div>
                <span className={`badge ${ROLE_COLORS[s.role] || 'badge-gray'}`}>{s.role}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Телефон</div>
                <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>{s.phone || '—'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{s.email || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: T.muted }}>{s.user_id ? '✅ Активирован' : '⏳ Не входил'}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(s)}>✏️</button>
                {s.is_active && <button className="btn btn-ghost btn-sm" onClick={() => deactivate(s.id)}>🚫</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => deleteStaff(s)} style={{ color: '#e05a5a' }}>🗑️</button>
              </div>
            </div>
          </div>
        ))}
        {!staffList.length && <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">🔑</div>
          <div className="empty-text">Сотрудников нет</div>
        </div>}
      </div>

      <div style={{ marginTop: 16, background: T.cream, borderRadius: 14, padding: '14px 16px', fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
        <strong style={{ color: T.ink }}>📌 Как добавить сотрудника:</strong><br />
        • Если сотрудник <strong>новый</strong> — придёт письмо со ссылкой для регистрации<br />
        • Если сотрудник <strong>уже зарегистрирован</strong> — система создаст код на 24 часа, передайте его сотруднику
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={reload} studioId={studioId} currentUserId={currentUserId} />}
      {showEdit && <EditStaffModal member={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
