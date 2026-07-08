# Auditoría read-only URGENTE — Regresión crítica tras fix velasH V9.592 (bde0557)

Fecha: 2026-07-08 · Alcance: `pages/index.js`, `styles/globals.css`. Solo lectura. **Regresión activa en producción.**

Síntoma: V9.592 (medir `velasH` contra `contentRef` en vez del viewport) EMPEORÓ el bug. Antes fallaba solo con acciones de abajo (tras scroll); ahora falla con CUALQUIERA, incluida la primera (AUGO): el chart-wrap casi no muestra velas (marcadores sueltos) y el eje de precios sale absurdamente comprimido → `velasH` desproporcionadamente **grande**.

**Conclusión rápida:** la fórmula nueva (`pages/index.js:1229-1230`) es
`velasH = contentRef.clientHeight − (chartWrapTop − contentRefTop) − 8`.
El problema: **`chart-wrap` (cuya altura ES `velasH`) es DESCENDIENTE de `contentRef`**. Si `contentRef` no está acotado a un alto fijo (su `clientHeight` crece con el contenido), entonces `clientHeight` **incluye la propia altura del chart-wrap** → se crea un **bucle de realimentación positiva**: velasH grande → contentRef más alto → clientHeight mayor → velasH aún mayor. La fórmula vieja usaba `window.innerHeight` (una constante externa a `contentRef`, sin realimentación), por eso funcionaba al menos sin scroll. Que la nueva falle **incluso sin scroll** (primera acción) demuestra que `contentRef.clientHeight ≠ (innerHeight − contentRefTop)` — es decir, `contentRef` NO es la referencia de "viewport acotado" que asumió el fix. **Recomendación: revertir bde0557 ya.**

---

## 1. Valor real de `cont.clientHeight` al medir

- Cálculo: `pages/index.js:1230` → `Math.round(cont.clientHeight - offsetDentro - MARGEN)`, con `cont=contentRef.current` (`:1223`).
- `contentRef` en modo watchlist es `{flex:1, overflowY:'auto'}` (`:6716`), hijo de `:6714` `{display:flex, flex:1, minHeight:0, overflow:hidden, height:'100%'}`, dentro de `.content` (globals.css:61 `flex:1; overflow-y:auto; display:flex; flex-direction:column`), dentro de `.main` (globals.css:35 `flex:1; overflow:hidden`), dentro de `.app` (globals.css:25 `min-height:100vh` — **min-height, no height**).
- La cadena de `height:100%`/flex cuelga de `.app` que solo tiene `min-height:100vh`. Como ya se documentó (AUDIT_RISK_CHART2), esa resolución de porcentaje es **frágil**: si `:6714 height:100%` no resuelve a un alto definido, `contentRef` queda **dimensionado por su contenido** (no acotado). En ese caso `clientHeight` **NO** es el alto visible (~innerHeight−56) sino algo mayor, influido por el contenido — que incluye el propio chart-wrap. Timing: aunque se mide en doble rAF (tras layout), el valor es "malo" no por ser prematuro sino por ser **el alto equivocado** (content-driven, con realimentación).

Cita: `pages/index.js:1223/1230/6714/6716`; `styles/globals.css:25/35/61`.

---

## 2. `offsetDentro` (chartWrapTop − contentRefTop)

- `pages/index.js:1229`: `el.getBoundingClientRect().top - cont.getBoundingClientRect().top`.
- En la PRIMERA acción (sin scroll), el chart-wrap está cerca del top de `contentRef`, así que `offsetDentro` es **pequeño y positivo** (lo que haya encima del chart dentro de `contentRef`: barra de símbolo/estrategia si existe). **No es negativo aquí** y **no es el culpable principal** — con AUGO sería del orden de decenas de px, no cientos.
- Por tanto la inflación de `velasH` no viene de `offsetDentro` sino del primer término (`clientHeight`, punto 1). `offsetDentro` sí sería problemático (negativo) si hubiera scroll que subiera el chart por encima del top de `contentRef`, pero eso es el bug secundario, no el de la primera acción.

Cita: `pages/index.js:1229`.

---

## 3. Resultado de `h`

- `h = Math.max(240, Math.round(cont.clientHeight − offsetDentro − 8))` (`:1230`).
- Con `clientHeight` inflado (content-driven, incluye chart-wrap) y `offsetDentro` pequeño → `h` sale **mucho mayor** que el viewport (p.ej. si el contenido total es ~1500-2000px, `h ≈ 1500-2000`), en lugar de los ~700-800 px esperados. Chart-wrap de ~1800px dentro de un área visible de ~800px → lightweight-charts reparte el rango de precios en un canvas altísimo → en la porción visible se ven **pocas velas** y el **eje comprimido**. Coincide con la captura.
- Peor aún, por la realimentación (punto 1) el valor puede crecer en renders sucesivos hasta estabilizarse en un número desproporcionado. NO es el caso "negativo → 240"; es "demasiado grande".

