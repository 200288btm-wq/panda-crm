import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const TG_TOKEN = import.meta.env.VITE_TG_TOKEN
const TG_CHAT_IDS = (import.meta.env.VITE_TG_CHAT_IDS || '').split(',').filter(Boolean)
const VK_TOKEN = import.meta.env.VITE_VK_TOKEN
const VK_PEER_IDS = (import.meta.env.VITE_VK_PEER_ID || '').split(',').filter(Boolean)

const sendTelegram = async (text) => {
  if (!TG_TOKEN || !TG_CHAT_IDS.length) return
  for (const chatId of TG_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId.trim(), text, parse_mode: 'HTML' }),
      })
    } catch (e) { console.error('TG error', e) }
  }
}

const sendVK = async (text) => {
  if (!VK_TOKEN || !VK_PEER_IDS.length) return
  for (let i = 0; i < VK_PEER_IDS.length; i++) {
    try {
      const params = new URLSearchParams({
        peer_id: VK_PEER_IDS[i].trim(),
        message: text,
        random_id: Date.now() + i,
        access_token: VK_TOKEN,
        v: '5.131',
      })
      await fetch(`https://api.vk.com/method/messages.send?${params}`)
    } catch (e) { console.error('VK error', e) }
  }
}

const DOW_NAMES = ['вс','пн','вт','ср','чт','пт','сб']
const MONTH_NAMES = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь']
const MONTH_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

const DAY_TO_DOW = { 'Пн':1, 'Вт':2, 'Ср':3, 'Чт':4, 'Пт':5, 'Сб':6, 'Вс':0 }
const DOW_TO_DAY = { 0:'Вс', 1:'Пн', 2:'Вт', 3:'Ср', 4:'Чт', 5:'Пт', 6:'Сб' }

// Расписание хранится строкой вида «Пн/Ср 17:30, Сб 13:00»
function parseScheduleDows(schedule) {
  if (!schedule) return []
  // Старый формат — объект { mon: '10:00', ... }
  if (typeof schedule === 'object') {
    const map = { mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:0 }
    return Object.entries(map).filter(([k]) => schedule[k]).map(([, v]) => v)
  }
  const dows = []
  String(schedule).split(',').forEach(part => {
    const m = part.trim().match(/^([А-Яа-я/]+)\s+\d{1,2}:\d{2}/)
    if (m) m[1].split('/').forEach(d => {
      const dow = DAY_TO_DOW[d.trim()]
      if (dow !== undefined && !dows.includes(dow)) dows.push(dow)
    })
  })
  return dows
}

// Дни недели направления: из подгрупп, если они есть, иначе из самого направления
function getScheduleDays(direction, groups = []) {
  const subs = groups.filter(g => g.direction_id === direction.id)
  const sources = subs.length ? subs.map(g => g.schedule || direction.schedule) : [direction.schedule]
  const all = []
  sources.forEach(src => parseScheduleDows(src).forEach(d => { if (!all.includes(d)) all.push(d) }))
  return all.sort()
}

