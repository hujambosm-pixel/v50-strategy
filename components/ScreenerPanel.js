// components/ScreenerPanel.js — la pantalla «Screener» (docs/screener.md; boceto bocetos/screener.html, diseño A «Panel +
// tabla»): pestañas de vistas arriba, el embudo, el panel de filtros a la izquierda (como el Backtesting) y la tabla a la
// derecha. Las cifras de cada empresa vienen ya calculadas de la base (lib/screener/datos.js); aquí solo se filtra y se
// ordena (lib/screener/filtros.js). No toca el motor ni ninguna cifra del resto de la app.
import { useEffect, useMemo, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'
import { sinTildes } from '../lib/builder/buscar'
import { empresasDeFilas, fechaDatos, leerFilasEmpresas } from '../lib/screener/datos'
import { AYUDAS, FILTROS, FILTRO, evaluaVista, fmt, pasa } from '../lib/screener/filtros'
import { SECTORES_FUERA_POR_DEFECTO } from '../lib/screener/sectores'
import { VISTAS_EJEMPLO, normalizaVista } from '../lib/screener/vista'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b'
const copia = (x) => JSON.parse(JSON.stringify(x))
const fechaCorta = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—'

// Un «?» con título, explicación y ejemplo (los textos del catálogo).
export const AyudaFiltro = ({ a, etiqueta }) => !a ? null : (
  <Ayuda etiqueta={etiqueta || a[0]} texto={<><b>{a[0]}</b><br/>{a[1]}{a[2] ? <><br/><span style={{ color: B.secundario }}>Ejemplo: {a[2]}</span></> : null}</>}/>)

const Fuente = ({ f }) => (
  <span title={f.startsWith('Yahoo') ? 'Dato de Yahoo: solo existe el de hoy (no sirve para probar en el pasado).' : 'De dónde sale el dato'}
    style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, marginLeft: 4, whiteSpace: 'nowrap',
      background: f.startsWith('Yahoo') ? '#3a3220' : '#1b2836', color: f.startsWith('Yahoo') ? AMARILLO : B.apagado }}>{f}</span>)

// El valor de una celda de la tabla para el filtro f.
export function textoCelda(e, f) {
  if (f.bool) { const x = f.v(e); return (x === true ? '✓ ' : x === false ? '✗ ' : '') + f.mostrar(e) }
  const x = f.v(e)
  if (x == null) return (f.sinDato && f.sinDato(e)) || '—'
  return fmt(x, f.dec ?? 1) + (f.unidad === '%' ? ' %' : f.unidad === 'M' ? ' M' : '')
}
// El valor por el que se ordena una columna (los null, siempre al final).
const valorOrden = (e, col) => {
  if (col === 'simbolo' || col === 'sector') return e[col] || ''
  if (col === 'precio') return e.precio
  if (col === 'exigido') return e.m.per
  const f = FILTRO[col]; if (!f) return null
  const x = f.v(e); return f.bool ? (x === true ? 1 : x === false ? 0 : null) : x
}

