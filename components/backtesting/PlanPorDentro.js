// components/backtesting/PlanPorDentro.js — la pestaña «La cartera por dentro» de un plan con «Una lista» (fase 4 de «el plan con
// lista», docs/builder.md §84; boceto bocetos/plan-con-lista-C.html, Imagen 2). Es el bloque calculado como el Backtesting de siempre:
// la MISMA petición (lib/peticionMc.js), el MISMO motor (/api/multibacktest), el MISMO estado y los MISMOS cálculos
// (useCarteraPorDentro.js) y los MISMOS paneles (CarteraPorDentro.js). Lo propio del plan:
//   · la lista, el reparto y los filtros salen del bloque (a.lista, lib/planes/lista.js); el periodo y el dinero inicial, de «Tu dinero»
//     (× el 100 % del bloque: hoy un plan tiene un solo bloque); sin aportaciones; velas diarias;
//   · con las comisiones del plan (fase 5, docs/builder.md §86): su % con el mínimo por orden (lib/comisiones.js, comisionesDePlan), y lo
//     dice en una línea; los «Comprar y mantener» de aquí siguen sin comisión, como en el Backtesting (excepción temporal de Sergi);
//   · se calcula SOLA mientras la pestaña está abierta, ~1 s después del último cambio (decisión de Sergi del 06/11);
//   · los parámetros del panel de «Backtest de un valor» (emaR, stop…) van con sus valores de partida: las estrategias de tarjetas no
//     los usan, y así la petición es la del Backtesting con la app recién abierta;
//   · el «↗» de un valor abre la Watchlist preguntando antes si hay cambios sin guardar (onIrAValor).
// Con el universo dinámico (Nasdaq-100) todavía no se calcula: lo dice en una línea.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import CarteraPorDentro from './CarteraPorDentro'
import useCarteraPorDentro from './useCarteraPorDentro'
import { ALTO_FRANJA_RENDIMIENTO, MC_TODAS, SUELO_EQUITY, apiFetch as apiFetchApp, capitalDeRespuesta, desplazamientoSobre, mcVisibleActivo, scrollerDe } from './comun'
import { anotaPeticionMc } from '../AzarCarteraPanel'
import { comisionesDePlan } from '../../lib/comisiones'
import { cfgBaseMc, cuerpoMc, pesosNormalizadosMc } from '../../lib/peticionMc'
import { leeRespuestaMc } from '../../lib/respuestaMc'
import { mergeLista } from '../../lib/planes/lista'
import { costesDe, creaCalculador, fechasDe, textoComision } from '../../lib/builder/planPantalla'
const McMonthlyGainsChart = dynamic(() => import('../McMonthlyGainsChart'), { ssr: false })

// Los valores de partida de pages/index.js (los useState del panel de «Backtest de un valor» y del Backtesting).
export const PANEL_DEFECTO = Object.freeze({ emaR: 10, emaL: 11, tipoStop: 'tecnico', atrP: 14, atrM: 1.0, sinPerdidas: true, reentry: true, tipoFiltro: 'none', sp500EmaR: 10, sp500EmaL: 11, mcCapital: 'compound' })
export const ESPERA_POR_DENTRO = 1000
const VACIO = Object.freeze([])

