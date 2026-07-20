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
const getEventsForDate = (date, directions, clients, filterDir, filterTeacher, filterChild, teachers, filterAddress = 'all', colorMode = 'direction', addresses = [], filterGroups = [], enrollments = []) => {
  const dow = date.getDay()
  const ds = dateStr(date)
  const events = []
  directions.forEach(d => {
    const timeForDay = getTimeForDow(dow, d.schedule)
    if (!timeForDay) return
    if (Array.isArray(filterDir)) {
      if (filterDir.length > 0 && !filterDir.includes(String(d.id))) return
    } else {
      if (filterDir !== 'all' && String(d.id) !== filterDir) return
    }
    if (filterTeacher !== 'all') {
      const t = teachers.find(t => String(t.id) === filterTeacher)
      if (t && !(t.direction_ids||[]).includes(d.id)) return
    }
    if (filterChild !== 'all') {
      const child = clients.find(c => String(c.id) === filterChild)
      if (!child || !(child.direction_ids||[]).includes(d.id)) return
    }
    // Фильтр по адресу
    if (filterAddress !== 'all') {
      const groups = (d.groups || [])
      const hasAddr = groups.some(g => String(g.address_id) === filterAddress)
      if (!hasAddr) return
    }
    // Фильтр по подгруппам
    const dirGroups = (d.groups || [])
    const relevantFilterGroups = filterGroups.filter(gid => dirGroups.some(g => String(g.id) === gid))
    if (relevantFilterGroups.length > 0) {
      const hasGroup = relevantFilterGroups.some(gid => dirGroups.some(g => String(g.id) === gid))
      if (!hasGroup) return
    }

    const timeMin = parseTime(timeForDay)
    if (timeMin === null) return

    let students
    if (d.enrollment_type === 'calendar') {
      // Только те кто записался на конкретную дату
      const dayEnrollments = enrollments.filter(e => e.direction_id === d.id && e.date === ds && e.status !== 'cancelled')
      const enrolledIds = dayEnrollments.map(e => e.client_id)
      students = clients.filter(c => enrolledIds.includes(c.id))
      if (filterChild !== 'all') students = students.filter(c => String(c.id) === filterChild)
    } else {
      students = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен')
      // Если выбраны подгруппы — фильтруем учеников по подгруппе
      if (relevantFilterGroups.length > 0) {
        students = students.filter(c => {
          const clientGroups = (c.group_ids || [])
          return relevantFilterGroups.some(gid => clientGroups.map(String).includes(gid))
        })
      }
      if (filterChild !== 'all') students = students.filter(c => String(c.id) === filterChild)
    }

    // Цвет: по направлению или по адресу
    let eventColor = d.color || DEFAULT_COLOR
    if (colorMode === 'address') {
      const group = filterAddress !== 'all'
        ? dirGroups.find(g => String(g.address_id) === filterAddress)
        : dirGroups.find(g => g.address_id)
      if (group?.address_id) {
        const addr = addresses.find(a => String(a.id) === String(group.address_id))
        if (addr?.color) eventColor = addr.color
      }
    }

    events.push({
      name: d.name, timeMin, time: timeForDay,
      teacher: d.teacher_name, dirId: d.id, students,
      color: eventColor, duration: d.duration || '1 час',
      durationMin: parseDuration(d.duration),
      enrollmentType: d.enrollment_type || 'group',
      maxPerSlot: d.max_per_slot || 0,
    })
  })
  events.sort((a,b) => a.timeMin - b.timeMin)
  return events
}

