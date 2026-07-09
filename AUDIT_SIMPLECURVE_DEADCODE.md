# Auditoría read-only — `simpleCurve` del multibacktest: ¿código muerto?

Fecha: 2026-07-09 · Alcance: `pages/api/multibacktest.js`, `pages/index.js`, `components/BacktestCharts.js`, `lib/`. Solo lectura.

Objetivo: confirmar si `simpleCurve` (multibacktest) sigue desconectada de la UI, de qué se compone por modo, y si conviene borrarla o corregirla.

**Conclusión rápida:** `simpleCurve` está **muerta en la UI** (se recibe pero nunca se pinta: el único consumidor es `MultiCartChart`, que la dibuja solo `if(showSimple…)`, y `showSimple=mcShowSimple` es **siempre `false`** porque `setMcShowSimple` no se llama en ningún sitio). PERO **no** es puramente inerte en el backend: se usa como **plantilla de fechas** para construir `sp500BHCurve` (`:1510`, `:1953`) y alimenta `_calcDD → maxDDSimple`. En cada modo se calcula como una curva de **interés simple real** (base fija `capitalIni`, sin capitalizar) — **NO** es un alias de `compoundCurve` (no hay bug de alias vigente, tampoco en Rotativo/Concentrado). Recomendación de menor riesgo: **dejarla como está** (peso muerto inofensivo, sin bug), o —si se quiere limpiar— hacerlo con cuidado tocando también la plantilla sp500 y las props del frontend.

---

## 1. Definiciones de `simpleCurve` por modo (todas en `pages/api/multibacktest.js`)

**No existe `simpleCurve` en `lib/`** (ni en `lib/backtester.js`): toda la lógica del multibacktest vive en `pages/api/multibacktest.js`.

