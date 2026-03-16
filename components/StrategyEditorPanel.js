import { MONO } from '../lib/utils'

const ROLES = [
  { key: 'filter',     label: 'FILTER',     color: '#4a9eff', desc: 'Condición de mercado para permitir entradas' },
  { key: 'setup',      label: 'SETUP',      color: '#00d4ff', desc: 'Señal que activa el estado de espera' },
  { key: 'trigger',    label: 'TRIGGER',    color: '#00e5a0', desc: 'Condición de ejecución de entrada' },
  { key: 'abort',      label: 'ABORT',      color: '#ff7a7a', desc: 'Cancelación de entrada pendiente' },
  { key: 'stop_loss',  label: 'STOP LOSS',  color: '#ff4d6d', desc: 'Límite de pérdida' },
  { key: 'exit',       label: 'EXIT',       color: '#ffd166', desc: 'Señal de salida de la posición' },
  { key: 'management', label: 'MANAGEMENT', color: '#9b72ff', desc: 'Gestión de la posición abierta' },
]

const ENTRY_TYPES = [
  { value: 'ema_cross_up',              label: 'EMA Cruce ↑' },
  { value: 'breakout_high_above_ma',    label: 'Breakout High sobre MA' },
  { value: 'breakout_high',             label: 'Breakout High (rolling)' },
  { value: 'price_above_ma',            label: 'Precio > MA' },
  { value: 'close_above_ma',            label: 'Cierre > MA' },
]
const STOP_TYPES = [
  { value: 'below_ma_at_signal',        label: 'Stop bajo MA (señal)' },
  { value: 'min_ma_low_signal',         label: 'Mín / MA baja (señal)' },
  { value: 'atr_based',                 label: 'ATR-based' },
  { value: 'none',                      label: 'Sin stop' },
]
const EXIT_TYPES = [
  { value: 'breakout_low_below_ma',             label: 'Breakout Low bajo MA' },
  { value: 'breakout_low_after_close_below_ma', label: 'Breakout Low tras cierre < MA' },
  { value: 'ema_cross_down',                    label: 'EMA Cruce ↓' },
  { value: 'close_below_ma',                    label: 'Cierre < MA' },
  { value: 'none',                              label: 'Sin salida específica' },
]

function CondSelect({ role, conditions, value, onChange }) {
  const r = ROLES.find(r => r.key === role)
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      style={{
        width: '100%', background: 'var(--bg3)', border: `1px solid ${r.color}44`,
        color: value ? 'var(--text1)' : 'var(--text3)',
        fontFamily: MONO, fontSize: 11, padding: '6px 8px', borderRadius: 4,
        cursor: 'pointer', outline: 'none',
      }}
    >
      <option value="">— Sin condición —</option>
      {conditions.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

function Cell({ label, color, children, wide, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      flex: wide ? 2 : 1, minWidth: wide ? 160 : 100,
      ...style
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
        color: color || 'var(--text3)', textTransform: 'uppercase',
        padding: '4px 8px', background: color ? `${color}12` : 'var(--bg2)',
        border: `1px solid ${color ? color + '30' : 'var(--border)'}`,
        borderRadius: '3px 3px 0 0',
      }}>
        {label}
      </div>
      <div style={{ padding: '0 1px' }}>
        {children}
      </div>
    </div>
  )
}

const INPUT = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text1)', fontFamily: MONO, fontSize: 11,
  padding: '6px 8px', borderRadius: 4, boxSizing: 'border-box', outline: 'none',
}

const SELECT = { ...INPUT, cursor: 'pointer' }

const SECTION = {
  padding: '12px', background: 'var(--bg2)',
  border: '1px solid var(--border)', borderRadius: 6,
  marginBottom: 10,
}

const SECTION_TITLE = {
  fontFamily: MONO, fontSize: 9, color: 'var(--text3)',
  letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase',
}

