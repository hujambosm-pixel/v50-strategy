# Editor visual de estrategias y carteras — diseño

Estado: **propuesta** (solo documentación; no cambia la app). Continúa el plan de `docs/catalogo-condiciones.md`: es su
commit 11, que se sustituye por el plan de este documento.

Punto de partida (lo que ya existe y el editor aprovecha):
- El **catálogo de condiciones** (`lib/condiciones/`): condiciones de nivel con parámetros declarados (tipo, rango,
  defecto, unidad), frase en castellano, calentamiento y prueba de truncado; combinadores `Y`, `O`, `NO`, `cruza`,
  `histeresis`; la fuerza relativa por percentil (`rsPercentil`).
- La **máquina de estados de la cartera** (`lib/laboratorioCartera.js`): ya es una definición declarativa (estados con
  pesos, transiciones con condiciones y acciones, calendario, O / NO, histéresis), con huella y lotes (CARTERA_1–3).
- El **contrato de una estrategia** (`code_js`): `run(bars, params)` devuelve `{ trades, indicators, openPosition,
  grafico?, filterZones? }`, y `run.parametros` declara los parámetros. El motor (`lib/nucleoBacktest.js`), el
  multibacktest, el azar, el optimizador, el guardián y el gráfico solo dependen de ese contrato.
- La tabla `strategies` ya tiene una columna `definition` (jsonb), hoy casi vacía (2 de 83 filas, del constructor antiguo).

---

## 1. Dónde va y qué construye

**Propuesta: una pestaña propia, «Editor»**, con dos modos, *Estrategia* y *Cartera*, y no dentro de la pantalla de
estrategias:
- La pantalla de estrategias es un editor de **código** (`StrategyEditorPanel`); mezclar ahí un lienzo de estados la
  vuelve dos pantallas en una. Lo que sí cambia en ella: una estrategia hecha con el editor se lista como las demás, con
  la marca «editor», y su botón «Editar» abre la pestaña Editor en vez del código.
- El constructor antiguo (`StrategyBuilder`, el esquema `definition` de bloques que nadie ejecuta) se retira cuando el
  editor nuevo funcione.

**Qué construye: las dos cosas, en este orden.**
1. **Estrategias de un activo** (lo que hoy es un `code_js`): entran en todo lo que ya existe —backtest, multibacktest,
   ranking, optimizador, azar, guardián— sin tocarlo, si cumplen el contrato (§2).
2. **Carteras** como las del laboratorio de cartera: su formato ya existe y ya es declarativo, así que el editor es una
   pantalla sobre `regla` (estados con pesos, transiciones, condiciones, acciones). Es la parte más barata: casi todo el
   trabajo es la pantalla.

Las dos comparten la pantalla (estados y flechas, condiciones del catálogo, frase en castellano), pero no el motor: una
estrategia decide *si estoy dentro de un valor*; una cartera decide *qué pesos tengo entre QQQ, el ETF y liquidez*.

---

## 2. Cómo se ejecuta: intérprete frente a generar code_js

### 2.1 Intérprete («motor nuevo») — la preferencia de Sergi

Una función pura `interpreta(definicion, bars, params)` que recorre las velas y devuelve **exactamente el mismo objeto que
`run()` de un code_js**: `{ trades, indicators, openPosition, grafico }`, y un `run.parametros` sacado de la definición.

Cómo entra en el motor: hoy `run()` se compila con `new Function` en DOS sitios, `lib/backtestActivo.js` (backtest,
ranking, optimizador) y `runCodeJsAsset` en `pages/api/multibacktest.js` (las dos ramas del multibacktest y
`pages/api/asset-detail.js`); el guardián pasa por ellos. Y `run.parametros` se lee con `esquemaDeCodigo`
(`lib/parametrosEstrategia.js`, que compila con `compilaRun` de `lib/validaCodeJs.js`) desde siete sitios. Los dos
primeros se sustituyen por **una sola** función, `compilaEstrategia(fila)`, y `esquemaDeCodigo` aprende a leer la
declaración de una definición:
- si la fila tiene `definition.tipo === 'editor'`, devuelve `(bars, params) => interpreta(definition, bars, params)` con
  su `run.parametros`;
