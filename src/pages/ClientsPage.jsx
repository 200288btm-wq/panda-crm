import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt, hashColor, STATUS_COLORS, STATUSES } from '../styles'
import { Modal } from '../components/Modal'

function ClientModal({ client, directions, onClose, onSave }) {
  const [f, setF] = useState(client ? {
    child_name: client.child_name || '',
    adult_name: client.adult_name || '',
    status: client.status || 'Новый',
    contacts: client.contacts || [{ type: 'Телефон', val: '' }],
    start_date: client.start_date || '',
    source: client.source || '',
    age: client.age || '',
    sex: client.sex || 'М',
    direction_ids: client.direction_ids || [],
    paid_lessons: client.paid_lessons || 0,
    visited_lessons: client.visited_lessons || 0,
    balance: client.balance || 0,
    discount: client.discount || 0,
  } : { child_name: '', adult_name: '', status: 'Новый', contacts: [{ type: 'Телефон', val: '' }], start_date: '', source: '', age: '', sex: 'М', direction_ids: [], paid_lessons: 0, visited_lessons: 0, balance: 0, discount: 0 })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <Modal title={client ? `✏️ ${client.child_name}` : '+ Новый клиент'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave(f)}>Сохранить</button></>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Имя ребёнка *</label><input className="form-input" value={f.child_name} onChange={e => set('child_name', e.target.value)} placeholder="Имя Фамилия" /></div>
        <div className="form-group"><label className="form-label">Возраст</label><input className="form-input" type="number" min="1" max="18" value={f.age} onChange={e => set('age', +e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">ФИО родителя / взрослого *</label><input className="form-input" value={f.adult_name} onChange={e => set('adult_name', e.target.value)} placeholder="Фамилия Имя Отчество" /></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Статус</label>
          <select className="form-input" value={f.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="form-group"><label className="form-label">Пол</label>
          <select className="form-input" value={f.sex} onChange={e => set('sex', e.target.value)}><option>М</option><option>Ж</option></select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Дата начала</label><input className="form-input" type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Источник</label><input className="form-input" value={f.source} onChange={e => set('source', e.target.value)} placeholder="ВКонтакте, Авито..." /></div>
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
            return (
              <label key={d.id} className={`chip ${on ? 'chip-active' : 'chip-inactive'}`}>
                <input type="checkbox" checked={on} style={{ display: 'none' }}
                  onChange={e => set('direction_ids', e.target.checked ? [...(f.direction_ids || []), d.id] : (f.direction_ids || []).filter(x => x !== d.id))} />
                {d.name}
              </label>
            )
          })}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Оплачено занятий</label><input className="form-input" type="number" value={f.paid_lessons} onChange={e => set('paid_lessons', +e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Посещено занятий</label><input className="form-input" type="number" value={f.visited_lessons} onChange={e => set('visited_lessons', +e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Баланс, ₽</label><input className="form-input" type="number" value={f.balance} onChange={e => set('balance', +e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Скидка, %</label><input className="form-input" type="number" min="0" max="100" value={f.discount} onChange={e => set('discount', +e.target.value)} /></div>
      </div>
    </Modal>
  )
}

function ClientDetail({ client, directions, payments, onClose, onEdit }) {
  const cDirs = directions.filter(d => (client.direction_ids || []).includes(d.id))
  const cPay = payments.filter(p => p.client_id === client.id)
  const bal = client.balance || 0

  return (
    <Modal title={`👤 ${client.child_name}`} onClose={onClose} large
      footer={<><button className="btn btn-outline btn-sm" onClick={onEdit}>✏️ Редактировать</button><button className="btn btn-ghost btn-sm" onClick={onClose}>Закрыть</button></>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '14px 16px', background: T.cream, borderRadius: 14 }}>
        <div className="avatar" style={{ background: hashColor(client.child_name), width: 52, height: 52, fontSize: 20 }}>{(client.child_name || '?')[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 17 }}>{client.child_name}</div>
          <div style={{ fontSize: 13, color: T.muted }}>{client.adult_name} · {client.age} лет · {client.sex}</div>
          <span className={`badge ${STATUS_COLORS[client.status]}`} style={{ marginTop: 4 }}>{client.status}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 24, color: bal >= 0 ? T.greenDark : T.red }}>{fmt(Math.abs(bal))}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{bal >= 0 ? 'Баланс' : '⚠️ Долг'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[['📅 Оплачено', client.paid_lessons + ' зан.'], ['✅ Посещено', client.visited_lessons + ' зан.'], ['📌 Источник', client.source || '—'], ['🎁 Скидка', (client.discount || 0) + '%']].map(([k, v]) => (
          <div key={k} style={{ background: T.cream, borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 2 }}>{k}</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="divider" />
      <div style={{ fontWeight: 700, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Направления</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {cDirs.map(d => <span key={d.id} className="badge badge-green">🐾 {d.name}</span>)}
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
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.payment_type}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{p.payment_date}</div>
          </div>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: p.amount ? T.greenDark : T.muted }}>{p.amount ? fmt(p.amount) : 'Бесплатно'}</div>
        </div>
      )) : <div style={{ fontSize: 13, color: T.muted, padding: '6px 0' }}>Оплат пока нет</div>}
    </Modal>
  )
}

export default function ClientsPage({ clients, directions, payments, reload }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Все')
  const [showAdd, setShowAdd] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [showEdit, setShowEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const match = !q || (c.child_name || '').toLowerCase().includes(q) || (c.adult_name || '').toLowerCase().includes(q)
    const st = statusFilter === 'Все' || c.status === statusFilter
    return match && st
  })

  const save = async (f) => {
    setSaving(true)
    if (showEdit) {
      await supabase.from('clients').update(f).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('clients').insert(f)
      setShowAdd(false)
    }
    await reload()
    setSaving(false)
  }

  const del = async (id) => {
    if (!confirm('Удалить клиента?')) return
    await supabase.from('clients').delete().eq('id', id)
    setShowDetail(null)
    await reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {['Все', ...STATUSES].map(s => <button key={s} className={`tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>)}
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(true)}>+ Новый клиент</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Ребёнок</th><th>Взрослый</th><th>Статус</th><th>Направления</th><th>Оплачено</th><th>Баланс</th><th>Контакт</th></tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="tr-click" onClick={() => setShowDetail(c)}>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="avatar" style={{ background: hashColor(c.child_name), width: 30, height: 30, fontSize: 12 }}>{(c.child_name || '?')[0]}</div>
                    <div><div style={{ fontWeight: 700 }}>{c.child_name}</div><div style={{ fontSize: 11, color: T.muted }}>{c.age} лет · {c.sex}</div></div>
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>{c.adult_name}</td>
                <td><span className={`badge ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                <td style={{ fontSize: 12 }}>{directions.filter(d => (c.direction_ids || []).includes(d.id)).map(d => d.name).join(', ') || '—'}</td>
                <td style={{ textAlign: 'center' }}><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{c.paid_lessons}</span><span style={{ fontSize: 11, color: T.muted }}> зан.</span></td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: (c.balance || 0) >= 0 ? T.greenDark : T.red }}>{fmt(c.balance)}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{(c.contacts || [])[0]?.val || '—'}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">👤</div><div className="empty-text">Клиентов не найдено</div></div></td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && <ClientModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <ClientModal client={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} />}
      {showDetail && (
        <ClientDetail
          client={showDetail} directions={directions} payments={payments}
          onClose={() => setShowDetail(null)}
          onEdit={() => { setShowEdit(showDetail); setShowDetail(null) }}
        />
      )}
    </div>
  )
}
