import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

const DURATIONS = ['30 минут', '45 минут', '1 час', '1.5 часа', '2 часа', 'Полдня', 'Весь день']
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

const calcAutoPrice = (dirId, subscriptions) => {
  const rel = subscriptions.filter(s => s.is_active && ((s.direction_ids||[]).length === 0 || (s.direction_ids||[]).includes(dirId)))
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
function GroupBlock({ group, teachers, onChange, onRemove, isOnly, idx }) {
  // Локально храним slots, чтобы не парсить каждый рендер
  const [slots, setSlots] = useState(() => parseSlots(group.schedule || ''))

  // Если родитель сменил group._key (например, после удаления соседней) — пересоберём slots
  // (но в типичном UX этого не нужно, просто фоллбек)
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
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Название подгруппы</label>
          <input className="form-input" value={group.name}
            onChange={e => onChange({ ...group, name: e.target.value })}
            placeholder="Онежская утро / Хуторская / Вечер..." />
        </div>
        <div className="form-group">
          <label className="form-label">Педагог</label>
          <select className="form-input" value={group.teacher_id || ''}
            onChange={e => onChange({ ...group, teacher_id: e.target.value ? +e.target.value : null })}>
            <option value="">— не назначен —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label">Расписание подгруппы</label>
        <ScheduleBuilder slots={slots} compact onChange={handleSlots} />
      </div>
    </div>
  )
}

