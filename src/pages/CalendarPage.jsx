import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { T, hashColor, addressColor } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { Hint } from '../components/Hint'
import { toast } from '../lib/ui'
import { statusIndex, inSchedule } from '../lib/clientStatus'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const NO_ADDRESS_COLOR = '#9ca3af'  // занятие без адреса в режиме «по адресам»
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

// Длительность в минутах: сначала часы из справочника, иначе разбор текста
const durationMinutes = (d) => d?.duration_hours ? Math.round(+d.duration_hours * 60) : parseDuration(d?.duration)

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
//
// ⚠️ `clients` сюда приходит УЖЕ отфильтрованным по галочке in_schedule
// справочника статусов (см. scheduleClients в CalendarPage). Внутри
// статус не проверяется: раньше в четырёх ветках стояло сравнение с
// «Активен», а пятая — запись на конкретное занятие — не проверяла
// ничего, и ушедший ребёнок оставался в сетке.
const getEventsForDate = (date, directions, clients, filterDir, filterTeacher, filterChild, teachers, filterAddress = 'all', colorMode = 'direction', addresses = [], filterGroups = [], enrollments = []) => {
  const dow = date.getDay()
  const ds = dateStr(date)
  const events = []
  directions.forEach(d => {
    // Занятия рисуются из расписания, а не из базы. Поэтому архивное
    // направление гасим только начиная с даты архивации: прошлые
    // занятия и отметки по ним остаются видимыми в календаре.
    if (d.archived_at && ds >= String(d.archived_at).slice(0, 10)) return
    // Фильтр по направлению
    if (Array.isArray(filterDir)) {
      if (filterDir.length > 0 && !filterDir.includes(String(d.id))) return
    } else {
      if (filterDir !== 'all' && String(d.id) !== filterDir) return
    }
    if (filterChild !== 'all') {
      const child = clients.find(c => String(c.id) === filterChild)
      if (!child || !(child.direction_ids||[]).includes(d.id)) return
    }

    const dirGroups = (d.groups || [])
    const relevantFilterGroups = filterGroups.filter(gid => dirGroups.some(g => String(g.id) === gid))

    // Если у направления есть подгруппы — обрабатываем каждую с её расписанием
    const hasSubgroups = dirGroups.length > 0

    if (hasSubgroups) {
      dirGroups.forEach(group => {
        // Фильтр по выбранным подгруппам
        if (relevantFilterGroups.length > 0 && !relevantFilterGroups.includes(String(group.id))) return

        const groupSchedule = group.schedule || d.schedule
        const timeForDay = getTimeForDow(dow, groupSchedule)
        if (!timeForDay) return

        // Педагоги направления — источник правды карточка педагога
        const dirTeachers = (teachers || []).filter(t => (t.direction_ids || []).includes(d.id))
        if (filterTeacher !== 'all' && !dirTeachers.some(t => String(t.id) === filterTeacher)) return

        // Фильтр по адресу подгруппы
        if (filterAddress !== 'all' && String(group.address_id) !== filterAddress) return

        const timeMin = parseTime(timeForDay)
        if (timeMin === null) return

        // Ученики подгруппы
        const dayKey = DOW_TO_KEY[dow]
        let students
        if (d.enrollment_type === 'calendar') {
          const dayEnrollments = enrollments.filter(e => e.direction_id === d.id && e.date === ds && e.status !== 'cancelled')
          const enrolledIds = dayEnrollments.map(e => e.client_id)
          students = clients.filter(c => enrolledIds.includes(c.id))
        } else if (d.enrollment_type === 'client_days') {
          // Клиент показывается только в свои дни и только в своей подгруппе
          students = clients.filter(c => {
            if (!(c.direction_ids||[]).includes(d.id)) return false
            const ws = (c.weekly_schedule || {})[d.id] || (c.weekly_schedule || {})[String(d.id)]
            if (!ws || !Array.isArray(ws.days)) return false
            if (!ws.days.includes(dayKey)) return false
            // Подгруппа: если у клиента указана — должна совпадать
            if (ws.group_id && String(ws.group_id) !== String(group.id)) return false
            return true
          })
          // Разовые записи в «чужой» день/подгруппу
          const oneOff = enrollments.filter(e =>
            e.direction_id === d.id && e.date === ds && e.status !== 'cancelled' &&
            (!e.group_id || String(e.group_id) === String(group.id))
          )
          oneOff.forEach(e => {
            if (students.some(s => s.id === e.client_id)) return
            const c = clients.find(x => x.id === e.client_id)
            if (c) students.push({ ...c, _oneOff: true })
          })
        } else {
          students = clients.filter(c => (c.direction_ids||[]).includes(d.id))
          // Фильтруем по подгруппе
          students = students.filter(c => {
            const clientGroups = (c.group_ids || []).map(String)
            // Если у клиента не указана подгруппа — показываем во всех
            if (clientGroups.length === 0) return true
            return clientGroups.includes(String(group.id))
          })
        }
        if (filterChild !== 'all') students = students.filter(c => String(c.id) === filterChild)


        // Цвет. В режиме «по адресам» занятие без адреса красим нейтральным
        // серым: цвет направления там читался бы как ещё один адрес
        let eventColor = d.color || DEFAULT_COLOR
        if (colorMode === 'address') {
          const addr = group.address_id
            ? addresses.find(a => String(a.id) === String(group.address_id))
            : null
          eventColor = addressColor(addr, addresses) || NO_ADDRESS_COLOR
        }

        events.push({
          name: dirGroups.length > 1 ? `${d.name} · ${group.name || ''}`.trim() : d.name,
          timeMin, time: timeForDay,
          teacher: dirTeachers.length === 1 ? dirTeachers[0].name : null,
          teachersList: dirTeachers,
          dirId: d.id, groupId: group.id, students,
          color: eventColor, duration: d.duration || '1 час',
          durationMin: durationMinutes(d),
          enrollmentType: d.enrollment_type || 'group',
          paymentType: d.payment_type || 'per_lesson',
          maxPerSlot: d.max_per_slot || 0,
        })
      })
    } else {
      // Старая логика — направление без подгрупп
      const timeForDay = getTimeForDow(dow, d.schedule)
      if (!timeForDay) return
      if (filterTeacher !== 'all') {
        const t = teachers.find(t => String(t.id) === filterTeacher)
        if (t && !(t.direction_ids||[]).includes(d.id)) return
      }
      if (filterAddress !== 'all') return // нет подгрупп — нет адреса

      const timeMin = parseTime(timeForDay)
      if (timeMin === null) return

      const dayKey = DOW_TO_KEY[dow]
      let students
      if (d.enrollment_type === 'calendar') {
        const dayEnrollments = enrollments.filter(e => e.direction_id === d.id && e.date === ds && e.status !== 'cancelled')
        const enrolledIds = dayEnrollments.map(e => e.client_id)
        students = clients.filter(c => enrolledIds.includes(c.id))
      } else if (d.enrollment_type === 'client_days') {
        students = clients.filter(c => {
          if (!(c.direction_ids||[]).includes(d.id)) return false
          const ws = (c.weekly_schedule || {})[d.id] || (c.weekly_schedule || {})[String(d.id)]
          if (!ws || !Array.isArray(ws.days)) return false
          return ws.days.includes(dayKey)
        })
        // Разовые записи
        const oneOff = enrollments.filter(e => e.direction_id === d.id && e.date === ds && e.status !== 'cancelled')
        oneOff.forEach(e => {
          if (students.some(s => s.id === e.client_id)) return
          const c = clients.find(x => x.id === e.client_id)
          if (c) students.push({ ...c, _oneOff: true })
        })
      } else {
        students = clients.filter(c => (c.direction_ids||[]).includes(d.id))
      }
      if (filterChild !== 'all') students = students.filter(c => String(c.id) === filterChild)

      const dirTeachers = (teachers || []).filter(t => (t.direction_ids || []).includes(d.id))
      events.push({
        name: d.name, timeMin, time: timeForDay,
        teacher: dirTeachers.length === 1 ? dirTeachers[0].name : null,
        teachersList: dirTeachers,
        dirId: d.id, groupId: null, students,
        color: colorMode === 'address' ? NO_ADDRESS_COLOR : (d.color || DEFAULT_COLOR),
        duration: d.duration || '1 час',
        durationMin: durationMinutes(d),
        enrollmentType: d.enrollment_type || 'group',
        paymentType: d.payment_type || 'per_lesson',
        maxPerSlot: d.max_per_slot || 0,
      })
    }
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
  const [confirms, setConfirms] = useState({})   // «клиент_направление_подгруппа» → confirmed | declined
  const [work, setWork] = useState({})        // ключ → { teacher_id: часы } — текущее состояние в интерфейсе
  const [savedWork, setSavedWork] = useState({}) // то же, но как лежит в базе
  const [lastWork, setLastWork] = useState({})   // состав с прошлого занятия — для подстановки
  const [savingWork, setSavingWork] = useState(null)
  const [noWork, setNoWork] = useState({})      // занятия, помеченные «никто не работал»
  const dirtyRef = useRef(false)  // накопитель: были ли изменения, требующие reload при закрытии
  const markingRef = useRef(new Set())  // отметки в процессе сохранения — защита от двойного клика

  const today = new Date(); today.setHours(0,0,0,0)
  const isPast = date <= today
  const ds = dateStr(date)

  useEffect(() => {
    if (!studioId) return
    // Загружаем enrollments для этого дня.
    // Фильтр по студии обязателен: RLS пропускает ВСЕ студии участника,
    // поэтому у человека в двух студиях сюда подмешивались чужие записи.
    supabase.from('enrollments').select('*')
      .eq('studio_id', studioId).eq('date', ds).eq('status', 'enrolled')
      .then(({ data }) => { if (data) setLocalEnrollments(data) })
  }, [ds, studioId])

  // Ответы родителей на напоминание бота. Ключ тот же, что у занятия:
  // клиент + направление + подгруппа — в базе занятия нет, оно рисуется
  // из расписания. Подтверждение это ПРОГНОЗ, а не посещение: отметка
  // ставится отдельно и живёт в attendance.
  useEffect(() => {
    if (!studioId) return
    supabase.from('lesson_confirmations')
      .select('client_id, direction_id, group_id, status')
      .eq('studio_id', studioId).eq('lesson_date', ds)
      .then(({ data, error }) => {
        if (error) { setConfirms({}); return }
        const m = {}
        ;(data || []).forEach(r => { m[`${r.client_id}_${r.direction_id}_${r.group_id || 0}`] = r.status })
        setConfirms(m)
      })
  }, [ds, studioId])

  // Пересчитываем events с учётом localEnrollments
  const events = initialEvents.map(ev => {
    if (ev.enrollmentType === 'calendar') {
      const enrolledIds = localEnrollments.filter(e => e.direction_id === ev.dirId).map(e => e.client_id)
      return { ...ev, students: clients.filter(c => enrolledIds.includes(c.id)) }
    }
    if (ev.enrollmentType === 'client_days') {
      // Базовые ученики (по своим дням) + разовые записи
      const base = ev.students.filter(s => !s._oneOff)
      const oneOffIds = localEnrollments
        .filter(e => e.direction_id === ev.dirId && (!e.group_id || String(e.group_id) === String(ev.groupId)))
        .map(e => e.client_id)
      const extra = clients
        .filter(c => oneOffIds.includes(c.id) && !base.some(s => s.id === c.id))
        .map(c => ({ ...c, _oneOff: true }))
      return { ...ev, students: [...base, ...extra] }
    }
    return ev
  })

  const reloadEnrollments = async () => {
    const { data } = await supabase.from('enrollments').select('*')
      .eq('studio_id', studioId).eq('date', ds).eq('status', 'enrolled')
    if (data) setLocalEnrollments(data)
  }

  const enroll = async (clientId, dirId, groupId = null) => {
    setEnrolling2(true)
    await supabase.from('enrollments').upsert({
      studio_id: studioId, direction_id: dirId, client_id: clientId,
      date: ds, status: 'enrolled', group_id: groupId || null
    }, { onConflict: 'studio_id,direction_id,client_id,date' })
    setEnrolling(null); setEnrollSearch('')
    setEnrolling2(false)
    await reloadEnrollments()
  }

  const cancelEnroll = async (clientId, dirId) => {
    await supabase.from('enrollments')
      .update({ status: 'cancelled' })
      .eq('studio_id', studioId)
      .eq('direction_id', dirId).eq('client_id', clientId).eq('date', ds)
    await reloadEnrollments()
  }

  useEffect(() => {
    const loadWork = async () => {
      const { data: wl } = await supabase.from('teacher_work_log').select('*')
        .eq('studio_id', studioId).eq('date', ds)
      const map = {}
      ;(wl || []).forEach(r => {
        const k = `${r.direction_id}_${r.group_id || 0}`
        if (!map[k]) map[k] = {}
        map[k][r.teacher_id] = +r.hours
      })
      setSavedWork(map)
      setWork(map)
      // Последний состав до этой даты — чтобы не заполнять каждый раз заново
      const { data: prev } = await supabase.from('teacher_work_log')
        .select('*').eq('studio_id', studioId)
        .lt('date', ds).order('date', { ascending: false }).limit(300)
      const last = {}
      ;(prev || []).forEach(r => {
        const k = `${r.direction_id}_${r.group_id || 0}`
        if (!last[k]) last[k] = { date: r.date, rows: {} }
        if (last[k].date === r.date) last[k].rows[r.teacher_id] = +r.hours
      })
      setLastWork(last)

      // Явная пометка «никто не работал». Без неё пустой журнал означал
      // сразу две разные вещи: занятия не было и его просто не заполнили
      const { data: nw } = await supabase.from('lesson_no_work').select('*')
        .eq('studio_id', studioId).eq('date', ds)
      const nwMap = {}
      ;(nw || []).forEach(r => { nwMap[`${r.direction_id}_${r.group_id || 0}`] = true })
      setNoWork(nwMap)
    }
    if (studioId) loadWork()
  }, [ds, studioId])

  const saveWork = async (wkey, dirId, groupId, map) => {
    setSavingWork(wkey)
    await supabase.from('teacher_work_log').delete()
      .eq('studio_id', studioId)
      .eq('date', ds).eq('direction_id', dirId).eq('group_id', groupId || 0)
    const rows = Object.entries(map).map(([tid, h]) => ({
      studio_id: studioId, date: ds, direction_id: dirId,
      group_id: groupId || 0, teacher_id: +tid, hours: +h || 0,
    }))
    if (rows.length) await supabase.from('teacher_work_log').insert(rows)
    // Отметили педагога — «никто не работал» перестало быть правдой.
    // Снимаем молча, иначе получится противоречивое состояние
    if (rows.length) await clearNoWork(wkey, dirId, groupId)
    setSavedWork(p => ({ ...p, [wkey]: map }))
    setSavingWork(null)
  }

  const clearNoWork = async (wkey, dirId, groupId) => {
    if (!noWork[wkey]) return
    await supabase.from('lesson_no_work').delete()
      .eq('studio_id', studioId).eq('date', ds)
      .eq('direction_id', dirId).eq('group_id', groupId || 0)
    setNoWork(p => { const n = { ...p }; delete n[wkey]; return n })
  }

  const markNoWork = async (wkey, dirId, groupId) => {
    setSavingWork(wkey)
    // Пометка и записанные часы взаимоисключающи
    await supabase.from('teacher_work_log').delete()
      .eq('studio_id', studioId).eq('date', ds)
      .eq('direction_id', dirId).eq('group_id', groupId || 0)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('lesson_no_work').upsert({
      studio_id: studioId, date: ds, direction_id: dirId,
      group_id: groupId || 0, marked_by: u?.user?.id || null,
    }, { onConflict: 'studio_id,date,direction_id,group_id' })
    setSavingWork(null)
    if (error) { toast.fromError(error, 'Не удалось поставить пометку «занятия не было»'); return }
    setNoWork(p => ({ ...p, [wkey]: true }))
    setSavedWork(p => ({ ...p, [wkey]: {} }))
    setWork(p => ({ ...p, [wkey]: {} }))
  }

  useEffect(() => {
    if (!studioId) return
    supabase.from('attendance').select('*')
      .eq('studio_id', studioId).eq('date', ds).then(({ data }) => {
      if (data) {
        const map = {}
        // Ключ включает подгруппу: одна и та же дата+клиент+направление
        // может быть двумя разными занятиями («Утро» и «Вечер»)
        data.forEach(r => { map[`${r.client_id}_${r.direction_id}_${r.group_id || 0}`] = r.present })
        setAttendance(map)
      }
    })
  }, [ds, studioId])

  const toggle = async (clientId, dirId, ev) => {
    if (!isPast) return
    const canMark = isAdmin || (myTeacherName && (ev.teachersList || []).some(t => t.name === myTeacherName))
    if (!canMark) return
    const gid = ev.groupId || null
    const key = `${clientId}_${dirId}_${gid || 0}`
    // Второй клик, пока первый не долетел, давал двойное списание занятия
    if (markingRef.current.has(key)) return
    markingRef.current.add(key)
    const prevVal = !!attendance[key]
    const newVal = !prevVal
    setAttendance(p => ({ ...p, [key]: newVal }))
    // Снимок педагога для истории: берём того, кто отмечен работавшим
    const wkey = `${ev.dirId}_${ev.groupId || 0}`
    const workedIds = Object.keys(work[wkey] || {})
    const teacherObj = workedIds.length
      ? teachers.find(t => t.id === +workedIds[0])
      : ((ev.teachersList || []).length === 1 ? ev.teachersList[0] : null)
    const { error: attErr } = await supabase.from('attendance').upsert(
      {
        studio_id: studioId,
        date: ds,
        client_id: clientId,
        direction_id: dirId,
        group_id: gid,
        present: newVal,
        time: ev.time || null,
        teacher_id: teacherObj?.id || null,
      },
      { onConflict: 'date,client_id,direction_id,group_key' }
    )
    // Раньше ошибка проглатывалась: галочка стояла, в базе ничего не было
    if (attErr) {
      setAttendance(p => ({ ...p, [key]: prevVal }))
      markingRef.current.delete(key)
      toast.fromError(attErr, 'Отметка не сохранена — галочка возвращена как была')
      return
    }
    // Модель A: visited_lessons = стартовое число + отметки. Меняем по дельте
    // (+1 при отметке, −1 при снятии), чтобы не терять стартовое значение,
    // введённое вручную или пришедшее из импорта.
    const { error: visErr } = await supabase.rpc('adjust_visited', { p_client_id: clientId, p_delta: newVal ? 1 : -1 })
    // Отметка легла, а баланс — нет: это расхождение, о нём надо сказать вслух
    if (visErr) toast.fromError(visErr, 'Отметка сохранена, но баланс занятий не пересчитан')
    markingRef.current.delete(key)
    dirtyRef.current = true  // обновим списки при закрытии, а не сейчас — иначе модалка закроется
  }

  const handleClose = () => { onClose(dirtyRef.current) }

  return (
    <Modal title={`📅 ${date.toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' })}`} onClose={handleClose} large
      footer={<button className="btn btn-ghost" onClick={handleClose}>Закрыть</button>}>
      {!isPast && <div style={{ background:'#fff4e6', color:'#c47a00', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, fontWeight:600 }}>⏳ Отмечать можно только прошедшие даты и сегодня</div>}
      {events.length === 0 && <div className="empty"><div className="empty-icon">🗓️</div><div className="empty-text">Занятий нет</div></div>}
      {events.map((ev, i) => {
        const canMark = isPast && (isAdmin || (myTeacherName && (ev.teachersList || []).some(t => t.name === myTeacherName)))
        const presentCount = ev.students.filter(s => attendance[`${s.id}_${ev.dirId}_${ev.groupId || 0}`]).length
        const isCalendar = ev.enrollmentType === 'calendar'
        const isClientDays = ev.enrollmentType === 'client_days'
        const enrollKey = `${ev.dirId}_${ev.groupId || 0}`
        const maxSlot = ev.maxPerSlot || 0
        const isSlotFull = maxSlot > 0 && ev.students.length >= maxSlot

        // ── Учёт работы педагогов ──
        const wkey = enrollKey
        const cands = ev.teachersList || []
        const hourly = ev.paymentType === 'per_hour'
        const defaultHours = Math.round((ev.durationMin / 60) * 10) / 10
        const savedMap = savedWork[wkey]
        const prefillMap = lastWork[wkey]?.rows
        const isNoWork = !!noWork[wkey]
        let shown = work[wkey]
        let isPrefill = false
        // Помечено «никто не работал» — состав по прошлому занятию не предлагаем
        if (isNoWork) { shown = shown || {}; }
        else if (!shown) {
          if (prefillMap && Object.keys(prefillMap).length) { shown = prefillMap; isPrefill = true }
          else if (cands.length === 1) { shown = { [cands[0].id]: hourly ? defaultHours : 1 }; isPrefill = true }
          else shown = {}
        }
        const workDirty = JSON.stringify(shown) !== JSON.stringify(savedMap || {})
        const setWorkFor = (m) => setWork(p => ({ ...p, [wkey]: m }))
        const toggleWorker = (tid) => {
          const m = { ...shown }
          if (m[tid] !== undefined) delete m[tid]
          else m[tid] = hourly ? defaultHours : 1
          setWorkFor(m)
        }
        // Крестик у имени убирает педагога СРАЗУ, без «Подтвердить».
        // Клик по имени только меняет состав на экране — снятие через
        // него приходилось отдельно сохранять, и это было неочевидно
        const removeWorker = (tid) => {
          const m = { ...shown }
          delete m[tid]
          setWorkFor(m)
          saveWork(wkey, ev.dirId, ev.groupId, m)
        }
        return (
          <div key={i} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'10px 14px', background:ev.color+'22', borderRadius:12, borderLeft:`4px solid ${ev.color}` }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{ev.name}</div>
                <div style={{ fontSize:12, color:T.muted }}>
                  🕐 {ev.time} · ⏱ {ev.duration}
                  {(ev.teachersList || []).length > 0 && ` · 👩‍🏫 ${ev.teachersList.map(t => t.name).join(', ')}`}
                </div>
                {/* Ответы на напоминание бота. Молчунов считаем «придёт»,
                    поэтому строка появляется, только если кто-то ответил —
                    иначе она висела бы «✅0 ❌0» и читалась как тревога */}
                {(() => {
                  const marks = ev.students.map(s => confirms[`${s.id}_${ev.dirId}_${ev.groupId || 0}`])
                  const yes = marks.filter(m => m === 'confirmed').length
                  const no = marks.filter(m => m === 'declined').length
                  if (!yes && !no) return null
                  return (
                    <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                      {yes > 0 && <span style={{ color:T.greenDark, fontWeight:700 }}>✅ {yes} подтвердил{yes === 1 ? '' : 'и'}</span>}
                      {yes > 0 && no > 0 && ' · '}
                      {no > 0 && <span style={{ color:T.red, fontWeight:700 }}>❌ {no} не придёт</span>}
                    </div>
                  )
                })()}
              </div>
              {isCalendar ? (
                <span className={`badge ${maxSlot > 0 && ev.students.length >= maxSlot ? 'badge-red' : ev.students.length > 0 ? 'badge-green' : 'badge-gray'}`}>
                  📅 {ev.students.length}{maxSlot > 0 ? `/${maxSlot}` : ''} зап.
                </span>
              ) : (
                <span className={`badge ${isSlotFull ? 'badge-orange' : 'badge-green'}`}>
                  {presentCount}/{ev.students.length}{maxSlot > 0 ? ` из ${maxSlot}` : ''}
                </span>
              )}
            </div>
            {isAdmin && cands.length > 0 && (
              <div style={{ background:T.cream, borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                  👩‍🏫 Кто работал{hourly ? ' и сколько часов' : ''}
                </div>
                {isPrefill && (
                  <div style={{ fontSize:11, color:'#c47a00', background:'#fff4e6', borderRadius:8, padding:'6px 10px', marginBottom:8, fontWeight:600, lineHeight:1.4 }}>
                    Это предложение по прошлому занятию — в журнале пока пусто.
                    Нажмите «Подтвердить», чтобы записать.
                  </div>
                )}
                {isNoWork && (
                  <div style={{ fontSize:11, color:T.muted, background:'white', border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 10px', marginBottom:8, fontWeight:600, lineHeight:1.4 }}>
                    Занятие не состоялось — никто не работал. Отметьте педагога, чтобы снять пометку.
                  </div>
                )}
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {cands.map(t => {
                    const on = shown[t.id] !== undefined
                    return (
                      <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <div style={{
                          display:'inline-flex', alignItems:'center', gap:2,
                          borderRadius:20, fontSize:12, fontWeight:700,
                          // Предложенный состав рисуем пунктиром и бледным:
                          // раньше он выглядел точно как записанный, и снятая
                          // отметка «возвращалась» при повторном открытии дня
                          background: on ? (isPrefill ? ev.color + '22' : ev.color) : 'white',
                          color: on ? (isPrefill ? ev.color : 'white') : T.muted,
                          border: `1.5px ${on && isPrefill ? 'dashed' : 'solid'} ${on ? ev.color : T.border}`,
                        }}>
                          <span onClick={() => toggleWorker(t.id)}
                            style={{ padding: on ? '5px 4px 5px 12px' : '5px 12px', cursor:'pointer' }}>
                            {on ? (isPrefill ? '' : '✓ ') : ''}{t.name}
                          </span>
                          {on && (
                            <span onClick={() => removeWorker(t.id)} title="Убрать педагога"
                              style={{ padding:'5px 10px 5px 4px', cursor:'pointer', opacity:0.75, fontSize:13, lineHeight:1 }}>✕</span>
                          )}
                        </div>
                        {on && hourly && (
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input type="number" step="0.5" min="0" value={shown[t.id]}
                              onChange={e => setWorkFor({ ...shown, [t.id]: e.target.value })}
                              style={{ width:72, padding:'4px 8px', borderRadius:8, border:`1.5px solid ${T.border}`, fontSize:13, fontFamily:'inherit', outline:'none' }} />
                            <span style={{ fontSize:12, color:T.muted }}>ч.</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {isNoWork && !workDirty ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8 }}>
                    <button className="btn btn-ghost btn-sm" disabled={savingWork === wkey}
                      onClick={() => clearNoWork(wkey, ev.dirId, ev.groupId)}>
                      ↩ Снять пометку
                    </button>
                  </div>
                ) : workDirty ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, flexWrap:'wrap' }}>
                    {/* Сняли всех — это уже не подтверждение состава,
                        а удаление записи. Кнопка должна говорить об этом
                        прямо, иначе непонятно, что снятие надо сохранить */}
                    {Object.keys(shown).length === 0 ? (
                      <button className="btn btn-sm" disabled={savingWork === wkey}
                        onClick={() => saveWork(wkey, ev.dirId, ev.groupId, shown)}
                        style={{ background:'#fde8e8', color:'#c0392b', border:'1.5px solid #e8b4b4', fontWeight:700 }}>
                        {savingWork === wkey ? 'Убираем…' : '✕ Убрать отметку'}
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" disabled={savingWork === wkey}
                        onClick={() => saveWork(wkey, ev.dirId, ev.groupId, shown)}>
                        {savingWork === wkey ? 'Сохраняем…' : '✓ Подтвердить'}
                      </button>
                    )}
                  </div>
                ) : Object.keys(shown).length > 0 ? (
                  <div style={{ fontSize:11, color:T.greenDark, marginTop:8, fontWeight:600 }}>✅ Записано</div>
                ) : (
                  // Пустой журнал без пометки — это «не заполнено».
                  // Даём сказать явно, что занятия не было
                  <button className="btn btn-ghost btn-sm" disabled={savingWork === wkey}
                    onClick={() => markNoWork(wkey, ev.dirId, ev.groupId)}
                    style={{ marginTop:8, fontSize:11, color:T.muted }}>
                    {savingWork === wkey ? 'Отмечаем…' : '🚫 Никто не работал'}
                  </button>
                )}
              </div>
            )}
            {isCalendar && ev.students.length === 0 && (
              <div style={{ fontSize:13, color:T.muted, padding:'8px 14px' }}>Нет записавшихся на этот день</div>
            )}
            {!isCalendar && ev.students.length === 0 && <div style={{ fontSize:13, color:T.muted, padding:'8px 14px' }}>{isClientDays ? 'В этот день никто не ходит' : 'Нет учеников'}</div>}
            {ev.students.map(s => {
              const key = `${s.id}_${ev.dirId}_${ev.groupId || 0}`
              const present = attendance[key]
              // Родитель предупредил, что не придут. Ребёнка НЕ убираем:
              // педагог должен видеть, кого не будет, а если тот всё же
              // придёт — отметить его надо в один клик, без возни
              const cf = confirms[key]
              return (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:`1px solid ${T.border}`, opacity: cf === 'declined' && !present ? 0.55 : 1 }}>
                  <div className="avatar" style={{ background:hashColor(s.child_name), width:30, height:30, fontSize:12 }}>{(s.child_name||'?')[0]}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                      <span style={{ textDecoration: cf === 'declined' && !present ? 'line-through' : 'none' }}>{s.child_name}</span>
                      {cf === 'confirmed' && <span title="Родитель подтвердил в боте" style={{ fontSize:11 }}>✅</span>}
                      {cf === 'declined' && <span title="Родитель предупредил, что не придут" style={{ fontSize:11 }}>❌</span>}
                      {s._oneOff && <span style={{ background:'#e0e7ff', color:'#4338ca', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:700 }}>разово</span>}
                    </div>
                    <div style={{ fontSize:11, color:T.muted }}>{s.adult_name}</div>
                  </div>
                  {isClientDays ? (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => toggle(s.id, ev.dirId, ev)} style={{
                        padding:'5px 14px', borderRadius:10, border:'none',
                        cursor: canMark ? 'pointer' : 'not-allowed',
                        fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:12,
                        background: present ? T.greenBg : isPast ? T.redLight : '#f5f5f0',
                        color: present ? T.greenDark : isPast ? T.red : T.muted,
                        opacity: canMark ? 1 : 0.55,
                      }}>{present ? '✅ Пришёл' : '❌ Отсутствует'}</button>
                      {s._oneOff && (
                        <button onClick={() => cancelEnroll(s.id, ev.dirId)} style={{ padding:'5px 10px', borderRadius:10, border:'none', cursor:'pointer', background:'#fde8e8', color:'#e05a5a', fontSize:12, fontWeight:700 }}>✕</button>
                      )}
                    </div>
                  ) : isCalendar ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggle(s.id, ev.dirId, ev)} style={{
                        padding:'5px 14px', borderRadius:10, border:'none',
                        cursor: 'pointer',
                        fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:12,
                        background: present ? T.greenBg : '#f5f5f0',
                        color: present ? T.greenDark : T.muted,
                      }}>{present ? '✅ Пришёл' : '❌ Отсутствует'}</button>
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

            {/* Кнопка записи (на даты / разовая в «чужой» день) */}
            {(isCalendar || isClientDays) && isAdmin && (
              <div style={{ padding:'8px 14px' }}>
                {enrolling === enrollKey ? (
                  <div>
                    <input className="form-input" autoFocus placeholder="Поиск клиента..."
                      value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)}
                      style={{ marginBottom: 8 }} />
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }}>
                      {clients
                        .filter(c => c.child_name?.toLowerCase().includes(enrollSearch.toLowerCase()) && !ev.students.find(s => s.id === c.id))
                        .slice(0, 10)
                        .map(c => (
                          <div key={c.id} onClick={() => enroll(c.id, ev.dirId, ev.groupId)}
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
                  <button className="btn btn-outline btn-sm" onClick={() => setEnrolling(enrollKey)}
                    disabled={isSlotFull}>
                    {isSlotFull
                      ? '🔒 Мест нет'
                      : isClientDays ? '+ Разовая запись' : '+ Записать клиента'}
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
              <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>{DAYS_SHORT[date.getDay()]}</div>
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
                  {height > 44 && (ev.teachersList || []).length > 0 && (
                    <div style={{ fontSize:9, color:ev.color+'99', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      👩‍🏫 {ev.teachersList.length === 1 ? ev.teachersList[0].name : `${ev.teachersList.length} педагога`}
                    </div>
                  )}
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

export default function CalendarPage({ directions, clients, teachers, addresses = [], clientStatuses = [], staff, role, reload, studioId, features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
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
        .select('*').eq('studio_id', studioId).gte('date', from).lte('date', to)
      if (data) setEnrollments(data)
    }
    if (studioId) loadEnrollments()
  }, [studioId])

  const isAdmin = role === 'Директор' || role === 'Администратор'
  const myTeacher = teachers.find(t => t.name === staff?.name) || null
  const myTeacherName = myTeacher?.name || null
  const effectiveTeacher = !isAdmin && myTeacher ? String(myTeacher.id) : filterTeacher
  const filterDir = filterDirs // pass array directly

  // Снятие направления снимает и его подгруппы — иначе в фильтре остаётся
  // подгруппа выключенного направления и сетка молча пустеет
  const toggleDir = (id) => {
    const sid = String(id)
    const groups = (directions.find(d => d.id === id)?.groups || []).map(g => String(g.id))
    setFilterDirs(prev => {
      if (prev.includes(sid)) {
        setFilterGroups(fg => fg.filter(gid => !groups.includes(gid)))
        return prev.filter(x => x !== sid)
      }
      return [...prev, sid]
    })
  }
  const toggleGroup = (id) => {
    const sid = String(id)
    setFilterGroups(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  }

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

  // Кто вообще попадает в расписание — решает галочка in_schedule
  // справочника статусов. Фильтруем ОДИН раз здесь и передаём готовый
  // список вниз: и в сетку, и в модалку дня, и в фильтр «Все дети».
  // Так ушедший ребёнок исчезает разом отовсюду, включая разовые
  // записи на занятие, где проверки статуса не было вовсе.
  const statusIdx = useMemo(() => statusIndex(clientStatuses), [clientStatuses])
  const scheduleClients = useMemo(
    () => clients.filter(c => inSchedule(statusIdx, c.status)),
    [clients, statusIdx]
  )

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
      {/* Панель управления — одна строка на десктопе, переносится сама */}
      <div style={{ background:'white', borderRadius:16, border:`1px solid ${T.border}`, padding:'8px 12px', marginBottom:10,
        display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

        {/* Вид + навигация. Заголовок больше не растягивается на всю ширину —
            из-за flex:1 месяц и стрелки разъезжались по краям экрана */}
        <div className="tabs" style={{ marginBottom:0 }}>
          {[['month','Месяц'],['week','Неделя'],['day','День']].map(([v,l]) => (
            <button key={v} className={`tab ${view===v?'active':''}`} onClick={() => setView(v)} style={{ padding:'5px 10px', fontSize:13 }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => navigate(-1)}>←</button>
          <span style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:14, textAlign:'center', minWidth:120, whiteSpace:'nowrap' }}>{getTitle()}</span>
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => navigate(1)}>→</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday} style={{ fontSize:12 }}>Сегодня</button>
        </div>

        <span style={{ width:1, alignSelf:'stretch', background:T.border, margin:'0 2px' }} />

        {isAdmin && features.teachers && (
          <select style={selectStyle} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
            <option value="all">👩‍🏫 Все педагоги</option>
            {teachers.map(t => <option key={t.id} value={String(t.id)}>{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0] || ''}.</option>)}
          </select>
        )}
        <select style={selectStyle} value={filterChild} onChange={e => setFilterChild(e.target.value)}>
          <option value="all">👨‍👧 Все дети</option>
          {scheduleClients.map(c => <option key={c.id} value={String(c.id)}>{c.child_name}</option>)}
        </select>
        {addresses.length > 0 && features.addresses && (
          <select style={selectStyle} value={filterAddress} onChange={e => setFilterAddress(e.target.value)}>
            <option value="all">📍 Все адреса</option>
            {addresses.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        )}
        <button className="btn btn-sm" onClick={() => setOnlyWithStudents(v => !v)}
          title="Показывать только занятия, на которые кто-то записан"
          style={{ fontSize:11, padding:'5px 8px', whiteSpace:'nowrap', background: onlyWithStudents ? T.green : T.cream, color: onlyWithStudents ? 'white' : T.muted, border: `1.5px solid ${onlyWithStudents ? T.green : T.border}` }}>
          👥 {onlyWithStudents ? 'С учениками ✓' : 'С учениками'}
        </button>

        {/* Цвет занятий — нужен редко, поэтому две иконки вместо двух подписей */}
        {addresses.length > 0 && features.addresses && (
          <div style={{ display:'flex', alignItems:'center', gap:2 }}>
            <div className="tabs" style={{ marginBottom:0 }}>
              <button className={`tab ${colorMode === 'direction' ? 'active' : ''}`} onClick={() => setColorMode('direction')} style={{ fontSize:13, padding:'4px 9px' }} title="Цвет по направлениям">🎯</button>
              <button className={`tab ${colorMode === 'address' ? 'active' : ''}`} onClick={() => setColorMode('address')} style={{ fontSize:13, padding:'4px 9px' }} title="Цвет по адресам">📍</button>
            </div>
            <Hint text="Чем красить занятия в сетке: 🎯 цветом направления или 📍 цветом адреса. Занятия без адреса в режиме адресов серые." />
          </div>
        )}

        {(filterDirs.length > 0 || filterGroups.length > 0 || filterTeacher !== 'all' || filterChild !== 'all' || filterAddress !== 'all' || onlyWithStudents) && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => { setFilterDirs([]); setFilterGroups([]); setFilterTeacher('all'); setFilterChild('all'); setFilterAddress('all'); setOnlyWithStudents(false) }}>✕ Сбросить</button>
        )}

        {view !== 'month' && (
          <span style={{ fontSize:11, color:T.muted, marginLeft:'auto', whiteSpace:'nowrap' }}>
            Нажмите на занятие, чтобы отметить посещаемость
          </span>
        )}
      </div>

      {/* Фильтр по направлениям — лентой сразу под панелью */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start', marginBottom:14 }}>
        {directions.filter(d => !d.archived_at).map(d => {
          const active = filterDirs.includes(String(d.id))
          const color = d.color || DEFAULT_COLOR
          const cnt = scheduleClients.filter(c => (c.direction_ids||[]).includes(d.id)).length
          // По порядку сортировки, затем по названию: подгруппы теперь
          // называются временем, и «10:00» должно идти раньше «19:00»,
          // а не так, как их вернула база
          const groups = [...(d.groups || [])].sort((a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
          return (
            <div key={d.id} style={{ display:'flex', flexDirection:'column' }}>
              <button onClick={() => toggleDir(d.id)}
                style={{
                  display:'flex', alignItems:'center', gap:7, padding:'6px 12px', borderRadius:10,
                  border:`1.5px solid ${active ? color : T.border}`,
                  background: active ? color+'18' : 'white', cursor:'pointer',
                  fontFamily:'Nunito Sans,sans-serif', fontSize:13, fontWeight: active ? 700 : 600,
                  color: active ? T.ink : T.muted, whiteSpace:'nowrap',
                }}>
                <span style={{ width:9, height:9, borderRadius:'50%', background:color, flexShrink:0 }} />
                {d.name}
                <span style={{ fontSize:11, color:T.muted, fontWeight:400 }}>{cnt}</span>
              </button>
              {active && groups.length > 1 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:5, paddingLeft:4 }}>
                  {groups.map(g => {
                    const gOn = filterGroups.includes(String(g.id))
                    return (
                      <button key={g.id} onClick={() => toggleGroup(g.id)}
                        style={{
                          padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight: gOn ? 700 : 600,
                          border:`1px solid ${gOn ? color : T.border}`,
                          background: gOn ? color+'22' : 'white', color: gOn ? T.ink : T.muted, cursor:'pointer',
                        }}>
                        {g.name || 'Без названия'}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {(filterDirs.length > 0 || filterGroups.length > 0) && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }} onClick={() => { setFilterDirs([]); setFilterGroups([]) }}>✕ Все</button>
        )}
      </div>

      {/* Views */}
      {view === 'month' && (
        <MonthView
          year={currentDate.getFullYear()} month={currentDate.getMonth()}
          directions={directions} clients={scheduleClients} teachers={teachers}
          filterDir={filterDir} filterTeacher={effectiveTeacher} filterChild={filterChild}
          onDayClick={handleDayClick} onlyWithStudents={onlyWithStudents}
          filterAddress={filterAddress} colorMode={colorMode} addresses={addresses}
          filterGroups={filterGroups} enrollments={enrollments}
        />
      )}

      {(view === 'week' || view === 'day') && (
        <TimeGrid
          dates={view === 'week' ? weekDates : [currentDate]}
          directions={directions} clients={scheduleClients} teachers={teachers}
          filterDir={filterDir} filterTeacher={effectiveTeacher} filterChild={filterChild}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onDayClick={handleDayClick} onlyWithStudents={onlyWithStudents}
          filterAddress={filterAddress} colorMode={colorMode} addresses={addresses}
          filterGroups={filterGroups} enrollments={enrollments}
        />
      )}


      {/* Attendance modal */}
      {selectedDay && (
        <DayModal
          date={selectedDay}
          events={getEventsForDate(selectedDay, directions, scheduleClients, filterDir, effectiveTeacher, filterChild, teachers, filterAddress, colorMode, addresses, filterGroups, enrollments)}
          teachers={teachers}
          clients={scheduleClients}
          studioId={studioId}
          onClose={(changed) => {
            setSelectedDay(null)
            // Если внутри что-то отмечали — обновляем списки клиентов (баланс, посещения)
            if (changed) reload && reload()
            // Перезагружаем enrollments чтобы обновить счётчик в календаре
            const from = dateStr(addDays(new Date(), -60))
            const to = dateStr(addDays(new Date(), 60))
            supabase.from('enrollments').select('*')
              .eq('studio_id', studioId).gte('date', from).lte('date', to)
              .then(({ data }) => { if (data) setEnrollments(data) })
          }}
          isAdmin={isAdmin} myTeacherName={myTeacherName}
          onAttendanceChange={() => {}}
        />
      )}
    </div>
  )
}