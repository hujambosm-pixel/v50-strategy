// components/EditorCartera.js — el modo «Cartera» de la pestaña Editor (docs/editor-visual.md, E9).
//
// Formularios sobre la REGLA de una cartera (la máquina de estados de lib/laboratorioCartera.js): estados (con su
// composición y, si los tiene, sus pesos), estado inicial, transiciones por condición (todas a la vez) con sus movimientos
// y sus marcas de ciclo, rebalanceos por calendario, el inicio según una media, la medida del azar y la REFERENCIA (el ticker
// que miran las condiciones; por defecto el QQQ). Lo demás de la prueba (ETF, periodos, cálculo, costes) sale de la plantilla
// elegida, como en el laboratorio de cartera. Al lado: el diagrama, la regla en castellano, la validación, si es oficial
// (misma huella que un elemento de CARTERA_1–3) o exploratoria, y la ejecución por /api/laboratorio (un periodo por
// petición), que queda guardada en el registro (lab_pruebas) igual que las del laboratorio: así se sabe cuántas cosas se
// probaron.
import { useState, useEffect, useMemo, useRef } from 'react'
import { MONO } from '../lib/utils'
import { CARTERA_1, CARTERA_2, CARTERA_3, configDeItem, configCarteraDe, validaConfig, veredictoOficial } from '../lib/lotesLab'
import { clasificaConfig, guardarPrueba } from '../lib/registroLab'
import { fraseTransicion, reduceCurva, FRECUENCIAS, COSTES_DEFECTO, textoPesos } from '../lib/laboratorioCartera'
import { redondeaParaGuardar } from '../lib/exploracionCartera'
import { periodoCartera, CAB_CARTERA, filasCartera, calculoDeConfig, esConfigFiltro } from '../lib/exportaTexto'
import { getSupaUrl, getSupaH } from '../lib/supabase'

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
const ACTIVOS = { QQQ: 'QQQ', ETF: 'ETF', LIQUIDEZ: 'liquidez' }

// Plantillas: cada elemento de los lotes de cartera (su configuración entera; sin tocar nada, sale OFICIAL).
const PLANTILLAS = [CARTERA_1, CARTERA_2, CARTERA_3].flatMap(l => l.items.map(it => ({ clave: `${l.id}·${it.id}`, nombre: `${l.id} · ${it.id} (${it.etf}, ${it.regla.nombre || it.regla.id})`, config: () => copia(configDeItem(l, it.id)) })))

// Las condiciones de la máquina de la cartera y sus campos: [clave, etiqueta, 'int' | 'num' | [opciones] ].
const CONDS = {
  caidaDesdeMaximo: { nombre: 'Caída desde el máximo', campos: [['pct', '% de caída', 'num'], ['ventana', 'ventana (velas)', 'int']], defecto: { pct: 10, ventana: 252 } },
  cruceMedias: { nombre: 'Cruce de medias (la rápida pasa encima)', campos: [['tipo', 'tipo', ['EMA', 'SMA']], ['rapida', 'rápida', 'int'], ['lenta', 'lenta', 'int']], defecto: { tipo: 'EMA', rapida: 10, lenta: 11 } },
  cierreBajoMedia: { nombre: 'Cierre bajo su media', campos: [['tipo', 'tipo', ['EMA', 'SMA']], ['periodo', 'periodo', 'int'], ['evaluacion', 'evaluación', ['', 'semanal']]], defecto: { tipo: 'SMA', periodo: 200 } },
  cierreSobreMedia: { nombre: 'Cierre sobre su media', campos: [['tipo', 'tipo', ['EMA', 'SMA']], ['periodo', 'periodo', 'int'], ['evaluacion', 'evaluación', ['', 'semanal']]], defecto: { tipo: 'SMA', periodo: 200 } },
  haSuperadoMaxRef: { nombre: 'Ya ha superado el máximo de referencia', campos: [], defecto: {} },
  noHaSuperadoMaxRef: { nombre: 'Aún no ha superado el máximo de referencia', campos: [], defecto: {} },
  cierreSobreMaxRef: { nombre: 'Cierra sobre el máximo de referencia', campos: [], defecto: {} },
  primerDiaHabil: { nombre: 'Calendario: la vela siguiente empieza…', campos: [['frecuencia', 'periodo', ['mensual', 'trimestral', 'anual']]], defecto: { frecuencia: 'mensual' } },
  cadaNSemanas: { nombre: 'Una semana de cada N', campos: [['n', 'N', 'int']], defecto: { n: 4 } },
  O: { nombre: 'O (alguna)', campos: [], defecto: null },
  NO: { nombre: 'NO (no se cumple)', campos: [], defecto: null },
  histeresis: { nombre: 'Histéresis (entra / sale)', campos: [], defecto: null },
}
const condDefecto = (c) => c === 'O' ? { c, de: [condDefecto('cierreBajoMedia'), condDefecto('caidaDesdeMaximo')] } : c === 'NO' ? { c, de: condDefecto('cierreBajoMedia') }
  : c === 'histeresis' ? { c, entra: condDefecto('cierreBajoMedia'), sale: { c: 'cierreSobreMedia', tipo: 'SMA', periodo: 200 } } : { c, ...copia(CONDS[c].defecto) }

