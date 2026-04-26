import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import { Modal } from '../components/Modal'

const DURATIONS = ['30 минут', '45 минут', '1 час', '1.5 часа', '2 часа', 'Полдня', 'Весь день']
const DIRECTION_COLORS = [
  '#7BAF8E', '#F2A65A', '#7c3aed', '#3b82f6', '#ec4899',
  '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
]

const WEEK_DAYS = [
  { key: 'Пн', label: 'Пн', full: 'Понедельник' },
  { key: 'Вт', label: 'Вт', full: 'Вторник' },
  { key: 'Ср', label: 'Ср', full: 'Среда' },
  { key: 'Чт', label: 'Чт', full: 'Четверг' },
  { key: 'Пт', label: 'Пт', full: 'Пятница' },
  { key: 'Сб', label: 'Сб', full: 'Суббота' },
  { key: 'Вс', label: 'Вс', full: 'Воскресенье' },
]

// Parse schedule string like "Пн/Ср 17:30, Сб 13:00" into structured slots
// Also supports old format "Пн/Ср/Пт 10:00"
const parseScheduleToSlots = (scheduleStr) => {
  if (!scheduleStr) return []
  const slots = []

  // Try new format first: "Пн/Ср 17:30, Сб 13:00"
  const parts = scheduleStr.split(',').map(s => s.trim())
  for (const part of parts) {
    const match = part.match(/^([А-Яа-я/]+)\s+(\d{1,2}:\d{2})$/)
    if (match) {
      const days = match[1].split('/')
      const time = match[2]
      for (const day of days) {
        const d = WEEK_DAYS.find(wd => wd.key === day.trim())
        if (d) slots.push({ day: d.key, time })
      }
    }
  }

  // If nothing parsed, try old format "Пн/Ср/Пт 10:00"
  if (slots.length === 0) {
    const oldMatch = scheduleStr.match(/^([А-Яа-я/]+)\s+(\d{1,2}:\d{2})/)
    if (oldMatch) {
      const days = oldMatch[1].split('/')
      const time = oldMatch[2]
      for (const day of days) {
        const d = WEEK_DAYS.find(wd => wd.key === day.trim())
        if (d) slots.push({ day: d.key, time })
      }
    }
  }

  return slots
}

// Convert slots back to schedule string
const slotsToSchedule = (slots) => {
  if (!slots.length) return ''
  // Group by time
  const byTime = {}
  slots.forEach(s => {
    if (!byTime[s.time]) byTime[s.time] = []
    byTime[s.time].push(s.day)
  })
  // Sort days within each time group by WEEK_DAYS order
  const dayOrder = WEEK_DAYS.map(d => d.key)
  return Object.entries(byTime)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, days]) => {
      const sorted = days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
      return `${sorted.join('/')} ${time}`
    })
    .join(', ')
}

// Schedule builder component
function ScheduleBuilder({ slots, onChange }) {
  const [newTime, setNewTime] = useState('10:00')

  const toggleDay = (dayKey) => {
    const exists = slots.find(s => s.day === dayKey)
    if (exists) {
      onChange(slots.filter(s => s.day !== dayKey))
    } else {
      // Add with current newTime or 10:00
      onChange([...slots, { day: dayKey, time: newTime }])
    }
  }

  const updateTime = (dayKey, time) => {
    onChange(slots.map(s => s.day === dayKey ? { ...s, time } : s))
  }

  const activeDay = (dayKey) => slots.find(s => s.day === dayKey)

  return (
    <div>
      {/* Day buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {WEEK_DAYS.map(d => {
          const active = activeDay(d.key)
          return (
            <div key={d.key} onClick={() => toggleDay(d.key)} style={{
              width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', fontFamily: 'Nunito, sans-serif',
              fontWeight: 800, fontSize: 14, transition: 'all 0.15s',
              background: active ? T.green : T.cream,
              color: active ? 'white' : T.muted,
              border: `2px solid ${active ? T.green : T.border}`,
            }}>
              {d.label}
            </div>
          )
        })}
      </div>

      {/* Time per day */}
      {slots.length > 0 && (
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Время занятий</div>
          {WEEK_DAYS.filter(d => activeDay(d.key)).map(d => {
            const slot = activeDay(d.key)
            return (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: T.green, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 13, flexShrink: 0
                }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, minWidth: 90 }}>{d.full}</div>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateTime(d.key, e.target.value)}
                  style={{
                    padding: '7px 10px', borderRadius: 10, border: `1.5px solid ${T.border}`,
                    fontFamily: 'Nunito Sans, sans-serif', fontSize: 14, background: 'white',
                    outline: 'none', color: T.ink, width: 110,
                  }}
                />
                <div style={{ fontSize: 12, color: T.muted }}>
                  начало занятия
                </div>
                <button onClick={() => onChange(slots.filter(s => s.day !== d.key))} style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: T.muted, fontSize: 16, padding: '4px',
                }}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {slots.length === 0 && (
        <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>
          Выберите дни недели выше
        </div>
      )}

      {/* Preview */}
      {slots.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: T.greenDark, fontWeight: 600 }}>
          📅 {slotsToSchedule(slots)}
        </div>
      )}
    </div>
  )
}

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
  const initSlots = direction?.schedule ? parseScheduleToSlots(direction.schedule) : []

  const [f, setF] = useState(direction ? {
    name: direction.name || '',
    teacher_name: direction.teacher_name || '',
    launched: direction.launched || '',
    cost_abo: direction.cost_abo || 0,
    cost_single: direction.cost_single || 0,
    groups: (direction.groups || ['Группа 1']).join(', '),
    duration: direction.duration || '1 час',
    color: direction.color || DIRECTION_COLORS[0],
  } : {
    name: '', teacher_name: '', launched: '',
    cost_abo: 0, cost_single: 0, groups: 'Группа 1',
    duration: '1 час', color: DIRECTION_COLORS[0],
  })
  const [slots, setSlots] = useState(initSlots)

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = () => {
    const schedule = slotsToSchedule(slots)
    onSave({
      ...f,
      schedule,
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

      {/* Schedule builder */}
      <div className="form-group">
        <label className="form-label">Расписание занятий</label>
        <ScheduleBuilder slots={slots} onChange={setSlots} />
      </div>

      <div className="form-group"><label className="form-label">Длительность занятия</label>
        <select className="form-input" value={f.duration} onChange={e => set('duration', e.target.value)}>
          {DURATIONS.map(d => <option key={d}>{d}</option>)}
        </select>
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
    if (!confirm(`Удалить направление «${name}»?`)) return
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {directions.map(d => {
          const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
          const color = d.color || DIRECTION_COLORS[0]

          // Parse schedule for display
          const slots = parseScheduleToSlots(d.schedule || '')
          const scheduleDisplay = slots.length > 0
            ? slots.map(s => `${s.day} ${s.time}`).join(' · ')
            : d.schedule || '—'

          return (
            <div key={d.id} className="card card-pad" style={{ borderTop: `4px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{d.name}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="badge badge-green">{cnt} чел.</span>
                  {isAdmin && <>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(d)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => del(d.id, d.name)}>🗑️</button>
                  </>}
                </div>
              </div>

              {/* Schedule display */}
              <div style={{ marginBottom: 10 }}>
                {slots.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {slots.map((s, i) => (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: color + '22', color: color,
                      }}>
                        {s.day} {s.time}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.muted }}>🕐 {d.schedule || '—'}</div>
                )}
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>⏱ {d.duration || '1 час'}</div>
              </div>

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