// La petición del bloque: la misma que haría el Backtesting con estos ajustes («Single mode run» de runBacktesting). null si falta algo.
export function peticionPorDentro({ a, estrategia, wlData = {} }) {
  if (!estrategia?.id || a?.donde !== 'lista') return null
  const l = mergeLista(a.lista), per = fechasDe(a), capital = Number(a.capital) || 0
  if (l.universo !== 'manual' || !l.simbolos.length || !per?.desde || !per?.hasta || !(capital > 0)) return null
  const P = PANEL_DEFECTO
  const cfg = cfgBaseMc({ emaR: P.emaR, emaL: P.emaL, years: null, capitalIni: capital, fromDate: per.desde, toDate: per.hasta,
    tipoStop: P.tipoStop, atrP: P.atrP, atrM: P.atrM, sinPerdidas: P.sinPerdidas, reentry: P.reentry, tipoFiltro: P.tipoFiltro, sp500EmaR: P.sp500EmaR, sp500EmaL: P.sp500EmaL, tipoCapital: P.mcCapital,
    riskPerTrade: l.riskPerTrade, maxPortfolioPct: l.maxPortfolioPct, maxAccumRisk: l.maxAccumRisk, assumedStopPct: l.assumedStopPct, maxPosiciones: l.maxPosiciones, prioridad: l.prioridad, criterioUso: l.criterioUso,
    momentumN: l.momentumN, rsWindow: l.rsWindow, rsGateThr: l.rsGateThr, momGateThr: l.momGateThr, proxGateThr: l.proxGateThr, calculoPrioridad: l.calculoPrioridad,
    scoreMap: Object.fromEntries(l.simbolos.map(sym => [sym, wlData?.[sym.toUpperCase()]?.active?.scoreMetricas ?? null])) })
  return cuerpoMc({ symbols: l.simbolos, modoAsig: l.modo, weights: pesosNormalizadosMc(l.modo, l.simbolos, l.pesos), cfg, strategyId: estrategia.id,
    isNoStrategy: (estrategia.name || '').includes('No Strategy'), filtros: l.filtros, intervalo: 'diario', comisiones: comisionesDePlan(costesDe(a)) })
}
// Por qué no hay petición (para la línea de aviso).
export function motivoSinPeticion({ a, estrategia }) {
  const l = mergeLista(a?.lista), per = fechasDe(a || {})
  if (!estrategia?.id) return 'Elige una estrategia de tarjetas.'
  if (l.universo !== 'manual') return 'Con el Nasdaq-100 «La cartera por dentro» todavía no se calcula: de momento, solo con «Lista manual».'
  if (!l.simbolos.length) return 'Elige al menos un valor de la lista.'
  if (!per?.desde || !per?.hasta) return 'Elige el periodo en «Tu dinero».'
  if (!(Number(a?.capital) > 0)) return 'Pon el dinero inicial en «Tu dinero».'
  return null
}

