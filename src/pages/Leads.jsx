import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import { Modal } from '../components/Modal'

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

// Модалка ручного добавления заявки
function AddLeadModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    parent_name: '', parent_phone: '', child_name: '', child_age: '',
    source: 'studio', status: 'new', notes: '', squad: '', dates: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.parent_phone.trim()) { alert('Укажите телефон'); return }
    setSaving(true)
    const { error } = await supabase.from('leads').insert({
      parent_name: f.parent_name.trim() || null,
      parent_phone: f.parent_phone.trim(),
      child_name: f.child_name.trim() || null,
      child_age: f.child_age.trim() || null,
      source: f.source,
      status: f.status,
      notes: f.notes.trim() || null,
      squad: f.squad.trim() || null,
      dates: f.dates.trim() || null,
      studio_id: studioId,
    })
    setSaving(false)
    if (error) { alert('Ошибка: ' + error.message); return }
    onSaved()
    onClose()
  }

  const inp = { fontSize: 16, padding: '8px 12px' }
  return (
    <Modal title="+ Новая заявка" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={saving}>Отмена</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group">
          <label className="form-label">Имя родителя</label>
          <input className="form-input" style={inp} value={f.parent_name} onChange={e => set('parent_name', e.target.value)} placeholder="Анна" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Телефон *</label>
          <input className="form-input" style={inp} value={f.parent_phone} onChange={e => set('parent_phone', e.target.value)} placeholder="+7..." />
        </div>
        <div className="form-group">
          <label className="form-label">Имя ребёнка</label>
          <input className="form-input" style={inp} value={f.child_name} onChange={e => set('child_name', e.target.value)} placeholder="Иван" />
        </div>
        <div className="form-group">
          <label className="form-label">Возраст</label>
          <input className="form-input" style={inp} value={f.child_age} onChange={e => set('child_age', e.target.value)} placeholder="5 лет" />
        </div>
        <div className="form-group">
          <label className="form-label">Источник</label>
          <select className="form-input" style={inp} value={f.source} onChange={e => set('source', e.target.value)}>
            <option value="studio">🐼 Студия</option>
            <option value="camp">🏕 Лагерь</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Статус</label>
          <select className="form-input" style={inp} value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="new">Новая</option>
            <option value="called">Позвонили</option>
            <option value="confirmed">Подтверждена</option>
            <option value="cancelled">Отменена</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Отряд / программа</label>
        <input className="form-input" style={inp} value={f.squad} onChange={e => set('squad', e.target.value)} placeholder="Смышлёная Панда" />
      </div>
      <div className="form-group">
        <label className="form-label">Даты</label>
        <input className="form-input" style={inp} value={f.dates} onChange={e => set('dates', e.target.value)} placeholder="июнь–август" />
      </div>
      <div className="form-group">
        <label className="form-label">Заметка</label>
        <textarea className="form-input" style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.4 }}
          value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Комментарий..." />
      </div>
    </Modal>
  )
}

