// =====================================================================
// Состав занятий: кто на каком занятии.
//
// Правила живут в ОДНОМ месте — функции базы schedule_lessons
// (заход 12, баг 54). По ней шлёт напоминания бот, по ней же с захода 13
// рисует состав календарь CRM. Здесь правил нет: только раскладка
// готового ответа базы по занятиям сетки.
//
// Что осталось в браузере и почему:
//   - КОГДА занятие (разбор строки «Пн/Ср 17:30») — сетке нужны и пустые
//     занятия, а база возвращает только строки с детьми. Разбор тот же,
//     что schedule_slots в базе; строки состава привязываются к занятию
//     по дате, направлению и подгруппе, а не по времени.
//   - фильтры экрана (педагог, адрес, ребёнок, подгруппы) — это вид,
//     а не правило.
//
// Строка базы, которой не нашлось занятия в сетке, не выкидывается
// молча: её считает orphanCount, и календарь говорит об этом вслух.
// =====================================================================

/** Ключ занятия: дата + направление + подгруппа (0 — без подгрупп). */
export const lessonKey = (ds, dirId, groupId) => `${ds}|${dirId}|${groupId || 0}`

// Supabase отдаёт за один запрос не больше 1000 строк (max_rows) и молча
// обрезает остальное. Месяц Панды — ~3000 строк «ребёнок на занятии»:
// без постраничной загрузки календарь показывал детей только в первые
// дни месяца, а дальше «0/0» (заход 13, нашлось на живом).
//
// Грузим страницами, пока не соберём столько, сколько база насчитала
// (count: 'exact'). Не сошлось — это ошибка, а не «детей нет».
export const LESSONS_PAGE = 1000

export async function fetchAllLessons(client, studioId, from, to) {
  const args = { p_studio_id: studioId, p_from: from, p_to: to }
  const rows = []
  let total = null
  for (let page = 0; page < 100; page++) {
    const start = rows.length
    const { data, error, count } = await client
      // Сколько всего — спрашиваем один раз: подсчёт гоняет функцию ещё раз
      .rpc('schedule_lessons', args, page === 0 ? { count: 'exact' } : {})
      .range(start, start + LESSONS_PAGE - 1)
    if (error) return { data: null, error }
    if (total === null) total = count
    rows.push(...(data || []))
    if (total == null) {
      // Сервер не сказал, сколько всего: читаем до пустой страницы
      if (!data || data.length === 0) return { data: rows, error: null }
      continue
    }
    if (rows.length >= total) return { data: rows, error: null }
    if (!data || data.length === 0) break
  }
  return { data: null, error: { message: `состав загрузился не целиком: ${rows.length} из ${total ?? '?'}` } }
}

/** Ещё ничего не загружено. */
export const EMPTY_LESSONS = Object.freeze({
  loaded: false, from: null, to: null, index: new Map(), byId: new Map(), rank: new Map(),
})

/**
 * Разложить ответ schedule_lessons по занятиям.
 * rows      — строки функции: lesson_date, direction_id, group_id, client_id, one_off
 * clients   — ВСЕ клиенты студии (не отфильтрованные по статусу: кто
 *             в расписании, уже решила база)
 * extra     — заведённые только что и ещё не доехавшие до списка клиентов
 */
export function buildLessons(rows, from, to, clients = [], extra = []) {
  const index = new Map()
  for (const r of rows || []) {
    const k = lessonKey(String(r.lesson_date).slice(0, 10), r.direction_id, r.group_id)
    if (!index.has(k)) index.set(k, [])
    index.get(k).push({ client_id: r.client_id, one_off: !!r.one_off })
  }
  const byId = new Map()
  const rank = new Map()
  clients.forEach((c, i) => { byId.set(c.id, c); rank.set(c.id, i) })
  extra.forEach(c => { if (!byId.has(c.id)) { byId.set(c.id, c); rank.set(c.id, clients.length + rank.size) } })
  return { loaded: true, from, to, index, byId, rank }
}

/** Загружен ли состав на этот день. */
export const lessonsReady = (lessons, ds) =>
  !!lessons?.loaded && ds >= lessons.from && ds <= lessons.to

/**
 * Ученики занятия. null — состав на этот день ещё не загружен
 * (или загрузка не удалась): показывать «…», а не «0 человек».
 *
 * Порядок как был в календаре: сначала постоянные в порядке списка
 * клиентов, за ними разовые.
 */
export function studentsOf(lessons, ds, dirId, groupId) {
  if (!lessonsReady(lessons, ds)) return null
  const rows = lessons.index.get(lessonKey(ds, dirId, groupId)) || []
  const list = rows.map(r => {
    // Ребёнка нет в загруженном списке клиентов — редкость (список
    // обновляется фоном). Не прячем: база сказала, что он на занятии
    const c = lessons.byId.get(r.client_id) ||
      { id: r.client_id, child_name: `Клиент №${r.client_id}`, _missing: true }
    return r.one_off ? { ...c, _oneOff: true } : c
  })
  const rk = (s) => lessons.rank.has(s.id) ? lessons.rank.get(s.id) : Number.MAX_SAFE_INTEGER
  return list.sort((a, b) => (!!a._oneOff - !!b._oneOff) || rk(a) - rk(b) || a.id - b.id)
}

/**
 * Сколько строк состава не легло ни на одно занятие сетки.
 * eventKeys — ключи всех занятий периода БЕЗ фильтров экрана.
 */
export function orphanCount(lessons, eventKeys) {
  if (!lessons?.loaded) return 0
  let n = 0
  for (const [k, rows] of lessons.index) if (!eventKeys.has(k)) n += rows.length
  return n
}

/** Сетка месяца целиком неделями (Пн…Вс): покрывает и вид «неделя» на стыке месяцев. */
export function monthGridRange(date, dateStr) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const from = new Date(first); from.setDate(first.getDate() - (first.getDay() + 6) % 7)
  const to = new Date(last); to.setDate(last.getDate() + (7 - last.getDay()) % 7)
  return { from: dateStr(from), to: dateStr(to) }
}
