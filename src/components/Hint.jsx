import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// Значок вопроса рядом с подписью поля. Длинные пояснения раньше висели
// текстом под каждым полем — форма из-за них читалась как инструкция.
//
// Почему через портал: у модалки свой скролл (overflow-y: auto), и любое
// всплывающее окно внутри неё обрезается краем — что и было видно на
// «Макс. учеников». Поэтому подсказка рисуется в конец <body> с
// position: fixed и позиционируется по координатам значка.
//
// На десктопе раскрывается при наведении, на телефоне — по нажатию:
// на тач-устройствах hover не срабатывает, подсказка была бы недоступна.
export function Hint({ text }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  // Считаем координаты до отрисовки, чтобы не было прыжка
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return

    const btn = btnRef.current.getBoundingClientRect()
    const margin = 8
    const width = Math.min(260, window.innerWidth - margin * 2)

    // По умолчанию — под значком, выровнено по его левому краю
    let left = btn.left
    // Не вылезаем за правый край экрана
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
    if (left < margin) left = margin

    const height = popRef.current?.offsetHeight || 70
    let top = btn.bottom + 6
    let above = false
    // Снизу не помещается — показываем над значком
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, btn.top - height - 6)
      above = true
    }

    setPos({
      top, left, width, above,
      arrowLeft: Math.max(6, Math.min(btn.left - left + 2, width - 16)),
    })
  }, [open, text])

  // Закрываем по клику мимо, по Escape и при прокрутке
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <span className="hint-wrap"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}>
        <button type="button" className="hint-btn" ref={btnRef} aria-expanded={open}
          aria-label="Подсказка"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}>
          ?
        </button>
      </span>
      {open && createPortal(
        <span ref={popRef} className="hint-pop" role="tooltip"
          style={pos
            ? { top: pos.top, left: pos.left, width: pos.width, visibility: 'visible' }
            : { top: -9999, left: -9999, visibility: 'hidden' }}>
          {text}
          {pos && (
            <span className="hint-arrow"
              style={{ left: pos.arrowLeft, [pos.above ? 'bottom' : 'top']: -5 }} />
          )}
        </span>,
        document.body
      )}
    </>
  )
}
