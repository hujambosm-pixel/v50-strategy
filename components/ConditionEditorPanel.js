import { useState } from 'react'
import { MONO } from '../lib/utils'
import { groqParseCondition } from '../lib/conditions'

const CONDITION_TYPES = [
  { value: 'ema_cross_up',    label: 'EMA Cruce ↑',      color: '#00d4ff' },
  { value: 'ema_cross_down',  label: 'EMA Cruce ↓',      color: '#ff4d6d' },
  { value: 'price_above_ma',  label: 'Precio > MA',       color: '#00d4ff' },
  { value: 'price_below_ma',  label: 'Precio < MA',       color: '#ff4d6d' },
  { value: 'close_above_ma',  label: 'Cierre > MA',       color: '#00e5a0' },
  { value: 'close_below_ma',  label: 'Cierre < MA',       color: '#ff7a7a' },
  { value: 'rsi_above',       label: 'RSI >',             color: '#ffd166' },
  { value: 'rsi_below',       label: 'RSI <',             color: '#ffd166' },
  { value: 'rsi_cross_up',    label: 'RSI Cruce ↑',       color: '#ffd166' },
  { value: 'rsi_cross_down',  label: 'RSI Cruce ↓',       color: '#ffd166' },
  { value: 'macd_cross_up',   label: 'MACD Cruce ↑',      color: '#7ae0a0' },
  { value: 'macd_cross_down', label: 'MACD Cruce ↓',      color: '#ff7a7a' },
]

const DEFAULT_PARAMS = {
  ema_cross_up:    { ma_fast: 10, ma_slow: 20 },
  ema_cross_down:  { ma_fast: 10, ma_slow: 20 },
  price_above_ma:  { ma_period: 200, ma_type: 'EMA' },
  price_below_ma:  { ma_period: 200, ma_type: 'EMA' },
  close_above_ma:  { ma_period: 50,  ma_type: 'EMA' },
  close_below_ma:  { ma_period: 50,  ma_type: 'EMA' },
  rsi_above:       { period: 14, level: 50 },
  rsi_below:       { period: 14, level: 30 },
  rsi_cross_up:    { period: 14, level: 30 },
  rsi_cross_down:  { period: 14, level: 70 },
  macd_cross_up:   { fast: 12, slow: 26, signal: 9 },
  macd_cross_down: { fast: 12, slow: 26, signal: 9 },
}

const INPUT = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text1)', fontFamily: MONO, fontSize: 11,
  padding: '6px 8px', borderRadius: 4, boxSizing: 'border-box', outline: 'none',
}

const LABEL = {
  fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
  color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4, display: 'block',
}

function NumInput({ label, value, onChange, min, max }) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <span style={LABEL}>{label}</span>
      <input
        type="number" min={min} max={max}
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        style={INPUT}
      />
    </div>
  )
}

function ParamsEditor({ type, params, onChange }) {
  function set(key, val) { onChange({ ...params, [key]: val }) }

  if (!type) return null

  if (type === 'ema_cross_up' || type === 'ema_cross_down') return (
    <div style={{ display: 'flex', gap: 10 }}>
      <NumInput label="EMA rápida" value={params.ma_fast} onChange={v => set('ma_fast', v)} min={1} />
      <NumInput label="EMA lenta"  value={params.ma_slow} onChange={v => set('ma_slow', v)} min={2} />
    </div>
  )

  if (['price_above_ma','price_below_ma','close_above_ma','close_below_ma'].includes(type)) return (
    <div style={{ display: 'flex', gap: 10 }}>
      <NumInput label="Período MA" value={params.ma_period} onChange={v => set('ma_period', v)} min={1} />
      <div style={{ flex: 1, minWidth: 90 }}>
        <span style={LABEL}>Tipo MA</span>
        <select value={params.ma_type || 'EMA'} onChange={e => set('ma_type', e.target.value)}
          style={{ ...INPUT, cursor: 'pointer' }}>
          <option value="EMA">EMA</option>
          <option value="SMA">SMA</option>
        </select>
      </div>
    </div>
  )

  if (type.startsWith('rsi')) return (
    <div style={{ display: 'flex', gap: 10 }}>
      <NumInput label="Período RSI" value={params.period} onChange={v => set('period', v)} min={2} />
      <NumInput label="Nivel"        value={params.level}  onChange={v => set('level',  v)} min={1} max={100} />
    </div>
  )

  if (type.startsWith('macd')) return (
    <div style={{ display: 'flex', gap: 10 }}>
      <NumInput label="Rápida" value={params.fast}   onChange={v => set('fast',   v)} min={1} />
      <NumInput label="Lenta"  value={params.slow}   onChange={v => set('slow',   v)} min={2} />
      <NumInput label="Señal"  value={params.signal} onChange={v => set('signal', v)} min={1} />
    </div>
  )

  return null
}

