import { useState } from 'react'
import { MONO } from '../lib/utils'

// ── Templates ─────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'blank',
    title: 'En blanco',
    desc: 'Empieza desde cero',
    badge: 'BLANK',
    badgeColor: '#6b7280',
    icon: '📄',
    definition: {},
    focusAI: false,
  },
  {
    id: 'ai',
    title: 'Asistente IA',
    desc: 'Describe tu estrategia en texto',
    badge: 'IA ✨',
    badgeColor: '#9b72ff',
    icon: '🤖',
    definition: {},
    focusAI: true,
  },
  {
    id: 'ema_cross',
    title: 'Cruce de EMAs',
    desc: 'Entrada al cruce alcista EMA rápida/lenta',
    badge: 'EMA',
    badgeColor: '#ffd166',
    icon: '📈',
    definition: {
      setup: { indicator:'EMA', condition:'crosses_above', params:{ fast:10, slow:20 } },
      exit:  { type:'close_below_ma', params:{ ma_period:10 } },
      stop:  { type:'tecnico' },
      mgmt:  { trailing:true, reentry:false },
    },
  },
  {
    id: 'rsi_oversold',
    title: 'RSI Sobrevendido',
    desc: 'Compra cuando RSI cruza al alza desde zona baja',
    badge: 'RSI',
    badgeColor: '#a78bfa',
    icon: '📉',
    definition: {
      setup: { indicator:'RSI', condition:'rsi_cross_up', params:{ period:14, level:30 } },
      exit:  { type:'rsi_above', params:{ period:14, level:70 } },
      stop:  { type:'fixed_pct', params:{ pct:5 } },
      mgmt:  { trailing:false, reentry:false },
    },
  },
  {
    id: 'macd_cross',
    title: 'MACD Cruce Señal',
    desc: 'Entrada cuando MACD cruza su línea de señal al alza',
    badge: 'MACD',
    badgeColor: '#fb923c',
    icon: '🔀',
    definition: {
      setup: { indicator:'MACD', condition:'macd_cross_up', params:{ fast:12, slow:26, signal:9 } },
      exit:  { type:'macd_cross_down', params:{ fast:12, slow:26, signal:9 } },
      stop:  { type:'atr_based', params:{ atr_period:14, atr_mult:2 } },
      mgmt:  { trailing:false, reentry:false },
    },
  },
  {
    id: 'price_above_ma',
    title: 'Precio sobre Media',
    desc: 'Compra cuando el precio supera su media móvil',
    badge: 'PRICE',
    badgeColor: '#00d4ff',
    icon: '🎯',
    definition: {
      setup: { indicator:'PRICE', condition:'price_above', params:{ ma_period:50 } },
      exit:  { type:'price_below_ma', params:{ ma_period:50 } },
      stop:  { type:'trailing_atr', params:{ atr_period:14, atr_mult:2 } },
      mgmt:  { trailing:true, reentry:false },
    },
  },
  {
    id: 'ema_sp500_filter',
    title: 'Cruce EMA + Filtro SP500',
    desc: 'Cruce de EMAs solo cuando SP500 está en tendencia',
    badge: 'EMA + FILTER',
    badgeColor: '#00e5a0',
    icon: '🛡️',
    definition: {
      filter: { market:[{ type:'precio_ema', params:{ sp500EmaR:50, sp500EmaL:200 } }] },
      setup:  { indicator:'EMA', condition:'crosses_above', params:{ fast:10, slow:20 } },
      exit:   { type:'close_below_ma', params:{ ma_period:10 } },
      stop:   { type:'tecnico' },
      mgmt:   { trailing:true, reentry:false },
    },
  },
  {
    id: 'ema_rsi_combo',
    title: 'RSI + EMA Combinado',
    desc: 'EMA como setup, RSI como confirmación de entrada',
    badge: 'EMA + RSI',
    badgeColor: '#c084fc',
    badgeColor2: '#ffd166',
    icon: '⚡',
    definition: {
      setup:   { indicator:'EMA', condition:'crosses_above', params:{ fast:10, slow:20 } },
      trigger: { indicator:'RSI', condition:'rsi_below', params:{ period:14, level:50 } },
      exit:    { type:'rsi_above', params:{ period:14, level:70 } },
      stop:    { type:'tecnico' },
      mgmt:    { trailing:true, reentry:false },
    },
  },
]

// ── Single card ───────────────────────────────────────────────────────
function TemplateCard({ tpl, onSelect, hovered, setHovered }) {
  const color  = tpl.badgeColor
  const color2 = tpl.badgeColor2 || null
  const isH    = hovered === tpl.id

  return (
    <button
      onMouseEnter={() => setHovered(tpl.id)}
      onMouseLeave={() => setHovered(null)}
      onClick={() => onSelect(tpl.definition, tpl.focusAI)}
      style={{
        textAlign: 'left',
        background: isH ? `${color}0d` : '#0a101a',
        border: `1px solid ${isH ? color : '#1a2d45'}`,
        borderRadius: 8,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Icon + Badge */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:22, lineHeight:1 }}>{tpl.icon}</span>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 3,
          background: color2
            ? `linear-gradient(90deg,${color}22,${color2}22)`
            : `${color}1a`,
          color: color,
          border: `1px solid ${color}33`,
          whiteSpace: 'nowrap',
        }}>
          {tpl.badge}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: MONO, fontSize: 13, fontWeight: 700,
        color: isH ? '#eef5ff' : '#cce0f8',
        transition: 'color 0.15s',
      }}>
        {tpl.title}
      </div>

      {/* Description */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#4a6a88', lineHeight: 1.5 }}>
        {tpl.desc}
      </div>
    </button>
  )
}

// ── Main export ───────────────────────────────────────────────────────
export default function TemplateGallery({ onSelect, onCancel }) {
  const [hovered, setHovered] = useState(null)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#080c14', overflow: 'hidden', fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 20px', borderBottom: '1px solid #1a2d45',
        background: '#0a101a', flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, color: '#00d4ff' }}>✦</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#c8dff5', flex: 1 }}>
          Nueva estrategia — Elige una plantilla
        </span>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent', border: '1px solid #1a2d45',
            color: '#4a6a88', fontFamily: MONO, fontSize: 11,
            padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          }}
        >
          ✕ Cancelar
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {TEMPLATES.map(tpl => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              onSelect={onSelect}
              hovered={hovered}
              setHovered={setHovered}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
