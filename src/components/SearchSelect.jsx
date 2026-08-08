import { useState, useRef, useEffect, useMemo } from 'react'
import { T } from '../styles.jsx'

/**
 * Выпадающий список с поиском.
 * Заменяет <select> там, где вариантов много и листать неудобно.
 *
 * Начинаешь печатать — список фильтруется. Стрелки ↑↓ ходят по вариантам,
 * Enter выбирает, Escape закрывает.
 *
 * options: [{ value, label, hint }]
 *   value — то, что уйдёт в onChange (число или строка)
 *   label — основная строка
 *   hint  — необязательная серая приписка справа
 */
export function SearchSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Начните вводить…',
  emptyText = 'Ничего не найдено',
  allowClear = true,
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value)) || null

  // Фильтрация без учёта регистра; ищем по label и по hint,
  // чтобы «Соколова» находила ребёнка по фамилии родителя.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      String(o.label || '').toLowerCase().includes(q) ||
      String(o.hint || '').toLowerCase().includes(q)
    )
  }, [options, query])

  useEffect(() => { setCursor(0) }, [query, open])

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [open])

  // Держим подсвеченный пункт в зоне видимости
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[cursor]
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  const pick = (opt) => {
    onChange(opt ? opt.value : '')
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setCursor(c => Math.min(c + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[cursor]) { e.preventDefault(); pick(filtered[cursor]) }
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery('')
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="form-input"
          autoFocus={autoFocus}
          value={open ? query : (selected?.label || '')}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
          onKeyDown={onKeyDown}
          // 16px — иначе iOS Safari зумит страницу при фокусе
          style={{ fontSize: 16, paddingRight: selected && allowClear ? 34 : 30 }}
        />
        {selected && allowClear ? (
          <button type="button" onClick={() => pick(null)} title="Очистить"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 15, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        ) : (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            color: T.muted, fontSize: 10, pointerEvents: 'none' }}>▼</span>
        )}
      </div>

      {open && (
        <div ref={listRef}
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: 'white', border: `1.5px solid ${T.border}`, borderRadius: 12,
            maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: T.muted }}>{emptyText}</div>
          )}
          {filtered.map((o, i) => (
            <div key={String(o.value)}
              onMouseDown={e => { e.preventDefault(); pick(o) }}
              onMouseEnter={() => setCursor(i)}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                background: i === cursor ? T.greenBg : 'transparent',
                color: i === cursor ? T.greenDark : T.ink,
                fontWeight: String(o.value) === String(value) ? 700 : 400 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.hint && <span style={{ fontSize: 12, color: T.muted, flexShrink: 0 }}>{o.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Числовое поле без «бесячего нуля».
 * Обычный <input type="number" value={0}> показывает 0, и при вводе
 * получается «06». Здесь ноль показывается плейсхолдером, а не значением.
 */
export function NumberInput({ value, onChange, placeholder = '0', min, max, style, ...rest }) {
  const shown = (value === 0 || value === '0' || value === null || value === undefined) ? '' : String(value)
  return (
    <input
      className="form-input"
      type="number"
      inputMode="numeric"
      value={shown}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={e => {
        const raw = e.target.value
        if (raw === '') { onChange(0); return }
        let n = Number(raw)
        if (Number.isNaN(n)) return
        if (min !== undefined && n < min) n = min
        if (max !== undefined && n > max) n = max
        onChange(n)
      }}
      onFocus={e => e.target.select()}
      style={{ fontSize: 16, ...style }}
      {...rest}
    />
  )
}