export default function PlanPorDentro({ a, estrategia, estrategias = VACIO, apiFetch = apiFetchApp, version = null, visible = true, onIrAValor = null, wlData = null, calcula = null, motivo: motivoFuera = null }) {
  const cuerpo = useMemo(() => motivoFuera ? null : peticionPorDentro({ a, estrategia, wlData: wlData || {} }), [a, estrategia, wlData, motivoFuera])
  const clave = cuerpo ? JSON.stringify(cuerpo) : null
  const [calc, setCalc] = useState({ calculando: false, resultado: null, error: null, clave: null })
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  const api = useRef(apiFetch); api.current = apiFetch
  const calculador = useRef(null)
  if (!calculador.current) {
    const pide = calcula || (async (c) => {
      const res = await api.current('/api/multibacktest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      const json = await leeRespuestaMc(res)
      anotaPeticionMc(json, c)
      if (!res.ok) throw new Error(json.error || 'Error')
      return json
    })
    calculador.current = creaCalculador({ espera: ESPERA_POR_DENTRO, calcula: async (c) => ({ json: await pide(c), clave: JSON.stringify(c) }),
      alEstado: (e) => { if (vivo.current) setCalc(x => ({ calculando: e.calculando, resultado: e.resultado ? e.resultado.json : x.resultado, error: e.resultado ? null : e.error ?? x.error, clave: e.resultado ? e.resultado.clave : x.clave })) } })
  }
  // Solo con la pestaña abierta y si lo calculado no es ya lo de ahora.
  useEffect(() => {
    if (!visible || !clave) { calculador.current.cancela(); setCalc(x => x.calculando ? { ...x, calculando: false } : x); return }
    if (calc.clave === clave && calc.resultado) return
    calculador.current.pide(JSON.parse(clave))
  }, [visible, clave])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => calculador.current?.cancela(), [])
  const mcResult = clave && calc.clave === clave ? calc.resultado : null

  // ── El estado y los cálculos: los del Backtesting (useCarteraPorDentro), con el resultado de este bloque ──
  const l = useMemo(() => mergeLista(a?.lista), [a?.lista])
  const per = fechasDe(a || {})
  const capital = Number(a?.capital) || 0
  const idEst = estrategia?.id || null
  const mcStratSelected = useMemo(() => idEst ? [idEst] : [], [idEst])
  const claveCom = JSON.stringify(comisionesDePlan(costesDe(a || {})))
  const mcComisiones = useMemo(() => JSON.parse(claveCom), [claveCom])
  const anios = per?.desde && per?.hasta ? Math.max(1, Math.round((new Date(per.hasta) - new Date(per.desde)) / (365.25 * 24 * 3600 * 1000))) : 5
  const h = useCarteraPorDentro({ capitalIni: capital, currentStratId: idEst, filtrosBackend: l.filtros, mcCapitalIni: capital, mcComisiones, mcFromDate: per?.desde || null,
    mcIntervalo: 'diario', mcIsModoCompare: false, mcMultiResults: VACIO, mcPeriodMode: 'range', mcResult, mcStratSelected, mcToDate: per?.hasta || null, mcYears: anios, strategies: estrategias })
  const { mcDisplayResults, mcPorActivo, mcSeriesActivos, mcPantallaCompleta, mcEquityContainerRef, mcArribaRef, mcHeaderRef, mcEquityPrevRef, mcEquityH, setMcEquityH,
    setMcShowGantt, setGanttDiscarded, mcChartsSyncRef, mcChartRefsMap } = h
  // Como runBacktesting al lanzar un cálculo nuevo («Single mode run»): fuera el Gantt y su caché, y la parrilla empieza de cero.
  const ultimaClave = useRef(null)
  useEffect(() => {
    if (!calc.calculando || ultimaClave.current === clave) return
    ultimaClave.current = clave
    setMcShowGantt(false); setGanttDiscarded(null)
    mcChartsSyncRef.current = { isSyncing: false, charts: [], lastRange: null }
    mcChartRefsMap.current = {}
  }, [calc.calculando, clave])   // eslint-disable-line react-hooks/exhaustive-deps
  const chartSyncRef = useRef({ syncing: false, listeners: [] })
  const mcLoading = calc.calculando
  // «↗ Watchlist» de la tabla: CarteraPorDentro pide setSimbolo(x) y luego setSidePanel('watchlist').
  const simboloPedido = useRef(null)
  const setSimbolo = (s) => { simboloPedido.current = s }
  const setSidePanel = (p) => { if (p === 'watchlist' && simboloPedido.current) onIrAValor?.(simboloPedido.current) }

  // ── El autoajuste del alto del equity: COPIA de pages/index.js (los dos efectos, tal cual), con «la pestaña abierta» (visible) en
  // lugar de sidePanel==='multi'. mcLoading es «calculando» de esta pestaña. ──
  const mcNSeriesActivos=mcSeriesActivos?.length??0
  // ── Autoajuste de la altura del equity del multibacktest ──
  // Mide el hueco entre el borde superior del contenedor del gráfico (bajo la fila de botones EQUITY)
  // y el fondo de la ventana CON LA PÁGINA ARRIBA, y lo usa como mcEquityH. Recalcula al montar, al resize,
  // y cuando cambia mcDisplayResults/mcResult (varía la altura de la tabla comparativa → cambia el hueco).
  // Y, sobre todo, cuando cambia el ALTO DE LA CABECERA, que es lo que hay justo encima: los toggles de
  // series viven en su fila de botones y con muchos activos ocupan varias líneas. Eso no depende solo del
  // modo y de la lista —al estrechar la ventana la misma lista envuelve distinto—, así que no basta con
  // ponerlo en las dependencias: un ResizeObserver sobre la cabecera cubre los dos casos, incluido el
  // reflujo durante un resize. Las dependencias se quedan igualmente para recalcular en el instante del
  // cambio de modo, sin esperar a que el observador entregue.
  // Es el ÚNICO punto que escribe mcEquityH. Cleanup en el return.
  useEffect(()=>{
    if(!visible) return
    const recompute=()=>{
      const el=mcEquityContainerRef.current
      if(!el) return
      // EL HUECO NO PUEDE DEPENDER DEL SCROLL, y tampoco del alto del contenido.
      // getBoundingClientRect().top es relativo a la VENTANA: con la página bajada, el contenedor del
      // gráfico queda por encima del borde superior, `top` se vuelve negativo y el hueco medido crece
      // exactamente lo desplazado. Medirlo contra el contenedor del panel NO lo arregla: ese contenedor
      // lleva overflowY:auto pero nunca llega a activarse —.main no lleva min-height:0, así que crece con
      // su contenido—, de modo que su clientHeight ES el alto de todo el contenido y el hueco salía de
      // miles de píxeles, con la página arriba o abajo.
      // Lo que se quiere es lo de siempre —del gráfico al fondo de la ventana— pero TOMADO CON TODO
      // ARRIBA: se le devuelve al rect el desplazamiento acumulado y el valor deja de depender de él.
      // EXCEPCIÓN, pantalla completa: el overlay es position:fixed, su rect ya es de ventana y sumarle el
      // desplazamiento de unos ancestros que no le afectan lo falsearía.
      const rectTop=el.getBoundingClientRect().top
      const topSinDesplazar=mcPantallaCompleta?rectTop:rectTop+desplazamientoSobre(el)
      const hueco=Math.round(window.innerHeight - topSinDesplazar - 10)  // ~10px de margen inferior
      // SUELO. Con todas las estrategias desplegadas, la tabla empuja el contenedor hacia abajo y el hueco
      // se queda en 150-200 px: un gráfico de velas aplastado que no sirve para nada. La guarda anterior
      // (h>150) no acotaba el valor, solo dejaba de escribirlo, así que el alto se congelaba en lo último
      // que hubiera. Ahora hay un mínimo de verdad y el gráfico sobresale por debajo del pliegue: se alcanza
      // bajando la página, igual que las ganancias mensuales, el historial y la parrilla, que ya viven ahí
      // abajo.
      // EXCEPCIÓN, pantalla completa: ahí no hay tabla encima y el overlay es overflow:hidden, así que un
      // suelo mayor que el hueco real desbordaría por abajo y se comería la franja de rendimiento. En ese
      // caso manda el hueco.
      const h=mcPantallaCompleta?hueco:Math.max(SUELO_EQUITY,hueco)
      if(h>80) setMcEquityH(prev=>prev===h?prev:h)
    }
    const raf=requestAnimationFrame(()=>requestAnimationFrame(recompute))
    window.addEventListener('resize',recompute)
    // DOS OBJETIVOS, y los dos por la misma razón: lo que mueve el borde superior del gráfico es lo que hay
    // por encima. La cabecera del propio gráfico (mcHeaderRef) ya se observaba, pero es CIEGA a todo lo
    // demás: plegar o desplegar las filas de activo de la tabla, que aparezca o desaparezca un chip de
    // filtro o un aviso de cobertura, cambiar el número de filas… nada de eso la toca, así que el alto se
    // quedaba con la última medida, tomada con la tabla en otro estado.
    // NO SE REALIMENTA: ninguno de los dos objetivos contiene el gráfico, así que su alto no depende de
    // mcEquityH ni directa ni indirectamente, y recompute mide la POSICIÓN del gráfico, no su tamaño. Un
    // recálculo no puede provocar otro.
    // ResizeObserver entrega SIEMPRE una primera vez por cada objetivo al empezar a observarlo, aunque nada
    // haya cambiado de tamaño. Esas altas se descartan —el alto de partida ya lo pone el doble rAF—, pero
    // una por una: descartar la primera entrega a secas dejaría fuera un cambio real del segundo objetivo.
    const _alta=new Set()
    const objetivos=[mcArribaRef.current,mcHeaderRef.current].filter(Boolean)
    const ro=objetivos.length?new ResizeObserver(entradas=>{
      const cambios=entradas.filter(e=>{
        if(_alta.has(e.target)) return true
        _alta.add(e.target); return false
      })
      if(cambios.length) recompute()
    }):null
    objetivos.forEach(o=>ro.observe(o))
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize',recompute); ro?.disconnect() }
    // mcSeriesActivos NO entra aquí: es un objeto que se rehace en cada cambio de mcHistSel —o sea, en
    // cada cambio de filtro por estrategia— y rehacía este efecto entero sin que nada hubiera cambiado de
    // alto. Lo único que mueve el alto de la cabecera es CUÁNTOS toggles hay, que es un número estable.
    // mcLoading entra porque el banner de cálculo se renderiza como HERMANO del panel, por encima de él
    // (no dentro de mcArribaRef): aparece y desaparece empujando todo el panel, y ningún observador lo ve.
  },[visible,mcDisplayResults,mcResult,mcPorActivo,mcNSeriesActivos,mcPantallaCompleta,mcLoading])

  // ── Conservar la posición de lectura cuando el alto del gráfico cambia de verdad ──
  // Quedan cambios legítimos: desplegar activos en la tabla, entrar o salir del modo Activos, redimensionar
  // la ventana. El gráfico está POR ENCIMA del historial y la parrilla, así que crecer Δ empuja todo lo de
  // abajo Δ. Si el usuario estaba leyendo por debajo del gráfico, devolver ese mismo Δ al scroll deja el
  // texto donde estaba. Si estaba mirando el gráfico, no se toca: ahí el punto de referencia es el gráfico.
  useEffect(()=>{
    const el=mcEquityContainerRef.current
    const prev=mcEquityPrevRef.current
    mcEquityPrevRef.current=mcEquityH
    if(!el||prev===mcEquityH||mcPantallaCompleta) return
    const delta=mcEquityH-prev
    // ¿Estaba el gráfico ENTERO por encima de lo que se miraba, ANTES del cambio? Su borde inferior de
    // antes es el de ahora menos el delta. Si se estaba mirando el propio gráfico no se toca nada: ahí el
    // punto de referencia es él.
    if(el.getBoundingClientRect().bottom-delta>0) return
    // Sobre el scroller de verdad, que en esta maqueta es el documento, no el contenedor del panel.
    const sc=scrollerDe(el)
    if(sc===document.scrollingElement||sc===document.documentElement) window.scrollBy(0,delta)
    else sc.scrollTop+=delta
  },[mcEquityH,mcPantallaCompleta])


  if (!visible) return null
  const motivo = motivoFuera || (cuerpo ? null : motivoSinPeticion({ a, estrategia }))
  const P = PANEL_DEFECTO
  return (
    <div data-por-dentro style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div data-linea-por-dentro style={{ fontSize: 13, color: 'var(--text2, #8ab8d4)' }}>
        {motivo || `Calculado como el Backtesting con ${capital.toLocaleString('es-ES')} € (tu dinero inicial), sin aportaciones y ${costesDe(a || {}) ? `con las comisiones del plan (${textoComision(a)}; «Comprar y mantener», sin comisión)` : 'sin comisiones (el plan no tiene)'}.`}
      </div>
      {calc.error && !calc.calculando && <div data-error-por-dentro style={{ color: '#ff4d6d', fontSize: 13 }}>No se pudo calcular: {calc.error}</div>}
      {mcLoading && <div data-calculando-por-dentro style={{ fontSize: 13, color: 'var(--accent, #00d4ff)' }}>Calculando la cartera por dentro…</div>}
      {mcResult && <div className="bp-mc" data-cartera-por-dentro style={{ overflow: 'visible' }}>
        <CarteraPorDentro {...h} {...{ ALTO_FRANJA_RENDIMIENTO, MC_TODAS, McMonthlyGainsChart, VERSION_APP: version, apiFetch, atrM: P.atrM, atrP: P.atrP, capitalDeRespuesta, capitalIni: capital, chartSyncRef,
          currentStratId: idEst, emaL: P.emaL, emaR: P.emaR, filtrosBackend: l.filtros, mcAssumedStopPct: l.assumedStopPct, mcCapital: P.mcCapital, mcCapitalIni: capital, mcComisiones,
          mcFromDate: per?.desde || null, mcIntervalo: 'diario', mcIsModoCompare: false, mcListFilter: '', mcMaxAccumRisk: l.maxAccumRisk, mcMaxPortfolioPct: l.maxPortfolioPct,
          mcMaxPosiciones: l.maxPosiciones, mcMode: l.modo, mcMultiResults: VACIO, mcPeriodMode: 'range', mcPrioridad: l.prioridad, mcResult, mcRiskPerTrade: l.riskPerTrade,
          mcSelected: l.simbolos, mcStratSelected, mcToDate: per?.hasta || null, mcVisibleActivo, mcWeights: l.pesos, mcYears: anios, reentry: P.reentry, setSidePanel, setSimbolo,
          sinPerdidas: P.sinPerdidas, sp500EmaL: P.sp500EmaL, sp500EmaR: P.sp500EmaR, strategies: estrategias, tipoFiltro: P.tipoFiltro, tipoStop: P.tipoStop }}/>
      </div>}
    </div>
  )
}
