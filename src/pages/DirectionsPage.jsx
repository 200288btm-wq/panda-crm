import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { QuickAdd } from '../components/QuickAdd'
import { createDuration, createAddress } from '../lib/dictionaries'
import { NumberInput } from '../components/SearchSelect'

const DIRECTION_COLORS = ['#7BAF8E','#F2A65A','#7c3aed','#3b82f6','#ec4899','#14b8a6','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const WEEK_DAYS = [
  { key:'Пн', full:'Понедельник' }, { key:'Вт', full:'Вторник' },
  { key:'Ср', full:'Среда' }, { key:'Чт', full:'Четверг' },
  { key:'Пт', full:'Пятница' }, { key:'Сб', full:'Суббота' }, { key:'Вс', full:'Воскресенье' },
]

const parseSlots = (str) => {
  if (!str) return []
  const slots = []
  str.split(',').map(s => s.trim()).forEach(part => {
    const m = part.match(/^([А-Яа-я/]+)\s+(\d{1,2}:\d{2})/)
    if (m) m[1].split('/').forEach(d => {
      const wd = WEEK_DAYS.find(w => w.key === d.trim())
      if (wd) slots.push({ day: d.trim(), time: m[2], id: Math.random() })
    })
  })
  return slots
}

const slotsToStr = (slots) => {
  if (!slots.length) return ''
  const byTime = {}
  slots.forEach(s => { if (!byTime[s.time]) byTime[s.time] = []; byTime[s.time].push(s.day) })
  const dayOrder = WEEK_DAYS.map(d => d.key)
  return Object.entries(byTime).sort((a,b) => a[0].localeCompare(b[0])).map(([time, days]) => {
    const sorted = [...new Set(days)].sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
    return `${sorted.join('/')} ${time}`
  }).join(', ')
}

// Сколько занятий в неделю проводится: у каждой подгруппы своё расписание
const weeklyLessons = (schedules) => schedules.reduce((sum, sch) => {
  const days = [...new Set(parseSlots(sch || '').map(s => s.day))]
  return sum + days.length
}, 0)

const calcAutoPrice = (direction, subscriptions) => {
  if (!direction) return { singlePrice: null, avgPrice: null, count: 0 }
  const catIds = direction.category_ids || []
  const rel = subscriptions.filter(s => {
    if (!s.is_active) return false
    if (catIds.length > 0) {
      // Новая логика: абонемент попадает, если его category_id есть в категориях направления
      if (s.category_id && catIds.includes(s.category_id)) return true
      return false
    }
    // Fallback на старую логику для направлений без категорий (legacy)
    return (s.direction_ids||[]).length === 0 || (s.direction_ids||[]).includes(direction.id)
  })
  const single = rel.filter(s => s.lessons_count === 1)
  const multi = rel.filter(s => s.lessons_count > 1 && s.period !== 'Не ограничен')
  return {
    singlePrice: single.length ? Math.round(single.reduce((s,x) => s+x.price, 0)/single.length) : null,
    avgPrice: multi.length ? Math.round(multi.reduce((s,x) => s+Math.round(x.price/x.lessons_count), 0)/multi.length) : null,
    count: rel.length,
  }
}

