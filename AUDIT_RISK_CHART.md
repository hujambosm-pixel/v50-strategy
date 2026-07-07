# Auditoría read-only — Gráfico de velas cortado en Risk MGMT (cadena flex)

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `components/CandleChart.js`. Solo lectura.

Síntoma: en la sección Risk MGMT (`sidePanel==='risk'`) el gráfico de velas se sale del área / queda cortado (parte fuera de vista). Apareció tras el fix V9.580 (`display:flex` en el div intermedio `:7116`), que ahora hace que el CandleChart SÍ llene su contenedor también en risk.

**Conclusión rápida:** Risk usa **el mismo** `chart-wrap` (`:7115`) y **el mismo** CandleChart (`:7228`) que el individual, y tras V9.580 comparte también el div intermedio arreglado (`:7116`, ahora `display:flex`). La cadena flex, por tanto, ya está bien. El **delta que queda** frente al individual es que la rama **risk/bare** del `chart-wrap` **NO lleva `overflow:hidden`** (la rama normal sí). Cuando el CandleChart en `fillHeight` se sobredimensiona momentáneamente —fallback `innerHeight−30` mientras `clientHeight` aún es 0, o el hueco flex se queda a 0 porque el panel de métricas de risk (que es `flexShrink:0`) ocupa casi todo—, en el individual eso se **recorta** (overflow:hidden) y en risk **se desborda a la vista**. Fix mínimo: añadir `overflow:'hidden'` a la rama risk/bare del `chart-wrap`.

---

## 1. Dónde se renderiza el CandleChart en Risk MGMT

**Es el MISMO CandleChart del individual**, no uno aparte. El bloque single-asset renderiza un único `chart-wrap` + `CandleChart` que sirve para normal y para risk según `sidePanel`:

- `chart-wrap`: `pages/index.js:7115`.
- `<CandleChart …>`: `pages/index.js:7228`, con props de risk condicionadas: `riskMode` (`:7247`), `onRiskPrice` (`:7248`), `onRiskLevelChange` (`:7249`), `riskLineActive` (`:7250`).
- **`fillHeight`**: sí — `fillHeight={!result.isBareChart}` (visto en la firma del componente `:7228`+), que en risk (no bare) es `true`. (El otro CandleChart, `:7380`, es el overlay de pantalla completa, no risk.)

Cita: `pages/index.js:7115`, `:7228`, `:7247-7250`, `:7380`.

---

## 2. Jerarquía de divs en risk (contenedor acotado → containerRef)

```
:6641  panel raíz            {height:calc(100vh-56px), overflow:hidden}                    (bounded ✔)
  :6701  fila                {display:flex, flex:1, minHeight:0, overflow:hidden, height:100%}   (bounded ✔)
    :6703  contentRef        risk → {flex:1, display:flex, flexDirection:column, overflow:hidden, height:100%}   (bounded ✔; sin minHeight:0 pero height:100% lo acota)
      :6806  panel métricas  {background, borderBottom, flexShrink:0}                       ← NO se encoge (altura natural)
      :7115  chart-wrap      risk/bare → {flex:1, minHeight:0, display:flex, flexDirection:column}   ← ★ SIN overflow:hidden ★
        :7116  intermedio    {position:relative, flex:1, minHeight:0, height:100%, display:flex, flexDirection:column}   (fix V9.580 ✔)
          :7228  <CandleChart fillHeight={true}>
components/CandleChart.js
            :1607  outer     {display:flex, flexDirection:column, flex:1, minHeight:0}      (✔, padre :7116 ya es flex)
              :1608  pane    {position:relative, flex:1, minHeight:0}
                :1610  containerRef {minHeight:0, height:100%}                              ← mide clientHeight
              :1622/1626/1631  subpaneles MACD/RSI/VOL (height fija 120/100/80)
```

**Eslabones:** todos tienen ya `display:flex`/`flex:1`/`minHeight:0` donde corresponde (tras V9.580). El contenedor raíz **sí** está acotado al viewport (`:6641` calc + overflow:hidden). El panel de métricas (`:6806`) es `flexShrink:0`, así que reserva su altura y el `chart-wrap` (`flex:1`) recibe el resto acotado. **La cadena NO está rota.** El único atributo ausente respecto al individual es `overflow:hidden` en el `chart-wrap` risk/bare (`:7115`).

Cita: `pages/index.js:6641`, `:6701`, `:6703`, `:6806`, `:7115`, `:7116`, `:7228`; `CandleChart.js:1607`, `:1608`, `:1610`.

---

## 3. Comparación con el individual YA arreglado

| Eslabón | Individual (funciona) | Risk (se corta) |
|---|---|---|
| contenedor que acota altura | `chart-wrap :7115` con **`height:velasH`** (px explícito) + **`overflow:hidden`** | `chart-wrap :7115` con **`flex:1`** (sin height explícito) + **SIN overflow:hidden** |
| div intermedio `:7116` | `flex:1, minHeight:0, height:100%, display:flex column` (fix V9.580) | **idéntico** (mismo JSX, compartido) |
| CandleChart | `fillHeight`, misma raíz `:1607` | **idéntico** |
| raíz acotada al viewport | `contentRef :6703` normal = `overflowY:auto` (scroll) + chart-wrap con height px | `contentRef :6703` risk = `flex column, overflow:hidden, height:100%` (acota por flex) |

