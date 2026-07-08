# Auditoría read-only — Viabilidad de rediseño flex para la altura del gráfico

Fecha: 2026-07-08 · Alcance: `pages/index.js`, `styles/globals.css`. Solo lectura.

Objetivo: evaluar sustituir el cálculo JS de `velasH` (por posición, `getBoundingClientRect().top`) por **CSS flexbox puro** — `contentRef` con altura FIJA (`calc(100vh − X)`) como flex-column y el chart-wrap como `flex:1; min-height:0`.

**Conclusión rápida:** `contentRef` es **exclusivo de la vista single-asset** (individual/watchlist, risk, bareChart) — Dashboard y multi usan OTROS contenedores (`#tlDashOuter`, `.mc-scroll`). Así que fijar su altura NO afecta a esas vistas. PERO hay un matiz decisivo: en watchlist el diseño es "chart llena el viewport, y equity/mensuales/historial quedan DEBAJO en el scroll de `contentRef`". Poner el chart-wrap como `flex:1` **directamente** dentro de `contentRef` **NO** sirve: competiría con esos hermanos altos (equity/mensuales/historial) y se encogería — es exactamente la "race del reparto" que ya sufrimos. La forma correcta es: dar a `contentRef` una **altura fija explícita** (`calc(100vh − 56px)`, como el Dashboard) para que sea un scroller fiablemente acotado, y que el **chart-wrap ocupe el 100% de esa altura visible** (llenando el viewport), dejando equity/mensuales/historial **fluir debajo** en el scroll. Risk ya usa hoy un flex-column acotado (chart `flex:1`) y no necesita cambio. Recomendación: opción CSS-pura acotando `contentRef`, sin `velasH` JS.

---

## 1. Estructura actual de contentRef

- `contentRef` (`pages/index.js:6712`):
  - watchlist/individual → `{flex:1, overflowY:'auto'}` — **sin `height` explícito**; su altura depende de la cadena flex.
  - risk/bare → `{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', height:'100%'}`.
- Padre `:6710` → `{display:'flex', flex:1, minHeight:0, overflow:'hidden', height:'100%'}`.
- `.content` (`styles/globals.css:61`) → `flex:1; overflow-y:auto; display:flex; flex-direction:column`.
- `.main` (`styles/globals.css:35`) → `flex:1; overflow:hidden`.
- `.app` (`styles/globals.css:25`) → `min-height:100vh` (**min-height, no height**).

→ En watchlist, `contentRef` **crece/collapsa según la cadena `%`/flex**, que cuelga de `.app` (min-height). Es la fragilidad ya vista (V9.592): su `clientHeight` no es un "viewport acotado" fiable. **No tiene altura fija explícita.** El Dashboard, en cambio, sí usa altura fija: `#tlDashOuter` (`:9472`) contiene un bloque `height:'calc(100vh - 88px)'` (`:9511`).

Cita: `pages/index.js:6710/6712/9472/9511`; `styles/globals.css:25/35/61`.

---

## 2. Hermanos del chart-wrap dentro de contentRef (vista individual)

En watchlist, `contentRef` contiene, en orden de flujo:
| Elemento | Cita | Altura actual |
|---|---|---|
| chart-wrap (velas) | `:7124` | `height:velasH` (px, JS) — o `flex:1` en bare |
| overlay fullscreen (condicional) | `~:7288` | `position:fixed` (FUERA de flujo, no compite) |
| bloque métricas grid (condicional `metricsLayout==='grid'`) | `~:7431` | EN flujo, auto |
| equity-section (equity chart + botones) | `:7429` | auto (natural) |
| Ganancias mensuales | `:7480` | auto |
| equity-section / capital invertido (barras) | `:7517` | auto |
| historial de operaciones | (debajo) | auto |

→ **Solo el chart-wrap tiene altura fija (velasH); el resto son `auto`** y hoy scrollean dentro de `contentRef` (`overflowY:auto`). El diseño intencionado (V9.577+): el chart llena el viewport y equity/mensuales/historial quedan bajo el pliegue. Un flex-column con el chart a `flex:1` haría que el chart **cediera** espacio a esos hermanos altos → chart pequeño (regresión tipo reparto). En **risk**, en cambio, NO hay equity/mensuales debajo del chart dentro de contentRef (el panel de métricas va ENCIMA, `:6718`), así que ahí `flex:1` sí funciona (y es lo que ya se usa).