Cita: `pages/index.js:1230`.

---

## 4. Por qué la nueva falla SIN scroll y la vieja no

- **Vieja** (`innerHeight − chartWrapTop − 8`): `window.innerHeight` es una **constante externa** a `contentRef`. No hay realimentación (la altura del chart-wrap no afecta a `innerHeight`) y no depende de que la cadena de `%`-height resuelva. Al scroll 0, `chartWrapTop` está en su posición fija → daba el valor correcto (~750px). Solo fallaba si había scroll (top viewport desplazado).
- **Nueva** (`contentRef.clientHeight − offset`): depende de `contentRef.clientHeight`, que (a) NO es fiable como "alto de viewport acotado" por la fragilidad `%`/`min-height` de la cadena (`.app` min-height:100vh), y (b) es **auto-referencial**: `contentRef` CONTIENE el chart-wrap, así que su `clientHeight` depende de `velasH`. Ese acoplamiento circular no existía con `innerHeight`. Por eso rompe **incluso sin scroll**: no es un problema de posición sino de que la referencia elegida (`contentRef`) es la caja equivocada (contenedora del propio elemento medido) y no está garantizada como acotada.

Cita: `pages/index.js:1226 (vieja, en comentario)`, `:1230 (nueva)`, `:6716`; `styles/globals.css:25`.

---

## 5. Recomendación (regresión activa → menor riesgo)

**REVERTIR bde0557 YA.** Es una regresión activa en producción y el commit tocó **solo** la fórmula de `velasH`; revertirlo restaura `velasH = window.innerHeight − chartWrapTop − 8`, que al menos funciona para las acciones de arriba (el caso común) y degrada el problema al bug menor previo (solo falla con scroll de la lista). Riesgo mínimo, efecto inmediato.

- Revert limpio: `git revert bde0557` (o reponer la fórmula vieja en `:1222-1231`). El `useEffect scrollTop=0` de V9.590 (commit 49c9148) es independiente y se mantiene.
- **NO** intentar un ajuste "de una línea" en caliente (p.ej. `getBoundingClientRect().height` en vez de `clientHeight`): NO resuelve la realimentación ni la caja equivocada, y arriesga otra iteración rota en producción. `getBoundingClientRect().height` de `contentRef` daría el mismo problema (sigue conteniendo al chart-wrap).
- **Fix correcto POSTERIOR (fuera de este hotfix), a diseñar con calma:** anclar a algo que NO contenga al chart-wrap ni dependa de `%` frágil. Opciones: (i) volver a `innerHeight − chartWrapTop` PERO garantizando `scrollTop=0` (y `window.scrollTo(0,0)`) ANTES de medir, unificando reset+medición en un solo effect con el orden correcto; o (ii) medir contra un ancestro ACOTADO y hermano-arriba del chart (no contenedor de él), o usar `contentRef.getBoundingClientRect().top` (posición fija del top del contenido, estable a scroll 0) como ancla: `velasH = innerHeight − contentRefTop − offsetDentro − MARGEN` (contentRefTop es estable si el contenido no scrollea por encima; hay que validar). Ninguna de estas debe entrar como hotfix sin verificación.

**Acción inmediata: revert de bde0557.**

Cita: `pages/index.js:1222-1231` (bloque a revertir), `:1239-1241` (scrollTop V9.590, se mantiene).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | `velasH` usa `contentRef.clientHeight`, pero la cadena de altura cuelga de `.app` (min-height:100vh, no height) → `contentRef` puede no estar acotado y su `clientHeight` ser content-driven (grande) | `index.js:1230/6714/6716`; `globals.css:25/35/61` |
| 2 | `offsetDentro` pequeño+positivo en la 1ª acción (sin scroll) → no es el culpable principal | `index.js:1229` |
| 3 | `h` sale desproporcionadamente grande (chart altísimo → eje comprimido, pocas velas). Coincide con la captura | `index.js:1230` |
| 4 | **Realimentación**: chart-wrap (height:velasH) es DESCENDIENTE de contentRef → clientHeight depende de velasH → bucle. La vieja fórmula (innerHeight, constante externa) no lo tenía → por eso la nueva falla incluso sin scroll | `index.js:1226/1230/6716` |
| 5 | **REVERTIR bde0557 ya** (hotfix mínimo, restaura el comportamiento previo). Diseñar el fix correcto después, sin ajustes en caliente | `index.js:1222-1231/1239-1241` |
