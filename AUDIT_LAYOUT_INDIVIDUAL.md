# Auditoría read-only — Layout velas + equity del backtesting individual

Fecha: 2026-07-03 · Alcance: `pages/index.js`, `components/CandleChart.js`, `components/EquityChart.js`. Solo lectura.

Objetivo: que el gráfico de **velas** (precio) y el de **equity** de la estrategia queden **ambos visibles a la vez sin scroll**, repartiéndose el alto disponible. Sin tocar el multibacktest.

---

## 1. Estructura del individual

Bloque cuando `result` y `sidePanel` no es multi/tradelog (`pages/index.js:6686-6689`):
```
:6641  <div height:calc(100vh - 56px), overflow:hidden>          ← panel raíz (acotado al viewport)
  :6687  <div display:flex, flex:1, minHeight:0, overflow:hidden, height:100%>   ← fila
    :6689  <div ref={contentRef} …>   ← COLUMNA PRINCIPAL
             normal backtest → {flex:1, overflowY:auto}   ← SCROLLEA
             (risk / bareChart → {flex:1, display:flex, flexDirection:column, overflow:hidden, height:100%})
      … barra/legend de velas …
      :7214  <CandleChart chartHeight={candleH}>      (velas)
      :7264  drag-handle velas
      … barra/legend equity …
      :~7420 <EquityChart chartHeight={equityH}>       (equity de la estrategia)
      :7458  drag-handle equity
      :7465  Ganancias mensuales (individual)
      … barras + historial de operaciones …
```
- **NO comparten un wrapper de altura acotada**: en backtest normal, `contentRef` (`:6689`) es `overflowY:auto`, así que velas y equity **se apilan** con alturas fijas y el resto (mensuales, historial) queda debajo; la columna **scrollea**.
- El panel raíz `:6641` **sí** acota a `calc(100vh - 56px)`, pero la columna interna scrollea → los dos gráficos no se reparten el viewport, simplemente se apilan.

---

## 2. Alturas actuales

- **Velas**: estado **`candleH`** = `useState(480)` (`:878`) — px fijo, **redimensionable por drag** (`:7264` → `candleResizing`), clamp 200–900 (`:919`). Se pasa como `chartHeight={result.isBareChart?bareChartHeight:candleH}` (`:7221`).
- **Equity**: estado **`equityH`** = `useState(260)` (`:880`) — px fijo, **redimensionable por drag** (`:7458` → `equityResizing`), clamp 120–600 (`:923`). Se pasa como `chartHeight={equityH}` (`:7454`).
- **Independientes**: cada uno tiene su altura propia. Suma por defecto ≈ 480+260 = **740px** (+ barras/legends/handles) → **supera el viewport** → scroll.

---

## 3. Tipo de chart y patrón de ResizeObserver

- **Ambos son lightweight-charts** (`createChart`): CandleChart `components/CandleChart.js:302`; EquityChart `components/EquityChart.js:15`.
- **ResizeObserver**:
  - **EquityChart**: RO corregido en **V9.565** (`roRef` + flag `cancelled`, cleanup en el return del useEffect externo). Sin leak.
  - **CandleChart**: usa un patrón **distinto pero correcto** — guarda su cleanup (incl. `ro.disconnect()`) en `innerCleanupRef.current` (`CandleChart.js:1375`) y lo invoca en el **return del useEffect externo** (`:1377`, `innerCleanupRef.current?.()`), con flag `disposed`. **No tiene el leak** del `.then`.
- Ambos aplican cambios de altura vía un `useEffect([chartHeight])` con `applyOptions({height})` en try/catch (CandleChart `:1401-1402`; EquityChart `:130-132`) → **cambiar la altura no recrea el chart**.

---

## 4. Drag-handles del individual

- **Velas** (`:7264`): `onMouseDown` activa `candleResizing`; el mousemove compartido (`:917-920`) hace `setCandleH(clamp 200–900)`.
- **Equity** (`:7458`): `onMouseDown` activa `equityResizing`; mousemove (`:921-924`) hace `setEquityH(clamp 120–600)`.
- Ambos usan el **mismo listener global** de mousemove/mouseup (`:911-930`, `onMove`/`onUp`), compartido con sidebar/right/candle/equity. **Son independientes**: cada handle agranda su gráfico sin quitar espacio al otro (por eso al agrandar uno hay que scrollear para ver el otro).