- si no, compila el `code_js` como siempre (el mismo texto, el mismo `new Function`, los mismos ayudantes).

Con eso, todo lo de después de `run()` —velas cerradas, normalización del gráfico, cierre virtual, filtros de entrada,
comisiones, métricas, curvas, azar, guardián— no se entera de quién hizo las operaciones. Ninguna estrategia actual
cambia: no tienen `definition.tipo === 'editor'` (la batería 52 + 44 lo comprueba).

Reglas del intérprete (las de la app, por construcción):
- **Vela cerrada**: las condiciones se evalúan al cierre de t; lo que deciden actúa en t + 1 (a la apertura, o con una
  orden con nivel decidido en t). Un stop decidido con la vela de señal puede regir el día de la entrada.
- **«Sin dato» no decide** (decisión 1): una condición sin dato no dispara una transición.
- Las condiciones son las del catálogo (con su caché por serie): no hay matemática nueva dentro del intérprete.
- Cada orden se anota en `grafico.ordenes` con `decididaEn` < `date`, así el guardián y el gráfico la comprueban.

### 2.2 Generar code_js

El editor escribe el texto JavaScript de `run()` a partir de la definición y lo guarda en `code_js`. El motor no cambia.

### 2.3 Comparación

| | Intérprete | Generar code_js |
|---|---|---|
| Motor | Un punto nuevo (`compilaEstrategia`) en 2 sitios, y `esquemaDeCodigo` | Nada |
| Fuente de verdad | Una: la definición | Dos: la definición y el código generado; si alguien retoca el código, la definición deja de describirlo |
| Sin mirar al futuro | Se prueba una vez, en el intérprete, para todas las definiciones (truncado + guardián) | Hay que probar el generador y, en la práctica, cada código generado |
| Condiciones | Las del catálogo, con su caché y sus pruebas | Habría que copiar el catálogo dentro del texto (el sandbox solo recibe `calcEMA`, `calcSMA`, `calcRSI`, `calcATR`, `calcMACD`) o inyectarlo, que es tocar el motor igual |
| Huella y lotes | Directa: la huella de la definición | La del texto (cambia con cualquier retoque del generador aunque la regla sea la misma) |
| Versionado del cálculo | Como `calculo` en la cartera: el intérprete conserva versiones | Cada código queda congelado en su texto (ventaja), pero arreglar un fallo del generador no arregla lo ya generado (inconveniente) |
| Retocar a mano | No (se puede **exportar** a code_js, sin vuelta atrás) | Sí, pero rompe la relación con la definición |
| Rendimiento | Igual o mejor (caché del catálogo) | Igual |
| Riesgo principal | Que el formato devuelto difiera en algo del de un code_js (lo vigilan el guardián y las pruebas) | Errores de generación de código, difíciles de ver; dos verdades |
| Tamaño | Mediano-grande (intérprete + stops y órdenes) | Mediano-grande (generador) + un sandbox con el catálogo |

**Recomendación: el intérprete**, como prefiere Sergi. La prueba de aceptación que propongo: **reproducir la 1 V50 con el
editor y obtener las mismas operaciones, byte a byte, que su code_js** en la batería. Si se consigue, el intérprete sabe
hacer entradas con orden stop, stop técnico, salidas y reentradas, que es lo difícil.

---

## 3. Cómo se guarda: formato, huella y versión

### 3.1 La definición (estrategia de un activo)

