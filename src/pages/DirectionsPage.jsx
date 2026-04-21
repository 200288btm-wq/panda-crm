import { T, fmt, hashColor } from '../styles'

export default function DirectionsPage({ directions, clients }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
        {directions.map(d => {
          const cnt = clients.filter(c => (c.direction_ids || []).includes(d.id) && c.status === 'Активен').length
          return (
            <div key={d.id} className="card card-pad" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15 }}>{d.name}</div>
                <span className="badge badge-green">{cnt} чел.</span>
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>🕐 {d.schedule}</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>👩‍🏫 {d.teacher_name}</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>📅 с {d.launched}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: T.greenBg, borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>С абонементом</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 18, color: T.greenDark }}>{d.cost_abo} ₽</div>
                </div>
                <div style={{ flex: 1, background: '#fff4e6', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#c47a00', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Разовое</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 18, color: '#c47a00' }}>{d.cost_single} ₽</div>
                </div>
              </div>
              {(d.groups || []).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                  {(d.groups || []).map(g => <span key={g} className="badge badge-gray">{g}</span>)}
                </div>
              )}
            </div>
          )
        })}
        {!directions.length && <div className="card card-pad"><div className="empty"><div className="empty-icon">🐾</div><div className="empty-text">Направлений пока нет</div></div></div>}
      </div>
    </div>
  )
}
