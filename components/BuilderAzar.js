// components/BuilderAzar.js — el paso 2 del Builder, «Probarla contra el azar», con el azar re-simulado (opción A del boceto; docs/builder.md,
// §45). Se entra desde la barra de pasos (paso 2) con la estrategia que esté abierta. El usuario elige qué prueba (tarjeta A), la app
// comprueba antes de empezar (tarjeta B: precios y operaciones) y, al confirmar, va sola y en orden: congelar (lib/pruebaAzar.js
// confirmarPrueba), comprobar que la prueba es fiable y comparar con el azar (ejecutarPrueba) y el veredicto (guardarResultado). El
// resultado se ve en su propia pantalla (components/BuilderAzarResultado.js, §46): al terminar y con «Ver». Las pruebas anteriores de la estrategia, debajo; una
// sin terminar se termina con su semilla guardada y da el mismo resultado. components/BuilderPrueba.js (el paso 2 de los lotes) no cambia.
//   estrategias: las filas de `strategies`; estrategiaId: la abierta. cargaSimbolos y cargaVelas: los del paso 1 (BuilderPanel).
//   onVolver: a «Mi trabajo»; onPaso1(fila): abre la estrategia en el paso 1; onPaso3(id): el paso 3 con ella (§48: desde la barra y
//   desde «Paso 3 · Convertirla en plan» del resultado, siempre activo).
//   deps (opcional, para las pruebas): { ctx } en lugar de la sesión de Supabase. inicial (opcional, para las pruebas de montaje):
//   { simbolos, precios, pruebas, huella, curso, valor, velas, viendo } ya leídos o en curso (viendo: { fila, resultado }, la pantalla
//   del resultado abierta).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { B, S } from '../lib/builder/estilo'
import { BarraPasos } from './BuilderPanel'
import Ayuda from './BuilderAyuda'
import BuilderAzarResultado from './BuilderAzarResultado'
import BuscadorValor from './BuscadorValor'
import { REGLA_AZAR_REGLAS } from '../lib/azarReglas'
import { PERIODOS_AZAR, comprobarPrecios, confirmarPrueba, ejecutarPrueba, esDeTarjetas, fotoDe, guardarResultado, huellaEstrategia, leerResultado, listarPruebas, tickersDe } from '../lib/pruebaAzar'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b', VERDE = '#7ee2a0'
const R = REGLA_AZAR_REGLAS
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const campo = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }
const etiqueta = { fontWeight: 600, color: B.titulo, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }
const celda = { padding: '9px 12px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
const seg = (on, desactivado) => ({ fontFamily: B.letra, fontSize: 14, padding: '6px 14px', cursor: desactivado ? 'not-allowed' : 'pointer', border: `1px solid ${on ? B.siguienteBorde : B.borde}`,
  background: on ? B.siguienteFondo : 'transparent', color: desactivado ? B.apagado : on ? B.titulo : B.secundario, fontWeight: on ? 700 : 400 })
const fecha = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const fechaHora = (d) => { if (!d) return '—'; const x = new Date(d); return `${fecha(x.toISOString())} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` }
const CHIP_VEREDICTO = { pasa: 'supera', noPasa: 'noSupera', sinVeredicto: 'neutro' }
export const ETAPAS_PANTALLA = [
  { id: 'congelar', titulo: 'Congelar', texto: 'Guarda lo que confirmaste para que no se pueda cambiar.' },
  { id: 'fiabilidad', titulo: 'Comprobar que la prueba es fiable', texto: `La ejecuta en ${R.mercados} mercados ficticios, hechos con trozos de ${R.bloque} velas del propio valor mezclados, donde ninguna estrategia puede tener ventaja. Lo normal es «aprobar» por error unas 5 de cada 100 veces. Si aprueba por error ${R.sinVeredicto} de cada 100 o más, la prueba no sirve para esta estrategia y no habrá veredicto.` },
  { id: 'comparar', titulo: 'Comparar con el azar', texto: `Tu estrategia contra las ${miles(R.copias)} copias, en ${PERIODOS_AZAR.map(p => p.nombre).join(' y en ')}.` },
  { id: 'veredicto', titulo: 'Veredicto', texto: 'Pasa, No pasa, o Sin veredicto (si el punto 2 falla).' },
]
// La barra de progreso de una prueba en curso (0–100) y la etapa iluminada (índice en ETAPAS_PANTALLA; 4 = terminada).
export function progresoDe(curso) {
  if (!curso) return { indice: -1, pct: 0 }
  const k = { congelar: 0, fiabilidad: 1, comparar: 2, veredicto: 3, hecho: 4 }[curso.etapa] ?? -1, f = curso.total ? curso.hecho / curso.total : 0
  return { indice: k, pct: k === 0 ? 1 : k === 1 ? 2 + 93 * f : k === 2 ? 95 + 4 * f : k === 3 ? 99 : k === 4 ? 100 : 0 }
}
const velasDeRespuesta = (v) => Array.isArray(v) ? v : v?.velas || []

export default function BuilderAzar({ estrategias = [], estrategiaId = null, apiFetch, version = null, cargaSimbolos = null, cargaVelas = null, onVolver, onPaso1, onPaso3 = null, deps = null, inicial = null }) {
  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const [estId, setEstId] = useState(() => String((tarjetas.find(s => String(s.id) === String(estrategiaId)) || tarjetas[0])?.id ?? ''))
  const estrategia = tarjetas.find(s => String(s.id) === estId) || null
  const [valor, setValor] = useState(inicial?.valor || 'AAPL')
  const [velas, setVelas] = useState(inicial?.velas || (estrategia && fotoDe(estrategia).params.intervalo === 'semanal' ? 'semanales' : 'diarias'))
  const [simbolos, setSimbolos] = useState(inicial?.simbolos || [valor])
  const [precios, setPrecios] = useState(inicial?.precios || {})
  const [fallo, setFallo] = useState(null)
  const [pruebas, setPruebas] = useState(inicial?.pruebas || null)
  const [huella, setHuella] = useState(inicial?.huella || null)
  const [curso, setCurso] = useState(inicial?.curso || null)   // { fila, etapa, hecho, total, resultado?, error? }
  const [viendo, setViendo] = useState(inicial?.viendo || null)   // §46: { fila, resultado }, la pantalla «Resultado de la prueba» abierta
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false }, [])
  // §50: el token, el vigente en cada llamada (y renovado ante 401/403), no el del momento de montar: ctxConSesion.
  const ctx = useMemo(() => deps?.ctx || (hayConfigSupabase() ? ctxConSesion() : null), [deps])
  const enMarcha = !!curso && !['hecho', 'error'].includes(curso.etapa)
  const nombre = estrategia?.name || 'tu estrategia'
  const tickers = useMemo(() => estrategia ? tickersDe(estrategia.definition) : [], [estrategia])
  const faltanPorLeer = [valor, ...tickers].filter(s => !precios[s])

  useEffect(() => { if (!inicial?.simbolos && cargaSimbolos) cargaSimbolos().then(xs => { if (vivo.current && xs?.length) setSimbolos(xs) }).catch(() => {}) }, [])
  const valoresLista = useMemo(() => simbolos.map(s => typeof s === 'string' ? { simbolo: s, nombre: '' } : s), [simbolos])
  // Las velas diarias que hagan falta (el valor y los índices del filtro), por el camino del paso 1 (/api/velas).
  const leePrecios = useCallback(async (syms) => {
    const pide = syms.filter((s, k) => syms.indexOf(s) === k && !precios[s])
    if (!pide.length || !cargaVelas) return precios
    const rs = await Promise.all(pide.map(s => cargaVelas(s).then(v => [s, velasDeRespuesta(v)])))
    const nuevos = { ...precios, ...Object.fromEntries(rs) }
    if (vivo.current) setPrecios(nuevos)
    return nuevos
  }, [precios, cargaVelas])
  useEffect(() => {
    if (!faltanPorLeer.length || !cargaVelas) return
    setFallo(null)
    leePrecios(faltanPorLeer).catch(e => { if (vivo.current) setFallo(`No se pudieron leer los precios: ${e.message}`) })
  }, [valor, tickers.join('|')])
  const recargaPruebas = useCallback(async () => {
    if (!ctx || !estId) return
    try { const xs = await listarPruebas(ctx, estId); if (vivo.current) setPruebas(xs) } catch (e) { if (vivo.current) setPruebas(p => p || []) }
  }, [ctx, estId])
  useEffect(() => { if (!inicial?.pruebas) recargaPruebas() }, [estId])
  useEffect(() => { if (!estrategia || inicial?.huella) return; let v = true; huellaEstrategia(estrategia).then(h => { if (v) setHuella(h) }); return () => { v = false } }, [estrategia])
  const compro = useMemo(() => {
    if (!estrategia || faltanPorLeer.length) return null
    try { return comprobarPrecios(fotoDe(estrategia), precios, valor, velas) } catch (e) { return { ok: false, error: e.message, faltan: [], operaciones: [], ceros: [] } }
  }, [estrategia, precios, valor, velas, faltanPorLeer.length])
  const puede = !!estrategia && !!ctx && !!compro && compro.ok && !compro.faltan.length && !enMarcha

  // La prueba: la ejecuta con lo guardado en `fila` y guarda su único resultado (si ya tenía uno, se queda el que había).
  const ejecuta = async (fila) => {
    try {
      setCurso({ fila, etapa: 'fiabilidad', hecho: 0, total: 1 })
      const ps = await leePrecios([fila.valor, ...tickersDe(fila.estrategia_foto.definition)])
      const resultado = await ejecutarPrueba(fila, ps, (p) => { if (vivo.current) setCurso(c => ({ ...c, etapa: p.etapa, hecho: p.hecho, total: p.total })) })
      const g = await guardarResultado(ctx, fila.id, resultado, version)
      if (vivo.current) { setCurso({ fila, etapa: 'hecho', hecho: 1, total: 1, resultado: g.resultado || resultado }); setViendo({ fila, resultado: g.resultado || resultado }) }
    } catch (e) { if (vivo.current) setCurso(c => ({ ...c, etapa: 'error', error: e.message })) }
    recargaPruebas()
  }
  const confirma = async () => {
    if (!puede) return
    setCurso({ fila: null, etapa: 'congelar', hecho: 0, total: 1 })
    let fila
    try { fila = await confirmarPrueba(ctx, { fila: estrategia, valor, velas, version }) } catch (e) { setCurso({ fila: null, etapa: 'error', error: e.message }); return }
    recargaPruebas()
    await ejecuta(fila)
  }
  const verResultado = async (fila) => {
    try { const r = await leerResultado(ctx, fila.id); if (r && vivo.current) setViendo({ fila, resultado: r.resultado }) } catch (e) { setFallo(e.message) }
  }

  const prog = progresoDe(curso)
  const ayudaValor = 'Un valor: la estrategia se prueba en un solo activo, por ejemplo AAPL o el oro.'
  const ayudaPeriodos = 'Fijos. El periodo de ensayo 2010–2015 ya lo usaste para crearla en el paso 1: probarla ahí sería hacer trampa sin querer.'
  const [n1, n2] = compro?.operaciones || []

  const tarjetaA = (
    <div data-tarjeta="elige" style={{ ...S.tarjeta, overflow: 'visible' }}>
      <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0` }}>A · Elige qué vas a probar</div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={etiqueta}>Estrategia</div>
          {tarjetas.length ? <select aria-label="Estrategia" value={estId} disabled={enMarcha} onChange={e => { const s = tarjetas.find(x => String(x.id) === e.target.value); setEstId(e.target.value); setCurso(null); setPruebas(null); setHuella(null); if (s) setVelas(fotoDe(s).params.intervalo === 'semanal' ? 'semanales' : 'diarias') }} style={{ ...campo, maxWidth: '100%' }}>
            {tarjetas.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select> : <div style={S.secundario}>No tienes estrategias de tarjetas. Crea una en el paso 1.</div>}
          {estrategia && <div style={{ ...S.apagado, marginTop: 6 }}>Se prueba tal como está guardada. Si luego la cambias, será «{estrategia.name} · versión 2» y necesitará su propia prueba.</div>}
        </div>
        <div>
          <div style={etiqueta}>¿Dónde?<Ayuda texto={ayudaValor} etiqueta="¿Dónde?"/></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0 }}>
            <button aria-pressed="true" style={{ ...seg(true), borderRadius: '6px 0 0 6px' }}>Un valor</button>
            <button disabled aria-pressed="false" title="Llegará más adelante" style={{ ...seg(false, true), borderRadius: '0 6px 6px 0', borderLeft: 'none' }}>Una lista de valores</button>
            <span style={{ ...S.apagado, marginLeft: 10 }}>Llegará más adelante</span>
          </div>
          <div style={{ marginTop: 10, pointerEvents: enMarcha ? 'none' : undefined, opacity: enMarcha ? 0.6 : 1 }}><BuscadorValor valores={valoresLista} valor={valor} onCambia={s => { setValor(s); setCurso(null) }}/></div>
        </div>
        <div>
          <div style={etiqueta}>Velas</div>
          <div style={{ display: 'flex' }}>
            {[['diarias', 'Diarias'], ['semanales', 'Semanales']].map(([k, t], i) => <button key={k} aria-pressed={velas === k} disabled={enMarcha} onClick={() => { setVelas(k); setCurso(null) }} style={{ ...seg(velas === k), borderRadius: i ? '0 6px 6px 0' : '6px 0 0 6px', ...(i ? { borderLeft: 'none' } : {}) }}>{t}</button>)}
          </div>
        </div>
        <div>
          <div style={etiqueta}>Periodos<Ayuda texto={ayudaPeriodos} etiqueta="Periodos"/></div>
          <div style={{ display: 'flex', gap: 8 }}>{PERIODOS_AZAR.map(p => <span key={p.nombre} data-periodo={p.nombre} style={S.chip('neutro')}>{p.nombre}</span>)}</div>
        </div>
        <div>
          <div style={etiqueta}>Para pasar</div>
          <span data-para-pasar style={S.chip('neutro')}>Ganar al {R.gana} % de las copias al azar en los dos periodos</span>
          <div style={{ ...S.apagado, marginTop: 6 }}>Decidido antes de ver resultados. No se puede cambiar.</div>
        </div>
      </div>
    </div>
  )

  const lineaPrecios = !estrategia ? null : fallo ? <div style={{ color: ROJO }}>{fallo}</div>
    : faltanPorLeer.length ? <div style={S.secundario}>Leyendo los precios de {faltanPorLeer.join(', ')}…</div>
    : compro?.error ? <div style={{ color: ROJO }}>{compro.error}</div>
    : compro.faltan.length ? compro.faltan.map(f => <div key={f.quien + f.tramo} data-comprueba="precios-faltan" style={{ color: ROJO }}>✕ Faltan precios de {f.quien} para {f.tramo}. No se puede probar.</div>)
    : <div data-comprueba="precios-bien" style={{ color: VERDE }}>✓ Hay precios de {valor} desde el {fecha(compro.primera)} hasta el {fecha(compro.ultima)}.</div>
  const lineaOps = !compro || compro.faltan?.length || compro.error ? null : (<>
    <div data-comprueba="operaciones">En {PERIODOS_AZAR[0].nombre} haría {n1} operaciones y en {PERIODOS_AZAR[1].nombre}, {n2}.</div>
    {compro.ceros.map(p => <div key={p} data-comprueba="sin-operaciones" style={{ color: ROJO }}>✕ En {p} no haría ninguna operación. No se puede probar.</div>)}
    {!compro.ceros.length && compro.pocas && <div data-comprueba="pocas" style={{ color: AMARILLO }}>Pocas operaciones: con menos de {R.pocasOperaciones}, el resultado puede ser casualidad. La app lo avisará en el veredicto.</div>}
  </>)
  const tarjetaB = (
    <div data-tarjeta="comprueba" style={{ ...S.tarjeta, marginTop: 16 }}>
      <div style={S.cabeceraTarjeta}>B · Antes de empezar, la app comprueba</div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div><div style={etiqueta}>Precios</div>{lineaPrecios}</div>
        <div><div style={etiqueta}>Operaciones</div>{lineaOps || <span style={S.apagado}>—</span>}</div>
        <div data-aviso-congela style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 10, ...S.secundario }}>Al confirmar, la prueba se congela. Si pudieras ver el resultado y retocar un número, acabarías probando hasta que saliera bien por casualidad. Para probar otra idea, crea una prueba nueva.</div>
        {!ctx && <div style={{ color: AMARILLO }}>Sin conexión con la base de datos: no se puede congelar la prueba.</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button data-boton="confirmar" style={puede ? S.botonVerde : S.botonDesactivado} disabled={!puede} onClick={confirma}>{enMarcha ? 'Probando…' : 'Confirmar y probar'}</button>
          <button style={S.boton} disabled={enMarcha} onClick={() => onPaso1?.(estrategia)}>Volver al paso 1</button>
        </div>
      </div>
    </div>
  )

  const queSePrueba = (
    <div data-tarjeta="que-se-prueba" style={S.tarjeta}>
      <div style={S.cabeceraTarjeta}>¿Qué se prueba?</div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>La app hace {miles(R.copias)} copias de tu estrategia que compran en fechas al azar, tantas veces como compra la tuya, y venden con tus mismas reglas de venta y tus mismos stops. Si tu estrategia no gana claramente a esas copias, su momento de compra no aporta nada: fue suerte o el mercado subía.</div>
        <div style={S.secundario}>Ejemplo: tu estrategia gana un 14 % al año. De las 1.000 copias, 960 ganan menos que eso → ganas al 96 % → pasa ese periodo. Si solo 700 ganan menos → ganas al 70 % → no pasa.</div>
      </div>
    </div>
  )
  const etapas = (
    <div data-tarjeta="etapas" style={{ ...S.tarjeta, marginTop: 16 }}>
      <div style={S.cabeceraTarjeta}>La app lo hace sola</div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog.pct)} style={{ height: 8, borderRadius: 4, background: B.borde, overflow: 'hidden' }}>
          <div style={{ width: `${prog.pct}%`, height: '100%', background: curso?.etapa === 'error' ? ROJO : B.verde, transition: 'width 0.2s' }}/>
        </div>
        {ETAPAS_PANTALLA.map((e, k) => {
          const hecha = prog.indice > k, ahora = prog.indice === k && curso?.etapa !== 'error'
          return (
            <div key={e.id} data-etapa={e.id} data-estado={hecha ? 'hecha' : ahora ? 'ahora' : 'pendiente'} style={{ display: 'flex', gap: 10, opacity: hecha || ahora ? 1 : 0.55 }}>
              <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                background: hecha ? B.verde : ahora ? B.siguienteFondo : 'transparent', color: hecha ? B.sobreVerde : B.titulo, border: `1px solid ${hecha ? B.verde : ahora ? B.siguienteBorde : B.borde}` }}>{hecha ? '✓' : k + 1}</span>
              <span><strong style={{ color: B.titulo }}>{e.titulo}</strong>{ahora && e.id === 'fiabilidad' && curso?.total > 1 ? <span style={S.apagado}> · {curso.hecho} de {curso.total} mercados</span> : null}<div style={{ ...S.secundario, fontSize: 13 }}>{e.texto}</div></span>
            </div>
          )
        })}
        {curso?.etapa === 'error' && <div data-error-prueba style={{ color: ROJO }}>No se pudo terminar: {curso.error}{curso.fila ? ' La prueba quedó congelada: abajo, «Terminar el cálculo».' : ''}</div>}
      </div>
    </div>
  )
  const anteriores = (
    <div data-tarjeta="anteriores" style={{ ...S.tarjeta, marginTop: 16 }}>
      <div style={S.cabeceraTarjeta}>Pruebas anteriores de esta estrategia</div>
      {!pruebas ? <div style={{ ...S.cuerpo, ...S.secundario }}>{ctx ? 'Cargando…' : 'Sin conexión con la base de datos.'}</div>
        : !pruebas.length ? <div data-sin-pruebas style={{ ...S.cuerpo, ...S.secundario }}>Todavía no hay ninguna. Cada prueba confirmada quedará aquí, con su fecha y su resultado, y no se podrá borrar.</div>
        : <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }} data-tabla="pruebas-azar">
          <thead><tr>{['Fecha', 'Valor', 'Velas', 'Veredicto'].map(h => <th key={h} style={{ ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }}>{h}</th>)}</tr></thead>
          <tbody>{pruebas.map(p => {
            const corriendo = enMarcha && curso?.fila?.id === p.id
            return (
              <tr key={p.id} data-prueba-azar={p.id}>
                <td style={{ ...celda, whiteSpace: 'nowrap' }}>{fechaHora(p.creada_en)}{huella && p.estrategia_huella !== huella && <div data-cambiada style={{ color: AMARILLO, fontSize: 12, whiteSpace: 'normal' }}>La estrategia ha cambiado desde esta prueba.</div>}</td>
                <td style={celda}>{p.valor}</td>
                <td style={celda}>{p.velas}</td>
                <td style={celda}>{p.resultado ? <><span style={S.chip(CHIP_VEREDICTO[p.resultado.veredicto])}>{p.resultado.texto}</span> <button style={{ ...S.enlace, fontSize: 13, marginLeft: 6 }} onClick={() => verResultado(p)}>Ver</button></>
                  : <><span style={S.chip('borrador')}>{corriendo ? 'Calculando…' : 'Sin terminar'}</span>{!corriendo && <button data-boton="terminar" style={{ ...S.boton, padding: '4px 10px', fontSize: 13, marginLeft: 8 }} disabled={enMarcha || !ctx} onClick={() => ejecuta(p)}>Terminar el cálculo</button>}</>}</td>
              </tr>
            )
          })}</tbody>
        </table></div>}
    </div>
  )

  // §46: la pantalla «Resultado de la prueba» (con lo guardado); «← Volver», a la de confirmación.
  if (viendo) {
    const aPaso1 = () => onPaso1?.(tarjetas.find(s => String(s.id) === String(viendo.fila.estrategia_id)) || estrategia)
    return (
      <div style={S.pagina}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <button data-boton="volver" style={{ ...S.enlace, color: B.secundario }} onClick={() => setViendo(null)}>← Volver</button>
          <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
        </div>
        <BarraPasos actual={2} onPaso={(n) => { if (n === 1) aPaso1(); else if (n === 3) onPaso3?.(viendo.fila.estrategia_id) }}/>
        <BuilderAzarResultado prueba={viendo.fila} resultado={viendo.resultado} onPaso1={aPaso1} onPaso3={() => onPaso3?.(viendo.fila.estrategia_id)}/>
      </div>
    )
  }
  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} disabled={enMarcha} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
      </div>
      <BarraPasos actual={2} onPaso={enMarcha ? null : (n) => { if (n === 1) onPaso1?.(estrategia); else if (n === 3) onPaso3?.(estrategia?.id ?? null) }}/>
      <div style={{ fontSize: 20, fontWeight: 700, color: B.titulo, marginTop: 8 }}>¿Gana «{nombre}» por algo más que suerte?</div>
      <div style={{ ...S.secundario, marginTop: 4, marginBottom: 16 }}>Tú eliges dónde probarla y confirmas. Lo demás lo hace la app sola, en orden.</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div data-columna="izquierda" style={{ flex: '1 1 380px', minWidth: 0 }}>{tarjetaA}{tarjetaB}</div>
        <div data-columna="derecha" style={{ flex: '1 1 380px', minWidth: 0 }}>{queSePrueba}{etapas}{anteriores}</div>
      </div>
    </div>
  )
}