Cita: `pages/index.js:7124/7288/7429/7480/7517/6718`.

---

## 3. Viabilidad de `height:calc(100vh − X)` en contentRef

- **X = 56px** (altura del `.header`, `styles/globals.css:27`; ya se usa `calc(100vh - 56px)` en overlays `:6615/:6678`). Encima de `contentRef` dentro del viewport solo está el header (56); `.main`/`.content` son flex sin chrome propio. Así que `contentRef` acotado = `calc(100vh − 56px)`.
- **Elementos de altura variable que romperían un X fijo:**
  - **El panel de métricas de RISK (`:6718`)**: en modo risk va DENTRO de contentRef, ENCIMA del chart-wrap, con altura propia (~fija por filas, pero **presente solo en risk**). Un `calc(100vh−56)` para el CHART no vale igual en watchlist (chart pega al top de contentRef) que en risk (chart debajo del panel). → X del CHART difiere por modo; el de `contentRef` (56) no.
  - **El bloque métricas grid (`:7431`)** solo aparece en `metricsLayout==='grid'` y va ENTRE chart y equity (no encima del chart) → no afecta a la altura del chart, solo empuja lo de abajo (que scrollea).
  - La barra de símbolo/estrategia, si existe, está en el sidebar/header, no dentro de contentRef por encima del chart en watchlist (el chart-wrap es prácticamente el primer hijo en flujo, `:6718` devuelve null en watchlist).
- Conclusión: **`contentRef` sí admite `calc(100vh − 56px)` fijo** (robusto, como el Dashboard). La variabilidad (panel risk) afecta a la altura del CHART dentro, no a la de contentRef; se resuelve por rama (watchlist vs risk), que ya están separadas.

Cita: `styles/globals.css:27`; `pages/index.js:6615/6678/6718/7431`.

---

## 4. Impacto en otras vistas (usos de contentRef)

- **`ref={contentRef}` aparece UNA sola vez: `:6712`** (bloque single-asset, `sidePanel!=='multi'&&!=='tradelog'`). Otros usos de la variable: `navigateToTrade` (`~:4335`, `scrollTop=0`) y los dos `useEffect` de velasH/scroll (`:1219`, `:1239`). No hay más elementos con ese ref.
- **Dashboard** usa `#tlDashOuter` (`:9472`) + bloque `calc(100vh - 88px)` (`:9511`) — **no** `contentRef`.
- **Multibacktest** usa su propia columna/`.mc-scroll` (bloque `:7659` en adelante) — **no** `contentRef`.
- **Tradelog** (dashboard/ops) — contenedores propios, no `contentRef`.
- Por tanto **fijar la altura de `contentRef` afecta EXCLUSIVAMENTE a individual/watchlist, risk y bareChart** (los tres modos single-asset que comparten ese elemento, con estilos por rama en `:6712`). Risk y bare YA asumen `contentRef` acotado (`overflow:hidden, height:100%`); watchlist asume que **scrollea** (`overflowY:auto`) para poner equity/mensuales/historial bajo el pliegue.

Cita: `pages/index.js:6712/4335/1219/1239/9472/9511/7659`.

---

## 5. Recomendación

**El `flex:1` directo del chart-wrap dentro de `contentRef` NO es viable en watchlist** (competiría con equity/mensuales/historial → chart encogido = regresión de reparto). La opción robusta y CSS-pura, sin `velasH` JS y sin tocar otras vistas:

