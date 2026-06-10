import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const DAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
const BOOKING_URL = 'https://panda-crm.vercel.app/zapis'

const DEFAULT_FIELDS = [
  { key: 'name',        label: 'Имя ребёнка',          required: true,  locked: true },
  { key: 'parent_name', label: 'Имя родителя',          required: false, locked: false },
  { key: 'phone',       label: 'Телефон',               required: true,  locked: true },
  { key: 'age',         label: 'Возраст ребёнка',       required: false, locked: false },
  { key: 'contact_way', label: 'Удобный способ связи',  required: false, locked: false },
  { key: 'comment',     label: 'Комментарий',           required: false, locked: false },
]

export default function BookingSettingsPage({ directions }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase.from('booking_settings').select('*').eq('id', 1).single()
    if (data) {
      setSettings({
        is_active: data.is_active ?? true,
        title: data.title || 'Запись в Академию Панды',
        description: data.description || '',
        cover_url: data.cover_url || '',
        direction_ids: data.directions || [],
        booking_offset_days: data.booking_offset_days ?? 0,
        booking_window_days: data.booking_window_days ?? 30,
        show_teacher: data.show_teacher ?? false,
        required_fields: data.required_fields || ['name','phone'],
        max_per_slot: data.max_per_slot ?? 10,
      })
    }
  }

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))

  const toggleDirection = (id) => {
    set('direction_ids', settings.direction_ids.includes(id)
      ? settings.direction_ids.filter(x => x !== id)
      : [...settings.direction_ids, id])
  }

  const toggleField = (key) => {
    set('required_fields', settings.required_fields.includes(key)
      ? settings.required_fields.filter(x => x !== key)
      : [...settings.required_fields, key])
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('booking_settings').upsert({
      id: 1,
      is_active: settings.is_active,
      title: settings.title,
      description: settings.description,
      cover_url: settings.cover_url,
      directions: settings.direction_ids,
      booking_offset_days: settings.booking_offset_days,
      booking_window_days: settings.booking_window_days,
      show_teacher: settings.show_teacher,
      required_fields: settings.required_fields,
      max_per_slot: settings.max_per_slot,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(BOOKING_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!settings) return <div style={{ padding: 40, color: T.muted, textAlign: 'center' }}>Загрузка...</div>

  const cardStyle = { background: 'white', borderRadius: 16, border: `1px solid ${T.border}`, padding: '20px 24px', marginBottom: 16 }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }
  const inp = { fontSize: 15, padding: '9px 12px' }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20 }}>📅 Онлайн-запись</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Настройте публичную страницу записи клиентов</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={BOOKING_URL} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, color: T.green, fontWeight: 600, textDecoration: 'none' }}>
            🔗 Открыть страницу
          </a>
          <button onClick={copyLink} className="btn btn-secondary" style={{ fontSize: 13 }}>
            {copied ? '✅ Скопировано' : '📋 Копировать ссылку'}
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: 13, minWidth: 120 }}>
            {saving ? 'Сохраняем...' : saved ? '✅ Сохранено' : '💾 Сохранить'}
          </button>
        </div>
      </div>

      {/* Включить / выключить */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Страница записи</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
            {settings.is_active ? '🟢 Принимает заявки' : '🔴 Запись отключена'}
          </div>
        </div>
        <div onClick={() => set('is_active', !settings.is_active)}
          style={{ width: 48, height: 26, borderRadius: 13, background: settings.is_active ? T.green : T.border,
            cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute',
            top: 3, left: settings.is_active ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px #0002' }} />
        </div>
      </div>

      {/* Ссылка */}
      <div style={{ ...cardStyle, background: T.cream, border: `1.5px dashed ${T.green}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6, textTransform: 'uppercase' }}>Ссылка на страницу записи</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <code style={{ fontSize: 14, fontWeight: 700, color: T.greenDark, wordBreak: 'break-all' }}>{BOOKING_URL}</code>
          <button onClick={copyLink} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: T.green, color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, flexShrink: 0 }}>
            {copied ? '✅' : '📋 Копировать'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>Разместите эту ссылку на сайте, в соцсетях, в шапке профиля ВКонтакте</div>
      </div>

      {/* Контент страницы */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>✏️ Контент страницы</div>
        <div className="form-group">
          <label style={labelStyle}>Заголовок страницы</label>
          <input className="form-input" style={inp} value={settings.title}
            onChange={e => set('title', e.target.value)} placeholder="Запись в Академию Панды" />
        </div>
        <div className="form-group">
          <label style={labelStyle}>Описание (отображается под заголовком)</label>
          <textarea className="form-input" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            value={settings.description} onChange={e => set('description', e.target.value)}
            rows={3} placeholder="Короткое описание — кому подходят занятия, что получит ребёнок..." />
        </div>
        <div className="form-group">
          <label style={labelStyle}>Ссылка на обложку (URL картинки)</label>
          <input className="form-input" style={inp} value={settings.cover_url}
            onChange={e => set('cover_url', e.target.value)} placeholder="https://..." />
          {settings.cover_url && (
            <img src={settings.cover_url} alt="обложка" style={{ marginTop: 8, maxHeight: 120, borderRadius: 10, objectFit: 'cover', width: '100%' }}
              onError={e => e.target.style.display = 'none'} />
          )}
        </div>
      </div>

      {/* Направления */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🎯 Направления в записи</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>Выберите программы, на которые можно записаться онлайн</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {directions.map(d => {
            const active = settings.direction_ids.includes(d.id)
            const color = d.color || T.green
            return (
              <div key={d.id} onClick={() => toggleDirection(d.id)} style={{
                padding: '8px 16px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                background: active ? color + '22' : T.cream,
                border: `2px solid ${active ? color : T.border}`,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: active ? color : T.ink }}>{d.name}</span>
                {active && <span style={{ fontSize: 12, color }}>✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Настройки записи */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>⚙️ Параметры записи</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label style={labelStyle}>Запись доступна с… (дней от сегодня)</label>
            <input className="form-input" style={inp} type="number" min="0" max="30"
              value={settings.booking_offset_days} onChange={e => set('booking_offset_days', +e.target.value)} />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              0 — можно записаться на сегодня, 1 — только с завтра, 2 — с послезавтра
            </div>
          </div>
          <div className="form-group">
            <label style={labelStyle}>Горизонт записи (дней вперёд)</label>
            <input className="form-input" style={inp} type="number" min="7" max="90"
              value={settings.booking_window_days} onChange={e => set('booking_window_days', +e.target.value)} />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              Как далеко вперёд можно записаться
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label style={labelStyle}>Макс. записей на один день/слот</label>
            <input className="form-input" style={inp} type="number" min="1" max="50"
              value={settings.max_per_slot} onChange={e => set('max_per_slot', +e.target.value)} />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              При достижении лимита день блокируется
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div onClick={() => set('show_teacher', !settings.show_teacher)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: settings.show_teacher ? T.green : T.border,
                position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute',
                  top: 3, left: settings.show_teacher ? 21 : 3, transition: 'left 0.2s' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Показывать педагога</div>
                <div style={{ fontSize: 11, color: T.muted }}>Клиент видит имя преподавателя</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Поля формы */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>📋 Поля формы записи</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Выберите что спрашивать у клиента при записи</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DEFAULT_FIELDS.map(f => {
            const enabled = settings.required_fields.includes(f.key)
            return (
              <div key={f.key} onClick={() => !f.locked && toggleField(f.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                  background: enabled ? T.greenBg : T.cream, border: `1.5px solid ${enabled ? T.green : T.border}`,
                  cursor: f.locked ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: enabled ? T.green : 'white',
                  border: `2px solid ${enabled ? T.green : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {enabled && <span style={{ color: 'white', fontSize: 12, fontWeight: 800 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: enabled ? T.greenDark : T.ink }}>{f.label}</span>
                  {f.locked && <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>(обязательное)</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Кнопка сохранить внизу */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 40 }}>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ minWidth: 160, justifyContent: 'center' }}>
          {saving ? 'Сохраняем...' : saved ? '✅ Сохранено!' : '💾 Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}