function ScheduleBuilder({ slots, onChange, compact }) {
  const activeDays = [...new Set(slots.map(s => s.day))]
  const toggleDay = (key) => {
    const ds = slots.filter(s => s.day === key)
    if (ds.length) onChange(slots.filter(s => s.day !== key))
    else onChange([...slots, { day: key, time: '10:00', id: Date.now()+Math.random() }])
  }
  const addSlot = (key) => onChange([...slots, { day: key, time: '10:00', id: Date.now()+Math.random() }])
  const updateTime = (id, time) => onChange(slots.map(s => s.id === id ? {...s,time} : s))
  const removeSlot = (id) => onChange(slots.filter(s => s.id !== id))

  const daySize = compact ? 32 : 42
  const dayFontSize = compact ? 12 : 14

  return (
    <div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {WEEK_DAYS.map(d => {
          const active = activeDays.includes(d.key)
          return <div key={d.key} onClick={() => toggleDay(d.key)} style={{ width:daySize, height:daySize, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:dayFontSize, transition:'all 0.15s', background: active?T.green:T.cream, color: active?'white':T.muted, border:`2px solid ${active?T.green:T.border}` }}>{d.key}</div>
        })}
      </div>
      {slots.length > 0 && (
        <div style={{ background: compact ? 'white' : T.cream, borderRadius:10, padding: compact ? '8px 10px' : '12px 14px', border: compact ? `1px solid ${T.border}` : 'none' }}>
          {!compact && <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Время занятий</div>}
          {WEEK_DAYS.filter(d => activeDays.includes(d.key)).map(d => {
            const daySlots = slots.filter(s => s.day === d.key)
            return (
              <div key={d.key} style={{ marginBottom:8 }}>
                {daySlots.map((slot, idx) => (
                  <div key={slot.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <div style={{ width:30, height:30, borderRadius:8, background: idx===0?T.green:T.greenLight, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:12, flexShrink:0 }}>{d.key}</div>
                    <input type="time" value={slot.time} onChange={e => updateTime(slot.id, e.target.value)} style={{ padding:'6px 8px', borderRadius:8, border:`1.5px solid ${T.border}`, fontFamily:'Nunito Sans,sans-serif', fontSize:13, background:'white', outline:'none', color:T.ink, width:100 }} />
                    {idx === daySlots.length-1 && <button type="button" onClick={() => addSlot(d.key)} style={{ width:24, height:24, borderRadius:6, background:T.greenBg, border:`1.5px solid ${T.green}`, color:T.greenDark, cursor:'pointer', fontWeight:800, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>+</button>}
                    <button type="button" onClick={() => removeSlot(slot.id)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.muted, fontSize:14, padding:'4px', flexShrink:0 }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {!slots.length && <div style={{ fontSize:12, color:T.muted }}>Выберите дни недели выше</div>}
      {slots.length > 0 && <div style={{ marginTop:6, fontSize:11, color:T.greenDark, fontWeight:600 }}>📅 {slotsToStr(slots)}</div>}
    </div>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
      {DIRECTION_COLORS.map(c => <div key={c} onClick={() => onChange(c)} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: value===c?'3px solid #1A1A1A':'3px solid transparent', boxShadow: value===c?'0 0 0 2px white inset':'none', transition:'all 0.15s' }} />)}
    </div>
  )
}

// Блок одной подгруппы внутри модалки направления
function GroupBlock({ group, teachers, addresses, onChange, onRemove, isOnly, idx, features = {}, hideSubgroupLabel = false, studioId, onAddressCreated }) {
  // Локально храним slots, чтобы не парсить каждый рендер
  const [slots, setSlots] = useState(() => parseSlots(group.schedule || ''))

  useEffect(() => {
    setSlots(parseSlots(group.schedule || ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group._key])

  const handleSlots = (newSlots) => {
    setSlots(newSlots)
    onChange({ ...group, schedule: slotsToStr(newSlots) })
  }

  return (
    <div style={{ background:T.cream, borderRadius:12, padding:'14px 16px', marginBottom:10, border:`1.5px solid ${T.border}` }}>
      {!hideSubgroupLabel && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:13, color:T.greenDark, textTransform:'uppercase', letterSpacing:'0.04em' }}>
            📍 Подгруппа {idx + 1}
          </div>
          {!isOnly && (
            <button type="button"
              onClick={() => { if (confirm(`Удалить подгруппу «${group.name || 'без названия'}»?`)) onRemove() }}
              style={{ background:'none', border:'none', cursor:'pointer', color:T.red, fontSize:13, fontWeight:600, padding:'2px 6px' }}>
              🗑 Удалить
            </button>
          )}
        </div>
      )}
      <div className="form-row">
        {!hideSubgroupLabel && (
          <div className="form-group">
            <label className="form-label">Название подгруппы</label>
            <input className="form-input" value={group.name}
              onChange={e => onChange({ ...group, name: e.target.value })}
              placeholder="Онежская утро / Хуторская / Вечер..." />
          </div>
        )}
        {features.teachers && (
          <div className="form-group">
            <label className="form-label">Педагоги</label>
            {teachers.length === 0 ? (
              <div style={{ fontSize:12, color:T.muted, padding:'8px 0' }}>
                Пока никто не закреплён. Откройте раздел «👩‍🏫 Педагоги» и отметьте это направление в карточке нужного педагога.
              </div>
            ) : (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {teachers.map(t => (
                  <span key={t.id} style={{ background:T.greenBg, color:T.greenDark, borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700 }}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize:11, color:T.muted, marginTop:6, lineHeight:1.5 }}>
              Список формируется автоматически из карточек педагогов.
              {teachers.length > 1 && ' Кто вёл занятие в конкретный день — отмечается в расписании.'}
            </div>
          </div>
        )}
      </div>
      {features.addresses && (
        <div className="form-group">
          <label className="form-label">Адрес</label>
          <select className="form-input" value={group.address_id || ''}
            onChange={e => onChange({ ...group, address_id: e.target.value ? +e.target.value : null })}>
            <option value="">— не указан —</option>
          {addresses.map(a => <option key={a.id} value={a.id}>{a.name}{a.address ? ` (${a.address})` : ''}</option>)}
        </select>
        {addresses.length === 0 && (
          <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>
            Ни одного адреса пока нет. Можно добавить прямо здесь — он попадёт в раздел «📍 Адреса».
          </div>
        )}
        <QuickAdd
          label="добавить адрес"
          fields={[
            { key: 'name', placeholder: 'Название (Онежская)', flex: 1, minWidth: 120 },
            { key: 'address', placeholder: 'Адрес (ул. Онежская, 4)', flex: 2, minWidth: 150 },
          ]}
          onCreate={vals => createAddress(studioId, vals)}
          onCreated={row => {
            onAddressCreated && onAddressCreated(row)
            onChange({ ...group, address_id: row.id })
          }}
        />
      </div>
      )}
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label">Расписание подгруппы</label>
        <ScheduleBuilder slots={slots} compact onChange={handleSlots} />
      </div>
    </div>
  )
}

function DirectionModal({ direction, directionGroups, teachers, addresses, subscriptions, priceCategories = [], durations = [], onClose, onSave, features = {}, studioId, onDurationCreated, onAddressCreated }) {
  // Существующие подгруппы для редактируемого направления
  const existingGroups = direction
    ? directionGroups.filter(g => g.direction_id === direction.id)
    : []
  // Педагоги направления — источник правды теперь карточка педагога
  const directionTeachers = direction
    ? (teachers || []).filter(t => (t.direction_ids || []).includes(direction.id))
    : []

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const [f, setF] = useState(direction ? {
    name: direction.name||'', launched: direction.launched||'',
    duration: direction.duration||'1 час',
    color: direction.color||DIRECTION_COLORS[0], max_capacity: direction.max_capacity||0,
    category_ids: direction.category_ids || [],
    enrollment_type: direction.enrollment_type || 'group',
    max_per_slot: direction.max_per_slot || 0,
    payment_type: direction.payment_type || 'per_lesson',
    duration_hours: direction.duration_hours ?? 1,
  } : { name:'', launched: todayStr, duration: durations[0]?.name || '1 час', duration_hours: durations[0] ? +durations[0].hours : 1, color:DIRECTION_COLORS[0], max_capacity:0, category_ids: [], enrollment_type: 'group', max_per_slot: 0, payment_type: 'per_lesson' })

  // Локальное состояние подгрупп
  const [groups, setGroups] = useState(() => {
    if (existingGroups.length) {
      return existingGroups.map((g) => ({
        _key: `existing-${g.id}`,
        id: g.id,
        name: (g.name === 'Основная' && (direction.groups || []).length === 1) ? '' : (g.name || ''),
        teacher_id: g.teacher_id || null,
        address_id: g.address_id || null,
        schedule: g.schedule || '',
      }))
    }
    return [{ _key: `new-${Date.now()}`, name: '', teacher_id: null, address_id: null, schedule: '' }]
  })

  const set = (k,v) => setF(p => ({...p, [k]:v}))

  // Вместимость считается сама: занятий в неделю × мест на занятии
  const capacityForm = (() => {
    const lessons = weeklyLessons(groups.map(g => g.schedule))
    return { lessons, total: lessons * (+f.max_per_slot || 0) }
  })()

  const autoPrice = useMemo(() => {
    // Считаем по выбранным категориям в форме, а не только по сохранённым в БД
    const directionLike = { id: direction?.id, category_ids: f.category_ids || [] }
    return calcAutoPrice(directionLike, subscriptions || [])
  }, [direction?.id, f.category_ids, subscriptions])

  const updateGroup = (idx, newGroup) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...newGroup, _key: g._key } : g))
  }
  const addGroup = () => {
    setGroups(prev => [...prev, { _key: `new-${Date.now()}-${Math.random()}`, name: '', teacher_id: null, address_id: null, schedule: '' }])
  }
  const removeGroup = (idx) => {
    setGroups(prev => prev.filter((_, i) => i !== idx))
  }

  const save = () => {
    // Подгруппы — вещь опциональная НА УРОВНЕ НАПРАВЛЕНИЯ, даже если
    // функция включена для всей студии. Пока подгруппа одна, это просто
    // расписание направления: имя не спрашиваем и не требуем.
    // Требование появляется только когда подгрупп реально больше одной.
    const subgroupsVisible = groups.length > 1
    const cleaned = groups.map((g, i) => ({
      ...g,
      // Единственной подгруппе имя не нужно, но в БД поле не пустое —
      // подставляем служебное. Пользователь его не видит.
      name: (g.name || '').trim() || (subgroupsVisible ? '' : 'Основная'),
    }))
    if (subgroupsVisible) {
      const empty = cleaned.findIndex(g => !g.name)
      if (empty !== -1) {
        alert(`Пожалуйста, укажите название подгруппы №${empty + 1}`)
        return
      }
    }
    if (!f.name || !f.name.trim()) {
      alert('Укажите название направления')
      return
    }
    onSave({
      direction: {
        name: f.name,
        launched: f.launched,
        duration: f.duration,
        color: f.color,
        // Считается автоматически, руками не задаётся
        max_capacity: f.enrollment_type === 'client_days' ? capacityForm.total : 0,
        category_ids: f.category_ids || [],
        enrollment_type: f.enrollment_type || 'group',
        max_per_slot: +f.max_per_slot || 0,
        payment_type: f.payment_type || 'per_lesson',
        duration_hours: +f.duration_hours || 1,
        // Для совместимости со старой логикой:
        schedule: cleaned[0]?.schedule || '',
        // Legacy-поле: держим его в согласии с карточками педагогов
        teacher_name: directionTeachers.map(t => t.name).join(', '),
        groups: cleaned.map(g => g.name),
      },
      groups: cleaned,
    })
  }

  return (
    <Modal title={direction?`✏️ ${direction.name}`:'+ Новое направление'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Название *</label>
        <input className="form-input" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Смышлёная Панда / Английский язык" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Длительность занятия</label>
          <select className="form-input" value={f.duration} onChange={e => {
            const name = e.target.value
            const found = durations.find(x => x.name === name)
            setF(p => ({ ...p, duration: name, duration_hours: found ? +found.hours : p.duration_hours }))
          }}>
            {durations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            {f.duration && !durations.some(x => x.name === f.duration) && (
              <option value={f.duration}>{f.duration} — нет в справочнике</option>
            )}
          </select>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
            {+f.duration_hours ? `${f.duration_hours} ч. — по этому значению считается оплата педагогам. ` : ''}
            Список настраивается в «⚙️ Настройки → Справочники».
          </div>
          <QuickAdd
            label="добавить длительность"
            fields={[
              { key: 'name', placeholder: 'Название (45 минут)', flex: 2, minWidth: 130 },
              { key: 'hours', placeholder: 'Часов (0.75)', flex: 1, minWidth: 90 },
            ]}
            onCreate={vals => createDuration(studioId, vals)}
            onCreated={async (row) => {
              // Показываем то, что реально легло в базу, а не введённое
              setF(p => ({ ...p, duration: row.name, duration_hours: +row.hours }))
              onDurationCreated && await onDurationCreated()
            }}
          />
        </div>
        <div className="form-group"><label className="form-label">Дата запуска</label>
          <input className="form-input" type="date" value={f.launched} onChange={e=>set('launched',e.target.value)} />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
            По умолчанию — сегодня. Измените если направление работает с другой даты и нужно вносить посещения задним числом.
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Макс. учеников на занятии</label>
          <NumberInput value={f.max_per_slot} onChange={v=>set('max_per_slot',v)} min={0} placeholder="0 = без ограничений" />
        </div>
        <div className="form-group"><label className="form-label">Цвет направления</label>
          <ColorPicker value={f.color} onChange={v=>set('color',v)} />
        </div>
      </div>

      {/* Формат записи */}
      <div className="form-group">
        <label className="form-label">Формат записи</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {[['group','👥 Групповой'],['calendar','📅 По записи на даты'],['client_days','🗓 По дням клиента']].map(([val, label]) => (
            <label key={val} onClick={() => set('enrollment_type', val)} style={{
              flex: '1 1 30%', minWidth: 120, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${f.enrollment_type === val ? T.green : T.border}`,
              background: f.enrollment_type === val ? T.greenBg : T.cream,
              textAlign: 'center', fontWeight: 600, fontSize: 13,
              color: f.enrollment_type === val ? T.greenDark : T.ink,
            }}>{label}</label>
          ))}
        </div>
        {f.enrollment_type === 'group' && (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            Клиенты записаны в направление целиком. В расписании видны все активные ученики направления.
          </div>
        )}
        {f.enrollment_type === 'calendar' && (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            Клиенты записываются на конкретные даты. В расписании видно сколько человек записалось на каждый день. Больше указанного выше лимита записать не получится.
          </div>
        )}
        {f.enrollment_type === 'client_days' && (
          <div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>
              У каждого клиента отмечаются дни, по которым он ходит (из расписания направления). В расписании клиент появляется только в свои дни. Разовую запись в другой день можно добавить вручную прямо в календаре.
            </div>
            {capacityForm.total > 0 && (
              <div style={{ background: T.greenBg, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: T.greenDark, lineHeight: 1.5 }}>
                <strong>Вместимость направления — до {capacityForm.total} чел.</strong><br />
                {capacityForm.lessons} занятий в неделю × {f.max_per_slot} мест. Это потолок при условии, что каждый ходит один день в неделю — если по два, поместится вдвое меньше.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Формат оплаты педагога */}
      {features.teachers && (
        <div className="form-group">
          <label className="form-label">Как оплачивается работа педагога</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[['per_lesson','📚 За занятие'],['per_hour','⏱ За час']].map(([val, label]) => (
              <label key={val} onClick={() => set('payment_type', val)} style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${f.payment_type === val ? T.green : T.border}`,
                background: f.payment_type === val ? T.greenBg : T.cream,
                textAlign: 'center', fontWeight: 600, fontSize: 13,
                color: f.payment_type === val ? T.greenDark : T.ink,
              }}>{label}</label>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            {f.payment_type === 'per_lesson'
              ? 'Оплата за проведённое занятие. Ставка задаётся в карточке педагога — фиксированная или в зависимости от количества учеников.'
              : 'Оплата за отработанные часы. В расписании отмечается, кто работал и сколько часов — можно указать несколько педагогов на один день.'}
          </div>
        </div>
      )}

      {/* Блок подгрупп */}
      <div style={{ marginTop:18, marginBottom:14 }}>
        {/* Есть ли уже существующие подгруппы (legacy) при выключенной функции */}
        {(() => {
          // Подгруппы включаются ПО НАПРАВЛЕНИЮ, а не глобально.
          // Одна подгруппа = обычное направление без подгрупп: показываем
          // просто «Расписание», имя не спрашиваем.
          // Больше одной = режим подгрупп со своими названиями.
          const multi = groups.length > 1
          // Подгруппы уже заведены, но функция в настройках выключена
          const legacy = !features.subgroups && multi
          // Кнопку «+ Добавить подгруппу» показываем, только если функция
          // включена — или если подгруппы уже есть (чтобы можно было доработать)
          const canAdd = features.subgroups || multi

          return (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:10 }}>
                <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>
                  {multi ? `👥 Подгруппы (${groups.length})` : `🗓 Расписание${features.teachers ? ' и педагог' : ''}`}
                </div>
                {canAdd && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={addGroup}>
                    + Добавить подгруппу
                  </button>
                )}
              </div>

              <div style={{ fontSize:12, color:T.muted, marginBottom:10, lineHeight:1.5 }}>
                {multi
                  ? 'У каждой подгруппы своё расписание и педагог. Например: «Онежская утро» с одним педагогом, «Хуторская» — с другим.'
                  : canAdd
                    ? 'Подгруппы не обязательны. Если у направления одно расписание — просто заполните дни и время. Нужны разные потоки с разными педагогами — нажмите «+ Добавить подгруппу».'
                    : ''}
              </div>

              {legacy && (
                <div style={{ background: '#fff3e0', borderRadius: 12, padding: '12px 16px', marginBottom: 12, border: '1px solid #f0a83533' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#c47a00', marginBottom: 4 }}>
                    ⚠️ Функция подгрупп отключена в настройках студии
                  </div>
                  <div style={{ fontSize: 12, color: '#c47a00', lineHeight: 1.5 }}>
                    Эти подгруппы были созданы раньше и продолжают работать. Лишние можно удалить вручную — когда останется одна, направление станет обычным.
                  </div>
                </div>
              )}

              {groups.map((g, idx) => (
                <GroupBlock key={g._key} group={g} teachers={directionTeachers} addresses={addresses} idx={idx}
                  isOnly={groups.length === 1}
                  onChange={ng => updateGroup(idx, ng)}
                  onRemove={() => removeGroup(idx)} features={features}
                  hideSubgroupLabel={!multi}
                  studioId={studioId} onAddressCreated={onAddressCreated} />
              ))}
            </>
          )
        })()}
      </div>

      {/* Категории стоимости */}
      <div className="form-group">
        <label className="form-label">Категории стоимости</label>
        {priceCategories.length === 0 ? (
          <div style={{ fontSize:12, color:T.muted, padding:'8px 0' }}>
            Категорий пока нет. Добавь их в разделе «🎟️ Стоимость».
          </div>
        ) : (
          <>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
              {priceCategories.map(c => {
                const on = (f.category_ids || []).includes(c.id)
                return (
                  <div key={c.id} onClick={() => {
                    const ids = f.category_ids || []
                    set('category_ids', ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])
                  }} style={{
                    display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px',
                    borderRadius:10, cursor:'pointer', transition:'all 0.15s',
                    background: on ? T.greenBg : T.cream,
                    border:`2px solid ${on ? T.green : T.border}`,
                    color: on ? T.greenDark : T.muted,
                    fontWeight: 700, fontSize: 12,
                  }}>
                    {on && '✓ '}{c.name}
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>
              При оплате занятия будут показаны абонементы выбранных категорий
            </div>
          </>
        )}
      </div>

      {/* Превью цен из выбранных категорий */}
      {autoPrice && autoPrice.count > 0 && (
        <div style={{ background:T.greenBg, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.greenDark, marginBottom:8 }}>
            💳 Цены из выбранных категорий ({autoPrice.count} абонементов)
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {autoPrice.avgPrice !== null && (
              <div>
                <div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Среднее / занятие</div>
                <div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:20,color:T.greenDark}}>{fmt(autoPrice.avgPrice)}</div>
              </div>
            )}
            {autoPrice.singlePrice !== null && (
              <div>
                <div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Разовое</div>
                <div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:20,color:'#c47a00'}}>{fmt(autoPrice.singlePrice)}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {autoPrice && autoPrice.count === 0 && (f.category_ids || []).length > 0 && (
        <div style={{ background:'#fff4e6', borderRadius:12, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#c47a00' }}>
          ⚠️ В выбранных категориях пока нет активных абонементов. Добавь их в разделе «🎟️ Стоимость».
        </div>
      )}
    </Modal>
  )
}

export default function DirectionsPage({ directions, clients, teachers, addresses=[], subscriptions=[], reload, isAdmin, studioId, features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [directionGroups, setDirectionGroups] = useState([])
  const [priceCategories, setPriceCategories] = useState([])
  const [durations, setDurations] = useState([])
  const [localDirs, setLocalDirs] = useState(null)
  // Адреса приходят пропом из общей загрузки CRM. Созданный из модалки
  // адрес нужен на экране сразу, до следующего reload — держим его тут.
  // Как только общая загрузка его подхватит, дубль отсеется по id.
  const [freshAddresses, setFreshAddresses] = useState([])
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  useEffect(() => {
    const sorted = [...directions].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    setLocalDirs(sorted)
  }, [directions])

  const loadGroups = async () => {
    // У direction_groups нет своего studio_id — изоляция идёт через
    // направления, а они уже загружены отфильтрованными по студии.
    const dirIds = (directions || []).map(d => d.id)
    if (!dirIds.length) { setDirectionGroups([]); return }
    const { data, error } = await supabase
      .from('direction_groups')
      .select('*')
      .in('direction_id', dirIds)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      console.warn('direction_groups not available:', error.message)
      setDirectionGroups([])
      return
    }
    setDirectionGroups(data || [])
  }

  const loadCategories = async () => {
    if (!studioId) { setPriceCategories([]); return }
    const { data, error } = await supabase
      .from('price_categories').select('*')
      .eq('studio_id', studioId).order('sort_order').order('id')
    if (error) {
      console.warn('price_categories not available:', error.message)
      setPriceCategories([])
      return
    }
    setPriceCategories(data || [])
  }

  const loadDurations = async () => {
    if (!studioId) return
    const { data, error } = await supabase
      .from('lesson_durations').select('*')
      .eq('studio_id', studioId)
      .order('sort_order').order('id')
    if (error) { console.warn('lesson_durations not available:', error.message); setDurations([]); return }
    setDurations(data || [])
  }

  useEffect(() => { loadGroups(); loadCategories(); loadDurations() }, [studioId, directions])

  const allAddresses = (() => {
    const known = new Set((addresses || []).map(a => a.id))
    return [...(addresses || []), ...freshAddresses.filter(a => !known.has(a.id))]
  })()

  const handleAddressCreated = (row) => {
    setFreshAddresses(prev => prev.some(a => a.id === row.id) ? prev : [...prev, row])
    reload && reload()
  }

  const save = async ({ direction: dirData, groups: groupList }) => {
    let directionId = showEdit?.id

    // Убираем поля которых нет в таблице directions
    const { groups: _groups, ...cleanDirData } = dirData
    const dirDataWithStudio = { ...cleanDirData, studio_id: studioId }

    if (showEdit) {
      const { error } = await supabase.from('directions').update(cleanDirData).eq('id', showEdit.id)
      if (error) { alert('Ошибка сохранения направления: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('directions').insert(dirDataWithStudio).select().single()
      if (error) { alert('Ошибка создания направления: ' + error.message); return }
      directionId = data.id
    }

    if (!directionId) {
      alert('Не удалось получить ID направления')
      return
    }

    const existingForThis = directionGroups.filter(g => g.direction_id === directionId)
    const incomingIds = new Set(groupList.filter(g => g.id).map(g => g.id))

    const toDelete = existingForThis.filter(g => !incomingIds.has(g.id)).map(g => g.id)
    if (toDelete.length) {
      const { error } = await supabase.from('direction_groups').delete().in('id', toDelete)
      if (error) { alert('Ошибка удаления подгрупп: ' + error.message); return }
    }

    for (let i = 0; i < groupList.length; i++) {
      const g = groupList[i]
      const payload = {
        direction_id: directionId,
        name: g.name,
        teacher_id: g.teacher_id || null,
        address_id: g.address_id || null,
        schedule: g.schedule || null,
        sort_order: i,
      }
      if (g.id) {
        const { error } = await supabase.from('direction_groups').update(payload).eq('id', g.id)
        if (error) { alert(`Ошибка обновления подгруппы «${g.name}»: ` + error.message); return }
      } else {
        const { error } = await supabase.from('direction_groups').insert(payload)
        if (error) { alert(`Ошибка создания подгруппы «${g.name}»: ` + error.message); return }
      }
    }

    setShowEdit(null)
    setShowAdd(false)
    await loadGroups()
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить направление «${name}»? Все его подгруппы тоже будут удалены.`)) return
    const { error } = await supabase.from('directions').delete().eq('id', id)
    if (error) { alert('Ошибка удаления: ' + error.message); return }
    await loadGroups()
    reload()
  }

  const groupsByDirection = useMemo(() => {
    const map = {}
    directionGroups.forEach(g => {
      if (!map[g.direction_id]) map[g.direction_id] = []
      map[g.direction_id].push(g)
    })
    return map
  }, [directionGroups])

  const onDragStart = (id) => setDragId(id)
  const onDragOver = (e, id) => { e.preventDefault(); setDragOverId(id) }
  const onDrop = async (e, dropId) => {
    e.preventDefault()
    if (!dragId || dragId === dropId) { setDragId(null); setDragOverId(null); return }
    const list = [...(localDirs || directions)]
    const fromIdx = list.findIndex(d => d.id === dragId)
    const toIdx = list.findIndex(d => d.id === dropId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return }
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    setLocalDirs(list)
    setDragId(null)
    setDragOverId(null)
    await Promise.all(list.map((d, i) =>
      supabase.from('directions').update({ sort_order: i }).eq('id', d.id)
    ))
  }
  const onDragEnd = () => { setDragId(null); setDragOverId(null) }

  // Направления без педагогов — показываем только если педагоги включены
  const dirsWithoutTeacher = features.teachers
    ? directions.filter(d => !(teachers || []).some(t => (t.direction_ids || []).includes(d.id)))
    : []

  return (
    <div>
      {/* Уведомление о направлениях без педагогов */}
      {features.teachers && dirsWithoutTeacher.length > 0 && (
        <div style={{ background: '#fde8e8', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1px solid #e05a5a33' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#c0392b', marginBottom: 6 }}>
            ⚠️ К некоторым направлениям не закреплён педагог
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dirsWithoutTeacher.map(d => (
              <span key={d.id}
                style={{ background: '#e05a5a22', color: '#c0392b', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #e05a5a44' }}>
                {d.name}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#c0392b', marginTop: 6 }}>Откройте раздел «👩‍🏫 Педагоги» и отметьте эти направления в карточках педагогов</div>
        </div>
      )}
      {isAdmin && <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Новое направление</button></div>}
      {isAdmin && (localDirs || directions).length > 1 && (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⠿ Перетащите карточки чтобы изменить порядок
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
        {(localDirs || directions).map(d => {
          const cnt = clients.filter(c=>(c.direction_ids||[]).includes(d.id)&&c.status==='Активен').length
          const color = d.color||DIRECTION_COLORS[0]
          const auto = calcAutoPrice(d, subscriptions)
          const subgroups = groupsByDirection[d.id] || []
          // Вместимость «по дням клиента» считается: занятий в неделю × мест на занятии
          const lessonsPerWeek = weeklyLessons(
            subgroups.length ? subgroups.map(g => g.schedule || d.schedule) : [d.schedule]
          )
          const clientDaysCap = lessonsPerWeek * (d.max_per_slot || 0)
          // Групповое — лимит занятия, «по дням клиента» — расчётная вместимость,
          // «по записи на даты» — постоянного состава нет, сравнивать не с чем
          const cap = d.enrollment_type === 'calendar' ? 0
            : d.enrollment_type === 'client_days' ? clientDaysCap
            : (d.max_per_slot || 0)
          const isFull = cap>0 && cnt>=cap
          const isNear = cap>0 && cnt>=cap*0.8
          const showLegacy = subgroups.length === 0

          return (
            <div key={d.id} className="card card-pad"
              draggable={isAdmin}
              onDragStart={() => onDragStart(d.id)}
              onDragOver={(e) => onDragOver(e, d.id)}
              onDrop={(e) => onDrop(e, d.id)}
              onDragEnd={onDragEnd}
              style={{
                borderTop:`4px solid ${color}`,
                opacity: dragId === d.id ? 0.4 : 1,
                outline: dragOverId === d.id ? `2px dashed ${color}` : 'none',
                cursor: isAdmin ? 'grab' : 'default',
                transition: 'opacity 0.15s, outline 0.1s',
              }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {isAdmin && <span style={{ color: T.muted, fontSize: 14 }}>⠿</span>}
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{d.name}</div>
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <span className={`badge ${isFull?'badge-red':isNear?'badge-orange':'badge-green'}`}>
                    {cnt}{cap>0?`/${cap}`:''} чел.
                  </span>
                  {isAdmin && <>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setShowEdit(d)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>del(d.id,d.name)}>🗑️</button>
                  </>}
                </div>
              </div>

              <div style={{ fontSize:12, color:T.muted, marginBottom:8 }}>
                ⏱ {d.duration||'1 час'}
                {d.enrollment_type === 'calendar' && (
                  <span style={{ marginLeft: 8, background: T.greenBg, color: T.greenDark, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
                    📅 По записи{d.max_per_slot > 0 ? ` (макс. ${d.max_per_slot})` : ''}
                  </span>
                )}
                {d.enrollment_type === 'client_days' && (
                  <span style={{ marginLeft: 8, background: '#e0e7ff', color: '#4338ca', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
                    🗓 По дням клиента
                  </span>
                )}
                {d.payment_type === 'per_hour' && (
                  <span style={{ marginLeft: 8, background: '#fff4e6', color: '#c47a00', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
                    ⏱ Почасовая оплата
                  </span>
                )}
                {d.enrollment_type === 'client_days' && clientDaysCap > 0 && (
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                    Вместимость до {clientDaysCap} чел. — {lessonsPerWeek} занятий × {d.max_per_slot} мест, если каждый ходит один день
                  </div>
                )}
              </div>

              {!showLegacy && (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                  {subgroups.map(sg => {
                    const slots = parseSlots(sg.schedule || '')
                    const dirTeachers = (teachers || []).filter(t => (t.direction_ids || []).includes(d.id))
                    const addr = sg.address_id ? addresses.find(a => a.id === sg.address_id) : null
                    return (
                      <div key={sg.id} style={{ background: color+'10', borderLeft:`3px solid ${color}`, borderRadius:8, padding:'8px 10px' }}>
                        {/* Имя показываем только когда подгрупп несколько.
                            Одна подгруппа = обычное расписание направления,
                            служебное «Основная» пользователю не нужно. */}
                        {subgroups.length > 1 && (
                          <div style={{ fontWeight:800, fontSize:13, color:T.ink, marginBottom:3 }}>📍 {sg.name}</div>
                        )}
                        {features.teachers && (
                          <div style={{ fontSize:12, color:T.muted, marginBottom:3 }}>
                            👩‍🏫 {dirTeachers.length ? dirTeachers.map(t => t.name).join(', ') : '— педагог не закреплён —'}
                          </div>
                        )}
                        {addr && (
                          <div style={{ fontSize:12, marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ width:8, height:8, borderRadius:'50%', background:addr.color||'#999', display:'inline-block', flexShrink:0 }} />
                            <span style={{ color:T.muted }}>{addr.name}</span>
                          </div>
                        )}
                        {slots.length > 0 ? (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                            {slots.map((s,i)=><span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 6px', borderRadius:6, fontSize:11, fontWeight:700, background:color+'22', color }}>{s.day} {s.time}</span>)}
                          </div>
                        ) : <div style={{ fontSize:11, color:T.muted }}>🕐 расписание не задано</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {showLegacy && (
                <>
                  <div style={{ marginBottom:10 }}>
                    {(() => {
                      const slots = parseSlots(d.schedule||'')
                      return slots.length>0 ? (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {slots.map((s,i)=><span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:8, fontSize:12, fontWeight:700, background:color+'22', color }}>{s.day} {s.time}</span>)}
                        </div>
                      ) : <div style={{ fontSize:13, color:T.muted }}>🕐 {d.schedule||'—'}</div>
                    })()}
                  </div>
                  {features.teachers && (() => {
                    const dt = (teachers || []).filter(t => (t.direction_ids || []).includes(d.id))
                    return <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>👩‍🏫 {dt.length ? dt.map(t => t.name).join(', ') : '—'}</div>
                  })()}
                </>
              )}

              {/* Блок категорий */}
              {(d.category_ids || []).length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                  {(d.category_ids || []).map(cid => {
                    const cat = priceCategories.find(c => c.id === cid)
                    if (!cat) return null
                    return (
                      <span key={cid} className="badge" style={{ background: T.greenBg, color: T.greenDark, fontWeight:700 }}>
                        🏷 {cat.name}
                      </span>
                    )
                  })}
                </div>
              )}

              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, background:T.greenBg, borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:T.greenDark, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>С абонементом</div>
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:18, color:T.greenDark }}>{auto.avgPrice?fmt(auto.avgPrice):'—'}</div>
                  {auto.avgPrice&&<div style={{fontSize:9,color:T.muted}}>среднее из абонементов</div>}
                </div>
                <div style={{ flex:1, background:'#fff4e6', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#c47a00', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Разовое</div>
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:18, color:'#c47a00' }}>{auto.singlePrice?fmt(auto.singlePrice):'—'}</div>
                </div>
              </div>
              {auto.count>0 && (
                <div style={{ marginTop:10, textAlign:'right' }}>
                  <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>setShowDetail(d)}>Подробнее →</button>
                </div>
              )}
            </div>
          )
        })}
        {!directions.length && <div className="card card-pad"><div className="empty"><div className="empty-icon">🎯</div><div className="empty-text">Направлений пока нет</div></div></div>}
      </div>

      {showDetail && (
        <div className="modal-backdrop" onClick={()=>setShowDetail(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💳 Варианты оплаты — {showDetail.name}</span>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              {(() => {
                const catIds = showDetail.category_ids || []
                const relevant = subscriptions.filter(s => {
                  if (!s.is_active) return false
                  if (catIds.length > 0) return s.category_id && catIds.includes(s.category_id)
                  // Fallback на старую логику для направлений без категорий
                  return (s.direction_ids||[]).length === 0 || (s.direction_ids||[]).includes(showDetail.id)
                })
                if (relevant.length === 0) {
                  return <div style={{ padding:'20px 0', textAlign:'center', color:T.muted, fontSize:13 }}>В категориях этого направления пока нет абонементов</div>
                }
                return relevant.map(s => {
                  const cat = priceCategories.find(c => c.id === s.category_id)
                  return (
                    <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:`1px solid ${T.border}`}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14}}>{s.name}</div>
                        <div style={{fontSize:12,color:T.muted}}>
                          {cat && <>🏷 {cat.name} · </>}
                          {s.lessons_count} зан. · {s.period}{s.notes?` · ${s.notes}`:''}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:T.greenDark}}>{fmt(s.price)}</div>
                        {s.lessons_count>1&&<div style={{fontSize:11,color:T.muted}}>{fmt(Math.round(s.price/s.lessons_count))}/зан.</div>}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {showAdd && <DirectionModal directionGroups={directionGroups} teachers={teachers} addresses={allAddresses} subscriptions={subscriptions} priceCategories={priceCategories} durations={durations} onClose={()=>setShowAdd(false)} onSave={save} features={features}
        studioId={studioId} onDurationCreated={loadDurations} onAddressCreated={handleAddressCreated} />}
      {showEdit && <DirectionModal direction={showEdit} directionGroups={directionGroups} teachers={teachers} addresses={allAddresses} subscriptions={subscriptions} priceCategories={priceCategories} durations={durations} onClose={()=>setShowEdit(null)} onSave={save} features={features}
        studioId={studioId} onDurationCreated={loadDurations} onAddressCreated={handleAddressCreated} />}
    </div>
  )
}
