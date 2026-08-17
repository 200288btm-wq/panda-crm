import { useState } from 'react'
import { supabase } from '../supabase'
import { T, ADDRESS_COLORS, addressColor } from '../styles.jsx'
import { Modal } from '../components/Modal'
import { createAddress } from '../lib/dictionaries'
import { toast, confirmAction } from '../lib/ui'

// Палитра цветов для адресов — отличается от палитры направлений,
// чтобы при переключении календаря на режим «по адресам» цвета читались иначе


function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
      {ADDRESS_COLORS.map(c => (
        <div key={c} onClick={() => onChange(c)} style={{
          width:32, height:32, borderRadius:'50%', background:c, cursor:'pointer',
          border: value===c ? '3px solid #1A1A1A' : '3px solid transparent',
          boxShadow: value===c ? '0 0 0 2px white inset' : 'none', transition:'all 0.15s'
        }} />
      ))}
    </div>
  )
}

function AddressModal({ address, onClose, onSave }) {
  const [f, setF] = useState(address ? {
    name: address.name || '',
    address: address.address || '',
    color: address.color || ADDRESS_COLORS[0],
  } : { name: '', address: '', color: ADDRESS_COLORS[0] })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = () => {
    if (!f.name.trim()) {
      toast.error('Укажите короткое название адреса')
      return
    }
    onSave({ name: f.name.trim(), address: f.address.trim() || null, color: f.color })
  }

  return (
    <Modal title={address ? `✏️ ${address.name}` : '+ Новый адрес'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Отмена</button><button className="btn btn-primary" onClick={save}>Сохранить</button></>}>
      <div className="form-group">
        <label className="form-label">Короткое название *</label>
        <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder="Хуторская / Онежская" autoFocus />
        <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
          Так адрес будет отображаться в расписании и в подгруппах
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Полный адрес</label>
        <input className="form-input" value={f.address} onChange={e => set('address', e.target.value)}
          placeholder="ул. Хуторская, 1" />
      </div>
      <div className="form-group">
        <label className="form-label">Цвет адреса</label>
        <ColorPicker value={f.color} onChange={v => set('color', v)} />
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
          Этим цветом будут окрашены занятия в календаре в режиме «По адресам»
        </div>
      </div>
    </Modal>
  )
}

export default function AddressesPage({ addresses = [], reload, isAdmin, studioId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)

  const save = async (f) => {
    if (showEdit) {
      const { error } = await supabase.from('addresses').update(f).eq('id', showEdit.id)
      if (error) { toast.fromError(error, 'Не удалось сохранить адрес'); return }
      toast.success('Адрес сохранён')
      setShowEdit(null)
    } else {
      const { error } = await createAddress(studioId, f)
      // createAddress отдаёт текст ошибки строкой, не объектом
      if (error) { toast.error('Не удалось создать адрес', String(error)); return }
      toast.success(`Адрес «${f.name}» добавлен`)
      setShowAdd(false)
    }
    reload()
  }

  const del = async (id, name) => {
    const ok = await confirmAction({
      title: `Удалить адрес «${name}»?`,
      text: 'Подгруппы, привязанные к этому адресу, останутся, но потеряют привязку.',
      confirmLabel: 'Удалить', cancelLabel: 'Отмена', danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('addresses').delete().eq('id', id)
    if (error) { toast.fromError(error, `Не удалось удалить адрес «${name}»`); return }
    toast.success(`Адрес «${name}» удалён`)
    reload()
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Новый адрес</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
        {addresses.map(a => {
          const color = addressColor(a, addresses)
          return (
            <div key={a.id} className="card card-pad" style={{ borderTop:`4px solid ${color}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:14, height:14, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:15 }}>{a.name}</div>
                </div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEdit(a)}>✏️</button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => del(a.id, a.name)}>🗑️</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize:13, color:T.muted }}>
                📍 {a.address || '— полный адрес не указан —'}
              </div>
            </div>
          )
        })}
        {!addresses.length && (
          <div className="card card-pad">
            <div className="empty">
              <div className="empty-icon">📍</div>
              <div className="empty-text">Адресов пока нет</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:6 }}>
                Добавьте адреса студии, затем привяжите к ним подгруппы в разделе «🎯 Направления»
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddressModal onClose={() => setShowAdd(false)} onSave={save} />}
      {showEdit && <AddressModal address={showEdit} onClose={() => setShowEdit(null)} onSave={save} />}
    </div>
  )
}
