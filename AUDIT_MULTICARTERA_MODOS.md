# AUDITORÍA — Por qué la Multicartera rechaza "Slots iguales"

**Fecha:** 2026-07-10 · **Versión:** V9.602 · **Alcance:** read-only, sin cambios de código.

**Pregunta:** la Multicartera del multibacktest (`portfolioMode`) admite Compartido, Concentrado y Position Sizing pero rechaza "Slots iguales". ¿Es una incompatibilidad **técnica real** o una **decisión de diseño** revisable? ¿El mismo razonamiento aplica a los otros modos?

**Conclusión rápida:** el rechazo es **de diseño**, respaldado por una razón semántica sólida (Slots iguales no comparte capital → contradice la premisa de la Multicartera) y por una razón práctica dura (**el backend `handlePortfolioMode` ni siquiera implementa la rama `slots`**). No es una imposibilidad técnica de ejecución, pero levantarlo "de verdad" (con resultado significativo) sí requeriría lógica nueva.

---

## 1. EL RECHAZO

El bloqueo está en el frontend, en el callback que dispara la Multicartera real (`portfolioMode`):

- [pages/index.js:4131](pages/index.js#L4131) — solo entra a la rama Multicartera si hay `__portfolio__` seleccionado y ≥2 estrategias.
- [pages/index.js:4132](pages/index.js#L4132) — la whitelist de modos permitidos:
  ```js
  const _modoPortfolioOk=['concentrado','compartido','positionsizing'].includes(mcMode)
  ```
- [pages/index.js:4133-4138](pages/index.js#L4133) — si el modo NO está en la whitelist:
  ```js
  if(!_modoPortfolioOk){
    if(mcMode==='slots'){
      setMcError('◈ Multicartera no soporta "Slots iguales": con varias estrategias el mismo
                  activo podría acumular varias fracciones de capital, distorsionando el resultado.
                  Usa Concentrado, Compartido o Position Sizing.')
    }else{
      setMcError('◈ Multicartera disponible en Concentrado, Compartido o Position Sizing.')
    }
  }
  ```

**Naturaleza:** es un **bloqueo duro**, no un aviso. Cuando `mcMode==='slots'`, se setea `mcError` y **nunca se llega** a la llamada `apiFetch('/api/multibacktest', … portfolioMode:true …)` (que está en el `else`, [pages/index.js:4139-4162](pages/index.js#L4139)). Los backtests individuales por estrategia ya se calcularon antes; lo único que se omite es la curva agregada `◈ Multicartera`. El mensaje que ve el usuario es el de la línea 4135.

---

## 2. POR QUÉ SLOTS IGUALES ES INCOMPATIBLE

### 2a. Cómo asigna capital "Slots iguales" (`buildSlotsCurves`)

- [multibacktest.js:101-104](pages/api/multibacktest.js#L101):
  ```js
  function buildSlotsCurves(assetResults, capitalIni) {
    const n = assetResults.length
    const slotCapital = capitalIni / n
  ```
  El capital se **pre-divide** en `n` slots fijos de `capitalIni / n`, uno por cada `assetResult`.

- [multibacktest.js:108-132](pages/api/multibacktest.js#L108) — cada `assetResult` se evalúa de forma **completamente independiente**: su equity (`simple`, `compound`, `bh`, `openPnl`) se calcula solo con SUS trades y SU `slotCapital`. **No existe un pool común**: el capital de un slot nunca fluye hacia otro.

- [multibacktest.js:136-149](pages/api/multibacktest.js#L136) — la curva final es la **suma de n slots aislados** (`totSimple+=e.simple`, etc.). Es decir, `buildSlotsCurves` = *n mini-backtests paralelos sumados*, no un portafolio con capital compartido.

### 2b. Qué son los "símbolos sintéticos" de la Multicartera

- [multibacktest.js:1197-1199](pages/api/multibacktest.js#L1197) y [multibacktest.js:1268-1298](pages/api/multibacktest.js#L1268) — cada par (estrategia × ticker) se convierte en un **símbolo sintético** `${ticker}#${stratOrder}` (p. ej. `NVDA#000`, `NVDA#001`):
  ```js
  const synSym = `${ticker}#${orderTag}`      // línea 1280
  ```
- [multibacktest.js:1265](pages/api/multibacktest.js#L1265) — `slotCapital = cfg.capitalIni / nPairs`, con `nPairs` = número de pares (estrategia×símbolo) con datos.

### 2c. El mecanismo concreto de la incompatibilidad

Si la MISMA acción (p. ej. `NVDA`) está en 2 estrategias, produce **2 `assetResults` distintos** (`NVDA#000` y `NVDA#001`). En `buildSlotsCurves`:

1. **Doble fracción sobre el mismo activo real.** `n = nPairs` cuenta pares sintéticos, así que `NVDA` recibe **2 slots independientes** de `capitalIni/nPairs` cada uno. Ambos pueden estar largos en `NVDA` a la vez, sumando `2·(capitalIni/nPairs)` de exposición al mismo subyacente, **sin ninguna coordinación** entre ellos (los slots nunca interactúan → línea 108-132). Esto es exactamente lo que describe el mensaje de la línea 4135 ("el mismo activo podría acumular varias fracciones de capital").

2. **Contradicción con la premisa "capital compartido".** La Multicartera se define como "varias estrategias operando a la vez **compartiendo capital**". Slots iguales es precisamente el modo que **NO comparte capital** entre slots. Conceptualmente no es una "multicartera", es una colección de cuentas aisladas → el número resultante no representa lo que el usuario espera.

3. **Razón dura adicional — el backend no implementa `slots` en `portfolioMode`.** En [multibacktest.js:1402-1416](pages/api/multibacktest.js#L1402), el `switch` de `handlePortfolioMode` solo tiene ramas para `compartido`, `positionsizing` y `else → concentrado`. **No hay rama `slots`.** Si `modoAsig==='slots'` llegara al backend, caería en el `else` y ejecutaría `buildConcentradoCurves` — devolvería una curva **de Concentrado etiquetada como Slots**. (Nótese el contraste con el path individual no-portfolio, [multibacktest.js:1832](pages/api/multibacktest.js#L1832), que sí usa `buildSlotsCurves` como `else`.) El bloqueo del frontend evita este resultado silenciosamente incorrecto.

**En resumen:** Slots rompe por (a) semántica — no comparte capital y duplica exposición al mismo activo sin control — y (b) implementación — la rama backend no existe para `portfolioMode`.

---

## 3. POR QUÉ COMPARTIDO SÍ FUNCIONA

`buildCompartidoCurves` ([multibacktest.js:179](pages/api/multibacktest.js#L179)) usa un **único pool de capital compartido**:

- [multibacktest.js:212-213](pages/api/multibacktest.js#L212):
  ```js
  let poolLibre = capitalIni
  const openSlots = {}          // { symbol: { trade, capAsignado } }
  ```
- [multibacktest.js:230-268](pages/api/multibacktest.js#L230) — timeline por eventos: al cerrar un trade el capital (con P&L) **vuelve al pool** (`poolLibre += capFinal`, línea 237); al abrir, cada entrada toma su fracción **del pool vigente** (`capPorSlot = Math.min(totalPortfolio/n, poolLibre)`, línea 267).

**Por qué es compatible con los símbolos sintéticos:** `openSlots` está **keyed por el símbolo (sintético)** ([multibacktest.js:232](pages/api/multibacktest.js#L232), `.filter(t => !openSlots[t.symbol])` en 253). Así, `NVDA#000` y `NVDA#001` son claves distintas → no colisionan. Y como **todas** las entradas beben del mismo `poolLibre`, mantener `NVDA` dos veces simplemente consume más pool: el capital total queda **conservado y acotado**, la equity sigue siendo coherente (un solo balance). No hay "duplicación descontrolada" porque no hay capital independiente por activo.

**Diferencia técnica concreta vs Slots:** Compartido = 1 pool arbitrando todas las posiciones (capital conservado globalmente). Slots = n bolsas fijas independientes (capital aislado por par). Los símbolos sintéticos son inocuos para el primero y distorsionantes para el segundo.

---

## 4. CONCENTRADO Y POSITION SIZING

Ambos son variantes del **mismo patrón de pool compartido** que Compartido, por lo que heredan su compatibilidad:

**Concentrado** — `buildConcentradoCurves` ([multibacktest.js:410](pages/api/multibacktest.js#L410)):
- Pool único + `openSlots` keyed por símbolo sintético: [multibacktest.js:516-517](pages/api/multibacktest.js#L516), cierres/aperturas en 534 y 554 (`!openSlots[t.symbol]`).
- Añade un **tope de N posiciones simultáneas** (`maxPosiciones`, [multibacktest.js:570-577](pages/api/multibacktest.js#L570)). Esto además **acota** la duplicación del mismo activo: si `NVDA#000` y `NVDA#001` compiten por slots, el desempate determinista por símbolo sintético `(ticker, stratOrder)` decide cuál entra ([multibacktest.js:1197-1199](pages/api/multibacktest.js#L1197), `prioridad:'alfabetico'` en 1413).

**Position Sizing** — `buildPositionSizingCurves` ([multibacktest.js:732](pages/api/multibacktest.js#L732)):
- Pool único + riesgo acumulado + `openSlots` keyed por símbolo: [multibacktest.js:762-764](pages/api/multibacktest.js#L762).
- El tamaño de cada posición se calcula por riesgo (stop) contra el pool común y un techo de riesgo agregado (`maxAccumRisk`). Igual que los otros dos: capital conservado en un balance único.

En los tres, la clave es la misma: **un solo `poolLibre` + `openSlots` indexado por símbolo sintético** → los pares sintéticos son "activos distintos" para el motor pero comparten el balance, que es exactamente la semántica de la Multicartera.

---

## 5. ¿ES REVISABLE?

**Es una decisión de diseño, no una imposibilidad técnica de ejecución — pero está bien fundamentada.**

- **Ejecutar Slots no crashea.** `buildSlotsCurves(assetResults)` correría sin error sobre símbolos sintéticos y devolvería una curva. El bloqueo NO evita un fallo, evita un **resultado semánticamente engañoso**.

- **Por qué el resultado sería engañoso** (razones del punto 2): (a) Slots no comparte capital → no es una "cartera compartida"; (b) el mismo activo real en varias estrategias acumula fracciones fijas de capital sin coordinación; (c) el backend `handlePortfolioMode` **no tiene rama `slots`** ([multibacktest.js:1402-1416](pages/api/multibacktest.js#L1402)), así que hoy `modoAsig:'slots'` produciría una curva de Concentrado mal etiquetada.

- **Coste hipotético de levantarlo:**
  - *Opción mínima (bajo esfuerzo, NO recomendable):* añadir `'slots'` a la whitelist ([pages/index.js:4132](pages/index.js#L4132)) **y** una rama `slots → buildSlotsCurves` en [multibacktest.js:1402](pages/api/multibacktest.js#L1402). Técnicamente funcionaría, pero entregaría el resultado distorsionado descrito (n slots aislados, doble exposición al mismo activo). Contradice la premisa "compartiendo capital".
  - *Opción correcta (esfuerzo real):* rediseñar la asignación para que Slots sea consciente del **activo real** (`_realSymbol`, ya presente en cada trade — [multibacktest.js:1288](pages/api/multibacktest.js#L1288)): fusionar/deduplicar slots del mismo subyacente, o repartir por activo-real en vez de por par sintético. Eso es reescribir la lógica de `buildSlotsCurves`, no un cambio de una línea.

- **Recomendación:** **mantener el bloqueo.** El motivo es conceptualmente sólido: la Multicartera existe para simular estrategias **compartiendo un pool**, y Slots iguales es por definición el modo *sin* pool compartido. Los otros tres modos son todos variantes de pool único y encajan de forma natural. Levantarlo solo tendría sentido si se implementa la deduplicación por activo real (opción correcta), y aun así el modo resultante se parecería más a "Compartido" que a "Slots".

---

### Tabla resumen

| Modo | Mecanismo de capital | `openSlots` por símbolo sintético | Rama en `handlePortfolioMode` | Compatible Multicartera |
|------|----------------------|-----------------------------------|-------------------------------|--------------------------|
| **Slots iguales** | n bolsas fijas aisladas (`capitalIni/n`), sin pool | n/a (no usa pool) | ❌ no existe | ❌ **bloqueado** |
| **Compartido** | 1 pool común, sin tope de posiciones | ✅ sí | ✅ `compartido` | ✅ |
| **Concentrado** | 1 pool común + tope `maxPosiciones` | ✅ sí | ✅ `else` (default) | ✅ |
| **Position Sizing** | 1 pool común + sizing por riesgo | ✅ sí | ✅ `positionsizing` | ✅ |

**Citas clave:** rechazo → [pages/index.js:4132-4138](pages/index.js#L4132); Slots → [multibacktest.js:101-149](pages/api/multibacktest.js#L101); símbolos sintéticos → [multibacktest.js:1265-1298](pages/api/multibacktest.js#L1265); ausencia de rama slots en backend → [multibacktest.js:1402-1416](pages/api/multibacktest.js#L1402); pools → Compartido [179](pages/api/multibacktest.js#L179)/212, Concentrado [410](pages/api/multibacktest.js#L410)/516, Position Sizing [732](pages/api/multibacktest.js#L732)/762.
