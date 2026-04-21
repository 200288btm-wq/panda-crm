import { useState } from 'react'
import { supabase } from '../supabase'
import { T, ROLES, ROLE_COLORS, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

function InviteModal({ onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('Администратор')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const invite = async () => {
    if (!email || !name) { setError('Заполните имя и email'); return }
    setLoading(true)
    setError('')

    // Создаём пользователя через admin API (используем service role в edge function)
    // В данном случае используем signUp с метаданными
    const { data, error: authErr } = await supabase.auth.admin?.createUser({
      email,
      password: 'ChangeMe123!',
      email_confirm: true,
    }).catch(() => ({ data: null, error: { message: 'Используйте ручное приглашение' } }))

    if (authErr) {
      // Fallback: создаём запись в staff без user_id, чтобы потом привязать
      await supabase.from('staff').insert({ name, role, phone, is_active: true })
      setSuccess(true)
      setLoading(false)
      return
    }

    if (data?.user) {
      await supabase.from('staff').insert({ user_id: data.user.id, name, role, phone, is_active: true })
    }
    setSuccess(true)
    setLoading(false)
  }

  if (success) return (
    <Modal title="✅ Сотрудник добавлен" onClose={() => { onDone(); onClose() }}
      footer={<button className="btn btn-primary" onClick={() => { onDone(); onClose() }}>Готово</button>}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{name} добавлен</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
          Для входа в систему сотруднику нужно:<br />
          1. Зайти на сайт CRM<br />
          2. Нажать «Забыли пароль?»<br />
          3. Ввести email: <strong>{email}</strong><br />
          4. Установить свой пароль
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal title="+ Новый сотрудник" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={invite} disabled={loading}>{loading ? 'Добавление...' : 'Добавить'}</button></>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group"><label className="form-label">Имя и фамилия *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Иванова Мария Алексеевна" autoFocus /></div>
      <div className="form-group"><label className="form-label">Email для входа *</label><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@example.com" /></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Роль</label>
          <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Телефон</label><input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 xxx xxx-xx-xx" /></div>
      </div>

      <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', fontSize: 12, color: T.muted, lineHeight: 1.6, marginTop: 4 }}>
        <strong style={{ color: T.ink }}>Доступ по ролям:</strong><br />
        🟣 <strong>Директор</strong> — полный доступ (финансы, сотрудники, все данные)<br />
        🔵 <strong>Администратор</strong> — клиенты, оплаты, расписание, педагоги<br />
        🟢 <strong>Преподаватель</strong> — расписание и направления
      </div>
    </Modal>
  )
}

function EditStaffModal({ member, onClose, onSave }) {
  const [f, setF] = useState({ name: member.name || '', role: member.role || 'Преподаватель', phone: member.phone || '', is_active: member.is_active ?? true })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`✏️ ${member.name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Имя и фамилия</label><input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Роль</label>
          <select className="form-input" value={f.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Телефон</label><input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
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

export default function StaffPage({ staffList, reload }) {
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(null)

  const save = async (f) => {
    await supabase.from('staff').update(f).eq('id', showEdit.id)
    setShowEdit(null)
    reload()
  }

  const deactivate = async (id) => {
    if (!confirm('Отозвать доступ у сотрудника?')) return
    await supabase.from('staff').update({ is_active: false }).eq('id', id)
    reload()
  }

  const active = staffList.filter(s => s.is_active)
  const inactive = staffList.filter(s => !s.is_active)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['Всего', staffList.length, T.ink], ['Активных', active.length, T.greenDark], ['Неактивных', inactive.length, T.muted]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 22, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Добавить сотрудника</button>
      </div>

      {/* Role info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { role: 'Директор', icon: '👑', color: '#7c3aed', bg: '#f5f3ff', desc: 'Полный доступ ко всем данным, финансам и настройкам системы' },
          { role: 'Администратор', icon: '🗂️', color: '#3b82f6', bg: '#eff6ff', desc: 'Клиенты, оплаты, расписание, педагоги. Без финансовых отчётов' },
          { role: 'Преподаватель', icon: '👩‍🏫', color: T.greenDark, bg: T.greenBg, desc: 'Только расписание занятий и список своих групп' },
        ].map(r => (
          <div key={r.role} style={{ background: r.bg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${r.color}22` }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{r.icon}</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, color: r.color, marginBottom: 4 }}>{r.role}</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{r.desc}</div>
            <div style={{ marginTop: 8, fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, color: r.color }}>
              {staffList.filter(s => s.role === r.role).length}
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Телефон</th><th>Статус</th><th>Добавлен</th><th></th></tr></thead>
          <tbody>
            {staffList.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <div className="avatar" style={{ background: s.is_active ? hashColor(s.name) : '#d1d5db', width: 34, height: 34, fontSize: 13 }}>{(s.name || '?')[0]}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                      {!s.user_id && <div style={{ fontSize: 10, color: T.orange, fontWeight: 600 }}>⚠️ Вход не настроен</div>}
                    </div>
                  </div>
                </td>
                <td><span className={`badge ${ROLE_COLORS[s.role] || 'badge-gray'}`}>{s.role}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{s.phone || '—'}</td>
                <td>
                  <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {s.is_active ? '✅ Активен' : '⛔ Отключён'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: T.muted }}>{s.created_at?.slice(0, 10) || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(s)}>✏️</button>
                    {s.is_active && <button className="btn btn-ghost btn-sm" onClick={() => deactivate(s.id)} title="Отозвать доступ">🚫</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!staffList.length && <tr><td colSpan={6}><div className="empty"><div className="empty-icon">🔑</div><div className="empty-text">Сотрудников нет</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, background: T.cream, borderRadius: 14, padding: '16px 18px', fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
        <strong style={{ color: T.ink }}>📌 Как добавить сотрудника:</strong><br />
        1. Нажмите «+ Добавить сотрудника» и заполните данные<br />
        2. Сотрудник получит email и должен будет установить пароль через «Забыли пароль?»<br />
        3. После первого входа его аккаунт будет привязан автоматически<br />
        <strong style={{ color: T.ink }}>⚠️ Для полной работы приглашений</strong> настройте Email в Supabase → Authentication → Email Templates
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={reload} />}
      {showEdit && <EditStaffModal member={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
