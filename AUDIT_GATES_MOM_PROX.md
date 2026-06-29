# Auditoría read-only — Gates de momentum / proximidad / RS y origen de parámetros

Fecha: 2026-06-29 · Alcance: `pages/api/multibacktest.js` (`_priorityScore`), `pages/index.js` (parámetros). Solo lectura.

Todas las métricas se calculan en `_priorityScore` (`pages/api/multibacktest.js:427-476`). Cada candidato lleva su score en `c._ps` (asignado en `:490`). El gate de entrada lee `t._ps` en `:573`.

> **Convención:** `_ps` es un score de ORDENACIÓN **negado** (menor `_ps` = mayor prioridad = entra antes). Por eso "el activo es fuerte" equivale a `_ps` **negativo**.

---

## MÉTRICA 1 — 'momentum'

**1. Cálculo** (`multibacktest.js:443-448`):
```js
const N = Math.max(1, momentumN || 20)                                   // :444  N configurable
if (idx < N) return 0                                                    // :445  sin historial → 0
const ret = (data[idx].close - data[idx - N].close) / data[idx - N].close // :446  retorno N días (fracción)
return -ret                                                              // :447
```
Representa el **retorno simple del activo en N días** (fracción, p.ej. 0.10 = +10%). `_ps = -ret`.

**2. Signo / "cumple"**: "el activo ha subido" (ret > 0) ⟺ **`_ps < 0`**.

**3. Parámetro**: `N = momentumN`, **configurable**. Origen: param de `buildConcentradoCurves` (`:410`) → call site `:1807` (`_momentN = sizeRules.momentumN ?? 20`) → frontend `sizeRules.momentumN = Number(mcMomentumN)` (`index.js:4013`) → estado React `mcMomentumN` (`index.js:955`, default **20**) + input UI en el panel Multicartera (~`index.js:6090`). **Disponible en backend en el punto del gate.**

---

## MÉTRICA 2 — 'fuerza_relativa'

**1. Cálculo** (`multibacktest.js:449-464`):
```js
const LB = 63                                                            // :450  HARDCODED (no configurable)
if (idx < LB) return 0                                                   // :451
const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close   // :452
... (si no hay sp500Data → return -retAsset, :453-456)
const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close  // :462
return -(retAsset - retSP)                                               // :463
```
Representa el **alfa a 63 días**: retorno del activo − retorno del SP500 (`^GSPC`), en fracción. `_ps = -(retAsset - retSP) = -RS`.

**2. Signo / "cumple"**: "RS vs SP500 > 0" (ha batido al índice) ⟺ **`_ps < 0`**. (Es lo que usa el gate actual: `_ps >= 0` ⇒ descartar.)

**3. Parámetro**: ventana **63 días HARDCODED** (`:450`), **NO configurable** desde ningún sitio. El `sp500Data` viene de `fetchData('^GSPC', ...)` (`:1231`/`:1597`). No hay umbral configurable: hoy el umbral es implícitamente 0.

---

## MÉTRICA 3 — 'max52' (proximidad 52s)

**1. Cálculo** (`multibacktest.js:465-474`):
```js
const LB = Math.min(idx, 251)                                           // :466  252 barras HARDCODED
let max252 = -Infinity
for (let i = idx - LB; i <= idx; i++) { const h = (data[i].high != null ? data[i].high : data[i].close); if (h > max252) max252 = h }  // :468-470
if (max252 <= 0 || max252 === -Infinity) return 0                       // :472
return -(data[idx].close / max252)                                      // :473
```
Representa la **proximidad al máximo de 252 barras**: ratio `close / max252` ∈ (0, 1] (1.0 = está en el máximo). `_ps = -(close / max252)`.

**2. Signo / "cumple"**: "cerca del máximo" = ratio alto = `_ps` cercano a **−1** (cuanto más negativo, más cerca). "Dentro de X% del máximo" = `close/max252 ≥ 1 − X` ⟺ **`_ps ≤ -(1 − X)`**.

**3. Parámetro**: ventana **252 barras HARDCODED** (`:466`), **NO configurable**. No hay umbral configurable.

---

## 3. Origen de parámetros — backtest vs ranking del watchlist (CLAVE)

**Son cálculos SEPARADOS con parámetros distintos:**

