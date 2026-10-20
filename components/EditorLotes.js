// components/EditorLotes.js — el modo «Lotes» de la pestaña Editor (docs/editor-visual.md, E10; decisiones 4 y 5).
//
// DECLARAR un lote ANTES de ver resultados: lo común (activos, periodo, temporalidad, reparto, simulaciones) y las variantes
// (estrategias del editor guardadas o las plantillas, cada una con sus valores). CONGELARLO: se guarda en editor_lotes
// (sql/editor_lotes.sql, de solo añadir) con su huella (lib/editor/lotes.js); ya no se puede cambiar. EJECUTARLO: cada
// variante por /api/multibacktest con su definición en la petición y, en el navegador, la prueba A / B contra el azar
// (lib/azarCartera.js) con una semilla que sale de la huella; el resultado queda en el registro (lab_pruebas), así que
// cuenta en el historial. Criterio declarado: percentil del CAGR en la prueba A ≥ 95.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MONO } from '../lib/utils'
import { DEF_V50, DEF_23 } from '../lib/editor/ejemplos'
import { esDefinicionEditor } from '../lib/editor/fuente'
import { valoresDe, esquemaDe } from '../lib/editor/definicion'
import { FORMATO_LOTE, MAX_VARIANTES, PERCENTIL_SUPERA, validaLote, huellasLote, peticionVariante, semillaVariante, superaAzar, resumenLote } from '../lib/editor/lotes'
import { preparaCartera, realCartera, comparaConServidor, creaPrueba, resumenPrueba, motivoNoAdmitida } from '../lib/azarCartera'
import { guardarPrueba } from '../lib/registroLab'
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
const copia = (x) => JSON.parse(JSON.stringify(x))
const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }
const pct = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d).replace('.', ',')} %`
const num = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')
const PRIORIDADES = { fuerza_relativa: 'fuerza relativa', momentum: 'momentum', max52: 'cerca del máximo de 52 semanas', alfabetico: 'alfabético' }
const COLOR_VEREDICTO = (v) => /supera/i.test(v || '') ? VERDE : /peor/i.test(v || '') ? ROJO : /algo mejor/i.test(v || '') ? AMBAR : GRIS
const ctx = () => ({ url: getSupaUrl(), headers: getSupaH() })
const nuevoLote = () => ({ formato: FORMATO_LOTE, nombre: '', descripcion: '',
  comun: { symbols: ['NVDA', 'AMD', 'AVGO', 'MSFT', 'AAPL', 'META', 'AMZN', 'GOOGL'], intervalo: 'diario', desde: '2016-01-04', hasta: '2025-12-31', capitalIni: 10000, modoAsig: 'concentrado',
    sizeRules: { maxPosiciones: 4, prioridad: 'fuerza_relativa', criterioUso: 'desempate', rsWindow: 63 }, comisiones: null, nSim: 500 },
  variantes: [] })

// borradorInicial (opcional): un lote con el que empezar la declaración en lugar del de ejemplo.
export default function EditorLotes({ apiFetch, version, estrategias = [], borradorInicial = null }) {
  const [lotes, setLotes] = useState({ filas: [], error: null, cargando: false })
  const [sel, setSel] = useState(null)            // la fila de editor_lotes elegida (congelada)
  const [borrador, setBorrador] = useState(() => borradorInicial ? copia(borradorInicial) : nuevoLote())
  const [simbolosTexto, setSimbolosTexto] = useState(() => (borradorInicial || nuevoLote()).comun.symbols.join(', '))
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
  const agregaVariante = (definicion, valores, base) => setBorrador(b => {
    let k = b.variantes.length + 1, id = base.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'V'
    while (b.variantes.some(v => v.id === `${id}${k}`)) k++
    return { ...b, variantes: [...b.variantes, { id: `${id}${k}`, definicion: copia(definicion), valores: valoresDe(definicion, valores || {}) }] }
  })
  const congela = async () => {
    if (errores.length || !huellas) return
    setMsg(null)
    try {
      const fila = { version_app: version || null, nombre: borrador.nombre.trim(), lote: borrador, hash_lote: huellas.lote, huellas }
      const r = await fetch(`${getSupaUrl()}/rest/v1/editor_lotes`, { method: 'POST', headers: { ...getSupaH(), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fila) })
      if (r.status === 409) { setMsg({ tipo: 'err', texto: 'Ese lote ya está congelado (misma huella): elígelo en la lista.' }); recarga(); return }
      if (!r.ok) throw new Error(`No se pudo congelar el lote (HTTP ${r.status}).`)
      const j = await r.json(), f = Array.isArray(j) ? j[0] : j
      setMsg({ tipo: 'ok', texto: `Congelado: «${fila.nombre}». Ya no se puede cambiar; ejecútalo cuando quieras.` })
      await recarga(); setSel(f)
    } catch (e) { setMsg({ tipo: 'err', texto: e.message }) }
  }

  // ── Ejecutar (el lote elegido) ──
  const [ejec, setEjec] = useState(null), [progreso, setProgreso] = useState(null), [errorEjec, setErrorEjec] = useState(null)
  const parar = useRef(false)
  const ejecuta = async () => {
    if (!sel || progreso) return
    const lote = sel.lote
    parar.current = false; setErrorEjec(null); setEjec(null)
    const resultados = []
    try {
      for (const [k, v] of lote.variantes.entries()) {
        if (parar.current) throw new Error('Parado a petición tuya: esta ejecución no se ha guardado.')
        setProgreso(`variante ${v.id} (${k + 1} de ${lote.variantes.length}): backtest`)
        const pet = peticionVariante(lote, v)
        const r = await apiFetch('/api/multibacktest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pet) })
        let j = null; try { j = await r.json() } catch (_) {}
        if (!r.ok || !j?.candidatosAzar) throw new Error(`El servidor no pudo calcular la variante ${v.id}: ${j?.error || `HTTP ${r.status}`}`)
        const P = preparaCartera(j.candidatosAzar), real = realCartera(P), cmp = comparaConServidor(real, j)
        const out = { id: v.id, real, coincide: cmp.ok !== false }
        for (const tipo of ['A', 'B']) {
          if (motivoNoAdmitida(pet, tipo)) continue
          const pr = creaPrueba(P, { tipo, nSim: lote.comun.nSim, semilla: semillaVariante(sel.hash_lote, `${v.id}|${tipo}`) })
          while (!pr.hecho()) {
            if (parar.current) throw new Error('Parado a petición tuya: esta ejecución no se ha guardado.')
            pr.avanza(25); setProgreso(`variante ${v.id} (${k + 1} de ${lote.variantes.length}): prueba ${tipo}, ${pr.hechas()} de ${lote.comun.nSim}`)
            await new Promise(res => setTimeout(res, 0))
          }
          out[tipo] = resumenPrueba(real, pr.sims)
        }
        resultados.push(out)
      }
      const resumen = resumenLote(resultados)
      const res = { resultados, resumen, errorGuardar: null }
      try {
        const compacto = resultados.map(x => ({ id: x.id, real: { cagr: x.real.cagr, maxDD: x.real.maxDD, ratio: x.real.ratio ?? null, capInv: x.real.capInv },
          A: x.A ? { cagr: x.A.cagr, maxDD: x.A.maxDD, ratio: x.A.ratio } : null, B: x.B ? { cagr: x.B.cagr, maxDD: x.B.maxDD, ratio: x.B.ratio } : null, supera: superaAzar(x.A) }))
        await guardarPrueba({ config: { prueba: 'editorLote', hashLote: sel.hash_lote, nombre: sel.nombre, comun: lote.comun, variantes: sel.huellas.variantes }, resultados: { variantes: compacto, resumen }, versionApp: version }, ctx())
      } catch (e) { res.errorGuardar = `No se pudo guardar en el registro: ${e?.message || e}` }
      setEjec(res)
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null)
  }

  const b = borrador, c = b.comun
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: MONO }}>
      <div style={{ flex: 3, overflowY: 'auto', padding: 12, minWidth: 0 }}>
        <div style={caja}>
          <div style={etiqueta}>Declarar un lote</div>
          <div style={nota}>Un lote fija de antemano QUÉ vas a probar: las variantes y lo común. Se congela antes de ver ningún resultado, con su huella, y ya no se puede cambiar: así un buen resultado no sale de ir retocando hasta que algo funcione.</div>
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Nombre</span><input style={{ ...entrada, width: 260 }} value={b.nombre} onChange={e => setBorrador(x => ({ ...x, nombre: e.target.value }))}/>
          </div>
          <div style={nota}>Activos (símbolos de Yahoo, separados por comas):</div>
          <textarea style={{ ...entrada, width: '100%', boxSizing: 'border-box', minHeight: 44 }} value={simbolosTexto}
            onChange={e => { setSimbolosTexto(e.target.value); comun({ symbols: e.target.value.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) }) }}/>
          <div style={{ ...fila, marginTop: 4 }}>
            <span style={nota}>Desde</span><input style={{ ...entrada, width: 100 }} value={c.desde} onChange={e => comun({ desde: e.target.value.trim() })}/>
            <span style={nota}>hasta</span><input style={{ ...entrada, width: 100 }} value={c.hasta} onChange={e => comun({ hasta: e.target.value.trim() })}/>
            <span style={nota}>Velas</span><select style={entrada} value={c.intervalo} onChange={e => comun({ intervalo: e.target.value })}><option value="diario">diarias</option><option value="semanal">semanales</option></select>
            <span style={nota}>Capital</span><input style={{ ...entrada, width: 70 }} value={aTexto(c.capitalIni)} onChange={e => comun({ capitalIni: deTexto(e.target.value) })}/>
          </div>
          <div style={fila}>
            <span style={nota}>Reparto</span><select style={entrada} value={c.modoAsig} onChange={e => comun({ modoAsig: e.target.value })}><option value="concentrado">concentrado</option><option value="compartido">compartido</option></select>
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
            <select style={entrada} value="" onChange={e => { const v = e.target.value; if (v === 'v50') agregaVariante(DEF_V50, {}, 'V50'); else if (v === 'e23') agregaVariante(DEF_23, {}, 'E23'); else { const s = delEditor.find(x => String(x.id) === v); if (s) { let p = {}; try { p = typeof s.params === 'string' ? JSON.parse(s.params) : (s.params || {}) } catch (_) {} agregaVariante(s.definition, p, s.name || 'V') } } }}>
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
                <input style={{ ...entrada, width: 80, color: LILA }} value={v.id} onChange={e => setBorrador(x => ({ ...x, variantes: x.variantes.map((y, j) => j === k ? { ...y, id: e.target.value.trim() } : y) }))}/>
                <span style={{ ...nota, color: 'var(--text)' }}>{v.definicion.nombre || 'sin nombre'}</span>
                {lista.map(p => (
                  <span key={p.nombre} style={nota}>{p.nombre}
                    {p.tipo === 'sino' ? <input type="checkbox" checked={v.valores[p.nombre] === true} onChange={e => setBorrador(x => ({ ...x, variantes: x.variantes.map((y, j) => j === k ? { ...y, valores: { ...y.valores, [p.nombre]: e.target.checked } } : y) }))}/>
                      : p.tipo === 'opcion' ? <select style={entrada} value={v.valores[p.nombre]} onChange={e => setBorrador(x => ({ ...x, variantes: x.variantes.map((y, j) => j === k ? { ...y, valores: { ...y.valores, [p.nombre]: e.target.value } } : y) }))}>{(p.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
                      : <input style={{ ...entrada, width: 44, marginLeft: 3 }} value={aTexto(v.valores[p.nombre])} onChange={e => setBorrador(x => ({ ...x, variantes: x.variantes.map((y, j) => j === k ? { ...y, valores: { ...y.valores, [p.nombre]: deTexto(e.target.value) } } : y) }))}/>}
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
          {!errores.length && <div style={nota}>Huella del lote: <span style={{ color: 'var(--text)' }}>{huellas ? huellas.lote.slice(0, 16) + '…' : '…'}</span>. Con {b.variantes.length} variante{b.variantes.length === 1 ? '' : 's'}, por pura suerte se esperan {num(b.variantes.length * (100 - PERCENTIL_SUPERA) / 100, 2)} que «superan al azar»: cuantas más variantes, más fácil es que alguna salga bien sin serlo.</div>}
          <div style={{ ...fila, marginTop: 8 }}>
            <button style={{ ...botonPrincipal, opacity: errores.length || !huellas || lotes.error ? 0.5 : 1 }} disabled={!!errores.length || !huellas || !!lotes.error} onClick={congela}>Congelar el lote</button>
            <button style={boton} onClick={() => { setBorrador(nuevoLote()); setSimbolosTexto(nuevoLote().comun.symbols.join(', ')); setMsg(null) }}>Empezar otro</button>
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
            <div key={f.id} onClick={() => { setSel(f); setEjec(null); setErrorEjec(null) }}
              style={{ ...nota, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, background: sel?.id === f.id ? 'var(--bg3)' : 'transparent', color: sel?.id === f.id ? 'var(--accent)' : 'var(--text)' }}>
              {f.nombre} · {f.lote?.variantes?.length} variantes · {String(f.creado).slice(0, 10)} · {f.hash_lote.slice(0, 8)}
            </div>
          ))}
        </div>
        {sel && (
          <div style={caja}>
            <div style={etiqueta}>{sel.nombre}</div>
            <div style={nota}>
              {sel.lote.comun.symbols.length} activos · {sel.lote.comun.desde} → {sel.lote.comun.hasta} · velas {sel.lote.comun.intervalo === 'semanal' ? 'semanales' : 'diarias'} · {sel.lote.comun.modoAsig}, {sel.lote.comun.sizeRules.maxPosiciones} posiciones, prioridad {PRIORIDADES[sel.lote.comun.sizeRules.prioridad] || sel.lote.comun.sizeRules.prioridad} · {sel.lote.comun.nSim} simulaciones<br/>
              Variantes: {sel.lote.variantes.map(v => v.id).join(', ')} · huella {sel.hash_lote.slice(0, 16)}… · congelado el {String(sel.creado).slice(0, 10)}
            </div>
            <div style={{ ...fila, marginTop: 8 }}>
              <button style={{ ...botonPrincipal, opacity: progreso ? 0.5 : 1 }} disabled={!!progreso} onClick={ejecuta}>Ejecutar el lote</button>
              {progreso && <><span style={nota}>{progreso}…</span><button style={botonMini} onClick={() => { parar.current = true }}>parar</button></>}
            </div>
            {errorEjec && <div style={{ ...nota, color: ROJO, marginTop: 6 }}>{errorEjec}</div>}
            {ejec && <>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>{['Variante', 'CAGR', 'Caída máx.', 'A: percentil', 'A: veredicto', 'B: percentil', 'B: veredicto'].map((h, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '2px 6px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{ejec.resultados.map(x => (
                    <tr key={x.id}>
                      <td style={{ padding: '2px 6px', color: superaAzar(x.A) ? VERDE : 'var(--text)' }}>{x.id}{x.coincide ? '' : ' ⚠'}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px' }}>{pct(x.real.cagr)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px' }}>{pct(x.real.maxDD)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px' }}>{num(x.A?.cagr?.percentil)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: COLOR_VEREDICTO(x.A?.cagr?.veredicto) }}>{x.A?.cagr?.veredicto || '—'}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px' }}>{num(x.B?.cagr?.percentil)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: COLOR_VEREDICTO(x.B?.cagr?.veredicto) }}>{x.B?.cagr?.veredicto || '—'}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div style={{ ...nota, marginTop: 6, color: 'var(--text)' }}>{ejec.resumen.texto}</div>
              {ejec.resultados.some(x => !x.coincide) && <div style={{ ...nota, color: AMBAR }}>⚠ En alguna variante la cartera recalculada en el navegador no coincide con la del servidor: su prueba no es fiable.</div>}
              {ejec.errorGuardar ? <div style={{ ...nota, color: ROJO }}>{ejec.errorGuardar}</div> : <div style={nota}>Guardado en el registro de pruebas.</div>}
            </>}
          </div>
        )}
        <div style={caja}>
          <div style={etiqueta}>Cómo leer el resultado</div>
          <div style={nota}>
            · Prueba A: las mismas operaciones (cuántas y cuánto duran, por activo) en fechas al azar, con la misma asignación. Si tu CAGR queda en el percentil ≥ {PERCENTIL_SUPERA} de esas simulaciones, la señal elige mejores momentos que el azar: es el criterio del lote.<br/>
            · Prueba B: tus operaciones reales, pero el orden entre activos el mismo día, al azar. Dice si la prioridad aporta algo; se enseña sin veredicto del lote.<br/>
            · Cada variante es una prueba más: el resumen compara cuántas superan con cuántas se esperarían por suerte.
          </div>
        </div>
      </div>
    </div>
  )
}
