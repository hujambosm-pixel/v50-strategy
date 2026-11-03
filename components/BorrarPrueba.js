// components/BorrarPrueba.js — las ventanas de borrar una prueba contra el azar y de borrar una estrategia con sus pruebas (docs/builder.md, §60; boceto «Avisos al borrar»). Las mismas en el resultado del paso 2, en sus pruebas anteriores y en «Mi trabajo». El borrado lo hace quien las abre.
import { B, S } from '../lib/builder/estilo'
import { AVISO_BORRAR_PRUEBAS, descripcionPrueba } from '../lib/pruebaAzar'
import { Pregunta, ROJO_PAPELERA } from './VentanaPregunta'

export const botonRojo = { ...S.botonVerde, background: ROJO_PAPELERA, borderColor: ROJO_PAPELERA, color: '#fff' }
const fecha = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const AvisoSuerte = () => <div data-aviso-suerte style={{ color: '#f2cc60', background: 'rgba(210,153,34,0.12)', borderRadius: B.radioBoton, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>⚠ {AVISO_BORRAR_PRUEBAS}</div>
const filaLista = { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${B.borde}` }
const titulo = { fontSize: 12, color: B.secundario, margin: '8px 0 2px' }

// prueba: la fila de pruebas_azar. fallo: por qué no se pudo.
export function VentanaBorrarPrueba({ prueba, ocupado = false, fallo = null, onCancelar, onBorrar }) {
  return (
    <Pregunta id="borrar-prueba" texto="¿Borrar esta prueba? Desaparece del todo." detalle={`${descripcionPrueba(prueba)} del ${fecha(prueba.creada_en)}.`} aviso={fallo} extra={<AvisoSuerte/>}>
      <button data-boton="cancelar-borrar-prueba" disabled={ocupado} onClick={onCancelar} style={S.boton}>Cancelar</button>
      <button data-boton="si-borrar-prueba" disabled={ocupado} onClick={onBorrar} style={botonRojo}>{ocupado ? 'Borrando…' : 'Borrar la prueba'}</button>
    </Pregunta>)
}
// pruebas: las suyas (null: no se han podido leer; con una de tarjetas no se deja borrar sin saber qué se lleva). planes: [{ id, nombre }]: se quedan, con su copia guardada.
export function VentanaBorrarEstrategia({ nombre, pruebas, planes = [], deTarjetas = true, ocupado = false, fallo = null, onCancelar, onBorrar, onAbrirPlan }) {
  const sinLeer = deTarjetas && pruebas == null, xs = pruebas || []
  return (
    <Pregunta id="borrar-estrategia" texto={`¿Borrar la estrategia «${nombre}»?`} aviso={sinLeer ? 'No se han podido leer sus pruebas. Vuelve a intentarlo: no se borra sin saber qué se lleva.' : fallo} extra={<>
      {!!xs.length && <div data-lista-pruebas style={{ maxHeight: 150, overflowY: 'auto' }}>
        <div style={titulo}>{xs.length === 1 ? '1 prueba contra el azar: se borra con ella' : `${xs.length} pruebas contra el azar: se borran con ella`}</div>
        {xs.map(p => <div key={p.id} data-se-borra={p.id} style={filaLista}><span>{p.valor} · velas {p.velas}</span><span style={{ color: B.secundario, whiteSpace: 'nowrap' }}>{fecha(p.creada_en)}{p.resultado ? ` · ${p.resultado.texto}` : ' · sin terminar'}</span></div>)}
      </div>}
      {!!planes.length && <div data-lista-planes style={{ maxHeight: 150, overflowY: 'auto' }}>
        <div style={titulo}>{planes.length === 1 ? '1 plan: se queda, con su copia guardada de la estrategia' : `${planes.length} planes: se quedan, con su copia guardada de la estrategia`}</div>
        {planes.map(p => <div key={p.id} data-se-queda={p.id} style={filaLista}><span>{p.nombre}</span><button data-abrir-plan-borrar={p.id} disabled={ocupado} onClick={() => onAbrirPlan?.(p.id)} style={{ ...S.enlace, fontSize: 13, whiteSpace: 'nowrap' }}>Abrir el plan</button></div>)}
      </div>}
      {(!!xs.length || !!planes.length) && <div style={{ height: 12 }}/>}
      {!!xs.length && <AvisoSuerte/>}
    </>}>
      <button data-boton="cancelar-borrar-estrategia" disabled={ocupado} onClick={onCancelar} style={S.boton}>Cancelar</button>
      <button data-boton="si-borrar-estrategia" disabled={ocupado || sinLeer} onClick={onBorrar} style={sinLeer ? S.botonDesactivado : botonRojo}>{ocupado ? 'Borrando…' : 'Borrar'}</button>
    </Pregunta>)
}