export default function ConditionEditorPanel({
  condForm, setCondForm,
  condition,
  onSave, onCancel, onDelete,
  saving,
}) {
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  function setField(key, val) { setCondForm(p => ({ ...p, [key]: val })) }

  function handleTypeChange(newType) {
    const defaults = DEFAULT_PARAMS[newType] || {}
    const existingParams = condForm.params || {}
    // Merge: keep existing values for common keys, fill new ones with defaults
    const merged = { ...defaults }
    Object.keys(defaults).forEach(k => {
      if (existingParams[k] !== undefined) merged[k] = existingParams[k]
    })
    setCondForm(p => ({ ...p, type: newType, params: merged }))
  }

  async function runGroq() {
    if (!aiText.trim()) return
    setAiLoading(true)
    setAiError(null)
    try {
      const data = await groqParseCondition(aiText.trim())
      if (data.type) {
        setCondForm(p => ({
          ...p,
          name: data.name || p.name,
          description: data.description || p.description,
          type: data.type,
          params: { ...(DEFAULT_PARAMS[data.type] || {}), ...(data.params || {}) },
        }))
        setAiText('')
      }
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const typeInfo = CONDITION_TYPES.find(t => t.value === condForm.type)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden', background: 'var(--bg1)', fontFamily: MONO,
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text3)', fontFamily: MONO, fontSize: 11,
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
        }}>← Volver</button>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text3)' }}>
          {condition?.id ? 'Editando condición' : 'Nueva condición'}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 14, fontWeight: 700,
          color: typeInfo?.color || 'var(--accent)',
        }}>
          {condForm.name || '—'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {condition?.id && (
            <button onClick={onDelete} style={{
              background: 'rgba(255,77,109,0.1)', border: '1px solid #ff4d6d',
              color: '#ff4d6d', fontFamily: MONO, fontSize: 11,
              padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            }}>🗑 Eliminar</button>
          )}
          <button onClick={onCancel} style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: MONO, fontSize: 11,
            padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          }}>✕ Cancelar</button>
          <button onClick={onSave} disabled={saving} style={{
            background: 'rgba(0,212,255,0.15)', border: '1px solid var(--accent)',
            color: 'var(--accent)', fontFamily: MONO, fontSize: 11, fontWeight: 700,
            padding: '4px 16px', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? '⟳ Guardando…' : '💾 Guardar'}</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>

        {/* ── AI Assistant ── */}
        <div style={{
          padding: '12px', background: 'rgba(155,114,255,0.06)',
          border: '1px solid rgba(155,114,255,0.25)', borderRadius: 6, marginBottom: 10,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, color: '#9b72ff',
            letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase',
          }}>
            🤖 Asistente IA (Groq)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Describe la condición en lenguaje natural…"
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runGroq()}
              style={{ ...INPUT, flex: 1 }}
            />
            <button onClick={runGroq} disabled={aiLoading || !aiText.trim()} style={{
              background: 'rgba(155,114,255,0.15)', border: '1px solid rgba(155,114,255,0.4)',
              color: '#9b72ff', fontFamily: MONO, fontSize: 11, fontWeight: 700,
              padding: '6px 14px', borderRadius: 4,
              cursor: aiLoading || !aiText.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{aiLoading ? '⟳ Procesando…' : '✨ Generar'}</button>
          </div>
          {aiError && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#ff4d6d', marginTop: 6 }}>
              ⚠ {aiError}
            </div>
          )}
        </div>

        {/* ── Basic fields ── */}
        <div style={{
          padding: '12px', background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10,
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <span style={LABEL}>Nombre</span>
              <input
                type="text"
                value={condForm.name || ''}
                onChange={e => setField('name', e.target.value)}
                style={INPUT}
                placeholder="Nombre de la condición"
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <span style={LABEL}>Tipo</span>
              <select
                value={condForm.type || ''}
                onChange={e => handleTypeChange(e.target.value)}
                style={{ ...INPUT, cursor: 'pointer',
                  color: typeInfo?.color || 'var(--text3)',
                  borderColor: typeInfo ? `${typeInfo.color}44` : 'var(--border)',
                }}
              >
                <option value="">— Seleccionar tipo —</option>
                {CONDITION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <span style={LABEL}>Descripción</span>
            <input
              type="text"
              value={condForm.description || ''}
              onChange={e => setField('description', e.target.value)}
              style={INPUT}
              placeholder="Breve descripción técnica…"
            />
          </div>
        </div>

        {/* ── Params ── */}
        {condForm.type && (
          <div style={{
            padding: '12px', background: 'var(--bg2)',
            border: `1px solid ${typeInfo?.color ? typeInfo.color + '33' : 'var(--border)'}`,
            borderRadius: 6, marginBottom: 10,
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 9, color: typeInfo?.color || 'var(--text3)',
              letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase',
            }}>
              Parámetros — {typeInfo?.label || condForm.type}
            </div>
            <ParamsEditor
              type={condForm.type}
              params={condForm.params || DEFAULT_PARAMS[condForm.type] || {}}
              onChange={p => setField('params', p)}
            />
          </div>
        )}

      </div>
    </div>
  )
}
