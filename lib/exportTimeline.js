// lib/exportTimeline.js — Exportar Timeline de backtesting multiactivo a Excel (SheetJS)
// Llamado 100% client-side; no involucra al servidor salvo el re-run ilimitado.

import * as XLSX from 'xlsx'

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Helpers de formato español ─────────────────────────────────────────────────
function fmtPct(v) {
  if (v == null || isNaN(v)) return '-'
  const sign = v >= 0 ? '+' : ''
  return sign + v.toFixed(1).replace('.', ',') + '%'
}
function fmtEur(v) {
  if (v == null || isNaN(v)) return '-'
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  // punto = miles, coma = decimal
  const formatted = abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return sign + formatted + '€'
}

// ── Color de fondo según P&L% ──────────────────────────────────────────────────
function bgColor(pct, { isOngoing = false, isDiscarded = false, noActivity = false } = {}) {
  if (noActivity)  return '0d0d1f'
  if (isDiscarded) return '2d2d2d'
  if (isOngoing) {
    // Versión pastel/oscura del color final
    if (pct >  20) return '093a18'
    if (pct >   5) return '0e4a28'
    if (pct >=  0) return '123320'
    if (pct >  -5) return '3d1212'
    if (pct > -15) return '3a0e0e'
    return '280909'
  }
  if (pct >  20) return '0d6e2e'
  if (pct >   5) return '16a34a'
  if (pct >=  0) return '22c55e'
  if (pct >  -5) return 'ef4444'
  if (pct > -15) return 'dc2626'
  return '991b1b'
}

// ── Constructor de celda SheetJS ───────────────────────────────────────────────
function mkCell(v, bg, fg = 'e2e8f0', bold = false, sz = 9, halign = 'center') {
  return {
    v: v == null ? '' : v,
    t: typeof v === 'number' ? 'n' : 's',
    s: {
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { color: { rgb: fg }, bold, sz, name: 'Calibri' },
      alignment: { horizontal: halign, vertical: 'center', wrapText: false },
    },
  }
}

function setC(ws, r, c, cellObj) {
  ws[XLSX.utils.encode_cell({ r, c })] = cellObj
}

