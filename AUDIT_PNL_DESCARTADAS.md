# Auditoría read-only — Alcance del "P&L hipotético de descartadas" (tooltip Concentrado)

Fecha: 2026-06-29 · Alcance: `pages/api/multibacktest.js` (`buildConcentradoCurves`). Solo lectura.

---

## 1. Dónde se calculan WR / PF / P&L hipotético de descartadas

Todo se construye en `pages/api/multibacktest.js:693-705`, a partir de dos acumuladores: el array `pnlDescartados` (de `pnlPct`) y el escalar `pnlHipEur` (euros), declarados en `:505-506`.

```js
const _descWinsC = pnlDescartados.filter(p => p >= 0)                               // :693
const _descGrossWinC = _descWinsC.reduce((s, p) => s + p, 0)                         // :694
const _descGrossLossC = Math.abs(pnlDescartados.filter(p => p < 0).reduce((s,p)=>s+p,0)) // :695
const senalStats = {
  ...
  winRateDescartadas:   pnlDescartados.length ? _descWinsC.length / pnlDescartados.length * 100 : null,  // :702  (WR descartadas)
  pfDescartadas:        _descGrossLossC > 0 ? _descGrossWinC / _descGrossLossC : _descGrossWinC > 0 ? 99 : null, // :703 (PF descartadas)
  pnlHipoteticoDescartadas: pnlHipEur,                                               // :704  (P&L hipotético descartadas)
}
```

- **WR descartadas** → `:702` (sobre `pnlDescartados`).
- **PF descartadas** → `:703` (gross win / gross loss de `pnlDescartados`).
- **P&L hipotético descartadas** → `:704` (= `pnlHipEur`).

Los tres se derivan **del mismo pool** `pnlDescartados`/`pnlHipEur`.

---

## 2. Qué señales entran en el cálculo

`pnlDescartados`/`pnlHipEur` se alimentan en **CADA** sitio de descarte del bloque de apertura, todos con la misma forma (`if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += <cap> * t.pnlPct / 100 }`):

| Categoría | Línea | Acumula en pnlDescartados/pnlHipEur |
|---|---|---|
| Sin capital (batch, `poolLibre<=0.01`) | `:551-552` | **Sí** |
| Slots llenos | `:569` | **Sí** |
| **Filtro RS (gate)** | `:575` | **Sí** |
| Sin capital (per-entry, `capPorEntrada<0.01`) | `:579` | **Sí** |

→ **Entran TODAS las señales rechazadas por las 3 categorías** (slots + capital + gate). No es un subconjunto: cada rama de descarte registra su `pnlPct` y su P&L hipotético antes de salir.

**Matiz (no entra en el pool):** las señales filtradas en `:546` (`filter(t => !openSlots[t.symbol])`, símbolo ya abierto) nunca llegan al bloque de apertura, así que **no** se registran en `pnlDescartados`/`pnlHipEur` ni en ningún contador (consistente con `AUDIT_DESCARTES.md`). En Concentrado de 1 estrategia normalmente no dispara.

---

## 3. Orden: ¿el registro ocurre antes o después de las comprobaciones?

El registro del P&L hipotético es **parte de cada rama de descarte**, e inmediatamente **antes** del `return`. Para el gate (`:573-577`):

```js
if (criterioUso === 'filtro' && prioridad === 'fuerza_relativa' && t._ps != null && isFinite(t._ps) && t._ps >= 0) {  // :573
  cntDescGate++                                                                                                        // :574
  if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 }           // :575  ← registra
  return                                                                                                               // :576  ← sale DESPUÉS
}
```

La señal descartada por el gate **se registra en el pool (`:575`) ANTES de hacer `return` (`:576`)**. Mismo patrón en slots (`:569`) y capital (`:579`): incrementan su contador, registran P&L hipotético, y luego `return`. Por tanto, las descartadas-por-gate **quedan dentro** de la cifra.

---

## 4. CONCLUSIÓN

**¿La cifra "P&L hipotético descartadas" del tooltip incluye las señales descartadas por el filtro RS?**

# **SÍ.**

Demostración: la rama del gate (`pages/api/multibacktest.js:573`) ejecuta `pnlDescartados.push(t.pnlPct)` y `pnlHipEur += capMaxPorPosicion * t.pnlPct / 100` en `:575`, **antes** del `return` en `:576`. Como `pnlHipoteticoDescartadas = pnlHipEur` (`:704`) y `winRateDescartadas`/`pfDescartadas` (`:702-703`) se calculan sobre el mismo `pnlDescartados`, las tres líneas del tooltip (**WR / PF / P&L hipotético de descartadas**) **incluyen** las señales bloqueadas por el filtro de Fuerza Relativa, junto con las de slots llenos y sin capital.

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | WR/PF/P&L descartadas se calculan en `senalStats` desde `pnlDescartados`/`pnlHipEur` | `multibacktest.js:693-704` |
| 2 | Acumulan TODAS las categorías (slots, capital, gate) | `:551-552`, `:569`, `:575`, `:579` |
| 3 | El registro del gate ocurre **antes** del `return` | `:575` (registra) → `:576` (return) |
| 4 | **¿Incluye descartadas-por-gate? → SÍ** | `:575` + `:704` |

Nota de coherencia: las tres líneas son consistentes entre sí (mismo pool) e **incluyen el gate**, a diferencia del conteo `totalDesc` del tooltip que, antes del fix V9.551, omitía `descartadasPorGate`. Tras V9.551 el conteo también lo incluye, de modo que conteo y P&L hipotético cubren el mismo conjunto (slots + capital + gate).
