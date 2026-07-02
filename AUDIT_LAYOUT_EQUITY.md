# Auditoría read-only — Layout del equity del multibacktest (mayor altura)

Fecha: 2026-07-01 · Alcance: `pages/index.js`, `components/BacktestCharts.js`. Solo lectura.

Objetivo: que el gráfico de EQUITY del **multibacktest** ocupe más alto (arranque igual que hoy, bajo la fila de botones), estirándose hasta casi llenar la pantalla, dejando "Ganancias mensuales" y "Capital empleado" **bajo el pliegue** (scroll). Sin tocar el individual.

---

## 1. Estructura del contenedor (jerarquía y overflow)

Bloque del multi (solo cuando `sidePanel==='multi'`), `pages/index.js:7636-7639`:
```
:6641  <div height:calc(100vh - 56px), overflow:hidden>        ← panel raíz (altura acotada al viewport)
  :7637  <div display:flex, flex:1, minHeight:0, overflow:hidden, height:100%>   ← fila flex
    :7639  <div flex:1, overflowY:auto, padding:0 0 20px 0>     ← COLUMNA IZQUIERDA (scroll)  ★
      :7641  Header "📊 Multicartera · N activos · modo · Desde…"
      :7651  Tabla COMPARATIVA + resumen por activo  (altura variable según nº estrategias/activos)
      :7930  <div className="equity-section" data-chart="equity">
               :7931  fila de botones EQUITY (estrategia | B&H Diversificado | …)
               :8007/:8046  gráfico (StratCompareChart / MultiCartChart), height = mcEquityH
               :8079  drag-handle para redimensionar mcEquityH
      :8088  Ganancias mensuales (McMonthlyGainsChart)
      :8105  Capital empleado (McOccupancyChart)
```
- **El scroll NO es de la página entera**: lo hace la **columna izquierda `:7639`** (`overflowY:auto`), cuya altura está acotada por el panel raíz `:6641` (`calc(100vh - 56px)`, `overflow:hidden`) y el flex `:7637` (`height:100%`). Es decir, ya existe un contenedor de scroll interno equivalente al `#tlDashOuter` del Dashboard.
- La comparativa, el equity, ganancias mensuales y capital empleado están **todos dentro de `:7639`**, en ese orden vertical.

---

## 2. Altura actual del equity

- Estado **`mcEquityH`** = `useState(300)` (`pages/index.js:881`) — **valor fijo en px, redimensionable** por el usuario con el drag-handle (`:8079`, ajusta `mcEquityH`).
- Se pasa como `chartHeight={mcEquityH}` a **ambos** componentes: `StratCompareChart` (`:8043`, vista multi-estrategia) y `MultiCartChart` (`:8069`, vista de 1 resultado).
- Dentro de cada componente, `chartHeight` se usa en `createChart({height:chartHeight})` (`BacktestCharts.js:41` y `:262`) y el contenedor es `<div style={{minHeight:chartHeight}}>` (`:129` y `:344`). Por defecto el equity mide **300px**.

---

## 3. Patrón del Dashboard (`#tlDashOuter`) y equivalencia en el multi

- `#tlDashOuter`: `pages/index.js:9457` → `display:flex; flexDirection:column; flex:1; minHeight:0; overflowY:auto; overflowX:hidden`. El bloque interno del Dashboard usa `height:'calc(100vh - 88px)'` (`:9496`).
- **El multi YA tiene su equivalente**: la columna izquierda `:7639` (`flex:1; overflowY:auto`) hace de contenedor de scroll, con altura acotada por `:6641` (`calc(100vh - 56px)`). No hace falta crear un `#tlDashOuter` nuevo; el scroll ya funciona ahí. La diferencia con el Dashboard es que el multi no fija un `height:calc(...)` a un bloque interno — reparte por contenido (por eso el equity queda en 300px y todo cabe sin llenar la pantalla).

---

## 4. ResizeObserver y riesgo de "Object is disposed"

