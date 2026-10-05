import { useState, useEffect } from 'react'
import SelectorPeriodo from './SelectorPeriodo'
import { MONO, fmt, fmtDate, numeroEs, textoEs } from '../lib/utils'
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
// SE MUESTRA CONTRAIDO. Son cuatro condiciones con siete campos, y lo normal es no tocarlas: una
// vez puestas, lo que hace falta es poder LEERLAS de un vistazo, no editarlas. Contraido deja una
// linea con el resumen de lo que se está aplicando —«10.000 € · 5 años · Diario · Comisión 0,36 €»—
// y devuelve el alto al resto del panel, donde están los filtros y la lista de estrategias.
// El estado abierto/cerrado se recuerda por PANTALLA en su propia clave de localStorage, igual que
// los ajustes de asignación (lib/mcAsignacion.js) y por el mismo motivo: v50_settings se reescribe
// entero al guardar, así que un dato que cambia a cada clic no puede vivir ahí.
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

// El resumen de una linea. Solo lo que se está aplicando de verdad: si una condición no se pasa al
// componente, no aparece. Las comisiones se resumen a lo que no es cero, y «Sin comisión» cuando
// no hay ninguna, que es un dato tan relevante como el contrario.
export function resumenCondiciones({ modo, years, desde, hasta, capitalIni, temporalidad, comisiones }) {
  const p = []
  if (capitalIni != null) p.push(fmt(capitalIni, 0) + ' €')
  if (modo === 'range') p.push(fmtDate(desde) + ' – ' + fmtDate(hasta))
  else if (years != null) p.push(years + (Number(years) === 1 ? ' año' : ' años'))
  if (temporalidad) p.push(temporalidad === 'semanal' ? 'Semanal' : 'Diario')
  if (comisiones) {
    const c = []
    // Los importes del resumen van con DOS decimales fijos, que es como se lee un precio: «0,20 €»
    // y no «0,2 €». En los campos de edicion es lo contrario —textoEs sin relleno—, porque ahi se
    // escribe y los ceros de mas estorban.
    if (comisiones.compra > 0) c.push(fmt(comisiones.compra, 2) + ' €')
    if (comisiones.venta > 0) c.push(fmt(comisiones.venta, 2) + ' €')
    if (comisiones.porcentaje > 0) c.push(textoEs(comisiones.porcentaje, 3) + ' %')
    p.push(c.length ? 'Comisión ' + c.join(' / ') : 'Sin comisión')
  }
  return p.join(' · ')
}

// Memoria del plegado. Una clave por pantalla, y si no llega ninguna no se recuerda nada: un
// componente sin clave no debe compartir la de otro.
const leeAbierto = (clave) => {
  if (!clave) return false
  try { return window.localStorage.getItem(clave) === '1' } catch (_) { return false }
}
const guardaAbierto = (clave, v) => {
  if (!clave) return
  try { window.localStorage.setItem(clave, v ? '1' : '0') } catch (_) {}
}

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
  // «CONDICIONES DE LA SIMULACIÓN» no cabe en la barra lateral y se cortaba.
  titulo = 'CONDICIONES SIMULACIÓN', variant = 'mc', claveLs = null,
}) {
  const padX = variant === 'panel' ? 10 : 12
  const explorando = !!(temporalidadEstrategia && temporalidad && temporalidadEstrategia !== temporalidad)
  // En el primer render SIEMPRE contraido, aunque localStorage diga lo contrario: el servidor no
  // tiene localStorage, y arrancar con un valor distinto del suyo rompe la hidratación de React.
  // El efecto lo abre justo después si estaba abierto.
  const [abierto, setAbierto] = useState(false)
  useEffect(() => { if (leeAbierto(claveLs)) setAbierto(true) }, [claveLs])
  const pliega = () => { const v = !abierto; setAbierto(v); guardaAbierto(claveLs, v) }
  const resumen = resumenCondiciones({ modo, years, desde, hasta, capitalIni, temporalidad, comisiones })
  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)',
                  padding: `10px ${padX}px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div onClick={pliega}
        title={abierto ? 'Pulsar para contraer' : 'Pulsar para desplegar y cambiar las condiciones'}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#4a7a9a', width: 10, flexShrink: 0 }}>
          {abierto ? '▼' : '▶'}</span>
        {titulo && (
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#c8dff5', fontWeight: 600,
                         letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>{titulo}</span>
        )}
        {/* El resumen solo contraido: desplegado lo dicen los campos, y repetirlo sobra. En ámbar
            cuando la temporalidad de la simulación no es la de la estrategia, que es el único dato
            del resumen que puede sorprender. */}
        {!abierto && resumen && (
          <span title={explorando
              ? 'Temporalidad de la estrategia: ' + temporalidadEstrategia + '. Aquí solo cambia la simulación en curso.'
              : resumen}
            style={{ fontFamily: MONO, fontSize: 10, marginLeft: 'auto', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              color: explorando ? '#ffd166' : '#7a9bc0' }}>
            {resumen}
          </span>
        )}
      </div>

      {abierto && (<>
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
      </>)}
    </div>
  )
}
