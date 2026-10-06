// components/DiagnosticoPanel.js — sección plegable «Diagnóstico» del backtest individual.
//
// Pinta lo que calcula lib/diagnostico.js a partir de la respuesta del backtest: no calcula nada por su
// cuenta ni llama al servidor. Contraída por defecto, con una línea de resumen («3 avisos»); el estado se
// recuerda en este navegador. Se lee en el montaje y no en el useState inicial: en el servidor no hay
// localStorage.
import { useState, useEffect, useMemo } from 'react'
import { MONO } from '../lib/utils'
import { diagnostico, resumenSinOperaciones } from '../lib/diagnostico'

const CLAVE = 'v50_diagnostico_abierto'

// Línea que explica un resumen sin operaciones (las métricas salen a cero): «Ninguna operación en el
// periodo» y, si los filtros bloquearon entradas, cuántas y por qué filtros. Mismo chip ámbar que el
// aviso de cobertura del histórico.
export function AvisoSinOperaciones({ result }) {
  const lineas = resumenSinOperaciones(result)
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,209,102,0.12)', color: '#ffd166', padding: '4px 10px',
      borderBottom: '1px solid var(--border)', lineHeight: 1.45 }}>
      {lineas.map((l, i) => <div key={i}>{i === 0 ? '⚠ ' : ''}{l}</div>)}
    </div>
  )
}
const AMBAR = '#ffd166'

export default function DiagnosticoPanel({ result, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  useEffect(() => { try { const v = localStorage.getItem(CLAVE); if (v === '1') setAbierto(true); if (v === '0') setAbierto(false) } catch (_) {} }, [])
  const alterna = () => setAbierto(a => { const n = !a; try { localStorage.setItem(CLAVE, n ? '1' : '0') } catch (_) {}; return n })
  const d = useMemo(() => (result ? diagnostico(result) : null), [result])
  if (!d || !d.bloques.length) return null
  return (
    <div style={{ borderTop: '1px solid var(--border)', fontFamily: MONO }}>
      <div onClick={alterna} title={abierto ? 'Contraer el diagnóstico' : 'Ver el diagnóstico de la estrategia'}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 9, color: '#7a9bc0', width: 9 }}>{abierto ? '▾' : '▸'}</span>
        <span style={{ fontSize: 10, color: '#b8d8f0', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>DIAGNÓSTICO</span>
        <span style={{ fontSize: 10, color: d.avisos ? AMBAR : '#5a7a95' }}>{d.avisos ? '⚠ ' : ''}{d.resumen}</span>
      </div>
      {abierto && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.bloques.map(b => (
            <div key={b.id} style={{ borderLeft: `2px solid ${b.aviso ? AMBAR : '#1e3a52'}`, padding: '2px 0 2px 8px',
              background: b.aviso ? 'rgba(255,209,102,0.06)' : 'transparent' }}>
              <div style={{ fontSize: 10, color: b.aviso ? AMBAR : '#7a9bc0', marginBottom: 2 }}>{b.aviso ? '⚠ ' : ''}{b.titulo}</div>
              {b.frases.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: '#c8dff5', lineHeight: 1.45 }}>{f}</div>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#3d5a7a' }}>Calculado por la aplicación a partir de las operaciones del backtest, sin IA.</div>
        </div>
      )}
    </div>
  )
}
