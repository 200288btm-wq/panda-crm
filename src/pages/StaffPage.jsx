import { useState, useEffect } from 'react'
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
    setLoading(true); setError('')

    try {
      // Call Edge Function to create auth user + staff record
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `https://dmvqiuminxrtcaylfcwg.supabase.co/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email, name, role, phone }),
        }
      )
      const result = await res.json()
      if (!res.ok || result.error) {
        setError('Ошибка: ' + (result.error || 'Неизвестная ошибка'))
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch (e) {
      setError('Ошибка соединения: ' + e.message)
    }
    setLoading(false)
  }

  if (success) return (
    <Modal title="✅ Сотрудник добавлен" onClose={() => { onDone(); onClose() }}
      footer={<button className="btn btn-primary" onClick={() => { onDone(); onClose() }}>Готово</button>}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{name} добавлен</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, background: T.cream, borderRadius: 12, padding: '12px 16px', textAlign: 'left' }}>
          <strong style={{ color: T.ink }}>Что делать дальше:</strong><br />
          1. Сотруднику отправлена ссылка на <strong>{email}</strong><br />
          2. Пусть перейдёт по ссылке и установит пароль<br />
          3. После входа в систему аккаунт привяжется автоматически<br />
          <br />
          <strong style={{ color: T.orange }}>⚠️ Если письмо не пришло:</strong><br />
          Попросите сотрудника нажать «Забыли пароль?» на странице входа
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal title="+ Новый сотрудник" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={invite} disabled={loading}>{loading ? 'Добавление...' : 'Добавить'}</button></>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group"><label className="form-label">Имя и фамилия *</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Иванова Мария Алексеевна" autoFocus />
      </div>
      <div className="form-group"><label className="form-label">Email для входа *</label>
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
        <strong style={{ color: T.ink }}>Доступ по ролям:</strong><br />
        🟣 <strong>Директор</strong> — полный доступ<br />
        🔵 <strong>Администратор</strong> — клиенты, оплаты, расписание<br />
        🟢 <strong>Преподаватель</strong> — только расписание
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

export default function StaffPage({ staffList, reload }) {
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [authUsers, setAuthUsers] = useState({}) // email -> confirmed status

  // Load auth user statuses
  useEffect(() => {
    // We can check who has user_id linked (= has logged in at least once)
    const linked = {}
    staffList.forEach(s => { linked[s.id] = !!s.user_id })
    setAuthUsers(linked)
  }, [staffList])

  const save = async (f) => {
    const { error } = await supabase.from('staff').update({
      name: f.name,
      role: f.role,
      phone: f.phone,
      email: f.email,
      is_active: f.is_active,
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

      {/* Role cards */}
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

      {/* Staff table */}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Email</th><th>Телефон</th><th>Вход</th><th>Статус</th><th>Добавлен</th><th></th></tr></thead>
          <tbody>
            {staffList.map(s => {
              const hasLinked = !!s.user_id
              return (
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
                    {hasLinked
                      ? <span className="badge badge-green">✅ Активирован</span>
                      : <span className="badge badge-orange">⏳ Не входил</span>
                    }
                  </td>
                  <td>
                    <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {s.is_active ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: T.muted }}>{s.created_at?.slice(0, 10) || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(s)}>✏️</button>
                      {s.is_active && <button className="btn btn-ghost btn-sm" onClick={() => deactivate(s.id)} title="Отозвать доступ">🚫</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteStaff(s)} title="Удалить сотрудника" style={{ color: '#e05a5a' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!staffList.length && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">🔑</div><div className="empty-text">Сотрудников нет</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, background: T.cream, borderRadius: 14, padding: '14px 16px', fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
        <strong style={{ color: T.ink }}>📌 Как добавить сотрудника:</strong><br />
        1. Нажми «+ Добавить сотрудника» и заполни имя, email и роль<br />
        2. Сотруднику придёт письмо — пусть перейдёт по ссылке и установит пароль<br />
        3. После первого входа статус изменится на ✅ Активирован<br />
        <strong style={{ color: T.orange }}>⚠️ Если письмо не приходит:</strong> скажи сотруднику нажать «Забыли пароль?» на странице входа
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={reload} />}
      {showEdit && <EditStaffModal member={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
