# Catálogo único de condiciones — diseño (Punto 2, fase de diseño)

Estado: **propuesta**. Este documento no cambia nada en la app. Inventaría las condiciones que existen hoy, propone
cómo debería ser una condición del catálogo único y da un plan de migración en commits pequeños.

Destinatarios del catálogo: el Laboratorio de señales (LOTE_1–3), el Laboratorio de cartera (CARTERA_1–3 y
exploraciones) y, más adelante, el editor visual de estrategias y carteras. El **motor principal** (las estrategias
con `code_js`: 1 V50, 23…) **no se toca**: solo se inventaría.

Regla que manda en todo el plan: los lotes congelados (LOTE_1–3, CARTERA_1–3), la batería de V9.949 (52 respuestas
+ 44 con `conCandidatos`) y las exploraciones tienen que dar el mismo resultado **byte a byte** en cada commit.

---

## 1. Inventario

### 1.1 Dónde hay condiciones hoy

| # | Sistema | Fichero | Quién lo usa | Diario / semanal |
|---|---|---|---|---|
| A | Señales del laboratorio (disparadores, filtros, salidas) | `lib/senales.js` | Laboratorio de señales (LOTE_1, LOTE_2, LOTE_3) vía `lib/laboratorio.js`, `lib/laboratorioSalidas.js`, `lib/laboratorioEstrategias.js` | **Solo diario**: `pages/api/laboratorio.js:56` rechaza otro intervalo |
| B | Condiciones de la máquina de estados de cartera | `lib/laboratorioCartera.js` (`CONDICIONES`, transiciones con `calendario`, `inicio.segun`) | Laboratorio de cartera (CARTERA_1–3), `lib/exploracionCartera.js`, `lib/azarCartera.js` | Diario; las de media admiten `evaluacion: 'semanal'` con su propio cálculo (`mediaSemanal`) |
| C | Filtros del backtest (FiltrosPanel) | `lib/filtros.js` (`FILTROS_CATALOGO`, `construirFiltroActivoMap`, `proyectarSemanal`), `components/FiltrosPanel.js`, `lib/filtroEntrada.js` | Motor: `lib/backtestActivo.js` (/api/datos, ranking, optimizador), `pages/api/multibacktest.js` (dos ramas), `pages/api/asset-detail.js` | Diario o semanal por filtro; ámbito `mercado` (ticker) o `activo` |
| D | Alarmas y condiciones guardadas | `pages/api/status.js` (`evalConditionFull`), tabla `conditions` (`pages/api/conditions.js`), `components/ConditionsManager.js`, `components/ConditionEditorPanel.js`, `components/WatchlistCondPanel.js` | Puntos de la watchlist y alarmas | **Solo diario** (Yahoo `1d`, 2 años) y solo la **última vela** |
| E | `evalCondition` del cliente | `pages/index.js:3958` | **Nadie** (código muerto: no hay ninguna llamada) | — |
| F | Esquema de bloques `definition` (setup / trigger / abort / exit / stop) | `components/StrategyBuilder.js` y `pages/api/strategy-ai.js` (retirados en V9.1019, E11 del editor), prompts de Groq en `pages/api/conditions.js` | **Nadie lo evalúa**: las estrategias corren por `code_js`. Solo rellena parámetros heredados (`loadStrategyLegacy`, `buildCfgFromStrat`) y una rama de dibujo que no se activa (`CandleChart.js:35`) | — |
| G | Condiciones dentro del `code_js` de cada estrategia | tabla `strategies`; ayudantes inyectados `calcEMA`, `calcSMA`, `calcRSI`, `calcATR`, `calcMACD` (`lib/backtester.js`, `lib/validaCodeJs.js:20`) | Motor principal | El de la ejecución |
| H | Screener del universo | `lib/screener.js` (`seleccion`, `seleccionMomentum`, `mascaraUniverso`, `admiteEntrada`) | Multibacktest con universo dinámico, laboratorio (miembros) | Anual (1 de enero), con velas diarias |
| I | Prioridad y puerta de la multicartera | `lib/prioridadCartera.js` (`creaPuntuador`: momentum, fuerza relativa, max52), `lib/asignaCartera.js` (`bloqueaPuerta`) | Multibacktest (Concentrado), `lib/azarCartera.js` | La de la ejecución |
| J | Indicadores del usuario (solo dibujo) | `lib/indicadores.js` (metadatos), `components/CandleChart.js` (`TIPOS_INDICADOR`) | Gráfico | El del gráfico |

Fuera del inventario a propósito: `lib/condicionesSimulacion.js` no tiene condiciones de mercado (son periodo, capital
y temporalidad de la simulación; solo comparte el nombre).

### 1.2 Las condiciones, una por una

**A · `lib/senales.js`** (forma ya muy cercana a la propuesta: parámetros declarados con tipo, rango y defecto).
Semántica común: cada condición da `true | false | null` por vela; `null` = no calculable (calentamiento o dato no
válido) y **nunca** da `true`. Disparador = evento (`aEvento`: `true` en t y `false` calculable en t−1); filtro =
estado. Entrada en t = disparador[t] Y todos los filtros[t].

