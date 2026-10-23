// components/BuilderEditor.js — el paso 1 del Builder, «Crear la estrategia»: el EDITOR POR TARJETAS (V9.1043, V9.1044;
// docs/builder.md, §10 y §11), con el estilo de lib/builder/estilo.js. Es otra forma de ver y editar la MISMA definición del
// editor visual (formato 1, motor 1): leer no cambia nada y cada tarjeta reescribe solo su parte (lib/builder/tarjetas.js). Tres
// columnas (en móvil, una debajo de otra): el catálogo de condiciones; las tarjetas «Solo opero cuando…», «Compro cuando…»,
// «Vendo cuando…», «Cómo compro» (V9.1045), «Protección» y la línea de ejecución; y «La regla, en una frase», la comprobación y «Guardar y pasar al paso 2».
// Cada fila va en UNA línea: solo se editan los números, el símbolo y el tipo de media (los desplegables llevan width: auto,
// porque la hoja de estilos de la app les pone width: 100%). Lo poco habitual (orden límite, compra al cierre, el optimizador y
// sus rangos, piezas que se encienden con un parámetro) no está aquí: se conserva siempre y se ve en el Editor clásico (la pestaña
// «Editor»). Guardar es lo mismo que en el editor de siempre (/api/strategies, que valida otra vez); si la estrategia ya está en
// una prueba congelada y cambia su regla, se crea una versión nueva (lib/builder/versiones.js).
//   fila: la estrategia de partida ({ id?, name, description, definition, params, copiaDe? }). lotes: las filas de editor_lotes.
//   onEditorClasico(fila): abre lo que se está editando en el Editor clásico.
//   Para las pruebas de montaje: estadoInicial (lo editado: { def, valores, nombre, descripcion }), enPruebaInicial (los nombres
//   de las pruebas donde está; si no, se buscan por la huella) y buscarInicial.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { CONDICIONES_EDITOR, validaDefinicion, valoresDe, esquemaDe, huellaDefinicion, paraHuella } from '../lib/editor/definicion'
import { jsonCanonico } from '../lib/lotesLab'
import { GRUPOS, buscaCatalogo, nombreCond, condNueva, soloDelValor, AYUDA_COND, AYUDA_NO, AYUDA_CRUZA, leeCompra, escribeCompra, leeFiltro, escribeFiltro, cambiaIndice, INDICES, nombreQuien,
  leeVenta, escribeVenta, leeProteccion, AYUDA_QUIEN, opcionesQuien, leeOrden, ponModoOrden, ponAjuste, ponVelasOrden, CANCELAR_DEFECTO, ponCancelar, vigilaDesdeLaCompra, ponVigilancia, AJUSTES, fraseCompra, TIPOS_STOP, CAMPOS_STOP_TARJETA, numeroStop, anadeStopDef, cambiaTipoStopDef, quitaStopDef, ponNumeroStop, ponSalida, DEFECTO_PROTECCION,
  opcionesClasico, frasesClasico, fraseStopTarjeta, plantillaFila, opcionesOp, opDe, conOp, conVuelta, conCruce, conNumero, tieneLado, erroresFila, erroresProteccion, cuentaErroresProteccion, notaFila, fraseRegla,
  datosSuficientes, aTexto, deTexto } from '../lib/builder/tarjetas'
import { partesNombre, planGuardado, avisoVersion } from '../lib/builder/versiones'
import { PERIODOS_DEFECTO } from '../lib/editor/lotes'
import Ayuda from './BuilderAyuda'
import BuilderGuia from './BuilderGuia'

