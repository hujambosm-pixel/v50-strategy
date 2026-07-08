# Auditoría read-only — Gráfico deformado/estirado al seleccionar una acción de abajo del watchlist

Fecha: 2026-07-08 · Alcance: `pages/index.js`, `components/CandleChart.js`, `styles/globals.css`. Solo lectura.

Síntoma (confirmado por captura): el área del gráfico (chart-wrap / `velasH`) debería tener altura FIJA. Con acciones de ARRIBA de la lista se respeta; con acciones de ABAJO (a las que se llega tras hacer scroll) el gráfico se ve **deformado/estirado verticalmente**, como si la altura se calculara contra el viewport/posición visible en ese instante (con el scroll aún desplazado). El fix de V9.590 (`scrollTop=0` en `useEffect [result]`) NO lo resolvió.

**Conclusión rápida:** `velasH` se calcula como `window.innerHeight − chartWrapRef.getBoundingClientRect().top − 8` (`pages/index.js:1225-1226`). `.top` es **relativo al viewport**, así que `velasH` **queda acoplado a la posición de scroll**: si en el momento de medir hay CUALQUIER scroll activo (de un contenedor ancestro o de la ventana), `chart-wrap.top` baja → `velasH` **se infla** → el chart-wrap crece de más → deformación. La medición de CandleChart (`clientHeight` / `parentElement.getBoundingClientRect().height`, `CandleChart.js:277`) es **independiente del scroll** (mide alturas, no posiciones), así que la deformación viene **solo de velasH**. V9.590 reseteó `contentRef.scrollTop`, pero eso (a) no neutraliza el acoplamiento a la posición viewport y (b) es un no-op en risk (`contentRef` es `overflow:hidden`), donde el síntoma también aparece → la referencia frágil es el `getBoundingClientRect().top`, no el scroll de `contentRef`.

---

## 1. Cálculo de altura del gráfico (velasH)

`pages/index.js:1219-1232`, dentro del `useEffect([sidePanel,result])`:
```js
const topVelas=el.getBoundingClientRect().top             // :1225  ← VIEWPORT-relativo (depende del scroll)
const h=Math.max(240, Math.round(window.innerHeight - topVelas - MARGEN))  // :1226  ← innerHeight (fijo) − top (móvil)
setVelasH(prev=>prev===h?prev:h)                          // :1227
```
`velasH` se pasa como altura del `chart-wrap` (`pages/index.js:7124`, rama no-bare: `{height:velasH,…}`). La cadena de altura de CandleChart es el "three-level fallback": `clientHeight → parentElement.getBoundingClientRect().height → (espera al RO)` en `components/CandleChart.js:277` (y su gemelo en FIX 2, `:1374`). **Esos tres niveles miden ALTURA (no posición) → son inmunes al scroll.** El único término sensible al scroll es `topVelas` en `:1225`.

Cita: `pages/index.js:1225-1226`, `:7124`; `CandleChart.js:277`, `:1374`.

---

## 2. Orden de ejecución (setResult → scrollTop=0 → medición)

Al seleccionar una fila: `setSimbolo` → `run()` → `setResult(json)` (`pages/index.js:3350`). En el commit resultante se ejecutan, en orden de declaración:
1. `useEffect([sidePanel,result])` de velasH (`:1219`): programa `raf=requestAnimationFrame(()=>requestAnimationFrame(recompute))` (`:1229`) — **no mide aún**, difiere 2 frames.
2. `useEffect([result])` de reset (`:1239-1241`): `contentRef.current.scrollTop=0` **síncrono**.

Es decir, para `contentRef` el reset (paso 2) ocurre ANTES de la medición (paso 1 mide 2 frames después). Por eso, en teoría, el scroll de `contentRef` ya es 0 al medir. **Que aun así deforme demuestra que el término problemático no es el scroll de `contentRef`, sino la referencia viewport de `getBoundingClientRect().top`** (punto 3): si el desplazamiento proviene de la ventana o de otro ancestro —o si la medición captura un `top` distinto del "fijo"— resetear `contentRef` no lo corrige. En **risk**, `contentRef` es `overflow:hidden` (`:6712`) → `scrollTop=0` es un **no-op** y sin embargo el síntoma aparece → confirma que la causa no es el scroll de `contentRef`.

Cita: `pages/index.js:3350`, `:1219/1229`, `:1239-1241`, `:6712`.

---

## 3. Dependencia de la medición con el scroll (por qué `top` es frágil)

`velasH = window.innerHeight − chartWrapRef.top`. `window.innerHeight` es constante; `chartWrapRef.top` es la posición del chart-wrap **en el viewport**, que se mueve con el scroll de cualquier contenedor que lo contenga:

```
.app (globals.css:25)  min-height:100vh
  .main (globals.css:35)  flex:1; overflow:hidden        ← acota la fila
    aside .sidebar (index.js:4773, overflow:hidden)
        :5265  LISTA watchlist  {overflowY:'auto', flex:1}   ← scroller de la lista
    .content (:6611) → :6710 → contentRef (:6712)
        watchlist → {flex:1, overflowY:'auto'}               ← scroller del contenido (contiene chart-wrap)
        risk/bare → {overflow:'hidden', height:'100%'}       ← NO scrollea
          :7124  chart-wrap (ref=chartWrapRef, height:velasH)
```