| id | Clase | Parámetros (defecto) | Cálculo |
|---|---|---|---|
| `cruceMedias` | disparador | tipoRapida EMA/SMA, periodoRapida 10, tipoLenta, periodoLenta 11 (rápida < lenta) | evento de rápida[t] > lenta[t] |
| `ruptura` | disparador | n 20 (1–1000) | cierre[t] > máx. de los **máximos** de t−N … t−1 (sin la vela t) |
| `precioCruzaMedia` | disparador | tipo SMA, periodo 50 | evento de cierre[t] > media[t] |
| `retroceso` | disparador | periodoRsi 2, umbral 10, tipoMedia SMA, periodoMedia 200 | evento de la condición **conjunta** (RSI < umbral Y cierre > media) |
| `rsiCruzaArriba` | disparador | periodoRsi 14, umbral 55 | evento de RSI[t] > umbral |
| `volumenAlto` | filtro | k 1,5, n 20 | volumen[t] > k × media del volumen de t−N … t−1; volumen 0 = no válido |
| `mercadoAlcista` | filtro | tipo SMA, periodo 200 | cierre de QQQ > su media, calculada en las sesiones de QQQ y tomada en la última vela de QQQ con fecha ≤ la del activo |
| `cierreBajoMedia` | salida | tipo EMA, periodo 10 | cierre[t] < media[t] |
| `stopMovilATR` | salida | k 3, n 14 | cierre[t] < máx. de los máximos desde la entrada − k·ATR[t] |
| `stopFijoATR` | salida | k 2, n 14 | cierre[t] < entrada − k·ATR de la vela de señal (e−1) |
| `rsiSobrecompra` | salida | n 14, umbral 70 | RSI[t] > umbral |
| `tiempoMaximo` | salida | n 120 | tope: al cierre de la vela N (lo aplica el laboratorio) |

Indicadores: EMA = `calcEMA` (siembra con la SMA de los N primeros válidos), SMA = `calcSMAEstricta` (null si falta
algún dato de la ventana), RSI = `calcRSI` (Wilder), ATR = `calcATR` (Wilder, en t). Caché por array de velas
(`WeakMap`).

**B · `lib/laboratorioCartera.js`** (condiciones sobre los **cierres de precio** del QQQ, no los ajustados).

| id | Parámetros | Cálculo |
|---|---|---|
| `caidaDesdeMaximo` | ventana (2–2000), pct | M[t] = máx. de **cierre** de t−ventana+1 … t (incluye t); verdadera si el mínimo de cierre desde el día de ese máximo hasta t está ≥ pct % por debajo. Da también `maxRef` |
| `cruceMedias` | tipo, rapida, lenta | evento escrito a mano (rápida[t] > lenta[t] y rápida[t−1] ≤ lenta[t−1], los cuatro calculables): equivale a `aEvento` |
| `cierreBajoMedia` / `cierreSobreMedia` | tipo, periodo, `evaluacion?: 'semanal'` | cierre < / > media; null → **false** |
| `haSuperadoMaxRef`, `noHaSuperadoMaxRef`, `cierreSobreMaxRef` | — | dependen del **estado del ciclo** (`ctx.maxRef`, `ctx.superado`), no solo de las velas |
| transición con `calendario` | anual / trimestral / mensual | `cambiaPeriodo(fecha[t−1], fecha[t])`: primer día con datos de cada periodo, a la apertura |
| `inicio.segun` | una condición de media | estado del primer día según la condición el último día evaluable antes del periodo |

Semanal propio (`mediaSemanal`): semana de lunes a domingo por número de semana; la vela t «cierra semana» si la
siguiente vela es de otra semana; la última vela nunca se da por cerrada; la media se calcula sobre esos cierres y
solo tiene valor en los días que cierran semana.

**C · `lib/filtros.js`** (convención **fail-open**: sin dato, el filtro permite).

| tipo | Ámbitos | Parámetros (defecto) | Cálculo |
|---|---|---|---|
| `indiceEma` | mercado (ticker ^GSPC) / activo | periodo 10 (si no es número, **200**: rareza conservada), intervalo | cierre **≥** EMA |
| `cruceEma` | mercado / activo | periodoR 10, periodoL 11, intervalo | EMA R > EMA L: es un **estado**, aunque se llame «cruce» |
| `macd` | mercado / activo | intervalo (12/26/9 fijos) | línea > señal |
| `rsi` | mercado / activo | periodo 14, min 55, max 100, intervalo | min ≤ RSI ≤ max (banda **inclusiva**; min > max no deja pasar nada) |

Cómo se evalúa: mercado diario = cierres del ticker **rellenados hacia delante sobre las fechas del activo**
(`buildAlignedCloses`) y la EMA sobre esa serie ya alineada; semanal = velas semanales (`semanalesDesdeDiarias`,
fechadas en lunes) proyectadas con la regla de la **última semana cerrada** (`proyectarSemanal`), salvo si la
ejecución ya es semanal (`esSemanalNativo`). El mapa fecha → permitido se aplica con `lib/filtroEntrada.js`: decide
el **cierre anterior** a la vela de entrada (o el propio con `entradaAlCierre`). En una ejecución semanal los
filtros se fuerzan a semanal (`fuerzaFiltrosSemanales`).

**D · `pages/api/status.js`** (solo la última vela y «velas desde»).

| condition | Parámetros | Cálculo |
|---|---|---|
| `ema_cross_up` / `_down` | ma_fast 10, ma_slow 11 | activa si rápida > lenta (estado) + velas desde el último cruce |
| `price_above_ma` / `_below_ma` (y `_ema`) | ma_period, ma_type | precio > / < **EMA siempre**: `ma_type: 'SMA'` se ignora |
| `close_above_ma` / `close_below_ma` | ma_period, ma_type | **no se evalúan**: el editor las ofrece, pero `status.js` devuelve `active: null` |
| `rsi_above` / `_below` | period 14, level 50 | RSI > / < nivel |
| `rsi_cross_up` / `_down` | period, level | lado actual + velas desde el cruce |
| `macd_cross_up` / `_down` | fast, slow, signal | línea vs señal + velas desde el cruce |
| `price_level` | price_level, condition_detail | último cierre ≥ / ≤ nivel |

