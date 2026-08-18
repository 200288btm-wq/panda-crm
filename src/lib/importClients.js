// План импорта клиентов: что создадим, что дополним, что трогать нельзя.
// Ничего не пишет в базу — только считает. Запись — applyClientsPlan.

import { parseDate, normPhone, phoneKey, normName, pick, asStr, asNum, isEmptyVal } from './importParse'
import { systemStatusName } from './clientStatus'

const LABELS = {
  adult_name: 'Родитель',
  status: 'Статус',
  paid_lessons: 'Оплачено занятий',
  visited_lessons: 'Посещено занятий',
  discount: 'Скидка %',
  birthday: 'Дата рождения',
  source: 'Источник',
  comment: 'Комментарий',
}
// Числа — это баланс ребёнка. Обращаемся осторожнее, чем с текстом.
const NUMERIC = new Set(['paid_lessons', 'visited_lessons', 'discount'])

export const CLIENT_SELECT =
  'id, child_name, adult_name, contacts, status, paid_lessons, visited_lessons, discount, birthday, source, comment'

/**
 * @param mode 'fill'    — дополнить: пишем только в пустые поля базы
 *             'replace' — заменить: непустая ячейка файла перекрывает базу
 *                         (пустая ячейка НИКОГДА не затирает базу)
 *             'skip'    — совпадения не трогаем (фильтруется на применении)
 */