// inicial (para las comprobaciones, scripts/comprobaciones/screener.js): { empresas, vistas, iv, piso, busca, verNo, orden }; con
// inicial.empresas no se lee la base.
export default function ScreenerPanel({ inicial = {} }) {
  const [estado, setEstado] = useState(() => inicial.empresas ? { cargando: false, error: null, empresas: inicial.empresas } : { cargando: true, error: null, empresas: [] })
  const [vistas, setVistas] = useState(() => inicial.vistas || VISTAS_EJEMPLO.map(v => ({ nombre: v.nombre, vista: copia(v.vista) })))
  const [iv, setIv] = useState(inicial.iv || 0)
  const [piso, setPiso] = useState(inicial.piso || 'F')
  const [busca, setBusca] = useState(inicial.busca || '')
  const [verNo, setVerNo] = useState(!!inicial.verNo)
  const [orden, setOrden] = useState(inicial.orden || { col: null, dir: 1 })

  useEffect(() => {
    let vivo = true
    if (inicial.empresas) return
    if (!hayConfigSupabase()) { setEstado({ cargando: false, error: 'La app no tiene conexión con la base de datos.', empresas: [] }); return }
    leerFilasEmpresas(ctxConSesion())
      .then(filas => { if (vivo) setEstado({ cargando: false, error: null, empresas: empresasDeFilas(filas) }) })
      .catch(e => { if (vivo) setEstado({ cargando: false, error: e.message, empresas: [] }) })
    return () => { vivo = false }
  }, [])

  const vista = normalizaVista(vistas[iv].vista)
  const cambia = (fn) => setVistas(vs => vs.map((v, i) => i === iv ? { ...v, vista: fn(normalizaVista(v.vista)) } : v))
  const cambiaFiltro = (id, cambio) => cambia(v => ({ ...v, filtros: { ...v.filtros, [id]: { ...v.filtros[id], ...cambio } } }))
  const ev = useMemo(() => evaluaVista(estado.empresas, vista), [estado.empresas, JSON.stringify(vista)])
  const encendidos = FILTROS.filter(f => !f.proximamente && vista.filtros[f.id]?.on)
  const fecha = fechaDatos(estado.empresas)

  const filas = useMemo(() => {
    const q = sinTildes(busca.trim().toLowerCase())
    let l = (verNo ? ev.universo : ev.f2).filter(e => !q || sinTildes(`${e.simbolo} ${e.nombre || ''} ${e.sector || ''}`.toLowerCase()).includes(q))
    if (orden.col) {
      l = [...l].sort((a, b) => {
        const x = valorOrden(a, orden.col), y = valorOrden(b, orden.col)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (x > y ? 1 : x < y ? -1 : 0) * orden.dir
      })
    }
    return l
  }, [ev, busca, verNo, orden])

  const ordena = (col) => setOrden(o => o.col === col ? { col, dir: -o.dir } : { col, dir: col === 'simbolo' || col === 'sector' ? 1 : -1 })
  const exigido = (e) => e.m.per == null ? null : e.m.per / vista.pegRazonable

  const caja = { fontFamily: B.letra, fontSize: 13, background: '#0d1117', color: B.texto, border: `1px solid ${B.borde}`, borderRadius: 6, padding: '3px 6px' }
  const etiqueta = { fontFamily: B.letra, fontSize: 13, color: B.texto, textTransform: 'none', letterSpacing: 0, fontWeight: 400, flexDirection: 'row' }   // la app pone a todo «label» columna y letra mono
  const cel = { padding: '5px 8px', borderBottom: `1px solid ${B.borde}`, whiteSpace: 'nowrap', textAlign: 'right' }

  return (
    <div data-screener style={{ ...S.pagina, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Pestañas de vistas */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: `1px solid ${B.borde}` }}>
        {vistas.map((v, i) => (
          <button key={i} data-pestana-vista={i} onClick={() => setIv(i)}
            style={{ ...S.boton, padding: '6px 12px', borderRadius: '8px 8px 0 0', borderBottom: 'none', fontWeight: i === iv ? 700 : 400,
              background: i === iv ? B.tarjeta : 'transparent', color: i === iv ? B.titulo : B.secundario }}>{v.nombre}</button>
        ))}
        <span style={{ ...S.apagado, marginLeft: 8, paddingBottom: 6 }}>Vistas de ejemplo: aún no se guardan.</span>
      </div>

      {/* Universo y fechas de los datos */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span style={S.secundario}>Universo:</span>
        {[['sp500', 'S&P 500'], ['ndx', 'Nasdaq-100'], ['listas', 'Tus listas']].map(([k, t]) => (
          <label key={k} style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" data-universo={k} checked={!!vista.universo[k]} onChange={e => cambia(v => ({ ...v, universo: { ...v.universo, [k]: e.target.checked } }))}/>{t}
          </label>))}
        <span style={S.apagado}>Cuentas de la SEC (EDGAR) y precios del {fechaCorta(fecha)} · el PEG esperado es de Yahoo, solo de hoy</span>
      </div>

      {/* Embudo */}
      <div data-embudo style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          [`Universo${ev.quitadosSector ? ` (sin ${ev.quitadosSector} de sectores quitados)` : ''}`, ev.universo.length, false],
          ['1 · pasan Fundamentales', ev.f1.length, false],
          ['2 · pasan también Técnico', ev.f2.length, true],
        ].map(([t, n, fin], i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && <span style={{ color: B.apagado }}>→</span>}
            <span style={{ ...S.tarjeta, padding: '6px 14px', borderColor: fin ? B.pasoBorde : B.borde, background: fin ? B.pasoFondo : B.tarjeta }}>
              <div style={{ fontSize: 12, color: B.secundario }}>{t}</div>
              <div data-embudo-n={i} style={{ fontSize: 20, fontWeight: 700, color: B.titulo }}>{estado.cargando ? '…' : n}</div>
            </span>
          </span>))}
        <span style={S.apagado}>El piso técnico llega más adelante: hoy pasan los mismos que en el 1.</span>
      </div>

      {estado.error && <div style={{ color: ROJO }}>⚠ {estado.error}</div>}

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Panel de filtros */}
        <div style={{ ...S.tarjeta, width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${B.borde}` }}>
            {[['F', '1 · Fundamentales'], ['T', '2 · Técnico']].map(([p, t]) => (
              <button key={p} data-piso={p} onClick={() => setPiso(p)}
                style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: 13, fontWeight: piso === p ? 700 : 400,
                  background: piso === p ? B.cabecera : 'transparent', color: piso === p ? B.titulo : B.secundario, borderBottom: piso === p ? `2px solid ${B.enlace}` : '2px solid transparent' }}>{t}</button>))}
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 12px 12px', fontSize: 13 }}>
            {piso === 'F' && <>
              <div style={grupoEst}>Sectores que se quitan<AyudaFiltro a={AYUDAS.sectores}/></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECTORES_FUERA_POR_DEFECTO.map(s => { const on = vista.sectoresFuera.includes(s)
                  return <label key={s} data-sector={s} style={{ ...etiqueta, ...S.chip(on ? 'noSupera' : 'neutro'), cursor: 'pointer', fontWeight: 400, opacity: on ? 1 : 0.7 }}>
                    <input type="checkbox" checked={on} style={{ margin: '0 4px 0 0', verticalAlign: 'middle' }}
                      onChange={e => cambia(v => ({ ...v, sectoresFuera: e.target.checked ? [...v.sectoresFuera, s] : v.sectoresFuera.filter(x => x !== s) }))}/>{s}</label> })}
              </div>
            </>}
            {piso === 'T' && <div style={{ ...S.apagado, margin: '8px 0' }}>Estos filtros llegan en la parte 2 del screener.</div>}
            {FILTROS.filter(f => f.piso === piso).map((f, i, l) => {
              const c = vista.filtros[f.id], on = !!c?.on, n = ev.cuantos[f.id]
              return (
                <div key={f.id}>
                  {(i === 0 || l[i - 1].grupo !== f.grupo) && <div style={grupoEst}>{f.grupo}</div>}
                  <div data-filtro={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', opacity: f.proximamente ? 0.45 : on ? 1 : 0.7 }}>
                    <input type="checkbox" data-on={f.id} checked={on} disabled={!!f.proximamente} onChange={e => cambiaFiltro(f.id, { on: e.target.checked })}/>
                    <span style={{ flex: 1, minWidth: 0 }}>{f.nombre}{f.fuente && <Fuente f={f.fuente}/>}</span>
                    {!f.bool && !f.proximamente && <>
                      <select data-op={f.id} value={c.op} onChange={e => cambiaFiltro(f.id, { op: e.target.value })} style={{ ...caja, padding: '2px 2px', width: 42, flex: '0 0 auto' }}>
                        <option>≥</option><option>≤</option></select>
                      <input data-valor={f.id} type="number" step="any" value={c.valor ?? ''} style={{ ...caja, width: 62, flex: '0 0 auto' }}
                        onChange={e => cambiaFiltro(f.id, { valor: e.target.value === '' ? null : Number(e.target.value) })}/>
                      <span style={{ ...S.apagado, width: 34 }}>{f.unidad}</span>
                    </>}
                    {f.ayuda && <AyudaFiltro a={f.ayuda}/>}
                    <span data-cuenta={f.id} title="Valores que quita este filtro (de los que llegan a su piso)" style={{ width: 40, textAlign: 'right', color: ROJO, fontWeight: 700 }}>{on && n ? '−' + n : ''}</span>
                  </div>
                </div>)
            })}
            <div style={{ ...S.apagado, marginTop: 10, display: 'flex', alignItems: 'center' }}>«−N»: cuántos quita cada filtro<AyudaFiltro a={AYUDAS.cuenta}/></div>
          </div>
        </div>

        {/* Resultados */}
        <div style={{ ...S.tarjeta, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderBottom: `1px solid ${B.borde}`, fontSize: 13 }}>
            <b data-n-filas style={{ color: B.titulo }}>{filas.length} valores</b>
            <ConLimpiar valor={busca} onLimpia={() => setBusca('')}>
              <input data-busca placeholder="Buscar valor o sector" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...caja, width: 200 }}/>
            </ConLimpiar>
            <label style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer', color: B.secundario }}>
              <input type="checkbox" data-ver-no checked={verNo} onChange={e => setVerNo(e.target.checked)}/>ver también los que no pasan (en gris)</label>
            <span style={{ flex: 1 }}/>
            <span style={{ color: B.secundario }}>PEG razonable para «crec. exigido»</span>
            <input data-peg type="number" step="0.1" min="0.1" value={vista.pegRazonable} style={{ ...caja, width: 56 }}
              onChange={e => cambia(v => ({ ...v, pegRazonable: Number(e.target.value) > 0 ? Number(e.target.value) : v.pegRazonable }))}/>
            <AyudaFiltro a={AYUDAS.exigido}/>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {estado.cargando ? <div style={{ ...S.apagado, padding: 20 }}>Cargando las empresas…</div> : (
              <table data-tabla style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                <thead><tr>
                  {[['simbolo', 'Valor'], ['sector', 'Sector'], ['precio', 'Precio $'], ...encendidos.map(f => [f.id, f.nombre]), ['exigido', 'Crec. exigido']].map(([k, t], i) => (
                    <th key={k} data-col={k} onClick={() => ordena(k)} title="Pulsa para ordenar"
                      style={{ ...cel, position: 'sticky', top: 0, background: B.cabecera, color: B.titulo, cursor: 'pointer', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, zIndex: 1 }}>
                      {t}{orden.col === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>))}
                </tr></thead>
                <tbody>
                  {filas.map(e => { const dentro = ev.pasaTodo.has(e.simbolo), x = exigido(e)
                    return (
                      <tr key={e.simbolo} data-fila={e.simbolo} style={{ opacity: dentro ? 1 : 0.5 }}>
                        <td style={{ ...cel, textAlign: 'left' }} title={e.aviso || undefined}><b>{e.simbolo}</b> <span style={{ color: B.secundario }}>{e.nombre}</span></td>
                        <td style={{ ...cel, textAlign: 'left', color: B.secundario }} title={e.sectorFuente === 'SIC' ? 'Sector aproximado con el código de actividad que declara a la SEC (SIC)' : 'Sector oficial del S&P 500 (GICS)'}>{e.sector || '—'}{e.sectorFuente === 'SIC' ? '*' : ''}</td>
                        <td style={cel}>{fmt(e.precio, 2)}</td>
                        {encendidos.map(f => { const bien = pasa(e, f, vista.filtros[f.id])
                          return <td key={f.id} data-celda={f.id} style={{ ...cel, color: bien ? B.texto : ROJO }}>{textoCelda(e, f)}</td> })}
                        <td style={{ ...cel, color: B.secundario }}>{x == null ? '—' : fmt(x) + ' %'}</td>
                      </tr>) })}
                  {!filas.length && <tr><td colSpan={encendidos.length + 4} style={{ ...cel, textAlign: 'center', color: B.secundario, padding: 20 }}>
                    {busca ? 'Ningún valor coincide con la búsqueda.' : 'Ningún valor pasa todos los filtros. Prueba a quitar alguno (el número rojo «−N» dice cuántos quita cada uno).'}</td></tr>}
                </tbody>
              </table>)}
          </div>
          <div style={{ ...S.apagado, padding: '4px 12px', borderTop: `1px solid ${B.borde}` }}>
            Importes en millones de la moneda de sus cuentas · * sector aproximado (código SIC) · en <span style={{ color: ROJO }}>rojo</span>, la cifra que no pasa ese filtro
          </div>
        </div>
      </div>
    </div>
  )
}
const grupoEst = { display: 'flex', alignItems: 'center', margin: '12px 0 4px', fontSize: 12, fontWeight: 700, color: B.secundario, textTransform: 'uppercase', letterSpacing: '0.04em' }
