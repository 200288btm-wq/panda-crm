import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'
import { Modal } from '../components/Modal'

const PERIODS = ['Месяц', 'Пока не закончатся занятия', 'Не ограничен']

const pricePerLesson = (price, lessons) => {
  if (!lessons || lessons === 0) return 0
  return Math.round(price / lessons)
}

// =====================================================
// Модалка категории стоимости
// =====================================================
function CategoryModal({ category, onClose, onSave }) {
  const [f, setF] = useState(category ? {
    name: category.name || '',
    description: category.description || '',
  } : { name: '', description: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = () => {
    if (!f.name.trim()) {
      alert('Пожалуйста, укажите название категории')
      return
    }
    onSave({ name: f.name.trim(), description: f.description.trim() || null })
  }

  return (
    <Modal title={category ? `✏️ ${category.name}` : '+ Новая категория стоимости'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group">
        <label className="form-label">Название *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder="60 мин до 12 чел / 120 мин до 6 чел / Основная" autoFocus />
        <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>
          Категория объединяет абонементы со схожими условиями
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Описание</label>
        <input className="form-input" value={f.description} onChange={e => set('description', e.target.value)}
          placeholder="Занятия длительностью 1 час, до 12 детей" />
      </div>
    </Modal>
  )
}

// =====================================================
// Модалка абонемента
// =====================================================
function SubModal({ sub, categories, onClose, onSave }) {
  const [f, setF] = useState(sub ? {
    name: sub.name || '',
    category_id: sub.category_id || (categories[0]?.id ?? null),
    price: sub.price || 0,
    lessons_count: sub.lessons_count || 1,
    period: sub.period || 'Пока не закончатся занятия',
    is_active: sub.is_active ?? true,
    notes: sub.notes || '',
  } : {
    name: '', category_id: categories[0]?.id ?? null, price: 0, lessons_count: 1,
    period: 'Пока не закончатся занятия', is_active: true, notes: '',
  })

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const ppl = pricePerLesson(f.price, f.lessons_count)

  const save = () => {
    if (!f.name.trim()) { alert('Укажите название абонемента'); return }
    if (!f.category_id) { alert('Выберите категорию стоимости'); return }
    onSave(f)
  }

  return (
    <Modal title={sub ? `✏️ ${sub.name}` : '+ Новый абонемент'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>

      <div className="form-group">
        <label className="form-label">Название абонемента *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder="Абонемент на 8 занятий" autoFocus />
      </div>

      <div className="form-group">
        <label className="form-label">Категория стоимости *</label>
        <select className="form-input" value={f.category_id || ''} onChange={e => set('category_id', e.target.value ? +e.target.value : null)}>
          {categories.length === 0 && <option value="">— нет категорий —</option>}
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>
          Этот абонемент будет доступен для оплаты на тех направлениях, где выбрана данная категория
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Стоимость, ₽</label>
          <input className="form-input" type="number" value={f.price} onChange={e => set('price', +e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Количество занятий</label>
          <input className="form-input" type="number" min="1" value={f.lessons_count} onChange={e => set('lessons_count', +e.target.value)} />
        </div>
      </div>

      {f.price > 0 && f.lessons_count > 0 && (
        <div style={{ background: T.greenBg, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🧮</span>
          <div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Стоимость 1 занятия</div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: T.greenDark }}>{fmt(ppl)}</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>
            {fmt(f.price)} ÷ {f.lessons_count} зан.
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Период действия</label>
        <select className="form-input" value={f.period} onChange={e => set('period', e.target.value)}>
          {PERIODS.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Примечание (необязательно)</label>
        <input className="form-input" value={f.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Например: только для новых клиентов" />
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)}
            style={{ accentColor: T.green, width: 16, height: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Активный (доступен при оплате)</span>
        </label>
      </div>
    </Modal>
  )
}

// =====================================================
// Главная страница
// =====================================================
export default function SubscriptionsPage({ subscriptions, directions, reload, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [showCatAdd, setShowCatAdd] = useState(false)
  const [showCatEdit, setShowCatEdit] = useState(null)
  const [filterCat, setFilterCat] = useState('all')

  // Категории грузим прямо здесь, отдельно — таблицы может ещё не быть
  const [categories, setCategories] = useState([])
  const [catsLoading, setCatsLoading] = useState(true)

  const loadCats = async () => {
    const { data, error } = await supabase
      .from('price_categories').select('*').order('sort_order').order('id')
    if (error) {
      console.warn('price_categories not available:', error.message)
      setCategories([])
    } else {
      setCategories(data || [])
    }
    setCatsLoading(false)
  }

  useEffect(() => { loadCats() }, [])

  // Сохранение абонемента
  const save = async (f) => {
    // Для совместимости: чистим поле direction_ids (старая система), его роль теперь у категорий
    const payload = {
      name: f.name,
      category_id: f.category_id,
      price: +f.price || 0,
      lessons_count: +f.lessons_count || 1,
      period: f.period,
      is_active: f.is_active,
      notes: f.notes || null,
    }
    if (showEdit) {
      const { error } = await supabase.from('subscriptions').update(payload).eq('id', showEdit.id)
      if (error) { alert('Ошибка сохранения: ' + error.message); return }
      setShowEdit(null)
    } else {
      const { error } = await supabase.from('subscriptions').insert(payload)
      if (error) { alert('Ошибка создания: ' + error.message); return }
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id, name) => {
    if (!confirm(`Удалить абонемент «${name}»?`)) return
    const { error } = await supabase.from('subscriptions').delete().eq('id', id)
    if (error) { alert('Ошибка удаления: ' + error.message); return }
    reload()
  }

  // Сохранение категории
  const saveCategory = async (f) => {
    if (showCatEdit) {
      const { error } = await supabase.from('price_categories').update(f).eq('id', showCatEdit.id)
      if (error) { alert('Ошибка сохранения: ' + error.message); return }
      setShowCatEdit(null)
    } else {
      const { error } = await supabase.from('price_categories').insert(f)
      if (error) { alert('Ошибка создания: ' + error.message); return }
      setShowCatAdd(false)
    }
    await loadCats()
  }

  const delCategory = async (id, name) => {
    const inCat = subscriptions.filter(s => s.category_id === id).length
    const msg = inCat > 0
      ? `В категории «${name}» сейчас ${inCat} абонементов — они потеряют категорию. Удалить?`
      : `Удалить категорию «${name}»?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('price_categories').delete().eq('id', id)
    if (error) { alert('Ошибка удаления: ' + error.message); return }
    await loadCats()
    reload()
  }

  // Фильтрация абонементов
  const filtered = subscriptions.filter(s => {
    if (filterCat === 'all') return true
    if (filterCat === 'inactive') return !s.is_active
    if (filterCat === 'uncategorized') return !s.category_id
    return String(s.category_id) === filterCat
  })

  const active = subscriptions.filter(s => s.is_active)

  const PERIOD_ICONS = {
    'Месяц': '📅',
    'Пока не закончатся занятия': '🎯',
    'Не ограничен': '♾️',
  }

  // Счётчик абонементов в каждой категории
  const countInCat = (id) => subscriptions.filter(s => s.category_id === id).length
  const uncategorizedCount = subscriptions.filter(s => !s.category_id).length

  return (
    <div>
      {/* =========== Блок управления категориями =========== */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>🏷 Категории стоимости</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
              Объединяют абонементы со схожими условиями. У каждого направления можно выбрать одну или несколько категорий.
            </div>
          </div>
          {isAdmin && (
            <button className="btn btn-outline btn-sm" onClick={() => setShowCatAdd(true)}>
              + Добавить категорию
            </button>
          )}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {catsLoading && <div style={{ fontSize:13, color:T.muted }}>Загрузка...</div>}
          {!catsLoading && categories.length === 0 && (
            <div style={{ fontSize:13, color:T.muted }}>
              Категорий пока нет. Запусти миграцию или добавь первую категорию.
            </div>
          )}
          {categories.map(c => {
            const cnt = countInCat(c.id)
            return (
              <div key={c.id} style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'8px 12px', borderRadius:12,
                background: T.cream, border:`1.5px solid ${T.border}`,
              }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{c.name}</div>
                  {c.description && <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{c.description}</div>}
                  <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{cnt} абонементов</div>
                </div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:2 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ fontSize:12, padding:'4px 6px' }}
                      onClick={() => setShowCatEdit(c)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ fontSize:12, padding:'4px 6px' }}
                      onClick={() => delCategory(c.id, c.name)}>🗑️</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* =========== Stats =========== */}
      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="stat-label">Всего абонементов</div>
          <div className="stat-value stat-green">{subscriptions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Активных</div>
          <div className="stat-value stat-green">{active.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Мин. стоимость занятия</div>
          <div className="stat-value stat-orange">
            {active.length ? fmt(Math.min(...active.map(s => pricePerLesson(s.price, s.lessons_count)))) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Макс. стоимость занятия</div>
          <div className="stat-value stat-orange">
            {active.length ? fmt(Math.max(...active.map(s => pricePerLesson(s.price, s.lessons_count)))) : '—'}
          </div>
        </div>
      </div>

      {/* =========== Filters + Add =========== */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>
            Все
          </button>
          {categories.map(c => (
            <button key={c.id} className={`tab ${filterCat === String(c.id) ? 'active' : ''}`}
              onClick={() => setFilterCat(String(c.id))}>
              {c.name}
            </button>
          ))}
          {uncategorizedCount > 0 && (
            <button className={`tab ${filterCat === 'uncategorized' ? 'active' : ''}`}
              onClick={() => setFilterCat('uncategorized')}>
              Без категории
            </button>
          )}
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
            onClick={() => setShowAdd(true)} disabled={categories.length === 0}>
            + Новый абонемент
          </button>
        )}
      </div>

      {/* =========== Cards grid =========== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
        {filtered.map(s => {
          const ppl = pricePerLesson(s.price, s.lessons_count)
          const cat = categories.find(c => c.id === s.category_id)
          return (
            <div key={s.id} className="card card-pad" style={{
              borderTop: `4px solid ${s.is_active ? T.green : T.border}`,
              opacity: s.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                    {cat ? (
                      <span className="badge" style={{ background: T.greenBg, color: T.greenDark, fontWeight:700 }}>
                        🏷 {cat.name}
                      </span>
                    ) : (
                      <span className="badge badge-gray">Без категории</span>
                    )}
                    {!s.is_active && <span className="badge badge-gray">Неактивен</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(s)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => del(s.id, s.name)} style={{ color: T.red }}>🗑️</button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: T.greenBg, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: T.greenDark, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Стоимость</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: T.greenDark }}>{fmt(s.price)}</div>
                </div>
                <div style={{ flex: 1, background: '#fff4e6', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#c47a00', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>1 занятие</div>
                  <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 900, fontSize: 20, color: '#c47a00' }}>{fmt(ppl)}</div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: T.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>📚 {s.lessons_count} занятий в абонементе</div>
                <div>{PERIOD_ICONS[s.period] || '📅'} {s.period}</div>
                {s.notes && <div style={{ fontStyle: 'italic', fontSize: 12 }}>💬 {s.notes}</div>}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="card card-pad">
            <div className="empty">
              <div className="empty-icon">💳</div>
              <div className="empty-text">Абонементов в этой категории пока нет</div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <SubModal categories={categories} onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <SubModal sub={showEdit} categories={categories} onClose={() => setShowEdit(null)} onSave={save} />}
      {showCatAdd && <CategoryModal onClose={() => setShowCatAdd(false)} onSave={saveCategory} />}
      {showCatEdit && <CategoryModal category={showCatEdit} onClose={() => setShowCatEdit(null)} onSave={saveCategory} />}
    </div>
  )
}
