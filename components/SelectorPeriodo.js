import { useState, useEffect } from 'react'
import { MONO } from '../lib/utils'

// components/SelectorPeriodo.js — el periodo del backtest, en un solo sitio.
//
// POR QUÉ EXISTE. El multibacktest tenía su selector Años|Fechas y el backtest individual no tenía
// ninguno: su periodo salía de la columna `years` de la estrategia y no se podía cambiar sin editar la
// estrategia. Con dos sitios distintos no se podía comparar el mismo rango en las dos pantallas, que
// es justo lo que hace falta para fiarse de un resultado.
//
// ESTADO SEPARADO POR PANTALLA, a propósito: el componente no guarda nada, lo recibe y lo devuelve.
// Cada pantalla tiene su periodo y cambiar uno no mueve el otro. Lo único que es suyo son las dos
// cajas de texto dd/mm/yyyy, que son presentación: el valor que viaja es siempre ISO.
//
// «ÚLTIMOS N AÑOS» SE TRADUCE AQUÍ, en el cliente (rangoDePeriodo): el servidor recibe siempre
// desde/hasta y tiene UN solo camino. Si la traducción viviera en el servidor, el cliente no podría
// decir qué periodo ha pedido ni enseñarlo, y «5 años» en una pantalla y «5 años» en la otra podrían
// caer en días distintos según cuándo llegara cada petición.

const esISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const isoAMostrar = (s) => esISO(s) ? s.split('-').reverse().join('/') : (s || '')
// dd/mm/yyyy → ISO. Devuelve null si no es una fecha válida, y entonces la caja vuelve a su valor.
export const mostradoAIso = (s) => {
  if (!s || !/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null
  const [d, m, y] = s.split('/')
  const iso = `${y}-${m}-${d}`
  const t = new Date(iso)
  if (isNaN(t) || t.toISOString().slice(0, 10) !== iso) return null   // 31/02/2024 no existe
  return iso
}

// El periodo que se manda al servidor. En modo Años: desde = hoy − N años, hasta = hoy.
export function rangoDePeriodo({ modo, years, desde, hasta, hoy = new Date() } = {}) {
  if (modo === 'range') return { fromDate: desde || null, toDate: hasta || null }
  const n = Math.max(1, Math.round(Number(years) || 5))
  const d = new Date(hoy.getTime())
  d.setFullYear(d.getFullYear() - n)
  return { fromDate: d.toISOString().slice(0, 10), toDate: hoy.toISOString().slice(0, 10) }
}

// Estado inicial de una pantalla: modo Años con N años, y el rango ya rellenado con esos mismos N
// años, para que cambiar a Fechas no empiece con las cajas vacías.
export function periodoInicial(years = 5) {
  const r = rangoDePeriodo({ modo: 'years', years })
  return { modo: 'years', years, desde: r.fromDate, hasta: r.toDate }
}

const sLbl   = { fontFamily: MONO, fontSize: 11, color: '#7aabc8', whiteSpace: 'nowrap' }
const sLbl2  = { fontFamily: MONO, fontSize: 11, color: '#4a6a88', whiteSpace: 'nowrap' }
// Los dos estilos se escriben con las MISMAS propiedades y en el MISMO orden que tenía el bloque que
// vivía dentro de pages/index.js, porque React serializa `style` en el orden de las claves: así el HTML
// del selector del multibacktest sale byte a byte idéntico al de antes y está medido que lo hace. Por
// eso el campo de los años lleva `flex:1` sin `width`, y las fechas `width:100%` sin `boxSizing`: no es
// descuido, es lo que había.
const sAnios = { flex: 1, fontFamily: MONO, fontSize: 11, background: 'var(--bg2)',
                 border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px',
                 color: 'var(--fg)', textAlign: 'right' }
const sFecha = { width: '100%', fontFamily: MONO, fontSize: 11, background: 'var(--bg2)',
                 border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px',
                 color: 'var(--fg)' }

export default function SelectorPeriodo({
  modo, setModo, years, setYears, desde, setDesde, hasta, setHasta,
  titulo = 'Período', variant = 'mc',
}) {
  const [desdeTxt, setDesdeTxt] = useState(() => isoAMostrar(desde))
  const [hastaTxt, setHastaTxt] = useState(() => isoAMostrar(hasta))
  // Las cajas se resincronizan cuando el valor cambia DESDE FUERA (cargar otra estrategia, cambiar de
  // pantalla). Sin esto, la caja se quedaría enseñando la fecha de la estrategia anterior.
  useEffect(() => { setDesdeTxt(isoAMostrar(desde)) }, [desde])
  useEffect(() => { setHastaTxt(isoAMostrar(hasta)) }, [hasta])

  const wrap = variant === 'panel'
    ? { borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6 }
    : { display: 'flex', flexDirection: 'column', gap: 8 }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={sLbl}>{titulo}</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[{ id: 'years', label: 'Años' }, { id: 'range', label: 'Fechas' }].map(opt => (
            <button key={opt.id} onClick={() => setModo(opt.id)}
              style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                border: `1px solid ${modo === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                background: modo === opt.id ? 'rgba(0,212,255,0.12)' : 'transparent',
                color: modo === opt.id ? 'var(--accent)' : '#7aabc8' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {modo === 'years' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={sLbl2}>Años</span>
          <input type="number" min={1} max={20} step={1} value={years}
            onChange={e => setYears(Number(e.target.value))}
            style={sAnios} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...sLbl2, width: 32 }}>Desde</span>
            <input type="text" placeholder="dd/mm/yyyy" value={desdeTxt}
              onChange={e => setDesdeTxt(e.target.value)}
              onBlur={e => { const v = mostradoAIso(e.target.value); if (v) setDesde(v); else setDesdeTxt(isoAMostrar(desde)) }}
              style={sFecha} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...sLbl2, width: 32 }}>Hasta</span>
            <input type="text" placeholder="dd/mm/yyyy" value={hastaTxt}
              onChange={e => setHastaTxt(e.target.value)}
              onBlur={e => { const v = mostradoAIso(e.target.value); if (v) setHasta(v); else setHastaTxt(isoAMostrar(hasta)) }}
              style={sFecha} />
          </div>
        </div>
      )}
    </div>
  )
}
