// components/EditorLotes.js — el modo «Lotes» de la pestaña Editor (docs/editor-visual.md, E10; decisiones 4 y 5).
//
// DECLARAR un lote ANTES de ver resultados: lo común (universo —una lista fija o el Nasdaq-100 dinámico por regla y N, como
// el multibacktest—, periodos, temporalidad, reparto, simulaciones) y las variantes (estrategias del editor guardadas o las
// plantillas, cada una con sus valores y un nombre legible). CONGELARLO: se guarda en editor_lotes (sql/editor_lotes.sql, de
// solo añadir) con su huella (lib/editor/lotes.js); ya no se puede cambiar. EJECUTARLO: cada variante y periodo por
// /api/multibacktest con su definición en la petición (y, con universo dinámico, su máscara) y, en el navegador, la prueba
// A / B contra el azar (lib/azarCartera.js) con una semilla que sale de la huella; el resultado queda en el registro
// (lab_pruebas), así que cuenta en el historial. Criterio declarado: percentil del CAGR en la prueba A ≥ 95 en TODOS los
// periodos.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MONO } from '../lib/utils'
import { DEF_V50, DEF_23 } from '../lib/editor/ejemplos'
import { esDefinicionEditor } from '../lib/editor/fuente'
import { valoresDe, esquemaDe } from '../lib/editor/definicion'
import { FORMATO_LOTE, MAX_VARIANTES, MAX_PERIODOS, PERCENTIL_SUPERA, N_UNIVERSO, REGLAS_UNIVERSO, PERIODOS_DEFECTO, INICIO_UNIVERSO_NDX, validaLote, huellasLote, peticionVariante, semillaVariante,
         superaAzar, superaEnTodos, resumenLote, comunNormal, esUniversoDinamico, nombreUniversoLote, nombreVariante, huellaSeleccion } from '../lib/editor/lotes'
