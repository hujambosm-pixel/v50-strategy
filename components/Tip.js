import { useState, useRef } from 'react'
import { MONO } from '../lib/utils'

export const TIP_DATA = {
  // ── Config rápida ──────────────────────────────────────────
  emaR: {
    title: 'EMA Rápida — Periodo',
    text: 'Número de velas para calcular la media exponencial rápida. Cuanto menor el periodo, más sensible al precio y más señales genera. El cruce alcista de esta línea sobre la EMA lenta activa el SETUP de entrada en estrategias de cruce.'
  },
  emaL: {
    title: 'EMA Lenta — Periodo',
    text: 'Número de velas para calcular la media exponencial lenta. Define la tendencia de fondo. El SETUP se activa cuando la EMA rápida cruza al alza sobre esta. Siempre debe tener un periodo mayor que la EMA rápida.'
  },
  capital: {
    title: 'Capital inicial (€)',
    text: 'Capital de partida en euros. Se usa como base para calcular el P&L Simple (siempre sobre este valor fijo) y el P&L Compuesto (se reinvierte tras cada trade). No afecta al número de señales ni al timing, solo a los importes monetarios.'
  },
  years: {
    title: 'Años de backtest',
    text: 'Ventana temporal hacia atrás desde la última fecha disponible. El motor solo ejecuta trades dentro de este periodo. A mayor número de años, mayor muestra estadística; a menor número, más representativo del comportamiento reciente del activo.'
  },
  tipoStop: {
    title: 'Tipo de Stop Loss',
    text: 'Técnico: stop fijo calculado en la vela de setup (por ejemplo, mínimo de esa vela o nivel de media). ATR: stop dinámico basado en la volatilidad reciente — distancia = ATR × multiplicador. Ninguno: la posición solo se cierra por la señal de salida, sin límite de pérdida fijo.'
  },
  atr: {
    title: 'Periodo ATR',
    text: 'Número de velas para calcular el Average True Range. El ATR mide la volatilidad promedio real (rango máximo-mínimo incluyendo gaps). A mayor periodo, el ATR es más suave y el stop queda más alejado del precio de entrada.'
  },
  atrMult: {
    title: 'Multiplicador ATR',
    text: 'Factor de escala sobre el ATR para calcular la distancia del stop. Stop = precio de entrada − ATR(n) × multiplicador. Un valor alto da más margen al trade pero implica una pérdida máxima mayor por operación.'
  },
  sinPerdidas: {
    title: 'Sin Pérdidas (Breakeven)',
    text: 'Cuando el mínimo de la vela actual supera el precio de entrada, la condición de salida solo se activa si el precio vuelve a caer por debajo del precio de entrada. Convierte un trade ganador en uno que, en el peor caso, cierra en tablas.'
  },
  reentry: {
    title: 'Re-Entry (Reentrada)',
    text: 'Tras una salida, si la tendencia de medias sigue siendo alcista, el motor busca una nueva entrada: espera la primera vela cuyo cierre supere la media rápida y hace breakout de su máximo. Permite capturar la continuación de la tendencia sin esperar un nuevo cruce de medias.'
  },
  filtroSP500: {
    title: 'Filtro de mercado (SP500)',
    text: 'Bloquea nuevas entradas cuando el mercado de referencia no cumple la condición seleccionada. "Precio sobre EMA": bloquea si el índice está bajo su media rápida. "EMA rápida sobre EMA lenta": bloquea si las medias del índice son bajistas. Las entradas pendientes también se cancelan al activarse el filtro.'
  },
  sp500Emas: {
    title: 'Periodos de medias del filtro',
    text: 'Medias exponenciales aplicadas al índice de referencia (SP500) para evaluar el filtro de mercado. Son independientes de las medias del activo principal. Periodos cortos (ej. 10/11) reaccionan rápido; periodos largos (ej. 50/200) filtran solo tendencias de largo plazo.'
  },
  // ── Constructor de estrategia ──────────────────────────────
  filter: {
    title: 'FILTER — Condición de mercado',
    text: 'Define si el mercado está en condición favorable para abrir posiciones. Se evalúa barra a barra. Si la condición no se cumple, todas las entradas quedan bloqueadas y las pendientes se cancelan. Útil para evitar operar en mercados bajistas o de alta volatilidad.'
  },
  setup: {
    title: 'SETUP — Señal de alerta',
    text: 'El evento técnico que activa el estado de espera de entrada. Cuando ocurre, el motor registra el precio de referencia (ej. máximo de la vela) como nivel de breakout y comienza a vigilar el TRIGGER. Sin SETUP activo, el TRIGGER no se evalúa.'
  },
  trigger: {
    title: 'TRIGGER — Ejecución de entrada',
    text: 'Define cómo se ejecuta la compra real. Breakout: la entrada ocurre cuando el precio supera el máximo de la vela de setup. Rolling: si las siguientes velas no producen breakout, el nivel se actualiza al nuevo mínimo de máximos consecutivos. Apertura: entra directamente en la siguiente apertura.'
  },
  abort: {
    title: 'ABORT — Cancelación de entrada pendiente',
    text: 'Condiciones que cancelan una entrada mientras está pendiente de ejecutarse. Al cumplirse cualquiera de las condiciones activadas, el motor descarta el setup actual y resetea el nivel de breakout. Evita entrar en una posición cuando el contexto técnico ha cambiado.'
  },
  stopLoss: {
    title: 'STOP LOSS — Límite de pérdida',
    text: 'Nivel de precio fijo que, si el precio lo toca intradía, cierra la posición con pérdida controlada. Se fija en el momento del setup o de la entrada y no se recalcula. El stop técnico usa referencia de medias o mínimos de vela; el ATR usa la volatilidad reciente como base.'
  },
  exit: {
    title: 'EXIT — Señal de salida',
    text: 'Define cuándo y cómo se cierra una posición abierta. Breakout del mínimo: la salida se ejecuta cuando el precio rompe el mínimo de la primera vela que da la señal de salida. Apertura siguiente: sale directamente en la próxima apertura. El modo Sin Pérdidas puede condicionar la activación de esta señal.'
  },
  management: {
    title: 'MANAGEMENT — Gestión de la posición',
    text: 'Reglas adicionales activas mientras la posición está abierta. Sin Pérdidas: activa breakeven automático cuando el trade está en beneficio. Re-Entry: tras cerrar, si la tendencia de medias continúa, busca una nueva entrada inmediata sin esperar un cruce nuevo.'
  },
  sizing: {
    title: 'SIZING — Tamaño de posición',
    text: 'Capital fijo: cada trade usa siempre el mismo importe en euros. El P&L Simple suma linealmente. El P&L Compuesto reinvierte las ganancias: cada operación usa el capital acumulado del trade anterior. El sizing no afecta a las señales, solo a los resultados monetarios.'
  },
  // ── Dashboard métricas ──────────────────────────────────────
  cagr: { title: 'CAGR', text: 'Tasa de crecimiento anual compuesto del portfolio durante el período analizado.' },
  maxDrawdown: { title: 'Max Drawdown', text: 'Caída máxima desde un máximo hasta el mínimo posterior. Mide el peor escenario de pérdida.' },
  winRate: { title: 'Win Rate', text: 'Porcentaje de operaciones cerradas con beneficio sobre el total de operaciones cerradas.' },
  factorBeneficio: { title: 'Factor Beneficio', text: 'Ratio entre ganancias brutas y pérdidas brutas. Mayor de 1 indica sistema rentable.' },
  impactoFx: { title: 'Impacto FX', text: 'Efecto del tipo de cambio en el P&L total. Diferencia entre P&L real y P&L sin conversión de divisa.' },
  ganMediaPct: { title: 'Gan. Media %', text: 'Rentabilidad media de las operaciones ganadoras, expresada en porcentaje.' },
  perdMediaPct: { title: 'Pérd. Media %', text: 'Pérdida media de las operaciones perdedoras, expresada en porcentaje.' },
  diasProm: { title: 'Días Prom.', text: 'Duración media de las operaciones cerradas, en días naturales.' },
  totalDias: { title: 'Total Días', text: 'Días naturales totales entre la primera entrada y la última salida del período.' },
  tInvertido: { title: 'T. Invertido', text: 'Porcentaje del tiempo total en que había al menos una posición abierta.' },
  mejorOp: { title: 'Mejor Op.', text: 'Operación cerrada con mayor beneficio absoluto en euros.' },
  peorOp: { title: 'Peor Op.', text: 'Operación cerrada con mayor pérdida absoluta en euros.' },
  ganadoras: { title: 'Ganadoras', text: 'Número de operaciones cerradas con P&L positivo.' },
  perdedoras: { title: 'Perdedoras', text: 'Número de operaciones cerradas con P&L negativo o cero.' },
  balanceInicial: { title: 'Balance Inicial', text: 'Capital de referencia inicial para el cálculo de rentabilidades y métricas.' },
  pnlSCapital: { title: 'P&L s/Capital', text: 'P&L total (realizado + flotante) expresado como porcentaje del balance inicial. Permite comparar directamente con un Buy & Hold u otro benchmark.' },
  diasPromedioInv: { title: 'Días Promedio', text: 'Media de días en posición por operación, incluyendo solo días con capital invertido.' },
  totalDiasInv: { title: 'Total Días Inv.', text: 'Suma total de días-posición de todas las operaciones cerradas.' },
}

