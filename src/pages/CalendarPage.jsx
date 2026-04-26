import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const DEFAULT_COLOR = '#7BAF8E'

const parseTime = (schedule) => {
  const m = (schedule || '').match(/(\d{1,2}):(\d{2})/)
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

const dayMatches = (dow, schedule) => {
  const s = schedule || ''
  return (dow===1&&s.includes('Пн'))||(dow===2&&s.includes('Вт'))||
    (dow===3&&s.includes('Ср'))||(dow===4&&s.includes('Чт'))||
    (dow===5&&s.includes('Пт'))||(dow===6&&s.includes('Сб'))||
    (dow===0&&s.includes('Вс'))
}

function DayModal({ date, events, onClose, isAdmin, myTeacherName, onAttendanceChange }) {
  const [attendance, setAttendance] = useState({})
  const today = new Date(); today.setHours(0,0,0,0)
  const isPast = date <= today

  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

  useEffect(() => {
    supabase.from('attendance').select('*').eq('date', dateStr).then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[`${r.client_id}_${r.direction_id}`] = r.present })
        setAttendance(map)
      }
    })
  }, [dateStr])

  const toggle = async (clientId, dirId, teacherName) => {
    if (!isPast) return
    const canMark = isAdmin || (myTeacherName && teacherName === myTeacherName)
    if (!canMark) return
    const key = `${clientId}_${dirId}`
    const newVal = !attendance[key]
    setAttendance(p => ({ ...p, [key]: newVal }))
    await supabase.from('attendance').upsert(
      { date: dateStr, client_id: clientId, direction_id: dirId, present: newVal },
      { onConflict: 'date,client_id,direction_id' }
    )
    const { data: allAtt } = await supabase.from('attendance')
      .select('*').eq('client_id', clientId).eq('present', true)
    if (allAtt) {
      await supabase.from('clients').update({ visited_lessons: allAtt.length }).eq('id', clientId)
      onAttendanceChange && onAttendanceChange()
    }
  }

  return (
    <Modal title={`📅 ${date.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' })}`} onClose={onClose} large
      footer={<button className="btn btn-ghost" onClick={onClose}>Закрыть</button>}>
      {!isPast && (
        <div style={{ background: '#fff4e6', color: '#c47a00', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ⏳ Отмечать посещаемость можно только за прошедшие даты и сегодня
        </div>
      )}
      {events.length === 0 && <div className="empty"><div className="empty-icon">🗓️</div><div className="empty-text">Занятий нет</div></div>}
      {events.map((ev, i) => {
        const canMark = isPast && (isAdmin || (myTeacherName && ev.teacher === myTeacherName))
        const presentCount = ev.students.filter(s => attendance[`${s.id}_${ev.dirId}`]).length
        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 14px', background: ev.color + '22', borderRadius: 12, borderLeft: `4px solid ${ev.color}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{ev.name}</div>
                <div style={{ fontSize: 12, color: T.muted }}>🕐 {ev.time} · ⏱ {ev.duration} · 👩‍🏫 {ev.teacher}</div>
              </div>
              <span className="badge badge-green">{presentCount}/{ev.students.length}</span>
            </div>
            {ev.students.length === 0 && <div style={{ fontSize: 13, color: T.muted, padding: '8px 14px' }}>Нет записанных учеников</div>}
            {ev.students.map(s => {
              const key = `${s.id}_${ev.dirId}`
              const present = attendance[key]
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${T.border}` }}>
                  <div className="avatar" style={{ background: hashColor(s.child_name), width: 30, height: 30, fontSize: 12 }}>{(s.child_name||'?')[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.child_name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{s.adult_name}</div>
                  </div>
                  <button onClick={() => toggle(s.id, ev.dirId, ev.teacher)}
                    style={{
                      padding: '5px 14px', borderRadius: 10, border: 'none',
                      cursor: canMark ? 'pointer' : 'not-allowed',
                      fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: 12,
                      background: present ? T.greenBg : isPast ? T.redLight : '#f5f5f0',
                      color: present ? T.greenDark : isPast ? T.red : T.muted,
                      opacity: canMark ? 1 : 0.55,
                    }}>
                    {present ? '✅ Пришёл' : '❌ Отсутствует'}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </Modal>
  )
}

export default function CalendarPage({ directions, clients, teachers, staff, role, reload }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)

  // Filters
  const [filterTeacher, setFilterTeacher] = useState('all')
  const [filterDir, setFilterDir] = useState('all')
  const [filterChild, setFilterChild] = useState('all')

  const isAdmin = role === 'Директор' || role === 'Администратор'
  const myTeacher = teachers.find(t => t.name === staff?.name) || null
  const myTeacherName = myTeacher?.name || null
  const effectiveTeacher = !isAdmin && myTeacher ? String(myTeacher.id) : filterTeacher

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month+1, 0).getDate()

  // Get active clients for child filter (filter by selected direction if set)
  const activeClients = clients.filter(c => {
    if (c.status !== 'Активен') return false
    if (filterDir !== 'all') return (c.direction_ids || []).includes(+filterDir)
    return true
  })

  const getEventsForDay = (day) => {
    const dow = new Date(year, month, day).getDay()
    const events = []
    directions.forEach(d => {
      if (!dayMatches(dow, d.schedule)) return

      // Teacher filter
      if (effectiveTeacher !== 'all') {
        const t = teachers.find(t => String(t.id) === effectiveTeacher)
        if (t && !(t.direction_ids || []).includes(d.id)) return
      }

      // Direction filter
      if (filterDir !== 'all' && String(d.id) !== filterDir) return

      // Child filter — only show directions this child attends
      if (filterChild !== 'all') {
        const child = clients.find(c => String(c.id) === filterChild)
        if (!child || !(child.direction_ids || []).includes(d.id)) return
      }

      let students = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен')

      // If child filter active, show only that child
      if (filterChild !== 'all') {
        students = students.filter(c => String(c.id) === filterChild)
      }

      const time = (d.schedule || '').split(' ').pop()
      events.push({
        name: d.name, time, teacher: d.teacher_name, dirId: d.id,
        students, color: d.color || DEFAULT_COLOR, duration: d.duration || '1 час',
        timeMin: parseTime(d.schedule)
      })
    })
    events.sort((a, b) => a.timeMin - b.timeMin)
    return events
  }

  const cells = Array(offset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i+1))
  const selectedDate = selectedDay ? new Date(year, month, selectedDay) : null
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : []

  const selectStyle = { padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontFamily: 'Nunito Sans, sans-serif', fontSize: 13, background: T.cream, outline: 'none', cursor: 'pointer' }

  return (
    <div>
      {/* Top controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Month navigation */}
        <button className="btn btn-outline btn-sm" onClick={prev}>← Назад</button>
        <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
        <button className="btn btn-outline btn-sm" onClick={next}>Вперёд →</button>

        <div style={{ width: 1, height: 28, background: T.border, margin: '0 4px' }} />

        {/* Direction filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Направление:</span>
          <select style={selectStyle} value={filterDir} onChange={e => { setFilterDir(e.target.value); setFilterChild('all') }}>
            <option value="all">Все</option>
            {directions.map(d => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Teacher filter — only for admin */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Педагог:</span>
            <select style={selectStyle} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
              <option value="all">Все</option>
              {teachers.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0]}.</option>
              ))}
            </select>
          </div>
        )}

        {/* Child filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Ребёнок:</span>
          <select style={selectStyle} value={filterChild} onChange={e => setFilterChild(e.target.value)}>
            <option value="all">Все</option>
            {activeClients.map(c => (
              <option key={c.id} value={String(c.id)}>{c.child_name}</option>
            ))}
          </select>
        </div>

        {/* Reset filters */}
        {(filterDir !== 'all' || filterTeacher !== 'all' || filterChild !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDir('all'); setFilterTeacher('all'); setFilterChild('all') }}>
            ✕ Сбросить
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className="cal-header-row">
        {DAYS.map(d => <div key={d} className="cal-dayname">{d}</div>)}
      </div>
      <div className="cal-grid" style={{ marginBottom: 20 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cal-day empty" />
          const events = getEventsForDay(day)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          const dayDate = new Date(year, month, day); dayDate.setHours(0,0,0,0)
          const today0 = new Date(); today0.setHours(0,0,0,0)
          const isFuture = dayDate > today0
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => setSelectedDay(day)}>
              <div className="cal-daynum" style={{ color: isFuture ? T.muted : T.ink }}>{day}</div>
              {events.map((e, j) => (
                <div key={j} className="cal-event"
                  style={{ background: e.color + '33', color: e.color, borderLeft: `3px solid ${e.color}`, borderRadius: '0 6px 6px 0', paddingLeft: 5 }}
                  title={`${e.name} · ${e.students.length} чел. · ${e.duration}`}>
                  {e.time} {e.name.split(' ')[0]}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Direction chips at bottom */}
      <div className="card card-pad">
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🎯 Направления</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {directions.map(d => {
            const active = filterDir === String(d.id)
            const color = d.color || DEFAULT_COLOR
            const cnt = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен').length
            return (
              <div key={d.id} onClick={() => setFilterDir(active ? 'all' : String(d.id))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? color + '22' : T.cream,
                  border: `2px solid ${active ? color : T.border}`,
                }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: active ? color : T.ink }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>🕐 {d.schedule} · 👥 {cnt} чел.</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedDay && selectedDate && (
        <DayModal
          date={selectedDate}
          events={selectedEvents}
          onClose={() => setSelectedDay(null)}
          isAdmin={isAdmin}
          myTeacherName={myTeacherName}
          onAttendanceChange={reload}
        />
      )}
    </div>
  )
}
