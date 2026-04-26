import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS_LONG = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']
const DAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
const DAYS_CAL = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const DEFAULT_COLOR = '#7BAF8E'
const WORK_START = 7  // 07:00
const WORK_END = 21   // 21:00
const SLOT_HEIGHT = 60 // px per hour

const parseTime = (timeStr) => {
  const m = (timeStr || '').match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

const parseDuration = (dur) => {
  if (!dur) return 60
  if (dur.includes('30')) return 30
  if (dur.includes('45')) return 45
  if (dur.includes('1.5') || dur.includes('1,5')) return 90
  if (dur.includes('2')) return 120
  if (dur.includes('Полд')) return 240
  if (dur.includes('Весь')) return 480
  return 60
}

const DOW_TO_KEY = { 0:'Вс', 1:'Пн', 2:'Вт', 3:'Ср', 4:'Чт', 5:'Пт', 6:'Сб' }

// Parse new format "Пн/Ср 17:30, Сб 13:00" or old format "Пн/Ср/Пт 10:00"
// Returns array of {day, time} slots
const parseScheduleSlots = (schedule) => {
  if (!schedule) return []
  const slots = []
  const parts = schedule.split(',').map(s => s.trim())
  for (const part of parts) {
    const m = part.match(/^([А-Яа-я/]+)\s+(\d{1,2}:\d{2})/)
    if (m) {
      const days = m[1].split('/')
      const time = m[2]
      days.forEach(d => slots.push({ day: d.trim(), time }))
    }
  }
  return slots
}

// Get time for specific day of week from schedule
const getTimeForDow = (dow, schedule) => {
  const dayKey = DOW_TO_KEY[dow]
  const slots = parseScheduleSlots(schedule)
  const slot = slots.find(s => s.day === dayKey)
  return slot ? slot.time : null
}

const fmt2 = n => String(n).padStart(2,'0')
const dateStr = (d) => `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r }
const startOfWeek = (d) => { const r = new Date(d); const dow = (r.getDay()+6)%7; r.setDate(r.getDate()-dow); return r }

// Get events for a specific date
const getEventsForDate = (date, directions, clients, filterDir, filterTeacher, filterChild, teachers) => {
  const dow = date.getDay()
  const dayKey = DOW_TO_KEY[dow]
  const events = []
  directions.forEach(d => {
    // Check if this direction has a slot for this day
    const timeForDay = getTimeForDow(dow, d.schedule)
    if (!timeForDay) return
    if (filterDir !== 'all' && String(d.id) !== filterDir) return
    if (filterTeacher !== 'all') {
      const t = teachers.find(t => String(t.id) === filterTeacher)
      if (t && !(t.direction_ids||[]).includes(d.id)) return
    }
    if (filterChild !== 'all') {
      const child = clients.find(c => String(c.id) === filterChild)
      if (!child || !(child.direction_ids||[]).includes(d.id)) return
    }
    const timeMin = parseTime(timeForDay)
    if (timeMin === null) return
    let students = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен')
    if (filterChild !== 'all') students = students.filter(c => String(c.id) === filterChild)
    events.push({
      name: d.name, timeMin, time: timeForDay,
      teacher: d.teacher_name, dirId: d.id, students,
      color: d.color || DEFAULT_COLOR, duration: d.duration || '1 час',
      durationMin: parseDuration(d.duration),
    })
  })
  events.sort((a,b) => a.timeMin - b.timeMin)
  return events
}

// Attendance modal
function DayModal({ date, events, onClose, isAdmin, myTeacherName, onAttendanceChange }) {
  const [attendance, setAttendance] = useState({})
  const today = new Date(); today.setHours(0,0,0,0)
  const isPast = date <= today
  const ds = dateStr(date)

  useEffect(() => {
    supabase.from('attendance').select('*').eq('date', ds).then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[`${r.client_id}_${r.direction_id}`] = r.present })
        setAttendance(map)
      }
    })
  }, [ds])

  const toggle = async (clientId, dirId, teacherName) => {
    if (!isPast) return
    const canMark = isAdmin || (myTeacherName && teacherName === myTeacherName)
    if (!canMark) return
    const key = `${clientId}_${dirId}`
    const newVal = !attendance[key]
    setAttendance(p => ({ ...p, [key]: newVal }))
    await supabase.from('attendance').upsert(
      { date: ds, client_id: clientId, direction_id: dirId, present: newVal },
      { onConflict: 'date,client_id,direction_id' }
    )
    const { data: allAtt } = await supabase.from('attendance').select('*').eq('client_id', clientId).eq('present', true)
    if (allAtt) {
      await supabase.from('clients').update({ visited_lessons: allAtt.length }).eq('id', clientId)
      onAttendanceChange && onAttendanceChange()
    }
  }

  return (
    <Modal title={`📅 ${date.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' })}`} onClose={onClose} large
      footer={<button className="btn btn-ghost" onClick={onClose}>Закрыть</button>}>
      {!isPast && <div style={{ background:'#fff4e6', color:'#c47a00', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, fontWeight:600 }}>⏳ Отмечать можно только прошедшие даты и сегодня</div>}
      {events.length === 0 && <div className="empty"><div className="empty-icon">🗓️</div><div className="empty-text">Занятий нет</div></div>}
      {events.map((ev, i) => {
        const canMark = isPast && (isAdmin || (myTeacherName && ev.teacher === myTeacherName))
        const presentCount = ev.students.filter(s => attendance[`${s.id}_${ev.dirId}`]).length
        return (
          <div key={i} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'10px 14px', background:ev.color+'22', borderRadius:12, borderLeft:`4px solid ${ev.color}` }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{ev.name}</div>
                <div style={{ fontSize:12, color:T.muted }}>🕐 {ev.time} · ⏱ {ev.duration} · 👩‍🏫 {ev.teacher}</div>
              </div>
              <span className="badge badge-green">{presentCount}/{ev.students.length}</span>
            </div>
            {ev.students.length === 0 && <div style={{ fontSize:13, color:T.muted, padding:'8px 14px' }}>Нет учеников</div>}
            {ev.students.map(s => {
              const key = `${s.id}_${ev.dirId}`
              const present = attendance[key]
              return (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:`1px solid ${T.border}` }}>
                  <div className="avatar" style={{ background:hashColor(s.child_name), width:30, height:30, fontSize:12 }}>{(s.child_name||'?')[0]}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{s.child_name}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{s.adult_name}</div>
                  </div>
                  <button onClick={() => toggle(s.id, ev.dirId, ev.teacher)} style={{
                    padding:'5px 14px', borderRadius:10, border:'none',
                    cursor: canMark ? 'pointer' : 'not-allowed',
                    fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:12,
                    background: present ? T.greenBg : isPast ? T.redLight : '#f5f5f0',
                    color: present ? T.greenDark : isPast ? T.red : T.muted,
                    opacity: canMark ? 1 : 0.55,
                  }}>{present ? '✅ Пришёл' : '❌ Отсутствует'}</button>
                </div>
              )
            })}
          </div>
        )
      })}
    </Modal>
  )
}