Tanto `MultiCartChart` como `StratCompareChart` separan **anchura** (RO) de **altura** (useEffect dedicado):
- **Altura**: `MultiCartChart` `BacktestCharts.js:123-125` → `useEffect(()=>{ if(chartRef.current) applyOptions({height:chartHeight}) },[chartHeight])`. Igual en `StratCompareChart` `:341-343`. Cambiar `chartHeight` **NO recrea el chart**: solo aplica la nueva altura, y va **envuelto en try/catch**. → cambiar `mcEquityH` es seguro, no dispara "Object is disposed".
- **Anchura**: RO en `:116-118` (MultiCart) y `:335-337` (StratCompare): `const ro=new ResizeObserver(...); ro.observe(ref.current); return()=>ro.disconnect()`. **Matiz**: ese `return()=>ro.disconnect()` está **dentro del `.then()`** (es el valor resuelto de la promesa, no un cleanup real → el RO no se desconecta en el unmount; mismo patrón latente que arreglamos en TlCharts). PERO el callback del RO hace `try{chart.applyOptions({width})}catch(_){}` (`:116`/`:335`), así que un RO huérfano sobre un chart ya dispuesto **traga el error** — no aflora "Object is disposed". El cleanup externo (`:120`/`:339`) sí hace `chart.remove()`.
- **Conclusión**: subir la altura del equity es **seguro** (la altura se aplica por useEffect con try/catch, sin recreación). El leak del RO es latente pero está protegido por try/catch; no afecta a este cambio.

---

## 5. Cambio mínimo (descripción, no implementado)

**Objetivo**: equity ≈ `calc(100vh - X)`, con el resto (mensuales, capital empleado) bajo el pliegue, dentro del scroll ya existente (`:7639`).

**Qué contenedor lleva el overflow**: ninguno nuevo — **la columna izquierda `:7639` ya es `overflowY:auto`** con altura acotada por `:6641`. Solo hay que hacer el equity más alto; lo demás caerá bajo el pliegue y será scrolleable.

**Cambio mínimo (opción A, la más simple):** subir el valor de **`mcEquityH`** (`:881`) de 300 a una altura calculada ≈ `window.innerHeight - X`. Como `lightweight-charts` necesita un **número px** (no acepta `calc()` en `chartHeight`), hay que calcular el px en JS:
- En el montaje / cuando cambie el viewport, `setMcEquityH(window.innerHeight - X)`.
- **X ≈ 300–340**: descompone lo que hay por encima del gráfico dentro del viewport → header superior (`:6641`, 56px) + header Multicartera (`:7641`, ~34px) + **tabla comparativa (variable, ~180–240px)** + fila de botones EQUITY (`:7931`, ~26px). Con `X≈320`, en un viewport de ~1040px el equity mediría ~720px (casi lleno), empujando mensuales/capital empleado abajo.
- El drag-handle (`:8079`) sigue permitiendo ajuste fino.

**Opción B (más robusta, exacta):** replicar el patrón del Dashboard de **medir** el espacio disponible: envolver el gráfico en un contenedor `flex:1; minHeight:0` y un `ResizeObserver` que haga `setMcEquityH(alturaMedida)` (como `tlEquityHeight` en el Dashboard). Así el equity llena exactamente el hueco **sea cual sea la altura de la tabla comparativa** (que varía con el nº de estrategias). Más preciso pero algo más invasivo.

**Recomendación**: Opción A por simplicidad (aprovecha el scroll y el drag ya existentes; `X≈320` aproximado, "casi llena" como pide el usuario). Si se quiere exactitud independiente del tamaño de la comparativa, Opción B.

**No tocar**: el backtesting individual (usa `equityH`/`EquityChart`, ramas `:7400-7458`, ajenas a `mcEquityH`), los cálculos, la tabla comparativa, ni el backend. El cambio se limita a `mcEquityH` (y, en Opción B, a un contenedor + RO alrededor del gráfico del multi).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Scroll interno en la **columna izquierda `:7639`** (`overflowY:auto`), acotada por `:6641` (`calc(100vh-56px)`). Orden: comparativa → botones → equity → mensuales → capital empleado | `:6641`, `:7637-7639`, `:7930`, `:8088`, `:8105` |
| 2 | Equity = `mcEquityH` (`useState(300)`, px, redimensionable) → `chartHeight` de MultiCart/StratCompare | `:881`, `:8043`, `:8069`; `BacktestCharts.js:41/262/129/344` |
| 3 | `#tlDashOuter` en `:9457` (+`calc(100vh-88px)` `:9496`); el multi **ya tiene equivalente** en `:7639` | `:9457`, `:9496`, `:7639` |
| 4 | Altura por useEffect con try/catch (sin recreación) → **seguro**; RO solo ancho, leak latente pero protegido por try/catch | `BacktestCharts.js:123-125/341-343`, `:116/335` |
| 5 | Fix: subir `mcEquityH` a `innerHeight − X` (X≈320) [opción A] o medir con RO [opción B]; overflow ya en `:7639` | `:881`, `:8079` |
