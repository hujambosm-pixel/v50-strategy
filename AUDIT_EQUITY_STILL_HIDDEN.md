# Auditoría read-only — Equity/mensuales/historial siguen ocultos en watchlist tras V9.598

Fecha: 2026-07-09 · Alcance: `pages/index.js`, `styles/globals.css`. Solo lectura.

Síntoma: V9.598 puso chart-wrap (watchlist) a `height:'calc(100vh - 64px)'` dejando "holgura" sobre `contentRef` (`height:'calc(100vh - 56px)'`, `overflowY:auto`), para que equity/mensuales/historial fueran alcanzables con scroll. El gráfico se ve bien (sin deformación), pero equity/mensuales/historial **siguen sin verse, ni con scroll**.

**Conclusión rápida:** el contenido SÍ se renderiza (la condición `!result.isBareChart && sidePanel!=='risk'` es verdadera en watchlist, `pages/index.js:7411`) y tiene altura real → **NO es un problema de render (hipótesis 5b: FALSA)**. Es CSS (hipótesis 5a). La causa es el `height:'calc(100vh - 56px)'` **explícito** que V9.596 añadió a `contentRef` (`:6695`): fija su alto a un valor de viewport que puede **exceder** el alto real de su padre (`:6693`/`.content`, ambos con `overflow:hidden`), de modo que el padre **recorta** la parte inferior de `contentRef` — justo la zona donde el scroll debería mostrar el equity — y además la barra de scroll queda fuera. Antes de V9.596, `contentRef` era `{flex:1, overflowY:auto}` (alto **derivado del padre**, exacto) y el equity SÍ se alcanzaba por scroll. **Fix: quitar el `height:calc(...)` explícito de `contentRef` (volver a alto derivado del padre), manteniendo el chart-wrap en `calc(100vh-64px)` (no reintroduce deformación).**

---

## 1. Valores reales y espacio en flujo

- `contentRef` (watchlist): `{flex:1, height:'calc(100vh - 56px)', overflowY:'auto'}` (`pages/index.js:6695`).
- `chart-wrap` (watchlist): `{height:'calc(100vh - 64px)', minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden'}` (`:7107`).
- Diferencia chart vs contentRef = **8px**. Es decir, el chart ocupa **casi todo** el alto visible de `contentRef`; en FLUJO solo quedan ~8px antes de que empiece el equity → equity/mensuales/historial quedan **íntegramente bajo el pliegue**.
- PERO el `scrollHeight` de `contentRef` = chart(100vh−64) + equity + mensuales + barras + historial, que supera al `clientHeight`(100vh−56) por (equity+mensuales+historial − 8) = **cientos de px**. O sea, técnicamente **hay overflow suficiente para scrollear**; el problema no es falta de contenido a scrollear, sino que ese overflow no se puede ver (punto 3/4).

Cita: `pages/index.js:6695/7107`.

---

## 2. Contenido de equity/mensuales/historial: ¿render y altura?

- Se renderizan bajo `{!result.isBareChart&&sidePanel!=='risk'&&<>…</>}` (`:7411`). En watchlist `isBareChart=false` y `sidePanel!=='risk'` → **la condición es verdadera → SÍ se renderizan**. No hay `display:none` ni render condicional que los excluya en esta rama.
- Tienen **altura propia real**, no dependen de flex/% del padre: `equity-section` contiene `EquityChart` cuyo contenedor tiene `minHeight:260` (`components/EquityChart.js:142`) + botones; mensuales y barras/ historial renderizan sus propios charts/tablas con alto natural. → No es "altura 0 por flex-basis".
- Por tanto **la hipótesis "no se renderizan / altura 0" queda descartada**. El DOM existe, con tamaño; el problema es de visibilidad/scroll (CSS).

Cita: `pages/index.js:7411/7412`; `components/EquityChart.js:142`.

---

## 3. overflow en cadena (el recorte)

Cadena de contenedores:
```
.main (globals.css:35)          flex:1; overflow:hidden                 ← acota la fila a ~100vh-56
  :6691  <div flex:1,minHeight:0,overflow:hidden,height:100%>           ← wrapper single-asset
    :6693  <div flex:1,minHeight:0,overflow:hidden,height:100%>         ← fila (sidebar|content interna)
      :6695  contentRef  watchlist → {flex:1, height:'calc(100vh-56px)', overflowY:'auto'}   ← ★ alto FIJO
        :7107  chart-wrap (height:calc(100vh-64px), overflow:hidden)
        :7412  equity-section … (auto)  ← debajo, en el overflow de contentRef
```
- `contentRef` tiene `overflowY:auto` y un alto FIJO `calc(100vh-56px)`. Si ese valor **supera** el alto real de su contenedor padre (`:6693`, que es `overflow:hidden` y cuyo alto = lo que reparta `.content`/`.main`), entonces el padre **recorta** la franja inferior de `contentRef`. Como el padre es `overflow:hidden` (no `auto`), esa franja no es scrolleable desde el padre, y la barra de scroll de `contentRef` (en su borde inferior) queda **fuera del área visible** → el usuario no puede desplazarse para ver el equity.
- `chart-wrap` tiene `overflow:hidden`, pero eso solo recorta su interior (el canvas), no afecta a los hermanos de debajo.
- El riesgo del `calc(100vh-56px)` fijo: basta con que el área real disponible sea **< 100vh−56** (p.ej. por cualquier chrome/borde/redondeo, o porque `.content`/`.main` no midan exactamente 100vh−56) para que `contentRef` sobresalga y su parte baja quede recortada por `:6693`.

