// Целевой путь: panda-crm/src/pages/AdminPage.jsx
//
// Отличие от старой версии: пароль и TOTP больше НЕ проверяются на клиенте
// и admin_config здесь не читается. Всё идёт через edge-функцию admin-panel,
// которая проверяет всё на сервере service-role ключом. Внешний вид не менялся.

import { useState } from 'react'
import { supabase } from '../supabase'
import { T } from '../styles.jsx'

const PLAN_LABELS = { free: 'Free', start: 'Start', pro: 'Pro' }
const PLAN_COLORS = { free: '#9ca3af', start: '#3b82f6', pro: '#a855f7' }

const ERRORS = {
  bad_password: 'Неверный пароль',
  bad_totp: 'Неверный код. Проверьте время на устройстве.',
  unauthorized: 'Сессия истекла — войдите заново',
  bad_input: 'Проверьте введённые данные',
  config: 'Ошибка конфигурации на сервере',
  server_misconfigured: 'Админка не настроена на сервере (нет ADMIN_TOKEN_SECRET)',
  network: 'Сеть недоступна, попробуйте ещё раз',
  empty: 'Пустой ответ сервера',
}

export default function AdminPage({ onClose }) {
  const [step, setStep] = useState('password') // 'password' | 'totp' | 'dashboard'
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [token, setToken] = useState(null)
  const [studios, setStudios] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [editPlan, setEditPlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  // Единственная точка правды — edge-функция admin-panel (service-role на сервере).
  const call = async (body) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-panel', { body })
      if (error) return { error: 'network' }
      return data || { error: 'empty' }
    } catch {
      return { error: 'network' }
    }
  }

  // Шаг 1 (пароль) теперь ничего не проверяет на клиенте — просто переходим к 2FA.
  // Правильность пароля выяснится на сервере вместе с кодом (без «оракула» на пароль).
  const goToTotp = () => {
    if (!password.trim()) { setError('Введите пароль'); return }
    setError(''); setStep('totp')
  }

  const login = async () => {
    if (!totp.trim()) { setError('Введите код'); return }
    setLoading(true); setError('')
    const res = await call({ action: 'login', password, totp })
    if (res.error) {
      setError(ERRORS[res.error] || 'Ошибка входа')
      if (res.error === 'bad_password') { setStep('password'); setTotp('') }
      setLoading(false); return
    }
    setToken(res.token)
    setStudios(res.studios || [])
    setSubscriptions(res.subscriptions || [])
    setStep('dashboard')
    setLoading(false)
  }

  const getPlan = (studioId) => subscriptions.find(s => s.studio_id === studioId) || { plan: 'free', expires_at: null }

  const savePlan = async () => {
    if (!editPlan) return
    setSaving(true); setError('')
    const res = await call({
      action: 'set_plan',
      token,
      studio_id: editPlan.studio_id,
      plan: editPlan.plan,
      expires_at: editPlan.expires_at || null,
    })
    if (res.error) {
      setError(ERRORS[res.error] || 'Не удалось сохранить')
      if (res.error === 'unauthorized') { setStep('password'); setToken(null) }
      setSaving(false); return
    }
    setSubscriptions(res.subscriptions || [])
    setMsg('✅ Сохранено')
    setEditPlan(null)
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  // ── UI ──────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: step === 'dashboard' ? 700 : 380, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>

        {/* Заголовок */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: 18, color: T.ink }}>
              🔐 Учтено Админ
            </div>
            <div style={{ fontSize: 13, color: T.muted }}>
              {step === 'password' ? 'Введите пароль' : step === 'totp' ? 'Двухфакторная аутентификация' : 'Управление студиями'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: T.muted }}>✕</button>
        </div>

        {/* Шаг 1: Пароль */}
        {step === 'password' && (
          <div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Пароль</label>
              <input className="form-input" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && goToTotp()}
                placeholder="Введите пароль" autoFocus />
            </div>
            {error && <div style={{ color: '#e05a5a', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
            <button className="btn btn-primary" onClick={goToTotp} style={{ width: '100%' }}>
              Далее →
            </button>
          </div>
        )}

        {/* Шаг 2: TOTP */}
        {step === 'totp' && (
          <div>
            <div style={{ background: T.cream, borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
              📱 Откройте Google Authenticator и введите 6-значный код для аккаунта <strong>Учтено Админ</strong>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Код из приложения</label>
              <input className="form-input" type="text" value={totp} maxLength={6}
                onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && login()}
                placeholder="000000" autoFocus
                style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center', fontFamily: 'Nunito,sans-serif', fontWeight: 800 }} />
            </div>
            {error && <div style={{ color: '#e05a5a', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
            <button className="btn btn-primary" onClick={login} disabled={loading || totp.length !== 6} style={{ width: '100%' }}>
              {loading ? 'Проверяем...' : '🔓 Войти'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep('password'); setTotp(''); setError('') }} style={{ width: '100%', marginTop: 8 }}>
              ← Назад
            </button>
          </div>
        )}

        {/* Шаг 3: Дашборд */}
        {step === 'dashboard' && (
          <div>
            {msg && <div style={{ background: T.greenBg, color: T.greenDark, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontWeight: 600, fontSize: 13 }}>{msg}</div>}
            {error && <div style={{ color: '#e05a5a', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {studios.map(s => {
                const plan = getPlan(s.id)
                const color = PLAN_COLORS[plan.plan] || '#9ca3af'
                const isExpired = plan.expires_at && new Date(plan.expires_at) < new Date()
                return (
                  <div key={s.id} style={{ background: T.cream, borderRadius: 14, padding: '14px 16px', border: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: T.muted }}>ID: {s.id}</div>
                        {plan.expires_at && (
                          <div style={{ fontSize: 12, color: isExpired ? '#e05a5a' : T.greenDark, fontWeight: 600 }}>
                            {isExpired ? '⚠️ Истёк' : '✅ До'} {new Date(plan.expires_at).toLocaleDateString('ru-RU')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: color + '22', color, borderRadius: 8, padding: '4px 12px', fontWeight: 800, fontSize: 14, fontFamily: 'Nunito,sans-serif' }}>
                          {PLAN_LABELS[plan.plan] || 'Free'}
                        </span>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditPlan({ studio_id: s.id, plan: plan.plan || 'free', expires_at: plan.expires_at || '' })}>
                          ✏️ Изменить
                        </button>
                      </div>
                    </div>

                    {/* Форма редактирования */}
                    {editPlan?.studio_id === s.id && (
                      <div style={{ marginTop: 14, padding: '14px', background: 'white', borderRadius: 12, border: `1px solid ${T.border}` }}>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Тариф</label>
                            <select className="form-input" value={editPlan.plan} onChange={e => setEditPlan(p => ({ ...p, plan: e.target.value }))}>
                              <option value="free">Free — бесплатно</option>
                              <option value="start">Start — 690 ₽/мес</option>
                              <option value="pro">Pro — 1 490 ₽/мес</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Действует до</label>
                            <input className="form-input" type="date" value={editPlan.expires_at || ''}
                              onChange={e => setEditPlan(p => ({ ...p, expires_at: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={savePlan} disabled={saving}>
                            {saving ? 'Сохраняем...' : '✅ Сохранить'}
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditPlan(null)}>Отмена</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {!studios.length && <div style={{ color: T.muted, fontSize: 13 }}>Студий не найдено</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