La estructura de cadena flex es **la misma**. Diferencias reales: (a) el individual fija la altura del chart-wrap con **px** (`velasH`) y **recorta** el sobrante (`overflow:hidden`); (b) risk la fija con **`flex:1`** dentro de un `contentRef` acotado y **NO recorta**.

Cita: `pages/index.js:7115` (ambas ramas del ternario), `:6703`, `:7116`.

---

## 4. Diferencia exacta (el delta = el fix)

**El delta es `overflow:hidden`.** Tras V9.580 la cadena propaga la altura igual en ambos modos, así que el CandleChart de risk **ya llena** su hueco. Pero:

- En modo `fillHeight`, CandleChart tiene rutas que fuerzan `resize` a `containerRef.clientHeight || (window.innerHeight − 30)` (`CandleChart.js:274` en el `forceResize` de timeouts/resize, y `:1381` en FIX 2). Si en el primer paint `clientHeight` es 0 (layout flex aún no asentado) **o** el hueco `flex:1` del chart-wrap queda muy pequeño porque el panel de métricas `flexShrink:0` (`:6806`) es alto en viewports bajos, el **fallback `innerHeight−30`** dimensiona el canvas a casi toda la ventana.
- En el **individual** ese exceso lo **recorta** el `overflow:hidden` del chart-wrap (rama normal, `:7115`).
- En **risk** el chart-wrap **no** tiene `overflow:hidden`, así que el canvas sobredimensionado **se desborda hacia abajo / fuera del área** → "se sale, se ve solo parte". El RO (`:1351-1356`) corrige después a `clientHeight`, pero el desborde transitorio (y el permanente si `clientHeight` sigue 0) queda visible por falta de recorte.

En una frase: **misma cadena, pero el chart-wrap de risk no recorta el sobrante que el de individual sí recorta.**

Cita: `pages/index.js:7115` (rama risk sin overflow:hidden), `:6806` (panel flexShrink:0); `CandleChart.js:274`, `:1381`, `:1351-1356`.

---

## 5. ¿Contenedor raíz acotado? Fix mínimo

- **Sí está acotado**: `contentRef` en risk es `flex:1, display:flex column, overflow:hidden, height:100%` (`:6703`), colgando de `:6701` (bounded) y `:6641` (calc(100vh−56px), overflow:hidden). El chart **no** crece "sin límite" por el contenedor raíz; el hueco `flex:1` del chart-wrap está acotado. El desborde viene de que **el propio chart-wrap no recorta** el canvas cuando CandleChart usa el fallback `innerHeight−30`.

- **Fix mínimo (recomendado):** añadir **`overflow:'hidden'`** a la rama **risk/bare** del `chart-wrap` (`pages/index.js:7115`), igualándola a la rama normal. Es decir, que el objeto de estilo risk/bare pase de `{flex:1, minHeight:0, display:'flex', flexDirection:'column'}` a `{flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden'}`. Con esto, cualquier sobredimensión transitoria del canvas se recorta (igual que en el individual) y el RO lo asienta al `clientHeight` correcto. Cambio de 1 propiedad, sin tocar CandleChart, ni el fix de V9.576/V9.580, ni el multibacktest, ni el fullscreen.

- **Refuerzo opcional (defensa en profundidad, no imprescindible):** en `CandleChart.js:274`/`:1381`, el fallback `window.innerHeight−30` es el que puede sobredimensionar cuando `clientHeight===0`. Podría bajarse a un fallback más conservador (p.ej. no hacer `resize` si `clientHeight===0` y esperar al RO), pero con `overflow:hidden` en el chart-wrap risk el síntoma desaparece; este refuerzo es secundario y toca el componente compartido (más superficie/riesgo). **Prioridad: solo el `overflow:hidden` de `:7115`.**

Cita del cambio: `pages/index.js:7115` (rama risk/bare del ternario). Referencia de que funciona: rama normal del mismo `:7115` (ya lleva `overflow:'hidden'`).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Risk usa el MISMO CandleChart/chart-wrap del individual (`fillHeight=true`), no uno aparte | `index.js:7115`, `:7228`, `:7247-7250` |
| 2 | Cadena flex en risk: `:6641 → :6701 → contentRef :6703 → panel :6806 (flexShrink:0) → chart-wrap :7115 (flex:1, SIN overflow:hidden) → :7116 (fix) → CandleChart`. Sin eslabón flex roto | `index.js:6641/6701/6703/6806/7115/7116` |
| 3 | Misma estructura que el individual; diferencias: individual acota con `height:velasH`+`overflow:hidden`, risk con `flex:1` sin overflow:hidden | `index.js:7115` (ambas ramas), `:6703` |
| 4 | Delta = `overflow:hidden`. El fallback `innerHeight−30` de CandleChart sobredimensiona el canvas; el individual lo recorta, risk no → se desborda | `index.js:7115`; `CandleChart.js:274/1381/1351-1356` |
| 5 | Raíz SÍ acotada (`:6641` calc + overflow:hidden). Fix mínimo: añadir `overflow:'hidden'` a la rama risk/bare de `:7115` | `index.js:7115` |