// Attendance modal
function DayModal({ date, events: initialEvents, teachers = [], onClose, isAdmin, myTeacherName, onAttendanceChange, clients = [], studioId }) {
  const [attendance, setAttendance] = useState({})
  const [enrolling, setEnrolling] = useState(null)
  const [enrollSearch, setEnrollSearch] = useState('')
  const [enrolling2, setEnrolling2] = useState(false)
  const [localEnrollments, setLocalEnrollments] = useState([])

  const today = new Date(); today.setHours(0,0,0,0)
  const isPast = date <= today
  const ds = dateStr(date)

  useEffect(() => {
    // Загружаем enrollments для этого дня
    supabase.from('enrollments').select('*').eq('date', ds).eq('status', 'enrolled')
      .then(({ data }) => { if (data) setLocalEnrollments(data) })
  }, [ds])

  // Пересчитываем events с учётом localEnrollments
  const events = initialEvents.map(ev => {
    if (ev.enrollmentType !== 'calendar') return ev
    const enrolledIds = localEnrollments.filter(e => e.direction_id === ev.dirId).map(e => e.client_id)
    return { ...ev, students: clients.filter(c => enrolledIds.includes(c.id)) }
  })

  const reloadEnrollments = async () => {
    const { data } = await supabase.from('enrollments').select('*').eq('date', ds).eq('status', 'enrolled')
    if (data) setLocalEnrollments(data)
  }

  const enroll = async (clientId, dirId) => {
    setEnrolling2(true)
    const { data, error } = await supabase.from('enrollments').upsert({
      studio_id: studioId, direction_id: dirId, client_id: clientId,
      date: ds, status: 'enrolled'
    }, { onConflict: 'studio_id,direction_id,client_id,date' })
    console.log('enroll result:', { data, error, clientId, dirId, ds, studioId })
    setEnrolling(null); setEnrollSearch('')
    setEnrolling2(false)
    await reloadEnrollments()
  }

  const cancelEnroll = async (clientId, dirId) => {
    await supabase.from('enrollments')
      .update({ status: 'cancelled' })
      .eq('direction_id', dirId).eq('client_id', clientId).eq('date', ds)
    await reloadEnrollments()
  }

  useEffect(() => {
    supabase.from('attendance').select('*').eq('date', ds).then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[`${r.client_id}_${r.direction_id}`] = r.present })
        setAttendance(map)
      }
    })
  }, [ds])

  const toggle = async (clientId, dirId, ev) => {
    if (!isPast) return
    const canMark = isAdmin || (myTeacherName && ev.teacher === myTeacherName)
    if (!canMark) return
    const key = `${clientId}_${dirId}`
    const newVal = !attendance[key]
    setAttendance(p => ({ ...p, [key]: newVal }))
    // Snapshot: пытаемся подтянуть teacher_id по имени (для будущей истории)
    const teacherObj = teachers.find(t => t.name === ev.teacher)
    await supabase.from('attendance').upsert(
      {
        date: ds,
        client_id: clientId,
        direction_id: dirId,
        present: newVal,
        time: ev.time || null,
        teacher_id: teacherObj?.id || null,
      },
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
        const isCalendar = ev.enrollmentType === 'calendar'
        const maxSlot = ev.maxPerSlot || 0
        return (
          <div key={i} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'10px 14px', background:ev.color+'22', borderRadius:12, borderLeft:`4px solid ${ev.color}` }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{ev.name}</div>
                <div style={{ fontSize:12, color:T.muted }}>🕐 {ev.time} · ⏱ {ev.duration}{ev.teacher ? ` · 👩‍🏫 ${ev.teacher}` : ''}</div>
              </div>
              {isCalendar ? (
                <span className={`badge ${maxSlot > 0 && ev.students.length >= maxSlot ? 'badge-red' : ev.students.length > 0 ? 'badge-green' : 'badge-gray'}`}>
                  📅 {ev.students.length}{maxSlot > 0 ? `/${maxSlot}` : ''} зап.
                </span>
              ) : (
                <span className="badge badge-green">{presentCount}/{ev.students.length}</span>
              )}
            </div>
            {isCalendar && ev.students.length === 0 && (
              <div style={{ fontSize:13, color:T.muted, padding:'8px 14px' }}>Нет записавшихся на этот день</div>
            )}
            {!isCalendar && ev.students.length === 0 && <div style={{ fontSize:13, color:T.muted, padding:'8px 14px' }}>Нет учеников</div>}
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
                  {isCalendar ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggle(s.id, ev.dirId, ev)} style={{
                        padding:'5px 14px', borderRadius:10, border:'none',
                        cursor: 'pointer',
                        fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:12,
                        background: attendance[`${s.id}_${ev.dirId}`] ? T.greenBg : '#f5f5f0',
                        color: attendance[`${s.id}_${ev.dirId}`] ? T.greenDark : T.muted,
                      }}>{attendance[`${s.id}_${ev.dirId}`] ? '✅ Пришёл' : '❌ Отсутствует'}</button>
                      <button onClick={() => cancelEnroll(s.id, ev.dirId)} style={{ padding:'5px 10px', borderRadius:10, border:'none', cursor:'pointer', background:'#fde8e8', color:'#e05a5a', fontSize:12, fontWeight:700 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => toggle(s.id, ev.dirId, ev)} style={{
                      padding:'5px 14px', borderRadius:10, border:'none',
                      cursor: canMark ? 'pointer' : 'not-allowed',
                      fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:12,
                      background: present ? T.greenBg : isPast ? T.redLight : '#f5f5f0',
                      color: present ? T.greenDark : isPast ? T.red : T.muted,
                      opacity: canMark ? 1 : 0.55,
                    }}>{present ? '✅ Пришёл' : '❌ Отсутствует'}</button>
                  )}
                </div>
              )
            })}

            {/* Кнопка записи для calendar-направлений */}
            {isCalendar && isAdmin && (
              <div style={{ padding:'8px 14px' }}>
                {enrolling === ev.dirId ? (
                  <div>
                    <input className="form-input" autoFocus placeholder="Поиск клиента..."
                      value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)}
                      style={{ marginBottom: 8 }} />
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }}>
                      {clients
                        .filter(c => c.child_name?.toLowerCase().includes(enrollSearch.toLowerCase()) && !ev.students.find(s => s.id === c.id))
                        .slice(0, 10)
                        .map(c => (
                          <div key={c.id} onClick={() => enroll(c.id, ev.dirId)}
                            style={{ padding:'9px 14px', cursor:'pointer', fontSize:13, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}
                            onMouseEnter={e => e.currentTarget.style.background = T.cream}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <div className="avatar" style={{ background:hashColor(c.child_name), width:26, height:26, fontSize:11 }}>{(c.child_name||'?')[0]}</div>
                            <div>
                              <div style={{ fontWeight:600 }}>{c.child_name}</div>
                              <div style={{ fontSize:11, color:T.muted }}>{c.adult_name}</div>
                            </div>
                          </div>
                        ))}
                      {clients.filter(c => c.child_name?.toLowerCase().includes(enrollSearch.toLowerCase()) && !ev.students.find(s => s.id === c.id)).length === 0 && (
                        <div style={{ padding:'10px 14px', fontSize:13, color:T.muted }}>Клиенты не найдены</div>
                      )}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEnrolling(null); setEnrollSearch('') }} style={{ marginTop:8 }}>Отмена</button>
                  </div>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={() => setEnrolling(ev.dirId)}
                    disabled={maxSlot > 0 && ev.students.length >= maxSlot}>
                    {maxSlot > 0 && ev.students.length >= maxSlot ? '🔒 Мест нет' : '+ Записать клиента'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </Modal>
  )
}

