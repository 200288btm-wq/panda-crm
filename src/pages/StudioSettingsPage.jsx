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
  { id: 'plan',       label: '⭐ Тариф' },
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
  const [tab, setTab] = useState(() => localStorage.getItem('settingsTab') || 'main')

  const switchTab = (id) => {
    setTab(id)
    localStorage.setItem('settingsTab', id)
  }
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
  const [planInfo, setPlanInfo] = useState(null)
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
    const [s, c, p, et, addr, plan] = await Promise.all([
      supabase.from('studio_settings').select('*').eq('studio_id', studioId).maybeSingle(),
      supabase.from('price_categories').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('subscription_periods').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('expense_types').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('addresses').select('*').eq('studio_id', studioId).order('id'),
      supabase.from('studio_subscriptions').select('*').eq('studio_id', studioId).maybeSingle(),
    ])
    if (s.data) setSettings(s.data)
    else setSettings({ studio_id: studioId, studio_name: studio?.name || '', logo_url: '', address: '', inn: '', stamp_url: '', phone: '', email: '', website: '' })
    if (c.data) setCategories(c.data)
    if (p.data) setPeriods(p.data)
    if (et.data) setExpenseTypes(et.data)
    if (addr.data) setAddresses(addr.data)
    if (plan.data) setPlanInfo(plan.data)
    else setPlanInfo({ plan: 'free', expires_at: null })
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
          <button key={t.id} onClick={() => switchTab(t.id)} style={{
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
      {tab === 'statuses' && <StatusesTab
        statuses={statuses}
        newStatus={newStatus}
        setNewStatus={setNewStatus}
        statusMsg={statusMsg}
        addStatus={addStatus}
        deleteStatus={deleteStatus}
        T={T}
      />}

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

      {/* ── Тариф ── */}
      {tab === 'plan' && <PlanTab planInfo={planInfo} T={T} />}

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
  )
}

function PlanTab({ planInfo, T }) {
  const PLANS = {
    free:  { label: 'Free',  color: '#9ca3af', desc: 'До 10 клиентов', price: 'Бесплатно', features: ['До 10 клиентов', 'Базовый учёт', 'Telegram-бот'] },
    start: { label: 'Start', color: '#3b82f6', desc: 'До 100 клиентов', price: '690 ₽/мес', features: ['До 100 клиентов', 'Все функции', 'Экспорт данных', 'Онлайн-запись'] },
    pro:   { label: 'Pro',   color: '#a855f7', desc: 'Без ограничений', price: '1 490 ₽/мес', features: ['Без ограничений', 'Несколько студий', 'Приоритетная поддержка', 'Аналитика'] },
  }

  const current = planInfo?.plan || 'free'
  const plan = PLANS[current]
  const expires = planInfo?.expires_at

  return (
    <div style={{ maxWidth: 500 }}>
      {/* Текущий тариф */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: `2px solid ${plan.color}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ background: plan.color + '22', borderRadius: 10, padding: '6px 14px', fontWeight: 800, fontSize: 18, color: plan.color, fontFamily: 'Nunito,sans-serif' }}>
            {plan.label}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Текущий тариф</div>
            <div style={{ fontSize: 13, color: T.muted }}>{plan.desc} · {plan.price}</div>
          </div>
        </div>

        {expires && (
          <div style={{ fontSize: 13, color: new Date(expires) < new Date() ? '#e05a5a' : T.greenDark, fontWeight: 600, marginBottom: 12 }}>
            {new Date(expires) < new Date() ? '⚠️ Тариф истёк ' : '✅ Активен до '}{new Date(expires).toLocaleDateString('ru-RU')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {plan.features.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.ink }}>
              <span style={{ color: plan.color, fontWeight: 700 }}>✓</span> {f}
            </div>
          ))}
        </div>

        <a href="https://uchteno-landing.vercel.app/#faq" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 12, background: plan.color, color: 'white', fontWeight: 700, fontSize: 14, textDecoration: 'none', fontFamily: 'Nunito,sans-serif' }}>
          {current === 'free' ? '🚀 Улучшить тариф' : '🔄 Изменить тариф'}
        </a>
      </div>

      {/* Все тарифы */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(PLANS).filter(([key]) => key !== current).map(([key, p]) => (
          <div key={key} style={{ background: 'white', borderRadius: 14, padding: '14px 18px', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: p.color + '22', borderRadius: 8, padding: '4px 10px', fontWeight: 800, fontSize: 14, color: p.color, fontFamily: 'Nunito,sans-serif' }}>{p.label}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.ink }}>{p.desc}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{p.price}</div>
              </div>
            </div>
            <a href="https://uchteno-landing.vercel.app/#faq" target="_blank" rel="noopener noreferrer"
              style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${p.color}`, color: p.color, fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Перейти →
            </a>
          </div>
        ))}
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

