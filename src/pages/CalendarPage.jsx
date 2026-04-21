import { useState } from 'react'
import { T } from '../styles'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

export default function CalendarPage({ directions, clients }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [role, setRole] = useState('Администратор')

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const getEvents = (day) => {
    const dow = new Date(year, month, day).getDay()
    const events = []
    directions.forEach(d => {
      const s = d.schedule || ''
      const hit = (dow === 1 && s.includes('Пн')) || (dow === 2 && s.includes('Вт')) ||
        (dow === 3 && s.includes('Ср')) || (dow === 4 && s.includes('Чт')) ||
        (dow === 5 && s.includes('Пт')) || (dow === 6 && s.includes('Сб')) ||
        (dow === 0 && s.includes('Вс'))
      if (hit) {
        const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
        const time = s.split(' ').pop()
        events.push({ name: d.name, time, cnt, teacher: d.teacher_name })
      }
    })
    return events
  }

  const cells = Array(offset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={prev}>← Назад</button>
        <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
        <button className="btn btn-outline btn-sm" onClick={next}>Вперёд →</button>
        <div className="tabs" style={{ marginBottom: 0, marginLeft: 'auto' }}>
          {['Администратор', 'Преподаватель'].map(r => (
            <button key={r} className={`tab ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="cal-header-row">
        {DAYS.map(d => <div key={d} className="cal-dayname">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cal-day empty" />
          const events = getEvents(day)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`}>
              <div className="cal-daynum">{day}</div>
              {events.map((e, j) => (
                <div key={j} className={`cal-event ${j % 2 === 0 ? 'cal-event-green' : 'cal-event-orange'}`}
                  title={`${e.name} · ${e.cnt} чел. · ${e.teacher}`}>
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
          {directions.map(d => {
            const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
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
    </div>
  )
}
