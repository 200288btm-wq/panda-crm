import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from './Modal'
import { registerUi } from '../lib/ui'

// Окно подтверждения и плашки-сообщения. Монтируется один раз в App.jsx,
// вызывается через lib/ui.js откуда угодно.
export default function UiHost() {
  const [toasts, setToasts] = useState([])
  const [ask, setAsk] = useState(null)   // { opts, resolve }
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const timers = useRef({})

  const remove = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id))
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
  }, [])

  const pushToast = useCallback((kind, text, details) => {
    const id = ++seq.current
    setToasts(list => {
      // Больше четырёх плашек одновременно — верхние уезжают
      const next = [...list, { id, kind, text, details }]
      return next.slice(-4)
    })
    // Ошибку читают дольше, чем «сохранено»
    timers.current[id] = setTimeout(() => remove(id), kind === 'error' ? 7000 : 3500)
  }, [remove])

  const confirm = useCallback((opts) => new Promise(resolve => {
    setBusy(false)
    setAsk({ opts: opts || {}, resolve })
  }), [])

  useEffect(() => registerUi({ pushToast, confirm }), [pushToast, confirm])
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  const close = (result) => {
    if (ask) ask.resolve(result)
    setAsk(null)
    setBusy(false)
  }

  const o = ask?.opts || {}

  return (
    <>
      {ask && (
        <Modal title={o.title || 'Подтвердите действие'} onClose={() => close(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => close(false)} disabled={busy}>
              {o.cancelLabel || 'Отмена'}
            </button>
            <button
              className="btn btn-primary"
              style={o.danger ? { background: T_RED } : undefined}
              disabled={busy}
              onClick={() => { setBusy(true); close(true) }}
            >
              {o.confirmLabel || 'Подтвердить'}
            </button>
          </>}>
          {o.text && <div style={{ fontSize: 14, lineHeight: 1.6 }}>{o.text}</div>}
          {o.details && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, lineHeight: 1.5 }}>{o.details}</div>
          )}
        </Modal>
      )}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => remove(t.id)} role="status">
            <span className="toast-icon">{t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️'}</span>
            <div className="toast-body">
              <div className="toast-text">{t.text}</div>
              {/* Техническая строка остаётся видимой мелким шрифтом:
                  без неё диагностика на живых данных становится вслепую */}
              {t.details && <div className="toast-details">{t.details}</div>}
            </div>
            <button className="toast-close" onClick={(e) => { e.stopPropagation(); remove(t.id) }} aria-label="Закрыть">✕</button>
          </div>
        ))}
      </div>
    </>
  )
}

const T_RED = '#e05a5a'
