# Auditoría read-only — Velas inferiores cortadas en modo `fillHeight` (individual)

Fecha: 2026-07-06 · Alcance: `components/CandleChart.js`, `pages/index.js`. Solo lectura.

Síntoma: en el backtesting individual, el gráfico de velas recorta las velas de la **parte baja** del rango de precio. El eje de precio muestra etiquetas hasta abajo (p.ej. 5000) pero esas velas quedan **fuera del área visible por debajo**. El equity se ve bien.

**Conclusión rápida (adelanto):** el problema **NO es el auto-scale del eje de precio** (que está en `autoScale` por defecto = `true` y sí re-encaja). La causa real es que en `fillHeight` un `setTimeout` fuerza la **altura del canvas del chart a `window.innerHeight − 30`**, MUY superior a la altura real del contenedor (`velasH`). El canvas queda más alto que su contenedor, y como el `chart-wrap` tiene `overflow:hidden`, la franja inferior del canvas (las velas de abajo) se **recorta**. El auto-scale encajó todas las velas… pero dentro de un canvas más alto que el hueco visible.

---

## 1. Auto-scale / fit del eje de precio

- **Config del price scale principal**: `createChart(..., { rightPriceScale:{borderColor:'#1a2d45',minimumWidth:70}, ... })` — `CandleChart.js:302-308`. **No** fija `autoScale:false`, así que rige el default de lightweight-charts: **`autoScale:true`**. No hay ningún `priceScale('right').applyOptions({autoScale:false})` en el archivo (los únicos `applyOptions` sobre `'right'` tocan `scaleMargins`/anclas de RSI: `:555`, `:648`, `:1377`).
- **Fit del eje de tiempo**: `timeScale().fitContent()` solo se usa como *fallback* dentro de `applyInitialRange` (`:1118`) y en `fitAll`/`fitContent` de la API expuesta (`:1285`). El rango visible normal se fija con `setVisibleRange` (`applyInitialRange`, llamado en `:1362`). Esto afecta al **eje de tiempo**, no al de precio.
- **¿Se re-dispara el ajuste de precio al cambiar la altura?** Sí, implícitamente: con `autoScale:true`, cada vez que cambia la altura del pane, lightweight-charts recalcula la escala de precio para encajar las velas del rango visible en la nueva altura. **No queda “congelada” a la altura anterior.** Por tanto el auto-scale **no** es el fallo: dado un canvas de altura H, encaja las velas en H. El problema es que H es mayor que el hueco visible.

Cita: `CandleChart.js:302-308` (sin autoScale:false), `:1118`, `:1285`, `:1362`.

---

## 2. `fillHeight` + ResizeObserver: ¿reajusta la escala a la nueva altura?

- **El RO hace lo correcto**: `CandleChart.js:1343-1350`. En cada resize del contenedor, si `fillHeightRef.current`, lee `containerRef.current.clientHeight` y hace `chart.applyOptions({height})` (`:1348-1349`). Como `autoScale:true`, tras ese cambio de altura la escala de precio se re-encaja sola. **Este camino es correcto y no recorta.**
- **PERO hay un segundo setter de altura que rompe esto — “FIX 2”**: `CandleChart.js:1366-1373`.
  ```js
  if(fillHeightRef.current){
    setTimeout(()=>{
      if(disposed) return
      const w=containerRef.current?.clientWidth||window.innerWidth
      const h=window.innerHeight-30          // ← altura = CASI TODA LA VENTANA
      if(w>0&&h>0) chartRef.current?.resize(w,h)
    },50)
  }
  ```
  A los 50 ms fuerza `chart.resize(w, window.innerHeight − 30)`, **ignorando por completo la altura real del contenedor** (`velasH`). En el layout actual del individual `velasH = innerHeight − topVelas − bloqueEquity − 8` (`pages/index.js:1217-1236`), que es **bastante menor** que `innerHeight − 30`. Resultado: el canvas se dimensiona a casi toda la ventana, **más alto que su `chart-wrap`**.
