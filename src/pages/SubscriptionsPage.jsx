import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { toast, confirmAction } from '../lib/ui'

// Fallback на случай, если таблица subscription_periods ещё не создана
const DEFAULT_PERIODS = ['Месяц', 'Пока не закончатся занятия', 'Не ограничен']

const UNIT_LABELS = {
  day:   { one: 'день',   few: 'дня',     many: 'дней'    },
  week:  { one: 'неделя', few: 'недели',  many: 'недель'  },
  month: { one: 'месяц',  few: 'месяца',  many: 'месяцев' },
}

// Простое склонение для русского
function declUnit(unit, n) {
  const labels = UNIT_LABELS[unit]
  if (!labels) return unit
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return labels.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return labels.few
  return labels.many
}

// Превращает {unit, value} в человекочитаемую строку: «3 месяца», «1 неделя»
function buildPeriodLabel(unit, value) {
  if (!unit || !value) return ''
  return `${value} ${declUnit(unit, value)}`
}

const pricePerLesson = (price, lessons) => {
  if (!lessons || lessons === 0) return 0
  return Math.round(price / lessons)
}

function SubModal({ sub, directions, periods, priceCategories = [], onClose, onSave, studioId, categoriesOn = true }) {
  const [f, setF] = useState(sub ? {
    name: sub.name || '',
    category_id: sub.category_id || null,
    price: sub.price || 0,
    lessons_count: sub.lessons_count || 1,
    period: sub.period || 'Пока не закончатся занятия',
    is_active: sub.is_active ?? true,
    notes: sub.notes || '',
  } : {
    name: '', category_id: null, price: 0, lessons_count: 1,
    period: 'Пока не закончатся занятия', is_active: true, notes: '',
  })

  // Состояние для блока «Свой период»
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState(1)
  const [customUnit, setCustomUnit] = useState('month')
  const [saveCustom, setSaveCustom] = useState(true)
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const ppl = pricePerLesson(f.price, f.lessons_count)

  // Сохранение: если кастомный период и галочка стоит — сначала создаём запись в каталоге,
  // потом сохраняем абонемент с этим label
  const handleSave = async () => {
    setBusy(true)
    try {
      let periodLabel = f.period
      if (customMode) {
        periodLabel = buildPeriodLabel(customUnit, customValue)
        if (saveCustom) {
          // Переводим выбранную единицу в модель периода (fixed + длительность).
          // Недели считаем в днях (в расчёте срока недель нет).
          let durationUnit, durationValue
          if (customUnit === 'month')      { durationUnit = 'months'; durationValue = +customValue }
          else if (customUnit === 'week')  { durationUnit = 'days';   durationValue = +customValue * 7 }
          else                             { durationUnit = 'days';   durationValue = +customValue }
          // Пробуем добавить в каталог (если уже есть с таким label — БД ругнётся 23505, гасим)
          const { error } = await supabase.from('subscription_periods').insert({
            label: periodLabel,
            period_type: 'fixed',
            duration_value: durationValue,
            duration_unit: durationUnit,
            is_custom: true,
            studio_id: studioId,
            sort_order: 100,
          })
          // Игнорируем ошибки уникальности (23505) и отсутствия таблицы — главное, абонемент сохранится
          if (error && error.code !== '23505') {
            console.warn('Не удалось сохранить период в каталог:', error)
          }
        }
      }
      await onSave({ ...f, period: periodLabel })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={sub ? `✏️ ${sub.name}` : '+ Новый абонемент'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={busy}>Отмена</button><button className="btn btn-primary" onClick={handleSave} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></>}>

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
        <select className="form-input"
          value={customMode ? '__custom__' : f.period}
          onChange={e => {
            if (e.target.value === '__custom__') {
              setCustomMode(true)
            } else {
              setCustomMode(false)
              set('period', e.target.value)
            }
          }}>
          {(periods && periods.length ? periods.map(p => p.label) : DEFAULT_PERIODS).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="__custom__">➕ Свой период…</option>
        </select>

        {customMode && (
          <div style={{ marginTop: 10, padding: 12, background: T.cream, borderRadius: 12, border: `1.5px dashed ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 8 }}>Свой период</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 90px' }}>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={customValue}
                  onChange={e => setCustomValue(Math.max(1, +e.target.value || 1))}
                  style={{ fontSize: 16 }}
                />
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <select className="form-input" value={customUnit} onChange={e => setCustomUnit(e.target.value)}>
                  <option value="day">{declUnit('day', customValue)}</option>
                  <option value="week">{declUnit('week', customValue)}</option>
                  <option value="month">{declUnit('month', customValue)}</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: T.greenDark, fontWeight: 600 }}>
              Получится: «{buildPeriodLabel(customUnit, customValue)}»
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={saveCustom} onChange={e => setSaveCustom(e.target.checked)}
                style={{ accentColor: T.green, width: 16, height: 16 }} />
              <span style={{ fontSize: 13 }}>Добавить в справочник периодов</span>
            </label>
          </div>
        )}
      </div>

      {categoriesOn && (
      <div className="form-group">
        <label className="form-label">Категория абонемента</label>
        {priceCategories.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <label onClick={() => set('category_id', null)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
              background: !f.category_id ? T.green + '22' : '#f5f5f0',
              border: `2px solid ${!f.category_id ? T.green : T.border}`,
              color: !f.category_id ? T.greenDark : T.muted, fontWeight: 700, fontSize: 12,
            }}>
              Все направления
            </label>
            {priceCategories.map(c => {
              const on = f.category_id === c.id
              return (
                <label key={c.id} onClick={() => set('category_id', on ? null : c.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                  background: on ? T.green + '22' : '#f5f5f0',
                  border: `2px solid ${on ? T.green : T.border}`,
                  color: on ? T.greenDark : T.muted, fontWeight: 700, fontSize: 12,
                }}>
                  {on && '✓ '}{c.name}
                </label>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Категории не настроены — абонемент доступен для всех направлений.
            <br />Добавьте категории в <strong>Настройки студии</strong>.
          </div>
        )}
        {!f.category_id && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Без категории — доступен для всех направлений</div>
        )}
      </div>
      )}

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

export default function SubscriptionsPage({ subscriptions, directions, reload, isAdmin, studioId, features = { categories: true } }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [periods, setPeriods] = useState([])
  const [priceCategories, setPriceCategories] = useState([])

  const loadPeriods = async () => {
    if (!studioId) { setPeriods([]); return }
    // Только свои. Общих строк (studio_id пустой) в базе нет — проверено;
    // если такая появится, она не должна показываться всем студиям сразу.
    const { data, error } = await supabase
      .from('subscription_periods')
      .select('*')
      .eq('studio_id', studioId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      console.warn('subscription_periods: ' + error.message)
      setPeriods([])
    } else {
      setPeriods(data || [])
    }
  }

  const loadCategories = async () => {
    // Функция выключена в настройках — категорий на экране быть не должно
    if (!studioId || features.categories === false) { setPriceCategories([]); return }
    const { data } = await supabase
      .from('price_categories')
      .select('*')
      .eq('studio_id', studioId)
      .order('sort_order')
      .order('id')
    setPriceCategories(data || [])
  }

  useEffect(() => { loadPeriods(); loadCategories() }, [studioId, features.categories])

  const save = async (f) => {
    const data = { ...f }
    if (studioId && !showEdit) data.studio_id = studioId
    if (showEdit) {
      await supabase.from('subscriptions').update(data).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('subscriptions').insert(data)
      setShowAdd(false)
    }
    await loadPeriods()
    reload()
  }

  const del = async (id, name) => {
    const ok = await confirmAction({
      title: `Удалить абонемент «${name}»?`,
      text: 'Уже оформленные клиентам оплаты останутся, пропадёт только вариант выбора.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('subscriptions').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить «${name}»`); return }
    toast.success(`Абонемент «${name}» удалён`)
    reload()
  }

  // Локальный порядок карточек для drag & drop
  const [localSubs, setLocalSubs] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'dir:ID' | 'cat:ID' | 'inactive'

  // Синхронизируем localSubs когда приходят новые subscriptions
  useEffect(() => {
    const sorted = [...subscriptions].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    setLocalSubs(sorted)
  }, [subscriptions])

  const filtered = (localSubs || subscriptions).filter(s => {
    if (filterMode === 'inactive') return !s.is_active
    if (filterMode === 'all') return s.is_active
    if (filterMode.startsWith('dir:')) {
      const dirId = parseInt(filterMode.slice(4))
      const dir = directions.find(d => d.id === dirId)
      if (!dir) return s.is_active
      const catIds = dir.category_ids || []
      if (catIds.length === 0) return s.is_active
      return s.is_active && (!s.category_id || catIds.includes(s.category_id))
    }
    if (filterMode.startsWith('cat:')) {
      const catId = parseInt(filterMode.slice(4))
      return s.is_active && s.category_id === catId
    }
    return s.is_active
  })

  const active = subscriptions.filter(s => s.is_active)

  // Drag & drop handlers — используем id карточки вместо индекса в filtered
  const onDragStart = (id) => setDragIdx(id)
  const onDragOver = (e, id) => { e.preventDefault(); setDragOver(id) }
  const onDrop = async (e, dropId) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === dropId) { setDragIdx(null); setDragOver(null); return }
    const newList = [...(localSubs || subscriptions)]
    const fromIdx = newList.findIndex(s => s.id === dragIdx)
    const toIdx = newList.findIndex(s => s.id === dropId)
    if (fromIdx === -1 || toIdx === -1) { setDragIdx(null); setDragOver(null); return }
    const [moved] = newList.splice(fromIdx, 1)
    newList.splice(toIdx, 0, moved)
    setLocalSubs(newList)
    setDragIdx(null)
    setDragOver(null)
    await Promise.all(newList.map((s, i) =>
      supabase.from('subscriptions').update({ sort_order: i }).eq('id', s.id)
    ))
  }
  const onDragEnd = () => { setDragIdx(null); setDragOver(null) }

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
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {/* Фильтр по направлениям */}
          <div className="tabs" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            <button className={`tab ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>Все активные</button>
            {directions.map(d => (
              <button key={d.id} className={`tab ${filterMode === `dir:${d.id}` ? 'active' : ''}`}
                onClick={() => setFilterMode(`dir:${d.id}`)}>{d.name}</button>
            ))}
            <button className={`tab ${filterMode === 'inactive' ? 'active' : ''}`} onClick={() => setFilterMode('inactive')}>Неактивные</button>
          </div>
          {/* Фильтр по категориям */}
          {priceCategories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {priceCategories.map(c => (
                <button key={c.id}
                  onClick={() => setFilterMode(filterMode === `cat:${c.id}` ? 'all' : `cat:${c.id}`)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${filterMode === `cat:${c.id}` ? T.green : T.border}`,
                    background: filterMode === `cat:${c.id}` ? T.greenBg : 'white',
                    color: filterMode === `cat:${c.id}` ? T.greenDark : T.muted,
                    transition: 'all 0.15s',
                  }}>
                  🏷️ {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Новый абонемент</button>
        )}
      </div>

      {/* Drag hint */}
      {isAdmin && filtered.length > 1 && (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⠿ Перетащите карточки чтобы изменить порядок
        </div>
      )}

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
        {filtered.map((s) => {
          const ppl = pricePerLesson(s.price, s.lessons_count)
          const cat = priceCategories.find(c => c.id === s.category_id)
          const isDragging = dragIdx === s.id
          const isOver = dragOver === s.id
          return (
            <div key={s.id}
              draggable={isAdmin}
              onDragStart={() => onDragStart(s.id)}
              onDragOver={(e) => onDragOver(e, s.id)}
              onDrop={(e) => onDrop(e, s.id)}
              onDragEnd={onDragEnd}
              className="card card-pad"
              style={{
                borderTop: `4px solid ${s.is_active ? T.green : T.border}`,
                opacity: isDragging ? 0.4 : s.is_active ? 1 : 0.6,
                cursor: isAdmin ? 'grab' : 'default',
                outline: isOver ? `2px dashed ${T.green}` : 'none',
                transition: 'opacity 0.15s, outline 0.1s',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  {isAdmin && <span style={{ color: T.muted, fontSize: 14, marginRight: 6 }}>⠿</span>}
                  <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                  {!s.is_active && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Неактивен</span>}
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

              {/* Category */}
              <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {cat ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: T.greenBg, color: T.greenDark,
                  }}>🏷️ {cat.name}</span>
                ) : (
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
              <div className="empty-text">Абонементов нет</div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <SubModal directions={directions} periods={periods} priceCategories={priceCategories} studioId={studioId} categoriesOn={features.categories !== false} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <SubModal sub={showEdit} directions={directions} periods={periods} priceCategories={priceCategories} studioId={studioId} categoriesOn={features.categories !== false} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
