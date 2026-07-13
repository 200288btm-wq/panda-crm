import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'
import BookingSettingsPage from './BookingSettingsPage'
import AddressesPage from './AddressesPage'
import StaffPage from './StaffPage'
import * as XLSX from 'xlsx'

const TABS = [
  { id: 'main',       label: 'Основное' },
  { id: 'addresses',  label: 'Адреса' },
  { id: 'staff',      label: 'Сотрудники' },
  { id: 'finance',    label: 'Финансы' },
  { id: 'statuses',   label: 'Статусы клиентов' },
  { id: 'data',       label: 'Данные' },
  { id: 'bot',        label: 'Telegram' },
  { id: 'booking',    label: 'Онлайн-запись' },
]

const Section = ({ title, icon, children }) => (
  <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 16, border: `1px solid ${T.border}` }}>
    {title && <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 16 }}>{icon} {title}</div>}
    {children}
  </div>
)

const Msg = ({ msg }) => msg ? (
  <div style={{ fontSize: 12, marginTop: 8, color: msg.type === 'error' ? '#e05a5a' : T.greenDark, fontWeight: 600 }}>
    {msg.type === 'error' ? '⚠️' : '✅'} {msg.text}
  </div>
) : null

export default function StudioSettingsPage({ studio, studioId, directions = [], staffList = [], reload, clientStatuses: initialStatuses = [], clients = [], payments = [], expenses = [], teachers = [], subscriptions = [] }) {
  const [tab, setTab] = useState('main')
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [stampUploading, setStampUploading] = useState(false)
  const logoRef = useRef()
  const stampRef = useRef()

  const [categories, setCategories] = useState([])
  const [catSaving, setCatSaving] = useState(false)
  const [catMsg, setCatMsg] = useState(null)
  const [newCatName, setNewCatName] = useState('')

  const [expenseTypes, setExpenseTypes] = useState([])
  const [expenseMsg, setExpenseMsg] = useState(null)
  const [newExpense, setNewExpense] = useState({ name: '', icon: '📦' })

  const [periods, setPeriods] = useState([])
  const [periodMsg, setPeriodMsg] = useState(null)
  const [newPeriod, setNewPeriod] = useState({ label: '', period_type: 'unlimited', duration_value: 1, duration_unit: 'months' })

  const [addresses, setAddresses] = useState([])

  // Статусы клиентов
  const [statuses, setStatuses] = useState([])
  const [newStatus, setNewStatus] = useState({ name: '', color: 'badge-gray' })
  const [statusMsg, setStatusMsg] = useState(null)
  const [addrMsg, setAddrMsg] = useState(null)
  const [showAddAddr, setShowAddAddr] = useState(false)
  const [editAddr, setEditAddr] = useState(null)
  const [addrForm, setAddrForm] = useState({ name: '', address: '' })

  useEffect(() => { if (studioId) { loadAll(); loadStatuses() } }, [studioId])

  const loadStatuses = async () => {
    const { data } = await supabase.from('client_statuses').select('*').eq('studio_id', studioId).order('sort_order')
    if (data) setStatuses(data)
  }

  const addStatus = async () => {
    if (!newStatus.name.trim()) { setStatusMsg({ type: 'error', text: 'Введите название' }); return }
    const { error } = await supabase.from('client_statuses').insert({
      name: newStatus.name.trim(), color: newStatus.color,
      studio_id: studioId, sort_order: statuses.length
    })
    if (error) setStatusMsg({ type: 'error', text: error.message })
    else { setNewStatus({ name: '', color: 'badge-gray' }); setStatusMsg({ type: 'success', text: 'Статус добавлен' }); loadStatuses() }
    setTimeout(() => setStatusMsg(null), 2000)
  }

  const deleteStatus = async (id, name) => {
    // Считаем клиентов с этим статусом
    const { count } = await supabase.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .eq('status', name)

    if (count > 0) {
      const ok = confirm(`У ${count} клиент${count === 1 ? 'а' : 'ов'} установлен статус «${name}».\n\nПосле удаления статус пропадёт из списка, но у клиентов останется. Рекомендуем сначала сменить статус этим клиентам.\n\nВсё равно удалить?`)
      if (!ok) return
    } else {
      if (!confirm(`Удалить статус «${name}»?`)) return
    }
    await supabase.from('client_statuses').delete().eq('id', id)
    loadStatuses()
  }

  const loadAll = async () => {
    const [s, c, p, et, addr] = await Promise.all([
      supabase.from('studio_settings').select('*').eq('studio_id', studioId).maybeSingle(),
      supabase.from('price_categories').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('subscription_periods').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('expense_types').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('addresses').select('*').eq('studio_id', studioId).order('id'),
    ])
    if (s.data) setSettings(s.data)
    else setSettings({ studio_id: studioId, studio_name: studio?.name || '', logo_url: '', address: '', inn: '', stamp_url: '', phone: '', email: '', website: '' })
    if (c.data) setCategories(c.data)
    if (p.data) setPeriods(p.data)
    if (et.data) setExpenseTypes(et.data)
    if (addr.data) setAddresses(addr.data)
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
    if (!confirm(`Удалить категорию «${name}»?`)) return
    await supabase.from('price_categories').delete().eq('id', id)
    loadAll()
  }

  const renameCategory = async (id, newName) => {
    await supabase.from('price_categories').update({ name: newName }).eq('id', id)
    loadAll()
  }

  // Периоды
  const addPeriod = async () => {
    if (!newPeriod.label.trim()) { setPeriodMsg({ type: 'error', text: 'Введите название' }); return }
    const { error } = await supabase.from('subscription_periods').insert({
      label: newPeriod.label.trim(),
      period_type: newPeriod.period_type,
      duration_value: newPeriod.period_type === 'fixed' ? +newPeriod.duration_value : null,
      duration_unit: newPeriod.period_type === 'fixed' ? newPeriod.duration_unit : null,
      studio_id: studioId, sort_order: periods.length,
    })
    if (error) setPeriodMsg({ type: 'error', text: error.message })
    else { setNewPeriod({ label: '', period_type: 'unlimited', duration_value: 1, duration_unit: 'months' }); setPeriodMsg({ type: 'success', text: 'Период добавлен' }); loadAll() }
    setTimeout(() => setPeriodMsg(null), 2000)
  }

  const deletePeriod = async (id, label) => {
    if (!confirm(`Удалить период «${label}»?`)) return
    await supabase.from('subscription_periods').delete().eq('id', id)
    loadAll()
  }

  const periodTypeLabel = (p) => {
    if (p.period_type === 'fixed' && p.duration_value && p.duration_unit) {
      const units = { days: 'дн.', months: 'мес.' }
      return `⏱ ${p.duration_value} ${units[p.duration_unit] || p.duration_unit}`
    }
    return '∞ без срока'
  }

  // Типы расходов
  const EXPENSE_ICONS = ['📦', '🏠', '🎨', '🚗', '💻', '👥', '📱', '🍕', '💡', '🔧', '📋', '💰', '🎓', '🏋️', '✈️']

  const addExpenseType = async () => {
    if (!newExpense.name.trim()) { setExpenseMsg({ type: 'error', text: 'Введите название' }); return }
    const { error } = await supabase.from('expense_types').insert({
      name: newExpense.name.trim(), icon: newExpense.icon || '📦',
      studio_id: studioId, sort_order: expenseTypes.length,
    })
    if (error) setExpenseMsg({ type: 'error', text: error.message })
    else { setNewExpense({ name: '', icon: '📦' }); setExpenseMsg({ type: 'success', text: 'Тип добавлен' }); loadAll() }
    setTimeout(() => setExpenseMsg(null), 2000)
  }

  const deleteExpenseType = async (id, name) => {
    if (!confirm(`Удалить тип расхода «${name}»?`)) return
    await supabase.from('expense_types').delete().eq('id', id)
    loadAll()
  }

  // Адреса
  const saveAddr = async () => {
    if (!addrForm.name.trim()) { setAddrMsg({ type: 'error', text: 'Введите название' }); return }
    if (editAddr) {
      const { error } = await supabase.from('addresses').update(addrForm).eq('id', editAddr.id)
      if (error) { setAddrMsg({ type: 'error', text: error.message }); return }
    } else {
      const { error } = await supabase.from('addresses').insert({ ...addrForm, studio_id: studioId })
      if (error) { setAddrMsg({ type: 'error', text: error.message }); return }
    }
    setShowAddAddr(false); setEditAddr(null); setAddrForm({ name: '', address: '' })
    setAddrMsg({ type: 'success', text: 'Сохранено' })
    loadAll()
    setTimeout(() => setAddrMsg(null), 2000)
  }

  const deleteAddr = async (id, name) => {
    if (!confirm(`Удалить адрес «${name}»?`)) return
    await supabase.from('addresses').delete().eq('id', id)
    loadAll()
  }

  if (!settings) return <div style={{ padding: 40, color: T.muted }}>Загрузка...</div>

  return (
    <div>
      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t.id ? T.green : T.cream,
            color: tab === t.id ? 'white' : T.ink,
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Основное ── */}
      {tab === 'main' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
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
            <label className="form-label">Юридический адрес</label>
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

        <Section title="Логотип и печать" icon="🖼️">
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Логотип студии</label>
              {settings.logo_url && (
                <img src={settings.logo_url} alt="Логотип" style={{ height: 60, maxWidth: 200, objectFit: 'contain', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8, display: 'block', background: T.cream, padding: 6 }} />
              )}
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" style={{ display: 'none' }}
                onChange={e => e.target.files[0] && uploadFile(e.target.files[0], 'logo_url', setLogoUploading)} />
              <button className="btn btn-outline btn-sm" onClick={() => logoRef.current.click()} disabled={logoUploading}>
                {logoUploading ? 'Загрузка...' : settings.logo_url ? '🔄 Заменить' : '📁 Загрузить'}
              </button>
              {settings.logo_url && (
                <button className="btn btn-ghost btn-sm" onClick={() => set('logo_url', '')} style={{ color: '#e05a5a', marginLeft: 6 }}>✕ Удалить</button>
              )}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>PNG, JPG или SVG. Рекомендуем без фона.</div>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Печать / штамп</label>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>PNG с прозрачным фоном для документов</div>
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
        </div>
      </>}

      {tab === 'addresses' && <AddressesPage addresses={addresses} reload={loadAll} isAdmin={true} studioId={studioId} />}

      {tab === 'staff' && <StaffPage staffList={staffList} reload={reload || loadAll} studioId={studioId} />}

      {/* ── Финансы ── */}
      {tab === 'finance' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Section title="Категории абонементов" icon="🏷️">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Позволяют разделить абонементы по типам направлений: «Основная», «Лагерь», «Льготная».
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {categories.map(c => (
              <CategoryRow key={c.id} item={c} onRename={renameCategory} onDelete={deleteCategory} />
            ))}
            {!categories.length && <div style={{ fontSize: 13, color: T.muted }}>Категорий нет</div>}
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

        <Section title="Периоды абонементов" icon="📅">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {periods.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{periodTypeLabel(p)}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => deletePeriod(p.id, p.label)} style={{ color: '#e05a5a' }}>🗑️</button>
              </div>
            ))}
          </div>
          <div style={{ background: T.greenBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.green}33` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 12 }}>+ Новый период</div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Название</label>
              <input className="form-input" value={newPeriod.label}
                onChange={e => setNewPeriod(p => ({ ...p, label: e.target.value }))}
                placeholder="Год, Квартал, 45 дней..." />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Тип периода</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['unlimited', '∞ Без срока'], ['fixed', '⏱ Фиксированный']].map(([val, label]) => (
                  <label key={val} onClick={() => setNewPeriod(p => ({ ...p, period_type: val }))} style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${newPeriod.period_type === val ? T.green : T.border}`,
                    background: newPeriod.period_type === val ? 'white' : T.cream,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: newPeriod.period_type === val ? T.greenDark : T.ink }}>{label}</div>
                  </label>
                ))}
              </div>
            </div>
            {newPeriod.period_type === 'fixed' && (
              <div className="form-row" style={{ marginBottom: 10 }}>
                <div className="form-group">
                  <label className="form-label">Количество</label>
                  <input className="form-input" type="number" min="1" value={newPeriod.duration_value}
                    onChange={e => setNewPeriod(p => ({ ...p, duration_value: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Единица</label>
                  <select className="form-input" value={newPeriod.duration_unit}
                    onChange={e => setNewPeriod(p => ({ ...p, duration_unit: e.target.value }))}>
                    <option value="days">Дней</option>
                    <option value="months">Месяцев</option>
                  </select>
                </div>
              </div>
            )}
            <button className="btn btn-primary" onClick={addPeriod} disabled={!newPeriod.label.trim()}>+ Добавить период</button>
            <Msg msg={periodMsg} />
          </div>
        </Section>

        <Section title="Типы расходов" icon="💸">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {expenseTypes.map(et => (
              <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 20 }}>{et.icon}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: T.ink }}>{et.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteExpenseType(et.id, et.name)} style={{ color: '#e05a5a' }}>🗑️</button>
              </div>
            ))}
            {!expenseTypes.length && <div style={{ fontSize: 13, color: T.muted }}>Типов расходов нет</div>}
          </div>
          <div style={{ background: T.greenBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.green}33` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 12 }}>+ Новый тип расхода</div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Название</label>
              <input className="form-input" value={newExpense.name}
                onChange={e => setNewExpense(p => ({ ...p, name: e.target.value }))}
                placeholder="Реклама, Оборудование..."
                onKeyDown={e => e.key === 'Enter' && addExpenseType()} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Иконка</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXPENSE_ICONS.map(icon => (
                  <button key={icon} onClick={() => setNewExpense(p => ({ ...p, icon }))}
                    style={{ width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer',
                      border: `2px solid ${newExpense.icon === icon ? T.green : T.border}`,
                      background: newExpense.icon === icon ? T.greenBg : 'white' }}>{icon}</button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={addExpenseType} disabled={!newExpense.name.trim()}>+ Добавить тип</button>
            <Msg msg={expenseMsg} />
          </div>
        </Section>
        </div>
      </>}

      {/* ── Статусы клиентов ── */}
      {tab === 'statuses' && <>
        <div style={{ maxWidth: 500 }}>
        <Section title="Статусы клиентов" icon="🏷️">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Статусы используются для сегментации клиентов. Вы можете добавить свои или удалить ненужные.
          </div>

          {/* Цвета */}
          {(() => {
            const COLOR_OPTIONS = [
              { value: 'badge-blue',   label: 'Синий',    color: '#3b82f6' },
              { value: 'badge-green',  label: 'Зелёный',  color: '#22c55e' },
              { value: 'badge-orange', label: 'Оранжевый',color: '#f97316' },
              { value: 'badge-red',    label: 'Красный',  color: '#ef4444' },
              { value: 'badge-gray',   label: 'Серый',    color: '#9ca3af' },
              { value: 'badge-purple', label: 'Фиолетовый',color:'#a855f7' },
            ]
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {statuses.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <span className={`badge ${s.color}`}>{s.name}</span>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteStatus(s.id, s.name)} style={{ color: '#e05a5a' }}>🗑️</button>
                    </div>
                  ))}
                  {!statuses.length && <div style={{ fontSize: 13, color: T.muted }}>Статусов нет</div>}
                </div>

                <div style={{ background: T.greenBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.green}33` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 12 }}>+ Новый статус</div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Название</label>
                    <input className="form-input" value={newStatus.name}
                      onChange={e => setNewStatus(s => ({ ...s, name: e.target.value }))}
                      placeholder="Например: VIP, На паузе..."
                      onKeyDown={e => e.key === 'Enter' && addStatus()} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Цвет</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {COLOR_OPTIONS.map(c => (
                        <button key={c.value} onClick={() => setNewStatus(s => ({ ...s, color: c.value }))}
                          style={{ padding: '5px 12px', borderRadius: 8, border: `2px solid ${newStatus.color === c.value ? c.color : T.border}`,
                            background: newStatus.color === c.value ? c.color + '22' : 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: c.color }}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <span className={`badge ${newStatus.color}`}>{newStatus.name || 'Предпросмотр'}</span>
                  </div>
                  <button className="btn btn-primary" onClick={addStatus} disabled={!newStatus.name.trim()}>+ Добавить статус</button>
                  <Msg msg={statusMsg} />
                </div>
              </>
            )
          })()}
        </Section>
        </div>
      </>}

      {/* ── Данные ── */}
      {tab === 'data' && <DataTab
        studioId={studioId}
        clients={clients}
        payments={payments}
        expenses={expenses}
        teachers={teachers}
        directions={directions}
        subscriptions={subscriptions}
        reload={reload}
        T={T}
      />}

      {/* ── Telegram ── */}
      {tab === 'bot' && <>
        <div style={{ maxWidth: 600 }}>
        <Section title="Telegram бот" icon="🤖">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
            Создайте бота через <a href="https://t.me/BotFather" target="_blank" style={{ color: T.green }}>@BotFather</a>, скопируйте токен и вставьте ниже. Клиенты смогут получать информацию о занятиях и уведомления.
          </div>
          <div className="form-group">
            <label className="form-label">Токен бота</label>
            <input className="form-input" value={settings.bot_token || ''} onChange={e => set('bot_token', e.target.value)} placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Получить у @BotFather → /newbot → скопировать токен</div>
          </div>
          <div className="form-group">
            <label className="form-label">Username бота</label>
            <input className="form-input" value={settings.bot_username || ''} onChange={e => set('bot_username', e.target.value)} placeholder="@MyStudioBot" />
          </div>
          {settings.bot_username && (
            <div style={{ background: T.greenBg, borderRadius: 12, padding: '12px 16px', fontSize: 13, color: T.greenDark, marginTop: 8 }}>
              🤖 Бот: <a href={`https://t.me/${settings.bot_username.replace('@','')}`} target="_blank" style={{ color: T.green, fontWeight: 700 }}>{settings.bot_username}</a>
            </div>
          )}
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving} style={{ marginTop: 12 }}>
            {saving ? 'Сохранение...' : '✅ Сохранить'}
          </button>
          <Msg msg={msg} />
        </Section>
        </div>
      </>}

      {/* ── Онлайн-запись ── */}
      {tab === 'booking' && <div style={{ maxWidth: 700 }}><BookingSettingsPage directions={directions} /></div>}

    </div>
  </div>
  )
}