- **Y el `chart-wrap` recorta el excedente**: en `pages/index.js:7124`, en modo normal el `chart-wrap` lleva `{height:velasH, …, overflow:'hidden'}`. El canvas sobresale por abajo y `overflow:hidden` **oculta la parte inferior** → las velas de abajo desaparecen. El eje de precio (que sí abarca todo el rango) muestra las etiquetas, pero los píxeles inferiores del canvas quedan fuera del área visible.
- **Por qué “se queda así”**: `FIX 2` es un `setTimeout` one-shot a 50 ms; sobrescribe la altura correcta que había puesto el RO. Como el contenedor no vuelve a cambiar de tamaño, el **RO no se re-dispara** y no corrige la altura → la altura errónea (`innerHeight−30`) persiste.

Orden de setters de altura que compiten (gana el último): `createChart height=chartHeight` (`:303`) → `useEffect [chartHeight]` `applyOptions({height:chartHeight})` (`:1400-1402`, con `chartHeight=candleH=480`) → **RO** `height=clientHeight` (correcto, `:1348`) → **FIX 2** `resize(w, innerHeight−30)` a 50 ms (**incorrecto, gana**).

Cita: `CandleChart.js:1343-1350`, `:1366-1373`, `:1400-1402`; `pages/index.js:7124`, `:1217-1236`.

---

## 3. Subpaneles (MACD / RSI / volumen): ¿roban altura al pane de precio?

- **Reparto de altura**: el componente renderiza un flex-column (`CandleChart.js:1582`). El pane principal (`:1583`, `flex:1, minHeight:0`) contiene el `containerRef` (`:1585`, `height:'100%'`). Los subpaneles van **debajo con altura FIJA**: MACD/volumen `height: 120 | 100 | 80` (`:1622`), RSI `height:120` (`:1626`), volumen `height:80` (`:1631`).
- Por tanto `containerRef.clientHeight = velasH − Σ(alturas fijas de subpaneles activos)`. Eso **reduce** el pane de precio, pero de forma **coherente**: el RO mediría ese `clientHeight` menor y el auto-scale encajaría las velas en él. Los subpaneles **por sí solos no recortan** — el pane sería más bajo pero completo.
- **Interacción con el bug**: `FIX 2` hace `resize(w, innerHeight−30)` sobre el **chart principal** (no sobre el contenedor flex). El canvas del pane de precio pasa a `innerHeight−30` mientras los subpaneles siguen ocupando su altura fija debajo; el conjunto (precio grande + subpaneles) desborda aún más el `chart-wrap`, agravando el recorte inferior. Es decir, los subpaneles **no son la causa raíz**, pero **amplifican** el desbordamiento cuando `FIX 2` infla el pane principal.

Cita: `CandleChart.js:1582-1585`, `:1622`, `:1626`, `:1630-1631`.

---

## 4. Comparación con modo NO-`fillHeight`

- **Antes de V9.573** el individual usaba `fillHeight=false` y `chartHeight={candleH}` (px fijo). El contenedor tomaba exactamente `candleH`, sin desbordar → **todas las velas visibles**. No entraba en el `if(fillHeightRef.current)` de `FIX 2`, así que nunca se forzaba `innerHeight−30`.
- **Ahora** (`pages/index.js:7282`) el individual normal pasa `fillHeight={!result.isBareChart}` → `true`, activando `FIX 2` en un contexto **embebido** (no pantalla completa) donde el contenedor es solo `velasH`. Ahí aparece el recorte.
- **`bareChart`** (`fillHeight=false`, `isBareChart=true`) usa su propio ajuste `height = innerHeight − chartHeight` (`:1382-1392`) y no pasa por `FIX 2` → se ve completo.
- **Pantalla completa** (`fillHeight={true}`, `:7...` overlay `position:fixed`) es justamente el caso para el que se pensó `FIX 2`: ahí el contenedor **sí** ocupa casi toda la ventana, así que `innerHeight−30` es aproximadamente correcto y no desborda.
- **Multibacktest**: usa otro componente (`components/BacktestCharts.js`), no `CandleChart`; no aplica.

