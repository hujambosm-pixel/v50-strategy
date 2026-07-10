# AUDITORÍA — Etiqueta "EMA50" incorrecta y mal posicionada

**Fecha:** 2026-07-10 · **Versión:** V9.606 · **Alcance:** read-only, sin cambios de código.
**Librería de gráficos:** `lightweight-charts@4.2.0` ([package.json:12](package.json#L12)).

**Síntesis:** en el gráfico de una estrategia individual, la media morada (`ema3`) se pinta con la etiqueta de serie `title:'EMA50'` **hardcodeada** ([CandleChart.js:341](components/CandleChart.js#L341)), aunque el período real sea 20 (o el que fije `params.emaPeriod`). Además, esa etiqueta se ancla al último valor (extremo derecho), tapando la vela actual. Es un mecanismo **genérico**: cualquier estrategia que devuelva `indicators.ema3` verá "EMA50" mal etiquetado.

---

## 1. DÓNDE SE DIBUJA LA LÍNEA EMA Y SU ETIQUETA

La serie de la media morada se crea en el **overlay de indicadores** de `CandleChart.js`, dentro de la **ruta legacy** (`if(!definition)`):

- [components/CandleChart.js:339-343](components/CandleChart.js#L339):
  ```js
  const hasEma3=data.some(d=>d.ema3!=null)
  if(hasEma3){
    const s3=chart.addLineSeries({color:'#9C27B0',lineWidth:2,lastValueVisible:false,priceLineVisible:false,title:'EMA50'})
    s3.setData(data.filter(d=>d.ema3!=null).map(d=>({time:d.date,value:d.ema3})))
  }
  ```

La etiqueta **NO se genera dinámicamente**: es el parámetro `title:'EMA50'` de `addLineSeries`, un **string literal hardcodeado**. La serie toma sus valores de `d.ema3` (línea 342).

Contexto: este bloque está en la ruta `if(!definition)` ([CandleChart.js:333](components/CandleChart.js#L333)), que además dibuja `emaR` (amarilla, [335](components/CandleChart.js#L335)) y `emaL` (roja, [337](components/CandleChart.js#L337)) **sin `title`**. Solo la `ema3` lleva etiqueta. En la ruta alternativa con `definition` ([CandleChart.js:344-355](components/CandleChart.js#L344)) las EMAs se dibujan **sin ningún `title`** (línea 353).

---

## 2. HARDCODE "EMA50"

Sí, está **hardcodeado**: `"EMA50"` es un literal en [CandleChart.js:341](components/CandleChart.js#L341) (única aparición del string en el código de producción).

**De dónde debería salir el período real:** el componente **no conoce el período**. Recibe únicamente el array de valores `d.ema3`; el número 50 (ni 20) no viaja con los datos. La cadena real es:

1. El codeJs de la estrategia calcula la media con `emaPeriod ?? 20` y la devuelve como `indicators.ema3` — **solo el array**, sin el período. El sandbox ejecuta el codeJs con `{ capital_ini, years, allocation_pct, ...userParams }` en [datos.js:442-445](pages/api/datos.js#L442) (`userParams` = `stratParams` parseado); `const indicators = _result.indicators ?? {}` ([datos.js:445](pages/api/datos.js#L445)).
2. `datos.js` inyecta ese array en cada barra: `ema3: ema3Arr?.[i] ?? null` ([datos.js:531](pages/api/datos.js#L531), [datos.js:554](pages/api/datos.js#L554)). **No adjunta el período** a `chartData` ni al `meta`.
3. `CandleChart` recibe `data` (con `d.ema3`) pero **ningún dato del período** → por eso el label está fijo a mano.

**Dónde SÍ vive el período real:** en `userParams.emaPeriod` dentro de `datos.js` ([datos.js:442](pages/api/datos.js#L442)) — es decir, en los `params` de la estrategia (columna `params` de Supabase). El servidor lo tiene, pero **no lo expone** en la respuesta. El valor efectivo es `params.emaPeriod ?? 20` (según la convención del codeJs de esa estrategia), no 50.

---

## 3. POSICIÓN DE LA ETIQUETA (extremo derecho, sobre la vela actual)

La etiqueta es el **`title` de la serie** de lightweight-charts, no un `priceLine`. Comportamiento en v4:

- El `title` de una serie se dibuja como una **etiqueta anclada al último valor** (extremo derecho, junto a la escala de precios). Ese anclaje es **fijo por diseño**: lightweight-charts no ofrece opción para moverlo a la izquierda ni a una posición arbitraria. Las etiquetas del eje de precio se dibujan siempre en el lado de su price scale (por defecto, la derecha).
- `lastValueVisible:false` — **ya está puesto** en [CandleChart.js:341](components/CandleChart.js#L341). Oculta la etiqueta numérica del último precio, **pero NO oculta el `title`**: por eso "EMA50" sigue apareciendo sobre la vela derecha pese a `lastValueVisible:false`.
- `priceLineVisible:false` — también puesto; solo afecta a la línea horizontal punteada, no al `title`.

**Opciones que ofrece la librería para este caso:**
- **Ocultar el título:** `title:''` (o no pasar `title`). Elimina la etiqueta de texto del extremo derecho y **deja la línea intacta**. Es la vía limpia y soportada.
- **Mover a la izquierda:** **no soportado** para el `title` de serie. Alternativas para "etiqueta a la izquierda" existen pero son ad-hoc y costosas: (a) un *series primitive*/plugin custom que dibuje texto en el borde izquierdo, o (b) un `<div>` posicionado sobre el canvas sincronizado con el eje. Ambas añaden bastante superficie y riesgo; no son un flag de la librería.
- Cambiar la serie a un **price scale izquierdo** movería el eje entero (y todas sus etiquetas) a la izquierda — efecto colateral no deseado, no es una solución dirigida a esta etiqueta.

Conclusión: en v4 la única forma limpia y dirigida es **ocultar el `title`**; moverlo a la izquierda no es viable sin código custom.

---

## 4. IMPACTO EN OTRAS ESTRATEGIAS (alcance del bug)

Es un **mecanismo genérico**, no específico de una estrategia:

- La rama que pinta `ema3` con `title:'EMA50'` está en `if(!definition)` ([CandleChart.js:333](components/CandleChart.js#L333)-343). El gráfico individual **siempre pasa `definition={null}`** — [index.js:7220](pages/index.js#L7220) y [index.js:7372](pages/index.js#L7372) (`<CandleChart data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL} definition={null} … />`). Por tanto la vista individual **siempre** usa la ruta legacy.
- El disparador es únicamente `hasEma3 = data.some(d=>d.ema3!=null)` ([CandleChart.js:339](components/CandleChart.js#L339)). Es decir: **cualquier estrategia cuyo codeJs devuelva `indicators.ema3`** dibuja esa línea con la etiqueta fija "EMA50", sea cual sea el período real.

**Confirmación del alcance:**
- Toda estrategia con `ema3` y período ≠ 50 → etiqueta **incorrecta** (ej.: período 20 → sigue diciendo "EMA50").
- Estrategias que **no** devuelven `ema3` → no dibujan esta línea (no aparece etiqueta).
- La ruta con `definition` ([CandleChart.js:344-355](components/CandleChart.js#L344)) no pone `title`, así que no tiene este bug — pero la vista individual no la usa (definition es null). `<CandleChart>` solo se instancia en `pages/index.js` (las demás coincidencias del repo son ficheros `AUDIT_*.md`).

En resumen: **el bug afecta a todas las estrategias con `ema3`** en su gráfico individual, no solo a la observada.

---

## 5. FIX PROBABLE (descripción, NO implementado)

### Problema (2) — etiqueta sobre la vela derecha
**Fix de menor riesgo:** quitar el `title` de la serie en [CandleChart.js:341](components/CandleChart.js#L341) → `title:''` (o eliminar la clave `title`). Esto elimina la etiqueta del extremo derecho **y deja la línea morada**. Toca **una sola línea, solo el componente**. Como efecto secundario, **también resuelve (1)** (desaparece el texto erróneo). Mover a la izquierda queda descartado (punto 3: no soportado sin código custom).

### Problema (1) — período incorrecto, si se quiere CONSERVAR una etiqueta correcta
El período no está en el componente, así que hay que **plumbing**. Dos variantes, de menor a mayor robustez:

- **Variante A (mínima, acoplada):** exponer el período desde el servidor. `datos.js` ya tiene `userParams.emaPeriod` ([datos.js:442](pages/api/datos.js#L442)); añadirlo a la respuesta (p.ej. `meta.ema3Period = userParams.emaPeriod ?? 20`), pasarlo como prop a `<CandleChart>` desde [index.js:7220/7372](pages/index.js#L7220), y construir el label dinámico `title:\`EMA${p}\``. **Caveat:** asume la convención "el período de `ema3` = `params.emaPeriod`" y un default 20; si otra estrategia usa otro nombre de param u otra media, el label volvería a mentir.
- **Variante B (más robusta):** que la estrategia **exponga el período junto a la serie** (convención nueva), p.ej. `indicators.ema3Period` (o un mapa de labels). `datos.js` lo propagaría a `meta`/`chartData` y el componente lo usaría directamente. Elimina el acoplamiento a `emaPeriod`, pero exige tocar el codeJs de las estrategias (o definir la convención y un fallback).

### Recomendación
- Si el objetivo es **"que no moleste ni mienta"** con el mínimo riesgo: **Variante del problema (2)** — `title:''` en [CandleChart.js:341](components/CandleChart.js#L341). Un cambio, solo en el componente, resuelve ambos síntomas (fuera etiqueta mal posicionada **y** fuera "EMA50" incorrecto). Es lo más limpio y seguro.
- Si además se quiere **etiqueta correcta visible**: sumar la **Variante A** (exponer `emaPeriod` desde `datos.js` → prop → `EMA${p}`), asumiendo el caveat de la convención; o, para robustez a futuro, la **Variante B**. Ambas implican tocar `datos.js` (y opcionalmente el codeJs), no solo el componente.

---

### Resumen de citas
- Dibujo + label hardcodeado: [CandleChart.js:339-343](components/CandleChart.js#L339) (`title:'EMA50'` en 341).
- Origen de `ema3` (sin período): [datos.js:442-445](pages/api/datos.js#L442), [datos.js:531](pages/api/datos.js#L531), [datos.js:554](pages/api/datos.js#L554).
- Período real disponible en servidor: `userParams.emaPeriod` [datos.js:442](pages/api/datos.js#L442).
- Vista individual usa ruta legacy (`definition={null}`): [index.js:7220](pages/index.js#L7220), [index.js:7372](pages/index.js#L7372).
- Ruta con definition (sin title, sin bug): [CandleChart.js:344-355](components/CandleChart.js#L344).