// ── Rango de meses entre dos fechas (inclusive) ────────────────────────────────
function monthRange(startDate, endDate) {
  const s = new Date(startDate + 'T00:00:00')
  s.setDate(1)
  const e = new Date(endDate + 'T00:00:00')
  e.setDate(1)
  const months = []
  const cur = new Date(s)
  while (cur <= e) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

// ── Comprobar si date (YYYY-MM-DD) está en el mes (year, month 0-indexed) ─────
function inMonth(date, year, month) {
  if (!date) return false
  return date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
}
// ── Inicio de mes siguiente como string YYYY-MM-DD ────────────────────────────
function nextMonthStr(year, month) {
  const d = new Date(year, month + 1, 1)
  return d.toISOString().split('T')[0]
}

// ── Función principal ──────────────────────────────────────────────────────────
// mcResult: resultado del backtest (con allTrades, startDate, slotCapital, modoAsig)
// mcSelected: array de símbolos seleccionados
// baseCfg: configuración usada (capitalIni, sizeRules, ...)
// strategyId, isNoStrategy, filtros, mcIntervalo, weightsNorm: para el re-run
// apiFetch: wrapper de fetch con JWT
// stratName: nombre de la estrategia (para el nombre del archivo)
export async function exportTimeline({
  mcResult, mcSelected, baseCfg, strategyId, isNoStrategy, filtros,
  mcIntervalo, weightsNorm, apiFetch, stratName = 'estrategia',
}) {
  const allTrades  = mcResult.allTrades || []
  const modoAsig   = mcResult.modoAsig  || 'slots'
  const startDate  = mcResult.startDate || '2000-01-01'
  const symbols    = (mcSelected || []).filter(Boolean)
  const slotCap    = mcResult.slotCapital || baseCfg?.capitalIni || 1000
  const maxSlots   = baseCfg?.sizeRules?.maxPosiciones || 5

  // Determinar fecha final del período
  const lastExitDate = allTrades
    .map(t => t.exitDate || t.entryDate)
    .filter(Boolean).sort().slice(-1)[0] || new Date().toISOString().split('T')[0]

  const months = monthRange(startDate, lastExitDate)

  // ── Re-run ilimitado para señales descartadas ──────────────────────────────
  let unlimitedTrades = []
  if (modoAsig === 'concentrado' || modoAsig === 'compartido') {
    try {
      const unlimCfg = {
        ...baseCfg,
        sizeRules: { ...(baseCfg.sizeRules || {}), maxPosiciones: 9999 },
      }
      const res = await apiFetch('/api/multibacktest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols, modoAsig: 'concentrado', weights: weightsNorm || {},
          cfg: unlimCfg, strategyId, isNoStrategy, filtros, intervalo: mcIntervalo,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        unlimitedTrades = json.allTrades || []
      }
    } catch (_) { /* no discards info — proceed anyway */ }
  }

  // Señales descartadas = presentes en run ilimitado pero ausentes en run real
  const realKeys = new Set(allTrades.map(t => `${t.symbol}:${t.entryDate}`))
  const discarded = unlimitedTrades.filter(t => !realKeys.has(`${t.symbol}:${t.entryDate}`))

  // ── Construir hoja "Timeline" ──────────────────────────────────────────────
  const ws  = {}
  const mgs = []  // merges array
  const FIXED = 4   // columnas fijas: Activo, Ops, Win%, P&L€
  const totalCols = FIXED + months.length

  // — Cabeceras: Fila 0 (años), Fila 1 (meses), Fila 2 (headers fijos) —

  const HDR_BG = '0d1520', HDR_FG = '00d4ff', HDR_DIM = '1a2d45'

  // Fila 2: etiquetas fijas (cols 0-3)
  setC(ws, 2, 0, mkCell('Activo',   HDR_BG, HDR_FG,   true, 10, 'left'))
  setC(ws, 2, 1, mkCell('Ops',      HDR_BG, HDR_FG,   true,  9))
  setC(ws, 2, 2, mkCell('Win%',     HDR_BG, HDR_FG,   true,  9))
  setC(ws, 2, 3, mkCell('P&L€ Tot', HDR_BG, HDR_FG,   true,  9))

  // Fila 0+1 en cols 0-3: blank con merge
  for (let r = 0; r <= 1; r++)
    for (let c = 0; c <= 3; c++) setC(ws, r, c, mkCell('', HDR_BG))
  mgs.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 3 } })

  // Grupos de años (fila 0) y meses (fila 1)
  let prevYear = null, yearStartCol = FIXED
  months.forEach((m, mi) => {
    const col = FIXED + mi
    // Fila 0: año
    if (m.year !== prevYear) {
      // Cerrar grupo anterior
      if (prevYear !== null) {
        mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: col - 1 } })
      }
      setC(ws, 0, col, mkCell(String(m.year), HDR_BG, HDR_FG, true, 11))
      yearStartCol = col
      prevYear = m.year
    } else {
      setC(ws, 0, col, mkCell('', HDR_BG))
    }
    // Fila 1: mes
    setC(ws, 1, col, mkCell(MONTHS_ES[m.month], HDR_BG, '8ab8d4', false, 9))
    // Fila 2: blank en columnas de meses
    setC(ws, 2, col, mkCell('', HDR_DIM))
  })
  // Cerrar último grupo de años
  if (prevYear !== null) {
    const lastCol = FIXED + months.length - 1
    if (lastCol > yearStartCol)
      mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: lastCol } })
  }

  // — Filas de datos: 3 filas por activo —
  const sortedSymbols = [...symbols].sort()  // orden alfabético = mismo orden que el motor concentrado

  sortedSymbols.forEach((sym, si) => {
    const base = 3 + si * 3
    const symTrades    = allTrades.filter(t => t.symbol === sym)
    const symDiscarded = discarded.filter(t => t.symbol === sym)

    // Totales para columnas fijas
    const closed    = symTrades.filter(t => !t._virtualClose)
    const wins      = closed.filter(t => (t.pnlPct || 0) >= 0).length
    const totalOps  = closed.length
    const totalEur  = closed.reduce((s, t) => s + (t.pnlSimple || 0), 0)
    const winPct    = totalOps > 0 ? wins / totalOps * 100 : 0

    const FIX_BG  = '0d1520'
    const winFg   = winPct >= 50 ? '4ade80' : 'f87171'
    const pnlFg   = totalEur  >= 0 ? '4ade80' : 'f87171'

    // Cols fijas (3 filas cada una — merge)
    setC(ws, base,   0, mkCell(sym,                                    FIX_BG, '00d4ff', true,  10, 'left'))
    setC(ws, base+1, 0, mkCell('',                                     FIX_BG))
    setC(ws, base+2, 0, mkCell('',                                     FIX_BG))
    setC(ws, base,   1, mkCell(totalOps > 0 ? totalOps : '-',         FIX_BG, 'e2e8f0'))
    setC(ws, base+1, 1, mkCell('',                                     FIX_BG))
    setC(ws, base+2, 1, mkCell('',                                     FIX_BG))
    setC(ws, base,   2, mkCell(totalOps > 0 ? fmtPct(winPct) : '-',  FIX_BG, winFg,  true))
    setC(ws, base+1, 2, mkCell('',                                     FIX_BG))
    setC(ws, base+2, 2, mkCell('',                                     FIX_BG))
    setC(ws, base,   3, mkCell(totalOps > 0 ? fmtEur(totalEur) : '-', FIX_BG, pnlFg, true,   9, 'right'))
    setC(ws, base+1, 3, mkCell('',                                     FIX_BG))
    setC(ws, base+2, 3, mkCell('',                                     FIX_BG))

    mgs.push({ s: { r: base, c: 0 }, e: { r: base + 2, c: 0 } })
    mgs.push({ s: { r: base, c: 1 }, e: { r: base + 2, c: 1 } })
    mgs.push({ s: { r: base, c: 2 }, e: { r: base + 2, c: 2 } })
    mgs.push({ s: { r: base, c: 3 }, e: { r: base + 2, c: 3 } })

    // — Columnas de mes —
    months.forEach((m, mi) => {
      const col = FIXED + mi

      // Trades que cerraron este mes (excluye virtual close para cálculo de color)
      const exits = symTrades.filter(t =>
        inMonth(t.exitDate, m.year, m.month) && !t._virtualClose)

      // Trades que ENTRARON este mes
      const entries = symTrades.filter(t => inMonth(t.entryDate, m.year, m.month))

      // Trades en curso este mes (ni entran ni salen aquí)
      const mStart = `${m.year}-${String(m.month + 1).padStart(2, '0')}-01`
      const mNext  = nextMonthStr(m.year, m.month)
      const ongoingTrades = symTrades.filter(t => {
        const entered = t.entryDate < mStart
        const exitAfter = !t.exitDate || t.exitDate >= mNext
        const enteredThisMo = inMonth(t.entryDate, m.year, m.month)
        const exitedThisMo  = inMonth(t.exitDate, m.year, m.month)
        return entered && exitAfter && !enteredThisMo && !exitedThisMo
      })

      // Señales descartadas este mes
      const discThisMo = symDiscarded.filter(t => inMonth(t.entryDate, m.year, m.month))

      // — Color —
      let bg = '0d0d1f'
      let avgPct = 0

      if (exits.length > 0) {
        avgPct = exits.reduce((s, t) => s + (t.pnlPct || 0), 0) / exits.length
        bg = bgColor(avgPct)
      } else if (ongoingTrades.length > 0) {
        avgPct = ongoingTrades.reduce((s, t) => s + (t.pnlPct || 0), 0) / ongoingTrades.length
        bg = bgColor(avgPct, { isOngoing: true })
      } else if (entries.length > 0) {
        // Entró este mes pero cierra en uno posterior
        avgPct = entries.reduce((s, t) => s + (t.pnlPct || 0), 0) / entries.length
        bg = bgColor(avgPct, { isOngoing: true })
      } else if (discThisMo.length > 0) {
        bg = '2d2d2d'
      }

      // — Fila Ops (base+0): ▲ entradas, ▼ salidas, ✗ descartadas —
      const parts = []
      if (entries.length > 0) parts.push(entries.length === 1 ? '▲' : `▲${entries.length}`)
      if (exits.length > 0)   parts.push(exits.length   === 1 ? '▼' : `▼${exits.length}`)
      if (discThisMo.length > 0 && entries.length === 0) parts.push('✗')
      const opsText = parts.join(' ')

      // Colores de fuente
      const hasClosed = exits.length > 0
      const textFg = bg === '0d0d1f' ? '1e3a5f'
        : bg === '2d2d2d' ? '6b7280'
        : hasClosed ? (avgPct >= 0 ? 'bbf7d0' : 'fecaca')
        : 'a3b8cc'

      // — Fila % (base+1) —
      const pctText = hasClosed ? fmtPct(avgPct) : ''

      // — Fila € (base+2) —
      let eurText = ''
      if (hasClosed) {
        const totalMoEur = exits.reduce((s, t) => s + (t.pnlSimple || 0), 0)
        eurText = fmtEur(totalMoEur)
      }

      // Indicador de descartado cuando también hay entrada real: añadir ✗ en texto ops
      const opsFinal = discThisMo.length > 0 && entries.length > 0
        ? opsText + ' ✗'
        : opsText

      setC(ws, base,   col, mkCell(opsFinal,  bg, opsText ? 'e2e8f0' : textFg, opsText.length > 0))
      setC(ws, base+1, col, mkCell(pctText,   bg, textFg))
      setC(ws, base+2, col, mkCell(eurText,   bg, textFg))
    })
  })

  // — Metadatos de la hoja —
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 3 + sortedSymbols.length * 3 - 1, c: totalCols - 1 },
  })
  ws['!merges'] = mgs

  // Anchos de columna
  ws['!cols'] = [
    { wch: 10 },   // Activo
    { wch: 5  },   // Ops
    { wch: 7  },   // Win%
    { wch: 13 },   // P&L€ Total
    ...months.map(() => ({ wch: 9 })),
  ]

  // Alturas de fila
  ws['!rows'] = [
    { hpt: 18 }, { hpt: 14 }, { hpt: 14 },
    ...sortedSymbols.flatMap(() => [{ hpt: 16 }, { hpt: 14 }, { hpt: 14 }]),
  ]

  // Congelar primeras 3 filas y 4 columnas
  ws['!views'] = [{
    state: 'frozen', xSplit: 4, ySplit: 3,
    topLeftCell: 'E4', activeCell: 'A1', sqref: 'A1',
  }]

  // ── Hoja 2: Señales Descartadas ─────────────────────────────────────────────
  const ws2  = {}
  const HDR2 = ['Fecha entrada', 'Activo', 'P&L% que hubiera obtenido', 'P&L€ que hubiera obtenido']
  const BG2  = { hdr:'0d1520', pos:'0e4a28', neg:'3a0e0e', tot:'1a0d2e' }

  HDR2.forEach((h, c) => {
    ws2[XLSX.utils.encode_cell({ r: 0, c })] = mkCell(h, BG2.hdr, HDR_FG, true, 9)
  })

  // Estimar capital por slot en el run real para calcular P&L€ hipotético
  // Para concentrado: slotCapital = equity_total / N_slots en el momento de entrada.
  // Usamos slotCapital del mcResult como aproximación (equity inicial / N_slots).
  const discCapEst = modoAsig === 'concentrado'
    ? (baseCfg?.capitalIni || slotCap) / Math.min(maxSlots, symbols.length)
    : slotCap

  const sortedDisc = [...discarded].sort((a, b) => a.entryDate.localeCompare(b.entryDate))
  let totalDiscEur = 0

  sortedDisc.forEach((t, i) => {
    const pnlEur = discCapEst * (t.pnlPct || 0) / 100
    totalDiscEur += pnlEur
    const bg  = (t.pnlPct || 0) >= 0 ? BG2.pos : BG2.neg
    const fg  = (t.pnlPct || 0) >= 0 ? 'bbf7d0' : 'fecaca'
    const row = i + 1
    ;[t.entryDate, t.symbol, fmtPct(t.pnlPct || 0), fmtEur(pnlEur)].forEach((v, c) => {
      ws2[XLSX.utils.encode_cell({ r: row, c })] = mkCell(v, bg, fg)
    })
  })

  // Fila de totales
  const totalRow = sortedDisc.length + 1
  ;['TOTAL', '', '', fmtEur(totalDiscEur)].forEach((v, c) => {
    ws2[XLSX.utils.encode_cell({ r: totalRow, c })] = mkCell(v, BG2.tot, 'ff9a3c', true, 9)
  })

  ws2['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: 3 } })
  ws2['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 26 }]

  // ── Ensamblar libro y descargar ─────────────────────────────────────────────
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws,  'Timeline')
  XLSX.utils.book_append_sheet(wb, ws2, 'Señales Descartadas')

  // Nombre de archivo
  const today   = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const safeName = (stratName || 'estrategia').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30)
  const nActivos = symbols.length
  const anios    = baseCfg?.years || ''
  const fileName = `timeline_${safeName}_${nActivos}activos${anios ? '_' + anios + 'a' : ''}_${today}.xlsx`

  // Descargar client-side
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)

  return { fileName, discardedCount: discarded.length }
}