export function buildClientsPlan({ rows, existingClients, clientStatuses = [], mode = 'fill' }) {
  // Статус для строк, где колонка «Статус» пуста. Берётся по РОЛИ
  // справочника: студия могла назвать «Новый» иначе, и зашитая строка
  // завела бы клиентов со статусом-сиротой — вне всех подсчётов.
  const defaultStatus = systemStatusName(clientStatuses, 'new')
  // «Пропустить» отсекается при применении; для расчёта ведём себя как «дополнить»,
  // чтобы список изменений не пугал тем, чего не произойдёт.
  const effMode = mode === 'skip' ? 'fill' : mode
  const existing = (existingClients || []).map((c) => ({
    ...c,
    _name: normName(c.child_name),
    _phones: (c.contacts || [])
      .filter((x) => x && x.type === 'Телефон' && x.val)
      .map((x) => phoneKey(x.val))
      .filter(Boolean),
  }))

  const items = []
  const seenInFile = new Set()

  rows.forEach((row, idx) => {
    const name = asStr(pick(row, 'Имя ребёнка*', 'Имя ребёнка'))
    if (!name) return

    const warnings = []
    const phoneRaw = pick(row, 'Телефон*', 'Телефон')
    const pk = phoneKey(phoneRaw)
    const phone = normPhone(phoneRaw)
    const email = asStr(pick(row, 'Email'))
    if (phoneRaw && !pk) warnings.push(`телефон «${asStr(phoneRaw)}» не похож на номер — запишем как есть`)

    const bd = parseDate(pick(row, 'Дата рождения (ДД.ММ.ГГГГ)', 'Дата рождения (ГГГГ-ММ-ДД)', 'Дата рождения'))
    if (bd.error) warnings.push(`${bd.error} — запись добавим без даты рождения`)
    if (bd.warn) warnings.push(bd.warn)

    const vals = {
      adult_name: asStr(pick(row, 'Имя родителя')),
      status: asStr(pick(row, 'Статус')),
      paid_lessons: asNum(pick(row, 'Оплачено занятий')),
      visited_lessons: asNum(pick(row, 'Посещено занятий')),
      discount: asNum(pick(row, 'Скидка %')),
      birthday: bd.iso,
      source: asStr(pick(row, 'Источник')),
      comment: asStr(pick(row, 'Комментарий')),
    }

    // ── Ищем совпадение ─────────────────────────────────────
    // телефон + имя → тот же ребёнок;  только телефон → брат/сестра
    let match = null
    let matchKind = null
    if (pk) {
      const byPhone = existing.filter((c) => c._phones.includes(pk))
      match = byPhone.find((c) => c._name === normName(name)) || null
      if (match) matchKind = 'phone_name'
      else if (byPhone.length) {
        matchKind = 'sibling'
        warnings.push(`тот же телефон, что у «${byPhone[0].child_name}» — считаем вторым ребёнком в семье`)
      }
    }
    if (!match && matchKind !== 'sibling') {
      const byName = existing.filter((c) => c._name === normName(name))
      if (byName.length) {
        match = byName[0]
        matchKind = 'name_only'
        warnings.push('совпало только имя, телефон другой или пустой — проверьте, тот ли это ребёнок')
      }
    }

    // ── Повтор внутри самого файла ──────────────────────────
    const fileKey = pk ? `${pk}|${normName(name)}` : `n|${normName(name)}`
    const dupInFile = seenInFile.has(fileKey)
    seenInFile.add(fileKey)
    if (dupInFile) warnings.push('такая же строка уже была выше в файле')

    if (match) {
      const patch = {}
      const changes = []
      for (const k of Object.keys(vals)) {
        const to = vals[k]
        if (to === null || to === '') continue
        const from = match[k]
        if (NUMERIC.has(k)) {
          if (!(to > 0)) continue
          if (Number(from || 0) === Number(to)) continue
          if (effMode === 'fill' && Number(from || 0) !== 0) continue
        } else {
          if (!isEmptyVal(from) && String(from) === String(to)) continue
          if (effMode === 'fill' && !isEmptyVal(from)) continue
        }
        patch[k] = to
        changes.push({ label: LABELS[k], from: isEmptyVal(from) ? '—' : String(from), to: String(to) })
      }

      // Контакты — массив. Только добавляем недостающее, ничего не удаляем.
      const base = Array.isArray(match.contacts) ? [...match.contacts] : []
      const add = []
      if (phone && !base.some((x) => x && x.type === 'Телефон' && phoneKey(x.val) === pk)) {
        add.push({ type: 'Телефон', val: phone })
      }
      if (email && !base.some((x) => x && x.type === 'Email' && String(x.val).toLowerCase() === email.toLowerCase())) {
        add.push({ type: 'Email', val: email })
      }
      if (add.length) {
        patch.contacts = base.concat(add)
        changes.push({
          label: 'Контакты',
          from: base.length ? `${base.length} шт.` : '—',
          to: add.map((a) => a.val).join(', ') + ' (добавим)',
        })
      }

      items.push({
        id: `r${idx}`,
        name,
        phone,
        action: changes.length ? 'update' : 'same',
        matchKind,
        existingId: match.id,
        changes,
        warnings,
        selected: changes.length > 0 && !dupInFile,
        payload: patch,
      })
    } else {
      items.push({
        id: `r${idx}`,
        name,
        phone,
        action: 'create',
        matchKind,
        existingId: null,
        changes: [],
        warnings,
        selected: !dupInFile,
        payload: {
          child_name: name,
          adult_name: vals.adult_name || null,
          contacts: [
            ...(phone ? [{ type: 'Телефон', val: phone }] : []),
            ...(email ? [{ type: 'Email', val: email }] : []),
          ],
          status: vals.status || defaultStatus,
          paid_lessons: vals.paid_lessons || 0,
          visited_lessons: vals.visited_lessons || 0,
          discount: vals.discount || 0,
          birthday: vals.birthday,
          source: vals.source || null,
          comment: vals.comment || null,
        },
      })
    }
  })

  const stats = {
    create: items.filter((i) => i.action === 'create').length,
    update: items.filter((i) => i.action === 'update').length,
    same: items.filter((i) => i.action === 'same').length,
    warn: items.filter((i) => i.warnings.length).length,
    total: items.length,
  }
  return { items, stats }
}

export async function applyClientsPlan({ supabase, studioId, items }) {
  let inserted = 0
  let updated = 0
  const errors = []
  for (const it of items) {
    if (!it.selected || it.action === 'same') continue
    if (it.action === 'create') {
      const { error } = await supabase.from('clients').insert({ studio_id: studioId, ...it.payload })
      if (error) errors.push(`${it.name}: ${error.message}`)
      else inserted++
    } else {
      const { error } = await supabase
        .from('clients')
        .update(it.payload)
        .eq('id', it.existingId)
        .eq('studio_id', studioId) // явный studio_id, на RLS не полагаемся
      if (error) errors.push(`${it.name}: ${error.message}`)
      else updated++
    }
  }
  return { inserted, updated, errors }
}