import { useRef, useEffect } from 'react'
import { T } from '../styles.jsx'

const MODES = [
  { key: 'fill',    title: 'Дополнить',  hint: 'Заполним только пустые поля. Заполненное в CRM не тронем' },
  { key: 'replace', title: 'Заменить',   hint: 'Данные из файла перекроют CRM. Пустые ячейки файла ничего не затирают' },
  { key: 'skip',    title: 'Пропустить', hint: 'Совпадения не трогаем, добавим только новых' },
]

export default function ImportPreviewModal({ plan, mode, onModeChange, onToggle, onToggleAll, onConfirm, onCancel, busy }) {
  const downRef = useRef(false)
  const open = !!plan

  // Escape закрывает, фон не прокручивается. Во время записи не закрываем.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, busy, onCancel])

  if (!plan) return null

  const { items, stats } = plan
  const visible = mode === 'skip' ? items.filter((i) => i.action === 'create') : items
  const actionable = visible.filter((i) => i.action !== 'same')
  const chosen = actionable.filter((i) => i.selected).length
  const allOn = actionable.length > 0 && actionable.every((i) => i.selected)

  const badge = (a) =>
    a === 'create'
      ? { text: 'новый', bg: T.greenBg, fg: T.greenDark }
      : a === 'update'
        ? { text: 'дополним', bg: '#fff4e0', fg: '#a86a1a' }
        : { text: 'без изменений', bg: '#efefef', fg: '#8a8a8a' }

  return (
    <div
      onMouseDown={(e) => { downRef.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (downRef.current && e.target === e.currentTarget && !busy) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: T.white, borderRadius: 16, width: '100%', maxWidth: 720,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 18px 10px' }}>
          <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 17, color: T.ink }}>
            Проверьте, что загрузим
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
            <Stat n={stats.create} label="новых" bg={T.greenBg} fg={T.greenDark} />
            <Stat n={stats.update} label="дополним" bg="#fff4e0" fg="#a86a1a" />
            <Stat n={stats.same} label="без изменений" bg="#efefef" fg="#8a8a8a" />
            {stats.warn > 0 && <Stat n={stats.warn} label="с замечаниями" bg={T.redLight} fg={T.red} />}
          </div>
        </div>

        <div style={{ padding: '0 18px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            Что делать с теми, кто уже есть в CRM
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => onModeChange(m.key)}
                disabled={busy}
                style={{
                  padding: '7px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: busy ? 'default' : 'pointer',
                  border: `1.5px solid ${mode === m.key ? T.green : T.border}`,
                  background: mode === m.key ? T.greenBg : T.white,
                  color: mode === m.key ? T.greenDark : T.muted,
                }}
              >
                {m.title}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
            {MODES.find((m) => m.key === mode)?.hint}
          </div>
        </div>

        <div style={{ padding: '0 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allOn} onChange={() => onToggleAll(!allOn)} disabled={busy || !actionable.length} />
            Выбрать все
          </label>
          <div style={{ fontSize: 13, color: T.muted }}>отмечено: {chosen}</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 18px', borderTop: `1px solid ${T.border}` }}>
          {visible.map((it) => {
            const b = badge(it.action)
            return (
              <div key={it.id} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={it.selected}
                  disabled={busy || it.action === 'same'}
                  onChange={() => onToggle(it.id)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{it.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: b.bg, color: b.fg }}>
                      {b.text}
                    </span>
                    {it.phone && <span style={{ fontSize: 12, color: T.muted }}>{it.phone}</span>}
                  </div>
                  {it.changes.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                      {c.label}: <span style={{ color: '#bbb' }}>{c.from}</span> → <b style={{ color: T.ink }}>{c.to}</b>
                    </div>
                  ))}
                  {it.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#c98a1a', marginTop: 2 }}>⚠ {w}</div>
                  ))}
                </div>
              </div>
            )
          })}
          {!visible.length && (
            <div style={{ padding: 20, textAlign: 'center', color: T.muted, fontSize: 13 }}>Нечего загружать</div>
          )}
        </div>

        <div style={{ padding: 14, display: 'flex', gap: 8, borderTop: `1px solid ${T.border}` }}>
          <button className="btn btn-outline" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>Отмена</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy || !chosen} style={{ flex: 2 }}>
            {busy ? '⏳ Загружаем...' : `Загрузить (${chosen})`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, label, bg, fg }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>
      {n} {label}
    </span>
  )
}
