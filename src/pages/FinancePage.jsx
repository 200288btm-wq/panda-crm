import { useState } from 'react'
import { T, fmt } from '../styles.jsx'

// Даты выводились сырым ISO (2026-08-08)
const ruDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-')
  return d ? `${d}.${m}.${y}` : iso
}

export default function FinancePage({ payments, expenses, directions, otherIncome = [] }) {
  const [tab, setTab] = useState('Обзор')

  const subsIncome = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const extraIncome = otherIncome.reduce((s, r) => s + (+r.amount || 0), 0)
  const income = subsIncome + extraIncome
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
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
              {extraIncome > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <div className="fin-row" style={{ padding: '4px 0', border: 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Прочие доходы</span>
                    <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 13 }}>{fmt(extraIncome)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>Не привязаны к направлению</div>
                </div>
              )}
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

      {tab === 'Доходы' && (() => {
        // Один список вместо двух: оплаты по абонементам и прочие доходы
        // сведены вместе и отсортированы по дате — видно всю выручку сразу,
        // а тип различается меткой.
        const rows = [
          ...payments.filter(p => p.amount > 0).map(p => ({
            key: `p${p.id}`,
            date: p.payment_date,
            kind: p.payment_type || 'Оплата',
            isExtra: false,
            note: directions.find(d => d.id === p.direction_id)?.name || '—',
            amount: p.amount,
          })),
          ...otherIncome.map(r => ({
            key: `o${r.id}`,
            date: r.income_date,
            kind: 'Прочий доход',
            isExtra: true,
            note: r.comment || '—',
            amount: +r.amount || 0,
          })),
        ].sort((a, b) => String(b.date).localeCompare(String(a.date)))

        return (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="card card-pad" style={{ flex: '1 1 190px' }}>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>По абонементам и занятиям</div>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, color: T.greenDark }}>{fmt(subsIncome)}</div>
              </div>
              <div className="card card-pad" style={{ flex: '1 1 190px' }}>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Прочие доходы</div>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, color: T.orange }}>{fmt(extraIncome)}</div>
              </div>
              <div className="card card-pad" style={{ flex: '1 1 190px' }}>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Всего</div>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, color: T.ink }}>{fmt(income)}</div>
              </div>
            </div>

            <div className="table-wrap"><table>
              <thead><tr><th>Дата</th><th>Тип</th><th>Направление / комментарий</th><th>Сумма</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{ruDate(r.date)}</td>
                    <td><span className={`badge ${r.isExtra ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 11 }}>{r.kind}</span></td>
                    <td style={{ fontSize: 12 }}>{r.note}</td>
                    <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: r.isExtra ? T.orange : T.greenDark }}>{fmt(r.amount)}</span></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={4}><div className="empty"><div className="empty-icon">💰</div><div className="empty-text">Доходов пока нет</div></div></td></tr>}
              </tbody>
            </table></div>
          </>
        )
      })()}

      {tab === 'Расходы' && (
        <div className="table-wrap"><table>
          <thead><tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Комментарий</th><th>Сумма</th></tr></thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{ruDate(e.expense_date)}</td>
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
