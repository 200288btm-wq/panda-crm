import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { T, todayLocal } from '../styles.jsx'
import BookingSettingsPage from './BookingSettingsPage'
import AddressesPage from './AddressesPage'
import StaffPage from './StaffPage'
import * as XLSX from 'xlsx'
import { createDuration, createAddress, createCategory } from '../lib/dictionaries'
import { Modal } from '../components/Modal'
import ImportPreviewModal from '../components/ImportPreviewModal'
import { parseDate, dateToRu } from '../lib/importParse'
import { buildClientsPlan, applyClientsPlan, CLIENT_SELECT } from '../lib/importClients'
import { toast, confirmAction } from '../lib/ui'
import { describeFlags, systemStatusName } from '../lib/clientStatus'
import { liveGroups } from '../lib/groups'

// Узкий экран. Нужен там, где раскладка не сводится к CSS: карточка
// статуса на телефоне сворачивается, на десктопе показана целиком.
function useIsNarrow(bp = 768) {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= bp)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth <= bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return narrow
}

const TABS = [
  { id: 'main',       label: 'Основное' },
  { id: 'features',   label: 'Функции' },
  { id: 'finance',    label: 'Справочники' },
  { id: 'addresses',  label: 'Адреса', feature: 'addresses' },
  { id: 'staff',      label: 'Сотрудники' },
  { id: 'data',       label: 'Данные' },
  { id: 'bot',        label: 'Боты/формы' },
  { id: 'booking',    label: 'Онлайн-запись' },
  { id: 'plan',       label: 'Тариф' },
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

export default function StudioSettingsPage({ studio, studioId, directions = [], staffList = [], reload, clientStatuses: initialStatuses = [], clients = [], payments = [], expenses = [], teachers = [], subscriptions = [], features = { teachers: true, addresses: true, subgroups: true, categories: true, freeze: true } }) {
  const isNarrow = useIsNarrow()
  const [tab, setTab] = useState(() => {
    // Вкладка могла быть удалена или переименована — тогда открываем первую
    const saved = localStorage.getItem('settingsTab')
    return TABS.some(t => t.id === saved) ? saved : 'main'
  })

  const switchTab = (id) => {
    setTab(id)
    localStorage.setItem('settingsTab', id)
  }
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [slugMsg, setSlugMsg] = useState(null)
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
  const [durations, setDurations] = useState([])
  const [newDuration, setNewDuration] = useState({ name: '', hours: '' })
  const [durSaving, setDurSaving] = useState(false)
  const [durMsg, setDurMsg] = useState(null)
  const [periodMsg, setPeriodMsg] = useState(null)
  const [newPeriod, setNewPeriod] = useState({ label: '', period_type: 'unlimited', duration_value: 1, duration_unit: 'months' })

  const [addresses, setAddresses] = useState([])

  // Статусы клиентов
  const [statuses, setStatuses] = useState([])
  // Новый статус заводится сразу с поведением. По умолчанию — как у
  // обычного занимающегося ребёнка; снимая галочки, студия описывает
  // особый случай («Родственник» — только в расписании, без денег).
  const [newStatus, setNewStatus] = useState({
    name: '', color: 'badge-gray',
    in_schedule: true, in_stats: true, in_payments: true, in_list: true,
  })
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

  // Возвращает true, если статус реально сохранён — по этому признаку
  // форма заведения закрывается. На ошибке она остаётся открытой
  // вместе с введённым, чтобы было что поправить.
  const addStatus = async () => {
    const name = newStatus.name.trim()
    if (!name) { setStatusMsg({ type: 'error', text: 'Введите название' }); return false }
    // Дубль по названию: два одинаковых статуса неотличимы для клиента
    // и разъезжаются во вкладках. Введённое не стираем, чтобы поправить
    if (statuses.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setStatusMsg({ type: 'error', text: `Статус «${name}» уже есть в списке` })
      return false
    }
    const { error } = await supabase.from('client_statuses').insert({
      name, color: newStatus.color,
      in_schedule: newStatus.in_schedule, in_stats: newStatus.in_stats,
      in_payments: newStatus.in_payments, in_list: newStatus.in_list,
      studio_id: studioId, sort_order: statuses.length
    })
    if (error) {
      setStatusMsg({ type: 'error', text: error.message })
      setTimeout(() => setStatusMsg(null), 2000)
      return false
    }
    // Без reload() новый статус жил только на этом экране: вкладки на
    // «Клиентах» читают clientStatuses из CRM и не знали о нём до F5
    setNewStatus({ name: '', color: 'badge-gray', in_schedule: true, in_stats: true, in_payments: true, in_list: true })
    loadStatuses(); reload && reload()
    toast.success(`Статус «${name}» добавлен`)
    return true
  }

  // Переименование кастомного статуса. Каскад на clients.status делает
  // триггер в базе одной транзакцией — иначе справочник и клиенты
  // разъехались бы, как это уже случилось с subscriptions.period.
  // Системные статусы сюда не попадают: у них нет кнопки, а прямую
  // попытку отбивает триггер.
  const renameStatus = async (id, name) => {
    const row = statuses.find(s => s.id === id)
    if (!row || row.system_key) return
    const clean = name.trim()
    if (!clean || clean === row.name) return
    if (statuses.some(s => s.id !== id && s.name.toLowerCase() === clean.toLowerCase())) {
      toast.error(`Статус «${clean}» уже есть в списке`)
      return
    }
    const { error } = await supabase.from('client_statuses')
      .update({ name: clean }).eq('id', id).eq('studio_id', studioId)
    if (error) { toast.fromError(error, `Не удалось переименовать «${row.name}»`); return }
    toast.success(`Статус «${row.name}» переименован в «${clean}» — у клиентов тоже`)
    loadStatuses(); reload && reload()
  }

  // Переключение одной галочки поведения у кастомного статуса
  const setStatusFlag = async (id, field, value) => {
    const row = statuses.find(s => s.id === id)
    if (!row || row.system_key) return
    const { error } = await supabase.from('client_statuses')
      .update({ [field]: value }).eq('id', id).eq('studio_id', studioId)
    if (error) { toast.fromError(error, 'Не удалось изменить настройку статуса'); return }
    loadStatuses(); reload && reload()
  }

  const deleteStatus = async (id, name) => {
    // Системный статус удалить нельзя — на нём держатся подсчёты.
    // Кнопки у него нет, это защита на случай прямого вызова
    const row = statuses.find(s => s.id === id)
    if (row && row.system_key) { toast.error(`Системный статус «${name}» удалить нельзя`); return }
    // Считаем клиентов с этим статусом
    const { count } = await supabase.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .eq('status', name)

    const ok = count > 0
      ? await confirmAction({
          title: `Удалить статус «${name}»?`,
          text: `Статус установлен у ${count} клиент${count === 1 ? 'а' : 'ов'}. После удаления он пропадёт из списка выбора, но у клиентов останется.`,
          details: 'Лучше сначала сменить статус этим клиентам.',
          confirmLabel: 'Всё равно удалить', cancelLabel: 'Не удалять', danger: true,
        })
      : await confirmAction({
          title: `Удалить статус «${name}»?`,
          confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
        })
    if (!ok) return
    // Раньше результат удаления не проверялся вовсе: при отказе базы
    // список просто перечитывался, и статус молча оставался на месте
    const { error } = await supabase.from('client_statuses').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить статус «${name}»`); return }
    toast.success(`Статус «${name}» удалён`)
    loadStatuses()
    reload && reload()
  }

  const loadAll = async () => {
    const [s, c, p, et, addr, plan, dur] = await Promise.all([
      supabase.from('studio_settings').select('*').eq('studio_id', studioId).maybeSingle(),
      supabase.from('price_categories').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('subscription_periods').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('expense_types').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
      supabase.from('addresses').select('*').eq('studio_id', studioId).order('id'),
      supabase.from('studio_subscriptions').select('*').eq('studio_id', studioId).maybeSingle(),
      supabase.from('lesson_durations').select('*').eq('studio_id', studioId).order('sort_order').order('id'),
    ])
    if (s.data) setSettings(s.data)
    else setSettings({ studio_id: studioId, studio_name: studio?.name || '', logo_url: '', address: '', inn: '', stamp_url: '', phone: '', email: '', website: '' })
    if (c.data) setCategories(c.data)
    if (p.data) setPeriods(p.data)
    if (et.data) setExpenseTypes(et.data)
    if (addr.data) setAddresses(addr.data)
    if (plan.data) setPlanInfo(plan.data)
    else setPlanInfo({ plan: 'free', expires_at: null })
    if (dur.data) setDurations(dur.data)
  }

  // ── Что реально задето выключением функции ──────────────────────────────
  // Считаем ПО ФАКТУ данных, а не по флагу: выключение ничего не удаляет,
  // поэтому пользователю нужно показать, что именно продолжит работать.
  // Подгруппы берём из directions.groups — CRM грузит их вместе с направлениями,
  // отдельный запрос не нужен
  const featureUsage = (() => {
    // Подгруппой считается только реальное разделение: >1 группы у направления.
    // Одна группа = обычное расписание направления, это не подгруппы.
    // Считаем действующие: убранные из расписания подгруппы занятий
    // не дают, и пугать ими человека при выключении функции незачем
    const subDirs = (directions || []).filter(d => liveGroups(d).length > 1)
    const subCount = subDirs.reduce((s, d) => s + liveGroups(d).length, 0)
    const dirGroups = (directions || []).flatMap(d => liveGroups(d).map(g => ({ ...g, direction_id: d.id })))

    const activeTeachers = (teachers || []).filter(t => t.status !== 'Уволен')
    const teacherDirIds = new Set()
    activeTeachers.forEach(t => (t.direction_ids || []).forEach(id => teacherDirIds.add(id)))
    const teacherDirs = (directions || []).filter(d => teacherDirIds.has(d.id))

    const boundGroups = (dirGroups || []).filter(g => g.address_id)
    const addrDirIds = new Set(boundGroups.map(g => g.direction_id))
    const addrDirs = (directions || []).filter(d => addrDirIds.has(d.id))

    return {
      subgroups: {
        count: subCount,
        dirs: subDirs.map(d => d.name),
        unit: 'подгрупп',
        note: 'Подгруппы не удалятся: расписание, отметки посещаемости и ставки педагогов по подгруппам продолжат работать. Выключение скрывает только заведение новых подгрупп.',
      },
      teachers: {
        count: activeTeachers.length,
        dirs: teacherDirs.map(d => d.name),
        unit: 'педагогов',
        note: 'Педагоги, ставки, начисления и выплаты сохранятся, журнал «кто работал» продолжит писаться. Выключение убирает раздел «Педагоги» из меню — начисления станут недоступны для просмотра и выплаты.',
      },
      addresses: {
        count: (addresses || []).length,
        dirs: addrDirs.map(d => d.name),
        unit: 'адресов',
        note: `Адреса не удалятся, привязка подгрупп сохранится${boundGroups.length ? ` (${boundGroups.length} подгрупп${boundGroups.length === 1 ? 'а' : ''} привязано к адресам)` : ''}. Выключение убирает вкладку «Адреса» и фильтр по адресу в расписании.`,
      },
    }
  })()

  const set = (k, v) => setSettings(prev => ({ ...prev, [k]: v }))

  const saveSettings = async () => {
    setSaving(true); setMsg(null)
    const { id, created_at, ...data } = settings
    const { error } = id
      ? await supabase.from('studio_settings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
      : await supabase.from('studio_settings').insert(data)
    setMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Настройки сохранены' })
    if (!error) { loadAll(); reload && reload() }
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  // Базовый адрес страницы записи (без слага)
  const BOOKING_BASE = 'panda-crm.vercel.app/zapis'

  const normalizeSlug = (s) =>
    (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  // Сохранение слага с проверкой занятости (через suggest_slug — видит все студии даже под RLS)
  const saveSlug = async () => {
    const candidate = normalizeSlug(settings.slug)
    if (!candidate) { setSlugMsg({ type: 'error', text: 'Введите имя латиницей' }); return }
    setSaving(true); setSlugMsg(null)

    const { data: free, error: rpcErr } = await supabase.rpc('suggest_slug', { p_base: candidate, p_exclude_studio: studioId })
    if (rpcErr) { setSlugMsg({ type: 'error', text: 'Ошибка проверки: ' + rpcErr.message }); setSaving(false); return }
    if (free && free !== candidate) {
      setSlugMsg({ type: 'error', text: `«${candidate}» уже занято. Свободно, например: ${free}` })
      setSaving(false); return
    }

    const { id, created_at, ...data } = settings
    const payload = { ...data, slug: candidate, updated_at: new Date().toISOString() }
    const { error } = id
      ? await supabase.from('studio_settings').update(payload).eq('id', id)
      : await supabase.from('studio_settings').insert({ ...payload, studio_id: studioId })

    if (error) {
      setSlugMsg({ type: 'error', text: /unique|duplicate/i.test(error.message) ? 'Это имя уже занято' : error.message })
    } else {
      set('slug', candidate)
      setSlugMsg({ type: 'success', text: 'Ссылка сохранена' })
      loadAll()
    }
    setSaving(false)
    setTimeout(() => setSlugMsg(null), 3000)
  }

  const copyBookingLink = () => {
    const link = `https://${BOOKING_BASE}/${normalizeSlug(settings.slug)}`
    navigator.clipboard?.writeText(link)
    setSlugMsg({ type: 'success', text: 'Ссылка скопирована' })
    setTimeout(() => setSlugMsg(null), 2000)
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
  const addDuration = async () => {
    const name = newDuration.name.trim()
    const hours = +newDuration.hours
    if (!name) { setDurMsg({ type: 'error', text: 'Укажите название' }); return }
    if (!hours || hours <= 0) { setDurMsg({ type: 'error', text: 'Укажите количество часов больше нуля' }); return }
    setDurSaving(true); setDurMsg(null)
    // Та же функция, что вызывает быстрое добавление из модалки направления
    const { error, existed } = await createDuration(studioId, { name, hours })
    setDurSaving(false)
    if (error) { setDurMsg({ type: 'error', text: error }); return }
    setNewDuration({ name: '', hours: '' })
    setDurMsg({ type: 'success', text: existed ? 'Такая длительность уже была' : 'Добавлено' })
    loadAll()
    setTimeout(() => setDurMsg(null), 2500)
  }

  const deleteDuration = async (id, name) => {
    const used = directions.filter(d => d.duration === name)
    const ok = await confirmAction({
      title: `Удалить длительность «${name}»?`,
      text: used.length
        ? `Указана у ${used.length} направлений. У них она останется, но выбрать её заново будет нельзя.`
        : 'Длительность не используется ни в одном направлении.',
      details: used.length ? used.map(d => d.name).join(', ') : null,
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('lesson_durations').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить длительность «${name}»`); return }
    toast.success(`Длительность «${name}» удалена`)
    loadAll()
  }

  const updateDuration = async (id, field, value) => {
    await supabase.from('lesson_durations').update({ [field]: value }).eq('id', id)
    loadAll()
  }

  const addCategory = async () => {
    if (!newCatName.trim()) return
    setCatSaving(true); setCatMsg(null)
    // Та же функция, что вызывает быстрое добавление из модалки направления.
    // Раньше здесь был свой insert без проверки дублей: «Безлимиты» из
    // справочника и «безлимиты» из модалки создавали две разные строки.
    const { row, error, existed } = await createCategory(studioId, { name: newCatName })
    setCatSaving(false)
    if (error) { setCatMsg({ type: 'error', text: error }); setTimeout(() => setCatMsg(null), 4000); return }
    if (existed) {
      // Дубль — не успех. Поле НЕ чистим: человек видит, что он ввёл,
      // и может поправить название. Раньше кнопка просто ничего не делала.
      setCatMsg({ type: 'error', text: `Категория «${row.name}» уже есть в списке — используйте её или задайте другое название` })
      setTimeout(() => setCatMsg(null), 6000)
      return
    }
    setNewCatName('')
    setCatMsg({ type: 'success', text: 'Категория добавлена' })
    loadAll()
    setTimeout(() => setCatMsg(null), 2500)
  }

  const deleteCategory = async (id, name) => {
    const ok = await confirmAction({
      title: `Удалить категорию «${name}»?`,
      text: 'Она пропадёт из выбора при заведении абонементов.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('price_categories').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить категорию «${name}»`); return }
    toast.success(`Категория «${name}» удалена`)
    loadAll()
  }

  const renameCategory = async (id, newName) => {
    await supabase.from('price_categories').update({ name: newName }).eq('id', id)
    loadAll()
  }

  // Периоды
  const addPeriod = async () => {
    if (!newPeriod.label.trim()) { setPeriodMsg({ type: 'error', text: 'Введите название' }); return }

    // Дубль периода — это совпадение ПОВЕДЕНИЯ, а не названия.
    // «6мес» и «6 месяцев» — разные строки справочника, но система
    // считает по ним одно и то же. Сравниваем тип и срок.
    const sameName = periods.find(p => p.label.trim().toLowerCase() === newPeriod.label.trim().toLowerCase())
    if (sameName) {
      setPeriodMsg({ type: 'error', text: `Период «${sameName.label}» уже есть в списке` })
      setTimeout(() => setPeriodMsg(null), 5000)
      return
    }
    const twin = periods.find(p => {
      if (p.period_type !== newPeriod.period_type) return false
      if (newPeriod.period_type !== 'fixed') return true   // два «без срока» ведут себя одинаково
      return +p.duration_value === +newPeriod.duration_value && p.duration_unit === newPeriod.duration_unit
    })
    if (twin) {
      setPeriodMsg({
        type: 'error',
        text: newPeriod.period_type === 'fixed'
          ? `Такой период уже есть — «${twin.label}» (${periodTypeLabel(twin)}). Используйте его или переименуйте.`
          : `Период без срока уже есть — «${twin.label}». Используйте его или переименуйте.`,
      })
      setTimeout(() => setPeriodMsg(null), 6000)
      return
    }

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
    const ok = await confirmAction({
      title: `Удалить период «${label}»?`,
      text: 'У заведённых абонементов срок останется прежним, выбрать этот период заново будет нельзя.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('subscription_periods').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить период «${label}»`); return }
    toast.success(`Период «${label}» удалён`)
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
    const ok = await confirmAction({
      title: `Удалить тип расхода «${name}»?`,
      text: 'Уже записанные расходы этого типа останутся в финансах.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('expense_types').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить тип «${name}»`); return }
    toast.success(`Тип расхода «${name}» удалён`)
    loadAll()
  }

  // Адреса
  const saveAddr = async () => {
    if (!addrForm.name.trim()) { setAddrMsg({ type: 'error', text: 'Введите название' }); return }
    if (editAddr) {
      const { error } = await supabase.from('addresses').update(addrForm).eq('id', editAddr.id)
      if (error) { setAddrMsg({ type: 'error', text: error.message }); return }
    } else {
      const { error } = await createAddress(studioId, addrForm)
      if (error) { setAddrMsg({ type: 'error', text: error }); return }
    }
    setShowAddAddr(false); setEditAddr(null); setAddrForm({ name: '', address: '' })
    setAddrMsg({ type: 'success', text: 'Сохранено' })
    loadAll()
    setTimeout(() => setAddrMsg(null), 2000)
  }

  const deleteAddr = async (id, name) => {
    const ok = await confirmAction({
      title: `Удалить адрес «${name}»?`,
      text: 'Подгруппы, привязанные к этому адресу, останутся, но потеряют привязку.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('addresses').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить адрес «${name}»`); return }
    toast.success(`Адрес «${name}» удалён`)
    loadAll()
  }

  if (!settings) return <div style={{ padding: 40, color: T.muted }}>Загрузка...</div>

  return (
    <div>
      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.filter(t => !t.feature || features[t.feature]).map(t => (
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
      {/* Ширина секции зависит от того, насколько сложна запись внутри.
          У статуса это название, три кнопки и четыре галочки с
          пояснениями — в колонке 260px они вставали друг под другом и
          справочник вытягивался тонкой лентой вниз. Поэтому статусы
          идут отдельной секцией во всю ширину, карточками в ряд, а
          остальные четыре справочника — простые списки «название +
          корзина» — делят ширину между собой. */}
      {tab === 'finance' && <>
        <StatusesTab
          statuses={statuses}
          newStatus={newStatus}
          setNewStatus={setNewStatus}
          statusMsg={statusMsg}
          addStatus={addStatus}
          deleteStatus={deleteStatus}
          renameStatus={renameStatus}
          setStatusFlag={setStatusFlag}
          narrow={isNarrow}
          T={T}
        />

        <TrialSettingsSection
          settings={settings}
          set={set}
          onSave={saveSettings}
          saving={saving}
          msg={msg}
          trialName={systemStatusName(statuses, 'trial')}
          T={T}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Section title="Длительность занятий" icon="⏱">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Варианты для выбора в направлении. Количество часов используется при расчёте оплаты педагогам, поэтому указывайте его даже для названий вроде «Полдня».
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {durations.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <input className="form-input" defaultValue={d.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) updateDuration(d.id, 'name', v) }}
                  style={{ flex: 1, minWidth: 0, background: 'white' }} />
                <input className="form-input" type="number" step="0.25" min="0" defaultValue={d.hours}
                  onBlur={e => { const v = +e.target.value; if (v > 0 && v !== +d.hours) updateDuration(d.id, 'hours', v) }}
                  style={{ width: 78, background: 'white' }} />
                <span style={{ fontSize: 12, color: T.muted }}>ч.</span>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteDuration(d.id, d.name)} style={{ color: '#e05a5a' }}>🗑️</button>
              </div>
            ))}
            {!durations.length && <div style={{ fontSize: 13, color: T.muted }}>Вариантов нет</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input className="form-input" value={newDuration.name}
              onChange={e => setNewDuration(p => ({ ...p, name: e.target.value }))}
              placeholder="Название, например «Полдня»" style={{ flex: 1, minWidth: 0 }}
              onKeyDown={e => e.key === 'Enter' && addDuration()} />
            <input className="form-input" type="number" step="0.25" min="0" value={newDuration.hours}
              onChange={e => setNewDuration(p => ({ ...p, hours: e.target.value }))}
              placeholder="часы" style={{ width: 78 }}
              onKeyDown={e => e.key === 'Enter' && addDuration()} />
            <button className="btn btn-primary" onClick={addDuration} disabled={durSaving}>
              {durSaving ? '...' : '+'}
            </button>
          </div>
          <Msg msg={durMsg} />
        </Section>

        {/* Справочник целиком прячется вместе с функцией. Раньше он
            оставался на месте с предупреждением — по правилу «настройку
            функции скрывать нельзя». Но сам тумблер живёт на вкладке
            «Функции», а не здесь: включить обратно есть где, поэтому
            держать на экране список, который ни на что не влияет, незачем.
            Данные остаются в базе — включил обратно, всё на месте. */}
        {features.categories !== false && (
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
        )}

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

      {/* ── Функции ── */}
      {tab === 'features' && (
        <FeaturesTab settings={settings} onChange={(k, v) => setSettings(p => ({ ...p, [k]: v }))} onSave={saveSettings} saving={saving} msg={msg} T={T} usage={featureUsage} />
      )}

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
          {settings.bot_token && <WebhookButton token={settings.bot_token} T={T} />}
        </Section>

        {/* ── Ссылка на онлайн-запись (слаг студии) ── */}
        <Section title="Ссылка на онлайн-запись" icon="🔗">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
            Публичный адрес страницы записи вашей студии. Это же имя используется для формы приёма заявок с сайта.
          </div>
          <div className="form-group">
            <label className="form-label">Имя в ссылке (латиницей)</label>
            <input className="form-input" value={settings.slug || ''}
              onChange={e => set('slug', e.target.value.toLowerCase())}
              placeholder="akademiya-pandy" />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              Только латинские буквы, цифры и дефис. Должно быть уникальным.
            </div>
          </div>
          {settings.slug && (
            <div style={{ background: T.greenBg, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: T.greenDark, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ wordBreak: 'break-all' }}>🔗 {BOOKING_BASE}/{normalizeSlug(settings.slug)}</span>
              <button className="btn btn-outline btn-sm" onClick={copyBookingLink}>Копировать</button>
            </div>
          )}
          <button className="btn btn-primary" onClick={saveSlug} disabled={saving}>
            {saving ? 'Сохранение...' : '✅ Сохранить ссылку'}
          </button>
          <Msg msg={slugMsg} />
        </Section>

        {/* ── Уведомления о заявках (платформенный бот) ── */}
        <Section title="Уведомления о заявках" icon="📥">
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
            Куда присылать новые заявки с сайта и страницы записи. Уведомления шлёт платформенный бот
            {' '}<a href="https://t.me/uchteno_zayavki_bot" target="_blank" rel="noreferrer" style={{ color: T.green, fontWeight: 700 }}>@uchteno_zayavki_bot</a>.
            <br />Это <b>не</b> клиентский бот выше — здесь только ваши личные уведомления о новых заявках.
          </div>
          <div className="form-group">
            <label className="form-label">Ваш Telegram chat_id</label>
            <input className="form-input" value={settings.intake_tg_chat_id || ''}
              onChange={e => set('intake_tg_chat_id', e.target.value.trim())}
              placeholder="123456789" />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              Напишите боту команду <b>/start</b> — он пришлёт ваш chat_id. Вставьте его сюда.
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Сохранение...' : '✅ Сохранить'}
          </button>
          <Msg msg={msg} />
        </Section>
        </div>
      </>}

      {/* ── Онлайн-запись ── */}
      {tab === 'booking' && <div style={{ maxWidth: 700 }}><BookingSettingsPage directions={directions} studioId={studioId} /></div>}

    </div>
  )
}

function FeaturesTab({ settings, onChange, onSave, saving, msg, T, usage = {} }) {
  // Выключение функции ничего не удаляет — но пользователь этого не знает.
  // Если функция где-то используется, показываем что именно останется работать.
  const [confirmOff, setConfirmOff] = useState(null)
  const features = [
    {
      key: 'feature_teachers',
      usageKey: 'teachers',
      label: 'Педагоги',
      icon: '👩‍🏫',
      desc: 'Раздел педагогов, ставки, выплаты, фильтр по педагогу в расписании',
    },
    {
      key: 'feature_addresses',
      usageKey: 'addresses',
      label: 'Несколько адресов',
      icon: '📍',
      desc: 'Управление адресами, привязка подгрупп к адресам, фильтр по адресу в расписании',
    },
    {
      key: 'feature_subgroups',
      usageKey: 'subgroups',
      label: 'Подгруппы',
      icon: '👥',
      desc: 'Подгруппы внутри направлений, распределение учеников по подгруппам',
    },
    {
      key: 'feature_categories',
      label: 'Категории стоимости',
      icon: '💰',
      desc: 'Разные цены для разных категорий клиентов (льготная, стандартная и т.д.)',
    },
    {
      key: 'feature_freeze',
      label: 'Заморозка абонементов',
      icon: '❄️',
      desc: 'Возможность заморозить абонемент клиента на определённый период',
    },
  ]

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.6 }}>
        Включайте только те функции которые вам нужны — лишние разделы и кнопки будут скрыты. Изменения вступают в силу после сохранения.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {features.map(f => {
          const enabled = settings[f.key] !== false
          const u = usage[f.usageKey] || null
          const used = !!(u && u.count > 0)
          const toggle = () => {
            // Включаем молча. Выключаем молча, если функция нигде не задействована
            if (enabled && used) setConfirmOff({ ...f, usage: u })
            else onChange(f.key, !enabled)
          }
          return (
            <div key={f.key} onClick={toggle}
              style={{ background: 'white', borderRadius: 14, padding: '14px 16px', border: `2px solid ${enabled ? T.green : T.border}`, cursor: 'pointer', transition: 'border 0.15s, background 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 24 }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{f.desc}</div>
                {used && (
                  <div style={{ fontSize: 11, color: T.greenDark, fontWeight: 700, marginTop: 4 }}>
                    {u.dirs.length
                      ? `Используется в ${u.dirs.length} ${plural(u.dirs.length, 'направлении', 'направлениях', 'направлениях')} · ${u.count} ${u.unit}`
                      : `Заведено ${u.count} ${u.unit}`}
                  </div>
                )}
              </div>
              <div style={{ width: 44, height: 24, borderRadius: 99, background: enabled ? T.green : '#ddd', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: enabled ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Сохранение...' : '✅ Сохранить настройки'}
      </button>
      <Msg msg={msg} />

      {confirmOff && (
        <Modal title={`Выключить «${confirmOff.label}»?`} onClose={() => setConfirmOff(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmOff(null)}>Отмена</button>
            <button className="btn btn-primary" onClick={() => { onChange(confirmOff.key, false); setConfirmOff(null) }}>
              Выключить
            </button>
          </>}>
          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, marginBottom: 12 }}>
            {confirmOff.usage.note}
          </div>
          {confirmOff.usage.dirs.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, marginBottom: 6 }}>
                Затронутые направления ({confirmOff.usage.dirs.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {confirmOff.usage.dirs.map(n => (
                  <span key={n} style={{ background: T.greenBg, color: T.greenDark, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{n}</span>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            Функцию можно включить обратно в любой момент — данные никуда не денутся.
            Не забудьте нажать «Сохранить настройки».
          </div>
        </Modal>
      )}
    </div>
  )
}

// 1 направлении / 2 направлениях — русские числительные
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
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

function WebhookButton({ token, T }) {
  const [status, setStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [msg, setMsg] = useState('')

  const connect = async () => {
    setStatus('loading')
    setMsg('')
    try {
      const res = await fetch('https://uchteno-bot.vercel.app/api/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus('ok')
        setMsg('Вебхук успешно зарегистрирован! Бот готов к работе.')
      } else {
        setStatus('error')
        setMsg(data.description || 'Ошибка регистрации вебхука')
      }
    } catch (e) {
      setStatus('error')
      setMsg('Ошибка соединения: ' + e.message)
    }
  }

  return (
    <div style={{ marginTop: 16, padding: '14px 16px', background: T.cream, borderRadius: 12, border: `1px solid ${T.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 6 }}>🔗 Подключение бота</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        После сохранения токена нажмите кнопку чтобы зарегистрировать вебхук — без этого бот не будет отвечать клиентам.
      </div>
      <button className="btn btn-outline" onClick={connect} disabled={status === 'loading'}>
        {status === 'loading' ? '⏳ Подключаем...' : '🔗 Подключить бота'}
      </button>
      {status === 'ok' && <div style={{ marginTop: 8, fontSize: 13, color: T.greenDark, fontWeight: 600 }}>✅ {msg}</div>}
      {status === 'error' && <div style={{ marginTop: 8, fontSize: 13, color: '#e05a5a', fontWeight: 600 }}>⚠️ {msg}</div>}
    </div>
  )
}

// Четыре галочки поведения. Порядок — от самого заметного к самому
// тихому: расписание видно каждый день, общий список — фон.
const STATUS_FLAGS = [
  { key: 'in_schedule', label: 'В расписании',   hint: 'ребёнок появляется в сетке занятий, его можно отметить' },
  { key: 'in_stats',    label: 'В расчётах',     hint: 'считается активным: цифры дашборда, заполненность групп, задолженности' },
  { key: 'in_payments', label: 'В оплатах',      hint: 'доступен при заведении оплаты' },
  { key: 'in_list',     label: 'В общем списке', hint: 'виден на вкладке «Все» списка клиентов' },
]

const SYSTEM_NOTE = {
  new:     'Счётчик у «Клиентов» в меню; её же получает клиент из заявки.',
  active:  'Основная роль: ребёнок ходит и платит.',
  paused:  'Перерыв: в расписании нет, но долг виден и оплату завести можно.',
  archive: 'Ушедшие. Чтобы принять оплату, клиента надо вернуть из архива.',
}

// В карточке статуса галочки идут без пояснений: расшифровка одна на
// весь справочник и стоит в шапке. Иначе один и тот же текст
// повторяется в каждой из семи карточек и глушит сами названия.
// В форме заведения нового статуса пояснения нужны — там человек
// видит эти галочки впервые.
function FlagBox({ on, disabled, label, hint, onChange, T }) {
  return (
    <label style={{
      display: 'flex', alignItems: hint ? 'flex-start' : 'center', gap: 7,
      ...(hint ? { flex: '1 1 190px' } : null),
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
    }}>
      <input type="checkbox" checked={!!on} disabled={disabled}
        onChange={e => onChange && onChange(e.target.checked)}
        style={{ marginTop: hint ? 2 : 0, width: 15, height: 15, flexShrink: 0, accentColor: T.green, cursor: disabled ? 'default' : 'pointer' }} />
      {hint ? (
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.ink }}>{label}</span>
          <span style={{ display: 'block', fontSize: 11, color: T.muted, lineHeight: 1.35 }}>{hint}</span>
        </span>
      ) : (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{label}</span>
      )}
    </label>
  )
}

function StatusRow({ item, onRename, onDelete, onFlag, narrow, T }) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item.name)
  const sys = !!item.system_key
  const save = () => { const v = name.trim(); if (v && v !== item.name) onRename(item.id, v); setEditing(false) }

  // На телефоне карточка свёрнута до плашки и строки «где участвует»:
  // семь развёрнутых карточек — это больше экрана прокрутки в разделе,
  // куда заходят раз в жизни. На десктопе места хватает, там всё видно
  // сразу и сворачивать нечего.
  const showFlags = !narrow || open

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px', background: T.cream, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <input className="form-input" value={name} onChange={e => setName(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(item.name); setEditing(false) } }}
            autoFocus style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
        ) : (
          <span className={`badge ${item.color}`}>{item.name}</span>
        )}
        {sys && <span style={{ fontSize: 11, color: T.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>🔒</span>}
        <div style={{ flex: 1 }} />
        {!sys && !editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Переименовать">✏️</button>
        )}
        {!sys && (
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id, item.name)} style={{ color: '#e05a5a' }}>🗑️</button>
        )}
        {narrow && (
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(v => !v)}
            title={open ? 'Свернуть' : 'Настроить'}>{open ? '▲' : '▼'}</button>
        )}
      </div>

      {narrow && !open && (
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>{describeFlags(item)}</div>
      )}

      {showFlags && sys && (
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4, marginTop: 5 }}>
          {SYSTEM_NOTE[item.system_key]}
        </div>
      )}

      {showFlags && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
          {STATUS_FLAGS.map(f => (
            <FlagBox key={f.key} on={item[f.key]} disabled={sys} label={f.label} T={T}
              onChange={v => onFlag(item.id, f.key, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Пробные занятия ─────────────────────────────────────────────────
// Стоит сразу под справочником статусов: человек только что увидел там
// карточку «Пробное» и логично ждёт рядом ответ на вопрос «а как оно
// работает».
//
// Обе настройки — про поведение, которое студия выбирает сама. Умолчания
// подобраны так, чтобы новая функция ничего не начала делать без спроса:
// не архивировать никогда, повторное пробное разрешать с предупреждением.
function TrialSettingsSection({ settings, set, onSave, saving, msg, trialName, T }) {
  if (!settings) return null

  const days = settings.trial_archive_after_days
  const PRESETS = [
    { val: null, label: 'Никогда' },
    { val: 7,    label: 'Через неделю' },
    { val: 14,   label: 'Через 2 недели' },
    { val: 30,   label: 'Через месяц' },
  ]
  const isPreset = PRESETS.some(p => p.val === days)
  const custom = !isPreset && days != null

  const POLICIES = [
    { val: 'once',          label: 'Только одно',            hint: 'один человек — одно пробное за всё время' },
    { val: 'per_direction', label: 'По одному на направление', hint: 'на каждое направление можно сходить раз' },
    { val: 'warn',          label: 'Можно, но предупредить',   hint: 'запишем, но скажем, что пробное уже было' },
    { val: 'always',        label: 'Всегда можно',            hint: 'без ограничений' },
  ]

  const chip = (on) => ({
    padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
    border: `2px solid ${on ? T.green : T.border}`,
    background: on ? T.greenBg : 'white',
    color: on ? T.greenDark : T.ink,
  })

  return (
    <Section title={`Пробные занятия — статус «${trialName}»`} icon="🎈">
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
        Пробный записывается кнопкой «Записать» прямо в занятии — из заявок,
        из ждущих записи или с нуля. Он виден в расписании и считается педагогу,
        если ставка зависит от числа учеников, но в статистику и в общий список
        клиентов не идёт.
      </div>

      <div className="form-group">
        <label className="form-label">Если пробный не вернулся — убирать в архив</label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
          {PRESETS.map(p => (
            <label key={String(p.val)} onClick={() => set('trial_archive_after_days', p.val)}
              style={chip(days === p.val)}>{p.label}</label>
          ))}
          <label onClick={() => set('trial_archive_after_days', custom ? days : 21)}
            style={chip(custom)}>Свой срок</label>
          {custom && (
            <input className="form-input" type="number" min="1" max="365"
              value={days} onChange={e => set('trial_archive_after_days', +e.target.value || 1)}
              style={{ width: 90 }} />
          )}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
          Срок считается от последнего события: отметки, записи на занятие или
          дня, когда пробного завели. <b>Долг архив не пускает</b> — пока за пробное
          не заплатили, он останется на виду: у архивного клиента нельзя принять оплату.
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 8 }}>
        <label className="form-label">Можно ли прийти на пробное ещё раз</label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
          {POLICIES.map(p => (
            <label key={p.val} onClick={() => set('trial_repeat_policy', p.val)}
              style={chip((settings.trial_repeat_policy || 'warn') === p.val)}>{p.label}</label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
          {POLICIES.find(p => p.val === (settings.trial_repeat_policy || 'warn'))?.hint}.
          {' '}Ограничение считает <b>занятия</b>, а не карточки: один человек — всегда
          один клиент, сколько бы пробных он ни посетил.
        </div>
      </div>

      <button className="btn btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <Msg msg={msg} />
    </Section>
  )
}

function StatusesTab({ statuses, newStatus, setNewStatus, statusMsg, addStatus, deleteStatus, renameStatus, setStatusFlag, narrow, T }) {
  const [adding, setAdding] = useState(false)
  // Закрываем форму только при удачном сохранении: на ошибке (дубль
  // названия) она должна остаться открытой вместе с введённым
  const submit = async () => { const ok = await addStatus(); if (ok) setAdding(false) }
  const cancel = () => {
    setAdding(false)
    setNewStatus({ name: '', color: 'badge-gray', in_schedule: true, in_stats: true, in_payments: true, in_list: true })
  }
  const COLOR_OPTIONS = [
    { value: 'badge-blue',   label: 'Синий',      color: '#3b82f6' },
    { value: 'badge-green',  label: 'Зелёный',    color: '#22c55e' },
    { value: 'badge-orange', label: 'Оранжевый',  color: '#f97316' },
    { value: 'badge-red',    label: 'Красный',    color: '#ef4444' },
    { value: 'badge-gray',   label: 'Серый',      color: '#9ca3af' },
    { value: 'badge-purple', label: 'Фиолетовый', color: '#a855f7' },
  ]
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 16, border: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, color: T.ink, marginBottom: 6 }}>👤 Статусы клиентов</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 12, lineHeight: 1.5, maxWidth: 820 }}>
          Статус решает не только как клиент подписан, но и <b>где он участвует</b>. Четыре статуса
          системные — на них держатся подсчёты, поэтому их нельзя удалить, переименовать
          или перенастроить. Свои можно заводить сколько угодно.
        </div>

        {/* Расшифровка галочек — одна на весь справочник */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', background: T.card,
          border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          {STATUS_FLAGS.map(f => (
            <span key={f.key} style={{ fontSize: 11.5, color: T.muted }}>
              <b style={{ color: T.ink }}>{f.label}</b> — {f.hint}
            </span>
          ))}
        </div>
        {/* Карточки в ряд: сетка сама считает, сколько влезет, и на
            телефоне схлопывается в одну колонку без отдельного кода */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: 10, marginBottom: 16,
        }}>
          {statuses.map(s => (
            <StatusRow key={s.id} item={s} T={T} narrow={narrow}
              onRename={renameStatus} onDelete={deleteStatus} onFlag={setStatusFlag} />
          ))}
          {!statuses.length && <div style={{ fontSize: 13, color: T.muted }}>Статусов нет</div>}
        </div>
        {/* Форма заведения раскрывается кнопкой. Развёрнутая она занимала
            больше места, чем сам справочник, хотя новый статус заводят
            от силы раз в год */}
        {!adding && (
          <button className="btn btn-outline" onClick={() => setAdding(true)}>+ Новый статус</button>
        )}

        {adding && (
        <div style={{ background: T.greenBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.green}33` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 12 }}>+ Новый статус</div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Название</label>
            <input className="form-input" value={newStatus.name}
              onChange={e => setNewStatus(s => ({ ...s, name: e.target.value }))}
              placeholder="Например: VIP, На паузе..."
              onKeyDown={e => e.key === 'Enter' && submit()} />
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
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Где участвует</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, background: 'white', borderRadius: 10, padding: '10px 12px', border: `1px solid ${T.border}` }}>
              {STATUS_FLAGS.map(f => (
                <FlagBox key={f.key} on={newStatus[f.key]} label={f.label} hint={f.hint} T={T}
                  onChange={v => setNewStatus(s => ({ ...s, [f.key]: v }))} />
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6, lineHeight: 1.45 }}>
              Например, «Родственник» — только в расписании: ходит на занятия, но не платит,
              и долгов по нему на главной не будет.
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${newStatus.color}`}>{newStatus.name || 'Предпросмотр'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={submit} disabled={!newStatus.name.trim()}>+ Добавить статус</button>
            <button className="btn btn-ghost" onClick={cancel}>Отмена</button>
          </div>
          {statusMsg && (
            <div style={{ fontSize: 12, marginTop: 8, color: statusMsg.type === 'error' ? '#e05a5a' : T.greenDark }}>
              {statusMsg.type === 'error' ? '⚠️' : '✅'} {statusMsg.text}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

function DataTab({ studioId, clients, payments, expenses, teachers, directions, subscriptions, reload, T }) {
  const [importing, setImporting] = useState(null)
  const [importMsg, setImportMsg] = useState(null)
  const [importResult, setImportResult] = useState(null)
  // План импорта клиентов: считается из файла, применяется только после подтверждения
  const [importPlan, setImportPlan] = useState(null)
  const [importMode, setImportMode] = useState('fill')
  const [planRows, setPlanRows] = useState(null)
  const [planExisting, setPlanExisting] = useState(null)
  const [applying, setApplying] = useState(false)
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
      columns: ['Имя ребёнка*', 'Имя родителя', 'Телефон*', 'Email', 'Статус', 'Оплачено занятий', 'Посещено занятий', 'Скидка %', 'Дата рождения (ДД.ММ.ГГГГ)', 'Источник', 'Комментарий'],
      example: ['Иван Петров', 'Мария Петрова', '+79001234567', '', 'Активен', '8', '4', '0', '12.05.2018', 'ВКонтакте', ''],
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
      if (type === 'clients') rows = rows.concat(clients.map(c => [c.child_name||'',c.adult_name||'',(c.contacts||[]).find(x=>x.type==='Телефон')?.val||'',(c.contacts||[]).find(x=>x.type==='Email')?.val||'',c.status||'',c.paid_lessons||0,c.visited_lessons||0,c.discount||0,dateToRu(c.birthday),c.source||'',c.comment||'']))
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
              if (type === 'clients') rows = rows.concat(clients.map(c => [c.child_name||'',c.adult_name||'',(c.contacts||[]).find(x=>x.type==='Телефон')?.val||'',(c.contacts||[]).find(x=>x.type==='Email')?.val||'',c.status||'',c.paid_lessons||0,c.visited_lessons||0,c.discount||0,dateToRu(c.birthday),c.source||'',c.comment||'']))
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
      birthday: dateToRu(c.birthday),
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

    const date = todayLocal()
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
      const wb = XLSX.read(buf, { cellDates: true })

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
        const existingClientPhones = new Set((existingClients||[]).flatMap(c => (c.contacts||[]).filter(x=>x&&x.type==='Телефон'&&x.val).map(x=>String(x.val).replace(/\D/g,'').slice(-10))))
        const existingClientNames = new Set((existingClients||[]).map(c => c.child_name?.toLowerCase().trim()))
        const existingTeacherNames = new Set((existingTeachers||[]).map(t => t.name?.toLowerCase().trim()))
        const existingDirNames = new Set((existingDirs||[]).map(d => d.name?.toLowerCase().trim()))
        const existingSubNames = new Set((existingSubs||[]).map(s => s.name?.toLowerCase().trim()))

        for (const sheetName of wb.SheetNames) {
          const lower = sheetName.toLowerCase()
          const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
            .filter(row => !Object.values(row).some(v => String(v).startsWith('⚠️')))

          if (lower.includes('клиент')) {
            // Тот же движок, что и в одиночном импорте: телефон+имя = тот же
            // ребёнок, только телефон = брат/сестра. Режим — «дополнить».
            const { data: exClients } = await supabase
              .from('clients').select(CLIENT_SELECT).eq('studio_id', studioId)
            const plan = buildClientsPlan({ rows: sheetRows, existingClients: exClients, clientStatuses: statuses, mode: 'fill' })
            const res = await applyClientsPlan({ supabase, studioId, items: plan.items })
            totalInserted += res.inserted + res.updated
            if (res.inserted) importDetails['Клиенты'] = (importDetails['Клиенты']||0) + res.inserted
            if (res.updated) importDetails['Клиенты (дополнено)'] = (importDetails['Клиенты (дополнено)']||0) + res.updated
            allErrors.push(...res.errors)
          } else if (lower.includes('педагог') && !lower.includes('ставк')) {
            for (const row of sheetRows) {
              const name = String(row['ФИО*']||row['ФИО']||'').trim()
              if (!name || name.startsWith('⚠️')) continue
              if (existingTeacherNames.has(name.toLowerCase())) { allErrors.push(`Дубликат педагог: ${name}`); continue }
              const salaryType = String(row['Тип оплаты (За занятие/Оклад)']||'').toLowerCase().includes('оклад') ? 'salary' : 'per_lesson'
              const { error } = await supabase.from('teachers').insert({ studio_id: studioId, name, phone: String(row['Телефон']||'').trim()||null, status: String(row['Статус']||'Активен').trim(), salary_type: salaryType, salary_amount: salaryType==='salary'?(+row['Оклад (если оклад), ₽']||0):0, hired: parseDate(row['Дата приёма (ГГГГ-ММ-ДД)*']||row['Дата приёма (ГГГГ-ММ-ДД)']).iso })
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
                teacher_id:t.id, studio_id:studioId, direction_id:d.id, group_id:0, rate_type:rType,
                rate:rType==='per_lesson'?(+row['Ставка фикс, ₽']||0):0,
                rate_part:rType==='by_students'?(+row['Неполная группа, ₽']||0):0,
                rate_full:rType==='by_students'?(+row['Полная группа, ₽']||0):0,
                min_students:rType==='by_students'?(+row['Порог (чел.)']||0):0,
                // Импортированная ставка должна применяться. Без этого
                // строка, ранее убранная из обращения, осталась бы убранной,
                // и импорт бы молча не подействовал
                archived_at:null, archived_by:null,
              }, { onConflict: 'teacher_id,direction_id,group_id' })
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
          } else if (lower.includes('оплат')) {
            const { data: cls } = await supabase.from('clients').select('id, child_name').eq('studio_id', studioId)
            for (const row of sheetRows) {
              const clientName = String(row['Имя ребёнка*']||row['Имя ребёнка']||'').trim()
              const date = parseDate(row['Дата (ГГГГ-ММ-ДД)*']||row['Дата']).iso
              const amount = +row['Сумма*']||+row['Сумма']||0
              if (!clientName || !date) continue
              const client = (cls||[]).find(c => (c.child_name||'').trim().toLowerCase() === clientName.toLowerCase())
              if (!client) { allErrors.push(`Оплата: клиент не найден «${clientName}»`); continue }
              const key = `${date}_${client.id}_${amount}`
              if (existingPaymentKeys.has(key)) { allErrors.push(`Дубликат оплата: ${clientName} ${date} ${amount}₽`); continue }
              const { error } = await supabase.from('payments').insert({ studio_id: studioId, client_id: client.id, payment_date: date, payment_type: String(row['Тип (Абонемент/Разовое/Пробное)']||'Абонемент').trim(), amount, lessons_count: +row['Занятий']||0, comment: String(row['Комментарий']||'').trim()||null })
              if (error) allErrors.push(`Оплата ${clientName}: ${error.message}`); else { totalInserted++; importDetails['Оплаты'] = (importDetails['Оплаты']||0)+1; existingPaymentKeys.add(key) }
            }
          } else if (lower.includes('расход')) {
            for (const row of sheetRows) {
              const date = parseDate(row['Дата (ГГГГ-ММ-ДД)*']||row['Дата']).iso
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
        // Ничего не пишем сразу: строим план и показываем предпросмотр.
        const { data: existingClients } = await supabase
          .from('clients').select(CLIENT_SELECT).eq('studio_id', studioId)
        setPlanRows(rows)
        setPlanExisting(existingClients || [])
        setImportPlan(buildClientsPlan({ rows, existingClients, clientStatuses: statuses, mode: importMode }))
        setImporting(null)
        return
      }

      if (type === 'payments') {
        const { data: cls } = await supabase.from('clients').select('id, child_name').eq('studio_id', studioId)
        const { data: existingPay } = await supabase.from('payments').select('payment_date, client_id, amount').eq('studio_id', studioId)
        const existingPayKeys = new Set((existingPay||[]).map(p => `${p.payment_date}_${p.client_id}_${p.amount}`))
        for (const row of rows) {
          const clientName = String(row['Имя ребёнка*'] || row['Имя ребёнка'] || '').trim()
          const date = parseDate(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата']).iso
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
            hired: parseDate(row['Дата приёма (ГГГГ-ММ-ДД)*'] || row['Дата приёма (ГГГГ-ММ-ДД)']).iso,
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
              group_id: 0,          // импорт из шаблона — всегда ставка на всё направление
              rate_type: rateType,
              rate: rateType === 'per_lesson' ? (+row['Ставка фикс, ₽'] || 0) : 0,
              rate_part: rateType === 'by_students' ? (+row['Неполная группа, ₽'] || 0) : 0,
              rate_full: rateType === 'by_students' ? (+row['Полная группа, ₽'] || 0) : 0,
              min_students: rateType === 'by_students' ? (+row['Порог (чел.)'] || 0) : 0,
              // См. выше: импорт возвращает ставку в обращение
              archived_at: null, archived_by: null,
            }, { onConflict: 'teacher_id,direction_id,group_id' })
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
          const date = parseDate(row['Дата (ГГГГ-ММ-ДД)*'] || row['Дата']).iso
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

  // ── Предпросмотр импорта клиентов ────────────────────────
  const changeImportMode = (m) => {
    setImportMode(m)
    if (planRows) setImportPlan(buildClientsPlan({ rows: planRows, existingClients: planExisting, clientStatuses: statuses, mode: m }))
  }
  const togglePlanItem = (id) => setImportPlan(p => ({
    ...p, items: p.items.map(i => i.id === id ? { ...i, selected: !i.selected } : i),
  }))
  const togglePlanAll = (on) => setImportPlan(p => ({
    ...p, items: p.items.map(i => i.action === 'same' ? i : { ...i, selected: on }),
  }))
  const closePlan = () => { setImportPlan(null); setPlanRows(null); setPlanExisting(null) }

  const confirmPlan = async () => {
    setApplying(true)
    const items = importMode === 'skip'
      ? importPlan.items.filter(i => i.action === 'create')
      : importPlan.items
    const res = await applyClientsPlan({ supabase, studioId, items })
    setApplying(false)
    closePlan()
    setImportResult({ inserted: res.inserted, updated: res.updated, errors: res.errors })
    if ((res.inserted || res.updated) && reload) reload()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />

      <ImportPreviewModal
        plan={importPlan}
        mode={importMode}
        busy={applying}
        onModeChange={changeImportMode}
        onToggle={togglePlanItem}
        onToggleAll={togglePlanAll}
        onConfirm={confirmPlan}
        onCancel={closePlan}
      />

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
              ✅ Добавлено: {importResult.inserted} записей
              {importResult.updated > 0 && ` · дополнено: ${importResult.updated}`}
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
