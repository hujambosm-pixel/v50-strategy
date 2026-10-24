// components/BuilderPrueba.js — el paso 2 del Builder, «Probarla contra el azar» (docs/builder.md, tanda 2), con el estilo de
// lib/builder/estilo.js. El usuario solo confirma qué se prueba (tarjeta A); lo demás va solo y en orden (tarjeta B: congelar,
// calibrar, comparar con el azar y veredicto; lib/builder/pruebaGuiada.js, lo mismo que el modo Lotes del editor). Si se
// cierra a medias, al volver se lee de la base lo hecho y se sigue con «Continuar». Un lote ya congelado se abre aquí en solo
// lectura, con sus etapas y sus resultados. Con el veredicto hecho (tanda 2b), arriba van los resultados y el siguiente paso, y
// «qué se probó y cómo» queda en un plegable. Los «?» y «Cómo leer estos resultados» sacan sus textos de lib/builder/ayuda.js.
// Tanda 2c: los nombres del Builder (laboratorio de operaciones, laboratorio de cartera, verificación de sesgos), el plegable
// «Cómo funciona esta prueba» con los datos guardados y la guía (components/BuilderGuia.js). V9.1041: en pantalla, el lote
// se llama «prueba»; el botón desactivado es gris y cada chip de periodo dice de qué laboratorio sale.
//   inicio: { estrategiaId } (confirmar una prueba nueva a partir de esa estrategia) | { loteId } (un lote congelado) | {} (nueva, vacía)
//   lotes: las filas de editor_lotes que ya leyó el Builder. deps (opcional, para las pruebas): { ctx, f, listar, guardar }.
//   estadoInicial (opcional, para las pruebas de montaje): { fila, est } ya leídos.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { BarraPasos } from './BuilderPanel'
import BotonCopiar from './BotonCopiar'
import { textoAIso } from './CampoFecha'
import { isoAMostrar } from './SelectorPeriodo'
import Ayuda from './BuilderAyuda'
import BuilderGuia from './BuilderGuia'
import BuilderCurvas from './BuilderCurvas'
import { AYUDA, AYUDA_GANA, COMO_LEER, textoOperaciones, textoCartera, textoSesgos } from '../lib/builder/ayuda'
import { ETAPAS, OPCIONES_UNIVERSO, loteDesde, nombrePropuesto, erroresPorCampo, textoQueSePrueba, leeHecho, etapasDe, etapasConNotas, completo, encadena, congela, veredictoVariante, filasResultado, esSemanal, nombrePeriodo } from '../lib/builder/pruebaGuiada'
import { PERIODOS_DEFECTO, MAX_PERIODOS, MAX_VARIANTES, REGLAS_UNIVERSO, comunNormal, esUniversoDinamico, nombreUniversoLote, nombreVariante } from '../lib/editor/lotes'
import { esDefinicionEditor } from '../lib/editor/fuente'
import { fraseDefinicion } from '../lib/editor/definicion'
import { veredictoEditorLab } from '../lib/editor/laboratorio'
import { textoLoteEditor } from '../lib/exportaTexto'
import { avisoUniverso } from './AzarCarteraPanel'
import { guardarPrueba, listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b'
const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }
const etiqueta = { fontWeight: 600, color: B.titulo, marginBottom: 6 }
const celda = { padding: '9px 12px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
const pct = (x) => x == null || !Number.isFinite(x) ? '—' : `${(Math.round(x * 10) / 10).toFixed(1).replace('.', ',')} %`
const ESTADO_TXT = { pendiente: 'Pendiente', enMarcha: 'En marcha', hecho: 'Hecho', error: 'Error' }
const CHIP_ETAPA = { pendiente: 'neutro', enMarcha: 'borrador', hecho: 'supera', error: 'noSupera' }
const etapasVacias = () => Object.fromEntries(ETAPAS.map(e => [e.id, { estado: 'pendiente' }]))
// El veredicto va como chip grande («Pasa» / «No llega» / «Sin veredicto») y, al lado, la frase sin ese comienzo.
const CHIP_VEREDICTO = (pasa) => pasa === true ? ['supera', 'Pasa'] : pasa === false ? ['noSupera', 'No llega'] : ['neutro', 'Sin veredicto']
const sinComienzo = (t) => { const s = t.replace(/^(Pasa|No llega|Sin veredicto):\s*/, ''); return s.charAt(0).toUpperCase() + s.slice(1) }
const plegable = { background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, padding: '10px 16px', marginTop: 16 }
const resumenPlegable = { cursor: 'pointer', fontWeight: 700, color: B.titulo }

// Los errores de las fechas escritas (textos: [{ desde, hasta }] como dd/mm/aaaa): por caja y el orden. Se usa al pintar; si
// hay alguno, «Confirmar y probar» queda desactivado.
export function revisaFechas(textos) {
  const mal = (txt, iso) => iso ? null : String(txt || '').trim() ? 'fecha no válida; escríbela como dd/mm/aaaa (p. ej. 31/12/2020).' : 'escribe la fecha como dd/mm/aaaa.'
  const porFila = textos.map(t => {
    const d = textoAIso(t.desde), h = textoAIso(t.hasta)
    const orden = !d || !h || d < h ? null : d === h ? `El inicio y el final son el mismo día (${isoAMostrar(d)}): el final tiene que ser posterior.`
      : `El inicio (${isoAMostrar(d)}) es posterior al final (${isoAMostrar(h)}): cámbialas de orden.`
    return { desde: mal(t.desde, d), hasta: mal(t.hasta, h), orden }
  })
  return { porFila, hayError: porFila.some(x => x.desde || x.hasta || x.orden) }
}

function Errores({ lista }) {
  return lista?.length ? <div style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{lista.map((e, k) => <div key={k}>{e}</div>)}</div> : null
}
function Tarjeta({ titulo, children, estilo }) {
  return <div style={{ ...S.tarjeta, marginTop: 16, ...estilo }}><div style={S.cabeceraTarjeta}>{titulo}</div><div style={S.cuerpo}>{children}</div></div>
}

export default function BuilderPrueba({ estrategias = [], lotes = [], inicio = {}, apiFetch, version, onVolver, onNuevaPrueba, onCambio, deps: depsPrueba = null, estadoInicial = null, curvasInicial = null }) {
  const delEditor = useMemo(() => estrategias.filter(s => esDefinicionEditor(s.definition)), [estrategias])
  const deps = useMemo(() => {
    const ctx = depsPrueba?.ctx || { url: getSupaUrl(), headers: getSupaH() }
    return { ctx, f: depsPrueba?.f || ((...a) => fetch(...a)), listar: depsPrueba?.listar || listarPruebas, guardar: depsPrueba?.guardar || guardarPrueba, apiFetch: depsPrueba?.apiFetch || apiFetch, version, cargaUniverso: depsPrueba?.cargaUniverso }
  }, [depsPrueba, apiFetch, version])
  const sinBase = !depsPrueba && !hayConfigSupabase()

  // ── Confirmar (solo sin lote) ──
  const [elegidas, setElegidas] = useState(() => inicio.estrategiaId != null ? [inicio.estrategiaId] : [])
  const [claveU, setClaveU] = useState('momentum|30')
  // Las fechas se escriben como dd/mm/aaaa (textos: lo que hay en las cajas, con la misma lectura que CampoFecha) y de ahí
  // salen los periodos en ISO, igual que antes (una caja con una fecha imposible da '' y el lote no valida). revisaFechas da
  // el error de cada caja en el mismo pintado, así que «Confirmar y probar» se desactiva sin esperar a nada. claves: una por
  // periodo, aparte del lote (para no cambiar su huella), para que no se confundan las cajas al quitar un periodo.
  const [textos, setTextos] = useState(() => PERIODOS_DEFECTO.map(p => ({ desde: isoAMostrar(p.desde), hasta: isoAMostrar(p.hasta) })))
  const [claves, setClaves] = useState(() => PERIODOS_DEFECTO.map((_, k) => k))
  const sigClave = useRef(PERIODOS_DEFECTO.length)
  const periodos = textos.map(t => ({ desde: textoAIso(t.desde) || '', hasta: textoAIso(t.hasta) || '' }))
  const fechas = revisaFechas(textos)
  const [nombre, setNombre] = useState(null)   // null = el propuesto
  const [anade, setAnade] = useState('')
  const estrElegidas = elegidas.map(id => delEditor.find(s => String(s.id) === String(id))).filter(Boolean)
  const nombreEf = nombre ?? nombrePropuesto(estrElegidas)
  const opU = OPCIONES_UNIVERSO.find(o => o.clave === claveU) || OPCIONES_UNIVERSO[0]
  const loteNuevo = useMemo(() => loteDesde({ estrategias: estrElegidas, universo: { tipo: 'ndx', regla: opU.regla, n: opU.n }, periodos, nombre: nombreEf }), [JSON.stringify(elegidas), claveU, JSON.stringify(periodos), nombreEf, delEditor])
  const semanales = estrElegidas.filter(esSemanal)
  const errores = useMemo(() => {
    const e = erroresPorCampo(loteNuevo)
    for (const s of semanales) e.variantes.unshift(`«${s.name}» usa velas semanales: esta prueba solo funciona con velas diarias. Quítala o cámbiala a diarias en el editor.`)
    return e
  }, [loteNuevo, semanales.length])
  const hayErrores = Object.values(errores).some(x => x.length) || fechas.hayError
  const [verGuia, setVerGuia] = useState(false)   // la guía se abre aquí mismo: la prueba sigue montada (y corriendo)

  // ── El lote congelado, lo hecho y las etapas ──
  const [fila, setFila] = useState(estadoInicial?.fila || null)
  const [est, setEst] = useState(estadoInicial?.est || null)
  const [etapas, setEtapas] = useState(() => estadoInicial ? etapasConNotas(estadoInicial.fila, estadoInicial.est) : etapasVacias())
  const [corriendo, setCorriendo] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const parar = useRef(false)
  useEffect(() => () => { parar.current = true }, [])
  // Abrir un lote: leer lo hecho del registro.
  useEffect(() => {
    if (estadoInicial || inicio.loteId == null || fila?.id === inicio.loteId) return
    const f = lotes.find(x => x.id === inicio.loteId)
    if (!f) { if (lotes.length) setErrorGeneral('No encuentro esa prueba.'); return }
    setFila(f); setLeyendo(true)
    leeHecho(f, deps).then(e => { setEst(e); setEtapas(etapasConNotas(f, e)) }).catch(e => setErrorGeneral(`No se pudo leer lo hecho: ${e.message}`)).finally(() => setLeyendo(false))
  }, [inicio.loteId, lotes])

  const al = (id, cambio) => setEtapas(x => ({ ...x, [id]: { ...(id === 'calibrar' && cambio.estado === 'hecho' ? {} : x[id]), ...cambio, ...(cambio.estado !== 'error' ? { error: null } : {}) } }))
  const sigue = async (f, e0) => {
    setCorriendo(true); setErrorGeneral(null); parar.current = false
    try {
      const e = await encadena(f, e0, { ...deps, parar: () => parar.current }, al)
      setEst(e); onCambio?.()
    } catch (err) {
      setEtapas(x => { const k = Object.keys(x).find(id => x[id].estado === 'enMarcha'); return k ? { ...x, [k]: { ...x[k], estado: 'error', error: err.message } } : x })
      setErrorGeneral(err.message)
      try { setEst(await leeHecho(f, deps)) } catch (_) {}
      onCambio?.()
    }
    setCorriendo(false)
  }
  const confirma = async () => {
    if (hayErrores || corriendo) return
    setCorriendo(true); setErrorGeneral(null)
    al('congelar', { estado: 'enMarcha', progreso: null, texto: 'guardando…' })
    try {
      const { fila: f, yaExistia } = await congela(loteNuevo, deps)
      setFila(f)
      al('congelar', { estado: 'hecho', nota: yaExistia ? 'Esta misma prueba ya estaba congelada: se sigue con ella.' : null })
      const e0 = await leeHecho(f, deps)
      setEst(e0); onCambio?.()
      setCorriendo(false)
      await sigue(f, e0)
    } catch (err) { al('congelar', { estado: 'error', error: err.message }); setErrorGeneral(err.message); setCorriendo(false) }
  }
  const continua = () => { if (fila && est && !corriendo) { parar.current = false; sigue(fila, est) } }

  const lote = fila?.lote || loteNuevo
  const queSePrueba = textoQueSePrueba(lote)
  const hecho = fila && est && completo(etapasDe(fila, est))
  const faltaAlgo = fila && est && !hecho
  const calibrando = corriendo && etapas.calibrar.estado === 'enMarcha'
  const titulo = fila ? fila.nombre : (estrElegidas[0]?.name || 'tu estrategia')
  const resultados = fila && est ? filasResultado(fila, est) : []
  const veredictos = fila && est ? fila.lote.variantes.map(v => ({ v, ...veredictoVariante({ cal: est.cal[v.id], lab: est.lab[v.id], abVariante: (est.ab?.resultados || []).find(x => x.id === v.id) }) })) : []
  const algunaPasa = veredictos.some(x => x.pasa === true)
  // V9.1042: los resultados van arriba en cuanto la prueba tiene veredicto en todas sus variantes, aunque le falte algo (las
  // pruebas antiguas, como PRUEBA_EDITOR_1, no tienen verificación de sesgos ni laboratorio de operaciones: decide el
  // laboratorio de cartera, así que ya están terminadas). Antes solo iban arriba con las cuatro etapas hechas.
  const conVeredicto = !!(fila && est && veredictos.length && veredictos.every(x => x.decide))
  const arriba = hecho || conVeredicto
  const textoCopia = () => {
    const cn = comunNormal(fila.lote.comun)
    return textoLoteEditor({ fila, ejec: est?.ab || null, version, completo: true,
      lab: fila.lote.variantes.map(v => ({ nombre: nombreVariante(v), id: v.id, cal: est?.cal[v.id] || null, periodos: est?.lab[v.id] || null, veredicto: veredictoEditorLab(est?.cal[v.id] || null, est?.lab[v.id] || null) })),
      avisoUniverso: esUniversoDinamico(cn.universo) ? avisoUniverso(cn.universo.regla) : '',
      frases: Object.fromEntries(fila.lote.variantes.map(v => { try { return [v.id, fraseDefinicion(v.definicion, v.valores || {})] } catch (_) { return [v.id, '—'] } })) })
  }

  const ponFecha = (k, campo, v) => setTextos(x => x.map((y, j) => j === k ? { ...y, [campo]: v } : y))
  const quitaPeriodo = (k) => { setTextos(x => x.filter((_, j) => j !== k)); setClaves(x => x.filter((_, j) => j !== k)) }
  const anadePeriodo = () => { setTextos(x => [...x, { desde: '', hasta: '' }]); setClaves(x => [...x, sigClave.current++]) }
  const cajaFecha = (k, campo, error) => <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={textos[k][campo]} aria-invalid={!!error}
    aria-label={`Periodo ${k + 1}: ${campo}`} onChange={e => ponFecha(k, campo, e.target.value)} style={{ ...entrada, width: 110, ...(error ? { borderColor: ROJO } : {}) }}/>
  // El aviso general de «desde < hasta» ya sale junto a cada periodo (fecha imposible o fin antes del inicio).
  const erroresPeriodos = errores.periodos.filter(e => !/necesita dos fechas/.test(e))
  const bloqueado = hayErrores || corriendo || sinBase

  const queSePruebaBloque = (
    <div style={{ background: B.siguienteFondo, border: `1px solid ${B.siguienteBorde}`, borderRadius: B.radioTarjeta, padding: B.aire, marginTop: 16 }}>
      <div style={{ fontWeight: 700, color: B.titulo, marginBottom: 6 }}>Qué se prueba</div>
      {queSePrueba.map((t, k) => <div key={k} style={{ marginBottom: 4 }}>{t}</div>)}
    </div>
  )

  // Tarjeta A: confirmar (o, con un lote, lo confirmado en solo lectura)
  const tarjetaConfirma = (
    <Tarjeta titulo={fila ? 'Lo que se confirmó (ya no se puede cambiar)' : 'Confirma qué vas a probar'}>
      {fila ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px' }}>
          <span style={S.secundario}>Variantes</span><span>{fila.lote.variantes.map(nombreVariante).join(' · ')}</span>
          <span style={S.secundario}>Valores</span><span>{nombreUniversoLote(comunNormal(fila.lote.comun).universo)}</span>
          <span style={S.secundario}>Periodos</span><span>{comunNormal(fila.lote.comun).periodos.map(nombrePeriodo).join(' y ')}</span>
          <span style={S.secundario}>Nombre de esta prueba</span><span>{fila.nombre}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={etiqueta}>Variantes</div>
            {estrElegidas.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span>{s.name}{esSemanal(s) ? <span style={{ color: AMARILLO }}> · velas semanales</span> : null}</span>
                <button style={{ ...S.enlace, fontSize: 12, color: B.apagado }} onClick={() => setElegidas(x => x.filter(y => String(y) !== String(s.id)))}>Quitar</button>
              </div>
            ))}
            {!estrElegidas.length && <div style={S.apagado}>Todavía ninguna.</div>}
            {estrElegidas.length < MAX_VARIANTES && (
              <select style={{ ...entrada, marginTop: 6 }} value={anade} aria-label="Añadir variante" onChange={e => { const v = e.target.value; if (v) setElegidas(x => [...x, v]); setAnade('') }}>
                <option value="">+ Añadir variante</option>
                {delEditor.filter(s => !elegidas.some(y => String(y) === String(s.id))).map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            )}
            <Errores lista={errores.variantes}/>
          </div>
          <div>
            <div style={etiqueta}>Valores</div>
            <select style={entrada} value={claveU} onChange={e => setClaveU(e.target.value)} aria-label="Valores">
              {OPCIONES_UNIVERSO.map(o => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
            </select>
            <div style={{ ...S.apagado, marginTop: 4 }}>Cada año cambia la lista: solo se puede entrar en un valor mientras está en ella.</div>
            <Errores lista={errores.universo}/>
          </div>
          <div>
            <div style={etiqueta}>Periodos</div>
            {textos.map((_, k) => {
              const e = fechas.porFila[k]
              return (
                <div key={claves[k]} data-periodo={k + 1} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {cajaFecha(k, 'desde', e.desde)}
                    <span style={S.secundario}>a</span>
                    {cajaFecha(k, 'hasta', e.hasta)}
                    {textos.length > 1 && <button style={{ ...S.enlace, fontSize: 12, color: B.apagado }} onClick={() => quitaPeriodo(k)}>Quitar</button>}
                  </div>
                  <Errores lista={[e.desde && `Desde: ${e.desde}`, e.hasta && `Hasta: ${e.hasta}`, e.orden].filter(Boolean)}/>
                </div>
              )
            })}
            {textos.length < MAX_PERIODOS && <button style={{ ...S.enlace, fontSize: 13 }} onClick={anadePeriodo}>+ Añadir periodo</button>}
            <Errores lista={erroresPeriodos}/>
          </div>
          <div>
            <div style={etiqueta}>Nombre de esta prueba</div>
            <input style={{ ...entrada, width: '100%', maxWidth: 520, boxSizing: 'border-box' }} value={nombreEf} aria-label="Nombre de esta prueba" onChange={e => setNombre(e.target.value)}/>
            <Errores lista={errores.nombre}/>
          </div>
          <div style={{ background: B.fondo, borderRadius: B.radioBoton, padding: '10px 12px', color: B.secundario }}>
            <strong style={{ color: B.titulo }}>Por qué no se puede cambiar después:</strong> si pudieras ver el resultado y retocar un número, acabarías probando hasta que saliera bien por casualidad. Para probar otra idea, crea una prueba nueva.
          </div>
          <Errores lista={errores.general}/>
          <div>
            <button style={bloqueado ? S.botonDesactivado : S.botonVerde} disabled={bloqueado} onClick={confirma}>Confirmar y probar</button>
            {hayErrores ? <div data-aviso="corrige" style={{ ...S.secundario, marginTop: 6 }}>Corrige lo que está en rojo para continuar.</div>
              : sinBase ? <div style={{ ...S.secundario, marginTop: 6 }}>Sin conexión con la base de datos: no se puede confirmar.</div> : null}
          </div>
        </div>
      )}
    </Tarjeta>
  )

  // Tarjeta B: las cuatro etapas
  const tarjetaEtapas = (
    <Tarjeta titulo="La app lo hace sola">
      {calibrando && <div style={{ color: AMARILLO, fontWeight: 600, marginBottom: 12 }}>No cierres esta página; tarda unos minutos.</div>}
      {leyendo && <div style={{ ...S.secundario, marginBottom: 12 }}>Mirando qué está hecho…</div>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {ETAPAS.map((e, k) => {
          const x = etapas[e.id] || { estado: 'pendiente' }
          return (
            <li key={e.id} data-etapa={e.id} data-estado={x.estado} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: k ? `1px solid ${B.borde}` : 'none' }}>
              <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, border: `1px solid ${B.borde}`, color: B.secundario }}>{k + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: B.titulo }}>{e.titulo}{e.ayuda && <Ayuda texto={AYUDA[e.ayuda]} etiqueta={e.titulo}/>}</span>
                  <span style={S.chip(CHIP_ETAPA[x.estado])}>{ESTADO_TXT[x.estado]}</span>
                </div>
                <div style={{ ...S.secundario, marginTop: 2 }}>{e.frase}</div>
                {x.nota && <div style={{ ...S.apagado, marginTop: 4 }}>{x.nota}</div>}
                {x.estado === 'enMarcha' && (
                  <div style={{ marginTop: 6 }}>
                    {x.texto && <div style={S.apagado}>{x.texto}</div>}
                    {x.progreso != null && <div style={{ height: 6, background: B.fondo, borderRadius: 3, marginTop: 4, overflow: 'hidden' }}><div style={{ width: `${Math.round(Math.min(1, Math.max(0, x.progreso)) * 100)}%`, height: '100%', background: B.verde }}/></div>}
                  </div>
                )}
                {x.estado === 'error' && <div style={{ color: ROJO, marginTop: 4 }}>{x.error}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      {faltaAlgo && !corriendo && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button style={S.botonVerde} onClick={continua}>Continuar</button>
          <span style={S.secundario}>{errorGeneral ? 'Se paró por el error de arriba. Lo hecho está guardado: «Continuar» sigue desde donde se quedó.' : 'Esta prueba se quedó a medias. Lo hecho está guardado: «Continuar» sigue desde donde se quedó.'}</span>
        </div>
      )}
      {errorGeneral && !fila && <div style={{ color: ROJO, marginTop: 8 }}>{errorGeneral}</div>}
    </Tarjeta>
  )

  // Resultados
  const cabeceras = [['Variante'], ['Periodo'], ['Gana a … de las copias', AYUDA_GANA], ['CAGR', AYUDA.cagr], ['Caída máxima', AYUDA.caida], ['QQQ sin hacer nada', AYUDA.qqq], ['']]
  const tarjetaResultados = fila && est && (est.ab || Object.values(est.lab).some(Boolean)) && (
    <Tarjeta titulo="Resultados">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{cabeceras.map(([h, a], k) => <th key={k} style={{ ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }}>{h}{a && <Ayuda texto={a} etiqueta={h}/>}</th>)}</tr></thead>
          <tbody>
            {resultados.map((r, k) => {
              const lab = r.decide === 'laboratorio', principal = lab ? r.percentilLab : r.percentilLote
              return (
                <tr key={k}>
                  <td style={celda}>{r.variante}</td>
                  <td style={celda}>{nombrePeriodo(r.periodo)}</td>
                  <td style={celda}>{principal == null ? '—' : `Gana a ${pct(principal)} de las copias`}{r.decide && <div style={S.apagado}>{lab ? `operaciones${r.percentilLote != null ? ` · cartera: ${pct(r.percentilLote)}` : ''}` : 'cartera'}<Ayuda texto={AYUDA.operaciones_cartera} etiqueta="operaciones y cartera"/></div>}</td>
                  <td style={celda}>{pct(r.cagr)}</td>
                  <td style={celda}>{pct(r.maxDD)}</td>
                  <td style={celda}>{r.qqq ? `${pct(r.qqq.cagr)} · cae ${pct(r.qqq.maxDD)}` : '—'}</td>
                  <td style={celda}>{r.pasa == null ? <span style={S.chip('neutro')}>Sin veredicto</span> : <span style={{ whiteSpace: 'nowrap' }}><span style={S.chip(r.pasa ? 'supera' : 'neutro')}>{`${lab ? 'Operaciones' : 'Cartera'} ${r.pasa ? '≥' : '<'} 95 en este periodo`}</span><Ayuda texto={lab ? AYUDA.chipOperaciones : AYUDA.chipCartera} etiqueta={lab ? 'Operaciones en este periodo' : 'Cartera en este periodo'}/></span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* V9.1051: la curva frente al azar y las copias del laboratorio de operaciones, con una pestaña por periodo */}
      <BuilderCurvas fila={fila} est={est} resultados={resultados} veredictos={veredictos} {...(curvasInicial || {})}/>
      <div style={{ marginTop: 14, color: B.titulo }}>
        {veredictos.map(x => {
          const [tipo, txt] = CHIP_VEREDICTO(x.pasa)
          return (
            <div key={x.v.id} data-veredicto={x.v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              {veredictos.length > 1 && <strong>{nombreVariante(x.v)}:</strong>}
              {x.decide ? <><span style={{ ...S.chip(tipo), fontSize: 15, padding: '4px 14px' }}>{txt}</span><Ayuda texto={AYUDA.umbral} etiqueta="Pasa / No llega"/><span>{sinComienzo(x.texto)}</span></> : <span>{x.texto}</span>}
            </div>
          )
        })}
      </div>
      <div style={{ ...S.apagado, marginTop: 6 }}>CAGR, caída máxima y QQQ: los del laboratorio de cartera. QQQ es solo una referencia: no cambia el veredicto.</div>
      <details style={{ ...plegable, background: B.fondo, marginTop: 12 }}>
        <summary style={resumenPlegable}>Cómo leer estos resultados</summary>
        <div style={{ marginTop: 10 }}>
          {COMO_LEER.map(([t, x]) => <div key={t} style={{ marginBottom: 8 }}><strong style={{ color: B.titulo }}>{t}.</strong> <span style={S.secundario}>{x}</span></div>)}
        </div>
      </details>
      <details style={{ ...plegable, background: B.fondo, marginTop: 12 }} data-plegable="como-funciona">
        <summary style={resumenPlegable}>Cómo funciona esta prueba</summary>
        {fila.lote.variantes.map(v => {
          const cn = comunNormal(fila.lote.comun), abV = (est.ab?.resultados || []).find(x => x.id === v.id)
          const dondeTxt = esUniversoDinamico(cn.universo) ? `los ${cn.universo.n} valores ${REGLAS_UNIVERSO[cn.universo.regla]}` : `una lista fija de ${cn.universo.symbols?.length ?? '…'} valores`
          return (
            <div key={v.id} style={{ marginTop: 10 }}>
              {fila.lote.variantes.length > 1 && <div style={{ fontWeight: 700, color: B.titulo, marginBottom: 6 }}>{nombreVariante(v)}</div>}
              {cn.periodos.map(p => {
                const pl = (est.lab[v.id] || []).find(x => x.desde === p.desde && x.hasta === p.hasta)
                const pa = Array.isArray(abV?.periodos) ? abV.periodos.find(x => x.desde === p.desde && x.hasta === p.hasta) : null
                return (
                  <div key={`${p.desde}|${p.hasta}`} data-como-funciona={`${v.id}|${p.desde}`} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 4 }}>{nombrePeriodo(p)}</div>
                    <div style={{ marginBottom: 6 }}><strong style={{ color: B.titulo }}>Laboratorio de operaciones.</strong> <span style={S.secundario}>{textoOperaciones(nombrePeriodo(p), pl)}</span></div>
                    <div><strong style={{ color: B.titulo }}>Laboratorio de cartera.</strong> <span style={S.secundario}>{textoCartera(nombrePeriodo(p), pa, cn, dondeTxt)}</span></div>
                  </div>
                )
              })}
              <div data-como-funciona={`${v.id}|sesgos`}><strong style={{ color: B.titulo }}>Verificación de sesgos.</strong> <span style={S.secundario}>{textoSesgos(est.cal[v.id] || null)}</span></div>
            </div>
          )
        })}
        <div style={{ marginTop: 12 }}><button style={S.boton} onClick={() => setVerGuia(true)}>Guía: cómo se prueba una estrategia</button></div>
      </details>
      <div style={{ marginTop: 12 }}><BotonCopiar obtenerTexto={textoCopia} etiqueta="Copiar para Claude" estilo={S.boton}/></div>
    </Tarjeta>
  )

  // Siguiente paso
  const siguientePaso = arriba && (
    <div style={{ background: B.siguienteFondo, border: `1px solid ${B.siguienteBorde}`, borderRadius: B.radioTarjeta, padding: B.aire, marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: B.titulo, marginBottom: 8 }}>Siguiente paso</div>
      {algunaPasa ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button style={{ ...S.boton, opacity: 0.6, cursor: 'not-allowed' }} disabled>Convertirla en plan</button>
          <span style={S.chip('neutro')}>Próximamente</span>
        </div>
      ) : (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button style={S.boton} onClick={() => onVolver?.()}>Volver al paso 1</button>
          <button style={S.boton} onClick={() => onNuevaPrueba?.()}>Crear prueba nueva con otra variante</button>
        </div>
        <div style={{ ...S.apagado, marginTop: 8 }}>Ojo: si pruebas muchas variantes hasta que una pase, alguna pasará por suerte. Decide antes qué idea quieres probar y por qué.</div>
      </>)}
      {faltaAlgo && (
        <div data-aviso="antigua" style={{ ...S.secundario, marginTop: 12 }}>
          {veredictos.every(x => x.decide === 'lote')
            ? 'Esta prueba no tiene verificación de sesgos ni laboratorio de operaciones (se hizo antes de que existieran): su veredicto es el del laboratorio de cartera.'
            : 'A esta prueba le falta una parte.'} Si quieres completarla, abre «Ver qué se probó y cómo» y pulsa «Continuar».
        </div>
      )}
    </div>
  )

  if (verGuia) return <BuilderGuia onVolver={() => setVerGuia(false)} volverTexto="← Volver a la prueba"/>

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
      </div>
      <BarraPasos actual={2}/>

      <div style={{ fontSize: 20, fontWeight: 700, color: B.titulo, marginTop: 8 }}>¿Gana «{titulo}» por algo más que suerte?</div>
      <div style={{ ...S.secundario, marginTop: 4 }}>Tú solo confirmas qué vas a probar. Todo lo demás va solo y en orden.</div>
      {sinBase && <div style={{ color: AMARILLO, marginTop: 12 }}>Sin conexión con la base de datos: no se puede congelar ni leer lo hecho.</div>}

      {arriba ? (<>
        {/* Con el veredicto hecho: primero lo que importa; cómo se probó, plegado. */}
        {tarjetaResultados}
        {siguientePaso}
        <details style={plegable} data-plegable="como-se-probo">
          <summary style={resumenPlegable}>Ver qué se probó y cómo</summary>
          {queSePruebaBloque}
          {tarjetaConfirma}
          {tarjetaEtapas}
        </details>
      </>) : (<>
        {queSePruebaBloque}
        {tarjetaConfirma}
        {tarjetaEtapas}
        {tarjetaResultados}
      </>)}
    </div>
  )
}
