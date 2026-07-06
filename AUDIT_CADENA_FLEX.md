# Auditoría read-only — Cadena flex `chart-wrap` → `containerRef` de CandleChart (la altura no propaga)

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `components/CandleChart.js`. Solo lectura.

Síntoma (confirmado por logs V9.578): el `chart-wrap` de velas crece a **878px**, pero el `containerRef` interno que mide CandleChart se queda en **clientHeight=480** (su default). La altura no viaja del div exterior (878) al contenedor del chart (480) → hueco negro debajo de las velas.

**Conclusión rápida:** la cadena flex se **rompe en `pages/index.js:7123`**. Ese div tiene `flex:1; height:100%` pero **NO es un contenedor flex** (`display` sin definir = `block`). El hijo (la raíz de CandleChart, `:1607`) usa `flex:1` para llenar el alto, pero `flex:1` **solo funciona si el padre es `display:flex`**. Como `:7123` es `block`, el `flex:1` de CandleChart se ignora y su árbol interno colapsa a la altura por defecto (480). Es exactamente lo que distingue el modo embebido (roto) del fullscreen (funciona): en fullscreen el padre SÍ es `display:flex`.

---

## 1. Jerarquía de divs (chart-wrap → containerRef) con sus estilos

Modo individual normal (no risk / no bare):

```
pages/index.js
:7122  chart-wrap        {height:velasH, minHeight:0, display:flex, flexDirection:column, overflow:hidden}   → REAL 878 ✔ (crece)
  :7123  wrapper         {position:relative, flex:1, minHeight:0, height:100%}   ← ★ display:block (SIN display:flex) ★
    :7235  <CandleChart fillHeight={!isBareChart}>
           └─ raíz del componente:
components/CandleChart.js
    :1607  outer         {display:flex, flexDirection:column, ...(fillHeight ? {flex:1, minHeight:0} : {})}   ← flex:1 INÚTIL (padre :7123 es block)
      :1608  pane wrap    {position:relative, ...(fillHeight ? {flex:1, minHeight:0} : {})}
        :1610  containerRef {minHeight:0, ...(fillHeight ? {height:100%} : {})}   ← mide clientHeight = 480 (no crece)
      :1622/:1626/:1631  subpaneles MACD/RSI/VOL (height fija 120/100/80)
```

**El eslabón que corta la propagación es `:7123`**: es `flex:1` + `height:100%` (por tanto mide 878, hereda bien del chart-wrap), pero al no ser `display:flex` **no puede repartir ese alto a su hijo vía flex**. Todos los descendientes de CandleChart en modo `fillHeight` dependen de `flex:1` (`:1607`, `:1608`) o de `height:100%` encadenado (`:1610`); la primera `flex:1` (en `:1607`) queda muerta porque su contenedor (`:7123`) es block.

Cita: `pages/index.js:7122`, `:7123`, `:7235`; `CandleChart.js:1607`, `:1608`, `:1610`.

---

## 2. chart-wrap (878) → hijo directo → containerRef: ¿quién llena a quién?

- `:7122` chart-wrap = `display:flex column`, alto 878. ✔ Es contenedor flex correcto.
- `:7123` (hijo directo) = `flex:1` → **sí** llena los 878 del chart-wrap (flex hijo de un flex column). Su `height:100%` refuerza lo mismo. Mide ≈878. ✔ **Hasta aquí la altura llega bien.**
- **Pero `:7123` es `display:block`.** Su hijo (`CandleChart :1607`) tiene `flex:1, minHeight:0`. En un padre `block`, `flex:1` no aplica → `:1607` toma **altura por contenido** (auto), no 878.
- `:1610` containerRef tiene `height:100%`, pero “100% de un padre de altura auto/colapsada” no da 878; lightweight-charts creó el `<div>` con `height:chartHeight` inicial (480) y nada lo fuerza a crecer → **clientHeight se queda en 480**.

Resultado: el hijo directo del chart-wrap (`:7123`) **sí** está configurado para llenar (flex:1 + height:100%), pero **no propaga hacia dentro** porque le falta `display:flex` para que su propio hijo consuma el alto.

Cita: `pages/index.js:7122-7123`, `CandleChart.js:1607`, `:1610`.

---

## 3. ¿Por qué `containerClientHeight` se queda en 480 (el default)?

- 480 es el valor con el que se crea el chart: `createChart(containerRef.current,{ ..., height:chartHeight })` con `chartHeight` por defecto **480** (`CandleChart.js:310`, y la prop `chartHeight=480` en la firma `:246`). En el individual se pasa `chartHeight={result.isBareChart?bareChartHeight:candleH}` con `candleH` fijo=480 (`pages/index.js:7242`).
- En modo `fillHeight`, ese 480 debería ser sobrescrito por `resize/applyOptions(clientHeight)`. Pero `clientHeight` del `containerRef` **es 480** porque el div nunca crece (punto 2): mide un `<div>` (`:1610`) cuyo `height:100%` cuelga de un ancestro (`:1607`) de altura colapsada. Es decir, no es que tenga un `min-height:480` explícito — es que **está fuera de una cadena flex efectiva**, así que su `height:100%` no resuelve a 878 y retiene el tamaño inicial del canvas (480).
- El RO (`:1355`) hace `opts.height=clientHeight` solo si `clientHeight>0`; como clientHeight=480 (constante), aplica 480 una y otra vez → el chart nunca pasa de 480.