Conclusión: la diferencia está exactamente en `FIX 2`, que solo es válido para el uso a pantalla completa y es **erróneo para el `fillHeight` embebido** introducido en V9.573.

Cita: `pages/index.js:7282`, `:7244`, `CandleChart.js:1382-1392`, `:1366-1373`.

---

## 5. Fix probable (descripción, sin implementar)

El fallo no es de `autoScale`, así que **añadir `priceScale().applyOptions({autoScale:true})` o un re-fit NO resolvería** (la escala ya se re-encaja; el problema es el canvas más alto que el hueco). El fix debe **dejar de forzar `innerHeight−30`** en el caso embebido.

Enfoques, de menor a mayor riesgo:

- **(A) Recomendado — mínimo riesgo:** en `FIX 2` (`CandleChart.js:1366-1373`) sustituir la altura objetivo por la **altura real del contenedor**:
  `const h = containerRef.current?.clientHeight || (window.innerHeight-30)`.
  Así, tanto en embebido (`velasH`) como en pantalla completa (≈ventana) la altura coincide con el hueco visible; el RO y `FIX 2` dejan de contradecirse. Un solo cambio de línea, sin tocar layout ni escala.
- **(B) Alternativa — eliminar `FIX 2`:** el RO (`:1343-1350`) ya aplica `height=clientHeight` en `fillHeight`. Si el motivo original de `FIX 2` (un primer render en el que el RO aún no había medido) ya no aplica, podría **quitarse** el bloque `:1366-1373`. Riesgo algo mayor: si en pantalla completa el RO no dispara a tiempo en el primer paint, habría que garantizar una medición inicial (p.ej. un `requestAnimationFrame` que lea `clientHeight` y aplique altura una vez).
- **(C) Menos preferible:** gate por contexto (`isBareChart`/prop nueva “fullscreen”) para que `FIX 2` solo actúe en pantalla completa. Introduce una prop/condición extra; (A) lo cubre sin ramificar.

**Recomendación:** opción **(A)** — medir `containerRef.clientHeight` en `FIX 2` en lugar de `window.innerHeight−30`. Es el cambio de menor superficie, mantiene el comportamiento a pantalla completa y elimina el desbordamiento inferior en el individual. No hace falta tocar el reparto pane/subpaneles (punto 3) ni el auto-scale (punto 1).

Cita: `CandleChart.js:1366-1373` (línea a cambiar), `:1343-1350` (RO ya correcto), `:1348`.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Price scale sin `autoScale:false` → default `true`; se re-encaja al cambiar altura. El auto-scale **no** es la causa | `CandleChart.js:302-308`, `:1400-1402` |
| 2 | **Causa raíz**: `FIX 2` fuerza `resize(w, innerHeight−30)` a 50 ms, ignorando `velasH`; canvas más alto que el `chart-wrap` (`overflow:hidden`) → velas inferiores recortadas. El RO hacía lo correcto pero `FIX 2` lo sobrescribe y no se re-dispara | `CandleChart.js:1366-1373`, `:1343-1350`; `pages/index.js:7124`, `:1217-1236` |
| 3 | Subpaneles con altura fija reducen el pane de precio de forma coherente; no son la causa, pero **amplifican** el desbordamiento cuando `FIX 2` infla el pane | `CandleChart.js:1582-1585`, `:1622-1631` |
| 4 | Antes (fillHeight=false, px fijo) se veía completo; V9.573 activó `fillHeight` embebido → entra en `FIX 2`. bareChart y multibacktest no afectados | `pages/index.js:7282`, `CandleChart.js:1382-1392` |
| 5 | Fix mínimo: en `FIX 2` usar `containerRef.clientHeight` en vez de `innerHeight−30` (opción A). No añadir re-fit de autoScale (no es el fallo) | `CandleChart.js:1366-1373` |
