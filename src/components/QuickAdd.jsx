import { useState } from 'react'
import { T } from '../styles.jsx'

// Мелкая ссылка «+ добавить», которая разворачивается в строку полей.
// Нужна там, где человек заполняет форму и упирается в пустой справочник:
// уходить в Настройки — значит потерять введённое.
//
// Запись делает НЕ этот компонент: он вызывает onCreate из
// src/lib/dictionaries.js, ту же функцию, что и страница справочников.
// Здесь только интерфейс.
//
// onCreate(values) должен вернуть { row, error, existed }.
// row — строка из базы; её и отдаём наверх, ничего не додумывая.
export function QuickAdd({ label, fields, onCreate, onCreated }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const reset = () => { setValues({}); setError(null); setSaving(false) }

  const close = () => { setOpen(false); reset() }

  const save = async () => {
    setSaving(true); setError(null)
    const { row, error: err, existed } = await onCreate(values)
    setSaving(false)
    if (err) { setError(err); return }
    close()
    onCreated && onCreated(row, existed)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, cursor: 'pointer',
                 fontSize: 11, fontWeight: 700, color: T.green, fontFamily: 'inherit' }}>
        + {label}
      </button>
    )
  }

  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: 'white',
                  border: `1.5px solid ${T.green}`, borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {fields.map(fl => (
          <input key={fl.key} className="form-input"
            value={values[fl.key] || ''}
            onChange={e => setValues(p => ({ ...p, [fl.key]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close() }}
            placeholder={fl.placeholder}
            autoFocus={fl === fields[0]}
            style={{ flex: fl.flex || 1, minWidth: fl.minWidth || 90, fontSize: 16, padding: '7px 10px' }} />
        ))}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: T.red, marginTop: 6, fontWeight: 600 }}>⚠️ {error}</div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}
          style={{ padding: '6px 14px', fontSize: 12 }}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}
          style={{ padding: '6px 14px', fontSize: 12 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}
