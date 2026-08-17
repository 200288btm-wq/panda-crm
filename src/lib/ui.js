// =====================================================================
// Единая точка сообщений и подтверждений.
//
// Заменяет нативные alert() и confirm(): у них в заголовке стоит адрес
// сайта («panda-crm.vercel.app сообщает»), оформление системное, а на
// телефоне окно блокирует экран. Для white-label продукта чужой домен
// в окне — прямой вред.
//
// Пользоваться так:
//   import { toast, confirmAction } from '../lib/ui'
//   toast.success('Клиент сохранён')
//   toast.fromError(error, 'Не удалось сохранить клиента')
//   if (!await confirmAction({ title: 'Снять заморозку?', confirmLabel: 'Снять' })) return
//
// Вызывать можно откуда угодно, включая обработчики вне компонентов:
// окно рисует <UiHost /> из App.jsx, здесь только адрес доставки.
// =====================================================================

let host = null

/** Вызывается из UiHost при монтировании. Возвращает функцию отписки. */
export function registerUi(h) {
  host = h
  return () => { if (host === h) host = null }
}

function push(kind, text, details) {
  if (host?.pushToast) host.pushToast(kind, String(text ?? ''), details ? String(details) : null)
  // Если хост ещё не смонтирован (ранняя ошибка при загрузке) — не теряем
  // сообщение молча
  else console[kind === 'error' ? 'error' : 'log']('[ui]', text, details || '')
}

export const toast = {
  success: (text, details) => push('success', text, details),
  error:   (text, details) => push('error', text, details),
  info:    (text, details) => push('info', text, details),
  /** Ошибка Supabase/Postgres → человеческий текст, техника мелким шрифтом */
  fromError: (error, fallback) => push('error', humanError(error, fallback), error?.message || null),
}

/**
 * Подтверждение действия. Возвращает Promise<boolean>.
 * confirmLabel должен говорить, ЧТО произойдёт («Удалить», «Снять»),
 * а не «ОК» — иначе кнопка не отличается от нативной.
 */
export function confirmAction(opts = {}) {
  if (host?.confirm) return host.confirm(opts)
  // Запасной путь, если хост не смонтирован: лучше нативное окно, чем
  // молчаливое выполнение опасного действия
  return Promise.resolve(window.confirm(opts.text || opts.title || 'Подтвердите действие'))
}

// ── Ошибки на человеческом языке ────────────────────────────
// Postgres отдаёт текст вида «violates foreign key constraint
// "teacher_payouts_teacher_id_fkey"». Владельцу студии это читается как
// поломка программы.
const BY_CODE = {
  '23503': 'На эту запись ссылаются другие данные — сначала уберите связи или отправьте запись в архив.',
  '23505': 'Такая запись уже есть.',
  '23502': 'Не заполнено обязательное поле.',
  '22P02': 'Неверный формат данных.',
  '22007': 'Неверный формат даты.',
  '42501': 'Недостаточно прав для этого действия.',
  'PGRST301': 'Недостаточно прав для этого действия.',
  'PGRST116': 'Запись не найдена — возможно, её уже удалили.',
}

export function humanError(error, fallback = 'Не удалось выполнить действие') {
  if (!error) return fallback
  const code = error.code || error.status
  if (code && BY_CODE[code]) return BY_CODE[code]

  const msg = String(error.message || error)
  // Обрыв связи выглядит как «Failed to fetch» — про интернет, а не про данные
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
  }
  if (/duplicate key/i.test(msg)) return BY_CODE['23505']
  if (/foreign key/i.test(msg)) return BY_CODE['23503']
  if (/row-level security|permission denied/i.test(msg)) return BY_CODE['42501']
  if (/jwt|token|session/i.test(msg)) return 'Сессия истекла. Войдите заново.'
  return fallback
}