```js
{
  tipo: 'editor', formato: 1, motor: 1,          // formato del JSON y versión del intérprete (ver 3.3)
  nombre: 'Cruce EMA con stop técnico',
  parametros: [                                   // los del usuario, con nombre: los usan las condiciones y las acciones
    { nombre: 'emaR', tipo: 'entero', defecto: 10, min: 2, max: 200, ventana: true },
    { nombre: 'emaL', tipo: 'entero', defecto: 11, min: 3, max: 400, ventana: true },
  ],
  estados: { FUERA: { inicial: true }, ARMADO: {}, DENTRO: { posicion: true } },
  transiciones: [
    { desde: 'FUERA', hacia: 'ARMADO',
      si: { c: 'cruza', de: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: '$emaR', tipoLenta: 'EMA', periodoLenta: '$emaL', lado: 'encima' } } },
      hacer: [{ orden: 'compra', clase: 'stop', nivel: { de: 'maximo', vela: 'senal' } }] },
    { desde: 'ARMADO', hacia: 'DENTRO', alEjecutarse: true,          // la orden se llena: entrada
      hacer: [{ stop: { tipo: 'minimo', velas: 1, vela: 'senal' } }] },
    { desde: 'ARMADO', hacia: 'FUERA', si: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$emaR', lado: 'debajo' } },
      hacer: [{ cancela: true }] },
    { desde: 'DENTRO', hacia: 'FUERA', si: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$emaR', lado: 'debajo' } },
      hacer: [{ vende: 'apertura' }] },
  ],
  diseno: { ... }                                  // posiciones de los estados en el lienzo, colores: NO entra en la huella
}
```

- Los parámetros de una condición pueden ser números o referencias `'$nombre'` a los parámetros de la estrategia (así
  el optimizador puede variarlos, y `run.parametros` sale de `parametros`, con `ventana: true` para el calentamiento).
- `si` es un árbol con `Y`, `O`, `NO`, `cruza`, `histeresis` y hojas del catálogo.
- Las acciones de v1: comprar a la apertura siguiente; orden stop (nivel: máximo de la vela de señal, o de las N últimas)
  o límite; vender a la apertura siguiente; vender al cierre; fijar stop (mínimo de N velas, % fijo, k × ATR), mover el
  stop (trailing por mínimo de N velas o por k × ATR, nunca hacia abajo); tope de velas; cancelar la orden.

Se guarda en `strategies.definition` (la columna ya existe). El `code_js` de esas filas queda vacío o con un comentario;
`params` guarda los valores (como hoy), y el resto de columnas, igual.

### 3.2 La huella

La de siempre (`lib/lotesLab.js`): **sha256 del JSON canónico** (claves ordenadas, sin espacios) de la definición
**sin** `diseno` ni `nombre`, con los valores de los parámetros resueltos y con `formato` y `motor`. Dos definiciones que
hacen lo mismo con otro dibujo dan la misma huella; una que cambia una regla, otra.

### 3.3 Versiones

- `formato`: la forma del JSON. Un formato nuevo trae su migración (`formato 1 → 2`), y la huella se calcula siempre
  sobre el formato vigente, así que la migración tiene que dejar la huella igual o declararse como cambio.
- `motor`: la versión del intérprete, como `calculo` en la cartera (V9.988) o `calculoPrioridad` (V9.997). Un arreglo que
  cambie resultados sube `motor`; las definiciones guardadas conservan el suyo y el intérprete mantiene los anteriores,
  así que un lote congelado se reproduce siempre igual.

### 3.4 Carteras

La definición es la `regla` de `lib/laboratorioCartera.js` tal cual (con `diseno` aparte), y su huella, la de
`configCarteraDe`, que ya usan CARTERA_1–3. No hace falta formato nuevo.

---

## 4. Qué se tiene que poder hacer en la pantalla

1. **Estados y flechas**: añadir, renombrar y borrar estados; marcar el inicial y los que están «dentro»; dibujar una
   flecha de un estado a otro (una transición) y su orden de prioridad.
2. **Condiciones**: en cada flecha, un árbol Y / O / NO con hojas del catálogo; cada hoja con su formulario sacado de sus
   `parametros` (tipo, rango, unidad, aviso —p. ej. el del volumen de Yahoo—), con valor fijo o enlazado a un parámetro de
   la estrategia.
3. **Acciones**: entradas (apertura siguiente, orden stop o límite), stops (inicial, trailing), salidas (apertura
   siguiente, cierre, tope de velas), cancelar.
4. **La frase**: la regla entera en castellano, al lado del diagrama («Cuando la EMA 10 cruza por encima de la EMA 11,
   se pone una orden de compra stop en el máximo de esa vela…»).