import { preparaCartera, realCartera, comparaConServidor, creaPrueba, resumenPrueba, motivoNoAdmitida, bhDe } from '../lib/azarCartera'
import { textoLoteEditor } from '../lib/exportaTexto'
import { fraseDefinicion } from '../lib/editor/definicion'
import BotonCopiar from './BotonCopiar'
import { resumenCurva } from '../lib/respuestaMc'
import { cargaUniversoMc, FRASE_REGLA } from '../lib/universoMc'
import { universoDePeriodo } from '../lib/screener'
import { avisoUniverso } from './AzarCarteraPanel'
import { guardarPrueba, listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'

const GRIS = 'var(--text-legible)'
const TAM = 12
const ROJO = '#ff4d6d', VERDE = '#00e5a0', AMBAR = '#ffb020', LILA = '#a78bfa'
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: TAM, color: GRIS, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '3px 6px' }
const boton = { fontFamily: MONO, fontSize: TAM, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }
const botonPrincipal = { ...boton, border: '1px solid var(--accent)', background: 'rgba(0,212,255,0.12)', color: 'var(--accent)', fontWeight: 700 }
const botonMini = { ...boton, padding: '0 6px', fontSize: 11 }
const nota = { fontFamily: MONO, fontSize: 11, color: GRIS, lineHeight: 1.5 }
const fila = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }
const celda = { textAlign: 'right', padding: '2px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const copia = (x) => JSON.parse(JSON.stringify(x))
const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }
const pct = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d).replace('.', ',')} %`
const num = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')
const fechaEs = (f) => f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—'
const nombrePeriodo = (p) => `${fechaEs(p.desde)} → ${fechaEs(p.hasta)}`
const PRIORIDADES = { fuerza_relativa: 'fuerza relativa', momentum: 'momentum', max52: 'cerca del máximo de 52 semanas', alfabetico: 'alfabético' }
const COLOR_VEREDICTO = (v) => /supera/i.test(v || '') ? VERDE : /peor/i.test(v || '') ? ROJO : /algo mejor/i.test(v || '') ? AMBAR : GRIS
const ctx = () => ({ url: getSupaUrl(), headers: getSupaH() })
// Por defecto: el Nasdaq-100 dinámico por momentum, N = 30 (no una lista de megacaps que ya se sabe que ganaron), y dos
// periodos para ver si aguanta en los dos.
const nuevoLote = () => ({ formato: FORMATO_LOTE, nombre: '', descripcion: '',
  comun: { universo: { tipo: 'ndx', regla: 'momentum', n: 30 }, periodos: copia(PERIODOS_DEFECTO), intervalo: 'diario', capitalIni: 10000, modoAsig: 'concentrado',
    sizeRules: { maxPosiciones: 4, prioridad: 'fuerza_relativa', criterioUso: 'desempate', rsWindow: 63 }, comisiones: null, nSim: 500 },
  variantes: [] })
// Un borrador siempre con la forma nueva (universo y periodos; sin symbols / desde / hasta sueltos).
const borradorDe = (l) => { const { symbols: _s, desde: _d, hasta: _h, ...resto } = comunNormal(l.comun); return { ...copia(l), comun: copia(resto) } }
const textoSimbolos = (l) => (comunNormal(l.comun).universo.symbols || []).join(', ')
const LISTA_EJEMPLO = 'AAPL, ADBE, AMD, AMGN, AVGO, CSCO, INTC, MU, NFLX, PEP, QCOM, TXN'

// borradorInicial (opcional): un lote con el que empezar la declaración en lugar del de ejemplo.
export default function EditorLotes({ apiFetch, version, estrategias = [], borradorInicial = null }) {
  const [lotes, setLotes] = useState({ filas: [], error: null, cargando: false })
  const [sel, setSel] = useState(null)            // la fila de editor_lotes elegida (congelada)
  const [borrador, setBorrador] = useState(() => borradorInicial ? borradorDe(borradorInicial) : nuevoLote())
  const [simbolosTexto, setSimbolosTexto] = useState(() => textoSimbolos(borradorInicial || nuevoLote()) || LISTA_EJEMPLO)
  const [msg, setMsg] = useState(null)
  const delEditor = useMemo(() => estrategias.filter(s => esDefinicionEditor(s.definition)), [estrategias])

  const recarga = useCallback(async () => {
    if (!hayConfigSupabase()) { setLotes({ filas: [], error: 'Sin conexión con la base de datos configurada.', cargando: false }); return }
    setLotes(l => ({ ...l, cargando: true }))
    try {
      const r = await fetch(`${getSupaUrl()}/rest/v1/editor_lotes?select=id,creado,version_app,nombre,lote,hash_lote,huellas&order=creado.desc,id.desc&limit=50`, { headers: getSupaH() })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        throw new Error(r.status === 404 || /editor_lotes/.test(t) ? 'La tabla editor_lotes no existe todavía (sql/editor_lotes.sql): hasta crearla no se pueden congelar lotes.' : `No se pudieron leer los lotes (HTTP ${r.status}).`)
      }
      setLotes({ filas: await r.json(), error: null, cargando: false })
    } catch (e) { setLotes({ filas: [], error: e.message, cargando: false }) }
  }, [])
  useEffect(() => { recarga() }, [recarga])

  // ── Declarar ──
  const errores = useMemo(() => { try { return validaLote(borrador) } catch (e) { return [e.message] } }, [borrador])
  const [huellas, setHuellas] = useState(null)
  useEffect(() => { let vivo = true; setHuellas(null); if (!errores.length) huellasLote(borrador).then(h => { if (vivo) setHuellas(h) }).catch(() => {}); return () => { vivo = false } }, [borrador, errores.length])
  const comun = (cambio) => setBorrador(b => ({ ...b, comun: { ...b.comun, ...cambio } }))
  const c = borrador.comun, u = c.universo, din = esUniversoDinamico(u)
  const ponUniverso = (nu) => comun({ universo: nu, ...(esUniversoDinamico(nu) ? { modoAsig: 'concentrado' } : {}) })
  // Una variante nueva: id corto automático (V1, V2…: entra en la huella) y nombre legible (el de la estrategia; si se
  // repite, «… (2)»), que se puede cambiar antes de congelar y no entra en la huella.
  const agregaVariante = (definicion, valores, base) => setBorrador(b => {
    let k = 1; while (b.variantes.some(v => v.id === `V${k}`)) k++
    const raiz = String(base || 'Variante').trim().slice(0, 70)
    let nombre = raiz, j = 2; while (b.variantes.some(v => nombreVariante(v) === nombre)) nombre = `${raiz} (${j++})`
    return { ...b, variantes: [...b.variantes, { id: `V${k}`, nombre, definicion: copia(definicion), valores: valoresDe(definicion, valores || {}) }] }
  })
  const cambiaVariante = (k, cambio) => setBorrador(x => ({ ...x, variantes: x.variantes.map((y, j) => j === k ? { ...y, ...cambio } : y) }))
  const congela = async () => {
    if (errores.length || !huellas) return
    setMsg(null)
    try {
      const fila = { version_app: version || null, nombre: borrador.nombre.trim(), lote: borrador, hash_lote: huellas.lote, huellas }
      const r = await fetch(`${getSupaUrl()}/rest/v1/editor_lotes`, { method: 'POST', headers: { ...getSupaH(), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fila) })
      if (r.status === 409) { setMsg({ tipo: 'err', texto: 'Ese lote ya está congelado (misma huella): elígelo en la lista.' }); recarga(); return }
      if (!r.ok) throw new Error(`No se pudo congelar el lote (HTTP ${r.status}).`)
      const j = await r.json(), f = Array.isArray(j) ? j[0] : j
      // El formulario se vacía: el lote congelado ya no se edita aquí; está a la derecha, en solo lectura.
      setBorrador(nuevoLote()); setSimbolosTexto(LISTA_EJEMPLO)
      setMsg({ tipo: 'ok', texto: `Congelado: «${fila.nombre}». Ya no se puede cambiar: está a la derecha, en solo lectura, para ejecutarlo. El formulario se ha vaciado para declarar otro.` })
      await recarga(); eligeLote(f)
    } catch (e) { setMsg({ tipo: 'err', texto: e.message }) }
  }

  // ── Ejecutar (el lote elegido): cada variante en cada periodo ──
  const [ejec, setEjec] = useState(null), [progreso, setProgreso] = useState(null), [errorEjec, setErrorEjec] = useState(null)
  // Al elegir un lote, su última ejecución guardada en el registro (lab_pruebas), si la hay: así se puede ver y copiar.
  const eligeLote = async (f) => {
    setSel(f); setEjec(null); setErrorEjec(null)
    if (!f || !hayConfigSupabase()) return
    try {
      const [u] = await listarPruebas(ctx(), { limite: 1, soloResumen: false, filtro: `&config->>prueba=eq.editorLote&config->>hashLote=eq.${f.hash_lote}` })
      if (u?.resultados?.variantes) setEjec(e => e || { resultados: u.resultados.variantes, resumen: u.resultados.resumen, creado: u.creado, versionApp: u.version_app, errorGuardar: null, delRegistro: true })
    } catch (_) {}
  }
  const textoCopia = (completo) => textoLoteEditor({ fila: sel, ejec, version, completo, avisoUniverso: esUniversoDinamico(comunNormal(sel.lote.comun).universo) ? avisoUniverso(comunNormal(sel.lote.comun).universo.regla) : '',
    frases: Object.fromEntries(sel.lote.variantes.map(v => { try { return [v.id, fraseDefinicion(v.definicion, v.valores || {})] } catch (_) { return [v.id, '—'] } })) })
  const parar = useRef(false)
  const ejecuta = async () => {
    if (!sel || progreso) return
    const lote = sel.lote, cn = comunNormal(lote.comun)
    parar.current = false; setErrorEjec(null); setEjec(null)
    const detente = () => { if (parar.current) throw new Error('Parado a petición tuya: esta ejecución no se ha guardado.') }
    try {
      // Universo dinámico: la selección de cada año (universo_screener) y los miembros del índice, una vez.
      let datosU = null
      const uPer = []
      if (esUniversoDinamico(cn.universo)) {
        setProgreso('leyendo el universo del Nasdaq-100…')
        datosU = await cargaUniversoMc(cn.universo.n, { ...ctx(), regla: cn.universo.regla })
        for (const p of cn.periodos) {
          const up = universoDePeriodo(datosU.filas, datosU.miembros, p.desde, p.hasta)
          if (!up.simbolos.length) throw new Error(`${nombreUniversoLote(cn.universo)}: sin selección en ${nombrePeriodo(p)}.`)
          uPer.push({ ...up, huella: await huellaSeleccion(up.elegidos) })
        }
      }
      const resultados = []
      for (const [k, v] of lote.variantes.entries()) {
        const out = { id: v.id, nombre: nombreVariante(v), periodos: [] }
        for (const [ip, p] of cn.periodos.entries()) {
          detente()
          const etq = `${nombreVariante(v)} (${k + 1} de ${lote.variantes.length}) · ${nombrePeriodo(p)}`
          setProgreso(`${etq}: backtest`)
          const pet = peticionVariante(lote, v, p, uPer[ip] || null)
          const r = await apiFetch('/api/multibacktest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pet) })
          let j = null; try { j = await r.json() } catch (_) {}
          if (!r.ok || !j?.candidatosAzar) throw new Error(`El servidor no pudo calcular ${etq}: ${j?.error || `HTTP ${r.status}`}`)
          const P = preparaCartera(j.candidatosAzar, { mascara: pet.universo?.mascara || null }), real = realCartera(P), cmp = comparaConServidor(real, j, 1e-6, P.o.capitalIni)
          const rp = { desde: p.desde, hasta: p.hasta, real, coincide: cmp.ok !== false, activos: pet.symbols.length, nSim: cn.nSim, semilla: semillaVariante(sel.hash_lote, v.id, p, 'A', lote.comun), bh: bhDe(j),
            ...(j.universo ? { descartadas: j.universo.descartadasPorUniverso ?? null, refs: { universo: resumenCurva(j.universo.bhUniversoCurve), qqq: resumenCurva(j.universo.qqqBHCurve) }, huellaSeleccion: uPer[ip]?.huella || null } : {}) }
          for (const tipo of ['A', 'B']) {
            if (motivoNoAdmitida(pet, tipo)) continue
            const pr = creaPrueba(P, { tipo, nSim: cn.nSim, semilla: semillaVariante(sel.hash_lote, v.id, p, tipo, lote.comun) })
            while (!pr.hecho()) {
              detente()
              pr.avanza(25); setProgreso(`${etq}: prueba ${tipo}, ${pr.hechas()} de ${cn.nSim}`)
              await new Promise(res => setTimeout(res, 0))
            }
            rp[tipo] = resumenPrueba(real, pr.sims)
            if (tipo === 'A' && pet.universo) rp.sinColocar = pr.stats.sinColocar
          }
          out.periodos.push(rp)
        }
        out.supera = superaEnTodos(out)
        resultados.push(out)
      }
      const resumen = resumenLote(resultados, cn.periodos.length)
      const res = { resultados, resumen, errorGuardar: null, creado: new Date().toISOString(), versionApp: version || null }
      try {
        const compacto = resultados.map(x => ({ id: x.id, nombre: x.nombre, supera: x.supera, periodos: x.periodos.map(p => ({ desde: p.desde, hasta: p.hasta, activos: p.activos, coincide: p.coincide, nSim: p.nSim, semilla: p.semilla, bh: p.bh,
          real: { cagr: p.real.cagr, maxDD: p.real.maxDD, ratio: p.real.ratio ?? null, capInv: p.real.capInv },
          A: p.A ? { cagr: p.A.cagr, maxDD: p.A.maxDD, ratio: p.A.ratio } : null, B: p.B ? { cagr: p.B.cagr, maxDD: p.B.maxDD, ratio: p.B.ratio } : null, supera: superaAzar(p.A),
          ...(p.refs ? { refs: p.refs, descartadas: p.descartadas, sinColocar: p.sinColocar ?? null, huellaSeleccion: p.huellaSeleccion } : {}) })) }))
        await guardarPrueba({ config: { prueba: 'editorLote', hashLote: sel.hash_lote, nombre: sel.nombre, comun: lote.comun, variantes: sel.huellas.variantes }, resultados: { variantes: compacto, resumen }, versionApp: version }, ctx())
      } catch (e) { res.errorGuardar = `No se pudo guardar en el registro: ${e?.message || e}` }
      setEjec(res)
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null)
  }

  const b = borrador
  const selC = sel ? comunNormal(sel.lote.comun) : null
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: MONO }}>
      <div style={{ flex: 3, overflowY: 'auto', padding: 12, minWidth: 0 }}>
        <div style={caja}>
          <div style={etiqueta}>Declarar un lote</div>
          <div style={nota}>Un lote fija de antemano QUÉ vas a probar: las variantes y lo común. Se congela antes de ver ningún resultado, con su huella, y ya no se puede cambiar: así un buen resultado no sale de ir retocando hasta que algo funcione.</div>
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Nombre</span><input style={{ ...entrada, width: 260 }} value={b.nombre} onChange={e => setBorrador(x => ({ ...x, nombre: e.target.value }))}/>
          </div>
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Universo</span>
            <select style={entrada} value={din ? 'ndx' : 'lista'} onChange={e => ponUniverso(e.target.value === 'ndx' ? { tipo: 'ndx', regla: 'momentum', n: 30 } : { tipo: 'lista', symbols: simbolosTexto.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) })}>
              <option value="ndx">Nasdaq-100 dinámico (por reglas)</option><option value="lista">lista fija de activos</option>
            </select>
            {din && <>
              <select style={entrada} value={u.regla} onChange={e => ponUniverso({ ...u, regla: e.target.value })}>{Object.entries(REGLAS_UNIVERSO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <span style={nota}>N</span><select style={entrada} value={u.n} onChange={e => ponUniverso({ ...u, n: Number(e.target.value) })}>{N_UNIVERSO.map(n => <option key={n} value={n}>{n}</option>)}</select>
            </>}
          </div>
          {din ? <div style={nota}>Cada año, los {u.n} miembros del Nasdaq-100 {FRASE_REGLA[u.regla]}. Una estrategia solo puede ENTRAR en un valor mientras está en el universo (las entradas fuera se descartan y se cuentan); reparto concentrado. {avisoUniverso(u.regla)}</div> : <>
            <div style={nota}>Activos (símbolos de Yahoo, separados por comas). Ojo: una lista de valores que ya sabes que subieron (megacaps ganadoras) hace que cualquier estrategia parezca buena; el universo dinámico evita ese sesgo.</div>
            <textarea style={{ ...entrada, width: '100%', boxSizing: 'border-box', minHeight: 44 }} value={simbolosTexto}
              onChange={e => { setSimbolosTexto(e.target.value); ponUniverso({ tipo: 'lista', symbols: e.target.value.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) }) }}/>
          </>}
          <div style={{ ...nota, marginTop: 6 }}>Periodos (el resultado y el veredicto van por separado; el lote exige superar al azar en TODOS):</div>
          {c.periodos.map((p, k) => (
            <div key={k} style={fila}>
              <span style={nota}>{k + 1}.</span>
              <input style={{ ...entrada, width: 96 }} value={p.desde} onChange={e => comun({ periodos: c.periodos.map((x, j) => j === k ? { ...x, desde: e.target.value.trim() } : x) })}/>
              <span style={nota}>→</span>
              <input style={{ ...entrada, width: 96 }} value={p.hasta} onChange={e => comun({ periodos: c.periodos.map((x, j) => j === k ? { ...x, hasta: e.target.value.trim() } : x) })}/>
              {c.periodos.length > 1 && <button style={{ ...botonMini, color: ROJO }} onClick={() => comun({ periodos: c.periodos.filter((_, j) => j !== k) })}>quitar</button>}
            </div>
          ))}
          {c.periodos.length < MAX_PERIODOS && <button style={botonMini} onClick={() => { const u2 = c.periodos[c.periodos.length - 1]; comun({ periodos: [...c.periodos, { desde: u2?.desde || INICIO_UNIVERSO_NDX, hasta: u2?.hasta || '2025-12-31' }] }) }}>+ periodo</button>}
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Velas</span><select style={entrada} value={c.intervalo} onChange={e => comun({ intervalo: e.target.value })}><option value="diario">diarias</option><option value="semanal">semanales</option></select>
            <span style={nota}>Capital</span><input style={{ ...entrada, width: 70 }} value={aTexto(c.capitalIni)} onChange={e => comun({ capitalIni: deTexto(e.target.value) })}/>
            <span style={nota}>Reparto</span><select style={entrada} value={c.modoAsig} disabled={din} onChange={e => comun({ modoAsig: e.target.value })}><option value="concentrado">concentrado</option><option value="compartido">compartido</option></select>
          </div>
          <div style={fila}>
            <span style={nota}>Máx. posiciones</span><input style={{ ...entrada, width: 40 }} value={aTexto(c.sizeRules.maxPosiciones)} onChange={e => comun({ sizeRules: { ...c.sizeRules, maxPosiciones: deTexto(e.target.value) } })}/>
            <span style={nota}>Prioridad</span><select style={entrada} value={c.sizeRules.prioridad} onChange={e => comun({ sizeRules: { ...c.sizeRules, prioridad: e.target.value } })}>{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <span style={nota}>Simulaciones</span><input style={{ ...entrada, width: 56 }} value={aTexto(c.nSim)} onChange={e => comun({ nSim: deTexto(e.target.value) })}/>
          </div>
          <div style={nota}>Sin filtros y sin comisiones: la prueba contra el azar se hace sin filtros para no mezclar efectos.</div>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Variantes ({b.variantes.length} de {MAX_VARIANTES} como mucho)</div>
          <div style={fila}>
            <span style={nota}>Añadir:</span>
            <select style={entrada} value="" onChange={e => { const v = e.target.value; if (v === 'v50') agregaVariante(DEF_V50, {}, '1 V50 EMA10/11'); else if (v === 'e23') agregaVariante(DEF_23, {}, '23 EMA20 breakouts'); else { const s = delEditor.find(x => String(x.id) === v); if (s) { let p = {}; try { p = typeof s.params === 'string' ? JSON.parse(s.params) : (s.params || {}) } catch (_) {} agregaVariante(s.definition, p, s.name || 'Variante') } } }}>
              <option value="">elige…</option>
              <optgroup label="Plantillas"><option value="v50">1 V50 EMA10/11</option><option value="e23">23 EMA20 breakouts</option></optgroup>
              {delEditor.length > 0 && <optgroup label="Tus estrategias del editor">{delEditor.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</optgroup>}
            </select>
            <span style={nota}>Se copia la definición tal cual está ahora: cambiar la estrategia después no cambia el lote.</span>
          </div>
          {b.variantes.map((v, k) => {
            const lista = esquemaDe(v.definicion)?.lista || []
            return (
              <div key={k} style={{ ...fila, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
                <span style={{ ...nota, fontSize: 10 }} title="Identificador interno (entra en la huella)">{v.id}</span>
                <input style={{ ...entrada, width: 220, color: LILA }} value={v.nombre ?? ''} title="Nombre de la variante (no entra en la huella)" onChange={e => cambiaVariante(k, { nombre: e.target.value })}/>
                {lista.map(p => (
                  <span key={p.nombre} style={nota}>{p.nombre}
                    {p.tipo === 'sino' ? <input type="checkbox" checked={v.valores[p.nombre] === true} onChange={e => cambiaVariante(k, { valores: { ...v.valores, [p.nombre]: e.target.checked } })}/>
                      : p.tipo === 'opcion' ? <select style={entrada} value={v.valores[p.nombre]} onChange={e => cambiaVariante(k, { valores: { ...v.valores, [p.nombre]: e.target.value } })}>{(p.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
                      : <input style={{ ...entrada, width: 44, marginLeft: 3 }} value={aTexto(v.valores[p.nombre])} onChange={e => cambiaVariante(k, { valores: { ...v.valores, [p.nombre]: deTexto(e.target.value) } })}/>}
                  </span>
                ))}
                <button style={{ ...botonMini, color: ROJO }} onClick={() => setBorrador(x => ({ ...x, variantes: x.variantes.filter((_, j) => j !== k) }))}>quitar</button>
              </div>
            )
          })}
        </div>

        <div style={{ ...caja, borderColor: errores.length ? ROJO : VERDE }}>
          <div style={{ ...etiqueta, color: errores.length ? ROJO : VERDE }}>{errores.length ? `${errores.length} error${errores.length > 1 ? 'es' : ''}: no se puede congelar` : 'Listo para congelar'}</div>
          {errores.map((e, k) => <div key={k} style={{ ...nota, color: 'var(--text)' }}>· {e}</div>)}
          {!errores.length && <div style={nota}>Huella del lote: <span style={{ color: 'var(--text)' }}>{huellas ? huellas.lote.slice(0, 16) + '…' : '…'}</span>. Con {b.variantes.length} variante{b.variantes.length === 1 ? '' : 's'}, por pura suerte se esperan {c.periodos.length > 1 ? 'como mucho ' : ''}{num(b.variantes.length * (100 - PERCENTIL_SUPERA) / 100, 2)} que «superan al azar»: cuantas más variantes, más fácil es que alguna salga bien sin serlo. {c.periodos.length > 1 ? `Exigir los ${c.periodos.length} periodos sube el listón.` : ''}</div>}
          <div style={{ ...fila, marginTop: 8 }}>
            <button style={{ ...botonPrincipal, opacity: errores.length || !huellas || lotes.error ? 0.5 : 1 }} disabled={!!errores.length || !huellas || !!lotes.error} onClick={congela}>Congelar el lote</button>
            <button style={boton} onClick={() => { setBorrador(nuevoLote()); setSimbolosTexto(LISTA_EJEMPLO); setMsg(null) }}>Empezar otro</button>
          </div>
          {msg && <div style={{ ...nota, marginTop: 6, color: msg.tipo === 'ok' ? VERDE : ROJO }}>{msg.texto}</div>}
        </div>
      </div>

      <div style={{ flex: 2, overflowY: 'auto', padding: 12, borderLeft: '1px solid var(--border)', minWidth: 260 }}>
        <div style={caja}>
          <div style={etiqueta}>Lotes congelados</div>
          {lotes.error && <div style={{ ...nota, color: AMBAR }}>{lotes.error}</div>}
          {lotes.cargando && <div style={nota}>Cargando…</div>}
          {!lotes.error && !lotes.cargando && !lotes.filas.length && <div style={nota}>Todavía no hay ninguno.</div>}
          {lotes.filas.map(f => (
            <div key={f.id} onClick={() => eligeLote(f)}
              style={{ ...nota, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, background: sel?.id === f.id ? 'var(--bg3)' : 'transparent', color: sel?.id === f.id ? 'var(--accent)' : 'var(--text)' }}>
              {f.nombre} · {f.lote?.variantes?.length} variantes · {String(f.creado).slice(0, 10)} · {f.hash_lote.slice(0, 8)}
            </div>
          ))}
        </div>
        {sel && (
          <div style={caja}>
            <div style={etiqueta}>{sel.nombre}</div>
            <div style={nota}>
              {nombreUniversoLote(selC.universo)} · {selC.periodos.map(nombrePeriodo).join(' y ')} · velas {selC.intervalo === 'semanal' ? 'semanales' : 'diarias'} · {selC.modoAsig}, {selC.sizeRules.maxPosiciones} posiciones, prioridad {PRIORIDADES[selC.sizeRules.prioridad] || selC.sizeRules.prioridad} · {selC.nSim} simulaciones<br/>
              Huella {sel.hash_lote.slice(0, 16)}… · congelado el {String(sel.creado).slice(0, 10)} · solo lectura
            </div>
            <div style={{ marginTop: 4 }}>
              {sel.lote.variantes.map(v => <div key={v.id} style={{ ...nota, color: 'var(--text)' }}>· <span style={{ color: LILA }}>{nombreVariante(v)}</span> <span style={{ color: GRIS }}>({v.id}: {Object.entries(v.valores || {}).map(([k, x]) => `${k} ${aTexto(x === true ? 'sí' : x === false ? 'no' : x)}`).join(', ') || 'valores por defecto'})</span></div>)}
            </div>
            <div style={{ ...fila, marginTop: 8 }}>
              <button style={{ ...botonPrincipal, opacity: progreso ? 0.5 : 1 }} disabled={!!progreso} onClick={ejecuta}>Ejecutar el lote</button>
              {progreso && <><span style={nota}>{progreso}…</span><button style={botonMini} onClick={() => { parar.current = true }}>parar</button></>}
            </div>
            {errorEjec && <div style={{ ...nota, color: ROJO, marginTop: 6 }}>{errorEjec}</div>}
            {ejec && <>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>{['Variante', 'Periodo', 'CAGR', 'Caída máx.', 'A: percentil', 'A: veredicto', 'B: percentil', 'B: veredicto', ...(esUniversoDinamico(selC.universo) ? ['Descartadas por universo'] : [])].map((h, i) => <th key={i} style={{ ...celda, textAlign: i ? 'right' : 'left', color: GRIS, fontWeight: 400 }}>{h}</th>)}</tr></thead>
                  <tbody>{ejec.resultados.flatMap(x => x.periodos.map((p, ip) => (
                    <tr key={`${x.id}|${ip}`}>
                      <td style={{ ...celda, textAlign: 'left', color: x.supera ? VERDE : 'var(--text)' }}>{ip === 0 ? `${x.nombre}${x.supera ? ' ✓' : ''}` : ''}</td>
                      <td style={celda}>{nombrePeriodo(p)}{p.coincide ? '' : ' ⚠'}</td>
                      <td style={celda}>{pct(p.real.cagr)}</td>
                      <td style={celda}>{pct(p.real.maxDD)}</td>
                      <td style={{ ...celda, color: superaAzar(p.A) ? VERDE : 'var(--text)' }}>{num(p.A?.cagr?.percentil)}</td>
                      <td style={{ ...celda, color: COLOR_VEREDICTO(p.A?.cagr?.veredicto) }}>{p.A?.cagr?.veredicto || '—'}</td>
                      <td style={celda}>{num(p.B?.cagr?.percentil)}</td>
                      <td style={{ ...celda, color: COLOR_VEREDICTO(p.B?.cagr?.veredicto) }}>{p.B?.cagr?.veredicto || '—'}</td>
                      {esUniversoDinamico(selC.universo) && <td style={celda}>{p.descartadas ?? '—'}</td>}
                    </tr>)))}</tbody>
                </table>
              </div>
              <div style={{ ...nota, marginTop: 6, color: 'var(--text)' }}>{ejec.resumen.texto}</div>
              <div style={nota}>✓ = supera al azar en todos los periodos. {esUniversoDinamico(selC.universo) ? '«Descartadas por universo»: entradas de la estrategia en valores que ese año no estaban en el universo.' : ''}</div>
              {ejec.resultados.some(x => x.periodos.some(p => !p.coincide)) && <div style={{ ...nota, color: AMBAR }}>⚠ En algún periodo la cartera recalculada en el navegador no coincide con la del servidor: su prueba no es fiable.</div>}
              {ejec.errorGuardar ? <div style={{ ...nota, color: ROJO }}>{ejec.errorGuardar}</div> : <div style={nota}>{ejec.delRegistro ? `La última ejecución guardada en el registro (${String(ejec.creado).slice(0, 10)}).` : 'Guardado en el registro de pruebas.'}</div>}
            </>}
            <div style={{ ...fila, marginTop: 8 }}>
              {ejec && <BotonCopiar obtenerTexto={() => textoCopia(false)} titulo="El resultado y la prueba contra el azar de cada variante y periodo, en Markdown (el formato del multibacktest)"/>}
              <BotonCopiar obtenerTexto={() => textoCopia(true)} etiqueta="📋 Copiar lote completo" titulo="Además, la declaración congelada: la regla, los valores y la huella de cada variante"/>
            </div>
          </div>
        )}
        <div style={caja}>
          <div style={etiqueta}>Cómo leer el resultado</div>
          <div style={nota}>
            · Prueba A: las mismas operaciones (cuántas y cuánto duran, por activo{esUniversoDinamico(selC?.universo) ? ' y por tramo del universo' : ''}) en fechas al azar, con la misma asignación. Si tu CAGR queda en el percentil ≥ {PERCENTIL_SUPERA} de esas simulaciones, la señal elige mejores momentos que el azar en ese periodo.<br/>
            · El lote da por buena una variante solo si supera en TODOS sus periodos: una ventaja que solo aparece en uno depende de ese tramo del mercado.<br/>
            · Prueba B: tus operaciones reales, pero el orden entre activos el mismo día, al azar. Dice si la prioridad aporta algo; se enseña sin veredicto del lote.<br/>
            · Cada variante es una prueba más: el resumen compara cuántas superan con cuántas se esperarían por suerte.
          </div>
        </div>
      </div>
    </div>
  )
}
