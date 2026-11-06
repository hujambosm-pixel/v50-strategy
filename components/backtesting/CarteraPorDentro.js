// components/backtesting/CarteraPorDentro.js — Backtesting: los RESULTADOS (elementos 15 y 17–29 del inventario): cabecera resumen,
// «Comparativa de estrategias», equity (Estrategias / Activos) con sus series, «Después de impuestos», detalle de un valor, ganancias
// mensuales, capital empleado, resultados por operación, historial, Gantt, la prueba contra el azar de la cartera, «Vista de gráficos»
// y «Copiar para Claude». Será la pestaña «La cartera por dentro» del plan (docs/builder.md §78).
// Fase 2 de «el plan con lista»: el bloque se sacó de pages/index.js TAL CUAL; el estado, los cálculos y las constantes siguen allí y
// llegan por props con el mismo nombre que tenían. Lo que importaba index.js se importa aquí igual.
import { STRAT_COMPARE_COLORS } from '../../lib/coloresCifras'
import { notaTemporalidad } from '../../lib/condicionesSimulacion'
import { datosCabeceraMulticartera, textoMulticartera } from '../../lib/exportaTexto'
import { exportGantt, exportHistorial } from '../../lib/exportTimeline'
import { nombreUniverso } from '../../lib/universoMc'
import { AYUDA_CAGR, MONO, fmt, fmtDate, huecoBarras } from '../../lib/utils'
import AzarCarteraPanel, { peticionMcDe, pruebasCalculadas } from '../AzarCarteraPanel'
import { AssetSignalChart, McOccupancyChart, MultiCartChart, StratCompareChart } from '../BacktestCharts'
import BotonCopiar, { leeTabla } from '../BotonCopiar'
import GanttChart from '../GanttChart'
import ConLimpiar from '../LimpiarBusqueda'
import { rangoDePeriodo } from '../SelectorPeriodo'
import { Fragment } from 'react'