| Modo | Función | Cálculo de `simpleCurve` | Cita |
|---|---|---|---|
| Slots | `buildSlotsCurves` (`:101`) | `totSimple += e.simple` sumando el equity de interés simple de cada activo por fecha; `simpleCurve.push({date, value: totSimple})` | `:137-142` |
| Compartido/Diversificado | `buildCompartidoCurves` (`:179`) | `simpleVal = capitalIni + Σ closedSoFar (capitalIni * pnlPct/100)` (interés simple, base fija) | `:324-325` |
| Concentrado/**Rotativo** | `buildConcentradoCurves` (`:410`) | **misma** fórmula `simpleVal = capitalIni + Σ (capitalIni * pnlPct/100)` — interés simple genuino, NO alias de compound | `:653-654` |
| Position Sizing | `buildPositionSizingCurves` (`:732`) | misma fórmula de interés simple | `:881-882` |
| Custom weights | `buildCustomCurves` (`:961`) | `totSimple` sumado por activo (ponderado); `simpleCurve.push({date, value: totSimple})` | `:1004/1009` |
| (handler inline) | `handlePortfolioMode` | usa las funciones anteriores según `modoAsig`; ponderación `weights` en `:1840/1882` | `:1200/1553` |

→ En **todos** los modos, `simpleCurve` es una curva de **interés simple** (rendimiento sobre `capitalIni` fijo, sin capitalización), distinta de `compoundCurve`. **No hay asignación tipo `simpleCurve = compoundCurve`** en ningún modo (el bug de alias mencionado no está presente aquí ahora).

Cita: `pages/api/multibacktest.js:101/137-142/179/324-325/410/653-654/732/881-882/961/1004/1009`.

---

## 2. Retorno en la API

Cada función de modo retorna un objeto que incluye `simpleCurve` (y `maxDDSimple` vía `_calcDD`): `:172`, `:396`, `:723`, `:951`, `:1017`.

El handler `handlePortfolioMode` hace **`return res.status(200).json({ ...curves, sp500BHCurve, … })`** (`:1526-1527`) — el spread `...curves` **incluye `simpleCurve`, `maxDDSimple`, `maxDDSimpleDate`, `floatSimpleCurve`** en el JSON al frontend. El segundo handler también responde con el spread de curvas (`:1967`).

Cita: `pages/api/multibacktest.js:172/396/723/951/1017/1526-1527/1967`.

---

## 3. Consumo en frontend

- **Estado:** `const [mcShowSimple,setMcShowSimple]=useState(false)` (`pages/index.js:957`). **`setMcShowSimple` no se invoca en ninguna parte** del código → `mcShowSimple` es **siempre `false`** (el toggle de "Simple" del multi fue retirado, cf. AUDIT_SIMPLE_UI.md).
- **Props pasadas** (a `MultiCartChart`): `simpleCurve={mcResult.simpleCurve}` (`:8052`), `maxDDSimple={mcResult.maxDDSimple}` (`:8060`), `floatSimpleCurve={mcResult.floatSimpleCurve||[]}` (`:8064`), `showSimple={mcShowSimple}` (`:8069`).
- **Render real** (`components/BacktestCharts.js`, `MultiCartChart`): la serie Simple se dibuja **solo** `if(showSimple && stCurve?.length)` (`:68`) y su drawdown `if(showSimple)` (`:97`). Con `showSimple=false` → **no se pinta nada** ni se lee visualmente.
- **`StratCompareChart`** (`BacktestCharts.js:275`) recibe `{curves,…}` (array por estrategia) y **NO** usa `simpleCurve`.
- → **Código muerto en UI confirmado:** `simpleCurve`/`maxDDSimple`/`floatSimpleCurve` se reciben como props pero nunca se renderizan ni se leen para nada visible (dependen de `showSimple`, permanentemente `false`).

Cita: `pages/index.js:957/8052/8060/8064/8069`; `components/BacktestCharts.js:68/97/275`.

---

## 4. Diferencia con el "Simple" de la estrategia individual

Son sistemas **distintos**, sin relación de código:
- **Individual:** usa `showStrategy` + `strategyCurve` + componente `EquityChart`, y la lógica de interés simple/compuesto de `afterTaxSim.js` (backtesting de un solo activo). Estados y componente propios.
- **Multi:** `mcShowSimple` + `simpleCurve` + `MultiCartChart`.
- No comparten estado, prop ni componente. Tocar/eliminar el `simpleCurve` del multi **NO afecta** al "Simple" del individual ni a `afterTaxSim.js`.

Cita: `pages/index.js:957` (mcShowSimple, multi) vs `showStrategy`/`strategyCurve` (individual); `afterTaxSim.js` (individual, ajeno).

---

## 5. Recomendación (menor riesgo)

`simpleCurve` es **UI-muerta** pero tiene **dependencias blandas en el backend**:
- **Plantilla de fechas de `sp500BHCurve`:** `sp500BHCurve = curves.simpleCurve.map(({date}) => …)` (`:1510`, y `:1951-1953` en el otro handler). Usa `simpleCurve` **solo por sus fechas**; `compoundCurve` tiene exactamente las mismas fechas (se rellenan en el mismo bucle), así que es sustituible.
- **`_calcDD(simpleCurve, …)`** (`:1038/1044`) produce `maxDDSimple*` que se retornan pero no se muestran.

Opciones:
- **(A) Recomendada — DEJARLA como está.** No hay bug vigente (cada modo calcula interés simple real, no un alias de compound), y el coste de mantenerla es nulo (unos push + un cálculo de DD + props no leídas). Borrarla obliga a tocar **6 funciones de modo + sus returns + `_calcDD` + la plantilla sp500 (2 sitios) + variantes float + props del frontend**: superficie amplia, riesgo de romper `sp500BHCurve` si se despista la plantilla de fechas, y recompensa baja. Menor riesgo = no tocar.
- **(B) Si se decide limpiar (fuera de hotfix):** (1) cambiar la plantilla de `sp500BHCurve` de `curves.simpleCurve` a `curves.compoundCurve` (`:1510`, `:1953`); (2) quitar `simpleCurve`/`floatSimpleCurve` de los returns de las 6 funciones y de `_calcDD` (y `maxDDSimple*`); (3) quitar las props `simpleCurve`/`maxDDSimple`/`floatSimpleCurve`/`showSimple` y el estado `mcShowSimple` en `pages/index.js` y `BacktestCharts.js`. Verificar que `sp500BHCurve` sigue idéntica tras el cambio de plantilla. Es un refactor coherente pero cross-cutting → hacerlo con build + revisión, no en caliente.
- **Corregir (en vez de borrar):** **no aplica** — no hay incorrección actual (Rotativo/Concentrado calculan interés simple genuino, `:653`). El "bug de alias" mencionado no está presente en el código actual.

**Recomendación: (A) dejarla.** Es código muerto en UI pero inofensivo y sin bug; el borrado es un refactor de superficie amplia con recompensa mínima. Si se prioriza limpieza de deuda técnica, aplicar (B) con cuidado (sobre todo la plantilla de fechas de sp500).

Cita: `pages/api/multibacktest.js:1510/1951-1953/1038/1044`; `pages/index.js:957/8052/8060/8064`.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | `simpleCurve` definida solo en `multibacktest.js` (no en `lib/`), en 6 funciones de modo; en todas es interés simple real (base `capitalIni`), NO alias de compound (tampoco en Rotativo) | `multibacktest.js:137-142/324-325/653-654/881-882/1009` |
| 2 | Se retorna al frontend vía `...curves` en `res.json` (ambos handlers) — incluye `simpleCurve`, `maxDDSimple`, `floatSimpleCurve` | `multibacktest.js:1526-1527/1967` |
| 3 | UI-muerta: `mcShowSimple=false` siempre (`setMcShowSimple` nunca se llama); series Simple solo `if(showSimple)` → nunca se pinta; StratCompareChart no la usa | `index.js:957/8052/8069`; `BacktestCharts.js:68/97/275` |
| 4 | Distinta del "Simple" individual (`showStrategy`/`strategyCurve`/`EquityChart`/`afterTaxSim.js`) — sistemas separados, borrar el del multi no afecta al individual | `index.js:957` vs individual; `afterTaxSim.js` |
| 5 | Dependencia blanda: plantilla de fechas de `sp500BHCurve` (`:1510/1953`) + `maxDDSimple`. Menor riesgo = DEJARLA (sin bug); si limpiar, refactor cross-cutting con sp500→compoundCurve | `multibacktest.js:1510/1951-1953` |
