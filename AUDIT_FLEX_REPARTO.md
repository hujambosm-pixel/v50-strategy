# Auditoría read-only — Reparto velas/equity vía Flexbox + ResizeObserver (individual)

Fecha: 2026-07-03 · Alcance: `pages/index.js`, `components/CandleChart.js`, `components/EquityChart.js`. Solo lectura.

Objetivo: repartir velas/equity con un **contenedor flex acotado al viewport** (75/25) + un **RO** que lea la altura de cada hijo y la pase al chart vía `applyOptions({height})`, en lugar de calcular px externamente. Evaluar viabilidad sin reescribir los componentes.

---

## 1. Estructura actual (jerarquía y estilos)

Columna del individual (backtest normal), `pages/index.js`:
```
:6722  <div ref={contentRef} … {flex:1, overflowY:auto}>          ← COLUMNA CON SCROLL
  … barra de símbolo / selector de estrategia / toolbars … (por encima de velas)
  :7134  <div className="chart-wrap" ref={chartWrapRef} style={{padding:0, borderBottom:'1px solid var(--border)', …risk/bare:{flex:1,minHeight:0,display:flex,flexDirection:column}}}>   ← VELAS
           :7247  <CandleChart chartHeight={candleH}>   (+ subpaneles MACD/RSI/volumen internos)
           :7296  <div divisor>  (drag → indivSplitRatio)   ← DENTRO de chart-wrap, último hijo
         </div>  (:7305)
  :7307  {chartFullscreen && <div position:fixed …>}          ← overlay, FUERA de flujo (condicional)
  :7431  {metricsLayout==='grid' && <div métricas …>}         ← EN FLUJO, ENTRE velas y equity (solo modo grid)
  :7447  <>                                                    ← fragmento equity+mensuales+historial
    :7448  <div className="equity-section">                    ← EQUITY
             :7449  <div className="section-title"> …botones… </div>
             :7464  <EquityChart chartHeight={equityH}>
           </div>
    :7499  <div ref={indivMonthlyRef} data-chart="monthly">    ← GANANCIAS MENSUALES
    …       Capital invertido (barras) + Historial de operaciones …
  </>
```

**Respuestas:**
- **velas y equity son HERMANOS** dentro de `contentRef` (`:6722`), pero **NO adyacentes**: entre ellos hay (a) el overlay fullscreen `:7307` (`position:fixed`, fuera de flujo, condicional → no afecta layout) y (b) el **bloque de métricas en cuadrícula `:7431`, EN FLUJO, presente solo si `metricsLayout==='grid'`** (en modo 'panel' va al sidebar y velas/equity quedan adyacentes).
- **El divisor está DENTRO de chart-wrap** (`:7296`), como último hijo de la sección velas — no es un hermano entre velas y equity.
- **Entre equity y mensuales**: nada — `equity-section` (`:7448`) contiene el título+botones y el `EquityChart`; justo después va `monthly` (`:7499`). Son consecutivos dentro del fragmento `<>`.
- `contentRef` **scrollea** (`overflowY:auto`); no acota a una altura fija repartible.

---

## 2. Cómo reciben altura los charts

- **CandleChart**: recibe `chartHeight` como prop; `createChart(container,{height:chartHeight})` (`CandleChart.js:303`) y un `useEffect([chartHeight])` con `applyOptions({height:chartHeight})` (`:1401-1402`). Su contenedor es `<div ref={containerRef}>`. Ya tiene un RO propio para **ancho** (`:1343`, cleanup vía `innerCleanupRef`).
- **EquityChart**: igual — `chartHeight` prop, `createChart({height:chartHeight})` (`EquityChart.js:15/18`), `useEffect([chartHeight])` `applyOptions({height})` (`:130-132`), RO de ancho (`roRef`, V9.565).

