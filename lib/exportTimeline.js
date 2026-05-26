// lib/exportTimeline.js — Exportaciones Excel para multiactivo
// exportHistorial : tabla de trades (vista Tabla)
// exportGantt     : diagrama semanal (vista Gantt)
// exportTimeline  : timeline mensual (función original, conservada)

import * as XLSX from 'xlsx'

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Helpers de formato ────────────────────────────────────────────────────────
function fmtPct(v) {
  if (v == null || isNaN(v)) return '-'
  const sign = v >= 0 ? '+' : ''
  return sign + v.toFixed(1).replace('.', ',') + '%'
}
function fmtEur(v) {
  if (v == null || isNaN(v)) return '-'
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  const formatted = abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return sign + formatted + '€'
}
function fmtDateES(s) {
  if (!s) return '-'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
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

function download(wb, fileName) {
  const buf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Número puro redondeado a 2 decimales (para celdas numéricas de Excel) ─────
function n2(v) { return v != null && !isNaN(v) ? parseFloat(Number(v).toFixed(2)) : null }

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTAR HISTORIAL — tabla de trades (vista Tabla)
// ══════════════════════════════════════════════════════════════════════════════
// Columnas: # | Activo | Entrada | Salida | Capital inv.(€) | Capital final(€) |
//           P&L(%) | P&L(€) | Días | Tipo salida
// Números sin símbolo €, sin prefijo +, solo - para negativos. Formato .00
export function exportHistorial({ mcResult, mcSelected, baseCfg, stratName = 'estrategia' }) {
  const allTrades  = [...(mcResult.allTrades || [])].sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''))
  const slotCap    = mcResult.slotCapital ?? baseCfg?.capitalIni ?? 1000

  const ws  = {}
  const HDR_BG = '0d1520', HDR_FG = '00d4ff'
  const COLS   = [
    { label: '#',               w: 5,  align: 'center' },
    { label: 'Activo',          w: 9,  align: 'left'   },
    { label: 'Entrada',         w: 11, align: 'left'   },
    { label: 'Salida',          w: 11, align: 'left'   },
    { label: 'Capital inv. (€)',w: 14, align: 'right'  },
    { label: 'Capital final (€)',w:14, align: 'right'  },
    { label: 'P&L (%)',         w: 9,  align: 'right'  },
    { label: 'P&L (€)',         w: 12, align: 'right'  },
    { label: 'Días',            w: 6,  align: 'right'  },
    { label: 'Tipo salida',     w: 12, align: 'left'   },
  ]

  // Cabecera
  COLS.forEach(({ label, align }, c) =>
    setC(ws, 0, c, mkCell(label, HDR_BG, HDR_FG, true, 9, align)))

  let sumPnlEur = 0, sumPnlPct = 0, sumDias = 0, closedCount = 0

  allTrades.forEach((t, i) => {
    const row   = 1 + i
    const even  = i % 2 === 0
    const bg    = even ? '090f1c' : '060c18'
    const capInv    = t._capitalAtEntry != null ? t._capitalAtEntry : slotCap
    const resultado = capInv * (1 + (t.pnlPct || 0) / 100)
    const pnlEur    = t.pnlSimple != null ? t.pnlSimple : capInv * (t.pnlPct || 0) / 100
    const pnlPct    = t.pnlPct || 0
    const dias      = t.dias   || 0
    const tipoSalida = t._virtualClose ? 'Abierta' : (t.tipo || t.exitReason || 'Señal')
    const pnlFg = pnlEur >= 0 ? '4ade80' : 'f87171'

    setC(ws, row, 0, mkCell(i + 1,                    bg, '4a6a8a', false, 9, 'center'))
    setC(ws, row, 1, mkCell(t.symbol,                 bg, '00d4ff', true,  9, 'left'))
    setC(ws, row, 2, mkCell(fmtDateES(t.entryDate),   bg, 'a8c4dc', false, 9, 'left'))
    setC(ws, row, 3, mkCell(t._virtualClose ? 'Abierta' : fmtDateES(t.exitDate), bg, 'a8c4dc', false, 9, 'left'))
    setC(ws, row, 4, mkCell(n2(capInv),               bg, 'e2e8f0', false, 9, 'right'))
    setC(ws, row, 5, mkCell(n2(resultado),            bg, pnlFg,    false, 9, 'right'))
    setC(ws, row, 6, mkCell(n2(pnlPct),               bg, pnlFg,    true,  9, 'right'))
    setC(ws, row, 7, mkCell(n2(pnlEur),               bg, pnlFg,    false, 9, 'right'))
    setC(ws, row, 8, mkCell(dias,                     bg, 'a8c4dc', false, 9, 'right'))
    setC(ws, row, 9, mkCell(tipoSalida,               bg, '6b7280', false, 9, 'left'))

    if (!t._virtualClose) {
      sumPnlEur += pnlEur; sumPnlPct += pnlPct; sumDias += dias; closedCount++
    }
  })

  // Fila de totales
  const totRow = 1 + allTrades.length
  const avgPct = closedCount > 0 ? sumPnlPct / closedCount : 0
  const TOT_BG = '1a0d2e'
  ;['TOTAL','','','','','', n2(avgPct), n2(sumPnlEur), sumDias, ''].forEach((v, c) => {
    setC(ws, totRow, c, mkCell(v, TOT_BG, 'ff9a3c', true, 9, c === 0 ? 'left' : COLS[c].align))
  })

  ws['!ref']  = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:totRow, c:9} })
  ws['!cols'] = COLS.map(col => ({ wch: col.w }))
  ws['!rows'] = [{ hpt:16 }, ...allTrades.map(()=>({ hpt:14 })), { hpt:16 }]
  ws['!views'] = [{ state:'frozen', xSplit:0, ySplit:1, topLeftCell:'A2', activeCell:'A1', sqref:'A1' }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Historial')

  const today    = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const safeName = (stratName || 'estrategia').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30)
  const nAct     = (mcSelected || []).filter(Boolean).length
  const fileName = `historial_${safeName}_${nAct}activos_${today}.xlsx`

  download(wb, fileName)
  return { fileName }
}