Se evalúa sobre los últimos `max(400, 4 × periodo)` cierres, con los nulos **quitados** de la serie.

**H, I · screener y prioridad** no son condiciones por vela, pero el editor querrá usarlas:
- `lib/screener.js`: cada 1 de enero, los N con más volatilidad (o momentum de 12 meses) del año anterior → máscara
  de entradas `admiteEntrada(mascara, simbolo, fecha)`. Pertenencia al índice: `esMiembroEn` (`lib/laboratorio.js`).
- `lib/prioridadCartera.js`: momentum de N velas, fuerza relativa frente al S&P 500 (ventana 63), cercanía al máximo
  de 252 velas; la «puerta» del modo Filtro (`bloqueaPuerta`) ya es una condición de nivel sobre esas medidas.

### 1.3 Duplicados y diferencias de cálculo

| Qué | Dónde | Diferencia |
|---|---|---|
| **EMA** | `lib/backtester.js` `calcEMA` y una **copia idéntica** en `pages/api/multibacktest.js:29` (la que usan los filtros y `asset-detail.js`) | Mismo código. Tercera EMA en `pages/index.js:3960` (sembrada con el primer valor, ventana de 200): código muerto |
| EMA de un ticker externo | filtros (C) frente a `mercadoAlcista` (A) | C rellena hacia delante los cierres del ticker sobre las fechas del activo y calcula la EMA ahí: un festivo del ticker que no lo es del activo cuenta como una vela más. A la calcula en las sesiones del ticker y toma la última ≤ fecha |
| EMA en alarmas | D | Misma función, pero sobre una ventana recortada: la siembra cae en otro sitio y el valor difiere un poco del del gráfico y el backtest |
| EMA tras un hueco | `calcEMA` | Con un nulo **intermedio** (después del calentamiento), la siguiente vela vale `v·k` (el nulo anterior cuenta como 0) y el error se arrastra. Con datos limpios no ocurre; en el laboratorio un precio ≤ 0 se convierte en nulo. **Riesgo latente, no se arregla en este plan** |
| **SMA** | `calcSMA` (nulos como 0, inyectada en `code_js`), `calcSMAEstricta` (null si falta algo), `calcBollinger` (salta nulos y realinea), `calcVolumeAvg` (el 0 es válido) | Cuatro tratamientos de nulos. Con datos limpios coinciden |
| **RSI** | `calcRSI` es único | Cambian las comparaciones: A y D usan `>` / `<`; C usa la banda `≥ min` y `≤ max` |
| Precio frente a media | A `>`, B `>` / `<`, C **`≥`**, D `>` y siempre EMA | El empate (cierre igual a la media) da resultados distintos |
| «Cruce» | A y B: evento; C `cruceEma`: estado; D: estado + velas desde el cruce | Mismo nombre, tres significados |
| Nulos | A: `null` (nunca verdadero); B: `false`; C: permite (**fail-open**); D: `active: null` | Cuatro políticas |
| Semanal | C: velas semanales reales + `proyectarSemanal`; B: `mediaSemanal` por número de semana | Dos caminos con la misma información (el cierre del viernes, que actúa el lunes). **No se ha comprobado que coincidan día a día** |
| Volumen | A: 0 no válido; `calcVolumeAvg`: 0 válido | — |
| Máximos | A `ruptura`: máximos de t−N … t−1; B `caidaDesdeMaximo`: cierres de t−ventana+1 … t; I `max52`: máximos incluyendo t | Tres ventanas distintas |
| ATR | A: ATR en t; `lib/edge.js`: `atrPrevio` (t−1) | Distinto a propósito |
| `buildAlignedCloses` / `buildAlignedWeekly` | Copiados en `lib/backtestActivo.js` y `pages/api/multibacktest.js` | Mismo código |

---

## 2. Diseño de una condición

### 2.1 Forma

```js
{
  id: 'precioVsMedia',              // estable: va en las configuraciones y en sus huellas
  nombre: 'Precio frente a la media',
  tipo: 'nivel',                     // 'nivel' (estado en cada vela) | 'operacion' (depende de la posición abierta)
  parametros: [                      // lo que el editor pinta como formulario
    { clave: 'tipo', etiqueta: 'Media', tipo: 'opcion', opciones: ['EMA', 'SMA'], defecto: 'SMA' },
    { clave: 'periodo', etiqueta: 'Periodo', tipo: 'entero', min: 1, max: 1000, defecto: 200, unidad: 'velas' },
    { clave: 'lado', etiqueta: 'Lado', tipo: 'opcion', opciones: ['encima', 'debajo'], defecto: 'encima' },
  ],
  valida(p) → [errores],             // los del rango declarado + los cruzados (rápida < lenta…)
  frase(p) → 'el cierre está por encima de su SMA 200',
  calentamiento(p) → 200,            // velas desde las que puede valer algo distinto de null
  serie(velas, p, ctx) → [true | false | null],   // pura: el valor en t solo usa velas[0..t]
}
```

Una condición usada en una configuración se escribe como datos, para guardarla, hacer su huella y que el editor la
pinte: `{ c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 200, lado: 'encima' }, ref: 'QQQ', tf: 'semanal' }`.

### 2.2 Las reglas

- **Sin mirar al futuro.** `serie(...)[t]` solo puede depender de las velas hasta el cierre de t. La acción la pone
  el consumidor (a la apertura de t+1, como hoy en los dos laboratorios). Se comprueba de forma automática para
  **todas** las condiciones del catálogo con una **prueba de truncado**: para muchas t al azar,
  `serie(velas.slice(0, t + 1))[t] === serie(velas)[t]`.
