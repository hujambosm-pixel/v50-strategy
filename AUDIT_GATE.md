# Auditoría read-only — Alcance de "Prioridad de entrada" + cálculo de RS (para un futuro gate)

Fecha: 2026-06-27 · Alcance: `pages/index.js`, `pages/api/multibacktest.js`. Solo lectura; ninguna lógica modificada.

---

## 1. Alcance de "Prioridad de entrada" — ¿qué modos la consumen?

**HALLAZGO: la prioridad la consume ÚNICAMENTE el modo "Capital concentrado". Slots, Compartido y Position Sizing NO la usan.**

**Frontend (lectura del dropdown):**
- Estado del dropdown: `pages/index.js:953` → `const [mcPrioridad,setMcPrioridad]=useState('alfabetico')`.
- `<select>` de la UI: `pages/index.js:6068` (`value={mcPrioridad} onChange={...setMcPrioridad}`).
- Se envía al backend dentro de `sizeRules`: `pages/index.js:4012` → `sizeRules:{ ..., prioridad:mcPrioridad, momentumN:Number(mcMomentumN), ... }`.
- En **Multicartera real (portfolioMode)** se **fuerza** a `'alfabetico'`: `pages/index.js:4130` (`prioridad:'alfabetico'`).

**Backend (consumo por modo):**
- **Concentrado** — SÍ la usa: `pages/api/multibacktest.js:1796` (`const _prior = sizeRules.prioridad ?? 'alfabetico'`) → se pasa a `buildConcentradoCurves(..., _prior, ...)` en `:1799`. Dentro, `prioridad` es parámetro (`:410`), alimenta `_priorityScore` (`:427`) y el `sort` de candidatos (`:497-498`).
- **Compartido** — NO la usa: `pages/api/multibacktest.js:1794` → `buildCompartidoCurves(assetResults, cfg.capitalIni)` (sin `prioridad`). Sus candidatos se ordenan solo por fecha (`:198-199`).
- **Position Sizing** — NO la usa para ordenar: `pages/api/multibacktest.js:1801` → `buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules)`. Aunque recibe `sizeRules` (que contiene `prioridad`), **no** referencia `prioridad`; ordena candidatos por `entryDate` y desempata por `symbol`: `:729`.
- **Slots** — NO la usa: `pages/api/multibacktest.js:1803` → `buildSlotsCurves(assetResults, cfg.capitalIni)` (sin `prioridad`).
- En **portfolioMode** la prioridad está forzada a `'alfabetico'` para los 3 modos de pool: comentario `:1372` y llamada concentrado `:1384-1388` (`'alfabetico'` hardcodeado).

> Búsqueda exhaustiva: las únicas referencias a `prioridad`/`_priorityScore`/`_ps` en el backend están dentro de `buildConcentradoCurves` (`:405-498`) y en el call site del concentrado (`:1796`). Confirmado: **solo concentrado**.

---

## 2. Dónde Concentrado decide ocupar un slot libre (sitio del "gate")

**HALLAZGO: el bloque de apertura con cupo `maxPosiciones` está en `pages/api/multibacktest.js:555-573`.** Ahí, dentro del `forEach` de entradas, es donde se aceptaría/rechazaría la señal (punto natural para insertar un gate antes de `cntEjecutadas++ / poolLibre -= capPorEntrada`):

```js
    if (entries.length > 0 && poolLibre > 0.01) {               // :555
      let sameDayOpen = 0                                       // :558
      entries.forEach(t => {                                    // :559
        const posicionesAbiertas = Object.keys(openSlots).length// :560
        const slotsLibresEfectivos = maxPosiciones - posicionesAbiertas - sameDayOpen  // :562
        const openCapsTotal = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0) // :563
        const capitalTotal = poolLibre + openCapsTotal          // :564
        const slotsEfectivos = Math.min(maxPosiciones, n)       // :567
        const capMaxPorPosicion = capitalTotal / slotsEfectivos // :568
        if (slotsLibresEfectivos <= 0) { cntDescSlots++; ...; return }   // :569  (rechazo por cupo lleno)
        const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)     // :570
        if (capPorEntrada < 0.01) { cntDescCapital++; ...; return }      // :571  (rechazo por capital)
        cntEjecutadas++                                          // :572  ← AQUÍ se acepta la entrada
        poolLibre -= capPorEntrada                               // :573
```

El **gate** iría entre `:562` (ya hay slot libre) y `:572` (se ejecuta): un `if (gateRechaza(t)) { ...descartar...; return }` antes de `cntEjecutadas++`.

