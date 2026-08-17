// =====================================================================
// Баланс занятий клиента — единая точка расчёта.
//
// Зачем отдельный файл: расчёт жил в трёх местах фронта (список клиентов,
// карточка клиента, дашборд) и в двух местах бота. Дашборд считал БЕЗ
// фильтра по expires_at — клиент со сгоревшим абонементом в карточке был
// в минусе, а в списке должников на дашборде не появлялся (баг 35).
//
// Правило: сгоревшая оплата не даёт занятий. Оплата без срока действует
// всегда. Та же логика в боте — uchteno-bot/lib/helpers.js и
// api/cron/notifications.js; при изменении править и там.
// =====================================================================
import { todayLocal } from '../styles.jsx'

/** Оплата ещё действует: срок не задан или не прошёл. */
export const isPaymentActive = (p, today = todayLocal()) =>
  !p?.expires_at || p.expires_at >= today

/** Остаток занятий → подпись и цвет плашки. */
export const calcBalance = (paid, visited) => {
  const p = +paid || 0
  const v = +visited || 0
  const left = p - v
  if (left <= 0) return { left, status: 'debt', label: 'Требуется оплата', color: '#e05a5a', bg: '#fde8e8' }
  if (left === 1) return { left, status: 'warn', label: 'Последнее занятие', color: '#c47a00', bg: '#fff4e6' }
  return { left, status: 'ok', label: `Осталось ${left} зан.`, color: '#5a9070', bg: '#e8f4ed' }
}

/**
 * Реальный баланс клиента по уже загруженному списку оплат студии.
 * paid_lessons — стартовое значение (импорт, ручная правка),
 * к нему прибавляются занятия из действующих оплат, минус посещения.
 */
export const calcRealBalance = (client, payments = [], today = todayLocal()) => {
  const paidFromPayments = (payments || [])
    .filter(p => p.client_id === client.id)
    .filter(p => isPaymentActive(p, today))
    .reduce((s, p) => s + (+p.lessons_count || 0), 0)
  const totalPaid = (client.paid_lessons || 0) + paidFromPayments
  const totalVisited = client.visited_lessons || 0
  return { totalPaid, totalVisited, bal: calcBalance(totalPaid, totalVisited) }
}

/**
 * То же, но оплаты уже отфильтрованы по клиенту (карточка грузит их
 * отдельным запросом). Возвращает суммы без плашки.
 */
export const sumPaidLessons = (clientPayments = [], startValue = 0, today = todayLocal()) =>
  (clientPayments || [])
    .filter(p => isPaymentActive(p, today))
    .reduce((s, p) => s + (+p.lessons_count || 0), (+startValue || 0))
