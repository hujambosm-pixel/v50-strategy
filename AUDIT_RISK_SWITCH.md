# Auditoría read-only — Canvas estirado al cambiar de activo en Risk MGMT

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `components/CandleChart.js`. Solo lectura.

Síntoma: en Risk MGMT, con la 1ª acción del watchlist el gráfico se ve bien; al cambiar a otra acción el canvas se **estira verticalmente** (más alto que el contenedor, velas altísimas y finas, eje de precio comprimido). Es timing al cambiar de activo.

**Conclusión rápida:** al cambiar de símbolo en risk, `result` **sí** cambia de referencia (`run()`→`setResult`, `:3350`), así que el `useEffect` de velasH (deps `[sidePanel,result]`) **sí** se re-dispara — el problema **no** es que el símbolo falte en las deps. La causa es de **timing en CandleChart**: al cambiar `data` (=`result.chartData`), el chart se **re-crea** (deps del effect de creación incluyen `data`, `CandleChart.js:1382`). En esa re-creación, la altura la fija **FIX 2** (`:1374`) a 50 ms con `clientHeight || (window.innerHeight−30)`; si en ese instante `clientHeight` sale **0** (layout aún no asentado tras el commit del nuevo `result`), gana el **fallback `innerHeight−30`** → canvas ≈ ventana completa → estirado. El otro efecto que en el **primer** montaje daba 3 pasadas de corrección (`forceResize` a 0/50/150 ms, `:269-282`, deps `[fillHeight]`) **NO se vuelve a ejecutar** al cambiar de activo (fillHeight no cambia) → menos oportunidades de corregir → el fallback se queda. Esa es la asimetría "1ª bien, siguientes mal".

---

## 1. Qué cambia al seleccionar otra acción en risk

- El clic en el watchlist hace `setSimbolo(sym)` (p.ej. `pages/index.js:5410`); eso dispara el backtest `run(sym,payload)` que hace **`setResult(json)`** (`:3350`) y `setDisplayedSimbolo` (`:3351`). **`result` cambia de referencia.**
- `run` **no** pone `result=null` antes (no hay `setResult(null)` en su camino, `:3338-3352`), así que el bloque single-asset **no se desmonta**; se **actualiza** con el nuevo `result`.
- El `useEffect` de velasH tiene deps **`[sidePanel,result]`** (`:1219-1232`). Como `result` cambia, **el effect se re-ejecuta** y recalcula velasH (rAF doble + medir `chartWrapRef.top`). ⇒ La hipótesis "el símbolo vive en otro estado fuera de las deps" **no aplica**: `result` cubre el disparo. (`simbolo`/`displayedSimbolo` cambian también, pero no hacen falta en deps porque `result` ya cambia.)
- **Matiz:** el reccompute de velasH corre **una vez** por cambio (rAF doble) + listener `resize`. Si mide `topVelas` antes de que el layout del panel de riesgo con los datos nuevos esté asentado, puede quedar un velasH subóptimo sin re-disparo posterior (no hay resize). Pero `topVelas` (borde superior del chart-wrap, bajo el panel de métricas de altura ~fija) es bastante estable, así que el sospechoso principal es CandleChart (punto 2), no velasH.

Cita: `pages/index.js:5410`, `:3338-3352`, `:1219-1232`.

---

## 2. Timing / fallback: ¿se re-crea CandleChart? ¿corrige el RO?

- **Se re-crea.** El effect de creación de CandleChart tiene deps `[data,emaRPeriod,emaLPeriod,trades,maxDD,labelMode,definition,isBareChart]` (`CandleChart.js:1382`). Al cambiar de activo, `data={result.chartData}` (`pages/index.js:7229`) es nuevo → el effect corre: `chart.remove()` + `createChart({height:chartHeight})` con `chartHeight=candleH=480` (`:310`).
- Tras crear, dentro del mismo effect corre **FIX 2** (`:1372-1376`): a 50 ms `h = containerRef.clientHeight || (window.innerHeight−30)` y `chart.resize(w,h)`. Si `clientHeight` es **0** en ese instante (el nuevo `result` acaba de commitear y la cadena flex/height aún no resolvió), aplica **`innerHeight−30`** → canvas gigante → estirado.
- **El RO** (`:1343-1349`) se re-crea con el effect y en su primer callback hace `if(fillHeightRef.current){const h=clientHeight; if(h>0)opts.height=h}` (`:1348`). Si al dispararse `clientHeight` ya es real (velasH−subpaneles) corrige; **pero** si sale 0 no aplica nada (guard `h>0`) y el canvas queda con el `innerHeight−30` de FIX 2. Cuando `clientHeight` pase a real el RO debería re-disparar… si detecta cambio de tamaño del `containerRef`; en la práctica, con FIX 2 habiendo forzado ya `innerHeight−30` sobre el chart (no sobre el div), el `containerRef` puede no cambiar de tamaño observable y el RO no re-corrige.

Cita: `CandleChart.js:1382`, `:310`, `:1372-1376` (FIX 2 fallback), `:1343-1349` (RO, guard `:1348`).

---

## 3. Por qué la 1ª sí y las siguientes no (la asimetría)