export default function CarteraPorDentro({ ALTO_FRANJA_RENDIMIENTO, MC_TODAS, McMonthlyGainsChart, VERSION_APP, apiFetch, atrM, atrP, avisoHistoricoMc, capitalDeRespuesta, capitalIni, chartSyncRef, currentStratId, emaL, emaR, filtrosBackend, fmtDDPct, fmtTaxLine, ganttDiscarded, ganttLoadingDisc, mcActivoSel, mcActivoVisible, mcAfterTax, mcAjustaRangoPanel, mcAniosDeCurva, mcAniosVelas, mcArribaRef, mcAssetOpen, mcAssumedStopPct, mcAxisW, mcCapital, mcCapitalDeOperacion, mcCapitalIni, mcChartApiRef, mcChartRefsMap, mcChartsOpen, mcChartsStratVisible, mcChartsSyncRef, mcComisiones, mcCurvaActivoSel, mcCurvasActivos, mcCurvasUniverso, mcDetalleActivo, mcDisplayResults, mcEquityContainerRef, mcEquityH, mcEsStratActiva, mcExporting, mcFromDate, mcHeaderRef, mcHistIdPorDefecto, mcHistIdVigente, mcHistSel, mcHistUno, mcHistUnoId, mcIndicadoresActivo, mcInicioReal, mcIntervalo, mcIsModoCompare, mcListFilter, mcMaxAccumRisk, mcMaxPortfolioPct, mcMaxPosiciones, mcMode, mcMultiResults, mcNombreStratSel, mcPanelActivo, mcPanelCurvaRef, mcPanelSyncRef, mcPanelVelasRef, mcPantallaCompleta, mcPeriodMode, mcPonerEstrategia, mcPorActivo, mcPrimeraStrat, mcPrioridad, mcProveedores, mcRangoBacktest, mcRefEquity, mcResOpTodas, mcResult, mcResumenUniverso, mcRiskPerTrade, mcSelected, mcSeriesActivos, mcShowAfterTax, mcShowBH, mcShowBHCompare, mcShowBHUniv, mcShowCompound, mcShowGantt, mcShowMaxDD, mcShowQQQ, mcShowSP500, mcShowSimple, mcSignalsActivoSel, mcSingleStratName, mcSoloActivoSel, mcStratSelected, mcStratVisible, mcTaxSummaryFor, mcToDate, mcTodasStrats, mcTradeFilter, mcTradesActivoSel, mcVerEtiquetas, mcVerFranjas, mcVerIndicadores, mcVisibleActivo, mcWeights, mcYears, mcZonasActivo, reentry, renderTaxBlock, setGanttDiscarded, setGanttLoadingDisc, setMcActivoSel, setMcActivoVisible, setMcAssetOpen, setMcAxisW, setMcChartsOpen, setMcChartsStratVisible, setMcExporting, setMcHistStratId, setMcPantallaCompleta, setMcPorActivo, setMcResOpTodas, setMcShowAfterTax, setMcShowBH, setMcShowBHCompare, setMcShowBHUniv, setMcShowCompound, setMcShowGantt, setMcShowMaxDD, setMcShowQQQ, setMcShowSP500, setMcStratVisible, setMcTradeFilter, setMcVerEtiquetas, setMcVerFranjas, setMcVerIndicadores, setShowMultiFloat, setSidePanel, setSimbolo, showMultiFloat, sinPerdidas, sp500EmaL, sp500EmaR, strategies, tipoFiltro, tipoStop }) {
  return (
    <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
    {/* Left: scrollable content */}
    <div style={{flex:1,overflowY:'auto',padding:'0 0 20px 0'}}>
      {/* Envoltorio de TODO lo que va encima del gráfico —cabecera resumen con sus avisos y chips,
          y la tabla comparativa con sus filas de activo—. Existe solo para poder observarlo: cuando
          cambia de alto, el borde superior del gráfico se mueve y su hueco deja de ser el medido.
          Es un div de flujo normal, sin estilos: no cambia la maqueta. */}
      <div ref={mcArribaRef}>
      {/* Header resumen */}
      <div style={{padding:'7px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:13,color:'var(--accent)',fontWeight:700}}>📊 Multicartera</span>
        <BotonCopiar obtenerTexto={()=>{
          // «Copiar para Claude»: la comparativa tal como está pintada (con las filas por activo desplegadas) y la
          // prueba contra el azar de la cartera ya calculada (lib/exportaTexto.js). No recalcula nada.
          const lista=mcMultiResults.length?mcMultiResults:[{id:currentStratId||'__single__',name:mcSingleStratName,result:mcResult}]
          const pets=lista.map(r=>peticionMcDe(r.result)).filter(Boolean)
          const pruebas=pruebasCalculadas(lista)
          const tabla=leeTabla(mcArribaRef.current)
          return textoMulticartera({
            cabecera:{titulo:'Multibacktest',version:VERSION_APP,fecha:new Date().toLocaleString('es-ES'),
              datos:datosCabeceraMulticartera({peticiones:[peticionMcDe(mcResult),...pets].filter((p,i,a)=>p&&a.indexOf(p)===i),estrategias:strategies,
                lista:mcListFilter,avisos:mcResult?.avisosHistorico,periodo:mcResult?.periodo,pruebas,universo:mcResult?.universo})},
            tabla:tabla?{...tabla,titulo:mcIsModoCompare?'Comparativa de modos':'Comparativa de estrategias'}:null,
            azar:pruebas,
          })
        }}/>
        {/* Filtro por estrategia, con el mismo patrón que el "Solo SÍMBOLO ✕" del historial:
            si el panel entero está filtrado, tiene que verse, y quitarse desde donde se ve. */}
        {!mcTodasStrats&&mcDisplayResults.length>1&&(
          <span onClick={()=>mcPonerEstrategia(MC_TODAS)}
            title="Ver todas las estrategias"
            style={{display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer',
              fontFamily:MONO,fontSize:10,fontWeight:400,padding:'2px 7px',borderRadius:3,
              border:'1px solid #00d4ff',background:'rgba(0,212,255,0.12)',color:'#00d4ff'}}>
            Solo {mcDisplayResults.find(r=>r.id===mcHistIdVigente)?.name||'una estrategia'} ✕
          </span>
        )}
        {/* Procedencia de los precios. En ámbar cuando en una misma ejecución se mezclan
            proveedores: ahí no todos los activos se midieron con la misma clase de serie. */}
        {mcProveedores&&(
          <span title={'Proveedor de precios por activo:'+String.fromCharCode(10)+mcProveedores.detalle}
            style={{fontFamily:MONO,fontSize:9,cursor:'help',padding:'1px 6px',borderRadius:3,
              color:mcProveedores.mezcla?'#ffd166':'#7a9bc0',
              background:mcProveedores.mezcla?'rgba(255,209,102,0.10)':'rgba(122,155,192,0.08)',
              border:`1px solid ${mcProveedores.mezcla?'rgba(255,209,102,0.35)':'#1a2d45'}`}}>
            precios: {mcProveedores.resumen}
          </span>
        )}
        <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>{/* Con excluidos, "N de M": los que entran frente a los pedidos (misma respuesta) */}{mcResult.avisosHistorico?.excluidos?.length?`${mcResult.n} de ${mcResult.n+mcResult.avisosHistorico.excluidos.length}`:mcResult.n} activos · <span style={{color:mcResult.modoAsig==='custom'?'#9b72ff':'#00d4ff'}}>{mcResult.modoAsig==='compartido'?'Capital compartido':mcResult.modoAsig==='concentrado'?'Capital concentrado':'Slots iguales'}</span></span>
        {/* Temporalidad: en el multibacktest manda la del panel; si alguna estrategia de la ejecución declara otra, se dice. */}
        {(()=>{
          const _pets=[peticionMcDe(mcResult),...mcMultiResults.map(r=>peticionMcDe(r.result))].filter(Boolean)
          const _iv=_pets[0]?.intervalo||'diario'
          const _nota=notaTemporalidad(_iv,[...new Set(_pets.map(p=>p.strategyId).filter(Boolean))].map(id=>strategies.find(s=>s.id===id)).filter(Boolean))
          return _nota?(
            <span title="En el multibacktest todas las estrategias se ejecutan con la temporalidad elegida en el panel (Condiciones de la simulación), aunque declaren otra en sus parámetros."
              style={{fontFamily:MONO,fontSize:10,color:'#ffd166',background:'rgba(255,209,102,0.10)',border:'1px solid rgba(255,209,102,0.35)',borderRadius:3,padding:'1px 6px',cursor:'help'}}>
              Temporalidad: {_iv} ({_nota})
            </span>
          ):null
        })()}
        {/* Universo dinámico: qué universo, cuánto ha recortado y las dos referencias. */}
        {mcResult.universo&&(
          <span title={'Las entradas fuera del universo se descartan en su fecha de ejecución; las posiciones abiertas siguen hasta su salida normal.'+String.fromCharCode(10)
            +'Cierres por dejar de cotizar: posiciones cerradas en la última vela de un valor que deja de cotizar antes del final del periodo.'+String.fromCharCode(10)
            +'B&H universo: reparto igual entre los elegidos de cada año, rebalanceado cada 1 de enero; quien sale del índice se mantiene hasta el rebalanceo y quien deja de cotizar pasa a liquidez.'}
            style={{fontFamily:MONO,fontSize:10,color:'#ffd166',background:'rgba(255,209,102,0.10)',border:'1px solid rgba(255,209,102,0.35)',borderRadius:3,padding:'1px 6px',cursor:'help'}}>
            Universo: {nombreUniverso(mcResult.universo.n,mcResult.universo.regla)} · {mcResult.universo.descartadasPorUniverso} entradas descartadas por universo · {mcResult.universo.cierresSinCotizacion} cierres por dejar de cotizar
            {mcResumenUniverso?.qqq?` · B&H QQQ ${fmt(mcResumenUniverso.qqq.cagr,2,' %')} CAGR (caída ${fmt(mcResumenUniverso.qqq.maxDD,1,' %')})`:''}
            {mcResumenUniverso?.universo?` · B&H universo ${fmt(mcResumenUniverso.universo.cagr,2,' %')} CAGR (caída ${fmt(mcResumenUniverso.universo.maxDD,1,' %')})`:''}
          </span>
        )}
        <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>
          {/* Fechas REALES de la curva, no las solicitadas (ver mcAniosDeCurva) */}
          {mcPeriodMode==='range'&&mcFromDate&&mcToDate
            ?<>Desde {fmtDate(mcInicioReal(mcResult)||mcFromDate)} hasta {fmtDate(mcResult.compoundCurve?.slice(-1)[0]?.date||mcToDate)}</>
            :<>Desde {fmtDate(mcInicioReal(mcResult))}</>}
        </span>
        {/* Avisos de cobertura: el periodo simulado es menor que el pedido (ver avisoHistoricoMc).
            Mismo chip ámbar que el aviso de filtros de V9.724; el detalle va en el tooltip. */}
        {avisoHistoricoMc?.excluidos?.length>0&&(()=>{
          const n=avisoHistoricoMc.excluidos.length
          const tip=[
            `${n} ${n===1?'activo pedido no entra':'activos pedidos no entran'} en el backtest:`,
            ...avisoHistoricoMc.excluidos.map(e=>e.motivo==='sinVelasEnPeriodo'
              ?`  ${e.symbol} — sin velas en el periodo pedido (hay datos del ${fmtDate(e.disponibleDesde)} al ${fmtDate(e.disponibleHasta)})`
              :`  ${e.symbol} — la descarga no trajo datos (símbolo inexistente o fallo del proveedor)`),
            ``,
            `No reciben capital: el reparto y el B&H Diversificado se calculan solo sobre los activos con datos.`,
          ].join('\n')
          return <span title={tip} style={{fontFamily:MONO,fontSize:10,background:'rgba(255,209,102,0.12)',color:'#ffd166',borderRadius:2,padding:'1px 5px',lineHeight:'15px',cursor:'help',whiteSpace:'nowrap'}}>
            ⚠ {n} {n===1?'activo excluido':'activos excluidos'}
          </span>
        })()}
        {avisoHistoricoMc?.cortos?.length>0&&(()=>{
          const a=avisoHistoricoMc, n=a.cortos.length
          const tip=[
            `Se pidió desde ${fmtDate(a.solicitadoDesde)}, pero el backtest arranca realmente el ${fmtDate(a.realDesde)}.`,
            ``,
            `${n} ${n===1?'activo no tiene':'activos no tienen'} datos desde la fecha pedida:`,
            ...a.cortos.map(c=>`  ${c.symbol} — desde ${fmtDate(c.desde)}`),
            ``,
            `Causas posibles: el activo empezó a cotizar más tarde, o la fuente de datos no tiene más histórico de ese activo. Con los datos disponibles no se puede distinguir cuál de las dos.`,
            `Las cifras de la tabla ya se calculan sobre el periodo realmente simulado.`,
          ].join('\n')
          return <span title={tip} style={{fontFamily:MONO,fontSize:10,background:'rgba(255,209,102,0.12)',color:'#ffd166',borderRadius:2,padding:'1px 5px',lineHeight:'15px',cursor:'help',whiteSpace:'nowrap'}}>
            ⚠ {n} {n===1?'activo corto':'activos cortos'} · arranca {fmtDate(a.realDesde)}
          </span>
        })()}
        {avisoHistoricoMc?.recorteRango&&(()=>{
          const r=avisoHistoricoMc.recorteRango
          const tip=[
            `Se pidió simular del ${fmtDate(r.pedidoDesde)} al ${fmtDate(r.pedidoHasta)}, pero se simula del ${fmtDate(r.simuladoDesde)} al ${fmtDate(r.simuladoHasta)}.`,
            ``,
            `En modo rango el motor solo usa los últimos ${r.aniosMotor} años del rango: es un límite del cálculo, no de los datos descargados.`,
          ].join('\n')
          return <span title={tip} style={{fontFamily:MONO,fontSize:10,background:'rgba(255,209,102,0.12)',color:'#ffd166',borderRadius:2,padding:'1px 5px',lineHeight:'15px',cursor:'help',whiteSpace:'nowrap'}}>
            ⚠ Simula {fmtDate(r.simuladoDesde)}–{fmtDate(r.simuladoHasta)} · se pidió {fmtDate(r.pedidoDesde)}–{fmtDate(r.pedidoHasta)}
          </span>
        })()}
      </div>

      {/* ── Tabla unificada: Comparativa + Resumen por activo ── */}
      {(()=>{
        const isMulti=mcDisplayResults.length>1
        const capIni=Number(mcCapitalIni||capitalIni)
        // Lista de estrategias: multi → mcDisplayResults; single → wrapper sintético
        let stratList=isMulti
          ? [...mcDisplayResults]
          : [{id:currentStratId||'__single__',name:mcSingleStratName,color:'#00d4ff',result:mcResult}]
        // B&H globals (del result activo)
        const bhLast=mcResult.bhCurve?.slice(-1)[0]?.value||capIni
        const bhFd=mcResult.bhCurve?.[0]?.date?new Date(mcResult.bhCurve[0].date):mcResult.startDate?new Date(mcResult.startDate):null
        const bhLd=mcResult.bhCurve?.slice(-1)[0]?.date?new Date(mcResult.bhCurve.slice(-1)[0].date):new Date()
        // Tramo real de la bhCurve (mcAniosDeCurva). En modo años ya contaba así —era la fila
        // coherente—; en modo rango usaba las fechas tecleadas, que pueden quedar antes del dato.
        const bhAnios=mcAniosDeCurva(mcResult.bhCurve)??(bhFd&&bhLd?(bhLd-bhFd)/86400000/365.25:1)
        const bhCagr=(Math.pow(Math.max(bhLast,0.01)/Math.max(capIni,0.01),1/Math.max(bhAnios,0.01))-1)*100
        const bhProfit=bhLast-capIni
        const bhProfitPct=capIni>0?bhProfit/capIni*100:0
        const allOpenKeys=[...stratList.map(r=>r.id),...(mcResult.bhCurve?.length>0?['__bh__']:[]) ]
        const allOpen=allOpenKeys.length>0&&allOpenKeys.every(k=>mcAssetOpen[k]===true)
        return(
          <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
            {/* Título + botón contraer/expandir */}
            <div style={{display:'flex',alignItems:'center',marginBottom:8}}>
              <div style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',letterSpacing:'0.05em'}}>{mcIsModoCompare?'COMPARATIVA DE MODOS':'COMPARATIVA DE ESTRATEGIAS'}</div>
              <button
                onClick={()=>setMcAssetOpen(prev=>{const next={};allOpenKeys.forEach(k=>{next[k]=!allOpen});return next})}
                style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                  border:'1px solid #3d5a7a',background:'transparent',color:'#7aabcc'}}>
                {allOpen?'Contraer todo':'Expandir todo'}
              </button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)'}}>
                    {[
                      {h:'Estrategia / Activo',t:''},
                      {h:'Ops',t:'Número total de operaciones cerradas en el período'},
                      {h:'CAGR comp.',t:AYUDA_CAGR.compuesto+'. Tasa de crecimiento anual compuesta sobre el capital inicial de la estrategia: (capital_inicial + G.Comp€)^(1/años) / capital_inicial^(1/años) − 1. En una fila de activo anualiza su CONTRIBUCIÓN, con los mismos años y la misma base que su estrategia: no es el rendimiento del capital que se le asignó.'},
                      {h:'G.Comp€',t:'Ganancia compuesta en euros. Las ganancias de cada trade se reinvierten en el siguiente. La suma de las filas de activo da la de su estrategia.'},
                      {h:'G.Comp%',t:'Ganancia compuesta sobre el CAPITAL INICIAL de la estrategia, la misma base en los cuatro modos de asignación. En una fila de activo es su contribución a la cartera, no el rendimiento del capital que se le asignó; por eso los porcentajes de los activos suman el de la estrategia.'},
                      {h:'Win%',t:'Porcentaje de operaciones cerradas con ganancia sobre el total'},
                      {h:'Profit Factor',t:'Factor de Beneficio: suma de ganancias / suma de pérdidas. Por encima de 1 la estrategia es rentable'},
                      {h:'Max DD',t:'Máxima caída desde un pico hasta el valle siguiente, con P&L flotante y medida día a día sobre TODAS las barras del periodo, no sobre las fechas que se dibujan. En una fila de activo se mide sobre capital inicial + contribución de ese activo, con el mismo cálculo que la estrategia.'},
                      {h:'Max DD €',t:'Importe en euros de la máxima caída: patrimonio en el valle − patrimonio en el pico (los mismos dos días que el Max DD %). Siempre negativo.'},
                      {h:'Cap.inv€',t:'Capital medio invertido en euros: media, sobre todos los días del periodo, del coste de las posiciones abiertas. Los días sin posición cuentan como cero. La suma de las filas de activo da la de su estrategia.'},
                      {h:'Cap.inv%',t:'El mismo capital medio invertido, como porcentaje del patrimonio de la cartera día a día. 100% = todo el capital invertido todos los días. En una fila de activo el denominador sigue siendo el patrimonio de la ESTRATEGIA, así que los porcentajes de los activos suman el de su estrategia.'},
                      {h:'T.inv%',t:'Tiempo en mercado: porcentaje de días del periodo con al menos una posición abierta (estrategia) o con ese activo en cartera (por activo). Cuenta sobre todas las barras del periodo, incluidas las operaciones que abren y cierran el mismo día.'},
                    ].map(({h,t})=>(
                      <th key={h} title={t||undefined}
                        style={{padding:'3px 6px',textAlign:'left',color:'var(--text3)',fontWeight:400,fontSize:9,
                          cursor:t?'help':undefined,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stratList.map(r=>{
                    const isOpen=mcAssetOpen[r.id]===true
                    const isActive=r.id===currentStratId
                    const allT=r.result.allTrades||[]
                    const wins=allT.filter(t=>t.pnlPct>=0),losses=allT.filter(t=>t.pnlPct<0)
                    const winRate=allT.length?wins.length/allT.length*100:0
                    // Capital inicial de ESTA respuesta, no del formulario: un resultado que lleve
                    // rato en memoria pudo ejecutarse con otro capital del que hay tecleado, y
                    // entonces el beneficio y todos los porcentajes de la fila saldrían torcidos.
                    const capIniR=capitalDeRespuesta(r.result)??capIni
                    const lastC=r.result.compoundCurve?.slice(-1)[0]?.value||capIniR
                    const firstC=r.result.compoundCurve?.[0]?.value||capIniR
                    const fd=r.result.startDate?new Date(r.result.startDate):null
                    const ld=r.result.compoundCurve?.slice(-1)[0]?.date?new Date(r.result.compoundCurve.slice(-1)[0].date):new Date()
                    // Años sobre el tramo REAL de su curva compuesta, el mismo del que sale `profit`
                    // (ver mcAniosDeCurva). Antes contaba desde r.result.startDate —la fecha solicitada—,
                    // y un backtest que simuló 10 años repartía su beneficio entre 20.
                    const anios=mcAniosDeCurva(r.result.compoundCurve)??(fd&&ld?(ld-fd)/86400000/365.25:mcYears)
                    const cagrC=(Math.pow(Math.max(lastC,0.01)/Math.max(firstC,0.01),1/Math.max(anios,0.01))-1)*100
                    const grossWin=wins.reduce((s,t)=>s+(t.pnlSimple||0),0)
                    const grossLoss=Math.abs(losses.reduce((s,t)=>s+(t.pnlSimple||0),0))
                    const pf=grossLoss>0?grossWin/grossLoss:grossWin>0?99:0
                    const profit=lastC-capIniR
                    const profitPct=capIniR>0?profit/capIniR*100:0
                    const rStats=r.result.assetStats||[]
                    // ¿Es esta la estrategia a la que está filtrado el panel? La tabla es el
                    // sitio donde se elige, así que tiene que verse desde aquí qué se eligió.
                    const rSel=!mcTodasStrats&&mcHistIdVigente===r.id
                    const avgCapInv=r.result.avgCapOccupancy??(rStats.length?rStats.reduce((s,a)=>s+(a.capInvMedio||0),0)/rStats.length:0)
                    const avgTInv=r.result.tInvEstrategia??(rStats.length?rStats.reduce((s,a)=>s+(a.tInvertido||0),0)/rStats.length:0)
                    return(
                      <Fragment key={r.id}>
                        {/* ── Fila madre (estrategia) ── */}
                        <tr
                          onClick={()=>{
                            // La fila hace dos cosas a la vez, y las dos en el mismo sentido:
                            // selecciona su estrategia para TODO el panel y despliega sus activos.
                            // El segundo clic sobre la misma fila pliega y vuelve a "todas".
                            //
                            // EXCEPCIÓN: con un activo de ESTA estrategia seleccionado, la fila SOLO
                            // pliega o despliega. Ni suelta la selección ni toca el filtro. Plegar la
                            // tabla es lo que se hace para ver mejor el gráfico de velas, así que es
                            // justo cuando menos sentido tiene perderlo; y volver a "todas" lo
                            // soltaría igual, porque el panel del activo necesita UNA estrategia.
                            // La selección se suelta con la ✕ del gráfico, con un segundo clic en la
                            // fila del activo, ejecutando otro backtest o volviendo a TODAS desde el
                            // chip de la cabecera o el selector.
                            const _conActivo=mcActivoSel?.stratId===r.id
                            const _yaEs=!mcTodasStrats&&mcHistIdVigente===r.id
                            const _enLista=mcDisplayResults.some(x=>x.id===r.id)
                            if(_enLista&&!_conActivo) mcPonerEstrategia(_yaEs?MC_TODAS:(r.id===mcHistIdPorDefecto?null:r.id))
                            if(!rStats.length) return
                            setMcAssetOpen(v=>({...v,[r.id]:!isOpen}))
                          }}
                          style={{borderBottom:'1px solid rgba(255,255,255,0.04)',
                            background:r.color+(rSel?'2e':'14'),
                            boxShadow:rSel?`inset 3px 0 0 ${r.color}`:undefined,
                            cursor:'pointer'}}>
                          <td style={{padding:'5px 6px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              {rStats.length>0&&<span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:8,flexShrink:0}}>{isOpen?'▼':'▶'}</span>}
                              <div style={{width:7,height:7,borderRadius:'50%',background:r.color,flexShrink:0}}/>
                              <span style={{color:r.color,fontWeight:600}}>{r.name}</span>
                              {isActive&&isMulti&&<span style={{fontSize:7,color:'#00d4ff',background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.25)',borderRadius:2,padding:'0 3px',flexShrink:0}}>✓</span>}
                            </div>
                          </td>
                          <td style={{padding:'5px 6px',color:'#ffd166',fontWeight:600}}>{(()=>{
                            const ss=r.result.senalStats
                            if(!ss||!ss.generadas) return allT.length
                            const pct=Math.round(ss.ejecutadas/ss.generadas*100)
                            const is100=pct>=100
                            const totalDesc=(ss.descartadasPorSlots||0)+(ss.descartadasPorCapital||0)+(ss.descartadasPorRiesgo||0)+(ss.descartadasPorGate||0)
                            // Position Sizing: aviso de operaciones dimensionadas con la distancia asumida
                            // (sin stop conocido en la vela de entrada). Se muestra en ambas ramas del tooltip.
                            const lineaSinStop=ss.sinStopInicial>0
                              ? `⚠ ${ss.sinStopInicial} de ${ss.ejecutadas} operaciones dimensionadas sin stop inicial (distancia asumida ${ss.distanciaAsumidaPct}%)`
                              : null
                            const tip=totalDesc===0
                              ? [
                                  `Señales generadas: ${ss.generadas}`,
                                  `Ejecutadas: ${ss.ejecutadas} (100%)`,
                                  `Descartadas: 0`,
                                  lineaSinStop,
                                  ``,
                                  `Este modo ejecuta el 100% de las señales por construcción.`,
                                ].filter(l=>l!==null).join('\n')
                              : [
                                  `Señales generadas: ${ss.generadas}`,
                                  `Ejecutadas: ${ss.ejecutadas} (${pct}%)`,
                                  lineaSinStop,
                                  ss.descartadasPorSlots>0?`Descartadas — slots llenos: ${ss.descartadasPorSlots}`:null,
                                  ss.descartadasPorRiesgo>0?`Descartadas — riesgo acum.: ${ss.descartadasPorRiesgo}`:null,
                                  ss.descartadasPorCapital>0?`Descartadas — sin capital: ${ss.descartadasPorCapital}`:null,
                                  ss.descartadasPorGate>0?`Descartadas — filtro ${mcPrioridad==='momentum'?'Momentum':mcPrioridad==='max52'?'Proximidad 52s':'RS'}: ${ss.descartadasPorGate}`:null,
                                  ss.winRateDescartadas!=null?`WR descartadas: ${ss.winRateDescartadas.toFixed(1)}%`:null,
                                  ss.pfDescartadas!=null?`PF descartadas: ${ss.pfDescartadas.toFixed(2)}x`:null,
                                  ss.pnlHipoteticoDescartadas!=null?`€P&L hipotético descartadas: ~${ss.pnlHipoteticoDescartadas>=0?'+':'-'}€${Math.round(Math.abs(ss.pnlHipoteticoDescartadas)).toLocaleString('es-ES')} (estimación)`:null,
                                  ``,
                                  `Estimación calculada con el capital que habría tocado a cada señal en su momento. Es un P&L bruto e incluye las tres categorías (slots llenos, sin capital y filtro RS): no considera el efecto cascada de haberlas ejecutado, ya que habrían ocupado slots y desplazado a otras operaciones (potencialmente mejores), además de añadir drawdown. Un valor positivo no significa que el filtro RS reste valor: descartar señales débiles mejora el perfil risk-adjusted aunque deje algo de P&L bruto sin capturar.`,
                                ].filter(Boolean).join('\n')
                            return(<span style={{display:'flex',alignItems:'center',gap:4}}>
                              <span>{allT.length}</span>
                              {/* data-etiqueta-copiar: «Copiar para Claude» la saca aparte del número (components/BotonCopiar.js). */}
                              <span data-etiqueta-copiar="de las señales ejecutadas" title={tip} style={{fontSize:9,color:is100?'#00e5a0':'#ff9f43',cursor:'help',fontWeight:400,background:is100?'rgba(0,229,160,0.08)':'rgba(255,159,67,0.12)',borderRadius:2,padding:'1px 4px'}}>{pct}%</span>
                              {lineaSinStop&&(
                                <span data-etiqueta-copiar="sin stop inicial" title={`${lineaSinStop}\n\nSu tamaño no sale de un stop real, sino de la distancia asumida que has configurado en Risk management. Si la proporción es alta, el resultado de este modo depende de ese supuesto.`}
                                  style={{fontSize:9,color:'#ffd166',cursor:'help',fontWeight:400,background:'rgba(255,209,102,0.12)',borderRadius:2,padding:'1px 4px'}}>
                                  ⚠{ss.sinStopInicial}
                                </span>
                              )}
                            </span>)
                          })()}</td>
                          <td style={{padding:'5px 6px',color:cagrC>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(cagrC,2,'%')}</td>
                          <td style={{padding:'5px 6px',color:profit>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(profit,0,'€')}</td>
                          <td style={{padding:'5px 6px',color:profitPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(profitPct,1,'%')}</td>
                          <td style={{padding:'5px 6px',color:winRate>=50?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(winRate,1,'%')}</td>
                          <td style={{padding:'5px 6px',color:pf>=1.5?'#00e5a0':pf>=1?'#ffd166':'#ff4d6d',fontWeight:600}}>{fmt(pf,2,'x')}</td>
                          <td style={{padding:'5px 6px',color:'#ff4d6d',fontWeight:600}}>{fmtDDPct(r.result.maxDDFloatCompound||r.result.maxDDCompound||0)}</td>
                          <td style={{padding:'5px 6px',color:'#ff4d6d',fontWeight:600}}>{(()=>{const e=r.result.maxDDFloatCompound?r.result.maxDDFloatCompoundEur:r.result.maxDDCompound?r.result.maxDDCompoundEur:0;return e?'-€'+Math.round(Math.abs(e)).toLocaleString('es-ES'):'€0'})()}</td>
                          <td style={{padding:'5px 6px',color:'#7ab3cc',fontWeight:600}}>{r.result.avgCapOccupancyEur!=null?fmt(r.result.avgCapOccupancyEur,0,'€'):'—'}</td>
                          <td style={{padding:'5px 6px',color:'#00d4ff',fontWeight:600}}>{fmt(avgCapInv,1,'%')}</td>
                          <td style={{padding:'5px 6px',color:'#00d4ff',fontWeight:600}}>{fmt(avgTInv,1,'%')}</td>
                        </tr>
                        {/* ── Subfilas (activos) ── */}
                        {isOpen&&rStats.map(a=>{
                          // El CAGR del activo anualiza sobre los MISMOS años que la fila madre
                          // (`anios`, el tramo real de su curva compuesta): dos filas de la misma
                          // tabla que cubren el mismo periodo no pueden usar tramos distintos.
                          // CONTRIBUCIÓN SOBRE EL CAPITAL INICIAL, la misma base en los cuatro modos
                          // y la misma que la fila madre: la pregunta que responde la fila de un
                          // activo es cuánto aporta a la cartera, no cómo le fue al capital que le
                          // tocó. Con un único activo, su fila sale idéntica a la de la estrategia;
                          // con varios, los porcentajes suman el de la estrategia. Antes cada modo
                          // usaba su propia base y ninguna de las dos cosas se cumplía.
                          const ganPct=capIniR>0?(a.ganComp/capIniR)*100:0
                          const cagr=capIniR>0&&anios>0?(Math.pow(Math.max((capIniR+a.ganComp)/capIniR,0.001),1/anios)-1)*100:0
                          const assetTrades=allT.filter(t=>t.symbol===a.symbol)
                          const sumWin=assetTrades.filter(t=>t.pnlSimple>0).reduce((s,t)=>s+t.pnlSimple,0)
                          const sumLoss=assetTrades.filter(t=>t.pnlSimple<0).reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
                          const fBenef=sumLoss>0?sumWin/sumLoss:(sumWin>0?999:0)
                          const maxDD=a.maxDD||0
                          // Seleccionar un activo hace dos cosas a la vez: fija la estrategia del
                          // historial a la suya —con la misma regla de siempre, escribir null si es
                          // la que ya resuelve "la activa"— y marca el activo, que es lo que dibuja
                          // el panel de rendimiento. Segundo clic en la misma fila deselecciona.
                          // Símbolo Y estrategia: el mismo ticker puede estar en dos estrategias
                          // desplegadas, y comparando solo el símbolo se resaltaban las dos filas y
                          // pulsar la de la otra deseleccionaba en vez de cambiar a esa estrategia.
                          const selecc=mcActivoSel?.symbol===a.symbol&&mcActivoSel?.stratId===r.id
                          const fondoFila=selecc?'rgba(0,212,255,0.10)':'rgba(0,0,0,0.12)'
                          return(
                            <tr key={a.symbol}
                              title={selecc?`Quitar la selección de ${a.symbol}`:`Ver el rendimiento de ${a.symbol} dentro de la cartera`}
                              style={{borderBottom:'1px solid rgba(255,255,255,0.02)',cursor:'pointer',
                                background:fondoFila}}
                              onClick={()=>{
                                if(selecc){setMcActivoSel(null);return}
                                // Con una sola estrategia la fila lleva un id sintético
                                // ('__single__' o el de la activa) que puede no estar en
                                // mcDisplayResults: escribirlo dejaría mcHistStratId apuntando a
                                // una fila inexistente. Ahí null, que es "la activa" y es lo que
                                // mcHistSel resuelve de todas formas cuando no hay varias.
                                const _enLista=mcDisplayResults.some(x=>x.id===r.id)
                                const _id=(!_enLista||r.id===mcHistIdPorDefecto)?null:r.id
                                setMcActivoSel({stratId:r.id,symbol:a.symbol})
                                // Nunca MC_TODAS: el panel del activo necesita UNA estrategia.
                                setMcHistStratId(_id)
                              }}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                              onMouseOut={e=>e.currentTarget.style.background=fondoFila}>
                              <td style={{padding:'4px 6px 4px 22px',color:'var(--accent)',
                                borderLeft:`2px solid ${selecc?'#00d4ff':r.color}`}}>
                                <span style={{marginRight:6}}>{a.symbol}</span>
                                {/* Ir al Watchlist: era el clic de toda la fila, que ahora selecciona.
                                    stopPropagation para que no haga las dos cosas a la vez. */}
                                <span role="button" title={`Abrir ${a.symbol} en Watchlist`}
                                  onClick={e=>{e.stopPropagation();setSimbolo(a.symbol);setSidePanel('watchlist')}}
                                  style={{marginRight:6,cursor:'pointer',color:'#4a7a9a',fontSize:9}}>↗</span>
                                {r.id==='__portfolio__'&&Array.isArray(a._stratBreakdown)&&
                                  a._stratBreakdown.map(b=>{
                                    const c=mcDisplayResults.find(x=>x.id===b.id)?.color||'#3d5a7a'
                                    return(<span key={b.id}
                                      title={`${b.name} · ${b.trades} ops`}
                                      style={{display:'inline-block',width:9,height:9,borderRadius:'50%',
                                        background:c,marginRight:3,verticalAlign:'middle',
                                        border:'1px solid rgba(0,0,0,0.3)'}}
                                    />)
                                  })
                                }
                              </td>
                              <td style={{padding:'4px 6px',color:'var(--text)'}}>{a.trades}</td>
                              <td style={{padding:'4px 6px',color:isFinite(cagr)?cagr>=0?'#00e5a0':'#ff4d6d':'#4a6a88'}}>{isFinite(cagr)?fmt(cagr,2,'%'):'—'}</td>
                              <td style={{padding:'4px 6px',color:a.ganComp>=0?'#00e5a0':'#ff4d6d'}}>{fmt(a.ganComp,0,'€')}</td>
                              <td style={{padding:'4px 6px',color:ganPct>=0?'#00e5a0':'#ff4d6d'}}>{fmt(ganPct,1,'%')}</td>
                              <td style={{padding:'4px 6px',color:a.winRate>=50?'#00e5a0':'#ff4d6d'}}>{fmt(a.winRate,1,'%')}</td>
                              <td style={{padding:'4px 6px',color:fBenef>=1.5?'#00e5a0':fBenef>=1?'#ffd166':'#ff4d6d'}}>{fmt(fBenef,2,'x')}</td>
                              <td style={{padding:'4px 6px',color:'#ff4d6d'}}>{fmtDDPct(maxDD)}</td>
                              <td style={{padding:'4px 6px',color:'#ff4d6d'}}>{a.maxDDEur<0?'-€'+Math.round(Math.abs(a.maxDDEur)).toLocaleString('es-ES'):'€0'}</td>
                              <td style={{padding:'4px 6px',color:'#7ab3cc'}}>{a.capInvMedioEur!=null?fmt(a.capInvMedioEur,0,'€'):'—'}</td>
                              <td style={{padding:'4px 6px',color:'#9acce0'}}>{fmt(a.capInvMedio??0,1,'%')}</td>
                              <td style={{padding:'4px 6px',color:'#9acce0'}}>{fmt(a.tInvertido??0,1,'%')}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                  {/* ── Fila B&H ── */}
                  {mcResult.bhCurve?.length>0&&(()=>{
                    const bhOpen=mcAssetOpen['__bh__']===true
                    const bhStats=mcResult.assetStats||[]
                    const bhWinCount=bhStats.filter(a=>a.ganBH>0).length
                    const bhWinPct=bhStats.length>0?bhWinCount/bhStats.length*100:0
                    return(
                      <Fragment key='__bh__'>
                        {/* Fila madre B&H */}
                        <tr
                          onClick={()=>setMcAssetOpen(v=>({...v,'__bh__':!bhOpen}))}
                          style={{borderTop:'1px solid rgba(160,180,200,0.2)',
                            background:'rgba(160,180,200,0.06)',cursor:'pointer'}}>
                          <td style={{padding:'5px 6px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontFamily:MONO,fontSize:9,color:'#7a8a9a',width:8,flexShrink:0}}>{bhOpen?'▼':'▶'}</span>
                              <div style={{width:7,height:7,borderRadius:2,background:'#a0b4c8',flexShrink:0}}/>
                              <span style={{color:'#a0b4c8',fontWeight:600,fontStyle:'italic'}}>B&H Diversif.</span>
                              <span data-etiqueta-copiar="" style={{fontFamily:MONO,fontSize:9,color:'#4a6a88',marginLeft:2}}>{bhStats.length} activos</span>
                            </div>
                          </td>
                          <td style={{padding:'5px 6px',color:'#a0b4c8'}}>{bhStats.length}</td>
                          <td style={{padding:'5px 6px',color:bhCagr>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhCagr,2,'%')}</td>
                          <td style={{padding:'5px 6px',color:bhProfit>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhProfit,0,'€')}</td>
                          <td style={{padding:'5px 6px',color:bhProfitPct>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhProfitPct,1,'%')}</td>
                          <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                          <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                          <td style={{padding:'5px 6px',color:'#ff9a3c',fontWeight:600}}>{fmtDDPct(mcResult.maxDDBH||0)}</td>
                          <td style={{padding:'5px 6px',color:'#ff9a3c',fontWeight:600}}>{mcResult.maxDDBHEur<0?'-€'+Math.round(Math.abs(mcResult.maxDDBHEur)).toLocaleString('es-ES'):'€0'}</td>
                          <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                          <td style={{padding:'5px 6px',color:'#9acce0'}}>100%</td>
                          <td style={{padding:'5px 6px',color:'#9acce0'}}>100%</td>
                        </tr>
                        {/* Subfilas B&H por activo */}
                        {bhOpen&&bhStats.map(a=>{
                          const ganBH=a.ganBH??0
                          const sc=mcResult.slotCapital||capIni
                          const ganBHPct=sc>0?(ganBH/sc)*100:0
                          const bhWin=a.ganBH>0?100:0
                          const bhLastDate=mcResult.compoundCurve?.slice(-1)[0]?.date||mcResult.bhCurve?.slice(-1)[0]?.date
                          const bhEndMs=bhLastDate?new Date(bhLastDate).getTime():Date.now()
                          // Misma base que la fila madre del B&H: primera fecha REAL de la curva. Antes contaba
                          // desde mcResult.startDate (la solicitada) aunque la madre ya usaba la curva.
                          const _bhInicio=mcInicioReal(mcResult)
                          const bhCagrYears=_bhInicio?(bhEndMs-new Date(_bhInicio).getTime())/(365.25*24*3600*1000):5
                          const bhCagr=sc>0&&bhCagrYears>0?(Math.pow((sc+ganBH)/sc,1/bhCagrYears)-1)*100:0
                          return(
                            <tr key={a.symbol}
                              style={{borderBottom:'1px solid rgba(255,255,255,0.02)',
                                background:'rgba(160,180,200,0.02)'}}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(160,180,200,0.06)'}
                              onMouseOut={e=>e.currentTarget.style.background='rgba(160,180,200,0.02)'}>
                              <td style={{padding:'4px 6px 4px 22px',color:'#a0b4c8',borderLeft:'2px solid #a0b4c888'}}>
                                {a.symbol}
                                {/* El B&H no se selecciona —no es una operación de la cartera—, pero
                                    conserva su ida al Watchlist, ahora en el mismo icono que arriba. */}
                                <span role="button" title={`Abrir ${a.symbol} en Watchlist`}
                                  onClick={e=>{e.stopPropagation();setSimbolo(a.symbol);setSidePanel('watchlist')}}
                                  style={{marginLeft:6,cursor:'pointer',color:'#4a7a9a',fontSize:9}}>↗</span>
                              </td>
                              <td style={{padding:'4px 6px',color:'#a0b4c8'}}>1</td>
                              <td style={{padding:'4px 6px',color:bhCagr>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(bhCagr,2,'%')}</td>
                              <td style={{padding:'4px 6px',color:ganBH>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(ganBH,0,'€')}</td>
                              <td style={{padding:'4px 6px',color:ganBHPct>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(ganBHPct,1,'%')}</td>
                              <td style={{padding:'4px 6px',color:'#4a6a88'}}>—</td>
                              <td style={{padding:'4px 6px',color:'#4a6a88'}}>—</td>
                              <td style={{padding:'4px 6px',color:'#ff9a3c'}}>{a.priceMaxDD>0?fmtDDPct(a.priceMaxDD):'—'}</td>
                              <td style={{padding:'4px 6px',color:'#ff9a3c'}}>{a.priceMaxDDEur<0?'-€'+Math.round(Math.abs(a.priceMaxDDEur)).toLocaleString('es-ES'):'—'}</td>
                              <td style={{padding:'4px 6px',color:'#7ab3cc'}}>{fmt(sc,0,'€')}</td>
                              <td style={{padding:'4px 6px',color:'#9acce0'}}>100%</td>
                              <td style={{padding:'4px 6px',color:'#9acce0'}}>100%</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
      </div>{/* ── fin de lo que hay encima del gráfico ── */}

      {/* ── Equity — misma estructura que activos individuales ── */}
      {/* En pantalla completa la sección se saca del flujo y cubre la ventana: se lleva consigo
          su cabecera —símbolo, estrategia, rendimiento, interruptores y periodo completo— y los
          dos gráficos, que son hijos suyos. Nada se desmonta: solo cambia dónde se dibuja.
          z-index 150: por ENCIMA de la barra de la aplicación, que es sticky con z-index 100,
          fondo casi opaco y backdrop-filter, y tapaba sus 33 px superiores —justo donde cae esta
          cabecera, que empieza con 16 px de padding—. Y por DEBAJO de 200, donde empiezan los
          diálogos, menús y avisos de la app, que deben seguir apareciendo sobre el overlay.
          La franja 100-200 estaba libre. */}
      <div className="equity-section" data-chart="equity"
        style={(mcPanelActivo&&mcPantallaCompleta)?{position:'fixed',inset:0,zIndex:150,
          background:'var(--bg)',padding:'0 12px 8px',overflow:'hidden',
          display:'flex',flexDirection:'column'}:undefined}>
        {/* Cabecera en DOS grupos. El de fuera NO envuelve: así el botón de periodo completo se
            queda siempre en la primera línea, pegado a la derecha, sin necesidad del marginLeft
            automático de antes. Todo lo demás vive en el grupo izquierdo, que es quien envuelve
            —flex:1 para ocupar el hueco y minWidth:0 para poder encogerse—, de modo que los
            toggles de series caen a una segunda línea DENTRO del grupo y no desplazan nada. */}
        {/* flexShrink:0 en pantalla completa: el contenedor es flex-column y, si el contenido se
            pasa de alto, encogería también la cabecera —que tiene 16 px de padding superior— y
            la cortaría por arriba. La cabecera manda su alto; lo que se ajusta son los gráficos. */}
        <div ref={mcHeaderRef} className="section-title"
          style={{display:'flex',alignItems:'flex-start',gap:6,fontSize:14,
            ...((mcPanelActivo&&mcPantallaCompleta)?{flexShrink:0}:{})}}>
          <div style={{display:'flex',alignItems:'flex-start',flexWrap:'wrap',gap:6,flex:1,minWidth:0}}>
          {/* Con un activo seleccionado, el área del gráfico grande pasa a ser suya y la cabecera
              lo dice. Los controles del equity —conmutador, Flotante, impuestos, toggles— se
              ocultan en bloque: no gobiernan nada mientras no se dibuja el equity. Al quitar la
              selección vuelven tal cual estaban, en el mismo modo, porque su estado no se toca. */}
          {mcPanelActivo?(<>
            <span>Operaciones</span>
            <span style={{display:'inline-flex',alignItems:'center',gap:5,fontFamily:MONO,fontSize:11,
              fontWeight:600,color:mcCurvaActivoSel[0].color}}>
              <span style={{width:8,height:8,borderRadius:2,background:mcCurvaActivoSel[0].color}}/>
              {mcActivoSel.symbol}
            </span>
            <span style={{fontFamily:MONO,fontSize:10,fontWeight:400,color:'#8aadcc',alignSelf:'center'}}>
              {mcNombreStratSel}
            </span>
            {(()=>{
              const d=mcCurvaActivoSel[0].data
              const fin=d[d.length-1]?.value??0
              return(
                <span title="Rendimiento del dinero que la cartera tuvo invertido en este activo"
                  style={{fontFamily:MONO,fontSize:12,fontWeight:700,alignSelf:'center',
                    color:fin>=0?'#00e5a0':'#ff4d6d'}}>
                  {fin>=0?'+':''}{fmt(fin,1,'%')}
                </span>
              )
            })()}
            {/* Leyenda de los indicadores. Va aquí y no en el gráfico porque
                lightweight-charts flota el título de cada serie junto a su último punto, en
                medio del área y encima de las velas. Aquí se lee de una vez y no tapa nada. */}
            {mcIndicadoresActivo?.map(ind=>(
              <span key={ind.name+ind.color} title={ind.name}
                style={{display:'inline-flex',alignItems:'center',gap:4,alignSelf:'center',
                  fontFamily:MONO,fontSize:10,fontWeight:400,color:ind.color}}>
                <span style={{width:10,height:2,borderRadius:1,background:ind.color,flexShrink:0}}/>
                {ind.name||'—'}
              </span>
            ))}
            {/* Si el detalle falló, se dice. Discreto pero visible: las velas y las operaciones
                no dependen de esto, así que no hay nada que bloquear, pero tampoco puede
                desaparecer sin dejar rastro. */}
            {mcDetalleActivo?.error&&(
              <span title={mcDetalleActivo.error}
                style={{fontFamily:MONO,fontSize:9,fontWeight:400,alignSelf:'center',cursor:'help',
                  padding:'2px 6px',borderRadius:3,color:'#ffd166',
                  background:'rgba(255,209,102,0.10)',border:'1px solid rgba(255,209,102,0.3)',
                  maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                ⚠ sin indicadores: {mcDetalleActivo.error}
              </span>
            )}
            {/* Los dos interruptores del detalle. Encendidos por defecto; si el detalle no
                llegó —la fila de Multicartera no tiene UNA estrategia, o la petición falló—
                se deshabilitan en vez de desaparecer, para que se vea que no hay nada. */}
            {[{on:mcVerIndicadores,set:setMcVerIndicadores,etq:'Indicadores',col:'#ffd166',
                hay:!!mcDetalleActivo?.indicators&&Object.keys(mcDetalleActivo.indicators).length>0},
              {on:mcVerFranjas,set:setMcVerFranjas,etq:'Filtro',col:'#ff5050',
                hay:!!mcDetalleActivo?.filterZones?.length},
              // Las etiquetas no dependen del detalle: salen de las propias operaciones, que
              // siempre están, así que este va habilitado mientras haya alguna.
              {on:mcVerEtiquetas,set:setMcVerEtiquetas,etq:'Etiquetas',col:'#00d4ff',
                hay:mcTradesActivoSel.length>0}].map(({on,set,etq,col,hay})=>(
              <button key={etq} onClick={()=>hay&&set(v=>!v)} disabled={!hay}
                title={hay?(on?`Ocultar ${etq.toLowerCase()}`:`Mostrar ${etq.toLowerCase()}`)
                  :`Sin ${etq.toLowerCase()} para esta selección`}
                style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,alignSelf:'center',
                  cursor:hay?'pointer':'not-allowed',
                  border:`1px solid ${hay&&on?col:'#24384d'}`,
                  background:hay&&on?`${col}18`:'transparent',
                  color:hay?(on?col:'#3d5a7a'):'#2b4257'}}>
                {etq}
              </button>
            ))}
            <button onClick={()=>setMcPantallaCompleta(v=>!v)}
              title={mcPantallaCompleta?'Salir de pantalla completa (Escape)':'Ver a pantalla completa'}
              style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                alignSelf:'center',border:`1px solid ${mcPantallaCompleta?'#00d4ff':'#1a2d45'}`,
                background:mcPantallaCompleta?'rgba(0,212,255,0.12)':'transparent',
                color:mcPantallaCompleta?'#00d4ff':'#7a9bc0'}}>
              {mcPantallaCompleta?'⤡ Salir':'⤢ Pantalla completa'}
            </button>
            <button onClick={()=>setMcActivoSel(null)} title="Volver al gráfico de equity"
              style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                border:'1px solid #1a2d45',background:'transparent',color:'#7a9bc0',alignSelf:'center'}}>
              ✕
            </button>
          </>):(<>
          {/* El rótulo lo decide el mismo conmutador: en Activos no se dibuja patrimonio sino
              beneficio, empezando todas las series en cero. La clase pone las mayúsculas. */}
          <span>{mcPorActivo?'Profit':'Equity'}</span>
          {/* Qué estrategia se está dibujando. Con varias, la lista es LA MISMA que ofrece el
              historial de operaciones (mcDisplayResults) y escribe en el MISMO estado
              (mcHistStratId): elegir aquí mueve el historial y elegir allí mueve el gráfico, sin
              una segunda lista que pueda divergir. Elegir la que hoy es "la activa" escribe null,
              no su id, para no congelar lo que es dinámico. Con una sola estrategia no hay nada
              que elegir, así que va el nombre a secas. */}
          {mcPorActivo&&(mcHistSel.isMultiHist?(
            <select value={mcHistIdVigente}
              onChange={e=>{
                const v=e.target.value
                // Elegir "todas" desde aquí sale del modo Activos, que necesita UNA estrategia.
                // mcPonerEstrategia ya apaga el modo Activos al volver a TODAS.
                mcPonerEstrategia(v===MC_TODAS?MC_TODAS:(v===mcHistIdPorDefecto?null:v))
              }}
              title="Estrategia que se está dibujando. Es la misma del historial de operaciones."
              style={{background:'#0d1520',border:'1px solid #1a2d45',color:'#8aadcc',fontFamily:MONO,
                fontSize:10,fontWeight:400,padding:'1px 4px',borderRadius:3,cursor:'pointer',maxWidth:200}}>
              <option value={MC_TODAS}>Todas las estrategias</option>
              {mcDisplayResults.map(r=>(<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
          ):(
            <span style={{fontFamily:MONO,fontSize:10,fontWeight:400,color:'#8aadcc',alignSelf:'center'}}>
              {mcDisplayResults[0]?.name||mcSingleStratName}
            </span>
          ))}
          {/* Conmutador Estrategias / Activos. En Activos se dibuja la contribución de cada
              activo de la estrategia vigente en el historial (mcHistSel), más la caja. Si el
              resultado en memoria no trae assetCurves —por ejemplo uno anterior a V9.760— el
              conmutador queda deshabilitado y el modo Estrategias sigue igual. */}
          <div style={{display:'flex',border:'1px solid #1a2d45',borderRadius:3,overflow:'hidden'}}
            title={mcCurvasActivos?'':'Este resultado no trae las series por activo: vuelve a ejecutar el backtest'}>
            {[['Estrategias',false],['Activos',true]].map(([etq,val])=>(
              <button key={etq} disabled={val&&!mcCurvasActivos}
                onClick={()=>{
                  // El modo Activos dibuja la contribución de UNA estrategia. Desde "todas" hay
                  // que concretar, o el gráfico enseñaría datos de una que el selector no indica.
                  if(val&&mcTodasStrats&&mcPrimeraStrat) setMcHistStratId(mcPrimeraStrat)
                  setMcPorActivo(val)
                }}
                style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',border:'none',
                  cursor:(val&&!mcCurvasActivos)?'not-allowed':'pointer',
                  background:mcPorActivo===val?'rgba(0,212,255,0.14)':'transparent',
                  color:(val&&!mcCurvasActivos)?'#2b4257':(mcPorActivo===val?'#00d4ff':'#3d5a7a')}}>
                {etq}
              </button>
            ))}
          </div>
          {mcPorActivo?(
            // En Activos no hay B&H que comparar ni curva sin flotar: las contribuciones ya van
            // a precio de mercado. El botón se deshabilita en vez de desaparecer.
            <button disabled title="Las contribuciones por activo ya van a precio de mercado"
              style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'not-allowed',
                border:'1px solid #24384d',background:'transparent',color:'var(--text3)'}}>
              Flotante
            </button>
          ):mcDisplayResults.length>1?(
            <>
              {mcDisplayResults.map(r=>(
                <div key={r.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <button onClick={()=>setMcStratVisible(v=>({...v,[r.id]:!v[r.id]}))}
                  style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${mcStratVisible[r.id]!==false?r.color:'var(--text3)'}`,
                    background:mcStratVisible[r.id]!==false?`${r.color}18`:'transparent',
                    color:mcStratVisible[r.id]!==false?r.color:'var(--text3)',
                    ...(mcIsModoCompare?{}:{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})}}>
                  {mcIsModoCompare?r.name.split(' · ').pop():r.name}
                </button>
                {mcShowAfterTax&&mcAfterTax&&renderTaxBlock(mcTaxSummaryFor(mcAfterTax.compoundById[r.id],mcAfterTax.totalTaxById[r.id]))}
                </div>
              ))}
              {mcResult.bhCurve?.length>0&&(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <button onClick={()=>setMcShowBHCompare(s=>!s)}
                  style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${mcShowBHCompare?'#a0b4c8':'#3d5a7a'}`,
                    background:mcShowBHCompare?'rgba(160,180,200,0.12)':'transparent',
                    color:mcShowBHCompare?'#a0b4c8':'#3d5a7a'}}>
                  B&H Diversif.
                </button>
                {mcShowAfterTax&&mcAfterTax&&renderTaxBlock(mcTaxSummaryFor(mcAfterTax.bh,mcAfterTax.bhTotalTax))}
                </div>
              )}
              {mcResult.sp500BHCurve?.length>0&&(
                <button onClick={()=>setMcShowSP500(s=>!s)}
                  style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${mcShowSP500?'#9b72ff':'#3d5a7a'}`,
                    background:mcShowSP500?'rgba(155,114,255,0.12)':'transparent',
                    color:mcShowSP500?'#9b72ff':'#3d5a7a'}}>
                  B&H SP500
                </button>
              )}
              <button onClick={()=>setMcShowMaxDD(s=>!s)}
                style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                  border:`1px solid ${mcShowMaxDD?'#ff4d6d':'#3d5a7a'}`,
                  background:mcShowMaxDD?'rgba(255,77,109,0.12)':'transparent',
                  color:mcShowMaxDD?'#ff4d6d':'#3d5a7a'}}>
                Max DD
              </button>
            </>
          ):(
            [
              // Vista Simple retirada del multibacktest (V9.562): solo Compuesto. El botón rotula con
              // mcSingleStratName —misma fuente que la tabla y la leyenda—, que prioriza la estrategia
              // SELECCIONADA sobre la activa global. Este punto se quedó fuera de V9.710 y por eso el
              // botón seguía mostrando la del selector superior aunque se hubiera ejecutado otra.
              // La cascada posterior queda como red de seguridad: hoy es inalcanzable porque
              // mcSingleStratName ya trae su propio fallback ('Estrategia activa').
              {key:'compound',label:(mcSingleStratName||(mcDisplayResults[0]?.name||'').split(' · ')[0]||'Compuesto'),color:'#00e5a0',state:mcShowCompound,set:setMcShowCompound},
              {key:'bh',      label:'B&H Diversificado',color:'#a0b4c8',state:mcShowBH,      set:setMcShowBH},
              {key:'sp500',   label:'B&H SP500',        color:'#9b72ff',state:mcShowSP500,   set:setMcShowSP500},
              ...(mcResult.universo?[
                {key:'qqq',label:'B&H QQQ',color:'#ffd166',state:mcShowQQQ,set:setMcShowQQQ},
                {key:'bhu',label:'B&H universo',color:'#ff7eb6',state:mcShowBHUniv,set:setMcShowBHUniv},
              ]:[]),
              {key:'fl',      label:'Flotante',         color:'#ff9a3c',state:showMultiFloat, set:setShowMultiFloat},
            ].map(({key,label,color,state,set})=>(
              <button key={key} onClick={()=>set(s=>!s)}
                style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                  border:`1px solid ${state?color:'var(--text3)'}`,background:state?`${color}18`:'transparent',color:state?color:'var(--text3)'}}>
                {label}
              </button>
            ))
          )}
          <button onClick={()=>setMcShowAfterTax(s=>!s)} disabled={mcPorActivo}
            title={mcPorActivo?"El impuesto se simula sobre la curva de la estrategia, no sobre la contribución de cada activo":"Simula el IRPF de la base del ahorro (cálculo 2). Estrategias: el impuesto de cada año sobre las ganancias realizadas sale de la cartera el primer día del año siguiente (lo pagado deja de invertirse; aproximación proporcional). Buy&hold: impuesto único al final. Tramos progresivos 19%-28%. Las pérdidas compensan ganancias de los 4 años siguientes."}
            style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:mcPorActivo?'not-allowed':'pointer',
              border:`1px solid ${mcPorActivo?'#24384d':(mcShowAfterTax?'#e0b341':'#3d5a7a')}`,
              background:(!mcPorActivo&&mcShowAfterTax)?'rgba(224,179,65,0.14)':'transparent',
              color:mcPorActivo?'#2b4257':(mcShowAfterTax?'#e0b341':'#3d5a7a')}}>
            Después de impuestos (cálculo 2)
          </button>
          {/* Toggles de series del modo Activos, en la MISMA fila que los botones y detrás de
              un separador fino, porque son otra cosa: no cambian qué se calcula sino qué se ve.
              Van sueltos, no dentro de un contenedor propio, para que envuelvan en el mismo
              flujo que los botones y no se lleven una línea entera cuando caben. Cada uno lleva
              el color de su línea: es la única forma de saber qué curva es cuál. */}
          {mcPorActivo&&mcSeriesActivos&&(<>
            <span style={{width:1,height:16,alignSelf:'center',background:'#1a2d45',margin:'0 2px',flexShrink:0}}/>
            {mcSeriesActivos.map(c=>{
              const visible=mcVisibleActivo(mcActivoVisible,c.id)
              return (
                <button key={c.id}
                  onClick={()=>setMcActivoVisible(v=>({...v,[c.id]:!mcVisibleActivo(v,c.id)}))}
                  title={visible?`Ocultar ${c.name}`:`Mostrar ${c.name}`}
                  style={{display:'inline-flex',alignItems:'center',gap:5,fontFamily:MONO,fontSize:10,
                    padding:'2px 7px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${visible?c.color:'var(--text3)'}`,
                    background:visible?`${c.color}18`:'transparent',
                    color:visible?c.color:'var(--text3)'}}>
                  <span style={{width:8,height:8,borderRadius:2,flexShrink:0,
                    background:visible?c.color:'transparent',border:`1px solid ${visible?c.color:'var(--text3)'}`}}/>
                  {c.name}
                </button>
              )
            })}
          </>)}
          </>)}
          </div>
          {/* El mismo botón sirve a lo que haya: con selección devuelve los dos gráficos del panel
              al periodo del backtest, que es su "todo". */}
          <button onClick={()=>{
              if(mcPanelActivo){
                mcAjustaRangoPanel()
              }else{
                mcChartApiRef.current?.fitAll()
              }
            }}
            style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(0,212,255,0.07)',color:'#7a9bc0',flexShrink:0}}
            title="Ver periodo completo">⊠ Periodo completo</button>
        </div>
        <div ref={mcEquityContainerRef} style={{position:'relative'}}>
        {/* Con un activo seleccionado, este hueco es suyo: arriba sus velas con las operaciones
            EJECUTADAS por la estrategia, abajo una franja con su rendimiento dentro de la cartera.
            Las velas se llevan el hueco ENTERO —de su borde superior al fondo de la ventana, con su
            eje de años abajo del todo— y la franja va después, fuera de la vista inicial, igual que
            las ganancias mensuales o el historial: se alcanza bajando.
            Los dos gráficos NO están sincronizados entre sí, y es una decisión, no un olvido:
            AssetSignalChart sincroniza por rango LÓGICO —índices de vela— y StratCompareChart por
            rango de FECHAS, y sus ejes no son el mismo: uno tiene una vela diaria por barra y el
            otro ~400 fechas muestreadas. El índice 50 no significa lo mismo en los dos, así que
            encajarlos exigiría reescribir el protocolo de sincronía de ambos componentes. Y en una
            sola dirección tampoco: StratCompareChart no expone su chart —solo fitAll y el ancho del
            eje—, así que nada de fuera puede mover su escala de tiempo. En su lugar, los dos
            arrancan acotados al periodo del backtest, que es la parte que importa. */}
        {mcPanelActivo?(()=>{
          // Reparto del alto. El header propio de las velas se descuenta primero: lo que se mide en
          // mcEquityH es el hueco desde el borde del contenedor, y ese header está dentro.
          // FUERA DE PANTALLA COMPLETA las velas se llevan el hueco entero y la franja va debajo con
          // alto propio, así que los dos ya NO suman mcEquityH: el panel sigue hacia abajo a
          // propósito. El suelo de SUELO_EQUITY no estorba aquí —solo levanta el valor cuando la
          // tabla ha empujado el gráfico hasta dejarlo minúsculo, y nunca lo recorta cuando hay
          // sitio, porque es un Math.max—.
          // EN PANTALLA COMPLETA se conserva el 75/25: el overlay es overflow:hidden y no hay nada
          // debajo a lo que bajar, así que la franja tiene que caber dentro.
          const ALTO_CABECERA_VELAS=30
          const util=Math.max(180,mcEquityH-ALTO_CABECERA_VELAS)
          const hVelas=mcPantallaCompleta?Math.round(util*0.75):util
          const hCurva=mcPantallaCompleta?util-hVelas:ALTO_FRANJA_RENDIMIENTO
          return(
            <div>
              <AssetSignalChart symbol={mcActivoSel.symbol}
                stratSignals={mcSignalsActivoSel}
                years={mcAniosVelas}
                height={hVelas}
                rangoVisible={mcRangoBacktest}
                intervalo={mcIntervalo}
                verEtiquetas={mcVerEtiquetas}
                indicadores={mcIndicadoresActivo}
                zonasFiltro={mcZonasActivo}
                onReady={({chart})=>{mcPanelVelasRef.current=chart}}/>
              {/* Referencia en 0: la curva es rendimiento, no patrimonio. */}
              <StratCompareChart curves={mcCurvaActivoSel} capitalIni={0} showMaxDD={false}
                chartHeight={hCurva} formato="pct"
                syncRef={mcPanelSyncRef}
                onReady={api=>{mcPanelCurvaRef.current=api}}/>
            </div>
          )
        })():mcPorActivo&&mcCurvasActivos?(
          <StratCompareChart
            curves={mcCurvasActivos}
            capitalIni={mcRefEquity}
            showMaxDD={false}
            onReady={api=>{mcChartApiRef.current=api}}
            onAxisWidth={w=>setMcAxisW(prev=>Math.abs(prev-w)>0.5?w:prev)}
            syncRef={chartSyncRef}
            chartHeight={mcEquityH}
          />
        ):mcDisplayResults.length>1?(
          <StratCompareChart
            curves={[
              ...mcDisplayResults.map(r=>({
                id:r.id,name:r.name,color:r.color,
                data:(mcAfterTax&&mcAfterTax.compoundById[r.id])?mcAfterTax.compoundById[r.id]
                  :(showMultiFloat&&r.result.floatCompoundCurve?.length)?r.result.floatCompoundCurve:r.result.compoundCurve,
                show:mcStratVisible[r.id]!==false,
                maxDD:showMultiFloat?(r.result.maxDDFloatCompound||0):(r.result.maxDDCompound||0),
                maxDDDate:showMultiFloat?r.result.maxDDFloatCompoundDate:r.result.maxDDCompoundDate,
                taxByDate:mcAfterTax?.taxByDateById[r.id]||null,
              })),
              ...(mcResult.bhCurve?.length>0?[{
                id:'__bh__',name:'B&H Diversificado',color:'#a0b4c8',
                data:mcAfterTax?mcAfterTax.bh:mcResult.bhCurve,
                show:mcShowBHCompare,
                dashed:true,
                maxDD:mcResult.maxDDBH||0,
                maxDDDate:mcResult.maxDDBHDate||null,
                taxByDate:mcAfterTax?.bhTaxByDate||null,
              }]:[]),
              ...(mcResult.sp500BHCurve?.length>0?[{
                id:'__sp500__',name:'B&H SP500',color:'#9b72ff',
                data:mcResult.sp500BHCurve,
                show:mcShowSP500,
                dashed:true,
                maxDD:mcResult.maxDDSP500||0,
                maxDDDate:mcResult.maxDDSP500Date||null,
                taxByDate:null,
              }]:[])
            ]}
            afterTax={!!mcAfterTax}
            capitalIni={mcRefEquity}
            showMaxDD={mcShowMaxDD}
            onReady={api=>{mcChartApiRef.current=api}}
            onAxisWidth={w=>setMcAxisW(prev=>Math.abs(prev-w)>0.5?w:prev)}
            syncRef={chartSyncRef}
            chartHeight={mcEquityH}
          />
        ):(
          <MultiCartChart
            simpleCurve={mcResult.simpleCurve}
            compoundCurve={(mcAfterTax&&mcAfterTax.compoundById['__single__'])?mcAfterTax.compoundById['__single__']:mcResult.compoundCurve}
            bhCurve={mcAfterTax?mcAfterTax.bh:mcResult.bhCurve}
            afterTax={!!mcAfterTax}
            taxByDateCompound={mcAfterTax?.taxByDateById['__single__']||null}
            taxByDateBH={mcAfterTax?.bhTaxByDate||null}
            sp500BHCurve={mcResult.sp500BHCurve||[]}
            extraCurves={mcCurvasUniverso}
            capitalIni={Number(mcCapitalIni||capitalIni)}
            maxDDSimple={mcResult.maxDDSimple}   maxDDSimpleDate={mcResult.maxDDSimpleDate}
            maxDDCompound={mcResult.maxDDCompound} maxDDCompoundDate={mcResult.maxDDCompoundDate}
            maxDDBH={mcResult.maxDDBH}           maxDDBHDate={mcResult.maxDDBHDate}
            maxDDSP500={mcResult.maxDDSP500||0}  maxDDSP500Date={mcResult.maxDDSP500Date||null}
            floatSimpleCurve={mcResult.floatSimpleCurve||[]}
            floatCompoundCurve={(mcAfterTax&&mcAfterTax.compoundById['__single__'])?mcAfterTax.compoundById['__single__']:(mcResult.floatCompoundCurve||[])}
            showFloat={showMultiFloat}
            maxDDFloatSimple={mcResult.maxDDFloatSimple||0}      maxDDFloatSimpleDate={mcResult.maxDDFloatSimpleDate||null}
            maxDDFloatCompound={mcResult.maxDDFloatCompound||0}  maxDDFloatCompoundDate={mcResult.maxDDFloatCompoundDate||null}
            showSimple={mcShowSimple} showCompound={mcShowCompound}
            showBH={mcShowBH} showSP500={mcShowSP500}
            onReady={api=>{mcChartApiRef.current=api}}
            onAxisWidth={w=>setMcAxisW(prev=>Math.abs(prev-w)>0.5?w:prev)}
            syncRef={chartSyncRef}
            chartHeight={mcEquityH}
          />
        )}
        {mcDisplayResults.length<=1&&mcShowAfterTax&&mcAfterTax&&(
          <div style={{position:'absolute',top:8,left:8,zIndex:5,pointerEvents:'none',background:'rgba(10,20,35,0.82)',border:'1px solid #2a3f55',borderRadius:6,padding:'5px 9px',fontFamily:MONO,fontSize:9,lineHeight:1.5,color:'#aab8c6'}}>
            <div>{fmtTaxLine('Estrategia',mcTaxSummaryFor(mcAfterTax.compoundById['__single__'],mcAfterTax.totalTaxById['__single__']))}</div>
            <div>{fmtTaxLine('B&H',mcTaxSummaryFor(mcAfterTax.bh,mcAfterTax.bhTotalTax))}</div>
          </div>
        )}
        </div>
      </div>

      {/* ── Ganancias mensuales MC ── */}
      {(()=>{
        const capIniNum=Number(mcCapitalIni||capitalIni)
        // Sin activo seleccionado, este bloque seguía pintando TODAS las estrategias mientras
        // los de al lado ya seguían a la activa. Mismo filtro que ellos, mismo estado.
        let mSeries=mcDisplayResults.length>0
          ?mcDisplayResults.filter(r=>mcStratVisible[r.id]!==false).filter(r=>mcEsStratActiva(r.id)).map(r=>({
              id:r.id,name:mcIsModoCompare?r.name.split(' · ').pop():r.name,
              color:r.color,compoundCurve:r.result.compoundCurve}))
          :[{id:'single',name:'Estrategia',color:'#00e5a0',compoundCurve:mcResult.compoundCurve}]
        // Añadir B&H cuando su toggle está activo
        if(mcDisplayResults.length>1&&mcShowBHCompare&&mcResult.bhCurve?.length)
          mSeries=[...mSeries,{id:'__bh__',name:'B&H Diversif.',color:'#a0b4c8',compoundCurve:mcResult.bhCurve}]
        else if(mcDisplayResults.length===0&&mcShowBH&&mcResult.bhCurve?.length)
          mSeries=[...mSeries,{id:'__bh__',name:'B&H Diversif.',color:'#a0b4c8',compoundCurve:mcResult.bhCurve}]
        // Con un activo seleccionado manda SU curva. assetCurves es contribución acumulada en
        // euros y arranca en cero, así que se le suma el capital inicial para que el componente
        // —que compara cada mes con el anterior y el primero con capitalIni— mida el mismo
        // incremento mensual que mediría sobre una curva de patrimonio.
        const _symSelM=mcActivoSel?.symbol
        const _curvaAct=_symSelM
          ?(mcHistSel.histResult?.assetCurves||[]).find(a=>a.symbol===_symSelM)?.data
          :null
        if(_symSelM&&_curvaAct?.length){
          const serieAct=[{id:`activo__${_symSelM}`,name:_symSelM,
            color:mcCurvaActivoSel?.[0]?.color||'#00d4ff',
            compoundCurve:_curvaAct.map(p=>({date:p.date,value:capIniNum+p.value}))}]
          return <div data-chart="monthly"><div style={{width:'calc(100% - 21px)',marginLeft:0}}>
            <McMonthlyGainsChart series={serieAct} capitalIni={capIniNum} syncRef={chartSyncRef} axisWidth={mcAxisW}
              soloEuros
              nota={{texto:`solo ${_symSelM} · importes aproximados`,
                detalle:'La curva por activo se dibuja sobre un eje reducido de ~400 fechas, así que el reparto por meses toma el primer y el último punto disponibles de cada mes y los importes no son exactos.'}}/>
          </div></div>
        }
        if(!mSeries.some(s=>s.compoundCurve?.length)) return null
        return <div data-chart="monthly"><div style={{width:'calc(100% - 21px)',marginLeft:0}}><McMonthlyGainsChart series={mSeries} capitalIni={capIniNum} syncRef={chartSyncRef} axisWidth={mcAxisW}/></div></div>
      })()}

      {/* ── Capital empleado MC — multi-series por estrategia ── */}
      {mcResult.occupancyCurve?.length>0&&(
        <div data-chart="occupancy" style={{borderTop:'1px solid var(--border)'}}>
          <div style={{padding:'3px 12px 2px',display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:11}}>
            <span style={{color:'#00e5a0',fontWeight:600}}>
              Capital empleado
            </span>
            {/* Este bloque sigue a la estrategia activa pero NO se desglosa por activo: la
                ocupación por activo no viaja en la respuesta. Con un activo seleccionado hay
                que decirlo, o se leería como si fuera suya. */}
            {mcActivoSel&&(
              <span title="La ocupación de capital viaja por estrategia, no por activo: este gráfico es el de la cartera completa de la estrategia activa."
                style={{fontFamily:MONO,fontSize:9,fontWeight:400,cursor:'help',padding:'1px 6px',
                  borderRadius:3,color:'#7a9bc0',background:'rgba(122,155,192,0.08)',border:'1px solid #1a2d45'}}>
                cartera completa · no filtra por {mcActivoSel.symbol}
              </span>
            )}
          </div>
          <div style={{width:'calc(100% - 21px)',marginLeft:0}}>
          <McOccupancyChart
            series={mcDisplayResults.length>0
              ?mcDisplayResults.filter(r=>mcStratVisible[r.id]!==false).filter(r=>mcEsStratActiva(r.id)).map(r=>({
                  id:r.id,color:r.color,
                  occupancyCurve:r.result.occupancyCurve,
                  compoundCurve:r.result.compoundCurve,
                }))
              :[{id:'single',color:'#00e5a0',
                  occupancyCurve:mcResult.occupancyCurve,
                  compoundCurve:mcResult.compoundCurve}]
            }
            capitalIni={Number(mcCapitalIni||capitalIni)}
            syncRef={chartSyncRef}
            axisWidth={mcAxisW}
          />
          </div>
        </div>
      )}

      {/* Tabla por activo — fusionada en COMPARATIVA DE ESTRATEGIAS */}

      {/* Barras de resultados multicartera — N gráficos apilados si múltiples estrategias */}
      {mcDisplayResults.length>1
        ? (mcDisplayResults.some(r=>mcStratVisible[r.id]!==false&&r.result.allTrades?.length>0)&&(
            <div className="equity-section">
              <div className="section-title" style={{display:'flex',alignItems:'center',gap:8,fontSize:14}}>
                <span>Resultados por Operación</span>
                {/* Por defecto solo la estrategia activa, como el resto del panel. Pero comparar
                    cómo le fue a cada una con el MISMO activo es justo lo que este bloque hace
                    bien, así que el interruptor está a un clic. */}
                <button onClick={()=>setMcResOpTodas(v=>!v)}
                  title={mcResOpTodas?'Ver solo la estrategia activa':'Comparar todas las estrategias'}
                  style={{fontFamily:MONO,fontSize:10,fontWeight:400,padding:'2px 7px',borderRadius:3,
                    cursor:'pointer',border:`1px solid ${mcResOpTodas?'#00d4ff':'#1a2d45'}`,
                    background:mcResOpTodas?'rgba(0,212,255,0.12)':'transparent',
                    color:mcResOpTodas?'#00d4ff':'#7a9bc0'}}>
                  {mcResOpTodas?'Todas las estrategias':'Solo la activa'}
                </button>
              </div>
              {mcDisplayResults
                .filter(r=>mcStratVisible[r.id]!==false)
                .filter(r=>mcResOpTodas||mcEsStratActiva(r.id))
                .map(r=>{
                  const trades=mcSoloActivoSel(r.result.allTrades||[])
                  if(!trades.length) return null
                  // mx SOBRE EL CONJUNTO QUE SE PINTA: con el máximo de la cartera entera, las
                  // barras de un solo activo saldrían diminutas. La escala deja de ser
                  // comparable entre activos, que es el precio de que cada una se lea.
                  const mx=Math.max(...trades.map(x=>Math.abs(x.pnlSimple??0)),1)
                  return(
                    <div key={r.id} style={{marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:r.color}}/>
                        <span style={{fontSize:9,fontWeight:600,letterSpacing:'0.08em',color:r.color,textTransform:'uppercase'}}>
                          Resultados por Operación · {mcIsModoCompare?r.name.split(' · ').pop():r.name}
                        </span>
                        <span style={{fontSize:9,color:'#4a6a88'}}>· P&L en € · clic = ir al trade</span>
                      </div>
                      <div className="equity-bars" style={{gap:huecoBarras(trades.length)}}>
                        {trades.map((t,i)=>{
                          const pnlS=t.pnlSimple??0
                          return(
                          <div key={i} className="equity-bar"
                            style={{height:Math.max(4,Math.abs(pnlS)/mx*56),background:pnlS>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                            onClick={()=>{const mcDivRef=document.querySelector('.mc-scroll');if(mcDivRef)mcDivRef.scrollTo({top:0,behavior:'smooth'})}}
                            onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseOut={e=>e.currentTarget.style.opacity='1'}
                            title={`${t.symbol||''} · ${fmtDate(t.exitDate)}: ${pnlS>=0?'+':''}${fmt(pnlS,0)}€ (${t.pnlPct>=0?'+':''}${fmt(t.pnlPct,2)}%)`}/>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              }
            </div>
          ))
        : (mcResult.allTrades?.length>0&&(
            <div className="equity-section">
              <div className="section-title" style={{fontSize:14}}>
                Resultados por Operación <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· P&L en € · clic = ir al trade</span>
              </div>
              <div className="equity-bars" style={{gap:huecoBarras(mcSoloActivoSel(mcResult.allTrades||[]).length)}}>
                {(()=>{
                  const allT=mcSoloActivoSel(mcResult.allTrades||[])
                  // mx sobre el conjunto filtrado, por el mismo motivo que arriba.
                  const mx=Math.max(...allT.map(x=>Math.abs(x.pnlSimple??0)),1)
                  return allT.map((t,i)=>{
                    const pnlS=t.pnlSimple??0
                    return(
                      <div key={i} className="equity-bar"
                        style={{height:Math.max(4,Math.abs(pnlS)/mx*56),background:pnlS>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                        onClick={()=>{
                          const mcDivRef=document.querySelector('.mc-scroll')
                          if(mcDivRef)mcDivRef.scrollTo({top:0,behavior:'smooth'})
                        }}
                        onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                        onMouseOut={e=>e.currentTarget.style.opacity='1'}
                        title={`${t.symbol||''} · ${fmtDate(t.exitDate)}: ${pnlS>=0?'+':''}${fmt(pnlS,0)}€ (${t.pnlPct>=0?'+':''}${fmt(t.pnlPct,2)}%)`}/>
                    )
                  })
                })()}
              </div>
            </div>
          ))
      }

      {/* Historial combinado — same style as individual */}
      {(()=>{
        // Resolución PROPIA (ver mcHistUno): este bloque nunca ve TODAS. DEFAULT del historial
        // = resultado del MODO DE ASIGNACIÓN REAL, no el run individual. Con varias estrategias
        // prefiere __portfolio__ sobre mcResult, y mcHistStratId permite elegir una.
        const {isMultiHist,histResult,histTitle}=mcHistUno
        if(!histResult?.allTrades?.length) return null
        // handleRequestDiscarded para el Gantt de este historial
        const handleGanttDiscarded=async()=>{
          setGanttLoadingDisc(true)
          try{
            const allTH=histResult.allTrades||[]
            // El periodo viaja SIEMPRE como desde/hasta: «ultimos N años» se traduce aqui, en el cliente,
            // para que el servidor tenga un solo camino. `years` se sigue mandando solo en modo Años, que es
            // lo que distingue «he pedido 5 años» de «he pedido este rango» en los avisos de histórico.
            const _mcPer=rangoDePeriodo({modo:mcPeriodMode,years:mcYears,desde:mcFromDate,hasta:mcToDate})
            const _mcYears=mcPeriodMode==='years'?mcYears:null
            const _mcFrom=_mcPer.fromDate
            const _mcTo=_mcPer.toDate
            const unlimCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
              fromDate:_mcFrom,toDate:_mcTo,tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),
              sinPerdidas,reentry,tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),
              tipoCapital:mcCapital,
              sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,assumedStopPct:mcAssumedStopPct,maxPosiciones:9999}}
            const sid=(mcStratSelected.filter(Boolean)[0])||currentStratId||null
            const strat=strategies.find(s=>s.id===sid)
            const isNoStrategyG=(strat?.name||'').includes('No Strategy')
            const weightsNorm={}
            // Universo dinámico: los activos y el universo de la ejecución (su petición), no los marcados.
            const _petU=peticionMcDe(histResult)?.universo?peticionMcDe(histResult):null
            if(!_petU&&mcMode==='custom'){
              const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
              mcSelected.forEach(sym=>{weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length})
            }
            const res=await apiFetch('/api/multibacktest',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({symbols:_petU?_petU.symbols:mcSelected,modoAsig:histResult.modoAsig==='concentrado'?'concentrado':'compartido',
                weights:weightsNorm,cfg:unlimCfg,strategyId:sid,isNoStrategy:isNoStrategyG,filtros:filtrosBackend,intervalo:mcIntervalo,comisiones:mcComisiones,
                ...(_petU?{universo:_petU.universo}:{})})})
            if(res.ok){
              const json=await res.json()
              const unlimTrades=json.allTrades||[]
              const realKeys=new Set(allTH.map(t=>`${t.symbol}:${t.entryDate}`))
              setGanttDiscarded(unlimTrades.filter(t=>!realKeys.has(`${t.symbol}:${t.entryDate}`)))
            }
          }catch(e){console.warn('Gantt discarded fetch failed:',e.message)}
          finally{setGanttLoadingDisc(false)}
        }
        // handleExport para este historial — despacha exportGantt o exportTimeline según la vista activa
        const handleExport=async()=>{
          setMcExporting(true)
          try{
            // El periodo viaja SIEMPRE como desde/hasta: «ultimos N años» se traduce aqui, en el cliente,
            // para que el servidor tenga un solo camino. `years` se sigue mandando solo en modo Años, que es
            // lo que distingue «he pedido 5 años» de «he pedido este rango» en los avisos de histórico.
            const _mcPer=rangoDePeriodo({modo:mcPeriodMode,years:mcYears,desde:mcFromDate,hasta:mcToDate})
            const _mcYears=mcPeriodMode==='years'?mcYears:null
            const _mcFrom=_mcPer.fromDate
            const _mcTo=_mcPer.toDate
            const baseCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
              fromDate:_mcFrom,toDate:_mcTo,tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),
              sinPerdidas,reentry,tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),
              tipoCapital:mcCapital,
              sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,assumedStopPct:mcAssumedStopPct,maxPosiciones:mcMaxPosiciones}}
            const sid=(mcStratSelected.filter(Boolean)[0])||currentStratId||null
            const strat=strategies.find(s=>s.id===sid)
            const stratName=strat?.name||'estrategia'
            // Universo dinámico: los activos de la ejecución, no los marcados.
            const _petUx=peticionMcDe(histResult)?.universo?peticionMcDe(histResult):null
            const _symsX=_petUx?_petUx.symbols:mcSelected
            if(mcShowGantt){
              // Vista Gantt → exportar diagrama semanal
              exportGantt({mcResult:histResult,mcSelected:_symsX,baseCfg,stratName,discardedTrades:ganttDiscarded})
            }else{
              // Vista tabla → exportar historial de trades
              exportHistorial({mcResult:histResult,mcSelected:_symsX,baseCfg,stratName})
            }
          }catch(e){alert('Error al exportar: '+e.message)}
          finally{setMcExporting(false)}
        }
        const ganttEndD=histResult.compoundCurve?.slice(-1)[0]?.date||histResult.bhCurve?.slice(-1)[0]?.date||new Date().toISOString().split('T')[0]
        return(
        <div className="trades-section">
          <div className="section-title" style={{display:'flex',flexDirection:'column',gap:6,fontSize:14}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              {/* Con el historial filtrado por un activo, el total a secas engaña: se lee como si
                  la estrategia solo hubiera hecho esas operaciones. Se dice cuántas de cuántas. */}
              <span>{histTitle} — {(()=>{
                  const _sym=mcActivoSel?.symbol
                  if(!_sym) return `${histResult.allTrades.length} operaciones`
                  const _n=histResult.allTrades.filter(t=>(t.symbol||'')===_sym).length
                  return `${_n} de ${histResult.allTrades.length} operaciones`
                })()}
                <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}> · clic activo → ver gráfico</span>
              </span>
              {/* Con el filtro global en TODAS, el título ya lleva el nombre de la estrategia que
                  se enseña, pero sin esto se leería como si el usuario la hubiera elegido. */}
              {mcTodasStrats&&isMultiHist&&(
                <span title="El filtro del panel está en todas las estrategias. El historial y el Gantt enseñan siempre una: aquí, la primera de la tabla. Elige otra abajo."
                  style={{fontFamily:MONO,fontSize:10,fontWeight:400,padding:'2px 7px',borderRadius:3,
                    cursor:'help',border:'1px solid #3d5a7a',background:'transparent',color:'#7a9bc0'}}>
                  filtro en todas · aquí, la primera
                </span>
              )}
              {/* Que el historial esté filtrado tiene que verse: si no, se lee como si la
                  estrategia solo hubiera operado ese activo. Y se quita desde aquí. */}
              {mcActivoSel&&(
                <span onClick={()=>setMcActivoSel(null)}
                  title={`Quitar el filtro por ${mcActivoSel.symbol}`}
                  style={{display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer',
                    fontFamily:MONO,fontSize:10,fontWeight:400,padding:'2px 7px',borderRadius:3,
                    border:'1px solid #00d4ff',background:'rgba(0,212,255,0.12)',color:'#00d4ff'}}>
                  Solo {mcActivoSel.symbol} ✕
                </span>
              )}
              <div style={{display:'flex',gap:4,marginLeft:'auto',alignItems:'center',flexWrap:'wrap'}}>
                {!mcShowGantt&&<ConLimpiar valor={mcTradeFilter} onLimpia={()=>setMcTradeFilter('')}><input value={mcTradeFilter} onChange={e=>setMcTradeFilter(e.target.value)}
                  placeholder="Filtrar activo…"
                  style={{fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:3,
                    background:'#0d1828',border:'1px solid #274462',color:'#e8f4ff',width:110}}/></ConLimpiar>}{/* V9.1065 */}
                {/* Sin deshabilitar: el bloque siempre resuelve UNA estrategia concreta, así
                    que siempre hay algo que exportar y algo que dibujar en el Gantt. */}
                <button
                  disabled={mcExporting}
                  title={mcShowGantt?'Exportar Gantt semanal a Excel (.xlsx)':'Exportar historial de trades a Excel (.xlsx)'}
                  onClick={handleExport}
                  style={{padding:'2px 8px',fontFamily:MONO,fontSize:10,
                    background:mcExporting?'#1a2d45':'transparent',
                    color:mcExporting?'#3d5a7a':'#00d4ff',
                    border:'1px solid #1a3a5c',borderRadius:3,
                    cursor:mcExporting?'not-allowed':'pointer',
                    opacity:mcExporting?0.5:1,flexShrink:0}}
                >{mcExporting?'⏳':'📊'} Exportar</button>
                <button
                  title={mcShowGantt?'Volver a la tabla':'Mostrar Gantt de operaciones'}
                  onClick={()=>setMcShowGantt(s=>!s)}
                  style={{padding:'2px 8px',fontFamily:MONO,fontSize:10,
                    background:mcShowGantt?'rgba(0,212,255,0.1)':'transparent',
                    color:mcShowGantt?'#00d4ff':'#7a9bc0',
                    border:`1px solid ${mcShowGantt?'#00d4ff':'#1a3a5c'}`,
                    borderRadius:3,cursor:'pointer',flexShrink:0}}
                >{mcShowGantt?'← Tabla':'📅 Gantt'}</button>
              </div>
            </div>
            {isMultiHist&&(
              <div style={{display:'flex',gap:3,alignItems:'center',flexWrap:'wrap'}}>
                {/* Sin botón "Todas": este bloque no sabe representarlo. El resaltado sigue a
                    mcHistUnoId, así que bajo TODAS marca la primera, que es la que se enseña. */}
                {mcDisplayResults.map(r=>{
                  // __portfolio__ se resalta también por defecto (mcHistUnoId null = historial del portfolio)
                  const isAct=mcHistUnoId===r.id||(mcHistUnoId===null&&r.id==='__portfolio__')
                  return(
                    <button key={r.id} onClick={()=>mcPonerEstrategia(r.id===mcHistIdPorDefecto?null:r.id)}
                      style={{fontSize:9,padding:'2px 8px',borderRadius:3,cursor:'pointer',
                        border:`1px solid ${isAct?r.color:'var(--text3)'}`,
                        background:isAct?r.color+'18':'transparent',
                        color:isAct?r.color:'#4a6a88',
                        display:'flex',alignItems:'center',gap:3}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:r.color,flexShrink:0}}/>
                      {r.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* Gantt o Tabla */}
          {mcShowGantt?(
            <div style={{height:'min(520px,55vh)',minHeight:280}}>
              {/* El Gantt se filtra igual que la tabla de al lado: son dos vistas del MISMO
                  dato y hasta ahora solo una respetaba la selección. Y las descartadas también,
                  porque mezclar ejecutadas de un activo con descartadas de todos daría un Gantt
                  que no es de nada. */}
              <GanttChart
                trades={mcSoloActivoSel(histResult.allTrades||[])}
                startDate={histResult.startDate}
                endDate={ganttEndD}
                slotCapital={histResult.slotCapital}
                modoAsig={histResult.modoAsig}
                onRequestDiscarded={handleGanttDiscarded}
                discardedTrades={ganttDiscarded?mcSoloActivoSel(ganttDiscarded):ganttDiscarded}
                loadingDiscarded={ganttLoadingDisc}
              />
            </div>
          ):(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
              <thead><tr style={{borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                {['#','Activo','Entrada','Salida','Inversión','Resultado'].map((h,hi)=>(
                  <th key={h} style={{padding:'4px 8px',textAlign:hi>=4?'right':'left',
                    color:hi===4?'#9b72ff':hi===5?'#00d4ff':'#9acce0',
                    fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                ))}
                <th style={{padding:'4px 8px',color:'#00e5a0',fontWeight:400,fontSize:11,whiteSpace:'nowrap',textAlign:'right',cursor:'help'}}
                  title="Capital acumulado del slot tras este trade (incluye todas las ganancias y pérdidas anteriores del mismo activo)">Equity</th>
                <th style={{padding:'4px 8px',color:'#ff9a3c',fontWeight:400,fontSize:11,whiteSpace:'nowrap',textAlign:'right',cursor:'help'}}
                  title="Suma del riesgo potencial de todas las posiciones abiertas simultáneamente en el momento de este trade. Calculado como Σ(distancia_al_stop × capital_invertido) de cada posición abierta.">Riesgo acum.</th>
                {['P&L %','P&L €','Días'].map(h=>(
                  <th key={h} style={{padding:'4px 8px',textAlign:'right',color:'#9acce0',fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(()=>{
                  const capIni2=Number(mcCapitalIni||capitalIni)
                  // Dos filtros independientes que se combinan. El del activo seleccionado es por
                  // coincidencia EXACTA: con `includes`, seleccionar V arrastraría NVDA. El del
                  // buscador sigue siendo por texto, y no se escribe en él: lo que el usuario tenga
                  // tecleado se respeta y se aplica encima.
                  const _symSel=mcActivoSel?.symbol||null
                  const _txt=mcTradeFilter?mcTradeFilter.toUpperCase():''
                  const allT2=histResult.allTrades.filter(t=>{
                    const sym=t.symbol||''
                    if(_symSel&&sym!==_symSel) return false
                    if(_txt&&!sym.toUpperCase().includes(_txt)) return false
                    return true
                  })
                  const curveArr=(histResult.compoundCurve||[]).slice().sort((a,b)=>a.date<b.date?-1:1)
                  const getEquityAt=date=>{
                    if(!curveArr.length)return capIni2
                    let lo=0,hi=curveArr.length-1,best=null
                    while(lo<=hi){const mid=(lo+hi)>>1;if(curveArr[mid].date>=date){best=curveArr[mid].value;hi=mid-1}else{lo=mid+1}}
                    return best??curveArr[curveArr.length-1].value??capIni2
                  }
                  let pkC=capIni2
                  const peakByDate=new Map();curveArr.forEach(p=>{pkC=Math.max(pkC,p.value);peakByDate.set(p.date,pkC)})
                  const prevByIdx={},lastBySymbol={}
                  histResult.allTrades.forEach((t,i)=>{prevByIdx[i]=lastBySymbol[t.symbol]??null;lastBySymbol[t.symbol]=t})
                  const displayTrades=[...allT2].reverse()
                  return displayTrades.map((t,i)=>{
                    const origIdx=histResult.allTrades.indexOf(t)
                    const slotCap=histResult.slotCapital??capIni2
                    const capInv=t._capitalAtEntry!=null
                      ?t._capitalAtEntry
                      :(prevByIdx[origIdx]!=null?prevByIdx[origIdx].capitalTras:slotCap)
                    const equity=getEquityAt(t.exitDate)
                    const resultado=capInv*(1+t.pnlPct/100)
                    const prevEquity=i<displayTrades.length-1?getEquityAt(displayTrades[i+1].exitDate):capIni2
                    const equityColor=equity>=prevEquity?'#00d4ff':'#ff9a3c'
                    const pnlEur=capInv*(t.pnlPct/100)
                    const pnlColor=pnlEur>=0?'var(--green)':'var(--red)'
                    return(
                      <tr key={i}
                        style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                        onClick={()=>{
                          setMcChartsOpen(true)
                          setTimeout(()=>{
                            const el=document.querySelector(`[data-mcsym="${t.symbol}"]`)
                            if(el) el.scrollIntoView({behavior:'smooth',block:'start'})
                            const chartApi=mcChartRefsMap.current[t.symbol]
                            if(chartApi){
                              const {chart,highlightTrade}=chartApi
                              if(chart&&t.entryDate){
                                const fd=new Date(t.entryDate); fd.setDate(fd.getDate()-30)
                                const td2=new Date(t.exitDate||t.entryDate); td2.setDate(td2.getDate()+30)
                                try{chart.timeScale().setVisibleRange({from:fd.toISOString().slice(0,10),to:td2.toISOString().slice(0,10)})}catch(_){}
                              }
                              const symN=histResult.allTrades.filter(x=>x.symbol===t.symbol).indexOf(t)+1
                              highlightTrade?.(symN)
                            }
                          },300)
                        }}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'4px 8px',color:'#7a9bc0',fontSize:11}}>{allT2.length-i}</td>
                        <td style={{padding:'4px 8px',color:'var(--accent)',fontWeight:700}}>{t.symbol}</td>
                        <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.entryDate)}</td>
                        <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.exitDate)}</td>
                        <td style={{padding:'4px 8px',color:'#e8f4ff',fontWeight:600,whiteSpace:'nowrap',textAlign:'right'}}>€{fmt(capInv,0)}</td>
                        <td style={{padding:'4px 8px',color:t.pnlPct>=0?'#00d4ff':'#ff9a3c',fontWeight:600,whiteSpace:'nowrap',textAlign:'right'}}>€{fmt(resultado,0)}</td>
                        <td style={{padding:'4px 8px',color:equityColor,fontWeight:600,whiteSpace:'nowrap',textAlign:'right'}}>€{fmt(equity,0)}</td>
                        <td style={{padding:'4px 8px',color:'#ff9a3c',textAlign:'right'}}>{t.riesgoAcum!=null&&t.riesgoAcum>0?'€'+fmt(t.riesgoAcum,0):'—'}</td>
                        <td style={{padding:'4px 8px',color:pnlColor,fontWeight:600,textAlign:'right'}}>{t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%</td>
                        <td style={{padding:'4px 8px',color:pnlColor,textAlign:'right'}}>{pnlEur>=0?'+':''}{fmt(pnlEur,2)}€</td>
                        <td style={{padding:'4px 8px',color:'#a8c4dc',textAlign:'right'}}>{t.dias}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )
      })()}
      {/* ── Prueba contra el azar de la cartera (components/AzarCarteraPanel.js): cada estrategia (o modo) por separado ── */}
      {mcResult&&<AzarCarteraPanel apiFetch={apiFetch}
        resultados={mcMultiResults.length?mcMultiResults:[{id:currentStratId||'__single__',name:mcSingleStratName,result:mcResult}]} />}
      {/* ── Vista de gráficos — una o varias estrategias ── */}
      {mcResult&&(()=>{
        const MAX_SYMS=10,MAX_STRATS=3
        const isMulti=mcMultiResults.length>1
        // Estrategias efectivas: multi-run o estrategia activa única
        const strats=isMulti
          ? mcDisplayResults.slice(0,MAX_STRATS).filter(r=>mcChartsStratVisible[r.id]!==false)
          : [{
              id:currentStratId||'__single__',
              name:mcSingleStratName,
              color:STRAT_COMPARE_COLORS[0],
              result:mcResult
            }]
        // Universo dinámico: los activos de la ejecución (su petición), no los marcados en la lista manual.
        const _petUG=peticionMcDe(mcResult)?.universo?peticionMcDe(mcResult):null
        const _symsG=_petUG?_petUG.symbols:mcSelected
        const syms=_symsG.slice(0,MAX_SYMS)
        const overLimit=_symsG.length>MAX_SYMS||(isMulti&&mcMultiResults.length>MAX_STRATS)
        return(
          <div style={{borderTop:'1px solid var(--border)'}}>
            {/* Cabecera colapsable */}
            <div onClick={()=>setMcChartsOpen(o=>!o)}
              style={{padding:'7px 16px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',
                background:'var(--bg2)',borderBottom:'1px solid var(--border)',userSelect:'none'}}
              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
              onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
              <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcChartsOpen?'▼':'▶'}</span>
              <span style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>VISTA DE GRÁFICOS</span>
              <span style={{fontFamily:MONO,fontSize:10,color:'#4a6a88',marginLeft:4}}>{syms.length} activos · {strats.length} {strats.length===1?'estrategia':'estrategias'}</span>
              {overLimit&&<span style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,color:'#ffd166',background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:3,padding:'1px 6px'}}>⚠ Límite 10×3</span>}
            </div>
            {mcChartsOpen&&(
              <>
                {overLimit&&(
                  <div style={{padding:'6px 16px',background:'rgba(255,209,102,0.06)',borderBottom:'1px solid rgba(255,209,102,0.2)',fontFamily:MONO,fontSize:10,color:'#ffd166'}}>
                    ⚠ Límite: máximo 10 activos × 3 estrategias. Se muestran los primeros {syms.length} activos y {strats.length} estrategias.
                  </div>
                )}
                {/* Leyenda */}
                <div style={{padding:'4px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap',background:'var(--bg2)'}}>
                  {(isMulti?mcDisplayResults.slice(0,MAX_STRATS):[{id:currentStratId||'__single__',name:mcSingleStratName,color:STRAT_COMPARE_COLORS[0]}]).map(r=>{
                    const on=mcChartsStratVisible[r.id]!==false
                    return(
                      <button key={r.id}
                        onClick={()=>isMulti&&setMcChartsStratVisible(v=>({...v,[r.id]:!on}))}
                        style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:isMulti?'pointer':'default',
                          border:`1px solid ${on?r.color:'var(--text3)'}`,
                          background:on?`${r.color}18`:'transparent',
                          color:on?r.color:'var(--text3)',
                          display:'flex',alignItems:'center',gap:4}}>
                        <span>▲▼</span><span>{r.name}</span>
                      </button>
                    )
                  })}
                </div>
                {/* Gráficos por activo */}
                {syms.map(sym=>{
                  const stratSignals=strats.map(r=>{
                    const symTrades=(r.result.allTrades||[]).filter(t=>t.symbol===sym)
                    return {
                      id:r.id,name:r.name,color:r.color,
                      // Single strategy: green entries, red exits. Multi: strategy color for both.
                      entryColor:isMulti?r.color:'#00e5a0',
                      exitColor:isMulti?r.color:'#ff4d6d',
                      // Los dos nombres: los modos de pool traen entryPx/exitPx y Slots, que no
                      // pasa por sus candidatos, entryPrice/exitPrice. Sin esto la línea de
                      // entrada a salida no se dibujaba en Slots.
                      entries:symTrades.map(t=>({date:t.entryDate,price:t.entryPx??t.entryPrice})),
                      exits:symTrades.map(t=>({date:t.exitDate,price:t.exitPx??t.exitPrice})),
                      // Los MISMOS campos que el panel del activo: las etiquetas y el globo del
                      // cursor son código compartido del componente y ya funcionaban aquí, pero
                      // sin estos el globo enseñaba guiones donde van la inversión, el resultado
                      // y la cesión desde el máximo. Todo sale de allTrades, que ya está en
                      // memoria: ni una descarga más.
                      trades:symTrades.map((t,idx)=>({
                        n:idx+1,
                        entryDate:t.entryDate,entryPx:t.entryPx??t.entryPrice,
                        exitDate:t.exitDate,exitPx:t.exitPx??t.exitPrice,
                        pnlPct:t.pnlPct,pnlSimple:t.pnlSimple,
                        capital:t.pnlPct!==0?Math.abs(t.pnlSimple/(t.pnlPct/100)):0,
                        ...mcCapitalDeOperacion(t,r.result.modoAsig),
                        cesionPct:t.cesionPct??null,maxPx:t.maxPx??null,maxFecha:t.maxFecha??null,
                        ddOperacion:t.ddOperacion??null,
                      })),
                    }
                  })
                  return(
                    <AssetSignalChart key={sym} symbol={sym}
                      stratSignals={stratSignals}
                      years={mcAniosVelas}
                      height={400}
                      syncRef={mcChartsSyncRef}
                      onReady={({chart,highlightTrade})=>{mcChartRefsMap.current[sym]={chart,highlightTrade}}}/>
                  )
                })}
              </>
            )}
          </div>
        )
      })()}
    </div>
    </div>
  )
}