export default function Tip({id, style}) {
  const [show, setShow] = useState(false)
  const anchorRef = useRef(null)
  const [pos, setPos] = useState({top:true, left:'50%', transform:'translateX(-50%)'})
  const tip = TIP_DATA[id]
  if (!tip) return null

  const calcPos = () => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const TW = 250, margin = 8
    let left = '50%', transform = 'translateX(-50%)'
    const centerX = rect.left + rect.width/2
    if (centerX - TW/2 < margin) {
      left = `${margin - rect.left}px`; transform = 'none'
    } else if (centerX + TW/2 > window.innerWidth - margin) {
      left = 'auto'; transform = 'none'
    }
    const top = rect.top > 160
    setPos({ top, left, transform })
  }

  return (
    <span ref={anchorRef} style={{position:'relative', display:'inline-flex', alignItems:'center', ...style}}
      onMouseEnter={()=>{calcPos();setShow(true)}} onMouseLeave={()=>setShow(false)}>
      <span style={{cursor:'help', color:'#4a7fa0', fontSize:10, lineHeight:1, userSelect:'none'}}>ⓘ</span>
      {show && (
        <div style={{
          position:'fixed',
          top: pos.top
            ? (anchorRef.current ? anchorRef.current.getBoundingClientRect().top - 8 : 0)
            : (anchorRef.current ? anchorRef.current.getBoundingClientRect().bottom + 8 : 0),
          left: anchorRef.current ? Math.max(8, Math.min(
            anchorRef.current.getBoundingClientRect().left + anchorRef.current.getBoundingClientRect().width/2 - 125,
            window.innerWidth - 258
          )) : 0,
          transform: pos.top ? 'translateY(-100%)' : 'none',
          background:'#0a1520', border:'1px solid #2a4a66', borderRadius:6,
          padding:'9px 11px', zIndex:9999, width:250, fontFamily:MONO, fontSize:10,
          color:'#cce0f5', lineHeight:1.65, boxShadow:'0 6px 24px rgba(0,0,0,0.9)',
          pointerEvents:'none', whiteSpace:'normal'
        }}>
          <div style={{color:'#00d4ff', fontWeight:700, marginBottom:5, fontSize:10}}>{tip.title}</div>
          <div style={{color:'#b0ccdf'}}>{tip.text}</div>
        </div>
      )}
    </span>
  )
}
