# Auditoría read-only — Canvas sobredimensionado en Risk MGMT (clientHeight vs fallback innerHeight−30)

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `components/CandleChart.js`, `styles/globals.css`. Solo lectura.

Síntoma: en Risk MGMT el canvas de velas es **más alto que su contenedor** (velas fuera de vista, eje estirado). El `overflow:hidden` de V9.582 solo **oculta** el desborde, no corrige la altura. El individual embebido (misma `chart-wrap` tras V9.580) se ve bien.

**Conclusión rápida:** el individual funciona porque su `chart-wrap` tiene una **altura px definida** (`height:velasH`, ~878, medida por JS) → `containerRef.clientHeight` es real → CandleChart usa esa altura. Risk usa **`flex:1`** (sin px), y su altura depende de que **toda la cadena `height:100%`/`flex` resuelva a un valor definido**. Pero el tope de la cadena, `.app`, sólo tiene **`min-height:100vh`, no `height`** (`styles/globals.css:25`), así que la resolución de `height:100%` es **frágil**: cuando `chart-wrap flex:1` colapsa (chain no-definida en el instante de medir + `minHeight:0`), `containerRef.clientHeight` sale **0/pequeño** → CandleChart cae al **fallback `window.innerHeight−30`** (`CandleChart.js:274` y `:1381`) → canvas ≈ toda la ventana → sobredimensionado. El individual nunca toca ese fallback porque su altura px es definida.

---

## 1. Cadena de alturas en risk vs individual

**Tope común de la cadena (globals.css):**
- `html,body { min-height:100vh }` (`styles/globals.css:14`) ← **min-height, NO height**.
- `#__next { position:relative }` (`:19`) ← sin altura.
- `.app { display:flex; flex-direction:column; min-height:100vh }` (`:25`) ← **min-height, NO height**.
- `.content { flex:1; overflow-y:auto; display:flex; flex-direction:column }` (`:61`) ← flex:1, **sin height explícito**.

**Ramas dentro de `.content` (`pages/index.js:6602`):**
```
RISK:
.content (flex:1, sin height)                                   ← styles/globals.css:61
  :6701  {display:flex, flex:1, minHeight:0, overflow:hidden, height:100%}
    :6703  contentRef  risk → {flex:1, display:flex, flexDirection:column, overflow:hidden, height:100%}
      :6806  panel métricas  {flexShrink:0}                     ← altura natural (no encoge)
      :7115  chart-wrap  risk/bare → {flex:1, minHeight:0, display:flex, flexDirection:column, overflow:hidden}   ← SIN px, depende de la cadena
        :7116 → CandleChart (fillHeight)

INDIVIDUAL (normal):
.content (flex:1, sin height)
  :6701  {…, height:100%}
    :6703  contentRef  normal → {flex:1, overflowY:auto}        ← NO height:100%, NO display:flex → scroll
      :7115  chart-wrap normal → {height:velasH, …, overflow:hidden}   ← ★ ALTURA PX DEFINIDA (JS) ★
        :7116 → CandleChart (fillHeight)
```

**Punto clave:** el individual **no depende** de la cadena `%`: su `chart-wrap` tiene `height:velasH` (px concreto medido en el `useEffect` de velasH). Risk **sí depende** de que `height:100%`/`flex:1` propague desde `.app` (que sólo tiene `min-height:100vh`). Los contenedores que históricamente SÍ funcionan con flex (multi, fullscreen) usan **`height:calc(100vh−X)` explícito** (`:6606`, `:6669`, fullscreen `:7288`), no `min-height`. Risk es el único que confía en la propagación `%` desde un ancestro sin `height` definido.

Cita: `styles/globals.css:14/19/25/61`; `pages/index.js:6701`, `:6703`, `:6806`, `:7115`, `:7116`; `:6606/6669` (calc explícito).

---

## 2. clientHeight en risk → fallback

- CandleChart, en `fillHeight`, calcula la altura a aplicar como
  `h = containerRef.current.clientHeight || (window.innerHeight − 30)` en **dos** rutas:
  - `forceResize` (timeouts 0/50/150 + listener `resize`): `CandleChart.js:274`.
  - FIX 2 (resize inicial a 50 ms): `CandleChart.js:1381`.
- Si en el instante de esas rutas `containerRef.clientHeight` es **0** (porque `chart-wrap flex:1` aún no tiene altura resuelta — la cadena `%` no es definida al no tener `.app` un `height`, y `minHeight:0` permite el colapso), el `|| (window.innerHeight − 30)` **gana** → el canvas se dimensiona a ≈ altura de ventana completa, muy superior al hueco real.
- El RO (`CandleChart.js:1351-1356`) sólo corrige `height` **si `clientHeight>0`** (`:1355`: `if(h>0)opts.height=h`). Si `clientHeight` sigue 0 (o vuelve a 0), el RO **no** revierte el sobredimensionado del fallback → queda un canvas gigante. Con `overflow:hidden` (V9.582) sólo se **oculta** el exceso; la altura interna sigue mal (eje estirado, velas fuera del área visible).

**En el individual**, `clientHeight` es real (≈878) porque `chart-wrap` tiene `height:velasH` px → `h = clientHeight` (nunca el fallback). Por eso el individual se ve bien y risk no.

Cita: `CandleChart.js:274`, `:1381`, `:1351-1356` (`:1355` guard `h>0`).

---

## 3. Diferencia clave individual vs risk

