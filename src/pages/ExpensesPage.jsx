import { useState } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

const EXPENSE_TYPES = ['Аренда', 'Материалы', 'Транспорт', 'Подписки', 'Зарплата сотрудникам', 'Прочее']
const ICONS = { 'Аренда': '🏠', 'Материалы': '🎨', 'Транспорт': '🚗', 'Подписки': '💻', 'Зарплата сотрудникам': '👥', 'Прочее': '📦' }

function ExpenseModal({ expense, directions, onClose, onSave }) {
  const [f, setF] = useState(expense ? {
    expense_type: expense.expense_type || 'Аренда',
    amount: expense.amount || '',
    category: expense.category || 'Периодичный',
    direction_id: expense.direction_id || '',
    expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
    qty: expense.qty || 1,
    comment: expense.comment || '',
    link: expense.link || '',
  } : {
    expense_type: 'Аренда', amount: '', category: 'Периодичный',
    direction_id: '', expense_date: new Date().toISOString().slice(0, 10),
    qty: 1, comment: '', link: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <Modal title={expense ? '✏️ Редактировать расход' : '📤 Новый расход'} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Отмена</button>
        <button className={`btn ${expense ? 'btn-primary' : 'btn-danger'}`}
          onClick={() => onSave({ ...f, amount: +f.amount, qty: +f.qty, direction_id: f.direction_id ? +f.direction_id : null })}>
          {expense ? 'Сохранить' : 'Добавить расход'}
        </button>
      </>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Вид расхода</label>
          <select className="form-input" value={f.expense_type} onChange={e => set('expense_type', e.target.value)}>
            {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Категория</label>
          <select className="form-input" value={f.category} onChange={e => set('category', e.target.value)}>
            <option>Периодичный</option><option>Разовый</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Сумма, ₽</label>
          <input className="form-input" type="number" value={f.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div className="form-group"><label className="form-label">Количество</label>
          <input className="form-input" type="number" value={f.qty} onChange={e => set('qty', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Направление (если есть)</label>
          <select className="form-input" value={f.direction_id} onChange={e => set('direction_id', e.target.value)}>
            <option value="">— общий —</option>
            {directions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Дата</label>
          <input className="form-input" type="date" value={f.expense_date} onChange={e => set('expense_date', e.target.value)} />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Комментарий</label>
        <input className="form-input" value={f.comment} onChange={e => set('comment', e.target.value)} />
      </div>
      <div className="form-group"><label className="form-label">Ссылка на товар</label>
        <input className="form-input" value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://..." />
      </div>
    </Modal>
  )
}

export default function ExpensesPage({ expenses, directions, reload }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)

  const save = async (f) => {
    if (showEdit) {
      await supabase.from('expenses').update(f).eq('id', showEdit.id)
      setShowEdit(null)
    } else {
      await supabase.from('expenses').insert(f)
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id) => {
    if (!confirm('Удалить запись о расходе?')) return
    await supabase.from('expenses').delete().eq('id', id)
    reload()
  }

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: T.red }}>Итого: {fmt(total)}</div>
        <button className="btn btn-danger" onClick={() => setShowAdd(true)}>+ Добавить расход</button>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Направление</th><th>Комментарий</th><th>Сумма</th><th></th></tr></thead>
        <tbody>
          {expenses.map(e => {
            const d = directions.find(x => x.id === e.direction_id)
            return (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: T.muted }}>{e.expense_date}</td>
                <td style={{ fontWeight: 600 }}>{ICONS[e.expense_type] || '📦'} {e.expense_type}</td>
                <td><span className={`badge ${e.category === 'Периодичный' ? 'badge-blue' : 'badge-gray'}`}>{e.category}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{d?.name || 'Общий'}</td>
                <td style={{ fontSize: 12, color: T.muted }}>{e.comment || '—'}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red }}>{fmt(e.amount)}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(e)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => del(e.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            )
          })}
          {!expenses.length && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">📤</div><div className="empty-text">Расходов нет</div></div></td></tr>}
        </tbody>
      </table></div>
      {showAdd && <ExpenseModal directions={directions} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <ExpenseModal expense={showEdit} directions={directions} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
