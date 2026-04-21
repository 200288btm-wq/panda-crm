import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

function DirectionModal({ direction, onClose, onSave }) {
  const [f, setF] = useState(direction ? {
    name: direction.name || '', teacher_name: direction.teacher_name || '',
    schedule: direction.schedule || '', launched: direction.launched || '',
    cost_abo: direction.cost_abo || 0, cost_single: direction.cost_single || 0,
    groups: (direction.groups || ['Группа 1']).join(', '),
  } : { name: '', teacher_name: '', schedule: '', launched: '', cost_abo: 0, cost_single: 0, groups: 'Группа 1' })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = () => {
    onSave({ ...f, cost_abo: +f.cost_abo, cost_single: +f.cost_single, groups: f.groups.split(',').map(g => g.trim()).filter(Boolean) })
  }

  return (
    <Modal title={direction ? `✏️ ${direction.name}` : '+ Новое направление'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Название *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Смышлёная Панда" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Педагог</label>
          <input className="form-input" value={f.teacher_name} onChange={e => set('teacher_name', e.target.value)} placeholder="Иванова М.А." />
        </div>
        <div className="form-group"><label className="form-label">Дата запуска</label>
          <input className="form-input" type="date" value={f.launched} onChange={e => set('launched', e.target.value)} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Расписание</label>
        <input className="form-input" value={f.schedule} onChange={e => set('schedule', e.target.value)} placeholder="Пн/Ср/Пт 10:00" />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Стоимость с абонементом, ₽</label>
          <input className="form-input" type="number" value={f.cost_abo} onChange={e => set('cost_abo', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Разовое занятие, ₽</label>
          <input className="form-input" type="number" value={f.cost_single} onChange={e => set('cost_single', e.target.value)} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Группы (через запятую)</label>
        <input className="form-input" value={f.groups} onChange={e => set('groups', e.target.value)} placeholder="Группа 1, Группа 2" />
      </div>
    </Modal>
  )
}

export default function DirectionsPage({ directions, clients, reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)

  const save = async (f) => {
    if (showEdit) { await supabase.from('directions').update(f).eq('id', showEdit.id); setShowEdit(null) }
    else { await supabase.from('directions').insert(f); setShowAdd(false) }
    reload()
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Новое направление</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
        {directions.map(d => {
          const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
          return (
            <div key={d.id} className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{d.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge badge-green">{cnt} чел.</span>
                  {isAdmin && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(d)}>✏️</button>}
                </div>
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>🕐 {d.schedule || '—'}</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>👩‍🏫 {d.teacher_name || '—'}</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>📅 с {d.launched || '—'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: T.greenBg, borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>С абонементом</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 18, color: T.greenDark }}>{d.cost_abo} ₽</div>
                </div>
                <div style={{ flex: 1, background: '#fff4e6', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#c47a00', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Разовое</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 18, color: '#c47a00' }}>{d.cost_single} ₽</div>
                </div>
              </div>
              {(d.groups || []).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(d.groups || []).map(g => <span key={g} className="badge badge-gray">{g}</span>)}
                </div>
              )}
            </div>
          )
        })}
        {!directions.length && <div className="card card-pad"><div className="empty"><div className="empty-icon">🐾</div><div className="empty-text">Направлений пока нет</div></div></div>}
      </div>
      {showAdd && <DirectionModal onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <DirectionModal direction={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
