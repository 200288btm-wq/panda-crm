import { useState } from 'react'
import { T, fmt } from '../styles.jsx'

// Чек-лист «Начало работы» — помогает настроить новую студию.
// Галочки загораются автоматически, когда в студии появляются данные.
// Скрывается кнопкой (запоминается в localStorage по студии).
function SetupChecklist({ directions = [], teachers = [], clientStatuses = [], clients = [], studioSettings, studioId, navigate }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(`setupHidden_${studioId}`) === '1')

  const items = [
    { key: 'studio',     label: 'Студия создана',                              done: true,                          page: null },
    { key: 'directions', label: 'Добавьте направления (программы студии)',      done: directions.length > 0,         page: 'directions' },
    { key: 'teachers',   label: 'Добавьте педагогов',                          done: teachers.length > 0,           page: 'teachers' },
    { key: 'refs',       label: 'Настройте справочники (статусы, длительности, цены)', done: clientStatuses.length > 0, page: 'studio_settings' },
    { key: 'logo',       label: 'Загрузите логотип студии',                    done: !!studioSettings?.logo_url,    page: 'studio_settings' },
    { key: 'client',     label: 'Добавьте первого клиента',                    done: clients.length > 0,            page: 'clients' },
  ]
  const doneCount = items.filter(i => i.done).length
  const allDone = doneCount === items.length

  if (hidden) return null

  const hide = () => { localStorage.setItem(`setupHidden_${studioId}`, '1'); setHidden(true) }

  return (
    <div style={{ background: 'white', border: `1px solid ${T.green}44`, borderRadius: 16, padding: '18px 22px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 16, color: T.ink }}>
          {allDone ? '🎉 Студия настроена!' : '🚀 Начало работы'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{doneCount} из {items.length}</span>
          <button onClick={hide}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Скрыть
          </button>
        </div>
      </div>

      {/* прогресс-полоса */}
      <div style={{ height: 6, background: T.cream, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${(doneCount / items.length) * 100}%`, background: T.green, transition: 'width .3s' }} />
      </div>

      {allDone ? (
        <div style={{ fontSize: 13, color: T.greenDark, fontWeight: 600 }}>
          Все основные шаги выполнены. Можно скрыть этот блок — он больше не понадобится.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <div key={it.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{it.done ? '✅' : '⬜'}</span>
                <span style={{ fontSize: 13, color: it.done ? T.muted : T.ink, textDecoration: it.done ? 'line-through' : 'none' }}>
                  {it.label}
                </span>
              </div>
              {!it.done && it.page && (
                <button onClick={() => navigate && navigate(it.page)}
                  style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.greenDark, background: `${T.green}18`, border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                  Настроить →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ clients, payments, expenses, directions, teachers = [], clientStatuses = [], studioSettings, studioId, isDirector, navigate }) {
  const active = clients.filter(c => c.status === 'Активен').length
  const income = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const profit = income - totalExp
  const avg = active ? Math.round(income / active) : 0
  const newC = clients.filter(c => c.status === 'Новый').length
  // Реальный баланс = (начальные paid_lessons + занятия из оплат) - visited_lessons
  const debtors = clients
    .filter(c => c.status === 'Активен')
    .map(c => {
      const paidFromPayments = payments
        .filter(p => p.client_id === c.id)
        .reduce((s, p) => s + (+p.lessons_count || 0), 0)
      const totalPaid = (c.paid_lessons || 0) + paidFromPayments
      const totalVisited = c.visited_lessons || 0
      return { ...c, realBalance: totalPaid - totalVisited, totalPaid, totalVisited }
    })
    .filter(c => c.realBalance < 0)
    .sort((a, b) => a.realBalance - b.realBalance)

  const hashColor = (str = '') => {
    const colors = [T.green, T.orange, '#7c3aed', '#3b82f6', '#ec4899', '#14b8a6']
    let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % colors.length
    return colors[h]
  }

  return (
    <div>
      {isDirector && (
        <SetupChecklist directions={directions} teachers={teachers} clientStatuses={clientStatuses}
          clients={clients} studioSettings={studioSettings} studioId={studioId} navigate={navigate} />
      )}
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
              <div key={c.id} className="fin-row" onClick={() => navigate && navigate('clients', { clientId: c.id })}
                style={{ cursor: navigate ? 'pointer' : 'default', borderRadius: 8, padding: '6px 4px', margin: '0 -4px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5ee'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="avatar" style={{ background: hashColor(c.child_name), width: 28, height: 28, fontSize: 11 }}>{(c.child_name || '?')[0]}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.child_name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>опл. {c.totalPaid} · пос. {c.totalVisited}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.red, whiteSpace: 'nowrap' }}>{c.realBalance} зан.</span>
                  {navigate && <span style={{ fontSize: 11, color: T.muted }}>→</span>}
                </div>
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