- **Tres valores.** `true`, `false` o `null` (no calculable). El catálogo nunca convierte un `null` en otra cosa;
  lo decide quien consume, con una política explícita: `nulo: 'bloquea'` (laboratorios: `null` no es verdadero) o
  `nulo: 'permite'` (filtros del backtest, fail-open). Así se conservan las cuatro políticas de hoy sin mezclarlas.
- **Parámetros declarados**: `entero`, `numero`, `opcion`, `ticker`, con `min`, `max`, `defecto`, `unidad`
  (velas, %, veces). La validación sale de la declaración (`validaDeclarados` de `lib/senales.js`, que se mueve).
- **Activo de referencia** (`ref`): el propio (sin `ref`), `QQQ` o cualquier ticker con datos en la caché. La
  condición se calcula **en las sesiones de la referencia** y se lleva a las fechas del activo con «la última vela
  de la referencia con fecha ≤ la del activo» (lo que ya hace `mercadoAlcista`). La alineación de los filtros del
  backtest (rellenar y calcular en la rejilla del activo) se conserva como variante con nombre, solo para ellos
  (ver §4).
- **Diario o semanal** (`tf`). Semanal = **velas semanales reales** (`semanalesDesdeDiarias`: lunes a viernes,
  fechadas en su lunes, la semana en curso marcada). La condición se calcula en la serie semanal y se proyecta a la
  rejilla diaria con `proyectarSemanal` (última semana cerrada). En una ejecución semanal no se proyecta.
- **Nivel frente a evento.** Todas las condiciones de mercado son de **nivel**. El evento es un combinador genérico:
  `cruza(c)[t] = c[t] === true && c[t−1] === false` (el `aEvento` de hoy). «El RSI cruza 55» es `cruza(rsiNivel)`; el
  `retroceso` es `cruza(Y(rsi < 10, precio > SMA 200))`, que no es lo mismo que `Y(cruza(…), cruza(…))`.
- **Banda o histéresis.** Dos cosas distintas:
  - *rango* (nivel): `min ≤ x ≤ max`, con inclusividad declarada (la del filtro RSI);
  - *histéresis* (estado con memoria): `histeresis(entra, sale, inicial)`: pasa a verdadero cuando `entra` y vuelve a
    falso cuando `sale` («salir por debajo de A y volver por encima de B»). El DENTRO / FUERA de CARTERA_3 es una
    histéresis con A = B. Antes de su primer cambio vale `inicial` (por defecto `null`).
- **Y / O / NO** con lógica de tres valores (Kleene): `Y` es falso si alguno es falso, si no `null` si alguno es
  `null`, si no verdadero; `O` es verdadero si alguno es verdadero, si no `null` si alguno es `null`; `NO` deja el
  `null` como está.
- **Calentamiento.** Cada condición declara desde qué vela puede valer algo distinto de `null` (EMA y SMA de P: P
  velas; RSI de P: P + 1; ATR de P: P; máximo de N anteriores: N; cruce: una más que su condición). Antes, `null`.
  Una combinación es válida desde el máximo de las suyas. Para la EMA y el RSI se documenta además la convergencia
  recomendada (3–4 periodos), pero no se impone: imponerla movería los resultados.
- **Condiciones de operación** (las salidas de LOTE_2 y LOTE_3) conservan la interfaz de hoy:
  `evalua(velas, p) → decide(op, t)`, con `op = { e, entrada, maxAlto }`. Las de **ciclo** de la cartera
  (`haSuperadoMaxRef`…) se quedan en la máquina de estados: dependen de su estado, no del mercado.
- **Caché**: por array de velas y clave de parámetros (el `memo` de `lib/senales.js`, que se mueve tal cual).

---

## 3. Catálogo inicial

| id | Tipo | Parámetros | Reproduce |
|---|---|---|---|
| `precioVsMedia` | nivel | tipo, periodo, lado, `estricto` (defecto sí) | `precioCruzaMedia` (A, con `cruza`), `cierreSobreMedia` / `cierreBajoMedia` (B), `indiceEma` (C, con `estricto: false`), `price_*_ma` (D) |
| `mediaVsMedia` | nivel | tipoR, periodoR, tipoL, periodoL | `cruceMedias` (A, B, con `cruza`), `cruceEma` (C), `ema_cross_*` (D) |
| `rsiNivel` | nivel | periodo, umbral, lado | `rsiCruzaArriba` (con `cruza`), `rsi_above` / `rsi_below` |
| `rsiRango` | nivel | periodo, min, max (inclusivos) | filtro `rsi` (C) |
| `rsiHisteresis` | estado | periodo, sale por debajo de A, vuelve por encima de B | nuevo (vía `histeresis`) |
| `caidaDesdeMaximo` | nivel | ventana, pct | `caidaDesdeMaximo` (B), con su `maxRef` |
| `nuevoMaximo` | nivel | n, campo (máximo o cierre), incluye la vela t (defecto no) | `ruptura` (A) |
| `macdVsSenal` | nivel | rápido, lento, señal | filtro `macd` (C), `macd_cross_*` (D) |
| `precioVsNivel` | nivel | nivel, lado | `price_level` (D) |
| `volumenAlto` | nivel | k, n | `volumenAlto` (A). **Aviso en el editor**: en índices (^GSPC, ^NDX…) y en algunos ETF el volumen de Yahoo no es fiable (ceros, saltos, o el de otra bolsa): no usarla ahí |
| `calendario` | nivel | `periodo`: mes / trimestre / año; o `cadaNSemanas`: n y semana de inicio | transiciones con `calendario` (B). Ver la pregunta 6 |
| `esMiembro` | nivel | índice (Nasdaq-100) | `esMiembroEn` (laboratorio) |
| `elegidoPorScreener` | nivel | regla (volatilidad / momentum), N | `admiteEntrada` (H) |
| `fuerzaRelativa` | nivel | ventana, referencia, umbral | la puerta de la multicartera (I); más adelante |
| `fuerzaRelativaPercentil` | nivel (de universo) | umbral de percentil (0–100), lado | nueva: ver §3.1 |
| `precioVsBollinger` | nivel | periodo, desviaciones, banda | opcional: `calcBollinger` ya existe, ninguna condición la usa |
| Combinadores | — | `Y`, `O`, `NO`, `cruza`, `histeresis` | `aEvento`, la combinación «disparador Y filtros» |
| Atajos | — | `mercadoAlcista` = `precioVsMedia` con `ref: 'QQQ'`; `retroceso` = `cruza(Y(rsiNivel, precioVsMedia))` | conservan su id y su frase para que las huellas no cambien |
| Salidas (operación) | operación | las cinco de hoy | `cierreBajoMedia`, `stopMovilATR`, `stopFijoATR`, `rsiSobrecompra`, `tiempoMaximo` |