5. **Validación en vivo**: errores de la definición (estado inalcanzable, transición sin condición, parámetro fuera de
   rango) antes de poder guardar.
6. **Ver el diagrama**: SVG propio (sin librerías nuevas), con disposición automática; arrastrar estados es una mejora
   posterior.
7. **Ejecutar**: «Probar en backtest» (un activo, el gráfico de siempre con las órdenes y eventos del intérprete) y
   «Multibacktest»; guardar como estrategia.
8. **Declarar un lote**: elegir variantes (definiciones), congelarlas con su huella y lo común (universo, periodos,
   criterio), y ejecutarlo en el laboratorio. Ver la pregunta 4.

Para carteras, lo mismo con estados que llevan pesos (QQQ, ETF, liquidez) y acciones de mover / rebalancear.

---

## 5. Plan en commits pequeños

| # | Commit | Tamaño | Riesgo y cómo se controla |
|---|---|---|---|
| E1 | `lib/editor/definicion.js`: formato 1, validación, resolución de `$parámetros`, huella y frase. Sin pantalla ni motor | pequeño | Ninguno sobre lo que existe; pruebas sintéticas de huella (el dibujo no la cambia) y de validación |
| E2 | `lib/editor/interprete.js` mínimo: estados, transiciones al cierre de t, entrada y salida a la apertura de t + 1, tope de velas; devuelve el contrato de `run()` y `grafico` (eventos) | mediano | Que el formato difiera: se pasa por `normalizaGrafico` y por el núcleo; prueba de truncado sobre definiciones al azar; equivalencia con un code_js escrito a mano que haga lo mismo |
| E3 | Órdenes stop / límite con `grafico.ordenes`, stops (inicial, trailing), cancelación, reentrada | grande | Es donde se mira al futuro sin querer: guardián (a–h) con el intérprete y **prueba de aceptación: la 1 V50 dibujada da las mismas operaciones byte a byte que su code_js** |
| E4 | `compilaEstrategia(fila)` en los 2 sitios que compilan `run()`; `esquemaDeCodigo` lee la declaración de una definición (optimizador y calentamiento); guardar una estrategia del editor valida su definición, no su code_js | mediano | Toca el motor: batería 52 + 44, guardián, lotes y exploraciones byte a byte (ninguna estrategia actual tiene `definition.tipo === 'editor'`) |
| E5 | Guardar y cargar estrategias del editor (`strategies.definition`), listarlas con la marca «editor», exportar a code_js (sin vuelta atrás) | mediano | Las estrategias de siempre no cambian; montaje con estado |
| E6 | Pantalla, primera versión: estados y transiciones en **formularios**, árbol de condiciones, acciones, frase, validación, «Probar en backtest» | grande | Solo pantalla; montaje real y con estado |
| E7 | Diagrama SVG automático (solo ver) | mediano | Ninguno sobre el cálculo |
| E8 | Dibujar en el lienzo (añadir estados y flechas con el ratón, arrastrar) | grande | UX; sin efecto en el cálculo |
| E9 | Modo Cartera: la misma pantalla sobre `regla` de la cartera; incluye la referencia en la cartera (pendiente desde el commit 5 del catálogo) | mediano | CARTERA_1–3 y exploraciones byte a byte |
| E10 | Lotes del editor: declarar, congelar (huella) y ejecutar; la prueba contra el azar del laboratorio para estrategias del editor | grande | Lotes congelados actuales intactos; calibración nueva si hay veredicto |
| E11 | Retirar el constructor antiguo (`StrategyBuilder`, `strategy-ai` de bloques) | pequeño | Comprobar antes que ninguna fila usa su `definition` (hoy, 2 de 83) |

Riesgos generales: mirar al futuro dentro del intérprete (mitigado por construcción —decide al cierre, actúa después— y
por la prueba de truncado y el guardián); que el formato devuelto no sea exactamente el de un code_js (lo vigilan el
núcleo, `normalizaGrafico` y la prueba de aceptación con la 1 V50); el alcance de la pantalla (por eso los formularios
van antes que el lienzo); el rendimiento con muchas condiciones (la caché del catálogo es por serie).

