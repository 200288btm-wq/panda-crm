import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

const PERIODS = ['Месяц', 'Пока не закончатся занятия', 'Не ограничен']

const pricePerLesson = (price, lessons) => {
  if (!lessons || lessons === 0) return 0
  return Math.round(price / lessons)
}

function SubModal({ sub, directions, onClose, onSave }) {
  const [f, setF] = useState(sub ? {
    name: sub.name || '',
    direction_ids: sub.direction_ids || [],
    price: sub.price || 0,
    lessons_count: sub.lessons_count || 1,
    period: sub.period || 'Пока не закончатся занятия',
    is_active: sub.is_active ?? true,
    notes: sub.notes || '',
  } : {
    name: '', direction_ids: [], price: 0, lessons_count: 1,
    period: 'Пока не закончатся занятия', is_active: true, notes: '',
  })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const ppl = pricePerLesson(f.price, f.lessons_count)

  return (
    <Modal title={sub ? `✏️ ${sub.name}` : '+ Новый абонемент'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>

      <div className="form-group">
        <label className="form-label">Название абонемента *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder="Абонемент на 8 занятий" autoFocus />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Стоимость, ₽</label>
          <input className="form-input" type="number" value={f.price} onChange={e => set('price', +e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Количество занятий</label>
          <input className="form-input" type="number" min="1" value={f.lessons_count} onChange={e => set('lessons_count', +e.target.value)} />
        </div>
      </div>

      {/* Auto price per lesson */}
      {f.price > 0 && f.lessons_count > 0 && (
        <div style={{ background: T.greenBg, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🧮</span>
          <div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Стоимость 1 занятия</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: T.greenDark }}>{fmt(ppl)}</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>
            {fmt(f.price)} ÷ {f.lessons_count} зан.
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Период действия</label>
        <select className="form-input" value={f.period} onChange={e => set('period', e.target.value)}>
          {PERIODS.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Направления (куда применяется)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {directions.map(d => {
            const on = (f.direction_ids || []).includes(d.id)
            const color = d.color || T.green
            return (
              <label key={d.id} onClick={() => {
                const ids = f.direction_ids || []
                set('direction_ids', ids.includes(d.id) ? ids.filter(x => x !== d.id) : [...ids, d.id])
              }} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: on ? color + '22' : '#f5f5f0',
                border: `2px solid ${on ? color : T.border}`,
                color: on ? color : T.muted, fontWeight: 700, fontSize: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {d.name}
              </label>
            )
          })}
        </div>
        {(f.direction_ids || []).length === 0 && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Если не выбрано — абонемент применяется ко всем направлениям</div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Примечание (необязательно)</label>
        <input className="form-input" value={f.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Например: только для новых клиентов" />
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)}
            style={{ accentColor: T.green, width: 16, height: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Активный (доступен при оплате)</span>
        </label>
      </div>
    </Modal>
  )
}

export default function SubscriptionsPage({ subscriptions, directions, reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [filterDir, setFilterDir] = useState('all')

  const save = async (f) => {
    if (showEdit) {
      await supabase.from('subscriptions').update(f).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('subscriptions').insert(f)
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить абонемент «${name}»?`)) return
    await supabase.from('subscriptions').delete().eq('id', id)
    reload()
  }

  const filtered = subscriptions.filter(s => {
    if (filterDir === 'all') return true
    if (filterDir === 'inactive') return !s.is_active
    return (s.direction_ids || []).includes(+filterDir) || (s.direction_ids || []).length === 0
  })

  const active = subscriptions.filter(s => s.is_active)

  const PERIOD_ICONS = {
    'Месяц': '📅',
    'Пока не закончатся занятия': '🎯',
    'Не ограничен': '♾️',
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="stat-label">Всего абонементов</div>
          <div className="stat-value stat-green">{subscriptions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Активных</div>
          <div className="stat-value stat-green">{active.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Мин. стоимость занятия</div>
          <div className="stat-value stat-orange">
            {active.length ? fmt(Math.min(...active.map(s => pricePerLesson(s.price, s.lessons_count)))) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Макс. стоимость занятия</div>
          <div className="stat-value stat-orange">
            {active.length ? fmt(Math.max(...active.map(s => pricePerLesson(s.price, s.lessons_count)))) : '—'}
          </div>
        </div>
      </div>

      {/* Filters + Add */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${filterDir === 'all' ? 'active' : ''}`} onClick={() => setFilterDir('all')}>Все</button>
          {directions.map(d => (
            <button key={d.id} className={`tab ${filterDir === String(d.id) ? 'active' : ''}`}
              onClick={() => setFilterDir(String(d.id))}>{d.name}</button>
          ))}
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(true)}>
            + Новый абонемент
          </button>
        )}
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
        {filtered.map(s => {
          const ppl = pricePerLesson(s.price, s.lessons_count)
          const dirs = directions.filter(d => (s.direction_ids || []).includes(d.id))
          return (
            <div key={s.id} className="card card-pad" style={{
              borderTop: `4px solid ${s.is_active ? T.green : T.border}`,
              opacity: s.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{s.name}</div>
                  {!s.is_active && <span className="badge badge-gray">Неактивен</span>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(s)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => del(s.id, s.name)} style={{ color: T.red }}>🗑️</button>
                  </div>
                )}
              </div>

              {/* Price block */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: T.greenBg, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Стоимость</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: T.greenDark }}>{fmt(s.price)}</div>
                </div>
                <div style={{ flex: 1, background: '#fff4e6', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#c47a00', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>1 занятие</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: '#c47a00' }}>{fmt(ppl)}</div>
                </div>
              </div>

              {/* Info rows */}
              <div style={{ fontSize: 13, color: T.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>📚 {s.lessons_count} занятий в абонементе</div>
                <div>{PERIOD_ICONS[s.period] || '📅'} {s.period}</div>
                {s.notes && <div style={{ fontStyle: 'italic', fontSize: 12 }}>💬 {s.notes}</div>}
              </div>

              {/* Directions */}
              <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {dirs.length > 0 ? dirs.map(d => (
                  <span key={d.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: (d.color || T.green) + '22', color: d.color || T.green,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color || T.green, display: 'inline-block' }} />
                    {d.name}
                  </span>
                )) : (
                  <span className="badge badge-gray">Все направления</span>
                )}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="card card-pad">
            <div className="empty">
              <div className="empty-icon">💳</div>
              <div className="empty-text">Абонементов пока нет</div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <SubModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <SubModal sub={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
