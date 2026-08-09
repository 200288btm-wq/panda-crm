// =====================================================================
// Единая точка записи в справочники студии.
//
// Зачем отдельный файл: длительности и адреса заводятся теперь из двух
// мест — со страницы «Настройки → Справочники» и прямо из модалки
// направления. Раньше такое расхождение уже случалось с адресами:
// два экрана, две реализации вставки, и списки разъезжались.
// Правило: экраны вызывают эти функции, своих insert не пишут.
//
// Каждая функция:
//   • обрезает пробелы и не даёт завести дубль по названию
//   • всегда проставляет studio_id
//   • возвращает { row, error, existed } — row это СТРОКА ИЗ БАЗЫ,
//     а не то, что мы отправляли. Показывать на экране нужно её.
// =====================================================================

import { supabase } from '../supabase'

const norm = (s) => String(s ?? '').trim().toLowerCase()

// ── Длительности занятий ─────────────────────────────────────────────
export async function listDurations(studioId) {
  if (!studioId) return { rows: [], error: null }
  const { data, error } = await supabase
    .from('lesson_durations').select('*')
    .eq('studio_id', studioId)
    .order('sort_order').order('id')
  return { rows: data || [], error }
}

export async function createDuration(studioId, { name, hours }) {
  if (!studioId) return { row: null, error: 'Студия не определена', existed: false }

  const cleanName = String(name ?? '').trim()
  const cleanHours = Number(String(hours ?? '').replace(',', '.'))

  if (!cleanName) return { row: null, error: 'Укажите название', existed: false }
  if (!cleanHours || cleanHours <= 0) {
    return { row: null, error: 'Укажите количество часов больше нуля', existed: false }
  }

  const { rows, error: listErr } = await listDurations(studioId)
  if (listErr) return { row: null, error: listErr.message, existed: false }

  // Уже есть такая — не плодим вторую, просто отдаём существующую
  const dup = rows.find(r => norm(r.name) === norm(cleanName))
  if (dup) return { row: dup, error: null, existed: true }

  const { data, error } = await supabase.from('lesson_durations')
    .insert({ studio_id: studioId, name: cleanName, hours: cleanHours, sort_order: rows.length })
    .select().single()

  if (error) return { row: null, error: error.message, existed: false }
  return { row: data, error: null, existed: false }
}

// ── Категории стоимости ──────────────────────────────────────────────
export async function listCategories(studioId) {
  if (!studioId) return { rows: [], error: null }
  const { data, error } = await supabase
    .from('price_categories').select('*')
    .eq('studio_id', studioId)
    .order('sort_order').order('id')
  return { rows: data || [], error }
}

export async function createCategory(studioId, { name }) {
  if (!studioId) return { row: null, error: 'Студия не определена', existed: false }

  const cleanName = String(name ?? '').trim()
  if (!cleanName) return { row: null, error: 'Укажите название', existed: false }

  const { rows, error: listErr } = await listCategories(studioId)
  if (listErr) return { row: null, error: listErr.message, existed: false }

  const dup = rows.find(r => norm(r.name) === norm(cleanName))
  if (dup) return { row: dup, error: null, existed: true }

  const { data, error } = await supabase.from('price_categories')
    .insert({ studio_id: studioId, name: cleanName, sort_order: rows.length })
    .select().single()

  if (error) return { row: null, error: error.message, existed: false }
  return { row: data, error: null, existed: false }
}

// ── Адреса ───────────────────────────────────────────────────────────
export async function listAddresses(studioId) {
  if (!studioId) return { rows: [], error: null }
  const { data, error } = await supabase
    .from('addresses').select('*')
    .eq('studio_id', studioId)
    .order('id')
  return { rows: data || [], error }
}

export async function createAddress(studioId, { name, address }) {
  if (!studioId) return { row: null, error: 'Студия не определена', existed: false }

  const cleanName = String(name ?? '').trim()
  const cleanAddress = String(address ?? '').trim()

  if (!cleanName) return { row: null, error: 'Укажите название', existed: false }

  const { rows, error: listErr } = await listAddresses(studioId)
  if (listErr) return { row: null, error: listErr.message, existed: false }

  const dup = rows.find(r => norm(r.name) === norm(cleanName))
  if (dup) return { row: dup, error: null, existed: true }

  const { data, error } = await supabase.from('addresses')
    .insert({ studio_id: studioId, name: cleanName, address: cleanAddress || null })
    .select().single()

  if (error) return { row: null, error: error.message, existed: false }
  return { row: data, error: null, existed: false }
}
