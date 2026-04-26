import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import { Modal } from '../components/Modal'

const DURATIONS = ['30 минут', '45 минут', '1 час', '1.5 часа', '2 часа', 'Полдня', 'Весь день']
const DIRECTION_COLORS = [
  '#7BAF8E', '#F2A65A', '#7c3aed', '#3b82f6', '#ec4899',
  '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
]

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      {DIRECTION_COLORS.map(c => (
        <div key={c} onClick={() => onChange(c)} style={{
          width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
          border: value === c ? '3px solid #1A1A1A' : '3px solid transparent',
          boxShadow: value === c ? '0 0 0 2px white inset' : 'none',
          transition: 'all 0.15s'
        }} />
      ))}
    </div>
  )
}

function DirectionModal({ direction, teachers, onClose, onSave }) {
  const [f, setF] = useState(direction ? {
    name: direction.name || '',
    teacher_name: direction.teacher_name || '',
    schedule: direction.schedule || '',
    launched: direction.launched || '',
    cost_abo: direction.cost_abo || 0,
    cost_single: direction.cost_single || 0,
    groups: (direction.groups || ['Группа 1']).join(', '),
    duration: direction.duration || '1 час',
    color: direction.color || DIRECTION_COLORS[0],
  } : {
    name: '', teacher_name: '', schedule: '', launched: '',
    cost_abo: 0, cost_single: 0, groups: 'Группа 1',
    duration: '1 час', color: DIRECTION_COLORS[0],
  })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = () => {
    onSave({
      ...f,
      cost_abo: +f.cost_abo,
      cost_single: +f.cost_single,
      groups: f.groups.split(',').map(g => g.trim()).filter(Boolean)
    })
  }

  return (
    <Modal title={direction ? `✏️ ${direction.name}` : '+ Новое направление'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Название *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Смышлёная Панда" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Педагог</label>
          <select className="form-input" value={f.teacher_name} onChange={e => set('teacher_name', e.target.value)}>
            <option value="">— выбрать —</option>
            {teachers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Дата запуска</label>
          <input className="form-input" type="date" value={f.launched} onChange={e => set('launched', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Расписание</label>
          <input className="form-input" value={f.schedule} onChange={e => set('schedule', e.target.value)} placeholder="Пн/Ср/Пт 10:00" />
        </div>
        <div className="form-group"><label className="form-label">Длительность занятия</label>
          <select className="form-input" value={f.duration} onChange={e => set('duration', e.target.value)}>
            {DURATIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
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
      <div className="form-group"><label className="form-label">Цвет направления</label>
        <ColorPicker value={f.color} onChange={v => set('color', v)} />
      </div>
    </Modal>
  )
}

export default function DirectionsPage({ directions, clients, teachers, reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)

  const save = async (f) => {
    if (showEdit) {
      await supabase.from('directions').update(f).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('directions').insert(f)
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить направление «${name}»? Это действие нельзя отменить.`)) return
    await supabase.from('directions').delete().eq('id', id)
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
          const color = d.color || DIRECTION_COLORS[0]
          return (
            <div key={d.id} className="card card-pad" style={{ borderTop: `4px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{d.name}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="badge badge-green">{cnt} чел.</span>
                  {isAdmin && <>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(d)} title="Редактировать">✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => del(d.id, d.name)} title="Удалить">🗑️</button>
                  </>}
                </div>
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>🕐 {d.schedule || '—'} · {d.duration || '1 час'}</div>
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
        {!directions.length && (
          <div className="card card-pad">
            <div className="empty"><div className="empty-icon">🎯</div><div className="empty-text">Направлений пока нет</div></div>
          </div>
        )}
      </div>
      {showAdd && <DirectionModal teachers={teachers} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <DirectionModal direction={showEdit} teachers={teachers} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