// ── Color de fondo Gantt (hex sin '#') ────────────────────────────────────────
function ganttColorHex(pct) {
  if (pct == null) return '334155'
  if (pct >  20) return '0d6e2e'
  if (pct >   5) return '16a34a'
  if (pct >=  0) return '22c55e'
  if (pct >  -5) return 'ef4444'
  if (pct > -15) return 'dc2626'
  return '991b1b'
}
function ganttColorLight(pct) {
  if (pct == null) return '334155'
  if (pct >  20) return 'a7f3d0'
  if (pct >   5) return 'bbf7d0'
  if (pct >=  0) return 'dcfce7'
  if (pct >  -5) return 'fecaca'
  if (pct > -15) return 'fecaca'
  return 'fca5a5'
}

// ── Generar semanas (una cada 7 días desde startDate) ────────────────────────
function genWeeks(startDateStr, endDateStr) {
  const weeks = []
  const cur = new Date(startDateStr + 'T00:00:00')
  const end = new Date(endDateStr  + 'T00:00:00')
  while (cur <= end) {
    weeks.push({ year: cur.getFullYear(), dateStr: cur.toISOString().split('T')[0] })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTAR GANTT — diagrama semanal (vista Gantt)
// ══════════════════════════════════════════════════════════════════════════════
// Columnas fijas: Activo | Ops | Cap.inv.(€) | P&L(€)
// Números sin símbolo, sin prefijo +, solo - para negativos.
export function exportGantt({
  mcResult, mcSelected, baseCfg, stratName = 'estrategia', discardedTrades = null,
}) {
  const allTrades  = mcResult.allTrades || []
  const startDate  = mcResult.startDate || '2000-01-01'
  const slotCap    = mcResult.slotCapital ?? baseCfg?.capitalIni ?? 1000
  const symbols    = (mcSelected || []).filter(Boolean).sort()

  const lastExitDate = allTrades
    .map(t => t.exitDate || t.entryDate).filter(Boolean).sort().slice(-1)[0]
    || new Date().toISOString().split('T')[0]

  const weeks     = genWeeks(startDate, lastExitDate)
  const FIXED     = 4
  const totalCols = FIXED + weeks.length

  const ws  = {}
  const mgs = []
  const HDR_BG = '0d1520', HDR_FG = '00d4ff'

  // Cabecera fija (cols 0-3)
  setC(ws, 0, 0, mkCell('Activo',       HDR_BG, HDR_FG, true, 10, 'left'))
  setC(ws, 0, 1, mkCell('Ops',          HDR_BG, HDR_FG, true,  9))
  setC(ws, 0, 2, mkCell('Cap.inv. (€)', HDR_BG, HDR_FG, true,  9, 'right'))
  setC(ws, 0, 3, mkCell('P&L (€)',      HDR_BG, HDR_FG, true,  9, 'right'))

  // Fila 1 cols 0-3: blank, merge con fila 0
  for (let c = 0; c < FIXED; c++) setC(ws, 1, c, mkCell('', HDR_BG))
  mgs.push({ s: { r: 0, c: 0 }, e: { r: 1, c: FIXED - 1 } })

  // Columnas de semanas: fila 0 = años (merged), fila 1 = semanas (DD/MM)
  let prevYear = null, yearStartCol = FIXED
  weeks.forEach((w, wi) => {
    const col = FIXED + wi
    if (w.year !== prevYear) {
      if (prevYear !== null)
        mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: col - 1 } })
      setC(ws, 0, col, mkCell(String(w.year), HDR_BG, HDR_FG, true, 11))
      yearStartCol = col
      prevYear = w.year
    } else {
      setC(ws, 0, col, mkCell('', HDR_BG))
    }
    const [, m, d] = w.dateStr.split('-')
    setC(ws, 1, col, mkCell(`${d}/${m}`, HDR_BG, '8ab8d4', false, 8))
  })
  if (prevYear !== null) {
    const lastCol = FIXED + weeks.length - 1
    if (lastCol > yearStartCol)
      mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: lastCol } })
  }

  // Filas de datos: una por activo (fila 2+)
  symbols.forEach((sym, si) => {
    const row       = 2 + si
    const symTrades = allTrades.filter(t => t.symbol === sym)
    const symDisc   = discardedTrades ? discardedTrades.filter(t => t.symbol === sym) : []
    const FIX_BG    = '0d1520'

    const closed     = symTrades.filter(t => !t._virtualClose)
    const totalOps   = closed.length
    const totalCapInv = closed.reduce((s, t) => s + (t._capitalAtEntry != null ? t._capitalAtEntry : slotCap), 0)
    const totalEur   = closed.reduce((s, t) => {
      const cap = t._capitalAtEntry != null ? t._capitalAtEntry : slotCap
      return s + (t.pnlSimple != null ? t.pnlSimple : cap * (t.pnlPct || 0) / 100)
    }, 0)
    const pnlFg = totalEur >= 0 ? '4ade80' : 'f87171'

    setC(ws, row, 0, mkCell(sym,              FIX_BG, '00d4ff', true,  9, 'left'))
    setC(ws, row, 1, mkCell(totalOps || '-',  FIX_BG, 'e2e8f0', false, 9, 'center'))
    setC(ws, row, 2, mkCell(n2(totalCapInv),  FIX_BG, 'c8dff5', false, 9, 'right'))
    setC(ws, row, 3, mkCell(n2(totalEur),     FIX_BG, pnlFg,    true,  9, 'right'))

    weeks.forEach((w, wi) => {
      const col    = FIXED + wi
      const wStart = w.dateStr
      const wEnd   = wi < weeks.length - 1 ? weeks[wi + 1].dateStr : lastExitDate

      const activeExec = symTrades.filter(t =>
        t.entryDate < wEnd && (t.exitDate || lastExitDate) >= wStart)
      const activeDisc = symDisc.filter(t =>
        t.entryDate < wEnd && (t.exitDate || lastExitDate) >= wStart)

      if (activeExec.length > 0) {
        const t      = activeExec[0]
        const bg     = ganttColorHex(t.pnlPct)
        const isExit = t.exitDate && t.exitDate >= wStart && t.exitDate < wEnd
        const val    = isExit ? n2(Math.abs(t.pnlPct || 0)) : null
        setC(ws, row, col, mkCell(val, bg, 'ffffff', val != null, 8))
      } else if (activeDisc.length > 0) {
        const t      = activeDisc[0]
        const bg     = ganttColorLight(t.pnlPct)
        const isExit = t.exitDate && t.exitDate >= wStart && t.exitDate < wEnd
        const val    = isExit ? n2(Math.abs(t.pnlPct || 0)) : null
        setC(ws, row, col, mkCell(val, bg, '4a5568', false, 8))
      } else {
        setC(ws, row, col, mkCell('', '0d0d1f', '1e3a5f'))
      }
    })
  })

  ws['!ref']    = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:2+symbols.length-1, c:totalCols-1} })
  ws['!merges'] = mgs
  ws['!cols']   = [
    { wch: 10 }, { wch: 5 }, { wch: 13 }, { wch: 13 },
    ...weeks.map(() => ({ wch: 5 })),
  ]
  ws['!rows'] = [
    { hpt: 18 }, { hpt: 14 },
    ...symbols.map(() => ({ hpt: 16 })),
  ]
  ws['!views'] = [{
    state: 'frozen', xSplit: 4, ySplit: 2,
    topLeftCell: 'E3', activeCell: 'A1', sqref: 'A1',
  }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gantt')

  const today    = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const safeName = (stratName || 'estrategia').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30)
  const nAct     = symbols.length
  const yrs      = baseCfg?.years || ''
  const fileName = `gantt_${safeName}_${nAct}activos${yrs ? '_' + yrs + 'a' : ''}_${today}.xlsx`

  download(wb, fileName)
  return { fileName }
}

