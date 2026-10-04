import { useState, useEffect } from 'react'
import SelectorPeriodo from './SelectorPeriodo'
import { MONO, numeroEs, textoEs } from '../lib/utils'
import { TEMPORALIDADES, saneaCapital } from '../lib/condicionesSimulacion'

// components/CondicionesSimulacion.js — el panel de las condiciones de la simulación.
//
// Reúne en un sitio los tres campos que dicen CÓMO se mide una estrategia —periodo, capital inicial y
// temporalidad— y que estaban repartidos entre las columnas de la tabla `strategies`, un distintivo en
// la cabecera del gráfico y un bloque suelto del multibacktest. Ver lib/condicionesSimulacion.js para
// el modelo y el por qué.
//
// NO GUARDA NADA: recibe cada valor y su setter, igual que SelectorPeriodo, y el periodo lo delega en
// ese mismo componente en vez de reimplementarlo. Cada pantalla conserva su estado, así que cambiar el
// capital del multibacktest no toca el del backtest individual.
//
// CADA CAMPO ES OPCIONAL y se pinta solo si llega su setter. El multibacktest pasa la temporalidad
// por `cambiarMcIntervalo`, que además resetea su ventana RS: llamar al setter a pelo se lo saltaría.
//
// LAS COMISIONES son la cuarta condición. Sus tres campos arrancan con los valores de Ajustes y se
// pueden cambiar para la simulación en curso sin tocarlos, igual que la temporalidad. Los decimales
// se escriben con COMA: un <input type="number"> no la acepta en todos los navegadores y «0,36»
// dejaría el campo vacío, así que van por un campo de TEXTO con numeroEs/textoEs (lib/utils.js).
// El cálculo vive en lib/comisiones.js; aquí solo se recogen.

const sLbl   = { fontFamily: MONO, fontSize: 11, color: '#7aabc8', whiteSpace: 'nowrap' }
const sUnid  = { fontFamily: MONO, fontSize: 11, color: '#4a6a88' }
// El mismo estilo exacto que tenía la casilla de capital del multibacktest, con las propiedades en el
// mismo orden: React serializa `style` por orden de claves y así ese campo sale idéntico a antes.
const sNum   = { flex: 1, fontFamily: MONO, fontSize: 11, background: 'var(--bg2)',
                 border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px',
                 color: 'var(--fg)', textAlign: 'right' }
// Diario en verde y semanal en ámbar, los colores que ya usaba el bloque INTERVALO del multibacktest:
// el color es lo que distingue las dos temporalidades de un vistazo en toda la aplicación.
const TEMPO_OPC = [
  { id: 'diario',  label: 'Diario',  activeColor: '#4caf82', activeBorder: '#2d6e4e', activeBg: 'rgba(76,175,130,0.12)' },
  { id: 'semanal', label: 'Semanal', activeColor: '#f0c040', activeBorder: '#a07820', activeBg: 'rgba(240,192,64,0.12)' },
]

const Fila = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
)

// Campo de texto con coma decimal. El texto que se está escribiendo es estado SUYO: mientras el
// usuario teclea «0,» no hay número válido todavía, y convertirlo en 0 a cada pulsación borraría lo
// que acaba de escribir. Al salir del campo se confirma; si no hay número, vuelve al valor anterior.
function CampoDecimal({ valor, alCambiar, dec = 2 }) {
  const [txt, setTxt] = useState(() => textoEs(valor, dec))
  useEffect(() => { setTxt(textoEs(valor, dec)) }, [valor, dec])
  return (
    <input type="text" inputMode="decimal" value={txt}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { const n = numeroEs(txt); if (n != null && n >= 0) alCambiar(n); else setTxt(textoEs(valor, dec)) }}
      style={sNum} />
  )
}

export default function CondicionesSimulacion({
  // periodo (se delega en SelectorPeriodo)
  modo, setModo, years, setYears, desde, setDesde, hasta, setHasta,
  // el resto de condiciones; cada una se pinta solo si llega su setter
  capitalIni, setCapitalIni,
  temporalidad, setTemporalidad,
  comisiones, setComisiones,
  // La temporalidad que declara la estrategia (su valor por defecto, y el que usa el ranking). Si se
  // pasa y no coincide con la de la simulación, se avisa: se está explorando, no se ha cambiado la
  // estrategia. Sin ese aviso un backtest en semanal sobre una estrategia diaria parece ser la
  // estrategia, que es justo la confusión que este panel viene a quitar.
  temporalidadEstrategia = null,
  titulo = 'CONDICIONES DE LA SIMULACIÓN', variant = 'mc',
}) {
  const padX = variant === 'panel' ? 10 : 12
  const explorando = !!(temporalidadEstrategia && temporalidad && temporalidadEstrategia !== temporalidad)
  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)',
                  padding: `10px ${padX}px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {titulo && (
        <span style={{ fontFamily: MONO, fontSize: 12, color: '#c8dff5', fontWeight: 600,
                       letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{titulo}</span>
      )}

      {setCapitalIni && (
        <Fila>
          <span style={sLbl}>Capital inicial</span>
          <input type="number" min={100} max={1000000} step={100} value={capitalIni}
            onChange={e => setCapitalIni(saneaCapital(e.target.value))}
            style={sNum} />
          <span style={sUnid}>€</span>
        </Fila>
      )}

      <SelectorPeriodo
        modo={modo} setModo={setModo}
        years={years} setYears={setYears}
        desde={desde} setDesde={setDesde}
        hasta={hasta} setHasta={setHasta} />

      {setComisiones && comisiones && (
        <>
          <Fila>
            <span style={sLbl}>Comisión compra</span>
            <CampoDecimal valor={comisiones.compra}
              alCambiar={v => setComisiones({ ...comisiones, compra: v })} />
            <span style={sUnid}>€</span>
          </Fila>
          <Fila>
            <span style={sLbl}>Comisión venta</span>
            <CampoDecimal valor={comisiones.venta}
              alCambiar={v => setComisiones({ ...comisiones, venta: v })} />
            <span style={sUnid}>€</span>
          </Fila>
          <Fila>
            <span style={sLbl}>Comisión por operación</span>
            <CampoDecimal valor={comisiones.porcentaje} dec={3}
              alCambiar={v => setComisiones({ ...comisiones, porcentaje: v })} />
            <span style={sUnid}>%</span>
          </Fila>
        </>
      )}

      {setTemporalidad && (
        <Fila>
          <span style={sLbl}>Temporalidad</span>
          {explorando && (
            <span title={'Temporalidad de la estrategia: ' + temporalidadEstrategia +
                         '. Aquí solo cambia la simulación en curso; la estrategia se edita en su editor.'}
              style={{ fontFamily: MONO, fontSize: 9, color: '#ffd166',
                background: 'rgba(255,209,102,0.12)', border: '1px solid rgba(255,209,102,0.3)',
                borderRadius: 2, padding: '0 4px', lineHeight: '14px', flexShrink: 0, cursor: 'help' }}>
              explorando
            </span>
          )}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {TEMPO_OPC.filter(o => TEMPORALIDADES.includes(o.id)).map(opt => (
              <button key={opt.id} onClick={() => setTemporalidad(opt.id)}
                style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${temporalidad === opt.id ? opt.activeBorder : 'var(--border)'}`,
                  background: temporalidad === opt.id ? opt.activeBg : 'transparent',
                  color: temporalidad === opt.id ? opt.activeColor : '#7aabc8' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </Fila>
      )}
    </div>
  )
}
