import { useRef, useEffect } from 'react'

// Сколько модалок открыто одновременно: вложенная модалка не должна
// снимать блокировку скролла с фона, когда закрывается сама.
let openCount = 0

export function Modal({ title, onClose, children, footer, large }) {
  // Закрываем только когда клик НАЧАЛСЯ на подложке.
  // Раньше проверялся click, а его цель — общий предок mousedown и mouseup:
  // выделяешь мышкой сумму в поле, отпускаешь чуть за краем модалки —
  // и click приходит на подложку, окно закрывается вместе с введённым.
  const downOnBackdrop = useRef(false)
  const boxRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Escape закрывает, фон под модалкой не прокручивается
  useEffect(() => {
    openCount++
    document.body.classList.add('modal-open')
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) document.body.classList.remove('modal-open')
    }
  }, [])

  // Фокус-трап: Tab не уводит за пределы окна
  const onKeyDown = (e) => {
    if (e.key !== 'Tab' || !boxRef.current) return
    const items = boxRef.current.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div ref={boxRef} className={`modal ${large ? 'modal-lg' : ''}`}
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        onKeyDown={onKeyDown}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