// ── Color de fondo Timeline según P&L% ────────────────────────────────────────
function bgColor(pct, { isOngoing = false, isDiscarded = false, noActivity = false } = {}) {
  if (noActivity)  return '0d0d1f'
  if (isDiscarded) return '2d2d2d'
  if (isOngoing) {
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

// ── Rango de meses entre dos fechas (inclusive) ────────────────────────────────
function monthRange(startDate, endDate) {
  const s = new Date(startDate + 'T00:00:00'); s.setDate(1)
  const e = new Date(endDate   + 'T00:00:00'); e.setDate(1)
  const months = [], cur = new Date(s)
  while (cur <= e) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}
function inMonth(date, year, month) {
  if (!date) return false
  return date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
}
function nextMonthStr(year, month) {
  return new Date(year, month + 1, 1).toISOString().split('T')[0]
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTAR TIMELINE — calendario mensual (función original, conservada)
// ══════════════════════════════════════════════════════════════════════════════
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

  const lastExitDate = allTrades
    .map(t => t.exitDate || t.entryDate)
    .filter(Boolean).sort().slice(-1)[0] || new Date().toISOString().split('T')[0]

  const months = monthRange(startDate, lastExitDate)

  // Re-run ilimitado para señales descartadas
  let unlimitedTrades = []
  if (modoAsig === 'concentrado' || modoAsig === 'compartido') {
    try {
      const unlimCfg = { ...baseCfg, sizeRules: { ...(baseCfg.sizeRules || {}), maxPosiciones: 9999 } }
      const res = await apiFetch('/api/multibacktest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, modoAsig: 'concentrado', weights: weightsNorm || {},
          cfg: unlimCfg, strategyId, isNoStrategy, filtros, intervalo: mcIntervalo }),
      })
      if (res.ok) { const json = await res.json(); unlimitedTrades = json.allTrades || [] }
    } catch (_) {}
  }

  const realKeys = new Set(allTrades.map(t => `${t.symbol}:${t.entryDate}`))
  const discarded = unlimitedTrades.filter(t => !realKeys.has(`${t.symbol}:${t.entryDate}`))

  const ws  = {}, mgs = []
  const FIXED = 4, totalCols = FIXED + months.length
  const HDR_BG = '0d1520', HDR_FG = '00d4ff', HDR_DIM = '1a2d45'

  setC(ws, 2, 0, mkCell('Activo',   HDR_BG, HDR_FG, true, 10, 'left'))
  setC(ws, 2, 1, mkCell('Ops',      HDR_BG, HDR_FG, true,  9))
  setC(ws, 2, 2, mkCell('Win%',     HDR_BG, HDR_FG, true,  9))
  setC(ws, 2, 3, mkCell('P&L€ Tot', HDR_BG, HDR_FG, true,  9))

  for (let r = 0; r <= 1; r++) for (let c = 0; c <= 3; c++) setC(ws, r, c, mkCell('', HDR_BG))
  mgs.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 3 } })

  let prevYear = null, yearStartCol = FIXED
  months.forEach((m, mi) => {
    const col = FIXED + mi
    if (m.year !== prevYear) {
      if (prevYear !== null) mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: col - 1 } })
      setC(ws, 0, col, mkCell(String(m.year), HDR_BG, HDR_FG, true, 11))
      yearStartCol = col; prevYear = m.year
    } else { setC(ws, 0, col, mkCell('', HDR_BG)) }
    setC(ws, 1, col, mkCell(MONTHS_ES[m.month], HDR_BG, '8ab8d4', false, 9))
    setC(ws, 2, col, mkCell('', HDR_DIM))
  })
  if (prevYear !== null) {
    const lastCol = FIXED + months.length - 1
    if (lastCol > yearStartCol) mgs.push({ s: { r: 0, c: yearStartCol }, e: { r: 0, c: lastCol } })
  }

  const sortedSymbols = [...symbols].sort()

  sortedSymbols.forEach((sym, si) => {
    const base = 3 + si * 3
    const symTrades    = allTrades.filter(t => t.symbol === sym)
    const symDiscarded = discarded.filter(t => t.symbol === sym)

    const closed   = symTrades.filter(t => !t._virtualClose)
    const wins     = closed.filter(t => (t.pnlPct || 0) >= 0).length
    const totalOps = closed.length
    const totalEur = closed.reduce((s, t) => s + (t.pnlSimple || 0), 0)
    const winPct   = totalOps > 0 ? wins / totalOps * 100 : 0

    const FIX_BG = '0d1520'
    const winFg  = winPct >= 50 ? '4ade80' : 'f87171'
    const pnlFg  = totalEur  >= 0 ? '4ade80' : 'f87171'

    setC(ws, base,   0, mkCell(sym,                                   FIX_BG, '00d4ff', true, 10, 'left'))
    setC(ws, base+1, 0, mkCell('', FIX_BG))
    setC(ws, base+2, 0, mkCell('', FIX_BG))
    setC(ws, base,   1, mkCell(totalOps > 0 ? totalOps : '-',        FIX_BG, 'e2e8f0'))
    setC(ws, base+1, 1, mkCell('', FIX_BG))
    setC(ws, base+2, 1, mkCell('', FIX_BG))
    setC(ws, base,   2, mkCell(totalOps > 0 ? fmtPct(winPct) : '-', FIX_BG, winFg, true))
    setC(ws, base+1, 2, mkCell('', FIX_BG))
    setC(ws, base+2, 2, mkCell('', FIX_BG))
    setC(ws, base,   3, mkCell(totalOps > 0 ? fmtEur(totalEur) : '-', FIX_BG, pnlFg, true, 9, 'right'))
    setC(ws, base+1, 3, mkCell('', FIX_BG))
    setC(ws, base+2, 3, mkCell('', FIX_BG))

    mgs.push({ s:{r:base,c:0}, e:{r:base+2,c:0} })
    mgs.push({ s:{r:base,c:1}, e:{r:base+2,c:1} })
    mgs.push({ s:{r:base,c:2}, e:{r:base+2,c:2} })
    mgs.push({ s:{r:base,c:3}, e:{r:base+2,c:3} })

    months.forEach((m, mi) => {
      const col = FIXED + mi
      const exits  = symTrades.filter(t => inMonth(t.exitDate, m.year, m.month) && !t._virtualClose)
      const entries= symTrades.filter(t => inMonth(t.entryDate, m.year, m.month))
      const mStart = `${m.year}-${String(m.month + 1).padStart(2, '0')}-01`
      const mNext  = nextMonthStr(m.year, m.month)
      const ongoingTrades = symTrades.filter(t => {
        const entered = t.entryDate < mStart
        const exitAfter = !t.exitDate || t.exitDate >= mNext
        return entered && exitAfter && !inMonth(t.entryDate, m.year, m.month) && !inMonth(t.exitDate, m.year, m.month)
      })
      const discThisMo = symDiscarded.filter(t => inMonth(t.entryDate, m.year, m.month))

      let bg = '0d0d1f', avgPct = 0
      if (exits.length > 0) {
        avgPct = exits.reduce((s, t) => s + (t.pnlPct || 0), 0) / exits.length
        bg = bgColor(avgPct)
      } else if (ongoingTrades.length > 0) {
        avgPct = ongoingTrades.reduce((s, t) => s + (t.pnlPct || 0), 0) / ongoingTrades.length
        bg = bgColor(avgPct, { isOngoing: true })
      } else if (entries.length > 0) {
        avgPct = entries.reduce((s, t) => s + (t.pnlPct || 0), 0) / entries.length
        bg = bgColor(avgPct, { isOngoing: true })
      } else if (discThisMo.length > 0) {
        bg = '2d2d2d'
      }

      const parts = []
      if (entries.length > 0) parts.push(entries.length === 1 ? '▲' : `▲${entries.length}`)
      if (exits.length > 0)   parts.push(exits.length   === 1 ? '▼' : `▼${exits.length}`)
      if (discThisMo.length > 0 && entries.length === 0) parts.push('✗')
      const opsText = parts.join(' ')
      const hasClosed = exits.length > 0
      const textFg = bg === '0d0d1f' ? '1e3a5f' : bg === '2d2d2d' ? '6b7280'
        : hasClosed ? (avgPct >= 0 ? 'bbf7d0' : 'fecaca') : 'a3b8cc'
      const pctText = hasClosed ? fmtPct(avgPct) : ''
      let eurText = ''
      if (hasClosed) eurText = fmtEur(exits.reduce((s, t) => s + (t.pnlSimple || 0), 0))
      const opsFinal = discThisMo.length > 0 && entries.length > 0 ? opsText + ' ✗' : opsText

      setC(ws, base,   col, mkCell(opsFinal, bg, opsText ? 'e2e8f0' : textFg, opsText.length > 0))
      setC(ws, base+1, col, mkCell(pctText,  bg, textFg))
      setC(ws, base+2, col, mkCell(eurText,  bg, textFg))
    })
  })

  ws['!ref']    = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:3+sortedSymbols.length*3-1, c:totalCols-1} })
  ws['!merges'] = mgs
  ws['!cols']   = [{ wch:10 },{ wch:5 },{ wch:7 },{ wch:13 }, ...months.map(()=>({ wch:9 }))]
  ws['!rows']   = [{ hpt:18 },{ hpt:14 },{ hpt:14 }, ...sortedSymbols.flatMap(()=>[{ hpt:16 },{ hpt:14 },{ hpt:14 }])]
  ws['!views']  = [{ state:'frozen', xSplit:4, ySplit:3, topLeftCell:'E4', activeCell:'A1', sqref:'A1' }]

  // Hoja 2: Señales Descartadas
  const ws2 = {}
  const HDR2 = ['Fecha entrada','Activo','P&L% que hubiera obtenido','P&L€ que hubiera obtenido']
  const BG2  = { hdr:'0d1520', pos:'0e4a28', neg:'3a0e0e', tot:'1a0d2e' }
  HDR2.forEach((h, c) => { ws2[XLSX.utils.encode_cell({r:0,c})] = mkCell(h, BG2.hdr, HDR_FG, true, 9) })
  const discCapEst = modoAsig === 'concentrado'
    ? (baseCfg?.capitalIni || slotCap) / Math.min(maxSlots, symbols.length) : slotCap
  const sortedDisc = [...discarded].sort((a, b) => a.entryDate.localeCompare(b.entryDate))
  let totalDiscEur = 0
  sortedDisc.forEach((t, i) => {
    const pnlEur = discCapEst * (t.pnlPct || 0) / 100
    totalDiscEur += pnlEur
    const bg = (t.pnlPct || 0) >= 0 ? BG2.pos : BG2.neg
    const fg = (t.pnlPct || 0) >= 0 ? 'bbf7d0' : 'fecaca'
    ;[t.entryDate, t.symbol, fmtPct(t.pnlPct || 0), fmtEur(pnlEur)].forEach((v, c) => {
      ws2[XLSX.utils.encode_cell({r:i+1,c})] = mkCell(v, bg, fg)
    })
  })
  const totR = sortedDisc.length + 1
  ;['TOTAL','','',fmtEur(totalDiscEur)].forEach((v, c) => {
    ws2[XLSX.utils.encode_cell({r:totR,c})] = mkCell(v, BG2.tot, 'ff9a3c', true, 9)
  })
  ws2['!ref']  = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:totR,c:3} })
  ws2['!cols'] = [{ wch:14 },{ wch:10 },{ wch:26 },{ wch:26 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws,  'Timeline')
  XLSX.utils.book_append_sheet(wb, ws2, 'Señales Descartadas')

  const today    = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const safeName = (stratName || 'estrategia').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30)
  const nActivos = symbols.length
  const anios    = baseCfg?.years || ''
  const fileName = `timeline_${safeName}_${nActivos}activos${anios ? '_' + anios + 'a' : ''}_${today}.xlsx`

  download(wb, fileName)
  return { fileName, discardedCount: discarded.length }
}