function StatusesTab({ statuses, newStatus, setNewStatus, statusMsg, addStatus, deleteStatus, T }) {
  const COLOR_OPTIONS = [
    { value: 'badge-blue',   label: 'Синий',      color: '#3b82f6' },
    { value: 'badge-green',  label: 'Зелёный',    color: '#22c55e' },
    { value: 'badge-orange', label: 'Оранжевый',  color: '#f97316' },
    { value: 'badge-red',    label: 'Красный',    color: '#ef4444' },
    { value: 'badge-gray',   label: 'Серый',      color: '#9ca3af' },
    { value: 'badge-purple', label: 'Фиолетовый', color: '#a855f7' },
  ]
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 6 }}>🏷️ Статусы клиентов</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Статусы используются для сегментации клиентов. Вы можете добавить свои или удалить ненужные.
        </div>
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
                  style={{ padding: '5px 12px', borderRadius: 8,
                    border: `2px solid ${newStatus.color === c.value ? c.color : T.border}`,
                    background: newStatus.color === c.value ? c.color + '22' : 'white',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: c.color }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${newStatus.color}`}>{newStatus.name || 'Предпросмотр'}</span>
          </div>
          <button className="btn btn-primary" onClick={addStatus} disabled={!newStatus.name.trim()}>+ Добавить статус</button>
          {statusMsg && (
            <div style={{ fontSize: 12, marginTop: 8, color: statusMsg.type === 'error' ? '#e05a5a' : T.greenDark }}>
              {statusMsg.type === 'error' ? '⚠️' : '✅'} {statusMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DataTab({ studioId, clients, payments, expenses, teachers, directions, subscriptions, reload, T }) {
  const [importing, setImporting] = useState(null)
  const [importMsg, setImportMsg] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef()
  const [currentImportType, setCurrentImportType] = useState(null)
  // Диалог выбора пустой/с данными
  const [dialog, setDialog] = useState(null) // { type, onEmpty, onWithData, count }

  const showMsg = (type, text) => {
    setImportMsg({ type, text })
    setTimeout(() => setImportMsg(null), 4000)
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
      columns: ['ФИО*', 'Телефон', 'Статус', 'Тип оплаты (За занятие/Оклад)', 'Оклад (если оклад), ₽', 'Дата приёма (ГГГГ-ММ-ДД)*'],
      example: ['Коноваленко Ольга', '+79001234567', 'Активен', 'За занятие', '', '2024-01-01'],
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

  
  // ── ЭКСПОРТ ──────────────────────────────────────────────
  const exportSheet = (name, data, columns) => {
    const ws = XLSX.utils.json_to_sheet(data.map(row =>
      Object.fromEntries(columns.map(([key, label]) => [label, row[key] ?? '']))
    ))
    // Ширина колонок
    ws['!cols'] = columns.map(() => ({ wch: 20 }))
    return { name, ws }
  }

  const doDownloadTemplate = async (type, withData) => {
    const tmpl = TEMPLATES[type]
    const wb = XLSX.utils.book_new()
    if (withData) {
      let rows = [tmpl.columns]
      if (type === 'clients') rows = rows.concat(clients.map(c => [c.child_name||'',c.adult_name||'',(c.contacts||[]).find(x=>x.type==='Телефон')?.val||'',(c.contacts||[]).find(x=>x.type==='Email')?.val||'',c.status||'',c.paid_lessons||0,c.visited_lessons||0,c.discount||0,c.birthday||'',c.source||'',c.comment||'']))
      else if (type === 'payments') rows = rows.concat(payments.map(p => [clients.find(c=>c.id===p.client_id)?.child_name||'',p.payment_date||'',p.payment_type||'',p.amount||0,p.lessons_count||0,p.comment||'']))
      else if (type === 'teachers') {
        rows = rows.concat(teachers.map(t => [t.name||'',t.phone||'',t.status||'',t.salary_type==='salary'?'Оклад':'За занятие',t.salary_type==='salary'?t.salary_amount||0:'',t.hired||'']))
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
        XLSX.utils.book_append_sheet(wb, ws, 'Педагоги')
        // Загружаем ставки по направлениям
        const { data: rates } = await supabase.from('teacher_rates').select('*').eq('studio_id', studioId)
        const ratesRows = [['ФИО педагога', 'Направление', 'Тип', 'Ставка фикс, ₽', 'Неполная группа, ₽', 'Полная группа, ₽', 'Порог (чел.)']]
        ;(rates || []).forEach(r => {
          const teacher = teachers.find(t => t.id === r.teacher_id)
          const direction = directions.find(d => d.id === r.direction_id)
          ratesRows.push([
            teacher?.name || '',
            direction?.name || '',
            r.rate_type === 'per_lesson' ? 'Фиксированная' : 'По кол-ву учеников',
            r.rate_type === 'per_lesson' ? r.rate || 0 : '',
            r.rate_type === 'by_students' ? r.rate_part || 0 : '',
            r.rate_type === 'by_students' ? r.rate_full || 0 : '',
            r.rate_type === 'by_students' ? r.min_students || 0 : '',
          ])
        })
        const wsRates = XLSX.utils.aoa_to_sheet(ratesRows)
        wsRates['!cols'] = Array(7).fill({ wch: 22 })
        XLSX.utils.book_append_sheet(wb, wsRates, 'Ставки педагогов')
        XLSX.writeFile(wb, 'педагоги_данные.xlsx')
        return
      }
      else if (type === 'directions') rows = rows.concat(directions.map(d => [d.name||'',d.teacher_name||'',d.schedule||'',d.cost_abo||0,d.cost_single||0,d.max_capacity||0]))
      else if (type === 'expenses') rows = rows.concat(expenses.map(e => [e.expense_date||'',e.expense_type||'',e.category||'',e.amount||0,e.comment||'']))
      else if (type === 'subscriptions') rows = rows.concat(subscriptions.map(s => [s.name||'',s.price||0,s.lessons_count||0]))
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(wb, ws, tmpl.label)
      XLSX.writeFile(wb, `${type}_данные.xlsx`)
    } else {
      const ws = XLSX.utils.aoa_to_sheet([tmpl.columns, tmpl.example])
      ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(wb, ws, tmpl.label)
      // Для педагогов добавляем пустой лист ставок
      if (type === 'teachers') {
        const wsRates = XLSX.utils.aoa_to_sheet([['ФИО педагога', 'Направление', 'Тип (за занятие/по кол-ву учеников)', 'Ставка фикс, ₽', 'Неполная группа, ₽', 'Полная группа, ₽', 'Порог (чел.)'], ['⚠️ Подсказка: если тип За занятие — заполните только Ставка фикс. Если По кол-ву учеников — заполните Неполная, Полная и Порог.', '', '', '', '', '', ''], ['Коноваленко Ольга', 'Рисование', 'За занятие', 600, '', '', ''], ['Петрова Анна', 'Рисование', 'По кол-ву учеников', '', 400, 600, 5]])
        wsRates['!cols'] = Array(7).fill({ wch: 22 })
        XLSX.utils.book_append_sheet(wb, wsRates, 'Ставки педагогов')
      }
      XLSX.writeFile(wb, `шаблон_${type}.xlsx`)
    }
  }

  const COUNTS = { clients: clients.length, payments: payments.length, teachers: teachers.length, directions: directions.length, expenses: expenses.length, subscriptions: subscriptions.length }

  const downloadTemplate = (type) => {
    if (COUNTS[type] > 0) {
      setDialog({
        title: 'Скачать шаблон',
        text: `В CRM уже есть ${COUNTS[type]} записей. Скачать с текущими данными или пустой шаблон?`,
        onWithData: () => { setDialog(null); doDownloadTemplate(type, true) },
        onEmpty: () => { setDialog(null); doDownloadTemplate(type, false) },
      })
    } else {
      doDownloadTemplate(type, false)
    }
  }

  const downloadAllTemplates = () => {
    const hasAny = Object.values(COUNTS).some(c => c > 0)
    if (hasAny) {
      setDialog({
        title: 'Скачать все шаблоны',
        text: 'В CRM уже есть данные. Скачать все шаблоны с текущими данными или пустые?',
        onWithData: () => {
          setDialog(null)
          const wb2 = XLSX.utils.book_new()
          // Загружаем ставки асинхронно
          supabase.from('teacher_rates').select('*').eq('studio_id', studioId).then(({ data: rates }) => {
            Object.entries(TEMPLATES).forEach(([type, tmpl]) => {
              let rows = [tmpl.columns]
              if (type === 'clients') rows = rows.concat(clients.map(c => [c.child_name||'',c.adult_name||'',(c.contacts||[]).find(x=>x.type==='Телефон')?.val||'',(c.contacts||[]).find(x=>x.type==='Email')?.val||'',c.status||'',c.paid_lessons||0,c.visited_lessons||0,c.discount||0,c.birthday||'',c.source||'',c.comment||'']))
              else if (type === 'payments') rows = rows.concat(payments.map(p => [clients.find(c=>c.id===p.client_id)?.child_name||'',p.payment_date||'',p.payment_type||'',p.amount||0,p.lessons_count||0,p.comment||'']))
              else if (type === 'teachers') rows = rows.concat(teachers.map(t => [t.name||'',t.phone||'',t.status||'',t.salary_type==='salary'?'Оклад':'За занятие',t.salary_type==='salary'?t.salary_amount||0:'',t.hired||'']))
              else if (type === 'directions') rows = rows.concat(directions.map(d => [d.name||'',d.teacher_name||'',d.schedule||'',d.cost_abo||0,d.cost_single||0,d.max_capacity||0]))
              else if (type === 'expenses') rows = rows.concat(expenses.map(e => [e.expense_date||'',e.expense_type||'',e.category||'',e.amount||0,e.comment||'']))
              else if (type === 'subscriptions') rows = rows.concat(subscriptions.map(s => [s.name||'',s.price||0,s.lessons_count||0]))
              const ws = XLSX.utils.aoa_to_sheet(rows)
              ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
              XLSX.utils.book_append_sheet(wb2, ws, tmpl.label)
            })
            // Добавляем лист ставок педагогов
            const ratesRows = [['ФИО педагога', 'Направление', 'Тип (за занятие/по кол-ву учеников)', 'Ставка фикс, ₽', 'Неполная группа, ₽', 'Полная группа, ₽', 'Порог (чел.)']]
            ;(rates || []).forEach(r => {
              const teacher = teachers.find(t => t.id === r.teacher_id)
              const direction = directions.find(d => d.id === r.direction_id)
              ratesRows.push([teacher?.name||'', direction?.name||'', r.rate_type==='per_lesson'?'За занятие':'По кол-ву учеников', r.rate_type==='per_lesson'?r.rate||0:'', r.rate_type==='by_students'?r.rate_part||0:'', r.rate_type==='by_students'?r.rate_full||0:'', r.rate_type==='by_students'?r.min_students||0:''])
            })
            const wsRates = XLSX.utils.aoa_to_sheet(ratesRows)
            wsRates['!cols'] = Array(7).fill({ wch: 26 })
            XLSX.utils.book_append_sheet(wb2, wsRates, 'Ставки педагогов')
            XLSX.writeFile(wb2, 'все_данные.xlsx')
          })
        },
        onEmpty: () => {
          setDialog(null)
          const wb = XLSX.utils.book_new()
          Object.entries(TEMPLATES).forEach(([type, tmpl]) => {
            const ws = XLSX.utils.aoa_to_sheet([tmpl.columns, tmpl.example])
            ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
            XLSX.utils.book_append_sheet(wb, ws, tmpl.label)
          })
          // Добавляем пустой лист ставок педагогов
          const wsRates = XLSX.utils.aoa_to_sheet([['ФИО педагога', 'Направление', 'Тип (за занятие/по кол-ву учеников)', 'Ставка фикс, ₽', 'Неполная группа, ₽', 'Полная группа, ₽', 'Порог (чел.)'], ['⚠️ Подсказка: если тип За занятие — заполните только Ставка фикс. Если По кол-ву учеников — заполните Неполная, Полная и Порог.', '', '', '', '', '', ''], ['Коноваленко Ольга', 'Рисование', 'За занятие', 600, '', '', ''], ['Петрова Анна', 'Рисование', 'По кол-ву учеников', '', 400, 600, 5]])
          wsRates['!cols'] = Array(7).fill({ wch: 26 })
          XLSX.utils.book_append_sheet(wb, wsRates, 'Ставки педагогов')
          XLSX.writeFile(wb, 'шаблоны_все.xlsx')
        },
      })
    } else {
      const wb = XLSX.utils.book_new()
      Object.entries(TEMPLATES).forEach(([type, tmpl]) => {
        const ws = XLSX.utils.aoa_to_sheet([tmpl.columns, tmpl.example])
        ws['!cols'] = tmpl.columns.map(() => ({ wch: 22 }))
        XLSX.utils.book_append_sheet(wb, ws, tmpl.label)
      })
      XLSX.writeFile(wb, 'шаблоны_все.xlsx')
    }
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

      // Для общего файла — читаем все листы
      if (type === 'all') {
        let totalInserted = 0, allErrors = []
        const importDetails = {} // { 'Клиенты': 5, 'Педагоги': 2, ... }
        const { data: existingClients } = await supabase.from('clients').select('child_name, contacts').eq('studio_id', studioId)
        const { data: existingTeachers } = await supabase.from('teachers').select('id, name').eq('studio_id', studioId)
        const { data: existingDirs } = await supabase.from('directions').select('id, name').eq('studio_id', studioId)
        const { data: existingSubs } = await supabase.from('subscriptions').select('name').eq('studio_id', studioId)

        const { data: existingExpenses } = await supabase.from('expenses').select('expense_date, expense_type, amount').eq('studio_id', studioId)
        const existingExpenseKeys = new Set((existingExpenses||[]).map(e => `${e.expense_date}_${e.expense_type}_${e.amount}`))
        const { data: existingPayments } = await supabase.from('payments').select('payment_date, client_id, amount').eq('studio_id', studioId)
        const existingPaymentKeys = new Set((existingPayments||[]).map(p => `${p.payment_date}_${p.client_id}_${p.amount}`))
        const existingClientPhones = new Set((existingClients||[]).flatMap(c => (c.contacts||[]).filter(x=>x.type==='Телефон').map(x=>x.val.replace(/\D/g,'').slice(-9))))
        const existingClientNames = new Set((existingClients||[]).map(c => c.child_name?.toLowerCase().trim()))
        const existingTeacherNames = new Set((existingTeachers||[]).map(t => t.name?.toLowerCase().trim()))
        const existingDirNames = new Set((existingDirs||[]).map(d => d.name?.toLowerCase().trim()))
        const existingSubNames = new Set((existingSubs||[]).map(s => s.name?.toLowerCase().trim()))

        for (const sheetName of wb.SheetNames) {
          const lower = sheetName.toLowerCase()
          const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
            .filter(row => !Object.values(row).some(v => String(v).startsWith('⚠️')))

          if (lower.includes('клиент')) {
            for (const row of sheetRows) {
              const name = String(row['Имя ребёнка*']||row['Имя ребёнка']||'').trim()
              if (!name) continue
              if (existingClientNames.has(name.toLowerCase())) { allErrors.push(`Дубликат клиент: ${name}`); continue }
              const phone = String(row['Телефон*']||row['Телефон']||'').trim()
              if (phone) { const d = phone.replace(/\D/g,'').slice(-9); if (existingClientPhones.has(d)) { allErrors.push(`Дубликат телефон: ${phone}`); continue } }
              const { error } = await supabase.from('clients').insert({ studio_id: studioId, child_name: name, adult_name: String(row['Имя родителя']||'').trim()||null, contacts: phone?[{type:'Телефон',val:phone}]:[], status: String(row['Статус']||'Новый').trim(), paid_lessons: +row['Оплачено занятий']||0, visited_lessons: +row['Посещено занятий']||0, discount: +row['Скидка %']||0, birthday: String(row['Дата рождения (ГГГГ-ММ-ДД)']||'').trim()||null, source: String(row['Источник']||'').trim()||null, comment: String(row['Комментарий']||'').trim()||null })
              if (error) allErrors.push(`${name}: ${error.message}`); else { totalInserted++; importDetails['Клиенты'] = (importDetails['Клиенты']||0)+1 }
            }
          } else if (lower.includes('педагог') && !lower.includes('ставк')) {
            for (const row of sheetRows) {
              const name = String(row['ФИО*']||row['ФИО']||'').trim()
              if (!name || name.startsWith('⚠️')) continue
              if (existingTeacherNames.has(name.toLowerCase())) { allErrors.push(`Дубликат педагог: ${name}`); continue }
              const salaryType = String(row['Тип оплаты (За занятие/Оклад)']||'').toLowerCase().includes('оклад') ? 'salary' : 'per_lesson'
              const { error } = await supabase.from('teachers').insert({ studio_id: studioId, name, phone: String(row['Телефон']||'').trim()||null, status: String(row['Статус']||'Активен').trim(), salary_type: salaryType, salary_amount: salaryType==='salary'?(+row['Оклад (если оклад), ₽']||0):0, hired: String(row['Дата приёма (ГГГГ-ММ-ДД)*']||row['Дата приёма (ГГГГ-ММ-ДД)']||'').trim()||null })
              if (error) allErrors.push(`${name}: ${error.message}`); else { totalInserted++; importDetails['Педагоги'] = (importDetails['Педагоги']||0)+1 }
            }
          } else if (lower.includes('ставк')) {
            const { data: allT } = await supabase.from('teachers').select('id,name').eq('studio_id', studioId)
            const { data: allD } = await supabase.from('directions').select('id,name').eq('studio_id', studioId)
            for (const row of sheetRows) {
              const tName = String(row['ФИО педагога']||'').trim()
              const dName = String(row['Направление']||'').trim()
              if (!tName || !dName || tName.startsWith('⚠️')) continue
              const t = allT?.find(x => x.name.toLowerCase()===tName.toLowerCase())
              const d = allD?.find(x => x.name.toLowerCase()===dName.toLowerCase())
              if (!t||!d) { allErrors.push(`Ставка: не найден ${!t?`педагог "${tName}"`:`направление "${dName}"`}`); continue }
              const rType = String(row['Тип (за занятие/по кол-ву учеников)']||'').toLowerCase().includes('кол') ? 'by_students' : 'per_lesson'
              const { error } = await supabase.from('teacher_rates').upsert({
                teacher_id:t.id, studio_id:studioId, direction_id:d.id, rate_type:rType,
                rate:rType==='per_lesson'?(+row['Ставка фикс, ₽']||0):0,
                rate_part:rType==='by_students'?(+row['Неполная группа, ₽']||0):0,
                rate_full:rType==='by_students'?(+row['Полная группа, ₽']||0):0,
                min_students:rType==='by_students'?(+row['Порог (чел.)']||0):0,
              }, { onConflict: 'teacher_id,direction_id' })
              if (error) allErrors.push(`Ставка ${tName}/${dName}: ${error.message}`)
              else { importDetails['Ставки педагогов'] = (importDetails['Ставки педагогов']||0)+1; totalInserted++ }
            }
          } else if (lower.includes('направлен')) {
            for (const row of sheetRows) {
              const name = String(row['Название*']||row['Название']||'').trim()
              if (!name) continue
              if (existingDirNames.has(name.toLowerCase())) { allErrors.push(`Дубликат направление: ${name}`); continue }
              const { error } = await supabase.from('directions').insert({ studio_id:studioId, name, teacher_name:String(row['Педагог']||'').trim()||null, schedule:String(row['Расписание']||'').trim()||null, cost_abo:+row['Цена абонемент']||0, cost_single:+row['Цена разовое']||0, max_capacity:+row['Вместимость']||0 })
              if (error) allErrors.push(`${name}: ${error.message}`); else { totalInserted++; importDetails['Направления'] = (importDetails['Направления']||0)+1 }
            }
          } else if (lower.includes('расход')) {
            for (const row of sheetRows) {
              const date = String(row['Дата (ГГГГ-ММ-ДД)*']||row['Дата']||'').trim()
              const expType = String(row['Вид расхода*']||row['Вид расхода']||'').trim()
              const amount = +row['Сумма*']||+row['Сумма']||0
              if (!date||!expType) continue
              const key = `${date}_${expType}_${amount}`
              if (existingExpenseKeys.has(key)) { allErrors.push(`Дубликат расход: ${date} ${expType} ${amount}₽`); continue }
              const { error } = await supabase.from('expenses').insert({ studio_id:studioId, expense_date:date, expense_type:expType, category:String(row['Категория (Периодичный/Разовый)']||'Разовый').trim(), amount, comment:String(row['Комментарий']||'').trim()||null })
              if (error) allErrors.push(`${date} ${expType}: ${error.message}`); else { totalInserted++; importDetails['Расходы'] = (importDetails['Расходы']||0)+1; existingExpenseKeys.add(key) }
            }
          } else if (lower.includes('абонемент')) {
            for (const row of sheetRows) {
              const name = String(row['Название*']||row['Название']||'').trim()
              if (!name) continue
              if (existingSubNames.has(name.toLowerCase())) { allErrors.push(`Дубликат абонемент: ${name}`); continue }
              const { error } = await supabase.from('subscriptions').insert({ studio_id:studioId, name, price:+row['Цена*']||+row['Цена']||0, lessons_count:+row['Количество занятий*']||+row['Количество занятий']||0, is_active:true })
              if (error) allErrors.push(`${name}: ${error.message}`); else { totalInserted++; importDetails['Абонементы'] = (importDetails['Абонементы']||0)+1 }
            }
          }
        }
        setImportResult({ inserted: totalInserted, errors: allErrors, details: importDetails })
        if (totalInserted > 0 && reload) reload()
        setImporting(null)
        return
      }

      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        .filter(row => {
          // Фильтруем строки-подсказки (начинаются с ⚠️ в любой колонке)
          return !Object.values(row).some(v => String(v).startsWith('⚠️'))
        })

      if (!rows.length) { showMsg('error', 'Файл пустой или содержит только подсказки'); setImporting(null); return }

      let inserted = 0, errors = []

      if (type === 'clients') {
        // Загружаем существующие телефоны для проверки дубликатов
        const { data: existingClients } = await supabase.from('clients').select('child_name, contacts').eq('studio_id', studioId)
        const existingPhones = new Set((existingClients || []).flatMap(c =>
          (c.contacts || []).filter(x => x.type === 'Телефон').map(x => x.val.replace(/\D/g, '').slice(-9))
        ))
        const existingNames = new Set((existingClients || []).map(c => c.child_name?.toLowerCase().trim()))

        for (const row of rows) {
          const name = String(row['Имя ребёнка*'] || row['Имя ребёнка'] || '').trim()
          const phone = String(row['Телефон*'] || row['Телефон'] || '').trim()
          if (!name) { errors.push(`Пропущено имя ребёнка`); continue }

          // Проверка дубликата по имени
          if (existingNames.has(name.toLowerCase())) {
            errors.push(`Дубликат: клиент «${name}» уже существует`); continue
          }
          // Проверка дубликата по телефону
          if (phone) {
            const phoneDigits = phone.replace(/\D/g, '').slice(-9)
            if (existingPhones.has(phoneDigits)) {
              errors.push(`Дубликат: телефон ${phone} уже используется`); continue
            }
          }
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
        const { data: cls } = await supabase.from('clients').select('id, child_name').eq('studio_id', studioId)
        const { data: existingPay } = await supabase.from('payments').select('payment_date, client_id, amount').eq('studio_id', studioId)
        const existingPayKeys = new Set((existingPay||[]).map(p => `${p.payment_date}_${p.client_id}_${p.amount}`))
        for (const row of rows) {
          const clientName = String(row['Имя ребёнка*'] || row['Имя ребёнка'] || '').trim()
          const date = String(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата'] || '').trim()
          const amount = +row['Сумма*'] || +row['Сумма'] || 0
          if (!clientName || !date) { errors.push(`Пропущено имя или дата`); continue }
          const client = cls?.find(c => c.child_name === clientName)
          if (!client) { errors.push(`Клиент не найден: ${clientName}`); continue }
          const key = `${date}_${client.id}_${amount}`
          if (existingPayKeys.has(key)) { errors.push(`Дубликат оплата: ${clientName} ${date} ${amount}₽`); continue }
          const { error } = await supabase.from('payments').insert({
            studio_id: studioId, client_id: client.id, payment_date: date,
            payment_type: String(row['Тип (Абонемент/Разовое/Пробное)'] || 'Абонемент').trim(),
            amount, lessons_count: +row['Занятий'] || 0,
            comment: String(row['Комментарий'] || '').trim() || null,
          })
          if (error) errors.push(`${clientName}: ${error.message}`)
          else { inserted++; existingPayKeys.add(key) }
        }
      }

      if (type === 'teachers') {
        const { data: existingTeachers } = await supabase.from('teachers').select('id, name').eq('studio_id', studioId)
        const existingNames = new Set((existingTeachers || []).map(t => t.name?.toLowerCase().trim()))
        const teacherIdMap = {} // name -> id для импорта ставок

        // Основной лист — педагоги
        for (const row of rows) {
          const name = String(row['ФИО*'] || row['ФИО'] || '').trim()
          // Пропускаем пустые строки и строки-подсказки
          if (!name || name.startsWith('⚠️')) continue
          if (existingNames.has(name.toLowerCase())) {
            errors.push(`Дубликат: педагог «${name}» уже существует`); continue
          }
          const salaryTypeRaw = String(row['Тип оплаты (За занятие/Оклад)'] || '').trim().toLowerCase()
          const salaryType = salaryTypeRaw.includes('оклад') ? 'salary' : 'per_lesson'
          const { data: inserted_teacher, error } = await supabase.from('teachers').insert({
            studio_id: studioId,
            name,
            phone: String(row['Телефон'] || '').trim() || null,
            status: String(row['Статус'] || 'Активен').trim(),
            salary_type: salaryType,
            salary_amount: salaryType === 'salary' ? (+row['Оклад (если оклад), ₽'] || 0) : 0,
            hired: String(row['Дата приёма (ГГГГ-ММ-ДД)*'] || row['Дата приёма (ГГГГ-ММ-ДД)'] || '').trim() || null,
          }).select().single()
          if (error) { errors.push(`${name}: ${error.message}`); continue }
          inserted++
          teacherIdMap[name.toLowerCase()] = inserted_teacher.id
        }

        // Второй лист — ставки педагогов
        const ratesSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('ставк'))
        if (ratesSheetName) {
          const wsRates = wb.Sheets[ratesSheetName]
          const ratesRows = XLSX.utils.sheet_to_json(wsRates, { defval: '' })
          const { data: allTeachers } = await supabase.from('teachers').select('id, name').eq('studio_id', studioId)
          const { data: allDirs } = await supabase.from('directions').select('id, name').eq('studio_id', studioId)

          for (const row of ratesRows) {
            const teacherName = String(row['ФИО педагога'] || '').trim()
            const dirName = String(row['Направление'] || '').trim()
            if (!teacherName || teacherName.startsWith('⚠️') || !dirName) continue

            const teacher = allTeachers?.find(t => t.name.toLowerCase() === teacherName.toLowerCase())
            const dir = allDirs?.find(d => d.name.toLowerCase() === dirName.toLowerCase())
            if (!teacher) { errors.push(`Ставки: педагог не найден «${teacherName}»`); continue }
            if (!dir) { errors.push(`Ставки: направление не найдено «${dirName}»`); continue }

            const typeRaw = String(row['Тип (за занятие/по кол-ву учеников)'] || '').toLowerCase()
            const rateType = typeRaw.includes('кол') ? 'by_students' : 'per_lesson'

            const { error } = await supabase.from('teacher_rates').upsert({
              teacher_id: teacher.id,
              studio_id: studioId,
              direction_id: dir.id,
              rate_type: rateType,
              rate: rateType === 'per_lesson' ? (+row['Ставка фикс, ₽'] || 0) : 0,
              rate_part: rateType === 'by_students' ? (+row['Неполная группа, ₽'] || 0) : 0,
              rate_full: rateType === 'by_students' ? (+row['Полная группа, ₽'] || 0) : 0,
              min_students: rateType === 'by_students' ? (+row['Порог (чел.)'] || 0) : 0,
            }, { onConflict: 'teacher_id,direction_id' })
            if (error) errors.push(`Ставка ${teacherName}/${dirName}: ${error.message}`)
          }
        }
      }

      if (type === 'directions') {
        const { data: existingDirs } = await supabase.from('directions').select('name').eq('studio_id', studioId)
        const existingNames = new Set((existingDirs || []).map(d => d.name?.toLowerCase().trim()))

        for (const row of rows) {
          const name = String(row['Название*'] || row['Название'] || '').trim()
          if (!name) { errors.push('Пропущено название'); continue }
          if (existingNames.has(name.toLowerCase())) {
            errors.push(`Дубликат: направление «${name}» уже существует`); continue
          }
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
        const { data: existingExp } = await supabase.from('expenses').select('expense_date, expense_type, amount').eq('studio_id', studioId)
        const existingExpKeys = new Set((existingExp||[]).map(e => `${e.expense_date}_${e.expense_type}_${e.amount}`))
        for (const row of rows) {
          const date = String(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата'] || '').trim()
          const expType = String(row['Вид расхода*'] || row['Вид расхода'] || '').trim()
          const amount = +row['Сумма*'] || +row['Сумма'] || 0
          if (!date || !expType) { errors.push('Пропущена дата или вид расхода'); continue }
          const key = `${date}_${expType}_${amount}`
          if (existingExpKeys.has(key)) { errors.push(`Дубликат: расход ${date} ${expType} ${amount}₽`); continue }
          const { error } = await supabase.from('expenses').insert({
            studio_id: studioId, expense_date: date, expense_type: expType,
            category: String(row['Категория (Периодичный/Разовый)'] || 'Разовый').trim(),
            amount, comment: String(row['Комментарий'] || '').trim() || null,
          })
          if (error) errors.push(`${date} ${expType}: ${error.message}`)
          else { inserted++; existingExpKeys.add(key) }
        }
      }

      if (type === 'subscriptions') {
        const { data: existingSubs } = await supabase.from('subscriptions').select('name').eq('studio_id', studioId)
        const existingNames = new Set((existingSubs || []).map(s => s.name?.toLowerCase().trim()))

        for (const row of rows) {
          const name = String(row['Название*'] || row['Название'] || '').trim()
          const price = +row['Цена*'] || +row['Цена'] || 0
          const lessons = +row['Количество занятий*'] || +row['Количество занятий'] || 0
          if (!name) { errors.push('Пропущено название'); continue }
          if (existingNames.has(name.toLowerCase())) {
            errors.push(`Дубликат: абонемент «${name}» уже существует`); continue
          }
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

      {/* Красивый диалог */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 380, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 17, color: T.ink, marginBottom: 10 }}>{dialog.title}</div>
            <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 24 }}>{dialog.text}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-primary" onClick={dialog.onWithData}>
                📊 С текущими данными
              </button>
              <button className="btn btn-outline" onClick={dialog.onEmpty}>
                📋 Пустой шаблон
              </button>
              <button className="btn btn-ghost" onClick={() => setDialog(null)} style={{ color: T.muted }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Скачайте шаблон, заполните данные и загрузите обратно.
        </div>

        <button className="btn btn-outline" onClick={downloadAllTemplates} style={{ marginBottom: 8, width: '100%' }}>
          📋 Скачать все шаблоны одним файлом
        </button>
        <button className="btn btn-primary" onClick={() => startImport('all')} disabled={!!importing} style={{ marginBottom: 16, width: '100%' }}>
          {importing === 'all' ? '⏳ Загружаем...' : '⬆️ Загрузить общий файл'}
        </button>

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
            {importResult.details && Object.entries(importResult.details).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {Object.entries(importResult.details).map(([section, count]) => (
                  <div key={section} style={{ fontSize: 12, color: T.greenDark }}>• {section}: {count}</div>
                ))}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div style={{ fontSize: 12, color: '#e05a5a', marginTop: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Ошибки ({importResult.errors.length}):</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {importResult.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
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
