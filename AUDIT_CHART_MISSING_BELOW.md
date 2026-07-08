# Auditoría read-only — Contenido bajo el gráfico desaparecido tras fix V9.596

Fecha: 2026-07-08 · Alcance: `pages/index.js`, `styles/globals.css`. Solo lectura.

Síntoma: V9.596 (contentRef watchlist `height:calc(100vh-56px)+overflowY:auto`; chart-wrap `height:100%`) arregló la deformación del gráfico (bien arriba y abajo de la lista), PERO equity/mensuales/historial —que iban debajo del gráfico— ya no se ven ni con scroll.

**Conclusión rápida:** `chart-wrap` con `height:100%` (`pages/index.js:7121`) se resuelve al **100% de la altura de `contentRef`** (`calc(100vh−56px)`), es decir consume **exactamente todo el scrollport visible**. Antes, con `velasH` en px, el chart medía `innerHeight − top − 8` (≈ `100vh − 64px`), ~8px MENOS que el alto de contentRef, dejando que equity/mensuales/historial fluyeran justo debajo y el scroll los alcanzara. Ahora, al ocupar el 100% exacto (o algo más, por `borderBottom` + box-sizing), el contenido siguiente queda íntegramente bajo el pliegue y el scroll de `contentRef` **no lo revela de forma fiable** (el `height:100%` porcentual dentro de un scroll-container no garantiza que el `scrollHeight` supere al `clientHeight` de forma útil, y el borde inferior del chart empuja el resto fuera del área clipada). El fix de menor riesgo: dar al chart-wrap una **altura fija en unidades de viewport** (`calc(100vh − 64px)`) en vez de `100%`, o convertir `contentRef` en flex-column con el chart como `flex:0 0 <alto fijo>` y el resto fluyendo detrás.

---

## 1. Estructura DOM actual dentro de contentRef (rama watchlist)

`contentRef` (`pages/index.js:6709`, watchlist) = `{flex:1, height:'calc(100vh - 56px)', overflowY:'auto'}` — **block** (sin `display:flex`), scroll vertical. Hijos en orden:

| Orden | Elemento | Cita | Altura |
|---|---|---|---|
| 1 | `chart-wrap` (velas) | `:7121` | **`height:'100%'`** (+`overflow:hidden`, `borderBottom:1px`) |
| — | overlay fullscreen (condicional) | `:7286` | `position:fixed` (fuera de flujo) |
| 2 | métricas grid (condicional `metricsLayout==='grid'`) | `:7410-7422` | `auto` (+`margin:8px 0`) |
| 3 | fragmento equity+barras+historial (`:7425` `<>`) | `:7425` | — |
| 3a | `equity-section` (equity chart + botones) | `:7426` | `auto` (EquityChart `chartHeight=EQUITY_CHART_H=190`) |
| 3b | Ganancias mensuales | `:7477` | `auto` |
| 3c | `equity-section` (capital invertido/barras) | `:7514` | `auto` |
| 3d | historial de operaciones | (debajo) | `auto` |

→ chart-wrap y los bloques de abajo son **hermanos directos** de `contentRef`. Solo el chart-wrap tiene altura no-auto (100%); el resto es `auto`.

Cita: `pages/index.js:6709/7121/7286/7410/7425/7426/7477/7514`.

---

## 2. ¿A qué resuelve `height:100%` del chart-wrap?

- `contentRef` tiene `height:'calc(100vh - 56px)'` **definido** (`:6709`), así que el `height:100%` del chart-wrap (`:7121`) **sí resuelve**, a `calc(100vh − 56px)` — el **alto completo del scrollport**. `contentRef` es block (no flex), así que no hay reparto flex: el chart-wrap toma literalmente esa altura.
- Efecto: el chart-wrap **consume el 100% del área visible** de `contentRef`. Los hermanos siguientes (equity, etc.) empiezan EXACTAMENTE en el borde inferior del scrollport → 100% bajo el pliegue. Además el chart-wrap añade `borderBottom:1px` y (según box-sizing) puede sumar 1px, dejando el arranque del equity 1px por debajo del borde.
- En teoría el bloque siguiente debería quedar "más abajo" y alcanzable con scroll (el `scrollHeight` de contentRef = 100% + equity + … > clientHeight). En la práctica, un hijo con `height:100%` en un contenedor `overflow:auto` es un patrón frágil: el porcentaje se ancla al `clientHeight`, y el layout resultante deja el resto en una zona que, combinada con el `overflow:hidden` del propio chart-wrap y el clip del contenedor, **no siempre produce un scroll útil** (es el motivo por el que el diseño previo usaba una altura MENOR que el contenedor, no igual).

Cita: `pages/index.js:6709/7121`.

---

## 3. overflowY:auto: ¿debería aparecer debajo con scroll?

