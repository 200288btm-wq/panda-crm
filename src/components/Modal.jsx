import { useRef } from 'react'

export function Modal({ title, onClose, children, footer, large }) {
  // Закрываем только когда клик НАЧАЛСЯ на подложке.
  // Раньше проверялся click, а его цель — общий предок mousedown и mouseup:
  // выделяешь мышкой сумму в поле, отпускаешь чуть за краем модалки —
  // и click приходит на подложку, окно закрывается вместе с введённым.
  const downOnBackdrop = useRef(false)
  return (
    <div className="modal-backdrop"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${large ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
