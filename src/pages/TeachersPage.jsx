import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { T, fmt, hashColor, todayLocal, ruDate } from '../styles.jsx'
import { Modal } from '../components/Modal'
import DeleteOrArchiveModal from '../components/DeleteOrArchiveModal'
import { TEACHER_TRACES, countTraces, setArchived } from '../lib/archive'

const STATUS_T = { 'Активен': 'badge-green', 'В поиске': 'badge-orange', 'Ожидание': 'badge-purple', 'Уволен': 'badge-gray' }
const STATUSES_T = ['Активен', 'В поиске', 'Ожидание', 'Уволен']

// Формат оплаты направления определяет, какую ставку задавать педагогу
const isHourly = (dir) => dir?.payment_type === 'per_hour'

// Расчёт заработка по журналу работы.
// Журнал — источник правды: он говорит, кто работал и сколько часов.
// Для занятий до его появления есть запасной путь — отметки посещаемости.
// paidAmountByWorkLog / paidAmountByLegacy — сколько РЕАЛЬНО заплатили за
// уже оплаченное занятие. Без них выплаченное пересчитывалось по текущим
// ставкам: поменяла ставку после выплаты — и закрытый месяц снова показывал
// долг или переплату. Оплаченное занятие считается по факту, а не по прайсу.
function calcEarnings({ work = [], attendance = [], rates = [], directions = [], teacherId, paidWorkLogIds = new Set(), paidLegacyKeys = new Set(), paidAmountByWorkLog = {}, paidAmountByLegacy = {} }) {
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

  // Ставка ищется сначала по конкретной подгруппе, затем «на всё
  // направление» (group_id = 0). Так занятие, проведённое в подгруппе
  // без своей ставки, считается по общей — а не в ноль.
  const rateFor = (dirId, groupId) =>
    rates.find(r => r.direction_id === dirId && +r.group_id === +(groupId || 0))
    || rates.find(r => r.direction_id === dirId && +r.group_id === 0)

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
    const rate = rateFor(w.direction_id, w.group_id)
    const hourly = dir?.payment_type === 'per_hour'
    const isPaid = paidWorkLogIds.has(w.id)
    const calc = hourly
      ? (+w.hours || 0) * (rate?.rate_hour || 0)
      : lessonRate(rate, `${w.date}_${w.direction_id}`)
    // Оплаченное — по зафиксированной сумме, остальное — по текущей ставке
    const amount = isPaid && paidAmountByWorkLog[w.id] != null
      ? +paidAmountByWorkLog[w.id]
      : calc
    add(w.direction_id, hourly ? { hours: +w.hours || 0, amount } : { lessons: 1, amount })
    items.push({
      workLogId: w.id, date: w.date, directionId: w.direction_id, groupId: +(w.group_id || 0),
      hours: hourly ? (+w.hours || 0) : null, amount,
      paid: isPaid,
      fromLog: true,
    })
  })

  // Запасной путь: занятия, которых нет в журнале.
  //
  // Отметка считается «уже учтённой» по двум разным правилам:
  //   • отметка знает свою подгруппу → журнал должен быть по этой же
  //     подгруппе. Заполнено «Утро», «Вечер» пуст — вечернее занятие
  //     всё равно попадёт в начисления по отметкам;
  //   • отметка без подгруппы (сделана до 12.08.2026) → хватает журнала
  //     по направлению за этот день, иначе старое занятие задвоится
  //     с журнальным, где подгруппа уже проставлена.
  const coveredDir = new Set(work.map(w => `${w.date}_${w.direction_id}`))
  const coveredGroup = new Set(work.map(w => `${w.date}_${w.direction_id}_${+(w.group_id || 0)}`))
  const seen = new Set()
  attendance.forEach(a => {
    if (a.teacher_id !== teacherId) return
    const gid = +(a.group_id || 0)
    const k = `${a.date}_${a.direction_id}`
    // Между собой отметки различаются по подгруппе: «Утро» и «Вечер»
    // в один день — два занятия, а не одно
    const seenKey = `${k}_${gid}`
    const isCovered = gid ? coveredGroup.has(seenKey) : coveredDir.has(k)
    if (isCovered || seen.has(seenKey)) return
    seen.add(seenKey)
    const legacyKey = `${a.date}_${a.direction_id}_${gid}`
    const isPaid = paidLegacyKeys.has(legacyKey)
    const amount = isPaid && paidAmountByLegacy[legacyKey] != null
      ? +paidAmountByLegacy[legacyKey]
      : lessonRate(rateFor(a.direction_id, gid), k)
    add(a.direction_id, { lessons: 1, amount })
    items.push({
      workLogId: null, date: a.date, directionId: a.direction_id, groupId: gid,
      hours: null, amount,
      paid: isPaid,
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
    group_ids: teacher.group_ids || [],
    status: teacher.status || 'Активен', hired: teacher.hired || '',
    birthday: teacher.birthday || '', contract_date: teacher.contract_date || '',
    salary_type: teacher.salary_type || 'per_lesson', // 'per_lesson' (сделка) | 'salary' (оклад)
    salary_amount: teacher.salary_amount || 0,
  } : {
    name: '', phone: '', direction_ids: [], group_ids: [], status: 'Активен',
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

  // Ставка адресуется парой «направление + подгруппа». 0 = на всё направление
  const getRateForDir = (dirId, groupId = 0) =>
    rates.find(r => r.direction_id === dirId && +(r.group_id || 0) === +groupId)

  const setRate = (dirId, groupId, field, value) => {
    const gid = +(groupId || 0)
    setRates(prev => {
      const existing = prev.find(r => r.direction_id === dirId && +(r.group_id || 0) === gid)
      if (existing) return prev.map(r =>
        (r.direction_id === dirId && +(r.group_id || 0) === gid) ? { ...r, [field]: value } : r)
      return [...prev, { direction_id: dirId, group_id: gid, teacher_id: teacher?.id, studio_id: studioId, rate_type: 'per_lesson', rate: 0, rate_hour: 0, rate_part: 0, rate_full: 0, min_students: 0, [field]: value }]
    })
  }

  const selectedDirs = directions.filter(d => (f.direction_ids || []).includes(d.id))

  // Настоящие подгруппы — те, которых больше одной. Одна подгруппа —
  // это обычное расписание направления, служебная «Основная»;
  // показывать её как выбор было бы шумом.
  const realGroups = (d) => {
    const gs = (d.groups || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    return gs.length > 1 ? gs : []
  }

  // Подгруппы направления, отмеченные у педагога
  const chosenGroups = (d) => realGroups(d).filter(g => (f.group_ids || []).includes(g.id))

  const toggleGroup = (gid) => {
    const cur = f.group_ids || []
    set('group_ids', cur.includes(gid) ? cur.filter(x => x !== gid) : [...cur, gid])
  }

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
          {f.status === 'Уволен' && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
              Останется в списке, пока есть невыплаченное. После полного
              расчёта уйдёт в архив — занятия, ставки и выплаты сохранятся.
            </div>
          )}
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
              <button onClick={() => { set('hired', todayLocal()); setHiredError(false) }}
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
          {directions.filter(d => !d.archived_at || (f.direction_ids || []).includes(d.id)).map(d => {
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
              const groups = realGroups(d)
              const chosen = chosenGroups(d)
              // Ставку заводим на каждую отмеченную подгруппу; если не
              // отмечено ни одной — одна ставка на всё направление (0)
              const targets = chosen.length
                ? chosen.map(g => ({ gid: g.id, label: g.name }))
                : [{ gid: 0, label: null }]

              return (
                <div key={d.id} style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{d.name}</div>
                    <span style={{ background: hourly ? '#fff4e6' : T.greenBg, color: hourly ? '#c47a00' : T.greenDark, borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                      {hourly ? '⏱ за час' : '📚 за занятие'}
                    </span>
                  </div>

                  {/* Подгруппы — только там, где их реально больше одной */}
                  {groups.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {groups.map(g => {
                          const on = (f.group_ids || []).includes(g.id)
                          return (
                            <label key={g.id} className={`chip ${on ? 'chip-active' : 'chip-inactive'}`}
                              style={{ fontSize: 12 }}>
                              <input type="checkbox" checked={on} style={{ display: 'none' }}
                                onChange={() => toggleGroup(g.id)} />
                              {g.name || 'Без названия'}
                            </label>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                        {chosen.length
                          ? 'Ведёт отмеченные подгруппы. У каждой своя ставка — ниже.'
                          : 'Ничего не отмечено — ведёт все подгруппы, ставка одна на направление. Отметьте, если ставки различаются.'}
                      </div>
                    </div>
                  )}

                  {targets.map(({ gid, label }) => {
                    // rate_type мог приехать пустым (старые строки, импорт).
                    // Расчёт такую строку считает как «фикс» — кнопки должны
                    // говорить то же самое, а не стоять обе неподсвеченными.
                    const rawRate = getRateForDir(d.id, gid)
                    const fallbackType = hourly ? 'per_hour' : 'per_lesson'
                    const r = rawRate
                      ? { ...rawRate, rate_type: rawRate.rate_type || fallbackType }
                      : { rate_type: fallbackType, rate: 0, rate_hour: 0, rate_part: 0, rate_full: 0, min_students: 0 }
                    return (
                      <div key={gid} style={targets.length > 1
                        ? { background: 'white', borderRadius: 10, padding: '10px 12px', marginTop: 8, border: `1px solid ${T.border}` }
                        : undefined}>
                        {label && (
                          <div style={{ fontWeight: 700, fontSize: 12, color: T.greenDark, marginBottom: 8 }}>📍 {label}</div>
                        )}

                        {hourly ? (
                          <div className="form-row">
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Ставка за час, ₽</label>
                              <input className="form-input" type="number" value={r.rate_hour}
                                onChange={e => setRate(d.id, gid, 'rate_hour', e.target.value)}
                                onFocus={e => { if (+e.target.value === 0) setRate(d.id, gid, 'rate_hour', '') }}
                                onBlur={e => { if (e.target.value === '') setRate(d.id, gid, 'rate_hour', 0) }}
                                placeholder="500" />
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                                Отработанные часы отмечаются в расписании
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              {[['per_lesson', 'Фикс за занятие'], ['by_students', 'По кол-ву учеников']].map(([val, lbl]) => (
                                <label key={val} onClick={() => setRate(d.id, gid, 'rate_type', val)} style={{
                                  flex: 1, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'center',
                                  border: `2px solid ${r.rate_type === val ? T.green : T.border}`,
                                  background: r.rate_type === val ? T.greenBg : 'white',
                                  color: r.rate_type === val ? T.greenDark : T.ink,
                                }}>{lbl}</label>
                              ))}
                            </div>
                            {r.rate_type !== 'by_students' && (
                              <div className="form-row">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label className="form-label">Ставка, ₽</label>
                                  <input className="form-input" type="number" value={r.rate}
                                    onChange={e => setRate(d.id, gid, 'rate', e.target.value)}
                                    onFocus={e => { if (+e.target.value === 0) setRate(d.id, gid, 'rate', '') }}
                                    onBlur={e => { if (e.target.value === '') setRate(d.id, gid, 'rate', 0) }} />
                                </div>
                              </div>
                            )}
                            {r.rate_type === 'by_students' && (
                              <div className="form-row">
                                <div className="form-group">
                                  <label className="form-label">Неполная группа, ₽</label>
                                  <input className="form-input" type="number" value={r.rate_part}
                                    onChange={e => setRate(d.id, gid, 'rate_part', e.target.value)}
                                    onFocus={e => { if (+e.target.value === 0) setRate(d.id, gid, 'rate_part', '') }}
                                    onBlur={e => { if (e.target.value === '') setRate(d.id, gid, 'rate_part', 0) }} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Полная группа, ₽</label>
                                  <input className="form-input" type="number" value={r.rate_full}
                                    onChange={e => setRate(d.id, gid, 'rate_full', e.target.value)}
                                    onFocus={e => { if (+e.target.value === 0) setRate(d.id, gid, 'rate_full', '') }}
                                    onBlur={e => { if (e.target.value === '') setRate(d.id, gid, 'rate_full', 0) }} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Полная группа от (чел.)</label>
                                  <input className="form-input" type="number" value={r.min_students}
                                    onChange={e => setRate(d.id, gid, 'min_students', e.target.value)}
                                    onFocus={e => { if (+e.target.value === 0) setRate(d.id, gid, 'min_students', '') }}
                                    onBlur={e => { if (e.target.value === '') setRate(d.id, gid, 'min_students', 0) }}
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
  const today = todayLocal()
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
      supabase.from('attendance').select('date, direction_id, group_id, teacher_id')
        .eq('present', true).gte('date', periodFrom).lte('date', periodTo)
        .eq('studio_id', studioId),
      supabase.from('teacher_rates').select('*').eq('teacher_id', teacher.id),
      // Уже оплаченные занятия — чтобы не заплатить дважды
      supabase.from('lesson_payments').select('work_log_id, date, direction_id, group_id')
        .eq('teacher_id', teacher.id),
    ])
    const paidWorkLogIds = new Set((lp || []).filter(x => x.work_log_id).map(x => x.work_log_id))
    const paidLegacyKeys = new Set((lp || []).filter(x => !x.work_log_id).map(x => `${x.date}_${x.direction_id}_${+(x.group_id || 0)}`))

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
          disabled={!calculated || amount <= 0}>Создать выплату</button>
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
        <label className="form-label">Комментарий</label>
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Зарплата за июнь" />
      </div>
    </Modal>
  )
}

// ── Карточка педагога (раскрывающаяся) ──────────────────────
function TeacherCard({ teacher, directions, studioId, onEdit, onDelete, onPayout, summary, onPayOne, reload, refreshKey = 0 }) {
  const [justPaid, setJustPaid] = useState(new Set())  // занятия, оплаченные прямо сейчас — до перезагрузки
  const [confirmPay, setConfirmPay] = useState(null)   // занятие, ждущее подтверждения оплаты
  const [payingOne, setPayingOne] = useState(false)
  const [cancelPayout, setCancelPayout] = useState(null)  // выплата, ждущая подтверждения отмены
  const [cancelling, setCancelling] = useState(false)
  const [selectedPayout, setSelectedPayout] = useState(null)  // подсвечиваем занятия этой выплаты

  const doCancelPayout = async (payout) => {
    setCancelling(true)
    // Каскад в БД сам снимет привязки занятий (lesson_payments) и расход (expenses)
    const { error } = await supabase.from('teacher_payouts').delete().eq('id', payout.id)
    setCancelling(false)
    if (error) { alert('Ошибка отмены: ' + error.message); return }
    setCancelPayout(null)
    // Раньше история только сбрасывалась и перечитывалась при следующем
    // открытии: в раскрытой карточке отменённая выплата оставалась на
    // экране. Перечитываем сразу.
    setJustPaid(new Set())
    setSelectedPayout(null)
    await loadDetails(true)
    reload()
  }
  const [open, setOpen] = useState(false)
  const [payouts, setPayouts] = useState([])
  const [attStats, setAttStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [rates, setRates] = useState([])

  const [workLog, setWorkLog] = useState([])
  const [paidLinks, setPaidLinks] = useState([])

  const loadDetails = async (force = false) => {
    if (attStats && !force) return
    setLoadingStats(true)
    const [{ data: work }, { data: att }, { data: py }, { data: rt }, { data: lp }] = await Promise.all([
      supabase.from('teacher_work_log').select('*').eq('teacher_id', teacher.id).eq('studio_id', studioId),
      supabase.from('attendance').select('date, direction_id, group_id, teacher_id').eq('present', true).eq('studio_id', studioId),
      supabase.from('teacher_payouts').select('*').eq('teacher_id', teacher.id).order('created_at', { ascending: false }),
      supabase.from('teacher_rates').select('*').eq('teacher_id', teacher.id),
      supabase.from('lesson_payments').select('work_log_id, date, direction_id, group_id, payout_id, amount').eq('teacher_id', teacher.id),
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

  // Ставки и начисления кэшируются до первого открытия карточки, поэтому
  // после сохранения модалки раскрытая карточка показывала старое, пока не
  // обновишь страницу. refreshKey меняется после каждого сохранения —
  // сбрасываем кэш, а открытую карточку сразу перечитываем
  useEffect(() => {
    if (!refreshKey) return
    setAttStats(null)
    if (open) loadDetails(true)
  }, [refreshKey])

  const totalPaid = payouts.reduce((s, p) => s + p.amount, 0)
  const dirNames = (teacher.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean)

  const paidWorkLogIds = new Set(paidLinks.filter(x => x.work_log_id).map(x => x.work_log_id))
  const paidLegacyKeys = new Set(paidLinks.filter(x => !x.work_log_id).map(x => `${x.date}_${x.direction_id}_${+(x.group_id || 0)}`))
  // Сколько реально заплатили за каждое закрытое занятие
  const paidAmountByWorkLog = {}
  const paidAmountByLegacy = {}
  paidLinks.forEach(x => {
    if (x.amount == null) return
    if (x.work_log_id) paidAmountByWorkLog[x.work_log_id] = x.amount
    else paidAmountByLegacy[`${x.date}_${x.direction_id}_${+(x.group_id || 0)}`] = x.amount
  })
  // Какой выплатой закрыто каждое занятие — для подсветки по клику на выплату
  const payoutByWorkLog = {}
  const payoutByLegacy = {}
  paidLinks.forEach(x => {
    if (x.work_log_id) payoutByWorkLog[x.work_log_id] = x.payout_id
    else payoutByLegacy[`${x.date}_${x.direction_id}_${+(x.group_id || 0)}`] = x.payout_id
  })

  // Всё заработанное за всё время — по журналу, с запасным путём на посещаемость
  const earn = attStats ? calcEarnings({
    work: workLog, attendance: attStats, rates, directions, teacherId: teacher.id,
    paidWorkLogIds, paidLegacyKeys, paidAmountByWorkLog, paidAmountByLegacy,
  }) : null
  const totalEarned = attStats
    ? (teacher.salary_type === 'salary' ? (teacher.salary_amount || 0) : earn.total)
    : null
  const lessonsCount = earn ? earn.lessons : (attStats?.filter(a => a.teacher_id === teacher.id).length || 0)
  const debt = totalEarned !== null ? totalEarned - totalPaid : null

  // История занятий с признаком оплаты — прямо из движка расчёта
  const lessonHistory = earn ? earn.items.map(i => {
    const dir = directions.find(d => d.id === i.directionId)
    const payoutId = i.workLogId ? payoutByWorkLog[i.workLogId] : payoutByLegacy[`${i.date}_${i.directionId}_${+(i.groupId || 0)}`]
    return {
      workLogId: i.workLogId, date: i.date,
      dirName: dir?.name || 'Направление удалено', color: dir?.color,
      // Название подгруппы — чтобы в истории было видно, какое из двух
      // занятий в один день чем оплачено
      groupName: +(i.groupId || 0)
        ? ((dir?.groups || []).find(g => g.id === +i.groupId)?.name || null)
        : null,
      hours: i.hours, amount: i.amount, paid: i.paid, fromLog: i.fromLog,
      directionId: i.directionId, groupId: +(i.groupId || 0), payoutId: payoutId || null,
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
                      const grp = +(r.group_id || 0)
                        ? (dir?.groups || []).find(g => g.id === +r.group_id)
                        : null
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                          <span style={{ color: T.ink }}>
                            {dir?.name || '—'}
                            {grp && <span style={{ marginLeft: 6, fontSize: 11, color: T.muted }}>📍 {grp.name}</span>}
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
                      const lkey = l.workLogId ? `wl_${l.workLogId}` : `lg_${l.date}_${l.directionId}_${+(l.groupId || 0)}`
                      const paid = l.paid || justPaid.has(lkey)
                      const inSelected = selectedPayout && l.payoutId === selectedPayout
                      return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8,
                        borderLeft: `3px solid ${l.color || '#ddd'}`,
                        background: inSelected ? '#b7e4c4' : paid ? '#e8f5ec' : '#fdeef0',
                        outline: inSelected ? '2px solid #34a853' : 'none',
                        transition: 'background 0.15s, outline 0.15s',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 92 }}>
                          {new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' })}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, color: T.ink }}>
                          {l.dirName}
                          {l.groupName && <span style={{ marginLeft: 6, fontSize: 11, color: T.muted }}>📍 {l.groupName}</span>}
                        </div>
                        {l.hours !== null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#c47a00', background: '#fff4e6', borderRadius: 6, padding: '1px 8px' }}>{l.hours} ч.</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: paid ? T.greenDark : '#c0392b', minWidth: 68, textAlign: 'right' }}>
                          {fmt(l.amount)}{paid ? ' ✓' : ''}
                        </span>
                        {!l.fromLog && (
                          <span style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>по отметкам</span>
                        )}
                        {!paid && l.amount > 0 && onPayOne && (
                          <button className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 10px' }}
                            onClick={() => setConfirmPay({ ...l, _lkey: lkey })}>Оплатить</button>
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
                    {payouts.slice(0, 5).map(p => {
                      const active = selectedPayout === p.id
                      return (
                      <div key={p.id} onClick={() => setSelectedPayout(active ? null : p.id)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
                          background: active ? '#e8f5ec' : T.cream, borderRadius: 8, cursor: 'pointer',
                          outline: active ? '2px solid #34a853' : 'none', transition: 'all 0.15s' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{fmt(p.amount)}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>
                            {p.period_from === p.period_to
                              ? ruDate(p.period_from)
                              : `${ruDate(p.period_from)} — ${ruDate(p.period_to)}`} · {p.lessons_count} зан.
                          </div>
                          {p.note && <div style={{ fontSize: 11, color: T.muted }}>{p.note}</div>}
                          {active && <div style={{ fontSize: 11, color: T.greenDark, fontWeight: 600, marginTop: 2 }}>↑ занятия этой выплаты подсвечены выше</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 11, color: T.muted }}>{ruDate(p.created_at)}</div>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: '#e05a5a', padding: '2px 8px' }}
                            onClick={(e) => { e.stopPropagation(); setCancelPayout(p) }}>Отменить</button>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>

              {(teacher.hired || teacher.contract_date || teacher.phone) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {teacher.phone && <div><div style={{ fontSize: 11, color: T.muted }}>Телефон</div><div style={{ fontSize: 13 }}>{teacher.phone}</div></div>}
                  {teacher.hired && <div><div style={{ fontSize: 11, color: T.muted }}>Принят</div><div style={{ fontSize: 13 }}>{ruDate(teacher.hired)}</div></div>}
                  {teacher.contract_date && <div><div style={{ fontSize: 11, color: T.muted }}>Договор</div><div style={{ fontSize: 13 }}>{ruDate(teacher.contract_date)}</div></div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => onPayout(teacher)}>💰 Выплата</button>
                <button className="btn btn-outline btn-sm" onClick={() => onEdit(teacher)}>✏️ Редактировать</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onDelete(teacher.id, teacher.name)} style={{ color: '#e05a5a' }}>🗑️ Удалить или в архив</button>
              </div>
            </>
          )}
        </div>
      )}

      {confirmPay && (
        <Modal title="Оплата занятия" onClose={() => setConfirmPay(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setConfirmPay(null)} disabled={payingOne}>Отмена</button>
            <button className="btn btn-primary" disabled={payingOne}
              onClick={async () => {
                setPayingOne(true)
                const ok = await onPayOne(teacher, confirmPay)
                setPayingOne(false)
                if (ok) {
                  setJustPaid(prev => new Set(prev).add(confirmPay._lkey))
                  setConfirmPay(null)
                }
              }}>{payingOne ? 'Оплачиваем…' : '✓ Оплатить'}</button>
          </>}>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
            Оплатить занятие педагогу <strong>{teacher.name}</strong>?
          </div>
          <div style={{ background: T.cream, borderRadius: 12, padding: '14px 16px', marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.muted }}>Дата</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{new Date(confirmPay.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.muted }}>Направление</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{confirmPay.dirName}</span>
            </div>
            {confirmPay.hours !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: T.muted }}>Часов</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{confirmPay.hours} ч.</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 8, borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>К оплате</span>
              <span style={{ fontFamily: 'Nunito,sans-serif', fontSize: 18, fontWeight: 800, color: T.greenDark }}>{fmt(confirmPay.amount)}</span>
            </div>
          </div>
        </Modal>
      )}
      {cancelPayout && (
        <Modal title="Отмена выплаты" onClose={() => setCancelPayout(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setCancelPayout(null)} disabled={cancelling}>Не отменять</button>
            <button className="btn btn-primary" style={{ background: '#e05a5a' }} disabled={cancelling}
              onClick={() => doCancelPayout(cancelPayout)}>{cancelling ? 'Отменяем…' : 'Отменить выплату'}</button>
          </>}>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
            Отменить выплату <strong>{fmt(cancelPayout.amount)}</strong> педагогу <strong>{teacher.name}</strong>?
          </div>
          <div style={{ background: '#fff4e6', borderRadius: 12, padding: '12px 16px', marginTop: 14, fontSize: 13, color: '#c47a00', lineHeight: 1.5 }}>
            Занятия, закрытые этой выплатой, снова станут неоплаченными, а запись из расходов удалится. Отменить это действие нельзя.
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Главная страница ──
export default function TeachersPage({ teachers, directions, reload, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showPayout, setShowPayout] = useState(null)
  const [summary, setSummary] = useState({}) // teacher_id → { debt, lessons, hours }
  const [refreshKey, setRefreshKey] = useState(0)    // растёт после сохранений
  const [rateAlerts, setRateAlerts] = useState([])   // подгруппы без ставки
  const [dismissed, setDismissed] = useState(new Set()) // скрытые лично мной
  const [deleteAsk, setDeleteAsk] = useState(null)      // карточка, ждущая решения
  const [busy, setBusy] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const autoArchived = useRef(new Set())                // чтобы не писать повторно

  // ── Подгруппы, за которые педагогу нечего платить ────────────────────────
  // Ставка ищется «подгруппа → направление (group_id = 0)». Проблема там,
  // где итоговая ставка нулевая: строки может не быть вовсе, а может быть
  // заведённая пустышка с нулём — для денег это одно и то же, занятие
  // считается в ноль. Педагог с отмеченными чипами подгрупп ведёт только их,
  // с пустым group_ids — все подгруппы своих направлений.
  useEffect(() => {
    if (!studioId || !teachers.length) return
    let cancelled = false
    const loadAlerts = async () => {
      const { data: user } = await supabase.auth.getUser()
      const uid = user?.user?.id
      const [{ data: rates }, { data: dis }] = await Promise.all([
        supabase.from('teacher_rates').select('*').eq('studio_id', studioId),
        uid
          ? supabase.from('alert_dismissals').select('alert_key').eq('studio_id', studioId).eq('user_id', uid)
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      setDismissed(new Set((dis || []).map(d => d.alert_key)))

      const byKey = {}
      ;(rates || []).forEach(r => { byKey[`${r.teacher_id}_${r.direction_id}_${+(r.group_id || 0)}`] = r })
      // Ставка «есть» только если по ней реально начислятся деньги
      const paying = (r, hourly) => {
        if (!r) return false
        if (hourly) return +r.rate_hour > 0
        if (r.rate_type === 'by_students') return +r.rate_part > 0 || +r.rate_full > 0
        return +r.rate > 0
      }

      const problems = []
      teachers.filter(t => t.status !== 'Уволен' && !t.archived_at && t.salary_type !== 'salary').forEach(t => {
        ;(t.direction_ids || []).forEach(dirId => {
          const dir = directions.find(d => d.id === dirId)
          if (!dir) return
          const hourly = isHourly(dir)
          const groups = dir.groups || []
          // Одна подгруппа = обычное направление, ставка на неё общая
          if (groups.length < 2) return
          const common = byKey[`${t.id}_${dirId}_0`]
          if (paying(common, hourly)) return   // общая ставка закрывает всё
          const mine = (t.group_ids || []).length
            ? groups.filter(g => (t.group_ids || []).includes(g.id))
            : null
          // Чипы не отмечены — педагог ведёт всё направление по одной ставке.
          // Проблема тут одна, а не по строке на каждую подгруппу
          if (!mine) {
            problems.push({
              key: `teacher_rate_missing:${t.id}:0`,
              teacherId: t.id, teacherName: t.name,
              dirName: dir.name, groupName: null,
            })
            return
          }
          mine.forEach(g => {
            if (paying(byKey[`${t.id}_${dirId}_${g.id}`], hourly)) return
            problems.push({
              key: `teacher_rate_missing:${t.id}:${g.id}`,
              teacherId: t.id, teacherName: t.name,
              dirName: dir.name, groupName: g.name || 'без названия',
            })
          })
        })
      })
      setRateAlerts(problems)
    }
    loadAlerts()
    return () => { cancelled = true }
  }, [teachers, directions, studioId])

  // Скрытие личное и точечное: появится новая подгруппа без ставки — придёт снова
  const dismissAlert = async (key) => {
    setDismissed(prev => new Set([...prev, key]))
    const { data: user } = await supabase.auth.getUser()
    const uid = user?.user?.id
    if (!uid) return
    const { error } = await supabase.from('alert_dismissals')
      .upsert({ studio_id: studioId, user_id: uid, alert_key: key }, { onConflict: 'studio_id,user_id,alert_key' })
    if (error) {
      console.warn('alert_dismissals:', error.message)
      setDismissed(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const visibleAlerts = rateAlerts.filter(a => !dismissed.has(a.key))

  // Одним махом считаем «к выплате» по всем педагогам — чтобы видеть сразу, не разворачивая карточки
  useEffect(() => {
    if (!studioId || !teachers.length) return
    let cancelled = false
    const loadSummary = async () => {
      const [{ data: work }, { data: att }, { data: rates }, { data: payouts }, { data: links }] = await Promise.all([
        supabase.from('teacher_work_log').select('*').eq('studio_id', studioId),
        supabase.from('attendance').select('date, direction_id, group_id, teacher_id').eq('present', true).eq('studio_id', studioId),
        supabase.from('teacher_rates').select('*').eq('studio_id', studioId),
        supabase.from('teacher_payouts').select('teacher_id, amount').eq('studio_id', studioId),
        supabase.from('lesson_payments').select('teacher_id, work_log_id, date, direction_id, group_id, amount').eq('studio_id', studioId),
      ])
      if (cancelled) return
      const paidByTeacher = {}
      ;(payouts || []).forEach(p => { paidByTeacher[p.teacher_id] = (paidByTeacher[p.teacher_id] || 0) + p.amount })
      // Закрытые занятия и их фактические суммы — по каждому педагогу
      const linksByTeacher = {}
      ;(links || []).forEach(x => {
        if (!linksByTeacher[x.teacher_id]) linksByTeacher[x.teacher_id] = []
        linksByTeacher[x.teacher_id].push(x)
      })
      const map = {}
      teachers.forEach(t => {
        const paid = paidByTeacher[t.id] || 0
        if (t.salary_type === 'salary') {
          map[t.id] = { debt: (t.salary_amount || 0) - paid, lessons: 0, hours: 0, salary: true }
          return
        }
        const my = linksByTeacher[t.id] || []
        const paidWorkLogIds = new Set(my.filter(x => x.work_log_id).map(x => x.work_log_id))
        const paidLegacyKeys = new Set(my.filter(x => !x.work_log_id).map(x => `${x.date}_${x.direction_id}_${+(x.group_id || 0)}`))
        const paidAmountByWorkLog = {}
        const paidAmountByLegacy = {}
        my.forEach(x => {
          if (x.amount == null) return
          if (x.work_log_id) paidAmountByWorkLog[x.work_log_id] = x.amount
          else paidAmountByLegacy[`${x.date}_${x.direction_id}_${+(x.group_id || 0)}`] = x.amount
        })
        const earn = calcEarnings({
          work: (work || []).filter(w => w.teacher_id === t.id),
          attendance: att || [],
          rates: (rates || []).filter(r => r.teacher_id === t.id),
          directions,
          teacherId: t.id,
          paidWorkLogIds, paidLegacyKeys, paidAmountByWorkLog, paidAmountByLegacy,
        })
        map[t.id] = { debt: earn.total - paid, lessons: earn.lessons, hours: earn.hours }
      })
      setSummary(map)
    }
    loadSummary()
    return () => { cancelled = true }
  }, [teachers, studioId, directions])

  // ── Авто-архив уволенных ─────────────────────────────────────
  // Уволенный остаётся на виду, пока с ним не рассчитались: карточка
  // с долгом не должна пропадать из списка. Как только долг закрыт —
  // уходит в архив сама. Долг считается по той же сводке, что видна
  // в списке, поэтому расхождения между экраном и решением нет.
  useEffect(() => {
    if (!studioId || !Object.keys(summary).length) return
    const ready = teachers.filter(t =>
      t.status === 'Уволен' &&
      !t.archived_at &&
      summary[t.id] &&
      Math.round(summary[t.id].debt || 0) <= 0 &&
      !autoArchived.current.has(t.id)
    )
    if (!ready.length) return
    ready.forEach(t => autoArchived.current.add(t.id))
    Promise.all(ready.map(t => setArchived('teachers', t.id, studioId, true)))
      .then(() => reload())
  }, [summary, teachers, studioId])

  const activeTeachers = teachers.filter(t => !t.archived_at)
  const archivedTeachers = teachers.filter(t => t.archived_at)

  const save = async (f, rates) => {
    // Подгруппы снятых направлений в списке оставаться не должны
    const liveGroupIds = new Set(
      directions
        .filter(d => (f.direction_ids || []).includes(d.id))
        .flatMap(d => (d.groups || []).map(g => g.id))
    )
    const cleanGroupIds = (f.group_ids || []).map(Number).filter(id => liveGroupIds.has(id))

    const cleaned = {
      ...f,
      group_ids: cleanGroupIds,
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
        // Ставка по подгруппе имеет смысл, только пока эта подгруппа
        // отмечена у педагога. Сняли отметку — ставка не сохраняется,
        // занятия считаются по ставке направления.
        // Обратное тоже верно: если подгруппы отмечены, ставка «на всё
        // направление» (0) не редактируется в карточке и остаётся нулём —
        // мусорной строкой, из-за которой начисление молча уходит в ноль
        .filter(r => {
          const gid = +(r.group_id || 0)
          if (gid) return cleanGroupIds.includes(gid)
          const groups = directions.find(d => d.id === r.direction_id)?.groups || []
          const hasChosen = groups.length > 1 && groups.some(g => cleanGroupIds.includes(g.id))
          return !hasChosen
        })
        .map(r => {
          const dir = directions.find(d => d.id === r.direction_id)
          const hourly = isHourly(dir)
          return {
            teacher_id: teacherId,
            studio_id: studioId,
            direction_id: r.direction_id,
            group_id: +(r.group_id || 0),
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
    setRefreshKey(k => k + 1)
    reload()
  }

  // Удаление разрешено только пустой карточке. Всё, за чем числится
  // история, уходит в архив: начисления считаются заново из журнала и
  // отметок, поэтому снос записи молча переписал бы прошлое.
  const del = async (id, name) => {
    const teacher = teachers.find(t => t.id === id)
    setDeleteAsk({ id, name, loading: true })
    const traces = await countTraces(TEACHER_TRACES, id, studioId)
    setDeleteAsk({ id, name, loading: false, traces, archived: !!teacher?.archived_at })
  }

  const doDelete = async () => {
    const { id, name } = deleteAsk
    setBusy(true)
    // Ставки — не история, сами по себе удалению не мешают, но
    // осиротеть не должны
    await supabase.from('teacher_rates').delete().eq('teacher_id', id).eq('studio_id', studioId)
    const { error } = await supabase.from('teachers').delete().eq('id', id).eq('studio_id', studioId)
    setBusy(false)
    if (error) { alert(`Удалить «${name}» не получилось: ${error.message}`); return }
    setDeleteAsk(null)
    reload()
  }

  const doArchive = async (id, archived) => {
    setBusy(true)
    const { error } = await setArchived('teachers', id, studioId, archived)
    setBusy(false)
    if (error) { alert('Ошибка: ' + error.message); return }
    setDeleteAsk(null)
    reload()
  }

  // Разовая оплата одного занятия из истории — без выбора периода
  const payOneLesson = async (teacher, lesson) => {
    const { data: payout, error } = await supabase.from('teacher_payouts').insert({
      teacher_id: teacher.id, studio_id: studioId,
      amount: lesson.amount, period_from: lesson.date, period_to: lesson.date,
      lessons_count: lesson.hours === null ? 1 : 0, note: 'Разовая оплата занятия',
    }).select().single()
    if (error) { alert('Ошибка: ' + error.message); return false }

    const { error: linkErr } = await supabase.from('lesson_payments').insert({
      studio_id: studioId, teacher_id: teacher.id, payout_id: payout.id,
      work_log_id: lesson.workLogId || null, date: lesson.date,
      direction_id: lesson.directionId, group_id: +(lesson.groupId || 0), amount: lesson.amount,
    })
    if (linkErr) {
      // Откатываем выплату, если привязка не легла (например, занятие уже оплачено)
      await supabase.from('teacher_payouts').delete().eq('id', payout.id)
      alert('Не удалось отметить занятие оплаченным: ' + linkErr.message)
      return false
    }

    await supabase.from('expenses').insert({
      studio_id: studioId, expense_date: todayLocal(),
      expense_type: 'Зарплата', category: 'Разовый', amount: lesson.amount,
      comment: `${teacher.name}: разовая оплата занятия ${ruDate(lesson.date)}`,
      payout_id: payout.id,
    })
    // Без этого выплата ложилась в базу, но список в раскрытой карточке
    // оставался прежним: он кэшируется до первого открытия
    setRefreshKey(k => k + 1)
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
        group_id: +(i.groupId || 0),
        amount: i.amount,
      }))
      const { error: linkErr } = await supabase.from('lesson_payments').insert(links)
      if (linkErr) console.warn('lesson_payments:', linkErr.message)
    }

    await supabase.from('expenses').insert({
      studio_id: studioId,
      expense_date: todayLocal(),
      expense_type: 'Зарплата',
      category: 'Разовый',
      amount,
      comment: `${showPayout.name}: ${note || 'выплата'}`,
      payout_id: payout.id,
    })
    setShowPayout(null)
    setRefreshKey(k => k + 1)
    reload()
  }

  return (
    <div>
      {visibleAlerts.length > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #f0a83533', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#c47a00', marginBottom: 8 }}>
            ⚠️ Не задана ставка — эти занятия считаются в ноль
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleAlerts.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c47a00' }}>
                <button className="btn btn-ghost btn-sm btn-icon" title="Скрыть это уведомление"
                  onClick={() => dismissAlert(a.key)} style={{ color: '#c47a00' }}>✕</button>
                <span>
                  <b>{a.teacherName}</b> — {a.dirName}{a.groupName ? ` · ${a.groupName}` : ''}
                </span>
                <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => setShowEdit(teachers.find(t => t.id === a.teacherId))}>
                  Задать ставку
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Добавить педагога</button>
      </div>

      {teachers.length === 0 && (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">👩‍🏫</div>
          <div className="empty-text">Педагогов нет</div>
        </div>
      )}

      {activeTeachers.map(t => (
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
          reload={reload}
          refreshKey={refreshKey}
        />
      ))}

      {archivedTeachers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowArchive(v => !v)}
            style={{ color: T.muted, fontWeight: 700 }}>
            {showArchive ? '▾' : '▸'} Архив · {archivedTeachers.length}
          </button>
          {showArchive && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
                Занятия, ставки и выплаты этих педагогов остались в расчётах
                и отчётах. Из активного списка они убраны.
              </div>
              {archivedTeachers.map(t => (
                <div key={t.id} className="card card-pad"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, opacity: 0.75, flexWrap: 'wrap' }}>
                  <div className="avatar" style={{ background: '#d1d5db', width: 34, height: 34, fontSize: 13 }}>
                    {(t.name || '?').slice(0, 1)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      {t.status}{t.archived_at ? ` · в архиве с ${String(t.archived_at).slice(0, 10).split('-').reverse().join('.')}` : ''}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" disabled={busy}
                      onClick={() => doArchive(t.id, false)}>↩ Вернуть</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: T.red }} disabled={busy}
                      onClick={() => del(t.id, t.name)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteAsk && (
        <DeleteOrArchiveModal
          ask={deleteAsk}
          kind="teacher"
          busy={busy}
          onClose={() => setDeleteAsk(null)}
          onArchive={() => doArchive(deleteAsk.id, true)}
          onDelete={doDelete}
        />
      )}

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
