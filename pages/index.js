import { useState, useRef, useEffect, useCallback } from 'react'
import Head from 'next/head'

function calcMetrics(trades, capitalIni, capitalReinv, gananciaSimple, ganBH, startDate, endDate, yearsConfig) {
  if (!trades||trades.length===0) return null
  const n=trades.length, wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
  const winRate=(wins.length/n)*100
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0
  const avgLoss=losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length:0
  const totalDias=trades.reduce((s,t)=>s+t.dias,0)
  // Periodo CAGR: usar directamente los años configurados (el backend calcula
  // startDate como exactamente yearsConfig años antes del último dato).
  const safYears = Math.max(Number(yearsConfig) || 5, 0.01)
  const anios = safYears
  // Para "Tiempo invertido" sí usamos fechas reales del calendario
  let totalDiasNat = safYears * 365.25
  if (startDate && endDate) {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
    if (!isNaN(ms) && ms > 0) totalDiasNat = ms / 86400000
  }
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
  const ALLOWED=['name','condition','ema_r','ema_l','active']
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

// ── CandleChart ───────────────────────────────────────────────
function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, labelMode, rulerActive, onChartReady, syncRef, savedRangeRef, chartHeight=480 }) {
  const containerRef=useRef(null), svgRef=useRef(null), legendRef=useRef(null), tooltipRef=useRef(null)
  const chartRef=useRef(null), candlesRef=useRef(null)
  const rulerStart=useRef(null), rulerActiveR=useRef(rulerActive)
  useEffect(()=>{rulerActiveR.current=rulerActive},[rulerActive])

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

      // Líneas de trades — sin title
      trades.forEach(t=>{
        if(!t.entryDate||!t.exitDate) return
        const ls=chart.addLineSeries({color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',lineWidth:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        ls.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.exitPx}])
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
        const mx=(x1+x2)/2,my=(y1+y2)/2
        const label=`${days}d  ${diff>=0?'+':''}${pct.toFixed(2)}%`
        const bw=label.length*7+14
        addC(mk('rect',{x:mx-bw/2,y:my-13,width:bw,height:16,fill:'rgba(8,12,20,0.93)',rx:'3',stroke:'#ffd166','stroke-width':'0.7'}))
        const txt=addC(mk('text',{x:mx,y:my+1,fill:'#ffd166','font-size':'10','font-family':MONO,'text-anchor':'middle','dominant-baseline':'middle'}))
        txt.textContent=label
      }

      const getPoint=(px,py)=>snapToOHLC(px,py,ctrlState.pressed)
      const cnt=containerRef.current
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
      const onClick=e=>{
        if(!rulerActiveR.current)return
        const rect=containerRef.current.getBoundingClientRect()
        const pt=getPoint(e.clientX-rect.left,e.clientY-rect.top)
        if(!rulerStart.current)rulerStart.current=pt;else rulerStart.current=null
      }
      const onDbl=()=>{rulerStart.current=null;clearRuler()}
      cnt.addEventListener('mousemove',onMove)
      cnt.addEventListener('click',onClick)
      cnt.addEventListener('dblclick',onDbl)

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
            const d2=new Date(exitDate); d2.setDate(d2.getDate()+pad)
            chart.timeScale().setVisibleRange({from:d1.toISOString().split('T')[0],to:d2.toISOString().split('T')[0]})
          }catch(_){}
        },
        fitAll:()=>{ try{ chart.timeScale().fitContent() }catch(_){} }
      })

      const ro=new ResizeObserver(()=>{
        if(containerRef.current)chart.applyOptions({width:containerRef.current.clientWidth})
        setTimeout(drawTradeLabels,50)
      })
      ro.observe(containerRef.current)
      setTimeout(drawTradeLabels,200)

      return()=>{cnt.removeEventListener('mousemove',onMove);cnt.removeEventListener('click',onClick);cnt.removeEventListener('dblclick',onDbl);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
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
      if(showStrategy&&strategyCurve?.length)
        chart.addLineSeries({color:'#00d4ff',lineWidth:2,lastValueVisible:false,priceLineVisible:false})
          .setData(strategyCurve.map(p=>({time:p.date,value:p.value})))
      if(showCompound&&compoundCurve?.length)
        chart.addLineSeries({color:'#00e5a0',lineWidth:2,lastValueVisible:false,priceLineVisible:false})
          .setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
      if(showBH&&bhCurve?.length)
        chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false})
          .setData(bhCurve.map(p=>({time:p.date,value:p.value})))
      if(showSP500&&sp500BHCurve?.length)
        chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
      const base=strategyCurve||compoundCurve||bhCurve||sp500BHCurve
      if(base?.length)
        chart.addLineSeries({color:'#3d5a7a',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      const addDD=(curve,date,dd,color,label)=>{
        if(!date||!dd||!curve?.length) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓${label} -${dd.toFixed(1)}%`}])
      }
      if(showStrategy) addDD(strategyCurve,maxDDStrategyDate,maxDDStrategy,'#ff4d6d','DD Est.')
      if(showCompound) addDD(compoundCurve,maxDDCompoundDate,maxDDCompound,'#00a870','DD Comp.')
      if(showBH)       addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c','DD B&H')
      if(showSP500)    addDD(sp500BHCurve,maxDDSP500Date,maxDDSP500,'#7b5fe0','DD SP500')
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
  return <div ref={ref} style={{minHeight:260}}/>
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
      if(showSimple&&simpleCurve?.length) chart.addLineSeries({color:'#00d4ff',lineWidth:2,title:'Simple'}).setData(simpleCurve.map(p=>({time:p.date,value:p.value})))
      if(showCompound&&compoundCurve?.length) chart.addLineSeries({color:'#00e5a0',lineWidth:2,title:'Compuesto'}).setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
      if(showBH&&bhCurve?.length) chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,title:'B&H Divers.'}).setData(bhCurve.map(p=>({time:p.date,value:p.value})))
      if(showSP500&&sp500BHCurve?.length) chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,title:'B&H SP500'}).setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
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

  // ── Multicartera state ──────────────────────────────────────
  const [mcSelected,setMcSelected]=useState([])          // symbols seleccionados
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

  const debounceRef=useRef(null),chartApiRef=useRef(null),contentRef=useRef(null),mcChartApiRef=useRef(null)

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
      .then(data=>setAlarms(data))
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
      name:s.name||'',symbol:s.symbol||'^GSPC',ema_r:s.ema_r||10,ema_l:s.ema_l||11,
      years:s.years||5,capital_ini:s.capital_ini||10000,tipo_stop:s.tipo_stop||'tecnico',
      atr_period:s.atr_period||14,atr_mult:s.atr_mult||1.0,
      sin_perdidas:s.sin_perdidas!==false,reentry:s.reentry!==false,
      tipo_filtro:s.tipo_filtro||'none',sp500_ema_r:s.sp500_ema_r||10,sp500_ema_l:s.sp500_ema_l||11,
      color:s.color||'#00d4ff',observations:s.observations||''
    })
  }
  const closeEditStr=()=>{setEditingStr(null);setStrForm({})}
  const saveEditStr=async()=>{
    setStrSaving(true)
    try{
      await upsertStrategy({...strForm,id:editingStr?.id||undefined})
      reloadStrategies(); closeEditStr()
    }catch(e){alert('Error: '+e.message)}
    finally{setStrSaving(false)}
  }
  const deleteStr=async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await deleteStrategy(id); reloadStrategies()
  }
  const loadStrategy=(s)=>{
    setSimbolo(s.symbol||simbolo)
    setEmaR(s.ema_r);setEmaL(s.ema_l);setYears(s.years)
    setCapitalIni(s.capital_ini);setTipoStop(s.tipo_stop)
    setAtrP(s.atr_period);setAtrM(s.atr_mult)
    setSinPerdidas(s.sin_perdidas);setReentry(s.reentry)
    setTipoFiltro(s.tipo_filtro);setSp500EmaR(s.sp500_ema_r);setSp500EmaL(s.sp500_ema_l)
    setStrForm(f=>({...f,_loadedName:s.name}))
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

  const run=useCallback(async(sym,cfg)=>{
    setLoading(true);setError(null)
    try{
      const res=await fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({simbolo:sym,cfg})})
      const json=await res.json()
      if(!res.ok)throw new Error(json.error||'Error')
      setResult(json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[])

  useEffect(()=>{
    if(debounceRef.current)clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>run(simbolo,{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL)}),800)
    return()=>clearTimeout(debounceRef.current)
  },[simbolo,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,run])

  // ── Multicartera runner ─────────────────────────────────────
  const runMulticartera=useCallback(async()=>{
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
  const sp5=result?.sp500Status
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
        <title>Trading Simulator 2.4</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
        <style>{`
          /* ══ GLOBAL LEGIBILITY v4 ══ */
          :root {
            --text:#eef5ff; --text2:#cce0f8; --text3:#9acce8;
            --bg:#080c14; --bg2:#0a101a; --bg3:#0d1520;
            --border:#1a2d45; --accent:#00d4ff; --green:#00e5a0; --red:#ff4d6d;
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
          .header-sp500-date  { font-size:11px !important; color:#90c4de !important; }
          .status-badge { font-size:11px !important; }
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
            <span className="dot"/>Trading Simulator 2.4
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
              <span className="header-sp500-ema">{fmt(sp5.emaL,2)}</span>
              <span className="header-sp500-date">{fmtDate(sp5.date)}</span>
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
              {[{id:'config',label:'⚙',title:'Configuración'},{id:'watchlist',label:'☰',title:'Watchlist'},{id:'alarms',label:'🔔',title:'Alarmas'},{id:'multi',label:'📊',title:'Multicartera'}].map(tab=>(
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
                            if(s) loadStrategy(s)
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
                    <label>EMA Rápida<input type="number" value={emaR} min={1} max={500} onChange={e=>setEmaR(e.target.value)}/></label>
                    <label>EMA Lenta<input  type="number" value={emaL} min={1} max={500} onChange={e=>setEmaL(e.target.value)}/></label>
                  </div>
                  <div className="row2">
                    <label>Capital (€)<input type="number" value={capitalIni} min={100} onChange={e=>setCapitalIni(e.target.value)}/></label>
                    <label>Años BT<input    type="number" value={years} min={1} max={20} onChange={e=>setYears(e.target.value)}/></label>
                  </div>
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-title">Stop Loss</div>
                  <label>Tipo<select value={tipoStop} onChange={e=>setTipoStop(e.target.value)}><option value="tecnico">Stop Técnico (EMA)</option><option value="atr">Stop ATR</option><option value="none">Ninguno</option></select></label>
                  {tipoStop==='atr'&&<div className="row2"><label>ATR<input type="number" value={atrP} min={1} onChange={e=>setAtrP(e.target.value)}/></label><label>Mult.<input type="number" value={atrM} min={0.1} step={0.1} onChange={e=>setAtrM(e.target.value)}/></label></div>}
                  <label className="checkbox-row"><input type="checkbox" checked={sinPerdidas} onChange={e=>setSinPerdidas(e.target.checked)}/>Sin Pérdidas</label>
                  <label className="checkbox-row"><input type="checkbox" checked={reentry} onChange={e=>setReentry(e.target.checked)}/>Re-Entry</label>
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-title">Filtro SP500</div>
                  <label>Filtro<select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)}><option value="none">Sin filtro</option><option value="precio_ema">Precio sobre EMA rápida</option><option value="ema_ema">EMA rápida sobre EMA lenta</option></select></label>
                  {tipoFiltro!=='none'&&<div className="row2"><label>EMA R<input type="number" value={sp500EmaR} min={1} onChange={e=>setSp500EmaR(e.target.value)}/></label><label>EMA L<input type="number" value={sp500EmaL} min={1} onChange={e=>setSp500EmaL(e.target.value)}/></label></div>}
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
                  <div style={{position:'relative',flex:'0 0 90px'}}>
                    <input type="text" placeholder="🔍" value={wlSearch} onChange={e=>setWlSearch(e.target.value)}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'4px 20px 4px 7px',borderRadius:4,boxSizing:'border-box'}}/>
                    {wlSearch&&<span onClick={()=>setWlSearch('')} style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>
                  {/* Selector de lista */}
                  <div style={{position:'relative',flex:1,minWidth:0}}>
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
                  </div>
                  {/* Filtro favoritos */}
                  <button onClick={()=>setOnlyFavs(f=>!f)} title={onlyFavs?'Mostrando solo favoritos':'Filtrar solo favoritos'}
                    style={{background:onlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${onlyFavs?'#ffd166':'var(--border)'}`,color:onlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
                    ★
                  </button>

                  <button onClick={()=>{setWlSearch('');setSelectedLists([]);setOnlyFavs(false);setSelectedAlarmIds([])}} title="Limpiar todos los filtros" style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:3,cursor:'pointer',flexShrink:0}}>✕</button>
                </div>
                {/* ══ Fila 2: filtro alarmas (chips inline, ancho completo) ══ */}
                {alarms.length>0&&(
                  <div style={{padding:'4px 8px 5px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',flexShrink:0,marginRight:2}}>🔔</span>
                    {alarms.map((a,ai)=>{
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
                    const favs=filtered.filter(w=>w.favorite)
                    const rest=filtered.filter(w=>!w.favorite).sort((a,b)=>a.name.localeCompare(b.name))
                    const all=[...favs,...rest]
                    const totalWl=watchlist.length
                    if(!all.length) return <div style={{padding:'12px',fontFamily:MONO,fontSize:11,color:'#8aadcc'}}>Sin activos para los filtros activos</div>
                    // Count badge above list
                    const countBadge=(
                      <div style={{padding:'3px 10px 3px',fontFamily:MONO,fontSize:12,color:'#a8ccdf',background:'var(--bg2)',borderBottom:'1px solid var(--border)',display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:'#a8c8e8',fontWeight:600}}>{all.length}</span>
                        <span style={{color:'#8abcd4'}}>de</span>
                        <span style={{color:'#a8c8e8',fontWeight:600}}>{totalWl}</span>
                        <span style={{color:'#8abcd4'}}>activos</span>
                        {filtered.length<totalWl&&<span style={{marginLeft:'auto',color:'#ffd166',fontSize:11}}>{totalWl-filtered.length} filtrado{totalWl-filtered.length!==1?'s':''}</span>}
                      </div>
                    )
                    return (<>{countBadge}{all.map(w=>(
                      <div key={w.id||w.symbol}
                        style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)',background:simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}>
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
                          const symAlarms=alarmStatus[w.symbol]
                          if(!symAlarms) return null
                          const ALARM_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          return alarms.map((a,ai)=>{
                            const st=symAlarms[a.id]
                            if(!st) return null
                            const active=st?.active===true
                            const bars=st?.bars
                            const col=ALARM_COLORS[ai%ALARM_COLORS.length]
                            const label=bars!=null?String(bars):'?'
                            return(
                              <span key={a.id} title={`${a.name}${active?' · activa'+( bars!=null?' · '+bars+' velas':''): ' · inactiva'}`}
                                style={{
                                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                                  width:18,height:18,borderRadius:'50%',flexShrink:0,
                                  background:active?col:'rgba(61,90,122,0.2)',
                                  border:`1.5px solid ${active?col:'#2a3f55'}`,
                                  color:active?'#000':'#3d5a7a',
                                  fontFamily:MONO,fontSize:8,fontWeight:800,lineHeight:1,
                                  boxShadow:active?`0 0 6px ${col}55`:undefined,
                                  cursor:'default',
                                }}>
                                {active?label:''}
                              </span>
                            )
                          })
                        })()}
                        {/* Lista badge */}
                        <span style={{fontFamily:MONO,fontSize:8,color:'#7fb8d8',background:'var(--bg2)',padding:'1px 4px',borderRadius:2,flexShrink:0}}>{w.list_name||'General'}</span>
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
                <div style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:12,color:'#a8ccdf',flex:1}}>Condiciones / Alarmas</span>
                  <button onClick={newAlarm} title="Nueva alarma" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'3px 8px',borderRadius:3,cursor:'pointer'}}>+</button>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {alarmLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!alarmLoading&&!alarms.length&&<div style={{padding:'14px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>Sin alarmas. Pulsa + para crear una.</div>}
                  {!alarmLoading&&alarms.map((a,ai)=>{
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
                        {/* Dot indicador con color de alarma */}
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
              </div>
            )}

            {/* ══ PANEL MULTICARTERA ══ */}
            {sidePanel==='multi'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflowY:'auto'}}>
                {/* Botón ejecutar — fijado arriba */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0}}>
                  {mcSelected.length>=2?(
                    <button onClick={runMulticartera} disabled={mcLoading}
                      style={{width:'100%',fontFamily:MONO,fontSize:11,padding:'7px 10px',borderRadius:4,cursor:mcLoading?'wait':'pointer',
                        background:mcLoading?'rgba(0,212,255,0.05)':'rgba(0,212,255,0.15)',
                        border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700,letterSpacing:'0.05em'}}>
                      {mcLoading?'⟳ Calculando...':'▶ EJECUTAR MULTICARTERA'}
                    </button>
                  ):(
                    <button disabled style={{width:'100%',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4,cursor:'not-allowed',
                      background:'transparent',border:'1px solid #2a3f55',color:'#7aabc8',letterSpacing:'0.05em'}}>
                      ▶ EJECUTAR — selecciona 2+
                    </button>
                  )}
                  {mcError&&<div style={{fontFamily:MONO,fontSize:12,color:'#ff4d6d',marginTop:5}}>⚠ {mcError}</div>}
                </div>

                {/* Modo de asignación */}
                <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',marginBottom:6,letterSpacing:'0.05em',fontWeight:600}}>MODO DE ASIGNACIÓN</div>
                  {[
                    {id:'slots',label:'Slots iguales',desc:'Capital dividido en N partes fijas',ready:true},
                    {id:'rotativo',label:'Capital rotativo',desc:'Próximamente',ready:false},
                    {id:'custom',label:'Pesos personalizados',desc:'Próximamente',ready:false},
                  ].map(m=>(
                    <div key={m.id} onClick={()=>m.ready&&setMcMode(m.id)}
                      style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 8px',borderRadius:4,marginBottom:3,
                        background:mcMode===m.id?'rgba(0,212,255,0.08)':'transparent',
                        border:`1px solid ${mcMode===m.id?'var(--accent)':'var(--border)'}`,
                        cursor:m.ready?'pointer':'not-allowed',opacity:m.ready?1:0.45}}>
                      <div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${mcMode===m.id?'var(--accent)':'#3d5a7a'}`,
                        background:mcMode===m.id?'var(--accent)':'transparent',flexShrink:0,marginTop:1}}/>
                      <div>
                        <div style={{fontFamily:MONO,fontSize:12,color:mcMode===m.id?'var(--accent)':'#c8dff5',fontWeight:600}}>
                          {m.label}{!m.ready&&<span style={{fontSize:8,color:'#ffd166',marginLeft:5,verticalAlign:'middle'}}>⏳</span>}
                        </div>
                        <div style={{fontFamily:MONO,fontSize:12,color:'#6a8caa',marginTop:1}}>{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selector de activos */}
                <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',flex:1,overflowY:'auto',minHeight:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#cde5ff',letterSpacing:'0.05em',fontWeight:700}}>ACTIVOS ({mcSelected.length} sel.)</div>
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
                  {watchlist.map(w=>{
                    const sel=mcSelected.includes(w.symbol)
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
                        {w.favorite&&<span style={{color:'#ffd166',fontSize:12}}>★</span>}
                      </div>
                    )
                  })}
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
                        {rulerOn&&<span style={{fontFamily:MONO,fontSize:10,color:'#ffd166'}}>📏 Regla ON · Ctrl=imán · dbl-clic=borrar</span>}
                        {/* Botón Fit All */}
                        <button onClick={()=>chartApiRef.current?.fitAll()}
                          title="Ver período completo de la estrategia"
                          style={{background:'rgba(0,212,255,0.08)',border:'1px solid #1e3a52',color:'#00d4ff',fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'}}>
                          ⊞ Todo
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
          <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:28,width:520,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:12,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
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
            <div style={{fontWeight:600,color:'var(--text3)',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase'}}>Parámetros EMAs</div>

            {/* Fila 2: EMAs + Años + Capital */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Rápida
                <input type="number" value={strForm.ema_r||10} onChange={e=>setStrForm(p=>({...p,ema_r:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'7px 10px',borderRadius:4,fontWeight:600}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Lenta
                <input type="number" value={strForm.ema_l||11} onChange={e=>setStrForm(p=>({...p,ema_l:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ff4d6d',fontFamily:MONO,fontSize:13,padding:'7px 10px',borderRadius:4,fontWeight:600}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Años BT
                <input type="number" value={strForm.years||5} onChange={e=>setStrForm(p=>({...p,years:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Capital (€)
                <input type="number" value={strForm.capital_ini||10000} onChange={e=>setStrForm(p=>({...p,capital_ini:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
              </label>
            </div>

            {/* Fila 3: Stop + Filtro + checkboxes */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Stop Loss
                <select value={strForm.tipo_stop||'tecnico'} onChange={e=>setStrForm(p=>({...p,tipo_stop:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                  <option value="tecnico">Técnico (EMA)</option>
                  <option value="atr">ATR</option>
                  <option value="none">Sin stop</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Filtro SP500
                <select value={strForm.tipo_filtro||'none'} onChange={e=>setStrForm(p=>({...p,tipo_filtro:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                  <option value="none">Sin filtro</option>
                  <option value="precio_ema">Precio sobre EMA rápida</option>
                  <option value="ema_ema">EMA rápida sobre EMA lenta</option>
                </select>
              </label>
            </div>
            {strForm.tipo_filtro!=='none'&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>SP500 EMA R
                  <input type="number" value={strForm.sp500_ema_r||10} onChange={e=>setStrForm(p=>({...p,sp500_ema_r:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
                </label>
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>SP500 EMA L
                  <input type="number" value={strForm.sp500_ema_l||11} onChange={e=>setStrForm(p=>({...p,sp500_ema_l:Number(e.target.value)}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}/>
                </label>
              </div>
            )}
            <div style={{display:'flex',gap:20}}>
              <label style={{display:'flex',alignItems:'center',gap:8,color:'var(--text3)',cursor:'pointer'}}>
                <input type="checkbox" checked={strForm.sin_perdidas!==false} onChange={e=>setStrForm(p=>({...p,sin_perdidas:e.target.checked}))} style={{width:14,height:14}}/>
                Sin Pérdidas
              </label>
              <label style={{display:'flex',alignItems:'center',gap:8,color:'var(--text3)',cursor:'pointer'}}>
                <input type="checkbox" checked={strForm.reentry!==false} onChange={e=>setStrForm(p=>({...p,reentry:e.target.checked}))} style={{width:14,height:14}}/>
                Re-Entry
              </label>
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
                        <span style={{color:'var(--text3)',fontSize:10,marginLeft:8}}>EMA {s.ema_r}/{s.ema_l} · {s.years}a · {s.symbol}</span>
                      </div>
                      <button onClick={()=>openEditStr(s)} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>✎</button>
                      <button onClick={()=>duplicateStr(s)} title="Duplicar" style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>⎘</button>
                      <button onClick={()=>{loadStrategy(s);closeEditStr()}} style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer'}}>▶</button>
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
    </>
  )
}
