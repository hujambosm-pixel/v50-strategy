# AUDITORÍA — Mapa de las tres configuraciones de RS (fuerza relativa vs SP500)

**Fecha:** 2026-07-11 · **Versión:** V9.613 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** localizar las tres RS (A ranking, B gate multibacktest, C visual cabecera), sus ventanas/parámetros, y confirmar si son independientes antes de hacerlas configurables.

**Conclusión rápida:** **las tres son totalmente independientes** — no comparten estado, constante ni función. A y B coinciden en el valor 63, pero como **literales hardcodeados separados** (no una constante común); C usa su propio estado (`rsVisualWindow`, default 20). Hacer una configurable NO afecta a las otras. El bug del benchmark en semanal (C) tiene la misma raíz que un problema latente en B; A no se ve afectada porque siempre opera en diario.

---

## 1. UBICACIÓN A — RS del RANKING (score de métricas del watchlist)

La RS del ranking aparece **duplicada** (misma lógica en dos funciones de `pages/index.js`):

- `calcRanking`: [index.js:2794-2804](pages/index.js#L2794).
- `calcScoreMetSen`: [index.js:3106-3113](pages/index.js#L3106).

Cálculo (idéntico en ambas):
```js
if (sp500Closes?.length>=64 && frPct>0) {
  const spLast=sp500Closes[len-1], sp63=sp500Closes[len-64]   // ← ventana 63 (índice -64)
  const spRet=(spLast/sp63-1)*100
  const asset63 = priceArr.length>=64 ? priceArr[len-64] : priceArr[0]
  const assetRet=(lastP/asset63-1)*100
  relStrength = assetRet - spRet
}
```

- **Ventana:** **63 barras**, **hardcodeada** vía el índice literal `-64` ([index.js:2797](pages/index.js#L2797) y [index.js:3108](pages/index.js#L3108)). No hay parámetro de ventana.
- **¿Configurable?** Solo el **peso** `frPct` (`rankingFRPct`, default 33%) es configurable; la **ventana (63) NO**. (El momentum sí usa `momN`=`rankingMomentumN` configurable, pero es otra métrica distinta del RS.)
- **¿Desde dónde?** `localStorage` `v50_settings.ranking.rankingFRPct` ([index.js:3078](pages/index.js#L3078): `frPct=(sett.ranking?.rankingFRPct??33)/100`). Pesos también en `rankingWeightMercado`/`rankingWeightHistorico`.
- **SP500:** vía `/api/closes?symbol=%5EGSPC&days=300` ([index.js:3083](pages/index.js#L3083)) → `pages/api/closes.js`, que está **hardcodeado a `interval=1d`** ([closes.js:11](pages/api/closes.js#L11)). Es decir, **A opera siempre en diario** (activo y SP500 ambos daily desde `closes.js`).

---

## 2. UBICACIÓN B — Gate de fuerza relativa del multibacktest

- Cálculo: [multibacktest.js:452-468](pages/api/multibacktest.js#L452), dentro de `_priorityScore` (modo Concentrado, `prioridad==='fuerza_relativa'`):
```js
const LB = 63                                   // ← ventana hardcodeada
const retAsset = (data[idx].close - data[idx-LB].close) / data[idx-LB].close
// … localizar spIdx por fecha …
const retSP = (sp500Data[spIdx].close - sp500Data[spIdx-LB].close) / sp500Data[spIdx-LB].close
const rs = retAsset - retSP
```
- **Ventana:** **`LB = 63`** ([multibacktest.js:453](pages/api/multibacktest.js#L453)), **hardcodeada** (constante local, no parámetro).
- **¿Configurable?** **No.** No se lee de `sizeRules` ni de params; es un literal. (Lo configurable del gate es el *umbral* `rsGateThr` y el *modo* Desempate/Filtro, no la ventana.)
- **SP500:** `sp500Data` se descarga con `fetchData('^GSPC', cfg.years …)` ([multibacktest.js:1255](pages/api/multibacktest.js#L1255) y [multibacktest.js:1621](pages/api/multibacktest.js#L1621)) **sin argumento de intervalo** → **daily** (`fetchData(..., interval='1d')`). Se casa por fecha (`sp500Data[i].date <= t.entryDate`, [461-462](pages/api/multibacktest.js#L461)) y se retrocede `LB` barras sobre esa serie **diaria**.

---

## 3. UBICACIÓN C — RS visual de la cabecera (gráfico individual)

- `useMemo rsVisual`: [index.js:784-798](pages/index.js#L784).
```js
const N = Math.trunc(Number(rsVisualWindow))
const cAct=bars[last].close, cActBase=bars[base].close
const cSp=bars[last].sp500Close, cSpBase=bars[base].sp500Close
return { ok:true, pct:((cAct/cActBase-1)-(cSp/cSpBase-1))*100 }
```
- **Ventana:** **`rsVisualWindow`**, estado React, **default 20**, **configurable** vía el input de la cabecera ([index.js:779](pages/index.js#L779) estado; input en la cabecera con `min 2/max 500`).
- **¿Desde dónde?** Estado local de `index.js` (no persiste en Supabase ni localStorage; es puramente visual y por-sesión).
- **SP500:** `bars[i].sp500Close` de `result.chartData` — inyectado en el backend por `datos.js` ([datos.js:434](pages/api/datos.js#L434)) desde `sp500Map` (que a su vez viene de un fetch **daily** de `^GSPC`, ver punto 5).

---

## 4. ¿SON INDEPENDIENTES?  →  SÍ, totalmente

**No comparten ninguna variable de estado, constante, función ni parámetro.** Evidencia:

- **No existe una constante global de ventana RS.** `lib/constants.js` no define ningún `RS_WINDOW`/`RS_LOOKBACK`/`63` (grep sin resultados). Los "63" son literales **independientes**:
  - A: índice literal `-64` en dos sitios ([index.js:2797](pages/index.js#L2797), [index.js:3108](pages/index.js#L3108)).
  - B: `const LB = 63` local ([multibacktest.js:453](pages/api/multibacktest.js#L453)).
  - C: no usa 63 — usa `rsVisualWindow=20`.
  → Cambiar el 63 de A **no** toca el de B, y viceversa (son literales distintos, no una constante compartida).
- **Tres implementaciones separadas del cálculo** (inline en cada sitio; no hay una función `calcRS()` común): A inline ×2, B inline en `_priorityScore`, C inline en el `useMemo`.
- **Tres fuentes de estado/config distintas:** A → `v50_settings.ranking.rankingFRPct` (peso; ventana fija); B → literal en el motor (nada configurable); C → estado React `rsVisualWindow` (configurable).
- **Tres fuentes de SP500 distintas:** A → `/api/closes` (`closes.js`); B → `fetchData('^GSPC')` en `multibacktest.js`; C → `sp500Close` de `result.chartData` (`datos.js`).

**Implicación:** hacer configurable cualquiera de las tres ventanas (p.ej. exponer la de A o la de B como parámetro) **no afectará a las otras dos**. La única "coincidencia" es el número 63 en A y B, pero al ser literales separados no hay acoplamiento real.

---

## 5. BUG DEL BENCHMARK EN SEMANAL

**Confirmado.** El SP500 se descarga **siempre en diario**:
- Para C (y el `sp500Close` de `chartData`): [datos.js:306](pages/api/datos.js#L306) `fetchAV('^GSPC', years + 1)` **sin intervalo** → daily; se inyecta por fecha en cada barra ([datos.js:434](pages/api/datos.js#L434) `d.sp500Close = sp500Map[d.date] ?? null`).

**Por qué da −0,7% con ^GSPC semanal (debería ser 0%):** una barra **semanal** de Yahoo tiene `date` = **primer día de la semana** (lunes) pero `close` = **cierre del último día** (viernes). El `sp500Close` se casa por `date` → toma el **cierre diario del lunes**. Así, en la misma barra, `close` (viernes del activo ^GSPC) **≠** `sp500Close` (lunes del índice). El RS compara ratios con endpoints desfasados unos días → sale ≠ 0 aunque el activo sea el propio índice. Raíz exacta: SP500 diario matcheado a fecha de barra semanal ([datos.js:306](pages/api/datos.js#L306) + [datos.js:434](pages/api/datos.js#L434)).

**¿Afecta a A y B?**
- **A (ranking): NO en la práctica.** `closes.js` está fijado a `interval=1d` ([closes.js:11](pages/api/closes.js#L11)) y el ranking opera sobre closes diarios tanto del activo como del índice → ambas patas diarias, consistentes. El ranking no se ejecuta en semanal.
- **B (gate multibacktest): SÍ, y peor.** Cuando el multibacktest corre en semanal, el activo `data` es **semanal** pero `sp500Data` es **diario** ([1255](pages/api/multibacktest.js#L1255)/[1621](pages/api/multibacktest.js#L1621)) y se retroceden `LB=63` barras **sobre cada serie**: `data[idx-63]` = 63 **semanas** atrás, `sp500Data[spIdx-63]` = 63 **días** atrás. → compara retorno del activo a ~15 meses contra retorno del índice a ~3 meses. Desajuste de ventana temporal, no solo de endpoint.

**Alcance de la solución de fondo (descargar el SP500 en el mismo timeframe que el activo):**
- **C:** tocar **`datos.js`** — pedir `^GSPC` con `assetInterval` (el mismo que el activo, [datos.js:292](pages/api/datos.js#L292)) en la llamada de [datos.js:306](pages/api/datos.js#L306).
- **B:** tocar **`multibacktest.js`** — pasar el intervalo del activo a los `fetchData('^GSPC', …)` de [1255](pages/api/multibacktest.js#L1255)/[1621](pages/api/multibacktest.js#L1621) (hoy usan el default diario).
- **A:** **solo si** se quisiera ranking en semanal — habría que añadir un parámetro `interval` a **`closes.js`** ([closes.js:11](pages/api/closes.js#L11), hoy fijo `1d`). Hoy no es necesario (A es diario por diseño).
- → La corrección toca **`datos.js` (C) y `multibacktest.js` (B)**; `closes.js` solo entraría si A se extiende a semanal. Cada arreglo es local a su ubicación (coherente con la independencia del punto 4).

---

## TABLA RESUMEN

| Ubicación | archivo:línea | ventana actual | ¿configurable hoy? | ¿desde dónde? | ¿comparte algo con otras? |
|-----------|---------------|----------------|--------------------|----------------|----------------------------|
| **A — Ranking / score métricas** | [index.js:2794-2804](pages/index.js#L2794) y [index.js:3106-3113](pages/index.js#L3106) | **63** (índice `-64`, hardcodeado) | Solo el **peso** `frPct`; la ventana **no** | `localStorage` `v50_settings.ranking.rankingFRPct` | **No** — literal propio; SP500 desde `closes.js` (daily) |
| **B — Gate multibacktest (fuerza_relativa)** | [multibacktest.js:452-468](pages/api/multibacktest.js#L452) | **63** (`const LB=63`, hardcodeado) | **No** (ni ventana ni fórmula) | — (literal en el motor) | **No** — literal propio; SP500 `fetchData('^GSPC')` daily |
| **C — RS visual cabecera** | [index.js:784-798](pages/index.js#L784) | **20** (`rsVisualWindow`, default) | **Sí** (input cabecera, min 2/max 500) | Estado React `rsVisualWindow` (por sesión) | **No** — estado propio; SP500 `sp500Close` de `datos.js` (daily) |

**Independencia:** confirmada — sin constante/estado/función compartida. El "63" de A y B son literales separados; C es un estado aparte (20). El único problema transversal es el **SP500 siempre diario** (afecta a C y a B-en-semanal; A es diario y no se ve afectada), y su arreglo es local a `datos.js` (C) y `multibacktest.js` (B).
