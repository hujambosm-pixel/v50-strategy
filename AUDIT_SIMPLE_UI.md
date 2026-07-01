# Auditoría read-only — Eliminar la vista "Simple" del multibacktest (preservando el individual)

Fecha: 2026-07-01 · Alcance: `pages/index.js`, `components/BacktestCharts.js`. Solo lectura.

Objetivo: quitar el toggle/curva "Simple" del gráfico de equity **solo en Multicartera**, sin tocar el backtesting **individual**.

---

## 1. Separación MULTI vs INDIVIDUAL — ¿código compartido?

**Son totalmente SEPARADOS: distintos estados, distintos componentes, distintas curvas.**

**Individual** (`pages/index.js:7400-7419`):
- Toggle "Simple/Compuesta/…" en `:7403-7414`. El botón "Simple" es `{key:'st', label:'Simple', state:showStrategy}` (`:7404`) — controlado por **`showStrategy`** (estado `:752`).
- Componente **`EquityChart`** (`:7416`), alimentado por `result.strategyCurve` (Simple) y `result.compoundCurve`.

**Multi** (`pages/index.js:7978-7983`):
- Toggle en `:7978-7983` (array mapeado). Botón "Simple" = `{key:'simple', label:'Simple', state:mcShowSimple}` (`:7979`) — controlado por **`mcShowSimple`** (estado `:972`).
- Componentes **`MultiCartChart`** (vista de 1 resultado, `:8045`) / **`StratCompareChart`** (comparación multi-estrategia). Alimentados por `mcResult.simpleCurve` (`:8046`) y `compoundCurve`.

**CLAVE:** el individual usa `showStrategy` + `strategyCurve` + `EquityChart`; el multi usa `mcShowSimple` + `simpleCurve` + `MultiCartChart`. **No comparten estado ni componente.** Eliminar el Simple del multi **NO afecta al individual**. Seguro.

---

## 2. El toggle en el multibacktest y su default

Fila EQUITY del multi, array mapeado en `pages/index.js:7978-7983` (rama de 1 resultado / pool):
```js
{key:'simple',  label:'Simple',           color:'#00d4ff', state:mcShowSimple,   set:setMcShowSimple},   // :7979
{key:'compound',label:'Compuesto',        color:'#00e5a0', state:mcShowCompound, set:setMcShowCompound}, // :7980
{key:'bh',      label:'B&H Diversificado',...}, {key:'sp500', label:'B&H SP500',...}, {key:'fl', label:'Flotante',...}
```
Estados y **defaults**:
- `mcShowSimple` → `useState(false)` (`:972`) → **Simple ya está OFF por defecto**.
- `mcShowCompound` → `useState(true)` (`:973`) → **Compuesto ON por defecto**.

(En la rama de comparación multi-estrategia, `:7877-7910`, no existe botón Simple: cada estrategia se pinta como su curva **compuesta**.)

---

## 3. Qué lee el modo Simple en el contexto multi

Referencias a `mcShowSimple` / `simpleCurve` del multi (búsqueda exhaustiva):
- **Botón toggle** — `:7979`.
- **`MultiCartChart`** (1 resultado) — prop `showSimple={mcShowSimple}` (`:8063`) y `simpleCurve={mcResult.simpleCurve}` (`:8046`). Dentro, la serie Simple se dibuja **solo** `if(showSimple && stCurve?.length)` (`components/BacktestCharts.js:66`) y su drawdown en `:95`. Con `showSimple=false` no se pinta nada.
- **`StratCompareChart`** (multi-estrategia) — **NO usa Simple**: sus curvas leen `r.result.compoundCurve` (`:7945` aprox). El toggle Simple no le afecta.
- **Tabla comparativa (CAGR/MaxDD/G.Comp)** — usa la **curva COMPUESTA**: `lastC/firstC` salen de `r.result.compoundCurve` (`:7659-7662`). **No usa el Simple.**
- **Exports (historial/Gantt)** — operan sobre `histResult` (trades + curvas), no sobre el flag `mcShowSimple`; el Simple es un toggle **puramente visual** del `MultiCartChart`.