// Time grid for week/day view
function TimeGrid({ dates, directions, clients, teachers, filterDir, filterTeacher, filterChild, isAdmin, myTeacherName, onDayClick, onlyWithStudents, filterAddress, colorMode, addresses, filterGroups, enrollments = [] }) {
  const hours = []
  for (let h = WORK_START; h <= WORK_END; h++) hours.push(h)

  const now = new Date()

  // Group events by time overlap — proper column assignment
  const getEventsWithLayout = (date) => {
    let events = getEventsForDate(date, directions, clients, filterDir, filterTeacher, filterChild, teachers, filterAddress, colorMode, addresses, filterGroups, enrollments)
    if (onlyWithStudents) events = events.filter(e => e.students.length > 0)
    if (!events.length) return []

    // Assign columns using greedy interval scheduling
    const laid = events.map(e => ({ ...e, col: 0, cols: 1 }))
    const colEnds = [] // tracks when each column is free

    laid.forEach(ev => {
      // Find first free column
      let col = 0
      while (col < colEnds.length && colEnds[col] > ev.timeMin) col++
      ev.col = col
      colEnds[col] = ev.timeMin + ev.durationMin
    })

    // Calculate max cols for each overlapping group
    const maxCol = laid.reduce((m, e) => Math.max(m, e.col), 0)
    // For each event, find how many columns its time range needs
    laid.forEach(ev => {
      const evEnd = ev.timeMin + ev.durationMin
      const colsNeeded = laid.filter(other =>
        other.timeMin < evEnd && (other.timeMin + other.durationMin) > ev.timeMin
      ).length
      ev.cols = colsNeeded > 1 ? colsNeeded : 1
    })

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

            {/* Events — side by side columns for overlaps */}
            {events.map((ev, ei) => {
              const top = 40 + (ev.timeMin - WORK_START*60) / 60 * SLOT_HEIGHT
              const height = Math.max(ev.durationMin / 60 * SLOT_HEIGHT - 2, 20)
              const cols = ev.cols || 1
              const col = ev.col || 0
              const colW = 100 / cols
              const left = `calc(${col * colW}% + 4px)`
              const width = `calc(${colW}% - 6px)`

              return (
                <div key={ei} onClick={() => onDayClick(date)} style={{
                  position:'absolute', top, left, width, height,
                  background: ev.color+'33', borderLeft:`3px solid ${ev.color}`,
                  borderRadius:'0 8px 8px 0', border:`1px solid ${ev.color}44`,
                  padding:'3px 5px', cursor:'pointer', zIndex:3, overflow:'hidden',
                  boxSizing:'border-box',
                }}>
                  <div style={{ fontSize:10, fontWeight:800, color:ev.color, lineHeight:1.3, whiteSpace:'normal', wordBreak:'break-word' }}>{ev.name}</div>
                  {height > 28 && <div style={{ fontSize:9, color:ev.color+'cc' }}>
                    {ev.time} · {ev.enrollmentType === 'calendar'
                      ? `${ev.students.length}${ev.maxPerSlot > 0 ? `/${ev.maxPerSlot}` : ''} зап.`
                      : `${ev.students.length} чел.`}
                  </div>}
                  {height > 44 && ev.teacher && <div style={{ fontSize:9, color:ev.color+'99', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>👩‍🏫 {ev.teacher}</div>}
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
function MonthView({ year, month, directions, clients, teachers, filterDir, filterTeacher, filterChild, onDayClick, onlyWithStudents, filterAddress, colorMode, addresses, filterGroups, enrollments = [] }) {
  const now = new Date()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
          let events = getEventsForDate(date, directions, clients, filterDir, filterTeacher, filterChild, teachers, filterAddress, colorMode, addresses, filterGroups, enrollments)
          if (onlyWithStudents) events = events.filter(e => e.students.length > 0)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          const dayDate = new Date(year, month, day); dayDate.setHours(0,0,0,0)
          const today0 = new Date(); today0.setHours(0,0,0,0)

          if (isMobile) {
            // Мобильный: компактные ячейки с цветными точками
            return (
              <div key={i} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => onDayClick(date)}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 2px', minHeight:44, cursor:'pointer' }}>
                <div className="cal-daynum" style={{
                  color: isToday ? 'white' : dayDate > today0 ? T.muted : T.ink,
                  background: isToday ? T.green : 'transparent',
                  borderRadius:'50%', width:24, height:24,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight: isToday ? 800 : 600, fontSize:13, flexShrink:0
                }}>{day}</div>
                {events.length > 0 && (
                  <div style={{ display:'flex', gap:2, flexWrap:'wrap', justifyContent:'center', marginTop:3, maxWidth:36 }}>
                    {events.slice(0, 4).map((e, ei) => (
                      <div key={ei} style={{
                        width:7, height:7, borderRadius:'50%',
                        background: e.color || T.green,
                        flexShrink:0
                      }} title={`${e.time} ${e.name}`} />
                    ))}
                    {events.length > 4 && (
                      <div style={{ fontSize:8, color:T.muted, lineHeight:'7px' }}>+{events.length-4}</div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          // Desktop: полные карточки занятий
          const byTime = {}
          events.forEach(e => {
            if (!byTime[e.time]) byTime[e.time] = []
            byTime[e.time].push(e)
          })
          const timeGroups = Object.entries(byTime).sort((a,b) => a[0].localeCompare(b[0]))

          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => onDayClick(date)}>
              <div className="cal-daynum" style={{ color: dayDate > today0 ? T.muted : T.ink }}>{day}</div>
              {timeGroups.map(([time, group], gi) => (
                <div key={gi} style={{ marginBottom:2 }}>
                  {group.length === 1 ? (
                    <div className="cal-event"
                      style={{ background:group[0].color+'33', color:group[0].color, borderLeft:'3px solid '+group[0].color, borderRadius:'0 4px 4px 0', paddingLeft:3 }}
                      title={group[0].name+' · '+group[0].students.length+' чел.'}>
                      {time} {group[0].name.split(' ')[0]}
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:1 }}>
                      {group.map((e, ei) => (
                        <div key={ei} className="cal-event"
                          style={{ flex:1, minWidth:0, background:e.color+'33', color:e.color, borderLeft:'2px solid '+e.color, borderRadius:'0 3px 3px 0', paddingLeft:2, fontSize:8 }}
                          title={e.name+' · '+e.students.length+' чел.'}>
                          {ei === 0 ? time+' ' : ''}{e.name.split(' ')[0]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPage({ directions, clients, teachers, addresses = [], staff, role, reload, studioId, features = {} }) {
  const now = new Date()
  const [view, setView] = useState('month') // month | week | day
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [selectedDay, setSelectedDay] = useState(null)

  const [filterTeacher, setFilterTeacher] = useState('all')
  const [filterDirs, setFilterDirs] = useState([]) // empty = all
  const [filterGroups, setFilterGroups] = useState([]) // group ids selected
  const [filterChild, setFilterChild] = useState('all')
  const [filterAddress, setFilterAddress] = useState('all')
  const [colorMode, setColorMode] = useState('direction') // 'direction' | 'address'
  const [onlyWithStudents, setOnlyWithStudents] = useState(false)
  const [enrollments, setEnrollments] = useState([])

  useEffect(() => {
    const loadEnrollments = async () => {
      const from = dateStr(addDays(new Date(), -60))
      const to = dateStr(addDays(new Date(), 60))
      const { data } = await supabase.from('enrollments')
        .select('*').gte('date', from).lte('date', to)
      if (data) setEnrollments(data)
    }
    loadEnrollments()
  }, [])

  const isAdmin = role === 'Директор' || role === 'Администратор'
  const myTeacher = teachers.find(t => t.name === staff?.name) || null
  const myTeacherName = myTeacher?.name || null
  const effectiveTeacher = !isAdmin && myTeacher ? String(myTeacher.id) : filterTeacher
  const filterDir = filterDirs // pass array directly

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

  const activeClients = clients.filter(c => c.status === 'Активен')

  const handleDayClick = (date) => {
    if (view === 'month') {
      setCurrentDate(date)
      setView('day')
    } else {
      setSelectedDay(date)
    }
  }

  const selectStyle = { padding:'5px 10px', borderRadius:8, border:`1.5px solid ${T.border}`, fontFamily:'Nunito Sans,sans-serif', fontSize:12, background:T.cream, outline:'none', cursor:'pointer', maxWidth:130 }

  return (
    <div>
      {/* Controls — компактная карточка */}
      <div style={{ background:'white', borderRadius:16, border:`1px solid ${T.border}`, padding:'10px 14px', marginBottom:14 }}>

        {/* Строка 1: вид + навигация */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:8 }}>
          <div className="tabs" style={{ marginBottom:0 }}>
            {[['month','Месяц'],['week','Неделя'],['day','День']].map(([v,l]) => (
              <button key={v} className={`tab ${view===v?'active':''}`} onClick={() => setView(v)} style={{ padding:'5px 10px', fontSize:13 }}>{l}</button>
            ))}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>←</button>
          <span style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14, flex:1, textAlign:'center', minWidth:100 }}>{getTitle()}</span>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(1)}>→</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday} style={{ fontSize:12 }}>Сегодня</button>
        </div>

        {/* Строка 2: фильтры */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {isAdmin && features.teachers !== false && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:11, color:T.muted, fontWeight:600, whiteSpace:'nowrap' }}>Педагог:</span>
              <select style={selectStyle} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
                <option value="all">Все</option>
                {teachers.map(t => <option key={t.id} value={String(t.id)}>{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0]}.</option>)}
              </select>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11, color:T.muted, fontWeight:600, whiteSpace:'nowrap' }}>Ребёнок:</span>
            <select style={selectStyle} value={filterChild} onChange={e => setFilterChild(e.target.value)}>
              <option value="all">Все</option>
              {activeClients.map(c => <option key={c.id} value={String(c.id)}>{c.child_name}</option>)}
            </select>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => setOnlyWithStudents(v => !v)}
            style={{ fontSize:11, padding:'5px 8px', whiteSpace:'nowrap', background: onlyWithStudents ? T.green : T.cream, color: onlyWithStudents ? 'white' : T.muted, border: `1.5px solid ${onlyWithStudents ? T.green : T.border}` }}>
            👥 {onlyWithStudents ? 'С учениками ✓' : 'С учениками'}
          </button>
          {addresses.length > 0 && features.addresses !== false && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:11, color:T.muted, fontWeight:600, whiteSpace:'nowrap' }}>Адрес:</span>
              <select style={selectStyle} value={filterAddress} onChange={e => setFilterAddress(e.target.value)}>
                <option value="all">Все</option>
                {addresses.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </select>
            </div>
          )}
          {(filterDirs.length > 0 || filterGroups.length > 0 || filterTeacher !== 'all' || filterChild !== 'all' || filterAddress !== 'all' || onlyWithStudents) && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => { setFilterDirs([]); setFilterGroups([]); setFilterTeacher('all'); setFilterChild('all'); setFilterAddress('all'); setOnlyWithStudents(false) }}>✕ Сбросить</button>
          )}
        </div>

        {/* Строка 3: переключатель цвета (только если есть адреса) */}
        {addresses.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}44` }}>
            <span style={{ fontSize:11, color:T.muted, fontWeight:600 }}>Цвет:</span>
            <div className="tabs" style={{ marginBottom:0 }}>
              <button className={`tab ${colorMode === 'direction' ? 'active' : ''}`} onClick={() => setColorMode('direction')} style={{ fontSize:12, padding:'4px 10px' }}>По направлениям</button>
              <button className={`tab ${colorMode === 'address' ? 'active' : ''}`} onClick={() => setColorMode('address')} style={{ fontSize:12, padding:'4px 10px' }}>По адресам</button>
            </div>
          </div>
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
          onDayClick={handleDayClick} onlyWithStudents={onlyWithStudents}
          filterAddress={filterAddress} colorMode={colorMode} addresses={addresses}
          filterGroups={filterGroups} enrollments={enrollments}
        />
      )}

      {(view === 'week' || view === 'day') && (
        <TimeGrid
          dates={view === 'week' ? weekDates : [currentDate]}
          directions={directions} clients={clients} teachers={teachers}
          filterDir={filterDir} filterTeacher={effectiveTeacher} filterChild={filterChild}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onDayClick={handleDayClick} onlyWithStudents={onlyWithStudents}
          filterAddress={filterAddress} colorMode={colorMode} addresses={addresses}
          filterGroups={filterGroups} enrollments={enrollments}
        />
      )}

      {/* Direction chips — мультиселект с подгруппами */}
      <div className="card card-pad" style={{ marginTop:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14 }}>🎯 Фильтр по направлениям <span style={{ fontSize:12, color:T.muted, fontWeight:400 }}>(можно выбрать несколько)</span></div>
          {(filterDirs.length > 0 || filterGroups.length > 0) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDirs([]); setFilterGroups([]) }}>✕ Все</button>
          )}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
          {directions.map(d => {
            const active = filterDirs.includes(String(d.id))
            const color = d.color || DEFAULT_COLOR
            const cnt = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен').length
            const groups = d.groups || []
            return (
              <div key={d.id} style={{ display:'flex', flexDirection:'column' }}>
                {/* Чип направления */}
                <div onClick={() => {
                  const id = String(d.id)
                  setFilterDirs(prev => {
                    if (prev.includes(id)) {
                      setFilterGroups(fg => fg.filter(gid => !groups.some(g => String(g.id) === gid)))
                      return prev.filter(x => x !== id)
                    }
                    return [...prev, id]
                  })
                }}
                  style={{
                    display:'flex', alignItems:'center', gap:8, padding:'8px 14px', cursor:'pointer', transition:'all 0.15s',
                    background: active ? color+'22' : T.cream,
                    border:`2px solid ${active ? color : T.border}`,
                    borderRadius: active && groups.length > 0 ? '12px 12px 0 0' : 12,
                    borderBottom: active && groups.length > 0 ? 'none' : undefined,
                  }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color: active ? color : T.ink }}>{d.name}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{cnt} чел.</div>
                  </div>
                  {active && <div style={{ width:16, height:16, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'white', fontWeight:800, flexShrink:0 }}>✓</div>}
                </div>

                {/* Подгруппы — появляются когда направление выбрано */}
                {active && groups.length > 0 && (
                  <div style={{ background: color+'11', border:`2px solid ${color}`, borderTop:'none', borderRadius:'0 0 12px 12px', padding:'6px 10px', display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, color: color, fontWeight:700, opacity:0.8, whiteSpace:'nowrap' }}>
                      📍 ПОДГРУППЫ {filterGroups.filter(gid => groups.some(g => String(g.id) === gid)).length === 0 ? '(все)' : ''}
                    </span>
                    {groups.map(g => {
                      const gActive = filterGroups.includes(String(g.id))
                      return (
                        <div key={g.id} onClick={e => {
                          e.stopPropagation()
                          const gid = String(g.id)
                          setFilterGroups(prev => prev.includes(gid) ? prev.filter(x => x !== gid) : [...prev, gid])
                        }} style={{
                          padding:'3px 10px', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:700,
                          background: gActive ? color : 'white',
                          color: gActive ? 'white' : color,
                          border:`1.5px solid ${color}`,
                          transition:'all 0.12s',
                        }}>
                          {gActive && '✓ '}{g.name}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Attendance modal */}
      {selectedDay && (
        <DayModal
          date={selectedDay}
          events={getEventsForDate(selectedDay, directions, clients, filterDir, effectiveTeacher, filterChild, teachers, filterAddress, colorMode, addresses, filterGroups, enrollments)}
          teachers={teachers}
          clients={clients}
          studioId={studioId}
          onClose={() => {
            setSelectedDay(null)
            // Перезагружаем enrollments чтобы обновить счётчик в календаре
            const from = dateStr(addDays(new Date(), -60))
            const to = dateStr(addDays(new Date(), 60))
            supabase.from('enrollments').select('*').gte('date', from).lte('date', to)
              .then(({ data }) => { if (data) setEnrollments(data) })
          }}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onAttendanceChange={() => { reload && reload(); setEnrollments([]); setTimeout(() => {
            const from = dateStr(addDays(new Date(), -60))
            const to = dateStr(addDays(new Date(), 60))
            supabase.from('enrollments').select('*').gte('date', from).lte('date', to).then(({ data }) => { if (data) setEnrollments(data) })
          }, 100) }}
        />
      )}
    </div>
  )
}