Cita: `pages/index.js:6691/6693/6695/7107`; `styles/globals.css:35`.

---

## 4. ¿scrollHeight > clientHeight?

- Sí: `scrollHeight` = chart(100vh−64) + equity + mensuales + barras + historial; `clientHeight` = 100vh−56. La diferencia (equity+mensuales+historial − 8) es positiva y grande → **existe overflow real** dentro de `contentRef`.
- Por tanto NO es el caso "el contenido no supera el alto visible y por eso no hay scroll". El contenido existe y hay overflow. El fallo es que **ese overflow no es alcanzable** porque el propio `contentRef` (con alto fijo que puede exceder al padre) queda con su zona inferior/scrollbar recortada por el ancestro `overflow:hidden` (punto 3). Encaja con "ni con scroll aparece": el DOM está más abajo, hay overflow, pero el viewport efectivo de scroll está clipado.

Cita: `pages/index.js:6693/6695`.

---

## 5. Hipótesis correcta y fix

- **Hipótesis correcta: (a) CSS/layout.** El contenido SÍ se renderiza (punto 2), así que NO es (b). El chart a `calc(100vh-64px)` deja el equity bajo el pliegue, y el `height:calc(100vh-56px)` FIJO de `contentRef` (introducido en V9.596) hace que su zona de scroll inferior quede recortada por el padre `overflow:hidden` → equity inaccesible.
- **Fix recomendado (menor riesgo) — devolver a `contentRef` un alto DERIVADO DEL PADRE (como antes de V9.596):**
  cambiar `contentRef` watchlist (`:6695`) de `{flex:1, height:'calc(100vh - 56px)', overflowY:'auto'}` a **`{flex:1, minHeight:0, overflowY:'auto'}`** (sin `height` fijo). Al ser hijo flex de `:6693` (que ya está acotado por `.main overflow:hidden`), `contentRef` toma **exactamente** el alto del padre por stretch → nunca lo excede → nada se recorta y su `overflowY:auto` scrollea de verdad. El chart-wrap se queda en `height:'calc(100vh - 64px)'` (no se toca → sin deformación). Esto reproduce el estado PRE-V9.596 (cuando el equity SÍ se alcanzaba) pero conservando el chart en CSS estático (sin `velasH`). Es el cambio de **una propiedad** (quitar el `height` fijo, añadir `minHeight:0`).
  - Nota: el chart seguirá "llenando" casi la pantalla (calc(100vh-64)) con el equity bajo scroll — que es el diseño buscado. Si además se quiere que asome un poco de equity sin scrollar, se podría bajar el chart a p.ej. `calc(100vh - 140px)` o `~70vh`, pero eso es una decisión de diseño aparte; el fix del BUG es quitar el alto fijo de `contentRef`.
- **Descartado:** dejar `height:calc(100vh-56px)` en `contentRef` (es la causa del recorte). Y tocar la condición de render (el contenido ya se renderiza).

**Recomendación: quitar el `height:'calc(100vh - 56px)'` de `contentRef` (watchlist) y dejarlo `{flex:1, minHeight:0, overflowY:'auto'}`.** Un cambio, bajo riesgo, restaura el scroll al equity sin reintroducir la deformación.

Cita: `pages/index.js:6695` (propiedad a quitar), `:7107` (chart-wrap, se mantiene).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | chart `calc(100vh-64px)` vs contentRef `calc(100vh-56px)` → solo 8px de holgura; equity bajo el pliegue, pero el overflow (equity+…−8) es de cientos de px (hay qué scrollear) | `index.js:6695/7107` |
| 2 | equity/mensuales/historial SÍ se renderizan (`!isBareChart&&sidePanel!=='risk'`) con altura real (EquityChart minHeight:260) → NO es bug de render (5b falsa) | `index.js:7411`; `EquityChart.js:142` |
| 3 | `contentRef` con alto FIJO `calc(100vh-56px)` puede exceder al padre `:6693` (overflow:hidden) → recorta la franja inferior de contentRef y su scrollbar → overflow inalcanzable | `index.js:6691/6693/6695`; `globals.css:35` |
| 4 | scrollHeight > clientHeight (overflow real); el fallo no es "no hay scroll" sino que la zona de scroll de contentRef queda clipada por el ancestro | `index.js:6693/6695` |
| 5 | Causa = (a) CSS. Fix: contentRef watchlist → `{flex:1, minHeight:0, overflowY:'auto'}` (quitar height fijo, alto derivado del padre, como pre-V9.596); chart-wrap sin cambios | `index.js:6695/7107` |
