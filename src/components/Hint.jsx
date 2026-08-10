import { useState, useEffect, useRef } from 'react'

// Значок вопроса рядом с подписью поля. Длинные пояснения раньше висели
// текстом под каждым полем — форма из-за них читалась как инструкция.
//
// На десктопе раскрывается при наведении, на телефоне — по нажатию:
// на тач-устройствах hover не срабатывает, и подсказка была бы недоступна.
//
// Оставлять текстом под полем стоит только предупреждения о последствиях —
// то, что человек должен прочитать, даже если ни на что не нажимал.
export function Hint({ text }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Закрываем по клику мимо и по Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="hint-wrap" ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button type="button" className="hint-btn" aria-expanded={open}
        aria-label="Подсказка"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}>
        ?
      </button>
      {open && <span className="hint-pop" role="tooltip">{text}</span>}
    </span>
  )
}
