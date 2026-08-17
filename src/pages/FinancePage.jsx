import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { T, fmt, ruDate, todayLocal, toLocalISO } from '../styles.jsx'

// ── Периоды ─────────────────────────────────────────────────
// Границы считаются локально: toISOString() в UTC+5 сдвигает первое
// число месяца на предыдущий месяц.
const monthRange = (shift = 0) => {
  const n = new Date()
  const from = new Date(n.getFullYear(), n.getMonth() + shift, 1)
  const to = new Date(n.getFullYear(), n.getMonth() + shift + 1, 0)
  return { from: toLocalISO(from), to: toLocalISO(to) }
}
const yearRange = () => {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}
const PRESETS = [
  { id: 'month',  label: 'Этот месяц',    range: () => monthRange(0) },
  { id: 'prev',   label: 'Прошлый месяц', range: () => monthRange(-1) },
  { id: 'year',   label: 'Этот год',      range: yearRange },
  { id: 'all',    label: 'Всё время',     range: () => ({ from: '', to: '' }) },
  { id: 'custom', label: 'Свой период',   range: null },
]

const inRange = (date, from, to) => {
  if (!date) return false
  const d = String(date).slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function FinancePage({ payments, expenses, directions, otherIncome = [], studioId }) {
  const [tab, setTab] = useState('Обзор')
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(() => monthRange(0).from)
  const [to, setTo] = useState(() => monthRange(0).to)

  // Касса или начисление. Влияет только на зарплату: у остальных расходов
  // периода начисления нет, они всегда стоят своей датой.
  const [basis, setBasis] = useState('cash')   // 'cash' | 'accrual'

  // Периоды выплат: expenses.payout_id → teacher_payouts.period_from/period_to.
  // Отдельное поле «за какой период» расходу не нужно — период уже хранится
  // у выплаты, к которой расход привязан (баг 38).
  const [payouts, setPayouts] = useState({})
  useEffect(() => {
    if (!studioId) return
    const hasSalary = (expenses || []).some(e => e.payout_id)
    if (!hasSalary) { setPayouts({}); return }
    supabase.from('teacher_payouts').select('id, period_from, period_to')
      .eq('studio_id', studioId)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(p => { map[p.id] = p })
        setPayouts(map)
      })
  }, [studioId, expenses])

  const applyPreset = (id) => {
    setPreset(id)
    const p = PRESETS.find(x => x.id === id)
    if (p?.range) { const r = p.range(); setFrom(r.from); setTo(r.to) }
  }

  // Дата, по которой расход попадает в период.
  // Зарплата в режиме «по начислению» датируется КОНЦОМ периода, за который
  // платили: выплата за 01.08–31.08 относится к августу, даже если деньги
  // ушли 5 сентября.
  const expenseDate = (e) => {
    if (basis === 'accrual' && e.payout_id) {
      const p = payouts[e.payout_id]
      if (p?.period_to) return p.period_to
    }
    return e.expense_date
  }

  const f = useMemo(() => {
    const pays = (payments || []).filter(p => inRange(p.payment_date, from, to))
    const other = (otherIncome || []).filter(r => inRange(r.income_date, from, to))
    const exps = (expenses || []).filter(e => inRange(expenseDate(e), from, to))
    return { pays, other, exps }
  }, [payments, otherIncome, expenses, from, to, basis, payouts])

  const subsIncome = f.pays.reduce((s, p) => s + (p.amount || 0), 0)
  const extraIncome = f.other.reduce((s, r) => s + (+r.amount || 0), 0)
  const income = subsIncome + extraIncome
  const totalExp = f.exps.reduce((s, e) => s + (e.amount || 0), 0)
  const profit = income - totalExp
  const margin = income ? Math.round(profit / income * 100) : 0

  // Сколько выплат переехало между периодами из-за выбранной базы —
  // чтобы было видно, что переключатель сработал, а не завис
  const movedCount = useMemo(() => {
    if (basis !== 'accrual') return 0
    return (expenses || []).filter(e => {
      if (!e.payout_id) return false
      const acc = payouts[e.payout_id]?.period_to
      return acc && acc !== e.expense_date
        && inRange(acc, from, to) !== inRange(e.expense_date, from, to)
    }).length
  }, [expenses, payouts, basis, from, to])

  const periodLabel = !from && !to
    ? 'за всё время'
    : `${from ? ruDate(from) : '…'} — ${ruDate(to || todayLocal())}`

  return (
    <div>
      {/* ── Панель периода ───────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${preset === p.id ? T.green : T.border}`,
                background: preset === p.id ? `${T.green}18` : 'white',
                color: preset === p.id ? T.greenDark : T.muted,
                fontFamily: 'inherit',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="form-row" style={{ marginBottom: 10 }}>
            <div className="form-group">
              <label className="form-label">С</label>
              <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">По</label>
              <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.muted }}>Зарплата считается:</span>
          <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[
              { id: 'cash',    label: 'по дате выплаты' },
              { id: 'accrual', label: 'по периоду начисления' },
            ].map(b => (
              <button key={b.id} onClick={() => setBasis(b.id)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px', border: 'none', cursor: 'pointer',
                  background: basis === b.id ? T.green : 'white',
                  color: basis === b.id ? 'white' : T.muted,
                  fontFamily: 'inherit',
                }}>
                {b.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: T.muted }}>
            {basis === 'cash'
              ? 'сколько денег ушло из кассы за период'
              : 'во сколько обошёлся этот период работы'}
            {movedCount > 0 && ` · выплат переехало: ${movedCount}`}
          </span>
        </div>
      </div>

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
                <div className="stat-sub">{periodLabel}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
            <div className="card card-pad">
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 14 }}>💰 Доходы по направлениям</div>
              {directions.map(d => {
                const sum = f.pays.filter(p => p.direction_id === d.id).reduce((s, p) => s + (p.amount || 0), 0)
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
              {!income && (
                <div style={{ fontSize: 12, color: T.muted, paddingTop: 8 }}>За выбранный период доходов нет</div>
              )}
            </div>

            <div className="card card-pad">
              <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 14 }}>📤 Расходы по категориям</div>
              {Object.entries(
                f.exps.reduce((acc, e) => { acc[e.expense_type] = (acc[e.expense_type] || 0) + e.amount; return acc }, {})
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
              {!totalExp && (
                <div style={{ fontSize: 12, color: T.muted }}>За выбранный период расходов нет</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'Доходы' && (() => {
        // Один список вместо двух: оплаты по абонементам и прочие доходы
        // сведены вместе и отсортированы по дате — видно всю выручку сразу,
        // а тип различается меткой.
        const rows = [
          ...f.pays.filter(p => p.amount > 0).map(p => ({
            key: `p${p.id}`,
            date: p.payment_date,
            kind: p.payment_type || 'Оплата',
            isExtra: false,
            note: directions.find(d => d.id === p.direction_id)?.name || '—',
            amount: p.amount,
          })),
          ...f.other.map(r => ({
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
                {!rows.length && <tr><td colSpan={4}><div className="empty"><div className="empty-icon">💰</div><div className="empty-text">За выбранный период доходов нет</div></div></td></tr>}
              </tbody>
            </table></div>
          </>
        )
      })()}

      {tab === 'Расходы' && (
        <div className="table-wrap"><table>
          <thead><tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Комментарий</th><th>Сумма</th></tr></thead>
          <tbody>
            {f.exps.map(e => {
              const period = e.payout_id ? payouts[e.payout_id] : null
              const shifted = period?.period_to && period.period_to !== e.expense_date
              return (
                <tr key={e.id}>
                  <td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>
                    {ruDate(expenseDate(e))}
                    {shifted && (
                      <div style={{ fontSize: 10, color: T.muted }}>
                        {basis === 'accrual'
                          ? `выплачено ${ruDate(e.expense_date)}`
                          : `за ${ruDate(period.period_from)} — ${ruDate(period.period_to)}`}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{e.expense_type}</td>
                  <td><span className={`badge ${e.category === 'Периодичный' ? 'badge-blue' : 'badge-gray'}`}>{e.category}</span></td>
                  <td style={{ fontSize: 12, color: T.muted }}>{e.comment || '—'}</td>
                  <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red }}>{fmt(e.amount)}</span></td>
                </tr>
              )
            })}
            {!f.exps.length && <tr><td colSpan={5}><div className="empty"><div className="empty-icon">📤</div><div className="empty-text">За выбранный период расходов нет</div></div></td></tr>}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
