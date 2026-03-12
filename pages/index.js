import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'

function calcMetrics(trades, capitalIni, capitalReinv, gananciaSimple, ganBH, startDate, endDate, yearsConfig) {
  if (!trades||trades.length===0) return null
  const n=trades.length, wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
  const winRate=(wins.length/n)*100
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0
  const avgLoss=losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length:0
  const totalDias=trades.reduce((s,t)=>s+t.dias,0)
  // Periodo real: siempre desde fechas reales del calendario (startDate→endDate)
  // Esto da los años correctos para CAGR y Tiempo Invertido
  let totalDiasNat = Number(yearsConfig||5) * 365.25
  if (startDate && endDate) {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
    if (!isNaN(ms) && ms > 0) totalDiasNat = ms / 86400000
  }
  const anios = Math.max(totalDiasNat / 365.25, 0.01)
  const safYears = anios
  const aniosInv=totalDias/365.25, tiempoInvPct=(totalDias/totalDiasNat)*100
  const cagrS=Math.pow(Math.max(capitalIni+gananciaSimple,0.01)/capitalIni,1/safYears)-1
  const cagrC=capitalReinv>0?Math.pow(capitalReinv/capitalIni,1/safYears)-1:0
  const capBH=capitalIni+ganBH, cagrBH=capBH>0?Math.pow(capBH/capitalIni,1/safYears)-1:0
  const gBrute=wins.reduce((s,t)=>s+t.pnlSimple,0), lBrute=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
  const factorBen=lBrute>0?gBrute/lBrute:999
  let peakS=capitalIni,maxDDS=0; trades.forEach(t=>{const eq=capitalIni+trades.slice(0,trades.indexOf(t)+1).reduce((s,x)=>s+x.pnlSimple,0);if(eq>peakS)peakS=eq;const dd=(peakS-eq)/peakS*100;if(dd>maxDDS)maxDDS=dd})
  let peakR=capitalIni,maxDDR=0; trades.forEach(t=>{if(t.capitalTras>peakR)peakR=t.capitalTras;const dd=(peakR-t.capitalTras)/peakR*100;if(dd>maxDDR)maxDDR=dd})
  return {n,wins:wins.length,losses:losses.length,winRate,avgWin,avgLoss,totalDias,diasProm:totalDias/n,ganSimple:gananciaSimple,ganComp:capitalReinv-capitalIni,ganBH,ganTotalPct:(gananciaSimple/capitalIni)*100,cagrS:cagrS*100,cagrC:cagrC*100,cagrBH:cagrBH*100,factorBen,ddSimple:maxDDS,ddComp:maxDDR,tiempoInvPct,aniosInv,anios:safYears}
}

const MONO='"JetBrains Mono","Fira Code","IBM Plex Mono",monospace'

// ── Tip — icono ⓘ con tooltip explicativo (Groq AI) ─────────
// ── Ayuda precisa por parámetro — sin llamada a IA, 100% exacto ─
const TIP_DATA = {
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
}

function Tip({id, style}) {
  const [show, setShow] = useState(false)
  const anchorRef = useRef(null)
  const [pos, setPos] = useState({top:true, left:'50%', transform:'translateX(-50%)'})
  const tip = TIP_DATA[id]
  if (!tip) return null

  const calcPos = () => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const TW = 250, margin = 8
    // Horizontal: prefer centered, clamp to viewport
    let left = '50%', transform = 'translateX(-50%)'
    const centerX = rect.left + rect.width/2
    if (centerX - TW/2 < margin) {
      left = `${margin - rect.left}px`; transform = 'none'
    } else if (centerX + TW/2 > window.innerWidth - margin) {
      left = 'auto'; transform = 'none'
    }
    // Vertical: above if there's room, else below
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

// ── Date helpers for TradeLog (dd/mm/yyyy ↔ yyyy-mm-dd) ──
function toDisplayDate(iso){ // '2024-03-15' → '15/03/2024'
  if(!iso) return ''
  const [y,m,d]=iso.split('-')
  return `${d}/${m}/${y}`
}
function toIsoDate(disp){ // '15/03/2024' → '2024-03-15'
  if(!disp) return ''
  if(disp.includes('-')) return disp // already ISO
  const parts=disp.split('/')
  if(parts.length===3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return ''
}
function todayDisplay(){ return toDisplayDate(new Date().toISOString().slice(0,10)) }

function fmt(v,dec=2,suf=''){if(v==null||isNaN(v))return'—';return v.toLocaleString('es-ES',{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf}
function fmtDate(s){if(!s)return'—';return new Date(s).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
function f2(v){if(v==null||isNaN(v))return'—';return v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}
function tvSym(sym){if(sym==='^GSPC')return'SP:SPX';if(sym==='^IBEX')return'BME:IBC';if(sym==='^GDAXI')return'XETR:DAX';if(sym==='^NDX')return'NASDAQ:NDX';if(sym.includes('-USD'))return`BINANCE:${sym.replace('-','')}`;return sym}

// ── Supabase config ──────────────────────────────────────────
const SUPA_URL='https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY='sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'
const SUPA_H={apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,'Content-Type':'application/json'}

// ── Watchlist API ─────────────────────────────────────────────
async function fetchWatchlist() {
  const res=await fetch(`${SUPA_URL}/rest/v1/watchlist?order=favorite.desc,name.asc`,{headers:SUPA_H})
  if(!res.ok) throw new Error('Error cargando watchlist')
  return await res.json() // devuelve filas completas con todos los campos
}
async function upsertWatchlistItem(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${SUPA_URL}/rest/v1/watchlist?id=eq.${item.id}`:`${SUPA_URL}/rest/v1/watchlist`
  // Limpiar campos internos (prefijo _) y campos no existentes en la tabla
  const ALLOWED=['symbol','name','group_name','list_name','position','active','favorite','observations']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...SUPA_H,'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando: '+t)}
  return (await res.json())[0]
}
async function deleteWatchlistItem(id) {
  const res=await fetch(`${SUPA_URL}/rest/v1/watchlist?id=eq.${id}`,{method:'DELETE',headers:SUPA_H})
  if(!res.ok) throw new Error('Error eliminando')
}

// ── Ranking results API ───────────────────────────────────────
async function saveRankingRemote(rankingData, stratId) {
  // Upsert one row per symbol in backtest_results, keyed by symbol+strategy_id
  const rows = Object.entries(rankingData).map(([symbol, rd]) => ({
    symbol,
    strategy_id: stratId || null,
    win_rate:    rd.metrics?.winRate    ?? null,
    cagr_simple: rd.metrics?.cagr       ?? null,
    max_drawdown:rd.metrics?.maxDD      ?? null,
    total_trades:rd.metrics?.trades     ?? null,
    score:       rd.score               ?? null,
    rank_position: rd.rank              ?? null,
    updated_at:  new Date().toISOString(),
  }))
  // Upsert in batches of 20
  for (let i=0; i<rows.length; i+=20) {
    const batch = rows.slice(i, i+20)
    await fetch(`${SUPA_URL}/rest/v1/ranking_results`, {
      method: 'POST',
      headers: { ...SUPA_H, 'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    })
  }
}
async function loadRankingRemote(stratId) {
  const url = stratId
    ? `${SUPA_URL}/rest/v1/ranking_results?strategy_id=eq.${stratId}&order=rank_position.asc`
    : `${SUPA_URL}/rest/v1/ranking_results?order=rank_position.asc`
  const res = await fetch(url, { headers: SUPA_H })
  if (!res.ok) return null
  const rows = await res.json()
  if (!rows?.length) return null
  const out = {}
  rows.forEach(r => {
    out[r.symbol] = {
      score: r.score, rank: r.rank_position,
      metrics: { winRate: r.win_rate, cagr: r.cagr_simple, maxDD: r.max_drawdown, trades: r.total_trades }
    }
  })
  return out
}

// ── Strategies API ────────────────────────────────────────────
async function fetchStrategies() {
  const res=await fetch(`${SUPA_URL}/rest/v1/strategies?active=eq.true&order=name.asc`,{headers:SUPA_H})
  if(!res.ok) throw new Error('Error cargando estrategias')
  return await res.json()
}
async function upsertStrategy(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${SUPA_URL}/rest/v1/strategies?id=eq.${item.id}`:`${SUPA_URL}/rest/v1/strategies`
  const body={...item}; delete body.id
  const res=await fetch(url,{method,headers:{...SUPA_H,'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok) throw new Error('Error guardando estrategia')
  return (await res.json())[0]
}
async function deleteStrategy(id) {
  const res=await fetch(`${SUPA_URL}/rest/v1/strategies?id=eq.${id}`,{method:'DELETE',headers:SUPA_H})
  if(!res.ok) throw new Error('Error eliminando estrategia')
}

// ── Conditions API ─────────────────────────────────────────────
// ── Conditions — localStorage-first, Supabase optional ────────
const COND_LS_KEY = 'v50_conditions'
function lsGetConds() { try { return JSON.parse(localStorage.getItem(COND_LS_KEY)||'[]') } catch(_) { return [] } }
function lsSaveConds(arr) { try { localStorage.setItem(COND_LS_KEY, JSON.stringify(arr)) } catch(_) {} }

async function fetchConditions() {
  const localAll = lsGetConds()
  const localOnly = localAll.filter(c => c.id?.startsWith('local_'))
  try {
    const res = await fetch('/api/conditions')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && !data.error) {
        // Always merge Supabase + local-only entries
        const merged = [...data, ...localOnly]
        lsSaveConds(merged)
        return merged
      }
    }
  } catch(_) {}
  // Supabase unavailable — return full local cache
  return localAll
}

async function saveCondition(cond) {
  // 1. ALWAYS save to localStorage first (never fails)
  const localId = 'local_' + Date.now()
  const localEntry = { ...cond, id: localId, created_at: new Date().toISOString(), active: true }
  lsSaveConds([...lsGetConds(), localEntry])

  // 2. Try to sync to Supabase in background — replace local entry with real one if OK
  const groqKey=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||''}catch(_){return ''}})()
  try {
    const res = await fetch('/api/conditions', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-groq-key':groqKey},
      body:JSON.stringify(cond)
    })
    if (res.ok) {
      const saved = await res.json()
      if (saved?.id) {
        // Replace temp local entry with the Supabase one
        lsSaveConds(lsGetConds().filter(c => c.id !== localId))
        return saved
      }
    }
  } catch(_) {}
  // Supabase failed or no id returned — keep the local entry
  return localEntry
}

async function deleteCondition(id) {
  if (!id?.startsWith('local_')) {
    try {
      const res = await fetch(`/api/conditions?id=${id}`, {method:'DELETE'})
      if (!res.ok) console.warn('Supabase delete failed')
    } catch(_) {}
  }
  // Always remove from localStorage cache
  lsSaveConds(lsGetConds().filter(c => c.id !== id))
}
async function groqParseCondition(text) {
  const groqKey=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||''}catch(_){return ''}})()
  const res=await fetch('/api/conditions?action=groq',{method:'POST',headers:{'Content-Type':'application/json','x-groq-key':groqKey},body:JSON.stringify({text})})
  const json=await res.json()
  if(!res.ok||json.error) throw new Error(json.error||'Error Groq')
  return json
}

// ── Alarms API ───────────────────────────────────────────────
async function fetchAlarms() {
  const res=await fetch(`${SUPA_URL}/rest/v1/alarms?active=eq.true&order=symbol.asc`,{headers:SUPA_H})
  if(!res.ok) throw new Error('Error cargando alarmas')
  return await res.json()
}
async function upsertAlarm(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${SUPA_URL}/rest/v1/alarms?id=eq.${item.id}`:`${SUPA_URL}/rest/v1/alarms`
  const ALLOWED=['name','symbol','condition','condition_detail','price_level','ema_r','ema_l','active']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...SUPA_H,'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando alarma: '+t)}
  return (await res.json())[0]
}
async function deleteAlarm(id) {
  const res=await fetch(`${SUPA_URL}/rest/v1/alarms?id=eq.${id}`,{method:'DELETE',headers:SUPA_H})
  if(!res.ok) throw new Error('Error eliminando alarma')
}

// ── Búsqueda de nombre vía Yahoo Finance (proxy local) ───────
async function searchSymbolName(sym) {
  if(!sym||sym.length<1) return ''
  try{
    const res=await fetch(`/api/search?q=${encodeURIComponent(sym)}`)
    if(!res.ok) return ''
    const data=await res.json()
    // Buscar coincidencia exacta primero
    const exact=data.find(d=>d.symbol.toUpperCase()===sym.toUpperCase())
    return exact?exact.name:(data[0]?.name||'')
  }catch{return ''}
}

// Fallback local por si Supabase no responde
const WATCHLIST_FALLBACK=[
  {id:null,symbol:'^GSPC',name:'S&P 500',group_name:'Índices',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'^NDX',name:'Nasdaq 100',group_name:'Índices',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'^IBEX',name:'IBEX 35',group_name:'Índices',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'^GDAXI',name:'DAX 40',group_name:'Índices',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'AAPL',name:'Apple',group_name:'Acciones',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'MSFT',name:'Microsoft',group_name:'Acciones',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'NVDA',name:'Nvidia',group_name:'Acciones',list_name:'General',favorite:false,observations:''},
  {id:null,symbol:'BTC-USD',name:'Bitcoin',group_name:'Crypto',list_name:'General',favorite:false,observations:''},
]

// ── Mapa de nombres conocidos ────────────────────────────────
const SYM_NAMES={
  '^GSPC':'S&P 500','^NDX':'Nasdaq 100','^IBEX':'IBEX 35','^GDAXI':'DAX 40',
  '^FTSE':'FTSE 100','^N225':'Nikkei 225','^DJI':'Dow Jones','^RUT':'Russell 2000',
  '^STOXX50E':'Euro Stoxx 50','^FCHI':'CAC 40','^AEX':'AEX Amsterdam',
  'AAPL':'Apple','MSFT':'Microsoft','NVDA':'Nvidia','AMZN':'Amazon','META':'Meta',
  'TSLA':'Tesla','GOOGL':'Alphabet','GOOG':'Alphabet','JPM':'JPMorgan',
  'V':'Visa','MA':'Mastercard','UNH':'UnitedHealth','JNJ':'Johnson & Johnson',
  'WMT':'Walmart','PG':'Procter & Gamble','XOM':'ExxonMobil','CVX':'Chevron',
  'HD':'Home Depot','ABBV':'AbbVie','LLY':'Eli Lilly','MRK':'Merck',
  'PFE':'Pfizer','KO':'Coca-Cola','PEP':'PepsiCo','COST':'Costco',
  'AVGO':'Broadcom','ORCL':'Oracle','CRM':'Salesforce','ADBE':'Adobe',
  'NFLX':'Netflix','DIS':'Disney','PYPL':'PayPal','SQ':'Block',
  'AMD':'AMD','INTC':'Intel','QCOM':'Qualcomm','TXN':'Texas Instruments',
  'BAC':'Bank of America','WFC':'Wells Fargo','GS':'Goldman Sachs','MS':'Morgan Stanley',
  'BTC-USD':'Bitcoin','ETH-USD':'Ethereum','SOL-USD':'Solana','BNB-USD':'BNB',
  'XRP-USD':'XRP','ADA-USD':'Cardano','DOGE-USD':'Dogecoin','AVAX-USD':'Avalanche',
  'GC=F':'Oro','CL=F':'Petróleo WTI','SI=F':'Plata','NG=F':'Gas Natural',
  'ZC=F':'Maíz','ZW=F':'Trigo','KC=F':'Café',
  'SPY':'SPDR S&P 500 ETF','QQQ':'Invesco QQQ ETF','IWM':'iShares Russell 2000',
  'GLD':'SPDR Gold ETF','TLT':'iShares 20Y Treasury',
}
function lookupName(sym) {
  if(!sym) return ''
  const up=sym.toUpperCase()
  if(SYM_NAMES[up]) return SYM_NAMES[up]
  // Fallback: limpiar el símbolo como nombre
  return up.replace(/[\^=\.\-]/g,' ').replace(/USD$/,'').trim()
}

// ── Settings — localStorage + Supabase sync ──────────────────
const SETTINGS_KEY = 'v50_settings'
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}') } catch(_){ return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch(_) {}
}
async function saveSettingsRemote(s) {
  // Save to localStorage first (instant)
  saveSettings(s)
  // Then sync to Supabase (upsert row id=1)
  try {
    await fetch(`${SUPA_URL}/rest/v1/user_settings?id=eq.1`, {
      method:'PATCH',
      headers:{...SUPA_H,'Prefer':'return=minimal'},
      body:JSON.stringify({settings:s, updated_at:new Date().toISOString()})
    })
  } catch(_) {}
}
async function loadSettingsRemote() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/user_settings?id=eq.1&select=settings`, {headers:SUPA_H})
    if(!res.ok) return null
    const data = await res.json()
    if(data?.[0]?.settings && Object.keys(data[0].settings).length > 0) return data[0].settings
    return null
  } catch(_){ return null }
}

function SettingsModal({ onClose, strategies=[] }) {
  const [tab, setTab] = useState('integraciones')
  const [settings, setSettings] = useState(loadSettings)
  const [groqStatus, setGroqStatus] = useState(null) // null | 'testing' | 'ok' | 'err'
  const [dirty, setDirty] = useState(false)
  // Conditions tab state
  const [localConds, setLocalConds]   = useState([])
  const [condTab, setCondTab]         = useState('list')   // 'list' | 'create'
  const [groqInput, setGroqInput]     = useState('')
  const [groqParsing, setGroqParsing] = useState(false)
  const [groqPreview, setGroqPreview] = useState(null)     // parsed condition preview
  const [groqErr, setGroqErr]         = useState(null)
  const [condSaving, setCondSaving]   = useState(false)
  const [condDeleting, setCondDeleting] = useState(null)   // id being deleted
  const [condSaveErr, setCondSaveErr]   = useState(null)   // error for manual save
  // Manual form
  const [manualForm, setManualForm] = useState({ name:'', description:'', type:'ema_cross_up', params:{ma_fast:10,ma_slow:11} })

  // Load conditions when tab is opened
  const openConditions = () => {
    fetchConditions().then(d=>{
      setLocalConds(d||[])
      // Auto-switch to create tab if library is empty
      if(!d||d.length===0) setCondTab('create')
    }).catch(()=>{ setCondTab('create') })
  }

  const handleGroqParse = async () => {
    if (!groqInput.trim()) return
    setGroqParsing(true); setGroqErr(null); setGroqPreview(null)
    try {
      const result = await groqParseCondition(groqInput)
      if (result.error) { setGroqErr(result.error); return }
      setGroqPreview(result)
    } catch(e) { setGroqErr(e.message) }
    finally { setGroqParsing(false) }
  }

  const handleSaveCond = async (cond) => {
    setCondSaving(true); setCondSaveErr(null); setGroqErr(null)
    const isGroq = !!groqPreview
    try {
      if (!cond.name?.trim()) throw new Error('El nombre es obligatorio')
      await saveCondition({...cond, source: isGroq ? 'groq' : 'manual'})
      // Refresh from merged source (localStorage + Supabase)
      const updated = await fetchConditions()
      setLocalConds(updated||lsGetConds())
      if (isGroq) { setGroqPreview(null); setGroqInput('') }
      else { setManualForm({name:'',description:'',type:'ema_cross_up',params:{ma_fast:10,ma_slow:11}}) }
      setCondTab('list')
    } catch(e) {
      if (isGroq) setGroqErr(e.message||'Error con Groq IA')
      else setCondSaveErr(e.message||'Error guardando condición')
    }
    finally { setCondSaving(false) }
  }

  const handleDeleteCond = async (id) => {
    if (!confirm('¿Eliminar esta condición?')) return
    setCondDeleting(id)
    try {
      await deleteCondition(id)
      setLocalConds(p=>p.filter(c=>c.id!==id))
    } catch(e) { alert(e.message) }
    finally { setCondDeleting(null) }
  }

  const upd = (path, val) => {
    setSettings(s => {
      const n = {...s}
      const parts = path.split('.')
      let cur = n
      for (let i=0; i<parts.length-1; i++) { cur[parts[i]] = cur[parts[i]]||{}; cur = cur[parts[i]] }
      cur[parts[parts.length-1]] = val
      return n
    })
    setDirty(true)
  }

  const handleSave = () => { saveSettingsRemote(settings); setDirty(false); onClose() }

  const testGroq = async () => {
    setGroqStatus('testing')
    try {
      const r = await fetch('/api/groq-help', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-groq-key': settings.integrations?.groqKey||''},
        body: JSON.stringify({topic:'EMA Rápida'})
      })
      setGroqStatus(r.ok ? 'ok' : 'err')
    } catch(_) { setGroqStatus('err') }
  }

  const TABS = [
    { id:'integraciones', label:'🔌 Integraciones' },
    { id:'alarmas',       label:'🔔 Alertas' },
    { id:'condiciones',   label:'⚡ Condiciones' },
    { id:'grafico',       label:'📈 Gráfico' },
    { id:'ranking',       label:'🏆 Ranking' },
    { id:'watchlist',     label:'📋 Watchlist' },
      { id:'tradelog_cfg',  label:'📒 TradeLog' },
  ]

  const inp = (val, onChange, opts={}) => (
    <input
      type={opts.type||'text'} value={val||''} onChange={e=>onChange(e.target.value)}
      placeholder={opts.placeholder||''}
      style={{
        background:'#080c14', border:'1px solid #1a2d45', borderRadius:4,
        color:'#e2eaf5', fontFamily:MONO, fontSize:13, padding:'8px 12px',
        width:'100%', boxSizing:'border-box',
        ...(opts.mono ? {letterSpacing:'0.04em'} : {})
      }}
    />
  )

  const row = (label, tip, children) => (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0',letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span>
        {tip&&<span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a'}}>{tip}</span>}
      </div>
      {children}
    </div>
  )

  const sep = (title) => (
    <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a85',letterSpacing:'0.10em',textTransform:'uppercase',
      borderBottom:'1px solid #1a2d45',paddingBottom:6,marginBottom:14,marginTop:6}}>{title}</div>
  )

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.65)'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#0a101a', border:'1px solid #1a2d45', borderRadius:10,
        width:'min(860px,96vw)', maxHeight:'92vh', display:'flex', flexDirection:'column',
        boxShadow:'0 16px 60px rgba(0,0,0,0.7)', fontFamily:MONO
      }}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 20px 0', borderBottom:'1px solid #0d1520', paddingBottom:0}}>
          <div style={{fontSize:16,fontWeight:700,color:'#e2eaf5',letterSpacing:'0.04em'}}>⚙ Configuración</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#5a7a95',fontSize:16,cursor:'pointer',padding:'0 4px',lineHeight:1}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid #0d1520',padding:'0 20px',marginTop:0,flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:'none', border:'none', borderBottom: tab===t.id ? '2px solid #00d4ff' : '2px solid transparent',
              color: tab===t.id ? '#00d4ff' : '#5a7a95', fontFamily:MONO, fontSize:11, padding:'12px 18px 10px',
              cursor:'pointer', letterSpacing:'0.06em', textTransform:'uppercase', transition:'color .15s'
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{overflowY:'auto',flex:1,minHeight:0,padding:'22px 28px'}}>

          {/* ── INTEGRACIONES ── */}
          {tab==='integraciones'&&(
            <div>
              {sep('Groq AI — Tooltips de ayuda')}
              {row('Groq API Key','(se guarda solo en tu navegador)',
                <div style={{display:'flex',gap:8}}>
                  <input
                    type="password" value={settings.integrations?.groqKey||''} placeholder="gsk_..."
                    onChange={e=>upd('integrations.groqKey',e.target.value)}
                    style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',letterSpacing:'0.06em'}}
                  />
                  <button onClick={testGroq} disabled={groqStatus==='testing'} style={{
                    padding:'6px 12px', borderRadius:4, border:'1px solid #1a2d45',
                    background: groqStatus==='ok'?'rgba(0,229,160,0.12)':groqStatus==='err'?'rgba(255,77,109,0.12)':'rgba(13,21,32,0.9)',
                    color: groqStatus==='ok'?'#00e5a0':groqStatus==='err'?'#ff4d6d':'#7a9bc0',
                    fontFamily:MONO, fontSize:11, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                  }}>
                    {groqStatus==='testing'?'⟳ ...' : groqStatus==='ok'?'✓ OK' : groqStatus==='err'?'✗ Error' : 'Probar'}
                  </button>
                </div>
              )}
              <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:-6}}>
                La clave se almacena únicamente en localStorage de tu navegador. Obtén una clave gratuita en <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{color:'#4a9fd4'}}>console.groq.com</a>
              </div>
            </div>
          )}

          {/* ── ALARMAS ── */}
          {tab==='alarmas'&&(
            <div>
              {sep('Canal de notificaciones')}
              {row('Método de envío','',
                <select value={settings.alarms?.method||'none'} onChange={e=>upd('alarms.method',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',width:'100%'}}>
                  <option value="none">Sin notificaciones</option>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook (Slack, Discord, etc.)</option>
                  <option value="telegram">Telegram</option>
                </select>
              )}

              {settings.alarms?.method==='email'&&(
                <>{sep('Email')}{row('Dirección de correo','',inp(settings.alarms?.email, v=>upd('alarms.email',v), {placeholder:'tu@email.com',type:'email'}))}</>
              )}

              {settings.alarms?.method==='webhook'&&(
                <>{sep('Webhook')}{row('URL del webhook','',inp(settings.alarms?.webhookUrl, v=>upd('alarms.webhookUrl',v), {placeholder:'https://hooks.slack.com/...'}))}</>
              )}

              {settings.alarms?.method==='telegram'&&(
                <>
                  {sep('Telegram')}
                  {row('Bot Token','',inp(settings.alarms?.telegramToken, v=>upd('alarms.telegramToken',v), {placeholder:'123456:ABC-...', mono:true}))}
                  {row('Chat ID','',inp(settings.alarms?.telegramChatId, v=>upd('alarms.telegramChatId',v), {placeholder:'-100123456789', mono:true}))}
                  <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:-6}}>
                    Crea un bot con @BotFather y añade el bot a tu canal/grupo para obtener el Chat ID.
                  </div>
                </>
              )}

              {sep('Parpadeo de alarmas')}
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Parpadear cuando la alarma lleva ≤ N velas activa</span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#ffd166',minWidth:24,textAlign:'right'}}>{settings.alarmas?.blinkCandles??3}</span>
                  <input type="range" min={1} max={20} value={settings.alarmas?.blinkCandles??3}
                    onChange={e=>upd('alarmas.blinkCandles',Number(e.target.value))}
                    style={{width:100,accentColor:'#ffd166'}}/>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5}}>
                  El círculo de alarma parpadeará si la condición se activó hace N velas o menos (día actual = 1).
                </div>
              </div>
              {sep('Opciones')}
              <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                <input type="checkbox"
                  checked={settings.alarmas?.popupOnTrigger!==false}
                  onChange={e=>upd('alarmas.popupOnTrigger',e.target.checked)}
                  style={{accentColor:'#ff4d6d',width:13,height:13}}/>
                <span style={{fontSize:11,color:'#cce0f5'}}>Mostrar popup cuando se activa una alarma</span>
              </label>
              {[
                ['alarms.onEntry',    'Notificar en señal de entrada'],
                ['alarms.onExit',     'Notificar en señal de salida'],
                ['alarms.onStop',     'Notificar al activar stop loss'],
                ['alarms.onPriceLvl', 'Notificar alarmas de precio en gráfico'],
              ].map(([key,label])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!settings[key.split('.')[0]]?.[key.split('.')[1]]}
                    onChange={e=>upd(key,e.target.checked)}
                    style={{accentColor:'#00d4ff',width:13,height:13}}/>
                  <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                </label>
              ))}
            </div>
          )}

          {/* ── CONDICIONES GLOBALES ── */}
          {tab==='condiciones'&&(()=>{
            if(localConds.length===0 && condTab==='list') openConditions()
            const CTYPE_LABELS={
              ema_cross_up:'EMA rápida > EMA lenta ↑',ema_cross_down:'EMA rápida < EMA lenta ↓',
              price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',
              price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
              rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
              rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
              macd_cross_up:'MACD cruza señal ↑',macd_cross_down:'MACD cruza señal ↓',
            }
            const paramSummary=(c)=>{
              const p=c.params||{}
              if(c.type.startsWith('ema_cross')||c.type.startsWith('price_above_ema')||c.type.startsWith('price_below_ema'))
                return `EMA ${p.ma_fast||'?'}/${p.ma_slow||'?'}`
              if(c.type.startsWith('price_above_ma')||c.type.startsWith('price_below_ma'))
                return `MA(${p.ma_period||'?'})`
              if(c.type.startsWith('rsi_'))
                return `RSI(${p.period||14}) nivel ${p.level||50}`
              if(c.type.startsWith('macd_'))
                return `MACD(${p.fast||12},${p.slow||26},${p.signal||9})`
              return ''
            }
            const manualParams=()=>{
              const t=manualForm.type
              if(t.startsWith('ema_cross')||t.startsWith('price_above_ema')||t.startsWith('price_below_ema')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['ma_fast','EMA Rápida',10],['ma_slow','EMA Lenta',11]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)||d}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              if(t.startsWith('price_above_ma')||t.startsWith('price_below_ma')) return(
                <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Período MA
                  <input type="number" value={manualForm.params?.ma_period||50} min={1}
                    onChange={e=>setManualForm(p=>({...p,params:{...p.params,ma_period:Number(e.target.value)}}))}
                    style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700}}/>
                </label>
              )
              if(t.startsWith('rsi_')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['period','Período',14],['level','Nivel',30]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)||d}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              if(t.startsWith('macd_')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['fast','Rápida',12],['slow','Lenta',26],['signal','Señal',9]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 6px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              return null
            }
            return(
              <div>
                {sep('Librería de condiciones')}
                <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.7,marginBottom:16}}>
                  Las condiciones son filtros reutilizables que puedes vincular a alarmas y watchlist.
                  Créalas con Groq IA (lenguaje natural) o manualmente.
                </div>
                {/* Sub-tabs */}
                <div style={{display:'flex',gap:0,marginBottom:18,borderBottom:'1px solid var(--border)'}}>
                  {[['list',`📋 Librería${localConds.length>0?' ('+localConds.length+')':''}`],['create','✨ Nueva condición']].map(([id,l])=>(
                    <button key={id} onClick={()=>setCondTab(id)} style={{padding:'10px 20px 9px',background:'none',border:'none',
                      borderBottom:condTab===id?'2px solid #00d4ff':'2px solid transparent',
                      color:condTab===id?'#00d4ff':'#7a9bc0',fontFamily:MONO,fontSize:12,cursor:'pointer',letterSpacing:'0.05em',fontWeight:condTab===id?700:400}}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* Lista */}
                {condTab==='list'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {localConds.length===0&&<div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'8px 0'}}>No hay condiciones. Crea una en "Nueva condición".</div>}
                    {localConds.map(c=>(
                      <div key={c.id} style={{background:'#0a1018',border:'1px solid #1a2d45',borderRadius:5,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                            <span style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:'#e8f4ff'}}>{c.name}</span>
                            {c.source==='groq'&&<span style={{fontFamily:MONO,fontSize:8,color:'#9b72ff',background:'rgba(155,114,255,0.1)',padding:'1px 5px',borderRadius:8,border:'1px solid rgba(155,114,255,0.3)'}}>IA</span>}
                          </div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',marginBottom:2}}>{CTYPE_LABELS[c.type]||c.type} · {paramSummary(c)}</div>
                          {c.description&&<div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',lineHeight:1.4}}>{c.description}</div>}
                        </div>
                        <button onClick={()=>handleDeleteCond(c.id)} disabled={condDeleting===c.id}
                          style={{background:'transparent',border:'none',color:'#ff4d6d',fontSize:13,cursor:'pointer',padding:'0 2px',flexShrink:0,opacity:condDeleting===c.id?0.4:1}}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Crear — Groq IA + Manual */}
                {condTab==='create'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    {/* Groq AI */}
                    <div style={{background:'rgba(155,114,255,0.07)',border:'1px solid rgba(155,114,255,0.25)',borderRadius:8,padding:18}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <span style={{fontFamily:MONO,fontSize:13,color:'#b89fff',fontWeight:700}}>✨ Crear con Groq IA</span>
                        {!settings.integrations?.groqKey&&(
                          <span style={{fontFamily:MONO,fontSize:10,color:'#ff8a50',background:'rgba(255,138,80,0.1)',border:'1px solid rgba(255,138,80,0.3)',borderRadius:3,padding:'3px 8px'}}>
                            ⚠ Configura la Groq API Key en Integraciones
                          </span>
                        )}
                      </div>
                      <textarea
                        value={groqInput} onChange={e=>setGroqInput(e.target.value)}
                        placeholder="Describe la condición en lenguaje natural. Ej: RSI de 14 períodos cruza hacia arriba el nivel 30"
                        rows={4}
                        style={{width:'100%',background:'#060c14',border:'1px solid rgba(155,114,255,0.3)',borderRadius:5,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'12px 14px',resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
                      />
                      <div style={{fontFamily:MONO,fontSize:10,color:'#5a6a80',lineHeight:1.5,marginTop:6}}>
                        Tipos soportados: cruce de EMAs · precio vs media · RSI (nivel y cruce) · MACD
                      </div>
                      {groqErr&&<div style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',marginTop:8,padding:'8px 10px',background:'rgba(255,77,109,0.08)',borderRadius:4}}>⚠ {groqErr}</div>}
                      <button onClick={handleGroqParse} disabled={groqParsing||!groqInput.trim()||!settings.integrations?.groqKey}
                        style={{marginTop:10,width:'100%',background:settings.integrations?.groqKey?'rgba(155,114,255,0.2)':'rgba(40,40,40,0.3)',
                          border:`1px solid ${settings.integrations?.groqKey?'rgba(155,114,255,0.5)':'#2a3a4a'}`,
                          color:settings.integrations?.groqKey?'#b89fff':'#4a6a80',fontFamily:MONO,fontSize:13,padding:'11px',borderRadius:5,
                          cursor:settings.integrations?.groqKey&&groqInput.trim()?'pointer':'not-allowed',fontWeight:700,
                          opacity:(groqParsing||!groqInput.trim()||!settings.integrations?.groqKey)?0.55:1}}>
                        {groqParsing?'⟳ Analizando…':'✨ Analizar con IA'}
                      </button>
                      {/* Preview */}
                      {groqPreview&&(
                        <div style={{marginTop:12,background:'rgba(0,229,160,0.07)',border:'1px solid rgba(0,229,160,0.3)',borderRadius:6,padding:16}}>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#00e5a0',letterSpacing:'0.08em',marginBottom:10,fontWeight:700}}>✓ RESULTADO — REVISA Y GUARDA</div>
                          <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:'#e8f4ff',marginBottom:5}}>{groqPreview.name}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0',marginBottom:4}}>{CTYPE_LABELS[groqPreview.type]||groqPreview.type} · <span style={{color:'#ffd166'}}>{JSON.stringify(groqPreview.params)}</span></div>
                          {groqPreview.description&&<div style={{fontFamily:MONO,fontSize:11,color:'#6a8a9a',marginBottom:12,lineHeight:1.5}}>{groqPreview.description}</div>}
                          <div style={{display:'flex',gap:8}}>
                            <button onClick={()=>handleSaveCond(groqPreview)} disabled={condSaving}
                              style={{flex:1,background:'rgba(0,229,160,0.18)',border:'1px solid #00e5a0',color:'#00e5a0',fontFamily:MONO,fontSize:13,padding:'10px',borderRadius:5,cursor:'pointer',fontWeight:700}}>
                              {condSaving?'Guardando…':'✓ Guardar condición'}
                            </button>
                            <button onClick={()=>setGroqPreview(null)}
                              style={{background:'transparent',border:'1px solid #2a3f55',color:'#5a7a95',fontFamily:MONO,fontSize:12,padding:'10px 14px',borderRadius:5,cursor:'pointer'}}>
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Separador */}
                    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
                      <div style={{flex:1,height:1,background:'#1a2d45'}}/>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',letterSpacing:'0.08em'}}>O MANUALMENTE</span>
                      <div style={{flex:1,height:1,background:'#1a2d45'}}/>
                    </div>

                    {/* Manual */}
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Nombre
                        <input type="text" value={manualForm.name} placeholder="Ej: Cruce alcista EMA 50/200"
                          onChange={e=>setManualForm(p=>({...p,name:e.target.value}))}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}/>
                      </label>
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>
                        <span style={{display:'flex',alignItems:'center',gap:5}}>Tipo de condición <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a'}}>— define qué señal evalúa la condición</span></span>
                        <select value={manualForm.type} onChange={e=>{
                          const t=e.target.value
                          // Pre-fill default params so save works without touching inputs
                          const defParams = t.startsWith('ema_cross')||t==='price_above_ema'||t==='price_below_ema'
                            ? {ma_fast:10,ma_slow:11}
                            : t==='price_above_ma'||t==='price_below_ma'
                            ? {ma_period:50}
                            : t.startsWith('rsi_')
                            ? {period:14,level:30}
                            : t.startsWith('macd_')
                            ? {fast:12,slow:26,signal:9}
                            : {}
                          setManualForm(p=>({...p,type:t,params:defParams}))
                        }}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}>
                          <optgroup label="EMA">
                            <option value="ema_cross_up">Cruce alcista de medias ↑</option>
                            <option value="ema_cross_down">Cruce bajista de medias ↓</option>
                            <option value="price_above_ema">Precio sobre EMA</option>
                            <option value="price_below_ema">Precio bajo EMA</option>
                          </optgroup>
                          <optgroup label="RSI">
                            <option value="rsi_cross_up">RSI cruza nivel hacia arriba</option>
                            <option value="rsi_cross_down">RSI cruza nivel hacia abajo</option>
                            <option value="rsi_above">RSI sobre nivel</option>
                            <option value="rsi_below">RSI bajo nivel</option>
                          </optgroup>
                          <optgroup label="MACD">
                            <option value="macd_cross_up">MACD cruza señal ↑</option>
                            <option value="macd_cross_down">MACD cruza señal ↓</option>
                          </optgroup>
                          <optgroup label="Media Móvil">
                            <option value="price_above_ma">Precio sobre media</option>
                            <option value="price_below_ma">Precio bajo media</option>
                          </optgroup>
                        </select>
                      </label>
                      {manualParams()}
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Descripción (opcional)
                        <input type="text" value={manualForm.description} placeholder="Explicación breve"
                          onChange={e=>setManualForm(p=>({...p,description:e.target.value}))}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}/>
                      </label>
                      <button onClick={()=>{if(!manualForm.name.trim())return;handleSaveCond(manualForm)}} disabled={condSaving||!manualForm.name.trim()}
                        style={{background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'11px',borderRadius:5,cursor:manualForm.name.trim()?'pointer':'not-allowed',fontWeight:700,opacity:(condSaving||!manualForm.name.trim())?0.5:1}}>
                        {condSaving?'Guardando…':'Guardar condición'}
                      </button>
                      {condSaveErr&&<div style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',marginTop:8,padding:'8px 10px',background:'rgba(255,77,109,0.08)',borderRadius:4}}>⚠ {condSaveErr}</div>}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── GRÁFICO ── */}
          {tab==='grafico'&&(
            <div>
              {sep('Colores de velas')}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                {[
                  ['chart.upColor',   'Vela alcista',  '#00e5a0'],
                  ['chart.downColor', 'Vela bajista',  '#ff4d6d'],
                  ['chart.emaRColor', 'EMA Rápida',    '#ffd166'],
                  ['chart.emaLColor', 'EMA Lenta',     '#ff4d6d'],
                ].map(([key,label,def])=>(
                  <div key={key} style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="color" value={settings[key.split('.')[0]]?.[key.split('.')[1]]||def}
                      onChange={e=>upd(key,e.target.value)}
                      style={{width:28,height:28,borderRadius:4,border:'1px solid #1a2d45',
                        cursor:'pointer',background:'none',padding:1}}/>
                    <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                  </div>
                ))}
              </div>

              {sep('Capital por defecto')}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Capital inicial por defecto para nuevas estrategias</span>
                <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:54,textAlign:'right'}}>€{(settings.defaultCapital??1000).toLocaleString('es-ES')}</span>
                <input type="number" min={100} step={100} value={settings.defaultCapital??1000}
                  onChange={e=>upd('defaultCapital',Number(e.target.value))}
                  style={{width:90,background:'#080c14',border:'1px solid #1a2d45',color:'#e2eaf5',
                    fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:4}}/>
              </div>
              {sep('Estrategia por defecto')}
              <div style={{marginBottom:16}}>                <div style={{fontSize:10,color:'#5a7a95',marginBottom:8,lineHeight:1.6}}>
                  La estrategia seleccionada se cargará automáticamente al abrir la app.
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <select value={settings.defaultStrategyId||''} onChange={e=>upd('defaultStrategyId',e.target.value||null)}
                    style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'6px 8px'}}>
                    <option value="">Sin estrategia por defecto</option>
                    {strategies.map(s=>(
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {settings.defaultStrategyId&&<span style={{fontFamily:MONO,fontSize:9,color:'#00e5a0'}}>✓</span>}
                </div>
              </div>

              {sep('Vista por defecto — Tabla resumen')}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Layout inicial tabla resumen</span>
                <select value={settings.ui?.defaultMetricsLayout??'multi'} onChange={e=>upd('ui.defaultMetricsLayout',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'4px 8px'}}>
                  <option value="grid">Grid</option>
                  <option value="panel">Panel simple</option>
                  <option value="multi">Panel vista multi-columna</option>
                </select>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Etiquetas trades por defecto</span>
                <select value={String(settings.ui?.defaultLabelMode??0)} onChange={e=>upd('ui.defaultLabelMode',Number(e.target.value))}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'4px 8px'}}>
                  <option value="0">Sin etiquetas</option>
                  <option value="1">Solo porcentaje</option>
                  <option value="2">% + € + días</option>
                </select>
              </div>

              {sep('Vista reciente (botón ⊡ / ⊞)')}
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Meses de historia (vista reciente)</span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:28,textAlign:'right'}}>{settings.chart?.recentMonths??3}m</span>
                  <input type="range" min={1} max={24} value={settings.chart?.recentMonths??3}
                    onChange={e=>upd('chart.recentMonths',Number(e.target.value))}
                    style={{width:100,accentColor:'#00d4ff'}}/>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5}}>
                  El botón ⊡ muestra los últimos N meses. ⊞ muestra todo el periodo del backtest.
                </div>
              </div>
              {sep('Visualización')}
              <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                <input type="checkbox"
                  checked={settings.chart?.autoFitOnLoad??true}
                  onChange={e=>upd('chart.autoFitOnLoad',e.target.checked)}
                  style={{accentColor:'#00d4ff',width:13,height:13}}/>
                <span style={{fontSize:11,color:'#cce0f5'}}>Auto-ajustar al cargar</span>
              </label>

              {sep('Rendimiento')}
              {row('Calidad de curvas equity','(más puntos = más lento)',
                <select value={settings.chart?.equityQuality||'normal'}
                  onChange={e=>upd('chart.equityQuality',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',width:'100%'}}>
                  <option value="fast">Rápido (100 pts)</option>
                  <option value="normal">Normal (300 pts)</option>
                  <option value="hq">Alta calidad (600 pts)</option>
                </select>
              )}
            </div>
          )}
        </div>

          {/* ── WATCHLIST ── */}
          {tab==='watchlist'&&(
            <div>
              {sep('Filtros visibles en la Watchlist')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:14}}>
                Elige qué filtros aparecen en la barra de la Watchlist. Los que desactives quedan ocultos
                pero siguen funcionando si los activas programáticamente.
              </div>
              {[
                ['watchlist.showFilterLista',    'Filtro por Lista',           true,  'Desplegable para filtrar por nombre de lista (General, Acciones, Índices…)'],
                ['watchlist.showFilterSearch',   'Buscador',                   true,  'Caja de búsqueda de símbolo o nombre de activo'],
                ['watchlist.showFilterFavorites','Solo Favoritos',             true,  'Toggle ★ para mostrar únicamente favoritos'],
                ['watchlist.showFilterAlarms',   'Filtro por Alarma activa',   true,  'Desplegable para filtrar activos que tienen una alarma específica activa'],
              ].map(([key,label,def,hint])=>(
                <div key={key} style={{marginBottom:12}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                    <input type="checkbox"
                      checked={settings[key.split('.')[0]]?.[key.split('.')[1]]??def}
                      onChange={e=>upd(key,e.target.checked)}
                      style={{accentColor:'#00d4ff',width:13,height:13}}/>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',fontWeight:600}}>{label}</span>
                  </label>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5,marginLeft:21,marginTop:2}}>{hint}</div>
                </div>
              ))}
              {sep('Apariencia')}
              {[
                ['watchlist.showRankBadge',  'Mostrar badge de ranking (🥇#2…)', true],
                ['watchlist.showListBadge',  'Mostrar etiqueta de lista en cada activo', true],
              ].map(([key,label,def])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                  <input type="checkbox"
                    checked={settings[key.split('.')[0]]?.[key.split('.')[1]]??def}
                    onChange={e=>upd(key,e.target.checked)}
                    style={{accentColor:'#00d4ff',width:13,height:13}}/>
                  <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                </label>
              ))}

              {sep('Condiciones visibles como puntos en la Watchlist')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:10}}>
                Selecciona qué condiciones se muestran como círculos de color en cada activo.
                Se evalúan en tiempo real — el número dentro indica las velas desde que se activó.
              </div>
              {(()=>{
                const libConds = lsGetConds()
                const condDotIds = settings?.watchlist?.condDotIds || []
                const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                if(libConds.length===0) return(
                  <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'8px 10px',
                    background:'rgba(0,0,0,0.15)',borderRadius:4,border:'1px dashed #1e3a52',lineHeight:1.6}}>
                    No hay condiciones en la librería.<br/>
                    Créalas en <b style={{color:'#00d4ff'}}>⚡ Condiciones</b>.
                  </div>
                )
                return(
                  <div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                      {libConds.map((c,i)=>{
                        const sel=condDotIds.includes(c.id)
                        const col=COND_COLORS[i%COND_COLORS.length]
                        return(
                          <div key={c.id} onClick={()=>{
                              const next=sel?condDotIds.filter(x=>x!==c.id):[...condDotIds,c.id]
                              upd('watchlist.condDotIds',next)
                            }}
                            style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
                              padding:'4px 9px',borderRadius:12,
                              border:`1px solid ${sel?col:'#1e3a52'}`,
                              background:sel?`${col}18`:'rgba(255,255,255,0.02)',
                              userSelect:'none'}}>
                            <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,display:'inline-block',
                              background:sel?col:'#2a3f55',
                              boxShadow:sel?`0 0 4px ${col}`:undefined}}/>
                            <span style={{fontFamily:MONO,fontSize:10,color:sel?col:'#7a9bc0'}}>{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>upd('watchlist.condDotIds',libConds.map(c=>c.id))}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #2a4060',background:'rgba(0,212,255,0.06)',color:'#00d4ff',cursor:'pointer'}}>
                        ✓ Todas
                      </button>
                      <button onClick={()=>upd('watchlist.condDotIds',[])}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #3a1a20',background:'rgba(255,77,109,0.06)',color:'#ff4d6d',cursor:'pointer'}}>
                        ✕ Ninguna
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── TEMA ── */}

          {/* ── RANKING ── */}
          {tab==='ranking'&&(
            <div>
              {sep('Pesos de la fórmula de scoring (total = 100%)')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:14}}>
                El score 0–100 de cada activo se calcula combinando estas 5 métricas.
                Ajusta los pesos según lo que más valoras en una estrategia.
                La penalización del Max DD reduce el score (resta).
              </div>
              {[
                ['ranking.w_winrate',    'Win Rate',                    settings.ranking?.w_winrate    ?? 25, 'Porcentaje de trades ganadores. Mide la consistencia de la estrategia.'],
                ['ranking.w_factorben',  'Factor de Beneficio',         settings.ranking?.w_factorben  ?? 25, 'Ratio ganancia bruta / pérdida bruta. >1 = estrategia rentable.'],
                ['ranking.w_cagr',       'CAGR',                        settings.ranking?.w_cagr       ?? 25, 'Tasa de crecimiento anual compuesto. Mide la rentabilidad real anualizada.'],
                ['ranking.w_robustez',   'CAGR sin top 3 trades',       settings.ranking?.w_robustez   ?? 20, 'CAGR excluyendo las 3 mejores operaciones. Mide la robustez real de la estrategia.'],
                ['ranking.w_dd',         'Max Drawdown (penalización)', settings.ranking?.w_dd         ?? 5,  'Penaliza el riesgo. Reduce el score según el máximo drawdown histórico.'],
              ].map(([key, label, val, hint])=>(
                <div key={key} style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>{label}</span>
                    <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:32,textAlign:'right'}}>{val}%</span>
                    <input type="range" min={0} max={50} value={val}
                      onChange={e=>upd(key,Number(e.target.value))}
                      style={{width:100,accentColor:'#00d4ff'}}/>
                  </div>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5,marginLeft:0}}>{hint}</div>
                </div>
              ))}
              {(()=>{
                const total=(settings.ranking?.w_winrate??25)+(settings.ranking?.w_factorben??25)+(settings.ranking?.w_cagr??25)+(settings.ranking?.w_robustez??20)+(settings.ranking?.w_dd??5)
                const ok=total===100
                return(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:5,
                    background:ok?'rgba(0,229,160,0.08)':'rgba(255,209,102,0.08)',
                    border:`1px solid ${ok?'rgba(0,229,160,0.3)':'rgba(255,209,102,0.4)'}`,marginTop:4}}>
                    <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:ok?'#00e5a0':'#ffd166'}}>
                      {ok?'✓ Total: 100%':`⚠ Total: ${total}% (debe ser 100%)`}
                    </span>
                    {!ok&&<button onClick={()=>{
                      // auto-normalize
                      const base={w_winrate:25,w_factorben:25,w_cagr:25,w_robustez:20,w_dd:5}
                      upd('ranking',{...settings.ranking,...base})
                    }} style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,
                      border:'1px solid #ffd166',background:'transparent',color:'#ffd166',cursor:'pointer'}}>
                      Restaurar por defecto
                    </button>}
                  </div>
                )
              })()}
              {sep('Otras opciones de ranking')}
              {[
                ['ranking.minTrades', 'Mínimo de trades para incluir en ranking', settings.ranking?.minTrades ?? 3],
              ].map(([key,label,val])=>(
                <div key={key} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>{label}</span>
                  <input type="number" value={val} min={1} max={50}
                    onChange={e=>upd(key,Number(e.target.value))}
                    style={{width:60,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'4px 8px',textAlign:'center'}}/>
                </div>
              ))}
            </div>
          )}

          {/* ── TRADELOG CONFIG ── */}
          {tab==='tradelog_cfg'&&(
            <div>


              {sep('Valores por defecto al registrar operación')}
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {[
                  ['tradelog.defaultBroker','Broker por defecto','ibkr'],
                  ['tradelog.defaultCurrency','Divisa por defecto','USD'],
                  ['tradelog.defaultCommission','Comisión por defecto (€)','0'],
                ].map(([key,label,def])=>(
                  <div key={key} style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',width:200,flexShrink:0}}>{label}</span>
                    {key==='tradelog.defaultBroker'
                      ? <select value={settings.tradelog?.defaultBroker||'ibkr'} onChange={e=>upd(key,e.target.value)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                          <option value="ibkr">IBKR</option><option value="degiro">Degiro</option>
                          <option value="myinvestor">MyInvestor</option><option value="binance">Binance</option>
                          <option value="manual">Manual</option>
                        </select>
                      : key==='tradelog.defaultCurrency'
                      ? <select value={settings.tradelog?.defaultCurrency||'USD'} onChange={e=>upd(key,e.target.value)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                          <option value="USD">USD</option><option value="EUR">EUR</option>
                          <option value="GBP">GBP</option><option value="CHF">CHF</option>
                        </select>
                      : <input type="number" min="0" step="0.01"
                          value={settings.tradelog?.defaultCommission??0}
                          onChange={e=>upd(key,parseFloat(e.target.value)||0)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}/>
                    }
                  </div>
                ))}
              </div>

              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',width:200,flexShrink:0}}>Formato fecha IBKR import</span>
                <select value={settings.tradelog?.ibkrDateFormat||'DD/MM'} onChange={e=>upd('tradelog.ibkrDateFormat',e.target.value)}
                  style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                  <option value="DD/MM">DD/MM/YYYY — Europa (IBKR España/UK)</option>
                  <option value="MM/DD">MM/DD/YYYY — USA</option>
                </select>
              </div>

              {sep('Condiciones visibles como puntos en el TradeLog')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:10}}>                Selecciona qué condiciones de la librería aparecen como círculos de color en la columna Símbolo del registro de operaciones.
              </div>
              {(()=>{
                const libConds=lsGetConds()
                const tlCondIds=settings?.tradelog?.condDotIds||[]
                const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                if(libConds.length===0) return(
                  <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'8px 10px',
                    background:'rgba(0,0,0,0.15)',borderRadius:4,border:'1px dashed #1e3a52',lineHeight:1.6,marginBottom:14}}>
                    No hay condiciones en la librería.<br/>
                    Créalas en <b style={{color:'#00d4ff'}}>⚡ Condiciones</b>.
                  </div>
                )
                return(
                  <div style={{marginBottom:14}}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                      {libConds.map((c,i)=>{
                        const sel=tlCondIds.includes(c.id)
                        const col=COND_COLORS[i%COND_COLORS.length]
                        return(
                          <div key={c.id} onClick={()=>{const next=sel?tlCondIds.filter(x=>x!==c.id):[...tlCondIds,c.id];upd('tradelog.condDotIds',next)}}
                            style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
                              padding:'4px 9px',borderRadius:12,
                              border:'1px solid '+(sel?col:'#1e3a52'),
                              background:sel?col+'18':'rgba(255,255,255,0.02)',userSelect:'none'}}>
                            <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,display:'inline-block',
                              background:sel?col:'#2a3f55',boxShadow:sel?'0 0 4px '+col:undefined}}/>
                            <span style={{fontFamily:MONO,fontSize:10,color:sel?col:'#7a9bc0'}}>{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>upd('tradelog.condDotIds',libConds.map(c=>c.id))}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #2a4060',background:'rgba(0,212,255,0.06)',color:'#00d4ff',cursor:'pointer'}}>
                        ✓ Todas
                      </button>
                      <button onClick={()=>upd('tradelog.condDotIds',[])}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #3a1a20',background:'rgba(255,77,109,0.06)',color:'#ff4d6d',cursor:'pointer'}}>
                        ✕ Ninguna
                      </button>
                    </div>
                  </div>
                )
              })()}



              {sep('Copia de seguridad de operaciones')}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button onClick={()=>{
                  try {
                    const trades = JSON.parse(localStorage.getItem('v50_tradelog')||'[]')
                    const d = new Date().toISOString().slice(0,10)
                    const blob = new Blob([JSON.stringify({version:'v50',date:d,trades},null,2)],{type:'application/json'})
                    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
                    a.download=`backup_${d}.json`; a.click(); URL.revokeObjectURL(a.href)
                  } catch(e){ alert('Error: '+e.message) }
                }} style={{padding:'7px 12px',borderRadius:4,border:'1px solid #9b72ff',
                  background:'rgba(155,114,255,0.1)',color:'#9b72ff',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
                  ⬇ Descargar backup (JSON)
                </button>
                <button onClick={()=>{
                  const input = document.createElement('input'); input.type='file'; input.accept='.json'
                  input.onchange = async e => {
                    try {
                      const text = await e.target.files[0].text()
                      const data = JSON.parse(text)
                      const trades = data.trades||data
                      if(!Array.isArray(trades)) throw new Error('Formato incorrecto')
                      if(!confirm(`¿Restaurar ${trades.length} operaciones? Se reemplazarán las actuales.`)) return
                      localStorage.setItem('v50_tradelog', JSON.stringify(trades))
                      alert(`✓ ${trades.length} operaciones restauradas`)
                    } catch(e){ alert('Error al restaurar: '+e.message) }
                  }
                  input.click()
                }} style={{padding:'7px 12px',borderRadius:4,border:'1px solid #1a2d45',
                  background:'transparent',color:'#7a9bc0',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
                  ⬆ Restaurar desde backup
                </button>
              </div>
              <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:8}}>
                El backup descargado es un fichero JSON con todas tus operaciones.
                Guárdalo en <span style={{color:'#ffd166'}}>[Carpeta elegida] / Backup operativa</span>.
              </div>
            </div>
          )}
        {/* Footer */}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 20px',
          borderTop:'1px solid #0d1520',flexShrink:0}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:4,border:'1px solid #1a2d45',
            background:'transparent',color:'#7a9bc0',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{padding:'7px 16px',borderRadius:4,border:'none',
            background: dirty ? '#00d4ff' : '#1a2d45',
            color: dirty ? '#080c14' : '#5a7a95',
            fontFamily:MONO,fontSize:11,fontWeight:700,cursor:'pointer',transition:'all .15s'}}>
            {dirty ? '✓ Guardar' : 'Guardado'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PriceAlarmQuickForm — diálogo rápido desde doble-clic ────
function PriceAlarmQuickForm({ price, symbol, alarms, onSave, onCancel }) {
  const [px, setPx] = useState(price.toFixed(2))
  const [cond, setCond] = useState('price_above')
  const [name, setName] = useState(`${symbol} @ ${price.toFixed(2)}`)
  const [saving, setSaving] = useState(false)
  const condLabels = { price_above:'Precio sube hasta', price_below:'Precio baja hasta' }
  const doSave = async () => {
    setSaving(true)
    await onSave({ symbol, name, condition:'price_level', price_level:Number(px), condition_detail:cond, active:true })
    setSaving(false)
  }
  return (
    <div style={{fontFamily:MONO,fontSize:12,display:'flex',flexDirection:'column',gap:10}}>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Condición</span>
        <select value={cond} onChange={e=>setCond(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 8px',borderRadius:4}}>
          <option value="price_above">Precio sube hasta...</option>
          <option value="price_below">Precio baja hasta...</option>
        </select>
      </label>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Precio</span>
        <input type="number" value={px} step="0.01" onChange={e=>setPx(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--accent)',color:'var(--text)',fontFamily:MONO,fontSize:13,padding:'6px 10px',borderRadius:4,fontWeight:700}}/>
      </label>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{color:'#7a9bc0',fontSize:10}}>Nombre</span>
        <input type="text" value={name} onChange={e=>setName(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 8px',borderRadius:4}}/>
      </label>
      <div style={{display:'flex',gap:8,marginTop:4}}>
        <button onClick={doSave} disabled={saving} style={{flex:1,background:'var(--accent)',border:'none',color:'#080c14',fontFamily:MONO,fontSize:12,fontWeight:700,padding:'8px',borderRadius:4,cursor:'pointer'}}>
          {saving?'Guardando…':'✓ Crear Alarma'}
        </button>
        <button onClick={onCancel} style={{padding:'8px 12px',background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:11,borderRadius:4,cursor:'pointer'}}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── CandleChart ───────────────────────────────────────────────
function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, labelMode, rulerActive, onChartReady, onPriceAlarm, syncRef, savedRangeRef, chartHeight=480 }) {
  const containerRef=useRef(null), svgRef=useRef(null), legendRef=useRef(null), tooltipRef=useRef(null)
  const chartRef=useRef(null), candlesRef=useRef(null)
  const chartAliveRef=useRef(true)
  const rulerStart=useRef(null), rulerActiveR=useRef(rulerActive)
  useEffect(()=>{
    rulerActiveR.current=rulerActive
    if(!rulerActive){
      rulerStart.current=null
      svgRef.current?.querySelectorAll('.ruler-el').forEach(el=>el.remove())
    }
  },[rulerActive])

  useEffect(()=>{
    if(typeof window==='undefined'||!containerRef.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(containerRef.current,{
        width:containerRef.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
      })
      chartRef.current=chart

      const candles=chart.addCandlestickSeries({
        upColor:'#00e5a0',downColor:'#ff4d6d',
        borderUpColor:'#00e5a0',borderDownColor:'#ff4d6d',
        wickUpColor:'#00e5a0',wickDownColor:'#ff4d6d'
      })
      candles.setData(data.map(d=>({time:d.date,open:d.open,high:d.high,low:d.low,close:d.close})))
      candlesRef.current=candles

      // EMA series — sin title para no generar leyenda inferior
      const erS=chart.addLineSeries({color:'#ffd166',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
      erS.setData(data.filter(d=>d.emaR!=null).map(d=>({time:d.date,value:d.emaR})))
      const elS=chart.addLineSeries({color:'#ff4d6d',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
      elS.setData(data.filter(d=>d.emaL!=null).map(d=>({time:d.date,value:d.emaL})))

      // Líneas de trades — diagonal P&L + horizontales entrada/stop estilo TV
      trades.forEach(t=>{
        if(!t.entryDate||!t.exitDate) return
        // Diagonal P&L
        const ls=chart.addLineSeries({color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',lineWidth:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        ls.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.exitPx}])
        // Línea horizontal blanca intermitente — nivel de entrada
        const entryLine=chart.addLineSeries({color:'rgba(255,255,255,0.65)',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        entryLine.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.entryPx}])
        // Línea horizontal roja — stop loss
        if(t.stopPx!=null){
          const stopLine=chart.addLineSeries({color:'rgba(255,77,109,0.8)',lineWidth:2,lineStyle:LineStyle.Solid,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
          stopLine.setData([{time:t.entryDate,value:t.stopPx},{time:t.exitDate,value:t.stopPx}])
        }
      })

      // ── Flechas de cruce EMA ──
      // shape:'circle' size:1 → punto invisible, solo muestra el texto diagonal ↗↘
      const marks=[]
      for(let i=1;i<data.length;i++){
        const p=data[i-1],c=data[i]
        if(!p.emaR||!p.emaL||!c.emaR||!c.emaL) continue
        if(p.emaR<p.emaL&&c.emaR>=c.emaL)
          marks.push({time:c.date,position:'belowBar',color:'#00e5a0',shape:'circle',size:1,text:'↗'})
        else if(p.emaR>p.emaL&&c.emaR<=c.emaL)
          marks.push({time:c.date,position:'aboveBar',color:'#ff4d6d',shape:'circle',size:1,text:'↘'})
      }
      if(marks.length) candles.setMarkers(marks)

      const ohlcMap={},erMap={},elMap={}
      data.forEach(d=>{ohlcMap[d.date]=d;if(d.emaR!=null)erMap[d.date]=d.emaR;if(d.emaL!=null)elMap[d.date]=d.emaL})

      // ── Imán Ctrl — snap al O/H/L/C más cercano (independiente de la regla) ──
      const snapToOHLC=(px,py,isCtrl)=>{
        if(!isCtrl) return {
          x:px, y:py,
          price:candlesRef.current?.coordinateToPrice(py),
          time:chart.timeScale().coordinateToTime(px)
        }
        const time=chart.timeScale().coordinateToTime(px)
        const bar=time&&ohlcMap[time]
        if(!bar) return {
          x:px, y:py,
          price:candlesRef.current?.coordinateToPrice(py),
          time
        }
        const candidates=[bar.open,bar.high,bar.low,bar.close]
        const snappedPrice=candidates.reduce((best,p)=>{
          const coord=candlesRef.current?.priceToCoordinate(p)
          const bestCoord=candlesRef.current?.priceToCoordinate(best)
          if(coord==null) return best
          return Math.abs(coord-py)<Math.abs(bestCoord-py)?p:best
        })
        const sy=candlesRef.current?.priceToCoordinate(snappedPrice)??py
        return {x:px, y:sy, price:snappedPrice, time}
      }

      // Punto visual del imán en SVG
      const NS2='http://www.w3.org/2000/svg'
      const snapDot=document.createElementNS(NS2,'circle')
      Object.entries({r:'4',fill:'none',stroke:'#ffd166','stroke-width':'1.5',display:'none',class:'snap-dot','pointer-events':'none'}).forEach(([k,v])=>snapDot.setAttribute(k,v))
      svgRef.current?.appendChild(snapDot)

      const ctrlState={pressed:false}
      const onKeyDown=(e)=>{if(e.key==='Control'){ctrlState.pressed=true}}
      const onKeyUp=(e)=>{if(e.key==='Control'){ctrlState.pressed=false;snapDot.setAttribute('display','none')}}
      window.addEventListener('keydown',onKeyDown)
      window.addEventListener('keyup',onKeyUp)
      const drawTradeLabels=()=>{
        const svg=svgRef.current; if(!svg||!candlesRef.current||!chartRef.current) return
        svg.querySelectorAll('.trade-label').forEach(el=>el.remove())
        const NS='http://www.w3.org/2000/svg'
        trades.forEach((t,idx)=>{
          if(!t.entryDate||!t.exitDate) return
          try {
            const ts=chartRef.current.timeScale()
            const x1=ts.timeToCoordinate(t.entryDate), x2=ts.timeToCoordinate(t.exitDate)
            if(x1==null||x2==null) return
            const midX=(x1+x2)/2
            // Precio medio del trade para la posición Y base
            const midPrice=(t.entryPx+t.exitPx)/2
            const pyBase=candlesRef.current.priceToCoordinate(midPrice)
            if(pyBase==null) return
            const isWin=t.pnlPct>=0
            const bc=isWin?'#00e5a0':'#ff4d6d'
            const g=document.createElementNS(NS,'g'); g.setAttribute('class','trade-label')

            const chartH=containerRef.current?.clientHeight||480
            const mkConnector=(y1start,y2end)=>{
              const l=document.createElementNS(NS,'line')
              Object.entries({x1:midX,y1:y1start,x2:midX,y2:y2end,
                stroke:bc,'stroke-width':'1','stroke-dasharray':'3,3','opacity':'0.45'
              }).forEach(([k,v])=>l.setAttribute(k,v))
              return l
            }

            if(labelMode===2){
              // ── Modo completo: % + € (sin fechas) ──
              const line1=`${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(2)}%`
              const line2=`€${t.pnlSimple>=0?'+':''}${Math.round(t.pnlSimple)}  ·  ${t.dias}d`
              const charW=8, BOX_H=40
              const w=Math.max(line1.length,line2.length)*charW+24
              const ZONE_TOP=22, ZONE_H=chartH*0.26
              const labelY=ZONE_TOP + (idx % 3)*(ZONE_H/3) + BOX_H/2
              const rect=document.createElementNS(NS,'rect')
              Object.entries({
                x:midX-w/2, y:labelY-BOX_H/2, width:w, height:BOX_H,
                fill:isWin?'rgba(0,229,160,0.18)':'rgba(255,77,109,0.18)',
                rx:'5', stroke:bc, 'stroke-width':'1.5'
              }).forEach(([k,v])=>rect.setAttribute(k,v))
              g.appendChild(rect)
              g.appendChild(mkConnector(labelY+BOX_H/2+2, Math.max(labelY+BOX_H/2+4,pyBase-4)))
              const mkT=(txt,y,sz)=>{
                const el=document.createElementNS(NS,'text')
                Object.entries({x:midX,y,'font-size':sz,'font-family':MONO,'text-anchor':'middle',fill:bc,'font-weight':'700'}).forEach(([k,v])=>el.setAttribute(k,v))
                el.textContent=txt; return el
              }
              g.appendChild(mkT(line1,labelY-4,'13'))
              g.appendChild(mkT(line2,labelY+12,'10.5'))

            } else if(labelMode===1){
              // ── Modo solo %: más grande, franja alta ──
              const ZONE_TOP=18, ZONE_H=chartH*0.22
              const labelY=ZONE_TOP + (idx % 4)*(ZONE_H/4) + 12
              const lbl=`${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(1)}%`
              const bw=lbl.length*8+14
              const bg=document.createElementNS(NS,'rect')
              Object.entries({
                x:midX-bw/2, y:labelY-14, width:bw, height:20,
                fill:isWin?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                rx:'3', stroke:bc, 'stroke-width':'0.7', opacity:'0.9'
              }).forEach(([k,v])=>bg.setAttribute(k,v))
              g.appendChild(bg)
              g.appendChild(mkConnector(labelY+6, pyBase-4))
              const txt=document.createElementNS(NS,'text')
              Object.entries({
                x:midX, y:labelY, 'font-size':'12', 'font-family':MONO,
                'text-anchor':'middle', fill:bc, 'font-weight':'700'
              }).forEach(([k,v])=>txt.setAttribute(k,v))
              txt.textContent=lbl
              g.appendChild(txt)
            }
            // labelMode===0 → no se añade nada al svg
            svg.appendChild(g)
          } catch(_){}
        })
      }

      // Redibujar etiquetas al hacer zoom/scroll — guardamos unsub para cleanup
      chartAliveRef.current=true
      const unsubLabels=chart.timeScale().subscribeVisibleTimeRangeChange(()=>{ if(chartAliveRef.current) setTimeout(()=>{ if(chartAliveRef.current) drawTradeLabels() },30) })

      // ── Regla SVG ──
      const svg=svgRef.current, NS='http://www.w3.org/2000/svg'
      const mk=(tag,attrs)=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el}
      const clearRuler=()=>{svg?.querySelectorAll('.ruler-el').forEach(el=>el.remove())}
      const drawRuler=(s,e)=>{
        clearRuler(); if(!svg) return
        const {x:x1,y:y1}=s,{x:x2,y:y2,price:pe,time:te}=e
        const diff=pe-s.price, pct=s.price>0?(diff/s.price)*100:0
        let days=0
        if(s.time&&te){
          const t1=typeof s.time==='string'?new Date(s.time).getTime():s.time*1000
          const t2=typeof te==='string'?new Date(te).getTime():te*1000
          days=Math.round(Math.abs(t2-t1)/86400000)
        }
        const addC=(el)=>{el.setAttribute('class','ruler-el');svg.appendChild(el);return el}
        addC(mk('line',{x1,y1,x2,y2:y1,stroke:'rgba(255,209,102,0.22)','stroke-width':'1','stroke-dasharray':'4,3'}))
        addC(mk('line',{x1:x2,y1,x2,y2,stroke:'rgba(255,209,102,0.22)','stroke-width':'1','stroke-dasharray':'4,3'}))
        addC(mk('line',{x1,y1,x2,y2,stroke:'#ffd166','stroke-width':'1.8'}))
        ;[[x1,y1],[x2,y2]].forEach(([cx,cy])=>addC(mk('circle',{cx,cy,r:'3',fill:'#ffd166',stroke:'#080c14','stroke-width':'1'})))
        const mx=(x1+x2)/2, lineAngle=Math.atan2(y2-y1,x2-x1)
        // Label: 26px perpendicular above the midpoint of the line
        const perp = lineAngle - Math.PI/2
        const lx = mx + Math.cos(perp)*26, ly = (y1+y2)/2 + Math.sin(perp)*26
        const label=`${days}d  ${diff>=0?'+':''}${pct.toFixed(2)}%`
        const bw=label.length*7+14
        addC(mk('rect',{x:lx-bw/2,y:ly-10,width:bw,height:16,fill:'rgba(8,12,20,0.96)',rx:'3',stroke:'#ffd166','stroke-width':'0.8'}))
        const txt=addC(mk('text',{x:lx,y:ly+1,fill:'#ffd166','font-size':'10','font-family':MONO,'text-anchor':'middle','dominant-baseline':'middle'}))
        txt.textContent=label
      }

      const getPoint=(px,py)=>snapToOHLC(px,py,ctrlState.pressed)
      const cnt=containerRef.current

      // ── Ruler: click sets start/end; dblclick anywhere clears; dblclick outside ruler = price alarm ──
      const rulerFixed=svgRef.current  // frozen ruler lives in svg; check if line exists
      const rulerExists=()=>svgRef.current?.querySelector('.ruler-el')!=null
      chart.subscribeClick(param=>{
        if(!rulerActiveR.current) return
        if(param.point==null) return
        const px=param.point.x, py=param.point.y
        const price=candlesRef.current?.coordinateToPrice(py)
        const time=param.time
        if(!rulerStart.current){
          rulerStart.current={x:px,y:py,price,time}
        } else {
          // freeze: keep SVG, clear start ref
          rulerStart.current=null
        }
      })
      chart.subscribeDblClick(param=>{
        if(rulerActiveR.current){
          // dblclick while ruler active → clear ruler
          rulerStart.current=null; clearRuler(); return
        }
        // dblclick while ruler inactive → price alarm
        if(onPriceAlarm&&param.point&&param.point.y!=null){
          const price=candlesRef.current?.coordinateToPrice(param.point.y)
          if(price!=null) onPriceAlarm(Math.round(price*100)/100)
        }
      })

      const onMove=e=>{
        const rect=containerRef.current.getBoundingClientRect()
        const px=e.clientX-rect.left,py=e.clientY-rect.top
        if(ctrlState.pressed){
          const snapped=snapToOHLC(px,py,true)
          snapDot.setAttribute('cx',String(snapped.x))
          snapDot.setAttribute('cy',String(snapped.y))
          snapDot.setAttribute('display','block')
        } else { snapDot.setAttribute('display','none') }
        if(rulerActiveR.current&&rulerStart.current) drawRuler(rulerStart.current,getPoint(px,py))
      }
      cnt.addEventListener('mousemove',onMove)

      // ── Leyenda OHLC + EMAs ──
      chart.subscribeCrosshairMove(param=>{
        const leg=legendRef.current
        if(leg){
          if(param.time){
            const b=ohlcMap[param.time],er=erMap[param.time],el=elMap[param.time]
            if(b){
              const chg=b.close-b.open,pct=(chg/b.open)*100,cc=chg>=0?'#00e5a0':'#ff4d6d'
              leg.innerHTML=
                `<span style="color:#7a9bc0;margin-right:8px">${b.date}</span>`+
                `<span style="margin-right:7px">O <b>${f2(b.open)}</b></span>`+
                `<span style="margin-right:7px">H <b style="color:#00e5a0">${f2(b.high)}</b></span>`+
                `<span style="margin-right:7px">L <b style="color:#ff4d6d">${f2(b.low)}</b></span>`+
                `<span style="margin-right:12px">C <b>${f2(b.close)}</b></span>`+
                `<span style="color:${cc};margin-right:14px">${chg>=0?'+':''}${f2(chg)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</span>`+
                (er!=null?`<span style="margin-right:7px">EMA${emaRPeriod} <b style="color:#ffd166">${f2(er)}</b></span>`:'')+
                (el!=null?`<span>EMA${emaLPeriod} <b style="color:#ff4d6d">${f2(el)}</b></span>`:'')
            }
          } else leg.innerHTML=''
        }
        // Tooltip de trade (solo cuando etiquetas OFF)
        const tt=tooltipRef.current
        if(tt){
          if(!param.time||!param.point){tt.style.display='none';return}
          const trade=trades.find(t=>t.entryDate<=param.time&&param.time<=t.exitDate)
          if(!trade){tt.style.display='none';return}
          const bc=trade.pnlPct>=0?'#00e5a0':'#ff4d6d'
          const w=containerRef.current?.clientWidth||600
          tt.style.display='block'
          tt.style.left=((param.point.x+210>w)?param.point.x-220:param.point.x+16)+'px'
          tt.style.top=Math.max(8,param.point.y-70)+'px'
          tt.style.borderColor=bc
          tt.innerHTML=
            `<div style="font-size:10px;color:#7a9bc0;margin-bottom:4px">${fmtDate(trade.entryDate)} → ${fmtDate(trade.exitDate)}</div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Capital</span><b style="color:#e2eaf5">€${f2(trade.capitalTras)}</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Profit</span><b style="color:${bc}">${trade.pnlPct>=0?'+':''}${trade.pnlPct.toFixed(2)}%</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">P&L</span><b style="color:${bc}">${trade.pnlSimple>=0?'€+':'€-'}${f2(Math.abs(trade.pnlSimple))}</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Días</span><span>${trade.dias}</span></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Max DD</span><span style="color:#ff4d6d">${maxDD.toFixed(2)}%</span></div>`
        }
      })

      // addDays: extend 'to' past last bar → permanent right gap, immune to resets
      const GAP_DAYS = 12  // calendar days of right margin
      const addDays=(dateStr,n)=>{ const d=new Date(dateStr); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0] }
      // Restore saved range OR default to last 3 months
      try {
        if(savedRangeRef?.current){
          const r=savedRangeRef.current
          const lastBar=data[data.length-1]
          const minTo=lastBar?addDays(lastBar.date,GAP_DAYS):r.to
          const finalTo=r.to>=minTo?r.to:minTo
          chart.timeScale().setVisibleRange({from:r.from, to:finalTo})
        } else {
          const lastBar = data[data.length-1]
          if(lastBar){
            const from = new Date(lastBar.date)
            from.setMonth(from.getMonth()-3)
            chart.timeScale().setVisibleRange({
              from: from.toISOString().split('T')[0],
              to:   addDays(lastBar.date, GAP_DAYS)
            })
          }
        }
      } catch(_){ chart.timeScale().fitContent() }
      // Save range whenever user zooms/scrolls — always bake in GAP_DAYS on 'to'
      chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
        if(range && savedRangeRef){
          const lastBar=data[data.length-1]
          const toStr = typeof range.to==='object'
            ? `${range.to.year}-${String(range.to.month).padStart(2,'0')}-${String(range.to.day).padStart(2,'0')}`
            : String(range.to)
          const fromStr = typeof range.from==='object'
            ? `${range.from.year}-${String(range.from.month).padStart(2,'0')}-${String(range.from.day).padStart(2,'0')}`
            : String(range.from)
          // Always ensure 'to' is at least lastBar.date + GAP_DAYS
          const minTo = lastBar ? addDays(lastBar.date, GAP_DAYS) : toStr
          const finalTo = toStr >= minTo ? toStr : minTo
          savedRangeRef.current = {from: fromStr, to: finalTo}
        }
      })

      // ── Cross-chart time sync ──
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{
          try{unsub()}catch(_){}
          if(syncRef.current) syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)
        }
      }

      // Exponer navigateTo + fitAll + captureChart
      if(onChartReady) onChartReady({
        captureJpg:(wrapEl, captureSymbol, entryPrice)=>{
          try {
            // chart.takeScreenshot() returns HTMLCanvasElement with full chart (axes + candles)
            const chartCanvas = chart.takeScreenshot()
            if(!chartCanvas) return null

            const cw = chartCanvas.width, ch = chartCanvas.height

            // Build final canvas: background + chart + legend overlay
            const out = document.createElement('canvas')
            // Add header height (≈36px) on top
            const HEADER_H = 36
            out.width  = cw
            out.height = ch + HEADER_H
            const ctx = out.getContext('2d')

            // Background
            ctx.fillStyle = '#080c14'
            ctx.fillRect(0, 0, out.width, out.height)

            // Header bar with symbol + price info
            ctx.fillStyle = '#0d1520'
            ctx.fillRect(0, 0, out.width, HEADER_H)
            ctx.fillStyle = '#1a2d45'
            ctx.fillRect(0, HEADER_H - 1, out.width, 1)

            // Header text: SYMBOL  |  date  O H L C
            const lastBar = data[data.length - 1]
            if(lastBar) {
              ctx.font = 'bold 13px "JetBrains Mono", monospace'
              ctx.fillStyle = '#00d4ff'
              const displaySym = captureSymbol || emaRPeriod+'·'+emaLPeriod
              ctx.fillText(displaySym, 10, 22)
              const symEnd = ctx.measureText(displaySym).width + 16
              ctx.font = '10px "JetBrains Mono", monospace'
              ctx.fillStyle = '#3d5a7a'
              ctx.fillText(lastBar.date || '', symEnd, 22)
              const dateEnd = symEnd + ctx.measureText(lastBar.date || '').width + 14
              ctx.font = '11px "JetBrains Mono", monospace'
              const chg = lastBar.close - lastBar.open
              const pct = (chg / lastBar.open * 100).toFixed(2)
              const ohlc = [
                ['O', lastBar.open?.toFixed(2), '#e2eaf5'],
                ['H', lastBar.high?.toFixed(2), '#00e5a0'],
                ['L', lastBar.low?.toFixed(2),  '#ff4d6d'],
                ['C', lastBar.close?.toFixed(2),'#e2eaf5'],
                [chg>=0?`+${pct}%`:`${pct}%`, '', chg>=0?'#00e5a0':'#ff4d6d'],
              ]
              let x = dateEnd + 8
              ohlc.forEach(([label, val, col])=>{
                if(val) {
                  ctx.fillStyle = '#5a7a95'
                  ctx.fillText(label+' ', x, 22)
                  x += ctx.measureText(label+' ').width
                  ctx.fillStyle = col
                  ctx.fillText(val+'  ', x, 22)
                  x += ctx.measureText(val+'  ').width
                } else {
                  ctx.fillStyle = col
                  ctx.fillText(label+'  ', x, 22)
                  x += ctx.measureText(label+'  ').width
                }
              })
            }

            // Draw chart below header
            ctx.drawImage(chartCanvas, 0, HEADER_H)

            // Línea amarilla de precio de entrada
            if(entryPrice && candlesRef.current) {
              try {
                const py = candlesRef.current.priceToCoordinate(entryPrice)
                if(py != null) {
                  const lineY = HEADER_H + py
                  ctx.strokeStyle = '#ffd166'
                  ctx.lineWidth = 1.5
                  ctx.setLineDash([6, 4])
                  ctx.beginPath()
                  ctx.moveTo(0, lineY)
                  ctx.lineTo(cw, lineY)
                  ctx.stroke()
                  ctx.setLineDash([])
                  // Etiqueta precio
                  ctx.font = 'bold 10px "JetBrains Mono", monospace'
                  const priceLabel = entryPrice.toFixed(2)
                  const lw = ctx.measureText(priceLabel).width + 8
                  ctx.fillStyle = 'rgba(255,209,102,0.18)'
                  ctx.fillRect(4, lineY - 9, lw, 13)
                  ctx.strokeStyle = '#ffd166'
                  ctx.lineWidth = 0.7
                  ctx.setLineDash([])
                  ctx.strokeRect(4, lineY - 9, lw, 13)
                  ctx.fillStyle = '#ffd166'
                  ctx.fillText(priceLabel, 8, lineY + 2)
                }
              } catch(_){}
            }

            return out.toDataURL('image/jpeg', 0.93)
          } catch(e) {
            // Fallback: composite ALL canvases in the container
            try {
              const canvases = Array.from(containerRef.current?.querySelectorAll('canvas')||[])
              if(!canvases.length) return null
              // Find the largest canvas (main chart canvas)
              const main = canvases.reduce((a,b)=>b.width*b.height>a.width*a.height?b:a)
              const w = main.width, h = main.height
              const out = document.createElement('canvas')
              out.width = w; out.height = h
              const ctx = out.getContext('2d')
              ctx.fillStyle = '#080c14'
              ctx.fillRect(0,0,w,h)
              // Draw all same-size canvases (layers)
              canvases.filter(c=>c.width===w&&c.height===h)
                .forEach(c=>{ try{ ctx.drawImage(c,0,0) }catch(_){} })
              return out.toDataURL('image/jpeg', 0.93)
            } catch(_){ return null }
          }
        },
        scrollBy:(bars)=>{ try{ chart.timeScale().scrollToPosition(chart.timeScale().scrollPosition()-bars, false) }catch(_){} },
        navigateTo:(entryDate,exitDate)=>{
          try{
            const pad=Math.max(5,Math.round((new Date(exitDate)-new Date(entryDate))/86400000*0.3))
            const d1=new Date(entryDate); d1.setDate(d1.getDate()-pad)
            const d2=new Date(exitDate); d2.setDate(d2.getDate()+pad+6)
            chart.timeScale().setVisibleRange({from:d1.toISOString().split('T')[0],to:d2.toISOString().split('T')[0]})
          }catch(_){}
        },
        fitAll:()=>{ try{ const lb=data[data.length-1]; if(lb){ const fr=data[0]; chart.timeScale().setVisibleRange({from:fr.date,to:addDays(lb.date,GAP_DAYS)}) } else chart.timeScale().fitContent() }catch(_){} },
        showRecent:(months)=>{
          try{
            const lastBar=data[data.length-1]
            if(!lastBar) return
            const from=new Date(lastBar.date)
            from.setMonth(from.getMonth()-(months||3))
            chart.timeScale().setVisibleRange({from:from.toISOString().split('T')[0],to:addDays(lastBar.date,GAP_DAYS)})
          }catch(_){}
        },
        setRange:(from,to)=>{ try{ chart.timeScale().setVisibleRange({from,to}) }catch(_){} },
        showEntryLine:(entryDate, entryPrice, opts={})=>{
          // opts.permanent=true → no auto-remove; opts.label → texto eje precio
          if(!entryDate||!entryPrice) return
          try{
            const ep = parseFloat(entryPrice)
            const label = opts.label || '● ENTRADA'
            const color = opts.color || '#ffd166'
            // Línea horizontal fina en el precio de entrada
            const priceLine = candlesRef.current.createPriceLine({
              price: ep,
              color,
              lineWidth: 1,
              lineStyle: 0,   // sólida
              axisLabelVisible: true,
              title: label,
            })
            if(opts.permanent) return priceLine  // caller keeps reference for cleanup
            // No-permanent: auto-limpiar después de 6s
            setTimeout(()=>{ try{ candlesRef.current.removePriceLine(priceLine) }catch(_){} }, 6000)
          }catch(e){}
        },
        // Dibuja líneas permanentes de entradas abiertas del símbolo actual
        openEntryLinesRef: { current: [] },
        setOpenTradeLines:(openTrades)=>{
          if(!candlesRef.current) return
          // Limpiar líneas anteriores
          const prevLines = chartRef.current?._openEntryLines || []
          prevLines.forEach(pl=>{ try{ candlesRef.current.removePriceLine(pl) }catch(_){} })
          const newLines = openTrades.map(t=>{
            try{
              const ep = parseFloat(t.entry_price)
              if(!ep) return null
              const sym = t.symbol?.toUpperCase()
              return candlesRef.current.createPriceLine({
                price: ep,
                color: '#ffd166',
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: `${sym} ${ep.toFixed(2)} ●`,
              })
            }catch(_){ return null }
          }).filter(Boolean)
          if(chartRef.current) chartRef.current._openEntryLines = newLines
        }
      })

      const ro=new ResizeObserver(()=>{
        if(!containerRef.current||!chartRef.current) return
        try{chart.applyOptions({width:containerRef.current.clientWidth})}catch(_){}
        setTimeout(drawTradeLabels,50)
      })
      ro.observe(containerRef.current)
      setTimeout(drawTradeLabels,200)

      return()=>{chartAliveRef.current=false;try{unsubLabels()}catch(_){};cnt.removeEventListener('mousemove',onMove);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
    })
    return()=>{chartAliveRef.current=false;if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[data,emaRPeriod,emaLPeriod,trades,maxDD,labelMode])

  // Apply height changes without recreating chart
  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])

  return (
    <div style={{position:'relative'}}>
      <div ref={legendRef} style={{position:'absolute',top:8,left:8,zIndex:10,fontFamily:MONO,fontSize:12,color:'#7a9bc0',background:'rgba(8,12,20,0.82)',padding:'4px 10px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap'}}/>
      <div ref={containerRef} style={{minHeight:480}}/>
      <svg ref={svgRef} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:5}}/>
      <div ref={tooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #00e5a0',borderRadius:6,padding:'8px 12px',fontFamily:MONO,fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:200,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
    </div>
  )
}

// ── EquityChart — con curva compuesta ────────────────────────
function EquityChart({
  strategyCurve,bhCurve,sp500BHCurve,compoundCurve,
  maxDDStrategy,maxDDBH,maxDDSP500,maxDDCompound,
  maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,maxDDCompoundDate,
  capitalIni,showStrategy,showBH,showSP500,showCompound,syncRef,chartHeight=260
}) {
  const ref=useRef(null),chartRef=useRef(null),equityTooltipRef=useRef(null)
  useEffect(()=>{
    if(!ref.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      // Track series data by date for crosshair tooltip
      const equityDataByDate={}
      const trackSeries=(curve,key)=>{ curve?.forEach(p=>{ if(!equityDataByDate[p.date]) equityDataByDate[p.date]={}; equityDataByDate[p.date][key]=p.value }) }

      if(showStrategy&&strategyCurve?.length){
        chart.addLineSeries({color:'#00d4ff',lineWidth:2,lastValueVisible:true,priceLineVisible:false})
          .setData(strategyCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(strategyCurve,'st')
      }
      if(showCompound&&compoundCurve?.length){
        chart.addLineSeries({color:'#00e5a0',lineWidth:2,lastValueVisible:true,priceLineVisible:false})
          .setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(compoundCurve,'co')
      }
      if(showBH&&bhCurve?.length){
        chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false})
          .setData(bhCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(bhCurve,'bh')
      }
      if(showSP500&&sp500BHCurve?.length){
        chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,lastValueVisible:true,priceLineVisible:false})
          .setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(sp500BHCurve,'sp')
      }
      const base=strategyCurve||compoundCurve||bhCurve||sp500BHCurve
      if(base?.length)
        chart.addLineSeries({color:'#3d5a7a',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      const addDD=(curve,date,dd,color)=>{
        if(!date||!dd||!curve?.length) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓ -${dd.toFixed(1)}%`}])
      }
      if(showStrategy) addDD(strategyCurve,maxDDStrategyDate,maxDDStrategy,'#ff4d6d')
      if(showCompound) addDD(compoundCurve,maxDDCompoundDate,maxDDCompound,'#00a870')
      if(showBH)       addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c')
      if(showSP500)    addDD(sp500BHCurve,maxDDSP500Date,maxDDSP500,'#7b5fe0')
      // ── Cross-chart time sync ──
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current) syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      // Crosshair tooltip — valores de cada curva al pasar el cursor
      chart.subscribeCrosshairMove(param=>{
        const tt=equityTooltipRef.current; if(!tt) return
        if(!param.time||!param.point){tt.style.display='none';return}
        const d=equityDataByDate[param.time]
        if(!d){tt.style.display='none';return}
        const rows=[]
        const MONO2='"JetBrains Mono",monospace'
        if(d.st!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#00d4ff">Simple</span><b style="color:#00d4ff">€${d.st.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.co!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#00e5a0">Compuesta</span><b style="color:#00e5a0">€${d.co.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.bh!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#ffd166">B&H Activo</span><b style="color:#ffd166">€${d.bh.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.sp!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#9b72ff">B&H SP500</span><b style="color:#9b72ff">€${d.sp.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(!rows.length){tt.style.display='none';return}
        const cw=ref.current?.clientWidth||600
        tt.style.display='block'
        tt.style.left=((param.point.x+200>cw)?param.point.x-210:param.point.x+14)+'px'
        tt.style.top=Math.max(4,param.point.y-40)+'px'
        tt.innerHTML=`<div style="font-size:10px;color:#7a9bc0;margin-bottom:4px;font-family:${MONO2}">${param.time}</div>`+rows.join('')
      })

      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current&&chartRef.current){try{chart.applyOptions({width:ref.current.clientWidth})}catch(_){}}})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[strategyCurve,bhCurve,sp500BHCurve,compoundCurve,maxDDStrategy,maxDDBH,maxDDSP500,maxDDCompound,maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,maxDDCompoundDate,capitalIni,showStrategy,showBH,showSP500,showCompound])

  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])
  return (
    <div style={{position:'relative'}}>
      <div ref={ref} style={{minHeight:260}}/>
      <div ref={equityTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:180,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
    </div>
  )
}

// ── MultiCartChart ───────────────────────────────────────────
function MultiCartChart({simpleCurve,compoundCurve,bhCurve,sp500BHCurve,capitalIni,
  maxDDSimple,maxDDSimpleDate,maxDDCompound,maxDDCompoundDate,maxDDBH,maxDDBHDate,
  maxDDSP500,maxDDSP500Date,
  showSimple,showCompound,showBH,showSP500,onReady,syncRef,chartHeight=300}) {
  const ref=useRef(null),chartRef=useRef(null)

  useEffect(()=>{
    if(!ref.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      const base=simpleCurve||compoundCurve||bhCurve||sp500BHCurve
      if(base?.length) chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      if(showSimple&&simpleCurve?.length) chart.addLineSeries({color:'#00d4ff',lineWidth:2,lastValueVisible:true,priceLineVisible:false}).setData(simpleCurve.map(p=>({time:p.date,value:p.value})))
      if(showCompound&&compoundCurve?.length) chart.addLineSeries({color:'#00e5a0',lineWidth:2,lastValueVisible:true,priceLineVisible:false}).setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
      if(showBH&&bhCurve?.length) chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false}).setData(bhCurve.map(p=>({time:p.date,value:p.value})))
      if(showSP500&&sp500BHCurve?.length) chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,lastValueVisible:true,priceLineVisible:false}).setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
      const addDD=(curve,date,dd,color)=>{
        if(!date||!dd||!curve?.length) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓ -${dd.toFixed(1)}%`}])
      }
      if(showSimple) addDD(simpleCurve,maxDDSimpleDate,maxDDSimple,'#ff4d6d')
      if(showCompound) addDD(compoundCurve,maxDDCompoundDate,maxDDCompound,'#00a870')
      if(showBH) addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c')
      if(showSP500) addDD(sp500BHCurve,maxDDSP500Date,maxDDSP500,'#7b5fe0')
      // Cross-chart sync
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      if(onReady) onReady({fitAll:()=>{try{chart.timeScale().fitContent()}catch(_){}}})
      const ro=new ResizeObserver(()=>{if(ref.current&&chartRef.current){try{chart.applyOptions({width:ref.current.clientWidth})}catch(_){}}})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.remove();chartRef.current=null}}
  },[simpleCurve,compoundCurve,bhCurve,sp500BHCurve,capitalIni,maxDDSimple,maxDDSimpleDate,maxDDCompound,maxDDCompoundDate,maxDDBH,maxDDBHDate,maxDDSP500,maxDDSP500Date,showSimple,showCompound,showBH,showSP500])

  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])



  return <div ref={ref} style={{minHeight:chartHeight}}/>
}

// ── OccupancyBarChart — individual asset capital invested chart ────
// showMode: 'compound'|'simple' — independent filter, own toggle
function OccupancyBarChart({trades, chartData, capitalIni, syncRef, showMode='compound'}) {
  const ref=useRef(null), chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!trades?.length||!chartData?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode})=>{
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:100,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'transparent'},horzLines:{color:'rgba(26,45,69,0.4)'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.0}},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
        leftPriceScale:{visible:false},
      })
      chartRef.current=chart
      // Accumulate capital at each bar
      const color=showMode==='compound'?'rgba(0,229,160,':'rgba(0,212,255,'
      let lastCap=capitalIni
      const barData=chartData.map(d=>{
        const inPos=trades.some(t=>d.date>=t.entryDate&&d.date<=t.exitDate)
        if(showMode==='compound'){
          const t=trades.filter(x=>x.exitDate<=d.date)
          if(t.length) lastCap=t[t.length-1].capitalTras
          else lastCap=capitalIni
        } else { lastCap=capitalIni }
        return{time:d.date,value:inPos?lastCap:0}
      })
      // Area series for smooth filled look
      const area=chart.addAreaSeries({
        topColor:`${color}0.5)`,
        bottomColor:`${color}0.03)`,
        lineColor:`${color}0.9)`,
        lineWidth:1,
        crosshairMarkerVisible:false,
        lastValueVisible:false,priceLineVisible:false,
      })
      area.setData(barData)
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[trades,chartData,showMode,capitalIni])
  return <div ref={ref} style={{minHeight:100}}/>
}

// ── McOccupancyChart — MC capital invertido chart (same style as OccupancyBarChart) ──
function McOccupancyChart({occupancyCurve, compoundCurve, capitalIni, occMode='compound', syncRef}) {
  const ref=useRef(null), chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!occupancyCurve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode})=>{
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:100,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'transparent'},horzLines:{color:'rgba(26,45,69,0.4)'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.0}},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      const isComp=occMode==='compound'
      const color=isComp?'#00e5a0':'#00d4ff'
      const area=chart.addAreaSeries({
        lineColor:color,topColor:`${color}55`,bottomColor:`${color}08`,
        lineWidth:2,lastValueVisible:true,priceLineVisible:false,
        priceFormat:{type:'price',precision:0,minMove:1},
      })
      // Convert % occupancy → € amount invested
      const lastCompound=compoundCurve?.slice(-1)[0]?.value||capitalIni
      area.setData(occupancyCurve.map(p=>{
        const pct=p.value/100
        const total=isComp?lastCompound:capitalIni
        return{time:p.date,value:pct*total}
      }))
      // Sync
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[occupancyCurve,compoundCurve,capitalIni,occMode,syncRef])
  return <div ref={ref} style={{minHeight:100}}/>
}


// ── Strategy Builder — catálogo de tipos ────────────────────
const DEFAULT_DEFINITION = {
  filter:   { conditions:[], logic:'AND' },
  setup:    { type:'ema_cross_up', ma_type:'EMA', ma_fast:10, ma_slow:11 },
  trigger:  { type:'breakout_high', rolling:true, max_candles:null },
  abort:    { conditions:[{type:'ema_cross_down'},{type:'close_below_ma',ma_type:'EMA',ma_period:10}] },
  stop:     { type:'min_ma_low_signal', ma_type:'EMA', ma_period:10 },
  exit:     { type:'breakout_low_after_close_below_ma', ma_type:'EMA', ma_period:10 },
  management: { sin_perdidas:true, reentry:true },
  sizing:   { type:'fixed_capital', amount:(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital??1000}catch(_){return 1000}})(), years:5 },
}

// ── StrategyAIPanel — asistente IA para configurar estrategias ─
function StrategyAIPanel({ definition, onApply, onClose }) {
  const [messages, setMessages] = useState([
    { role:'assistant', content:'Hola. Descríbeme la estrategia que quieres implementar en lenguaje natural. Por ejemplo: "Quiero comprar cuando el precio cruza al alza una media móvil de 20 periodos y vender cuando cierra por debajo de ella, con un stop en el mínimo de la vela de entrada." \n\nTe ayudaré a configurar cada uno de los 8 pasos del constructor.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingConfig, setPendingConfig] = useState(null)
  const [pendingMissing, setPendingMissing] = useState(null)
  const [pendingName, setPendingName] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  const getGroqKey = () => {
    try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||'' } catch(_){ return '' }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMessages = [...messages, { role:'user', content:text }]
    setMessages(newMessages)
    setLoading(true)
    setPendingConfig(null)
    setPendingMissing(null)
    try {
      const key = getGroqKey()
      const r = await fetch('/api/strategy-ai', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-groq-key':key},
        body: JSON.stringify({ messages: newMessages.filter(m=>m.role!=='system').map(({role,content})=>({role,content})) })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error||'Error')
      const aiText = d.text

      // Parse strategy_config block
      const cfgMatch = aiText.match(/```strategy_config\n([\s\S]*?)```/)
      if (cfgMatch) {
        try {
          const cfg = JSON.parse(cfgMatch[1].trim())
          setPendingConfig(cfg)
          setPendingName(cfg.name||'Estrategia IA')
        } catch(_) {}
      }

      // Parse missing_feature block
      const missMatch = aiText.match(/```missing_feature\n([\s\S]*?)```/)
      if (missMatch) {
        try { setPendingMissing(JSON.parse(missMatch[1].trim())) } catch(_) {}
      }

      // Clean display text (remove code blocks for cleaner display)
      const displayText = aiText
        .replace(/```strategy_config[\s\S]*?```/g, '')
        .replace(/```missing_feature[\s\S]*?```/g, '')
        .trim()

      setMessages(prev=>[...prev, { role:'assistant', content:displayText, hasCfg:!!cfgMatch, hasMissing:!!missMatch }])
    } catch(e) {
      setMessages(prev=>[...prev, { role:'assistant', content:`Error: ${e.message}`, isError:true }])
    }
    setLoading(false)
    setTimeout(()=>inputRef.current?.focus(),100)
  }

  const applyConfig = () => {
    if (!pendingConfig) return
    const { name, ...defn } = pendingConfig
    onApply(defn, name)
    setMessages(prev=>[...prev, {
      role:'assistant',
      content:`✓ Configuración aplicada al constructor de estrategias. Puedes revisar y ajustar cada paso manualmente. ${name ? `Nombre: "${name}"` : ''}`
    }])
    setPendingConfig(null)
  }

  const copyMissingCode = () => {
    if (!pendingMissing) return
    const code = JSON.stringify(pendingMissing, null, 2)
    navigator.clipboard?.writeText(code)
    setMessages(prev=>[...prev,{role:'assistant',content:'📋 Código copiado al portapapeles. Pásalo al desarrollador para implementar la funcionalidad.'}])
  }

  const MSG_BG = { user:'rgba(0,212,255,0.08)', assistant:'rgba(13,21,32,0.6)' }
  const MSG_BORDER = { user:'rgba(0,212,255,0.25)', assistant:'rgba(26,45,69,0.6)' }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:800,
      display:'flex', alignItems:'stretch', justifyContent:'flex-end',
      pointerEvents:'none'
    }}>
      {/* Backdrop */}
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',pointerEvents:'all'}}
        onClick={onClose}/>

      {/* Panel */}
      <div style={{
        position:'relative', width:420, maxWidth:'90vw',
        display:'flex', flexDirection:'column',
        background:'#0a101a', borderLeft:'1px solid #1a2d45',
        boxShadow:'-8px 0 40px rgba(0,0,0,0.6)',
        pointerEvents:'all', zIndex:1
      }}>
        {/* Header */}
        <div style={{
          padding:'12px 16px', borderBottom:'1px solid #1a2d45',
          display:'flex', alignItems:'center', gap:10, flexShrink:0
        }}>
          <div style={{
            width:28,height:28,borderRadius:'50%',
            background:'linear-gradient(135deg,#9b72ff,#00d4ff)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:14,flexShrink:0
          }}>✦</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#e2eaf5'}}>Asistente de Estrategias</div>
            <div style={{fontFamily:MONO,fontSize:9,color:'#4a7fa0'}}>Powered by Groq · llama-3.3-70b</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#5a7a95',fontSize:16,cursor:'pointer',padding:'2px 6px'}}>✕</button>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
          {messages.map((m,i)=>(
            <div key={i} style={{
              background:MSG_BG[m.role]||MSG_BG.assistant,
              border:`1px solid ${MSG_BORDER[m.role]||MSG_BORDER.assistant}`,
              borderRadius:m.role==='user'?'8px 8px 2px 8px':'8px 8px 8px 2px',
              padding:'8px 12px', alignSelf:m.role==='user'?'flex-end':'flex-start',
              maxWidth:'90%'
            }}>
              <div style={{fontFamily:MONO,fontSize:11,color:m.isError?'#ff4d6d':'#cce0f5',lineHeight:1.65,whiteSpace:'pre-wrap'}}>
                {m.content}
              </div>
              {m.hasCfg&&pendingConfig&&(
                <div style={{marginTop:8,display:'flex',gap:6,alignItems:'center'}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#00e5a0',flex:1}}>
                    ✓ Configuración lista: "{pendingName}"
                  </div>
                  <button onClick={applyConfig} style={{
                    background:'rgba(0,229,160,0.15)',border:'1px solid #00e5a0',
                    color:'#00e5a0',fontFamily:MONO,fontSize:10,fontWeight:700,
                    padding:'4px 10px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'
                  }}>⚡ Aplicar al Builder</button>
                </div>
              )}
              {m.hasMissing&&pendingMissing&&(
                <div style={{marginTop:8}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#ffd166',marginBottom:4}}>
                    ⚠ Funcionalidad no disponible: {pendingMissing.description}
                  </div>
                  <button onClick={copyMissingCode} style={{
                    background:'rgba(255,209,102,0.1)',border:'1px solid #ffd166',
                    color:'#ffd166',fontFamily:MONO,fontSize:10,
                    padding:'4px 10px',borderRadius:4,cursor:'pointer'
                  }}>📋 Copiar código para el desarrollador</button>
                </div>
              )}
            </div>
          ))}
          {loading&&(
            <div style={{alignSelf:'flex-start',background:'rgba(13,21,32,0.6)',border:'1px solid #1a2d45',
              borderRadius:'8px 8px 8px 2px',padding:'8px 14px',fontFamily:MONO,fontSize:11,color:'#4a7fa0'}}>
              <span style={{animation:'pulse 1.2s infinite'}}>⟳ Pensando...</span>
            </div>
          )}
          <div ref={messagesEndRef}/>
        </div>

        {/* Input */}
        <div style={{padding:'10px 14px',borderTop:'1px solid #1a2d45',flexShrink:0}}>
          <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
              placeholder="Describe tu estrategia... (Enter=enviar, Shift+Enter=nueva línea)"
              rows={2}
              style={{
                flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:5,
                color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'8px 10px',
                resize:'none',lineHeight:1.5,
                outline:'none',transition:'border-color .15s',
              }}
              onFocus={e=>e.target.style.borderColor='#2a4a66'}
              onBlur={e=>e.target.style.borderColor='#1a2d45'}
            />
            <button onClick={send} disabled={loading||!input.trim()} style={{
              background:loading||!input.trim()?'rgba(26,45,69,0.5)':'linear-gradient(135deg,#9b72ff,#00d4ff)',
              border:'none',borderRadius:5,color:loading||!input.trim()?'#3d5a7a':'#080c14',
              fontFamily:MONO,fontSize:16,fontWeight:700,
              padding:'8px 14px',cursor:loading||!input.trim()?'not-allowed':'pointer',
              transition:'all .15s',flexShrink:0,alignSelf:'stretch'
            }}>➤</button>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginTop:5}}>
            {getGroqKey()?'✓ API Key configurada':'⚠ Sin API Key — configúrala en ⚙ Configuración → Integraciones'}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── StrategyBuilder — constructor jerárquico de 8 pasos ───────
// Cada paso tiene número, título, descripción y controles específicos.
function StrategyBuilder({ definition, setDefinition }) {
  const def = definition || DEFAULT_DEFINITION
  const [openStep, setOpenStep] = useState(null)  // null = todos colapsados, o índice del abierto

  const upd = (path, val) => {
    const d = JSON.parse(JSON.stringify(def))
    const keys = path.split('.'); let o = d
    for (let i=0; i<keys.length-1; i++) {
      if (o[keys[i]] === undefined) o[keys[i]] = {}
      o = o[keys[i]]
    }
    o[keys[keys.length-1]] = val
    setDefinition(d)
  }

  const sel = (path, val, opts, w) => (
    <select value={val||''} onChange={e=>upd(path,e.target.value)}
      style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,
        fontSize:11,padding:'4px 6px',borderRadius:3,width:w||'100%',boxSizing:'border-box'}}>
      {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
  const num = (path, val, min=1, max=500, step=1) => (
    <input type="number" value={val??''} min={min} max={max} step={step}
      onChange={e=>upd(path,Number(e.target.value))}
      style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,
        fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%',boxSizing:'border-box'}}/>
  )
  const chk = (path, val, label) => (
    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
      <input type="checkbox" checked={!!val} onChange={e=>upd(path,e.target.checked)}
        style={{accentColor:'var(--accent)',width:12,height:12}}/>
      {label}
    </label>
  )
  const row2 = (...children) => (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${children.length},1fr)`,gap:6}}>{children}</div>
  )
  const fld = (label, children) => (
    <div style={{marginBottom:6}}>
      <div style={{fontSize:9,color:'var(--text3)',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:3}}>{label}</div>
      {children}
    </div>
  )

  const MA_TYPES = [{v:'EMA',l:'EMA'},{v:'SMA',l:'SMA'}]

  // ── Filtros de mercado: lista editable ──
  const filt = def.filter || { conditions:[], logic:'AND' }
  const addFilter = () => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter = d.filter || {conditions:[],logic:'AND'}
    d.filter.conditions.push({type:'external_ma',symbol:'SP500',condition:'precio_ema',ma_type:'EMA',ma_period:10})
    setDefinition(d)
  }
  const removeFilter = (idx) => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter.conditions.splice(idx,1)
    setDefinition(d)
  }
  const updFilter = (idx, key, val) => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter.conditions[idx][key] = val
    setDefinition(d)
  }

  // ── Condiciones de abort: lista ──
  const abort = def.abort || { conditions:[] }
  const toggleAbort = (type) => {
    const d = JSON.parse(JSON.stringify(def))
    d.abort = d.abort || {conditions:[]}
    const idx = d.abort.conditions.findIndex(c=>c.type===type)
    if (idx>=0) d.abort.conditions.splice(idx,1)
    else d.abort.conditions.push(type==='close_below_ma'
      ? {type,ma_type:'EMA',ma_period:def.setup?.ma_fast||10}
      : {type})
    setDefinition(d)
  }
  const abortHas = (type) => abort.conditions?.some(c=>c.type===type)
  const abortCBMA = abort.conditions?.find(c=>c.type==='close_below_ma')

  const setup = def.setup || {}
  const trigger = def.trigger || {}
  const stop = def.stop || {}
  const exit = def.exit || {}
  const mgmt = def.management || {}
  const sizing = def.sizing || {}

  // ── Pasos definición ──
  const STEPS = [
    {
      num:1, key:'filter', color:'#9b72ff', label:'FILTER',
      desc:'¿Está el mercado en condición de operar?',
      summary: filt.conditions?.length
        ? filt.conditions.map(c=>`SP500 ${c.condition==='precio_ema'?'precio>EMA':'EMAr>EMAl'}`).join(' + ')
        : 'Sin filtro',
      body: (
        <div>
          {filt.conditions?.length > 1 && fld('Lógica entre condiciones',
            row2(sel('filter.logic', filt.logic||'AND', [{v:'AND',l:'Todas deben cumplirse (AND)'},{v:'OR',l:'Al menos una (OR)'}]))
          )}
          {(filt.conditions||[]).map((c,i)=>(
            <div key={i} style={{background:'rgba(155,114,255,0.06)',border:'1px solid rgba(155,114,255,0.25)',borderRadius:5,padding:'8px 10px',marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontSize:10,color:'#9b72ff',fontWeight:700}}>Condición {i+1}</span>
                <button onClick={()=>removeFilter(i)} style={{background:'none',border:'none',color:'#ff4d6d',cursor:'pointer',fontSize:12,padding:0}}>✕</button>
              </div>
              {fld('Símbolo', <select value={c.symbol||'SP500'} onChange={e=>updFilter(i,'symbol',e.target.value)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                <option value="SP500">SP500</option>
                <option value="OWN">Mismo activo</option>
              </select>)}
              {fld('Condición', <select value={c.condition||'precio_ema'} onChange={e=>updFilter(i,'condition',e.target.value)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                <option value="precio_ema">Precio sobre EMA rápida</option>
                <option value="ema_ema">EMA rápida sobre EMA lenta</option>
              </select>)}
              {row2(
                fld('Tipo MA', <select value={c.ma_type||'EMA'} onChange={e=>updFilter(i,'ma_type',e.target.value)}
                  style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                  <option value="EMA">EMA</option><option value="SMA">SMA</option>
                </select>),
                fld('Período', <input type="number" value={c.ma_period||10} min={1} max={500}
                  onChange={e=>updFilter(i,'ma_period',Number(e.target.value))}
                  style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)
              )}
            </div>
          ))}
          <button onClick={addFilter} style={{width:'100%',background:'rgba(155,114,255,0.08)',border:'1px dashed rgba(155,114,255,0.4)',color:'#9b72ff',fontFamily:MONO,fontSize:10,padding:'6px',borderRadius:4,cursor:'pointer'}}>
            + Añadir condición
          </button>
        </div>
      )
    },
    {
      num:2, key:'setup', color:'#ffd166', label:'SETUP',
      desc:'¿Se ha dado la señal de alerta?',
      summary: setup.type==='ema_cross_up'
        ? `Cruce alcista ${setup.ma_type||'EMA'}(${setup.ma_fast||10}) > ${setup.ma_type||'EMA'}(${setup.ma_slow||11})`
        : setup.type||'—',
      body: (
        <div>
          {fld('Tipo de señal', sel('setup.type', setup.type||'ema_cross_up', [
            {v:'ema_cross_up',l:'Cruce alcista de medias (EMA rápida > lenta)'},
            {v:'close_above_ma',l:'Cierre sobre MA'},
            {v:'rsi_cross_level',l:'RSI cruza nivel (sobrevendido)'},
          ]))}
          {setup.type==='ema_cross_up' && row2(
            fld('MA Rápida', row2(sel('setup.ma_type',setup.ma_type||'EMA',MA_TYPES,'70px'), num('setup.ma_fast',setup.ma_fast||10))),
            fld('MA Lenta',  row2(sel('setup.ma_type_slow',setup.ma_type_slow||setup.ma_type||'EMA',MA_TYPES,'70px'), num('setup.ma_slow',setup.ma_slow||11)))
          )}
          {setup.type==='close_above_ma' && row2(
            fld('Tipo MA', sel('setup.ma_type',setup.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('setup.ma_period',setup.ma_period||10))
          )}
          {setup.type==='rsi_cross_level' && row2(
            fld('Período RSI', num('setup.rsi_period',setup.rsi_period||14)),
            fld('Nivel (subir sobre)', num('setup.rsi_level',setup.rsi_level||30,1,99))
          )}
        </div>
      )
    },
    {
      num:3, key:'trigger', color:'#00d4ff', label:'TRIGGER',
      desc:'¿Cómo ejecuto la entrada?',
      summary: trigger.type==='breakout_high'
        ? `Breakout HIGH${trigger.rolling?' · rolling (actualiza nivel)':' · fijo'}`
        : trigger.type||'—',
      body: (
        <div>
          {fld('Tipo de entrada', sel('trigger.type', trigger.type||'breakout_high', [
            {v:'breakout_high',l:'Breakout del máximo de la vela de setup'},
            {v:'next_open',l:'Apertura de la siguiente vela'},
          ]))}
          {trigger.type==='breakout_high' && <>
            {chk('trigger.rolling', trigger.rolling!==false, 'Rolling: si no hay breakout, actualizar nivel al nuevo mínimo de máximos')}
            {trigger.rolling!==false && fld('Máx. velas en espera (vacío=ilimitado)',
              <input type="number" value={trigger.max_candles||''} min={1} max={100} placeholder="Ilimitado"
                onChange={e=>upd('trigger.max_candles',e.target.value?Number(e.target.value):null)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>
            )}
          </>}
        </div>
      )
    },
    {
      num:4, key:'abort', color:'#ff9a3c', label:'ABORT',
      desc:'¿Qué cancela la entrada pendiente?',
      summary: abort.conditions?.length
        ? abort.conditions.map(c=>c.type==='ema_cross_down'?'Cruce bajista':c.type==='close_below_ma'?`Cierre<${c.ma_type||'EMA'}(${c.ma_period||10})`:'?').join(' | ')
        : 'Sin abort',
      body: (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {chk('_abort_cross_down', abortHas('ema_cross_down'), 'Cruce bajista de EMAs (setup→abort)')}
          {abortHas('ema_cross_down') && <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,marginTop:-4}}>
            Usa las mismas EMAs definidas en el Setup
          </div>}
          {chk('_abort_close_below', abortHas('close_below_ma'), 'Cierre bajo MA rápida')}
          {abortHas('close_below_ma') && row2(
            fld('Tipo MA', <select value={abortCBMA?.ma_type||'EMA'}
              onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_type=e.target.value;setDefinition(d)}}
              style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
              <option value="EMA">EMA</option><option value="SMA">SMA</option>
            </select>),
            fld('Período', <input type="number" value={abortCBMA?.ma_period||10} min={1}
              onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_period=Number(e.target.value);setDefinition(d)}}
              style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)
          )}
          {/* Handlers especiales para los checkboxes de abort */}
          <div style={{display:'none'}}
            ref={el=>{
              if(!el) return
              // patch checkbox handlers after render
            }}
          />
        </div>
      )
    },
    {
      num:5, key:'stop', color:'#ff4d6d', label:'STOP LOSS',
      desc:'¿Dónde está mi límite de pérdida?',
      summary: stop.type==='min_ma_low_signal'
        ? `min(${stop.ma_type||'EMA'}(${stop.ma_period||10}), LOW setup)`
        : stop.type==='atr_based'
        ? `Entrada − ATR(${stop.atr_period||14}) × ${stop.atr_mult||1.0}`
        : stop.type==='none' ? 'Sin stop' : stop.type||'—',
      body: (
        <div>
          {fld('Tipo de stop', sel('stop.type', stop.type||'min_ma_low_signal', [
            {v:'min_ma_low_signal', l:'min(MA, LOW de la vela de setup)'},
            {v:'low_of_signal_candle', l:'Mínimo de la vela de setup'},
            {v:'low_of_entry_candle', l:'Mínimo de la vela de entrada'},
            {v:'atr_based', l:'Entrada − ATR × multiplicador'},
            {v:'none', l:'Sin stop loss'},
          ]))}
          {['min_ma_low_signal','low_of_signal_candle'].includes(stop.type||'min_ma_low_signal') && stop.type!=='low_of_signal_candle' && row2(
            fld('Tipo MA', sel('stop.ma_type',stop.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('stop.ma_period',stop.ma_period||10))
          )}
          {stop.type==='atr_based' && row2(
            fld('Período ATR', num('stop.atr_period',stop.atr_period||14)),
            fld('Multiplicador', num('stop.atr_mult',stop.atr_mult||1.0,0.1,10,0.1))
          )}
        </div>
      )
    },
    {
      num:6, key:'exit', color:'#00e5a0', label:'EXIT',
      desc:'¿Cómo salgo en profit?',
      summary: exit.type==='breakout_low_after_close_below_ma'
        ? `1ª vela cierre<${exit.ma_type||'EMA'}(${exit.ma_period||10}) → breakout LOW`
        : exit.type||'—',
      body: (
        <div>
          {fld('Tipo de salida', sel('exit.type', exit.type||'breakout_low_after_close_below_ma', [
            {v:'breakout_low_after_close_below_ma', l:'Breakout LOW tras 1ª vela de cierre bajo MA'},
            {v:'next_open_after_close_below_ma', l:'Apertura siguiente tras cierre bajo MA'},
            {v:'ema_cross_down', l:'Cruce bajista de EMAs (apertura siguiente)'},
            {v:'rsi_overbought', l:'RSI cruza nivel sobrecomprado'},
          ]))}
          {['breakout_low_after_close_below_ma','next_open_after_close_below_ma'].includes(exit.type||'breakout_low_after_close_below_ma') && row2(
            fld('Tipo MA', sel('exit.ma_type',exit.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('exit.ma_period',exit.ma_period||10))
          )}
          {exit.type==='rsi_overbought' && row2(
            fld('Período RSI', num('exit.rsi_period',exit.rsi_period||14)),
            fld('Nivel (bajar de)', num('exit.rsi_level',exit.rsi_level||70,1,99))
          )}
        </div>
      )
    },
    {
      num:7, key:'management', color:'#4a9fd4', label:'MANAGEMENT',
      desc:'Sin pérdidas · Re-entry',
      summary: [mgmt.sin_perdidas&&'Sin Pérdidas', mgmt.reentry&&'Re-Entry'].filter(Boolean).join(' + ') || 'Ninguno',
      body: (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            {chk('management.sin_perdidas', mgmt.sin_perdidas, 'Sin Pérdidas')}
            <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,lineHeight:1.5,marginTop:2}}>
              Mueve el stop al precio de entrada cuando el trade está en beneficio (low &gt; entrada).
            </div>
          </div>
          <div>
            {chk('management.reentry', mgmt.reentry, 'Re-Entry')}
            <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,lineHeight:1.5,marginTop:2}}>
              Tras una salida, si las EMAs siguen alcistas, busca nueva entrada en el breakout del HIGH
              de la 1ª vela que cierre sobre la EMA rápida.
            </div>
          </div>
        </div>
      )
    },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {STEPS.map((step,idx)=>{
        const isOpen = openStep===idx
        const stepColor = step.color
        return (
          <div key={step.key} style={{border:`1px solid ${isOpen?stepColor:'rgba(26,45,69,0.8)'}`,borderRadius:6,overflow:'hidden',transition:'border-color .15s'}}>
            {/* Header del paso */}
            <button onClick={()=>setOpenStep(isOpen?null:idx)} style={{
              width:'100%',display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
              background:isOpen?`${stepColor}12`:'transparent',border:'none',cursor:'pointer',textAlign:'left'
            }}>
              <span style={{
                minWidth:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background:isOpen?stepColor:'rgba(26,45,69,0.9)',
                color:isOpen?'#080c14':stepColor,fontFamily:MONO,fontSize:9,fontWeight:700,flexShrink:0
              }}>{step.num}</span>
              <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:stepColor,letterSpacing:'0.08em',flexShrink:0}}>{step.label}</span>
              <Tip id={step.key==='stop'?'stopLoss':step.key} style={{flexShrink:0}}/>
              <span style={{fontFamily:MONO,fontSize:9,color:'var(--text3)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{step.summary}</span>
              <span style={{color:'var(--text3)',fontSize:10,flexShrink:0}}>{isOpen?'▲':'▼'}</span>
            </button>

            {/* Cuerpo del paso */}
            {isOpen && (
              <div style={{padding:'10px 12px 12px',borderTop:`1px solid ${stepColor}30`}}>
                <div style={{fontFamily:MONO,fontSize:9,color:'var(--text3)',marginBottom:10,fontStyle:'italic'}}>
                  {step.desc}
                </div>
                {step.key==='abort'
                  ? (() => {
                      // Abort needs special handler - can't use upd for toggle array
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                            <input type="checkbox" checked={abortHas('ema_cross_down')} onChange={()=>toggleAbort('ema_cross_down')}
                              style={{accentColor:'#ff9a3c',width:12,height:12}}/>
                            Cruce bajista de EMAs
                          </label>
                          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                            <input type="checkbox" checked={abortHas('close_below_ma')} onChange={()=>toggleAbort('close_below_ma')}
                              style={{accentColor:'#ff9a3c',width:12,height:12}}/>
                            Cierre bajo MA
                          </label>
                          {abortHas('close_below_ma') && (
                            <div style={{marginLeft:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                              {fld('Tipo MA',<select value={abortCBMA?.ma_type||'EMA'}
                                onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_type=e.target.value;setDefinition(d)}}
                                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                                <option value="EMA">EMA</option><option value="SMA">SMA</option>
                              </select>)}
                              {fld('Período',<input type="number" value={abortCBMA?.ma_period||10} min={1}
                                onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_period=Number(e.target.value);setDefinition(d)}}
                                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)}
                            </div>
                          )}
                        </div>
                      )
                    })()
                  : step.body
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


// ── ContextThemeMenu — click derecho en cualquier sección ────
const TEMA_SECTIONS = {
  global:   { label:'🌐 Global (todo)', selector:'body *' },
  header:   { label:'📌 Header',        selector:'.header,.header *' },
  sidebar:  { label:'📋 Sidebar',       selector:'.sidebar,aside,.sidebar *' },
  chart:    { label:'📈 Gráfico',        selector:'.chart-wrap,.chart-wrap .chart-header *' },
  equity:   { label:'💹 Equity / barras',selector:'.equity-section,.equity-section *' },
  trades:   { label:'📑 Tabla trades',   selector:'.trades-section,.trades-section *' },
  metrics:  { label:'📊 Métricas',       selector:'.metrics-section *,div[style*="275px"] *' },
  tradelog: { label:'📒 TradeLog (global)',selector:'.tl-content,.tl-content *' },
  tl_table: { label:'📋 TradeLog tabla', selector:'.tl-ops-table,.tl-ops-table *' },
  tl_resumen:{ label:'📊 TradeLog resumen',selector:'.tl-resumen,.tl-resumen *' },
  modals:   { label:'🪟 Modales',        selector:'.tl-modal,.tl-modal *' },
}
const FONT_OPTIONS = [
  {id:'jetbrains', label:'JetBrains Mono'},
  {id:'ibmplex',   label:'IBM Plex Mono'},
  {id:'firacode',  label:'Fira Code'},
  {id:'system',    label:'System UI'},
]
function applyTema(temaFonts){
  try{
    const fontMap={jetbrains:'"JetBrains Mono","Fira Code",monospace',ibmplex:'"IBM Plex Mono",monospace',firacode:'"Fira Code","JetBrains Mono",monospace',system:'system-ui,sans-serif'}
    let css=''
    for(const [sec,cfg] of Object.entries(TEMA_SECTIONS)){
      const fc=temaFonts[sec]; if(!fc) continue
      const parts=[]
      if(fc.family) parts.push(`font-family:${fontMap[fc.family]||fontMap.jetbrains} !important`)
      if(fc.size)   parts.push(`font-size:${fc.size}px !important`)
      if(fc.color)  parts.push(`color:${fc.color} !important`)
      if(fc.bg)     parts.push(`background:${fc.bg} !important`)
      if(parts.length) css+=`${cfg.selector}{${parts.join(';')}}\n`
    }
    let el=document.getElementById('v50-tema-style')
    if(!el){el=document.createElement('style');el.id='v50-tema-style';document.head.appendChild(el)}
    el.textContent=css
  }catch(_){}
}
function ContextThemeMenu({ x, y, section, onClose, onSave }) {
  const [fonts, setFonts] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.tema?.fonts||{} }catch(_){ return {} }
  })
  const fc = fonts[section]||{}
  const saveTemaLS = (nf) => {
    try{
      const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
      s.tema = s.tema||{}; s.tema.fonts = nf
      localStorage.setItem('v50_settings', JSON.stringify(s))
    }catch(_){}
  }
  const saveTemaSupabase = async (nf) => {
    try{
      await fetch(SUPA_URL+'/rest/v1/user_settings?on_conflict=key',{
        method:'POST',
        headers:{...SUPA_H,'Prefer':'return=minimal,resolution=merge-duplicates'},
        body:JSON.stringify({key:'v50_tema_fonts',value:JSON.stringify(nf),updated_at:new Date().toISOString()})
      })
    }catch(_){}
  }
  const upd = (k,v) => {
    const nf = {...fonts, [section]:{...fc, [k]:v||undefined}}
    setFonts(nf)
    applyTema(nf)
    saveTemaLS(nf)
    saveTemaSupabase(nf)
    onSave && onSave(nf)
  }
  const reset = () => {
    const nf = {...fonts}; delete nf[section]
    setFonts(nf); applyTema(nf)
    saveTemaLS(nf)
    saveTemaSupabase(nf)
    onSave && onSave(nf)
  }
  const secInfo = TEMA_SECTIONS[section]||{}
  // Position: keep inside viewport
  const menuW=260, menuH=310
  const vw=typeof window!=='undefined'?window.innerWidth:1200
  const vh=typeof window!=='undefined'?window.innerHeight:800
  const left=Math.min(x, vw-menuW-12)
  const top=Math.min(y, vh-menuH-12)
  return (
    <>
      {/* Overlay para cerrar — solo si click FUERA del panel */}
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:9998}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:'fixed',left,top,zIndex:9999,width:menuW,
        background:'#0d1825',border:'1px solid #1e3a55',borderRadius:8,
        boxShadow:'0 8px 32px rgba(0,0,0,0.7)',fontFamily:MONO,fontSize:11,
        padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
          borderBottom:'1px solid #1a3040',paddingBottom:8,marginBottom:2}}>
          <span style={{color:'#00d4ff',fontWeight:700,fontSize:12}}>{secInfo.label}</span>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={reset} title="Restablecer sección"
              style={{background:'transparent',border:'1px solid #2d4a60',color:'#ff6b6b',
                fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',fontFamily:MONO}}>
              ↺ Reset
            </button>
            <button onClick={onClose} style={{background:'transparent',border:'none',
              color:'#5a7a95',fontSize:16,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button>
          </div>
        </div>
        {/* Sección selector */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>SECCIÓN</span>
          <select value={section} onChange={e=>{ onClose(); setTimeout(()=>onClose(),0) }}
            disabled style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
              color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}>
            {Object.entries(TEMA_SECTIONS).map(([k,v])=>
              <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {/* Fuente */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>FUENTE</span>
          <select value={fc.family||''} onChange={e=>upd('family',e.target.value)}
            style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
              color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}>
            <option value="">— Heredar —</option>
            {FONT_OPTIONS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        {/* Tamaño + color texto */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <label style={{display:'flex',flexDirection:'column',gap:3}}>
            <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>TAMAÑO</span>
            <input type="number" min="8" max="24" placeholder="px"
              value={fc.size||''} onChange={e=>upd('size',e.target.value?Number(e.target.value):undefined)}
              style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
          </label>
          <label style={{display:'flex',flexDirection:'column',gap:3}}>
            <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>COLOR TEXTO</span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <input type="color" value={fc.color||'#e2eaf5'}
                onChange={e=>upd('color',e.target.value)}
                style={{width:28,height:28,border:'none',background:'none',cursor:'pointer',padding:0}}/>
              <input type="text" value={fc.color||''} placeholder="#e2eaf5"
                onChange={e=>upd('color',e.target.value)}
                style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                  color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
            </div>
          </label>
        </div>
        {/* Fondo */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>COLOR FONDO</span>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <input type="color" value={fc.bg||'#080c14'}
              onChange={e=>upd('bg',e.target.value)}
              style={{width:28,height:28,border:'none',background:'none',cursor:'pointer',padding:0}}/>
            <input type="text" value={fc.bg||''} placeholder="transparent"
              onChange={e=>upd('bg',e.target.value)}
              style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
            {fc.bg&&<button onClick={()=>upd('bg',undefined)}
              style={{background:'transparent',border:'none',color:'#5a7a95',cursor:'pointer',fontSize:12}}>×</button>}
          </div>
        </label>
        <div style={{display:'flex',gap:6,borderTop:'1px solid #1a2d45',paddingTop:8,marginTop:2}}>
          <button onClick={onClose}
            style={{flex:1,background:'rgba(0,212,255,0.1)',border:'1px solid #00d4ff',color:'#00d4ff',
              fontFamily:MONO,fontSize:10,padding:'6px',borderRadius:4,cursor:'pointer',fontWeight:600}}>
            ✓ Guardar y cerrar
          </button>
        </div>
        <div style={{fontSize:9,color:'#3d5a7a',textAlign:'center'}}>
          Los cambios se aplican al instante · Clic fuera para cerrar
        </div>
      </div>
    </>
  )
}

// ── MetricRow — fila resumen con tooltip hover ──────────────
function MetricRow({label,value,color,tip}){
  const [hov,setHov]=useState(false)
  return(
    <tr style={{borderBottom:'1px solid rgba(26,45,69,0.5)',position:'relative',background:hov?'rgba(0,212,255,0.03)':'transparent'}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <td style={{padding:'4px 6px 4px 10px',fontFamily:MONO,fontSize:10,color:'#4a7a95',whiteSpace:'nowrap'}}>
        {label}
        {tip&&<span style={{marginLeft:3,color:hov?'#3a6a8a':'#2a4060',cursor:'help',fontSize:9}}>ⓘ</span>}
      </td>
      <td style={{padding:'4px 10px 4px 4px',textAlign:'right',fontFamily:MONO,fontSize:10,fontWeight:700,color:color,whiteSpace:'nowrap'}}>{value}</td>
      {hov&&tip&&(
        <div style={{position:'fixed',right:10,zIndex:999,pointerEvents:'none',width:240}}>
          <div style={{background:'#0a1520',border:'1px solid #1a4060',borderRadius:5,padding:'8px 10px',fontFamily:MONO,fontSize:9,color:'#8abccc',lineHeight:1.6,boxShadow:'0 6px 24px rgba(0,0,0,0.7)'}}>
            <div style={{color:'#4a8aaa',fontWeight:700,marginBottom:3,fontSize:10}}>{label}</div>
            {tip}
          </div>
        </div>
      )}
    </tr>
  )
}

// ── Main ─────────────────────────────────────────────────────
// ── TlEquityChart — equity curve from real tradelog ─────────────────────────
// ── Equity P&L curve (simple green/red line) ──
function TlEquityChart({ curve }) {
  const ref = useRef(null), chartRef = useRef(null)
  useEffect(()=>{
    if(!ref.current||!curve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:200,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:curve[0].date,value:0},{time:curve[curve.length-1].date,value:0}])
      const finalVal = curve[curve.length-1].value
      const lineColor = finalVal >= 0 ? '#00e5a0' : '#ff4d6d'
      chart.addLineSeries({color:lineColor,lineWidth:2,lastValueVisible:true,priceLineVisible:false})
        .setData(curve.map(p=>({time:p.date,value:p.value})))
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(()=>{ if(ref.current) chart.applyOptions({width:ref.current.clientWidth}) })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  },[curve])
  return <div ref={ref} style={{minHeight:200,borderTop:'1px solid var(--border)'}}/>
}

// ── Capital Invertido vs Profit acumulado (area + line) ──
function TlInvestChart({ investData }) {
  // investData: [{date, capital, profit}]  sorted by date
  const ref = useRef(null), chartRef = useRef(null)
  useEffect(()=>{
    if(!ref.current||!investData?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:200,
        layout:{background:{color:'#0b0f1a'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.06}},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      // Area — Capital Invertido (azul con relleno)
      const areaSeries = chart.addAreaSeries({
        lineColor:'#2a7fff',
        topColor:'rgba(42,127,255,0.55)',
        bottomColor:'rgba(42,127,255,0.04)',
        lineWidth:2,
        title:'Capital inv.',
        lastValueVisible:true,
        priceLineVisible:false,
      })
      areaSeries.setData(investData.map(p=>({time:p.date,value:p.capital})))
      // Line — Profit acumulado (verde lima)
      const profitSeries = chart.addLineSeries({
        color:'#aaff44',
        lineWidth:2,
        title:'Profit',
        lastValueVisible:true,
        priceLineVisible:false,
      })
      profitSeries.setData(investData.map(p=>({time:p.date,value:p.profit})))
      // Zero dotted
      if(investData.length>1){
        chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:investData[0].date,value:0},{time:investData[investData.length-1].date,value:0}])
      }
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(()=>{ if(ref.current) chart.applyOptions({width:ref.current.clientWidth}) })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  },[investData])
  return (
    <div style={{borderTop:'1px solid var(--border)'}}>
      <div style={{padding:'6px 14px 0',display:'flex',alignItems:'center',gap:14}}>
        <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase'}}>Capital Invertido vs Profit</span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#2a7fff'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#2a7fff',borderRadius:1}}/> Capital inv.
        </span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#aaff44'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#aaff44',borderRadius:1}}/> Profit acum.
        </span>
      </div>
      <div ref={ref} style={{minHeight:200}}/>
    </div>
  )
}


export default function Home() {
  const [simbolo,setSimbolo]=useState('^GSPC')
  const [symSearchOpen,setSymSearchOpen]=useState(false)
  const [symSearchQ,setSymSearchQ]=useState('')
  const symSearchInputRef=useRef(null)
  const [emaR,setEmaR]=useState(10),[emaL,setEmaL]=useState(11)
  const [years,setYears]=useState(5),[capitalIni,setCapitalIni]=useState(10000)
  const [tipoStop,setTipoStop]=useState('tecnico'),[atrP,setAtrP]=useState(14),[atrM,setAtrM]=useState(1.0)
  const [sinPerdidas,setSinPerdidas]=useState(true),[reentry,setReentry]=useState(true)
  const [tipoFiltro,setTipoFiltro]=useState('none'),[sp500EmaR,setSp500EmaR]=useState(10),[sp500EmaL,setSp500EmaL]=useState(11)
  const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(null)
  const [labelMode,setLabelMode]=useState(0),[rulerOn,setRulerOn]=useState(false)
  const [chartViewFull,setChartViewFull]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [sidePanel,setSidePanel]=useState('config')
  const [metricsLayout,setMetricsLayout]=useState('panel')
  const [metricsView,setMetricsView]=useState('panel')   // 'multi'=3col | 'single'=one strat per block
  const [showStrategy,setShowStrategy]=useState(true),[showBH,setShowBH]=useState(true)
  const [showSP500,setShowSP500]=useState(true),[showCompound,setShowCompound]=useState(true)
  const [watchlist,setWatchlist]=useState(WATCHLIST_FALLBACK)
  const [wlLoading,setWlLoading]=useState(true)
  const [selectedLists,setSelectedLists]=useState(['General'])
  const [listDropOpen,setListDropOpen]=useState(false)
  const [editingItem,setEditingItem]=useState(null) // item watchlist en edición
  const [editForm,setEditForm]=useState({})
  const [editSaving,setEditSaving]=useState(false)
  const [strategies,setStrategies]=useState([])
  const [strLoading,setStrLoading]=useState(true)
  const [editingStr,setEditingStr]=useState(null)
  const [strForm,setStrForm]=useState({})
  const [strSaving,setStrSaving]=useState(false)
  // ── Strategy Builder (definition-based) ──
  const [definition, setDefinition]   = useState(DEFAULT_DEFINITION)
  const [stratName, setStratName]     = useState('Mi Estrategia')
  const [stratDesc, setStratDesc]     = useState('')
  const [stratColor, setStratColor]   = useState('#00d4ff')
  const [currentStratId, setCurrentStratId] = useState(null)
  const [stratSaving, setStratSaving] = useState(false)
  const [stratMsg, setStratMsg]       = useState(null)
  const [stratTab, setStratTab]       = useState('build')
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  // Alertas
  const [alarms,setAlarms]=useState([])
  const [alarmLoading,setAlarmLoading]=useState(true)
  const [conditions,setConditions]=useState([])
  const [condLoading,setCondLoading]=useState(false)
  const [editingAlarm,setEditingAlarm]=useState(null)
  const [alarmForm,setAlarmForm]=useState({})
  const [alarmSaving,setAlarmSaving]=useState(false)
  // Buscador global watchlist
  const [wlSearch,setWlSearch]=useState('')
  const [selectedAlarmIds,setSelectedAlarmIds]=useState([])  // IDs de alarmas activas en filtro
  const [onlyFavs,setOnlyFavs]=useState(false)  // filtro solo favoritos
  const [condFilterActive,setCondFilterActive]=useState(false) // filtro por condición activa
  const [alarmDropOpen,setAlarmDropOpen]=useState(false)  // desplegable alarmas
  const [alarmPopup,setAlarmPopup]=useState(null)  // kept for compat, not shown
  const [ackedAlarms,setAckedAlarms]=useState(new Set())  // populated from localStorage in useEffect
  const ackAlarm=(sym,aid)=>setAckedAlarms(prev=>{
    const n=new Set(prev); n.add(`${sym}::${aid}`)
    try{localStorage.setItem('v50_acked_alarms',JSON.stringify([...n]))}catch(_){}
    return n
  })
  const unackAlarm=(sym,aid)=>setAckedAlarms(prev=>{
    const n=new Set(prev); n.delete(`${sym}::${aid}`)
    try{localStorage.setItem('v50_acked_alarms',JSON.stringify([...n]))}catch(_){}
    return n
  })
  const [priceAlarmDlg,setPriceAlarmDlg]=useState(null) // {price, symbol} o null
  // ── Ranking ─────────────────────────────────────────────────
  const [rankingData,setRankingData]=useState({})      // { symbol: { score, rank, metrics } }
  const [rankingStratId,setRankingStratId]=useState(null)    // strategy id the ranking was calculated with
  const [rankingStratName,setRankingStratName]=useState('')  // display name
  const [rankingRunning,setRankingRunning]=useState(false)
  const [rankingProgress,setRankingProgress]=useState({done:0,total:0})
  const [rankingError,setRankingError]=useState(null)
  // Búsqueda async de nombre
  const symSearchRef=useRef(null)
  const [mcTradeFilter,setMcTradeFilter]=useState('')
  const [tradeHistMode,setTradeHistMode]=useState('compound')   // 'compound'|'simple' for trade history capital column
  const [mcTradeHistMode,setMcTradeHistMode]=useState('compound')
  const chartSyncRef=useRef({syncing:false,listeners:[]})  // cross-chart time sync

  // Reset sync listeners when symbol/result changes to prevent stale refs
  const prevSymboloRef=useRef(null)
  if(simbolo!==prevSymboloRef.current){
    chartSyncRef.current={syncing:false,listeners:[]}
    prevSymboloRef.current=simbolo
  }
  const [mcLayout,setMcLayout]=useState('panel')  // 'panel' | 'grid'
  // ── Resizable panels ────────────────────────────────────────
  const [sidebarW,setSidebarW]=useState(240)
  const [rightPanelW,setRightPanelW]=useState(275)
  const [candleH,setCandleH]=useState(480)     // resizable candle chart height
  const [equityH,setEquityH]=useState(260)     // resizable equity chart height
  const [mcEquityH,setMcEquityH]=useState(300) // resizable MC equity chart height
  const candleResizing=useRef(false),candleStartY=useRef(0),candleStartH=useRef(0)
  const equityResizing=useRef(false),equityStartY=useRef(0),equityStartH=useRef(0)
  const mcEquityResizing=useRef(false),mcEquityStartY=useRef(0),mcEquityStartH=useRef(0)
  const sidebarResizing=useRef(false), rightResizing=useRef(false)
  const sidebarStartX=useRef(0), sidebarStartW=useRef(0)
  const rightStartX=useRef(0), rightStartW=useRef(0)

  useEffect(()=>{
    const onMove=e=>{
      if(sidebarResizing.current){
        const delta=e.clientX-sidebarStartX.current
        setSidebarW(Math.max(180,Math.min(420,sidebarStartW.current+delta)))
      }
      if(rightResizing.current){
        const delta=rightStartX.current-e.clientX
        setRightPanelW(Math.max(200,Math.min(480,rightStartW.current+delta)))
      }
      if(candleResizing.current){
        const dy=e.clientY-candleStartY.current
        setCandleH(Math.max(200,Math.min(900,candleStartH.current+dy)))
      }
      if(equityResizing.current){
        const dy=e.clientY-equityStartY.current
        setEquityH(Math.max(120,Math.min(600,equityStartH.current+dy)))
      }
      if(mcEquityResizing.current){
        const dy=e.clientY-mcEquityStartY.current
        setMcEquityH(Math.max(120,Math.min(600,mcEquityStartH.current+dy)))
      }
    }
    const onUp=()=>{
    sidebarResizing.current=false;rightResizing.current=false
    candleResizing.current=false;equityResizing.current=false;mcEquityResizing.current=false
    document.body.style.cursor='';document.body.style.userSelect=''
  }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // ── Backtesting state ──────────────────────────────────────
  const [mcSelected,setMcSelected]=useState([])          // symbols seleccionados
  const [mcSearch,setMcSearch]=useState('')
  const [mcOnlyFavs,setMcOnlyFavs]=useState(false)
  const [mcListFilter,setMcListFilter]=useState('')
  const [mcMode,setMcMode]=useState('slots')             // 'slots' | 'rotativo' | 'custom'
  const [mcWeights,setMcWeights]=useState({})             // {symbol: pct} para modo custom
  const [mcCapital,setMcCapital]=useState('compound')    // 'simple' | 'compound'
  const [mcResult,setMcResult]=useState(null)
  const [mcLoading,setMcLoading]=useState(false)
  const [mcError,setMcError]=useState(null)
  const [mcShowSimple,setMcShowSimple]=useState(true)
  const [mcShowCompound,setMcShowCompound]=useState(true)
  const [mcShowBH,setMcShowBH]=useState(true)
  const [mcShowSP500,setMcShowSP500]=useState(true)
  const [mcShowOccupancy,setMcShowOccupancy]=useState(true)
  const [mcOccMode,setMcOccMode]=useState('compound')  // own filter for MC capital chart
  const mcChartRef=useRef(null)
  const savedRangeRef=useRef(null)   // preserve zoom when changing asset
  const [metricsStrats,setMetricsStrats]=useState(['simple','compound','bh'])  // which strat panels to show
  const [showIndivOccupancy,setShowIndivOccupancy]=useState(true)  // % capital invertido chart for individual
  const [indivOccMode,setIndivOccMode]=useState('compound')  // independent filter for indiv occupancy chart

  const debounceRef=useRef(null),chartApiRef=useRef(null),contentRef=useRef(null)

  const mcChartApiRef=useRef(null)

  // ── TradeLog state ───────────────────────────────────────────
  const [tlTrades,setTlTrades]=useState([])
  const [tlLoading,setTlLoading]=useState(false)
  const [tlError,setTlError]=useState(null)
  const [tlSelected,setTlSelected]=useState(null)      // trade seleccionado en detalle
  const [tlMultiSel,setTlMultiSel]=useState(new Set()) // ids seleccionados para borrado
  const [tlMultiMode,setTlMultiMode]=useState(false)   // modo multiselección activo
  const [tlTab,setTlTab]=useState('ops')               // 'ops'|'import'|'export'|'dashboard'
  const [tlFilterBroker,setTlFilterBroker]=useState('')
  const [tlFilterYear,setTlFilterYear]=useState('')
  const [tlFilterMonth,setTlFilterMonth]=useState('')  // '01'..'12'
  const [tlFilterType,setTlFilterType]=useState('')
  const [tlFilterStatus,setTlFilterStatus]=useState('') // ''|'open'|'closed'
  const [tlSearch,setTlSearch]=useState('')
  const tlSearchRef=useRef(null)
  const [tlFills,setTlFills]=useState([])
  const [tlExpandedGroups,setTlExpandedGroups]=useState(new Set())  // group_ids expanded
  const [tlFormOpen,setTlFormOpen]=useState(false)
  const [tlFilterStrat,setTlFilterStrat]=useState('')
  // ── tlFiltered: single source of truth for all filtered views ──
  // Respects: status, broker, year, month, strategy, search
  // All tabs (Ops table, Dashboard, Métricas panel) MUST use this, not tlTrades directly
  const tlFiltered = useMemo(()=>{
    return tlTrades.filter(t=>{
      if(tlFilterStatus && t.status!==tlFilterStatus) return false
      if(tlFilterBroker && t.broker!==tlFilterBroker) return false
      if(tlFilterStrat && (t.strategy||'')!==tlFilterStrat) return false
      if(tlSearch && !(t.symbol||'').toLowerCase().includes(tlSearch.toLowerCase())) return false
      if(tlFilterYear||tlFilterMonth){
        const d = (t.status==='closed' ? t.exit_date : null) || t.entry_date
        if(!d) return false
        if(tlFilterYear && !d.startsWith(tlFilterYear)) return false
        if(tlFilterMonth && d.slice(5,7)!==tlFilterMonth) return false
      }
      return true
    })
  },[tlTrades,tlFilterStatus,tlFilterBroker,tlFilterStrat,tlSearch,tlFilterYear,tlFilterMonth])
  const [tlFillsList,setTlFillsList]=useState([])  // fills entrada para modal
  const [tlExitFillsList,setTlExitFillsList]=useState([])  // fills salida para modal
  const [tlSideEdit,setTlSideEdit]=useState(false)   // edit panel in left sidebar
  const [tlCloseOpen,setTlCloseOpen]=useState(false)
  const [tlImportText,setTlImportText]=useState('')
  const [tlImportFormat,setTlImportFormat]=useState('ai')
  const [tlParsedRaw,setTlParsedRaw]=useState([])  // raw fills from parser
  const [tlParsed,setTlParsed]=useState([])          // displayed (grouped or not)
  const [tlGroupFills,setTlGroupFills]=useState(true)

  // ── Enriquece filas: detecta duplicados y cierres (totales/parciales) ──
  const enrichParsedRows = (rows) => {
    return rows.map(r => {
      let enriched = {...r}

      // Duplicate detection: same symbol + date + price + shares already in DB
      const isDup = tlTrades.some(t =>
        t.symbol === r.symbol &&
        t.entry_date === r.entry_date &&
        Math.abs(parseFloat(t.entry_price||0) - parseFloat(r.entry_price||0)) < 0.01 &&
        Math.abs(parseFloat(t.shares||0) - parseFloat(r.shares||0)) < 0.01
      )
      if (isDup) enriched._isDuplicate = true

      // Closure detection: any SELL fill (isolated or _orphanSell) → find open positions
      const isSellFill = r.fill_type === 'sell' || r._orphanSell
      if (isSellFill && !r._grouped) {
        const openPositions = [...tlTrades]
          .filter(t =>
            t.symbol === r.symbol &&
            (!t.status || t.status === 'open') &&
            !t.exit_date
          )
          .sort((a,b) => (a.entry_date||'') <= (b.entry_date||'') ? -1 : 1)  // oldest first

        if (openPositions.length === 1) {
          // Single open position → auto-assign
          const openPos    = openPositions[0]
          const openShares = parseFloat(openPos.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = openPos.id
          enriched._closesSymbol   = openPos.symbol
          enriched._openEntryDate  = openPos.entry_date
          enriched._openShares     = openShares
          enriched._sellShares     = sellShares
          enriched._isPartialClose = sellShares < openShares - 0.001
          enriched._isFullClose    = Math.abs(sellShares - openShares) < 0.001
          enriched._isExcessSell   = sellShares > openShares + 0.001
          if (enriched._isPartialClose) enriched._remainingShares = openShares - sellShares
        } else if (openPositions.length > 1) {
          // Multiple open positions → flag for user selection
          enriched._multipleOpen   = true
          enriched._openOptions    = openPositions.map(t=>({
            id: t.id,
            entry_date: t.entry_date,
            shares: parseFloat(t.shares||0),
            entry_price: t.entry_price,
          }))
          // Pre-select oldest (FIFO) but user can change
          const presel = openPositions[0]
          const openShares = parseFloat(presel.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = presel.id
          enriched._closesSymbol   = presel.symbol
          enriched._openEntryDate  = presel.entry_date
          enriched._openShares     = openShares
          enriched._sellShares     = sellShares
          enriched._isPartialClose = sellShares < openShares - 0.001
          enriched._isFullClose    = Math.abs(sellShares - openShares) < 0.001
          enriched._isExcessSell   = sellShares > openShares + 0.001
          if (enriched._isPartialClose) enriched._remainingShares = openShares - sellShares
        }
      }
      return enriched
    })
  }

  // ── Agrupa fills del parser en operaciones (FIFO cronológico) ──
  // Procesa todos los fills de cada símbolo en orden de fecha.
  // Las SELLs cierran las BUYs más antiguas disponibles (FIFO).
  // Las SELLs sin BUY previa = cierre huérfano (buscará en tlTrades).
  const groupParsedFills = (rows) => {
    if(!rows||rows.length===0) return rows
    // Agrupar por símbolo
    const bySymbol = {}
    rows.forEach(r=>{
      const k = r.symbol
      if(!bySymbol[k]) bySymbol[k]=[]
      bySymbol[k].push(r)
    })
    const result = []
    Object.entries(bySymbol).forEach(([sym, fills])=>{
      // Ordenar todos los fills cronológicamente
      const sorted = [...fills].sort((a,b)=>(a.entry_date||'') <= (b.entry_date||'') ? -1 : 1)
      // Cola FIFO de compras pendientes de cerrar
      // Cada elemento: { row, sharesLeft, buyFills:[] }
      const buyQueue = []

      sorted.forEach(fill=>{
        if(fill.fill_type==='buy'){
          buyQueue.push({ row:fill, sharesLeft:fill.shares, sellFills:[] })
        } else {
          // SELL: consumir BUYs de la cola en orden FIFO
          let sharesToAssign = fill.shares
          while(sharesToAssign > 0.001 && buyQueue.length > 0){
            const head = buyQueue[0]
            const take = Math.min(head.sharesLeft, sharesToAssign)
            head.sellFills.push({...fill, shares:take})
            head.sharesLeft -= take
            sharesToAssign  -= take
            if(head.sharesLeft < 0.001) buyQueue.shift()  // BUY fully consumed
          }
          // Shares restantes de la sell sin BUY previa = huérfana
          if(sharesToAssign > 0.001){
            result.push({
              ...fill, shares:sharesToAssign, _orphanSell:true,
              fill_type:'sell', status:'open'
            })
          }
        }
      })

      // Ahora convertir buyQueue entries a trades
      // Primero, detectar grupos contiguos de BUYs sin sells entre ellas
      // que se podrían agrupar (mismo día o sin venta intermedia)
      // Para simplicidad: cada BUY original = 1 fila resultado
      // Si tiene sellFills → trade cerrado (o parcial si sharesLeft > 0)
      // Si no tiene sellFills → abierto
      // BUYs consumidas parcialmente ya salieron de la cola

      // Reconstruir: iterar fills originales de buy en orden
      // (buyQueue ya tiene solo las NO totalmente consumidas)
      // Necesitamos rastrear qué fills tienen sellFills

      // Re-process: build output for each buy fill
      const allBuyFills = sorted.filter(f=>f.fill_type==='buy')
      // Map from fill object to accumulated sell fills (collected during FIFO above)
      // We need to redo this tracking properly
      // Simplest: re-run FIFO and build a map

      const buyMap = []  // {buyFill, sellFills, sharesUsed}
      allBuyFills.forEach(b=>buyMap.push({buyFill:b, sellFills:[], sharesUsed:0}))

      // Re-run FIFO with tracking
      let bIdx = 0
      const sellFillsSorted = sorted.filter(f=>f.fill_type==='sell')
      sellFillsSorted.forEach(sell=>{
        let remaining = sell.shares
        let si = bIdx
        while(remaining>0.001 && si<buyMap.length){
          const bm = buyMap[si]
          const available = bm.buyFill.shares - bm.sharesUsed
          if(available < 0.001){ si++; continue }
          const take = Math.min(available, remaining)
          bm.sellFills.push({...sell, shares:take})
          bm.sharesUsed += take
          remaining -= take
          if(bm.buyFill.shares - bm.sharesUsed < 0.001) si++
        }
        bIdx = si
      })

      // Build result rows from buyMap
      // Assign group_id: all open BUYs in this symbol batch share one group_id
      //   (scale-in / pyramid entries). Partially-closed BUY + remainder share another.
      const genId = ()=>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(Math.random()*16>>c/4)).toString(16))

      // Group all open (no-sell) buys together if there are 2+
      const openBuys  = buyMap.filter(bm=>bm.sellFills.length===0)
      const closedBuys= buyMap.filter(bm=>bm.sellFills.length>0)
      const openGroupId  = openBuys.length>1 ? genId() : null

      buyMap.forEach(({buyFill, sellFills, sharesUsed})=>{
        if(sellFills.length===0){
          // Fully open buy — share group_id if multiple open buys
          result.push({...buyFill, status:'open',
            group_id: openGroupId || null
          })
        } else {
          // Has matching sells
          const totalSell = sellFills.reduce((s,f)=>s+f.shares,0)
          const avgSell   = sellFills.reduce((s,f)=>s+f.entry_price*f.shares,0)/totalSell
          const commSell  = sellFills.reduce((s,f)=>s+(f.commission_sell||0),0)
          const lastSell  = sellFills.reduce((a,b)=>a.entry_date>=b.entry_date?a:b)
          const isFull    = Math.abs(totalSell-buyFill.shares)<0.001
          const buyCount  = 1
          const sellCount = sellFills.length
          // If partial close → BUY closed + remainder share a group_id
          const partialGroupId = !isFull ? genId() : null
          result.push({
            ...buyFill,
            shares: Math.min(totalSell, buyFill.shares),
            exit_date:       lastSell.entry_date,
            exit_price:      parseFloat(avgSell.toFixed(4)),
            exit_currency:   lastSell.entry_currency||buyFill.entry_currency,
            commission_sell: commSell,
            fill_type: 'buy',
            status: isFull ? 'closed' : 'open',
            _grouped: sellFills.length>1,
            _buyCount: buyCount,
            _sellCount: sellCount,
            _fills: [buyFill, ...sellFills],
            group_id: partialGroupId,
          })
          if(!isFull){
            const remainder = buyFill.shares - totalSell
            result.push({
              ...buyFill, shares:remainder, status:'open',
              fill_type:'buy', _remainder:true,
              group_id: partialGroupId,
            })
          }
        }
      })

      // Orphan sells already pushed in first FIFO loop
    })
    return result
  }
  const [tlImportLoading,setTlImportLoading]=useState(false)
  const [tlForm,setTlForm]=useState({
    symbol:'',name:'',asset_type:'stock',broker:'ibkr',
    entry_date:'',entry_price:'',shares:'',entry_currency:'USD',
    commission_buy:0,fx_entry:'',fx_entry_manual:false,
    notes:'',strategy:'',import_source:'manual'
  })
  const [tlCloseForm,setTlCloseForm]=useState({
    exit_date:'',exit_price:'',exit_currency:'USD',commission_sell:0,fx_exit:'',fx_exit_manual:false
  })

  // FX helper: call directly from onChange (avoids useEffect TDZ issues in production)
  const tlFetchFx = useCallback((cur, rawDate) => {
    if(!cur || cur==='EUR') return
    const date = toIsoDate(rawDate) || new Date().toISOString().slice(0,10)
    if(!date || date.length < 8) return
    setTlForm(f=>({...f,_fxLoading:true,fx_entry_manual:false}))
    fetch(`/api/tradelog?action=fx&currency=${cur}&date=${date}`)
      .then(r=>r.json())
      .then(j=>{ if(j.fx) setTlForm(f=>({...f,fx_entry:parseFloat(j.fx).toFixed(4),_fxLoading:false})) })
      .catch(()=>setTlForm(f=>({...f,_fxLoading:false})))
  },[])

  // Abrir búsqueda de símbolo al escribir cualquier letra/número fuera de inputs
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return
      if(e.key==='Escape'){setSymSearchOpen(false);setSymSearchQ('');return}
      if(symSearchOpen) return
      if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        setSymSearchQ(e.key.toUpperCase())
        setSymSearchOpen(true)
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[symSearchOpen])

  useEffect(()=>{
    if(symSearchOpen) setTimeout(()=>symSearchInputRef.current?.focus(),50)
  },[symSearchOpen])

  // alarmStatus[symbol][alarmId] = true|false|null
  const [alarmStatus,setAlarmStatus]=useState({})
  const [alarmStatusLoading,setAlarmStatusLoading]=useState(false)

  const reloadWatchlist=()=>{
    setWlLoading(true)
    fetchWatchlist()
      .then(data=>{ if(data.length>0) setWatchlist(data) })
      .catch(()=>{})
      .finally(()=>setWlLoading(false))
  }
  const stratLoadedRef=useRef(false)
  const reloadStrategies=(applyDefault=false)=>{
    setStrLoading(true)
    fetchStrategies()
      .then(data=>{
        setStrategies(data)
        // On first load only: apply default strategy from settings (if any)
        if(applyDefault&&!stratLoadedRef.current&&data.length>0){
          stratLoadedRef.current=true
          try{
            const sett=JSON.parse(localStorage.getItem('v50_settings')||'{}')
            const defId=sett.defaultStrategyId
            if(defId){
              const match=data.find(s=>s.id===defId)
              if(match) loadStrategyLegacy(match)
              // loadStrategyLegacy already calls loadRankingRemote internally
            }
          }catch(_){}
        }
      })
      .catch(()=>{})
      .finally(()=>setStrLoading(false))
  }
  const reloadConditions=()=>{
    setCondLoading(true)
    fetchConditions().then(d=>setConditions(d||[])).catch(()=>{}).finally(()=>setCondLoading(false))
  }

  const reloadAlarms=()=>{
    setAlarmLoading(true)
    fetchAlarms()
      .then(data=>{
        setAlarms(data)
        // Save condition name map to settings so Settings modal can show them
        const conditions=data.filter(a=>a.condition!=='price_level')
        if(conditions.length>0){
          try{
            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
            if(!s.watchlist) s.watchlist={}
            const nameMap={}
            conditions.forEach(a=>{nameMap[a.id]=a.name})
            s.watchlist.alarmDotNames=nameMap
            // Legacy: migrate alarmDotIds → condDotIds (no-op if already done)
            // condDotIds is managed by Settings Watchlist tab
            localStorage.setItem('v50_settings',JSON.stringify(s))
          }catch(_){}
        }
      })
      .catch(()=>{})
      .finally(()=>setAlarmLoading(false))
  }

  // Cargar datos al montar
  useEffect(()=>{
    reloadWatchlist()
    reloadStrategies(true)  // true = apply default strategy from settings
    reloadAlarms()
    reloadConditions()
  },[])

  // Abrir editor watchlist
  const openEditItem=(item)=>{
    setEditingItem(item)
    setEditForm({
      symbol:item.symbol,name:item.name,group_name:item.group_name,
      list_name:item.list_name||'General',favorite:item.favorite||false,
      observations:item.observations||''
    })
  }
  const closeEditItem=()=>{setEditingItem(null);setEditForm({})}
  const saveEditItem=async()=>{
    setEditSaving(true)
    try{
      await upsertWatchlistItem({...editForm,id:editingItem?.id||undefined})
      reloadWatchlist(); closeEditItem()
    }catch(e){alert('Error: '+e.message)}
    finally{setEditSaving(false)}
  }
  const deleteItem=async(id)=>{
    if(!confirm('¿Eliminar este activo?')) return
    await deleteWatchlistItem(id); reloadWatchlist()
  }
  const newItem=()=>openEditItem({id:null,symbol:'',name:'',group_name:'Acciones',list_name:'General',favorite:false,observations:''})

  // Abrir editor estrategia
  const openEditStr=(s)=>{
    setEditingStr(s)
    setStrForm({
      name:s.name||'',
      years:s.years||5,capital_ini:s.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||1000}catch(_){return 1000}})(),
      color:s.color||'#00d4ff',observations:s.observations||''
    })
    // Cargar definition: si tiene la nueva, usarla; si es estrategia legacy, convertirla
    const def = s.definition && Object.keys(s.definition).length>0
      ? s.definition
      : {
          entry:{ type:'breakout_high_above_ma',ma_type:'EMA',ma_fast:s.ema_r||10,ma_slow:s.ema_l||11 },
          exit: { type:'breakout_low_below_ma', ma_type:'EMA',ma_period:s.ema_r||10 },
          stop: s.tipo_stop==='atr'
            ? { type:'atr_based',atr_period:s.atr_period||14,atr_mult:s.atr_mult||1.0 }
            : s.tipo_stop==='none' ? { type:'none' }
            : { type:'below_ma_at_signal',ma_type:'EMA',ma_period:s.ema_r||10 },
          management:{ sin_perdidas:s.sin_perdidas!==false, reentry:s.reentry!==false },
          filters:{
            market: s.tipo_filtro&&s.tipo_filtro!=='none'
              ? [{ type:'external_ma',condition:s.tipo_filtro,ma_type:'EMA',ma_fast:s.sp500_ema_r||10,ma_slow:s.sp500_ema_l||11 }]
              : [],
            signal:[{type:'breakout_rolling',max_candles:null}]
          }
        }
    setDefinition(def)
  }
  const closeEditStr=()=>{setEditingStr(null);setStrForm({})}
  const saveEditStr=async()=>{
    setStrSaving(true)
    try{
      // Guarda con definition (nuevo formato) + campos legacy para compatibilidad
      const entry=definition?.entry||{}
      const payload={
        ...strForm,
        id:editingStr?.id||undefined,
        definition,
        // Mantener campos legacy sincronizados para el motor cfg
        ema_r:entry.ma_fast||entry.ma_period||10,
        ema_l:entry.ma_slow||11,
        years:Number(strForm.years||5),
        capital_ini:Number(strForm.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||1000}catch(_){return 1000}})()),
      }
      await upsertStrategy(payload)
      reloadStrategies(); closeEditStr()
    }catch(e){alert('Error: '+e.message)}
    finally{setStrSaving(false)}
  }
  const deleteStr=async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await deleteStrategy(id); reloadStrategies()
  }
  const loadStrategyLegacy=(s)=>{
    // symbol intentionally NOT loaded — strategy is asset-independent
    setEmaR(s.ema_r||10);setEmaL(s.ema_l||11);setYears(s.years||5)
    setCapitalIni(s.capital_ini||10000);setTipoStop(s.tipo_stop||'tecnico')
    setAtrP(s.atr_period||14);setAtrM(s.atr_mult||1.0)
    setSinPerdidas(s.sin_perdidas??true);setReentry(s.reentry??true)
    setTipoFiltro(s.tipo_filtro||'none');setSp500EmaR(s.sp500_ema_r||10);setSp500EmaL(s.sp500_ema_l||11)
    setStrForm(f=>({...f,_loadedName:s.name}))
    setStratName(s.name||'')
    setCurrentStratId(s.id||null)
    setSidePanel('config')
    // Load saved ranking for this strategy (clear if none)
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(s.id){
      loadRankingRemote(s.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(s.id);setRankingStratName(s.name||'')}
      }).catch(()=>{})
    }
  }
  const newStrategy=()=>openEditStr({id:null})
  const duplicateStr=(s)=>openEditStr({...s,id:null,name:s.name+' (copia)'})

  // ── Alertas ──
  const openEditAlarm=(a)=>{
    setEditingAlarm(a)
    setAlarmForm({
      symbol: a.symbol||simbolo,           // always bound to active symbol
      condition:a.condition||'ema_cross_up',
      ema_r:a.ema_r||10,ema_l:a.ema_l||11,
      price_level:a.price_level||null,
      condition_detail:a.condition_detail||'price_above',
      condition_id:a.condition_id||null,
      params:a.params||{},
    })
  }
  const closeEditAlarm=()=>{setEditingAlarm(null);setAlarmForm({})}
  const saveAlarm=async()=>{
    setAlarmSaving(true)
    try{
      const sym = alarmForm.symbol||simbolo
      if(!sym) throw new Error('No hay símbolo activo')
      // Auto-generate name: "AAPL · Cruce alcista EMA" or "AAPL @ 150.00"
      const CTYPE_NAMES={ema_cross_up:'Cruce alcista EMA',ema_cross_down:'Cruce bajista EMA',
        price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
        price_above_ma:'Precio > MA',price_below_ma:'Precio < MA',
        rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
        rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
        macd_cross_up:'MACD ↑',macd_cross_down:'MACD ↓'}
      const isPriceAlarm = alarmForm.condition==='price_level'
      const autoName = isPriceAlarm
        ? `${sym} @ ${Number(alarmForm.price_level).toFixed(2)}`
        : `${sym} · ${CTYPE_NAMES[alarmForm.condition]||alarmForm.condition}`
      await upsertAlarm({...alarmForm, symbol:sym, name:autoName, id:editingAlarm?.id||undefined, active:true})
      reloadAlarms(); closeEditAlarm()
    }catch(e){alert('Error: '+e.message)}
    finally{setAlarmSaving(false)}
  }
  const removeAlarm=async(id)=>{
    if(!confirm('¿Eliminar esta alarma?')) return
    await deleteAlarm(id); reloadAlarms()
  }
  const newAlarm=()=>openEditAlarm({id:null})

  // Evalúa una condición sobre closes
  const evalCondition=(condition,closes,emaR,emaL)=>{
    if(!closes||closes.length<20) return null
    const ema=(vals,p)=>{const k=2/(p+1);let e=null;for(const v of vals){if(e===null)e=v;else e=v*k+e*(1-k)};return e}
    const last=closes.slice(-200)
    const er=ema(last,emaR), el=ema(last,emaL), price=last[last.length-1]
    if(er==null||el==null) return null
    if(condition==='ema_cross_up')    return er>el
    if(condition==='ema_cross_down')  return er<el
    if(condition==='price_above_ema') return price>er
    if(condition==='price_below_ema') return price<er
    return null
  }

  // Para cada símbolo de la watchlist, evalúa todas las alarmas globales
  // Count of triggered alarms across all watchlist symbols (for tab badge)
  const alarmActiveCount = Object.values(alarmStatus||{}).reduce((tot,sym)=>
    tot+Object.values(sym||{}).filter(v=>v?.active===true).length, 0)

  const refreshAlarmStatus=useCallback(async(wl,al)=>{
    const wlList=wl||watchlist
    const alarmList=al||alarms
    const symbols=wlList.map(w=>w.symbol)
    if(!symbols.length||!alarmList.length) return
    setAlarmStatusLoading(true)
    try{
      // Merge real alarms + library conditions for watchlist dots
      // If condDotIds empty/unset → evaluate ALL library conditions
      const condDotIds=(()=>{try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');const ids=s?.watchlist?.condDotIds;return Array.isArray(ids)&&ids.length>0?ids:null}catch(_){return null}})()
      const allLibConds=lsGetConds()
      const libConds = condDotIds ? allLibConds.filter(c=>condDotIds.includes(c.id)) : allLibConds
      const pseudoAlarms = libConds.map(c=>({
        id: c.id,
        condition: c.type,
        ema_r: c.params?.ma_fast || c.params?.ma_period || 10,
        ema_l: c.params?.ma_slow || 11,
        params: c.params,
      }))
      // Avoid duplicates: real alarms take priority
      const realAlarmIds = new Set(alarmList.map(a=>a.id))
      const extraConds = pseudoAlarms.filter(p=>!realAlarmIds.has(p.id))
      const allEvalAlarms = [...alarmList.map(a=>({id:a.id,condition:a.condition,ema_r:a.ema_r,ema_l:a.ema_l,params:a.params})), ...extraConds]

      const res=await fetch('/api/status',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbols,alarms:allEvalAlarms})
      })
      const data=await res.json()
      const prev=alarmStatus||{}
    const newStatus=data||{}
    setAlarmStatus(newStatus)
    // Check if setting enabled: show popup on new active alarms
    try{
      const sett=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      if(sett?.alarmas?.popupOnTrigger!==false){
        // Find newly triggered alarms (active in new but not in prev)
        const triggered=[]
        for(const sym of Object.keys(newStatus||{})){
          for(const aid of Object.keys(newStatus[sym]||{})){
            if(newStatus[sym]?.[aid]?.active===true && !prev[sym]?.[aid]?.active){
              const al=alarms.find(a=>a.id===aid)
              if(al) triggered.push({symbol:sym, name:al.name, condition:al.condition})
            }
          }
        }
        if(triggered.length>0) setAlarmPopup(triggered)
      }
    }catch(_){}
    }catch(e){console.error('refreshAlarmStatus error',e)}
    finally{setAlarmStatusLoading(false)}
  },[watchlist,alarms])

  // Recalcular cuando cargan alarmas O watchlist (ambos deben estar listos)
  useEffect(()=>{
    if(watchlist.length>0&&alarms.length>0) refreshAlarmStatus(watchlist,alarms)
  },[alarms,watchlist.length]) // eslint-disable-line

  // ── Ranking: ejecuta backtest en paralelo sobre toda la watchlist ──
  const calcRanking = useCallback(async (rankSymbols=null) => {
    const cfg = { emaR:Number(emaR), emaL:Number(emaL), years:Number(years),
      capitalIni:Number(capitalIni), tipoStop, atrPeriod:Number(atrP), atrMult:Number(atrM),
      sinPerdidas, reentry, tipoFiltro, sp500EmaR:Number(sp500EmaR), sp500EmaL:Number(sp500EmaL) }
    // Use the currently visible/filtered watchlist items
    // (passed as argument, falls back to full watchlist)
    const syms = (rankSymbols || watchlist).map(w=>w.symbol)
    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})

    const sett = (()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const W = {
      winrate:   (sett.ranking?.w_winrate   ?? 25) / 100,
      factorben: (sett.ranking?.w_factorben ?? 25) / 100,
      cagr:      (sett.ranking?.w_cagr      ?? 25) / 100,
      robustez:  (sett.ranking?.w_robustez  ?? 20) / 100,
      dd:        (sett.ranking?.w_dd        ?? 5)  / 100,
    }
    const minTrades = sett.ranking?.minTrades ?? 3
    const BATCH = 4
    const results = {}
    for (let i=0; i<syms.length; i+=BATCH) {
      const batch = syms.slice(i, i+BATCH)
      await Promise.allSettled(batch.map(async sym => {
        try {
          const res = await fetch('/api/datos', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ simbolo:sym, cfg })
          })
          const json = await res.json()
          if (!res.ok || !json.trades?.length) return
          const trades = json.trades
          if (trades.length < minTrades) return
          const wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
          const winRate=(wins.length/trades.length)*100
          const gBrut=wins.reduce((s,t)=>s+t.pnlSimple,0), lBrut=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
          const factorBen=lBrut>0?Math.min(gBrut/lBrut,9.99):9.99
          const totalDiasNat=json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*Number(years)
          const anios=Math.max(totalDiasNat/365.25,0.01)
          const capFinal=Number(capitalIni)+json.gananciaSimple
          const cagr=capFinal>0?(Math.pow(capFinal/Number(capitalIni),1/anios)-1)*100:-99
          const sorted3=[...trades].sort((a,b)=>b.pnlSimple-a.pnlSimple).slice(3)
          const ganRobust=sorted3.reduce((s,t)=>s+t.pnlSimple,0)
          const capRob=Number(capitalIni)+ganRobust
          const cagrRobust=capRob>0?(Math.pow(capRob/Number(capitalIni),1/anios)-1)*100:-99
          const maxDD=json.maxDDStrategy||0
          const norm=(v,min,max)=>Math.max(0,Math.min(100,(v-min)/(max-min)*100))
          const score=Math.max(0,Math.min(100,
            norm(winRate,20,80)*W.winrate +
            norm(factorBen,0.5,5)*W.factorben +
            norm(cagr,-20,60)*W.cagr +
            norm(cagrRobust,-20,50)*W.robustez -
            norm(maxDD,0,60)*W.dd
          ))
          results[sym]={score,metrics:{winRate,factorBen,cagr,cagrRobust,maxDD,trades:trades.length}}
        } catch(_){}
      }))
      setRankingProgress({done:Math.min(i+BATCH,syms.length),total:syms.length})
    }
    const sortedEntries=Object.entries(results).sort((a,b)=>b[1].score-a[1].score)
    sortedEntries.forEach(([sym],i)=>{results[sym].rank=i+1})
    setRankingData(results)
    setRankingRunning(false)
    setRankingProgress({done:0,total:0})
    // Save ranking linked to the currently loaded strategy
    setRankingStratId(currentStratId)
    setRankingStratName(stratName||'')
    saveRankingRemote(results, currentStratId||null).catch(()=>{})
  }, [watchlist,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,currentStratId,stratName])

  const run=useCallback(async(sym,payload)=>{
    setLoading(true);setError(null)
    try{
      const body = payload.definition
        ? { simbolo:sym, definition:payload.definition }
        : { simbolo:sym, cfg:payload.cfg||payload }
      const res=await fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok)throw new Error(json.error||'Error')
      setResult(json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[])

  // ── Guardar estrategia en Supabase ──
  const saveStrategy=useCallback(async(overwriteId=null)=>{
    setStratSaving(true); setStratMsg(null)
    try{
      const body={ name:stratName, description:stratDesc,
        years:Number(years), capital_ini:Number(capitalIni),
        definition:{ ...definition }, color:stratColor }
      const method = overwriteId ? 'PUT' : 'POST'
      if(overwriteId) body.id = overwriteId
      const res=await fetch('/api/strategies',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      // Recargar lista
      const list=await fetch('/api/strategies').then(r=>r.json())
      if(Array.isArray(list)) setStrategies(list)
      setCurrentStratId(json?.id||overwriteId||null)
      setStratMsg({type:'ok',text:'Estrategia guardada ✓'})
    }catch(e){ setStratMsg({type:'err',text:e.message}) }
    finally{ setStratSaving(false) }
  },[stratName,stratDesc,simbolo,years,capitalIni,definition,stratColor])

  // ── Cargar estrategia guardada en el builder ──
  const loadStrategy=useCallback((strat)=>{
    setDefinition(strat.definition||DEFAULT_DEFINITION)
    setStratName(strat.name||'')
    setStratDesc(strat.description||'')
    setStratColor(strat.color||'#00d4ff')
    setCurrentStratId(strat.id)
    // symbol intentionally not stored in strategy (apply to any asset separately)
    setStratTab('build')
    setStratMsg({type:'ok',text:`Cargada: ${strat.name}`})
    // Load saved ranking for this strategy (clear if none)
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(strat.id){
      loadRankingRemote(strat.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(strat.id);setRankingStratName(strat.name||'')}
      }).catch(()=>{})
    }
  },[])

  // ── Eliminar estrategia ──
  const deleteStrategy=useCallback(async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await fetch(`/api/strategies?id=${id}`,{method:'DELETE'})
    setStrategies(prev=>prev.filter(s=>s.id!==id))
    if(currentStratId===id){setCurrentStratId(null);setStratMsg({type:'ok',text:'Estrategia eliminada'})}
  },[currentStratId])

  // ── Debounce: lanza backtest automáticamente al cambiar parámetros ──
  useEffect(()=>{
    if(debounceRef.current)clearTimeout(debounceRef.current)
    const payload = sidePanel==='strats'
      ? { definition:{ ...definition, capitalIni:Number(capitalIni), years:Number(years) } }
      : { cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
              tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
              tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL)} }
    debounceRef.current=setTimeout(()=>run(simbolo, payload),800)
    return()=>clearTimeout(debounceRef.current)
  },[simbolo,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,
     sp500EmaR,sp500EmaL,definition,sidePanel,run])

  // ── TradeLog helpers ────────────────────────────────────────
  // ── TradeLog: storage mode (local vs supabase) ──────────────
  const TL_LS_KEY = 'v50_tradelog'
  // Genera formulario con defaults desde settings + estrategia activa
  const tlDefaultForm = (overrides={}) => {
    const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
    const today = todayDisplay()
    // Estrategia activa: la cargada en el backtest (currentStratId) o la primera disponible
    const activeStrat = strategies.find(st=>st.id===currentStratId)
      || strategies.find(st=>st.id===s.defaultStrategyId)
      || (strategies.length>0 ? strategies[0] : null)
    const stratName = activeStrat ? (activeStrat.name||`V50 EMA ${activeStrat.ema_r}/${activeStrat.ema_l}`) : 'V50'
    // Precio actual del activo activo en el chart principal
    const currentPrice = result?.meta?.ultimoPrecio ? String(result.meta.ultimoPrecio.toFixed(2)) : ''
    return {
      symbol: '', name: '', asset_type: 'stock',
      broker: s.tradelog?.defaultBroker || 'ibkr',
      entry_date: today,
      entry_price: currentPrice, shares: '',
      entry_currency: s.tradelog?.defaultCurrency || 'USD',
      commission_buy: s.tradelog?.defaultCommission ?? 0,
      fx_entry: '', fx_entry_manual: false,
      strategy: stratName,
      notes: '', import_source: 'manual',
      ...overrides
    }
  }

  const tlNumericFields = ['entry_price','exit_price','shares','commission_buy','commission_sell','fx_entry','fx_exit','capital_eur','pnl_eur','pnl_pct','pnl_currency']
  const tlNorm = (t) => {
    if(!t) return t
    const out = {...t}
    tlNumericFields.forEach(k=>{ if(out[k]!=null && out[k]!=='') out[k]=parseFloat(out[k])||0 })
    return out
  }
  const tlGetLS = () => { try{ return (JSON.parse(localStorage.getItem(TL_LS_KEY)||'[]')).map(tlNorm) }catch{ return [] } }
  const tlSetLS = (arr) => localStorage.setItem(TL_LS_KEY, JSON.stringify(arr))
  const tlUseLocal = () => {
    // Si hay constantes Supabase hardcoded en la app, usarlas directamente
    // Solo fallback a localStorage si no hay URL/KEY disponibles
    try {
      if(typeof SUPA_URL === 'string' && SUPA_URL.startsWith('https') &&
         typeof SUPA_KEY === 'string' && SUPA_KEY.length > 10) return false
      const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
      return !s?.integrations?.supabaseUrl
    } catch { return true }
  }

  // ── Guardar screenshot del gráfico ─────────────────────────
  // ── File System Access API helpers ──
  const tlGetFsHandle = () => new Promise(res=>{
    try{
      const req = indexedDB.open('v50_fs',2)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if(!db.objectStoreNames.contains('handles')) db.createObjectStore('handles')
      }
      req.onsuccess = e => {
        try{
          const tx = e.target.result.transaction('handles','readonly')
          const r2 = tx.objectStore('handles').get('tradingApp')
          r2.onsuccess = ()=>res(r2.result||null)
          r2.onerror = ()=>res(null)
        }catch(_){ res(null) }
      }
      req.onerror = ()=>res(null)
    }catch(_){ res(null) }
  })
  const tlSetFsHandle = (handle) => new Promise(res=>{
    try{
      const req = indexedDB.open('v50_fs',2)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if(!db.objectStoreNames.contains('handles')) db.createObjectStore('handles')
      }
      req.onsuccess = e => {
        try{
          const tx = e.target.result.transaction('handles','readwrite')
          const r2 = tx.objectStore('handles').put(handle,'tradingApp')
          r2.onsuccess = ()=>res(true)
          r2.onerror = ()=>res(false)
        }catch(_){ res(false) }
      }
      req.onerror = ()=>res(false)
    }catch(_){ res(false) }
  })
  const tlPickFolder = async() => {
    try{
      if(!window.showDirectoryPicker) {
        alert('Tu navegador no soporta la API de acceso a archivos. Usa Chrome o Edge (no funciona en Firefox ni Safari).')
        return false
      }
      // User picks the root folder; subfolders "Trades charts" and "Backup operativa" 
      // are created automatically inside it
      const handle = await window.showDirectoryPicker({mode:'readwrite',startIn:'documents'})
      const ok = await tlSetFsHandle(handle)
      return ok ? handle.name : false
    }catch(e){
      if(e.name!=='AbortError') alert('Error: '+e.message)
      return false
    }
  }

  const tlSaveScreenshot = async(trade) => {
    try {
      const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const months = s?.chart?.recentMonths ?? 3
      // 1. Asegurarse de que el gráfico principal tiene el símbolo correcto
      const tradeSym = (trade.symbol||'').toUpperCase()
      if(tradeSym && tradeSym !== simbolo.toUpperCase()) {
        setSimbolo(tradeSym)
        // Esperar debounce (800ms) + API call + render ≈ 3s total
        await new Promise(r=>setTimeout(r,3200))
      }
      // 2. Navegar al rango de la operación (meses antes + 3 semanas después de la entrada)
      if(chartApiRef.current && trade.entry_date) {
        try {
          const entryD = new Date(trade.entry_date)
          const fromD  = new Date(entryD); fromD.setMonth(fromD.getMonth() - months)
          const toD    = new Date(entryD); toD.setDate(toD.getDate() + 21)
          chartApiRef.current.setRange(
            fromD.toISOString().slice(0,10),
            toD.toISOString().slice(0,10)
          )
        } catch(_){}
      }
      // 3. Esperar que el rango renderice
      await new Promise(r=>setTimeout(r,600))
      const dataUrl = chartApiRef.current?.captureJpg?.(null, trade.symbol, parseFloat(trade.entry_price)||null)
      if(!dataUrl) return
      const sym = (trade.symbol||'TICKER').replace(/[^a-zA-Z0-9^]/g,'_')
      const date = (trade.entry_date||new Date().toISOString().slice(0,10))
      const strat = (trade.strategy||'V50').replace(/[^a-zA-Z0-9]/g,'_')
      const filename = `${sym}_${date}_${strat}.jpg`
      // Siempre preguntar dónde guardar (showSaveFilePicker si disponible, sino descarga directa)
      try {
        if(window.showSaveFilePicker) {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description:'Imagen JPEG', accept:{'image/jpeg':['.jpg','.jpeg']} }],
            startIn: 'documents'
          })
          const w = await fileHandle.createWritable()
          const b64 = dataUrl.split(',')[1]
          const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0))
          await w.write(new Blob([bytes],{type:'image/jpeg'}))
          await w.close()
        } else {
          // Fallback navegadores sin API (Firefox, Safari): descarga directa
          const a = document.createElement('a')
          a.href = dataUrl; a.download = filename; a.click()
        }
      } catch(e) {
        if(e.name!=='AbortError') {
          // Si el usuario cancela → fallback silencioso
          const a = document.createElement('a')
          a.href = dataUrl; a.download = filename; a.click()
        }
      }
    } catch(_) {}
  }

  // Recalcula P&L localmente (refleja la lógica del backend)
  const tlCalcPnL = (t) => {
    const fxEntry = parseFloat(t.fx_entry)||1
    const fxExit  = parseFloat(t.fx_exit)||fxEntry
    const capital = (parseFloat(t.shares)||0) * (parseFloat(t.entry_price)||0) / fxEntry
    const commBuyEur  = (parseFloat(t.commission_buy)||0) / fxEntry
    const commSellEur = (parseFloat(t.commission_sell)||0) / fxExit
    let pnlEur=null, pnlPct=null, pnlCur=null
    if(t.status==='closed' && t.exit_price) {
      pnlCur = (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.shares)
      pnlEur = pnlCur/fxExit - commBuyEur - commSellEur
      pnlPct = capital>0 ? (pnlEur/capital)*100 : null
    }
    return { capital_eur:capital, pnl_currency:pnlCur, pnl_eur:pnlEur, pnl_pct:pnlPct }
  }

  const loadTrades = useCallback(async () => {
    setTlLoading(true); setTlError(null)
    try {
      // ── modo localStorage (sin Supabase configurado) ──
      const local = tlUseLocal()
      if(local) {
        let trades = tlGetLS()
        if(tlFilterBroker) trades = trades.filter(t=>t.broker===tlFilterBroker)
        if(tlFilterYear)   trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.startsWith(tlFilterYear)
        })
        if(tlFilterMonth)  trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.slice(5,7)===tlFilterMonth
        })
        if(tlFilterStatus) trades = trades.filter(t=>t.status===tlFilterStatus)
        trades = trades.sort((a,b)=>b.entry_date?.localeCompare(a.entry_date||'')||b.created_at?.localeCompare(a.created_at||'')||0)
        // Enrich open trades with live prices client-side
        const openTrades = trades.filter(t=>t.status==='open')
        if(openTrades.length) {
          const priceCache = {}
          await Promise.all(openTrades.map(async t=>{
            const sym = (t.symbol||'').trim().toUpperCase()
            if(!sym) return
            try{
              if(!priceCache[sym]){
                const r=await fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({simbolo:sym,cfg:{emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}})})
                const j=await r.json()
                if(j.meta?.ultimoPrecio) priceCache[sym]={price:j.meta.ultimoPrecio,date:j.meta.ultimaFecha}
              }
              const cur = priceCache[sym]
              if(cur){
                t._current_price = cur.price
                t._current_date  = cur.date
                // fx_entry es EURUSD (>1): cuántos USD vale 1 EUR
                // Si viene <1 (registros antiguos con USDEUR), invertir
                let fxEntry = parseFloat(t.fx_entry)||1
                if(fxEntry < 1) fxEntry = 1/fxEntry  // compatibilidad hacia atrás
                const capitalEur = (parseFloat(t.shares)||0)*(parseFloat(t.entry_price)||0)/fxEntry
                const pnlCur = (cur.price - parseFloat(t.entry_price||0))*(parseFloat(t.shares)||0)
                t._pnl_float_eur = pnlCur/fxEntry - (parseFloat(t.commission_buy)||0)/fxEntry
                t._pnl_float_pct = capitalEur>0?(t._pnl_float_eur/capitalEur)*100:0
              }
            }catch(_){}
          }))
        }
        setTlTrades([...trades])
        return
      }
      // ── modo Supabase ──
      let url = '/api/tradelog?action=list'
      if(tlFilterBroker) url += `&broker=${tlFilterBroker}`
      if(tlFilterYear)   url += `&year=${tlFilterYear}`
      if(tlFilterMonth)  url += `&month=${tlFilterMonth}`
      if(tlFilterStatus) url += `&status=${tlFilterStatus}`
      const res = await fetch(url)
      const json = await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setTlTrades(json.trades||[])
    } catch(e){
      // Si el error es de Supabase no configurado → caer a localStorage silenciosamente
      if(e.message?.includes('SUPABASE_URL') || e.message?.includes('no configurada') || e.message?.includes('does not exist') || e.message?.includes('relation')) {
        let trades = tlGetLS()
        if(tlFilterBroker) trades = trades.filter(t=>t.broker===tlFilterBroker)
        if(tlFilterYear)   trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.startsWith(tlFilterYear)
        })
        if(tlFilterMonth)  trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.slice(5,7)===tlFilterMonth
        })
        if(tlFilterStatus) trades = trades.filter(t=>t.status===tlFilterStatus)
        setTlTrades(trades.sort((a,b)=>(b.entry_date||'').localeCompare(a.entry_date||'')||(b.created_at||b.id||'').localeCompare(a.created_at||a.id||'')))
      } else {
        setTlError(e.message)
      }
    }
    finally { setTlLoading(false) }
  },[tlFilterBroker,tlFilterYear,tlFilterMonth,tlFilterStatus])

  useEffect(()=>{ if(sidePanel==='tradelog') loadTrades() },[sidePanel,loadTrades])

  const loadFills = useCallback(async(id)=>{
    try{
      if(tlUseLocal()){ setTlFills([]); return }
      const res=await fetch(`/api/tradelog?action=fills&id=${id}`)
      const json=await res.json()
      setTlFills(json.fills||[])
    }catch(_){ setTlFills([]) }
  },[])

  const tlSaveTrade = async(trade)=>{
    if(tlUseLocal()) {
      const all = tlGetLS()
      // Normalizar campos numéricos (los inputs devuelven strings)
      const n = (v) => v===''||v==null ? null : parseFloat(v)||0
      const norm = {...trade,
        entry_price: n(trade.entry_price), exit_price: n(trade.exit_price),
        shares: n(trade.shares), commission_buy: n(trade.commission_buy)||0,
        commission_sell: n(trade.commission_sell)||0,
        fx_entry: n(trade.fx_entry)||null, fx_exit: n(trade.fx_exit)||null,
      }
      const pnl = tlCalcPnL(norm)
      if(norm.id) {
        const idx = all.findIndex(t=>t.id===norm.id)
        const updated = {...norm,...pnl,updated_at:new Date().toISOString()}
        if(idx>=0) all[idx]=updated; else all.push(updated)
        tlSetLS(all)
        await loadTrades()
        return updated
      } else {
        const newT = {...norm,...pnl,id:'ls_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
        tlSetLS([...all,newT])
        await loadTrades()
        return newT
      }
    }
    // Sanitize numeric fields for Supabase
    const n  = (v) => v===''||v==null||isNaN(parseFloat(v)) ? null : parseFloat(v)
    const n0 = (v) => parseFloat(v)||0  // NOT NULL columns default to 0
    const clean = {...trade,
      entry_price:    n0(trade.entry_price),
      exit_price:     n(trade.exit_price),
      shares:         n0(trade.shares),
      commission_buy: n0(trade.commission_buy),
      commission_sell:n0(trade.commission_sell),
      fx_entry: n(trade.fx_entry), fx_exit: n(trade.fx_exit),
    }
    const res=await fetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)})
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Error')
    await loadTrades()
    return json.trade
  }

  const tlDeleteTrade = async(id)=>{
    if(tlUseLocal()) {
      tlSetLS(tlGetLS().filter(t=>t.id!==id))
      setTlSelected(null); setTlFills([])
      await loadTrades()
      return
    }
    await fetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    setTlSelected(null); setTlFills([])
    await loadTrades()
  }

  const tlDeleteMulti = async(ids)=>{
    if(!ids||ids.size===0) return
    if(!window.confirm(`¿Eliminar ${ids.size} operaci${ids.size===1?'ón':'ones'}? Esta acción no se puede deshacer.`)) return
    if(tlUseLocal()){
      tlSetLS(tlGetLS().filter(t=>!ids.has(t.id)))
      setTlSelected(null); setTlMultiSel(new Set()); setTlMultiMode(false)
      await loadTrades(); return
    }
    // Delete each via API
    await Promise.all([...ids].map(id=>
      fetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    ))
    setTlSelected(null); setTlMultiSel(new Set()); setTlMultiMode(false)
    await loadTrades()
  }

  const tlCloseTrade = async()=>{
    if(!tlSelected) return
    if(tlUseLocal()) {
      const all = tlGetLS()
      const idx = all.findIndex(t=>t.id===tlSelected.id)
      if(idx<0) return
      const updated = {...all[idx],...tlCloseForm,
        exit_price:parseFloat(tlCloseForm.exit_price),
        commission_sell:parseFloat(tlCloseForm.commission_sell||0),
        status:'closed'}
      updated.fx_exit = tlCloseForm.fx_exit_manual && tlCloseForm.fx_exit
        ? parseFloat(tlCloseForm.fx_exit) : updated.fx_entry||1
      const pnl = tlCalcPnL(updated)
      Object.assign(updated, pnl)
      all[idx] = updated
      tlSetLS(all)
      setTlCloseOpen(false)
      await loadTrades()
      setTlSelected(updated)
      return
    }
    const res=await fetch('/api/tradelog?action=close',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:tlSelected.id,...tlCloseForm})})
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Error')
    setTlCloseOpen(false)
    await loadTrades()
    setTlSelected(json.trade||null)
  }

  const tlImportParse = async()=>{
    if(!tlImportText.trim()) return
    setTlImportLoading(true); setTlParsed([])
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const apiKey=s?.integrations?.groqKey||''
      const res=await fetch('/api/tradelog?action=parse',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:tlImportText,format:tlImportFormat,apiKey,
          ibkrDateFormat:s?.tradelog?.ibkrDateFormat||'DD/MM'})})

      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      const raw = json.parsed||[]
      setTlParsedRaw(raw)
      const grouped = groupParsedFills(raw)
      setTlParsed(enrichParsedRows(grouped))
    }catch(e){
      const msg = e.message||''
      // Detect Groq rate limit and extract wait time
      const waitMatch = msg.match(/try again in ([\d.]+)s/i)
      if(waitMatch){
        const secs = Math.ceil(parseFloat(waitMatch[1]))
        alert(`⏱ Límite de Groq alcanzado (demasiados tokens por minuto).

Espera ${secs} segundos y vuelve a intentarlo.

Si ocurre frecuentemente, reduce el texto pegado o actualiza tu plan en console.groq.com`)
      } else {
        alert('Error al parsear: '+msg)
      }
    }
    finally{setTlImportLoading(false)}
  }

  const tlImportConfirm = async(rows)=>{
    setTlImportLoading(true)
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const defBroker=s?.tradelog?.defaultBroker||'ibkr'
      let errors=[]
      for(const row of rows){
        // Campos válidos para trades_log — descartar campos UI-only del parser
        const {_fxLoading,_symSearch,_current_price,_current_date,_pnl_float_eur,_pnl_float_pct,...cleanRow}=row
        // Skip duplicates if user didn't remove them
        if(cleanRow._isDuplicate) continue
        // Strip ALL internal UI fields before sending to Supabase
        const {_isDuplicate,_closesTradeId,_closesSymbol,_openEntryDate,_openShares,
               _grouped,_buyCount,_sellCount,_fills,_orphanSell,_remainder,
               _isPartialClose,_isFullClose,_isExcessSell,_remainingShares,_sellShares,
               _multipleOpen,_openOptions,
               ...saveRow}=cleanRow

        if(cleanRow._closesTradeId) {
          const sellShares  = parseFloat(saveRow.shares||0)
          const openShares  = parseFloat(cleanRow._openShares||0)
          const isPartial   = cleanRow._isPartialClose
          const remaining   = cleanRow._remainingShares||0

          // Patch the existing open trade with exit info
          const patch={
            exit_date:      saveRow.entry_date,
            exit_price:     saveRow.entry_price,
            exit_currency:  saveRow.entry_currency||'USD',
            commission_sell:saveRow.commission_sell||0,
            shares:         sellShares,    // close only the sold qty
            status:         isPartial ? 'partial' : 'closed'
          }

          if(tlUseLocal()){
            const all=tlGetLS()
            const idx=all.findIndex(t=>t.id===cleanRow._closesTradeId)
            if(idx>=0){
              all[idx]={...all[idx],...patch}
              // If partial close → also create a new open trade for the remainder
              if(isPartial && remaining>0){
                all.push({...all[idx], id:'local_'+Date.now()+'r_'+Math.random().toString(36).slice(2),
                  shares:remaining, exit_date:null, exit_price:null, commission_sell:0, status:'open'})
              }
            }
            tlSetLS(all)
          } else {
            // Update existing trade (close/partial)
            const res=await fetch('/api/tradelog?action=save',{method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({id:cleanRow._closesTradeId,...patch})})
            const json=await res.json()
            if(!res.ok) errors.push(json.error||'Error cerrando '+saveRow.symbol)
            // If partial → create remainder as new open trade
            if(isPartial && remaining>0 && res.ok){
              const origTrade=tlTrades.find(t=>t.id===cleanRow._closesTradeId)||{}
              const remTrade={
                symbol: origTrade.symbol,
                entry_date: origTrade.entry_date,
                entry_price: origTrade.entry_price,
                entry_currency: origTrade.entry_currency,
                shares: remaining,
                broker: origTrade.broker||defBroker,
                strategy: origTrade.strategy||'',
                notes: (origTrade.notes?origTrade.notes+' | ':'')+'[Resto cierre parcial]',
                commission_buy: 0,
                fx_entry: origTrade.fx_entry,
                status: 'open',
                import_source: 'partial_remainder',
                group_id: origTrade.group_id || null
              }
              const r2=await fetch('/api/tradelog?action=save',{method:'POST',
                headers:{'Content-Type':'application/json'},body:JSON.stringify(remTrade)})
              const j2=await r2.json()
              if(!r2.ok) errors.push(j2.error||'Error creando resto parcial '+saveRow.symbol)
            }
          }
        } else {
          // If it's a SELL fill (no matching open found), skip — it's an orphan
          // The user already decided by not deleting it from preview → save as-is
          // but correct the field names so it doesn't look like a buy entry
          let trade
          if(saveRow.fill_type==='sell' && !saveRow.exit_date) {
            // Orphan sell: save as closed trade with entry=unknown, exit=the sell data
            // We DON'T have entry info so save minimal record for reference
            trade = {
              ...saveRow,
              status: 'open',
              broker: saveRow.broker||defBroker,
              notes: (saveRow.notes?saveRow.notes+' | ':'')+'[Venta importada sin compra asociada]'
            }
          } else {
            trade = {...saveRow, status: saveRow.status||'open', broker:saveRow.broker||defBroker}
          }
          if(tlUseLocal()){
            const all=tlGetLS()
            all.push({...trade, id:'local_'+Date.now()+'_'+Math.random().toString(36).slice(2)})
            tlSetLS(all)
          } else {
            const res=await fetch('/api/tradelog?action=save',{method:'POST',
              headers:{'Content-Type':'application/json'},body:JSON.stringify(trade)})
            const json=await res.json()
            if(!res.ok) errors.push(json.error||'Error guardando '+trade.symbol)
          }
        }
      }
      if(errors.length) alert('Errores al guardar:\n'+errors.join('\n'))
      setTlParsed([]); setTlParsedRaw([]); setTlImportText('')
      await loadTrades()
      setTlTab('ops')
    }catch(e){alert('Error al importar: '+e.message)}
    finally{setTlImportLoading(false)}
  }

  const TL_BROKERS=['ibkr','degiro','myinvestor','binance','manual']
  const TL_COLORS={ibkr:'#ffd166',degiro:'#00d4ff',myinvestor:'#00e5a0',binance:'#f0b90b',manual:'#9b72ff'}
  const TL_LABEL={ibkr:'IBKR',degiro:'DEGIRO',myinvestor:'MYINV',binance:'BNCE',manual:'Manual'}
  const fmtMoney=(v,cur='€')=>v==null?'—':`${v>=0?'+':''}${cur}${Math.abs(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtCur=(v,cur)=>v==null?'—':`${cur==='EUR'?'€':'$'}${Math.abs(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}`

  // ── Backtesting runner ─────────────────────────────────────
  const runBacktesting=useCallback(async()=>{
    if(mcSelected.length<2){setMcError('Selecciona al menos 2 activos');return}
    // Validar pesos si modo custom
    if(mcMode==='custom'){
      const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
      if(Math.abs(total-100)>0.5){setMcError(`Los pesos suman ${total.toFixed(1)}% — deben sumar 100%`);return}
    }
    setMcLoading(true);setMcError(null);setMcResult(null)
    try{
      // rankMap para prioridad en modo rotativo: {symbol: rank}
      const rankMap={}
      mcSelected.forEach((sym,i)=>{
        const rd=rankingData[sym]
        rankMap[sym]=rd?.rank??i+1
      })
      // Normalizar pesos antes de enviar
      const weightsNorm={}
      if(mcMode==='custom'){
        const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
        mcSelected.forEach(sym=>{ weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length })
      }
      const res=await fetch('/api/multibacktest',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          symbols:mcSelected,
          modoAsig:mcMode,
          weights:weightsNorm,
          rankMap,
          cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
            tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
            tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital:mcCapital}
        })
      })
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setMcResult(json)
    }catch(e){setMcError(e.message)}finally{setMcLoading(false)}
  },[mcSelected,mcMode,mcWeights,mcCapital,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,rankingData])

  // Auto-inicializar pesos iguales cuando cambian activos seleccionados (modo custom)
  useEffect(()=>{
    if(mcMode!=='custom'||mcSelected.length===0) return
    setMcWeights(prev=>{
      const next={...prev}
      // Añadir nuevos activos con peso igual
      const existingTotal=mcSelected.reduce((s,sym)=>s+(Number(prev[sym])||0),0)
      const newSyms=mcSelected.filter(sym=>!prev[sym]&&prev[sym]!==0)
      if(newSyms.length>0){
        const eq=parseFloat((100/mcSelected.length).toFixed(1))
        mcSelected.forEach(sym=>{ next[sym]=eq })
      }
      // Limpiar activos eliminados
      Object.keys(next).forEach(sym=>{ if(!mcSelected.includes(sym)) delete next[sym] })
      return next
    })
  },[mcSelected,mcMode])

  // Dibuja líneas de entrada permanentes para operaciones abiertas del símbolo activo
  useEffect(()=>{
    if(!chartApiRef.current?.setOpenTradeLines) return
    const openForSym = tlTrades.filter(t=>
      t.status==='open' &&
      (t.symbol||'').toUpperCase()===(simbolo||'').toUpperCase()
    )
    chartApiRef.current.setOpenTradeLines(openForSym)
  },[simbolo, tlTrades, result])

  const metrics=result?calcMetrics(result.trades,Number(capitalIni),result.capitalReinv,result.gananciaSimple,result.ganBH||0,result.startDate,result.meta?.ultimaFecha,Number(years)):null
  // Load settings from Supabase on mount (overrides localStorage if newer)
  // Also apply ui defaults from localStorage (safe: runs client-side only)
  useEffect(()=>{
    // Restore ui defaults from localStorage (client-only, avoids SSR mismatch)
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      if(s.ui?.defaultLabelMode!=null) setLabelMode(s.ui.defaultLabelMode)
      if(s.ui?.defaultMetricsLayout){ setMetricsLayout(s.ui.defaultMetricsLayout) }
      if(s.defaultCapital!=null)       setCapitalIni(s.defaultCapital)
    }catch(_){}
    // Restore acknowledged alarms
    try{
      const acked=JSON.parse(localStorage.getItem('v50_acked_alarms')||'[]')
      if(acked.length) setAckedAlarms(new Set(acked))
    }catch(_){}
    loadSettingsRemote().then(remote=>{
      if(remote){
        saveSettings(remote) // update local cache
        setTemaKey(k=>k+1)  // re-apply tema
        // Re-apply ui defaults from remote settings
        try{
          if(remote.ui?.defaultLabelMode!=null) setLabelMode(remote.ui.defaultLabelMode)
          if(remote.ui?.defaultMetricsLayout){ setMetricsLayout(remote.ui.defaultMetricsLayout) }
        }catch(_){}
      }
    })
  },[])

  // Apply tema font settings per section via <style> injection
  const [temaKey, setTemaKey] = useState(0)
  const [ctxMenu, setCtxMenu] = useState(null) // {x,y,section}
  const openCtx = (e, section) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({x: e.clientX, y: e.clientY, section})
  }
  useEffect(()=>{
    const applyFromLS=()=>{
      try{ const t=JSON.parse(localStorage.getItem('v50_settings')||'{}')?.tema||{}; applyTema(t.fonts||{}) }catch(_){}
    }
    applyFromLS()
    // Also try Supabase for persisted tema (using hardcoded SUPA_URL/SUPA_H)
    fetch(SUPA_URL+'/rest/v1/user_settings?key=eq.v50_tema_fonts&select=value',{
      headers:SUPA_H
    }).then(r=>r.json()).then(rows=>{
      if(rows?.[0]?.value){
        const nf=JSON.parse(rows[0].value)
        applyTema(nf)
        const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
        s.tema=s.tema||{}; s.tema.fonts=nf
        localStorage.setItem('v50_settings',JSON.stringify(s))
      }
    }).catch(()=>{})
  },[temaKey])

  const sp5=result?.sp500Status
  // Watchlist display settings (read from localStorage, live)
  const wlSettings = (() => {
    try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist||{} } catch(_){ return {} }
  })()
  const wlShowSearch    = wlSettings.showFilterSearch    !== false
  const wlShowLista     = wlSettings.showFilterLista     !== false
  const wlShowFavs      = wlSettings.showFilterFavorites !== false
  const wlShowAlarmFlt  = wlSettings.showFilterAlarms    !== false
  const wlShowRankBadge = wlSettings.showRankBadge       !== false
  // alarm dots now always visible when alarmDotIds has items (managed per-condition)
  const wlShowListBadge = wlSettings.showListBadge       !== false
  let spStatus='neutral',spTxt='SIN FILTRO'
  if(sp5&&tipoFiltro!=='none'){const blq=tipoFiltro==='precio_ema'?sp5.precio<sp5.emaR:sp5.emaR<sp5.emaL;spStatus=blq?'bad':'ok';spTxt=blq?'⚠ EVITAR ENTRADAS':'✓ APTO PARA OPERAR'}

  // Navegar al trade: scroll arriba + zoom en el gráfico
  const chartWrapRef=useRef(null)
  const navigateToTrade=(trade)=>{
    // Scroll instantáneo al top del contenedor + zoom al trade
    const el=contentRef.current
    if(el){
      // scrollTop directo: más fiable que scrollTo en todos los browsers
      el.scrollTop=0
      // Flash visual en el chart-wrap para confirmar navegación
      if(chartWrapRef.current){
        chartWrapRef.current.style.outline='1px solid #ffd166'
        setTimeout(()=>{if(chartWrapRef.current)chartWrapRef.current.style.outline=''},600)
      }
    }
    // Zoom al trade tras un tick (el scroll es síncrono, no necesitamos 400ms)
    setTimeout(()=>chartApiRef.current?.navigateTo(trade.entryDate,trade.exitDate),50)
  }

  // ── Strategy metadata (column order matches image: compound | bh | simple) ──
  const STRAT_ORDER=['compound','bh','simple']
  const STRAT_META={
    simple:  {label:'Simple',   color:'#00d4ff', bg:'rgba(0,212,255,0.08)'},
    compound:{label:'Compuesta',color:'#00e5a0', bg:'rgba(0,229,160,0.08)'},
    bh:      {label:'Buy&Hold', color:'#ffd166', bg:'rgba(255,209,102,0.08)'},
  }

  // ── Unified metrics table definition ──
  // Each row: { label, strats: {compound:val, bh:val, simple:val} or 'all'/'trade'/'notbh' }
  // null = empty cell for that strategy
  const buildUnifiedRows=(m, maxDDBH)=>{
    if(!m) return []
    const v=(val,color)=>({val,color})
    const wr=m.winRate>=50?'#00e5a0':'#ff4d6d'
    const fb=m.factorBen>=1?'#00e5a0':'#ff4d6d'
    // Strategy-specific gains
    const cS=m.ganSimple>=0?'#00e5a0':'#ff4d6d', cC=m.ganComp>=0?'#00e5a0':'#ff4d6d', cBH=m.ganBH>=0?'#00e5a0':'#ff4d6d'
    // B&H = buy & hold, no individual trades → trade-specific stats = null (—)
    return [
      {label:'Total Operaciones',     compound:v(m.n,'#ffd166'),            bh:null,                   simple:v(m.n,'#ffd166')},
      {label:'Total Días Invertido',  compound:v(m.totalDias,'#00d4ff'),    bh:null,                   simple:v(m.totalDias,'#00d4ff')},
      {label:'Días Promedio',         compound:v(fmt(m.diasProm,1,' días'),'#00d4ff'), bh:null,        simple:v(fmt(m.diasProm,1,' días'),'#00d4ff')},
      {label:`Tiempo Invertido (${fmt(m.aniosInv,2)}a)`, compound:v(fmt(m.tiempoInvPct,0,'%'),'#ffd166'), bh:null, simple:v(fmt(m.tiempoInvPct,0,'%'),'#ffd166')},
      {label:'Capital inv. medio',    compound:v(fmt(m.tiempoInvPct,1,'%'),'#9b72ff'), bh:null,       simple:v(fmt(m.tiempoInvPct,1,'%'),'#9b72ff')},
      {label:'Ganadoras',             compound:v(m.wins,'#00e5a0'),         bh:null,                   simple:v(m.wins,'#00e5a0')},
      {label:'Perdedoras',            compound:v(m.losses,'#ff4d6d'),       bh:null,                   simple:v(m.losses,'#ff4d6d')},
      {label:'Win Rate',              compound:v(fmt(m.winRate,1,'%'),wr),  bh:null,                   simple:v(fmt(m.winRate,1,'%'),wr)},
      {label:'Factor de Beneficio',   compound:v(fmt(m.factorBen,2),fb),   bh:null,                   simple:v(fmt(m.factorBen,2),fb)},
      {label:'Ganancia Media (%)',    compound:v(fmt(m.avgWin,2,'%'),'#00e5a0'),  bh:null,            simple:v(fmt(m.avgWin,2,'%'),'#00e5a0')},
      {label:'Pérdida Media (%)',     compound:v(fmt(m.avgLoss,2,'%'),'#ff4d6d'), bh:null,            simple:v(fmt(m.avgLoss,2,'%'),'#ff4d6d')},
      {label:'Ganancia (€)',          compound:v(fmt(m.ganComp,2,'€'),cC),  bh:v(fmt(m.ganBH,2,'€'),cBH), simple:v(fmt(m.ganSimple,2,'€'),cS)},
      {label:'Ganancia (%)',          compound:v(fmt(m.ganComp/Number(capitalIni)*100,2,'%'),cC), bh:v(fmt(m.ganBH/Number(capitalIni)*100,2,'%'),cBH), simple:v(fmt(m.ganTotalPct,2,'%'),cS)},
      {label:`CAGR (${fmt(m.anios,2)}a)`, compound:v(fmt(m.cagrC,2,'%'),m.cagrC>=0?'#00e5a0':'#ff4d6d'), bh:v(fmt(m.cagrBH,2,'%'),m.cagrBH>=0?'#00e5a0':'#ff4d6d'), simple:v(fmt(m.cagrS,2,'%'),m.cagrS>=0?'#00e5a0':'#ff4d6d')},
      {label:'Max Drawdown (%)',      compound:v(fmt(m.ddComp,2,'%'),'#ff4d6d'), bh:v(fmt(maxDDBH,2,'%'),'#ff4d6d'), simple:v(fmt(m.ddSimple,2,'%'),'#ff4d6d')},
    ]
  }

  // ── StratSelector — only controls metrics table, independent of charts ──
  const StratSelector=({strats,setStrats})=>(
    <div style={{display:'flex',gap:3,padding:'5px 10px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',alignItems:'center',background:'rgba(0,0,0,0.18)'}}>
      <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',marginRight:3}}>Estrategia:</span>
      {STRAT_ORDER.map(s=>(
        <button key={s} onClick={()=>{
          const next=strats.includes(s)?strats.length>1?strats.filter(x=>x!==s):strats:[...strats,s]
          setStrats(next)
        }}
          style={{fontFamily:MONO,fontSize:10,padding:'2px 8px',borderRadius:3,cursor:'pointer',
            border:`1px solid ${strats.includes(s)?STRAT_META[s].color:'#2a3f55'}`,
            background:strats.includes(s)?STRAT_META[s].bg:'transparent',
            color:strats.includes(s)?STRAT_META[s].color:'#4a6a88',fontWeight:strats.includes(s)?600:400}}>
          {STRAT_META[s].label}
        </button>
      ))}
    </div>
  )

  // ── Unified metrics table: one concept column + per-strategy value columns ──
  const UnifiedMetricsTable=({rows, strats})=>{
    const activeCols=STRAT_ORDER.filter(s=>strats.includes(s))
    if(!rows.length) return null
    const sepStyle=(si)=>si>0?{borderLeft:'1px solid rgba(26,55,85,0.9)'}:{}
    return(
      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11.5}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th style={{padding:'5px 10px',textAlign:'left',color:'#7aaac8',fontSize:10,fontWeight:400,letterSpacing:'0.07em',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>MÉTRICA</th>
            {activeCols.map((s,si)=>(
              <th key={s} style={{padding:'5px 12px',textAlign:'right',color:STRAT_META[s].color,fontSize:10,fontWeight:700,letterSpacing:'0.07em',borderBottom:`2px solid ${STRAT_META[s].color}`,background:STRAT_META[s].bg,...sepStyle(si)}}>
                {STRAT_META[s].label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,ri)=>(
            <tr key={row.label} style={{borderBottom:'1px solid rgba(20,40,65,0.9)',background:ri%2===0?'transparent':'rgba(255,255,255,0.012)'}}>
              <td style={{padding:'5px 10px',color:'#9ac8e2',fontSize:11,whiteSpace:'nowrap'}}>{row.label}</td>
              {activeCols.map((s,si)=>{
                const cell=row[s]
                return(
                  <td key={s} style={{padding:'5px 12px',textAlign:'right',fontWeight:600,color:cell?cell.color:'#2a4a6a',fontSize:12,...sepStyle(si)}}>
                    {cell?cell.val:'—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  // ── Single-column view: each active strat as its own block ──
  const SingleColumnTable=({rows, strats})=>{
    const activeCols=STRAT_ORDER.filter(s=>strats.includes(s))
    if(!rows.length||!activeCols.length) return null
    return(
      <div>
        {activeCols.map(s=>(
          <div key={s} style={{borderBottom:`2px solid ${STRAT_META[s].color}`,marginBottom:0}}>
            <div style={{padding:'4px 12px',background:STRAT_META[s].bg,borderBottom:`1px solid ${STRAT_META[s].color}40`,display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontFamily:MONO,fontSize:11,color:STRAT_META[s].color,fontWeight:700,letterSpacing:'0.08em'}}>{STRAT_META[s].label.toUpperCase()}</span>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11.5}}>
              <tbody>
                {rows.map((row,ri)=>{
                  const cell=row[s]
                  if(!cell) return null
                  return(
                    <tr key={row.label} style={{borderBottom:'1px solid rgba(20,40,65,0.9)',background:ri%2===0?'transparent':'rgba(255,255,255,0.012)'}}>
                      <td style={{padding:'5px 12px',color:'#9ac8e2',fontSize:11,whiteSpace:'nowrap'}}>{row.label}</td>
                      <td style={{padding:'5px 12px',textAlign:'right',fontWeight:600,color:cell.color,fontSize:12}}>{cell.val}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  // ── MetricsWrapper: respects metricsView ──
  const MetricsWrapper=({rows, strats})=>(
    metricsView==='single'
      ? <SingleColumnTable rows={rows} strats={strats}/>
      : <UnifiedMetricsTable rows={rows} strats={strats}/>
  )

  const metricRows=[] // legacy: no longer used
  const MetricsTable=()=>{ const rows=buildUnifiedRows(metrics, result?.maxDDBH||0); return <MetricsWrapper rows={rows} strats={metricsStrats}/> }

  // Altura de los tabs = 33px aprox. (padding 8px top+bottom + 17px línea)
  const TAB_H=33

  return (
    <>
      <Head>
        <title>Trading Simulator V4.72</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
        <style>{`
          /* ══ GLOBAL LEGIBILITY v4 ══ */
          :root {
            --text:#eef5ff; --text2:#cce0f8; --text3:#9acce8;
            --bg:#080c14; --bg2:#0a101a; --bg3:#0d1520;
            --border:#1a2d45; --accent:#00d4ff; --green:#00e5a0; --red:#ff4d6d;
            --font-size:13px;
            --font-family:"JetBrains Mono","Fira Code","IBM Plex Mono",monospace;
          }
          body { font-size:14px; color:#e0eeff; }
          /* ── Sidebar ── */
          .sidebar { font-size:13px; }
          .sidebar .sidebar-title { color:#f5fbff !important; font-weight:700; font-size:12px !important; letter-spacing:0.08em; text-transform:uppercase; padding-bottom:4px; border-bottom:1px solid #1a3050; margin-bottom:6px; }
          .sidebar label { color:#ecf5ff !important; font-size:13px !important; display:flex; flex-direction:column; gap:4px; font-weight:500; }
          .sidebar select, .sidebar input[type=text], .sidebar input[type=number] { color:#f5fbff !important; font-size:13px !important; background:#0d1828; border:1px solid #274462; padding:5px 8px; border-radius:4px; width:100%; box-sizing:border-box; }
          .sidebar .checkbox-row { color:#ecf5ff !important; font-size:13px !important; flex-direction:row !important; align-items:center; gap:8px; }
          .sidebar .sidebar-section { gap:10px; }
          .sidebar-title { margin-bottom:5px; }
          /* ── Section titles ── */
          .section-title { font-size:13px !important; color:#dceeff !important; letter-spacing:0.04em; font-weight:600; }
          /* ── Metrics panel ── */
          .metric-label { font-size:12px !important; color:#cce0f5 !important; }
          .metric-val { font-size:14px !important; font-weight:700; }
          /* ── Trade tables ── */
          .trades-table th { font-size:12px !important; color:#c0dcf0 !important; font-weight:600; padding:7px 10px !important; background:#0a111c; }
          .trades-table td { font-size:12.5px !important; color:#e8f2ff !important; padding:6px 10px !important; }
          .trades-table .tag { font-size:10px !important; padding:2px 6px !important; }
          /* ── Watchlist — symbol name clearly readable ── */
          .sidebar .wl-sym { font-size:13px !important; color:#f5fbff !important; font-weight:600; }
          .sidebar .wl-name { font-size:12px !important; color:#a8d4ec !important; font-weight:400; }
          /* ── MC sidebar ── */
          .sidebar .mc-sym { font-size:13px !important; color:#f5fbff !important; font-weight:600; }
          .sidebar .mc-name { font-size:12px !important; color:#a8d4ec !important; }
          /* ── Header SP500 bar — numbers clearly visible ── */
          .header-logo { font-size:14px !important; color:#f5fbff !important; font-weight:600; }
          .header-sp500-label { font-size:12px !important; color:#a8d4ec !important; }
          .header-sp500-val   { font-size:13px !important; color:#f0f8ff !important; font-weight:600; }
          .header-sp500-ema   { font-size:12px !important; color:#ffd166 !important; font-weight:600; }

          .status-badge { font-size:11px !important; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.75;transform:scale(1.2)} }
        @keyframes alarmPulse {
          0%,100% { opacity:1; box-shadow:var(--bc) 0 0 7px; }
          50% { opacity:0.25; box-shadow:none; }
        }
          /* ── Alarm badge numbers ── */
          .alarm-badge { font-size:11px !important; color:#f5fbff !important; font-weight:700; }
          /* ── Equity section ── */
          .equity-section .section-title { margin-bottom:4px; }
          /* ── Sidebar group/tab labels ── */
          .sidebar-tab { font-size:11px !important; color:#a8c8e0; }
          .sidebar-group-header { font-size:11px !important; color:#b0d0e8 !important; }
        `}</style>
      </Head>
      <div className="app">
        {/* ── HEADER ── */}
        <header className="header" style={{display:'flex',alignItems:'stretch',padding:0,height:TAB_H}} onContextMenu={e=>openCtx(e,'header')}>
          {/* Logo */}
          <div className="header-logo" style={{display:'flex',alignItems:'center',padding:'0 16px',flexShrink:0}}>
            <span className="dot"/>Trading Simulator V4.72
          </div>

          {/* SP500 bar — misma altura que tabs, inline en header */}
          {sp5&&(
            <div style={{
              display:'flex',alignItems:'center',gap:6,
              padding:'0 12px',
              borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',
              fontFamily:MONO,fontSize:11,flexShrink:0
            }}>
              <span className="header-sp500-label">SP500</span>
              <span className="header-sp500-val">{fmt(sp5.precio,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaR}</span>
              <span className="header-sp500-ema">{fmt(sp5.emaR,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaL}</span>
              <span style={{color:'#ff4d6d',fontWeight:600,fontFamily:MONO,fontSize:12}}>{fmt(sp5.emaL,2)}</span>
              <span className={`status-badge ${spStatus}`} style={{fontSize:10,padding:'1px 6px'}}>{spTxt}</span>
            </div>
          )}

          {/* Botones derecha */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto',padding:'0 12px'}}>
            <button onClick={()=>setRulerOn(r=>!r)} style={{
              background:rulerOn?'rgba(255,209,102,0.15)':'rgba(13,21,32,0.9)',
              border:`1px solid ${rulerOn?'#ffd166':'#2d3748'}`,
              color:rulerOn?'#ffd166':'#7a9bc0',
              fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',
              display:'flex',alignItems:'center',gap:4
            }}>
              📏 {rulerOn?'ON':'Regla'}
            </button>
            {(()=>{
              const modes=[
                {label:'🏷 OFF',bg:'rgba(13,21,32,0.9)',border:'#2d3748',color:'#7a9bc0'},
                {label:'🏷 %',bg:'rgba(0,229,160,0.08)',border:'#00e5a0',color:'#00e5a0'},
                {label:'🏷 Full',bg:'rgba(0,229,160,0.15)',border:'#00e5a0',color:'#00e5a0'},
              ]
              const m=modes[labelMode]
              return(
                <button onClick={()=>setLabelMode(l=>(l+1)%3)} title={['Sin etiquetas','Solo porcentaje','Porcentaje + euros + días'][labelMode]} style={{
                  background:m.bg, border:`1px solid ${m.border}`, color:m.color,
                  fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:4
                }}>
                  {m.label}
                </button>
              )
            })()}
            {result&&<button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${tvSym(simbolo)}`,'_blank')} style={{background:'#131722',border:'1px solid #2d3748',color:'#00d4ff',fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}
              onMouseOver={e=>e.currentTarget.style.borderColor='#00d4ff'}
              onMouseOut={e=>e.currentTarget.style.borderColor='#2d3748'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#00d4ff"><path d="M3 3h7v2H5v14h14v-5h2v7H3V3zm11 0h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"/></svg>
              TradingView
            </button>}
            {result&&metrics&&sidePanel!=='multi'&&<button
              onClick={()=>setMetricsLayout(l=>l==='grid'?'panel':l==='panel'?'multi':'grid')}
              title={metricsLayout==='grid'?'Cambiar a Panel simple':metricsLayout==='panel'?'Cambiar a Panel multi-columna':'Cambiar a Grid'}
              style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer'}}>
              {metricsLayout==='grid'?'☰ Panel':metricsLayout==='panel'?'⊞ Multi':'⊟ Grid'}
            </button>}
            <button onClick={()=>setSettingsOpen(true)} title="Configuración" style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:14,padding:'2px 8px',borderRadius:4,cursor:'pointer',lineHeight:1}} onMouseOver={e=>e.currentTarget.style.borderColor='#4a7fa0'} onMouseOut={e=>e.currentTarget.style.borderColor='#1a2d45'}>
              ⚙
            </button>
            <div style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>Stooq · diario</div>
          </div>
        </header>

        <div className="main">
          {/* ── SIDEBAR ── */}
          <aside className="sidebar" style={{padding:0,gap:0,position:'relative',width:sidebarW,flexShrink:0,flexGrow:0}} onContextMenu={e=>openCtx(e,'sidebar')}>
            {/* Resize handle — right edge */}
            <div onMouseDown={e=>{sidebarResizing.current=true;sidebarStartX.current=e.clientX;sidebarStartW.current=sidebarW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
              style={{position:'absolute',top:0,right:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                background:'transparent',transition:'background 0.15s'}}
              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
            <div className="sidebar-tabs" style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
              {[{id:'config',label:'⚙',title:'Configuración'},{id:'watchlist',label:'☰',title:'Watchlist'},{id:'alarms',label:'🔔',title:'Alertas',badge:alarmActiveCount},{id:'multi',label:'📊',title:'Backtesting'},{id:'tradelog',label:'📒',title:'TradeLog',accent:'#9b72ff'}].map(tab=>(
                <button key={tab.id} onClick={()=>setSidePanel(tab.id)} title={tab.title} style={{
                  flex:1,padding:'8px 4px',
                  background:sidePanel===tab.id?'var(--bg3)':'transparent',
                  border:'none',
                  borderBottom:sidePanel===tab.id?`2px solid ${tab.accent||'var(--accent)'}`:'2px solid transparent',
                  color:sidePanel===tab.id?(tab.accent||'var(--accent)'):'var(--text3)',
                  fontFamily:MONO,fontSize:14,cursor:'pointer',position:'relative'
                }}>
                  {tab.label}
                  {tab.badge>0&&<span style={{position:'absolute',top:4,right:2,minWidth:14,height:14,borderRadius:7,
                    background:'#ff4d6d',color:'#fff',fontSize:8,fontWeight:700,
                    display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px',
                    animation:'pulse 1.4s ease-in-out infinite'}}>{tab.badge}</span>}
                </button>
              ))}
            </div>

            {sidePanel==='config'&&(
              <div style={{padding:14,display:'flex',flexDirection:'column',gap:14,overflowY:'auto',flex:1}}>
                {/* ── Selector de estrategia ── */}
                <div className="sidebar-section">
                  <div className="sidebar-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Estrategia</span>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={newStrategy} title="Nueva estrategia" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:11,padding:'1px 6px',borderRadius:3,cursor:'pointer'}}>+</button>
                      <button onClick={()=>strategies.length>0&&openEditStr(strategies.find(s=>s.name===strForm._loadedName)||strategies[0])} title="Gestionar estrategias" style={{background:'transparent',border:'1px solid var(--border)',color:'#a8ccdf',fontFamily:MONO,fontSize:11,padding:'1px 6px',borderRadius:3,cursor:'pointer'}}>✎</button>
                    </div>
                  </div>
                  {strLoading
                    ? <div style={{fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>
                    : <label>
                        <select
                          value={strForm._loadedName||''}
                          onChange={e=>{
                            const s=strategies.find(x=>x.name===e.target.value)
                            if(s) loadStrategyLegacy(s)
                          }}
                          style={{width:'100%'}}
                        >
                          <option value="">— seleccionar —</option>
                          {strategies.map(s=>(
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                  }
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-title">Estrategia</div>
                  <div className="row2">
                    <label>EMA Rápida <Tip id="emaR"/><input type="number" value={emaR} min={1} max={500} onChange={e=>setEmaR(e.target.value)}/></label>
                    <label>EMA Lenta <Tip id="emaL"/><input  type="number" value={emaL} min={1} max={500} onChange={e=>setEmaL(e.target.value)}/></label>
                  </div>
                  <div className="row2">
                    <label>Capital (€) <Tip id="capital"/><input type="number" value={capitalIni} min={100} onChange={e=>setCapitalIni(e.target.value)}/></label>
                    <label>Años BT <Tip id="years"/><input    type="number" value={years} min={1} max={20} onChange={e=>setYears(e.target.value)}/></label>
                  </div>
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-title">Stop Loss</div>
                  <label>Tipo <Tip id="tipoStop"/><select value={tipoStop} onChange={e=>setTipoStop(e.target.value)}><option value="tecnico">Stop Técnico (EMA)</option><option value="atr">Stop ATR</option><option value="none">Ninguno</option></select></label>
                  {tipoStop==='atr'&&<div className="row2"><label>ATR <Tip id="atr"/><input type="number" value={atrP} min={1} onChange={e=>setAtrP(e.target.value)}/></label><label>Mult. <Tip id="atrMult"/><input type="number" value={atrM} min={0.1} step={0.1} onChange={e=>setAtrM(e.target.value)}/></label></div>}
                  <label className="checkbox-row"><input type="checkbox" checked={sinPerdidas} onChange={e=>setSinPerdidas(e.target.checked)}/>Sin Pérdidas <Tip id="sinPerdidas"/></label>
                  <label className="checkbox-row"><input type="checkbox" checked={reentry} onChange={e=>setReentry(e.target.checked)}/>Re-Entry <Tip id="reentry"/></label>
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-title">Filtro SP500</div>
                  <label>Filtro <Tip id="filtroSP500"/><select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)}><option value="none">Sin filtro</option><option value="precio_ema">Precio sobre EMA rápida</option><option value="ema_ema">EMA rápida sobre EMA lenta</option></select></label>
                  {tipoFiltro!=='none'&&<div className="row2"><label>EMA R <Tip id="sp500Emas"/><input type="number" value={sp500EmaR} min={1} onChange={e=>setSp500EmaR(e.target.value)}/></label><label>EMA L<input type="number" value={sp500EmaL} min={1} onChange={e=>setSp500EmaL(e.target.value)}/></label></div>}
                </div>
                {loading&&<div style={{fontFamily:MONO,fontSize:12,color:'var(--accent)',textAlign:'center',fontWeight:600}}>⟳ Actualizando...</div>}
                {error&&<div style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',padding:'6px 0'}}>⚠ {error}</div>}
              </div>
            )}

            {sidePanel==='watchlist'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'visible',minHeight:0}}>
                {/* ══ Fila 1: búsqueda + lista + favoritos + acciones ══ */}
                <div style={{padding:'5px 8px 3px',borderBottom:'none',flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
                  {/* Buscador compacto */}
                  {wlShowSearch&&<div style={{position:'relative',flex:'0 0 90px'}}>
                    <input type="text" placeholder="🔍" value={wlSearch} onChange={e=>setWlSearch(e.target.value)}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'4px 20px 4px 7px',borderRadius:4,boxSizing:'border-box'}}/>
                    {wlSearch&&<span onClick={()=>setWlSearch('')} style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>}
                  {/* Selector de lista */}
                  {wlShowLista&&<div style={{position:'relative',flex:1,minWidth:0}}>
                    <button onClick={()=>{setListDropOpen(o=>!o);setAlarmDropOpen(false)}} style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',overflow:'hidden'}}>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selectedLists.length===0?'Lista: Todas':selectedLists[0]}</span>
                      <span style={{flexShrink:0,marginLeft:2}}>{listDropOpen?'▲':'▼'}</span>
                    </button>
                    {listDropOpen&&(()=>{
                      const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                      return(
                        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:3,zIndex:60,boxShadow:'0 4px 16px rgba(0,0,0,0.7)',minWidth:120}}>
                          <div onClick={()=>{setSelectedLists([]);setWlSearch('');setListDropOpen(false)}} style={{padding:'6px 10px',fontFamily:MONO,fontSize:12,cursor:'pointer',color:selectedLists.length===0?'var(--accent)':'var(--text)',borderBottom:'1px solid var(--border)'}}>
                            Todas las listas
                          </div>
                          {allLists.map(l=>(
                            <div key={l} onClick={()=>{setSelectedLists([l]);setWlSearch('');setListDropOpen(false)}}
                              style={{padding:'6px 10px',fontFamily:MONO,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,color:'var(--text)'}}>
                              <span style={{color:selectedLists.includes(l)?'var(--accent)':'var(--text3)',fontSize:11}}>{selectedLists.includes(l)?'●':'○'}</span>{l}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>}
                  {/* Filtro favoritos */}
                  {wlShowFavs&&<button onClick={()=>setOnlyFavs(f=>!f)} title={onlyFavs?'Mostrando solo favoritos':'Filtrar solo favoritos'}
                    style={{background:onlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${onlyFavs?'#ffd166':'var(--border)'}`,color:onlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
                    ★
                  </button>}

                  {(wlShowSearch||wlShowLista||wlShowFavs)&&<button onClick={()=>{setWlSearch('');setSelectedLists([]);setOnlyFavs(false);setSelectedAlarmIds([])}} title="Limpiar todos los filtros" style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:3,cursor:'pointer',flexShrink:0}}>✕</button>}
                </div>


                {/* ── Lista de activos ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {wlLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!wlLoading&&(()=>{
                    const searchLower=wlSearch.toLowerCase()
                    const fCondId=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.filterConditionId||null}catch(_){return null}})()
                    const filtered=watchlist.filter(w=>{
                      const matchList=selectedLists.length===0||selectedLists.includes(w.list_name||'General')
                      const matchSearch=!wlSearch||(w.symbol||'').toLowerCase().includes(searchLower)||(w.name||'').toLowerCase().includes(searchLower)
                      const matchFav=!onlyFavs||w.favorite
                      const symAlarms=alarmStatus[w.symbol]||{}
                      const matchAlarm=selectedAlarmIds.length===0||selectedAlarmIds.every(id=>symAlarms[id]?.active===true)
                      // Condition filter: when active, only show symbols where condition is triggered
                      // condFilterActive removed
                      return matchList&&matchSearch&&matchFav&&matchAlarm
                    })
                    // Sort: 1st by ranking, 2nd by favorite, 3rd alphabetical
                    const all=filtered.slice().sort((a,b)=>{
                      const ra=rankingData[a.symbol]?.rank, rb=rankingData[b.symbol]?.rank
                      if(ra!=null&&rb!=null) return ra-rb
                      if(ra!=null) return -1
                      if(rb!=null) return 1
                      if(a.favorite&&!b.favorite) return -1
                      if(!a.favorite&&b.favorite) return 1
                      return a.name.localeCompare(b.name)
                    })
                    const totalWl=watchlist.length
                    if(!all.length) return <div style={{padding:'12px',fontFamily:MONO,fontSize:11,color:'#8aadcc'}}>Sin activos para los filtros activos</div>
                    // Count badge + ranking button above list
                    const hasRanking=Object.keys(rankingData).length>0
                    const countBadge=(
                      <div style={{padding:'3px 8px',fontFamily:MONO,fontSize:11,color:'#a8ccdf',background:'var(--bg2)',borderBottom:'1px solid var(--border)',display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{color:'#a8c8e8',fontWeight:600}}>{all.length}</span>
                        <span style={{color:'#8abcd4'}}>activos</span>
                        {rankingRunning&&<span style={{color:'#ffd166',fontSize:10}}>⟳ {rankingProgress.done}/{rankingProgress.total}</span>}
                        {hasRanking&&!rankingRunning&&<span style={{color:'#00e5a0',fontSize:9}} title={rankingStratName?`Calculado con: ${rankingStratName}`:''}>🏆 {rankingStratName||'Ranking'}</span>}
                        <button onClick={()=>calcRanking(filtered)} disabled={rankingRunning} title="Calcular ranking de activos con la estrategia activa"
                          style={{marginLeft:'auto',background:rankingRunning?'rgba(13,21,32,0.5)':'rgba(255,209,102,0.1)',border:`1px solid ${rankingRunning?'#1a2d45':'rgba(255,209,102,0.4)'}`,color:rankingRunning?'#3d5a7a':'#ffd166',fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:rankingRunning?'not-allowed':'pointer',letterSpacing:'0.05em'}}>
                          {rankingRunning?'calculando…':'🏆 Ranking'}
                        </button>
                        {hasRanking&&<button onClick={()=>setRankingData({})} title="Limpiar ranking"
                          style={{background:'transparent',border:'1px solid #1a2d45',color:'#5a7a95',fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer'}}>✕</button>}
                      </div>
                    )
                    return (<>{countBadge}{all.map(w=>(
                      <div key={w.id||w.symbol}
                        style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)',
                          background:simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent',
                          borderLeft:`2px solid ${fCondId&&alarmStatus[w.symbol]?.[fCondId]?.active===true?'#00e5a0':'transparent'}`,
                          transition:'border-color 0.2s'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}>
                        {/* Ranking badge */}
                        {wlShowRankBadge&&(()=>{
                          const rd=rankingData[w.symbol]
                          if(!rd) return <span style={{width:16,flexShrink:0}}/>
                          const r=rd.rank
                          const col=r===1?'#ffd700':r===2?'#c0c0c0':r===3?'#cd7f32':r<=10?'#00d4ff':'#3d5a7a'
                          return(
                            <span title={`Rank #${r} · Score: ${rd.score?.toFixed(0)??'—'} · WR:${rd.metrics?.winRate?.toFixed(0)??'—'}% · FB:${rd.metrics?.factorBen?.toFixed(1)??'—'} · CAGR:${rd.metrics?.cagr?.toFixed(1)??'—'}%`}
                              style={{fontFamily:MONO,fontSize:9,fontWeight:700,color:col,flexShrink:0,minWidth:20,textAlign:'center',lineHeight:1}}>
                              {r<=3?['🥇','🥈','🥉'][r-1]:`#${r}`}
                            </span>
                          )
                        })()} 
                        {/* Estrella favorito */}
                        <span onClick={async(e)=>{e.stopPropagation();await upsertWatchlistItem({...w,favorite:!w.favorite});reloadWatchlist()}}
                          style={{cursor:'pointer',fontSize:12,color:w.favorite?'#ffd166':'var(--text3)',flexShrink:0}} title="Favorito">
                          {w.favorite?'★':'☆'}
                        </span>
                        {/* Nombre — clic carga el activo */}
                        <div onClick={()=>setSimbolo(w.symbol)} style={{flex:1,cursor:'pointer',minWidth:0}}>
                          <div style={{fontFamily:MONO,fontSize:11,color:simbolo===w.symbol?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#8aadcc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
                        </div>
                        {/* Badges condiciones librería — círculos de color con velas */}
                        {(()=>{
                          const allLibConds = lsGetConds()
                          if(!allLibConds.length) return null
                          // condDotIds seleccionados en Settings; si vacío → mostrar todos
                          const condDotIds=(()=>{try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');const ids=s?.watchlist?.condDotIds;return Array.isArray(ids)&&ids.length>0?ids:null}catch(_){return null}})()
                          const visibleConds = condDotIds ? allLibConds.filter(c=>condDotIds.includes(c.id)) : allLibConds
                          if(!visibleConds.length) return null
                          const symSt=alarmStatus[w.symbol]
                          const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          const blinkN=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.blinkCandles??3}catch(_){return 3}})()
                          const CTYPE_LABELS={ema_cross_up:'Cruce alcista EMA',ema_cross_down:'Cruce bajista EMA',price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',macd_cross_up:'MACD ↑',macd_cross_down:'MACD ↓'}
                          return visibleConds.map((c,ci)=>{
                            const st=symSt?.[c.id]
                            // Show dot even without status data (grey = not evaluated yet)
                            const active=st?.active===true
                            const bars=st?.bars
                            const col=COND_COLORS[ci%COND_COLORS.length]
                            const label=bars!=null?String(bars):'·'
                            const shouldBlink=active&&bars!=null&&bars<=blinkN
                            const paramStr=c.params?.ma_fast?`EMA ${c.params.ma_fast}/${c.params.ma_slow}`:c.params?.ma_period?`MA(${c.params.ma_period})`:c.params?.period?`RSI(${c.params.period}) niv.${c.params.level}`:''
                            const tooltip=`${c.name}${paramStr?' · '+paramStr:''}${active?' ✓ activa'+(bars!=null?' · '+bars+'v':''):' — inactiva'}`
                            return(
                              <span key={c.id} title={tooltip}
                                style={{
                                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                                  width:15,height:15,borderRadius:'50%',flexShrink:0,
                                  background:active?col:'rgba(42,63,85,0.5)',
                                  border:`1.5px solid ${active?col:'#2a3f55'}`,
                                  color:active?'#080c14':'#3d5a7a',
                                  fontFamily:MONO,fontSize:6,fontWeight:800,lineHeight:1,letterSpacing:'-0.5px',
                                  boxShadow:active?`0 0 6px ${col}55`:undefined,
                                  cursor:'default',
                                  animation:shouldBlink?`alarmPulse 1s ease-in-out infinite`:undefined,
                                }}>
                                {active?label:''}
                              </span>
                            )
                          })
                        })()}
                        {/* Lista badge */}
                        {wlShowListBadge&&<span style={{fontFamily:MONO,fontSize:8,color:'#7fb8d8',background:'var(--bg2)',padding:'1px 4px',borderRadius:2,flexShrink:0}}>{w.list_name||'General'}</span>}
                        {/* Editar */}
                        <span onClick={e=>{e.stopPropagation();openEditItem(w)}} style={{cursor:'pointer',color:'#a8ccdf',fontSize:11,padding:'0 2px',flexShrink:0}} title="Editar">✎</span>
                      </div>
                    ))}
                  </>)
                  })()}
                </div>

                {/* ── Modal editor activo — fixed sobre gráfico ── */}
                {editingItem!==null&&(
                  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditItem()}}>
                    <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:440,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:12,fontFamily:MONO,fontSize:12,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <span style={{fontWeight:700,color:'var(--text)',fontSize:14}}>{editingItem.id?'Editar activo':'Nuevo activo'}</span>
                        <button onClick={closeEditItem} style={{background:'transparent',border:'none',color:'#a8ccdf',fontSize:16,cursor:'pointer',lineHeight:1}}>✕</button>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Símbolo
                          <input type="text" value={editForm.symbol||''} onChange={e=>{
                            const sym=e.target.value.toUpperCase()
                            setEditForm(p=>({...p,symbol:sym}))
                            // Cancelar búsqueda anterior
                            if(symSearchRef.current) clearTimeout(symSearchRef.current)
                            // Nombre local inmediato como placeholder
                            const nameLocal=lookupName(sym)
                            if(nameLocal&&!(editForm._nameTouched)) setEditForm(p=>({...p,symbol:sym,name:nameLocal}))
                            // Búsqueda real con debounce 600ms
                            symSearchRef.current=setTimeout(async()=>{
                              if(sym.length<1) return
                              const realName=await searchSymbolName(sym)
                              if(realName) setEditForm(p=>p._nameTouched?p:{...p,name:realName})
                            },600)
                          }} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Nombre
                          <input type="text" value={editForm.name||''} onChange={e=>setEditForm(p=>({...p,name:e.target.value,_nameTouched:true}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Grupo
                          <select value={editForm.group_name||'Acciones'} onChange={e=>setEditForm(p=>({...p,group_name:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}>
                            {['Índices','Acciones','Crypto','Materias Primas'].map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Lista
                          {(()=>{
                            const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                            return(<>
                              <input type="text" list="wl-lists" value={editForm.list_name||'General'}
                                onChange={e=>setEditForm(p=>({...p,list_name:e.target.value}))}
                                style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                              <datalist id="wl-lists">
                                {allLists.map(l=><option key={l} value={l}/>)}
                              </datalist>
                            </>)
                          })()}
                        </label>
                      </div>
                      <label style={{display:'flex',alignItems:'center',gap:8,color:'#a8ccdf',cursor:'pointer',padding:'4px 0'}}>
                        <input type="checkbox" checked={editForm.favorite||false} onChange={e=>setEditForm(p=>({...p,favorite:e.target.checked}))} style={{width:14,height:14}}/>
                        <span style={{color:'#ffd166'}}>★</span> Marcar como favorito
                      </label>
                      <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>
                        Observaciones
                        <textarea value={editForm.observations||''} onChange={e=>setEditForm(p=>({...p,observations:e.target.value}))} rows={3} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4,resize:'vertical'}}/>
                      </label>
                      <div style={{display:'flex',gap:8,marginTop:6,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                        <button onClick={saveEditItem} disabled={editSaving} style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:12,padding:'8px',borderRadius:4,cursor:'pointer',fontWeight:600}}>
                          {editSaving?'Guardando…':'Guardar'}
                        </button>
                        {editingItem.id&&<button onClick={()=>deleteItem(editingItem.id)} style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:12,padding:'8px 14px',borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>
                          Eliminar
                        </button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sidePanel==='alarms'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* Header */}
                <div style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:12,color:'#a8ccdf',flex:1}}>Alertas</span>
                  <button onClick={()=>refreshAlarmStatus()} title="Actualizar estado" style={{background:'transparent',border:'none',color:'#5a7a95',fontFamily:MONO,fontSize:13,padding:'2px 5px',cursor:'pointer'}} disabled={alarmStatusLoading}>{alarmStatusLoading?'⟳':'↻'}</button>
                  <button onClick={newAlarm} title="Nueva alarma" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'3px 8px',borderRadius:3,cursor:'pointer'}}>+</button>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {alarmLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!alarmLoading&&(()=>{
                    const COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                    const blinkN=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.blinkCandles??3}catch(_){return 3}})()
                    const COND_LABELS={
                      ema_cross_up:'↑ Cruce alcista EMA',ema_cross_down:'↓ Cruce bajista EMA',
                      price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
                      price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',
                      rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
                      rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
                      macd_cross_up:'MACD cruza señal ↑',macd_cross_down:'MACD cruza señal ↓',
                    }

                    // Separate price alerts vs condition alerts
                    const priceAlerts=alarms.filter(a=>a.condition==='price_level')
                    const condAlarms=alarms.filter(a=>a.condition!=='price_level')

                    // Build triggered rows: ONLY those where condition is currently ACTIVE
                    // (not pending — no mostramos ruido de condiciones no disparadas)
                    const triggeredRows=[]
                    const ackedRows=[]
                    condAlarms.forEach((a,ai)=>{
                      const col=COLORS[ai%COLORS.length]
                      watchlist.forEach(w=>{
                        const st=alarmStatus[w.symbol]?.[a.id]
                        if(!st||st.active!==true) return   // skip not-active
                        const ackKey=`${w.symbol}::${a.id}`
                        const isAcked=ackedAlarms.has(ackKey)
                        const bars=st.bars
                        const shouldBlink=bars!=null&&bars<=blinkN
                        const row={a,w,col,isAcked,shouldBlink,ackKey,bars}
                        if(isAcked) ackedRows.push(row)
                        else triggeredRows.push(row)
                      })
                    })

                    const SectionHeader=({color,label,count,right})=>(
                      <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:9,color,letterSpacing:'0.08em',textTransform:'uppercase',
                        background:'rgba(0,0,0,0.25)',borderBottom:'1px solid var(--border)',borderTop:'1px solid var(--border)',
                        display:'flex',alignItems:'center',gap:6}}>
                        <span>{label}</span>
                        <span style={{color:'#3d5a7a'}}>({count})</span>
                        {right&&<div style={{marginLeft:'auto'}}>{right}</div>}
                      </div>
                    )

                    const renderTriggered=(r,i)=>(
                      <div key={r.ackKey+i} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.7)',display:'flex',alignItems:'center',gap:8}}>
                        <span style={{width:9,height:9,borderRadius:'50%',flexShrink:0,background:r.col,
                          animation:r.shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined,
                          boxShadow:`0 0 7px ${r.col}`}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                            <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:r.col}}>{r.w.symbol}</span>
                            <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.a.name}</span>
                          </div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',marginTop:1}}>
                            {COND_LABELS[r.a.condition]||r.a.condition}
                            {r.bars!=null&&<span style={{color:'#3d5a7a'}}> · {r.bars}v</span>}
                          </div>
                        </div>
                        <button onClick={()=>ackAlarm(r.w.symbol,r.a.id)} title="Reconocer"
                          style={{background:'rgba(0,229,160,0.08)',border:'1px solid #00e5a045',color:'#00e5a0',fontFamily:MONO,fontSize:9,padding:'3px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>
                          ACK
                        </button>
                      </div>
                    )

                    const noActivity = priceAlerts.length===0 && triggeredRows.length===0 && ackedRows.length===0

                    return(
                      <div>
                        {/* ── Alertas de precio ── */}
                        {priceAlerts.length>0&&(
                          <div>
                            <SectionHeader color="#ffd166" label="🎯 Alertas de precio" count={priceAlerts.length}/>
                            {priceAlerts.map(a=>{
                              const isAbove=a.condition_detail==='price_above'
                              return(
                                <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.7)',display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{fontSize:14,color:isAbove?'#00e5a0':'#ff4d6d',flexShrink:0,lineHeight:1}}>{isAbove?'▲':'▼'}</span>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontFamily:MONO,fontSize:12,color:'#e8f4ff',fontWeight:700}}>
                                      {a.symbol} <span style={{color:'#5a7a95',fontWeight:400}}>@</span> <span style={{color:isAbove?'#00e5a0':'#ff4d6d'}}>{a.price_level?.toFixed(2)??'—'}</span>
                                    </div>
                                    <div style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>{a.name}</div>
                                  </div>
                                  <button onClick={async()=>{await deleteAlarm(a.id);reloadAlarms()}}
                                    style={{background:'transparent',border:'none',color:'#4a2a2a',fontSize:14,cursor:'pointer',padding:'0 4px',flexShrink:0}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'} onMouseOut={e=>e.currentTarget.style.color='#4a2a2a'}>✕</button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ── Alertas activas (disparadas) ── */}
                        {triggeredRows.length>0&&(
                          <div>
                            <SectionHeader color="#ff6b6b" label="⚡ Disparadas" count={triggeredRows.length}
                              right={<button onClick={()=>triggeredRows.forEach(r=>ackAlarm(r.w.symbol,r.a.id))}
                                style={{fontFamily:MONO,fontSize:9,padding:'1px 6px',border:'1px solid #3a1a20',background:'rgba(255,77,109,0.08)',color:'#ff6b6b',borderRadius:3,cursor:'pointer'}}>
                                ACK todas</button>}/>
                            {triggeredRows.map(renderTriggered)}
                          </div>
                        )}

                        {/* ── Reconocidas — click Limpiar para ELIMINAR ── */}
                        {ackedRows.length>0&&(
                          <div>
                            <SectionHeader color="#3d5a7a" label="✓ Reconocidas" count={ackedRows.length}
                              right={
                                <button onClick={async()=>{
                                  // Get unique alarm ids from acked rows and delete them
                                  const uniqueIds=[...new Set(ackedRows.map(r=>r.a.id))]
                                  for(const id of uniqueIds){ await deleteAlarm(id) }
                                  reloadAlarms()
                                  // Clear acked state for these
                                  setAckedAlarms(prev=>{
                                    const next=new Set(prev)
                                    ackedRows.forEach(r=>next.delete(r.ackKey))
                                    return next
                                  })
                                }}
                                style={{fontFamily:MONO,fontSize:9,padding:'1px 6px',border:'1px solid #3a1a20',background:'rgba(255,77,109,0.06)',color:'#ff6060',borderRadius:3,cursor:'pointer'}}>
                                🗑 Eliminar</button>
                              }/>
                            {/* Group by alarm to avoid N×symbols rows */}
                            {[...new Map(ackedRows.map(r=>[r.a.id,r])).values()].map((r,i)=>{
                              const syms=ackedRows.filter(x=>x.a.id===r.a.id).map(x=>x.w.symbol)
                              return(
                              <div key={r.a.id+i} style={{padding:'7px 10px',borderBottom:'1px solid rgba(20,40,65,0.5)',display:'flex',alignItems:'center',gap:8,opacity:0.35}}>
                                <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:'#2a3f55'}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',fontWeight:600}}>{r.a.name}</span>
                                  {syms.length>1
                                    ? <span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a',marginLeft:5}}>{syms.length} símbolos</span>
                                    : <span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a',marginLeft:5}}>{syms[0]}</span>
                                  }
                                </div>
                                <button onClick={async()=>{
                                    await deleteAlarm(r.a.id); reloadAlarms()
                                    const keysToRemove=ackedRows.filter(x=>x.a.id===r.a.id).map(x=>x.ackKey)
                                    setAckedAlarms(prev=>{const next=new Set(prev);keysToRemove.forEach(k=>next.delete(k));return next})
                                  }}
                                  title="Eliminar esta alerta"
                                  style={{background:'transparent',border:'none',color:'#3a1a20',fontSize:13,cursor:'pointer',padding:'0 3px'}}
                                  onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                                  onMouseOut={e=>e.currentTarget.style.color='#3a1a20'}>✕</button>
                              </div>
                            )})}
                          </div>
                        )}

                        {/* ── Estado vacío ── */}
                        {noActivity&&(
                          <div style={{padding:'24px 12px',textAlign:'center'}}>
                            <div style={{fontSize:28,marginBottom:8}}>🔕</div>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',lineHeight:1.7}}>
                              Sin alertas activas.<br/>
                              Pulsa <b style={{color:'#00d4ff'}}>+</b> para crear una nueva.
                            </div>
                          </div>
                        )}

                        {/* ── Gestión: lista de condiciones/alertas configuradas ── */}
                        {condAlarms.length>0&&(
                          <div style={{marginTop:4}}>
                            <SectionHeader color="#5a7a95" label="⚙ Configuradas" count={condAlarms.length}/>
                            {condAlarms.map((a,ai)=>{
                              const col=COLORS[ai%COLORS.length]
                              const activeCount=watchlist.filter(w=>alarmStatus[w.symbol]?.[a.id]?.active===true).length
                              return(
                                <div key={a.id} style={{padding:'7px 10px',borderBottom:'1px solid rgba(20,40,65,0.5)',display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                                    background:activeCount>0?col:'#2a3f55',
                                    boxShadow:activeCount>0?`0 0 5px ${col}`:undefined}}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',fontWeight:600}}>{a.name}</div>
                                    <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80'}}>
                                      {COND_LABELS[a.condition]||a.condition}
                                      {activeCount>0&&<span style={{color:col}}> · {activeCount} activos</span>}
                                    </div>
                                  </div>
                                  <button onClick={()=>openEditAlarm(a)}
                                    style={{background:'transparent',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer'}}>✎</button>
                                  <button onClick={async()=>{await removeAlarm(a.id)}}
                                    style={{background:'transparent',border:'none',color:'#3a1a20',fontSize:13,cursor:'pointer',padding:'0 2px'}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'} onMouseOut={e=>e.currentTarget.style.color='#3a1a20'}>✕</button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}


            {/* ══ PANEL BACKTESTING ══ */}
            {sidePanel==='multi'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflowY:'auto'}}>
                {/* Botón ejecutar — fijado arriba */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0}}>
                  {mcSelected.length>=2?(
                    <button onClick={runBacktesting} disabled={mcLoading}
                      style={{width:'100%',fontFamily:MONO,fontSize:11,padding:'7px 10px',borderRadius:4,cursor:mcLoading?'wait':'pointer',
                        background:mcLoading?'rgba(0,212,255,0.05)':'rgba(0,212,255,0.15)',
                        border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700,letterSpacing:'0.05em'}}>
                      {mcLoading?'⟳ Calculando...':'▶ EJECUTAR BACKTESTING'}
                    </button>
                  ):(
                    <button disabled style={{width:'100%',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4,cursor:'not-allowed',
                      background:'transparent',border:'1px solid #2a3f55',color:'#7aabc8',letterSpacing:'0.05em'}}>
                      ▶ EJECUTAR — selecciona 2+ activos
                    </button>
                  )}
                  {mcError&&<div style={{fontFamily:MONO,fontSize:12,color:'#ff4d6d',marginTop:5}}>⚠ {mcError}</div>}
                </div>

                {/* Modo de asignación */}
                <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',marginBottom:6,letterSpacing:'0.05em',fontWeight:600}}>MODO DE ASIGNACIÓN</div>
                  {(()=>{
                    // eslint-disable-next-line
                    return [
                      {id:'slots',label:'Slots iguales',ready:true,
                        desc:'El capital se divide en N partes iguales, una por activo. Cada slot opera de forma independiente con su fracción fija. Ejemplo: 4 activos con €10.000 → cada uno opera con €2.500 en paralelo, sin interferir entre sí.'},
                      {id:'rotativo',label:'Capital rotativo',ready:true,
                        desc:'Un único pool de capital se asigna a los activos según van generando señales. Al cerrar una posición, el capital liberado vuelve al pool para la siguiente señal. Si hay señales simultáneas, se prioriza por ranking.'},
                      {id:'custom',label:'Pesos personalizados',ready:true,
                        desc:'Define manualmente qué porcentaje del capital va a cada activo. La suma debe ser 100%. Ideal para sobreponderar activos de mayor convicción.'},
                    ].map(m=>(
                      <div key={m.id} style={{marginBottom:3}}>
                        <div onClick={()=>m.ready&&setMcMode(m.id)}
                          style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,
                            background:mcMode===m.id?'rgba(0,212,255,0.08)':'transparent',
                            border:`1px solid ${mcMode===m.id?'var(--accent)':'var(--border)'}`,
                            cursor:m.ready?'pointer':'not-allowed',opacity:m.ready?1:0.45}}>
                          <div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${mcMode===m.id?'var(--accent)':'#3d5a7a'}`,
                            background:mcMode===m.id?'var(--accent)':'transparent',flexShrink:0}}/>
                          <span style={{fontFamily:MONO,fontSize:12,color:mcMode===m.id?'var(--accent)':'#c8dff5',fontWeight:600,flex:1}}>
                            {m.label}{!m.ready&&<span style={{fontSize:8,color:'#ffd166',marginLeft:5,verticalAlign:'middle'}}>⏳</span>}
                          </span>
                          <span
                            title={m.desc}
                            style={{width:16,height:16,borderRadius:'50%',border:'1px solid #3d5a7a',color:'#3d5a7a',fontSize:10,
                              display:'flex',alignItems:'center',justifyContent:'center',cursor:'help',flexShrink:0,fontWeight:700,lineHeight:1}}>
                            ?
                          </span>
                        </div>
                      </div>
                    ))
                  })()}
                </div>

                {/* Pesos personalizados — solo visible cuando modo=custom y hay activos seleccionados */}
                {mcMode==='custom'&&mcSelected.length>0&&(()=>{
                  const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
                  const ok=Math.abs(total-100)<0.5
                  const distribute=()=>{
                    const eq=(100/mcSelected.length)
                    const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(eq.toFixed(1))})
                    setMcWeights(w)
                  }
                  const normalize=()=>{
                    if(total===0){distribute();return}
                    const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(((Number(mcWeights[s])||0)/total*100).toFixed(1))})
                    setMcWeights(w)
                  }
                  return(
                    <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
                        <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>PESOS</div>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={distribute}
                            style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                            Repartir igual
                          </button>
                          <button onClick={normalize}
                            style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                            Normalizar
                          </button>
                        </div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {mcSelected.map(sym=>{
                          const v=mcWeights[sym]??''
                          return(
                            <div key={sym} style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sym}</span>
                              <div style={{display:'flex',alignItems:'center',gap:3}}>
                                <input type="number" min="0" max="100" step="0.1" value={v}
                                  onChange={e=>setMcWeights(prev=>({...prev,[sym]:e.target.value}))}
                                  style={{width:52,background:'var(--bg3)',border:'1px solid var(--border)',
                                    color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'2px 5px',
                                    borderRadius:3,textAlign:'right'}}/>
                                <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a9a'}}>%</span>
                              </div>
                              {/* mini barra visual */}
                              <div style={{width:40,height:6,borderRadius:3,background:'rgba(61,90,122,0.3)',overflow:'hidden',flexShrink:0}}>
                                <div style={{height:'100%',borderRadius:3,width:`${Math.min(100,Number(v)||0)}%`,
                                  background:ok?'#00d4ff':'#ffd166',transition:'width 0.2s'}}/>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Indicador de suma */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:7,paddingTop:5,borderTop:'1px solid var(--border)'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>Suma total</span>
                        <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:ok?'#00e5a0':Math.abs(total-100)<5?'#ffd166':'#ff4d6d'}}>
                          {total.toFixed(1)}% {ok?'✓':'⚠'}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Selector de activos */}
                <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
                  {/* Filtros */}
                  <div style={{padding:'5px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
                    <input type="text" placeholder="🔍 Buscar..." value={mcSearch||''} onChange={e=>setMcSearch(e.target.value)}
                      style={{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:4,minWidth:0}}/>
                    <button onClick={()=>setMcOnlyFavs(f=>!f)}
                      style={{background:mcOnlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${mcOnlyFavs?'#ffd166':'var(--border)'}`,color:mcOnlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
                      ★
                    </button>
                    {(()=>{
                      const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                      return(
                        <select value={mcListFilter||''} onChange={e=>setMcListFilter(e.target.value)}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 5px',borderRadius:4,maxWidth:80}}>
                          <option value="">Todas</option>
                          {allLists.map(l=><option key={l} value={l}>{l}</option>)}
                        </select>
                      )
                    })()}
                  </div>
                  <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily:MONO,fontSize:10,color:'#cde5ff',fontWeight:700}}>{mcSelected.length} seleccionados</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setMcSelected(watchlist.map(w=>w.symbol))}
                        style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#a8ccdf',cursor:'pointer'}}>
                        Todos
                      </button>
                      <button onClick={()=>setMcSelected([])}
                        style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#ff4d6d',cursor:'pointer'}}>
                        Ninguno
                      </button>
                    </div>
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                  {[...watchlist].filter(w=>{
                    const matchSearch=!mcSearch||(w.symbol||'').toLowerCase().includes(mcSearch.toLowerCase())||(w.name||'').toLowerCase().includes(mcSearch.toLowerCase())
                    const matchFav=!mcOnlyFavs||w.favorite
                    const matchList=!mcListFilter||(w.list_name||'General')===mcListFilter
                    return matchSearch&&matchFav&&matchList
                  }).sort((a,b)=>{
                    const ra=rankingData[a.symbol]?.rank, rb=rankingData[b.symbol]?.rank
                    if(ra!=null&&rb!=null) return ra-rb
                    if(ra!=null) return -1
                    if(rb!=null) return 1
                    return a.name.localeCompare(b.name)
                  }).map(w=>{
                    const sel=mcSelected.includes(w.symbol)
                    const rd=rankingData[w.symbol]
                    return(
                      <div key={w.symbol} onClick={()=>setMcSelected(prev=>sel?prev.filter(s=>s!==w.symbol):[...prev,w.symbol])}
                        style={{display:'flex',alignItems:'center',gap:7,padding:'5px 6px',borderRadius:3,marginBottom:2,cursor:'pointer',
                          background:sel?'rgba(0,212,255,0.07)':'transparent',
                          border:`1px solid ${sel?'rgba(0,212,255,0.2)':'transparent'}`}}
                        onMouseOver={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.07)':'transparent'}>
                        <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel?'var(--accent)':'#3d5a7a'}`,
                          background:sel?'var(--accent)':'transparent',flexShrink:0,
                          display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {sel&&<span style={{color:'#000',fontSize:11,lineHeight:1,fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:MONO,fontSize:12,color:sel?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#b0d0e8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
                        </div>
                        {rd&&<span style={{fontFamily:MONO,fontSize:9,fontWeight:700,
                          color:rd.rank===1?'#ffd700':rd.rank===2?'#c0c0c0':rd.rank===3?'#cd7f32':rd.rank<=10?'#00d4ff':'#4a7a95',
                          minWidth:22,textAlign:'right',flexShrink:0}}>
                          {rd.rank<=3?['🥇','🥈','🥉'][rd.rank-1]:`#${rd.rank}`}
                        </span>}
                        {w.favorite&&<span style={{color:'#ffd166',fontSize:12}}>★</span>}
                      </div>
                    )
                  })}
                  </div>
                </div>
              </div>
            )}

            {/* ══ PANEL TRADELOG ══ */}
            {sidePanel==='tradelog'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* ── SIDE EDIT PANEL — se muestra al clicar una fila ── */}
                {tlSideEdit&&tlSelected&&(
                  <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden',background:'var(--bg2)'}}>
                    {/* Header con símbolo + botón volver */}
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span onClick={()=>setTlSideEdit(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:16,lineHeight:1,padding:'0 4px'}} title="Volver">←</span>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700}}>{tlSelected.symbol}</span>
                        <span style={{fontFamily:MONO,fontSize:9,padding:'1px 5px',borderRadius:3,
                          background:tlSelected.status==='open'?'rgba(0,229,160,0.1)':'rgba(90,90,90,0.1)',
                          border:tlSelected.status==='open'?'1px solid rgba(0,229,160,0.3)':'1px solid #2a3d52',
                          color:tlSelected.status==='open'?'#00e5a0':'#5a8aaa'}}>
                          {tlSelected.status==='open'?'Abierta':'Cerrada'}
                        </span>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        {tlSelected.status==='open'&&(
                          <button onClick={()=>{setTlSideEdit(false);setTlCloseOpen(true)}}
                            style={{fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                              background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d',fontWeight:700}}>
                            Cerrar op.
                          </button>
                        )}
                        <button onClick={()=>{setTlSideEdit(false);setTlFormOpen(true)}}
                          style={{fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                            background:'rgba(155,114,255,0.1)',border:'1px solid rgba(155,114,255,0.4)',color:'#9b72ff',fontWeight:700}}>
                          Editar
                        </button>
                      </div>
                    </div>
                    {/* Datos del trade */}
                    <div style={{overflowY:'auto',flex:1,padding:'8px 0'}}>
                      {(()=>{
                        const t=tlSelected
                        const isOpen=t.status==='open'
                        const pnl=isOpen?t._pnl_float_eur:t.pnl_eur
                        const pnlPct=isOpen?t._pnl_float_pct:t.pnl_pct
                        const exitPx=isOpen?t._current_price:t.exit_price
                        const dias=t.entry_date&&(isOpen?new Date():new Date(t.exit_date))?
                          Math.round((isOpen?new Date():new Date(t.exit_date))-new Date(t.entry_date))/86400000:null
                        const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):null
                        const capitalEur=fxE&&t.shares&&t.entry_price?(parseFloat(t.shares)*parseFloat(t.entry_price))/fxE:null
                        const comm=(parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0))
                        const pnlC=pnl!=null?pnl:null
                        const colBroker=TL_COLORS[t.broker]||'#7a9bc0'
                        const rows=[
                          {l:'Símbolo',    v:t.symbol,                                        c:'#c8dff5'},
                          {l:'Nombre',     v:t.name||'—',                                     c:'#7a9bc0'},
                          {l:'Broker',     v:TL_LABEL[t.broker]||t.broker?.toUpperCase()||'—',c:colBroker},
                          {l:'Estrategia', v:t.strategy||'—',                                 c:'#7a9bc0'},
                          {l:'Fecha ent.', v:t.entry_date||'—',                               c:'#a8ccdf'},
                          {l:'Fecha sal.', v:isOpen?'(abierta)':t.exit_date||'—',             c:isOpen?'#00e5a0':'#a8ccdf'},
                          {l:'Acciones',   v:t.shares||'—',                                   c:'#c8dff5'},
                          {l:'Px entrada', v:t.entry_price!=null?(t.entry_currency==='EUR'?'€':'$')+parseFloat(t.entry_price).toFixed(2):'—', c:'#c8dff5'},
                          {l:'Px salida',  v:exitPx!=null?(t.entry_currency==='EUR'?'€':'$')+parseFloat(exitPx).toFixed(2):isOpen?'live':'—', c:isOpen?'#00e5a0':'#c8dff5'},
                          {l:'Capital inv.',v:capitalEur!=null?'€'+Math.round(capitalEur).toLocaleString('es-ES'):'—', c:'#9b72ff'},
                          {l:'Divisa',     v:t.entry_currency||'—',                           c:'#7a9bc0'},
                          {l:'FX',         v:fxE?fxE.toFixed(4):'—',                          c:'#7a9bc0'},
                          {l:'Comisión',   v:comm>0?'-€'+comm.toFixed(2):'—',                 c:'#ff4d6d'},
                          {l:'Días',       v:dias!=null?Math.round(dias):'—',                 c:'#00d4ff'},
                          {l:'P&L €',      v:pnlC!=null?((pnlC>=0?'+':'')+('€'+Math.round(Math.abs(pnlC))*(pnlC<0?-1:1))):'—', c:pnlC!=null&&pnlC>=0?'#00e5a0':'#ff4d6d'},
                          {l:'P&L %',      v:pnlPct!=null?((parseFloat(pnlPct)>=0?'+':'')+parseFloat(pnlPct).toFixed(2)+'%'):'—', c:pnlPct!=null&&parseFloat(pnlPct)>=0?'#00e5a0':'#ff4d6d'},
                        ]
                        return(
                          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO}}>
                            <tbody>
                              {rows.map(({l,v,c})=>(
                                <tr key={l} style={{borderBottom:'1px solid rgba(26,45,69,0.5)'}}>
                                  <td style={{padding:'5px 10px',fontSize:9,color:'#4a7a95',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{l}</td>
                                  <td style={{padding:'5px 10px',fontSize:11,fontWeight:600,color:c,textAlign:'right',wordBreak:'break-word'}}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      })()}
                      {/* Notas */}
                      {tlSelected.notes&&(
                        <div style={{margin:'10px 10px 0',padding:'8px',background:'rgba(13,21,32,0.6)',borderRadius:4,border:'1px solid var(--border)'}}>
                          <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Notas</div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{tlSelected.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* ── PANEL NORMAL (subtabs + filtros) — oculto cuando side edit abierto ── */}
                {!tlSideEdit&&(
                <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* Header + badge */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700}}>📒 TradeLog</span>
                  {tlUseLocal()
                    ? <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                        background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',color:'#ffd166'}}>
                        💾 Local
                      </span>
                    : <a href="https://supabase.com/dashboard/project/uqjngxxbdlquiuhywiuc" target="_blank" rel="noreferrer"
                        style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',textDecoration:'none',
                          background:'rgba(0,212,255,0.08)',border:'1px solid rgba(0,212,255,0.2)',color:'#00d4ff'}}>
                        ☁ Supabase ↗
                      </a>
                  }
                </div>

                {/* Filtros */}
                {(()=>{
                  const allYears=[...new Set(tlTrades.map(t=>t.entry_date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a)
                  return(
                    <div style={{overflowY:'auto',flex:1}}>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Estado</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {[['','Todas'],['open','Abiertas'],['closed','Cerradas']].map(([v,l])=>(
                            <button key={v} onClick={()=>setTlFilterStatus(tlFilterStatus===v?'':v)}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterStatus===v?'#9b72ff':'#1a2d45'),
                                background:tlFilterStatus===v?'rgba(155,114,255,0.1)':'transparent',
                                color:tlFilterStatus===v?'#9b72ff':'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Broker</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {[['','Todos'],...TL_BROKERS.map(b=>[b,TL_LABEL[b]])].map(([v,l])=>(
                            <button key={v} onClick={()=>setTlFilterBroker(tlFilterBroker===v?'':v)}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff'):'#1a2d45'),
                                background:tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff')+'18':'transparent',
                                color:tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff'):'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Período</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:tlFilterYear?4:0}}>
                          {[['','Todo'],...allYears.map(y=>[y,y])].map(([v,l])=>(
                            <button key={v} onClick={()=>{const next=tlFilterYear===v?'':v;setTlFilterYear(next);if(!next)setTlFilterMonth('')}}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterYear===v?'#9b72ff':'#1a2d45'),
                                background:tlFilterYear===v?'rgba(155,114,255,0.1)':'transparent',
                                color:tlFilterYear===v?'#9b72ff':'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                        {tlFilterYear&&(()=>{
                          const monthsInYear=[...new Set(tlTrades
                            .filter(t=>{const d=t.exit_date||t.entry_date;return d&&d.startsWith(tlFilterYear)})
                            .map(t=>{const d=t.exit_date||t.entry_date;return d?d.slice(5,7):null}).filter(Boolean)
                          )].sort()
                          if(!monthsInYear.length) return null
                          const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                          return(
                            <div style={{display:'flex',gap:3,flexWrap:'wrap',paddingTop:4,borderTop:'1px solid rgba(155,114,255,0.12)'}}>
                              <button onClick={()=>setTlFilterMonth('')}
                                style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                  border:'1px solid '+(tlFilterMonth===''?'#9b72ff':'#1a2d45'),
                                  background:tlFilterMonth===''?'rgba(155,114,255,0.1)':'transparent',
                                  color:tlFilterMonth===''?'#9b72ff':'#4a7a95'}}>Todos</button>
                              {monthsInYear.map(m=>(
                                <button key={m} onClick={()=>setTlFilterMonth(tlFilterMonth===m?'':m)}
                                  style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                    border:'1px solid '+(tlFilterMonth===m?'#00d4ff':'#1a2d45'),
                                    background:tlFilterMonth===m?'rgba(0,212,255,0.1)':'transparent',
                                    color:tlFilterMonth===m?'#00d4ff':'#4a7a95'}}>
                                  {MESES[parseInt(m)-1]}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      {(()=>{
                        const strats=[...new Set(tlTrades.map(t=>t.strategy||'').filter(Boolean))].sort()
                        if(!strats.length) return null
                        return(
                          <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Estrategia</div>
                            <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                              <button onClick={()=>setTlFilterStrat('')}
                                style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                  border:'1px solid '+(tlFilterStrat===''?'#9b72ff':'#1a2d45'),
                                  background:tlFilterStrat===''?'rgba(155,114,255,0.1)':'transparent',
                                  color:tlFilterStrat===''?'#9b72ff':'#4a7a95'}}>Todas</button>
                              {strats.map(v=>(
                                <button key={v} onClick={()=>setTlFilterStrat(tlFilterStrat===v?'':v)}
                                  style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                    border:'1px solid '+(tlFilterStrat===v?'#00d4ff':'#1a2d45'),
                                    background:tlFilterStrat===v?'rgba(0,212,255,0.1)':'transparent',
                                    color:tlFilterStrat===v?'#00d4ff':'#4a7a95',
                                    maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                                  title={v}>{v}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                    </div>
                  )
                })()}

                {tlError&&<div style={{padding:'4px 8px',fontFamily:MONO,fontSize:10,color:'#ff4d6d'}}>⚠ {tlError}</div>}
              </div>
              )}
            </div>
            )}
          </aside>

          {/* ── CONTENT ── */}
          <div className="content">
            {/* Single-asset view — oculto cuando multicartera activa */}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!result&&!error&&<div className="loading"><div className="spinner"/><div className="loading-text">CARGANDO DATOS...</div></div>}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&error&&<div className="error-msg">⚠ {error}</div>}

            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&result&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
                {/* Columna principal */}
                <div ref={contentRef} style={{flex:1,overflowY:'auto'}}>
                  {/* Gráfico de velas */}
                  <div className="chart-wrap" ref={chartWrapRef} onContextMenu={e=>openCtx(e,'chart')}>
                    <div className="chart-header" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontSize:14}}>
                      {/* Estrella favorito del activo activo */}
                      {(()=>{
                        const wItem=watchlist.find(w=>w.symbol===simbolo)
                        if(!wItem) return null
                        return(
                          <span onClick={async()=>{await upsertWatchlistItem({...wItem,favorite:!wItem.favorite});reloadWatchlist()}}
                            title={wItem.favorite?'Quitar favorito':'Marcar favorito'}
                            style={{cursor:'pointer',fontSize:16,color:wItem.favorite?'#ffd166':'#3d5a7a',flexShrink:0,lineHeight:1}}>
                            {wItem.favorite?'★':'☆'}
                          </span>
                        )
                      })()}
                      <div className="chart-title" style={{cursor:'pointer'}} onClick={()=>setSymSearchOpen(true)} title="Buscar símbolo">{simbolo}</div>
                      {/* Nombre del activo */}
                      <div style={{fontFamily:MONO,fontSize:12,color:'#7a9bc0',fontWeight:400}}>{lookupName(simbolo)}</div>
                      <div className="chart-price">{fmt(result.meta?.ultimoPrecio,2)}</div>
                      <div className="chart-date">{fmtDate(result.meta?.ultimaFecha)}</div>
                      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                        {/* Estrategia activa */}
                        {stratName&&(
                          <div style={{
                            fontFamily:MONO,fontSize:10,color:'#7a9bc0',
                            background:'rgba(13,21,32,0.85)',border:'1px solid #1a2d45',
                            borderRadius:4,padding:'2px 8px',display:'flex',alignItems:'center',gap:5,
                            maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
                          }}>
                            <span style={{
                              width:7,height:7,borderRadius:'50%',flexShrink:0,
                              background:stratColor||'#00d4ff',
                              boxShadow:`0 0 5px ${stratColor||'#00d4ff'}88`
                            }}/>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#a8ccdf'}}>
                              {stratName}
                            </span>
                          </div>
                        )}
                        {rulerOn&&<span style={{fontFamily:MONO,fontSize:10,color:'#ffd166'}}>📏 Regla ON · Ctrl=imán · dbl-clic=borrar</span>}
                        {/* Botón Fit All */}
                        <button onClick={()=>{
                            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
                            if(chartViewFull){
                              // Switch to recent view
                              const months=s?.chart?.recentMonths??3
                              chartApiRef.current?.showRecent(months,0)
                              setChartViewFull(false)
                            } else {
                              // Switch to full view
                              chartApiRef.current?.fitAll()
                              setChartViewFull(true)
                            }
                          }}
                          title={chartViewFull?'Ver últimos 3 meses':'Ver período completo'}
                          style={{background:chartViewFull?'rgba(0,212,255,0.08)':'rgba(0,229,160,0.08)',
                            border:`1px solid ${chartViewFull?'#1e3a52':'#0a5a42'}`,
                            color:chartViewFull?'#00d4ff':'#00e5a0',
                            fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'}}>
                          {chartViewFull?'⊞ Todo':'⊡ Reciente'}
                        </button>
                        {/* Botones scroll ◀ ▶ */}
                        <div style={{display:'flex',gap:2}}>
                          {[['◀',10],['▶',-10]].map(([lbl,bars])=>(
                            <button key={lbl} onClick={()=>chartApiRef.current?.scrollBy(bars)}
                              title={bars>0?'Desplazar izquierda':'Desplazar derecha'}
                              style={{background:'rgba(13,21,32,0.85)',border:'1px solid #1a2d45',color:'#5a8aaa',
                                fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:4,cursor:'pointer',lineHeight:1}}>
                              {lbl}
                            </button>
                          ))}
                        </div>
                        {/* Botón Añadir activo */}
                        <button onClick={newItem}
                          title="Añadir activo a la watchlist"
                          style={{background:'rgba(0,212,255,0.08)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'2px 8px',borderRadius:4,cursor:'pointer',lineHeight:1}}>
                          +
                        </button>
                      </div>
                    </div>
                    <CandleChart
                      data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL}
                      trades={result.trades||[]} maxDD={metrics?.ddSimple||0}
                      labelMode={labelMode} rulerActive={rulerOn}
                      onChartReady={api=>{chartApiRef.current=api}}
                      onPriceAlarm={sidePanel!=='watchlist'?price=>setPriceAlarmDlg({price,symbol:simbolo}):null}
                      savedRangeRef={savedRangeRef}
                      syncRef={chartSyncRef}
                      chartHeight={candleH}
                    />
                    {/* Drag handle — resize candle chart */}
                    <div onMouseDown={e=>{candleResizing.current=true;candleStartY.current=e.clientY;candleStartH.current=candleH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>
                  </div>

                  {/* Métricas en cuadrícula (si layout=grid) */}
                  {metricsLayout==='grid'&&metrics&&(
                    <div style={{border:'1px solid var(--border)',borderRadius:4,margin:'8px 0',overflow:'hidden'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px 0'}}>
                        <button onClick={()=>setMetricsView(v=>v==='multi'?'single':'multi')}
                          style={{marginLeft:'auto',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                            border:'1px solid #2a4060',background:'rgba(0,0,0,0.3)',color:'#7aabc8'}}>
                          {metricsView==='multi'?'⊟ 1col':'⊞ 3col'}
                        </button>
                      </div>
                      <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                      <MetricsWrapper rows={buildUnifiedRows(metrics,result?.maxDDBH||0)} strats={metricsStrats}/>
                    </div>
                  )}

                  {/* Equity con toggles */}
                  <div className="equity-section" onContextMenu={e=>openCtx(e,'equity')}>
                    <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                      <span>Equity</span>
                      {[
                        {key:'st',label:'Simple',color:'#00d4ff',state:showStrategy,set:setShowStrategy},
                        {key:'co',label:'Compuesta',color:'#00e5a0',state:showCompound,set:setShowCompound},
                        {key:'bh',label:'B&H Activo',color:'#ffd166',state:showBH,set:setShowBH},
                        {key:'sp',label:'B&H SP500',color:'#9b72ff',state:showSP500,set:setShowSP500},
                      ].map(({key,label,color,state,set})=>(
                        <button key={key} onClick={()=>set(s=>!s)}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',border:`1px solid ${state?color:'#3d5a7a'}`,background:state?`${color}18`:'transparent',color:state?color:'#3d5a7a'}}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <EquityChart
                      strategyCurve={result.strategyCurve}
                      bhCurve={result.bhCurve}
                      sp500BHCurve={result.sp500BHCurve||[]}
                      compoundCurve={result.compoundCurve||[]}
                      maxDDStrategy={result.maxDDStrategy}
                      maxDDBH={result.maxDDBH}
                      maxDDSP500={result.maxDDSP500||0}
                      maxDDCompound={result.maxDDCompound||0}
                      maxDDStrategyDate={result.maxDDStrategyDate}
                      maxDDBHDate={result.maxDDBHDate}
                      maxDDSP500Date={result.maxDDSP500Date||null}
                      maxDDCompoundDate={result.maxDDCompoundDate||null}
                      capitalIni={Number(capitalIni)}
                      showStrategy={showStrategy} showBH={showBH}
                      showSP500={showSP500} showCompound={showCompound}
                      syncRef={chartSyncRef}
                      chartHeight={equityH}
                    />
                    {/* Drag handle — resize equity chart height */}
                    <div onMouseDown={e=>{equityResizing.current=true;equityStartY.current=e.clientY;equityStartH.current=equityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>
                    {/* Capital invertido — filtro propio independiente */}
                    {result.trades?.length>0&&(
                      <div style={{borderTop:'1px solid var(--border)'}}>
                        <div style={{padding:'3px 12px',display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:11}}>
                          <span style={{color:indivOccMode==='compound'?'#00e5a0':'#00d4ff',fontWeight:600}}>
                            € Capital {indivOccMode==='compound'?'Compuesto':'Simple'} invertido
                          </span>
                          <div style={{display:'flex',gap:3,marginLeft:'auto'}}>
                            {[{id:'compound',label:'Compuesto',c:'#00e5a0'},{id:'simple',label:'Simple',c:'#00d4ff'}].map(m=>(
                              <button key={m.id} onClick={()=>setIndivOccMode(m.id)}
                                style={{fontFamily:MONO,fontSize:10,padding:'1px 6px',borderRadius:3,cursor:'pointer',
                                  border:`1px solid ${indivOccMode===m.id?m.c:'#2a3f55'}`,
                                  background:indivOccMode===m.id?`${m.c}18`:'transparent',
                                  color:indivOccMode===m.id?m.c:'#4a6a88'}}>
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <OccupancyBarChart
                          trades={result.trades}
                          chartData={result.chartData}
                          capitalIni={Number(capitalIni)}
                          syncRef={chartSyncRef}
                          showMode={indivOccMode}
                        />
                      </div>
                    )}
                  </div>

                  {/* Barras de resultados — clic navega al trade */}
                  {result.trades?.length>0&&(
                    <div className="equity-section">
                      <div className="section-title" style={{fontSize:14}}>Resultados por Operación <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic = ir al trade</span></div>
                      <div className="equity-bars">
                        {result.trades.map((t,i)=>{
                          const mx=Math.max(...result.trades.map(x=>Math.abs(x.pnlPct)))
                          return <div key={i} className="equity-bar" onClick={()=>navigateToTrade(t)}
                            style={{height:Math.max(4,Math.abs(t.pnlPct)/mx*56),background:t.pnlPct>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                            onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseOut={e=>e.currentTarget.style.opacity='1'}
                            title={`${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`}/>
                        })}
                      </div>
                    </div>
                  )}

                  {/* Historial — clic fila navega al trade */}
                  {result.trades?.length>0&&(
                    <div className="trades-section" onContextMenu={e=>openCtx(e,'trades')}>
                      <div className="section-title" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:14}}>
                        <span>Historial — {result.trades.length} operaciones <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic fila = ir al trade</span></span>
                        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                          {[{id:'compound',label:'Compuesto'},{id:'simple',label:'Simple'}].map(m=>(
                            <button key={m.id} onClick={()=>setTradeHistMode(m.id)}
                              style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:`1px solid ${tradeHistMode===m.id?'var(--accent)':'#2a3f55'}`,
                                background:tradeHistMode===m.id?'rgba(0,212,255,0.1)':'transparent',
                                color:tradeHistMode===m.id?'var(--accent)':'#4a6a88'}}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                          <thead><tr style={{borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                            {['#','Entrada','Salida','Capital inv.','Capital final','Px Ent.','Px Sal.','P&L %','P&L €','Días','Tipo'].map((h,hi)=>(
                              <th key={h} style={{padding:'4px 8px',textAlign:'left',color:hi===3?'#9b72ff':hi===4?'#00d4ff':'#9acce0',fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {(()=>{
                              const capIni=Number(capitalIni)
                              // Precompute cumulative values (forward order) for peak tracking
                              const fwdSimple=result.trades.map((_,i)=>capIni+result.trades.slice(0,i+1).reduce((s,x)=>s+x.pnlSimple,0))
                              const fwdCompound=result.trades.map(t=>t.capitalTras)
                              let peakS=capIni, peakC=capIni
                              const peaksS=fwdSimple.map(v=>{peakS=Math.max(peakS,v);return peakS})
                              const peaksC=fwdCompound.map(v=>{peakC=Math.max(peakC,v);return peakC})
                              return [...result.trades].reverse().map((t,i)=>{
                                const idx=result.trades.length-1-i  // original index
                                // Capital at entry = prev trade final (or capIni)
                                const capInvS=capIni  // simple always uses fixed slot
                                const capInvC=idx>0?result.trades[idx-1].capitalTras:capIni
                                const capFinalS=fwdSimple[idx], capFinalC=fwdCompound[idx]
                                const isCompound=tradeHistMode==='compound'
                                const capInv=isCompound?capInvC:capInvS
                                const capFinal=isCompound?capFinalC:capFinalS
                                const peak=isCompound?peaksC[idx]:peaksS[idx]
                                const prevPeak=idx>0?(isCompound?peaksC[idx-1]:peaksS[idx-1]):capIni
                                // Capital final: blue=at-peak, orange=in-drawdown
                                const capFinalColor=capFinal>=peak?'#00d4ff':'#ff9a3c'
                                // P&L € in compound mode = actual money earned on compounded capital
                                const pnlEur=isCompound?(capInvC*(t.pnlPct/100)):t.pnlSimple
                                const pnlColor=pnlEur>=0?'var(--green)':'var(--red)'
                                return(
                                  <tr key={i}
                                    style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                                    onClick={()=>navigateToTrade(t)}
                                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                    <td style={{padding:'4px 8px',color:'#7a9bc0',fontSize:11}}>{result.trades.length-i}</td>
                                    <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.entryDate)}</td>
                                    <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.exitDate)}</td>
                                    <td style={{padding:'4px 8px',color:'#e8f4ff',fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capInv,0)}</td>
                                    <td style={{padding:'4px 8px',color:capFinalColor,fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capFinal,0)}</td>
                                    <td style={{padding:'4px 8px'}}>{fmt(t.entryPx,2)}</td>
                                    <td style={{padding:'4px 8px'}}>{fmt(t.exitPx,2)}</td>
                                    <td style={{padding:'4px 8px',color:pnlColor,fontWeight:600}}>{t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%</td>
                                    <td style={{padding:'4px 8px',color:pnlColor}}>{pnlEur>=0?'+':''}{fmt(pnlEur,2)}€</td>
                                    <td style={{padding:'4px 8px',color:'#a8c4dc'}}>{t.dias}</td>
                                    <td style={{padding:'4px 8px'}}>
                                      <span style={{fontSize:9,padding:'1px 5px',borderRadius:2,
                                        background:t.pnlPct>=0?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                                        color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',
                                        border:`1px solid ${t.pnlPct>=0?'rgba(0,229,160,0.3)':'rgba(255,77,109,0.3)'}`}}>
                                        {t.tipo}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel derecho de métricas */}
                {sidePanel!=='multi'&&(metricsLayout==='panel'||metricsLayout==='multi')&&metrics&&(
                  <div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}} onContextMenu={e=>openCtx(e,'metrics')}>
                    {/* Resize handle — left edge */}
                    <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                      style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                        background:'transparent',transition:'background 0.15s'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                    <div style={{padding:'6px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#b8d8f0',letterSpacing:'0.08em',fontWeight:600,flex:1}}>RESUMEN · {simbolo}</span>
                      {metricsLayout==='multi'
                        ? <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',padding:'2px 7px'}}>multi-col</span>
                        : <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',padding:'2px 7px'}}>1 col</span>}
                    </div>
                    <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                    {(()=>{
                      const rows = buildUnifiedRows(metrics, result?.maxDDBH||0)
                      // 'panel' → tabla horizontal (estrategias como columnas)
                      // 'multi' → bloques apilados verticalmente (una estrategia encima de otra)
                      return metricsLayout==='multi'
                        ? <SingleColumnTable rows={rows} strats={metricsStrats}/>
                        : <UnifiedMetricsTable rows={rows} strats={metricsStrats}/>
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ══ MULTICARTERA — loading / empty state ══ */}
            {sidePanel==='multi'&&mcLoading&&(
              <div className="loading"><div className="spinner"/><div className="loading-text">CALCULANDO MULTICARTERA...</div></div>
            )}
            {sidePanel==='multi'&&!mcLoading&&!mcResult&&(
              <div style={{display:'flex',flex:1,alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'var(--text3)',fontFamily:MONO,fontSize:12}}>
                <span style={{fontSize:32}}>📊</span>
                <span>Selecciona activos y ejecuta la multicartera</span>
              </div>
            )}

            {/* ══ MULTICARTERA RESULTS ══ */}
            {mcResult&&sidePanel==='multi'&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
              {/* Left: scrollable content */}
              <div style={{flex:1,overflowY:'auto',padding:'0 0 20px 0'}}>
                {/* Header resumen */}
                <div style={{padding:'7px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontFamily:MONO,fontSize:13,color:'var(--accent)',fontWeight:700}}>📊 Multicartera</span>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>{mcResult.n} activos · <span style={{color:mcResult.modoAsig==='rotativo'?'#ffd166':mcResult.modoAsig==='custom'?'#9b72ff':'#00d4ff'}}>{mcResult.modoAsig==='rotativo'?'Capital rotativo':mcResult.modoAsig==='custom'?'Pesos personalizados':'Slots iguales'}</span></span>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>Desde {fmtDate(mcResult.startDate)}</span>
                  <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                    <button onClick={()=>mcChartApiRef.current?.fitAll()}
                      style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(0,212,255,0.07)',color:'#7a9bc0'}}
                      title="Ver periodo completo">⊠ Periodo completo</button>
                    <button onClick={()=>setMcLayout(l=>l==='grid'?'panel':'grid')}
                      style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(13,21,32,0.9)',color:'#7a9bc0'}}>
                      {mcLayout==='grid'?'⊞ Panel':'⊟ Grid'}
                    </button>
                  </div>
                </div>

                {/* ── Equity — misma estructura que activos individuales ── */}
                <div className="equity-section">
                  <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                    <span>Equity</span>
                    {[
                      {key:'simple',  label:'Simple',           color:'#00d4ff',state:mcShowSimple,  set:setMcShowSimple},
                      {key:'compound',label:'Compuesto',        color:'#00e5a0',state:mcShowCompound,set:setMcShowCompound},
                      {key:'bh',      label:'B&H Diversificado',color:'#ffd166',state:mcShowBH,      set:setMcShowBH},
                      {key:'sp500',   label:'B&H SP500',        color:'#9b72ff',state:mcShowSP500,   set:setMcShowSP500},
                    ].map(({key,label,color,state,set})=>(
                      <button key={key} onClick={()=>set(s=>!s)}
                        style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                          border:`1px solid ${state?color:'#3d5a7a'}`,background:state?`${color}18`:'transparent',color:state?color:'#3d5a7a'}}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <MultiCartChart
                    simpleCurve={mcResult.simpleCurve}
                    compoundCurve={mcResult.compoundCurve}
                    bhCurve={mcResult.bhCurve}
                    sp500BHCurve={mcResult.sp500BHCurve||[]}
                    capitalIni={Number(capitalIni)}
                    maxDDSimple={mcResult.maxDDSimple}   maxDDSimpleDate={mcResult.maxDDSimpleDate}
                    maxDDCompound={mcResult.maxDDCompound} maxDDCompoundDate={mcResult.maxDDCompoundDate}
                    maxDDBH={mcResult.maxDDBH}           maxDDBHDate={mcResult.maxDDBHDate}
                    maxDDSP500={mcResult.maxDDSP500||0}  maxDDSP500Date={mcResult.maxDDSP500Date||null}
                    showSimple={mcShowSimple} showCompound={mcShowCompound}
                    showBH={mcShowBH} showSP500={mcShowSP500}
                    onReady={api=>{mcChartApiRef.current=api}}
                    syncRef={chartSyncRef}
                    chartHeight={mcEquityH}
                  />
                  <div onMouseDown={e=>{mcEquityResizing.current=true;mcEquityStartY.current=e.clientY;mcEquityStartH.current=mcEquityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                    style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                      borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                  </div>
                </div>

                {/* ── € Capital invertido MC — mismo estilo que activos individuales ── */}
                {mcResult.occupancyCurve?.length>0&&(
                  <div style={{borderTop:'1px solid var(--border)'}}>
                    <div style={{padding:'3px 12px 2px',display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:11}}>
                      <span style={{color:mcOccMode==='compound'?'#00e5a0':'#00d4ff',fontWeight:600}}>
                        € Capital {mcOccMode==='compound'?'Compuesto':'Simple'} invertido
                      </span>
                      <div style={{display:'flex',gap:3,marginLeft:'auto'}}>
                        {[{id:'compound',label:'Compuesto',c:'#00e5a0'},{id:'simple',label:'Simple',c:'#00d4ff'}].map(m=>(
                          <button key={m.id} onClick={()=>setMcOccMode(m.id)}
                            style={{fontFamily:MONO,fontSize:10,padding:'1px 6px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcOccMode===m.id?m.c:'#2a3f55'}`,
                              background:mcOccMode===m.id?`${m.c}18`:'transparent',
                              color:mcOccMode===m.id?m.c:'#4a6a88'}}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <McOccupancyChart
                      occupancyCurve={mcResult.occupancyCurve}
                      compoundCurve={mcResult.compoundCurve}
                      capitalIni={Number(capitalIni)}
                      occMode={mcOccMode}
                      syncRef={chartSyncRef}
                    />
                  </div>
                )}
                {/* Métricas en grid cuando mcLayout==='grid' */}
                {mcLayout==='grid'&&(()=>{
                  const lastS=mcResult.simpleCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastC=mcResult.compoundCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastBH=mcResult.bhCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const capIni=Number(capitalIni)
                  const totalDiasNat=mcResult.startDate?(new Date(mcResult.simpleCurve.slice(-1)[0]?.date)-new Date(mcResult.startDate))/86400000:365
                  const anios=Math.max(totalDiasNat/365.25,0.01)
                  const cagrS=(Math.pow(Math.max(lastS,0.01)/capIni,1/anios)-1)*100
                  const cagrC=(Math.pow(Math.max(lastC,0.01)/capIni,1/anios)-1)*100
                  const cagrBH=(Math.pow(Math.max(lastBH,0.01)/capIni,1/anios)-1)*100
                  const allT=mcResult.allTrades||[]
                  const wins=allT.filter(t=>t.pnlPct>=0),losses=allT.filter(t=>t.pnlPct<0)
                  const winRate=allT.length?wins.length/allT.length*100:0
                  const cols=[
                    {label:'Total Operaciones',val:allT.length,color:'#ffd166'},
                    {label:'Ganadoras / Perdedoras',val:`${wins.length} / ${losses.length}`,color:'#00e5a0'},
                    {label:'Win Rate',val:fmt(winRate,1,'%'),color:winRate>=50?'#00e5a0':'#ff4d6d'},
                    {label:'Capital inv. medio',val:fmt(mcResult.avgOccupancy,1,'%'),color:'#9b72ff'},
                    {label:'Ganancia Simple',val:fmt(lastS-capIni,0,'€'),color:lastS>=capIni?'#00e5a0':'#ff4d6d'},
                    {label:'Ganancia Compuesta',val:fmt(lastC-capIni,0,'€'),color:lastC>=capIni?'#00e5a0':'#ff4d6d'},
                    {label:`CAGR Simple (${fmt(anios,2)}a)`,val:fmt(cagrS,2,'%'),color:cagrS>=0?'#00e5a0':'#ff4d6d'},
                    {label:`CAGR Compuesto (${fmt(anios,2)}a)`,val:fmt(cagrC,2,'%'),color:cagrC>=0?'#00e5a0':'#ff4d6d'},
                    {label:'Max DD Simple',val:fmt(mcResult.maxDDSimple,2,'%'),color:'#ff4d6d'},
                    {label:'Max DD Compuesto',val:fmt(mcResult.maxDDCompound,2,'%'),color:'#ff4d6d'},
                  ]
                  return(
                    <div className="metrics-section" style={{borderBottom:'1px solid var(--border)'}}>
                      {cols.map(c=>(
                        <div key={c.label} className="metric-card">
                          <span className="metric-label">{c.label}</span>
                          <span className="metric-val" style={{color:c.color}}>{c.val}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Tabla por activo */}
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',marginBottom:8,letterSpacing:'0.05em'}}>RESUMEN POR ACTIVO</div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          {['Activo','Trades','Win%','G.Simple','G.Comp','Días inv.'].map(h=>(
                            <th key={h} style={{padding:'4px 10px',textAlign:'left',color:'var(--text3)',fontWeight:400,fontSize:9}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mcResult.assetStats.map(a=>(
                          <tr key={a.symbol} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                            onClick={()=>{setSimbolo(a.symbol);setSidePanel('watchlist')}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{padding:'5px 10px',color:'var(--accent)',fontWeight:700}}>{a.symbol}</td>
                            <td style={{padding:'5px 10px',color:'var(--text)'}}>{a.trades}</td>
                            <td style={{padding:'5px 10px',color:a.winRate>=50?'#00e5a0':'#ff4d6d'}}>{fmt(a.winRate,1,'%')}</td>
                            <td style={{padding:'5px 10px',color:a.ganSimple>=0?'#00e5a0':'#ff4d6d'}}>{a.ganSimple>=0?'+':''}{fmt(a.ganSimple,0,'€')}</td>
                            <td style={{padding:'5px 10px',color:a.ganComp>=0?'#00e5a0':'#ff4d6d'}}>{a.ganComp>=0?'+':''}{fmt(a.ganComp,0,'€')}</td>
                            <td style={{padding:'5px 10px',color:'#00d4ff'}}>{a.totalDias}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Barras de resultados multicartera — same style as individual */}
                {mcResult.allTrades?.length>0&&(
                  <div className="equity-section">
                    <div className="section-title" style={{fontSize:14}}>
                      Resultados por Operación <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic = ir al trade</span>
                    </div>
                    <div className="equity-bars">
                      {(()=>{
                        const allT=mcResult.allTrades||[]
                        const mx=Math.max(...allT.map(x=>Math.abs(x.pnlPct)),1)
                        return allT.map((t,i)=>(
                          <div key={i} className="equity-bar"
                            style={{height:Math.max(4,Math.abs(t.pnlPct)/mx*56),background:t.pnlPct>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                            onClick={()=>{
                              const mcDivRef=document.querySelector('.mc-scroll')
                              if(mcDivRef)mcDivRef.scrollTo({top:0,behavior:'smooth'})
                            }}
                            onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseOut={e=>e.currentTarget.style.opacity='1'}
                            title={`${t.symbol||''} · ${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`}/>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {/* Historial combinado — same style as individual */}
                {mcResult.allTrades?.length>0&&(
                  <div className="trades-section">
                    <div className="section-title" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:14}}>
                      <span>Historial Multicartera — {mcResult.allTrades.length} operaciones
                        <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}> · clic activo → ver gráfico</span>
                      </span>
                      <div style={{display:'flex',gap:4,marginLeft:'auto',alignItems:'center'}}>
                        <input value={mcTradeFilter} onChange={e=>setMcTradeFilter(e.target.value)}
                          placeholder="Filtrar activo…"
                          style={{fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:3,
                            background:'#0d1828',border:'1px solid #274462',color:'#e8f4ff',width:110}}/>
                        {[{id:'compound',label:'Compuesto'},{id:'simple',label:'Simple'}].map(m=>(
                          <button key={m.id} onClick={()=>setMcTradeHistMode(m.id)}
                            style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcTradeHistMode===m.id?'var(--accent)':'#2a3f55'}`,
                              background:mcTradeHistMode===m.id?'rgba(0,212,255,0.1)':'transparent',
                              color:mcTradeHistMode===m.id?'var(--accent)':'#4a6a88'}}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                          {['#','Activo','Entrada','Salida','Capital inv.','Capital final','P&L %','P&L €','Días','Tipo'].map((h,hi)=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'left',
                              color:hi===4?'#9b72ff':hi===5?'#00d4ff':'#9acce0',
                              fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {(()=>{
                            const capIni2=Number(capitalIni)
                            const allT2=(mcTradeFilter
                              ?mcResult.allTrades.filter(t=>(t.symbol||'').toUpperCase().includes(mcTradeFilter.toUpperCase()))
                              :mcResult.allTrades)
                            const fwdS=mcResult.allTrades.map((_,i)=>capIni2+mcResult.allTrades.slice(0,i+1).reduce((s,x)=>s+x.pnlSimple,0))
                            const fwdC=mcResult.allTrades.map(t=>t.capitalTras)
                            let pkS=capIni2,pkC=capIni2
                            const peaksS2=fwdS.map(v=>{pkS=Math.max(pkS,v);return pkS})
                            const peaksC2=fwdC.map(v=>{pkC=Math.max(pkC,v);return pkC})
                            return [...allT2].reverse().map((t,i)=>{
                              const origIdx=mcResult.allTrades.indexOf(t)
                              const isC=mcTradeHistMode==='compound'
                              const capInv=isC?(origIdx>0?mcResult.allTrades[origIdx-1].capitalTras:capIni2):capIni2
                              const capFinalS=fwdS[origIdx],capFinalC=fwdC[origIdx]
                              const capFinal=isC?capFinalC:capFinalS
                              const peak=isC?peaksC2[origIdx]:peaksS2[origIdx]
                              const capFinalColor=capFinal>=peak?'#00d4ff':'#ff9a3c'
                              const pnlEur=isC?(capInv*(t.pnlPct/100)):t.pnlSimple
                              const pnlColor=pnlEur>=0?'var(--green)':'var(--red)'
                              return(
                                <tr key={i}
                                  style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                                  onClick={()=>{setSimbolo(t.symbol);setSidePanel('watchlist')}}
                                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                  <td style={{padding:'4px 8px',color:'#7a9bc0',fontSize:11}}>{allT2.length-i}</td>
                                  <td style={{padding:'4px 8px',color:'var(--accent)',fontWeight:700}}>{t.symbol}</td>
                                  <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.entryDate)}</td>
                                  <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.exitDate)}</td>
                                  <td style={{padding:'4px 8px',color:'#e8f4ff',fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capInv,0)}</td>
                                  <td style={{padding:'4px 8px',color:capFinalColor,fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capFinal,0)}</td>
                                  <td style={{padding:'4px 8px',color:pnlColor,fontWeight:600}}>{t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%</td>
                                  <td style={{padding:'4px 8px',color:pnlColor}}>{pnlEur>=0?'+':''}{fmt(pnlEur,2)}€</td>
                                  <td style={{padding:'4px 8px',color:'#a8c4dc'}}>{t.dias}</td>
                                  <td style={{padding:'4px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:2,
                                      background:t.pnlPct>=0?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                                      color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',
                                      border:`1px solid ${t.pnlPct>=0?'rgba(0,229,160,0.3)':'rgba(255,77,109,0.3)'}`}}>
                                      {t.tipo}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              {/* Right: metrics summary panel — hidden when mcLayout==='grid' */}
              {mcLayout==='panel'&&<div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}}>
                {/* Resize handle */}
                <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                  style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,background:'transparent'}}
                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                <div style={{padding:'7px 12px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:10,color:'#8ab8d4',letterSpacing:'0.1em',fontWeight:600}}>RESUMEN MULTICARTERA</div>
                {(()=>{
                  const lastS=mcResult.simpleCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastC=mcResult.compoundCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastBH=mcResult.bhCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const capIni=Number(capitalIni)
                  const totalDiasNat=mcResult.startDate?(new Date(mcResult.simpleCurve.slice(-1)[0]?.date)-new Date(mcResult.startDate))/86400000:365
                  const anios=Math.max(totalDiasNat/365.25,0.01)
                  const cagrS=(Math.pow(Math.max(lastS,0.01)/capIni,1/anios)-1)*100
                  const cagrC=(Math.pow(Math.max(lastC,0.01)/capIni,1/anios)-1)*100
                  const cagrBH=(Math.pow(Math.max(lastBH,0.01)/capIni,1/anios)-1)*100
                  const allT=mcResult.allTrades||[]
                  const wins=allT.filter(t=>t.pnlPct>=0), losses=allT.filter(t=>t.pnlPct<0)
                  const winRate=allT.length?wins.length/allT.length*100:0
                  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0
                  const avgLoss=losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length:0
                  const totalDias=allT.reduce((s,t)=>s+t.dias,0)
                  const tiempoInvPct=totalDiasNat>0?(totalDias/totalDiasNat)*100:0
                  const aniosInv=totalDias/365.25
                  const gBrute=wins.reduce((s,t)=>s+t.pnlSimple,0)
                  const lBrute=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
                  const factorBen=lBrute>0?gBrute/lBrute:999
                  const diasProm=allT.length?totalDias/allT.length:0
                  const v2=(val,color)=>({val,color})
                  const wr2=winRate>=50?'#00e5a0':'#ff4d6d'
                  const fb2=factorBen>=1?'#00e5a0':'#ff4d6d'
                  const cS2=lastS>=capIni?'#00e5a0':'#ff4d6d'
                  const cC2=lastC>=capIni?'#00e5a0':'#ff4d6d'
                  const cBH2=lastBH>=capIni?'#00e5a0':'#ff4d6d'
                  const mcRows=[
                    {label:'Total Operaciones',     compound:v2(allT.length,'#ffd166'),  bh:null, simple:v2(allT.length,'#ffd166')},
                    {label:'Total Días Invertido',  compound:v2(totalDias,'#00d4ff'),    bh:null, simple:v2(totalDias,'#00d4ff')},
                    {label:'Días Promedio',         compound:v2(fmt(diasProm,1,' días'),'#00d4ff'), bh:null, simple:v2(fmt(diasProm,1,' días'),'#00d4ff')},
                    {label:`Tiempo Invertido (${fmt(aniosInv,2)}a)`, compound:v2(fmt(tiempoInvPct,0,'%'),'#ffd166'), bh:null, simple:v2(fmt(tiempoInvPct,0,'%'),'#ffd166')},
                    {label:'Capital inv. medio',    compound:v2(fmt(mcResult.avgOccupancy,1,'%'),'#9b72ff'), bh:null, simple:v2(fmt(mcResult.avgOccupancy,1,'%'),'#9b72ff')},
                    {label:'Ganadoras',             compound:v2(wins.length,'#00e5a0'), bh:null, simple:v2(wins.length,'#00e5a0')},
                    {label:'Perdedoras',            compound:v2(losses.length,'#ff4d6d'), bh:null, simple:v2(losses.length,'#ff4d6d')},
                    {label:'Win Rate',              compound:v2(fmt(winRate,1,'%'),wr2), bh:null, simple:v2(fmt(winRate,1,'%'),wr2)},
                    {label:'Factor de Beneficio',   compound:v2(fmt(factorBen,2),fb2), bh:null, simple:v2(fmt(factorBen,2),fb2)},
                    {label:'Ganancia Media (%)',    compound:v2(fmt(avgWin,2,'%'),'#00e5a0'), bh:null, simple:v2(fmt(avgWin,2,'%'),'#00e5a0')},
                    {label:'Pérdida Media (%)',     compound:v2(fmt(avgLoss,2,'%'),'#ff4d6d'), bh:null, simple:v2(fmt(avgLoss,2,'%'),'#ff4d6d')},
                    {label:'Ganancia (€)',          compound:v2(fmt(lastC-capIni,2,'€'),cC2), bh:v2(fmt(lastBH-capIni,2,'€'),cBH2), simple:v2(fmt(lastS-capIni,2,'€'),cS2)},
                    {label:'Ganancia (%)',          compound:v2(fmt((lastC-capIni)/capIni*100,2,'%'),cC2), bh:v2(fmt((lastBH-capIni)/capIni*100,2,'%'),cBH2), simple:v2(fmt((lastS-capIni)/capIni*100,2,'%'),cS2)},
                    {label:`CAGR (${fmt(anios,2)}a)`, compound:v2(fmt(cagrC,2,'%'),cagrC>=0?'#00e5a0':'#ff4d6d'), bh:v2(fmt(cagrBH,2,'%'),cagrBH>=0?'#00e5a0':'#ff4d6d'), simple:v2(fmt(cagrS,2,'%'),cagrS>=0?'#00e5a0':'#ff4d6d')},
                    {label:'Max Drawdown (%)',      compound:v2(fmt(mcResult.maxDDCompound,2,'%'),'#ff4d6d'), bh:v2(fmt(mcResult.maxDDBH,2,'%'),'#ff4d6d'), simple:v2(fmt(mcResult.maxDDSimple,2,'%'),'#ff4d6d')},
                  ]
                  return(
                    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                      <div style={{display:'flex',alignItems:'center',padding:'4px 12px',borderBottom:'1px solid var(--border)'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#9acce0',flex:1}}>MULTICARTERA</span>
                        <button onClick={()=>setMetricsView(v=>v==='multi'?'single':'multi')}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                            border:'1px solid #2a4060',background:'rgba(0,0,0,0.3)',color:'#7aabc8'}}>
                          {metricsView==='multi'?'⊟ 1col':'⊞ 3col'}
                        </button>
                      </div>
                      <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                      <div style={{overflowY:'auto',flex:1}}>
                        <MetricsWrapper rows={mcRows} strats={metricsStrats}/>
                      </div>
                    </div>
                  )
                })()}
              </div>}
              </div>
            )}

            {/* ══ TRADELOG MAIN PANEL ══ */}
            {sidePanel==='tradelog'&&(
              <div className="tl-content" style={{display:'flex',flex:1,height:'100%',overflow:'hidden',background:'var(--bg)',fontSize:13}} onContextMenu={e=>openCtx(e,'tradelog')}>

                {/* COLUMNA CENTRAL — siempre visible con tab bar fija arriba */}
                <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
                  {/* ── Modo indicator bar ── */}
                  {tlUseLocal()&&(
                    <div style={{padding:'3px 10px',background:'rgba(255,209,102,0.04)',borderBottom:'1px solid rgba(255,209,102,0.1)',
                      fontFamily:MONO,fontSize:9,color:'#7a6a30',display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                      💾 <span style={{color:'#ffd166',opacity:0.7}}>Modo local</span>
                      <span style={{opacity:0.5}}>— Configura Supabase en Settings → Integraciones</span>
                    </div>
                  )}
                  {/* ── TABS siempre visibles + búsqueda/nueva op ── */}
                  <div style={{display:'flex',borderBottom:'2px solid var(--border)',flexShrink:0,alignItems:'stretch',background:'#0a0f1a'}}>
                    {/* Search — izquierda, antes de los tabs */}
                    <div style={{display:'flex',gap:4,alignItems:'center',padding:'4px 8px',borderRight:'1px solid var(--border)',flexShrink:0}}>
                      <input ref={tlSearchRef} type="text" placeholder="🔍 símbolo" value={tlSearch} onChange={e=>setTlSearch(e.target.value)}
                        style={{width:110,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 7px',borderRadius:4}}/>
                      {tlSearch&&(
                        <button onClick={()=>{setTlSearch('');setTimeout(()=>tlSearchRef.current?.focus(),0)}} title="Limpiar filtro"
                          style={{background:'transparent',border:'none',color:'#ff4d6d',cursor:'pointer',
                            fontSize:12,padding:'0 3px',lineHeight:1,flexShrink:0}}
                          onMouseOver={e=>e.currentTarget.style.color='#ff8080'}
                          onMouseOut={e=>e.currentTarget.style.color='#ff4d6d'}>✕</button>
                      )}
                      <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',flexShrink:0}}>
                        {tlFiltered.length}
                      </span>
                      {tlLoading&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',flexShrink:0}}>⟳</span>}
                    </div>
                    {[{id:'ops',label:'Ops'},{id:'import',label:'📥 Import'},{id:'export',label:'📤 Export'},{id:'dashboard',label:'📊 Dashboard'}].map(t=>(
                      <button key={t.id} onClick={()=>setTlTab(t.id)}
                        style={{padding:'9px 16px',fontFamily:MONO,fontSize:11,cursor:'pointer',
                          background:tlTab===t.id?'rgba(155,114,255,0.12)':'transparent',
                          border:'none',
                          borderBottom:tlTab===t.id?'2px solid #9b72ff':'2px solid transparent',
                          marginBottom:'-2px',
                          color:tlTab===t.id?'#d0aaff':'#4a7a95',letterSpacing:'0.04em',fontWeight:tlTab===t.id?700:400,
                          whiteSpace:'nowrap',flexShrink:0}}>
                        {t.label}
                      </button>
                    ))}
                    <div style={{flex:1}}/>
                    <div style={{display:'flex',gap:6,alignItems:'center',padding:'5px 10px'}}>
                      {tlMultiMode?(
                        <>
                          <span style={{fontFamily:MONO,fontSize:10,color:'#ffd166',flexShrink:0}}>
                            {tlMultiSel.size} seleccionadas
                          </span>
                          <button onClick={()=>tlDeleteMulti(tlMultiSel)}
                            disabled={tlMultiSel.size===0}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 12px',borderRadius:4,cursor:'pointer',
                              background:tlMultiSel.size>0?'rgba(255,77,109,0.2)':'rgba(60,30,30,0.3)',
                              border:'1px solid '+(tlMultiSel.size>0?'#ff4d6d':'#3a1a1a'),
                              color:tlMultiSel.size>0?'#ff4d6d':'#5a2a2a',fontWeight:700,whiteSpace:'nowrap'}}>
                            🗑 Eliminar
                          </button>
                          <button onClick={()=>{setTlMultiMode(false);setTlMultiSel(new Set())}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 10px',borderRadius:4,cursor:'pointer',
                              background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0',whiteSpace:'nowrap'}}>
                            Cancelar
                          </button>
                        </>
                      ):(
                        <>
                          <button onClick={()=>setTlMultiMode(true)}
                            title="Selección múltiple para borrar"
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                              background:'transparent',border:'1px solid #2a3040',color:'#4a6a80',whiteSpace:'nowrap'}}>
                            🗑
                          </button>
                          <button onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.entry_currency&&_df.entry_currency!=='EUR')tlFetchFx(_df.entry_currency,_df.entry_date)}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 12px',borderRadius:4,cursor:'pointer',
                              background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700,whiteSpace:'nowrap'}}>
                            + Nueva op.
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* ── Contenido por tab ── */}
                  {(tlTab==='ops'||tlTab==='open')&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

                    {/* Tabla */}
                    <div style={{flex:1,overflowY:'auto'}}>
                      <table className="tl-ops-table" onContextMenu={e=>{e.stopPropagation();openCtx(e,'tl_table')}} style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                        <thead>
                          <tr style={{background:'var(--bg2)',position:'sticky',top:0,zIndex:5}}>
                            {tlMultiMode&&(
                              <th style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',width:32}}>
                                <input type="checkbox"
                                  style={{cursor:'pointer',accentColor:'#ff4d6d'}}
                                  checked={tlFiltered.length>0&&tlFiltered.every(t=>tlMultiSel.has(t.id))}
                                  onChange={e=>{
                                    const visible=tlFiltered
                                    if(e.target.checked) setTlMultiSel(new Set(visible.map(t=>t.id)))
                                    else setTlMultiSel(new Set())
                                  }}
                                  title="Seleccionar todas"
                                />
                              </th>
                            )}
                            {['#','Símbolo','Estrategia','Broker','Entrada','Salida','Acciones','Px entrada','Capital inv.','Px salida/actual','Divisa','FX','Comisión','P&L €','P&L %','Días','Estado'].map(h=>(
                              <th key={h} style={{padding:'6px 8px',textAlign:'left',fontFamily:MONO,fontSize:9,color:'#3d5a7a',
                                letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(()=>{
                            // ── Build group-aware display list ──
                            // Group rows by group_id; ungrouped rows render normally
                            const groupMap = {}
                            tlFiltered.forEach(t=>{
                              if(t.group_id){
                                if(!groupMap[t.group_id]) groupMap[t.group_id]=[]
                                groupMap[t.group_id].push(t)
                              }
                            })
                            // Build ordered display items: {type:'row'|'group', ...}
                            const seen = new Set()
                            const items = []
                            tlFiltered.forEach((t,i)=>{
                              if(!t.group_id){
                                items.push({type:'row', t, i})
                              } else if(!seen.has(t.group_id)){
                                seen.add(t.group_id)
                                const members = groupMap[t.group_id]
                                items.push({type:'group', group_id:t.group_id, members, i})
                              }
                            })
                            // ── Row renderer (shared by single rows and sub-rows) ──
                            const renderRow = (t, i, arr, opts={})=>{
                              const {isSub=false, isLast=false} = opts
                              const isOpen=t.status==='open'
                              const pnl=isOpen?t._pnl_float_eur:t.pnl_eur
                              const pnlPct=isOpen?t._pnl_float_pct:t.pnl_pct
                              const exitPx=isOpen?t._current_price:t.exit_price
                              const dias=t.entry_date&&(isOpen?t._current_date:t.exit_date)?
                                Math.round((new Date(isOpen?t._current_date||new Date():t.exit_date)-new Date(t.entry_date))/86400000):null
                              const col=TL_COLORS[t.broker]||'#7a9bc0'
                              const isSel=tlSelected?.id===t.id
                              const isMultiChecked = tlMultiSel.has(t.id)
                              const baseBg = isSub
                                ? (isMultiChecked?'rgba(255,77,109,0.07)':isSel?'rgba(155,114,255,0.08)':'rgba(0,212,255,0.03)')
                                : (isMultiChecked?'rgba(255,77,109,0.07)':isSel?'rgba(155,114,255,0.06)':isOpen?'rgba(0,229,160,0.02)':'transparent')
                              return(
                              <tr key={t.id} onClick={()=>{
                                if(tlMultiMode){
                                  setTlMultiSel(prev=>{const n=new Set(prev);n.has(t.id)?n.delete(t.id):n.add(t.id);return n})
                                  return
                                }
                                setTlSelected(t)
                                if(t.has_fills)loadFills(t.id);else setTlFills([])
                                const df=tlDefaultForm()
                                setTlForm({...df,
                                  id:t.id,symbol:t.symbol||'',name:t.name||'',
                                  asset_type:t.asset_type||'stock',broker:t.broker||df.broker,
                                  entry_date:toDisplayDate(t.entry_date)||'',
                                  entry_price:t.entry_price||'',shares:t.shares||'',
                                  entry_currency:t.entry_currency||'USD',
                                  commission_buy:t.commission_buy||0,
                                  fx_entry:t.fx_entry?String(t.fx_entry):'',
                                  fx_entry_manual:!!t.fx_entry,
                                  notes:t.notes||'',strategy:t.strategy||df.strategy,
                                  import_source:t.import_source||'manual'
                                })
                                if(t.status==='open'){
                                  setTlCloseForm({exit_date:todayDisplay(),exit_price:'',exit_currency:t.entry_currency||'USD',commission_sell:0,fx_exit:'',fx_exit_manual:false})
                                }
                                setTlFillsList([]);setTlExitFillsList([]);setTlFormOpen(true)
                              }}
                                style={{borderBottom:'1px solid var(--border)',cursor:'pointer',
                                  background:baseBg,
                                  borderLeft: isSub?'2px solid rgba(0,212,255,0.2)':'none'}}
                                onMouseOver={e=>e.currentTarget.style.background=isMultiChecked?'rgba(255,77,109,0.12)':isSub?'rgba(0,212,255,0.06)':'rgba(255,255,255,0.03)'}
                                onMouseOut={e=>e.currentTarget.style.background=baseBg}>
                                {tlMultiMode&&(
                                  <td style={{padding:'6px 8px'}} onClick={e=>e.stopPropagation()}>
                                    <input type="checkbox" checked={isMultiChecked}
                                      style={{cursor:'pointer',accentColor:'#ff4d6d'}}
                                      onChange={()=>setTlMultiSel(prev=>{const n=new Set(prev);n.has(t.id)?n.delete(t.id):n.add(t.id);return n})}/>
                                  </td>
                                )}
                                <td style={{padding:'6px 8px',color:'#3d5a7a',fontSize:10}}>
                                  {isSub?<span style={{marginLeft:8,color:'#2a4060'}}>↳</span>:i+1}
                                </td>
                                <td style={{padding:'6px 4px 6px 8px',maxWidth:120}} onClick={e=>e.stopPropagation()}>
                                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                                    <span
                                      onClick={e=>{e.stopPropagation();window.open('https://www.tradingview.com/chart/?symbol='+tvSym(t.symbol),'_blank')}}
                                      title={'Abrir '+t.symbol+' en TradingView'}
                                      style={{fontWeight:700,color:isOpen?'#9b72ff':'#00d4ff',cursor:'pointer',
                                        textDecoration:'underline',textDecorationColor:'rgba(0,212,255,0.3)',
                                        textUnderlineOffset:2}}>
                                      {t.symbol}
                                    </span>
                                    {t.has_fills&&<span style={{fontSize:8,color:'#5a8aaa',flexShrink:0}}>fills</span>}
                                    {(()=>{
                                      const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
                                      const tlCondIds=sett?.tradelog?.condDotIds
                                      const allLibConds=lsGetConds()
                                      const visConds=Array.isArray(tlCondIds)&&tlCondIds.length>0?allLibConds.filter(c=>tlCondIds.includes(c.id)):[]
                                      if(!visConds.length) return null
                                      const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                                      const blinkN=sett?.alarmas?.blinkCandles??3
                                      return visConds.map((c,ci)=>{
                                        const st=alarmStatus[t.symbol]?.[c.id]
                                        const active=st?.active===true
                                        const bars=st?.bars
                                        const col2=COND_COLORS[ci%COND_COLORS.length]
                                        const shouldBlink=active&&bars!=null&&bars<=blinkN
                                        return(
                                          <span key={c.id} title={c.name+(active?' ✓ '+(bars!=null?bars+'v':''):' —')}
                                            style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                                              width:13,height:13,borderRadius:'50%',flexShrink:0,
                                              background:active?col2:'rgba(42,63,85,0.5)',
                                              border:'1px solid '+(active?col2:'#2a3f55'),
                                              color:active?'#080c14':'#3d5a7a',
                                              fontFamily:MONO,fontSize:5,fontWeight:800,lineHeight:1,letterSpacing:'-0.5px',
                                              boxShadow:active?'0 0 5px '+col2+'55':undefined,
                                              cursor:'default',
                                              animation:shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined}}>
                                            {active&&bars!=null?String(bars):''}
                                          </span>
                                        )
                                      })
                                    })()}
                                  </div>
                                </td>
                                <td style={{padding:'6px 4px',maxWidth:90,overflow:'hidden'}}>
                                  <span style={{fontFamily:MONO,fontSize:9,color:'#5a8aaa',
                                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}
                                    title={t.strategy||'—'}>
                                    {t.strategy||<span style={{color:'#2a4060'}}>—</span>}
                                  </span>
                                </td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:col+'18',border:'1px solid '+col+'44',color:col}}>
                                    {TL_LABEL[t.broker]||t.broker?.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{fmtDate(t.entry_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{isOpen?<span style={{color:'#3d5a7a'}}>—</span>:fmtDate(t.exit_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{t.shares}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{t.entry_price}</td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0',whiteSpace:'nowrap'}}>
                                  {(()=>{
                                    let cap=parseFloat(t.entry_price||0)*parseFloat(t.shares||0)
                                    let fx=parseFloat(t.fx_entry||1);if(fx<1&&fx>0)fx=1/fx
                                    const capEur=(t.entry_currency&&t.entry_currency!=='EUR')?cap/fx:cap
                                    return capEur>0?'€'+Math.round(capEur).toLocaleString('es-ES'):'—'
                                  })()}
                                </td>
                                <td style={{padding:'6px 8px',color:isOpen?'#9b72ff':'#e2eaf5',whiteSpace:'nowrap'}}>
                                  {exitPx?parseFloat(exitPx).toFixed(2):<span style={{color:'#3d5a7a'}}>—</span>}
                                  {isOpen&&exitPx&&<span style={{fontSize:8,color:'#5a8aaa',marginLeft:2}}>live</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#ffd166',fontSize:10}}>{t.entry_currency||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(t.fx_entry||0);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{const c=parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0);return c>0?'€'+c.toFixed(2):'—'})()}</td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnl!=null?<span style={{color:pnl>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnl>=0?'+':''}{parseFloat(pnl).toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnlPct!=null?<span style={{color:pnlPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnlPct>=0?'+':''}{parseFloat(pnlPct).toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0'}}>{dias!=null?dias+'d':'—'}</td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:isOpen?'rgba(155,114,255,0.12)':'rgba(0,229,160,0.1)',
                                    border:'1px solid '+(isOpen?'rgba(155,114,255,0.3)':'rgba(0,229,160,0.3)'),
                                    color:isOpen?'#9b72ff':'#00e5a0'}}>
                                    {isOpen?'Abierta':'Cerrada'}
                                  </span>
                                </td>
                              </tr>
                              )
                            }
                            // ── Render display items ──
                            return items.flatMap((item, displayIdx)=>{
                              if(item.type==='row'){
                                return [renderRow(item.t, displayIdx, items)]
                              }
                              // GROUP
                              const {group_id, members} = item
                              const isExp = tlExpandedGroups.has(group_id)
                              const first = members[0]
                              const totalShares = members.reduce((s,m)=>s+parseFloat(m.shares||0),0)
                              const allOpen = members.every(m=>m.status==='open')
                              const allClosed = members.every(m=>m.status==='closed')
                              const groupPnl = members.reduce((s,m)=>{
                                const p=m.status==='open'?m._pnl_float_eur:m.pnl_eur
                                return s+(p!=null?parseFloat(p):0)
                              },0)
                              const groupPnlPct = members.reduce((s,m)=>{
                                const p=m.status==='open'?m._pnl_float_pct:m.pnl_pct
                                return s+(p!=null?parseFloat(p):0)
                              },0)/members.length
                              const col=TL_COLORS[first.broker]||'#7a9bc0'
                              const rows = [
                                // Parent summary row
                                <tr key={'grp-'+group_id}
                                  style={{borderBottom:'1px solid var(--border)',
                                    background:'rgba(0,212,255,0.04)',
                                    borderLeft:'2px solid rgba(0,212,255,0.35)',cursor:'pointer'}}
                                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.08)'}
                                  onMouseOut={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}>
                                  {tlMultiMode&&<td style={{padding:'6px 8px'}}/>}
                                  <td style={{padding:'6px 8px'}}>
                                    <button
                                      onClick={e=>{e.stopPropagation();setTlExpandedGroups(prev=>{const n=new Set(prev);n.has(group_id)?n.delete(group_id):n.add(group_id);return n})}}
                                      style={{background:'rgba(0,212,255,0.12)',border:'1px solid rgba(0,212,255,0.35)',
                                        color:'#00d4ff',borderRadius:3,cursor:'pointer',
                                        fontFamily:MONO,fontSize:10,padding:'1px 5px',lineHeight:1,fontWeight:700}}>
                                      {isExp?'▼':'▶'} {members.length}
                                    </button>
                                  </td>
                                  <td style={{padding:'6px 4px 6px 8px'}} onClick={e=>{e.stopPropagation();setTlExpandedGroups(prev=>{const n=new Set(prev);n.has(group_id)?n.delete(group_id):n.add(group_id);return n})}}>
                                    <span style={{fontWeight:700,color:'#00d4ff'}}>{first.symbol}</span>
                                    <span style={{fontFamily:MONO,fontSize:8,color:'#4a7a95',marginLeft:4}}>{members.length} ops</span>
                                  </td>
                                  <td style={{padding:'6px 4px',color:'#5a8aaa',fontSize:9}}>{first.strategy||'—'}</td>
                                  <td style={{padding:'6px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                      background:col+'18',border:'1px solid '+col+'44',color:col}}>
                                      {TL_LABEL[first.broker]||first.broker?.toUpperCase()}
                                    </span>
                                  </td>
                                  <td style={{padding:'6px 8px',color:'#a8ccdf',fontSize:9}}>{fmtDate(first.entry_date)||'—'}</td>
                                  <td style={{padding:'6px 8px',color:'#3d5a7a',fontSize:9}}>—</td>
                                  <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{totalShares.toFixed(0)}</td>
                                  <td colSpan={3} style={{padding:'6px 8px',color:'#4a7a95',fontSize:9}}>precio medio ponderado</td>
                                  <td style={{padding:'6px 8px',color:'#ffd166',fontSize:10}}>{first.entry_currency||'—'}</td>
                                  <td colSpan={2} style={{padding:'6px 8px'}}/>
                                  <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                    {groupPnl!==0?<span style={{color:groupPnl>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{groupPnl>=0?'+':''}{groupPnl.toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                  </td>
                                  <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                    {groupPnlPct!==0?<span style={{color:groupPnlPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{groupPnlPct>=0?'+':''}{groupPnlPct.toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                  </td>
                                  <td style={{padding:'6px 8px',color:'#3d5a7a'}}>—</td>
                                  <td style={{padding:'6px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                      background:allOpen?'rgba(155,114,255,0.12)':allClosed?'rgba(0,229,160,0.1)':'rgba(255,209,102,0.1)',
                                      border:'1px solid '+(allOpen?'rgba(155,114,255,0.3)':allClosed?'rgba(0,229,160,0.3)':'rgba(255,209,102,0.3)'),
                                      color:allOpen?'#9b72ff':allClosed?'#00e5a0':'#ffd166'}}>
                                      {allOpen?'Abiertas':allClosed?'Cerradas':'Mixto'}
                                    </span>
                                  </td>
                                </tr>
                              ]
                              // Sub-rows when expanded
                              if(isExp){
                                members.forEach((m,mi)=>rows.push(renderRow(m, mi, members, {isSub:true, isLast:mi===members.length-1})))
                              }
                              return rows
                            })
                          })()}
                        </tbody>
                      </table>
                      {!tlLoading&&tlTrades.length===0&&(
                        <div style={{padding:'40px',textAlign:'center',fontFamily:MONO,fontSize:12,color:'#3d5a7a'}}>
                          Sin operaciones registradas.{' '}
                          <span style={{color:'#9b72ff',cursor:'pointer'}} onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.entry_currency&&_df.entry_currency!=='EUR')tlFetchFx(_df.entry_currency,_df.entry_date)}}>
                            Añadir primera operación →
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* IMPORTAR */}
                {tlTab==='import'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'16px',gap:12,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>📥 Importar operaciones</div>
                    {/* Selector de formato */}
                    <div style={{display:'flex',gap:6}}>
                      {[['ibkr_csv','CSV IBKR'],['degiro_csv','CSV Degiro'],['ai','Texto / Pegar']].map(([v,l])=>(
                        <button key={v} onClick={()=>setTlImportFormat(v)}
                          style={{fontFamily:MONO,fontSize:11,padding:'5px 10px',borderRadius:4,cursor:'pointer',
                            border:`1px solid ${tlImportFormat===v?'#9b72ff':'#1a2d45'}`,
                            background:tlImportFormat===v?'rgba(155,114,255,0.12)':'transparent',
                            color:tlImportFormat===v?'#9b72ff':'#7a9bc0'}}>{l}</button>
                      ))}
                    </div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#5a8aaa'}}>
                      {tlImportFormat==='ibkr_csv'&&'Exporta desde IBKR: Informes → Extracto de cuenta → CSV. Pega el contenido aquí.'}
                      {tlImportFormat==='degiro_csv'&&'Exporta desde Degiro: Actividad → Exportar → CSV. Pega el contenido aquí.'}
                      {tlImportFormat==='ai'&&'Pega cualquier texto: historial de broker, tabla HTML o detalle de orden. Se interpretará automáticamente.'}
                    </div>
                    <textarea value={tlImportText} onChange={e=>setTlImportText(e.target.value)}
                      placeholder={tlImportFormat==='ai'?'Pega aquí el historial, tabla o describe la operación... Ej: Compré 50 NVDA el 12/02/2025 a $485.20, comisión $1.50':'Pega el contenido del CSV aquí...'}
                      style={{flex:'none',height:200,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',
                        fontFamily:MONO,fontSize:11,padding:'10px',borderRadius:4,resize:'vertical',minHeight:120}}/>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <button onClick={()=>{setTlImportText('');setTlParsed([]);setTlParsedRaw([])}}
                        style={{fontFamily:MONO,fontSize:11,padding:'6px 12px',borderRadius:4,cursor:'pointer',
                          background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0'}}>
                        ✕ Limpiar
                      </button>
                      <button onClick={tlImportParse} disabled={tlImportLoading||!tlImportText.trim()}
                        style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:tlImportLoading?'wait':'pointer',
                          background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700,
                          opacity:!tlImportText.trim()?0.4:1}}>
                        {tlImportLoading?'⟳ Procesando...':'🔍 Analizar'}
                      </button>
                      {tlParsed.length>0&&<span style={{fontFamily:MONO,fontSize:11,color:'#00e5a0'}}>✓ {tlParsed.length} operaciones detectadas</span>}
                    </div>

                    {/* Preview de operaciones parseadas */}
                    {tlParsed.length>0&&(
                      <div style={{border:'1px solid var(--border)',borderRadius:6,overflow:'hidden'}}>
                        <div style={{padding:'8px 12px',background:'var(--bg2)',borderBottom:'1px solid var(--border)',
                          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700}}>Preview</span>
                            <button onClick={()=>{
                              const next=!tlGroupFills
                              setTlGroupFills(next)
                              setTlParsed(enrichParsedRows(next ? groupParsedFills(tlParsedRaw) : tlParsedRaw))
                            }}
                              title="Agrupar compras y ventas del mismo símbolo en una operación"
                              style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlGroupFills?'#ffd166':'#2a4060'),
                                background:tlGroupFills?'rgba(255,209,102,0.1)':'transparent',
                                color:tlGroupFills?'#ffd166':'#5a7a95'}}>
                              {tlGroupFills?'⛓ Agrupado':'⛓ Agrupar fills'}
                            </button>
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={()=>{setTlParsed([]);setTlParsedRaw([])}}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                                border:'1px solid #2a4060',background:'transparent',color:'#7a9bc0'}}>Cancelar</button>
                            <button onClick={()=>tlImportConfirm(tlParsed)}
                              disabled={tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,
                                cursor:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'not-allowed':'pointer',
                                border:'1px solid '+(tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'#ffd166':'#00e5a0'),
                                background:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'rgba(255,209,102,0.1)':'rgba(0,229,160,0.1)',
                                color:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'#ffd166':'#00e5a0',
                                fontWeight:700}}>
                              {(()=>{
                const needsChoice=tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)
                const valid=tlParsed.filter(r=>!r._isDuplicate).length
                return needsChoice?'⚠ Elige posición a cerrar':`✓ Importar ${valid} op${valid!==1?'s':''}`
              })()}
                            </button>
                          </div>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                          <thead><tr style={{background:'var(--bg2)'}}>
                            {['Tipo','Símbolo','Fecha','Acc.','Precio','Div.','FX','Broker','Estado','Cap. €',''].map(h=>(
                              <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:9,color:'#3d5a7a',letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {tlParsed.map((t,i)=>{
                              const isDup=t._isDuplicate
                              const isClose=!!t._closesTradeId
                              const isGrouped=t._grouped
                              const ed=(field,val)=>setTlParsed(prev=>{
                                const next=[...prev]; next[i]={...next[i],[field]:val}; return next
                              })
                              const cell=(field,val,cls)=>(
                                <td style={{padding:'3px 5px'}}>
                                  <input value={val||''} onChange={e=>ed(field,e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:cls||'var(--text)',fontFamily:MONO,fontSize:11,width:'100%',
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                </td>
                              )
                              return (
                              <tr key={i} style={{borderBottom:'1px solid var(--border)',
                                background:isDup?'rgba(255,77,109,0.06)':'transparent',
                                opacity:isDup?0.7:1}}>
                                <td style={{padding:'3px 5px',whiteSpace:'nowrap'}}>
                                  {isClose?(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background: t._multipleOpen?'rgba(255,209,102,0.25)':t._isPartialClose?'rgba(255,209,102,0.2)':'rgba(155,114,255,0.2)',
                                      color: t._multipleOpen?'#ffd166':t._isPartialClose?'#ffd166':'#9b72ff',fontWeight:700}}>
                                      {t._multipleOpen?'⚠ MÚLTIPLES':t._isPartialClose?'↩ PARCIAL':'↩ CIERRE'}
                                    </span>
                                  ):isGrouped?(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background:'rgba(0,212,255,0.15)',color:'#00d4ff',fontWeight:700}}>
                                      ↕ {t._buyCount}C+{t._sellCount}V
                                    </span>
                                  ):(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background:t.fill_type==='buy'?'rgba(0,229,160,0.15)':'rgba(255,77,109,0.15)',
                                      color:t.fill_type==='buy'?'#00e5a0':'#ff4d6d',fontWeight:700}}>
                                      {t.fill_type==='buy'?'▲ BUY':'▼ SELL'}
                                    </span>
                                  )}
                                  {isDup&&<span style={{fontSize:8,color:'#ff4d6d',marginLeft:4,display:'block'}}>⚠ dup</span>}
                                </td>
                                {cell('symbol',t.symbol,'#c8dff5')}
                                <td style={{padding:'3px 5px'}}>
                                  <input value={t.entry_date||''} onChange={e=>ed('entry_date',e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:'#a8ccdf',fontFamily:MONO,fontSize:11,width:88,
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                </td>
                                {cell('shares',t.shares)}
                                <td style={{padding:'3px 5px',whiteSpace:'nowrap'}}>
                                  <input value={t.entry_price||''} onChange={e=>ed('entry_price',e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:'var(--text)',fontFamily:MONO,fontSize:11,width:70,
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                  {t.exit_price&&<span style={{fontSize:9,color:'#9b72ff',marginLeft:3}}>→{t.exit_price}</span>}
                                  {isClose&&!t._multipleOpen&&<div style={{fontSize:8,color:t._isPartialClose?'#ffd166':'#9b72ff'}}>
                                    {t._isPartialClose
                                      ? `cierra ${t._sellShares} de ${t._openShares} acc · resto ${t._remainingShares}`
                                      : `cierra ${t._closesSymbol} (${t._openShares} acc)`}
                                  </div>}
                                  {t._multipleOpen&&(
                                    <div style={{marginTop:3}}>
                                      <div style={{fontSize:8,color:'#ffd166',marginBottom:2}}>
                                        ⚠ {t._openOptions?.length} posiciones abiertas — elige cuál cerrar:
                                      </div>
                                      <select
                                        value={t._closesTradeId||''}
                                        onChange={e=>{
                                          const chosen = t._openOptions?.find(o=>o.id===e.target.value)
                                          if(!chosen) return
                                          const openShares=parseFloat(chosen.shares||0)
                                          const sellShares=parseFloat(t.shares||0)
                                          setTlParsed(prev=>{
                                            const next=[...prev]
                                            next[i]={...next[i],
                                              _closesTradeId:chosen.id,
                                              _openEntryDate:chosen.entry_date,
                                              _openShares:openShares,
                                              _sellShares:sellShares,
                                              _isPartialClose:sellShares<openShares-0.001,
                                              _isFullClose:Math.abs(sellShares-openShares)<0.001,
                                              _remainingShares:Math.max(0,openShares-sellShares)
                                            }
                                            return next
                                          })
                                        }}
                                        style={{fontFamily:MONO,fontSize:9,background:'#0d1824',
                                          border:'1px solid #ffd166',color:'#ffd166',
                                          borderRadius:3,padding:'2px 4px',cursor:'pointer',width:'100%'}}>
                                        {t._openOptions?.map(o=>(
                                          <option key={o.id} value={o.id}>
                                            {o.entry_date} · {o.shares} acc · ${o.entry_price}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </td>
                                {cell('entry_currency',t.entry_currency,'#ffd166')}
                                <td style={{padding:'3px 5px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(t.fx_entry);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                {cell('broker',t.broker)}
                                <td style={{padding:'3px 5px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,
                                    background: t._isFullClose||t.status==='closed'?'rgba(0,229,160,0.1)':t._isPartialClose?'rgba(255,209,102,0.15)':'rgba(255,209,102,0.1)',
                                    color: t._isFullClose||t.status==='closed'?'#00e5a0':t._isPartialClose?'#ffd166':'#ffd166'}}>
                                    {t._isFullClose||t.status==='closed'?'✓ Cerrada':t._isPartialClose?'◑ Parcial':'○ Abierta'}
                                  </span>
                                </td>
                                <td style={{padding:'3px 5px',color:'#00d4ff'}}>{t.capital_eur?`€${Math.round(t.capital_eur)}`:'—'}</td>
                                <td style={{padding:'3px 5px'}}>
                                  <button onClick={()=>setTlParsed(prev=>prev.filter((_,j)=>j!==i))}
                                    title="Eliminar esta fila"
                                    style={{background:'transparent',border:'none',color:'#3d5a7a',cursor:'pointer',
                                      fontSize:12,padding:'0 4px',lineHeight:1}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                                    onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>✕</button>
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* EXPORT */}
                {tlTab==='export'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'20px',gap:16,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>📤 Exportar operaciones</div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#5a8aaa'}}>
                      Descarga el historial completo en formato Excel/CSV.
                    </div>
                    {(()=>{
                      const exportCSV = () => {
                        const SEP = ','
                        const NL  = '\r\n'
                        const esc = function(v) {
                          var s = v == null ? '' : String(v)
                          return '"' + s.replace(/"/g, '""') + '"'
                        }
                        var headers = ['#','Simbolo','Nombre','Broker','Estado','Entrada','Salida','Acciones','Px Entrada','Capital inv EUR','Px Salida','Divisa','FX entrada','Comision EUR','PnL EUR','PnL pct','Dias','Estrategia','Notas']
                        var rows = tlTrades.map(function(t,i) {
                          var fx = parseFloat(t.fx_entry||1); if(fx<1) fx=1/fx
                          var cap = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0)/fx).toFixed(0)
                          var dias = t.entry_date&&t.exit_date ? Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000) : ''
                          var comm = (parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)).toFixed(2)
                          var notes = (t.notes||'').split('\n').join(' ').split('\r').join('')
                          return [
                            i+1, t.symbol||'', t.name||'', t.broker||'', t.status||'',
                            t.entry_date||'', t.exit_date||'', t.shares||'',
                            t.entry_price!=null ? parseFloat(t.entry_price).toFixed(2) : '',
                            cap,
                            t.exit_price!=null ? parseFloat(t.exit_price).toFixed(2) : '',
                            t.entry_currency||'', fx.toFixed(4), comm,
                            t.pnl_eur!=null ? parseFloat(t.pnl_eur).toFixed(2) : '',
                            t.pnl_pct!=null ? parseFloat(t.pnl_pct).toFixed(2)+'%' : '',
                            dias, t.strategy||'', notes
                          ]
                        })
                        var allRows = [headers].concat(rows)
                        var csv = allRows.map(function(r){ return r.map(esc).join(SEP) }).join(NL)
                        var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'})
                        var url = URL.createObjectURL(blob)
                        var a = document.createElement('a')
                        a.href = url
                        a.download = 'tradelog_'+new Date().toISOString().slice(0,10)+'.csv'
                        a.click()
                        URL.revokeObjectURL(url)
                      }
                                            const exportJSON = () => {
                        const blob = new Blob([JSON.stringify(tlTrades,null,2)],{type:'application/json'})
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href=url; a.download='tradelog_'+new Date().toISOString().slice(0,10)+'.json'
                        a.click(); URL.revokeObjectURL(url)
                      }
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:360}}>
                          <div style={{padding:'14px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700,marginBottom:4}}>📊 CSV / Excel</div>
                            <div style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',marginBottom:10}}>
                              Compatible con Excel, Google Sheets y Numbers. Incluye todas las columnas del historial.
                            </div>
                            <button onClick={exportCSV}
                              style={{fontFamily:MONO,fontSize:11,padding:'7px 16px',borderRadius:4,cursor:'pointer',
                                background:'rgba(0,229,160,0.12)',border:'1px solid #00e5a0',color:'#00e5a0',fontWeight:700}}>
                              ⬇ Descargar CSV ({tlTrades.length} ops)
                            </button>
                          </div>
                          <div style={{padding:'14px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700,marginBottom:4}}>🗂 JSON (backup)</div>
                            <div style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',marginBottom:10}}>
                              Exporta todos los campos incluyendo notas, fills e IDs. Útil como copia de seguridad manual.
                            </div>
                            <button onClick={exportJSON}
                              style={{fontFamily:MONO,fontSize:11,padding:'7px 16px',borderRadius:4,cursor:'pointer',
                                background:'rgba(0,212,255,0.08)',border:'1px solid #00d4ff',color:'#00d4ff',fontWeight:700}}>
                              ⬇ Descargar JSON ({tlTrades.length} ops)
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* DASHBOARD */}
                {tlTab==='dashboard'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:0,overflowY:'auto'}}>
                    {(()=>{
                      const filtered = tlFiltered
                      const closed = filtered.filter(t=>t.status==='closed'&&t.pnl_eur!=null&&t.entry_date)
                        .sort((a,b)=>(a.exit_date||a.entry_date).localeCompare(b.exit_date||b.entry_date))
                      const openTrades = filtered.filter(t=>t.status==='open'&&t.entry_date)
                      if(!closed.length&&!openTrades.length) return (
                        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:MONO,fontSize:12,color:'#3d5a7a'}}>
                          Sin operaciones para mostrar el dashboard.
                        </div>
                      )
                      // commissions helper
                      const commOf=t=>parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)
                      const today = new Date().toISOString().split('T')[0]
                      // Build equity curve — closed P&L (net of commissions) + open floating
                      let cumPnl = 0
                      const equityCurve = closed.map(t=>{
                        // pnl_eur already net of commissions from backend; add comm safety if zero
                        cumPnl += parseFloat(t.pnl_eur||0)
                        return {date:t.exit_date||t.entry_date, value:cumPnl, trade:t}
                      })
                      // Float point = closed cum + live floating (net comm buy already deducted)
                      const floatPnl = openTrades.reduce((s,t)=>s+(t._pnl_float_eur||0),0)
                      if(floatPnl!==0 && equityCurve.length>0){
                        equityCurve.push({date:today,value:cumPnl+floatPnl,isFloat:true})
                      }
                      // Build invest chart data: timeline of capital invested vs cumulative profit
                      const events = []
                      closed.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        const commIn = parseFloat(t.commission_buy||0)
                        events.push({date:t.entry_date, capDelta:+capitalEur+commIn, pnlDelta:-commIn})
                        events.push({date:t.exit_date||today, capDelta:-capitalEur, pnlDelta:parseFloat(t.pnl_eur||0)+commIn})
                      })
                      events.sort((a,b)=>a.date.localeCompare(b.date))
                      let runCap=0, runPnl=0
                      const investMap = {}
                      events.forEach(ev=>{
                        runCap += ev.capDelta; runPnl += ev.pnlDelta
                        investMap[ev.date]={capital:Math.max(0,runCap), profit:runPnl}
                      })
                      // Open trades: capital still deployed
                      openTrades.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        const d = t.entry_date
                        if(!investMap[d]) investMap[d]={capital:0,profit:runPnl}
                        investMap[d].capital += capitalEur
                        investMap[d].profit += (t._pnl_float_eur||0)
                      })
                      const investData = Object.keys(investMap).sort().map(d=>({date:d,...investMap[d]}))
                      const wins = closed.filter(t=>(t.pnl_eur||0)>=0)
                      const losses = closed.filter(t=>(t.pnl_eur||0)<0)
                      const totalPnl = closed.reduce((s,t)=>s+(t.pnl_eur||0),0)+floatPnl
                      const avgWin = wins.length?wins.reduce((s,t)=>s+(t.pnl_eur||0),0)/wins.length:0
                      const avgLoss = losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnl_eur||0),0)/losses.length:0
                      const factorBen = avgLoss>0?avgWin/avgLoss:0
                      const bestTrade = closed.length?closed.reduce((b,t)=>(t.pnl_eur||0)>(b.pnl_eur||0)?t:b, closed[0]):null
                      let peak=0, maxDD=0
                      equityCurve.forEach(p=>{if(p.value>peak)peak=p.value;const dd=peak-p.value;if(dd>maxDD)maxDD=dd})
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:0}}>
                          {/* Filtros activos badge */}
                          {(tlFilterStatus||tlFilterBroker||tlFilterYear||tlFilterMonth||tlFilterStrat||tlSearch)&&(
                            <div style={{padding:'4px 10px',background:'rgba(155,114,255,0.06)',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                              <span style={{fontFamily:MONO,fontSize:8,color:'#4a5a70',flexShrink:0}}>Filtros:</span>
                              {tlFilterStatus&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Estado: {tlFilterStatus}</span>}
                              {tlFilterBroker&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Broker: {tlFilterBroker}</span>}
                              {tlFilterYear&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Año: {tlFilterYear}{tlFilterMonth?' · '+['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(tlFilterMonth)-1]:''}</span>}
                              {tlFilterStrat&&<span style={{fontFamily:MONO,fontSize:9,color:'#00d4ff',border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'1px 5px',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tlFilterStrat}>{tlFilterStrat}</span>}
                              {tlSearch&&<span style={{fontFamily:MONO,fontSize:9,color:'#ffd166',border:'1px solid rgba(255,209,102,0.3)',borderRadius:3,padding:'1px 5px'}}>"{tlSearch}"</span>}
                              <button onClick={()=>{setTlFilterStatus('');setTlFilterBroker('');setTlFilterYear('');setTlFilterMonth('');setTlFilterStrat('');setTlSearch('')}}
                                style={{fontFamily:MONO,fontSize:8,padding:'1px 5px',borderRadius:3,cursor:'pointer',
                                  background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',color:'#ff4d6d',marginLeft:'auto',flexShrink:0}}>
                                ✕ Limpiar todo
                              </button>
                            </div>
                          )}

                          {/* Equity curve — P&L acumulado */}
                          {equityCurve.length>1&&<TlEquityChart curve={equityCurve}/>}
                          {/* Capital Invertido vs Profit */}
                          {investData.length>1&&<TlInvestChart investData={investData}/>}
                          {/* Barras P&L por trade — cerradas + abiertas */}
                          {(closed.length>0||openTrades.length>0)&&(
                            <div style={{padding:'12px 16px 8px',borderTop:'1px solid var(--border)'}}>
                              <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>P&L por operación</div>
                              <div style={{display:'flex',alignItems:'flex-end',gap:2,height:60}}>
                                {[...closed.map(t=>({...t,isOpen:false})),...openTrades.map(t=>({...t,pnl_eur:t._pnl_float_eur||0,isOpen:true}))].map((t,i)=>{
                                  const allPnls=[...closed.map(x=>Math.abs(x.pnl_eur||0)),...openTrades.map(x=>Math.abs(x._pnl_float_eur||0))]
                                  const mx=Math.max(...allPnls,1)
                                  const h=Math.max(3,Math.abs(t.pnl_eur||0)/mx*56)
                                  const isW=(t.pnl_eur||0)>=0
                                  const bar=t.isOpen?(isW?'rgba(0,229,160,0.5)':'rgba(255,77,109,0.45)'):(isW?'#00e5a0':'#ff4d6d')
                                  return <div key={i} title={t.symbol+' '+(isW?'+':'')+('€'+Math.round(t.pnl_eur||0))+(t.isOpen?' (abierta)':'')}
                                    style={{flex:1,height:h,background:bar,borderRadius:'2px 2px 0 0',minWidth:2,
                                      opacity:0.85,cursor:'default',border:t.isOpen?'1px solid '+(isW?'#00e5a0':'#ff4d6d'):'none'}}/>
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}


                </div>
                {/* COLUMNA DERECHA — métricas siempre + detalle trade */}
                <div style={{width:270,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  {/* ── MÉTRICAS SIEMPRE VISIBLES — incluye flotantes ── */}
                  {(()=>{
                    const all=tlFiltered
                    const closed=all.filter(t=>t.status==='closed')
                    const open=all.filter(t=>t.status==='open')
                    const today=new Date().toISOString().split('T')[0]
                    // P&L
                    const pnlReal=closed.reduce((s,t)=>s+(t.pnl_eur||0),0)
                    const pnlFloat=open.reduce((s,t)=>s+(t._pnl_float_eur||0),0)
                    const pnlTotal=pnlReal+pnlFloat
                    const commTotal=all.reduce((s,t)=>s+(parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)),0)
                    // Combinamos cerradas + abiertas con su P&L flotante para Win Rate, medias, días
                    const allWithPnl=[
                      ...closed.map(t=>({...t,_eff_pnl:t.pnl_eur||0,_eff_pct:parseFloat(t.pnl_pct||0),_eff_dias:t.entry_date&&t.exit_date?Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000):0})),
                      ...open.map(t=>({...t,_eff_pnl:t._pnl_float_eur||0,_eff_pct:t._pnl_float_pct||0,_eff_dias:t.entry_date?Math.round((new Date(today)-new Date(t.entry_date))/86400000):0}))
                    ]
                    const wins=allWithPnl.filter(t=>t._eff_pnl>=0)
                    const losses=allWithPnl.filter(t=>t._eff_pnl<0)
                    const wr=allWithPnl.length?wins.length/allWithPnl.length*100:0
                    const avgWinPct=wins.length?wins.reduce((s,t)=>s+t._eff_pct,0)/wins.length:0
                    const avgLossPct=losses.length?losses.reduce((s,t)=>s+Math.abs(t._eff_pct),0)/losses.length:0
                    const avgWinEur=wins.length?wins.reduce((s,t)=>s+t._eff_pnl,0)/wins.length:0
                    const avgLossEur=losses.length?losses.reduce((s,t)=>s+Math.abs(t._eff_pnl),0)/losses.length:0
                    const factorBen=avgLossEur>0?(avgWinEur/avgLossEur):null
                    const bestT=allWithPnl.length?allWithPnl.reduce((b,t)=>t._eff_pnl>b._eff_pnl?t:b,allWithPnl[0]):null
                    const worstT=allWithPnl.length?allWithPnl.reduce((b,t)=>t._eff_pnl<b._eff_pnl?t:b,allWithPnl[0]):null
                    // Días: cerradas + abiertas en curso
                    const diasArr=allWithPnl.map(t=>t._eff_dias).filter(d=>d!=null&&d>=0)
                    const diasProm=diasArr.length?diasArr.reduce((s,d)=>s+d,0)/diasArr.length:null
                    const totalDias=diasArr.reduce((s,d)=>s+d,0)
                    // DD sobre P&L total (cerradas + flotante actual)
                    let peak=0,maxDD=0
                    closed.slice().sort((a,b)=>(a.exit_date||'').localeCompare(b.exit_date||'')).reduce((cum,t)=>{
                      const eq=cum+(t.pnl_eur||0); if(eq>peak)peak=eq; const dd=peak-eq; if(dd>maxDD)maxDD=dd; return eq
                    },0)
                    // CAGR — desde primera entrada (cualquier op.) hasta HOY, sobre P&L total
                    const firstDate=allWithPnl.length?allWithPnl.reduce((a,t)=>t.entry_date<a?t.entry_date:a,allWithPnl[0].entry_date):null
                    const aniosPeriodo=firstDate?Math.max((new Date(today)-new Date(firstDate))/86400000/365.25,0.01):null
                    const aniosInv=totalDias/365.25
                    const tiempoInvPct=aniosPeriodo?Math.round(totalDias/(aniosPeriodo*365.25)*100):null
                    // CAGR usa capital empleado actual como base
                    const capitalEmp=open.reduce((s,t)=>{
                      const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                      return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                    },0)
                    const capitalBase=capitalEmp>0?capitalEmp:10000
                    const cagrReal=aniosPeriodo&&pnlTotal!==0?
                      (Math.pow(Math.max((capitalBase+pnlTotal)/capitalBase,0.001),1/aniosPeriodo)-1)*100:null
                    const fmtEur=v=>v>=0?'+€'+Math.round(v):'-€'+Math.round(Math.abs(v))
                    // Max DD como % sobre capital base
                    const maxDDPct=maxDD>0&&capitalBase>0?(maxDD/capitalBase*100):0
                    // Mejor/Peor usa _eff_pnl (incluye flotante de abiertas)
                    const bestV=bestT?bestT._eff_pnl:null
                    const worstV=worstT?worstT._eff_pnl:null
                    const rows=[
                      {l:'Total Operaciones',
                       v:(open.length+' ab. / '+closed.length+' cerr.'),
                       c:'#ffd166',
                       tip:'Total posiciones registradas. Abiertas = en cartera ahora. Cerradas = ya liquidadas.'},
                      {l:'Capital Empleado',
                       v:capitalEmp>0?'€'+Math.round(capitalEmp).toLocaleString('es-ES'):'—',
                       c:'#00d4ff',
                       tip:'Suma del capital actual en posiciones abiertas (acciones × precio entrada ÷ FX). No incluye P&L flotante.'},
                      {l:'Tiempo Invertido ('+aniosInv.toFixed(2)+'a)',
                       v:tiempoInvPct!=null?tiempoInvPct+'%':'—',
                       c:'#ffd166',
                       tip:'Días totales con capital invertido ÷ días totales del periodo. Incluye días en curso de posiciones abiertas.'},
                      {l:'Ganadoras',
                       v:wins.length,
                       c:'#00e5a0',
                       tip:'Ops con P&L ≥ 0. Cerradas: P&L realizado. Abiertas: P&L flotante actual.'},
                      {l:'Perdedoras',
                       v:losses.length,
                       c:'#ff4d6d',
                       tip:'Ops con P&L < 0. Cerradas: P&L realizado. Abiertas: P&L flotante actual.'},
                      {l:'Win Rate',
                       v:allWithPnl.length?wr.toFixed(1)+'%':'—',
                       c:wr>=50?'#00e5a0':'#ff4d6d',
                       tip:'Ganadoras ÷ total ops × 100. Incluye cerradas (P&L real) y abiertas (flotante). Mejora al cerrar las abiertas en positivo.'},
                      {l:'Ganancia Media (%)',
                       v:avgWinPct>0?'+'+avgWinPct.toFixed(2)+'%':'—',
                       c:'#00e5a0',
                       tip:'Media del % de ganancia de todas las ops ganadoras. Cerradas: pnl_pct. Abiertas: % flotante actual sobre precio entrada.'},
                      {l:'Pérdida Media (%)',
                       v:avgLossPct>0?avgLossPct.toFixed(2)+'%':'—',
                       c:'#ff4d6d',
                       tip:'Media del % de pérdida (en valor absoluto) de todas las ops perdedoras. Incluye abiertas en negativo.'},
                      {l:'Días Promedio',
                       v:diasProm!=null?Math.round(diasProm)+' d':'—',
                       c:'#00d4ff',
                       tip:'Media de días por operación. Cerradas: días entre entrada y salida. Abiertas: días hasta hoy.'},
                      {l:'Total Días Invertido',
                       v:totalDias+' d',
                       c:'#00d4ff',
                       tip:'Suma de todos los días individuales invertidos. Si tienes 2 ops simultáneas de 5 días cada una, cuenta 10 días.'},
                      {l:'P&L realizado',
                       v:fmtEur(pnlReal),
                       c:pnlReal>=0?'#00e5a0':'#ff4d6d',
                       tip:'Suma del P&L neto de todas las operaciones cerradas (ya descontadas comisiones si están en pnl_eur).'},
                      {l:'P&L flotante',
                       v:fmtEur(pnlFloat),
                       c:pnlFloat>=0?'#00e5a0':'#ffd166',
                       tip:'P&L no realizado de las posiciones abiertas. Calculado como (precio actual − precio entrada) × acciones ÷ FX.'},
                      {l:'P&L total',
                       v:fmtEur(pnlTotal),
                       c:pnlTotal>=0?'#00e5a0':'#ff4d6d',
                       tip:'P&L realizado + P&L flotante. Representa el resultado global de toda la cartera en este momento.'},
                      {l:'Comisiones',
                       v:commTotal>0?'-€'+commTotal.toFixed(2):'—',
                       c:'#ff4d6d',
                       tip:'Suma de commission_buy + commission_sell de todas las operaciones. No están descontadas del P&L mostrado si usas pnl_eur bruto.'},
                      {l:'Factor Beneficio',
                       v:factorBen!=null?factorBen.toFixed(2):'—',
                       c:factorBen!=null&&factorBen>=1?'#00e5a0':'#ff4d6d',
                       tip:'Ganancia media € ganador ÷ pérdida media € perdedor. >1 = expectativa positiva. Incluye abiertas por su flotante actual.'},
                      {l:'CAGR ('+(aniosPeriodo?aniosPeriodo.toFixed(2):'—')+'a)',
                       v:cagrReal!=null?(cagrReal>=0?'+':'')+cagrReal.toFixed(2)+'%':'—',
                       c:cagrReal!=null&&cagrReal>=0?'#00e5a0':'#ff4d6d',
                       tip:'Tasa anual compuesta: ((Capital+P&LTotal)/Capital)^(1/años)−1. Periodo: primera entrada hasta hoy. Base: capital empleado actual (o 10.000€ si no hay abiertas).'},
                      {l:'Max Drawdown',
                       v:maxDD>0?('-€'+Math.round(maxDD)+' ('+maxDDPct.toFixed(1)+'%)'):'—',
                       c:'#ff4d6d',
                       tip:'Mayor caída desde un pico de P&L hasta el valle siguiente, calculado sobre las ops cerradas ordenadas por fecha de salida. El flotante no se incluye (es dinámico).'},
                      {l:'Mejor op.',
                       v:bestT?(bestT.symbol+' '+(bestV>=0?'+':'')+fmtEur(bestV)):'—',
                       c:'#00e5a0',
                       tip:'Operación con mayor P&L €. Incluye abiertas por su flotante actual. Si está abierta, el resultado puede cambiar.'},
                      {l:'Peor op.',
                       v:worstT?(worstT.symbol+' '+fmtEur(worstV)):'—',
                       c:'#ff4d6d',
                       tip:'Operación con peor P&L €. Incluye abiertas por su flotante actual. Si está abierta, el resultado puede cambiar.'},
                    ]
                    return(
                      <div className="tl-resumen" onContextMenu={e=>{e.stopPropagation();openCtx(e,'tl_resumen')}} style={{flex:tlSelected?'0 0 auto':1,overflowY:'auto',borderBottom:tlSelected?'1px solid var(--border)':'none'}}>
                        <div style={{padding:'6px 10px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',display:'flex',justifyContent:'space-between'}}>
                          <span>Resumen · {open.length}ab/{closed.length}cerr</span>
                          <span style={{color:'#1a3a5a'}}>{all.length} ops</span>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse'}}>
                          <tbody>
                            {rows.map(({l,v,c,tip})=>(
                              <MetricRow key={l} label={l} value={v} color={c} tip={tip}/>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                  {/* ── DETALLE TRADE SELECCIONADO ── */}
                  {tlSelected&&(

                    <div style={{flex:1,overflowY:'auto'}}>

                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MODAL BÚSQUEDA DE SÍMBOLO ══ */}
      {symSearchOpen&&(()=>{
        const q=symSearchQ.trim().toUpperCase()
        // 1. Watchlist exactos/parciales primero
        const wlMatches=watchlist.filter(w=>
          w.symbol.toUpperCase().includes(q)||(w.name||'').toUpperCase().includes(q)
        ).map(w=>({symbol:w.symbol,name:w.name||lookupName(w.symbol),src:'watchlist'}))
        // 2. SYM_NAMES que no estén ya
        const wlSyms=new Set(wlMatches.map(x=>x.symbol))
        const dictMatches=Object.entries(SYM_NAMES)
          .filter(([s,n])=>!wlSyms.has(s)&&(s.includes(q)||n.toUpperCase().includes(q)))
          .map(([s,n])=>({symbol:s,name:n,src:'dict'}))
        // 3. El propio texto como símbolo literal al final
        const allSyms=new Set([...wlMatches,...dictMatches].map(x=>x.symbol))
        const literal=q.length>=1&&!allSyms.has(q)?[{symbol:q,name:'Buscar símbolo directo',src:'literal'}]:[]
        const results=[...wlMatches,...dictMatches,...literal].slice(0,12)
        return(
          <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80}}
            onClick={()=>{setSymSearchOpen(false);setSymSearchQ('')}}>
            <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:10,width:520,maxHeight:480,display:'flex',flexDirection:'column',boxShadow:'0 16px 60px rgba(0,0,0,0.85)',overflow:'hidden',fontFamily:MONO}}
              onClick={e=>e.stopPropagation()}>
              {/* Input */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',borderBottom:'1px solid #1e3a52'}}>
                <span style={{fontSize:18,color:'#00d4ff'}}>🔍</span>
                <input ref={symSearchInputRef} type="text" value={symSearchQ}
                  onChange={e=>setSymSearchQ(e.target.value.toUpperCase())}
                  onKeyDown={e=>{
                    if(e.key==='Escape'){setSymSearchOpen(false);setSymSearchQ('')}
                    if(e.key==='Enter'&&results.length>0){
                      setSimbolo(results[0].symbol);setSymSearchOpen(false);setSymSearchQ('')
                    }
                  }}
                  placeholder="Escribe símbolo o nombre... ej: NVDA, Apple, BTC"
                  style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#e2eaf5',fontFamily:MONO,fontSize:18,fontWeight:600,letterSpacing:'0.05em'}}
                />
                <button onClick={()=>{setSymSearchOpen(false);setSymSearchQ('')}}
                  style={{background:'transparent',border:'none',color:'#3d5a7a',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
              </div>
              {/* Resultados */}
              <div style={{overflowY:'auto',maxHeight:380}}>
                {results.length===0&&q.length>0&&(
                  <div style={{padding:'20px 16px',color:'#3d5a7a',fontSize:12,textAlign:'center'}}>Sin resultados para «{q}»</div>
                )}
                {results.map((r,i)=>(
                  <div key={r.symbol} onClick={()=>{setSimbolo(r.symbol);setSymSearchOpen(false);setSymSearchQ('')}}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',cursor:'pointer',
                      background:i===0?'rgba(0,212,255,0.06)':'transparent',
                      borderBottom:'1px solid rgba(255,255,255,0.03)'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.1)'}
                    onMouseOut={e=>e.currentTarget.style.background=i===0?'rgba(0,212,255,0.06)':'transparent'}>
                    <div style={{width:28,height:28,borderRadius:6,background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:10,color:'#00d4ff',fontWeight:700}}>{r.symbol.replace('^','').slice(0,3)}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:'#e2eaf5',fontWeight:700,fontSize:14}}>{r.symbol}</div>
                      <div style={{color:'#7a9bc0',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    </div>
                    {r.src==='watchlist'&&<span style={{fontSize:9,color:'#00d4ff',background:'rgba(0,212,255,0.1)',padding:'2px 6px',borderRadius:3}}>WL</span>}
                    {i===0&&<span style={{fontSize:9,color:'#3d5a7a'}}>↵</span>}
                  </div>
                ))}
                {q.length===0&&(
                  <div style={{padding:'12px 16px',color:'#3d5a7a',fontSize:11,textAlign:'center'}}>Escribe para buscar · Esc para cerrar</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL ALARMA — fixed sobre gráfico ══ */}
      {editingAlarm!==null&&(()=>{
        // When a global condition is linked, auto-fill params display
        const linkedCond = conditions.find(c=>c.id===alarmForm.condition_id)
        const COND_LABELS = {
          ema_cross_up:'EMA rápida > EMA lenta ↑', ema_cross_down:'EMA rápida < EMA lenta ↓',
          price_above_ma:'Precio > Media móvil', price_below_ma:'Precio < Media móvil',
          price_above_ema:'Precio > EMA rápida', price_below_ema:'Precio < EMA rápida',
          rsi_above:'RSI por encima de nivel', rsi_below:'RSI por debajo de nivel',
          rsi_cross_up:'RSI cruza hacia arriba', rsi_cross_down:'RSI cruza hacia abajo',
          macd_cross_up:'MACD cruza señal ↑', macd_cross_down:'MACD cruza señal ↓',
        }
        // Render param inputs based on condition type
        const condType = linkedCond?.type || alarmForm.condition || 'ema_cross_up'
        const isEMAType = condType.startsWith('ema_cross') || condType.startsWith('price_above_ema') || condType.startsWith('price_below_ema')
        const isMAType  = condType.startsWith('price_above_ma') || condType.startsWith('price_below_ma')
        const isRSI     = condType.startsWith('rsi_')
        const isMACD    = condType.startsWith('macd_')

        return(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditAlarm()}}>
            <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:400,maxHeight:'88vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontWeight:700,color:'var(--text)',fontSize:15}}>{editingAlarm.id?'Editar alarma':'Nueva alarma'}</span>
                <button onClick={closeEditAlarm} style={{background:'transparent',border:'none',color:'var(--text3)',fontSize:18,cursor:'pointer'}}>✕</button>
              </div>

              {/* Símbolo activo — solo lectura, muestra qué símbolo tendrá la alerta */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,212,255,0.06)',border:'1px solid rgba(0,212,255,0.2)',borderRadius:5}}>
                <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>Símbolo:</span>
                <span style={{fontFamily:MONO,fontSize:15,color:'var(--accent)',fontWeight:700}}>{alarmForm.symbol||simbolo}</span>
                <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginLeft:'auto'}}>activo en el gráfico</span>
              </div>

              {/* Tipo de alerta */}
              <div style={{display:'flex',gap:6}}>
                {[['condition','📡 Condición técnica'],['price_level','🎯 Precio']].map(([v,l])=>(
                  <button key={v} onClick={()=>setAlarmForm(p=>({...p,condition:v==='price_level'?'price_level':(p.condition==='price_level'?'ema_cross_up':p.condition)}))}
                    style={{flex:1,padding:'7px 6px',fontFamily:MONO,fontSize:10,borderRadius:4,cursor:'pointer',fontWeight:600,
                      background:(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'rgba(0,212,255,0.12)':'transparent',
                      border:`1px solid ${(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'var(--accent)':'var(--border)'}`,
                      color:(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'var(--accent)':'var(--text3)'}}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Si es condición técnica: enlazar con librería (opcional) */}
              {alarmForm.condition!=='price_level'&&conditions.length>0&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                  <span style={{fontSize:10}}>De la librería <span style={{color:'#4a6a80'}}>(opcional)</span></span>
                  <select value={alarmForm.condition_id||''} onChange={e=>{
                      const cid=e.target.value||null
                      const cond=conditions.find(c=>c.id===cid)
                      setAlarmForm(p=>({...p,
                        condition_id:cid,
                        condition: cond?.type || p.condition || 'ema_cross_up',
                        ema_r: cond?.params?.ma_fast || cond?.params?.ma_period || p.ema_r || 10,
                        ema_l: cond?.params?.ma_slow || p.ema_l || 11,
                        params: cond?.params || p.params || {},
                        name: p.name || cond?.name || '',
                      }))
                    }}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                    <option value="">— Definir manualmente —</option>
                    {conditions.map(c=>(
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {linkedCond&&<div style={{fontSize:10,color:'#00d4ff',marginTop:2}}>✓ {linkedCond.description||linkedCond.name}</div>}
                </label>
              )}



              {/* Alerta de precio: solo dirección + nivel (símbolo ya está arriba) */}
              {alarmForm.condition==='price_level'&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                    <span style={{fontSize:10}}>Dirección</span>
                    <select value={alarmForm.condition_detail||'price_above'} onChange={e=>setAlarmForm(p=>({...p,condition_detail:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'7px 8px',borderRadius:4}}>
                      <option value="price_above">▲ Sube hasta</option>
                      <option value="price_below">▼ Baja hasta</option>
                    </select>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                    <span style={{fontSize:10}}>Precio objetivo</span>
                    <input type="number" value={alarmForm.price_level||''} step="0.01" placeholder="0.00"
                      onChange={e=>setAlarmForm(p=>({...p,price_level:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:14,padding:'7px 10px',borderRadius:4,fontWeight:700}}/>
                  </label>
                </div>
              )}

              {/* Tipo de condición técnica (cuando no es precio y no hay condición de librería vinculada) */}
              {alarmForm.condition!=='price_level'&&!linkedCond&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                  <span style={{fontSize:10}}>Tipo de condición</span>
                  <select value={alarmForm.condition||'ema_cross_up'} onChange={e=>setAlarmForm(p=>({...p,condition:e.target.value,params:{}}))}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                    <optgroup label="EMA">
                      <option value="ema_cross_up">↑ Cruce alcista EMA</option>
                      <option value="ema_cross_down">↓ Cruce bajista EMA</option>
                      <option value="price_above_ema">Precio &gt; EMA</option>
                      <option value="price_below_ema">Precio &lt; EMA</option>
                    </optgroup>
                    <optgroup label="RSI">
                      <option value="rsi_cross_up">RSI cruza ↑ nivel</option>
                      <option value="rsi_cross_down">RSI cruza ↓ nivel</option>
                      <option value="rsi_above">RSI sobre nivel</option>
                      <option value="rsi_below">RSI bajo nivel</option>
                    </optgroup>
                    <optgroup label="MACD">
                      <option value="macd_cross_up">MACD cruza señal ↑</option>
                      <option value="macd_cross_down">MACD cruza señal ↓</option>
                    </optgroup>
                    <optgroup label="Media móvil">
                      <option value="price_above_ma">Precio &gt; Media móvil</option>
                      <option value="price_below_ma">Precio &lt; Media móvil</option>
                    </optgroup>
                  </select>
                </label>
              )}

              {/* Parámetros según tipo */}
              {(isEMAType)&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Rápida
                    <input type="number" value={alarmForm.ema_r||10} min={1} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,ema_r:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,textAlign:'center',opacity:linkedCond?0.5:1}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Lenta
                    <input type="number" value={alarmForm.ema_l||11} min={1} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,ema_l:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,textAlign:'center',opacity:linkedCond?0.5:1}}/>
                  </label>
                </div>
              )}
              {isMAType&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Período de la media
                  <input type="number" value={alarmForm.params?.ma_period||alarmForm.ema_r||50} min={1} disabled={!!linkedCond}
                    onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,ma_period:Number(e.target.value)}}))}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                </label>
              )}
              {isRSI&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Período RSI
                    <input type="number" value={alarmForm.params?.period||14} min={2} max={50} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,period:Number(e.target.value)}}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Nivel
                    <input type="number" value={alarmForm.params?.level||30} min={1} max={99} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,level:Number(e.target.value)}}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#00d4ff',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                  </label>
                </div>
              )}
              {isMACD&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['fast','Rápida',12],['slow','Lenta',26],['signal','Señal',9]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>{l}
                      <input type="number" value={alarmForm.params?.[k]||d} min={1} disabled={!!linkedCond}
                        onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)}}))}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:14,padding:'7px 6px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid var(--border)'}}>
                <button onClick={saveAlarm} disabled={alarmSaving}
                  style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'10px',borderRadius:5,cursor:'pointer',fontWeight:600}}>
                  {alarmSaving?'Guardando…':'Guardar alarma'}
                </button>
                {editingAlarm.id&&(
                  <button onClick={()=>removeAlarm(editingAlarm.id)}
                    style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'10px 14px',borderRadius:5,cursor:'pointer'}}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL ESTRATEGIA — fixed sobre gráfico ══ */}
      {editingStr!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditStr()}}>
          <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:28,width:680,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'var(--text)',fontSize:15}}>{editingStr.id?'Editar estrategia':'Nueva estrategia'}</span>
              <button onClick={closeEditStr} style={{background:'transparent',border:'none',color:'var(--text3)',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>

            {/* Fila 1: Nombre + Color */}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Nombre
                <input type="text" value={strForm.name||''} onChange={e=>setStrForm(p=>({...p,name:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',alignItems:'center'}}>Color
                <input type="color" value={strForm.color||'#00d4ff'} onChange={e=>setStrForm(p=>({...p,color:e.target.value}))} style={{width:38,height:36,padding:2,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg3)',cursor:'pointer'}}/>
              </label>
            </div>

            {/* Separador */}
            <div style={{borderTop:'1px solid var(--border)',marginTop:2}}/>

            {/* Parámetros globales: Capital + Asignación + Años */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',fontFamily:MONO,fontSize:11}}>Capital (€)
                <input type="number" value={strForm.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital??1000}catch(_){return 1000}})()} min={100}
                  onChange={e=>setStrForm(p=>({...p,capital_ini:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',fontFamily:MONO,fontSize:11}}>Asignación (%)
                <input type="number" value={strForm.allocation_pct||100} min={1} max={100}
                  onChange={e=>setStrForm(p=>({...p,allocation_pct:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',fontFamily:MONO,fontSize:11}}>Años BT
                <input type="number" value={strForm.years||5} min={1} max={20}
                  onChange={e=>setStrForm(p=>({...p,years:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
            </div>

            {/* Constructor modular */}
            <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
              {/* Botón Asistente IA */}
              <button onClick={()=>setAiPanelOpen(true)} style={{
                display:'flex',alignItems:'center',gap:8,width:'100%',
                background:'linear-gradient(135deg,rgba(155,114,255,0.12),rgba(0,212,255,0.08))',
                border:'1px solid rgba(155,114,255,0.4)',borderRadius:6,
                color:'#cce0f5',fontFamily:MONO,fontSize:11,padding:'8px 12px',
                cursor:'pointer',marginBottom:10,textAlign:'left',transition:'all .15s'
              }}
              onMouseOver={e=>{e.currentTarget.style.background='linear-gradient(135deg,rgba(155,114,255,0.2),rgba(0,212,255,0.14))';e.currentTarget.style.borderColor='rgba(155,114,255,0.7)'}}
              onMouseOut={e=>{e.currentTarget.style.background='linear-gradient(135deg,rgba(155,114,255,0.12),rgba(0,212,255,0.08))';e.currentTarget.style.borderColor='rgba(155,114,255,0.4)'}}>
                <span style={{fontSize:16,lineHeight:1}}>✦</span>
                <div>
                  <div style={{fontWeight:700,letterSpacing:'0.04em',fontSize:11}}>Asistente IA</div>
                  <div style={{fontSize:9,color:'#7a9bc0',marginTop:1}}>Describe tu estrategia en lenguaje natural</div>
                </div>
                <span style={{marginLeft:'auto',fontSize:10,color:'#9b72ff'}}>→</span>
              </button>
              <StrategyBuilder definition={definition} setDefinition={setDefinition}/>
            </div>

            {/* Observaciones */}
            <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
              Observaciones
              <textarea value={strForm.observations||''} onChange={e=>setStrForm(p=>({...p,observations:e.target.value}))} rows={3} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4,resize:'vertical'}}/>
            </label>

            {/* Lista de estrategias existentes */}
            {strategies.length>0&&(
              <div style={{borderTop:'1px solid var(--border)',paddingTop:12}}>
                <div style={{fontWeight:600,color:'var(--text3)',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Estrategias guardadas</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:140,overflowY:'auto'}}>
                  {strategies.map(s=>(
                    <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:4,background:editingStr?.id===s.id?'rgba(0,212,255,0.08)':'transparent',border:editingStr?.id===s.id?'1px solid rgba(0,212,255,0.3)':'1px solid transparent'}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:s.color||'#00d4ff',flexShrink:0,display:'inline-block'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <span style={{color:'var(--text)',fontSize:11,fontWeight:600}}>{s.name}</span>
                        <span style={{color:'var(--text3)',fontSize:10,marginLeft:8}}>{s.years}a · {(s.definition?.entry?.type||'legacy').replace(/_/g,' ')}</span>
                      </div>
                      <button onClick={()=>openEditStr(s)} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>✎</button>
                      <button onClick={()=>duplicateStr(s)} title="Duplicar" style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>⎘</button>
                      <button onClick={()=>{loadStrategyLegacy(s);closeEditStr()}} style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>▶</button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>openEditStr({id:null})} style={{marginTop:8,width:'100%',background:'transparent',border:'1px dashed var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:11,padding:'6px',borderRadius:4,cursor:'pointer'}}>+ Nueva estrategia</button>
              </div>
            )}

            {/* Botones acción */}
            <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid var(--border)'}}>
              <button onClick={saveEditStr} disabled={strSaving} style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'9px',borderRadius:5,cursor:'pointer',fontWeight:600}}>
                {strSaving?'Guardando…':'Guardar estrategia'}
              </button>
              {editingStr.id&&<button onClick={()=>deleteStr(editingStr.id)} style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:12,padding:'9px 16px',borderRadius:5,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>
                Eliminar
              </button>}
            </div>
          </div>
        </div>
      )}
    {/* ── Modal de configuración global ── */}
    {settingsOpen&&<SettingsModal onClose={()=>{setSettingsOpen(false);setTemaKey(k=>k+1)}} strategies={strategies}/>}

    {/* ── Panel Asistente IA de estrategias ── */}
    {aiPanelOpen&&<StrategyAIPanel
      definition={definition}
      onApply={(defn, name)=>{setDefinition(defn);if(name)setStratName(name);setAiPanelOpen(false)}}
      onClose={()=>setAiPanelOpen(false)}
    />}

    {/* ── Modal de alarma de precio (doble-clic en gráfico) ── */}
    {priceAlarmDlg&&(
      <div style={{position:'fixed',inset:0,zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}
        onClick={()=>setPriceAlarmDlg(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:'#0d1520',border:'1px solid var(--border)',borderRadius:8,padding:'20px 24px',fontFamily:MONO,color:'var(--text)',minWidth:280,boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:'var(--accent)'}}>Nueva Alarma de Precio</div>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>{priceAlarmDlg.symbol}</div>
          <PriceAlarmQuickForm
            price={priceAlarmDlg.price} symbol={priceAlarmDlg.symbol}
            alarms={alarms}
            onSave={async(item)=>{
              try{
                await upsertAlarm(item)
                reloadAlarms()
              }catch(e){alert('Error al guardar alarma: '+e.message)}
              setPriceAlarmDlg(null)
            }}
            onCancel={()=>setPriceAlarmDlg(null)}
          />
        </div>
      </div>
    )}
      {/* Alarm popup removed — use alarms panel instead */}

      {/* ══ MODAL NUEVA OPERACIÓN ══ */}
      {tlFormOpen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget)setTlFormOpen(false)}}>
          <div className="tl-modal" onContextMenu={e=>openCtx(e,'modals')} style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:560,maxHeight:'90vh',overflowY:'auto',
            display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'#c8dff5',fontSize:14}}>{tlForm.id?'Editar operación':'Nueva operación'}</span>
              <span onClick={()=>setTlFormOpen(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:20,lineHeight:1}}>×</span>
            </div>
            {/* Fila 1: símbolo + nombre + tipo */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              {/* Símbolo — con buscador autocomplete */}
              <label style={{display:'flex',flexDirection:'column',gap:4,position:'relative'}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Símbolo *</span>
                <input type="text" placeholder="AAPL, MSFT, BTC..." value={tlForm.symbol}
                  autoComplete="off"
                  onChange={e=>{
                    const v=e.target.value.toUpperCase()
                    setTlForm(f=>({...f,symbol:v,_symSearch:v}))
                  }}
                  onBlur={()=>setTimeout(()=>setTlForm(f=>({...f,_symSearch:''})),180)}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                {/* Dropdown sugerencias */}
                {tlForm._symSearch&&tlForm._symSearch.length>=1&&(()=>{
                  const q=tlForm._symSearch
                  const wlHits=watchlist.filter(w=>w.symbol.includes(q)||(w.name||'').toUpperCase().includes(q)).slice(0,4)
                  const wlSyms=new Set(wlHits.map(w=>w.symbol))
                  const dictHits=Object.entries(SYM_NAMES).filter(([s,n])=>!wlSyms.has(s)&&(s.includes(q)||n.toUpperCase().includes(q))).slice(0,5)
                  const all=[...wlHits.map(w=>({symbol:w.symbol,name:w.name})),...dictHits.map(([s,n])=>({symbol:s,name:n}))]
                  if(!all.length) return null
                  const assetTypeFor=(sym)=>{
                    if(sym.includes('-USD')||sym.includes('BTC')||sym.includes('ETH')) return 'crypto'
                    if(sym.startsWith('^')) return 'etf'
                    if(sym.includes('=F')) return 'future'
                    return 'stock'
                  }
                  return(
                    <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,
                      background:'#0d1824',border:'1px solid #1e3a52',borderRadius:4,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.7)',maxHeight:200,overflowY:'auto',marginTop:2}}>
                      {all.map(hit=>(
                        <div key={hit.symbol} onMouseDown={e=>{
                          e.preventDefault()
                          const sym=hit.symbol, name=hit.name||''
                          const currency=sym.includes('-USD')||sym.startsWith('^')||sym.includes('=F')?'USD':'USD'
                          const atype=assetTypeFor(sym)
                          setTlForm(f=>({...f,symbol:sym,name,asset_type:atype,entry_currency:currency,_symSearch:'',entry_price:'',_fxLoading:false}))
                          // Fetch live price for the selected symbol
                          fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({simbolo:sym,cfg:{emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}})})
                            .then(r=>r.json())
                            .then(j=>{ if(j.meta?.ultimoPrecio) setTlForm(f=>({...f,entry_price:String(j.meta.ultimoPrecio.toFixed(2))})) })
                            .catch(()=>{})
                          // Also fetch FX for the currency
                          if(currency!=='EUR') tlFetchFx(currency, tlForm.entry_date)
                        }}
                        style={{padding:'6px 10px',cursor:'pointer',display:'flex',justifyContent:'space-between',
                          alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)',
                          fontFamily:MONO,fontSize:11}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.08)'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                          <span style={{color:'#00d4ff',fontWeight:600}}>{hit.symbol}</span>
                          <span style={{color:'#7a9bc0',fontSize:10}}>{hit.name}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </label>
              {/* Nombre */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Nombre</span>
                <input type="text" placeholder="Apple Inc." value={tlForm.name||''}
                  onChange={e=>setTlForm(f=>({...f,name:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Tipo */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Tipo</span>
                <select value={tlForm.asset_type} onChange={e=>setTlForm(f=>({...f,asset_type:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  <option value="stock">Acción</option><option value="etf">ETF</option>
                  <option value="crypto">Crypto</option><option value="future">Futuro</option>
                </select>
              </label>
            </div>
            {/* Fila 2: broker */}
            <label style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={{fontSize:10,color:'#5a8aaa'}}>Broker</span>
              <div style={{display:'flex',gap:6}}>
                {TL_BROKERS.map(b=>(
                  <button key={b} onClick={()=>setTlForm(f=>({...f,broker:b}))}
                    style={{fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:4,cursor:'pointer',
                      border:`1px solid ${tlForm.broker===b?(TL_COLORS[b]||'#9b72ff'):'#1a2d45'}`,
                      background:tlForm.broker===b?`${TL_COLORS[b]||'#9b72ff'}18`:'transparent',
                      color:tlForm.broker===b?(TL_COLORS[b]||'#9b72ff'):'#7a9bc0'}}>
                    {TL_LABEL[b]}
                  </button>
                ))}
              </div>
            </label>
            {/* Fila 3: fecha, precio, acciones */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              {/* Fecha — dd/mm/yyyy custom */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha entrada *</span>
                <input type="text" placeholder="dd/mm/yyyy"
                  value={tlForm.entry_date}
                  onChange={e=>{
                    let v=e.target.value.replace(/[^0-9/]/g,'')
                    if(v.length===2&&!v.includes('/')) v=v+'/'
                    if(v.length===5&&v.split('/').length===2) v=v+'/'
                    if(v.length>10) v=v.slice(0,10)
                    setTlForm(f=>({...f,entry_date:v}))
                    // Auto-fetch FX cuando la fecha está completa
                    if(v.length===10&&tlForm.entry_currency&&tlForm.entry_currency!=='EUR'&&!tlForm.fx_entry_manual)
                      tlFetchFx(tlForm.entry_currency, v)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Precio entrada */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Precio entrada *</span>
                <input type="number" placeholder="0.00" value={tlForm.entry_price}
                  onChange={e=>setTlForm(f=>({...f,entry_price:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Nº acciones */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Nº acciones *</span>
                <input type="number" placeholder="0" value={tlForm.shares}
                  onChange={e=>setTlForm(f=>({...f,shares:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
            </div>
            {/* Fila 4: divisa, comisión, FX */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Divisa</span>
                <select value={tlForm.entry_currency} onChange={e=>{
                    const cur=e.target.value
                    if(cur==='EUR'){setTlForm(f=>({...f,entry_currency:cur,fx_entry:'1',fx_entry_manual:false}));return}
                    setTlForm(f=>({...f,entry_currency:cur,fx_entry:'',fx_entry_manual:false}))
                    tlFetchFx(cur, tlForm.entry_date)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  <option>USD</option><option>EUR</option><option>GBP</option><option>CHF</option><option>JPY</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión compra (€)</span>
                <input type="number" min="0" step="0.01" value={tlForm.commission_buy} onChange={e=>setTlForm(f=>({...f,commission_buy:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>FX manual <span style={{color:'#3d5a7a'}}>(opt.)</span></span>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <input type="number" step="0.0001" placeholder={tlForm._fxLoading?'Cargando…':'auto'} value={tlForm.fx_entry} onChange={e=>setTlForm(f=>({...f,fx_entry:e.target.value,fx_entry_manual:true}))}
                    style={{flex:1,background:'var(--bg3)',border:`1px solid ${tlForm.fx_entry_manual?'#ffd166':tlForm.fx_entry?'#00e5a0':'var(--border)'}`,color:tlForm._fxLoading?'#5a7a95':'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  {tlForm.fx_entry_manual&&<span onClick={()=>setTlForm(f=>({...f,fx_entry:'',fx_entry_manual:false}))} title="Usar automático" style={{cursor:'pointer',color:'#ffd166',fontSize:14}}>↺</span>}
                </div>
              </label>
            </div>
            {/* Notas + estrategia */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Estrategia</span>
                <select value={tlForm.strategy||''} onChange={e=>setTlForm(f=>({...f,strategy:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  {strategies.map(st=>{const n=st.name||`V50 EMA ${st.ema_r}/${st.ema_l}`;return <option key={st.id} value={n}>{n}</option>})}
                  {strategies.length===0&&<option value="V50">V50</option>}
                  <option value="">— Sin estrategia —</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Notas</span>
                <input type="text" placeholder="Soporte en $215..." value={tlForm.notes||''} onChange={e=>setTlForm(f=>({...f,notes:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
            </div>
            {/* ── FILLS PARCIALES ── */}
            <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa'}}>Fills parciales</span>
                <button onClick={()=>setTlFillsList(f=>[...f,{date:tlForm.entry_date||todayDisplay()||'',price:'',shares:''}])}
                  style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                    border:'1px solid #2a4060',background:'rgba(0,212,255,0.06)',color:'#00d4ff'}}>
                  + Añadir fill
                </button>
              </div>
              {tlFillsList.length>0&&(
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {tlFillsList.map((f,fi)=>(
                    <div key={fi} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:6,alignItems:'center'}}>
                      <input type="text" placeholder="dd/mm/yyyy" value={f.date}
                        onChange={e=>{const nf=[...tlFillsList];nf[fi]={...nf[fi],date:e.target.value};setTlFillsList(nf);
                          if(e.target.value.length===10){
                            const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                            if(tot.sh>0){setTlForm(p=>({...p,shares:tot.sh.toString(),entry_price:(tot.val/tot.sh).toFixed(4)}))}
                          }}}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <input type="number" placeholder="Precio" value={f.price}
                        onChange={e=>{const nf=[...tlFillsList];nf[fi]={...nf[fi],price:e.target.value};setTlFillsList(nf);
                          const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                          if(tot.sh>0){setTlForm(p=>({...p,shares:tot.sh.toString(),entry_price:(tot.val/tot.sh).toFixed(4)}))}}}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <input type="number" placeholder="Acciones" value={f.shares}
                        onChange={e=>{const nf=[...tlFillsList];nf[fi]={...nf[fi],shares:e.target.value};setTlFillsList(nf);
                          const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                          if(tot.sh>0){setTlForm(p=>({...p,shares:tot.sh.toString(),entry_price:(tot.val/tot.sh).toFixed(4)}))}}}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <span onClick={()=>{const nf=tlFillsList.filter((_,i)=>i!==fi);setTlFillsList(nf);
                          const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                          if(tot.sh>0){setTlForm(p=>({...p,shares:tot.sh.toString(),entry_price:(tot.val/tot.sh).toFixed(4)}))}}}
                        style={{cursor:'pointer',color:'#ff4d6d',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</span>
                    </div>
                  ))}
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',paddingTop:2}}>
                    Precio medio → <span style={{color:'#ffd166'}}>{tlForm.entry_price||'—'}</span>
                    &nbsp;· Acciones totales → <span style={{color:'#ffd166'}}>{tlForm.shares||'—'}</span>
                  </div>
                </div>
              )}
            </div>
            {/* ── FILLS DE SALIDA PARCIALES (solo si hay exit_price en el form o op abierta) ── */}
            {tlForm.id&&(
              <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#ff9a6c'}}>Fills de salida parciales</span>
                  <button onClick={()=>setTlExitFillsList(f=>[...f,{date:new Date().toISOString().slice(0,10),price:'',shares:''}])}
                    style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                      border:'1px solid #2a4060',background:'rgba(255,77,109,0.06)',color:'#ff9a6c'}}>
                    + Añadir fill salida
                  </button>
                </div>
                {tlExitFillsList.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {tlExitFillsList.map((f,fi)=>(
                      <div key={fi} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:6,alignItems:'center'}}>
                        <input type="date" value={f.date}
                          onChange={e=>{const nf=[...tlExitFillsList];nf[fi]={...nf[fi],date:e.target.value};setTlExitFillsList(nf);
                            const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                            if(tot.sh>0){setTlForm(p=>({...p,exit_date:nf[nf.length-1].date,exit_price:(tot.val/tot.sh).toFixed(4)}))}}}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <input type="number" placeholder="Precio salida" value={f.price}
                          onChange={e=>{const nf=[...tlExitFillsList];nf[fi]={...nf[fi],price:e.target.value};setTlExitFillsList(nf);
                            const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                            if(tot.sh>0){setTlForm(p=>({...p,exit_price:(tot.val/tot.sh).toFixed(4)}))}}}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <input type="number" placeholder="Acciones" value={f.shares}
                          onChange={e=>{const nf=[...tlExitFillsList];nf[fi]={...nf[fi],shares:e.target.value};setTlExitFillsList(nf);
                            const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                            if(tot.sh>0){setTlForm(p=>({...p,exit_price:(tot.val/tot.sh).toFixed(4)}))}}}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <span onClick={()=>{const nf=tlExitFillsList.filter((_,i)=>i!==fi);setTlExitFillsList(nf);
                            const tot=nf.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                            if(tot.sh>0){setTlForm(p=>({...p,exit_price:(tot.val/tot.sh).toFixed(4)}))}}}
                          style={{cursor:'pointer',color:'#ff4d6d',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</span>
                      </div>
                    ))}
                    <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',paddingTop:2}}>
                      Precio medio salida → <span style={{color:'#ff9a6c'}}>{tlForm.exit_price||'—'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* ── CERRAR OPERACIÓN (inline, solo si abierta y editando) ── */}
            {tlForm.id&&tlSelected?.status==='open'&&(
              <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
                <div style={{fontFamily:MONO,fontSize:10,color:'#ffd166',marginBottom:8,fontWeight:700}}>
                  ↘ Cerrar posición
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha salida</span>
                    <input type="text" placeholder="dd/mm/yyyy" value={tlCloseForm.exit_date}
                      onChange={e=>setTlCloseForm(f=>({...f,exit_date:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Precio salida</span>
                    <input type="number" step="0.01" placeholder={tlSelected?._current_price?String(parseFloat(tlSelected._current_price).toFixed(2)):'0.00'}
                      value={tlCloseForm.exit_price}
                      onChange={e=>setTlCloseForm(f=>({...f,exit_price:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid #ffd16644',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión venta (€)</span>
                    <input type="number" min="0" step="0.01" value={tlCloseForm.commission_sell||0}
                      onChange={e=>setTlCloseForm(f=>({...f,commission_sell:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                </div>
                {tlCloseForm.exit_price&&tlCloseForm.exit_date&&(
                  <div style={{marginTop:6,fontFamily:MONO,fontSize:9,color:'#5a8aaa',display:'flex',gap:12}}>
                    {(()=>{
                      const pnlCur=(parseFloat(tlCloseForm.exit_price)-parseFloat(tlSelected.entry_price||0))*parseFloat(tlSelected.shares||0)
                      const fx=parseFloat(tlSelected.fx_entry||1)>1?parseFloat(tlSelected.fx_entry||1):(parseFloat(tlSelected.fx_entry||1)>0?1/parseFloat(tlSelected.fx_entry||1):1)
                      const pnlEur=pnlCur/fx-(parseFloat(tlCloseForm.commission_sell||0))
                      const pnlPct=(parseFloat(tlCloseForm.exit_price)/parseFloat(tlSelected.entry_price||1)-1)*100
                      const col=pnlEur>=0?'#00e5a0':'#ff4d6d'
                      return(<>
                        <span>P&L: <b style={{color:col}}>{pnlEur>=0?'+':''}{pnlEur.toFixed(2)}€</b></span>
                        <span>%: <b style={{color:col}}>{pnlPct>=0?'+':''}{pnlPct.toFixed(2)}%</b></span>
                      </>)
                    })()}
                  </div>
                )}
                <button onClick={async()=>{
                  if(!tlCloseForm.exit_price||!tlCloseForm.exit_date){alert('Introduce fecha y precio de salida');return}
                  try{
                    const exitDate=toIsoDate(tlCloseForm.exit_date)||tlCloseForm.exit_date
                    const exitPx=parseFloat(tlCloseForm.exit_price)
                    const entryPx=parseFloat(tlSelected.entry_price||0)
                    const shares=parseFloat(tlSelected.shares||0)
                    let fx=parseFloat(tlSelected.fx_entry||1); if(fx<1&&fx>0) fx=1/fx
                    const pnlCur=(exitPx-entryPx)*shares
                    const commSell=parseFloat(tlCloseForm.commission_sell||0)
                    const pnlEur=pnlCur/fx-commSell
                    const pnlPct=(exitPx/entryPx-1)*100
                    let fxExit=null
                    if(tlSelected.entry_currency&&tlSelected.entry_currency!=='EUR'){
                      try{const r=await fetch('/api/tradelog?action=fx&currency='+tlSelected.entry_currency+'&date='+exitDate);const j=await r.json();if(j.fx)fxExit=j.fx}catch(_){}
                    }
                    await tlSaveTrade({...tlSelected,
                      status:'closed',exit_date:exitDate,exit_price:exitPx,
                      commission_sell:commSell,fx_exit:fxExit,
                      pnl_eur:parseFloat(pnlEur.toFixed(4)),
                      pnl_pct:parseFloat(pnlPct.toFixed(4)),
                      pnl_currency:parseFloat(pnlCur.toFixed(4))
                    })
                    setTlFormOpen(false)
                  }catch(e){alert('Error al cerrar: '+e.message)}
                }}
                  style={{marginTop:8,fontFamily:MONO,fontSize:11,padding:'6px 14px',borderRadius:4,cursor:'pointer',
                    background:'rgba(255,209,102,0.12)',border:'1px solid #ffd166',color:'#ffd166',fontWeight:700}}>
                  ✓ Confirmar cierre
                </button>
              </div>
            )}
            {/* Botones */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:4,borderTop:'1px solid var(--border)'}}>
              {/* Eliminar (solo si editando) */}
              {tlForm.id?(
                <button onClick={async()=>{
                  if(!window.confirm('¿Eliminar esta operación? Esta acción no se puede deshacer.')) return
                  try{
                    await tlDeleteTrade(tlForm.id)
                    setTlFormOpen(false)
                    setSidePanel('tradelog')
                  }catch(e){alert('Error al eliminar: '+e.message)}
                }}
                  style={{fontFamily:MONO,fontSize:11,padding:'7px 12px',borderRadius:4,cursor:'pointer',
                    background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',color:'#ff4d6d'}}>
                  🗑 Eliminar
                </button>
              ):<div/>}
              <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setTlFormOpen(false)}
                style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:'pointer',background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0'}}>
                Cancelar
              </button>
              <button onClick={async()=>{
                try{
                  // Validar campos obligatorios
                  if(!tlForm.symbol?.trim()) { alert('El símbolo es obligatorio'); return }
                  if(!tlForm.entry_date?.trim()) { alert('La fecha de entrada es obligatoria'); return }
                  if(!tlForm.entry_price||isNaN(parseFloat(tlForm.entry_price))) { alert('El precio de entrada es obligatorio'); return }
                  if(!tlForm.shares||isNaN(parseFloat(tlForm.shares))||parseFloat(tlForm.shares)<=0) { alert('El nº de acciones es obligatorio y debe ser mayor que 0'); return }
                  let formData = {...tlForm, entry_date: toIsoDate(tlForm.entry_date)||tlForm.entry_date, status:'open', import_source:tlForm.import_source||'manual'}
                  // Strip UI-only fields before sending to Supabase
                  const {_fxLoading, _symSearch, _current_price, _current_date, _pnl_float_eur, _pnl_float_pct, ...cleanForm} = formData
                  // Convert empty strings to proper values for Supabase numeric columns (NOT NULL = 0, nullable = null)
                  const notNullNums = ['entry_price','shares','commission_buy','commission_sell']
                  const nullableNums = ['fx_entry','fx_exit','capital_eur','pnl_eur','pnl_pct','pnl_currency']
                  notNullNums.forEach(k=>{ cleanForm[k] = parseFloat(cleanForm[k])||0 })
                  nullableNums.forEach(k=>{ if(cleanForm[k]===''||cleanForm[k]==null||isNaN(parseFloat(cleanForm[k]))) cleanForm[k]=null; else cleanForm[k]=parseFloat(cleanForm[k]) })
                  formData = cleanForm
                  // Auto-fetch FX if not set and currency is not EUR
                  if(formData.entry_currency && formData.entry_currency!=='EUR' && !formData.fx_entry) {
                    try{
                      const r=await fetch(`/api/tradelog?action=fx&currency=${formData.entry_currency}&date=${formData.entry_date||new Date().toISOString().slice(0,10)}`)
                      const j=await r.json()
                      if(j.fx) formData={...formData,fx_entry:j.fx.toFixed(4)}
                    }catch(_){}
                  } else if(formData.entry_currency==='EUR') {
                    formData={...formData,fx_entry:'1'}
                  }
                  const isNew = !tlForm.id
                  const saved = await tlSaveTrade(formData)
                  setTlFormOpen(false)
                  // Captura automática SOLO en operaciones nuevas
                  ;(async()=>{
                    const tradeData={...formData,...(saved||{})}
                    const s2=JSON.parse(localStorage.getItem('v50_settings')||'{}')
                    if(!isNew){ setSidePanel('tradelog'); return }  // only screenshot on new trades
                    try{
                      setSidePanel('config')
                      await new Promise(r=>setTimeout(r,400))
                      await tlSaveScreenshot(tradeData).catch(()=>{})
                    }finally{
                      setSidePanel('tradelog')
                    }
                  })()
                }catch(e){alert('Error al guardar: '+e.message)}
              }} style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:'pointer',
                background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700}}>
                Guardar
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CERRAR OPERACIÓN ══ */}
      {tlCloseOpen&&tlSelected&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget)setTlCloseOpen(false)}}>
          <div className="tl-modal" onContextMenu={e=>openCtx(e,'modals')} style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:400,
            display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'#c8dff5',fontSize:14}}>Cerrar operación · {tlSelected.symbol}</span>
              <span onClick={()=>setTlCloseOpen(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:20,lineHeight:1}}>×</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha salida</span>
                <input type="date" value={tlCloseForm.exit_date} onChange={e=>setTlCloseForm(f=>({...f,exit_date:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Precio salida</span>
                <input type="number" step="0.01" placeholder="0.00" value={tlCloseForm.exit_price} onChange={e=>setTlCloseForm(f=>({...f,exit_price:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión venta (€)</span>
                <input type="number" min="0" step="0.01" value={tlCloseForm.commission_sell} onChange={e=>setTlCloseForm(f=>({...f,commission_sell:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>FX salida <span style={{color:'#3d5a7a'}}>(opt.)</span></span>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <input type="number" step="0.0001" placeholder="auto" value={tlCloseForm.fx_exit} onChange={e=>setTlCloseForm(f=>({...f,fx_exit:e.target.value,fx_exit_manual:true}))}
                    style={{flex:1,background:'var(--bg3)',border:`1px solid ${tlCloseForm.fx_exit_manual?'#ffd166':'var(--border)'}`,color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  {tlCloseForm.fx_exit_manual&&<span onClick={()=>setTlCloseForm(f=>({...f,fx_exit:'',fx_exit_manual:false}))} title="Usar automático" style={{cursor:'pointer',color:'#ffd166',fontSize:14}}>↺</span>}
                </div>
              </label>
            </div>
            {/* Preview P&L */}
            {tlCloseForm.exit_price&&(()=>{
              const fx=parseFloat(tlCloseForm.fx_exit)||tlSelected.fx_entry||1
              const cap=tlSelected.capital_eur||0
              const pnlCur=(parseFloat(tlCloseForm.exit_price)-parseFloat(tlSelected.entry_price))*parseFloat(tlSelected.shares)
              const pnlEur=pnlCur/fx-(tlSelected.commission_buy||0)/(tlSelected.fx_entry||1)-(parseFloat(tlCloseForm.commission_sell)||0)/fx
              const pct=cap>0?pnlEur/cap*100:0
              return(
                <div style={{padding:'8px 12px',background:'var(--bg3)',borderRadius:4,border:'1px solid var(--border)'}}>
                  <div style={{fontSize:10,color:'#5a8aaa',marginBottom:4}}>Preview P&L</div>
                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:700,color:pnlEur>=0?'#00e5a0':'#ff4d6d'}}>
                    {fmtMoney(pnlEur)} · {pnlEur>=0?'+':''}{pct.toFixed(2)}%
                  </div>
                </div>
              )
            })()}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:4,borderTop:'1px solid var(--border)'}}>
              <button onClick={()=>setTlCloseOpen(false)}
                style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:'pointer',background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0'}}>
                Cancelar
              </button>
              <button onClick={async()=>{
                try{ await tlCloseTrade() }
                catch(e){alert('Error: '+e.message)}
              }} style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:'pointer',
                background:'rgba(0,229,160,0.12)',border:'1px solid #00e5a0',color:'#00e5a0',fontWeight:700}}>
                ✓ Confirmar cierre
              </button>
            </div>
          </div>
        </div>
      )}
    <>
      {/* ── Context Theme Menu ── */}
      {ctxMenu&&<ContextThemeMenu
        x={ctxMenu.x} y={ctxMenu.y} section={ctxMenu.section}
        onClose={()=>setCtxMenu(null)}
        onSave={(nf)=>{
          setTemaKey(k=>k+1)
        }}
      />}
    </>
    </>
  )
}