**¿Podrían medir su contenedor padre?** Dos vías:
- (A) **Menos invasiva (recomendada):** NO tocar los componentes. Un **RO externo** sobre el contenedor flex de cada chart lee su `contentRect.height` y hace `setCandleH`/`setEquityH` (el mismo mecanismo actual del prop `chartHeight`). Es exactamente el patrón del Dashboard (`tlEquityHeight`, `index.js:1187-1195`). Cero cambios en CandleChart/EquityChart.
- (B) Más invasiva: que cada componente añada la medición de **altura** a su RO interno y se auto-ajuste. Implica tocar CandleChart (complejo, con subpaneles) y EquityChart. No necesario si se usa (A).

**Obstáculo clave (subpaneles de CandleChart):** CandleChart renderiza, **debajo** del gráfico principal, subpaneles MACD/RSI/volumen (`macdContainerRef`/`rsiContainerRef`/`volumeContainerRef`, `CandleChart.js:579/654/693`). Su altura DOM total = `chartHeight` (principal) + subpaneles. Si el "pane" de velas es flex-fill y se le pasa `chartHeight = alturaPaneCompleta`, se **desborda** por los subpaneles. Habría que medir/pasar `chartHeight = alturaPane − alturaSubpaneles`, o envolver solo el gráfico principal en el flex-child. Es la misma complicación que ya arrastramos.

---

## 3. Viabilidad flex (contenedor acotado + hijos 75/25)

**Viable, con reestructuración de JSX.** Se puede crear un wrapper `display:flex; flexDirection:column; height:calc(100vh − Y)` (o altura **medida**, ver §5) que contenga SOLO [pane velas][divisor][pane equity], con `velasPane {flex:3, minHeight:120}` y `equityPane {flex:1, minHeight:120}`. Flex nunca desborda el wrapper → sin overflow.

**Obstáculos:**
1. **velas y equity no están juntos**: el bloque de métricas grid (`:7431`) queda EN FLUJO entre ellos. Para el flex hay que **sacar ese bloque fuera del wrapper** (moverlo debajo del wrapper, o mostrarlo solo en sidebar). En modo 'panel' ya no estorba.
2. **El divisor está dentro de chart-wrap** (`:7296`): habría que moverlo a ser hermano entre los dos panes.
3. **Toolbar de velas** (barra de info, dentro de chart-wrap) y **legend/botones de equity** (`section-title` `:7449`) deben ser `flexShrink:0` (altura natural) dentro de cada pane; el gráfico ocupa el resto (flex-fill).
4. **Subpaneles de CandleChart** (§2): el pane de velas debe reservar su altura; medir el contenedor del gráfico principal, no el pane completo.
5. **Modos risk/bareChart**: `chart-wrap` ya usa flex condicional para esos modos (`:7134`); el nuevo wrapper debe respetar/anidar sin romperlos.
6. `contentRef` es `overflowY:auto`: el wrapper acotado va dentro; mensuales/barras/historial quedan DEBAJO del wrapper, en el scroll (bajo el pliegue) — justo lo que se busca.

---

## 4. El divisor con flex (¿deja de colapsar el equity?)

**Sí, lo resuelve.** Con `velasPane {flexGrow:N}` y `equityPane {flexGrow:100−N}` + `minHeight` en ambos, arrastrar el divisor cambia `N` (flex-grow) y **reparte dentro del wrapper acotado sin desbordar**. El problema actual ("arrastrar abajo colapsa el equity") viene de calcular px con `budget` que se desincroniza; con flex, el `minHeight` del pane de equity **impide el colapso** y el reparto es puramente proporcional. Compatible con la estructura si se coloca el divisor como hermano entre los dos panes y el RO traduce las alturas flex resultantes a `chartHeight`.

---

## 5. Enfoque flex + RO completo (descripción, sin implementar)