function CondCartera({ s, onChange, onQuitar, nivel = 0 }) {
  const d = CONDS[s.c] || CONDS.cierreBajoMedia
  return (
    <div style={{ borderLeft: nivel ? `2px solid ${LILA}` : 'none', paddingLeft: nivel ? 8 : 0, marginTop: 3 }}>
      <div style={fila}>
        <select style={entrada} value={s.c} onChange={e => onChange(e.target.value === 'NO' && s.c !== 'NO' ? { c: 'NO', de: s } : condDefecto(e.target.value))}>
          {Object.entries(CONDS).map(([k, x]) => <option key={k} value={k}>{x.nombre}</option>)}
        </select>
        {d.campos.map(([k, et, t]) => (
          <span key={k} style={{ ...nota, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{et}:
            {Array.isArray(t)
              ? <select style={entrada} value={s[k] ?? ''} onChange={e => { const x = { ...s }; if (e.target.value === '') delete x[k]; else x[k] = e.target.value; onChange(x) }}>{t.map(o => <option key={o} value={o}>{o === '' ? 'diaria' : o}</option>)}</select>
              : <input style={{ ...entrada, width: 52 }} value={aTexto(s[k])} onChange={e => onChange({ ...s, [k]: deTexto(e.target.value) })}/>}
          </span>
        ))}
        {onQuitar && <button style={{ ...botonMini, color: ROJO }} onClick={onQuitar}>quitar</button>}
      </div>
      {s.c === 'O' && <>{(s.de || []).map((x, k) => <CondCartera key={k} s={x} nivel={nivel + 1} onChange={v => onChange({ ...s, de: s.de.map((y, j) => j === k ? v : y) })} onQuitar={s.de.length > 2 ? () => onChange({ ...s, de: s.de.filter((_, j) => j !== k) }) : null}/>)}
        <button style={{ ...botonMini, marginLeft: 10 }} onClick={() => onChange({ ...s, de: [...s.de, condDefecto('cierreBajoMedia')] })}>+ condición</button></>}
      {s.c === 'NO' && <CondCartera s={s.de} nivel={nivel + 1} onChange={v => onChange({ ...s, de: v })}/>}
      {s.c === 'histeresis' && <>
        <div style={{ ...nota, marginLeft: 10 }}>entra:</div><CondCartera s={s.entra} nivel={nivel + 1} onChange={v => onChange({ ...s, entra: v })}/>
        <div style={{ ...nota, marginLeft: 10 }}>sale:</div><CondCartera s={s.sale} nivel={nivel + 1} onChange={v => onChange({ ...s, sale: v })}/>
      </>}
    </div>
  )
}

// El diagrama: los estados en fila; cada transición, un arco numerado (hacia la derecha por arriba, hacia la izquierda por
// abajo; a sí mismo, un lazo). Solo ver.
function DiagramaCartera({ regla }) {
  const ids = Object.keys(regla?.estados || {}), trs = regla?.transiciones || []
  const W = 460, wE = Math.min(120, (W - 16 - (ids.length - 1) * 30) / Math.max(1, ids.length)), h = 40
  const x = (id) => 8 + ids.indexOf(id) * (wE + 30)
  const arriba = trs.filter(t => ids.indexOf(t.hacia) > ids.indexOf(t.desde)).length, abajo = trs.filter(t => ids.indexOf(t.hacia) < ids.indexOf(t.desde)).length
  const y0 = 22 + arriba * 12, H = y0 + h + 22 + abajo * 12 + 14
  let ka = 0, kb = 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Diagrama de la cartera">
      <defs><marker id="flC" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={LILA}/></marker></defs>
      {ids.map(id => (
        <g key={id}>
          <rect x={x(id)} y={y0} width={wE} height={h} rx={9} fill="var(--bg)" stroke={id === regla.inicial ? 'var(--accent)' : LILA} strokeWidth={id === regla.inicial ? 2 : 1.3}/>
          <text x={x(id) + wE / 2} y={y0 + 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">{id}</text>
          <text x={x(id) + wE / 2} y={y0 + 31} textAnchor="middle" fontSize={8.5} fill="var(--text-legible)">{regla.estados[id].pesos ? textoPesos(regla.estados[id].pesos).slice(0, 26) : (regla.estados[id].nombre || '').slice(0, 22)}</text>
        </g>
      ))}
      {trs.map((t, k) => {
        if (!ids.includes(t.desde) || !ids.includes(t.hacia)) return null
        const a = x(t.desde) + wE / 2, b = x(t.hacia) + wE / 2
        if (t.desde === t.hacia) return (<g key={k}><path d={`M ${a - 12} ${y0} C ${a - 22} ${y0 - 18}, ${a + 22} ${y0 - 18}, ${a + 12} ${y0}`} fill="none" stroke={LILA} strokeWidth={1.1} markerEnd="url(#flC)"/><text x={a + 16} y={y0 - 10} fontSize={9} fill={LILA}>{k + 1}{t.calendario ? ` ${t.calendario}` : ''}</text></g>)
        const fw = b > a, n = fw ? ka++ : kb++, yy = fw ? y0 - 8 - n * 12 : y0 + h + 8 + n * 12
        const ya = fw ? y0 : y0 + h
        return (<g key={k}><path d={`M ${a + (fw ? 6 : -6)} ${ya} L ${a + (fw ? 6 : -6)} ${yy} L ${b + (fw ? -6 : 6)} ${yy} L ${b + (fw ? -6 : 6)} ${ya}`} fill="none" stroke={LILA} strokeWidth={1.1} markerEnd="url(#flC)"/>
          <text x={(a + b) / 2} y={yy - 2} textAnchor="middle" fontSize={9} fill={LILA}>{k + 1}</text></g>)
      })}
    </svg>
  )
}

const ctxRegistro = () => ({ url: getSupaUrl(), headers: getSupaH() })

// configInicial (opcional): una configuración de cartera con la que empezar en lugar de la primera plantilla.
export default function EditorCartera({ apiFetch, version, configInicial = null }) {
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0].clave)
  const [config, setConfig] = useState(() => configInicial ? copia(configInicial) : PLANTILLAS[0].config())
  const regla = config.regla
  // Al tocar la regla deja de ser la de la plantilla: id 'editor' y fuera el resumen del filtro (que ya no la describiría).
  const setRegla = (cambio) => setConfig(c => { const r = { ...c.regla, ...cambio, id: 'editor', nombre: 'Regla del editor' }; delete r.filtro; return { ...c, regla: r } })
  const setCalculo = (v) => setConfig(c => { const x = { ...c }; if (v === 2) { x.calculo = 2; x.costes = c.costes || copia(COSTES_DEFECTO) } else { delete x.calculo; delete x.costes } return x })
  const errores = useMemo(() => { try { return [...new Set(validaConfig(config))] } catch (e) { return [`La regla no se puede leer: ${e.message}`] } }, [config])
  const [clas, setClas] = useState(null)
  useEffect(() => { let vivo = true; setClas(null); clasificaConfig(config).then(c => { if (vivo) setClas(c) }).catch(() => {}); return () => { vivo = false } }, [config])
  const frases = useMemo(() => (regla.transiciones || []).map(t => { try { return fraseTransicion(t, regla) } catch (_) { return '…' } }), [regla])
  const ids = Object.keys(regla.estados || {})

  // ── Ejecución (como el laboratorio de cartera: un periodo por petición y el registro) ──
  const [res, setRes] = useState(null), [progreso, setProgreso] = useState(null), [errorEjec, setErrorEjec] = useState(null)
  const parar = useRef(false)
  const ejecuta = async () => {
    if (errores.length || progreso) return
    parar.current = false; setErrorEjec(null); setRes(null)
    const cfg = copia(config)
    try {
      const c = await clasificaConfig(cfg), periodos = []
      for (let k = 0; k < cfg.periodos.length; k++) {
        if (parar.current) throw new Error('Parado a petición tuya: esta prueba no se ha guardado.')
        setProgreso(`periodo ${k + 1} de ${cfg.periodos.length} (${periodoCartera(cfg.periodos[k])})`)
        const r = await apiFetch('/api/laboratorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, periodo: { desde: cfg.periodos[k].desde, hasta: cfg.periodos[k].hasta } }) })
        let j = null; try { j = await r.json() } catch (_) {}
        if (!r.ok) throw new Error(`El servidor no pudo calcular ${periodoCartera(cfg.periodos[k])}: ${j?.error || `HTTP ${r.status}`}`)
        periodos.push(j.resultado)
      }
      const veredicto = veredictoOficial(c, periodos), out = { clas: c, periodos, veredicto, errorGuardar: null }
      try {
        const compacto = esConfigFiltro(cfg) || calculoDeConfig(cfg) === 2
        const resumen = { periodos: periodos.map(p => ({ ...p, curva: reduceCurva(p.curva, compacto ? 16 : 8) })), veredicto, datos: [] }
        await guardarPrueba({ config: cfg, resultados: compacto ? redondeaParaGuardar(resumen) : resumen, versionApp: version }, ctxRegistro())
      } catch (e) { out.errorGuardar = `No se pudo guardar en el registro: ${e?.message || e}` }
      setRes(out)
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null)
  }

  const estado = (id, cambio) => setRegla({ estados: { ...regla.estados, [id]: { ...regla.estados[id], ...cambio } } })
  const renombra = (viejo, nuevo) => {
    nuevo = nuevo.toUpperCase().replace(/[^A-Z0-9_]/g, '')
    if (!nuevo || regla.estados[nuevo]) return
    const est = Object.fromEntries(Object.entries(regla.estados).map(([k, v]) => [k === viejo ? nuevo : k, v]))
    const cambia = (x) => x === viejo ? nuevo : x
    setRegla({ estados: est, inicial: cambia(regla.inicial), transiciones: regla.transiciones.map(t => ({ ...t, desde: cambia(t.desde), hacia: cambia(t.hacia) })), ...(regla.inicio ? { inicio: { ...regla.inicio, si: cambia(regla.inicio.si), no: cambia(regla.inicio.no) } } : {}) })
  }
  const tr = (k, cambio) => setRegla({ transiciones: regla.transiciones.map((t, j) => j === k ? { ...t, ...cambio } : t) })
  const quitaClave = (k, clave) => setRegla({ transiciones: regla.transiciones.map((t, j) => { if (j !== k) return t; const x = { ...t }; delete x[clave]; return x }) })

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: MONO }}>
      <div style={{ flex: 3, overflowY: 'auto', padding: 12, minWidth: 0 }}>
        <div style={caja}>
          <div style={etiqueta}>Cartera: punto de partida</div>
          <div style={fila}>
            <select style={entrada} value={plantilla} onChange={e => { const p = PLANTILLAS.find(x => x.clave === e.target.value); if (p && confirm('¿Empezar desde esta plantilla? Se pierde lo que hayas cambiado.')) { setPlantilla(p.clave); setConfig(p.config()); setRes(null) } }}>
              {PLANTILLAS.map(p => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
            </select>
            <span style={nota}>ETF {config.etf} · {config.periodos.length} periodos (los del lote)</span>
          </div>
          <div style={nota}>Sin tocar nada, la prueba es la misma que la del lote (sale «Oficial»). Al cambiar la regla pasa a ser exploratoria: el ETF, los periodos y el resto de la prueba siguen siendo los de la plantilla.</div>
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Cálculo</span>
            <select style={entrada} value={config.calculo === 2 ? '2' : '1'} onChange={e => setCalculo(e.target.value === '2' ? 2 : 1)}><option value="1">1 (el de los lotes congelados)</option><option value="2">2 (impuestos en caja y costes por operación)</option></select>
            <span style={nota} title="El ticker cuyas velas miran las condiciones; lo que se compra sigue siendo QQQ, el ETF y liquidez">Referencia de las condiciones</span>
            <input style={{ ...entrada, width: 80 }} value={regla.referencia || ''} placeholder="QQQ" onChange={e => { const v = e.target.value.trim().toUpperCase(); setConfig(c => { const r = { ...c.regla, id: 'editor', nombre: 'Regla del editor' }; delete r.filtro; if (v && v !== 'QQQ') r.referencia = v; else delete r.referencia; return { ...c, regla: r } }) }}/>
          </div>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Estados</div>
          <div style={nota}>Cada estado es una composición de la cartera. Con pesos, los rebalanceos vuelven a ellos; sin pesos, la composición es la que dejan los movimientos.</div>
          {ids.map(id => { const e = regla.estados[id]; return (
            <div key={id} style={{ ...fila, marginTop: 6 }}>
              <input style={{ ...entrada, width: 110, color: id === regla.inicial ? 'var(--accent)' : 'var(--text)' }} defaultValue={id} title="Identificador (mayúsculas)" onBlur={ev => ev.target.value !== id && renombra(id, ev.target.value)}/>
              <label style={nota}><input type="radio" checked={regla.inicial === id} onChange={() => setRegla({ inicial: id })}/> inicial</label>
              <input style={{ ...entrada, flex: 1, minWidth: 160 }} value={e.composicion || ''} placeholder="composición (texto)" onChange={ev => estado(id, { composicion: ev.target.value })}/>
              <label style={nota}><input type="checkbox" checked={!!e.pesos} onChange={ev => { const x = { ...e }; if (ev.target.checked) x.pesos = { QQQ: 1 }; else delete x.pesos; setRegla({ estados: { ...regla.estados, [id]: x } }) }}/> pesos</label>
              {e.pesos && Object.keys(ACTIVOS).map(a => <span key={a} style={nota}>{ACTIVOS[a]} <input style={{ ...entrada, width: 40 }} value={aTexto(Math.round((e.pesos[a] || 0) * 1000) / 10)} onChange={ev => { const v = deTexto(ev.target.value), p = { ...e.pesos }; if (typeof v === 'number' && v > 0) p[a] = v / 100; else delete p[a]; estado(id, { pesos: p }) }}/>%</span>)}
              {ids.length > 1 && <button style={{ ...botonMini, color: ROJO }} onClick={() => { const est = { ...regla.estados }; delete est[id]; setRegla({ estados: est, inicial: regla.inicial === id ? Object.keys(est)[0] : regla.inicial }) }}>quitar</button>}
            </div>) })}
          <button style={{ ...botonMini, marginTop: 4 }} onClick={() => { let n = 1; while (regla.estados[`E${n}`]) n++; setRegla({ estados: { ...regla.estados, [`E${n}`]: { nombre: `E${n}`, composicion: '' } } }) }}>+ estado</button>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Transiciones</div>
          <div style={nota}>Al cierre de cada día se miran, en este orden, las que salen del estado actual; la primera cuyas condiciones se cumplen TODAS se ejecuta a la apertura siguiente.</div>
          {regla.transiciones.map((t, k) => (
            <div key={k} style={{ borderTop: k ? '1px solid var(--border)' : 'none', paddingTop: k ? 8 : 0, marginTop: k ? 8 : 0 }}>
              <div style={fila}>
                <span style={{ ...nota, color: 'var(--text)' }}>{k + 1}.</span>
                <select style={entrada} value={t.desde} onChange={e => tr(k, { desde: e.target.value })}>{ids.map(i => <option key={i} value={i}>{i}</option>)}</select>→
                <select style={entrada} value={t.hacia} onChange={e => tr(k, { hacia: e.target.value })}>{ids.map(i => <option key={i} value={i}>{i}</option>)}</select>
                <select style={entrada} value={t.calendario ? 'calendario' : 'condicion'} onChange={e => setRegla({ transiciones: regla.transiciones.map((x, j) => j !== k ? x : e.target.value === 'calendario' ? { desde: x.desde, hacia: x.hacia, calendario: 'anual', rebalancea: true } : { desde: x.desde, hacia: x.hacia, si: [condDefecto('cierreBajoMedia')], hacer: [] }) })}>
                  <option value="condicion">por condición</option><option value="calendario">rebalanceo por calendario</option>
                </select>
                {k > 0 && <button style={botonMini} onClick={() => { const a = [...regla.transiciones]; [a[k - 1], a[k]] = [a[k], a[k - 1]]; setRegla({ transiciones: a }) }}>↑</button>}
                <button style={{ ...botonMini, color: ROJO }} onClick={() => setRegla({ transiciones: regla.transiciones.filter((_, j) => j !== k) })}>quitar</button>
              </div>
              {t.calendario ? (
                <div style={fila}><span style={nota}>vuelve a los pesos de {t.hacia}</span><select style={entrada} value={t.calendario} onChange={e => tr(k, { calendario: e.target.value })}>{Object.entries(FRECUENCIAS).map(([f, v]) => <option key={f} value={f}>{v}</option>)}</select></div>
              ) : <>
                <div style={nota}>si (todas):</div>
                {(t.si || []).map((s, j) => <CondCartera key={j} s={s} nivel={1} onChange={v => tr(k, { si: t.si.map((x, i) => i === j ? v : x) })} onQuitar={() => tr(k, { si: t.si.filter((_, i) => i !== j) })}/>)}
                <button style={{ ...botonMini, marginLeft: 10 }} onClick={() => tr(k, { si: [...(t.si || []), condDefecto('cierreBajoMedia')] })}>+ condición</button>
                <div style={{ ...nota, marginTop: 4 }}>hacer:</div>
                {(t.hacer || []).map((h, j) => (
                  <div key={j} style={{ ...fila, marginLeft: 10 }}>
                    <select style={entrada} value={h.todo ? 'todo' : 'fraccion'} onChange={e => tr(k, { hacer: t.hacer.map((x, i) => i !== j ? x : e.target.value === 'todo' ? { mover: x.mover, a: x.a, todo: true } : { mover: x.mover, a: x.a, fraccionCartera: 0.5 }) })}><option value="todo">todo lo que hay en</option><option value="fraccion">una fracción del valor de la cartera, de</option></select>
                    {!h.todo && <><input style={{ ...entrada, width: 44 }} value={aTexto(Math.round((h.fraccionCartera || 0) * 1000) / 10)} onChange={e => { const v = deTexto(e.target.value); tr(k, { hacer: t.hacer.map((x, i) => i === j ? { ...x, fraccionCartera: typeof v === 'number' ? v / 100 : NaN } : x) }) }}/><span style={nota}>%</span></>}
                    <select style={entrada} value={h.mover} onChange={e => tr(k, { hacer: t.hacer.map((x, i) => i === j ? { ...x, mover: e.target.value } : x) })}>{Object.entries(ACTIVOS).map(([a, n]) => <option key={a} value={a}>{n}</option>)}</select>→
                    <select style={entrada} value={h.a} onChange={e => tr(k, { hacer: t.hacer.map((x, i) => i === j ? { ...x, a: e.target.value } : x) })}>{Object.entries(ACTIVOS).map(([a, n]) => <option key={a} value={a}>{n}</option>)}</select>
                    <button style={{ ...botonMini, color: ROJO }} onClick={() => tr(k, { hacer: t.hacer.filter((_, i) => i !== j) })}>quitar</button>
                  </div>
                ))}
                <button style={{ ...botonMini, marginLeft: 10 }} onClick={() => tr(k, { hacer: [...(t.hacer || []), { mover: 'ETF', a: 'LIQUIDEZ', todo: true }] })}>+ movimiento</button>
                <div style={{ ...fila, marginTop: 4 }}>
                  {[['rebalancea', 'después, a los pesos del estado de llegada'], ['iniciaCiclo', 'inicia el ciclo'], ['terminaCiclo', 'termina el ciclo'], ['fijaMaxRef', 'fija el máximo de referencia']].map(([c, et]) => (
                    <label key={c} style={nota} title={c === 'iniciaCiclo' ? 'Los ciclos son lo que el azar recoloca: la prueba compara tus momentos con momentos al azar' : undefined}><input type="checkbox" checked={!!t[c]} onChange={e => e.target.checked ? tr(k, { [c]: true }) : quitaClave(k, c)}/> {et}</label>
                  ))}
                </div>
              </>}
            </div>
          ))}
          <button style={{ ...botonMini, marginTop: 6 }} onClick={() => setRegla({ transiciones: [...regla.transiciones, { desde: ids[0], hacia: ids[ids.length - 1], si: [condDefecto('cierreBajoMedia')], hacer: [] }] })}>+ transición</button>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Inicio y azar</div>
          <label style={nota}><input type="checkbox" checked={!!regla.inicio} onChange={e => { if (e.target.checked) setRegla({ inicio: { segun: { c: 'cierreSobreMedia', tipo: 'SMA', periodo: 200 }, si: ids[0], no: ids[ids.length - 1] } }); else setConfig(c => { const r = { ...c.regla, id: 'editor' }; delete r.inicio; delete r.filtro; return { ...c, regla: r } }) }}/> el primer día, el estado según una media (si no, el inicial)</label>
          {regla.inicio && <div style={fila}>
            <CondCartera s={regla.inicio.segun} onChange={v => setRegla({ inicio: { ...regla.inicio, segun: v } })}/>
            <span style={nota}>sí →</span><select style={entrada} value={regla.inicio.si} onChange={e => setRegla({ inicio: { ...regla.inicio, si: e.target.value } })}>{ids.map(i => <option key={i} value={i}>{i}</option>)}</select>
            <span style={nota}>no →</span><select style={entrada} value={regla.inicio.no} onChange={e => setRegla({ inicio: { ...regla.inicio, no: e.target.value } })}>{ids.map(i => <option key={i} value={i}>{i}</option>)}</select>
          </div>}
          <label style={{ ...nota, display: 'block', marginTop: 4 }}><input type="checkbox" checked={regla.medidaAzar === 'cagrPorCaida'} onChange={e => { if (e.target.checked) setRegla({ medidaAzar: 'cagrPorCaida' }); else setConfig(c => { const r = { ...c.regla, id: 'editor' }; delete r.medidaAzar; delete r.filtro; return { ...c, regla: r } }) }}/> el azar compara el CAGR / caída máxima (si no, el CAGR)</label>
        </div>
      </div>

      <div style={{ flex: 2, overflowY: 'auto', padding: 12, borderLeft: '1px solid var(--border)', minWidth: 260 }}>
        <div style={caja}>
          <div style={etiqueta}>Diagrama</div>
          <DiagramaCartera regla={regla}/>
          <div style={{ ...nota, marginTop: 4 }}>El estado inicial, en azul. Los números son los de las transiciones (por arriba, hacia la derecha; por abajo, hacia la izquierda).</div>
        </div>
        <div style={caja}>
          <div style={etiqueta}>La regla</div>
          {regla.referencia && <div style={{ ...nota, color: AMBAR }}>Las condiciones miran {regla.referencia}, no el QQQ; se compra y se vende QQQ, el ETF y liquidez.</div>}
          {frases.map((f, k) => <div key={k} style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', marginBottom: 4 }}>{k + 1}. {f}</div>)}
          <div style={nota}>Empieza en {regla.inicio ? `${regla.inicio.si} o ${regla.inicio.no} según la media` : regla.inicial}{regla.estados?.[regla.inicial]?.pesos ? ` (${textoPesos(regla.estados[regla.inicial].pesos)})` : ''}. Condiciones al cierre; se ejecuta a la apertura siguiente; la liquidez renta el 0 %.</div>
        </div>
        <div style={{ ...caja, borderColor: errores.length ? ROJO : VERDE }}>
          <div style={{ ...etiqueta, color: errores.length ? ROJO : VERDE }}>{errores.length ? `${errores.length} error${errores.length > 1 ? 'es' : ''}: no se puede ejecutar` : 'Válida'}</div>
          {errores.map((e, k) => <div key={k} style={{ ...nota, color: 'var(--text)' }}>· {e}</div>)}
          {!errores.length && <div style={nota}>{clas ? (clas.oficial ? <span style={{ color: VERDE }}>Oficial · {clas.lote} · {clas.item}: es la misma prueba que ese elemento del lote.</span> : 'Exploratoria: no es ningún elemento de un lote; su resultado no da veredicto oficial.') : '…'}</div>}
          <div style={{ ...fila, marginTop: 8 }}>
            <button style={{ ...botonPrincipal, opacity: errores.length || progreso ? 0.5 : 1 }} disabled={!!errores.length || !!progreso} onClick={ejecuta}>Ejecutar ({config.periodos.length} periodos)</button>
            {progreso && <><span style={nota}>{progreso}…</span><button style={botonMini} onClick={() => { parar.current = true }}>parar</button></>}
          </div>
          {errorEjec && <div style={{ ...nota, color: ROJO, marginTop: 6 }}>{errorEjec}</div>}
        </div>
        {res && (
          <div style={caja}>
            <div style={etiqueta}>Resultado · {res.clas?.oficial ? `oficial (${res.clas.item})` : 'exploratoria'}{res.veredicto ? ` · ${res.veredicto}` : ''}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>{CAB_CARTERA.map((c, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '2px 6px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
                <tbody>{filasCartera(res.periodos).map((f, j) => <tr key={j}>{f.map((c, i) => <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '2px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {res.errorGuardar ? <div style={{ ...nota, color: ROJO }}>{res.errorGuardar}</div> : <div style={nota}>Guardada en el registro de pruebas (la ves en el historial del Lab. cartera).</div>}
          </div>
        )}
        <div style={caja}>
          <div style={etiqueta}>Cómo leer el resultado</div>
          <div style={nota}>
            · CAGR frente a QQQ, 50/50 y SPY: lo que habría rendido comprar y mantener, con los mismos precios de rentabilidad total.<br/>
            · Caída máxima y CAGR / caída: lo que se sufre por el camino. Una regla que rinde algo más con mucha más caída no es mejor.<br/>
            · Azar: tus mismos ciclos (cuántos y cuánto duran) colocados en momentos al azar. El percentil dice en qué puesto queda tu resultado entre 100: por encima de 95, tus momentos son mejores que el azar; cerca de 50, el resultado viene de estar apalancado, no de elegir cuándo.<br/>
            · Los periodos van por separado: una regla que solo gana en uno de ellos depende de ese tramo del mercado.
          </div>
        </div>
        <div style={{ ...caja, borderColor: AMBAR }}>
          <div style={{ ...etiqueta, color: AMBAR }}>Riesgo de sobreajuste</div>
          <div style={nota}>Cada ejecución queda en el registro: probar muchas variantes y quedarse con la mejor hace que alguna salga bien por casualidad. Cambia poco cada vez, comprueba que los valores vecinos dan resultados parecidos y que gana en varios periodos, no solo en el total.</div>
        </div>
      </div>
    </div>
  )
}
