import { T } from '../styles.jsx'
import { Modal } from './Modal'

// Одно окно на оба исхода: есть история — предлагаем архив, нет — даём
// удалить. Решение принимается по фактическим данным, а не по статусу.
//
// Почему нельзя удалять историю: начисления и балансы нигде не хранятся,
// они считаются заново из журнала и отметок. Снос записи молча переписал
// бы прошлое — у детей вернулись бы списанные занятия, у педагогов
// пропали начисления, из финансов исчезли бы выплаченные суммы.

const WORDING = {
  teacher: {
    what: 'педагога',
    deleteTitle: 'Удалить педагога',
    alsoDeleted: 'Вместе с карточкой удалятся заданные ставки.',
    archiveNote: 'В архиве он пропадёт из активного списка, а расчёты, отчёты и история выплат останутся как есть.',
    alreadyArchived: 'Педагог уже в архиве.',
  },
  direction: {
    what: 'направление',
    deleteTitle: 'Удалить направление',
    alsoDeleted: 'Вместе с направлением удалятся его подгруппы и расписание.',
    archiveNote: 'В архиве оно пропадёт из расписания и списков, но прошлые занятия в календаре и журнале останутся видимыми.',
    alreadyArchived: 'Направление уже в архиве.',
  },
}

export default function DeleteOrArchiveModal({ ask, kind = 'teacher', busy, onClose, onArchive, onDelete }) {
  const w = WORDING[kind] || WORDING.teacher
  const { name, loading, traces, archived } = ask
  const hasHistory = !!traces && traces.total > 0
  const failed = !!traces && traces.errors.length > 0

  return (
    <Modal title={hasHistory ? 'Убрать в архив' : w.deleteTitle} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Отмена</button>
        {!loading && !failed && (hasHistory
          ? (!archived && (
              <button className="btn btn-primary" onClick={onArchive} disabled={busy}>
                {busy ? 'Убираем…' : '📦 В архив'}
              </button>
            ))
          : (
              <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
                {busy ? 'Удаляем…' : '🗑️ Удалить'}
              </button>
            )
        )}
      </>}>
      {loading && (
        <div style={{ fontSize: 14, color: T.muted }}>Смотрим, что числится за карточкой…</div>
      )}

      {/* Сбой проверки нельзя трактовать как «истории нет»: молча удалить
          из-за проблем с сетью — худший возможный исход */}
      {!loading && failed && (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: T.red }}>
          Не удалось проверить историю, поэтому ничего не трогаем. Попробуйте ещё раз.
          <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{traces.errors.join('; ')}</div>
        </div>
      )}

      {!loading && !failed && hasHistory && (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
          За записью <strong>{name}</strong> числится история:
          <div style={{ background: T.cream, borderRadius: 12, padding: '12px 14px', margin: '12px 0' }}>
            {traces.details.map(d => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                <span style={{ color: T.muted }}>{d.label}</span>
                <b>{d.count}</b>
              </div>
            ))}
          </div>
          Удалить нельзя: занятия и начисления считаются заново из журнала
          и отметок, поэтому вместе с записью исчезла бы часть прошлого.
          {archived
            ? <div style={{ marginTop: 10, color: T.muted, fontSize: 13 }}>{w.alreadyArchived}</div>
            : <div style={{ marginTop: 10 }}>{w.archiveNote}</div>}
        </div>
      )}

      {!loading && !failed && !hasHistory && (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
          За записью <strong>{name}</strong> ничего не числится — ни занятий,
          ни оплат. Её можно удалить насовсем.
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>
            {w.alsoDeleted} Отменить не получится.
          </div>
        </div>
      )}
    </Modal>
  )
}
