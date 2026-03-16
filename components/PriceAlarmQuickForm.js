import { useState } from 'react'
import { MONO } from '../lib/utils'

export default function PriceAlarmQuickForm({ price, symbol, alarms, onSave, onCancel }) {
  const [px, setPx] = useState(price.toFixed(2))
  const [cond, setCond] = useState('price_above')
  const [name, setName] = useState(`${symbol} @ ${price.toFixed(2)}`)
  const [saving, setSaving] = useState(false)
  const condLabels = { price_above:'Precio sube hasta', price_below:'Precio baja hasta' }
  const doSave = async () => {
    setSaving(true)
    await onSave({ symbol, name, condition:'price_level', price_level:Number(px), condition_detail:cond, active:true })
    setSaving(false)
  }
  return (
    <div style={{fontFamily:MONO,fontSize:12,display:'flex',flexDirection:'column',gap:10}}>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Condición</span>
        <select value={cond} onChange={e=>setCond(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 8px',borderRadius:4}}>
          <option value="price_above">Precio sube hasta...</option>
          <option value="price_below">Precio baja hasta...</option>
        </select>
      </label>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Precio</span>
        <input type="number" value={px} step="0.01" onChange={e=>setPx(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--accent)',color:'var(--text)',fontFamily:MONO,fontSize:13,padding:'6px 10px',borderRadius:4,fontWeight:700}}/>
      </label>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Nombre</span>
        <input type="text" value={name} onChange={e=>setName(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 8px',borderRadius:4}}/>
      </label>
      <div style={{display:'flex',gap:8,marginTop:4}}>
        <button onClick={doSave} disabled={saving} style={{flex:1,background:'var(--accent)',border:'none',color:'#080c14',fontFamily:MONO,fontSize:12,fontWeight:700,padding:'8px',borderRadius:4,cursor:'pointer'}}>
          {saving?'Guardando…':'✓ Crear Alarma'}
        </button>
        <button onClick={onCancel} style={{padding:'8px 12px',background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:11,borderRadius:4,cursor:'pointer'}}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
