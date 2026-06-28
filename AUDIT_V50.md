# Auditoría read-only del motor de backtest V50

Fecha: 2026-06-27 · Alcance: `lib/backtester.js`, `pages/api/multibacktest.js` y helpers importados.
Esta auditoría NO modifica lógica; solo documenta hallazgos con cita `archivo:línea`.

> **Nota de arquitectura clave:** la lógica de **señales/cruces/entradas/stops** NO vive en los archivos auditados. Reside en el `code_js` de cada estrategia (generado y guardado en Supabase), que se ejecuta como sandbox en `pages/api/multibacktest.js:1065` (`new Function(...)`). Los archivos auditados solo **ejecutan** las operaciones que el `code_js` devuelve y construyen las curvas/sizing de cartera. Por eso los puntos 1 y 2 no son verificables al 100% desde estos archivos.

---

## 1. Look-ahead en entradas (cruce i-2 vs i-1, entrada en open de i)

**VEREDICTO: DUDOSO (no verificable desde los archivos auditados).**

La detección de cruce y el precio/fecha de entrada los decide el `code_js` de la estrategia, ejecutado en `pages/api/multibacktest.js:1065-1072`:
```js
const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
const runFn = getRunFn(_libEMA, calcSMA, calcRSI, _libATR, calcMACD)
const result = runFn(enrichedData, { ...(cfg||{}), capital_ini: slotCapital, ... })
```
El motor consume `result.trades` (con `entryDate`/`entryPrice` ya decididos) — no impone ni puede verificar la regla "cruce i-2/i-1 → entrada en open de i". **Para auditar el look-ahead hay que revisar el `code_js` almacenado en la estrategia, no estos archivos.**

---

## 2. Timing de salida / same-day (¿entrada y salida en la misma barra?)

**VEREDICTO: OK en cuanto a soporte same-day (por diseño); DUDOSO en cuanto a si el stop se evalúa intradía el día de entrada (eso lo decide el `code_js`).**

- El motor **sí soporta** trades que abren y cierran el mismo día. En el simulador concentrado, `pages/api/multibacktest.js:271` comenta *"Same-day trade (entryDate === exitDate): abrir y cerrar atómicamente"*, y la apertura comprueba `if (t.exitDate === date)` en `pages/api/multibacktest.js:575` para liquidar en la misma fecha.
- Esto explica los trades con **entrada == salida** y **Días = 1**: en `buildTrades`, `pages/api/multibacktest.js:1052`:
  ```js
  const dias = Math.max(1, Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000))
  ```
  Un trade con `entryDate === exitDate` da `dias = max(1, 0) = 1`.
- **Pero** la decisión de SI un stop tocado el día de entrada cierra ese mismo día (intradía/close de i) o se difiere a i+1 está en el `code_js` (genera el `exitDate`), no en el motor. El motor solo respeta lo que el `code_js` reporta.

---

## 3. Slots "Capital concentrado": cap de 4 y sizing ≈ 25%

**VEREDICTO: OK.**

- **Cap de máximo simultáneas** (`maxPosiciones`, p.ej. 4): `pages/api/multibacktest.js:562` y `:569`:
  ```js
  const slotsLibresEfectivos = maxPosiciones - posicionesAbiertas - sameDayOpen   // :562
  if (slotsLibresEfectivos <= 0) { cntDescSlots++; ...; return }                  // :569 descarta si no hay cupo
  ```
- **Sizing ≈ capital/4 por posición**: `pages/api/multibacktest.js:567-570`:
  ```js
  const slotsEfectivos = Math.min(maxPosiciones, n)          // :567
  const capMaxPorPosicion = capitalTotal / slotsEfectivos    // :568  (capitalTotal/4 ≈ 25%)
  ...
  const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion) // :570  (acotado por pool libre)
  ```
  Cada entrada se dimensiona como `capitalTotal / min(maxPosiciones, nActivos)` ≈ 25% con cap=4, limitado por el pool disponible. Correcto.

---

## 4. Slots "Slots iguales": divisor y ausencia de cap

**VEREDICTO: PROBLEMA / CONFIRMADO (es como sospechabas — por diseño actual).**

