import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const Section = ({ title, icon, children }) => (
  <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 16, border: `1px solid ${T.border}` }}>
    <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 16 }}>
      {icon} {title}
    </div>
    {children}
  </div>
)

const Msg = ({ msg }) => msg ? (
  <div style={{ fontSize: 12, marginTop: 8, color: msg.type === 'error' ? '#e05a5a' : T.greenDark, fontWeight: 600 }}>
    {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
  </div>
) : null

export default function StudioSettingsPage({ studio, studioId }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [stampUploading, setStampUploading] = useState(false)
  const logoRef = useRef()
  const stampRef = useRef()

  // Категории абонементов
  const [categories, setCategories] = useState([])
  const [catSaving, setCatSaving] = useState(false)
  const [catMsg, setCatMsg] = useState(null)
  const [newCatName, setNewCatName] = useState('')

  // Периоды абонементов
  const [periods, setPeriods] = useState([])
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodMsg, setPeriodMsg] = useState(null)
  const [newPeriodName, setNewPeriodName] = useState('')

  useEffect(() => {
    if (!studioId) return
    loadAll()
  }, [studioId])

  const loadAll = async () => {
    const [s, c, p] = await Promise.all([
      supabase.from('studio_settings').select('*').eq('studio_id', studioId).maybeSingle(),
      supabase.from('price_categories').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('subscription_periods').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
    ])
    if (s.data) setSettings(s.data)
    else setSettings({ studio_id: studioId, studio_name: studio?.name || '', logo_url: '', address: '', inn: '', stamp_url: '', phone: '', email: '', website: '' })
    if (c.data) setCategories(c.data)
    if (p.data) setPeriods(p.data)
  }

  const set = (k, v) => setSettings(prev => ({ ...prev, [k]: v }))

  const saveSettings = async () => {
    setSaving(true); setMsg(null)
    const { id, created_at, ...data } = settings
    const { error } = id
      ? await supabase.from('studio_settings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
      : await supabase.from('studio_settings').insert(data)
    setMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Настройки сохранены' })
    if (!error) loadAll()
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  const uploadFile = async (file, field, setUploading) => {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `studio_${studioId}/${field}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('panda-media').upload(path, file, { upsert: true })
    if (upErr) { setMsg({ type: 'error', text: 'Ошибка загрузки: ' + upErr.message }); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('panda-media').getPublicUrl(path)
    set(field, publicUrl)
    setUploading(false)
  }

  // Категории
  const addCategory = async () => {
    if (!newCatName.trim()) return
    setCatSaving(true); setCatMsg(null)
    const { error } = await supabase.from('price_categories').insert({ name: newCatName.trim(), studio_id: studioId, sort_order: categories.length })
    if (error) setCatMsg({ type: 'error', text: error.message })
    else { setNewCatName(''); setCatMsg({ type: 'success', text: 'Категория добавлена' }); loadAll() }
    setCatSaving(false)
    setTimeout(() => setCatMsg(null), 2000)
  }

  const deleteCategory = async (id, name) => {
    if (!confirm(`Удалить категорию «${name}»? Абонементы с этой категорией останутся, но потеряют привязку.`)) return
    await supabase.from('price_categories').delete().eq('id', id)
    loadAll()
  }

  const renameCategory = async (id, newName) => {
    await supabase.from('price_categories').update({ name: newName }).eq('id', id)
    loadAll()
  }

  // Периоды
  const addPeriod = async () => {
    if (!newPeriodName.trim()) return
    setPeriodSaving(true); setPeriodMsg(null)
    const { error } = await supabase.from('subscription_periods').insert({ label: newPeriodName.trim(), studio_id: studioId, sort_order: periods.length })
    if (error) setPeriodMsg({ type: 'error', text: error.message })
    else { setNewPeriodName(''); setPeriodMsg({ type: 'success', text: 'Период добавлен' }); loadAll() }
    setPeriodSaving(false)
    setTimeout(() => setPeriodMsg(null), 2000)
  }

  const deletePeriod = async (id, label) => {
    if (!confirm(`Удалить период «${label}»?`)) return
    await supabase.from('subscription_periods').delete().eq('id', id)
    loadAll()
  }

  if (!settings) return <div style={{ padding: 40, color: T.muted }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>

      {/* Основная информация */}
      <Section title="Основная информация" icon="🏫">
        <div className="form-group">
          <label className="form-label">Название студии</label>
          <input className="form-input" value={settings.studio_name || ''} onChange={e => set('studio_name', e.target.value)} placeholder="Академия Панды" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Телефон</label>
            <input className="form-input" value={settings.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+7 xxx xxx xx xx" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={settings.email || ''} onChange={e => set('email', e.target.value)} placeholder="studio@example.com" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Адрес студии</label>
          <input className="form-input" value={settings.address || ''} onChange={e => set('address', e.target.value)} placeholder="г. Екатеринбург, ул. Онежская 4" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ИНН (опционально)</label>
            <input className="form-input" value={settings.inn || ''} onChange={e => set('inn', e.target.value)} placeholder="123456789012" />
          </div>
          <div className="form-group">
            <label className="form-label">Сайт</label>
            <input className="form-input" value={settings.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://acpanda.ru" />
          </div>
        </div>
        <Msg msg={msg} />
        <button className="btn btn-primary" onClick={saveSettings} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? 'Сохранение...' : '✅ Сохранить'}
        </button>
      </Section>

      {/* Логотип и печать */}
      <Section title="Логотип и печать" icon="🖼️">
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Логотип студии</label>
            {settings.logo_url && (
              <img src={settings.logo_url} alt="Логотип" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8, display: 'block', background: T.cream }} />
            )}
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && uploadFile(e.target.files[0], 'logo_url', setLogoUploading)} />
            <button className="btn btn-outline btn-sm" onClick={() => logoRef.current.click()} disabled={logoUploading}>
              {logoUploading ? 'Загрузка...' : settings.logo_url ? '🔄 Заменить' : '📁 Загрузить'}
            </button>
            {settings.logo_url && (
              <button className="btn btn-ghost btn-sm" onClick={() => set('logo_url', '')} style={{ color: '#e05a5a', marginLeft: 6 }}>✕ Удалить</button>
            )}
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Печать / штамп</label>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, lineHeight: 1.4 }}>
              PNG с прозрачным фоном для документов
            </div>
            {settings.stamp_url && (
              <img src={settings.stamp_url} alt="Печать" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8, display: 'block', background: T.cream }} />
            )}
            <input ref={stampRef} type="file" accept="image/png" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && uploadFile(e.target.files[0], 'stamp_url', setStampUploading)} />
            <button className="btn btn-outline btn-sm" onClick={() => stampRef.current.click()} disabled={stampUploading}>
              {stampUploading ? 'Загрузка...' : settings.stamp_url ? '🔄 Заменить' : '📁 Загрузить'}
            </button>
            {settings.stamp_url && (
              <button className="btn btn-ghost btn-sm" onClick={() => set('stamp_url', '')} style={{ color: '#e05a5a', marginLeft: 6 }}>✕ Удалить</button>
            )}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={saveSettings} disabled={saving} style={{ marginTop: 4 }}>
          {saving ? 'Сохранение...' : 'Сохранить изображения'}
        </button>
      </Section>

      {/* Категории абонементов */}
      <Section title="Категории абонементов" icon="🏷️">
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Категории позволяют разделить абонементы по типам направлений. Например: «Основная», «Лагерь», «Льготная».
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {categories.map(c => (
            <CategoryRow key={c.id} item={c} onRename={renameCategory} onDelete={deleteCategory} />
          ))}
          {!categories.length && <div style={{ fontSize: 13, color: T.muted }}>Категорий нет — все абонементы доступны для всех направлений</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" value={newCatName} onChange={e => setNewCatName(e.target.value)}
            placeholder="Название новой категории" style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addCategory()} />
          <button className="btn btn-primary" onClick={addCategory} disabled={catSaving || !newCatName.trim()}>
            {catSaving ? '...' : '+ Добавить'}
          </button>
        </div>
        <Msg msg={catMsg} />
      </Section>

      {/* Периоды абонементов */}
      <Section title="Периоды абонементов" icon="📅">
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Определяют срок действия абонемента. Например: «Месяц», «Пока не закончатся занятия», «Не ограничен».
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {periods.map(p => (
            <CategoryRow key={p.id} item={{ ...p, name: p.label }} onRename={(id, name) => supabase.from('subscription_periods').update({ label: name }).eq('id', id).then(loadAll)} onDelete={(id, name) => deletePeriod(id, name)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" value={newPeriodName} onChange={e => setNewPeriodName(e.target.value)}
            placeholder="Название нового периода" style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addPeriod()} />
          <button className="btn btn-primary" onClick={addPeriod} disabled={periodSaving || !newPeriodName.trim()}>
            {periodSaving ? '...' : '+ Добавить'}
          </button>
        </div>
        <Msg msg={periodMsg} />
      </Section>

    </div>
  )
}

function CategoryRow({ item, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)

  const save = () => {
    if (name.trim() && name !== item.name) onRename(item.id, name.trim())
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
      {editing ? (
        <input className="form-input" value={name} onChange={e => setName(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(item.name); setEditing(false) } }}
          autoFocus style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
      ) : (
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{item.name}</span>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)} title="Переименовать">✏️</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id, item.name)} style={{ color: '#e05a5a' }} title="Удалить">🗑️</button>
    </div>
  )
}
