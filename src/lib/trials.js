// =====================================================================
// lib/trials.js — правила про пробные занятия
//
// Здесь живут два решения, которые студия настраивает под себя:
//   • можно ли прийти на пробное повторно  (trial_repeat_policy)
//   • когда убирать невернувшегося в архив (trial_archive_after_days)
//
// Оба вынесены сюда чистыми функциями специально. Внутри страницы,
// вперемешку с запросами к базе, их нечем было бы поймать: в заходе 9
// уже случилось так, что тесты покрывали расчёт, а ошибка сидела в том,
// что этот расчёт готовило. Здесь решение отделено от исполнения.
// =====================================================================

// Сколько пробных уже было у человека — из его разовых записей.
// Отменённые не считаем: запись отменили, занятия не было.
export function countTrials(enrollments, clientId, directionId) {
  const mine = (enrollments || []).filter(e =>
    e.client_id === clientId && e.status !== 'cancelled')
  return {
    total: mine.length,
    inDirection: mine.filter(e => e.direction_id === directionId).length,
  }
}

/**
 * Можно ли записать этого человека на ещё одно пробное.
 *
 * Возвращает { allow, needConfirm, message }:
 *   allow = false        — записывать нельзя, показать message;
 *   needConfirm = true   — можно, но спросить, показав message;
 *   иначе                — записывать молча.
 *
 * Ограничение считает ЗАНЯТИЯ, а не карточки: один человек — всегда один
 * клиент, сколько бы пробных он ни посетил.
 */
export function checkTrialRepeat({ policy = 'warn', counts, directionName = 'этому направлению' }) {
  const { total = 0, inDirection = 0 } = counts || {}
  if (total === 0) return { allow: true }

  switch (policy) {
    case 'always':
      return { allow: true }

    case 'once':
      return {
        allow: false,
        message: `У этого ребёнка уже было пробное. Настройки студии разрешают только одно — измените их в «Справочниках» или запишите его обычной записью.`,
      }

    case 'per_direction':
      if (inDirection === 0) return { allow: true }
      return {
        allow: false,
        message: `По направлению «${directionName}» пробное уже было. Настройки студии разрешают по одному на направление.`,
      }

    case 'warn':
    default:
      return {
        allow: true,
        needConfirm: true,
        message: total === 1
          ? 'У этого ребёнка уже было одно пробное занятие. Записать ещё одно?'
          : `У этого ребёнка уже было ${total} пробных занятия. Записать ещё одно?`,
      }
  }
}

// Остаток занятий у клиента. Копия правила из lib/balance.js, но по одному
// клиенту и без плашки: здесь нужен только знак числа.
// ⚠️ Правило расчёта живёт в трёх местах (ещё в боте) — меняя, править везде.
function lessonsLeft(client, payments, today) {
  const mine = (payments || []).filter(p => p.client_id === client.id)
  const active = mine.filter(p => !p.expires_at || String(p.expires_at).slice(0, 10) >= today)
  const paid = active.reduce((s, p) => s + (+p.lessons_count || 0), 0)
  return (+client.paid_lessons || 0) + paid - (+client.visited_lessons || 0)
}

/**
 * Кого из пробных пора убрать в архив.
 *
 * Правила, каждое выучено на конкретной неприятности:
 *
 * 1. Срок считается от ПОСЛЕДНЕГО события — отметки, записи на занятие
 *    или дня заведения. Не от даты создания: пробное, записанное
 *    на следующий вторник, успело бы уйти в архив до самого занятия.
 *
 * 2. Долг архив не пускает. У архивного сняты все галочки, оплату принять
 *    нельзя — архивируя должника, мы прячем его долг. Так же устроен
 *    автоархив уволенного педагога: он уходит, когда с ним рассчитались.
 *
 * 3. Пустой срок (null) означает «никогда». Новая функция не должна сама
 *    начинать архивировать у тех, кто её не просил.
 *
 * Возвращает [{ id, name, lastSeen }] — кого архивировать.
 */
export function planTrialArchive({
  clients = [], payments = [], lastEventByClient = {},
  trialName, days, today,
}) {
  if (!days || !trialName || !today) return []

  // Граница: последнее событие строго раньше неё — значит просрочено
  const edge = new Date(today + 'T00:00:00Z')
  edge.setUTCDate(edge.getUTCDate() - days)
  const edgeStr = edge.toISOString().slice(0, 10)

  return clients
    .filter(c => c.status === trialName)
    .map(c => {
      const created = String(c.created_at || '').slice(0, 10)
      const lastSeen = lastEventByClient[c.id] || created || today
      return { id: c.id, name: c.child_name, lastSeen, client: c }
    })
    .filter(x => x.lastSeen && x.lastSeen < edgeStr)
    .filter(x => lessonsLeft(x.client, payments, today) >= 0)
    .map(({ client, ...rest }) => rest)
}

/**
 * Подмести просроченных пробных при входе в CRM.
 *
 * Отдельного планировщика в проекте нет: единственный крон живёт
 * в репозитории бота, это другой деплой. Подметание при открытии
 * дешевле и не требует ни новой инфраструктуры, ни секрета. Минус
 * честный: если в CRM никто не заходит, никто и не архивируется —
 * для архивации это безвредно.
 *
 * Ошибки не показываем: это фоновая уборка, а не действие человека.
 * Не получилось сегодня — получится в следующий заход.
 *
 * Возвращает id заархивированных: вызывающий поправит свой список на месте,
 * без перезагрузки всей страницы.
 */
export async function sweepStaleTrials({ supabase, studioId, clients, payments, trialName, archiveName, days, today }) {
  if (!supabase || !studioId || !days || !trialName || !archiveName) return []

  const trialIds = (clients || []).filter(c => c.status === trialName).map(c => c.id)
  if (trialIds.length === 0) return []

  const [enr, att] = await Promise.all([
    supabase.from('enrollments').select('client_id, date')
      .eq('studio_id', studioId).in('client_id', trialIds).neq('status', 'cancelled'),
    supabase.from('attendance').select('client_id, date')
      .eq('studio_id', studioId).in('client_id', trialIds),
  ])
  if (enr.error || att.error) return []

  const lastEventByClient = {}
  ;[...(enr.data || []), ...(att.data || [])].forEach(r => {
    const d = String(r.date || '').slice(0, 10)
    if (!d) return
    if (!lastEventByClient[r.client_id] || d > lastEventByClient[r.client_id]) {
      lastEventByClient[r.client_id] = d
    }
  })

  const toArchive = planTrialArchive({ clients, payments, lastEventByClient, trialName, days, today })
  if (toArchive.length === 0) return []

  const ids = toArchive.map(x => x.id)
  const { error } = await supabase.from('clients')
    .update({ status: archiveName })
    .in('id', ids).eq('studio_id', studioId)
  return error ? [] : ids
}
