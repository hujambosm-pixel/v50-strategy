// components/BuilderAzarResultado.js — el resultado del paso 2: «Cómo creció el dinero, frente al azar» (boceto «Paso 2 · resultado frente al azar y borrar pruebas», opción A; docs/builder.md, §61).
// El veredicto y sus cifras salen SOLO de lo guardado (`resultado`, lib/pruebaAzar.js formato 1): nunca se recalculan. El gráfico, de lib/azarGraficos.js: lo que no está guardado se calcula una vez y se guarda aparte.
//   onVolver: a la pantalla de confirmación; onPaso1; onPaso3; onBorrar: la papelera; obtenerPrecios(): las velas diarias de la prueba; ctx y version: para leer y guardar el gráfico.
//   graficosInicial, preciosInicial, pestanaInicial y velasInicial: para las pruebas de montaje.
import { useEffect, useMemo, useRef, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import BotonCopiar from './BotonCopiar'
import Ayuda from './BuilderAyuda'
import { Papelera } from './VentanaPregunta'
import { useAncho } from './BuilderPlan'
import { REGLA_AZAR_REGLAS } from '../lib/azarReglas'
import { textoParaClaude } from '../lib/pruebaAzar'
import { AYUDA_ABANICO, AYUDA_COPIAS, AYUDA_GRAFICO_AZAR, ayudaFiabilidad, ayudaVeredicto, euros, textosResultado, numero, pctTexto } from '../lib/resultadoAzar'
import { calculaGraficos, guardarGraficos, leerGraficos, mismosPrecios, pestanasDe, vistaPestana } from '../lib/azarGraficos'
import { marcasLog, separaEtiquetas } from '../lib/builder/escalaGrafico'
import BuilderAzarVelas, { IconoVelas } from './BuilderAzarVelas'

const R = REGLA_AZAR_REGLAS
const AZUL = '#58a6ff', VERDE = '#3fb950', ROJO = '#ff7b72', AMARILLO = '#f2cc60', NARANJA = '#f0883e', CLARO = '#c9d1d9', GRIS = '#6e7681'
const fecha = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const VEREDICTO = { pasa: ['✓ Pasa', VERDE, 'rgba(63,185,80,0.15)'], noPasa: ['✕ No pasa', ROJO, 'rgba(248,81,73,0.15)'], sinVeredicto: ['Sin veredicto', CLARO, 'rgba(139,148,158,0.18)'] }
export const LINEAS_COPIAS = [['mejor', 'La mejor copia', VERDE], ['tipica', 'La típica', CLARO], ['peor', 'La peor copia', NARANJA]]
const ALTO_MINIMO = 340, ICONO_FILA = 22

// El alto libre hasta abajo de lo que se ve (el contenedor que hace scroll o la ventana), sin hueco debajo; un mínimo si la ventana es baja.
function altoHastaAbajo(el, abajo) {
  let p = el.parentElement
  while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement
  const arriba = p ? el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop : el.getBoundingClientRect().top + window.scrollY
  return Math.max(ALTO_MINIMO, Math.floor((p ? p.clientHeight : window.innerHeight) - arriba - abajo))
}

// El gráfico, en escala logarítmica: el abanico (zona 5–95 y 25–75, y sus 5 líneas grises), tu estrategia y las 3 copias, cada una con su etiqueta e importe al final, sin montarse.
function GraficoAzar({ v, alto }) {
  const [ref, W] = useAncho()
  const IZQ = 66, DER = 188, ARR = 10, ABA = 24, N = v.fechas.length
  const indice = useMemo(() => new Map(v.fechas.map((f, i) => [f, i])), [v.fechas])
  const xsA = useMemo(() => v.fechasAbanico.map(f => indice.get(f) ?? 0), [v.fechasAbanico, indice])
  const A = v.abanico
  const lineas = [{ k: 'estrategia', t: 'Tu estrategia', color: AZUL, ancho: 3, s: v.estrategia }, ...LINEAS_COPIAS.map(([k, t, color]) => ({ k, t, color, ancho: 1.5, s: v.copias[k] }))]
  const finalA = (p) => A[p][A[p].length - 1]
  const todos = [...lineas.flatMap(l => l.s.serie), ...A.p5, ...A.p95].filter(x => x > 0)
  const lo = Math.min(...todos) * 0.98, hi = Math.max(...todos) * 1.02, L = Math.log
  const x = (i) => IZQ + i / Math.max(1, N - 1) * (W - IZQ - DER)
  const y = (e) => ARR + (1 - (L(Math.max(e, lo)) - L(lo)) / (L(hi) - L(lo))) * (alto - ARR - ABA)
  const puntos = (xs, s) => s.map((e, k) => `${x(xs ? xs[k] : k).toFixed(1)},${y(e).toFixed(1)}`).join(' ')
  const zona = (a, b) => `${puntos(xsA, a)} ${[...b].reverse().map((e, k) => `${x(xsA[b.length - 1 - k]).toFixed(1)},${y(e).toFixed(1)}`).join(' ')}`
  // La típica es la copia que acaba en la mediana: una sola etiqueta (§65). Si no acabaran en lo mismo, las dos.
  const tipicaMediana = euros(v.copias.tipica.final) === euros(finalA('p50'))
  const etq = separaEtiquetas([
    ...lineas.map(l => ({ k: l.k, t: `${l.k === 'tipica' && tipicaMediana ? 'La típica (mediana)' : l.t} ${euros(l.s.final)}`, color: l.color, y: y(l.s.final), fuerte: l.k === 'estrategia' })),
    { k: 'p95', t: `Percentil 95 ${euros(finalA('p95'))}`, color: B.secundario, y: y(finalA('p95')) }, ...(tipicaMediana ? [] : [{ k: 'p50', t: `Mediana ${euros(finalA('p50'))}`, color: B.secundario, y: y(finalA('p50')) }]), { k: 'p5', t: `Percentil 5 ${euros(finalA('p5'))}`, color: B.secundario, y: y(finalA('p5')) },
  ], ARR + 8, alto - ABA)
  const anios = []; v.fechas.forEach((f, i) => { if (!i || f.slice(0, 4) !== v.fechas[i - 1].slice(0, 4)) anios.push([i, f.slice(0, 4)]) })
  const resumen = `Cómo creció el dinero en ${v.pestana.nombre}, con 10.000 € al empezar: tu estrategia termina en ${euros(v.estrategia.final)}; la mejor copia, en ${euros(v.copias.mejor.final)}; la típica, en ${euros(v.copias.tipica.final)}; la peor, en ${euros(v.copias.peor.final)}. El 95 % de las copias termina por debajo de ${euros(finalA('p95'))}.`
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg data-grafico="azar" width={W} height={alto} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        {marcasLog(lo, hi).map((m, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(m)} y2={y(m)} stroke="#1b2430"/><text x={IZQ - 6} y={y(m) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{euros(m)}</text></g>)}
        {anios.map(([i, a]) => <text key={a} x={x(i)} y={alto - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        <polygon data-zona="5-95" points={zona(A.p95, A.p5)} fill="rgba(139,148,158,0.12)"/>
        <polygon data-zona="25-75" points={zona(A.p75, A.p25)} fill="rgba(139,148,158,0.18)"/>
        {['p5', 'p25', 'p50', 'p75', 'p95'].map(p => <polyline key={p} data-abanico={p} points={puntos(xsA, A[p])} fill="none" stroke={GRIS} strokeWidth={1}/>)}
        {[...lineas].reverse().map(l => <polyline key={l.k} data-linea={l.k} points={puntos(null, l.s.serie)} fill="none" stroke={l.color} strokeWidth={l.ancho} strokeLinejoin="round"/>)}
        {etq.map(e => <text key={e.k} data-etiqueta={e.k} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color} fontWeight={e.fuerte ? 700 : 400}>{e.t}</text>)}
      </svg>
    </div>
  )
}
const Fila = ({ k, t, v, color, fuerte, fin = null }) => <div data-cifra={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${B.borde}` }}><span style={{ color: B.secundario }}>{t}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: color || B.texto, fontWeight: fuerte ? 700 : 400, whiteSpace: 'nowrap' }}>{v}</span>{fin}</span></div>

export default function BuilderAzarResultado({ prueba, resultado, onVolver = null, onPaso1, onPaso3 = null, onBorrar = null, obtenerPrecios = null, ctx = null, version = null, graficosInicial = null, preciosInicial = null, pestanaInicial = 'completo', velasInicial = null }) {
  const t = textosResultado(resultado), [txtV, colorV, fondoV] = VEREDICTO[resultado.veredicto] || VEREDICTO.sinVeredicto
  const velas = prueba.velas || resultado.velas, ps = resultado.periodos || []
  const pestanas = useMemo(() => pestanasDe(prueba), [prueba])
  const [clave, setClave] = useState(pestanaInicial)
  const [graficos, setGraficos] = useState(graficosInicial)
  const [precios, setPrecios] = useState(preciosInicial)
  const [fallo, setFallo] = useState(null)
  const [avisoGuardar, setAvisoGuardar] = useState(null)
  const [otrosPrecios, setOtrosPrecios] = useState(false)
  const [alto, setAlto] = useState(420)
  const [velasDe, setVelasDe] = useState(velasInicial)   // §62: «Ver en velas»: 'estrategia' o la copia
  const caja = useRef(null), leyenda = useRef(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const p = preciosInicial || await obtenerPrecios?.()
        if (!p) return
        if (vivo) setPrecios(p)
        mismosPrecios(prueba, resultado, p).then(x => { if (vivo) setOtrosPrecios(!x) }).catch(() => {})
        if (graficosInicial) return
        let g = ctx ? await leerGraficos(ctx, prueba.id) : null
        if (!g) {
          g = await calculaGraficos(prueba, p)
          if (ctx) try { g = await guardarGraficos(ctx, prueba.id, g, version) } catch (e) { if (vivo) setAvisoGuardar('El gráfico no se ha podido guardar: se volverá a calcular la próxima vez.') }
        }
        if (vivo) setGraficos(g)
      } catch (e) { if (vivo) setFallo(e.message) }
    })()
    return () => { vivo = false }
  }, [prueba.id])
  const vista = useMemo(() => { if (!graficos || !precios || !graficos.pestanas?.[clave]) return null; try { return vistaPestana(prueba, precios, graficos.pestanas[clave], clave) } catch (e) { return { error: e.message } } }, [graficos, precios, clave, prueba])
  const listo = !!vista && !vista.error
  // El gráfico aprovecha todo el alto de la pantalla.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let h = null
    const mide = () => { if (caja.current) setAlto(altoHastaAbajo(caja.current, (leyenda.current?.getBoundingClientRect?.().height || 40) + 44)) }
    const tarde = () => { clearTimeout(h); h = setTimeout(mide, 100) }
    mide(); window.addEventListener('resize', tarde)
    return () => { clearTimeout(h); window.removeEventListener('resize', tarde) }
  }, [listo])
  const per = ps.find(p => p.desde === clave)
  const completo = clave === 'completo', percentil = completo ? (graficos?.pestanas?.completo?.percentil ?? null) : per?.percentil
  const pestana = pestanas.find(x => x.clave === clave)
  const marca = (p) => p.gana ? '✓' : '✕', colorMarca = (p) => p.gana ? VERDE : ROJO
  const iconoVelas = (cual, nombre) => listo ? <button data-ver-velas={cual} aria-label={`Ver en velas: ${nombre}`} title="Ver en velas" onClick={() => setVelasDe(cual)} style={{ width: ICONO_FILA, height: 20, padding: 0, background: 'transparent', border: 0, color: B.enlace, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><IconoVelas/></button> : null
  const huecoIcono = listo ? <span style={{ width: ICONO_FILA }}/> : null   // Para que las cifras sin icono sigan en la misma columna.

  return (
    <div data-pantalla="resultado-azar" data-caso={t.caso}>
      {/* La línea bajo la cabecera B: qué prueba es, el veredicto, cuándo se congeló y la papelera. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {onVolver && <button data-boton="volver" aria-label="Volver a la pantalla de la prueba" title="Volver a la pantalla de la prueba" style={{ ...S.enlace, color: B.secundario }} onClick={onVolver}>←</button>}
        <div data-titulo-prueba style={{ fontSize: 18, fontWeight: 700, color: B.titulo }}>Prueba contra el azar · {prueba.valor} · velas {velas}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><span data-veredicto={resultado.veredicto} style={{ padding: '3px 10px', borderRadius: 12, background: fondoV, color: colorV, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{txtV}</span><Ayuda texto={ayudaVeredicto(t)} etiqueta="El veredicto"/></span>
        <span data-congelada style={{ fontSize: 12, color: B.secundario }}>Congelada el {fecha(prueba.creada_en)} · semilla {prueba.semilla}</span>
        {onBorrar && <button data-borrar-prueba={prueba.id} aria-label="Borrar esta prueba" title="Borrar esta prueba" onClick={onBorrar} style={{ marginLeft: 'auto', width: 32, height: 32, background: 'transparent', border: `1px solid ${B.borde}`, borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Papelera tamano={16}/></button>}
      </div>
      {/* Las tres pestañas. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${B.borde}`, flexWrap: 'wrap', marginBottom: 12 }}>
        <div role="tablist" aria-label="Periodo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {pestanas.map(x => { const on = x.clave === clave, p = ps.find(q => q.desde === x.clave); return (
            <button key={x.clave} role="tab" aria-selected={on} data-pestana-azar={x.clave} onClick={() => setClave(x.clave)} style={{ padding: '8px 14px', border: 0, borderBottom: `2px solid ${on ? VERDE : 'transparent'}`, background: 'transparent', color: on ? B.titulo : B.secundario, fontFamily: B.letra, fontSize: 14, fontWeight: on ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {x.nombre}{x.completo ? ' · completo' : ' '}{p && <span style={{ color: colorMarca(p), fontWeight: 700 }}>{marca(p)} {pctTexto(p.percentil)} %</span>}
            </button>) })}
        </div>
        <div data-regla-pasar style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: B.secundario }}>Para pasar hay que ganar al {R.gana} % de las copias en los DOS periodos</div>
      </div>
      {t.avisos.map(a => <div key={a} data-aviso-pocas style={{ color: AMARILLO, fontSize: 13, marginBottom: 6 }}>⚠ {a}</div>)}
      {resultado.veredicto === 'sinVeredicto' && <div data-informativo style={{ color: AMARILLO, fontSize: 13, marginBottom: 6 }}>⚠ Solo informativo: en esta estrategia la prueba no es fiable</div>}
      {otrosPrecios && <div data-otros-precios style={{ color: AMARILLO, fontSize: 13, marginBottom: 6 }}>⚠ Los precios han cambiado desde que se congeló la prueba: el dibujo puede no coincidir del todo con sus cifras</div>}
      {avisoGuardar && <div style={{ color: AMARILLO, fontSize: 13, marginBottom: 6 }}>⚠ {avisoGuardar}</div>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 640px', minWidth: 0, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, padding: 14, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.titulo }}>Cómo creció el dinero, frente al azar</div><Ayuda texto={AYUDA_GRAFICO_AZAR} etiqueta="Cómo creció el dinero"/>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: B.secundario }}>10.000 € al empezar · escala logarítmica</span>
            {listo && <button data-ver-velas-arriba onClick={() => setVelasDe('estrategia')} style={{ ...S.boton, marginLeft: 10, padding: '4px 10px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconoVelas/>Ver en velas</button>}
          </div>
          <div ref={caja} data-caja-grafico>
            {listo ? <GraficoAzar v={vista} alto={alto}/>
              : <div data-sin-grafico style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fallo || vista?.error ? ROJO : B.secundario, textAlign: 'center' }}>{fallo || vista?.error ? `✕ No se pudo preparar el gráfico: ${fallo || vista.error}` : 'Preparando el gráfico…'}</div>}
          </div>
          <div ref={leyenda} data-leyenda-azar style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', alignItems: 'center', marginTop: 8, fontSize: 12.5, color: B.texto }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 20, borderTop: `3px solid ${AZUL}` }}/><b>Tu estrategia</b></span>
            {LINEAS_COPIAS.map(([k, n, c]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 20, borderTop: `2px solid ${c}` }}/>{n}</span>)}
            <Ayuda texto={AYUDA_COPIAS} etiqueta="Las copias"/>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: B.secundario }}><span style={{ width: 20, height: 10, background: 'rgba(139,148,158,0.25)', marginRight: 4 }}/>El azar: 5 líneas (percentiles 5, 25, 50, 75 y 95)<Ayuda texto={AYUDA_ABANICO} etiqueta="El azar"/></span>
          </div>
        </div>
        <div data-panel-azar style={{ flex: '1 1 260px', minWidth: 0, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, padding: 14, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, color: B.secundario }}>Veredicto (sale de los dos periodos)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colorV }}>{txtV}</div>
          {ps.map(p => <Fila key={p.nombre} k={`periodo-${p.desde}`} t={p.nombre} v={`${marca(p)} ganó al ${pctTexto(p.percentil)} %`} color={colorMarca(p)} fuerte/>)}
          <div style={{ height: 8 }}/>
          <div style={{ fontSize: 12, color: B.secundario }}>Ganó al</div>
          <div data-gana-a style={{ fontSize: 30, fontWeight: 700, color: B.titulo, lineHeight: 1.1 }}>{percentil == null ? '—' : `${pctTexto(percentil)} %`}</div>
          <div data-nota-gana style={{ fontSize: 12.5, color: B.secundario }}>de las copias{completo ? ' · solo informativo, no cuenta para el veredicto' : ` · ${pestana.nombre}`}</div>
          <div style={{ height: 6 }}/>
          <Fila k="final-estrategia" t="Tu estrategia" v={listo ? euros(vista.estrategia.final) : '—'} color={AZUL} fuerte fin={iconoVelas('estrategia', 'Tu estrategia')}/>
          {LINEAS_COPIAS.map(([k, n, c]) => <Fila key={k} k={`final-${k}`} t={n} v={listo ? euros(vista.copias[k].final) : '—'} color={c} fin={iconoVelas(k, n)}/>)}
          <Fila k="operaciones" t="Operaciones de tu estrategia" v={listo ? vista.estrategia.operaciones : per ? per.operaciones : '—'} fin={huecoIcono}/>
          <div data-cifra="fiabilidad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, padding: '5px 0' }}><span style={{ color: B.secundario, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Fiabilidad<Ayuda texto={ayudaFiabilidad(resultado)} etiqueta="Fiabilidad"/></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: t.fiable ? VERDE : ROJO, fontWeight: 700 }}>{t.fiable ? 'Fiable ✓' : 'No fiable ✕'}</span>{huecoIcono}</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button data-boton="paso3" style={{ ...(resultado.veredicto === 'pasa' ? S.botonVerde : S.boton), padding: '6px 10px', fontSize: 13 }} onClick={() => onPaso3?.()}>Paso 3 · Convertirla en plan</button>
            <button data-boton="paso1" style={{ ...S.boton, padding: '6px 10px', fontSize: 13 }} onClick={() => onPaso1?.()}>Volver al paso 1</button>
            <BotonCopiar obtenerTexto={() => textoParaClaude(prueba, resultado)} titulo="Copia en texto plano la configuración, la huella y las cifras del resultado"/>
          </div>
        </div>
      </div>
      {velasDe && listo && <BuilderAzarVelas v={vista} simbolo={prueba.valor} velasTexto={velas} inicial={velasDe} onCierra={() => setVelasDe(null)}/>}
    </div>
  )
}