Cita: `CandleChart.js:246`, `:303`, `:1355`, `:1610`.

---

## 4. `velasH_state_actual=500` vs chart-wrap real=878: ¿dos fuentes de altura?

**No hay dos fuentes; es un artefacto de closure obsoleto en el log.** El `chart-wrap` tiene UNA sola regla de altura: `height:velasH` (`:7122`). El valor real 878 = `velasH` verdadero tras el recálculo (`innerHeight − topVelas − 8`). El `velasH_state_actual:500` que imprime `[VELAS]` es el **valor capturado al crear el effect** (deps `[sidePanel,result]`): dentro del closure, `velasH` quedó fijado al inicial `useState(500)` y **no se actualiza** aunque el estado real ya sea 878. Por eso el log muestra 500 mientras el div mide 878.

Conclusión: `velasH` (estado) y la altura real del div **coinciden** (ambos 878); el `500` es solo la variable stale del log, no una segunda regla de altura ni un conflicto flex/height. El chart-wrap NO tiene a la vez `height:velasH` y un `flex` que lo lleve a otro valor: en el ramal normal es solo `{height:velasH, display:flex column, ...}` sin `flex:1` (`:7122`). No hay pisado de alturas en el exterior — el problema está **dentro** (punto 1-3).

Cita: `pages/index.js:7122`, `:1224-1232` (effect con deps `[sidePanel,result]` que captura `velasH`).

---

## 5. Fix probable (mínimo, sin implementar)

El corte está en `pages/index.js:7123`, que no es contenedor flex. Dos opciones:

- **(A) Recomendada — 1 línea, réplica exacta del fullscreen:** añadir `display:'flex', flexDirection:'column'` al div `:7123` (al menos en el ramal `fillHeight`/normal). Así `:7123` (878) reparte su alto a `CandleChart :1607` vía `flex:1`, y la cadena `:1607 (flex:1 → 878) → :1608 (flex:1) → :1610 (height:100%)` se completa → `containerRef.clientHeight ≈ 878 − subpaneles`. Es exactamente cómo funciona el fullscreen, donde el padre de CandleChart (`:7290`, contenedor fixed) **ya es** `display:flex, flexDirection:column` (`pages/index.js:7288-7289`). Por eso allí sí llena y aquí no.

- **(B) Alternativa dentro de CandleChart — más autónoma:** dar al div raíz `:1607` `height:'100%'` en el ramal `fillHeight` (además de/ en vez de `flex:1`). Con `:7123` teniendo `height:100%`(=878) definido, un `height:100%` en `:1607` resolvería a 878 sin depender de que el padre sea flex. Ventaja: CandleChart deja de exigir que su contenedor sea flex. Riesgo: toca el componente compartido (fullscreen, risk); habría que confirmar que `height:100%` no descuadra el fullscreen (donde igualmente el padre da altura definida, así que debería ser seguro).

**Recomendación: (A)** — cambio de menor superficie y menor riesgo, y hace que el embebido se comporte idénticamente al fullscreen (que ya funciona). Un solo `display:'flex', flexDirection:'column'` en `pages/index.js:7123`. No hace falta tocar CandleChart.js ni el auto-scale ni el reparto de subpaneles.

Cita del cambio: `pages/index.js:7123` (opción A) · `CandleChart.js:1607` (opción B) · referencia fullscreen que ya funciona: `pages/index.js:7288-7289`.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Cadena: chart-wrap(878, flex col) → `:7123` (flex:1, height:100%, **display:block**) → CandleChart `:1607` (flex:1) → `:1610` containerRef. El corte está en `:7123` (no es flex) | `index.js:7122-7123`, `CandleChart.js:1607/1610` |
| 2 | `:7123` llena bien los 878 del chart-wrap, pero al ser block no los reparte: el `flex:1` de `:1607` queda muerto → interior colapsa | `index.js:7123`, `CandleChart.js:1607` |
| 3 | clientHeight=480 = altura inicial del `createChart` (`chartHeight` default 480); el div nunca crece porque su `height:100%` cuelga de un ancestro de altura auto → RO reaplica 480 | `CandleChart.js:246/310/1355/1610` |
| 4 | `velasH_state_actual=500` es un **closure stale** del log (deps `[sidePanel,result]`); la altura real y el estado coinciden en 878. No hay doble fuente de altura | `index.js:7122`, `:1224-1232` |
| 5 | Fix (A): añadir `display:flex, flexDirection:column` a `:7123` (igual que el padre fullscreen `:7290`). (B) alt: `height:100%` a `CandleChart :1607` | `index.js:7123`, `:7290-7291`, `CandleChart.js:1607` |
