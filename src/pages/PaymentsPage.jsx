import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

const pricePerLesson = (price, lessons) => lessons ? Math.round(price / lessons) : 0

function PaymentModal({ payment, clients, directions, subscriptions, onClose, onSave, preselectedClientId }) {
  const [clientId, setClientId] = useState(payment?.client_id || preselectedClientId || '')
  const [subId, setSubId] = useState('')
  const [dirId, setDirId] = useState(payment?.direction_id || '')
  const [groupName, setGroupName] = useState(payment?.group_name || 'Группа 1')
  const [date, setDate] = useState(payment?.payment_date || (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })())
  const [checkNum, setCheckNum] = useState(payment?.check_number || '')
  const [discount, setDiscount] = useState(0)
  const [customPrice, setCustomPrice] = useState(payment?.amount || '')
  const [customLessons, setCustomLessons] = useState(payment?.lessons_count || 1)
  const [payType, setPayType] = useState(payment?.payment_type || 'Абонемент')
  const [useCustomPrice, setUseCustomPrice] = useState(!!payment)
  const [periods, setPeriods] = useState([])
  const [expiresAt, setExpiresAt] = useState(payment?.expires_at || null)

  useEffect(() => {
    supabase.from('subscription_periods').select('*').then(({ data }) => setPeriods(data || []))
  }, [])

  // Get selected client
  const client = clients.find(c => c.id === +clientId)

  // Auto-fill discount from client when client selected
  useEffect(() => {
    if (client) setDiscount(client.discount || 0)
  }, [clientId])

  // Auto-calculate expires_at when subscription or date changes
  useEffect(() => {
    if (!selectedSub || !date) { setExpiresAt(null); return }
    const period = periods.find(p => p.label === selectedSub.period)
    if (!period || period.period_type !== 'fixed' || !period.duration_value) {
      setExpiresAt(null); return
    }
    const d = new Date(date)
    if (period.duration_unit === 'months') {
      d.setMonth(d.getMonth() + period.duration_value)
    } else {
      d.setDate(d.getDate() + period.duration_value)
    }
    const exp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setExpiresAt(exp)
  }, [subId, date, periods])

  // Get available subscriptions for selected direction
  const availableSubs = subscriptions.filter(s => {
    if (!s.is_active) return false
    if (!dirId) return true
    const dids = s.direction_ids || []
    return dids.length === 0 || dids.includes(+dirId)
  })

  const selectedSub = subscriptions.find(s => s.id === +subId)
  const dir = directions.find(d => d.id === +dirId)

  // Calculate final price
  const basePrice = (useCustomPrice || subId === 'custom') ? +customPrice : (selectedSub?.price || 0)
  const discountAmt = Math.round(basePrice * discount / 100)
  const finalPrice = basePrice - discountAmt

  const save = () => {
    if (!clientId) { alert('Выберите клиента'); return }
    const autoPayType = selectedSub
      ? (selectedSub.lessons_count === 1 ? 'Разовое занятие' : 'Абонемент')
      : payType
    onSave({
      client_id: +clientId,
      payment_type: autoPayType,
      amount: finalPrice,
      direction_id: dirId ? +dirId : null,
      group_name: groupName,
      payment_date: date,
      check_number: checkNum,
      subscription_id: subId ? +subId : null,
      discount_pct: discount,
      base_amount: basePrice,
      lessons_count: selectedSub ? selectedSub.lessons_count : (payType === 'Разовое занятие' || payType === 'Пробное занятие' ? 1 : +customLessons || 0),
      expires_at: expiresAt || null,
    })
  }

  return (
    <Modal title={payment ? '✏️ Редактировать оплату' : '💳 Новая оплата'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>

      {/* Client */}
      <div className="form-group"><label className="form-label">Клиент *</label>
        <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">— выбрать клиента —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.child_name} ({c.adult_name})</option>)}
        </select>
      </div>

      {/* Show client discount if exists */}
      {client && client.discount > 0 && (
        <div style={{ background: T.greenBg, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: T.greenDark, fontWeight: 600 }}>
          🎁 У клиента закреплена скидка {client.discount}% — применена автоматически
        </div>
      )}

      <div className="form-row">
        {/* Direction */}
        <div className="form-group"><label className="form-label">Направление</label>
          <select className="form-input" value={dirId} onChange={e => { setDirId(e.target.value); setSubId('') }}>
            <option value="">— —</option>
            {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {/* Group */}
        <div className="form-group"><label className="form-label">Группа</label>
          <select className="form-input" value={groupName} onChange={e => setGroupName(e.target.value)}>
            {dir?.groups?.length
              ? dir.groups.map(g => <option key={g.id || g.name || g} value={g.name || g}>{g.name || g}</option>)
              : <option value="Группа 1">Группа 1</option>
            }
          </select>
        </div>
      </div>

      {/* Subscription selector */}
      <div className="form-group"><label className="form-label">Абонемент</label>
        <select className="form-input" value={subId} onChange={e => {
          const val = e.target.value
          setSubId(val)
          setUseCustomPrice(val === 'custom' || val === '')
        }}>
          <option value="">— выбрать абонемент —</option>
          {availableSubs.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} — {fmt(s.price)} / {s.lessons_count} зан. ({fmt(pricePerLesson(s.price, s.lessons_count))}/зан.)
            </option>
          ))}
          <option value="custom">Другая сумма (вручную)</option>
        </select>
      </div>

      {/* Selected subscription info */}
      {selectedSub && !useCustomPrice && (
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: T.muted }}>📚 {selectedSub.lessons_count} занятий</span>
            <span style={{ fontSize: 13, color: T.muted }}>{selectedSub.period}</span>
          </div>
          {expiresAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#c47a00', fontWeight: 600 }}>⏱ Истекает</span>
              <span style={{ fontSize: 13, color: '#c47a00', fontWeight: 700 }}>
                {new Date(expiresAt).toLocaleDateString('ru-RU')}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Базовая стоимость</span>
            <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(selectedSub.price)}</span>
          </div>
        </div>
      )}

      {/* Custom price */}
      {(useCustomPrice || subId === 'custom' || !subId) && (
        <div className="form-row">
          <div className="form-group"><label className="form-label">Сумма, ₽</label>
            <input className="form-input" type="number" value={customPrice}
              onChange={e => setCustomPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group"><label className="form-label">Количество занятий</label>
            <input className="form-input" type="number" min="0" value={customLessons}
              onChange={e => setCustomLessons(+e.target.value)} placeholder="0" />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Укажите сколько занятий покрывает эта оплата</div>
          </div>
        </div>
      )}

      {/* Discount */}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Скидка, %</label>
          <input className="form-input" type="number" min="0" max="100" value={discount}
            onChange={e => setDiscount(+e.target.value)} />
        </div>
      </div>

      {/* Final price calculation */}
      {basePrice > 0 && (
        <div style={{ background: T.ink, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Итого к оплате</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: '#d1d5db' }}>Базовая сумма</span>
            <span style={{ color: 'white', fontWeight: 600 }}>{fmt(basePrice)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#d1d5db' }}>Скидка {discount}%</span>
              <span style={{ color: T.orange, fontWeight: 600 }}>−{fmt(discountAmt)}</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid #374151', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'white', fontWeight: 700 }}>К оплате</span>
            <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 22, color: T.green }}>{fmt(finalPrice)}</span>
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-group"><label className="form-label">Дата</label>
          <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Чек (Мой налог)</label>
          <input className="form-input" value={checkNum} onChange={e => setCheckNum(e.target.value)} placeholder="№ чека" />
        </div>
      </div>
    </Modal>
  )
}