### 3.1 Fuerza relativa por percentil (propuesta en V9.999; implementada en V9.1004–V9.1005)

**Decidido por Sergi (21/10/2026)**: el universo de referencia es SIEMPRE el de los miembros del Nasdaq-100 en esa fecha
que tengan velas, sea cual sea el universo o la lista de la ejecución (preparado para otros índices:
`INDICE_FUERZA_RELATIVA`); el valor evaluado NO necesita ser miembro; el campo se llama `rsPercentil`. Cálculo:
`lib/fuerzaRelativa.js`; condición del catálogo: `fuerzaRelativaPercentil` (lee el campo); filtro del laboratorio de
señales: `fuerzaRelativa`. Percentil = 100 · (por debajo + ½ · iguales) / N. Un valor de una bolsa que cierra antes que
Nueva York (sufijo de mercado: SAN.MC…) usa la distribución del día anterior.

**Qué mide.** En cada fecha t y para cada valor del universo en t: la rentabilidad ponderada de 12 meses, con datos hasta
el cierre de t, en cuatro trimestres de 63 velas (13 en semanal):

`FR(t) = 0,4·r(t, t−63) + 0,2·r(t−63, t−126) + 0,2·r(t−126, t−189) + 0,2·r(t−189, t−252)`, con `r(a, b) = cierre[a] / cierre[b] − 1`.

Después, el **percentil** de FR(t) entre los valores del universo **en esa fecha** que tienen FR calculable (empates: la
media de sus puestos; 0 = el peor, 100 = el mejor). Sin 252 velas válidas o fuera del universo, «sin dato».

**Por qué es distinta.** Todas las demás condiciones miran una sola serie (y, como mucho, una referencia). Esta compara cada
valor con los demás el mismo día: necesita las velas de **todo el universo** alineadas por fecha y la pertenencia al índice
en cada fecha (`universo_miembros`, la misma que usa el screener). Se calcula una vez por ejecución para todo el universo
(una pasada por fecha, O(fechas × valores · log valores)) y se reparte por valor.

**Cómo la recibe una estrategia: un campo por vela**, como ya se hace con `sp500Close` y `filtroActivo`. El servidor
(/api/multibacktest y, con universo, /api/datos) inyecta en cada vela `rsPercentil` (0–100 o `null`) antes de ejecutar el
`code_js`; la estrategia lo lee como cualquier otro campo:

```js
// entrada a la apertura de i + 1 con la vela i CERRADA (la regla de siempre)
if (bars[i].rsPercentil != null && bars[i].rsPercentil >= 80 && cruceAlcista(i)) entradaPendiente = true
```

El valor de la vela i usa solo cierres hasta i, así que para decidir una entrada **durante** la vela i hay que leer el de
`bars[i − 1]` (lo que ya vigila el guardián). En el laboratorio de señales sería un filtro del catálogo
(`fuerzaRelativaPercentil`, umbral y lado) y en la cartera, una condición más; en la multicartera podría sustituir a la
fuerza relativa frente al S&P 500 como prioridad (cálculo nuevo, sin tocar las de hoy).

(Las tres preguntas que quedaban se respondieron arriba.)

**En el motor (V9.1005).** El servidor pone `rsPercentil` en cada vela que recibe `run()` —backtest individual, ranking,
optimizador, multibacktest (las dos ramas) y detalle del activo— SOLO si el `code_js` de la estrategia nombra el campo
(`usaFuerzaRelativa`): el resto de respuestas no cambia ni un byte. Lo lee de la caché de precios con la sesión del usuario
(`lib/fuerzaRelativaServidor.js`: los miembros del índice y sus velas diarias desde 400 días antes de la primera vela que
ve la estrategia; la distribución se recuerda 10 minutos en el proceso). Si no se puede (sin sesión, sin velas del índice o
del valor en la caché), el campo va a `null` y `/api/datos` devuelve `avisoFuerzaRelativa`. Es el mismo valor con una lista
manual que con un universo dinámico: la distribución es siempre la del Nasdaq-100 de ese día.

Lectura desde una estrategia (la señal al cierre de la vela i y la entrada a la apertura de i + 1, como las VCP):

```js
const rsMin = P('rsMin', 70), r8 = P('r8', 1)            // parámetros nuevos de la regla 8
// dentro de senal(i), después de las reglas de tendencia:
const rs = bars[i].rsPercentil                            // 0–100, con datos hasta el cierre de i; null sin dato
if (r8 && !(rs != null && rs >= rsMin)) return null       // sin dato, no hay señal
```

