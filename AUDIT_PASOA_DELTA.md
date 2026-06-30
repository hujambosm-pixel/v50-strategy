# Auditoría + instrumentación — Delta del gate RS tras el refactor del Paso A (V9.556)

Fecha: 2026-06-29 · Alcance: `pages/api/multibacktest.js` (`_priorityScore`, gate). Solo lectura de lógica + instrumentación temporal que devuelve datos en el JSON de respuesta (sin logs de servidor).

Contexto: tras el Paso A, el gate de RS dejó pasar 22 señales más (descartes 206→184) y el CAGR de Concentrado+Filtro en ARKK subió 26,39% → 34,60%. Hay que verificar si esas 22 son benignas ("sin 63 barras al arranque") o si `_psValid` marca `false` a candidatos con RS calculable (filtraría de menos).

---

## 1. Dónde y cómo se setea `_psValid` para 'fuerza_relativa'

`pages/api/multibacktest.js:452-468` (rama `fuerza_relativa` de `_priorityScore`):
```js
if (prioridad === 'fuerza_relativa') {
  const LB = 63
  if (idx < LB) { t._psValid = false; return 0 }                 // :454  <63 barras del activo
  const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close
  if (!sp500Data || !sp500Data.length) {
    console.warn(...)
    t._psValid = false; return -retAsset                          // :458  sin ^GSPC
  }
  let spIdx = -1
  for (let i = sp500Data.length - 1; i >= 0; i--) {
    if (sp500Data[i].date <= t.entryDate) { spIdx = i; break }
  }
  if (spIdx < LB) { t._psValid = false; return -retAsset }        // :464  ^GSPC sin 63 barras en esa fecha
  const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close
  const rs = retAsset - retSP
  t._rsRaw = rs; t._psValid = true                                // :467  RS calculable → válido
  return -rs
}
```
Y el fallback genérico previo: `:443` `if (idx == null || data.length === 0) { t._psValid = false; return 0 }`.

**Condición exacta de `_psValid=false`**: `idx==null` **OR** `idx<63` (activo) **OR** sin `^GSPC` **OR** `spIdx<63` (^GSPC sin 63 barras antes de `entryDate`). En esos casos la RS NO se calcula con ventana completa. Cuando se calcula con datos completos → `_psValid=true` (`:467`). **No hay rama donde `_psValid` quede false con la RS perfectamente calculable** dentro de la lógica de la función en sí.

**PERO ojo (`:464`): `spIdx < 63`.** `spIdx` es el índice en `sp500Data` (la serie de `^GSPC`), no en la del activo. Si `sp500Data` **empieza más tarde** que la serie del activo, o tiene **menos barras**, entonces para fechas en las que el activo SÍ tiene ≥63 barras (`idx≥63`), el `^GSPC` podría tener `spIdx<63` → `_psValid=false` **aunque la RS sería conceptualmente calculable con el activo**. Ese es el sospechoso real de "filtrar de menos". El `debugGatePass` lo detecta (campos `idx` alto + `psValid:false`).

---

## 2. Momento del cálculo e indexación (¿bug por fecha?)

**`_priorityScore` se llama UNA sola vez por candidato**, en `:490` (`c._ps = _priorityScore(c)`), no en cada fecha del loop. Cada candidato lleva su propia `entryDate`, e `idx = _dateIdxMap[t.symbol]?.[t.entryDate]` (`:440`) es la posición de esa fecha en la serie **completa** del activo (`_dataMap[symbol] = ar.data`, `:420-423`). Por tanto:
- `idx` es **correcto y específico de cada candidato**; no hay recálculo por fecha ni idx relativo de un array recortado.
- Para un activo con histórico largo y una fecha avanzada, `idx` será grande (≥63) → la rama `idx<63` NO debería disparar.

**Único riesgo de indexación real**: el **desalineamiento activo ↔ ^GSPC** (`:464`). `idx` (activo) y `spIdx` (^GSPC) se calculan sobre **arrays distintos**. Si `^GSPC` se descargó con menos historia o empieza después que el activo, `spIdx<63` puede dispararse en fechas donde `idx≥63`. No es un bug de "idx relativo mal", sino de **dos series con distinto punto de arranque**. La instrumentación distingue ambos casos por el valor de `idx`/`barsDisponibles`.

---

## 3. Instrumentación añadida (`debugGatePass`)

- Declarada en `:513` (`const debugGatePass = []`).
- Push en `:590-593`, justo después del bloque del gate, capturando **exactamente el delta** (señales que el viejo gate bloqueaba y la vía nueva deja pasar): condición `criterioUso==='filtro' && prioridad==='fuerza_relativa' && t._psValid===false && t._ps>=0`.
- Cada entrada registra: `{ symbol, date (entryDate), idx, rsRaw, psValid, ps, barsDisponibles }` (`idx` = `barsDisponibles` = barras de la serie del activo antes de la entrada).
- Se devuelve en el objeto `curves` (`:727`), que ambos handlers spreadean en la respuesta (`...curves`, `:1529` y `:1967`) → aparece como **`debugGatePass`** en el JSON de `/api/multibacktest`.

### Cómo leerlo
- **Caso benigno (esperado):** todas las entradas con `idx` (barsDisponibles) **< 63** → son señales de los primeros ~3 meses de la ventana de datos (arranque), sin 63 barras para la RS. Es correcto dejarlas pasar. El salto de CAGR se explicaría porque esas entradas tempranas de ARKK (datos de ~2020, gran bull run) son muy rentables.
- **Caso bug (a vigilar):** entradas con `idx` **≥ 63** (activo con años cotizando) y aun así `psValid:false`. Eso confirmaría el desalineamiento activo↔^GSPC (`spIdx<63` con `idx` alto) → el gate estaría filtrando de menos por no poder calcular la RS pese a haber histórico del activo. Habría que revisar el rango/origen de `sp500Data`.

El nº de entradas de `debugGatePass` debe ser **22** (el delta observado). Si todas tienen `idx<63` → benigno. Si hay alguna con `idx≥63` → bug de alineación.

---

## 4. Conclusión provisional (pendiente de la corrida)

- Estructuralmente, `_psValid=false` solo ocurre por falta de ventana de 63 barras (activo o ^GSPC) o ausencia de ^GSPC. **No** hay rama que invalide una RS bien calculada.
- El sospechoso de "filtrar de menos" no es un idx relativo mal, sino el posible **desalineamiento de series activo↔^GSPC** en `:464` (`spIdx<63` con `idx≥63`).
- `debugGatePass` (en el JSON) dará la respuesta empírica: re-ejecuta Concentrado+Filtro+fuerza_relativa en ARKK y mira el array. Si los 22 tienen `idx<63` → el delta es benigno (arranque). Si alguno tiene `idx≥63` → hay que arreglar la alineación de la serie SP500.

**Instrumentación temporal** — quitar tras el diagnóstico.
