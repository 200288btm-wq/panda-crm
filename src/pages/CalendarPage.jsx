import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function DayModal({ date, events, clients, onClose, isAdmin, myTeacherName }) {
  const [attendance, setAttendance] = useState({})

  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

  useEffect(() => {
    // Load attendance from Supabase for this date
    supabase.from('attendance').select('*').eq('date', dateStr).then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[`${r.client_id}_${r.direction_id}`] = r.present })
        setAttendance(map)
      }
    })
  }, [dateStr])

  const toggle = async (clientId, dirId, teacherName) => {
    // Only allow marking own lessons (for teachers) or all (for admin)
    if (!isAdmin && myTeacherName && teacherName !== myTeacherName) return
    const key = `${clientId}_${dirId}`
    const newVal = !attendance[key]
    setAttendance(p => ({ ...p, [key]: newVal }))
    await supabase.from('attendance').upsert({
      date: dateStr, client_id: clientId, direction_id: dirId, present: newVal
    }, { onConflict: 'date,client_id,direction_id' })
  }

  return (
    <Modal title={`📅 ${date.toLocaleDateString('ru-RU', { day:'numeric', month:'long' })}`} onClose={onClose} large>
      {events.length === 0 && <div className="empty"><div className="empty-icon">🗓️</div><div className="empty-text">Занятий нет</div></div>}
      {events.map((ev, i) => {
        const canMark = isAdmin || (myTeacherName && ev.teacher === myTeacherName)
        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 14px', background: T.greenBg, borderRadius: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{ev.name}</div>
                <div style={{ fontSize: 12, color: T.muted }}>🕐 {ev.time} · 👩‍🏫 {ev.teacher}</div>
              </div>
              <span className="badge badge-green">{ev.students.length} чел.</span>
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
                  <button
                    onClick={() => canMark && toggle(s.id, ev.dirId, ev.teacher)}
                    style={{
                      padding: '5px 14px', borderRadius: 10, border: 'none', cursor: canMark ? 'pointer' : 'default',
                      fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: 12,
                      background: present ? T.greenBg : T.redLight,
                      color: present ? T.greenDark : T.red,
                      opacity: canMark ? 1 : 0.6,
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

export default function CalendarPage({ directions, clients, teachers, staff, role }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState('all')

  const isAdmin = role === 'Директор' || role === 'Администратор'

  // Find current user's teacher record
  const myTeacher = teachers.find(t => t.name === staff?.name) || null
  const myTeacherName = myTeacher?.name || null

  // For teachers: auto-select their own schedule
  const effectiveTeacherId = !isAdmin && myTeacher ? String(myTeacher.id) : selectedTeacherId

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month+1, 0).getDate()

  const getEventsForDay = (day) => {
    const dow = new Date(year, month, day).getDay()
    const events = []
    directions.forEach(d => {
      const s = d.schedule || ''
      const hit = (dow===1&&s.includes('Пн'))||(dow===2&&s.includes('Вт'))||
        (dow===3&&s.includes('Ср'))||(dow===4&&s.includes('Чт'))||
        (dow===5&&s.includes('Пт'))||(dow===6&&s.includes('Сб'))||
        (dow===0&&s.includes('Вс'))
      if (!hit) return

      // Filter by selected teacher
      if (effectiveTeacherId !== 'all') {
        const t = teachers.find(t => String(t.id) === effectiveTeacherId)
        if (t && !(t.direction_ids || []).includes(d.id)) return
      }

      const students = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен')
      const time = s.split(' ').pop()
      events.push({ name: d.name, time, teacher: d.teacher_name, dirId: d.id, students })
    })
    return events
  }

  const cells = Array(offset).fill(null).concat(Array.from({ length: daysInMonth }, (_,i) => i+1))

  const selectedDate = selectedDay ? new Date(year, month, selectedDay) : null
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={prev}>← Назад</button>
        <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
        <button className="btn btn-outline btn-sm" onClick={next}>Вперёд →</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin ? (
            <>
              <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Педагог:</span>
              <select className="form-input" style={{ width: 'auto', padding: '6px 12px' }}
                value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                <option value="all">Все занятия</option>
                {teachers.map(t => <option key={t.id} value={String(t.id)}>{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0]}.</option>)}
              </select>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`tab ${effectiveTeacherId !== 'all' ? 'active' : ''}`}
                onClick={() => {}} style={{ fontSize: 12 }}>
                Мои занятия
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="cal-header-row">
        {DAYS.map(d => <div key={d} className="cal-dayname">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cal-day empty" />
          const events = getEventsForDay(day)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => setSelectedDay(day)}>
              <div className="cal-daynum">{day}</div>
              {events.map((e, j) => (
                <div key={j} className={`cal-event ${j%2===0 ? 'cal-event-green' : 'cal-event-orange'}`}
                  title={`${e.name} · ${e.students.length} чел.`}>
                  {e.time} {e.name.split(' ')[0]}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 20 }} className="card card-pad">
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📋 Расписание направлений</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
          {directions
            .filter(d => effectiveTeacherId === 'all' || (teachers.find(t => String(t.id) === effectiveTeacherId)?.direction_ids || []).includes(d.id))
            .map(d => {
              const cnt = clients.filter(c => (c.direction_ids||[]).includes(d.id) && c.status === 'Активен').length
              return (
                <div key={d.id} style={{ background: T.cream, borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>🕐 {d.schedule}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>👩‍🏫 {d.teacher_name}</div>
                  <div style={{ fontSize: 12, color: T.greenDark, fontWeight: 700, marginTop: 3 }}>👥 {cnt} учеников</div>
                </div>
              )
            })}
        </div>
      </div>

      {selectedDay && selectedDate && (
        <DayModal
          date={selectedDate}
          events={selectedEvents}
          clients={clients}
          onClose={() => setSelectedDay(null)}
          isAdmin={isAdmin}
          myTeacherName={myTeacherName}
        />
      )}
    </div>
  )
}
