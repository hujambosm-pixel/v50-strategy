# AUDITORÍA — Prioridad por fuerza relativa en Multicartera (Fase 3)

**Fecha:** 2026-07-11 · **Versión:** V9.619 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** mapear la lógica de asignación de la Multicartera (portfolioMode) para que pueda **desempatar por RS vs SP500** cuando hay más señales que slots, en vez de por orden alfabético.

**Veredicto rápido — escenario MIXTO:**
- **Concentrado:** el mecanismo de prioridad/RS **ya existe y funcionaría** con símbolos sintéticos; solo lo bloquea un literal `'alfabetico'` hardcodeado. → Escenario **(a)**: reutilizar el gate existente, cambio pequeño.
- **Compartido y Position Sizing:** **NO tienen** hook de prioridad; ordenan por fecha+alfabético. → Escenario **(b)**: habría que inyectar el cálculo/orden RS en su punto de decisión. Mayor esfuerzo.
- Recomendación: acotar Fase 3 a **Concentrado** primero (es el único modo con "slots" y desempate por criterio; también donde el RS tiene sentido natural).

---

## 1. EL FORZADO A ALFABÉTICO

Código exacto ([multibacktest.js:1401-1421](pages/api/multibacktest.js#L1401)):
```js
// 5. Curvas — prioridad FORZADA a 'alfabetico' en esta fase
//    (momentum/fuerza_relativa/scoreMap requieren lookups por synSym → Fase 2)
const _maxPos   = sizeRules.maxPosiciones ?? 5
const _momentN  = sizeRules.momentumN ?? 20
const synList   = assetResults.map(ar => ar.symbol)
let curves
if (modoAsig === 'compartido')      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
else if (modoAsig === 'positionsizing') curves = buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules || {})
else { // concentrado
  curves = buildConcentradoCurves(
    assetResults, cfg.capitalIni, _maxPos,
    'alfabetico',   // ← literal hardcodeado (Fase 2 pendiente)
    _momentN, sp500DataTf, synList, null
  )
}
```

- **Naturaleza:** es un **literal hardcodeado** ([1418](pages/api/multibacktest.js#L1418)), NO lee `sizeRules.prioridad`. Contraste con el **path normal**, que sí respeta al usuario: `const _prior = sizeRules.prioridad ?? 'alfabetico'` ([1820](pages/api/multibacktest.js#L1820)). Es decir, en Multicartera el criterio elegido en la UI **se ignora**.
- **Por qué se forzó** (comentario [1401-1402](pages/api/multibacktest.js#L1401)): los criterios `momentum`/`fuerza_relativa`/`score_metricas` "requieren lookups por synSym". En portfolioMode los símbolos son **sintéticos** (`ticker#stratOrder`, p.ej. `NVDA#000`).
- **¿Qué pasaría si NO se forzara?** Depende del criterio:
  - **`fuerza_relativa` y `momentum`:** funcionarían. `_priorityScore` lee `_dataMap[t.symbol]` ([441](pages/api/multibacktest.js#L441)), que en portfolioMode está keyed por synSym y **poblado con el OHLCV del ticker** ([419-420](pages/api/multibacktest.js#L419) `_dataMap[ar.symbol] = ar.data`). El RS se calcula desde `data` del ticker + `sp500DataTf` → correcto. El comentario que los agrupa con score_metricas es, para estos dos, **pesimista/obsoleto**.
  - **`score_metricas`/`ranking`:** NO funcionarían tal cual. `scoreMap` está keyed por **símbolo real** (de `wlData`), pero `t.symbol` es sintético → `scoreMap[synSym]` = undefined → fallback degenerado. Este es el único que realmente necesita un mapeo synSym→símbolo real (el resto de "Fase 2").

---

## 2. SELECCIÓN CUANDO HAY MÁS SEÑALES QUE SLOTS

**Solo `buildConcentradoCurves` tiene un punto de decisión por prioridad.** Secuencia ([multibacktest.js:486-597](pages/api/multibacktest.js#L486)):

1. **Score por candidato:** cada trade recibe `c._ps = _priorityScore(c)` ([498](pages/api/multibacktest.js#L498)).
2. **Orden:** `allCandidates.sort` ([502-507](pages/api/multibacktest.js#L502)): primero por `entryDate`; a igualdad de fecha, si `prioridad==='alfabetico'` → por string del símbolo, **si no → por `_ps`** (menor score = mayor prioridad, [506](pages/api/multibacktest.js#L506)).
3. **Agotamiento de slots:** en el bucle de eventos, las entradas del día (`entries`, [554](pages/api/multibacktest.js#L554), en el orden ya ordenado) se abren una a una; cuando `slotsLibresEfectivos <= 0` ([577](pages/api/multibacktest.js#L577)) las restantes se **descartan** (`cntDescSlots`).

→ **El punto de desempate es la combinación [506] (orden por `_ps`) + [554]/[577] (quién agota los slots primero).** Ahí es donde el RS decide "quién entra": con `prioridad='fuerza_relativa'`, `_ps = -rs` ([468](pages/api/multibacktest.js#L468)), así que mayor RS = menor `_ps` = entra antes. **No hay que crear un punto nuevo en Concentrado — ya existe.**

(El **gate** de [582-592](pages/api/multibacktest.js#L582) es distinto del desempate: solo actúa en modo `criterioUso==='filtro'`, bloqueando entradas bajo umbral. El desempate por orden actúa siempre que `prioridad!=='alfabetico'`.)

---

## 3. EL GATE RS EN PORTFOLIOMODE — ¿enhebrado para uso real?

- **`sp500DataTf` ya se pasa** a `buildConcentradoCurves` en portfolioMode ([1419](pages/api/multibacktest.js#L1419)). ✓
- **portfolioMode SÍ usa `buildConcentradoCurves`** para el modo concentrado ([1416](pages/api/multibacktest.js#L1416)) — el mismo motor que el path normal. → El desempate RS **reutilizaría el gate/priority existente**, no hay que reimplementarlo (para concentrado).
- **PERO faltan dos cosas para que sea real:**
  1. La `prioridad` está fijada a `'alfabetico'` ([1418](pages/api/multibacktest.js#L1418)) → `_ps` no se usa en el sort ([505](pages/api/multibacktest.js#L505) gana antes que [506]).
  2. La llamada de portfolioMode ([1416-1420](pages/api/multibacktest.js#L1416)) **NO pasa** `criterioUso`, `rsGateThr`, `momGateThr`, `proxGateThr` ni `rsWindow` (se corta en `scoreMap=null`). El path normal SÍ los pasa ([1838](pages/api/multibacktest.js#L1838)). → Para desempate puro basta con `prioridad` + `sp500DataTf` + `rsWindow`; para el **gate filtro** además `criterioUso` + umbrales.
- **Conclusión:** para **Concentrado**, escenario **(a)** — reutilizar el gate existente. Para **Compartido/Position Sizing**, esas ramas ([1408](pages/api/multibacktest.js#L1408)/[1413](pages/api/multibacktest.js#L1413)) **no llaman** a `buildConcentradoCurves` → no pasan por el gate → escenario **(b)**.

---

## 4. LOS TRES MODOS Y EL PUNTO DE DESEMPATE

El punto "qué activo entra cuando compiten varios" es **distinto en cada modo**:

| Modo | Función | Orden / desempate | ¿Hook de prioridad/RS? |
|------|---------|-------------------|-------------------------|
| **Concentrado** | `buildConcentradoCurves` ([410](pages/api/multibacktest.js#L410)) | `entryDate`, luego `_ps` o alfabético ([502-507](pages/api/multibacktest.js#L502)); slots agotan ([577](pages/api/multibacktest.js#L577)) | **Sí** (`_priorityScore` + gate) |
| **Compartido** | `buildCompartidoCurves` ([179](pages/api/multibacktest.js#L179)) | `entryDate`, luego `symbolOrder.indexOf` o **alfabético** ([197-202](pages/api/multibacktest.js#L197)); pool agota | **No** (solo acepta un `symbolOrder` estático, no RS por-fecha; portfolioMode ni lo pasa, [1408](pages/api/multibacktest.js#L1408)) |
| **Position Sizing** | `buildPositionSizingCurves` ([732](pages/api/multibacktest.js#L732)) | `entryDate`, luego **alfabético** ([753](pages/api/multibacktest.js#L753)); riesgo/pool agota | **No** (sin param de prioridad) |

→ El desempate por RS aplica **limpiamente solo a Concentrado**. Para Compartido y Position Sizing habría que **inyectar** un score/orden por RS en dos sitios más (líneas 197-202 y 753) — y ambos comparten el patrón "ordenar candidatos por fecha y romper empates", que es exactamente donde entraría el `_ps`. Nota: esta limitación **ya existe en el path normal** (Compartido/PositionSizing tampoco usan RS ahí); es un rasgo global, no exclusivo de Multicartera.

---

## 5. PLAN (descrito, NO implementado)

### Escenario real
- **(a) es real para Concentrado:** el gate/priority ya está y funciona con synSym para `fuerza_relativa`/`momentum`. Basta con **dejar de forzar alfabético** y pasar los params del criterio.
- **(b) es real para Compartido/Position Sizing:** su lógica de asignación no pasa por el gate; requeriría inyectar el cálculo RS y el orden en su punto de decisión.

### Enfoque de menor riesgo (Fase 3 acotada a Concentrado)
En la rama concentrado de portfolioMode ([1414-1421](pages/api/multibacktest.js#L1414)), replicar lo que ya hace el path normal ([1820-1838](pages/api/multibacktest.js#L1820)):
1. `'alfabetico'` → `sizeRules.prioridad ?? 'alfabetico'`.
2. Pasar además `criterioUso`, `rsGateThr`, `momGateThr`, `proxGateThr` y `rsWindow` (hoy la llamada se corta en `scoreMap`).
3. **Guardar `score_metricas`:** en portfolioMode `scoreMap` no mapea a synSym. Opciones: (i) construir un `scoreMap` sintético `synSym→score` desde el símbolo real, o (ii) mantener el forzado alfabético **solo** para `prioridad==='score_metricas'/'ranking'` (dejando pasar `fuerza_relativa`/`momentum`). La (ii) es la más segura para acotar Fase 3 a RS.

### Ventana RS
- **El mismo `rsWindow` configurable** (sizeRules.rsWindow, default backend 63, UI 20). Reutiliza el gate → misma semántica de velas y `sp500DataTf` (timeframe activo) que el path normal. No hace falta ventana nueva.

### Qué verificar para no romper nada
- **Criterios no-RS intactos:** si `sizeRules.prioridad` no llega o es `'alfabetico'`, comportamiento **idéntico** al actual (default alfabético). Test anti-regresión: Multicartera concentrado sin criterio → mismos resultados que hoy.
- **Los otros dos modos, sin tocar:** el cambio debe quedar **dentro de la rama concentrado** ([1414-1421](pages/api/multibacktest.js#L1414)); Compartido ([1408](pages/api/multibacktest.js#L1408)) y Position Sizing ([1413](pages/api/multibacktest.js#L1413)) no se modifican → su comportamiento es bit-a-bit el mismo.
- **Mismo ticker en varias estrategias:** `NVDA#000` y `NVDA#001` tendrían RS idéntico (mismo ticker) → el desempate por `_ps` empata y cae al tiebreak alfabético del synSym ([505-506](pages/api/multibacktest.js#L505)) → orden determinista, sin no-determinismo.
- **`score_metricas` en Multicartera:** verificar que no degrada en silencio (aplicar opción (ii) o (i) arriba).
- **Frontend:** hoy el criterio `fuerza_relativa` y su `rsWindow`/umbral ya se envían en `sizeRules` para el path normal; confirmar que la request de Multicartera ([index.js ~4145-4158](pages/index.js)) **también** incluye `prioridad`/`criterioUso`/`rsWindow` (hoy la construye aparte y fuerza `prioridad:'alfabetico'` — habría que dejar pasar el criterio del usuario, en paralelo al backend).

### Alcance mínimo vs completo
- **Mínimo (recomendado):** solo Concentrado en Multicartera → cambio de ~1 literal + 5 args en el backend + ajuste del sizeRules del frontend de portfolioMode. Reutiliza todo el gate.
- **Completo (opcional, mayor riesgo):** además Compartido y Position Sizing → inyectar `_priorityScore`/orden por RS en [197-202](pages/api/multibacktest.js#L197) y [753](pages/api/multibacktest.js#L753), tocando lógicas de pool ya delicadas. Diferir salvo que se pida.

---

### Resumen
- **Forzado alfabético:** literal en [1418](pages/api/multibacktest.js#L1418) (portfolioMode ignora `sizeRules.prioridad`).
- **Desempate = solo Concentrado:** orden por `_ps` ([506](pages/api/multibacktest.js#L506)) + agotamiento de slots ([577](pages/api/multibacktest.js#L577)). Compartido/PositionSizing solo fecha+alfabético.
- **El gate ya es reutilizable en Multicartera concentrado** (buildConcentradoCurves se invoca, `_dataMap` keyed por synSym, `sp500DataTf` ya pasado) → escenario (a).
- **Plan mínimo:** no forzar alfabético + pasar criterio/umbral/rsWindow, guardando `score_metricas`; misma `rsWindow`; verificar que los otros dos modos y el caso no-RS quedan intactos.
