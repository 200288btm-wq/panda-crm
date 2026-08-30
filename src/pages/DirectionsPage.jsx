import { useState, useMemo, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { T, fmt, ruDate } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { QuickAdd } from '../components/QuickAdd'
import { Hint } from '../components/Hint'
import { createDuration, createAddress, createCategory } from '../lib/dictionaries'
import { NumberInput } from '../components/SearchSelect'
import DeleteOrArchiveModal from '../components/DeleteOrArchiveModal'
import { DIRECTION_TRACES, GROUP_TRACES, countTraces, setArchived } from '../lib/archive'
import { statusIndex, inStats } from '../lib/clientStatus'
import { toast, confirmAction } from '../lib/ui'

// Цвета работают как метки: их различают боковым зрением на карточках
// и в расписании. Поэтому подряд идут разные тона, а не оттенки одного.
const DIRECTION_COLORS = [
  '#7BAF8E', // шалфей — фирменный, по умолчанию
  '#E4572E', // терракота
  '#3B82F6', // синий
  '#F2A65A', // охра
  '#7C3AED', // фиолетовый
  '#0F9B8E', // бирюзовый
  '#D62598', // малиновый
  '#B45309', // коричневый
  '#2563A0', // синий стальной
  '#5B8C2A', // оливковый
]
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

// Редактор расписания.
//
// Главное правило: в одной подгруппе на один день не больше ОДНОГО
// времени. Занятие в 17:00 и занятие в 18:00 — это разные дети,
// возможно разный педагог и разный адрес, то есть разные подгруппы.
//
// Раньше кнопка «+» добавляла второй слот в тот же день, и календарь
// показывал только первый: у «Академии Панды» так потерялось 97 занятий
// в неделю из 151. Теперь «+» заводит отдельную подгруппу.
function ScheduleBuilder({ slots, onChange, compact, onSplitOut }) {
  const activeDays = [...new Set(slots.map(s => s.day))]
  const toggleDay = (key) => {
    const ds = slots.filter(s => s.day === key)
    if (ds.length) onChange(slots.filter(s => s.day !== key))
    else onChange([...slots, { day: key, time: '10:00', id: Date.now()+Math.random() }])
  }
  // Без onSplitOut (старые вызовы) ведём себя как раньше
  const addSlot = (key) => {
    if (onSplitOut) { onSplitOut({ day: key, time: '10:00' }); return }
    onChange([...slots, { day: key, time: '10:00', id: Date.now()+Math.random() }])
  }
  // Слот уезжает в новую подгруппу: сначала убираем у себя, потом просим
  // родителя завести. Так локальное состояние не расходится с родительским
  const splitSlot = (slot) => {
    onChange(slots.filter(s => s.id !== slot.id))
    onSplitOut && onSplitOut(slot)
  }
  const updateTime = (id, time) => onChange(slots.map(s => s.id === id ? {...s,time} : s))
  const removeSlot = (id) => onChange(slots.filter(s => s.id !== id))
  // Дни, где указано больше одного времени — наследство до разреза
  const crowded = [...new Set(slots.map(s => s.day))].filter(d => slots.filter(s => s.day === d).length > 1)

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
                    {idx === daySlots.length-1 && (
                      <button type="button" onClick={() => addSlot(d.key)}
                        title={onSplitOut ? 'Ещё одно занятие в этот день — заведём отдельную подгруппу' : 'Добавить время'}
                        style={{ width:24, height:24, borderRadius:6, background:T.greenBg, border:`1.5px solid ${T.green}`, color:T.greenDark, cursor:'pointer', fontWeight:800, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>+</button>
                    )}
                    {/* Лишние времена этого дня можно вынести по одному */}
                    {idx > 0 && onSplitOut && (
                      <button type="button" onClick={() => splitSlot(slot)}
                        style={{ padding:'3px 8px', borderRadius:7, background:'#fff4e6', border:'1px solid #f0c893', color:'#c47a00', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                        ↗ в свою подгруппу
                      </button>
                    )}
                    <button type="button" onClick={() => removeSlot(slot.id)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.muted, fontSize:14, padding:'4px', flexShrink:0 }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {!slots.length && <div style={{ fontSize:12, color:T.muted }}>Выберите дни недели выше</div>}

      {/* Предупреждение для расписаний, заведённых до разреза подгрупп.
          Молчать нельзя: занятие с двумя временами выглядит нормально,
          а в календаре видно только первое */}
      {onSplitOut && crowded.length > 0 && (
        <div style={{ marginTop:8, background:'#fff4e6', border:'1px solid #f0c893', borderRadius:10, padding:'9px 11px', fontSize:11.5, color:'#8a5a00', lineHeight:1.45 }}>
          <b>В календаре будет видно только первое время.</b> В этой подгруппе на {crowded.join(', ')} указано
          несколько занятий, а подгруппа — это одно занятие: свои дни, своё время, свой педагог.
          Нажмите «↗ в свою подгруппу» у лишних, и они станут отдельными.
        </div>
      )}

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
function GroupBlock({ group, addresses, onChange, onRemove, isOnly, idx, features = {}, hideSubgroupLabel = false, studioId, onAddressCreated, onSplitOut }) {
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
              onClick={async () => {
                const ok = await confirmAction({
                  title: 'Убрать подгруппу из расписания?',
                  text: `Подгруппа «${group.name || 'без названия'}» вместе со своим временем перестанет появляться в расписании, в карточках клиентов и педагогов. Если по ней уже были занятия, отметки или выплаты — она уйдёт в архив, а вся история останется на месте и никуда не денется; вернуть её можно тут же, внизу окна. Если истории нет — просто удалится. Изменение сохранится, когда вы нажмёте «Сохранить».`,
                  confirmLabel: 'Убрать из расписания', cancelLabel: 'Оставить', danger: true,
                })
                if (ok) onRemove()
              }}
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
      </div>
      {features.addresses && (
        <div className="form-group">
          <label className="form-label">Адрес занятий</label>
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
        <label className="form-label">{hideSubgroupLabel ? 'Расписание направления' : 'Расписание подгруппы'}</label>
        <ScheduleBuilder slots={slots} compact onChange={handleSlots}
          onSplitOut={onSplitOut ? (slot => onSplitOut(group, slot)) : undefined} />
      </div>
    </div>
  )
}

function DirectionModal({ direction, directionGroups, teachers, addresses, subscriptions, priceCategories = [], durations = [], onClose, onSave, features = {}, studioId, onDurationCreated, onAddressCreated, onCategoryCreated }) {
  // Существующие подгруппы для редактируемого направления.
  // Архивные в редактор не попадают: их время из расписания уже убрано,
  // и показывать их как строку, которую можно править, — врать.
  // Они видны отдельным списком под расписанием, откуда их возвращают.
  const existingGroups = direction
    ? directionGroups.filter(g => g.direction_id === direction.id && !g.archived_at)
    : []
  const archivedGroups = direction
    ? directionGroups.filter(g => g.direction_id === direction.id && g.archived_at)
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
        // Служебное имя «Основная» прячем, когда действующая подгруппа
        // одна: это просто расписание направления. Считаем по живым —
        // убранные в расписании больше не участвуют.
        name: (g.name === 'Основная' && existingGroups.length === 1) ? '' : (g.name || ''),
        teacher_id: g.teacher_id || null,
        address_id: g.address_id || null,
        schedule: g.schedule || '',
      }))
    }
    return [{ _key: `new-${Date.now()}`, name: '', teacher_id: null, address_id: null, schedule: '' }]
  })

  // Подгруппы, которые в этом окне вернули из архива. Возврат — такое же
  // изменение расписания, как и уборка: применяется по «Сохранить»,
  // а не в момент нажатия. Иначе получается ровно та путаница, когда
  // окно закрыли без сохранения, а подгруппа вернулась.
  const [restoredIds, setRestoredIds] = useState([])
  const shownArchived = archivedGroups.filter(g => !restoredIds.includes(g.id))

  const restoreHere = async (g) => {
    const label = (g.name || '').trim() || 'без названия'
    const ok = await confirmAction({
      title: 'Вернуть подгруппу в расписание?',
      text: `Время «${label}» снова начнёт появляться в расписании — с сегодняшнего дня, прошлые даты не изменятся. Вернётся, когда вы нажмёте «Сохранить». Проверьте потом, кто в неё записан: пока подгруппы не было, детей и педагогов могли перевести на другое время.`,
      confirmLabel: 'Вернуть', cancelLabel: 'Не возвращать',
    })
    if (!ok) return
    setRestoredIds(prev => [...prev, g.id])
    setGroups(prev => prev.some(x => x.id === g.id) ? prev : [...prev, {
      _key: `existing-${g.id}`,
      id: g.id,
      name: g.name || '',
      teacher_id: g.teacher_id || null,
      address_id: g.address_id || null,
      schedule: g.schedule || '',
    }])
  }

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
  // Занятие в другое время — отдельная подгруппа. Заводим её сразу
  // заполненной: тот же педагог и адрес, что у исходной, название по
  // времени. Человеку остаётся поправить, если нужно, а не собирать
  // с нуля — иначе правило «одно время = одна подгруппа» будет
  // ощущаться наказанием за попытку добавить занятие.
  const splitOut = (fromGroup, slot) => {
    setGroups(prev => [...prev, {
      _key: `new-${Date.now()}-${Math.random()}`,
      name: slot.time,
      teacher_id: fromGroup?.teacher_id || null,
      address_id: fromGroup?.address_id || null,
      schedule: `${slot.day} ${slot.time}`,
    }])
    toast.info(`Занятие ${slot.day} ${slot.time} вынесено в отдельную подгруппу — проверьте педагога и адрес`)
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
        toast.error(`Укажите название подгруппы №${empty + 1}`)
        return
      }
    }
    if (!f.name || !f.name.trim()) {
      toast.error('Укажите название направления')
      return
    }
    // Подгруппа без расписания не даёт ни одного занятия: она есть в
    // списке, в неё можно записать ребёнка и назначить педагога, но
    // занятий по ней не существует — и понять это неоткуда.
    //
    // Проверяем только когда подгрупп несколько: раз человек завёл
    // отдельную подгруппу, он имел в виду отдельное занятие. Направление
    // без подгрупп можно сохранить и без расписания — это обычное
    // «завожу сегодня, расписание завтра».
    if (subgroupsVisible) {
      const noSchedule = cleaned.filter(g => !parseSlots(g.schedule || '').length)
      if (noSchedule.length) {
        toast.error(
          `Не заполнено расписание: ${noSchedule.map(g => `«${g.name}»`).join(', ')}`,
          'Занятий по такой подгруппе не будет — она не появится ни в календаре, ни в отметках. Укажите дни и время или удалите подгруппу.'
        )
        return
      }
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
      <div className="form-row">
        <div className="form-group"><label className="form-label">Название *</label>
          <input className="form-input" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Смышлёная Панда / Английский язык" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">
            Цвет
            <Hint text="Этим цветом направление помечается в расписании и на карточках. Берите разные — так их проще различать взглядом." />
          </label>
          <ColorPicker value={f.color} onChange={v=>set('color',v)} />
        </div>
      </div>
      <div className="form-row-3">
        <div className="form-group">
          <label className="form-label">
            Длительность
            <Hint text="По этому значению считается почасовая оплата педагогам. Список значений настраивается в «Настройки → Справочники» — или добавьте прямо здесь." />
          </label>
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
          {+f.duration_hours > 0 && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{f.duration_hours} ч.</div>
          )}
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
        <div className="form-group">
          <label className="form-label">
            Дата запуска
            <Hint text="По умолчанию сегодня. Поставьте более раннюю дату, если направление уже работает и нужно внести посещения задним числом." />
          </label>
          <input className="form-input" type="date" value={f.launched} onChange={e=>set('launched',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">
            Макс. учеников
            <Hint text="Сколько человек помещается на одно занятие. 0 — без ограничений." />
          </label>
          <NumberInput value={f.max_per_slot} onChange={v=>set('max_per_slot',v)} min={0} placeholder="0 = без ограничений" />
        </div>
      </div>

      {/* Формат записи */}
      <div className="form-group">
        <label className="form-label">
          Формат записи
          <Hint text="Как клиенты попадают в расписание: записаны в направление целиком, записываются на конкретные даты, или ходят по своим дням недели." />
        </label>
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
                  {multi ? `👥 Подгруппы (${groups.length})` : '🗓 Расписание направления'}
                </div>
                {canAdd && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={addGroup}>
                    + Добавить подгруппу
                  </button>
                )}
              </div>

              <div style={{ fontSize:12, color:T.muted, marginBottom:10, lineHeight:1.5, display: multi ? 'none' : undefined }}>
                {multi
                  ? ''
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
                <GroupBlock key={g._key} group={g} addresses={addresses} idx={idx}
                  isOnly={groups.length === 1}
                  onChange={ng => updateGroup(idx, ng)}
                  onRemove={() => removeGroup(idx)} features={features}
                  hideSubgroupLabel={!multi}
                  studioId={studioId} onAddressCreated={onAddressCreated}
                  onSplitOut={splitOut} />
              ))}
            </>
          )
        })()}
      </div>

      {/* Архив подгрупп. Показываем прямо здесь, а не в отдельном разделе:
          человек убирает время из расписания и тут же, в этом же окне,
          должен видеть, что оно не пропало и его можно вернуть. */}
      {shownArchived.length > 0 && (
        <div style={{ marginTop: 14, background: T.cream, borderRadius: 12, padding: '12px 14px', border: `1.5px dashed ${T.border}` }}>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:12, color:T.muted, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
            🗄 Убраны из расписания
          </div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:10, lineHeight:1.5 }}>
            Эти времена больше не появляются в расписании и в карточках, но занятия,
            отметки и выплаты по ним сохранены и продолжают считаться. Прошлые даты
            в календаре показывают их как раньше.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {shownArchived.map(g => (
              <div key={g.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, background:'white', borderRadius:9, padding:'7px 10px', border:`1px solid ${T.border}` }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:T.ink }}>
                    {(g.name || '').trim() || 'без названия'}
                  </div>
                  <div style={{ fontSize:11, color:T.muted }}>
                    {g.schedule || 'без расписания'}
                    {g.archived_at ? ` · убрана ${ruDate(g.archived_at)}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => restoreHere(g)}
                  style={{ background:'none', border:`1.5px solid ${T.border}`, borderRadius:8, cursor:'pointer', color:T.greenDark, fontSize:12, fontWeight:700, padding:'5px 10px', whiteSpace:'nowrap' }}>
                  ↩ Вернуть
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кто ведёт — справка. Связь заводится в карточке педагога:
          там же задаётся ставка, без неё занятие посчитается в ноль. */}
      {features.teachers && (
        <div className="form-group" style={{ marginTop: 18 }}>
          <label className="form-label">
            Педагоги
            <Hint text="Список собирается из карточек педагогов: откройте «Педагоги» и отметьте это направление у нужного человека. Там же задаётся его ставка." />
          </label>
          {directionTeachers.length === 0 ? (
            <div style={{ fontSize:12, color:T.muted, padding:'6px 0' }}>
              Пока никто не закреплён.
            </div>
          ) : (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {directionTeachers.map(t => (
                <span key={t.id} style={{ background:T.greenBg, color:T.greenDark, borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700 }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
          {directionTeachers.length > 1 && (
            <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>
              Кто вёл занятие в конкретный день — отмечается в расписании.
            </div>
          )}
        </div>
      )}
      {/* Формат оплаты педагога */}
      {features.teachers && (
        <div className="form-group">
          <label className="form-label">
            Как оплачивается работа педагога
            <Hint text="Способ расчёта для этого направления. Сама ставка — в карточке педагога: фиксированная, по числу учеников или почасовая." />
          </label>
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

      {/* Категории стоимости — только если функция включена в настройках */}
      {features.categories !== false && (
      <div className="form-group">
        <label className="form-label">
          Категории стоимости
          <Hint text="Определяют, какие абонементы предложить при оплате этого направления. Настраиваются в разделе «Стоимость»." />
        </label>
        {priceCategories.length === 0 ? (
          <div style={{ fontSize:12, color:T.muted, padding:'8px 0' }}>
            Категорий пока нет. Можно добавить прямо здесь — она попадёт в раздел «🎟️ Стоимость».
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
        <QuickAdd
          label="добавить категорию"
          fields={[{ key: 'name', placeholder: 'Название (Абонемент 8 занятий)', flex: 1, minWidth: 180 }]}
          onCreate={vals => createCategory(studioId, vals)}
          onCreated={async (row) => {
            // Отмечаем созданную категорию сразу — за ней сюда и пришли
            set('category_ids', [...(f.category_ids || []), row.id])
            onCategoryCreated && await onCategoryCreated()
          }}
        />
      </div>
      )}

      {/* Превью цен. Источник зависит от того, выбраны ли категории:
          выбраны — абонементы этих категорий, не выбраны — все активные. */}
      {autoPrice && autoPrice.count > 0 && (
        <div style={{ background:T.greenBg, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.greenDark, marginBottom:8 }}>
            💳 {(f.category_ids || []).length > 0
                  ? `Цены из выбранных категорий (${autoPrice.count} абонементов)`
                  : `Цены из всех абонементов студии (${autoPrice.count})`}
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

export default function DirectionsPage({ directions, clients, teachers, addresses=[], subscriptions=[], clientStatuses=[], reload, isAdmin, studioId, features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  // Сколько детей числится в направлении — по галочке in_stats
  // справочника, а не по названию статуса
  const statusIdx = useMemo(() => statusIndex(clientStatuses), [clientStatuses])
  const [directionGroups, setDirectionGroups] = useState([])
  const [priceCategories, setPriceCategories] = useState([])
  const [durations, setDurations] = useState([])
  const [localDirs, setLocalDirs] = useState(null)
  // Адреса приходят пропом из общей загрузки CRM. Созданный из модалки
  // адрес нужен на экране сразу, до следующего reload — держим его тут.
  // Как только общая загрузка его подхватит, дубль отсеется по id.
  const [freshAddresses, setFreshAddresses] = useState([])
  const detailDownRef = useRef(false)
  const [dragId, setDragId] = useState(null)
  const [deleteAsk, setDeleteAsk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const archivedDirs = (directions || []).filter(d => d.archived_at)
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
    if (!studioId || features.categories === false) { setPriceCategories([]); return }
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

  useEffect(() => { loadGroups(); loadCategories(); loadDurations() }, [studioId, directions, features.categories])

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
      if (error) { toast.fromError(error, 'Не удалось сохранить направление'); return }
    } else {
      const { data, error } = await supabase.from('directions').insert(dirDataWithStudio).select().single()
      if (error) { toast.fromError(error, 'Не удалось создать направление'); return }
      directionId = data.id
    }

    if (!directionId) {
      toast.error('Не удалось получить номер направления — попробуйте ещё раз')
      return
    }

    // Архивные в редактор не приходят, поэтому и в разницу попасть
    // не должны: иначе сохранение направления «удаляло» бы их повторно.
    const existingForThis = directionGroups.filter(g => g.direction_id === directionId && !g.archived_at)
    const incomingIds = new Set(groupList.filter(g => g.id).map(g => g.id))

    const removed = existingForThis.filter(g => !incomingIds.has(g.id))
    if (removed.length) {
      // Подгруппа = занятие, поэтому за ней числится история занятий
      // и денег. Опасность в том, что подгруппа исчезает не по кнопке
      // «Удалить», а по сохранению направления, из которого убрали
      // строку расписания: человек думает, что правит расписание.
      //
      // Поэтому решение принимается здесь, по факту истории:
      //   история есть → в архив: расписание её больше не показывает,
      //                  отметки, часы и выплаты остаются на месте
      //   истории нет  → удаляем совсем, это просто лишняя строка
      //
      // База ту же границу держит жёстко (RESTRICT + проверка
      // block_delete_group_with_history), так что ошибиться и снести
      // историю нельзя даже мимо этого кода.
      const toArchive = []
      const toDelete = []
      for (const g of removed) {
        const label = (g.name || '').trim() || 'без названия'
        const traces = await countTraces(GROUP_TRACES, g.id, studioId)
        // Сбой проверки — не то же самое, что «истории нет».
        // Молча удалить из-за обрыва связи — худший исход.
        if (traces.errors.length) {
          toast.error(
            `Не удалось проверить историю подгруппы «${label}» — направление не сохранено`,
            traces.errors.join('; ')
          )
          return
        }
        ;(traces.total > 0 ? toArchive : toDelete).push({ id: g.id, name: label, traces })
      }

      if (toArchive.length) {
        const { data: u } = await supabase.auth.getUser()
        const { error: arcErr } = await supabase
          .from('direction_groups')
          .update({ archived_at: new Date().toISOString(), archived_by: u?.user?.id || null })
          .in('id', toArchive.map(x => x.id))
        if (arcErr) { toast.fromError(arcErr, 'Не удалось убрать подгруппы в архив'); return }
      }

      if (toDelete.length) {
        const ids = toDelete.map(x => x.id)
        // Ставка — справочник, а не история: сама по себе она удалению
        // не мешает, но оставленная строка ссылалась бы в пустоту.
        // Истории у этих подгрупп нет (проверено выше), поэтому снятие
        // ставки ничего не пересчитывает. У архивных ставку не трогаем:
        // по ней считалось прошлое.
        const { error: rateErr } = await supabase
          .from('teacher_rates').delete().in('group_id', ids).eq('studio_id', studioId)
        if (rateErr) { toast.fromError(rateErr, 'Не удалось убрать ставки удалённых подгрупп'); return }

        // Дети, записанные в эти подгруппы. Внешнего ключа у массива
        // clients.group_ids нет, поэтому без явной чистки осталась бы
        // ссылка на подгруппу, которой больше нет. У архивных ссылку
        // сохраняем: подгруппа существует, просто больше не в расписании.
        const { data: affected, error: cliErr } = await supabase
          .from('clients').select('id, group_ids')
          .eq('studio_id', studioId).overlaps('group_ids', ids)
        if (cliErr) { toast.fromError(cliErr, 'Не удалось проверить записи детей в подгруппы'); return }
        for (const c of affected || []) {
          const left = (c.group_ids || []).map(Number).filter(id => !ids.includes(id))
          const { error: updErr } = await supabase
            .from('clients').update({ group_ids: left }).eq('id', c.id).eq('studio_id', studioId)
          if (updErr) { toast.fromError(updErr, 'Не удалось обновить записи детей в подгруппы'); return }
        }

        const { error } = await supabase.from('direction_groups').delete().in('id', ids)
        if (error) { toast.fromError(error, 'Не удалось удалить подгруппы'); return }
      }

      // Про архив говорим отдельно и словами: человек нажимал «удалить»,
      // а произошло другое, и молчание об этом было бы обманом.
      if (toArchive.length) {
        toast.info(
          toArchive.length === 1
            ? `Подгруппа «${toArchive[0].name}» убрана в архив, а не удалена — за ней числится история`
            : `Убраны в архив, а не удалены: ${toArchive.map(x => `«${x.name}»`).join(', ')} — за ними числится история`,
          'В расписании их больше не будет, но отметки, часы и выплаты сохранены. Вернуть можно в этом же окне, внизу.'
        )
      }
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
        // Подгруппа есть в расписании — значит она не в архиве. Если её
        // вернули из архива в этом же окне, снятие метки едет тем же
        // запросом, что и остальные поля: возврат применяется по
        // «Сохранить», как и уборка, а не в момент нажатия кнопки.
        const wasArchived = directionGroups.some(x => x.id === g.id && x.archived_at)
        if (wasArchived) { payload.archived_at = null; payload.archived_by = null }
        const { error } = await supabase.from('direction_groups').update(payload).eq('id', g.id)
        if (error) { toast.fromError(error, `Не удалось сохранить подгруппу «${g.name}»`); return }
      } else {
        const { error } = await supabase.from('direction_groups').insert(payload)
        if (error) { toast.fromError(error, `Не удалось создать подгруппу «${g.name}»`); return }
      }
    }

    toast.success(showEdit ? 'Направление сохранено' : 'Направление создано')
    setShowEdit(null)
    setShowAdd(false)
    await loadGroups()
    reload()
  }

  // Удаление разрешено только направлению без истории. Всё, по чему уже
  // были занятия, уходит в архив: отметки и журнал — основа расчётов.
  const del = async (id, name) => {
    const dir = (directions || []).find(x => x.id === id)
    setDeleteAsk({ id, name, loading: true })
    const traces = await countTraces(DIRECTION_TRACES, id, studioId)
    setDeleteAsk({ id, name, loading: false, traces, archived: !!dir?.archived_at })
  }

  const doDelete = async () => {
    const { id, name } = deleteAsk
    setBusy(true)
    // Ставка сама по себе не история, но связь teacher_rates → directions
    // блокирует удаление. Чистим её до направления, иначе пользователь
    // увидит сырую ошибку Postgres вместо понятного сообщения.
    await supabase.from('teacher_rates').delete().eq('direction_id', id).eq('studio_id', studioId)
    const { error } = await supabase.from('directions').delete().eq('id', id).eq('studio_id', studioId)
    setBusy(false)
    if (error) { toast.fromError(error, `Удалить «${name}» не получилось`); return }
    setDeleteAsk(null)
    toast.success(`Направление «${name}» удалено`)
    await loadGroups()
    reload()
  }

  const doArchive = async (id, archived) => {
    setBusy(true)
    const { error } = await setArchived('directions', id, studioId, archived)
    setBusy(false)
    if (error) { toast.fromError(error, archived ? 'Не удалось отправить в архив' : 'Не удалось вернуть из архива'); return }
    setDeleteAsk(null)
    toast.success(archived ? 'Направление отправлено в архив' : 'Направление возвращено из архива')
    reload()
  }

  // Карточка направления показывает расписание и вместимость на сегодня,
  // поэтому архивные подгруппы сюда не входят: их времени в расписании
  // больше нет, и в «занятий в неделю» они попадать не должны.
  // Возвращают их из окна редактирования направления.
  const groupsByDirection = useMemo(() => {
    const map = {}
    directionGroups.filter(g => !g.archived_at).forEach(g => {
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
        {(localDirs || directions).filter(d => !d.archived_at).map(d => {
          const cnt = clients.filter(c=>(c.direction_ids||[]).includes(d.id)&&inStats(statusIdx, c.status)).length
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
                    // Педагог виден под подгруппой, если ведёт именно её.
                    // Пустой group_ids = ведёт все подгруппы своих направлений
                    const dirTeachers = (teachers || []).filter(t => {
                      if (!(t.direction_ids || []).includes(d.id)) return false
                      const gids = t.group_ids || []
                      return gids.length === 0 || gids.includes(sg.id)
                    })
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

      {archivedDirs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowArchive(v => !v)}
            style={{ color: T.muted, fontWeight: 700 }}>
            {showArchive ? '▾' : '▸'} Архив · {archivedDirs.length}
          </button>
          {showArchive && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
                Новых занятий по этим направлениям не появляется. Прошлые
                занятия, отметки и начисления остались в календаре и расчётах.
              </div>
              {archivedDirs.map(d => (
                <div key={d.id} className="card card-pad"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, opacity: 0.75, flexWrap: 'wrap',
                           borderLeft: `4px solid ${d.color || DIRECTION_COLORS[0]}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      в архиве с {String(d.archived_at).slice(0, 10).split('-').reverse().join('.')}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" disabled={busy}
                        onClick={() => doArchive(d.id, false)}>↩ Вернуть</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: T.red }} disabled={busy}
                        onClick={() => del(d.id, d.name)}>🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteAsk && (
        <DeleteOrArchiveModal
          ask={deleteAsk}
          kind="direction"
          busy={busy}
          onClose={() => setDeleteAsk(null)}
          onArchive={() => doArchive(deleteAsk.id, true)}
          onDelete={doDelete}
        />
      )}

      {showDetail && (
        // Своя подложка вместо общей Modal: закрываем только если клик
        // начался на ней самой, иначе выделение текста мышкой закрывает окно
        <div className="modal-backdrop"
          onMouseDown={e => { detailDownRef.current = e.target === e.currentTarget }}
          onClick={e => { if (detailDownRef.current && e.target === e.currentTarget) setShowDetail(null) }}>
          <div className="modal">
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
                  return <div style={{ padding:'20px 0', textAlign:'center', color:T.muted, fontSize:13 }}>
                    {catIds.length > 0
                      ? 'В категориях этого направления пока нет абонементов'
                      : 'Активных абонементов пока нет. Добавьте их в разделе «🎟️ Стоимость».'}
                  </div>
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
        studioId={studioId} onDurationCreated={loadDurations} onAddressCreated={handleAddressCreated} onCategoryCreated={loadCategories} />}
      {showEdit && <DirectionModal direction={showEdit} directionGroups={directionGroups} teachers={teachers} addresses={allAddresses} subscriptions={subscriptions} priceCategories={priceCategories} durations={durations} onClose={()=>setShowEdit(null)} onSave={save} features={features}
        studioId={studioId} onDurationCreated={loadDurations} onAddressCreated={handleAddressCreated} onCategoryCreated={loadCategories} />}
    </div>
  )
}
