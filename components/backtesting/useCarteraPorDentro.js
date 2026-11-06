// components/backtesting/useCarteraPorDentro.js — «La cartera por dentro»: el ESTADO y los CÁLCULOS de los resultados del Backtesting
// (lo que pinta CarteraPorDentro.js): qué series se ven, estrategia y activo seleccionados, curvas del modo Activos, panel del activo,
// «Después de impuestos», alto y referencias de los gráficos… Recibe el resultado (mcResult, mcMultiResults) y los ajustes con los que
// se calculó, y devuelve todo con el mismo nombre que tenía en pages/index.js.
// Fase 4 de «el plan con lista» (docs/builder.md §82): las sentencias se sacaron de pages/index.js TAL CUAL y en el mismo orden; sus
// efectos se ejecutan en el mismo orden que antes (en pages/index.js no había otros efectos entre ellos). Lo comprueba
// scripts/comprobaciones/backtesting-hook.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rangoDePeriodo } from '../SelectorPeriodo'
import { gananciaPorAñoPool, gananciaPorAñoSlots, taxBHCurve, taxStrategyCurveCaja } from '../../lib/afterTaxSim'
import { capitalDeOperacion } from '../../lib/capitalOperacion'
import { resumenCurva } from '../../lib/respuestaMc'
import { MONO, fmt } from '../../lib/utils'
import { COLORES_ACTIVO, MC_COLOR_CAJA, MC_COLOR_TOTAL, MC_ID_CAJA, MC_ID_TOTAL, MC_TODAS, apiFetch, asignaColoresActivos, capitalDeRespuesta, mcVisibleActivo, nombreIndicador, saneaCurva } from './comun'