- La resta `innerHeight − top` presupone que `chart-wrap.top` está en una posición **fija** del viewport. Eso solo es cierto si **ningún** ancestro está scrolleado al medir. En cuanto `contentRef` (watchlist) o cualquier scroller ancestro tiene `scrollTop>0`, `chart-wrap.top` disminuye y `velasH` se infla.
- La forma **robusta** sería medir relativo al contenedor: `velasH = contentRef.clientHeight − (chartWrapTop − contentRefTop) − margen`. La diferencia `(chartWrapTop − contentRefTop)` = altura de lo que hay ENCIMA del chart dentro del contenido (toolbars / panel de riesgo), y es **invariante al scroll** (ambos `top` se desplazan juntos). La fórmula actual, al usar `window.innerHeight` (fijo) en lugar de `contentRef.clientHeight` (que acompaña al contenedor), introduce el acoplamiento.

Cita: `styles/globals.css:25/35`; `pages/index.js:4773/5265/6611/6712/7124`, `:1226`.

---

## 4. ResizeObserver / re-medición al cambiar de símbolo

- El `useEffect` de velasH tiene deps `[sidePanel,result]` (`:1232`), así que **SÍ se re-dispara** al cambiar de símbolo (nuevo `result`) y re-mide (`:1229` doble rAF). No usa un valor obsoleto: re-mide… pero re-mide `getBoundingClientRect().top` (viewport) → hereda el acoplamiento del punto 3.
- El `ResizeObserver`/`forceResize` de CandleChart (`CandleChart.js:269-284` y `:1349-1356`) se re-crea con cada cambio de `data` y aplica `clientHeight`/`parent height` (independientes del scroll). No introduce deformación por su cuenta: simplemente **rellena el `chart-wrap`**, cuya altura ya viene inflada por `velasH`. Es decir, el chart no "usa una altura obsoleta": usa fielmente el `velasH` mal calculado.
- Por tanto la deformación no es de timing del RO, sino de **qué valor se le da al `chart-wrap`** (velasH acoplado al scroll).

Cita: `pages/index.js:1229/1232`; `CandleChart.js:269-284`, `:1349-1356`.

---

## 5. Fix probable (menor riesgo)

El objetivo: que `velasH` sea **independiente de la posición de scroll**.

- **(A) Recomendada — medir relativo al contenedor de contenido, no al viewport:** cambiar la fórmula (`:1225-1226`) a:
  ```
  const cont = contentRef.current
  const topVelas   = chartWrapRef.current.getBoundingClientRect().top
  const topContent = cont.getBoundingClientRect().top
  const h = Math.max(240, Math.round(cont.clientHeight - (topVelas - topContent) - MARGEN))
  ```
  `(topVelas − topContent)` = offset del chart dentro del contenido, **invariante al scroll**; `cont.clientHeight` = alto visible del contenido, también invariante. Así `velasH` no depende de cuánto se haya desplazado nada. Cambio localizado en el `useEffect` de velasH; no toca CandleChart, chart-wrap, ni el layout. Es el de **menor riesgo** y ataca la raíz.

- **(B) Alternativa — garantizar scroll=0 y remedir acoplado:** en el `useEffect [result]`, PRIMERO resetear el scroll (de `contentRef` **y** `window.scrollTo(0,0)` por si hay scroll de ventana) y LUEGO, en el mismo rAF, forzar la remedición de velasH (unificar los dos effects para imponer el orden reset→medir). Menos robusto que (A): sigue midiendo contra el viewport y depende de que no quede ningún scroll residual; además no arregla el caso risk si el desplazamiento fuera de otro origen.

- **(C) Redundante:** subir la medición a `useLayoutEffect` para medir antes del paint — no elimina el acoplamiento al scroll, solo cambia el instante; no recomendado por sí solo.

**Recomendación:** **(A)** — reescribir la fórmula de `velasH` para medir la altura disponible **dentro de `contentRef`** (`clientHeight` menos el offset del chart dentro del contenido), eliminando `window.innerHeight − top`. Queda inmune al scroll de lista, de contenido y de ventana, y hace la altura verdaderamente FIJA por diseño. (El `scrollTop=0` de V9.590 puede mantenerse: es inocuo y sigue posicionando el gráfico arriba, pero deja de ser el mecanismo del que depende la altura.)

Cita: `pages/index.js:1225-1226` (fórmula a cambiar), `:6712` (contentRef como referencia), `:1239-1241` (reset V9.590, complementario).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | `velasH = innerHeight − chartWrap.getBoundingClientRect().top − 8`: `.top` es viewport-relativo → acoplado al scroll. CandleChart mide `clientHeight`/`parent height` (independiente del scroll) | `index.js:1225-1226/7124`; `CandleChart.js:277` |
| 2 | Orden: velasH programa medición diferida (doble rAF, `:1229`); reset `scrollTop=0` (`:1240`) es síncrono → precede a la medición para `contentRef`. Que aun así falle prueba que la causa es la referencia viewport, no el scroll de contentRef (en risk el reset es no-op) | `index.js:1219/1229/1239-1241/6712` |
| 3 | La resta `innerHeight − top` presupone `top` fijo; con cualquier ancestro scrolleado, `top` baja y velasH se infla. Robusto sería medir contra `contentRef` (diferencia de tops, invariante al scroll) | `globals.css:25/35`; `index.js:5265/6712/7124/1226` |
| 4 | velasH SÍ re-mide al cambiar símbolo (`deps [sidePanel,result]`), pero re-mide el `top` viewport → hereda el bug. El RO de CandleChart solo rellena el chart-wrap con el velasH ya inflado; no es timing del RO | `index.js:1229/1232`; `CandleChart.js:269-284` |
| 5 | Fix (A): `velasH = contentRef.clientHeight − (chartWrapTop − contentRefTop) − margen` → independiente del scroll. (B) reset window+content y remedir acoplado (menos robusto). Mantener scrollTop=0 como complemento inocuo | `index.js:1225-1226/6712/1239-1241` |