| | Individual (bien) | Risk (sobredimensionado) |
|---|---|---|
| Altura del `chart-wrap` | `height:velasH` px (JS, `:7115` rama normal) | `flex:1` (`:7115` rama risk/bare) |
| ¿Definida sin depender de `%`? | **Sí** (px absoluto) | **No** (depende de cadena `height:100%`/flex desde `.app` con `min-height`) |
| `containerRef.clientHeight` | real (~878) | 0/pequeño en el instante de medir |
| Rama que gana en CandleChart | `clientHeight` real | fallback `innerHeight−30` |
| velasH effect | corre (`:1224`) | **NO corre** — early-return `if(sidePanel==='risk')…return` (`:1220`) |

El delta es exactamente ese: el individual inyecta una **altura px definida** (velasH) que hace `clientHeight` fiable; risk se queda en `flex:1` sobre una cadena `%` no-definida → `clientHeight` 0 → fallback.

Cita: `pages/index.js:7115` (ambas ramas), `:1220` (early-return risk), `:1224`.

---

## 4. Fix probable (de menor riesgo)

Objetivo: que risk tenga una **altura px definida** como el individual, para que `clientHeight` sea real y no se dispare el fallback.

- **(A) Recomendada — replicar el mecanismo del individual en risk:** dar al `chart-wrap` de risk una **altura px medida** (idéntico patrón a `velasH`). En concreto:
  1. Permitir que el `useEffect` de `velasH` **también corra en risk** (hoy hace early-return con `sidePanel==='risk'`, `:1220`). La fórmula `innerHeight − topVelas − 8` ya sirve: en risk el `chart-wrap` es el último elemento de `contentRef`, así que llena desde su top hasta el fondo.
  2. En `:7115`, la rama risk/bare pasa de `flex:1` a **`height:velasH`** (manteniendo `minHeight:0, display:flex, flexDirection:column, overflow:hidden`), igual que la rama normal.
  Con esto `chart-wrap` tiene px definido → `containerRef.clientHeight` real → CandleChart usa la altura correcta, dentro del contenedor (no a toda la ventana). Es el patrón **ya probado** por el individual → mínimo riesgo conceptual. (Nota: `bareChart` usa su propio ajuste `innerHeight−chartHeight` `:1382-1392`; convendría condicionar el cambio a `sidePanel==='risk'` y no alterar bare, o verificar que velasH también le sirve.)

- **(B) Acotar la cadena padre:** dar `height` explícito (no sólo flex) a `contentRef`/`:6701` en risk, p.ej. `height:calc(100vh − 56px)` en el contenedor risk, para que `flex:1` del `chart-wrap` resuelva a definido. Más "CSS-puro", pero toca contenedores compartidos y es sensible a que `.app` siga sin `height` (la `%` seguiría colgando de `min-height`); más frágil que (A).

- **(C) Endurecer el fallback de CandleChart:** en `:274`/`:1381`, **no** hacer `resize` cuando `clientHeight===0` (esperar al RO) en vez de usar `innerHeight−30`; o usar como fallback la altura del **padre** (`containerRef.current.parentElement.clientHeight`) en lugar de la ventana. Evita el sobredimensionado incluso sin px definido. Toca el componente compartido (fullscreen/individual también), más superficie de riesgo, pero es una buena **defensa en profundidad**.

**Recomendación:** **(A)** como fix principal (hace risk ≡ individual, mecanismo ya probado), **+ (C)** opcional como red de seguridad para que ningún modo `fillHeight` pueda volver a saltar a `innerHeight−30` con `clientHeight=0`. (B) descartada por frágil.

Cita: `pages/index.js:1220` (early-return a levantar), `:7115` (rama risk a px), `:1382-1392` (bare, no tocar); `CandleChart.js:274/1381` (fallback).

---

## 5. ¿Revertir el overflow:hidden de V9.582?

**Dejarlo.** Una vez aplicado (A), el canvas tendrá la altura correcta y ya no habrá exceso que recortar, así que `overflow:hidden` deja de ser necesario para el síntoma. Pero **no conviene revertirlo**: la rama **normal** del individual **también** lleva `overflow:hidden` (`:7115`), así que mantenerlo en risk da **paridad** con el individual y actúa de **red de seguridad** ante cualquier sobredimensión transitoria (primer paint antes de que el RO/px asiente la altura). Coste nulo, beneficio de robustez. Recomendación: conservarlo.

Cita: `pages/index.js:7115` (ambas ramas ya con overflow:hidden tras V9.582).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Tope de cadena `.app` usa `min-height:100vh` (no `height`); risk `chart-wrap` es `flex:1` y depende de propagación `%` frágil; individual usa `height:velasH` px (inmune) | `globals.css:14/25/61`, `index.js:7115/6701/6703` |
| 2 | En risk `containerRef.clientHeight`=0 en el instante de medir → CandleChart usa fallback `innerHeight−30` → canvas ≈ ventana; RO sólo corrige si `clientHeight>0` | `CandleChart.js:274/1381/1355` |
| 3 | Diferencia = altura px definida (individual) vs `flex:1` sobre cadena `%` no-definida (risk); además el effect velasH no corre en risk | `index.js:7115/1220/1224` |
| 4 | Fix (A): correr velasH en risk + `chart-wrap` risk a `height:velasH` (replica el individual). (C) opcional: fallback de CandleChart sin `innerHeight−30`. (B) frágil | `index.js:1220/7115`, `CandleChart.js:274/1381` |
| 5 | Mantener `overflow:hidden` de V9.582 (paridad con individual + red de seguridad); no revertir | `index.js:7115` |
