import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

const STATUS_T = { 'Активен': 'badge-green', 'В поиске': 'badge-orange', 'Ожидание': 'badge-purple', 'Уволен': 'badge-gray' }
const STATUSES_T = ['Активен', 'В поиске', 'Ожидание', 'Уволен']

function TeacherModal({ teacher, directions, onClose, onSave }) {
  const [f, setF] = useState(teacher ? {
    name: teacher.name || '', phone: teacher.phone || '', direction_ids: teacher.direction_ids || [],
    status: teacher.status || 'Активен', rate: teacher.rate || 0, hired: teacher.hired || '',
    birthday: teacher.birthday || '', lessons_count: teacher.lessons_count || 0,
  } : { name: '', phone: '', direction_ids: [], status: 'Активен', rate: 0, hired: '', birthday: '', lessons_count: 0 })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <Modal title={teacher ? `✏️ ${teacher.name}` : '+ Новый педагог'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">ФИО *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Фамилия Имя Отчество" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Телефон</label>
          <input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+7 xxx" />
        </div>
        <div className="form-group"><label className="form-label">Статус</label>
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUSES_T.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Ставка за занятие, ₽</label>
          <input className="form-input" type="number" value={f.rate} onChange={e => set('rate', +e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Дата приёма</label>
          <input className="form-input" type="date" value={f.hired} onChange={e => set('hired', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">День рождения</label>
          <input className="form-input" type="date" value={f.birthday} onChange={e => set('birthday', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Проведено занятий</label>
          <input className="form-input" type="number" value={f.lessons_count} onChange={e => set('lessons_count', +e.target.value)} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Направления</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {directions.map(d => {
            const on = (f.direction_ids || []).includes(d.id)
            return (
              <label key={d.id} className={`chip ${on ? 'chip-active' : 'chip-inactive'}`}>
                <input type="checkbox" checked={on} style={{ display: 'none' }}
                  onChange={e => set('direction_ids', e.target.checked
                    ? [...(f.direction_ids || []), d.id]
                    : (f.direction_ids || []).filter(x => x !== d.id))} />
                {d.name}
              </label>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export default function TeachersPage({ teachers, directions, reload, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const save = async (f) => {
    // Чистим пустые даты — PostgreSQL не принимает '' для типа date
    const cleaned = {
      ...f,
      hired: f.hired || null,
      birthday: f.birthday || null,
      rate: +f.rate || 0,
      lessons_count: +f.lessons_count || 0,
    }
    if (!cleaned.name?.trim()) {
      alert('Пожалуйста, укажите ФИО педагога')
      return
    }
    if (showEdit) {
      const { error } = await supabase.from('teachers').update(cleaned).eq('id', showEdit.id)
      if (error) { alert('Ошибка сохранения: ' + error.message); return }
      setShowEdit(null)
    } else {
      const { error } = await supabase.from('teachers').insert(cleaned)
      if (error) { alert('Ошибка сохранения: ' + error.message); return }
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить педагога «${name}»?`)) return
    const { error } = await supabase.from('teachers').delete().eq('id', id)
    if (error) { alert('Ошибка удаления: ' + error.message); return }
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Добавить педагога</button>
      </div>
      <div className="table-wrap" style={{ display: isMobile ? 'none' : 'block' }}><table>
        <thead><tr><th>ФИО</th><th>Направления</th><th>Статус</th><th>Ставка / занятие</th><th>Проведено</th><th>Принят</th><th>Контакт</th><th></th></tr></thead>
        <tbody>
          {teachers.map(t => (
            <tr key={t.id}>
              <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="avatar" style={{ background: hashColor(t.name), width: 32, height: 32, fontSize: 13 }}>{(t.name || '?')[0]}</div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
              </div></td>
              <td style={{ fontSize: 12 }}>{(t.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td><span className={`badge ${STATUS_T[t.status] || 'badge-gray'}`}>{t.status}</span></td>
              <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(t.rate)}</span></td>
              <td style={{ textAlign: 'center', fontFamily: 'Nunito,sans-serif', fontWeight: 800 }}>{t.lessons_count}</td>
              <td style={{ fontSize: 12, color: T.muted }}>{t.hired || '—'}</td>
              <td style={{ fontSize: 12, color: T.muted }}>{t.phone || '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(t)}>✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => del(t.id, t.name)} style={{ color: T.red }}>🗑️</button>
                </div>
              </td>
            </tr>
          ))}
          {!teachers.length && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">👩‍🏫</div><div className="empty-text">Педагогов нет</div></div></td></tr>}
        </tbody>
      </table></div>

      {/* Карточки для мобильных */}
      <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {teachers.map(t => (
          <div key={t.id} className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div className="avatar" style={{ background: hashColor(t.name), width: 38, height: 38, fontSize: 14 }}>{(t.name || '?')[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{t.name}</div>
              </div>
              <span className={`badge ${STATUS_T[t.status] || 'badge-gray'}`}>{t.status}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Ставка</div>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(t.rate)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Телефон</div>
                <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>{t.phone || '—'}</div>
              </div>
            </div>
            {(t.direction_ids || []).length > 0 && (
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
                {(t.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(t)}>✏️</button>
              <button className="btn btn-ghost btn-sm" onClick={() => del(t.id, t.name)} style={{ color: T.red }}>🗑️</button>
            </div>
          </div>
        ))}
        {!teachers.length && <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">👩‍🏫</div><div className="empty-text">Педагогов нет</div>
        </div>}
      </div>
      {showAdd && <TeacherModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <TeacherModal teacher={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
