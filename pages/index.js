import { useState, useRef, useEffect, useCallback } from 'react'
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

function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('integraciones')
  const [settings, setSettings] = useState(loadSettings)
  const [groqStatus, setGroqStatus] = useState(null) // null | 'testing' | 'ok' | 'err'
  const [dirty, setDirty] = useState(false)

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
    { id:'alarmas',       label:'🔔 Alarmas' },
    { id:'grafico',       label:'📈 Gráfico' },
    { id:'ranking',       label:'🏆 Ranking' },
    { id:'watchlist',     label:'📋 Watchlist' },
    { id:'tema',          label:'🎨 Tema' },
  ]

  const inp = (val, onChange, opts={}) => (
    <input
      type={opts.type||'text'} value={val||''} onChange={e=>onChange(e.target.value)}
      placeholder={opts.placeholder||''}
      style={{
        background:'#080c14', border:'1px solid #1a2d45', borderRadius:4,
        color:'#e2eaf5', fontFamily:MONO, fontSize:12, padding:'6px 10px',
        width:'100%', boxSizing:'border-box',
        ...(opts.mono ? {letterSpacing:'0.04em'} : {})
      }}
    />
  )

  const row = (label, tip, children) => (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
        <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span>
        {tip&&<span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a'}}>{tip}</span>}
      </div>
      {children}
    </div>
  )

  const sep = (title) => (
    <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',letterSpacing:'0.12em',textTransform:'uppercase',
      borderBottom:'1px solid #1a2d45',paddingBottom:5,marginBottom:12,marginTop:4}}>{title}</div>
  )

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.65)'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#0a101a', border:'1px solid #1a2d45', borderRadius:10,
        width:560, maxHeight:'94vh', display:'flex', flexDirection:'column',
        boxShadow:'0 16px 60px rgba(0,0,0,0.7)', fontFamily:MONO
      }}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 20px 0', borderBottom:'1px solid #0d1520', paddingBottom:0}}>
          <div style={{fontSize:13,fontWeight:700,color:'#e2eaf5',letterSpacing:'0.04em'}}>⚙ Configuración</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#5a7a95',fontSize:16,cursor:'pointer',padding:'0 4px',lineHeight:1}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid #0d1520',padding:'0 20px',marginTop:0,flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:'none', border:'none', borderBottom: tab===t.id ? '2px solid #00d4ff' : '2px solid transparent',
              color: tab===t.id ? '#00d4ff' : '#5a7a95', fontFamily:MONO, fontSize:10, padding:'10px 14px 8px',
              cursor:'pointer', letterSpacing:'0.06em', textTransform:'uppercase', transition:'color .15s'
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{overflowY:'auto',flex:1,minHeight:0,padding:'18px 20px'}}>

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
              {[
                ['chart.showGrid',       'Mostrar grid',             true],
                ['chart.autoFitOnLoad',  'Auto-ajustar al cargar',    true],
              ].map(([key,label,def])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                  <input type="checkbox"
                    checked={settings[key.split('.')[0]]?.[key.split('.')[1]]??def}
                    onChange={e=>upd(key,e.target.checked)}
                    style={{accentColor:'#00d4ff',width:13,height:13}}/>
                  <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                </label>
              ))}

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

              {sep('Condiciones visibles como puntos')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:10}}>
                Selecciona qué condiciones se muestran como círculos de color en cada activo de la Watchlist.
                Solo se muestran condiciones (no alertas de precio).
              </div>
              {(()=>{
                // Load alarms from localStorage cache to show in settings without network call
                // We use a local state trick: read from the passed-in alarmsProp
                const dotIds = settings?.watchlist?.alarmDotIds || []
                // We need access to alarms here - pass them via a special key in settings or use a ref
                // Since SettingsModal doesn't have access to alarms state, we store alarm names in settings
                const storedAlarmNames = settings?.watchlist?.alarmDotNames || {}
                const allDotIds = Object.keys(storedAlarmNames)
                if(allDotIds.length===0) return(
                  <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'6px 0'}}>
                    Abre la app y vuelve aquí para ver las condiciones disponibles.
                    <br/>Se guardan automáticamente al cargar alarmas.
                  </div>
                )
                return(
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {allDotIds.map((id,i)=>{
                      const name=storedAlarmNames[id]||id
                      const sel=dotIds.includes(id)
                      const ALARM_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                      const col=ALARM_COLORS[i%ALARM_COLORS.length]
                      return(
                        <label key={id} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                          <input type="checkbox" checked={sel}
                            onChange={e=>{
                              const next=e.target.checked?[...dotIds,id]:dotIds.filter(x=>x!==id)
                              upd('watchlist.alarmDotIds',next)
                            }}
                            style={{accentColor:col,width:13,height:13}}/>
                          <span style={{width:10,height:10,borderRadius:'50%',background:col,flexShrink:0,display:'inline-block'}}/>
                          <span style={{fontFamily:MONO,fontSize:11,color:'#cce0f5'}}>{name}</span>
                        </label>
                      )
                    })}
                    <button onClick={()=>upd('watchlist.alarmDotIds',allDotIds)}
                      style={{marginTop:4,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                        border:'1px solid #2a3f55',background:'transparent',color:'#7a9bc0',cursor:'pointer',textAlign:'left'}}>
                      Seleccionar todas
                    </button>
                    <button onClick={()=>upd('watchlist.alarmDotIds',[])}
                      style={{fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                        border:'1px solid #2a3f55',background:'transparent',color:'#ff4d6d',cursor:'pointer',textAlign:'left'}}>
                      Deseleccionar todas
                    </button>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── TEMA ── */}
          {tab==='tema'&&(()=>{
            const SECCIONES=[
              {id:'global', label:'Toda la app'},
              {id:'sidebar', label:'Sidebar / Config'},
              {id:'header', label:'Encabezado'},
              {id:'chart', label:'Encabezado gráfico'},
              {id:'trades', label:'Historial trades'},
              {id:'metrics', label:'Métricas / Resumen'},
            ]
            const temaSeccion=settings.tema?.seccion||'global'
            const skFont=`tema.fonts.${temaSeccion}`
            const getFontCfg=(s)=>settings.tema?.fonts?.[s]||{}
            const fc=getFontCfg(temaSeccion)
            const fontMap={jetbrains:'"JetBrains Mono","Fira Code",monospace',ibmplex:'"IBM Plex Mono",monospace',firacode:'"Fira Code","JetBrains Mono",monospace',system:'system-ui,sans-serif'}
            const PREVIEW_TEXT='AAPL  +12.34%  €10.234'
            const previewFont=fontMap[fc.family||'jetbrains']
            return(
              <div>
                {sep('Sección a configurar')}
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:14}}>
                  {SECCIONES.map(s=>(
                    <button key={s.id} onClick={()=>upd('tema.seccion',s.id)}
                      style={{fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                        border:`1px solid ${temaSeccion===s.id?'var(--accent)':'#2a3f55'}`,
                        background:temaSeccion===s.id?'rgba(0,212,255,0.1)':'transparent',
                        color:temaSeccion===s.id?'var(--accent)':'#7a9bc0'}}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {sep(`Tipografía — ${SECCIONES.find(s=>s.id===temaSeccion)?.label||'Global'}`)}

                <div style={{marginBottom:10}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5'}}>Familia tipográfica</span>
                  <select value={fc.family||'jetbrains'} onChange={e=>upd(`${skFont}.family`,e.target.value)}
                    style={{display:'block',marginTop:5,width:'100%',background:'#080c14',border:'1px solid #1a2d45',
                      borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px'}}>
                    <option value="jetbrains">JetBrains Mono</option>
                    <option value="ibmplex">IBM Plex Mono</option>
                    <option value="firacode">Fira Code</option>
                    <option value="system">Sistema (sans-serif)</option>
                  </select>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Tamaño de fuente</span>
                    <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:32,textAlign:'right'}}>{fc.size??13}px</span>
                    <input type="range" min={9} max={18} value={fc.size??13}
                      onChange={e=>upd(`${skFont}.size`,Number(e.target.value))}
                      style={{width:90,accentColor:'#00d4ff'}}/>
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Color del texto</span>
                    <input type="color" value={fc.color||'#eef5ff'}
                      onChange={e=>upd(`${skFont}.color`,e.target.value)}
                      style={{width:28,height:28,borderRadius:4,border:'1px solid #1a2d45',cursor:'pointer',padding:1}}/>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#4a6a80'}}>{fc.color||'#eef5ff'}</span>
                  </div>
                </div>

                {/* Preview */}
                <div style={{background:'#0a101a',border:'1px solid #1a2d45',borderRadius:6,padding:'10px 12px',marginBottom:14}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginBottom:5,letterSpacing:'0.1em'}}>VISTA PREVIA</div>
                  <span style={{fontFamily:previewFont,fontSize:fc.size??13,color:fc.color||'#eef5ff'}}>
                    {PREVIEW_TEXT}
                  </span>
                </div>

                <button onClick={()=>{
                  const t={...(settings.tema||{})}
                  if(t.fonts) delete t.fonts[temaSeccion]
                  upd('tema',t)
                }} style={{marginTop:4,width:'100%',fontFamily:MONO,fontSize:10,
                  padding:'5px',borderRadius:4,border:'1px solid #ff4d6d',background:'transparent',color:'#ff4d6d',cursor:'pointer'}}>
                  Restaurar sección por defecto
                </button>
              </div>
            )
          })()}

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
        timeScale:{borderColor:'#1a2d45',timeVisible:true,rightOffset:5},
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

      // Redibujar etiquetas al hacer zoom/scroll
      chart.timeScale().subscribeVisibleTimeRangeChange(()=>setTimeout(drawTradeLabels,30))

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

      // Restore saved range OR default to last 3 months
      try {
        if(savedRangeRef?.current){
          chart.timeScale().setVisibleRange(savedRangeRef.current)
        } else {
          const lastBar = data[data.length-1]
          if(lastBar){
            const to = new Date(lastBar.date)
            const from = new Date(lastBar.date)
            from.setMonth(from.getMonth()-3)
            chart.timeScale().setVisibleRange({
              from: from.toISOString().split('T')[0],
              to:   to.toISOString().split('T')[0]
            })
          }
        }
      } catch(_){ chart.timeScale().fitContent() }
      // Save range whenever user zooms/scrolls
      chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
        if(range && savedRangeRef) savedRangeRef.current = range
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

      // Exponer navigateTo + fitAll
      if(onChartReady) onChartReady({
        navigateTo:(entryDate,exitDate)=>{
          try{
            const pad=Math.max(5,Math.round((new Date(exitDate)-new Date(entryDate))/86400000*0.3))
            const d1=new Date(entryDate); d1.setDate(d1.getDate()-pad)
            const d2=new Date(exitDate); d2.setDate(d2.getDate()+pad+6) // right margin
            chart.timeScale().setVisibleRange({from:d1.toISOString().split('T')[0],to:d2.toISOString().split('T')[0]})
          }catch(_){}
        },
        fitAll:()=>{ try{ chart.timeScale().fitContent() }catch(_){} },
        showRecent:(months)=>{
          try{
            const lastBar=data[data.length-1]
            if(!lastBar) return
            const to=new Date(lastBar.date)
            const from=new Date(lastBar.date)
            from.setMonth(from.getMonth()-(months||3))
            chart.timeScale().setVisibleRange({from:from.toISOString().split('T')[0],to:to.toISOString().split('T')[0]})
          }catch(_){}
        }
      })

      const ro=new ResizeObserver(()=>{
        if(containerRef.current)chart.applyOptions({width:containerRef.current.clientWidth})
        setTimeout(drawTradeLabels,50)
      })
      ro.observe(containerRef.current)
      setTimeout(drawTradeLabels,200)

      return()=>{cnt.removeEventListener('mousemove',onMove);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
    })
    return()=>{if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
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
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
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
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
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
  sizing:   { type:'fixed_capital', amount:10000, years:5 },
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
        body: JSON.stringify({ messages: newMessages.filter(m=>m.role!=='system') })
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
    {
      num:8, key:'sizing', color:'#7a9bc0', label:'SIZING',
      desc:'¿Cuánto capital por operación?',
      summary: sizing.type==='fixed_capital'
        ? `Capital fijo €${(sizing.amount||10000).toLocaleString('es-ES')} · ${sizing.years||5}a BT`
        : sizing.type==='pct_equity'
        ? `${sizing.pct||100}% del equity`
        : '—',
      body: (
        <div>
          {fld('Tipo de sizing', sel('sizing.type', sizing.type||'fixed_capital', [
            {v:'fixed_capital', l:'Capital fijo (€)'},
            {v:'pct_equity',    l:'Porcentaje del equity (%)'},
          ]))}
          {sizing.type!=='pct_equity' && row2(
            fld('Capital (€)', num('sizing.amount',sizing.amount||10000,100,9999999,100)),
            fld('Años backtest', num('sizing.years',sizing.years||5,1,30))
          )}
          {sizing.type==='pct_equity' && row2(
            fld('Porcentaje (%)', num('sizing.pct',sizing.pct||100,1,100)),
            fld('Capital base (€)', num('sizing.amount',sizing.amount||10000,100,9999999,100))
          )}
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

// ── Main ─────────────────────────────────────────────────────
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
  const [metricsView,setMetricsView]=useState('multi')   // 'multi'=3col | 'single'=one strat per block
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
  // Alarmas
  const [alarms,setAlarms]=useState([])
  const [alarmLoading,setAlarmLoading]=useState(true)
  const [editingAlarm,setEditingAlarm]=useState(null)
  const [alarmForm,setAlarmForm]=useState({})
  const [alarmSaving,setAlarmSaving]=useState(false)
  // Buscador global watchlist
  const [wlSearch,setWlSearch]=useState('')
  const [selectedAlarmIds,setSelectedAlarmIds]=useState([])  // IDs de alarmas activas en filtro
  const [onlyFavs,setOnlyFavs]=useState(false)  // filtro solo favoritos
  const [alarmDropOpen,setAlarmDropOpen]=useState(false)  // desplegable alarmas
  const [priceAlarmDlg,setPriceAlarmDlg]=useState(null) // {price, symbol} o null
  // ── Ranking ─────────────────────────────────────────────────
  const [rankingData,setRankingData]=useState({})      // { symbol: { score, rank, metrics } }
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
  const reloadStrategies=()=>{
    setStrLoading(true)
    fetchStrategies()
      .then(data=>setStrategies(data))
      .catch(()=>{})
      .finally(()=>setStrLoading(false))
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
            // Init alarmDotIds with all condition IDs if not yet set
            if(!s.watchlist.alarmDotIds){
              s.watchlist.alarmDotIds=conditions.map(a=>a.id)
            } else {
              // Remove stale IDs
              s.watchlist.alarmDotIds=s.watchlist.alarmDotIds.filter(id=>nameMap[id])
            }
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
    reloadStrategies()
    reloadAlarms()
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
      name:s.name||'',symbol:s.symbol||'^GSPC',
      years:s.years||5,capital_ini:s.capital_ini||10000,
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
        capital_ini:Number(strForm.capital_ini||10000),
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
    setSimbolo(s.symbol||simbolo)
    setEmaR(s.ema_r||10);setEmaL(s.ema_l||11);setYears(s.years||5)
    setCapitalIni(s.capital_ini||10000);setTipoStop(s.tipo_stop||'tecnico')
    setAtrP(s.atr_period||14);setAtrM(s.atr_mult||1.0)
    setSinPerdidas(s.sin_perdidas??true);setReentry(s.reentry??true)
    setTipoFiltro(s.tipo_filtro||'none');setSp500EmaR(s.sp500_ema_r||10);setSp500EmaL(s.sp500_ema_l||11)
    setStrForm(f=>({...f,_loadedName:s.name}))
    setStratName(s.name||'')
    setSidePanel('config')
  }
  const newStrategy=()=>openEditStr({id:null})
  const duplicateStr=(s)=>openEditStr({...s,id:null,name:s.name+' (copia)'})

  // ── Alarmas ──
  const openEditAlarm=(a)=>{
    setEditingAlarm(a)
    setAlarmForm({
      name:a.name||'',
      condition:a.condition||'ema_cross_up',
      ema_r:a.ema_r||10,ema_l:a.ema_l||11,
    })
  }
  const closeEditAlarm=()=>{setEditingAlarm(null);setAlarmForm({})}
  const saveAlarm=async()=>{
    setAlarmSaving(true)
    try{
      await upsertAlarm({...alarmForm,id:editingAlarm?.id||undefined,active:true})
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
  const refreshAlarmStatus=useCallback(async(wl,al)=>{
    const wlList=wl||watchlist
    const alarmList=al||alarms
    const symbols=wlList.map(w=>w.symbol)
    if(!symbols.length||!alarmList.length) return
    setAlarmStatusLoading(true)
    try{
      const res=await fetch('/api/status',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbols,alarms:alarmList.map(a=>({id:a.id,condition:a.condition,ema_r:a.ema_r,ema_l:a.ema_l}))})
      })
      const data=await res.json()
      setAlarmStatus(data||{})
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
  }, [watchlist,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL])

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
      const body={ name:stratName, description:stratDesc, symbol:simbolo,
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
    if(strat.symbol) setSimbolo(strat.symbol)
    setStratTab('build')
    setStratMsg({type:'ok',text:`Cargada: ${strat.name}`})
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

  // ── Backtesting runner ─────────────────────────────────────
  const runBacktesting=useCallback(async()=>{
    if(mcSelected.length<2){setMcError('Selecciona al menos 2 activos');return}
    setMcLoading(true);setMcError(null);setMcResult(null)
    try{
      const res=await fetch('/api/multibacktest',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          symbols:mcSelected,
          cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
            tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
            tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital:mcCapital}
        })
      })
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setMcResult(json)
    }catch(e){setMcError(e.message)}finally{setMcLoading(false)}
  },[mcSelected,mcCapital,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL])

  const metrics=result?calcMetrics(result.trades,Number(capitalIni),result.capitalReinv,result.gananciaSimple,result.ganBH||0,result.startDate,result.meta?.ultimaFecha,Number(years)):null
  // Load settings from Supabase on mount (overrides localStorage if newer)
  useEffect(()=>{
    loadSettingsRemote().then(remote=>{
      if(remote){
        saveSettings(remote) // update local cache
        setTemaKey(k=>k+1)  // re-apply tema
      }
    })
  },[])

  // Apply tema font settings per section via <style> injection
  const [temaKey, setTemaKey] = useState(0)
  useEffect(()=>{
    try{
      const t = JSON.parse(localStorage.getItem('v50_settings')||'{}')?.tema||{}
      const fonts = t.fonts||{}
      const fontMap={jetbrains:'"JetBrains Mono","Fira Code",monospace',ibmplex:'"IBM Plex Mono",monospace',firacode:'"Fira Code","JetBrains Mono",monospace',system:'system-ui,sans-serif'}
      const selectorMap={
        global:'body *',
        sidebar:'.sidebar,.sidebar-section,aside',
        header:'.header,.header *',
        chart:'.chart-wrap .chart-header,.chart-wrap .chart-header *',
        trades:'.trades-section,.trades-section *',
        metrics:'.metrics-section,.metrics-section *,div[style*="275px"] *',
      }
      // Always apply global to modal overlays too (fixed/absolute containers)
      const globalFc=fonts['global']
      if(globalFc){
        const parts2=[]
        if(globalFc.family) parts2.push(`font-family:${fontMap[globalFc.family]||fontMap.jetbrains} !important`)
        if(globalFc.size)   parts2.push(`font-size:${globalFc.size}px !important`)
        if(globalFc.color)  parts2.push(`color:${globalFc.color} !important`)
        if(parts2.length){
          // Target modal overlays specifically
          css+=`div[style*="position:fixed"] *,div[style*="position: fixed"] *{${parts2.join(';')}}
`
          css+=`div[style*="zIndex:200"] *,div[style*="z-index:200"] *{${parts2.join(';')}}
`
        }
      }
      let css=''
      for(const [sec,sel] of Object.entries(selectorMap)){
        const fc=fonts[sec]
        if(!fc) continue
        const parts=[]
        if(fc.family) parts.push(`font-family:${fontMap[fc.family]||fontMap.jetbrains} !important`)
        if(fc.size)   parts.push(`font-size:${fc.size}px !important`)
        if(fc.color)  parts.push(`color:${fc.color} !important`)
        if(parts.length) css+=`${sel}{${parts.join(';')}}
`
      }
      let el=document.getElementById('v50-tema-style')
      if(!el){el=document.createElement('style');el.id='v50-tema-style';document.head.appendChild(el)}
      el.textContent=css
    }catch(_){}
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
        <title>Trading Simulator V3.8</title>
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
        <header className="header" style={{display:'flex',alignItems:'stretch',padding:0,height:TAB_H}}>
          {/* Logo */}
          <div className="header-logo" style={{display:'flex',alignItems:'center',padding:'0 16px',flexShrink:0}}>
            <span className="dot"/>Trading Simulator V3.8
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
            {result&&metrics&&sidePanel!=='multi'&&<button onClick={()=>setMetricsLayout(l=>l==='grid'?'panel':'grid')} style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer'}}>
              {metricsLayout==='grid'?'⊞ Panel':'⊟ Grid'}
            </button>}
            <button onClick={()=>setSettingsOpen(true)} title="Configuración" style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:14,padding:'2px 8px',borderRadius:4,cursor:'pointer',lineHeight:1}} onMouseOver={e=>e.currentTarget.style.borderColor='#4a7fa0'} onMouseOut={e=>e.currentTarget.style.borderColor='#1a2d45'}>
              ⚙
            </button>
            <div style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>Stooq · diario</div>
          </div>
        </header>

        <div className="main">
          {/* ── SIDEBAR ── */}
          <aside className="sidebar" style={{padding:0,gap:0,position:'relative',width:sidebarW,flexShrink:0,flexGrow:0}}>
            {/* Resize handle — right edge */}
            <div onMouseDown={e=>{sidebarResizing.current=true;sidebarStartX.current=e.clientX;sidebarStartW.current=sidebarW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
              style={{position:'absolute',top:0,right:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                background:'transparent',transition:'background 0.15s'}}
              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
            <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
              {[{id:'config',label:'⚙',title:'Configuración'},{id:'watchlist',label:'☰',title:'Watchlist'},{id:'alarms',label:'🔔',title:'Alarmas'},{id:'multi',label:'📊',title:'Backtesting'}].map(tab=>(
                <button key={tab.id} onClick={()=>setSidePanel(tab.id)} title={tab.title} style={{
                  flex:1,padding:'8px 4px',
                  background:sidePanel===tab.id?'var(--bg3)':'transparent',
                  border:'none',
                  borderBottom:sidePanel===tab.id?'2px solid var(--accent)':'2px solid transparent',
                  color:sidePanel===tab.id?'var(--accent)':'var(--text3)',
                  fontFamily:MONO,fontSize:14,cursor:'pointer'
                }}>
                  {tab.label}
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
                  <div className="sidebar-title">Activo</div>
                  <label>Símbolo<input type="text" value={simbolo} onChange={e=>setSimbolo(e.target.value.toUpperCase())} placeholder="^GSPC"/></label>
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
                {/* ══ Fila 2: filtro alarmas (chips inline, ancho completo) ══ */}
                {wlShowAlarmFlt&&(()=>{
                  const dotIds=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.alarmDotIds??null}catch(_){return null}})()
                  const visibleChips=alarms.filter(a=>a.condition!=='price_level'&&(dotIds===null||dotIds.includes(a.id)))
                  return visibleChips.length>0
                })()&&(
                  <div style={{padding:'4px 8px 5px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',flexShrink:0,marginRight:2}}>🔔</span>
                    {(()=>{const dotIds=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.alarmDotIds??null}catch(_){return null}})();return alarms.filter(a=>a.condition!=='price_level'&&(dotIds===null||dotIds.includes(a.id)))})().map((a,ai)=>{
                      const sel=selectedAlarmIds.includes(a.id)
                      const activeCount=watchlist.filter(w=>alarmStatus[w.symbol]?.[a.id]?.active===true).length
                      const ALARM_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                      const col=ALARM_COLORS[ai%ALARM_COLORS.length]
                      return(
                        <button key={a.id}
                          onClick={()=>{
                            const nowSel=!sel
                            setSelectedAlarmIds(prev=>nowSel?[...prev,a.id]:prev.filter(x=>x!==a.id))
                            if(nowSel&&Object.keys(alarmStatus).length===0) refreshAlarmStatus()
                          }}
                          style={{
                            fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:12,cursor:'pointer',
                            border:`1px solid ${sel?col:'#1e3a52'}`,
                            background:sel?`${col}18`:'rgba(255,255,255,0.03)',
                            color:sel?col:'#8aadcc',
                            display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'
                          }}>
                          <span style={{width:8,height:8,borderRadius:'50%',background:activeCount>0?col:'#2a3f55',flexShrink:0,display:'inline-block'}}/>
                          {a.name}
                          {activeCount>0&&<span style={{color:col,fontWeight:700,fontSize:11}}>{activeCount}</span>}
                        </button>
                      )
                    })}
                    {selectedAlarmIds.length>0&&(
                      <span onClick={()=>setSelectedAlarmIds([])} style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',cursor:'pointer',marginLeft:2,flexShrink:0}}>✕</span>
                    )}
                    {alarmStatusLoading&&<span style={{fontFamily:MONO,fontSize:11,color:'#ffd166'}}>⟳</span>}
                  </div>
                )}

                {/* ── Lista de activos ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {wlLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!wlLoading&&(()=>{
                    const searchLower=wlSearch.toLowerCase()
                    const filtered=watchlist.filter(w=>{
                      const matchList=selectedLists.length===0||selectedLists.includes(w.list_name||'General')
                      const matchSearch=!wlSearch||(w.symbol||'').toLowerCase().includes(searchLower)||(w.name||'').toLowerCase().includes(searchLower)
                      const matchFav=!onlyFavs||w.favorite
                      const symAlarms=alarmStatus[w.symbol]||{}
                      const matchAlarm=selectedAlarmIds.length===0||selectedAlarmIds.every(id=>symAlarms[id]?.active===true)
                      return matchList&&matchSearch&&matchFav&&matchAlarm
                    })
                    // Sort: 1st by ranking, 2nd by favorite, 3rd alphabetical
                    const all=[...filtered].sort((a,b)=>{
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
                        {hasRanking&&!rankingRunning&&<span style={{color:'#00e5a0',fontSize:9}}>🏆 Ordenado por ranking</span>}
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
                        style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)',background:simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}>
                        {/* Ranking badge */}
                        {wlShowRankBadge&&(()=>{
                          const rd=rankingData[w.symbol]
                          if(!rd) return <span style={{width:16,flexShrink:0}}/>
                          const r=rd.rank
                          const col=r===1?'#ffd700':r===2?'#c0c0c0':r===3?'#cd7f32':r<=10?'#00d4ff':'#3d5a7a'
                          return(
                            <span title={`Rank #${r} · Score: ${rd.score.toFixed(0)} · WR:${rd.metrics.winRate.toFixed(0)}% · FB:${rd.metrics.factorBen.toFixed(1)} · CAGR:${rd.metrics.cagr.toFixed(1)}%`}
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
                        {/* Badges alarmas — círculos de color con velas */}
                        {(()=>{
                          const dotIds=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.alarmDotIds??null}catch(_){return null}})()
                          if(dotIds!==null&&dotIds.length===0) return null
                          const symAlarms=alarmStatus[w.symbol]
                          if(!symAlarms) return null
                          const ALARM_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          const visibleAlarms=alarms.filter(a=>a.condition!=='price_level'&&(dotIds===null||dotIds.includes(a.id)))
                          return visibleAlarms.map((a,ai)=>{
                            const st=symAlarms[a.id]
                            if(!st) return null
                            const active=st?.active===true
                            const bars=st?.bars
                            const col=ALARM_COLORS[ai%ALARM_COLORS.length]
                            const label=bars!=null?String(bars):'?'
                            const blinkN=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.blinkCandles??3}catch(_){return 3}})()
                            const shouldBlink=active&&bars!=null&&bars<=blinkN
                            return(
                              <span key={a.id} title={`${a.name}${active?' · activa'+( bars!=null?' · '+bars+' velas':''): ' · inactiva'}`}
                                style={{
                                  '--bc':col,
                                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                                  width:18,height:18,borderRadius:'50%',flexShrink:0,
                                  background:active?col:'rgba(61,90,122,0.2)',
                                  border:`1.5px solid ${active?col:'#2a3f55'}`,
                                  color:active?'#000':'#3d5a7a',
                                  fontFamily:MONO,fontSize:8,fontWeight:800,lineHeight:1,
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
                  <span style={{fontFamily:MONO,fontSize:12,color:'#a8ccdf',flex:1}}>Alertas &amp; Condiciones</span>
                  <button onClick={newAlarm} title="Nueva condición" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'3px 8px',borderRadius:3,cursor:'pointer'}}>+</button>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {alarmLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}

                  {/* ── ALERTAS DE PRECIO (primero) ── */}
                  {!alarmLoading&&(()=>{
                    const priceAlerts=alarms.filter(a=>a.condition==='price_level')
                    if(!priceAlerts.length) return null
                    return(
                      <div>
                        <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:9,color:'#ffd166',
                          letterSpacing:'0.08em',textTransform:'uppercase',background:'var(--bg2)',
                          borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                          <span>🎯 Alertas de precio</span>
                          <span style={{color:'#3d5a7a'}}>({priceAlerts.length})</span>
                        </div>
                        {priceAlerts.map(a=>{
                          const isAbove=a.condition_detail==='price_above'
                          return(
                            <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                              <span style={{fontSize:14,flexShrink:0,color:isAbove?'#00e5a0':'#ff4d6d',lineHeight:1}}>{isAbove?'▲':'▼'}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontFamily:MONO,fontSize:12,color:'#e8f4ff',fontWeight:700,
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                  {a.symbol} @ <span style={{color:isAbove?'#00e5a0':'#ff4d6d'}}>{a.price_level?.toFixed(2)??'—'}</span>
                                </div>
                                <div style={{fontFamily:MONO,fontSize:10,color:'#5a7a95',
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                              </div>
                              <button onClick={async()=>{await deleteAlarm(a.id);reloadAlarms()}}
                                style={{background:'transparent',border:'none',color:'#ff4d6d',fontSize:14,cursor:'pointer',padding:'0 4px',flexShrink:0}}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* ── CONDICIONES (segundo) ── */}
                  {!alarmLoading&&(()=>{
                    const conditions=alarms.filter(a=>a.condition!=='price_level')
                    return(
                      <div>
                        <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:9,color:'#00d4ff',
                          letterSpacing:'0.08em',textTransform:'uppercase',background:'var(--bg2)',
                          borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                          <span>⚡ Condiciones</span>
                          <span style={{color:'#3d5a7a'}}>({conditions.length})</span>
                        </div>
                        {conditions.length===0&&<div style={{padding:'12px 10px',fontFamily:MONO,fontSize:12,color:'#4a6a80'}}>Sin condiciones. Pulsa + para crear.</div>}
                        {conditions.map((a,ai)=>{
                          const condLabel={
                            ema_cross_up:'EMA rápida > EMA lenta ↑',ema_cross_down:'EMA rápida < EMA lenta ↓',
                            price_above_ema:'Precio cierre > EMA rápida',price_below_ema:'Precio cierre < EMA rápida'
                          }[a.condition]||a.condition
                          const ALARM_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          const col=ALARM_COLORS[ai%ALARM_COLORS.length]
                          const activeCount=watchlist.filter(w=>alarmStatus[w.symbol]?.[a.id]?.active===true).length
                          const totalEval=watchlist.filter(w=>alarmStatus[w.symbol]?.[a.id]!==undefined).length
                          return(
                            <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                              <span style={{width:10,height:10,borderRadius:'50%',flexShrink:0,
                                background:activeCount>0?col:'#2a3f55',
                                boxShadow:activeCount>0?`0 0 6px ${col}`:undefined}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontFamily:MONO,fontSize:12,color:'#e8f4ff',fontWeight:700}}>{a.name}</div>
                                <div style={{fontFamily:MONO,fontSize:11,color:'#b0d0e8',marginTop:1}}>{condLabel} · EMA {a.ema_r}/{a.ema_l}</div>
                                {totalEval>0&&<div style={{fontFamily:MONO,fontSize:11,marginTop:2}}>
                                  <span style={{color:col,fontWeight:600}}>{activeCount} activos</span>
                                  <span style={{color:'#a8ccdf'}}> / {totalEval} evaluados</span>
                                </div>}
                              </div>
                              <button onClick={()=>openEditAlarm(a)} style={{background:'transparent',border:'1px solid var(--border)',color:'#a8ccdf',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:3,cursor:'pointer'}}>✎</button>
                            </div>
                          )
                        })}
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
                      {id:'rotativo',label:'Capital rotativo',ready:false,
                        desc:'Un único pool de capital se asigna a los activos según van generando señales. Al cerrar una posición, el capital liberado vuelve al pool para la siguiente señal. Si hay señales simultáneas, se prioriza por ranking.'},
                      {id:'custom',label:'Pesos personalizados',ready:false,
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
          </aside>

          {/* ── CONTENT ── */}
          <div className="content">
            {/* Single-asset view — oculto cuando multicartera activa */}
            {sidePanel!=='multi'&&!result&&!error&&<div className="loading"><div className="spinner"/><div className="loading-text">CARGANDO DATOS...</div></div>}
            {sidePanel!=='multi'&&error&&<div className="error-msg">⚠ {error}</div>}

            {sidePanel!=='multi'&&result&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
                {/* Columna principal */}
                <div ref={contentRef} style={{flex:1,overflowY:'auto'}}>
                  {/* Gráfico de velas */}
                  <div className="chart-wrap" ref={chartWrapRef}>
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
                  <div className="equity-section">
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
                    <div className="trades-section">
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
                {sidePanel!=='multi'&&metricsLayout==='panel'&&metrics&&(
                  <div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}}>
                    {/* Resize handle — left edge */}
                    <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                      style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                        background:'transparent',transition:'background 0.15s'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                    <div style={{padding:'6px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#b8d8f0',letterSpacing:'0.08em',fontWeight:600,flex:1}}>RESUMEN · {simbolo}</span>
                      <button onClick={()=>setMetricsView(v=>v==='multi'?'single':'multi')}
                        title={metricsView==='multi'?'Vista columna única':'Vista multi-columna'}
                        style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                          border:'1px solid #2a4060',background:'rgba(0,0,0,0.3)',color:'#7aabc8'}}>
                        {metricsView==='multi'?'⊟ 1col':'⊞ 3col'}
                      </button>
                    </div>
                    <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                    <MetricsTable/>
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
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>{mcResult.n} activos · {fmt(mcResult.slotCapital,0,'€')}/slot</span>
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
      {editingAlarm!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditAlarm()}}>
          <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:28,width:380,display:'flex',flexDirection:'column',gap:16,fontFamily:MONO,fontSize:12,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'var(--text)',fontSize:15}}>{editingAlarm.id?'Editar condición':'Nueva condición'}</span>
              <button onClick={closeEditAlarm} style={{background:'transparent',border:'none',color:'var(--text3)',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>

            <label style={{display:'flex',flexDirection:'column',gap:5,color:'var(--text3)'}}>
              Nombre de la condición
              <input type="text" value={alarmForm.name||''} placeholder="Ej: V50 EMA 10/11"
                onChange={e=>setAlarmForm(p=>({...p,name:e.target.value}))}
                style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:13,padding:'8px 12px',borderRadius:4}}/>
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:5,color:'var(--text3)'}}>
              Condición
              <select value={alarmForm.condition||'ema_cross_up'} onChange={e=>setAlarmForm(p=>({...p,condition:e.target.value}))}
                style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'8px 12px',borderRadius:4}}>
                <option value="ema_cross_up">EMA rápida &gt; EMA lenta — alcista ↑</option>
                <option value="ema_cross_down">EMA rápida &lt; EMA lenta — bajista ↓</option>
                <option value="price_above_ema">Precio cierre &gt; EMA rápida</option>
                <option value="price_below_ema">Precio cierre &lt; EMA rápida</option>
              </select>
            </label>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <label style={{display:'flex',flexDirection:'column',gap:5,color:'var(--text3)'}}>
                EMA Rápida
                <input type="number" value={alarmForm.ema_r||10} min={1}
                  onChange={e=>setAlarmForm(p=>({...p,ema_r:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:16,padding:'8px 12px',borderRadius:4,fontWeight:700,textAlign:'center'}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:5,color:'var(--text3)'}}>
                EMA Lenta
                <input type="number" value={alarmForm.ema_l||11} min={1}
                  onChange={e=>setAlarmForm(p=>({...p,ema_l:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d',fontFamily:MONO,fontSize:16,padding:'8px 12px',borderRadius:4,fontWeight:700,textAlign:'center'}}/>
              </label>
            </div>

            <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid var(--border)'}}>
              <button onClick={saveAlarm} disabled={alarmSaving}
                style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'10px',borderRadius:5,cursor:'pointer',fontWeight:600}}>
                {alarmSaving?'Guardando…':'Guardar'}
              </button>
              {editingAlarm.id&&(
                <button onClick={()=>removeAlarm(editingAlarm.id)}
                  style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'10px 14px',borderRadius:5,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ESTRATEGIA — fixed sobre gráfico ══ */}
      {editingStr!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditStr()}}>
          <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:28,width:680,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:12,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'var(--text)',fontSize:15}}>{editingStr.id?'Editar estrategia':'Nueva estrategia'}</span>
              <button onClick={closeEditStr} style={{background:'transparent',border:'none',color:'var(--text3)',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>

            {/* Fila 1: Nombre + Símbolo + Color */}
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10,alignItems:'end'}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Nombre
                <input type="text" value={strForm.name||''} onChange={e=>setStrForm(p=>({...p,name:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Símbolo
                <input type="text" value={strForm.symbol||''} onChange={e=>setStrForm(p=>({...p,symbol:e.target.value.toUpperCase()}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',alignItems:'center'}}>Color
                <input type="color" value={strForm.color||'#00d4ff'} onChange={e=>setStrForm(p=>({...p,color:e.target.value}))} style={{width:38,height:36,padding:2,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg3)',cursor:'pointer'}}/>
              </label>
            </div>

            {/* Separador */}
            <div style={{borderTop:'1px solid var(--border)',marginTop:2}}/>

            {/* Parámetros globales: Años + Capital */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',fontFamily:MONO,fontSize:11}}>Años BT
                <input type="number" value={strForm.years||5} min={1} max={20}
                  onChange={e=>setStrForm(p=>({...p,years:Number(e.target.value)}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)',fontFamily:MONO,fontSize:11}}>Capital (€)
                <input type="number" value={strForm.capital_ini||10000} min={100}
                  onChange={e=>setStrForm(p=>({...p,capital_ini:Number(e.target.value)}))}
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
                        <span style={{color:'var(--text3)',fontSize:10,marginLeft:8}}>{s.symbol} · {s.years}a · {(s.definition?.entry?.type||'legacy').replace(/_/g,' ')}</span>
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
    {settingsOpen&&<SettingsModal onClose={()=>{setSettingsOpen(false);setTemaKey(k=>k+1)}}/>}

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
    </>
  )
}
