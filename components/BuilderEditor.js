// components/BuilderEditor.js — el paso 1 del Builder, «Crear la estrategia»: el EDITOR POR TARJETAS (V9.1043; docs/builder.md,
// §10), con el estilo de lib/builder/estilo.js. Es otra forma de ver y editar la MISMA definición del editor visual (formato 1,
// motor 1): leer no cambia nada y cada tarjeta reescribe solo su parte (lib/builder/tarjetas.js). Tres columnas (en móvil, una
// debajo de otra): el catálogo de condiciones; las tarjetas «Compro cuando…», «Vendo cuando…», «Protección» y «Avanzado» (los
// formularios del editor de siempre, components/EditorPanel.js: FormularioDefinicion); y «La regla, en una frase», la
// comprobación y «Guardar y pasar al paso 2». Guardar es lo mismo que en el editor de siempre (/api/strategies, que valida otra
// vez); si la estrategia ya está en una prueba congelada y cambia su regla, se crea una versión nueva (lib/builder/versiones.js).
//   fila: la estrategia de partida ({ id?, name, description, definition, params, copiaDe? }). lotes: las filas de editor_lotes.
//   Para las pruebas de montaje: avanzadoInicial («Avanzado» abierto), estadoInicial (lo editado: { def, valores, nombre,
//   descripcion }), enPruebaInicial (los nombres de las pruebas donde está; si no, se buscan por la huella) y buscarInicial.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { CONDICIONES_EDITOR, validaDefinicion, valoresDe, esquemaDe, fraseDefinicion, fraseCond, huellaDefinicion, paraHuella } from '../lib/editor/definicion'
import { jsonCanonico } from '../lib/lotesLab'
import { GRUPOS, buscaCatalogo, nombreCond, condNueva, leeCompra, escribeCompra, leeVenta, escribeVenta, leeProteccion, ponStop, ponSalida, DEFECTO_PROTECCION,
  partesAvanzado, plantillaFila, opcionesOp, opDe, conOp, erroresFila, erroresProteccion, notaFila, fraseRegla, datosSuficientes, unidadDe, aTexto, deTexto } from '../lib/builder/tarjetas'
import { partesNombre, planGuardado, avisoVersion } from '../lib/builder/versiones'
import { FormularioDefinicion } from './EditorPanel'
import BuilderGuia from './BuilderGuia'