function DirectionModal({ direction, directionGroups, teachers, subscriptions, onClose, onSave }) {
  // Существующие подгруппы для редактируемого направления
  const existingGroups = direction
    ? directionGroups.filter(g => g.direction_id === direction.id)
    : []

  const [f, setF] = useState(direction ? {
    name: direction.name||'', launched: direction.launched||'',
    cost_abo: direction.cost_abo||0, cost_single: direction.cost_single||0,
    duration: direction.duration||'1 час',
    color: direction.color||DIRECTION_COLORS[0], max_capacity: direction.max_capacity||0,
  } : { name:'', launched:'', cost_abo:0, cost_single:0, duration:'1 час', color:DIRECTION_COLORS[0], max_capacity:0 })

  // Локальное состояние подгрупп
  const [groups, setGroups] = useState(() => {
    if (existingGroups.length) {
      return existingGroups.map((g) => ({
        _key: `existing-${g.id}`,
        id: g.id,
        name: g.name || '',
        teacher_id: g.teacher_id || null,
        schedule: g.schedule || '',
      }))
    }
    return [{ _key: `new-${Date.now()}`, name: 'Основная', teacher_id: null, schedule: '' }]
  })

  const set = (k,v) => setF(p => ({...p, [k]:v}))

  const autoPrice = useMemo(() => {
    if (!direction?.id) return null
    return calcAutoPrice(direction.id, subscriptions||[])
  }, [direction?.id, subscriptions])

  const updateGroup = (idx, newGroup) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...newGroup, _key: g._key } : g))
  }
  const addGroup = () => {
    setGroups(prev => [...prev, { _key: `new-${Date.now()}-${Math.random()}`, name: '', teacher_id: null, schedule: '' }])
  }
  const removeGroup = (idx) => {
    setGroups(prev => prev.filter((_, i) => i !== idx))
  }

  const save = () => {
    const cleaned = groups.map(g => ({ ...g, name: (g.name || '').trim() }))
    const empty = cleaned.findIndex(g => !g.name)
    if (empty !== -1) {
      alert(`Пожалуйста, укажите название подгруппы №${empty + 1}`)
      return
    }
    onSave({
      direction: {
        ...f,
        cost_abo: +f.cost_abo,
        cost_single: +f.cost_single,
        max_capacity: +f.max_capacity,
        // Для совместимости со старой логикой:
        schedule: cleaned[0]?.schedule || '',
        teacher_name: cleaned[0]?.teacher_id
          ? (teachers.find(t => t.id === cleaned[0].teacher_id)?.name || '')
          : '',
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
          <select className="form-input" value={f.duration} onChange={e=>set('duration',e.target.value)}>
            {DURATIONS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Дата запуска</label>
          <input className="form-input" type="date" value={f.launched} onChange={e=>set('launched',e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Макс. учеников в группе</label>
          <input className="form-input" type="number" min="0" value={f.max_capacity} onChange={e=>set('max_capacity',e.target.value)} placeholder="0 = без ограничений" />
        </div>
        <div className="form-group"><label className="form-label">Цвет направления</label>
          <ColorPicker value={f.color} onChange={v=>set('color',v)} />
        </div>
      </div>

      {/* Блок подгрупп */}
      <div style={{ marginTop:18, marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>
            👥 Подгруппы ({groups.length})
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addGroup}>
            + Добавить подгруппу
          </button>
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:10 }}>
          У каждой подгруппы своё расписание и педагог. Например: «Онежская утро» с одним педагогом, «Хуторская» — с другим.
        </div>
        {groups.map((g, idx) => (
          <GroupBlock key={g._key} group={g} teachers={teachers} idx={idx}
            isOnly={groups.length === 1}
            onChange={ng => updateGroup(idx, ng)}
            onRemove={() => removeGroup(idx)} />
        ))}
      </div>

      {autoPrice && autoPrice.count > 0 && (
        <div style={{ background:T.greenBg, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.greenDark, marginBottom:8 }}>🧮 Из абонементов ({autoPrice.count} шт.)</div>
          <div style={{ display:'flex', gap:16, marginBottom:8 }}>
            {autoPrice.avgPrice!==null && <div><div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Среднее / занятие</div><div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:T.greenDark}}>{fmt(autoPrice.avgPrice)}</div></div>}
            {autoPrice.singlePrice!==null && <div><div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Разовое</div><div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:'#c47a00'}}>{fmt(autoPrice.singlePrice)}</div></div>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {autoPrice.avgPrice!==null && <button type="button" className="btn btn-sm" style={{background:T.green,color:'white',fontSize:11}} onClick={()=>set('cost_abo',autoPrice.avgPrice)}>Применить среднее →</button>}
            {autoPrice.singlePrice!==null && <button type="button" className="btn btn-sm btn-outline" style={{fontSize:11}} onClick={()=>set('cost_single',autoPrice.singlePrice)}>Применить разовое →</button>}
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-group"><label className="form-label">Стоимость с абонементом, ₽</label>
          <input className="form-input" type="number" value={f.cost_abo} onChange={e=>set('cost_abo',e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Разовое занятие, ₽</label>
          <input className="form-input" type="number" value={f.cost_single} onChange={e=>set('cost_single',e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

export default function DirectionsPage({ directions, clients, teachers, subscriptions=[], reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [directionGroups, setDirectionGroups] = useState([])

  const loadGroups = async () => {
    const { data, error } = await supabase
      .from('direction_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      console.warn('direction_groups not available:', error.message)
      setDirectionGroups([])
      return
    }
    setDirectionGroups(data || [])
  }

  useEffect(() => { loadGroups() }, [])

  const save = async ({ direction: dirData, groups: groupList }) => {
    let directionId = showEdit?.id

    if (showEdit) {
      const { error } = await supabase.from('directions').update(dirData).eq('id', showEdit.id)
      if (error) { alert('Ошибка сохранения направления: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('directions').insert(dirData).select().single()
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

  return (
    <div>
      {isAdmin && <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Новое направление</button></div>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
        {directions.map(d => {
          const cnt = clients.filter(c=>(c.direction_ids||[]).includes(d.id)&&c.status==='Активен').length
          const color = d.color||DIRECTION_COLORS[0]
          const auto = calcAutoPrice(d.id, subscriptions)
          const cap = d.max_capacity||0
          const isFull = cap>0 && cnt>=cap
          const isNear = cap>0 && cnt>=cap*0.8
          const subgroups = groupsByDirection[d.id] || []
          const showLegacy = subgroups.length === 0

          return (
            <div key={d.id} className="card card-pad" style={{ borderTop:`4px solid ${color}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{d.name}</div>
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

              <div style={{ fontSize:12, color:T.muted, marginBottom:8 }}>⏱ {d.duration||'1 час'}</div>

              {!showLegacy && (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                  {subgroups.map(sg => {
                    const slots = parseSlots(sg.schedule || '')
                    const teacher = sg.teacher_id ? teachers.find(t => t.id === sg.teacher_id) : null
                    return (
                      <div key={sg.id} style={{ background: color+'10', borderLeft:`3px solid ${color}`, borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontWeight:800, fontSize:13, color:T.ink, marginBottom:3 }}>📍 {sg.name}</div>
                        <div style={{ fontSize:12, color:T.muted, marginBottom:4 }}>👩‍🏫 {teacher?.name || '— педагог не назначен —'}</div>
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
                  <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>👩‍🏫 {d.teacher_name||'—'}</div>
                </>
              )}

              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, background:T.greenBg, borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:T.greenDark, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>С абонементом</div>
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:18, color:T.greenDark }}>{auto.avgPrice?fmt(auto.avgPrice):(d.cost_abo?fmt(d.cost_abo):'—')}</div>
                  {auto.avgPrice&&<div style={{fontSize:9,color:T.muted}}>среднее из абонементов</div>}
                </div>
                <div style={{ flex:1, background:'#fff4e6', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#c47a00', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Разовое</div>
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:18, color:'#c47a00' }}>{auto.singlePrice?fmt(auto.singlePrice):(d.cost_single?fmt(d.cost_single):'—')}</div>
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
              {subscriptions.filter(s=>s.is_active&&((s.direction_ids||[]).length===0||(s.direction_ids||[]).includes(showDetail.id))).map(s=>(
                <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:`1px solid ${T.border}`}}>
                  <div><div style={{fontWeight:700,fontSize:14}}>{s.name}</div><div style={{fontSize:12,color:T.muted}}>{s.lessons_count} зан. · {s.period}{s.notes?` · ${s.notes}`:''}</div></div>
                  <div style={{textAlign:'right'}}><div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:T.greenDark}}>{fmt(s.price)}</div>{s.lessons_count>1&&<div style={{fontSize:11,color:T.muted}}>{fmt(Math.round(s.price/s.lessons_count))}/зан.</div>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAdd && <DirectionModal directionGroups={directionGroups} teachers={teachers} subscriptions={subscriptions} onClose={()=>setShowAdd(false)} onSave={save} />}
      {showEdit && <DirectionModal direction={showEdit} directionGroups={directionGroups} teachers={teachers} subscriptions={subscriptions} onClose={()=>setShowEdit(null)} onSave={save} />}
    </div>
  )
}