export default function StrategyEditorPanel({
  strForm, setStrForm, definition, setDefinition,
  conditions, strategy,
  onSave, onCancel, onDelete, saving,
}) {
  const refs = definition?.condition_refs || {}
  const entry = definition?.entry || definition?.setup || {}
  const stop  = definition?.stop || {}
  const exit  = definition?.exit || {}
  const mgmt  = definition?.management || {}

  function setRef(role, condId) {
    setDefinition(prev => ({
      ...prev,
      condition_refs: { ...(prev?.condition_refs || {}), [role]: condId || null },
    }))
  }

  function setEntryField(key, val) {
    setDefinition(prev => ({
      ...prev,
      entry: { ...(prev?.entry || prev?.setup || {}), [key]: val },
    }))
  }

  function setStopField(key, val) {
    setDefinition(prev => ({
      ...prev,
      stop: { ...(prev?.stop || {}), [key]: val },
    }))
  }

  function setExitField(key, val) {
    setDefinition(prev => ({
      ...prev,
      exit: { ...(prev?.exit || {}), [key]: val },
    }))
  }

  function setMgmtField(key, val) {
    setDefinition(prev => ({
      ...prev,
      management: { ...(prev?.management || {}), [key]: val },
    }))
  }

  function getCondName(condId) {
    if (!condId) return null
    return conditions.find(c => c.id === condId)?.name || condId
  }

  const hasEntryType = entry.type
  const hasStopType  = stop.type
  const hasExitType  = exit.type

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
          {strategy?.id ? 'Editando' : 'Nueva estrategia'}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 14, fontWeight: 700,
          color: strForm.color || 'var(--accent)',
        }}>
          {strForm.name || '—'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {strategy?.id && (
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

      {/* ── Spreadsheet body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>

        {/* ── Row 1: Basic fields ── */}
        <div style={{ ...SECTION, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Cell label="Nombre" wide>
            <input
              type="text"
              value={strForm.name || ''}
              onChange={e => setStrForm(p => ({ ...p, name: e.target.value }))}
              style={{ ...INPUT, minWidth: 180 }}
              placeholder="Nombre de la estrategia"
            />
          </Cell>
          <Cell label="Capital (€)">
            <input
              type="number" min={100}
              value={strForm.capital_ini || ''}
              onChange={e => setStrForm(p => ({ ...p, capital_ini: Number(e.target.value) }))}
              style={INPUT}
            />
          </Cell>
          <Cell label="Asignación (%)">
            <input
              type="number" min={1} max={100}
              value={strForm.allocation_pct || 100}
              onChange={e => setStrForm(p => ({ ...p, allocation_pct: Number(e.target.value) }))}
              style={INPUT}
            />
          </Cell>
          <Cell label="Años BT">
            <input
              type="number" min={1} max={20}
              value={strForm.years || 5}
              onChange={e => setStrForm(p => ({ ...p, years: Number(e.target.value) }))}
              style={INPUT}
            />
          </Cell>
          <Cell label="Color">
            <input
              type="color"
              value={strForm.color || '#00d4ff'}
              onChange={e => setStrForm(p => ({ ...p, color: e.target.value }))}
              style={{ ...INPUT, padding: 2, height: 32, cursor: 'pointer' }}
            />
          </Cell>
        </div>

        {/* ── Row 2: Entry / Setup ── */}
        <div style={{ ...SECTION, borderColor: hasEntryType ? '#00e5a030' : 'var(--border)' }}>
          <div style={{ ...SECTION_TITLE, color: hasEntryType ? '#00e5a0' : 'var(--text3)' }}>
            Entrada (Entry / Setup)
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cell label="Tipo" color="#00e5a0" wide>
              <select value={entry.type || ''} onChange={e => setEntryField('type', e.target.value)} style={SELECT}>
                <option value="">— Sin tipo —</option>
                {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Cell>
            <Cell label="EMA Rápida">
              <input type="number" min={1}
                value={entry.ma_fast ?? ''}
                onChange={e => setEntryField('ma_fast', Number(e.target.value))}
                style={INPUT} placeholder="10"
              />
            </Cell>
            <Cell label="EMA Lenta">
              <input type="number" min={2}
                value={entry.ma_slow ?? ''}
                onChange={e => setEntryField('ma_slow', Number(e.target.value))}
                style={INPUT} placeholder="11"
              />
            </Cell>
            <Cell label="Tipo MA">
              <select value={entry.ma_type || 'EMA'} onChange={e => setEntryField('ma_type', e.target.value)} style={SELECT}>
                <option value="EMA">EMA</option>
                <option value="SMA">SMA</option>
              </select>
            </Cell>
          </div>
        </div>

        {/* ── Row 3: Stop ── */}
        <div style={{ ...SECTION, borderColor: hasStopType ? '#ff4d6d30' : 'var(--border)' }}>
          <div style={{ ...SECTION_TITLE, color: hasStopType ? '#ff4d6d' : 'var(--text3)' }}>
            Stop Loss
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cell label="Tipo" color="#ff4d6d" wide>
              <select value={stop.type || ''} onChange={e => setStopField('type', e.target.value)} style={SELECT}>
                <option value="">— Sin stop —</option>
                {STOP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Cell>
            <Cell label="Período MA">
              <input type="number" min={1}
                value={stop.ma_period ?? ''}
                onChange={e => setStopField('ma_period', Number(e.target.value))}
                style={INPUT} placeholder="10"
              />
            </Cell>
            <Cell label="Tipo MA">
              <select value={stop.ma_type || 'EMA'} onChange={e => setStopField('ma_type', e.target.value)} style={SELECT}>
                <option value="EMA">EMA</option>
                <option value="SMA">SMA</option>
              </select>
            </Cell>
            {stop.type === 'atr_based' && <>
              <Cell label="ATR Período">
                <input type="number" min={1}
                  value={stop.atr_period ?? 14}
                  onChange={e => setStopField('atr_period', Number(e.target.value))}
                  style={INPUT}
                />
              </Cell>
              <Cell label="ATR Mult">
                <input type="number" min={0.1} step={0.1}
                  value={stop.atr_mult ?? 1.0}
                  onChange={e => setStopField('atr_mult', Number(e.target.value))}
                  style={INPUT}
                />
              </Cell>
            </>}
          </div>
        </div>

        {/* ── Row 4: Exit ── */}
        <div style={{ ...SECTION, borderColor: hasExitType ? '#ffd16630' : 'var(--border)' }}>
          <div style={{ ...SECTION_TITLE, color: hasExitType ? '#ffd166' : 'var(--text3)' }}>
            Salida (Exit)
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cell label="Tipo" color="#ffd166" wide>
              <select value={exit.type || ''} onChange={e => setExitField('type', e.target.value)} style={SELECT}>
                <option value="">— Sin salida —</option>
                {EXIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Cell>
            <Cell label="Período MA">
              <input type="number" min={1}
                value={exit.ma_period ?? ''}
                onChange={e => setExitField('ma_period', Number(e.target.value))}
                style={INPUT} placeholder="10"
              />
            </Cell>
            <Cell label="Tipo MA">
              <select value={exit.ma_type || 'EMA'} onChange={e => setExitField('ma_type', e.target.value)} style={SELECT}>
                <option value="EMA">EMA</option>
                <option value="SMA">SMA</option>
              </select>
            </Cell>
          </div>
        </div>

        {/* ── Row 5: Management ── */}
        <div style={SECTION}>
          <div style={SECTION_TITLE}>Gestión</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!mgmt.sin_perdidas}
                onChange={e => setMgmtField('sin_perdidas', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text1)' }}>Sin pérdidas</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text3)' }}>
                (mover stop a BE cuando entra en beneficio)
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!mgmt.reentry}
                onChange={e => setMgmtField('reentry', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text1)' }}>Reentrada</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text3)' }}>
                (permite múltiples entradas en el mismo activo)
              </span>
            </label>
          </div>
        </div>

        {/* ── Row 6: Condition refs (library links) ── */}
        <div style={SECTION}>
          <div style={SECTION_TITLE}>
            Vincular condiciones de la librería
            <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 9, fontWeight: 400 }}>— opcional</span>
            {conditions.length === 0 && (
              <span style={{ color: '#ffd166', marginLeft: 8, fontSize: 9 }}>
                ⚠ Sin condiciones en la librería. Créalas en el panel 🔧 Condiciones.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ROLES.map(r => (
              <Cell key={r.key} label={r.label} color={r.color}>
                <CondSelect
                  role={r.key}
                  conditions={conditions}
                  value={refs[r.key] || null}
                  onChange={condId => setRef(r.key, condId)}
                />
                {refs[r.key] && (
                  <div style={{
                    marginTop: 3, fontFamily: MONO, fontSize: 9,
                    color: r.color, opacity: 0.8, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={getCondName(refs[r.key])}>
                    ✓ {getCondName(refs[r.key])}
                  </div>
                )}
              </Cell>
            ))}
          </div>
        </div>

        {/* ── Row 7: Observaciones ── */}
        <div style={SECTION}>
          <Cell label="Observaciones" wide style={{ flex: 1 }}>
            <textarea
              value={strForm.observations || ''}
              onChange={e => setStrForm(p => ({ ...p, observations: e.target.value }))}
              rows={3}
              style={{ ...INPUT, resize: 'vertical', width: '100%', minHeight: 60 }}
              placeholder="Notas sobre la estrategia…"
            />
          </Cell>
        </div>

      </div>
    </div>
  )
}