const AZUL = '#58a6ff', NARANJA = '#f0883e', MORADO = '#a371f7', ROJO = '#ff8b8b', AMARILLO = '#f2cc60'
const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: 'auto' }
const mini = { ...entrada, padding: '2px 4px', fontSize: 13, width: 'auto', display: 'inline-block' }
const copia = (x) => JSON.parse(JSON.stringify(x))
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`
// Las etiquetas de los campos con la letra del Builder (la hoja de estilos de la app pone a los label letra monoespaciada y pequeña).
const etiquetaCampo = { display: 'inline-flex', flexDirection: 'row', alignItems: 'center', fontFamily: B.letra, fontSize: B.base, fontWeight: 600, color: B.titulo }
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const val = (x, valores) => typeof x === 'string' && x.startsWith('$') ? valores[x.slice(1)] : x
const AYUDA_FILTRO = 'Cada fila dice de quién es: un índice (QQQ, SPY…) o «Este valor». Se tienen que cumplir todas. Si no se cumplen, no compro nada, aunque se cumpla «Compro cuando…». No obligan a vender lo que ya tengo.'
// La línea de ejecución dice lo que esté elegido en «Cómo compro» y en la vigilancia de los stops.
export const lineaEjecucion = (def) => `La señal se mira al cierre de cada vela. ${leeOrden(def).modo === 'maximo' ? 'Se compra con la orden en el máximo de «Cómo compro»' : 'Se compra a la apertura de la vela siguiente'} y se vende a la apertura de la vela siguiente a la señal de venta (los stops y el objetivo, en cuanto el precio llega). Los stops y las salidas se vigilan ${vigilaDesdeLaCompra(def) ? 'ya en la vela de la compra' : 'desde la vela siguiente a la compra'}. Opciones poco habituales (orden límite, compra al cierre, optimizador): `
const AYUDA_VIGILANCIA = '«Ya en la vela de la compra»: si el mismo día de la compra el precio toca el stop o se cumple una salida, se vende ese día. «Desde la vela siguiente a la compra»: el día de la compra no se mira nada; los stops y las salidas cuentan a partir del día siguiente.'
const AYUDA_ORDEN = 'Ejemplo: la vela de la señal tiene máximo en 52 €. Con la orden en el máximo, compro si en las velas siguientes el precio llega a 52 € (si una vela abre ya por encima, compro a la apertura). Si no llega, según lo elegido la orden se queda en 52 €, o baja cada vela al nuevo máximo si es más bajo (por ejemplo, a 51 €). Si se cumple la condición de cancelar (por ejemplo, el cierre queda por debajo de su EMA (20)), la orden se quita sin comprar.'

// Lo que se edita: la definición (copia), los valores, el nombre y la descripción.
export const estadoDe = (fila) => ({ def: copia(fila.definition), valores: params(fila.params), nombre: fila.name || '', descripcion: fila.description || '' })

// Un número que se escribe con coma: el texto vive aquí mientras se escribe; fuera llega el número (o el texto si no lo es).
function Numero({ valor, onCambia, error, etiqueta }) {
  const [t, setT] = useState(aTexto(valor))
  useEffect(() => { if (deTexto(t) !== valor) setT(aTexto(valor)) }, [valor])
  return <input type="text" inputMode="decimal" value={t} aria-label={etiqueta} aria-invalid={!!error} onChange={e => { setT(e.target.value); onCambia(deTexto(e.target.value)) }}
    style={{ ...mini, width: `${Math.max(2, String(t).length) + 2}ch`, minWidth: 0, textAlign: 'right', ...(error ? { borderColor: ROJO } : {}) }}/>
}

// El menú «…» de una fila: darle (o quitarle) la vuelta y, en las condiciones sin símbolo, «solo la vela en que empieza».
// V9.1045: el menú va con posición FIJA (como el «?»), por encima de todo: la fila tiene desplazamiento horizontal y lo recortaba.
// Se abre hacia abajo y, si no cabe, hacia arriba; se cierra al tocar fuera o al desplazar la página.
function Menu({ f, onCambia, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [pos, setPos] = useState(null)
  const boton = useRef(null), caja = useRef(null)
  const abre = () => {
    const r = boton.current?.getBoundingClientRect()
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), ...(window.innerHeight - r.bottom < 120 ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    setAbierto(true)
  }
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false) }
    const cierra = () => setAbierto(false)
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); window.addEventListener('scroll', cierra, true)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); window.removeEventListener('scroll', cierra, true) }
  }, [abierto])
  return (
    <span style={{ flexShrink: 0 }}>
      <button ref={boton} style={{ ...S.enlace, color: B.apagado, padding: '0 4px' }} aria-label="Más opciones de la fila" aria-expanded={abierto} onClick={() => abierto ? setAbierto(false) : abre()}>…</button>
      {abierto && (
        <span ref={caja} data-menu-fila style={{ position: 'fixed', zIndex: 1000, ...(pos || {}), background: B.cabecera, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
          <button style={S.enlace} onClick={() => { onCambia(conVuelta(f)); setAbierto(false) }}>{f.env === 'NO' ? 'Quitarle la vuelta (NO)' : 'Darle la vuelta (NO)'}</button>
          {!tieneLado(f.cond.c) && <button style={S.enlace} onClick={() => { onCambia(conCruce(f)); setAbierto(false) }}>{f.env === 'cruza' ? 'Cada vela que se cumpla' : 'Solo la vela en que empieza a cumplirse (cruza)'}</button>}
        </span>
      )}
    </span>
  )
}

// Una fila de condición en UNA línea: «Cierre [> ▾] SMA ( [200] )», con la nota gris, el «?», el menú «…» y la ×; el error,
// debajo. quien / onQuien: el selector «de quién» de «Solo opero cuando…».
function Fila({ f, errores, valores, tarjeta, color, onCambia, onQuita, quien, onQuien, menuAbierto = false }) {
  const p = f.cond.p || {}, decl = Object.fromEntries((CONDICIONES_EDITOR[f.cond.c]?.parametros || []).map(d => [d.clave, d]))
  const hay = Object.keys(errores).length > 0
  const campo = (c, j) => {
    if (typeof c === 'string') return <span key={j}>{c}</span>
    if (c.tipo === 'op') return <select key={j} style={mini} aria-label="Símbolo" value={opDe(f)} onChange={e => onCambia(conOp(f, e.target.value))} title={AYUDA_CRUZA}>{opcionesOp(f.cond.c).map(o => <option key={o} value={o}>{o}</option>)}</select>
    if (c.tipo === 'media' || c.tipo === 'opcion') return <select key={j} style={mini} aria-label={decl[c.k]?.etiqueta} value={p[c.k] ?? decl[c.k]?.defecto} onChange={e => onCambia(conNumero(f, c.k, e.target.value))}>{(decl[c.k]?.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
    return <Numero key={j} valor={val(p[c.k], valores)} error={errores[c.k]} etiqueta={decl[c.k]?.etiqueta} onCambia={v => onCambia(conNumero(f, c.k, v))}/>
  }
  return (
    <div data-fila={f.cond.c} data-error={hay ? 'si' : undefined} style={{ border: `1px solid ${hay ? ROJO : B.borde}`, borderLeft: `3px solid ${hay ? ROJO : color}`, borderRadius: B.radioBoton, padding: '6px 8px', marginTop: 8, background: B.fondo }}>
      <div data-linea style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {onQuien && (
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <select style={{ ...mini, color: MORADO }} aria-label="De quién" value={quien} onChange={e => onQuien(e.target.value)}>
              {opcionesQuien(quien).map(t => <option key={t} value={t} disabled={t !== 'valor' && soloDelValor(f.cond.c)}>{nombreQuien(t)}</option>)}
            </select>
            <Ayuda texto={AYUDA_QUIEN} etiqueta="De quién"/>
          </span>
        )}
        {f.env === 'NO' && <span data-no style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#3b1d22', color: ROJO }}>NO</span><Ayuda texto={AYUDA_NO} etiqueta="NO"/></span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: B.titulo, fontWeight: 600, flexShrink: 0 }}>{plantillaFila(f.cond.c).map(campo)}</span>
        {f.env === 'cruza' && !tieneLado(f.cond.c) && <span style={{ fontSize: 12, color: B.secundario, flexShrink: 0 }}>(solo la vela en que empieza)</span>}
        <span style={{ marginLeft: 'auto', paddingLeft: 8, color: B.apagado, fontSize: 12 }}>{notaFila(f, valores, tarjeta)}</span>
        <span style={{ flexShrink: 0 }}><Ayuda texto={AYUDA_COND[f.cond.c] || nombreCond(f.cond.c)} etiqueta={nombreCond(f.cond.c)}/></span>
        <Menu f={f} onCambia={onCambia} abiertoInicial={menuAbierto}/>
        <button style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }} aria-label="Quitar esta condición" title="Quitar esta condición" onClick={onQuita}>×</button>
      </div>
      {hay && <div data-error-fila style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{Object.values(errores).map((e, k) => <div key={k}>{e}</div>)}</div>}
    </div>
  )
}

function Tarjeta({ titulo, color, derecha, children, datos }) {
  return (
    <div {...datos} style={{ ...S.tarjeta, marginBottom: 14, borderTop: color ? `3px solid ${color}` : undefined }}>
      <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', color: color || B.titulo }}>
        <span>{titulo}</span>{derecha && <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 13, color: B.secundario }}>{derecha}</span>}
      </div>
      <div style={S.cuerpo}>{children}</div>
    </div>
  )
}

export default function BuilderEditor({ fila, estrategias = [], lotes = [], apiFetch, onVolver, onGuardada, onEditorClasico, estadoInicial = null, enPruebaInicial = null, buscarInicial = '', menuInicial = null }) {
  const [est, setEst] = useState(() => estadoInicial || estadoDe(fila))
  const orig = useRef(null); if (!orig.current) orig.current = estadoDe(fila)
  const { def, valores } = est
  const setDef = (d) => setEst(e => ({ ...e, def: typeof d === 'function' ? d(e.def) : d }))
  const intervalo = valores.intervalo === 'semanal' ? 'semanal' : 'diario'
  const [modoCompraUI, setModoCompraUI] = useState(() => leeCompra(def).modo || 'todas')
  const [modoVentaUI, setModoVentaUI] = useState(() => leeVenta(def).modo || 'alguna')
  const [buscar, setBuscar] = useState(buscarInicial)
  const [abiertos, setAbiertos] = useState({})
  const [anadiendo, setAnadiendo] = useState(null)
  const [guia, setGuia] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [enPrueba, setEnPrueba] = useState(enPruebaInicial || [])   // las pruebas congeladas donde está la estrategia de partida

  // ¿En qué pruebas está la estrategia de partida? (por la huella de su definición con sus valores, como «Mi trabajo»)
  useEffect(() => {
    let vivo = true
    if (enPruebaInicial) return
    if (!fila?.id) { setEnPrueba([]); return }
    huellaDefinicion(orig.current.def, orig.current.valores).then(h => {
      if (vivo) setEnPrueba(lotes.filter(l => l?.lote?.tipo !== 'planes' && (l.huellas?.variantes || []).some(v => v.huella === h)).map(l => l.nombre))
    }).catch(() => {})
    return () => { vivo = false }
  }, [fila?.id, lotes])

  const filtro = leeFiltro(def), compra = leeCompra(def), venta = leeVenta(def), prot = leeProteccion(def)
  const modoC = compra.modo || modoCompraUI, modoV = venta.modo || modoVentaUI
  const esquema = useMemo(() => { try { return esquemaDe(def) } catch (_) { return null } }, [def])
  const valoresEf = useMemo(() => { try { return valoresDe(def, valores) } catch (_) { return {} } }, [def, valores])
  const clasico = opcionesClasico(def, valoresEf)
  const errFiltro = filtro.filas.map(f => erroresFila(f, valoresEf, esquema, f.quien))
  const errCompra = compra.filas.map(f => erroresFila(f, valoresEf, esquema)), errVenta = venta.filas.map(f => erroresFila(f, valoresEf, esquema))
  const errProt = erroresProteccion(prot, def, valoresEf)
  const orden = leeOrden(def), errCancelar = orden.cancelar ? erroresFila(orden.cancelar, valoresEf, esquema) : {}
  const errVelasOrden = orden.modo === 'maximo' ? (v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 250 ? null : 'El número de velas tiene que ser un número entero de 1 a 250 (por ejemplo, 1).')(typeof orden.velas === 'string' && orden.velas.startsWith('$') ? valoresEf[orden.velas.slice(1)] : orden.velas) : null
  const validacion = useMemo(() => { try { return validaDefinicion(def, valores) } catch (e) { return [`La definición no se puede leer: ${e.message}`] } }, [def, valores])
  const sinCompra = !def.entrada?.senal || (compra.ok && !compra.filas.length), sinSalida = !(def.stops || []).length && !(def.salidas || []).length
  const errNombre = !est.nombre.trim() ? 'Ponle un nombre a la estrategia (por ejemplo, «Retrocesos con RSI»).' : null
  const n = (xs) => xs.reduce((a, e) => a + Object.keys(e).length, 0)
  const nFiltro = n(errFiltro), nCompra = n(errCompra) + (sinCompra ? 1 : 0), nVenta = n(errVenta), nProt = cuentaErroresProteccion(errProt) + (sinSalida ? 1 : 0), nOrden = n([errCancelar]) + (errVelasOrden ? 1 : 0)
  // Lo que la validación de siempre ve y las tarjetas no explican (una opción del Editor clásico): cuenta como error de allí.
  const errClasico = nFiltro + nCompra + nVenta + nProt + nOrden ? [] : validacion
  const zonas = [['«Solo opero cuando…»', nFiltro], ['«Compro cuando…»', nCompra], ['«Vendo cuando…»', nVenta], ['«Cómo compro»', nOrden], ['«Protección»', nProt], ['el Editor clásico', errClasico.length], ['el nombre', errNombre ? 1 : 0]].filter(([, k]) => k)
  const nErrores = zonas.reduce((a, [, k]) => a + k, 0)
  const hayErrores = nErrores > 0 || validacion.length > 0
  const malos = (es) => es.map(e => Object.fromEntries(Object.keys(e).map(k => [k, true])))
  const regla = fraseRegla({ def, filtro, compra: { ...compra, modo: modoC }, venta: { ...venta, modo: modoV }, prot, valores: valoresEf, malosFiltro: malos(errFiltro), malosCompra: malos(errCompra), malosVenta: malos(errVenta),
    malosProt: { ...errProt, stops: malos(errProt.stops) }, malosCancelar: malos([errCancelar])[0], ...frasesClasico(def, valoresEf, compra, filtro) })
  const datos = useMemo(() => { try { return datosSuficientes(def, valoresEf, intervalo, PERIODOS_DEFECTO[0].desde) } catch (_) { return null } }, [def, valoresEf, intervalo])
  const cambiaRegla = jsonCanonico(paraHuella(def, valores)) !== jsonCanonico(paraHuella(orig.current.def, orig.current.valores))
  const plan = planGuardado({ fila, est, orig: orig.current, enPrueba, estrategias, cambiaRegla })
  const version = partesNombre(fila?.name).version
  const estado = fila?.copiaDe ? `Copia de «${fila.copiaDe}». La original y sus pruebas no cambian.`
    : !fila?.id ? 'Estrategia nueva · todavía sin guardar'
    : `Versión ${version} · ${enPrueba.length ? `probada en ${enPrueba.length > 1 ? 'las pruebas' : 'la prueba'} ${enPrueba.map(x => `«${x}»`).join(', ')}` : 'sin probar todavía'}`
  const indiceActual = filtro.filas.find(f => f.quien !== 'valor')?.quien

  // ── Cambios desde las tarjetas ──
  const cambiaFiltro = (filas) => setDef(d => escribeFiltro(d, filas))
  const cambiaCompra = (filas, modo = modoC) => setDef(d => escribeCompra(d, filas, modo))
  const cambiaVenta = (filas, modo = modoV) => setDef(d => escribeVenta(d, filas, modo))
  const anade = (id, donde) => {
    const f = { cond: condNueva(id), env: null }
    if (donde === 'filtro') cambiaFiltro([...filtro.filas, { ...f, quien: soloDelValor(id) ? 'valor' : (indiceActual || 'QQQ') }])
    else if (donde === 'compra') cambiaCompra([...compra.filas, f]); else cambiaVenta([...venta.filas, f])
    setAnadiendo(null)
  }
  // «De quién»: un índice cambia el de todas las filas del índice (el motor admite uno); «Este valor» la pasa a la señal.
  const cambiaQuien = (k, q) => cambiaFiltro(q === 'valor' ? filtro.filas.map((x, j) => j === k ? { ...x, quien: 'valor' } : x) : cambiaIndice(filtro.filas.map((x, j) => j === k ? { ...x, quien: q } : x), q))
  const otroModo = (m) => m === 'todas' ? 'alguna' : 'todas'
  const cambiaModoCompra = () => { const m = otroModo(modoC); setModoCompraUI(m); if (compra.filas.length > 1) cambiaCompra(compra.filas, m) }
  const cambiaModoVenta = () => { const m = otroModo(modoV); setModoVentaUI(m); if (venta.filas.length > 1) cambiaVenta(venta.filas, m) }

  const guarda = async () => {
    if (hayErrores || guardando) return
    setMsg(null)
    if (plan.metodo === 'ninguno') { onGuardada?.({ ...fila }, { sinCambios: true }); return }
    setGuardando(true)
    try {
      const res = await apiFetch('/api/strategies', { method: plan.metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan.cuerpo) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.errores ? j.errores.join(' ') : (j.error || `HTTP ${res.status}`))
      onGuardada?.({ ...plan.cuerpo, ...j, id: j?.id || plan.cuerpo.id }, { version: plan.version })
    } catch (e) { setMsg(`No se pudo guardar: ${e.message}`) }
    setGuardando(false)
  }
  const abreClasico = () => onEditorClasico?.({ id: fila?.id ?? null, name: est.nombre, description: est.descripcion, definition: def, params: { ...valores } })

  if (guia) return <BuilderGuia onVolver={() => setGuia(false)} volverTexto="← Volver a la estrategia"/>

  const grupos = buscaCatalogo(buscar)
  const enlaceModo = (modo, onClick) => <>{modo === 'todas' ? 'se cumplen todas' : 'basta con una'} · <button style={{ ...S.enlace, fontSize: 13 }} onClick={onClick}>cambiar a «{modo === 'todas' ? 'al menos una' : 'todas'}»</button></>
  const vacia = (t) => <div style={{ ...S.apagado, marginTop: 4 }}>{t}</div>
  const errorTarjeta = (t) => <div data-error-tarjeta style={{ color: ROJO, fontSize: 13, marginTop: 8 }}>{t}</div>
  const linea = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }
  const caja = (clave, titulo, cuerpo, error) => (
    <div data-proteccion={clave} style={{ flex: '1 1 220px', border: `1px solid ${error ? ROJO : B.borde}`, borderRadius: B.radioBoton, padding: 10, background: B.fondo }}>
      <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 4 }}>{titulo}</div>
      {cuerpo}
      {error && <div data-error-proteccion style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
  const numStop = (k, s, ruta) => { const [, que, , ] = (CAMPOS_STOP_TARJETA[s.tipo] || []).find(([r]) => r.join('.') === ruta.join('.')) || []; return <Numero valor={numeroStop(s, ruta, valoresEf)} error={errProt.stops[k]?.[ruta.join('.')]} etiqueta={que} onCambia={v => setDef(d => ponNumeroStop(d, k, ruta, v))}/> }
  const cuerpoStop = (s, k) => {
    if (s.tipo === 'porcentaje') return <>Vender si baja un {numStop(k, s, ['pct'])} % bajo la compra</>
    if (s.tipo === 'minimoVelas') return <>En el mínimo de las últimas {numStop(k, s, ['n'])} velas</>
    if (s.tipo === 'atr') return <>{numStop(k, s, ['k'])} veces el ATR de {numStop(k, s, ['periodo'])} velas bajo la compra</>
    if (s.tipo === 'nivel') return <>En el mínimo de la vela de la señal</>
    return <>Cuando una vela cierra bajo su <select style={mini} aria-label="Tipo de la media del stop" value={s.si.p.tipo} onChange={e => setDef(d => ponNumeroStop(d, k, ['si', 'p', 'tipo'], e.target.value))}><option value="SMA">SMA</option><option value="EMA">EMA</option></select> ({numStop(k, s, ['si', 'p', 'periodo'])}), sube al mínimo de las últimas {numStop(k, s, ['nivel', 'velas'])} velas</>
  }
  const primerStop = prot.stops[0]?.s, objetivoValor = val(prot.objetivo.valor, valoresEf)
  const calculoObjetivo = primerStop?.tipo === 'porcentaje' && typeof val(primerStop.pct, valoresEf) === 'number' && typeof objetivoValor === 'number'
    ? `Con el stop al ${aTexto(val(primerStop.pct, valoresEf))} %, vende al subir un ${aTexto(Math.round(val(primerStop.pct, valoresEf) * objetivoValor * 100) / 100)} %.`
    : 'Vende al subir esas veces la distancia entre el precio de compra y el primer stop.'
  const tiempoN = val(prot.tiempo.valor, valoresEf)

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Paso 1 · Crear la estrategia</span>
        <span style={{ marginLeft: 'auto' }}><button style={S.boton} onClick={() => setGuia(true)}>Guía: cómo se prueba una estrategia</button></span>
      </div>
      {clasico.length > 0 && (
        <div data-aviso="clasico" style={{ border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 12, marginBottom: 14 }}>
          <div style={{ color: AMARILLO, fontWeight: 600 }}>Esta estrategia usa opciones que solo se pueden ver y cambiar en el Editor clásico:</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: B.texto }}>{clasico.map(t => <li key={t}>{t}</li>)}</ul>
          <div style={{ ...S.secundario, marginTop: 6 }}>Al guardar aquí se conservan tal cual. <button style={S.enlace} onClick={abreClasico}>Abrir en el Editor clásico</button></div>
        </div>
      )}
      <div style={{ ...S.tarjeta, marginBottom: 16 }} data-tarjeta="nombre">
        <div style={{ ...S.cuerpo, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={etiquetaCampo} htmlFor="nombre-estrategia">Nombre de la estrategia</label>
          <input id="nombre-estrategia" value={est.nombre} onChange={e => setEst(x => ({ ...x, nombre: e.target.value }))} style={{ ...entrada, flex: '1 1 240px', maxWidth: 420, ...(errNombre ? { borderColor: ROJO } : {}) }}/>
          <label style={{ ...etiquetaCampo, gap: 6 }}>
            <span>Velas:</span>
            <select style={entrada} aria-label="Velas" value={intervalo} onChange={e => setEst(x => ({ ...x, valores: { ...x.valores, intervalo: e.target.value } }))}>
              <option value="diario">Diarias (1 vela = 1 día de mercado)</option><option value="semanal">Semanales (1 vela = 1 semana)</option>
            </select>
          </label>
          <div style={{ flexBasis: '100%', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span data-estado style={S.secundario}>{estado}</span>
            <span style={S.apagado}>La prueba del paso 2 solo admite velas diarias.</span>
          </div>
          {errNombre && <div style={{ color: ROJO, fontSize: 13, flexBasis: '100%' }}>{errNombre}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Izquierda: el catálogo ── */}
        <div data-columna="catalogo" style={{ flex: '1 1 230px', maxWidth: 320, minWidth: 0 }}>
          <div style={{ ...S.tarjeta }}>
            <div style={S.cabeceraTarjeta}>Catálogo de condiciones</div>
            <div style={{ padding: 12 }}>
              <input aria-label="Buscar condiciones" placeholder="Buscar: rsi, media, volumen…" value={buscar} onChange={e => setBuscar(e.target.value)} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/>
              {!grupos.length && <div style={{ ...S.apagado, marginTop: 8 }}>Nada coincide con «{buscar}».</div>}
              {grupos.map(g => {
                const abierto = buscar.trim() ? true : !!abiertos[g.id], total = GRUPOS.find(x => x.id === g.id)?.conds.length ?? g.conds.length
                return (
                  <div key={g.id} data-grupo={g.id} data-abierto={abierto ? 'si' : 'no'} style={{ marginTop: 10 }}>
                    <button aria-expanded={abierto} onClick={() => setAbiertos(a => ({ ...a, [g.id]: !abierto }))} style={{ ...S.enlace, color: B.titulo, fontWeight: 600, width: '100%', display: 'flex' }}>
                      <span style={{ width: 16 }}>{abierto ? '▾' : '▸'}</span><span style={{ flex: 1 }}>{g.titulo}</span><span style={S.apagado}>{total}</span>
                    </button>
                    {abierto && g.conds.map(id => (
                      <div key={id} data-cond={id} style={{ padding: '6px 0 6px 16px', borderBottom: `1px solid ${B.borde}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1 }}>{nombreCond(id)}</span>
                          <button style={{ ...S.boton, padding: '0 9px', fontWeight: 700 }} aria-label={`Añadir «${nombreCond(id)}»`} onClick={() => setAnadiendo(anadiendo === id ? null : id)}>+</button>
                        </div>
                        {anadiendo === id && (
                          <div data-pregunta style={{ marginTop: 6 }}>
                            <div style={S.secundario}>¿Añadir a Solo opero cuando, a Compro o a Vendo?</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: MORADO, opacity: filtro.ok ? 1 : 0.5 }} disabled={!filtro.ok} onClick={() => anade(id, 'filtro')}>Solo opero cuando</button>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: AZUL, opacity: compra.ok ? 1 : 0.5 }} disabled={!compra.ok} onClick={() => anade(id, 'compra')}>Compro</button>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: NARANJA, opacity: venta.ok ? 1 : 0.5 }} disabled={!venta.ok} onClick={() => anade(id, 'venta')}>Vendo</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Centro: las tarjetas ── */}
        <div data-columna="tarjetas" style={{ flex: '3 1 440px', minWidth: 0 }}>
          <Tarjeta titulo="Solo opero cuando…" color={MORADO} datos={{ 'data-tarjeta': 'filtro' }} derecha={filtro.filas.length ? 'se cumplen todas' : 'opcional'}>
            {filtro.ok ? <>
              {filtro.filas.map((f, k) => <Fila key={k} f={f} errores={errFiltro[k]} valores={valoresEf} tarjeta="filtro" color={MORADO} quien={f.quien} onQuien={q => cambiaQuien(k, q)} menuAbierto={menuInicial?.tarjeta === 'filtro' && menuInicial.k === k}
                onCambia={g => cambiaFiltro(filtro.filas.map((x, j) => j === k ? { ...g, quien: x.quien } : x))} onQuita={() => cambiaFiltro(filtro.filas.filter((_, j) => j !== k))}/>)}
              {!filtro.filas.length && vacia('Sin filtro: opera siempre que se cumpla «Compro cuando…». Añádelo desde el catálogo con «+».')}
            </> : <div style={{ color: AMARILLO }}>Este filtro se ve y se cambia en el Editor clásico.</div>}
            <div style={{ ...S.apagado, marginTop: 8 }}>{AYUDA_FILTRO}</div>
          </Tarjeta>

          <Tarjeta titulo="Compro cuando…" color={AZUL} datos={{ 'data-tarjeta': 'compra' }} derecha={compra.ok ? enlaceModo(modoC, cambiaModoCompra) : null}>
            {compra.ok ? <>
              {compra.filas.map((f, k) => <Fila key={k} f={f} errores={errCompra[k]} valores={valoresEf} tarjeta="compra" color={AZUL} menuAbierto={menuInicial?.tarjeta === 'compra' && menuInicial.k === k}
                onCambia={g => cambiaCompra(compra.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaCompra(compra.filas.filter((_, j) => j !== k))}/>)}
              {!compra.filas.length && vacia('Añade condiciones desde el catálogo con «+».')}
            </> : <div style={S.secundario}>{regla.partes.find(p => p.tipo === 'compra')?.texto} <span style={{ color: AMARILLO }}>Se cambia en el Editor clásico.</span></div>}
            {sinCompra && errorTarjeta('Falta la condición de compra: añade al menos una con «+» (por ejemplo, «Cierre frente a una media»).')}
          </Tarjeta>

          <Tarjeta titulo="Vendo cuando…" color={NARANJA} datos={{ 'data-tarjeta': 'venta' }} derecha={venta.ok ? enlaceModo(modoV, cambiaModoVenta) : null}>
            {venta.ok ? <>
              {venta.filas.map((f, k) => <Fila key={k} f={f} errores={errVenta[k]} valores={valoresEf} tarjeta="venta" color={NARANJA} menuAbierto={menuInicial?.tarjeta === 'venta' && menuInicial.k === k}
                onCambia={g => cambiaVenta(venta.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaVenta(venta.filas.filter((_, j) => j !== k))}/>)}
              {!venta.filas.length && vacia('Sin condiciones de venta: sale solo por la protección de abajo. Añádelas desde el catálogo con «+».')}
            </> : <div style={{ color: AMARILLO }}>Las condiciones de venta se ven y se cambian en el Editor clásico.</div>}
          </Tarjeta>

          <Tarjeta titulo="Cómo compro" datos={{ 'data-tarjeta': 'orden' }}>
            {orden.ok ? <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <select style={mini} aria-label="Cómo compro" value={orden.modo} onChange={e => setDef(d => ponModoOrden(d, e.target.value))}>
                  <option value="apertura">A la apertura de la vela siguiente a la señal (lo normal)</option>
                  <option value="maximo">Con una orden en el máximo de la vela de la señal</option>
                </select>
                <Ayuda texto={AYUDA_ORDEN} etiqueta="Cómo compro"/>
              </div>
              {orden.modo === 'maximo' && <div data-orden-maximo style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={linea}>Compro solo si el precio sube hasta el máximo de las últimas <Numero valor={typeof orden.velas === 'string' && orden.velas.startsWith('$') ? valoresEf[orden.velas.slice(1)] : orden.velas} error={errVelasOrden} etiqueta="Velas de la orden" onCambia={v => setDef(d => ponVelasOrden(d, v))}/> velas (1 = la vela de la señal).</div>
                {errVelasOrden && <div style={{ color: ROJO, fontSize: 13 }}>{errVelasOrden}</div>}
                <div style={linea}>Si no llega, la orden <select style={mini} aria-label="Si no llega" value={orden.ajuste} onChange={e => setDef(d => ponAjuste(d, e.target.value))}>{AJUSTES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div>
                  <label style={{ ...etiquetaCampo, fontWeight: 400, gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!orden.cancelar} onChange={e => setDef(d => ponCancelar(d, e.target.checked ? { cond: copia(CANCELAR_DEFECTO), env: null } : null))}/> Cancelar la orden si…</label>
                  {orden.cancelar && <Fila f={orden.cancelar} errores={errCancelar} valores={valoresEf} tarjeta="cancelar" color={AZUL} onCambia={g => setDef(d => ponCancelar(d, g))} onQuita={() => setDef(d => ponCancelar(d, null))}/>}
                </div>
                <div style={S.apagado}>Ejemplo: la vela de la señal tiene máximo en 52 €: compro si en las velas siguientes llega a 52 €.</div>
              </div>}
            </> : <div style={{ color: AMARILLO }}>{fraseCompra(def, valoresEf)} Se cambia en el Editor clásico.</div>}
          </Tarjeta>

          <Tarjeta titulo="Protección" datos={{ 'data-tarjeta': 'proteccion' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {caja('stop', 'Stop de pérdidas', <>
                {!prot.stops.length && <select style={mini} aria-label="Stop de pérdidas" value="" onChange={e => e.target.value && setDef(d => anadeStopDef(d, e.target.value))}>
                  <option value="">Ninguno</option>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
                </select>}
                {prot.stops.map(({ s, editable }, k) => (
                  <div key={k} data-stop={s.tipo} style={{ marginTop: k ? 10 : 0, paddingTop: k ? 8 : 0, borderTop: k ? `1px solid ${B.borde}` : 'none' }}>
                    {editable ? <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {prot.stops.length > 1 && <span style={S.apagado}>{k + 1}.</span>}
                        <select style={mini} aria-label="Tipo de stop" value={s.tipo} onChange={e => setDef(d => cambiaTipoStopDef(d, k, e.target.value))}>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}</select>
                        <button style={{ ...S.enlace, color: B.apagado, marginLeft: 'auto' }} aria-label="Quitar este stop" onClick={() => setDef(d => quitaStopDef(d, k))}>×</button>
                      </div>
                      <div style={linea}>{cuerpoStop(s, k)}</div>
                      <div style={{ ...S.apagado, marginTop: 4 }}>{TIPOS_STOP.find(t => t.tipo === s.tipo)?.ejemplo}</div>
                      {Object.values(errProt.stops[k] || {}).map((e, j) => <div key={j} style={{ color: ROJO, fontSize: 13, marginTop: 4 }}>{e}</div>)}
                    </> : <div style={S.secundario}>{k + 1}. {(t => t.charAt(0).toUpperCase() + t.slice(1))(fraseStopTarjeta(s, valoresEf))}. <span style={{ color: AMARILLO }}>(se cambia en el Editor clásico)</span></div>}
                  </div>
                ))}
                {prot.stops.length > 1 && <div style={{ ...S.apagado, marginTop: 8 }}>Se comprueban en este orden; el primero que se cumple cierra la operación.</div>}
                {prot.stops.length > 0 && <select style={{ ...mini, marginTop: 8 }} aria-label="Añadir otro stop" value="" onChange={e => e.target.value && setDef(d => anadeStopDef(d, e.target.value))}>
                  <option value="">+ Añadir otro stop</option>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
                </select>}
              </>)}
              {caja('objetivo', 'Objetivo de ganancia (según el stop)', prot.objetivo.estado === 'otro' ? <div style={S.apagado}>Se cambia en el Editor clásico.</div> : <>
                <select style={mini} aria-label="Objetivo de ganancia" disabled={!prot.stops.length && prot.objetivo.estado === 'ninguno'} value={prot.objetivo.estado === 'ninguno' ? 'no' : 'si'}
                  onChange={e => setDef(d => ponSalida(d, 'objetivo', 'multiploR', e.target.value === 'si' ? DEFECTO_PROTECCION.objetivo : null))}>
                  <option value="no">Ninguno</option><option value="si">Vender al ganar…</option>
                </select>
                {!prot.stops.length && prot.objetivo.estado === 'ninguno' && <div style={{ ...S.apagado, marginTop: 6 }}>Necesita un stop: se calcula a partir de lo que arriesgas hasta el stop.</div>}
                {prot.objetivo.estado === 'veces' && <>
                  <div style={linea}>Vender al ganar <Numero valor={objetivoValor} error={errProt.objetivo} etiqueta="Veces lo que arriesgo" onCambia={v => setDef(d => ponSalida(d, 'objetivo', 'multiploR', v))}/> veces lo que arriesgo</div>
                  {prot.stops.length > 0 && !errProt.objetivo && <div data-calculo style={{ ...S.apagado, marginTop: 4 }}>{calculoObjetivo}</div>}
                </>}
              </>, errProt.objetivo)}
              {caja('tiempo', 'Salida por tiempo', prot.tiempo.estado === 'otro' ? <div style={S.apagado}>Se cambia en el Editor clásico.</div> : <>
                <select style={mini} aria-label="Salida por tiempo" value={prot.tiempo.estado === 'ninguno' ? 'no' : 'si'} onChange={e => setDef(d => ponSalida(d, 'tope', 'velas', e.target.value === 'si' ? DEFECTO_PROTECCION.tiempo : null))}>
                  <option value="no">Ninguno</option><option value="si">Vender a las…</option>
                </select>
                {prot.tiempo.estado === 'velas' && <>
                  <div style={linea}>Vender a las <Numero valor={tiempoN} error={errProt.tiempo} etiqueta="Velas" onCambia={v => setDef(d => ponSalida(d, 'tope', 'velas', v))}/> velas</div>
                  <div data-equivalencia style={{ ...S.apagado, marginTop: 4 }}>= {errProt.tiempo ? '[?]' : aTexto(tiempoN)} {intervalo === 'semanal' ? 'semanas, porque las velas son semanales' : 'días de mercado, porque las velas son diarias'}</div>
                </>}
              </>, errProt.tiempo)}
            </div>
            <div data-vigilancia style={{ ...linea, marginTop: 12 }}>
              Los stops y las salidas empiezan a vigilarse:
              <select style={mini} aria-label="Cuándo empiezan a vigilarse" value={vigilaDesdeLaCompra(def) ? 'compra' : 'siguiente'} onChange={e => setDef(d => ponVigilancia(d, e.target.value === 'compra'))}>
                <option value="siguiente">desde la vela siguiente a la compra</option><option value="compra">ya en la vela de la compra</option>
              </select>
              <Ayuda texto={AYUDA_VIGILANCIA} etiqueta="Cuándo empiezan a vigilarse"/>
            </div>
            {sinSalida && errorTarjeta('La estrategia necesita una forma de salir: una condición de venta, un stop o una salida por tiempo.')}
          </Tarjeta>

          <div data-ejecucion style={{ ...S.secundario, padding: '4px 4px 0' }}>{lineaEjecucion(def)}<button style={S.enlace} onClick={abreClasico}>Editor clásico</button>.</div>
        </div>

        {/* ── Derecha: la regla, la comprobación y guardar ── */}
        <div data-columna="regla" style={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <Tarjeta titulo="La regla, en una frase" datos={{ 'data-tarjeta': 'regla' }}>
            <div data-regla="true" style={{ lineHeight: 1.6 }}>{regla.partes.map((p, k) => <span key={k} data-parte={p.tipo} style={{ color: p.tipo === 'filtro' ? MORADO : p.tipo === 'compra' ? AZUL : p.tipo === 'venta' ? NARANJA : B.texto }}>{k ? ' ' : ''}{p.texto}</span>)}</div>
          </Tarjeta>
          <Tarjeta titulo="Comprobación" datos={{ 'data-tarjeta': 'comprobacion' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li data-comprueba="compra" style={{ color: sinCompra ? ROJO : B.texto }}>{sinCompra ? '✕ Falta la condición de compra' : '✓ Hay condición de compra'}</li>
              <li data-comprueba="salir" style={{ color: sinSalida ? ROJO : B.texto }}>{sinSalida ? '✕ Falta una forma de salir' : '✓ Hay forma de salir'}</li>
              {datos && datos.necesita > 0 && <li data-comprueba="datos" style={{ color: B.texto }}>{datos.ok
                ? `✓ Hay datos suficientes: la condición más larga necesita ${datos.necesita} velas previas.`
                : `✓ Necesita ${datos.necesita} velas previas: se cargarán automáticamente.`}</li>}
              {datos?.falta && <li data-comprueba="faltan" style={{ color: ROJO }}>{datos.falta.sinDatos
                ? `✕ ${nombreQuien(datos.falta.ticker)} todavía no está en los precios guardados de la app: el backtest lo descarga, pero los laboratorios de la prueba (paso 2) no lo pueden usar y el filtro no dejaría comprar nunca.`
                : `✕ Para empezar el ${fechaCorta(datos.desdePeriodo)} hacen falta datos desde el ${fechaCorta(datos.falta.hace)}, y ${nombreQuien(datos.falta.ticker)} solo tiene desde el ${fechaCorta(datos.falta.tiene)}.`}</li>}
              {nErrores > 0 && <li data-comprueba="errores" style={{ color: ROJO }}>✕ {plural(nErrores, 'error', 'errores')} en {zonas.map(([z]) => z).join(', ').replace(/, ([^,]*)$/, ' y $1')}</li>}
              {errClasico.map((e, k) => <li key={k} data-error-clasico style={{ color: ROJO, fontSize: 13 }}>{e}</li>)}
            </ul>
          </Tarjeta>
          {plan.version && <div data-aviso="version" style={{ background: '#3a3220', border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 12, marginBottom: 12, color: B.texto }}>{avisoVersion(plan.version)}</div>}
          <button style={hayErrores || guardando ? S.botonDesactivado : S.botonVerde} disabled={hayErrores || guardando} onClick={guarda}>{guardando ? 'Guardando…' : 'Guardar y pasar al paso 2'}</button>
          {hayErrores && <div data-aviso="corrige" style={{ ...S.secundario, marginTop: 6 }}>Corrige lo que está en rojo para continuar.</div>}
          {msg && <div style={{ color: ROJO, marginTop: 6 }}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}
