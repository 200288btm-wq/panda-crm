import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt, hashColor, STATUS_COLORS, STATUSES } from '../styles.jsx'
import { Modal } from '../components/Modal'

const DEFAULT_COLOR = '#7BAF8E'

const calcBalance = (paid, visited) => {
  const p = +paid || 0
  const v = +visited || 0
  const left = p - v
  if (left <= 0) return { left, status: 'debt', label: 'Требуется оплата', color: '#e05a5a', bg: '#fde8e8' }
  if (left === 1) return { left, status: 'warn', label: 'Последнее занятие', color: '#c47a00', bg: '#fff4e6' }
  return { left, status: 'ok', label: `Осталось ${left} зан.`, color: '#5a9070', bg: '#e8f4ed' }
}

const calcAge = (birthday) => {
  if (!birthday) return null
  const b = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

// Парсинг дней недели из расписания "Пн/Ср 17:30, Сб 13:00"
const parseDaysFromSchedule = (schedule) => {
  if (!schedule) return []
  const days = []
  const DAY_KEYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  schedule.split(',').forEach(part => {
    const m = part.trim().match(/^([А-Яа-я/]+)\s+\d{1,2}:\d{2}/)
    if (m) m[1].split('/').forEach(d => {
      const day = d.trim()
      if (DAY_KEYS.includes(day) && !days.includes(day)) days.push(day)
    })
  })
  return DAY_KEYS.filter(d => days.includes(d))
}

function ClientModal({ client, directions, onClose, onSave, statuses = ['Новый', 'Активен', 'Временно отсутствует', 'Неактивен', 'Негатив', 'Отказ', 'Ожидание'] }) {
  const [f, setF] = useState(client ? {
    child_name: client.child_name || '',
    adult_name: client.adult_name || '',
    status: client.status || 'Новый',
    contacts: client.contacts || [{ type: 'Телефон', val: '' }],
    start_date: client.start_date || '',
    source: client.source || '',
    birthday: client.birthday || '',
    sex: client.sex || 'М',
    direction_ids: client.direction_ids || [],
    weekly_schedule: client.weekly_schedule || {},
    paid_lessons: client.paid_lessons || 0,
    visited_lessons: client.visited_lessons || 0,
    balance: client.balance || 0,
    discount: client.discount || 0,
    comment: client.comment || '',
  } : { child_name: '', adult_name: '', status: 'Новый', contacts: [{ type: 'Телефон', val: '' }], start_date: '', source: '', birthday: '', sex: 'М', direction_ids: [], weekly_schedule: {}, paid_lessons: 0, visited_lessons: 0, balance: 0, discount: 0, comment: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const age = calcAge(f.birthday)

  // Направления формата "по дням клиента" среди выбранных
  const clientDayDirs = directions.filter(d =>
    (f.direction_ids || []).includes(d.id) && d.enrollment_type === 'client_days'
  )

  // Установить/снять день для направления
  const toggleClientDay = (dirId, day, groupId = null) => {
    const ws = { ...(f.weekly_schedule || {}) }
    const cur = ws[dirId] || { days: [], group_id: groupId }
    const days = cur.days.includes(day) ? cur.days.filter(x => x !== day) : [...cur.days, day]
    ws[dirId] = { days, group_id: groupId ?? cur.group_id ?? null }
    set('weekly_schedule', ws)
  }

  const setClientGroup = (dirId, groupId) => {
    const ws = { ...(f.weekly_schedule || {}) }
    const cur = ws[dirId] || { days: [], group_id: null }
    // При смене подгруппы сбрасываем дни (у подгруппы своё расписание)
    ws[dirId] = { days: [], group_id: groupId }
    set('weekly_schedule', ws)
  }

  return (
    <Modal title={client ? `✏️ ${client.child_name}` : '+ Новый клиент'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Имя ребёнка *</label>
          <input className="form-input" value={f.child_name} onChange={e => set('child_name', e.target.value)} placeholder="Имя Фамилия" />
        </div>
        <div className="form-group"><label className="form-label">Дата рождения</label>
          <input className="form-input" type="date" value={f.birthday} onChange={e => set('birthday', e.target.value)} />
          {age !== null && <div style={{ fontSize: 11, color: T.greenDark, marginTop: 3, fontWeight: 600 }}>👶 {age} лет</div>}
        </div>
      </div>
      <div className="form-group"><label className="form-label">ФИО родителя / взрослого *</label>
        <input className="form-input" value={f.adult_name} onChange={e => set('adult_name', e.target.value)} placeholder="Фамилия Имя Отчество" />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Статус</label>
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="form-group"><label className="form-label">Пол</label>
          <select className="form-input" value={f.sex} onChange={e => set('sex', e.target.value)}><option>М</option><option>Ж</option></select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Дата начала</label>
          <input className="form-input" type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Источник</label>
          <input className="form-input" value={f.source} onChange={e => set('source', e.target.value)} placeholder="ВКонтакте, Авито..." />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Контакт</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-input" style={{ width: 130 }} value={f.contacts[0]?.type} onChange={e => set('contacts', [{ ...f.contacts[0], type: e.target.value }])}>
            <option>Телефон</option><option>Телеграм</option><option>ВКонтакте</option><option>WhatsApp</option>
          </select>
          <input className="form-input" value={f.contacts[0]?.val} onChange={e => set('contacts', [{ ...f.contacts[0], val: e.target.value }])} placeholder="+7 xxx / @login" />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Направления</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {directions.map(d => {
            const on = (f.direction_ids || []).includes(d.id)
            const color = d.color || DEFAULT_COLOR
            return (
              <label key={d.id} onClick={() => {
                const ids = f.direction_ids || []
                set('direction_ids', ids.includes(d.id) ? ids.filter(x => x !== d.id) : [...ids, d.id])
              }} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: on ? color + '22' : '#f5f5f0',
                border: `2px solid ${on ? color : T.border}`,
                color: on ? color : T.muted, fontWeight: 700, fontSize: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {d.name}
                {d.enrollment_type === 'client_days' && <span style={{ fontSize: 10 }}>🗓</span>}
              </label>
            )
          })}
        </div>
      </div>

      {/* Дни посещения для направлений формата "по дням клиента" */}
      {clientDayDirs.map(d => {
        const groups = d.groups || []
        const ws = (f.weekly_schedule || {})[d.id] || { days: [], group_id: null }
        const color = d.color || DEFAULT_COLOR
        // Расписание: из подгруппы если выбрана, иначе из направления
        const selectedGroup = groups.find(g => g.id === ws.group_id)
        const scheduleSource = selectedGroup ? selectedGroup.schedule : d.schedule
        const availableDays = parseDaysFromSchedule(scheduleSource)

        return (
          <div key={d.id} style={{ background: color + '11', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: `1.5px solid ${color}44` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: color, marginBottom: 8 }}>
              🗓 Дни посещения — {d.name}
            </div>

            {/* Выбор подгруппы если есть */}
            {groups.length > 0 && (
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Подгруппа</label>
                <select className="form-input" value={ws.group_id || ''}
                  onChange={e => setClientGroup(d.id, e.target.value ? +e.target.value : null)}>
                  <option value="">— выберите подгруппу —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            {availableDays.length === 0 ? (
              <div style={{ fontSize: 12, color: T.muted }}>
                {groups.length > 0 && !ws.group_id
                  ? 'Сначала выберите подгруппу'
                  : 'В расписании направления не заданы дни. Добавьте их в разделе «Направления».'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Отметьте дни по которым ходит ребёнок:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {availableDays.map(day => {
                    const active = ws.days.includes(day)
                    return (
                      <div key={day} onClick={() => toggleClientDay(d.id, day, ws.group_id)}
                        style={{
                          width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14,
                          background: active ? color : 'white',
                          color: active ? 'white' : T.muted,
                          border: `2px solid ${active ? color : T.border}`,
                        }}>{day}</div>
                    )
                  })}
                </div>
                {ws.days.length > 0 && (
                  <div style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: 8 }}>
                    Выбрано: {ws.days.join(', ')}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
        <strong style={{ color: T.ink }}>📌 Начальные остатки</strong> — заполните если переносите клиента из другой системы. Новым клиентам оставьте 0 — всё будет считаться автоматически из оплат и посещаемости.
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Оплачено занятий (начало учёта)</label>
          <input className="form-input" type="number" min="0" value={f.paid_lessons} onChange={e => set('paid_lessons', e.target.value)} placeholder="0" />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Сколько занятий уже было оплачено до внедрения CRM</div>
        </div>
        <div className="form-group">
          <label className="form-label">Посещено занятий (начало учёта)</label>
          <input className="form-input" type="number" min="0" value={f.visited_lessons} onChange={e => set('visited_lessons', e.target.value)} placeholder="0" />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Сколько занятий уже было посещено до внедрения CRM</div>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Скидка, %</label>
        <input className="form-input" type="number" min="0" max="100" value={f.discount} onChange={e => set('discount', e.target.value)} placeholder="0" style={{ maxWidth: 200 }} />
      </div>
      <div className="form-group">
        <label className="form-label">💬 Комментарий</label>
        <textarea className="form-input" value={f.comment} onChange={e => set('comment', e.target.value)}
          placeholder="Любые заметки о клиенте..." rows={3}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      </div>
    </Modal>
  )
}

function ClientDetail({ client, directions, payments, teachers, addresses, onClose, onEdit, onFreeze, onDelete, onAddPayment, onEnroll, features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
  const [stats, setStats] = useState(null)
  const [freezes, setFreezes] = useState([])
  const [attDetails, setAttDetails] = useState([])
  const [attExpanded, setAttExpanded] = useState(false)
  const [payExpanded, setPayExpanded] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
      const { data: pays } = await supabase.from('payments').select('lessons_count, payment_date, expires_at').eq('client_id', client.id)
      const today = new Date().toISOString().slice(0, 10)
      const paidFromPayments = (pays||[]).filter(p => !p.expires_at || p.expires_at >= today).reduce((s,p) => s + (+p.lessons_count||0), 0)
      const totalPaid = (client.paid_lessons || 0) + paidFromPayments
      const monthPaid = (pays||[]).filter(p => p.payment_date >= monthStart).reduce((s,p) => s + (+p.lessons_count||0), 0)
      const { data: att } = await supabase
        .from('attendance')
        .select('date, time, direction_id, teacher_id, address_id, group_id, present')
        .eq('client_id', client.id)
        .eq('present', true)
        .order('date', { ascending: false })
      setAttDetails(att || [])
      const visitedFromAtt = (att||[]).length
      const totalVisited = (client.visited_lessons || 0) + visitedFromAtt
      const monthVisited = (att||[]).filter(a => a.date >= monthStart).length
      setStats({ totalPaid, monthPaid, totalVisited, monthVisited })
      const { data: frz } = await supabase
        .from('subscription_freezes')
        .select('*')
        .eq('client_id', client.id)
        .order('start_date', { ascending: false })
      setFreezes(frz || [])
    }
    fetchStats()
  }, [client.id])

  const cDirs = directions.filter(d => (client.direction_ids || []).includes(d.id))
  const cPay = payments.filter(p => p.client_id === client.id)
  const age = calcAge(client.birthday)
  const totalPaid = stats?.totalPaid ?? client.paid_lessons ?? 0
  const totalVisited = stats?.totalVisited ?? client.visited_lessons ?? 0
  const bal = calcBalance(totalPaid, totalVisited)
  const todayStr = new Date().toISOString().slice(0, 10)
  const activeFreeze = freezes.find(f => f.start_date <= todayStr && f.end_date >= todayStr)
  const futureFreeze = freezes.find(f => f.start_date > todayStr)

  // Направления формата "по дням клиента" среди направлений клиента
  const clientDayDirs = cDirs.filter(d => d.enrollment_type === 'client_days')

  return (
    <Modal title={`👤 ${client.child_name}`} onClose={onClose} large
      footer={<>
        <button className="btn btn-outline btn-sm" onClick={onEdit}>✏️ Редактировать</button>
        {onAddPayment && (
          <button className="btn btn-primary btn-sm" onClick={() => onAddPayment(client)}>
            💳 + Оплата
          </button>
        )}
        {onDelete && (
          <button className="btn btn-sm" onClick={() => onDelete(client)}
            style={{ color:'#EF4444', background:'#FEF2F2', border:'1px solid #EF444433', marginLeft:'auto' }}>
            🗑 Удалить клиента
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Закрыть</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '14px 16px', background: T.cream, borderRadius: 14 }}>
        <div className="avatar" style={{ background: hashColor(client.child_name), width: 52, height: 52, fontSize: 20 }}>{(client.child_name || '?')[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 17 }}>{client.child_name}</div>
          <div style={{ fontSize: 13, color: T.muted }}>
            {client.adult_name}
            {age !== null ? ` · ${age} лет` : ''}
            {client.birthday ? ` (${new Date(client.birthday).toLocaleDateString('ru-RU')})` : ''}
            {` · ${client.sex}`}
          </div>
          <span className={`badge ${STATUS_COLORS[client.status]}`} style={{ marginTop: 4 }}>{client.status}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 22, color: bal.color }}>{Math.abs(bal.left)}</div>
          <div style={{ fontSize: 11, color: bal.color, fontWeight: 700 }}>{bal.left >= 0 ? 'зан. осталось' : 'зан. долг'}</div>
        </div>
      </div>
      {bal.status !== 'ok' && (
        <div style={{ background: bal.bg, border: `1.5px solid ${bal.color}44`, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{bal.status === 'debt' ? '🔴' : '🟡'}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: bal.color }}>{bal.label}</div>
            <div style={{ fontSize: 12, color: bal.color + 'aa' }}>{bal.status === 'debt' ? `Посещено ${totalVisited} зан., оплачено ${totalPaid} зан.` : 'Осталось всего 1 занятие — пора продлевать'}</div>
          </div>
        </div>
      )}
      {activeFreeze ? (
        <div style={{ background: '#e3f2fd', border: '1.5px solid #2196f3', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>❄️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1565c0' }}>
              Абонемент заморожен до {new Date(activeFreeze.end_date).toLocaleDateString('ru-RU')}
            </div>
            <div style={{ fontSize: 12, color: '#1565c0aa' }}>
              {activeFreeze.days} {activeFreeze.days === 1 ? 'день' : (activeFreeze.days < 5 ? 'дня' : 'дней')}
              {activeFreeze.note ? ` · ${activeFreeze.note}` : ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            if (!confirm('Снять заморозку?')) return
            await supabase.from('subscription_freezes').delete().eq('id', activeFreeze.id)
            setFreezes(prev => prev.filter(f => f.id !== activeFreeze.id))
          }}>Снять</button>
        </div>
      ) : (
        features.freeze && <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onFreeze && onFreeze(client)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ❄️ Заморозить абонемент
          </button>
          {futureFreeze && (
            <span style={{ fontSize: 12, color: T.muted, alignSelf: 'center' }}>
              Запланирована с {new Date(futureFreeze.start_date).toLocaleDateString('ru-RU')}
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{ background: T.greenBg, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', transition: 'background 0.15s', marginBottom: payExpanded ? 8 : 16 }}
            onClick={() => setPayExpanded(v => !v)}
            onMouseEnter={e => e.currentTarget.style.background = '#c8dfd1'}
            onMouseLeave={e => e.currentTarget.style.background = T.greenBg}
          >
            <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📅 Оплачено занятий</span>
              <span style={{ fontSize: 11, color: T.greenDark, fontWeight: 600, textTransform: 'none' }}>{payExpanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 24, color: T.greenDark }}>{stats ? totalPaid : '...'}</span>
              <span style={{ fontSize: 12, color: T.muted }}>всего</span>
            </div>
            {stats && <div style={{ fontSize: 12, color: T.greenDark, marginTop: 2 }}>в этом мес.: <strong>{stats.monthPaid}</strong> зан.</div>}
          </div>
          {payExpanded && (
            <div style={{ flex: 1, padding: 12, background: '#fafaf5', borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>История оплат ({cPay.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {cPay.length ? cPay.map(p => {
                  const today = new Date().toISOString().slice(0, 10)
                  const isExpired = p.expires_at && p.expires_at < today
                  return (
                    <div key={p.id} className="fin-row" style={{ opacity: isExpired ? 0.6 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {p.payment_type}
                          {isExpired && <span style={{ marginLeft: 6, fontSize: 10, color: '#e05a5a', fontWeight: 700, background: '#fee2e2', padding: '1px 6px', borderRadius: 99 }}>истёк</span>}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted }}>{p.payment_date}</div>
                        {p.expires_at && (
                          <div style={{ fontSize: 11, color: isExpired ? '#e05a5a' : '#c47a00', fontWeight: 600 }}>
                            ⏱ {isExpired ? 'Истёк' : 'Истекает'} {new Date(p.expires_at).toLocaleDateString('ru-RU')}
                          </div>
                        )}
                      </div>
                      <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: +p.amount > 0 ? T.greenDark : T.muted }}>{+p.amount > 0 ? fmt(p.amount) : 'Бесплатно'}</div>
                    </div>
                  )
                }) : <div style={{ fontSize: 13, color: T.muted, padding: '6px 0' }}>Оплат пока нет</div>}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', transition: 'background 0.15s', marginBottom: attExpanded ? 8 : 16 }}
            onClick={() => setAttExpanded(v => !v)}
            onMouseEnter={e => e.currentTarget.style.background = '#ebe7d2'}
            onMouseLeave={e => e.currentTarget.style.background = T.cream}
          >
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>✅ Посещено занятий</span>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: 'none' }}>{attExpanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 24, color: T.ink }}>{stats ? totalVisited : '...'}</span>
              <span style={{ fontSize: 12, color: T.muted }}>всего</span>
            </div>
            {stats && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>в этом мес.: <strong>{stats.monthVisited}</strong> зан.</div>}
          </div>
          {attExpanded && (
            <div style={{ flex: 1, padding: 12, background: '#fafaf5', borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                История посещений ({attDetails.length})
              </div>
              {attDetails.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, padding: '6px 0' }}>Посещений пока нет</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {attDetails.map((a, i) => {
                    const dir = directions.find(d => d.id === a.direction_id)
                    const teacher = teachers?.find(t => t.id === a.teacher_id)
                    const address = addresses?.find(adr => adr.id === a.address_id)
                    const dirColor = dir?.color || DEFAULT_COLOR
                    const dateObj = new Date(a.date)
                    const dateStr2 = dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' })
                    return (
                      <div key={i} style={{ background: 'white', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${dirColor}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, minWidth: 90 }}>{dateStr2}</div>
                        {a.time && <div style={{ fontSize: 12, color: T.muted, minWidth: 50 }}>🕐 {a.time}</div>}
                        <div style={{ fontSize: 13, color: dirColor, fontWeight: 600 }}>{dir?.name || 'Направление удалено'}</div>
                        {teacher && <div style={{ fontSize: 12, color: T.muted }}>👩‍🏫 {teacher.name}</div>}
                        {address && <div style={{ fontSize: 12, color: T.muted }}>📍 {address.name}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 4 }}>📌 Источник</div>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14 }}>{client.source || '—'}</div>
        </div>
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 4 }}>🎁 Скидка</div>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14 }}>{client.discount || 0}%</div>
        </div>
      </div>
      <div className="divider" />
      <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Направления</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {cDirs.map(d => {
          const color = d.color || DEFAULT_COLOR
          return (
            <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: color + '22', color, border: `1px solid ${color}44` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />{d.name}
            </span>
          )
        })}
        {!cDirs.length && <span style={{ fontSize: 13, color: T.muted }}>нет направлений</span>}
      </div>

      {/* Дни посещения для формата "по дням клиента" */}
      {clientDayDirs.map(d => {
        const ws = (client.weekly_schedule || {})[d.id]
        if (!ws || !ws.days || ws.days.length === 0) return null
        const color = d.color || DEFAULT_COLOR
        const group = (d.groups || []).find(g => g.id === ws.group_id)
        return (
          <div key={d.id} style={{ background: color + '11', borderRadius: 10, padding: '8px 12px', marginBottom: 8, border: `1px solid ${color}33` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>
              🗓 {d.name}{group ? ` · ${group.name}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ws.days.map(day => (
                <span key={day} style={{ background: color + '22', color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{day}</span>
              ))}
            </div>
          </div>
        )
      })}

      {cDirs.filter(d => d.enrollment_type === 'calendar').map(d => (
        <button key={d.id} onClick={() => onEnroll && onEnroll({ client, direction: d })}
          style={{ marginBottom: 8, marginRight: 6, padding: '4px 10px', borderRadius: 99, border: `1.5px solid ${(d.color || T.green) + '88'}`, background: (d.color || T.green) + '22', color: d.color || T.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
          <span style={{ fontSize: 11 }}>📅</span>
          Записать на даты — {d.name}
        </button>
      ))}
      <div className="divider" />
      <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Контакты</div>
      <div style={{ marginBottom: 14 }}>
        {(client.contacts || []).map((c, i) => (
          <div key={i} style={{ fontSize: 13, display: 'flex', gap: 10, marginBottom: 3 }}>
            <span style={{ color: T.muted, fontWeight: 600, fontSize: 11, minWidth: 70 }}>{c.type}</span>
            <span style={{ fontWeight: 600 }}>{c.val}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function FreezeModal({ client, onClose, onSaved }) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(todayISO)
  const [days, setDays] = useState(7)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const endDate = (() => {
    if (!startDate || !days || days < 1) return ''
    const d = new Date(startDate)
    d.setDate(d.getDate() + (+days) - 1)
    return d.toISOString().slice(0, 10)
  })()
  const save = async () => {
    setError(null)
    if (!startDate) return setError('Укажите дату начала')
    if (!days || days < 1) return setError('Кол-во дней должно быть от 1')
    setSaving(true)
    const { error: err } = await supabase.from('subscription_freezes').insert({
      client_id: client.id,
      start_date: startDate,
      end_date: endDate,
      days: +days,
      note: note || null,
    })
    setSaving(false)
    if (err) return setError('Не удалось сохранить: ' + err.message)
    onSaved && onSaved()
  }
  return (
    <Modal title={`❄️ Заморозка абонемента — ${client.child_name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={saving}>Отмена</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохраняем…' : 'Заморозить'}</button></>}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Дата начала</label>
          <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ fontSize: 16 }} />
        </div>
        <div className="form-group">
          <label className="form-label">Кол-во дней</label>
          <input className="form-input" type="number" min="1" max="365" value={days} onChange={e => setDays(Math.max(1, +e.target.value || 1))} style={{ fontSize: 16 }} />
        </div>
      </div>
      {endDate && (
        <div style={{ background: '#e3f2fd', borderRadius: 12, padding: '10px 14px', marginBottom: 14, color: '#1565c0', fontSize: 13, fontWeight: 600 }}>
          ❄️ Абонемент будет заморожен до {new Date(endDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Комментарий (необязательно)</label>
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Например: болезнь, отпуск" style={{ fontSize: 16 }} />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ fontSize: 12, color: T.muted, padding: '8px 0' }}>
        💡 В период заморозки занятия не списываются с баланса. Если ребёнок придёт на занятие — отметить посещение всё равно можно, но желательно сначала снять заморозку.
      </div>
    </Modal>
  )
}

const calcRealBalance = (client, payments) => {
  const today = new Date().toISOString().slice(0, 10)
  const paidFromPayments = payments
    .filter(p => p.client_id === client.id)
    .filter(p => !p.expires_at || p.expires_at >= today)
    .reduce((s, p) => s + (+p.lessons_count || 0), 0)
  const totalPaid = (client.paid_lessons || 0) + paidFromPayments
  const totalVisited = client.visited_lessons || 0
  return { totalPaid, totalVisited, bal: calcBalance(totalPaid, totalVisited) }
}

function CommentToggle({ comment }) {
  const [open, setOpen] = useState(false)
  return (
    <div onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)}
        style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
        <span style={{ fontSize: 14 }}>{open ? '▾' : '▸'}</span>
        {open ? 'Скрыть комментарий' : '💬 Комментарий'}
      </button>
      {open && (
        <div style={{ fontSize: 13, color: T.muted, background: T.cream, borderRadius: 8, padding: '8px 10px', marginTop: 4, lineHeight: 1.5 }}>
          {comment}
        </div>
      )}
    </div>
  )
}

export default function ClientsPage({ clients, directions, payments, teachers, reload, isDirector, navigate, deepLink, setDeepLink, studioId, clientStatuses = [], features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
  const STATUSES_LIST = clientStatuses.length > 0
    ? clientStatuses.map(s => s.name)
    : ['Новый', 'Активен', 'Временно отсутствует', 'Неактивен', 'Негатив', 'Отказ', 'Ожидание']
  const STATUS_COLORS_MAP = clientStatuses.length > 0
    ? Object.fromEntries(clientStatuses.map(s => [s.name, s.color]))
    : STATUS_COLORS
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Все')
  const [dirFilter, setDirFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [enrollModal, setEnrollModal] = useState(null)
  const [showEdit, setShowEdit] = useState(null)
  const [showFreeze, setShowFreeze] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (deepLink?.clientId && clients.length) {
      const c = clients.find(x => x.id === deepLink.clientId)
      if (c) { setShowDetail(c); setDeepLink(null) }
    }
  }, [deepLink, clients])
  useEffect(() => {
    supabase.from('addresses').select('*').then(({ data }) => setAddresses(data || []))
  }, [])
  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const match = !q || (c.child_name || '').toLowerCase().includes(q) || (c.adult_name || '').toLowerCase().includes(q)
    const st = statusFilter === 'Все' || c.status === statusFilter
    const dir = dirFilter === 'all' || (c.direction_ids || []).includes(+dirFilter)
    return match && st && dir
  })
  const save = async (f) => {
    const cleaned = {
      ...f,
      paid_lessons: +f.paid_lessons || 0,
      balance: +f.balance || 0,
      discount: +f.discount || 0,
      direction_ids: f.direction_ids || [],
      weekly_schedule: f.weekly_schedule || {},
      birthday: f.birthday || null,
      start_date: f.start_date || null,
    }
    if (showEdit) delete cleaned.visited_lessons
    if (showEdit) {
      const { error } = await supabase.from('clients').update(cleaned).eq('id', showEdit.id)
      if (error) { alert('Ошибка сохранения: ' + error.message); return }
      setShowEdit(null)
    } else {
      cleaned.visited_lessons = 0
      cleaned.studio_id = studioId
      const { error } = await supabase.from('clients').insert(cleaned)
      if (error) { alert('Ошибка создания: ' + error.message); return }
      setShowAdd(false)
    }
    await reload()
  }
  const deleteClient = async (c) => {
    if (!confirm(`Удалить клиента «${c.child_name}»? Это действие нельзя отменить.`)) return
    await supabase.from('clients').delete().eq('id', c.id)
    setShowDetail(null)
    await reload()
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width: 'auto', padding: '8px 12px' }} value={dirFilter} onChange={e => setDirFilter(e.target.value)}>
          <option value="all">Все направления</option>
          {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(true)}>+ Новый клиент</button>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {['Все', ...STATUSES_LIST].map(s => <button key={s} className={`tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>)}
      </div>
      <div className="table-wrap" style={{ display: isMobile ? 'none' : 'block' }}>
        <table>
          <thead><tr><th>Ребёнок</th><th>Возраст</th><th>Взрослый</th><th>Статус</th><th>Направления</th><th>Скидка</th><th>Занятия</th><th>Контакт</th><th>Комментарий</th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const age = calcAge(c.birthday)
              const { totalPaid, totalVisited, bal } = calcRealBalance(c, payments)
              return (
                <tr key={c.id} className="tr-click" onClick={() => setShowDetail(c)}>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div className="avatar" style={{ background: hashColor(c.child_name), width: 30, height: 30, fontSize: 12 }}>{(c.child_name || '?')[0]}</div>
                      <div style={{ fontWeight: 700 }}>{c.child_name}</div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: T.muted }}>{age !== null ? `${age} лет` : '—'}</td>
                  <td style={{ fontSize: 13 }}>{c.adult_name}</td>
                  <td><span className={`badge ${STATUS_COLORS_MAP[c.status]}`}>{c.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {directions.filter(d => (c.direction_ids || []).includes(d.id)).map(d => {
                        const color = d.color || DEFAULT_COLOR
                        return <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + '22', color }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />{d.name}</span>
                      })}
                      {!directions.filter(d => (c.direction_ids || []).includes(d.id)).length && <span style={{ color: T.muted, fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                  <td>
                    {(c.discount || 0) > 0
                      ? <span className="badge badge-orange">🎁 {c.discount}%</span>
                      : <span style={{ color: T.muted, fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 13, padding: '2px 8px', borderRadius: 8, background: bal.bg, color: bal.color, display: 'inline-block', width: 'fit-content' }}>
                        {bal.left > 0 ? `+${bal.left} зан.` : bal.left === 0 ? '0 зан.' : `${bal.left} зан.`}
                      </span>
                      <span style={{ fontSize: 10, color: T.muted }}>опл. {totalPaid} · пос. {totalVisited}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: T.muted }}>{(c.contacts || [])[0]?.val || '—'}</td>
                  <td style={{ fontSize: 12, color: T.muted, maxWidth: 180 }}>
                    {c.comment
                      ? <span title={c.comment} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.comment}</span>
                      : '—'}
                  </td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={9}><div className="empty"><div className="empty-icon">👤</div><div className="empty-text">Клиентов не найдено</div></div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="show-mobile" style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {filtered.map(c => {
          const age = calcAge(c.birthday)
          const { totalPaid, totalVisited, bal } = calcRealBalance(c, payments)
          const dirs = directions.filter(d => (c.direction_ids || []).includes(d.id))
          const phone = (c.contacts || []).find(ct => ct.type === 'phone' || ct.val?.startsWith('+'))?.val
          return (
            <div key={c.id} className="card" onClick={() => setShowDetail(c)}
              style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${hashColor(c.child_name)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div className="avatar" style={{ background: hashColor(c.child_name), width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>
                  {(c.child_name || '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.child_name}</div>
                  {age !== null && <div style={{ fontSize: 12, color: T.muted }}>{age} лет</div>}
                </div>
                <span className={`badge ${STATUS_COLORS_MAP[c.status]}`}>{c.status}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 10 }}>
                {c.adult_name && (
                  <div>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>Родитель</div>
                    <div style={{ fontSize: 13 }}>{c.adult_name}</div>
                  </div>
                )}
                {phone && (
                  <div>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>Телефон</div>
                    <a href={`tel:${phone}`} onClick={e => e.stopPropagation()}
                      style={{ fontSize: 13, color: T.green, textDecoration: 'none', fontWeight: 600 }}>{phone}</a>
                  </div>
                )}
              </div>
              {dirs.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {dirs.map(d => {
                    const color = d.color || DEFAULT_COLOR
                    return (
                      <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: color + '22', color }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
                        {d.name}
                      </span>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: c.comment ? 8 : 0 }}>
                <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 13, padding: '2px 10px', borderRadius: 8, background: bal.bg, color: bal.color }}>
                  {bal.left > 0 ? `+${bal.left} зан.` : bal.left === 0 ? '0 зан.' : `${bal.left} зан.`}
                </span>
                <span style={{ fontSize: 11, color: T.muted }}>опл. {totalPaid} · пос. {totalVisited}</span>
                {(c.discount || 0) > 0 && <span className="badge badge-orange" style={{ marginLeft: 'auto' }}>🎁 {c.discount}%</span>}
              </div>
              {c.comment && (
                <CommentToggle comment={c.comment} />
              )}
            </div>
          )
        })}
        {!filtered.length && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
            <div style={{ color: T.muted }}>Клиентов не найдено</div>
          </div>
        )}
      </div>
      {showAdd && <ClientModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} statuses={STATUSES_LIST} />}
      {showEdit && <ClientModal client={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} statuses={STATUSES_LIST} />}
      {showDetail && (
        <ClientDetail
          client={showDetail}
          directions={directions}
          payments={payments}
          teachers={teachers}
          addresses={addresses}
          onClose={() => setShowDetail(null)}
          onEdit={() => { setShowEdit(showDetail); setShowDetail(null) }}
          onFreeze={(c) => setShowFreeze(c)}
          onDelete={isDirector ? deleteClient : null}
          onAddPayment={navigate ? (c) => { setShowDetail(null); navigate('payments', { clientId: c.id }) } : null}
          onEnroll={(data) => setEnrollModal(data)}
          features={features}
        />
      )}
      {showFreeze && (
        <FreezeModal
          client={showFreeze}
          onClose={() => setShowFreeze(null)}
          onSaved={() => {
            setShowFreeze(null)
            if (showDetail) {
              const cid = showDetail.id
              setShowDetail(null)
              setTimeout(() => {
                const fresh = clients.find(c => c.id === cid)
                if (fresh) setShowDetail(fresh)
              }, 50)
            }
          }}
        />
      )}
      {enrollModal && (
        <EnrollModal
          client={enrollModal.client}
          direction={enrollModal.direction}
          studioId={studioId}
          onClose={() => setEnrollModal(null)}
        />
      )}
    </div>
  )
}

// ── Модалка записи на конкретные даты ───────────────────────
function EnrollModal({ client, direction, studioId, onClose }) {
  const today = new Date()
  const [selectedDates, setSelectedDates] = useState([])
  const [existingEnrollments, setExistingEnrollments] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [viewMonth, setViewMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  useEffect(() => { loadExisting() }, [])
  const loadExisting = async () => {
    const { data } = await supabase.from('enrollments')
      .select('*')
      .eq('client_id', client.id)
      .eq('direction_id', direction.id)
      .eq('status', 'enrolled')
    setExistingEnrollments(data || [])
  }
  const fmt2 = n => String(n).padStart(2, '0')
  const toStr = (y, m, d) => `${y}-${fmt2(m+1)}-${fmt2(d)}`
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate()
  const firstDow = new Date(viewMonth.year, viewMonth.month, 1).getDay()
  const offset = (firstDow + 6) % 7
  const scheduleStr = direction.schedule || ''
  const scheduleDows = []
  const DAY_MAP = { 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0 }
  Object.entries(DAY_MAP).forEach(([key, val]) => {
    if (scheduleStr.toLowerCase().includes(key)) scheduleDows.push(val)
  })
  const toggleDate = (ds) => {
    setSelectedDates(prev => prev.includes(ds) ? prev.filter(x => x !== ds) : [...prev, ds])
  }
  const isExisting = (ds) => existingEnrollments.some(e => e.date === ds)
  const isSelected = (ds) => selectedDates.includes(ds)
  const isScheduled = (dow) => scheduleDows.length === 0 || scheduleDows.includes(dow)
  const save = async () => {
    if (!selectedDates.length) { setMsg({ type: 'error', text: 'Выберите хотя бы одну дату' }); return }
    setSaving(true)
    const toInsert = selectedDates
      .filter(ds => !isExisting(ds))
      .map(ds => ({ studio_id: studioId, direction_id: direction.id, client_id: client.id, date: ds, status: 'enrolled' }))
    if (toInsert.length > 0) {
      const { error } = await supabase.from('enrollments').insert(toInsert)
      if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    }
    setMsg({ type: 'success', text: `Записан на ${toInsert.length} занятий` })
    setSelectedDates([])
    loadExisting()
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }
  const cancelEnrollment = async (enrollmentId) => {
    await supabase.from('enrollments').update({ status: 'cancelled' }).eq('id', enrollmentId)
    loadExisting()
  }
  const color = direction.color || T.green
  const DAYS_RU_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, color: T.ink }}>📅 Запись на занятия</div>
            <div style={{ fontSize: 13, color: T.muted }}>{client.child_name} · {direction.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.muted }}>✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const d = new Date(viewMonth.year, viewMonth.month - 1)
            setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
          }}>◀</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>
            {new Date(viewMonth.year, viewMonth.month).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const d = new Date(viewMonth.year, viewMonth.month + 1)
            setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
          }}>▶</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS_RU_SHORT.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: T.muted, padding: '2px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 16 }}>
          {Array(offset).fill(null).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const date = new Date(viewMonth.year, viewMonth.month, day)
            const dow = date.getDay()
            const ds = toStr(viewMonth.year, viewMonth.month, day)
            const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
            const scheduled = isScheduled(dow)
            const existing = isExisting(ds)
            const selected = isSelected(ds)
            const existingEnroll = existingEnrollments.find(e => e.date === ds)
            return (
              <div key={day} onClick={() => !isPast && scheduled && !existing && toggleDate(ds)}
                style={{
                  textAlign: 'center', padding: '6px 2px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: isPast || !scheduled || existing ? 'default' : 'pointer',
                  background: existing ? color + '33' : selected ? color : scheduled && !isPast ? T.cream : 'transparent',
                  color: existing ? color : selected ? 'white' : isPast || !scheduled ? T.muted : T.ink,
                  border: existing ? `2px solid ${color}` : selected ? `2px solid ${color}` : '2px solid transparent',
                  opacity: isPast ? 0.4 : 1,
                  position: 'relative',
                }}>
                {day}
                {existing && (
                  <button onClick={e => { e.stopPropagation(); cancelEnrollment(existingEnroll.id) }}
                    style={{ position: 'absolute', top: -4, right: -4, background: '#e05a5a', border: 'none', borderRadius: '50%', width: 14, height: 14, fontSize: 9, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.muted, marginBottom: 16, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color + '33', border: `1.5px solid ${color}`, marginRight: 4 }} />Уже записан</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color, marginRight: 4 }} />Выбрано</span>
          {scheduleDows.length > 0 && <span>Занятия по расписанию подсвечены</span>}
        </div>
        {selectedDates.length > 0 && (
          <div style={{ background: T.greenBg, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: T.greenDark, fontWeight: 600 }}>
            Выбрано дат: {selectedDates.length}
          </div>
        )}
        {existingEnrollments.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase' }}>Уже записан ({existingEnrollments.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {existingEnrollments.sort((a,b) => a.date.localeCompare(b.date)).map(e => (
                <span key={e.id} style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                  {new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  <button onClick={() => cancelEnrollment(e.id)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 11 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}
        {msg && (
          <div style={{ fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
            background: msg.type === 'error' ? '#fde8e8' : T.greenBg,
            color: msg.type === 'error' ? '#e05a5a' : T.greenDark, fontWeight: 600 }}>
            {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !selectedDates.length} style={{ flex: 1 }}>
            {saving ? 'Сохраняем...' : `✅ Записать (${selectedDates.length})`}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
