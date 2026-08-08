import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { NumberInput } from '../components/SearchSelect'

// Локальная дата, а не toISOString(): в UTC+5 ночью тот отдаёт вчера.
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ruDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function IncomeModal({ income, onClose, onSave }) {
  const [f, setF] = useState({
    amount: income?.amount ?? '',
    income_date: income?.income_date || todayLocal(),
    comment: income?.comment || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const submit = async () => {
    setError(null)
    if (!(+f.amount > 0)) { setError('Укажите сумму'); return }
    setSaving(true)
    const err = await onSave({ ...f, amount: +f.amount, comment: f.comment.trim() || null })
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <Modal title={income ? '✏️ Редактировать доход' : '💰 Прочий доход'} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Сохраняем…' : (income ? 'Сохранить' : 'Добавить')}
        </button>
      </>}>
      {error && <div className="alert alert-error">⚠️ {error}</div>}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Сумма, ₽ *</label>
          <NumberInput value={f.amount} onChange={v => set('amount', v)} min={0} />
        </div>
        <div className="form-group">
          <label className="form-label">Дата</label>
          <input className="form-input" type="date" style={{ fontSize: 16 }}
            value={f.income_date} onChange={e => set('income_date', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Комментарий</label>
        <input className="form-input" style={{ fontSize: 16 }} value={f.comment}
          onChange={e => set('comment', e.target.value)}
          placeholder="Мастер-класс, сертификат, продажа материалов…" />
      </div>

      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
        Такой доход не привязан к клиенту и не влияет на баланс абонементов —
        он просто учитывается в общей выручке студии.
      </div>
    </Modal>
  )
}

export default function IncomePage({ studioId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [error, setError] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = async () => {
    if (!studioId) return
    setLoading(true)
    const { data, error } = await supabase.from('other_income')
      .select('*').eq('studio_id', studioId).order('income_date', { ascending: false })
    if (error) setError(error.message)
    else { setRows(data || []); setError(null) }
    setLoading(false)
  }

  useEffect(() => { load() }, [studioId])

  const save = async (f) => {
    if (showEdit) {
      const { error } = await supabase.from('other_income').update(f).eq('id', showEdit.id)
      if (error) return 'Не удалось сохранить: ' + error.message
      setShowEdit(null)
    } else {
      const { error } = await supabase.from('other_income').insert({ ...f, studio_id: studioId })
      if (error) return 'Не удалось сохранить: ' + error.message
      setShowAdd(false)
    }
    load()
    return null
  }

  const doDelete = async () => {
    const { error } = await supabase.from('other_income').delete().eq('id', confirmDel.id)
    if (error) { setError(error.message); return }
    setConfirmDel(null)
    load()
  }

  const total = rows.reduce((s, r) => s + (+r.amount || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 20, color: T.greenDark }}>
          Итого: {fmt(total)}
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Добавить доход</button>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted }}>Загружаем…</div>
      ) : !rows.length ? (
        <div className="empty" style={{ padding: '40px 0' }}>
          <div className="empty-icon">💰</div>
          <div className="empty-text">Прочих доходов пока нет</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 6, maxWidth: 380, marginInline: 'auto' }}>
            Сюда заносится всё, что не проходит через абонементы: мастер-классы,
            подарочные сертификаты, продажа материалов.
          </div>
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => (
            <div key={r.id} className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: T.muted }}>{ruDate(r.income_date)}</span>
                <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(r.amount)}</span>
              </div>
              <div style={{ fontSize: 14, color: T.ink, marginBottom: 8 }}>{r.comment || '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(r)}>✏️</button>
                <button className="btn btn-ghost btn-sm" style={{ color: T.red }} onClick={() => setConfirmDel(r)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Дата</th><th>Комментарий</th><th>Сумма</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>{ruDate(r.income_date)}</td>
                <td style={{ fontSize: 14 }}>{r.comment || '—'}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(r.amount)}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(r)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: T.red }} onClick={() => setConfirmDel(r)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {showAdd && <IncomeModal onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <IncomeModal income={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}

      {confirmDel && (
        <Modal title="Удалить запись?" onClose={() => setConfirmDel(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDel(null)}>Отмена</button>
            <button className="btn btn-danger" onClick={doDelete}>Удалить</button>
          </>}>
          <div style={{ fontSize: 14 }}>
            Доход <b>{fmt(confirmDel.amount)}</b> от {ruDate(confirmDel.income_date)} будет удалён.
          </div>
        </Modal>
      )}
    </div>
  )
}
