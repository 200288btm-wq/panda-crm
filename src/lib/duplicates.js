// =====================================================================
// Один ли это ребёнок — единое правило для всей CRM.
//
// Правило студии:
//   тот же телефон И то же имя ребёнка → это он же, второй раз заводить нельзя
//   тот же телефон, имя другое         → брат или сестра, это нормально
//   то же имя, телефон другой/пустой   → может быть он же, надо спросить
//
// Правило уже жило в разборе файла импорта (lib/importClients.js) и там
// работало. При заведении клиента руками проверки не было вовсе: тот же
// ребёнок с тем же телефоном заводился второй раз молча. Поэтому правило
// вынесено сюда — чтобы в двух местах оно было одно, а не два похожих.
// =====================================================================
import { normName, phoneKey } from './importParse'

/**
 * Ищет среди уже заведённых клиентов того же ребёнка.
 *
 * @param childName  имя ребёнка из формы
 * @param phone      телефон из формы (любой вид записи)
 * @param clients    все клиенты студии, включая архивных:
 *                   дубль архивного — такой же дубль, его просто не видно в списке
 * @param excludeId  id самого клиента при правке — сам себе не дубль
 *
 * @returns { kind, client } где kind:
 *   'same_child' — заводить нельзя
 *   'name_only'  — спросить человека
 *   'sibling'    — можно, но скажем вслух
 *   null         — совпадений нет
 */
export function findClientMatch({ childName, phone, clients = [], excludeId = null }) {
  const name = normName(childName)
  if (!name) return { kind: null, client: null }

  const pk = phoneKey(phone)
  const others = (clients || []).filter(c => c && c.id !== excludeId)

  const phonesOf = (c) => (c.contacts || [])
    .filter(x => x && x.type === 'Телефон' && x.val)
    .map(x => phoneKey(x.val))
    .filter(Boolean)

  if (pk) {
    const byPhone = others.filter(c => phonesOf(c).includes(pk))
    const same = byPhone.find(c => normName(c.child_name) === name)
    if (same) return { kind: 'same_child', client: same }
    if (byPhone.length) return { kind: 'sibling', client: byPhone[0] }
  }

  // Телефон не совпал (или его нет) — остаётся имя. Это слабый признак:
  // тёзки бывают, поэтому не запрещаем, а спрашиваем.
  const byName = others.find(c => normName(c.child_name) === name)
  if (byName) return { kind: 'name_only', client: byName }

  return { kind: null, client: null }
}

/** Телефон клиента для показа в сообщении — первый из контактов. */
export function firstPhone(client) {
  const c = (client?.contacts || []).find(x => x && x.type === 'Телефон' && x.val)
  return c ? String(c.val) : ''
}