---

## 6. Preguntas

1. **Dónde**: ¿pestaña propia «Editor» (propuesta) o dentro de la pantalla de estrategias?
2. **Orden**: ¿primero estrategias de un activo y después carteras (propuesta), o al revés (la cartera es más barata)?
3. **Prueba de aceptación**: ¿vale reproducir la 1 V50 con el editor, byte a byte, como condición para conectar el
   intérprete al motor?
4. **Lotes del editor**: hoy los lotes son constantes en el código (`lib/lotesLab.js`) con su huella. ¿Los del editor se
   declaran desde la pantalla (una tabla nueva, inmutable, con la huella), o siguen escribiéndose en el código, como ahora?
5. **Azar**: para una estrategia del editor, ¿basta la prueba contra el azar del multibacktest (A / B), o quieres también la
   del laboratorio (Nasdaq-100, la misma estrategia con fechas al azar, como LOTE_3), que necesita calibración?
6. **Órdenes de v1**: ¿bastan apertura siguiente, stop sobre el máximo (de la vela de señal o de N velas) y límite? ¿Y los
   stops: mínimo de N velas, % fijo, k × ATR y trailing?
7. **Exportar a code_js**: ¿lo quieres (para retocar a mano una copia, que ya no se edita en el editor)?
8. **Referencias a otros tickers** dentro de una estrategia (además de `sp500Close` y `rsPercentil`): ¿en la v1 o después?
9. **Lienzo**: ¿te vale empezar con formularios y diagrama automático, y dibujar con el ratón después (E8)?

## 7. Decisiones

Respuestas de Sergi (21/10/2026). Mandan sobre lo anterior.

1. **Dónde**: pestaña propia, «Editor».
2. **Orden**: primero estrategias de un activo; las carteras, después.
3. **Condición para conectar el intérprete al motor**: reproducir byte a byte las operaciones de la **1 V50** y de la
   **23** con su code_js (definiciones en `lib/editor/ejemplos.js`).
4. **Lotes del editor**: declarados desde la pantalla, en una **tabla nueva inmutable** con su huella. Los lotes antiguos
   se quedan en el código, sin cambios.
5. **Azar**: de momento, el A / B del multibacktest. El del laboratorio, con calibración, en un commit posterior.
6. **Órdenes**: apertura siguiente, al cierre, stop sobre un máximo y límite. **Stops**: mínimo de N velas, % fijo,
   k × ATR y trailing (incluido el estilo de la 23). **Salidas**: por condición del catálogo (p. ej., cierre bajo una media)
   y objetivo en múltiplos del riesgo inicial.
7. **Exportar a code_js**: sí, al final y con baja prioridad.
8. **Otros tickers**: sí, solo como **filtro de mercado** con las condiciones del catálogo que ya admiten un activo de
   referencia (p. ej., QQQ o SPY sobre su media).
9. **Lienzo**: formularios y diagrama automático primero; dibujar con el ratón, más adelante.

**Requisito de todas las pantallas**: que siempre quede claro qué está configurado y cómo leer los resultados, con consejos
integrados (por ejemplo, el riesgo de sobreajuste al cambiar muchos parámetros).

**Notas de E1 (V9.1012)**: el formato 1 está en `lib/editor/definicion.js`. Los parámetros usan el MISMO formato que
`run.parametros` (lo valida `lib/parametrosEstrategia.js`). Para reproducir la 1 V50, las condiciones de medias del catálogo
admiten una comparación opcional «≥» (su cruce compara así); lo nuevo sigue con «>» por defecto. La reentrada de la 1 V50 no
está en el motor 1: su definición no la declara (sus parámetros guardados la tienen apagada).