// Модалка создания клиента из заявки
function ConvertLeadModal({ lead, directions, onClose, onConverted }) {
  const [form, setForm] = useState({
    child_name: lead.child_name || '',
    parent_name: lead.parent_name || '',
    parent_phone: lead.parent_phone || '',
    child_age: lead.child_age || '',
    direction_ids: [],
    status: 'Активен',
    comment: lead.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const toggleDir = (id) => {
    setForm(p => ({
      ...p,
      direction_ids: p.direction_ids.includes(id)
        ? p.direction_ids.filter(x => x !== id)
        : [...p.direction_ids, id]
    }))
  }

  const save = async () => {
    if (!form.child_name.trim()) { setError('Укажите имя ребёнка'); return }
    setError(null)
    setSaving(true)
    const payload = {
      child_name: form.child_name.trim(),
      adult_name: form.parent_name.trim() || null,
      contacts: form.parent_phone.trim() ? [{ type: 'Телефон', val: form.parent_phone.trim() }] : [],
      direction_ids: form.direction_ids,
      status: form.status,
      paid_lessons: 0,
      visited_lessons: 0,
      balance: 0,
      discount: 0,
      comment: form.comment.trim() || null,
      studio_id: studioId,
    }
    const { data, error: err } = await supabase.from('clients').insert(payload).select()
    setSaving(false)
    if (err) {
      setError('Ошибка: ' + (err.message || JSON.stringify(err)))
      return
    }
    // Удаляем заявку после успешного переноса
    await supabase.from('leads').delete().eq('id', lead.id)
    onConverted()
    onClose()
  }

  const inp = { fontSize: 16, padding: '8px 12px' }
  return (
    <Modal title="👤 Добавить клиента из заявки" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={saving}>Отмена</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Создаём...' : '✅ Создать клиента'}</button></>}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-group">
        <label className="form-label">Имя ребёнка *</label>
        <input className="form-input" style={inp} value={form.child_name} onChange={e => set('child_name', e.target.value)} placeholder="Иван" autoFocus />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group">
          <label className="form-label">Имя родителя</label>
          <input className="form-input" style={inp} value={form.parent_name} onChange={e => set('parent_name', e.target.value)} placeholder="Анна" />
        </div>
        <div className="form-group">
          <label className="form-label">Телефон</label>
          <input className="form-input" style={inp} value={form.parent_phone} onChange={e => set('parent_phone', e.target.value)} placeholder="+7..." />
        </div>
      </div>
      {lead.child_age && (
        <div style={{ fontSize:12, color:T.muted, background:T.cream, borderRadius:8, padding:'6px 12px', marginBottom:4 }}>
          ℹ️ Возраст из заявки: <b>{lead.child_age}</b> — дату рождения можно добавить в карточке клиента после создания
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Статус</label>
        <select className="form-input" style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="Активен">Активен</option>
          <option value="Новый">Новый</option>
          <option value="Заморожен">Заморожен</option>
        </select>
      </div>
      {directions && directions.length > 0 && (
        <div className="form-group">
          <label className="form-label">Направления</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
            {directions.map(d => {
              const active = form.direction_ids.includes(d.id)
              return (
                <div key={d.id} onClick={() => toggleDir(d.id)} style={{
                  padding:'6px 14px', borderRadius:20, cursor:'pointer', fontSize:13, fontWeight:600,
                  background: active ? (d.color || T.green)+'22' : T.cream,
                  border:`2px solid ${active ? (d.color || T.green) : T.border}`,
                  color: active ? (d.color || T.green) : T.muted, transition:'all 0.15s',
                }}>{d.name}</div>
              )
            })}
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">💬 Комментарий к клиенту</label>
        <textarea className="form-input" style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
          value={form.comment} onChange={e => set('comment', e.target.value)}
          rows={3} placeholder="Заметки о клиенте..." />
      </div>
    </Modal>
  )
}

export default function Leads({ directions = [], studioId }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [editingNote, setEditingNote] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [convertLead, setConvertLead] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

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
          <div key={s.key} onClick={() => setFilterStatus(s.key)} className="card"
            style={{ cursor:'pointer', padding:'14px 16px', borderLeft:`4px solid ${filterStatus===s.key ? s.borderColor : 'transparent'}`, transition:'border-color .15s', userSelect:'none' }}>
            <div style={{ fontSize:24, fontWeight:900, color: filterStatus===s.key ? s.borderColor : T.dark }}>{counts[s.key]}</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Фильтр источника + кнопки */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { key: 'all',    label: '📋 Все' },
          { key: 'camp',   label: '🏕 Лагерь' },
          { key: 'studio', label: '🐼 Студия' },
        ].map(s => (
          <button key={s.key}
            className={filterSource === s.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding:'6px 16px', fontSize:13 }}
            onClick={() => setFilterSource(s.key)}>
            {s.label}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className="btn btn-secondary" style={{ padding:'6px 16px', fontSize:13 }} onClick={fetchLeads}>🔄 Обновить</button>
          <button className="btn btn-primary" style={{ padding:'6px 16px', fontSize:13 }} onClick={() => setShowAddModal(true)}>+ Заявка</button>
        </div>
      </div>

      {/* Список */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:T.muted }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'60px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
          <div style={{ color:T.muted }}>Заявок пока нет</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(lead => (
            <div key={lead.id} className="card"
              style={{ padding:'16px 20px', borderLeft: lead.status==='new' ? '4px solid #3B82F6' : '4px solid transparent' }}>
              <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10, alignItems:'center' }}>
                    {SOURCE[lead.source] && <Badge cfg={SOURCE[lead.source]} />}
                    {STATUS[lead.status] && <Badge cfg={STATUS[lead.status]} />}
                    <span style={{ fontSize:11, color:T.muted, marginLeft:4 }}>{formatDate(lead.created_at)}</span>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:'8px 16px' }}>
                    {lead.parent_name && (
                      <div>
                        <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Родитель</div>
                        <div style={{ fontWeight:700, fontSize:14 }}>{lead.parent_name}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Телефон</div>
                      <a href={`tel:${lead.parent_phone}`} style={{ fontWeight:700, fontSize:14, color:T.green, textDecoration:'none' }}>{lead.parent_phone}</a>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Ребёнок</div>
                      <div style={{ fontWeight:700, fontSize:14 }}>
                        {lead.child_name || '—'}
                        {lead.child_age && <span style={{ fontWeight:400, color:T.muted }}>, {lead.child_age}</span>}
                      </div>
                    </div>
                    {lead.squad && (
                      <div>
                        <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Отряд</div>
                        <div style={{ fontSize:14 }}>{lead.squad}</div>
                      </div>
                    )}
                    {lead.dates && (
                      <div>
                        <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Даты</div>
                        <div style={{ fontSize:14 }}>{lead.dates}</div>
                      </div>
                    )}
                  </div>

                  {editingNote === lead.id ? (
                    <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap', minWidth:0 }}>
                      <textarea className="form-input" value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Заметка..." rows={2}
                        style={{ flex:'1 1 200px', minWidth:0, padding:'8px 10px', fontSize:16, resize:'vertical', fontFamily:'inherit', lineHeight:1.4 }}
                        onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); saveNote(lead.id) } }} />
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button className="btn btn-primary" style={{ padding:'8px 14px', fontSize:14 }} onClick={() => saveNote(lead.id)}>Сохранить</button>
                        <button className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:14 }} onClick={() => setEditingNote(null)}>Отмена</button>
                      </div>
                    </div>
                  ) : lead.notes ? (
                    <div onClick={() => { setEditingNote(lead.id); setNoteText(lead.notes) }}
                      style={{ marginTop:10, fontSize:13, color:T.muted, background:'#f9f9f7', borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                      💬 {lead.notes}
                    </div>
                  ) : (
                    <button onClick={() => { setEditingNote(lead.id); setNoteText('') }}
                      style={{ marginTop:8, fontSize:12, color:T.muted, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                      + добавить заметку
                    </button>
                  )}
                </div>

                {/* Правая колонка: статус + действия */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0, minWidth:130 }}>
                  <select className="form-input" value={lead.status}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    style={{ padding:'5px 8px', fontSize:12, cursor:'pointer' }}>
                    <option value="new">Новая</option>
                    <option value="called">Позвонили</option>
                    <option value="confirmed">Подтверждена</option>
                    <option value="cancelled">Отменена</option>
                  </select>
                  <button onClick={() => setConvertLead(lead)}
                    style={{ fontSize:12, color:T.green, background:T.greenBg, border:`1px solid ${T.green}44`, borderRadius:8, cursor:'pointer', padding:'6px 8px', fontWeight:700, fontFamily:'inherit', textAlign:'center' }}>
                    👤 В клиенты
                  </button>
                  <button onClick={() => deleteLead(lead.id)}
                    style={{ fontSize:12, color:'#EF4444', background:'#FEF2F2', border:'1px solid #EF444444', borderRadius:8, cursor:'pointer', padding:'6px 8px', fontWeight:700, fontFamily:'inherit', textAlign:'center' }}>
                    🗑 Удалить
                  </button>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddLeadModal onClose={() => setShowAddModal(false)} onSaved={fetchLeads} />}

      {convertLead && (
        <ConvertLeadModal lead={convertLead} directions={directions}
          onClose={() => setConvertLead(null)}
          onConverted={() => { fetchLeads(); setConvertLead(null) }} />
      )}
    </div>
  )
}
