import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const STATUS = {
  new:       { label: 'Новая',        bg: '#EFF6FF', color: '#1D4ED8' },
  called:    { label: 'Позвонили',    bg: '#FFFBEB', color: '#B45309' },
  confirmed: { label: 'Подтверждена', bg: '#F0FDF4', color: '#15803D' },
  cancelled: { label: 'Отменена',     bg: '#FEF2F2', color: '#B91C1C' },
}

const SOURCE = {
  camp:   { label: '🏕 Лагерь', bg: '#ECFDF5', color: '#065F46' },
  studio: { label: '🐼 Студия', bg: '#F5F3FF', color: '#5B21B6' },
}

function Badge({ cfg }) {
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: '2px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [editingNote, setEditingNote] = useState(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setLeads(data)
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  async function saveNote(id) {
    await supabase.from('leads').update({ notes: noteText }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, notes: noteText } : l))
    setEditingNote(null)
  }

  async function deleteLead(id) {
    if (!confirm('Удалить заявку?')) return
    await supabase.from('leads').delete().eq('id', id)
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  const filtered = leads.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (filterSource !== 'all' && l.source !== filterSource) return false
    return true
  })

  const counts = {
    all: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    called: leads.filter(l => l.status === 'called').length,
    confirmed: leads.filter(l => l.status === 'confirmed').length,
    cancelled: leads.filter(l => l.status === 'cancelled').length,
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Yekaterinburg'
    })
  }

  const statBtns = [
    { key: 'all',       label: 'Все',           borderColor: T.muted },
    { key: 'new',       label: 'Новые',         borderColor: '#3B82F6' },
    { key: 'called',    label: 'Позвонили',     borderColor: '#F59E0B' },
    { key: 'confirmed', label: 'Подтверждены',  borderColor: T.green },
    { key: 'cancelled', label: 'Отменены',      borderColor: '#EF4444' },
  ]

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* Счётчики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        {statBtns.map(s => (
          <div
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            className="card"
            style={{
              cursor: 'pointer', padding: '14px 16px',
              borderLeft: `4px solid ${filterStatus === s.key ? s.borderColor : 'transparent'}`,
              transition: 'border-color .15s',
              userSelect: 'none'
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, color: filterStatus === s.key ? s.borderColor : T.dark }}>
              {counts[s.key]}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Фильтр источника + кнопка обновить */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',    label: '📋 Все' },
          { key: 'camp',   label: '🏕 Лагерь' },
          { key: 'studio', label: '🐼 Студия' },
        ].map(s => (
          <button
            key={s.key}
            className={filterSource === s.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding: '6px 16px', fontSize: 13 }}
            onClick={() => setFilterSource(s.key)}
          >
            {s.label}
          </button>
        ))}
        <button
          className="btn btn-secondary"
          style={{ marginLeft: 'auto', padding: '6px 16px', fontSize: 13 }}
          onClick={fetchLeads}
        >
          🔄 Обновить
        </button>
      </div>

      {/* Список */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ color: T.muted }}>Заявок пока нет</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(lead => (
            <div
              key={lead.id}
              className="card"
              style={{
                padding: '16px 20px',
                borderLeft: lead.status === 'new' ? '4px solid #3B82F6' : '4px solid transparent',
              }}
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                    {SOURCE[lead.source] && <Badge cfg={SOURCE[lead.source]} />}
                    {STATUS[lead.status] && <Badge cfg={STATUS[lead.status]} />}
                    <span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>
                      {formatDate(lead.created_at)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: '8px 16px' }}>
                    <div>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Ребёнок</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {lead.child_name || '—'}
                        {lead.child_age && <span style={{ fontWeight: 400, color: T.muted }}>, {lead.child_age}</span>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Телефон</div>
                      <a href={`tel:${lead.parent_phone}`} style={{ fontWeight: 700, fontSize: 14, color: T.green, textDecoration: 'none' }}>
                        {lead.parent_phone}
                      </a>
                    </div>
                    {lead.squad && (
                      <div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Отряд</div>
                        <div style={{ fontSize: 14 }}>{lead.squad}</div>
                      </div>
                    )}
                    {lead.dates && (
                      <div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Даты</div>
                        <div style={{ fontSize: 14 }}>{lead.dates}</div>
                      </div>
                    )}
                  </div>

                  {editingNote === lead.id ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <input
                        className="form-input"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Заметка..."
                        style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && saveNote(lead.id)}
                      />
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => saveNote(lead.id)}>Сохранить</button>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setEditingNote(null)}>Отмена</button>
                    </div>
                  ) : lead.notes ? (
                    <div
                      onClick={() => { setEditingNote(lead.id); setNoteText(lead.notes) }}
                      style={{ marginTop: 10, fontSize: 13, color: T.muted, background: '#f9f9f7', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
                    >
                      💬 {lead.notes}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingNote(lead.id); setNoteText('') }}
                      style={{ marginTop: 8, fontSize: 12, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      + добавить заметку
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <select
                    className="form-input"
                    value={lead.status}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 130 }}
                  >
                    <option value="new">Новая</option>
                    <option value="called">Позвонили</option>
                    <option value="confirmed">Подтверждена</option>
                    <option value="cancelled">Отменена</option>
                  </select>
                  <button
                    onClick={() => deleteLead(lead.id)}
                    style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' }}
                  >
                    удалить
                  </button>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