export default function BookingPage() {
  const [settings, setSettings] = useState(null)
  const [directions, setDirections] = useState([])
  const [bookedDates, setBookedDates] = useState({}) // date → count
  const [groups, setGroups] = useState([])           // подгруппы со своим расписанием
  const [leadsByDir, setLeadsByDir] = useState([])   // заявки, которые тоже занимают места
  const [occupancy, setOccupancy] = useState(null)   // дата → занято мест, считает база
  const [teachers, setTeachers] = useState([])       // педагоги — источник правды их карточки
  const [step, setStep] = useState(1) // 1: выбор программы, 2: выбор даты, 3: форма, 4: успех
  const [selectedDir, setSelectedDir] = useState(null)
  const [selectedDates, setSelectedDates] = useState([]) // массив выбранных дат
  const [calMonth, setCalMonth] = useState(new Date())
  const [form, setForm] = useState({ name:'', parent_name:'', phone:'', age:'', contact_way:'', comment:'' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadAll() }, [])

  // Занятость считает база — так на публичную страницу не попадают данные клиентов
  useEffect(() => {
    if (!selectedDir || !settings) { setOccupancy(null); return }
    if ((settings.capacity_mode || 'schedule') !== 'schedule') { setOccupancy(null); return }
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const from = new Date(); from.setDate(from.getDate() + (settings.booking_offset_days || 0))
    const to = new Date(); to.setDate(to.getDate() + (settings.booking_window_days || 30))
    supabase.rpc('booking_occupancy', {
      p_direction_id: selectedDir.id, p_from: iso(from), p_to: iso(to),
    }).then(({ data, error }) => {
      if (error) { console.warn('booking_occupancy:', error.message); setOccupancy(null); return }
      const map = {}
      ;(data || []).forEach(r => { map[r.day] = r.taken })
      setOccupancy(map)
    })
  }, [selectedDir?.id, settings])

  const loadAll = async () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const horizon = new Date(); horizon.setDate(horizon.getDate() + 120)
    const horizonIso = horizon.toISOString().slice(0, 10)

    const [{ data: s }, { data: d }, { data: leads }, { data: g }, { data: th }] = await Promise.all([
      supabase.from('booking_settings').select('*').eq('id', 1).single(),
      supabase.from('directions').select('*').order('id'),
      supabase.from('leads').select('desired_date, squad').not('desired_date', 'is', null),
      supabase.from('direction_groups').select('id, direction_id, schedule'),
      supabase.from('teachers').select('id, name, status, direction_ids'),
    ])
    setGroups(g || [])
    setLeadsByDir(leads || [])
    setTeachers((th || []).filter(t => t.status !== 'Уволен'))
    setSettings(s)
    if (s && d) {
      const ids = s.directions || []
      setDirections(d.filter(x => ids.includes(x.id)))
    }
    // Считаем сколько записей на каждую дату
    const counts = {}
    for (const l of (leads || [])) {
      if (l.desired_date) counts[l.desired_date] = (counts[l.desired_date] || 0) + 1
    }
    setBookedDates(counts)
  }

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { setError('Укажите имя ребёнка'); return }
    if (!form.phone.trim()) { setError('Укажите телефон'); return }
    setSubmitting(true); setError(null)

    const payload = {
      child_name: form.name.trim(),
      parent_name: form.parent_name.trim() || null,
      parent_phone: form.phone.trim(),
      child_age: form.age.trim() || null,
      notes: [
        form.contact_way ? `Связь: ${form.contact_way}` : '',
        form.comment || '',
      ].filter(Boolean).join(' | ') || null,
      source: 'studio',
      status: 'new',
      squad: selectedDir?.name || null,
      desired_date: selectedDates[0] || null,
      dates: selectedDates.length > 1 ? selectedDates.map(formatDate).join(', ') : null,
    }

    const { error: dbErr } = await supabase.from('leads').insert(payload)
    if (dbErr) { setError('Ошибка: ' + dbErr.message); setSubmitting(false); return }

    // Telegram уведомление
    const dateStr = selectedDates.length > 0 ? formatDate(selectedDates[0]) : 'не выбрана'
    await sendTelegram([
      `📅 <b>НОВАЯ ОНЛАЙН-ЗАПИСЬ</b>`,
      ``,
      `👧 <b>${form.name.trim()}</b>${form.age ? `, ${form.age}` : ''}`,
      form.parent_name ? `👩 Родитель: ${form.parent_name}` : '',
      `📞 ${form.phone}`,
      selectedDir ? `🎯 Программа: ${selectedDir.name}` : '',
      selectedDates.length > 1 ? `📆 Желаемые даты: ${selectedDates.map(formatDate).join(', ')}` : `📆 Желаемая дата: ${dateStr}`,
      form.contact_way ? `💬 Способ связи: ${form.contact_way}` : '',
      form.comment ? `💭 Комментарий: ${form.comment}` : '',
      ``,
      `→ Открыть CRM: https://panda-crm.vercel.app`,
    ].filter(Boolean).join('\n'))

    // ВКонтакте — тот же текст без HTML-тегов
    await sendVK([
      `📅 НОВАЯ ОНЛАЙН-ЗАПИСЬ`,
      ``,
      `👧 ${form.name.trim()}${form.age ? `, ${form.age}` : ''}`,
      form.parent_name ? `👩 Родитель: ${form.parent_name}` : '',
      `📞 ${form.phone}`,
      selectedDir ? `🎯 Программа: ${selectedDir.name}` : '',
      selectedDates.length > 1 ? `📆 Желаемые даты: ${selectedDates.map(formatDate).join(', ')}` : `📆 Желаемая дата: ${dateStr}`,
      form.contact_way ? `💬 Способ связи: ${form.contact_way}` : '',
      form.comment ? `💭 Комментарий: ${form.comment}` : '',
      ``,
      `→ CRM: https://panda-crm.vercel.app`,
    ].filter(Boolean).join('\n'))

    setSubmitting(false)
    setStep(4)
  }

  if (!settings) return (
    <div style={{ minHeight:'100vh', background:'#F0EDD8', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#6b7280' }}>
        
        <div>Загрузка...</div>
      </div>
    </div>
  )

  if (!settings.is_active) return (
    <div style={{ minHeight:'100vh', background:'#F0EDD8', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', maxWidth:360, padding:32 }}>
        
        <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:22, marginBottom:8 }}>Запись временно недоступна</div>
        <div style={{ color:'#6b7280', fontSize:15 }}>Пожалуйста, свяжитесь с нами напрямую для записи на занятие</div>
      </div>
    </div>
  )

  const G = '#7BAF8E'
  const now = new Date()
  const minDate = new Date(now); minDate.setDate(now.getDate() + (settings.booking_offset_days || 0))
  const maxDate = new Date(now); maxDate.setDate(now.getDate() + (settings.booking_window_days || 30))
  minDate.setHours(0,0,0,0); maxDate.setHours(23,59,59,999)

  // Дни недели для выбранной программы
  const scheduleDays = selectedDir ? getScheduleDays(selectedDir, groups) : []

  // Строим календарь
  const year = calMonth.getFullYear(), month = calMonth.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const offset = (firstDow + 6) % 7 // Пн=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(offset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))

  const isDayAvailable = (day) => {
    const d = new Date(year, month, day); d.setHours(12,0,0,0)
    if (d < minDate || d > maxDate) return false
    const dow = d.getDay()
    if (scheduleDays.length > 0 && !scheduleDays.includes(dow)) return false
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`

    // Режим «свой лимит на день» — как было раньше, по числу заявок
    if ((settings.capacity_mode || 'schedule') === 'manual') {
      return (bookedDates[ds] || 0) < (settings.max_per_slot || 10)
    }
    // Режим «сверять с расписанием»
    if (!selectedDir) return true
    const limit = selectedDir.max_per_slot || 0
    if (limit <= 0) return true   // лимит в направлении не задан — не ограничиваем
    if (!occupancy) return true   // занятость ещё не пришла — не мешаем записаться
    return (occupancy[ds] || 0) < limit
  }

  const formatDate = (ds) => {
    if (!ds) return ''
    const d = new Date(ds + 'T12:00')
    return `${d.getDate()} ${MONTH_GEN[d.getMonth()]}, ${DOW_NAMES[d.getDay()]}`
  }
  const formatSelectedDates = () => selectedDates.map(formatDate).join(' · ')

  const fields = settings.required_fields || ['name','phone']

  const bgStyle = { minHeight:'100vh', background:'#F0EDD8', fontFamily:'Nunito Sans, sans-serif' }
  const containerStyle = { maxWidth: 560, margin: '0 auto', padding: '20px 16px 60px' }
  const cardStyle = { background:'white', borderRadius:20, padding:'20px 20px', marginBottom:16, boxShadow:'0 2px 12px #0001' }

  // STEP 4: Успех
  if (step === 4) return (
    <div style={bgStyle}>
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign:'center', padding:'48px 24px' }}>
          <div style={{ fontSize:60, marginBottom:16 }}>🎉</div>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:24, marginBottom:12 }}>Вы записаны!</div>
          <div style={{ color:'#6b7280', fontSize:15, lineHeight:1.6, marginBottom:24 }}>
            Мы получили вашу заявку и свяжемся с вами в ближайшее время для подтверждения.
          </div>
          {selectedDates.length > 0 && (
            <div style={{ background:'#F0FDF4', borderRadius:12, padding:'12px 20px', marginBottom:20, fontSize:14, color:'#15803D', fontWeight:700 }}>
              📆 {selectedDates.map(formatDate).join(' · ')}
            </div>
          )}
          <div style={{ fontSize:13, color:'#9ca3af' }}>Академия Панды · Ботанический район, Екатеринбург</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={bgStyle}>
      <div style={containerStyle}>

        {/* Шапка */}
        {settings.cover_url && (
          <div style={{ borderRadius:20, overflow:'hidden', marginBottom:16, maxHeight:200 }}>
            <img src={settings.cover_url} alt="" style={{ width:'100%', objectFit:'cover', display:'block', maxHeight:200 }} />
          </div>
        )}

        <div style={{ textAlign:'center', marginBottom:24 }}>
          
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:22, marginBottom:6 }}>{settings.title}</div>
          {settings.description && <div style={{ color:'#6b7280', fontSize:14, lineHeight:1.6 }}>{settings.description}</div>}
        </div>

        {/* Прогресс */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:24 }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:13,
                background: step > n ? G : step === n ? G : '#e5e7eb',
                color: step >= n ? 'white' : '#9ca3af' }}>
                {step > n ? '✓' : n}
              </div>
              {n < 3 && <div style={{ width:32, height:2, background: step > n ? G : '#e5e7eb', borderRadius:1 }} />}
            </div>
          ))}
        </div>
        <div style={{ textAlign:'center', fontSize:12, color:'#9ca3af', marginBottom:20 }}>
          {step === 1 && 'Шаг 1 — Выберите программу'}
          {step === 2 && 'Шаг 2 — Выберите дату'}
          {step === 3 && 'Шаг 3 — Ваши данные'}
        </div>

        {/* STEP 1: Программа */}
        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:14 }}>Выберите программу</div>
            {directions.length === 0
              ? <div style={{ color:'#9ca3af', fontSize:14, textAlign:'center', padding:'24px 0' }}>Программы временно недоступны</div>
              : directions.map(d => {
                const color = d.color || G
                const days = getScheduleDays(d, groups)
                return (
                  <div key={d.id} onClick={() => { setSelectedDir(d); setSelectedDates([]); setStep(2) }}
                    style={{ border:`2px solid ${color}22`, borderRadius:14, padding:'14px 16px', marginBottom:10,
                      cursor:'pointer', transition:'all 0.15s', background: selectedDir?.id === d.id ? color+'11' : 'white' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = color+'22'}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:12, height:12, borderRadius:'50%', background:color, flexShrink:0 }} />
                      <div style={{ fontWeight:800, fontSize:15, color:'#111' }}>{d.name}</div>
                    </div>
                    {days.length > 0 && (
                      <div style={{ fontSize:12, color:'#6b7280', marginTop:4, marginLeft:22 }}>
                        📅 {days.map(dow => ['вс','пн','вт','ср','чт','пт','сб'][dow]).join(', ')}
                      </div>
                    )}
                    {settings.show_teacher && (() => {
                      const dirTeachers = teachers.filter(t => (t.direction_ids || []).includes(d.id))
                      if (!dirTeachers.length) return null
                      return (
                        <div style={{ fontSize:12, color:'#6b7280', marginTop:2, marginLeft:22 }}>
                          👩‍🏫 {dirTeachers.map(t => t.name).join(', ')}
                        </div>
                      )
                    })()}
                  </div>
                )
              })
            }
          </div>
        )}

        {/* STEP 2: Дата */}
        {step === 2 && (
          <div>
            <div style={cardStyle}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, justifyContent:'space-between' }}>
                <div style={{ fontWeight:800, fontSize:16 }}>Выберите дату</div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                    style={{ width:28, height:28, borderRadius:8, border:`1.5px solid #e5e7eb`, background:'white', cursor:'pointer', fontSize:14 }}>‹</button>
                  <span style={{ fontWeight:700, fontSize:14, minWidth:120, textAlign:'center', textTransform:'capitalize' }}>
                    {MONTH_NAMES[month]} {year}
                  </span>
                  <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                    style={{ width:28, height:28, borderRadius:8, border:`1.5px solid #e5e7eb`, background:'white', cursor:'pointer', fontSize:14 }}>›</button>
                </div>
              </div>

              {/* Дни недели */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:6 }}>
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
                  <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'#9ca3af', padding:'4px 0' }}>{d}</div>
                ))}
              </div>

              {/* Календарь */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />
                  const available = isDayAvailable(day)
                  const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                  const isSelected = selectedDates.includes(ds)
                  const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                  return (
                    <div key={i} onClick={() => {
                      if (!available) return
                      setSelectedDates(prev =>
                        prev.includes(ds) ? prev.filter(x => x !== ds) : [...prev, ds]
                      )
                    }}
                      style={{ aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center',
                        borderRadius:'50%', fontSize:14, fontWeight: isToday ? 900 : 600,
                        cursor: available ? 'pointer' : 'default',
                        background: isSelected ? G : 'transparent',
                        color: isSelected ? 'white' : available ? '#111' : '#d1d5db',
                        border: isToday && !isSelected ? `2px solid ${G}` : '2px solid transparent',
                        transition:'all 0.12s',
                      }}
                      onMouseEnter={e => { if (available && !isSelected) e.currentTarget.style.background = G+'22' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                      {day}
                    </div>
                  )
                })}
              </div>

              {scheduleDays.length > 0 && (
                <div style={{ fontSize:12, color:'#9ca3af', marginTop:12, textAlign:'center' }}>
                  Доступные дни: {scheduleDays.map(d => ['вс','пн','вт','ср','чт','пт','сб'][d]).join(', ')}
                </div>
              )}
              {(settings.capacity_mode || 'schedule') === 'schedule' && selectedDir?.max_per_slot > 0 && (
                <div style={{ fontSize:12, color:'#9ca3af', marginTop:6, textAlign:'center' }}>
                  Дни, где мест уже нет, недоступны для выбора
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setStep(1)} style={{ flex:1, padding:'14px', borderRadius:14, border:'2px solid #e5e7eb', background:'white', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
                ← Назад
              </button>
              <button onClick={() => setStep(3)} disabled={selectedDates.length === 0}
                style={{ flex:2, padding:'14px', borderRadius:14, border:'none', background: selectedDates.length ? G : '#e5e7eb',
                  color: selectedDates.length ? 'white' : '#9ca3af', fontWeight:800, fontSize:15, cursor: selectedDates.length ? 'pointer' : 'default', fontFamily:'inherit', transition:'all 0.15s' }}>
                {selectedDates.length
                  ? `Далее → ${selectedDates.length > 1 ? selectedDates.length + ' дней' : formatDate(selectedDates[0])}`
                  : 'Выберите даты'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Форма */}
        {step === 3 && (
          <div>
            <div style={cardStyle}>
              <div style={{ fontWeight:800, fontSize:16, marginBottom:4 }}>Ваши данные</div>
              {selectedDates.length > 0 && (
                <div style={{ background:'#F0FDF4', borderRadius:10, padding:'8px 14px', marginBottom:14, fontSize:13, color:'#15803D', fontWeight:600 }}>
                  📆 {selectedDates.length > 1 ? selectedDates.map(formatDate).join(' · ') : formatDate(selectedDates[0])} · {selectedDir?.name}
                </div>
              )}

              {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#B91C1C' }}>{error}</div>}

              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Имя ребёнка *</label>
                  <input style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:16, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                    value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Имя" />
                </div>
                {fields.includes('parent_name') && (
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Имя родителя</label>
                    <input style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:16, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                      value={form.parent_name} onChange={e => setF('parent_name', e.target.value)} placeholder="Ваше имя" />
                  </div>
                )}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Телефон *</label>
                  <input style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:16, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                    value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+7..." type="tel" />
                </div>
                {fields.includes('age') && (
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Возраст ребёнка</label>
                    <input style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:16, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                      value={form.age} onChange={e => setF('age', e.target.value)} placeholder="5 лет" />
                  </div>
                )}
                {fields.includes('contact_way') && (
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Удобный способ связи</label>
                    <select style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:16, fontFamily:'inherit', outline:'none', background:'white', boxSizing:'border-box' }}
                      value={form.contact_way} onChange={e => setF('contact_way', e.target.value)}>
                      <option value="">Не важно</option>
                      <option>WhatsApp</option>
                      <option>Telegram</option>
                      <option>ВКонтакте</option>
                      <option>Звонок</option>
                      <option>СМС</option>
                    </select>
                  </div>
                )}
                {fields.includes('comment') && (
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Комментарий</label>
                    <textarea style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontSize:15, fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.5, boxSizing:'border-box' }}
                      value={form.comment} onChange={e => setF('comment', e.target.value)} placeholder="Вопросы, пожелания..." rows={3} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setStep(2)} style={{ flex:1, padding:'14px', borderRadius:14, border:'2px solid #e5e7eb', background:'white', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
                ← Назад
              </button>
              <button onClick={submit} disabled={submitting}
                style={{ flex:2, padding:'14px', borderRadius:14, border:'none', background: G, color:'white',
                  fontWeight:800, fontSize:15, cursor: submitting ? 'default' : 'pointer', fontFamily:'inherit', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Отправляем...' : '✅ Записаться'}
              </button>
            </div>

            <div style={{ fontSize:11, color:'#9ca3af', textAlign:'center', marginTop:12 }}>
              Нажимая «Записаться», вы соглашаетесь на обработку персональных данных
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
