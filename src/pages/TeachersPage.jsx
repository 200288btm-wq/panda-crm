import { T, fmt, hashColor } from '../styles.jsx'

const STATUS_T = { 'Активен': 'badge-green', 'В поиске': 'badge-orange', 'Ожидание': 'badge-purple', 'Уволен': 'badge-gray' }

export default function TeachersPage({ teachers, directions }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary">+ Добавить педагога</button>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>ФИО</th><th>Направления</th><th>Статус</th><th>Ставка / занятие</th><th>Проведено</th><th>Принят</th><th>Контакт</th></tr></thead>
        <tbody>
          {teachers.map(t => (
            <tr key={t.id}>
              <td>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="avatar" style={{ background: hashColor(t.name), width: 32, height: 32, fontSize: 13 }}>{(t.name || '?')[0]}</div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                </div>
              </td>
              <td style={{ fontSize: 12 }}>{(t.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td><span className={`badge ${STATUS_T[t.status] || 'badge-gray'}`}>{t.status}</span></td>
              <td><span style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, color: T.greenDark }}>{fmt(t.rate)}</span></td>
              <td style={{ textAlign: 'center', fontFamily: 'Nunito,sans-serif', fontWeight: 800 }}>{t.lessons_count}</td>
              <td style={{ fontSize: 12, color: T.muted }}>{t.hired}</td>
              <td style={{ fontSize: 12, color: T.muted }}>{t.phone}</td>
            </tr>
          ))}
          {!teachers.length && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">👩‍🏫</div><div className="empty-text">Педагогов нет</div></div></td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}
