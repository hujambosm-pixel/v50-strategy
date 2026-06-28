# Auditoría read-only — Desglose de descartes de señales (modo Concentrado)

Fecha: 2026-06-29 · Alcance: `pages/api/multibacktest.js` (`buildConcentradoCurves`), `pages/index.js` (tooltip). Solo lectura.

---

## 1. Contadores de descarte en Concentrado

Declarados en `pages/api/multibacktest.js:504` (`let cntEjecutadas = 0, cntDescSlots = 0, cntDescCapital = 0, cntDescGate = 0`) y `senalesGeneradas` en `:503`:

| Variable | Significado | Dónde se incrementa |
|---|---|---|
| `senalesGeneradas` | total señales (candidatos) | `:503` = `allCandidates.length` |
| `cntEjecutadas` | señales ejecutadas | `:580` |
| `cntDescSlots` | descartadas por **cupo lleno** | `:569` |
| `cntDescCapital` | descartadas por **sin capital** | **`:551`** (rama batch: `poolLibre<=0.01`) **y** **`:579`** (per-entry: `capPorEntrada<0.01`) — **dos sitios** |
| `cntDescGate` | descartadas por **gate de RS** (V9.549) | `:574` |

Objeto `senalStats` devuelto en `pages/api/multibacktest.js:696-704`: expone `generadas, ejecutadas, descartadasPorSlots, descartadasPorCapital, descartadasPorGate, winRateDescartadas, pfDescartadas, pnlHipoteticoDescartadas`. **No** expone `descartadasPorRiesgo` (eso es de Position Sizing).

---

## 2. Orden de evaluación del bloque de apertura (`:555-580`)

Flujo por cada señal dentro de `entries.forEach` (`:559`):
```js
if (slotsLibresEfectivos <= 0) { cntDescSlots++;  ...; return }   // :569  (1º) cupo
if (criterioUso==='filtro' && prioridad==='fuerza_relativa' && t._ps>=0) { cntDescGate++; ...; return }  // :573-577 (2º) gate RS
const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)       // :578
if (capPorEntrada < 0.01) { cntDescCapital++; ...; return }        // :579  (3º) capital
cntEjecutadas++                                                    // :580  ejecuta
```

**Orden: cupo (`:569`) → gate (`:573`) → capital (`:579`) → ejecuta (`:580`).**

**Mutuamente excluyentes:** cada rama de rechazo hace `return`, así que una señal incrementa **UN solo contador**. **No hay doble conteo** dentro del `forEach`.

Además, a nivel de día hay una rama previa en `:547` (`if entries.length>0 && poolLibre<=0.01`) que mete TODAS las entradas de ese día en `cntDescCapital` (`:551`). Es **excluyente** con el bloque `:555` (`poolLibre>0.01`): un día va por una rama o por la otra, nunca ambas. Sin doble conteo entre ellas.

---

## 3. ¿Se solapan "slots llenos" y "sin capital"? + risk management

- **No se solapan**: son ramas con `return` (`:569` vs `:579`), exclusivas. Una señal no puede caer en ambas.
- **"Slot libre pero sin capital" en Concentrado**: *posible pero raro*. Dentro del bloque `poolLibre>0.01` (`:555`), `capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)` (`:578`); si quedan slots libres pero `poolLibre` es minúsculo (p.ej. tras varias aperturas same-day en el mismo batch), `capPorEntrada<0.01` → `cntDescCapital` (`:579`). Con sizing ~25% y 4 slots no suele pasar, pero el código lo contempla.
- **Risk management (máx cartera/trade, riesgo acumulado)**: **Concentrado NO tiene descarte por riesgo.** El sizing es `capitalTotal / min(maxPosiciones, n)` (`:568`), sin `riskPerTrade`/`maxAccumRisk`. Por eso `senalStats` de Concentrado **no** incluye `descartadasPorRiesgo` (esa categoría es exclusiva de Position Sizing). En Concentrado esa categoría es siempre 0/ausente.

---

## 4. El tooltip — ¿incluye el gate? **NO** ❌