Para una entrada DURANTE la vela i (una orden stop) hay que leer el de `bars[i - 1]`.

---

## 4. Plan de migración

Cómo se garantiza el «byte a byte»:

1. **Las huellas no cambian** si no cambian los ids ni los parámetros: las configuraciones de los lotes solo guardan
   `{ id, params }` (y la de cartera, la regla como datos). Ninguna configuración congelada se reescribe.
2. **El código de cálculo se mueve tal cual**, sin reordenar operaciones: en coma flotante, `a + b + c` y
   `a + (b + c)` no siempre dan lo mismo.
3. **Equivalencia por series**: para cada condición usada en LOTE_1–3, CARTERA_1–3 y las exploraciones, la serie
   nueva y la vieja tienen que ser idénticas en **todos** los valores de la caché de precios, con sus parámetros y con
   parámetros al azar.
4. **Equivalencia de resultados**: los lotes y las exploraciones se vuelven a ejecutar con el arnés y su `resultados`
   se compara con la fila guardada (`lab_pruebas`), sin las marcas de tiempo ni la versión.
5. Batería de V9.949 (52 + 44), `npm run guardian` (código 0) y build en cada commit, aunque el commit no toque el motor.

**Estado del plan** (20/10/2026): commit 0 hecho en V9.998 («Copiar lote completo» con la calibración); commit 1 hecho
en V9.999 (`lib/condiciones/nucleo.js`); commit 2 hecho en V9.1000 (`lib/condiciones/indicadores.js`); commit 3 hecho en
V9.1001 (`lib/condiciones/catalogo.js`: `precioVsMedia`, `mediaVsMedia`, `rsiNivel`, `nuevoMaximo`, `volumenAlto` y
`enReferencia`; las señales del laboratorio son envoltorios). Nota del 3: el `retroceso` conserva su conjunción ESTRICTA
(«sin dato» si falta cualquiera de las dos partes), no la Y de tres valores, porque «falso Y sin dato» daría falso y
cambiaría sus eventos. Commit 4 hecho en V9.1002: `caidaDesdeMaximo` en el catálogo (movida tal cual), el cruce y el
precio frente a la media diaria de la cartera desde el catálogo, y `enSemanal` (velas semanales reales, solo semanas
cerradas). Commit 5 hecho en V9.1003 para el laboratorio de SEÑALES: el filtro `referenciaSobreMedia` («otro activo por
encima de su media», con cualquier ticker de la caché; con QQQ da lo mismo que `mercadoAlcista`) y el tipo de parámetro
`ticker`. En la CARTERA queda pendiente: su máquina de estados está construida sobre QQQ (sus condiciones miran el QQQ y
la ruta solo lee QQQ, el ETF y SPY), así que una referencia distinta es un cambio de la regla y de la pantalla, no solo
una condición (Sergi, 21/10/2026: se deja para cuando toque el editor). Hecho en V9.1018 con el editor (E9,
docs/editor-visual.md): `regla.referencia`. La fuerza relativa por percentil (el 12) se
adelantó: V9.1004 y V9.1005 (§3.1). Commit 6 hecho en V9.1006: el laboratorio de señales admite velas SEMANALES (las
reales, de las diarias de la caché; 6 años de historia antes del periodo; las salidas por velas y los topes cuentan
semanas; en los resultados, «días» son velas, es decir, semanas). Una prueba semanal es exploratoria. Commit 7 hecho en V9.1007: en la máquina de estados de la cartera, las
condiciones `primerDiaHabil` (mensual, trimestral o anual), `cadaNSemanas`, `O`, `NO` e `histeresis`, con «sin dato»
(una condición sin dato nunca es verdadera ni cambia el estado). Un rebalanceo mensual hecho con `primerDiaHabil` da la
misma curva, byte a byte, que la transición de calendario de siempre. Commit 8 hecho en V9.1008: fuera `evalCondition`
(muerto) de `pages/index.js`; una sola `calcEMA` (la de `lib/backtester.js`) y una sola copia de `buildAlignedCloses` y
`buildAlignedWeekly` (`lib/alineaSeries.js`). Commit 9 hecho en V9.1009: los cuatro filtros del backtest
(`lib/filtros.js`) comparan con `FILTROS_CALCULO_1` del catálogo, la variante heredada (cálculo 1: sin dato deja pasar,
precio frente a media con «≥», sobre las series ya alineadas a la rejilla del activo). La alineación sigue en
`lib/filtros.js` y `lib/alineaSeries.js`. Commit 10 hecho en V9.1010: en las alarmas (`pages/api/status.js`), el precio o
el cierre frente a la media sale de `precioVsMedia` del catálogo; `ma_type: 'SMA'` calcula una SMA de verdad y
`close_above_ma` / `close_below_ma` se evalúan. Sin `ma_type` (o con uno que no es SMA, como el «MAX» de la condición
«Pérdida 10%»), la EMA de siempre, con el mismo resultado que antes. Alarmas guardadas que cambian de estado (copia del
21/10/2026: 3 alarmas y 6 condiciones, 1 activa, en los 45 valores de la watchlist con precios en el arnés): NINGUNA. Las
condiciones que guarda el navegador (localStorage) no se han podido revisar. Los cruces, el RSI y el MACD de las alarmas
siguen con su código (no estaban mal). Siguiente: el 11, el editor visual. Se añade al final el 12: fuerza relativa por percentil (§3.1),
mediano, cuando se decidan sus tres puntos.