// Сокращения типов оплаты
const PAY_SHORT = {
  'Абонемент':           { label: 'АБ',  cls: 'badge-green' },
  'Разовое занятие':     { label: 'РАЗ', cls: 'badge-gray' },
  'Абонемент со скидкой':{ label: 'АБ%', cls: 'badge-orange' },
  'Пробное занятие':     { label: 'ПРОБ',cls: 'badge-gray' },
}

export default function PaymentsPage({ payments, clients, directions, subscriptions = [], reload, deepLink, setDeepLink, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [preselectedClientId, setPreselectedClientId] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Автооткрытие модалки оплаты по deepLink (из карточки клиента)
  useEffect(() => {
    if (deepLink?.clientId) {
      setPreselectedClientId(deepLink.clientId)
      setShowAdd(true)
      if (setDeepLink) setDeepLink(null)
    }
  }, [deepLink])

  // Фильтры
  const now = new Date()
  const [filterMonth, setFilterMonth] = useState(false)
  const [filterClient, setFilterClient] = useState('all')
  const [filterDir, setFilterDir] = useState('all')

  const save = async (f) => {
    if (showEdit) {
      await supabase.from('payments').update(f).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('payments').insert({ ...f, studio_id: studioId })
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id) => {
    if (!confirm('Удалить запись об оплате?')) return
    await supabase.from('payments').delete().eq('id', id)
    reload()
  }

  // Применяем фильтры
  const filtered = payments.filter(p => {
    if (filterMonth) {
      const d = new Date(p.payment_date)
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false
    }
    if (filterClient !== 'all' && String(p.client_id) !== filterClient) return false
    if (filterDir !== 'all' && String(p.direction_id) !== filterDir) return false
    return true
  })

  const total = filtered.reduce((s, p) => s + (p.amount || 0), 0)

  const selStyle = { padding:'5px 10px', borderRadius:8, border:`1.5px solid ${T.border}`, fontFamily:'Nunito Sans,sans-serif', fontSize:12, background:T.cream, outline:'none', cursor:'pointer' }
  const monthName = now.toLocaleString('ru-RU', { month: 'long' })

  return (
    <div>
      {/* Шапка: итого + кнопка */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:20, color:T.greenDark }}>
          Итого: {fmt(total)}
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Новая оплата</button>
      </div>

      {/* Фильтры */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <button
          className="btn btn-sm"
          onClick={() => setFilterMonth(v => !v)}
          style={{ fontSize:12, padding:'5px 12px', whiteSpace:'nowrap', background: filterMonth ? T.green : T.cream, color: filterMonth ? 'white' : T.muted, border:`1.5px solid ${filterMonth ? T.green : T.border}` }}>
          📅 {filterMonth ? `${monthName} ✓` : 'Этот месяц'}
        </button>

        <select style={selStyle} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="all">Все клиенты</option>
          {clients.map(c => <option key={c.id} value={String(c.id)}>{c.child_name}</option>)}
        </select>

        <select style={selStyle} value={filterDir} onChange={e => setFilterDir(e.target.value)}>
          <option value="all">Все направления</option>
          {directions.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>

        {(filterMonth || filterClient !== 'all' || filterDir !== 'all') && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }}
            onClick={() => { setFilterMonth(false); setFilterClient('all'); setFilterDir('all') }}>
            ✕ Сбросить
          </button>
        )}
      </div>

      {/* Таблица */}
      <div className="table-wrap" style={{ display: isMobile ? 'none' : 'block' }}><table>
        <thead><tr>
          <th>Дата</th>
          <th>Клиент</th>
          <th>Тип</th>
          <th>Направление</th>
          <th>Сумма</th>
          <th></th>
        </tr></thead>
        <tbody>
          {filtered.map(p => {
            const c = clients.find(x => x.id === p.client_id)
            const d = directions.find(x => x.id === p.direction_id)
            const pt = PAY_SHORT[p.payment_type] || { label: p.payment_type?.slice(0,3) || '?', cls: 'badge-green' }
            const dateParts = (p.payment_date || '').split('-')
            const dateTop = dateParts.length === 3 ? `${dateParts[0]}-${dateParts[1]}` : p.payment_date
            const dateBot = dateParts.length === 3 ? dateParts[2] : ''
            return (
              <tr key={p.id}>
                <td style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>
                  <div>{dateTop}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:T.ink }}>{dateBot}</div>
                </td>
                <td style={{ fontWeight:600, fontSize:13 }}>{c?.child_name || '—'}</td>
                <td><span className={`badge ${pt.cls}`} style={{ fontSize:11, padding:'2px 7px' }}>{pt.label}</span></td>
                <td style={{ fontSize:12, color:T.muted }}>{d?.name || '—'}</td>
                <td>
                  <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    <span style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:13, color:+p.amount > 0 ? T.greenDark : T.muted, whiteSpace:'nowrap' }}>
                      {+p.amount > 0 ? fmt(p.amount) : 'Бесплатно'}
                    </span>
                    {p.base_amount > 0 && p.base_amount !== p.amount && (
                      <span style={{ fontSize:10, color:T.muted, textDecoration:'line-through' }}>{fmt(p.base_amount)}</span>
                    )}
                    {p.discount_pct ? <span className="badge badge-orange" style={{ alignSelf:'flex-start', fontSize:10, padding:'1px 6px' }}>−{p.discount_pct}%</span> : null}
                  </div>
                </td>
                <td>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(p)} style={{ padding:'4px 8px' }}>✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => del(p.id)} style={{ color:T.red, padding:'4px 8px' }}>🗑️</button>
                  </div>
                </td>
              </tr>
            )
          })}
          {!filtered.length && <tr><td colSpan={6}><div className="empty"><div className="empty-icon">💳</div><div className="empty-text">Оплат нет</div></div></td></tr>}
        </tbody>
      </table></div>

      {/* Карточки для мобильных */}
      <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {filtered.map(p => {
          const c = clients.find(x => x.id === p.client_id)
          const d = directions.find(x => x.id === p.direction_id)
          const pt = PAY_SHORT[p.payment_type] || { label: p.payment_type?.slice(0,3) || '?', cls: 'badge-green' }
          return (
            <div key={p.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{c?.child_name || '—'}</div>
                <span className={`badge ${pt.cls}`}>{pt.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Дата</div>
                  <div style={{ fontSize: 13, color: T.ink }}>{p.payment_date || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Сумма</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: +p.amount > 0 ? T.greenDark : T.muted }}>
                    {+p.amount > 0 ? fmt(p.amount) : 'Бесплатно'}
                    {p.discount_pct ? <span className="badge badge-orange" style={{ marginLeft: 6, fontSize: 10 }}>−{p.discount_pct}%</span> : null}
                  </div>
                </div>
              </div>
              {d && <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{d.name}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(p)}>✏️</button>
                <button className="btn btn-ghost btn-sm" onClick={() => del(p.id)} style={{ color: T.red }}>🗑️</button>
              </div>
            </div>
          )
        })}
        {!filtered.length && <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">💳</div><div className="empty-text">Оплат нет</div>
        </div>}
      </div>

      {showAdd && <PaymentModal clients={clients} directions={directions} subscriptions={subscriptions}
        preselectedClientId={preselectedClientId}
        onClose={() => { setShowAdd(false); setPreselectedClientId(null) }} onSave={save} />}
      {showEdit && <PaymentModal payment={showEdit} clients={clients} directions={directions} subscriptions={subscriptions} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