- **(A) Recomendada — acotar `contentRef` y usar altura CSS para el chart, por rama (contentRef es exclusivo, seguro):**
  1. Dar a `contentRef` (rama watchlist, `:6712`) una **altura fija explícita**: `height:'calc(100vh - 56px)'` (+ mantener `overflowY:'auto'`). Esto lo convierte en un scroller fiablemente acotado (deja de depender de la cadena `%` frágil que cuelga de `.app` min-height) → elimina de raíz el bucle de realimentación de V9.592 y el acoplamiento a scroll de V9.590.
  2. Chart-wrap (rama no-bare, `:7124`): en vez de `height:velasH`, usar **`height:'100%'`** (100% de la altura visible de `contentRef`). Como el chart-wrap es el primer hijo en flujo en watchlist, `height:100%` = viewport visible → llena la pantalla; equity/mensuales/historial fluyen DEBAJO y quedan en el scroll de `contentRef`. Sin JS, sin posiciones, inmune al scroll.
  3. **Risk/bare: no cambiar** — ya usan `contentRef` flex-column acotado (`overflow:hidden, height:100%`) y el chart-wrap `flex:1` (bare) / dentro del flex; ahí el `flex:1` sí es correcto porque no hay hermanos altos debajo del chart.
  4. Eliminar el `useEffect` de `velasH` (`:1219-1232`) y el estado `velasH` una vez el chart-wrap use `height:'100%'`. (El `useEffect scrollTop=0`, `:1239`, puede quedarse; inocuo.)
  - Riesgo: bajo y **contenido** — `contentRef` es exclusivo de single-asset; Dashboard/multi intactos. El único cuidado: verificar que en watchlist no haya ningún elemento en flujo ENCIMA del chart-wrap dentro de `contentRef` (hoy no lo hay: `:6718` es null en watchlist). Si en el futuro se añade uno, habría que envolver solo el chart en un sub-contenedor `flex:1`.

- **(B) Alternativa más conservadora — nuevo wrapper solo para el chart:** si se prefiere no tocar los estilos de `contentRef`, envolver ÚNICAMENTE el chart-wrap en un nuevo `<div style={{height:'calc(100vh - Ymodo)'}}>` dentro de `contentRef`, dejando `contentRef` como está. Y-por-modo (watchlist ≈ 56; risk ≈ 56 + alto panel). Más aislado pero introduce el problema de "Y variable en risk"; menos limpio que (A), que aprovecha que risk ya tiene su propio path.

**Recomendación: (A)** — `contentRef` watchlist a `height:calc(100vh - 56px)` + chart-wrap a `height:100%`, eliminando `velasH`. Es CSS-puro, robusto (sin `%` frágil, sin scroll, sin bucle), y seguro porque `contentRef` no lo comparten Dashboard ni multi. Requiere una verificación visual de que equity/mensuales/historial siguen accesibles por scroll debajo del chart.

Cita: `pages/index.js:6712` (contentRef watchlist), `:7124` (chart-wrap), `:1219-1232` (velasH a eliminar), `:6718` (nada encima del chart en watchlist); `styles/globals.css:27` (X=56).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | contentRef NO tiene altura fija en watchlist (`{flex:1, overflowY:auto}`), depende de cadena `%`/flex frágil desde `.app` min-height. Dashboard sí usa fija (`calc(100vh-88px)`) | `index.js:6712/9511`; `globals.css:25/35/61` |
| 2 | Hermanos del chart en contentRef: chart-wrap(velasH) + equity + mensuales + barras + historial (auto), que scrollean debajo. `flex:1` en el chart los haría competir → chart encogido | `index.js:7124/7429/7480/7517` |
| 3 | `calc(100vh-56)` viable para contentRef (X=header 56). El panel risk (`:6718`) varía la altura del CHART, no de contentRef; se resuelve por rama | `globals.css:27`; `index.js:6718/6615` |
| 4 | contentRef es EXCLUSIVO de single-asset (ref solo en `:6712`); Dashboard (`#tlDashOuter`) y multi usan otros contenedores → fijar su altura no afecta a esas vistas | `index.js:6712/9472/7659` |
| 5 | Fix (A): contentRef watchlist → `height:calc(100vh-56px)`; chart-wrap → `height:100%` (llena viewport, resto scrollea debajo); risk/bare sin cambios; eliminar velasH JS. CSS-puro, seguro, sin `%` frágil | `index.js:6712/7124/1219-1232` |