---

## 5. ¿Hay contenedor que acote a la ventana para repartir?

- **Existe el acotado a viewport**: panel raíz `:6641` (`calc(100vh - 56px)`, `overflow:hidden`).
- **PERO no se usa para repartir**: la columna `contentRef` (`:6689`) es `overflowY:auto` y cada gráfico tiene **altura independiente fija**. No hay un flex-column que divida el alto entre velas y equity. Resultado: **sobra/falta según la suma** `candleH+equityH` (por defecto 740px) frente al viewport; si no cabe, scroll.
- (En modo `bareChart`/`risk`, `contentRef` sí es `display:flex, flexDirection:column, overflow:hidden, height:100%`, pero eso es otro modo, no el backtest normal con velas+equity.)

---

## 6. Cambio mínimo (descripción, no implementado)

Meta: velas + equity **ambos visibles sin scroll**, repartiéndose el alto; el resto (mensuales, historial) queda debajo, scrolleable.

**Qué contenedor acota**: envolver **solo velas + equity** (con sus barras/handle) en un **flex-column de altura ≈ `calc(100vh - X)`** dentro de `contentRef`, dejando mensuales/historial fuera de ese wrapper (siguen en el scroll de `contentRef`). El panel raíz `:6641` ya da el techo de viewport.

**Cómo dividir el alto** (lightweight-charts necesita **px**, no `flex`, para su altura → hay que medir y pasar px a `candleH`/`equityH`, como el autofit del multi `mcEquityH`):
1. Medir el hueco disponible: `avail = window.innerHeight - X` (X = header 56 + barra/legend de velas + legend equity + handles + márgenes; aprox. **X ≈ 180–220**).
2. Repartirlo por un **ratio** (p.ej. velas 60% / equity 40%): `candleH = Math.round(avail*0.6)`, `equityH = Math.round(avail*0.4)`. Recalcular en **montaje** y en **resize** (patrón idéntico al `useEffect` de `mcEquityH` del multi, con cleanup del listener en el return externo).
3. **Drag-handles**: dos opciones —
   - (a) Eliminarlos (como se hizo en el multi) y dejar el reparto 100% automático; o
   - (b) Sustituir los dos drags independientes por **un único divisor** entre velas y equity que ajuste el **ratio** (mover el divisor sube uno y baja el otro, manteniendo la suma = `avail`). Es lo que mejor encaja con "se reparten el alto".

**No tocar**: el multibacktest, los cálculos, ni el comportamiento de los charts (solo su altura vía `applyOptions`, que ya es seguro). El modo `bareChart`/`risk` usa otra rama de `contentRef` y no debe alterarse.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Panel acotado `:6641` (`calc(100vh-56px)`) → columna `contentRef` `:6689` (`overflowY:auto`) → velas+equity **apilados**, scroll | `:6641`, `:6687`, `:6689` |
| 2 | `candleH` (480, `:878`) y `equityH` (260, `:880`), px draggables independientes; suma ≈740 > viewport | `:878`, `:880`, `:7221`, `:7454` |
| 3 | Ambos lightweight-charts; RO ya sin leak (EquityChart V9.565 `roRef`; CandleChart `innerCleanupRef` en return externo) | `CandleChart.js:302/1375-1377`, `EquityChart.js:15` |
| 4 | Dos drag-handles independientes (candle `:7264`, equity `:7458`) sobre el mousemove compartido `:917-924` | `:7264`, `:7458`, `:917-924` |
| 5 | Viewport acotado existe (`:6641`) pero **no se reparte**: alturas fijas + `overflowY:auto` | `:6641`, `:6689` |
| 6 | Fix: wrapper flex-column `calc(100vh - X)` (X≈180-220) que mida y reparta px a `candleH`/`equityH` por ratio (60/40), + un único divisor o drags fuera | `:6689`, `:878-880` |
