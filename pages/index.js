import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react'
import Head from 'next/head'
import { ListFilter, Briefcase, Star, Bell, X as LucideX } from 'lucide-react'
import { calcMetrics, MONO, fmt, fmtDate, f2, tvSym } from '../lib/utils'
import { WATCHLIST_DEFAULT } from '../lib/constants'
import { getSupaUrl, getSupaKey, getSupaH, setCurrentJwt, getCurrentJwt } from '../lib/supabase'
import { loadSettings, saveSettings, saveSettingsRemote, loadSettingsRemote } from '../lib/settings'
import { supabase } from '../lib/supabaseClient'
import { fetchConditions, lsGetConds, lsSaveConds, COND_LS_KEY } from '../lib/conditions'
import CandleChart from '../components/CandleChart'
import EquityChart from '../components/EquityChart'
import Tip from '../components/Tip'
import SettingsModal from '../components/SettingsModal'
import { MultiCartChart, OccupancyBarChart, McOccupancyChart, StratCompareChart, AssetSignalChart } from '../components/BacktestCharts'
import dynamic from 'next/dynamic'
const McMonthlyGainsChart = dynamic(() => import('../components/McMonthlyGainsChart'), { ssr: false })
import { TlEquityChart, TlInvestChart } from '../components/TlCharts'
import ContextThemeMenu, { applyTema } from '../components/ContextThemeMenu'
import { exportTimeline, exportGantt, exportHistorial } from '../lib/exportTimeline'
import GanttChart from '../components/GanttChart'
import MetricRow from '../components/MetricRow'
import PriceAlarmQuickForm from '../components/PriceAlarmQuickForm'
import StrategiesManager from '../components/StrategiesManager'
import StrategyEditorPanel from '../components/StrategyEditorPanel'
import WatchlistCondPanel from '../components/WatchlistCondPanel'
import WatchlistManager from '../components/WatchlistManager'
import StrategyManager from '../components/StrategyManager'


// ── FIFO computation for TradeLog ─────────────────────────────
// fills: array of fill objects (BUY/SELL). prices: {symbol:{price}} live prices.
// Returns { openPositions, closedTrades, fillStatus }
function computeFifo(fills, prices={}) {
  const bySymbol = {}
  ;[...fills]
    .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.created_at||a.id||'').localeCompare(b.created_at||b.id||''))
    .forEach(f=>{ if(!bySymbol[f.symbol]) bySymbol[f.symbol]=[]; bySymbol[f.symbol].push(f) })
  const openPositions=[], closedTrades=[], fillStatus={}, trades=[]
  Object.entries(bySymbol).forEach(([symbol, symFills])=>{
    const buyQueue=[]  // {fill, remaining, orig}
    let tradeIdx=0
    // cur: acumulador del ciclo abierto actual (BUYs hasta que posición vuelve a 0)
    let cur=null
    const newCur=()=>({
      _buyFills:[], _sellFills:[],
      _wBuyPxSh:0, _totalBuySh:0,
      _wBuyFxCap:0, _totalBuyCap:0,
      _wSellPxSh:0, _totalSellSh:0,
      _wSellFxCap:0, _totalSellCap:0,
      _pnlEur:0, _totalComm:0,
      _firstBuyDate:null, _lastSellDate:null,
      _broker:null, _strategy:null, _currency:null,
    })
    symFills.forEach(f=>{
      const shares=parseFloat(f.shares||0)
      const price=parseFloat(f.price||0)
      const comm=parseFloat(f.commission||0)
      let fx=parseFloat(f.fx||1); if(fx>0&&fx<1) fx=1/fx; if(!fx||isNaN(fx)) fx=1
      if(f.fill_type==='buy'){
        if(!buyQueue.length) cur=newCur()
        buyQueue.push({fill:f, remaining:shares, orig:shares})
        fillStatus[f.id]='open'
        cur._buyFills.push({id:f.id, date:f.date, shares, price, commission:comm, fill_type:'buy', fx:f.fx, currency:f.currency, symbol:f.symbol, broker:f.broker, strategy:f.strategy, notes:f.notes, import_source:f.import_source})
        cur._wBuyPxSh+=price*shares; cur._totalBuySh+=shares
        cur._wBuyFxCap+=fx*price*shares; cur._totalBuyCap+=price*shares
        cur._totalComm+=comm
        if(!cur._firstBuyDate||f.date<cur._firstBuyDate) cur._firstBuyDate=f.date
        cur._broker=cur._broker||f.broker; cur._strategy=cur._strategy||f.strategy; cur._currency=cur._currency||f.currency
      } else if(f.fill_type==='sell'){
        fillStatus[f.id]='sell'
        if(!buyQueue.length){
          // SELL sin BUY correspondiente → orphan
          trades.push({id:'orphan_'+f.id, symbol, status:'orphan',
            entry_date:null, entry_price:null, fx_entry:null,
            exit_date:f.date, exit_price:price,
            shares, commission:comm, currency:f.currency||'USD',
            broker:f.broker, strategy:f.strategy,
            pnl_eur:null, pnl_pct:null, _pnl_float_eur:null, _pnl_float_pct:null,
            _buyFills:[], _sellFills:[{id:f.id, date:f.date, shares, price, commission:comm, fill_type:'sell'}]})
          return
        }
        cur._sellFills.push({id:f.id, date:f.date, shares, price, commission:comm, fill_type:'sell', fx:f.fx, currency:f.currency, symbol:f.symbol, broker:f.broker, strategy:f.strategy, notes:f.notes, import_source:f.import_source})
        cur._totalComm+=comm
        if(!cur._lastSellDate||f.date>cur._lastSellDate) cur._lastSellDate=f.date
        cur._currency=cur._currency||f.currency
        let sellRem=shares
        while(sellRem>0.001&&buyQueue.length>0){
          const lot=buyQueue[0]
          const matched=Math.min(lot.remaining, sellRem)
          const buyPx=parseFloat(lot.fill.price||0)
          let buyFx=parseFloat(lot.fill.fx||1); if(buyFx>0&&buyFx<1) buyFx=1/buyFx; if(!buyFx||isNaN(buyFx)) buyFx=1
          const pnlEur=(price*matched/fx)-(buyPx*matched/buyFx)
          const pnlPct=buyPx>0?(price/buyPx-1)*100:0
          const buyComm=lot.orig>0?parseFloat(lot.fill.commission||0)/lot.orig*matched:0
          const sellComm=shares>0?comm/shares*matched:0
          cur._wSellPxSh+=price*matched; cur._totalSellSh+=matched; cur._pnlEur+=pnlEur
          cur._wSellFxCap+=fx*price*matched; cur._totalSellCap+=price*matched
          closedTrades.push({
            symbol, shares:matched,
            pnl_eur:parseFloat(pnlEur.toFixed(4)),
            pnl_pct:parseFloat(pnlPct.toFixed(4)),
            commission:parseFloat((buyComm+sellComm).toFixed(4)),
            entry_date:lot.fill.date, exit_date:f.date,
            broker:lot.fill.broker||f.broker, strategy:lot.fill.strategy||f.strategy,
            currency:f.currency||lot.fill.currency,
            entry_price:buyPx, exit_price:price, fx_entry:buyFx,
            status:'closed',
          })
          lot.remaining-=matched; sellRem-=matched
          if(lot.remaining<=0.001){ fillStatus[lot.fill.id]='closed'; buyQueue.shift() }
          else fillStatus[lot.fill.id]='partial'
        }
        // Si quedan shares sin cubrir → posible split
        if(sellRem>0.001&&cur) cur._possibleSplit=true
        if(!buyQueue.length){
          // Posición cerrada completamente → emitir trade
          const entryPx=cur._totalBuySh>0?cur._wBuyPxSh/cur._totalBuySh:0
          const fxE=cur._totalBuyCap>0?cur._wBuyFxCap/cur._totalBuyCap:1
          const fxX=cur._totalSellCap>0?cur._wSellFxCap/cur._totalSellCap:fxE
          const exitPx=cur._totalSellSh>0?cur._wSellPxSh/cur._totalSellSh:0
          const pnlPct=entryPx>0?(exitPx/entryPx-1)*100:0
          trades.push({id:'trade_'+symbol+'_'+tradeIdx++, symbol, status:'closed',
            entry_date:cur._firstBuyDate, entry_price:parseFloat(entryPx.toFixed(4)), fx_entry:parseFloat(fxE.toFixed(4)),
            exit_date:cur._lastSellDate, exit_price:parseFloat(exitPx.toFixed(4)), fx_exit:parseFloat(fxX.toFixed(4)),
            shares:parseFloat(cur._totalSellSh.toFixed(4)),
            commission:parseFloat(cur._totalComm.toFixed(4)),
            currency:cur._currency||'USD', broker:cur._broker, strategy:cur._strategy,
            pnl_eur:parseFloat(cur._pnlEur.toFixed(4)), pnl_pct:parseFloat(pnlPct.toFixed(4)),
            _pnl_float_eur:null, _pnl_float_pct:null,
            _buyFills:cur._buyFills, _sellFills:cur._sellFills,
            _possibleSplit:cur._possibleSplit||false})
          cur=null
        }
      }
    })
    if(buyQueue.length>0){
      const openShares=buyQueue.reduce((s,l)=>s+l.remaining,0)
      const avgBuyPx=openShares>0?buyQueue.reduce((s,l)=>s+parseFloat(l.fill.price||0)*l.remaining,0)/openShares:0
      const openCap=buyQueue.reduce((s,l)=>s+parseFloat(l.fill.price||0)*l.remaining,0)
      let fxE=openCap>0?buyQueue.reduce((s,l)=>{let fx=parseFloat(l.fill.fx||1);if(fx>0&&fx<1)fx=1/fx;if(!fx||isNaN(fx))fx=1;return s+fx*parseFloat(l.fill.price||0)*l.remaining},0)/openCap:1
      const livePx=prices[symbol]?.price?parseFloat(prices[symbol].price):null
      const floatEur=livePx!=null?(livePx-avgBuyPx)*openShares/fxE:0
      const floatPct=livePx!=null&&avgBuyPx>0?(livePx/avgBuyPx-1)*100:0
      const openComm=buyQueue.reduce((s,l)=>s+(l.orig>0?parseFloat(l.fill.commission||0)/l.orig*l.remaining:0),0)
      openPositions.push({
        symbol, shares:openShares, entry_price:avgBuyPx,
        entry_date:buyQueue[0].fill.date,
        currency:buyQueue[0].fill.currency||'USD', fx_entry:fxE,
        broker:buyQueue[0].fill.broker, strategy:buyQueue[0].fill.strategy,
        commission:openComm,
        _pnl_float_eur:parseFloat(floatEur.toFixed(4)),
        _pnl_float_pct:parseFloat(floatPct.toFixed(4)),
        status:'open',
      })
      buyQueue.forEach(l=>{ if(fillStatus[l.fill.id]!=='partial') fillStatus[l.fill.id]='open' })
      if(cur){
        // Posición abierta: entry_price = avg de los lotes restantes (costo real)
        trades.push({id:'trade_'+symbol+'_'+tradeIdx++, symbol, status:'open',
          entry_date:cur._firstBuyDate, entry_price:parseFloat(avgBuyPx.toFixed(4)), fx_entry:parseFloat(fxE.toFixed(4)),
          exit_date:null, exit_price:livePx!=null?parseFloat(livePx.toFixed(2)):null,
          shares:parseFloat(openShares.toFixed(4)),
          commission:parseFloat(cur._totalComm.toFixed(4)),
          currency:cur._currency||'USD', broker:cur._broker, strategy:cur._strategy,
          pnl_eur:null, pnl_pct:null,
          _pnl_float_eur:parseFloat(floatEur.toFixed(4)), _pnl_float_pct:parseFloat(floatPct.toFixed(4)),
          _buyFills:cur._buyFills, _sellFills:cur._sellFills,
          _possibleSplit:cur._possibleSplit||false})
      }
    }
  })
  return {openPositions, closedTrades, fillStatus, trades}
}

// ── Buy & Hold SP500 reference curve ──
function computeBuyAndHold(contributions, priceHistory) {
  if (!contributions?.length || !priceHistory?.length) return []
  const aportaciones = contributions
    .filter(c => c.type === 'aportacion')
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  if (!aportaciones.length) return []
  let units = 0, capitalInvertido = 0, pendingIdx = 0
  const result = []
  for (const day of priceHistory) {
    const sp500Eur = day.sp500_usd / day.eur_usd
    while (pendingIdx < aportaciones.length && aportaciones[pendingIdx].date <= day.date) {
      const amount = parseFloat(aportaciones[pendingIdx].amount || 0)
      if (sp500Eur > 0) units += amount / sp500Eur
      capitalInvertido += amount
      pendingIdx++
    }
    if (units === 0) continue
    result.push({ date: day.date, value: units * sp500Eur - capitalInvertido, capitalAcum: capitalInvertido })
  }
  return result
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



// ── Watchlist helpers ──────────────────────────────────────────
// Decode the user UUID (sub) from the current JWT without a library
function getUidFromJwt() {
  const jwt=getCurrentJwt(); if(!jwt) return null
  try{ return JSON.parse(atob(jwt.split('.')[1])).sub||null }catch(_){ return null }
}

// ── Watchlist API ─────────────────────────────────────────────
async function fetchWatchlist() {
  const [itemsRes,membersRes]=await Promise.all([
    fetch(`${getSupaUrl()}/rest/v1/watchlist?order=favorite.desc,name.asc`,{headers:getSupaH()}),
    fetch(`${getSupaUrl()}/rest/v1/watchlist_list_members?select=watchlist_id,list_id`,{headers:getSupaH()})
  ])
  if(!itemsRes.ok) throw new Error('Error cargando watchlist')
  const items=await itemsRes.json()
  const members=membersRes.ok?await membersRes.json():[]
  const byItem={}
  for(const m of members){if(!byItem[m.watchlist_id])byItem[m.watchlist_id]=[];byItem[m.watchlist_id].push(m.list_id)}
  return items.map(item=>({...item,list_ids:byItem[item.id]||[]}))
}
async function fetchWatchlistLists() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist_lists?order=name.asc`,{headers:getSupaH()})
  if(!res.ok) return []
  return await res.json()
}
async function upsertWatchlistItem(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/watchlist?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/watchlist`
  // Limpiar campos internos y campos no existentes en la tabla
  const ALLOWED=['symbol','name','group_name','position','active','favorite','observations']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando: '+t)}
  return (await res.json())[0]
}
async function setItemLists(itemId,listIds) {
  // Delete existing memberships for this item, then insert the new set
  await fetch(`${getSupaUrl()}/rest/v1/watchlist_list_members?watchlist_id=eq.${itemId}`,{method:'DELETE',headers:getSupaH()})
  if(listIds.length>0){
    await fetch(`${getSupaUrl()}/rest/v1/watchlist_list_members`,{
      method:'POST',headers:{...getSupaH(),'Prefer':'return=minimal'},
      body:JSON.stringify(listIds.map(list_id=>({watchlist_id:itemId,list_id})))})
  }
}
async function createWatchlistList(name) {
  // user_id must be explicit — watchlist_lists has no DEFAULT auth.uid()
  const uid=getUidFromJwt()
  const body=uid?{name,user_id:uid}:{name}
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist_lists`,{
    method:'POST',headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error creando lista: '+t)}
  return (await res.json())[0]
}
async function deleteWatchlistItem(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
  if(!res.ok) throw new Error('Error eliminando')
}
async function renameWatchlistList(listId,newName) {
  // Renames by list id in watchlist_lists table
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist_lists?id=eq.${listId}`,{
    method:'PATCH',headers:{...getSupaH(),'Prefer':'return=minimal'},body:JSON.stringify({name:newName})})
  if(!res.ok){const t=await res.text();throw new Error('Error renombrando lista: '+t)}
}
async function deleteWatchlistList(listId) {
  // Deleting watchlist_lists cascades to watchlist_list_members automatically
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist_lists?id=eq.${listId}`,{
    method:'DELETE',headers:getSupaH()})
  if(!res.ok){const t=await res.text();throw new Error('Error eliminando lista: '+t)}
}

// ── Ranking results API ───────────────────────────────────────
async function saveRankingRemote(rankingData, stratId) {
  // 1 — Borrar filas anteriores del cálculo para esta estrategia
  //     Evita rangos duplicados de runs anteriores con distintos subconjuntos
  const deleteFilter = stratId
    ? `strategy_id=eq.${stratId}`
    : `strategy_id=is.null`
  await fetch(`${getSupaUrl()}/rest/v1/ranking_results?${deleteFilter}`, {
    method: 'DELETE', headers: getSupaH()
  }).catch(()=>{}) // ignorar errores de borrado (tabla vacía, sin permisos, etc.)

  // 2 — Insertar los nuevos resultados
  const rows = Object.entries(rankingData).map(([symbol, rd]) => ({
    symbol,
    strategy_id:     stratId || null,
    win_rate:        rd.metrics?.winRate  ?? null,
    cagr_simple:     rd.metrics?.cagr     ?? null,
    max_drawdown:    rd.metrics?.maxDD    ?? null,
    total_trades:    rd.metrics?.trades   ?? null,
    profit_simple:   rd.profitSimple      ?? null,
    score:           rd.score             ?? null,
    score_historico: rd.scoreHistorico    ?? null,
    score_completo:  rd.scoreCompleto     ?? null,
    rank_position:   rd.rank             ?? null,
    updated_at:      new Date().toISOString(),
  }))
  let missingCols = new Set()   // columnas que la DB no tiene aún
  for (let i=0; i<rows.length; i+=20) {
    const batch = rows.slice(i, i+20)
    const cleanBatch = (b) => b.map(r => {
      const out = {...r}
      if (missingCols.has('score_historico')) delete out.score_historico
      if (missingCols.has('score_completo'))  delete out.score_completo
      if (missingCols.has('profit_simple'))   delete out.profit_simple
      return out
    })
    const res = await fetch(`${getSupaUrl()}/rest/v1/ranking_results`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Type': 'application/json' },
      body: JSON.stringify(cleanBatch(batch))
    })
    if (!res.ok) {
      const txt = await res.text().catch(()=>'')
      const wasMissing = missingCols.size
      if (txt.includes('score_historico')) {
        console.warn('[Ranking] Columna score_historico no existe. SQL:\nALTER TABLE ranking_results ADD COLUMN IF NOT EXISTS score_historico numeric;')
        missingCols.add('score_historico')
      }
      if (txt.includes('score_completo')) {
        console.warn('[Ranking] Columna score_completo no existe. SQL:\nALTER TABLE ranking_results ADD COLUMN IF NOT EXISTS score_completo numeric;')
        missingCols.add('score_completo')
      }
      if (txt.includes('profit_simple')) {
        console.warn('[Ranking] Columna profit_simple no existe. SQL:\nALTER TABLE ranking_results ADD COLUMN IF NOT EXISTS profit_simple numeric;')
        missingCols.add('profit_simple')
      }
      if (missingCols.size > wasMissing) {
        // retry without the missing columns
        await fetch(`${getSupaUrl()}/rest/v1/ranking_results`, {
          method: 'POST',
          headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal',
            'Content-Type': 'application/json' },
          body: JSON.stringify(cleanBatch(batch))
        }).catch(()=>{})
      }
    }
  }
}
async function loadRankingRemote(stratId) {
  const base = stratId
    ? `${getSupaUrl()}/rest/v1/ranking_results?strategy_id=eq.${stratId}&order=rank_position.asc`
    : `${getSupaUrl()}/rest/v1/ranking_results?order=rank_position.asc`
  // Intentar con score_completo y updated_at; fallback si no existen
  let res = await fetch(base + '&select=*', { headers: getSupaH() })
  if (!res.ok) res = await fetch(base, { headers: getSupaH() })
  if (!res.ok) return null
  const rows = await res.json()
  if (!rows?.length) return null
  const out = {}
  rows.forEach(r => {
    out[(r.symbol||'').toUpperCase()] = {
      score:          r.score,
      scoreHistorico: r.score_historico ?? null,
      scoreCompleto:  r.score_completo  ?? null,
      updatedAt:      r.updated_at      ?? null,
      rank:           r.rank_position,
      metrics: { winRate: r.win_rate, cagr: r.cagr_simple, maxDD: r.max_drawdown, trades: r.total_trades, profit: r.profit_simple ?? null }
    }
  })
  return out
}

async function loadAllRankingsRemote() {
  // Carga TODOS los resultados de ranking (todas las estrategias) para computar
  // la mejor estrategia por símbolo. Incluye métricas para filtrar candidatos con datos completos.
  let url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,score_completo,updated_at,cagr_simple,win_rate,max_drawdown&order=score_historico.desc.nullslast&limit=5000`
  let res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) {
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,cagr_simple,win_rate,max_drawdown&order=score_historico.desc.nullslast&limit=5000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) {
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico&order=score_historico.desc.nullslast&limit=5000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) {
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score&limit=5000`
    res = await fetch(url, { headers: getSupaH() })
    if (!res.ok) return null
  }
  const rows = await res.json()
  if (!rows?.length) return null
  return rows
}

// Limpia filas corruptas: tienen score_historico pero sin métricas (cagr_simple IS NULL)
async function cleanCorruptRankingRows() {
  if (!getSupaUrl()) return
  try {
    await fetch(`${getSupaUrl()}/rest/v1/ranking_results?cagr_simple=is.null&score_historico=not.is.null`, {
      method: 'DELETE', headers: { ...getSupaH(), 'Prefer': 'return=minimal' }
    })
  } catch(_) {} // ignorar errores silenciosamente
}

// Nullifica scores (score_historico, score_completo, score) para una lista de símbolos
async function nullifyScoresRemote(symbols) {
  if (!getSupaUrl() || !symbols?.length) return
  const filter = `symbol=in.(${symbols.join(',')})`
  await fetch(`${getSupaUrl()}/rest/v1/ranking_results?${filter}`, {
    method: 'PATCH',
    headers: { ...getSupaH(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ score_historico: null, score_completo: null, score: null })
  }).catch(() => {})
}

// Borra TODAS las filas de ranking_results para una lista de símbolos (todas las estrategias)
async function deleteMetricsRemote(symbols) {
  if (!getSupaUrl() || !symbols?.length) return
  const filter = `symbol=in.(${symbols.join(',')})`
  await fetch(`${getSupaUrl()}/rest/v1/ranking_results?${filter}`, {
    method: 'DELETE', headers: getSupaH()
  }).catch(() => {})
}

// Upsert parcial: actualiza SOLO score_historico (sin tocar métricas ni score_completo)
async function upsertScoreHistoricoRemote(scoreMap, stratId) {
  if (!getSupaUrl()) return
  const rows = Object.entries(scoreMap).map(([symbol, sh]) => ({
    symbol, strategy_id: stratId||null, score_historico: sh, updated_at: new Date().toISOString()
  }))
  for (let i=0; i<rows.length; i+=20) {
    await fetch(`${getSupaUrl()}/rest/v1/ranking_results?on_conflict=symbol,strategy_id`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(rows.slice(i, i+20))
    }).catch(()=>{})
  }
}

// Upsert parcial: actualiza SOLO score_completo (sin tocar métricas ni score_historico)
async function upsertScoreCompletoRemote(scoreMap, stratId) {
  if (!getSupaUrl()) return
  const rows = Object.entries(scoreMap).map(([symbol, sc]) => ({
    symbol, strategy_id: stratId||null, score_completo: sc, updated_at: new Date().toISOString()
  }))
  for (let i=0; i<rows.length; i+=20) {
    await fetch(`${getSupaUrl()}/rest/v1/ranking_results?on_conflict=symbol,strategy_id`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(rows.slice(i, i+20))
    }).catch(()=>{})
  }
}

// Upsert parcial: actualiza SOLO métricas (sin tocar score_historico ni score_completo)
async function upsertMetricsRemote(metricsMap, stratId) {
  if (!getSupaUrl()) return
  const rows = Object.entries(metricsMap).map(([symbol, m]) => ({
    symbol, strategy_id: stratId||null,
    win_rate: m.winRate??null, cagr_simple: m.cagr??null,
    max_drawdown: m.maxDD??null, total_trades: m.trades??null,
    profit_simple: m.profit??null, updated_at: new Date().toISOString()
  }))
  for (let i=0; i<rows.length; i+=20) {
    const res = await fetch(`${getSupaUrl()}/rest/v1/ranking_results?on_conflict=symbol,strategy_id`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(rows.slice(i, i+20))
    }).catch(()=>null)
    if (res && !res.ok) {
      const errText = await res.text().catch(()=>'')
      console.error('[upsertMetricsRemote] HTTP', res.status, errText.slice(0,200))
    }
  }
}

// ── Strategies API ────────────────────────────────────────────
async function fetchStrategies() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/strategies?active=eq.true&order=name.asc`,{headers:getSupaH()})
  if(!res.ok) throw new Error('Error cargando estrategias')
  return await res.json()
}
async function upsertStrategy(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/strategies?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/strategies`
  // Only send known DB columns — strip any UI-only keys (prefixed with _)
  const ALLOWED=['name','years','capital_ini','allocation_pct','color','observations','active',
    'description','summary','code_js','params','visuals','enabled']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error(`Error guardando estrategia: ${t}`)}
  return (await res.json())[0]
}
async function deleteStrategy(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/strategies?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
  if(!res.ok) throw new Error('Error eliminando estrategia')
}


// ── Alarms API ───────────────────────────────────────────────
async function fetchAlarms() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/alarms?active=eq.true&order=symbol.asc`,{headers:getSupaH()})
  if(!res.ok) throw new Error('Error cargando alarmas')
  return await res.json()
}
async function upsertAlarm(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/alarms?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/alarms`
  const ALLOWED=['name','symbol','condition','condition_detail','price_level','ema_r','ema_l','active']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando alarma: '+t)}
  return (await res.json())[0]
}
async function deleteAlarm(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/alarms?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
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




// ── MultiCartChart ───────────────────────────────────────────
const STRAT_COMPARE_COLORS=['#00d4ff','#ffd166','#00e5a0','#ff6b9d','#9b72ff','#ff9a3c','#4ecdc4','#c8f7c5']





// ── StrategyBuilder — constructor jerárquico de 8 pasos ───────
// Cada paso tiene número, título, descripción y controles específicos.






// apiFetch — wrapper de fetch que añade el JWT activo en x-supa-jwt
function apiFetch(url, opts={}) {
  const jwt=getCurrentJwt()
  const headers={...(opts.headers||{})}
  if(jwt) headers['x-supa-jwt']=jwt
  return fetch(url,{...opts,headers})
}

// ── Build equity curve with daily float P&L ──────────────────────────────────
// allTrades: all trades (open+closed); historicalCloses: {sym:[{date,close}]}
// capitalBase: fallback base when no contributions; contributions: aportaciones array
function buildFloatCurve(allTrades, historicalCloses, capitalBase, contributions=[]) {
  if(!allTrades?.length||!Object.keys(historicalCloses).length) return []
  // Time axis: union of close dates, but only from first trade entry onward
  const firstTradeDate=allTrades.map(t=>t.entry_date).filter(Boolean).sort()[0]||''
  const dateSet=new Set()
  Object.values(historicalCloses).forEach(arr=>arr.forEach(p=>{if(!firstTradeDate||p.date>=firstTradeDate)dateSet.add(p.date)}))
  const allDates=[...dateSet].sort()
  if(!allDates.length) return []
  // Per-symbol sorted arrays for binary-search forward-fill
  const priceFor={}
  Object.entries(historicalCloses).forEach(([sym,arr])=>{
    priceFor[sym]=[...arr].sort((a,b)=>a.date.localeCompare(b.date))
  })
  const getPrice=(sym,date)=>{
    const arr=priceFor[sym]; if(!arr?.length) return null
    let lo=0,hi=arr.length-1,best=null
    while(lo<=hi){const mid=(lo+hi)>>1;if(arr[mid].date<=date){best=arr[mid].close;lo=mid+1}else hi=mid-1}
    return best
  }
  // Pre-sort contributions (same sign logic as cwcDisp: retirada=-amount, rest=+amount)
  const contribsSorted=[...contributions].filter(c=>c.date).sort((a,b)=>a.date.localeCompare(b.date))
  const hasContribs=contribsSorted.length>0
  const closed=allTrades.filter(t=>t.status==='closed').sort((a,b)=>(a.exit_date||'').localeCompare(b.exit_date||''))
  let pnlClosed=0, closedIdx=0, runContrib=0, contribIdx=0
  const curve=[]
  for(const date of allDates){
    // Accumulate contributions up to this date
    while(contribIdx<contribsSorted.length&&contribsSorted[contribIdx].date<=date){
      const c=contribsSorted[contribIdx]
      runContrib+=c.type==='retirada'?-parseFloat(c.amount||0):parseFloat(c.amount||0)
      contribIdx++
    }
    // Accumulate closed P&L up to this date
    while(closedIdx<closed.length&&(closed[closedIdx].exit_date||'')<=date){
      pnlClosed+=parseFloat(closed[closedIdx].pnl_eur||0); closedIdx++
    }
    // Float P&L for positions open on this date
    let pnlFloat=0
    const tradesAbiertosList=[]
    for(const t of allTrades){
      if(!t.entry_date||t.entry_date>date) continue
      if(t.status==='closed'&&t.exit_date&&t.exit_date<=date) continue
      const sym=t.symbol; if(!sym||!historicalCloses[sym]) continue
      const px=getPrice(sym,date); if(px==null) continue
      const shares=parseFloat(t.shares||0)
      const entryPx=parseFloat(t.entry_price||0)
      const fxE=parseFloat(t.fx_entry||0)
      const fx=fxE>0?(fxE<1?1/fxE:fxE):1
      pnlFloat+=(px-entryPx)*shares/fx
      tradesAbiertosList.push(sym)
    }
    const base=hasContribs?runContrib:capitalBase
    curve.push({date,value:base+pnlClosed+pnlFloat})
  }
  return curve
}

export default function Home() {
  const [simbolo,setSimbolo]=useState('^GSPC')
  const [displayedSimbolo,setDisplayedSimbolo]=useState('^GSPC') // lags behind simbolo — updates only when chart data is ready
  const [symSearchOpen,setSymSearchOpen]=useState(false)
  const [symSearchQ,setSymSearchQ]=useState('')
  const symSearchInputRef=useRef(null)
  const [emaR,setEmaR]=useState(10),[emaL,setEmaL]=useState(11)
  const [years,setYears]=useState(5),[capitalIni,setCapitalIni]=useState(10000)
  const [tipoStop,setTipoStop]=useState('tecnico'),[atrP,setAtrP]=useState(14),[atrM,setAtrM]=useState(1.0)
  const [sinPerdidas,setSinPerdidas]=useState(true),[reentry,setReentry]=useState(true)
  const [tipoFiltro,setTipoFiltro]=useState('none'),[sp500EmaR,setSp500EmaR]=useState(10),[sp500EmaL,setSp500EmaL]=useState(11)
  const [filtros,setFiltros]=useState({vix:{activo:false,umbral:25,intervalo:'diario'},indiceEma:{activo:true,ticker:'^GSPC',periodo:10,intervalo:'diario'},sectorEma:{activo:false,ticker:'XLK',periodo:50,intervalo:'diario'},cruceEma:{activo:false,ticker:'^GSPC',periodoR:10,periodoL:11,intervalo:'diario'}})
  const [filtrosOpen,setFiltrosOpen]=useState(false)
  const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(null)
  const [labelMode,setLabelMode]=useState(1),[rulerOn,setRulerOn]=useState(false)
  const [chartViewFull,setChartViewFull]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [settingsInitTab,setSettingsInitTab]=useState('integraciones')
  const [alertThreshold,setAlertThreshold]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.autoRefreshThreshold??50}catch{return 50}
  })
  const [sidePanel,setSidePanel]=useState('watchlist')
  const [navExpanded,setNavExpanded]=useState(false)
  const [metricsLayout,setMetricsLayout]=useState('panel')
  const [metricsView,setMetricsView]=useState('panel')   // 'multi'=3col | 'single'=one strat per block
  const [showStrategy,setShowStrategy]=useState(false),[showBH,setShowBH]=useState(true)
  const [showSP500,setShowSP500]=useState(false),[showCompound,setShowCompound]=useState(true)
  const [showBacktestFloat,setShowBacktestFloat]=useState(true)
  const [watchlist,setWatchlist]=useState(WATCHLIST_DEFAULT)
  const [wlLoading,setWlLoading]=useState(true)
  const [wlLists,setWlLists]=useState([])             // [{id,name,position}] from watchlist_lists
  const [selectedLists,setSelectedLists]=useState([])
  const [listDropOpen,setListDropOpen]=useState(null) // null | {x,y}
  const [editingItem,setEditingItem]=useState(null) // item watchlist en edición
  const [wlManagerReturn,setWlManagerReturn]=useState(false)
  const [editForm,setEditForm]=useState({})
  const [editSaving,setEditSaving]=useState(false)
  const [strategies,setStrategies]=useState([])
  const [strLoading,setStrLoading]=useState(true)
  const [editingStr,setEditingStr]=useState(null)
  const [strForm,setStrForm]=useState({})
  const [strSaving,setStrSaving]=useState(false)
  // ── Strategy Builder ──
  const [stratName, setStratName]     = useState('')
  const [stratDesc, setStratDesc]     = useState('')
  const [stratColor, setStratColor]   = useState('#00d4ff')
  const [currentStratId, setCurrentStratId] = useState(null)
  const [estrategiaIntervalo, setEstrategiaIntervalo] = useState('diario') // 'diario'|'semanal' — intervalo del activo en backtest individual
  const [stratSaving, setStratSaving] = useState(false)
  const [stratMsg, setStratMsg]       = useState(null)
  const [stratTab, setStratTab]       = useState('build')
  // Alertas
  const [alarms,setAlarms]=useState([])
  const [alarmLoading,setAlarmLoading]=useState(true)
  const [conditions,setConditions]=useState([])
  const [condLoading,setCondLoading]=useState(false)
  const [panelScale,setPanelScale]=useState(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.ui?.panelScale||{}}catch{return{}}})
  // Toggle active state of a condition: optimistic update + PATCH to Supabase
  const handleToggleCondition=useCallback(async(condId,active)=>{
    setConditions(prev=>prev.map(c=>c.id===condId?{...c,active}:c))
    try{
      const {updateCondition}=await import('../lib/conditions')
      await updateCondition(condId,{active})
    }catch(e){console.error('toggle condition active:',e)}
  },[])
  const [condColors,setCondColorsState]=useState(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.condColors||{}}catch{return{}}})
  const [condColorPicker,setCondColorPicker]=useState(null) // {condId,x,y} or null
  const setCondColor=useCallback((condId,color)=>{
    setCondColorsState(prev=>{
      const next=color?{...prev,[condId]:color}:Object.fromEntries(Object.entries(prev).filter(([k])=>k!==condId))
      try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');if(!s.watchlist)s.watchlist={};s.watchlist.condColors=next;const _f0=JSON.parse(localStorage.getItem('v50_settings')||'{}');if(_f0.defaultStrategyId)s.defaultStrategyId=_f0.defaultStrategyId;localStorage.setItem('v50_settings',JSON.stringify(s))}catch{}
      return next
    })
    setCondColorPicker(null)
  },[])
  const [selectedCondition,setSelectedCondition]=useState(null)
  const [selectedStrategy,setSelectedStrategy]=useState(null)
  const [editingAlarm,setEditingAlarm]=useState(null)
  const [alarmForm,setAlarmForm]=useState({})
  const [alarmSaving,setAlarmSaving]=useState(false)
  // Buscador global watchlist
  const [wlSearch,setWlSearch]=useState('')
  const [onlyFavs,setOnlyFavs]=useState(false)  // filtro solo favoritos
  const [condFilterActive,setCondFilterActive]=useState(false) // filtro: solo activos con alertas disparadas
  const [onlyOpen,setOnlyOpen]=useState(false) // filtro solo posiciones abiertas
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
  const [rankingData,setRankingData]=useState({})      // { SYMBOL: { score, rank, metrics } } — keys uppercase
  const [rankingStratId,setRankingStratId]=useState(null)    // strategy id the ranking was calculated with
  const [rankingStratName,setRankingStratName]=useState('')  // display name
  const [rankingRunning,setRankingRunning]=useState(false)
  const [rankingProgress,setRankingProgress]=useState({done:0,total:0})
  const [rankingError,setRankingError]=useState(null)
  const [topStratRunning,setTopStratRunning]=useState(false)
  const [topStratProgress,setTopStratProgress]=useState({current:0,total:0})
  const [calcPhase,setCalcPhase]=useState(0)  // 0=idle, 1=fase1 ranking activo, 2=fase2 top estrategia
  // Mejor estrategia por símbolo entre TODAS las estrategias calculadas en Supabase
  // { SYMBOL: { stratName, stratId, score, intervalo, stratCount } }
  const [bestStratBySymbol,setBestStratBySymbol]=useState({})
  const [wlData, setWlData] = useState({})
  // wlData[SYM] = {
  //   active: { scoreMetricas, scoreMetSeñ, cagr, profit, winRate, maxDD, ops, stratName, stratId, intervalo, updatedAt },
  //   top:    { scoreMetricas, scoreMetSeñ, cagr, profit, winRate, maxDD, ops, stratName, stratId, intervalo, updatedAt }
  // }
  // Orden del sidebar Watchlist: 'scoreHistorico'|'scoreCompleto'|'alfabetico'
  const [wlSortMode,setWlSortMode]=useState('scoreHistorico')
  // Dropdown para cambiar estrategia activa desde el header
  const [stratDropOpen,setStratDropOpen]=useState(false)
  // Panel de gestión de Watchlist (reemplaza el área de gráfico)
  const [showWlManager,setShowWlManager]=useState(false)
  const [showStratManager,setShowStratManager]=useState(false)
  const [stratManagerReturn,setStratManagerReturn]=useState(false) // volver al StrategyManager al cerrar editor
  // Tooltip flotante del Watchlist — {x, y, symbol} | null
  const [wlTooltip,setWlTooltip]=useState(null)
  // Búsqueda async de nombre
  const symSearchRef=useRef(null)
  const [mcTradeFilter,setMcTradeFilter]=useState('')
  const [tradeHistMode,setTradeHistMode]=useState('compound')   // 'compound'|'simple' for trade history capital column
  const chartSyncRef=useRef({syncing:false,listeners:[]})  // cross-chart time sync

  // Reset sync listeners when symbol/result changes to prevent stale refs
  const prevSymboloRef=useRef(null)
  if(simbolo!==prevSymboloRef.current){
    chartSyncRef.current={syncing:false,listeners:[]}
    prevSymboloRef.current=simbolo
  }
  // ── Auth ───────────────────────────────────────────────────
  const [session,setSession]=useState(undefined)  // undefined=loading, null=no sesión, obj=autenticado
  const [loginEmail,setLoginEmail]=useState('')
  const [loginPassword,setLoginPassword]=useState('')
  const [loginError,setLoginError]=useState('')
  const [loginLoading,setLoginLoading]=useState(false)
  // ── Resizable panels ────────────────────────────────────────
  const [sidebarW,setSidebarW]=useState(240)
  const [rightPanelW,setRightPanelW]=useState(275)
  const [candleH,setCandleH]=useState(480)     // resizable candle chart height
  const [chartFullscreen,setChartFullscreen]=useState(false)
  const [equityH,setEquityH]=useState(260)     // resizable equity chart height
  const [mcEquityH,setMcEquityH]=useState(300) // resizable MC equity chart height
  const candleResizing=useRef(false),candleStartY=useRef(0),candleStartH=useRef(0)
  const equityResizing=useRef(false),equityStartY=useRef(0),equityStartH=useRef(0)
  const mcEquityResizing=useRef(false),mcEquityStartY=useRef(0),mcEquityStartH=useRef(0)
  const sidebarResizing=useRef(false), rightResizing=useRef(false)
  const sidebarStartX=useRef(0), sidebarStartW=useRef(0)
  const rightStartX=useRef(0), rightStartW=useRef(0)

  // ── Auth: verificar sesión al montar + suscribirse a cambios ──
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session||null)
      if(session?.access_token){
        setCurrentJwt(session.access_token)
        // Re-fetch watchlist data now that JWT is available (RLS requires auth.uid())
        reloadWatchlist()
      }
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{
      setSession(session||null)
      setCurrentJwt(session?.access_token||null)
      if(session?.access_token){ reloadWatchlist() }
    })
    return ()=>subscription.unsubscribe()
  },[]) // eslint-disable-line

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
  const [mcMode,setMcMode]=useState('concentrado')       // 'slots' | 'concentrado' | 'compartido' | 'custom' | 'positionsizing'
  const [selectedModos,setSelectedModos]=useState(['concentrado']) // multi-mode when 1 strategy selected
  const [mcIsModoCompare,setMcIsModoCompare]=useState(false) // true when comparing modes (vs strategies)
  const [mcWeights,setMcWeights]=useState({})             // {symbol: pct} para modo custom
  const [mcRiskPerTrade,setMcRiskPerTrade]=useState(5)
  const [mcMaxPortfolioPct,setMcMaxPortfolioPct]=useState(20)
  const [mcMaxAccumRisk,setMcMaxAccumRisk]=useState(20)
  const [mcMaxPosiciones,setMcMaxPosiciones]=useState(4)  // para modo concentrado
  const [mcPrioridad,setMcPrioridad]=useState('alfabetico') // criterio desempate concentrado
  const [mcMomentumN,setMcMomentumN]=useState(20)           // lookback días para criterio momentum
  const [mcCapital,setMcCapital]=useState('compound')    // 'simple' | 'compound'
  const [mcCapitalIni,setMcCapitalIni]=useState(10000)
  const [mcPeriodMode,setMcPeriodMode]=useState('years') // 'years' | 'range'
  const [mcYears,setMcYears]=useState(5)
  const [mcFromDate,setMcFromDate]=useState(()=>{const d=new Date();d.setFullYear(d.getFullYear()-5);return d.toISOString().slice(0,10)})
  const [mcToDate,setMcToDate]=useState(()=>new Date().toISOString().slice(0,10))
  const isoToDisplay=s=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('/'):s||''
  const [fromDisplay,setFromDisplay]=useState(()=>{const d=new Date();d.setFullYear(d.getFullYear()-5);return d.toISOString().slice(0,10).split('-').reverse().join('/')})
  const [toDisplay,setToDisplay]=useState(()=>new Date().toISOString().slice(0,10).split('-').reverse().join('/'))
  const [mcHistStratId,setMcHistStratId]=useState(null) // null=estrategia activa, string=id específico
  const [mcResult,setMcResult]=useState(null)
  const [mcLoading,setMcLoading]=useState(false)
  const [mcError,setMcError]=useState(null)
  const [mcShowSimple,setMcShowSimple]=useState(false)
  const [mcShowCompound,setMcShowCompound]=useState(true)
  const [mcShowBH,setMcShowBH]=useState(true)
  const [mcShowSP500,setMcShowSP500]=useState(false)
  const [showMultiFloat,setShowMultiFloat]=useState(true)
  const [mcChartsStratVisible,setMcChartsStratVisible]=useState({})
  const [mcShowOccupancy,setMcShowOccupancy]=useState(true)
  const [mcOccMode,setMcOccMode]=useState('compound')  // own filter for MC capital chart
  const [mcIntervalo,setMcIntervalo]=useState('diario')  // 'diario' | 'semanal' — intervalo de datos MC
  const mcChartRef=useRef(null)
  const savedRangeRef=useRef(null)   // preserve zoom when changing asset
  const isNewResultRef=useRef(false) // signals applyInitialRange to skip savedRange → apply recentMonths
  const [metricsStrats,setMetricsStrats]=useState(['simple','compound','bh'])  // which strat panels to show
  const [showIndivOccupancy,setShowIndivOccupancy]=useState(true)  // % capital invertido chart for individual
  const [indivOccMode,setIndivOccMode]=useState('compound')  // independent filter for indiv occupancy chart

  const debounceRef=useRef(null),chartApiRef=useRef(null),chartApiFullscreenRef=useRef(null),contentRef=useRef(null),skipNextRunRef=useRef(false)
  const chartLegendRef=useRef(null)   // external legend ref for integrated chart info bar
  const closesCache=useRef({})  // { SYM: { data:[...], ts:Date.now() } } — TTL 20 min para refreshAlarmStatus

  const mcChartApiRef=useRef(null)
  const [mcAxisW,setMcAxisW]=useState(72)   // measured equity rightPriceScale width, shared with occupancy & monthly charts
  const [indivAxisW,setIndivAxisW]=useState(72)   // measured individual EquityChart rightPriceScale width, shared with its monthly chart
  const [mcStratSelected,setMcStratSelected]=useState([])   // strategy IDs selected for comparison
  const [mcMultiResults,setMcMultiResults]=useState([])     // [{id,name,color,result}]
  const [mcProgress,setMcProgress]=useState(null)           // null|{current,total,name}
  const [mcSectionOpen,setMcSectionOpen]=useState({mode:false,strats:false})
  const [mcFiltrosOpen,setMcFiltrosOpen]=useState(false)
  const [mcStratVisible,setMcStratVisible]=useState({})     // {id:bool}
  const [mcAssetOpen,setMcAssetOpen]=useState({})           // {stratId:bool} acordeón resumen por activo
  const [mcShowBHCompare,setMcShowBHCompare]=useState(true) // B&H curve toggle in multi-strategy chart
  // mcAxisW is fed by the equity chart's onAxisWidth callback (measured after
  // layout via double rAF + on resize) so the occupancy / monthly charts end
  // their plot area at exactly the same x as the equity chart.
  const [mcShowMaxDD,setMcShowMaxDD]=useState(true)         // Max DD lines in multi-strategy chart
  const [mcChartsOpen,setMcChartsOpen]=useState(false)     // Vista de gráficos collapsible
  const [mcExporting,setMcExporting]=useState(false)       // exportTimeline in progress
  const [mcShowGantt,setMcShowGantt]=useState(false)       // toggle Gantt / Tabla
  const [ganttDiscarded,setGanttDiscarded]=useState(null)  // cached discarded trades for Gantt
  const [ganttLoadingDisc,setGanttLoadingDisc]=useState(false) // loading discarded for Gantt
  // ── Analizar candidatos state ──────────────────────────────────
  const [candidatesText,setCandidatesText]=useState('')
  const [candidatesLoading,setCandidatesLoading]=useState(false)
  const [candidatesResults,setCandidatesResults]=useState([])  // sorted by CAGR desc
  const [candidatesProgress,setCandidatesProgress]=useState(null) // {done,total}
  const mcChartsSyncRef=useRef({isSyncing:false,charts:[],lastRange:null}) // sync group for signal charts
  const mcChartRefsMap=useRef({}) // symbol → chart instance for trade navigation

  // ── TradeLog state ───────────────────────────────────────────
  const [tlTrades,setTlTrades]=useState([])
  const [tlLoading,setTlLoading]=useState(false)
  const [tlError,setTlError]=useState(null)
  const [tlSelected,setTlSelected]=useState(null)      // trade seleccionado en detalle
  const [tlMultiSel,setTlMultiSel]=useState(new Set()) // ids seleccionados para borrado
  const [tlMultiMode,setTlMultiMode]=useState(false)   // modo multiselección activo
  const [tlBulkMode,setTlBulkMode]=useState(false)      // modo selección masiva por operación
  const [tlBulkSel,setTlBulkSel]=useState(new Set())   // operaciones seleccionadas para bulk strategy
  const [tlBulkStrat,setTlBulkStrat]=useState('')       // estrategia a asignar en bulk
  const [tlTab,setTlTab]=useState('dashboard')          // 'ops'|'import'|'export'|'dashboard'|'capital'
  const [tlResumenCollapsed,setTlResumenCollapsed]=useState(false)
  // ── Capital contributions ──
  const [contributions,setContributions]=useState([])
  const [showWithContribs,setShowWithContribs]=useState(false)
  const [tlBHData,setTlBHData]=useState(null)     // cached SP500+FX history from /api/sp500history
  const [tlShowBH,setTlShowBH]=useState(false)    // toggle B&H line in equity chart
  const [tlEquityMode,setTlEquityMode]=useState('pnl') // 'pnl' | 'equity'
  const [floatCloses,setFloatCloses]=useState({})      // {sym: [{date,close}]}
  const [floatLoading,setFloatLoading]=useState(false)
  const [tlShowFloat,setTlShowFloat]=useState(false)   // float toggle (lifted from TlCharts)
  const [tlPnlView,setTlPnlView]=useState('operacion') // 'operacion' | 'estrategia'
  const [rendView,setRendView]=useState('flotantes')   // 'flotantes' | 'hist'
  const floatFetched=useRef(false)                     // lazy: only fetch once per session
  const [contribDate,setContribDate]=useState(()=>{const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()})
  const [contribAmount,setContribAmount]=useState('')
  const [contribType,setContribType]=useState('aportacion')
  const [contribNotes,setContribNotes]=useState('')
  const [contribSaving,setContribSaving]=useState(false)
  const [contribEditing,setContribEditing]=useState(null)
  const [contribEditDate,setContribEditDate]=useState('')
  const [contribEditType,setContribEditType]=useState('aportacion')
  const [contribEditAmount,setContribEditAmount]=useState('')
  const [contribEditNotes,setContribEditNotes]=useState('')
  // ── Risk Management ──
  const [riskProfiles,setRiskProfiles]=useState([])
  const [riskActiveId,setRiskActiveId]=useState(()=>{try{return localStorage.getItem('v50_risk_active_id')||null}catch{return null}})
  const [riskForm,setRiskForm]=useState({name:'',risk_per_trade_type:'%',risk_per_trade_value:1,max_total_risk:5,max_simultaneous_positions:5})
  const [riskEditing,setRiskEditing]=useState(null) // null | 'new' | id
  const [riskSaving,setRiskSaving]=useState(false)
  const [riskCalc,setRiskCalc]=useState({entry:'',stop:'',tp:''})
  const [riskLineActive,setRiskLineActive]=useState({entry:false,stop:false,tp:false})
  const [riskCaptureMode,setRiskCaptureMode]=useState(null) // null|'capture_entry'|'capture_stop'|'capture_tp'
  const [riskProfileDropOpen,setRiskProfileDropOpen]=useState(false)
  const [riskMode,setRiskMode]=useState(()=>{try{return localStorage.getItem('v50_risk_mode')||'slots'}catch{return 'slots'}})
  const [nSlots,setNSlots]=useState(()=>{try{return parseInt(localStorage.getItem('v50_risk_nslots')||'5')}catch{return 5}})
  const [riskCopied,setRiskCopied]=useState(null)
  const [riskFieldEdit,setRiskFieldEdit]=useState(null) // null | {field,val}
  const [riskEditingNameId,setRiskEditingNameId]=useState(null) // id del perfil cuyo nombre se edita
  const [riskEditingNameVal,setRiskEditingNameVal]=useState('')
  const [riskNewForm,setRiskNewForm]=useState(null) // null | {name,risk_per_trade_value,risk_per_trade_type,max_total_risk,max_simultaneous_positions}
  // Parsea números en formato español (1.234,56) o inglés (1234.56)
  const parseES=useCallback((s)=>parseFloat(String(s).replace(/\./g,'').replace(',','.'))||0,[])
  const [tlFilterBroker,setTlFilterBroker]=useState('')
  const [tlFilterYear,setTlFilterYear]=useState('')
  const [tlFilterMonth,setTlFilterMonth]=useState('')  // '01'..'12'
  const [tlFilterType,setTlFilterType]=useState('')
  const [tlFilterStatus,setTlFilterStatus]=useState('') // ''|'open'|'closed'
  const [tlSearch,setTlSearch]=useState('')
  const tlSearchRef=useRef(null)
  const tlDashSyncRef=useRef({listeners:[],syncing:false})
  const [tlFills,setTlFills]=useState([])
  const [tlExpandedGroups,setTlExpandedGroups]=useState(new Set())  // group_ids expanded
  const [tlExpandedTrades,setTlExpandedTrades]=useState(new Set()) // trade ids expanded
  const [tlShowFxCols,setTlShowFxCols]=useState(false) // toggle FX impact columns
  const [tlFormOpen,setTlFormOpen]=useState(false)
  const [tlFilterStrat,setTlFilterStrat]=useState('')
  const [tlDashMarkets,setTlDashMarkets]=useState([])         // [{symbol,name,price,ema10,trend}]
  const tlEquityContainerRef=useRef(null)
  const [tlEquityHeight,setTlEquityHeight]=useState(300)
  const tlInvestContainerRef=useRef(null)
  const [tlInvestHeight,setTlInvestHeight]=useState(200)
  const [tlEquityFlex,setTlEquityFlex]=useState(()=>{try{const saved=localStorage.getItem('tlEquityFlex');const v=saved?parseFloat(saved):1;return isNaN(v)?1:Math.min(1.8,Math.max(0.2,v))}catch(_){return 1}})
  const tlEquityFlexRef=useRef(tlEquityFlex)
  // ── Dashboard: fetch market trend data when tab becomes active ──
  useEffect(()=>{
    if(tlTab!=='dashboard') return
    const MARKETS=[
      {symbol:'^GSPC',    name:'S&P 500'},
      {symbol:'^IXIC',    name:'Nasdaq'},
      {symbol:'^DJI',     name:'Dow Jones'},
      {symbol:'^IBEX',    name:'IBEX 35'},
      {symbol:'^GDAXI',   name:'DAX'},
      {symbol:'^FCHI',    name:'CAC 40'},
      {symbol:'^FTSE',    name:'FTSE 100'},
      {symbol:'^N225',    name:'Nikkei'},
      {symbol:'^HSI',     name:'Hang Seng'},
      {symbol:'^STOXX50E',name:'Euro Stoxx 50'},
      {symbol:'BTC-USD',  name:'Bitcoin'},
      {symbol:'ETH-USD',  name:'Ethereum'},
      {symbol:'GC=F',     name:'Gold'},
      {symbol:'SI=F',     name:'Silver'},
    ]
    if(tlDashMarkets.length>=MARKETS.length) return
    const fetchMarket=async(m)=>{
      try{
        const r=await fetch(`/api/markets?symbol=${encodeURIComponent(m.symbol)}`)
        if(!r.ok) return null
        const{prices}=await r.json()
        if(!prices||prices.length<11) return null
        let ema=prices.slice(0,10).reduce((s,p)=>s+p,0)/10
        const k=2/11
        for(let i=10;i<prices.length;i++) ema=prices[i]*k+ema*(1-k)
        const last=prices[prices.length-1]
        const prev=prices[prices.length-2]||last
        const dayPct=((last-prev)/prev*100)
        return{...m,price:last,ema10:ema,dayPct,trend:last>ema?'bull':'bear'}
      }catch(_){return null}
    }
    Promise.all(MARKETS.map(fetchMarket)).then(r=>setTlDashMarkets(r.filter(Boolean))).catch(()=>{})
  },[tlTab,tlDashMarkets.length]) // eslint-disable-line
  useEffect(()=>{
    if(!tlEquityContainerRef.current) return
    const ro=new ResizeObserver(entries=>{
      const h=Math.round(entries[0]?.contentRect?.height)
      if(h&&h>50) setTlEquityHeight(prev=>prev===h?prev:h)
    })
    ro.observe(tlEquityContainerRef.current)
    return ()=>ro.disconnect()
  },[])
  useEffect(()=>{
    if(!tlInvestContainerRef.current) return
    const ro=new ResizeObserver(entries=>{
      const h=Math.round(entries[0]?.contentRect?.height)
      if(h&&h>50) setTlInvestHeight(prev=>prev===h?prev:h)
    })
    ro.observe(tlInvestContainerRef.current)
    return ()=>ro.disconnect()
  },[])
  // ── groupTradesForDisplay: FIFO match individual fills → virtual grouped rows ──
  // tlTrades stores raw fills (fill_type:'buy'|'sell', status:'open').
  // This function pairs them chronologically per symbol so the UI shows closed ops with entry+exit.
  // Old-format merged trades (already have exit_date) pass through unchanged.
  const groupTradesForDisplay = (trades) => {
    if (!trades?.length) return []
    const isIndividualFill = t => (t.fill_type==='buy'||t.fill_type==='sell') && !t.exit_date
    const newFills   = trades.filter(isIndividualFill)
    const legacyTrades = trades.filter(t => !isIndividualFill(t) && t.fill_type!=='sell')
    if (!newFills.length) return legacyTrades
    const bySymbol = {}
    newFills.forEach(t=>{ if(!bySymbol[t.symbol]) bySymbol[t.symbol]=[]; bySymbol[t.symbol].push(t) })
    const grouped = []
    Object.entries(bySymbol).forEach(([,fills])=>{
      const sorted = [...fills].sort((a,b)=>{
        const da=a.entry_date||'', db=b.entry_date||''
        if(da<db) return -1; if(da>db) return 1
        if(a.fill_type==='buy'&&b.fill_type!=='buy') return -1
        if(a.fill_type!=='buy'&&b.fill_type==='buy') return 1
        return 0
      })
      const buyQueue = sorted.filter(t=>t.fill_type==='buy')
        .map(t=>({...t, sharesLeft: parseFloat(t.shares||0)}))
      sorted.filter(t=>t.fill_type==='sell').forEach(sell=>{
        let remaining = parseFloat(sell.shares||0), consumed = 0
        const sTot = parseFloat(sell.shares||1), sComm = parseFloat(sell.commission_sell||0)
        while(remaining>0.001 && buyQueue.length>0){
          const head=buyQueue[0]
          if(head.sharesLeft<0.001){ buyQueue.shift(); continue }
          // Un SELL no puede emparejarse con un BUY posterior — cronológicamente imposible
          if((head.entry_date||'') > (sell.entry_date||'')) break
          const take=Math.min(head.sharesLeft, remaining)
          head.sharesLeft-=take; remaining-=take; consumed+=take
          const bTot=parseFloat(head.shares||1)
          const bCommProp=parseFloat(head.commission_buy||0)*(take/bTot)
          const sCommProp=sComm*(take/sTot)
          const fxE=parseFloat(head.fx_entry||1), fxX=parseFloat(sell.fx_entry||head.fx_entry||1)
          const pnlCur=(parseFloat(sell.entry_price||0)-parseFloat(head.entry_price||0))*take
          const capEur=take*parseFloat(head.entry_price||0)/fxE
          const pnlEur=pnlCur/fxX - bCommProp/fxE - sCommProp/fxX
          grouped.push({
            ...head, id:`${head.id}__${sell.id}`,
            _originalBuyId:head.id, _originalSellId:sell.id, _isFifoGrouped:true,
            shares:take, commission_buy:bCommProp,
            exit_date:sell.entry_date, exit_price:parseFloat(sell.entry_price||0),
            exit_currency:sell.entry_currency||head.entry_currency,
            commission_sell:sCommProp, fx_exit:fxX, status:'closed',
            capital_eur:capEur, pnl_currency:pnlCur, pnl_eur:pnlEur,
            pnl_pct:capEur>0?(pnlEur/capEur)*100:null
          })
          if(head.sharesLeft<0.001) buyQueue.shift()
        }
        if(consumed<0.001) grouped.push({...sell, _orphanSell:true, status:'orphan'})
      })
      buyQueue.filter(b=>b.sharesLeft>0.001).forEach(b=>grouped.push({...b, shares:b.sharesLeft, status:'open'}))
    })
    return [...legacyTrades, ...grouped]
      .sort((a,b)=>(b.entry_date||'').localeCompare(a.entry_date||'')||(b.created_at||'').localeCompare(a.created_at||''))
  }

  // ── tlFifo: FIFO grouping sobre todos los fills (sin filtros) ──
  const [tlLivePrices,setTlLivePrices]=useState({})
  const [tlLiveFx,setTlLiveFx]=useState({})
  const tlFifo = useMemo(()=>computeFifo(tlTrades, tlLivePrices), [tlTrades, tlLivePrices])

  // ── Background cache warm: fire priceOnly requests in parallel batches when Dashboard opens ──
  // Warms the server-side 60s cache so the subsequent sequential fetch hits cache (near-instant).
  useEffect(()=>{
    if(tlTab!=='dashboard') return
    const {openPositions} = computeFifo(tlTrades, {})
    const openSymbols = [...new Set(openPositions.map(p=>p.symbol).filter(Boolean))]
    // Fill remaining slots (up to 50) with watchlist symbols not already in open positions
    const otherSymbols = watchlist.map(w=>w.symbol).filter(s=>s&&!openSymbols.includes(s))
    // MAX 50 symbols preloaded — increase limit cautiously (Yahoo Finance rate limiting)
    const syms = [...openSymbols, ...otherSymbols].slice(0, 50)
    if(!syms.length) return
    ;(async()=>{
      for(let i=0;i<syms.length;i+=3){
        const batch=syms.slice(i,i+3)
        await Promise.all(batch.map(sym=>
          fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({simbolo:sym,priceOnly:true})}).catch(()=>{})
        ))
        if(i+3<syms.length) await new Promise(r=>setTimeout(r,200))
      }
    })()
  },[tlTab,tlTrades]) // eslint-disable-line

  // ── Fetch live prices for open positions ──
  useEffect(()=>{
    const {openPositions} = computeFifo(tlTrades, {})
    const symbols = [...new Set(openPositions.map(p=>p.symbol).filter(Boolean))]
    if(!symbols.length){ setTlLivePrices({}); setTlLiveFx({}); return }
    const cfg={emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}
    // Live prices — sequential with 300ms gap and 1 retry on failure
    ;(async()=>{
      const fetchResults=[]
      for(const sym of symbols){
        let entry={sym,price:null,unavailable:true}
        for(let attempt=0;attempt<2;attempt++){
          if(attempt>0) await new Promise(r=>setTimeout(r,1000))
          try{
            const r=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({simbolo:sym,priceOnly:true})})
            const j=await r.json()
            if(j.error===true) continue
            if(j.meta?.ultimoPrecio){entry={sym,price:j.meta.ultimoPrecio,unavailable:false};break}
          }catch(_){}
        }
        fetchResults.push(entry)
        if(sym!==symbols[symbols.length-1]) await new Promise(r=>setTimeout(r,300))
      }
      const prices={}
      fetchResults.forEach(({sym,price,unavailable})=>{prices[sym]={price,unavailable:!!unavailable}})
      setTlLivePrices(prices)
    })()
    // Live FX for each unique non-EUR currency among open positions
    const today=new Date().toISOString().slice(0,10)
    const currencies=[...new Set(openPositions.map(p=>p.currency).filter(c=>c&&c!=='EUR'))]
    if(currencies.length){
      Promise.all(currencies.map(async cur=>{
        try{
          const r=await fetch(`/api/tradelog?action=fx&currency=${cur}&date=${today}`)
          const j=await r.json()
          if(j.fx) return {cur,fx:parseFloat(j.fx)}
        }catch(_){}
        return null
      })).then(results=>{
        const fxMap={}
        results.filter(Boolean).forEach(({cur,fx})=>{ fxMap[cur]=fx })
        setTlLiveFx(fxMap)
      })
    } else {
      setTlLiveFx({})
    }
  },[tlTrades])

  // ── Capital contributions: fetch + CRUD ──
  // Depende de session?.user?.id para esperar a que el JWT esté disponible antes de hacer la llamada
  useEffect(()=>{
    if(!session?.user?.id) return
    apiFetch('/api/tradelog?action=contributions').then(r=>r.json())
      .then(d=>{ if(Array.isArray(d)) setContributions(d) }).catch(()=>{})
  },[session?.user?.id]) // eslint-disable-line

  // ── Risk profiles: fetch ──
  useEffect(()=>{
    if(!session?.user?.id) return
    apiFetch('/api/risk').then(r=>r.json())
      .then(d=>{ if(Array.isArray(d)) setRiskProfiles(d) }).catch(()=>{})
  },[session?.user?.id]) // eslint-disable-line

  const riskActiveProfile = riskProfiles.find(p=>p.id===riskActiveId)||riskProfiles[0]||null

  const riskSaveProfile=async()=>{
    if(!riskForm.name.trim()) return
    setRiskSaving(true)
    try{
      if(riskEditing&&riskEditing!=='new'){
        await apiFetch(`/api/risk?action=update&id=${riskEditing}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(riskForm)})
        setRiskProfiles(prev=>prev.map(p=>p.id===riskEditing?{...p,...riskForm}:p))
      } else {
        const r=await apiFetch('/api/risk?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(riskForm)})
        const d=await r.json()
        if(d?.id){
          setRiskProfiles(prev=>[...prev,d])
          setRiskActiveId(d.id)
          try{localStorage.setItem('v50_risk_active_id',d.id)}catch{}
        }
      }
      setRiskEditing(null)
    }finally{setRiskSaving(false)}
  }

  // Alterna un campo boolean de la card activa y guarda en Supabase
  const riskToggleCard=async(field)=>{
    if(!riskActiveProfile?.id) return
    const newVal=!(riskActiveProfile[field]??false)
    setRiskProfiles(prev=>prev.map(p=>p.id===riskActiveProfile.id?{...p,[field]:newVal}:p))
    try{
      await apiFetch(`/api/risk?action=update&id=${riskActiveProfile.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({[field]:newVal})})
    }catch{}
  }

  // Guarda el nombre inline de un perfil
  const riskSaveName=async(id,name)=>{
    if(!name?.trim()) return
    try{
      await apiFetch(`/api/risk?action=update&id=${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})})
      setRiskProfiles(prev=>prev.map(p=>p.id===id?{...p,name:name.trim()}:p))
    }catch{}
    setRiskEditingNameId(null)
  }

  // Crea nuevo estilo desde el formulario inline del dropdown
  const riskCreateNew=async()=>{
    if(!riskNewForm?.name?.trim()) return
    try{
      const r=await apiFetch('/api/risk?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        name:riskNewForm.name.trim(),
        risk_per_trade_type:riskNewForm.risk_per_trade_type||'%',
        risk_per_trade_value:riskNewForm.risk_per_trade_value||null,
        max_total_risk:riskNewForm.max_total_risk||null,
        max_simultaneous_positions:riskNewForm.max_simultaneous_positions||null,
        active_riesgo_op:true,active_capital_op:false,active_slots:false,
      })})
      const d=await r.json()
      if(d?.id){
        setRiskProfiles(prev=>[...prev,d])
        setRiskActiveId(d.id)
        try{localStorage.setItem('v50_risk_active_id',d.id)}catch{}
      }
    }catch{}
    setRiskNewForm(null)
  }

  const riskSaveField=async(field,val)=>{
    if(!riskActiveProfile?.id) return
    const numVal=(val===''||val===null)?null:(parseFloat(String(val).replace(/\./g,'').replace(',','.'))||null)
    const body={...riskActiveProfile,[field]:numVal}
    try{
      await apiFetch(`/api/risk?action=update&id=${riskActiveProfile.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      setRiskProfiles(prev=>prev.map(p=>p.id===riskActiveProfile.id?{...p,[field]:numVal}:p))
    }catch{}
    setRiskFieldEdit(null)
  }

  const riskDeleteProfile=async(id)=>{
    if(!confirm('¿Eliminar este perfil de riesgo?')) return
    await apiFetch(`/api/risk?action=delete&id=${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})
    setRiskProfiles(prev=>prev.filter(p=>p.id!==id))
    if(riskActiveId===id){
      const remaining=riskProfiles.filter(p=>p.id!==id)
      const next=remaining[0]?.id||null
      setRiskActiveId(next)
      try{localStorage.setItem('v50_risk_active_id',next||'')}catch{}
    }
  }

  const addContribution=async()=>{
    if(!contribDate||!contribAmount||isNaN(parseFloat(contribAmount))||parseFloat(contribAmount)<=0) return
    // Convert DD/MM/YYYY → YYYY-MM-DD for Supabase
    const parts=contribDate.split('/')
    const isoDate=parts.length===3?`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`:contribDate
    if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return
    setContribSaving(true)
    try{
      const r=await apiFetch('/api/tradelog?action=add-contribution',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({date:isoDate,amount:parseFloat(contribAmount),type:contribType,notes:contribNotes||null})})
      const d=await r.json()
      if(d.id){
        setContributions(prev=>[d,...prev].sort((a,b)=>b.date.localeCompare(a.date)||b.created_at.localeCompare(a.created_at||'')))
        setContribAmount(''); setContribNotes('')
      }
    }finally{setContribSaving(false)}
  }
  const deleteContribution=async(id)=>{
    await apiFetch('/api/tradelog?action=delete-contribution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    setContributions(prev=>prev.filter(c=>c.id!==id))
  }
  const startEditContrib=(c)=>{
    setContribEditing(c.id)
    setContribEditDate(c.date?c.date.split('-').reverse().join('/'):'')
    setContribEditType(c.type)
    setContribEditAmount(String(parseFloat(c.amount)))
    setContribEditNotes(c.notes||'')
  }
  const saveEditContrib=async(id)=>{
    const parts=contribEditDate.split('/')
    const isoDate=parts.length===3?`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`:contribEditDate
    if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)||!contribEditAmount||parseFloat(contribEditAmount)<=0) return
    try{
      const r=await apiFetch('/api/tradelog?action=update-contribution',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,date:isoDate,amount:parseFloat(contribEditAmount),type:contribEditType,notes:contribEditNotes||null})})
      const d=await r.json()
      if(d.id){
        setContributions(prev=>prev.map(c=>c.id===id?d:c).sort((a,b)=>b.date.localeCompare(a.date)||(b.created_at||'').localeCompare(a.created_at||'')))
        setContribEditing(null)
      }
    }catch(_){}
  }

  // ── tlFiltered: fills filtrados + status vía FIFO ──
  const tlFiltered = useMemo(()=>{
    return tlTrades.filter(t=>{
      if(tlFilterStatus){
        const st=tlFifo.fillStatus[t.id]
        if(tlFilterStatus==='open' && st!=='open' && st!=='partial') return false
        if(tlFilterStatus==='closed' && st!=='closed' && st!=='sell') return false
      }
      if(tlFilterBroker && t.broker!==tlFilterBroker) return false
      if(tlFilterStrat && (t.strategy||'')!==tlFilterStrat) return false
      if(tlSearch && !(t.symbol||'').toLowerCase().includes(tlSearch.toLowerCase())) return false
      if(tlFilterYear||tlFilterMonth){
        const d = t.date
        if(!d) return false
        if(tlFilterYear && !d.startsWith(tlFilterYear)) return false
        if(tlFilterMonth && d.slice(5,7)!==tlFilterMonth) return false
      }
      return true
    })
  },[tlTrades,tlFifo,tlFilterBroker,tlFilterStrat,tlSearch,tlFilterYear,tlFilterMonth,tlFilterStatus])

  // ── tlTradesFiltered: operaciones FIFO filtradas para el historial ──
  const tlTradesFiltered = useMemo(()=>{
    return (tlFifo.trades||[])
      .filter(t=>{
        if(tlFilterBroker && t.broker!==tlFilterBroker) return false
        if(tlFilterStrat && (t.strategy||'')!==tlFilterStrat) return false
        if(tlSearch && !(t.symbol||'').toLowerCase().includes(tlSearch.toLowerCase())) return false
        if(tlFilterYear||tlFilterMonth){
          // Closed trades: filter by exit_date (when the trade was realized)
          // Open trades: filter by entry_date (when the trade was opened)
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          if(!d) return false
          if(tlFilterYear && !d.startsWith(tlFilterYear)) return false
          if(tlFilterMonth && d.slice(5,7)!==tlFilterMonth) return false
        }
        if(tlFilterStatus){
          if(tlFilterStatus==='open' && t.status!=='open') return false
          if(tlFilterStatus==='closed' && t.status!=='closed') return false
        }
        return true
      })
      .sort((a,b)=>{
        const da=a.entry_date||''
        const db=b.entry_date||''
        return db.localeCompare(da)
      })
  },[tlFifo,tlFilterBroker,tlFilterStrat,tlSearch,tlFilterYear,tlFilterMonth,tlFilterStatus])

  // ── Lazy fetch of historical closes for float equity curve ──
  // Triggered only on first "Flotante" toggle click (not on mount)
  const triggerFloatFetch=useCallback(()=>{
    if(floatFetched.current) return          // already fetched or in progress
    const syms=[...new Set(tlTradesFiltered.map(t=>t.symbol).filter(Boolean))]
    if(!syms.length) return
    floatFetched.current=true
    ;(async()=>{
      setFloatLoading(true)
      const result={}
      const bs=4
      for(let i=0;i<syms.length;i+=bs){
        const batch=syms.slice(i,i+bs)
        await Promise.all(batch.map(async sym=>{
          try{
            const r=await apiFetch(`/api/closes?symbol=${sym}&days=1800&dates=1`)
            const data=await r.json()
            if(Array.isArray(data)&&data.length>=10) result[sym]=data
          }catch{}
        }))
        if(i+bs<syms.length) await new Promise(r=>setTimeout(r,400))
      }
      setFloatCloses(result)
      setFloatLoading(false)
    })()
  },[tlTradesFiltered]) // eslint-disable-line

  const tlPrices = {}
  const [tlFillsList,setTlFillsList]=useState([])  // fills entrada para modal
  const [tlExitFillsList,setTlExitFillsList]=useState([])  // fills salida para modal
  const [tlSideEdit,setTlSideEdit]=useState(false)   // edit panel in left sidebar
  const [tlCloseOpen,setTlCloseOpen]=useState(false)
  const [tlImportText,setTlImportText]=useState('')
  const [tlImportFormat,setTlImportFormat]=useState('csv')
  const [tlParsedRaw,setTlParsedRaw]=useState([])  // raw fills from parser (always saved)
  const [tlParsed,setTlParsed]=useState([])          // grouped preview (display only)

  // ── Enriquece filas: detecta duplicados y cierres (totales/parciales) ──
  const enrichParsedRows = (rows) => {
    return rows.map(r => {
      let enriched = {...r}

      // Duplicate detection: same symbol + date + fill_type + shares + price already in DB
      const isDup = tlTrades.some(t =>
        t.symbol === r.symbol &&
        t.entry_date === r.entry_date &&
        (t.fill_type||'buy') === (r.fill_type||'buy') &&
        Math.abs(parseFloat(t.shares||0) - parseFloat(r.shares||0)) < 0.01 &&
        Math.abs(parseFloat(t.entry_price||0) - parseFloat(r.entry_price||0)) < 0.01
      )
      if (isDup) enriched._isDuplicate = true

      // Closure detection: any SELL fill (isolated or _orphanSell) → find open positions
      const isSellFill = r.fill_type === 'sell' || r._orphanSell
      if (isSellFill && !r._grouped) {
        // Build FIFO-aware set of truly open BUY fills for this symbol
        const symFills = tlTrades.filter(t => t.symbol === r.symbol)
        // Normalize field names: Supabase fills use 'date'/'price'; legacy LS may use 'entry_date'/'entry_price'
        const normFills = symFills.map(t => ({
          ...t,
          date: t.date || t.entry_date || '',
          price: parseFloat(t.price ?? t.entry_price ?? 0),
          fill_type: t.fill_type || 'buy',
          fx: (()=>{ let fx=parseFloat(t.fx??t.fx_entry??1); if(fx>0&&fx<1)fx=1/fx; return(!fx||isNaN(fx))?1:fx })(),
        }))
        const { fillStatus: fifoStatus } = computeFifo(normFills, {})
        const openPositions = normFills
          .filter(t =>
            (t.fill_type || 'buy') === 'buy' &&
            (fifoStatus[t.id] === 'open' || fifoStatus[t.id] === 'partial')
          )
          .sort((a,b)=>{ const da=a.date||'',db=b.date||''; return da<db?-1:da>db?1:0 }) // oldest first

        if (openPositions.length === 1) {
          // Single open position → auto-assign
          const openPos    = openPositions[0]
          const openShares = parseFloat(openPos.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = openPos.id
          enriched._closesSymbol   = openPos.symbol
          enriched._openEntryDate  = openPos.date
          enriched._openShares     = openShares
          enriched._sellShares     = sellShares
          enriched._isPartialClose = sellShares < openShares - 0.001
          enriched._isFullClose    = Math.abs(sellShares - openShares) < 0.001
          enriched._isExcessSell   = sellShares > openShares + 0.001
          if (enriched._isPartialClose) enriched._remainingShares = openShares - sellShares
        } else if (openPositions.length > 1) {
          // Multiple open positions → flag for user selection
          enriched._multipleOpen   = true
          enriched._openOptions    = openPositions.map(t=>{
            const sh = parseFloat(t.shares||0)
            const px = parseFloat(t.price||0)
            const fx = t.fx  // already normalized above
            const capital_eur = Math.round(sh * px / fx)
            return { id: t.id, entry_date: t.date, shares: sh, entry_price: px, capital_eur }
          })
          // Pre-select oldest (FIFO) but user can change
          const presel = openPositions[0]
          const openShares = parseFloat(presel.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = presel.id
          enriched._closesSymbol   = presel.symbol
          enriched._openEntryDate  = presel.date
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

  // Anota fills crudos con status basado en FIFO matching (para vista sin agrupar)
  const annotateFillsWithFifo = (rawRows) => {
    if (!rawRows || rawRows.length === 0) return rawRows
    const bySymbol = {}
    rawRows.forEach((r, i) => {
      const k = (r.symbol || '').trim()
      if (!bySymbol[k]) bySymbol[k] = []
      bySymbol[k].push({ r, i })
    })
    const statusMap = new Array(rawRows.length).fill('open')
    Object.entries(bySymbol).forEach(([, fills]) => {
      // Comparador correcto: BUY antes que SELL en misma fecha para FIFO correcto
      const sorted = [...fills].sort((a, b) => {
        const da = a.r.entry_date || '', db = b.r.entry_date || ''
        if (da < db) return -1; if (da > db) return 1
        if (a.r.fill_type==='buy' && b.r.fill_type!=='buy') return -1
        if (a.r.fill_type!=='buy' && b.r.fill_type==='buy') return 1
        return 0
      })
      const buyQueue = [] // {origIdx, sharesLeft}
      sorted.forEach(({ r, i }) => {
        if (r.fill_type === 'buy') {
          buyQueue.push({ origIdx: i, sharesLeft: Number(r.shares) })
        } else {
          const totalShares = Number(r.shares)
          let remaining = totalShares
          while (remaining > 0.001 && buyQueue.length > 0) {
            const head = buyQueue[0]
            const take = Math.min(head.sharesLeft, remaining)
            head.sharesLeft -= take
            remaining -= take
            if (head.sharesLeft < 0.001) {
              statusMap[head.origIdx] = 'closed'
              buyQueue.shift()
            }
          }
          if (totalShares - remaining > 0.001) {
            // Consumió al menos una compra → fill de cierre
            statusMap[i] = 'sell_close'
          } else {
            // Sin BUY disponible → sell huérfano (proviene de operación externa)
            statusMap[i] = 'orphan'
          }
        }
      })
    })
    return rawRows.map((r, i) => ({ ...r, status: statusMap[i] }))
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
      // Ordenar todos los fills cronológicamente (BUYs antes que SELLs en misma fecha)
      const sorted = [...fills].sort((a,b)=>{
        const da=a.entry_date||'', db=b.entry_date||''
        if(da<db) return -1; if(da>db) return 1
        // Misma fecha: BUY antes que SELL para FIFO correcto
        if(a.fill_type==='buy'&&b.fill_type!=='buy') return -1
        if(a.fill_type!=='buy'&&b.fill_type==='buy') return 1
        return 0
      })
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
              fill_type:'sell', status:'orphan'
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
    setTlForm(f=>({...f,_fxLoading:true,fx_manual:false}))
    fetch(`/api/tradelog?action=fx&currency=${cur}&date=${date}`)
      .then(r=>r.json())
      .then(j=>{ if(j.fx) setTlForm(f=>({...f,fx:parseFloat(j.fx).toFixed(4),_fxLoading:false})) })
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

  // alarmStatus[symbol][alarmId] = true|false|null — restaurado desde caché localStorage al montar
  const [alarmStatus,setAlarmStatus]=useState(()=>{
    try{const c=localStorage.getItem('alarm_status_cache');if(c){const{data}=JSON.parse(c);return data||{}}}catch(_){}
    return {}
  })
  const [alarmStatusLoading,setAlarmStatusLoading]=useState(false)
  const [alarmCheckProgress,setAlarmCheckProgress]=useState(null)  // {done,total} durante comprobación
  const [alertsLastUpdated,setAlertsLastUpdated]=useState(null)     // timestamp de última actualización correcta

  const reloadWatchlist=()=>{
    setWlLoading(true)
    Promise.all([fetchWatchlist(),fetchWatchlistLists()])
      .then(([data,lists])=>{ if(data.length>0) setWatchlist(data); setWlLists(lists) })
      .catch(()=>{})
      .finally(()=>setWlLoading(false))
  }
  const stratLoadedRef=useRef(false)
  const mcStratInitRef=useRef(false)  // true once auto-preselection of active strategy has run
  const reloadStrategies=(applyDefault=false)=>{
    setStrLoading(true)
    const uid=getUidFromJwt()
    const supaFetch=uid
      ?fetch(`${getSupaUrl()}/rest/v1/user_settings?user_id=eq.${uid}&select=settings`,{headers:getSupaH()}).then(r=>r.json()).catch(()=>null)
      :Promise.resolve(null)
    Promise.all([fetchStrategies(),supaFetch])
      .then(([data,settRows])=>{
        setStrategies(data)
        // On first load only: apply default strategy from settings (if any)
        if(applyDefault&&!stratLoadedRef.current&&data.length>0){
          stratLoadedRef.current=true
          try{
            // Supabase tiene prioridad sobre localStorage
            const supaDefId=settRows?.[0]?.settings?.defaultStrategyId
            const lsDefId=JSON.parse(localStorage.getItem('v50_settings')||'{}').defaultStrategyId
            const defId=supaDefId||lsDefId
            if(defId){
              const match=data.find(s=>String(s.id)===String(defId))
              if(match){
                loadStrategyLegacy(match,{navigateToConfig:false})
              } else {
                try{const _s=JSON.parse(localStorage.getItem('v50_settings')||'{}');delete _s.defaultStrategyId;localStorage.setItem('v50_settings',JSON.stringify(_s))}catch(_){}
                stopStrategy({skipDebounce:false})
              }
            } else {
              stopStrategy({skipDebounce:false})
            }
          }catch(e){}
        }
      })
      .catch(()=>{})
      .finally(()=>setStrLoading(false))
  }
  const reloadConditions=()=>{
    setCondLoading(true)
    return fetchConditions().then(d=>setConditions(d||[])).catch(()=>{}).finally(()=>setCondLoading(false))
  }

  // Auto-preseleccionar estrategia activa en multiactivo al cargar por primera vez
  useEffect(()=>{
    if(mcStratInitRef.current||!currentStratId||!strategies.length) return
    if(!strategies.some(s=>s.id===currentStratId)) return
    mcStratInitRef.current=true
    setMcStratSelected(prev=>prev.length===0?[currentStratId]:prev)
  },[currentStratId,strategies])

  // Sync colors from params.color (JSONB) into local condColors state
  useEffect(()=>{
    if(!conditions.length) return
    setCondColorsState(prev=>{
      const next={...prev}
      let changed=false
      conditions.forEach(c=>{
        const col = c.params?.color
        if(col&&!next[c.id]){next[c.id]=col;changed=true}
      })
      if(!changed) return prev
      try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');if(!s.watchlist)s.watchlist={};s.watchlist.condColors=next;const _f1=JSON.parse(localStorage.getItem('v50_settings')||'{}');if(_f1.defaultStrategyId)s.defaultStrategyId=_f1.defaultStrategyId;localStorage.setItem('v50_settings',JSON.stringify(s))}catch{}
      return next
    })
  },[conditions]) // eslint-disable-line

  const onAlarmPriceDrag=async(alarmId,newPrice)=>{
    // Optimistic update
    setAlarms(prev=>prev.map(a=>a.id===alarmId?{...a,price_level:newPrice}:a))
    try{ await upsertAlarm({id:alarmId,price_level:newPrice}) }catch(e){ reloadAlarms() }
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
            // Re-leer por si loadStrategyLegacy escribió defaultStrategyId mientras tanto
            const _fresh1=JSON.parse(localStorage.getItem('v50_settings')||'{}')
            if(_fresh1.defaultStrategyId) s.defaultStrategyId=_fresh1.defaultStrategyId
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
      list_ids:item.list_ids||[],favorite:item.favorite||false,
      observations:item.observations||''
    })
  }
  const closeEditItem=()=>{
    if(wlManagerReturn){setShowWlManager(true);setWlManagerReturn(false)}
    setEditingItem(null);setEditForm({})
  }
  const saveEditItem=async()=>{
    setEditSaving(true)
    try{
      const saved=await upsertWatchlistItem({...editForm,id:editingItem?.id||undefined})
      const itemId=saved?.id||editingItem?.id
      if(itemId) await setItemLists(itemId,editForm.list_ids||[])
      reloadWatchlist(); closeEditItem()
    }catch(e){alert('Error: '+e.message)}
    finally{setEditSaving(false)}
  }
  const deleteItem=async(id)=>{
    if(!confirm('¿Eliminar este activo?')) return
    await deleteWatchlistItem(id); reloadWatchlist()
  }
  const newItem=()=>{
    const sym=simbolo||''
    const nm=sym?lookupName(sym)||'':''
    openEditItem({id:null,symbol:sym,name:nm,group_name:'Acciones',list_ids:[],favorite:false,observations:''})
  }

  // Abrir editor estrategia
  const openEditStr=(s)=>{
    setEditingStr(s)
    // Ocultar meta-params (intervalo) del textarea — se gestionan por badge D/S
    let paramsDisplay=s.params||''
    try{
      const p=typeof s.params==='string'?JSON.parse(s.params||'{}'):(s.params||{})
      const {intervalo:_iv,...rest}=p
      paramsDisplay=Object.keys(rest).length?JSON.stringify(rest,null,2):''
    }catch(_){}
    setStrForm({
      name:s.name||'',
      years:s.years||5,
      capital_ini:s.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||10000}catch(_){return 10000}})(),
      allocation_pct:s.allocation_pct||100,
      color:s.color||'#00d4ff',
      observations:s.observations||'',
      description:s.description||'',
      params:paramsDisplay,
      code_js:s.code_js||'',
      code_pine:s.code_pine||'',
      summary:s.summary||'',
      visuals:s.visuals||'',
      // _intervalo: meta-param extraído de params.intervalo — se gestiona con el badge D/S del editor
      _intervalo:(()=>{try{const p=typeof s.params==='string'?JSON.parse(s.params||'{}'):(s.params||{});return p.intervalo||'diario'}catch(_){return 'diario'}})(),
    })
  }
  const closeEditStr=()=>{
    if(stratManagerReturn){setShowStratManager(true);setStratManagerReturn(false)}
    setEditingStr(null);setStrForm({})
  }
  const saveEditStr=async()=>{
    setStrSaving(true)
    try{
      // Restaurar meta-params (intervalo) desde editingStr antes de guardar
      let mergedParams=strForm.params||''
      try{
        const newP=strForm.params?.trim()?JSON.parse(strForm.params):{}
        const oldP=typeof editingStr?.params==='string'?JSON.parse(editingStr.params||'{}'):(editingStr?.params||{})
        const iv=strForm._intervalo||oldP.intervalo
        if(iv) newP.intervalo=iv
        mergedParams=JSON.stringify(newP)
      }catch(_){}
      const payload={
        ...strForm,
        params:mergedParams,
        id:editingStr?.id||undefined,
        years:Number(strForm.years||5),
        capital_ini:Number(strForm.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||1000}catch(_){return 1000}})()),
        allocation_pct:Number(strForm.allocation_pct||100),
      }
      const saved=await upsertStrategy(payload)
      reloadStrategies(); closeEditStr()
      if(saved?.id) run(simbolo,{strategyId:saved.id,capital_ini:Number(payload.capital_ini),years:Number(payload.years),allocation_pct:Number(payload.allocation_pct||100),filtros})
    }catch(e){alert('Error: '+e.message)}
    finally{setStrSaving(false)}
  }
  const cloneEditStr=async()=>{
    setStrSaving(true)
    try{
      let mergedParams=strForm.params||''
      try{
        const newP=strForm.params?.trim()?JSON.parse(strForm.params):{}
        const oldP=typeof editingStr?.params==='string'?JSON.parse(editingStr.params||'{}'):(editingStr?.params||{})
        const iv=strForm._intervalo||oldP.intervalo
        if(iv) newP.intervalo=iv
        mergedParams=JSON.stringify(newP)
      }catch(_){}
      const payload={
        ...strForm,
        params:mergedParams,
        id:undefined,
        name:'Copia de '+(strForm.name||'estrategia'),
        years:Number(strForm.years||5),
        capital_ini:Number(strForm.capital_ini||10000),
        allocation_pct:Number(strForm.allocation_pct||100),
      }
      await upsertStrategy(payload)
      reloadStrategies(); closeEditStr()
    }catch(e){alert('Error clonando: '+e.message)}
    finally{setStrSaving(false)}
  }
  const deleteStr=async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await deleteStrategy(id); reloadStrategies()
  }
  // Lee intervalo guardado en stratParams de una estrategia; default 'diario'
  const readStratIntervalo=(s)=>{
    try{const p=typeof s?.params==='string'?JSON.parse(s.params||'{}'):(s?.params||{});return p.intervalo||'diario'}
    catch{return 'diario'}
  }

  // Carga todos los rankings de Supabase y calcula la mejor estrategia por símbolo
  const refreshBestStratPerSymbol=useCallback(async()=>{
    if(!getSupaUrl()) return
    try{
      const rows=await loadAllRankingsRemote()
      if(!rows?.length) return
      // Agrupar por símbolo
      const grouped={}
      rows.forEach(r=>{
        const sym=(r.symbol||'').toUpperCase()
        if(!grouped[sym]) grouped[sym]=[]
        grouped[sym].push(r)
      })
      const bySymbol={}
      Object.entries(grouped).forEach(([sym,symRows])=>{
        const stratIds=new Set(symRows.map(r=>r.strategy_id).filter(Boolean))
        // Preferir candidatos con métricas completas; si no hay, usar los que tengan score_historico
        const complete=symRows.filter(r=>r.cagr_simple!=null&&r.win_rate!=null&&r.max_drawdown!=null)
        const candidates=complete.length>0?complete:symRows.filter(r=>r.score_historico!=null)
        if(!candidates.length) return // sin candidatos válidos
        const best=candidates.reduce((acc,r)=>(r.score_historico??0)>(acc?.score_historico??0)?r:acc,null)
        if(!best) return
        const strat=strategies.find(s=>s.id===best.strategy_id)
        let stratIntervalo='diario'
        try{const p=typeof strat?.params==='string'?JSON.parse(strat.params||'{}'):(strat?.params||{});stratIntervalo=p.intervalo||'diario'}catch(_){}
        bySymbol[sym]={stratName:strat?.name||'',stratId:best.strategy_id,score:best.score,scoreHistorico:best.score_historico??null,scoreCompleto:best.score_completo??null,updatedAt:best.updated_at??null,intervalo:stratIntervalo,stratCount:stratIds.size}
      })
      setBestStratBySymbol(bySymbol)
      return bySymbol
    }catch(e){console.warn('[refreshBestStrat]',e.message);return null}
  },[strategies])

  // Carga todos los datos desde Supabase y rellena wlData para ambas vistas
  const refreshWlData = useCallback(async () => {
    if(!getSupaUrl()) return
    try {
      let url=`${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score_historico,score_completo,updated_at,cagr_simple,win_rate,max_drawdown,total_trades,profit_simple&limit=10000`
      let res=await fetch(url,{headers:getSupaH()})
      if(!res.ok){
        url=`${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score_historico,score_completo,updated_at,cagr_simple,win_rate,max_drawdown,total_trades&limit=10000`
        res=await fetch(url,{headers:getSupaH()})
      }
      if(!res.ok) return
      const rows=(await res.json())||[]
      const bySym={}
      rows.forEach(r=>{const sym=(r.symbol||'').toUpperCase();if(!bySym[sym])bySym[sym]=[];bySym[sym].push(r)})
      const toEntry=(row)=>{
        if(!row) return undefined
        const strat=strategies.find(s=>s.id===row.strategy_id)
        let intervalo='diario'
        try{const p=typeof strat?.params==='string'?JSON.parse(strat.params||'{}'):(strat?.params||{});intervalo=p.intervalo||'diario'}catch(_){}
        return{scoreMetricas:row.score_historico??null,scoreMetSeñ:row.score_completo??null,
          cagr:row.cagr_simple??null,profit:row.profit_simple??null,winRate:row.win_rate??null,
          maxDD:row.max_drawdown??null,ops:row.total_trades??null,
          stratName:strat?.name||'',stratId:row.strategy_id,intervalo,updatedAt:row.updated_at??null}
      }
      const newWlData={}
      Object.entries(bySym).forEach(([sym,symRows])=>{
        const activeRow=currentStratId?symRows.find(r=>r.strategy_id===currentStratId):null
        // Top: la estrategia con mayor CAGR entre las filas con métricas completas
        // (mismo criterio que calcMetricas fase 2 — no usa score_historico que puede ser null)
        const complete=symRows.filter(r=>r.cagr_simple!=null&&r.win_rate!=null&&r.max_drawdown!=null)
        const topRow=complete.length>0
          ?complete.reduce((acc,r)=>(r.cagr_simple??-Infinity)>(acc?.cagr_simple??-Infinity)?r:acc,null)
          :null
        // Si no hay activeRow pero solo hay una estrategia con datos, usarla como activa también
        const fallbackActive = !activeRow && symRows.length===1 ? symRows[0] : activeRow
        newWlData[sym]={active:toEntry(fallbackActive),top:toEntry(topRow)}
      })
      setWlData(newWlData)
    }catch(e){console.warn('[refreshWlData]',e.message)}
  },[currentStratId,strategies])

  // useEffect aquí, DESPUÉS de la declaración de refreshBestStratPerSymbol para evitar TDZ
  useEffect(()=>{ refreshBestStratPerSymbol() },[refreshBestStratPerSymbol])
  useEffect(()=>{ refreshWlData() },[refreshWlData])

  // Limpieza única al inicio: eliminar filas corruptas (score sin métricas)
  useEffect(()=>{ cleanCorruptRankingRows() },[]) // eslint-disable-line

  // ── Auto-refresh Score mét.+señales al cargar (una sola vez cuando wlData tiene datos) ──
  const autoRefreshTriggered = useRef(false)
  useEffect(()=>{
    if(autoRefreshTriggered.current) return
    const hasData = Object.keys(wlData).some(sym => wlData[sym]?.active?.scoreMetricas != null)
    if(!hasData) return
    autoRefreshTriggered.current = true
    const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const hours = sett.ranking?.autoRefreshScoreMetSenHours ?? 24
    if(hours === 0) return
    const last = localStorage.getItem('wl_score_metsen_last_updated')
    const elapsed = last ? (Date.now() - Number(last)) / 3600000 : Infinity
    if(elapsed >= hours){
      calcScoreMetricas().then(r => { if(r?.ok !== false) calcScoreMetSen() }).catch(()=>{})
    }
  },[wlData]) // eslint-disable-line

  function stopStrategy({skipDebounce=true}={}) {
    if(skipDebounce) skipNextRunRef.current = true
    setResult(null)
    setError(null)
    setCurrentStratId(null)
    setEstrategiaIntervalo('diario')
    setStratName('')
    try {
      const s = JSON.parse(localStorage.getItem('v50_settings') || '{}')
      delete s.defaultStrategyId
      localStorage.setItem('v50_settings', JSON.stringify(s))
    } catch(_) {}
    // Cargar velas limpias del símbolo activo sin backtest
    fetch(`/api/chartdata?symbol=${encodeURIComponent(simbolo)}&years=${years}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length) {
          savedRangeRef.current=null   // reset zoom so recentMonths is applied on new load
          isNewResultRef.current=true  // tell CandleChart to ignore savedRange on first mount
          setChartViewFull(false)
          setResult({ chartData: data, trades: [], isBareChart: true })
          setDisplayedSimbolo(simbolo) // sync display name once bare chart data is ready
        }
      })
      .catch(() => {})
  }

  const loadStrategyLegacy=(s,{navigateToConfig=true}={})=>{
    // Load strategy params from definition into the cfg panel state
    const def  = s.definition || {}
    const entry = def.entry || {}
    const stop  = def.stop  || {}
    const mgmt  = def.management || {}
    const filt  = def.filters?.market?.[0] || {}
    setEmaR(entry.ma_fast || entry.ma_period || 10)
    setEmaL(entry.ma_slow || 11)
    setYears(s.years || 5)
    setCapitalIni(s.capital_ini || 10000)
    setTipoStop(stop.type === 'atr_based' ? 'atr' : stop.type === 'none' ? 'none' : 'tecnico')
    setAtrP(stop.atr_period || 14)
    setAtrM(stop.atr_mult || 1.0)
    setSinPerdidas(mgmt.sin_perdidas !== false)
    setReentry(mgmt.reentry !== false)
    setTipoFiltro(filt.condition || 'none')
    setSp500EmaR(filt.ma_fast || 10)
    setSp500EmaL(filt.ma_slow || 11)
    setStrForm(f=>({...f,_loadedName:s.name}))
    setStratName(s.name||'')
    setCurrentStratId(s.id||null)
    setEstrategiaIntervalo(readStratIntervalo(s))
    if(navigateToConfig) setSidePanel('config')
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(s.id){
      loadRankingRemote(s.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(s.id);setRankingStratName(s.name||'')}
      }).catch(()=>{})
    }
    try{
      if(s?.id){
        const _s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
        _s.defaultStrategyId=s.id
        localStorage.setItem('v50_settings',JSON.stringify(_s))
      }
    }catch(_){}
  }
  const newStrategy=()=>openEditStr({id:null})
  const duplicateStr=(s)=>openEditStr({...s,id:null,name:s.name+' (copia)'})
  const toggleStrategyEnabled=useCallback(async(stratId, enabled)=>{
    // Optimistic update
    setStrategies(prev=>prev.map(s=>s.id===stratId?{...s,enabled}:s))
    try {
      const res=await apiFetch('/api/strategies',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:stratId,enabled})})
      if(!res.ok){
        const txt=await res.text().catch(()=>'')
        // Si la columna enabled no existe, loguear SQL para crearla
        if(txt.includes('enabled')||txt.includes('column')){
          console.warn('[toggleStrategyEnabled] Columna enabled ausente. SQL:\nALTER TABLE strategies ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;')
        }
        throw new Error(txt||`HTTP ${res.status}`)
      }
    } catch(e) {
      console.warn('[toggleStrategyEnabled]',e.message)
      // Revert on error
      setStrategies(prev=>prev.map(s=>s.id===stratId?{...s,enabled:!enabled}:s))
    }
  },[setStrategies])

  // ── Actualización masiva de estrategias (desde StrategyManager) ──
  const bulkUpdateStrategies=useCallback(async(updates)=>{
    // Actualización optimista inmediata
    setStrategies(prev=>prev.map(s=>{
      const u=updates.find(x=>x.id===s.id)
      if(!u) return s
      const {id:_,...fields}=u
      return {...s,...fields}
    }))
    // Persistir cada cambio en Supabase
    for(const u of updates){
      try{ await upsertStrategy(u) }
      catch(e){ console.warn('[bulkUpdateStrategies]',u.id,e.message) }
    }
  },[setStrategies])

  // ── Panel scale (Ctrl+Scroll por panel) ──
  const handlePanelScaleWheel=useCallback((panel,e)=>{
    if(!e.ctrlKey)return
    e.preventDefault()
    const curr=panelScale[panel]||1
    const next=Math.min(2.0,Math.max(0.5,Math.round((curr+(e.deltaY<0?0.05:-0.05))*100)/100))
    const updated={...panelScale,[panel]:next}
    setPanelScale(updated)
    try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');if(!s.ui)s.ui={};s.ui.panelScale=updated;localStorage.setItem('v50_settings',JSON.stringify(s))}catch{}
  },[panelScale])

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
  const alarmActiveCount = (alarms||[]).filter(a=>
    a.symbol && alarmStatus[a.symbol]?.[a.id]?.active===true
    && !ackedAlarms.has(`${a.symbol}::${a.id}`)
  ).length

  const refreshAlarmStatus=useCallback(async(wl,al,forceRefresh=false)=>{
    const wlList=wl||watchlist
    const alarmList=al||alarms
    const symbols=wlList.map(w=>w.symbol)
    const libCondsCheck=lsGetConds().filter(c=>c.active!==false)
    if(!symbols.length||(!alarmList.length&&!libCondsCheck.length)) return
    setAlarmStatusLoading(true)
    setAlarmCheckProgress({done:0,total:symbols.length})
    try{
      // Merge real alarms + library conditions for watchlist dots
      const libConds=lsGetConds().filter(c=>c.active!==false)
      const pseudoAlarms=libConds.map(c=>({
        id:c.id,condition:c.type,
        ema_r:c.params?.ma_fast||c.params?.ma_period||10,
        ema_l:c.params?.ma_slow||11,params:c.params,
      }))
      const realAlarmIds=new Set(alarmList.map(a=>a.id))
      const extraConds=pseudoAlarms.filter(p=>!realAlarmIds.has(p.id))
      const allEvalAlarms=[...alarmList.map(a=>({id:a.id,symbol:a.symbol,condition:a.condition,condition_detail:a.condition_detail,price_level:a.price_level,ema_r:a.ema_r,ema_l:a.ema_l,params:a.params})),...extraConds]

      // Pre-fetch closes con caché en memoria (TTL configurable). forceRefresh=true lo ignora.
      const closes={}
      const _cacheSett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
      const TTL=(_cacheSett.alarmas?.cacheTTLMinutes??20)*60*1000
      const _bs=4
      for(let _i=0;_i<symbols.length;_i+=_bs){
        const _batch=symbols.slice(_i,_i+_bs)
        await Promise.all(_batch.map(async sym=>{
          try{
            const cached=closesCache.current[sym]
            if(!forceRefresh&&cached&&(Date.now()-cached.ts)<TTL){
              closes[sym]=cached.data  // hit de caché
            } else {
              const r=await apiFetch(`/api/closes?symbol=${sym}&days=300`)
              const data=await r.json()
              if(Array.isArray(data)&&data.length>=30){
                closes[sym]=data
                closesCache.current[sym]={data,ts:Date.now()}
              }
            }
          }catch{}
        }))
        setAlarmCheckProgress({done:Math.min(_i+_bs,symbols.length),total:symbols.length})
        if(_i+_bs<symbols.length) await new Promise(r=>setTimeout(r,400))
      }
      const res=await apiFetch('/api/status',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbols,alarms:allEvalAlarms,closes})
      })
      const data=await res.json()
      const prev=alarmStatus||{}
      const newStatus=data||{}
      setAlarmStatus(newStatus)
      try{localStorage.setItem('alarm_status_cache',JSON.stringify({data:newStatus,ts:Date.now()}))}catch(_){}
      // Popup en alarmas nuevas
      try{
        const sett=JSON.parse(localStorage.getItem('v50_settings')||'{}')
        if(sett?.alarmas?.popupOnTrigger!==false){
          const triggered=[]
          for(const sym of Object.keys(newStatus||{})){
            for(const aid of Object.keys(newStatus[sym]||{})){
              if(newStatus[sym]?.[aid]?.active===true&&!prev[sym]?.[aid]?.active){
                const al=alarms.find(a=>a.id===aid)
                if(al) triggered.push({symbol:sym,name:al.name,condition:al.condition})
              }
            }
          }
          if(triggered.length>0) setAlarmPopup(triggered)
        }
      }catch(_){}
      setAlertsLastUpdated(Date.now())
    }catch(e){console.error('refreshAlarmStatus error',e)}
    finally{setAlarmStatusLoading(false);setAlarmCheckProgress(null)}
  },[watchlist,alarms])

  // ── Watchlist filtrado por listas seleccionadas (para umbral auto-refresh y botón ↻) ──
  const filteredWlItems=useMemo(()=>{
    if(selectedLists.length===0) return watchlist
    const namedSel=selectedLists.filter(s=>s!=='__unassigned__')
    const hasUnassigned=selectedLists.includes('__unassigned__')
    return watchlist.filter(w=>{
      const listIds=w.list_ids||[]
      if(hasUnassigned&&listIds.length===0) return true
      if(namedSel.length>0&&listIds.some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&namedSel.includes(l.name)})) return true
      return false
    })
  },[watchlist,selectedLists,wlLists])

  // CAMBIO 1 — Persistir selección de listas en localStorage
  useEffect(()=>{
    try{const v=localStorage.getItem('watchlist_selected_lists');if(v){const p=JSON.parse(v);if(Array.isArray(p))setSelectedLists(p)}}catch(_){}
  },[]) // solo al montar
  useEffect(()=>{
    try{localStorage.setItem('watchlist_selected_lists',JSON.stringify(selectedLists))}catch(_){}
  },[selectedLists])

  // CAMBIO 2 — Auto-refresh solo si filteredWlItems.length <= alertThreshold (configurable en Settings)
  useEffect(()=>{
    const count=filteredWlItems.length
    if(count>0&&(alarms.length>0||conditions.length>0)&&count<=alertThreshold)
      refreshAlarmStatus(filteredWlItems,alarms)
  },[alarms,conditions.length,filteredWlItems.length,selectedLists.length,alertThreshold]) // eslint-disable-line

  // ── Ranking: ejecuta backtest en paralelo sobre toda la watchlist ──
  // Usa gananciaSimple (CAGR Simple) para puntuar. Score ponderado:
  // CAGR Simple (25%) + Win Rate (25%) + Profit Factor (25%) + CAGR Robusto (20%) − MaxDD (5%)
  const calcRanking = useCallback(async (rankSymbols=null) => {
    // Use the currently visible/filtered watchlist items
    // (passed as argument, falls back to full watchlist)
    const syms = (rankSymbols || watchlist).map(w=>w.symbol)
    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})

    const sett = (()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    // ── Pesos de bloque ──
    const wMercado    = (sett.ranking?.rankingWeightMercado   ?? 20) / 100
    const wHistorico  = (sett.ranking?.rankingWeightHistorico ?? 80) / 100
    // ── Pesos métricas de mercado ──
    const momPct      = (sett.ranking?.rankingMomentumPct  ?? 33) / 100
    const frPct       = (sett.ranking?.rankingFRPct        ?? 33) / 100
    const max52Pct    = (sett.ranking?.rankingMax52Pct     ?? 34) / 100
    const momN        = Math.max(5, sett.ranking?.rankingMomentumN ?? 20)
    // ── Pesos métricas históricas ──
    const wrPct       = (sett.ranking?.rankingWinRatePct      ?? 33) / 100
    const cagrPct     = (sett.ranking?.rankingCAGRPct         ?? 33) / 100
    const cagrRobPct  = (sett.ranking?.rankingCAGRRobustoPct  ?? 34) / 100
    const ddPct       = (sett.ranking?.rankingMaxDDPct        ?? 0)  / 100
    const minTrades   = sett.ranking?.minTrades ?? 3

    // ── Fetch SP500 closes una vez si las métricas de mercado están activas ──
    let sp500Closes = null
    if (wMercado > 0 && frPct > 0) {
      try {
        const r = await apiFetch('/api/closes?symbol=%5EGSPC&days=300')
        if (r.ok) sp500Closes = await r.json()
      } catch(e) { console.warn('[calcRanking] SP500 fetch failed:', e.message) }
    }

    const BATCH = 4
    const results = {}
    const norm=(v,mn,mx)=>Math.max(0,Math.min(100,(v-mn)/(mx-mn)*100))

    for (let i=0; i<syms.length; i+=BATCH) {
      const batch = syms.slice(i, i+BATCH)
      await Promise.allSettled(batch.map(async sym => {
        try {
          const res = await apiFetch('/api/datos', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ simbolo:sym, strategyId:currentStratId, capital_ini:Number(capitalIni), years:Number(years), allocation_pct:100, filtros, intervalo:estrategiaIntervalo })
          })
          const json = await res.json()
          if (!res.ok || !json.trades?.length) return
          const trades = json.trades
          if (trades.length < minTrades) return

          // ── Métricas históricas ──
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
          const maxDD=json.maxDDStrategyFloat??json.maxDDStrategy??0
          const scoreHistorico=Math.max(0,Math.min(100,
            norm(winRate,20,80)*wrPct +
            norm(cagr,-20,60)*cagrPct +
            norm(cagrRobust,-20,50)*cagrRobPct -
            norm(maxDD,0,60)*ddPct
          ))

          // ── Métricas de mercado (desde chartData) ──
          let scoreMercado=0
          if (wMercado > 0) {
            const priceArr=(json.chartData||[]).map(d=>d.close).filter(v=>v!=null&&!isNaN(v))
            if (priceArr.length >= momN+1) {
              const lastP=priceArr[priceArr.length-1]
              const momP=priceArr[Math.max(0,priceArr.length-1-momN)]
              const momentum=momP>0?(lastP/momP-1)*100:0
              const hist252=priceArr.slice(-252)
              const high52=Math.max(...hist252)
              const proximity52=high52>0?(lastP/high52)*100:50  // 50 = neutral if no data
              let relStrength=0
              if (sp500Closes?.length>=64&&frPct>0) {
                const spLast=sp500Closes[sp500Closes.length-1]
                const sp63=sp500Closes[sp500Closes.length-64]
                const spRet=sp63>0?(spLast/sp63-1)*100:0
                const asset63=priceArr.length>=64?priceArr[priceArr.length-64]:priceArr[0]
                const assetRet=asset63>0?(lastP/asset63-1)*100:0
                relStrength=assetRet-spRet
              } else if (sp500Closes===null&&frPct>0) {
                console.warn(`[calcRanking] ${sym}: sin datos SP500, fuerza relativa omitida`)
              }
              scoreMercado=Math.max(0,Math.min(100,
                norm(momentum,-20,40)*momPct +
                norm(relStrength,-30,30)*frPct +
                norm(proximity52,50,100)*max52Pct
              ))
            } else {
              console.warn(`[calcRanking] ${sym}: datos de precio insuficientes para métricas de mercado`)
            }
          }

          const scoreCompleto=Math.max(0,Math.min(100,
            scoreHistorico*wHistorico + scoreMercado*wMercado
          ))
          results[sym.toUpperCase()]={
            score:          scoreCompleto,   // backward compat
            scoreCompleto,
            scoreHistorico,
            profitSimple:   json.gananciaSimple ?? null,
            metrics:{winRate,factorBen,cagr,cagrRobust,maxDD,trades:trades.length,profit:json.gananciaSimple??null}
          }
        } catch(e){ console.error('[calcRanking]', sym, e) }
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
    refreshBestStratPerSymbol().catch(()=>{})
  }, [watchlist,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,currentStratId,stratName,filtros,estrategiaIntervalo,refreshBestStratPerSymbol])

  // ── Calcular Ranking para TODAS las estrategias en secuencia → determina Top estrategia ──
  const calcRankingAllStrategies = useCallback(async (filteredSymbols=null) => {
    const enabledStrats = (strategies||[]).filter(s => s.enabled !== false)
    if (!enabledStrats.length) return
    setTopStratRunning(true)
    setTopStratProgress({current:0, total:enabledStrats.length})

    const syms = (filteredSymbols || watchlist).map(w => w.symbol)
    const sett = (()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const wMercado   = (sett.ranking?.rankingWeightMercado   ?? 20) / 100
    const wHistorico = (sett.ranking?.rankingWeightHistorico ?? 80) / 100
    const momPct     = (sett.ranking?.rankingMomentumPct  ?? 33) / 100
    const frPct      = (sett.ranking?.rankingFRPct        ?? 33) / 100
    const max52Pct   = (sett.ranking?.rankingMax52Pct     ?? 34) / 100
    const momN       = Math.max(5, sett.ranking?.rankingMomentumN ?? 20)
    const wrPct      = (sett.ranking?.rankingWinRatePct      ?? 33) / 100
    const cagrPct    = (sett.ranking?.rankingCAGRPct         ?? 33) / 100
    const cagrRobPct = (sett.ranking?.rankingCAGRRobustoPct  ?? 34) / 100
    const ddPct      = (sett.ranking?.rankingMaxDDPct        ?? 0)  / 100
    const minTrades  = sett.ranking?.minTrades ?? 3
    const norm = (v,mn,mx) => Math.max(0, Math.min(100, (v-mn)/(mx-mn)*100))

    let sp500Closes = null
    if (wMercado > 0 && frPct > 0) {
      try {
        const r = await apiFetch('/api/closes?symbol=%5EGSPC&days=300')
        if (r.ok) sp500Closes = await r.json()
      } catch(e) { console.warn('[calcRankingAll] SP500 fetch failed:', e.message) }
    }

    const BATCH = 4
    let _exitosas = 0, _fallidas = 0, _fallidasNombres = []
    for (let si = 0; si < enabledStrats.length; si++) {
      const strat = enabledStrats[si]
      console.log('[ALL-RANKING] Procesando estrategia:', strat.name, strat.id)
      setTopStratProgress({current: si + 1, total: enabledStrats.length})
      const stratId = strat.id
      const stratYears  = strat.years || Number(years)
      const stratCap    = strat.capital_ini || Number(capitalIni)
      const stratIntv   = (()=>{try{const p=typeof strat?.params==='string'?JSON.parse(strat.params||'{}'):(strat?.params||{});return p.intervalo||'diario'}catch(_){return 'diario'}})()
      const results = {}
      let _stratError = null
      try {
      for (let i = 0; i < syms.length; i += BATCH) {
        const batch = syms.slice(i, i + BATCH)
        await Promise.allSettled(batch.map(async sym => {
          try {
            const res = await apiFetch('/api/datos', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ simbolo:sym, strategyId:stratId, capital_ini:stratCap, years:stratYears, allocation_pct:100, filtros, intervalo:stratIntv })
            })
            const json = await res.json()
            if (!res.ok || !json.trades?.length) return
            const trades = json.trades
            if (trades.length < minTrades) return
            const wins = trades.filter(t=>t.pnlPct>=0), losses = trades.filter(t=>t.pnlPct<0)
            const winRate = (wins.length/trades.length)*100
            const totalDiasNat = json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*stratYears
            const anios = Math.max(totalDiasNat/365.25, 0.01)
            const capFinal = stratCap + json.gananciaSimple
            const cagr = capFinal>0?(Math.pow(capFinal/stratCap,1/anios)-1)*100:-99
            const sorted3 = [...trades].sort((a,b)=>b.pnlSimple-a.pnlSimple).slice(3)
            const ganRobust = sorted3.reduce((s,t)=>s+t.pnlSimple, 0)
            const capRob = stratCap + ganRobust
            const cagrRobust = capRob>0?(Math.pow(capRob/stratCap,1/anios)-1)*100:-99
            const maxDD = json.maxDDStrategyFloat??json.maxDDStrategy??0
            const scoreHistorico = Math.max(0, Math.min(100,
              norm(winRate,20,80)*wrPct + norm(cagr,-20,60)*cagrPct +
              norm(cagrRobust,-20,50)*cagrRobPct - norm(maxDD,0,60)*ddPct
            ))
            let scoreMercado = 0
            if (wMercado > 0) {
              const priceArr = (json.chartData||[]).map(d=>d.close).filter(v=>v!=null&&!isNaN(v))
              if (priceArr.length >= momN+1) {
                const lastP = priceArr[priceArr.length-1]
                const momP  = priceArr[Math.max(0,priceArr.length-1-momN)]
                const momentum = momP>0?(lastP/momP-1)*100:0
                const hist252 = priceArr.slice(-252), high52 = Math.max(...hist252)
                const proximity52 = high52>0?(lastP/high52)*100:50
                let relStrength = 0
                if (sp500Closes?.length>=64&&frPct>0) {
                  const spLast=sp500Closes[sp500Closes.length-1], sp63=sp500Closes[sp500Closes.length-64]
                  const spRet=sp63>0?(spLast/sp63-1)*100:0
                  const asset63=priceArr.length>=64?priceArr[priceArr.length-64]:priceArr[0]
                  const assetRet=asset63>0?(lastP/asset63-1)*100:0
                  relStrength=assetRet-spRet
                }
                scoreMercado=Math.max(0,Math.min(100,
                  norm(momentum,-20,40)*momPct + norm(relStrength,-30,30)*frPct + norm(proximity52,50,100)*max52Pct
                ))
              }
            }
            const scoreCompleto = Math.max(0, Math.min(100, scoreHistorico*wHistorico + scoreMercado*wMercado))
            results[sym.toUpperCase()] = {
              score: scoreCompleto, scoreCompleto, scoreHistorico,
              profitSimple: json.gananciaSimple ?? null,
              metrics: { winRate, cagr, cagrRobust, maxDD, trades: trades.length, profit: json.gananciaSimple ?? null }
            }
          } catch(e) { console.error('[calcRankingAll]', sym, e) }
        }))
      }
      } catch(error) {
        _stratError = error
        console.error('[ALL-RANKING] Error en estrategia:', strat.name, error)
        _fallidas++; _fallidasNombres.push(strat.name)
        continue
      }
      const sortedEntries = Object.entries(results).sort((a,b)=>b[1].score-a[1].score)
      sortedEntries.forEach(([sym],i)=>{ results[sym].rank=i+1 })
      await saveRankingRemote(results, stratId).catch(()=>{})
      console.log('[ALL-RANKING] Completada:', strat.name, 'activos procesados:', Object.keys(results).length)
      _exitosas++
    }

    console.log('[ALL-RANKING] Resumen completo:', {total: enabledStrats.length, exitosas: _exitosas, fallidas: _fallidas, fallidas_nombres: _fallidasNombres})
    await refreshBestStratPerSymbol().catch(()=>{})
    setTopStratRunning(false)
    setTopStratProgress({current:0, total:0})
  }, [strategies, watchlist, years, capitalIni, filtros, refreshBestStratPerSymbol])

  // ── Cálculo COMPLETO: Fase 1 (estrategia activa) + Fase 2 (top estrategia) ──
  // Todos los headers ↻ del WatchlistManager lanzan esta función.
  const calcRankingFull = useCallback(async (selectedItems) => {
    setCalcPhase(1)
    try { await calcRanking(selectedItems) } catch(_) {}
    setCalcPhase(2)
    try { await calcRankingAllStrategies(selectedItems) } catch(_) {}
    setCalcPhase(0)
  }, [calcRanking, calcRankingAllStrategies])

  // ── SCORE MÉTRICAS ↻ (Paso 2) — Calcula scoreHistorico desde wlData, sin backtest ──
  // Requiere: ↻ Métricas ejecutado previamente (cagr/winRate/maxDD en wlData[sym].active)
  const calcScoreMetricas = useCallback(async (rankSymbols=null) => {
    const items = rankSymbols || watchlist
    const syms = items.map(w=>w.symbol)

    // ── Verificación previa: todos los activos deben tener métricas ──
    const missingMetrics = syms.filter(sym => {
      const d = wlData[sym.toUpperCase()]?.active
      return !d || d.cagr==null || d.winRate==null || d.maxDD==null
    })
    if (missingMetrics.length > 0) {
      return { ok: false, error: 'missing_metrics', symbols: missingMetrics }
    }

    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})
    const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const wrPct=(sett.ranking?.rankingWinRatePct??33)/100, cagrPct=(sett.ranking?.rankingCAGRPct??33)/100
    const cagrRobPct=(sett.ranking?.rankingCAGRRobustoPct??34)/100, ddPct=(sett.ranking?.rankingMaxDDPct??0)/100

    // ── Normalización percentil dinámica ──
    const pct=(sett.ranking?.rankingNormPercentile??95)/100
    const getPct=(arr,p)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.max(0,Math.floor(p*(s.length-1)))]??0}
    const normDyn=(v,floor,ceil)=>Math.max(0,Math.min(100,ceil===floor?50:(v-floor)/(ceil-floor)*100))

    // Recopilar todos los valores válidos (activa y top por separado)
    const allWR  =syms.map(s=>wlData[s.toUpperCase()]?.active?.winRate).filter(v=>v!=null)
    const allCagr=syms.map(s=>wlData[s.toUpperCase()]?.active?.cagr).filter(v=>v!=null)
    const allCRob=syms.map(s=>{const d=wlData[s.toUpperCase()]?.active;return d?.cagrRobust??d?.cagr}).filter(v=>v!=null)
    const allDD  =syms.map(s=>wlData[s.toUpperCase()]?.active?.maxDD).filter(v=>v!=null)
    const allWRT =syms.map(s=>wlData[s.toUpperCase()]?.top?.winRate).filter(v=>v!=null)
    const allCT  =syms.map(s=>wlData[s.toUpperCase()]?.top?.cagr).filter(v=>v!=null)
    const allCRT =syms.map(s=>{const d=wlData[s.toUpperCase()]?.top;return d?.cagrRobust??d?.cagr}).filter(v=>v!=null)
    const allDDT =syms.map(s=>wlData[s.toUpperCase()]?.top?.maxDD).filter(v=>v!=null)

    // Suelo y techo percentiles para activa
    const [wrFl,wrCe]      =[getPct(allWR  ,1-pct),getPct(allWR  ,pct)]
    const [caFl,caCe]      =[getPct(allCagr,1-pct),getPct(allCagr,pct)]
    const [crFl,crCe]      =[getPct(allCRob,1-pct),getPct(allCRob,pct)]
    const [ddFl,ddCe]      =[getPct(allDD  ,1-pct),getPct(allDD  ,pct)]
    // para top
    const [wrFlT,wrCeT]    =[getPct(allWRT ,1-pct),getPct(allWRT ,pct)]
    const [caFlT,caCeT]    =[getPct(allCT  ,1-pct),getPct(allCT  ,pct)]
    const [crFlT,crCeT]    =[getPct(allCRT ,1-pct),getPct(allCRT ,pct)]
    const [ddFlT,ddCeT]    =[getPct(allDDT ,1-pct),getPct(allDDT ,pct)]

    // ── Calcular scoreHistorico desde wlData (sin backtest) ──
    const activeScoreMap={}, topScoreMap={}
    syms.forEach((sym,idx)=>{
      const symUp=sym.toUpperCase()
      const ad=wlData[symUp]?.active, td=wlData[symUp]?.top
      if(ad?.cagr!=null&&ad?.winRate!=null&&ad?.maxDD!=null){
        activeScoreMap[symUp]=Math.max(0,Math.min(100,
          normDyn(ad.winRate,            wrFl,wrCe)*wrPct+
          normDyn(ad.cagr,               caFl,caCe)*cagrPct+
          normDyn(ad.cagrRobust??ad.cagr,crFl,crCe)*cagrRobPct-
          normDyn(ad.maxDD,              ddFl,ddCe)*ddPct))
      }
      if(td?.cagr!=null&&td?.winRate!=null&&td?.maxDD!=null){
        topScoreMap[symUp]=Math.max(0,Math.min(100,
          normDyn(td.winRate,            wrFlT,wrCeT)*wrPct+
          normDyn(td.cagr,               caFlT,caCeT)*cagrPct+
          normDyn(td.cagrRobust??td.cagr,crFlT,crCeT)*cagrRobPct-
          normDyn(td.maxDD,              ddFlT,ddCeT)*ddPct))
      }
      setRankingProgress({done:idx+1,total:syms.length})
    })

    // ── Guardar en Supabase ──
    await upsertScoreHistoricoRemote(activeScoreMap, currentStratId||null)
    // Top scores: agrupar por stratId y guardar
    const topByStrat={}
    Object.entries(topScoreMap).forEach(([sym,sh])=>{
      const sid=wlData[sym]?.top?.stratId; if(sid){if(!topByStrat[sid])topByStrat[sid]={};topByStrat[sid][sym]=sh}
    })
    for(const [sid,m] of Object.entries(topByStrat)) await upsertScoreHistoricoRemote(m,sid)

    // ── Actualizar rankingData y wlData ──
    setRankingData(prev=>{const next={...prev};Object.entries(activeScoreMap).forEach(([sym,sh])=>{next[sym]={...(next[sym]||{}),scoreHistorico:sh}});return next})
    setRankingStratId(currentStratId); setRankingStratName(stratName||'')
    setWlData(prev=>{
      const next={...prev}
      Object.keys(activeScoreMap).forEach(sym=>{
        next[sym]={...(next[sym]||{}),
          active:{...(next[sym]?.active||{}),scoreMetricas:activeScoreMap[sym],stratName:stratName||'',stratId:currentStratId,intervalo:estrategiaIntervalo},
          top:topScoreMap[sym]!=null?{...(next[sym]?.top||{}),scoreMetricas:topScoreMap[sym]}:(next[sym]?.top||{}),
        }
      })
      return next
    })
    setRankingRunning(false); setRankingProgress({done:0,total:0})
    return { ok: true }
  },[watchlist,wlData,currentStratId,stratName,estrategiaIntervalo])

  // ── SCORE MÉT.+SEÑ. ↻ (Paso 3) — Añade señales de mercado al scoreMetricas existente ──
  // Requiere: ↻ Score métricas ejecutado previamente (scoreMetricas en wlData[sym].active)
  const calcScoreMetSen = useCallback(async (rankSymbols=null) => {
    const items = rankSymbols || watchlist
    const syms = items.map(w=>w.symbol)

    // ── Verificación previa: todos deben tener scoreMetricas ──
    const missingScore = syms.filter(sym => wlData[sym.toUpperCase()]?.active?.scoreMetricas==null)
    if (missingScore.length > 0) {
      return { ok: false, error: 'missing_score_metricas', symbols: missingScore }
    }

    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})
    const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const wMercado=(sett.ranking?.rankingWeightMercado??20)/100, wHistorico=(sett.ranking?.rankingWeightHistorico??80)/100
    const momPct=(sett.ranking?.rankingMomentumPct??33)/100, frPct=(sett.ranking?.rankingFRPct??33)/100
    const max52Pct=(sett.ranking?.rankingMax52Pct??34)/100, momN=Math.max(5,sett.ranking?.rankingMomentumN??20)
    const norm=(v,mn,mx)=>Math.max(0,Math.min(100,(v-mn)/(mx-mn)*100))

    let sp500Closes=null
    if(wMercado>0&&frPct>0){try{const r=await apiFetch('/api/closes?symbol=%5EGSPC&days=300');if(r.ok)sp500Closes=await r.json()}catch(e){console.warn('[calcScoreMetSen] SP500:',e.message)}}

    const BATCH=4, activeScMap={}, topScMap={}
    for(let i=0;i<syms.length;i+=BATCH){
      const batch=syms.slice(i,i+BATCH)
      await Promise.allSettled(batch.map(async sym=>{
        try{
          const symUp=sym.toUpperCase()
          const activeShist=wlData[symUp]?.active?.scoreMetricas
          const topShist=wlData[symUp]?.top?.scoreMetricas
          if(activeShist==null) return
          // Descargar precios actuales para señales de mercado
          let scoreMercado=0
          if(wMercado>0){
            const r=await apiFetch(`/api/closes?symbol=${encodeURIComponent(sym)}&days=300`)
            if(r.ok){
              const closes=await r.json()
              const priceArr=(Array.isArray(closes)?closes:[]).filter(v=>v!=null&&!isNaN(v))
              if(priceArr.length>=momN+1){
                const lastP=priceArr[priceArr.length-1], momP=priceArr[Math.max(0,priceArr.length-1-momN)]
                const momentum=momP>0?(lastP/momP-1)*100:0
                const hist252=priceArr.slice(-252), high52=Math.max(...hist252)
                const proximity52=high52>0?(lastP/high52)*100:50
                let relStrength=0
                if(sp500Closes?.length>=64&&frPct>0){
                  const spLast=sp500Closes[sp500Closes.length-1], sp63=sp500Closes[sp500Closes.length-64]
                  const spRet=sp63>0?(spLast/sp63-1)*100:0
                  const asset63=priceArr.length>=64?priceArr[priceArr.length-64]:priceArr[0]
                  const assetRet=asset63>0?(lastP/asset63-1)*100:0
                  relStrength=assetRet-spRet
                }
                scoreMercado=Math.max(0,Math.min(100,norm(momentum,-20,40)*momPct+norm(relStrength,-30,30)*frPct+norm(proximity52,50,100)*max52Pct))
              }
            }
          }
          activeScMap[symUp]=Math.max(0,Math.min(100,activeShist*wHistorico+scoreMercado*wMercado))
          if(topShist!=null) topScMap[symUp]=Math.max(0,Math.min(100,topShist*wHistorico+scoreMercado*wMercado))
        }catch(e){console.error('[calcScoreMetSen]',sym,e)}
      }))
      setRankingProgress({done:Math.min(i+BATCH,syms.length),total:syms.length})
    }

    // ── Guardar en Supabase ──
    await upsertScoreCompletoRemote(activeScMap, currentStratId||null)
    const topScByStrat={}
    Object.entries(topScMap).forEach(([sym,sc])=>{
      const sid=wlData[sym]?.top?.stratId; if(sid){if(!topScByStrat[sid])topScByStrat[sid]={};topScByStrat[sid][sym]=sc}
    })
    for(const [sid,m] of Object.entries(topScByStrat)) await upsertScoreCompletoRemote(m,sid)

    // ── Actualizar rankingData y wlData ──
    setRankingData(prev=>{const next={...prev};Object.entries(activeScMap).forEach(([sym,sc])=>{next[sym]={...(next[sym]||{}),scoreCompleto:sc,score:sc}});return next})
    setRankingStratId(currentStratId); setRankingStratName(stratName||'')
    setWlData(prev=>{
      const next={...prev}
      Object.keys(activeScMap).forEach(sym=>{
        next[sym]={...(next[sym]||{}),
          active:{...(next[sym]?.active||{}),scoreMetSeñ:activeScMap[sym]},
          top:topScMap[sym]!=null?{...(next[sym]?.top||{}),scoreMetSeñ:topScMap[sym]}:(next[sym]?.top||{}),
        }
      })
      return next
    })
    setRankingRunning(false); setRankingProgress({done:0,total:0})
    try{localStorage.setItem('wl_score_metsen_last_updated',Date.now().toString())}catch(_){}
    return { ok: true }
  },[watchlist,wlData,currentStratId,stratName])

  // ── MÉTRICAS ↻ — Calcula solo métricas (CAGR, Profit, Win%, MaxDD, Ops) para activa + todas ──
  const calcMetricas = useCallback(async (rankSymbols=null) => {
    const syms = (rankSymbols || watchlist).map(w=>w.symbol)
    const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const minTrades=sett.ranking?.minTrades??3
    const BATCH=4

    // ── Fase 1: Métricas de la estrategia activa ──
    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})
    const activeMetrics={}
    for(let i=0;i<syms.length;i+=BATCH){
      const batch=syms.slice(i,i+BATCH)
      await Promise.allSettled(batch.map(async sym=>{
        try{
          const res=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({simbolo:sym,strategyId:currentStratId,capital_ini:Number(capitalIni),years:Number(years),allocation_pct:100,filtros,intervalo:estrategiaIntervalo})})
          const json=await res.json()
          if(!res.ok||!json.trades?.length) return
          const trades=json.trades; if(trades.length<minTrades) return
          const wins=trades.filter(t=>t.pnlPct>=0), winRate=(wins.length/trades.length)*100
          const totalDiasNat=json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*Number(years)
          const anios=Math.max(totalDiasNat/365.25,0.01)
          const capFinal=Number(capitalIni)+json.gananciaSimple
          const cagr=capFinal>0?(Math.pow(capFinal/Number(capitalIni),1/anios)-1)*100:-99
          const sorted3=[...trades].sort((a,b)=>b.pnlSimple-a.pnlSimple).slice(3)
          const ganRobust=sorted3.reduce((s,t)=>s+t.pnlSimple,0)
          const capRob=Number(capitalIni)+ganRobust
          const cagrRobust=capRob>0?(Math.pow(capRob/Number(capitalIni),1/anios)-1)*100:-99
          const maxDD=json.maxDDStrategyFloat??json.maxDDStrategy??0
          activeMetrics[sym.toUpperCase()]={winRate,cagr,cagrRobust,maxDD,trades:trades.length,profit:json.gananciaSimple??null}
        }catch(e){console.error('[calcMetricas-activa]',sym,e)}
      }))
      setRankingProgress({done:Math.min(i+BATCH,syms.length),total:syms.length})
    }
    await upsertMetricsRemote(activeMetrics,currentStratId||null)
    setRankingData(prev=>{const next={...prev};Object.entries(activeMetrics).forEach(([sym,m])=>{next[sym]={...(next[sym]||{}),metrics:m}});return next})
    setRankingStratId(currentStratId); setRankingStratName(stratName||'')
    setRankingRunning(false); setRankingProgress({done:0,total:0})
    setWlData(prev=>{
      const next={...prev}
      Object.entries(activeMetrics).forEach(([sym,m])=>{
        next[sym]={...(next[sym]||{}),
          active:{...(next[sym]?.active||{}),cagr:m.cagr??null,cagrRobust:m.cagrRobust??null,profit:m.profit??null,winRate:m.winRate??null,maxDD:m.maxDD??null,ops:m.trades??null,stratName:stratName||'',stratId:currentStratId,intervalo:estrategiaIntervalo}
        }
      })
      return next
    })

    // ── Fase 2: Métricas de TODAS las estrategias ──
    const enabledStrats=(strategies||[]).filter(s=>s.enabled!==false)
    if(enabledStrats.length){
      setTopStratRunning(true); setTopStratProgress({current:0,total:enabledStrats.length})
      const allStratMetricsMap={}
      for(let si=0;si<enabledStrats.length;si++){
        const strat=enabledStrats[si]
        setTopStratProgress({current:si+1,total:enabledStrats.length})
        const stratId=strat.id
        const stratYears=strat.years||Number(years), stratCap=strat.capital_ini||Number(capitalIni)
        const stratIntv=(()=>{try{const p=typeof strat?.params==='string'?JSON.parse(strat.params||'{}'):(strat?.params||{});return p.intervalo||'diario'}catch(_){return 'diario'}})()
        const stratMetrics={}
        try{
          for(let i=0;i<syms.length;i+=BATCH){
            const batch=syms.slice(i,i+BATCH)
            await Promise.allSettled(batch.map(async sym=>{
              try{
                const res=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({simbolo:sym,strategyId:stratId,capital_ini:stratCap,years:stratYears,allocation_pct:100,filtros,intervalo:stratIntv})})
                const json=await res.json()
                if(!res.ok||!json.trades?.length) return
                const trades=json.trades; if(trades.length<minTrades) return
                const wins=trades.filter(t=>t.pnlPct>=0), winRate=(wins.length/trades.length)*100
                const totalDiasNat=json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*stratYears
                const anios=Math.max(totalDiasNat/365.25,0.01)
                const capFinal=stratCap+json.gananciaSimple
                const cagr=capFinal>0?(Math.pow(capFinal/stratCap,1/anios)-1)*100:-99
                const sorted3=[...trades].sort((a,b)=>b.pnlSimple-a.pnlSimple).slice(3)
                const ganRobust=sorted3.reduce((s,t)=>s+t.pnlSimple,0)
                const capRob=stratCap+ganRobust
                const cagrRobust=capRob>0?(Math.pow(capRob/stratCap,1/anios)-1)*100:-99
                const maxDD=json.maxDDStrategyFloat??json.maxDDStrategy??0
                stratMetrics[sym.toUpperCase()]={winRate,cagr,cagrRobust,maxDD,trades:trades.length,profit:json.gananciaSimple??null}
              }catch(e){console.error('[calcMetricas-all]',sym,e)}
            }))
          }
          await upsertMetricsRemote(stratMetrics,stratId)
          allStratMetricsMap[stratId]=stratMetrics
        }catch(e){console.error('[calcMetricas] Error estrategia:',strat.name,e)}
      }
      // ── Merge top metrics: determinar top estrategia por CAGR desde allStratMetricsMap ──
      // No depende de refreshBestStratPerSymbol (que usa score_historico, no calculado aquí)
      setWlData(prev=>{
        const next={...prev}
        syms.forEach(sym=>{
          const symUp=sym.toUpperCase()
          let bestStratId=null, bestCagr=-Infinity
          Object.entries(allStratMetricsMap).forEach(([sid,metricsForStrat])=>{
            const m=metricsForStrat[symUp]
            if(m && (m.cagr??-Infinity)>bestCagr){ bestCagr=m.cagr; bestStratId=sid }
          })
          if(bestStratId){
            const topM=allStratMetricsMap[bestStratId][symUp]
            const topStrat=enabledStrats.find(s=>s.id===bestStratId)
            const topStratName=topStrat?.name||''
            const topIntv=(()=>{try{const p=typeof topStrat?.params==='string'?JSON.parse(topStrat.params||'{}'):(topStrat?.params||{});return p.intervalo||'diario'}catch(_){return 'diario'}})()
            next[symUp]={...(next[symUp]||{}),
              top:{...(next[symUp]?.top||{}),cagr:topM.cagr??null,cagrRobust:topM.cagrRobust??null,profit:topM.profit??null,winRate:topM.winRate??null,maxDD:topM.maxDD??null,ops:topM.trades??null,stratName:topStratName,stratId:bestStratId,intervalo:topIntv}
            }
          }
        })
        return next
      })
      await refreshBestStratPerSymbol().catch(()=>{})
      setTopStratRunning(false); setTopStratProgress({current:0,total:0})
    }

  },[watchlist,years,capitalIni,currentStratId,stratName,filtros,estrategiaIntervalo,strategies,refreshBestStratPerSymbol])

  // ── Borrar scores (score_historico + score_completo) de símbolos seleccionados ──
  const deleteScores = useCallback(async (symbols) => {
    if (!symbols?.length) return
    await nullifyScoresRemote(symbols)
    const symSet = new Set(symbols.map(s => s.toUpperCase()))
    setRankingData(prev => {
      const next = { ...prev }
      symSet.forEach(sym => { if (next[sym]) next[sym] = { ...next[sym], scoreHistorico: null, scoreCompleto: null, score: null } })
      return next
    })
    setBestStratBySymbol(prev => {
      const next = { ...prev }
      symSet.forEach(sym => { if (next[sym]) next[sym] = { ...next[sym], scoreHistorico: null, scoreCompleto: null, score: null } })
      return next
    })
    setWlData(prev => {
      const next = { ...prev }
      symSet.forEach(sym => {
        if (next[sym]) {
          next[sym] = {
            ...next[sym],
            active: { ...(next[sym].active || {}), scoreMetricas: null, scoreMetSeñ: null },
            top:    { ...(next[sym].top    || {}), scoreMetricas: null, scoreMetSeñ: null },
          }
        }
      })
      return next
    })
  }, [])

  // ── Borrar todas las métricas de ranking_results para símbolos seleccionados ──
  const deleteMetrics = useCallback(async (symbols) => {
    if (!symbols?.length) return
    await deleteMetricsRemote(symbols)
    const symSet = new Set(symbols.map(s => s.toUpperCase()))
    setRankingData(prev => { const next = { ...prev }; symSet.forEach(sym => delete next[sym]); return next })
    setBestStratBySymbol(prev => { const next = { ...prev }; symSet.forEach(sym => delete next[sym]); return next })
    setWlData(prev => {
      const next = { ...prev }
      symSet.forEach(sym => { delete next[sym] })
      return next
    })
  }, [])

  // ── Analizar candidatos: extrae tickers, corre backtest en paralelo ──
  // Usa gananciaSimple (CAGR Simple) — mismo método y fórmulas que calcRanking
  const clearCandidates=useCallback(()=>{
    setCandidatesResults([])
    setCandidatesText('')
  },[setSidebarW])

  const analyzeCandidates=useCallback(async()=>{
    const rawTickers=[...(new Set((candidatesText.match(/\b[A-Z]{1,5}\b/g)||[])))]
    if(!rawTickers.length) return
    setCandidatesLoading(true)
    setCandidatesResults([])
    setCandidatesProgress({done:0,total:rawTickers.length})
    const CONC=5
    const partials=[]
    const runOne=async(sym)=>{
      try{
        const res=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({simbolo:sym,strategyId:currentStratId,
            capital_ini:Number(capitalIni),years:Number(years),allocation_pct:100,
            filtros,intervalo:estrategiaIntervalo})})
        if(!res.ok) return {symbol:sym,error:true}
        const json=await res.json()
        const trades=json.trades||[]
        if(!trades.length) return {symbol:sym,error:true}
        // Fórmulas idénticas a calcRanking para garantizar coherencia
        const wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
        const winRate=(wins.length/trades.length)*100
        const gBrut=wins.reduce((s,t)=>s+t.pnlSimple,0)
        const lBrut=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
        const pf=lBrut>0?Math.min(gBrut/lBrut,9.99):9.99
        const totalDiasNat=json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*Number(years)
        const anios=Math.max(totalDiasNat/365.25,0.01)
        const cap=Number(capitalIni)
        const finalCap=cap+(json.gananciaSimple||0)
        const cagr=finalCap>0?(Math.pow(finalCap/cap,1/anios)-1)*100:-99
        // Usar MaxDD con flotante si disponible (campo nuevo maxDDStrategyFloat)
        const maxDD=json.maxDDStrategyFloat??json.maxDDStrategy??0
        return{symbol:sym,cagr,winRate,pf,maxDD,ops:trades.length,error:false}
      }catch{return{symbol:sym,error:true}}
    }
    for(let i=0;i<rawTickers.length;i+=CONC){
      const batch=rawTickers.slice(i,i+CONC)
      const res=await Promise.all(batch.map(runOne))
      partials.push(...res)
      setCandidatesProgress({done:Math.min(i+CONC,rawTickers.length),total:rawTickers.length})
      setCandidatesResults(partials.slice().sort((a,b)=>(b.error?-999:(b.cagr??-999))-(a.error?-999:(a.cagr??-999))))
    }
    setCandidatesLoading(false)
    setCandidatesProgress(null)
  },[candidatesText,currentStratId,capitalIni,years,filtros,estrategiaIntervalo])

  const run=useCallback(async(sym,payload)=>{
    setLoading(true);setError(null)
    try{
      const body = payload.strategyId
        ? { simbolo:sym, strategyId:payload.strategyId, capital_ini:payload.capital_ini, years:payload.years, allocation_pct:payload.allocation_pct, filtros:payload.filtros||{}, intervalo:payload.intervalo||'diario' }
        : { simbolo:sym, cfg:payload.cfg||payload }
      const res=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok)throw new Error(json.error||'Error')
      savedRangeRef.current=null   // reset zoom so recentMonths is applied on new load
      isNewResultRef.current=true  // tell CandleChart to ignore savedRange on first mount
      setChartViewFull(false)
      setResult(json)
      setDisplayedSimbolo(sym) // sync display name only once chart data is ready
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[])

  // ── Guardar estrategia en Supabase ──
  const saveStrategy=useCallback(async(overwriteId=null)=>{
    setStratSaving(true); setStratMsg(null)
    try{
      const body={ name:stratName, description:stratDesc,
        years:Number(years), capital_ini:Number(capitalIni),
        color:stratColor }
      const method = overwriteId ? 'PUT' : 'POST'
      if(overwriteId) body.id = overwriteId
      const res=await apiFetch('/api/strategies',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      // Recargar lista
      const list=await apiFetch('/api/strategies').then(r=>r.json())
      if(Array.isArray(list)) setStrategies(list)
      setCurrentStratId(json?.id||overwriteId||null)
      setStratMsg({type:'ok',text:'Estrategia guardada ✓'})
    }catch(e){ setStratMsg({type:'err',text:e.message}) }
    finally{ setStratSaving(false) }
  },[stratName,stratDesc,simbolo,years,capitalIni,stratColor])

  // ── Clonar estrategia activa ──
  const cloneStrategy=useCallback(async()=>{
    const body={
      name:        stratName+' (copia)',
      description: stratDesc,
      years:       Number(years),
      capital_ini: Number(capitalIni),
      color:       stratColor,
    }
    try{
      const res=await apiFetch('/api/strategies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      if(!res.ok) throw new Error('Error clonando')
      await reloadStrategies(false)
      setStratMsg({type:'ok',text:'Estrategia clonada ✓'})
    }catch(e){ console.error('Error clonando:',e) }
  },[stratName,stratDesc,years,capitalIni,stratColor])

  // ── Cargar estrategia guardada en el builder ──
  const loadStrategy=useCallback((strat)=>{
    setResult(null)
    setStratName(strat.name||'')
    setStratDesc(strat.description||'')
    setStratColor(strat.color||'#00d4ff')
    setCurrentStratId(strat.id)
    setEstrategiaIntervalo(readStratIntervalo(strat))
    // symbol intentionally not stored in strategy (apply to any asset separately)
    setStratTab('build')
    setStratMsg({type:'ok',text:`Cargada: ${strat.name}`})
    // Persist default strategy so it restores on reload
    if(strat.id){try{const _s=JSON.parse(localStorage.getItem('v50_settings')||'{}');_s.defaultStrategyId=strat.id;localStorage.setItem('v50_settings',JSON.stringify(_s))}catch(_){}}
    // Load saved ranking for this strategy (clear if none)
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(strat.id){
      loadRankingRemote(strat.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(strat.id);setRankingStratName(strat.name||'')}
      }).catch(()=>{})
    }
  },[])

  // ── Persistir estrategia activa en localStorage + Supabase al cambiar ──
  useEffect(()=>{
    if(!currentStratId) return
    try{const _s=JSON.parse(localStorage.getItem('v50_settings')||'{}');_s.defaultStrategyId=currentStratId;localStorage.setItem('v50_settings',JSON.stringify(_s))}catch(_){}
    const uid=getUidFromJwt()
    if(!uid) return
    ;(async()=>{
      try{
        const r=await fetch(`${getSupaUrl()}/rest/v1/user_settings?user_id=eq.${uid}&select=settings`,{headers:getSupaH()})
        const rows=await r.json()
        const prev=rows?.[0]?.settings||{}
        await fetch(`${getSupaUrl()}/rest/v1/user_settings?user_id=eq.${uid}`,{
          method:'PATCH',
          headers:{...getSupaH(),'Content-Type':'application/json','Prefer':'return=minimal'},
          body:JSON.stringify({settings:{...prev,defaultStrategyId:currentStratId}})
        })
      }catch(_){}
    })()
  },[currentStratId])

  // ── Eliminar estrategia ──
  const deleteStrategy=useCallback(async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await fetch(`/api/strategies?id=${id}`,{method:'DELETE'})
    setStrategies(prev=>prev.filter(s=>s.id!==id))
    if(currentStratId===id){setCurrentStratId(null);setStratMsg({type:'ok',text:'Estrategia eliminada'})}
  },[currentStratId])

  // ── Debounce: lanza backtest automáticamente al cambiar parámetros ──
  useEffect(()=>{
    if(skipNextRunRef.current){skipNextRunRef.current=false;return}
    if(!currentStratId&&sidePanel!=='strats')return
    if(debounceRef.current)clearTimeout(debounceRef.current)
    const payload = currentStratId
      ? { strategyId:currentStratId, capital_ini:Number(capitalIni), years:Number(years), allocation_pct:100, filtros, intervalo:estrategiaIntervalo }
      : { cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
              tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
              tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL)} }
    debounceRef.current=setTimeout(()=>run(simbolo, payload),800)
    return()=>clearTimeout(debounceRef.current)
  },[simbolo,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,
     sp500EmaR,sp500EmaL,sidePanel,currentStratId,filtros,estrategiaIntervalo,run])

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
      fill_type: 'buy',
      symbol: '',
      broker: s.tradelog?.defaultBroker || 'ibkr',
      date: today,
      price: currentPrice, shares: '',
      currency: s.tradelog?.defaultCurrency || 'USD',
      commission: s.tradelog?.defaultCommission ?? 0,
      fx: '', fx_manual: false,
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
    try { return !(getSupaUrl().startsWith('https') && getSupaKey().length > 10) }
    catch { return true }
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
      const tradeDate = trade.date||trade.entry_date
      const tradePrice = trade.price||trade.entry_price
      if(chartApiRef.current && tradeDate) {
        try {
          const entryD = new Date(tradeDate)
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
      const dataUrl = chartApiRef.current?.captureJpg?.(null, trade.symbol, parseFloat(tradePrice)||null)
      if(!dataUrl) return
      const sym = (trade.symbol||'TICKER').replace(/[^a-zA-Z0-9^]/g,'_')
      const date = (tradeDate||new Date().toISOString().slice(0,10))
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
                const r=await apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
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
      // ── modo Supabase ── load all fills; status/year/month filtered client-side after FIFO grouping
      let url = '/api/tradelog?action=list'
      if(tlFilterBroker) url += `&broker=${tlFilterBroker}`
      const res = await apiFetch(url)
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
  },[tlFilterBroker])

  useEffect(()=>{ if(session?.user?.id) loadTrades() },[loadTrades,session?.user?.id]) // eslint-disable-line
  useEffect(()=>{ if(sidePanel==='tradelog') loadTrades() },[sidePanel,loadTrades])

  // ── Risk: Escape cancela capture mode o limpia todo ──
  useEffect(()=>{
    const handler=e=>{
      if(e.key==='Escape'&&sidePanel==='risk'){
        if(riskCaptureMode){ setRiskCaptureMode(null) }
        else { setRiskLineActive({entry:false,stop:false,tp:false}); setRiskCalc({entry:'',stop:'',tp:''}) }
      }
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[sidePanel,riskCaptureMode])
  useEffect(()=>{ if(sidePanel!=='risk'){ setRiskLineActive({entry:false,stop:false,tp:false}); setRiskCaptureMode(null); setRiskProfileDropOpen(false) } },[sidePanel])

  // ── onRiskPrice: captura clic en gráfico durante capture mode ──
  const onRiskPrice = useCallback((rawPrice)=>{
    const p = parseFloat(rawPrice.toFixed(6))
    const fmt = p.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:4})
    setRiskCaptureMode(cur=>{
      if(!cur) return null
      const key = cur==='capture_entry'?'entry':cur==='capture_stop'?'stop':'tp'
      setRiskCalc(c=>({...c,[key]:fmt}))
      setRiskLineActive(v=>({...v,[key]:true}))
      return null // sale de capture mode
    })
  },[])

  // ── onRiskLevelChange: drag de líneas en gráfico actualiza campos en tiempo real ──
  const onRiskLevelChange = useCallback((type, price)=>{
    const p = parseFloat(price.toFixed(6))
    const fmt = p.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:4})
    const key = type==='entry'?'entry':type==='stop'?'stop':'tp'
    setRiskCalc(c=>({...c,[key]:fmt}))
    setRiskLineActive(v=>({...v,[key]:true}))
  },[])

  const loadFills = useCallback(async(id)=>{
    try{
      if(tlUseLocal()){ setTlFills([]); setTlFillsList([]); return }
      const res=await apiFetch(`/api/tradelog?action=fills&id=${id}`)
      const json=await res.json()
      const fills=json.fills||[]
      setTlFills(fills)
      setTlFillsList(fills.map(f=>({date:toDisplayDate(f.date)||f.date||'',price:String(f.price||''),shares:String(f.shares||''),_dbId:f.id})))
    }catch(_){ setTlFills([]); setTlFillsList([]) }
  },[])

  const loadExitFills = useCallback(async(id)=>{
    try{
      if(tlUseLocal()){ setTlExitFillsList([]); return }
      const res=await apiFetch(`/api/tradelog?action=fills&id=${id}`)
      const json=await res.json()
      const fills=json.fills||[]
      setTlExitFillsList(fills.map(f=>({date:toDisplayDate(f.date)||f.date||'',price:String(f.price||''),shares:String(f.shares||''),_dbId:f.id})))
    }catch(_){ setTlExitFillsList([]) }
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
    const res=await apiFetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)})
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Error')
    await loadTrades()
    return json.trade
  }

  const tlSaveFill = async(fill)=>{
    if(tlUseLocal()) {
      const all = tlGetLS()
      const n = (v) => v===''||v==null ? null : parseFloat(v)||0
      const norm = {...fill,
        price: n(fill.price)||0, shares: n(fill.shares)||0,
        commission: n(fill.commission)||0, fx: n(fill.fx)||null,
      }
      if(norm.id) {
        const idx = all.findIndex(t=>t.id===norm.id)
        if(idx>=0) all[idx]=norm; else all.push(norm)
        tlSetLS(all); await loadTrades(); return norm
      } else {
        const newT = {...norm, id:'ls_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          created_at:new Date().toISOString()}
        tlSetLS([...all,newT]); await loadTrades(); return newT
      }
    }
    const res=await apiFetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fill)})
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
    await apiFetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
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
      apiFetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
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
    const res=await apiFetch('/api/tradelog?action=close',{method:'POST',headers:{'Content-Type':'application/json'},
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
      const res=await apiFetch('/api/tradelog?action=parse',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:tlImportText,format:tlImportFormat,apiKey,
          ibkrDateFormat:s?.tradelog?.ibkrDateFormat||'DD/MM'})})

      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      // Normalizar al schema viejo que usan groupParsedFills / display table
      // (la API devuelve new schema: date/price/currency/fx/commission)
      const raw = (json.parsed||[]).map(r=>{
        const isBuy=(r.fill_type||'buy')!=='sell'
        return {
          ...r,
          entry_date:     r.date     !=null ? r.date     : r.entry_date,
          entry_price:    r.price    !=null ? r.price    : r.entry_price,
          entry_currency: r.currency || r.entry_currency || 'USD',
          fx_entry:       r.fx       !=null ? r.fx       : r.fx_entry,
          commission_buy:  isBuy  ? (r.commission!=null?r.commission:r.commission_buy ||0) : (r.commission_buy ||0),
          commission_sell: !isBuy ? (r.commission!=null?r.commission:r.commission_sell||0) : (r.commission_sell||0),
        }
      })
      // Mark duplicates on raw fills (for save-time skip + button count)
      const markedRaw = raw.map(r=>({...r, _isDuplicate: tlTrades.some(t=>
        t.symbol===r.symbol && (t.date||t.entry_date)===(r.date||r.entry_date) &&
        (t.fill_type||'buy')===(r.fill_type||'buy') &&
        Math.abs(parseFloat(t.shares||0)-parseFloat(r.shares||0))<0.01 &&
        Math.abs(parseFloat(t.price||t.entry_price||0)-parseFloat(r.price||r.entry_price||0))<0.01
      )}))
      setTlParsedRaw(markedRaw)
      // Preview always shows grouped view (FIFO for display only, not for save)
      setTlParsed(enrichParsedRows(groupParsedFills(markedRaw)))
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

  // Saves each raw fill individually to Supabase — FIFO grouping is display-only, never at save time
  const tlImportConfirm = async()=>{
    setTlImportLoading(true)
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const defBroker=s?.tradelog?.defaultBroker||'ibkr'
      let errors=[]
      for(const raw of tlParsedRaw){
        if(raw._isDuplicate) continue
        // Whitelist estricta — solo campos válidos en trades_log, sin importar qué traiga raw
        const trade = {
          symbol:        raw.symbol,
          fill_type:     raw.fill_type || 'buy',
          date:          raw.date      || raw.entry_date,
          price:         raw.price     != null ? raw.price     : raw.entry_price,
          shares:        raw.shares,
          commission:    raw.commission != null ? raw.commission : (raw.commission_buy || raw.commission_sell || 0),
          currency:      raw.currency  || raw.entry_currency || 'USD',
          fx:            raw.fx        != null ? raw.fx        : raw.fx_entry,
          broker:        raw.broker    || defBroker,
          strategy:      raw.strategy  || '',
          notes:         raw.notes     || '',
          import_source: raw.import_source || 'import',
        }
        if(tlUseLocal()){
          const all=tlGetLS()
          all.push({...trade, id:'local_'+Date.now()+'_'+Math.random().toString(36).slice(2)})
          tlSetLS(all)
        } else {
          const res=await apiFetch('/api/tradelog?action=save',{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify(trade)})
          const json=await res.json()
          if(!res.ok) errors.push(json.error||'Error guardando '+trade.symbol)
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
    if(mcMode==='custom'){
      const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
      if(Math.abs(total-100)>0.5){setMcError(`Los pesos suman ${total.toFixed(1)}% — deben sumar 100%`);return}
    }
    setMcLoading(true);setMcError(null);setMcResult(null);setMcMultiResults([]);setMcProgress(null)
    setMcShowGantt(false);setGanttDiscarded(null)
    mcChartsSyncRef.current={isSyncing:false,charts:[],lastRange:null}  // reset sync group for new run
    mcChartRefsMap.current={}  // reset chart refs for new run
    const weightsNorm={}
    if(mcMode==='custom'){
      const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
      mcSelected.forEach(sym=>{weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length})
    }
    const _mcYears=mcPeriodMode==='years'?mcYears:null
    const _mcFrom=mcPeriodMode==='range'?mcFromDate:null
    const _mcTo=mcPeriodMode==='range'?mcToDate:null
    const baseCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
      fromDate:_mcFrom,toDate:_mcTo,
      tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
      tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital:mcCapital,
      sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,maxPosiciones:mcMaxPosiciones,prioridad:mcPrioridad,momentumN:Number(mcMomentumN),
        scoreMap:Object.fromEntries(mcSelected.map(sym=>[sym,wlData[sym.toUpperCase()]?.active?.scoreMetricas??null]))}}
    const buildCfgFromStrat=(strat)=>{
      // Parsear params del code_js (campo principal para estrategias modernas)
      let stratParams={}
      if(strat?.params){
        try{stratParams=typeof strat.params==='string'?JSON.parse(strat.params):strat.params}catch(e){}
      }
      // Fallback a definition.entry para estrategias legacy
      const def=strat?.definition||{}
      const entry=def.entry||{},stop=def.stop||{},mgmt=def.management||{},filt=def.filters?.market?.[0]||{}
      const legacyParams=Object.keys(def).length>0?{
        emaR:entry.ma_fast||entry.ma_period||Number(emaR),
        emaL:entry.ma_slow||Number(emaL),
        sinPerdidas:mgmt.sin_perdidas!==false,
        reentry:mgmt.reentry!==false,
        stopLoss:def.stopLoss||'tecnico_ema',
      }:{}
      // baseCfg < legacyParams < stratParams (stratParams tiene máxima prioridad)
      return{
        ...baseCfg,
        ...legacyParams,
        ...stratParams,
      }
    }
    const stratIds=mcStratSelected.filter(Boolean)
    if(stratIds.length===0){
      setMcError('Selecciona al menos una estrategia para ejecutar')
      setMcLoading(false)
      return
    }
    if(stratIds.length<=1){
      const modesToRun=selectedModos.length>0?selectedModos:['slots']
      if(modesToRun.length===1){
        // Single mode run
        try{
          const _strat1=strategies.find(s=>s.id===stratIds[0])
          const isNoStrategy=(_strat1?.name||'').includes('No Strategy')
          const res=await apiFetch('/api/multibacktest',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({symbols:mcSelected,modoAsig:modesToRun[0],weights:weightsNorm,cfg:baseCfg,strategyId:stratIds[0]||null,isNoStrategy,filtros,intervalo:mcIntervalo})})
          const json=await res.json()
          if(!res.ok) throw new Error(json.error||'Error')
          setMcResult(json);setMcMultiResults([]);setMcIsModoCompare(false)
        }catch(e){setMcError(e.message)}finally{setMcLoading(false);setMcProgress(null)}
        return
      }
      // Multi-mode run (same strategy, different allocation modes)
      const MODE_LABELS={slots:'Slots',compartido:'Compartido',concentrado:'Concentrado',positionsizing:'Pos.Sizing'}
      const sid=stratIds[0]||null
      const strat=strategies.find(s=>s.id===sid)||strategies.find(s=>s.id===currentStratId)
      const stratName=strat?.name||'Estrategia activa'
      const isNoStrategyMode=(strat?.name||'').includes('No Strategy')
      const modeResults=[]
      try{
        for(let i=0;i<modesToRun.length;i++){
          const modo=modesToRun[i]
          setMcProgress({current:i+1,total:modesToRun.length,name:MODE_LABELS[modo]||modo})
          const color=STRAT_COMPARE_COLORS[i%STRAT_COMPARE_COLORS.length]
          const res=await apiFetch('/api/multibacktest',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({symbols:mcSelected,modoAsig:modo,weights:weightsNorm,cfg:baseCfg,strategyId:sid,isNoStrategy:isNoStrategyMode,filtros,intervalo:mcIntervalo})})
          const json=await res.json()
          if(!res.ok) throw new Error(json.error||'Error en '+MODE_LABELS[modo])
          modeResults.push({id:`${sid||'__single__'}__${modo}`,name:`${stratName} · ${MODE_LABELS[modo]}`,color,result:json,modo})
        }
        const vis={};modeResults.forEach(r=>{vis[r.id]=true});setMcStratVisible(vis)
        setMcAssetOpen({})
        const chartsVis={};modeResults.forEach(r=>{chartsVis[r.id]=true});setMcChartsStratVisible(chartsVis)
        setMcResult(modeResults[0].result);setMcMultiResults(modeResults);setMcIsModoCompare(true)
      }catch(e){setMcError(e.message)}finally{setMcLoading(false);setMcProgress(null)}
      return
    }
    // Multiple strategies — run sequentially with progress
    const results=[]
    for(let i=0;i<stratIds.length;i++){
      const sid=stratIds[i]
      const strat=strategies.find(s=>s.id===sid)
      const name=strat?.name||`Estrategia ${i+1}`
      const color=STRAT_COMPARE_COLORS[i%STRAT_COMPARE_COLORS.length]
      setMcProgress({current:i+1,total:stratIds.length,name})
      try{
        const cfg=buildCfgFromStrat(strat)
        const res=await apiFetch('/api/multibacktest',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({symbols:mcSelected,modoAsig:mcMode,weights:weightsNorm,cfg,strategyId:sid,isNoStrategy:(strat?.name||'').includes('No Strategy'),filtros,intervalo:mcIntervalo})})
        const json=await res.json()
        if(!res.ok) throw new Error(json.error||'Error en '+name)
        results.push({id:sid,name,color,result:json})
      }catch(e){setMcError(e.message);setMcLoading(false);setMcProgress(null);return}
    }
    const activeResult=results.find(r=>r.id===currentStratId)||results[0]
    setMcResult(activeResult.result);setMcMultiResults(results);setMcIsModoCompare(false)
    const vis={};results.forEach(r=>{vis[r.id]=true});setMcStratVisible(vis)
    setMcAssetOpen({})
    const chartsVis={};results.forEach(r=>{chartsVis[r.id]=true});setMcChartsStratVisible(chartsVis)
    setMcLoading(false);setMcProgress(null)
  },[mcSelected,mcMode,selectedModos,mcWeights,mcCapital,mcCapitalIni,mcYears,mcPeriodMode,mcFromDate,mcToDate,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,rankingData,mcStratSelected,strategies,currentStratId,mcRiskPerTrade,mcMaxPortfolioPct,mcMaxAccumRisk,mcMaxPosiciones,mcPrioridad,mcMomentumN,filtros,mcIntervalo])

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

  // ── Aplicar vista reciente (recentMonths) cada vez que llega un nuevo result ──
  // Belt-and-suspenders: independiente del timing interno de CandleChart/ResizeObserver
  useEffect(()=>{
    if(!result) return
    const s=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return{}}})()
    const m=s?.chart?.recentMonths??3
    // Esperar a que el chart esté montado y el ResizeObserver haya terminado
    const t=setTimeout(()=>{
      if(chartViewFull) return  // user está en modo full-period, no sobrescribir
      chartApiRef.current?.showRecent(m)
      chartApiFullscreenRef.current?.showRecent(m)
    },300)
    return()=>clearTimeout(t)
  },[result])  // eslint-disable-line react-hooks/exhaustive-deps

  // Dibuja líneas de entrada permanentes para operaciones abiertas del símbolo activo
  useEffect(()=>{
    if(!chartApiRef.current?.setOpenTradeLines) return
    const openForSym = tlTrades.filter(t=>
      t.fill_type==='buy' &&
      (tlFifo.fillStatus[t.id]==='open' || tlFifo.fillStatus[t.id]==='partial') &&
      (t.symbol||'').toUpperCase()===(simbolo||'').toUpperCase()
    ).map(t=>({...t, entry_price: t.price||t.entry_price, entry_date: t.date||t.entry_date}))
    chartApiRef.current.setOpenTradeLines(openForSym)
  },[simbolo, tlTrades, tlFifo, result])

  const metrics=result?calcMetrics(result.trades,Number(capitalIni),result.capitalReinv,result.gananciaSimple,result.ganBH||0,result.startDate,result.meta?.ultimaFecha,Number(years)):null

  // ── Backtest float equity curve — simple curve + open-trade unrealized P&L ──
  const backtestFloatCurve = useMemo(()=>{
    if(!result?.chartData?.length||!result?.trades?.length) return null
    const cap=Number(capitalIni)
    const trades=result.trades
    const closeMap={}
    result.chartData.forEach(d=>{closeMap[d.date]=d.close})
    return result.chartData.map(({date})=>{
      const closedPnl=trades.filter(t=>t.exitDate&&t.exitDate<=date).reduce((s,t)=>s+(t.pnlSimple||0),0)
      const openPnl=trades.filter(t=>t.entryDate&&t.entryDate<=date&&t.exitDate&&t.exitDate>date).reduce((s,t)=>{
        const c=closeMap[date]
        if(!c||!t.entryPrice||!t.shares) return s
        return s+(c-t.entryPrice)*t.shares
      },0)
      return {date,value:cap+closedPnl+openPnl}
    })
  },[result,capitalIni])

  const computeMaxDD=curve=>{
    if(!curve?.length) return [0,null]
    let peak=curve[0].value,maxDD=0,ddDate=null
    for(const p of curve){if(!p)continue;if(p.value>peak)peak=p.value;const dd=peak>0?(peak-p.value)/peak*100:0;if(dd>maxDD){maxDD=dd;ddDate=p.date}}
    return [maxDD,ddDate]
  }
  const [maxDDFloat,maxDDFloatDate]=useMemo(()=>computeMaxDD(backtestFloatCurve),[backtestFloatCurve])

  // ── Backtest float compound curve — compound curve + same unrealized delta as simple ──
  const backtestFloatCompoundCurve=useMemo(()=>{
    if(!backtestFloatCurve||!result?.strategyCurve?.length||!result?.compoundCurve?.length) return null
    const stratMap={};result.strategyCurve.forEach(p=>{stratMap[p.date]=p.value})
    const floatMap={};backtestFloatCurve.forEach(p=>{floatMap[p.date]=p.value})
    return result.compoundCurve.filter(p=>p&&p.date).map(p=>{
      const stratVal=stratMap[p.date]??p.value
      const delta=(floatMap[p.date]??stratVal)-stratVal
      return {date:p.date,value:p.value+delta}
    })
  },[backtestFloatCurve,result])
  const [maxDDFloatCompound,maxDDFloatCompoundDate]=useMemo(()=>computeMaxDD(backtestFloatCompoundCurve),[backtestFloatCompoundCurve])
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
    // Also try Supabase for persisted tema (using hardcoded getSupaUrl()/getSupaH())
    fetch(getSupaUrl()+'/rest/v1/user_settings?key=eq.v50_tema_fonts&select=value',{
      headers:getSupaH()
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
      {label:'Max Drawdown (%)',      compound:v(fmt(showBacktestFloat&&maxDDFloatCompound?maxDDFloatCompound:m.ddComp,2,'%'),'#ff4d6d'), bh:v(fmt(maxDDBH,2,'%'),'#ff4d6d'), simple:v(fmt(showBacktestFloat&&maxDDFloat?maxDDFloat:m.ddSimple,2,'%'),'#ff4d6d')},
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
          style={{fontFamily:MONO,fontSize:9,padding:'1px 5px',borderRadius:3,cursor:'pointer',
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
  const bareChartHeight=useMemo(()=>{
    if(typeof window==='undefined') return 480
    return window.innerHeight-TAB_H
  },[result?.isBareChart])

  // ── Auth handlers ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPassword})
    if(error) setLoginError(error.message)
    setLoginLoading(false)
  }
  async function handleLogout() { await supabase.auth.signOut() }

  // ── Login screen ─────────────────────────────────────────────
  const skipAuth=process.env.NEXT_PUBLIC_SKIP_AUTH==='true'
  if(session===undefined&&!skipAuth) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'#080c14',color:'#5a7a95',fontFamily:'"JetBrains Mono","Fira Code",monospace',fontSize:12}}>
      Verificando sesión…
    </div>
  )
  if(session===null&&!skipAuth) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'#080c14',fontFamily:'"JetBrains Mono","Fira Code",monospace'}}>
      <div style={{width:340,padding:'40px 32px',background:'#0a101a',
        border:'1px solid #1a2d45',borderRadius:12,boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:20,fontWeight:700,color:'#eef5ff',marginBottom:6,letterSpacing:'0.02em'}}>
            <span style={{color:'#00d4ff'}}>⬡ </span>Trading Simulator
          </div>
          <div style={{fontSize:10,color:'#3a5a75',letterSpacing:'0.1em',textTransform:'uppercase'}}>Acceso privado</div>
        </div>
        <form onSubmit={handleLogin}>
          <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}
            placeholder="Email" autoFocus required
            style={{display:'block',width:'100%',padding:'10px 12px',marginBottom:10,
              background:'#080c14',border:'1px solid #1a2d45',borderRadius:6,
              color:'#eef5ff',fontSize:13,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}/>
          <input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}
            placeholder="Contraseña" required
            style={{display:'block',width:'100%',padding:'10px 12px',marginBottom:16,
              background:'#080c14',border:'1px solid #1a2d45',borderRadius:6,
              color:'#eef5ff',fontSize:13,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}/>
          {loginError&&<div style={{marginBottom:12,padding:'8px 12px',
            background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',
            borderRadius:6,color:'#ff4d6d',fontSize:11}}>{loginError}</div>}
          <button type="submit" disabled={loginLoading}
            style={{width:'100%',padding:'11px',background:'#00d4ff',border:'none',borderRadius:6,
              color:'#080c14',fontSize:13,fontWeight:700,cursor:loginLoading?'wait':'pointer',
              fontFamily:'inherit',opacity:loginLoading?0.6:1,letterSpacing:'0.02em'}}>
            {loginLoading?'Iniciando sesión…':'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )

  // ── Formatea timestamp de última actualización de alertas ────
  const fmtLastUpdated=(ts)=>{
    if(ts===null||ts===undefined) return 'nunca'
    const mins=Math.floor((Date.now()-ts)/60000)
    if(mins<1) return 'hace menos de 1 min'
    if(mins<60) return `hace ${mins} min`
    const h=Math.floor(mins/60), m=mins%60
    return `hace ${h} h${m>0?` ${m} min`:''}`
  }

  return (
    <>
      <Head>
        <title>Trading Simulator V9.407</title>
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
          /* ── Nav icons — force 16px regardless of any inheritance ── */
          .nav-item-icon { font-size:16px !important; width:18px !important; flex-shrink:0 !important; text-align:center !important; display:inline-block !important; line-height:1 !important; }
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
        @keyframes warnPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes alarmPulse {
          0%,100% { opacity:1; box-shadow:var(--bc) 0 0 7px; }
          50% { opacity:0.25; box-shadow:none; }
        }
        @keyframes rowPulse {
          0%,100% { opacity:1; }
          50% { opacity:0.45; }
        }
        @keyframes bellSwing {
          0%,100%{transform:rotate(0deg)}
          15%{transform:rotate(15deg)}
          30%{transform:rotate(-12deg)}
          45%{transform:rotate(8deg)}
          60%{transform:rotate(-5deg)}
          75%{transform:rotate(3deg)}
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
          <div className="header-logo" onClick={()=>{setSidePanel('tradelog');setTlTab('dashboard')}} style={{display:'flex',alignItems:'center',padding:'0 16px',flexShrink:0,cursor:'pointer',position:'relative',zIndex:1000}}>
            <span className="dot"/>Trading Simulator V9.407
          </div>

          {/* SP500 bar — misma altura que tabs, inline en header */}
          {sp5&&(
            <div onClick={()=>window.open('https://www.tradingview.com/chart/?symbol=SPX','_blank')} title="Ver SP500 en TradingView" style={{
              display:'flex',alignItems:'center',gap:6,
              padding:'0 12px',
              borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',
              fontFamily:MONO,fontSize:11,flexShrink:0,
              cursor:'pointer',
            }}>
              <span className="header-sp500-label">SP500</span>
              <span className="header-sp500-val">{fmt(sp5.precio,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaR}</span>
              <span className="header-sp500-ema">{fmt(sp5.emaR,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaL}</span>
              <span style={{color:'#ff4d6d',fontWeight:600,fontFamily:MONO,fontSize:12}}>{fmt(sp5.emaL,2)}</span>
            </div>
          )}

          {/* Botones derecha */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto',padding:'0 12px'}}>
            {stratName&&(
              <div style={{position:'relative',flexShrink:0}}>
                {stratDropOpen&&(
                  <div style={{position:'fixed',inset:0,zIndex:899}} onClick={()=>setStratDropOpen(false)}/>
                )}
                <button onClick={()=>setStratDropOpen(v=>!v)}
                  title="Estrategia activa. Haz clic para cambiar de estrategia"
                  style={{fontFamily:MONO,fontSize:11,color:'#00e5a0',display:'flex',alignItems:'center',gap:4,
                    padding:'3px 9px',borderRadius:4,
                    background:stratDropOpen?'rgba(0,229,160,0.12)':'rgba(0,229,160,0.06)',
                    border:'1px solid rgba(0,229,160,0.2)',
                    maxWidth:200,cursor:'pointer',overflow:'hidden',whiteSpace:'nowrap'}}>
                  <span style={{color:'#00e5a0',fontSize:8}}>●</span>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{stratName}</span>
                  <span style={{fontSize:8,marginLeft:2,opacity:0.7,flexShrink:0}}>▾</span>
                </button>
                {stratDropOpen&&(
                  <div style={{position:'absolute',top:'100%',right:0,zIndex:900,marginTop:4,
                    background:'#0d1520',border:'1px solid #1a2d45',borderRadius:6,
                    boxShadow:'0 4px 16px rgba(0,0,0,0.4)',
                    minWidth:200,maxWidth:280,maxHeight:300,overflowY:'auto',padding:'4px 0'}}>
                    {(strategies||[]).filter(s=>s.enabled!==false).map(s=>{
                      const isAct=s.id===currentStratId
                      return(
                        <div key={s.id}
                          onClick={()=>{loadStrategy(s);setStratDropOpen(false)}}
                          style={{padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,
                            background:isAct?'rgba(0,229,160,0.08)':'transparent'}}
                          onMouseOver={e=>{if(!isAct)e.currentTarget.style.background='rgba(255,255,255,0.04)'}}
                          onMouseOut={e=>{e.currentTarget.style.background=isAct?'rgba(0,229,160,0.08)':'transparent'}}>
                          <span style={{fontSize:10,color:isAct?'#00e5a0':'transparent',flexShrink:0}}>✓</span>
                          <span style={{fontFamily:MONO,fontSize:11,color:isAct?'#00e5a0':'#c8def2',
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{s.name||'—'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {tlUseLocal()
              ? <span style={{fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:4,
                  background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',color:'#ffd166'}}>
                  💾 Local
                </span>
              : <a href={`https://supabase.com/dashboard/project/${(getSupaUrl().match(/https:\/\/([^.]+)\.supabase\.co/)||[])[1]||''}`} target="_blank" rel="noreferrer"
                  style={{fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',textDecoration:'none',
                    background:'rgba(0,212,255,0.06)',border:'1px solid rgba(0,212,255,0.25)',color:'#00d4ff',
                    display:'flex',alignItems:'center',gap:5}}>
                  ☁ Supabase ↗
                </a>
            }
            <button onClick={handleLogout} title={`Cerrar sesión (${session?.user?.email||''})`}
              style={{background:'rgba(255,77,109,0.06)',border:'1px solid rgba(255,77,109,0.2)',color:'#ff4d6d',
                fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:6,cursor:'pointer',
                display:'flex',alignItems:'center',gap:5,transition:'background 0.15s,border-color 0.15s'}}
              onMouseOver={e=>{e.currentTarget.style.background='rgba(255,77,109,0.14)';e.currentTarget.style.borderColor='#ff4d6d'}}
              onMouseOut={e=>{e.currentTarget.style.background='rgba(255,77,109,0.06)';e.currentTarget.style.borderColor='rgba(255,77,109,0.2)'}}>
              ⏻ Salir
            </button>
            <button onClick={()=>setSettingsOpen(true)} title="Settings"
              style={{background:'rgba(0,212,255,0.06)',border:'1px solid rgba(0,212,255,0.25)',color:'#00d4ff',
                fontFamily:MONO,fontSize:20,padding:'4px 10px',borderRadius:6,cursor:'pointer',
                lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',
                transition:'background 0.15s,border-color 0.15s,color 0.15s'}}
              onMouseOver={e=>{e.currentTarget.style.background='rgba(0,212,255,0.14)';e.currentTarget.style.borderColor='#00d4ff'}}
              onMouseOut={e=>{e.currentTarget.style.background='rgba(0,212,255,0.06)';e.currentTarget.style.borderColor='rgba(0,212,255,0.25)'}}>
              ⚙
            </button>
          </div>
        </header>


        <div className="main">
          {/* ── VERTICAL NAV ── */}
          <nav
            onMouseEnter={()=>setNavExpanded(true)}
            onMouseLeave={()=>setNavExpanded(false)}
            onWheel={e=>{if(e.ctrlKey){e.preventDefault();handlePanelScaleWheel('nav',e)}}}
            style={{width:navExpanded?Math.round(140*(panelScale.nav||1)):Math.round(34*(panelScale.nav||1)),transition:'width 0.18s ease',display:'flex',flexDirection:'column',
              background:'var(--bg2)',borderRight:'1px solid var(--border)',flexShrink:0,overflow:'hidden',
              zIndex:15,paddingTop:6,paddingBottom:6}}
          >
            {[
              {id:'config',     icon:'📈', label:'Estrategias'},
              {id:'alarms',     icon:'🔔',label:'Alertas',   hasAlerts:alarmActiveCount>0, alertCount:alarmActiveCount},
              {id:'watchlist',  icon:'📋',label:'Watchlist'},
              {id:'multi',      icon:'📊',label:'Backtesting'},
              {id:'tradelog',   icon:'📒',label:'TradeLog',  accent:'#9b72ff'},
              {id:'risk',       icon:'⚖️', label:'Risk Mgmt', accent:'#378add'},
            ].map(item=>(
              <button key={item.id}
                onClick={()=>setSidePanel(item.id)}
                title={!navExpanded?item.label:undefined}
                style={{display:'flex',alignItems:'center',gap:10,padding:'9px 8px',width:'100%',
                  background:sidePanel===item.id?'var(--bg3)':'transparent',
                  border:'none',borderLeft:sidePanel===item.id?`2px solid ${item.accent||'var(--accent)'}`:'2px solid transparent',
                  color:sidePanel===item.id?(item.accent||'var(--accent)'):'var(--text3)',
                  fontFamily:MONO,fontSize:16,cursor:'pointer',whiteSpace:'nowrap',textAlign:'left',
                  transition:'background 0.12s,color 0.12s',position:'relative'}}
              >
                <span className="nav-item-icon"
                  title={item.hasAlerts?`${item.alertCount} alerta${item.alertCount!==1?'s':''} activa${item.alertCount!==1?'s':''}`:undefined}
                  style={{animation:item.hasAlerts?'bellSwing 1.2s ease-in-out infinite':undefined,
                    transformOrigin:'top center'}}>{item.icon}</span>
                <span style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',opacity:navExpanded?1:0,transition:'opacity 0.1s'}}>
                  {item.label}
                </span>
              </button>
            ))}
          </nav>

          {/* ── SIDEBAR ── */}
          <aside className="sidebar" style={{padding:0,gap:0,position:'relative',width:sidePanel==='tradelog'&&tlTab==='dashboard'?0:sidebarW,overflow:'hidden',flexShrink:0,flexGrow:0,transition:'width 0.3s ease'}} onContextMenu={e=>openCtx(e,'sidebar')}
            onWheel={e=>{if(e.ctrlKey){e.preventDefault();handlePanelScaleWheel(sidePanel,e)}}}>
            {/* Resize handle — right edge */}
            <div onMouseDown={e=>{sidebarResizing.current=true;sidebarStartX.current=e.clientX;sidebarStartW.current=sidebarW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
              style={{position:'absolute',top:0,right:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                background:'transparent',transition:'background 0.15s'}}
              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
            {/* Zoom wrapper — escala el contenido del panel activo con Ctrl+Scroll */}
            <div style={{zoom:panelScale[sidePanel]||1,display:'flex',flexDirection:'column',flex:1,overflow:'hidden',height:'100%'}}>

            {sidePanel==='config'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* ── Header: título + búsqueda + botón nueva ── */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                    <span className="sidebar-title" style={{margin:0,flex:1}}>Estrategias</span>
                    <button onClick={()=>setShowStratManager(true)} title="Gestionar todas las estrategias en vista tabla"
                      style={{background:'rgba(0,212,255,0.06)',border:'1px solid var(--border)',color:'#8aadcc',fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',lineHeight:1.4}}>⊞</button>
                    <button onClick={newStrategy} title="Nueva estrategia"
                      style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:12,padding:'2px 8px',borderRadius:3,cursor:'pointer',lineHeight:1.4}}>+</button>
                  </div>
                  <div style={{position:'relative'}}>
                    <input
                      type="text"
                      placeholder="🔍 Buscar…"
                      value={strForm._search||''}
                      onChange={e=>setStrForm(p=>({...p,_search:e.target.value}))}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 22px 4px 7px',borderRadius:4,boxSizing:'border-box'}}
                    />
                    {strForm._search&&<span onClick={()=>setStrForm(p=>({...p,_search:''}))}
                      style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>
                </div>

                {/* ── Filtros de mercado ── */}
                {(()=>{
                  const anyOn=filtros.vix.activo||filtros.indiceEma.activo||filtros.sectorEma.activo||filtros.cruceEma.activo
                  const onCnt=[filtros.vix.activo,filtros.indiceEma.activo,filtros.sectorEma.activo,filtros.cruceEma.activo].filter(Boolean).length
                  const fInp={background:'#0a1520',border:'1px solid #1a3d5a',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'1px 4px',boxSizing:'border-box',outline:'none',width:'100%'}
                  const fToggle=(key)=>setFiltros(p=>({...p,[key]:{...p[key],activo:!p[key].activo}}))
                  const fSet=(key,field,val)=>setFiltros(p=>({...p,[key]:{...p[key],[field]:val}}))
                  const toggleBtn=(active)=>({
                    display:'inline-flex',alignItems:'center',justifyContent:'center',
                    width:28,height:14,borderRadius:7,flexShrink:0,cursor:'pointer',transition:'background 0.15s',
                    background:active?'#00e5a0':'#1a2d45',position:'relative',flexShrink:0,
                  })
                  const toggleKnob=(active)=>({
                    position:'absolute',width:10,height:10,borderRadius:'50%',
                    background:active?'#fff':'#7a9bc0',
                    left:active?16:2,transition:'left 0.15s',
                  })
                  const lbl=(active)=>({fontFamily:MONO,fontSize:11,color:active?'var(--text)':'var(--text2)',flex:1})
                  const plbl={fontFamily:MONO,fontSize:9,color:'var(--text2)',whiteSpace:'nowrap'}
                  const ivBtn=(on,semanal=false)=>({fontFamily:MONO,fontSize:9,padding:'1px 5px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${on?(semanal?'#a07820':'#2d6e4e'):'#1a3d5a'}`,
                    background:on?(semanal?'rgba(240,192,64,0.12)':'rgba(76,175,130,0.12)'):'transparent',
                    color:on?(semanal?'#f0c040':'#4caf82'):'var(--text2)'})
                  return(
                  <div style={{borderBottom:'1px solid var(--border)',flexShrink:0}}>
                    {/* Cabecera colapsable */}
                    <div onClick={()=>setFiltrosOpen(v=>!v)}
                      style={{padding:'8px 10px',borderBottom:filtrosOpen?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                      onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
                      <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{filtrosOpen?'▼':'▶'}</span>
                      <span style={{fontFamily:MONO,fontSize:12,color:anyOn?'#00e5a0':'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>FILTROS DE MERCADO</span>
                      {anyOn&&<span style={{fontFamily:MONO,fontSize:9,background:'rgba(0,229,160,0.18)',color:'#00e5a0',
                        borderRadius:3,padding:'0 4px',lineHeight:'14px',flexShrink:0}}>
                        {onCnt} activo{onCnt>1?'s':''}
                      </span>}
                    </div>

                    {filtrosOpen&&(
                      <div style={{padding:'2px 10px 8px',display:'flex',flexDirection:'column',gap:7}}>

                        {/* ── Filtro VIX ── */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.vix.activo?4:0}}>
                            <div style={toggleBtn(filtros.vix.activo)} onClick={()=>fToggle('vix')}>
                              <div style={toggleKnob(filtros.vix.activo)}/>
                            </div>
                            <span style={lbl(filtros.vix.activo)}>VIX &lt; umbral</span>
                          </div>
                          {filtros.vix.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Umbral</span>
                              <input type="number" min={5} max={80} step={1}
                                value={filtros.vix.umbral}
                                onChange={e=>fSet('vix','umbral',Number(e.target.value)||25)}
                                style={{...fInp,width:54}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <span style={plbl}>Int</span>
                                <button style={ivBtn(filtros.vix.intervalo!=='semanal',false)} onClick={()=>fSet('vix','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.vix.intervalo==='semanal',true)} onClick={()=>fSet('vix','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* ── Filtro Índice EMA ── */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.indiceEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.indiceEma.activo)} onClick={()=>fToggle('indiceEma')}>
                              <div style={toggleKnob(filtros.indiceEma.activo)}/>
                            </div>
                            <span style={lbl(filtros.indiceEma.activo)}>Índice &gt; EMA</span>
                          </div>
                          {filtros.indiceEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Ticker</span>
                              <input type="text" value={filtros.indiceEma.ticker}
                                onChange={e=>fSet('indiceEma','ticker',e.target.value.toUpperCase())}
                                style={{...fInp,width:60}}/>
                              <span style={plbl}>EMA</span>
                              <input type="number" min={2} max={500} step={1}
                                value={filtros.indiceEma.periodo}
                                onChange={e=>fSet('indiceEma','periodo',Number(e.target.value)||200)}
                                style={{...fInp,width:50}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.indiceEma.intervalo!=='semanal',false)} onClick={()=>fSet('indiceEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.indiceEma.intervalo==='semanal',true)} onClick={()=>fSet('indiceEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* ── Filtro Sector EMA ── */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.sectorEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.sectorEma.activo)} onClick={()=>fToggle('sectorEma')}>
                              <div style={toggleKnob(filtros.sectorEma.activo)}/>
                            </div>
                            <span style={lbl(filtros.sectorEma.activo)}>Sector ETF &gt; EMA</span>
                          </div>
                          {filtros.sectorEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>ETF</span>
                              <input type="text" value={filtros.sectorEma.ticker}
                                onChange={e=>fSet('sectorEma','ticker',e.target.value.toUpperCase())}
                                style={{...fInp,width:60}}/>
                              <span style={plbl}>EMA</span>
                              <input type="number" min={2} max={500} step={1}
                                value={filtros.sectorEma.periodo}
                                onChange={e=>fSet('sectorEma','periodo',Number(e.target.value)||50)}
                                style={{...fInp,width:50}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.sectorEma.intervalo!=='semanal',false)} onClick={()=>fSet('sectorEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.sectorEma.intervalo==='semanal',true)} onClick={()=>fSet('sectorEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* ── Filtro Cruce EMA ── */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.cruceEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.cruceEma.activo)} onClick={()=>fToggle('cruceEma')}>
                              <div style={toggleKnob(filtros.cruceEma.activo)}/>
                            </div>
                            <span style={lbl(filtros.cruceEma.activo)}>Cruce EMA (R&gt;L)</span>
                          </div>
                          {filtros.cruceEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Ticker</span>
                              <input type="text" value={filtros.cruceEma.ticker}
                                onChange={e=>fSet('cruceEma','ticker',e.target.value.toUpperCase())}
                                style={{...fInp,width:60}}/>
                              <span style={plbl}>R</span>
                              <input type="number" min={2} max={500} step={1}
                                value={filtros.cruceEma.periodoR}
                                onChange={e=>fSet('cruceEma','periodoR',Number(e.target.value)||10)}
                                style={{...fInp,width:42}}/>
                              <span style={plbl}>L</span>
                              <input type="number" min={2} max={500} step={1}
                                value={filtros.cruceEma.periodoL}
                                onChange={e=>fSet('cruceEma','periodoL',Number(e.target.value)||11)}
                                style={{...fInp,width:42}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.cruceEma.intervalo!=='semanal',false)} onClick={()=>fSet('cruceEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.cruceEma.intervalo==='semanal',true)} onClick={()=>fSet('cruceEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>

                        {anyOn&&<div style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',lineHeight:1.4,marginTop:1}}>
                          AND — todos los filtros activos en verde para permitir entrada. Zonas bloqueadas en rojo en el gráfico.
                        </div>}
                      </div>
                    )}
                  </div>
                  )
                })()}

                {/* ── Lista ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {strLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!strLoading&&strategies.length===0&&(
                    <div style={{padding:'14px 12px',fontFamily:MONO,fontSize:11,color:'var(--text3)',lineHeight:1.8}}>
                      Sin estrategias guardadas.
                      <br/>
                      <button onClick={newStrategy}
                        style={{marginTop:8,background:'rgba(0,212,255,0.08)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:4,cursor:'pointer'}}>
                        + Crear estrategia
                      </button>
                    </div>
                  )}
                  {!strLoading&&(()=>{
                    const q=(strForm._search||'').toLowerCase()
                    const list=(q?strategies.filter(s=>(s.name||'').toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q)):strategies).filter(s=>s.enabled!==false)
                    if(!list.length&&q) return <div style={{padding:'10px 12px',fontFamily:MONO,fontSize:11,color:'var(--text3)'}}>Sin resultados.</div>
                    return list.map(s=>{
                      const isActive=currentStratId===s.id
                      const col=s.color||'#00d4ff'
                      const sIv=readStratIntervalo(s)
                      const sIsSemanal=sIv==='semanal'
                      const toggleSIv=async(e)=>{
                        e.stopPropagation()
                        const newIv=sIsSemanal?'diario':'semanal'
                        // Optimistic update local state
                        setStrategies(prev=>prev.map(st=>{
                          if(st.id!==s.id)return st
                          try{const p=typeof st.params==='string'?JSON.parse(st.params||'{}'):(st.params||{});return{...st,params:JSON.stringify({...p,intervalo:newIv})}}
                          catch{return{...st,params:JSON.stringify({intervalo:newIv})}}
                        }))
                        // Save to Supabase
                        try{
                          const p=typeof s.params==='string'?JSON.parse(s.params||'{}'):(s.params||{})
                          await apiFetch('/api/strategies',{method:'PUT',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({id:s.id,params:JSON.stringify({...p,intervalo:newIv})})})
                        }catch(_){}
                        // Re-ejecutar si es la estrategia activa
                        if(isActive)setEstrategiaIntervalo(newIv)
                      }
                      const isDisabled = s.enabled === false
                      return (
                        <div key={s.id}
                          onClick={()=>openEditStr(s)}
                          title="Clic para editar esta estrategia"
                          style={{padding:'7px 10px',display:'flex',alignItems:'center',gap:6,
                            borderBottom:'1px solid var(--border)',
                            background:isActive?'rgba(0,212,255,0.07)':'transparent',
                            borderLeft:`2px solid ${isActive?col:'transparent'}`,
                            transition:'background 0.1s',
                            opacity: isDisabled ? 0.45 : 1,
                            cursor:'pointer',
                          }}
                          onMouseOver={e=>{if(!isActive)e.currentTarget.style.background='rgba(255,255,255,0.03)'}}
                          onMouseOut={e=>{if(!isActive)e.currentTarget.style.background='transparent'}}>
                          {/* Color dot */}
                          <span style={{width:8,height:8,borderRadius:'50%',background:col,
                            flexShrink:0,display:'inline-block',boxShadow:isActive?`0 0 5px ${col}88`:'none'}}/>
                          {/* Name + meta */}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:isActive?'var(--accent)':'#d0e8fa',
                              fontWeight:isActive?700:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>
                              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</span>
                              {isDisabled&&<span style={{fontSize:8,color:'#ff4d6d',background:'rgba(255,77,109,0.12)',border:'1px solid rgba(255,77,109,0.3)',padding:'0 3px',borderRadius:3,flexShrink:0}}>off</span>}
                            </div>
                            <div style={{fontFamily:MONO,fontSize:9,color:'#5a7a95',marginTop:1,display:'flex',alignItems:'center',gap:4}}>
                              <span>{s.years||'?'}a · {s.definition?.setup?.ma_fast||s.ema_r||'?'}/{s.definition?.setup?.ma_slow||s.ema_l||'?'}</span>
                              <span onClick={toggleSIv}
                                title={sIsSemanal?'Semanal — pulsar para cambiar a diario':'Diario — pulsar para cambiar a semanal'}
                                style={{fontFamily:MONO,fontSize:9,padding:'0 4px',borderRadius:3,
                                  border:`1px solid ${sIsSemanal?'#a07820':'#2d6e4e'}`,
                                  background:sIsSemanal?'rgba(240,192,64,0.12)':'rgba(76,175,130,0.12)',
                                  color:sIsSemanal?'#f0c040':'#4caf82',
                                  lineHeight:'14px',flexShrink:0,cursor:'pointer',userSelect:'none',
                                  transition:'background 0.15s,border-color 0.15s,color 0.15s'}}>
                                {sIsSemanal?'S':'D'}
                              </span>
                            </div>
                          </div>
                          {/* Play/Stop button */}
                          <button onClick={e=>{e.stopPropagation();isActive?stopStrategy():loadStrategyLegacy(s)}}
                            title={isActive?`Detener: ${s.name}`:`Ejecutar: ${s.name}`}
                            style={{background:isActive?'rgba(255,77,109,0.15)':'rgba(0,212,255,0.08)',
                              border:`1px solid ${isActive?'#ff4d6d':'var(--accent)'}`,
                              color:isActive?'#ff4d6d':'var(--accent)',
                              fontFamily:MONO,fontSize:12,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                              flexShrink:0,transition:'all 0.1s'}}
                            onMouseOver={e=>{e.currentTarget.style.background=isActive?'rgba(255,77,109,0.25)':`${col}33`}}
                            onMouseOut={e=>{e.currentTarget.style.background=isActive?'rgba(255,77,109,0.15)':'rgba(0,212,255,0.08)'}}>
                            {isActive?'■':'▶'}
                          </button>
                        </div>
                      )
                    })
                  })()}
                </div>

                {/* ── Footer: estado de carga ── */}
                {loading&&<div style={{padding:'4px 10px',fontFamily:MONO,fontSize:11,color:'var(--accent)',borderTop:'1px solid var(--border)',flexShrink:0}}>⟳ Actualizando…</div>}
                {error&&<div style={{padding:'4px 10px',fontFamily:MONO,fontSize:11,color:'#ff4d6d',borderTop:'1px solid var(--border)',flexShrink:0}}>⚠ {error}</div>}
              </div>
            )}

            {(sidePanel==='watchlist'||sidePanel==='risk')&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'visible',minHeight:0}}>
                {/* ══ Cabecera Watchlist: búsqueda + iconos de filtro ══ */}
                {(()=>{
                  const iBtn=(active,ac,hoverAc)=>({
                    background:active?`${ac}22`:'transparent',
                    border:`1px solid ${active?ac:'transparent'}`,
                    color:active?ac:'#4a6a88',
                    borderRadius:4,cursor:'pointer',padding:4,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    flexShrink:0,lineHeight:1,transition:'background 0.1s,color 0.1s',
                  })
                  const anyAlarmFired=alarmActiveCount>0
                  const anyFilterActive=!!(wlSearch||selectedLists.length||onlyFavs||condFilterActive||onlyOpen)
                  return(
                    <div style={{padding:'4px 8px 3px',flexShrink:0,display:'flex',gap:3,alignItems:'center'}}>
                      {/* Search — ocupa el espacio disponible */}
                      <div style={{position:'relative',flex:1,minWidth:0}}>
                        <input type="text" placeholder="Buscar…" value={wlSearch} onChange={e=>setWlSearch(e.target.value)}
                          style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',
                            fontFamily:MONO,fontSize:11,padding:'3px 20px 3px 7px',borderRadius:4,boxSizing:'border-box'}}/>
                        {wlSearch&&<span onClick={()=>setWlSearch('')}
                          style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',
                            cursor:'pointer',color:'#a8ccdf',fontSize:10,lineHeight:1}}>✕</span>}
                      </div>

                      {/* ListFilter — selector de lista (multiselección) */}
                      {(()=>{
                        const namedSel=selectedLists.filter(s=>s!=='__unassigned__')
                        const unassignedSel=selectedLists.includes('__unassigned__')
                        const allOrNone=selectedLists.length===0
                        const listBtnTitle=allOrNone
                          ?'Todas las listas'
                          :selectedLists.length===1&&!unassignedSel
                            ?namedSel[0]
                            :selectedLists.length===1&&unassignedSel
                              ?'Sin lista asignada'
                              :`${selectedLists.length} listas`
                        const toggleList=name=>setSelectedLists(prev=>
                          prev.includes(name)?prev.filter(x=>x!==name):[...prev,name])
                        return(
                          <div style={{position:'relative'}}>
                            <button onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setListDropOpen(prev=>prev?null:{x:r.left,y:r.bottom+4})}}
                              title={listBtnTitle}
                              style={iBtn(selectedLists.length>0,'#00d4ff')}
                              onMouseOver={e=>{if(!selectedLists.length)e.currentTarget.style.color='#00d4ff'}}
                              onMouseOut={e=>{if(!selectedLists.length)e.currentTarget.style.color='#4a6a88'}}>
                              <ListFilter size={16}/>
                            </button>
                            {listDropOpen&&(
                              <>
                                {/* overlay para cerrar al hacer click fuera */}
                                <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:9989}}
                                  onClick={()=>setListDropOpen(null)}/>
                                <div style={{position:'fixed',top:listDropOpen.y,left:listDropOpen.x,background:'var(--bg3)',
                                  border:'1px solid var(--border)',borderRadius:4,zIndex:9990,
                                  boxShadow:'0 4px 16px rgba(0,0,0,0.7)',width:'max-content',minWidth:170,maxWidth:290}}>
                                  {/* Todas las listas */}
                                  <div onClick={()=>{setSelectedLists([]);setListDropOpen(null)}}
                                    style={{padding:'6px 10px',fontFamily:MONO,fontSize:11,cursor:'pointer',
                                      color:allOrNone?'var(--accent)':'var(--text)',
                                      borderBottom:'1px solid var(--border)',userSelect:'none'}}>
                                    Todas las listas
                                  </div>
                                  {/* Listas individuales con checkbox */}
                                  {wlLists.map(l=>{
                                    const checked=selectedLists.includes(l.name)
                                    return(
                                      <div key={l.id}
                                        style={{padding:'4px 6px 4px 10px',fontFamily:MONO,fontSize:11,
                                          display:'flex',alignItems:'center',gap:4,color:'var(--text)',whiteSpace:'nowrap'}}>
                                        <span onClick={()=>toggleList(l.name)}
                                          style={{display:'flex',alignItems:'center',gap:6,flex:1,padding:'3px 0',cursor:'pointer',userSelect:'none'}}>
                                          <span style={{
                                            width:11,height:11,border:`1px solid ${checked?'var(--accent)':'#3a5a78'}`,
                                            borderRadius:2,background:checked?'var(--accent)':'transparent',
                                            display:'inline-flex',alignItems:'center',justifyContent:'center',
                                            flexShrink:0,transition:'all 0.1s'}}>
                                            {checked&&<span style={{color:'#0d1520',fontSize:8,lineHeight:1,fontWeight:700}}>✓</span>}
                                          </span>
                                          <span style={{color:checked?'var(--accent)':'var(--text)'}}>{l.name}</span>
                                        </span>
                                        <span onClick={async e=>{
                                            e.stopPropagation()
                                            const n=window.prompt(`Renombrar lista "${l.name}":`,l.name)
                                            if(!n||!n.trim()||n.trim()===l.name) return
                                            try{
                                              await renameWatchlistList(l.id,n.trim())
                                              if(selectedLists.includes(l.name)) setSelectedLists(prev=>prev.map(x=>x===l.name?n.trim():x))
                                              reloadWatchlist(); setListDropOpen(null)
                                            }catch(err){alert('Error: '+err.message)}
                                          }}
                                          title="Renombrar lista"
                                          style={{color:'#3d5a7a',fontSize:11,cursor:'pointer',padding:'2px 4px',borderRadius:2,flexShrink:0,lineHeight:1}}
                                          onMouseOver={e=>e.currentTarget.style.color='#ffd166'}
                                          onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>✏</span>
                                        <span onClick={async e=>{
                                            e.stopPropagation()
                                            if(!window.confirm(`¿Eliminar lista "${l.name}"?\nLos activos no se eliminarán.`)) return
                                            try{
                                              await deleteWatchlistList(l.id)
                                              if(selectedLists.includes(l.name)) setSelectedLists(prev=>prev.filter(x=>x!==l.name))
                                              reloadWatchlist(); setListDropOpen(null)
                                            }catch(err){alert('Error: '+err.message)}
                                          }}
                                          title="Eliminar lista"
                                          style={{color:'#3d3a3a',fontSize:11,cursor:'pointer',padding:'2px 4px',borderRadius:2,flexShrink:0,lineHeight:1}}
                                          onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                                          onMouseOut={e=>e.currentTarget.style.color='#3d3a3a'}>✕</span>
                                      </div>
                                    )
                                  })}
                                  {/* Sin lista asignada — separada con divisor */}
                                  <div style={{borderTop:'1px solid var(--border)',marginTop:2}}>
                                    <div onClick={()=>toggleList('__unassigned__')}
                                      style={{padding:'4px 10px 6px',fontFamily:MONO,fontSize:11,cursor:'pointer',
                                        display:'flex',alignItems:'center',gap:6,userSelect:'none',
                                        color:unassignedSel?'var(--accent)':'var(--text3)'}}>
                                      <span style={{
                                        width:11,height:11,border:`1px solid ${unassignedSel?'var(--accent)':'#3a5a78'}`,
                                        borderRadius:2,background:unassignedSel?'var(--accent)':'transparent',
                                        display:'inline-flex',alignItems:'center',justifyContent:'center',
                                        flexShrink:0,transition:'all 0.1s'}}>
                                        {unassignedSel&&<span style={{color:'#0d1520',fontSize:8,lineHeight:1,fontWeight:700}}>✓</span>}
                                      </span>
                                      Sin lista asignada
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })()}

                      {/* Briefcase — en cartera */}
                      <button onClick={()=>setOnlyOpen(f=>!f)}
                        title={onlyOpen?'En cartera (activo — click para quitar)':'Filtrar solo posiciones abiertas'}
                        style={iBtn(onlyOpen,'#00d4ff')}
                        onMouseOver={e=>{if(!onlyOpen)e.currentTarget.style.color='#00d4ff'}}
                        onMouseOut={e=>{if(!onlyOpen)e.currentTarget.style.color='#4a6a88'}}>
                        <Briefcase size={16}/>
                      </button>

                      {/* Star — favoritos */}
                      <button onClick={()=>setOnlyFavs(f=>!f)}
                        title={onlyFavs?'Solo favoritos (activo — click para quitar)':'Filtrar solo favoritos'}
                        style={iBtn(onlyFavs,'#ffd166')}
                        onMouseOver={e=>{if(!onlyFavs)e.currentTarget.style.color='#ffd166'}}
                        onMouseOut={e=>{if(!onlyFavs)e.currentTarget.style.color='#4a6a88'}}>
                        <Star size={16}/>
                      </button>

                      {/* Bell — filtro: solo activos con al menos un círculo activo */}
                      <button onClick={()=>{setCondFilterActive(f=>!f);setListDropOpen(null)}}
                        title={condFilterActive?'Con alertas activas (click para quitar)':'Mostrar solo activos con alertas activas'}
                        style={{...iBtn(condFilterActive,'#ff4d6d'),
                          animation:anyAlarmFired&&!condFilterActive?'bellSwing 1.2s ease-in-out infinite':undefined}}
                        onMouseOver={e=>{if(!condFilterActive)e.currentTarget.style.color='#ff4d6d'}}
                        onMouseOut={e=>{if(!condFilterActive)e.currentTarget.style.color='#4a6a88'}}>
                        <Bell size={16}/>
                      </button>

                      {/* X — limpiar filtros (siempre visible; naranja brillante si hay filtros, apagado si no) */}
                      <button onClick={()=>{setWlSearch('');setSelectedLists([]);setOnlyFavs(false);setCondFilterActive(false);setOnlyOpen(false);setListDropOpen(null)}}
                        title="Limpiar filtros"
                        style={anyFilterActive?iBtn(true,'#ff9a3c'):{...iBtn(false,'#ff9a3c'),opacity:0.3,cursor:'default'}}
                        onMouseOver={e=>{if(anyFilterActive)e.currentTarget.style.background='rgba(255,154,60,0.2)'}}
                        onMouseOut={e=>{if(anyFilterActive)e.currentTarget.style.background='rgba(255,154,60,0.13)'}}>
                        <LucideX size={16}/>
                      </button>
                    </div>
                  )
                })()}


                {/* Banner alertas desactualizadas (solo cuando lista supera umbral) */}
                {filteredWlItems.length>alertThreshold&&(alertsLastUpdated===null||Date.now()-alertsLastUpdated>1200000)&&(
                  <div style={{padding:'7px 10px',background:'#1a2a3a',borderLeft:'3px solid #f59e0b',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    {alarmStatusLoading&&alarmCheckProgress
                      ? <span style={{fontFamily:MONO,fontSize:11,color:'#94a3b8',flex:1}}>⟳ Comprobando {alarmCheckProgress.done}/{alarmCheckProgress.total}…</span>
                      : <>
                          <span style={{fontFamily:MONO,fontSize:11,color:'#94a3b8',flex:1}}>⚠ Alertas técnicas desactualizadas · última comprobación: {fmtLastUpdated(alertsLastUpdated)}</span>
                          <button onClick={()=>refreshAlarmStatus(filteredWlItems,alarms,true)} disabled={alarmStatusLoading}
                            title="Comprobar condiciones técnicas (círculos de colores) para todos los activos visibles. El Ranking y las estrategias óptimas se actualizan por separado con sus propios botones."
                            style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.4)',color:'#f59e0b',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                            ↻ Comprobar alertas ahora
                          </button>
                        </>
                    }
                  </div>
                )}

                {/* ── Lista de activos ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {wlLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!wlLoading&&(()=>{
                    const searchLower=wlSearch.toLowerCase()
                    const fCondId=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.filterConditionId||null}catch(_){return null}})()
                    const filtered=watchlist.filter(w=>{
                      const matchList=(()=>{
                        if(selectedLists.length===0) return true
                        const namedSel=selectedLists.filter(s=>s!=='__unassigned__')
                        const hasUnassigned=selectedLists.includes('__unassigned__')
                        const listIds=w.list_ids||[]
                        if(hasUnassigned&&listIds.length===0) return true
                        if(namedSel.length>0&&listIds.some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&namedSel.includes(l.name)})) return true
                        return false
                      })()
                      const matchSearch=!wlSearch||(w.symbol||'').toLowerCase().includes(searchLower)||(w.name||'').toLowerCase().includes(searchLower)
                      const matchFav=!onlyFavs||w.favorite
                      const symAlarms=alarmStatus[w.symbol]||{}
                      const matchActive=!condFilterActive||conditions.filter(c=>c.active!==false).some(c=>{
                        const st=symAlarms[c.id]
                        if(!st?.active) return false
                        const blinkN=c.params?.blinkCandles??3
                        return st.bars!=null&&st.bars<=blinkN
                      })
                      return matchList&&matchSearch&&matchFav&&matchActive
                    })
                    // Sort: según wlSortMode
                    // scoreHistorico persiste en Supabase → disponible desde carga via bestStratBySymbol
                    // scoreCompleto es efímero → fallback a scoreHistorico si no hay sesión activa
                    const all=filtered.slice().sort((a,b)=>{
                      const symA=(a.symbol||'').toUpperCase(), symB=(b.symbol||'').toUpperCase()
                      const rdA=rankingData[symA], rdB=rankingData[symB]
                      const bsbA=bestStratBySymbol[symA], bsbB=bestStratBySymbol[symB]
                      if(wlSortMode==='scoreHistorico'){
                        const sa=rdA?.scoreHistorico??bsbA?.scoreHistorico
                        const sb=rdB?.scoreHistorico??bsbB?.scoreHistorico
                        if(sa!=null&&sb!=null) return sb-sa
                        if(sa!=null) return -1; if(sb!=null) return 1
                        return symA.localeCompare(symB)
                      }
                      if(wlSortMode==='scoreCompleto'){
                        // scoreCompleto requiere sesión activa; fallback a scoreHistorico
                        const sa=rdA?.scoreCompleto??rdA?.scoreHistorico??bsbA?.scoreHistorico
                        const sb=rdB?.scoreCompleto??rdB?.scoreHistorico??bsbB?.scoreHistorico
                        if(sa!=null&&sb!=null) return sb-sa
                        if(sa!=null) return -1; if(sb!=null) return 1
                        return symA.localeCompare(symB)
                      }
                      if(wlSortMode==='scoreHistoricoTop'){
                        const sa=wlData[symA]?.top?.scoreMetricas??null
                        const sb=wlData[symB]?.top?.scoreMetricas??null
                        if(sa!=null&&sb!=null) return sb-sa
                        if(sa!=null) return -1; if(sb!=null) return 1
                        return symA.localeCompare(symB)
                      }
                      if(wlSortMode==='scoreCompletoTop'){
                        const sa=wlData[symA]?.top?.scoreMetSeñ??wlData[symA]?.top?.scoreMetricas??null
                        const sb=wlData[symB]?.top?.scoreMetSeñ??wlData[symB]?.top?.scoreMetricas??null
                        if(sa!=null&&sb!=null) return sb-sa
                        if(sa!=null) return -1; if(sb!=null) return 1
                        return symA.localeCompare(symB)
                      }
                      if(wlSortMode==='alfabetico') return symA.localeCompare(symB)
                      return symA.localeCompare(symB)
                    })
                    const totalWl=watchlist.length
                    // BUG 2 FIX: calcular openSymbols/allFiltered ANTES del badge
                    // para que el contador refleje exactamente lo que se muestra
                    // Filtrar símbolos vacíos para evitar falsos positivos con symbol=null
                    const openSymbols=new Set((tlFifo.openPositions||[]).map(p=>p.symbol?.toUpperCase()).filter(Boolean))
                    const allFiltered=onlyOpen?all.filter(w=>w.symbol&&openSymbols.has(w.symbol.toUpperCase())):all
                    if(!allFiltered.length) return <div style={{padding:'12px',fontFamily:MONO,fontSize:11,color:'#8aadcc'}}>Sin activos para los filtros activos</div>
                    // Count badge + ranking button above list
                    const hasRanking=Object.keys(rankingData).length>0
                    const countBadge=(
                      <div style={{padding:'3px 8px',fontFamily:MONO,fontSize:11,color:'#a8ccdf',background:'var(--bg2)',borderBottom:'1px solid var(--border)',display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{color:'#a8c8e8',fontWeight:600}}>{allFiltered.length}</span>
                        <span style={{color:'#8abcd4'}}>activos</span>
                        {rankingRunning&&<span style={{color:'#ffd166',fontSize:10}}>⟳ {rankingProgress.done}/{rankingProgress.total}</span>}
                        <select value={wlSortMode} onChange={e=>setWlSortMode(e.target.value)}
                          style={{background:'#0d1520',border:'1px solid #1a2d45',color:'#8aadcc',fontFamily:MONO,fontSize:9,padding:'1px 3px',borderRadius:3,cursor:'pointer',marginLeft:2}}>
                          <optgroup label="── Estrategia activa ──">
                            <option value="scoreHistorico"       title="Score métricas de la estrategia activa. Se guarda en Supabase, disponible al cargar la app.">Score métricas (activa)</option>
                            <option value="scoreCompleto"        title="Score métricas + señales de mercado de la estrategia activa. Requiere ejecutar Ranking — fallback a score métricas.">Score mét.+señales (activa)</option>
                          </optgroup>
                          <optgroup label="── Top estrategia ──">
                            <option value="scoreHistoricoTop"    title="Score métricas de la top estrategia (mejor CAGR entre todas las habilitadas). Usa wlData[sym].top.scoreMetricas.">Score métricas (top)</option>
                            <option value="scoreCompletoTop"     title="Score métricas + señales de la top estrategia. Usa wlData[sym].top.scoreMetSeñ, fallback a scoreMetricas.">Score mét.+señales (top)</option>
                          </optgroup>
                          <optgroup label="────────────────────">
                            <option value="alfabetico"           title="Orden alfabético por ticker">Alfabético</option>
                          </optgroup>
                        </select>

                        <button onClick={()=>setShowWlManager(true)} title="Abrir panel de gestión de Watchlist"
                          style={{background:'rgba(0,212,255,0.08)',border:'1px solid rgba(0,212,255,0.25)',color:'#00d4ff',fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',letterSpacing:'0.04em'}}>
                          ⊞ Gestionar
                        </button>
                      </div>
                    )
                    return (<>{countBadge}{allFiltered.map((w,wIdx)=>{
                      const wListNames=(w.list_ids||[]).map(lid=>wlLists.find(l=>l.id===lid)?.name).filter(Boolean)
                      return(
                      <div key={w.id||`${w.symbol}-${wIdx}`}
                        style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)',
                          background:simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent',
                          borderLeft:`3px solid ${openSymbols.has((w.symbol||'').toUpperCase())?'#ffd166':'transparent'}`,
                          transition:'border-color 0.2s'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}
                        onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();const x=r.right+8;setWlTooltip({x:x+220>window.innerWidth?r.left-228:x,y:r.top,symbol:w.symbol})}}
                        onMouseLeave={()=>setWlTooltip(null)}>
                        {/* Ranking badge — posición desde wlData según wlSortMode */}
                        {wlShowRankBadge&&(()=>{
                          const symUp=(w.symbol||'').toUpperCase()
                          const wd=wlData[symUp]
                          const bsb=bestStratBySymbol[symUp]
                          const rd=rankingData[symUp]
                          // Score según wlSortMode activo
                          let score=null
                          if(wlSortMode==='scoreHistorico'||wlSortMode==='scoreHistoricoActiva'){
                            score=rd?.scoreHistorico??bsb?.scoreHistorico??null
                          } else if(wlSortMode==='scoreCompleto'||wlSortMode==='scoreCompletoActiva'){
                            score=rd?.scoreCompleto??rd?.scoreHistorico??null
                          } else if(wlSortMode==='scoreHistoricoTop'){
                            score=wd?.top?.scoreMetricas??null
                          } else if(wlSortMode==='scoreCompletoTop'){
                            score=wd?.top?.scoreMetSeñ??wd?.top?.scoreMetricas??null
                          }
                          if(score==null) return <span style={{width:24,flexShrink:0}}/>
                          const r=wlSortMode==='alfabetico'?null:wIdx+1
                          const col=!r?'#5a8aaa':r===1?'#ffd700':r===2?'#c0c0c0':r===3?'#cd7f32':r<=10?'#00d4ff':'#3d5a7a'
                          const scoreStr=fmt(score,1)+'%'
                          return(
                            <span title={`${r?`Rank #${r} · `:''}Score: ${scoreStr}`}
                              style={{fontFamily:MONO,fontSize:9,fontWeight:700,color:col,flexShrink:0,minWidth:24,textAlign:'center',lineHeight:1.2,display:'flex',flexDirection:'column',alignItems:'center'}}>
                              {r!=null&&<span>{r<=3?['🥇','🥈','🥉'][r-1]:`#${r}`}</span>}
                              <span style={{fontSize:8,color:'#5a8aaa',fontWeight:400,marginTop:r!=null?1:0}}>{scoreStr}</span>
                            </span>
                          )
                        })()}
                        {/* Estrella favorito */}
                        <span onClick={async(e)=>{e.stopPropagation();await upsertWatchlistItem({...w,favorite:!w.favorite});reloadWatchlist()}}
                          style={{cursor:'pointer',fontSize:12,color:w.favorite?'#ffd166':'var(--text3)',flexShrink:0}} title="Favorito">
                          {w.favorite?'★':'☆'}
                        </span>
                        {/* Nombre + P&L flotante — clic carga el activo */}
                        {(()=>{
                          const wSym=(w.symbol||'').toUpperCase()
                          const openPos=(tlFifo.openPositions||[]).find(p=>(p.symbol||'').toUpperCase()===wSym)
                          const hasLive=openPos&&tlLivePrices[openPos.symbol]?.price!=null
                          const pnlEur=openPos?._pnl_float_eur??0
                          const pnlPct=openPos?._pnl_float_pct??0
                          const pnlColor=pnlEur>=0?'#00e5a0':'#ff4d6d'
                          const eurStr=pnlEur<0?`-€${Math.round(Math.abs(pnlEur))}`:`€${Math.round(pnlEur)}`
                          const pctStr=`${Math.round(pnlPct)}%`
                          return(
                            <div onClick={()=>setSimbolo(w.symbol)} style={{flex:1,cursor:'pointer',minWidth:0}}>
                              <div style={{fontFamily:MONO,fontSize:11,color:simbolo===w.symbol?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
                              {(()=>{
                                const rdSym=rankingData[(w.symbol||'').toUpperCase()]
                                if(openPos&&hasLive) return(
                                  <div title={`P&L flotante: ${eurStr} / ${pctStr}`}
                                    style={{fontFamily:MONO,fontSize:10,color:pnlColor,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                    {eurStr} / {pctStr}
                                  </div>
                                )
                                {/* Línea secundaria: nombre top estrategia, color según si coincide con activa */}
                                const symUp2=(w.symbol||'').toUpperCase()
                                const topName=wlData[symUp2]?.top?.stratName
                                const activeName=wlData[symUp2]?.active?.stratName
                                const sameStrat=topName&&activeName&&topName===activeName
                                return(
                                  <div style={{fontFamily:MONO,fontSize:10,color:topName?(sameStrat?'#00c87a':'#ff9500'):'#4a7a95',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                    {topName||'—'}
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })()}
                        {/* Badges condiciones librería — círculos de color con velas */}
                        {(()=>{
                          if(!conditions.length){
                            // Sin condiciones configuradas — placeholder gris
                            return <span title="Sin alertas de condiciones configuradas" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:10,height:10,borderRadius:'50%',flexShrink:0,background:'rgba(42,63,85,0.35)',border:'1px solid #1e3a52',cursor:'default'}}/>
                          }
                          const visibleConds = conditions.filter(c=>c.active!==false)
                          if(!visibleConds.length) return null
                          const symSt=alarmStatus[w.symbol]
                          // symSt===undefined → nunca verificado; symSt===objeto → verificado
                          const checked=symSt!=null
                          const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          return visibleConds.map((c)=>{
                            const st=symSt?.[c.id]
                            const active=st?.active===true
                            const bars=st?.bars
                            const globalIdx=conditions.findIndex(x=>x.id===c.id)
                            const col=condColors[c.id]||COND_COLORS[(globalIdx>=0?globalIdx:0)%COND_COLORS.length]
                            const label=bars!=null?String(bars):'·'
                            const blinkN=c.params?.blinkCandles??3
                            const shouldBlink=active&&bars!=null&&bars<=blinkN
                            const tooltip=`${c.name}${active?` ✓ (${bars} velas atrás)`:(!checked?' · sin verificar':' · inactivo')}`
                            return(
                              <span key={c.id} title={tooltip}
                                onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setCondColorPicker(prev=>prev?.condId===c.id?null:{condId:c.id,x:r.left,y:r.bottom+4})}}
                                style={{
                                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                                  width:15,height:15,borderRadius:'50%',flexShrink:0,
                                  background:active?col:'rgba(42,63,85,0.5)',
                                  border:`1.5px solid ${active?col:'#2a3f55'}`,
                                  color:active?'#080c14':'#3d5a7a',
                                  boxShadow:active?`0 0 6px ${col}55`:undefined,
                                  cursor:'pointer',overflow:'hidden',
                                  opacity:!checked?0.4:1,
                                  animation:shouldBlink?`alarmPulse 1s ease-in-out infinite`:undefined,
                                }}>
                                {active&&<span style={{fontFamily:MONO,fontSize:9,fontWeight:800,lineHeight:1,
                                  letterSpacing:'-0.5px',transform:'scale(0.7)',display:'inline-block',
                                  whiteSpace:'nowrap'}}>
                                  {label}
                                </span>}
                              </span>
                            )
                          })
                        })()}
                      </div>
                    )
                    })}
                    </>)
                  })()}
                </div>

                {/* ── Color picker para círculos de condición ── */}
                {condColorPicker&&(()=>{
                  const PICKER=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d','#ff9a3c','#a78bfa','#7ec8e3','#f472b6']
                  const cur=condColors[condColorPicker.condId]
                  return(<>
                    <div style={{position:'fixed',inset:0,zIndex:9997}} onClick={()=>setCondColorPicker(null)}/>
                    <div style={{position:'fixed',top:condColorPicker.y,left:condColorPicker.x,zIndex:9998,
                      background:'#0d1824',border:'1px solid #1e3a52',borderRadius:6,padding:'6px 8px',
                      display:'flex',alignItems:'center',gap:5,boxShadow:'0 4px 20px rgba(0,0,0,0.8)'}}>
                      {PICKER.map(c=>(
                        <span key={c} onClick={e=>{e.stopPropagation();setCondColor(condColorPicker.condId,c)}}
                          style={{width:14,height:14,borderRadius:'50%',background:c,cursor:'pointer',flexShrink:0,
                            boxShadow:cur===c?`0 0 0 2px #fff,0 0 0 3px ${c}`:'none',
                            transition:'box-shadow 0.1s'}}/>
                      ))}
                      {cur&&<span onClick={e=>{e.stopPropagation();setCondColor(condColorPicker.condId,null)}}
                        title="Restablecer color por defecto"
                        style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',cursor:'pointer',padding:'0 2px',
                          lineHeight:1,flexShrink:0}}
                        onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                        onMouseOut={e=>e.currentTarget.style.color='#5a8aaa'}>✕</span>}
                    </div>
                  </>)
                })()}

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
                        <label style={{gridColumn:'1/-1',display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Listas
                          <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,padding:'6px 8px',display:'flex',flexWrap:'wrap',gap:5,minHeight:34,alignItems:'center'}}>
                            {wlLists.map(l=>{
                              const checked=(editForm.list_ids||[]).includes(l.id)
                              const borderCol=checked?'rgba(0,212,255,0.35)':'var(--border)'
                              return(
                                <div key={l.id} style={{display:'flex',alignItems:'stretch'}}>
                                  <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontFamily:MONO,fontSize:11,
                                    color:checked?'var(--accent)':'var(--text)',padding:'2px 7px 2px 5px',whiteSpace:'nowrap',
                                    background:checked?'rgba(0,212,255,0.12)':'transparent',
                                    border:`1px solid ${borderCol}`,borderRight:'none',borderRadius:'3px 0 0 3px'}}>
                                    <input type="checkbox" checked={checked} onChange={ev=>{
                                      setEditForm(p=>({...p,list_ids:ev.target.checked
                                        ?[...(p.list_ids||[]),l.id]
                                        :(p.list_ids||[]).filter(id=>id!==l.id)}))
                                    }} style={{width:11,height:11,accentColor:'var(--accent)'}}/>
                                    {l.name}
                                  </label>
                                  <button type="button" title={`Eliminar lista "${l.name}"`}
                                    onClick={async e=>{
                                      e.preventDefault()
                                      if(!window.confirm(`¿Eliminar lista "${l.name}"?\nLos activos no se eliminarán.`)) return
                                      try{
                                        await deleteWatchlistList(l.id)
                                        setWlLists(prev=>prev.filter(x=>x.id!==l.id))
                                        setEditForm(p=>({...p,list_ids:(p.list_ids||[]).filter(id=>id!==l.id)}))
                                      }catch(err){alert('Error: '+err.message)}
                                    }}
                                    style={{fontFamily:MONO,fontSize:9,color:'#4a3535',background:checked?'rgba(0,212,255,0.06)':'transparent',
                                      border:`1px solid ${borderCol}`,borderRadius:'0 3px 3px 0',
                                      padding:'0 5px',cursor:'pointer',lineHeight:1,display:'flex',alignItems:'center'}}
                                    onMouseOver={e=>{e.currentTarget.style.color='#ff4d6d';e.currentTarget.style.background='rgba(255,77,109,0.1)'}}
                                    onMouseOut={e=>{e.currentTarget.style.color='#4a3535';e.currentTarget.style.background=checked?'rgba(0,212,255,0.06)':'transparent'}}>✕</button>
                                </div>
                              )
                            })}
                            <button type="button" onClick={async()=>{
                              const n=window.prompt('Nombre de la nueva lista:','')
                              if(!n||!n.trim()) return
                              try{
                                const nl=await createWatchlistList(n.trim())
                                setWlLists(prev=>[...prev,nl].sort((a,b)=>a.name.localeCompare(b.name)))
                                setEditForm(p=>({...p,list_ids:[...(p.list_ids||[]),nl.id]}))
                              }catch(e){alert('Error: '+e.message)}
                            }} style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',background:'transparent',
                              border:'1px dashed #2a4a6a',borderRadius:3,padding:'2px 7px',cursor:'pointer',whiteSpace:'nowrap'}}>
                              + Nueva lista
                            </button>
                          </div>
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
                  <button onClick={newAlarm} title="Nueva alarma" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'3px 8px',borderRadius:3,cursor:'pointer'}}>+</button>
                </div>
                {/* Banner alertas desactualizadas */}
                {(alertsLastUpdated===null||Date.now()-alertsLastUpdated>1200000)&&(
                  <div style={{padding:'7px 10px',background:'#1a2a3a',borderLeft:'3px solid #f59e0b',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    {alarmStatusLoading&&alarmCheckProgress
                      ? <span style={{fontFamily:MONO,fontSize:11,color:'#94a3b8',flex:1}}>⟳ Comprobando {alarmCheckProgress.done}/{alarmCheckProgress.total}…</span>
                      : <>
                          <span style={{fontFamily:MONO,fontSize:11,color:'#94a3b8',flex:1}}>⚠ Alertas técnicas desactualizadas · última comprobación: {fmtLastUpdated(alertsLastUpdated)}</span>
                          <button onClick={()=>refreshAlarmStatus(filteredWlItems,alarms,true)} disabled={alarmStatusLoading}
                            title="Comprobar condiciones técnicas (círculos de colores) para todos los activos visibles. El Ranking y las estrategias óptimas se actualizan por separado con sus propios botones."
                            style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.4)',color:'#f59e0b',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                            ↻ Comprobar alertas ahora
                          </button>
                        </>
                    }
                  </div>
                )}
                <div style={{overflowY:'auto',flex:1}}>
                  {alarmLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!alarmLoading&&(()=>{
                    const COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                    const blinkN=3
                    const COND_LABELS={
                      ema_cross_up:'↑ Cruce alcista EMA',ema_cross_down:'↓ Cruce bajista EMA',
                      price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
                      price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',
                      rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
                      rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
                      macd_cross_up:'MACD cruza señal ↑',macd_cross_down:'MACD cruza señal ↓',
                    }
                    const SectionHeader=({color,label,count})=>(
                      <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:9,color,letterSpacing:'0.08em',textTransform:'uppercase',
                        background:'rgba(0,0,0,0.25)',borderBottom:'1px solid var(--border)',borderTop:'1px solid var(--border)',
                        display:'flex',alignItems:'center',gap:6}}>
                        <span>{label}</span>
                        <span style={{color:'#3d5a7a'}}>({count})</span>
                      </div>
                    )

                    const priceAlerts=alarms.filter(a=>a.condition==='price_level')
                    const condAlarms=alarms.filter(a=>a.condition!=='price_level')

                    if(alarms.length===0) return(
                      <div style={{padding:'24px 12px',textAlign:'center'}}>
                        <div style={{fontSize:28,marginBottom:8}}>🔕</div>
                        <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',lineHeight:1.7}}>
                          Sin alertas configuradas.<br/>
                          Pulsa <b style={{color:'#00d4ff'}}>+</b> para crear una nueva.
                        </div>
                      </div>
                    )

                    return(
                      <div>
                        {/* ── Alertas de precio ── */}
                        {priceAlerts.length>0&&(
                          <div>
                            <SectionHeader color="#ffd166" label="🎯 Alertas de precio" count={priceAlerts.length}/>
                            {priceAlerts.map(a=>{
                              const isAbove=a.condition_detail==='price_above'
                              const col=isAbove?'#00e5a0':'#ff4d6d'
                              const ackKey=`${a.symbol}::${a.id}`
                              const isAcked=ackedAlarms.has(ackKey)
                              // Usar alarmStatus (evaluado por API para todos los símbolos del watchlist)
                              const triggered=alarmStatus[a.symbol||'']?.[a.id]?.active===true
                              const shouldBlink=triggered&&!isAcked
                              const openChart=()=>{if(a.symbol)setSimbolo(a.symbol)}
                              return(
                                <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.7)',display:'flex',alignItems:'center',gap:8,
                                  background:shouldBlink?`${col}10`:'transparent',
                                  animation:shouldBlink?'rowPulse 1.2s ease-in-out infinite':undefined}}>
                                  <span style={{fontSize:14,color:col,flexShrink:0,lineHeight:1,
                                    animation:shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined}}>{isAbove?'▲':'▼'}</span>
                                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={openChart} title="Ver gráfico">
                                    <div style={{fontFamily:MONO,fontSize:12,color:'#f0f7ff',fontWeight:700,
                                      animation:shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined}}>
                                      {a.symbol}{' '}<span style={{color:'#8aadcc',fontWeight:500}}>@</span>{' '}
                                      <span style={{color:col,fontWeight:700}}>{Number(a.price_level)?.toFixed(2)??'—'}</span>
                                    </div>
                                  </div>
                                  {triggered&&(
                                    <button onClick={()=>isAcked?unackAlarm(a.symbol,a.id):ackAlarm(a.symbol,a.id)}
                                      title={isAcked?'Marcar como no vista':'Reconocer alerta'}
                                      style={{background:isAcked?'transparent':`${col}20`,border:`1px solid ${col}`,color:col,fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>
                                      {isAcked?'↩':'ACK'}
                                    </button>
                                  )}
                                  <button onClick={()=>openEditAlarm(a)} title="Editar"
                                    style={{background:'transparent',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>✎</button>
                                  <button onClick={async()=>{await deleteAlarm(a.id);reloadAlarms()}} title="Eliminar"
                                    style={{background:'transparent',border:'none',color:'#4a2a2a',fontSize:14,cursor:'pointer',padding:'0 4px',flexShrink:0}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'} onMouseOut={e=>e.currentTarget.style.color='#4a2a2a'}>✕</button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ── Alertas técnicas — una fila por alerta, estado inline ── */}
                        {condAlarms.length>0&&(
                          <div>
                            <SectionHeader color="#00d4ff" label="⚡ Alertas técnicas" count={condAlarms.length}/>
                            {condAlarms.map((a,ai)=>{
                              const col=COLORS[ai%COLORS.length]
                              const sym=a.symbol||''
                              const st=alarmStatus[sym]?.[a.id]
                              const active=st?.active===true
                              const bars=st?.bars
                              const ackKey=`${sym}::${a.id}`
                              const isAcked=ackedAlarms.has(ackKey)
                              const shouldBlink=active&&!isAcked&&bars!=null&&bars<=blinkN
                              const dotCol=active?col:'#2a3f55'
                              const openChart=()=>{if(sym)setSimbolo(sym)}
                              const rowBlink=active&&!isAcked
                              return(
                                <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.6)',
                                  display:'flex',alignItems:'center',gap:8,
                                  animation:rowBlink?'rowPulse 1.2s ease-in-out infinite':undefined,
                                  background:rowBlink?`${col}10`:'transparent'}}>
                                  <span style={{width:9,height:9,borderRadius:'50%',flexShrink:0,
                                    background:dotCol,
                                    boxShadow:active?`0 0 6px ${col}`:undefined,
                                    animation:rowBlink?'alarmPulse 1s ease-in-out infinite':undefined}}/>
                                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={openChart} title="Ver gráfico">
                                    <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                                      <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:active?col:'#e2e8f0',
                                        animation:rowBlink?'alarmPulse 1s ease-in-out infinite':undefined}}>{sym}</span>
                                      <span style={{fontFamily:MONO,fontSize:10,color:'#c0d8f0',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span>
                                    </div>
                                    <div style={{fontFamily:MONO,fontSize:10,color:'#8ab8d8',fontWeight:500,marginTop:1}}>
                                      {COND_LABELS[a.condition]||a.condition}
                                      {active&&bars!=null&&<span style={{color:isAcked?'#8ab8d8':col,fontWeight:600}}> · {bars}v</span>}
                                      {!active&&<span style={{color:'#6a8aa8'}}> · inactiva</span>}
                                      {active&&isAcked&&<span style={{color:'#6a8aa8'}}> · vista</span>}
                                    </div>
                                  </div>
                                  {active&&!isAcked&&(
                                    <button onClick={()=>ackAlarm(sym,a.id)} title="Marcar como vista"
                                      style={{background:'rgba(0,229,160,0.08)',border:'1px solid #00e5a045',color:'#00e5a0',fontFamily:MONO,fontSize:9,padding:'3px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>
                                      ACK
                                    </button>
                                  )}
                                  {(active&&isAcked)&&(
                                    <button onClick={()=>unackAlarm(sym,a.id)} title="Desmarcar"
                                      style={{background:'transparent',border:'1px solid #2a3f55',color:'#3d5a7a',fontFamily:MONO,fontSize:9,padding:'3px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>
                                      ✓
                                    </button>
                                  )}
                                  <button onClick={()=>openEditAlarm(a)} title="Editar"
                                    style={{background:'transparent',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>✎</button>
                                  <button onClick={async()=>{await removeAlarm(a.id)}} title="Eliminar"
                                    style={{background:'transparent',border:'none',color:'#3a1a20',fontSize:13,cursor:'pointer',padding:'0 2px',flexShrink:0}}
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
                  {mcProgress?(
                    <div style={{display:'flex',flexDirection:'column',gap:5}}>
                      <div style={{fontFamily:MONO,fontSize:11,color:'#00d4ff'}}>
                        ⟳ Estrategia {mcProgress.current}/{mcProgress.total}: <span style={{color:'#d0e8fa'}}>{mcProgress.name}</span>
                      </div>
                      <div style={{width:'100%',height:3,background:'rgba(0,212,255,0.1)',borderRadius:2}}>
                        <div style={{width:`${(mcProgress.current/mcProgress.total)*100}%`,height:'100%',background:'var(--accent)',borderRadius:2,transition:'width 0.3s'}}/>
                      </div>
                    </div>
                  ):mcSelected.length>=2?(
                    <button onClick={runBacktesting} disabled={mcLoading}
                      style={{width:'100%',fontFamily:MONO,fontSize:11,padding:'7px 10px',borderRadius:4,cursor:mcLoading?'wait':'pointer',
                        background:mcLoading?'rgba(0,212,255,0.05)':'rgba(0,212,255,0.15)',
                        border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700,letterSpacing:'0.05em'}}>
                      {mcLoading?'⟳ Calculando...':mcStratSelected.length>1?`▶ EJECUTAR (${mcStratSelected.length} ESTRATEGIAS)`:selectedModos.length>1?`▶ EJECUTAR (${selectedModos.length} MODOS)`:'▶ EJECUTAR BACKTESTING'}
                    </button>
                  ):(
                    <button disabled style={{width:'100%',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4,cursor:'not-allowed',
                      background:'transparent',border:'1px solid #2a3f55',color:'#7aabc8',letterSpacing:'0.05em'}}>
                      ▶ EJECUTAR — selecciona 2+ activos
                    </button>
                  )}
                  {mcError&&<div style={{fontFamily:MONO,fontSize:12,color:'#ff4d6d',marginTop:5}}>⚠ {mcError}</div>}
                </div>

                {/* CAPITAL Y PERÍODO */}
                <div style={{flexShrink:0,borderBottom:'1px solid var(--border)',padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#7aabc8',whiteSpace:'nowrap'}}>Capital inicial</span>
                    <input type="number" min={100} max={1000000} step={100} value={mcCapitalIni}
                      onChange={e=>setMcCapitalIni(Number(e.target.value))}
                      style={{flex:1,fontFamily:MONO,fontSize:11,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:3,padding:'3px 6px',color:'var(--fg)',textAlign:'right'}}/>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a88'}}>€</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#7aabc8',whiteSpace:'nowrap'}}>Período</span>
                    <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                      {[{id:'years',label:'Años'},{id:'range',label:'Fechas'}].map(opt=>(
                        <button key={opt.id} onClick={()=>setMcPeriodMode(opt.id)}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 8px',borderRadius:3,cursor:'pointer',
                            border:`1px solid ${mcPeriodMode===opt.id?'var(--accent)':'var(--border)'}`,
                            background:mcPeriodMode===opt.id?'rgba(0,212,255,0.12)':'transparent',
                            color:mcPeriodMode===opt.id?'var(--accent)':'#7aabc8'}}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {mcPeriodMode==='years'?(
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a88',whiteSpace:'nowrap'}}>Años</span>
                      <input type="number" min={1} max={20} step={1} value={mcYears}
                        onChange={e=>setMcYears(Number(e.target.value))}
                        style={{flex:1,fontFamily:MONO,fontSize:11,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:3,padding:'3px 6px',color:'var(--fg)',textAlign:'right'}}/>
                    </div>
                  ):(()=>{
                      const disp2int=s=>{if(s&&/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const[d,m,y]=s.split('/');const iso=`${y}-${m}-${d}`;if(!isNaN(new Date(iso)))return iso}return null}
                      const inputStyle={width:'100%',fontFamily:MONO,fontSize:11,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:3,padding:'3px 6px',color:'var(--fg)'}
                      return(
                        <div style={{display:'flex',flexDirection:'column',gap:5}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a88',whiteSpace:'nowrap',width:32}}>Desde</span>
                            <input type="text" placeholder="dd/mm/yyyy" value={fromDisplay}
                              onChange={e=>setFromDisplay(e.target.value)}
                              onBlur={e=>{const v=disp2int(e.target.value);if(v){setMcFromDate(v)}else{setFromDisplay(isoToDisplay(mcFromDate))}}}
                              style={inputStyle}/>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a88',whiteSpace:'nowrap',width:32}}>Hasta</span>
                            <input type="text" placeholder="dd/mm/yyyy" value={toDisplay}
                              onChange={e=>setToDisplay(e.target.value)}
                              onBlur={e=>{const v=disp2int(e.target.value);if(v){setMcToDate(v)}else{setToDisplay(isoToDisplay(mcToDate))}}}
                              style={inputStyle}/>
                          </div>
                        </div>
                      )
                    })()
                  }
                </div>

                {/* INTERVALO */}
                <div style={{flexShrink:0,borderBottom:'1px solid var(--border)',padding:'8px 12px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#7aabc8',whiteSpace:'nowrap'}}>Intervalo</span>
                    <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                      {[{id:'diario',label:'Diario',activeColor:'#4caf82',activeBorder:'#2d6e4e',activeBg:'rgba(76,175,130,0.12)'},{id:'semanal',label:'Semanal',activeColor:'#f0c040',activeBorder:'#a07820',activeBg:'rgba(240,192,64,0.12)'}].map(opt=>(
                        <button key={opt.id} onClick={()=>setMcIntervalo(opt.id)}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 8px',borderRadius:3,cursor:'pointer',
                            border:`1px solid ${mcIntervalo===opt.id?opt.activeBorder:'var(--border)'}`,
                            background:mcIntervalo===opt.id?opt.activeBg:'transparent',
                            color:mcIntervalo===opt.id?opt.activeColor:'#7aabc8'}}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* FILTROS DE MERCADO — colapsable (MC) */}
                {(()=>{
                  const anyOn=filtros.vix.activo||filtros.indiceEma.activo||filtros.sectorEma.activo||filtros.cruceEma.activo
                  const onCnt=[filtros.vix.activo,filtros.indiceEma.activo,filtros.sectorEma.activo,filtros.cruceEma.activo].filter(Boolean).length
                  const fInp={background:'#0a1520',border:'1px solid #1a3d5a',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'1px 4px',boxSizing:'border-box',outline:'none',width:'100%'}
                  const fToggle=(key)=>setFiltros(p=>({...p,[key]:{...p[key],activo:!p[key].activo}}))
                  const fSet=(key,field,val)=>setFiltros(p=>({...p,[key]:{...p[key],[field]:val}}))
                  const toggleBtn=(active)=>({display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:14,borderRadius:7,flexShrink:0,cursor:'pointer',transition:'background 0.15s',background:active?'#00e5a0':'#1a2d45',position:'relative'})
                  const toggleKnob=(active)=>({position:'absolute',width:10,height:10,borderRadius:'50%',background:active?'#fff':'#7a9bc0',left:active?16:2,transition:'left 0.15s'})
                  const lbl=(active)=>({fontFamily:MONO,fontSize:11,color:active?'var(--text)':'var(--text2)',flex:1})
                  const plbl={fontFamily:MONO,fontSize:9,color:'var(--text2)',whiteSpace:'nowrap'}
                  const ivBtn=(on,semanal=false)=>({fontFamily:MONO,fontSize:9,padding:'1px 5px',borderRadius:3,cursor:'pointer',
                    border:`1px solid ${on?(semanal?'#a07820':'#2d6e4e'):'#1a3d5a'}`,
                    background:on?(semanal?'rgba(240,192,64,0.12)':'rgba(76,175,130,0.12)'):'transparent',
                    color:on?(semanal?'#f0c040':'#4caf82'):'var(--text2)'})
                  return(
                  <div style={{flexShrink:0}}>
                    <div onClick={()=>setMcFiltrosOpen(v=>!v)}
                      style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                      onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
                      <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcFiltrosOpen?'▼':'▶'}</span>
                      <span style={{fontFamily:MONO,fontSize:12,color:anyOn?'#00e5a0':'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>FILTROS DE MERCADO</span>
                      {anyOn&&<span style={{fontFamily:MONO,fontSize:9,background:'rgba(0,229,160,0.18)',color:'#00e5a0',borderRadius:3,padding:'0 4px',lineHeight:'14px',flexShrink:0}}>{onCnt} activo{onCnt>1?'s':''}</span>}
                    </div>
                    {mcFiltrosOpen&&(
                      <div style={{padding:'2px 12px 8px',display:'flex',flexDirection:'column',gap:7,borderBottom:'1px solid var(--border)'}}>
                        {/* VIX */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.vix.activo?4:0}}>
                            <div style={toggleBtn(filtros.vix.activo)} onClick={()=>fToggle('vix')}><div style={toggleKnob(filtros.vix.activo)}/></div>
                            <span style={lbl(filtros.vix.activo)}>VIX &lt; umbral</span>
                          </div>
                          {filtros.vix.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Umbral</span>
                              <input type="number" min={5} max={80} step={1} value={filtros.vix.umbral} onChange={e=>fSet('vix','umbral',Number(e.target.value)||25)} style={{...fInp,width:54}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <span style={plbl}>Int</span>
                                <button style={ivBtn(filtros.vix.intervalo!=='semanal',false)} onClick={()=>fSet('vix','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.vix.intervalo==='semanal',true)} onClick={()=>fSet('vix','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Índice EMA */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.indiceEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.indiceEma.activo)} onClick={()=>fToggle('indiceEma')}><div style={toggleKnob(filtros.indiceEma.activo)}/></div>
                            <span style={lbl(filtros.indiceEma.activo)}>Índice &gt; EMA</span>
                          </div>
                          {filtros.indiceEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Ticker</span>
                              <input type="text" value={filtros.indiceEma.ticker} onChange={e=>fSet('indiceEma','ticker',e.target.value.toUpperCase())} style={{...fInp,width:60}}/>
                              <span style={plbl}>EMA</span>
                              <input type="number" min={2} max={500} step={1} value={filtros.indiceEma.periodo} onChange={e=>fSet('indiceEma','periodo',Number(e.target.value)||200)} style={{...fInp,width:50}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.indiceEma.intervalo!=='semanal',false)} onClick={()=>fSet('indiceEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.indiceEma.intervalo==='semanal',true)} onClick={()=>fSet('indiceEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Sector EMA */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.sectorEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.sectorEma.activo)} onClick={()=>fToggle('sectorEma')}><div style={toggleKnob(filtros.sectorEma.activo)}/></div>
                            <span style={lbl(filtros.sectorEma.activo)}>Sector ETF &gt; EMA</span>
                          </div>
                          {filtros.sectorEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>ETF</span>
                              <input type="text" value={filtros.sectorEma.ticker} onChange={e=>fSet('sectorEma','ticker',e.target.value.toUpperCase())} style={{...fInp,width:60}}/>
                              <span style={plbl}>EMA</span>
                              <input type="number" min={2} max={500} step={1} value={filtros.sectorEma.periodo} onChange={e=>fSet('sectorEma','periodo',Number(e.target.value)||50)} style={{...fInp,width:50}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.sectorEma.intervalo!=='semanal',false)} onClick={()=>fSet('sectorEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.sectorEma.intervalo==='semanal',true)} onClick={()=>fSet('sectorEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Cruce EMA */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:filtros.cruceEma.activo?4:0}}>
                            <div style={toggleBtn(filtros.cruceEma.activo)} onClick={()=>fToggle('cruceEma')}><div style={toggleKnob(filtros.cruceEma.activo)}/></div>
                            <span style={lbl(filtros.cruceEma.activo)}>Cruce EMA (R&gt;L)</span>
                          </div>
                          {filtros.cruceEma.activo&&(
                            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                              <span style={plbl}>Ticker</span>
                              <input type="text" value={filtros.cruceEma.ticker} onChange={e=>fSet('cruceEma','ticker',e.target.value.toUpperCase())} style={{...fInp,width:60}}/>
                              <span style={plbl}>R</span>
                              <input type="number" min={2} max={500} step={1} value={filtros.cruceEma.periodoR} onChange={e=>fSet('cruceEma','periodoR',Number(e.target.value)||10)} style={{...fInp,width:42}}/>
                              <span style={plbl}>L</span>
                              <input type="number" min={2} max={500} step={1} value={filtros.cruceEma.periodoL} onChange={e=>fSet('cruceEma','periodoL',Number(e.target.value)||11)} style={{...fInp,width:42}}/>
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button style={ivBtn(filtros.cruceEma.intervalo!=='semanal',false)} onClick={()=>fSet('cruceEma','intervalo','diario')}>D</button>
                                <button style={ivBtn(filtros.cruceEma.intervalo==='semanal',true)} onClick={()=>fSet('cruceEma','intervalo','semanal')}>S</button>
                              </span>
                            </div>
                          )}
                        </div>
                        {anyOn&&<div style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',lineHeight:1.4,marginTop:1}}>AND — todos activos en verde para permitir entrada.</div>}
                      </div>
                    )}
                  </div>
                  )
                })()}

                {/* MODO DE ASIGNACIÓN — colapsable */}
                <div style={{flexShrink:0}}>
                  <div onClick={()=>setMcSectionOpen(s=>({...s,mode:!s.mode}))}
                    style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                    onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
                    <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcSectionOpen.mode?'▼':'▶'}</span>
                    <span style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>MODO DE ASIGNACIÓN</span>
                    <span style={{marginLeft:'auto',fontFamily:MONO,fontSize:10,color:'#4a6a88'}}>
                      {mcStratSelected.length<=1
                        ?(selectedModos.length===1
                          ?(selectedModos[0]==='slots'?'Slots iguales':selectedModos[0]==='compartido'?'Capital compartido':selectedModos[0]==='concentrado'?'Capital concentrado':'Position Sizing')
                          :selectedModos.map(m=>m==='slots'?'Slots':m==='compartido'?'Compartido':m==='concentrado'?'Concentrado':'Pos.Sizing').join(' + '))
                        :(mcMode==='slots'?'Slots iguales':mcMode==='compartido'?'Capital compartido':mcMode==='concentrado'?'Capital concentrado':mcMode==='positionsizing'?'Position Sizing':'Slots iguales')}
                    </span>
                  </div>
                  {mcSectionOpen.mode&&(
                    <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
                      {mcStratSelected.length<=1&&(
                        <div style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',marginBottom:6,letterSpacing:'0.05em'}}>
                          SELECCIÓN MÚLTIPLE — compara modos en el mismo gráfico
                        </div>
                      )}
                      {[
                        {id:'slots',label:'Slots iguales',ready:true,
                          desc:'El capital se divide en partes iguales y cada slot crece de forma independiente con interés compuesto. Ejemplo: 1000€ con 4 activos → 250€ por slot. Si NVDA gana +42%, su slot pasa a 355€ y el siguiente trade de NVDA parte de esos 355€. Los slots nunca se redistribuyen entre activos.'},
                        {id:'compartido',label:'Capital compartido',ready:true,
                          desc:'Pool de capital único compartido entre todos los activos, sin límite de posiciones simultáneas. Justo antes de cada entrada: capital_por_slot = pool_libre / slots_libres. Cuando un trade cierra, su capital (con ganancias o pérdidas) vuelve al pool. Aunque no hay tope de slots, el pool puede agotarse si muchas señales coinciden en el tiempo: las que no encuentran capital disponible se descartan. Las señales se procesan por fecha de entrada (más antigua primero) y, en empate de fecha, por orden alfabético del símbolo.'},
                        {id:'concentrado',label:'Capital concentrado',ready:true,
                          desc:'Pool de capital único con un máximo de N posiciones simultáneas (configurable). Capital por operación = equity_total / N_slots, donde equity_total = capital libre + capital comprometido en posiciones abiertas. Así, aunque el capital esté casi todo invertido, cada nueva operación recibe siempre su fracción justa del portafolio. Al cerrar, capital ± P&L vuelve al pool. Cuando hay más señales de entrada el mismo día que slots libres disponibles, el criterio de prioridad (configurable) decide cuáles entran: alfabético, ranking del watchlist, momentum, fuerza relativa vs SP500, o proximidad al máximo de 52 semanas. Las señales que no caben ese día se descartan: no hay cola — el activo solo entrará cuando genere una nueva señal en el futuro.'},
                        {id:'positionsizing',label:'Position Sizing',ready:true,
                          desc:'Pool de capital compartido con sizing por riesgo: el tamaño de cada posición se calcula dinámicamente según el stop loss (riesgo/trade × distancia al stop). Permite posiciones simultáneas con tamaños variables. Cuando una señal nueva supera el riesgo acumulado máximo o agota el pool disponible, se descarta. Las señales se procesan por fecha de entrada (más antigua primero) y, en empate de fecha, por orden alfabético del símbolo.'},
                      ].map(m=>{
                        const isCheckbox=mcStratSelected.length<=1
                        const isActive=isCheckbox?selectedModos.includes(m.id):mcMode===m.id
                        const handleClick=()=>{
                          if(!m.ready) return
                          if(isCheckbox){
                            setSelectedModos(prev=>
                              prev.includes(m.id)
                                ?(prev.length>1?prev.filter(x=>x!==m.id):prev) // don't deselect last
                                :[...prev,m.id]
                            )
                          } else {
                            setMcMode(m.id)
                          }
                        }
                        return(
                          <div key={m.id} style={{marginBottom:3}}>
                            <div onClick={handleClick}
                              style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,
                                background:isActive?'rgba(0,212,255,0.08)':'transparent',
                                border:`1px solid ${isActive?'var(--accent)':'var(--border)'}`,
                                cursor:m.ready?'pointer':'not-allowed',opacity:m.ready?1:0.45}}>
                              {isCheckbox
                                ?<div style={{width:14,height:14,borderRadius:3,border:`2px solid ${isActive?'var(--accent)':'#3d5a7a'}`,
                                    background:isActive?'var(--accent)':'transparent',flexShrink:0,
                                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    {isActive&&<span style={{color:'#000b18',fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>}
                                  </div>
                                :<div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${isActive?'var(--accent)':'#3d5a7a'}`,
                                    background:isActive?'var(--accent)':'transparent',flexShrink:0}}/>
                              }
                              <span style={{fontFamily:MONO,fontSize:12,color:isActive?'var(--accent)':'#c8dff5',fontWeight:600,flex:1}}>{m.label}</span>
                              <span title={m.desc}
                                style={{width:16,height:16,borderRadius:'50%',border:'1px solid #3d5a7a',color:'#3d5a7a',fontSize:10,
                                  display:'flex',alignItems:'center',justifyContent:'center',cursor:'help',flexShrink:0,fontWeight:700,lineHeight:1}}>?</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(mcStratSelected.length<=1?selectedModos.includes('concentrado'):mcMode==='concentrado')&&(
                    <div style={{padding:'8px 10px',borderTop:'1px solid #1a2a3a'}}>
                      {/* Máx. activos simultáneos */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <span title="Número máximo de activos abiertos simultáneamente. Cuantos menos configures, mayor será el capital asignado por operación."
                          style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>
                          Máx. activos simultáneos
                        </span>
                        <input type="number" min="1" max="20" step="1"
                          value={mcMaxPosiciones}
                          onChange={e=>setMcMaxPosiciones(Math.max(1,Math.min(20,Number(e.target.value))))}
                          style={{width:65,padding:'2px 4px',borderRadius:3,
                            background:'#0d1929',border:'1px solid #1a2a3a',
                            color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}
                        />
                      </div>
                      {/* Prioridad de entrada */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mcPrioridad==='momentum'?4:0}}>
                        <span title="Criterio para decidir qué activo entra primero cuando hay más señales simultáneas que slots disponibles. 'Score completo' combina rendimiento histórico + condiciones actuales del mercado (configurable en Ajustes → Ranking)"
                          style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>
                          Prioridad de entrada
                        </span>
                        <select value={mcPrioridad} onChange={e=>setMcPrioridad(e.target.value)}
                          style={{padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',
                            color:'#e0e8f0',fontSize:10,fontFamily:MONO,cursor:'pointer',maxWidth:130}}>
                          <option value="score_metricas" title="Usa el Score métricas actual para priorizar entradas históricas. ⚠️ Sesgo futuro: el ranking actual no refleja el que existía en cada fecha del pasado.">Ranking por métricas (sesgo futuro) ⚠️</option>
                          <option value="alfabetico"    title="Orden A→Z por ticker. Sin criterio financiero">Alfabético</option>
                          <option value="momentum"      title="Prioriza el activo con mayor retorno en los últimos N días">Momentum (N días)</option>
                          <option value="fuerza_relativa" title="Prioriza el activo que más ha superado al SP500 en los últimos 63 días">Fuerza relativa vs SP500</option>
                          <option value="max52"         title="Prioriza el activo más cercano a su máximo de 52 semanas (favorece breakouts)">Proximidad máximo 52s</option>
                        </select>
                      </div>
                      {mcPrioridad==='score_metricas'&&(
                        <div style={{fontSize:9,color:'#f59e0b',lineHeight:1.4,paddingLeft:2,marginBottom:4,marginTop:2}}>
                          ⚠️ Usa el score de métricas actual para priorizar entradas históricas. Los resultados pueden ser optimistas porque el ranking actual no refleja el que existía en cada fecha del pasado.
                        </div>
                      )}
                      {mcPrioridad==='momentum'&&(
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <span title="Número de días de lookback para calcular el retorno de momentum en el momento de la señal."
                            style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted',paddingLeft:10}}>
                            N días lookback
                          </span>
                          <input type="number" min="5" max="120" step="1"
                            value={mcMomentumN}
                            onChange={e=>setMcMomentumN(Math.max(5,Math.min(120,Number(e.target.value))))}
                            style={{width:65,padding:'2px 4px',borderRadius:3,
                              background:'#0d1929',border:'1px solid #1a2a3a',
                              color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {(mcStratSelected.length<=1?selectedModos.includes('positionsizing'):mcMode==='positionsizing')&&(
                    <div style={{padding:'8px 10px',borderTop:'1px solid #1a2a3a'}}>
                      <div style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',letterSpacing:'0.07em',marginBottom:7,textTransform:'uppercase',fontWeight:600}}>Risk management</div>
                      {[
                        {label:'Riesgo por trade',value:mcRiskPerTrade,set:setMcRiskPerTrade,
                          tooltip:'Porcentaje del capital total que arriesgas en cada operación. Fórmula: capital × riesgo% / distancia_al_stop. Si no hay stop definido, se usa el % máximo de cartera por trade como fallback.'},
                        {label:'Máx. cartera/trade',value:mcMaxPortfolioPct,set:setMcMaxPortfolioPct,
                          tooltip:'Límite máximo del capital total que puedes invertir en una sola operación, independientemente del stop. Actúa como techo de seguridad cuando el stop está muy ajustado o no está definido.'},
                        {label:'Máx. riesgo acumulado',value:mcMaxAccumRisk,set:setMcMaxAccumRisk,
                          tooltip:'Porcentaje máximo del capital total que puede estar en riesgo simultáneamente entre todas las posiciones abiertas. Cuando se alcanza este límite, no se permiten nuevas entradas hasta que alguna posición cierre y libere riesgo.'},
                      ].map(p=>(
                        <div key={p.label} style={{display:'flex',alignItems:'center',
                          justifyContent:'space-between',marginBottom:6}}>
                          <span title={p.tooltip} style={{fontSize:9,color:'#4a6a88',
                            cursor:'help',textDecoration:'underline dotted'}}>
                            {p.label}
                          </span>
                          <div style={{display:'flex',alignItems:'center',gap:3}}>
                            <input type="number" min="0.1" max="100" step="0.1"
                              value={p.value}
                              onChange={e=>p.set(Number(e.target.value))}
                              style={{width:65,padding:'2px 4px',borderRadius:3,
                                background:'#0d1929',border:'1px solid #1a2a3a',
                                color:'#e0e8f0',fontSize:11,fontFamily:MONO,
                                textAlign:'right'}}
                            />
                            <span style={{color:'#4a6a88',fontSize:11}}>%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ESTRATEGIAS — colapsable */}
                <div style={{flexShrink:0}}>
                  <div onClick={()=>setMcSectionOpen(s=>({...s,strats:!s.strats}))}
                    style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                    onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
                    <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcSectionOpen.strats?'▼':'▶'}</span>
                    <span style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>ESTRATEGIAS</span>
                    {mcStratSelected.length>1&&<span style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,color:'#ffd166',background:'rgba(255,209,102,0.12)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:3,padding:'1px 5px'}}>{mcStratSelected.length}</span>}
                  </div>
                  {mcSectionOpen.strats&&(
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
                      {strLoading?(
                        <div style={{fontFamily:MONO,fontSize:11,color:'var(--text3)',padding:'4px 0'}}>Cargando...</div>
                      ):strategies.length===0?(
                        <div style={{fontFamily:MONO,fontSize:11,color:'var(--text3)',padding:'4px 0'}}>No hay estrategias guardadas</div>
                      ):(
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          {strategies.map((s,i)=>{
                            const isActive=s.id===currentStratId
                            const selIdx=mcStratSelected.indexOf(s.id)
                            const isSel=selIdx!==-1
                            const color=isSel?STRAT_COMPARE_COLORS[selIdx%STRAT_COMPARE_COLORS.length]:'#3d5a7a'
                            return(
                              <div key={s.id}
                                onClick={()=>{
                                  setMcStratSelected(prev=>prev.includes(s.id)?prev.filter(id=>id!==s.id):[...prev,s.id])
                                }}
                                style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:4,
                                  background:isSel?'rgba(0,212,255,0.06)':'transparent',
                                  border:`1px solid ${isSel?'rgba(0,212,255,0.2)':'transparent'}`,
                                  cursor:'pointer'}}
                                onMouseOver={e=>{if(!isActive)e.currentTarget.style.background=isSel?'rgba(0,212,255,0.09)':'rgba(255,255,255,0.03)'}}
                                onMouseOut={e=>e.currentTarget.style.background=isSel?'rgba(0,212,255,0.06)':'transparent'}>
                                <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${isSel?'var(--accent)':'#3d5a7a'}`,
                                  background:isSel?'var(--accent)':'transparent',flexShrink:0,
                                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                                  {isSel&&<span style={{color:'#000',fontSize:11,lineHeight:1,fontWeight:900}}>✓</span>}
                                </div>
                                {isSel&&<div style={{width:9,height:9,borderRadius:'50%',background:STRAT_COMPARE_COLORS[selIdx%STRAT_COMPARE_COLORS.length],flexShrink:0}}/>}
                                <span style={{fontFamily:MONO,fontSize:11,color:isSel?'#d0e8fa':'#7a9bc0',flex:1,minWidth:0,
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name||`Estrategia ${i+1}`}</span>
                                {isActive&&<span style={{fontFamily:MONO,fontSize:8,color:'#00d4ff',background:'rgba(0,212,255,0.12)',
                                  border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'1px 4px',flexShrink:0}}>activa</span>}
                              </div>
                            )
                          })}
                          {mcStratSelected.length>1&&(
                            <div style={{marginTop:4,paddingTop:4,borderTop:'1px solid var(--border)',fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>
                              {mcStratSelected.length} estrategias · comparación al ejecutar
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                      return(
                        <select value={mcListFilter||''} onChange={e=>setMcListFilter(e.target.value)}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 5px',borderRadius:4,maxWidth:80}}>
                          <option value="">Todas</option>
                          {wlLists.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
                        </select>
                      )
                    })()}
                  </div>
                  <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily:MONO,fontSize:10,color:'#cde5ff',fontWeight:700}}>{mcSelected.length} seleccionados</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>{
                        const filtered=[...new Map(watchlist.map(w=>[w.symbol,w])).values()].filter(w=>{
                          const matchSearch=!mcSearch||(w.symbol||'').toLowerCase().includes(mcSearch.toLowerCase())||(w.name||'').toLowerCase().includes(mcSearch.toLowerCase())
                          const matchFav=!mcOnlyFavs||w.favorite
                          const matchList=!mcListFilter||(w.list_ids||[]).some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&l.name===mcListFilter})
                          return matchSearch&&matchFav&&matchList
                        })
                        setMcSelected(filtered.map(w=>w.symbol))
                      }}
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
                  {[...new Map(watchlist.map(w=>[w.symbol,w])).values()].filter(w=>{
                    const matchSearch=!mcSearch||(w.symbol||'').toLowerCase().includes(mcSearch.toLowerCase())||(w.name||'').toLowerCase().includes(mcSearch.toLowerCase())
                    const matchFav=!mcOnlyFavs||w.favorite
                    const matchList=!mcListFilter||(w.list_ids||[]).some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&l.name===mcListFilter})
                    return matchSearch&&matchFav&&matchList
                  }).sort((a,b)=>{
                    const ra=rankingData[(a.symbol||'').toUpperCase()]?.rank, rb=rankingData[(b.symbol||'').toUpperCase()]?.rank
                    if(ra!=null&&rb!=null) return ra-rb
                    if(ra!=null) return -1
                    if(rb!=null) return 1
                    return a.name.localeCompare(b.name)
                  }).map(w=>{
                    const sel=mcSelected.includes(w.symbol)
                    const rd=rankingData[(w.symbol||'').toUpperCase()]
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
                {/* ── PANEL NORMAL (subtabs + filtros) — oculto cuando side edit abierto O Dashboard activo ── */}
                {!tlSideEdit&&tlTab!=='dashboard'&&(
                <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* Header + badge */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700}}>📒 TradeLog</span>
                </div>

                {/* Filtros */}
                {(()=>{
                  const allYears=[...new Set((tlFifo.trades||[]).map(t=>((t.status==='closed'?t.exit_date:null)||t.entry_date)?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a)
                  const strats=[...new Set(tlTrades.map(t=>t.strategy||'').filter(Boolean))].sort()
                  const monthsInYear=tlFilterYear?[...new Set((tlFifo.trades||[])
                    .filter(t=>{const d=(t.status==='closed'?t.exit_date:null)||t.entry_date;return d&&d.startsWith(tlFilterYear)})
                    .map(t=>{const d=(t.status==='closed'?t.exit_date:null)||t.entry_date;return d?d.slice(5,7):null}).filter(Boolean)
                  )].sort():[]
                  const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                  const selStyle={fontFamily:MONO,fontSize:10,width:'100%',padding:'3px 4px',borderRadius:3,
                    border:'1px solid #1a2d45',background:'#0a1628',color:'#c0d8f0',cursor:'pointer',outline:'none'}
                  const labelStyle={fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:3}
                  const rowStyle={padding:'6px 8px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:2}
                  return(
                    <div style={{overflowY:'auto',flex:1}}>
                      <div style={rowStyle}>
                        <div style={labelStyle}>Estado</div>
                        <select value={tlFilterStatus} onChange={e=>setTlFilterStatus(e.target.value)} style={selStyle}>
                          <option value=''>Todas</option>
                          <option value='open'>Abiertas</option>
                          <option value='closed'>Cerradas</option>
                        </select>
                      </div>
                      <div style={rowStyle}>
                        <div style={labelStyle}>Broker</div>
                        <select value={tlFilterBroker} onChange={e=>setTlFilterBroker(e.target.value)} style={selStyle}>
                          <option value=''>Todos</option>
                          {TL_BROKERS.map(b=><option key={b} value={b}>{TL_LABEL[b]}</option>)}
                        </select>
                      </div>
                      <div style={rowStyle}>
                        <div style={labelStyle}>Año</div>
                        <select value={tlFilterYear} onChange={e=>{setTlFilterYear(e.target.value);setTlFilterMonth('')}} style={selStyle}>
                          <option value=''>Todo</option>
                          {allYears.map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      {tlFilterYear&&monthsInYear.length>0&&(
                        <div style={rowStyle}>
                          <div style={labelStyle}>Mes</div>
                          <select value={tlFilterMonth} onChange={e=>setTlFilterMonth(e.target.value)} style={selStyle}>
                            <option value=''>Todos</option>
                            {monthsInYear.map(m=><option key={m} value={m}>{MESES[parseInt(m)-1]}</option>)}
                          </select>
                        </div>
                      )}
                      {strats.length>0&&(
                        <div style={rowStyle}>
                          <div style={labelStyle}>Estrategia</div>
                          <select value={tlFilterStrat} onChange={e=>setTlFilterStrat(e.target.value)} style={selStyle}>
                            <option value=''>Todas</option>
                            {strats.map(v=><option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {tlError&&<div style={{padding:'4px 8px',fontFamily:MONO,fontSize:10,color:'#ff4d6d'}}>⚠ {tlError}</div>}
              </div>
              )}
            </div>
            )}
            </div>{/* /zoom wrapper */}
          </aside>

          {/* ── CONTENT ── */}
          <div className="content" style={{...(result?.isBareChart?{overflowY:'hidden'}:undefined),position:'relative'}}>

            {/* ══ WATCHLIST MANAGER (overlay) ══ */}
            {showWlManager&&(
            <div style={{ position:'relative', height:'calc(100vh - 56px)', overflow:'hidden', zIndex:20 }}>
              <WatchlistManager
                watchlist={watchlist}
                bestStratBySymbol={bestStratBySymbol}
                strategies={strategies}
                wlLists={wlLists}
                onReload={reloadWatchlist}
                onClose={()=>setShowWlManager(false)}
                onEditItem={w=>{setShowWlManager(false);setWlManagerReturn(true);openEditItem(w)}}
                onDeleteItem={async(id)=>{await deleteWatchlistItem(id);reloadWatchlist()}}
                onCalcRanking={calcRanking}
                onCalcFull={calcRankingFull}
                calcPhase={calcPhase}
                onCalcScoreMetricas={calcScoreMetricas}
                onCalcScoreMetSen={calcScoreMetSen}
                onCalcMetricas={calcMetricas}
                rankingRunning={rankingRunning}
                rankingProgress={rankingProgress}
                rankingStratName={rankingStratName}
                notifPanel={
                  <WatchlistCondPanel
                    conditions={conditions}
                    onToggle={handleToggleCondition}
                    onReload={reloadConditions}
                    condColors={condColors}
                    onColorChange={setCondColor}
                    hideHeader={true}
                  />
                }
                candidatesText={candidatesText}
                setCandidatesText={setCandidatesText}
                candidatesLoading={candidatesLoading}
                candidatesProgress={candidatesProgress}
                candidatesResults={candidatesResults}
                onAnalyzeCandidates={analyzeCandidates}
                onClearCandidates={clearCandidates}
                onCandidateClick={sym=>setSimbolo(sym)}
                onCandidateAdd={(sym)=>{upsertWatchlistItem({symbol:sym,name:lookupName(sym)||sym,group_name:'Acciones',favorite:false,observations:''}).then(reloadWatchlist).catch(()=>{})}}
                onCreateList={createWatchlistList}
                onRenameList={renameWatchlistList}
                onDeleteList={deleteWatchlistList}
                hasRanking={Object.keys(rankingData).length>0}
                onClearRanking={()=>{setRankingData({});setRankingStratId(null);setRankingStratName('')}}
                rankingData={rankingData}
                rankingStratId={rankingStratId}
                onRefreshBestStrat={refreshBestStratPerSymbol}
                onCalcRankingAll={calcRankingAllStrategies}
                topStratRunning={topStratRunning}
                topStratProgress={topStratProgress}
                hasBestStrat={Object.keys(bestStratBySymbol).length>0}
                onClearBestStrat={()=>setBestStratBySymbol({})}
                onDeleteScores={deleteScores}
                onDeleteMetrics={deleteMetrics}
                wlData={wlData}
              />
            </div>
            )}

            {/* ══ STRATEGY MANAGER (overlay) ══ */}
            {showStratManager&&(
            <div style={{ position:'relative', height:'calc(100vh - 56px)', overflow:'hidden', zIndex:50 }}>
              <StrategyManager
                strategies={strategies}
                onClose={()=>setShowStratManager(false)}
                onEdit={s=>{setShowStratManager(false);setStratManagerReturn(true);openEditStr(s)}}
                onDelete={id=>{deleteStr(id);setShowStratManager(false)}}
                onToggleEnabled={toggleStrategyEnabled}
                onNew={()=>{setShowStratManager(false);setStratManagerReturn(true);newStrategy()}}
                onBulkUpdate={bulkUpdateStrategies}
              />
            </div>
            )}

            {/* ══ STRATEGY EDITOR PANEL ══ */}
            {editingStr!==null&&sidePanel==='config'&&(
              <StrategyEditorPanel
                strForm={strForm}
                setStrForm={setStrForm}
                strategy={editingStr}
                onSave={saveEditStr}
                onCancel={closeEditStr}
                onDelete={editingStr?.id?()=>deleteStr(editingStr.id):null}
                onClone={editingStr?.id?cloneEditStr:null}
                saving={strSaving}
              />
            )}

            {/* Single-asset view — oculto cuando multicartera activa o editando */}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingStr&&sidePanel==='config')&&!result&&!error&&currentStratId&&<div className="loading"><div className="spinner"/><div className="loading-text">CARGANDO DATOS...</div></div>}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingStr&&sidePanel==='config')&&error&&<div className="error-msg">⚠ {error}</div>}

            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingStr&&sidePanel==='config')&&result&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
                {/* Columna principal */}
                <div ref={contentRef} style={(sidePanel==='risk'||result.isBareChart)?{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',height:'100%'}:{flex:1,overflowY:'auto'}}>

                  {/* ══════════════════════════════════════════════════════
                      RISK MANAGEMENT — Fila 1 (métricas) + Fila 2 (config + calc)
                      Solo visible cuando sidePanel==='risk'
                  ══════════════════════════════════════════════════════ */}
                  {sidePanel==='risk'&&(()=>{
                    // ── Derived metrics ──
                    const _aport=(contributions||[]).filter(c=>c.type==='aportacion').reduce((s,c)=>s+Number(c.amount||0),0)
                    const _ret=(contributions||[]).filter(c=>c.type==='retirada').reduce((s,c)=>s+Number(c.amount||0),0)
                    const _bal=_aport-_ret
                    const _pnlR=(tlFifo.closedTrades||[]).reduce((s,t)=>s+(t.pnl_eur||t._pnl_eur||0),0)
                    const _pnlF=(tlFifo.openPositions||[]).reduce((s,p)=>s+(p._pnl_float_eur||0),0)
                    const _pnl=_pnlR+_pnlF
                    const _eq=_bal+_pnl
                    const _pnlPct=_bal>0?(_pnl/_bal)*100:0
                    const _ops=tlFifo.openPositions||[]
                    const _openCnt=_ops.length
                    const _rpt=riskActiveProfile?.risk_per_trade_value??null
                    const _rptT=riskActiveProfile?.risk_per_trade_type||'%'
                    const _capPos=_rpt!=null?(_rptT==='%'?(_eq*(_rpt/100)):_rpt):0
                    const _riskEur=_openCnt*_capPos
                    const _riskPct=_eq>0?(_riskEur/_eq)*100:0
                    const _maxR=riskActiveProfile?.max_total_risk??null
                    const _maxS=riskActiveProfile?.max_simultaneous_positions??null
                    const _invt=_ops.reduce((s,p)=>s+((p.shares||p.open_shares||0)*(p.entry_price||p.avg_buy_price||0)/(p.fx_entry||1)),0)
                    const _expPct=_eq>0?(_invt/_eq)*100:0
                    // ── Inputs (parseES acepta formato español 1.234,56) ──
                    const _eN=parseES(riskCalc.entry)
                    const _sN=parseES(riskCalc.stop)
                    const _tN=parseES(riskCalc.tp)
                    // ── Card toggles (activos/inactivos por perfil) ──
                    const _activeRO=riskActiveProfile?.active_riesgo_op??true
                    const _activeCO=riskActiveProfile?.active_capital_op??false
                    const _activeSL=riskActiveProfile?.active_slots??false
                    // ── PS (Position Sizing): riesgo/op ──
                    const _capC=_rpt!=null?(_rptT==='%'?(_eq*(_rpt/100)):_rpt):0
                    const _dS=_eN>0&&_sN>0?Math.abs(_eN-_sN):0
                    const _dSPct=_eN>0&&_dS>0?(_dS/_eN)*100:0
                    const _shs=_rpt!=null&&_eN>0&&_dS>0?Math.floor(_capC/_dS):0
                    // ── Capital/op: max_total_risk como € absoluto ──
                    const _capOpShs=_maxR!=null&&_eN>0?Math.floor(_maxR/_eN):0
                    // ── Slots: equity/nSlots/entrada ──
                    const _ns=_maxS!=null?_maxS:(nSlots>0?nSlots:0)
                    const _slotCap=_eq>0&&_ns>0?_eq/_ns:0
                    const _slotShs=_ns>0&&_eN>0&&_slotCap>0?Math.floor(_slotCap/_eN):0
                    const _slotsLibres=Math.max(0,_ns-_openCnt)
                    const _barPct=Math.min(100,_ns>0?(_openCnt/_ns)*100:0)
                    const _barC=_slotsLibres===0?'#ff4d6d':_slotsLibres<=2?'#ffd166':'#00e5a0'
                    // ── Resultado conservador (mínimo de candidatos activos) ──
                    const _candidatos=[]
                    if(_activeRO&&_rpt!=null&&_dS>0&&_shs>0) _candidatos.push(_shs)
                    if(_activeCO&&_maxR!=null&&_capOpShs>0) _candidatos.push(_capOpShs)
                    if(_activeSL&&_ns>0&&_slotShs>0) _candidatos.push(_slotShs)
                    const _resAcc=_candidatos.length>0?Math.min(..._candidatos):0
                    const _resImp=_resAcc>0&&_eN>0?_resAcc*_eN:0
                    const _resImportePrev=_slotShs*_eN // para la barra de slots
                    const _resPct=_eq>0&&_resImp>0?(_resImp/_eq)*100:0
                    // ── Riesgo operación (mode-aware) ──
                    const _trReur=_resAcc>0&&_dS>0?_resAcc*_dS:0
                    const _trRpct=_eq>0&&_trReur>0?(_trReur/_eq)*100:0
                    const _rr=_tN>0&&_dS>0?Math.abs(_tN-_eN)/_dS:0
                    const _postPct=_eq>0?((_riskEur+_trReur)/_eq)*100:0
                    const _maxRv=_maxR??5
                    const _semC=_postPct>=_maxRv?'#ff4d6d':_postPct>=(_maxRv*0.8)?'#ffd166':'#00e5a0'
                    const _semT=_postPct>=_maxRv?'Límite alcanzado':_postPct>=(_maxRv*0.8)?'Límite próximo':'Riesgo OK'
                    // Riesgo/equity = capital en riesgo / equity (coloreado por umbrales)
                    const _reqPct=_trRpct
                    const _reqC=_reqPct<=0?'var(--text3)':_maxR!=null&&_reqPct>=_maxR?'#ff4d6d':_rpt!=null&&_reqPct>=_rpt?'#ffd166':'#00e5a0'
                    // Mode accent colors
                    const _cSlots='#1d9e75',_bgSlots='rgba(29,158,117,0.12)',_bdSlots='rgba(29,158,117,0.35)'
                    const _cPS='#378add',_bgPS='rgba(55,138,221,0.12)',_bdPS='rgba(55,138,221,0.35)'
                    const _mC=riskMode==='slots'?_cSlots:_cPS
                    // Helpers
                    const _fe=(v,d=0)=>{ if(!isFinite(v)) return '—'; return (v<0?'-':'')+'€'+Math.abs(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}) }
                    const _fp=(v,d=1)=>isFinite(v)?v.toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d})+'%':'—'
                    // Style tokens
                    const _card={background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,padding:'10px 12px'}
                    const _lbl={fontFamily:MONO,fontSize:11,fontWeight:500,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}
                    const _sub={fontFamily:MONO,fontSize:11,color:'var(--text2)',marginTop:3}
                    const _fLbl={fontFamily:MONO,fontSize:11,fontWeight:500,color:'var(--text2)',marginBottom:4}
                    const _inp={background:'#0a1520',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontFamily:MONO,fontSize:14,padding:'6px 8px',boxSizing:'border-box',outline:'none'}
                    const _mkCapBtn=(ac,ab)=>({width:28,height:28,borderRadius:4,fontFamily:MONO,fontSize:14,cursor:'pointer',padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:`1px solid ${ac}66`,background:ab||`${ac}0d`,color:ac})
                    const _xBtn={width:22,height:22,borderRadius:3,fontFamily:MONO,fontSize:10,cursor:'pointer',padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center',background:'transparent',border:'1px solid var(--border)',color:'var(--text2)',flexShrink:0}
                    // Gauge
                    const _gRv=16,_gcx=20,_gcy=18
                    const _gR=_eq>0?Math.min(_riskPct/(_maxR*1.5),1):0
                    const _gA=Math.PI+_gR*Math.PI
                    const _gxe=_gcx+_gRv*Math.cos(_gA),_gye=_gcy+_gRv*Math.sin(_gA)
                    const _trkD=`M ${_gcx-_gRv} ${_gcy} A ${_gRv} ${_gRv} 0 0 1 ${_gcx+_gRv} ${_gcy}`
                    const _filD=_gR>0?`M ${_gcx-_gRv} ${_gcy} A ${_gRv} ${_gRv} 0 ${_gR>0.5?1:0} 1 ${_gxe} ${_gye}`:''
                    const _gC=_riskPct>=_maxR?'#ff4d6d':_riskPct>=(_maxR*0.8)?'#ffd166':'#00e5a0'
                    // copy-btn helper
                    const _fmtForCopy=(val)=>{if(!val&&val!==0)return'';const n=parseFloat(String(val).replace(',','.'));return isNaN(n)?String(val):n.toFixed(2)}
                    const _cpBtn=(key,val)=>val?(<button title="Copiar valor (punto decimal, 2 decimales)"
                      onClick={()=>{navigator.clipboard.writeText(_fmtForCopy(val));setRiskCopied(key);setTimeout(()=>setRiskCopied(c=>c===key?null:c),1500)}}
                      style={{width:20,height:20,borderRadius:3,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center',color:riskCopied===key?'#00e5a0':'var(--text2)',fontSize:11,flexShrink:0,transition:'color 0.2s'}}>
                      {riskCopied===key?'✓':'⧉'}
                    </button>):null
                    // compact btn sizes for row3
                    const _capBtnSm=(ac,ab,anim)=>({..._mkCapBtn(ac,ab),width:22,height:22,fontSize:12,animation:anim||''})
                    const _xBtnSm={..._xBtn,width:18,height:18,fontSize:9}
                    return(
                    <div style={{background:'var(--bg2)',borderBottom:'2px solid var(--border)',flexShrink:0}}>

                      {/* ── FILA 1: 5 métricas en barra horizontal ── */}
                      <div style={{display:'flex',alignItems:'stretch',height:52,borderBottom:'1px solid var(--border)'}}>
                        {[
                          {lbl:'Equity',   val:_fe(_eq),   c:_eq>=0?'#00e5a0':'#ff4d6d'},
                          {lbl:'Balance',  val:_fe(_bal),  c:'var(--text)'},
                          {lbl:'P&L',      val:<>{_fe(_pnl)}&nbsp;<span style={{fontSize:10,color:'var(--text2)'}}>{_fp(_pnlPct)}</span></>, c:_pnl>=0?'#00e5a0':'#ff4d6d'},
                          {lbl:'Riesgo',   val:<>{_fp(_riskPct)}<span style={{fontSize:10,color:'var(--text3)',fontWeight:400}}>/{_maxR}%</span></>, c:_gC},
                          {lbl:'Exposición',val:<>{_fp(_expPct)}<span style={{fontSize:10,color:'var(--text3)',fontWeight:400}}> {_fe(_invt)}</span></>, c:_expPct>80?'#ffd166':'var(--text)'},
                        ].map((m,i)=>(
                          <Fragment key={i}>
                            {i>0&&<div style={{width:1,background:'var(--border)',margin:'8px 0',flexShrink:0}}/>}
                            <div style={{flex:1,padding:'0 8px',display:'flex',flexDirection:'column',justifyContent:'center',minWidth:0}}>
                              <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>{m.lbl}</div>
                              <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1.1,color:m.c,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.val}</div>
                            </div>
                          </Fragment>
                        ))}
                      </div>

                      {/* ── FILA 2: 3 cards + slots bar card ── */}
                      <div style={{padding:'3px 8px 3px',borderBottom:'1px solid var(--border)'}}>
                        {/* Title strip */}
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3,position:'relative'}}>
                          <span style={{fontFamily:MONO,fontSize:10,color:'#378add',lineHeight:1}}>⚖️</span>
                          <span style={{fontFamily:MONO,fontSize:9,fontWeight:600,color:'var(--text)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Estilos inversión</span>
                          <div onClick={()=>{setRiskProfileDropOpen(v=>!v);setRiskNewForm(null);setRiskEditingNameId(null)}}
                            style={{fontFamily:MONO,fontSize:9,color:'#ff4d6d',cursor:'pointer',display:'flex',alignItems:'center',gap:1,userSelect:'none',marginLeft:2}}>
                            {riskActiveProfile?.name||'Sin perfil'}<span style={{opacity:0.5,marginLeft:1}}>▾</span>
                          </div>
                          {/* Botón + para crear nuevo estilo */}
                          <button onClick={e=>{e.stopPropagation();setRiskProfileDropOpen(true);setRiskNewForm({name:'',risk_per_trade_type:'%',risk_per_trade_value:'',max_total_risk:'',max_simultaneous_positions:''})}}
                            title="Nuevo estilo"
                            style={{marginLeft:'auto',width:18,height:18,borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',fontFamily:MONO,fontSize:12,cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>+</button>
                          {riskProfileDropOpen&&(
                            <div style={{position:'absolute',top:'calc(100% + 2px)',left:0,zIndex:200,background:'#0d1b2a',border:'1px solid var(--border)',borderRadius:5,minWidth:260,boxShadow:'0 6px 20px rgba(0,0,0,0.6)',overflow:'hidden'}}>
                              {/* Formulario nuevo estilo */}
                              {riskNewForm&&(
                                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',background:'rgba(55,138,221,0.06)'}}>
                                  <div style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Nuevo estilo</div>
                                  <input autoFocus placeholder="Nombre del estilo" value={riskNewForm.name}
                                    onChange={e=>setRiskNewForm(v=>({...v,name:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==='Enter')riskCreateNew();if(e.key==='Escape')setRiskNewForm(null)}}
                                    style={{width:'100%',background:'#0a1520',border:'1px solid var(--border)',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'3px 6px',boxSizing:'border-box',outline:'none',marginBottom:4}}/>
                                  <div style={{display:'flex',gap:3,marginBottom:4}}>
                                    <input placeholder="Riesgo/op" value={riskNewForm.risk_per_trade_value}
                                      onChange={e=>setRiskNewForm(v=>({...v,risk_per_trade_value:e.target.value}))}
                                      style={{flex:1,background:'#0a1520',border:'1px solid var(--border)',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'2px 5px',outline:'none'}}/>
                                    <input placeholder="Cap/op €" value={riskNewForm.max_total_risk}
                                      onChange={e=>setRiskNewForm(v=>({...v,max_total_risk:e.target.value}))}
                                      style={{flex:1,background:'#0a1520',border:'1px solid var(--border)',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'2px 5px',outline:'none'}}/>
                                    <input placeholder="Slots" value={riskNewForm.max_simultaneous_positions}
                                      onChange={e=>setRiskNewForm(v=>({...v,max_simultaneous_positions:e.target.value}))}
                                      style={{flex:1,background:'#0a1520',border:'1px solid var(--border)',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'2px 5px',outline:'none'}}/>
                                  </div>
                                  <div style={{display:'flex',gap:4}}>
                                    <button onClick={riskCreateNew}
                                      style={{flex:1,padding:'3px 0',background:'rgba(55,138,221,0.15)',border:'1px solid #378add',borderRadius:3,color:'#378add',fontFamily:MONO,fontSize:10,cursor:'pointer'}}>Crear</button>
                                    <button onClick={()=>setRiskNewForm(null)}
                                      style={{padding:'3px 8px',background:'transparent',border:'1px solid var(--border)',borderRadius:3,color:'var(--text2)',fontFamily:MONO,fontSize:10,cursor:'pointer'}}>✕</button>
                                  </div>
                                </div>
                              )}
                              {riskProfiles.length===0&&!riskNewForm
                                ?<div style={{padding:'8px 12px',fontFamily:MONO,fontSize:10,color:'var(--text3)'}}>Sin estilos — pulsa + para crear</div>
                                :riskProfiles.map(p=>(
                                  <div key={p.id} style={{padding:'5px 10px',display:'flex',alignItems:'center',gap:6,
                                    background:p.id===(riskActiveProfile?.id)?'rgba(255,77,109,0.08)':'transparent',
                                    borderLeft:`2px solid ${p.id===(riskActiveProfile?.id)?'#ff4d6d':'transparent'}`}}>
                                    {/* Nombre editable o estático */}
                                    {riskEditingNameId===p.id?(
                                      <input autoFocus value={riskEditingNameVal}
                                        onChange={e=>setRiskEditingNameVal(e.target.value)}
                                        onBlur={()=>riskSaveName(p.id,riskEditingNameVal)}
                                        onKeyDown={e=>{if(e.key==='Enter')riskSaveName(p.id,riskEditingNameVal);if(e.key==='Escape')setRiskEditingNameId(null);e.stopPropagation()}}
                                        onClick={e=>e.stopPropagation()}
                                        style={{flex:1,background:'#0a1520',border:'1px solid #378add',borderRadius:3,color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'1px 5px',outline:'none'}}/>
                                    ):(
                                      <span onClick={()=>{setRiskActiveId(p.id);try{localStorage.setItem('v50_risk_active_id',p.id)}catch{};setRiskProfileDropOpen(false)}}
                                        style={{flex:1,fontFamily:MONO,fontSize:11,cursor:'pointer',color:p.id===(riskActiveProfile?.id)?'#ff4d6d':'var(--text)',fontWeight:p.id===(riskActiveProfile?.id)?700:400}}>
                                        {p.name}
                                      </span>
                                    )}
                                    <span style={{fontFamily:MONO,fontSize:8,color:'var(--text3)'}}>
                                      {[p.active_riesgo_op&&'RO',p.active_capital_op&&'CO',p.active_slots&&'SL'].filter(Boolean).join('·')||'—'}
                                    </span>
                                    {/* Botón lápiz */}
                                    <button onClick={e=>{e.stopPropagation();setRiskEditingNameId(p.id);setRiskEditingNameVal(p.name)}}
                                      title="Editar nombre"
                                      style={{width:16,height:16,border:'none',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:MONO,fontSize:11,padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>✎</button>
                                    {/* Botón papelera */}
                                    <button onClick={e=>{e.stopPropagation();if(riskProfiles.length<=1){alert('No se puede eliminar el único estilo');return}riskDeleteProfile(p.id)}}
                                      title="Eliminar estilo"
                                      style={{width:16,height:16,border:'none',background:'transparent',color:'#ff4d6d66',cursor:'pointer',fontFamily:MONO,fontSize:11,padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>
                        {/* 3 clickable+editable cards + 1 slots-bar card */}
                        <div style={{display:'flex',gap:4}}>
                          {/* Máx. riesgo / op. — click → toggle activo, double-click valor → editar */}
                          <div
                            onClick={()=>riskToggleCard('active_riesgo_op')}
                            style={{flex:1,padding:'4px 6px',borderRadius:4,cursor:'pointer',position:'relative',
                              background:_activeRO?'rgba(29,158,117,0.10)':'var(--bg3)',
                              border:`1px solid ${_activeRO?'#1d9e75':'var(--border)'}`,transition:'all 0.2s'}}>
                            {_activeRO&&<span style={{position:'absolute',top:3,right:3,width:5,height:5,borderRadius:'50%',background:'#1d9e75'}}/>}
                            <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:1,lineHeight:1}}>Máx. riesgo / op.</div>
                            {riskFieldEdit?.field==='risk_per_trade_value'?(
                              <input autoFocus type="text" value={riskFieldEdit.val}
                                onChange={e=>setRiskFieldEdit(v=>({...v,val:e.target.value}))}
                                onBlur={()=>riskSaveField('risk_per_trade_value',riskFieldEdit.val)}
                                onKeyDown={e=>{if(e.key==='Enter')riskSaveField('risk_per_trade_value',riskFieldEdit.val);if(e.key==='Escape')setRiskFieldEdit(null);e.stopPropagation()}}
                                onClick={e=>e.stopPropagation()}
                                style={{..._inp,width:'100%',fontSize:13,padding:'1px 4px'}}/>
                            ):(
                              <div onDoubleClick={e=>{e.stopPropagation();setRiskFieldEdit({field:'risk_per_trade_value',val:String(_rpt??'')})}}
                                title="Doble clic para editar"
                                style={{fontFamily:MONO,fontSize:14,fontWeight:500,lineHeight:1,color:_activeRO?'#1d9e75':'var(--text)',cursor:'text'}}>
                                {_rpt!=null?`${_rpt}${_rptT}`:'—'}
                              </div>
                            )}
                            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text2)',marginTop:1,lineHeight:1}}>{_capPos>0?_fe(_capPos):''}</div>
                          </div>
                          {/* Máx. capital / op. — click → toggle activo, double-click → editar */}
                          <div
                            onClick={()=>riskToggleCard('active_capital_op')}
                            style={{flex:1,padding:'4px 6px',borderRadius:4,cursor:'pointer',position:'relative',
                              background:_activeCO?'rgba(29,158,117,0.10)':'var(--bg3)',
                              border:`1px solid ${_activeCO?'#1d9e75':'var(--border)'}`,transition:'all 0.2s'}}>
                            {_activeCO&&<span style={{position:'absolute',top:3,right:3,width:5,height:5,borderRadius:'50%',background:'#1d9e75'}}/>}
                            <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:1,lineHeight:1}}>Máx. capital / op.</div>
                            {riskFieldEdit?.field==='max_total_risk'?(
                              <input autoFocus type="text" value={riskFieldEdit.val}
                                onChange={e=>setRiskFieldEdit(v=>({...v,val:e.target.value}))}
                                onBlur={()=>riskSaveField('max_total_risk',riskFieldEdit.val)}
                                onKeyDown={e=>{if(e.key==='Enter')riskSaveField('max_total_risk',riskFieldEdit.val);if(e.key==='Escape')setRiskFieldEdit(null);e.stopPropagation()}}
                                onClick={e=>e.stopPropagation()}
                                style={{..._inp,width:'100%',fontSize:13,padding:'1px 4px'}}/>
                            ):(
                              <div onDoubleClick={e=>{e.stopPropagation();setRiskFieldEdit({field:'max_total_risk',val:String(_maxR??'')})}}
                                title="Doble clic para editar"
                                style={{fontFamily:MONO,fontSize:14,fontWeight:500,lineHeight:1,color:_activeCO?'#1d9e75':'var(--text)',cursor:'text'}}>
                                {_maxR!=null?`${_maxR}%`:'—'}
                              </div>
                            )}
                            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text2)',marginTop:1,lineHeight:1}}>{_maxR!=null?_fe(_eq*(_maxR/100)):''}</div>
                          </div>
                          {/* Máx. slots simult. — click → toggle activo, double-click → editar */}
                          <div
                            onClick={()=>riskToggleCard('active_slots')}
                            style={{flex:1,padding:'4px 6px',borderRadius:4,cursor:'pointer',position:'relative',
                              background:_activeSL?'rgba(29,158,117,0.10)':'var(--bg3)',
                              border:`1px solid ${_activeSL?'#1d9e75':'var(--border)'}`,transition:'all 0.2s'}}>
                            {_activeSL&&<span style={{position:'absolute',top:3,right:3,width:5,height:5,borderRadius:'50%',background:'#1d9e75'}}/>}
                            <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:1,lineHeight:1}}>Máx. slots simult.</div>
                            {riskFieldEdit?.field==='max_simultaneous_positions'?(
                              <input autoFocus type="text" value={riskFieldEdit.val}
                                onChange={e=>setRiskFieldEdit(v=>({...v,val:e.target.value}))}
                                onBlur={()=>{riskSaveField('max_simultaneous_positions',riskFieldEdit.val);const v=parseInt(riskFieldEdit.val)||0;if(v>0){setNSlots(v);try{localStorage.setItem('v50_risk_nslots',v)}catch{}}}}
                                onKeyDown={e=>{if(e.key==='Enter'){riskSaveField('max_simultaneous_positions',riskFieldEdit.val);const v=parseInt(riskFieldEdit.val)||0;if(v>0){setNSlots(v);try{localStorage.setItem('v50_risk_nslots',v)}catch{}}};if(e.key==='Escape')setRiskFieldEdit(null)}}
                                onClick={e=>e.stopPropagation()}
                                style={{..._inp,width:'100%',fontSize:13,padding:'1px 4px'}}/>
                            ):(
                              <div onDoubleClick={e=>{e.stopPropagation();setRiskFieldEdit({field:'max_simultaneous_positions',val:String(_maxS??nSlots??'')})}}
                                title="Doble clic para editar"
                                style={{fontFamily:MONO,fontSize:14,fontWeight:500,lineHeight:1,color:_activeSL?'#1d9e75':'var(--text)',cursor:'text'}}>
                                {_maxS!=null?_maxS:(nSlots||'—')}
                              </div>
                            )}
                            <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',marginTop:1,lineHeight:1}}>{_slotCap>0?_fe(_slotCap)+'/sl':''}</div>
                          </div>
                          {/* Slots bar card (reemplaza Exposición) */}
                          <div style={{flex:1,padding:'4px 6px',borderRadius:4,background:'var(--bg3)',border:'1px solid var(--border)',display:'flex',flexDirection:'column',justifyContent:'center'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                              <span style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',lineHeight:1}}>{_openCnt} ab · {_slotsLibres} lib / {_ns}</span>
                              <span style={{fontFamily:MONO,fontSize:9,color:_barC,fontWeight:600,lineHeight:1}}>{_openCnt}/{_ns}</span>
                            </div>
                            <div style={{height:4,borderRadius:2,background:'#0a1520',overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:2,width:`${_barPct}%`,background:_barC,transition:'width 0.3s'}}/>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── FILA 3: inputs + resultados en una sola línea horizontal ── */}
                      <div style={{padding:'4px 8px 6px'}}>
                        <div style={{display:'flex',alignItems:'stretch',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,overflow:'visible',minHeight:60}}>

                          {/* Inputs side (3 campos) */}
                          <div style={{display:'flex',gap:5,padding:'5px 8px',alignItems:'flex-end',flexShrink:0}}>

                            {(()=>{
                              const isCapturing=riskCaptureMode==='capture_entry'
                              const isActive=riskLineActive.entry
                              const ac='#4488cc'
                              return(
                              <div>
                                <div style={{fontFamily:MONO,fontSize:10,fontWeight:500,color:'var(--text2)',marginBottom:2,lineHeight:1}}>Entrada</div>
                                <div style={{display:'flex',alignItems:'center',gap:2}}>
                                  <input type="text" inputMode="decimal" placeholder="0.00" value={_fmtForCopy(riskCalc.entry)||riskCalc.entry}
                                    onChange={e=>{const v=parseES(e.target.value);setRiskCalc(c=>({...c,entry:e.target.value}));setRiskLineActive(p=>({...p,entry:v>0}));if(v>0&&riskCaptureMode==='capture_entry')setRiskCaptureMode(null)}}
                                    style={{..._inp,width:90,fontSize:12,borderColor:isActive?ac:isCapturing?`${ac}99`:'var(--border)'}}/>
                                  <button title={isCapturing?'Cancelar':'Capturar del gráfico'} onClick={()=>setRiskCaptureMode(c=>c==='capture_entry'?null:'capture_entry')}
                                    style={_capBtnSm(ac,isCapturing?'rgba(68,136,204,0.35)':isActive?'rgba(68,136,204,0.2)':undefined,isCapturing?'pulse-ring 1s infinite':'')}>⊕</button>
                                  {_cpBtn('entry',riskCalc.entry)}
                                  <button title="Limpiar" onClick={()=>{setRiskCalc(c=>({...c,entry:''}));setRiskLineActive(p=>({...p,entry:false}));if(riskCaptureMode==='capture_entry')setRiskCaptureMode(null)}} style={_xBtnSm}>✕</button>
                                </div>
                              </div>
                              )
                            })()}

                            {(()=>{
                              const isCapturing=riskCaptureMode==='capture_stop'
                              const isActive=riskLineActive.stop
                              const ac='#cc4444'
                              return(
                              <div>
                                <div style={{fontFamily:MONO,fontSize:10,fontWeight:500,color:'var(--text2)',marginBottom:2,lineHeight:1}}>Stop</div>
                                <div style={{display:'flex',alignItems:'center',gap:2}}>
                                  <input type="text" inputMode="decimal" placeholder="0.00" value={_fmtForCopy(riskCalc.stop)||riskCalc.stop}
                                    onChange={e=>{const v=parseES(e.target.value);setRiskCalc(c=>({...c,stop:e.target.value}));setRiskLineActive(p=>({...p,stop:v>0}));if(v>0&&riskCaptureMode==='capture_stop')setRiskCaptureMode(null)}}
                                    style={{..._inp,width:90,fontSize:12,borderColor:isActive?ac:isCapturing?`${ac}99`:'var(--border)'}}/>
                                  <button title={isCapturing?'Cancelar':'Capturar del gráfico'} onClick={()=>setRiskCaptureMode(c=>c==='capture_stop'?null:'capture_stop')}
                                    style={_capBtnSm(ac,isCapturing?'rgba(204,68,68,0.35)':isActive?'rgba(204,68,68,0.2)':undefined)}>⊕</button>
                                  {_cpBtn('stop',riskCalc.stop)}
                                  <button title="Limpiar" onClick={()=>{setRiskCalc(c=>({...c,stop:''}));setRiskLineActive(p=>({...p,stop:false}));if(riskCaptureMode==='capture_stop')setRiskCaptureMode(null)}} style={_xBtnSm}>✕</button>
                                </div>
                              </div>
                              )
                            })()}

                            {(()=>{
                              const isCapturing=riskCaptureMode==='capture_tp'
                              const isActive=riskLineActive.tp
                              const ac='#44cc88'
                              return(
                              <div>
                                <div style={{fontFamily:MONO,fontSize:10,fontWeight:500,color:'var(--text2)',marginBottom:2,lineHeight:1}}>TP</div>
                                <div style={{display:'flex',alignItems:'center',gap:2}}>
                                  <input type="text" inputMode="decimal" placeholder="0.00" value={_fmtForCopy(riskCalc.tp)||riskCalc.tp}
                                    onChange={e=>{const v=parseES(e.target.value);setRiskCalc(c=>({...c,tp:e.target.value}));setRiskLineActive(p=>({...p,tp:v>0}));if(v>0&&riskCaptureMode==='capture_tp')setRiskCaptureMode(null)}}
                                    style={{..._inp,width:90,fontSize:12,borderColor:isActive?ac:isCapturing?`${ac}99`:'var(--border)'}}/>
                                  <button title={isCapturing?'Cancelar':'Capturar del gráfico'} onClick={()=>setRiskCaptureMode(c=>c==='capture_tp'?null:'capture_tp')}
                                    style={_capBtnSm(ac,isCapturing?'rgba(68,204,136,0.35)':isActive?'rgba(68,204,136,0.2)':undefined)}>⊕</button>
                                  {_cpBtn('tp',riskCalc.tp)}
                                  <button title="Limpiar" onClick={()=>{setRiskCalc(c=>({...c,tp:''}));setRiskLineActive(p=>({...p,tp:false}));if(riskCaptureMode==='capture_tp')setRiskCaptureMode(null)}} style={_xBtnSm}>✕</button>
                                </div>
                              </div>
                              )
                            })()}

                          </div>

                          {/* Separator */}
                          <div style={{width:1,background:'var(--border)',margin:'5px 0',flexShrink:0}}/>

                          {/* Results + semáforo side */}
                          <div style={{display:'flex',flex:1,alignItems:'center',padding:'0 6px',gap:0,overflow:'hidden',minWidth:0}}>
                            {_eN>0?(
                              <>
                                {/* Acciones */}
                                <div style={{padding:'0 10px',display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>Acc.</div>
                                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1,color:_resAcc>0?'#ffd166':'var(--text3)'}}>{_resAcc>0?_resAcc:'—'}</div>
                                </div>
                                <div style={{width:1,height:32,background:'var(--border)',flexShrink:0}}/>
                                {/* Importe */}
                                <div style={{padding:'0 10px',display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>Importe</div>
                                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1,color:'var(--text)'}}>{_resImp>0?_fe(_resImp):'—'}</div>
                                  {_resPct>0&&<div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',marginTop:2,lineHeight:1}}>{_fp(_resPct)}</div>}
                                </div>
                                <div style={{width:1,height:32,background:'var(--border)',flexShrink:0}}/>
                                {/* Riesgo operación */}
                                <div style={{padding:'0 10px',display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>Riesgo op.</div>
                                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1,color:'var(--text)'}}>{_trReur>0?_fe(_trReur):'—'}</div>
                                  {_dSPct>0&&<div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',marginTop:2,lineHeight:1}}>{_fp(_dSPct)}</div>}
                                </div>
                                <div style={{width:1,height:32,background:'var(--border)',flexShrink:0}}/>
                                {/* R:R */}
                                <div style={{padding:'0 10px',display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>R:R</div>
                                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1,color:_rr>=2?'#00e5a0':_rr>=1?'#ffd166':'#ff4d6d'}}>{_rr>0?`1:${_rr.toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1})}`:'—'}</div>
                                </div>
                                {/* Riesgo/equity */}
                                <div style={{marginLeft:'auto',padding:'0 10px',display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}
                                  title="Capital en riesgo si salta el stop, expresado como % del equity total">
                                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2,lineHeight:1}}>Riesgo/eq.</div>
                                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:500,lineHeight:1,color:_reqC}}>{_reqPct>0?_fp(_reqPct,2):'—'}</div>
                                </div>
                              </>
                            ):(
                              <span style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',padding:'0 10px'}}>Define entrada para calcular</span>
                            )}
                          </div>

                        </div>
                      </div>

                    </div>
                    )
                  })()}

                  {/* Gráfico de velas */}
                  <div className="chart-wrap" ref={chartWrapRef} onContextMenu={e=>openCtx(e,'chart')} style={{padding:0,borderBottom:'1px solid var(--border)',...((sidePanel==='risk'||result.isBareChart)?{flex:1,minHeight:0,display:'flex',flexDirection:'column'}:{})}}>
                    <div style={{position:'relative',...((sidePanel==='risk'||result.isBareChart)?{flex:1,minHeight:0,height:'100%'}:{})}}>
                      {/* ── Barra de info integrada — una sola fila sobre el gráfico ── */}
                      <div style={{position:'absolute',top:0,left:0,right:0,zIndex:11,height:30,
                        display:'flex',alignItems:'center',gap:5,padding:'0 8px',
                        background:'rgba(8,12,20,0.92)',backdropFilter:'blur(4px)',
                        borderBottom:'1px solid rgba(26,45,69,0.6)',
                        pointerEvents:'none',fontFamily:MONO,fontSize:11,overflow:'hidden'}}>
                        {/* ★ favorito */}
                        {(()=>{
                          const wItem=watchlist.find(w=>w.symbol===simbolo)
                          if(!wItem) return null
                          return(
                            <span onClick={async(e)=>{e.stopPropagation();await upsertWatchlistItem({...wItem,favorite:!wItem.favorite});reloadWatchlist()}}
                              title={wItem.favorite?'Quitar favorito':'Marcar favorito'}
                              style={{cursor:'pointer',fontSize:12,color:wItem.favorite?'#ffd166':'#3d5a7a',
                                flexShrink:0,lineHeight:1,pointerEvents:'all'}}>
                              {wItem.favorite?'★':'☆'}
                            </span>
                          )
                        })()}
                        {/* Ticker — clic abre TradingView */}
                        <span onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${tvSym(simbolo)}`,'_blank')}
                          title={`Abrir ${simbolo} en TradingView ↗`}
                          style={{cursor:'pointer',fontWeight:700,color:'#e2eaf5',fontSize:13,
                            flexShrink:0,pointerEvents:'all',userSelect:'none'}}>
                          {displayedSimbolo||simbolo}
                        </span>
                        {/* + añadir a watchlist */}
                        <button onClick={newItem} title="Añadir a watchlist"
                          style={{pointerEvents:'all',background:'rgba(0,212,255,0.06)',
                            border:'1px solid rgba(0,212,255,0.28)',color:'#00d4ff',
                            fontFamily:MONO,fontSize:11,padding:'0 5px',borderRadius:3,
                            cursor:'pointer',lineHeight:'18px',flexShrink:0,height:18}}>+</button>
                        {/* OHLC dinámico — CandleChart escribe aquí via externalLegendRef */}
                        <span ref={chartLegendRef} style={{flex:1,minWidth:0,overflow:'hidden',
                          whiteSpace:'nowrap',textOverflow:'ellipsis'}}/>
                        {/* Estrategia activa */}
                        {stratName&&(
                          <span style={{flexShrink:0,fontSize:9,color:'#7a9bc0',
                            background:'rgba(13,21,32,0.85)',border:'1px solid #1a2d45',
                            borderRadius:3,padding:'1px 6px',display:'flex',alignItems:'center',gap:3,
                            maxWidth:130,overflow:'hidden'}}>
                            <span style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                              background:stratColor||'#00d4ff',boxShadow:`0 0 4px ${stratColor||'#00d4ff'}88`}}/>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stratName}</span>
                          </span>
                        )}
                        {rulerOn&&<span style={{fontSize:9,color:'#ffd166',flexShrink:0}}>Ctrl=imán · dbl=borrar</span>}
                        {/* Fit/Recent */}
                        <button onClick={()=>{
                            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
                            const _m=s?.chart?.recentMonths??3
                            if(chartViewFull){chartApiRef.current?.showRecent(_m,0);setChartViewFull(false)}
                            else{chartApiRef.current?.fitAll();setChartViewFull(true)}
                          }}
                          title={chartViewFull?`Ver últimos ${(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.chart?.recentMonths??3}catch(_){return 3}})()}m`:'Ver período completo'}
                          style={{pointerEvents:'all',background:'rgba(8,12,20,0.7)',border:'1px solid #1e3a52',
                            color:chartViewFull?'#00d4ff':'#00e5a0',
                            fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                            flexShrink:0,lineHeight:1}}>
                          {chartViewFull?'⊞':'⊡'}
                        </button>
                        {/* ⛶ Pantalla completa */}
                        <button onClick={()=>setChartFullscreen(f=>!f)}
                          title={chartFullscreen?'Salir de pantalla completa':'Pantalla completa'}
                          style={{pointerEvents:'all',
                            background:chartFullscreen?'rgba(255,77,109,0.12)':'rgba(8,12,20,0.7)',
                            border:`1px solid ${chartFullscreen?'#ff4d6d':'#2a3d55'}`,
                            color:chartFullscreen?'#ff4d6d':'#5a7a95',
                            fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,
                            cursor:'pointer',lineHeight:1,flexShrink:0}}>
                          {chartFullscreen?'⊠':'⛶'}
                        </button>
                        {/* ◀ ▶ */}
                        {[['◀',10],['▶',-10]].map(([lbl,bars])=>(
                          <button key={lbl} onClick={()=>chartApiRef.current?.scrollBy(bars)}
                            title={bars>0?'Izquierda':'Derecha'}
                            style={{pointerEvents:'all',background:'rgba(8,12,20,0.7)',border:'1px solid #1a2d45',
                              color:'#5a8aaa',fontFamily:MONO,fontSize:10,padding:'1px 5px',
                              borderRadius:3,cursor:'pointer',lineHeight:1,flexShrink:0}}>
                            {lbl}
                          </button>
                        ))}
                        {/* Regla */}
                        <button onClick={()=>setRulerOn(r=>!r)}
                          title={rulerOn?'Desactivar regla':'Activar regla de medición'}
                          style={{pointerEvents:'all',
                            background:rulerOn?'rgba(255,209,102,0.18)':'rgba(8,12,20,0.7)',
                            border:`1px solid ${rulerOn?'#ffd166':'#2a3d55'}`,
                            color:rulerOn?'#ffd166':'#5a7a95',
                            fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                            display:'flex',alignItems:'center',gap:2,lineHeight:1,flexShrink:0}}>
                          📏{rulerOn&&<span style={{fontSize:9}}> ON</span>}
                        </button>
                        {/* % / All — label mode */}
                        {(()=>{
                          const cfgs=[{label:'🏷',active:false},{label:'%',active:true},{label:'All',active:true}]
                          const c=cfgs[labelMode]
                          return(
                            <button onClick={()=>setLabelMode(l=>(l+1)%3)}
                              title={['Sin etiquetas','Solo %','% + € + días'][labelMode]}
                              style={{pointerEvents:'all',
                                background:c.active?'rgba(0,229,160,0.12)':'rgba(8,12,20,0.7)',
                                border:`1px solid ${c.active?'rgba(0,229,160,0.5)':'#2a3d55'}`,
                                color:c.active?'#00e5a0':'#5a7a95',
                                fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                lineHeight:1,flexShrink:0}}>
                              {c.label}
                            </button>
                          )
                        })()}
                      </div>
                      <CandleChart
                        data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL} definition={null}
                        visuals={result.visuals??null}
                        slopeChanges={result.slopeChanges??[]}
                        customMarkers={result.customMarkers??[]}
                        trades={result.isBareChart?[]:result.trades||[]} maxDD={result.isBareChart?0:metrics?.ddSimple||0}
                        isBareChart={result.isBareChart??false}
                        chartHeight={result.isBareChart?bareChartHeight:candleH}
                        labelMode={labelMode} rulerActive={rulerOn}
                        onChartReady={api=>{chartApiRef.current=api}}
                        onPriceAlarm={sidePanel!=='watchlist'&&sidePanel!=='risk'?price=>setPriceAlarmDlg({price,symbol:simbolo}):null}
                        onAlarmPriceDrag={onAlarmPriceDrag}
                        ackedAlarms={ackedAlarms}
                        savedRangeRef={savedRangeRef}
                        isNewResultRef={isNewResultRef}
                        syncRef={chartSyncRef}
                        externalLegendRef={chartLegendRef}
                        priceAlarms={alarms.filter(a=>a.condition==='price_level'&&(a.symbol||'').toUpperCase()===(simbolo||'').toUpperCase())}
                        tlOpenTrades={tlTrades.filter(t=>t.status==='open'&&t.fill_type!=='sell'&&(t.symbol||'').toUpperCase()===(simbolo||'').toUpperCase())}
                        riskMode={sidePanel==='risk'&&riskCaptureMode?riskCaptureMode:null}
                        onRiskPrice={sidePanel==='risk'&&riskCaptureMode?onRiskPrice:null}
                        onRiskLevelChange={sidePanel==='risk'?onRiskLevelChange:null}
                        riskLineActive={sidePanel==='risk'?riskLineActive:null}
                        riskLevels={(()=>{
                          if(sidePanel!=='risk') return null
                          const _eA=riskLineActive.entry, _sA=riskLineActive.stop, _tA=riskLineActive.tp
                          if(!_eA&&!_sA&&!_tA) return null
                          const _e=_eA?(parseES(riskCalc.entry)||null):null
                          const _s=_sA?(parseES(riskCalc.stop)||null):null
                          const _t=_tA?(parseES(riskCalc.tp)||null):null
const _aport=(contributions||[]).filter(c=>c.type==='aportacion').reduce((s,c)=>s+Number(c.amount||0),0)
                          const _ret=(contributions||[]).filter(c=>c.type==='retirada').reduce((s,c)=>s+Number(c.amount||0),0)
                          const _bal=_aport-_ret
                          const _pnlR=(tlFifo.closedTrades||[]).reduce((s,t)=>s+(t.pnl_eur||t._pnl_eur||0),0)
                          const _pnlF=(tlFifo.openPositions||[]).reduce((s,p)=>s+(p._pnl_float_eur||0),0)
                          const _eq=_bal+_pnlR+_pnlF
                          const _rpt=riskActiveProfile?.risk_per_trade_value||1
                          const _rptT=riskActiveProfile?.risk_per_trade_type||'%'
                          const _capC=_rptT==='%'?(_eq*(_rpt/100)):_rpt
                          const _dS=_e&&_s?Math.abs(_e-_s):0
                          const _shs=_e&&_dS>0?Math.floor(_capC/_dS):0
                          const _trReur=_shs*_dS
                          const _rr=_t&&_e&&_dS>0?Math.abs(_t-_e)/_dS:0
                          return {entry:_e,stop:_s,tp:_t,shares:_shs,tradeRiskEur:_trReur,rrRatio:_rr}
                        })()}
                        fillHeight={sidePanel==='risk'}
                        filterZones={result?.filterZones||[]}
                      />
                    </div>
                    {/* Drag handle — resize candle chart (oculto en bare chart) */}
                    {!result.isBareChart&&<div onMouseDown={e=>{candleResizing.current=true;candleStartY.current=e.clientY;candleStartH.current=candleH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>}
                  </div>

                  {/* ── Fullscreen overlay — segunda instancia de CandleChart, no desmonta la original ── */}
                  {chartFullscreen&&(
                    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:9999,
                      background:'var(--bg)',display:'flex',flexDirection:'column',height:'100dvh'}}>
                      {/* Barra superior — misma estructura que la del chart normal */}
                      <div style={{height:30,display:'flex',alignItems:'center',gap:5,padding:'0 8px',
                        background:'rgba(8,12,20,0.92)',backdropFilter:'blur(4px)',
                        borderBottom:'1px solid rgba(26,45,69,0.6)',flexShrink:0,
                        fontFamily:MONO,fontSize:11,overflow:'hidden'}}>
                        {(()=>{
                          const wItem=watchlist.find(w=>w.symbol===simbolo); if(!wItem) return null
                          return(
                            <span onClick={async(e)=>{e.stopPropagation();await upsertWatchlistItem({...wItem,favorite:!wItem.favorite});reloadWatchlist()}}
                              title={wItem.favorite?'Quitar favorito':'Marcar favorito'}
                              style={{cursor:'pointer',fontSize:12,color:wItem.favorite?'#ffd166':'#3d5a7a',flexShrink:0,lineHeight:1,pointerEvents:'all'}}>
                              {wItem.favorite?'★':'☆'}
                            </span>
                          )
                        })()}
                        <span onClick={()=>{setSymSearchQ('');setSymSearchOpen(true)}}
                          title="Cambiar símbolo"
                          style={{cursor:'pointer',fontWeight:700,color:'#e2eaf5',fontSize:13,flexShrink:0,pointerEvents:'all',userSelect:'none'}}>
                          {displayedSimbolo||simbolo}
                        </span>
                        <span ref={chartLegendRef} style={{flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}/>
                        {stratName&&(
                          <span style={{flexShrink:0,fontSize:9,color:'#7a9bc0',background:'rgba(13,21,32,0.85)',
                            border:'1px solid #1a2d45',borderRadius:3,padding:'1px 6px',
                            display:'flex',alignItems:'center',gap:3,maxWidth:130,overflow:'hidden'}}>
                            <span style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                              background:stratColor||'#00d4ff',boxShadow:`0 0 4px ${stratColor||'#00d4ff'}88`}}/>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stratName}</span>
                          </span>
                        )}
                        {rulerOn&&<span style={{fontSize:9,color:'#ffd166',flexShrink:0}}>Ctrl=imán · dbl=borrar</span>}
                        {/* Fit/Recent */}
                        <button onClick={()=>{
                            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
                            const _m=s?.chart?.recentMonths??3
                            if(chartViewFull){chartApiFullscreenRef.current?.showRecent(_m,0);setChartViewFull(false)}
                            else{chartApiFullscreenRef.current?.fitAll();setChartViewFull(true)}
                          }}
                          title={chartViewFull?`Ver últimos ${(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.chart?.recentMonths??3}catch(_){return 3}})()}m`:'Ver período completo'}
                          style={{pointerEvents:'all',background:'rgba(8,12,20,0.7)',border:'1px solid #1e3a52',
                            color:chartViewFull?'#00d4ff':'#00e5a0',
                            fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                            flexShrink:0,lineHeight:1}}>
                          {chartViewFull?'⊞':'⊡'}
                        </button>
                        {/* ⛶/⊠ — mismo toggle que en vista normal */}
                        <button onClick={()=>setChartFullscreen(f=>!f)}
                          title={chartFullscreen?'Salir de pantalla completa':'Pantalla completa'}
                          style={{pointerEvents:'all',
                            background:chartFullscreen?'rgba(255,77,109,0.12)':'rgba(8,12,20,0.7)',
                            border:`1px solid ${chartFullscreen?'#ff4d6d':'#2a3d55'}`,
                            color:chartFullscreen?'#ff4d6d':'#5a7a95',
                            fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,
                            cursor:'pointer',lineHeight:1,flexShrink:0}}>
                          {chartFullscreen?'⊠':'⛶'}
                        </button>
                        {/* ◀ ▶ */}
                        {[['◀',10],['▶',-10]].map(([lbl,bars])=>(
                          <button key={lbl} onClick={()=>chartApiFullscreenRef.current?.scrollBy(bars)}
                            title={bars>0?'Izquierda':'Derecha'}
                            style={{pointerEvents:'all',background:'rgba(8,12,20,0.7)',border:'1px solid #1a2d45',
                              color:'#5a8aaa',fontFamily:MONO,fontSize:10,padding:'1px 5px',
                              borderRadius:3,cursor:'pointer',lineHeight:1,flexShrink:0}}>
                            {lbl}
                          </button>
                        ))}
                        {/* Regla */}
                        <button onClick={()=>setRulerOn(r=>!r)}
                          title={rulerOn?'Desactivar regla':'Activar regla de medición'}
                          style={{pointerEvents:'all',
                            background:rulerOn?'rgba(255,209,102,0.18)':'rgba(8,12,20,0.7)',
                            border:`1px solid ${rulerOn?'#ffd166':'#2a3d55'}`,
                            color:rulerOn?'#ffd166':'#5a7a95',
                            fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                            display:'flex',alignItems:'center',gap:2,lineHeight:1,flexShrink:0}}>
                          📏{rulerOn&&<span style={{fontSize:9}}> ON</span>}
                        </button>
                        {/* % / All — label mode */}
                        {(()=>{
                          const cfgs=[{label:'🏷',active:false},{label:'%',active:true},{label:'All',active:true}]
                          const c=cfgs[labelMode]
                          return(
                            <button onClick={()=>setLabelMode(l=>(l+1)%3)}
                              title={['Sin etiquetas','Solo %','% + € + días'][labelMode]}
                              style={{pointerEvents:'all',
                                background:c.active?'rgba(0,229,160,0.12)':'rgba(8,12,20,0.7)',
                                border:`1px solid ${c.active?'rgba(0,229,160,0.5)':'#2a3d55'}`,
                                color:c.active?'#00e5a0':'#5a7a95',
                                fontFamily:MONO,fontSize:10,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                lineHeight:1,flexShrink:0}}>
                              {c.label}
                            </button>
                          )
                        })()}
                      </div>
                      {/* Gráfico */}
                      <div style={{flex:1,minHeight:0,position:'relative'}}>
                        <CandleChart
                          data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL} definition={null}
                          visuals={result.visuals??null}
                          slopeChanges={result.slopeChanges??[]}
                          customMarkers={result.customMarkers??[]}
                          trades={result.isBareChart?[]:result.trades||[]}
                          maxDD={result.isBareChart?0:metrics?.ddSimple||0}
                          isBareChart={result.isBareChart??false}
                          fillHeight={true}
                          labelMode={labelMode} rulerActive={rulerOn}
                          savedRangeRef={savedRangeRef}
                          isNewResultRef={isNewResultRef}
                          syncRef={chartSyncRef}
                          externalLegendRef={chartLegendRef}
                          onChartReady={api=>{chartApiFullscreenRef.current=api}}
                          priceAlarms={alarms.filter(a=>a.condition==='price_level'&&(a.symbol||'').toUpperCase()===(simbolo||'').toUpperCase())}
                          tlOpenTrades={tlTrades.filter(t=>t.status==='open'&&t.fill_type!=='sell'&&(t.symbol||'').toUpperCase()===(simbolo||'').toUpperCase())}
                          filterZones={result?.filterZones||[]}
                        />
                      </div>
                    </div>
                  )}

                  {/* Métricas en cuadrícula (si layout=grid) — oculto en Risk y bare chart */}
                  {!result.isBareChart&&sidePanel!=='risk'&&metricsLayout==='grid'&&metrics&&(
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

                  {/* Equity + Barras + Historial — ocultos en Risk Management y bare chart */}
                  {!result.isBareChart&&sidePanel!=='risk'&&<>
                  <div className="equity-section" onContextMenu={e=>openCtx(e,'equity')}>
                    <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                      <span>Equity</span>
                      {[
                        {key:'st',label:'Simple',color:'#00d4ff',state:showStrategy,set:setShowStrategy},
                        {key:'co',label:'Compuesta',color:'#00e5a0',state:showCompound,set:setShowCompound},
                        {key:'bh',label:'B&H Activo',color:'#ffd166',state:showBH,set:setShowBH},
                        {key:'sp',label:'B&H SP500',color:'#9b72ff',state:showSP500,set:setShowSP500},
                        {key:'fl',label:'Flotante',color:'#ff9a3c',state:showBacktestFloat,set:setShowBacktestFloat},
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
                      floatCurve={backtestFloatCurve}
                      floatCompoundCurve={backtestFloatCompoundCurve}
                      showFloat={showBacktestFloat}
                      maxDDFloat={maxDDFloat}
                      maxDDFloatDate={maxDDFloatDate}
                      maxDDFloatCompound={maxDDFloatCompound}
                      maxDDFloatCompoundDate={maxDDFloatCompoundDate}
                      syncRef={chartSyncRef}
                      chartHeight={equityH}
                      onAxisWidth={w=>setIndivAxisW(prev=>Math.abs(prev-w)>0.5?w:prev)}
                    />
                    {/* Drag handle — resize equity chart height */}
                    <div onMouseDown={e=>{equityResizing.current=true;equityStartY.current=e.clientY;equityStartH.current=equityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>
                    {/* ── Ganancias mensuales (individual) — Estrategia vs B&H del activo ── */}
                    {(()=>{
                      const capIniNum=Number(capitalIni)
                      const mSeries=[]
                      if(result.compoundCurve?.length) mSeries.push({id:'__strat__',name:'Estrategia',color:'#00e5a0',compoundCurve:result.compoundCurve,visible:showCompound})
                      if(result.bhCurve?.length) mSeries.push({id:'__bh__',name:'B&H Activo',color:'#ffd166',compoundCurve:result.bhCurve,visible:showBH})
                      if(!mSeries.some(s=>s.compoundCurve?.length)) return null
                      return <div data-chart="monthly"><div style={{width:'calc(100% - 21px)',marginLeft:0}}><McMonthlyGainsChart series={mSeries} capitalIni={capIniNum} syncRef={chartSyncRef} axisWidth={indivAxisW}/></div></div>
                    })()}
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
                        <div style={{width:'calc(100% - 21px)',marginLeft:0}}>
                        <OccupancyBarChart
                          trades={result.trades}
                          chartData={result.chartData}
                          capitalIni={Number(capitalIni)}
                          syncRef={chartSyncRef}
                          showMode={indivOccMode}
                          axisWidth={indivAxisW}
                        />
                        </div>
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
                  </>}
                </div>

                {/* Panel derecho de métricas */}
                {!result.isBareChart&&sidePanel!=='multi'&&sidePanel!=='risk'&&(metricsLayout==='panel'||metricsLayout==='multi')&&metrics&&(
                  <div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}} onContextMenu={e=>openCtx(e,'metrics')}>
                    {/* Resize handle — left edge */}
                    <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                      style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                        background:'transparent',transition:'background 0.15s'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                    <div style={{padding:'6px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#b8d8f0',letterSpacing:'0.08em',fontWeight:600,flex:1}}>RESUMEN · {displayedSimbolo||simbolo}</span>
                    </div>
                    <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                    {(()=>{
                      const rows = buildUnifiedRows(metrics, result?.maxDDBH||0)
                      return <SingleColumnTable rows={rows} strats={metricsStrats}/>
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ══ MULTICARTERA — loading / empty state ══ */}
            {sidePanel==='multi'&&mcLoading&&!mcProgress&&(
              <div className="loading"><div className="spinner"/><div className="loading-text">CALCULANDO MULTICARTERA...</div></div>
            )}
            {sidePanel==='multi'&&mcLoading&&mcProgress&&(
              <div className="loading"><div className="spinner"/>
                <div className="loading-text">
                  ESTRATEGIA {mcProgress.current}/{mcProgress.total}: {mcProgress.name.toUpperCase()}
                </div>
              </div>
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
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>{mcResult.n} activos · <span style={{color:mcResult.modoAsig==='custom'?'#9b72ff':'#00d4ff'}}>{mcResult.modoAsig==='compartido'?'Capital compartido':mcResult.modoAsig==='concentrado'?'Capital concentrado':'Slots iguales'}</span></span>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>
                    {mcPeriodMode==='range'&&mcFromDate&&mcToDate
                      ?<>Desde {fmtDate(mcFromDate)} hasta {fmtDate(mcToDate)}</>
                      :<>Desde {fmtDate(mcResult.startDate)}</>}
                  </span>
                </div>

                {/* ── Tabla unificada: Comparativa + Resumen por activo ── */}
                {(()=>{
                  const isMulti=mcMultiResults.length>1
                  const capIni=Number(mcCapitalIni||capitalIni)
                  // Lista de estrategias: multi → mcMultiResults; single → wrapper sintético
                  const stratList=isMulti
                    ? mcMultiResults
                    : [{id:currentStratId||'__single__',name:strategies.find(s=>s.id===currentStratId)?.name||'Estrategia activa',color:'#00d4ff',result:mcResult}]
                  // B&H globals (del result activo)
                  const bhLast=mcResult.bhCurve?.slice(-1)[0]?.value||capIni
                  const bhFd=mcResult.bhCurve?.[0]?.date?new Date(mcResult.bhCurve[0].date):mcResult.startDate?new Date(mcResult.startDate):null
                  const bhLd=mcResult.bhCurve?.slice(-1)[0]?.date?new Date(mcResult.bhCurve.slice(-1)[0].date):new Date()
                  const bhAnios=mcPeriodMode==='range'&&mcFromDate&&mcToDate
                    ?(new Date(mcToDate)-new Date(mcFromDate))/(365.25*24*3600*1000)
                    :bhFd&&bhLd?(bhLd-bhFd)/86400000/365.25
                    :1
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
                                {h:'CAGR',t:'Tasa de crecimiento anual compuesta. Fórmula: (capital_final / capital_inicial)^(1/años) − 1'},
                                {h:'G.Comp€',t:'Ganancia compuesta en euros. Las ganancias de cada trade se reinvierten en el siguiente'},
                                {h:'G.Comp%',t:'Ganancia compuesta en porcentaje sobre el capital inicial asignado a este slot'},
                                {h:'Win%',t:'Porcentaje de operaciones cerradas con ganancia sobre el total'},
                                {h:'Profit Factor',t:'Factor de Beneficio: suma de ganancias / suma de pérdidas. Por encima de 1 la estrategia es rentable'},
                                {h:'Max DD',t:'Máxima caída desde un pico hasta el valle siguiente, incluyendo pérdidas no realizadas dentro de cada trade (calculado siempre con P&L flotante)'},
                                {h:'Max DD €',t:'Importe en euros de la máxima caída: equity en el valle − equity en el pico (mismos dos puntos que el Max DD %). Siempre negativo.'},
                                {h:'Cap.inv€',t:'Capital total invertido en este activo a lo largo del backtest: suma del capital de entrada de todas sus operaciones ejecutadas.'},
                                {h:'Cap.inv%',t:'Ocupación media del capital: porcentaje medio diario del capital total desplegado en posiciones abiertas. 100% = todo el capital invertido todos los días.'},
                                {h:'T.inv%',t:'Tiempo en mercado: porcentaje de días del período con al menos una posición abierta (estrategia) o con ese activo en cartera (por activo).'},
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
                              const lastC=r.result.compoundCurve?.slice(-1)[0]?.value||capIni
                              const firstC=r.result.compoundCurve?.[0]?.value||capIni
                              const fd=r.result.startDate?new Date(r.result.startDate):null
                              const ld=r.result.compoundCurve?.slice(-1)[0]?.date?new Date(r.result.compoundCurve.slice(-1)[0].date):new Date()
                              // Modo rango: usar siempre las fechas del usuario (fd/ld son del span completo de datos)
                              const anios=mcPeriodMode==='range'&&mcFromDate&&mcToDate
                                ?(new Date(mcToDate)-new Date(mcFromDate))/(365.25*24*3600*1000)
                                :fd&&ld?(ld-fd)/86400000/365.25
                                :mcYears
                              const cagrC=(Math.pow(Math.max(lastC,0.01)/Math.max(firstC,0.01),1/Math.max(anios,0.01))-1)*100
                              const grossWin=wins.reduce((s,t)=>s+(t.pnlSimple||0),0)
                              const grossLoss=Math.abs(losses.reduce((s,t)=>s+(t.pnlSimple||0),0))
                              const pf=grossLoss>0?grossWin/grossLoss:grossWin>0?99:0
                              const profit=lastC-capIni
                              const profitPct=capIni>0?profit/capIni*100:0
                              const sc=r.result.slotCapital||capIni
                              const rStats=r.result.assetStats||[]
                              const avgCapInv=r.result.avgCapOccupancy??(rStats.length?rStats.reduce((s,a)=>s+(a.capInvMedio||0),0)/rStats.length:0)
                              const avgTInv=r.result.tInvEstrategia??(rStats.length?rStats.reduce((s,a)=>s+(a.tInvertido||0),0)/rStats.length:0)
                              return(
                                <Fragment key={r.id}>
                                  {/* ── Fila madre (estrategia) ── */}
                                  <tr
                                    onClick={()=>setMcAssetOpen(v=>({...v,[r.id]:!isOpen}))}
                                    style={{borderBottom:'1px solid rgba(255,255,255,0.04)',
                                      background:r.color+'14',
                                      cursor:'pointer'}}>
                                    <td style={{padding:'5px 6px'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                                        <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:8,flexShrink:0}}>{isOpen?'▼':'▶'}</span>
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
                                      const totalDesc=(ss.descartadasPorSlots||0)+(ss.descartadasPorCapital||0)+(ss.descartadasPorRiesgo||0)
                                      const tip=totalDesc===0
                                        ? [
                                            `Señales generadas: ${ss.generadas}`,
                                            `Ejecutadas: ${ss.ejecutadas} (100%)`,
                                            `Descartadas: 0`,
                                            ``,
                                            `Este modo ejecuta el 100% de las señales por construcción.`,
                                          ].join('\n')
                                        : [
                                            `Señales generadas: ${ss.generadas}`,
                                            `Ejecutadas: ${ss.ejecutadas} (${pct}%)`,
                                            ss.descartadasPorSlots>0?`Descartadas — slots llenos: ${ss.descartadasPorSlots}`:null,
                                            ss.descartadasPorRiesgo>0?`Descartadas — riesgo acum.: ${ss.descartadasPorRiesgo}`:null,
                                            ss.descartadasPorCapital>0?`Descartadas — sin capital: ${ss.descartadasPorCapital}`:null,
                                            ss.winRateDescartadas!=null?`WR descartadas: ${ss.winRateDescartadas.toFixed(1)}%`:null,
                                            ss.pfDescartadas!=null?`PF descartadas: ${ss.pfDescartadas.toFixed(2)}x`:null,
                                            ss.pnlHipoteticoDescartadas!=null?`€P&L hipotético descartadas: ~${ss.pnlHipoteticoDescartadas>=0?'+':'-'}€${Math.round(Math.abs(ss.pnlHipoteticoDescartadas)).toLocaleString('es-ES')} (estimación)`:null,
                                            ``,
                                            `Estimación calculada con el capital que habría tocado a cada señal en su momento. No considera el efecto cascada de haberlas ejecutado.`,
                                          ].filter(Boolean).join('\n')
                                      return(<span style={{display:'flex',alignItems:'center',gap:4}}>
                                        <span>{allT.length}</span>
                                        <span title={tip} style={{fontSize:9,color:is100?'#00e5a0':'#ff9f43',cursor:'help',fontWeight:400,background:is100?'rgba(0,229,160,0.08)':'rgba(255,159,67,0.12)',borderRadius:2,padding:'1px 4px'}}>{pct}%</span>
                                      </span>)
                                    })()}</td>
                                    <td style={{padding:'5px 6px',color:cagrC>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(cagrC,2,'%')}</td>
                                    <td style={{padding:'5px 6px',color:profit>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(profit,0,'€')}</td>
                                    <td style={{padding:'5px 6px',color:profitPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(profitPct,1,'%')}</td>
                                    <td style={{padding:'5px 6px',color:winRate>=50?'#00e5a0':'#ff4d6d',fontWeight:600}}>{fmt(winRate,1,'%')}</td>
                                    <td style={{padding:'5px 6px',color:pf>=1.5?'#00e5a0':pf>=1?'#ffd166':'#ff4d6d',fontWeight:600}}>{fmt(pf,2,'x')}</td>
                                    <td style={{padding:'5px 6px',color:'#ff4d6d',fontWeight:600}}>-{fmt(r.result.maxDDFloatCompound||r.result.maxDDCompound||0,1,'%')}</td>
                                    <td style={{padding:'5px 6px',color:'#ff4d6d',fontWeight:600}}>{(()=>{const e=r.result.maxDDFloatCompound?r.result.maxDDFloatCompoundEur:r.result.maxDDCompound?r.result.maxDDCompoundEur:0;return e?'-€'+Math.round(Math.abs(e)).toLocaleString('es-ES'):'€0'})()}</td>
                                    <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                                    <td style={{padding:'5px 6px',color:'#00d4ff',fontWeight:600}}>{fmt(avgCapInv,1,'%')}</td>
                                    <td style={{padding:'5px 6px',color:'#00d4ff',fontWeight:600}}>{fmt(avgTInv,1,'%')}</td>
                                  </tr>
                                  {/* ── Subfilas (activos) ── */}
                                  {isOpen&&rStats.map(a=>{
                                    const startMs=r.result.startDate?new Date(r.result.startDate).getTime():0
                                    const lastCurveDate=r.result.compoundCurve?.slice(-1)[0]?.date
                                    const endMs=lastCurveDate?new Date(lastCurveDate).getTime():Date.now()
                                    const yrs=startMs>0
                                      ?(endMs-startMs)/(365.25*24*3600*1000)
                                      :mcPeriodMode==='range'&&mcFromDate&&mcToDate
                                        ?(new Date(mcToDate)-new Date(mcFromDate))/(365.25*24*3600*1000)
                                        :mcYears
                                    // En concentrado, usar capital medio real por trade (no slotCapital=capitalIni/n)
                                    // para evitar denominador incorrecto en G.Comp% y CAGR
                                    const capBase=(r.result.modoAsig==='concentrado'&&a.avgCapAsignado)?a.avgCapAsignado:sc
                                    const ganPct=capBase>0?(a.ganComp/capBase)*100:0
                                    const cagr=capBase>0&&yrs>0?(Math.pow(Math.max((capBase+a.ganComp)/capBase,0.001),1/yrs)-1)*100:0
                                    const assetTrades=allT.filter(t=>t.symbol===a.symbol)
                                    const sumWin=assetTrades.filter(t=>t.pnlSimple>0).reduce((s,t)=>s+t.pnlSimple,0)
                                    const sumLoss=assetTrades.filter(t=>t.pnlSimple<0).reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
                                    const fBenef=sumLoss>0?sumWin/sumLoss:(sumWin>0?999:0)
                                    const maxDD=a.maxDD||0
                                    return(
                                      <tr key={a.symbol}
                                        style={{borderBottom:'1px solid rgba(255,255,255,0.02)',cursor:'pointer',
                                          background:'rgba(0,0,0,0.12)'}}
                                        onClick={()=>{setSimbolo(a.symbol);setSidePanel('watchlist')}}
                                        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                                        onMouseOut={e=>e.currentTarget.style.background='rgba(0,0,0,0.12)'}>
                                        <td style={{padding:'4px 6px 4px 22px',color:'var(--accent)',borderLeft:`2px solid ${r.color}`}}>{a.symbol}</td>
                                        <td style={{padding:'4px 6px',color:'var(--text)'}}>{a.trades}</td>
                                        <td style={{padding:'4px 6px',color:isFinite(cagr)?cagr>=0?'#00e5a0':'#ff4d6d':'#4a6a88'}}>{isFinite(cagr)?fmt(cagr,2,'%'):'—'}</td>
                                        <td style={{padding:'4px 6px',color:a.ganComp>=0?'#00e5a0':'#ff4d6d'}}>{fmt(a.ganComp,0,'€')}</td>
                                        <td style={{padding:'4px 6px',color:ganPct>=0?'#00e5a0':'#ff4d6d'}}>{fmt(ganPct,1,'%')}</td>
                                        <td style={{padding:'4px 6px',color:a.winRate>=50?'#00e5a0':'#ff4d6d'}}>{fmt(a.winRate,1,'%')}</td>
                                        <td style={{padding:'4px 6px',color:fBenef>=1.5?'#00e5a0':fBenef>=1?'#ffd166':'#ff4d6d'}}>{fmt(fBenef,2,'x')}</td>
                                        <td style={{padding:'4px 6px',color:'#ff4d6d'}}>{maxDD>0?'-'+fmt(maxDD,2,'%'):'0,00%'}</td>
                                        <td style={{padding:'4px 6px',color:'#ff4d6d'}}>{a.maxDDEur<0?'-€'+Math.round(Math.abs(a.maxDDEur)).toLocaleString('es-ES'):'€0'}</td>
                                        <td style={{padding:'4px 6px',color:'#7ab3cc'}}>{a.capInvertidoTotal!=null?fmt(a.capInvertidoTotal,0,'€'):'—'}</td>
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
                                        <span style={{fontFamily:MONO,fontSize:9,color:'#4a6a88',marginLeft:2}}>{bhStats.length} activos</span>
                                      </div>
                                    </td>
                                    <td style={{padding:'5px 6px',color:'#a0b4c8'}}>{bhStats.length}</td>
                                    <td style={{padding:'5px 6px',color:bhCagr>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhCagr,2,'%')}</td>
                                    <td style={{padding:'5px 6px',color:bhProfit>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhProfit,0,'€')}</td>
                                    <td style={{padding:'5px 6px',color:bhProfitPct>=0?'#a0b4c8':'#ff4d6d',fontWeight:600}}>{fmt(bhProfitPct,1,'%')}</td>
                                    <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                                    <td style={{padding:'5px 6px',color:'#4a6a88'}}>—</td>
                                    <td style={{padding:'5px 6px',color:'#ff9a3c',fontWeight:600}}>-{fmt(mcResult.maxDDBH||0,1,'%')}</td>
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
                                    const bhCagrYears=mcPeriodMode==='range'&&mcFromDate&&mcToDate
                                      ?(new Date(mcToDate)-new Date(mcFromDate))/(365.25*24*3600*1000)
                                      :mcResult.startDate?(bhEndMs-new Date(mcResult.startDate).getTime())/(365.25*24*3600*1000)
                                      :5
                                    const bhCagr=sc>0&&bhCagrYears>0?(Math.pow((sc+ganBH)/sc,1/bhCagrYears)-1)*100:0
                                    return(
                                      <tr key={a.symbol}
                                        style={{borderBottom:'1px solid rgba(255,255,255,0.02)',cursor:'pointer',
                                          background:'rgba(160,180,200,0.02)'}}
                                        onClick={()=>{setSimbolo(a.symbol);setSidePanel('watchlist')}}
                                        onMouseOver={e=>e.currentTarget.style.background='rgba(160,180,200,0.06)'}
                                        onMouseOut={e=>e.currentTarget.style.background='rgba(160,180,200,0.02)'}>
                                        <td style={{padding:'4px 6px 4px 22px',color:'#a0b4c8',borderLeft:'2px solid #a0b4c888'}}>{a.symbol}</td>
                                        <td style={{padding:'4px 6px',color:'#a0b4c8'}}>1</td>
                                        <td style={{padding:'4px 6px',color:bhCagr>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(bhCagr,2,'%')}</td>
                                        <td style={{padding:'4px 6px',color:ganBH>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(ganBH,0,'€')}</td>
                                        <td style={{padding:'4px 6px',color:ganBHPct>=0?'#a0b4c8':'#ff4d6d'}}>{fmt(ganBHPct,1,'%')}</td>
                                        <td style={{padding:'4px 6px',color:'#4a6a88'}}>—</td>
                                        <td style={{padding:'4px 6px',color:'#4a6a88'}}>—</td>
                                        <td style={{padding:'4px 6px',color:'#ff9a3c'}}>{a.priceMaxDD>0?'-'+fmt(a.priceMaxDD,2,'%'):'—'}</td>
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

                {/* ── Equity — misma estructura que activos individuales ── */}
                <div className="equity-section" data-chart="equity">
                  <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                    <span>Equity</span>
                    {mcMultiResults.length>1?(
                      <>
                        {mcMultiResults.map(r=>(
                          <button key={r.id} onClick={()=>setMcStratVisible(v=>({...v,[r.id]:!v[r.id]}))}
                            style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcStratVisible[r.id]!==false?r.color:'#3d5a7a'}`,
                              background:mcStratVisible[r.id]!==false?`${r.color}18`:'transparent',
                              color:mcStratVisible[r.id]!==false?r.color:'#3d5a7a',
                              ...(mcIsModoCompare?{}:{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})}}>
                            {mcIsModoCompare?r.name.split(' · ').pop():r.name}
                          </button>
                        ))}
                        {mcResult.bhCurve?.length>0&&(
                          <button onClick={()=>setMcShowBHCompare(s=>!s)}
                            style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcShowBHCompare?'#a0b4c8':'#3d5a7a'}`,
                              background:mcShowBHCompare?'rgba(160,180,200,0.12)':'transparent',
                              color:mcShowBHCompare?'#a0b4c8':'#3d5a7a'}}>
                            B&H Diversif.
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
                        {key:'simple',  label:'Simple',           color:'#00d4ff',state:mcShowSimple,  set:setMcShowSimple},
                        {key:'compound',label:'Compuesto',        color:'#00e5a0',state:mcShowCompound,set:setMcShowCompound},
                        {key:'bh',      label:'B&H Diversificado',color:'#a0b4c8',state:mcShowBH,      set:setMcShowBH},
                        {key:'sp500',   label:'B&H SP500',        color:'#9b72ff',state:mcShowSP500,   set:setMcShowSP500},
                        {key:'fl',      label:'Flotante',         color:'#ff9a3c',state:showMultiFloat, set:setShowMultiFloat},
                      ].map(({key,label,color,state,set})=>(
                        <button key={key} onClick={()=>set(s=>!s)}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                            border:`1px solid ${state?color:'#3d5a7a'}`,background:state?`${color}18`:'transparent',color:state?color:'#3d5a7a'}}>
                          {label}
                        </button>
                      ))
                    )}
                    <button onClick={()=>mcChartApiRef.current?.fitAll()}
                      style={{marginLeft:'auto',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(0,212,255,0.07)',color:'#7a9bc0',flexShrink:0}}
                      title="Ver periodo completo">⊠ Periodo completo</button>
                  </div>
                  {mcMultiResults.length>1?(
                    <StratCompareChart
                      curves={[
                        ...mcMultiResults.map(r=>({
                          id:r.id,name:r.name,color:r.color,
                          data:(showMultiFloat&&r.result.floatCompoundCurve?.length)?r.result.floatCompoundCurve:r.result.compoundCurve,
                          show:mcStratVisible[r.id]!==false,
                          maxDD:showMultiFloat?(r.result.maxDDFloatCompound||0):(r.result.maxDDCompound||0),
                          maxDDDate:showMultiFloat?r.result.maxDDFloatCompoundDate:r.result.maxDDCompoundDate,
                        })),
                        ...(mcResult.bhCurve?.length>0?[{
                          id:'__bh__',name:'B&H Diversificado',color:'#a0b4c8',
                          data:mcResult.bhCurve,
                          show:mcShowBHCompare,
                          dashed:true,
                          maxDD:mcResult.maxDDBH||0,
                          maxDDDate:mcResult.maxDDBHDate||null,
                        }]:[])
                      ]}
                      capitalIni={Number(mcCapitalIni||capitalIni)}
                      showMaxDD={mcShowMaxDD}
                      onReady={api=>{mcChartApiRef.current=api}}
                      onAxisWidth={w=>setMcAxisW(prev=>Math.abs(prev-w)>0.5?w:prev)}
                      syncRef={chartSyncRef}
                      chartHeight={mcEquityH}
                    />
                  ):(
                    <MultiCartChart
                      simpleCurve={mcResult.simpleCurve}
                      compoundCurve={mcResult.compoundCurve}
                      bhCurve={mcResult.bhCurve}
                      sp500BHCurve={mcResult.sp500BHCurve||[]}
                      capitalIni={Number(mcCapitalIni||capitalIni)}
                      maxDDSimple={mcResult.maxDDSimple}   maxDDSimpleDate={mcResult.maxDDSimpleDate}
                      maxDDCompound={mcResult.maxDDCompound} maxDDCompoundDate={mcResult.maxDDCompoundDate}
                      maxDDBH={mcResult.maxDDBH}           maxDDBHDate={mcResult.maxDDBHDate}
                      maxDDSP500={mcResult.maxDDSP500||0}  maxDDSP500Date={mcResult.maxDDSP500Date||null}
                      floatSimpleCurve={mcResult.floatSimpleCurve||[]}
                      floatCompoundCurve={mcResult.floatCompoundCurve||[]}
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
                  <div onMouseDown={e=>{mcEquityResizing.current=true;mcEquityStartY.current=e.clientY;mcEquityStartH.current=mcEquityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                    style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                      borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                  </div>
                </div>

                {/* ── Ganancias mensuales MC ── */}
                {(()=>{
                  const capIniNum=Number(mcCapitalIni||capitalIni)
                  let mSeries=mcMultiResults.length>0
                    ?mcMultiResults.filter(r=>mcStratVisible[r.id]!==false).map(r=>({
                        id:r.id,name:mcIsModoCompare?r.name.split(' · ').pop():r.name,
                        color:r.color,compoundCurve:r.result.compoundCurve}))
                    :[{id:'single',name:'Estrategia',color:'#00e5a0',compoundCurve:mcResult.compoundCurve}]
                  // Añadir B&H cuando su toggle está activo
                  if(mcMultiResults.length>1&&mcShowBHCompare&&mcResult.bhCurve?.length)
                    mSeries=[...mSeries,{id:'__bh__',name:'B&H Diversif.',color:'#a0b4c8',compoundCurve:mcResult.bhCurve}]
                  else if(mcMultiResults.length===0&&mcShowBH&&mcResult.bhCurve?.length)
                    mSeries=[...mSeries,{id:'__bh__',name:'B&H Diversif.',color:'#a0b4c8',compoundCurve:mcResult.bhCurve}]
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
                    </div>
                    <div style={{width:'calc(100% - 21px)',marginLeft:0}}>
                    <McOccupancyChart
                      series={mcMultiResults.length>0
                        ?mcMultiResults.filter(r=>mcStratVisible[r.id]!==false).map(r=>({
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
                {mcMultiResults.length>1
                  ? (mcMultiResults.some(r=>mcStratVisible[r.id]!==false&&r.result.allTrades?.length>0)&&(
                      <div className="equity-section">
                        <div className="section-title" style={{fontSize:14}}>Resultados por Operación</div>
                        {mcMultiResults
                          .filter(r=>mcStratVisible[r.id]!==false)
                          .map(r=>{
                            const trades=r.result.allTrades||[]
                            if(!trades.length) return null
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
                                <div className="equity-bars">
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
                        <div className="equity-bars">
                          {(()=>{
                            const allT=mcResult.allTrades||[]
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
                  const isMultiHist=mcMultiResults.length>1
                  const histResult=isMultiHist&&mcHistStratId
                    ?(mcMultiResults.find(r=>r.id===mcHistStratId)?.result??mcResult)
                    :mcResult
                  const histTitle=isMultiHist&&mcHistStratId
                    ?(mcMultiResults.find(r=>r.id===mcHistStratId)?.name??'Historial')
                    :'Historial Multicartera'
                  if(!histResult?.allTrades?.length) return null
                  // Botones Exportar/Gantt — deshabilitados si modo multi sin estrategia seleccionada
                  const histBtnsDisabled=isMultiHist&&!mcHistStratId
                  const histBtnTitle=histBtnsDisabled?'Selecciona una estrategia en el historial':''
                  // handleRequestDiscarded para el Gantt de este historial
                  const handleGanttDiscarded=async()=>{
                    setGanttLoadingDisc(true)
                    try{
                      const allTH=histResult.allTrades||[]
                      const _mcYears=mcPeriodMode==='years'?mcYears:null
                      const _mcFrom=mcPeriodMode==='range'?mcFromDate:null
                      const _mcTo=mcPeriodMode==='range'?mcToDate:null
                      const unlimCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
                        fromDate:_mcFrom,toDate:_mcTo,tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),
                        sinPerdidas,reentry,tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),
                        tipoCapital:mcCapital,
                        sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,maxPosiciones:9999}}
                      const sid=(mcStratSelected.filter(Boolean)[0])||currentStratId||null
                      const strat=strategies.find(s=>s.id===sid)
                      const isNoStrategyG=(strat?.name||'').includes('No Strategy')
                      const weightsNorm={}
                      if(mcMode==='custom'){
                        const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
                        mcSelected.forEach(sym=>{weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length})
                      }
                      const res=await apiFetch('/api/multibacktest',{method:'POST',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({symbols:mcSelected,modoAsig:histResult.modoAsig==='concentrado'?'concentrado':'compartido',
                          weights:weightsNorm,cfg:unlimCfg,strategyId:sid,isNoStrategy:isNoStrategyG,filtros,intervalo:mcIntervalo})})
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
                      const _mcYears=mcPeriodMode==='years'?mcYears:null
                      const _mcFrom=mcPeriodMode==='range'?mcFromDate:null
                      const _mcTo=mcPeriodMode==='range'?mcToDate:null
                      const baseCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
                        fromDate:_mcFrom,toDate:_mcTo,tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),
                        sinPerdidas,reentry,tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),
                        tipoCapital:mcCapital,
                        sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,maxPosiciones:mcMaxPosiciones}}
                      const sid=(mcStratSelected.filter(Boolean)[0])||currentStratId||null
                      const strat=strategies.find(s=>s.id===sid)
                      const stratName=strat?.name||'estrategia'
                      if(mcShowGantt){
                        // Vista Gantt → exportar diagrama semanal
                        exportGantt({mcResult:histResult,mcSelected,baseCfg,stratName,discardedTrades:ganttDiscarded})
                      }else{
                        // Vista tabla → exportar historial de trades
                        exportHistorial({mcResult:histResult,mcSelected,baseCfg,stratName})
                      }
                    }catch(e){alert('Error al exportar: '+e.message)}
                    finally{setMcExporting(false)}
                  }
                  const ganttEndD=histResult.compoundCurve?.slice(-1)[0]?.date||histResult.bhCurve?.slice(-1)[0]?.date||new Date().toISOString().split('T')[0]
                  return(
                  <div className="trades-section">
                    <div className="section-title" style={{display:'flex',flexDirection:'column',gap:6,fontSize:14}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span>{histTitle} — {histResult.allTrades.length} operaciones
                          <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}> · clic activo → ver gráfico</span>
                        </span>
                        <div style={{display:'flex',gap:4,marginLeft:'auto',alignItems:'center',flexWrap:'wrap'}}>
                          {!mcShowGantt&&<input value={mcTradeFilter} onChange={e=>setMcTradeFilter(e.target.value)}
                            placeholder="Filtrar activo…"
                            style={{fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:3,
                              background:'#0d1828',border:'1px solid #274462',color:'#e8f4ff',width:110}}/>}
                          <button
                            disabled={histBtnsDisabled||mcExporting}
                            title={histBtnTitle||(mcShowGantt?'Exportar Gantt semanal a Excel (.xlsx)':'Exportar historial de trades a Excel (.xlsx)')}
                            onClick={handleExport}
                            style={{padding:'2px 8px',fontFamily:MONO,fontSize:10,
                              background:mcExporting?'#1a2d45':'transparent',
                              color:(histBtnsDisabled||mcExporting)?'#3d5a7a':'#00d4ff',
                              border:'1px solid #1a3a5c',borderRadius:3,
                              cursor:(histBtnsDisabled||mcExporting)?'not-allowed':'pointer',
                              opacity:(histBtnsDisabled||mcExporting)?0.5:1,flexShrink:0}}
                          >{mcExporting?'⏳':'📊'} Exportar</button>
                          <button
                            disabled={histBtnsDisabled}
                            title={histBtnTitle||(mcShowGantt?'Volver a la tabla':'Mostrar Gantt de operaciones')}
                            onClick={()=>{if(!histBtnsDisabled){setMcShowGantt(s=>!s)}}}
                            style={{padding:'2px 8px',fontFamily:MONO,fontSize:10,
                              background:mcShowGantt?'rgba(0,212,255,0.1)':'transparent',
                              color:histBtnsDisabled?'#3d5a7a':mcShowGantt?'#00d4ff':'#7a9bc0',
                              border:`1px solid ${mcShowGantt?'#00d4ff':'#1a3a5c'}`,
                              borderRadius:3,cursor:histBtnsDisabled?'not-allowed':'pointer',
                              opacity:histBtnsDisabled?0.5:1,flexShrink:0}}
                          >{mcShowGantt?'← Tabla':'📅 Gantt'}</button>
                        </div>
                      </div>
                      {isMultiHist&&(
                        <div style={{display:'flex',gap:3,alignItems:'center',flexWrap:'wrap'}}>
                          {mcMultiResults.map(r=>{
                            const isAct=mcHistStratId===r.id
                            return(
                              <button key={r.id} onClick={()=>setMcHistStratId(isAct?null:r.id)}
                                style={{fontSize:9,padding:'2px 8px',borderRadius:3,cursor:'pointer',
                                  border:`1px solid ${isAct?r.color:'#3d5a7a'}`,
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
                        <GanttChart
                          trades={histResult.allTrades||[]}
                          startDate={histResult.startDate}
                          endDate={ganttEndD}
                          slotCapital={histResult.slotCapital}
                          onRequestDiscarded={handleGanttDiscarded}
                          discardedTrades={ganttDiscarded}
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
                            const allT2=(mcTradeFilter
                              ?histResult.allTrades.filter(t=>(t.symbol||'').toUpperCase().includes(mcTradeFilter.toUpperCase()))
                              :histResult.allTrades)
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
                {/* ── Vista de gráficos — una o varias estrategias ── */}
                {mcResult&&(()=>{
                  const MAX_SYMS=10,MAX_STRATS=3
                  const isMulti=mcMultiResults.length>1
                  // Estrategias efectivas: multi-run o estrategia activa única
                  const strats=isMulti
                    ? mcMultiResults.slice(0,MAX_STRATS).filter(r=>mcChartsStratVisible[r.id]!==false)
                    : [{
                        id:currentStratId||'__single__',
                        name:stratName||'Estrategia',
                        color:STRAT_COMPARE_COLORS[0],
                        result:mcResult
                      }]
                  const syms=mcSelected.slice(0,MAX_SYMS)
                  const overLimit=mcSelected.length>MAX_SYMS||(isMulti&&mcMultiResults.length>MAX_STRATS)
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
                            {(isMulti?mcMultiResults.slice(0,MAX_STRATS):[{id:currentStratId||'__single__',name:stratName||'Estrategia',color:STRAT_COMPARE_COLORS[0]}]).map(r=>{
                              const on=mcChartsStratVisible[r.id]!==false
                              return(
                                <button key={r.id}
                                  onClick={()=>isMulti&&setMcChartsStratVisible(v=>({...v,[r.id]:!on}))}
                                  style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:isMulti?'pointer':'default',
                                    border:`1px solid ${on?r.color:'#3d5a7a'}`,
                                    background:on?`${r.color}18`:'transparent',
                                    color:on?r.color:'#3d5a7a',
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
                                entries:symTrades.map(t=>({date:t.entryDate,price:t.entryPx})),
                                exits:symTrades.map(t=>({date:t.exitDate,price:t.exitPx})),
                                trades:symTrades.map((t,idx)=>({
                                  n:idx+1,
                                  entryDate:t.entryDate,entryPx:t.entryPx,
                                  exitDate:t.exitDate,exitPx:t.exitPx,
                                  pnlPct:t.pnlPct,pnlSimple:t.pnlSimple,
                                  capital:t.pnlPct!==0?Math.abs(t.pnlSimple/(t.pnlPct/100)):0,
                                })),
                              }
                            })
                            return(
                              <AssetSignalChart key={sym} symbol={sym}
                                stratSignals={stratSignals}
                                years={Number(years)||5}
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
                    {/* Search — solo visible en pestaña Operaciones */}
                    {tlTab==='ops'&&<div style={{display:'flex',gap:4,alignItems:'center',padding:'4px 8px',borderRight:'1px solid var(--border)',flexShrink:0}}>
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
                        {tlTradesFiltered.length}
                      </span>
                      {tlLoading&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',flexShrink:0}}>⟳</span>}
                    </div>}
                    {[{id:'dashboard',label:'📊 Dashboard'},{id:'ops',label:'📋 Operaciones'},{id:'import',label:'📥 Import'},{id:'capital',label:'💰 Capital'},{id:'export',label:'💾 Backup'}].map(t=>(
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
                    {tlTab==='ops'&&<div style={{display:'flex',gap:6,alignItems:'center',padding:'5px 10px'}}>
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
                          <button onClick={()=>{setTlBulkMode(v=>!v);setTlBulkSel(new Set());setTlBulkStrat('')}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'3px 10px',borderRadius:3,cursor:'pointer',
                              background:tlBulkMode?'rgba(0,212,255,0.15)':'transparent',
                              border:'1px solid '+(tlBulkMode?'#00d4ff':'#1a2d45'),
                              color:tlBulkMode?'#00d4ff':'#4a6a88',whiteSpace:'nowrap'}}>
                            ☑ Set strategy
                          </button>
                          <button onClick={()=>setTlMultiMode(true)}
                            title="Selección múltiple para borrar"
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                              background:'transparent',border:'1px solid #2a3040',color:'#4a6a80',whiteSpace:'nowrap'}}>
                            🗑
                          </button>
                          <button onClick={()=>setTlShowFxCols(v=>!v)}
                            title={tlShowFxCols?'Ocultar columnas FX Impact':'Mostrar columnas FX Impact'}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                              background:tlShowFxCols?'rgba(255,209,102,0.15)':'transparent',
                              border:'1px solid '+(tlShowFxCols?'#ffd166':'#2a3040'),
                              color:tlShowFxCols?'#ffd166':'#4a6a80',whiteSpace:'nowrap',fontWeight:tlShowFxCols?700:400}}>
                            FX±
                          </button>
                          {(()=>{
                            const expandable=tlTradesFiltered.filter(t=>(t._buyFills||[]).length+(t._sellFills||[]).length>0)
                            const anyExp=expandable.some(t=>tlExpandedTrades.has(t.id))
                            return expandable.length>0&&(
                              <button
                                onClick={()=>anyExp
                                  ?setTlExpandedTrades(new Set())
                                  :setTlExpandedTrades(new Set(expandable.map(t=>t.id)))}
                                title={anyExp?'Colapsar todos los fills':'Expandir todos los fills'}
                                style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                                  background:anyExp?'rgba(0,212,255,0.12)':'transparent',
                                  border:'1px solid '+(anyExp?'#00d4ff':'#2a3040'),
                                  color:anyExp?'#00d4ff':'#4a6a80',whiteSpace:'nowrap'}}>
                                {anyExp?'▼ Colapsar':'▶ Expandir'}
                              </button>
                            )
                          })()}
                          <button onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.currency&&_df.currency!=='EUR')tlFetchFx(_df.currency,_df.date)}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 12px',borderRadius:4,cursor:'pointer',
                              background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700,whiteSpace:'nowrap'}}>
                            + Nueva op.
                          </button>
                        </>
                      )}
                    </div>}
                  </div>
                  {/* ── Contenido por tab ── */}
                  {(tlTab==='ops'||tlTab==='open')&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

                    {/* Bulk strategy bar */}
                    {tlBulkMode&&tlBulkSel.size>0&&(()=>{
                      const stratOpts_=[...new Set((tlTrades||[]).map(t=>t.strategy||'').filter(Boolean))].sort()
                      const bulkStratOpts_=['Unspecified',...new Set([...(strategies||[]).map(s=>s.name).filter(Boolean),...(stratOpts_||[]).filter(Boolean)])].sort((a,b)=>a==='Unspecified'?-1:b==='Unspecified'?1:a.localeCompare(b))
                      return(
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'rgba(0,212,255,0.05)',border:'1px solid rgba(0,212,255,0.2)',borderRadius:4,marginBottom:6,flexShrink:0}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#00d4ff'}}>{tlBulkSel.size} operación{tlBulkSel.size>1?'es':''} seleccionada{tlBulkSel.size>1?'s':''}</span>
                        <input list="bulk-strat-list" value={tlBulkStrat} onChange={e=>setTlBulkStrat(e.target.value)}
                          placeholder="Estrategia..."
                          style={{fontFamily:MONO,fontSize:10,background:'var(--bg2)',border:'1px solid #1a2d45',color:'#e2eaf5',padding:'3px 6px',borderRadius:3,width:160}}/>
                        <datalist id="bulk-strat-list">
                          {bulkStratOpts_.map(s=><option key={s} value={s}/>)}
                        </datalist>
                        <button disabled={false}
                          onClick={async()=>{
                            const trades=tlTradesFiltered.filter(t=>tlBulkSel.has(t.id))
                            await Promise.all(trades.map(async trade=>{
                              const firstBuy=tlTrades.find(f=>f.id===trade.entry_fill_id)||tlTrades.filter(f=>f.symbol===trade.symbol&&f.fill_type==='buy'&&f.date===trade.entry_date).sort((a,b)=>a.created_at?.localeCompare(b.created_at||'')||0)[0]
                              if(!firstBuy) return
                              return apiFetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:firstBuy.id,strategy:tlBulkStrat||null})})
                            }))
                            await loadTrades()
                            setTlBulkSel(new Set())
                            setTlBulkStrat('')
                            setTlBulkMode(false)
                          }}
                          style={{fontFamily:MONO,fontSize:10,background:'#00d4ff',color:'#000',border:'none',padding:'4px 10px',borderRadius:3,cursor:'pointer'}}>
                          {tlBulkStrat?'Aplicar':'Quitar estrategia'}
                        </button>
                        <button onClick={()=>{setTlBulkSel(new Set());setTlBulkMode(false)}}
                          style={{fontFamily:MONO,fontSize:10,background:'transparent',border:'1px solid #1a2d45',color:'#4a6a88',padding:'4px 8px',borderRadius:3,cursor:'pointer'}}>
                          Cancelar
                        </button>
                      </div>
                      )
                    })()}

                    {/* Tabla */}
                    <div style={{flex:1,overflowY:'auto'}}>
                      <table className="tl-ops-table" onContextMenu={e=>{e.stopPropagation();openCtx(e,'tl_table')}} style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11,textAlign:'center'}}>
                        <thead>
                          <tr style={{background:'var(--bg2)',position:'sticky',top:0,zIndex:5}}>
                            {tlBulkMode&&(
                              <th style={{padding:'0 6px',width:24,borderBottom:'1px solid var(--border)'}}>
                                <input type="checkbox"
                                  checked={tlBulkSel.size===tlTradesFiltered.length&&tlTradesFiltered.length>0}
                                  onChange={e=>setTlBulkSel(e.target.checked?new Set(tlTradesFiltered.map(t=>t.id)):new Set())}
                                  style={{cursor:'pointer',accentColor:'#00d4ff'}}
                                />
                              </th>
                            )}
                            <th style={{width:28,padding:'6px 4px',borderBottom:'1px solid var(--border)',cursor:tlMultiMode?'pointer':'default'}}
                              onClick={()=>{
                                if(!tlMultiMode) return
                                const allIds=tlTradesFiltered.flatMap(t=>[...(t._buyFills||[]),...(t._sellFills||[])].map(f=>f.id).filter(Boolean))
                                const allSel=allIds.length>0&&allIds.every(id=>tlMultiSel.has(id))
                                setTlMultiSel(allSel?new Set():new Set(allIds))
                              }}>
                              {tlMultiMode&&(()=>{
                                const allIds=tlTradesFiltered.flatMap(t=>[...(t._buyFills||[]),...(t._sellFills||[])].map(f=>f.id).filter(Boolean))
                                const allSel=allIds.length>0&&allIds.every(id=>tlMultiSel.has(id))
                                return <input type="checkbox" readOnly checked={allSel} style={{cursor:'pointer',width:12,height:12,pointerEvents:'none'}}/>
                              })()}
                            </th>
                            {['#','Symbol','Strategy','Broker','Entry','Exit','Shares','Px In','Capital','Px Out','Curr.','FX','Fee','P&L€','P&L%','Days','Status'].map(h=>(
                              <th key={h} style={{padding:'6px 8px',textAlign:'center',fontFamily:MONO,fontSize:9,color:'#3d5a7a',
                                letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                            {tlShowFxCols&&['FX €','FX %'].map(h=>(
                              <th key={h} style={{padding:'6px 8px',textAlign:'center',fontFamily:MONO,fontSize:9,color:'#b8860b',
                                letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',
                                background:'rgba(255,209,102,0.04)'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tlTradesFiltered.flatMap((trade,i)=>{
                            const isOpen=trade.status==='open'
                            const isOrphan=trade.status==='orphan'
                            const isExp=tlExpandedTrades.has(trade.id)
                            const pnl=isOpen?trade._pnl_float_eur:trade.pnl_eur
                            const pnlPct=isOpen?trade._pnl_float_pct:trade.pnl_pct
                            const today2=new Date().toISOString().slice(0,10)
                            const dias=trade.entry_date?(Math.round((new Date(isOpen?today2:trade.exit_date||today2)-new Date(trade.entry_date))/86400000)):null
                            const col=TL_COLORS[trade.broker]||'#7a9bc0'
                            const capEur=(()=>{const ep=parseFloat(trade.entry_price||0),sh=parseFloat(trade.shares||0);let fx=parseFloat(trade.fx_entry||1);if(fx<1&&fx>0)fx=1/fx;const cap=ep*sh;return(trade.currency&&trade.currency!=='EUR')?cap/fx:cap})()
                            const statusBg=isOrphan?'rgba(255,77,109,0.1)':isOpen?'rgba(155,114,255,0.12)':'rgba(0,229,160,0.1)'
                            const statusBorder=isOrphan?'rgba(255,77,109,0.3)':isOpen?'rgba(155,114,255,0.3)':'rgba(0,229,160,0.3)'
                            const statusColor=isOrphan?'#ff4d6d':isOpen?'#9b72ff':'#00e5a0'
                            const statusLabel=isOrphan?'Sin origen':isOpen?'Abierta':'Cerrada'
                            const rowBg=isOpen?'rgba(155,114,255,0.015)':'transparent'
                            const fills=[...(trade._buyFills||[]),...(trade._sellFills||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
                            const trFillIds=fills.map(f=>f.id).filter(Boolean)
                            const trAllSelected=trFillIds.length>0&&trFillIds.every(id=>tlMultiSel.has(id))
                            const toggleMultiRow=()=>{
                              const ids=trFillIds.length?trFillIds:[trade.id].filter(Boolean)
                              setTlMultiSel(prev=>{const n=new Set(prev);const allSel=ids.every(id=>n.has(id));ids.forEach(id=>allSel?n.delete(id):n.add(id));return n})
                            }
                            return[
                              <tr key={trade.id}
                                style={{borderBottom:'1px solid var(--border)',background:rowBg,cursor:'pointer'}}
                                onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                                onMouseOut={e=>e.currentTarget.style.background=rowBg}
                                onClick={()=>{if(tlMultiMode){toggleMultiRow()}else{if(fills.length)setTlExpandedTrades(prev=>{const n=new Set(prev);n.has(trade.id)?n.delete(trade.id):n.add(trade.id);return n})}}}>
                                {tlBulkMode&&(
                                  <td style={{padding:'0 6px',width:24}} onClick={e=>e.stopPropagation()}>
                                    <input type="checkbox"
                                      checked={tlBulkSel.has(trade.id)}
                                      onChange={e=>{setTlBulkSel(prev=>{const n=new Set(prev);e.target.checked?n.add(trade.id):n.delete(trade.id);return n})}}
                                      style={{cursor:'pointer',accentColor:'#00d4ff'}}
                                    />
                                  </td>
                                )}
                                {/* Expand / multiselect button */}
                                <td style={{padding:'6px 4px',textAlign:'center',width:28,cursor:'pointer'}}
                                  onClick={e=>{e.stopPropagation();if(tlMultiMode){toggleMultiRow()}else{if(fills.length)setTlExpandedTrades(prev=>{const n=new Set(prev);n.has(trade.id)?n.delete(trade.id):n.add(trade.id);return n})}}}>
                                  {tlMultiMode
                                    ?<input type="checkbox" readOnly checked={trAllSelected} style={{cursor:'pointer',width:12,height:12,pointerEvents:'none'}}/>
                                    :fills.length>0&&<span style={{fontSize:9,color:isExp?'#00d4ff':'#3d5a7a'}}>{isExp?'▼':'▶'}</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#3d5a7a',fontSize:10}}>{i+1}</td>
                                <td style={{padding:'6px 4px 6px 8px',maxWidth:100}} onClick={e=>e.stopPropagation()}>
                                  <span onClick={e=>{e.stopPropagation();window.open('https://www.tradingview.com/chart/?symbol='+tvSym(trade.symbol),'_blank')}}
                                    title={'Abrir '+trade.symbol+' en TradingView'}
                                    style={{fontWeight:700,color:isOpen?'#9b72ff':'#00d4ff',cursor:'pointer',
                                      textDecoration:'underline',textDecorationColor:'rgba(0,212,255,0.3)',textUnderlineOffset:2}}>
                                    {trade.symbol}
                                  </span>
                                  {trade._possibleSplit&&(
                                    <span title="Posible split detectado: las acciones vendidas superan las compradas. Revisa y ajusta el precio/cantidad manualmente."
                                      style={{fontFamily:MONO,fontSize:7,background:'rgba(255,165,0,0.15)',border:'1px solid orange',color:'orange',borderRadius:3,padding:'1px 4px',marginLeft:4,cursor:'default',verticalAlign:'middle'}}>
                                      Split?
                                    </span>
                                  )}
                                </td>
                                <td style={{padding:'6px 4px',maxWidth:90,overflow:'hidden'}}>
                                  <span style={{fontFamily:MONO,fontSize:9,color:'#5a8aaa',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}
                                    title={trade.strategy||'—'}>{trade.strategy||<span style={{color:'#2a4060'}}>—</span>}</span>
                                </td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:col+'18',border:'1px solid '+col+'44',color:col}}>
                                    {TL_LABEL[trade.broker]||trade.broker?.toUpperCase()||'—'}
                                  </span>
                                </td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{fmtDate(trade.entry_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{isOpen||isOrphan?<span style={{color:'#3d5a7a'}}>—</span>:fmtDate(trade.exit_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{parseFloat(trade.shares||0).toFixed(2)}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5',whiteSpace:'nowrap'}}>{isOrphan?<span style={{color:'#3d5a7a'}}>—</span>:parseFloat(trade.entry_price||0).toFixed(2)}</td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0',whiteSpace:'nowrap'}}>{capEur>0?'€'+Math.round(capEur).toLocaleString('es-ES'):'—'}</td>
                                <td style={{padding:'6px 8px',color:isOpen?'#9b72ff':'#e2eaf5',whiteSpace:'nowrap'}}>
                                  {trade.exit_price!=null?<>{parseFloat(trade.exit_price).toFixed(2)}</>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#ffd166',fontSize:10}}>{trade.currency||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(trade.fx_entry||0);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{parseFloat(trade.commission||0)>0?'€'+parseFloat(trade.commission).toFixed(2):'—'}</td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnl!=null?<span style={{color:pnl>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnl>=0?'+':''}{parseFloat(pnl).toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnlPct!=null?<span style={{color:pnlPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnlPct>=0?'+':''}{parseFloat(pnlPct).toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0'}}>{dias!=null?dias+'d':'—'}</td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:statusBg,border:'1px solid '+statusBorder,color:statusColor}}>
                                    {statusLabel}
                                  </span>
                                </td>
                                {tlShowFxCols&&(()=>{
                                  const fxE=parseFloat(trade.fx_entry||0)||1
                                  let fxImpEur=null
                                  if(isOpen&&!isOrphan&&trade.exit_price!=null&&trade.currency&&trade.currency!=='EUR'){
                                    const fxLive=tlLiveFx[trade.currency]
                                    if(fxLive>0) fxImpEur=parseFloat(trade.exit_price)*parseFloat(trade.shares||0)*(1/fxLive-1/fxE)
                                  } else if(!isOpen&&!isOrphan&&trade.exit_price!=null){
                                    const fxX=parseFloat(trade.fx_exit||trade.fx_entry||0)||fxE
                                    fxImpEur=parseFloat(trade.exit_price)*parseFloat(trade.shares||0)*(1/fxX-1/fxE)
                                  }
                                  const capE=parseFloat(trade.entry_price||0)*parseFloat(trade.shares||0)/fxE
                                  const fxImpPct=fxImpEur!=null&&capE>0?fxImpEur/capE*100:null
                                  const fxCellStyle={padding:'6px 8px',whiteSpace:'nowrap',background:'rgba(255,209,102,0.04)'}
                                  return(<>
                                    <td style={fxCellStyle}>
                                      {fxImpEur!=null?<span style={{color:fxImpEur>=0?'#ffd166':'#ff9944',fontWeight:600}}>{fxImpEur>=0?'+':''}{fxImpEur.toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                    </td>
                                    <td style={fxCellStyle}>
                                      {fxImpPct!=null?<span style={{color:fxImpPct>=0?'#ffd166':'#ff9944',fontWeight:600}}>{fxImpPct>=0?'+':''}{fxImpPct.toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                    </td>
                                  </>)
                                })()}
                              </tr>,
                              // ── Fills expandidos ──
                              isExp&&fills.length>0&&(
                                <tr key={trade.id+'-fills'}>
                                  <td colSpan={tlShowFxCols?20:18} style={{padding:0,background:'rgba(0,212,255,0.015)',borderBottom:'2px solid rgba(0,212,255,0.1)'}}>
                                    <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:10,textAlign:'center'}}>
                                      <thead>
                                        <tr style={{background:'rgba(0,212,255,0.04)'}}>
                                          <th style={{width:20,padding:'3px 4px'}}/>
                                          {['Tipo','Fecha','Acciones','Precio','Capital €','Comisión','Divisa','FX'].map(h=>(
                                            <th key={h} style={{padding:'3px 8px',color:'#2a4060',fontWeight:600,fontSize:8,
                                              letterSpacing:'0.08em',textTransform:'uppercase',textAlign:'center'}}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {fills.map(fill=>{
                                          const isBuy=fill.fill_type==='buy'
                                          let ffx=parseFloat(fill.fx||trade.fx_entry||1);if(ffx<1&&ffx>0)ffx=1/ffx
                                          const capF=(parseFloat(fill.price||0)*parseFloat(fill.shares||0))/((trade.currency&&trade.currency!=='EUR')?ffx:1)
                                          const firstBuyId=(trade._buyFills||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0]?.id
                                          const isFirstBuy=isBuy&&fill.id===firstBuyId
                                          return(
                                          <tr key={fill.id} style={{borderTop:'1px solid rgba(0,212,255,0.05)',cursor:'pointer'}}
                                            onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                                            onMouseOut={e=>e.currentTarget.style.background=''}
                                            onClick={e=>{e.stopPropagation();if(tlMultiMode){if(fill.id)setTlMultiSel(prev=>{const n=new Set(prev);n.has(fill.id)?n.delete(fill.id):n.add(fill.id);return n});return}const df=tlDefaultForm();setTlForm({...df,id:fill.id,fill_type:fill.fill_type||'buy',symbol:fill.symbol||trade.symbol||'',broker:fill.broker||df.broker,date:toDisplayDate(fill.date)||'',price:fill.price||'',shares:fill.shares||'',currency:fill.currency||'USD',commission:fill.commission||0,fx:fill.fx?String(fill.fx):'',fx_manual:!!fill.fx,notes:fill.notes||'',strategy:fill.strategy||df.strategy,import_source:fill.import_source||'manual',_isFirstBuy:isFirstBuy});setTlFormOpen(true)}}>
                                            <td style={{width:20,padding:'4px 4px',textAlign:'center'}}
                                              onClick={e=>{e.stopPropagation();if(tlMultiMode&&fill.id)setTlMultiSel(prev=>{const n=new Set(prev);n.has(fill.id)?n.delete(fill.id):n.add(fill.id);return n})}}>
                                              {tlMultiMode&&<input type="checkbox" readOnly checked={!!fill.id&&tlMultiSel.has(fill.id)} style={{cursor:'pointer',width:11,height:11,pointerEvents:'none'}}/>}
                                            </td>
                                            <td style={{padding:'4px 8px',textAlign:'center'}}>
                                              <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                                background:isBuy?'rgba(0,229,160,0.12)':'rgba(255,77,109,0.12)',
                                                color:isBuy?'#00e5a0':'#ff4d6d'}}>
                                                {isBuy?'▲ BUY':'▼ SELL'}
                                              </span>
                                            </td>
                                            <td style={{padding:'4px 8px',color:'#a8ccdf'}}>{fmtDate(fill.date)}</td>
                                            <td style={{padding:'4px 8px',color:'#e2eaf5'}}>{fill.shares}</td>
                                            <td style={{padding:'4px 8px',color:'#e2eaf5'}}>{parseFloat(fill.price||0).toFixed(2)}</td>
                                            <td style={{padding:'4px 8px',color:'#7a9bc0'}}>{capF>0?'€'+Math.round(capF).toLocaleString('es-ES'):'—'}</td>
                                            <td style={{padding:'4px 8px',color:'#4a7a95'}}>{parseFloat(fill.commission||0)>0?'€'+parseFloat(fill.commission).toFixed(2):'—'}</td>
                                            <td style={{padding:'4px 8px',color:'#ffd166',fontSize:10}}>{fill.currency||trade.currency||'—'}</td>
                                            <td style={{padding:'4px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(fill.fx||0);if(!fx||isNaN(fx))return'—';if(fx<1&&fx>0)fx=1/fx;return fx.toFixed(4)})()}</td>
                                          </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )
                            ]
                          })}
                        </tbody>
                      </table>
                      {!tlLoading&&tlTradesFiltered.length===0&&(
                        <div style={{padding:'40px',textAlign:'center',fontFamily:MONO,fontSize:12,color:'#3d5a7a'}}>
                          Sin operaciones registradas.{' '}
                          <span style={{color:'#9b72ff',cursor:'pointer'}} onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.currency&&_df.currency!=='EUR')tlFetchFx(_df.currency,_df.date)}}>
                            Añadir primera operación →
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* IMPORTAR */}
                {tlTab==='import'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'16px',gap:14,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>📥 Importar operaciones</div>
                    {/* Selector de modo — dos tarjetas */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      {[
                        {v:'csv',  icon:'📄', title:'CSV',
                         desc:'Sube un archivo CSV. Detección automática de formato, compatible con cualquier broker. Sin IA.'},
                        {v:'ai',   icon:'📋', title:'Texto / Portapapeles',
                         desc:'Pega cualquier texto o tabla copiada del broker o de un PDF. Interpretado con IA.'},
                      ].map(({v,icon,title,desc})=>{
                        const active=tlImportFormat===v
                        return(
                          <button key={v} onClick={()=>setTlImportFormat(v)}
                            style={{textAlign:'left',padding:'12px 14px',borderRadius:6,cursor:'pointer',
                              border:`1px solid ${active?'#9b72ff':'#1a2d45'}`,
                              background:active?'rgba(155,114,255,0.1)':'rgba(10,15,26,0.6)',
                              transition:'border-color 0.15s,background 0.15s',fontFamily:MONO}}>
                            <div style={{fontSize:18,marginBottom:5}}>{icon}</div>
                            <div style={{fontSize:12,fontWeight:700,color:active?'#d0aaff':'#c8dff5',marginBottom:4}}>{title}</div>
                            <div style={{fontSize:10,color:active?'#9b72ff':'#4a6a88',lineHeight:1.5}}>{desc}</div>
                          </button>
                        )
                      })}
                    </div>
                    {/* Sube archivo CSV */}
                    {tlImportFormat==='csv'&&(
                      <label style={{display:'flex',alignItems:'center',gap:8,fontFamily:MONO,fontSize:11,
                        color:'#7a9bc0',cursor:'pointer',padding:'6px 0'}}>
                        <span style={{padding:'4px 10px',borderRadius:4,border:'1px solid #1a3a5a',
                          background:'rgba(0,212,255,0.05)',color:'#00d4ff',fontSize:10,whiteSpace:'nowrap'}}>
                          📁 Subir archivo CSV
                        </span>
                        <span style={{color:'#3d5a7a',fontSize:10}}>o pega el contenido directamente abajo</span>
                        <input type="file" accept=".csv,.txt" style={{display:'none'}}
                          onChange={e=>{
                            const f=e.target.files?.[0]; if(!f) return
                            const r=new FileReader()
                            r.onload=ev=>setTlImportText(ev.target.result||'')
                            r.readAsText(f,'utf-8')
                            e.target.value=''
                          }}/>
                      </label>
                    )}
                    <textarea value={tlImportText} onChange={e=>setTlImportText(e.target.value)}
                      placeholder={tlImportFormat==='csv'
                        ? 'Pega aquí el contenido del CSV (IBKR, Degiro u otro broker)...'
                        : 'Pega aquí cualquier texto: historial del broker, tabla HTML, extracto de PDF... Ej: Compré 50 NVDA el 12/02/2025 a $485.20, comisión $1.50'}
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
                            <span style={{fontFamily:MONO,fontSize:9,color:'#5a7a95'}}>⛓ Agrupado · fills individuales al guardar</span>
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={()=>{setTlParsed([]);setTlParsedRaw([])}}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                                border:'1px solid #2a4060',background:'transparent',color:'#7a9bc0'}}>Cancelar</button>
                            <button onClick={()=>tlImportConfirm()}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,
                                cursor:'pointer',border:'1px solid #00e5a0',
                                background:'rgba(0,229,160,0.1)',color:'#00e5a0',fontWeight:700}}>
                              {(()=>{
                const valid=tlParsedRaw.filter(r=>!r._isDuplicate).length
                const dups=tlParsedRaw.filter(r=>r._isDuplicate).length
                if(dups>0) return `✓ Importar ${valid} fills · ⊘ ${dups} duplicada${dups!==1?'s':''} omitida${dups!==1?'s':''}`
                return `✓ Importar ${valid} fill${valid!==1?'s':''}`
              })()}
                            </button>
                          </div>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                          <thead><tr style={{background:'var(--bg2)'}}>
                            {['Tipo','Símbolo','Fecha','Acc.','Precio','Div.','FX','Broker','Com.','Estado','Cap. €',''].map(h=>(
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
                                      background:'rgba(0,229,160,0.15)',color:'#00e5a0',fontWeight:700}}>
                                      ▲ BUY
                                    </span>
                                  ):(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background:t.fill_type==='buy'?'rgba(0,229,160,0.15)':'rgba(255,77,109,0.15)',
                                      color:t.fill_type==='buy'?'#00e5a0':'#ff4d6d',fontWeight:700}}>
                                      {t.fill_type==='buy'?'▲ BUY':'▼ SELL'}
                                    </span>
                                  )}
                                  {isDup&&<span style={{fontSize:8,color:'#ff4d6d',marginLeft:4,display:'block'}}>⚠ Duplicada</span>}
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
                                            {o.shares} acc · ${o.entry_price} · {o.entry_date} · €{o.capital_eur}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </td>
                                {cell('entry_currency',t.entry_currency,'#ffd166')}
                                <td style={{padding:'3px 5px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(t.fx_entry);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                {cell('broker',t.broker)}
                                <td style={{padding:'3px 5px',color:'#7a9bc0',fontSize:10,textAlign:'right'}}>
                                  {(()=>{const c=(t.commission_buy||0)+(t.commission_sell||0);return c>0?c.toFixed(2):'—'})()}
                                </td>
                                <td style={{padding:'3px 5px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,
                                    background: t._isFullClose||t.status==='closed'?'rgba(0,229,160,0.1)':t.status==='sell_close'?'rgba(155,114,255,0.15)':t.status==='orphan'?'rgba(255,77,109,0.1)':t._isPartialClose?'rgba(255,209,102,0.15)':'rgba(255,209,102,0.1)',
                                    color: t._isFullClose||t.status==='closed'?'#00e5a0':t.status==='sell_close'?'#9b72ff':t.status==='orphan'?'#ff4d6d':t._isPartialClose?'#ffd166':'#ffd166'}}>
                                    {t._isFullClose||t.status==='closed'?'✓ Cerrada':t.status==='sell_close'?'↩ Cierre':t.status==='orphan'?'⊘ Sin origen':t._isPartialClose?'◑ Parcial':'○ Abierta'}
                                  </span>
                                </td>
                                <td style={{padding:'3px 5px',color:'#00d4ff'}}>{(()=>{
                                  const ep=parseFloat(t.entry_price||0),sh=parseFloat(t.shares||0)
                                  let fx=parseFloat(t.fx_entry||1);if(fx<1&&fx>0)fx=1/fx
                                  const capEur=(t.entry_currency&&t.entry_currency!=='EUR')?(ep*sh)/fx:(ep*sh)
                                  return capEur>0?'€'+Math.round(capEur).toLocaleString('es-ES'):'—'
                                })()}</td>
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

                {/* BACKUP */}
                {tlTab==='export'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'20px',gap:16,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>💾 Backup</div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#5a8aaa'}}>
                      Descarga o restaura el historial completo de operaciones.
                    </div>
                    {(()=>{
                      const exportCSV = () => {
                        const SEP = ','
                        const NL  = '\r\n'
                        const esc = function(v) {
                          var s = v == null ? '' : String(v)
                          return '"' + s.replace(/"/g, '""') + '"'
                        }
                        var headers = ['#','Tipo','Simbolo','Broker','Fecha','Acciones','Precio','Capital EUR','Divisa','FX','Comision EUR','Estrategia','Notas','Import']
                        var rows = tlTrades.map(function(t,i) {
                          var fx = parseFloat(t.fx||1); if(fx<1) fx=1/fx
                          var cap = (parseFloat(t.shares||0)*parseFloat(t.price||0)/fx).toFixed(0)
                          var comm = parseFloat(t.commission||0).toFixed(2)
                          var notes = (t.notes||'').split('\n').join(' ').split('\r').join('')
                          return [
                            i+1, t.fill_type||'', t.symbol||'', t.broker||'',
                            t.date||'', t.shares||'',
                            t.price!=null ? parseFloat(t.price).toFixed(2) : '',
                            cap, t.currency||'', fx.toFixed(4), comm,
                            t.strategy||'', notes, t.import_source||''
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
                        const d = new Date().toISOString().slice(0,10)
                        const payload = {version:'v50', date:d, trades:tlTrades}
                        const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href=url; a.download='tradelog_'+d+'.json'
                        a.click(); URL.revokeObjectURL(url)
                      }
                      const restoreJSON = () => {
                        const input = document.createElement('input')
                        input.type='file'; input.accept='.json'
                        input.onchange = async e => {
                          try {
                            const text = await e.target.files[0].text()
                            const data = JSON.parse(text)
                            const trades = Array.isArray(data) ? data : (data.trades||[])
                            if(!Array.isArray(trades)||trades.length===0) throw new Error('No se encontraron operaciones en el archivo')
                            if(!confirm(`¿Restaurar ${trades.length} fills desde backup? Se hará upsert en Supabase (no borra existentes).`)) return
                            let ok=0, fail=0
                            for(const fill of trades){
                              try{
                                const res=await apiFetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fill)})
                                if(res.ok) ok++; else fail++
                              }catch{ fail++ }
                            }
                            await loadTrades()
                            alert(`✓ ${ok} fills restaurados${fail>0?' · '+fail+' errores':''}`)
                          } catch(err){ alert('Error al restaurar: '+err.message) }
                        }
                        input.click()
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
                              ⬇ Descargar JSON ({tlTrades.length} fills)
                            </button>
                          </div>
                          <div style={{padding:'14px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700,marginBottom:4}}>↑ Restaurar</div>
                            <div style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',marginBottom:10}}>
                              Carga un JSON de backup y hace upsert de cada fill en Supabase. No borra operaciones existentes.
                            </div>
                            <button onClick={restoreJSON}
                              style={{fontFamily:MONO,fontSize:11,padding:'7px 16px',borderRadius:4,cursor:'pointer',
                                background:'rgba(155,114,255,0.08)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700}}>
                              ↑ Restaurar desde backup
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* DASHBOARD */}
                {tlTab==='dashboard'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:0,minHeight:0,overflow:'hidden'}}>
                    {(()=>{
                      // Bug fix V5.60: use tlTradesFiltered (pre-computed with live prices) instead of
                      // re-running computeFifo with empty prices, which caused pnl_eur to never resolve
                      // for open positions and the equity curve to be empty when ≤1 closed trade existed.
                      const closed = tlTradesFiltered.filter(t=>t.status==='closed').slice().sort((a,b)=>(a.exit_date||a.entry_date||'').localeCompare(b.exit_date||b.entry_date||''))
                      const openTrades = tlTradesFiltered.filter(t=>t.status==='open')
                      const tlPnlByStrategy = Object.entries(
                        [...(closed||[]), ...(openTrades||[])].reduce((acc, t) => {
                          const k = t.strategy || 'Sin estrategia'
                          if(!acc[k]) acc[k]={pnl:0,count:0}
                          acc[k].pnl += t.status==='open' ? (t._pnl_float_eur||0) : (t.pnl_eur||0)
                          if(t.status!=='open') acc[k].count++
                          return acc
                        }, {})
                      )
                        .map(([name, {pnl,count}]) => ({ name, pnl, count }))
                        .sort((a, b) => b.pnl - a.pnl)
                      const noData=!closed.length&&!openTrades.length
                      // Filter options — derived from ALL trades so dropdowns stay populated even when filtered results are empty
                      const allYears_=[...new Set((tlFifo.trades||[]).map(t=>((t.status==='closed'?t.exit_date:null)||t.entry_date)?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a)
                      const monthsInYear_=tlFilterYear?[...new Set((tlFifo.trades||[]).filter(t=>{const d=(t.status==='closed'?t.exit_date:null)||t.entry_date;return d&&d.startsWith(tlFilterYear)}).map(t=>{const d=(t.status==='closed'?t.exit_date:null)||t.entry_date;return d?d.slice(5,7):null}).filter(Boolean))].sort():[]
                      const MESES_=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                      const brokerOpts_=[...new Set((tlFifo.trades||[]).map(t=>t.broker).filter(Boolean))].sort()
                      const stratOpts_=[...new Set((tlTrades||[]).map(t=>t.strategy||'').filter(Boolean))].sort()
                      const hasFilters_=!!(tlFilterStatus||tlFilterBroker||tlFilterYear||tlFilterStrat)
                      const today = new Date().toISOString().split('T')[0]
                      // Build equity curve — deduplicated by date (lightweight-charts requires strictly ascending times)
                      // Multiple closed trades on same day would cause duplicate timestamps → chart fails silently
                      let cumPnl = 0, cumSinFx = 0, cumSinComm = 0
                      const equityByDate = {}, sinFxByDate = {}, sinCommByDate = {}
                      closed.forEach(t=>{
                        const date = t.exit_date||t.entry_date||today
                        const comm = parseFloat(t.commission||0)
                        cumPnl += parseFloat(t.pnl_eur||0)
                        equityByDate[date] = cumPnl
                        const fxE=parseFloat(t.fx_entry||0)||1
                        // Sin FX: no deducir comisión — pnl_eur tampoco la incluye, así la diferencia = FX puro
                        cumSinFx+=(parseFloat(t.exit_price||0)-parseFloat(t.entry_price||0))*parseFloat(t.shares||0)/fxE
                        sinFxByDate[date] = parseFloat(cumSinFx.toFixed(4))
                        // Sin Comisiones: pnl_eur + commission (lo que ganarías sin costes)
                        cumSinComm += parseFloat(t.pnl_eur||0) + comm
                        sinCommByDate[date] = parseFloat(cumSinComm.toFixed(4))
                      })
                      const equityCurve = Object.keys(equityByDate).sort().map(date=>({date,value:equityByDate[date]}))
                      const curveSinFx = Object.keys(sinFxByDate).sort().map(date=>({date,value:sinFxByDate[date]}))
                      const curveSinComm = Object.keys(sinCommByDate).sort().map(date=>({date,value:sinCommByDate[date]}))
                      // Float point: always show open trade endpoint so curve renders even while prices load
                      // _pnl_float_eur uses entry FX → valid for both real and Sin FX curves
                      const floatPnl = openTrades.reduce((s,t)=>s+(t._pnl_float_eur||0),0)
                      const openComm = openTrades.reduce((s,t)=>s+parseFloat(t.commission||0),0)
                      if(openTrades.length>0){
                        // Anchor at entry of first open trade if no closed trades exist yet
                        if(equityCurve.length===0){
                          equityCurve.push({date:openTrades[0].entry_date||today, value:0})
                          curveSinFx.push({date:openTrades[0].entry_date||today, value:0})
                          curveSinComm.push({date:openTrades[0].entry_date||today, value:0})
                        }
                        // Add today's float point to all curves (consistent endpoint)
                        const lastDate = equityCurve.length ? equityCurve[equityCurve.length-1].date : ''
                        if(today > lastDate){
                          equityCurve.push({date:today, value:cumPnl+floatPnl, isFloat:true})
                          curveSinFx.push({date:today, value:parseFloat((cumSinFx+floatPnl).toFixed(4))})
                          curveSinComm.push({date:today, value:parseFloat((cumSinComm+floatPnl+openComm).toFixed(4))})
                        }
                      }
                      // ── Patrimony curve (P&L + net contributions) ──
                      let curveWithContribs=[]
                      if(contributions.length){
                        const cSorted=[...contributions].filter(c=>c.date).sort((a,b)=>a.date.localeCompare(b.date))
                        const allEvts=[
                          ...closed.map(t=>({date:t.exit_date||t.entry_date||today,pnl:parseFloat(t.pnl_eur||0),contrib:0})),
                          ...cSorted.map(c=>({date:c.date,pnl:0,contrib:c.type==='retirada'?-parseFloat(c.amount):parseFloat(c.amount)}))
                        ].filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date))
                        let runPnlW=0,runContribW=0
                        const patrimByDate={}
                        allEvts.forEach(e=>{runPnlW+=e.pnl;runContribW+=e.contrib;patrimByDate[e.date]=runPnlW+runContribW})
                        curveWithContribs=Object.keys(patrimByDate).sort().map(d=>({date:d,value:patrimByDate[d]}))
                        if(curveWithContribs.length===0&&openTrades.length){
                          const anchor=cSorted[0]?.date||openTrades[0]?.entry_date||today
                          curveWithContribs.push({date:anchor,value:runContribW})
                        }
                        if(openTrades.length&&curveWithContribs.length){
                          const lastW=curveWithContribs[curveWithContribs.length-1].date
                          if(today>lastW) curveWithContribs.push({date:today,value:runContribW+runPnlW+floatPnl,isFloat:true})
                        }
                      }
                      // V5.80: clip all display curves to active filter period → both charts share same x-axis range
                      const _clip = arr => (tlFilterYear||tlFilterMonth)
                        ? (arr||[]).filter(p=>{
                            if(!p?.date) return false
                            if(tlFilterYear&&!p.date.startsWith(tlFilterYear)) return false
                            if(tlFilterMonth&&p.date.slice(5,7)!==tlFilterMonth) return false
                            return true
                          })
                        : (arr||[])
                      const eqDisp   = _clip(equityCurve)
                      const sfxDisp  = _clip(curveSinFx)
                      const scommDisp= _clip(curveSinComm)
                      const cwcDisp  = _clip(curveWithContribs)
                      const bhRaw    = tlShowBH&&tlBHData?.length ? computeBuyAndHold(contributions, tlBHData) : null
                      const bhDisp   = bhRaw ? _clip(bhRaw) : null

                      // Build invest chart data: timeline of capital invested vs cumulative profit
                      // Bug fix V5.60: include open trade entry events in the events array so their
                      // capital propagates correctly through the timeline up to today (instead of
                      // patching investMap at entry_date which didn't propagate forward).
                      const events = []
                      closed.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        const commIn = parseFloat(t.commission||0)/2
                        events.push({date:t.entry_date, capDelta:+capitalEur+commIn, pnlDelta:-commIn})
                        // Exit removes full deployed amount (capitalEur+commIn) so commIn doesn't accumulate
                        events.push({date:t.exit_date||today, capDelta:-(capitalEur+commIn), pnlDelta:parseFloat(t.pnl_eur||0)+commIn})
                      })
                      // Open trades: capital enters at entry_date and stays deployed (no exit event)
                      openTrades.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        events.push({date:t.entry_date||today, capDelta:+capitalEur, pnlDelta:0})
                      })
                      events.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
                      let runCap=0, runPnl=0
                      const investMap = {}
                      events.forEach(ev=>{
                        runCap += ev.capDelta; runPnl += ev.pnlDelta
                        investMap[ev.date]={capital:Math.max(0,runCap), profit:runPnl}
                      })
                      // Ensure today point reflects current float P&L
                      investMap[today]={capital:Math.max(0,runCap), profit:runPnl+floatPnl}
                      const investDataRaw = Object.keys(investMap).sort().map(d=>({date:d,...investMap[d]}))
                      // V5.79: clip invest chart data to active year/month filter (same logic as equity chart)
                      const investData = (tlFilterYear||tlFilterMonth)
                        ? investDataRaw.filter(p=>{
                            if(tlFilterYear&&!p.date.startsWith(tlFilterYear)) return false
                            if(tlFilterMonth&&p.date.slice(5,7)!==tlFilterMonth) return false
                            return true
                          })
                        : investDataRaw
                      const liveFloatEur_=(t)=>{const lp=tlLivePrices[t.symbol];if(lp?.unavailable)return null;const px=lp?.price!=null?parseFloat(lp.price):null;if(px!==null){const fxE=t.fx_entry||1;return(px-t.entry_price)*t.shares/fxE};return typeof t._pnl_float_eur==='number'?t._pnl_float_eur:0}
                      const pnlReal=closed.reduce((s,t)=>s+parseFloat(t.pnl_eur||0),0)
                      const pnlFloat_=openTrades.reduce((s,t)=>{const v=liveFloatEur_(t);return s+(v!=null?v:0)},0)
                      const hasUnavailablePrices_=Object.values(tlLivePrices).some(v=>v?.unavailable)
                      const unavailableSymbols_=Object.entries(tlLivePrices).filter(([,v])=>v?.unavailable).map(([k])=>k)
                      const _dividendosAcum_=contributions.filter(c=>c.type==='dividendo').reduce((s,c)=>s+parseFloat(c.amount||0),0)
                      const pnlTotal=pnlReal+pnlFloat_+_dividendosAcum_
                      const commTotal=[...closed,...openTrades].reduce((s,t)=>s+parseFloat(t.commission||0),0)
                      const allWithPnl=[
                        ...closed.map(t=>({...t,_ep:parseFloat(t.pnl_eur)||0,_epct:parseFloat(t.pnl_pct||0),_ed:t.entry_date&&t.exit_date?Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000):0})),
                        ...openTrades.map(t=>({...t,_ep:liveFloatEur_(t),_epct:(()=>{const px=tlLivePrices[t.symbol]?.price!=null?parseFloat(tlLivePrices[t.symbol].price):null;if(px!==null&&t.entry_price>0)return(px/t.entry_price-1)*100;return typeof t._pnl_float_pct==='number'?t._pnl_float_pct:0})(),_ed:t.entry_date?Math.round((new Date(today)-new Date(t.entry_date))/86400000):0}))
                      ]
                      const wins_=allWithPnl.filter(t=>t._ep>=0)
                      const losses_=allWithPnl.filter(t=>t._ep<0)
                      const wr=allWithPnl.length?wins_.length/allWithPnl.length*100:0
                      const avgWinPct=wins_.length?wins_.reduce((s,t)=>s+t._epct,0)/wins_.length:0
                      const avgLossPct=losses_.length?losses_.reduce((s,t)=>s+Math.abs(t._epct),0)/losses_.length:0
                      const avgWinEur=wins_.length?wins_.reduce((s,t)=>s+t._ep,0)/wins_.length:0
                      const avgLossEur=losses_.length?losses_.reduce((s,t)=>s+Math.abs(t._ep),0)/losses_.length:0
                      const factorBen_=avgLossEur>0?(avgWinEur/avgLossEur):null
                      const bestT_=allWithPnl.length?allWithPnl.reduce((b,t)=>t._ep>b._ep?t:b,allWithPnl[0]):null
                      const worstT_=allWithPnl.length?allWithPnl.reduce((b,t)=>t._ep<b._ep?t:b,allWithPnl[0]):null
                      const diasArr=allWithPnl.map(t=>t._ed).filter(d=>d!=null&&d>=0)
                      const diasProm=diasArr.length?diasArr.reduce((s,d)=>s+d,0)/diasArr.length:null
                      const totalDias=diasArr.reduce((s,d)=>s+d,0)
                      const firstDate_=allWithPnl.length?allWithPnl.reduce((a,t)=>t.entry_date<a?t.entry_date:a,allWithPnl[0].entry_date):null
                      const aniosPeriodo_=firstDate_?Math.max((new Date(today)-new Date(firstDate_))/86400000/365.25,0.01):null
                      const totalDiasInv=totalDias
                      const tiempoInvPct_=aniosPeriodo_?Math.round(totalDias/(aniosPeriodo_*365.25)*100):null
                      const _allOpen_=tlFifo.openPositions||[]
                      const capitalEmpAll=_allOpen_.reduce((s,t)=>{const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1;return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE},0)
                      const pnlRealAll=(tlFifo.trades||[]).filter(t=>t.status==='closed').reduce((s,t)=>s+parseFloat(t.pnl_eur||0),0)
                      const pnlFloatAll=_allOpen_.reduce((s,t)=>{const lp=tlLivePrices[t.symbol];if(lp?.unavailable)return s;const px=lp?.price!=null?parseFloat(lp.price):null;const fxE=t.fx_entry||1;return s+(px!==null?(px-t.entry_price)*t.shares/fxE:(typeof t._pnl_float_eur==='number'?t._pnl_float_eur:0))},0)
                      const pnlTotalAll=pnlRealAll+pnlFloatAll
                      const capEvts=[];[...closed,...openTrades].forEach(t=>{const fxE2=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1;const cap=(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE2;const ch=parseFloat(t.commission||0)/2;capEvts.push({date:t.entry_date||today,delta:+cap+ch});if(t.status==='closed')capEvts.push({date:t.exit_date||today,delta:-cap})})
                      capEvts.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
                      let rce=0,mce=0; capEvts.forEach(ev=>{rce+=ev.delta;if(rce>mce)mce=rce})
                      const capitalEmp_=openTrades.reduce((s,t)=>{const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1;return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE},0)
                      const peakCapBase=Math.max(mce,capitalEmp_>0?capitalEmp_:0,1000)
                      const netContrib=contributions.reduce((s,c)=>s+(c.type==='retirada'?-1:1)*parseFloat(c.amount||0),0)
                      const hasContribs=contributions.length>0
                      const capitalNeto=contributions.reduce((s,c)=>c.type==='aportacion'?s+parseFloat(c.amount||0):c.type==='retirada'?s-parseFloat(c.amount||0):s,0)
                      const dividendosAcum=contributions.filter(c=>c.type==='dividendo').reduce((s,c)=>s+parseFloat(c.amount||0),0)
                      const patrimonioActual=hasContribs?capitalNeto+dividendosAcum+pnlTotalAll:null
                      const capitalDisp=hasContribs&&patrimonioActual!=null?patrimonioActual-capitalEmpAll:null
                      const capitalBase=showWithContribs&&netContrib>0?netContrib:peakCapBase
                      // Float equity curve — daily P&L including open positions
                      const floatCurveRaw=Object.keys(floatCloses).length>0
                        ?buildFloatCurve(tlTradesFiltered,floatCloses,capitalBase,contributions):[]
                      const floatCurveDisp=_clip(floatCurveRaw)
                      let maxDD=0,maxDDPct=0
                      // DD curve: float curve when toggle active; else cwcDisp; else eqDisp+capitalBase
                      const _ddCurve=tlShowFloat&&floatCurveDisp?.length>1?floatCurveDisp:(cwcDisp?.length>1?cwcDisp:eqDisp.map(p=>({date:p.date,value:capitalBase+p.value})))
                      if(_ddCurve.length>1){let peak=_ddCurve[0].value;_ddCurve.forEach(p=>{if(p.value>peak)peak=p.value;const dd=peak-p.value;const ddPct=peak>0?(dd/peak)*100:0;if(dd>maxDD){maxDD=dd;maxDDPct=ddPct}})}
                      // CAGR: misma fórmula siempre — (1 + pnlTotal/capitalBase)^(1/años) - 1
                      // CAGR usa siempre pnlTotal — coherente con P&L TOTAL mostrado
                      // El toggle tlShowFloat solo afecta al gráfico, no al valor numérico
                      const _pnlForCagr_=pnlTotal
                      const cagrReal_=aniosPeriodo_&&_pnlForCagr_!==0?(Math.pow(Math.max((capitalBase+_pnlForCagr_)/capitalBase,0.001),1/aniosPeriodo_)-1)*100:null
                      const _capRef_=capitalNeto>0?capitalNeto:capitalBase
                      const fxImpact=pnlReal-closed.reduce((s,t)=>{const fE=parseFloat(t.fx_entry||0)||1;return s+(parseFloat(t.exit_price||0)-parseFloat(t.entry_price||0))*parseFloat(t.shares||0)/fE},0)
                      const pnlSCapPct=capitalNeto>0?(pnlTotal/capitalNeto*100):capitalBase>0?(pnlTotal/capitalBase*100):null
                      const fmtEur_=v=>v>=0?'+€'+Math.round(v).toLocaleString('es-ES'):'-€'+Math.round(Math.abs(v)).toLocaleString('es-ES')
                      const fmtAbs_=v=>'€'+Math.round(Math.abs(v)).toLocaleString('es-ES')
                      const openSorted_=[..._allOpen_].sort((a,b)=>(b._pnl_float_eur||0)-(a._pnl_float_eur||0))
                      const top3_=openSorted_.slice(0,3)
                      // bot3_ only shows positions not already in top3_ (avoids duplicates when ≤3 open)
                      const bot3_=openSorted_.length>3?[...openSorted_].reverse().slice(0,Math.min(3,openSorted_.length-3)):[]
                      const ps_={fontFamily:MONO,fontSize:10,padding:'2px 8px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg3)',cursor:'pointer',outline:'none',color:'#4a6a88',maxWidth:110}
                      return (
                        <div id="tlDashOuter" data-dash-outer="1" style={{display:'flex',flexDirection:'column',background:'var(--bg)',flex:1,minHeight:0,overflow:'hidden',alignItems:'stretch'}}>
                          {/* BARRA SUPERIOR — always visible even when noData */}
                          <div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0,flexWrap:'nowrap',overflowX:'auto'}}>
                            <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'var(--text)',letterSpacing:'0.08em',textTransform:'uppercase',marginRight:8,flexShrink:0}}>Dashboard</span>
                            <select value={tlFilterStatus} onChange={e=>setTlFilterStatus(e.target.value)} style={{...ps_,flexShrink:0,color:tlFilterStatus?'#9b72ff':'#4a6a88'}}>
                              <option value="">Estado ▾</option>
                              <option value="open">Abiertas</option>
                              <option value="closed">Cerradas</option>
                            </select>
                            <select value={tlFilterYear} onChange={e=>{setTlFilterYear(e.target.value);setTlFilterMonth('')}} style={{...ps_,flexShrink:0,color:tlFilterYear?'#ffd166':'#4a6a88'}}>
                              <option value="">Año ▾</option>
                              {allYears_.map(y=><option key={y} value={y}>{y}</option>)}
                            </select>
                            {tlFilterYear&&monthsInYear_.length>0&&(
                              <select value={tlFilterMonth} onChange={e=>setTlFilterMonth(e.target.value)} style={{...ps_,flexShrink:0,color:tlFilterMonth?'#ffd166':'#4a6a88'}}>
                                <option value="">Mes ▾</option>
                                {monthsInYear_.map(m=><option key={m} value={m}>{MESES_[parseInt(m)-1]}</option>)}
                              </select>
                            )}
                            <select value={tlFilterBroker} onChange={e=>setTlFilterBroker(e.target.value)} style={{...ps_,flexShrink:0,color:tlFilterBroker?'#00d4ff':'#4a6a88'}}>
                              <option value="">Broker ▾</option>
                              {brokerOpts_.map(b=><option key={b} value={b}>{b}</option>)}
                            </select>
                            <select value={tlFilterStrat} onChange={e=>setTlFilterStrat(e.target.value)} style={{...ps_,flexShrink:0,color:tlFilterStrat?'#00e5a0':'#4a6a88'}}>
                              <option value="">Estrategia ▾</option>
                              {stratOpts_.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                            {hasFilters_&&<button onClick={()=>{setTlFilterStatus('');setTlFilterBroker('');setTlFilterYear('');setTlFilterMonth('');setTlFilterStrat('');setTlSearch('')}}
                              style={{fontFamily:MONO,fontSize:9,padding:'2px 8px',borderRadius:10,border:'1px solid rgba(255,77,109,0.4)',background:'rgba(255,77,109,0.08)',color:'#ff4d6d',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
                              ✕ Limpiar
                            </button>}
                          </div>
                          {/* Thin banner when no data — layout stays fully visible */}
                          {noData&&<div style={{padding:'4px 12px',background:'rgba(255,77,109,0.07)',borderBottom:'1px solid rgba(255,77,109,0.18)',fontFamily:MONO,fontSize:9,color:'#ff6b85',flexShrink:0,letterSpacing:'0.05em'}}>Sin resultados para este filtro — mostrando métricas en cero</div>}
                          {/* FILA 1 — 10 métricas */}
                          <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',alignItems:'stretch',maxHeight:'calc(100vh - 110px)'}}>
                          <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
                          <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0,overflowX:'auto'}}>
                            {[
                              {l:'Patrimonio',v:patrimonioActual!=null?fmtAbs_(patrimonioActual):'—',c:'#00d4ff'},
                              {l:'Cap. disponible',v:capitalDisp!=null?fmtEur_(capitalDisp):'—',c:capitalDisp==null?'#3d5a7a':capitalDisp>=0?'#00e5a0':'#ff4d6d'},
                              {l:'Balance inicial',v:hasContribs?fmtAbs_(capitalNeto):'—',c:'#a8ccdf'},
                              {l:'Capital emp.',v:capitalEmpAll>0?fmtAbs_(capitalEmpAll):'—',c:'#00d4ff'},
                              {l:'P&L realizado',v:fmtEur_(pnlReal),c:pnlReal>=0?'#00e5a0':'#ff4d6d'},
                              {l:'P&L flotante',v:fmtEur_(pnlFloat_),c:pnlFloat_>=0?'#00e5a0':'#ff4d6d',warn:hasUnavailablePrices_?`⚠ Incompleto — falta precio de: ${unavailableSymbols_.join(', ')}`:null},
                              {l:'Nº Operaciones',v:`${closed.length} cer. / ${openTrades.length} ab.`,c:'#f59e0b'},
                              {l:'Comisiones',v:commTotal>0?'-€'+Math.round(commTotal).toLocaleString('es-ES'):'€0',c:'#ff4d6d'},
                              {l:'Dividendos',v:dividendosAcum>0?'+€'+Math.round(dividendosAcum).toLocaleString('es-ES'):'—',c:'#00e5a0'},
                            ].map(({l,v,c,hl,sub,warn},i)=>(
                              <div key={i} style={{flex:'1 0 9%',padding:'7px 8px',borderRight:'1px solid var(--border)',borderLeft:hl?'3px solid #ff4d6d':'none',background:hl?'rgba(255,77,109,0.04)':'transparent',display:'flex',flexDirection:'column',gap:1,minWidth:80}}>
                                <div style={{fontFamily:MONO,fontSize:9,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>{l}{warn&&<span title={warn} style={{display:'inline-flex',alignItems:'center',gap:3,background:'#ff9800',color:'#000',fontWeight:700,fontSize:9,padding:'2px 6px',borderRadius:3,marginLeft:4,animation:'warnPulse 1.5s infinite',cursor:'help',lineHeight:1.3,textTransform:'none',letterSpacing:0}}>⚠ INCOMPLETO</span>}</div>
                                <div style={{fontFamily:MONO,fontSize:15,fontWeight:700,color:c,lineHeight:1.1,whiteSpace:'nowrap'}}>{v}</div>
                                {sub&&<div style={{fontFamily:MONO,fontSize:7,color:'#3d5a7a'}}>{sub}</div>}
                              </div>
                            ))}
                          </div>
                          {/* ZONA CENTRAL */}
                          <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>
                            {/* Col equity */}
                            <div style={{flex:2.5,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',minWidth:0}}>
                              {/* Subcol equity */}
                              <div style={{flex:tlEquityFlex,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',minHeight:0}}>
                                {eqDisp.length>1
                                  ?<div ref={tlEquityContainerRef} style={{flex:1,minHeight:0}}><TlEquityChart curve={eqDisp} curveSinFx={sfxDisp.length>1?sfxDisp:null} curveSinComm={scommDisp.length>1?scommDisp:null} curveWithContribs={cwcDisp.length>1?cwcDisp:null} curveBH={bhDisp?.length>1?bhDisp:null} showBH={tlShowBH} onToggleBH={async()=>{const next=!tlShowBH;setTlShowBH(next);if(next&&!tlBHData){const first=contributions.filter(c=>c.type==='aportacion').sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0]?.date;const r=await fetch('/api/sp500history'+(first?'?from='+first:''));if(r.ok){const{history}=await r.json();setTlBHData(history||[])}}}} equityMode={tlEquityMode} onToggleMode={()=>setTlEquityMode(m=>m==='pnl'?'equity':'pnl')} contributions={contributions} showWithContribs={showWithContribs} onToggleContribs={()=>setShowWithContribs(v=>!v)} curveFloat={floatCurveDisp.length>1?floatCurveDisp:null} floatLoading={floatLoading} showFloat={tlShowFloat} onToggleFloat={()=>setTlShowFloat(v=>!v)} onFirstFloat={triggerFloatFetch} height={tlEquityHeight} showTimeScale={false} syncRef={tlDashSyncRef}/></div>
                                  :<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:MONO,fontSize:10,color:'#3d5a7a'}}>Sin datos equity</div>}
                                <div onClick={()=>{document.getElementById('tlDetailEquity')?.scrollIntoView({behavior:'smooth'})}} title="Ir al gráfico detallado"
                                  style={{position:'absolute',top:6,right:6,zIndex:10,cursor:'pointer',color:'#3d5a7a',fontSize:13,lineHeight:1,background:'rgba(13,21,32,0.75)',borderRadius:3,padding:'2px 5px',border:'1px solid #1a2d45'}}
                                  onMouseOver={e=>e.currentTarget.style.color='#00d4ff'} onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>⤢</div>
                              </div>
                              {/* Divisor arrastrable */}
                              <div style={{height:6,background:'transparent',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',cursor:'row-resize',flexShrink:0,zIndex:10,display:'flex',alignItems:'center',justifyContent:'center'}}
                                onMouseDown={e=>{
                                  e.preventDefault()
                                  const startY=e.clientY
                                  const startFlex=tlEquityFlex
                                  const totalH=e.currentTarget.parentElement.clientHeight
                                  const onMove=mv=>{
                                    const delta=mv.clientY-startY
                                    const newFlex=Math.min(1.8,Math.max(0.2,startFlex+(delta/totalH)*2))
                                    setTlEquityFlex(newFlex)
                                    tlEquityFlexRef.current=newFlex
                                  }
                                  const onUp=()=>{
                                    window.removeEventListener('mousemove',onMove)
                                    window.removeEventListener('mouseup',onUp)
                                    try{localStorage.setItem('tlEquityFlex',tlEquityFlexRef.current)}catch(_){}
                                  }
                                  window.addEventListener('mousemove',onMove)
                                  window.addEventListener('mouseup',onUp)
                                }}>
                                <div style={{width:30,height:2,borderRadius:1,background:'#1a2d45'}}/>
                              </div>
                              {/* Subcol invest */}
                              <div style={{flex:2-tlEquityFlex,position:'relative',display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
                                <div ref={tlInvestContainerRef} style={{flex:1,minHeight:0,height:'100%'}}>
                                  {investData.length>1
                                    ?<TlInvestChart investData={investData} syncRef={tlDashSyncRef} patrimonyCurve={cwcDisp.length>1?cwcDisp:null} compact={false} height={tlInvestHeight}/>
                                    :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:MONO,fontSize:9,color:'#3d5a7a'}}>—</div>}
                                </div>
                                <div onClick={()=>{document.getElementById('tlDetailInvest')?.scrollIntoView({behavior:'smooth'})}} title="Ir al gráfico detallado"
                                  style={{position:'absolute',top:6,right:6,zIndex:10,cursor:'pointer',color:'#3d5a7a',fontSize:13,lineHeight:1,background:'rgba(13,21,32,0.75)',borderRadius:3,padding:'2px 5px',border:'1px solid #1a2d45'}}
                                  onMouseOver={e=>e.currentTarget.style.color='#00d4ff'} onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>⤢</div>
                              </div>
                            </div>
                            {/* Col métricas + P&L */}
                            <div style={{flex:1.4,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
                              <div style={{flex:1,borderBottom:'1px solid var(--border)',overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr 1fr',gap:0}}>
                                {[
                                  {l:'P&L TOTAL',t:'pnlTotal',v:fmtEur_(pnlTotal),c:pnlTotal>=0?'#00e5a0':'#ff4d6d'},
                                  {l:'P&L S/CAPITAL',t:'pnlSCapital',v:pnlSCapPct!=null?(pnlSCapPct>=0?'+':'')+pnlSCapPct.toFixed(2)+'%':'—',c:pnlSCapPct!=null&&pnlSCapPct>=0?'#00e5a0':'#ff4d6d'},
                                  {l:'CAGR',t:'cagr',v:cagrReal_!=null?(cagrReal_>=0?'+':'')+cagrReal_.toFixed(2)+'%':'—',c:cagrReal_!=null&&cagrReal_>=0?'#00e5a0':'#ff4d6d'},
                                  {l:'MAX DRAWDOWN',t:'maxDrawdown',v:maxDD>0?('-€'+Math.round(maxDD)+' ('+maxDDPct.toFixed(1)+'%)'):'—',c:'#ff4d6d'},
                                  {l:'WIN RATE',t:'winRate',v:allWithPnl.length?wr.toFixed(1)+'%':'—',c:wr>=50?'#00e5a0':'#ff4d6d'},
                                  {l:'FACTOR BEN.',t:'factorBeneficio',v:factorBen_!=null?factorBen_.toFixed(2):'—',c:factorBen_!=null&&factorBen_>=1?'#00e5a0':'#ff4d6d'},
                                ].map(({l,t,v,c},i)=>(
                                  <div key={i} style={{padding:'10px 12px',borderRight:i%2===0?'1px solid var(--border)':'none',borderBottom:i<4?'1px solid var(--border)':'none',display:'flex',flexDirection:'column',justifyContent:'center',gap:3}}>
                                    <div style={{fontFamily:MONO,fontSize:9,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase',display:'flex',alignItems:'center',gap:4}}>{l}<Tip id={t}/></div>
                                    <div style={{fontFamily:MONO,fontSize:17,fontWeight:700,color:c,lineHeight:1.1}}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{flex:1,overflow:'hidden',position:'relative',padding:'6px 6px 4px',display:'flex',flexDirection:'column'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4,flexShrink:0,paddingRight:22}}>
                                  <span style={{fontFamily:MONO,fontSize:11,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase'}}>
                                    {tlPnlView==='operacion'?'P&L por operación':'P&L por estrategia'}
                                  </span>
                                  <div style={{display:'flex',gap:3}}>
                                    {['operacion','estrategia'].map(v=>(
                                      <button key={v} onClick={()=>setTlPnlView(v)} style={{fontFamily:MONO,fontSize:8,padding:'2px 6px',borderRadius:3,border:'1px solid',cursor:'pointer',borderColor:tlPnlView===v?'#00d4ff':'#1a2d45',background:tlPnlView===v?'rgba(0,212,255,0.1)':'transparent',color:tlPnlView===v?'#00d4ff':'#3d5a7a'}}>
                                        {v==='operacion'?'Op.':'Estrat.'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div onClick={()=>{document.getElementById('tlDetailPnl')?.scrollIntoView({behavior:'smooth'})}} title="Ir al P&L detallado"
                                  style={{position:'absolute',top:6,right:6,zIndex:10,cursor:'pointer',color:'#3d5a7a',fontSize:13,lineHeight:1,background:'rgba(13,21,32,0.75)',borderRadius:3,padding:'2px 5px',border:'1px solid #1a2d45'}}
                                  onMouseOver={e=>e.currentTarget.style.color='#00d4ff'} onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>⤢</div>
                                {tlPnlView==='operacion'?(
                                  (()=>{
                                    const trades=[...closed.map(t=>({...t,isOpen:false})),...openTrades.map(t=>({...t,pnl_eur:t._pnl_float_eur||0,isOpen:true}))]
                                    const mx=Math.max(...trades.map(t=>Math.abs(t.pnl_eur||0)),1)
                                    const maxPos=Math.max(...trades.map(t=>Math.max(t.pnl_eur||0,0)),0.01)
                                    const maxNeg=Math.max(...trades.map(t=>Math.max(-(t.pnl_eur||0),0)),0.01)
                                    const totalRange=maxPos+maxNeg
                                    const zeroPct=(maxPos/totalRange)*100
                                    return (
                                      <div style={{display:'flex',flex:1,minHeight:0,gap:0}}>
                                        <div style={{flex:1,position:'relative',minWidth:0}}>
                                          {/* línea cero dinámica */}
                                          <div style={{position:'absolute',left:0,right:0,top:zeroPct+'%',height:1,background:'rgba(255,255,255,0.15)',pointerEvents:'none'}}/>
                                          {/* líneas mitad zona positiva y negativa */}
                                          <div style={{position:'absolute',left:0,right:0,top:(zeroPct/2)+'%',height:1,background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
                                          <div style={{position:'absolute',left:0,right:0,top:(zeroPct+(100-zeroPct)/2)+'%',height:1,background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
                                          {trades.map((t,i)=>{
                                            const val=t.pnl_eur||0
                                            const isW=val>=0
                                            const barW=Math.max(0.3,(80/trades.length))
                                            const barL=i/trades.length*100
                                            const pct=isW
                                              ? Math.max(0.5,(t.pnl_eur/maxPos)*zeroPct)
                                              : Math.max(0.5,(Math.abs(t.pnl_eur)/maxNeg)*(100-zeroPct))
                                            return <div key={i}
                                              title={t.symbol+' '+(isW?'+':'')+'€'+Math.round(val)+(t.isOpen?' (abierta)':'')}
                                              style={{position:'absolute',left:barL+'%',width:barW+'%',height:pct+'%',
                                                top:isW?(zeroPct-pct)+'%':zeroPct+'%',
                                                background:t.isOpen?(isW?'rgba(0,229,160,0.5)':'rgba(255,77,109,0.45)'):(isW?'#00e5a0':'#ff4d6d'),
                                                borderRadius:isW?'2px 2px 0 0':'0 0 2px 2px',minWidth:2}}/>
                                          })}
                                        </div>
                                        <div style={{position:'relative',width:42,flexShrink:0,paddingLeft:4,fontFamily:MONO,fontSize:8,color:'#3d5a7a'}}>
                                          <span style={{position:'absolute',top:'0%',left:4,lineHeight:1}}>+€{Math.round(maxPos)}</span>
                                          <span style={{position:'absolute',top:zeroPct+'%',left:4,lineHeight:1,color:'rgba(255,255,255,0.25)'}}>€0</span>
                                          <span style={{position:'absolute',bottom:'0%',left:4,lineHeight:1}}>-€{Math.round(maxNeg)}</span>
                                        </div>
                                      </div>
                                    )
                                  })()
                                ):(
                                  (()=>{
                                    const data=tlPnlByStrategy
                                    const mx=Math.max(...data.map(d=>Math.abs(d.pnl)),1)
                                    const total=data.length||1
                                    return (
                                      <div style={{display:'flex',flex:1,minHeight:0,gap:0}}>
                                        <div style={{flex:1,position:'relative',minWidth:0}}>
                                          <div style={{position:'absolute',left:0,right:0,top:'50%',height:1,background:'rgba(255,255,255,0.15)',pointerEvents:'none'}}/>
                                          {[25,75].map(pct=>(
                                            <div key={pct} style={{position:'absolute',left:0,right:0,top:pct+'%',height:1,background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
                                          ))}
                                          {data.map((d,i)=>{
                                            const isW=d.pnl>=0
                                            const pct=Math.max(2,Math.abs(d.pnl)/mx*48)
                                            const barW=Math.max(4,(100/total)-0.5)
                                            const barL=i/total*100
                                            return (
                                              <Fragment key={i}>
                                                <div style={{position:'absolute',left:barL+'%',width:barW+'%',...(isW?{bottom:`calc(50% + ${pct}% + 2px)`}:{top:`calc(50% + ${pct}% + 2px)`}),textAlign:'center',fontFamily:MONO,fontSize:7,color:'#f59e0b',overflow:'hidden',whiteSpace:'nowrap',pointerEvents:'none',lineHeight:1}}>{d.name.split(' ')[0]}</div>
                                                <div title={d.name+' ('+d.count+' ops) '+(isW?'+':'')+'€'+Math.round(d.pnl)} style={{position:'absolute',left:barL+'%',width:barW+'%',height:pct+'%',bottom:isW?'50%':undefined,top:isW?undefined:'50%',background:isW?'rgba(34,197,94,0.75)':'rgba(239,68,68,0.75)',borderRadius:isW?'2px 2px 0 0':'0 0 2px 2px',cursor:'default'}}/>
                                              </Fragment>
                                            )
                                          })}
                                        </div>
                                        <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',width:42,flexShrink:0,paddingLeft:4,paddingBottom:2,fontFamily:MONO,fontSize:8,color:'#3d5a7a',textAlign:'left'}}>
                                          {[mx,mx*0.5,0,-mx*0.5,-mx].map((v,i)=>(
                                            <span key={i} style={{lineHeight:1}}>{(v>0?'+':'')}{'€'+Math.round(v)}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })()
                                )}
                              </div>
                            </div>
                          </div>
                          {/* FILA 3 — KPIs + secundarias */}
                          <div style={{display:'flex',flexWrap:'nowrap',borderBottom:'1px solid var(--border)',flexShrink:0,overflowX:'auto'}}>
                            {[
                              {l:'Impacto FX',t:'impactoFx',v:fxImpact!==0?(fxImpact>=0?'+':'-')+'€'+Math.round(Math.abs(fxImpact)).toLocaleString('es-ES'):'€0',c:fxImpact>=0?'#00e5a0':'#ff4d6d'},
                              {l:'Gan. media %',t:'ganMediaPct',v:avgWinPct>0?('+'+avgWinPct.toFixed(2)+'%'):'—',c:'#00e5a0'},
                              {l:'Pérd. media %',t:'perdMediaPct',v:avgLossPct>0?(avgLossPct.toFixed(2)+'%'):'—',c:'#ff4d6d'},
                              {l:'Días prom.',t:'diasProm',v:diasProm!=null?Math.round(diasProm)+' d':'—',c:'#a8ccdf'},
                              {l:'Total días',t:'totalDias',v:totalDiasInv+' d',c:'#a8ccdf'},
                              {l:'T. invertido',t:'tInvertido',v:tiempoInvPct_!=null?tiempoInvPct_+'%':'—',c:'#ffd166'},
                            ].map(({l,t,v,c},i)=>(
                              <div key={i} style={{flex:'1 0 8%',padding:'10px 10px',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:2,minWidth:80}}>
                                <div style={{fontFamily:MONO,fontSize:8,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>{l}<Tip id={t} style={{marginLeft:3}}/></div>
                                <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:c,lineHeight:1.1}}>{v}</div>
                              </div>
                            ))}
                          </div>
                          {/* FILA 4 */}
                          <div style={{display:'flex',flexWrap:'nowrap',borderBottom:'1px solid var(--border)',flexShrink:0,overflowX:'auto'}}>
                            {[
                              {l:'Ganadoras',t:'ganadoras',v:wins_.length,c:'#00e5a0'},
                              {l:'Perdedoras',t:'perdedoras',v:losses_.length,c:'#ff4d6d'},
                              {l:'Días promedio',t:'diasPromedioInv',v:diasProm!=null?Math.round(diasProm)+' d':'—',c:'#a8ccdf'},
                              {l:'Total días inv.',t:'totalDiasInv',v:totalDiasInv+' d',c:'#a8ccdf'},
                            ].map(({l,t,v,c},i)=>(
                              <div key={i} style={{flex:'1 0 9%',padding:'10px 10px',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:2,minWidth:80}}>
                                <div style={{fontFamily:MONO,fontSize:8,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase',whiteSpace:'nowrap',display:'flex',alignItems:'center'}}>{l}<Tip id={t} style={{marginLeft:3}}/></div>
                                <div style={{fontFamily:MONO,fontSize:15,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
                              </div>
                            ))}
                          </div>
                          </div>
                          {/* Col derecha permanente — Mercados + Rendimientos */}
                          <div style={{width:180,borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>
                            {/* Mercados */}
                            <div style={{flex:1,overflow:'auto',padding:'4px 8px',borderBottom:'1px solid var(--border)'}}>
                              <div style={{fontFamily:MONO,fontSize:11,color:'#e2e8f0',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:3,position:'sticky',top:0,background:'var(--bg)',paddingTop:4}}>Mercados</div>
                              {tlDashMarkets.length===0
                                ?<div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',lineHeight:1.5}}>No disponible</div>
                                :tlDashMarkets.map(m=>(
                                  <div key={m.symbol} onClick={()=>{setSimbolo(m.symbol);setSidePanel('watchlist');setTlTab('ops')}} onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseOut={e=>e.currentTarget.style.background='transparent'} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}>
                                    <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf'}}>{m.name}</span>
                                    <span style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                                      <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:m.dayPct>=0?'#00e5a0':'#ff4d6d'}}>{m.dayPct>=0?'+':''}{m.dayPct.toFixed(2)}%</span>
                                      <span title={m.trend==='bull'?'Precio > EMA10':'Precio < EMA10'} style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:m.trend==='bull'?'#00e5a0':'#ff4d6d',cursor:'default'}}>{m.trend==='bull'?'▲':'▼'}</span>
                                    </span>
                                  </div>
                                ))
                              }
                            </div>
                            {/* Rendimientos / Flotantes */}
                            <div style={{flex:1,overflow:'auto',padding:'4px 8px',minHeight:0}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'var(--bg)',paddingTop:4,marginBottom:3}}>
                                <div style={{fontFamily:MONO,fontSize:11,color:'#e2e8f0',letterSpacing:'0.1em',textTransform:'uppercase'}}>{rendView==='flotantes'?'Flotantes':'Rendimientos'}</div>
                                <div style={{display:'flex',gap:2,flexShrink:0}}>
                                  {[['flotantes','Float.'],['hist','Hist.']].map(([v,lbl])=>(
                                    <button key={v} onClick={()=>setRendView(v)} style={{fontFamily:MONO,fontSize:7,padding:'1px 4px',borderRadius:2,border:'1px solid',cursor:'pointer',borderColor:rendView===v?'#00d4ff':'#1a2d45',background:rendView===v?'rgba(0,212,255,0.1)':'transparent',color:rendView===v?'#00d4ff':'#3d5a7a'}}>{lbl}</button>
                                  ))}
                                </div>
                              </div>
                              {(()=>{
                                const renderRow=(t,i)=>(
                                  <div key={(t.symbol||'')+(t.isOpen?'o':'c')+i} style={{display:'flex',flexDirection:'column',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span onClick={()=>{setSimbolo(t.symbol);setSidePanel('watchlist');setTlTab('ops')}} style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',cursor:'pointer',textDecoration:'underline',textDecorationColor:'rgba(168,204,223,0.3)'}}>
                                        {t.symbol}{t.isOpen&&<span style={{color:'#ffd700'}}>●</span>}
                                      </span>
                                      <span style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                                        <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:t.pnlEur>=0?'#00e5a0':'#ff4d6d'}}>{t.pnlEur>=0?'+':''}{Math.round(t.pnlEur)}€</span>
                                        <span style={{fontFamily:MONO,fontSize:10,color:t.pnlPct>=0?'rgba(0,229,160,0.7)':'rgba(255,77,109,0.7)'}}>{t.pnlPct>=0?'+':''}{typeof t.pnlPct==='number'?t.pnlPct.toFixed(1):'—'}%</span>
                                      </span>
                                    </div>
                                    {t.strategy&&t.strategy!=='—'&&<div style={{fontFamily:MONO,fontSize:7,color:'#3d5a7a'}}>{t.strategy}</div>}
                                  </div>
                                )
                                if(rendView==='flotantes'){
                                  const floatRows=(tlFifo.openPositions||[])
                                    .map(t=>({symbol:t.symbol,pnlEur:t._pnl_float_eur||0,pnlPct:t._pnl_float_pct||0,strategy:t.strategy||'—',isOpen:true}))
                                    .sort((a,b)=>Math.abs(b.pnlEur)-Math.abs(a.pnlEur))
                                  if(!floatRows.length) return <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a'}}>Sin posiciones abiertas</div>
                                  return <>{floatRows.map((t,i)=>renderRow(t,i))}</>
                                }
                                const allRendimientos_=[
                                  ...(tlFifo.openPositions||[]).map(t=>({symbol:t.symbol,pnlEur:t._pnl_float_eur||0,pnlPct:t._pnl_float_pct||0,strategy:t.strategy||'—',isOpen:true})),
                                  ...(tlTradesFiltered||[]).filter(t=>t.status==='closed').map(t=>({symbol:t.symbol,pnlEur:t.pnl_eur||0,pnlPct:t.pnl_pct||0,strategy:t.strategy||'—',isOpen:false}))
                                ].sort((a,b)=>b.pnlEur-a.pnlEur)
                                const top4Rend_=allRendimientos_.slice(0,4)
                                const bot4Rend_=allRendimientos_.slice(-4).reverse()
                                if(!allRendimientos_.length) return <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a'}}>Sin datos</div>
                                return <>
                                  {top4Rend_.map((t,i)=>renderRow(t,i))}
                                  {top4Rend_.length>0&&bot4Rend_.length>0&&<div style={{borderTop:'1px dashed #1a2d45',margin:'2px 0'}}/>}
                                  {bot4Rend_.map((t,i)=>renderRow(t,i))}
                                </>
                              })()}
                            </div>
                          </div>
                          </div>
                          {/* GRÁFICOS DETALLADOS (scroll) */}
                          <div style={{flexShrink:0,overflowY:'auto'}}>
                            <div style={{padding:'5px 14px 3px',fontFamily:MONO,fontSize:11,color:'#e2e8f0',letterSpacing:'0.1em',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>Gráficos detallados</div>
                            {eqDisp.length>1&&<div id="tlDetailEquity" style={{height:'calc(100vh - 30px)',position:'relative',display:'flex',flexDirection:'column'}}><TlEquityChart curve={eqDisp} curveSinFx={sfxDisp.length>1?sfxDisp:null} curveSinComm={scommDisp.length>1?scommDisp:null} curveWithContribs={cwcDisp.length>1?cwcDisp:null} curveBH={bhDisp?.length>1?bhDisp:null} showBH={tlShowBH} onToggleBH={async()=>{const next=!tlShowBH;setTlShowBH(next);if(next&&!tlBHData){const first=contributions.filter(c=>c.type==='aportacion').sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0]?.date;const r=await fetch('/api/sp500history'+(first?'?from='+first:''));if(r.ok){const{history}=await r.json();setTlBHData(history||[])}}}} equityMode={tlEquityMode} onToggleMode={()=>setTlEquityMode(m=>m==='pnl'?'equity':'pnl')} contributions={contributions} showWithContribs={showWithContribs} onToggleContribs={()=>setShowWithContribs(v=>!v)} curveFloat={floatCurveDisp.length>1?floatCurveDisp:null} floatLoading={floatLoading} showFloat={tlShowFloat} onToggleFloat={()=>setTlShowFloat(v=>!v)} onFirstFloat={triggerFloatFetch} height={typeof window!=='undefined'?window.innerHeight-30:700} showTimeScale={true} syncRef={tlDashSyncRef}/></div>}
                            {investData.length>1&&<div id="tlDetailInvest" style={{height:'calc(100vh - 30px)',position:'relative',display:'flex',flexDirection:'column'}}><TlInvestChart investData={investData} syncRef={tlDashSyncRef} patrimonyCurve={cwcDisp.length>1?cwcDisp:null} height={typeof window!=='undefined'?window.innerHeight-30:700} compact={false}/></div>}
                            {(closed.length>0||openTrades.length>0)&&(
                              <div id="tlDetailPnl" style={{height:'calc(100vh - 30px)',padding:'12px 16px 8px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexShrink:0}}>
                                  <span style={{fontFamily:MONO,fontSize:11,color:'#e2e8f0',letterSpacing:'0.08em',textTransform:'uppercase'}}>
                                    {tlPnlView==='operacion'?'P&L por operación':'P&L por estrategia'}
                                  </span>
                                  <div style={{display:'flex',gap:3}}>
                                    {['operacion','estrategia'].map(v=>(
                                      <button key={v} onClick={()=>setTlPnlView(v)} style={{fontFamily:MONO,fontSize:8,padding:'2px 6px',borderRadius:3,border:'1px solid',cursor:'pointer',borderColor:tlPnlView===v?'#00d4ff':'#1a2d45',background:tlPnlView===v?'rgba(0,212,255,0.1)':'transparent',color:tlPnlView===v?'#00d4ff':'#3d5a7a'}}>
                                        {v==='operacion'?'Op.':'Estrat.'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {tlPnlView==='operacion'?(
                                  (()=>{
                                    const trades=[...closed.map(t=>({...t,isOpen:false})),...openTrades.map(t=>({...t,pnl_eur:t._pnl_float_eur||0,isOpen:true}))]
                                    const mx=Math.max(...trades.map(t=>Math.abs(t.pnl_eur||0)),1)
                                    const total=trades.length||1
                                    const levels=[mx,mx*0.5,0,-mx*0.5,-mx]
                                    return (
                                      <div style={{display:'flex',flex:1,minHeight:0,gap:0}}>
                                        <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',width:58,flexShrink:0,paddingRight:6,paddingBottom:2,fontFamily:MONO,fontSize:9,color:'#3d5a7a',textAlign:'right'}}>
                                          {levels.map((v,i)=>(
                                            <span key={i} style={{lineHeight:1}}>{(v>=0?'+':'')}{'€'+Math.round(v)}</span>
                                          ))}
                                        </div>
                                        <div style={{flex:1,position:'relative',minWidth:0}}>
                                          {[0,25,50,75,100].map(pct=>(
                                            <div key={pct} style={{position:'absolute',left:0,right:0,top:pct+'%',height:1,background:pct===50?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
                                          ))}
                                          {trades.map((t,i)=>{
                                            const isW=(t.pnl_eur||0)>=0
                                            const pct=Math.max(1,Math.abs(t.pnl_eur||0)/mx*48)
                                            const barW=Math.max(0.3,80/total)
                                            const barL=i/total*100
                                            return (
                                              <div key={i}
                                                title={t.symbol+' '+(isW?'+':'')+('€'+Math.round(t.pnl_eur||0))+(t.isOpen?' (abierta)':'')}
                                                style={{position:'absolute',left:barL+'%',width:barW+'%',height:pct+'%',bottom:isW?'50%':undefined,top:isW?undefined:'50%',background:t.isOpen?(isW?'rgba(0,229,160,0.5)':'rgba(255,77,109,0.45)'):(isW?'#00e5a0':'#ff4d6d'),borderRadius:isW?'2px 2px 0 0':'0 0 2px 2px',opacity:0.85,border:t.isOpen?'1px solid '+(isW?'#00e5a0':'#ff4d6d'):'none'}}
                                              />
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })()
                                ):(
                                  (()=>{
                                    const data=tlPnlByStrategy
                                    const mx=Math.max(...data.map(d=>Math.abs(d.pnl)),1)
                                    const total=data.length||1
                                    const levels=[mx,mx*0.5,0,-mx*0.5,-mx]
                                    return (
                                      <div style={{display:'flex',flex:1,minHeight:0,gap:0}}>
                                        <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',width:58,flexShrink:0,paddingRight:6,paddingBottom:2,fontFamily:MONO,fontSize:9,color:'#3d5a7a',textAlign:'right'}}>
                                          {levels.map((v,i)=>(
                                            <span key={i} style={{lineHeight:1}}>{(v>=0?'+':'')}{'€'+Math.round(v)}</span>
                                          ))}
                                        </div>
                                        <div style={{flex:1,position:'relative',minWidth:0}}>
                                          {[0,25,50,75,100].map(pct=>(
                                            <div key={pct} style={{position:'absolute',left:0,right:0,top:pct+'%',height:1,background:pct===50?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
                                          ))}
                                          {data.map((d,i)=>{
                                            const isW=d.pnl>=0
                                            const pct=Math.max(1,Math.abs(d.pnl)/mx*48)
                                            const barW=Math.max(0.3,80/total)
                                            const barL=i/total*100
                                            return (
                                              <Fragment key={i}>
                                                <div style={{position:'absolute',left:barL+'%',width:barW+'%',...(isW?{bottom:`calc(50% + ${pct}% + 2px)`}:{top:`calc(50% + ${pct}% + 2px)`}),textAlign:'center',fontFamily:MONO,fontSize:7,color:'#f59e0b',overflow:'hidden',whiteSpace:'nowrap',pointerEvents:'none',lineHeight:1}}>{d.name.split(' ')[0]}</div>
                                                <div title={d.name+' ('+d.count+' ops) '+(isW?'+':'')+'€'+Math.round(d.pnl)} style={{position:'absolute',left:barL+'%',width:barW+'%',height:pct+'%',bottom:isW?'50%':undefined,top:isW?undefined:'50%',background:isW?'rgba(34,197,94,0.75)':'rgba(239,68,68,0.75)',borderRadius:isW?'2px 2px 0 0':'0 0 2px 2px',cursor:'default'}}/>
                                              </Fragment>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })()
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    {tlTab==='dashboard'&&(
                      <button onClick={()=>{let el=document.getElementById('tlDashOuter');while(el){if(el.scrollTop>0){el.scrollTo({top:0,behavior:'smooth'});return};el=el.parentElement};window.scrollTo({top:0,behavior:'smooth'})}}
                        style={{position:'fixed',top:60,right:20,zIndex:9999,background:'rgba(13,21,32,0.95)',border:'1px solid #1a2d45',color:'#00d4ff',fontFamily:MONO,fontSize:10,padding:'8px 14px',borderRadius:4,cursor:'pointer',boxShadow:'0 2px 12px rgba(0,0,0,0.5)'}}>
                        ↑ Dashboard
                      </button>
                    )}
                  </div>
                )}
                {/* CAPITAL */}
                {tlTab==='capital'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflowY:'auto',padding:'16px 20px'}}>
                    {(()=>{
                      const netContrib=contributions.filter(c=>c.type==='aportacion'||c.type==='retirada').reduce((s,c)=>s+(c.type==='retirada'?-1:1)*parseFloat(c.amount||0),0)
                      const divAcum=contributions.filter(c=>c.type==='dividendo').reduce((s,c)=>s+parseFloat(c.amount||0),0)
                      const closedPnl=tlTradesFiltered.filter(t=>t.status==='closed').reduce((s,t)=>s+parseFloat(t.pnl_eur||0),0)
                      const floatPnl=tlTradesFiltered.filter(t=>t.status==='open').reduce((s,t)=>{
                        const px=tlLivePrices[t.symbol]?.price!=null?parseFloat(tlLivePrices[t.symbol].price):null
                        const fxE=t.fx_entry||1
                        return s+(px!==null?(px-t.entry_price)*t.shares/fxE:(typeof t._pnl_float_eur==='number'?t._pnl_float_eur:0))
                      },0)
                      const patrimTotal=netContrib+divAcum+closedPnl+floatPnl
                      const fmtAmt=(v,signed=true)=>(signed&&v>=0?'+':'')+Math.round(v).toLocaleString('es-ES')+'€'
                      return(
                        <>
                          {/* Stat boxes — full width 3-col grid */}
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
                            {[
                              {label:'Capital neto aportado',val:fmtAmt(netContrib),col:netContrib>=0?'#2a7fff':'#ff4d6d'},
                              {label:'Dividendos acumulados',val:'+'+Math.round(divAcum).toLocaleString('es-ES')+'€',col:'#aaff44'},
                              {label:'Patrimonio total',val:fmtAmt(patrimTotal),col:patrimTotal>=0?'#00e5a0':'#ff4d6d'},
                            ].map(({label,val,col})=>(
                              <div key={label} style={{background:'#0d1824',border:'1px solid #1a2d45',borderRadius:8,padding:'12px 16px'}}>
                                <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>{label}</div>
                                <div style={{fontFamily:MONO,fontSize:20,fontWeight:700,color:col}}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {/* Add form — compact single row */}
                          <div style={{background:'#0d1824',border:'1px solid #1a2d45',borderRadius:8,padding:'10px 14px',marginBottom:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                            <input type="text" value={contribDate} onChange={e=>setContribDate(e.target.value)}
                              placeholder="DD/MM/YYYY" maxLength={10}
                              style={{fontFamily:MONO,fontSize:11,background:'#080c14',border:'1px solid #1e3a52',borderRadius:4,color:'#c8d8e8',padding:'4px 8px',width:100,flexShrink:0}}/>
                            <select value={contribType} onChange={e=>setContribType(e.target.value)}
                              style={{fontFamily:MONO,fontSize:11,background:'#080c14',border:'1px solid #1e3a52',borderRadius:4,color:'#c8d8e8',padding:'4px 8px',width:120,flexShrink:0}}>
                              <option value="aportacion">Aportación</option>
                              <option value="retirada">Retirada</option>
                              <option value="dividendo">Dividendo</option>
                            </select>
                            <input type="number" min="0.01" step="0.01" value={contribAmount} onChange={e=>setContribAmount(e.target.value)}
                              placeholder="€ Importe"
                              style={{fontFamily:MONO,fontSize:11,background:'#080c14',border:'1px solid #1e3a52',borderRadius:4,color:'#c8d8e8',padding:'4px 8px',width:110,flexShrink:0}}/>
                            <input type="text" value={contribNotes} onChange={e=>setContribNotes(e.target.value)}
                              placeholder="Notas (opcional)"
                              style={{fontFamily:MONO,fontSize:11,background:'#080c14',border:'1px solid #1e3a52',borderRadius:4,color:'#c8d8e8',padding:'4px 8px',flex:1,minWidth:100}}/>
                            <button onClick={addContribution} disabled={contribSaving||!contribDate||!contribAmount||parseFloat(contribAmount)<=0}
                              style={{fontFamily:MONO,fontSize:10,background:'#1a4a80',border:'1px solid #2a7fff',borderRadius:4,color:'#c8d8e8',padding:'5px 14px',cursor:'pointer',opacity:contribSaving?0.5:1,whiteSpace:'nowrap',flexShrink:0}}>
                              {contribSaving?'Guardando...':'+ Añadir'}
                            </button>
                          </div>
                          {/* Contributions table */}
                          <div style={{background:'#0a0f1a',border:'1px solid #1a2d45',borderRadius:8,overflow:'hidden'}}>
                            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                              <thead>
                                <tr style={{background:'#0d1824',borderBottom:'1px solid #1a2d45'}}>
                                  {['Fecha','Tipo','Importe','Notas',''].map(h=>(
                                    <th key={h} style={{padding:'7px 12px',textAlign:'left',color:'#3d5a7a',fontWeight:400,fontSize:9,letterSpacing:'0.08em',textTransform:'uppercase'}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {contributions.length===0&&(
                                  <tr><td colSpan={5} style={{padding:'20px 12px',color:'#3d5a7a',textAlign:'center',fontSize:10}}>Sin registros — añade tu primera aportación</td></tr>
                                )}
                                {contributions.map((c,i)=>{
                                  const TYPE_COLOR={aportacion:'#2a7fff',retirada:'#ff4d6d',dividendo:'#aaff44'}
                                  const TYPE_LABEL={aportacion:'Aportación',retirada:'Retirada',dividendo:'Dividendo'}
                                  const col=TYPE_COLOR[c.type]||'#7a9bc0'
                                  const isEditing=contribEditing===c.id
                                  const inp={fontFamily:MONO,fontSize:11,background:'#080c14',border:'1px solid #2a4a6a',borderRadius:3,color:'#c8d8e8',padding:'2px 6px'}
                                  if(isEditing) return(
                                    <tr key={c.id} style={{borderBottom:'1px solid #0d1520',background:'rgba(42,127,255,0.05)'}}>
                                      <td style={{padding:'4px 8px'}}>
                                        <input type="text" value={contribEditDate} onChange={e=>setContribEditDate(e.target.value)}
                                          placeholder="DD/MM/YYYY" maxLength={10} style={{...inp,width:88}}/>
                                      </td>
                                      <td style={{padding:'4px 8px'}}>
                                        <select value={contribEditType} onChange={e=>setContribEditType(e.target.value)} style={{...inp,width:100}}>
                                          <option value="aportacion">Aportación</option>
                                          <option value="retirada">Retirada</option>
                                          <option value="dividendo">Dividendo</option>
                                        </select>
                                      </td>
                                      <td style={{padding:'4px 8px'}}>
                                        <input type="number" min="0.01" step="0.01" value={contribEditAmount} onChange={e=>setContribEditAmount(e.target.value)}
                                          style={{...inp,width:80,textAlign:'right'}}/>
                                      </td>
                                      <td style={{padding:'4px 8px'}}>
                                        <input type="text" value={contribEditNotes} onChange={e=>setContribEditNotes(e.target.value)}
                                          placeholder="Notas" style={{...inp,width:'100%'}}/>
                                      </td>
                                      <td style={{padding:'4px 8px',textAlign:'right',whiteSpace:'nowrap'}}>
                                        <button onClick={()=>saveEditContrib(c.id)} title="Guardar"
                                          style={{fontFamily:MONO,fontSize:10,background:'#0d2a1a',border:'1px solid #00e5a0',borderRadius:3,color:'#00e5a0',padding:'2px 7px',cursor:'pointer',marginRight:4}}>✓</button>
                                        <button onClick={()=>setContribEditing(null)} title="Cancelar"
                                          style={{fontFamily:MONO,fontSize:10,background:'none',border:'1px solid #3d5a7a',borderRadius:3,color:'#5a7a9a',padding:'2px 7px',cursor:'pointer'}}>✕</button>
                                      </td>
                                    </tr>
                                  )
                                  return(
                                    <tr key={c.id} style={{borderBottom:'1px solid #0d1520',background:i%2===0?'transparent':'rgba(13,24,36,0.4)'}}>
                                      <td style={{padding:'6px 12px',color:'#c8d8e8'}}>{c.date?c.date.split('-').reverse().join('/'):''}</td>
                                      <td style={{padding:'6px 12px'}}>
                                        <span style={{background:col+'22',border:'1px solid '+col+'55',borderRadius:3,padding:'1px 6px',color:col,fontSize:9,letterSpacing:'0.06em'}}>{TYPE_LABEL[c.type]||c.type}</span>
                                      </td>
                                      <td style={{padding:'6px 12px',color:c.type==='retirada'?'#ff4d6d':'#c8d8e8',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
                                        {c.type==='retirada'?'-':c.type==='dividendo'?'D+':'+'}€{parseFloat(c.amount).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}
                                      </td>
                                      <td style={{padding:'6px 12px',color:'#5a7a9a',fontSize:10}}>{c.notes||'—'}</td>
                                      <td style={{padding:'6px 12px',textAlign:'right',whiteSpace:'nowrap'}}>
                                        <button onClick={()=>startEditContrib(c)} title="Editar"
                                          style={{fontFamily:MONO,fontSize:9,background:'none',border:'1px solid #1a3a5a',borderRadius:3,color:'#5a7a9a',padding:'2px 6px',cursor:'pointer',marginRight:4}}>✏</button>
                                        <button onClick={()=>deleteContribution(c.id)} title="Eliminar"
                                          style={{fontFamily:MONO,fontSize:9,background:'none',border:'1px solid #3d1a1a',borderRadius:3,color:'#ff4d6d',padding:'2px 6px',cursor:'pointer',opacity:0.7}}>✕</button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
                </div>
                {/* COLUMNA DERECHA — métricas siempre + detalle trade */}
                <div style={{width:tlTab==='dashboard'?0:tlResumenCollapsed?28:rightPanelW,flexShrink:0,borderLeft:tlTab==='dashboard'?'none':'1px solid var(--border)',background:'var(--bg2)',display:tlTab==='dashboard'?'none':'flex',flexDirection:'column',overflow:'hidden',position:'relative',transition:'width 0.18s ease'}}>
                  {/* Drag handle — igual que panel de estrategias */}
                  {!tlResumenCollapsed&&<div
                    onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                    style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,background:'transparent',transition:'background 0.15s'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}/>}
                  {/* Tira colapsada con botón de reapertura */}
                  {tlResumenCollapsed&&(
                    <button onClick={()=>setTlResumenCollapsed(false)} title="Expandir Resumen"
                      style={{width:'100%',height:'100%',background:'transparent',border:'none',cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',color:'#3d5a7a',
                        fontSize:14,padding:0,flexDirection:'column',gap:6}}
                      onMouseOver={e=>{e.currentTarget.style.color='#7a9bc0';e.currentTarget.style.background='rgba(255,255,255,0.02)'}}
                      onMouseOut={e=>{e.currentTarget.style.color='#3d5a7a';e.currentTarget.style.background='transparent'}}>
                      <span style={{fontSize:10}}>◀</span>
                    </button>
                  )}
                  {/* Contenido del panel (oculto cuando colapsado) */}
                  {!tlResumenCollapsed&&<>
                  {/* ── MÉTRICAS SIEMPRE VISIBLES — incluye flotantes ── */}
                  {(()=>{
                    const liveFloatEur=(t)=>{
                      const lp=tlLivePrices[t.symbol]
                      if(lp?.unavailable) return null
                      const px=lp?.price!=null?parseFloat(lp.price):null
                      if(px!==null){const fxE=t.fx_entry||1;return(px-t.entry_price)*t.shares/fxE}
                      return typeof t._pnl_float_eur==='number'?t._pnl_float_eur:0
                    }
                    const liveFloatPct=(t)=>{
                      const lp=tlLivePrices[t.symbol]
                      if(lp?.unavailable) return null
                      const px=lp?.price!=null?parseFloat(lp.price):null
                      if(px!==null&&t.entry_price>0)return(px/t.entry_price-1)*100
                      return typeof t._pnl_float_pct==='number'?t._pnl_float_pct:0
                    }
                    const open = tlTradesFiltered.filter(t=>t.status==='open')
                    const closed = tlTradesFiltered.filter(t=>t.status==='closed').slice().sort((a,b)=>(a.exit_date||'').localeCompare(b.exit_date||''))
                    const today=new Date().toISOString().split('T')[0]
                    // P&L
                    const pnlReal=closed.reduce((s,t)=>s+parseFloat(t.pnl_eur||0),0)
                    const pnlFloat=open.reduce((s,t)=>{const v=liveFloatEur(t);return s+(v!=null?v:0)},0)
                    const hasUnavailablePrices=Object.values(tlLivePrices).some(v=>v?.unavailable)
                    const unavailableSymbols=Object.entries(tlLivePrices).filter(([,v])=>v?.unavailable).map(([k])=>k)
                    const pnlTotal=pnlReal+pnlFloat+contributions.filter(c=>c.type==='dividendo').reduce((s,c)=>s+parseFloat(c.amount||0),0)
                    const commTotal=[...closed,...open].reduce((s,t)=>s+parseFloat(t.commission||0),0)
                    // Combinamos cerradas + abiertas con su P&L flotante para Win Rate, medias, días
                    const allWithPnl=[
                      ...closed.map(t=>({...t,_eff_pnl:parseFloat(t.pnl_eur)||0,_eff_pct:parseFloat(t.pnl_pct||0),_eff_dias:t.entry_date&&t.exit_date?Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000):0})),
                      ...open.map(t=>({...t,_eff_pnl:liveFloatEur(t),_eff_pct:liveFloatPct(t),_eff_dias:t.entry_date?Math.round((new Date(today)-new Date(t.entry_date))/86400000):0}))
                    ]
                    const wins=allWithPnl.filter(t=>t._eff_pnl>=0)
                    const losses=allWithPnl.filter(t=>t._eff_pnl<0)
                    // Win Rate: todas las ops. Ganadora si P&L >= 0 (incluye break-even y VRT si flotante positivo)
                    const wr=allWithPnl.length?allWithPnl.filter(t=>t._eff_pnl>=0).length/allWithPnl.length*100:0
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
                    // Capital actual en posiciones abiertas (filtradas — para CAGR base)
                    const capitalEmp=open.reduce((s,t)=>{
                      const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                      return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                    },0)
                    // V5.80: Patrimonio actual y Capital disponible usan TODOS los trades (ignoran filtro período)
                    // para reflejar el estado real de la cartera, no solo el período filtrado.
                    const _allOpen=(tlFifo.trades||[]).filter(t=>t.status==='open')
                    const capitalEmpAll=_allOpen.reduce((s,t)=>{
                      const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                      return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                    },0)
                    const pnlRealAll=(tlFifo.trades||[]).filter(t=>t.status==='closed').reduce((s,t)=>s+parseFloat(t.pnl_eur||0),0)
                    const pnlFloatAll=_allOpen.reduce((s,t)=>{
                      const lp=tlLivePrices[t.symbol]
                      if(lp?.unavailable) return s // skip — price fetch failed
                      const px=lp?.price!=null?parseFloat(lp.price):null
                      const fxE=t.fx_entry||1
                      return s+(px!==null?(px-t.entry_price)*t.shares/fxE:(typeof t._pnl_float_eur==='number'?t._pnl_float_eur:0))
                    },0)
                    const pnlTotalAll=pnlRealAll+pnlFloatAll
                    // CAGR base = máximo capital concurrente histórico, consistente con el pico del gráfico Capital Invertido
                    // Incluye comisión/2 en el capital de entrada igual que lo hace el invest chart
                    const capEvents=[];[...closed,...open].forEach(t=>{
                      const fxE2=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                      const cap=(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE2
                      const commHalf=parseFloat(t.commission||0)/2
                      capEvents.push({date:t.entry_date||today,delta:+cap+commHalf})
                      if(t.status==='closed') capEvents.push({date:t.exit_date||today,delta:-cap})
                    })
                    capEvents.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
                    let runCapEv=0,maxCapEv=0
                    capEvents.forEach(ev=>{runCapEv+=ev.delta;if(runCapEv>maxCapEv)maxCapEv=runCapEv})
                    const peakCapBase=Math.max(maxCapEv,capitalEmp>0?capitalEmp:0,1000)
                    // CAGR: si toggle "Con aportaciones" activo → base=capital neto aportado; sino → pico concurrente
                    const netContrib=contributions.reduce((s,c)=>s+(c.type==='retirada'?-1:1)*parseFloat(c.amount||0),0)
                    // Patrimonio actual (solo si hay aportaciones registradas)
                    const hasContribs=contributions.length>0
                    const capitalNeto=contributions.reduce((s,c)=>c.type==='aportacion'?s+parseFloat(c.amount||0):c.type==='retirada'?s-parseFloat(c.amount||0):s,0)
                    const dividendosAcum=contributions.filter(c=>c.type==='dividendo').reduce((s,c)=>s+parseFloat(c.amount||0),0)
                    const patrimonioActual=hasContribs?capitalNeto+dividendosAcum+pnlTotalAll:null
                    const capitalDisp=hasContribs&&patrimonioActual!=null?patrimonioActual-capitalEmpAll:null
                    const capitalBase=showWithContribs&&netContrib>0?netContrib:peakCapBase
                    const cagrLabel=showWithContribs&&netContrib>0?'global':'op.'
                    const cagrReal=aniosPeriodo&&pnlTotal!==0?
                      (Math.pow(Math.max((capitalBase+pnlTotal)/capitalBase,0.001),1/aniosPeriodo)-1)*100:null
                    const fmtEur=v=>v>=0?'+€'+Math.round(v):'-€'+Math.round(Math.abs(v))
                    // Max DD como % sobre capital base
                    const maxDDPct=maxDD>0?(maxDD/Math.max(peak,capitalBase,1)*100):0
                    // Mejor/Peor usa _eff_pnl (incluye flotante de abiertas)
                    const bestV=bestT?bestT._eff_pnl:null
                    const worstV=worstT?worstT._eff_pnl:null
                    const rows=[
                      {l:'Total Operaciones',
                       v:(tlTradesFiltered.filter(t=>t.status==='open').length+' ab. / '+tlTradesFiltered.filter(t=>t.status==='closed').length+' cerr.'),
                       c:'#ffd166',
                       tip:'Total posiciones registradas. Abiertas = en cartera ahora. Cerradas = ya liquidadas.'},
                      {l:'Patrimonio actual',
                       v:patrimonioActual!=null?(patrimonioActual>=0?'€':'-€')+Math.abs(Math.round(patrimonioActual)).toLocaleString('es-ES'):'—',
                       c:patrimonioActual==null?'#3d5a7a':patrimonioActual>=0?'#00e5a0':'#ff4d6d',
                       tip:'Capital neto aportado + dividendos acumulados + P&L total (realizado + flotante). Requiere registros en pestaña Capital.'},
                      {l:'Capital Empleado',
                       v:capitalEmpAll>0?'€'+Math.round(capitalEmpAll).toLocaleString('es-ES'):'—',
                       c:'#00d4ff',
                       tip:'Suma del capital actual en posiciones abiertas (acciones × precio entrada ÷ FX). No incluye P&L flotante. Siempre global, independiente del filtro de período.'},
                      {l:'Capital disponible',
                       v:capitalDisp!=null?(capitalDisp>=0?'€':'-€')+Math.abs(Math.round(capitalDisp)).toLocaleString('es-ES'):'—',
                       c:capitalDisp==null?'#3d5a7a':capitalDisp>=0?'#00e5a0':'#ff4d6d',
                       tip:'Patrimonio actual − Capital empleado. Liquidez estimada disponible fuera de posiciones abiertas.'},
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
                       v:closed.length?wr.toFixed(1)+'%':'—',
                       c:wr>=50?'#00e5a0':'#ff4d6d',
                       tip:'Ops con P&L > 0 ÷ total ops × 100. Incluye cerradas (P&L real) y abiertas (flotante actual). Una abierta cuenta como ganadora si su flotante es positivo.'},
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
                       tip:'P&L no realizado de las posiciones abiertas. Calculado como (precio actual − precio entrada) × acciones ÷ FX.',
                       warn:hasUnavailablePrices?`Precio no disponible para: ${unavailableSymbols.join(', ')}. Esos activos se excluyen del cálculo.`:null},
                      {l:'P&L total',
                       v:fmtEur(pnlTotal),
                       c:pnlTotal>=0?'#00e5a0':'#ff4d6d',
                       tip:'P&L realizado + P&L flotante. Representa el resultado global de toda la cartera en este momento.'},
                      {l:'Comisiones',
                       v:commTotal>0?'-€'+commTotal.toFixed(2):'—',
                       c:'#ff4d6d',
                       tip:'Suma de commission_buy + commission_sell de todas las operaciones. No están descontadas del P&L mostrado si usas pnl_eur bruto.'},
                      {l:'Impacto FX €',
                       v:(()=>{
                         // Fórmula: (exit-entry)×shares×(1/fx_exit - 1/fx_entry) — solo cerradas
                         // Igual que la diferencia entre P&L real y Sin FX en la equity curve
                         const total=closed.reduce((s,t)=>{
                           const fxE=parseFloat(t.fx_entry||0)||1
                           const fxX=parseFloat(t.fx_exit||t.fx_entry||0)||fxE
                           return s+(parseFloat(t.exit_price||0)-parseFloat(t.entry_price||0))*parseFloat(t.shares||0)*(1/fxX-1/fxE)
                         },0)
                         return total!==0?(total>=0?'+€':'-€')+Math.abs(total).toFixed(2):'€0.00'
                       })(),
                       c:'#ffd166',
                       tip:'Impacto del tipo de cambio en el P&L realizado (solo cerradas). Igual que la diferencia entre "P&L real" y "Sin FX" en la equity curve. Positivo = EUR débil favoreció tus USD. Negativo = EUR fuerte penalizó.'},
                      {l:'Factor Beneficio',
                       v:factorBen!=null?factorBen.toFixed(2):'—',
                       c:factorBen!=null&&factorBen>=1?'#00e5a0':'#ff4d6d',
                       tip:'Ganancia media € ganador ÷ pérdida media € perdedor. >1 = expectativa positiva. Incluye abiertas por su flotante actual.'},
                      {l:'CAGR '+cagrLabel+' ('+(aniosPeriodo?aniosPeriodo.toFixed(2):'—')+'a)',
                       v:cagrReal!=null?(cagrReal>=0?'+':'')+cagrReal.toFixed(2)+'%':'—',
                       c:cagrReal!=null&&cagrReal>=0?'#00e5a0':'#ff4d6d',
                       tip:'Tasa anual compuesta. op. = base pico capital desplegado. global = base capital neto aportado.'},
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
                        <div style={{padding:'4px 6px 4px 10px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <span>Resumen</span>
                          <div style={{display:'flex',gap:4,alignItems:'center'}}>
                            {result&&metrics&&sidePanel!=='multi'&&sidePanel!=='tradelog'&&(
                              <button onClick={()=>setMetricsLayout(l=>l==='grid'?'panel':l==='panel'?'multi':'grid')}
                                title={metricsLayout==='grid'?'Panel simple':metricsLayout==='panel'?'Multi-columna':'Grid'}
                                style={{background:'transparent',border:'1px solid #1a2d45',color:'#3d5a7a',fontFamily:MONO,fontSize:9,
                                  padding:'2px 6px',borderRadius:3,cursor:'pointer',letterSpacing:'normal',textTransform:'none'}}>
                                {metricsLayout==='grid'?'☰':metricsLayout==='panel'?'⊞':'⊟'}
                              </button>
                            )}
                            {sidePanel==='tradelog'&&(
                              <button onClick={()=>setTlResumenCollapsed(true)} title="Contraer panel"
                                style={{background:'transparent',border:'1px solid #1a2d45',color:'#3d5a7a',fontFamily:MONO,
                                  fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                  letterSpacing:'normal',textTransform:'none',lineHeight:1}}
                                onMouseOver={e=>{e.currentTarget.style.borderColor='#4a7fa0';e.currentTarget.style.color='#7a9bc0'}}
                                onMouseOut={e=>{e.currentTarget.style.borderColor='#1a2d45';e.currentTarget.style.color='#3d5a7a'}}>
                                ▶
                              </button>
                            )}
                          </div>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse'}}>
                          <tbody>
                            {rows.map(({l,v,c,tip,warn})=>(
                              <MetricRow key={l} label={l} value={v} color={c} tip={tip} warn={warn}/>
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
                </>}
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
          <div style={{position:'fixed',inset:0,zIndex:chartFullscreen?10000:300,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80}}
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

              {/* Constructor visual SI [indicador] [operación] [parámetros] */}
              {alarmForm.condition!=='price_level'&&!linkedCond&&(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <span style={{fontSize:10,color:'var(--text3)'}}>Condición</span>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center',
                    background:'rgba(0,0,0,0.2)',border:'1px solid var(--border)',borderRadius:6,padding:'10px 12px'}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95',fontWeight:700}}>SI</span>
                    {/* Indicador */}
                    <select value={(()=>{
                      const c=alarmForm.condition||'ema_cross_up'
                      if(c.startsWith('ema_cross')||c.startsWith('price_above_ema')||c.startsWith('price_below_ema')) return 'EMA'
                      if(c.startsWith('price_above_ma')||c.startsWith('price_below_ma')) return 'MA'
                      if(c.startsWith('rsi_')) return 'RSI'
                      if(c.startsWith('macd_')) return 'MACD'
                      return 'EMA'
                    })()} onChange={e=>{
                      const ind=e.target.value
                      const defaults={EMA:'ema_cross_up',MA:'price_above_ma',RSI:'rsi_cross_up',MACD:'macd_cross_up'}
                      setAlarmForm(p=>({...p,condition:defaults[ind],params:{}}))
                    }}
                      style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',
                        fontFamily:MONO,fontSize:11,padding:'4px 8px',borderRadius:4,cursor:'pointer',fontWeight:700}}>
                      <option value="EMA">EMA</option>
                      <option value="MA">Media móvil</option>
                      <option value="RSI">RSI</option>
                      <option value="MACD">MACD</option>
                    </select>
                    {/* Operación */}
                    <select value={alarmForm.condition||'ema_cross_up'} onChange={e=>setAlarmForm(p=>({...p,condition:e.target.value,params:{}}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',
                        fontFamily:MONO,fontSize:11,padding:'4px 8px',borderRadius:4,cursor:'pointer'}}>
                      {(()=>{
                        const c=alarmForm.condition||'ema_cross_up'
                        if(c.startsWith('ema_cross')||c.startsWith('price_above_ema')||c.startsWith('price_below_ema')) return(<>
                          <option value="ema_cross_up">cruza al alza</option>
                          <option value="ema_cross_down">cruza a la baja</option>
                          <option value="price_above_ema">precio por encima</option>
                          <option value="price_below_ema">precio por debajo</option>
                        </>)
                        if(c.startsWith('price_above_ma')||c.startsWith('price_below_ma')) return(<>
                          <option value="price_above_ma">precio por encima</option>
                          <option value="price_below_ma">precio por debajo</option>
                        </>)
                        if(c.startsWith('rsi_')) return(<>
                          <option value="rsi_cross_up">cruza al alza nivel</option>
                          <option value="rsi_cross_down">cruza a la baja nivel</option>
                          <option value="rsi_above">por encima de nivel</option>
                          <option value="rsi_below">por debajo de nivel</option>
                        </>)
                        if(c.startsWith('macd_')) return(<>
                          <option value="macd_cross_up">cruza señal al alza</option>
                          <option value="macd_cross_down">cruza señal a la baja</option>
                        </>)
                      })()}
                    </select>
                  </div>
                  {/* Parámetros inline */}
                  {(()=>{
                    const c=alarmForm.condition||'ema_cross_up'
                    const isEMA=c.startsWith('ema_cross')||c.startsWith('price_above_ema')||c.startsWith('price_below_ema')
                    const isMA=c.startsWith('price_above_ma')||c.startsWith('price_below_ma')
                    const isRSI=c.startsWith('rsi_')
                    const isMACD=c.startsWith('macd_')
                    const INP={background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:14,padding:'6px 10px',borderRadius:4,fontWeight:700,textAlign:'center',width:72}
                    if(isEMA) return(
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>Rápida</span>
                        <input type="number" value={alarmForm.ema_r||10} min={1} onChange={e=>setAlarmForm(p=>({...p,ema_r:Number(e.target.value)}))} style={INP}/>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>Lenta</span>
                        <input type="number" value={alarmForm.ema_l||11} min={1} onChange={e=>setAlarmForm(p=>({...p,ema_l:Number(e.target.value)}))} style={{...INP,border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d'}}/>
                      </div>
                    )
                    if(isMA) return(
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>Período</span>
                        <input type="number" value={alarmForm.params?.ma_period||50} min={1} onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,ma_period:Number(e.target.value)}}))} style={INP}/>
                      </div>
                    )
                    if(isRSI) return(
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>Período</span>
                        <input type="number" value={alarmForm.params?.period||14} min={2} max={50} onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,period:Number(e.target.value)}}))} style={INP}/>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>Nivel</span>
                        <input type="number" value={alarmForm.params?.level||30} min={1} max={99} onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,level:Number(e.target.value)}}))} style={{...INP,border:'1px solid rgba(0,212,255,0.4)',color:'#00d4ff'}}/>
                      </div>
                    )
                    if(isMACD) return(
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {[['fast','Rápida',12],['slow','Lenta',26],['signal','Señal',9]].map(([k,l,d])=>(
                          <div key={k} style={{display:'flex',gap:4,alignItems:'center'}}>
                            <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>{l}</span>
                            <input type="number" value={alarmForm.params?.[k]||d} min={1} onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)}}))} style={{...INP,width:56}}/>
                          </div>
                        ))}
                      </div>
                    )
                    return null
                  })()}
                </div>
              )}
              {/* Params display when library condition is linked */}
              {alarmForm.condition!=='price_level'&&linkedCond&&(
                <div style={{background:'rgba(0,212,255,0.06)',border:'1px solid rgba(0,212,255,0.15)',borderRadius:5,padding:'8px 12px',fontSize:11,color:'#00d4ff'}}>
                  ✓ Usando parámetros de: <b>{linkedCond.name}</b>
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

    {/* ── Tooltip flotante Watchlist ── */}
    {wlTooltip&&(()=>{
      const tSym=(wlTooltip.symbol||'').toUpperCase()
      const tItem=watchlist.find(w=>(w.symbol||'').toUpperCase()===tSym)
      const tAct=wlData[tSym]?.active
      const tTop=wlData[tSym]?.top
      const sameStrat=tAct?.stratName&&tTop?.stratName&&tAct.stratName===tTop.stratName
      const fv=(v,decimals=1)=>v!=null?fmt(v,decimals):null
      const cagrColor=v=>v==null?'#4a7a95':v>=0?'#00e5a0':'#ff4d6d'
      const wrColor=v=>v==null?'#4a7a95':v>=50?'#00e5a0':'#ffd166'
      // Filas comparativas: [label, fnActiva, fnTop]
      const rows=[
        ['Estrategia', tAct?.stratName||null, tTop?.stratName||null, s=>s, ()=>'#ffd166'],
        ['Temporalidad', tAct?.intervalo||null, tTop?.intervalo||null, s=>s==='semanal'?'Semanal':'Diario', ()=>'#8aadcc'],
        ['CAGR', tAct?.cagr??null, tTop?.cagr??null, v=>fv(v,1)+'%', cagrColor],
        ['Max DD', tAct?.maxDD??null, tTop?.maxDD??null, v=>'-'+fv(Math.abs(v),1)+'%', ()=>'#ff7eb3'],
        ['Win Rate', tAct?.winRate??null, tTop?.winRate??null, v=>fv(v,0)+'%', wrColor],
        ['Ops', tAct?.ops??null, tTop?.ops??null, v=>v!=null?String(Math.round(v)):null, ()=>'#8aadcc'],
      ]
      return(
        <div style={{position:'fixed',left:wlTooltip.x,top:wlTooltip.y,zIndex:9999,
          background:'#090f18',border:'1px solid #1e3048',borderRadius:7,
          padding:'10px 13px',maxWidth:320,minWidth:180,
          boxShadow:'0 6px 24px rgba(0,0,0,0.65)',
          fontFamily:MONO,fontSize:11,color:'#c8dff5',pointerEvents:'none',lineHeight:1.4}}>
          {/* Encabezado */}
          <div style={{fontWeight:700,fontSize:13,color:'#e8f4ff',marginBottom:1}}>{tItem?.name||wlTooltip.symbol}</div>
          <div style={{fontSize:10,color:'#4a7a95',marginBottom:8}}>{wlTooltip.symbol}</div>
          {/* Tabla comparativa */}
          {(tAct||tTop)&&(
            <div style={{borderTop:'1px solid #1a2d40',paddingTop:8}}>
              {/* Cabeceras de columna cuando hay dos estrategias distintas */}
              {!sameStrat&&(tAct?.stratName||tTop?.stratName)&&(
                <div style={{display:'grid',gridTemplateColumns:'70px 1fr 1fr',gap:4,marginBottom:6}}>
                  <span/>
                  <span style={{fontSize:9,color:'#4a7a95',textAlign:'right'}}>Activa</span>
                  <span style={{fontSize:9,color:sameStrat?'#4a7a95':'#ff9500',textAlign:'right'}}>Top</span>
                </div>
              )}
              {rows.map(([label,vAct,vTop,fmtFn,colorFn])=>{
                const aStr=vAct!=null?fmtFn(vAct):null
                const tStr=vTop!=null?fmtFn(vTop):null
                if(!aStr&&!tStr) return null
                return(
                  <div key={label} style={{display:'grid',gridTemplateColumns:'70px 1fr'+(sameStrat?'':' 1fr'),gap:4,marginBottom:3,alignItems:'start'}}>
                    <span style={{color:'#3d5a7a',fontSize:10}}>{label}</span>
                    {sameStrat
                      ? <span style={{color:colorFn(vAct),fontWeight:600,textAlign:'right',wordBreak:'break-word'}}>{aStr||'—'}</span>
                      : <>
                          <span style={{color:colorFn(vAct),fontWeight:600,textAlign:'right',wordBreak:'break-word'}}>{aStr||'—'}</span>
                          <span style={{color:colorFn(vTop),fontWeight:600,textAlign:'right',wordBreak:'break-word'}}>{tStr||'—'}</span>
                        </>
                    }
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })()}

    {/* ── Modal de configuración global ── */}
    {settingsOpen&&<SettingsModal onClose={()=>{
      setSettingsOpen(false);setTemaKey(k=>k+1);
      try{const t=JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.autoRefreshThreshold;if(t!=null)setAlertThreshold(Number(t))}catch(_){}
    }} strategies={strategies} initialTab={settingsInitTab}/>}

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
              <span style={{fontWeight:700,color:'#c8dff5',fontSize:14}}>{tlForm.id?'Editar fill':'Nuevo fill'}</span>
              <span onClick={()=>setTlFormOpen(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:20,lineHeight:1}}>×</span>
            </div>
            {/* Fila 1: BUY/SELL toggle + símbolo */}
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:10,alignItems:'end'}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Tipo *</span>
                <div style={{display:'flex',gap:0,borderRadius:4,overflow:'hidden',border:'1px solid #1a2d45'}}>
                  {['buy','sell'].map(t=>(
                    <button key={t} onClick={()=>setTlForm(f=>({...f,fill_type:t}))}
                      style={{fontFamily:MONO,fontSize:11,padding:'5px 14px',cursor:'pointer',border:'none',
                        background:tlForm.fill_type===t?(t==='buy'?'rgba(0,229,160,0.2)':'rgba(255,77,109,0.2)'):'transparent',
                        color:tlForm.fill_type===t?(t==='buy'?'#00e5a0':'#ff4d6d'):'#5a7a95',fontWeight:tlForm.fill_type===t?700:400}}>
                      {t==='buy'?'▲ BUY':'▼ SELL'}
                    </button>
                  ))}
                </div>
              </label>
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
                {tlForm._symSearch&&tlForm._symSearch.length>=1&&(()=>{
                  const q=tlForm._symSearch
                  const wlHits=watchlist.filter(w=>w.symbol.includes(q)||(w.name||'').toUpperCase().includes(q)).slice(0,4)
                  const wlSyms=new Set(wlHits.map(w=>w.symbol))
                  const dictHits=Object.entries(SYM_NAMES).filter(([s,n])=>!wlSyms.has(s)&&(s.includes(q)||n.toUpperCase().includes(q))).slice(0,5)
                  const allHits=[...wlHits.map(w=>({symbol:w.symbol,name:w.name})),...dictHits.map(([s,n])=>({symbol:s,name:n}))]
                  if(!allHits.length) return null
                  return(
                    <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,
                      background:'#0d1824',border:'1px solid #1e3a52',borderRadius:4,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.7)',maxHeight:200,overflowY:'auto',marginTop:2}}>
                      {allHits.map(hit=>(
                        <div key={hit.symbol} onMouseDown={e=>{
                          e.preventDefault()
                          const sym=hit.symbol, cur='USD'
                          setTlForm(f=>({...f,symbol:sym,currency:cur,_symSearch:'',price:'',_fxLoading:false}))
                          apiFetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({simbolo:sym,cfg:{emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}})})
                            .then(r=>r.json())
                            .then(j=>{ if(j.meta?.ultimoPrecio) setTlForm(f=>({...f,price:String(j.meta.ultimoPrecio.toFixed(2))})) })
                            .catch(()=>{})
                          if(cur!=='EUR') tlFetchFx(cur, tlForm.date)
                        }}
                        style={{padding:'6px 10px',cursor:'pointer',display:'flex',justifyContent:'space-between',
                          alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)',fontFamily:MONO,fontSize:11}}
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
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha *</span>
                <input type="text" placeholder="dd/mm/yyyy"
                  value={tlForm.date}
                  onChange={e=>{
                    let v=e.target.value.replace(/[^0-9/]/g,'')
                    if(v.length===2&&!v.includes('/')) v=v+'/'
                    if(v.length===5&&v.split('/').length===2) v=v+'/'
                    if(v.length>10) v=v.slice(0,10)
                    setTlForm(f=>({...f,date:v}))
                    if(v.length===10&&tlForm.currency&&tlForm.currency!=='EUR'&&!tlForm.fx_manual)
                      tlFetchFx(tlForm.currency, v)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Precio *</span>
                <input type="number" placeholder="0.00" value={tlForm.price}
                  onChange={e=>setTlForm(f=>({...f,price:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Acciones *</span>
                <input type="number" placeholder="0" value={tlForm.shares}
                  onChange={e=>setTlForm(f=>({...f,shares:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
            </div>
            {/* Fila 4: divisa, comisión, FX */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Divisa</span>
                <select value={tlForm.currency} onChange={e=>{
                    const cur=e.target.value
                    if(cur==='EUR'){setTlForm(f=>({...f,currency:cur,fx:'1',fx_manual:false}));return}
                    setTlForm(f=>({...f,currency:cur,fx:'',fx_manual:false}))
                    tlFetchFx(cur, tlForm.date)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  <option>USD</option><option>EUR</option><option>GBP</option><option>CHF</option><option>JPY</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión (€)</span>
                <input type="number" min="0" step="0.01" value={tlForm.commission} onChange={e=>setTlForm(f=>({...f,commission:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>FX <span style={{color:'#3d5a7a'}}>(opt.)</span></span>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <input type="number" step="0.0001" placeholder={tlForm._fxLoading?'Cargando…':'auto'} value={tlForm.fx} onChange={e=>setTlForm(f=>({...f,fx:e.target.value,fx_manual:true}))}
                    style={{flex:1,background:'var(--bg3)',border:`1px solid ${tlForm.fx_manual?'#ffd166':tlForm.fx?'#00e5a0':'var(--border)'}`,color:tlForm._fxLoading?'#5a7a95':'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  {tlForm.fx_manual&&<span onClick={()=>setTlForm(f=>({...f,fx:'',fx_manual:false}))} title="Usar automático" style={{cursor:'pointer',color:'#ffd166',fontSize:14}}>↺</span>}
                </div>
              </label>
            </div>
            {/* Fila 5: estrategia, notas */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Estrategia{tlForm.id&&!tlForm._isFirstBuy&&<span style={{color:'#3d5a7a',marginLeft:4,fontSize:9}}>(solo editable en el 1er BUY)</span>}</span>
                <select value={tlForm.strategy||''} onChange={e=>setTlForm(f=>({...f,strategy:e.target.value}))}
                  disabled={!!(tlForm.id&&!tlForm._isFirstBuy)}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:tlForm.id&&!tlForm._isFirstBuy?'#3d5a7a':'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4,opacity:tlForm.id&&!tlForm._isFirstBuy?0.45:1,cursor:tlForm.id&&!tlForm._isFirstBuy?'not-allowed':'auto'}}>
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
            {/* Botones */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:4,borderTop:'1px solid var(--border)'}}>
              {tlForm.id?(
                <button onClick={async()=>{
                  if(!window.confirm('¿Eliminar este fill? Esta acción no se puede deshacer.')) return
                  try{
                    await tlDeleteTrade(tlForm.id)
                    setTlFormOpen(false)
                  }catch(e){alert('Error: '+e.message)}
                }}
                  style={{fontFamily:MONO,fontSize:11,padding:'6px 12px',borderRadius:4,cursor:'pointer',
                    background:'rgba(255,77,109,0.1)',border:'1px solid #ff4d6d',color:'#ff4d6d'}}>
                  Eliminar
                </button>
              ):<div/>}
              <button onClick={async()=>{
                try{
                  const isoDate = toIsoDate(tlForm.date)||tlForm.date
                  let fill = {...tlForm, date: isoDate, import_source: tlForm.import_source||'manual'}
                  delete fill._symSearch; delete fill._fxLoading; delete fill.fx_manual
                  if(fill.currency&&fill.currency!=='EUR'&&!fill.fx){
                    try{
                      const r=await fetch(`/api/tradelog?action=fx&currency=${fill.currency}&date=${isoDate||new Date().toISOString().slice(0,10)}`)
                      const j=await r.json()
                      if(j.fx) fill={...fill,fx:parseFloat(j.fx).toFixed(4)}
                    }catch(_){}
                  } else if(fill.currency==='EUR'){
                    fill={...fill,fx:'1'}
                  }
                  await tlSaveFill(fill)
                  setTlFormOpen(false)
                  setSidePanel('tradelog')
                }catch(e){alert('Error al guardar: '+e.message)}
              }}
                style={{fontFamily:MONO,fontSize:11,padding:'6px 18px',borderRadius:4,cursor:'pointer',
                  background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700}}>
                {tlForm.id?'Guardar cambios':'Guardar fill'}
              </button>
            </div>
          </div>
        </div>
      )}
  </>
  )
}
