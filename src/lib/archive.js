// Архив вместо удаления.
//
// Правило: запись, за которой числится история (проведённые занятия,
// отметки, деньги), не удаляется никогда — только уходит в архив.
// Удалить насовсем можно лишь пустую карточку: дубль или опечатку.
//
// Причина в том, что начисления нигде не хранятся, а считаются заново
// из журнала и отметок. Снос attendance тихо переписывает прошлое:
// у детей возвращаются списанные занятия, у педагогов пропадают
// начисления «по отметкам».

import { supabase } from '../supabase'

// Что считается «историей» для каждой сущности.
// Справочные привязки (ставки, подгруппы) сюда НЕ входят: сами по себе
// они удалению не мешают.
export const TEACHER_TRACES = [
  { table: 'teacher_work_log', column: 'teacher_id', label: 'занятий в журнале' },
  { table: 'attendance',       column: 'teacher_id', label: 'отметок посещаемости' },
  { table: 'teacher_payouts',  column: 'teacher_id', label: 'выплат' },
  { table: 'lesson_payments',  column: 'teacher_id', label: 'оплаченных занятий' },
]

export const DIRECTION_TRACES = [
  { table: 'attendance',       column: 'direction_id', label: 'отметок посещаемости' },
  { table: 'teacher_work_log', column: 'direction_id', label: 'занятий в журнале' },
  { table: 'lesson_payments',  column: 'direction_id', label: 'оплаченных занятий' },
  { table: 'enrollments',      column: 'direction_id', label: 'записей детей' },
]

export const CLIENT_TRACES = [
  { table: 'attendance', column: 'client_id', label: 'отметок посещаемости' },
  { table: 'payments',   column: 'client_id', label: 'оплат' },
]

// Подгруппа = занятие, поэтому истории за ней числится не меньше, чем
// за направлением. Ставки (teacher_rates) сюда не входят намеренно:
// ставка — справочник, а не история, и удаляется вместе с подгруппой.
//
// Тот же список продублирован проверкой в базе
// (block_delete_group_with_history). Здесь она нужна, чтобы человек
// увидел понятное объяснение ДО попытки удаления, а не ошибку после.
export const GROUP_TRACES = [
  { table: 'attendance',           column: 'group_id', label: 'отметок посещаемости' },
  { table: 'teacher_work_log',     column: 'group_id', label: 'занятий в журнале педагога' },
  { table: 'lesson_payments',      column: 'group_id', label: 'оплаченных занятий' },
  { table: 'enrollments',          column: 'group_id', label: 'записей детей' },
  { table: 'lesson_confirmations', column: 'group_id', label: 'подтверждений занятий' },
  { table: 'lesson_no_work',       column: 'group_id', label: 'пометок «никто не работал»' },
]

/**
 * Сколько истории числится за записью.
 * @returns {{ total: number, details: Array<{label: string, count: number}>, errors: string[] }}
 */
export async function countTraces(specs, id, studioId) {
  const results = await Promise.all(
    specs.map(async (s) => {
      let q = supabase.from(s.table).select('*', { count: 'exact', head: true }).eq(s.column, id)
      // Не у всех таблиц есть studio_id — фильтр только там, где он точно есть
      if (studioId && s.table !== 'enrollments') q = q.eq('studio_id', studioId)
      const { count, error } = await q
      return { label: s.label, count: count || 0, error: error?.message }
    })
  )
  return {
    total: results.reduce((sum, r) => sum + r.count, 0),
    details: results.filter((r) => r.count > 0),
    // Ошибку чтения нельзя трактовать как «истории нет»: молча удалить
    // из-за сбоя сети — худший исход
    errors: results.filter((r) => r.error).map((r) => `${r.label}: ${r.error}`),
  }
}

/** Убрать в архив / вернуть из архива */
export async function setArchived(table, id, studioId, archived) {
  const { data: u } = await supabase.auth.getUser()
  return supabase
    .from(table)
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      archived_by: archived ? u?.user?.id || null : null,
    })
    .eq('id', id)
    .eq('studio_id', studioId)
}

export const isArchived = (row) => !!row?.archived_at
