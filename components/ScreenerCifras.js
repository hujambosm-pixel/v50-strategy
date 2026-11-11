// components/ScreenerCifras.js — el DESPLEGABLE de cifras de un filtro del screener (docs/screener.md §17; boceto
// bocetos/screener-desplegable.html, aprobado por Sergi el 11/11). Sustituye al <select> con «Otra cifra…»: un <select> no admite
// botones dentro. Al pasar el ratón por una cifra salen ✎ (cambiarla) y 🗑 (quitarla de la lista); abajo, «+ Añadir cifra» y
// «↺ Las de fábrica». La lista se ordena sola (lib/screener/opciones.js). Una cifra de la vista que no está en la lista sale arriba,
// en gris, «· no está en tu lista», con ＋ para añadirla.
//   f: el filtro · c: su configuración en la vista ({ on, op, valor }) · lista: sus cifras [[op, cifra]] (las tuyas o las de fábrica)
//   onElige(null) = «Cualquiera» (apagado); onElige([op, cifra]) = encenderlo con esa cifra
//   onLista(nueva | null): guardar tu lista (null = volver a las de fábrica) · estilo: el de la caja cerrada · abiertoInicial: pruebas
import { useEffect, useRef, useState } from 'react'
import { B } from '../lib/screener/colores'
import { Papelera } from './VentanaPregunta'
import { conCifra, cambiaCifra, sinCifra, textoCondicion } from '../lib/screener/opciones'

const icono = { border: 'none', background: 'none', padding: '0 4px', cursor: 'pointer', fontSize: 13, color: B.secundario, fontFamily: B.letra }

export default function ScreenerCifras({ f, c, lista, onElige, onLista, estilo, abiertoInicial = false, disabled = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [edita, setEdita] = useState(null)   // { k (índice o 'nueva'), op, valor (texto) }
  const ref = useRef(null)
  const on = !!c?.on
  const enLista = on && lista.some(x => x[0] === c.op && x[1] === c.valor)
  const cierra = () => { setAbierto(false); setEdita(null) }
  useEffect(() => {
    if (!abierto || typeof document === 'undefined') return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cierra() }
    const tecla = (e) => { if (e.key === 'Escape') { if (edita) setEdita(null); else cierra() } }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto, !!edita])

  const elige = (x) => { onElige(x); cierra() }
  const valido = (e) => e && e.valor !== '' && Number.isFinite(Number(String(e.valor).replace(',', '.')))
  const guarda = () => {
    if (!valido(edita)) return
    const v = Number(String(edita.valor).replace(',', '.'))
    if (edita.k === 'nueva') onLista(conCifra(f, lista, edita.op, v))
    else {
      const era = lista[edita.k]
      onLista(cambiaCifra(f, lista, edita.k, edita.op, v))
      if (on && era && era[0] === c.op && era[1] === c.valor) onElige([edita.op, v])   // cambiar la elegida cambia el filtro de esta vista
    }
    setEdita(null)
  }
  const filaEdita = (k) => (
    <div data-edita-cifra={k} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px 3px 10px', background: B.cabecera }}>
      <select data-edita-op value={edita.op} onChange={e => setEdita(x => ({ ...x, op: e.target.value }))}
        style={{ fontFamily: B.letra, fontSize: 13, color: B.texto, background: B.caja, border: `1px solid ${B.selBorde}`, borderRadius: 4, padding: '0 2px' }}><option>≥</option><option>≤</option></select>
      <input data-edita-valor autoFocus type="number" step="any" value={edita.valor} placeholder="cifra" onChange={e => setEdita(x => ({ ...x, valor: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') guarda() }}
        style={{ width: 72, textAlign: 'right', fontFamily: B.letra, fontSize: 13, color: B.texto, background: B.caja, border: `1px solid ${B.selBorde}`, borderRadius: 4, padding: '0 4px' }}/>
      <span style={{ color: B.secundario }}>{f.unidad}</span>
      <span style={{ flex: 1 }}/>
      <button data-edita-ok title="Guardar (Enter)" onClick={guarda} disabled={!valido(edita)} style={{ ...icono, color: valido(edita) ? 'var(--sc-verde)' : B.apagado, opacity: 1 }}>✓</button>
      <button data-edita-cancela title="Cancelar (Esc)" onClick={() => setEdita(null)} style={{ ...icono, opacity: 1 }}>✕</button>
    </div>)

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button data-opcion={f.id} disabled={disabled} onClick={() => abierto ? cierra() : setAbierto(true)} title={on ? textoCondicion(f, c.op, c.valor) : undefined}
        style={{ ...estilo, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, textAlign: 'left', cursor: disabled ? 'default' : 'pointer' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{on ? textoCondicion(f, c.op, c.valor) : 'Cualquiera'}</span><span style={{ fontSize: 10 }}>▾</span>
      </button>
      {abierto && (
        <div data-lista-cifras={f.id} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 40, marginTop: 2, width: 260, background: B.tarjeta, border: `1px solid ${B.borde}`,
          borderRadius: 7, boxShadow: `0 8px 24px ${B.sombra}`, padding: '4px 0', fontFamily: B.letra, fontSize: 13, color: B.texto }}>
          <div data-fila-cifra="" data-cifra="no" onClick={() => elige(null)} style={{ padding: '3px 10px', cursor: 'pointer', ...(on ? {} : { background: B.sel, fontWeight: 600 }) }}>Cualquiera</div>
          {on && !enLista && (
            <div data-fila-cifra="" data-fuera-lista style={{ display: 'flex', alignItems: 'center', padding: '3px 6px 3px 10px', background: B.sel }}>
              <span style={{ flex: 1, color: B.secundario, fontStyle: 'italic' }}>{textoCondicion(f, c.op, c.valor)} · no está en tu lista</span>
              <button data-anadir-elegida title="Añadirla a tu lista" onClick={() => onLista(conCifra(f, lista, c.op, c.valor))} style={{ ...icono, opacity: 1 }}>＋</button>
            </div>)}
          {lista.map((x, k) => edita?.k === k ? <div key={k}>{filaEdita(k)}</div> : (
            <div key={k} data-fila-cifra="" data-cifra={k} onClick={() => elige(x)}
              style={{ display: 'flex', alignItems: 'center', padding: '3px 6px 3px 10px', cursor: 'pointer', ...(on && x[0] === c.op && x[1] === c.valor ? { background: B.sel, fontWeight: 600 } : {}) }}>
              <span style={{ flex: 1 }}>{textoCondicion(f, x[0], x[1])}</span>
              <button className="sc-ic" data-editar={k} title="Cambiar esta cifra" onClick={e => { e.stopPropagation(); setEdita({ k, op: x[0], valor: String(x[1]) }) }} style={icono}>✎</button>
              <button className="sc-ic sc-borra" data-quitar-cifra={k} title="Quitarla de la lista" onClick={e => { e.stopPropagation(); onLista(sinCifra(f, lista, k)) }} style={icono}><Papelera tamano={13}/></button>
            </div>))}
          {edita?.k === 'nueva' && filaEdita('nueva')}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${B.borde}`, marginTop: 4, padding: '4px 10px 2px' }}>
            <button data-nueva-cifra onClick={() => setEdita({ k: 'nueva', op: f.op, valor: '' })} style={{ ...icono, padding: 0, color: B.enlace, fontSize: 12 }}>+ Añadir cifra</button>
            <button data-fabrica title="Vuelve a las cifras que trae la app" onClick={() => { setEdita(null); onLista(null) }} style={{ ...icono, padding: 0, fontSize: 12 }}>↺ Las de fábrica</button>
          </div>
        </div>)}
    </span>)
}
