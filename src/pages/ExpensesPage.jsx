import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { NumberInput } from '../components/SearchSelect'

const DEFAULT_ICONS = { 'Аренда': '🏠', 'Материалы': '🎨', 'Транспорт': '🚗', 'Подписки': '💻', 'Зарплата сотрудникам': '👥', 'Прочее': '📦' }

function ExpenseModal({ expense, directions, expenseTypes, typesLoaded, onClose, onSave }) {
  const firstType = expenseTypes[0]?.name || 'Прочее'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [f, setF] = useState(expense ? {
    expense_type: expense.expense_type || firstType,
    amount: expense.amount || '',
    category: expense.category || 'Периодичный',
    direction_id: expense.direction_id || '',
    expense_date: expense.expense_date || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(),
    qty: expense.qty || 1,
    comment: expense.comment || '',
    link: expense.link || '',
  } : {
    expense_type: firstType, amount: '', category: 'Периодичный',
    direction_id: '', expense_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(),
    qty: 1, comment: '', link: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <Modal title={expense ? '✏️ Редактировать расход' : '📤 Новый расход'} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Отмена</button>
        <button className={`btn ${expense ? 'btn-primary' : 'btn-danger'}`}
          disabled={saving || !typesLoaded}
          onClick={async () => {
            setError(null)
            if (!(+f.amount > 0)) { setError('Укажите сумму расхода'); return }
            setSaving(true)
            const err = await onSave({ ...f, amount: +f.amount, qty: +f.qty || 1, direction_id: f.direction_id ? +f.direction_id : null })
            setSaving(false)
            if (err) setError(err)
          }}>
          {saving ? 'Сохраняем…' : (expense ? 'Сохранить' : 'Добавить расход')}
        </button>
      </>}>
      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {!typesLoaded && (
        <div className="alert" style={{ background: T.cream, color: T.muted }}>Загружаем справочник видов расхода…</div>
      )}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Вид расхода</label>
          <select className="form-input" value={f.expense_type} onChange={e => set('expense_type', e.target.value)}>
            {expenseTypes.map(t => <option key={t.id}>{t.name}</option>)}
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
          <NumberInput value={f.amount} onChange={v => set('amount', v)} min={0} />
        </div>
        <div className="form-group"><label className="form-label">Количество</label>
          <NumberInput value={f.qty} onChange={v => set('qty', v)} min={1} placeholder="1" />
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

export default function ExpensesPage({ expenses, directions, reload, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [expenseTypes, setExpenseTypes] = useState([])
  const [typesLoaded, setTypesLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [confirmDel, setConfirmDel] = useState(null)  // { mode, row } — что удаляем
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const q = supabase.from('expense_types').select('*').order('sort_order').order('id')
    if (studioId) q.eq('studio_id', studioId)
    q.then(({ data }) => { setExpenseTypes(data || []); setTypesLoaded(true) })
  }, [studioId])

  // Раньше окно закрывалось всегда, даже если запрос упал: пользователь
  // видел «сохранил — и ничего не произошло». Теперь при ошибке окно
  // остаётся открытым, введённое не теряется, причина видна на экране.
  const save = async (f) => {
    if (showEdit) {
      const { error } = await supabase.from('expenses').update(f).eq('id', showEdit.id)
      if (error) return 'Не удалось сохранить: ' + error.message
      setShowEdit(null)
    } else {
      const { error } = await supabase.from('expenses').insert({ ...f, studio_id: studioId })
      if (error) return 'Не удалось сохранить: ' + error.message
      setShowAdd(false)
    }
    reload()
    return null
  }

  const del = async (id) => {
    const row = expenses.find(e => e.id === id)
    // Расход-выплата — отменяем через отдельное окно с предупреждением
    if (row?.payout_id) { setConfirmDel({ mode: 'payout', row }); return }
    setConfirmDel({ mode: 'expense', row })
  }

  const doDelete = async () => {
    const { mode, row } = confirmDel
    setDeleting(true)
    if (mode === 'payout') {
      const { error } = await supabase.from('teacher_payouts').delete().eq('id', row.payout_id)
      setDeleting(false)
      if (error) { alert('Ошибка отмены выплаты: ' + error.message); return }
    } else {
      await supabase.from('expenses').delete().eq('id', row.id)
      setDeleting(false)
    }
    setConfirmDel(null)
    reload()
  }

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: "#E8734A" }}>Итого: {fmt(total)}</div>
        <button className="btn btn-danger" onClick={() => setShowAdd(true)}>+ Добавить расход</button>
      </div>
      <div className="table-wrap" style={{ display: isMobile ? 'none' : 'block' }}><table>
        <thead><tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Направление</th><th>Комментарий</th><th>Сумма</th><th></th></tr></thead>
        <tbody>
          {expenses.map(e => {
            const d = directions.find(x => x.id === e.direction_id)
            return (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: T.muted }}>{e.expense_date}</td>
                <td style={{ fontWeight: 600 }}>{(expenseTypes.find(t => t.name === e.expense_type)?.icon || DEFAULT_ICONS[e.expense_type] || '📦')} {e.expense_type}</td>
                <td><span className={`badge ${e.category === 'Периодичный' ? 'badge-blue' : 'badge-gray'}`}>{e.category}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{d?.name || 'Общий'}</td>
                <td style={{ fontSize: 12, color: T.muted }}>{e.comment || '—'}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: "#E8734A" }}>{fmt(e.amount)}</span></td>
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

      {/* Карточки для мобильных */}
      <div style={{ display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {expenses.map(e => {
          const d = directions.find(x => x.id === e.direction_id)
          const icon = expenseTypes.find(t => t.name === e.expense_type)?.icon || DEFAULT_ICONS[e.expense_type] || '📦'
          return (
            <div key={e.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{icon} {e.expense_type}</div>
                <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: '#E8734A' }}>{fmt(e.amount)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Дата</div>
                  <div style={{ fontSize: 13, color: T.ink }}>{e.expense_date || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Направление</div>
                  <div style={{ fontSize: 13, color: T.muted }}>{d?.name || 'Общий'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${e.category === 'Периодичный' ? 'badge-blue' : 'badge-gray'}`}>{e.category}</span>
                  {e.comment && <span style={{ fontSize: 12, color: T.muted }}>{e.comment}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(e)}>✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => del(e.id)}>🗑️</button>
                </div>
              </div>
            </div>
          )
        })}
        {!expenses.length && <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="empty-icon">📤</div><div className="empty-text">Расходов нет</div>
        </div>}
      </div>
      {showAdd && <ExpenseModal directions={directions} expenseTypes={expenseTypes} typesLoaded={typesLoaded} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <ExpenseModal expense={showEdit} directions={directions} expenseTypes={expenseTypes} typesLoaded={typesLoaded} onClose={() => setShowEdit(null)} onSave={save} />}

      {confirmDel && (
        <Modal title={confirmDel.mode === 'payout' ? 'Отмена выплаты' : 'Удаление расхода'} onClose={() => setConfirmDel(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={deleting}>Отмена</button>
            <button className="btn btn-primary" style={{ background: '#e05a5a' }} disabled={deleting}
              onClick={doDelete}>{deleting ? 'Удаляем…' : (confirmDel.mode === 'payout' ? 'Отменить выплату' : 'Удалить')}</button>
          </>}>
          {confirmDel.mode === 'payout' ? (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
                Это выплата педагогу на <strong>{fmt(confirmDel.row.amount)}</strong>. Отменить её?
              </div>
              <div style={{ background: '#fff4e6', borderRadius: 12, padding: '12px 16px', marginTop: 14, fontSize: 13, color: '#c47a00', lineHeight: 1.5 }}>
                Занятия, закрытые этой выплатой, снова станут неоплаченными, а эта запись из расходов удалится. Отменить действие нельзя.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
              Удалить запись о расходе <strong>{fmt(confirmDel.row.amount)}</strong>{confirmDel.row.expense_type ? ` — ${confirmDel.row.expense_type}` : ''}?
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