- **Backtest (el que produce `t._ps`)**: usa SOLO `momentumN` (configurable vía `mcMomentumN` del panel Multicartera). Las ventanas de RS (63) y proximidad (252) están **hardcodeadas** en `_priorityScore`. **No lee `sett.ranking.*`** para momentum/fuerza/max52.
- **Ranking del watchlist (`scoreMetricas`)**: se calcula aparte (en `calcScoreMetSen` y afines, `index.js:2659`, `:2786`, `:3012-3013`) y SÍ usa los parámetros de **Configuración › Ranking**: `sett.ranking.rankingMomentumN` (default 20), `rankingMomentumPct`, `rankingFRPct`, `rankingMax52Pct`, etc. Descarga su propio `^GSPC` (`:3017`).
- **Puente**: el ranking del watchlist solo entra al backtest cuando `prioridad === 'score_metricas'`, vía `scoreMap` (`index.js:4014`: `scoreMap:Object.fromEntries(...scoreMetricas)`) → `_priorityScore` rama `:429-437`. Para momentum/fuerza/max52 el backtest **no** usa el ranking.

**Conclusión punto 3:** los parámetros de Configuración › Ranking (incluido `rankingMomentumN`) alimentan el **ranking del watchlist**, NO el cálculo de priorización del backtest. El backtest solo comparte `momentumN` a través de su propio control `mcMomentumN` (que es independiente de `rankingMomentumN`). RS=63 y prox=252 del backtest no provienen de configuración alguna.

---

## 4. Umbral de gate — ¿está el % crudo disponible en `:573`?

En el punto del gate solo existe **`t._ps`** (el score negado). El % crudo **NO** está como campo propio, pero **es derivable** de `_ps` porque `_ps` es exactamente la métrica negada (sin otra transformación):

| Gate deseado | Valor crudo | Derivación desde `_ps` | Condición de gate |
|---|---|---|---|
| momentum "subida > X%" (N=`momentumN`) | `ret = -_ps` | directa | `t._ps < -X/100` |
| fuerza_relativa "RS > X%" (N=63 hardcoded) | `RS = -_ps` | directa | `t._ps < -X/100` (hoy X=0 ⇒ `_ps < 0`) |
| max52 "dentro de X% del máximo" (252 hardcoded) | `ratio = -_ps`, distancia `= 1 + _ps` | directa | `t._ps ≤ -(1 - X/100)` |

**CAVEAT importante — `_ps = 0` está sobrecargado:** `_priorityScore` devuelve `0` en los fallbacks de "sin historial suficiente / sin datos" (`:441`, `:445`, `:451`, `:461` parcial, `:472`). Pero `0` también podría ser un valor genuino (ret=0, RS=0). Por tanto, derivar el % crudo desde `_ps` **no distingue** "no calculable" de "exactamente cero". El gate actual de RS (`_ps >= 0` ⇒ descartar) de hecho **bloquea** los candidatos con `_ps=0` por falta de historial (>63 barras), en lugar de dejarlos pasar.

**Recomendación para gates con umbral configurable robustos:** exponer en cada candidato un **campo crudo + flag de validez** calculado en `_priorityScore` junto a `_ps` (p.ej. `c._momRaw`, `c._rsRaw`, `c._proxDist`, y `c._psValid`), en vez de reutilizar `_ps`. Así el gate compara el % real contra el umbral y trata "no calculable" como "deja pasar" sin ambigüedad. Para **RS y proximidad** además habría que **threadear nuevos parámetros de ventana** (63, 252) como ya se hace con `momentumN`, si se quieren configurables.

---

## 5. Resumen

| Métrica | Fórmula (`_ps`) | "Cumple" en `_ps` | Parámetro y origen | Qué falta para gatear con umbral configurable |
|---|---|---|---|---|
| **momentum** | `-ret` (ret = retorno N días) `:447` | `_ps < 0` | `N = momentumN` **configurable** (`mcMomentumN` → sizeRules) | Umbral X: `_ps < -X/100`. Derivable; añadir input de umbral. Cuidado con `_ps=0` (sin historial) |
| **fuerza_relativa** | `-(retAsset−retSP)` 63d `:463` | `_ps < 0` | ventana **63 HARDCODED**; SP500 = `^GSPC` | Umbral X: `_ps < -X/100`. Para N configurable: nuevo param de ventana. `_ps=0` ambiguo |
| **max52** | `-(close/max252)` 252 barras `:473` | `_ps ≤ -(1−X)` | ventana **252 HARDCODED** | Distancia = `1 + _ps`; gate `_ps ≤ -(1−X/100)`. Para ventana configurable: nuevo param. `_ps=0` = inválido |

**Notas transversales:**
- El backtest y el ranking del watchlist son cálculos **separados**; los defaults de Configuración › Ranking (`rankingMomentumN`, etc.) NO afectan al `_ps` del backtest.
- Solo `momentumN` es hoy configurable en el backtest; **RS (63) y proximidad (252) están hardcodeadas**.
- El % crudo es derivable de `_ps` para las tres, pero el valor `_ps = 0` (fallback "sin datos") es ambiguo → para gates por umbral conviene exponer campos crudos + flag de validez en lugar de inferir desde `_ps`.
