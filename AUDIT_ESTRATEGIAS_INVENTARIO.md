# AUDITORÍA — Inventario analítico de estrategias en Supabase

**Fecha:** 2026-07-10 · **Versión:** V9.608 · **Alcance:** read-only (solo `SELECT`, sin escrituras).
**Objetivo:** mapear las 62 estrategias existentes y determinar si alguna ya cumple el rol B1/Rol 2 buscado: **"rebote desde corrección en un activo fuerte vs mercado (fuerza relativa)"**.

**Fuente de datos:** tabla `strategies` de Supabase, columnas relevantes `id, name, active, params, code_js, definition`. Auth = anon key (`SUPABASE_URL` + `SUPABASE_ANON_KEY` de `.env.local`, mismo mecanismo que [pages/api/strategies.js:4-21](pages/api/strategies.js#L4)). Consultado vía REST `/rest/v1/strategies?select=...` sin el filtro `active=eq.true` para incluir también las deshabilitadas.

**Total:** 62 estrategias (**58 habilitadas**, **4 deshabilitadas**: `R-V50 EMA10/11 (SP500 over EMA)`, `R-V50 EMA10/11`, `13 RSI 9 (cruces)`, `22 MACD cualquier giros histrograma`).

---

## TABLA RESUMEN

| # | Estrategia | Hab. | Entrada | Salida | ¿Rebote? | ¿Filtro RS? |
|---|-----------|------|---------|--------|----------|-------------|
| 1 | R-V50 EMA10/11 (SP500 over EMA) | No | (vacía / sin code_js) | — | No | No |
| 2 | R-V50 EMA10/11 | No | cruce alcista EMA rápida/lenta + breakout | cierre bajo EMA (stop técnico) | No | No |
| 3 | 1 V50 EMA10/11 | Sí | cruce alcista EMA rápida/lenta + breakout | cierre bajo EMA (stop técnico) | No | No |
| 4 | 2 V50f1 EMA10/11 (SP500 over EMA) | Sí | cruce alcista EMA10/11 + breakout | cierre bajo EMA (stop técnico) | No | No (filtro **tendencia** índice SP500) |
| 5 | 3 V50f2 EMA10/11 (SP500 Fast over slow) | Sí | cruce alcista EMA10/11 + breakout | cierre bajo EMA (stop técnico) | No | No (filtro **tendencia** índice SP500) |
| 6 | **4 V50 EMA10/11 (buy the dip)** | Sí | cruce EMA10/11+breakout **SOLO tras caída ≥ddFilterPct desde pico** | cierre bajo EMA (stop técnico) | **Sí (dip / drawdown)** | No |
| 7 | 5 V50 EMA10 breakouts | Sí | breakout de máximos / sobre EMA | cierre bajo EMA / breakdown | No | No |
| 8 | 6 Dual MACD | Sí | cruce/giro MACD alcista (diario+semanal) | cruce/giro bajista MACD o trailing | No | No |
| 9 | 7 MACD crossovers | Sí | cruce alcista línea/señal MACD | cruce bajista MACD | No | No |
| 10 | 8 MACD Reentradas | Sí | cruce alcista MACD (+ reentradas) | cruce bajista MACD o trailing | No | No |
| 11 | 9 EMA10/20+50 crossovers | Sí | cruce de EMAs (10/20/50) | cruce bajista EMAs | No | No |
| 12 | 10 EMA10/20 crossovers | Sí | cruce de EMAs (10/20) | cruce bajista EMAs | No | No |
| 13 | 11 EMA10/20 crossover+belowEMA20 | Sí | cruce EMAs + precio bajo EMA20 | cruce bajista EMAs | No | No |
| 14 | 12 EMA10 price breakout | Sí | breakout sobre EMA10 | cierre bajo EMA / breakdown | No | No |
| 15 | 9.2 EMA10/20+50 crossovers | Sí | cruce de EMAs (10/20/50) | cruce bajista EMAs | No | No |
| 16 | 0 No Strategy | Sí | (sin lógica / placeholder) | — | No | No |
| 17 | 13 RSI 9 (cruces) | No | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA (trailing) | No | No |
| 18 | 13 RSI (cruces) con stop técnico | Sí | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA (trailing) | No | No |
| 19 | 13.1 RSI (cruces) sin stop técnico | Sí | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA | No | No |
| 20 | **13.2 RSI (giro sobreventa) con stop técnico** | Sí | **RSI gira al alza estando <osLevel (sobreventa)** | cruce bajista RSI/MA (trailing) o stop | **Sí (giro sobreventa)** | No |
| 21 | aaaaaaaaaaaaaa | Sí | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA (trailing) | No | No |
| 22 | Copia2 (salida al cierre del cruce bajista) | Sí | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA (cierre) | No | No |
| 23 | Copia de aaaaaaaaaaaaaa | Sí | cruce alcista RSI sobre su MA + breakout | cruce bajista RSI/MA (trailing) | No | No |
| 24 | Copia3 (open barra siguiente al cruce) | Sí | cruce alcista RSI sobre su MA | cruce bajista RSI/MA (trailing) | No | No |
| 25 | Copia4 (open siguiente, filtro dist. mín.) | Sí | cruce alcista RSI sobre su MA (+minDist) | cruce bajista RSI/MA (trailing) | No | No |
| 26 | Copia5 Pre-cruce inminente | Sí | RSI a N puntos de cruzar su MA (anticipa cruce) | cruce bajista RSI/MA (trailing) | No | No |
| 27 | Copia6 ("IN") Pre-cruce inminente | Sí | RSI a N puntos de cruzar su MA (anticipa cruce) | cruce bajista RSI/MA (trailing) | No | No |
| 28 | **Copia3.1 (acelerada)** | Sí | cruce RSI/MA **+ señal acelerada: giro en sobreventa** | cruce bajista RSI/MA + giro sobrecompra | **Parcial (giro sobreventa 2ª señal)** | No |
| 29 | **Copia3.2 (acelerada sin cancelación)** | Sí | cruce RSI/MA **+ señal acelerada: giro en sobreventa** | cruce bajista RSI/MA + giro sobrecompra | **Parcial (giro sobreventa 2ª señal)** | No |
| 30 | 14 Trend trailing stop. | Sí | breakout / tendencia EMA | trailing stop | No | No |
| 31 | 15 EMA225 breakouts | Sí | breakout sobre EMA225 | cierre bajo EMA / breakdown | No | No |
| 32 | 16 EMA 20/50 breakouts | Sí | breakout con EMA rápida/lenta (20/100) | cierre bajo EMA / breakdown | No | No |
| 33 | 17 MACD + EMA100 | Sí | cruce MACD alcista con filtro EMA100 | cruce bajista MACD o trailing | No | No |
| 34 | 18 MACD histograma trailing stop | Sí | giro alcista histograma MACD | trailing stop | No | No |
| 35 | 19 MACD histograma trailing stop (re-entradas) | Sí | giro alcista histograma MACD (+reentradas) | trailing stop | No | No |
| 36 | 20 MACD histograma+línea trailing (re-entradas) | Sí | giro alcista histograma+línea MACD | trailing stop | No | No |
| 37 | 21 MACD cualquier giros línea | Sí | cualquier giro alcista de la línea MACD | giro bajista línea o trailing | No | No |
| 38 | 22 MACD cualquier giros histrograma | No | cualquier giro alcista del histograma MACD | giro bajista o trailing | No | No |
| 39 | 22 Bollinger + ATR | Sí | ruptura de banda Bollinger (tras squeeze) | trailing ATR | No | No |
| 40 | 18.1 MACD histograma trailing (2 velas low) | Sí | giro alcista histograma MACD | trailing (2 velas low) | No | No |
| 41 | 19.1 MACD histograma trailing (2 velas low, re-ent) | Sí | giro alcista histograma MACD | trailing (2 velas low) | No | No |
| 42 | 23 EMA20 breakouts | Sí | breakout sobre EMA20 (semanal) | cierre bajo EMA / breakdown | No | No |
| 43 | 23.3 EMA20/MACD (2 velas low) | Sí | MACD alcista + EMA20 | trailing (2 velas low) | No | No |
| 44 | 24 Jesse Livermore | Sí | ruptura de pivote + confirmación de volumen | trailing / pivote | No | No |
| 45 | **25 desviación EMA10 con filtro EMA100** | Sí | **precio>EMA100 y precio ≤ EMA10−2·ATR (desviación bajista)** | revierte a EMA10 (target) / stop EMA100 | **Sí (desviación / mean-reversion)** | No |
| 46 | 26 MACD only (1º pullback) | Sí | 1er pullback de MACD dentro de tramo alcista | cruce bajista MACD o trailing | No (pullback de momentum, no corrección) | No |
| 47 | 26.1 MACD only (1 entrada por ventana alcista) | Sí | 1 entrada MACD por ventana alcista | cruce bajista MACD | No | No |
| 48 | 27.1 Impulse MACD (salida cero + stop emerg.) | Sí | Impulse MACD alcista | cruce de línea a cero + stop emergencia | No | No |
| 49 | 23.2 EMA20/ImpulseMACD (2 velas low) | Sí | Impulse MACD alcista + EMA20 | salida cero / trailing | No | No |
| 50 | 27 Impulse MACD (salida cero) | Sí | Impulse MACD alcista | cruce de línea a cero | No | No |
| 51 | 27.2 MACD (salida cero + stop emerg.) | Sí | cruce MACD alcista | cruce de línea a cero + stop emergencia | No | No |
| 52 | 27.3 MACD (salida cero) | Sí | cruce MACD alcista | cruce de línea a cero | No | No |
| 53 | 18.2 Impulse MACD histograma trailing (2 velas low) | Sí | Impulse MACD alcista | trailing (2 velas low) | No | No |
| 54 | AA ETF inverso del SP500 | Sí | SP500 bajo su EMA50 (opera ETF inverso) | SP500 recupera EMA50 | No | No (tendencia índice, no RS) |
| 55 | 1.1 V50 MACD + EMA10/11 | Sí | cruce EMA10/11 confirmado con MACD | cierre bajo EMA / cruce MACD | No | No |
| 56 | 1.2 V50 EMA10/11 (pendientes alcista) | Sí | cruce EMA10/11 con pendientes alcistas | cierre bajo EMA / breakdown | No | No |
| 57 | 27.4 cruces MACD | Sí | cruce alcista MACD | cruce bajista MACD | No | No |
| 58 | 1.3 V50 EMA10/11 (entradas next open) | Sí | cruce EMA10/11 + breakout (entra next open) | cierre bajo EMA (stop técnico) | No | No |
| 59 | 1.4 V50 EMA10/11 (entradas close same day) | Sí | cruce EMA10/11 + breakout (entra al cierre) | cierre bajo EMA (stop técnico) | No | No |
| 60 | 23.1 EMA10 breakouts | Sí | breakout sobre EMA10 (semanal) | cierre bajo EMA / breakdown | No | No |
| 61 | 1.5 V50 precio>EMA20 + trailing EMA10 | Sí | precio > EMA20 | trailing EMA10 | No | No |
| 62 | 18.1.1 MACD histograma trailing (2 velas low) | Sí | giro alcista histograma MACD | trailing (2 velas low) | No | No |

> Nota: entradas/salidas de variantes near-duplicadas (familias V50, MACD, RSI) se describen por arquetipo; los sufijos (2 velas low, re-entradas, next open, salida cero…) son ajustes de timing/gestión sobre el mismo gatillo.

---

## 1. LISTAR

- **Tabla:** `strategies`. **Columnas:** `id` (uuid), `name`, `active` (bool, soft-delete), `params` (JSON string con los parámetros), `code_js` (cuerpo `function run(bars, params){…}`), `definition`, `created_at`, etc.
- **Auth:** anon key de Supabase (`apikey` + `Authorization: Bearer <anon>`), idéntico a [pages/api/strategies.js:8-17](pages/api/strategies.js#L8). El endpoint `/api/strategies` (GET) filtra `active=eq.true`; para el inventario consulté el REST directamente **sin** ese filtro para incluir las 4 deshabilitadas.
- **Params por estrategia:** extraídos íntegros (ver arriba y el escaneo). Ejemplos: familia V50 → `{emaR:10,emaL:11,sinPerdidas,reentry,stopLoss:'tecnico_ema'}`; MACD → `{macdFast:12,macdSlow:26,macdSignal:9}`; RSI → `{rsiPeriod:9,maPeriod:9|5,obLevel:75,osLevel:25}`; #4 añade `ddFilterPct:5`; #25 usa `{ema10Period:10,ema100Period:100,atrPeriod:14,atrMult:1}`.

---

## 2. CLASIFICACIÓN POR TIPO DE ENTRADA

Arquetipos detectados (leyendo `code_js`):

- **Cruce de medias + breakout (familia V50 EMA10/11)** — #3,#4,#5,#6(dip),#58,#59,#55,#56,#61 y las R-V50 deshabilitadas. Entrada: `emaR` cruza al alza sobre `emaL` y el precio rompe el máximo previo. Salida: cierre bajo la EMA (stop técnico `tecnico_ema`).
- **Cruce de EMAs puro** — #11,#12,#13,#15 (EMA10/20/50). Entrada por cruce; salida por cruce bajista.
- **Breakout de EMA/máximos** — #7,#14,#31,#32,#42,#60,#30,#61. Entrada al superar EMA/máximos; salida por breakdown bajo la EMA.
- **MACD (cruces / giros de línea o histograma)** — #8,#9,#10,#33,#34,#35,#36,#37,#38,#40,#41,#43,#46,#47,#51,#52,#55,#57,#62 y variantes "salida cero". Entrada por cruce alcista línea/señal o giro alcista del histograma; salida por giro/cruce bajista o trailing. Subfamilia **Impulse MACD** (#48,#49,#50,#53): impulso alcista, salida al cruzar la línea a cero.
- **RSI (cruces)** — #17,#18,#19,#21,#22,#23,#24,#25,#26,#27. Entrada: RSI cruza al alza sobre su media; salida: cruce bajista RSI/MA (trailing). Variantes de timing (open siguiente, pre-cruce, distancia mínima).
- **RSI (giro en sobreventa)** — #20 (y como 2ª señal "acelerada" en #28,#29). Entrada: RSI gira al alza **estando bajo `osLevel`**.
- **Bollinger / volatilidad** — #39 (ruptura de banda tras squeeze, trailing ATR).
- **Desviación / mean-reversion** — #45 (precio muy por debajo de EMA10, dentro de tendencia EMA100).
- **Pivotes / breakout estructural** — #44 (Jesse Livermore: ruptura de pivote + volumen).
- **Tendencia del índice (no del activo)** — #54 (ETF inverso: opera cuando el SP500 pierde su EMA50).
- **Vacías / placeholder** — #1 (sin `code_js`), #16 (No Strategy).

---

## 3. FOCO EN CORRECCIÓN / REBOTE (mean-reversion vs momentum)

Estrategias que entran **DESPUÉS de una caída, esperando rebote** (mean-reversion), frente a la gran mayoría que entra **siguiendo un movimiento alcista** (momentum/tendencia):

- **#4 "V50 EMA10/11 (buy the dip)"** — híbrida. Requiere que el activo haya caído **≥ `ddFilterPct` (5%) desde su pico reciente** (`ddActivo`) para *habilitar* la entrada; pero el **gatillo** sigue siendo el cruce alcista EMA10/11 + breakout. Es "compra en corrección **confirmada por momentum**". → **rebote desde corrección**, sí, pero con disparo de continuación alcista, no de reversión pura.
- **#25 "desviación EMA10 con filtro EMA100"** — **mean-reversion pura**: entra cuando `precio > EMA100` (tendencia de fondo) **y** `precio ≤ EMA10 − 2·ATR` (desviación bajista fuerte = sobreventa técnica). Sale al **revertir a la media** (`high ≥ EMA10`) o stop en EMA100. Es el ejemplo más claro de "comprar el retroceso y vender el rebote".
- **#20 "RSI (giro sobreventa)"** — rebote por **sobreventa**: entra cuando el RSI, estando **bajo `osLevel` (25)**, gira al alza (`rsiP < rsiP2 && rsiC > rsiP && rsiP < osLevel`). Rebote clásico de oscilador, pero **sin filtro de tendencia ni de fuerza**.
- **#28/#29 (Copia3.1/3.2)** — RSI por cruce con una **2ª señal acelerada** de giro en sobreventa. Rebote presente, pero como añadido al cruce.

**Distinción RSI importante:** la mayoría de la familia RSI (#17,#18,#19,#21–#27) usa el RSI como **cruce sobre su media móvil** (señal de momentum que puede darse en cualquier nivel), **no** como sobreventa. Solo **#20** (y la 2ª señal de #28/#29) usa el RSI como **sobreventa = comprar rebote**. "Usa RSI" ≠ "usa RSI como señal de rebote".

**Falsos amigos:** #46 "MACD only (1º pullback)" — el "pullback" es un retroceso *del MACD* dentro de un tramo alcista (momentum), no una corrección del precio para rebotar. #21/#22 "cualquier giros" son giros del MACD, no sobreventa.

---

## 4. FILTRO DE FUERZA RELATIVA vs SP500

**Ninguna estrategia usa fuerza relativa real** (comparar el **retorno del activo** contra el **retorno del índice**). Lo que existe es distinto:

- **#4 (2 V50f1) y #5 (3 V50f2)** — usan `bar.sp500Close` para calcular una **EMA del propio índice** y **filtran** las entradas según si el SP500 está sobre su EMA (`sp500Price vs sp500Ema`) o si su EMA rápida está sobre la lenta. Es un **filtro de tendencia del mercado** (régimen alcista/bajista del índice), **no** fuerza relativa del activo.
- **#54 (AA ETF inverso)** — calcula la EMA50 del SP500 para decidir cuándo el índice es bajista y operar un ETF inverso. Otra vez **tendencia del índice**, no comparación activo-vs-índice.
- **#39 (Bollinger)** menciona "ancho relativo" de bandas — sin relación con el SP500 (falso positivo).

Importante: el concepto **`fuerza_relativa`** SÍ existe en el proyecto, pero **fuera de las estrategias**: es un criterio de **priorización de cartera** en el multibacktest (modo Concentrado), calculado como alfa del activo vs SP500 en el backend ([multibacktest.js:456-468](pages/api/multibacktest.js#L456)). Es un **gate de asignación de capital entre activos**, no una condición de entrada dentro de ninguna estrategia.

**Dato útil para el fix:** cada barra ya trae `d.sp500Close` (lo inyecta [datos.js](pages/api/datos.js) y lo consumen #4/#5/#54), así que una estrategia nueva podría calcular fuerza relativa (retorno activo vs retorno SP500 en una ventana) **sin plumbing nuevo de datos**.

---

## 5. HUECO REAL

**No existe ninguna estrategia que capture "rebote desde corrección en un activo fuerte vs mercado".** El rol B1/Rol 2 está **vacío**. Lo más cercano cubre solo una de las dos mitades:

| Componente buscado | ¿Existe? | Dónde |
|---|---|---|
| Rebote desde corrección (comprar el retroceso) | **Sí** | #25 (desviación/mean-rev), #4 (dip drawdown), #20 (sobreventa RSI) |
| Filtro de fuerza relativa vs SP500 (activo bate al mercado) | **No** (solo filtro de *tendencia* del índice) | #4/#5 filtran régimen del índice; ninguno mide alfa del activo |
| **Combinación de ambos** | **No existe** | — |

**Qué le faltaría a lo existente para cumplir el rol:**
- Partir de **#25** (mean-reversion más limpia: "corrección dentro de tendencia") o **#4** (dip + confirmación) y **añadir un filtro de fuerza relativa**: gatear la entrada a que el activo **supere al SP500** en una ventana (p.ej. `retorno_activo(N) − retorno_SP500(N) > umbral`), usando `d.sp500Close` ya disponible. El filtro actual de #4/#5 es de **tendencia del índice**, no sirve para esto: habría que **sustituirlo/añadir** el cálculo de alfa relativa.
- Alternativamente, portar la lógica de `fuerza_relativa` del multibacktest ([multibacktest.js:456-468](pages/api/multibacktest.js#L456)) al `code_js` de la estrategia como condición de entrada.

**Precisión final (lo pedido):** muchas estrategias "usan RSI", pero ninguna combina **señal de rebote** (sobreventa/desviación/dip) **con fuerza relativa vs mercado**. Ese es exactamente el hueco que cubriría B1/Rol 2 — conviene **construirla nueva**, reutilizando el gatillo de rebote de #25/#4 y el cálculo de alfa relativa de #4/#5 + multibacktest, no adaptar una existente entera.

---

### Metodología
Descarga REST de las 62 filas (`select=id,name,active,params,code_js`); escaneo por palabras clave de señal (rsi/macd/sp500/dip/sobreventa/bollinger) + lectura completa del `code_js` de las candidatas a rebote (#4, #25, #20, #13/#13.2, Copia3.1/3.2) y de las que tocan SP500 (#2, #3, #54). Clasificación de variantes near-duplicadas por arquetipo.