---

## 3. Cálculo de "Fuerza relativa vs SP500"

**HALLAZGO: se calcula en `_priorityScore`, rama `fuerza_relativa`, en `pages/api/multibacktest.js:449-464`. Sí usa ventana de 63 días; la fórmula es (retorno activo 63d) − (retorno SP500 63d).**

```js
    if (prioridad === 'fuerza_relativa') {                                   // :449
      const LB = 63                                                          // :450  ← ventana 63 días
      if (idx < LB) return 0                                                  // :451
      const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close  // :452
      if (!sp500Data || !sp500Data.length) { ...; return -retAsset }         // :453-456 fallback momentum
      let spIdx = -1
      for (let i = sp500Data.length - 1; i >= 0; i--) {                      // :458  localiza barra SP500 <= entryDate
        if (sp500Data[i].date <= t.entryDate) { spIdx = i; break }           // :459
      }
      if (spIdx < LB) return -retAsset                                       // :461
      const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close  // :462
      return -(retAsset - retSP)   // mayor alfa vs SP500 → score menor → entra antes                     // :463
    }
```

- **Ventana:** 63 días (`LB = 63`, `:450`).
- **Fórmula:** `retAsset − retSP` (alfa de 63d), devuelto **negado** (`-(retAsset - retSP)`, `:463`) porque menor score = mayor prioridad en el `sort`.
- **Serie SP500:** símbolo `^GSPC`, vía la función unificada `fetchData` (Stooq primario + Yahoo fallback, V9.540). Se descarga en `pages/api/multibacktest.js:1231` (handler portfolioMode) y `:1597` (handler no-portfolio) y se pasa como parámetro `sp500Data` a `buildConcentradoCurves` (`:1799`).

---

## 4. Reutilización de la función RS desde el punto del paso 2

**HALLAZGO: `_priorityScore` es un closure DEFINIDO DENTRO de `buildConcentradoCurves` (`:427`), en el MISMO scope que el bloque de apertura del paso 2 (`:555-573`). Es directamente llamable desde el gate, sin pasar nada extra.**

- **Mismo scope:** `_priorityScore` (`:427`) y el gate (`:555-573`) están ambos dentro de `buildConcentradoCurves` (`:410-700`). El gate puede invocar `_priorityScore(t)` tal cual.
- **Dato ya precomputado:** cada candidato lleva su score en `t._ps`, asignado en `:490` (`c._ps = _priorityScore(c)`). El gate puede leer `t._ps` directamente sin recalcular.
- **Datos disponibles en scope:** `sp500Data`, `_dataMap`, `_dateIdxMap`, `momentumN`, `scoreMap` son todos visibles dentro de la función. No hay que pasar la serie del SP500 ni el índice `i`: `_priorityScore` ya resuelve el índice internamente (`_dateIdxMap[symbol][entryDate]`, `:440`) y la barra del SP500 por fecha (`:458-459`).

**Matiz para un gate por umbral (no solo orden):** `_priorityScore` devuelve un **score de ORDENACIÓN negado**, no la métrica cruda. Para `fuerza_relativa`, `_ps = -(retAsset - retSP)`, así que:
- "alfa positiva vs SP500" (RS > 0) ⟺ **`t._ps < 0`**.
- Un gate tipo "solo entrar si RS vs SP500 > 0" se implementa como `if (t._ps >= 0) { descartar; return }` (cuando `prioridad === 'fuerza_relativa'`).

Si se quisiera un umbral sobre el valor crudo de alfa (p.ej. RS > 2%), convendría extraer un helper pequeño que devuelva `retAsset - retSP` sin negar, reutilizando las mismas líneas `:450-463` — pero para un gate binario "RS>0" basta con el signo de `t._ps`, sin duplicar lógica.

---

## Resumen

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Alcance de prioridad | **Solo Concentrado** (multibacktest.js:1796/1799). Compartido (:1794), PositionSizing (:1801/:729) y Slots (:1803) **no** la usan. |
| 2 | Punto del gate | `multibacktest.js:555-573` (bloque de apertura con cupo, antes de `cntEjecutadas++` en :572). |
| 3 | Cálculo RS | `multibacktest.js:449-463` — ventana **63d**, `retAsset − retSP`, SP500 = `^GSPC` vía `fetchData` (:1231/:1597). |
| 4 | Reutilización | `_priorityScore` (:427) está en el mismo scope que el gate; llamable sin params extra. `t._ps` ya precomputado (:490). Para gate "RS>0" usar `t._ps < 0`. |