// Time grid for week/day view
function TimeGrid({ dates, directions, clients, teachers, filterDir, filterTeacher, filterChild, isAdmin, myTeacherName, onDayClick }) {
  const hours = []
  for (let h = WORK_START; h <= WORK_END; h++) hours.push(h)

  const now = new Date()

  // Get events with overlap detection for a date
  const getEventsWithLayout = (date) => {
    const events = getEventsForDate(date, directions, clients, filterDir, filterTeacher, filterChild, teachers)
    // Detect overlaps
    const laid = events.map(e => ({ ...e, col: 0, cols: 1 }))
    for (let i = 0; i < laid.length; i++) {
      for (let j = i+1; j < laid.length; j++) {
        const a = laid[i], b = laid[j]
        const aEnd = a.timeMin + a.durationMin
        const bEnd = b.timeMin + b.durationMin
        if (a.timeMin < bEnd && aEnd > b.timeMin) {
          // overlap
          b.col = a.col + 1
          a.cols = Math.max(a.cols, b.col + 1)
          b.cols = Math.max(b.cols, b.col + 1)
        }
      }
    }
    return laid
  }

  const colCount = dates.length
  const isToday = (d) => dateStr(d) === dateStr(now)
  const isPast = (d) => { const t = new Date(d); t.setHours(23,59,59); return t < now }

  return (
    <div style={{ display:'flex', overflow:'auto', maxHeight:'70vh', border:`1px solid ${T.border}`, borderRadius:16, background:'white' }}>
      {/* Time column */}
      <div style={{ width:52, flexShrink:0, borderRight:`1px solid ${T.border}`, paddingTop:40 }}>
        {hours.map(h => (
          <div key={h} style={{ height:SLOT_HEIGHT, borderTop:`1px solid ${T.border}`, paddingLeft:6, paddingTop:2, fontSize:11, color:T.muted, fontWeight:600 }}>
            {fmt2(h)}:00
          </div>
        ))}
      </div>

      {/* Day columns */}
      {dates.map((date, di) => {
        const events = getEventsWithLayout(date)
        const today = isToday(date)
        const past = isPast(date)

        // Current time line
        const nowMin = now.getHours()*60 + now.getMinutes()
        const showNowLine = today && nowMin >= WORK_START*60 && nowMin <= WORK_END*60

        return (
          <div key={di} style={{ flex:1, borderLeft: di > 0 ? `1px solid ${T.border}` : 'none', position:'relative', minWidth: colCount > 1 ? 120 : 200 }}>
            {/* Day header */}
            <div onClick={() => onDayClick(date)} style={{
              height:40, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              borderBottom:`1px solid ${T.border}`, cursor:'pointer',
              background: today ? T.greenBg : past ? '#fafaf5' : 'white',
              position:'sticky', top:0, zIndex:2,
            }}>
              <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>{DAYS_SHORT[(date.getDay()+6)%7+1 > 6 ? 0 : (date.getDay()+6)%7]}</div>
              <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14, color: today ? T.greenDark : T.ink }}>{date.getDate()}</div>
            </div>

            {/* Hour slots */}
            {hours.map(h => (
              <div key={h} style={{ height:SLOT_HEIGHT, borderTop:`1px solid ${T.border}`, position:'relative' }}>
                {/* Half-hour line */}
                <div style={{ position:'absolute', top:'50%', left:0, right:0, borderTop:`1px dashed ${T.border}44` }} />
              </div>
            ))}

            {/* Current time line */}
            {showNowLine && (
              <div style={{
                position:'absolute', left:0, right:0, top: 40 + (nowMin - WORK_START*60) / 60 * SLOT_HEIGHT,
                height:2, background:T.red, zIndex:5,
              }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:T.red, position:'absolute', left:-4, top:-3 }} />
              </div>
            )}

            {/* Events */}
            {events.map((ev, ei) => {
              const top = 40 + (ev.timeMin - WORK_START*60) / 60 * SLOT_HEIGHT
              const height = Math.max(ev.durationMin / 60 * SLOT_HEIGHT - 2, 20)
              const width = ev.cols > 1 ? `calc(${100/ev.cols}% - 4px)` : 'calc(100% - 8px)'
              const left = ev.cols > 1 ? `calc(${ev.col * 100/ev.cols}% + 2px)` : '4px'
              const isOverlap = ev.cols > 1

              return (
                <div key={ei} onClick={() => onDayClick(date)} style={{
                  position:'absolute', top, left, width, height,
                  background: ev.color + '33',
                  borderLeft:`3px solid ${ev.color}`,
                  borderRadius:'0 8px 8px 0',
                  padding:'3px 6px', cursor:'pointer', zIndex:3,
                  border: `1px solid ${ev.color}44`,
                  boxShadow: 'none',
                  overflow:'hidden',
                }}>

                  <div style={{ fontSize:11, fontWeight:800, color:ev.color, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</div>
                  {height > 30 && <div style={{ fontSize:10, color:ev.color+'cc' }}>{ev.time} · {ev.students.length} чел.</div>}
                  {height > 45 && <div style={{ fontSize:10, color:ev.color+'99', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>👩‍🏫 {ev.teacher}</div>}
                </div>
              )
            })}

            {/* Free slots indicator */}
            {events.length === 0 && !past && (
              <div style={{ position:'absolute', top:50, left:4, right:4, textAlign:'center', fontSize:11, color:T.muted, pointerEvents:'none' }}>
                Свободно
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Month view
function MonthView({ year, month, directions, clients, teachers, filterDir, filterTeacher, filterChild, onDayClick }) {
  const now = new Date()
  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = Array(offset).fill(null).concat(Array.from({ length:daysInMonth }, (_,i) => i+1))

  return (
    <div className="cal-outer">
      <div className="cal-header-row">{DAYS_CAL.map(d => <div key={d} className="cal-dayname">{d}</div>)}</div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cal-day empty" />
          const date = new Date(year, month, day)
          const events = getEventsForDate(date, directions, clients, filterDir, filterTeacher, filterChild, teachers)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          const dayDate = new Date(year, month, day); dayDate.setHours(0,0,0,0)
          const today0 = new Date(); today0.setHours(0,0,0,0)
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => onDayClick(date)}>
              <div className="cal-daynum" style={{ color: dayDate > today0 ? T.muted : T.ink }}>{day}</div>
              {events.map((e, j) => (
                <div key={j} className="cal-event"
                  style={{ background:e.color+'33', color:e.color, borderLeft:'3px solid '+e.color, borderRadius:'0 4px 4px 0', paddingLeft:3 }}
                  title={e.name+' · '+e.students.length+' чел.'}>
                  {e.time} {e.name.split(' ')[0]}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPage({ directions, clients, teachers, staff, role, reload }) {
  const now = new Date()
  const [view, setView] = useState('month') // month | week | day
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [selectedDay, setSelectedDay] = useState(null)

  const [filterTeacher, setFilterTeacher] = useState('all')
  const [filterDir, setFilterDir] = useState('all')
  const [filterChild, setFilterChild] = useState('all')

  const isAdmin = role === 'Директор' || role === 'Администратор'
  const myTeacher = teachers.find(t => t.name === staff?.name) || null
  const myTeacherName = myTeacher?.name || null
  const effectiveTeacher = !isAdmin && myTeacher ? String(myTeacher.id) : filterTeacher

  // Navigation
  const navigate = (dir) => {
    if (view === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1))
    else if (view === 'week') setCurrentDate(d => addDays(d, dir * 7))
    else setCurrentDate(d => addDays(d, dir))
  }

  const goToday = () => setCurrentDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))

  // Title
  const getTitle = () => {
    if (view === 'month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if (view === 'week') {
      const ws = startOfWeek(currentDate)
      const we = addDays(ws, 6)
      return `${ws.getDate()} ${MONTHS[ws.getMonth()].slice(0,3)} — ${we.getDate()} ${MONTHS[we.getMonth()].slice(0,3)} ${we.getFullYear()}`
    }
    return currentDate.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  }

  // Week dates
  const weekDates = view === 'week' ? Array.from({ length:7 }, (_,i) => addDays(startOfWeek(currentDate), i)) : [currentDate]

  const activeClients = clients.filter(c => {
    if (c.status !== 'Активен') return false
    if (filterDir !== 'all') return (c.direction_ids||[]).includes(+filterDir)
    return true
  })

  const handleDayClick = (date) => {
    if (view === 'month') {
      setCurrentDate(date)
      setView('day')
    } else {
      setSelectedDay(date)
    }
  }

  const selectStyle = { padding:'6px 12px', borderRadius:10, border:`1.5px solid ${T.border}`, fontFamily:'Nunito Sans,sans-serif', fontSize:13, background:T.cream, outline:'none', cursor:'pointer' }

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {/* View switcher */}
        <div className="tabs" style={{ marginBottom:0 }}>
          {[['month','Месяц'],['week','Неделя'],['day','День']].map(([v,l]) => (
            <button key={v} className={`tab ${view===v?'active':''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>

        <div style={{ width:1, height:28, background:T.border, margin:'0 4px' }} />

        {/* Navigation */}
        <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>←</button>
        <span style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15, minWidth:220, textAlign:'center' }}>{getTitle()}</span>
        <button className="btn btn-outline btn-sm" onClick={() => navigate(1)}>→</button>
        <button className="btn btn-ghost btn-sm" onClick={goToday}>Сегодня</button>

        <div style={{ width:1, height:28, background:T.border, margin:'0 4px' }} />

        {/* Filters */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:12, color:T.muted, fontWeight:600 }}>Направление:</span>
          <select style={selectStyle} value={filterDir} onChange={e => { setFilterDir(e.target.value); setFilterChild('all') }}>
            <option value="all">Все</option>
            {directions.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
        </div>

        {isAdmin && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, color:T.muted, fontWeight:600 }}>Педагог:</span>
            <select style={selectStyle} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
              <option value="all">Все</option>
              {teachers.map(t => <option key={t.id} value={String(t.id)}>{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0]}.</option>)}
            </select>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:12, color:T.muted, fontWeight:600 }}>Ребёнок:</span>
          <select style={selectStyle} value={filterChild} onChange={e => setFilterChild(e.target.value)}>
            <option value="all">Все</option>
            {activeClients.map(c => <option key={c.id} value={String(c.id)}>{c.child_name}</option>)}
          </select>
        </div>

        {(filterDir !== 'all' || filterTeacher !== 'all' || filterChild !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDir('all'); setFilterTeacher('all'); setFilterChild('all') }}>✕ Сбросить</button>
        )}
      </div>

      {/* Legend for week/day */}
      {view !== 'month' && (
        <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:12, color:T.muted, fontWeight:600 }}>Легенда:</span>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}><span style={{ width:12, height:12, background:T.greenBg, borderRadius:3, border:`2px solid ${T.green}`, display:'inline-block' }} /> Занятие</span>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}><span style={{ width:12, height:12, background:'#fde8e844', borderRadius:3, border:`2px solid ${T.red}66`, display:'inline-block' }} /> ⚠️ Наложение</span>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}><span style={{ width:12, height:2, background:T.red, display:'inline-block' }} /> Текущее время</span>
          <span style={{ fontSize:12, color:T.muted }}>· Нажми на занятие чтобы отметить посещаемость</span>
        </div>
      )}

      {/* Views */}
      {view === 'month' && (
        <MonthView
          year={currentDate.getFullYear()} month={currentDate.getMonth()}
          directions={directions} clients={clients} teachers={teachers}
          filterDir={filterDir} filterTeacher={effectiveTeacher} filterChild={filterChild}
          onDayClick={handleDayClick}
        />
      )}

      {(view === 'week' || view === 'day') && (
        <TimeGrid
          dates={view === 'week' ? weekDates : [currentDate]}
          directions={directions} clients={clients} teachers={teachers}
          filterDir={filterDir} filterTeacher={effectiveTeacher} filterChild={filterChild}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onDayClick={handleDayClick}
        />
      )}

      {/* Direction chips */}
      <div className="card card-pad" style={{ marginTop:16 }}>
        <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14, marginBottom:10 }}>🎯 Фильтр по направлениям</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {directions.map(d => {
            const active = filterDir === String(d.id)
            const color = d.color || DEFAULT_COLOR
            const cnt = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен').length
            return (
              <div key={d.id} onClick={() => setFilterDir(active ? 'all' : String(d.id))}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:12, cursor:'pointer', transition:'all 0.15s', background: active ? color+'22' : T.cream, border:`2px solid ${active ? color : T.border}` }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:color, flexShrink:0 }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color: active ? color : T.ink }}>{d.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{d.schedule} · {cnt} чел.</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Attendance modal */}
      {selectedDay && (
        <DayModal
          date={selectedDay}
          events={getEventsForDate(selectedDay, directions, clients, filterDir, effectiveTeacher, filterChild, teachers)}
          onClose={() => setSelectedDay(null)}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onAttendanceChange={reload}
        />
      )}
    </div>
  )
}
