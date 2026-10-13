// lib/prioridadCartera.js — los CANDIDATOS de la multicartera y su PRIORIDAD, compartidos por el servidor
// (pages/api/multibacktest.js: Concentrado y Compartido) y el navegador (lib/azarCartera.js: la prueba contra el azar).
// Puro: sin red ni fechas.

// Stop inicial de una operación: el primero de su historial si es de la vela de entrada o anterior; si no, su stopPx.
export function stopInicial(t) {
  if (!t) return null
  const h = Array.isArray(t.stopHistory) ? t.stopHistory[0] : null
  if (h && h.stopPx != null) {
    if (h.date == null || t.entryDate == null || h.date <= t.entryDate) return h.stopPx
    return null
  }
  return t.stopPx ?? null
}

// El candidato de una operación `t` del activo `ar`: lo que necesitan el reparto y las curvas del pool.
export function candidatoDe(ar, t) {
  return {
    symbol:        ar.symbol,
    // Símbolo REAL del activo. En multicartera `symbol` es sintético (TICKER#estrategia) y sin esto la
    // agrupación por activo de _claveActivo se queda con el sintético. En el handler normal es undefined.
    _realSymbol:   ar._realSymbol,
    entryDate:     t.entryDate,
    exitDate:      t.exitDate,
    pnlPct:        t.pnlPct,
    entryPx:       t.entryPrice ?? t.entryPx,
    // Precio de SALIDA: no entra en ningún cálculo, solo viaja para dibujar.
    exitPx:        t.exitPrice ?? t.exitPx,
    stopPx:        stopInicial(t),
    dias:          t.dias,
    _virtualClose: !!t._virtualClose,
  }
}

// Índice de la última vela del S&P 500 con fecha ≤ `fecha` (−1 si no hay): búsqueda binaria sobre fechas crecientes.
export function indiceHasta(serie, fecha) {
  let lo = 0, hi = serie.length - 1, r = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m].date <= fecha) { r = m; lo = m + 1 } else hi = m - 1 }
  return r
}

// La función de prioridad de Concentrado: menor puntuación = entra antes. Además deja en el candidato el valor CRUDO
// de la métrica activa (_momRaw, _rsRaw, _proxRaw) y si es válido (_psValid), que usa la puerta del modo «Filtro».
//   dataMap: { símbolo: velas del periodo }   dateIdxMap: { símbolo: { fecha: índice en esas velas } }
//   sp500Data: velas del S&P 500 en la temporalidad del activo (con calentamiento), para la fuerza relativa.
export function creaPuntuador({ prioridad = 'alfabetico', momentumN = 20, rsWindow = 63, scoreMap = null, symbolsList = null, sp500Data = null, dataMap, dateIdxMap }) {
  return function _priorityScore(t) {
    if (prioridad === 'alfabetico') return null  // handled inline in sort
    if (prioridad === 'score_metricas' || prioridad === 'ranking') {
      // 'ranking' mantenido como alias legacy — ambos usan scoreMap si disponible
      if (scoreMap) {
        const s = scoreMap[t.symbol] ?? null
        return s != null ? -s : 999  // mayor score → entra antes
      }
      // fallback: orden por symbolsList
      const ri = symbolsList ? symbolsList.indexOf(t.symbol) : -1
      return ri >= 0 ? ri : (symbolsList ? symbolsList.length : 999)
    }
    // Campos CRUDOS + flag de validez por candidato (para gates con umbral, sin la ambigüedad de _ps=0).
    const data = dataMap[t.symbol] || []
    const idx  = dateIdxMap[t.symbol]?.[t.entryDate]
    if (idx == null || data.length === 0) { t._psValid = false; return 0 }

    if (prioridad === 'momentum') {
      const N = Math.max(1, momentumN || 20)
      if (idx < N) { t._psValid = false; return 0 }   // sin historial suficiente
      const ret = (data[idx].close - data[idx - N].close) / data[idx - N].close
      t._momRaw = ret; t._psValid = true
      return -ret  // mayor retorno → score más bajo → entra antes
    }
    if (prioridad === 'fuerza_relativa') {
      const LB = Math.max(2, Math.trunc(rsWindow) || 63)  // ventana en VELAS (configurable, default 63)
      if (idx < LB) { t._psValid = false; return 0 }  // sin historial suficiente del activo
      const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close
      if (!sp500Data || !sp500Data.length) {
        console.warn('[concentrado] fuerza_relativa: sp500Data no disponible, usando momentum N=63')
        t._psValid = false; return -retAsset  // sin SP500 → RS no calculable → no válido (gate deja pasar)
      }
      const spIdx = indiceHasta(sp500Data, t.entryDate)
      if (spIdx < LB) { t._psValid = false; return -retAsset }  // SP500 sin 63 barras en esa fecha
      const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close
      const rs = retAsset - retSP
      t._rsRaw = rs; t._psValid = true
      return -rs  // mayor alfa vs SP500 → entra antes
    }
    if (prioridad === 'max52') {
      const LB = Math.min(idx, 251)
      let max252 = -Infinity
      for (let i = idx - LB; i <= idx; i++) {
        const h = (data[i].high != null ? data[i].high : data[i].close)
        if (h > max252) max252 = h
      }
      if (max252 <= 0 || max252 === -Infinity) { t._psValid = false; return 0 }
      const ratio = data[idx].close / max252
      t._proxRaw = ratio                 // 1.0 = en el máximo; 0.9 = 10% por debajo
      t._psValid = idx >= 251            // válido solo con la ventana completa de 252 barras
      return -ratio  // más cercano al máximo → entra antes
    }
    return 0
  }
}