const AZUL = '#58a6ff', NARANJA = '#f0883e', ROJO = '#ff8b8b', AMARILLO = '#f2cc60'
const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px' }
const mini = { ...entrada, padding: '3px 6px', fontSize: 13 }
const copia = (x) => JSON.parse(JSON.stringify(x))
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const ENV = [['', 'se cumple'], ['cruza', 'empieza a cumplirse'], ['NO', 'no se cumple']]
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`

// Lo que se edita: la definición (copia), los valores, el nombre y la descripción.
export const estadoDe = (fila) => ({ def: copia(fila.definition), valores: params(fila.params), nombre: fila.name || '', descripcion: fila.description || '' })

// Un número que se escribe con coma: el texto vive aquí mientras se escribe; fuera llega el número (o el texto si no lo es).
function Numero({ valor, onCambia, error, etiqueta }) {
  const [t, setT] = useState(aTexto(valor))
  useEffect(() => { if (deTexto(t) !== valor) setT(aTexto(valor)) }, [valor])
  return <input type="text" inputMode="decimal" value={t} aria-label={etiqueta} aria-invalid={!!error} onChange={e => { setT(e.target.value); onCambia(deTexto(e.target.value)) }}
    style={{ ...mini, width: Math.max(3, String(t).length + 1) + 'ch', minWidth: 36, textAlign: 'right', ...(error ? { borderColor: ROJO } : {}) }}/>
}

// Una fila de condición: «Cierre > SMA (200)», con los números editables, la nota gris y la ×. Un número '$nombre' es un
// parámetro de la estrategia: se edita su valor (y su rango, en Avanzado).
function Fila({ f, errores, valores, onCambia, onValor, onQuita, color }) {
  const p = f.cond.p || {}, decl = Object.fromEntries((CONDICIONES_EDITOR[f.cond.c]?.parametros || []).map(d => [d.clave, d]))
  const hay = Object.keys(errores).length > 0
  const pon = (k, v) => onCambia({ ...f, cond: { ...f.cond, p: { ...p, [k]: v } } })
  const campo = (c, j) => {
    if (typeof c === 'string') return <span key={j}>{c}</span>
    const crudo = p[c.k], ref = typeof crudo === 'string' && crudo.startsWith('$') ? crudo.slice(1) : null
    if (c.tipo === 'op') return <select key={j} style={mini} aria-label="Comparación" value={opDe(p)} onChange={e => onCambia({ ...f, cond: { ...f.cond, p: conOp(f.cond.c, p, e.target.value) } })}>{opcionesOp(f.cond.c).map(o => <option key={o} value={o}>{o}</option>)}</select>
    if (c.tipo === 'media' || c.tipo === 'opcion') return <select key={j} style={mini} aria-label={decl[c.k]?.etiqueta} value={crudo ?? decl[c.k]?.defecto} onChange={e => pon(c.k, e.target.value)}>{(decl[c.k]?.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
    return (
      <span key={j} title={ref ? `Este número es el parámetro «${ref}» de la estrategia: en «Avanzado» puedes darle un rango para el optimizador.` : undefined}
        style={ref ? { borderBottom: `1px dashed ${B.apagado}`, paddingBottom: 1 } : undefined}>
        <Numero valor={ref ? valores[ref] : crudo} error={errores[c.k]} etiqueta={decl[c.k]?.etiqueta} onCambia={v => ref ? onValor(ref, v) : pon(c.k, v)}/>
      </span>
    )
  }
  return (
    <div data-fila={f.cond.c} data-error={hay ? 'si' : undefined} style={{ border: `1px solid ${hay ? ROJO : B.borde}`, borderLeft: `3px solid ${hay ? ROJO : color}`, borderRadius: B.radioBoton, padding: '8px 10px', marginTop: 8, background: B.fondo }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <select style={{ ...mini, color: f.env ? B.titulo : B.apagado }} aria-label="Cuándo cuenta" value={f.env || ''} onChange={e => onCambia({ ...f, env: e.target.value || null })}>{ENV.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: B.titulo, fontWeight: 600 }}>{plantillaFila(f.cond.c).map(campo)}</span>
        <span style={{ marginLeft: 'auto', color: B.apagado, fontSize: 12 }}>{notaFila(f, valores)}</span>
        <button style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1, padding: '0 4px' }} aria-label="Quitar esta condición" title="Quitar esta condición" onClick={onQuita}>×</button>
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

export default function BuilderEditor({ fila, estrategias = [], lotes = [], apiFetch, onVolver, onGuardada, avanzadoInicial = false, estadoInicial = null, enPruebaInicial = null, buscarInicial = '' }) {
  const [est, setEst] = useState(() => estadoInicial || estadoDe(fila))
  const orig = useRef(null); if (!orig.current) orig.current = estadoDe(fila)
  const { def, valores } = est
  const setDef = (d) => setEst(e => ({ ...e, def: typeof d === 'function' ? d(e.def) : d }))
  const setValor = (k, v) => setEst(e => ({ ...e, valores: { ...e.valores, [k]: v } }))
  const intervalo = valores.intervalo === 'semanal' ? 'semanal' : 'diario', u = unidadDe(intervalo)
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

  const compra = leeCompra(def), venta = leeVenta(def), prot = leeProteccion(def)
  const modoC = compra.modo || modoCompraUI, modoV = venta.modo || modoVentaUI
  const esquema = useMemo(() => { try { return esquemaDe(def) } catch (_) { return null } }, [def])
  const valoresEf = useMemo(() => { try { return valoresDe(def, valores) } catch (_) { return {} } }, [def, valores])
  const avz = partesAvanzado(def)
  const errCompra = compra.filas.map(f => erroresFila(f, valoresEf, esquema)), errVenta = venta.filas.map(f => erroresFila(f, valoresEf, esquema))
  const errProt = erroresProteccion(prot, def, valoresEf)
  const validacion = useMemo(() => { try { return validaDefinicion(def, valores) } catch (e) { return [`La definición no se puede leer: ${e.message}`] } }, [def, valores])
  const sinCompra = !def.entrada?.senal, sinSalida = !(def.stops || []).length && !(def.salidas || []).length
  const errNombre = !est.nombre.trim() ? 'Ponle un nombre a la estrategia (por ejemplo, «Retrocesos con RSI»).' : null
  const n = (xs) => xs.reduce((a, e) => a + Object.keys(e).length, 0)
  const nCompra = n(errCompra) + (sinCompra ? 1 : 0), nVenta = n(errVenta), nProt = Object.keys(errProt).length + (sinSalida ? 1 : 0)
  // Lo que la validación de siempre ve y las tarjetas no explican (una parte de «Avanzado»): cuenta como error de «Avanzado».
  const nTarjetas = nCompra + nVenta + nProt
  const errAvanzado = nTarjetas ? [] : validacion
  const zonas = [['«Compro cuando…»', nCompra], ['«Vendo cuando…»', nVenta], ['«Protección»', nProt], ['«Avanzado»', errAvanzado.length], ['el nombre', errNombre ? 1 : 0]].filter(([, k]) => k)
  const nErrores = zonas.reduce((a, [, k]) => a + k, 0)
  const hayErrores = nErrores > 0 || validacion.length > 0
  const malos = (es) => es.map(e => Object.fromEntries(Object.keys(e).map(k => [k, true])))
  const regla = fraseRegla({ compra: { ...compra, modo: modoC }, venta: { ...venta, modo: modoV }, prot, valores: valoresEf, intervalo, malosCompra: malos(errCompra), malosVenta: malos(errVenta), malosProt: errProt, avanzado: avz,
    fraseCompraAvanzada: !compra.ok && def.entrada?.senal ? (() => { try { return fraseCond(def.entrada.senal, valoresEf) } catch (_) { return null } })() : null })
  const datos = useMemo(() => { try { return datosSuficientes(def, valoresEf, intervalo) } catch (_) { return null } }, [def, valoresEf, intervalo])
  const cambiaRegla = jsonCanonico(paraHuella(def, valores)) !== jsonCanonico(paraHuella(orig.current.def, orig.current.valores))
  const plan = planGuardado({ fila, est, orig: orig.current, enPrueba, estrategias, cambiaRegla })
  const version = partesNombre(fila?.name).version
  const estado = fila?.copiaDe ? `Copia de «${fila.copiaDe}». La original y sus pruebas no cambian.`
    : !fila?.id ? 'Estrategia nueva · todavía sin guardar'
    : `Versión ${version} · ${enPrueba.length ? `probada en ${enPrueba.length > 1 ? 'las pruebas' : 'la prueba'} ${enPrueba.map(x => `«${x}»`).join(', ')}` : 'sin probar todavía'}`

  // ── Cambios desde las tarjetas ──
  const cambiaCompra = (filas, modo = modoC) => setDef(d => escribeCompra(d, filas, modo))
  const cambiaVenta = (filas, modo = modoV) => setDef(d => escribeVenta(d, filas, modo))
  const anade = (id, donde) => {
    const f = { cond: condNueva(id), env: null }
    if (donde === 'compra') cambiaCompra([...compra.filas, f]); else cambiaVenta([...venta.filas, f])
    setAnadiendo(null)
  }
  const otroModo = (m) => m === 'todas' ? 'alguna' : 'todas'
  const cambiaModoCompra = () => { const m = otroModo(modoC); setModoCompraUI(m); if (compra.filas.length > 1) cambiaCompra(compra.filas, m) }
  const cambiaModoVenta = () => { const m = otroModo(modoV); setModoVentaUI(m); if (venta.filas.length > 1) cambiaVenta(venta.filas, m) }
  const valorProt = (x) => typeof x === 'string' && x.startsWith('$') ? x.slice(1) : null

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

  if (guia) return <BuilderGuia onVolver={() => setGuia(false)} volverTexto="← Volver a la estrategia"/>

  const grupos = buscaCatalogo(buscar)
  const enlaceModo = (modo, onClick) => <>{modo === 'todas' ? 'se cumplen todas' : 'basta con una'} · <button style={{ ...S.enlace, fontSize: 13 }} onClick={onClick}>cambiar a «{modo === 'todas' ? 'al menos una' : 'todas'}»</button></>
  const vacia = (t) => <div style={{ ...S.apagado, marginTop: 4 }}>{t}</div>
  const errorTarjeta = (t) => <div data-error-tarjeta style={{ color: ROJO, fontSize: 13, marginTop: 8 }}>{t}</div>
  const cajaProt = (titulo, clave, opciones, cuerpo) => (
    <div data-proteccion={clave} style={{ flex: '1 1 180px', border: `1px solid ${errProt[clave] ? ROJO : B.borde}`, borderRadius: B.radioBoton, padding: 10, background: B.fondo }}>
      <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 6 }}>{titulo}</div>
      {opciones}
      {cuerpo}
      {errProt[clave] && <div data-error-proteccion style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{errProt[clave]}</div>}
    </div>
  )
  const selProt = (pieza, clave, si, alSi, alNo) => pieza.estado === 'otro'
    ? <div style={S.apagado}>Otro: se ve y se cambia en «Avanzado».</div>
    : <select style={mini} aria-label={clave} value={pieza.estado === 'ninguno' ? 'no' : 'si'} onChange={e => e.target.value === 'si' ? alSi() : alNo()}><option value="no">Ninguno</option><option value="si">{si}</option></select>
  const numProt = (pieza, clave, poner) => { const ref = valorProt(pieza.valor); return <Numero valor={ref ? valoresEf[ref] : pieza.valor} error={errProt[clave]} etiqueta={clave} onCambia={v => ref ? setValor(ref, v) : poner(v)}/> }

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Paso 1 · Crear la estrategia</span>
        <span style={{ marginLeft: 'auto' }}><button style={S.boton} onClick={() => setGuia(true)}>Guía: cómo se prueba una estrategia</button></span>
      </div>
      <div style={{ ...S.tarjeta, marginBottom: 16 }} data-tarjeta="nombre">
        <div style={{ ...S.cuerpo, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, color: B.titulo }} htmlFor="nombre-estrategia">Nombre de la estrategia</label>
          <input id="nombre-estrategia" value={est.nombre} onChange={e => setEst(x => ({ ...x, nombre: e.target.value }))} style={{ ...entrada, flex: '1 1 260px', maxWidth: 480, ...(errNombre ? { borderColor: ROJO } : {}) }}/>
          <span data-estado style={S.secundario}>{estado}</span>
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
                          <div data-pregunta style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={S.secundario}>¿Añadir a Compro o a Vendo?</span>
                            <button style={{ ...S.boton, padding: '3px 10px', color: AZUL, opacity: compra.ok ? 1 : 0.5 }} disabled={!compra.ok} onClick={() => anade(id, 'compra')}>Compro</button>
                            <button style={{ ...S.boton, padding: '3px 10px', color: NARANJA, opacity: venta.ok ? 1 : 0.5 }} disabled={!venta.ok} onClick={() => anade(id, 'venta')}>Vendo</button>
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
        <div data-columna="tarjetas" style={{ flex: '3 1 420px', minWidth: 0 }}>
          {avz.length > 0 && <div data-aviso="avanzado" style={{ color: AMARILLO, marginBottom: 10 }}>Esta estrategia tiene partes que solo se pueden ver y cambiar en «Avanzado» (abajo).</div>}
          <Tarjeta titulo="Compro cuando…" color={AZUL} datos={{ 'data-tarjeta': 'compra' }} derecha={compra.ok ? enlaceModo(modoC, cambiaModoCompra) : null}>
            {compra.ok ? <>
              {compra.filas.map((f, k) => <Fila key={k} f={f} errores={errCompra[k]} valores={valoresEf} color={AZUL} onValor={setValor}
                onCambia={g => cambiaCompra(compra.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaCompra(compra.filas.filter((_, j) => j !== k))}/>)}
              {!compra.filas.length && vacia('Añade condiciones desde el catálogo con «+».')}
            </> : <div style={S.secundario}>{(() => { try { return `Compra cuando ${fraseCond(def.entrada?.senal, valoresEf)}.` } catch (_) { return '' } })()} <span style={{ color: AMARILLO }}>Se cambia en «Avanzado».</span></div>}
            {sinCompra && errorTarjeta('Falta la condición de compra: añade al menos una con «+» (por ejemplo, «Cierre frente a una media»).')}
          </Tarjeta>

          <Tarjeta titulo="Vendo cuando…" color={NARANJA} datos={{ 'data-tarjeta': 'venta' }} derecha={venta.ok ? enlaceModo(modoV, cambiaModoVenta) : null}>
            {venta.ok ? <>
              {venta.filas.map((f, k) => <Fila key={k} f={f} errores={errVenta[k]} valores={valoresEf} color={NARANJA} onValor={setValor}
                onCambia={g => cambiaVenta(venta.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaVenta(venta.filas.filter((_, j) => j !== k))}/>)}
              {!venta.filas.length && vacia('Sin condiciones de venta: sale solo por la protección de abajo. Añádelas desde el catálogo con «+».')}
            </> : <div style={{ color: AMARILLO }}>Las condiciones de venta se ven y se cambian en «Avanzado».</div>}
          </Tarjeta>

          <Tarjeta titulo="Protección" datos={{ 'data-tarjeta': 'proteccion' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {cajaProt('Stop de pérdidas', 'stop',
                selProt(prot.stop, 'stop', 'Vender si pierde…', () => setDef(d => ponStop(d, DEFECTO_PROTECCION.stop)), () => setDef(d => ponStop(d, null))),
                prot.stop.estado === 'pct' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{numProt(prot.stop, 'stop', v => setDef(d => ponStop(d, v)))}<span>% bajo el precio de compra</span></div>)}
              {cajaProt('Objetivo de ganancia', 'objetivo',
                selProt(prot.objetivo, 'objetivo', 'Vender al ganar…', () => setDef(d => ponSalida(d, 'objetivo', 'multiploR', DEFECTO_PROTECCION.objetivo)), () => setDef(d => ponSalida(d, 'objetivo', 'multiploR', null))),
                prot.objetivo.estado === 'veces' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{numProt(prot.objetivo, 'objetivo', v => setDef(d => ponSalida(d, 'objetivo', 'multiploR', v)))}<span>veces lo que arriesgas (la distancia hasta el stop)</span></div>)}
              {cajaProt('Salida por tiempo', 'tiempo',
                selProt(prot.tiempo, 'tiempo', 'Vender a las…', () => setDef(d => ponSalida(d, 'tope', 'velas', DEFECTO_PROTECCION.tiempo)), () => setDef(d => ponSalida(d, 'tope', 'velas', null))),
                prot.tiempo.estado === 'velas' && (() => { const ref = valorProt(prot.tiempo.valor), nv = ref ? valoresEf[ref] : prot.tiempo.valor; return (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{numProt(prot.tiempo, 'tiempo', v => setDef(d => ponSalida(d, 'tope', 'velas', v)))}<span>velas</span></div>
                    <div data-equivalencia style={{ ...S.apagado, marginTop: 4 }}>({errProt.tiempo ? '[?]' : aTexto(nv)} {u.mercado}, porque esta estrategia usa {u.texto})</div>
                  </div>) })())}
            </div>
            {sinSalida && errorTarjeta('La estrategia necesita una forma de salir: una condición de venta, un stop o una salida por tiempo.')}
          </Tarjeta>

          <details data-plegable="avanzado" open={avanzadoInicial || undefined} style={{ ...S.tarjeta, padding: '10px 16px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: B.titulo }}>Avanzado <span style={{ fontWeight: 400, color: B.apagado, fontSize: 13 }}>— optimizador, rangos de prueba y orden de las condiciones — no hace falta tocarlo</span></summary>
            <div style={{ marginTop: 12 }}>
              {avz.length > 0 && (
                <div data-aviso="partes" style={{ border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 10, marginBottom: 12 }}>
                  <div style={{ color: AMARILLO, fontWeight: 600 }}>Esta estrategia tiene partes que solo se pueden ver y cambiar en Avanzado.</div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: B.secundario }}>{avz.map(t => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={S.secundario}>Velas</span>
                <select style={mini} aria-label="Velas" value={intervalo} onChange={e => setEst(x => ({ ...x, valores: { ...x.valores, intervalo: e.target.value } }))}><option value="diario">diarias</option><option value="semanal">semanales</option></select>
                <span style={S.apagado}>La prueba del paso 2 solo admite velas diarias.</span>
              </div>
              <div style={{ ...S.apagado, marginBottom: 10 }}>La regla tal como la lee el motor: {(() => { try { return fraseDefinicion(def, valores) } catch (_) { return '…' } })()}</div>
              {errAvanzado.length > 0 && <div data-error-avanzado style={{ color: ROJO, fontSize: 13, marginBottom: 10 }}>{errAvanzado.map((e, k) => <div key={k}>{e}</div>)}</div>}
              <FormularioDefinicion def={def} setDef={cambio => setDef(d => ({ ...d, ...cambio }))} valoresEf={valoresEf} params={esquema?.lista || []}
                onValores={v => setEst(x => ({ ...x, valores: { ...v, ...(x.valores.intervalo ? { intervalo: x.valores.intervalo } : {}) } }))}/>
            </div>
          </details>
        </div>

        {/* ── Derecha: la regla, la comprobación y guardar ── */}
        <div data-columna="regla" style={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <Tarjeta titulo="La regla, en una frase" datos={{ 'data-tarjeta': 'regla' }}>
            <div data-regla style={{ lineHeight: 1.6 }}>{regla.partes.map((p, k) => <span key={k} data-parte={p.tipo} style={{ color: p.tipo === 'compra' ? AZUL : p.tipo === 'venta' ? NARANJA : B.texto }}>{k ? ' ' : ''}{p.texto}</span>)}</div>
          </Tarjeta>
          <Tarjeta titulo="Comprobación" datos={{ 'data-tarjeta': 'comprobacion' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li data-comprueba="compra" style={{ color: sinCompra ? ROJO : B.texto }}>{sinCompra ? '✕ Falta la condición de compra' : '✓ Hay condición de compra'}</li>
              <li data-comprueba="salir" style={{ color: sinSalida ? ROJO : B.texto }}>{sinSalida ? '✕ Falta una forma de salir' : '✓ Hay forma de salir'}</li>
              {datos && <li data-comprueba="datos" style={{ color: datos.ok ? B.texto : AMARILLO }}>{datos.ok
                ? `✓ Hay datos suficientes (la condición más larga necesita ${datos.necesita} velas previas y el backtest carga ${datos.carga})`
                : `⚠ Faltan datos al empezar: la condición más larga necesita ${datos.necesita} velas previas y el backtest carga ${datos.carga}; en las primeras ${datos.necesita - datos.carga} velas del periodo no podrá decidir`}</li>}
              {nErrores > 0 && <li data-comprueba="errores" style={{ color: ROJO }}>✕ {plural(nErrores, 'error', 'errores')} en {zonas.map(([z]) => z).join(', ').replace(/, ([^,]*)$/, ' y $1')}</li>}
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