- **Divisor = nº TOTAL de activos del universo**, no el máx. de slots simultáneos: `pages/api/multibacktest.js:101-104`:
  ```js
  function buildSlotsCurves(assetResults, capitalIni) {
    const n = assetResults.length          // :102  (= nº pares estrategia×símbolo con datos, p.ej. 12)
    ...
    const slotCapital = capitalIni / n     // :104  (capital/12, NO capital/4)
  ```
- **NO aplica cap de 4**: cada activo tiene su propio slot fijo y **todos pueden estar abiertos a la vez** (hasta `n`). La ocupación cuenta cuántos slots están abiertos sin techo de simultáneas — `pages/api/multibacktest.js:117` filtra abiertas por activo sin límite global, y `:140` (`if(e.open)openSlots++`) puede llegar a `n`.

Resumen: "Slots iguales" reparte `capitalIni / N_universo` (≈ /12) y permite hasta N posiciones simultáneas, **sin** el cap de 4 del modo concentrado. Es coherencia interna del modo (cada activo = 1 slot fijo), pero **no comparable 1:1 con concentrado** en nº de simultáneas ni en % por posición.

---

## 5. Capital empleado (occupancyCurve) = Σ capEntry de coste (sin (1+ret))

**VEREDICTO: OK (fix V9.546).**

Los 4 modos devuelven euros de **coste de entrada** de las posiciones abiertas, independiente del precio de mercado:
- slots: `pages/api/multibacktest.js:146` → `occupancyCurve.push({ date, value: openSlots * slotCapital })`
- compartido: `pages/api/multibacktest.js:356` → `return { date, value: openCapTotal }  // euros de coste`
- concentrado: `pages/api/multibacktest.js:660` → `return { date, value: openCapTotal }  // euros de coste`
- positionsizing: `pages/api/multibacktest.js:887` → `return { date, value: openCapTotal }  // euros de coste`

Donde `openCapTotal = Σ capitalAtEntryMap[symbol:entryDate]` (coste, **sin** `× (1+ret)`). No se mueve con el precio. La métrica `avgCapOccupancy` (Cap.inv%) se computa sobre la misma base coste en los 4 (`coste / portfolioTotal × 100`).

---

## 6. Seeding de la EMA por SMA en los primeros `period` bars

**VEREDICTO: OK (en ambos archivos).**

- `lib/backtester.js:13` (la EMA que reciben las estrategias vía `_libEMA`):
  ```js
  if (valid === period) { out[i] = sum / period; continue }   // semilla = SMA de los primeros `period`
  out[i] = values[i] * k + out[i - 1] * (1 - k)
  ```
- `pages/api/multibacktest.js:19` (EMA local para filtros/SP500), idéntica:
  ```js
  if (valid === period) { out[i] = sum / period; continue }
  out[i] = values[i] * k + out[i - 1] * (1 - k)
  ```
Ambas siembran con SMA en `valid === period` antes de pasar a la recursión EMA (`k = 2/(period+1)`), consistente con TradingView.

---

## Resumen de veredictos

| # | Punto | Veredicto |
|---|---|---|
| 1 | Look-ahead en entradas (cruce i-2/i-1, open de i) | **DUDOSO** — lógica en `code_js` (multibacktest.js:1065), no en archivos auditados |
| 2 | Timing salida / same-day | **OK** soporte same-day (multibacktest.js:271/575/1052); **DUDOSO** si stop intradía el día de entrada (en `code_js`) |
| 3 | Concentrado: cap 4 + sizing 25% | **OK** (multibacktest.js:562/567-570) |
| 4 | Slots iguales: divisor /N, sin cap | **PROBLEMA/CONFIRMADO** (multibacktest.js:102-104) — `/N_universo`, hasta N simultáneas, sin cap de 4 |
| 5 | Capital empleado = Σ capEntry coste | **OK** (multibacktest.js:146/356/660/887) |
| 6 | Seeding EMA por SMA | **OK** (backtester.js:13, multibacktest.js:19) |

**Acción recomendada (no aplicada):** revisar el `code_js` de la estrategia V50 para cerrar los puntos 1 y 2 (regla de cruce y timing de stop intradía), ya que el motor auditado no los impone.