function CategoryRow({ item, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const save = () => { if (name.trim() && name !== item.name) onRename(item.id, name.trim()); setEditing(false) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
      {editing ? (
        <input className="form-input" value={name} onChange={e => setName(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(item.name); setEditing(false) } }}
          autoFocus style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
      ) : (
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{item.name}</span>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>✏️</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id, item.name)} style={{ color: '#e05a5a' }}>🗑️</button>
    </div>
  )
}

function DataTab({ studioId, clients, payments, expenses, teachers, directions, subscriptions, reload, T }) {
  const [importing, setImporting] = useState(null) // 'clients' | 'payments' | etc
  const [importMsg, setImportMsg] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef()
  const [currentImportType, setCurrentImportType] = useState(null)

  const showMsg = (type, text) => {
    setImportMsg({ type, text })
    setTimeout(() => setImportMsg(null), 4000)
  }

  // ── ЭКСПОРТ ──────────────────────────────────────────────
  const exportSheet = (name, data, columns) => {
    const ws = XLSX.utils.json_to_sheet(data.map(row =>
      Object.fromEntries(columns.map(([key, label]) => [label, row[key] ?? '']))
    ))
    // Ширина колонок
    ws['!cols'] = columns.map(() => ({ wch: 20 }))
    return { name, ws }
  }

  const doExport = () => {
    const wb = XLSX.utils.book_new()

    // Клиенты
    const clientsData = clients.map(c => ({
      child_name: c.child_name || '',
      adult_name: c.adult_name || '',
      phone: (c.contacts || []).find(x => x.type === 'Телефон')?.val || '',
      email: (c.contacts || []).find(x => x.type === 'Email')?.val || '',
      status: c.status || '',
      directions: (c.direction_ids || []).map(id => directions.find(d => d.id === id)?.name).filter(Boolean).join(', '),
      paid_lessons: c.paid_lessons || 0,
      visited_lessons: c.visited_lessons || 0,
      discount: c.discount || 0,
      birthday: c.birthday || '',
      source: c.source || '',
      comment: c.comment || '',
      start_date: c.start_date || '',
    }))
    const { ws: wsClients } = exportSheet('Клиенты', clientsData, [
      ['child_name', 'Имя ребёнка'], ['adult_name', 'Имя родителя'],
      ['phone', 'Телефон'], ['email', 'Email'], ['status', 'Статус'],
      ['directions', 'Направления'], ['paid_lessons', 'Оплачено занятий'],
      ['visited_lessons', 'Посещено занятий'], ['discount', 'Скидка %'],
      ['birthday', 'Дата рождения'], ['source', 'Источник'],
      ['comment', 'Комментарий'], ['start_date', 'Дата начала'],
    ])
    XLSX.utils.book_append_sheet(wb, wsClients, 'Клиенты')

    // Оплаты
    const paymentsData = payments.map(p => ({
      date: p.payment_date || '',
      child_name: clients.find(c => c.id === p.client_id)?.child_name || '',
      type: p.payment_type || '',
      amount: p.amount || 0,
      lessons: p.lessons_count || 0,
      direction: directions.find(d => d.id === p.direction_id)?.name || '',
      comment: p.comment || '',
    }))
    const { ws: wsPayments } = exportSheet('Оплаты', paymentsData, [
      ['date', 'Дата'], ['child_name', 'Клиент'], ['type', 'Тип'],
      ['amount', 'Сумма'], ['lessons', 'Занятий'], ['direction', 'Направление'], ['comment', 'Комментарий'],
    ])
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Оплаты')

    // Расходы
    const expensesData = expenses.map(e => ({
      date: e.expense_date || '',
      type: e.expense_type || '',
      category: e.category || '',
      amount: e.amount || 0,
      direction: directions.find(d => d.id === e.direction_id)?.name || 'Общий',
      comment: e.comment || '',
    }))
    const { ws: wsExpenses } = exportSheet('Расходы', expensesData, [
      ['date', 'Дата'], ['type', 'Вид'], ['category', 'Категория'],
      ['amount', 'Сумма'], ['direction', 'Направление'], ['comment', 'Комментарий'],
    ])
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Расходы')

    // Педагоги
    const teachersData = teachers.map(t => ({
      name: t.name || '',
      phone: t.phone || '',
      email: t.email || '',
      status: t.status || '',
      rate: t.rate || 0,
      hired: t.hired || '',
    }))
    const { ws: wsTeachers } = exportSheet('Педагоги', teachersData, [
      ['name', 'ФИО'], ['phone', 'Телефон'], ['email', 'Email'],
      ['status', 'Статус'], ['rate', 'Ставка'], ['hired', 'Дата приёма'],
    ])
    XLSX.utils.book_append_sheet(wb, wsTeachers, 'Педагоги')

    // Направления
    const directionsData = directions.map(d => ({
      name: d.name || '',
      teacher: d.teacher_name || '',
      schedule: d.schedule || '',
      cost_abo: d.cost_abo || 0,
      cost_single: d.cost_single || 0,
      max_capacity: d.max_capacity || 0,
    }))
    const { ws: wsDirections } = exportSheet('Направления', directionsData, [
      ['name', 'Название'], ['teacher', 'Педагог'], ['schedule', 'Расписание'],
      ['cost_abo', 'Цена абонемент'], ['cost_single', 'Цена разовое'], ['max_capacity', 'Вместимость'],
    ])
    XLSX.utils.book_append_sheet(wb, wsDirections, 'Направления')

    // Абонементы
    const subsData = subscriptions.map(s => ({
      name: s.name || '',
      price: s.price || 0,
      lessons_count: s.lessons_count || 0,
      is_active: s.is_active ? 'Да' : 'Нет',
    }))
    const { ws: wsSubs } = exportSheet('Абонементы', subsData, [
      ['name', 'Название'], ['price', 'Цена'], ['lessons_count', 'Занятий'], ['is_active', 'Активен'],
    ])
    XLSX.utils.book_append_sheet(wb, wsSubs, 'Абонементы')

    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `учтено_экспорт_${date}.xlsx`)
  }

  // ── ШАБЛОНЫ ──────────────────────────────────────────────
  const TEMPLATES = {
    clients: {
      label: 'Клиенты',
      columns: ['Имя ребёнка*', 'Имя родителя', 'Телефон*', 'Email', 'Статус', 'Оплачено занятий', 'Посещено занятий', 'Скидка %', 'Дата рождения (ГГГГ-ММ-ДД)', 'Источник', 'Комментарий'],
      example: ['Иван Петров', 'Мария Петрова', '+79001234567', '', 'Активен', '8', '4', '0', '2018-05-12', 'ВКонтакте', ''],
    },
    payments: {
      label: 'Оплаты',
      columns: ['Имя ребёнка*', 'Дата (ГГГГ-ММ-ДД)*', 'Тип (Абонемент/Разовое/Пробное)', 'Сумма*', 'Занятий', 'Комментарий'],
      example: ['Иван Петров', '2026-06-01', 'Абонемент', '6000', '8', ''],
    },
    teachers: {
      label: 'Педагоги',
      columns: ['ФИО*', 'Телефон', 'Email', 'Статус', 'Ставка за занятие', 'Дата приёма (ГГГГ-ММ-ДД)'],
      example: ['Коноваленко Ольга', '+79001234567', '', 'Активен', '600', '2024-01-01'],
    },
    directions: {
      label: 'Направления',
      columns: ['Название*', 'Педагог', 'Расписание', 'Цена абонемент', 'Цена разовое', 'Вместимость'],
      example: ['Рисование', 'Коноваленко Ольга', 'Пн/Ср/Пт 10:00', '5000', '800', '10'],
    },
    expenses: {
      label: 'Расходы',
      columns: ['Дата (ГГГГ-ММ-ДД)*', 'Вид расхода*', 'Категория (Периодичный/Разовый)', 'Сумма*', 'Комментарий'],
      example: ['2026-06-01', 'Аренда', 'Периодичный', '30000', ''],
    },
    subscriptions: {
      label: 'Абонементы',
      columns: ['Название*', 'Цена*', 'Количество занятий*'],
      example: ['8 занятий', '6000', '8'],
    },
  }

  const downloadTemplate = (type) => {
    const tmpl = TEMPLATES[type]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([tmpl.columns, tmpl.example])
    // Стиль заголовков — жирный
    ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, tmpl.label)
    XLSX.writeFile(wb, `шаблон_${type}.xlsx`)
  }

  // ── ИМПОРТ ───────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    const type = currentImportType
    setImporting(type)
    setImportResult(null)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rows.length) { showMsg('error', 'Файл пустой'); setImporting(null); return }

      let inserted = 0, errors = []

      if (type === 'clients') {
        for (const row of rows) {
          const name = String(row['Имя ребёнка*'] || row['Имя ребёнка'] || '').trim()
          const phone = String(row['Телефон*'] || row['Телефон'] || '').trim()
          if (!name) { errors.push(`Пропущено имя ребёнка`); continue }
          const { error } = await supabase.from('clients').insert({
            studio_id: studioId,
            child_name: name,
            adult_name: String(row['Имя родителя'] || '').trim() || null,
            contacts: phone ? [{ type: 'Телефон', val: phone }] : [],
            status: String(row['Статус'] || 'Новый').trim(),
            paid_lessons: +row['Оплачено занятий'] || 0,
            visited_lessons: +row['Посещено занятий'] || 0,
            discount: +row['Скидка %'] || 0,
            birthday: String(row['Дата рождения (ГГГГ-ММ-ДД)'] || '').trim() || null,
            source: String(row['Источник'] || '').trim() || null,
            comment: String(row['Комментарий'] || '').trim() || null,
          })
          if (error) errors.push(`${name}: ${error.message}`)
          else inserted++
        }
      }

      if (type === 'payments') {
        // Получаем клиентов для поиска по имени
        const { data: cls } = await supabase.from('clients').select('id, child_name').eq('studio_id', studioId)
        for (const row of rows) {
          const clientName = String(row['Имя ребёнка*'] || row['Имя ребёнка'] || '').trim()
          const date = String(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата'] || '').trim()
          const amount = +row['Сумма*'] || +row['Сумма'] || 0
          if (!clientName || !date) { errors.push(`Пропущено имя или дата`); continue }
          const client = cls?.find(c => c.child_name === clientName)
          if (!client) { errors.push(`Клиент не найден: ${clientName}`); continue }
          const { error } = await supabase.from('payments').insert({
            studio_id: studioId,
            client_id: client.id,
            payment_date: date,
            payment_type: String(row['Тип (Абонемент/Разовое/Пробное)'] || 'Абонемент').trim(),
            amount,
            lessons_count: +row['Занятий'] || 0,
            comment: String(row['Комментарий'] || '').trim() || null,
          })
          if (error) errors.push(`${clientName}: ${error.message}`)
          else inserted++
        }
      }

      if (type === 'teachers') {
        for (const row of rows) {
          const name = String(row['ФИО*'] || row['ФИО'] || '').trim()
          if (!name) { errors.push('Пропущено ФИО'); continue }
          const { error } = await supabase.from('teachers').insert({
            studio_id: studioId,
            name,
            phone: String(row['Телефон'] || '').trim() || null,
            email: String(row['Email'] || '').trim() || null,
            status: String(row['Статус'] || 'Активен').trim(),
            rate: +row['Ставка за занятие'] || 0,
            hired: String(row['Дата приёма (ГГГГ-ММ-ДД)'] || '').trim() || null,
          })
          if (error) errors.push(`${name}: ${error.message}`)
          else inserted++
        }
      }

      if (type === 'directions') {
        for (const row of rows) {
          const name = String(row['Название*'] || row['Название'] || '').trim()
          if (!name) { errors.push('Пропущено название'); continue }
          const { error } = await supabase.from('directions').insert({
            studio_id: studioId,
            name,
            teacher_name: String(row['Педагог'] || '').trim() || null,
            schedule: String(row['Расписание'] || '').trim() || null,
            cost_abo: +row['Цена абонемент'] || 0,
            cost_single: +row['Цена разовое'] || 0,
            max_capacity: +row['Вместимость'] || 0,
          })
          if (error) errors.push(`${name}: ${error.message}`)
          else inserted++
        }
      }

      if (type === 'expenses') {
        for (const row of rows) {
          const date = String(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата'] || '').trim()
          const expType = String(row['Вид расхода*'] || row['Вид расхода'] || '').trim()
          const amount = +row['Сумма*'] || +row['Сумма'] || 0
          if (!date || !expType) { errors.push('Пропущена дата или вид расхода'); continue }
          const { error } = await supabase.from('expenses').insert({
            studio_id: studioId,
            expense_date: date,
            expense_type: expType,
            category: String(row['Категория (Периодичный/Разовый)'] || 'Разовый').trim(),
            amount,
            comment: String(row['Комментарий'] || '').trim() || null,
          })
          if (error) errors.push(`${date} ${expType}: ${error.message}`)
          else inserted++
        }
      }

      if (type === 'subscriptions') {
        for (const row of rows) {
          const name = String(row['Название*'] || row['Название'] || '').trim()
          const price = +row['Цена*'] || +row['Цена'] || 0
          const lessons = +row['Количество занятий*'] || +row['Количество занятий'] || 0
          if (!name) { errors.push('Пропущено название'); continue }
          const { error } = await supabase.from('subscriptions').insert({
            studio_id: studioId,
            name, price, lessons_count: lessons, is_active: true,
          })
          if (error) errors.push(`${name}: ${error.message}`)
          else inserted++
        }
      }

      setImportResult({ inserted, errors })
      if (inserted > 0 && reload) reload()
    } catch (e) {
      showMsg('error', 'Ошибка чтения файла: ' + e.message)
    }
    setImporting(null)
  }

  const startImport = (type) => {
    setCurrentImportType(type)
    setImportResult(null)
    importRef.current.click()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />

      {/* Экспорт */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 6 }}>📤 Экспорт данных</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Выгрузка всех данных студии в один Excel файл с несколькими листами.
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
          Будет выгружено: {clients.length} клиентов · {payments.length} оплат · {expenses.length} расходов · {teachers.length} педагогов · {directions.length} направлений · {subscriptions.length} абонементов
        </div>
        <button className="btn btn-primary" onClick={doExport}>
          📥 Скачать Excel
        </button>
      </div>

      {/* Импорт */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 6 }}>📥 Импорт данных</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Скачайте шаблон, заполните данные и загрузите обратно.
        </div>

        {importMsg && (
          <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8,
            background: importMsg.type === 'error' ? '#fde8e8' : '#e8f4ed',
            color: importMsg.type === 'error' ? '#e05a5a' : T.greenDark }}>
            {importMsg.text}
          </div>
        )}

        {importResult && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: T.cream, border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.greenDark, marginBottom: 4 }}>
              ✅ Импортировано: {importResult.inserted} записей
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ fontSize: 12, color: '#e05a5a', marginTop: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Ошибки ({importResult.errors.length}):</div>
                {importResult.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                {importResult.errors.length > 5 && <div>...и ещё {importResult.errors.length - 5}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(TEMPLATES).map(([type, tmpl]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: T.ink }}>{tmpl.label}</div>
              <button className="btn btn-outline btn-sm" onClick={() => downloadTemplate(type)}>
                📋 Шаблон
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => startImport(type)} disabled={importing === type}>
                {importing === type ? '⏳...' : '⬆️ Загрузить'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
