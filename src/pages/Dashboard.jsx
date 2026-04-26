import { T, fmt } from '../styles.jsx'

export default function Dashboard({ clients, payments, expenses, directions, isDirector }) {
  const active = clients.filter(c => c.status === 'Активен').length
  const income = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const profit = income - totalExp
  const avg = active ? Math.round(income / active) : 0
  const newC = clients.filter(c => c.status === 'Новый').length
  const debtors = clients.filter(c => (c.balance || 0) < 0)

  const hashColor = (str = '') => {
    const colors = [T.green, T.orange, '#7c3aed', '#3b82f6', '#ec4899', '#14b8a6']
    let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % colors.length
    return colors[h]
  }

  return (
    <div>
      <div className="stats-grid">
        {[
          { label: 'Активных клиентов', val: active, sub: `из ${clients.length} всего`, cls: 'stat-green' },
          ...(isDirector ? [
            { label: 'Доход за период', val: fmt(income), sub: 'все оплаты', cls: 'stat-green' },
            { label: 'Расходы', val: fmt(totalExp), sub: 'все категории', cls: 'stat-red' },
            { label: 'Прибыль', val: fmt(profit), sub: 'доход − расходы', cls: profit >= 0 ? 'stat-green' : 'stat-red' },
            { label: 'Средний чек', val: fmt(avg), sub: 'на активного клиента', cls: 'stat-orange' },
          ] : []),
          { label: 'Новых клиентов', val: newC, sub: 'ожидают записи', cls: 'stat-orange' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls}`}>{s.val}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="card card-pad">
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 14 }}>📊 Заполненность групп</div>
          {directions.map(d => {
            const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
            const capacity = d.max_capacity || 0
            const pct = capacity > 0 ? Math.min(Math.round(cnt / capacity * 100), 100) : (active > 0 ? Math.round(cnt / active * 100) : 0)
            const color = d.color || T.green
            const isFull = capacity > 0 && cnt >= capacity
            const isNearFull = capacity > 0 && cnt >= capacity * 0.8

            return (
              <div key={d.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 4, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    <span>{d.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: T.muted, fontSize: 12 }}>
                      {cnt}{capacity > 0 ? `/${capacity}` : ''} чел.
                      {capacity > 0 ? ` · ${pct}%` : ''}
                    </span>
                    {isFull && <span className="badge badge-red">Группа полная</span>}
                    {!isFull && isNearFull && <span className="badge badge-orange">Почти полная</span>}
                  </div>
                </div>
                <div className="prog-bar">
                  <div className="prog-fill" style={{
                    width: (capacity > 0 ? pct : (active > 0 ? pct : 0)) + '%',
                    background: isFull ? T.red : isNearFull ? T.orange : color
                  }} />
                </div>
              </div>
            )
          })}

          <div className="divider" />
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📥 Источники клиентов</div>
          {Object.entries(clients.reduce((acc, c) => { acc[c.source || 'Не указан'] = (acc[c.source || 'Не указан'] || 0) + 1; return acc }, {}))
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <div key={k} className="fin-row">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{k}</span>
                <span className="badge badge-green">{v}</span>
              </div>
            ))}
        </div>

        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 12 }}>🔴 Задолженности</div>
            {debtors.length ? debtors.map(c => (
              <div key={c.id} className="fin-row">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="avatar" style={{ background: hashColor(c.child_name), width: 28, height: 28, fontSize: 11 }}>{(c.child_name || '?')[0]}</div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.child_name}</span>
                </div>
                <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red }}>{fmt(Math.abs(c.balance))}</span>
              </div>
            )) : (
              <div className="empty" style={{ padding: '16px 0' }}>
                <div className="empty-icon" style={{ fontSize: 24 }}>✅</div>
                <div className="empty-text">Долгов нет</div>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📈 Статусы клиентов</div>
            {Object.entries(clients.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc }, {})).map(([k, v]) => (
              <div key={k} className="fin-row">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{k}</span>
                <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