**Notas de E2–E3 (V9.1013)**: el intérprete está en `lib/editor/interprete.js`. Prueba de aceptación superada: la 1 V50 y
la 23 dan las mismas operaciones y la misma posición abierta, byte a byte, que su code_js (109 valores, diario y semanal,
parámetros guardados y 8 variaciones; más de 240.000 operaciones), y las órdenes del gráfico de la 1 V50 son las mismas. Dos
reglas para no mirar al futuro: la salida por condición es siempre a la APERTURA de la vela siguiente, y el tope de N velas
sale a la apertura de la vela N + 1. E2 y E3 van en un solo commit: E2 solo no habría podido pasar la prueba de aceptación.

**Notas de E4 (V9.1014)**: el intérprete está conectado al motor (`lib/editor/fuente.js`). Una fila de `strategies` cuya
columna `definition` es una definición del editor se ejecuta con el intérprete; si no, su `code_js`, como siempre. Lo
reconocen `/api/datos` (y el ranking y el optimizador), las dos ramas del multibacktest, el detalle del activo,
`esquemaDeCodigo` (parámetros y calentamiento) y el guardián. El filtro de mercado descarga las velas de su ticker en el
intervalo del activo. Una estrategia del editor que entre AL CIERRE tiene que guardar `entradaAlCierre: true` en sus
params, como la 1.4 (lo hará la pantalla al guardar, E5).

**Notas de E5 (V9.1015)**: `/api/strategies` reconoce una definición del editor en el cuerpo (POST o PUT): la valida
antes de hablar con Supabase (422, tipo `definicion_editor`, con la lista de errores en castellano) y la guarda con
`code_js` a null y en `params` los valores de sus parámetros (los de la declaración con los enviados encima; los no
declarados se quitan) más `entradaAlCierre: true` si la orden es al cierre y la temporalidad (`intervalo`) si viene
(`lib/editor/guardar.js`). En la lista de
estrategias llevan la marca «editor». Su panel de edición enseña la regla en castellano en lugar del código y deja
cambiar nombre, color, descripción y valores (validados al guardar; la copia conserva la definición). El botón «Editar»
que abre la pestaña Editor llega con ella (E6). Exportar a code_js, al final (decisión 7).

**Notas de E6 (V9.1016)**: pestaña propia ✏️ «Editor» (`components/EditorPanel.js`), a ancho completo y montada desde la
primera visita. Como el formato 1 tiene un ciclo fijo (fuera → orden → dentro → fuera), los «estados y transiciones» son
sus secciones: **Parámetros** (la declaración: tipo, rango, «periodo» para el calentamiento, restricciones, defecto y
valor), **Entrada** (señal, orden —apertura siguiente, al cierre, stop o límite con su nivel y su ajuste—, cancelación y
si se miran salidas en la vela de entrada), **Filtro de mercado**, **Stops** (en su orden, con «activa» según un parámetro
y «se retira cuando lo supera») y **Salidas**. Cada condición es un árbol Y / O / NO / cruza / histéresis con hojas del
catálogo, cuyo formulario sale de sus parámetros declarados (con su ayuda y su aviso); cualquier número u opción se puede
enlazar a un parámetro de la estrategia con «$». A la derecha, en vivo: la regla en castellano con los valores actuales,
los errores de la validación (con errores no se puede guardar), la huella, cómo leer el resultado y el riesgo de
sobreajuste (en ámbar con más de 3 parámetros). Plantillas: en blanco, la 1 V50 y la 23. «Guardar» / «Guardar como
nueva» van por `/api/strategies` (E5); «Probar en backtest» guarda y la abre en Estrategias como un clic en la lista. Desde
el panel de una estrategia del editor, «Abrir en el Editor».

**Notas de E7 (V9.1017)**: diagrama SVG propio (`components/DiagramaEditor.js`), solo para ver, en la columna derecha del
Editor encima de la regla. Se dibuja solo desde la definición y los valores actuales: FUERA → (ORDEN VIVA, si la orden es
stop o límite, con su ajuste) → DENTRO; la cancelación, flecha discontinua de ORDEN VIVA a FUERA; cada stop (rojo) o salida
(ámbar) ACTIVO con esos valores, una flecha de DENTRO a FUERA numerada en el orden en que se comprueba. El filtro de mercado
va en la etiqueta de la señal. Los textos van recortados; el entero, al pasar el ratón.
