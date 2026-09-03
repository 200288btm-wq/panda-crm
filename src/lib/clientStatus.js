// =====================================================================
// lib/clientStatus.js — что статус клиента РАЗРЕШАЕТ, а не как он назван
//
// До 18.08.2026 поведение было зашито в названия: «Активен» проверялся
// строкой в восьми файлах, «Неактивен / Отказ / Негатив» — списком в
// ClientsPage. Переименование статуса в справочнике молча ломало
// подсчёты, а любой свой статус («VIP», «Пробное») делал ребёнка
// невидимым в расписании — без единого предупреждения.
//
// Теперь поведение живёт в самом справочнике, четырьмя галочками:
//
//   in_schedule  — виден в расписании и в отметках посещаемости
//   in_stats     — считается активным: метрика на дашборде,
//                  заполненность групп, блок задолженностей
//   in_payments  — доступен при заведении оплаты
//   in_list      — виден во вкладке «Все» списка клиентов
//
// Пять статусов системные и защищены триггером в базе
// (client_statuses.system_key): удалить, переименовать и переставить
// им галочки нельзя ни из интерфейса, ни запросом.
//
//   new      Новый                 — — ✓ ✓
//   trial    Пробное               ✓ — ✓ —   (виден в расписании
//                                             и считается педагогу,
//                                             но не в статистике
//                                             и не в общем списке)
//   active   Активен               ✓ ✓ ✓ ✓
//   paused   Временно отсутствует  — ✓ ✓ ✓   (в расписании нет,
//                                             но долг за ним виден)
//   archive  Архив                 — — — —   (нигде; чтобы принять
//                                             оплату, нужно вернуть)
//
// «Новый» и «Пробное» — разные состояния, а не синонимы. Новый пришёл
// из заявки, но никуда не поставлен; пробный записан на конкретное
// занятие конкретного дня. Слить их значило бы потерять счёт проведённых
// пробных, а включить «Новому» расписание — вывесить каждую заявку
// в каждое занятие направления как участника, которого можно отметить.
//
// Правило для кода: подсчёты и фильтры смотрят на ГАЛОЧКИ. Ключ
// system_key используется только там, где нужно конкретное действие —
// кнопка «В архив», счётчик «Новых» в меню, статус по умолчанию при
// конвертации заявки и импорте.
// =====================================================================

// Названия из одностудийной версии. Нужны только как запасной путь,
// пока справочник не приехал: без этого на первом рендере из
// расписания пропали бы все ученики разом.
const LEGACY_ACTIVE = 'Активен'
const LEGACY_HIDDEN = ['Неактивен', 'Отказ', 'Негатив']

// Статус, которого нет в справочнике: остался у импортированных и
// у старых записей. Показываем в списке, но в расписание и в деньги
// не пускаем — ровно так приложение вело себя и раньше.
const UNKNOWN = { in_schedule: false, in_stats: false, in_payments: true, in_list: true }

export const SYSTEM_KEYS = ['new', 'trial', 'active', 'paused', 'archive']

export const SYSTEM_FALLBACK = {
  new: 'Новый',
  trial: 'Пробное',
  active: 'Активен',
  paused: 'Временно отсутствует',
  archive: 'Архив',
}

/**
 * Индекс справочника: название → строка со всеми галочками.
 * Считать один раз на рендер (useMemo), а не в каждом filter.
 */
export function statusIndex(clientStatuses) {
  const map = new Map()
  ;(clientStatuses || []).forEach(s => { if (s && s.name) map.set(s.name, s) })
  return { map, legacy: map.size === 0 }
}

function flagsFor(idx, status) {
  if (!idx || idx.legacy) {
    return {
      in_schedule: status === LEGACY_ACTIVE,
      in_stats: status === LEGACY_ACTIVE,
      in_payments: true,
      in_list: !LEGACY_HIDDEN.includes(status),
    }
  }
  return idx.map.get(status) || UNKNOWN
}

export const inSchedule = (idx, status) => !!flagsFor(idx, status).in_schedule
export const inStats    = (idx, status) => !!flagsFor(idx, status).in_stats
export const inPayments = (idx, status) => !!flagsFor(idx, status).in_payments
export const inList     = (idx, status) => !!flagsFor(idx, status).in_list

/** Строка справочника с системной ролью. */
export function systemStatus(clientStatuses, key) {
  return (clientStatuses || []).find(s => s && s.system_key === key) || null
}

/**
 * Название статуса с системной ролью — для мест, где статус ставится
 * кодом (конвертация заявки, импорт, кнопка «В архив»).
 * Пока справочник не загрузился, отдаёт привычное название.
 */
export function systemStatusName(clientStatuses, key) {
  const row = systemStatus(clientStatuses, key)
  return (row && row.name) || SYSTEM_FALLBACK[key] || ''
}

/** Человеческое описание галочек — для подсказок в справочнике. */
export function describeFlags(s) {
  if (!s) return ''
  const on = []
  if (s.in_schedule) on.push('в расписании')
  if (s.in_stats) on.push('в расчётах')
  if (s.in_payments) on.push('в оплатах')
  if (s.in_list) on.push('в общем списке')
  return on.length ? on.join(' · ') : 'нигде не участвует'
}