- `contentRef` es `overflowY:auto` (`:6709`), block. Con chart-wrap a `height:100%` = `clientHeight`, y equity/mensuales/historial `auto` a continuación, el `scrollHeight` = `clientHeight` + (equity+mensuales+historial) → **debería** haber scroll y el contenido debería verse al bajar.
- Que NO se vea ni con scroll apunta a uno de estos factores:
  1. El chart-wrap `height:100%` (== clientHeight) + su `borderBottom`/box-sizing hace que el primer píxel del equity caiga justo en/tras el borde clipado; si el `scrollHeight` extra es exactamente el del contenido pero el contenedor no expone barra (p.ej. por el `overflow:hidden` del PADRE `:6707` que recorta el scrollbar), el usuario no percibe scroll.
  2. El `height:100%` del chart-wrap NO deja "holgura" (a diferencia de velasH que dejaba ~8px), así que el arranque del equity está en el límite exacto; cualquier desalineación (top de contentRef ≠ 56 real, o el header sticky) hace que el resto quede fuera del área efectivamente visible/scrollable.
  3. No hay `position:absolute/fixed` en el chart-wrap ni en el equity que los saque de flujo (el fullscreen sí es fixed, `:7286`, pero es condicional y no aplica aquí), así que no es ocultamiento por posicionamiento — es un problema de **espacio consumido al 100% sin holgura + clip**.

Cita: `pages/index.js:6709/7121/7286`; padre clip `:6707` (`.content`/wrapper).

---

## 4. Comparación con pre-V9.596

- **Antes (velasH px):** chart-wrap `height:velasH`, con `velasH = innerHeight − topVelas − 8` (≈ `100vh − 64px`). El chart medía **~8px MENOS** que el alto de `contentRef`, así que el equity arrancaba dentro del flujo, ligeramente visible/alcanzable, y el `contentRef` (no acotado explícitamente entonces) crecía con el contenido y el scroll funcionaba de forma natural. El "resto" era claramente alcanzable.
- **Ahora (height:100%):** chart-wrap == alto EXACTO de `contentRef`. Sin holgura → el resto queda pegado al borde inferior, bajo el pliegue, y el scroll no lo expone con claridad. La regresión = pasar de "chart un poco más corto que el contenedor, resto en flujo visible/scrolleable" a "chart llena el contenedor al 100%, resto empujado al límite exacto".

Cita: `pages/index.js:7121` (100% ahora), historial velasH (fórmula previa, revertida).

---

## 5. Fix probable (menor riesgo)

Mantener el gráfico con altura fija/estable (sin deformación, sin JS de posición) Y dejar visible/scrolleable el contenido de debajo:

- **(A) Recomendada — altura de viewport fija en el chart-wrap, en vez de `100%`:** cambiar `:7121` (rama watchlist) de `height:'100%'` a **`height:'calc(100vh - 64px)'`** (los 56px del header + ~8px de margen, replicando el valor que daba velasH). Es una **longitud de viewport definida** (no un `%` del scroll-container), así que: (i) no depende de la resolución `%` del padre; (ii) deja al `contentRef` (que sigue `overflowY:auto`) con el chart como bloque de alto fijo y equity/mensuales/historial fluyendo detrás → `scrollHeight > clientHeight` de forma inequívoca → scroll fiable. El gráfico mantiene altura estable e independiente del scroll (no reintroduce la deformación). Cambio de UNA propiedad.
  - (Opcional: se podría incluso quitar el `height:'calc(100vh-56px)'` de `contentRef` y dejarlo `{flex:1, overflowY:auto}`, dejando que el chart-wrap fijo en vh mande; pero mantener ambos no molesta.)

- **(B) Alternativa robusta — contentRef flex-column + chart con basis fijo:** `contentRef` (watchlist) → `{..., display:'flex', flexDirection:'column', overflowY:'auto'}` y chart-wrap → `flex:'0 0 calc(100vh - 64px)'` (fijo, sin grow ni shrink) + `minHeight:0`. El resto de bloques fluyen como items de la columna detrás del chart y el `overflowY:auto` scrollea. Explícito y sin ambigüedad de `%`, pero toca 2 propiedades y cambia el modelo a flex.

- **Descartado:** dejar `height:100%` (consume todo el scrollport sin holgura → el bug). Y `60vh` u otros valores arbitrarios: romperían la sensación de "gráfico llena la pantalla" que se buscaba.

**Recomendación: (A)** — chart-wrap `height:'calc(100vh - 64px)'` (viewport fijo) en la rama watchlist, manteniendo `contentRef` como scroll-container. Restaura el comportamiento previo (chart casi llena la pantalla, resto scrolleable debajo) pero con CSS estático scroll-independiente, sin `velasH` JS y sin la fragilidad del `100%`.

Cita: `pages/index.js:7121` (propiedad a cambiar), `:6709` (contentRef scroll-container, se mantiene).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | En contentRef (watchlist, block+overflowY:auto): chart-wrap `height:100%` + equity/mensuales/historial `auto` como hermanos directos | `index.js:6709/7121/7426/7477/7514` |
| 2 | `height:100%` resuelve a `calc(100vh-56px)` = 100% del scrollport → el chart consume TODO el área visible, sin holgura | `index.js:6709/7121` |
| 3 | El resto queda pegado al borde inferior bajo el pliegue; el patrón `height:100%` en scroll-container + borderBottom/clip no expone scroll útil. No es posicionamiento absoluto | `index.js:7121/7286/6707` |
| 4 | Antes velasH daba ~`100vh-64px` (8px menos que el contenedor) → equity en flujo visible/scrolleable; ahora 100% exacto lo empuja al límite | `index.js:7121` |
| 5 | Fix (A): chart-wrap `height:'calc(100vh - 64px)'` (viewport fijo) en vez de `100%`; contentRef sigue como scroll. (B) flex-column + `flex:0 0 …`. Menor riesgo: (A) | `index.js:7121/6709` |