**Contenedor:**
```
wrapperRef  { display:flex; flexDirection:column; height: <medida> ; overflow:hidden }
  velasPane   { flex: `${ratio*100} 1 0`; minHeight:120; display:flex; flexDirection:column }
     toolbar velas (flexShrink:0)
     candleContainer (flex:1, minHeight:0)  ← RO mide su height → setCandleH  (restando subpaneles si aplica)
  divisor     { height:6; cursor:row-resize; flexShrink:0 }  ← drag ajusta `ratio` (flex-grow)
  equityPane  { flex: `${(1-ratio)*100} 1 0`; minHeight:120; display:flex; flexDirection:column }
     legend/botones equity (flexShrink:0)
     equityContainer (flex:1, minHeight:0)  ← RO mide su height → setEquityH
```
- **RO** sobre `candleContainer` y `equityContainer`: en cada cambio, `setCandleH(contentRect.height)` / `setEquityH(...)` (mismo prop `chartHeight` de hoy, sin tocar los componentes). **Loop-safe**: la altura del container la fija flex (no `chartHeight`), así que `applyOptions({height})` no altera la altura del container → el RO no oscila (guard `prev===`). Es el patrón ya validado del Dashboard.
- **Divisor**: `onMouseDown`→drag; el mousemove ajusta `indivSplitRatio` (clamp 0.4–0.85) → cambia `flexGrow` de los panes → flex re-reparte → los RO releen y actualizan `chartHeight`. Sin px calculados, sin overflow.

**Valor de Y (altura por encima del wrapper):** Y = todo lo que va ARRIBA del wrapper dentro del viewport: header superior de la app (~**56px**, el `calc(100vh − 56px)` del panel raíz) + las filas/toolbars que hoy están **por encima de `chart-wrap`** dentro de `contentRef` (barra de símbolo/watchlist, selector de estrategia, banners). Esa parte superior es **variable**, así que en vez de una `Y` constante conviene **medir** `wrapperRef.getBoundingClientRect().top` y usar `height = innerHeight − top − margen(≈8)` (patrón `mcEquityH`/`tlEquityHeight`). Así el wrapper llena desde su posición real hasta el fondo, y flex reparte dentro.

**Riesgos:**
- **Reestructuración de JSX**: mover el divisor, envolver velas+equity, y sacar el bloque de métricas grid del medio. Riesgo medio de romper el overlay fullscreen, los modos risk/bareChart o el layout grid si no se aísla bien.
- **Subpaneles de CandleChart**: si están activos, hay que medir el contenedor del gráfico principal (no el pane) o descontar su altura; si no, se desborda el pane.
- **Doble render inicial**: el RO mide tras el primer paint → un reflow de ajuste al montar (aceptable, como en el Dashboard).
- **minHeight vs viewport pequeño**: con `minHeight:120+120` y toolbars, en ventanas muy bajas podría no caber y reaparecer scroll (aceptable; degradación suave).

**Ventaja neta frente a los 4 intentos en px:** flex **garantiza no-overflow** (mensuales siempre debajo del wrapper), y el `minHeight` evita el colapso del equity al arrastrar. Los RO solo traducen alturas ya resueltas por el navegador → nada de `budget`/`chrome`/`delta` que se desincronizan.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | velas (`chart-wrap`) y equity (`equity-section`) son hermanos en `contentRef` (scroll), con el bloque de métricas grid EN FLUJO entre ellos (solo modo grid); el divisor está DENTRO de chart-wrap | `:6722`, `:7134`, `:7296`, `:7431`, `:7448`, `:7499` |
| 2 | Ambos reciben `chartHeight` prop → `applyOptions({height})`; vía menos invasiva = RO externo que mide el contenedor y hace setCandleH/setEquityH (sin tocar los componentes). Ojo subpaneles de CandleChart | `CandleChart.js:303/1401`, `EquityChart.js:15/130` |
| 3 | Flex viable; obstáculos: sacar métricas grid del medio, mover el divisor, flexShrink en toolbars, subpaneles, modos risk/bare | `:7134`, `:7296`, `:7431` |
| 4 | Divisor por flex-grow + minHeight → reparte sin desbordar y **sin colapsar equity** (arregla el bug actual) | `:7296` |
| 5 | Wrapper `flex column` de altura **medida** (`innerHeight − top − 8`), hijos `flex:ratio` con RO→chartHeight; Y≈56 + toolbars variables (mejor medir el top) | `:6722`, `mcEquityH`/`tlEquityHeight` patrón `:1187` |
