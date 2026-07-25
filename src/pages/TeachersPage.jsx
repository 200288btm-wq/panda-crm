import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt, hashColor } from '../styles.jsx'
import { Modal } from '../components/Modal'

const STATUS_T = { 'Активен': 'badge-green', 'В поиске': 'badge-orange', 'Ожидание': 'badge-purple', 'Уволен': 'badge-gray' }
const STATUSES_T = ['Активен', 'В поиске', 'Ожидание', 'Уволен']

// Формат оплаты направления определяет, какую ставку задавать педагогу
const isHourly = (dir) => dir?.payment_type === 'per_hour'

// Расчёт заработка по журналу работы.
// Журнал — источник правды: он говорит, кто работал и сколько часов.
// Для занятий до его появления есть запасной путь — отметки посещаемости.
function calcEarnings({ work = [], attendance = [], rates = [], directions = [], teacherId, paidWorkLogIds = new Set(), paidLegacyKeys = new Set() }) {
  // Сколько учеников было на занятии — нужно для ставки «по кол-ву учеников»
  const students = {}
  attendance.forEach(a => {
    const k = `${a.date}_${a.direction_id}`
    students[k] = (students[k] || 0) + 1
  })

  const byDir = {}
  const items = []  // отдельные занятия/доли — для окраски и пометки оплаты
  const add = (dirId, patch) => {
    if (!byDir[dirId]) byDir[dirId] = { lessons: 0, hours: 0, amount: 0 }
    byDir[dirId].lessons += patch.lessons || 0
    byDir[dirId].hours += patch.hours || 0
    byDir[dirId].amount += patch.amount || 0
  }

  const lessonRate = (rate, key) => {
    if (rate?.rate_type === 'by_students') {
      const cnt = students[key] || 0
      return (rate.min_students > 0 && cnt >= rate.min_students)
        ? (rate.rate_full || 0)
        : (rate.rate_part || 0)
    }
    return rate?.rate || 0
  }

  work.forEach(w => {
    const dir = directions.find(d => d.id === w.direction_id)
    const rate = rates.find(r => r.direction_id === w.direction_id)
    const hourly = dir?.payment_type === 'per_hour'
    const amount = hourly
      ? (+w.hours || 0) * (rate?.rate_hour || 0)
      : lessonRate(rate, `${w.date}_${w.direction_id}`)
    add(w.direction_id, hourly ? { hours: +w.hours || 0, amount } : { lessons: 1, amount })
    items.push({
      workLogId: w.id, date: w.date, directionId: w.direction_id,
      hours: hourly ? (+w.hours || 0) : null, amount,
      paid: paidWorkLogIds.has(w.id),
      fromLog: true,
    })
  })

  // Запасной путь: занятия, которых нет в журнале
  const covered = new Set(work.map(w => `${w.date}_${w.direction_id}`))
  const seen = new Set()
  attendance.forEach(a => {
    if (a.teacher_id !== teacherId) return
    const k = `${a.date}_${a.direction_id}`
    if (covered.has(k) || seen.has(k)) return
    seen.add(k)
    const amount = lessonRate(rates.find(r => r.direction_id === a.direction_id), k)
    add(a.direction_id, { lessons: 1, amount })
    items.push({
      workLogId: null, date: a.date, directionId: a.direction_id,
      hours: null, amount,
      paid: paidLegacyKeys.has(`${a.date}_${a.direction_id}`),
      fromLog: false,
    })
  })

  items.sort((a, b) => b.date.localeCompare(a.date))
  const unpaid = items.filter(i => !i.paid)

  const vals = Object.values(byDir)
  return {
    byDir, items, unpaid,
    total: vals.reduce((s, x) => s + x.amount, 0),
    unpaidTotal: unpaid.reduce((s, x) => s + x.amount, 0),
    lessons: vals.reduce((s, x) => s + x.lessons, 0),
    hours: vals.reduce((s, x) => s + x.hours, 0),
    fromLog: work.length,
    fromAttendance: seen.size,
  }
}

