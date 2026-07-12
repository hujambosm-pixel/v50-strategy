# AUDITORÍA — Consumidores del SP500 en el gate B (multibacktest)

**Fecha:** 2026-07-11 · **Versión:** V9.616 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** mapear TODOS los consumidores de la serie SP500 en `multibacktest.js` antes de arreglar el gate de fuerza relativa (B) para que (1) use el SP500 en el timeframe del activo y (2) su ventana sea configurable en velas — replicando el patrón aislado de la Fase 2C (no mutar la serie compartida, añadir lo nuevo por separado).

**Veredicto rápido:** el fix es de **bajo riesgo** y encaja perfectamente con el patrón de C. Buena noticia doble: **(a)** el gate ya cuenta **índices de array (velas)**, así que "contar velas" es gratis en cuanto el SP500 llegue en semanal; **(b)** el gate ya alinea el SP500 con **backward-scan as-of** (no match exacto), más robusto que `datos.js`. Solo hay que: descargar una serie SP500 dedicada al timeframe activo y pasarla **solo al gate**, y sustituir el literal `63` por un parámetro. Todo lo demás (filtros diarios, B&H, inyección a codeJs) debe quedarse en diario.

---

## 1. TODOS LOS CONSUMIDORES DE `sp500Data` EN multibacktest.js

Hay **dos paths** simétricos: `handlePortfolioMode` (portfolioMode, ~1200-1540) y el handler normal (~1553-1990). `sp500Data` se descarga y consume en ambos:

| # | Consumidor | portfolioMode | path normal | Qué hace | ¿Timeframe deseado? |
|---|-----------|---------------|-------------|----------|----------------------|
| 1 | **Descarga** | [1255](pages/api/multibacktest.js#L1255) | [1621](pages/api/multibacktest.js#L1621) | `fetchData('^GSPC', cfg.years…)` sin intervalo → **diario** | — |
| 2 | **Gate fuerza_relativa** (param de `buildConcentradoCurves`) | [1414](pages/api/multibacktest.js#L1414) | [1827](pages/api/multibacktest.js#L1827) | RS = retActivo − retSP en LB velas ([456-465](pages/api/multibacktest.js#L456)) | **Timeframe activo** (hoy roto en semanal) |
| 3 | **Inyección `sp500Close` a codeJs** (`runCodeJsAsset`) | [1281](pages/api/multibacktest.js#L1281) → [1083-1087](pages/api/multibacktest.js#L1083) | [1666](pages/api/multibacktest.js#L1666) → [1083-1087](pages/api/multibacktest.js#L1083) | `sp500Map[d.date] ?? null` (**match exacto**) por barra; lo leen estrategias #2/#3/AA/#28 | **Diario** (dejar intacto, como C) |
| 4 | **Filtros de mercado** (resolver) | [1341](pages/api/multibacktest.js#L1341) | [1690](pages/api/multibacktest.js#L1690) | `(ticker==='^GSPC' && iv!=='1wk') ? sp500Data : filterAuxData[...]` | **Diario obligatorio** (el ^GSPC semanal ya usa `filterAuxData`) |
| 5 | **Curva B&H SP500** (benchmark) | [1506-1513](pages/api/multibacktest.js#L1506) | [1950-1960](pages/api/multibacktest.js#L1950) | backward-scan por fecha para la línea B&H | **Diario** (as-of funciona; dejar intacto) |

**Cuáles esperan DIARIO (no tocar):** #3 (inyección a codeJs — mismo caso que `d.sp500Close` en C), #4 (filtro ^GSPC diario — se rompería con datos semanales; el filtro semanal ya tiene su propia serie en `filterAuxData`), #5 (B&H — as-of por fecha, coherente en diario).
**Cuál quiere el TIMEFRAME ACTIVO:** solo #2 (el gate).

**Matiz importante:** en portfolioMode la prioridad está **forzada a `'alfabetico'`** ([1410-1414](pages/api/multibacktest.js#L1410), comentario "Fase 2"), así que el gate `fuerza_relativa` **hoy solo se ejercita en el path normal** ([1820-1827](pages/api/multibacktest.js#L1820), `_prior = sizeRules.prioridad`). El `sp500Data` que se pasa en portfolioMode es inerte para el gate. Aun así conviene preparar la serie dedicada en ambos paths por consistencia y futuro.

---

## 2. LA CONSTANTE `LB=63` DEL GATE — ¿velas o días?

Bloque exacto ([multibacktest.js:452-468](pages/api/multibacktest.js#L452)):
```js
if (prioridad === 'fuerza_relativa') {
  const LB = 63
  if (idx < LB) { t._psValid = false; return 0 }
  const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close   // ← idx-LB = índice de array
  if (!sp500Data || !sp500Data.length) { … }
  let spIdx = -1
  for (let i = sp500Data.length - 1; i >= 0; i--) {           // backward-scan as-of
    if (sp500Data[i].date <= t.entryDate) { spIdx = i; break }
  }
  if (spIdx < LB) { t._psValid = false; return -retAsset }
  const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close   // ← spIdx-LB = índice
  const rs = retAsset - retSP
  return -rs
}
```

**LB se usa como offset de índice de array (VELAS), NO días de calendario:**
- Lado activo: `idx` = índice de la barra de entrada en el array del activo (`_dateIdxMap[t.symbol][t.entryDate]`, [442](pages/api/multibacktest.js#L442)); `data[idx - LB]` = 63 barras del activo hacia atrás.
- Lado SP500: `spIdx` se localiza por backward-scan ([461-462](pages/api/multibacktest.js#L461)); `sp500Data[spIdx - LB]` = 63 índices de la serie SP500 hacia atrás.

**Consecuencia:** cuando `sp500Data` venga en **semanal**, `spIdx - 63` = 63 semanas automáticamente, igual que `data[idx - 63]` = 63 barras del activo (semanas). → **"Contar velas" es gratis**: no hay que tocar la lógica de conteo, solo (i) que el SP500 llegue en el timeframe activo y (ii) sustituir el literal `63` por un parámetro configurable. (Nota: el comentario de `momentumN` en [406](pages/api/multibacktest.js#L406) dice "días", pero también es índice de array — [448](pages/api/multibacktest.js#L448) `data[idx - N]`; misma naturaleza que LB.)

**Aviso de semántica:** 63 en diario ≈ 3 meses; 63 en semanal ≈ 15 meses. Al hacerlo configurable, el mismo default cambia de significado según timeframe — conviene que el usuario ajuste (p.ej. 13 semanas ≈ un trimestre).

---

## 3. DE DÓNDE VIENE EL TIMEFRAME EN multibacktest.js

- Llega en el **body** de la request: `intervalo`. Path normal: destructurado en [1553](pages/api/multibacktest.js#L1553) (`… , intervalo } = req.body`). portfolioMode: destructurado en el handler ([~1201-1208](pages/api/multibacktest.js#L1201)). El frontend lo envía como `intervalo:mcIntervalo` desde la config del multibacktest.
- Se convierte a intervalo de fetch: **`assetInterval = intervalo === 'semanal' ? '1wk' : '1d'`** en ambos paths ([1216](pages/api/multibacktest.js#L1216) portfolio, [1610](pages/api/multibacktest.js#L1610) normal).
- **¿Está en el punto de descarga del SP500 (1255/1621)?** Sí — `assetInterval` se define antes (1216/1610) y está en scope en la descarga. Bastaría pasarlo como 5º argumento de `fetchData('^GSPC', …, assetInterval)`.
- **¿El gate (452-468) sabe su timeframe?** No directamente — `buildConcentradoCurves` no recibe `assetInterval` y el gate no lo necesita: cuenta índices de array. Solo importa que la **serie SP500 que se le pasa** esté en el timeframe correcto. → No hay que propagar `assetInterval` al gate, solo darle la serie adecuada.

---

## 4. CÓMO SE DESCARGA Y ALINEA EL SP500 HOY

- **Descarga** ([1255](pages/api/multibacktest.js#L1255)/[1621](pages/api/multibacktest.js#L1621)): `fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate, cfg.toDate)` — **sin 5º argumento** → default `interval='1d'` ([69](pages/api/multibacktest.js#L69)) → **diario**. `fetchData` YA acepta intervalo (`'1wk'|'w'→'w'`, [69-73](pages/api/multibacktest.js#L69)).
- **Alineación en el gate:** **backward-scan as-of** inline ([461-462](pages/api/multibacktest.js#L461)) — busca la última barra SP500 con `date <= entryDate`. Robusto a fechas no coincidentes (no exige match exacto). El offset LB se aplica sobre índices ya localizados.
- **Alineación en B&H:** también backward-scan ([1512-1513](pages/api/multibacktest.js#L1512)/[1959-1960](pages/api/multibacktest.js#L1959)).
- **Alineación en la inyección a codeJs (#3):** **match exacto** (`sp500Map[d.date] ?? null`, [1087](pages/api/multibacktest.js#L1087)) — la única frágil, pero alimenta estrategias, no el gate.
- **¿Existe un helper de alineación?** Sí — `buildAlignedCloses` ([multibacktest.js:25-36](pages/api/multibacktest.js#L25)) y `buildAlignedWeekly` ([multibacktest.js:39-53](pages/api/multibacktest.js#L39)) — pero **el gate NO los necesita**: su backward-scan ya resuelve la alineación as-of. (A diferencia de C, donde el consumidor usaba match exacto y hubo que meter forward-fill.)

---

## 5. PLAN DE IMPLEMENTACIÓN (descrito, NO implementado)

Patrón idéntico a la Fase 2C: **no mutar `sp500Data` (diaria); añadir una serie dedicada para el gate.**

### (a) SP500 en timeframe activo solo para el gate
1. **Nueva serie** `sp500DataTf`: descargarla al lado de la diaria en ambos paths ([~1255](pages/api/multibacktest.js#L1255)/[~1621](pages/api/multibacktest.js#L1621)):
   - `if (assetInterval === '1wk') sp500DataTf = await fetchData('^GSPC', cfg.years, …, assetInterval)` — **solo en semanal**; en diario `sp500DataTf = sp500Data` (sin doble descarga, igual que C).
2. **Pasar `sp500DataTf` al gate** en los call sites de `buildConcentradoCurves` ([1414](pages/api/multibacktest.js#L1414)/[1827](pages/api/multibacktest.js#L1827)) **en lugar de `sp500Data`**. Es seguro: dentro de `buildConcentradoCurves` el param `sp500Data` se usa **únicamente en el gate** ([456-465](pages/api/multibacktest.js#L456)); no lo consume nada más de esa función.
3. **Intactos (siguen con `sp500Data` diaria):** inyección a codeJs #3 ([1281](pages/api/multibacktest.js#L1281)/[1666](pages/api/multibacktest.js#L1666)), filtros #4 ([1341](pages/api/multibacktest.js#L1341)/[1690](pages/api/multibacktest.js#L1690)), B&H #5 ([1506](pages/api/multibacktest.js#L1506)/[1950](pages/api/multibacktest.js#L1950)). No se tocan.
   - Sin nuevo helper de alineación: el backward-scan del gate ya tolera semanal (con `sp500DataTf` semanal, `spIdx-LB` = 63 semanas; el guard `if (spIdx < LB)` cubre historial insuficiente).

### (b) LB configurable
- **Origen del valor:** un nuevo `sizeRules.rsWindow` (o `fuerzaRelativaN`), exactamente el mismo canal que `momentumN` (`sizeRules.momentumN` → `_momentN` → param de `buildConcentradoCurves`, [1821](pages/api/multibacktest.js#L1821)/[1399](pages/api/multibacktest.js#L1399)) y que los thresholds `rsGateThr`/`momGateThr` ([1824-1826](pages/api/multibacktest.js#L1824)). Lo enviaría el frontend en la config del multibacktest (junto a `mcMomentumN`, `mcRsGateThr`, etc.).
- **Threading:** añadir un parámetro `rsWindow = 63` a la firma de `buildConcentradoCurves` ([410](pages/api/multibacktest.js#L410)) y sustituir `const LB = 63` ([453](pages/api/multibacktest.js#L453)) por `const LB = Math.max(2, rsWindow || 63)`. Pasarlo en ambos call sites (1414/1827).
- **Default 63** preserva el comportamiento actual en diario.

### Qué cambia vs qué queda intacto
| Elemento | Acción |
|---|---|
| Descarga `sp500DataTf` (nueva) | **Añadir** (weekly-only; diario reutiliza `sp500Data`) |
| Param del gate en `buildConcentradoCurves` | **Cambiar** `sp500Data` → `sp500DataTf` en call sites 1414/1827 |
| `const LB = 63` | **Cambiar** por param `rsWindow` (default 63) |
| Firma `buildConcentradoCurves` | **Añadir** param `rsWindow` |
| `sp500Data` (descarga diaria) | **Intacto** |
| Inyección `sp500Close` a codeJs (#3) | **Intacto** (estrategias siguen en diario, como C) |
| Filtros de mercado (#4) | **Intacto** (^GSPC diario debe seguir diario) |
| Curva B&H (#5) | **Intacto** (diario) |

### Riesgos / notas
- **portfolioMode fuerza `alfabetico`** ([1413](pages/api/multibacktest.js#L1413)): el gate no se ejercita ahí hoy; el fix se nota en el path normal (concentrado + `prioridad:'fuerza_relativa'`). Preparar `sp500DataTf` en ambos por consistencia.
- **Doble descarga:** solo en semanal (una serie extra de ^GSPC). En diario, ninguna (reutiliza `sp500Data`). Inocuo.
- **Semántica de LB en semanal:** 63 velas = 15 meses; documentar/UI para que el usuario ajuste. Al ser configurable, es el usuario quien decide.
- **Coherencia con C:** tras este fix, el gate B y el RS visual C usarían ambos SP500 en timeframe activo; la inyección a codeJs (#3) seguiría en diario en ambos módulos (datos.js y multibacktest) — pendiente de una fase futura si se quiere que las estrategias con filtro SP500 también sean timeframe-consistentes.

---

### Resumen
- **Consumidores del SP500 en B:** 5 (descarga, gate, inyección codeJs, filtros, B&H) × 2 paths. Solo el **gate** quiere timeframe activo; el resto, diario.
- **LB=63 cuenta velas (índices)** → contar velas es gratis con SP500 semanal.
- **El gate alinea con backward-scan as-of** → no necesita forward-fill/helper nuevo (a diferencia de C).
- **Plan:** serie dedicada `sp500DataTf` (weekly-only) pasada solo al gate + `rsWindow` configurable vía `sizeRules` (canal de `momentumN`). Filtros/B&H/codeJs intactos en diario.
