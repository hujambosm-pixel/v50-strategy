# AUDITORÍA — RS del ranking (ubicación A) en semanal + ventana configurable

**Fecha:** 2026-07-11 · **Versión:** V9.621 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** viabilidad de que el RS del ranking del watchlist (A) funcione en semanal y su ventana sea configurable (velas, no días), como en C (cabecera) y B (gate), entendiendo el impacto en el Score de métricas.

**Veredicto:** A es **la más delicada de las tres**. Motivos: (1) el RS está **triplicado** (no duplicado como decía el audit previo); (2) las fuentes de timeframe son **mixtas** (unas ya respetan el intervalo, otras son siempre diarias); (3) el RS **no es columna visible**, alimenta el **Score agregado** que ordena el watchlist, así que cualquier cambio de ventana **reordena todos los activos**. El fix es análogo a B/C (closes.js acepta interval; ventana configurable con default 63) pero hay que tocar **tres copias** y cuidar el `days=300`.

---

## 1. LAS COPIAS DE A — son TRES, no dos

El cálculo de RS del ranking está **replicado en tres funciones** de `pages/index.js`, todas con la **misma fórmula** e **índice `-64` (63 velas)**:

| Copia | Función | RS (líneas) | Precio ACTIVO | SP500 |
|-------|---------|-------------|---------------|-------|
| A1 | `calcRanking` ([2717](pages/index.js#L2717)) | [2798-2805](pages/index.js#L2798) | `json.chartData` (backtest, **respeta timeframe**) | `closes.js` diario ([2744](pages/index.js#L2744)) |
| A2 | `calcRankingAllStrategies` ([2846](pages/index.js#L2846)) | [2924-2931](pages/index.js#L2924) | `json.chartData` (**respeta timeframe** per-estrategia) | `closes.js` diario ([2870](pages/index.js#L2870)) |
| A3 | `calcScoreMetSen` ([3075](pages/index.js#L3075)) | [3106-3113](pages/index.js#L3106) | `closes.js` diario ([3101](pages/index.js#L3101)) | `closes.js` diario ([3087](pages/index.js#L3087)) |

Fórmula común (idéntica en las tres):
```js
if (sp500Closes?.length>=64 && frPct>0) {
  const spLast = sp500Closes[len-1], sp63 = sp500Closes[len-64]     // ← -64 = 63 velas
  const spRet  = (spLast/sp63-1)*100
  const asset63 = priceArr.length>=64 ? priceArr[len-64] : priceArr[0]
  const assetRet = (lastP/asset63-1)*100
  relStrength = assetRet - spRet
}
```

- **¿Idénticas?** El **cálculo de RS** sí (mismo `-64`, mismos bounds). Difieren en **de dónde sale el precio del activo**: A1/A2 del `chartData` del backtest (que ya viene en el timeframe del activo), A3 de `closes.js` (siempre diario).
- **Todas** usan `closes.js` **diario** para el SP500 (`symbol=%5EGSPC&days=300`).
- **Confirmado:** si se hace configurable la ventana, **hay que tocar las tres** (A1, A2, A3) o quedarían desincronizadas (dos rankings con 63 y uno con N ≠ 63 darían órdenes distintos según qué botón se pulse).

---

## 2. CÓMO ENTRA EL RS EN EL SCORE

El RS (`relStrength`, en %) se combina así (idéntico en las tres, p.ej. [2809-2813](pages/index.js#L2809)):
```js
scoreMercado = clamp(
  norm(momentum,   -20, 40) * momPct +
  norm(relStrength, -30, 30) * frPct +      // ← RS normalizado con bounds FIJOS (-30%..+30%)
  norm(proximity52, 50, 100) * max52Pct
)
// ... y luego:
scoreFinal = clamp(scoreHistorico * wHistorico + scoreMercado * wMercado)
```

- **Normalización ABSOLUTA, no percentil.** `norm(relStrength, -30, 30)` mapea el RS% a 0-100 con **límites fijos** (-30% → 0, +30% → 100), **no** un ranking relativo entre activos. Cada activo se normaliza contra la misma escala fija.
- **Ponderación:** `× frPct` (peso `rankingFRPct`, default 33%, configurable), dentro de `scoreMercado`, que a su vez pesa `wMercado` (default 20%) frente a `scoreHistorico` (`wHistorico`, 80%).
- **PERO alimenta un score que ORDENA el watchlist.** Aunque la normalización sea absoluta, todos los activos comparten la misma ventana; **cambiar la ventana cambia el `relStrength` de cada activo → su `scoreMercado` → su score final → el orden relativo**. Es decir: hacer la ventana configurable **reordena el ranking de TODOS los activos** (con la ventana por defecto 63 en diario, el orden no cambia — ver punto 5).

---

## 3. PANTALLA "MANTENIMIENTO WATCHLIST"

- Título de la pantalla: `⊞ Mantenimiento Watchlist` — [WatchlistManager.js:649](components/WatchlistManager.js#L649).
- **El RS NO es columna propia.** No hay columna "RS"/"fuerza relativa" visible; el RS solo alimenta el **score agregado**:
  - `scoreMetricas` → columna "Score histórico/métricas" (ordena por [WatchlistManager.js:406](components/WatchlistManager.js#L406), muestra en [1503](components/WatchlistManager.js#L1503)).
  - `scoreMetSeñ` → columna "Score mét.+señales" (ordena por [407](components/WatchlistManager.js#L407), muestra en [1535](components/WatchlistManager.js#L1535)) — **esta es la que incluye el RS** (vía `scoreMercado`).
- → Cambiar la ventana RS afecta **solo la columna del score completo** (`scoreMetSeñ`) y el orden derivado; no hay una cifra de RS por-activo que actualizar en la tabla.
- **Texto "63 días" a actualizar:** en Ajustes → Ranking: `"Rendimiento del activo menos el del SP500 en los últimos 63 días"` — [SettingsModal.js:732](components/SettingsModal.js#L732). Único sitio de la UI que menciona la ventana de forma literal.

---

## 4. closes.js Y SEMANAL — mapa de llamadas

- **`closes.js`** recibe params por **query string**: `symbol`, `days` (default 300), `dates` ([closes.js:4](pages/api/closes.js#L4)). El intervalo está **hardcodeado** `interval=1d` en la URL de Yahoo ([closes.js:11](pages/api/closes.js#L11)).
- **Añadir `interval` sería retrocompatible:** un `?interval=1wk` opcional, con default `'1d'` si no se pasa → las llamadas actuales no cambian.
- **Mapa completo de llamadas a `/api/closes`:**

| Línea | Símbolo | days | Propósito | ¿Tocar para semanal? |
|-------|---------|------|-----------|----------------------|
| [1374](pages/index.js#L1374) | activo | 1800 (`dates=1`) | Tradelog — curva float posiciones abiertas | **NO — dejar diario** |
| [1738](pages/index.js#L1738) | activo | 1800 (`dates=1`) | Tradelog — curva float | **NO — dejar diario** |
| [2644](pages/index.js#L2644) | activo | 300 | Señales de mercado (caché `closesCache`) | Solo si esa señal va a semanal |
| [2744](pages/index.js#L2744) | ^GSPC | 300 | **SP500 del ranking A1** (`calcRanking`) | **SÍ** |
| [2870](pages/index.js#L2870) | ^GSPC | 300 | **SP500 del ranking A2** (`calcRankingAllStrategies`) | **SÍ** |
| [3087](pages/index.js#L3087) | ^GSPC | 300 | **SP500 del ranking A3** (`calcScoreMetSen`) | **SÍ** |
| [3101](pages/index.js#L3101) | activo | 300 | **Activo del ranking A3** (`calcScoreMetSen`) | **SÍ** (A3 saca el activo de aquí) |

- **Deben permanecer en diario (NO tocar):** las dos del **tradelog** ([1374](pages/index.js#L1374), [1738](pages/index.js#L1738)) — construyen la curva flotante de posiciones abiertas, que es diaria por diseño.
- **Aviso del `days`:** hoy `days=300` (≈300 velas diarias). Con ventana N configurable y semanal, `days=300` diarios ≈ solo ~43 semanas; para 63 **velas semanales** hacen falta ≥64 semanas ≈ **448 días naturales**. → Al pasar a semanal (o subir N), hay que **escalar `days`** (p.ej. `days = max(300, (N+margen) × (semanal?7:1) × 1.5)`), o Yahoo no devolvería suficientes barras y el `length>=64` fallaría (RS omitido).

---

## 5. IMPACTO Y PLAN (descrito, NO implementado)

### ¿Cambiaría el ranking en diario?
**No, si se hace bien.** Con la ventana por defecto **63** y timeframe diario:
- A1/A2: el activo ya sale de `chartData` diario y el SP500 de `closes.js` diario → sustituir `-64` por `-(N+1)` con N=63 da el **mismo índice** → resultados idénticos.
- A3: activo y SP500 de `closes.js` diario → idem.
→ **Test anti-regresión:** ranking en diario con default 63 = bit-a-bit igual. **El default debe seguir siendo 63.**

### ¿Dónde viviría el control?
En **Ajustes → Ranking**, junto a `rankingFRPct` ([SettingsModal.js:723-732](components/SettingsModal.js#L723)): un nuevo `settings.ranking.rankingRsWindow` (default 63), leído en las tres copias como `sett.ranking?.rankingRsWindow ?? 63` (mismo patrón que `rankingMomentumN`, [2732](pages/index.js#L2732)/[2859](pages/index.js#L2859)/[3083](pages/index.js#L3083)). Persistido en `v50_settings` (localStorage), igual que el resto del ranking. Y actualizar el texto "63 días" → "N velas".

### ¿De dónde saldría el timeframe?
**Hoy es mixto** (no hay un toggle único del ranking):
- A1 (`calcRanking`) pide el activo a `/api/datos` con `intervalo:estrategiaIntervalo` (el global) → chartData en ese timeframe.
- A2 (`calcRankingAllStrategies`) usa el intervalo **de cada estrategia** (`stratIntv` de sus params, [2884](pages/index.js#L2884)/[2894](pages/index.js#L2894)).
- A3 (`calcScoreMetSen`) es **siempre diario** (todo de `closes.js`).
→ Lo natural: que **el SP500 se pida al mismo intervalo que el activo de cada función** (A1→`estrategiaIntervalo`, A2→`stratIntv`, A3→el intervalo que se decida para A3). No hace falta un toggle nuevo; se reutiliza el intervalo que ya usa cada función para el activo. (A3 es el caso a decidir: hoy es 100% diario; si se quiere semanal, activo Y SP500 a semanal.)

### ¿El bug "SP500 siempre diario" afecta a A?
**Sí, en A1/A2 cuando el timeframe es semanal — y ya ocurre HOY.** El activo de A1/A2 viene de `chartData` (semanal si la estrategia es semanal), pero el SP500 de `closes.js` es diario → se comparan 63 semanas del activo vs 63 días del índice, exactamente el mismo desajuste que arreglamos en B y C. La **solución es análoga:** `closes.js` acepta `interval` y se le pasa el intervalo del activo. A3 hoy no sufre el bug (activo y SP500 ambos diarios), pero tampoco reflejaría semanal.

### Enfoque de menor riesgo
1. `closes.js`: añadir query param `interval` (default `'1d'`, retrocompatible) + escalar `days` según intervalo/N ([closes.js:4-11](pages/api/closes.js#L4)).
2. Ventana configurable: `settings.ranking.rankingRsWindow` (default 63); reemplazar el índice literal `-64` por `-(N+1)` en **las tres** copias ([2801/2803](pages/index.js#L2801), [2926/2928](pages/index.js#L2926), [3108/3110](pages/index.js#L3108)) — y el guard `length>=64` por `length>=N+1`.
3. Timeframe del SP500 = intervalo del activo de cada función (A1→`estrategiaIntervalo`, A2→`stratIntv`, A3→decisión).
4. UI: control de ventana en Ajustes→Ranking + texto dinámico (fuera "63 días").

### Qué NO debe cambiar
- **Ranking en diario con N=63 → idéntico** (defaults preservan el comportamiento actual).
- **Tradelog** ([1374](pages/index.js#L1374)/[1738](pages/index.js#L1738)) sigue en diario.
- **Pesos y bounds de normalización** (`norm(relStrength,-30,30)`, `frPct`, `wMercado`…) **sin tocar** — solo cambia la ventana del RS, no cómo se pondera.
- **Las tres copias en sincronía:** misma ventana y mismo intervalo en A1/A2/A3, o el usuario vería rankings distintos según el botón.

---

### Resumen
- **A está TRIPLICADA:** `calcRanking` ([2798](pages/index.js#L2798)), `calcRankingAllStrategies` ([2924](pages/index.js#L2924)), `calcScoreMetSen` ([3106](pages/index.js#L3106)) — tocar las tres o desincronizan.
- **RS → normalización absoluta (bounds -30..30) × frPct → scoreMercado → score que ordena el watchlist** (no es columna propia; afecta a `scoreMetSeñ`).
- **closes.js** fijo a `1d` ([closes.js:11](pages/api/closes.js#L11)); añadir `interval` es retrocompatible; ojo al `days=300` (insuficiente en semanal).
- **Bug SP500-diario afecta a A1/A2 en semanal ya hoy;** solución análoga a B/C.
- **Plan:** ventana configurable (default 63) en las 3 copias + SP500 al intervalo del activo + `closes.js` con `interval`/`days` escalado + texto UI. Diario con default 63 = sin regresión.