// ── Модалка редактирования педагога ─────────────────────────
function TeacherModal({ teacher, directions, studioId, onClose, onSave }) {
  const [f, setF] = useState(teacher ? {
    name: teacher.name || '', phone: teacher.phone || '',
    direction_ids: teacher.direction_ids || [],
    status: teacher.status || 'Активен', hired: teacher.hired || '',
    birthday: teacher.birthday || '', contract_date: teacher.contract_date || '',
    salary_type: teacher.salary_type || 'per_lesson', // 'per_lesson' (сделка) | 'salary' (оклад)
    salary_amount: teacher.salary_amount || 0,
  } : {
    name: '', phone: '', direction_ids: [], status: 'Активен',
    hired: '', birthday: '', contract_date: '',
    salary_type: 'per_lesson', salary_amount: 0,
  })
  const [rates, setRates] = useState([])
  const [loadingRates, setLoadingRates] = useState(false)
  const [hiredError, setHiredError] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (teacher?.id) loadRates()
  }, [teacher?.id])

  const loadRates = async () => {
    setLoadingRates(true)
    const { data } = await supabase.from('teacher_rates')
      .select('*').eq('teacher_id', teacher.id)
    setRates(data || [])
    setLoadingRates(false)
  }

  const getRateForDir = (dirId) => rates.find(r => r.direction_id === dirId)

  const setRate = (dirId, field, value) => {
    setRates(prev => {
      const existing = prev.find(r => r.direction_id === dirId)
      if (existing) return prev.map(r => r.direction_id === dirId ? { ...r, [field]: value } : r)
      return [...prev, { direction_id: dirId, teacher_id: teacher?.id, studio_id: studioId, rate_type: 'per_lesson', rate: 0, rate_hour: 0, rate_part: 0, rate_full: 0, min_students: 0, [field]: value }]
    })
  }

  const selectedDirs = directions.filter(d => (f.direction_ids || []).includes(d.id))

  return (
    <Modal title={teacher ? `✏️ ${teacher.name}` : '+ Новый педагог'} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={() => {
          if (!f.hired) { setHiredError(true); return }
          onSave(f, rates)
        }}>Сохранить</button>
      </>}>
      {/* Основная информация */}
      <div className="form-group">
        <label className="form-label">ФИО *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Фамилия Имя Отчество" autoFocus />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Телефон</label>
          <input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)}
            onFocus={e => { if (!f.phone) set('phone', '+7') }}
            placeholder="+7 xxx" />
        </div>
        <div className="form-group">
          <label className="form-label">Статус</label>
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUSES_T.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Дата приёма *</label>
          <input className="form-input" type="date" value={f.hired}
            onChange={e => { set('hired', e.target.value); setHiredError(false) }}
            style={{ borderColor: hiredError ? '#e05a5a' : undefined }} />
          {hiredError && (
            <div style={{ marginTop: 8, background: '#fde8e8', borderRadius: 10, padding: '10px 14px', border: '1px solid #e05a5a22' }}>
              <div style={{ fontSize: 13, color: '#e05a5a', fontWeight: 600, marginBottom: 6 }}>
                ⚠️ Укажите дату начала работы
              </div>
              <button onClick={() => { set('hired', new Date().toISOString().slice(0, 10)); setHiredError(false) }}
                style={{ fontSize: 12, color: T.green, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Использовать сегодняшнюю дату ({new Date().toLocaleDateString('ru-RU')})
              </button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Дата договора <span style={{ fontWeight: 400, color: T.muted }}>(необязательно)</span></label>
          <input className="form-input" type="date" value={f.contract_date} onChange={e => set('contract_date', e.target.value)} />
        </div>
      </div>

      {/* Направления */}
      <div className="form-group">
        <label className="form-label">Направления</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {directions.map(d => {
            const on = (f.direction_ids || []).includes(d.id)
            return (
              <label key={d.id} className={`chip ${on ? 'chip-active' : 'chip-inactive'}`}>
                <input type="checkbox" checked={on} style={{ display: 'none' }}
                  onChange={e => set('direction_ids', e.target.checked
                    ? [...(f.direction_ids || []), d.id]
                    : (f.direction_ids || []).filter(x => x !== d.id))} />
                {d.name}{isHourly(d) ? ' ⏱' : ''}
              </label>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
          Отметьте направления, где работает педагог — именно отсюда они подтягиваются в расписание. Значок ⏱ означает почасовую оплату.
        </div>
      </div>

      {/* Тип оплаты */}
      <div className="form-group">
        <label className="form-label">Тип оплаты</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['per_lesson', '📐 Сделка'], ['salary', '₽ Оклад']].map(([val, label]) => (
            <label key={val} onClick={() => set('salary_type', val)} style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${f.salary_type === val ? T.green : T.border}`,
              background: f.salary_type === val ? T.greenBg : T.cream,
              textAlign: 'center', fontWeight: 600, fontSize: 13,
              color: f.salary_type === val ? T.greenDark : T.ink,
            }}>{label}</label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
          {f.salary_type === 'salary'
            ? 'Фиксированная сумма за месяц независимо от количества занятий.'
            : 'Оплата по факту работы. Как считать — за занятие или за час — задано в самом направлении.'}
        </div>
      </div>

      {f.salary_type === 'salary' && (
        <div className="form-group">
          <label className="form-label">Оклад, ₽</label>
          <input className="form-input" type="number" value={f.salary_amount}
            onChange={e => set('salary_amount', e.target.value)}
            onFocus={e => { if (+e.target.value === 0) set('salary_amount', '') }}
            onBlur={e => { if (e.target.value === '') set('salary_amount', 0) }}
            placeholder="30000" />
        </div>
      )}

      {/* Ставки по направлениям */}
      {f.salary_type === 'per_lesson' && selectedDirs.length === 0 && (
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
          Отметьте направления выше — под каждое появится поле для ставки.
        </div>
      )}

      {f.salary_type === 'per_lesson' && selectedDirs.length > 0 && (
        <div className="form-group">
          <label className="form-label">Ставки по направлениям</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            {selectedDirs.map(d => {
              const hourly = isHourly(d)
              const r = getRateForDir(d.id) || { rate_type: hourly ? 'per_hour' : 'per_lesson', rate: 0, rate_hour: 0, rate_part: 0, rate_full: 0, min_students: 0 }
              return (
                <div key={d.id} style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{d.name}</div>
                    <span style={{ background: hourly ? '#fff4e6' : T.greenBg, color: hourly ? '#c47a00' : T.greenDark, borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                      {hourly ? '⏱ за час' : '📚 за занятие'}
                    </span>
                  </div>

                  {hourly ? (
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Ставка за час, ₽</label>
                        <input className="form-input" type="number" value={r.rate_hour}
                          onChange={e => setRate(d.id, 'rate_hour', e.target.value)}
                          onFocus={e => { if (+e.target.value === 0) setRate(d.id, 'rate_hour', '') }}
                          onBlur={e => { if (e.target.value === '') setRate(d.id, 'rate_hour', 0) }}
                          placeholder="500" />
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                          Отработанные часы отмечаются в расписании
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        {[['per_lesson', 'Фикс за занятие'], ['by_students', 'По кол-ву учеников']].map(([val, label]) => (
                          <label key={val} onClick={() => setRate(d.id, 'rate_type', val)} style={{
                            flex: 1, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'center',
                            border: `2px solid ${r.rate_type === val ? T.green : T.border}`,
                            background: r.rate_type === val ? T.greenBg : 'white',
                            color: r.rate_type === val ? T.greenDark : T.ink,
                          }}>{label}</label>
                        ))}
                      </div>
                      {r.rate_type !== 'by_students' && (
                        <div className="form-row">
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Ставка, ₽</label>
                            <input className="form-input" type="number" value={r.rate}
                              onChange={e => setRate(d.id, 'rate', e.target.value)}
                              onFocus={e => { if (+e.target.value === 0) setRate(d.id, 'rate', '') }}
                              onBlur={e => { if (e.target.value === '') setRate(d.id, 'rate', 0) }} />
                          </div>
                        </div>
                      )}
                      {r.rate_type === 'by_students' && (
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Неполная группа, ₽</label>
                            <input className="form-input" type="number" value={r.rate_part}
                              onChange={e => setRate(d.id, 'rate_part', e.target.value)}
                              onFocus={e => { if (+e.target.value === 0) setRate(d.id, 'rate_part', '') }}
                              onBlur={e => { if (e.target.value === '') setRate(d.id, 'rate_part', 0) }} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Полная группа, ₽</label>
                            <input className="form-input" type="number" value={r.rate_full}
                              onChange={e => setRate(d.id, 'rate_full', e.target.value)}
                              onFocus={e => { if (+e.target.value === 0) setRate(d.id, 'rate_full', '') }}
                              onBlur={e => { if (e.target.value === '') setRate(d.id, 'rate_full', 0) }} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Полная группа от (чел.)</label>
                            <input className="form-input" type="number" value={r.min_students}
                              onChange={e => setRate(d.id, 'min_students', e.target.value)}
                              onFocus={e => { if (+e.target.value === 0) setRate(d.id, 'min_students', '') }}
                              onBlur={e => { if (e.target.value === '') setRate(d.id, 'min_students', 0) }}
                              placeholder="5" />
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                              До {r.min_students || '?'} чел. → {fmt(r.rate_part)}, от {r.min_students || '?'} чел. → {fmt(r.rate_full)}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Модалка выплаты ─────────────────────────────────────────
function PayoutModal({ teacher, directions, studioId, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const firstDay = today.slice(0, 8) + '01'
  const [periodFrom, setPeriodFrom] = useState(firstDay)
  const [periodTo, setPeriodTo] = useState(today)
  const [calculated, setCalculated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')

  const calculate = async () => {
    setLoading(true)
    const [{ data: work }, { data: att }, { data: rates }, { data: lp }] = await Promise.all([
      supabase.from('teacher_work_log').select('*')
        .eq('teacher_id', teacher.id).eq('studio_id', studioId)
        .gte('date', periodFrom).lte('date', periodTo),
      // Посещаемость нужна и для запасного пути, и для ставки «по кол-ву учеников»
      supabase.from('attendance').select('date, direction_id, teacher_id')
        .eq('present', true).gte('date', periodFrom).lte('date', periodTo)
        .eq('studio_id', studioId),
      supabase.from('teacher_rates').select('*').eq('teacher_id', teacher.id),
      // Уже оплаченные занятия — чтобы не заплатить дважды
      supabase.from('lesson_payments').select('work_log_id, date, direction_id')
        .eq('teacher_id', teacher.id),
    ])
    const paidWorkLogIds = new Set((lp || []).filter(x => x.work_log_id).map(x => x.work_log_id))
    const paidLegacyKeys = new Set((lp || []).filter(x => !x.work_log_id).map(x => `${x.date}_${x.direction_id}`))

    let total = 0
    const details = []
    let totalLessons = 0
    let items = []      // неоплаченные позиции — их и пометим при создании
    let salaryMode = false

    if (teacher.salary_type === 'salary') {
      salaryMode = true
      const dFrom = new Date(periodFrom)
      const dTo = new Date(periodTo)
      const days = Math.ceil((dTo - dFrom) / (1000 * 60 * 60 * 24)) + 1
      const daysInMonth = new Date(dFrom.getFullYear(), dFrom.getMonth() + 1, 0).getDate()
      total = Math.round((teacher.salary_amount || 0) * days / daysInMonth)
      details.push({ label: `Оклад за ${days} дн. из ${daysInMonth}`, amount: total })
    } else {
      const earn = calcEarnings({
        work: work || [], attendance: att || [], rates: rates || [],
        directions, teacherId: teacher.id, paidWorkLogIds, paidLegacyKeys,
      })
      // Платим только за ещё не оплаченные занятия периода
      total = earn.unpaidTotal
      items = earn.unpaid
      totalLessons = earn.unpaid.filter(i => i.hours === null).length
      const alreadyInPeriod = earn.items.length - earn.unpaid.length

      // Разбивка по направлениям — только по неоплаченным
      const byDir = {}
      earn.unpaid.forEach(i => {
        if (!byDir[i.directionId]) byDir[i.directionId] = { lessons: 0, hours: 0, amount: 0 }
        if (i.hours !== null) byDir[i.directionId].hours += i.hours
        else byDir[i.directionId].lessons += 1
        byDir[i.directionId].amount += i.amount
      })
      Object.entries(byDir).forEach(([dirId, info]) => {
        const dir = directions.find(d => d.id === +dirId)
        const label = isHourly(dir)
          ? `${dir?.name || '—'}: ${info.hours} ч.`
          : `${dir?.name || '—'}: ${info.lessons} зан.`
        details.push({ label, amount: info.amount })
      })
      if (alreadyInPeriod > 0) {
        details.push({ label: `${alreadyInPeriod} занятий уже оплачено ранее — пропущены`, amount: null })
      }
      if (earn.unpaid.some(i => !i.fromLog)) {
        const n = earn.unpaid.filter(i => !i.fromLog).length
        details.push({ label: `из них ${n} зан. по отметкам (без журнала)`, amount: null })
      }
    }

    setCalculated({ total, toPay: total, details, totalLessons, items, salaryMode })
    setAmount(Math.max(0, total))
    setLoading(false)
  }

  return (
    <Modal title={`💰 Выплата — ${teacher.name}`} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={() => onSave({ amount, periodFrom, periodTo, note, lessonsCount: calculated?.totalLessons || 0, items: calculated?.items || [] })}
          disabled={!calculated}>Создать выплату</button>
      </>}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Период с</label>
          <input className="form-input" type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">По</label>
          <input className="form-input" type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-outline" onClick={calculate} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
        {loading ? '⏳ Считаем...' : '🧮 Рассчитать'}
      </button>
      {calculated && (
        <div style={{ background: T.cream, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 10 }}>Расчёт за период</div>
          {calculated.details.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted, marginBottom: 4 }}>
              <span style={{ fontStyle: d.amount === null ? 'italic' : 'normal' }}>{d.label}</span>
              {d.amount !== null && <span style={{ fontWeight: 600, color: T.ink }}>{fmt(d.amount)}</span>}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
              <span>Итого начислено</span>
              <span style={{ color: T.greenDark }}>{fmt(calculated.total)}</span>
            </div>
            {calculated.alreadyPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted, marginTop: 4 }}>
                <span>Уже выплачено за период</span>
                <span>−{fmt(calculated.alreadyPaid)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 6, color: calculated.toPay > 0 ? T.greenDark : '#e05a5a' }}>
              <span>К выплате</span>
              <span>{fmt(calculated.toPay)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Сумма выплаты, ₽</label>
        <input className="form-input" type="number" value={amount} onChange={e => setAmount(+e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Комментарий</label>
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Зарплата за июнь" />
      </div>
    </Modal>
  )
}

// ── Карточка педагога (раскрывающаяся) ──────────────────────
function TeacherCard({ teacher, directions, studioId, onEdit, onDelete, onPayout, summary, onPayOne }) {
  const [justPaid, setJustPaid] = useState(new Set())  // занятия, оплаченные прямо сейчас — до перезагрузки
  const [open, setOpen] = useState(false)
  const [payouts, setPayouts] = useState([])
  const [attStats, setAttStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [rates, setRates] = useState([])

  const [workLog, setWorkLog] = useState([])
  const [paidLinks, setPaidLinks] = useState([])

  const loadDetails = async () => {
    if (attStats) return
    setLoadingStats(true)
    const [{ data: work }, { data: att }, { data: py }, { data: rt }, { data: lp }] = await Promise.all([
      supabase.from('teacher_work_log').select('*').eq('teacher_id', teacher.id).eq('studio_id', studioId),
      supabase.from('attendance').select('date, direction_id, teacher_id').eq('present', true).eq('studio_id', studioId),
      supabase.from('teacher_payouts').select('*').eq('teacher_id', teacher.id).order('created_at', { ascending: false }),
      supabase.from('teacher_rates').select('*').eq('teacher_id', teacher.id),
      supabase.from('lesson_payments').select('work_log_id, date, direction_id').eq('teacher_id', teacher.id),
    ])
    setWorkLog(work || [])
    setAttStats(att || [])
    setPayouts(py || [])
    setRates(rt || [])
    setPaidLinks(lp || [])
    setLoadingStats(false)
  }

  const handleOpen = () => {
    setOpen(!open)
    if (!open) loadDetails()
  }

  const totalPaid = payouts.reduce((s, p) => s + p.amount, 0)
  const dirNames = (teacher.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean)

  const paidWorkLogIds = new Set(paidLinks.filter(x => x.work_log_id).map(x => x.work_log_id))
  const paidLegacyKeys = new Set(paidLinks.filter(x => !x.work_log_id).map(x => `${x.date}_${x.direction_id}`))

  // Всё заработанное за всё время — по журналу, с запасным путём на посещаемость
  const earn = attStats ? calcEarnings({
    work: workLog, attendance: attStats, rates, directions, teacherId: teacher.id,
    paidWorkLogIds, paidLegacyKeys,
  }) : null
  const totalEarned = attStats
    ? (teacher.salary_type === 'salary' ? (teacher.salary_amount || 0) : earn.total)
    : null
  const lessonsCount = earn ? earn.lessons : (attStats?.filter(a => a.teacher_id === teacher.id).length || 0)
  const debt = totalEarned !== null ? totalEarned - totalPaid : null

  // История занятий с признаком оплаты — прямо из движка расчёта
  const lessonHistory = earn ? earn.items.map(i => {
    const dir = directions.find(d => d.id === i.directionId)
    return {
      workLogId: i.workLogId, date: i.date,
      dirName: dir?.name || 'Направление удалено', color: dir?.color,
      hours: i.hours, amount: i.amount, paid: i.paid, fromLog: i.fromLog,
      directionId: i.directionId,
    }
  }) : []

  // Ставка одной строкой — вид зависит от формата оплаты направления
  const rateLabel = (r) => {
    const dir = directions.find(d => d.id === r.direction_id)
    if (isHourly(dir)) return `${fmt(r.rate_hour || 0)}/час`
    if (r.rate_type === 'by_students') return `${fmt(r.rate_part)} / ${fmt(r.rate_full)} (от ${r.min_students} чел.)`
    return `${fmt(r.rate)}/зан.`
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-pad" style={{ cursor: 'pointer' }} onClick={handleOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ background: hashColor(teacher.name), width: 42, height: 42, fontSize: 16, flexShrink: 0 }}>
            {(teacher.name || '?')[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{teacher.name}</div>
              <span className={`badge ${STATUS_T[teacher.status] || 'badge-gray'}`}>{teacher.status}</span>
            </div>
            {dirNames.length > 0 && (
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{dirNames.join(', ')}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(() => {
              // До разворота берём сводку из родителя, после — уже загруженное
              const shownDebt = debt !== null ? debt : (summary ? summary.debt : null)
              if (shownDebt === null || shownDebt <= 0) return null
              return (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: T.muted }}>К выплате</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, color: '#e05a5a' }}>{fmt(shownDebt)}</div>
                </div>
              )
            })()}
            <div style={{ fontSize: 18, color: T.muted, transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▾</div>
          </div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '16px 18px' }}>
          {loadingStats ? (
            <div style={{ color: T.muted, fontSize: 13 }}>Загрузка...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ background: T.cream, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: T.muted }}>{earn?.hours > 0 ? 'Занятий / часов' : 'Занятий проведено'}</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: T.ink }}>
                    {lessonsCount}{earn?.hours > 0 ? ` · ${earn.hours} ч.` : ''}
                  </div>
                </div>
                <div style={{ background: T.cream, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: T.muted }}>Выплачено</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: T.greenDark }}>{fmt(totalPaid)}</div>
                </div>
                {debt !== null && (
                  <div style={{ background: debt > 0 ? '#fde8e8' : T.cream, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: T.muted }}>К выплате</div>
                    <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: debt > 0 ? '#e05a5a' : T.greenDark }}>{fmt(debt)}</div>
                  </div>
                )}
                {teacher.salary_type === 'per_lesson' && (
                  <div style={{ background: T.cream, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: T.muted }}>Оплата</div>
                    <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink }}>
                      {rates.length > 0 ? `${rates.length} ставок` : 'Сделка'}
                    </div>
                  </div>
                )}
                {teacher.salary_type === 'salary' && (
                  <div style={{ background: T.cream, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: T.muted }}>Оклад</div>
                    <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink }}>{fmt(teacher.salary_amount)}</div>
                  </div>
                )}
              </div>

              {rates.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ставки</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rates.map(r => {
                      const dir = directions.find(d => d.id === r.direction_id)
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                          <span style={{ color: T.ink }}>
                            {dir?.name || '—'}
                            {isHourly(dir) && <span style={{ marginLeft: 6, fontSize: 11, color: '#c47a00' }}>⏱</span>}
                          </span>
                          <span style={{ color: T.greenDark, fontWeight: 700 }}>{rateLabel(r)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  История занятий {lessonHistory.length > 0 && `(${lessonHistory.length})`}
                </div>
                {lessonHistory.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.muted }}>Проведённых занятий пока нет</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                    {lessonHistory.map((l, i) => {
                      const lkey = l.workLogId ? `wl_${l.workLogId}` : `lg_${l.date}_${l.directionId}`
                      const paid = l.paid || justPaid.has(lkey)
                      return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8,
                        borderLeft: `3px solid ${l.color || '#ddd'}`,
                        background: paid ? '#e8f5ec' : '#fdeef0',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 92 }}>
                          {new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' })}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, color: T.ink }}>{l.dirName}</div>
                        {l.hours !== null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#c47a00', background: '#fff4e6', borderRadius: 6, padding: '1px 8px' }}>{l.hours} ч.</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: paid ? T.greenDark : '#c0392b', minWidth: 68, textAlign: 'right' }}>
                          {paid ? '✓ оплачено' : fmt(l.amount)}
                        </span>
                        {!l.fromLog && (
                          <span style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>по отметкам</span>
                        )}
                        {!paid && l.amount > 0 && onPayOne && (
                          <button className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 10px' }}
                            onClick={async () => {
                              const ok = await onPayOne(teacher, l)
                              if (ok) setJustPaid(prev => new Set(prev).add(lkey))
                            }}>Оплатить</button>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>История выплат</div>
                {payouts.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.muted }}>Выплат пока нет</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {payouts.slice(0, 5).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: T.cream, borderRadius: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{fmt(p.amount)}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>{p.period_from} — {p.period_to} · {p.lessons_count} зан.</div>
                          {p.note && <div style={{ fontSize: 11, color: T.muted }}>{p.note}</div>}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted }}>{p.created_at?.slice(0, 10)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(teacher.hired || teacher.contract_date || teacher.phone) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {teacher.phone && <div><div style={{ fontSize: 11, color: T.muted }}>Телефон</div><div style={{ fontSize: 13 }}>{teacher.phone}</div></div>}
                  {teacher.hired && <div><div style={{ fontSize: 11, color: T.muted }}>Принят</div><div style={{ fontSize: 13 }}>{teacher.hired}</div></div>}
                  {teacher.contract_date && <div><div style={{ fontSize: 11, color: T.muted }}>Договор</div><div style={{ fontSize: 13 }}>{teacher.contract_date}</div></div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => onPayout(teacher)}>💰 Выплата</button>
                <button className="btn btn-outline btn-sm" onClick={() => onEdit(teacher)}>✏️ Редактировать</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onDelete(teacher.id, teacher.name)} style={{ color: '#e05a5a' }}>🗑️ Удалить</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Главная страница ─────────────────────────────────────────
export default function TeachersPage({ teachers, directions, reload, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showPayout, setShowPayout] = useState(null)
  const [summary, setSummary] = useState({}) // teacher_id → { debt, lessons, hours }

  // Одним махом считаем «к выплате» по всем педагогам — чтобы видеть сразу, не разворачивая карточки
  useEffect(() => {
    if (!studioId || !teachers.length) return
    let cancelled = false
    const loadSummary = async () => {
      const [{ data: work }, { data: att }, { data: rates }, { data: payouts }] = await Promise.all([
        supabase.from('teacher_work_log').select('*').eq('studio_id', studioId),
        supabase.from('attendance').select('date, direction_id, teacher_id').eq('present', true).eq('studio_id', studioId),
        supabase.from('teacher_rates').select('*').eq('studio_id', studioId),
        supabase.from('teacher_payouts').select('teacher_id, amount').eq('studio_id', studioId),
      ])
      if (cancelled) return
      const paidByTeacher = {}
      ;(payouts || []).forEach(p => { paidByTeacher[p.teacher_id] = (paidByTeacher[p.teacher_id] || 0) + p.amount })
      const map = {}
      teachers.forEach(t => {
        const paid = paidByTeacher[t.id] || 0
        if (t.salary_type === 'salary') {
          map[t.id] = { debt: (t.salary_amount || 0) - paid, lessons: 0, hours: 0, salary: true }
          return
        }
        const earn = calcEarnings({
          work: (work || []).filter(w => w.teacher_id === t.id),
          attendance: att || [],
          rates: (rates || []).filter(r => r.teacher_id === t.id),
          directions,
          teacherId: t.id,
        })
        map[t.id] = { debt: earn.total - paid, lessons: earn.lessons, hours: earn.hours }
      })
      setSummary(map)
    }
    loadSummary()
    return () => { cancelled = true }
  }, [teachers, studioId, directions])

  const save = async (f, rates) => {
    const cleaned = {
      ...f,
      hired: f.hired || null,
      birthday: f.birthday || null,
      contract_date: f.contract_date || null,
      salary_amount: +f.salary_amount || 0,
    }
    if (!cleaned.name?.trim()) { alert('Пожалуйста, укажите ФИО педагога'); return }

    let teacherId = showEdit?.id
    if (showEdit) {
      const { error } = await supabase.from('teachers').update(cleaned).eq('id', showEdit.id)
      if (error) { alert('Ошибка: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('teachers').insert({ ...cleaned, studio_id: studioId }).select().single()
      if (error) { alert('Ошибка: ' + error.message); return }
      teacherId = data.id
    }

    // Ставки по направлениям. Тип ставки определяется форматом оплаты направления
    if (f.salary_type === 'per_lesson' && rates.length > 0) {
      await supabase.from('teacher_rates').delete().eq('teacher_id', teacherId)
      const toInsert = rates
        .filter(r => r.direction_id && (f.direction_ids || []).includes(r.direction_id))
        .map(r => {
          const dir = directions.find(d => d.id === r.direction_id)
          const hourly = isHourly(dir)
          return {
            teacher_id: teacherId,
            studio_id: studioId,
            direction_id: r.direction_id,
            rate_type: hourly ? 'per_hour' : (r.rate_type === 'by_students' ? 'by_students' : 'per_lesson'),
            rate: hourly ? 0 : (+r.rate || 0),
            rate_hour: hourly ? (+r.rate_hour || 0) : 0,
            rate_part: +r.rate_part || 0,
            rate_full: +r.rate_full || 0,
            min_students: +r.min_students || 0,
          }
        })
      if (toInsert.length > 0) await supabase.from('teacher_rates').insert(toInsert)
    }

    setShowAdd(false)
    setShowEdit(null)
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить педагога «${name}»?`)) return
    await supabase.from('teachers').delete().eq('id', id)
    reload()
  }

  // Разовая оплата одного занятия из истории — без выбора периода
  const payOneLesson = async (teacher, lesson) => {
    if (!confirm(`Оплатить занятие ${new Date(lesson.date + 'T00:00:00').toLocaleDateString('ru-RU')} — ${lesson.dirName} на сумму ${fmt(lesson.amount)}?`)) return false
    const { data: payout, error } = await supabase.from('teacher_payouts').insert({
      teacher_id: teacher.id, studio_id: studioId,
      amount: lesson.amount, period_from: lesson.date, period_to: lesson.date,
      lessons_count: lesson.hours === null ? 1 : 0, note: 'Разовая оплата занятия',
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return false }

    const { error: linkErr } = await supabase.from('lesson_payments').insert({
      studio_id: studioId, teacher_id: teacher.id, payout_id: payout.id,
      work_log_id: lesson.workLogId || null, date: lesson.date,
      direction_id: lesson.directionId, amount: lesson.amount,
    })
    if (linkErr) {
      // Откатываем выплату, если привязка не легла (например, занятие уже оплачено)
      await supabase.from('teacher_payouts').delete().eq('id', payout.id)
      alert('Не удалось отметить занятие оплаченным: ' + linkErr.message)
      return false
    }

    await supabase.from('expenses').insert({
      studio_id: studioId, expense_date: new Date().toISOString().slice(0, 10),
      expense_type: 'Зарплата', category: 'Разовый', amount: lesson.amount,
      comment: `${teacher.name}: разовая оплата занятия ${lesson.date}`,
    })
    reload()
    return true
  }

  const savePayout = async ({ amount, periodFrom, periodTo, note, lessonsCount, items }) => {
    const { data: payout, error } = await supabase.from('teacher_payouts').insert({
      teacher_id: showPayout.id,
      studio_id: studioId,
      amount, period_from: periodFrom, period_to: periodTo,
      lessons_count: lessonsCount, note,
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return }

    // Помечаем занятия оплаченными этой выплатой
    if (items && items.length > 0) {
      const links = items.map(i => ({
        studio_id: studioId,
        teacher_id: showPayout.id,
        payout_id: payout.id,
        work_log_id: i.workLogId || null,
        date: i.date,
        direction_id: i.directionId,
        amount: i.amount,
      }))
      const { error: linkErr } = await supabase.from('lesson_payments').insert(links)
      if (linkErr) console.warn('lesson_payments:', linkErr.message)
    }

    await supabase.from('expenses').insert({
      studio_id: studioId,
      expense_date: new Date().toISOString().slice(0, 10),
      expense_type: 'Зарплата',
      category: 'Разовый',
      amount,
      comment: `${showPayout.name}: ${note || 'выплата'}`,
    })
    setShowPayout(null)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Добавить педагога</button>
      </div>

      {teachers.length === 0 && (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">👩‍🏫</div>
          <div className="empty-text">Педагогов нет</div>
        </div>
      )}

      {teachers.map(t => (
        <TeacherCard
          key={t.id}
          teacher={t}
          directions={directions}
          studioId={studioId}
          onEdit={setShowEdit}
          onDelete={del}
          onPayout={setShowPayout}
          summary={summary[t.id]}
          onPayOne={payOneLesson}
        />
      ))}

      {showAdd && (
        <TeacherModal directions={directions} studioId={studioId} onClose={() => setShowAdd(false)} onSave={save} />
      )}
      {showEdit && (
        <TeacherModal teacher={showEdit} directions={directions} studioId={studioId} onClose={() => setShowEdit(null)} onSave={save} />
      )}
      {showPayout && (
        <PayoutModal teacher={showPayout} directions={directions} studioId={studioId} onClose={() => setShowPayout(null)} onSave={savePayout} />
      )}
    </div>
  )
}
