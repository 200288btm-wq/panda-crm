// Разбор значений из Excel: даты, телефоны, имена, доступ к колонкам.
// Excel отдаёт дату тремя способами: объектом Date (при cellDates: true),
// серийным номером (без cellDates) и текстом. Понимаем все три.

const pad = (n) => String(n).padStart(2, '0')
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

const isRealDate = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * @returns {{ iso: string|null, warn?: string, error?: string }}
 * iso — всегда ГГГГ-ММ-ДД для базы. error — значение есть, но не разобрали.
 */
export function parseDate(v) {
  if (v === null || v === undefined) return { iso: null }

  // 1. Родная ячейка-дата Excel. Компоненты берём локальные:
  //    toISOString() здесь сдвинул бы дату на сутки назад в UTC+5.
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return { iso: null, error: 'дата не распознана' }
    // SheetJS отдаёт полночь то локальную, то UTC. Берём ту сторону,
    // где стоит ровно 00:00 — иначе в UTC+5 дата уезжает на сутки.
    if (v.getHours() === 0 && v.getMinutes() === 0) {
      return { iso: fmt(v.getFullYear(), v.getMonth() + 1, v.getDate()) }
    }
    return { iso: fmt(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) }
  }

  // 2. Серийный номер Excel (страховка, если файл прочитали без cellDates)
  if (typeof v === 'number' && isFinite(v)) {
    if (v <= 0 || v > 60000) return { iso: null, error: `«${v}» не похоже на дату` }
    const dt = new Date(Math.round((v - 25569) * 86400000))
    if (isNaN(dt.getTime())) return { iso: null, error: `«${v}» не похоже на дату` }
    return { iso: fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()) }
  }

  const s = String(v).trim()
  if (!s) return { iso: null }

  // 3. ГГГГ-ММ-ДД (наш прежний шаблон)
  let m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/)
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3]
    return isRealDate(y, mo, d) ? { iso: fmt(y, mo, d) } : { iso: null, error: `«${s}» — такой даты нет` }
  }

  // 4. ДД.ММ.ГГГГ / ДД.ММ.ГГ / через / или -
  m = s.match(/^(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{2,4})$/)
  if (m) {
    const a = +m[1], b = +m[2]
    let y = +m[3]
    if (y < 100) y = y > 26 ? 1900 + y : 2000 + y   // 27..99 → 19xx, 00..26 → 20xx
    let day = a, mon = b, warn
    if (a > 12 && b <= 12) { day = a; mon = b }                    // однозначно ДД.ММ
    else if (b > 12 && a <= 12) { day = b; mon = a; warn = `«${s}» прочитано как ММ/ДД/ГГГГ` }
    else if (a <= 12 && b <= 12) { day = a; mon = b; warn = `«${s}» прочитано как ДД.ММ.ГГГГ — проверьте` }
    else return { iso: null, error: `«${s}» — такой даты нет` }
    return isRealDate(y, mon, day)
      ? { iso: fmt(y, mon, day), warn }
      : { iso: null, error: `«${s}» — такой даты нет` }
  }

  return { iso: null, error: `«${s}» — формат даты не распознан` }
}

/** ГГГГ-ММ-ДД → ДД.ММ.ГГГГ (для выгрузки в шаблон) */
export function dateToRu(iso) {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso)
}

/** Только цифры, последние 10 — ключ сравнения телефонов (без 7/8 в начале) */
export function phoneKey(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

/** Приводим к +7XXXXXXXXXX. Не смогли — возвращаем как было, чтобы не потерять. */
export function normPhone(v) {
  if (v === null || v === undefined || v === '') return ''
  const raw = String(v).trim()
  const k = phoneKey(raw)
  if (!k) return raw
  return '+7' + k
}

export function normName(s) {
  return String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

/**
 * Достаём колонку по любому из названий. Терпим лишние пробелы,
 * регистр и потерянную звёздочку в заголовке.
 */
export function pick(row, ...keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k]
  const norm = (s) => String(s).toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  const map = {}
  for (const rk of Object.keys(row)) map[norm(rk)] = row[rk]
  for (const k of keys) {
    const v = map[norm(k)]
    if (v !== undefined && v !== '') return v
  }
  return ''
}

export const asStr = (v) => (v === null || v === undefined ? '' : String(v).trim())
export const asNum = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''))
  return isFinite(n) ? n : 0
}
export const isEmptyVal = (v) => v === null || v === undefined || String(v).trim() === ''
