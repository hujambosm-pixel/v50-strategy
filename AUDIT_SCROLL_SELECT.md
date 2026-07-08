# Auditoría read-only — Scroll mal posicionado al seleccionar una acción de abajo del watchlist

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `styles/globals.css`. Solo lectura.

Síntoma: al seleccionar una acción que está ABAJO en la lista del watchlist (tras hacer scroll down en la lista), el contenido/gráfico no queda arriba: el eje de fechas del gráfico aparece en la parte baja de la pantalla y hay que hacer scroll UP para ver el gráfico. Con acciones de arriba se ve bien. Pasa en Watchlist y en Risk MGMT (→ causa en algo compartido: la selección de acción).

**Conclusión rápida:** al hacer clic en una fila se ejecuta `setSimbolo(w.symbol)` (`pages/index.js:5410`) → `run()` → `setResult`, pero **nada resetea la posición de scroll del contenedor de contenido**. La app SÍ tiene ese reset para otra navegación (`navigateToTrade` hace `contentRef.current.scrollTop=0`, `:4326-4331`), pero la selección de fila **no lo hace**. Por eso, si el contenedor de contenido está desplazado (p.ej. porque venías de mirar equity/mensuales del activo anterior, o por el propio gesto de scroll), al cargar el nuevo activo la vista se queda a media altura y ves el gráfico "por abajo". El fix de menor riesgo es **replicar el `scrollTop=0` en el flujo de selección** (como ya se hace en `navigateToTrade`).

---

## 1. Handler de selección de fila

- Fila del watchlist: `pages/index.js:5410` → `<div onClick={()=>setSimbolo(w.symbol)} …>` (nombre + P&L de la fila). Es el punto de entrada.
- La lista se renderiza **para ambos modos**: `{(sidePanel==='watchlist'||sidePanel==='risk')&&(…)}` (`:5062`), dentro del `<aside className="sidebar">` (`:4764`). Por eso el bug aparece en Watchlist **y** en Risk: **mismo componente/lista/handler**.
- `setSimbolo` dispara el backtest `run(sym,payload)` (`:3338-3352`) que hace `setResult(json)` (`:3350`). No hay un handler distinto por modo.

Cita: `pages/index.js:5410`, `:5062`, `:4764`, `:3338-3352`.

---

## 2. ¿Hay scroll al seleccionar? (scrollIntoView/scrollTo/scrollTop/focus)

- **En el flujo de selección: NO.** El `onClick` es solo `setSimbolo` (`:5410`). No hay `scrollIntoView`, `scrollTo`, `scrollTop=…` ni `focus()` en la selección de fila.
- **El único reset de scroll de contenido de toda la app** está en `navigateToTrade` (`:4326-4340`): `const el=contentRef.current; el.scrollTop=0` (`:4328-4331`) — pero eso se usa al **navegar a un trade**, no al seleccionar una acción del watchlist. `contentRef.current` solo se referencia ahí (`:4328`); no hay ningún otro uso que reposicione el scroll (búsqueda global de `contentRef.current` → solo `:4328`).
- Otros `scrollIntoView`/`scrollTo` existen pero son de secciones ajenas (Tradelog/Dashboard/Multi: `:8408`, `:9532`, `:9568`, `:9603`, `:9941`, `:8167`, `:8196`) — no intervienen en la selección del watchlist.

Conclusión: **no hay un scroll "malo" que arrastre la vista; hay un scroll "bueno" que FALTA** (el reset a top que sí tiene `navigateToTrade`).

Cita: `pages/index.js:5410`, `:4326-4331`, `:4328` (único uso de `contentRef.current`).

---

## 3. Jerarquía de scroll (lista vs gráfico)

```
.app  (globals.css:25)         display:flex; flex-direction:column; min-height:100vh   ← min-height, no height
  .header (:27)                height:56px; position:sticky
  .main  (:35)                 display:flex; flex:1; overflow:hidden                   ← acota la fila (overflow:hidden ⇒ min-height auto=0)
    nav  (index.js:4726)
    aside .sidebar (:4764)      overflow:hidden (inline)  → contiene:
        :5063  wrapper watchlist  {flex:1, overflow:'visible', minHeight:0}
        :5256  LISTA DE ACTIVOS   {overflowY:'auto', flex:1}   ← SCROLLER DE LA LISTA (propio)
    .content (:6602) → :6701 {flex:1,minHeight:0,overflow:hidden,height:100%}
        :6703  contentRef        watchlist → {flex:1, overflowY:'auto'}                ← SCROLLER DEL GRÁFICO
                                 risk/bare → {flex:1, display:flex column, overflow:'hidden', height:100%}  ← NO scrollea
```

- **Son contenedores de scroll SEPARADOS**: la lista (`:5256`, `overflowY:auto`) vive en el **sidebar**; el gráfico vive en **`contentRef`** (`:6703`). `.main` (overflow:hidden) acota la fila, así que **la ventana no scrollea** por el contenido (el `min-height:auto` de un flex item con `overflow:hidden` es 0 → `.main` queda a `100vh−56`).
- Por tanto **el scroll de la lista NO mueve físicamente el gráfico** (distinto contenedor). La relación que percibe el usuario es indirecta (punto 4).

