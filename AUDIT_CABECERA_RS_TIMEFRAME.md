# AUDITORÍA — Cabecera del gráfico con timeframe y RS configurable

**Fecha:** 2026-07-10 · **Versión:** V9.609 · **Alcance:** read-only, sin cambios de código.
**Objetivo:** viabilidad de añadir a la cabecera del gráfico de velas 3 elementos: (1) timeframe activo (D/W), (2) RS del activo vs SP500 como número puntual, (3) input editable de nº de velas de la ventana RS (indicador visual, independiente de cualquier estrategia).

**Veredicto rápido:** **viable sin refactor grande.** Los datos necesarios (`close` + `sp500Close` por barra) ya están en `result.chartData`, en el mismo scope donde se renderiza la cabecera; el timeframe ya vive en un estado accesible; las barras ya llegan agregadas al timeframe activo. Únicos matices: la cabecera está **duplicada** (normal + fullscreen) y el SP500 se descarga **siempre diario** (afecta al RS en semanal).

---

## 1. CABECERA DEL GRÁFICO (dónde se renderiza el nombre del activo)

La cabecera es una **"barra de info integrada"** de 30px superpuesta sobre el gráfico, renderizada en `pages/index.js` (no en `CandleChart.js`):

- Contenedor: [index.js:7108-7113](pages/index.js#L7108) (`position:absolute, top:0, height:30, pointerEvents:'none'`).
- ★ favorito: [index.js:7114-7126](pages/index.js#L7114).
- **Ticker (nombre del activo, ej. "NVDA")**: [index.js:7127-7133](pages/index.js#L7127) — `{displayedSimbolo||simbolo}`, clic abre TradingView.
- Botón "+" añadir a watchlist: [index.js:7134-7139](pages/index.js#L7134).
- Leyenda OHLC dinámica (la escribe `CandleChart` vía `externalLegendRef={chartLegendRef}`): [index.js:7140-7142](pages/index.js#L7140).
- Etiqueta de estrategia activa: [index.js:7143-7149](pages/index.js#L7143).

**¿Compartida entre vistas?** Sí, esta cabecera es **única** para todas las vistas de gráfico individual: **Watchlist individual, Risk MGMT y bareChart** se sirven con **una sola instancia** de `CandleChart` ([index.js:7219](pages/index.js#L7219), `data={result.chartData}`), y esta cabecera va delante de ella. Las diferencias entre vistas se resuelven por props (`isBareChart`, `sidePanel==='risk'`), no con cabeceras separadas. → **Añadir algo aquí aparece en las tres vistas de golpe.**

**Excepción — duplicado en fullscreen:** existe una **segunda copia** de la barra en el overlay de pantalla completa: [index.js:7275-7300](pages/index.js#L7275) (con su propia instancia de `CandleChart` en [index.js:7371](pages/index.js#L7371)). Comparte estructura (★, ticker, `chartLegendRef`, estrategia) pero es un bloque JSX aparte. → Para que los 3 elementos también salgan en fullscreen habría que **replicarlos en este segundo bloque**. Son los dos únicos sitios (grep de `<CandleChart` y `chartLegendRef` → solo 7219/7371 y 7141/7294).

---

## 2. TIMEFRAME ACTIVO

- Estado: **`estrategiaIntervalo`** — [index.js:778](pages/index.js#L778): `const [estrategiaIntervalo, setEstrategiaIntervalo] = useState('diario')`.
- Valores: **`'diario'` | `'semanal'`** (string). El toggle de la barra lateral lo actualiza; se envía a la API como `intervalo:estrategiaIntervalo` ([index.js:2713](pages/index.js#L2713)).
- (Nota: el multibacktest usa un estado separado `mcIntervalo` en [index.js:966](pages/index.js#L966); no es el de la vista individual.)
- **Accesible desde la cabecera:** sí. `estrategiaIntervalo` es un estado de nivel superior del componente de `index.js`, y la cabecera (7108) se renderiza dentro del mismo componente → disponible directamente. Solo hay que mapear `'diario'→'D'` / `'semanal'→'W'` para mostrarlo.

---

## 3. DATOS DISPONIBLES PARA EL RS

**Sí están a mano, sin plumbing nuevo.** La cabecera vive en el mismo scope donde `result` está disponible (es lo que se pasa a `CandleChart` en [index.js:7220](pages/index.js#L7220), `data={result.chartData}`).

- `result.chartData` es un array de barras con, por barra:
  - `close` (cierre del activo) y OHLC — vienen de los datos base.
  - **`sp500Close`** — inyectado por barra en el backend: [datos.js:434](pages/api/datos.js#L434) `d.sp500Close = sp500Map[d.date] ?? null`, y **conservado** en `chartData` porque el map hace spread `{...d, …}` ([datos.js:550-551](pages/api/datos.js#L550)). Es el mismo campo que ya consumen las estrategias #2/#3 y B1.
- Por tanto, el cálculo `RS = (close[i]/close[i-N] - 1) - (sp500Close[i]/sp500Close[i-N] - 1)` se puede hacer **en el propio render de la cabecera** leyendo `result.chartData`, sin subir estado ni pasar props nuevas.
- La serie del SP500 se construye en [datos.js:305-308](pages/api/datos.js#L305) (`fetchAV('^GSPC', …)` → `sp500Map[fecha]=close`) y se devuelve embebida como `sp500Close` por barra en `chartData` ([datos.js:592](pages/api/datos.js#L592)).

**Caveat:** `sp500Close` puede ser `null` en barras sin match de fecha → el cálculo del RS debe **guardar nulls** y el borde de "no hay N velas" (igual criterio que B1).

---

## 4. TIMEFRAME Y DATOS (¿barras ya semanales?)

**El activo llega YA agregado al timeframe activo.** [datos.js:292-293](pages/api/datos.js#L292): `assetInterval = intervalo === 'semanal' ? 'w' : 'd'` → `fetchAV(simbolo, …, assetInterval)`, que pide a Yahoo `1wk` cuando es semanal ([datos.js:67](pages/api/datos.js#L67)). Es decir, `result.chartData` **ya son velas semanales** en modo Semanal. → **Contar "20 velas" respeta el timeframe automáticamente** (20 velas = 20 semanas), sin gestión extra.

**Matiz importante (afecta al RS en semanal):** el SP500 se descarga **siempre en diario** — [datos.js:306](pages/api/datos.js#L306) `fetchAV('^GSPC', years + 1)` **sin** argumento de intervalo (default `'d'`), y se indexa por fecha (`sp500Map[d.date]`). Cuando el activo es semanal, sus barras tienen fecha del **primer día de la semana**; ese día suele ser hábil, así que el match `sp500Map[fechaSemanal]` normalmente existe (usa el cierre diario de ese día como proxy del punto semanal). Consecuencias:
- El RS semanal se calcula punto-a-punto sobre fechas alineadas (cierre del activo vs cierre diario del SP500 en esa misma fecha) → **internamente consistente**.
- Pero **no** es una serie semanal "real" del SP500, y en fechas sin match exacto `sp500Close` será `null` (por eso el cálculo debe tolerar nulls). Si se quisiera un SP500 semanal estricto habría que pedir `^GSPC` en `'w'` — cambio en `datos.js` (fuera del alcance de la cabecera, y **no imprescindible** para un indicador visual).

---

## 5. VIABILIDAD Y UBICACIÓN

**Viable sin refactor grande.** Enfoque de menor riesgo:

- **(1) Timeframe D/W** — coste **mínimo**. `estrategiaIntervalo` ya en scope ([index.js:778](pages/index.js#L778)); solo añadir un `<span>` en la cabecera con `estrategiaIntervalo==='semanal'?'W':'D'`. Sin estado nuevo, sin datos nuevos.
- **(2) RS puntual** — coste **bajo**. Calcular en un `useMemo` desde `result.chartData` (últimas `N` velas): `RS = retActivo(N) - retSP500(N)`, con `close` y `sp500Close`; color verde/rojo según signo. Guardar nulls y "N insuficiente" (mostrar "—"/"n/a"). Independiente del `rsWindow` de estrategias (usa su propia ventana visual). Respeta timeframe automáticamente (punto 4).
- **(3) Input de nº de velas** — coste **medio** (el más caro de los tres). Necesita **estado nuevo**, p.ej. `const [rsVisualWindow,setRsVisualWindow]=useState(20)` junto al resto de estados de `index.js` (~[índice 770-970](pages/index.js#L770)). El `<input>` debe llevar `pointerEvents:'all'` porque el contenedor de la cabecera tiene `pointerEvents:'none'` ([index.js:7113](pages/index.js#L7113)) — igual que ya hacen ★/ticker/"+". El RS del punto (2) se recalcula al cambiar `rsVisualWindow`.

**Dónde vive el estado nuevo:** `rsVisualWindow` como estado de nivel superior en `index.js` (junto a `estrategiaIntervalo`), para que sea accesible por la cabecera y persista al cambiar de activo. Default 20.

**Obstáculos / consideraciones (menores, ninguno bloqueante):**
1. **Cabecera duplicada** (normal [7108] + fullscreen [7275]): para cubrir fullscreen hay que añadir los 3 elementos también allí. Si solo se quiere en la vista normal, un único bloque basta. *(Recomendación: extraer los 3 elementos a un pequeño sub-render/función local reutilizada en ambos bloques para no divergir.)*
2. **Espacio horizontal**: la barra es de 30px con la leyenda OHLC en `flex:1` ([7141](pages/index.js#L7141)); añadir 3 elementos compite por ancho y en paneles estrechos podría truncar. Colocarlos tras el ticker y antes de la leyenda, con `flexShrink:0`.
3. **RS en semanal**: usa SP500 diario matcheado por fecha (punto 4); aceptable para un indicador visual, con guardas de null.

**Ranking de coste:** timeframe (trivial) < RS puntual (cálculo + guardas) < input (estado nuevo + `pointerEvents` + layout). Ninguno exige tocar el motor de backtest ni `pages/api/*`.

---

### Resumen de citas
- Cabecera (ticker/★/leyenda): [index.js:7108-7149](pages/index.js#L7108); duplicado fullscreen [index.js:7275-7300](pages/index.js#L7275).
- Instancias de `CandleChart`: normal [index.js:7219](pages/index.js#L7219), fullscreen [index.js:7371](pages/index.js#L7371).
- Estado timeframe: [index.js:778](pages/index.js#L778) (`estrategiaIntervalo`, `'diario'|'semanal'`).
- Datos RS: `result.chartData` con `close` + `sp500Close` — inyección [datos.js:434](pages/api/datos.js#L434), conservación [datos.js:550-551](pages/api/datos.js#L550), retorno [datos.js:592](pages/api/datos.js#L592).
- Agregación timeframe activo: [datos.js:292-293](pages/api/datos.js#L292) + [datos.js:67](pages/api/datos.js#L67); SP500 siempre diario: [datos.js:306](pages/api/datos.js#L306).
