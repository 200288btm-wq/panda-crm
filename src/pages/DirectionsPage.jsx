import { useState, useMemo } from 'react'
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

function ScheduleBuilder({ slots, onChange }) {
  const activeDays = [...new Set(slots.map(s => s.day))]
  const toggleDay = (key) => {
    const ds = slots.filter(s => s.day === key)
    if (ds.length) onChange(slots.filter(s => s.day !== key))
    else onChange([...slots, { day: key, time: '10:00', id: Date.now() }])
  }
  const addSlot = (key) => onChange([...slots, { day: key, time: '10:00', id: Date.now()+Math.random() }])
  const updateTime = (id, time) => onChange(slots.map(s => s.id === id ? {...s,time} : s))
  const removeSlot = (id) => onChange(slots.filter(s => s.id !== id))

  return (
    <div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
        {WEEK_DAYS.map(d => {
          const active = activeDays.includes(d.key)
          return <div key={d.key} onClick={() => toggleDay(d.key)} style={{ width:42, height:42, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14, transition:'all 0.15s', background: active?T.green:T.cream, color: active?'white':T.muted, border:`2px solid ${active?T.green:T.border}` }}>{d.key}</div>
        })}
      </div>
      {slots.length > 0 && (
        <div style={{ background:T.cream, borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Время занятий</div>
          {WEEK_DAYS.filter(d => activeDays.includes(d.key)).map(d => {
            const daySlots = slots.filter(s => s.day === d.key)
            return (
              <div key={d.key} style={{ marginBottom:10 }}>
                {daySlots.map((slot, idx) => (
                  <div key={slot.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background: idx===0?T.green:T.greenLight, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:13, flexShrink:0 }}>{d.key}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.muted, minWidth:90 }}>{idx===0 ? d.full : `+ занятие ${idx+1}`}</div>
                    <input type="time" value={slot.time} onChange={e => updateTime(slot.id, e.target.value)} style={{ padding:'7px 10px', borderRadius:10, border:`1.5px solid ${T.border}`, fontFamily:'Nunito Sans,sans-serif', fontSize:14, background:'white', outline:'none', color:T.ink, width:110 }} />
                    <span style={{ fontSize:12, color:T.muted }}>начало</span>
                    {idx === daySlots.length-1 && <button onClick={() => addSlot(d.key)} style={{ width:28, height:28, borderRadius:8, background:T.greenBg, border:`1.5px solid ${T.green}`, color:T.greenDark, cursor:'pointer', fontWeight:800, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>+</button>}
                    <button onClick={() => removeSlot(slot.id)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.muted, fontSize:16, padding:'4px', flexShrink:0 }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {!slots.length && <div style={{ fontSize:13, color:T.muted }}>Выберите дни недели выше</div>}
      {slots.length > 0 && <div style={{ marginTop:8, fontSize:12, color:T.greenDark, fontWeight:600 }}>📅 {slotsToStr(slots)}</div>}
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

function DirectionModal({ direction, teachers, subscriptions, onClose, onSave }) {
  const initSlots = direction?.schedule ? parseSlots(direction.schedule) : []
  const [f, setF] = useState(direction ? {
    name: direction.name||'', teacher_name: direction.teacher_name||'', launched: direction.launched||'',
    cost_abo: direction.cost_abo||0, cost_single: direction.cost_single||0,
    groups: (direction.groups||['Группа 1']).join(', '), duration: direction.duration||'1 час',
    color: direction.color||DIRECTION_COLORS[0], max_capacity: direction.max_capacity||0,
  } : { name:'', teacher_name:'', launched:'', cost_abo:0, cost_single:0, groups:'Группа 1', duration:'1 час', color:DIRECTION_COLORS[0], max_capacity:0 })
  const [slots, setSlots] = useState(initSlots.map(s => ({...s, id:Math.random()})))
  const set = (k,v) => setF(p => ({...p, [k]:v}))

  const autoPrice = useMemo(() => {
    if (!direction?.id) return null
    return calcAutoPrice(direction.id, subscriptions||[])
  }, [direction?.id, subscriptions])

  const save = () => onSave({...f, schedule:slotsToStr(slots), cost_abo:+f.cost_abo, cost_single:+f.cost_single, max_capacity:+f.max_capacity, groups:f.groups.split(',').map(g=>g.trim()).filter(Boolean)})

  return (
    <Modal title={direction?`✏️ ${direction.name}`:'+ Новое направление'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Название *</label>
        <input className="form-input" value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Смышлёная Панда" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Педагог</label>
          <select className="form-input" value={f.teacher_name} onChange={e=>set('teacher_name',e.target.value)}>
            <option value="">— выбрать —</option>{teachers.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Дата запуска</label>
          <input className="form-input" type="date" value={f.launched} onChange={e=>set('launched',e.target.value)} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Расписание занятий</label>
        <ScheduleBuilder slots={slots} onChange={setSlots} />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Длительность занятия</label>
          <select className="form-input" value={f.duration} onChange={e=>set('duration',e.target.value)}>
            {DURATIONS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Макс. учеников в группе</label>
          <input className="form-input" type="number" min="0" value={f.max_capacity} onChange={e=>set('max_capacity',e.target.value)} placeholder="0 = без ограничений" />
          {+f.max_capacity > 0 && <div style={{fontSize:11,color:T.muted,marginTop:3}}>При заполнении {'>'} 80% — предупреждение</div>}
        </div>
      </div>

      {autoPrice && autoPrice.count > 0 && (
        <div style={{ background:T.greenBg, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.greenDark, marginBottom:8 }}>🧮 Из абонементов ({autoPrice.count} шт.)</div>
          <div style={{ display:'flex', gap:16, marginBottom:8 }}>
            {autoPrice.avgPrice!==null && <div><div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Среднее / занятие</div><div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:T.greenDark}}>{fmt(autoPrice.avgPrice)}</div></div>}
            {autoPrice.singlePrice!==null && <div><div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:'uppercase'}}>Разовое</div><div style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:18,color:'#c47a00'}}>{fmt(autoPrice.singlePrice)}</div></div>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {autoPrice.avgPrice!==null && <button className="btn btn-sm" style={{background:T.green,color:'white',fontSize:11}} onClick={()=>set('cost_abo',autoPrice.avgPrice)}>Применить среднее →</button>}
            {autoPrice.singlePrice!==null && <button className="btn btn-sm btn-outline" style={{fontSize:11}} onClick={()=>set('cost_single',autoPrice.singlePrice)}>Применить разовое →</button>}
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
      <div className="form-group"><label className="form-label">Группы (через запятую)</label>
        <input className="form-input" value={f.groups} onChange={e=>set('groups',e.target.value)} placeholder="Группа 1, Группа 2" />
      </div>
      <div className="form-group"><label className="form-label">Цвет направления</label>
        <ColorPicker value={f.color} onChange={v=>set('color',v)} />
      </div>
    </Modal>
  )
}

export default function DirectionsPage({ directions, clients, teachers, subscriptions=[], reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showDetail, setShowDetail] = useState(null)

  const save = async (f) => {
    if (showEdit) { await supabase.from('directions').update(f).eq('id', showEdit.id); setShowEdit(null) }
    else { await supabase.from('directions').insert(f); setShowAdd(false) }
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить направление «${name}»?`)) return
    await supabase.from('directions').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      {isAdmin && <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Новое направление</button></div>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
        {directions.map(d => {
          const cnt = clients.filter(c=>(c.direction_ids||[]).includes(d.id)&&c.status==='Активен').length
          const color = d.color||DIRECTION_COLORS[0]
          const slots = parseSlots(d.schedule||'')
          const auto = calcAutoPrice(d.id, subscriptions)
          const cap = d.max_capacity||0
          const isFull = cap>0 && cnt>=cap
          const isNear = cap>0 && cnt>=cap*0.8

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
              <div style={{ marginBottom:10 }}>
                {slots.length>0 ? (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {slots.map((s,i)=><span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:8, fontSize:12, fontWeight:700, background:color+'22', color }}>{s.day} {s.time}</span>)}
                  </div>
                ) : <div style={{ fontSize:13, color:T.muted }}>🕐 {d.schedule||'—'}</div>}
                <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>⏱ {d.duration||'1 час'}</div>
              </div>
              <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>👩‍🏫 {d.teacher_name||'—'}</div>
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
              <div style={{ marginTop:10, display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                {(d.groups||[]).map(g=><span key={g} className="badge badge-gray">{g}</span>)}
                {auto.count>0 && <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto',fontSize:11}} onClick={()=>setShowDetail(d)}>Подробнее →</button>}
              </div>
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

      {showAdd && <DirectionModal teachers={teachers} subscriptions={subscriptions} onClose={()=>setShowAdd(false)} onSave={save} />}
      {showEdit && <DirectionModal direction={showEdit} teachers={teachers} subscriptions={subscriptions} onClose={()=>setShowEdit(null)} onSave={save} />}
    </div>
  )
}