Cita: `styles/globals.css:25/27/35`; `pages/index.js:4764/5063/5256/6602/6701/6703`.

---

## 4. Por qué solo con las de abajo

- La lista (`:5256`) y el gráfico (`contentRef :6703`) son scrollers independientes, así que "bajar en la lista" no empuja el gráfico **directamente**. Lo que ocurre es que **`contentRef` conserva su `scrollTop` anterior** porque la selección **nunca lo resetea** (punto 2). En modo watchlist, `contentRef` es `overflowY:auto` y contiene un gráfico alto (velas a `velasH`, casi todo el viewport) + equity + mensuales + historial; si `contentRef` estaba desplazado hacia abajo (de mirar equity/historial del activo previo, o por el propio scroll), al cargar el nuevo activo la vista **se queda a esa altura** → ves el eje de fechas abajo y tienes que subir.
- La correlación con "las de abajo" es de flujo de uso: para llegar a una fila baja **scrolleas** (la lista y/o antes el contenido), y ese estado desplazado del `contentRef` **persiste** al no resetearse. Con filas de arriba normalmente no habías desplazado nada, así que `contentRef` estaba a top y se ve bien. **La variable real no es "posición de la fila" sino "scrollTop de `contentRef` sin resetear".**
- En **Risk**, `contentRef` es `overflow:hidden` (no scrollea): ahí el reset será un no-op sobre `contentRef`, pero el mismo patrón "falta reset al seleccionar" aplica al scroller que corresponda (la propia lista del sidebar, que sí conserva su posición). El fix debe resetear el/los scroller(s) relevantes en la selección.

Cita: `pages/index.js:6703` (contentRef watchlist vs risk), `:5256` (lista), `:4331` (reset que existe para trades pero no para selección).

---

## 5. Fix probable (menor riesgo)

**No hay que quitar ningún scroll ni separar contenedores (ya están separados). Hay que AÑADIR el reset a top que falta al seleccionar**, replicando lo que ya hace `navigateToTrade`:

- **(A) Recomendada — resetear el scroll del contenido al seleccionar/cargar activo:** en el flujo de selección hacer `if(contentRef.current) contentRef.current.scrollTop=0`. Dos sitios posibles:
  1. En el `onClick` de la fila (`:5410`): `onClick={()=>{setSimbolo(w.symbol); if(contentRef.current)contentRef.current.scrollTop=0}}` — inmediato y explícito. (Aplica a los demás puntos que hacen `setSimbolo`, p.ej. `:5691`, `:5737`, `:10383`, `:10398`, si se quiere consistencia.)
  2. Mejor aún, **centralizado**: al llegar el nuevo `result`, resetear el scroll — un `useEffect` sobre `result`/`displayedSimbolo` que haga `contentRef.current.scrollTop=0`, o añadir la línea en `run()` tras `setResult(json)` (`:3350`). Así cubre cualquier vía de selección (watchlist, búsqueda, trade-click) sin repetir. Es el patrón que ya usa `navigateToTrade` (`:4331`), sólo que aplicado también a la carga por selección.
  - Riesgo: mínimo. `scrollTop=0` sobre `contentRef` es inocuo en risk (overflow:hidden). No toca layout, velas, ni CandleChart.

- **(B) Defensa adicional (opcional):** si en algún modo el scroller relevante no es `contentRef` (p.ej. la lista en risk), resetear también ese contenedor a top en la selección. No imprescindible si el síntoma es del gráfico (contentRef).

- **Descartado:** `scrollIntoView` (no hay ninguno que arrastre) y "separar scrolls" (ya están separados).

**Recomendación:** **(A) opción 2** (reset centralizado al recibir `result`, junto a `setResult` en `run` o en un `useEffect` sobre `result`), por cubrir todas las vías de selección con un solo punto y replicar el patrón ya probado de `navigateToTrade`.

Cita: `pages/index.js:3350` (tras setResult), `:4331` (patrón existente), `:5410` (onClick fila).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Selección de fila = `onClick setSimbolo(w.symbol)` (`:5410`), lista compartida watchlist+risk (`:5062`) → `run`→`setResult` | `index.js:5410/5062/3338-3352` |
| 2 | En la selección NO hay scrollIntoView/scrollTo/focus; el único reset de scroll (`contentRef.scrollTop=0`) está en `navigateToTrade`, no en la selección | `index.js:5410/4326-4331/4328` |
| 3 | Lista (`:5256`, overflowY:auto, en sidebar) y gráfico (`contentRef :6703`) son scrollers SEPARADOS; `.main` overflow:hidden acota la fila (la ventana no scrollea) | `globals.css:25/35`, `index.js:4764/5256/6703` |
| 4 | Causa real: `contentRef` conserva su `scrollTop` porque la selección no lo resetea; llegar a filas de abajo implica haber desplazado → el gráfico nuevo aparece a media altura. No es la posición de la fila, es el scroll sin resetear | `index.js:6703/5256/4331` |
| 5 | Fix: añadir `contentRef.current.scrollTop=0` al recibir `result` (centralizado en `run`/effect) o en el `onClick`, replicando `navigateToTrade`. Inocuo en risk. Mínimo riesgo | `index.js:3350/4331/5410` |
