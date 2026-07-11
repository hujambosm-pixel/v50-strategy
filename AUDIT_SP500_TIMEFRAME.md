# AUDITORÍA — Viabilidad de SP500 en el timeframe del activo (Fase 1)

**Fecha:** 2026-07-11 · **Versión:** V9.614 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** confirmar la viabilidad técnica de descargar/alinear el benchmark SP500 en el MISMO timeframe que el activo (diario/semanal) en las tres ubicaciones de RS mapeadas en AUDIT_TRES_RS.md, como paso previo a que todos los cálculos cuenten VELAS del timeframe activo.

**Veredicto:** **viable en las tres ubicaciones, con infraestructura ya existente** (los fetchers ya aceptan intervalo; solo falta pasarlo). Pero hay **dos riesgos no triviales** que la Fase 2 debe manejar: (1) `sp500Data` es una serie **compartida** que también consumen los filtros de mercado y la curva B&H — cambiarla a semanal a secas rompería consumidores que esperan diario; (2) el match por fecha exacta de `datos.js:434` es frágil ante convenciones de fecha semanal distintas entre fuentes (Stooq ancla distinto que Yahoo, y `^GSPC` vía Stooq es en realidad **SPY**).

---

## 1. CÓMO SE PIDE EL ACTIVO EN SEMANAL HOY (plantilla a replicar)

Cadena completa en `datos.js`:

- **De dónde viene el timeframe:** del body de la request — `intervalo` ([datos.js:248](pages/api/datos.js#L248)), que el frontend envía desde el estado `estrategiaIntervalo` ([index.js:3462](pages/index.js#L3462), `intervalo:estrategiaIntervalo`).
- **Conversión a intervalo de fetch:** [datos.js:292](pages/api/datos.js#L292) `const assetInterval = intervalo === 'semanal' ? 'w' : 'd'` → [datos.js:293](pages/api/datos.js#L293) `fetchAV(simbolo, years + 1, assetInterval)`.
- **Cómo pide `fetchAV` cada fuente** ([datos.js:40](pages/api/datos.js#L40) `fetchAV(symbol, years=5, interval='d')`):
  - **Stooq (primaria):** `i=${stooqInterval}` con `'w'|'d'` ([datos.js:42-43](pages/api/datos.js#L42)).
  - **Yahoo (fallback):** `interval=${yfInterval}` con **`'1wk'|'1d'`** ([datos.js:67-71](pages/api/datos.js#L67)), vía `?interval=1wk&range={years}y`.

Esta es exactamente la plantilla: **la función ya soporta semanal**; pedir el SP500 semanal es llamar `fetchAV('^GSPC', years+1, assetInterval)` en vez de omitir el 3er argumento.

**Hallazgo colateral importante:** en Stooq, `^GSPC` se mapea a **`spy.us`** (el ETF SPY, no el índice) — [datos.js:27](pages/api/datos.js#L27). Es decir, el "SP500" puede ser SPY (Stooq) o ^GSPC (Yahoo) según qué fuente responda. Para un RS de ratios es internamente consistente (ambos extremos salen de la misma serie), pero implica que **las convenciones de fecha semanal pueden variar entre fuentes** (ver punto 4).

---

## 2. LAS TRES FUENTES DEL SP500 — CÓMO PEDIRÍAN SEMANAL

### 2a. `closes.js` (usado por A — ranking)
- Hoy: **`interval=1d` hardcodeado** en la URL de Yahoo ([closes.js:11](pages/api/closes.js#L11)). Parámetros actuales por **query string**: `symbol`, `days`, `dates` ([closes.js:4](pages/api/closes.js#L4)).
- Cómo se le pasaría: añadir un query param `interval` (p.ej. `?interval=1wk`) e interpolarlo en la URL — cambio local y retrocompatible (default `1d`).
- **Llamadas que tendrían que pasar el timeframe** (todas en `index.js`): [2740](pages/index.js#L2740) y [2866](pages/index.js#L2866) (SP500 del ranking), [3083](pages/index.js#L3083) (SP500 de `calcScoreMetSen`), [3097](pages/index.js#L3097) (closes del activo en score), [2640](pages/index.js#L2640) (closes de señales). Las llamadas [1370](pages/index.js#L1370)/[1734](pages/index.js#L1734) son del tradelog (curvas float) y deberían **seguir en diario**.
- **Caveat propio de A:** el parámetro `days=300` está en **días naturales**. Si A pasara a contar velas semanales, 63 velas ≈ 441 días + margen → habría que ajustar también `days`, no solo `interval`. (Hoy A es solo-diario por diseño; este cambio es opcional/futuro.)

### 2b. `datos.js` (usado por C — cabecera)
- Hoy: [datos.js:306](pages/api/datos.js#L306) `fetchAV('^GSPC', years + 1)` — **sin 3er argumento** → default `'d'`.
- Cambio: pasar `assetInterval`, que **está disponible en ese punto** (definido 14 líneas antes, [datos.js:292](pages/api/datos.js#L292), mismo scope del handler). Una línea.
- **PERO — efecto colateral crítico:** `sp500Data`/`sp500Map` no alimenta solo el `sp500Close` de las barras ([datos.js:434](pages/api/datos.js#L434)); también lo **reutilizan los filtros de mercado**: el resolver de datasets ([datos.js:339-341](pages/api/datos.js#L339)) sirve `sp500Data` a cualquier filtro `^GSPC` con `intervalo:'diario'` (`(ticker === '^GSPC' && iv !== 'w') ? sp500Data : …`). Si `sp500Data` pasa a semanal cuando el activo es semanal, un filtro índice-EMA configurado en **diario** recibiría datos semanales → EMA del filtro mal calculada. También lo consume `calcEquityCurves(..., sp500Data)` para la curva B&H del SP500 ([datos.js:108](pages/api/datos.js#L108)). → La implementación segura NO es mutar `sp500Data`, sino **añadir una segunda serie** `^GSPC@assetInterval` para la inyección de `sp500Close` (y opcionalmente la B&H), dejando la diaria para los filtros.

### 2c. `multibacktest.js` (usado por B — gate)
- Hoy: [multibacktest.js:1255](pages/api/multibacktest.js#L1255) y [1621](pages/api/multibacktest.js#L1621) `fetchData('^GSPC', cfg.years, …)` — sin 5º argumento → default `'1d'` ([multibacktest.js:69](pages/api/multibacktest.js#L69)).
- **El multibacktest SÍ sabe su timeframe:** `assetInterval = intervalo === 'semanal' ? '1wk' : '1d'` en ambos paths ([1216](pages/api/multibacktest.js#L1216) portfolioMode, [1610](pages/api/multibacktest.js#L1610) path normal), y **`fetchData` ya acepta el intervalo** ([69-71](pages/api/multibacktest.js#L69), normaliza `'1wk'|'w'→'w'`). El cambio mínimo es añadir `assetInterval` como 5º argumento.
- **Mismo efecto colateral que en datos.js:** `sp500Data` se reutiliza para (i) el resolver de filtros `^GSPC` diario ([1341](pages/api/multibacktest.js#L1341) y [1690](pages/api/multibacktest.js#L1690): `(ticker === '^GSPC' && iv !== '1wk') ? sp500Data : …`), (ii) la inyección `sp500Close` en `runCodeJsAsset` ([1083-1087](pages/api/multibacktest.js#L1083)), (iii) la curva B&H `sp500BHCurve` ([1506](pages/api/multibacktest.js#L1506), [1950](pages/api/multibacktest.js#L1950)), y (iv) el gate `fuerza_relativa` ([452-468](pages/api/multibacktest.js#L452)). Igual que en C: **serie separada por intervalo** (o clavar la diaria para los filtros) en vez de mutar la única.

---

## 3. DISPONIBILIDAD DE ^GSPC SEMANAL EN YAHOO

Del código:
- La ruta de semanal (`interval=1wk&range={años}y`, [datos.js:67-71](pages/api/datos.js#L67)) es **la misma que ya usan los activos semanales en producción** — hay estrategias con `intervalo:'semanal'` operativas (p.ej. "23 EMA20 breakouts", params `{"emaPeriod":20,"intervalo":"semanal"}`) y backtests de 5 años (+1 de warm-up) funcionando con esa URL.
- No hay en el código ningún límite de rango condicionado al intervalo semanal (a diferencia del intradía de Yahoo, que sí limita); `yfYears` se clampa a 1..10 años ([datos.js:68](pages/api/datos.js#L68)) para **cualquier** intervalo.
- Además existe el fallback Stooq (`i=w`), también sin límite de rango en el código.

**No confirmable desde el código:** que Yahoo devuelva efectivamente ~6 años de `^GSPC` en `1wk` (el código no tiene tests ni fixtures de eso). Dado que el índice tiene décadas de histórico y la misma ruta sirve semanal para tickers ordinarios, el riesgo es bajo, pero **queda como verificación en producción** (una llamada de humo a `^GSPC?interval=1wk&range=6y`).

---

## 4. ALINEACIÓN DE FECHAS (activo semanal + SP500 semanal)

**Dónde se hace el match hoy:**
- **C (`datos.js`):** match **exacto** por fecha, **sin forward-fill** — [datos.js:434](pages/api/datos.js#L434) `d.sp500Close = sp500Map[d.date] ?? null`. Si la fecha del activo no existe en el SP500 → `null`.
- **B gate (`multibacktest.js`):** **backward scan** — [461-462](pages/api/multibacktest.js#L461) busca la última barra del SP500 con `date <= entryDate`. Robusto a fechas no coincidentes (toma la anterior).
- **Filtros:** `buildAlignedCloses` hace **forward-fill** ([multibacktest.js:25-36](pages/api/multibacktest.js#L25)) y `buildAlignedWeekly` alinea semanal→diario con puntero ([multibacktest.js:39-53](pages/api/multibacktest.js#L39), y equivalente en [datos.js:203](pages/api/datos.js#L203)). Robustos.

**Riesgo de desalineación (real):** las velas semanales no tienen una fecha canónica única. Yahoo ancla la barra semanal al **inicio de semana (lunes)**; Stooq usa su propia convención (habitualmente el **fin de semana bursátil**). Como `fetchAV` es Stooq-primero con fallback Yahoo ([datos.js:40-106](pages/api/datos.js#L40)), y además `^GSPC→spy.us` en Stooq ([datos.js:27](pages/api/datos.js#L27)) mientras el activo puede venir de Yahoo (o viceversa), **activo y benchmark pueden llegar con anclajes de semana distintos** → en el match exacto de [datos.js:434](pages/api/datos.js#L434) muchas (o todas) las barras darían `sp500Close: null`.

**Consecuencia por ubicación:** en C las guardas del `useMemo` convertirían eso en `RS —` (degradación visible, no números erróneos). En B el backward scan lo tolera (toma la barra semanal anterior, error ≤1 vela). En los filtros, el forward-fill lo tolera.

**Robustez recomendada para Fase 2:** no confiar en el match exacto — para la inyección de `sp500Close` en semanal, usar el patrón forward-fill de `buildAlignedCloses` (o un puntero tipo `buildAlignedWeekly`) en lugar del lookup directo de [datos.js:434](pages/api/datos.js#L434). Con forward-fill, incluso con anclajes distintos, cada vela del activo recibe el último cierre semanal disponible del índice (error acotado a 1 semana, y 0 si las fuentes coinciden). Con eso, el caso ^GSPC-contra-sí-mismo da 0% cuando ambas series salen de la misma fuente, y ~0% si se mezclan fuentes.

---

## 5. ALCANCE Y ORDEN DE IMPLEMENTACIÓN (Fase 2)

**Independencia:** las tres son implementables por separado y en cualquier orden (confirma AUDIT_TRES_RS.md: sin constantes/funciones compartidas). No hay dependencia técnica entre A, B y C. Sí comparten un **patrón de riesgo**: en B y C la serie `sp500Data` es multi-consumidor.

**Orden de menor riesgo:**

1. **C — `datos.js` (primera; la más simple y la más visible).** Pedir una serie `^GSPC` a `assetInterval` para la inyección `sp500Close` ([306](pages/api/datos.js#L306)→pasar intervalo), **manteniendo la serie diaria para los filtros** ([339-341](pages/api/datos.js#L339)) o pidiendo ambas cuando difieran. Sustituir el match exacto de [434](pages/api/datos.js#L434) por forward-fill. Beneficio inmediato: el RS de cabecera y el `sp500Close` que ven las estrategias (incl. "28 Rebote RS") pasan a contar velas homogéneas. Prueba de humo natural: ^GSPC semanal ⇒ RS = 0,0%.
2. **B — `multibacktest.js` (segunda; cambio pequeño, más consumidores).** Pasar `assetInterval` a los `fetchData('^GSPC')` de [1255](pages/api/multibacktest.js#L1255)/[1621](pages/api/multibacktest.js#L1621) — con la misma separación de series: los resolvers de filtros ([1341](pages/api/multibacktest.js#L1341)/[1690](pages/api/multibacktest.js#L1690)) asumen `sp500Data` diario. El gate ([452-468](pages/api/multibacktest.js#L452)) quedará contando 63 **velas** coherentes en ambas patas. Revisar también qué pasa con `sp500BHCurve` ([1506](pages/api/multibacktest.js#L1506)/[1950](pages/api/multibacktest.js#L1950)) — en semanal, una B&H semanal es coherente con la curva del activo (probablemente deseable, pero es un cambio observable en la UI).
3. **A — `closes.js` (última; opcional).** Solo necesaria si el ranking se extiende a semanal. Añadir query param `interval` (default `1d`, retrocompatible) en [closes.js:11](pages/api/closes.js#L11)) y pasarlo desde las llamadas del ranking ([2740](pages/index.js#L2740)/[2866](pages/index.js#L2866)/[3083](pages/index.js#L3083)/[3097](pages/index.js#L3097)) — **sin tocar** las del tradelog ([1370](pages/index.js#L1370)/[1734](pages/index.js#L1734)). Ojo al ajuste de `days` (días naturales vs velas semanales: 63 velas ≈ 441+ días).

**Más simple:** B (dos argumentos nuevos; el fetcher ya soporta el intervalo) — *si no fuera* por los consumidores compartidos. Contando eso, **C es la más contenida** (un solo handler, un solo punto de inyección). **Más arriesgada:** B, por número de consumidores de `sp500Data` (filtros, B&H, gate, inyección a codeJs en dos paths — portfolioMode y normal).

**Efectos colaterales de caché/almacenamiento a vigilar:**
- `multibacktest.js` cachea datos auxiliares por clave **`${ticker}:${iv}`** (`filterAuxData`, [1341](pages/api/multibacktest.js#L1341)/[1690](pages/api/multibacktest.js#L1690)) — patrón correcto a imitar si se guardan dos series del SP500 (diaria+semanal); el `tickerCache` del portfolioMode ([1244-1249](pages/api/multibacktest.js#L1244)) se indexa **solo por ticker** y asume un único intervalo por request (válido, el intervalo es global a la request).
- No hay caché persistente de closes del SP500 en servidor (cada request re-descarga); en cliente, `wlData`/ranking guardan **scores derivados**, no los closes → sin invalidación necesaria.
- `priceCache`/tradelog usan `/api/closes` diario — no tocar.

---

### Resumen

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿La infraestructura soporta pedir ^GSPC semanal? | **Sí** — `fetchAV(interval 'w')` y `fetchData(interval '1wk')` ya existen | [datos.js:40-71](pages/api/datos.js#L40), [multibacktest.js:69](pages/api/multibacktest.js#L69) |
| ¿El timeframe está disponible en cada punto de fetch? | **Sí** en B y C (`assetInterval` en scope); en A habría que añadir query param | [datos.js:292](pages/api/datos.js#L292), [multibacktest.js:1216](pages/api/multibacktest.js#L1216)/[1610](pages/api/multibacktest.js#L1610), [closes.js:11](pages/api/closes.js#L11) |
| ¿Histórico semanal suficiente de ^GSPC? | Muy probable (misma ruta que activos semanales en uso; sin límite de rango en código) — **verificar en producción** | [datos.js:67-71](pages/api/datos.js#L67) |
| ¿El match por fecha aguanta semanal+semanal? | B y filtros sí (backward scan / forward-fill); **C no** (match exacto → nulls si los anclajes de semana difieren entre Stooq/Yahoo; nota: Stooq sirve SPY como ^GSPC) | [datos.js:434](pages/api/datos.js#L434), [datos.js:27](pages/api/datos.js#L27), [multibacktest.js:461](pages/api/multibacktest.js#L461), [multibacktest.js:25-36](pages/api/multibacktest.js#L25) |
| ¿Riesgo principal de Fase 2? | `sp500Data` es multi-consumidor (filtros diario + B&H + gate + inyección) → usar **serie separada por intervalo**, no mutar la única | [datos.js:339-341](pages/api/datos.js#L339), [multibacktest.js:1341](pages/api/multibacktest.js#L1341)/[1690](pages/api/multibacktest.js#L1690) |
| Orden recomendado | **C → B → A(opcional)**, independientes entre sí | punto 5 |