Donde el byte a byte es **imposible** si se unifica, se aísla con una **versión del cálculo**, como en V9.988
(`config.calculo`): sin el campo, el cálculo de siempre; con él, el nuevo. Hoy hay tres casos:
- **Filtros del backtest (C)**: `≥` frente a `>`, fail-open, y EMA sobre la rejilla del activo con relleno hacia
  delante. Si se pasan al catálogo, lo hacen como variante `alineacion: 'rejilla-del-activo'`, `estricto: false`,
  `nulo: 'permite'`. Cualquier otra cosa movería la batería.
- **`mediaSemanal` de la cartera (B)**: hasta comprobar que coincide día a día con velas semanales reales +
  `proyectarSemanal` sobre todo el QQQ (1999–hoy), se conserva como cálculo 1 de las condiciones semanales de cartera.
- **Alarmas (D)**: corregirlas (EMA siempre, `close_*_ma` sin evaluar, ventana recortada) **cambia** lo que se ve en la
  watchlist. No está en ningún lote ni en la batería, pero es un cambio de comportamiento: solo si se decide (pregunta 5).

| # | Commit | Qué hace | Prueba de que no se mueve nada | Tamaño |
|---|---|---|---|---|
| 0 | «Copiar lote completo» con la calibración | Una línea por variante: «Calibración: calibrada · X % de falsos aprobados en N universos», «no calibrada · …» o «sin calibración» (de `calibracionDe(lote, item)`), junto a los datos de cabecera de cada variante en `textoLoteCompleto` | Solo cambia el texto copiado; prueba sintética del texto con las 8 variantes sintéticas de CARTERA_3 de V9.994 (calibradas, no calibradas y sin calibración), que sigue cabiendo en 50.000 caracteres | pequeño |
| 1 | Núcleo del catálogo | `lib/condiciones/nucleo.js`: tres valores, `Y` / `O` / `NO`, `cruza`, `histeresis`, alineación con referencia, `validaDeclarados`; `proyectarSemanal` se reexporta de `lib/filtros.js`. Nadie lo usa aún | Pruebas sintéticas y la de truncado; batería y guardian | pequeño |
| 2 | Indicadores con caché | El `memo` y `precios`, `media`, `rsi`, `atr`, `maximoPrevio` pasan de `lib/senales.js` a `lib/condiciones/indicadores.js`, movidos tal cual; `senales.js` los importa y los reexporta | Series idénticas en toda la caché; LOTE_1–3 y CARTERA_1–3 (que usa `media`) con el mismo `resultados` | mediano |
| 3 | Condiciones de nivel del laboratorio de señales | `precioVsMedia`, `mediaVsMedia`, `rsiNivel`, `nuevoMaximo`, `volumenAlto`, `mercadoAlcista` (atajo); los disparadores y filtros de `senales.js` pasan a ser envoltorios con el mismo id, parámetros y frase | `entradas()` y `calculables()` idénticas para todas las combinaciones de LOTE_1–3 en todos los valores; los lotes completos | mediano |
| 4 | Condiciones del laboratorio de cartera | `caidaDesdeMaximo`, cruce y precio frente a media (diaria) desde el catálogo; `mediaSemanal` se queda como cálculo 1; se mide su diferencia con las velas semanales reales y se informa | CARTERA_1–3 y las exploraciones (estrés, mapa de la media) byte a byte | mediano |
| 5 | Referencia genérica | `ref` con cualquier ticker de la caché en los dos laboratorios (opción nueva; sin ella, lo de siempre) | Lotes sin cambios; prueba sintética con un ticker con festivos distintos | pequeño |
| 6 | Semanal en el laboratorio de señales | Quita el «solo diario» de `/api/laboratorio` para configuraciones nuevas, con velas semanales reales | Las configuraciones diarias (todas las congeladas) no cambian de huella ni de resultado | mediano |
| 7 | Calendario, histéresis, O / NO en la cartera | Opciones nuevas en la máquina de estados (las transiciones con `calendario` de hoy quedan como están) | CARTERA_1–3 y exploraciones byte a byte | pequeño |
| 8 | Limpieza sin efecto | Quitar `evalCondition` (muerto) de `pages/index.js`; una sola copia de `calcEMA` y de `buildAligned*` (son idénticas) | Batería 52 + 44 byte a byte, guardian, montaje de la página | pequeño |
| 9 | Filtros del backtest al catálogo (opcional) | FiltrosPanel y `construirFiltroActivoMap` evalúan condiciones del catálogo con la variante de §4 | Batería 52 + 44 con filtros, guardian, `/api/datos` con cada filtro y ámbito | grande |
| 10 | Alarmas al catálogo (si se decide) | `status.js` evalúa condiciones del catálogo; corrige los tres fallos de §1.3 | Cambia lo que muestran las alarmas: se enseña antes / después por símbolo | mediano |
| 11 | Editor visual | Formularios a partir de `parametros`; árbol Y / O / NO; frase en castellano | — | grande |
| 12 | Fuerza relativa por percentil (§3.1) | Cálculo por universo y fecha, campo `rsPercentil` por vela, filtro del laboratorio y condición de cartera | Las ejecuciones que no lo piden, byte a byte; prueba de truncado del percentil | mediano |

---

## 5. Riesgos

- **Coma flotante al mover código.** Un cambio de orden en una suma cambia el último decimal y rompe el byte a byte.
  Mitigación: mover sin reescribir y comparar series enteras, no medidas resumidas.
- **Caché de indicadores compartida.** Si dos consumidores pasan el mismo array de velas con parámetros que generan
  la misma clave pero significan otra cosa, se cruzarían valores. Mitigación: la clave incluye el id del indicador y
  todos los parámetros; prueba con dos activos.
