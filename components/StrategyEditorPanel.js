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

const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.key, r.label]))

function conditionsForRole(conditions, role) {
  const tagged = conditions.filter(c => c.role === role)
  return tagged.length > 0 ? tagged : conditions
}

function CondSelect({ role, conditions, value, onChange }) {
  const r = ROLES.find(r => r.key === role)
  const opts = conditionsForRole(conditions, role)
  const hasTagged = conditions.some(c => c.role === role)
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
      {!hasTagged && opts.length > 0 && (
        <option disabled style={{ color: '#5a7a95', fontSize: 10 }}>── todas las condiciones ──</option>
      )}
      {opts.map(c => (
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
  padding: '6px 8px', borderRadius: 4, boxSizing: 'border-box',
}

export default function StrategyEditorPanel({
  strForm, setStrForm, definition, setDefinition,
  conditions, strategy,
  onSave, onCancel, onDelete, saving,
}) {
  const refs = definition?.condition_refs || {}

  function setRef(role, condId) {
    setDefinition(prev => ({
      ...prev,
      condition_refs: { ...(prev?.condition_refs || {}), [role]: condId || null },
    }))
  }

  function getCondName(condId) {
    if (!condId) return null
    return conditions.find(c => c.id === condId)?.name || condId
  }

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
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          padding: '12px', background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: 6,
          marginBottom: 10,
        }}>
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

        {/* ── Row 2: Role dropdowns ── */}
        <div style={{
          padding: '12px', background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: 6,
          marginBottom: 10,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, color: 'var(--text3)',
            letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase',
          }}>
            Componentes de la estrategia
            {!conditions.some(c => c.role) && conditions.length > 0 && (
              <span style={{ color: '#ffd166', marginLeft: 8, fontSize: 9 }}>
                ⚠ Las condiciones no tienen rol asignado — se muestran todas en cada desplegable.
                Asigna roles en el panel de Condiciones.
              </span>
            )}
            {conditions.length === 0 && (
              <span style={{ color: '#ffd166', marginLeft: 8, fontSize: 9 }}>
                ⚠ Sin condiciones en la librería. Créalas primero en el panel 🔧 Condiciones.
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

        {/* ── Row 3: Observaciones ── */}
        <div style={{
          padding: '12px', background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <Cell label="Observaciones" wide style={{ flex: 1 }}>
            <textarea
              value={strForm.observations || ''}
              onChange={e => setStrForm(p => ({ ...p, observations: e.target.value }))}
              rows={3}
              style={{
                ...INPUT, resize: 'vertical', width: '100%', minHeight: 60,
              }}
              placeholder="Notas sobre la estrategia…"
            />
          </Cell>
        </div>

      </div>
    </div>
  )
}
