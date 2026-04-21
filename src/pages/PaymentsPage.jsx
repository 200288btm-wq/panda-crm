// PaymentsPage
import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

function PaymentModal({ clients, directions, onClose, onSave }) {
  const [f, setF] = useState({ client_id: '', payment_type: 'Абонемент', amount: '', direction_id: '', group_name: 'Группа 1', payment_date: new Date().toISOString().slice(0, 10), check_number: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const dir = directions.find(d => d.id === +f.direction_id)
  return (
    <Modal title="💳 Новая оплата" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={() => onSave({ ...f, client_id: +f.client_id, direction_id: +f.direction_id || null, amount: +f.amount })}>Сохранить</button></>}>
      <div className="form-group"><label className="form-label">Клиент *</label>
        <select className="form-input" value={f.client_id} onChange={e => set('client_id', e.target.value)}>
          <option value="">— выбрать —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.child_name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Тип оплаты</label>
          <select className="form-input" value={f.payment_type} onChange={e => set('payment_type', e.target.value)}>
            <option>Абонемент</option><option>Разовое занятие</option><option>Абонемент со скидкой</option><option>Пробное занятие</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Сумма, ₽</label><input className="form-input" type="number" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Направление</label>
          <select className="form-input" value={f.direction_id} onChange={e => set('direction_id', e.target.value)}>
            <option value="">— —</option>{directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Группа</label>
          <select className="form-input" value={f.group_name} onChange={e => set('group_name', e.target.value)}>
            {(dir?.groups || ['Группа 1']).map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Дата</label><input className="form-input" type="date" value={f.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Чек (Мой налог)</label><input className="form-input" value={f.check_number} onChange={e => set('check_number', e.target.value)} placeholder="№ чека" /></div>
      </div>
    </Modal>
  )
}

export function PaymentsPage({ payments, setPayments, clients, directions, reload }) {
  const [showAdd, setShowAdd] = useState(false)
  const save = async (f) => { await supabase.from('payments').insert(f); setShowAdd(false); reload() }
  const total = payments.reduce((s, p) => s + (p.amount || 0), 0)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: T.greenDark }}>Итого: {fmt(total)}</div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Новая оплата</button>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Дата</th><th>Клиент</th><th>Тип</th><th>Направление</th><th>Группа</th><th>Сумма</th><th>Чек</th></tr></thead>
        <tbody>
          {payments.map(p => {
            const c = clients.find(x => x.id === p.client_id)
            const d = directions.find(x => x.id === p.direction_id)
            return (
              <tr key={p.id}>
                <td style={{ fontSize: 12, color: T.muted }}>{p.payment_date}</td>
                <td style={{ fontWeight: 600 }}>{c?.child_name || '—'}</td>
                <td><span className={`badge ${p.payment_type === 'Пробное занятие' ? 'badge-gray' : p.payment_type.includes('скидк') ? 'badge-orange' : 'badge-green'}`}>{p.payment_type}</span></td>
                <td style={{ fontSize: 12 }}>{d?.name || '—'}</td>
                <td style={{ fontSize: 12, color: T.muted }}>{p.group_name}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: p.amount ? T.greenDark : T.muted }}>{p.amount ? fmt(p.amount) : 'Бесплатно'}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{p.check_number || '—'}</td>
              </tr>
            )
          })}
          {!payments.length && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">💳</div><div className="empty-text">Оплат пока нет</div></div></td></tr>}
        </tbody>
      </table></div>
      {showAdd && <PaymentModal clients={clients} directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
    </div>
  )
}

export default PaymentsPage