- **1er montaje** (al entrar en risk): CandleChart se **monta**. Corre el effect `[fillHeight]` (`:269-282`) que lanza **`forceResize` a 0, 50 y 150 ms** (`:277-279`) **+** FIX 2 (`:1374`) **+** el RO. Son **múltiples** pasadas repartidas en el tiempo; para cuando alguna corre, el layout ya está asentado → `clientHeight` real → altura correcta.
- **Cambios posteriores de activo**: NO se re-monta el componente y **`fillHeight` no cambia**, así que el effect `[fillHeight]` (`:269-282`) **no se re-ejecuta** → **no hay** nuevas pasadas 0/50/150. Solo corre lo del effect de **creación**: FIX 2 (una sola pasada a 50 ms) + un RO nuevo. Menos intentos y peor repartidos → si a 50 ms `clientHeight`=0, gana `innerHeight−30` y no hay quien lo enmiende. **Esa reducción de pasadas de corrección es la causa de la asimetría.**

Cita: `CandleChart.js:269-282` (deps `[fillHeight]`, 3 pasadas), `:1372-1376` (única pasada en re-creación).

---

## 4. ¿velasH incorrecto, o velasH correcto pero el chart no lo usa?

**velasH correcto; el chart no lo usa (transitoriamente).** Argumentos:
- El `chart-wrap` de risk tiene `height:velasH` (px definido, `pages/index.js:7115` rama else) y velasH se recalcula al cambiar `result`. `topVelas` es estable (panel de métricas de altura ~fija encima), así que velasH conserva un valor correcto (similar al del activo anterior).
- El estirado no viene de que `chart-wrap` mida mal, sino de que **CandleChart, al re-crearse, aplica `innerHeight−30`** (FIX 2) en vez de leer el `clientHeight` real de su contenedor. Es decir, el contenedor tiene la altura buena (velasH), pero el chart se dimensiona a la ventana por el fallback durante la ventana de timing.
- Confirma la distinción: `overflow:hidden` (V9.582) **recorta** el exceso pero el canvas interno sigue a `innerHeight−30` → "velas altísimas, eje comprimido" (síntoma de canvas alto, no de contenedor alto).

Cita: `pages/index.js:7115` (height:velasH), `CandleChart.js:1374` (fallback aplicado al chart).

---

## 5. Fix probable (menor riesgo)

- **(B) Recomendada — endurecer el fallback de CandleChart (raíz, sin tocar el individual):** en `:274` (`forceResize`) y `:1374` (FIX 2), **no** usar `window.innerHeight−30`. En su lugar: si `clientHeight` es 0, **no** hacer `resize` (return y esperar al RO), o usar la altura del contenedor padre real (`containerRef.current.parentElement?.clientHeight`). Como el RO ya aplica la altura correcta cuando `clientHeight>0` (`:1348`), basta con **no** meter el valor bogus `innerHeight−30`. Impacto en el individual/fullscreen: **nulo** — allí `clientHeight` ya es real, así que nunca se usaba el fallback; sólo se elimina el caso `clientHeight=0`. Es el cambio de menor superficie y no reintroduce nada del individual.

- **(A) Complementaria (opcional) — re-medir velasH al cambiar de activo con más robustez:** `result` ya está en deps, pero podría añadirse `displayedSimbolo`/`simbolo` a las deps del effect de velasH (`:1232`) o re-lanzar `recompute` en un segundo rAF/timeout para cubrir el asentamiento del layout. Menos crítico si se aplica (B), porque velasH ya es correcto; (A) sólo refuerza el disparo.

- **(C) Alternativa — re-disparar las pasadas de corrección en re-creación:** hacer que el effect de las 3 pasadas `forceResize` (`:269-282`) también dependa de `data` (o replicar 2-3 pasadas dentro del effect de creación) para igualar el 1er montaje. Funciona pero **duplica** temporizadores y mantiene el `innerHeight−30`; más frágil que (B).

**Recomendación:** **(B)** como fix principal (elimina la fuente del estirado en cualquier variante de timing, coste mínimo, sin efectos en individual/fullscreen). Opcional **(A)** como refuerzo. Mantener el `overflow:hidden` de V9.582 como red de seguridad.

Cita: `CandleChart.js:274`, `:1374`, `:1348`; `pages/index.js:1232`.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Al cambiar de activo, `run()`→`setResult` cambia `result` de referencia → el effect de velasH (deps `[sidePanel,result]`) SÍ se re-dispara; el símbolo no falta en deps | `index.js:3350/3338-3352/1219-1232` |
| 2 | Cambiar `data` re-crea CandleChart (`:1382`); FIX 2 a 50 ms usa `clientHeight||innerHeight−30`; si clientHeight=0 aplica el fallback; el RO sólo corrige si `clientHeight>0` | `CandleChart.js:1382/1372-1376/1343-1349` |
| 3 | 1er montaje: 3 pasadas `forceResize` (0/50/150) + FIX 2 + RO. Cambios posteriores: effect `[fillHeight]` NO re-corre → sólo FIX 2 (1 pasada) → el fallback se queda. Esa es la asimetría | `CandleChart.js:269-282/1372-1376` |
| 4 | velasH es correcto (chart-wrap height:velasH, topVelas estable); el chart no lo usa: aplica `innerHeight−30` transitorio → canvas estirado (no el contenedor) | `index.js:7115`, `CandleChart.js:1374` |
| 5 | Fix (B): quitar el fallback `innerHeight−30` en `:274`/`:1374` (skip si clientHeight=0, esperar al RO); nulo impacto en individual/fullscreen. (A) reforzar deps velasH; (C) re-disparar pasadas (más frágil) | `CandleChart.js:274/1374/1348`, `index.js:1232` |