- **Referencia con otro calendario.** Un ticker con festivos distintos (SAN.MC frente a QQQ) da valores que dependen
  de la regla de alineación; por eso hay una sola regla para lo nuevo y la de los filtros queda como variante aparte.
- **Semanal.** La semana en curso no puede contar como cerrada; `semanalesDesdeDiarias` la marca (`enCurso`), pero
  cualquier consumidor nuevo tiene que respetarlo. La prueba de truncado lo cubre.
- **Calendario y apertura.** «Primer día hábil del mes» se conoce de antemano, pero en los datos es la fecha de la
  vela **siguiente**. Hay que decidir si se evalúa en la fecha de ejecución (como hoy en la cartera) o al cierre de la
  víspera con un calendario de mercado.
- **EMA tras un hueco** (§1.3): latente en `calcEMA`. Arreglarlo cambiaría resultados solo donde haya huecos;
  conviene contar antes cuántos hay en la caché.
- **Prioridad de la multicartera** (`lib/prioridadCartera.js`): **confirmado y corregido en V9.997** (ver §7, decisión 8).
- **Volumen de Yahoo** en índices y en algunos ETF: los resultados con `volumenAlto` ahí no significan nada.
- **Alcance**: el commit 9 toca el motor; si se hace, va solo y con toda la batería.

## 6. Preguntas abiertas

Respondidas por Sergi el 20/10/2026: ver §7.

1. Nulos: ¿por defecto `bloquea` (como el laboratorio) y `permite` solo en los filtros heredados?
2. Precio frente a media: ¿estricto (`>`) por defecto en lo nuevo, y `≥` solo en la variante de los filtros?
3. Referencia distinta del propio activo: ¿se calcula en las sesiones de la referencia (como `mercadoAlcista`)?
4. Filtros del backtest (commit 9): ¿se pasan al catálogo o se quedan fuera?
5. Alarmas (commit 10): ¿se corrigen aunque cambie lo que muestran?
6. Calendario: ¿«primer día hábil» = primera vela con datos del activo (como hoy) o calendario de la bolsa?
7. Semanal en la cartera: si `mediaSemanal` y las velas semanales reales difieren algún día, ¿se queda `mediaSemanal`
   como cálculo 1 para siempre?
8. Prioridad de la multicartera: ¿se revisa aparte el posible uso del cierre del día de entrada?
9. Volumen: ¿el 0 es un dato no válido (laboratorio) o válido (gráfico)?

## 7. Decisiones

Respuestas de Sergi (20/10/2026) a las preguntas de §6. Mandan sobre lo escrito antes en este documento.

1. **Dato que falta**: la condición devuelve «sin dato» (`null`) y, en ese caso, no se entra ni se cambia de estado. Los
   filtros heredados del backtest conservan su «dejar pasar» (fail-open), aislado como **cálculo 1**.
2. **Comparación**: `>` en todo lo nuevo; `≥` solo en los filtros heredados.
3. **Activo de referencia**: se calcula en sus propias sesiones, y en cada fecha del activo se usa el último valor ya
   **cerrado** de la referencia (nunca uno futuro).
4. **Filtros del backtest al catálogo**: sí, pero **al final** del plan (commit 9) y protegidos con la versión del cálculo.
5. **Alarmas**: se arreglan (la SMA que calcula una EMA, y `close_above_ma` / `close_below_ma` que no se evalúan). Antes,
   la lista de las alarmas guardadas que cambiarían de estado.
6. **«Primer día hábil»**: la primera vela con datos.
7. **Media semanal de cartera**: si no coincide con las velas semanales reales, la actual (`mediaSemanal`) queda como
   cálculo 1 (lotes congelados) y lo nuevo usa las velas reales. **Medido en V9.1002: coinciden.** QQQ 2005–2026, SMA de
   4 a 50 semanas y EMA 10 y 40: en los 29.536 cierres de semana, el mismo valor byte a byte. La única diferencia es la
   semana en curso, que `mediaSemanal` deja sin dato (no está cerrada) y la vela semanal real sí calcula. Así que no hace
   falta versión del cálculo: la cartera sigue con `mediaSemanal` y lo nuevo usa `enSemanal` del catálogo, que da lo mismo
   (284.908 días comparados). Las dos usan la FECHA de la vela siguiente para saber que la semana ha cerrado (el
   calendario se conoce de antemano), nunca sus precios.
8. **Prioridad de la multicartera con el cierre del día de entrada**: revisada en V9.997. **Miraba al futuro**: el
   momentum, la fuerza relativa y el máximo de 52 semanas se medían con la vela de la fecha de entrada (su cierre; en
   `max52`, también su máximo), y las entradas se ejecutan a la apertura o durante esa vela (la orden stop de la 1 V50);
   solo «1.4 V50 EMA10/11 (entradas close same day)» entra al cierre. Corregido como comportamiento por defecto
   (**cálculo 2**: la vela anterior a la de entrada; la propia solo con `entradaAlCierre`). El antiguo sigue disponible
   como **cálculo 1** (`sizeRules.calculoPrioridad: 1`, «Cálculo» en el panel de Concentrado) para reproducir resultados
   guardados.
9. **Volumen 0**: dato no válido («sin dato»).

**Pendiente, sin tocar**: el fallo latente de `calcEMA` (`lib/backtester.js`): con un nulo en mitad de la serie (después
del calentamiento), la vela siguiente vale `v·k` (el nulo anterior cuenta como 0) y el error se arrastra. Con datos
limpios no ocurre. Antes de arreglarlo hay que contar los huecos que hay en la caché y aislarlo con una versión del
cálculo, porque se inyecta en el `code_js` de las estrategias.
