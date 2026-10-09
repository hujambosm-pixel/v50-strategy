import { useState, useEffect } from 'react'
import { isoAMostrar, mostradoAIso } from './SelectorPeriodo'

// components/CampoFecha.js — una fecha escrita SIEMPRE como día/mes/año, sin depender del idioma del navegador.
//
// POR QUÉ. Un <input type="date"> se pinta y se teclea en el formato del navegador: en uno configurado en
// inglés, «08/10/2026» es el 10 de agosto. Aquí la caja es de texto, se lee como dd/mm/aaaa (también d/m/aaaa)
// con la misma conversión que SelectorPeriodo, y el valor que sale es siempre ISO (AAAA-MM-DD).
//
// `valor` es la fecha ISO buena; `onCambio(iso)` solo se llama con fechas posibles (31/02 no lo es) y
// `onValidez(bool)` dice si lo escrito ahora mismo es una fecha válida, para que la pantalla no deje lanzar.

// d/m/aaaa o dd/mm/aaaa → ISO, o null si no es una fecha posible.
export function textoAIso(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(s ?? ''))
  return m ? mostradoAIso(`${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`) : null
}

export default function CampoFecha({ valor, onCambio, onValidez = null, style = {}, avisoStyle = {} }) {
  const [txt, setTxt] = useState(() => isoAMostrar(valor))
  // Si la fecha cambia DESDE FUERA (p. ej. «Últimos 5 años completos»), la caja la enseña.
  useEffect(() => { if (textoAIso(txt) !== valor) setTxt(isoAMostrar(valor)) }, [valor])
  const valida = textoAIso(txt) != null
  useEffect(() => { if (onValidez) onValidez(valida) }, [valida])
  return (<>
    <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={txt} aria-invalid={!valida}
      onChange={e => { setTxt(e.target.value); const iso = textoAIso(e.target.value); if (iso) onCambio(iso) }}
      style={{ ...style, ...(valida ? {} : { borderColor: '#ff4d6d' }) }} />
    {!valida && <span style={{ color: '#ff4d6d', ...avisoStyle }}>Fecha no válida: escríbela como dd/mm/aaaa (p. ej. 08/10/2026)</span>}
  </>)
}
