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

function ClientModal({ client, directions, onClose, onSave }) {
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
    paid_lessons: client.paid_lessons || 0,
    visited_lessons: client.visited_lessons || 0,
    balance: client.balance || 0,
    discount: client.discount || 0,
  } : { child_name: '', adult_name: '', status: 'Новый', contacts: [{ type: 'Телефон', val: '' }], start_date: '', source: '', birthday: '', sex: 'М', direction_ids: [], paid_lessons: 0, visited_lessons: 0, balance: 0, discount: 0 })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const age = calcAge(f.birthday)

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
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
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
              </label>
            )
          })}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Оплачено занятий</label>
          <input className="form-input" type="number" value={f.paid_lessons} onChange={e => set('paid_lessons', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Посещено занятий</label>
          <input className="form-input" type="number" value={f.visited_lessons} onChange={e => set('visited_lessons', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Баланс, ₽</label>
          <input className="form-input" type="number" value={f.balance} onChange={e => set('balance', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Скидка, %</label>
          <input className="form-input" type="number" min="0" max="100" value={f.discount} onChange={e => set('discount', e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

function ClientDetail({ client, directions, payments, onClose, onEdit }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`

      // Paid lessons from payments table
      const { data: pays } = await supabase.from('payments').select('lessons_count, payment_date').eq('client_id', client.id)
      const totalPaid = (pays||[]).reduce((s,p) => s + (+p.lessons_count||0), 0)
      const monthPaid = (pays||[]).filter(p => p.payment_date >= monthStart).reduce((s,p) => s + (+p.lessons_count||0), 0)

      // Visited from attendance
      const { data: att } = await supabase.from('attendance').select('date').eq('client_id', client.id).eq('present', true)
      const totalVisited = (att||[]).length
      const monthVisited = (att||[]).filter(a => a.date >= monthStart).length

      setStats({ totalPaid, monthPaid, totalVisited, monthVisited })
    }
    fetchStats()
  }, [client.id])
  const cDirs = directions.filter(d => (client.direction_ids || []).includes(d.id))
  const cPay = payments.filter(p => p.client_id === client.id)
  const age = calcAge(client.birthday)
  const totalPaid = stats?.totalPaid ?? client.paid_lessons ?? 0
  const totalVisited = stats?.totalVisited ?? client.visited_lessons ?? 0
  const bal = calcBalance(totalPaid, totalVisited)

  return (
    <Modal title={`👤 ${client.child_name}`} onClose={onClose} large
      footer={<><button className="btn btn-outline btn-sm" onClick={onEdit}>✏️ Редактировать</button><button className="btn btn-ghost btn-sm" onClick={onClose}>Закрыть</button></>}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {/* Paid lessons */}
        <div style={{ background: T.greenBg, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>📅 Оплачено занятий</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 24, color: T.greenDark }}>{stats ? totalPaid : '...'}</span>
            <span style={{ fontSize: 12, color: T.muted }}>всего</span>
          </div>
          {stats && <div style={{ fontSize: 12, color: T.greenDark, marginTop: 2 }}>в этом мес.: <strong>{stats.monthPaid}</strong> зан.</div>}
        </div>
        {/* Visited lessons */}
        <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>✅ Посещено занятий</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 24, color: T.ink }}>{stats ? totalVisited : '...'}</span>
            <span style={{ fontSize: 12, color: T.muted }}>всего</span>
          </div>
          {stats && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>в этом мес.: <strong>{stats.monthVisited}</strong> зан.</div>}
        </div>
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
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
      <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Контакты</div>
      <div style={{ marginBottom: 14 }}>
        {(client.contacts || []).map((c, i) => (
          <div key={i} style={{ fontSize: 13, display: 'flex', gap: 10, marginBottom: 3 }}>
            <span style={{ color: T.muted, fontWeight: 600, fontSize: 11, minWidth: 70 }}>{c.type}</span>
            <span style={{ fontWeight: 600 }}>{c.val}</span>
          </div>
        ))}
      </div>
      <div className="divider" />
      <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>История оплат ({cPay.length})</div>
      {cPay.length ? cPay.map(p => (
        <div key={p.id} className="fin-row">
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{p.payment_type}</div><div style={{ fontSize: 11, color: T.muted }}>{p.payment_date}</div></div>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: p.amount ? T.greenDark : T.muted }}>{p.amount ? fmt(p.amount) : 'Бесплатно'}</div>
        </div>
      )) : <div style={{ fontSize: 13, color: T.muted, padding: '6px 0' }}>Оплат пока нет</div>}
    </Modal>
  )
}

export default function ClientsPage({ clients, directions, payments, reload }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Все')
  const [dirFilter, setDirFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [showEdit, setShowEdit] = useState(null)

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
      visited_lessons: +f.visited_lessons || 0,
      balance: +f.balance || 0,
      discount: +f.discount || 0,
    }
    if (showEdit) {
      await supabase.from('clients').update(cleaned).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('clients').insert(cleaned)
      setShowAdd(false)
    }
    await reload()
  }

  return (
    <div>
      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Direction filter */}
        <select className="form-input" style={{ width: 'auto', padding: '8px 12px' }} value={dirFilter} onChange={e => setDirFilter(e.target.value)}>
          <option value="all">Все направления</option>
          {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(true)}>+ Новый клиент</button>
      </div>

      {/* Status tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {['Все', ...STATUSES].map(s => <button key={s} className={`tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>)}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Ребёнок</th><th>Возраст</th><th>Взрослый</th><th>Статус</th><th>Направления</th><th>Скидка</th><th>Занятия</th><th>Контакт</th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const age = calcAge(c.birthday)
              const bal = calcBalance(c.paid_lessons, c.visited_lessons)
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
                  <td><span className={`badge ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
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
                      <span style={{ fontSize: 10, color: T.muted }}>опл. {c.paid_lessons} · пос. {c.visited_lessons}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: T.muted }}>{(c.contacts || [])[0]?.val || '—'}</td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">👤</div><div className="empty-text">Клиентов не найдено</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && <ClientModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <ClientModal client={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} />}
      {showDetail && (
        <ClientDetail client={showDetail} directions={directions} payments={payments}
          onClose={() => setShowDetail(null)}
          onEdit={() => { setShowEdit(showDetail); setShowDetail(null) }}
        />
      )}
    </div>
  )
}