Construido en `pages/index.js:7721-7751`. La suma y las líneas mostradas:
- `pages/index.js:7726` → `const totalDesc = (ss.descartadasPorSlots||0) + (ss.descartadasPorCapital||0) + (ss.descartadasPorRiesgo||0)` — **NO suma `descartadasPorGate`**.
- Líneas del desglose (`:7738-7740`): "slots llenos", "riesgo acum.", "sin capital". **NO hay línea para el gate.**

**Confirmado: el contador del gate (`cntDescGate` / `descartadasPorGate`) NO aparece en el tooltip.** Cuando el filtro de RS está activo, todas las señales que bloquea (`:574`) son **invisibles** en el desglose.

**Conteo de categorías:**
- Categorías de descarte que EXISTEN en Concentrado: **3** reales → `slots` (`:569`), `capital` (`:551`/`:579`), `gate` (`:574`).
- Categorías que MUESTRA el tooltip: `slots`, `riesgo` (siempre 0 en Concentrado), `capital`. → efectivamente **2** con valor.
- **Falta: el gate.** Esto explica el caso reportado: si 445−143 = 302 descartadas pero el tooltip suma 28+22 = 50, los **252 restantes son `cntDescGate`** (gate de RS activo) que el tooltip omite.

---

## 5. Coherencia: ¿Σ contadores == generadas − ejecutadas?

**En el backend, la suma SÍ cuadra** (cada señal cae en exactamente un bucket o se ejecuta):
```
generadas = ejecutadas + cntDescSlots + cntDescCapital + cntDescGate   (+ ver matiz abajo)
```
Los 4 caminos son excluyentes (`return` en cada rechazo), así que el backend es coherente **incluyendo el gate**.

**En el tooltip, NO cuadra**, por dos motivos:
1. **Falta `descartadasPorGate`** en `totalDesc` (`index.js:7726`) y en las líneas (`:7738-7740`). El déficit es exactamente `cntDescGate` (los 252 del ejemplo).
2. (Menor) `descartadasPorRiesgo` se suma/muestra (`:7726`/`:7739`) pero en Concentrado siempre es 0 — inocuo, no descuadra, pero es una categoría que no aplica a este modo.

**Matiz adicional a vigilar (`:546`):** `const entries = (entriesByDate[date]||[]).filter(t => !openSlots[t.symbol])`. Las señales de un símbolo que **ya tiene posición abierta** se descartan aquí **sin contarse en ningún contador**. En Concentrado de 1 estrategia (trades secuenciales por símbolo) esto normalmente no dispara, pero en multi-estrategia/portfolio (símbolos sintéticos que pueden solaparse) sería una categoría de descarte **silenciosa** no reflejada en `senalStats`. Hoy el gap principal es el gate (punto 4); este filtro es un riesgo secundario a tener presente.

---

## Resumen

| # | Hallazgo | Veredicto |
|---|---|---|
| 1 | Contadores: `cntDescSlots` (:569), `cntDescCapital` (:551+:579), `cntDescGate` (:574) | OK identificados |
| 2 | Orden cupo→gate→capital, cada uno con `return` | **Sin doble conteo** |
| 3 | Slots vs capital excluyentes; Concentrado no tiene descarte por riesgo | OK |
| 4 | Tooltip (`index.js:7726`, `:7738-7740`) **omite el gate** | **PROBLEMA** — gate invisible |
| 5 | Backend coherente (incl. gate); **tooltip descuadra por `cntDescGate`** (+ filtro silencioso `:546`) | **PROBLEMA** en tooltip |

**Causa del caso 445−143=302 vs 28+22=50 mostradas:** el tooltip no incluye `descartadasPorGate`; los ~252 que faltan son señales bloqueadas por el gate de Fuerza Relativa. **Fix (cuando se apruebe):** sumar `descartadasPorGate` en `totalDesc` (`index.js:7726`) y añadir una línea `Descartadas — filtro RS: ${ss.descartadasPorGate}` en el desglose (`:7738-7740`).
