# Auditoría read-only — Curva de equity "Simple" inflada (ignora el sizing por slots)

Fecha: 2026-07-01 · Alcance: `pages/api/multibacktest.js`. Solo lectura.

Contexto: en Concentrado (4 slots, posición ≈25%), el Compuesto da 30.121€ (correcto) pero el Simple ~59k. Diagnóstico: el Simple aplica el retorno de cada trade sobre el capital COMPLETO (10.000), no sobre la fracción real de la posición (~2.500). Factor de error ≈ 4 (= nº slots).

---

## 1. Dónde se construye Simple vs Compuesto

Son **el mismo bucle**, dos líneas distintas (no es un flag). En Concentrado, `pages/api/multibacktest.js:648-654`:
```js
sampledDates.forEach(date => {
  const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
  const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)          // :651  COMPUESTO
  compoundCurve.push({ date, value: val })
  const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)  // :653  SIMPLE
  simpleCurve.push({ date, value: simpleVal })
  ...
```
- **Compuesto** (`:651`): suma `t.pnlSimple` (= `capAsignado × pnlPct/100`, el P&L de la posición REAL con su capital asignado).
- **Simple** (`:653`): suma `capitalIni × pnlPct/100` (el retorno aplicado al **capital ENTERO**).

---

## 2. Cómo dimensiona cada operación el Simple

`pages/api/multibacktest.js:653`:
```js
const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
```
Aplica `pnlPct` sobre **`capitalIni`** (10.000, el capital inicial COMPLETO), **no** sobre la fracción real de la posición. El Compuesto, en cambio, usa `t.pnlSimple = capAsignado × pnlPct/100` (`capAsignado` ≈ 2.500 = capital realmente asignado al slot, ver `:616`/`:636`). El Simple **ignora ese `capAsignado`** y usa el capital entero.

---

## 3. Confirmación del diagnóstico

**CONFIRMADO.** El Simple aplica cada retorno al 100% del capital (`capitalIni × pnlPct/100`, `:653`), ignorando que Concentrado inmoviliza ~25% por posición. El factor de inflado = `capitalIni / capAsignado` ≈ `capitalIni / (capitalIni/slots)` = **nº slots ≈ 4**. Coincide con lo observado (10.000 × 4,887 = 58.870 ≈ 59k, cuando el correcto con posición fija 2.500 sería 10.000 + 2.500×4,887 = 22.217).

**Dónde falta el factor de tamaño de posición**: en `:653`, el multiplicador debería ser la **fracción fija por posición** (`capitalIni / nº slots`), no `capitalIni`.

---

## 4. Alcance por modo

| Modo | Línea del Simple | ¿Inflado? | Base que usa |
|---|---|---|---|
| **Concentrado** | `:653` | **SÍ (bug)** | `capitalIni × pnlPct/100` (capital entero) |
| **Compartido** | `:324` | **SÍ (bug)** | `capitalIni × pnlPct/100` |
| **Position Sizing** | `:881` | **SÍ (bug)** | `capitalIni × pnlPct/100` |
| **Slots iguales** | `:115` | No (correcto) | per-slot `t.pnlSimple` (basado en `slotCapital = capitalIni/n`) |
| **Custom (pesos)** | `:979` | No (correcto) | `slotCapital × pnlPct/100` (capital del slot ponderado) |
| **B&H** | (curva de precio) | No | `slotBH × close/p0` — no usa `pnlPct` ni `capitalIni × pnlPct` |

**Conclusión de alcance:** el Simple está inflado en los **tres modos de pool** (Concentrado, Compartido, Position Sizing), que calculan a nivel de cartera y usan `capitalIni` entero. **Slots** y **Custom** son correctos porque calculan por-activo con el `slotCapital` fijo de cada slot. **B&H no está afectado** (se deriva del ratio de precios, no de `pnlPct`).

---

## 5. Fix mínimo (descripción, no implementado)

El Simple debe usar una **posición de tamaño FIJO** (misma fracción por slot que el Compuesto usa como base, pero **sin** reinvertir/compounding). Para Concentrado, ese tamaño fijo es `capitalIni / nº slots efectivos` (= `capitalIni / Math.min(maxPosiciones, n)` ≈ 2.500), que ya se calcula en el loop de apertura como `slotsEfectivos` (`:567`).

**Cambio mínimo en Concentrado (`:653`):**
```js
// antes:
const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
// después (posición fija = capitalIni/slots):
const _slotFijo = capitalIni / Math.min(maxPosiciones, n)          // = 2.500 con 4 slots
const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + _slotFijo * (t.pnlPct / 100), 0)
```
(`_slotFijo` se computa una vez a nivel de la construcción de curvas, es constante.)

**Compartido y Position Sizing (`:324`, `:881`)**: mismo defecto (usan `capitalIni`). El arreglo análogo es sustituir `capitalIni` por la **base fija por posición** que corresponda a cada modo:
- Compartido: la fracción nominal por posición concurrente (p.ej. `capitalIni / maxPosiciones` si aplica, o `capitalIni / n`) — requiere fijar la definición de "posición fija" en ese modo.
- Position Sizing: el tamaño es por riesgo (variable), así que la "posición fija" del Simple debe definirse explícitamente (p.ej. un nominal de referencia). Conviene decidir la base antes de tocarlo.

**Alternativa más robusta (mode-agnóstica):** al hacer `executedTrades.push(...)`, guardar por trade un `pnlSimpleFijo = slotFijo × pnlPct/100` (con el `slotFijo` propio de cada modo), y en la curva Simple sumar `t.pnlSimpleFijo` en vez de `capitalIni × pnlPct/100`. Así cada modo define su base fija en un solo sitio y la curva Simple queda uniforme.

**No tocar:** Slots (`:115`), Custom (`:979`) y B&H ya son correctos. El Compuesto (`:651`) no se toca.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Simple y Compuesto = mismo bucle, dos líneas | `:651` (comp) / `:653` (simple) |
| 2 | Simple usa `capitalIni × pnlPct/100` (capital entero) | `:653` |
| 3 | **Confirmado**: ignora el sizing por slots; factor ≈ nº slots | `:653` vs `capAsignado` `:616/636` |
| 4 | Inflado en **Concentrado (:653), Compartido (:324), Position Sizing (:881)**; correctos Slots (:115), Custom (:979); B&H no afectado | tabla |
| 5 | Fix: sustituir `capitalIni` por posición fija `capitalIni/Math.min(maxPosiciones,n)` (o `pnlSimpleFijo` por trade) | `:653` (+ `:324`, `:881`) |
