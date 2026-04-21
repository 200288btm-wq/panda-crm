import { useState } from 'react'
import { T, fmt } from '../styles'

export default function FinancePage({ payments, expenses, directions }) {
  const [tab, setTab] = useState('Обзор')

  const income = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const profit = income - totalExp
  const margin = income ? Math.round(profit / income * 100) : 0

  return (
    <div>
      <div className="tabs">
        {['Обзор', 'Доходы', 'Расходы'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Обзор' && (
        <div>
          <div className="stats-grid">
            {[
              { l: 'Доходы', v: fmt(income), c: T.greenDark },
              { l: 'Расходы', v: fmt(totalExp), c: T.red },
              { l: 'Прибыль', v: fmt(profit), c: profit >= 0 ? T.greenDark : T.red },
              { l: 'Рентабельность', v: margin + '%', c: T.orange },
            ].map(s => (
              <div key={s.l} className="stat-card">
                <div className="stat-label">{s.l}</div>
                <div className="stat-value" style={{ color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card card-pad">
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 14 }}>💰 Доходы по направлениям</div>
              {directions.map(d => {
                const sum = payments.filter(p => p.direction_id === d.id).reduce((s, p) => s + (p.amount || 0), 0)
                const pct = income ? Math.round(sum / income * 100) : 0
                return (
                  <div key={d.id} style={{ marginBottom: 12 }}>
                    <div className="fin-row" style={{ padding: '4px 0', border: 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                      <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(sum)}</span>
                    </div>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: pct + '%' }} /></div>
                  </div>
                )
              })}
            </div>

            <div className="card card-pad">
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 14 }}>📤 Расходы по категориям</div>
              {Object.entries(
                expenses.reduce((acc, e) => { acc[e.expense_type] = (acc[e.expense_type] || 0) + e.amount; return acc }, {})
              ).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                const pct = totalExp ? Math.round(v / totalExp * 100) : 0
                return (
                  <div key={k} style={{ marginBottom: 12 }}>
                    <div className="fin-row" style={{ padding: '4px 0', border: 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{k}</span>
                      <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red }}>{fmt(v)}</span>
                    </div>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: pct + '%', background: T.red }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'Доходы' && (
        <div className="table-wrap"><table>
          <thead><tr><th>Дата</th><th>Тип</th><th>Направление</th><th>Сумма</th></tr></thead>
          <tbody>
            {payments.filter(p => p.amount > 0).map(p => (
              <tr key={p.id}>
                <td style={{ fontSize: 12, color: T.muted }}>{p.payment_date}</td>
                <td style={{ fontWeight: 600 }}>{p.payment_type}</td>
                <td style={{ fontSize: 12 }}>{directions.find(d => d.id === p.direction_id)?.name || '—'}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(p.amount)}</span></td>
              </tr>
            ))}
            {!payments.filter(p => p.amount > 0).length && <tr><td colSpan={4}><div className="empty"><div className="empty-icon">💰</div><div className="empty-text">Доходов пока нет</div></div></td></tr>}
          </tbody>
        </table></div>
      )}

      {tab === 'Расходы' && (
        <div className="table-wrap"><table>
          <thead><tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Комментарий</th><th>Сумма</th></tr></thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: T.muted }}>{e.expense_date}</td>
                <td style={{ fontWeight: 600 }}>{e.expense_type}</td>
                <td><span className={`badge ${e.category === 'Периодичный' ? 'badge-blue' : 'badge-gray'}`}>{e.category}</span></td>
                <td style={{ fontSize: 12, color: T.muted }}>{e.comment || '—'}</td>
                <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red }}>{fmt(e.amount)}</span></td>
              </tr>
            ))}
            {!expenses.length && <tr><td colSpan={5}><div className="empty"><div className="empty-icon">📤</div><div className="empty-text">Расходов нет</div></div></td></tr>}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
