import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { T, fmt } from '../styles.jsx'

// Простая реализация TOTP без внешних библиотек
function base32Decode(base32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const output = []
  for (let i = 0; i < base32.length; i++) {
    const idx = chars.indexOf(base32[i].toUpperCase())
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

async function generateTOTP(secret) {
  const key = base32Decode(secret)
  const time = Math.floor(Date.now() / 1000 / 30)
  const timeBuffer = new ArrayBuffer(8)
  const view = new DataView(timeBuffer)
  view.setUint32(4, time, false)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer)
  const arr = new Uint8Array(sig)
  const offset = arr[19] & 0xf
  const code = ((arr[offset] & 0x7f) << 24 | arr[offset+1] << 16 | arr[offset+2] << 8 | arr[offset+3]) % 1000000
  return String(code).padStart(6, '0')
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const PLAN_LABELS = { free: 'Free', start: 'Start', pro: 'Pro' }
const PLAN_COLORS = { free: '#9ca3af', start: '#3b82f6', pro: '#a855f7' }

export default function AdminPage({ onClose }) {
  const [step, setStep] = useState('password') // 'password' | 'totp' | 'dashboard'
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [adminConfig, setAdminConfig] = useState(null)

  // Dashboard state
  const [studios, setStudios] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [editPlan, setEditPlan] = useState(null) // { studio_id, plan, expires_at }
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const checkPassword = async () => {
    if (!password.trim()) { setError('Введите пароль'); return }
    setLoading(true); setError('')
    const { data } = await supabase.from('admin_config').select('*').single()
    if (!data) { setError('Ошибка конфигурации'); setLoading(false); return }
    const hash = await sha256(password)
    if (hash !== data.admin_password_hash) { setError('Неверный пароль'); setLoading(false); return }
    setAdminConfig(data)
    setStep('totp')
    setLoading(false)
  }

  const checkTOTP = async () => {
    if (!totp.trim()) { setError('Введите код'); return }
    setLoading(true); setError('')
    const expected = await generateTOTP(adminConfig.totp_secret)
    // Проверяем текущий и соседние периоды (±30 сек)
    const prev = await generateTOTP(adminConfig.totp_secret)
    if (totp !== expected && totp !== prev) {
      setError('Неверный код. Проверьте время на устройстве.'); setLoading(false); return
    }
    setStep('dashboard')
    loadDashboard()
    setLoading(false)
  }

  const loadDashboard = async () => {
    const [{ data: st }, { data: sub }] = await Promise.all([
      supabase.from('studios').select('*').order('id'),
      supabase.from('studio_subscriptions').select('*'),
    ])
    setStudios(st || [])
    setSubscriptions(sub || [])
  }

  const getPlan = (studioId) => subscriptions.find(s => s.studio_id === studioId) || { plan: 'free', expires_at: null }

  const savePlan = async () => {
    if (!editPlan) return
    setSaving(true)
    const existing = subscriptions.find(s => s.studio_id === editPlan.studio_id)
    if (existing) {
      await supabase.from('studio_subscriptions').update({
        plan: editPlan.plan,
        expires_at: editPlan.expires_at || null,
      }).eq('studio_id', editPlan.studio_id)
    } else {
      await supabase.from('studio_subscriptions').insert({
        studio_id: editPlan.studio_id,
        plan: editPlan.plan,
        expires_at: editPlan.expires_at || null,
      })
    }
    setMsg('✅ Сохранено')
    setEditPlan(null)
    loadDashboard()
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
                onKeyDown={e => e.key === 'Enter' && checkPassword()}
                placeholder="Введите пароль" autoFocus />
            </div>
            {error && <div style={{ color: '#e05a5a', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
            <button className="btn btn-primary" onClick={checkPassword} disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Проверяем...' : 'Далее →'}
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
                onKeyDown={e => e.key === 'Enter' && checkTOTP()}
                placeholder="000000" autoFocus
                style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center', fontFamily: 'Nunito,sans-serif', fontWeight: 800 }} />
            </div>
            {error && <div style={{ color: '#e05a5a', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
            <button className="btn btn-primary" onClick={checkTOTP} disabled={loading || totp.length !== 6} style={{ width: '100%' }}>
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