export default function useCarteraPorDentro({ capitalIni, currentStratId, filtrosBackend, mcCapitalIni, mcComisiones, mcFromDate, mcIntervalo, mcIsModoCompare, mcMultiResults, mcPeriodMode, mcResult, mcStratSelected, mcToDate, mcYears, strategies }) {
  const [mcTradeFilter,setMcTradeFilter]=useState('')
  const [mcEquityH,setMcEquityH]=useState(300) // resizable MC equity chart height
  const mcEquityContainerRef=useRef(null)  // mide el hueco disponible para autoajustar mcEquityH
  const mcHeaderRef=useRef(null)           // cabecera del gráfico: al envolver cambia de alto y mueve el hueco
  const mcArribaRef=useRef(null)           // todo lo que hay ENCIMA del gráfico: al cambiar de alto, el gráfico se mueve
  const mcEquityPrevRef=useRef(300)        // alto anterior del equity, para compensar el scroll cuando cambia
  // Refs LOCALES del panel de operaciones. Deliberadamente fuera de mcChartRefsMap y mcChartsSyncRef: esos
  // son de la parrilla, y registrar aquí el mismo símbolo pisaría su instancia y mandaría la navegación
  // desde el historial al gráfico equivocado.
  const mcPanelVelasRef=useRef(null)       // chart de velas del panel
  const mcPanelCurvaRef=useRef(null)       // api {fitAll} de la curva del panel
  // Ref de sincronía propio del panel. StratCompareChart no expone su chart, pero sí registra en este ref
  // un handler que fija SU rango visible: es la única vía para llevarlo al mismo periodo que las velas.
  // Local a propósito, nunca el chartSyncRef global: ese arrastraría también a los gráficos del equity.
  const mcPanelSyncRef=useRef({syncing:false,listeners:[]})
  // Filtro por estrategia de TODO el panel. Tres significados, y solo estos tres:
  //   MC_TODAS  → no se filtra: los bloques que admiten varias las pintan todas. Es el valor por defecto
  //               tras ejecutar un backtest, porque lo esperable al terminar es ver lo que se ha corrido,
  //               no aparecer ya filtrado a una estrategia que nadie eligió.
  //   null      → "la activa": la cartera combinada si existe, y si no el resultado activo. Se conserva
  //               porque es lo que resuelve mcHistSel cuando el usuario elige la fila que YA es la activa.
  //   '<id>'    → esa estrategia y solo esa.
  const [mcHistStratId,setMcHistStratId]=useState(MC_TODAS)
  const [mcShowSimple,setMcShowSimple]=useState(false)
  const [mcShowCompound,setMcShowCompound]=useState(true)
  const [mcShowBH,setMcShowBH]=useState(true)
  const [mcShowSP500,setMcShowSP500]=useState(false)
  const [showMultiFloat,setShowMultiFloat]=useState(true)
  const [mcShowAfterTax,setMcShowAfterTax]=useState(false) // toggle "Después de impuestos" (solo modos pool)
  const [mcChartsStratVisible,setMcChartsStratVisible]=useState({})
  const [mcShowQQQ,setMcShowQQQ]=useState(true)
  const [mcShowBHUniv,setMcShowBHUniv]=useState(true)
                                // `days` es la ventana con la que se pidió: una entrada más corta que
                                // la que hace falta ahora NO sirve (ver diasDeHistoria).

  const mcChartApiRef=useRef(null)
  const [mcAxisW,setMcAxisW]=useState(72)   // measured equity rightPriceScale width, shared with occupancy & monthly charts
  // mcDisplayResults: portfolio real viene inyectado en mcMultiResults por el backend (portfolioMode)
  // El cálculo de promedio en cliente ha sido eliminado — __portfolio__ lo calcula handlePortfolioMode
  //
  // ORDEN DE PRESENTACIÓN. mcMultiResults llega en el orden de mcStratSelected, que es el orden en
  // que el usuario fue MARCANDO las casillas ([...prev, s.id] en el selector), no el de la lista.
  // Por eso dos ejecuciones con las mismas estrategias podían pintar las filas en orden distinto:
  // el runner es secuencial y determinista, pero su entrada no lo era. Aquí se reordena para pintar
  // en el mismo orden que la lista lateral, que es `strategies`.
  // Se ordena UNA sola vez y aguas arriba: la tabla, los botones de la fila EQUITY, la leyenda y las
  // series del gráfico leen todos de aquí, así que quedan coherentes entre sí.
  // No se toca el color: cada resultado ya trae el suyo, asignado por posición en mcStratSelected e
  // idéntico al punto de la lista lateral. Reordenar filas conservando r.color mantiene la
  // correspondencia color ↔ estrategia ↔ curva.
  // En comparativa de MODOS no se ordena: ahí las entradas son modos de una misma estrategia y su
  // orden (el de modesToRun) sí es significativo.
  const mcDisplayResults=useMemo(()=>{
    if(mcIsModoCompare) return mcMultiResults
    // Lo que no está en `strategies` —hoy solo ◈ Multicartera— va al final, y entre sí conserva su
    // orden porque Array.prototype.sort es estable.
    const pos=(id)=>{const k=strategies.findIndex(s=>s.id===id);return k===-1?Number.MAX_SAFE_INTEGER:k}
    return [...mcMultiResults].sort((a,b)=>pos(a.id)-pos(b.id))
  },[mcMultiResults,mcIsModoCompare,strategies])
  // Cobertura del periodo pedido. El backend manda avisosHistorico SOLO si algo no cubre lo solicitado y
  // lo omite en otro caso, así que, igual que avisoFiltrosMc, no necesita estado: sale de las respuestas
  // vigentes y desaparece solo. Con varias estrategias hay una respuesta por estrategia sobre los mismos
  // activos: se unen los activos cortos y los excluidos (cada lista por separado) y el resto se toma de la
  // respuesta visible (mcResult).
  const avisoHistoricoMc=useMemo(()=>{
    const conAviso=[mcResult,...mcMultiResults.map(r=>r?.result)].map(r=>r?.avisosHistorico).filter(Boolean)
    if(!conAviso.length) return null
    const base=mcResult?.avisosHistorico||conAviso[0]
    const cortos=new Map(), excluidos=new Map()
    for(const a of conAviso)for(const c of (a.cortos||[]))if(!cortos.has(c.symbol))cortos.set(c.symbol,c.desde)
    for(const a of conAviso)for(const e of (a.excluidos||[]))if(!excluidos.has(e.symbol))excluidos.set(e.symbol,e)
    return {...base,
      cortos:[...cortos].map(([symbol,desde])=>({symbol,desde})).sort((a,b)=>a.desde.localeCompare(b.desde)||a.symbol.localeCompare(b.symbol)),
      excluidos:[...excluidos.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)),
      recorteRango:base.recorteRango||conAviso.find(a=>a.recorteRango)?.recorteRango||null}
  },[mcResult,mcMultiResults])
  // Universo dinámico: las dos referencias del gráfico (B&H de QQQ y del universo), memorizadas para no rehacer el gráfico
  // en cada render, y su resumen para la cabecera.
  const mcCurvasUniverso=useMemo(()=>mcResult?.universo?[
    {data:mcResult.universo.qqqBHCurve,color:'#ffd166',name:'B&H QQQ',show:mcShowQQQ},
    {data:mcResult.universo.bhUniversoCurve,color:'#ff7eb6',name:'B&H universo',show:mcShowBHUniv},
  ].filter(c=>c.show&&c.data?.length):null,[mcResult,mcShowQQQ,mcShowBHUniv])
  const mcResumenUniverso=useMemo(()=>mcResult?.universo?{qqq:resumenCurva(mcResult.universo.qqqBHCurve),universo:resumenCurva(mcResult.universo.bhUniversoCurve)}:null,[mcResult])
  // Nombre con el que ROTULAR el resultado cuando no viaja dentro de una lista con nombre propio:
  // con UNA estrategia y UN modo, el runner hace una llamada única, guarda en mcResult y deja
  // mcMultiResults vacío, así que la etiqueta hay que reconstruirla. Prioriza la estrategia
  // SELECCIONADA sobre la activa global —mismo criterio que ya usaba la exportación—, que es lo
  // que fallaba: se rotulaba con la del selector superior aunque se hubiera ejecutado otra.
  // Resuelto en UN solo sitio a propósito: estaba repetido en tres y por eso divergió.
  const mcSingleStratName=(()=>{
    const sid=(mcStratSelected.filter(Boolean)[0])||currentStratId||null
    return strategies.find(s=>s.id===sid)?.name||'Estrategia activa'
  })()
  const [mcStratVisible,setMcStratVisible]=useState({})     // {id:bool}
  const [mcPorActivo,setMcPorActivo]=useState(false)        // gráfico de equity: false=Estrategias, true=Activos
  const [mcActivoVisible,setMcActivoVisible]=useState({})   // {idSerie:bool} en modo Activos; ver mcVisibleActivo
  const [mcAssetOpen,setMcAssetOpen]=useState({})           // {stratId:bool} acordeón resumen por activo
  // Activo seleccionado en la tabla comparativa: {stratId,symbol} o null. Manda el símbolo; stratId solo
  // dice qué fila se resalta y se resincroniza si cambia la estrategia del historial por otra vía.
  const [mcActivoSel,setMcActivoSel]=useState(null)
  // Indicadores y franjas del activo seleccionado (/api/asset-detail). Van aparte del resultado del
  // backtest porque se piden bajo demanda: a resolución diaria no caben los de todos los activos.
  const [mcDetalleActivo,setMcDetalleActivo]=useState(null)
  const [mcVerIndicadores,setMcVerIndicadores]=useState(true)
  const [mcVerFranjas,setMcVerFranjas]=useState(true)
  const [mcVerEtiquetas,setMcVerEtiquetas]=useState(true)
  const [mcResOpTodas,setMcResOpTodas]=useState(false)   // Resultados por operación: solo la activa (false) o todas
  const [mcPantallaCompleta,setMcPantallaCompleta]=useState(false)
  const mcDetallePedidoRef=useRef(null)   // clave de la última petición lanzada
  const [mcShowBHCompare,setMcShowBHCompare]=useState(true) // B&H curve toggle in multi-strategy chart
  // Estrategia vigente en el HISTORIAL de operaciones. Fuente ÚNICA: la usan el propio historial y el
  // modo Activos del gráfico, para que no puedan divergir. mcHistStratId null = la activa, que con
  // varias estrategias es la cartera combinada (__portfolio__) y si no, mcResult.
  const mcHistSel=useMemo(()=>{
    const isMultiHist=mcMultiResults.length>1
    const _portfolio=mcMultiResults.find(r=>r.id==='__portfolio__')?.result
    // MC_TODAS se resuelve como el null de siempre: la cartera combinada, que ES todas las estrategias en
    // una sola serie de operaciones, y si no existe —modos comparados— el resultado activo. No hay un
    // "todas" mejor: las curvas y el capital por fecha de varias estrategias no se suman.
    const _concreta=mcHistStratId&&mcHistStratId!==MC_TODAS?mcHistStratId:null
    const histResult=isMultiHist&&_concreta
      ?(mcMultiResults.find(r=>r.id===_concreta)?.result??mcResult)
      :(_portfolio??mcResult)
    const histTitle=isMultiHist&&_concreta
      ?(mcMultiResults.find(r=>r.id===_concreta)?.name??'Historial')
      :'Historial Multicartera'
    return {isMultiHist,histResult,histTitle}
  },[mcMultiResults,mcHistStratId,mcResult])
  // A qué fila de la lista corresponde el `null` de mcHistStratId, para que el selector del gráfico
  // pueda marcarla sin fijarla: si el usuario elige justo esa, se vuelve a escribir null y "la activa"
  // sigue siendo dinámica. Réplica exacta de la cascada de mcHistSel —primero la cartera combinada,
  // luego la fila cuyo resultado ES mcResult—, comparando por identidad de objeto porque mcResult sale
  // de ese mismo array. Fuera de los memos a propósito: son dos búsquedas y no deben provocar que la
  // cadena del gráfico se rehaga.
  const mcHistIdPorDefecto=mcDisplayResults.find(r=>r.id==='__portfolio__')?.id
    ??mcDisplayResults.find(r=>r.result===mcResult)?.id
    ??mcDisplayResults[0]?.id??''
  const mcHistIdVigente=mcHistStratId??mcHistIdPorDefecto
  // ¿Estamos en "todas"? Lo consultan los bloques que admiten varias estrategias y los dos que no.
  const mcTodasStrats=mcHistStratId===MC_TODAS
  // Primera estrategia de la tabla: es a la que se salta cuando algo exige UNA y estamos en "todas".
  const mcPrimeraStrat=mcDisplayResults[0]?.id??null
  // Cambiar de estrategia desde cualquier punto pasa por aquí. Al volver a TODAS se suelta el activo
  // seleccionado: su panel necesita UNA estrategia, y dejarlo vivo mostraría datos de una que el selector
  // ya no indica.
  const mcPonerEstrategia=(id)=>{
    setMcHistStratId(id)
    if(id===MC_TODAS){ setMcActivoSel(null); setMcPorActivo(false) }
  }
  // ── Historial y Gantt: SIEMPRE una estrategia ──
  // Los dos enseñan UNA serie de operaciones, con una cabecera, un contador y unos botones que exportan
  // una. "Todas" no tiene representación ahí: las operaciones de varias estrategias no se funden en una
  // lista que signifique nada, y la cartera combinada que se enseñaba antes bajo TODAS no es "todas"
  // —es otra estrategia más—, así que el bloque decía "todas" y mostraba una sin decir cuál.
  // Bajo TODAS toman la PRIMERA fila de la tabla y lo dicen en su título. No es un segundo estado de
  // filtrado: es el ÚNICO, mcHistStratId, leído con el único valor que este bloque sabe representar.
  const mcHistUnoId=mcTodasStrats?mcPrimeraStrat:mcHistStratId
  // Misma cascada que mcHistSel, con el id ya forzado a concreto. mcHistSel se queda intacto: gobierna el
  // modo Activos, el panel del activo y las ganancias mensuales, y ahí TODAS sí significa la cartera.
  const mcHistUno=useMemo(()=>{
    const isMultiHist=mcMultiResults.length>1
    const _portfolio=mcMultiResults.find(r=>r.id==='__portfolio__')?.result
    const _concreta=mcHistUnoId||null
    const histResult=isMultiHist&&_concreta
      ?(mcMultiResults.find(r=>r.id===_concreta)?.result??mcResult)
      :(_portfolio??mcResult)
    const histTitle=isMultiHist&&_concreta
      ?(mcMultiResults.find(r=>r.id===_concreta)?.name??'Historial')
      :'Historial Multicartera'
    return {isMultiHist,histResult,histTitle}
  },[mcMultiResults,mcHistUnoId,mcResult])
  // El activo seleccionado vive dentro de una estrategia. Si el historial cambia a otra —desde el selector
  // del modo Activos o desde sus botones—, hay dos salidas: si esa estrategia también opera el activo, la
  // selección lo sigue y solo se resincroniza qué fila se resalta; si no lo opera, se limpia, porque no
  // habría curva que dibujar ni fila que resaltar. La comparación con el id vigente corta la reentrada:
  // tras igualarlo, el efecto ya no escribe.
  useEffect(()=>{
    if(!mcActivoSel) return
    // Con "todas" no hay panel del activo: hoy toda ruta hacia TODAS pasa por mcPonerEstrategia y ya lo
    // suelta, pero si alguna futura no lo hiciera, la resincronización de abajo escribiría el CENTINELA
    // como stratId de la selección y el resaltado apuntaría a una fila inexistente.
    if(mcTodasStrats){ setMcActivoSel(null); return }
    const hay=(mcHistSel.histResult?.assetStats||[]).some(a=>a.symbol===mcActivoSel.symbol)
    if(!hay){ setMcActivoSel(null); return }
    // Resincronizar la fila resaltada solo tiene sentido si la estrategia guardada es una de la lista.
    // Con una sola estrategia, la fila lleva un id sintético que no está en mcDisplayResults; reescribirlo
    // al id vigente dejaría el resaltado en una fila que no existe y el segundo clic no deseleccionaría.
    const _enLista=mcDisplayResults.some(x=>x.id===mcActivoSel.stratId)
    if(_enLista&&mcActivoSel.stratId!==mcHistIdVigente) setMcActivoSel({stratId:mcHistIdVigente,symbol:mcActivoSel.symbol})
  },[mcHistSel,mcHistIdVigente,mcActivoSel,mcDisplayResults,mcTodasStrats])
  // Series del modo Activos: una por activo, la caja y la curva total como referencia. Este memo hace lo
  // CARO —sanear cada serie— y depende solo de los datos, así que no se rehace al marcar o desmarcar.
  const mcSeriesActivos=useMemo(()=>{
    const r=mcHistSel.histResult
    if(!r?.assetCurves?.length) return null
    // El reparto de colores se hace AQUÍ, dentro del memo, y sobre la lista completa de activos de este
    // gráfico: es la única forma de resolver las colisiones, que dependen de con quién le toque convivir.
    // Calculado fuera habría que rehacerlo por separado y podría desincronizarse de las series.
    const colores=asignaColoresActivos(r.assetCurves.map(a=>a.symbol))
    const series=r.assetCurves.map(a=>({
      id:`activo__${a.symbol}`,name:a.symbol,
      color:colores[a.symbol]?.color??COLORES_ACTIVO[0],
      dashed:!!colores[a.symbol]?.dashed,
      data:saneaCurva(a.data),maxDD:0,maxDDDate:null,taxByDate:null,
    }))
    const caja=saneaCurva(r.cashCurve)
    // La total va la ÚLTIMA: lightweight-charts dibuja en orden, así queda encima del resto. Y va como
    // BENEFICIO, restándole el capital inicial: las demás series arrancan en cero, y el patrimonio
    // arrancaría en 10.000, que son dos magnitudes distintas en el mismo eje.
    // El capital sale de la PROPIA respuesta, no del formulario: misma fuente que la línea de referencia
    // del gráfico (capitalDeRespuesta), para que las dos no puedan discrepar.
    const capBase=capitalDeRespuesta(r)
    const total=capBase==null?[]
      :saneaCurva((r.floatCompoundCurve?.length?r.floatCompoundCurve:r.compoundCurve)||[])
        .map(p=>({date:p.date,value:p.value-capBase}))
    const lista=[
      ...series,
      ...(caja.length>1?[{id:MC_ID_CAJA,name:'No invertido',color:MC_COLOR_CAJA,data:caja,dashed:true,maxDD:0,maxDDDate:null,taxByDate:null}]:[]),
      ...(total.length>1?[{id:MC_ID_TOTAL,name:'Total estrategia',color:MC_COLOR_TOTAL,data:total,maxDD:0,maxDDDate:null,taxByDate:null}]:[]),
    ]
    // Una serie de un solo punto no se dibuja: no es una línea.
    const dibujables=lista.filter(c=>c.data.length>1)
    return dibujables.length?dibujables:null
  },[mcHistSel])
  // La visibilidad se superpone aparte: alternar una serie solo rehace este envoltorio, no el saneado.
  // El array cambia de identidad únicamente cuando cambian los datos o la visibilidad, que es justo
  // cuando el chart tiene que reconstruirse (su efecto depende de `curves`).
  const mcCurvasActivos=useMemo(()=>
    mcSeriesActivos?.map(c=>({...c,show:mcVisibleActivo(mcActivoVisible,c.id)}))??null
  ,[mcSeriesActivos,mcActivoVisible])
  // Serie del panel de rendimiento: una sola curva, la del activo seleccionado, en el color que ese activo
  // tiene en el modo Activos para que las dos vistas hablen del mismo. Pasa por saneaCurva como todas.
  const mcCurvaActivoSel=useMemo(()=>{
    const sym=mcActivoSel?.symbol
    if(!sym) return null
    const datos=mcHistSel.histResult?.assetTwrCurves?.[sym]
    const data=saneaCurva(datos)
    if(data.length<2) return null
    const color=mcSeriesActivos?.find(c=>c.id===`activo__${sym}`)?.color
      ??asignaColoresActivos(Object.keys(mcHistSel.histResult?.assetTwrCurves||{}))[sym]?.color
      ??COLORES_ACTIVO[0]
    return [{id:`twr__${sym}`,name:sym,color,data,show:true,maxDD:0,maxDDDate:null,taxByDate:null}]
  },[mcActivoSel,mcHistSel,mcSeriesActivos])
  // ── Panel de operaciones del activo seleccionado ──────────────────────────────────────────────
  // Manda sobre el área del gráfico grande mientras haya selección. La condición incluye la curva: sin
  // ella no hay nada que enseñar y es mejor dejar el equity como estaba.
  const mcPanelActivo=!!(mcActivoSel&&mcCurvaActivoSel)
  // Nombre de la estrategia que se está mirando, el mismo que rotula el selector y el historial.
  const mcNombreStratSel=mcDisplayResults.find(r=>r.id===mcHistIdVigente)?.name||mcSingleStratName
  // Periodo REAL del backtest, tomado de la propia curva del activo: es el eje del motor, no las fechas
  // tecleadas. Acota lo que se ve en las velas, que llegan hasta hoy aunque el periodo acabara antes.
  const mcRangoBacktest=useMemo(()=>{
    const d=mcCurvaActivoSel?.[0]?.data
    if(!d?.length) return null
    return {from:d[0].date,to:d[d.length-1].date}
  },[mcCurvaActivoSel])
  // Operaciones ejecutadas del activo seleccionado, las mismas que alimentan su fila de la tabla.
  const mcTradesActivoSel=useMemo(()=>{
    const sym=mcActivoSel?.symbol
    if(!sym) return []
    return (mcHistSel.histResult?.allTrades||[]).filter(t=>t.symbol===sym)
  },[mcActivoSel,mcHistSel])
  // Filtro por el activo seleccionado, con coincidencia EXACTA de símbolo: es el mismo criterio que la
  // tabla del historial, y por el mismo motivo —con `includes`, seleccionar V arrastraría NVDA—. Sin
  // selección devuelve la lista TAL CUAL, así que todo lo que lo use se comporta como antes.
  const mcSoloActivoSel=(trades)=>{
    const sym=mcActivoSel?.symbol
    if(!sym||!Array.isArray(trades)) return trades
    return trades.filter(t=>(t?.symbol||'')===sym)
  }
  // La parrilla arranca en la estrategia ACTIVA y la sigue. Se dispara solo cuando cambia esa estrategia
  // o cuando llega un backtest nuevo (mcMultiResults), no en cada render: entre medias, lo que el usuario
  // marque a mano se conserva. Deliberadamente NO depende de mcDisplayResults, cuya identidad cambia
  // también al refrescar métricas y borraría esa elección manual sin motivo.
  useEffect(()=>{
    if(!mcHistIdVigente||!mcDisplayResults.length) return
    const vis={}
    // Con "todas" se marcan todas: si no, vis quedaría con el centinela y la parrilla no pintaría nada.
    mcDisplayResults.forEach(r=>{ vis[r.id]=mcTodasStrats||r.id===mcHistIdVigente })
    setMcChartsStratVisible(prev=>{
      const igual=mcDisplayResults.every(r=>!!prev[r.id]===vis[r.id])
      return igual?prev:vis
    })
  },[mcHistIdVigente,mcMultiResults])   // eslint-disable-line react-hooks/exhaustive-deps
  // ¿Se dibuja esta estrategia? El panel entero sigue a la estrategia ACTIVA del historial —el mismo
  // mcHistStratId que usan el historial y el panel del activo—, así que no hay un segundo estado que
  // pueda desincronizarse. Sin resolución de estrategia vigente, se dibujan todas, que es lo de antes.
  const mcEsStratActiva=(id)=>mcTodasStrats||!mcHistIdVigente||id===mcHistIdVigente
  // Capital de UNA operación: la regla vive ahora en lib/capitalOperacion.js, compartida con las
  // etiquetas de los gráficos. Dos copias de esta regla son dos etiquetas capaces de decir cosas
  // distintas de la misma operación, que es justo el fallo que este cambio arregla. Se conserva el
  // nombre local para no tocar sus puntos de uso.
  const mcCapitalDeOperacion=(t,modoAsig)=>capitalDeOperacion(t,modoAsig)
  // Señales para el gráfico de velas: una sola estrategia, la seleccionada. Memorizado porque el efecto
  // de AssetSignalChart depende de este array por identidad y lo reconstruiría en cada render.
  const mcSignalsActivoSel=useMemo(()=>{
    if(!mcActivoSel||!mcCurvaActivoSel) return null
    const c=mcCurvaActivoSel[0]
    return [{
      id:'__sel__',name:mcNombreStratSel,color:c.color,
      entryColor:'#00e5a0',exitColor:'#ff4d6d',
      entries:mcTradesActivoSel.map(t=>({date:t.entryDate,price:t.entryPx??t.entryPrice})),
      exits:mcTradesActivoSel.map(t=>({date:t.exitDate,price:t.exitPx??t.exitPrice})),
      trades:mcTradesActivoSel.map((t,idx)=>({
        n:idx+1,
        entryDate:t.entryDate,entryPx:t.entryPx??t.entryPrice,
        exitDate:t.exitDate,exitPx:t.exitPx??t.exitPrice,
        pnlPct:t.pnlPct,pnlSimple:t.pnlSimple,
        capital:t.pnlPct!==0?Math.abs(t.pnlSimple/(t.pnlPct/100)):0,
        ...mcCapitalDeOperacion(t,mcHistSel.histResult?.modoAsig),
        cesionPct:t.cesionPct??null,maxPx:t.maxPx??null,maxFecha:t.maxFecha??null,
        ddOperacion:t.ddOperacion??null,
      })),
    }]
  },[mcActivoSel,mcCurvaActivoSel,mcTradesActivoSel,mcNombreStratSel,mcHistSel])
  // Qué estrategia ejecutar para sacar los indicadores. La fila puede llevar un id que no es una
  // estrategia: '__portfolio__' agrega varias y no hay UN code_js que la represente, así que ahí no se
  // piden —dibujar el de una cualquiera sería mentir sobre lo que esa fila resume—. El id sintético del
  // caso de una sola estrategia se resuelve como en el resto del panel.
  const mcIdStratDetalle=useMemo(()=>{
    const sel=mcActivoSel?.stratId
    if(sel&&strategies.some(s=>s.id===sel)) return sel
    if(sel==='__portfolio__') return null
    return (mcStratSelected.filter(Boolean)[0])||currentStratId||null
  },[mcActivoSel,strategies,mcStratSelected,currentStratId])
  // Petición del detalle. La clave pedida vive en un ref y no en una variable de cierre: una respuesta
  // que llega tarde se compara con lo VIGENTE y se descarta si ya manda otro activo u otra estrategia.
  // Un fallo no bloquea nada: el gráfico se queda sin indicadores y las velas se dibujan igual.
  useEffect(()=>{
    const sym=mcActivoSel?.symbol
    if(!sym||!mcIdStratDetalle){ mcDetallePedidoRef.current=null; setMcDetalleActivo(null); return }
    const _per=rangoDePeriodo({modo:mcPeriodMode,years:mcYears,desde:mcFromDate,hasta:mcToDate})
    const cfg={capitalIni:Number(mcCapitalIni),fromDate:_per.fromDate,toDate:_per.toDate,
      ...(mcPeriodMode==='years'?{years:Number(mcYears)}:{})}
    const clave=`${sym}|${mcIdStratDetalle}|${mcIntervalo}|${JSON.stringify(cfg)}|${JSON.stringify(mcComisiones)}`
    if(mcDetallePedidoRef.current===clave) return
    mcDetallePedidoRef.current=clave
    setMcDetalleActivo(null)
    const _strat=strategies.find(st=>st.id===mcIdStratDetalle)
    ;(async()=>{
      try{
        const res=await apiFetch('/api/asset-detail',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({symbol:sym,strategyId:mcIdStratDetalle,cfg,intervalo:mcIntervalo,
            // Las velas van ahora en el MISMO intervalo, así que el endpoint no tiene que proyectar nada.
            intervaloVelas:mcIntervalo,comisiones:mcComisiones,
            filtros:filtrosBackend,isNoStrategy:(_strat?.name||'').includes('No Strategy')})})
        const json=await res.json()
        if(mcDetallePedidoRef.current!==clave) return    // llegó tarde: ya manda otra selección
        // El error se GUARDA, no se traga: un endpoint que falla siempre y en silencio es lo que dejó
        // este fallo invisible durante dos versiones.
        setMcDetalleActivo(res.ok?json:{error:json?.error||`HTTP ${res.status}`})
      }catch(e){ if(mcDetallePedidoRef.current===clave) setMcDetalleActivo({error:e.message||'sin respuesta'}) }
    })()
  },[mcActivoSel,mcIdStratDetalle,mcIntervalo,mcPeriodMode,mcYears,mcFromDate,mcToDate,mcCapitalIni,mcComisiones,strategies,filtrosBackend])
  // Solo las series de escala PRECIO: un RSI de 0 a 100 o un volumen de millones en el eje del precio
  // aplastan las velas contra el suelo. El endpoint manda la escala de cada una para no tener que saberla.
  const mcIndicadoresActivo=useMemo(()=>{
    if(!mcVerIndicadores||mcDetalleActivo?.error||!mcDetalleActivo?.indicators) return null
    const COLOR={emaR:'#ffd166',emaL:'#ff4d6d',ema3:'#9C27B0',bbUpper:'#2196F3',bbMid:'#FF6D00',bbLower:'#2196F3'}
    // Los params de la estrategia son la ÚNICA fuente del periodo real: ni la clave ni la respuesta del
    // endpoint lo llevan. El cliente ya los tiene, porque /api/strategies devuelve la fila entera.
    const _st=strategies.find(x=>x.id===mcIdStratDetalle)
    let params={}
    try{ params=_st?.params?(typeof _st.params==='string'?JSON.parse(_st.params):_st.params):{} }catch(_){}
    const out=[]
    for(const [clave,serie] of Object.entries(mcDetalleActivo.indicators)){
      if(mcDetalleActivo.escalas?.[clave]!=='precio') continue
      const data=saneaCurva(serie).map(p=>({time:p.date,value:p.value}))
      if(data.length<=1) continue
      // El nombre es SOLO una etiqueta: si su construcción falla o sale vacía, la serie se dibuja igual
      // con lo que haya. Una línea sin rótulo sirve; una línea que no está, no.
      let nombre=''
      try{ nombre=nombreIndicador(clave,params,mcDetalleActivo.intervalo)||'' }catch(_){ nombre='' }
      out.push({name:nombre,color:COLOR[clave]||'#8aadcc',lineWidth:1,data})
    }
    return out.length?out:null
  },[mcDetalleActivo,mcVerIndicadores,strategies,mcIdStratDetalle])
  const mcZonasActivo=useMemo(()=>{
    if(!mcVerFranjas||mcDetalleActivo?.error) return null
    const z=mcDetalleActivo?.filterZones
    return z?.length?z:null
  },[mcDetalleActivo,mcVerFranjas])
  // Pantalla completa del panel: Escape para salir. La escucha se quita en el return; sin eso quedaría
  // viva al salir y Escape seguiría cerrando el panel desde cualquier parte de la app.
  // El ALTO no se calcula aquí: el autoajuste de siempre mide el hueco entre el borde superior del
  // contenedor del gráfico y el fondo de la ventana, y eso vale igual dentro del overlay —el contenedor
  // sigue siendo hijo suyo y getBoundingClientRect da coordenadas de viewport—. Antes se restaba a mano el
  // offsetHeight de la cabecera leído en pleno render, que llegaba de la maqueta ANTERIOR y por eso
  // sobraba altura: el contenido no cabía, el contenedor flex encogía a sus hijos y la cabecera se comía
  // su propio padding superior. De ahí que apareciera cortada.
  useEffect(()=>{
    if(!mcPantallaCompleta) return
    const tecla=(e)=>{ if(e.key==='Escape') setMcPantallaCompleta(false) }
    window.addEventListener('keydown',tecla)
    return ()=>{ window.removeEventListener('keydown',tecla) }
  },[mcPantallaCompleta])
  // Salir de pantalla completa al soltar la selección: el panel desaparece y dejar el modo encendido
  // dejaría la app cubierta por un overlay vacío.
  useEffect(()=>{ if(!mcActivoSel&&mcPantallaCompleta) setMcPantallaCompleta(false) },[mcActivoSel,mcPantallaCompleta])
  // Lleva los DOS gráficos del panel al periodo del backtest. Las velas por su chart, que está a mano; la
  // curva por el handler que ella misma registra en el ref de sincronía. Sin esto, cada una se ajustaba
  // por su cuenta —las velas al rango pedido y la curva a todo su contenido— y al entrar o salir de
  // pantalla completa acababan enseñando tramos distintos.
  const mcAjustaRangoPanel=useCallback(()=>{
    const r=mcRangoBacktest
    if(!r?.from||!r?.to) return
    try{ mcPanelVelasRef.current?.timeScale().setVisibleRange(r) }catch(_){}
    ;(mcPanelSyncRef.current?.listeners||[]).forEach(l=>{ try{ l.handler(r) }catch(_){} })
  },[mcRangoBacktest])
  // Se reaplica cuando cambian el activo, el periodo, la pantalla completa o el alto: los cuatro
  // reconstruyen algún chart. El retardo espera a esa reconstrucción —los dos cargan lightweight-charts
  // de forma diferida— y el temporizador se cancela en el return.
  useEffect(()=>{
    if(!mcPanelActivo) return
    const t=setTimeout(mcAjustaRangoPanel,180)
    return ()=>clearTimeout(t)
  },[mcPanelActivo,mcAjustaRangoPanel,mcPantallaCompleta,mcEquityH])
  // De qué proveedor salió la serie de cada activo. Hoy es siempre Yahoo —Stooq se retiró porque
  // respondía 403 a todo—, pero el distintivo se queda: el día que haya un segundo proveedor, saber de
  // dónde salió cada serie vuelve a importar, y mientras tanto confirma que no hay mezcla.
  // `ajustadoDividendos` es el campo que antes se llamaba `ajustado`: las series de Yahoo están
  // ajustadas por splits y NO por dividendos, y el nombre viejo se leía como «sin ajustar de ninguna
  // manera», que no era verdad.
  const mcProveedores=useMemo(()=>{
    const m=mcResult?.origenPrecios
    if(!m||!Object.keys(m).length) return null
    const cuenta={}
    for(const v of Object.values(m)) cuenta[v.origen]=(cuenta[v.origen]||0)+1
    const etiqueta=(o)=>o==='yahoo'?'Yahoo':o
    const resumen=Object.entries(cuenta).sort((a,b)=>b[1]-a[1]).map(([o,n])=>`${n} ${etiqueta(o)}`).join(', ')
    const ajuste=(v)=>v.ajustadoDividendos?' (ajustado por dividendos)':' (ajustado por splits, no por dividendos)'
    const detalle=Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([sym,v])=>`${sym}: ${etiqueta(v.origen)}${ajuste(v)}`).join(String.fromCharCode(10))
    return {resumen,detalle,mezcla:Object.keys(cuenta).length>1}
  },[mcResult])
  // Valor de la línea de referencia del gráfico grande: el nivel de "ni gano ni pierdo", que depende de
  // QUÉ dibujan las series. En Estrategias son patrimonio y ese nivel es el capital inicial; en Activos
  // son beneficio con origen en cero, así que el nivel es CERO. Poner ahí el capital —lo que se hacía
  // hasta ahora— metía 10.000 en el rango del eje: la línea es una fuente más del price scale, de modo
  // que al ocultar la curva total las demás quedaban aplastadas contra el suelo del gráfico.
  // El capital sale de la respuesta que ya alimenta a ese mismo gráfico (mcResult, de donde salen bhCurve
  // y sp500BHCurve), no del formulario. Si la respuesta no permite deducirlo, se queda el valor del
  // formulario, que es el comportamiento anterior.
  const mcRefEquity=useMemo(()=>{
    if(mcPorActivo) return 0
    return capitalDeRespuesta(mcResult)??Number(mcCapitalIni||capitalIni)
  },[mcPorActivo,mcResult,mcCapitalIni,capitalIni])
  // ── Curvas "después de impuestos" (IRPF base del ahorro). Solo modos pool. ──
  // Reemplazan compoundCurve (estrategias activas) y bhCurve cuando mcShowAfterTax está activo.
  const mcAfterTax=useMemo(()=>{
    if(!mcShowAfterTax||!mcResult) return null
    const capIni=Number(mcCapitalIni||capitalIni)
    const isMulti=mcDisplayResults.length>1
    const list=isMulti?mcDisplayResults:[{id:'__single__',result:mcResult}]
    const compoundById={}, taxByDateById={}, totalTaxById={}
    list.forEach(r=>{
      const md=r.result?.modoAsig||mcResult.modoAsig
      // Base = curva FLOTANTE cuando showMultiFloat está activo (misma base que la pre-tax mostrada)
      const base=(showMultiFloat&&r.result?.floatCompoundCurve?.length)?r.result.floatCompoundCurve:r.result?.compoundCurve
      const trades=r.result?.allTrades||[]
      // Ganancia realizada por año según el modo: slots deriva pnlCompound por activo; pool Σ pnlSimple.
      const sc=r.result?.slotCapital??mcResult.slotCapital
      const gpa=md==='slots'?gananciaPorAñoSlots(trades,sc):gananciaPorAñoPool(trades)
      // Cálculo 2 (V9.988): el impuesto sale de la cartera el primer día del año siguiente (lib/afterTaxSim.js).
      const res=taxStrategyCurveCaja(base,gpa,capIni)
      compoundById[r.id]=res.curve; taxByDateById[r.id]=res.taxByDate; totalTaxById[r.id]=res.totalTax
    })
    const bhRes=taxBHCurve(mcResult.bhCurve,capIni)  // B&H no tiene curva flotante (siempre 100% invertido)
    return { compoundById, taxByDateById, totalTaxById, bh:bhRes.curve, bhTaxByDate:bhRes.taxByDate, bhTotalTax:bhRes.totalTax }
  },[mcShowAfterTax,mcResult,mcDisplayResults,mcCapitalIni,capitalIni,showMultiFloat])
  // ── Base temporal del CAGR en el multibacktest ──
  // Los años se cuentan SIEMPRE sobre el tramo que la curva cubre de verdad, de su primera a su última
  // fecha: el mismo tramo del que sale el beneficio, que es el valor final de esa misma curva. Así CAGR
  // y beneficio hablan del mismo periodo.
  // NO se usa result.startDate: es la fecha SOLICITADA (última vela − años pedidos) y puede quedar años
  // antes del primer dato real. Con el tope de descarga de 10 años que hubo, un backtest de 20 arrancaba su curva
  // en 2016 mientras startDate dice 2006, y las filas de estrategia repartían un beneficio de 10 años
  // entre 20 —la del B&H ya contaba desde su curva y era la única coherente—. Tampoco las fechas
  // tecleadas en modo rango, por el mismo motivo: si no hay datos desde el inicio del rango, la curva
  // empieza después.
  // startDate sigue intacto en la respuesta: lo usan la exportación, el Gantt y los filtros de Max DD.
  // Un ÚNICO formateador para la columna Max DD % de la tabla comparativa. La fila de estrategia la
  // pintaba con un decimal y la de activo con dos, siendo la misma columna. El signo lo pone él, así que
  // ningún sitio antepone su propio '-'. Solo formato: ningún cálculo pasa por aquí.
  const fmtDDPct=(v)=>Number(v)>0?'-'+fmt(v,1,'%'):'0,0%'
  // Años de velas de los minigráficos: los del MULTIBACKTEST, no los del panel individual, que es de otra
  // pantalla y no tiene por qué coincidir. En modo Fechas no hay "años" que pedir, así que se cuenta desde
  // la fecha inicial hasta hoy: /api/chartdata solo sabe descargar hacia atrás desde la fecha actual.
  const mcAniosVelas=(()=>{
    if(mcPeriodMode==='range'&&mcFromDate){
      const a=(Date.now()-new Date(mcFromDate).getTime())/(365.25*24*3600*1000)
      return Number.isFinite(a)&&a>0?Math.ceil(a):5
    }
    return Number(mcYears)||5
  })()
  const mcAniosDeCurva=(curve)=>{
    const fd=curve?.[0]?.date, ld=curve?.[curve.length-1]?.date
    return fd&&ld?(new Date(ld)-new Date(fd))/(365.25*24*3600*1000):null
  }
  // Primera fecha real de un resultado: la de su curva compuesta (la bhCurve comparte fechas).
  const mcInicioReal=(res)=>res?.compoundCurve?.[0]?.date||res?.bhCurve?.[0]?.date||res?.startDate||null
  // Resumen fiscal neto para una curva taxada (CAGR neto, ganancia neta, impuesto total).
  // Años sobre el tramo real de la propia curva taxada, que conserva las fechas de su curva de origen.
  const mcTaxSummaryFor=(taxedCurve,totalTax)=>{
    if(!taxedCurve?.length) return null
    const capIni=Number(mcCapitalIni||capitalIni)
    const valorFinal=taxedCurve[taxedCurve.length-1].value
    const anios=mcAniosDeCurva(taxedCurve)??mcYears
    const cagr=(Math.pow(Math.max(valorFinal,0.01)/Math.max(capIni,0.01),1/Math.max(anios,0.01))-1)*100
    return { cagr, gan:valorFinal-capIni, tax:totalTax||0 }
  }
  // Bloque vertical de 3 cifras bajo un botón (modo comparación).
  const renderTaxBlock=(s)=> s?(
    <div style={{fontFamily:MONO,fontSize:11,lineHeight:1.35,color:'#8a98a6',textAlign:'center',marginTop:2}}>
      <div>CAGR {s.cagr.toFixed(1)}%</div>
      <div>G.Comp {s.gan<0?'−':''}€{Math.round(Math.abs(s.gan)).toLocaleString('es-ES')}</div>
      <div style={{color:'#c08a3a'}}>Imp €{Math.round(s.tax).toLocaleString('es-ES')}</div>
    </div>
  ):null
  // Línea compacta para el recuadro de modo single.
  const fmtTaxLine=(label,s)=> s?`${label}: CAGR ${s.cagr.toFixed(1)}% · G.Comp ${s.gan<0?'−':''}€${Math.round(Math.abs(s.gan)).toLocaleString('es-ES')} · Imp. €${Math.round(s.tax).toLocaleString('es-ES')}`:''
  // mcAxisW is fed by the equity chart's onAxisWidth callback (measured after
  // layout via double rAF + on resize) so the occupancy / monthly charts end
  // their plot area at exactly the same x as the equity chart.
  const [mcShowMaxDD,setMcShowMaxDD]=useState(true)         // Max DD lines in multi-strategy chart
  const [mcChartsOpen,setMcChartsOpen]=useState(false)     // Vista de gráficos collapsible
  const [mcExporting,setMcExporting]=useState(false)       // exportTimeline in progress
  const [mcShowGantt,setMcShowGantt]=useState(false)       // toggle Gantt / Tabla
  const [ganttDiscarded,setGanttDiscarded]=useState(null)  // cached discarded trades for Gantt
  const [ganttLoadingDisc,setGanttLoadingDisc]=useState(false) // loading discarded for Gantt
  const mcChartsSyncRef=useRef({isSyncing:false,charts:[],lastRange:null}) // sync group for signal charts
  const mcChartRefsMap=useRef({}) // symbol → chart instance for trade navigation
  return { mcTradeFilter, setMcTradeFilter, mcEquityH, setMcEquityH, mcEquityContainerRef, mcHeaderRef, mcArribaRef, mcEquityPrevRef, mcPanelVelasRef, mcPanelCurvaRef, mcPanelSyncRef, mcHistStratId, setMcHistStratId, mcShowSimple, setMcShowSimple, mcShowCompound, setMcShowCompound, mcShowBH, setMcShowBH, mcShowSP500, setMcShowSP500, showMultiFloat, setShowMultiFloat, mcShowAfterTax, setMcShowAfterTax, mcChartsStratVisible, setMcChartsStratVisible, mcShowQQQ, setMcShowQQQ, mcShowBHUniv, setMcShowBHUniv, mcChartApiRef, mcAxisW, setMcAxisW, mcDisplayResults, avisoHistoricoMc, mcCurvasUniverso, mcResumenUniverso, mcSingleStratName, mcStratVisible, setMcStratVisible, mcPorActivo, setMcPorActivo, mcActivoVisible, setMcActivoVisible, mcAssetOpen, setMcAssetOpen, mcActivoSel, setMcActivoSel, mcDetalleActivo, setMcDetalleActivo, mcVerIndicadores, setMcVerIndicadores, mcVerFranjas, setMcVerFranjas, mcVerEtiquetas, setMcVerEtiquetas, mcResOpTodas, setMcResOpTodas, mcPantallaCompleta, setMcPantallaCompleta, mcDetallePedidoRef, mcShowBHCompare, setMcShowBHCompare, mcHistSel, mcHistIdPorDefecto, mcHistIdVigente, mcTodasStrats, mcPrimeraStrat, mcPonerEstrategia, mcHistUnoId, mcHistUno, mcSeriesActivos, mcCurvasActivos, mcCurvaActivoSel, mcPanelActivo, mcNombreStratSel, mcRangoBacktest, mcTradesActivoSel, mcSoloActivoSel, mcEsStratActiva, mcCapitalDeOperacion, mcSignalsActivoSel, mcIdStratDetalle, mcIndicadoresActivo, mcZonasActivo, mcAjustaRangoPanel, mcProveedores, mcRefEquity, mcAfterTax, fmtDDPct, mcAniosVelas, mcAniosDeCurva, mcInicioReal, mcTaxSummaryFor, renderTaxBlock, fmtTaxLine, mcShowMaxDD, setMcShowMaxDD, mcChartsOpen, setMcChartsOpen, mcExporting, setMcExporting, mcShowGantt, setMcShowGantt, ganttDiscarded, setGanttDiscarded, ganttLoadingDisc, setGanttLoadingDisc, mcChartsSyncRef, mcChartRefsMap }
}
