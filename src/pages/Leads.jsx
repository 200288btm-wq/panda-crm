import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const STATUS_CONFIG = {
  new:       { label: 'Новая',       color: 'bg-blue-100 text-blue-800' },
  called:    { label: 'Позвонили',   color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Подтверждена',color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Отменена',    color: 'bg-red-100 text-red-800' },
}

const SOURCE_CONFIG = {
  camp:   { label: '🏕 Лагерь',  color: 'bg-emerald-100 text-emerald-800' },
  studio: { label: '🐼 Студия',  color: 'bg-purple-100 text-purple-800' },
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
    // Обновляем каждые 30 секунд
    const interval = setInterval(fetchLeads, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchLeads() {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setLeads(data || [])
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
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Yekaterinburg'
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заявки</h1>
          <p className="text-sm text-gray-500 mt-1">
            Входящие заявки с сайта лагеря и студии
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          🔄 Обновить
        </button>
      </div>

      {/* Счётчики статусов */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { key: 'all',       label: 'Все',          color: 'border-gray-300' },
          { key: 'new',       label: 'Новые',        color: 'border-blue-400' },
          { key: 'called',    label: 'Позвонили',    color: 'border-yellow-400' },
          { key: 'confirmed', label: 'Подтверждены', color: 'border-green-400' },
          { key: 'cancelled', label: 'Отменены',     color: 'border-red-400' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            className={`p-3 bg-white rounded-xl border-2 text-left transition-all ${
              filterStatus === s.key ? s.color + ' shadow-md' : 'border-transparent shadow-sm hover:shadow-md'
            }`}
          >
            <div className="text-2xl font-bold text-gray-900">{counts[s.key]}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Фильтр по источнику */}
      <div className="flex gap-2 mb-4">
        {['all', 'camp', 'studio'].map(src => (
          <button
            key={src}
            onClick={() => setFilterSource(src)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterSource === src
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {src === 'all' ? '📋 Все источники' : SOURCE_CONFIG[src]?.label}
          </button>
        ))}
      </div>

      {/* Список заявок */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-gray-500">Заявок пока нет</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lead => (
            <div
              key={lead.id}
              className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md ${
                lead.status === 'new' ? 'border-blue-200' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-4">

                {/* Основная информация */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {/* Источник */}
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${SOURCE_CONFIG[lead.source]?.color}`}>
                      {SOURCE_CONFIG[lead.source]?.label || lead.source}
                    </span>
                    {/* Статус */}
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_CONFIG[lead.status]?.color}`}>
                      {STATUS_CONFIG[lead.status]?.label}
                    </span>
                    {/* Дата */}
                    <span className="text-xs text-gray-400">
                      {formatDate(lead.created_at)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Ребёнок</div>
                      <div className="font-semibold text-gray-900 text-sm">
                        {lead.child_name || '—'}
                        {lead.child_age && <span className="text-gray-500 font-normal">, {lead.child_age}</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Телефон</div>
                      <a
                        href={`tel:${lead.parent_phone}`}
                        className="font-semibold text-blue-600 text-sm hover:underline"
                      >
                        {lead.parent_phone}
                      </a>
                    </div>
                    {lead.squad && (
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Отряд</div>
                        <div className="text-sm text-gray-700">{lead.squad}</div>
                      </div>
                    )}
                    {lead.dates && (
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Даты</div>
                        <div className="text-sm text-gray-700">{lead.dates}</div>
                      </div>
                    )}
                  </div>

                  {/* Заметка */}
                  {editingNote === lead.id ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Добавить заметку..."
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && saveNote(lead.id)}
                      />
                      <button onClick={() => saveNote(lead.id)} className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">Сохранить</button>
                      <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">Отмена</button>
                    </div>
                  ) : lead.notes ? (
                    <div
                      className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100"
                      onClick={() => { setEditingNote(lead.id); setNoteText(lead.notes) }}
                    >
                      💬 {lead.notes}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingNote(lead.id); setNoteText('') }}
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      + добавить заметку
                    </button>
                  )}
                </div>

                {/* Действия */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <select
                    value={lead.status}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white cursor-pointer"
                  >
                    <option value="new">Новая</option>
                    <option value="called">Позвонили</option>
                    <option value="confirmed">Подтверждена</option>
                    <option value="cancelled">Отменена</option>
                  </select>
                  <button
                    onClick={() => deleteLead(lead.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors text-right"
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