**Conclusión:** en el multi, el "Simple" solo afecta a **una serie visual del `MultiCartChart`** (vista de 1 resultado). Ni la tabla, ni la comparación multi-estrategia, ni los exports dependen de él.

---

## 4. Curvas por modo — ¿existe el nombre legible?

**Sí, ya existe.** `MODE_LABELS` (`pages/index.js:4063`):
```js
const MODE_LABELS={slots:'Slots',compartido:'Compartido',concentrado:'Concentrado',positionsizing:'Pos.Sizing'}
```
- Al ejecutar varios modos (comparación), cada resultado se etiqueta: `name: \`${stratName} · ${MODE_LABELS[modo]}\`` (`:4078`) y guarda `modo` (clave cruda) en el objeto (`:4078`).
- En `StratCompareChart`, cada curva lleva `{id, name, color}` con `name = r.name` (que ya incluye el nombre del modo) → la leyenda muestra el modo. Colores de `STRAT_COMPARE_COLORS`.
- Para la **vista de 1 solo modo** (single-result), el modo activo es `mcMode` (estado global del panel), y su nombre legible sería `MODE_LABELS[mcMode]`.

**Matiz:** `MODE_LABELS` está declarado **dentro** de la función de ejecución (`:4063`, scope local del `useCallback`), no a nivel de módulo. Para usar el nombre como etiqueta en el render del toggle habría que **levantarlo a una constante de módulo** (o duplicar un mapa inline).

---

## 5. Cambio mínimo (descripción, no implementado)

**(a) Quitar el botón Simple solo del multi:** en el array del toggle multi (`:7978-7983`), **eliminar la entrada `{key:'simple', …}`** (`:7979`). Como `mcShowSimple` ya es `false` por defecto y `MultiCartChart` solo dibuja la serie Simple `if(showSimple)` (`BacktestCharts.js:66`), con el botón fuera la curva Simple nunca se pinta. **No toca el individual** (que usa `showStrategy`/`EquityChart`, intactos). Opcional: dejar de pasar `showSimple`/`simpleCurve` al `MultiCartChart` (o pasar `showSimple={false}`), aunque no es imprescindible.

**(b) Compuesto por defecto:** ya lo es (`mcShowCompound=true`, `:973`). **Nada que cambiar.**

**(c) Etiqueta = nombre del modo:** cambiar el `label` del botón `{key:'compound'}` (`:7980`) de `'Compuesto'` a `MODE_LABELS[mcMode]` (p.ej. "Capital concentrado"/"Concentrado"). Requiere **levantar `MODE_LABELS` a scope de módulo** (hoy está en `:4063` dentro del callback) o inline un mapa equivalente en el render. En la comparación multi-estrategia (`StratCompareChart`) cada curva ya se etiqueta con `r.name` (incluye el modo), así que ahí no hace falta cambio.

**No tocar:** el individual (`showStrategy`, `EquityChart`, `strategyCurve`), la tabla comparativa (compuesta), `StratCompareChart`, los exports, ni el backend.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Multi e individual **separados** (estados/componentes/curvas). Quitar Simple del multi no afecta al individual | indiv `:7404`/`:7416` (showStrategy/EquityChart) · multi `:7979`/`:8045` (mcShowSimple/MultiCartChart) |
| 2 | Toggle multi en `:7978-7983`; `mcShowSimple=false` default (`:972`), `mcShowCompound=true` (`:973`) | `:7979`, `:972-973` |
| 3 | Simple del multi solo afecta la serie visual de `MultiCartChart` (`showSimple`, BacktestCharts `:66`). Tabla/compare/exports usan **compuesta** | `:8063`, `:7659-7662`, `BacktestCharts.js:66` |
| 4 | Nombres de modo ya existen en `MODE_LABELS` (`:4063`) y en `r.name` (`:4078`); falta levantarlo a módulo para usarlo en el toggle | `:4063`, `:4078` |
| 5 | Fix: (a) borrar entrada `simple` del array `:7979`; (b) compuesto ya default; (c) label = `MODE_LABELS[mcMode]` (levantar la const) | `:7979`, `:7980`, `:4063` |
