# Builder guiado — inventario y plan

Documento de trabajo (V9.1034, 22/10/2026). El Builder une la creación y la prueba de estrategias en tres pasos:
**1 Crear la estrategia → 2 Probarla contra el azar → 3 Convertirla en plan.** Se construye en tres tandas; este documento
recoge primero lo que hay hoy en la app y después el plan.

---

## 1. Inventario de las pantallas actuales

La navegación principal es la columna de iconos de la izquierda (`pages/index.js`, lista de secciones `sidePanel`):

| Sección | Qué es | Dónde vive |
|---|---|---|
| Estrategias (`config`) | La lista de estrategias (todas: code_js y del editor, con la marca «editor»), el gráfico del activo con el backtest de la estrategia elegida, sus parámetros y filtros. Un clic en una estrategia abre su panel de edición (`components/StrategyEditorPanel.js`): código, parámetros, notas; si es del editor, la regla en castellano y «Abrir en el Editor». «+ Crear estrategia» abre ese mismo panel vacío (el «editor clásico»: escribir code_js) | `pages/index.js` (lista, `openEditStr`, `newStrategy`), `components/StrategyEditorPanel.js` |
| Editor (`editor`) | El editor visual, con tres modos: **Estrategia de un activo** (formularios de parámetros, entrada, filtro de mercado, stops y salidas; plantillas en blanco, 1 V50 y 23; diagrama; la regla en castellano; validación; Guardar, Guardar como nueva, Probar en backtest, Exportar a code_js), **Cartera (QQQ + ETF)** (la regla de una cartera sobre las plantillas de CARTERA_1–3; ejecutar en el laboratorio de cartera) y **Lotes** (declarar y congelar lotes de variantes en `editor_lotes`, ejecutarlos con la prueba A / B del multibacktest y el **laboratorio con calibración**; «Copiar para Claude») | `components/EditorPanel.js`, `EditorCartera.js`, `EditorLotes.js`, `DiagramaEditor.js`; `lib/editor/*` |
| Alertas, Watchlist, Fundamentals | Alarmas y condiciones, listas de valores, ficha fundamental | — (fuera del Builder) |
| Backtesting (`multi`) | El multibacktest: varias estrategias o una sobre una lista o el universo dinámico del Nasdaq-100; modos de reparto; la prueba contra el azar de la cartera (A / B) | `pages/index.js`, `components/AzarCarteraPanel.js`, `components/backtesting/*` (el panel izquierdo, §76) |
| Optimización | Rejilla de parámetros, robustez, walk-forward, azar | `components/OptimizacionPanel.js` |
| **Laboratorio** | Ver §1.1 (**eliminado en §75**) | ~~`components/LaboratorioPanel.js`~~ |
| **Lab. cartera** | Ver §1.2 (**eliminada en §74**) | ~~`components/CarteraPanel.js`~~ |
| TradeLog, Risk Mgmt | El diario real (con aportaciones) y la gestión del riesgo | — (fuera del Builder) |

### 1.1 Laboratorio (señales, salidas y estrategias del catálogo)

> **Eliminado** (05/11/2026, §75): la pantalla, el modo «Lotes» del Editor, su motor, sus lotes y sus pruebas guardadas. La idea vuelve más adelante como «Explorar ingredientes» dentro de Estrategias.

Qué hace: prueba combinaciones del catálogo de señales en los miembros del Nasdaq-100 frente al azar, y lleva el registro
de TODO lo que se prueba (`lab_pruebas`) y los lotes oficiales congelados en el código (LOTE_1, LOTE_2, LOTE_3).
Botones y opciones:
- **Probar:** Entradas / Salidas / Estrategias (tres constructores):
  - *Entradas* (LOTE_1): un disparador y filtros del catálogo, salida fija a N velas.
  - *Salidas* (LOTE_2): entradas al azar (las del lote) o, en las exploratorias, un disparador; una salida del catálogo con
    su tope de tiempo.
  - *Estrategias* (LOTE_3): entrada (disparador y filtros) + salida, frente a la misma estrategia al azar.
- **Velas:** diarias o semanales; periodos (añadir y quitar); la regla en castellano; etiqueta Oficial / Exploratoria (por
  la huella); **▶ Ejecutar prueba** (un periodo por petición, con progreso).
- Resultado: tablas por periodo, por año y por activo, percentil frente al azar, veredicto (con el criterio y la
  calibración del lote), **📋 Copiar para Claude**.
- Lotes: tabla del estado de cada elemento de LOTE_1–3 («Ejecutar pendientes», «Copiar lote completo»), y el historial de
  pruebas registradas (abrir una, ponerla en el constructor).
**Encaja en el paso 2** (Probarla contra el azar): es el mismo tipo de prueba que el laboratorio del editor (que ya reutiliza
su «estrategia al azar» y su calibración). No se toca en estas tandas.

### 1.2 Lab. cartera

> **Eliminada** (05/11/2026, §74): la pantalla, su modo en el Editor y sus pruebas guardadas. Su motor (`lib/laboratorioCartera.js`) sigue: lo usan los planes.

Qué hace: la máquina de estados de una cartera de QQQ + un ETF apalancado (CARTERA_1–3) frente a comprar y mantener, la
mezcla 50/50 y el azar, con impuestos y costes.
Botones y opciones:
- Pestañas **Probar** y **Explorar**.
- *Probar*: la regla (la de Sergi, la simple, la mezcla fija con su rebalanceo, el filtro de tendencia con su media,
  evaluación diaria o semanal y alcance), la caída y la ventana, el ETF (QLD, TQQQ o los sintéticos ×2 / ×3), el cálculo
  (1, el de los lotes; 2, con impuestos en caja y costes por operación), etiqueta Oficial / Exploratoria, **Ejecutar**; el
  resultado (curva frente a las referencias, medidas, ciclos, impuestos, azar y calibración), «Copiar para Claude»; el
  estado de los lotes CARTERA_1–3 («Ejecutar pendientes», «Copiar lote completo») y el historial.
- *Explorar*: curva de riesgo, mapa de sensibilidad, prueba de estrés 1999–2025 con sintéticos (con su validación frente
  a QLD y TQQQ) y mapa de la media.
**Encaja en el paso 3** (Convertirla en plan): es la base del motor de planes (`lib/planes/`, que reutiliza su máquina de
estados). No se toca en estas tandas.

### 1.3 Lo que el Builder usa de lo que ya existe

- Estrategias: la tabla `strategies` (code_js o `definition` del editor) y el editor visual de hoy.
- Lotes: `editor_lotes` (lotes de estrategias del editor y, con `tipo: 'planes'`, de planes).
- Registro: `lab_pruebas` (`editorLote` = prueba A / B de un lote; `editorCalibracion` y `editorLab` = el laboratorio con
  calibración; `planLote` = un lote de planes).
- Planes: el motor (`lib/planes/`) y sus rutas (`/api/plan`, `/api/planes-lote`), sin pantalla todavía.

---

## 2. Plan en tres tandas

| Tanda | Qué | Notas |
|---|---|---|
| **1** | Pestaña **Builder** (la primera de la navegación): la barra de los 3 pasos (indicativa), el recuadro «Siguiente paso» («Empezar en blanco»), cuatro plantillas de estrategia y **Mi trabajo** (todas las estrategias y lotes con paso, estado, resultado y «qué toca ahora»). Abre el editor visual de hoy; enlace al «Editor clásico» | Nada existente se borra; ningún motor se toca |
| 2 | **Confirmar y probar**: la prueba guiada que encadena congelar → calibrar → ejecutar → veredicto (el laboratorio con calibración del modo Lotes), paso a paso y con lo que significa cada resultado | Aquí se integrará el Laboratorio |
| 3 | **Editor por tarjetas**: la estrategia en tarjetas (entrada, filtros, salida, stops) en lugar de formularios largos | Más adelante, «Convertirla en plan» con el Lab. cartera y el motor de planes |

---

## 3. Tanda 1 — detalle

- **Barra de pasos**: Crear la estrategia / Probarla contra el azar / Convertirla en plan; en la tanda 1 resalta el paso 1
  y solo indica.
- **Siguiente paso**: una frase de qué toca hacer y el botón principal «Empezar en blanco» (abre el editor visual con la
  plantilla en blanco).
- **Plantillas** (cada una con su regla en una frase; «Usar esta plantilla» abre el editor visual con una COPIA nueva
  rellenada, que se guarda al pulsar Guardar):
  1. *Comprar retrocesos*: cierre > SMA 200 y RSI de 2 < 10; vende cuando el cierre supera la SMA 5 = la definición de
     «Retroceso líderes RSI2».
  2. *Rupturas*: cierre > máximo de los 100 días anteriores y volumen > su media de 20; stop del 8 %.
  3. *Seguir la tendencia*: la EMA 10 cruza por encima de la EMA 50; vende cuando cruza por debajo.
  4. *Filtro de mercado* (solo opera si QQQ > SMA 200; se añade a otra estrategia): **desactivada**. El editor de hoy pone
     el filtro de mercado DENTRO de una estrategia (sección «Filtro de mercado»), no como pieza suelta que se añada a otra.
     Mientras no exista esa pieza, la tarjeta lo explica: abre tu estrategia y activa el filtro (QQQ, SMA 200).
- **Mi trabajo**: ver §4.
- **Editor clásico**: enlace discreto a «Estrategias» con el panel de «+ Crear estrategia» (code_js), sin cambios.

## 4. Mi trabajo: de dónde sale cada dato

Una fila por estrategia activa (code_js y del editor) y una por lote congelado. Sin tablas nuevas: `strategies`,
`editor_lotes` y `lab_pruebas`.
- **Unión estrategia ↔ lote**: una variante de un lote es una COPIA de la definición con sus valores; se reconoce por la
  huella (la de la definición con sus valores: `huellaDefinicion`). Si la estrategia se cambió después de congelar el lote,
  su huella ya no coincide y la fila no lo enlaza (lo correcto: el lote probó otra cosa).
- **Paso**: 1 si la estrategia no está en ningún lote; 2 si alguna variante de un lote es ella (o es un lote de
  estrategias); 3, los lotes de planes. Las estrategias aún no pasan al 3 (los planes no tienen pieza «estrategia»).
- **Estado** (fiable):
  - *Borrador*: estrategia del editor cuya definición no valida.
  - *Guardada*: estrategia guardada que no está en ningún lote (todas las de code_js).
  - *Congelada*: en un lote aún sin ejecutar.
  - *Supera al azar* / *No supera al azar*: el último veredicto. Si hay laboratorio con calibración (`editorLab` y
    `editorCalibracion` de su huella), manda ese (pasa / no pasa; «Sin veredicto» si la calibración no la acepta); si solo
    hay la prueba A / B del lote (`editorLote`), el de esa (supera al azar en todos los periodos o no).
  - *Calibrando…*: NO se puede saber desde la base (la calibración corre en el navegador y solo se guarda al terminar):
    no se muestra; mientras corre, se ve en el modo Lotes.
- **Resultado**: el resumen del último veredicto (prueba A / B por periodo, laboratorio por periodo y la calibración).
- **Orden**: primero las del editor y los lotes; después las de código.
- **Qué toca ahora**: Terminarla (borrador) · Probarla contra el azar (declarar un lote en el modo Lotes) · Ejecutar el lote ·
  Calibrar y probar en el laboratorio · Convertirla en plan (el paso 3, todavía sin pantalla: se dice) · Revisar la
  estrategia. Las de code_js: «Abrir» (donde se abren hoy) y, para probarlas contra el azar, el multibacktest.

## 5. Estado de la tanda 1 (V9.1035)

Hecho: pestaña **Builder** (la primera de la navegación, a ancho completo), `components/BuilderPanel.js`,
`lib/builder/plantillas.js` y `lib/builder/miTrabajo.js`. El editor visual recibe `abrir` (abre el modo Lotes con un lote
elegido); nada más cambia en él. Plantillas: «Comprar retrocesos» (misma huella que «Retroceso líderes RSI2»), «Rupturas» y
«Seguir la tendencia» funcionan; «Filtro de mercado», desactivada (ver §3). Con los datos reales, «Mi trabajo» da 80 filas
(78 estrategias y 2 lotes); «Retroceso líderes RSI2» sale en el paso 2, unida a RETROCESOS_1 por su huella.
Estados fiables: Borrador, Guardada, Congelada, Supera / No supera al azar y Sin veredicto (de editor_lotes y lab_pruebas).
No fiable y por eso no se muestra: «Calibrando…». Las estrategias de código no tienen veredicto registrado (su prueba contra el
azar del multibacktest no se guarda): salen como «Guardada».

## 6. Tanda 1b: el aspecto del boceto (V9.1036)

Solo estilo y textos del Builder. Un único sitio de estilo, `lib/builder/estilo.js` (tokens `B`, chips de estado `CHIPS` y
estilos montados `S`), para reutilizarlo después en el Laboratorio y el Lab. cartera: letra Inter (con system-ui, Segoe UI…
de respaldo: la app no carga Inter, así que se ve la del sistema salvo que esté instalada), base 14 px, los colores del
boceto, radios 12 / 8 px y 16 px de aire. Pasos con subtítulo; «Siguiente paso» azul con el único botón verde («Empezar en
blanco»); títulos de sección en blanco con su línea explicativa; plantillas con barra verde, la regla en un recuadro con las
partes clave en negrita (`regla` en lib/builder/plantillas.js, con `**`), «Como «…»» y el detalle tras «Ver detalle»;
«Mi trabajo» con chips de estado, resultado en texto normal, acción en azul y el filtro «Editor y lotes / Código / Todo» (por
defecto, «Editor y lotes»). El resto de la app no cambia de letra ni de colores.

## 7. Tanda 1c (V9.1037)

«Mi trabajo» sin el enlace «Actualizar»: se vuelve a leer la base cada vez que el Builder pasa a verse (al entrar en la pestaña
o al volver del editor; la página le pasa `visible`), sin enseñar «Cargando» y sin recalcular si no hay nada nuevo (la firma de
los lotes y las pruebas, `firmaDatos`). Las estrategias llegan de la página, que las recarga al guardar. Los botones del filtro
dicen cuántas filas hay: «Editor y lotes (N)», «Código (N)», «Todo (N)»; «Todo» = las dos, en el orden de siempre (editor y
lotes arriba, código debajo).

## 8. Tanda 2: el paso 2, «Probarla contra el azar» (V9.1038)

Una pantalla del propio Builder (`components/BuilderPrueba.js`, con el estilo de `lib/builder/estilo.js` y el paso 2 activo).
El usuario solo confirma qué se prueba; lo demás va solo y en orden. La lógica, en `lib/builder/pruebaGuiada.js`: lo MISMO que
hace el modo Lotes del editor (congelar, prueba A / B del lote, calibración y laboratorio), copiado sin cambios para no depender
de esa pantalla; guarda lo mismo en `editor_lotes` y `lab_pruebas`, así que «Mi trabajo», el modo Lotes y «Copiar lote completo»
lo leen igual. Sin motores, validación ni huellas nuevos; sin tablas nuevas.
- **Título** «¿Gana «nombre» por algo más que suerte?» y **«Qué se prueba»** (`textoQueSePrueba`, sale de la configuración):
  la prueba del lote (N valores del Nasdaq-100 por regla, periodos, 500 copias, ≥ 95 % en todos) y el laboratorio (todos los
  miembros del Nasdaq-100, calibrado en 50 mercados inventados).
- **Tarjeta A** «Confirma qué vas a probar»: variantes (la estrategia de la que vienes; «+ Añadir variante» con las guardadas
  del editor), valores (Nasdaq-100 momentum / volatilidad × 10 / 20 / 30; por defecto momentum 30), periodos (2016–2020 y
  2021–2025), nombre propuesto y editable, el aviso de por qué no se puede cambiar después, los errores junto a su campo y el
  único botón verde «Confirmar y probar». Lo común es el de un lote nuevo del modo Lotes (concentrado, 4 posiciones por fuerza
  relativa, diario, 10 000, 500 simulaciones). Solo velas diarias: una estrategia semanal lo dice y no deja confirmar.
- **Tarjeta B** «La app lo hace sola», cuatro etapas (Pendiente / En marcha con barra / Hecho / Error): 1 congelar (si ya
  estaba congelado lo mismo, se sigue con ese); 2 calibrar (solo las variantes sin calibración; si ya la tienen, «se salta»;
  mientras corre: «No cierres esta página; tarda unos minutos»); 3 comparar con el azar (la prueba del lote y el laboratorio,
  periodo a periodo; solo lo que falte); 4 veredicto. Se encadenan solas.
- **Reanudar**: lo hecho se lee de la base (`leeHecho`: el lote en editor_lotes; en lab_pruebas, la ejecución del lote por su
  hash, la calibración por la huella de la variante y su versión, y el laboratorio por la huella con los mismos periodos). Si
  falta algo, «Continuar» sigue desde la primera etapa pendiente. Lo que se corta a medias (una calibración o una prueba del
  lote sin terminar) no se guarda y se repite entera.
- **Veredicto**: la regla de «Mi trabajo» (`veredictoVariante`): con laboratorio y calibración, manda el laboratorio (pasa,
  no llega o sin veredicto si la calibración no la acepta); sin calibración, la prueba del lote.
- **Resultados**: por variante y periodo, «Gana a X % de las copias» (el percentil de la prueba que decide; con el
  laboratorio, también el del lote en pequeño), CAGR y caída máxima (de la prueba del lote) y el chip Pasa / No llega; debajo,
  el veredicto en una frase. Un solo «Copiar para Claude» (el texto de «Copiar lote completo»).
- **Siguiente paso**: si pasa, «Convertirla en plan» (próximamente); si no, «Volver al paso 1» y «Crear prueba nueva con otra
  variante».
- **Lotes existentes** (PRUEBA_EDITOR_1, RETROCESOS_1…): se abren aquí en solo lectura con sus etapas y resultados.
  RETROCESOS_1 sale completo; PRUEBA_EDITOR_1 tiene la prueba del lote pero ni calibración ni laboratorio, así que ofrece
  «Continuar» (solo corre si se pulsa).
- **Mi trabajo**: «Probarla contra el azar», «Calibrar y probar en el laboratorio», «Continuar la prueba», «Ver el resultado» y
  «Revisar la prueba» abren esta pantalla (una estrategia fuera de lotes, para confirmar; si no, su lote). Las de código: «—»
  con una nota (no entran en la prueba guiada). Pulsar el nombre sigue abriendo el editor, el código o el modo Lotes. El modo
  Lotes y el Laboratorio no cambian.

### Tanda 2b (V9.1039): retoques del paso 2 (solo presentación y ayuda)

- **Al terminar, resultados arriba**: con el veredicto hecho (también los lotes en solo lectura), debajo del título van
  «Resultados» y «Siguiente paso»; «Qué se prueba», «Lo que se confirmó» y «La app lo hace sola» quedan en un único plegable
  cerrado, «Ver qué se probó y cómo». Mientras la prueba no ha terminado, el orden de siempre.
- **Chips**: en cada fila, «≥ 95 en este periodo» (verde) o «< 95 en este periodo» (gris). «Pasa» / «No llega» solo en el
  veredicto final, como chip grande junto a su frase.
- **Fechas**: los periodos se escriben como dd/mm/aaaa (`components/CampoFecha.js`, el del Laboratorio); lo guardado sigue en
  ISO, así que el lote y su huella son los mismos. Una fecha imposible o un fin anterior al inicio: error junto al campo y
  «Confirmar y probar» desactivado.
- **QQQ sin hacer nada**: columna con el CAGR y la caída máxima de QQQ comprar y mantener de la misma ejecución del lote
  (`refs.qqq`, lo que el texto copiado llama «B&H QQQ»). Un lote sin ello guardado: «—». Solo informativa.
- **Aviso** junto a «Crear prueba nueva con otra variante»: probar muchas variantes hasta que una pase hace que alguna pase por
  suerte.
- **Ayuda**: los textos en `lib/builder/ayuda.js`; el «?» (`components/BuilderAyuda.js`, se abre al pasar el ratón o al
  tocarlo y se cierra al tocar fuera) junto a «Gana a … de las copias», CAGR, caída máxima, QQQ, la calibración, Pasa / No llega
  y «laboratorio · lote»; y el plegable «Cómo leer estos resultados» con todos los textos.

### Tanda 2c (V9.1040): nombres claros y explicaciones de las pruebas (solo textos)

- **Nombres del Builder** (paso 2, «Mi trabajo», etapas, «Qué se prueba», `lib/builder/ayuda.js`): «laboratorio de
  operaciones» (el laboratorio: media por operación en todo el Nasdaq-100), «laboratorio de cartera» (la prueba A / B del
  lote: la cartera real), «verificación de sesgos» (la calibración) y «mercados ficticios» (sus universos sintéticos). La
  línea pequeña de la tabla: «operaciones · cartera: X %». «Lote» queda solo para el grupo congelado. No cambian las pestañas,
  el modo Lotes ni el texto de «Copiar para Claude»; los registros y sus nombres internos (editorLab, editorLote,
  editorCalibracion) son los de siempre.
- **Cómo decide** (lo que hace el código, `veredictoVariante`): con verificación y laboratorio de operaciones, decide este;
  si la verificación no lo acepta, «sin veredicto» (el laboratorio de cartera NO pasa a decidir). Solo sin verificación
  decide el laboratorio de cartera. Los textos de la tanda 2b decían otra cosa y se han corregido.
- **«Cómo funciona esta prueba»**: plegable cerrado debajo de «Cómo leer estos resultados», con tres partes por variante y
  periodo (laboratorio de operaciones, laboratorio de cartera y, por variante, verificación de sesgos) rellenadas con lo ya
  guardado (operaciones, media real y de la copia típica, nº de copias, señales descartadas por no estar entre los elegidos,
  veces por encima de 95 en los mercados ficticios, percentil medio). Sin un dato, la frase va sin él. Las «descartadas» son
  las entradas en valores que ese año no estaban entre los 30 elegidos (no las que no caben por el límite de posiciones, que
  no se guardan).
- **«Guía de las pruebas»** (`components/BuilderGuia.js`, textos en `lib/builder/ayuda.js`): enlace «Cómo funcionan las
  pruebas» arriba a la derecha del Builder y al final de «Cómo funciona esta prueba» (desde ahí se abre sin desmontar la
  prueba). Nueve apartados: para qué sirve, las copias (ejemplo de Apple), el percentil, P5–P95, por qué ≥ 95 en todos los
  periodos, los dos laboratorios, la verificación de sesgos (la báscula; mercados de precios inventados por paseo aleatorio,
  no barajados; 5 de 50; percentil medio), la limitación de los stops y QQQ.
- **Fechas**: lo escrito vive en la pantalla y `revisaFechas` da los errores en el mismo pintado; con una fecha imposible o un
  fin anterior (o igual) al inicio, «Confirmar y probar» queda desactivado sin esperar a ningún efecto.

### Tanda 2d (V9.1041): «lote» → «prueba», guía visible, botón de confirmar claro (solo textos y presentación)

- **Vocabulario.** En lo que ve el usuario del Builder, «lote» desaparece y se llama **prueba**. Definición (la de la guía,
  `QUE_ES_PRUEBA` en `lib/builder/ayuda.js`): «Una prueba es lo que confirmas en el paso 2: qué variantes, en qué valores y en
  qué periodos. Una vez confirmada, ya no se puede cambiar. Ejemplo: PRUEBA_BUILDER_1 es una prueba con 1 variante, los 30
  valores con más momentum del Nasdaq-100 y 2 periodos (2016–2020 y 2021–2025).» «Prueba» se usa SOLO para ese grupo
  confirmado y congelado; donde antes decía «la prueba» por la comparación con el azar ahora dice «la comparación» (verificación
  de sesgos, en la guía y en «Cómo funciona esta prueba»). «Laboratorio de operaciones», «laboratorio de cartera» y
  «verificación de sesgos» no cambian. Por dentro todo sigue igual: `editor_lotes`, `hash_lote`, `tipo: 'lote'`, las rutas, los
  nombres guardados («PRUEBA_BUILDER_1 · 2026-10-22») y el texto de «Copiar para Claude» (ese sí dice «lote»: no se ve en la
  pantalla).
- Cambios: «Tus estrategias y tus pruebas…», «Nombre de esta prueba», «(prueba PRUEBA_EDITOR_1)» y «En la prueba …, sin
  ejecutar» en Resultado, la línea pequeña de la fila («prueba» / «prueba de planes»), el filtro «Del editor (N)», los errores
  («No encuentro esa prueba.», «Esa prueba ya estaba congelada…», «No se pudieron leer las pruebas…»).
- **Guía**: el enlace pequeño pasa a botón secundario «Guía: cómo se prueba una estrategia» (arriba a la derecha y al final
  de «Cómo funciona esta prueba»). La página se titula «Cómo se prueba una estrategia» y empieza por «Qué es una prueba»
  (10 apartados). Desde la prueba, «← Volver a la prueba».
- **«Confirmar y probar»** desactivado: gris de verdad (`S.botonDesactivado`: fondo #59636e, texto #1c2128, not-allowed) y
  debajo «Corrige lo que está en rojo para continuar.» (sin conexión con la base: «no se puede confirmar»).
- **Fechas**: con el inicio posterior al final, «El inicio (dd/mm/aaaa) es posterior al final (dd/mm/aaaa): cámbialas de
  orden.»; el mismo día, «El inicio y el final son el mismo día (…)». En «Qué se prueba», una fecha mala o vacía sale como
  «(fecha por corregir)» (`nombrePeriodo`), nunca un guion suelto.
- **Chips por periodo**: «Operaciones ≥ 95 en este periodo» / «Operaciones < 95 en este periodo» con su «?» (es del
  laboratorio de operaciones, no del de cartera). En las pruebas sin verificación de sesgos (p. ej. PRUEBA_EDITOR_1) decide el
  laboratorio de cartera, y entonces el chip dice «Cartera ≥ / < 95 en este periodo», con su propio «?»: así cada chip dice de
  qué laboratorio sale.
- **Números**: «1.000 copias» también en «Qué se prueba» (antes «1000»). Todos los miles visibles del Builder llevan punto.
- **Menú**: «Lab. cartera» → «Carteras QQQ + ETF con apalancamiento» (y el título de su pantalla, y las dos menciones del
  editor), para no chocar con el «laboratorio de cartera» del Builder. Al desplegar el menú, las etiquetas largas pasan a dos
  líneas en vez de cortarse. No cambia nada de lo que hace.

#### «Lote» que quedan FUERA del Builder (para la tanda de limpieza)

- **Laboratorio (señales)** (`components/LaboratorioPanel.js`): «Oficial · LOTE_x · …», el confirm de «Ejecutar pendientes»
  («… pendientes del lote …»), «📋 Copiar lote completo», «Al azar (fija, la del lote …)», «no coincide … con ningún elemento de
  un lote declarado», «solo se calibran las combinaciones declaradas en un lote», «cada combinación del lote se probó antes…»,
  la tabla de lotes (LOTE_1–3) y la columna Oficial del historial.
- **Carteras QQQ + ETF con apalancamiento** (antes Lab. cartera, `components/CarteraPanel.js`): «Oficial · CARTERA_x · …»,
  el confirm de «Ejecutar pendientes», «Al abrir un resultado (de un lote, …)», «1 · el de los lotes», «📋 Copiar lote
  completo», la tabla de CARTERA_1–3 y el historial. Su texto de «Copiar para Claude» sigue titulándose «Laboratorio de
  cartera».
- **Editor → modo Lotes** (`components/EditorLotes.js`, `EditorPanel.js`): la pestaña «Lotes», «Declarar un lote», «Un lote
  fija de antemano…», «el lote exige superar al azar en TODOS», «cambiar la estrategia después no cambia el lote», «Huella del
  lote», «Congelar…», «Lotes congelados», «Ejecutar el lote», «📋 Copiar lote completo», «este lote es semanal», «cada periodo
  del lote … el universo del lote», «Ese lote ya está congelado…», «No se pudo congelar el lote…», «…no se pueden congelar
  lotes».
- **Editor → Cartera** (`components/EditorCartera.js`): «la prueba es la misma que la del lote (sale «Oficial»)», «1 (el de
  los lotes congelados)», «es la misma prueba que ese elemento del lote».
- **Multicartera y Backtesting** (`pages/index.js`, `components/AzarCarteraPanel.js`): ningún «lote» visible (solo nombres de
  variables y el mensaje «Actualizados N activos», que no lo dice).
- Textos compartidos con el modo Lotes que el Builder solo usa por dentro: `validaLote` («El lote necesita un nombre», que el
  Builder ya traduce a «Ponle un nombre a la prueba.»; «El lote tiene que ser del formato…», que el Builder muestra como «La
  prueba …»), `textoLoteEditor` (el texto de «Copiar para Claude»).

## 9. «Mi trabajo» en dos pestañas e inicio del Builder (V9.1042)

- **Inicio, «¿Desde dónde empiezas?»**: tres tarjetas en fila (en móvil, una debajo de otra). *En blanco* (botón verde
  «Empezar en blanco»), *Desde una plantilla* (las cuatro de siempre; la del filtro de mercado sigue desactivada) y *Desde una de
  mis estrategias* (desplegable con las del editor y «Copiar y editar»: abre una estrategia NUEVA, sin id, llamada «<nombre>
  (copia)»; la original y sus pruebas no cambian; no se escribe nada hasta pulsar Guardar). Sustituye al recuadro «Siguiente
  paso» y a la sección de plantillas.
- **Mi trabajo**: encima, «Una estrategia es una regla de compra y venta. Una prueba es la comprobación contra el azar de una o
  varias estrategias.» Dos pestañas (`lib/builder/misListas.js`), por defecto «Mis estrategias»:
  - *Mis estrategias (N)*: una fila por estrategia, sin pruebas mezcladas. Estrategia (nombre, que la abre; debajo, su
    descripción o, si no tiene, el principio de su regla: así PRUEBA_BUILDER_1 la estrategia no se confunde con la prueba) ·
    Versión · Última prueba (la que la abre; «ninguna» si nunca se probó) · Cómo le fue (chip Pasa / No llega / Sin veredicto /
    Sin resultados todavía / Sin probar / Borrador y la línea «Decide el laboratorio de … · percentil periodo: X») · Qué toca
    ahora. Filtros «Del editor (N)» y «Código (N)».
  - *Mis pruebas (N)*: una fila por prueba congelada. Prueba (abre sus resultados) · Estrategias que incluye (número y
    nombres) · Valores y periodos · Verificación de sesgos (Superada / No superada / No se hizo, prueba antigua / Pendiente) ·
    Veredicto (chip y «Decide el laboratorio de operaciones / de cartera», por estrategia).
  - El veredicto es el MISMO que enseña la prueba al abrirla (`estadoDesde` y `veredictoVariante` de
    `lib/builder/pruebaGuiada.js`). Sin botones «Editar» ni «Copiar» en las filas.
- **Resultados arriba en todas las pruebas terminadas** (punto 6b). Antes iban arriba solo con las cuatro etapas hechas
  (`completo`); PRUEBA_EDITOR_1 es anterior a la verificación de sesgos y al laboratorio de operaciones, así que nunca estaba
  «completa» y salía en el orden de una prueba sin empezar. Ahora van arriba en cuanto todas las variantes tienen veredicto
  (decida el laboratorio de operaciones o el de cartera). Si le falta algo, debajo del siguiente paso lo dice, con «Continuar»
  dentro de «Ver qué se probó y cómo».
- «Mi trabajo» de la tanda 1 (`lib/builder/miTrabajo.js`, `construyeMiTrabajo`) ya no se pinta; se conserva para comparar.

## 10. Paso 1: el editor por tarjetas (V9.1043)

Una pantalla del propio Builder (`components/BuilderEditor.js`; la lógica, pura, en `lib/builder/tarjetas.js` y
`lib/builder/versiones.js`). Es OTRA FORMA DE VER Y EDITAR la misma definición del editor visual (formato 1, motor 1): no hay
formato, motor, validación ni cálculo nuevos. Leer no cambia nada; cada tarjeta reescribe solo su parte. Una estrategia abierta y
guardada sin tocar no se escribe y su definición es la misma, byte a byte (comprobado con las 4 estrategias del editor, las 5
copias guardadas en las 3 pruebas y los ejemplos 1 V50 y 23).
- Se abre desde el inicio (En blanco, plantillas, «Copiar y editar») y al pulsar el nombre de una estrategia del editor en «Mis
  estrategias». «En blanco» abre una definición vacía (`VACIA` en `lib/builder/plantillas.js`): sin condiciones y sin protección.
- **Cabecera**: «← Builder · Mi trabajo», «Paso 1 · Crear la estrategia», «Guía: cómo se prueba una estrategia»; tarjeta con el
  nombre y una línea de estado («Versión N · sin probar todavía», «Versión N · probada en la prueba X», «Estrategia nueva ·
  todavía sin guardar» o «Copia de X. La original y sus pruebas no cambian.»).
- **Izquierda, catálogo**: buscador (sin tildes; abre los grupos con coincidencias y enseña solo esas) y grupos plegables,
  cerrados por defecto, con su número. El catálogo (`lib/condiciones/catalogo.js`) NO tiene grupos ni descripciones cortas: los
  grupos y las notas grises se definen en `lib/builder/tarjetas.js` (`GRUPOS`, `NOMBRES`, `notaFila`). Precio y medias (3: cierre
  frente a una media, una media frente a otra, caída desde el máximo) · Osciladores (1: RSI) · Volumen (1) · Rupturas (1: nuevo
  máximo de N velas) · Mercado (1: fuerza relativa en el Nasdaq-100). Una condición nueva del catálogo sin grupo iría a «Otras».
  El «+» pregunta «¿Añadir a Compro o a Vendo?».
- **Centro**: «Compro cuando…» (azul) = `entrada.senal`, una fila o Y / O de filas; por defecto «se cumplen todas» (Y).
  «Vendo cuando…» (naranja) = las salidas por condición: una salida por fila («basta con una», por defecto: el motor sale con la
  primera que se cumpla) o una sola salida con Y de filas («todas»). El motor admite las dos cosas en las dos tarjetas. Cada fila
  es una condición del catálogo (sola, «empieza a cumplirse» = cruza o «no se cumple» = NO) con sus números editables en la
  fila, la nota gris y la ×. Un número que en la definición es un parámetro (`$nivelRSI`) cambia el VALOR del parámetro (su rango,
  en Avanzado). Errores junto a la fila (borde rojo y la frase con un ejemplo válido): periodos ≥ 1, RSI y percentiles entre 0 y
  100, números, media rápida más corta que la lenta, el rango declarado de un parámetro.
- **Protección**: «Stop de pérdidas» (stop en % bajo el precio de compra), «Objetivo de ganancia» y «Salida por tiempo»; las tres
  en «Ninguno» de entrada, y «Ninguno» = sin protección (como hoy). El objetivo del motor se mide en **veces lo que arriesgas** (la
  distancia hasta el stop: `multiploR`), no en %, y necesita un stop. La salida por tiempo se cuenta en **VELAS**, que es lo que
  cuenta el motor (`tope`: vende a la apertura de la vela N + 1 contando la de entrada, o sea, como mucho N velas dentro), con la
  equivalencia al lado («10 días de mercado, porque esta estrategia usa velas diarias» o semanas). No hacía falta tocar el motor.
- **Avanzado** (plegado): las velas (diarias / semanales), la regla tal como la lee el motor y los formularios del editor de
  siempre (`FormularioDefinicion`, sacado de `components/EditorPanel.js` sin cambiar lo que pinta: Parámetros con defecto / valor /
  de-a, Entrada, Filtro de mercado, Stops con su orden, Salidas). Si la estrategia tiene partes que no caben en las tarjetas, arriba
  «Esta estrategia tiene partes que solo se pueden ver y cambiar en Avanzado.» con la lista (`partesAvanzado`): orden de compra
  stop / límite / al cierre, cancelación de la orden, «el día de la entrada no se miran stops ni salidas», filtro de mercado,
  stops que no son un % (trailing, técnico, ATR, mínimo de N velas), salidas que dependen de un parámetro, combinaciones
  anidadas. De las 4 estrategias del editor, solo «Copia editor 23» tiene partes así (orden stop, cancelación, trailing y el día
  de la entrada); también la 1 V50 y la 23 de ejemplo.
- **Derecha**: «La regla, en una frase» (sale de las tarjetas, compra en azul y venta en naranja; un número con error, «[?]»);
  «Comprobación» (condición de compra, forma de salir, datos suficientes: el calentamiento de la condición más larga frente a las
  velas que carga el backtest, `velasCalentamiento` como `lib/backtestActivo.js`; si faltan, aviso ⚠ que no bloquea; y «✕ N errores
  en …»); «Guardar y pasar al paso 2» verde, o gris de verdad con «Corrige lo que está en rojo para continuar.». Guarda lo mismo que
  el editor de siempre (`/api/strategies`, que vuelve a validar) y abre el paso 2 con esa estrategia.

### Versiones (decisión de Sergi)

Lo que se encontró (auditoría d): una prueba congelada guarda su propia COPIA de cada estrategia (`lote.variantes[].definicion` y
`valores`, con su huella); no guarda el id de la estrategia, y no existía ninguna «versión de la estrategia» (la verificación de
sesgos se hace una vez por HUELLA: definición + valores). Cambiar una estrategia nunca cambiaba lo probado, pero sí la sacaba de su
prueba en «Mi trabajo» (otra huella).
Ahora: si se cambia la REGLA (la huella) de una estrategia que está en alguna prueba congelada, al guardar no se sobrescribe: se
crea una estrategia nueva «<nombre> · versión N» (N = la mayor que exista + 1) y la original sigue igual, enlazada a su prueba. La
pantalla lo avisa antes de guardar: «Esta estrategia ya está en la prueba X. Al guardar se creará la versión 2 («X · versión 2»);
la prueba X seguirá con la versión 1.» Cambiar solo el nombre o la descripción, o una estrategia que no está en ninguna prueba, se
guarda en la misma. La versión se lee del nombre (`partesNombre`): no hay columna ni campo nuevos.

### Pendiente

- Guardar la versión en un campo propio (p. ej. una columna `version` y otra con el id de la estrategia de la que sale) en vez de en
  el nombre, y agrupar las versiones en una sola fila de «Mis estrategias». Cambia cómo se guarda: se deja para cuando Sergi lo decida.
- Objetivo de ganancia en %: el motor solo lo tiene en veces el riesgo. Haría falta un tipo de salida nuevo en el motor.
- Quitar «Editor» y «Estrategias» del menú y el enlace «Editor clásico», cuando Sergi haya usado el editor nuevo.
- El paso 2 sigue solo con velas diarias. La plantilla «Filtro de mercado» sigue desactivada (el filtro va dentro de Avanzado).
- Comprobado con montaje SWC (sin navegador): falta verlo y tocarlo en la app.

## 11. Editor sin «Avanzado», filas en una línea y «Solo opero cuando…» (V9.1044)

### Auditoría (solo lectura)

- **a) Números unidos a un parámetro.** Un valor `'$nombre'` en una condición o un stop es el parámetro `nombre` de la
  estrategia (`parametros.lista`); el motor lo cambia por su valor (`valoresDe`: el guardado en `params` o el defecto) con
  `resuelve`. Así el optimizador puede variarlo. Lo usan las 4: PRUEBA_BUILDER_1 y Retroceso líderes RSI2 (`$nivelRSI`, el nivel
  del RSI) y Copia editor 23 y Prueba editor EMA20 (`$ema`, el periodo de la EMA).
- **b) Anidar.** Sí: una condición es un árbol (`Y`, `O`, `NO`, `cruza`, `histeresis`) que el intérprete y la validación recorren
  enteros. «filtro Y (A o B)» se guarda `{ c: 'Y', de: [filtro, { c: 'O', de: [A, B] }] }`.
- **c) Filtro de mercado.** `filtroMercado: { ticker, si }`: UN solo ticker (cualquier símbolo de Yahoo en mayúsculas: QQQ, SPY,
  ^GSPC…) y una condición del catálogo (que puede ser un árbol) calculada en sus velas y llevada a las fechas del valor. Las de
  universo (fuerza relativa) no sirven ahí. Solo afecta a la ENTRADA. La verificación de sesgos del paso 2 corre en mercados
  ficticios SIN ese ticker: con un filtro de un índice, ahí no compraría nunca (pendiente, ver abajo).
- **d) Stops.** Cinco tipos: `porcentaje` (pct), `minimoVelas` (n), `atr` (k, periodo), `nivel` (el mínimo de expresiones de la
  vela que fija la orden: mínimo, máximo, cierre o una media) y `trailing` (cuando se cumple una condición `si`, sube al mínimo de N
  velas o al cierre − k × ATR; nunca baja). Puede haber varios: se comprueban en su orden y el primero que salta cierra la operación.
  Opciones: `activa` (se enciende con un parámetro), `retiraSiSupera`, `historialAlEntrar`, `soloSobreEntrada`.
- **e) Ejecución.** Por defecto, compra a la apertura de la vela siguiente a la señal, sin cancelación, y se miran stops y salidas
  ya en la vela de la compra. Otras: orden al cierre, orden stop o límite (con nivel y ajuste), cancelación, «no mirar la vela de
  entrada». De las 4, solo **Copia editor 23** usa opciones que no son las de por defecto: orden stop en el máximo de la vela de la
  señal que solo baja, cancelación si cierra bajo la EMA y no mirar stops ni salidas en la vela de la compra.
- **f) «No se cumple».** `{ c: 'NO', de: condición }` (Copia editor 23: «NO (cierre < EMA 20)»).
- **Por qué las filas salían una debajo de otra**: la hoja de estilos de la app (`styles/`) pone `width: 100%` a todos los `select`
  e `input`; ahora los de las filas llevan `width: auto` y la fila no se parte (`flex-wrap: nowrap`).

### Cambios

- **Inicio**: «Desde una plantilla» es un desplegable («Elige la plantilla», sin la no disponible), la regla de la elegida (en velas)
  y «Usar esta plantilla». Las tres tarjetas, de la misma altura. El enlace de arriba pasa a llamarse **«Editor de código»**: «Editor
  clásico» quiere decir ya solo la pestaña «Editor» (el editor visual de formularios).
- **Mis estrategias**: debajo del nombre, la regla completa sin cortar (`reglaDe`, el mismo generador que el editor).
- **Editor** (`components/BuilderEditor.js`, `lib/builder/tarjetas.js`): sin «Avanzado» ni parámetros ni optimizador (siguen en el
  Editor clásico, sin cambios). Velas junto al nombre. Orden: «Solo opero cuando…» (morada) → «Compro cuando…» → «Vendo cuando…» →
  «Protección» → la línea de ejecución. Si la estrategia usa opciones que no son las de por defecto (`opcionesClasico`), aviso arriba
  con la lista en palabras sencillas y «Abrir en el Editor clásico»; al guardar se conservan.
- **«Solo opero cuando…»**: cada fila con «de quién» (QQQ, SPY, ^NDX, ^GSPC, IWM, DIA o «Este valor»); se cumplen todas. Las del
  índice son el filtro de mercado (un solo ticker: cambiarlo en una fila lo cambia en todas). Las de «Este valor» van DELANTE en la
  señal, `Y(filtro…, compra)`, y `diseno.filtrosValor` dice cuántas son (`diseno` no entra en la huella ni en el motor), así siguen
  siendo filtro con «al menos una» en la compra. Comprobado con una serie inventada: las compras calculadas a mano = las del motor.
- **Filas**: en una línea; solo se editan los números, el símbolo (>, <, ≥, ≤, cruza ↑ / ↓) y el tipo de media. Nota gris según la
  tarjeta, «?» con la explicación, menú «…» («Darle la vuelta (NO)» y, sin símbolo, «Solo la vela en que empieza a cumplirse») y ×.
  Una fila dada la vuelta lleva la etiqueta «NO» y se dice en positivo («No (cierre < EMA 20)» → «el cierre está en o por encima de su
  media exponencial de 20 velas»). Un número unido a un parámetro se ve como cualquier otro; si se cambia, queda fijo (el parámetro no
  se borra).
- **Protección**: «Stop de pérdidas» con los cinco tipos (los mismos valores por defecto que el Editor clásico: `lib/editor/piezas.js`),
  cada uno con su ejemplo en euros; varios stops en su orden. El trailing de la casilla es el del motor (sube al mínimo de N velas
  cuando una vela cierra bajo su media), no un trailing en %. «Objetivo de ganancia (según el stop)» desactivado sin stop y con el
  cálculo («Con el stop al 8 %, vende al subir un 16 %»). «Salida por tiempo» en velas con «= N días de mercado…».
- **Textos**: «Hay datos suficientes: la condición más larga necesita N velas previas.»; si faltan, en rojo y explicado. La regla
  empieza por el filtro, va en velas, sin dobles negaciones y termina con «Compro y vendo a la apertura de la vela siguiente a la
  señal» y la protección.

### Pendiente

- La verificación de sesgos (paso 2) no tiene el ticker del filtro de mercado en sus mercados ficticios: una estrategia con filtro
  de un índice no compraría allí y quedaría sin veredicto. Habría que inventar también el índice (cambia el cálculo: decisión de Sergi).
- Trailing en % («sube a 120 € → vende a 108 €»): el motor no lo tiene; haría falta un tipo de stop nuevo.
- Un filtro de mercado con dos índices distintos (QQQ y SPY a la vez): el motor admite uno.

## 12. Índice ficticio, más historia, índices claros y «Cómo compro» (V9.1045)

### Auditoría (solo lectura)

- **a) Mercados ficticios.** `calibraDefinicion` (`lib/editor/laboratorio.js`): 50 mercados de 100 valores, cada uno un paseo
  aleatorio (2 % diario, ligera subida), con 260 velas previas, 5 años y 200 velas después; semilla de la huella. No había índice: una
  estrategia con filtro de índice no compraba nunca ahí → menos del 80 % de mercados con operaciones → «Sin veredicto».
- **b) Velas previas.** No es el mismo número en todos: backtest del editor y laboratorio de cartera (multibacktest) y la ficha de un
  activo: `velasCalentamiento` = máx(3 × la ventana declarada más larga, 250 en diario / 60 en semanal). Laboratorio de operaciones:
  3 años (unas 756 velas; 6 años en semanal). Verificación de sesgos: 260 inventadas. Paso 3 (planes): QQQ y el ETF desde 3 años
  antes; no ejecuta estrategias del editor. Datos guardados de la app (precios_diarios): ^NDX y ^GSPC desde 21/10/1991, SPY desde
  19/10/1998, QQQ desde 10/03/1999; IWM y DIA **no están**; de los 327 valores, 218 tienen datos desde antes de 2013.
- **c) Índices.** El filtro admite cualquier símbolo de Yahoo; ninguna estrategia ni prueba guardada usa ^NDX ni ^GSPC (ni ningún
  filtro de mercado).
- **d) Cómo compro.** Orden: a la apertura siguiente (por defecto), al cierre de la vela de la señal, orden stop o límite en el
  máximo / mínimo / cierre de las N últimas velas, con ajuste (fijo, solo baja, solo sube) y una condición que la cancela. Vigilancia:
  por defecto se miran stops y salidas ya en la vela de la compra; `revisaSalidasEnLaVelaDeEntrada: false`, desde la siguiente.
- **e) Menú «…».** Iba con posición absoluta dentro de la fila, que tiene desplazamiento horizontal (para no partirse): el navegador
  lo recortaba y le ponía scroll. Los desplegables nativos (select) no tienen ese problema.

### Cambios

- **Índice ficticio** (decisión de Sergi, opción a): con filtro de índice, en cada mercado ficticio el filtro mira `indiceFicticio`:
  la media de las rentabilidades diarias de cierre a cierre de sus 100 valores, acumulada desde 100 (apertura, máximo y mínimo = el
  cierre; sin volumen). Sin filtro de índice no se calcula: la verificación es la misma byte a byte (la de PRUEBA_BUILDER_1, completa,
  idéntica a V9.1044 y a la guardada). Las ya hechas no se recalculan. Frase en «Cómo funciona esta prueba» y en la guía.
- **Más historia solo cuando haga falta** (`lib/editor/historia.js`): `velasNecesarias` (la condición más larga y las ventanas de los
  stops); si pasan de lo de siempre, se cargan esas más un margen (máx(20, 10 %)) en el backtest, la ficha, el laboratorio de cartera,
  la verificación de sesgos y, si pasan de sus 3 años, el laboratorio de operaciones. Las que caben no cambian (las 4 estrategias y las
  5 copias en pruebas necesitan 250 o menos). «Comprobación»: «Hay datos suficientes…», «Necesita N velas previas: se cargarán
  automáticamente.» o, si el índice no tiene datos tan atrás (o no está guardado), un aviso en rojo con las fechas.
- **Índices**: «Este valor» · «Nasdaq-100 (QQQ)» · «S&P 500 (SPY)» · «Pequeñas empresas de EE. UU. (IWM)» · «Dow Jones (DIA)», con
  su «?». ^NDX y ^GSPC ya no se ofrecen; si una estrategia los usa, los sigue viendo con nombre claro.
- **«Cómo compro»** (entre «Vendo cuando…» y «Protección»): a la apertura de la vela siguiente (lo normal) o con una orden en el
  máximo de la vela de la señal (o de las N últimas), con «si no llega, la orden se queda / baja / sube» y «Cancelar la orden si…» (una
  fila). Producen la misma definición que el Editor clásico con los mismos valores. En «Protección», «Los stops y las salidas empiezan
  a vigilarse: desde la vela siguiente a la compra / ya en la vela de la compra». La línea de ejecución y la regla lo dicen. Copia
  editor 23 ya no tiene opciones solo del Editor clásico: sin aviso amarillo.
- **Menú «…»** con posición fija y por encima de todo; si no cabe hacia abajo, se abre hacia arriba. «Nombre de la estrategia» con la
  letra del Builder.

### Qué falta para poder quitar el Editor clásico

- Lo que el editor nuevo todavía no tiene: orden límite y compra al cierre; orden en el mínimo o el cierre; stops que se encienden con
  un parámetro, «se retira cuando otro lo supera», «solo por encima de la compra» y el nivel con medias (la 1 V50); el trailing por ATR;
  salidas que dependen de un parámetro; combinaciones anidadas a mano (O dentro de Y en la venta, histéresis); el filtro de mercado
  con «al menos una».
- Parámetros y optimizador (defecto, valor, rangos de-a, restricciones): hoy solo en el Editor clásico; el Builder no los enseña.
- «Exportar a code_js» y «Probar en backtest» (abrir la estrategia en el gráfico) desde el Builder.
- Los modos «Cartera (QQQ + ETF)» y «Lotes» del Editor (el paso 3 y el modo Lotes antiguo).
- (Hecho el 24/10/2026, V9.1046: IWM desde 26/05/2000 y DIA desde 20/01/1998 ya están en los precios guardados, con
  `node scripts/llenaCachePrecios.js --simbolo IWM --anios 30` y lo mismo con DIA; el filtro con ellos funciona también en los
  laboratorios del paso 2.)

## 13. Catálogo de condiciones completo y selector de índice explicado (V9.1047)

### Auditoría (solo lectura)

- **a) Lo que calcula el motor.** `lib/backtester.js`: `calcEMA` (siembra con la SMA de los N primeros), `calcSMA` (la del code_js:
  suma los nulos como 0, a propósito), `calcRSI` (Wilder), `calcATR` (Wilder), `calcBollinger` (media de N y desviación
  poblacional), `calcVolumeAvg` y `calcMACD` (línea = EMA rápida − EMA lenta; señal = EMA de la línea). `lib/indicadores.js`:
  `calcSMAEstricta` (null si falta un dato de la ventana). En el catálogo (`lib/condiciones/indicadores.js`, con caché): media
  (EMA / SMA del cierre), RSI, ATR y el máximo de las N velas anteriores; y la media del volumen de `volumenAlto`. Comparaciones del
  catálogo: estrictas (> y <; `precioVsMedia` y `mediaVsMedia` admiten también ≥), frente a otra media o a un número, y los
  combinadores «cruza» (cruce al alza o a la baja), NO, Y, O e histéresis. **No hay** estocástico ni ADX en ninguna parte del motor.
- **b) A quién.** El filtro de índice (`filtroMercado`) calcula la condición con las velas del índice (`enReferencia`), así que vale
  cualquier condición que salga de las velas. Solo la fuerza relativa no: lee `rsPercentil`, que el servidor calcula para cada valor
  con todo el Nasdaq-100 (un índice no lo tiene).
- **c) Las 7 de antes.** Cálculo en `lib/condiciones/catalogo.js` (`CONDICIONES_NIVEL` + `CONDICIONES_UNIVERSO`); nombres, grupos,
  notas, frases y «?» en `lib/builder/tarjetas.js` (escritos en V9.1043 sin revisar: la media de 20 era «corta», las notas casi no
  cambiaban con la tarjeta).
- **d) Fallos conocidos.** `calcEMA` con un cierre que falta a mitad de la serie: la vela siguiente vale `cierre × k` (el hueco cuenta
  como 0) y el error se arrastra (§7 de `docs/catalogo-condiciones.md`; con datos limpios no ocurre). Afecta a todo lo que usa EMA:
  la media EMA, «Una media frente a otra» con EMA y **el MACD** (se añade, con este aviso). `calcATR`: con un precio que falta, NaN y
  desde ahí «sin dato» (no da valores falsos). `calcBollinger` salta los huecos y alargaría la ventana: la condición nueva pone «sin
  dato» mientras haya un hueco en la ventana. No se arregla nada aquí.

### Cambios

- **Ficha de cada condición** (`lib/builder/fichas.js`): grupo; nombre corto; la fila con sus números; la nota gris según la tarjeta
  (filtro, compra, venta o cancelar la orden) y según los números (plazo de una media: 5 velas «corta», 20 «de un mes», 50 «de
  plazo medio», 200 «larga, de casi un año»; en semanal, cada vela cuenta como 5 días); el trozo de «La regla, en una frase»; la
  explicación con un ejemplo numérico (el «?» del catálogo y el de cada fila); qué es cada número y un ejemplo para el mensaje de
  error («El nivel del RSI va de 0 a 100 (por ejemplo, 15).»; el rango es el del catálogo, el mismo que comprueba la validación al
  guardar); a quién se aplica. Las velas previas son el calentamiento del catálogo. La definición guardada no cambia.
- **Condiciones nuevas** (`lib/condiciones/catalogo.js`, solo con lo que el motor ya calcula; funciones nuevas en
  `lib/condiciones/indicadores.js`: `minimoPrevio`, `maximoHasta`, `macd`, `bollinger`; las de antes no cambian): la media sube o baja,
  cierre cerca de su media, cierre frente al de hace N velas, ROC, MACD frente a su señal, MACD frente a 0, cierre frente a una banda
  de Bollinger, ATR en % del precio, volumen bajo, nuevo mínimo de N velas y cierre cerca del máximo de N velas. Las comparaciones en
  % se escriben sin dividir (justo en el nivel no cuenta, sin depender del redondeo).
- **Entradas del catálogo**: algunas son una condición con «cruza» o con unos valores de partida («El cierre cruza su media», «Cruce
  de dos medias», «El RSI cruza un nivel», «El MACD cruza su señal», y las dos de Bollinger). Grupos plegables con su número, en el
  orden Precio y medias · Osciladores · Volatilidad · Volumen · Rupturas · Mercado; el buscador mira el nombre, unas palabras clave y
  la explicación. Mercado empieza con «Para filtrar por un índice (QQQ, SPY…), añade cualquier condición a «Solo opero cuando…» y
  elige el índice en su fila.»
- **Selector de índice**: con la fuerza relativa, los índices salen en gris y debajo de la fila: «Esta condición solo se puede aplicar a
  este valor: la fuerza relativa compara este valor con los demás del Nasdaq-100; a un índice (QQQ, SPY…) no se le puede aplicar.»
- **Darle la vuelta (NO)**: dos veces seguidas deja la definición igual byte a byte (también las ventas y el filtro de índice, que al
  reescribirse cambiaban el orden de sus claves). Lo que vio Sergi en «Copia editor 23»: la fila «Cierre < EMA (20)» sin NO es la de
  «Cancelar la orden si…», y así está guardada; la compra es «NO Cierre < EMA (20)». Pero había un fallo: en una fila con NO, elegir
  «cruza ↑» en el símbolo le quitaba el NO sin avisar, y al volver a «<» la fila quedaba al revés. Ahora, con NO, los cruces salen en
  gris; con «cruza», «Darle la vuelta» sale en gris y dice por qué.
- **Exportar a code_js**: el motor copiado en el código exportado no tiene las condiciones nuevas; una estrategia que las use dice
  «El exportador todavía no sabe copiar esta condición…» en vez de dar un código que fallaría. Las de antes se exportan igual.

### El catálogo

| Grupo | Condición (en el catálogo) | Fila | Números y rangos | Velas previas que necesita | A quién se aplica |
|---|---|---|---|---|---|
| Precio y medias | Cierre frente a su media | Cierre > SMA (200) | el periodo de la media: 1–1.000 (entero); tipo de la media: EMA / SMA | periodo (con la fila de partida: 200) | este valor o un índice |
| Precio y medias | El cierre cruza su media (= «Cierre frente a su media» con «cruza») | Cierre cruza ↑ EMA (20) | el periodo de la media: 1–1.000 (entero); tipo de la media: EMA / SMA | periodo (con la fila de partida: 20) | este valor o un índice |
| Precio y medias | Una media frente a otra | EMA (10) > EMA (50) | el periodo de la media rápida: 1–1.000 (entero); el periodo de la media lenta: 1–1.000 (entero); tipo de la media rápida: EMA / SMA; tipo de la media lenta: EMA / SMA | la lenta (con la fila de partida: 50) | este valor o un índice |
| Precio y medias | Cruce de dos medias (= «Una media frente a otra» con «cruza») | EMA (10) cruza ↑ EMA (50) | el periodo de la media rápida: 1–1.000 (entero); el periodo de la media lenta: 1–1.000 (entero); tipo de la media rápida: EMA / SMA; tipo de la media lenta: EMA / SMA | la lenta (con la fila de partida: 50) | este valor o un índice |
| Precio y medias | La media sube o baja | SMA (50) > la de hace 5 velas | el periodo de la media: 1–1.000 (entero); el número de velas atrás: 1–500 (entero); tipo de la media: EMA / SMA | periodo + N (con la fila de partida: 55) | este valor o un índice |
| Precio y medias | Cierre cerca de su media | Cierre a menos de 3 % de su SMA (20) | el periodo de la media: 1–1.000 (entero); la distancia: 0,1–100; tipo de la media: EMA / SMA | periodo (con la fila de partida: 20) | este valor o un índice |
| Precio y medias | Cierre frente al de hace N velas | Cierre > el de hace 5 velas | el número de velas atrás: 1–1.000 (entero) | N (con la fila de partida: 5) | este valor o un índice |
| Precio y medias | Caída desde el máximo | Caída ≥ 10 % desde el máximo de 252 velas | el número de velas del máximo: 2–2.000 (entero); la caída: 0–100 | velas del máximo (con la fila de partida: 252) | este valor o un índice |
| Osciladores | RSI frente a un nivel | RSI (14) > 50 | el periodo del RSI: 1–100 (entero); el nivel del RSI: 0–100 | periodo + 1 (con la fila de partida: 15) | este valor o un índice |
| Osciladores | El RSI cruza un nivel (= «RSI frente a un nivel» con «cruza») | RSI (14) cruza ↑ 30 | el periodo del RSI: 1–100 (entero); el nivel del RSI: 0–100 | periodo + 1 (con la fila de partida: 15) | este valor o un índice |
| Osciladores | MACD frente a su señal | MACD (12, 26, 9) > su señal | la media rápida del MACD: 1–500 (entero); la media lenta del MACD: 2–1.000 (entero); la señal del MACD: 1–500 (entero) | lenta + señal (con la fila de partida: 35) | este valor o un índice |
| Osciladores | El MACD cruza su señal (= «MACD frente a su señal» con «cruza») | MACD (12, 26, 9) cruza ↑ su señal | la media rápida del MACD: 1–500 (entero); la media lenta del MACD: 2–1.000 (entero); la señal del MACD: 1–500 (entero) | lenta + señal (con la fila de partida: 35) | este valor o un índice |
| Osciladores | MACD frente a 0 | MACD (12, 26) > 0 | la media rápida del MACD: 1–500 (entero); la media lenta del MACD: 2–1.000 (entero) | lenta (con la fila de partida: 26) | este valor o un índice |
| Osciladores | ROC: cambio en % en N velas | Cambio en 10 velas > 5 % | el número de velas: 1–1.000 (entero); el nivel del cambio: −100–1.000 | N (con la fila de partida: 10) | este valor o un índice |
| Volatilidad | Cierre bajo la banda inferior de Bollinger (= «Cierre frente a una banda de Bollinger») | Cierre < banda inferior de Bollinger (20, 2) | el periodo de las bandas: 2–1.000 (entero); las desviaciones de las bandas: 0,1–10; banda: inferior / superior | periodo (con la fila de partida: 20) | este valor o un índice |
| Volatilidad | Cierre sobre la banda superior de Bollinger (= «Cierre frente a una banda de Bollinger») | Cierre > banda superior de Bollinger (20, 2) | el periodo de las bandas: 2–1.000 (entero); las desviaciones de las bandas: 0,1–10; banda: inferior / superior | periodo (con la fila de partida: 20) | este valor o un índice |
| Volatilidad | ATR en % del precio | ATR (14) en % del precio > 3 % | el periodo del ATR: 1–200 (entero); el nivel del ATR: 0–100 | periodo (con la fila de partida: 14) | este valor o un índice |
| Volumen | Volumen alto | Volumen > 1,5 × su media de 20 velas | las veces la media: 0–100; el número de velas de la media: 1–500 (entero) | N + 1 (con la fila de partida: 21) | este valor o un índice |
| Volumen | Volumen bajo | Volumen < 1 × su media de 20 velas | las veces la media: 0–100; el número de velas de la media: 1–500 (entero) | N + 1 (con la fila de partida: 21) | este valor o un índice |
| Rupturas | Nuevo máximo de N velas | Cierre > máximo de las 20 velas anteriores | el número de velas: 1–1.000 (entero) | N (con la fila de partida: 20) | este valor o un índice |
| Rupturas | Nuevo mínimo de N velas | Cierre < mínimo de las 20 velas anteriores | el número de velas: 1–1.000 (entero) | N (con la fila de partida: 20) | este valor o un índice |
| Rupturas | Cierre cerca del máximo de N velas | Cierre a menos de 5 % del máximo de 50 velas | la distancia: 0,1–100; el número de velas: 1–1.000 (entero) | N (con la fila de partida: 50) | este valor o un índice |
| Mercado | Fuerza relativa en el Nasdaq-100 | Fuerza relativa > percentil 80 | el percentil: 0–100 | 253 (12 meses) (con la fila de partida: 253) | solo este valor |

Las condiciones con «lado» admiten en la fila >, < y «cruza ↑ / ↓» (las de medias, también ≥ y ≤); todas admiten «Darle la vuelta (NO)».
Las de volumen en un índice miran el volumen del fondo (QQQ, SPY…); en algunos ETF el volumen de Yahoo no es fiable.

### Lo que no se pudo añadir (el motor no lo calcula)

- **Estocástico** (por debajo o por encima de un nivel): haría falta su cálculo (%K = posición del cierre entre el mínimo y el máximo
  de N velas, y %D = su media), una función nueva en el motor y su prueba.
- **ADX** (fuerza de la tendencia): haría falta el cálculo de Wilder de +DI, −DI y su media (otra función nueva en el motor).
- **Otras medidas del valor frente al mercado** (por ejemplo, «sube más que el QQQ en 3 meses»): el motor solo da a una condición de
  «Este valor» sus propias velas; las del índice solo llegan al filtro de índice. Habría que pasar también las velas del índice a las
  condiciones del valor (un cambio en el intérprete y en el backtest).

## 14. «Backtest de un valor» y las estrategias de código en el Builder (V9.1048)

Regla (decisión de Sergi, opción A): **el Builder es para «qué es la estrategia»; la pestaña es para «cómo se ejecuta y se ve en
el gráfico».** Dos tipos de estrategia en los textos: «de tarjetas» (una lista de reglas que lee el motor) y «de código» (un programa
en JavaScript con parámetros). No se borra ninguna estrategia, dato ni cálculo; el Editor clásico no cambia.

### Auditoría (solo lectura)

- **a) Lo que hacía la pestaña «Estrategias»**: la lista con ▶/■ (activar o parar la estrategia del backtest de un valor; el selector
  de arriba solo aparece si ya hay una activa), «Condiciones de la simulación» (periodo, capital, temporalidad, comisiones), los
  filtros de mercado y del activo, la búsqueda, «+» (estrategia de código nueva), el panel de edición (nombre, color, capital, % por
  operación, años, temporalidad, descripción con el resumen de la IA, parámetros en JSON, marcadores visuales, código JS, Guardar,
  Clonar, Eliminar) y la tabla ⊞ (métricas del ranking por estrategia, activar o desactivar, cambios a la vez de temporalidad, capital
  y años, Eliminar, Nueva). **Eliminar borra de verdad** (DELETE en la base; no es una papelera).
- **b) Quién lee estrategias de código**: el backtest de un valor, Backtesting (multicartera), Optimización, la ficha del activo, el
  ranking y el guardián entienden las dos clases. **Solo las de tarjetas**: el paso 2 del Builder (las pruebas congeladas guardan
  definiciones de tarjetas y la verificación de sesgos las ejecuta con el intérprete) y, hasta hoy, «Copiar y editar». Coste de que el
  paso 2 admita código: grande (guardar el código en la prueba y ejecutarlo en los mercados ficticios y en los laboratorios); no se
  hace. El Laboratorio y Carteras QQQ + ETF no usan la tabla de estrategias (catálogo de señales propio).
- **c) Las 75 de código**: 47 tienen datos guardados (ranking de la Watchlist; «1 V50 EMA10/11» y «2 V50f1» también en el TradeLog);
  50 están activadas. Ninguna prueba congelada (LOTE_1–3, CARTERA_1–3, RETROCESOS_1, PRUEBA_EDITOR_1, PRUEBA_BUILDER_1) usa una
  estrategia de código. La estrategia activa se guarda en el navegador.
- **d) Enlaces**: no hay rutas (una sola página); se llegaba por el menú lateral, el enlace «Editor de código» del Builder y los
  botones «Probar en backtest» y «Exportar a code_js» del Editor clásico.

### Dónde ha ido cada función

| Función | Ahora |
|---|---|
| Ver una estrategia de código; cambiar sus parámetros (números), nombre, velas y descripción; resumen con la IA | Builder → pulsar su nombre → apartado «Código de la estrategia» (`components/BuilderCodigo.js`, `lib/builder/codigo.js`) |
| Ver el código | Ahí, plegado y solo para leer («Solo para leer. Si hay que cambiarlo, pídelo.») |
| Duplicar | Builder → «Desde una de mis estrategias» → «Copiar y editar» (con las de tarjetas y las de código) |
| Crear una estrategia de código | Ya no se puede: todas las nuevas, de tarjetas («+» quitado; «+ Nueva» de la tabla ⊞ abre el Builder) |
| Pasar al paso 2 | No: botón desactivado con «Las estrategias de código no se pueden probar contra el azar. Para probarla, rehazla en tarjetas.» |
| ▶/■, condiciones de la simulación, filtros, tabla ⊞ (métricas, activar o desactivar, cambios a la vez) | Se quedan en la pestaña, que se llama **«Backtest de un valor»** |
| Color, capital, % por operación, años, temporalidad, marcadores visuales, Eliminar | En la pestaña, botón ⚙ de cada fila (panel sin código, sin JSON, sin descripción y sin «Clonar»; guarda solo lo que cambia) |
| Pulsar una estrategia en la pestaña (o «editar» en la tabla ⊞) | La abre en el Builder (de tarjetas o de código) |
| «Probar en backtest» y «Exportar a code_js» del Editor clásico | Llevan a «Backtest de un valor», con esa estrategia activa |
| Enlace «Editor de código» del Builder | Se llama «Backtest de un valor» y lleva a la pestaña |

Guardar en el apartado de código: abierta y guardada sin tocar, no se escribe nada; con cambios, PUT solo de lo que cambia (params
reescrito cambiando solo esos valores, en su sitio; el código no se manda). Si estuviera en una prueba congelada y cambian sus
parámetros o sus velas, se crea «Nombre · versión N» (POST con el mismo código; `pages/api/strategies.js` acepta ahora code_js en un
POST). El panel completo de antes (`StrategyEditorPanel` sin `soloEjecucion`) queda en el código **sin enlazar**; se borrará en otra
tanda cuando Sergi confirme que no lo echa de menos.

### Los filtros de la pestaña frente a «Solo opero cuando…»

- **Filtros de la pestaña** («Filtros solo para este backtest (no forman parte de la estrategia)»): la estrategia se ejecuta entera y
  después `filtraPorEntrada` (`lib/nucleoBacktest.js`) quita las operaciones cuya entrada cae en un día en que el filtro no deja
  (mirado al cierre anterior). Una operación quitada no se sustituye: la estrategia «estaba dentro» esos días y no buscó otra entrada.
  Son la misma lista en «Backtesting» (multicartera). No entran en la huella ni en el paso 2 (las pruebas van «sin filtros»). Cálculo
  1 (el de siempre): sin dato deja pasar, «≥», EMA sobre la rejilla del activo; el cálculo 2 (catálogo) existe por filtro. Un code_js
  puede además leer `filtroActivo` de cada vela.
- **«Solo opero cuando…»** (Builder): es parte de la regla (`filtroMercado` y las filas de «Este valor» delante de la señal). El
  intérprete no arma la orden ese día y la estrategia queda libre para comprar en cuanto se cumpla; sin dato, no compra; comparaciones
  estrictas; entra en la huella, en el paso 2 y en todos los laboratorios.
- **Se suman**: en el backtest de un valor y en Backtesting, primero decide la regla (con su «Solo opero cuando…») y después el filtro
  de la pestaña quita operaciones. Para unificarlos (otra tanda) habría que decidir si los filtros de la pestaña pasan a ser filas de
  «Solo opero cuando…» (y con ello re-simulan en vez de quitar).

## 15. Editor más claro (V9.1049)

### Auditoría (solo lectura)

- **a) El orden.** En «Solo opero cuando…» y en «Compro cuando…» el orden de las filas no cambia nada: son Y / O de tres valores
  (`lib/condiciones/nucleo.js`), que no dependen del orden. En «Vendo cuando…» con «basta con una» cada fila es una salida aparte y
  el intérprete las mira en orden; todas venden a la apertura de la vela siguiente, así que el día y el precio son los mismos: solo
  cambia el motivo anotado si dos se cumplen en la misma vela. Los **stops sí dependen del orden**: se comprueban uno a uno y el
  primero que salta cierra la operación a su precio (y «se retira cuando otro lo supera» mira al de otro).
- **b) Índices.** El filtro de índice es uno (`filtroMercado: { ticker, si }`): admite varias condiciones del mismo índice (Y), pero
  no dos índices distintos. Las tarjetas ya lo garantizan: cambiar el índice de una fila cambia el de todas.
- **c) Fuerza relativa fuera del Nasdaq-100.** El percentil se calcula frente a los miembros del Nasdaq-100 de ese día y el valor no
  tiene que ser miembro (`lib/fuerzaRelativa.js`). Pero el servidor lee sus velas de los precios guardados de la app: un valor que no
  esté ahí no tiene percentil (null) y la condición no se cumple nunca.

### Cambios

- «La regla, en una frase» por bloques, un párrafo por bloque con la marca de su color: Solo opero cuando… (morado) · Compro cuando…
  (azul) · Cómo compro (gris) · Vendo cuando… (naranja) · Protección (verde azulado `#3dd6c3`, también en el borde y el título de su
  tarjeta). Los bloques vacíos no salen (Protección dice «Sin stop ni objetivo.»). Igual en «Mis estrategias» (`reglaPartes`).
- Buscador: primero las condiciones con la palabra en el nombre; debajo, «Lo mencionan en su explicación», con el trozo y la palabra
  resaltada. Sin acentos ni mayúsculas.
- Añadir: el cuadro «¿Añadir a…?» con «Cancelar», y se cierra al pulsar fuera o con Esc. Cada condición del catálogo se arrastra a
  una tarjeta (las que la admiten se iluminan y una línea marca dónde queda; las demás, en gris). Con «+», al final.
- Ordenar: asa de seis puntos en cada fila (y en los stops) y «Subir» / «Bajar» en el menú «…». Textos: «El orden no cambia el
  resultado: se miran todas a la vez, al cierre de cada vela.» (filtro y compra), el de la venta (solo el motivo) y «Se comprueban
  en este orden; el primero que salta cierra la operación.» (stops). Comprobado: los 12 órdenes posibles de compra y filtro dan las
  mismas operaciones.
- Filtro de índice: con dos o más filas de índice, la nota «Todas las filas de índice tienen que ser del mismo índice (ahora: …).»;
  la línea «Para filtrar por un índice…» va dentro de la tarjeta.
- Sin el grupo «Mercado»: la fuerza relativa va en «Osciladores», con «· comparado con [Nasdaq-100]» (un selector con una sola
  opción, `GRUPOS_FUERZA`; no se guarda: cuando haya más grupos se añadirá un parámetro con el Nasdaq-100 por defecto), su «?» nuevo
  y el aviso de la auditoría (c). La definición guardada no cambia.
- Paso 2 de las de código: «Las estrategias de código no se pueden probar contra el azar aquí, en el Builder. Para probarla aquí,
  rehazla en tarjetas.»

## 16. Dibujo de la regla y señales en el gráfico (V9.1050)

Debajo de las tarjetas del paso 1, a todo lo ancho, un panel con dos pestañas. Los dos se actualizan solos mientras se edita y salen
SIEMPRE de la regla de la pantalla (nunca con IA). Con errores: «Corrige lo que está en rojo para ver el dibujo» (o «las señales»).

- **Dibujo de la regla** (`components/BuilderDibujo.js`): diagrama de flujo horizontal en SVG. Óvalo «Cada vela, al cierre» → rombo
  morado «1 · FILTRO» (si hay) → rombo azul «COMPRO SI (TODAS / AL MENOS UNA)» → con orden en el máximo, rombo gris «¿Llega al máximo de
  la señal?» con el ajuste y la cancelación → «Compro a la apertura de la vela siguiente» (o «en el máximo de la señal») → «Tengo la
  acción» → rombo naranja «VENDO SI (BASTA UNA / TODAS)» con las condiciones de venta y, en verde azulado, la salida por tiempo, los
  stops y el objetivo → óvalo «Vendo a la apertura de la vela siguiente». Ramas «No» (rojo claro) hacia «No compro hoy: espero a la
  siguiente vela» y «Sigo dentro: miro la siguiente vela»; «Sí» en verde; la vuelta discontinua «después de vender, vuelvo a empezar».
  Como mucho 3 condiciones por rombo (cada una en una o dos líneas); «y N más» las despliega. Las condiciones con NO, en positivo
  (las frases de la regla). Scroll horizontal en pantallas estrechas.
- **Señales en el gráfico** (`components/BuilderSenales.js`, cálculo en `lib/builder/senales.js`): valor (los de `precios_simbolos`,
  velas de `leer_velas`, solo lectura) y fechas (por defecto, los 2 últimos años); el precio con las medias de la regla y su
  leyenda, la zona gris del filtro («filtro: no opero»), ▲ verde en la vela de cada compra y ▼ naranja en cada venta, «En este
  periodo: N compras · N ventas»; un panel por oscilador (RSI, MACD, ROC, ATR en %) con su nivel; y una franja por condición del
  filtro y de la compra (pintado = sí). Sin dinero. **Mismo motor**: el calentamiento de `lib/backtestActivo.js` (velasCalentamiento
  con las ventanas declaradas + conHistoria), el mismo recorte y el mismo intérprete; las compras son las entradas del periodo y las
  ventas sus salidas (sin la venta virtual del último día). Comprobado contra el backtest de un valor en AAPL 2020–2021 con
  PRUEBA_BUILDER_1 (28 y 28), Retroceso líderes RSI2 (20 y 20), Copia editor 23 (12 compras y 11 ventas: queda una abierta) y
  PRUEBA_BUILDER_1 con filtro QQQ > SMA (200) (27 y 27). La fuerza relativa no se puede calcular en el navegador (necesita todo el
  Nasdaq-100): sus filas salen sin dato y se avisa.
- **Tiempos** (mediana de 7, en el ordenador de pruebas, con las velas ya leídas): 2 años en diario ≈ 1 ms (con filtro QQQ ≈ 1,2 ms),
  10 años ≈ 1 ms, 16 años con filtro ≈ 2 ms; se recalcula 250 ms después del último cambio. Lo que más tarda es leer las velas la
  primera vez (una lectura por valor, que se recuerda). Si un cálculo pasa de 500 ms, se avisa.

## 17. Curva y copias al azar en los resultados del paso 2 (V9.1051)

### Auditoría (solo lectura)

- **a)** Ninguna prueba guardaba la evolución diaria del dinero ni la distribución de las copias. El laboratorio de cartera guarda
  CAGR, caída y ratio de la estrategia, y por cada prueba A / B la mediana, el 5 y el 95 de cada 100 y el percentil; el laboratorio
  de operaciones, la media, el 5 y el 95 de cada 100 y el percentil de las 1.000 copias.
- **b)** Recalcular al abrir haría falta volver a lanzar los laboratorios en el servidor sobre todo el universo, y si los precios
  guardados cambiaron (correcciones de Yahoo, splits) las cifras podrían no coincidir. Decisión de Sergi (opción A): guardarlo en las
  pruebas nuevas.

### Cambios

- **Sin cambiar ninguna cifra.** `lib/azarCartera.js`: las medidas salen de las mismas métricas (`aMedidas`); `creaPrueba(…, { curvas:
  true })` se queda además con la curva diaria de cada copia y `curvaReal(P)` da la de la cartera real (la de `metricasCartera`).
  `lib/editor/laboratorio.js`: el resultado lleva además `copias.medias` (las 1.000 medias). Comprobado: lo que se guardaba sale
  idéntico byte a byte a V9.1050 (motor real, 18 valores, 2 periodos; laboratorio de operaciones con 40 valores inventados; la
  verificación de sesgos, igual).
- **Qué se guarda** (`lib/builder/curvasPrueba.js`). El registro (`lab_pruebas`) admite como mucho 50 KB por fila (lo comprueba la
  tabla), así que:
  - las curvas van en **filas aparte** (`config.prueba = 'editorCurvas'`, una por variante y periodo): la estrategia y el QQQ día a
    día (en diezmilésimas del dinero inicial) y 40 copias de la prueba A repartidas de peor a mejor por su dinero final, cada 5 días
    (en milésimas; si no cabe, cada más días), todo como texto con diferencias. No cuentan como pruebas en el contador del registro
    (`cuentaPruebas`) ni salen en el historial del Laboratorio. La fila de la prueba (`editorLote`) no cambia;
  - las 1.000 medias, ordenadas y compactas, dentro de la fila del laboratorio de operaciones (`copias`, unos 2 KB por periodo).
- **En «Resultados»** (`components/BuilderCurvas.js`), debajo de la tabla, una pestaña por periodo (y un selector si hay varias
  estrategias). «Cómo creció el dinero, frente al azar» (laboratorio de cartera): la estrategia, el abanico de 40 copias y el QQQ
  (solo referencia), la caída desde el máximo con la máxima marcada, las cifras frente al QQQ y la barra 0–100 con el 95 y la
  estrategia. «Dónde queda tu estrategia entre las 1.000 copias» (laboratorio de operaciones): el histograma, la línea del 95 de
  cada 100 y la estrategia en su valor. Cada subtítulo dice prueba, laboratorio, estrategia, periodo y si decide el veredicto o es
  solo informativo. Las cifras son las guardadas (las mismas de la tabla). Las pruebas antiguas dicen «Esta prueba es antigua: la
  curva no se guardó.» (y «… las copias al azar no se guardaron.») y enseñan sus cifras y la barra.
- **Tamaño** (medido, 2 periodos de 5 años, 1 estrategia): fila de la prueba 4 KB (como antes), curvas unos 76 KB (35 y 41 KB por
  periodo; con el QQQ, unos 5 KB más por periodo), medias unos 2 KB por periodo. Una prueba nueva típica: unos 90 KB por estrategia
  (Postgres además comprime estos textos). La base ocupaba 176 MB el 24/10/2026 (154 MB son precios; `lab_pruebas`, 1 MB).

## 18. Arreglo: las curvas de Equity de «Backtest de un valor» no se veían (V9.1052)

- **Causa**: en V9.992 (contraste del texto secundario) el color de la línea punteada del capital inicial de
  `components/EquityChart.js` pasó de `'#3d5a7a'` a `'var(--text3)'`. lightweight-charts (4.2.0) no entiende variables CSS: la
  serie se crea sin error, pero al pintar lanza «Cannot parse color: var(--text3)» y el lienzo se queda vacío, así que no se veía
  NINGUNA línea (Simple, Compuesta, B&H…) con ninguna estrategia ni valor. No viene de V9.1048–V9.1051: los datos que recibe el
  gráfico son idénticos en V9.1047 y en V9.1052.
- **Arreglo**: ese color pasa a `'#6a8aa8'` (el valor actual de `--text3`). Nada más; ningún cálculo cambia. Era el único color
  `var(--…)` pasado a lightweight-charts en el proyecto.
- **Comprobado**: `/api/datos` real (Yahoo) con «1 V50 EMA10/11» y «23 EMA20 breakouts» sobre AAPL y QQQ, código de V9.1047 y de
  ahora: curvas iguales (315 puntos en cada una; Simple, Compuesta, B&H y SP500). El `EquityChart` real montado en el navegador con
  esas curvas: el de V9.1051 no pinta nada (0 píxeles de las tres líneas, el error de arriba); el de V9.1052 pinta Simple,
  Compuesta y B&H en los cuatro casos, sin errores.

## 19. Arreglos pequeños del paso 1 y de los gráficos del paso 2 (V9.1053)

### Auditoría (solo lectura)

- **Comprobaciones comunes**: los scripts están en el scratchpad de la sesión `0c02b5f9` de Claude Code (`bateria.js`,
  `prueba_cartera1000.js`, `huellas_lab.js`, `cargador.js`, `entorno_cache5.js`) y no en el repositorio; la base se lee con el
  token de `supabase login` (Administrador de credenciales de Windows), siempre en solo lectura. Ejecutados en V9.1052: batería
  52 de 52 y 44 de 44 byte a byte; LOTE_1–3 y CARTERA_1–3, 12 de 12; huellas PRUEBA_EDITOR_1 (a2cdfd85), RETROCESOS_1 (23c5006c) y
  PRUEBA_BUILDER_1 · 2026-10-22 (0d6726ec).
- **«Cambios sin guardar»**: no hay ningún texto con ese nombre; lo que depende de «hay cambios» es el aviso amarillo de versión
  nueva («Al guardar se creará la versión 2…») y si «Guardar» escribe. Fallaba con los números que en la estrategia son un
  parámetro con nombre (por ejemplo `$ema` en «Copia editor 23»): la casilla escribía el número fijo en la fila (`20` en lugar de
  `$ema`), así que al volver a dejarlo como estaba la estrategia ya no era la guardada.
- **«Subir» / «Bajar»**: existen, dentro del menú «…» de cada fila (debajo de «Darle la vuelta»), y solo salen cuando la tarjeta
  tiene más de una fila. Se dejan ahí.
- **Señales con velas semanales**: se dibujaban velas DIARIAS y la regla se calculaba sobre ellas (por ejemplo, PRUEBA_BUILDER_1
  semanal en AAPL 2016–2021: 1.511 velas y 65 compras, cuando el backtest hace 16 sobre 313 semanas).

### Cambios

- Una casilla cuyo número es un parámetro con nombre cambia el valor del parámetro y la fila sigue diciendo `$nombre` (filas de
  las tarjetas, cancelar la orden, stops, velas de la orden, objetivo y salida por tiempo). Si el parámetro salía de su valor por
  defecto y se vuelve a ese valor, se quita otra vez de los valores. Así, volver a dejarlo como estaba = lo guardado, byte a byte:
  sin aviso de versión y «Guardar» no escribe.
- `lib/builder/senales.js`: con velas semanales construye las semanas desde las diarias (`semanalesDesdeDiarias`, como
  `pages/api/datos.js`), del valor y del índice del filtro.
- `components/BuilderCurvas.js`: los dos gráficos se dibujan a su ancho real (1 unidad = 1 píxel, medido con ResizeObserver), con
  todas las letras a 12 px; la curva en escala logarítmica (marcas 1-2-5 en euros y la nota «escala logarítmica»); las etiquetas
  del final de las líneas, al menos 16 px separadas (y, si se salen por abajo, suben); los textos junto a una línea vertical van a
  su izquierda en la mitad derecha. Ninguna cifra cambia.
- Comprobado: las 4 estrategias del editor, cambiar y volver = lo guardado; ida y vuelta sin escribir nada; 4 casos semanales
  (AAPL, MSFT, QQQ) con las mismas compras (fecha y precio) y ventas que `backtestActivo`; gráficos con un caso en que la
  estrategia acaba exactamente donde la peor copia; comprobaciones comunes.

## 20. Nuevo paso 1 con tres pestañas y cifras al momento (V9.1054)

### Auditoría (solo lectura)

- **Precios de 2010–2015**: la caché de la app (`precios_diarios`) tiene 329 valores; 206 tienen 2010–2015 completo. Los que no:
  los que empezaron a cotizar después (TSLA desde 29/06/2010, META 2012, BTC-USD 17/09/2014, ETH-USD 2017…). GC=F está desde
  2006. GLD NO está en la caché: no sale en la lista de valores de la pestaña (la lista son los valores con precios guardados);
  se trae igual que cualquier otro con `node scripts/llenaCachePrecios.js --simbolo GLD --anios 30`, como IWM y DIA (§13).
- **Las cifras de «Backtest de un valor»** salen de `lib/backtestActivo.js` (el núcleo: operaciones, comisiones, capital,
  curvas) y de `calcMetrics` (lib/utils.js) en `pages/index.js`. Las dos son puras y funcionan en el navegador.

### Cómo queda

- El paso 1 tiene tres pestañas: **Tarjetas** (lo de antes, sin el panel de debajo), **Señales en el gráfico** y **Dibujo de la
  regla** (el diagrama a todo el ancho). Con errores en la regla, las otras dos lo dicen («La regla tiene errores: corrígelos en
  «Tarjetas»…»), la pestaña lleva ⚠ y no dibujan.
- **Señales en el gráfico** (`components/BuilderSenales.js`, `lib/builder/ensayo.js`):
  - Fila de arriba: valor; fechas «Ensayo · 2010–2015» (por defecto) u «Otras fechas»; las velas de la estrategia (solo se
    muestran); una casilla por cada número de cada fila de las tarjetas (y de la orden en el máximo, los stops, el objetivo y la
    salida por tiempo), escrita como la fila («Compro: Cierre > máximo de las [20] velas anteriores»). Si el valor tiene menos de
    4 años antes de 2016, el ensayo es la primera mitad de su historia, con un aviso (BTC-USD: 17/09/2014 – 05/10/2020). Si las
    fechas tocan 2016–2025, la nota «Estas fechas incluyen 2016–2025, los años que usa el paso 2 para la prueba contra el azar.»
  - Las casillas son SOLO PARA PROBAR: se aplican a una copia (`aplicaPrueba`, con la misma regla que la casilla de las tarjetas:
    un parámetro con nombre cambia su valor; si no, el número en su sitio). La cambiada sale en ámbar con «(guardado: X)». Solo si
    algo es distinto de lo guardado salen «Volver a los guardados» y «Guardar estos valores en la estrategia» (regla de versiones
    de siempre; después se sigue en esta pestaña con la estrategia guardada). Viven en el editor mientras está abierto; al salir y
    volver a entrar, se empieza con los guardados.
  - Gráfico a todo el ancho que dejan las cifras. Sobre el precio: las medias, el máximo y el mínimo de N velas en escalera
    (`nuevoMaximo`, `nuevoMinimo`, `cercaMaximo`, con las mismas funciones que las condiciones) y las bandas de Bollinger. Los
    osciladores, en paneles debajo, con el eje de la derecha del mismo ancho (72 px) para que queden alineados.
  - Las franjas «Se cumple cada condición» van DENTRO del gráfico de precio (una serie de barras por condición, cada una en su
    banda de altura): comparten exactamente su escala de tiempo, también al hacer zoom o moverse. Su nombre, encima, a la izquierda.
  - A la derecha (como el boceto Paso1MetricasB): la línea «Compuesto: … Comisión: la de «Backtest de un valor».», la tabla «Tu
    regla / Comprar y mantener [VALOR]» (CAGR · Max Drawdown · Win Rate · Factor de beneficio · Operaciones · Ganancia / pérdida
    media · Tiempo invertido, en %), en gris con «Solo N operaciones: puede ser suerte.» si hay menos de 30, y «Cómo habría crecido
    100 (en %, sin euros)». Nada se guarda.
- **Las cifras = «Backtest de un valor»** (`cifrasRegla`): el mismo `backtestActivo` (con el intérprete del editor) sobre las velas
  guardadas, 100 % del capital, 10.000 € (las cifras son en %) y la comisión de «Backtest de un valor» (la página se la pasa al
  Builder); y la misma `calcMetrics` con los mismos argumentos. «Tu regla» es la columna Compuesta (CAGR compuesto y caída de la
  curva compuesta). Los filtros del panel de «Backtest de un valor» no cuentan (no son de la estrategia). Con fechas que llegan a
  hoy, la última vela puede diferir mientras el mercado está abierto (el servidor marca la vela en curso; aquí no hay ese dato).
- Comprobado: «Retroceso líderes RSI2», «Copia editor 23» y «PRUEBA_BUILDER_1» sobre AAPL y QQQ, en 2010–2015 y 2020–2021, contra
  el `pages/api/datos.js` real (con las mismas velas servidas como Yahoo) y las cifras calculadas como `pages/index.js`: las mismas
  operaciones (fechas, precios, % y capital) y las 10 cifras idénticas al bit, con la comisión de 0,36 € y sin ella; las curvas
  de «crecer 100» = las de su gráfico. Ensayo de AAPL y BTC-USD; casillas de las tres estrategias (probar cambia la copia; volver
  = la guardada byte a byte); montaje de las tres pestañas; y en el navegador (página temporal con datos fijos): franjas y canales
  dibujados, casilla resaltada, botones, recálculo y «Volver a los guardados», sin errores en la consola.

## 21. Piezas para la estrategia de las Tortugas (V9.1055)

Toca el motor del editor (lib/editor/interprete.js), pero solo detrás de tipos y campos NUEVOS: una definición que no los usa
hace exactamente lo mismo que antes (comprobado byte a byte con las estrategias del editor, la batería y las huellas).

- **«Cómo compro» · Orden en el nivel de ruptura** (`entrada.orden = { tipo: 'ruptura', nivel: { velas: N } }`): en cada vela sin
  posición, compra en cuanto su máximo SUPERA (estrictamente) el máximo de las N velas ANTERIORES (sin contar la actual; las mismas
  `maximoPrevio` que «Nuevo máximo de N velas»). Precio: ese nivel; si la vela abre ya por encima, a la apertura. No hay orden viva
  entre velas: el nivel se rehace en cada una. La señal («Compro cuando…») pasa a ser opcional (se mira al cierre de la vela
  anterior, con el filtro); sin ninguna fila, la orden está puesta siempre. No admite «cancelar».
- **Stop fijo por ATR** (`{ tipo: 'atrCompra', k, periodo }`): precio de compra − k × ATR (periodo) de la vela ANTERIOR a la compra
  (sin mirar el futuro); se calcula una vez y no se mueve. El de antes (`atr`) usa el ATR de la vela de la señal y no cambia (con
  la compra a la apertura, las dos son la misma vela); en las tarjetas se llama ahora «Según la volatilidad (ATR de la vela de la
  señal)» para que no se confundan.
- **Stop que sube con el mínimo de N velas** (`{ tipo: 'minimoMovil', n }`): el mínimo de las n velas anteriores (sin la actual),
  recalculado en cada vela; solo sube. Al comprar, el de las n velas anteriores a la compra.
- **Con varios stops · «Manda el más alto»** (`stopsModo: 'masAlto'`): en cada vela suben primero los stops que se mueven y el stop
  activo es el mayor; salta dentro de la vela a su precio, o a la apertura si abre ya por debajo. El historial (`stopHistory`) anota
  el stop activo al comprar y cada vez que cambia, y el riesgo del objetivo en R es el del stop activo al comprar. Sin el modo, los
  stops se miran en su orden, como siempre.
- **Dibujo sobre el precio**: el canal de compra (verde) y el mínimo de N velas (naranja) en «Señales en el gráfico» (en escalera)
  y en «Backtest de un valor» (series del intérprete con su color); el stop activo (rojo), solo mientras hay operación: en
  «Backtest de un valor» es la línea de stop de siempre (sale del historial); en «Señales en el gráfico», una línea en escalera.
- **Catálogo**: «Piezas de compra y de stop», debajo de los grupos, con las tres, su «?» con ejemplo y «+» (no son condiciones:
  «+» las pone en «Cómo compro» o en «Protección»). En «Protección», con dos stops o más, «Con varios stops: en su orden / manda el
  más alto» con su «?». **Dibujo de la regla**: el rombo «¿Supera el máximo de las N velas anteriores?», «Compro en el nivel de
  ruptura», y los stops con «manda el más alto». **Casillas de prueba**: la N de la ruptura y los números de los stops nuevos.
- **Calentamiento** (lib/editor/historia.js) y **laboratorio del paso 2** (`calculablesDefinicion`): cuentan la N de la ruptura, el
  ATR de la compra (periodo + 1) y la n del mínimo; sin señal, «siempre». **Exportar a code_js**: con estas piezas lo dice y no
  exporta (el motor copiado no las tiene).
- Comprobado: casos calculados a mano (ruptura dentro de la vela a 12; con el máximo justo en el nivel, no compra; ruptura con
  salto, a la apertura 12,5; stop fijo por ATR que manda al principio en 99 y el mínimo de 3 velas que lo supera, 99,5 → 101 → 102,
  venta a 102 dentro de la vela; la misma con la vela abriendo a 101, venta a la apertura); «Tortugas 20/10 · ATR 14 × 2» hecha con
  las tarjetas sobre AAPL 2020–2021: las mismas 8 operaciones (fechas y precios) en «Señales en el gráfico», en «Backtest de un
  valor» y en el laboratorio del paso 2; las 4 estrategias del editor en AAPL y QQQ, diario y semanal: intérprete, laboratorio y
  calentamiento idénticos a V9.1054; ida y vuelta; montaje de las pantallas; comprobaciones comunes.

## 22. Las comprobaciones comunes, en el repositorio (scripts/comprobaciones/)

Hasta V9.1055 vivían en el scratchpad de una sesión de Claude Code. Ahora están en `scripts/comprobaciones/`, sin ninguna
credencial ni ruta de la máquina:

- `comunes.sh`: lo lanza todo y compara el árbol de trabajo con una copia de la versión anterior (por defecto HEAD; otra con el
  primer argumento) que hace con `git archive` en `scripts/comprobaciones/.viejo/`. Pasos: guardián, build, batería, cartera,
  lotes y huellas; cada salida en `scripts/comprobaciones/salida/<paso>.txt`. Termina en 0 si todo va bien. Unos 15 minutos.
- `bateria.js`: la batería de V9.949, 52 respuestas de /api/multibacktest (13 configuraciones × listas V50 y Degiro × diario y
  semanal) y 44 con `conCandidatos`, byte a byte. `entorno.js` simula Yahoo (fotos) y Supabase (las estrategias de la última
  copia de `backups/`, solo lectura).
- `cartera.js`: CARTERA_1–3 y las cuatro exploraciones, idénticas (21 resultados).
- `lotes.js`: las huellas de LOTE_1–3 y CARTERA_1–3 frente a las de `lib/lotesLab.js`.
- `huellas.js`: las huellas de PRUEBA_EDITOR_1 (a2cdfd85), RETROCESOS_1 (23c5006c) y PRUEBA_BUILDER_1 · 2026-10-22 (0d6726ec),
  frente a las de `editor_lotes`. Lee la base en SOLO LECTURA con `scripts/guardian/lecturaBd.js` (el mismo acceso que el
  guardián y la copia: el token de `supabase login` o `SUPABASE_ACCESS_TOKEN`, y el proyecto de `.env.local`).
- `cargador.js`: carga el código con el SWC de Next, con dos árboles a la vez (antes y ahora).

**Qué hace falta en la máquina** (no está en git): `npm install`; una copia en `backups/` (`npm run backup`), de donde salen las
estrategias con su code_js; `supabase login` para `huellas.js`; y las fotos de precios `foto_v50.json`, `foto_degiro.json`,
`foto_mom.json` y `yahoo_foto.json` (unos 57 MB: demasiado para un repositorio público) en `scripts/comprobaciones/datos/` o en la
carpeta que diga `COMPROBACIONES_DATOS`. Las fotos tienen que ser SIEMPRE las mismas (son la referencia fija de la batería): hoy
están en el scratchpad de la sesión 0c02b5f9 de Claude Code; conviene copiarlas a `scripts/comprobaciones/datos/` y guardarlas.

**Lanzarlo:**

    bash scripts/comprobaciones/comunes.sh
    COMPROBACIONES_DATOS=/ruta/a/las/fotos bash scripts/comprobaciones/comunes.sh

Comprobado en V9.1056 desde la nueva ubicación: el mismo resultado que el arnés de antes (guardián 0, build, batería 52/52 y
44/44 byte a byte, 21 resultados de cartera idénticos, lotes y carteras 12 de 12 (6 con la versión anterior y 6 con la de ahora), las tres huellas).
- **Esperar a lo que se busca, no un tiempo fijo** (`azar-graficos.js` y `tesis-enlaces.js`): con el equipo cargado, las esperas de pocos milisegundos hacían fallar de vez en cuando «si fallan los precios» y «con esa tesis abierta». Ahora `hasta(condición)` mira cada 5 ms, con 20 s como máximo, y el `ok()` de después sigue siendo quien da el veredicto. Quedan esperas fijas solo donde no hay nada que buscar: tras desmontar y para ver que algo NO aparece, siempre después de que hayan llegado los datos.

## 23. Señales en el gráfico: el stop cortado, franjas de las piezas y comisiones pagadas (V9.1057)

### Auditoría (solo lectura)

- **«Tortugas 20/10» en AAPL 2010–2015** (precios de la caché de la app): 30 operaciones, todas cerradas por el stop. Entre la venta
  del 27/09/2012 (23,61) y la compra del 22/03/2013 NO hay operación abierta, y en julio–agosto de 2015 solo del 20 al 22 de julio.
  El motor está bien: el historial del stop de cada operación cae dentro de sus fechas.
- **La causa**: en «Señales en el gráfico» el stop iba en UNA serie con huecos (velas sin valor), y lightweight-charts une los
  puntos de una serie por encima de los huecos: de ahí la línea plana hacia 23,5 hasta abril de 2013 y hacia 31,5 en 2015. En
  «Backtest de un valor» (components/CandleChart.js) cada operación ya tiene su propia línea de stop, de su compra a su venta: en
  el código no hay nada que una dos operaciones.
- **Comisiones**: el núcleo (lib/nucleoBacktest.js) descuenta en la columna compuesta, en cada operación, la comisión de compra
  (fija + % del importe) y la de venta (fija + % del importe de salida), y la anota en `comisionCompuesta` (solo si hay comisión).

### Cómo queda

- **Stop activo**: `calculaSenales` da, además de `valores`, `tramos` (uno por operación: [[índice, nivel], …]) y el gráfico dibuja
  una línea por tramo: solo mientras hay operación abierta, sin unir la venta de una con la compra de la siguiente. Como las flechas,
  solo cuentan las operaciones que empiezan en las fechas elegidas (antes, una que venía del calentamiento pintaba el stop al
  principio del periodo sin estar en la lista).
- **Franjas de las piezas** (`tarjeta: 'pieza'`, con su color, en la misma escala de tiempo que las velas): «Supera el máximo de N
  velas» (con la orden en el nivel de ruptura: el máximo de la vela supera el de las N anteriores, la misma `maximoPrevio` y el
  mismo «>» del motor), «Toca el stop» (con stops: la vela en que el motor vende por un stop; las salidas por stop son las que traen
  su nivel, `stopPx`) y «Con operación abierta» (con la ruptura o con stops: de la compra a la venta, las dos incluidas).
- **«Comisiones pagadas»** en la tabla de cifras: la suma de `comisionCompuesta` de las operaciones (`cifrasRegla` → `comisiones`),
  y su % sobre el capital inicial (10.000 €). Con solo comisión fija por compra: «30 × 0,36 € = 10,80 € · 0,11 % del capital
  inicial»; con venta o porcentaje, la cuenta entera («30 compras × 1,00 € + 30 ventas × 2,00 € + 0,10 % del importe en cada compra
  y en cada venta = …»); sin comisión, «0,00 € · «Backtest de un valor» no tiene comisión».
- Comprobado: Tortugas 20/10 en AAPL 2010–2015: 30 tramos, cada uno de la compra a la venta de su operación, nada en los dos
  tramos del aviso; franjas contadas a mano (266 velas con ruptura, 30 toques, 627 velas con operación abierta; cada compra es una
  vela con ruptura); comisiones: 10,80 € y el capital compuesto final rehecho a mano (25.150,27 frente a 25.165,58 sin comisión), y
  con 1 € + 2 € + 0,1 % la suma a mano (1.226,16 €); las 5 estrategias del editor en AAPL (diario y semanal, 2010–2015 y 2020–2021)
  iguales a V9.1056 salvo lo nuevo (las cifras, idénticas); ida y vuelta; montaje; comprobaciones comunes.

## 24. Buscadores por texto (V9.1058)

### Auditoría (solo lectura)

- El selector «Valor» de «Señales en el gráfico» era un `<select>` con los tickers de `precios_simbolos` (389), sin nombres. El de
  «Backtest de un valor» NO es el mismo componente (allí el valor sale de la lista de la barra lateral): no cambia.
- Nombres: de los 389 valores con precios guardados, 382 tienen nombre en la lista de seguimiento (`watchlist.name`) o en el
  universo (`universo_miembros.nombre`); los 7 que no (DIA, FI, IWM, MYL, QLD, QQQ, RIMM) se buscan por el ticker.

### Cómo queda

- `lib/builder/buscar.js` (puro): `coincide` (sin distinguir mayúsculas ni acentos; cada palabra escrita tiene que estar en alguno
  de los textos), `filtraValores` (primero el ticker igual a lo escrito, luego los que empiezan por ello, luego el resto) y
  `conNombres` (el nombre de la lista de seguimiento y, si no, el del universo).
- **Valor** (`components/BuscadorValor.js`): casilla donde se escribe; la lista se abre debajo con «TICKER  Nombre» y se filtra
  («NVDA», «nvidia», «semi»…). Flechas para moverse, Enter para elegir, Escape para dejarlo como estaba; con el ratón, clic en la
  fila. Mientras no se escribe, enseña el valor elegido y su nombre al lado. `cargaSimbolos` devuelve ahora `{ simbolo, nombre }`
  (BuilderPanel lee también `watchlist` y `universo_miembros`; si fallan, solo tickers).
- **Mi trabajo**: casilla «Buscar por nombre o por la regla…» junto a las pestañas; filtra «Mis estrategias» por nombre y por la
  frase de la regla (la misma que se ve debajo del nombre) y «Mis pruebas» por nombre y por las estrategias que incluyen. Las
  pestañas y los filtros dicen cuántas quedan («3 de 89»); sin ninguna, «Nada con «…»».
- **Desde una de mis estrategias**: casilla encima del desplegable que filtra por nombre; sin ninguna, «Ninguna estrategia con «…»»
  y «Copiar y editar» desactivado.
- Comprobado: `buscar.js` con casos a mano (acentos, mayúsculas, varias palabras, orden); montaje con estado (renderToString con lo
  escrito): el selector con «NVIDIA» deja solo NVDA, con «zzz» lo dice; «Señales en el gráfico» con símbolos sueltos y con nombres;
  «Mi trabajo» con «TORTUGAS», con «stop» (por la regla, en las dos pestañas de filtro) y con algo que no existe; «Mis pruebas» por
  su nombre; el desplegable de copiar con «tortu» y sin nada; comprobaciones comunes. No probado en el navegador: el teclado y el
  ratón del selector.

## 25. Swings confirmados (V9.1059)

Toca el motor del editor, pero solo detrás de condiciones, tipos y campos NUEVOS: una definición que no los usa hace exactamente
lo mismo que antes (comprobado con las 5 estrategias del editor, la batería, las carteras, los lotes y las huellas).

### La definición (sin mirar el futuro)

- **Máximo de swing**: la vela V cuyo máximo es ESTRICTAMENTE mayor que el de las L velas anteriores y que el de las R siguientes;
  **mínimo de swing**, lo mismo con los mínimos (estrictamente menor). Un empate, o un dato que falte en la ventana, no es swing.
  L y R de 1 a 20 (2 y 2 por defecto).
- **Confirmación**: el swing existe a partir del CIERRE de la vela V + R. `swings(velas, lado, L, R)` (lib/condiciones/indicadores.js)
  da la lista y, por vela, el último confirmado hasta su cierre (`porVela[t]`, que solo depende de las velas hasta t).
  `ultimoSwing` (el confirmado hasta el cierre de t: el de las condiciones de la vela t) y `swingPrevio` (el del cierre de t − 1:
  el de las órdenes y los stops, que actúan dentro de la vela t; y la línea del gráfico).

### Piezas nuevas (grupo «Swings» del catálogo)

- Condiciones (lib/condiciones/catalogo.js, con su ficha en lib/builder/fichas.js): **Mínimos crecientes** y **Máximos crecientes**
  (`{ n, izquierda, derecha }`: los n últimos swings confirmados, cada uno más alto que el anterior; con menos de n, sin dato),
  **El cierre supera el último máximo de swing** y **El cierre cae bajo el último mínimo de swing** (`{ izquierda, derecha }`).
- **Orden en el último máximo de swing** (`entrada.orden = { tipo: 'swing', nivel: { izquierda, derecha } }`): compra en cuanto el
  máximo de una vela SUPERA el último máximo de swing confirmado hasta el cierre de la anterior; a ese nivel, o a la apertura si
  abre ya por encima. Cada swing se usa UNA vez: en cuanto el precio lo supera (con compra o sin ella: operación abierta, filtro…)
  queda gastado hasta el swing siguiente (`ordenSwing`, que solo depende del precio). La señal es opcional, como con la ruptura.
- **Stop bajo el último mínimo de swing confirmado** (`{ tipo: 'swingMinimo', izquierda, derecha }`): al comprar, el último mínimo
  de swing confirmado hasta el cierre de la vela anterior; en cada vela se recalcula y solo sube; salta dentro de la vela a su
  precio, o a la apertura si abre por debajo. Funciona con «manda el más alto» (el mismo camino que el stop que sube con el mínimo
  de N velas).
- Calentamiento y laboratorio del paso 2: L + R + 1 velas (la orden y el stop); las condiciones, (L + R + 1) × n.
- **Exportar a code_js**: con cualquiera de estas piezas no exporta y lo explica (el motor copiado no sabe cuándo se confirma un
  swing).

### Dibujo

- Un punto en la vela de cada swing (los máximos arriba, verdes; los mínimos abajo, naranjas) y la línea de su nivel («último
  máximo / mínimo de swing (L/R)»), en escalera, que empieza en la vela SIGUIENTE a la confirmación (V + R + 1), nunca en V. En
  «Señales en el gráfico» con la leyenda «● swing (la línea empieza al confirmarse)» y su «?»; en «Backtest de un valor», las series
  del intérprete (`escalera: true`, que ahora pasa lib/graficoEstrategia.js y pinta CandleChart) y los eventos `swingMax` /
  `swingMin` (puntos sin texto; el detalle, en el tooltip del razonamiento).
- Franjas: las filas de filtro y compra con estas condiciones (como todas), las de «Vendo cuando…» con una condición de swing
  (naranja) y la pieza «Supera el último máximo de swing (L/R)», además de «Toca el stop» y «Con operación abierta».
- Casillas de prueba: L, R y n de cada fila, y L y R de la orden y del stop. Dibujo de la regla: el rombo «¿Supera el último máximo
  de swing (L/R) confirmado?».

### Comprobado

- A mano: (a) máximos 100, 103, 107, 105, 102 con L = R = 2 → swing en 107 (3.ª vela), confirmado al cierre de la 5.ª, usable desde
  la 6.ª (y sin la 5.ª, no existe); (b) empates → sin swing; (c) mínimos crecientes y no crecientes con n = 2 y 3, máximos con
  empate (no crecen), el cierre bajo el último mínimo de swing; (d) la orden dentro de la vela (107), con salto en la apertura (109)
  y con el máximo justo en el nivel (no compra); (e) un mismo swing no dispara dos compras, tampoco si se superó sin comprar;
  (f) el stop bajo el mínimo de swing 90 → 92 (sube en la vela siguiente a la confirmación), con salto en la apertura (vende a 91) y
  dentro de la vela (92), también con «manda el más alto».
- «Swings 2/2» hecha con las funciones de las tarjetas (solo opero con mínimos crecientes; orden en el último máximo de swing; stop
  bajo el último mínimo de swing; NO se ha guardado en la base) sobre AAPL 2020–2021: las mismas operaciones (fechas y precios) en
  «Señales en el gráfico», «Backtest de un valor» y el paso 2; la línea empieza en V + R + 1 en los 64 máximos del periodo; las
  series y los puntos pasan la normalización del gráfico sin avisos.
- No mira el futuro: AAPL 2017–2022 cortado en 5 fechas: las cuatro condiciones (con varios L, R y n), los swings, la orden y las
  operaciones cerradas antes de cada corte, idénticos; la abierta al corte, con la misma entrada.
- Las 5 estrategias del editor (AAPL y QQQ, diario y semanal, 2010–2015 y 2020–2021): intérprete, señales, cifras, laboratorio,
  calentamiento y exportar idénticos a V9.1058; ida y vuelta; montaje del editor, de «Señales en el gráfico» y del dibujo;
  comprobaciones comunes.

## 26. Ajustes de pantalla: buscadores, franjas con su nombre a la izquierda y la columna de cifras (V9.1060)

Solo colocación: ningún cálculo cambia (lib/ no se toca).

- **Mi trabajo**: la casilla «Buscar por nombre o por la regla…» va en la fila de cabeceras de la tabla, a la derecha del título de
  la primera columna («Estrategia» en «Mis estrategias», «Prueba» en «Mis pruebas»). Busca lo mismo que en V9.1058.
- **Desde una de mis estrategias** (`components/BuscadorEstrategia.js`): un solo buscador, como el del catálogo de condiciones, en
  lugar de la casilla + el desplegable. Se escribe y debajo salen las que coinciden por nombre (sin distinguir mayúsculas ni
  acentos), agrupadas «De tarjetas» / «De código»; flechas, Enter y Escape (vuelve a la elegida), o clic. Con la casilla vacía (o con
  el nombre de la elegida) y al pulsar en ella, salen todas. Al elegir una, su nombre queda escrito y se activa «Copiar y editar»;
  hasta entonces, o si se escribe otra cosa, está desactivado; sin ninguna, «Ninguna estrategia con «…»». La tarjeta deja de cortar
  lo que sobresale (la lista no se recorta en su borde).
- **Señales en el gráfico · franjas**: los nombres («Supera el máximo de 20 velas · 266 velas»…) van en una columna fija de 250 px a
  la izquierda del gráfico (en pantallas estrechas encoge hasta 120), uno por fila, con su color y a la altura de su franja; los
  osciladores dejan el mismo hueco para seguir alineados con las velas. Para que la franja caiga justo en su fila, el gráfico se
  crea con el alto de la zona de dibujo + el eje de fechas (28 px) y, si el eje mide otra cosa, se corrige al momento
  (`paneSize`). Sin el logo de lightweight-charts (`attributionLogo: false`, tapaba las franjas): el enlace a TradingView que pide su
  licencia va en la línea de debajo del gráfico.
- **Comisiones pagadas**: solo el importe («30 × 0,36 € = 10,80 €»), sin el % del capital inicial.
- **Columna de cifras** (tabla + «Cómo habría crecido 100»): empieza a la altura de la fila de controles (Valor / fechas / casillas);
  la fila, los avisos y el gráfico ocupan el ancho restante. Si no caben las dos (menos de unos 1.040 px de ancho útil), la columna
  baja debajo del gráfico.
- Comprobado: montaje SWC (renderToString con estado) de «Mi trabajo» (las dos pestañas, la casilla en la cabecera, el mismo
  filtrado con «TORTUGAS», «stop» y «v50» en los dos filtros), del buscador de copiar («v50» y «V50»: las 14 de código; «tortu» y
  «TÓRTU»: Tortugas 20/10; «zzqq no existe»: el aviso y el botón desactivado; vacía y pulsada: las 88; elegida: activo) y de
  «Señales en el gráfico»; con «Tortugas 20/10» en AAPL 2010–2015, las señales, las franjas (266, 30 y 627 velas) y las cifras
  idénticas a V9.1059, la tabla igual salvo la fila de comisiones. En el navegador (los componentes compilados, sin la app): a
  1440 px la columna de cifras empieza en la misma línea que los controles y nada se sale; a 1280, igual; a 1024 y 768 la columna
  baja; cada franja (12 px) centrada en su etiqueta (18 px); teclado y ratón del buscador de copiar. Las 5 estrategias del editor
  (AAPL y QQQ, diario y semanal) idénticas a V9.1059; ida y vuelta; comprobaciones comunes.

## 27. Señales en el gráfico más grande y Dibujo de la regla que cabe en pantalla (V9.1061)

Solo pantalla: ningún cálculo cambia (lib/ no se toca; las señales, las flechas, las franjas y las cifras, idénticas a V9.1060).

- **Gráfico**: usa todo el ancho de su columna (a la izquierda de la de cifras) y el alto que queda libre en la pantalla: el
  contenedor que hace scroll menos lo que hay encima del gráfico y lo que va debajo (franjas, eje, osciladores y la línea de
  debajo); como mínimo, 300 px de velas. Se vuelve a medir al cambiar el tamaño de la ventana.
- **Nombres de las franjas**: cada uno en una línea fina de texto (11 px) justo ENCIMA de su franja, alineado a la izquierda y con su
  color; ya no en una columna aparte (V9.1060): las velas, las franjas y los osciladores empiezan en el mismo borde izquierdo y en la
  misma escala de tiempo. Cada fila: 14 px de nombre + 10 px de franja + 2 px de aire.
- **Zona gris del filtro**: mucho más suave (`rgba(139,155,173,0.045)`) y DETRÁS de las velas (se crea antes que ellas). En la leyenda,
  una casilla «filtro: no opero» la enseña u oculta sin rehacer el gráfico (por defecto, enseñada). La franja del filtro, igual.
- **Puntos de swing**: puntitos de 2 px un poco por encima del máximo (o por debajo del mínimo) de su vela, en una serie de puntos sin
  línea; las marcas de lightweight-charts no bajan de un tamaño mínimo y tapaban las velas.
- **Dibujo de la regla** (`colocaDibujo`, pura): cada rombo, a la medida de su texto (la línea a dy del centro tiene sitio para
  W · (1 − 2(|dy| + 7) / H); se prueban varios altos) y el título partido en líneas («¿Supera el último máximo de swing / (2/2)
  confirmado?» ya no se sale); cajas y óvalos, a lo ancho de su texto. Se mide el ancho de la tarjeta y se prueba: una fila; dos
  filas partidas antes de «Compro» (la compra arriba; comprar, tener la acción, vender y los stops abajo) o antes de «Tengo la
  acción»; menos hueco entre formas; textos más estrechos (40, 32, 26 y 22 letras). Entre las dos filas, una flecha más gruesa que
  baja por la derecha y entra en la primera forma de abajo; la vuelta discontinua al principio va por debajo y sube por el borde
  izquierdo. Si nada cabe, se encoge hasta el 80 % y, más estrecho, hace scroll.
- Comprobado: montaje SWC (renderToString con estado) de «Señales en el gráfico» con «Tortugas 20/10» y «Swings 2/2» en AAPL
  2010–2015 (señales, cifras, compras y ventas idénticas a V9.1060; los nombres encima de su franja; la casilla de la zona, marcada
  por defecto y desmarcada con `verZonaInicial`) y del dibujo de las 6 estrategias del editor a 1.350 y 930 px de tarjeta (nunca más
  ancho; cada línea dentro de su forma). En el navegador (los componentes compilados, sin la app): a 1440 y a 1024 px, sin
  desplazamiento horizontal; el gráfico llega al pie de la pantalla (y a 300 px de velas en pantallas bajas); cada franja, pintada
  en los 10 px de debajo de su nombre; con zoom (7 px por vela), 564 de 564 (Swings 2/2) y 363 de 363 (Tortugas) marcas de franja
  en la x de su vela, del color que toca; la casilla quita y pone la zona sin rehacer el gráfico; el dibujo de Swings 2/2 (1.330 ×
  634 px a 1440) y el de Tortugas, con TODO el texto dentro de su rombo o su caja (medido con getBBox), también a 1024. Las 6
  estrategias del editor (AAPL y QQQ, diario y semanal) idénticas a V9.1060; ida y vuelta; comprobaciones comunes.

## 28. Swings: «Estructura alcista» y dibujo en tramos (V9.1062)

Toca el motor solo detrás de una condición NUEVA y de funciones nuevas: «Mínimos crecientes» y el resto no cambian (las 6 estrategias
del editor, «Swings 2/2» y «Tortugas 20/10» incluidas, con las mismas operaciones y cifras).

### La condición «Estructura alcista» (grupo «Swings»)

- `estructuraAlcista` (lib/condiciones/catalogo.js; `{ n, izquierda, derecha }`, K = n de 2 a 10, por defecto 2/2/2) sobre
  `estructuraAlcistaSwing(velas, L, R, K)` (lib/condiciones/indicadores.js): en la vela t, los K últimos mínimos de swing confirmados
  hasta su cierre son cada uno más alto que el anterior Y los K se confirmaron DESPUÉS de la última **rotura** (la última vela cuyo
  CIERRE quedó por debajo del último mínimo de swing confirmado entonces; un cierre igual no rompe). Así una rotura la apaga en esa
  misma vela (cerrada) y no vuelve hasta que se confirmen otra vez K mínimos crecientes: un solo mínimo nuevo, aunque sea más alto
  que el roto, no basta. Con menos de K mínimos confirmados en total, sin dato. Solo mira las velas hasta t.
- Ficha y «?» (lib/builder/fichas.js) con el ejemplo 10, 12, 14 → cierre a 13,90 → mínimo de 13 → 13,50, y la diferencia con
  «Mínimos crecientes» (que sigue cumpliéndose al cerrar a 13,90 y se apaga solo al confirmarse el 13). Vale en «Solo opero cuando…»
  y en «Compro cuando…». Calentamiento (L + R + 1) × K. Está en `CONDICIONES_SWING`: no se exporta a code_js (el mensaje la nombra).

### El dibujo de los swings

- Sin las líneas en escalera del «último máximo / mínimo de swing». `lineasSwing(velas, lado, L, R)` da, por vela, dos niveles:
  **punteado** (tenue, `rgba(…, 0.55)`) de la vela del swing a la que lo confirma (V … V + R) y **sólido** desde la vela siguiente
  (V + R + 1) hasta la vela cuyo máximo lo supera (un máximo de swing) o cuyo mínimo lo perfora (un mínimo), esa incluida, o hasta la
  confirmación del swing siguiente, lo que llegue antes. Sin nivel en vigor, nada. El punteado se dibuja hacia atrás desde la
  confirmación a propósito (como el punto); el sólido solo depende de las velas hasta cada vela.
- **Stop activo** (rojo): como antes, solo con operación abierta. Donde coincide con el mínimo de swing en vigor, el naranja no se
  pinta (se ve solo el rojo): en «Señales en el gráfico» con su línea del stop; en «Backtest de un valor», `stopPorVela`
  (lib/editor/interprete.js), con la misma regla que el gráfico (el último nivel del historial con fecha hasta la vela).
- Cómo se pinta (lightweight-charts une los puntos de una serie por encima de los huecos): `tramosLinea` (lib/graficoPaneles.js)
  parte la línea en rachas de velas seguidas con el mismo nivel; el último punto de cada tramo va transparente (el trozo que sale de
  un punto lleva su color) y un tramo de una sola vela va en su propia serie (una rayita del ancho de la vela). En «Backtest de un
  valor» llegan como dos series por lado del intérprete (`swingMax2_2p` punteada y `swingMax2_2` sólida) con `tramos: true` y
  `punteada: true`, que ahora pasan lib/graficoEstrategia.js y pinta CandleChart.
- Leyenda de «Señales en el gráfico»: «┈┈ máximo de swing (L/R), sin confirmar» y «— … en vigor» de cada lado, y «● swing · ┈ hasta
  confirmarse · — desde que se puede usar» con su «?» (el dibujo y el stop rojo).
- El interruptor «filtro: no opero» de la leyenda, en línea y con la letra del resto (el estilo global de `label` lo ponía en
  columna y en monoespaciada).

### Comprobado

- A mano (L = R = 2, K = 2): mínimos 10, 12, 14 confirmados → se cumple; un cierre a 13,9 → deja de cumplirse en esa vela
  («Mínimos crecientes» sigue); un mínimo nuevo de 13 confirmado → sigue sin cumplirse («Mínimos crecientes» se apaga entonces);
  13 y 13,5 (dos mínimos crecientes nuevos) → vuelve a cumplirse; tras la rotura, un solo mínimo nuevo más alto (14,5) no basta, con
  el segundo (14,8) sí. Tramos: punteado del 10 en las velas 2–4, sólido de la 5 a la 9; el del 14, de la 15 a la 17 (la que lo
  perfora); nada hasta el 13 en vigor.
- No mira el futuro: AAPL 2017–2022 cortado en 5 fechas: la condición (K, L, R = 2/2/2, 3/3/2, 2/1/4, 4/5/5), el tramo sólido y las
  operaciones cerradas de una regla con «Estructura alcista» en la compra y en la venta, idénticos; la abierta, con la misma entrada.
- Las 6 estrategias del editor (AAPL, diario y semanal, 2010–2015, 2020–2021 y jul–oct 2010): señales, flechas, franjas, zona del
  filtro, puntos de swing, medias, el stop y el resto de canales, intérprete (operaciones, posición abierta, series que no son de
  swing, eventos, órdenes), cifras y exportar idénticos a V9.1061; ida y vuelta byte a byte. Las series nuevas pasan el normalizador
  sin descartes. Montaje SWC con estado de «Señales en el gráfico», del editor (la fila, el catálogo con «estruct») y del dibujo.
- En el navegador (los componentes compilados, sin la app) a 1440 px con «Swings 2/2» en AAPL jul–oct 2010: cada sólido empieza
  en la vela siguiente a la confirmación y acaba en la rotura o en el swing siguiente; los punteados, del swing a la confirmación;
  ninguna escalera salvo el stop; el naranja no se pinta donde coincide con el rojo (ago. y oct.); sin desplazamiento horizontal;
  el interruptor del filtro, en línea. Comprobaciones comunes.

## 29. Operaciones en «Señales en el gráfico» y letras resaltadas en los buscadores (V9.1063)

Solo pantalla: ningún cálculo del motor cambia (lo demás de «Señales en el gráfico», idéntico a V9.1062).

- **Operaciones en «Señales en el gráfico»**: cada operación, una línea de la entrada a la salida, verde si gana y roja si pierde,
  con la MISMA función que «Backtest de un valor» (`lineaOperacion` en lib/graficoPaneles.js; CandleChart la usa ahora, sin cambiar
  lo que pinta). `calculaSenales` da `operaciones`: las de las flechas (compra y venta en el periodo) y la abierta hasta el cierre
  de la última vela; `pnlPct` sin comisión, solo para el color. En la leyenda, la casilla «╱ gana · ╲ pierde» las enseña u oculta
  sin rehacer el gráfico (por defecto, enseñadas; `verOpsInicial` para el montaje).
- **Buscadores** («Mi trabajo», «Desde una de mis estrategias» y «Valor»): según se escribe, en cada resultado las letras que
  coinciden salen resaltadas con el color del buscador del catálogo de condiciones, sin distinguir mayúsculas ni acentos
  (`trozosResaltados` en lib/builder/buscar.js, que marca cada palabra de lo escrito donde aparezca, y components/Resaltado.js). En
  «Mi trabajo»: el nombre, la frase de la regla cuando sale como texto (las de tarjetas salen por bloques y no se resaltan) y, en
  «Mis pruebas», el nombre y las estrategias que incluye. En «Valor»: el ticker y el nombre.
- Comprobado: `trozosResaltados` a mano («tortu» y «TÓRTU» → [Tortu]gas, «lideres rsi» → [líderes] [RSI]2, «osc» → [Ósc]ar, vacío
  sin marcas); las 6 estrategias del editor (AAPL, diario y semanal, 3 periodos): todo lo demás de «Señales en el gráfico» idéntico a
  V9.1062 y cada línea con las fechas y los precios de sus flechas (557 operaciones); montaje SWC con estado de «Señales en el
  gráfico» (casilla marcada y desmarcada), de los dos buscadores y de «Mi trabajo» (las dos pestañas). En el navegador (los
  componentes compilados, sin la app) a 1440 px con «Swings 2/2» en AAPL jul–oct 2010: una línea roja (21/07 → 11/08) y una verde
  (la abierta, 11/10 → 29/10); la casilla las quita y las pone sin rehacer el gráfico; «NVÍ» y «inc» en «Valor», resaltados; sin
  desplazamiento horizontal. Comprobaciones comunes.

## 30. Indicador SuperTrend en el editor por tarjetas (V9.1064)

Toca el motor del editor, pero solo detrás de condiciones, un tipo de stop y funciones NUEVAS: lo de antes no cambia (las 6
estrategias del editor, con todo idéntico a V9.1063).

### La definición (la de TradingView, `ta.supertrend`)

- `supertrend(velas, N, M)` (lib/condiciones/indicadores.js): con el ATR de Wilder de N velas (`atr`, el mismo `calcATR` de
  lib/backtester.js que ya usaba el motor: TR de la primera vela = máximo − mínimo, semilla con la media de los N primeros TR y luego
  (ATR anterior × (N − 1) + TR) / N, como `ta.atr`), las bandas básicas (máximo + mínimo) / 2 ∓ M × ATR; la inferior final toma la
  básica si es mayor que la final anterior o si el cierre anterior cayó bajo la final anterior (si no, se queda: solo sube en
  tendencia); la superior, lo simétrico. Tendencia: en la primera vela con ATR, bajista (como TradingView); después, de bajista a
  alcista cuando el cierre supera la superior final, y de alcista a bajista cuando cae bajo la inferior final. Línea: la inferior en
  alcista, la superior en bajista. Con la vela cerrada; sin ATR o con un dato que falte, null y vuelve a empezar.
- `supertrendPrevio`: la línea al cierre de la vela anterior (la del stop, que actúa dentro de la vela).

### Piezas nuevas (grupo nuevo «SuperTrend» del catálogo)

- Condiciones (`{ periodo: N, k: M }`, 10 y 3 por defecto; N de 1 a 200, M de 0,1 a 20), con ficha y «?» con ejemplo en euros:
  **El SuperTrend está alcista** («Solo opero cuando…» y «Compro cuando…»), **El SuperTrend cambia a alcista** (solo en la vela del
  cambio; sin dato si la anterior no tiene SuperTrend) y **El SuperTrend cambia a bajista** (para «Vendo cuando…»; con su franja
  naranja, como las de swing). Calentamiento 4 × N (lo que tarda la media de Wilder en olvidar el principio).
- **Stop en la línea del SuperTrend** (`{ tipo: 'supertrend', periodo, k }`; pieza del grupo y tipo del desplegable de «Protección»,
  con sus dos casillas): al comprar, la línea al cierre de la vela anterior; en cada vela se recalcula y solo sube; salta dentro de
  la vela a su precio, o a la apertura si abre por debajo. Funciona con «manda el más alto» (el camino de los stops que suben). Si al
  comprar el SuperTrend está bajista, la línea va por encima del precio y vende en la apertura siguiente (lo dice su «?»).
- Casillas de prueba de N y M en la fila de arriba de «Señales en el gráfico» (las filas y el stop). **Exportar a code_js**: no exporta
  y explica por qué (el motor copiado no tiene el cálculo).

### Dibujo

- En «Señales en el gráfico» y en «Backtest de un valor», la línea sobre el precio en dos series: verde (`#3fb950`, la banda
  inferior) en tendencia alcista y roja (`#f85149`, la superior) en bajista, cortadas en cada cambio: `tramosLinea(…, seguidos)`
  (lib/graficoPaneles.js) parte por velas seguidas con valor aunque el valor cambie; en «Backtest de un valor» llegan del intérprete
  como `supertrend10_3a` / `supertrend10_3b` con `tramos` y `seguidos` (que pasa lib/graficoEstrategia.js). Leyenda: las dos líneas y
  «SuperTrend: alcista · bajista» con su «?». El stop rojo (#ff7b72) va un escalón por detrás de la línea (es la de la vela anterior).

### Comprobado

- A mano, 14 velas de 2 € de máximo a mínimo (ATR (3) = 2 desde la 3.ª), M = 1: bandas finales inferior 100, 101, 102, 103, 103, 103,
  103 (en las velas 6–8 la básica baja a 102,5 / 102,2 / 101,5 y la final no), 100…; superior 104, 104, 104, 107 (el cierre anterior
  104,5 la superó), 106,5…; tendencia bajista al empezar, alcista en la 4 (cierra 104,5 > 104), bajista en la 8 (102,8 < 103),
  alcista en la 12 (103,6 > 103); «cambia a alcista» solo en 4 y 12, «a bajista» solo en 8. Stop: compra a 105, stop 102 → 103 (no
  baja); la vela 8 abre a 104 y toca 103 → vende a 103; si abre a 102,9 → vende a 102,9; igual con «manda el más alto».
- AAPL 2015–2022: la tendencia, idéntica a la cuenta de `ta.supertrend` escrita aparte (10/3 y 7/2,5). No mira el futuro: 5 cortes,
  bandas, tendencia y línea (10/3, 7/2,5, 14/1,5) y las operaciones cerradas iguales; la abierta, con la misma entrada.
- «SuperTrend 10/3» hecha con las tarjetas (compro cuando cambia a alcista; vendo cuando cambia a bajista; stop en la línea; NO se ha
  guardado en la base), AAPL 2020–2021: las mismas operaciones (fechas y precios) en «Señales en el gráfico», «Backtest de un valor»
  y el paso 2 (6, la última abierta al final); verde siempre bajo el cierre y roja siempre encima, nunca las dos en una vela; el
  normalizador del gráfico la acepta sin descartes.
- Las 6 estrategias del editor (AAPL, diario y semanal, 2010–2015 y 2020–2021): señales, intérprete (con su gráfico), cifras,
  exportar y calentamiento idénticos a V9.1063; ida y vuelta byte a byte. Montaje SWC con estado del editor (las filas, el stop con
  sus casillas, el catálogo con el grupo y su pieza), de «Señales en el gráfico» (leyenda, franjas, 6 compras · 5 ventas) y del
  dibujo de la regla. Comprobaciones comunes.

## 31. Ajustes de pantalla: buscadores, ventanas «?», casillas de la leyenda y la fila del crecimiento (V9.1065)

Solo pantalla: ningún cálculo cambia (lib/ no se toca; las cifras, idénticas a V9.1064).

- **La «×» de los buscadores** (components/LimpiarBusqueda.js: `ConLimpiar`, que envuelve la casilla, y `BotonLimpiar`, para las
  que ya van en un contenedor con position: relative): dentro de la casilla, a la derecha, solo con texto; al pulsarla se vacía y
  vuelve la lista completa, con el foco en la casilla. La misma en los 13 buscadores de la app: catálogo de condiciones, «Mi
  trabajo», «Desde una de mis estrategias» y «Valor» (Builder); el de condiciones (ConditionsManager) y el de estrategias
  (StrategiesManager), el del panel de estrategias (StrategyManager), el de la lista de seguimiento (WatchlistManager), el de los
  activos de la optimización (OptimizacionPanel) y, en pages/index.js, el de estrategias de la configuración, el de la lista de
  seguimiento lateral, el del universo manual de la multicartera y «Filtrar activo…» de sus operaciones. Las «✕» propias que tenían
  cuatro de ellos, cambiadas por la común. «Mi trabajo» pasa de type="search" a texto (role="searchbox"), sin la × del navegador.
- **Al volver a entrar en el Builder** (BuilderPanel, cada vez que `visible` pasa a verse después de la primera): las búsquedas de
  «Mi trabajo» y «Desde una de mis estrategias» vacías (y ninguna elegida para copiar); `entradaBuilder` se lo dice al editor (el
  catálogo, vacío) y a «Señales en el gráfico» (`entrada`: todo enseñado otra vez). «Valor» ya salía vacío. Si se ve la lista (sin
  editor, prueba ni guía), la pestaña «Mis estrategias» y el cursor en su casilla de búsqueda.
- **Ventanas «?»** (components/BuilderAyuda.js, la única «?» de la app; el «ⓘ» de components/Tip.js no se toca): van en un portal
  (document.body, posición fija: ninguna tarjeta las recorta). Se miden con su texto en una copia invisible: debajo del «?» si
  caben, si no encima; si no caben en ninguno de los dos lados, se ensanchan (300, 420 y hasta 560 px, o lo que deje la pantalla
  con 12 px de margen) y, si aun así no caben, van al lado con más sitio con desplazamiento vertical dentro. Se cierran al pulsar
  fuera, con Escape, al desplazar la página o al cambiar el tamaño (desplazar el texto de la ventana no la cierra); al salir el ratón
  hay 180 ms para pasar a la ventana.
- **Casillas de la leyenda de «Señales en el gráfico»**, una por elemento, todas marcadas al entrar: flechas de compra y venta,
  líneas de operación, cada media, cada canal (máximo / mínimo de N velas; las dos bandas de Bollinger juntas; los dos tramos de
  cada swing por separado; las dos líneas del SuperTrend juntas; el stop activo), puntos de swing, zona gris del filtro, franjas
  (todas, con sus nombres) y cada panel de oscilador. Cada serie se crea una vez, apuntada con la clave de su casilla, y solo cambia
  su `visible`; las flechas (marcas de las velas) se quitan y se vuelven a poner; los nombres de las franjas y los paneles de
  osciladores, con display. Así no se rehace el gráfico ni se mueve el zoom. Lo oculto no se guarda (`ocultosIniciales`, para el
  montaje).
- **La fila del crecimiento** de la tabla de cifras: «CAGR (5,99a)» con los años del periodo (`metricas.anios` de calcMetrics, como
  «Backtest de un valor»). Con menos de un año, «Rentabilidad del periodo (0,33a)» sin anualizar en las dos columnas (lo que creció
  el dinero: el final de las curvas de «Cómo habría crecido 100», la compuesta de la regla y la de comprar y mantener), con la nota
  «periodo de menos de un año: no se anualiza» y su «?» (de 100 a 121 en 4 meses = +21 %; anualizado, +77 %).
- Comprobado: montaje SWC con estado (la «×» con texto y sin ella en los cuatro del Builder y en ConditionsManager y
  StrategiesManager; la ventana abierta; las casillas de «Swings 2/2» y de una regla con medias, Bollinger, máximo de 20 velas, RSI,
  MACD y SuperTrend; ocultos el RSI, las franjas y las flechas). «Swings 2/2» en AAPL 01/07–31/10/2010: «Rentabilidad del periodo
  (0,33a)», regla −1,81 %, comprar y mantener +21,13 % (antes, CAGR −5,40 % y +79,22 %); 2010–2015: «CAGR (5,99a)» (del 04/01/2010 al
  31/12/2015), +10,98 % y +22,93 %, cifras idénticas a V9.1064. En el navegador (los componentes compilados, sin la app) a 1440 px:
  al cargar, el cursor en «Mi trabajo»; la «×» de «Mi trabajo», «Desde una de mis estrategias» y «Valor» sale solo con texto, dentro
  de la casilla, y al pulsarla vacía la búsqueda, vuelve la lista entera y deja el foco; las tres, iguales; salir y volver a entrar
  deja las búsquedas vacías y el cursor en «Mi trabajo»; la «?» de «Estructura alcista» abajo a la izquierda, abajo a la derecha y
  dentro de una tarjeta que recorta, entera (420 px, encima o debajo) y una el triple de larga junto al borde derecho, entera con
  desplazamiento (560 px); se cierran con Escape y al pulsar fuera; cada casilla de la leyenda oculta y enseña sus series sin crear
  ninguna nueva ni rehacer el gráfico. Ida y vuelta; comprobaciones comunes.

## 32. Fechas al revés, protección de los paneles, stop del SuperTrend en el dibujo y zoom que se mantiene (V9.1066)

El motor no cambia (sin pedir el historial de la posición abierta, `interpreta` da exactamente lo mismo que antes).

- **Fechas**: con «Otras fechas», si la de inicio es posterior a la de fin sale junto a las fechas «La fecha de inicio es posterior a
  la de fin.»; con una fecha vacía o a medio escribir, «Escribe las dos fechas completas (dd/mm/aaaa) para ver las señales.»; en los
  dos casos no se calcula nada (ni gráfico ni cifras). Sin velas en el periodo (antes o después de los datos del valor, o un fin de
  semana) sale solo el aviso «No hay velas de este valor en esas fechas.». Antes, en esos casos, `r.velas[0].date` tumbaba la app
  entera («Application error: a client-side exception has occurred»). Con 1 o 2 velas se dibuja normal.
- **Protección de los paneles** (components/ProteccionPanel.js, un límite de errores de React): «Señales en el gráfico», «Dibujo de
  la regla», el editor por tarjetas, el de código, «Probarla contra el azar», la guía y el Builder entero (pages/index.js). Si algo
  falla al pintar, sale dentro del panel «No se pudo enseñar «…»», el detalle y el botón «Volver a intentar» (vuelve a montarlo).
- **Auditoría del stop del SuperTrend** («SuperTrend 10/3», AAPL 2020–2021, precios guardados): el MOTOR estaba bien (la línea del
  SuperTrend de la vela anterior, solo sube). (a) En julio–agosto de 2021 la propia línea del SuperTrend se queda en 140,52 del 14/07
  al 12/08 (la banda inferior final no baja y las básicas salían más bajas) y el stop la sigue con una vela de retraso (142,27 el
  13/08 → stop 142,27 el 16/08). (b) Desde el 20/10/2021, la operación abierta al final se dibujaba entera con el stop del ÚLTIMO
  día (167,16): una línea plana por encima del precio. Ahora `interpreta(…, { historialAbierta: true })` (solo lo pide «Señales en el
  gráfico») añade a la posición abierta su `stopHistory` y se dibuja vela a vela (139,56 → 167,16): el rojo es, en cada vela, el
  stop del motor (0 velas distintas en 2020–2021). Pendiente: «Backtest de un valor» dibuja la abierta con el mismo defecto (el
  núcleo la cierra el último día solo con `stopPx`); arreglarlo cambia la respuesta del backtest.
- Donde el stop activo ES la línea del SuperTrend de la vela anterior (el stop en su línea), no se pinta el rojo (quedaban dos líneas
  casi pegadas y una vela desplazadas): solo la línea del SuperTrend. El rojo queda donde el stop va por otro sitio; la leyenda dice
  «stop activo (donde no es la línea del SuperTrend)» con su «?». Con un mínimo de swing en vigor bajo el stop sigue mandando el stop
  real (V9.1062).
- **Zoom**: `Graficos` guarda el rango visible (con la llave valor | desde | hasta | velas) y, al rehacer el gráfico por un número,
  una opción o una fila, lo vuelve a poner en vez de reajustar a todo el periodo; con otra llave, se reajusta.
- Comprobado: montaje SWC con estado (V9.1065 se rompía con «Desde» posterior a «Hasta», fuera de los datos y con 0 velas; ahora,
  sus avisos; 1 y 2 velas, dibujadas); el motor idéntico; el stop dibujado = el del motor vela a vela; «SuperTrend 10/3» con las
  mismas 6 compras y 5 ventas; las 7 estrategias del editor iguales salvo el stop de la abierta (y, en «Swings 2/2» 2020–2021, el
  mínimo de swing que se quita bajo él) y el rojo tapado por el SuperTrend. En el navegador (los componentes compilados, sin la app)
  a 1440 px: un panel que falla enseña su aviso y «Volver a intentar» lo recupera sin tocar el resto; fechas al revés, a medias,
  vacías, fuera de los datos y de una vela tecleadas: sus avisos, sin pantalla en negro; con el gráfico REAL en pantalla, zoom en las
  velas 300–360, cambiar el multiplicador de compra y luego el del stop rehace el gráfico y deja 300,24–360; cambiar la fecha de
  inicio reajusta (0–401). Ida y vuelta; comprobaciones comunes.

## 33. Parámetros enlazados, «Cómo compro» para probar, señal y compra por separado y velas semanales en el paso 1 (V9.1067)

Toca el motor solo detrás de un tipo de orden NUEVO (`'supertrend'`): las estrategias que no lo usan dan exactamente lo mismo.

- **Parámetros enlazados** (lib/builder/enlaces.js, puro). Un «uso» es cada sitio que usa un indicador con números: una fila de «Solo
  opero cuando…» (del valor), «Compro cuando…» o «Vendo cuando…», un stop o la orden. Familias: SuperTrend (N, M), swing (L / R),
  cada tipo de media (su periodo), ATR, RSI, Bollinger y MACD. Los usos de la misma familia con los MISMOS números van enlazados
  (`gruposDe`): en el editor, cambiar un número de uno lo cambia en todos los de su grupo (`propagaEnlaces`, dentro de `setDef`; solo
  si cambia UN número de UN uso y la forma es la misma: añadir, quitar o mover filas no propaga) y se dibuja una sola línea. Cada
  uso enlazable lleva un 🔗 con su «?» (el ejemplo de entrar con 10/3 y salir con 10/5): pulsarlo lo suelta (números propios, su línea
  aparte con su leyenda); volver a pulsarlo lo enlaza y le pone los números del grupo de su familia (`enlazaUso`). En «Señales en el
  gráfico», una sola casilla por grupo («SuperTrend ( 10 , 3 ) · compra, venta y stop»; campo `{ tipo: 'grupo', miembros }`, que
  escribe en todos); en las filas de sus miembros esos números salen como «🔗». NO se guarda nada nuevo: al abrir una estrategia, los
  usos con los mismos números salen enlazados y los distintos, sueltos (lo guardado no cambia ni un byte). Lo soltado vive solo en la
  pantalla (`sueltos`; si se suelta una fila y se deja con los mismos números, al volver a abrir sale enlazada).
- **«Cómo compro» en las casillas de arriba**: un desplegable con apertura de la vela siguiente, orden en el máximo de la vela de la
  señal, orden en el nivel de ruptura, orden en el último máximo de swing y la NUEVA orden en la línea del SuperTrend (campo
  `{ tipo: 'modoOrden' }`, que se aplica antes que los números), con los números de cada una (las velas del máximo o de la ruptura,
  L / R del swing, N / M del SuperTrend; la orden no tiene un «cuántas velas espera»: no existe en el motor). Como las demás
  casillas: solo para probar, en ámbar con «(guardado: …)», y se guarda con «Guardar estos valores en la estrategia».
- **Orden en la línea del SuperTrend** (`entrada.orden = { tipo: 'supertrend', nivel: { periodo, k } }`; también en la tarjeta
  «Cómo compro»): con el SuperTrend bajista al cierre de la vela anterior, compra en cuanto el máximo de la vela TOCA su línea (la
  roja, por encima): a ese nivel, o a la apertura si abre ya por encima. Con el SuperTrend alcista no hay orden; se rehace en cada
  vela; la señal es opcional (como con la ruptura). Al elegirla toma los números del SuperTrend que ya use la estrategia. Calentamiento
  4 × N; no se exporta a code_js.
- **Señal y compra por separado** («Señales en el gráfico»): un punto en la vela de la SEÑAL de cada compra (verde, en el cierre) y de
  cada venta (naranja), y la flecha en la vela en que se compra o se vende. Compra: la última «señal» del motor hasta la compra (con
  apertura siguiente, la vela de antes; con una orden en un nivel, la vela en que se puso o en que el precio la tocó). Venta: por una
  condición o por tiempo a la apertura, la vela anterior; por un stop o un objetivo, la misma. En la leyenda, «● ● señal» con su
  casilla y su «?». («Backtest de un valor» no se toca: es otro dibujo.)
- **Velas semanales en el paso 1**: el editor ya dejaba elegir «Semanales» (arriba, junto al nombre). Ahora «Señales en el gráfico»
  tiene el desplegable «Velas: [diarias ▾]» para probar (`cambios.intervalo`, se guarda con «Guardar estos valores»), y el gráfico y
  las cifras van en semanal con el mismo núcleo que «Backtest de un valor». Aviso: «El paso 2 (prueba contra el azar) aún no admite
  velas semanales.»; con la estrategia semanal, «Guardar y pasar al paso 2» queda desactivado (con ese motivo) y sale «Guardar» aparte.
- Comprobado: la orden nueva a mano (las 14 velas de V9.1064: la 4.ª toca 104 → compra a 104; si abre a 104,2 → a 104,2; sin tocarla,
  no; alcista, no); no mira el futuro (5 cortes); las 7 estrategias del editor iguales a V9.1066 (señales, intérprete, cifras y
  exportar, diario y semanal), abren sin cambios y su ida y vuelta, byte a byte; enlazados: «SuperTrend 10/3» abre con un grupo
  (compra, venta y stop), el multiplicador de «Vendo» a 5 cambia los tres y queda una línea, soltada y a 5 deja 3 / 5 / 3 y dos
  líneas, volver a enlazarla la pone en 3; la casilla única cambia los tres; cada opción de «Cómo compro» probada en la casilla (con
  «SuperTrend 10/3»: apertura 6 compras; máximo 6; ruptura 3; swing y línea del SuperTrend, 0, porque su fila «cambia a alcista»
  pide lo contrario que la orden en la misma vela: con esas órdenes las filas de compra son opcionales); los puntos de señal en la
  vela de antes de cada compra y en la misma de cada venta por stop; «Swings 2/2» y «SuperTrend 10/3» en semanal 2010–2015 con las
  mismas operaciones que «Backtest de un valor» semanal. Montaje SWC con estado (el editor con sus 🔗 y su «?», el paso 2 bloqueado en
  semanal, la tarjeta de la orden nueva; «Señales en el gráfico» con sus casillas, desplegables, ámbar y leyenda). En el navegador, el
  editor real: 3 / 3 / 3 → «Vendo» a 5 → 5 / 5 / 5; 🔗 la suelta; a 4 → 5 / 4 / 5; 🔗 la enlaza → 5 / 5 / 5. Comprobaciones comunes.

## 34. El stop de la operación abierta en «Backtest de un valor» (V9.1068)

Lo pendiente de §32: en «Backtest de un valor», la operación que sigue abierta al final del periodo se dibujaba entera con el stop
del ÚLTIMO día (el núcleo la cierra el último día con un cierre ficticio que solo llevaba `stopPx`), una línea plana por encima del
precio. Ahora lib/backtestActivo.js pide al intérprete el historial de la abierta (`historialAbierta`, como «Señales en el gráfico»)
y lib/nucleoBacktest.js lo pasa al cierre ficticio (`stopHistory`, solo si la estrategia lo da: las de código, igual que antes).
CandleChart ya dibujaba `stopHistory` vela a vela. Las cifras no cambian (el cierre ficticio sigue siendo el mismo).
La multicartera (pages/api/multibacktest.js) tiene su propio cierre ficticio y no se toca: su «stop inicial» (lib/prioridadCartera.js)
sigue leyendo lo mismo.

- Comprobado: «SuperTrend 10/3», AAPL 2020–2021 (precios guardados): la abierta desde el 20/10/2021 lleva 20 niveles (139,56 →
  167,16) y, vela a vela, es el stop del motor y el de «Señales en el gráfico» (antes, toda a 167,16); las cifras, las curvas y las
  demás operaciones, idénticas a V9.1067; las 7 estrategias del editor (AAPL, diario y semanal, 2010–2015 y 2020–2021), iguales
  salvo el historial de la abierta. Comprobaciones comunes.

## 35. Max Drawdown vela a vela en el paso 1 y en «Backtest de un valor» (V9.1069)

El Max Drawdown de «Señales en el gráfico» salía de calcMetrics (lib/utils.js, `ddComp`), que solo mira el dinero de las
operaciones CERRADAS: «SuperTrend 10/9» en AAPL 2010–2015 (una operación, ganadora) daba 0,00 %. Ahora (lib/ddVelaAVela.js,
`curvasVelaAVela` y `caidaMaxima`) la curva de la regla se calcula vela a vela, con la operación abierta marcada a mercado al cierre
de cada vela y las mismas cuentas que buildTrades (capital compuesto que deja la anterior, comisión de compra, acciones; el día de la
venta, su `capitalTras`). Una operación de 100 → 120 → 90 → vende a 110 da −25 %, no 0.

- Paso 1 (lib/builder/ensayo.js, cifrasRegla): la fila «Max Drawdown (vela a vela)» y la línea de la regla de «Cómo habría crecido
  100» (antes, a escalones y con ~300 puntos; ahora una por vela, y el último valor es el mismo).
- «Backtest de un valor» (pages/index.js): la fila «Max Drawdown (vela a vela)», en Compuesta y en Simple, con la misma función, y ya
  no depende del interruptor «Flotante» (que sigue mandando en el gráfico). Antes, con «Flotante», la compuesta era una aproximación
  (la curva muestreada y las acciones de la simple).
- NO cambian: calcMetrics (`ddComp`/`ddSimple`, que usan el ranking, la optimización y las carteras), el Max Drawdown de
  comprar y mantener (el de siempre), los laboratorios, la multicartera, la batería V9.949, las huellas ni CARTERA_1–3.
- Antes → después (AAPL 2010–2015, comisión 0,36 €, compuesta): «SuperTrend 10/9» 0,00 → 14,67 %; «Tortugas 20/10» 10,25 → 15,67 %
  («Flotante» en «Backtest de un valor»: 13,01 %); «Swings 2/2» 9,76 → 15,56 % (12,72 %). «SuperTrend 10/3» AAPL 2020–2021: 12,37 →
  19,10 % (19,08 %); las demás cifras, iguales.

## 36. Marcas más separadas y aviso de combinación imposible (V9.1070)

- **Marcas en «Señales en el gráfico»** (lib/builder/marcas.js, `colocaMarcas`, puro; components/BuilderSenales.js las dibuja). Las
  flechas de lightweight-charts 4.2 («aboveBar» / «belowBar») van pegadas a la vela y no dejan elegir el hueco, y el punto de la
  señal iba en el cierre, encima del cuerpo. Ahora cada marca tiene su precio, en carriles fuera de la vela: por encima del máximo,
  de abajo arriba, el punto de swing de máximos, el de la señal de compra, el de la señal de venta y la flecha de venta; por debajo
  del mínimo, el punto de swing de mínimos y la flecha de compra. Solo ocupan carril las marcas de esa vela; el primero, a medio ATR
  (14) de la vela, y cada uno a 0,7 ATR del anterior (sin ATR, el rango de la vela). Las flechas son marcas «inBar» (centradas en el
  valor del punto) sobre una serie invisible. Los puntos de swing pasan de un 0,6 % fijo a medio ATR. «Backtest de un valor» no se
  toca: es otro dibujo (CandleChart).
- **Combinaciones que nunca compran** (lib/builder/tarjetas.js, `combinacionesImposibles`): filas de «Compro cuando…» (o de «Solo
  opero cuando…» del valor) que piden en la vela de la señal lo contrario que la forma de comprar. Aviso en ámbar junto a la fila,
  en «Comprobación» del editor y encima del gráfico de «Señales en el gráfico» (con «Cómo compro» de las casillas). No bloquea
  guardar. Una fila con «NO» no cuenta; con «basta con una», solo si todas sus filas lo son.
  - Nunca: orden en la línea del SuperTrend (N, M) con «El SuperTrend cambia a alcista» o «está alcista» con los mismos N y M (la
    orden pide el SuperTrend bajista al cierre de la vela anterior); orden en el último máximo de swing (L / R) con «El cierre supera
    el último máximo de swing» con los mismos L / R (ese cierre ya lo superó y cada swing se usa una vez: 0 compras en 30 años de
    AAPL, NVDA, SAN.MC y ^GSPC con 6 pares L / R).
  - Casi nunca (otro texto): orden en el último máximo de swing con «El SuperTrend cambia a alcista». NO es imposible: con 10/3 y
    swing 2/2, 8 compras posibles en 30 años de AAPL (64 con 10/1); en 2010–2015 con 10/3, 0. Con otros N / M en la orden y en la
    fila, sí compra (48 veces en AAPL con orden 10/3 y fila 10/2): sin aviso.
- Comprobado: montaje SWC (el editor con la orden en el SuperTrend: un aviso junto a la fila y uno en «Comprobación»; guardada, sin
  aviso; los casos de arriba, con NO, con «basta con una», con otros números y en el filtro); carriles a mano (ATR 4, vela 98–102:
  104 · 106,8 · 109,6 · 112,4 arriba; 96 · 93,2 abajo); ida y vuelta 7 de 7. Comprobaciones comunes.

## 37. El paso 1 con los mismos precios que «Backtest de un valor» (V9.1071)

- **Por qué.** El paso 1 leía las velas solo de la caché de Supabase (`rpc/leer_velas` desde 1990, components/BuilderPanel.js): sin
  la vela de hoy, con el retraso de cada valor según cuándo se usó por última vez en un backtest (el 28/10/2026, QQQ llegaba al 26/10)
  y sin los valores que no están en la caché (SAN.MC, que además no salía en la lista). «Backtest de un valor» terminaba el 20/10 por
  otra cosa: su periodo guardado está en «Fechas» con fin 20/10/2026 (no es un fallo de precios; los ajustes no se tocan).
- **pages/api/velas.js** (nuevo, GET `?simbolo=`, con sesión): `diariasConCache` (lo guardado más lo último de Yahoo, guardando lo
  cerrado que falte; si la caché falla, la descarga de Yahoo de siempre), la última vela marcada en curso con `marcaDiariaEnCurso`, y
  `semanaAbierta` (el lunes de la semana que aún no ha cerrado, con `semanaEnCurso`). Ordenadas y sin fechas repetidas (`ordenaUnicas`).
  Ventana de 40 años (desde 1986, antes que cualquier vela guardada) con **`tramoAnterior: false`** (opción nueva de `diariasConCache`,
  por defecto true: los backtests no cambian): devuelve lo guardado desde donde empiece y no descarga ni guarda años antiguos. Un valor
  que no está en la caché se descarga entero y se guarda, como haría un backtest.
- **El paso 1**: `cargaVelas` pide /api/velas; la lista de valores suma la lista de seguimiento y el universo a los de la caché.
  Semanales: `calculaSenales` y `cifrasRegla` aceptan `semanasAbiertas` ({ símbolo: lunes }): esa semana va en curso, como en
  `fetchAVDetalle`. Las señales no deciden con una vela en curso (`soloCerradas`, como el núcleo); el gráfico sí la dibuja.
- Comprobado: última vela del paso 1, antes → después: ^GSPC 27/10 → 28/10, AAPL 27/10 → 28/10, NVDA 27/10 → 28/10, SAN.MC no
  estaba → 28/10, QQQ 26/10 → 28/10; lo guardado, idéntico byte a byte a lo que daba `leer_velas`. Ensayo 2010–2015 con AAPL (Tortugas
  20/10, Swings 2/2, SuperTrend 10/3; diarias y semanales): cifras, curvas y señales idénticas a antes. SuperTrend 10/3, AAPL: paso 1
  = «Backtest de un valor» en 2020–2021 (CAGR 26,43 %, 6 operaciones) y en los últimos 5 años (CAGR 7,81 %, 20 operaciones).
  Sintéticas a mano (una ruptura en la última vela compra si está cerrada y no si está en curso; la semana abierta en curso;
  `ordenaUnicas`). Montaje SWC idéntico a antes. Supabase, simulado en las pruebas (solo lectura). Comprobaciones comunes.

## 38. Avisos de fecha final en «Backtest de un valor» y en el paso 1 (V9.1072)

- **lib/avisoFechaFinal.js** (`avisoFechaFinal`, puro): un aviso ámbar encima del gráfico, con su «?» (components/BuilderAyuda.js).
  Solo avisa. Dos casos que no se mezclan:
  - «El periodo termina el 20/10/2026 porque elegiste Fechas.»: el periodo está en «Fechas» (en el paso 1, «Otras fechas») y la
    fecha final es anterior a la última sesión esperada. La «?» explica que en «Fechas» el final no avanza solo y que «Últimos N años»
    siempre llega a hoy.
  - «Faltan velas: los precios de QQQ llegan hasta el 26/10/2026.»: el periodo pide llegar a hoy y la última vela es más antigua que
    la última sesión esperada.
  - Última sesión esperada: el último día de lunes a viernes ANTERIOR a hoy (la de hoy no se exige: puede no haber abierto). Fines de
    semana sí; festivos no (un festivo puede dar un aviso de más, aceptado). En semanal, la última semana cerrada (la de esta semana
    si hoy es sábado o domingo; si no, la anterior), comparada con el lunes de la última vela.
- **Dónde**: «Backtest de un valor» (pages/index.js, encima del gráfico, con el periodo del panel y las velas del resultado; no con
  «Probar en backtest», que usa las fechas de la optimización). Paso 1, «Señales en el gráfico»: solo con «Otras fechas» (el ensayo
  tiene fechas fijas).
- Comprobado: a mano (miércoles 28/10/2026 → sesión 27/10 y semana del 19/10; lunes 02/11 y domingo 01/11 → viernes 30/10; sábado
  31/10 → semana del 26/10; los dos textos y los casos sin aviso); montaje SWC del paso 1 (Otras fechas hasta 31/12/2025 → «fechas»;
  hasta hoy con velas hasta el 20/10 → «faltan»; el ensayo y velas al día → sin aviso). Comprobaciones comunes.

## 39. Paso 1: barra arriba, colores comunes, stop visible, etiquetas por operación y caída máxima en la curva (V9.1073)

**Parte A · la barra de arriba y la tabla de cifras**
- **Barra** (components/BuilderEditor.js), en la fila del título «Paso 1 · Crear la estrategia» (fija al desplazarse), a la izquierda
  de «Guía: cómo se prueba una estrategia», en las tres pestañas:
  - El estado: «✓ Sin cambios: ves la estrategia guardada»; «● Probando cambios sin guardar: …» (ámbar) con la lista corta de lo
    cambiado, en las tarjetas o en las casillas de prueba (las 3 primeras y «y N más»; todas, al pasar el ratón); con una estrategia
    nueva, «● Estrategia nueva: todavía sin guardar».
  - «Volver a los guardados»: siempre visible, desactivado sin cambios. Deshace las tarjetas Y las casillas: la estrategia queda byte
    a byte como está guardada (estadoDe(fila), sin casillas, sin usos soltados).
  - «Guardar en la estrategia»: siempre visible, desactivado sin cambios o con errores. Es guardaValores (las tarjetas con las
    casillas, la misma regla de «· versión N»; el aviso de la versión, en su título) y se sigue en la pestaña donde se estaba
    (BuilderPanel.js alGuardar, info.pestana).
  - Se quitan los botones de abajo de «Señales en el gráfico» y el «Guardar» de las velas semanales. «Guardar y pasar al paso 2» se queda.
- **lib/builder/barraCambios.js** (puro): conCasillas (las casillas sobre las tarjetas; unas velas iguales a las de las tarjetas no
  son un cambio), hayCambios (definición, valores, velas —sin escribir son diarias—, nombre y descripción, en JSON canónico) y
  listaCambios («SuperTrend · Periodo: 12 (guardado 10)», «fila nueva: Compro: RSI», «fila quitada: …», «velas semanales (guardado
  diarias)», «nombre …»; si cambia otra cosa, «otros cambios en la regla»).
- **lib/coloresCifras.js**: las reglas de color de la tabla RESUMEN de «Backtest de un valor» (buildUnifiedRows), que ahora las usa
  de ahí sin cambiar ningún color, y también las cifras del paso 1, en las dos columnas: CAGR verde/rojo por el signo, Max Drawdown
  rojo, Win Rate verde desde el 50 %, Factor de beneficio verde desde 1, Operaciones y Tiempo invertido amarillos.
- «Max Drawdown (vela a vela)» pasa a «Max Drawdown» en las dos pantallas, con su «?» (AYUDA_MAX_DD). La línea de encima de las
  cifras del paso 1 («Compuesto…») pasa al «?» del título de la tabla, con un ejemplo.
- Comprobado: montaje SWC (barra sin cambios en las tres pestañas; con una casilla cambiada; con tarjetas y casilla; semanales sin
  «Guardar»; estrategia nueva); «Volver» deja la definición y los valores byte a byte como los guardados; los colores comunes dan lo
  mismo que las fórmulas de antes para negativos, cero, umbrales, NaN y null. Comprobaciones comunes.

**Parte B · «Señales en el gráfico»: el stop y las etiquetas (V9.1074)**
- **El stop activo, siempre** (lib/builder/senales.js): mientras hay operación abierta, rojo punteado, vela a vela, también donde
  coincide con la línea del SuperTrend (va encima: se crea después). Se revierte el ocultado de V9.1066; la leyenda dice «stop
  activo» y su «?» (AYUDA_STOP) explica que va una vela por detrás de la línea. senales.js devuelve `stopFinal`: el stop de la
  operación que sigue abierta en la última vela; el gráfico lo pone como etiqueta roja en el eje de precios («Stop 154,64», una
  createPriceLine sin línea) y se oculta con la casilla del stop.
- **Una etiqueta por operación** (components/BuilderSenales.js, dibujaEtiquetas): «+0,8 %», «−1,6 %», la abierta con «(abierta)» y el
  cierre de la última vela; % = (salida / entrada − 1) × 100, como CandleChart.js, con su dibujo (recuadro verde o rojo arriba,
  línea punteada a la mitad de la operación) y sin número de operación. Van en una franja de 3 filas que la escala de precios deja
  libre (scaleMargins), así que no tapan las velas, los puntos ni las flechas. Casilla «% por operación» en la leyenda.
- Ningún cálculo cambia: solo el dibujo.
- Comprobado: montaje SWC con los precios guardados (SuperTrend 10/3 con compra «cambia a alcista» y stop en la línea): NVDA
  2024–07/2025 (5 operaciones, la última abierta: «+56,1 % (abierta)», «Stop 154,64» = stop de la última vela; el stop coincide con
  la línea en 146 velas y se dibuja en todas) y AAPL 2010–2015 (24 operaciones); cada % comprobado a mano; la casilla oculta las
  etiquetas. Comprobaciones comunes.

**Parte C · la caída máxima en «Cómo habría crecido 100» (V9.1075)**
- La curva de equity de «Backtest de un valor» ya marca la caída máxima (EquityChart.js addDD: una línea del máximo previo al
  mínimo con su etiqueta), así que se usa ese dibujo: en la curva de «Tu regla» (solo esa), una línea roja del máximo previo al
  mínimo y, en el punto más bajo, la etiqueta roja con la cifra («−21,45 %»). La cifra es EXACTAMENTE el Max Drawdown de la tabla
  (cifras.regla.maxDD); tramoCaida (components/BuilderSenales.js) solo busca dónde dibujarla, con la misma regla que caidaMaxima (el
  máximo empieza en 100). Ningún cálculo cambia.
- Comprobado: a mano (100 → 120 → 90 → 110: del 120 al 90; 98 → 80: desde la base 100); con cifrasRegla, SuperTrend 10/3 en AAPL
  2010–2015 (−21,45 %, mínimo el 29/09/2015) y NVDA 2024–07/2025 (−35,60 %, el 21/04/2025): el mínimo marcado es el de caidaMaxima,
  la caída dibujada es la de la tabla y la etiqueta de la curva dice lo mismo que la tabla. Comprobaciones comunes.

## 40. Línea de tendencia bajista y stop en el mínimo de la vela que cierra bajo la EMA (V9.1076)

**Auditoría (solo lectura, antes de tocar nada)**
- Los swings de V9.1059 (lib/condiciones/indicadores.js swings: L / R, estrictamente mayor, confirmado al cierre de v + R) sirven tal
  cual para los máximos de la línea; la «orden en el último máximo de swing» (ordenSwing y su rama del intérprete) es el modelo de la
  orden en la línea. «Cómo compro» (leeOrden / ponModoOrden) admite un modo más sin tocar los demás.
- «Stop inicial en el mínimo de la vela de señal»: ya existía (`nivel` con `de: [{ campo: 'low' }]`, «Mínimo de la vela de la señal»).
- «Stop en el mínimo de la vela que cierra bajo la EMA N»: el `trailing` de siempre lo hace con «en su orden», pero **con «manda el
  más alto» el motor no lo mueve** (en esa rama solo suben minimoMovil, swingMinimo y supertrend): el trailing se queda vacío toda la
  operación. Arreglarlo cambiaría una pieza existente (y las cifras de cualquier estrategia guardada con trailing + «manda el más
  alto»), así que NO se toca: hay un stop nuevo, `emaMinimo`, que entra por el mismo camino que los stops que suben y funciona en los
  dos modos.

**La regla de la línea (lib/condiciones/indicadores.js lineaBajista; para la vela k, con lo conocido al cierre de k)**
- P = el último máximo de swing confirmado dentro de las N últimas velas (v ≥ k − N + 1). Q (el ancla) = el máximo de swing anterior
  a P más reciente con máximo > el de P tal que ninguna mecha de las velas entre Q y P quede por encima de la recta Q–P (si alguna
  queda, el siguiente más alto hacia atrás); Q también dentro de las N velas. Sin Q, no hay línea. El ancla de cada P no depende de
  k: se calcula una vez por P.
- «Si el último máximo sube»: «unir con el anterior más alto» (por defecto: lo de arriba) o «invalidar la línea» (si el máximo de P ≥
  el del máximo de swing anterior, no hay línea).
- Valor en la vela k: la recta Q–P. Señal (la condición «Rompe la línea de tendencia bajista», `rompeLineaBajista`, grupo «Swings»):
  el primer CIERRE por encima de la línea vigente; cada línea (el par Q–P) da una sola señal, con operación abierta o sin ella (solo
  depende del precio). Sin línea, false; antes de L + R velas, null.
- «Cómo compro»: «apertura de la vela siguiente» (lo de siempre) u «Orden en la línea de tendencia bajista» (orden `lineaBajista`,
  { nivel: { izquierda, derecha, velas, siSube } }): en la vela i, la línea vigente al cierre de i − 1 proyectada a i; compra si el
  máximo la SUPERA (a ese nivel, o a la apertura si abre por encima). Cada línea se usa una vez: la primera vela cuyo máximo la supera
  la gasta, con compra o sin ella. Las filas de «Compro cuando…» pasan a ser opcionales. Con la fila «Rompe la línea…» y la orden con
  los mismos números, aviso «casi nunca compra» (el cierre que la rompe ya la ha superado con su máximo).
- Al elegir la orden en la línea (o con su «+» del catálogo), toma los números de la fila «Rompe la línea…» si la hay; los dos usos van
  enlazados (familia «Línea bajista»: L, R y N).

**El stop `emaMinimo` (lib/editor/interprete.js; lib/condiciones/indicadores.js minimoBajoMedia)**
- { periodo } (10 por defecto): con la operación abierta (velas desde la de la compra), cada vela que CIERRA bajo su EMA de N propone su
  mínimo; desde la vela siguiente el stop es el mayor entre el actual y ese mínimo: nunca baja. Empieza vacío. Salta dentro de la vela
  a su precio, o a la apertura si abre por debajo. Vale con «en su orden» y con «manda el más alto». La EMA es la del motor (calcEMA:
  arranca con la SMA de los N primeros cierres).
- En las tarjetas: «En el mínimo de la vela que cierra bajo la EMA (solo sube)», con su casilla del periodo, su «?» y su pieza en el
  catálogo (enlazada con las filas de la EMA del mismo periodo). Motivo de salida: trailing_exit, como el de la 1 V50.

**Lo demás**
- Formato (lib/editor/definicion.js): TIPOS_ORDEN + 'lineaBajista', TIPOS_STOP + 'emaMinimo', con su validación y sus frases.
  Calentamiento: N para la condición y la orden; el periodo de la EMA para el stop (historia.js, laboratorio.js). El exportador a
  code_js no las copia y dice por qué. Funciona igual en diario y en semanal (son velas).
- Solo detrás de una condición, una orden y un stop nuevos: lo de antes no cambia (la opción con nombre de los desplegables de las
  filas —«unir con el anterior más alto»— es nueva; las opciones de antes no tienen nombre y se ven igual).
- Comprobado (pruebas sintéticas de Sergi, L/R 2/2, N = 120, «unir», a la apertura):
  - E1: máximos 3 (90) y 9 (80, conocido en la 11); línea 3–9; señal en la 16 (72 > 68,33); compra en la 17 a 72,5. ✓
  - E2: máximos 3, 8 y 14 (conocido en la 16); 3–8 hasta la 15 y 8–14 desde la 16; señal en la 18 (65 > 63,67); compra en la 19 a 65,5. ✓
  - E3: máximos 3, 9 y 13 (conocido en la 15); 3–9 hasta la 14 y 9–13 desde la 15; sin señal en la 17 (69 < 72); señal en la 18
    (73 > 71); compra en la 19 a 73,5. ✓
  - E4: máximos 3 (90), 8 (82) y 12 (84, conocido en la 14); 3–8 hasta la 13; con «unir», 3–12 desde la 14, señal en la 18 (82 > 80),
    compra en la 19 a 82,5; con «invalidar», sin línea desde la 14 y sin compra. ✓
  - E5: compra a la apertura de la 5 (66,5) con stop inicial 62 (mínimo de la 4). Con la EMA10 del motor (SMA de los 10 primeros
    cierres = 68,4 en la vela 9), la 12 cierra a 71,5 con la EMA en 71,114: NO cierra bajo ella (con la EMA iniciada en el primer
    cierre valdría 72,243 y sí). La primera vela por debajo es la 17 (75 < 75,118) → stop 74 desde la 18; la 18 abre a 75 y baja a
    71 → sale en la 18 a 74. Igual que lo esperado (sale en la 18 a 74); solo cambia que el stop pasa de 62 a 74 sin el paso por 70.
    Igual con «manda el más alto» y con «en su orden».
  - Extra: un cierre bajo la EMA con un mínimo más bajo que el stop vigente no lo baja (con la operación abierta solo puede pasar en la
    vela de la compra sin vigilar: stop 92, la vela de la compra baja a 90 y cierra bajo su EMA → sigue en 92 y sale después a 92).
    Y uno que sube: 100 → 100,5 → 100,6.
  - Sin mirar el futuro: señal, línea y orden en todos los cortes de E1–E4 (unir e invalidar) y en ~60 cortes de AAPL en diario y en
    semanal; en E1 el máximo de la 9 no forma línea en la 10 (sin confirmar) y, cortado en la 10, no hay ninguna línea.
  - La orden en la línea en E1: compra en la 16 a 68,33 (la línea; abre a 67). Tarjetas: «+» de la orden y del stop, leeOrden, aviso
    «casi nunca». Montaje SWC con estado (las tres pestañas, con la compra a la apertura y con la orden en la línea). Comprobaciones
    comunes.

**Parte B · el dibujo (V9.1077)**
- «Señales en el gráfico» (lib/builder/senales.js, lineasBajistasDe y calculaSenales; components/BuilderSenales.js):
  - Línea AMARILLA: la vigente en la última vela y cada una que se rompe, desde su ancla Q hasta la última vela o la de la rotura.
    GRISES y discontinuas: las que se rehacen con un máximo nuevo o se invalidan sin romperse, de Q a su última vela vigente. Cada
    línea es un tramo de dos puntos (una recta en la escala de las velas); solo lo que cae en el periodo.
  - Puntos ÁMBAR en los dos máximos de swing de cada línea (marcas.js: carril «lineaMax», justo encima del de los swings).
  - Recuadro ÁMBAR en cada vela de rotura (un SVG encima del gráfico, redibujado al mover el zoom como las etiquetas): la primera vela
    que cierra por encima o, con «Orden en la línea», la primera cuyo máximo la supera (lineaBajista da ahora también roturaOrden).
  - «Stop EMA (N)»: rojo punteado y en escalera, por operación, con la cuenta del motor (solo sube); el stop activo (el mayor, con
    «manda el más alto») sigue aparte, encima. La EMA del stop, como media.
  - Leyenda: casillas de «línea bajista vigente o rota», «líneas bajistas anteriores», «stop EMA», «máximos de la línea» y «vela de
    rotura», con un «?» que lo explica. Con la orden en la línea, franja «Supera la línea bajista».
- «Dibujo de la regla» (components/BuilderDibujo.js): la fila dice siempre qué pasa si el último máximo sube («se une con el anterior
  más alto» o «no hay línea»); con la orden en la línea, su rombo («¿Supera la línea de tendencia bajista…?») y «Compro en la línea de
  tendencia bajista». Los stops, con sus frases de las tarjetas.
- Ningún cálculo cambia: solo el dibujo (lineaBajista anota además roturaOrden).
- Comprobado: E2 a mano (3–8 gris de la 3 a la 15; 8–14 amarilla de la 8 a la 18, en 63,67; puntos en 3, 8 y 14; recuadro en la 18);
  E5 (stop EMA 74 en la 18; activo 62 de la 5 a la 17 y 74 en la 18); orden en la línea en E1 (franja y recuadro en la 16); AAPL
  2010–2015 en diario (60 compras, 69 amarillas, 51 grises, 68 roturas) y semanal (9 compras); montaje SWC con velas y con las casillas
  ocultas; las pruebas de la parte A siguen igual. Comprobaciones comunes.

**Parte C · la estrategia «Línea bajista + EMA10» (V9.1078)**
- Creada en la app (v50-strategy.vercel.app, V9.1077, con la sesión de Sergi) desde el Builder: «Empezar en blanco», nombre, «Rompe la
  línea de tendencia bajista» del catálogo en «Compro cuando…» (2/2, 120, unir con el anterior más alto), «Cómo compro» a la apertura de
  la vela siguiente, stops «Mínimo de la vela de la señal» y «En el mínimo de la vela que cierra bajo la EMA (solo sube)» (10), «Con
  varios stops: manda el más alto», y «Guardar y pasar al paso 2» (POST /api/strategies). Nada más escrito en Supabase (sin pruebas).
  id 3d3eb031-c3f0-40cf-8669-05feb89db500; params {"intervalo":"diario"}.
- Ida y vuelta: leída de Supabase (solo lectura), valida, abrirla (estadoDe) da la definición byte a byte y guardarla sin tocar no
  escribe nada (planGuardado → ninguno); sus params son los que pone el servidor (preparaGuardado).
- Cifras del ensayo 2010–2015, diario, sin comisión (cifrasRegla del paso 1; AAPL y NVDA de los precios guardados de las
  comprobaciones, GC=F de Yahoo), solo informativas:
  - AAPL: 60 operaciones · CAGR 7,21 % · Max Drawdown 19,11 % · Win Rate 31,67 % · Factor de beneficio 1,76 · Tiempo invertido
    28,72 % (comprar y mantener: CAGR 22,93 %, Max DD 43,03 %).
  - NVDA: 59 operaciones · CAGR −1,68 % · Max Drawdown 37,76 % · Win Rate 23,73 % · Factor 1,04 · Tiempo invertido 19,80 % (comprar y
    mantener: CAGR 10,14 %, Max DD 54,42 %).
  - GC=F: 65 operaciones · CAGR 3,56 % · Max Drawdown 10,80 % · Win Rate 35,38 % · Factor 1,56 · Tiempo invertido 29,86 % (comprar y
    mantener: CAGR −0,88 %, Max DD 43,40 %).
- Comprobaciones comunes.

## 41. El trailing con «manda el más alto» (V9.1079) y «Últimos N años» en el paso 1 (V9.1080)

**Parte A · el trailing con «manda el más alto» (V9.1079)**
- La causa (lib/editor/interprete.js): con «manda el más alto», cada vela solo subían los stops que tienen una serie que sube
  (subeStop: mínimo de N velas, swing, SuperTrend, EMA); el cálculo del trailing estaba solo en la rama de «en su orden». Así el trailing
  se quedaba vacío toda la operación y mandaban los demás stops (si no había otro, la operación no se cerraba nunca por stop).
- A quién afecta (Supabase, solo lectura, el 29/10/2026): a nadie. De 92 estrategias (84 activas), solo 2 usan «manda el más alto»
  («Línea bajista + EMA10» y «Tortugas 20/10») y ninguna tiene trailing; las de código no tienen esa opción. Ningún lote congelado
  (editor_lotes, 4), ninguna prueba del laboratorio (lab_pruebas, 59) ni backtest_results guarda «manda el más alto».
- El arreglo: el cálculo del trailing pasa a subeTrailing (el mismo código) y la rama de «manda el más alto» lo llama también, como a
  los demás stops que suben. Con «manda el más alto» el historial es el del stop activo (lo anota esa rama); con «en su orden», el
  trailing hace exactamente lo de antes.
- La prueba (scripts/comprobaciones/sinteticas.js, que corre comunes.sh): compra a 100; stop fijo del 8 % (92); trailing «cierre −
  1 × ATR (1)» mirado en cada vela, con candidatos 90,5, 94, 96, 95 y 98 → manda 92, 94, 96, 96 (el 95 no lo baja) y 98; la vela que
  baja a 97 vende a 98, y la que abre a 97,50, a 97,50. (Con el trailing de siempre, el del mínimo de la vela, un candidato más bajo
  que el stop vigente no puede darse sin que la vela toque el stop; por eso la prueba usa el de «cierre − k × ATR».) Antes del
  arreglo: ninguna venta (el stop se quedaba en 92). Después: todo como a mano.
- Comprobado: nada congelado cambia (batería, CARTERA, lotes y huellas iguales). Comprobaciones comunes.

**Parte B · «Últimos N años» en el paso 1 (V9.1080)**
- Auditoría: «Backtest de un valor» pide `years` al servidor (pages/api/datos.js → lib/backtestActivo.js), que lo traduce con
  normalizaPeriodo (lib/periodo.js): inicio = hoy − N años, fin = hoy; las velas, las del valor, recortadas a ese periodo con su
  calentamiento. El `modo` que devuelve solo sale en el registro. Se reutiliza tal cual, sin tocarla.
- «Señales en el gráfico» (components/BuilderSenales.js): entre «Ensayo · 2010–2015» y «Otras fechas», el botón «Últimos N años» con
  su casilla (5 por defecto, de 1 a 50), las fechas que salen («del 29/10/2021 al 29/10/2026») y su «?» con el ejemplo. Las fechas son
  normalizaPeriodo({ years: N }) y van al cálculo de siempre (calculaSenales y cifrasRegla), con las velas de /api/velas. Llega a hoy,
  así que sale el aviso «Faltan velas…» (lib/avisoFechaFinal.js, modo 'hoy') si la última vela es anterior a la última sesión. Por
  defecto sigue el ensayo; la elección vive solo en pantalla: no se guarda en la estrategia y «Volver a los guardados» no la toca.
- Comprobado: la prueba 2 de scripts/comprobaciones/sinteticas.js (velas inventadas de 2012 a ayer, «Línea bajista + EMA10»): las dos
  pantallas, del 29/10/2021 al 29/10/2026, primera vela 29/10/2021 y última 28/10/2026, 97 operaciones, el mismo CAGR, el mismo Max
  Drawdown y el mismo comprar y mantener. Montaje SWC con estado (por defecto el ensayo; con N = 5 en AAPL: del 29/10/2021, 45
  operaciones y «Faltan velas…», porque los precios guardados de las pruebas llegan al 07/10/2026; con N = 0, el aviso de la casilla y
  sin cálculo; «Otras fechas» igual que antes). Comprobaciones comunes.

## 42. Paso 2 · azar con stops: diagnóstico (parte 1, sin cambiar la app)

**Auditoría.** Ninguna de las copias al azar que hay hoy re-simula las reglas de salida: todas reutilizan las DURACIONES de las
operaciones reales.
- `lib/azar.js` (la de «Probarla contra el azar» de hoy, y `lib/azarCartera.js`): por activo, las mismas k operaciones con sus
  duraciones en velas, en orden barajado y en huecos al azar sin solaparse (`colocaAlAzar`, «barras y estrellas»); cada una compra a
  la apertura de su vela y vende a la apertura de la vela entrada + duración (`pctAlAzar`). Ejemplo: 1.260 velas y tres operaciones
  de 3, 40 y 12 velas → quedan 1.205 velas libres repartidas al azar en 4 huecos; una copia puede ser «compra en la vela 210, vende
  en la 250; compra en la 600, vende en la 612; compra en la 1.001, vende en la 1.004». CAGR simple de la suma y percentil del real.
- LOTE_2 (`lib/laboratorioSalidas.js`): el «re-simulado» (`sorteaSecuencial`) usa las mismas señales y una duración sacada de las
  reales en cada una que se abre; la permutación y el «hueco», también duraciones. LOTE_3 y el laboratorio del editor
  (`preparaAzarEstrategia`): mismas duraciones en fechas al azar, con la calibración en paseos aleatorios (criterio 8, ≤ 10 %).
- Los stops del motor de tarjetas (`lib/editor/interprete.js`) encajan con lo descrito: `atrCompra` (precio de compra − k × ATR de
  la vela anterior, fijo), `trailing` con `nivel.atr` (cierre − k × ATR de cada vela cerrada; empieza en la vela de entrada con la
  anterior), `minimoMovil` (mínimo de las n velas anteriores), `stopsModo: 'masAlto'` y `supertrend` (línea al cierre de la vela
  anterior). Ninguno baja nunca. Se vende dentro de la vela al nivel del stop, o a la apertura si abre por debajo.

**Experimento** (`scripts/comprobaciones/azar-stops.js`, no está en comunes.sh; unos 3 minutos). 200 mercados ficticios por manera
con los días de QQQ (2005–2026) barajados: (a) día a día, (b) por bloques de 20 días. Cada día se guarda como cocientes (salto de la
apertura sobre el cierre anterior, máximo, mínimo y cierre sobre la apertura) y se encadena desde 100: el OHLC es el de un día real,
coherente por construcción (0 incoherentes). 60 velas de calentamiento + 1.260 medidas. «Estrategia» sin ventaja: señal al azar
(1/20 por vela), compra a la apertura siguiente, una operación a la vez, con el INTÉRPRETE de la app tal cual (la señal entra como
«volumen alto» sobre un volumen inventado). Medida: CAGR compuesto, sin comisiones. 1.000 copias por mercado. Aprobado falso: gana
al ≥ 95 % de las copias. Copias:
- *resim*: entradas al azar (1/20) y la MISMA salida aplicada desde cada entrada. La salida desde cada vela de entrada posible sale
  del intérprete (varias pasadas) y se comprueba que rehace la estrategia exactamente (2.400 de 2.400 casos).
- *resimP*: igual, con la tasa de entradas medida en la estrategia: operaciones / velas sin posición.
- *durac*: `lib/azar.js` (`colocaAlAzar` + `pctAlAzar`), la de hoy.
- *lote2*: el re-simulado de LOTE_2 en velas (mismas señales, duraciones sacadas de las reales).

| Mercados | Salida | resim | resimP | durac (hoy) | lote2 |
|---|---|---|---|---|---|
| día a día | S1 stop fijo ATR(14)×2 | 4,0 % [2,0–7,7] | 3,0 % [1,4–6,4] | 1,0 % [0,3–3,6] | 7,0 % [4,2–11,4] |
| día a día | S2 trailing ATR(14)×3 | 2,5 % [1,1–5,7] | 3,0 % [1,4–6,4] | 1,5 % [0,5–4,3] | 5,5 % [3,1–9,6] |
| día a día | S3 mínimo de 10 velas | 4,0 % [2,0–7,7] | 4,5 % [2,4–8,3] | 3,0 % [1,4–6,4] | 4,5 % [2,4–8,3] |
| día a día | S4 manda el más alto S1/S3 | 4,0 % [2,0–7,7] | 3,5 % [1,7–7,0] | 2,5 % [1,1–5,7] | 4,5 % [2,4–8,3] |
| día a día | S5 SuperTrend 10/3 | 2,5 % [1,1–5,7] | 3,0 % [1,4–6,4] | 1,0 % [0,3–3,6] | 4,5 % [2,4–8,3] |
| día a día | S6 control: 20 velas | 6,0 % [3,5–10,2] | 7,0 % [4,2–11,4] | 6,5 % [3,8–10,8] | 0,0 % [0,0–1,9] |
| bloques 20 | S1 | 7,5 % [4,6–12,0] | 6,0 % [3,5–10,2] | 3,0 % [1,4–6,4] | **10,5 % [7,0–15,5]** |
| bloques 20 | S2 | 4,0 % [2,0–7,7] | 5,5 % [3,1–9,6] | 1,5 % [0,5–4,3] | 4,5 % [2,4–8,3] |
| bloques 20 | S3 | 6,5 % [3,8–10,8] | 6,0 % [3,5–10,2] | 0,5 % [0,1–2,8] | 1,0 % [0,3–3,6] |
| bloques 20 | S4 | 4,5 % [2,4–8,3] | 5,0 % [2,7–9,0] | 0,0 % [0,0–1,9] | 0,5 % [0,1–2,8] |
| bloques 20 | S5 | 3,0 % [1,4–6,4] | 3,0 % [1,4–6,4] | 1,0 % [0,3–3,6] | 3,5 % [1,7–7,0] |
| bloques 20 | S6 | 4,0 % [2,0–7,7] | 3,0 % [1,4–6,4] | 3,0 % [1,4–6,4] | 0,0 % [0,0–1,9] |

Percentil medio (lo neutral es 50): resim y resimP 46–53 en todo; durac 40–48 con stops (39–40 en S3/S4 por bloques) y 49–50 en S6.

**Causa.** Una duración con stop no es neutral: la decide el camino del precio (corta = cayó hasta el stop; larga = subió y el stop
lo fue siguiendo). Copiar las duraciones a fechas al azar las separa del camino que las produjo, y además cambia el precio de salida
(el stop vende dentro de la vela a su nivel o en un hueco a la baja; la copia, a una apertura) y dónde se está fuera (con rachas de
volatilidad, los stops salen en los tramos agitados; las copias, en cualquier sitio). El sesgo que queda depende del mercado y de la
medida: en LOTE_2 (media por operación, paseos aleatorios) daba aprobados falsos (stops 12–26 %); aquí (CAGR, QQQ barajado) hace la
prueba demasiado DURA con stops y deja pasar de más con la de LOTE_2 (S1 por bloques, 10,5 %). Ejemplo: S3 por bloques, CAGR medio de
la estrategia 3,9 %; las copias re-simuladas, mediana 3,5 %; las de duraciones, 5,4 %, con los mismos días invertidos: el listón
está 1,5 puntos al año más alto de lo que corresponde a una estrategia sin ventaja, y casi nunca se aprueba (0,5 %), aunque la
estrategia tuviera algo. Re-simular la regla de salida desde entradas al azar no tiene ese problema: si la estrategia no tiene
ventaja, ella misma es una copia más, y sale en el 5 % con cualquier salida y cualquier manera de crear los mercados.

**Para la parte 2** (sin implementar): copia re-simulada con la tasa de entradas de la estrategia (resimP). Una función en lib que dé
la operación que abre cada vela de entrada con el propio intérprete (mejor con una opción de `interpreta` para forzar las señales
que con el volumen inventado del script) y otra que haga las copias (entradas al azar con la tasa operaciones / velas sin posición,
salida de la tabla, CAGR); la comprobación en mercados ficticios se mantiene antes de dar el veredicto.

## 43. Paso 2 · azar re-simulado en lib

La parte 2 de §42, en `lib/azarReglas.js`, **sin pantalla todavía**. `lib/azar.js` y todas las pantallas siguen igual.

**Intérprete.** `interpreta(def, velas, params, ctx)` admite `ctx.entradasForzadas` (algo con `.has(i)`, p. ej. un `Set` de índices de
vela): sin posición, compra a la apertura de cada vela del conjunto sin mirar la señal, la orden, la cancelación ni el filtro de
mercado; los stops y las salidas son los de la definición (los que se fijan con la vela de señal, como el mínimo de la vela de señal,
con la vela anterior a la compra). Sustituye al volumen inventado de `azar-stops.js`. Sin la opción, el resultado es el de siempre
(batería, lotes, huellas y sintéticas iguales).

**`lib/azarReglas.js`**
- `tablaSalidas(velas, estrategia, { desde, hasta })`: para cada vela de entrada posible del periodo, la operación que abriría
  comprando a su apertura (vela de salida, precio de venta, motivo; `velasDe(e)`), con el intérprete y entradas forzadas, por
  pasadas (en cada una se fuerzan todas las velas que faltan). Una operación que sigue abierta al final se valora al cierre de la
  última vela del periodo. No mira velas más allá de `hasta`.
- `tasaDeEntradas(velas, operaciones, { desde, hasta })`: operaciones que entran en el periodo ÷ velas sin posición (la vela de una
  entrada cuenta como libre; las velas siguientes hasta la de la venta, no).
- `copiasReSimuladas(velas, estrategia, operacionesReales, { n: 1000, semilla })`: cada copia entra al azar con esa tasa en las velas
  sin posición (saltos geométricos, lo mismo que sortear vela a vela), una operación a la vez, compra SIEMPRE a la apertura de la vela
  (decisión 1), sin el filtro de mercado (decisión 2) y sale como dice la tabla. Por copia: CAGR compuesto (años de las fechas: vale
  igual con velas semanales), caída máxima vela a vela (la abierta marcada al cierre de cada vela, la venta a su precio; todo el
  capital, sin comisiones) y operaciones. Resumen: percentil de la estrategia (`percentilDe`: copias con CAGR menor, empates la
  mitad) y mediana de las copias. La estrategia se mide igual, con sus operaciones reales (su precio de compra, sea cual sea la orden).
- `fiabilidad(velas, estrategia, { mercados: 200, bloque: 20, semilla })`: 200 mercados ficticios con los días del propio activo
  (cocientes, como en §42) barajados por bloques de 20 y encadenados desde la primera vela real, con las mismas fechas. En cada uno,
  una «estrategia» sin ventaja (entradas al azar a la tasa de la real) contra 1.000 copias re-simuladas con la tasa medida en ella. %
  de aprobados falsos (gana al ≥ 95 %) e intervalo de Wilson del 95 %.
- `REGLA_AZAR_REGLAS` (la regla, una sola vez) y `veredicto({ aprobadosFalsos, periodos })`: «Sin veredicto» si los aprobados falsos
  son ≥ 9 %; si no, «Pasa» si gana al ≥ 95 % de las copias en 2016–2020 y en 2021–2025, y si no «No pasa». Aviso «pocas operaciones»
  si un periodo tiene < 30. Con varias fiabilidades (una por periodo), manda la peor. Nota: con 200 mercados, el intervalo de Wilson
  queda entero por encima del 5 % ya con 17 (8,5 %: 5,4–13,2); con 16 (8 %) toca el 5 % (5,0–12,6). El umbral es el 9 % decidido.
- Semilla fija (texto o número): el mismo resultado cada vez con los mismos datos.

**Pruebas** (solo velas inventadas o mercados ficticios).
- `sinteticas.js` §3, a mano con 15 velas y entradas en las velas 2 y 9 (ATR de 1 vela, mínimo de 3 velas): S1 stop fijo ATR × 2 →
  vela 14 a 94 (abre por debajo del 95) y vela 11 a 98; S3 → vela 6 a 101 y vela 12 a 97,8; S4 manda el más alto → vela 6 a 101 (manda
  S3) y vela 11 a 98 (manda S1). La tabla y `interpreta` con las entradas forzadas dan esas cifras exactas; con fechas semanales, la
  misma tabla. Tasa: 4 operaciones con 80 velas sin posición → 0,05.
- El experimento de §42 con una columna más, *lib* (`azar-stops.js`): la tabla de `tablaSalidas` es la del volumen inventado, la tasa
  es la misma y el percentil de `copiasReSimuladas` (con la semilla de resimP) es idéntico en **2.400 de 2.400** casos, así que los
  aprobados falsos son exactamente los de la columna resimP de §42 (de 3,0 a 7,0 % día a día y de 3,0 a 6,0 % por bloques). Solo
  cambia la mediana de las copias, unas décimas más alta: el script cuenta 5 años fijos y la librería los años de las fechas (los 1.260
  días laborables inventados son 4,8 años); el orden, y por tanto el percentil, no cambia.
- Tiempo de `fiabilidad()` con 200 mercados × 1.000 copias en 1.260 velas diarias inventadas: 2–3 s con S4, 9–10 s con SuperTrend, 11–13 s
  con S1 (operaciones largas: más pasadas para la tabla). Por debajo de los 20 s; no hace falta recortar.
- `azar-reglas.js` (en comunes.sh): la versión corta (8 mercados, 200 copias, semilla fija) de S1, S4, S5 y S4 semanal sobre un paseo
  aleatorio inventado, con la huella de todo el resultado (`3ee29dbc`). Con `--mercados 200 --copias 1000`, la de verdad y sus tiempos.

**Pendiente** (partes siguientes): la pantalla del paso 2 y de dónde salen las velas, las operaciones reales y los periodos.

## 44. Paso 2 · registro congelado y la función que ejecuta la prueba (sin pantalla)

**Tablas** (`sql/pruebas_azar.sql`, creadas el 30/10/2026 con la Management API en una transacción). Las dos, como `editor_lotes`:
`user_id = auth.uid()`, RLS «dueño», **solo SELECT e INSERT** (sin políticas ni permisos de UPDATE ni DELETE: una prueba no se cambia ni
se borra; `anon`, nada).
- `pruebas_azar`: id, user_id, creada_en, estrategia_id (uuid, sin clave ajena: borrar una estrategia no toca sus pruebas),
  estrategia_nombre, estrategia_foto (el JSON exacto al confirmar: `{ id, name, definition, params }`, params como objeto),
  estrategia_huella (sha256 del JSON canónico de la foto, `lib/lotesLab.js huella`), valor, velas (`'diarias' | 'semanales'`),
  periodos (`[[desde, hasta], …]`), regla (copia de `REGLA_AZAR_REGLAS`), semilla (entero de 0 a 2³² − 1, nuevo al confirmar),
  version_app.
- `pruebas_azar_resultados`: id, prueba_id (clave ajena, **única**: como mucho un resultado por prueba), user_id, creado_en, resultado,
  version_app. Solo se puede insertar en una prueba propia (la política de INSERT lo comprueba).

**`lib/pruebaAzar.js`**
- `ejecutarPrueba(prueba, precios, alProgresar)`: usa solo lo guardado (la foto, la semilla, el valor, las velas, los periodos y la
  regla), nunca la estrategia de ahora; si la regla guardada no es la de esta versión, no calcula. `precios`: `{ símbolo: diarias }`
  (el valor y los índices del filtro de mercado, `tickersDe`). Cada periodo, como el paso 1 con «Otras fechas»: las semanales se hacen
  con las diarias cerradas; el calentamiento que pide la regla antes de la primera vela y nada después de la última
  (`preparaPeriodo`). Etapas: `'fiabilidad'` (200 mercados por periodo, de uno en uno con `fiabilidad(…, { mercados: 1, primero: m })`
  y cediendo el control entre ellos), `'comparar'` (`copiasReSimuladas`, 1.000 copias) y `'veredicto'` (`veredicto` con la fiabilidad
  de cada periodo: manda la peor). Semillas: `pruebaAzar|<semilla>|<desde>|fiabilidad` y `…|copias`.
- **resultado** (formato 1): por periodo, fechas y velas, calentamiento, CAGR y caída máxima de la estrategia (todo el capital, sin
  comisiones, como sus copias), operaciones, tasa de entradas, percentil y si gana, mediana de las copias, la «copia típica» (la del
  medio por CAGR: su CAGR, caída y operaciones), aviso de pocas operaciones, aprobados falsos y su fiabilidad (aprobados, sin
  operaciones, intervalo de Wilson) y los 1.000 CAGR de las copias (para el histograma); además el veredicto, su texto, el aviso, la
  huella de la estrategia, la semilla y la de los precios usados (las velas OHLC de la primera de calentamiento a la última del
  segundo periodo). Unos 39 KB.
- `comprobarPrecios(foto, precios, valor, velas)`: si los precios del valor (y de los índices del filtro) cubren los dos periodos con
  su calentamiento (y si no, qué tramo falta) y cuántas operaciones haría en cada periodo con el motor del paso 1, sin azar.
- `nuevaPrueba`, `confirmarPrueba` (inserta en `pruebas_azar` y devuelve la fila), `guardarResultado` (inserta con `on_conflict=prueba_id`
  y «ignore-duplicates»: si ya había uno, no hace nada y devuelve el que había), `listarPruebas(estrategia_id)` (con el veredicto de
  cada una o `resultado: null` si está sin terminar), `leerResultado`, `fotoDe`, `huellaEstrategia` y `textoParaClaude`.
- `lib/azarReglas.js`: solo una opción nueva en `fiabilidad`, `primero` (el índice del primer mercado; por defecto 0, así que todo lo de
  antes da lo mismo: la huella `3ee29dbc` de `azar-reglas.js` no cambia). La lógica no cambia.

**Tiempo.** Con «Prueba editor EMA20» en AAPL, velas diarias (foto de precios de las comprobaciones), una prueba entera tarda **unos
7 s** en Node (5,8 s con semanales): casi todo es la fiabilidad (los 400 mercados); las 2 × 1.000 copias, décimas. Resultado de
ejemplo (semilla 12345): 2016–2020, 57 operaciones, CAGR 32,9 % contra una mediana de 17,8 %, gana al 98,7 %, aprobados falsos 5,5 %;
2021–2025, 66 operaciones, CAGR 6,9 % contra 13,8 %, gana al 10,7 %, 7,5 % → «No pasa». Las operaciones de `comprobarPrecios` (57 y 66;
semanales 12 y 18) son las de `calculaSenales` del paso 1.

**Pruebas** (`scripts/comprobaciones/prueba-azar.js`, en comunes.sh; unos 40 s; no escribe en la base).
- A mano: 300 velas planas y dos tramos iguales de 9 velas (una cada 30 días), «cierre por encima del máximo de las 2 anteriores» con
  stop fijo del 8 %: 2 operaciones, tasa 2/7, CAGR (0,92 × 96,5 / 94)^(365,25/240) − 1 = −8,33 % y caída 1 − 0,92 / (103/102) = 8,89 %
  en los dos tramos, con 250 velas de calentamiento y el aviso de pocas operaciones.
- `fiabilidad` mercado a mercado suma lo mismo que de una vez. «Sin veredicto» con aprobados falsos ≥ 9 % en un periodo aunque el
  percentil sea 99 (y «Pasa» con 8,5 %).
- Determinismo: la misma foto y la misma semilla, dos veces, dan un resultado idéntico byte a byte (diarias y semanales, en un paseo
  aleatorio inventado de 2014 a 2026); con otra semilla, otro. Huella de los resultados: `03313d2c`.
- Acceso con un fetch simulado (lo que se inserta; «si ya existe, no hace nada»; solo GET y POST). Las políticas, leídas de la base en
  solo lectura: RLS activa, solo SELECT e INSERT del dueño, permisos de `authenticated` solo INSERT y SELECT, `anon` nada.

## 45. Paso 2 · pantalla «Probarla contra el azar» (opción A del boceto)

`components/BuilderAzar.js`, con el estilo del paso 1 (`lib/builder/estilo.js`). **Se entra desde la barra de pasos**: `BarraPasos`
admite `onPaso(n)` y `desactivados`; los pasos 1 y 2 que no son el actual son botones (el 3, todavía no). En «Mi trabajo», el paso 2
abre la pantalla con la primera estrategia de tarjetas; en el editor por tarjetas (paso 1, la barra va ahora encima del título), con
la estrategia abierta **tal como está guardada** (una nueva, sin guardar: el paso 2 no se pulsa, «Guárdala primero»). «Guardar y
pasar al paso 2» y `components/BuilderPrueba.js` (el paso 2 de los lotes) no cambian.

- **Cabecera**: «¿Gana «[nombre]» por algo más que suerte?» y «Tú eliges dónde probarla y confirmas. Lo demás lo hace la app sola, en orden.»
- **Tarjeta A «Elige qué vas a probar»**: estrategia (solo las de tarjetas, por nombre) con «Se prueba tal como está guardada…»; ¿Dónde?:
  «Un valor» (activo) y «Una lista de valores» (desactivado, «Llegará más adelante»), el buscador de valor del paso 1 (`BuscadorValor`,
  la misma lista: caché de precios, lista de seguimiento y universo; §37) y su «?»; velas Diarias / Semanales (por defecto, las de la
  estrategia); periodos fijos 2016–2020 y 2021–2025 con su «?»; «Para pasar», fijo.
- **Tarjeta B «Antes de empezar, la app comprueba»** (`comprobarPrecios`, se recalcula al cambiar el valor o las velas; las velas, por
  `/api/velas` como el paso 1): precios en verde con sus fechas, o en rojo cada tramo que falta (el calentamiento antes del 01/01/2016
  o el final hasta el 31/12/2025, también de los índices del filtro); operaciones por periodo con el motor del paso 1; amarillo si
  alguna es < 30; rojo si alguna es 0. Con rojo, «Confirmar y probar» desactivado. El aviso de que la prueba se congela; «Volver al
  paso 1» abre la estrategia en el editor.
- **Columna derecha**: «¿Qué se prueba?» con el ejemplo; «La app lo hace sola», las 4 etapas que se iluminan (hecha ✓, la de ahora
  resaltada, con «N de 400 mercados») y la barra de progreso (congelar 1 %, fiabilidad hasta el 95 %, comparar hasta el 99 %, veredicto
  100 %); «Pruebas anteriores de esta estrategia» (`listarPruebas`): fecha y hora, valor, velas y veredicto con «Ver», o «Sin terminar»
  con «Terminar el cálculo» (`ejecutarPrueba` con lo guardado: el mismo resultado) y «La estrategia ha cambiado desde esta prueba.» si
  la huella de la estrategia de ahora no es la de la prueba.
- **Al confirmar**: `confirmarPrueba` → `ejecutarPrueba` (cediendo el control entre mercados) → `guardarResultado` → el bloque
  **provisional** del resultado (la pantalla completa es la tanda 3b): veredicto en grande; por periodo «Gana al P % de las copias»,
  CAGR de la estrategia / mediana de las copias, operaciones y el aviso si < 30, y «¿La prueba era fiable? En 200 mercados ficticios
  aprobó por error X veces (X/2 %).»; «Copiar para Claude» (`textoParaClaude`: configuración, foto, huellas, semilla y cifras). Si
  algo falla a medias, la prueba ya está congelada: se termina desde la lista. Mientras corre, no se puede cambiar nada.
- Comprobado: montaje SWC (renderToString con estado, con «Prueba editor EMA20» y los precios de AAPL de la foto) vacía, con pruebas
  (una sin terminar y una con otra huella), sin precios, pocas operaciones (semanales: 12 y 18), ninguna operación (un valor plano), en
  curso (fiabilidad, 120 de 400 → 30 %), terminada (No pasa: 98,7 % y 10,7 %; 11 y 15 aprobados falsos), error a medias; la barra
  de pasos en «Mi trabajo», en el editor (guardada y nueva) y `vistaInicial: { azar }`. Comprobaciones comunes.


## 46. Paso 2 · pantalla «Resultado de la prueba» (V9.1085, opción A del boceto)

`components/BuilderAzarResultado.js` (la pantalla) y `lib/resultadoAzar.js` (las cifras y los textos). **Se dibuja solo con lo
guardado** (la fila de `pruebas_azar` y su resultado de `pruebas_azar_resultados`, formato 1, §44): nunca recalcula. Auditoría previa:
el resultado guardado ya trae, por periodo, los 1.000 CAGR de las copias (`cagrCopias`) y la copia típica (CAGR, caída y operaciones).
- **Se abre** al terminar una prueba (sustituye al bloque provisional de §45, que se quita) y con «Ver» en «Pruebas anteriores»;
  `BuilderAzar` guarda `viendo = { fila, resultado }` y, mientras está, pinta esta pantalla en lugar de la de confirmación. «← Volver»
  vuelve a la de confirmación. «Volver al paso 1» abre en el editor la estrategia de la prueba (por su id; si ya no está, la elegida).
- **«Guardar y pasar al paso 2»** (`BuilderPanel` `alGuardar`) lleva ahora a la pantalla nueva del paso 2 (`BuilderAzar`) con esa
  estrategia. La pantalla vieja de los lotes (`components/BuilderPrueba.js`) no se borra: se sigue abriendo desde «Mi trabajo» (los
  nombres de las pruebas en «Mis pruebas», «Última prueba» en «Mis estrategias» y la acción «prueba» de las filas). Con una estrategia
  semanal ese botón sigue desactivado como antes (`AVISO_SEMANAL_PASO2`), aunque la barra de pasos sí lleva al paso 2.
- **Contenido**: línea superior «[nombre] · Prueba confirmada el [fecha] · [valor] · velas [..] · congelada», título y subtítulo; la caja
  del veredicto (verde / roja / gris) con el texto automático de `textosResultado` (casos `pasa`, `unoPasa`, `ningunoPasa`,
  `sinVeredicto`: en este, el periodo con más aprobados falsos de los que llegan al límite) y un aviso por periodo con < 30
  operaciones; una tarjeta por periodo (dos columnas, una en móvil) con «Pasa / No pasa este periodo», «Gana a [P] % de las copias», el
  histograma y la tabla «Tu estrategia / Copia típica» (CAGR, caída máxima, operaciones); con «Sin veredicto», «Solo informativo: la
  prueba no es fiable» en cada tarjeta; «¿La prueba era fiable?» (Sí si todos los periodos quedan por debajo de 9 %) con una línea por
  periodo; «¿Y ahora?» con «Volver al paso 1», «Copiar para Claude» (`textoParaClaude`, como en §45) y «Paso 3 · Convertirla en plan»
  siempre desactivado.
- **Histograma** (`histogramaCopias`, SVG con `role="img"` y un `aria-label` que lo resume): 30 barras iguales de anchas de la mínima a
  la máxima (la última incluye la máxima), marcas en mínimo, mediana y máximo, «% al año». **Listón del 95 %** = la copia número
  ⌈0,95 · n⌉ de menor a mayor (con 1.000, la 950.ª): con `percentilDe` (empates, la mitad), una estrategia por encima de esa cifra gana a
  ≥ 95 % y una por debajo, no, así que «a la derecha del listón» es pasar. La línea de la estrategia, verde si P ≥ 95 y naranja si no;
  fuera del rango, pegada al borde con una flecha.
- Comprobado (montaje SWC con renderToString): pasa; no pasa con un periodo bueno; con ninguno; sin veredicto; pocas operaciones (12 y
  29); la prueba real «Prueba editor EMA20 · AAPL · diarias · semilla 867154936» leída de la base en solo lectura (99,2 % y 11,3 %;
  CAGR 32,89 % / 18,02 % y 6,87 % / 13,92 %; operaciones 57 / 47 y 66 / 54; 9 y 14 de 200; fiable Sí; caso `unoPasa`; las barras suman
  1.000); `BuilderAzar` con `inicial.viendo` (la pantalla con «← Volver») y sin él (la de confirmación, ya sin bloque provisional).
  Histograma a mano con 10 copias (1 … 10): con 3 barras, 3 / 3 / 4; con 30, suman 10; mediana 5,5; listón = 10 (la 10.ª, borde
  derecho); estrategia 12 → pegada a la derecha; 5,5 → en medio; con 20 copias, listón 19 en 18/19 y estrategia 0 → a la izquierda; con
  1.000, justo por encima del listón gana al ≥ 95 % y justo por debajo no. Los 4 textos del veredicto, exactos. Comprobaciones comunes.


## 47. Paso 3 · parte 3a: la estrategia de tarjetas como pieza de un plan (sin pantalla) y los histogramas del paso 2

**Parte 1 · GLD en la caché y los histogramas de «Resultado de la prueba».**
- **GLD** en la caché de precios con el mecanismo de siempre (`node scripts/llenaCachePrecios.js --simbolo GLD --anios 25`: velas
  diarias de Yahoo, `guardar_velas`, sin SQL nuevo): 5.521 velas del 18/11/2004 al 29/10/2026. Sirve de dinero ocioso de un plan.
- **Histogramas** (`Histograma` de `components/BuilderAzarResultado.js`): antes el SVG tenía `viewBox` y `width: 100%`, así que los
  textos escalaban con el ancho y salían enormes. Ahora va SIN `viewBox`, con alto fijo (`ALTO_HISTOGRAMA` = 172 px): las x en % del
  ancho (barras, líneas y textos; la flecha de «fuera del rango», en un `<svg>` anidado en la x de la línea) y las y en píxeles. Textos
  de tamaño fijo: 12 px (eje, «% al año», «Listón del 95 %») y 13 px («Tu estrategia …»). **«Listón del 95 %» va al LADO de su línea**
  (`ladoListon`: en el lado contrario a la línea de tu estrategia si hay sitio, ≥ 32 % del ancho; si no, en el otro), una fila por
  debajo de «Tu estrategia», así que no se pisan. Ningún cálculo cambia (`lib/resultadoAzar.js` no se toca).
- Comprobado: montaje SWC (renderToString) con casos «pasa» y «no pasa» (sin `viewBox`, `font-size` 12 y 13, alto 172) y en el
  navegador a 508, 386 y 306 px de ancho: textos de 12 px, la etiqueta del listón nunca encima de su línea, nunca encima de «Tu
  estrategia» ni cruzando su línea, y nada fuera del SVG. Comprobaciones comunes.

**Parte 2 · la pieza «estrategia» en `lib/planes` (V9.1087; docs/planes-inversion.md §10).** Una estrategia de tarjetas sobre una
acción como pieza de un plan, sin pantalla. Archivos: `lib/planes/estrategia.js` (las operaciones, que son las del paso 1 y el
paso 2, los precios y el sintético ×2 / ×3), `lib/planes/descorrelacion.js` (las 5 peores caídas de la estrategia sola frente al
ocioso), `lib/planes/plan.js` (el motor: un tipo de pieza más y los símbolos nuevos al final de la lista de la persona, de modo que
un plan sin la pieza suma en el mismo orden que antes), `lib/planes/evalua.js` (dos referencias más y la descorrelación) y
`lib/planes/datosServidor.js` (carga las velas que hagan falta). Prueba nueva en las comprobaciones comunes:
`scripts/comprobaciones/planes-estrategia.js` (a mano, planes de siempre idénticos a la versión anterior y coherencia con el paso 1).
- Ejecución real de ejemplo (precios de la caché): EMA20 en AAPL, 2016–2025, 10.000 € + 300 €/mes, ocioso GLD, sin apalancar,
  España (base del ahorro), 0,1 % de comisión: aportado 45.700 €, final neto 114.340,91 €, TWR 15,84 % (neto 15,74 %), TIR
  14,50 %, peor caída −34,02 %, impuestos 17.128,13 €, comisiones 28.990,63 € (623 órdenes: cada entrada y salida mueve todo el
  dinero de la pieza dos veces). Con el ocioso en liquidez: 91.548,97 €, TWR 13,04 %; comprar y mantener AAPL: 201.921,87 €,
  TWR 26,63 %.


## 48. Paso 3 · parte 3b: la pantalla «Convertirla en plan» (opción A del boceto, versión 2) y guardar planes

**Parte 1 · la pantalla (sin guardar todavía).** `components/BuilderPlan.js` (la pantalla) y `lib/builder/planPantalla.js` (los
ajustes, el plan que sale de ellos, las cifras leídas de la respuesta, los tramos, los textos de los «?», «Copiar para Claude» y el
temporizador). El motor (`lib/planes/`) no cambia: todas las cifras son las suyas.
- **Se entra** desde el paso 3 de la barra de pasos (`BarraPasos`: ahora se pulsa cualquier paso que no sea el actual) en «Mi
  trabajo», en el editor (guardada y de velas diarias; nueva: «Guárdala primero») y en las dos pantallas del paso 2; y desde «Paso 3 ·
  Convertirla en plan» del resultado del paso 2, **siempre activo** (verde si pasa, gris si no; el texto de «¿Y ahora?» ya no dice que
  el paso 3 solo se abre con una prueba que pase). `BuilderPanel`: `vistaInicial: { plan: { estrategiaId } }`.
- **Norma de esta pantalla**: las explicaciones no ocupan sitio fijo. Cada término lleva su «?» (`BuilderAyuda`, 26 en la pantalla
  con resultado) con un ejemplo con números (`AYUDA_PLAN`); a la vista, títulos, cifras y avisos de una línea.
- **Avisos**: rojo si la estrategia no tiene una prueba del paso 2 que pase **con su huella de ahora** («…NO ha superado al azar…» si
  las hay y no pasan, «…no tiene prueba contra el azar…» si no hay ninguna con esa huella; una que pasa con otra huella no cuenta);
  su «?», con las cifras de la prueba (`leerResultado`: gana al X % en 2016–2020 y al Y % en 2021–2025). Con una que pasa, una línea
  verde. Amarillo siempre: «Acción elegida a mano, sabiendo cómo le fue».
- **Izquierda · Bloques**: un bloque con Estrategia (las de tarjetas; las semanales, desactivadas en la lista), «Dónde se aplica»
  (Una acción + el buscador de valor; Una lista, desactivada), «Parte de tu dinero» 100 % fija y «Modo de asignación» desactivado;
  «+ Añadir bloque» desactivado. **Tu dinero**: periodo (2016–2025, solo 2016–2020, solo 2021–2025, otras fechas), dinero inicial
  10.000 €, aportación mensual 300 € fija o «Sube cada año» (3 % al elegirla), dinero ocioso (liquidez, QQQ, GLD u otro símbolo de la
  caché: el buscador solo enseña los de la caché, porque `/api/plan` solo lee la caché), aportación con la operación abierta
  (`espera` por defecto / `compra`), apalancamiento (no, ×2, ×3), impuestos (España · base del ahorro / sin impuestos) y comisión por
  operación (0,1 %, sin mínimo ni horquilla).
- **El plan** (`planDe`): una pieza `estrategia` con la foto de la estrategia (`fotoDe`), peso 1, aportaciones mensuales
  (`crecimientoAnual` 0 si son fijas), reparto con los pesos y sin rebalanceo. Se valida con `validaPlan` antes de pedirlo (los
  errores, en rojo). **Recalcula solo** (`creaCalculador`): 600 ms después del último cambio; si hay un cálculo en marcha, manda el
  último (la respuesta de uno anterior se descarta); mientras, «Calculando…» sin borrar el resultado anterior.
- **`/api/plan` con `curvas: true`** (solo añade, no cambia nada de lo que ya devolvía): con una pieza estrategia, el patrimonio y el
  VL diarios de las referencias `OCIOSO_LIQUIDEZ` y `ACTIVO` (las medidas de `evaluaPlan` no traen las series), ejecutadas con el
  mismo motor y los mismos datos. Sin `curvas`, la respuesta es la de antes (comprobado byte a byte).
- **Derecha · resultado**: 6 cifras (Has aportado · Tienes al final con la ganancia neta · Peor caída en % sobre el VL y en € sobre el
  patrimonio, con la fecha del valle · «CAGR de la estrategia» = TWR · «Rentabilidad de tu dinero (TIR)» · impuestos y comisiones);
  «Cómo crece tu dinero» (escala logarítmica; tu plan continua, con el ocioso en liquidez a puntos, comprar y mantener la acción a
  rayas, lo aportado escalonado a raya y punto; debajo, la franja dentro de la acción / en el ocioso, de `estrategias.e.dentro`);
  «Tu plan frente a las alternativas» (tu plan, ocioso en liquidez, la acción, QQQ, SPY y liquidez: final, CAGR de la estrategia, TIR,
  peor caída, impuestos y comisiones); «¿Es estable? Por tramos» (`cagrTramo`: el TWR del VL del mismo cálculo en 2016–2020 —desde el
  VL 1 de la primera apertura— y en 2021–2025 —desde el último cierre de 2020—; «—» si el periodo no cubre el tramo; «el ocioso
  añadió» = el del plan − el del plan con el ocioso en liquidez, en puntos); «Cuando tu estrategia cae, ¿qué hace el ocioso?» (las 5
  peores caídas de `descorrelacion` y «En N de las 5 peores caídas, el ocioso subió»); «Copiar para Claude» (ajustes, prueba, huella,
  las cifras, las tablas y el plan en JSON) y «Volver al paso 2».
- Comprobado (montaje SWC con renderToString y la ruta de verdad, sin el JWT, con los precios de la caché leídos en solo lectura): sin
  datos; con un resultado (ajustes por defecto y ocioso GLD: aportado 45.700,00 €, final 114.340,91 €, ganancia neta 68.640,91 €,
  peor caída −34,02 %, CAGR de la estrategia 15,84 %, TIR 14,50 %, impuestos 17.128,13 € y comisiones 28.990,63 €, las de la ejecución
  de ejemplo de §47; ocioso en liquidez 91.549 €, AAPL 201.922 €; tramos 27,05 % / 5,63 % con −0,08 y +5,10 puntos del ocioso, y los
  dos tramos juntos dan el VL final; 4 de las 5 peores caídas con el oro subiendo); con un error (con y sin resultado anterior); los
  avisos sin prueba, no pasa (99,2 % y 11,3 % en su «?») y pasa; una prueba que pasa con otra huella no cuenta; la semanal desactivada;
  el temporizador (tres cambios en 400 ms → un solo cálculo, con el último, a los 600 ms del último; con uno en marcha, manda el
  último); la barra de pasos y el botón del resultado que no pasa, activo. Comprobaciones comunes.

**Parte 2 · guardar planes.** Tabla nueva `planes_inversion` (`sql/planes_inversion.sql`, creada el 30/10/2026 con la Management API
en una transacción) y `lib/builder/planesGuardados.js` (leer, crear, cambiar y borrar por PostgREST, y la comparación de la
estrategia).
- **Tabla**: id, user_id (`auth.uid()`), nombre (1–200), plan (jsonb, el formato 1 con la foto de la estrategia en su pieza; `tipo`
  = 'plan', ≤ 200 KB), huella (`huellaPlan`: sin contar el nombre), created_at, updated_at (lo pone un disparador al cambiar). RLS
  «dueño» con las cuatro políticas: cada usuario lee, crea, cambia y borra SOLO lo suyo. Los planes **no se congelan**. Permisos por
  columnas: al crear y al cambiar, solo nombre, plan y huella (ni el dueño ni las fechas); `anon`, nada.
- **Pestañas arriba**: una por plan guardado (por orden de creación) y los nuevos sin guardar («Plan nuevo · sin guardar»); «+ Añadir
  plan» copia los ajustes de ahora en uno nuevo sin guardar (con la estrategia de ahora); «Comparar planes», visible y desactivado con
  su «?» (parte 3c). Al cambiar de pestaña, lo que se estaba tocando se queda en esa pestaña; un plan ya calculado se enseña sin
  repetir el cálculo.
- **Guardar**: «Guardar este plan» pide el nombre la primera vez (campo en la misma línea, Intro para guardar, Escape para cancelar);
  uno guardado tiene «Guardar cambios» (solo con cambios: el plan sin el nombre, en JSON canónico, distinto del guardado),
  «Guardar como plan nuevo» (pide el nombre, «… (copia)» de partida) y «Borrar» con confirmación («¿Borrar «…»? No se puede
  deshacer.»).
- **La estrategia ha cambiado**: si la huella de la foto guardada no es la de la estrategia de ahora (`comparaEstrategia`), una línea
  amarilla «La estrategia ha cambiado desde que guardaste este plan» con su «?» y «Usar la versión guardada» (por defecto: el plan se
  calcula con la foto) / «Usar la versión actual» (con la de ahora; al guardar los cambios, la foto se actualiza). Si la estrategia ya
  no está, se usa la guardada y lo dice.
- Comprobado: **RLS** con dos usuarios de prueba creados en `auth.users` dentro de UNA transacción de la Management API que se deshace
  entera al final (la excepción final da el resultado): A crea, ve, cambia y borra lo suyo y no puede cambiar el dueño ni created_at;
  B no ve, no cambia y no borra el plan de A, ni crea uno a nombre de A, y solo ve el suyo; los CHECK rechazan un plan que no es de
  tipo plan; `anon` no puede leer; después, 0 usuarios de prueba y 0 planes. `planesGuardados` con un fetch falso (nombre limpio, huella
  sin el nombre, sin user_id, PATCH y DELETE de esa fila, error si no existe; la comparación: igual, con otra EMA y sin la estrategia).
  `ajustesDe(planDe(x)) = x`. Montaje SWC (renderToString): sin guardados, pidiendo el nombre, dos guardados con sus ajustes, sin
  cambios, confirmación de borrar, estrategia cambiada (con la guardada elegida) y borrada, sin conexión. Las pruebas de la parte 1
  siguen igual. Comprobaciones comunes.


## 49. Paso 3 · arreglos de la pantalla del plan

`components/BuilderPlan.js`, `lib/builder/planPantalla.js`, `lib/builder/planesGuardados.js` (una lectura más) y, en «Mi trabajo»,
`lib/builder/misListas.js`, `lib/builder/miTrabajo.js` y `components/BuilderPanel.js`. El motor de planes no cambia.
- **Auditoría.** La lista de estrategias del paso 3 es la misma que la del paso 2 desde todos los sitios que lo abren (barra de pasos,
  «Mi trabajo», editor, resultado del paso 2): la de la página (`strategies?active=eq.true`) más las recién guardadas
  (`estrategiasEf` de `BuilderPanel`). En la base hay 8 de tarjetas, todas diarias y activas (Copia editor 23, Línea bajista + EMA10,
  Prueba editor EMA20, PRUEBA_BUILDER_1, Retroceso líderes RSI2, SuperTrend 10/3, Swings 2/2, Tortugas 20/10), y la pantalla montada con
  esas filas enseña las 8 en los dos pasos: la falta de «Prueba editor EMA20» no se reproduce con el código. La pestaña «Plan nuevo 2»
  solo la creaba «+ Añadir plan» (el número seguía al del primero, aunque ya no estuviera). El motor ya acepta la comisión fija
  (`comisionPct` 0 con `comisionMinEur`) y el % con mínimo: cada orden paga max(% × importe, mínimo).
- **Desplegable «Estrategia»**: todas las de tarjetas (las semanales, desactivadas) y, entre paréntesis, «pasa el azar», «no pasa» o
  «sin prueba» (`estadosPrueba`: la huella de ahora de cada una frente a las pruebas del paso 2 de TODAS, leídas una vez con
  `listarPruebasUsuario`; una prueba con otra huella no cuenta). El aviso de la estrategia abierta sale de esa misma lectura.
- **Pestañas**: al entrar se abre el plan guardado más reciente de la estrategia con la que se entra (sin estrategia, el más reciente
  de todos); sin ninguno, UN plan nuevo con ella (hace falta uno para trabajar; lo mismo al borrar el último). Otro plan nuevo, solo con
  «+ Añadir plan» («Plan nuevo», «Plan nuevo 2»…: el primer nombre libre, `nombreNueva`). Los nuevos llevan una × (no la última
  pestaña): sin cambios desde que se crearon se cierran; con cambios, «¿Cerrar «…» sin guardar? Se pierden sus cambios.»
  (`conCambios`, `trasCerrar`).
- **Espacio**: una fila arriba con las pestañas, «+ Añadir plan», los botones de guardar (y sus diálogos en la misma fila) y «Comparar
  planes»; la fecha de guardado va en el título de «Guardar cambios». Los dos avisos en una línea, uno al lado del otro (en el móvil, por
  debajo de 700 px, uno debajo del otro), con «Calculando…» a la derecha; los errores, debajo. Las dos columnas empiezan a la misma
  altura: a la derecha, directamente las 6 cifras (de 150 px de ancho mínimo) y el gráfico (250 px de alto en lugar de 280). En
  escritorio (≥ 1000 px), la columna de ajustes es `sticky` con su propia barra (alto máximo, el de la página que se desplaza); en el
  móvil, nada fijo.
- **Comisión por operación**: «%» (0,1 % por defecto), «€ fijos por operación» (2 € de partida) y «% con mínimo» (0,1 % con mínimo de
  1 €), cada una con su «?» y un ejemplo con números (`costesDe`: `comisionPct` y `comisionMinEur`, sin horquilla; `ajustesDe` lo
  deshace). Con «%» el plan es el mismo de antes (la misma huella).
- **Cifras**: euros grandes sin céntimos (114.341 €); «Peor caída» con el % grande y debajo «fecha del valle · caída en €» (las fechas
  de las dos caídas, en su «?»); «Impuestos y comisiones» en dos líneas, «Impuestos 17.128 €» y «Comisiones 28.991 € (623 órdenes)».
- **Ocioso en liquidez**: sin la fila «El mismo plan con el dinero ocioso en liquidez» (es el mismo plan) ni su línea en el gráfico,
  sin la columna «El ocioso añadió» y, en lugar de la tabla de caídas, «Con el dinero ocioso en liquidez no hay nada que comparar:
  elige QQQ, oro u otro símbolo para ver si te protege en las caídas».
- **Mi trabajo**: «Convertirla en plan (paso 3)» ya no dice «próximamente» y abre el paso 3 con esa estrategia (acción `plan`).
- Comprobado (montaje SWC con renderToString): el desplegable con una que pasa, una que no, una sin prueba (y una con otra huella), una
  semanal y una de código (fuera); al entrar sin planes, con planes de la estrategia (el más reciente), sin estrategia y con una sin
  planes; las × (la última no), cerrar la abierta o otra, y la confirmación con cambios; la fila de arriba; ocioso en liquidez y en GLD;
  las tres comisiones en pantalla y en el plan; por defecto con GLD, 114.341 € en pantalla (114.340,91 € del motor), 15,84 % y 14,50 %,
  con la misma huella que en V9.1088. A mano, en el caso inventado de `planes-estrategia.js` (compra a 105, vende a 114, ocioso plano a
  50): con 2 € fijos, (10.000 − 6) / 105 × 114 − 6 = 10.844,628571 € y 12 € de comisiones; con 0,1 % y mínimo de 1 €, 536,60 € con 500 €
  (6 × 1 €) y 10.792,162640 € con 10.000 € (62,411359 €), iguales que el motor. Las pruebas de §48 siguen bien. Comprobaciones comunes.
  No comprobado en el navegador: el gráfico entero sin bajar a 1920 × 1080 y la columna fija.

## 50. Paso 3 · arreglos rápidos (sesión caducada, comas, columna fija, botones, gráfico)

`components/BuilderPlan.js`, `lib/builder/planPantalla.js`, `lib/supabase.js` y, para la sesión, `components/BuilderAzar.js`. El motor de
planes no cambia: ninguna cifra se mueve (comprobado con el motor antes y después, abajo).
- **Sesión caducada al guardar («HTTP 401: JWT expired»).** Causa: BuilderPlan y BuilderAzar memorizaban al montar
  `ctx = { url, headers: getSupaH() }`, así que el token quedaba congelado y caducaba con la pestaña abierta unas horas. Ahora
  `ctxConSesion()` (lib/supabase.js) da un `ctx` cuyo `fetch` pone en cada llamada el token VIGENTE y, ante 401/403, renueva la sesión y
  reintenta una vez: `fetchConSesion`, el mismo de `apiFetch` (sin otro mecanismo). Lo usan todas las llamadas a la base de las dos
  pantallas (listar, crear, cambiar y borrar planes; listar pruebas; leer resultados; confirmar y guardar pruebas del azar). `deps.ctx`
  sigue para las pruebas. **Con el mismo patrón y sin tocar**: `components/BuilderPrueba.js` (línea ~69, `useMemo` con
  `headers: getSupaH()` dentro de `deps`, que solo se rehace si cambian `depsPrueba`, `apiFetch` o `version`). Las demás que usan
  `getSupaH()` lo llaman en cada petición (token vigente, pero sin reintento ante 401).
- **Comas**: dinero inicial, aportación mensual, subida anual, comisión %, mínimo € y € fijos son campos de texto con
  `inputMode="decimal"` (`CampoNumero`, el patrón de `components/CondicionesSimulacion.js`): aceptan «0,1» y «0.1» (`numeroEs` de
  lib/utils.js), el texto que se escribe es estado del campo y lo que va a los ajustes es siempre un número; se enseñan con coma y sin
  punto de miles (`textoCampo`: 10000, 0,1, 0,36). La misma huella con «0,1» que con 0.1.
- **Columna de ajustes fija al bajar.** Por qué no iba el `sticky`: en la app se desplaza la ventana, pero entre la columna y la
  ventana hay tres contenedores con `overflow` que nunca se desplazan (la propia página, `S.pagina` con `overflowY: auto`; `.content`
  con `overflow-y: auto` y `.main` con `overflow: hidden`, en pages/index.js y styles/globals.css), y un sticky se pega al más cercano.
  Arreglo, solo en esta pantalla (sin tocar index.js ni el CSS global, así que no cambia ninguna otra pestaña): en escritorio
  (≥ 1000 px) la página del plan tiene el alto de la ventana menos lo que tiene encima (`--bp-arriba`, medido: la cabecera y, si sale,
  el aviso de configuración) y es ella la que se desplaza; la columna izquierda queda pegada arriba, con su propia barra si es más alta
  que la ventana. En el móvil, una columna y la ventana como antes.
- **Botones**: «Guardar cambios» no sale sin cambios; con un cambio, sale en verde. «Guardar como plan nuevo» se llama «Duplicar» (lo
  mismo: el plan de ahora con sus cambios, con el nombre «… (copia)»).
- **Gráfico «Cómo crece tu dinero»**: todas las líneas continuas y finas: Tu plan #58a6ff (2), Buy&Hold #d0d7de (1,5), ocioso en
  liquidez #f0883e (1,5), lo aportado #6e7681 (1, en escalones); la leyenda, con las mismas muestras. Al final de cada línea, su nombre
  y su importe final, el de la tabla (`finalesDe`: tras venderlo todo y pagar comisiones e impuestos; por eso Buy&Hold acaba en
  201.922 € aunque su línea llegue a 247.457 € antes de la venta final): «Tu plan 114.341 €», «Buy&Hold AAPL 201.922 €», «Ocioso en
  liquidez 91.549 €», «Lo aportado 45.700 €», separadas con `separaEtiquetas` (16 px) y con 200 px de margen a la derecha. «Comprar y
  mantener X» pasa a «Buy&Hold X».
- **Tabla**: título «Sin estrategia: el mismo dinero en…»; filas «Buy&Hold AAPL», «Buy&Hold QQQ», «Buy&Hold S&P 500 (SPY)», «En liquidez
  (0 %)» (`nombreAlternativa`: el motor guarda sus nombres de siempre); «El mismo plan con el dinero ocioso en liquidez», igual. Su «?»:
  «Responde a: ¿mi estrategia aporta algo frente a no hacer nada?…» con el ejemplo 114.341 € frente a 201.922 €.
- **Desplegable «Estrategia»**: al final, gris y sin poder elegirse, «Las estrategias de código (N) no se pueden usar aquí: rehazlas en
  tarjetas.» (N: las de código entre las estrategias de la página, `esDeCodigo`; hoy 76 activas). Sin ninguna, no sale.
- Comprobado: con el motor, antes y después, idénticos: «Prueba editor EMA20» · AAPL · 2016–2025 · 10.000 € + 300 €/mes · GLD ·
  espera · sin apalancamiento · España · 0,1 % → 114.341 € (114.340,91), TWR 15,84 %, TIR 14,50 %, peor caída −34,02 %, 623 órdenes;
  con liquidez, 91.549 €; Buy&Hold AAPL, 201.922 €; «Copia editor 23» · 10.000 € sin aportación · GLD · 0,36 € fijos → 88.075 €,
  24,33 %. Sesión caducada simulada (401 «JWT expired» con el token viejo, 200 tras renovar): el plan se guarda sin error, un solo
  reintento con el mismo cuerpo y las mismas cabeceras; sin sesión que renovar, una llamada y el error de siempre. Comas: «0,1» y 0.1,
  la misma huella (la del motor); ida y vuelta plan → ajustes → plan en las tres comisiones y con subida anual, byte a byte e igual que
  la versión anterior; los 2 planes guardados y las 8 estrategias de tarjetas de la base, iguales byte a byte con las dos versiones.
  Montaje SWC con renderToString y con estado: las etiquetas e importes del gráfico sin solaparse, las cuatro líneas sin rayas con sus
  colores y grosores, la leyenda, la tabla, los botones con y sin cambios, la línea gris del desplegable, los campos con coma y las 6
  cifras y la tabla iguales que antes. Comprobaciones comunes. No comprobado en el navegador: la columna fija a 1920 × 1080.

## 51. Paso 3 · retoques de textos y de la tabla (CAGR del plan, órdenes por fila, comas al teclear)

`components/BuilderPlan.js`, `lib/builder/planPantalla.js` y `pages/api/plan.js`. El motor de planes (`lib/planes/`) no cambia y ninguna cifra
se mueve (comprobado antes y después, abajo).
- **Tarjeta**: «CAGR de la estrategia» pasa a «CAGR del plan», también en «Copiar para Claude». El texto de su «?» (`AYUDA_PLAN.twr`) no
  decía «de la estrategia» y se queda igual.
- **Tabla «Sin estrategia: el mismo dinero en…»**: columnas «, Final, CAGR, TIR, Peor caída, Impuestos, Comisiones, Órdenes». Sin la fila
  «En liquidez (0 %)» (fuera de `ORDEN_ALTERNATIVAS` y de `nombreAlternativa`, así que tampoco sale en «Copiar para Claude»; el motor
  sigue calculando esa referencia). «El mismo plan con el dinero ocioso en liquidez» se queda.
- **Órdenes de cada fila**: `evaluaPlan` ejecuta las referencias pero solo devuelve sus medidas, sin `costes.ordenes`. Por eso
  `/api/plan`, con `curvas: true` y una pieza «estrategia», ejecuta también QQQ y SPY (OCIOSO_LIQUIDEZ y ACTIVO ya se ejecutaban para las
  curvas) y añade `ordenesReferencias: { id: costes.ordenes }`; el resto de la respuesta, igual byte a byte. Dos ejecuciones más por
  recálculo: unos 10–25 ms de cálculo en esta máquina. Lo que cuenta el contador del motor (y dice el «?» de «Órdenes»): todas las
  compras y ventas, también las de mover el ocioso, SIN la venta final del último día (se cobra aparte, `costes.ventaFinal`).
- **Sin comisión** el motor no cuenta órdenes (`costeOrden` sale antes de contar y el contador queda en 0): `cifrasPlan` da `ordenes: null`
  (en el plan y en cada fila), la tabla enseña «—», la tarjeta solo «Comisiones 0 €» y «Copiar para Claude», «—». Con comisión, la tarjeta
  sigue como antes: «Comisiones 28.991 € (623 órdenes)».
- **Comas al teclear** (`CampoNumero`, `conComa`): todo punto se ve al momento como coma. Se cambia en el propio campo y se deja el cursor
  donde estaba (misma longitud; React no reescribe el valor si ya coincide, así que no lo manda al final). `numeroEs` lee lo mismo que antes:
  «0.1» → «0,1» y 0,1; «0,36» igual; «10000» igual; «-2.5» en «Cuánto sube cada año» → «-2,5» y −2,5; «1.5.2» sigue sin ser un número.
- Comprobado: `/api/plan` real (manejador con la sesión y `leer_velas` simulados y velas de la caché) con la versión anterior y esta, en 5
  casos (GLD, sin comisión, liquidez, € fijos, % con mínimo): la respuesta, idéntica byte a byte salvo `ordenesReferencias`, y las filas,
  iguales salvo LIQUIDEZ y las órdenes. «Prueba editor EMA20» · AAPL · 2016–2025 · 10.000 € + 300 €/mes · GLD · espera · España · 0,1 % →
  114.341 €, TWR 15,84 %, TIR 14,50 %, −34,02 %. Órdenes: tu plan 623, con el ocioso en liquidez 257, Buy&Hold AAPL, QQQ y SPY 120 cada
  uno (1 compra + 119 aportaciones); Buy&Hold AAPL, 201.922 €. Los 2 planes guardados: ida y vuelta y huellas iguales con las dos versiones
  y las de la base. Montaje SWC con renderToString, con y sin comisión: columnas, filas, «?», tarjetas. `CampoNumero` real en un navegador
  (Chromium, el texto metido con `insertText` porque la ventana estaba oculta y no admitía teclas): los 4 casos y un punto en medio
  («12345» con el cursor tras el 2 → «12,345», cursor en 3; un 9 → «12,9345»). No comprobado con teclado físico ni en la pantalla entera
  con sesión. Comprobaciones comunes.

## 52. Paso 3 · el contador de órdenes (con o sin comisión y con la venta final)

`lib/planes/plan.js`, `lib/builder/planPantalla.js` y `components/BuilderPlan.js`. Corrige lo que §51 dejó dicho sobre el contador. SOLO cambia el número de órdenes.
- **Motor**: `costeOrden` cuenta cada compra o venta de un símbolo que no sea LIQUIDEZ con importe > 0, haya o no costes (antes salía antes de contar si
  `costes` era null). La liquidación final suma una orden por cada símbolo con posición el último día, la misma condición (`u > 0`) con la que ya cobraba
  su comisión. El cálculo de la comisión y los euros, igual.
- **Pantalla**: fuera `conComision` / `ordenesDe` y los «—»: la columna «Órdenes», la tarjeta («Comisiones 0 € (N órdenes)») y «Copiar para Claude» enseñan
  siempre el número. El «?» de «Órdenes» dice que incluye la venta final.
- **Por qué no sube siempre**: la venta final solo cuenta si queda algo que vender. Con el ocioso en liquidez y la estrategia fuera el último día, todo está en
  liquidez: no hay orden. «Prueba editor EMA20» · 2016–2025 · 10.000 € + 300 €/mes · GLD · España · 0,1 %: tu plan 623 → 624 (vende GLD), ocioso en liquidez
  257 → 257 (fuera de AAPL el 31/12/2025), Buy&Hold AAPL, QQQ y SPY 120 → 121. Con 10.000 € sin aportación y comisión 0: Buy&Hold AAPL 2. En 2016–2020 el ocioso
  en liquidez sí sube, 117 → 118 (dentro de AAPL el último día).
- **Cuadre**: con comisión fija, comisiones = órdenes × comisión exacto, cosa que antes no daba: 2 € × 624 = 1.248 €; los planes guardados, 0,37 € × 326 = 120,62 €
  y 0,37 € × 163 = 60,31 €.
- `scripts/comprobaciones/planes-estrategia.js`: el caso a mano pasa de 5 a 6 órdenes (las 5 de durante el plan y la venta final del ocioso); y la comparación con la
  versión anterior ignora solo la clave `ordenes`, que es lo único que este cambio mueve (euros, fechas, huellas e inicios rodantes siguen byte a byte).
- Comprobado: `/api/plan` real (sesión y `leer_velas` simulados, velas de la caché leídas en solo lectura) con la versión anterior y esta, en 12 casos (GLD, liquidez, QQQ,
  sin comisión, € fijos, % con mínimo, sin impuestos, ×2 con «compra», 2016–2020, sin aportación y los 2 planes guardados): respuesta y cifras de pantalla idénticas byte a
  byte salvo las órdenes. Planes guardados: ida y vuelta y huellas iguales con las dos versiones y las de la base. Montaje SWC con renderToString, con y sin comisión: las
  únicas diferencias del HTML son las órdenes y la tarjeta. No comprobado en la pantalla entera con sesión. Comprobaciones comunes.

## 53. Paso 3 · la norma de cierre en la tabla y el gráfico

**Norma de Sergi: TODO se mide como si se vendiera todo el último día** (comisión, impuestos y la orden de venta contada). `lib/builder/planPantalla.js` (`cifrasPlan`, `conCierre`, los «?») y el comentario de `components/BuilderPlan.js`. El motor no cambia: `twrNeto` y `valorNeto` ya salían de `lib/planes/medidas.js`.
- **CAGR de todas las filas y la cifra «CAGR del plan»**: `twrNeto`, antes `twr` (el VL del último cierre, antes de vender).
- **Último punto de cada línea del gráfico** (plan, Buy&Hold, ocioso en liquidez): el `valorNeto` de su fila (`conCierre`). Línea, etiqueta y tabla dicen lo mismo; por eso una línea puede bajar de golpe el último día.
- **Se aparta de la regla de oro del encargo, decidido por Sergi el 03/11/2026**: el encargo pedía que el CAGR del plan no cambiara, porque en su captura ya coincidía. Solo coincidía en ese plan, sin impuesto final pendiente. Con impuesto o comisión final, el CAGR del plan también baja (tabla). Se aplicó la norma a todas las filas para comparar plan y Buy&Hold con la misma vara. Final, TIR, caída, impuestos, comisiones y órdenes no cambian en ninguna fila (`planes-pantalla.js` lo compara con la versión anterior).
- **Tramos («CAGR de tu plan» por tramo): NO cumplen la norma, y no se han tocado.** Son el VL de cada mitad, del mismo cálculo: no venden al final de cada tramo. Para cumplirla habría que simular cada tramo aparte, con sus propios impuestos. Su «?» lo dice.

| Plan (cifras de hoy) | Final | CAGR del plan | CAGR Buy&Hold acción | Fin de la línea Buy&Hold |
|---|---|---|---|---|
| Prueba editor EMA20 · AAPL · 2016–2025 · 10.000 € + 300 €/mes · GLD · 0,1 % | 114.340,91 € (igual) | 15,84 % → 15,74 % | 26,63 % → 24,08 % | 247.456,87 € → 201.921,87 € |
| Plan 4, «Copia editor 23 / gold» | 197.917,32 € (igual) | 24,55 % → 24,55 % | 26,64 % → 24,10 % | 247.525,86 € → 202.152,60 € |
| Plan 6, «SuperTrend 10/3 / gold» | 75.122,81 € (igual) | 22,98 % → 22,37 % | 26,65 % → 23,89 % | 105.974,05 € → 85.019,73 € |
| Plan 7, «Prueba editor EMA20» | 64.625,48 € (igual) | 20,81 % → 20,54 % | 26,65 % → 23,89 % | 105.974,05 € → 85.019,73 € |

- Comprobado: a mano, en `scripts/comprobaciones/planes-pantalla.js` (en `comunes.sh`): 10.000 € sin aportación, de 100 a 114 en 10 años: 1.400 € de ganancia, 19 % = 266 €, quedan 11.134 €; CAGR = (11.134 / 10.000)^(1/años) − 1 = 1,0801 %, igual a su TIR. Tabla de arriba con los precios reales de la caché, en solo lectura. Planes guardados: ida y vuelta y huellas iguales. No comprobado en la pantalla entera con sesión.

## 54. Paso 3 · la cabecera B y las pestañas de planes (boceto «Paso 3 · cabecera B»)

`components/BuilderPlan.js`, `components/BuilderPestanas.js` (nuevo), `components/VentanaPregunta.js` (nuevo: la ventana y la papelera de Tesis, compartidas), `lib/builder/pestanasPlan.js` (nuevo, puro), `lib/builder/planesGuardados.js`, `components/BuilderPanel.js`, `pages/index.js` y `sql/builder_pestanas.sql`. Deja atrás la fila de pestañas de §48–§50.
- **Cabecera B** (`CabeceraPasos`, en `BuilderPanel.js`): en los pasos 1, 2 y 3, una línea con «Builder › Mi trabajo › <estrategia>» y los pasos en círculos pequeños (✓ los hechos, verde el actual). En el paso 3, el 2 solo lleva ✓ si la estrategia tiene prueba. Quita las tres cajas, el título «Convierte…» y su subtítulo. Lo desactivado sigue con su motivo en el tooltip; con una prueba en marcha no se pulsa nada. «Mi trabajo» lleva a esa sección de la página. **La portada del Builder sigue con las tres cajas** (`BarraPasos`): no es un paso y allí explican el recorrido.
- **Pestañas**: una por plan abierto, con nombre recortado y entero en el tooltip, duplicar, papelera ROJA (borra de la base, con ventana) y × (solo de la vista). ● amarillo con cambios. Un plan nuevo no lleva papelera y su pestaña dice «sin guardar» («sin guardar: se perderá al recargar» en el tooltip y en la línea de avisos). Se puede cerrar la última: «Ningún plan abierto».
- **Cambios sin guardar**: «Guardar cambios» y «Descartar cambios» solo con cambios. Al cambiar de pestaña, cerrarla, ir a otro paso, a «Mi trabajo», a otra pantalla, al logo o a «Salir»: la ventana Guardar / Salir sin guardar / Cancelar (`salida`, el mismo camino que Tesis, por `salirDeTesis` de `pages/index.js`). Si guardar falla, se queda abierta con el error. Un plan nuevo pide el nombre en la propia ventana y «Salir sin guardar» lo cierra.
- **Duplicar**: uno guardado pide el nombre («… (copia)») y crea un plan guardado al lado; el abierto se copia con sus cambios y el original queda como estaba. Uno nuevo: otro nuevo al lado.
- **«+ Añadir plan ▾»**: «Crear nuevo plan» (con los ajustes de ahora) y todos los guardados: nombre, «Tienes al final X €» si ya se ha calculado en esta visita (los planes no guardan su resultado), fecha y ✓ en los abiertos. Con más de 6, buscador con ✕, sin distinguir mayúsculas ni acentos. **«+N ▾»**: las que no caben; cuánto cabe se estima por el nombre (`anchoPestana`, `repartePestanas`), sin medir en el navegador, y la abierta se ve siempre.
- **Guardado en la base** (`builder_pestanas`: una fila por usuario, `planes bigint[]` en orden; RLS dueño, anon nada; reversión en el SQL). Un plan que ya no existe se ignora. Quien aún no tiene fila abre todos sus planes. Al entrar con una estrategia se abre su plan más reciente (se añade si no estaba); sin estrategia, el más reciente de los abiertos. El orden es el de apertura: **no se pueden arrastrar**, porque el boceto no lo pedía.
- **Línea de avisos**: «✕ No pasa el azar · Ver la prueba», «Sin prueba · Probarla ahora» o «✓ Pasa el azar · Ver la prueba»; «⚠ Acción elegida a mano»; a la derecha, guardar y «Comparar planes» desactivado («Próximamente»). Los dos primeros llevan su «?».
- Comprobado: `planes-pantalla.js` (piezas puras con cuentas a mano, fetch falso y montaje con 0, 1, 3 y 12 pestañas, la ventana, duplicar, borrar y los avisos); `scripts/comprobaciones/pestanasSeguridad.js` contra la base de verdad (no va en `comunes.sh`): dos usuarios simulados en una transacción deshecha, B no lee ni cambia ni borra lo de A, anon nada; en un navegador de verdad con una página temporal y una base falsa en memoria (no subida): los caminos de la ventana, guardar que falla, duplicar, borrar, cerrar todas, añadir, crear, recargar y el orden leído, «+N» y el buscador. **No comprobado**: la pantalla entera con sesión, ni el aspecto a ancho de móvil (la pestaña del navegador estaba oculta y no pintaba a ese ancho; la fila pasa a varias líneas).

## 55. Paso 3 · «Abrir» un plan desde una tesis

`components/TesisPanel.js`, `pages/index.js` (`abrirPlanEnBuilder`), `components/BuilderPanel.js` (`abrir: { planId, n }`) y `BuilderPlan` (`planId`, `eligeEntrada`). «Abrir» en la ficha de un plan de «Relacionado» lleva al paso 3 con ese plan como pestaña activa, añadida al final si no estaba (y guardada, como cualquier otra). Con cambios sin guardar en la tesis, antes pregunta (`conGuardia`). El Builder no puede tener cambios sin guardar en ese momento: al salir de él ya se preguntó.
- **Si el plan ya no existe**: en la tesis se ve «(borrado)», sin «Abrir». Si se borró después de entrar en Tesis (la lista de la tesis es la de entonces), el paso 3 avisa en una línea, «Ese plan ya no existe: se ha borrado.», y abre lo de siempre.
- Comprobado: `tesis.js` y `planes-pantalla.js` (la ficha, el plan que existe, el que no y el aviso) y `eligeEntrada` a mano. No comprobado en la pantalla entera con sesión.

## 56. Paso 3 · arreglos de lo comprobado por Sergi el 03/11/2026 (círculos con nombre, miles y «Abrir» un plan)

`components/BuilderPanel.js`, `components/BuilderPlan.js`, `lib/builder/planPantalla.js`, `scripts/comprobaciones/domFalso.js` y `planes-montaje.js` (nuevos, en `comunes.sh`). Ninguna cifra cambia; los planes guardados, tampoco.
- **Círculos de la cabecera B con su nombre** (`CabeceraPasos`, `PASOS_CORTOS`): «✓ Crear —— ✓ Probar contra el azar —— ③ Convertirla en plan». Hechos: ✓ con borde verde y texto apagado. Actual: círculo verde relleno, su número y texto en negrita blanca. Pendientes: número y texto apagados. Se pulsan como antes y lo desactivado sigue con su motivo en el tooltip. Por debajo de 900 px el texto se oculta y queda en el tooltip.
- **Punto de miles en los campos de euros** (`CampoNumero enEuros`, `textoEuros`): «Dinero inicial», «Aportación mensual», «Mínimo en euros» y «Euros por operación». Fuera del campo, 10.000; al entrar, 10000, y se teclea como dice §51 (un punto tecleado es coma). A los ajustes va el mismo número: entrar y salir no crea cambios y la huella del plan es la misma.
- **«Abrir» un plan desde una tesis (§55): el fallo NO se ha podido reproducir y por eso no se ha cambiado ese camino.** Sergi vio la pestaña «Copia editor 23 / gold» activa en lugar de «SuperTrend 10/3 / gold». `planes-montaje.js` monta de verdad el Builder, con estado y efectos, con los planes y el orden reales de la base (4, 7, 6; el 4 es el más reciente) y sale SuperTrend en todos los casos: plan abierto y no primero; plan no abierto; Builder sin montar; Builder ya en el paso 3; las pestañas leídas antes y después que los planes; y la cadena entera desde la ficha de la tesis. La sospecha de la carrera con `builder_pestanas` no se sostiene: `eligeEntrada` recibe el plan pedido y las pestañas guardadas a la vez, tras leer las dos cosas. **Dato de la base** (solo lectura, 03/11/2026): la tesis «Prueba adjuntos», guardada por última vez a las 18:11, solo tiene enlazada la ESTRATEGIA «SuperTrend 10/3», no el plan; esa ficha lleva al paso 1. **No comprobado**: la pantalla entera con sesión en un navegador. Si vuelve a pasar con una ficha «Plan · …», hay que mirar en ese momento qué ficha era y qué versión de la app estaba cargada.
- `domFalso.js`: un DOM mínimo (sin dependencias nuevas) para montar componentes con `react-dom/client` en Node. Hasta ahora las pruebas solo pintaban una vez con `renderToString`, sin efectos.

## 57. Paso 3 · gráfico más alto, casillas de las líneas, tiempo en el ocioso y «Año a año» (boceto «Paso 3 · cabecera B con iconos, gráfico y año a año»)

`components/BuilderPlan.js`, `lib/builder/planPantalla.js` y `pages/api/plan.js`. El motor (`lib/planes/`) no cambia y ninguna cifra se mueve: las de referencia de docs/planes-inversion.md, iguales byte a byte.
- **Gráfico**: 375 px (antes 250).
- **Casillas en la leyenda**: Tu plan (siempre, sin casilla), Buy&Hold del valor (sí), Buy&Hold SPY (no), Buy&Hold QQQ (no), ocioso en liquidez (sí), lo aportado (sí). Cada línea visible lleva su nombre e importe final con la norma de cierre (§53) y `separaEtiquetas` las mantiene a 16 px como mínimo. La escala se ajusta a las líneas visibles. Lo marcado se recuerda en este navegador (`builder_paso3_lineas`, con try/catch; bloqueado, las de por defecto).
- **SPY y QQQ en `/api/plan`**: `curvas` añade su patrimonio. Ya se ejecutaban desde §51 para contar sus órdenes, así que **no hay más cálculo**: la respuesta pasa de unos 690 a 780 KB. El resto de la respuesta, idéntico byte a byte con la versión anterior en los 3 planes guardados.
- **Tarjeta «En el ocioso»**: `parteOciosa`, velas con 0 en la franja `dentro` sobre las del periodo (plan 4: 35,3 %; 6: 49,0 %; 7: 36,2 %). Con liquidez, igual: el tiempo fuera de la acción.
- **Tabla «Año a año»** (`anioAnio`), bajo el gráfico. La rentabilidad, por VL, así que las aportaciones no cuentan como ganancia. El último año incluye la venta final: su último VL es el último × (lo que queda tras vender / patrimonio), el mismo de `twrNeto`. Por eso el producto de (1 + cada año) = (1 + CAGR)^años.
- **Decisión tomada aquí: la peor caída del año NO incluye la venta final.** Es un coste, no una caída del precio. Si contara, Buy&Hold marcaría una caída del 18 % el último día por los impuestos y la tabla contradiría a «Peor caída». Se mide de pico a valle dentro del año, desde el VL con el que empieza, así que puede ser menor que la global si esa cruza de un año a otro (plan 6: −24,37 % frente a −25,49 %).
- **Tarjeta «Impuestos y comisiones»**: en una línea, «39.785 € · 165 €»; las órdenes, en el tooltip y en su «?».
- «Copiar para Claude» lleva también el ocioso y el año a año.
- Comprobado, a mano en `planes-pantalla.js`: dos años naturales (729 días, 1,996 años): Buy&Hold +14 % y −2,3333 % (11.400 € → 11.134 € con la venta), tu plan +8,5714 % y −1,5 %; caída de 120 a 113 (−5,8333 %); 5 de 12 velas en el ocioso; el producto = (1 + CAGR)^años exacto y, a menos de un 0,1 %, (1 + CAGR)^2; con aportaciones, lo mismo. Las 6 etiquetas sin montarse. `planes-montaje.js`, con estado: marcar, desmarcar, recordar al volver y almacén bloqueado. Con el manejador real de `/api/plan` y los precios de la caché en los 3 planes guardados: el producto da el CAGR en plan y Buy&Hold (diferencia < 1e-15). **No comprobado**: la pantalla entera con sesión en un navegador.

## 58. «Mi trabajo» compacto (boceto «Mi trabajo compacto»)

`components/BuilderPanel.js`, `lib/builder/misListas.js` y la exportación de `IconoDuplicar` de `components/BuilderPestanas.js`. Ninguna cifra cambia. Mirar y navegar no escribe nada.
- **Arriba a la derecha**: «Nueva estrategia: En blanco / Desde una plantilla ▾» (desplegable opaco; la regla de cada plantilla, en su tooltip). Fuera el bloque «¿Desde dónde empiezas?» y «Desde una de mis estrategias»: lo hace el icono de duplicar. La frase «Una estrategia es…», tras el «?» de «Mi trabajo». **La barra de los tres pasos de la portada sigue**: el encargo no la nombra.
- **Una línea por estrategia**, de tarjetas y de código; la regla, en el tooltip del nombre. Columnas: Estrategia · Versión · Prueba contra el azar · Planes · Qué toca ahora · iconos. Filtros «De tarjetas» y «De código», como en el boceto. La pestaña «Mis pruebas» sigue igual.
- **Prueba contra el azar**: sale de `pruebas_azar` (la del paso 2), con la huella de la estrategia de ahora: si la regla ha cambiado, «Sin probar». «No pasa · 30/10 · AAPL · Ver»; «Ver» abre el paso 2. **Cambia de fuente**: antes la fila leía las pruebas de lotes, que siguen en «Mis pruebas». Una estrategia con solo lotes dice «Sin probar» hasta que se pruebe en el paso 2, como en el boceto. Si `pruebas_azar` no se puede leer: «—» y la acción de antes.
- **Planes**: los guardados con la foto de esta estrategia. Cuántos, nombres en el tooltip, «Abrir» al paso 3 con ese plan activo; con varios, desplegable opaco y fijo a la ventana (la tabla tiene barra propia y lo cortaría).
- **Qué toca ahora**: borrador, «Terminarla»; sin prueba, «Probarla contra el azar»; con prueba, pase o no, «Convertirla en plan» (§48: siempre activo), salvo las semanales, «—» con su motivo en el tooltip.
- **Iconos**: duplicar (dos hojas) abre una copia en el paso 1, sin guardar; papelera ROJA con el aviso de hoy, «¿Eliminar esta estrategia?», en la ventana de la app. Si la usan planes lo dice: siguen con su versión guardada. Se comprueba lo borrado: si la base no borra nada, lo dice y la fila sigue. **El boceto decía que los planes se borran con ella; no es así**: el plan lleva su foto, y el encargo pedía «el aviso que hay hoy».
- **Buscador con ✕** a la altura de las pestañas, sin distinguir mayúsculas ni acentos; vale también en «Mis pruebas».
- **Arreglo de §57, encontrado al mirarlo en un navegador**: una regla global de `styles/globals.css` (`label { flex-direction: column }`) apilaba cada casilla de la leyenda, y la última tarjeta dejaba hueco a su derecha. Ahora van en fila y las tarjetas ocupan todo el ancho.
- Comprobado: `planes-montaje.js`, con estado y efectos (columnas, los cuatro casos de la prueba, planes, buscador, desplegables, papelera con cancelar, fallo y borrado, abrir, duplicar, ir al paso 2, las de código y «Mis pruebas»). En un navegador de verdad, con una página temporal y la base simulada (no subida): portada, «Abrir» de «SuperTrend 10/3 / gold» (activa ella), círculos con nombre y ocultos a 760 px, «10.000», gráfico con las 6 líneas, leyenda y «Año a año». **No comprobado**: la pantalla entera con sesión y datos reales.

## 59. Un solo sistema de pruebas: fuera las pruebas antiguas de lotes

Decidido por Sergi el 03/11/2026. Ninguna cifra cambia. La prueba es la del paso 2 (`pruebas_azar`).
- **Retirado de la app**: `components/BuilderPrueba.js`, `components/BuilderCurvas.js` («Cómo le fue»), la pestaña «Mis pruebas», «No llega», y lo que solo usaban ellos: `lib/builder/pruebaGuiada.js`, `curvasPrueba.js` y `miTrabajo.js`. `marcasLog` y `separaEtiquetas`, que usa el paso 3, pasan a `lib/builder/escalaGrafico.js`. Secciones anteriores que hablan de esas pantallas quedan como historia.
- **Borrado de la base**, por la Management API y con guardia por nombre y tipo de prueba: las 4 filas de `editor_lotes` (PRUEBA_EDITOR_1, RETROCESOS_1, PRUEBA_BUILDER_1 · 2026-10-22, PANTALLA_CURVA · 2026-10-27) y sus 14 ejecuciones en `lab_pruebas` (ids 262–275: `editorLote`, `editorLab`, `editorCalibracion` y `editorCurvas`). Sin DROP: las tablas siguen. **Copia antes de borrar**: `backups/lotes_retirados_20261103.json` (las filas enteras) y `backups/datos_completos_20261103-2015`.
- **Lo que se queda, decidido por Sergi**: las 45 filas de LOTE_1–3, CARTERA_1–3 y exploración de `lab_pruebas` (las leen «Laboratorio» y «Cartera»). El modo «Lotes» del Editor clásico (`components/EditorLotes.js`) sigue y sale vacío. La guía «Cómo se prueba una estrategia» (`lib/builder/ayuda.js`, `GUIA`) no se ha tocado y **aún explica los laboratorios antiguos**.
- **Efecto en otra cifra**: el contador de pruebas de «Laboratorio» (`cuentaPruebas`, `lib/registroLab.js`) baja 12: contaba esas ejecuciones.
- **Efecto en el paso 1 (arreglado en §63)**: cambiar la regla de una estrategia solo creaba «versión 2» si estaba en un lote (`enPrueba`). Ya no hay lotes, así que hoy se guarda sobre la misma, y la prueba del paso 2 pasa a «Sin probar» por su huella. La frase del paso 2 «será “… · versión 2”» ya no se cumple; no se ha cambiado porque el encargo no la nombra.
- **Comprobaciones**: `huellas.js` leía los tres lotes de referencia de la base; ahora de `scripts/comprobaciones/lotes-congelados.json`, con las mismas huellas (a2cdfd85, 23c5006c, 0d6726ec). `lotes.js` y `cartera.js` no leían la base: LOTE_1–3 y CARTERA_1–3 están en `lib/lotesLab.js`.

## 60. Se puede borrar todo: pruebas y estrategias

`sql/pruebas_azar_borrar.sql` (aplicado), `components/BorrarPrueba.js` (nuevo), `lib/pruebaAzar.js`, `BuilderAzar.js`, `BuilderAzarResultado.js`, `BuilderPanel.js` y `BuilderPlan.js`. Ninguna cifra cambia.
- **La base**: política de DELETE solo para lo propio en `pruebas_azar`. El resultado se va con la prueba (`ON DELETE CASCADE`), en la misma operación; sigue sin poderse cambiar nada. `scripts/comprobaciones/pruebasAzarSeguridad.js`, con usuarios simulados en una transacción que se deshace: B no borra lo de A, anon nada, A borra lo suyo. **Esto cambia la decisión de §44** de que una prueba no se borra: lo decidió Sergi.
- **Papelera roja en cada prueba**: resultado del paso 2, «Pruebas anteriores» y fila de «Mi trabajo». Ventana «¿Borrar esta prueba? Desaparece del todo.» con el aviso amarillo de quedarse con una que pasó por suerte; Cancelar y «Borrar la prueba». Al borrar en la fila, «Mi trabajo» vuelve a «Sin probar».
- **Borrar una estrategia (opción A de Sergi)**: la ventana lista sus pruebas (se borran con ella) y los planes que la usan (se quedan, con su copia, cada uno con «Abrir el plan»), con el aviso amarillo si hay pruebas; Cancelar y «Borrar». **El boceto decía «Borrar todo» y que los planes se borraban; manda lo que decidió Sergi.** Se borra primero la estrategia y luego sus pruebas: si esto último falla, lo dice. Si no se pueden leer sus pruebas, no deja borrar.
- **Los planes siguen igual**: mismo plan, misma huella. En el paso 3, «<nombre> (estrategia borrada · copia guardada)» en la ruta y en el desplegable, sin «Probarla ahora» ni los pasos 1 y 2, que ya no tienen estrategia a la que ir.
- Comprobado: `scripts/comprobaciones/borrar.js` (en `comunes.sh`), montado con estado y efectos.

## 61. Paso 2 · «Cómo creció el dinero, frente al azar» (boceto «Paso 2 · resultado frente al azar y borrar pruebas», opción A, con tres pestañas)

`components/BuilderAzarResultado.js` (reescrita), `lib/azarGraficos.js` (nuevo), `lib/azarReglas.js` (`copiasConOperaciones` y `operacionesDelPeriodo`, añadidas sin tocar lo demás), `lib/resultadoAzar.js`, `sql/pruebas_azar_graficos.sql` (aplicado). **La prueba no cambia**: 99,2 % y 11,3 %, misma huella.
- **Pantalla**: cabecera B; una línea con «Prueba contra el azar · AAPL · velas diarias», el veredicto con «?», «Congelada el … · semilla …» y la papelera. Tres pestañas: «2016–2025 · completo» (por defecto) y los dos periodos con su ✓/✕ y %. A la derecha, «Para pasar hay que ganar al 95 % de las copias en los DOS periodos». Fuera los histogramas y las tarjetas de §46: los textos largos pasan a sus «?». El alto del gráfico se mide con lo que queda de pantalla (mínimo 340 px).
- **Gráfico**: 10.000 € al empezar, escala logarítmica. Abanico en 5 líneas grises (5, 25, 50, 75 y 95) con las zonas 5–95 y 25–75; tu estrategia en azul grueso; la mejor en verde, la típica en gris claro y la peor en naranja, con etiqueta e importe al final, sin montarse.
- **Panel**: «Veredicto (sale de los dos periodos)», con las dos filas siempre; debajo, las cifras de la pestaña abierta. En la completa, «solo informativo, no cuenta para el veredicto».
- **La pestaña completa no existía**: se simulan 1.000 copias con las mismas reglas (tasa de entradas de esos 10 años, apertura, reglas y stops de la estrategia, sin filtro de mercado, cierre el último día, sin comisiones ni impuestos) y la semilla `pruebaAzar|<semilla>|completo|copias`. No entra en el veredicto, ni en la foto, ni en la huella.
- **Los periodos usan la semilla del veredicto**: son las mismas 1.000 copias. La típica es la del resultado; la mejor y la peor, las de sus `cagrCopias` guardados: `azar-graficos.js` lo comprueba.
- **Qué se guarda** (tabla aparte, se va con su prueba): por pestaña, las 5 líneas (un punto de cada 5 velas, en euros enteros) y las operaciones de las 3 copias. **Ocupa 80 KB** en la prueba de EMA20 (123, 57 y 66 operaciones de tu estrategia); crece con las operaciones. También el percentil de la completa, que no sale de otro sitio: es la única cifra más de lo pedido. Tu línea y las de las copias se recalculan con los precios al abrir.
- **Prueba existente de EMA20**: calculado una vez con su semilla y guardado, con la prueba y su resultado iguales por md5. Completa: tu estrategia 55.706 €, mejor 111.156 €, típica 44.332 €, peor 13.824 €, ganó al 73,9 %. Una prueba sin gráfico guardado (una nueva, o una que no lo pudo guardar) lo calcula al abrirla y lo guarda: un solo camino.
- **Si los precios han cambiado** desde que se congeló (la huella del resultado), una línea lo avisa: el dibujo se hace con los de ahora.
- Comprobado: `scripts/comprobaciones/azar-graficos.js` (en `comunes.sh`): cuentas a mano; la prueba de EMA20 congelada con sus precios en `scripts/comprobaciones/prueba-ema20/` (sirve aunque se borre de la app), `ejecutarPrueba` byte a byte; y la pantalla montada. Permisos: `pruebasAzarSeguridad.js`. En un navegador, con una página temporal no subida: las pestañas, la ventana de borrar, sin errores.

## 62. Paso 2 · velas a pantalla completa (boceto «Pulsar una copia → velas a pantalla completa»)

`components/BuilderAzarVelas.js` (nuevo) y `components/BuilderAzarResultado.js`. Ninguna cifra cambia; no escribe nada.
- **«Ver en velas»**, en la leyenda, en tu estrategia y en cada copia: las velas del valor en el periodo de la pestaña, a pantalla completa, con lightweight-charts. Tus compras ▲ y ventas ▼ azules y la zona sombreada mientras estás dentro; las compras ● y ventas ○ naranjas de la copia.
- **Los círculos de la copia van en una capa SVG** encima del gráfico, recolocada al moverse o hacer zoom: lightweight-charts no tiene marcas huecas. La zona sombreada llena todo el alto, detrás de las velas.
- **Arriba**: «Tu estrategia frente a la copia típica», símbolo y periodo, selector La mejor / La típica / La peor, «Rueda: zoom · arrastrar: moverse» y × (también Esc). **Debajo**, la tabla lado a lado: Final (10.000 € al empezar), Operaciones, Ganadoras, Peor caída y Tiempo dentro del valor. Con una operación aún abierta al final, su venta es la del último día, como dice la norma de cierre.
- **Desde tu estrategia**: solo tus operaciones. El selector sigue, para comparar con una copia si se quiere.
- **La barra pequeña de abajo del gráfico del boceto («2021 ··· 2025») no se ha hecho**: el encargo no la nombra, y la rueda y el arrastre ya mueven. No se muestran marcas de stop.
- Comprobado: `azar-graficos.js` (la zona y las marcas a mano; título, selector, tabla, cerrar y «solo tus operaciones», montados). Las velas de verdad, en un navegador con una página temporal no subida.

## 63. La guía al día, «versión 2» desde las pruebas del paso 2 y la guardia del paso 1

`lib/builder/ayuda.js` (reescrita), `components/BuilderGuia.js`, `lib/builder/versiones.js` (`pruebasDeLaRegla`), `components/BuilderEditor.js` y `components/BuilderPanel.js`. Sin cambios en la base. Ninguna cifra cambia.
- **La guía** «Cómo se prueba una estrategia» explica solo el paso 2: qué es una prueba, las copias, «Ganó al X %», los dos periodos, la fiabilidad, cómo leer el resultado, cambiar y borrar. Las cifras salen de `REGLA_AZAR_REGLAS`. Fuera de `ayuda.js` todo lo de los laboratorios, que ya solo usaba la pantalla retirada en §59.
- **«Versión 2» vuelve a cumplirse.** `enPrueba` sale de las pruebas del paso 2 de esa estrategia, con `listarPruebas`. Si se cambia la regla de una estrategia con prueba: `POST` de «<nombre> · versión 2», sin prueba, y la original no se toca. Si se cambia el nombre o la descripción: `PUT` sobre la misma.
- **Qué prueba cuenta**: la que probó ESTA regla con sus valores (`paraHuella`, sin nombre ni descripción). Una prueba de una regla anterior no cuenta: esa estrategia ya sale «Sin probar» y se guarda sobre la misma. Es el mismo criterio que tenían los lotes.
- **Si no se pueden leer sus pruebas**, una línea avisa de que cambiar la regla se guardará sobre esta misma.
- **Arreglado en §64**: la huella de la foto (`fotoDe`) incluye el nombre, así que al renombrar una estrategia con prueba, «Mi trabajo» y el paso 3 pasan a decir «Sin probar», aunque la prueba siga y la regla sea la misma. No es de este encargo.
- **La guardia del paso 1**: ir a una tesis con cambios sin guardar abre la ventana «Guardar / Salir sin guardar / Cancelar», como en el paso 3. «Guardar» aplica la regla de versiones (y la ventana lo avisa si va a crear una); «Salir sin guardar» vuelve a lo guardado. **Solo en ese enlace**: salir del paso 1 por el menú o el logo sigue como estaba, sin preguntar.
- Comprobado: `scripts/comprobaciones/version-paso2.js` (en `comunes.sh`), montado con estado y efectos.

## 64. Una prueba vale mientras no cambie la regla

`lib/pruebaAzar.js` (`reglaDeFoto`), `lib/builder/planPantalla.js` (`reglaDe`, `estadoPrueba`, `estadosPrueba`), `lib/builder/planesGuardados.js`, `lib/builder/misListas.js`, `lib/builder/versiones.js`, `components/BuilderPlan.js` y `components/BuilderAzar.js`. Sin cambios en la base. Ninguna cifra cambia.
- **El fallo**: «Mi trabajo» y el paso 3 comparaban la huella de la foto, que incluye el nombre y la descripción. Al renombrar una estrategia con prueba salía «Sin probar».
- **Ahora** comparan SOLO la regla (`paraHuella`, sin nombre ni descripción), la misma cuenta que decide si se crea «· versión 2». También la nota «La estrategia ha cambiado desde esta prueba» del paso 2.
- **No cambia nada guardado**: ni la foto ni `estrategia_huella` de las pruebas, que se siguen guardando y copiando igual. `listarPruebasUsuario` pide además la foto, de donde sale la regla.
- **Lo que no se ha tocado**: el aviso del paso 3 «La estrategia ha cambiado desde que guardaste este plan» (`comparaEstrategia`) compara la copia del plan con la estrategia, con su huella. Al renombrar una estrategia, ese aviso sigue saliendo. El encargo habla de las pruebas.
- Comprobado: `version-paso2.js`, a mano y montado: renombrada sigue con su prueba en «Mi trabajo» y en el paso 3; con otra regla, «Sin probar» y «· versión 2». La prueba de EMA20, igual por md5.

## 65. Paso 2 · velas más visibles y con filtros

`components/BuilderAzarVelas.js` y `components/BuilderAzarResultado.js`. Sin cambios en la base. Ninguna cifra cambia. Corrige lo dicho en §62 sobre dónde está «Ver en velas» y sobre el selector.
- **Acceso**: botón «Ver en velas» con icono arriba a la derecha del gráfico (abre «Tu estrategia») y un icono pequeño, con ese mismo texto al pasar por encima, al final de las filas de tu estrategia y de las tres copias del panel. La leyenda de debajo del gráfico queda solo con nombres y colores.
- **Cuatro vistas** en el selector: «Tu estrategia» (tus marcas, tu zona y una columna en la tabla) y cada copia (además, sus ● y ○ y dos columnas). El título cambia con la vista.
- **La leyenda de arriba filtra**: cada elemento enciende o apaga su capa; apagado, atenuado y tachado. Se mantiene al cambiar de vista y se recuerda en el navegador (`builder_azar_velas_capas`, con try/catch). En «Tu estrategia» no salen los de la copia.
- **La zona «dentro»**, en un color sólido apenas más claro que el fondo (`#182431` sobre `#161f29`), en vez de azul transparente al 0,09. Con muchas velas en pantalla las barras del histograma se solapan: con transparencia su color se suma, y por eso tapaba más de lo que dice su opacidad. Sólido se ve igual con cualquier zoom.
- **Escala**: logarítmica por defecto, con «Log / Normal» junto a «Rueda: zoom · arrastrar: moverse». No se recuerda: cada vez que se abre, Log. El −25 salía de los márgenes que lightweight-charts añade por debajo; en Normal, `rangoNormal` da el rango de las velas con un 8 % de aire, sin márgenes y sin bajar de 0.
- **La tabla** ocupa todo el ancho, con el mismo alto.
- **La etiqueta del gráfico**: «La típica (mediana) 44.332 €» cuando las dos acaban en el mismo importe redondeado, que con 1.000 copias es siempre (la típica es la copia 500 y el percentil 50 también). Si no coincidieran, salen las dos. La línea gris de la mediana sigue dibujada.
- **El periodo entero al abrir, también en ventana estrecha**: `minBarSpacing` de 0,5 (lo normal en lightweight-charts) a 0,1. Antes, por debajo de unos 1.300 píxeles no cabía y en 1.024 arrancaba en 2019.
- Comprobado: `azar-graficos.js` (`comunes.sh`), con un lightweight-charts de mentira que apunta lo que se le pide: cada vista, cada filtro apagado y encendido, recordar, datos guardados rotos, Log / Normal y la tabla con las cifras de EMA20. Las velas de verdad, en un navegador con una página temporal no subida.

## 66. El enlace a la tesis, con 💡

`components/TesisEnlace.js`. Sin cambios en la base. Ninguna cifra cambia.
- En la segunda línea del paso 3 y en la cabecera de los pasos 1 y 2, «Tesis: <título> ›» pasa a «💡 <título> ›», y «Tesis (N) ▾» a «💡 Tesis (N) ▾». Tooltip: «Abrir la tesis». Se comporta igual, con la misma guardia. La lista de varias tesis y la celda de «Mi trabajo» no cambian.
- Como el tooltip ya no lleva el título, un título muy largo cortado con «…» (más de 280 px) no se puede leer entero desde el enlace.
- Comprobado: `tesis-enlaces.js`, montado, con 0, 1 y varias tesis en los tres pasos. El resto del encargo (la línea de «Relacionado» y el contador), en `docs/tesis.md`.

## 67. Paso 2 · velas: el «?» de cómo nacen las copias

`components/BuilderAzarVelas.js`, `components/BuilderAyuda.js`, `lib/azarGraficos.js` y `lib/azarReglas.js`. Sin cambios en la base. Ninguna cifra cambia.
- **Un «?» junto al título** de las velas a pantalla completa explica por qué la copia no hace las mismas operaciones: solo copia la forma de vender; compra al azar con tu misma frecuencia.
- **El ejemplo sale de la prueba y la vista abiertas** (`cifrasEjemplo`); en «Tu estrategia», de la típica. `operacionesDelPeriodo` ya calculaba las velas fuera (`libres`, con las que se saca la tasa) y ahora las devuelve; `vistaPestana` las pasa a la pantalla. Una operación empezada antes del periodo también ocupa velas: por eso no se cuentan aparte, y X es la tasa guardada de la prueba. Las velas fuera de la copia se cuentan igual: la vela de compra cuenta como fuera, porque en ella se sorteó.
- **EMA20, típica, 2016–2025**: 909 velas fuera y 123 compras → 13,5 %; la copia, 780 velas → ≈ 106 compras; le salieron 103. B sale de la tasa sin redondear (105,54): con el 13,5 % de la pantalla, la cuenta da 105,3.
- **Dos arreglos para que el «?» sirva en esta pantalla**: `Ayuda` admite `zIndice` (la ventana iba con 1000 y las velas con 2500: quedaba debajo; los demás «?» siguen con 1000), y con el «?» abierto, Esc cierra solo el «?», no las velas.
- Comprobado: `azar-graficos.js` (`comunes.sh`), montado en las cuatro vistas: el texto entero, las cifras, las velas fuera contadas una a una, la tasa guardada de los dos periodos y Esc. En un navegador con una página temporal no subida: el «?» por encima del gráfico y Esc.

## 68. Textos: ejemplos inventados, tooltip del 💡, aviso del paso 1, aviso de plan y cuenta de las velas

`components/BuilderCodigo.js`, `components/BuilderEditor.js`, `components/TesisEnlace.js`, `components/BuilderAzarVelas.js`, `lib/builder/enlaces.js`, `lib/builder/misListas.js`, `lib/builder/ayuda.js`, `lib/builder/planPantalla.js`, `lib/builder/planesGuardados.js` y `lib/tesis.js`. Sin cambios en la base. Ninguna cifra cambia. Corrige lo dicho en §64 sobre el aviso de los planes y en §66 sobre el tooltip.
- **Ejemplos de los «?»**: los nombres que parecían de estrategias, planes o tesis guardados pasan a «Cruce de medias 50/200», «Cruce de medias con 10.000 €», «Plan · Cruce de medias / oro», «Sigue la tendencia» y «Empresas con poca deuda». Ninguno existe en la base.
- **Se quedan a propósito**: los indicadores y sus números («SuperTrend (10, 3)», «EMA20 y luego EMA30» en la ayuda del aviso de plan: describen la regla, no un nombre guardado) y las plantillas reales de los editores («1 V50 EMA10/11», «23 EMA20 breakouts»). De la ficha del stop (`lib/builder/tarjetas.js`) se quita «Es la salida de la 1 V50». Tampoco cambian las cifras de los ejemplos, aunque algunas vengan de pruebas reales.
- **Tooltip del 💡** con una sola tesis: «Abrir la tesis «<título completo>»». Con varias sigue «Abrir la tesis»: no hay un título.
- **Aviso del paso 1**: «la prueba contra el azar (paso 2) no lo puede usar», sin laboratorios.
- **Aviso de plan**: `comparaEstrategia` compara la regla (`reglaDeFoto`, sin nombre ni descripción), como «Mi trabajo» y las pruebas. Si alguna de las dos no tiene regla que comparar, usa la huella de siempre. No toca las copias guardadas: tras renombrar, el plan conserva el nombre antiguo en su copia, sin aviso.
- **«?» de las velas**: el «≈» se calcula con el porcentaje tal como se muestra. En la típica de EMA20: 780 × 13,5 % ≈ 105 (antes 106; §67). La frecuencia de la prueba no cambia.
- Comprobado: `version-paso2.js`, `tesis-enlaces.js` y `azar-graficos.js` (`comunes.sh`); `comparaEstrategia` con los planes 4, 6 y 7 reales de la copia de seguridad (sin aviso, renombrada sin aviso, otra regla con aviso); y los tres planes recalculados con sus precios, en solo lectura.

## 69. El catálogo, solo con condiciones

`components/BuilderEditor.js`, `lib/builder/tarjetas.js`, `scripts/comprobaciones/catalogo.js`. Sustituye a lo que dicen §21, §«Piezas nuevas» y demás sobre las piezas del catálogo.

- **Fuera del catálogo**: el apartado «Piezas de compra y de stop» (orden en el nivel de ruptura, stop fijo por ATR, stop en el mínimo de la vela que cierra bajo la EMA, stop en el mínimo de N velas) y las piezas de los grupos: Swings (orden en el último máximo de swing, orden en la línea de tendencia bajista, stop bajo el último mínimo de swing) y SuperTrend (stop en su línea). No eran condiciones, el buscador no las encontraba y además las escondía al escribir. Las ocho están en los desplegables de «Cómo compro» y de «Stop de pérdidas»: el «+» llamaba a las mismas funciones (`ponModoOrden`, `anadeStopDef`). Fuera `aplicaPieza` y los campos `grupo` y `donde` de `PIEZAS`, que se queda con las explicaciones largas.
- **Un caso que se pierde**: con una orden que solo se ve en el Editor clásico (`leeOrden` con `ok: false`) no sale el desplegable; el «+» de una orden la cambiaba desde el paso 1. Ahora se cambia en el Editor clásico, como ya decía la tarjeta.
- **«?» de las opciones**: junto al desplegable de «Cómo compro» (`TIPOS_ORDEN`, nuevo: 6 opciones) y junto al título «Stop de pérdidas» (`TIPOS_STOP` con su `linea`: 10 opciones; un solo «?» porque hay tres desplegables de stop, y así se ve con stop o sin él). Cada opción: nombre, una línea y un ejemplo. Son elementos fijos del módulo, porque `Ayuda` vuelve a medirse si cambia `texto`.
- **«?» de lo ya elegido**: se quedan los que había (swing, línea bajista, SuperTrend, stop del SuperTrend, stop de la EMA) y se añaden los que solo vivían en el catálogo: orden de ruptura, stop fijo por ATR, stop en el mínimo de N velas y stop bajo el mínimo de swing. El texto del antiguo «?» de «Cómo compro», que solo hablaba de la orden en el máximo, pasa al «?» de esa opción.
- Ninguna cifra cambia: el motor no se toca y las definiciones guardadas tampoco.
- Comprobado: `catalogo.js` (`comunes.sh`), montado con estado y efectos: con todos los grupos abiertos, solo condiciones; cada pieza se elige en su desplegable y tiene su «?»; los «?» de opciones se abren con todas; buscar «swing» encuentra sus condiciones.

## 70. Mi trabajo: una sola lista

`components/BuilderPanel.js`, `lib/builder/misListas.js`, `scripts/comprobaciones/planes-montaje.js`. Sustituye a los filtros «De tarjetas» y «De código» de §59.

- **Una sola lista**: primero las de tarjetas (por nombre) y debajo las de código (en el orden de siempre); ese orden ya lo daba `construyeMisEstrategias`. Fuera `FILTROS_ESTRATEGIAS`, `filtraEstrategias`, el estado `filtro` y `filtroInicial`.
- **El buscador**, dentro de la tarjeta de la lista, donde estaban las pestañas, y sobre todas: antes solo enseñaba lo de la pestaña activa. Sigue contando «3 de 84» junto al título.
- **Icono `</>`**, solo en las de código, delante del nombre (para que no lo corte el «…»), con tooltip y explicado en el «?» de la lista. Cuando no quede ninguna de código, ni el icono ni la nota de abajo salen, sin tocar nada.
- Ninguna cifra cambia: solo pantalla.
- Comprobado: `planes-montaje.js` (`comunes.sh`), montado con estado y efectos: las 5 filas sin pestañas, la de código la última y con su icono, el buscador encuentra las dos clases, la ✕ limpia, y duplicar y borrar siguen igual.

## 71. Paso 1: «Comprar y mantener» paga su comisión

`lib/builder/ensayo.js` (`buyHoldConComisiones`), `components/BuilderSenales.js`, `scripts/comprobaciones/sinteticas.js`. Norma de cierre al final: con comisión, la estrategia la pagaba y su Buy&Hold no.

- **El cálculo**: compra el primer día y venta el último, con `comisionDe`. Ejemplo: 10.000 € que se duplican con 0,1 %: compra 10 €, quedan 9.990 €, suben a 19.980 €, venta 19,98 € → 19.960,02 €. Cambian el CAGR, la curva y la peor caída de «Comprar y mantener» en el paso 1. Sin comisión, nada cambia.
- **Solo en el paso 1**, decidido por Sergi (04/11): `nucleoBacktest.js` no se toca, así que «Backtest de un valor», el optimizador y los rankings siguen con su Buy&Hold sin comisión. El «?» de las cifras dice esa diferencia.
- **Cifras** (AAPL, 10.000 €, final y CAGR, antes → después). Con 0,36 € por compra: 2010–2015 34.429,23 → 34.427,99 € y 22,934 → 22,933 %; 2021–2025 21.007,65 → 21.006,89 € y 16,045 → 16,044 %; 2016–2025 103.221,64 → 103.217,92 € y 26,321 → 26,320 %. Con 0,1 %: 34.360,41 € y 22,893 %; 20.965,65 € y 15,998 %; 103.015,30 € y 26,295 %. La peor caída y las cifras de la estrategia, iguales.
- Comprobado: `sinteticas.js` (`comunes.sh`), calculado a mano con 0,1 %, con 0,36 € y sin comisión, y `cifrasRegla` montado con velas sintéticas.

## 72. Paso 1: la guardia de cambios sin guardar, en todas las salidas

`components/BuilderEditor.js`, `components/BuilderPanel.js`, `scripts/comprobaciones/version-paso2.js`. Completa §63, que solo preguntaba al ir a una tesis.

- **Preguntan ahora**: el menú, el logo y «Salir» (el ref `salida` de la página, el mismo que usa el paso 3), «Builder» y «Mi trabajo» de la ruta de arriba, y los pasos 2 y 3 de arriba. La misma ventana: «Guardar / Salir sin guardar / Cancelar». Sin cambios, no pregunta.
- **Si se pregunta con la guía abierta**, se cierra la guía: la ventana se pinta en la pantalla de las tarjetas.
- **Tras «Guardar» desde los pasos**, se sigue con la estrategia guardada (`guardada`), que puede ser la «· versión 2» y no la original. Guardar remonta el editor (`key={editor.n}`), por eso va en un ref que se rellena al guardar.
- Sin tocar: «Guardar y pasar al paso 2» (ya guarda) y el enlace al Editor clásico (se lleva lo escrito). Cerrar la pestaña del navegador sigue sin preguntar.
- Ninguna cifra cambia.
- Comprobado: `version-paso2.js` (`comunes.sh`), montado con el Builder de verdad: sin cambios no pregunta; con cambios, Cancelar, Salir sin guardar y Guardar desde el ref `salida`, la ruta y los pasos; `salida` queda libre al cerrar.

## 73. Laboratorio de cartera: la venta final cuenta en las órdenes

> La pantalla se eliminó después (§74); el cambio del motor (`lib/laboratorioCartera.js`) sigue.

`lib/laboratorioCartera.js`, `scripts/comprobaciones/cartera.js`. Vocabulario: «órdenes» son todas las compras y ventas, incluida la venta final.

- **La tabla «Costes por operación»** (cálculo 2 con costes): «Operaciones (órdenes)» y «Coste pagado» no contaban la venta final, aunque el valor neto sí la descontaba. Ahora la cuentan. El CAGR, la curva y el valor final neto no cambian.
- **Cifras** (CARTERA_1 V1, ETF sintético, horquilla 0,05 %, sin comisión; antes → después). 2008–2015: 217 → 218 órdenes, 453,29 → 463,08 €. 2016–2020: 83 → 84, 342,54 → 356,92 €. 2021–2025: 119 → 120, 246,51 → 253,85 €. 2008–2025: 417 → 418, 2.438,41 → 2.479,06 €. Valor final neto, igual (17.543,39 €, 24.043,93 €, 13.775,81 € y 57.568,13 €).
- **Sin efecto en lo guardado**: ninguna de las 45 pruebas guardadas tiene esa tabla, y CARTERA_1–3 y las exploraciones salen idénticas byte a byte.
- **Queda igual**: esa tabla sale de la simulación sin impuestos; las ventas para pagar impuestos del cálculo 2 no están en ella.
- Comprobado: `cartera.js` (`comunes.sh`), a mano con 100 % QQQ y horquilla del 0,1 %: dos órdenes y su coste.

## 74. Fuera «Carteras QQQ + ETF con apalancamiento»

Decisión de Sergi (05/11/2026): fue una prueba aislada para ver cómo funcionaría la app, no una herramienta. Se elimina, no se archiva. Ninguna cifra cambia.

- **Se borra**: la pantalla (`components/CarteraPanel.js`) y su entrada 💼 del menú; el modo «Cartera (QQQ + ETF)» del Editor (`components/EditorCartera.js`: solo servía para ella); `lib/exploracionCartera.js`; en `lib/lotesLab.js`, CARTERA_1–3, sus huellas, las exploraciones, los criterios 5–7 y sus veredictos; en `lib/exportaTexto.js`, sus textos de «Copiar para Claude»; en `lib/calibracionLab.json`, las claves CARTERA_1 y CARTERA_3; en `pages/api/laboratorio.js`, sus dos ramas (cartera y exploración); `scripts/calibracionCartera.js`, `scripts/calibracionCartera3.js` y `scripts/comprobaciones/cartera.js` (con su paso en `comunes.sh`).
- **Filas de la base**: las 17 de `lab_pruebas` (CARTERA_1: 4, CARTERA_2: 2, CARTERA_3: 8 y 3 exploraciones: curva de riesgo, estrés y mapa de la media; ids 138–141, 164–166, 188, 211–219). Quedan las 28 del Laboratorio (LOTE_1–3). Ninguna otra tabla tenía filas suyas. Copia entera en `backups/carteras_eliminadas_20261105.json` (fuera de git), con la instrucción de REVERSIÓN: volver a insertarlas con sus ids (`OVERRIDING SYSTEM VALUE`, `jsonb_populate_recordset`) por la Management API.
- **El «204 pruebas registradas»** de su pantalla no era otra tabla: el contador (`cuentaPruebas`, `lib/registroLab.js`) cuenta cada exploración como tantas pruebas como combinaciones tiene: 45 filas − 3 + (44 + 22 + 96) = 204.
- **Se queda** (lo usan los planes u otras pantallas): `lib/laboratorioCartera.js` entero (el motor del paso 3: precios con dividendos, condiciones, reglas; no se poda para no arriesgar cifras), `lib/etfSintetico.js`, `lib/etfSinteticos.json`, `lib/dividendosCartera.json` y sus scripts, `reglaMezcla` (la alternativa «Lo mismo a 50 % QQQ + 50 % ETF» del paso 3), la pieza «cartera» del motor de planes, y `esConfigCartera` / `esConfigExploracion` (el Laboratorio los usa para apartar esas filas de su historial). Nada del multiactivo (`AzarCarteraPanel`, `azarCartera`, `prioridadCartera`, `asignaCartera`).
- **`planes-estrategia.js`** tomaba la regla de su pieza de cartera de CARTERA_3 (F1); ahora la construye con `reglaFiltro(50, 'diario', 'apalancado')` del motor: JSON idéntico.
- **Comprobado**: los planes 4, 6 y 7 recalculados con los datos reales, antes y después: 197.917,32 €, 75.122,81 € y 64.625,48 € (CAGR 24,55 %, 22,37 % y 20,54 %), con la evaluación entera idéntica (md5). El Laboratorio, con sus 28 pruebas guardadas, antes (HEAD) y ahora: veredicto, criterio, regla, texto de «Copiar para Claude», validación de la petición, huellas y calibración de LOTE_1–3 idénticos. `comunes.sh` entero en verde (incluida la prueba EMA20 del paso 2).

## 75. Fuera el Laboratorio (y el modo «Lotes» del Editor)

Decisión de Sergi (05/11/2026): como Carteras (§74), era una prueba aislada; se elimina, no se archiva. La idea (explorar ingredientes en masa con registro de todo lo probado) volverá como «Explorar ingredientes» dentro de Estrategias, sobre el catálogo de las tarjetas. Ninguna cifra cambia.

- **Se borra**: la pantalla (`components/LaboratorioPanel.js`) y su entrada 🧪 del menú; el modo «Lotes» del Editor (`components/EditorLotes.js`: vacío, `editor_lotes` sin filas, y solo servía al sistema antiguo de pruebas); el Editor se queda con un solo modo y sin barra de pestañas (y sin `editorAbrir` en `pages/index.js`). El motor: `lib/laboratorio.js`, `lib/laboratorioSalidas.js`, `lib/laboratorioEstrategias.js`, `lib/editor/laboratorio.js`, `lib/senales.js` (su catálogo de señales) y `lib/calibracionLab.json`. `pages/api/laboratorio.js` entera. En `lib/lotesLab.js`, LOTE_1–3, sus huellas, los criterios 1–4, los veredictos y la clasificación oficial / exploratoria; en `lib/registroLab.js`, guardar, listar, leer y contar pruebas; en `lib/exportaTexto.js`, los textos del Laboratorio y de los lotes del editor. `scripts/calibracionLab.js` y `scripts/comprobaciones/lotes.js` (con su paso en `comunes.sh`).
- **Filas de la base**: las 28 de `lab_pruebas` (LOTE_1: 10, LOTE_2: 6, LOTE_3: 12; ids 27–36, 58–63, 105–116). La tabla queda vacía, pero se queda: la usa la ejecución de un lote de planes. Copia entera en `backups/laboratorio_eliminado_20261105.json` (fuera de git), con la instrucción de REVERSIÓN (volver a insertarlas con sus ids, `OVERRIDING SYSTEM VALUE`, por la Management API).
- **Se queda** (lo usan los pasos 1–3 u otras pantallas): de `lib/lotesLab.js`, `jsonCanonico`, `sha256Hex` y `huella` copiadas carácter a carácter (las huellas de las pruebas del paso 2, las estrategias y los planes) y `reglaMezcla` (la alternativa 50/50 del paso 3); `/api/planes-lote` (lotes de planes, sin pantalla) con lo mínimo: `filaDePrueba`, `clasificaConfig` (siempre exploratoria: ya no hay lotes oficiales) y `validaConfig` (solo `planLote`); `lib/editor/lotes.js` (los periodos por defecto del paso 1 y las huellas antiguas que vigila `huellas.js`); Optimización y Backtesting con su azar y sus textos de «Copiar para Claude». `lib/laboratorioCartera.js` tomaba `media` de `lib/senales.js`, que solo la reexportaba de `lib/condiciones/indicadores.js`: ahora la importa de allí (la misma función).
- **Comprobado**: los planes 4, 6 y 7 con los datos reales, antes y después: 197.917,32 €, 75.122,81 € y 64.625,48 € (CAGR 24,55 %, 22,37 % y 20,54 %), evaluación entera idéntica (md5). La prueba EMA20 del paso 2 re-ejecutada, leída aparte: 99,2 % (2016–2020) y 11,3 % (2021–2025), «No pasa», idéntica a la congelada y a la guardada en la base. La fila de un lote de planes, las huellas y `reglaMezcla`, antes (HEAD) y ahora: idénticas. `comunes.sh` entero en verde.

## 76. El plan con lista, fase 1: el panel izquierdo del Backtesting, en piezas

Primera fase de la opción C (el plan con las pestañas «Tu dinero» / «La cartera por dentro»; decidida con Sergi el 05/11/2026). Sacar a piezas propias los elementos 2–14 del panel izquierdo del Backtesting, para poder ponerlos después en el bloque de un plan, **sin cambiar nada**: ni lo que se ve ni lo que se calcula. El Backtesting sigue en «Por trasladar» y funciona igual.

- **Ya eran piezas** (se usan tal cual): Condiciones de la simulación (elemento 2, `components/CondicionesSimulacion.js`) y los filtros de mercado y del activo (3 y 4, `components/FiltrosPanel.js`).
- **Piezas nuevas**, en `components/backtesting/`, con el bloque de `pages/index.js` copiado TAL CUAL (solo cambia la sangría; el estado sigue en `pages/index.js` y llega por props con el mismo nombre que tenía): `PanelAsignacion.js` (5–10: modo de asignación, máx. activos, criterio de entrada, Desempate / Filtro y su umbral, cálculo de la prioridad, Risk management), `PanelEstrategias.js` (11), `PanelPesos.js` (12), `PanelUniverso.js` (13) y `SelectorValores.js` (14). El elemento 1 (el botón «Ejecutar» y su barra de progreso) se queda en `pages/index.js`: en el plan será «Calcular el plan».
- `STRAT_COMPARE_COLORS` (los colores de cada estrategia) pasa de `pages/index.js` a `lib/coloresCifras.js`, con los mismos valores y orden: lo usan las dos.
- **Comprobaciones nuevas** en `scripts/comprobaciones/`: `backtesting-panel.js` (en `comunes.sh`) monta cada pieza con renderToString en 400 estados al azar (semilla fija), en la versión anterior y en la de ahora, y exige el mismo HTML byte a byte; además pulsa todos sus controles (DOM mínimo) y exige las mismas llamadas a los «set…» con los mismos valores. Si la versión anterior aún no tiene las piezas, compara con el bloque de `pages/index.js` de esa versión. `ref-backtesting.js` (aparte: lee los precios REALES de la base, solo lectura) calcula R1–R3 y las compara con las fijadas el 05/11 (antes era `backups/fase0-referencias/refMC.js`).
- **Comprobado**: las 5 piezas, 2.000 montajes idénticos a los bloques de V9.1136 y 1.559 pulsaciones con el mismo resultado; con un error metido a propósito (un botón que graba otro valor; un texto cambiado) la comprobación falla, como debe. Cada dato que `pages/index.js` pasa a las piezas existe en ese sitio (análisis de ámbitos con Babel) y el archivo no usa ninguna variable sin declarar nueva. R1–R3 con los precios reales: 38.435,90 €, 62.992,32 € y 21.769,29 €, Max DD −24,43 %, −32,12 % y −20,01 %, 1.859, 234 y 1.316 operaciones, respuesta entera idéntica (md5) a la de antes. `comunes.sh` entero en verde (batería 52/52 byte a byte).

## 77. Backtesting: «Todos» del selector de valores añade, no cambia

Fallo antiguo que vio Sergi (06/11/2026): marcaba los valores de una lista con «Todos», elegía otra lista, pulsaba «Todos» otra vez y los de la primera se desmarcaban, porque «Todos» CAMBIABA la selección por los valores que se ven. Ahora los AÑADE (`components/backtesting/SelectorValores.js`): los marcados que no se ven quedan delante y luego van los que se ven, en su orden. Si todos los marcados se ven (el caso de siempre: una sola lista), el resultado es exactamente el de antes, también en el orden. «Ninguno» sigue quitando todos, también los que no se ven; marcar y desmarcar uno a uno no cambia.

- **Comprobado** (`backtesting-panel.js`): a mano, con AAPL y NVDA marcados y la lista «Tecnológicas» (se ven MA, MSFT y TSLA), «Todos» deja AAPL, NVDA, MSFT, TSLA y MA (antes solo MSFT, TSLA y MA). Las 5 piezas pintan igual que antes en 2.000 estados y todas las demás pulsaciones graban lo mismo: el único cambio aceptado es el de «Todos» (la comprobación lo aplica a la versión anterior solo mientras esta no lo tenga). Las cifras no cambian: el cálculo no se toca.

## 78. El plan con lista, fase 2: los resultados del Backtesting, en una pieza («La cartera por dentro»)

Segunda fase de la opción C. Los resultados del Backtesting (elementos 15 y 17–29 del inventario: cabecera resumen, «Comparativa de estrategias», equity con sus vistas y series, «Después de impuestos», detalle de un valor, ganancias mensuales, capital empleado, resultados por operación, historial, Gantt, la prueba contra el azar de la cartera, «Vista de gráficos» y «Copiar para Claude») pasan de `pages/index.js` a `components/backtesting/CarteraPorDentro.js`, que será la pestaña «La cartera por dentro» del plan. **Nada cambia**: ni lo que se ve ni lo que se calcula. El elemento 16 (el aviso «Probando … de la Optimización») se queda en `pages/index.js`: sigue en Backtesting.

- **Cómo**: el bloque (unas 1.440 líneas) se copió TAL CUAL (solo cambia la sangría). Lo que `pages/index.js` importaba se importa igual en la pieza (13 importaciones); lo demás (el estado, los cálculos, las referencias de los gráficos y las constantes de `pages/index.js`: 150 en total) llega por props con el mismo nombre. Dentro no hay hooks, así que la pieza no guarda nada propio. Que la pieza reciba solo el resultado y calcule ella lo suyo es trabajo de las fases 3–4, cuando el plan la use.
- **Comprobación nueva** `backtesting-resultados.js` (en `comunes.sh`): compila con el SWC de Next lo que pinta la pieza, en la versión anterior y en la de ahora, y exige el mismo código carácter a carácter (sin sangría ni comentarios). Si la versión anterior aún no tiene la pieza, compara con el bloque de `pages/index.js` de esa versión. Un cambio querido en esta pantalla la hará fallar a propósito: se explica y se acepta en el script.
- **Comprobado**: el código compilado, idéntico (64.047 caracteres); con un texto de la pantalla cambiado a propósito, la comprobación falla (un cambio en un comentario, no). Cada prop existe en su sitio de `pages/index.js` (ámbitos con Babel) y ni `pages/index.js` ni la pieza usan variables sin declarar nuevas. Build bien. R1–R3 con los precios reales: idénticas. `comunes.sh` entero en verde.
- `tesis.js` contaba los sitios de `pages/index.js` que cambian de pestaña (17, revisados para que ninguno saque de Tesis sin preguntar): dos («↗» a la Watchlist en la tabla del Backtesting) se fueron con la pieza, así que ahora cuenta `pages/index.js` y `CarteraPorDentro.js` juntos. Siguen siendo 17 y los mismos.

## 79. «Resultados por operación»: las barras, también con muchas operaciones

Fallo antiguo visto al revisar la fase 2 (06/11/2026): con muchas operaciones las barras de «Resultados por operación» no se veían. Con 384 operaciones en 662 px, el hueco fijo de 3 px entre barras (`styles/globals.css`) ocupaba 383 × 3 = 1.149 px, más que todo el ancho, y cada barra se quedaba en 0 px. Ahora el hueco lo da `huecoBarras(n)` (`lib/utils.js`): 3 px mientras quepan y, si no, el que deja al menos 1 px por barra: `max(0px, min(3px, (100% − n px) / (n − 1)))`.

- **Ejemplo** (cuadra con calculadora): 384 operaciones en 662 px → hueco (662 − 384) / 383 = 0,726 px y barra de 1 px. Con 40 operaciones, (662 − 40) / 39 = 15,9 px, así que manda el tope de 3 px y la barra queda en (662 − 39 × 3) / 40 = 13,6 px: igual que antes. Con pocas operaciones nada cambia.
- **Dónde**: en los tres sitios con estas barras: «Backtest de un valor» (`pages/index.js`) y, en el Backtesting, la de cada estrategia («Comparar todas») y la de la estrategia sola (`components/backtesting/CarteraPorDentro.js`). Ninguna cifra cambia: solo es el dibujo.
- **Comprobado**: `backtesting-resultados.js` acepta solo este cambio frente a la versión anterior (un número distinto en `huecoBarras` la hace fallar); `comunes.sh` en verde; en la app, con 384 operaciones, las barras tienen ancho y se ven.

## 80. El plan con lista, fase 3: «Una lista» en el bloque del plan

Primera fase que cambia la pantalla del paso 3 (boceto `bocetos/plan-con-lista-C.html`, Imagen 1, columna izquierda). En «Dónde se aplica» ya se puede elegir **Una lista**: salen las piezas del panel izquierdo del Backtesting TAL CUAL (§76), con su letra y sus colores, dentro del Bloque 1: Universo y selector de valores (13–14), «Reparto dentro de la lista» (5–10 y 12) y «Filtros» del mercado y del activo (3–4). Cada uno con su «?».

- **Se guarda con el plan**, no en el navegador (decisión del 06/11): la pieza «estrategia» lleva `donde: 'lista'` y `lista: { universo, simbolos, modo, maxPosiciones, prioridad, criterioUso, momentumN, rsWindow, calculoPrioridad, rsGateThr, momGateThr, proxGateThr, riskPerTrade, maxPortfolioPct, maxAccumRisk, assumedStopPct, pesos, filtros }` (`lib/planes/lista.js`, `mergeLista`: cada campo saneado por su cuenta con los mismos valores admitidos del Backtesting). Los valores de partida, los de una instalación nueva del Backtesting (Capital concentrado, máx. 4, Alfabético, Filtro), salvo los **filtros, que empiezan sin ninguno**. Lo que es solo de la vista (buscar, ★, la lista de la Watchlist, qué está desplegado) no se guarda.
- **Un plan de «Una acción» es el de siempre**: sin `donde` ni `lista`. Los planes 4, 6 y 7 van y vuelven idénticos (md5 56702d71…, ad213628…, ee42ea5b…, antes y después).
- **El reparto, un solo modo**: `PanelAsignacion` tiene la opción `unSoloModo` (botones, como con varias estrategias); sin ella, igual que siempre (`backtesting-panel.js`: 2.000 montajes idénticos).
- **Sin cálculo todavía**: con lista, «Tu dinero» no se calcula (fase 6). La pantalla no pide nada a `/api/plan` y lo dice en una línea; el motor (`ejecutaPlan`) y `/api/plan` lo rechazan con el mismo aviso. La pestaña «La cartera por dentro» llega en la fase 4.
- **La prueba del paso 2 con lista** (decisión de Sergi, 06/11): «✓ Pasa en AAPL · la lista aún no tiene prueba» en amarillo (o «✕ No pasa en …», «Sin prueba · …»), con su «?». Ninguna prueba actual condiciona el diseño: son pruebas para crear la app y se borrarán.
- **Validación**: con la lista manual, al menos un valor (si no, no se puede guardar); con el Nasdaq-100, solo «Capital concentrado».
- El selector usa la Watchlist de la app: `pages/index.js` pasa `datosListaPlan` (watchlist, listas y ranking) al Builder y este al paso 3.
- **Comprobado**: `plan-lista.js` (nuevo, en `comunes.sh`): valores de partida y saneado; planDe de «Una acción» idéntico a la versión anterior en 300 ajustes al azar; ida y vuelta de un plan con lista; el motor lo rechaza; la pantalla con y sin lista (renderToString) y montada con estado (pulsar «Una lista», marcar valores, elegir modo, volver a «Una acción» y recalcular, volver a la lista y seguir con sus valores). Visto en el navegador en local. `comunes.sh` en verde.

## 81. «Una lista»: el desplegable de los filtros, entero y fácil de ver

Lo vio Sergi al revisar la fase 3 (06/11/2026): en el bloque del plan, el desplegable de «añadir filtro» salía cortado (la caja oscura de las piezas, `.bp-mc`, recorta lo que sobresale) y el botón «+ ▾» era tan pequeño que no se entendía.

- La caja de los filtros del bloque ya no recorta (`overflow: visible`): el desplegable sale entero por debajo.
- `FiltrosPanel` tiene la opción `botonGrande`: «+ Añadir filtro ▾», en letra de 12 y en azul. Solo la usa el bloque del plan, donde hay sitio. En el Backtesting y en «Backtest de un valor» sigue «+ ▾» (su barra lateral de 240 px no tiene sitio para más: ver el comentario del componente).
- **Comprobado**: `plan-lista.js` (los dos botones con el texto nuevo y la caja sin recortar); en el navegador, el desplegable con sus 4 filtros entero; `comunes.sh` en verde.

## 82. El plan con lista, fase 4 (parte 1): el estado y los cálculos de los resultados, en un hook

Para que el plan pueda enseñar «La cartera por dentro» con SU resultado, lo que la pieza `CarteraPorDentro` necesita (§78) ya no puede vivir solo en `pages/index.js`. Esta parte lo saca, **sin cambiar nada**: ni lo que se ve ni lo que se calcula.

- **`components/backtesting/useCarteraPorDentro.js`**: 86 sentencias de `pages/index.js` copiadas TAL CUAL y en el mismo orden: el estado de la vista de resultados (qué series se ven, estrategia y activo seleccionados, pantalla completa, alto del equity y referencias de los gráficos, Gantt…), sus cálculos (`mcDisplayResults`, `mcHistSel`, curvas del modo Activos, panel del activo, «Después de impuestos», `mcRefEquity`…) y sus 5 efectos. Recibe 15 entradas (el resultado `mcResult` / `mcMultiResults` y los ajustes con los que se calculó: capital, periodo, intervalo, comisiones, filtros, estrategias) y devuelve 111 nombres, los mismos que tenían. `pages/index.js` lo llama en el sitio de la última de esas sentencias.
- **`components/backtesting/comun.js`**: 12 piezas sueltas de `pages/index.js` que usan los dos (colores de las series del modo Activos, `MC_TODAS`, `saneaCurva`, `capitalDeRespuesta`, `nombreIndicador`, `mcVisibleActivo`, `apiFetch`), tal cual, con «export» delante.
- **Se quedan en `pages/index.js`**: el estado del panel izquierdo (lo que se pide), `mcResult` y `mcMultiResults`, y los dos efectos del autoajuste del alto del equity (dependen de la pestaña y de «calculando…»; el plan tendrá los suyos en la parte siguiente).
- **Comprobación nueva** `backtesting-hook.js` (en `comunes.sh`): vuelve a meter el cuerpo del hook en `pages/index.js`, en el sitio de la llamada, y exige que el resultado sea la versión anterior con esas mismas sentencias llevadas a ese sitio, en el mismo orden (código compacto sin comentarios, sentencia a sentencia); que ningún efecto cambie de orden frente a los del hook (React los ejecuta en el orden en que se declaran); que nada lea en el render, antes de la llamada, un nombre del hook; que el resto de `pages/index.js` y lo de `comun.js` sean idénticos; y que no aparezca ningún nombre sin declarar. Con un número cambiado dentro del hook, o un efecto nuevo delante de la llamada, falla; con un comentario cambiado, no.
- **Comprobado**: `backtesting-hook.js` idéntico (113 sentencias de `pages/index.js` cambian de lado respecto al hook, ninguna es un efecto); `backtesting-resultados.js` idéntico (la pieza no se tocó); build bien; `comunes.sh` en verde.

## 83. El plan con lista, fase 4 (parte 2): la petición a /api/multibacktest, en una librería

Para que «La cartera por dentro» del plan pida EXACTAMENTE lo mismo que el Backtesting con los mismos ajustes (y la fase 4 dé cifras idénticas), la forma de armar la petición sale de `runBacktesting` (`pages/index.js`) a **`lib/peticionMc.js`**, tal cual. **Nada cambia**: la petición es la misma, carácter a carácter.

- `pesosNormalizadosMc(modo, simbolos, pesos)`: los pesos de «Pesos personalizados» normalizados a 100 (vacío en los demás modos).
- `cfgBaseMc({...})`: el `cfg` común (parámetros del panel, capital, periodo, tipo de capital y `sizeRules` con las mismas conversiones `Number(…)` y `calculoPrioridad` solo si es 1). El `scoreMap` llega ya hecho.
- `cuerpoMc({...})`: el cuerpo de una estrategia en un modo, con las claves en su orden (`symbols, modoAsig, weights, cfg, strategyId, isNoStrategy, filtros, intervalo, comisiones`). `runBacktesting` lo usa en ese caso y le añade la prueba de la Optimización como antes; los otros caminos (varios modos, varias estrategias, Multicartera, universo dinámico) siguen con su código.
- **Comprobación nueva** `peticion-mc.js` (en `comunes.sh`): con una copia literal del código de antes, en 3.000 ajustes al azar (todos los modos, pesos raros o que suman 0, números tecleados como texto, `calculoPrioridad` 1 o 2, años o fechas, con y sin prueba de la Optimización) los pesos, el `cfg` y el cuerpo salen idénticos en JSON (9.000 comparaciones); y `pages/index.js` usa la librería en sus tres sitios. Quitando un `Number(…)` de la librería, falla.
- `backtesting-hook.js` (§82), ahora que la versión anterior ya tiene el hook, exige que el hook y `comun.js` sigan idénticos y la llamada bien puesta; el resto de `pages/index.js` puede cambiar (lo vigilan las demás).
- **Comprobado**: `peticion-mc.js` idéntico; build bien; `comunes.sh` en verde.

## 84. El plan con lista, fase 4 (parte 3): la pestaña «La cartera por dentro»

Primera vez que el plan con lista calcula algo (boceto `bocetos/plan-con-lista-C.html`, Imagen 2). Con «Una lista» en el bloque, la columna derecha tiene dos pestañas: **«Tu dinero»** (abierta al entrar; con lista sigue diciendo que llegará más adelante, fase 6) y **«La cartera por dentro»** (con su «?»): el bloque calculado como el Backtesting de siempre, con los mismos paneles. El Backtesting suelto no cambia.

- **Cómo**: `components/backtesting/PlanPorDentro.js` arma la petición con `lib/peticionMc.js` (§83), llama a `/api/multibacktest`, le pasa el resultado a `useCarteraPorDentro` (§82) y pinta `CarteraPorDentro` (§78). Nada de eso se tocó.
- **Con qué se calcula**: la lista, el reparto y los filtros del bloque (`a.lista`); el periodo y el dinero inicial de «Tu dinero» (× el 100 % del bloque: hoy hay un solo bloque); sin aportaciones; velas diarias; los parámetros del panel de «Backtest de un valor» con sus valores de partida (las estrategias de tarjetas no los usan). **Sin comisiones hasta la fase 5** (decisión de Sergi del 06/11), y lo dice una línea encima de los paneles. Con el Nasdaq-100 todavía no se calcula (solo «Lista manual»), y lo dice.
- **Cuándo**: solo con la pestaña abierta, ~1 s después del último cambio (decisión de Sergi del 06/11; `creaCalculador` con 1.000 ms). Cerrada, los cambios no piden nada; al volver, se pide lo nuevo; sin cambios, no se repite.
- **La versión guardada de la estrategia**: el motor calcula con la estrategia de ahora (por su id). Si el plan usa la versión guardada y su regla ya no es la de ahora (o está borrada), no se calcula y se dice por qué («pulsa «Usar la versión actual»»).
- **El «↗» de un valor** abre la Watchlist pasando por la misma guardia que el menú (`salirDeTesis`: con cambios sin guardar, pregunta). `tesis.js` cuenta ahora 18 sitios que cambian de pestaña.
- **El alto del gráfico**: los dos efectos del autoajuste se copiaron de `pages/index.js` a la pieza tal cual (con «pestaña abierta» en lugar de `sidePanel==='multi'`). `SUELO_EQUITY`, `ALTO_FRANJA_RENDIMIENTO`, `desplazamientoSobre` y `scrollerDe` pasaron a `comun.js` (`backtesting-hook.js` admite añadir a `comun.js` solo lo que estaba en `pages/index.js`).
- `pages/index.js` pasa al Builder también `wlData` (para el `scoreMap`, que solo cuenta con la prioridad «score»); `datosListaPlan` se declara ahora después de `wlData`.
- **Comprobación nueva** `plan-por-dentro.js` (en `comunes.sh`): la petición del plan es la del código de antes de `runBacktesting` con los mismos ajustes y sin comisiones (400 listas al azar); los motivos para no calcular; con la foto de precios de la lista Degiro (sin red) y «Prueba editor EMA20» en Capital compartido, `/api/multibacktest` responde (1.859 operaciones) y la pestaña montada pinta los paneles; en el paso 3, las pestañas y cuándo se pide. Los gráficos no se dibujan en esa comprobación (necesitan un navegador).

## 85. El plan con lista: sin «⚠ Acción elegida a mano»

- Ese aviso (y su «?») habla de elegir hoy **una acción** sabiendo cómo le fue: con «Una lista» no aplica. En `components/BuilderPlan.js` solo sale con «Una acción» (`!enLista`). Con lista, la línea de avisos queda con la prueba («✓ Pasa en AAPL · la lista aún no tiene prueba») y lo demás de siempre. Visto por Sergi en su captura de la fase 4 (07/11).
- Pendiente para cuando haya screener: un aviso equivalente para listas elegidas a mano hoy (de momento, la lista es la que pone Sergi).
- `plan-lista.js`: con «Una acción» el aviso sigue; con lista no sale; al pulsar «Una lista» se va y al volver a «Una acción» vuelve.
- **Arreglo de `backtesting-hook.js`**: su punto 4 («ningún nombre sin declarar nuevo») miraba solo el `pages/index.js` anterior. Desde §84, `getComputedStyle` (del navegador) vive en `comun.js` y no en `pages/index.js`, así que daba un FALLO falso en cualquier commit. Ahora compara con los tres archivos de la versión anterior (`pages/index.js`, `useCarteraPorDentro.js`, `comun.js`). Probado: un nombre inventado en `comun.js` sigue saliendo como fallo.

## 86. El plan con lista, fase 5: las comisiones del plan en «La cartera por dentro»

- **El motor aprende el mínimo por orden.** `lib/comisiones.js` admite un cuarto campo opcional, `minimo` (€): la parte del porcentaje de cada orden es la mayor entre `importe × % / 100` y el mínimo (`partePct`), igual que cobra el plan (`costeOrden` de `lib/planes/plan.js`). Las fijas de compra y de venta se suman aparte, como siempre. Como todo el cobro pasa por `comisionDe` y `netoDeOperacion`, lo aprenden a la vez los cuatro repartos, `buildTrades`, `rebuildCapitalTras`, el detalle de un valor y el resto.
- **Nada cambia sin mínimo.** `normalizaComisiones` solo añade `minimo` si es mayor que 0; sin él, la expresión es la de antes (mismo número en coma flotante). El Backtesting suelto, el ranking y el paso 1 no lo mandan: R1–R3 salen idénticas byte a byte (md5 antes y después, `ref-backtesting.js`).
- **`comisionesDePlan(costes)`**: los `costes` de un plan (`costesDe`) en el formato del Backtesting: % con mínimo y sin fijas. «2 € fijos por operación» es un mínimo de 2 € sin %. Sin costes, ninguna.
- **En la pestaña** (`components/backtesting/PlanPorDentro.js`): la petición y el detalle de los valores llevan las comisiones del plan. La línea dice «… con las comisiones del plan (0,10 % por operación; «Comprar y mantener», sin comisión)», o «sin comisiones (el plan no tiene)». Los Buy&Hold de aquí siguen sin comisión, como en el Backtesting (excepción temporal de Sergi).
- ~~Diferencia que queda con «Tu dinero»~~ (corregido en §89): no la hay. El plan también cobra la comisión de la compra sobre el dinero que se destina a la compra (`compra` de `lib/planes/plan.js`: `costeOrden(C)` y luego `(C − coste) / precio`), igual que el Backtesting.
- **Cifras con precios reales** (Prueba editor EMA20, Degiro, 10.000 €, 2016–2025, reparto por defecto de la lista): Capital concentrado, sin comisión 62.023,60 € → con 0,1 % 42.551,67 € (comisiones 9.527,12 €; con mínimo de 1 € igual: ninguna orden baja de 1.000 €) → con 2 € fijos 53.686,85 € (785 operaciones × 2 órdenes × 2 € = 3.140 €). Capital compartido: 39.849,58 € → 0,1 % 29.600,59 € → 0,1 % con mínimo de 1 € 29.407,28 € (en 313 de 1.859 operaciones manda el mínimo) → 2 € fijos 24.215,53 €.
- **`plan-por-dentro.js`**: la petición lleva la comisión del plan en sus cuatro formas (escritas a mano, 400 listas al azar); cuentas a mano del mínimo (500 € → 1 €, 5.000 € → 5 €; 1.000 € que suben un 10 % con 0,1 % y mínimo de 2 € → 1.095,80 €; 10.000 € → 10.978,011 €); con la foto de Degiro, la comisión de cada una de las 1.859 operaciones cuadra con la fórmula escrita a mano; las dos líneas de texto.

## 87. Selector de valores: sin «#undefined» y buscador sin acentos

- En `components/backtesting/SelectorValores.js` (Backtesting y «Una lista» del plan), el puesto del ranking solo se pinta si el valor TIENE puesto (`rd?.rank!=null`): antes, con una fila del ranking sin número, salía «#undefined».
- El buscador no distingue acentos (norma de buscadores): usa `sinTildes` de `lib/builder/buscar.js` en el símbolo, el nombre y lo escrito («telefonica» encuentra «Telefónica»). Con textos sin acentos, lo mismo que antes.
- `backtesting-panel.js`: los 400 estados al azar siguen idénticos a la versión anterior y, a mano, «telefonica» → Telefónica, «ÉLITE» → Elite Corp, y sin «#undefined» ni «#null» (AAPL #7).

## 88. Comisión del plan: se cobra en cada orden (texto)

- Decisión de Sergi (07/11): NO habrá comisión distinta de compra y de venta en el plan. Lo que se pone se cobra en CADA orden (al comprar y al vender), y lo dicen el «?» de «Comisión por operación», el «?» de «€ fijos por operación» y un tooltip en su campo: si el bróker cobra 0,37 € solo al comprar, se pone 0,185 € (0,185 + 0,185 = 0,37 €).
- `textoComision` (la línea de «La cartera por dentro» y el texto para copiar del plan) muestra 3 decimales si el número los tiene («0,185 € fijos por operación»); con 2 o menos, igual que antes.
- Nada cambia en las cifras: solo textos.

## 89. El plan con lista, fase 6: «Tu dinero» con lista (la prueba de oro)

- **Qué hace.** Con «Una lista», la pestaña «Tu dinero» ya calcula. De momento, sin aportaciones, sin impuestos, con el dinero ocioso en liquidez, sin apalancar y solo con «Capital compartido» o «Capital concentrado». Así acaba con EXACTAMENTE el dinero de «La cartera por dentro»: es la prueba de oro de la fase 6.
- **El motor** (`lib/planes/plan.js`): la pieza estrategia con `donde: 'lista'` toma del Backtesting solo las DECISIONES y pone el dinero con la lógica del plan.
  - Las decisiones: los candidatos de cada valor, con su puntuación (`_ps`) y si pasan la puerta, de `/api/multibacktest` con `conCandidatos`. El orden, de `comparadorCandidatos`. El capital de cada entrada, de `techoConcentrado` y `capitalCompartido`, sacadas TAL CUAL de `lib/asignaCartera.js`: mismas cuentas y mismo orden. La batería y R1–R3 siguen idénticas byte a byte.
  - El dinero: cada día salen primero las abiertas que salen hoy, en el orden en que entraron; luego entran las del día, en su orden. Cada entrada es una compra real del plan (`compra`, comisión por orden, lotes) y cada salida una venta real (`vende`). Una que entra y sale el mismo día se compra y se vende en el acto. El primer día, las entradas van después de que entre el dinero inicial. La venta final, la de siempre.
  - Las velas de cada valor salen de los candidatos (aperturas y cierres), en las fechas del plan; un día sin vela, su último cierre.
  - La pieza devuelve sus operaciones (con su capital) y la parte del dinero que está dentro cada día, de 0 a 1 (para la fase 9).
- **`motivoListaNoCalculable(plan)`** dice por qué no se calcula: Nasdaq-100, otro reparto, o aportaciones / impuestos / ocioso / apalancamiento. **`planListaCalculable(plan)`** devuelve el plan sin todo eso y la lista de lo que se ha dejado fuera.
- **`/api/plan`**: con lista, la pantalla manda también `cuerpoLista`, la MISMA petición de «La cartera por dentro» (`peticionPorDentro`). Se comprueba que corresponde al plan (estrategia, valores, reparto, dinero, periodo, comisiones, filtros) y se pide a `/api/multibacktest` en el mismo proceso, con la sesión de la persona. La respuesta trae también `finalPorDentro`. Las comparaciones con lista: QQQ, SPY y liquidez (ni «el mismo plan con el ocioso en liquidez», que ya lo es, ni «comprar y mantener la acción»).
- **La pantalla** (`components/BuilderPlan.js`):
  - Arriba, en amarillo, lo que todavía no cuenta («De momento, con una lista, se calcula sin tus aportaciones, sin impuestos y con el dinero ocioso en liquidez (no en oro): llegarán en los pasos siguientes.», con «?»).
  - Una línea gris «Comprobación: «La cartera por dentro» acaba en X € y tu plan, en Y € ✓».
  - Luego, lo de siempre, sin lo que con lista todavía no sirve: «En el ocioso», la franja dentro/ocioso, el Buy&Hold del valor (en el gráfico, en «Año a año» y en la tabla) y las caídas frente al ocioso. Lo decide la fase 9 (con boceto).
  - Con «Slots iguales», «Position Sizing», «Pesos» o el Nasdaq-100, el motivo en su caja. La vista de «Tu dinero» es ahora una función (`vistaDinero`) para los dos casos.
- Arreglado de paso: al quedarse sin nada que calcular (p. ej., al pasar a un reparto que aún no se calcula), «Calculando…» se quedaba fijo; ahora se apaga.
- El «?» de «La cartera por dentro» ya no dice «sin comisiones» ni «no coincidirá»: dice que coincide con «Tu dinero» mientras no haya aportaciones, impuestos ni ocioso.
- **Comprobación nueva** `plan-tu-dinero-lista.js` (en `comunes.sh`):
  1. Cuentas a mano con dos valores inventados: compartido 1.045,90 €; concentrado máx. 1 1.197,80 €; con la puerta cerrada, 898,10 €.
  2. Qué se calcula y qué se deja fuera.
  3. La prueba de oro: 18 combinaciones con la foto de Degiro (dos modos; cuatro comisiones; prioridades alfabético, momentum y fuerza relativa, con «Desempate» y con «Filtro»; máx. 1–4; EMA20 y SuperTrend; tres periodos; filtro de mercado; 4 valores). Diferencia máxima 1e-10 €.
  4. `/api/plan` entero y la pantalla montada.
- `plan-lista.js` y `plan-por-dentro.js`, al día (con lista, «Tu dinero» ya pide su cálculo).

## 90. Paso 3: colores, orden de las cifras, TIR y letra del bloque con lista

Pedido por Sergi el 07/11, al ver la fase 6. Vale para «Una acción» y para «Una lista».

- **Colores por signo** (`colorSigno`): verde si suma y rojo si resta; 0 o sin número, el color de siempre.
  - Arriba: «Tienes al final» (por la ganancia neta), CAGR, TIR y peor caída.
  - En «Año a año»: todas las columnas de %.
  - En la tabla de comparaciones: el final (frente a lo aportado), CAGR, TIR y peor caída.
  - En «¿Es estable?»: el CAGR y «El ocioso añadió».
  - «Has aportado», impuestos y comisiones, en neutro.
- **Orden de las cifras**: Has aportado · Tienes al final · CAGR · TIR · Peor caída · En el ocioso · Impuestos y comisiones.
- **Sin aportaciones, ni la cifra «TIR» ni su columna en la tabla**: con solo el dinero inicial, la TIR es el mismo número que el CAGR. Vuelven solas cuando hay aportaciones (las del plan calculado). Con lista, hasta la fase 7, nunca hay.
- **Letra del bloque con lista**: las piezas del Backtesting (universo, selector, reparto, filtros) llevan letra de 8–12 px. Solo dentro del plan (`[data-lista]`), un estilo las pasa a 12–13 px y aclara `--text2` y `--text3`. Solo se pinta con lista. El Backtesting no cambia (backtesting-panel.js y backtesting-resultados.js idénticos).
- `planes-pantalla.js`: el orden, la TIR con y sin aportaciones, los colores, y que con «Una acción» no va el estilo de la lista.

## 91. El plan con lista, fase 7: aportaciones y dinero ocioso

Decisión de Sergi (07/11): con una lista, la aportación **se queda en el ocioso hasta la siguiente compra**. Lo demás lo he decidido yo siguiendo cómo funciona ya el plan con una acción.

- **Lo que entra o sale espera en el ocioso**: la aportación (mensual o extraordinaria) y el dinero de cada venta van a la liquidez de la pieza; al **cierre** de ese día, lo que queda en liquidez pasa al ocioso (oro, QQQ u otro símbolo). El último día no (se vende todo al final).
- **Para comprar se vende del ocioso solo lo que falta** (a la apertura), con algo más para pagar la comisión de esa venta; si no basta, todo el ocioso.
- **Capital de cada entrada**: las mismas fórmulas del Backtesting (`techoConcentrado`, `capitalCompartido`) con el dinero libre = liquidez + lo que vale el ocioso a la apertura. Ejemplo: 10.000 € en oro, concentrado máx. 4 → cada entrada hasta 2.500 €; llegan 300 € → hasta 10.300 / 4 = 2.575 €.
- **Regla del 1 %**: no se mueve al ocioso un importe si la orden cuesta más del 1 % de él (con 0,185 € por orden, menos de 18,50 €): se queda en liquidez. Así no se pagan comisiones por mover céntimos.
- **El ocioso no puede ser un valor de la lista** (aviso `AVISO_LISTA_OCIOSO_EN_LISTA`).
- **La franja** (parte del dinero dentro) no cuenta el ocioso como dentro.
- **Lo que sigue forzado**: sin impuestos (fase 8) y sin apalancar. La línea amarilla dice ahora «se calcula sin impuestos». `planListaCalculable` solo deja fuera `impuestos` y `apalancamiento`.
- **Pantalla**: con lista no sale «Si llega una aportación con la operación abierta» (siempre espera). La línea «Comprobación» (tu plan = «La cartera por dentro») solo sale sin aportaciones y con el ocioso en liquidez (`oroComparable` de lib/builder/planPantalla.js): con aportaciones u ocioso no tienen por qué coincidir. El «?» de la línea amarilla, al día.
- **Ninguna cifra cambia** con «Una acción» (planes 4/6/7 idénticos) ni en la prueba de oro (sin aportaciones y en liquidez, el código hace lo mismo que antes).
- `plan-tu-dinero-lista.js`, ampliada:
  - 1b · A mano (1 € por orden, ocioso inventado a 50/50/55/60): concentrado máx. 1 con 1.000 € + 300 €/mes en el ocioso → 1.640,46 € y 6 órdenes; con 50 € de aportación (la orden costaría el 2 %) se quedan en liquidez → 1.365,28 €; con el ocioso en liquidez → 1.497,80 €; compartido vendiendo del ocioso solo lo que falta → 1.091,3870 €, entradas de 499,50 y 523,925 €.
  - 3 · Con comisión 0 y un ocioso de precio fijo (100 €), el plan con 300 €/mes acaba igual que con liquidez en tres repartos (con la foto de Degiro).
  - 4 · La pantalla con 300 €/mes y oro: sin la línea «Comprobación», sin «Si llega una aportación…», y «Tienes al final» = /api/plan.

## 92. El plan con lista, fase 8: impuestos venta a venta

Con una lista, «Tu dinero» ya calcula los impuestos de España igual que con una acción: lotes FIFO, la regla de los dos meses, compensación de pérdidas de 4 años, pago el primer día de bolsa de julio y, al final, lo pendiente y lo latente (la venta final). Lo único que sigue forzado es «sin apalancar».

- **De dónde sale el impuesto de julio** (`pagaImpuestoLista` de lib/planes/plan.js; decidido por mí, como en la vida real): primero la liquidez de la pieza; luego el ocioso (solo lo que falta, con la comisión de esa venta); si no basta, se vende un poco de cada valor abierto, a prorrata de su valor. El capital asignado de cada abierta baja en la misma proporción (es lo que usa el reparto para las siguientes entradas). Con una acción no cambia nada (sigue `pagaImpuesto`).
- Las ventas del ocioso también hacen ganancias o pérdidas, y tributan.
- `planListaCalculable` solo deja fuera `apalancamiento`; la línea amarilla dice «se calcula sin apalancar: lo que falta llegará más adelante» y solo sale si se ha pedido ×2 o ×3.
- La línea «Comprobación» solo sale sin aportaciones, sin impuestos y con el ocioso en liquidez («La cartera por dentro» no paga impuestos). El «?» de la línea amarilla y el de «La cartera por dentro», al día.
- **Ninguna cifra cambia** con «Una acción» ni en la prueba de oro (18/18, que ahora se lanza con «Sin impuestos»).
- `plan-tu-dinero-lista.js`, 1c · a mano (sin comisión): ganancia de 1.000 € en 2020 → 190 € el 1/7/2021 pagados con el ocioso (de 50 a 60: 3,1667 participaciones) y 76 € al final (400 € de ganancia en 2021) → 2.134 €; sin ocioso ni liquidez, se vende el 10 % del valor abierto (10 × 19 = 190 €) → 1.710 €. Y la pantalla con 300 €/mes, oro e impuestos: «Tienes al final» = /api/plan, con impuestos de los 10 años.

## 93. El plan con lista, fase 9 (parte 1): el ocioso con una lista

Boceto `bocetos/plan-lista-ocioso.html`, aprobado por Sergi el 07/11 (las tres recomendaciones). Parte 1 de 3.

- **Cifra «En el ocioso»** con una lista: «X % de tu dinero, de media», debajo «en valores, el Y %». Es la media, día a día, de la parte del dinero de la pieza que no está en ningún valor de la lista (`parteOciosaLista` de lib/builder/planPantalla.js sobre la franja `dentro` del motor, que con lista ya es una parte de 0 a 1). Su «?» con ejemplo (`AYUDA_PLAN.enOciosoLista`). Con una acción sigue «X % del tiempo».
- **Franja de altura** bajo «Cómo crece tu dinero» (`GraficoPlan` con `proporcion`): cada día, la altura azul es la parte en valores y la gris, la del ocioso (40 px, con «100 %» y «0 %»). Al pasar el ratón: «fecha · en valores X % · en el ocioso Y %». Leyenda «parte en valores» / «parte en el ocioso». Colores de la app (azul y gris), no los del boceto.
- `anioAnio` sabe de listas (`lista: true`), aunque la tabla «Año a año» con lista sigue sin esa columna.
- Con una acción, nada cambia.
- `plan-tu-dinero-lista.js`: `parteOciosaLista([1; 0,5; 0])` = 50 %; en la pantalla, la cifra con la media de los 2.514 días y la franja con un punto por día.

## 94. El plan con lista, fase 9 (parte 2): el mismo plan con el ocioso en liquidez

- `referenciasDe` (lib/planes/evalua.js) da `OCIOSO_LIQUIDEZ` también con una lista: el mismo plan, con el ocioso en liquidez. Con una acción, mismas referencias y en el mismo orden.
- En la pantalla, con lista y un ocioso que no es liquidez: su fila en «Sin estrategia: el mismo dinero en…», su línea naranja en el gráfico (con casilla en la leyenda) y la columna «El ocioso añadió» de «¿Es estable?» con cifras. Con el ocioso en liquidez, nada de eso (es el mismo plan), como con una acción.
- `plan-tu-dinero-lista.js`: con 300 €/mes, oro e impuestos, la fila vale lo mismo que el plan con liquidez calculado aparte en /api/plan (121.907 € con la foto de Degiro), y salen la línea y «El ocioso añadió» en los dos tramos.

## 95. El plan con lista, fase 9 (parte 3): Buy&Hold de la lista a partes iguales

- Pieza nueva del motor `tipo: 'cesta'` (lib/planes/plan.js), solo para esta referencia: los valores de la lista (con las mismas velas que la pieza con lista, `datos.lista`). El dinero que llega (el inicial y cada aportación) se reparte igual entre los valores que cotizan ese día, una orden por valor, a la apertura; no se vende nunca (salvo para pagar impuestos y la venta final). Si un día no cotiza ninguno, espera en liquidez; si alguno aún no cotiza, su parte va a los demás.
- `referenciasDe` (lib/planes/evalua.js): con lista, la referencia `ACTIVO` es esta cesta («Lo mismo a la lista a partes iguales»). Mismo id que «Buy&Hold de la acción» para que /api/plan (curva y órdenes) y la pantalla la traten igual. Con una acción, nada cambia.
- Pantalla: fila «Buy&Hold de la lista (a partes iguales)» (`NOMBRE_BH_LISTA`) y línea «Buy&Hold de la lista» en el gráfico, con casilla. El «?» de la tabla añade cómo se calcula (`AYUDA_PLAN.bhLista`, con ejemplo: 12.000 € y 12 valores → 1.000 € en cada uno; 300 € → 25 € en cada uno) y el del gráfico habla de la lista (`AYUDA_PLAN.graficoLista`).
- Sigue sin salir con lista: la tabla «Caídas frente al ocioso» (decidido en el boceto: más adelante) y las columnas de Buy&Hold de «Año a año».
- `plan-tu-dinero-lista.js`: a mano, 1.000 € + 300 € entre A y B con 1 € por orden → 1.358,80 € y 6 órdenes; en la pantalla, la fila con el importe de /api/plan y su línea.
- Retoque tras verlo en la app (07/11): la cifra decía «X % de tu dinero, de media» y se cortaba; ahora «X % de media» con «de tu dinero · en valores, el Y %» debajo. El dato de la franja al pasar el ratón va siempre alineado a la izquierda bajo la franja (antes, cerca del final se cortaba por la izquierda).

## 96. Paso 3: la línea de la prueba, igual con o sin lista (fase 10 cerrada)

Decisión de Sergi (07/11): **fase 10 cerrada «sin aval propio del plan»**. Los planes son donde se USAN estrategias (aprobadas, prometedoras o de prueba): no se calcula, guarda ni congela ninguna prueba de la lista. La prueba A/B sigue en «La cartera por dentro», solo informativa. Idea futura: una prueba informativa «estrategia + lista + reparto» en el paso 4.

- La línea de arriba del plan es la misma con «Una acción» y con «Una lista» (`avisoPrueba` de lib/builder/planPantalla.js): «Estrategia: prueba del paso 2 ✓ Pasa (AAPL)», «… ✕ No pasa (AAPL)» o «Estrategia: sin prueba del paso 2». Fuera «la lista aún no tiene prueba» (y `avisoPruebaLista`, `ayudaPruebaLista`, `AVISO_PRUEBA`).
- Colores como siempre (verde, rojo, amarillo), también con lista. No bloquea nada.
- Su «?» añade: es solo un dato, no bloquea, es de la estrategia en el valor entre paréntesis y los planes no tienen prueba propia.
- `plan-lista.js`, `planes-pantalla.js` y `version-paso2.js`, al día con el texto nuevo.

## 97. Paso 3: las cifras de otros ajustes se ven atenuadas hasta que llega el cálculo nuevo

Visto por Sergi en la app (07/11): tras «Descartar cambios», unos segundos se veían las cifras del cálculo anterior (p. ej., las de la lista descartada) como si fueran las buenas. Pasaba porque el plan enseña el último resultado que llegó mientras calcula el de los ajustes de ahora, y el cálculo de lo guardado solo sale al momento si sigue en la memoria de la página (los últimos 20).

- `cifrasViejas` (components/BuilderPlan.js): el resultado que se enseña es de otros ajustes (su clave no es la de ahora). Entonces la vista «Tu dinero» (cifras, gráfico y tablas; con y sin lista) se ve con opacidad 0,4 y un tooltip («Calculando con tus ajustes de ahora: estas cifras son del cálculo anterior.»), junto al «Calculando…» de siempre. Al llegar el cálculo nuevo, se ve normal. Vale para cualquier cambio, no solo para «Descartar cambios».
- Nada cambia en los cálculos ni en lo guardado; «La cartera por dentro» no se toca.
- `planes-pantalla.js`: el resultado de los ajustes de ahora, sin atenuar; uno de otros ajustes, atenuado.

## 98. Guardián: los avisos conocidos van por id

Renombrar una estrategia daba un FALLO falso en `comunes.sh`: los avisos conocidos de `scripts/guardian/conocidos.json` buscaban la estrategia por su NOMBRE (una expresión regular), y con otro nombre ya no se reconocía (pasó con «Prueba editor EMA20x»).

- Cada entrada lleva ahora `ids` (los id de la tabla `strategies`) y `nombre` (solo para leerlo). `scripts/guardian.js` casa por id (`casa`); la expresión regular `estrategias` solo se usa si una entrada no tiene `ids`.
- Las 11 entradas, con los mismos id que casaban antes por nombre (16 estrategias, 2 de ellas inactivas: «13 RSI 9 (cruces)» y «22 MACD…»).
- Ojo: una estrategia NUEVA con un fallo ya conocido (p. ej., una copia) hay que añadirla por su id.
- Nada cambia en la app ni en las cifras; el informe del guardián sale igual.

## 99. Screener (parte 1, commit 1): `lib/screener.js` pasa a llamarse `lib/universoDinamico.js`

El nombre «screener» queda libre para el screener nuevo de Sergi (`lib/screener/`, pestaña «Fundamentales»). El archivo viejo no es un screener para Sergi: elige cada 1 de enero los N miembros del Nasdaq-100 con más volatilidad o más momentum del año anterior (el universo dinámico «ndx_vol_N» / «ndx_mom_N» del Backtesting).

- Solo cambia el nombre (`git mv`) y sus 7 importaciones (`lib/regeneraUniverso.js`, `lib/universoMc.js`, `pages/api/multibacktest.js`, `scripts/coberturaUniverso.js`, `scripts/generaScreener.js`, `scripts/informeMomentum.js`, `scripts/informeScreener.js`), más los comentarios que lo nombraban y `docs/catalogo-condiciones.md` y `docs/planes-inversion.md`. El contenido del archivo es el mismo salvo la primera línea.
- Se quedan con su nombre, a propósito: la tabla `public.universo_screener` (y `universo_screener_escrituras`), `scripts/generaScreener.js` y `scripts/informeScreener.js` (renombrar tablas de la base no aporta nada y tiene riesgo).
- Nada cambia en la app ni en las cifras.

## 100. Screener (parte 1, commit 2): datos de la SEC y de Yahoo en la base

- Tablas nuevas `screener_empresas`, `screener_cuentas` y `screener_vistas` (`sql/screener.sql`, con REVERSIÓN), aplicadas el 10/11 por la Management API. Permisos: anon, nada; cualquier usuario con sesión lee empresas y cuentas (nadie las escribe desde la app); las vistas, solo su dueño.
- Columna `metricas` (jsonb) en `screener_empresas`: las cifras de los filtros ya calculadas (`lib/screener/metricas.js`), para que la pantalla no lea todas las cuentas. Se añadió el mismo día con `ALTER TABLE … ADD COLUMN metricas jsonb` (reversión: `DROP COLUMN metricas`).
- Lector de EDGAR, universo, sectores y cifras en `lib/screener/` (`edgar.js`, `universo.js`, `sectores.js`, `metricas.js`); carga semanal con `scripts/cargaScreener.js` (necesita `SEC_UA` en `.env.local`). Todo en `docs/screener.md`.
- Primera carga hecha (10/11): 599 empresas (S&P 500 503, Nasdaq-100 101, listas 147).
- Comprobación nueva `scripts/comprobaciones/screener.js` en `comunes.sh`.
- Nada cambia en la app (aún no hay pantalla) ni en las cifras.

## 101. Screener (parte 1, commit 3): la pantalla

- Menú nuevo «🔎 Screener» (pages/index.js: entrada del menú, el panel lateral a 0 como en Tesis y el bloque `sidePanel==='screener'`), con la pantalla `components/ScreenerPanel.js` (diseño A del boceto). Detalle en docs/screener.md §5.
- Piezas puras: `lib/screener/filtros.js` (catálogo de 14 filtros fundamentales y 7 técnicos «más adelante», con sus «?»; `pasa`, `evaluaVista`), `lib/screener/vista.js` (formato de la vista, las 3 de ejemplo, `normalizaVista`, `textoVista`) y `lib/screener/datos.js` (lectura por páginas).
- Las vistas aún no se guardan (commit 4); «Guardar como lista» y el cajón del valor, en el commit 5.
- La app pone a todo `label` «columna» y letra mono, y a todo `select` el 100 % de ancho: la pantalla lo corrige en sus propios estilos.
- Comprobación ampliada `screener.js` (60): filtros, vistas y la pantalla montada. Revisado en el navegador de pruebas con una muestra real (104 empresas): «Rentabilidad y poca deuda» deja 13 de 93.
- Nada cambia en las demás pantallas ni en las cifras.

## 102. Screener (parte 1, commit 4): vistas guardadas

- Las vistas del screener se guardan en `screener_vistas` (`lib/screener/vistasBase.js`). La primera vez se crean las 3 de ejemplo. Cada pestaña lleva «●» si tiene cambios sin guardar; además hay «+ Nueva vista ▾» (desde cero o copia), nombre editable, ⧉, papelera roja con ventana propia, «Descartar cambios» y «Guardar».
- Guardia de cambios sin guardar al cambiar de vista, al crear una y al salir de la pantalla (`screenerSalida` en `salirDeTesis` de `pages/index.js`: menú, logo y «Salir»).
- Seguridad comprobada en la base de verdad (`scripts/comprobaciones/screenerSeguridad.js`, 9 de 9, todo con ROLLBACK).
- `screener.js` (78) con estado sobre el DOM mínimo. Detalle en docs/screener.md §6.
- Nada cambia en las demás pantallas ni en las cifras.
- `scripts/comprobaciones/tesis.js`: la guardia `salirDeTesis` que comprueba ahora incluye el screener.

## 103. Screener (parte 1, commit 5): «Guardar como lista» y el cajón de un valor

- «☰ Guardar como lista (N)» crea una lista FIJA de la Watchlist con los que pasan (`lib/screener/lista.js`). Los valores nuevos entran en el grupo «Screener»; con un nombre repetido no se guarda, y si falla a mitad se borra la lista. Al terminar, la app relee la Watchlist (`onListaGuardada` → `reloadWatchlist` en pages/index.js).
- Cajón de un valor (al pulsar una fila): ✓/✗ y la cuenta de cada filtro, crecimiento exigido frente al esperado, y enlaces a Fundamentals y al gráfico (`onIrAValor` → `setSimbolo` + `setSidePanel`, con la guardia).
- `screener.js` (93). Detalle en docs/screener.md §7. Con esto queda hecha la PARTE 1 del screener.
- Nada cambia en las demás pantallas ni en las cifras.
- `scripts/comprobaciones/tesis.js`: 19 sitios que cambian de pestaña (el nuevo, los enlaces del cajón, pasa por `salirDeTesis`).

## 104. Screener: la vista no se pierde al ir a una ficha o a un gráfico y volver

- Antes, al pulsar «🏦 Ficha de Fundamentals ↗» o «📈 Gráfico ↗» en el cajón y volver al screener, la pantalla se montaba de nuevo y se perdían la pestaña de la vista, los filtros sin guardar, el orden, la búsqueda y el cajón (lo vio Sergi el 10/11).
- Ahora el screener queda montado desde la primera visita y solo se oculta, como el Builder y el Editor (`screenerVisitado` en pages/index.js). Oculto, Esc no cierra su cajón (`visible`).
- `screener.js` (94) lo comprueba en el código de pages/index.js. Nada cambia en las demás pantallas ni en las cifras.

## 105. Screener: columnas numéricas, recomendados, crecimiento exigido y panel ocultable

- Pedido por Sergi tras verlo (10/11). Los tres filtros de sí o no pasan a ser números ordenables: cambio del ROE en puntos (solo con el ROE de ahora positivo), caja ÷ deuda a corto en veces, y P/S frente al sector en %. Mantienen su id, así que sus vistas guardadas siguen con ellos encendidos.
- La tabla queda sin ✓ ni ✗ (en rojo lo que no pasa), con un tooltip por celda. Cada «?» lleva «Recomendado». El crecimiento exigido va detrás de una casilla y se muestra junto al esperado. El panel mide 440 px y se puede ocultar.
- Detalle en docs/screener.md §8. Las cifras de la base no cambian: lo nuevo se calcula en la pantalla con lo que ya trae `metricas`.
- `screener.js` (112). Nada cambia en las demás pantallas ni en las cifras.

## 106. Screener (parte 2, fase 2a): piso técnico, precios y mercado

- Cambio en la base, aprobado por Sergi el 10/11 (`sql/screener_tecnico.sql`, con REVERSIÓN): columna `screener_empresas.tecnico` y la función `guardar_tecnico_screener`, que solo escribe esa columna. Seguridad: `screenerSeguridad.js`, 20 de 20.
- Cuatro filtros técnicos que ya se pueden encender, todos con números:
  - precio frente a la EMA 200 (la misma EMA del Builder);
  - distancia al máximo de 52 semanas;
  - volumen relativo;
  - su sector frente al SPY en 3 meses (ETF XLK…).
- Línea informativa «Mercado (SPY) por encima / por debajo de su EMA 200».
- Botón «⟳ Actualizar precios», por tandas (`pages/api/screener-tecnico.js`, con `diariasConCache`).
- Scripts: `llenaCachePrecios.js --screener` y `cargaScreener.js --tecnico`.
- Detalle en docs/screener.md §9.
- Nada cambia en las demás pantallas ni en las cifras: la caché de precios solo gana valores, y los fundamentales del screener no cambian.
- `screener.js` pasa de 112 a 133 pruebas.

## 107. Screener (parte 2, fase 2b): «Da señal de compra en las últimas N velas con…»

- Decidido con Sergi el 10/11: opción B, «en las últimas N velas» (1 = solo la última; como mucho 20).
- Con una de sus estrategias de tarjetas (velas diarias) y el MISMO motor que el paso 1. Pasa si da señal de compra sin tener ya la operación abierta. Con una orden en un nivel (ruptura…), cuenta la vela en que compró.
- Solo se calcula para los valores que pasan los fundamentales, sin guardar nada en la base (`pages/api/screener-senales.js`, `lib/screener/senales.js`). No hay cambios en la base.
- Motor: `interpreta` devuelve la serie `senalCompra` solo si se le pide (`ctx.senalCompra`); sin pedirla, nada cambia.
- `pages/api/screener-tecnico.js`: la lectura de velas pasa tal cual a `velasCerradasDe` (exportada), que usan las dos rutas.
- Detalle en docs/screener.md §11.
- Comprobaciones: `screener-senales.js` (27, nueva en `comunes.sh`) y `screener.js` (de 133 a 147). Cruce con AAPL real y «Prueba editor EMA20»: 300 de 300 iguales al paso 1.
- Nada cambia en las demás pantallas ni en las cifras.

## 108. Screener: la explicación del «−N», en su tooltip

- Pedido por Sergi al ver V9.1169 (10/11): fuera la línea ««−N»: cuántos quita cada filtro» de debajo del panel; su explicación y su ejemplo pasan al tooltip del número rojo de cada filtro.
- screener.js: de 147 a 148. Nada más cambia.

## 109. Screener: vista ↔ tesis

- Una tesis enlaza también vistas guardadas del screener: tipo `vista` en `relacionados`, sin cambios en la base.
- En la tesis: ficha «Screener · nombre» con «Abrir», que abre la vista en el Screener. En el screener: «💡 …» junto al nombre de la vista, que abre la tesis.
- Detalle en docs/screener.md §13 y docs/tesis.md.
- Comprobaciones: `tesis-enlaces.js`, `tesis.js` (20 sitios que cambian de pantalla) y `screener.js` (153).
- Nada cambia en las cifras. Las tesis guardadas no cambian: `camposDe` da lo mismo para las que no enlazan vistas.

## 110. plan-lista.js: sin el fallo intermitente

- La comprobación «§89: con «Slots iguales», «Tu dinero» aún no se calcula y lo dice» a veces fallaba con el equipo cargado: esperaba 10 ms fijos.
- Ahora cada paso de la parte montada espera a lo que busca (20 s como mucho), como los arreglos de V9.1127.
- Solo cambia scripts/comprobaciones/plan-lista.js. Pasó 3 de 3 suelto y en comunes.sh.

## 111. El plan con lista: el Nasdaq-100 en «La cartera por dentro»

- Primera parte del Nasdaq-100 en el plan (elemento 13 del inventario del Backtesting). Con el universo «Nasdaq-100 · N más volátiles» o «N con más momentum» en el bloque «Una lista», «La cartera por dentro» ya calcula.
- Pide lo MISMO que el Backtesting con universo dinámico (`runBacktesting` de pages/index.js): los valores y la máscara salen de `estadoUniversoMc` con lo leído de la base (universo_screener y universo_miembros), reparto «Capital concentrado», sin pesos y con el campo `universo`. El motor no cambia. La pestaña enseña, como el Backtesting, la línea del universo y las curvas B&H QQQ y B&H universo.
- `BuilderPlan` lee la base al elegir el universo (`cargaUniversoMc`, como pages/index.js), una vez por universo; si falla o tras «Regenerar universo», se vuelve a leer. `peticionPorDentro` y `motivoSinPeticion` reciben `universoDatos`. Mientras se lee: «Leyendo de la base el universo (…)…»; con un periodo anterior a 2016: «Con el Nasdaq-100 no se calcula: el universo empieza el 01/01/2016.».
- «Tu dinero» con el Nasdaq-100 sigue diciendo «todavía no»: es la segunda parte.
- Comprobación `plan-por-dentro.js`: con el Nasdaq-100, la petición es la del Backtesting (copia literal del código de runBacktesting) en 18/18 casos; los motivos; y, con un universo de prueba sobre la foto de Degiro, el motor responde con el universo y la pestaña pinta su línea.
- No cambian ni las cifras ni los planes guardados: con «Lista manual» la petición es la de antes (400/400).

## 112. El plan con lista: el Nasdaq-100 en «Tu dinero»

- Segunda parte del Nasdaq-100 en el plan: «Tu dinero» ya se calcula con el universo dinámico (antes: «todavía no»). Fuera `AVISO_LISTA_UNIVERSO`.
- `/api/plan` (`errorCuerpoLista`): con el Nasdaq-100, la petición tiene que ser la del universo del bloque (misma regla y N) y sus valores, las claves de la máscara; con «Lista manual», sin universo y los valores marcados, como antes.
- El ocioso no puede ser un valor del universo del periodo: `motivoListaNoCalculable(plan, simbolosLista)` con los valores de la petición (pantalla y /api/plan) o de los candidatos (motor).
- Sin la fila y la línea «Buy&Hold de la lista (a partes iguales)»: con un universo que cambia cada año no es una alternativa con sentido. Queda Buy&Hold QQQ (y en «La cartera por dentro», el B&H del universo). Decidido por mí; dicho a Sergi.
- Prueba de oro con precios reales (solo lectura, fuera del repo; Capital concentrado, máx. 4, 10.000 €, 2016–2025, sin aportaciones ni impuestos, ocioso en liquidez): EMA20 · ndx_vol_10 (53 valores) 9.672,03 €; EMA20 · ndx_mom_20 (108) 5.109,43 €; SuperTrend 10/3 · ndx_vol_20 (79) 8.858,52 €; SuperTrend 10/3 · ndx_mom_10 (68) 14.332,65 €. «Tu dinero» = «por dentro» en los cuatro (diferencia < 1e-10 €). El cálculo del motor tarda 10–22 s en este equipo (como el Backtesting con el mismo universo).
- Comprobación `plan-tu-dinero-lista.js`: prueba de oro con un universo de prueba sobre la foto (3/3), /api/plan con el Nasdaq-100 (cuadra, sin `ACTIVO`) y sus rechazos, el ocioso dentro del universo, y la pantalla (lee el universo una vez, calcula con su petición y no enseña la lista a partes iguales).
- Con «Lista manual» y con «Una acción» no cambia nada: los planes guardados (4, 6 y 7) dan las mismas cifras.

## 113. Screener: colores estilo Finviz y papel gris

- El screener tiene dos tonos: oscuro (estilo Finviz) y claro (papel gris). Se cambia con el botón «☀ Claro / ☾ Oscuro» de la barra de arriba, que de momento solo cambia el screener. Detalle en docs/screener.md §14.
- Se resalta la fila entera al pasar el ratón; las filas van alternas; los símbolos, en azul.
- Ninguna cifra cambia: solo colores.

## 114. Screener: los filtros arriba, como Finviz

- Los filtros pasan del panel de la izquierda a una rejilla de 5 columnas arriba, con un desplegable de cifras fijas por filtro y «Otra cifra…»; las vistas, en una sola línea. Detalle en docs/screener.md §15.
- `components/BuilderAyuda.js` acepta un nombre en vez del «?» (`contenido`, `estiloBoton`, `soloClic`); sin ellos, igual que antes.
- Ninguna cifra cambia y lo que se guarda en una vista, tampoco.

## 115. Screener: filtros de la EMA 50 y la EMA 20

- Dos filtros nuevos en el piso Técnico, detrás de la EMA 200: «Precio frente a la EMA 50» y «… EMA 20». Detalle en docs/screener.md §16.
- Cambio en la base: `guardar_tecnico_screener` acepta y guarda `ema50` y `ema20` (sql/screener_tecnico_ema.sql, con REVERSIÓN).
- Ninguna cifra de lo que ya había cambia.
- Al pasar el ratón por el nombre de un filtro, su cifra recomendada.

## 116. Screener: desplegable de cifras que se puede editar

- Fuera «Otra cifra…»: en cada cifra del desplegable, ✎ (cambiarla) y papelera (quitarla); abajo, «+ Añadir cifra» y «↺ Las de fábrica». La lista se ordena sola. Detalle en docs/screener.md §17.
- Tus cifras se guardan en tus ajustes (settings.screenerCifras), sin cambios en la base. Ninguna cifra cambia.

## 117. Screener: tooltips del embudo y desplegables en el tono claro

- Cada número del embudo explica en su tooltip por qué no se ven los demás valores (lo que quita cada filtro). Detalle en docs/screener.md §18.
- Los desplegables del navegador siguen el tono de la pantalla (en el claro salían negros). Ninguna cifra cambia.

## 118. Screener: los 11 sectores a la vista y desplegables claros

- Los 11 sectores con casilla: marcados los que se miran, desmarcados y en gris los que se quitan; en el tooltip de los 5 que se quitan por defecto, el motivo. Detalle en docs/screener.md §19.
- Las listas de los desplegables del navegador, con el tono del screener (en el claro seguían negras). Ninguna cifra cambia.

## 119. Screener: sectores quitados, solo en gris

- Los sectores que se quitan salen en gris, sin tachar (pedido por Sergi). Detalle en docs/screener.md §20. Ninguna cifra cambia.

## 120. Screener: pestaña «Custom»

- Encima de la tabla, pestañas «Filtros» (igual) y «Custom»: eliges las columnas en «⚙ Columnas» (casillas por grupos), las ordenas arrastrando la cabecera y ✕ las quita; se guardan con la vista (null = las de los filtros). lib/screener/columnas.js. Sin cambios en la base; ninguna cifra cambia. Detalle en docs/screener.md §21.

## 121. Screener: pestaña «Charts»

- Un minigráfico por valor (velas o línea; diario 6 meses, semanal 2 años, mensual 5 años; EMA 200/50/20 calculadas en diario, la 200 igual a la del filtro; volumen), grandes (4 por fila) o pequeños (6), con la cruz como Finviz, fechas debajo y las cifras de «⚙ Cifras»; se cargan según bajas y se guardan con la vista. lib/screener/graficos.js y components/ScreenerCharts.js. Sin cambios en la base; ninguna cifra cambia. Detalle en docs/screener.md §22.

## 122. Screener: eje de Charts a la izquierda

- Minigráficos con el eje de precios a la izquierda y la leyenda en dos líneas arriba; el tooltip de «Actualizar precios» dice que no se actualizan solos. Detalle en docs/screener.md §23.

## 123. Screener: doble clic para ampliar un gráfico de Charts

- Doble clic en un minigráfico lo amplía (unas 3 veces); un clic o Esc lo cierra; el clic sencillo abre el detalle tras 250 ms. Detalle en docs/screener.md §24.

## 124. Botón «← Atrás» en la barra de arriba

Pedido por Sergi el 11/11.
- A la izquierda de «☀ Claro / ☾ Oscuro», siempre visible. Cada vez que se cambia de sección (menú, logo, enlaces entre pantallas), la app apunta de dónde se venía; «← Atrás» vuelve a la última y la quita. Tooltip «Volver a: Tesis» (o «Aún no hay una sección anterior», atenuado).
- Solo secciones (no las pestañas de dentro: el screener y el Builder ya recuerdan lo suyo), solo atrás (sin adelante), las últimas 20, sin repetir. Pasa por salirDeTesis: con cambios sin guardar, la ventana de siempre.
- lib/navegacion.js (puro: apuntaAtras, vuelveAtras, textoAtras); en pages/index.js, la pila y el efecto sobre sidePanel. No se guarda: al recargar la página empieza vacía.
- Comprobación tesis.js: 21 sitios que cambian de sección (el nuevo pasa por la guardia) y la pila con cuentas a mano.
## 125. Rotación: el motor (sin pantalla)

Primer paso del orden del 11/11 (rotación → Comparar planes → …). Ninguna cifra de la app cambia: nadie lo usa todavía.
- lib/rotacion.js (puro): rotar, momentum, velasDeDecision. En cada decisión (al cierre de la última vela del mes o de la semana), entre los valores que son miembros ese día, pasan el filtro (serie del catálogo; «sin dato» = no pasa) y tienen puntuación (momentum de L velas saltando S, u otra función), se queda con los K de más puntuación (empate: alfabético).
- Opción A (Sergi, 11/11): los que siguen no se tocan; lo vendido y la liquidez se reparten a partes iguales entre los que entran. Con menos de K candidatos, lo que sobra espera en liquidez.
- Decidido por mí: decide con el cierre y opera a la apertura siguiente; la primera decisión, al cierre de la vela anterior al periodo (entra en la apertura del primer día). Cierre al final: vende todo al último cierre con costes. Valor que deja de cotizar: se vende a su último cierre. Filtro de mercado (opcional): se mira en cada decisión; si no es true, todo a liquidez. Venta anticipada (opcional): se mira cada cierre, vende a la apertura siguiente y el dinero espera a la siguiente decisión (gana a la decisión del mismo día).
- Costes: máx(% × importe, mínimo) por orden (como costeOrden del plan) y deslizamiento: compra a precio × (1 + d), venta a precio × (1 − d).
- Comprobación scripts/comprobaciones/rotacion.js (en comunes.sh): 27 casos calculados a mano (rotación A → B → A, costes, mínimo, mercado, filtro, miembros, venta anticipada, opción A con K = 2 de 3, deja de cotizar, menos candidatos que K), PRUEBA DE ORO (K = todos = Buy&Hold a partes iguales sin rebalanceo, con costes, mensual y semanal) y sin mirar al futuro.
- Siguiente: la prueba contra el azar (K valores al azar en las mismas fechas) y la batería del plan de Sergi.
## 126. Rotación: la prueba contra el azar (sin pantalla)

- lib/rotacion.js se parte en prepara (datos alineados y candidatos de cada decisión, una vez) y simula (el dinero, con una función elige); rotar = las dos con «los K primeros». Mismos resultados que en §125 (las mismas comprobaciones).
- azarRotacion: 1.000 copias (semilla fija). Cada copia decide en las MISMAS fechas, entre los MISMOS candidatos, con el mismo mercado, costes, venta anticipada y cierre al final; elige AL AZAR y cambia los mismos que la estrategia: suelta los que ya no son candidatos, suelta al azar tantos como la estrategia soltó ese día por decisión propia («rotados») y rellena al azar hasta K. Así rota igual de a menudo y paga costes parecidos: solo se prueba si el criterio elige mejor que el azar (la idea de «misma frecuencia» del paso 2).
- Percentil del CAGR (% de copias que ganan menos; empates, la mitad) y de la caída (% de copias que caen más).
- Calibración (fuera de comunes.sh, con 60 mercados de precios al azar, 60 valores, 5 años, K = 5, momentum 126 saltando 21, con costes): 0 de 60 con percentil ≥ 95, mediana 56,5. Velocidad: 1.000 copias con 130 valores y 10 años, unos 6 s.
- Comprobación rotacion.js: 11 casos más (rotados a mano, elección al azar a mano, K = 1 con las dos copias posibles calculadas, percentil a mano, K = todos = percentil 50, semilla fija, misma rotación).
## 127. Rotación: la batería del plan de Sergi (veredicto: no pasa ninguna)

- scripts/rotacionBateria.js (solo lectura: precios de la caché con leer_velas y miembros del NDX de universo_miembros, una clase por empresa). `node scripts/rotacionBateria.js [--sims 1000]`, unos 2 minutos; deja salida/rotacion-bateria.json. Es el plan del 09/11, declarado antes de mirar: 10.000 €, diario, opción A, 0,185 € por orden + 0,05 % de deslizamiento, 1.000 copias al azar (semilla 20261111). A (9) mensual L 63/126/252 × K 3/5/10; B (6) L 126/252 saltando 21; C las 3 mejores (mayor CAGR en el peor de los dos periodos) con rebalanceo semanal; D esas 3 con QQQ > SMA 200. E (velas semanales) queda pendiente.
- Referencias (precio sin dividendos): B&H QQQ 23,47 % / 14,30 % (caídas −28,6 / −35,6 %); B&H a partes iguales de los miembros 22,59 % / 9,57 %.
- Resultado (11/11): NINGUNA pasa las 5 reglas. Cerca: A L63 K10 pasa 1–3 (28,14 % p98 / 15,78 % p99; caídas −36,6 / −31,9 %) pero sus vecinas no (regla 4); B L126 saltando 21 K3 (58,09 % p100 / 25,62 % p99) y su versión semanal ganan al azar en los dos periodos pero caen −47,2 % y −46,5 % (el límite es −45,6 %: regla 3), y sus vecinas no pasan. En 2016–2020 casi todas superan al azar (p ≥ 98); en 2021–2025 la mayoría no (p 16–93). El filtro QQQ > SMA 200 baja el CAGR sin bajar la caída.
- Limitaciones: 36 de 207 miembros desde 2015 sin precios en la caché (sobre todo comprados o fusionados: ATVI, CELG, XLNX, CTXS, ESRX, WBA…; están fuera para la estrategia, el azar y el B&H a partes iguales); precios sin dividendos. Saltos raros de la caché revisados (VIP 2021, KDP 2018, INSM, LILAK, ALNY, BATRA): fuera de sus fechas de miembro, no afectan.
## 128. «Comparar planes» (opción A: cada plan tal como está guardado)
- Pedido por Sergi (11/11; boceto bocetos/comparar-planes.html, v2). El botón «Comparar planes» del paso 3 se activa con al menos dos planes guardados (con uno, apagado con «Guarda al menos dos planes para compararlos.»). Cambia la zona de abajo por la comparación (components/ComparaPlanes.js); «← Volver al plan» la cierra, y abrir u otra pestaña, «+ Añadir plan» o «Abrir» también. El plan abierto sigue con sus cambios.
- OPCIÓN A (de Sergi: habrá planes que aportan cada mes y otros que no, y quiere compararlos): cada plan se calcula TAL COMO ESTÁ GUARDADO, con el mismo motor y la misma petición que su pestaña (con lista: planListaCalculable y la petición de «La cartera por dentro», que necesita la estrategia de ahora con la misma regla; si no, la tarjeta dice por qué no se calcula). Los cálculos se comparten con las pestañas (hechos) y se piden a la vez.
- DÓNDE ENGAÑA (lib/builder/comparaPlanes.js): dinero distinto (inicial, aportación o su subida) o periodo distinto → aportado, «Tienes al final», impuestos y comisiones en gris con ⚠ y su motivo al pasar el ratón; periodo distinto → también CAGR del plan, TIR y peor caída; los tramos 2016–2020 y 2021–2025 se comparan siempre («—» si el plan no cubre el tramo). Impuestos o comisión distintos: solo el aviso. Arriba, un aviso amarillo por cosa que no coincide, con qué tiene cada plan. La ★, solo en filas que se comparan.
- Cada tarjeta: nombre, estrategia · dónde · ocioso, periodo y dinero (en amarillo si no coinciden), «Abrir» y «⧉» (duplicar), las cifras, Buy&Hold QQQ y SPY con el MISMO dinero y periodo del plan (CAGR y los puntos que les saca) y la línea de la prueba del paso 2 de su estrategia. Fichas para elegir hasta 4 planes y para quitar o poner QQQ y SPY (pedido por Sergi); recordado en este navegador (builder_comparar), con la escala Log/Normal.
- Gráfico «Plan a plan»: «Crecimiento de 100 €» (VL × 100; último punto tras la venta final: 100 × (1 + CAGR)^años; por defecto si el dinero o el periodo no coinciden) o «Tu dinero en €» (QQQ y SPY solo si todos meten el mismo dinero en el mismo periodo; si no, un aviso). Debajo, «Año a año» con una columna por plan y por referencia (las referencias, del plan que empieza antes).
- Con los dos tonos del screener (lib/screener/colores.js): el botón «☀ Claro / ☾ Oscuro» llega al Builder (prop tema) y cambia esta pantalla; su tooltip dice ahora «el Screener y «Comparar planes»». El resto del paso 3 sigue oscuro.
- /api/plan devuelve también el VL de QQQ y SPY en curvas (antes solo su patrimonio). Ninguna cifra cambia: cifrasPlan idéntico con y sin él (comprobado).
- Comprobación nueva scripts/comprobaciones/comparar-planes.js (en comunes.sh): cuentas a mano con el motor (final 10.694,29 €, crecimiento 106,94 € = 100 × (1 + CAGR)^años, QQQ plano en 100), qué se compara, y la pantalla montada (tarjetas, avisos, ★, fichas, QQQ/SPY, modos, «Volver al plan», «Abrir» con la pregunta de cambios sin guardar, tono claro). planes-pantalla.js: el botón ya no dice «Próximamente».
## 129. Supabase LOCAL: la app y los scripts contra la base de este PC
- Por qué (12/11): el proyecto de la nube quedó restringido por exceso de transferencia (5,83 de 5 GB del plan gratuito; la API da 402 hasta el 22/11). Sergi no quiere pagar y solo usa la app en este PC: la base pasa a Supabase LOCAL (CLI + Docker Desktop sobre WSL2, limitado a 3 GB en %USERPROFILE%\.wslconfig). La app de inglés sigue en la nube y no se toca. Nada de la nube se pausa ni se borra sin el OK explícito de Sergi.
- Migración (paso 3, sin tocar la nube): copia exacta de la nube en solo lectura (texto de cada fila con extra_float_digits = 1, md5 por tandas) y estructura fina leída por SQL; la estructura se recrea con un generador y se comprueba con las MISMAS consultas en local (14 apartados iguales: columnas, tablas, secuencias, funciones, 117 restricciones, 77 índices, disparadores, 61 políticas, permisos…); los datos, 34 tablas y 3.152.418 filas iguales por recuento y md5. Los scripts y la copia están fuera del repo (Documentos\TradingSimulator_copias\nube_20261112). Faltan los 5 archivos de las tesis (la API de almacenamiento de la nube da 402): solo sus filas.
- Supabase local: carpeta C:\Users\Usuario\TradingSimulator_local (fuera del repo), `npx supabase@3.1.0 start -x imgproxy,mailpit,supavisor,vector,logflare,studio,realtime,edge-runtime`; en config.toml apagados realtime, studio, local_smtp, storage.vector, edge_runtime y analytics. Firma de sesiones ES256 (signing_keys.json, `supabase gen signing-key --algorithm ES256`), como la nube: lib/verificaJwt.js no cambia. postgres-meta v0.100.0 suelto (contenedor supabase_meta_TradingSimulator_local, 127.0.0.1:54325, entra como postgres): responde como la Management API (mismo JSON, extra_float_digits = 0).
- .env.local apunta a http://127.0.0.1:54321 con la clave publishable local; SUPABASE_SQL_URL = postgres-meta local; SUPABASE_SERVICE_ROLE_KEY local; NEXT_PUBLIC_SKIP_AUTH=false (en local hace falta iniciar sesión: sin sesión, el RLS no deja ver nada). El de la nube, tal cual, en .env.nube.local (fuera de git): volver atrás = restaurarlo y rehacer la app.
- Código: lib/supabase.js acepta también http://127.0.0.1 y http://localhost (esUrlSupabase; antes solo https). scripts/sqlDestino.js decide a dónde va el SQL de los scripts (local si hay SUPABASE_SQL_URL; si no, la Management API); backup.js, guardian/lecturaBd.js, llenaCachePrecios.js y universoNasdaq100.js solo cambian la línea del fetch y leeToken/leeRef (en local devuelven «local»). tesisSeguridad.js lee en local la clave de servicio de .env.local. .claude/launch.json: «Next.js Start» (next start, la app en modo normal: ~0,07 GB frente a ~0,7 en desarrollo).
- Comprobado en local con la sesión de Sergi: sus datos se ven; planes 6 y 7 idénticos a la referencia (75.123 € y 64.625 €); el plan 4 da 198.125 € porque Sergi lo guardó el 10/11 con 0,185 € por orden: con 0,37 € (la de la referencia) da 197.917 €, CAGR 24,55 %, TIR 22,98 %, −31,77 %, 39.785 €, 165 €, 446 órdenes, B&H AAPL 202.153 € (24,10 %), idéntico. Backtesting R1–R3 idénticos (ref-backtesting.js con la base local). comunes.sh en verde en local.

## 130. Copias de seguridad (parte 1): la copia DIARIA de la base local
- Por qué (12/11): desde §129 los datos viven solo en este PC; GitHub solo tiene el código (y es público: los datos no pueden ir allí). Diseño aprobado por Sergi: copia diaria en el disco del PC (14 últimas) + cada 15 días una ventana que pide el USB (6 últimas, parte 2) + restaurar con doble clic y prueba de restauración (parte 3).
- scripts/copias/copiaDiaria.js: si el contenedor de la base está encendido y aún no hay copia de hoy (día del PC), copia a Documentos\TradingSimulator_copias\diarias\AAAA-MM-DD\ (fuera del repo y de OneDrive). `--forzar` sustituye la de hoy; COPIAS_RAIZ cambia la carpeta (pruebas). Si la base no se encendió, no hace nada: los datos no han cambiado.
- Qué guarda: base.dump = pg_dump -Fc de TODA la base (public, auth, storage y lo de Supabase; al restaurar se elige la parte); almacenamiento/ = los archivos subidos (volumen /mnt del contenedor de storage); config/ = .env.local, config.toml y signing_keys.json de Supabase local; CLAUDE.local.md y bocetos/. ~57 MB, ~13 s.
- Fiable: el volcado y el recuento de filas salen de la MISMA foto (transacción REPEATABLE READ con pg_export_snapshot y pg_dump --snapshot), aunque la app escriba mientras. Se comprueba que pg_restore -l lee el volcado y que trae datos de cada tabla contada; manifiesto.json con filas de cada tabla (public, auth, storage) y sha256 de cada archivo, releído tras escribir. Se escribe en «AAAA-MM-DD.enCurso» y solo se renombra al final: una copia a medias nunca cuenta. Poda: 14 completas; restos .enCurso de otros días, fuera. Registro de una línea por intento en diarias\_registro.txt y último resultado en diarias\_estado.json (lo leerá la ventana del USB).
- Sola y sin ventana: tarea de Windows «TradingSimulator - copia diaria» (scripts/copias/instalaTarea.ps1, del usuario, sin administrador; `-Quitar` la quita): al iniciar sesión (+5 min, para que arranque Docker) y cada hora; lanza wscript con copiaDiaria.vbs (oculto). Comprobado: la tarea corrió (resultado 0) e hizo la copia del 12/11 (3.152.588 filas en 70 tablas, 21 archivos); segunda pasada del día, nada; poda con 16 copias falsas → quedan 14.
- Sin cambios en la app ni en la base: no se lanzó comunes.sh (la app de Sergi estaba encendida con next start y el build de comunes.sh la habría pisado; ningún archivo que la app ejecute cambia).
- Sin cifrar (decisión de Sergi): lleva claves en claro (user_settings, .env.local) y la cartera real; nunca dentro del repo.

## 131. Copias de seguridad (parte 2): cada 15 días, al USB
- Diseño aprobado por Sergi (12/11): no se copia sola al USB; cada 15 días sale una ventana propia «Conecta el USB y pulsa Copiar», con «Recordar mañana». En el USB, las 6 últimas, más el código entero y la guía para montarlo todo en un PC nuevo.
- scripts/copias/copiaUsb.js (estado | unidades | marcar <unidad> | copiar | recordar). Unidades USB = particiones con letra de discos con BusType USB y tamaño > 0 (Get-Partition/Get-Disk/Get-Volume). USB MARCADO: la primera vez se elige y se deja en su raíz TradingSimulator_USB_COPIAS.json con un id aleatorio, guardado también en Documentos\TradingSimulator_copias\_usb.json; solo se copia en la unidad con ESE id (nunca en otro pendrive). Toca = hay copia diaria y han pasado ≥ 15 días desde la última al USB (o ninguna) y no hay «Recordar mañana» para hoy.
- «copiar»: comprueba la última copia diaria del PC con su manifiesto (sha256), mira el sitio libre (copia + 600 MB), la pasa a USB:\TradingSimulator_copias\AAAA-MM-DD (vía .enCurso) y la vuelve a comprobar archivo a archivo en el USB (si ya estaba, solo la comprueba); git bundle de HEAD + ramas + etiquetas en codigo\repo.bundle (solo si cambió el último commit, anotado en codigo\commit.txt; `git bundle verify`); copia LEEME_RESTAURAR.txt (en scripts/copias/, sin secretos); poda a 6; registro en el USB y en el PC.
- Ventana scripts/copias/avisoUsb.ps1 (WinForms, UTF-8 con BOM para PowerShell 5.1): título, frase con la última copia en el USB, elección del USB la primera vez (desplegable + «Actualizar»), cuadro con los pasos, «Copiar» / «Recordar mañana» → «Cerrar». Lee la salida de node con ReadLineAsync sondeado por un temporizador (sin manejadores en otros hilos). Una sola ventana a la vez (mutex). Con -SiToca solo se abre si toca, y cerrarla con la X sin copiar = «Recordar mañana». -Captura/-PulsaCopiar solo para comprobarla (dibuja la ventana en un PNG).
- Lanzada sin consola por avisoUsb.vbs: cada hora tras la copia diaria (copiaDiaria.vbs, sin esperarla) y con el acceso directo «Copiar al USB ahora» que instalaTarea.ps1 deja en Documentos\TradingSimulator_copias.
- Comprobado con un USB de mentira (COPIAS_USB_PRUEBA): sin elegir → no copia; marcar + copiar 57 MB + código (~17 s la primera vez, 3 s si ya está); el código se clona desde el bundle y da el mismo commit; copia del USB estropeada → FALLO; otro USB con otra marca → «No encuentro tu USB»; poda a 6 y fuera restos .enCurso; 14 días no toca, 15 sí; «Recordar mañana» lo calla; la ventana en sus dos estados y pulsando «Copiar» de punta a punta (capturas). Falta que Sergi lo haga con su USB.

## 132. Copias de seguridad: destino LIBRE (USB o cualquier carpeta)
- Pedido por Sergi (12/11): no quiere un único USB marcado. Fuera la marca (TradingSimulator_USB_COPIAS.json y «marcar»). copiaUsb.js: `revisa <carpeta>` y `copiar <carpeta>`; la copia va a <carpeta>\TradingSimulator_copias (si la elegida ya se llama así, esa misma); solo se borra dentro de ella (6 últimas, restos .enCurso), nada más de la carpeta.
- Avisos (revisa): MISMO DISCO FÍSICO que el sistema (Get-Partition: disco de la letra = disco de %SystemDrive%) → se puede, pero no protege si el disco falla y NO cuenta para el aviso de los 15 días; OneDrive en la ruta → se sube a la nube sin cifrar. Prohibido: dentro de la carpeta de las copias diarias y dentro del repositorio (público).
- _usb.json guarda ultimoDestino (la ventana lo propone primero, «(la última vez)»), y ultimaCopiaUsb/De/En solo con copias fuera del disco del PC.
- Ventana: «Dónde guardarla:» con la última vez, los USB conectados y «Otra carpeta…» (FolderBrowserDialog); debajo, en gris «Se guardará en … · N GB libres» o en ámbar los avisos, en rojo lo prohibido (Copiar desactivado). En modo comprobación (-Captura) no usa el mutex, para no chocar con una ventana real abierta. Arreglado: en PowerShell 5.1 «[]» de ConvertFrom-Json da un elemento vacío (sin USB conectado fallaba).
- Comprobado (scratchpad, 15/15): mismo disco copia con aviso y no cuenta; recuerda el destino; otro disco (COPIAS_OTRO_DISCO=1) cuenta; no anida TradingSimulator_copias; prohibidos repo, diarias y carpeta inexistente; detecta OneDrive; copia estropeada → FALLO; poda a 6 sin tocar otros archivos; el código se clona desde el destino; 15/14 días y «Recordar mañana». Ventana capturada pulsando «Copiar» y con una carpeta del mismo disco.

## 133. Copias de seguridad (parte 3): restaurar, con prueba de restauración real
- scripts/copias/restaurar.js `<copia> --prueba | --de-verdad` y `listar [carpeta]`. Ventana restaurarCopia.ps1 (acceso directo «Restaurar copia» en Documentos\TradingSimulator_copias, por restaurarCopia.vbs): lista las copias del PC, las «antes de restaurar» y las de un USB o carpeta («Buscar copias…»); «Probar (sin tocar nada)»; «Restaurar…» pide confirmación en la misma ventana (título rojo, «Sí, restaurar» / «Cancelar»).
- QUÉ SE RESTAURA: todo public (estructura, datos, permisos, políticas, funciones, disparadores, sus permisos por defecto y el disparador de eventos ensure_rls), los datos de auth.users, auth.identities, storage.buckets y storage.objects, y los archivos subidos (volumen /mnt del contenedor de storage, vaciado antes). NO las piezas internas de Supabase. Las sesiones se borran (TRUNCATE auth.users CASCADE): hay que volver a iniciar sesión.
- Cómo: lista de entradas del volcado (pg_restore -l, filtrada: esquema public + TABLE DATA de esas 4 tablas) → SQL (pg_restore -L -f) precedido de: session_replication_role = replica, DROP EVENT TRIGGER ensure_rls, borrar tablas/vistas/secuencias/rutinas/tipos de public (no los de extensiones; el esquema, su dueño y su ACL se quedan), TRUNCATE de las 4 tablas, y QUITAR los permisos por defecto de public (si no, cada función creada recibe además los permisos por defecto —p. ej. a anon— y no queda igual que la copia; el volcado los vuelve a poner al final). Todo en UNA transacción (psql -1, ON_ERROR_STOP) como supabase_admin; ensure_rls se crea al final con SET ROLE postgres (Supabase no deja que un superusuario cree un disparador de eventos con función de postgres: «Superuser owned event trigger must execute a superuser owned function», lo mismo que en §129). --de-verdad antes guarda cómo está todo en Documentos\TradingSimulator_copias\antes_de_restaurar\<fecha_hora> (copiaDiaria.js exporta copia(dia, final); al requerirlo no copia) y al final compara filas con el manifiesto.
- PRUEBA DE RESTAURACIÓN (--prueba, ~80 s, no toca la base): crea la base «restauracion_prueba» en el mismo Postgres; 1) pg_restore ENTERO → las 70 tablas (public, auth, storage) con las filas del manifiesto; 2) le aplica el procedimiento de --de-verdad → 35 tablas con las filas del manifiesto, ensure_rls activo y `pg_dump -s -n public` IDÉNTICO al de antes; además, informativo, igual al de la base de ahora; 3) la borra. Hecha el 12/11 con la copia del día: OK (70 tablas, 3.152.588 filas; 394 piezas; estructura igual a la base actual). También por la ventana (capturas).
- --de-verdad NO se ha lanzado contra la base real (no hacía falta: es el mismo procedimiento probado en la base aparte, y la base real no se toca sin motivo). LEEME_RESTAURAR.txt, punto 4, con los comandos.

## 134. Lanzador de doble clic: «Trading Simulator» y «Parar Trading Simulator»
- scripts/lanzador/lanzador.js `arrancar [--sin-navegador] | parar | estado`; ventana.ps1 (progreso, se cierra sola a los 4 s si sale bien; mutex); lanzador.vbs (sin consola); instala.ps1 crea en el Escritorio «Trading Simulator» y «Parar Trading Simulator».
- arrancar: Docker (docker desktop start --detach o Docker Desktop.exe; espera hasta 4 min a docker info) → Supabase (npx supabase@3.1.0 start -x … en %USERPROFILE%\TradingSimulator_local, si la base no está o no responde 127.0.0.1:54321/rest/v1/) → postgres-meta (docker start; si falla, solo aviso) → la app: si el 3000 no escucha, `npm run build` cuando hace falta y `next start` suelto y oculto (registro en %TEMP%\trading-simulator-app.log), espera a que responda → abre http://localhost:3000. Lo encendido se deja tal cual (se puede pulsar dos veces).
- ¿Recompilar? Si no hay .next/BUILD_ID, si .env.local es más nuevo (las NEXT_PUBLIC se graban al compilar) o si un commit desde la compilación tocó archivos de la app (fuera scripts/, docs/, sql/, bocetos/, .claude/, *.md). El gancho de versión cambia pages/index.js en cada commit: si solo cambió esa línea, no cuenta (el número de versión de la app puede ir algo atrás). Commits desde la compilación: exactos si la hizo el lanzador (.next/_lanzador_commit.txt), si no por la hora de BUILD_ID.
- parar: copia diaria si aún no hay de hoy → para la app (solo el proceso del 3000 si es el next de este proyecto: taskkill /T) → postgres-meta (antes que supabase stop, §129) → supabase stop (los datos se quedan en los volúmenes) → docker desktop stop (libera la memoria de WSL).
- Comprobado: estado y arrancar con todo encendido (ventana capturada). Docker Desktop sigue en el arranque de Windows (HKCU\…\Run).

## 135. «Comparar planes»: tarjetas plegables y sin cabecera de pasos ni pestañas
- Pedido por Sergi al ver §128 en local (12/11). Boceto bocetos/comparar-planes-v3.html con tres opciones (A tarjetas plegables, B cifras al lado, C pestañas); Sergi eligió la A.
- Al comparar (components/BuilderPlan.js), no salen la cabecera «1 Crear · 2 Probar · 3 Convertirla en plan» (es de la estrategia) ni la fila de pestañas de planes: los planes se eligen solo con los círculos de «Planes (hasta 4)». Si falla la lectura de los planes, su aviso rojo sí sale. «← Volver al plan» las devuelve.
- components/ComparaPlanes.js: «Cifras de cada plan» con «Ocultar ▲» / «Mostrar todas las cifras ▼». Plegado: una línea por plan (círculo, nombre, periodo · dinero; la prueba del paso 2 en su tooltip) con «Tienes al final», «CAGR del plan» y «Peor caída» (las mismas cifras, ⚠ y ★ que su tarjeta), «frente a QQQ/SPY» en puntos (solo las marcadas) y «Abrir» / ⧉; el gráfico pasa de 330 a 470 px. «plegado» se recuerda en este navegador con lo demás (CLAVE_COMPARAR).
- Ninguna cifra cambia (solo pantalla). Comprobación: scripts/comprobaciones/comparar-planes.js (§135: sin cabecera ni pestañas al comparar, plegar y desplegar, mismas cifras).

## 136. Lanzador: postgres-meta se rehace solo si la red de Supabase es nueva
- Visto el 12/11: `supabase stop` borra la red supabase_network_TradingSimulator_local y `supabase start` crea otra con el mismo nombre; el contenedor suelto de postgres-meta seguía apuntando a la vieja y `docker start` fallaba («network … not found»). El lanzador solo avisaba y `npm run backup` y los scripts de SQL fallaban («fetch failed»). La app y la copia diaria no lo usan.
- scripts/lanzador/lanzador.js: enciendeMeta() hace `docker start`; si falla (o no existe el contenedor), `docker rm -f` y `docker run` con la configuración de §129 (la misma de LEEME_RESTAURAR.txt; no guarda datos). Orden nueva `node scripts/lanzador/lanzador.js meta` (solo postgres-meta).
- Comprobado con la red rota a propósito (red temporal borrada): rehecho; ya encendido: «ya»; apagado: «encendido»; sin contenedor: rehecho. Después responde a SQL y `npm run backup` va bien. Sin comunes.sh: no cambia nada de la app.

## 137. «Comparar planes»: avisos en los tooltips del ⚠ y «CAGR Buy&Hold» con sus cuentas
- Pedido por Sergi al ver §135 (12/11, con captura). Sin la franja amarilla de arriba: cada aviso va en el tooltip del ⚠ de sus cifras (avisoCelda de lib/builder/comparaPlanes.js): «No meten el mismo dinero» en aportado, final, impuestos y comisiones; «No tienen el mismo periodo» en esas y en CAGR, TIR y caída; «No tienen los mismos impuestos o comisiones» en impuestos y comisiones, que llevan ⚠ aunque el dinero y el periodo coincidan (siguen comparándose). Los tramos, nunca.
- Benchmarks: la fila se llama «CAGR Buy&Hold QQQ/SPY» (plegado: «CAGR frente a QQQ/SPY»); su tooltip (textoRef) dice qué es (comprar el primer día y con cada aportación, sin vender hasta el último, con el mismo dinero, periodo, impuestos y comisiones del plan), con cuánto acabarías, su CAGR y el del plan, y la resta de los puntos con tres decimales para que cuadre con calculadora (20,537 % − 17,454 % = +3,08). La línea de encima, «Sin estrategia, con tu mismo dinero y periodo» con «?».
- Ninguna cifra cambia. Comprobación: comparar-planes.js (§137: sin franja, tooltips del ⚠, textoRef calculado a mano).

## 138. Lanzador: esperar a la base cuando Docker la enciende sola
- Visto por Sergi el 13/11 al encender el PC: «Supabase no arrancó: supabase start is already running. supabase_db… is not ready». El PC se había apagado sin «Parar»: Docker vuelve a encender solo los contenedores de Supabase (unless-stopped); la base aún arrancaba, el lanzador no la vio lista y lanzó `supabase start`, que falló.
- scripts/lanzador/lanzador.js: si el contenedor de la base está encendido pero no responde, espera hasta 3 minutos sin lanzar `supabase start`; si `supabase start` dice «already running», también espera. responde() solo cuenta una respuesta < 500 (antes un 503 de Supabase arrancando contaba como lista).
- Comprobado: rest parado 25 s (503) y kong parado 25 s (puerta cerrada): espera y termina bien. Sin comunes.sh: no cambia nada de la app.

## 139. El camino nuevo, parte 1: cabeceras de estrategia y de plan, y «Usar en un plan»
Decidido por Sergi el 13/11 (boceto bocetos/camino-completo.html, opción A «Dos talleres»): una estrategia tiene DOS pasos («1 Crear · 2 Validar») y un plan ya no es el paso 3 de ninguna estrategia (un plan puede tener una lista, varios bloques o pesos). Plan = Cartera + Tu dinero. Esta parte solo cambia cabeceras y nombres; ninguna cifra cambia y nada de lo guardado cambia.
- components/BuilderPanel.js, CabeceraPasos: ruta «Estrategias › <estrategia>» (fuera «Builder › Mi trabajo»); con zona="plan", «Planes › <nombre del plan>» y SIN pasos. La primera palabra vuelve a la lista (onVolver('miTrabajo'); sigue con data-ruta="mi-trabajo"). Pasos: PASOS_ESTRATEGIA (2). Botón «Usar en un plan» (data-boton="usar-en-plan"; onUsar, usarMotivo): hace lo que hacía el paso 3 (abre el plan de la estrategia o prepara uno nuevo sin guardar). extra: lo que va delante de los pasos. La barra de tres cajas de la portada (BarraPasos, PASOS) no se toca todavía: se va con las portadas nuevas.
- components/BuilderEditor.js: el TÍTULO es el nombre de la estrategia (el mismo input id="nombre-estrategia", sin borde, con ✎), con «Velas» y la versión al lado, en la fila fija de arriba (se ve en las tres pestañas). Fuera el rótulo «Paso 1 · Crear la estrategia» y la tarjeta «Nombre de la estrategia» (su nota larga, al tooltip de «Velas»). «Volver a los guardados» → «Descartar cambios»; «Guardar en la estrategia» → «Guardar»; «Guardar y pasar al paso 2» → «Guardar y validar ›». «Usar en un plan» pasa por la misma guardia de cambios sin guardar; desactivado en una estrategia nueva (sin guardar) o semanal, con el motivo en el tooltip.
- components/BuilderAzar.js: la «Guía: cómo se prueba una estrategia» pasa aquí (delante de los pasos; se abre sin perder lo que hay en pantalla; desactivada con una prueba en marcha). components/BuilderAzarResultado.js: «Paso 3 · Convertirla en plan» → «Usar en un plan».
- components/BuilderPlan.js: cabecera con zona="plan" y el nombre de la pestaña activa (nombreDe(actual)); «Abrir la estrategia ›» bajo el desplegable de la estrategia del bloque (lo que hacía el círculo 1; no sale si la estrategia está borrada). A validar se sigue yendo con «Probarla ahora» / «Ver la prueba».
- Textos: lib/builder/misListas.js («Qué toca ahora»: «Usar en un plan»), components/BuilderSenales.js («Guardar»), components/BuilderCodigo.js («← Estrategias»).
- Comprobaciones: planes-pantalla.js (cabecera de estrategia y de plan), planes-montaje.js (la ruta del plan es su nombre, sin pasos), borrar.js y version-paso2.js (5 nuevas: título = nombre, ruta, botones, «Usar en un plan» con cambios pregunta y, al salir sin guardar, abre el plan).
- Pendiente de las partes siguientes: menú agrupado y portadas de Estrategias y de Planes (entonces «Planes ›» llevará a su portada y «Usar en un plan» tendrá su desplegable); «Cartera» en filas con el ocioso dentro del bloque; bloque «Con pesos»; varios bloques.

## 140. El camino nuevo, parte 2: menú agrupado y portadas de Estrategias y de Planes
Boceto bocetos/camino-completo.html, opción A, pantallas 1 y 3. Ninguna cifra cambia y nada de lo guardado cambia.
- pages/index.js, el menú lateral: agrupado por el camino, con un rótulo por grupo (al plegarse, una raya): INVESTIGAR (Tesis, Screener, Watchlist, Fundamentals) · CREAR (Estrategias, Planes) · SEGUIR (TradeLog, Risk Mgmt, Alertas) · POR TRASLADAR (Backtesting, Optimización, Editor, Backtest de un valor). «Estrategias» y «Planes» abren el mismo panel (sidePanel 'builder') en su portada: builderIr ({ zona, n }) se lo pide a BuilderPanel y builderZona (onZona) dice cuál marcar. Pasan por salirDeTesis (preguntan si hay cambios sin guardar) y, a diferencia de antes, pulsarlas estando dentro de una estrategia o de un plan vuelve a la portada. Cada botón lleva data-menu-item.
- components/BuilderPanel.js: dos portadas (zona). ESTRATEGIAS: la lista de siempre («Mi trabajo») con el título «Estrategias»; fuera el título «Builder», la barra de tres cajas y la guía (está en Validar, §139); «Backtest de un valor» queda como enlace junto a «Nueva estrategia». PLANES (nueva): los planes guardados, con «Cartera» («100 % · «estrategia» en AAPL / una lista de N valores / el Nasdaq-100»), «Tu dinero» y «Periodo» (textoDinero y textoPeriodo de lib/builder/comparaPlanes.js), buscador con ✕, «Abrir», «+ Nuevo plan» y «Comparar planes» (con dos o más). Las cifras de cada plan no salen aquí todavía: se calculan al abrirlo o al comparar. «Estrategias ›» y «Planes ›» de la cabecera vuelven cada una a su portada (alVolver(cierra, zona)). Props nuevas: zonaInicial (pruebas), ir, onZona.
- components/BuilderPlan.js: props nuevo («+ Nuevo plan»: entra con un plan nuevo sin guardar aunque haya planes) y comparar (entra comparando). Las pestañas de planes siguen dentro de la pantalla del plan, por ahora.
- Comprobaciones: planes-montaje.js entra al plan por la portada de Planes (antes, por la barra de tres cajas) y tiene 6 nuevas (cartera y dinero de cada fila, «+ Nuevo plan», «Comparar planes», la portada de Estrategias sin barra, «Planes» del menú).
- Pendiente: cifras en la portada de Planes (final, CAGR, peor caída) y casillas para comparar; duplicar y borrar desde la portada; quitar las pestañas de planes; desplegable de «Usar en un plan»; «Cartera» en filas con el ocioso dentro del bloque; bloque «Con pesos»; varios bloques.

## 141. Portada de Planes: las cifras de cada plan y las casillas para comparar
Boceto bocetos/camino-completo.html, opción A, pantalla 3. Ninguna cifra cambia: son las de la pantalla del plan y de «Comparar planes».
- components/BuilderPanel.js: columnas «Tienes al final», «CAGR del plan», «Peor caída» y «Frente a B&H QQQ» (puntos de CAGR). Se calculan con el plan tal como está guardado, por /api/plan con curvas (cifrasComparacion de lib/builder/comparaPlanes.js: el mismo camino que «Comparar planes»), uno detrás de otro y solo con la portada a la vista; se recuerdan mientras el plan no cambie (cacheCifras, por el JSON del plan). Mientras llega, «…»; si falla, «—» con el motivo en el tooltip. Con una lista de valores no se calculan aquí (su petición es la de «La cartera por dentro»): la celda dice «al abrirlo».
- Casilla por plan (hasta 4, MAX_COMPARAR) y «Comparar los marcados (N)», encendido con dos o más. Los marcados son los que recuerda «Comparar planes» en el navegador (CLAVE_COMPARAR): se leen al entrar y se escriben al pulsar el botón; la pantalla de comparar entra con ellos.
- Comprobaciones: planes-montaje.js (3 nuevas). Comprobado en la app con los planes guardados: las cifras de la portada son las de cada plan abierto.
- Pendiente: cifras de los planes con lista en la portada; duplicar y borrar desde la portada; quitar las pestañas de planes; desplegable de «Usar en un plan».

## 142. El camino nuevo, parte 3: «Cartera» en filas y el dinero ocioso dentro del bloque
Plan = Cartera + Tu dinero (decisión de Sergi del 13/11; boceto bocetos/camino-completo.html, opción A, pantalla 4). Solo cambia DÓNDE se pinta cada cosa en la columna izquierda del plan: el plan guardado no cambia (el ocioso, «aportacionDentro» y el apalancamiento ya eran de la pieza) y ninguna cifra cambia.
- components/BuilderPlan.js, tarjeta «Cartera · en qué se invierte» (antes «Bloques»; sigue con data-tarjeta="bloques"): una barra con el reparto (hoy, un solo color al 100 %) y el bloque como una FILA que se pliega (data-fila-bloque; bloqueAbierto, solo en pantalla): «100 % · Estrategia · <nombre>» y, debajo, «en AAPL / una lista de N valores / el Nasdaq-100 · ocioso en <dónde>». Dentro del bloque, además de lo de siempre (estrategia, dónde se aplica, reparto y filtros con lista): «Dinero ocioso · mientras no hay señal, espera en», «Si llega una aportación con la operación abierta» (solo con una acción) y «Apalancamiento». Fuera: el rótulo «Bloque 1», «Parte de tu dinero» (el 100 % va en la fila), el desplegable apagado «Modo de asignación · Solo con listas» y el botón apagado «+ Añadir bloque» (volverá cuando un plan admita varios bloques).
- «Tu dinero · cuánto, cuándo y costes»: periodo, dinero inicial, aportación, impuestos y comisión.
- lib/builder/planPantalla.js: AYUDA_PLAN.cartera (el «?» de «Cartera»).
- Comprobaciones: planes-montaje.js (5 nuevas).
- Pendiente: bloque «Con pesos» (el motor de «pesos con reglas»), varios bloques por plan y «Volver al reparto entre bloques».

## 143. Pantalla del plan: las dos columnas se desplazan por separado
Pedido por Sergi al ver V9.1204: al llegar con la rueda al final de la columna de ajustes, seguía moviéndose la página (la columna de resultados no tenía barra propia: se desplazaba la página entera, §50). Solo cambia el desplazamiento; ninguna cifra ni nada guardado cambia.
- components/BuilderPlan.js (solo CSS y tres clases): en escritorio (≥ 1000 px) y con el plan abierto, la página (.bp-pagina con un hijo .bp-cols) NO se desplaza (overflow oculto, en columna); la ruta, las pestañas de planes y los avisos quedan fijos arriba, y las columnas .bp-izq (Cartera + Tu dinero) y .bp-der (cifras, gráfico, tablas) ocupan el alto que queda, cada una con su barra y con overscroll-behavior: contain. La columna izquierda deja de ser «sticky» (ya no hace falta).
- Al comparar planes o sin ningún plan abierto no hay .bp-cols: se desplaza la página, como antes. En pantallas estrechas (< 1000 px), nada fijo, como antes.
- Comprobado en la app (plan con «Una acción», ventana de 1400 × 800): la página no se desplaza; con la rueda hasta el final de cada columna, la otra no se mueve.

## 144. Plan: un solo selector de valores (sin «Una acción / Una lista»)
Decidido por Sergi el 14/11: el plan no distingue entre un valor y varios; se marcan uno o varios, como en el Backtesting. Primera parte de «el plan manda sobre la estrategia» (después: velas del plan y filtros con el catálogo). Lo guardado NO cambia de formato y ningún plan guardado cambia de cifras.
- components/BuilderPlan.js: fuera el interruptor «Una acción / Una lista» y el buscador «Acción». Siempre se ve el selector del Backtesting (PanelUniverso + SelectorValores) bajo «Valores · dónde se aplica». Con un plan de una acción enseña la lista manual con su único valor (listaDeAccion).
- Qué se guarda (ponValores): con UN valor de la lista manual y sin filtros encendidos → el plan de «una acción» de siempre (donde 'accion', activo); con varios, con el Nasdaq-100 o con algún filtro encendido → el de lista (donde 'lista'). Se decide solo al tocar valores, universo o filtros: un plan guardado se abre tal como está.
- «Reparto entre los valores» solo con varios valores o con el Nasdaq-100. «Si llega una aportación…» sigue solo con el plan de una acción.
- Los filtros (el panel del Backtesting) se ven también con un valor; al encender uno, ese valor se calcula como una lista de uno (como antes con «Una lista» y un valor) y una línea lo dice: sin «Compra más acción» ni apalancamiento por ahora.
- El selector enseña la Watchlist y, además, los valores marcados que no estén en ella y, al escribir en el buscador, los de los precios guardados (lo que ofrecía el buscador «Acción»): watchlistPlan. La pieza SelectorValores no se toca.
- lib/builder/planPantalla.js: el «?» de «Valores · dónde se aplica». lib/planes/lista.js: el error sin valores dice «marca al menos un valor.».
- Comprobaciones: plan-lista.js (pantalla y montaje rehechos para el selector único) y planes-pantalla.js.
- Pendiente (apuntado): demostrar con precios reales que una lista de un valor da lo mismo que «una acción» con ocioso e impuestos, para retirar una de las dos calculadoras; apalancamiento y «Compra más acción» con varios valores.

## 145. Plan: velas diarias o semanales (con un valor)
Decidido por Sergi el 14/11 («el plan manda sobre la estrategia», parte 2): el plan elige con qué velas calcula la estrategia. De entrada, las de la estrategia; si el plan pone otras, TODOS sus indicadores, señales y stops se calculan con las del plan. La estrategia guardada no cambia. Sin cambiar las velas, ningún plan cambia de cifras (los guardados llevan `velas: 'diarias'`).
- lib/planes/estrategia.js: `velas` de la pieza admite 'diarias' y 'semanales' (VELAS_PLAN, velasDePieza). operacionesDe, con semanales: las semanas se hacen con las diarias cerradas HASTA el último día del plan (semanalesDesdeDiarias; también las de los índices de la regla), mismo intérprete del paso 1 con intervalo 'semanal', y cada operación se sitúa en su DÍA (enSuDia / diaDeLaSemana), porque el dinero del plan se lleva día a día:
  - al precio de apertura de la semana → la primera sesión, a su apertura;
  - compra «al cierre» de la vela de la señal → la última sesión, a su cierre;
  - a un nivel (orden de compra o stop) → la primera sesión cuyo rango contiene ese precio; si queda en el hueco entre dos sesiones, la que abre al otro lado, a SU apertura (regla de lib/precioEnVela.js: un precio tiene que haber existido en su vela).
  Lo demás (ocioso, aportaciones, impuestos, apalancamiento, valoración diaria) no cambia.
- Por ahora, semanales SOLO con un valor y sin filtros del plan: con una lista (varios valores, Nasdaq-100 o filtro encendido), validaPiezaEstrategia lo dice y el plan no se calcula ni se guarda. Siguiente parte: semanales con varios valores (/api/multibacktest ya sabe '1wk').
- lib/planes/datosServidor.js: con una pieza en semanales, 30 años de historia diaria antes del periodo (el calentamiento son semanas), en vez de 6.
- lib/builder/planPantalla.js: ajuste `velas` (null = las de la estrategia; 'diarias' / 'semanales' = las que manda el plan), velasDeEstrategia, velasDelPlan; planDe guarda las velas con que se calcula y ajustesDe devuelve null si coinciden con las de la estrategia; «?» nuevo (AYUDA_PLAN.velas); «Copiar para Claude» dice las velas.
- components/BuilderPlan.js: «Velas en este plan» («Diarias · las de la estrategia» / «Semanales») con una línea azul cuando el plan manda otras; las estrategias de tarjetas semanales ya se pueden elegir en un plan.
- Comprobación nueva plan-velas.js (en comunes.sh): tres casos a mano con velas semanales (compra el lunes a la apertura de la semana y vende el lunes; stop tocado un miércoles; miércoles que abre bajo el stop → a su apertura), diarias idéntico con y sin el campo, el día de la semana, la validación y la pantalla.


## 146. Plan: velas semanales con VARIOS valores

Parte 2b de «el plan manda sobre la estrategia» (decisión de Sergi del 14/11). Hasta §145, las velas semanales del plan solo valían con un valor; con una lista (varios valores, Nasdaq-100 o un filtro del plan encendido) el plan lo impedía. Ahora se calcula.

- Cómo: «La cartera por dentro» pide el Backtesting con `intervalo: 'semanal'` (components/backtesting/PlanPorDentro.js, intervaloDe: las velas del plan, velasDelPlan); es la misma petición que antes en todo lo demás. «Tu dinero» (/api/plan) recibe esa misma petición (errorCuerpoLista exige el intervalo de las velas del plan), pide los candidatos a /api/multibacktest y, como vienen fechados en el LUNES de su semana y con velas semanales, los lleva al día a día con las velas DIARIAS de cada valor (lib/planes/datosServidor.js cargaDiarias: de la caché, de 10 en 10; la caché la acaba de rellenar el propio Backtesting) con lib/planes/estrategia.js listaEnSuDia.
- listaEnSuDia (pura): las fechas, aperturas y cierres de cada valor pasan a ser los de cada día (el dinero se valora cada día; antes, con semanas fechadas en lunes, un lunes festivo no existía en las fechas del plan) y cada candidato se sitúa en su día con las reglas de §145 (diaDeLaSemana: apertura de la semana = primera sesión; compra «al cierre» = última sesión; un nivel = la primera sesión cuyo rango lo contiene; en un hueco, a la apertura de la sesión que salta). Además: el cierre «virtual» de lo que sigue abierto va al ÚLTIMO día del valor dentro del plan, a su cierre (el Backtesting lo cierra al cierre de su última semana, que puede acabar después del último día del plan); una salida cuyo precio no se dio hasta el último día del plan, igual; una entrada de la última semana cuyo precio no se dio hasta el último día del plan no ha ocurrido y se quita; una entrada nunca queda antes de la salida anterior de ese valor. La puntuación y la puerta de cada candidato (el orden y el filtro del reparto) son las del Backtesting semanal, sin tocar.
- diaDeLaSemana marca con `aprox: true` cuando el precio no está en los días que recibe (devuelve, como antes, el último día a su cierre). Con un valor no cambia nada.
- validaPiezaEstrategia ya no rechaza semanales con lista.
- «Tu dinero» y «La cartera por dentro» NO cuadran al céntimo con semanales, y es correcto: «por dentro» trata la semana como un solo momento (el dinero de una venta del miércoles sirve para una compra del lunes de esa semana) y «Tu dinero» pone cada operación en su día. Decisión de Sergi (14/11): con semanales la línea «Comprobación» no se enseña (oroComparable de lib/builder/planPantalla.js) y el «?» de «La cartera por dentro» lo explica con un ejemplo (10.000 € en 4 valores; el miércoles un stop libera 2.500 €; la compra del lunes de esa semana se hace «por dentro» y no en «Tu dinero»).
- Textos: la línea de «La cartera por dentro» dice «con velas semanales»; «Copiar para Claude» dice las velas del plan también con lista; los «?» de «Lo que todavía no cuenta con una lista» y de «La cartera por dentro» dicen «con velas diarias» donde hablan de coincidir.
- Ninguna cifra cambia: con velas diarias no se toca nada (la petición es idéntica byte a byte; la prueba de oro sigue 18/18 y 3/3).
- Comprobaciones: plan-velas.js, apartado 4 (a mano, dos valores inventados, del lunes 02/03/2020 al miércoles 18/03/2020: compartido 50 × 9 + 25 × 25 = 1.075 €; concentrado máx. 1, 100 × 9 = 900 € porque el lunes A sigue abierta y B no entra; lo abierto se cierra el miércoles 18 a 25 y no a 30; una entrada a 15 que no llegó a darse, fuera; compra «al cierre», el viernes; lunes festivo, el martes; la petición, la ruta y la línea «Comprobación»). plan-tu-dinero-lista.js: /api/plan con la lista Degiro de la foto en semanales (concentrado máx. 4: 89.748,57 € frente a 84.663,33 € «por dentro», 152 operaciones; compartido: 71.109,24 € frente a 71.937,47 €, 365 operaciones; todas dentro de la vela de su día) y rechaza la petición diaria para un plan semanal.
- Pendiente: los filtros del plan con el catálogo de condiciones (parte 3) y el apalancamiento y «Compra más acción» con varios valores (parte 4).

## 147. Lanzador: «Parar solo la app»

Pedido al pasar las comprobaciones de §146: para compilar y pasar comunes.sh la app tiene que estar parada pero Supabase encendido, y «Parar Trading Simulator» lo apaga todo (luego había que volver a encender Docker y la base, unos minutos).

- scripts/lanzador/lanzador.js: orden `parar-app` (función pararApp, el mismo paso «la app» que ya hacía `parar`, sin cambios: solo apaga lo que escucha en el 3000 si es el next de este proyecto). No hace copia ni toca Docker, la base ni postgres-meta. `parar` hace lo mismo que antes.
- lanzador.vbs y ventana.ps1 aceptan la acción `parar-app` (títulos «Apagando solo la app…» y «✓ App apagada (la base sigue encendida)»).
- instala.ps1 crea además el acceso directo del Escritorio «Parar solo la app». Para volver a encenderla, el de siempre («Trading Simulator»: lo que ya está encendido se deja como está).
- Solo scripts del lanzador: la app no cambia.

## 148. Limpieza: las semanales ya entran en los planes (textos) y comprobación del screener más estable

Dos restos de §145–§146 y un fallo intermitente visto el 14/11.

- lib/builder/misListas.js: en «Estrategias», a una estrategia semanal le toca «Usar en un plan» (antes «—», con la nota de que las semanales llegarían más adelante a los planes). Como la prueba contra el azar solo admite velas diarias, a las semanales no se les propone «Probarla contra el azar»; su tooltip lo dice.
- components/BuilderEditor.js: el botón «Usar en un plan» del creador ya no se apaga con las semanales.
- components/BuilderPlan.js: fuera el aviso amarillo de que los planes eran solo de velas diarias (ya no podía salir).
- scripts/comprobaciones/screener.js: «abrir una vista desde una tesis», «una vista borrada» y «con cambios sin guardar» esperan a lo que buscan (20 s como máximo) en vez de 40 ms fijos; con el equipo cargado no bastaban.
- scripts/comprobaciones/planes-montaje.js: dos comprobaciones nuevas (a una semanal le toca «Usar en un plan»; no queda ningún texto de «más adelante»).
- Ninguna cifra cambia: solo textos, un botón y comprobaciones.

## 149. Motor: filas de filtro extra (varios símbolos, símbolo libre y semanal sobre diaria)

Parte 3a de «el plan manda sobre la estrategia» (decisión de Sergi del 14/11): los filtros del plan se elegirán de todo el catálogo de condiciones. Este commit solo prepara el motor; en pantalla no cambia nada y ninguna estrategia guardada lleva el campo nuevo.

- Decisión de Sergi (14/11): un filtro del plan funciona como «Solo opero cuando…» del paso 1: forma parte de la señal. Una señal «de un momento» (un cruce, una ruptura) bloqueada se pierde y se espera a la siguiente; una «de estado» (el cierre está sobre su media) compra cuando el filtro deja de bloquear, si sigue cumpliéndose. No es el método del panel de filtros del Backtesting (lib/filtros.js + lib/filtroEntrada.js), que calcula sin filtro y luego borra las operaciones cuya entrada cae en un día bloqueado: con filtros, las cifras del plan no coincidirán con las del Backtesting suelto. Sin interruptor: se explicará en un «?».
- Campo opcional nuevo de la definición del editor: `filtrosExtra: [{ quien, si, velas? }]`. `quien`: «valor» o un símbolo de Yahoo (cualquiera: QQQ, SPY, ^GSPC, otra acción); `si`: una condición del catálogo; `velas: «semanal»`: la fila se mira en semanas aunque la estrategia vaya en velas diarias. Todas las filas tienen que cumplirse (Y), junto al filtro de mercado de siempre (`filtroMercado`, que no cambia).
- lib/editor/interprete.js: cada fila es una serie alineada a las velas del valor; se combinan con la del filtro de mercado en la misma puerta que ya se miraba junto a la señal (los seis sitios de siempre). Sin filas, la serie es la misma de antes. Una fila de otro símbolo se calcula en sus sesiones (enReferencia); sin velas de ese símbolo, «sin dato»: no se entra. Una fila semanal: las semanas se hacen con las diarias (semanalesDesdeDiarias) y vale la última semana ya cerrada (proyectarSemanal de lib/filtros.js: el dato de una semana vale desde el lunes siguiente; el viernes en que cierra, todavía no).
- lib/editor/definicion.js: validaDefinicion revisa las filas (hasta 20; símbolo, velas y condición), los parámetros «$» que usen y fraseDefinicion las nombra. lib/editor/historia.js: su calentamiento cuenta; una fila semanal pide (velas + 2) × 5 diarias. lib/editor/exporta.js: con filas no se exporta a código. La huella de la regla las incluye.
- lib/editor/fuente.js: tickersDeDefinicion y tickersReferencia (todos los símbolos de referencia: el del filtro de mercado y los de las filas). pages/api/multibacktest.js (los dos caminos), pages/api/asset-detail.js y lib/backtestActivo.js cargan las velas de todos (antes, de uno). lib/pruebaAzar.js tickersDe también los ve (planes y paso 2).
- Ninguna cifra cambia: sin el campo, todo es idéntico (batería 52/52 y 44/44, huellas, planes).
- Comprobación nueva filtros-extra.js (en comunes.sh), a mano con 30 sesiones inventadas: sin filtros compra a 104; con una fila de otro símbolo, de estado a 110 y de un momento ninguna operación; con dos símbolos a 118; fila semanal (de otro símbolo y de «este valor») a 114; prueba de oro: una fila de un símbolo = el mismo filtro de mercado puesto en la estrategia, y una fila de «este valor» = la misma condición delante de la señal.
- Pendiente: 3b, el plan calcula con la «estrategia efectiva» (la guardada + las filas del plan, con o sin sus filtros propios); 3c, la pantalla del boceto bocetos/plan-valores-velas-filtros.html.

## 150. Plan: calcula con la «estrategia efectiva» (los filtros del plan, en el motor)

Parte 3b de «el plan manda sobre la estrategia». El plan ya sabe calcular con filtros añadidos en él y con o sin los filtros propios de la estrategia. Todavía SIN pantalla (llega en 3c): ningún plan guardado lleva el campo y en la app no cambia nada.

- La pieza «estrategia» de un plan puede llevar `filtros: { propios?: false, filas: [{ quien, si, velas? }] }`. `filas`: las añadidas en el plan (cualquier condición del catálogo sobre «valor» o sobre un símbolo; `velas: «semanal»` = mirada en semanas aunque el plan vaya en diarias). `propios: false`: los filtros que la estrategia trae de fábrica (su «Solo opero cuando…») no se aplican en este plan. Sin cambios, la pieza no lleva el campo.
- lib/planes/estrategia.js: definicionEfectiva(pieza) = la definición de la foto + las filas del plan (como filtrosExtra, §149) y, con `propios: false`, sin su filtro de mercado ni sus filas de «este valor» (escribeFiltro de lib/builder/tarjetas.js con cero filas). Sin cambios devuelve el MISMO objeto de la foto. La foto guardada nunca se toca. Con el plan en velas semanales, las filas son semanales de por sí (se quita la marca). La usan operacionesDe (y su caché), simbolosDe (las velas de los símbolos de las filas) y validaPiezaEstrategia (la estrategia efectiva tiene que ser válida; si los filtros propios no se pueden separar de la regla, no se pueden apagar).
- lib/planes/datosServidor.js: con una fila semanal, 30 años de historia diaria (como con velas semanales).
- Con varios valores: components/backtesting/PlanPorDentro.js manda al Backtesting la estrategia efectiva dentro de la petición (`definicionEditor` + `paramsEditor`, sin `strategyId`; /api/multibacktest ya lo admitía desde V9.1020) y pages/api/plan.js (errorCuerpoLista) comprueba que es la de su plan. Sin filtros del plan, la petición es la de siempre, byte a byte.
- lib/builder/planPantalla.js: ajuste `filtros` (null = ninguno), filtrosDelPlan, planDe y ajustesDe (ida y vuelta).
- Con UN valor, los filtros del plan ya no necesitan convertirlo en «lista de uno»: el motor de una acción los aplica, así que conserva el apalancamiento y «Compra más acción» (se verá al cambiar la pantalla).
- Ninguna cifra cambia: sin el campo, todo idéntico (planes 4, 6 y 7, batería, prueba de oro de la lista).
- Comprobación nueva plan-filtros.js (en comunes.sh), a mano con 10.000 € y las 30 sesiones de filtros-extra.js: sin filtros compra a 104 y acaba en 13.653,85 €; con una fila de otro símbolo, a 110 y 12.909,09 €; con dos símbolos, a 118; con una fila semanal, a 114. PRUEBA DE ORO: la fila puesta en el plan da el mismo patrimonio cada día que el mismo filtro puesto en la estrategia. Filtros propios: respetados, o apagados (queda como la estrategia sin filtros). Ida y vuelta de los ajustes y la petición de la lista.
- Sin hacer: probar con precios reales el camino de varios valores con filtros (necesita la app y la sesión: se hará al programar la pantalla, 3c).

## 151. La fila de condición, en su archivo (components/BuilderFila.js)

Primer paso de la pantalla de los filtros del plan (3c). En pantalla NO cambia nada.

- components/BuilderFila.js (nuevo): `Numero`, `Menu`, `BotonEnlace` y `Fila`, sacados TAL CUAL de components/BuilderEditor.js (las mismas 103 líneas, solo con `export` delante), con sus estilos (`entrada`, `mini`), `ASA`, `esParametro` y `val`. El creador los importa de ahí y pierde las importaciones que ya solo usaba la fila.
- Para qué: que el bloque del plan pinte sus filtros con la MISMA fila del creador («Solo opero cuando…»), sin copiarla.
- Comprobado: el creador se pinta idéntico antes y después (20 montajes: filtro de índice y de «este valor», NO, cruza, parámetro con nombre, un número mal escrito, menú «…» y «?» abiertos), y catalogo.js, version-paso2.js y comunes.sh entero.
- Ninguna cifra cambia (no se toca ningún cálculo).

## 152. Plan: la pantalla de los filtros (caja «Filtros · cuándo se puede comprar»)

Parte 3c de «el plan manda» (boceto bocetos/plan-valores-velas-filtros.html, aprobado por Sergi el 14/11). El motor ya sabía aplicarlos (§149 y §150); esto es la pantalla.

- components/FiltrosDelPlan.js (nuevo), dentro del bloque del plan, debajo de «Reparto»:
  - Caja MORADA «De la estrategia · su «Solo opero cuando…»»: sus filtros en una frase cada uno (solo para leer) y «En este plan: Se respetan / No se aplican» (con «?»). Si no se respetan, salen tachados. Decidido: el interruptor sale siempre que la estrategia lleve filtros propios (también sin filas del plan: así se ve la estrategia sin sus filtros). Si sus filtros no se pueden separar de la regla, sin interruptor: «se respetan siempre». Sin filtros propios: «Esta estrategia no lleva filtros propios».
  - Caja AZUL «Añadidos en este plan»: cada fila es la MISMA fila del creador (components/BuilderFila.js, §151): de quién («Este valor», los cuatro índices, «Otro símbolo…» con el buscador de valores con precios guardados), la condición con sus números, el menú «…» (NO, cruza), y con qué velas se mira («velas diarias / velas semanales» si el plan va en diarias; con el plan en semanales, todas semanales, sin selector). «+ Añadir filtro» abre una ventana propia con TODO el catálogo de condiciones (buscador sin acentos y con ✕; cada una con su «?»; Esc o «Cancelar» la cierran).
  - Al añadir el PRIMER filtro, si la estrategia lleva filtros propios (separables y respetados), pregunta: «Cancelar / Solo los del plan / Respetar los dos». La respuesta se aplica al elegir la condición (cancelar el catálogo no cambia nada).
  - Aviso amarillo en la fila si es idéntica a una de la estrategia (no hace nada). El «?» de la caja explica la señal «de un momento» (bloqueada, se pierde) y la «de estado» (compra cuando el filtro deja de bloquear), con ejemplo (decisión de Sergi del 14/11: sin interruptor, basta el «?»).
- lib/builder/filtrosPlan.js (nuevo, puro): fila guardada ({ quien, si, velas? }) ↔ fila de pantalla ({ cond, env, quien, velas }) con filaDe/envuelve de tarjetas.js; guardaFiltros normaliza con filtrosDelPlan (sin cambios = null, el plan de siempre); filtrosPropios (leeFiltro + frases); filasRepetidas; usoDeLaEstrategia; los textos de los «?».
- components/BuilderFila.js: props opcionales `opcionesDeQuien`, `ayudaQuien`, `extra` y `enVarias` (la línea puede partirse: la columna del plan es estrecha). El creador no las pasa: se pinta idéntico.
- components/BuilderPlan.js: la caja en el bloque y, bajo los avisos, la línea «La estrategia, tal como la usa este plan: nombre · velas · en X · con sus N filtros · + N filtros del plan», con lo que el plan cambia en azul.
- Nueva fila = en el Nasdaq-100 (QQQ), como en el creador; si la condición solo se puede mirar en el valor, en «Este valor».
- De momento el panel de filtros antiguo (el del Backtesting) sigue debajo; se quita en el commit siguiente (§153).
- Ninguna cifra cambia: sin filtros del plan, el ajuste es null y el plan es el de siempre (planes 4, 6 y 7; batería).
- Comprobación nueva plan-filtros-pantalla.js (en comunes.sh): ida y vuelta de las 32 condiciones del catálogo (con velas del plan y semanales) y el plan válido con cada una; a mano, la fila HECHA CON LA PANTALLA «REF: cierre sobre su SMA (3)» compra en d14 a 110 y acaba en 10.000 × 142 / 110 = 12.909,09 € (igual que escrita a mano), y la semanal, a 114; la caja montada (pregunta, interruptor, de quién, otro símbolo, velas, número mal escrito, quitar, repetida, plan en semanales, filtros no separables); dentro del plan: se recalcula con la fila y sigue siendo de «una acción».

## 153. Plan: fuera el panel de filtros antiguo (el del Backtesting)

Cierra la parte 3c. Los filtros del plan son ya solo los de la caja «Filtros · cuándo se puede comprar» (§152), del catálogo de condiciones.

- components/BuilderPlan.js: fuera los dos `FiltrosPanel` («FILTROS DE MERCADO» y «FILTROS DEL ACTIVO») y su aviso «se calcula como una lista de uno». Con UN valor, poner un filtro del plan ya NO lo convierte en lista: sigue siendo el plan de «una acción», con su apalancamiento y «Compra más acción» (los filtros del plan viven en el ajuste `filtros`, no en `lista.filtros`).
- `lista.filtros` (los del panel antiguo) se queda en el formato guardado, vacío. Ningún plan guardado los usa (4, 6 y 7). Por si alguno los llevara encendidos, el bloque lo dice en una línea amarilla con «Quitarlo» (se siguen aplicando hasta entonces, por el motor del Backtesting, como antes).
- lib/builder/planPantalla.js: fuera el «?» del panel antiguo (AYUDA_PLAN.filtros) y, en el «?» de «Velas en este plan», la frase «por ahora, las semanales solo con un valor y sin filtros del plan» (ya no es verdad desde §146 y §150).
- El Backtesting suelto no cambia: conserva su panel de filtros (components/FiltrosPanel.js y lib/filtros.js no se tocan).
- OJO, ya decidido por Sergi (14/11): los filtros del plan forman parte de la SEÑAL, como «Solo opero cuando…»; el panel antiguo BORRABA operaciones ya calculadas. Con filtros, las cifras de un plan no cuadran con las del Backtesting suelto con «el mismo» filtro.
- Ninguna cifra cambia sin filtros (planes 4, 6 y 7; batería; prueba de oro de la lista).
- plan-lista.js adaptada: ya no espera el panel antiguo; sí la caja nueva, un solo «+ Añadir filtro» y el aviso de filtros antiguos encendidos.

## 154. Plan: el selector de valores, plegado, y la caja de filtros sin frases de relleno

Pedido por Sergi al ver §152–§153 (15/11): el bloque ocupaba demasiado alto.

- «Valores · dónde se aplica»: PLEGADO en una línea con lo marcado («AAPL», «12 valores · AAPL, AMZN, ASML, GOOGL…», «Nasdaq-100 · 10 más volátiles»; el tooltip dice todos) y el botón «Cambiar ▾». Al pulsarlo se abre ahí mismo el selector de siempre (universo, buscador, ★, listas, «Todos / Ninguno») y «Hecho ▴» lo cierra. Opción A de las tres propuestas (frente a una ventana aparte o la lista más baja): al marcar se sigue viendo cómo cambian las cifras.
- Sin ningún valor marcado (un plan recién vaciado), la lista sale abierta y la línea dice «Ningún valor marcado» en amarillo.
- Al abrir la lista, los valores MARCADOS salen arriba (antes había que bajar para encontrarlos); el orden se fija al abrir, así que no saltan al marcar o desmarcar. components/backtesting/SelectorValores.js: prop opcional `primero` (el Backtesting no la pasa: idéntico, backtesting-panel.js 400/400).
- Al cambiar de plan, el selector vuelve a plegarse. Solo es de la vista: no se guarda nada nuevo.
- Caja de filtros: fuera «Esta estrategia no lleva filtros propios» (sin filtros propios no sale nada: ni caja ni frase) y fuera «Ninguno.» en la caja azul vacía (basta «+ Añadir filtro»).
- Ninguna cifra cambia (solo pantalla).
- Comprobaciones: plan-lista.js (plegado con uno, con varios y con el Nasdaq-100; abierto sin valores; «Cambiar ▾» abre con el marcado arriba, marcar otro no cambia el orden, «Hecho ▴» pliega), plan-filtros-pantalla.js y planes-pantalla.js adaptadas. Para las de siempre, que miran la lista abierta: `inicial.valoresAbiertos: true`.

## 155. Un solo cálculo, parte 1: el motor del plan entrega su «libro» (el detalle de lo que hace)

Decidido con Sergi el 15/11: «Tu dinero» y «La cartera por dentro» tienen que dar lo mismo. Habrá UN cálculo (el del plan) y la pestaña «Detalle» enseñará ese mismo cálculo por dentro (boceto bocetos/detalle-plan.html). Esta es la parte 1: solo el motor, sin cambios en pantalla.

- `ejecutaPlan(plan, datos, { libro: true })` (lib/planes/plan.js) devuelve además `libro`. Solo APUNTA lo que el motor ya hace: todas las órdenes pasan por `compra` y `vende`, los impuestos por `pagaImpuesto` / `pagaImpuestoLista` y la liquidación final, y las aportaciones por el bucle. Ningún cálculo cambia; sin la opción, la salida es exactamente la de antes (no existe la clave `libro`).
- `libro.movimientos`: cada compra y venta (fecha, pieza, símbolo, rol, participaciones, precio, importe sin la comisión y coste), cada aportación, cada pago de impuestos y, el último día, la venta de todo (una por símbolo) y el impuesto final, en el orden en que pasan.
- `libro.porSimbolo`: compras, ventas, costes, valor final y lo ganado (ventas + valor final − compras), antes de comisiones. `rol`: «valor» (el de la estrategia o los de su lista), «ocioso» u «otro» (piezas de activo, de cartera y la cesta). Si el ocioso es el mismo símbolo que el valor, cuenta como «valor».
- `libro.operaciones`: cada posición de un valor de la estrategia, desde que se abre hasta que se queda a cero, con sus totales (compras, ventas, costes, participaciones, resultado). Una posición puede tener varias compras (una aportación con «Compra más acción») y varias ventas (un trozo vendido para el impuesto de julio). La que sigue abierta el último día se cierra en la venta final (`abierta: true`).
- `libro.reparto`: por cada día de la serie, al cierre, los euros en valores, en el ocioso, en liquidez y en otros (suman el patrimonio).
- `libro.puente`: LA SUMA. aportado + ganado en valores + ganado en el ocioso + ganado en otros − costes − impuestos = lo que tienes al final (`valorNeto`); `descuadre` es lo que falta para cuadrar (0 salvo redondeo). Ejemplo a mano: 1.000 € en dos valores, A gana 99,80 € y B pierde 49,90 €, 4 órdenes de 1 € → 1.000 + 49,90 − 4 = 1.045,90 €.
- Si una compra no llega a comprar nada (el importe no cubre la comisión, o el símbolo no tiene precio ese día), el motor pierde ese dinero, como antes; el libro lo apunta como una compra de 0 participaciones para que la suma cuadre.
- `evaluaPlan(plan, datos, { detalle: true, libro: true })` lo pasa solo a la ejecución del plan (no a las comparaciones). `/api/plan` acepta `libro: true` y lo devuelve en `evaluacion.plan.ejecucion.libro`; con la lista Degiro la respuesta pasa de ~1,0 MB a ~1,7 MB. La pantalla todavía no lo pide.
- Comprobación nueva `scripts/comprobaciones/plan-detalle.js` (en comunes.sh): cuentas a mano (lista con y sin ocioso y aportaciones; un valor, «Compra más acción», impuesto de julio); con precios reales (AAPL con ocioso, 300 €/mes, impuestos y 0,185 €; ×2; las comparaciones; un plan de cartera sin estrategia; la lista Degiro en sus dos repartos): sin pedir el libro la salida es idéntica, la suma cuadra (descuadre ≤ 1e-8 €), el reparto de cada día suma el patrimonio, las operaciones suman lo ganado en los valores, los costes y el número de órdenes son los del plan; y `/api/plan` con y sin `libro`.
- Ninguna cifra cambia.
- Siguiente (parte 2): la pestaña «Detalle» con varios valores (la línea que suma, la tabla por valor con la fila del ocioso, el gráfico y los Buy&Hold con las reglas del plan).

## 156. Un solo cálculo, parte 2: la pestaña «Detalle» con varios valores

Boceto `bocetos/detalle-plan.html` (pestaña 1), aceptado por Sergi el 15/11. Con «Una lista», la columna derecha del plan tiene ahora tres pestañas: «Tu dinero», «Detalle» y «La cartera por dentro» (esta sigue mientras «Detalle» no tenga todos sus paneles). «Detalle» enseña por dentro el MISMO cálculo de «Tu dinero»: no pide nada aparte ni calcula nada del plan.

- La pantalla, con lista, pide `/api/plan` con `libro: true` (sin lista, la petición de siempre). Es la misma llamada de «Tu dinero»: pasar de una pestaña a otra no recalcula.
- Motor (`lib/planes/plan.js`): el libro trae además `curvas`: { símbolo: lo ganado con él hasta el cierre de cada día } de los valores y del ocioso (lo cobrado − lo comprado + lo que vale lo que se tiene; antes de comisiones). El último punto es su `ganado`. Sin pedir el libro, la salida es exactamente la de siempre.
- `lib/builder/detallePlan.js` (puro): con el libro prepara la línea de arriba (valores, velas, fechas reales, operaciones y órdenes, con cuántas son de la estrategia y cuántas del ocioso), la suma, una fila por valor (aportó, operaciones, ganadoras, Profit Factor, tiempo dentro), el total (con la parte media del dinero en valores), la fila del ocioso y las curvas. Textos de los «?» en `AYUDA_DETALLE` (nombres inventados, cuentas que cuadran).
- `components/PlanDetalle.js`: la línea de arriba (con «?» de las órdenes), LA LÍNEA QUE SUMA (lo que pusiste + ganado en los valores + ganado en el ocioso − comisiones − impuestos = «Tienes al final», con «✓» si cuadra con «Tu dinero»; sin ocioso no sale su trozo), «Qué aportó cada valor» (plegable; pulsar un valor lo resalta en «Valor a valor»; «↗» a la Watchlist con la misma guardia de cambios sin guardar) y «Cómo crece» con dos modos: «El plan» (el mismo gráfico y leyenda de «Tu dinero» y los «comprar y mantener» con las reglas del plan: las filas PLAN, ACTIVO, QQQ y SPY de la tabla de alternativas) y «Valor a valor» (lo ganado con cada valor y con el ocioso, en euros, los 10 que más pesan con color, leyenda pulsable y dato al pasar el ratón). Atenuado mientras llega un cálculo nuevo, como «Tu dinero».
- Falta (partes 3 y 4): ganancias mensuales, «Dónde está tu dinero cada día», resultados por operación, historial con «Todos los movimientos», Gantt, Excel, «Vista de gráficos», velas de un valor y «Detalle» con un solo valor. Mientras, una línea lo dice y siguen en «La cartera por dentro».
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada (apartado 5 y las curvas en todos los casos): a mano, lo ganado día a día con A y B (0 · 49,90 · 74,85 · 99,80 y 0 · −24,95 · −49,90 · −49,90), el ocioso (0 · 0 · 99,90 · 127,08) y lo que prepara detallePlan (A 50 % del tiempo, B 25 %, Profit Factor 99,80 / 49,90 = 2); en todos los casos reales, cada día: aportado + lo ganado hasta hoy − comisiones e impuestos pagados hasta hoy = patrimonio; la pantalla montada con `/api/plan` de verdad (lista Degiro, oro, 300 €/mes, impuestos, 0,185 €): la suma = «Tienes al final», la tabla suma lo ganado en los valores, la fila del ocioso, «El plan» / «Valor a valor», resaltar, plegar, «↗», vuelta a «Tu dinero» sin recalcular; sin libro lo dice; con ocioso en liquidez, sin aportaciones ni impuestos, el final = «La cartera por dentro».
- Ninguna cifra cambia.

## 157. Un solo cálculo, parte 3a: ganancias mensuales, dónde está tu dinero y resultados por operación en «Detalle»

Tres paneles más en la pestaña «Detalle» (components/PlanDetalle.js), con el mismo cálculo de «Tu dinero» (nada nuevo en el motor; las piezas puras en lib/builder/detallePlan.js):

- «Ganancias mensuales» (`mensuales`): una fila por año con sus 12 meses y «Año». Cada mes en % = lo que crece cada euro (el VL, como el CAGR; las aportaciones no cuentan como ganancia) y, al pasar el ratón, en euros = patrimonio al acabar el mes − al acabar el anterior − lo aportado en el mes. El último mes incluye la venta final. El año en % es el producto de sus meses y es la «Rentabilidad del plan» de «Año a año»; los euros de todos los años suman la ganancia neta.
- «Dónde está tu dinero cada día» (`dondeEsta`): cada día, al cierre, la parte en valores (azul), en el ocioso (amarillo) y en liquidez (gris), apiladas; la media de cada una en la leyenda; dato del día al pasar el ratón. Sustituye al «Capital empleado» del Backtesting.
- «Resultados por operación» (`porOperacion`): una barra por operación del libro, por fecha de venta, verde si gana y roja si pierde, en euros antes de comisiones e impuestos; arriba «N · X ganan · Y pierden»; al pasar el ratón, el valor, sus fechas y su resultado en € y en % (sobre lo que costó comprarla).
- La línea final dice ahora que faltan el historial, el Gantt, el Excel y los gráficos de cada valor (parte 3b).
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (enero de 2020 +4,59 % y +45,90 €; con aportación, enero −1 € y el año = final − aportado; dónde está 0 · 100 · 56,15 · 0 % en valores; B −10 % y A +20 %); con precios reales (lista Degiro, oro, 300 €/mes, impuestos), los 10 años de «Ganancias mensuales» = «Año a año» y suman la ganancia neta; y en la pantalla, los tres paneles con sus cifras.
- Ninguna cifra cambia.

## 158. Un solo cálculo, parte 3b: historial, Gantt, Excel y «Copiar para Claude» en «Detalle»

- «Historial · N operaciones» (components/PlanDetalle.js, `Historial`): «Tabla» con las operaciones del libro, la más reciente arriba (por fecha de venta), 50 cada vez con «Ver 50 más»; columnas valor, compra, venta (con «· abierta» si seguía abierta el último día), acciones, precios de compra y de venta, resultado en € y en % (sobre lo que costó comprarla). Buscador por valor con la ✕ (sin mayúsculas ni tildes); con búsqueda, «N de M · resultado». Pulsar un valor lo busca.
- «📅 Gantt»: el `GanttChart` del Backtesting tal cual, con las operaciones en su forma (`tradesBacktesting` de lib/builder/detallePlan.js: capital de entrada = lo comprado, resultado y %, días; la abierta al final como `_virtualClose`) y modo «pool». Prop nueva opcional `sinDescartados` en GanttChart: oculta la casilla «Mostrar descartados» (el plan no tiene descartadas); sin ella, el Backtesting sigue igual.
- «📊 Excel»: `exportHistorial` del Backtesting tal cual (se carga al pulsarlo), con las operaciones que se ven (todas o las del valor buscado).
- «📋 Copiar para Claude» en la línea de arriba: `textoDetalle` (la suma, la tabla por valor con el ocioso, los años de «Ganancias mensuales» y el resumen de operaciones), sin recalcular.
- Quedan para la parte 4: las velas de cada valor con sus operaciones, la «Vista de gráficos», «Todos los movimientos» y «Detalle» con un solo valor. La línea final de la pestaña lo dice.
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (orden y buscador del historial; A 499 € → +99,80 €, +20 %, 4 días; el texto de «Copiar para Claude»); en la pantalla con la lista Degiro, 50 filas con la última venta arriba, «Ver 50 más», buscar un valor con su resultado y la ✕, Gantt sin «Mostrar descartados» y el botón de copiar. Excel probado aparte con dos operaciones inventadas.
- Ninguna cifra cambia.

## 159. Un solo cálculo, parte 4a: «Todos los movimientos» en el historial de «Detalle»

Decidido con Sergi el 15/11 (boceto bocetos/detalle-plan.html): el historial de «Detalle» tiene «Operaciones (N)» (por defecto, con Gantt y Excel) y «Todos los movimientos».

- `movimientos(libro, serie, ocioso)` de lib/builder/detallePlan.js: cada movimiento del libro con lo que pasa en palabras («Dinero inicial», «Aportación», «Compra AAPL · 12,00 × 215,00 €», «Ocioso: vende oro (GLD) · …», «… (venta final del último día)», «Impuestos de 2024 (se pagan en julio)», «Impuestos pendientes al vender todo el último día»), su signo (+ entra, − sale), el importe sin comisión, la comisión y, al cierre de ese día, el dinero en valores y en el ocioso (con el ocioso en liquidez, la liquidez). `filtraMovimientos`: el más reciente arriba, filtrado por valor (o por texto, con 3 letras o más).
- Pantalla (`Historial` de components/PlanDetalle.js): botones «Operaciones (N)» / «Todos los movimientos» / «📅 Gantt»; los movimientos, 50 cada vez con «Ver 50 más», colores por tipo (aportación azul, impuestos rojo, ocioso amarillo); el buscador vale para los dos; sin Excel en los movimientos.
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (los 5 movimientos de la lista A/B con sus textos, signos y dinero al cierre; el ocioso O en palabras; «Impuestos de 2020 (se pagan en julio)»), y en la pantalla con la lista Degiro (2.979 movimientos; el primero, los impuestos al vender todo; buscar «gld» deja los 1.280 del oro).
- Ninguna cifra cambia.

## 160. Un solo cálculo, parte 4b: las velas de cada valor y la «Vista de gráficos» en «Detalle»

- Pulsar un valor en «Qué aportó cada valor» enseña, en lugar de «Cómo crece», «VALOR · sus velas con las operaciones del plan» (boceto bocetos/detalle-plan.html), con «← Volver al gráfico del plan» y una línea con lo que aportó, sus operaciones y cuántas ganan. Antes, ese clic resaltaba el valor en «Valor a valor»; eso sigue con la leyenda de ese gráfico.
- `GraficoVelasValor` (components/PlanDetalle.js, SVG): el precio en las fechas del plan (velas si caben a ≥ 3 px; si no, la línea del cierre: en 10 años de diarias no caben) y cada operación del libro de ese valor con ▲ en la compra, ▼ en la venta y una línea verde (gana) o roja (pierde) entre sus precios; dato al pasar el ratón (fecha, cierre y, sobre una operación, sus fechas y su resultado). Sin indicadores de la estrategia (decidido por mí: se pintan las operaciones del plan, no se recalcula la estrategia; los indicadores se pueden añadir más adelante con el intérprete del paso 1 si Sergi los echa de menos).
- Las velas: las de `/api/velas` (las mismas del paso 1: caché + lo último de Yahoo), leídas una vez por valor y guardadas mientras la pestaña está montada; se recortan a las fechas del plan al pintar (`velasDe` y `opsEnVelas` de lib/builder/detallePlan.js). `limitador`: como mucho 4 lecturas a la vez.
- «Vista de gráficos»: cerrada por defecto («Ver un gráfico por valor (N) ▾»); abierta, un gráfico pequeño por valor con lo que aportó y sus operaciones; pulsar uno lo abre en grande arriba.
- Fuera la línea «… llegarán a esta pestaña»: lo del boceto con varios valores ya está. Queda «Detalle» con un solo valor (parte 4c).
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (recorte de velas e índices de compra y venta) y en la pantalla con la lista Degiro (TSLA: 2.514 velas y sus 48 operaciones; volver; la vista cerrada no pide nada; abierta, 11 gráficos con 11 lecturas, como mucho 4 a la vez; pulsar uno pequeño lo abre en grande).
- Ninguna cifra cambia.

## 161. Un solo cálculo, parte 4c: «Detalle» también con un solo valor

Boceto bocetos/detalle-plan.html, pestaña 2.

- La pantalla pide `/api/plan` SIEMPRE con `libro: true` (antes, solo con lista). Con un solo valor, la columna derecha tiene ahora dos pestañas: «Tu dinero» y «Detalle» (sin «La cartera por dentro», que es el Backtesting con lista).
- `detallePlan` dice `unValor` y `simbolo`. En «Detalle» con un valor: la línea de arriba «1 valor (AAPL) · …», la suma, sus velas con sus operaciones a la vista (sin «← Volver»), «Cómo crece» solo con «El plan» (el gráfico de «Tu dinero» con su Buy&Hold del valor y la tabla de los «comprar y mantener»), y debajo lo mismo que con varios: ganancias mensuales, dónde está tu dinero, resultados por operación e historial con «Todos los movimientos». Sin la tabla «Qué aportó cada valor», sin «Valor a valor» y sin «Vista de gráficos» (con un valor no aportan nada).
- «Comparar planes» usa la misma llamada: también trae el libro (con un valor ocupa poco).
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (unValor, su símbolo y la suma 10.000 + 857,14 = 10.857,14 €) y en la pantalla con AAPL, oro, 300 €/mes e impuestos (pestañas, suma = «Tienes al final», sus 123 operaciones en las velas, lo que no sale, mensuales e historial, y vuelta a «Tu dinero» con la misma cifra).
- Ninguna cifra cambia.

## 162. Un solo cálculo, parte 5a: buscador en toda la fila, fila de cifras y columnas por valor como el Backtesting

Boceto bocetos/detalle-final.html, aceptado por Sergi el 16/11 (tres recomendaciones + «CAGR por valor se queda» + «Dinero en él» en una sola columna en %, con los € en el tooltip).

- FALLO ARREGLADO (visto por Sergi): el buscador del historial solo miraba el valor (y el texto con ≥ 3 letras): «39» no encontraba un precio de 397,00 €. Ahora mira TODA la fila (valor, fechas dd/mm/aaaa, qué pasa, acciones, precios, importes, resultado y %), sin tildes ni mayúsculas, sin el punto de los miles («1.000» = «1000») y con varias palabras a la vez («b 18»). `textoDeOperacion`, `textoDeMovimiento` y `coincideBusqueda` de lib/builder/detallePlan.js. Con la lista de la prueba, «39» encuentra 330 movimientos (antes, 0).
- Fila de cifras (`FilaCifras`, `detalle.cifras`) debajo de la suma: CAGR del plan, ganancia (% y €), peor caída (% y €), ganadoras (N de M), Profit Factor, dinero en valores de media (€ en el tooltip) y tiempo con algo invertido (días con al menos una operación abierta ÷ días del plan).
- Tabla por valor, columnas como el Backtesting: Aportó, «Aportó %» (sobre lo que pusiste; sin aportaciones, el dinero inicial: el G.Comp % del Backtesting; suman el total), «CAGR de su aportación» (((base + aportó) / base)^(1/años) − 1, la fórmula del Backtesting), Operaciones, Ganadoras, Profit Factor, «Peor caída» del valor (en % de lo puesto hasta el pico + lo ganado con él en el pico; los € en el tooltip), «Dinero en él» (de media, la parte del patrimonio de cada día en ese valor; € en el tooltip; los valores suman el total: el Cap. inv. del Backtesting, pero con el valor de lo que se tiene, no su coste) y Tiempo dentro. Cada columna nueva con su «?».
- Motor: el libro apunta además `enValor` (lo que vale lo que se tiene de cada valor y del ocioso al cierre de cada día). Sin pedir el libro, la salida es la de siempre.
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (A +9,98 %, B −4,99 % y su caída −49,90 €; dinero en A de media 280,69 €; cifras: ganancia 45,90 €, 2 de 4 días con algo invertido; el buscador con precios, fechas, importes y varias palabras) y en la pantalla (7 cifras, 9 columnas, «Dinero en él» y «Aportó %» suman el total, «39» en los movimientos).
- Ninguna cifra cambia.

## 163. Un solo cálculo, parte 5b: el «%» de señales que entran, contado por el motor del plan

Pedido por Sergi el 16/11: mantener el «100 %» junto a «Ops» de la «Comparativa» del Backtesting con su tooltip, pero FIEL al cálculo del plan.

- Motor (lib/planes/plan.js, solo con el libro y con lista): `libro.senales` = { generadas, ejecutadas, motivos: { slots, filtro, dinero, yaDentro }, descartadas: [{ simbolo, entryDate, exitDate, motivo, ret, cap, hipotetico }], porSimbolo }. Cada candidato del Backtesting cuenta al llegar su día; si no entra, con su motivo: sin hueco libre (concentrado con todos los puestos ocupados), no pasa el filtro de la prioridad (pasaPuerta), sin dinero libre ese día, o ya tenías ese valor; y lo que habría ganado con el dinero que le tocaba ese día (cap × (salida / entrada − 1)). Solo apunta: ninguna decisión cambia.
- `resumenSenales` y `textoSenales` (lib/builder/detallePlan.js): % que entraron; de las que no, ganadoras, Profit Factor y lo que habrían ganado o perdido (estimación, sin el efecto en cadena), con una línea que dice que está contado con el dinero de ESTE plan (ocioso, aportaciones, impuestos).
- Pantalla: en «Qué aportó cada valor», junto a las operaciones del total, el «%» (verde si entraron todas; naranja si no) con ese tooltip; en cada valor, al pasar el ratón por sus operaciones, «De N señales de X, entraron M». Con un solo valor no sale (la estrategia entra en todas sus señales).
- Comprobación `scripts/comprobaciones/plan-detalle.js` ampliada: a mano (compartido 2 de 2; concentrado máx. 1: entra A y B no por falta de hueco, B habría perdido un 10 %; A fuera por el filtro); con la lista Degiro real, generadas = candidatos y ejecutadas = operaciones (concentrado: 1.699 = 777 + 836 sin hueco + 86 sin dinero); y el «%» con su tooltip en la pantalla.
- Ninguna cifra cambia.

## 164. Un solo cálculo, parte 5c: las velas de «Detalle» con el gráfico del Backtesting y del historial a su operación

Pedido por Sergi el 16/11 (boceto bocetos/detalle-final.html, pestaña 4): mantener el diseño de los gráficos del Backtesting y que pulsar una operación del historial lleve a su gráfico con ella seleccionada.

- Fuera los gráficos de velas propios de §160 (SVG `GraficoVelasValor`, la lectura con /api/velas, la caché y el `limitador`). En su lugar, `AssetSignalChart` de components/BacktestCharts.js TAL CUAL (velas, rueda para acercar, arrastrar, etiquetas y globo de cada operación), con las operaciones de ESTE plan: `senalesGrafico(ops, símbolo)` de lib/builder/detallePlan.js (entradas, salidas y `trades` con n, precios, % y € en la forma del Backtesting). El gráfico pide sus velas a /api/chartdata cuando se ve, como en el Backtesting.
- Velas de un valor (pulsar un valor de la tabla, o con un solo valor, siempre): el gráfico del Backtesting de 420 px con todo el periodo del plan.
- Del historial a su gráfico: pulsar una fila de «Operaciones» (o una barra de «Resultados por operación») abre las velas de su valor centradas en esa operación (de 30 días antes de comprar a 30 después de vender, como el historial del Backtesting) y la resalta (`focoDeOperacion`: su número entre las de su valor, por fecha de compra). Una línea dice qué operación es y «Ver todo el periodo» quita el foco. Pulsar el valor de la fila sigue buscándolo.
- «Vista de gráficos»: un gráfico del Backtesting por valor (300 px, uno debajo de otro), con lo que aportó, sus operaciones y las que ganan, y «Ver en grande ↑».
- BuilderPlan ya no pasa `cargaVelas` a «Detalle». Se quedan `velasDe` y `opsEnVelas` en lib/builder/detallePlan.js (las usan las pruebas).
- Comprobación `scripts/comprobaciones/plan-detalle.js` adaptada: a mano (las señales del gráfico de A: +20 %, 499 € → 598,80 €; su foco del 04/12/2019 al 06/02/2020) y en la pantalla (TSLA con sus 48 operaciones; volver; la vista con 11 gráficos y «Ver en grande»; la primera fila del historial abre su gráfico centrado en ella; «Ver todo el periodo»).
- Ninguna cifra cambia.

## 165. Un solo cálculo, parte 5d: ocultar el panel de la izquierda del plan

Pedido por Sergi el 16/11 (opción A del boceto bocetos/detalle-final.html, aceptada).

- Arriba del panel de la izquierda («Cartera» y «Tu dinero»), «◀ Ocultar el panel»: el panel se pliega a una franja estrecha vertical «▶ Cartera · Tu dinero» y la columna de la derecha («Tu dinero» / «Detalle») usa todo el ancho. Pulsando la franja vuelve. Se recuerda en este navegador (localStorage `builder_plan_panel_oculto`).
- Plegado, el panel sigue montado (con display: none), así no se pierde nada de lo que esté abierto o a medio escribir.
- Comprobación `scripts/comprobaciones/plan-detalle.js`: ocultar (franja, panel oculto y montado) y volver a ver.
- Ninguna cifra cambia.

## 166. Un solo cálculo, parte 5e: ampliar los gráficos a pantalla completa

Pedido por Sergi el 16/11 (opción A del boceto bocetos/detalle-final.html, aceptada).

- `Ampliable` (components/PlanDetalle.js): «⤢ Ampliar» encima de cada gráfico lo abre a pantalla completa; «✕ Cerrar (Esc)» o la tecla Esc lo devuelven. Dentro, los gráficos leen el alto disponible de `AmpliadoCtx` (alto de la ventana − 150 px) y miden su ancho: salen más altos y más anchos, con más detalle de fechas.
- Con «⤢ Ampliar»: en «Tu dinero», «Cómo crece tu dinero»; en «Detalle», «Cómo crece» (el plan y valor a valor), las velas de un valor (el gráfico del Backtesting, con su rueda para acercar), «Ganancias mensuales», «Dónde está tu dinero cada día» y «Resultados por operación».
- `altoAmpliado(amp, normal, menos)`: el alto de cada gráfico cuando está ampliado (nunca menos que el normal).
- Comprobación `scripts/comprobaciones/plan-detalle.js`: «Dónde está tu dinero» ampliado pasa de 168 a 628 px y «✕ Cerrar» lo devuelve; cada gráfico de «Detalle» tiene su «⤢ Ampliar».
- Ninguna cifra cambia.

## 167. «Detalle»: arreglos pedidos por Sergi al ver la parte 5 (16/11)

- Los valores de «Qué aportó cada valor» salen PLEGADOS al entrar (el total y el ocioso a la vista); «▸ Los N valores» los despliega.
- La fila del total ya tiene su «Peor caída» (antes, vacía): la de lo ganado con todos los valores juntos (la suma de sus curvas), como el Max DD de la fila de la estrategia en el Backtesting; los € en el tooltip.
- La rueda del ratón ya no acerca el gráfico de velas sin querer al bajar por la página: `AssetSignalChart` (components/BacktestCharts.js) aprende la prop opcional `ruedaTrasClic` (sin ella, el Backtesting igual): la rueda está apagada hasta hacer clic en el gráfico y se apaga al salir de él; una etiqueta lo dice («Haz clic en el gráfico para acercar con la rueda» / «Rueda: acercar y alejar»). Arrastrar sigue moviendo el gráfico. «Detalle» la usa en todos sus gráficos de velas.
- Historial: pulsar el VALOR de una fila filtraba el historial por ese valor (y Sergi creía que no llevaba a su gráfico). Ahora pulsar cualquier parte de la fila, también el valor, lleva al gráfico de ese valor centrado en esa operación; para filtrar está el buscador.
- Comprobación `scripts/comprobaciones/plan-detalle.js`: plegados al entrar; la peor caída del total (−34,0 %, −77.746,84 € con la lista de la prueba); pulsar la fila lleva a su operación sin filtrar; la rueda apagada, activa tras un clic y apagada al salir.
- Ninguna cifra cambia.

## 168. Un solo cálculo, parte 5f: fuera «La cartera por dentro» del plan

Con el OK de Sergi (16/11: «Si se repara todo esto, puedes seguir»), tras comprobar «Detalle». Cierra la ronda «un solo cálculo»: el plan tiene UNA cifra y dos pestañas, «Tu dinero» y «Detalle».

- components/BuilderPlan.js: fuera la pestaña «La cartera por dentro» y su componente (PlanPorDentro), la línea «Comprobación: «La cartera por dentro» acaba en X € y tu plan, en Y €» (data-oro) y la condición de «Calculando…» que dependía de ella. Los motivos de «no se calcula» (estrategia borrada o cambiada) ya no la nombran.
- lib/builder/planPantalla.js: fuera `oroComparable`, `AYUDA_PLAN.porDentro` y `AYUDA_PLAN.listaSinMotor`; el «?» de lo que cuenta con una lista ya no habla de la línea «Comprobación».
- Se queda de components/backtesting/PlanPorDentro.js la PETICIÓN de los candidatos (`peticionPorDentro`, `motivoSinPeticion`, `intervaloDe`), que «Tu dinero» con varios valores manda a /api/plan; el componente sigue en el archivo hasta retirar el Backtesting suelto (sin uso en el plan). /api/plan sigue devolviendo `finalPorDentro` (lo usan las pruebas de oro de plan-tu-dinero-lista.js).
- Comprobaciones adaptadas: plan-por-dentro.js (apartado 3: «Tu dinero» y «Detalle», sin «por dentro» ni peticiones aparte), plan-detalle.js (dos pestañas; sin la línea «Comprobación») y plan-velas.js (fuera la prueba de oroComparable).
- Ninguna cifra cambia.

## 169. «Comparar con otras estrategias», parte a: ids como texto y copias sin guardar (16/11)

Primera parte de «Comparar con otras estrategias» (boceto bocetos/detalle-final.html, pestaña 3; Sergi dijo «sí, los cinco» el 16/11). Sin pantalla nueva todavía: prepara «Comparar planes» para aceptar copias sin guardar.

- lib/builder/comparaPlanes.js: los ids se comparan como TEXTO (`mismoId`): los planes guardados tienen un número y las copias, «v-<id de la estrategia>». `elegidosIniciales` y `alterna` devuelven cada id tal como es (un 4 sigue siendo 4). `copiaConEstrategia(a, estrategia, nombrePlan)` = `planDe` con los ajustes de AHORA del plan abierto (con lo no guardado) y otra estrategia; solo cambia la estrategia. Nombre «<plan> · con <estrategia>». `copiasDe`, `esCopia`, `paraRecordar` (lo que se guarda en el navegador, sin copias) y `TITULO_COPIA`.
- components/BuilderPlan.js: `comp.copias` (ids de estrategias de tarjetas; de momento solo llega por `inicial.compararCopias`, la pantalla para elegirlas es la parte b); `copiasComp` y `todosComp` (guardados + copias) alimentan las fichas, las peticiones y la línea de la prueba del paso 2. Una copia se calcula con la misma llamada y la misma caché que un plan guardado.
- components/ComparaPlanes.js: ids como texto; en una copia, en lugar de «Abrir» y «⧉», la etiqueta amarilla «sin guardar» (tooltip TITULO_COPIA). «Guardar como plan» llega en la parte d.
- Comprobación: comparar-planes.js, apartado 5 (13 nuevas). A mano: la copia del plan A con su misma estrategia acaba en 10.694,29 €, igual que el plan A.
- Ninguna cifra cambia.

## 170. «Comparar con otras estrategias», parte b: el botón y su desplegable (17/11)

Boceto bocetos/detalle-final.html, pestaña 3 (puntos 1, 2 y 5 aceptados por Sergi el 16/11).

- components/MenuCompararEstrategias.js (nuevo): botón «Comparar con otras estrategias ▾» junto a «Comparar planes» (solo con estrategia en el plan); desplegable opaco con tus estrategias de tarjetas MENOS la del plan, por nombre, con casillas, hasta 3 (MAX_COPIAS); buscador con ✕ si hay más de 6; «?» con ejemplo (AYUDA_COPIAS); «Cancelar» y «Comparar (N)». Se cierra al pulsar fuera o con Esc.
- lib/builder/comparaPlanes.js: `MAX_COPIAS` (= MAX_COMPARAR − 1), `ID_AHORA` y `copiaDeAhora` («<plan> · tal como está»: el plan de la pantalla tal cual), `eleccionCopias` (la base es el plan guardado si no tiene cambios; si los tiene o es nuevo, «tal como está»; detrás, una copia por estrategia), `AYUDA_COPIAS`.
- components/BuilderPlan.js: `comp.conAhora`; «Comparar (N)» entra en la comparación con la base y las copias elegidas; al salir de la comparación, las copias se olvidan (al volver con «Comparar planes» salen solo los guardados) y nunca se recuerdan en el navegador.
- Comprobación: comparar-planes.js, apartado 6 (15 nuevas). A mano: «Plan A · tal como está» acaba en 10.694,29 €, igual que el plan A.
- Ninguna cifra cambia.

## 171. «Comparar planes»: los costes se comparan por lo que significan (17/11)

Visto por mí en la app al probar §170 con la sesión de Sergi (plan 7 «Prueba editor EMA20» con SuperTrend 10/3): las dos tarjetas decían «impuestos de España · 0,37 € fijos por operación» y aun así salía ⚠ en impuestos y comisiones («No tienen los mismos impuestos o comisiones»). La clave comparaba el JSON guardado de los costes, y el plan guardado y su copia los escriben distinto con el mismo significado.

- lib/builder/comparaPlanes.js: claveCostes compara el régimen de impuestos, el % de comisión, el mínimo por orden y las horquillas mayores que 0 (sin costes = ceros).
- Comprobación: comparar-planes.js, apartado 7 (3 nuevas).
- Ninguna cifra cambia (solo desaparece un ⚠ falso).

## 172. «Comparar con otras estrategias», parte c: la vista «Tabla» (17/11)

Boceto bocetos/detalle-final.html, pestaña 3 (punto 3 aceptado por Sergi el 16/11): como la tabla «COMPARATIVA DE ESTRATEGIAS» de «La cartera por dentro», pero con el cálculo del plan.

- lib/builder/comparaPlanes.js: COLUMNAS_TABLA (Operaciones, CAGR, Ganancia, Ganadoras, Profit Factor, Peor caída, Peor caída €, Dinero en valores, Tiempo invertido); filaTabla(respuesta, plan) saca la fila del plan y las de sus valores de detallePlan (la pestaña «Detalle»: nada se calcula aparte); bhTabla: «Buy&Hold» de los valores del plan con sus reglas (referencia ACTIVO), SOLO si todos los planes tienen los mismos valores, dinero, periodo y costes; mejoresTabla (★); AYUDA_TABLA con ejemplo; eleccionCopias entra con vista «tabla».
- components/ComparaPlanes.js: conmutador «Tabla / Tarjetas» junto a «Cifras de cada plan»; en «Tabla», una fila por plan (punto de color, nombre, «· sin guardar» en las copias, debajo la estrategia y el valor o cuántos valores) con ▸ para ver sus valores, «Expandir todo / Plegar todo», ⚠ y ★ como en las tarjetas (ganancia y caída en € dependen del dinero; CAGR y caída en %, del periodo) y la fila Buy&Hold; gráfico de 470 px. «Ocultar ▲» solo con las tarjetas.
- components/BuilderPlan.js: comp.vista (null = tarjetas; desde «Comparar con otras estrategias», «tabla»; se olvida al salir).
- Comprobación: comparar-planes.js, apartado 8 (las respuestas de prueba llevan ya el libro, como las de /api/plan). A mano: plan A +694,29 € (10.694,29 − 10.000), 1 operación ganadora, PF «—»; TEST aportó 857,14 € antes de impuestos.
- Ninguna cifra cambia.

## 173. «Comparar con otras estrategias», parte d: «Guardar como plan» (18/11)

Boceto bocetos/detalle-final.html, pestaña 3 (punto 4 aceptado por Sergi el 16/11). Cierra «Comparar con otras estrategias».

- components/ComparaPlanes.js: en cada copia sin guardar, junto a la etiqueta «sin guardar», el botón verde «Guardar como plan» (en las tarjetas, en la línea plegada y en la vista «Tabla»). Solo con conexión a la base.
- components/BuilderPlan.js: pideGuardarCopia abre la ventana del nombre («Guardar «<copia>» como plan nuevo»), con «<plan> · <estrategia>» propuesto (el plan tal como está: «<plan> (copia)»); al guardar, crearPlan con el plan de la copia TAL CUAL, su pestaña detrás de la abierta, y se sigue comparando con el plan guardado en el sitio de la copia (trasGuardarCopia). El plan abierto no cambia (ni sus cambios sin guardar).
- lib/builder/comparaPlanes.js: nombreParaGuardar, trasGuardarCopia; TITULO_COPIA lo menciona; AYUDA_TABLA aclara que la ganancia de cada VALOR es antes de comisiones e impuestos (como en «Detalle») y por eso no suman la del plan.
- Comprobación: comparar-planes.js, apartado 9 (9 nuevas, con una base falsa que apunta lo que se guardaría).
- Ninguna cifra cambia.

## 174. Pantalla del plan: cabecera más compacta y franjas fijas (17/11)

Pedido por Sergi el 18/11 con capturas del plan 4 (punto 1 de tres: después, selectores de estrategia y ☀/☾).

- components/BuilderPlan.js: «Comparar con otras estrategias ▾» y «Comparar planes» suben a la fila de las pestañas de planes, a la derecha (data-comparar-arriba; las pestañas miden el ancho que les queda); la línea «La estrategia, tal como la usa este plan» va dentro de la línea de los avisos (avisosDe(uso)).
- «◀ Ocultar el panel» en una franja de 40 px (ALTO_BARRA_COL, data-barra-izq) a la misma altura que las pestañas «Tu dinero / Detalle»; en escritorio (≥ 1000 px) las dos son position: sticky (clase bp-fijo) con fondo opaco: al bajar por cada columna se quedan arriba. En el móvil, como antes.
- Comprobado por mí en la app (plan 7, 1400×800): con la rueda en cada columna las dos franjas se quedan arriba; el desplegable de comparar se abre por encima; 64.625 €; consola sin errores.
- Ninguna cifra cambia.

## 175. Selectores de estrategia como el selector de valores (17/11)

Pedido por Sergi el 18/11 (punto 2 de tres). El desplegable de «Comparar con otras estrategias» se veía mal: la casilla del navegador salía ENCIMA del nombre y centrada (un estilo global de input/label la descolocaba).

- components/ListaEstrategias.js (nuevo): ListaEstrategias = buscador con ✕ siempre (sin mayúsculas ni acentos, palabra a palabra), casilla DIBUJADA a la izquierda del nombre (cuadrado; círculo si es de una sola), filas compactas, «N seleccionadas», etiqueta a la derecha y las marcadas AL ABRIR, arriba (no saltan al pulsar). SelectorEstrategia = botón con la elegida y su etiqueta que abre la lista de una; se cierra al elegir, al pulsar fuera o con Esc.
- components/MenuCompararEstrategias.js: usa ListaEstrategias (hasta 3, como antes).
- components/BuilderPlan.js: el <select> «Estrategia» del bloque pasa a SelectorEstrategia: «pasa el azar» en verde, «no pasa» en rojo, «sin prueba», «semanal»; la estrategia borrada del plan, arriba con su etiqueta en amarillo; las de código, en gris al final. Las SEMANALES ya se pueden elegir (el <select> las dejaba apagadas aunque desde §145 el plan las admite; decidido por mí: es lo ya decidido, «el plan manda»).
- Comprobaciones: comparar-planes.js apartado 6 adaptado (filas con role=checkbox) + 5 nuevas y apartado 10 (5 nuevas: selector del bloque); borrar.js mira el botón en vez de la <option>.
- Comprobado por mí en la app (plan 7): las dos listas se ven bien; al cerrar sin elegir, 64.625 € y sin cambios pendientes; consola sin errores.
- Ninguna cifra cambia.

## 176. ☀/☾ en el Builder, parte 1: los colores, variables (17/11)

Pedido por Sergi el 18/11 (punto 3 de tres). Se hace por partes; en esta NADA cambia a la vista.

- lib/builder/estilo.js: B, CHIPS y S usan variables CSS con el color de siempre de reserva («var(--bd-fondo, #0f1419)»): donde nadie las pone (Tesis y lo demás que usa B) se ve igual. TEMAS_BUILDER: oscuro = los colores de siempre; claro = el «Papel gris» del screener (lib/screener/colores.js) más las claves que el screener no tiene (resultado, siguiente…, chips, botón desactivado). varsBuilder(tema) da las variables.
- components/BuilderPanel.js: las pantallas del Builder van dentro de un contenedor (display: contents, data-tema-builder) con varsBuilder(t). TEMA_BUILDER_LISTO = false: de momento siempre el oscuro; el claro se enciende cuando todas las pantallas estén listas.
- Probado a mano en el navegador poniendo las variables del claro: fondo, tarjetas, textos y botones cambian; falta, pantalla a pantalla, lo pintado con colores fijos (cifras verdes y rojas, gráficos, piezas del Backtesting en el plan, ventanas «?» que se abren fuera del Builder).
- planes-montaje.js compara el fondo de los desplegables con B.tarjeta (antes con el color escrito).
- Ninguna cifra cambia.

## 177. ☀/☾, parte 2: los dos tonos de toda la app son los del screener; el Builder ya va en el oscuro del screener (17/11)

Decisión de Sergi (17/11): toda la app tendrá los dos tonos del screener: oscuro «Finviz» (menos oscuro que el de antes, con menos contraste: cansa menos la vista) y claro «Papel gris». Se llevará pantalla a pantalla a toda la app.

- lib/temas.js (nuevo): PALETAS { oscuro, claro } con las MISMAS claves; los valores del screener tal cual + las claves que usaba el Builder (resultado, siguienteFondo/Borde, chips).
- lib/screener/colores.js: TEMAS = PALETAS (mismos valores; el screener no cambia).
- lib/builder/estilo.js: TEMAS_BUILDER sale de PALETAS; la reserva de cada variable sigue siendo el color de antes (lo que no pone variables, como Tesis, no cambia). El botón verde lleva fondo y texto propios (botonVerde, botonVerdeTexto): en el tono del screener, verde #2f7d45 con texto blanco.
- Con esto el Builder (Estrategias, Planes, creador, validar y plan) se ve YA en el oscuro del screener (TEMA_BUILDER_LISTO sigue en false: el claro aún no se enciende). Los colores fijos de cada pantalla (cifras verdes/rojas, líneas de los gráficos) se ven bien sobre este gris; las cajas del Backtesting dentro del plan siguen con su azul oscuro (parte siguiente).
- Ninguna cifra cambia.

## 178. ☀/☾, parte 3: la pantalla del plan, lista para los dos tonos (17/11)

- lib/temas.js y lib/builder/estilo.js: colores con significado como variables (C: verde, rojo, amarillo, azul, morado, naranja, cian…, rejilla y eje de los gráficos, fondo de «Ampliar», marca amarilla, fondo del «NO»). En el oscuro, los del Builder de antes; en el claro, más oscuros para leerse sobre el papel.
- components/BuilderPlan.js, PlanDetalle.js, FiltrosDelPlan.js, BuilderPestanas.js, ListaEstrategias.js, BuilderFila.js, BuscadorValor.js, VentanaPregunta.js: sus colores fijos pasan a B/C (cifras que suman y restan, líneas del gráfico, colores de cada valor en «Valor a valor», movimientos del historial, botón rojo de borrar…). Sin ningún «color + transparencia» que se rompa con las variables (comprobado).
- Las piezas del Backtesting dentro del plan (.bp-mc): sus variables de toda la app (--bg, --border, --text…) pasan a las del tono, y sus colores de texto escritos tal cual (#cde5ff, #d0e8fa…) se cambian por los del tono con una regla CSS solo dentro del plan (COLORES_PIEZAS). El Backtesting suelto no cambia.
- Comprobado por mí en la app (plan 7) con el claro puesto a mano en el navegador: tarjetas, cifras, gráfico, «Detalle» y la lista de valores se leen bien. SIN HACER: el gráfico de velas (AssetSignalChart, de lightweight-charts: dibuja en canvas con sus colores, no admite variables) y el Gantt siguen oscuros en el claro; van en una parte aparte.
- planes-pantalla.js compara los colores por signo con C (no con el color escrito).
- Ninguna cifra cambia.

## 179. ARREGLO: los gráficos del creador y de «Validar» volvían a salir vacíos desde §176 (17/11)

Fallo mío de §176 (V9.1238): lightweight-charts (dibuja en canvas) recibía los colores como «var(--bd-…, #…)» y fallaba con «Cannot parse color»: el gráfico de «Señales en el gráfico» del creador (components/BuilderSenales.js) y las velas de «Validar» (components/BuilderAzarVelas.js) salían vacíos. Las comprobaciones automáticas no dibujan estos gráficos y no lo vieron. Visto por mí en la app al revisar el creador.

- lib/builder/estilo.js: colorReal(v, el) da el color real de una variable (la lee en el contenedor del tono; sin él, el de reserva); un color normal pasa tal cual.
- BuilderSenales.js y BuilderAzarVelas.js: las opciones del gráfico usan colorReal (fondo, texto, bordes y la rejilla, que pasa a C.rejilla).
- Comprobado en la app: el gráfico de señales de «Prueba editor EMA20» se dibuja; las velas de su prueba, también, con las cifras de referencia (55.706 €, 123 operaciones, 42,3 %, 29,1 %, 68,7 %); sin «Cannot parse color» en la consola.
- LECCIÓN: todo color que vaya a lightweight-charts (o a un canvas) tiene que pasar por colorReal.

## 180. ☀/☾ en el Builder, parte 4: las portadas de Estrategias y de Planes (17/11)

Las portadas (components/BuilderPanel.js) y las piezas pequeñas que usan pasan sus colores fijos a las variables del tono. En el oscuro no cambia nada que se vea (cada variable lleva de reserva su color de antes; fuera del Builder —Tesis, screener— se ven igual).

- BuilderPanel.js: el ✓ de los pasos hechos, las cifras de la portada de Planes (CAGR, peor caída, puntos frente a QQQ: VERDE_P/ROJO_P = C.verde/C.rojo) y el aviso de error (C.amarillo); la sombra de los menús, con la variable --bd-sombra.
- Resaltado.js (palabras encontradas en los buscadores): C.marca. ProteccionPanel.js (aviso «No se pudo enseñar…»): C.rojo. BorrarPrueba.js (aviso de suerte): C.amarillo. LimpiarBusqueda.js (la ✕): var(--bd-texto).
- Revisado por mí en la app forzando el claro por JS: portada de Planes (tabla, cifras en verde/rojo legibles, botones) y de Estrategias (lista, chips, resaltado del buscador); en oscuro, los colores medidos son los de antes. Pendiente para cuando se encienda el claro: la barra de desplazamiento horizontal sale oscura (color-scheme del navegador).
- Ninguna cifra cambia (portada de Planes: 88.218 €, 75.123 €, 64.625 €).
- comunes.sh: todo en verde salvo backtesting-panel.js, que da «distinto» en SelectorValores solo por la ✕ (su estilo dice ahora var(--bd-texto, #e6edf3)); con la ✕ nueva en los dos lados, 0 fallos. En el Backtesting se ve igual (allí la variable no existe y vale #e6edf3).

## 181. ☀/☾ en el Builder, parte 5: el creador de estrategias (17/11)

El creador (components/BuilderEditor.js), el dibujo de la regla (BuilderDibujo.js), el editor de las de código (BuilderCodigo.js), el buscador de estrategias (BuscadorEstrategia.js) y el menú de la fila de condición (BuilderFila.js) pasan sus colores fijos a las variables del tono. En el oscuro se ven igual: las claves nuevas llevan en oscuro el color de antes.

- Claves nuevas en las dos paletas (lib/temas.js) y en C (lib/builder/estilo.js): cVerdeAzulado (protección), cGrisSuave (órdenes y cajas grises del dibujo), cSi / cNo (etiquetas del dibujo), cCajaVerde (caja «Compro…» del dibujo), cAvisoFondo (aviso de versión), cVerdeVivo. Las sombras de los menús, con --bd-sombra.
- Única diferencia en oscuro: el resaltado de la fila activa del buscador de estrategias pasa de #1f3350 a C.hover (#263766), el mismo que el resto del plan.
- Los gráficos de «Señales en el gráfico» (BuilderSenales.js) NO se tocan aquí: van a lightweight-charts y necesitan colorReal; parte aparte.
- scripts/comprobaciones/screener.js: «la pantalla ya no lleva los colores fijos de antes» no cuenta las definiciones de las variables del tono (--sc-cAvisoFondo vale #3a3220 en oscuro y no se pinta en ningún sitio).
- Revisado por mí en la app (Prueba editor EMA20): Tarjetas y Dibujo de la regla en oscuro (igual que antes) y en claro forzado (bien); «Señales en el gráfico» se dibuja, sin errores en la consola.
- Ninguna cifra cambia.

## 182. ☀/☾ en el Builder, parte 6: «Señales en el gráfico» del creador (17/11)

components/BuilderSenales.js. DECIDIDO por mí: el GRÁFICO (velas, flechas, puntos, medias, canales, etiquetas de cada operación y franjas con su recuadro oscuro) conserva sus colores en los dos tonos, como en las plataformas de gráficos; el fondo, los textos y la rejilla del gráfico ya seguían el tono (colorReal, §179). Lo que cambia es lo de la página alrededor:

- AMARILLO y ROJO (avisos y errores) pasan a C.amarillo / C.rojo; la línea de nivel de los osciladores (RSI…), que va a lightweight-charts, con colorReal.
- Lo cambiado frente a lo guardado (borde #d9a53a y texto #e0c27a) → C.cambioBorde / C.cambioTexto; el botón de periodo activo (#1f3350) → C.hover; «▬ franjas» de la leyenda → C.azulFranja.
- Tabla «Las cifras de la regla»: los colores de lib/coloresCifras.js (sube #00e5a0, baja #ff4d6d, cuenta #ffd166), aquí con variables (C.cifraSube, C.cifraBaja, C.cifraCuenta) y las mismas reglas; lib/coloresCifras.js no se toca (lo usan el Backtesting y otros, y algunos de sus colores van a canvas).
- Claves nuevas en las dos paletas: cCambioBorde, cCambioTexto, cAzulFranja, cCifraSube, cCifraBaja, cCifraCuenta (en oscuro, el color de antes).
- Revisado por mí en la app con «Retroceso líderes RSI2» (tiene RSI): en claro forzado, gráfico de precio y RSI dibujados (14 lienzos), tabla legible; en oscuro, Win Rate #00e5a0 y Operaciones/Tiempo #ffd166 como antes; sin «Cannot parse color».
- Pendiente al encender el claro: algunas medias (amarilla #f2cc60) y la línea del RSI se ven pálidas sobre el fondo claro; valorar con Sergi si el gráfico usa otros colores en claro.
- Ninguna cifra cambia.

## 183. ☀/☾ en el Builder, parte 7: «Validar» (17/11)

BuilderAzar.js, BuilderAzarResultado.js y BuilderAzarVelas.js pasan sus colores fijos a las variables del tono (en oscuro, los de antes).

- BuilderAzar: amarillo, rojo y verde → C.amarillo, C.rojo, C.verde.
- BuilderAzarResultado (abanico y veredicto, SVG): azul, verde, rojo del veredicto (#ff7b72), amarillo, naranja, gris claro de «Sin veredicto» (#c9d1d9) y gris → C (claves nuevas cRojoVeredicto y cTextoClaro).
- BuilderAzarVelas: fondo del diálogo (#010409 → C.fondoDialogo), botones activos (#1f2937 → C.activo), error (C.rojo) y la zona «dentro» de las velas (#182431 → C.zonaVelas; va a lightweight-charts: zonaDentro la pasa por colorReal una vez). Las flechas y puntos del gráfico, iguales en los dos tonos.
- Claves nuevas en las dos paletas: cRojoVeredicto, cTextoClaro, cFondoDialogo, cZonaVelas, cActivo.
- Revisado por mí en la app (Prueba editor EMA20): Validar, resultado de la prueba y sus velas en claro forzado; cifras de referencia idénticas (55.706 €, 111.156 €, 44.332 €, 13.824 €, 73,9 %, 123 operaciones; velas 42,3 %, 29,1 %, 68,7 %); sin errores de color en la consola.
- Visto de paso: «📋 Copiar para Claude» (components/BotonCopiar.js, común a la app) sigue oscuro en claro: va con las ventanas «?» al encender el claro.
- Ninguna cifra cambia.

## 184. ☀/☾ en el Builder, parte 8: ventanas «?» y EL CLARO ENCENDIDO (17/11)

Con esto, Estrategias y Planes (todo el Builder) siguen el botón «☀ Claro / ☾ Oscuro» de la barra de arriba, como el screener.

- components/BuilderPanel.js: TEMA_BUILDER_LISTO = true. En claro, CSS_CLARO_BUILDER: color-scheme: light (barras de desplazamiento y controles del navegador en claro) y las variables generales de la app (--bg, --bg2, --bg3, --border, --text, --text2, --text3, --text-legible, --accent, las de styles/globals.css) pasan a las del tono dentro del Builder: así «📋 Copiar para Claude» y las piezas comunes también van en claro. En oscuro no se pone nada (nada cambia).
- components/BuilderAyuda.js: la ventana del «?» va (por portal) al contenedor del tono del Builder si lo hay, para heredar sus colores; si no (screener, resto de la app), a la página como siempre. Sombra con --bd-sombra.
- pages/index.js: el tooltip del botón dice «Cambia el Screener, Estrategias y Planes (el resto de la app, más adelante)».
- DECIDIDO (recomendación mía, a confirmar por Sergi): los gráficos de «Detalle» que vienen del Backtesting (AssetSignalChart y GanttChart) se quedan con su recuadro oscuro en claro, como un gráfico incrustado; se rehacen al retirar el Backtesting suelto.
- Revisado por mí en la app pulsando ☀: portada de Planes, plan «Prueba editor EMA20» (64.625 €, 20,54 %), ventana «?» por encima de todo y en claro, «Detalle» (cifras y velas); vuelto a ☾ (el tono de Sergi).
- Pendiente apuntado: en claro, algunas líneas de los gráficos (media amarilla, RSI) salen pálidas; el resto de la app (Tesis, Watchlist, Dashboard…), más adelante.
- Ninguna cifra cambia.

## 185. Varios bloques, parte 1: el cálculo (17/11)
Primera parte de «varios bloques» (boceto bocetos/varios-bloques.html; decisiones de Sergi del 15/11 y 17/11). Solo el MOTOR: en la app nada cambia todavía (la pantalla, en la parte 2).
- lib/planes/plan.js: con DOS o más piezas «estrategia» (los bloques), el plan es UNA SOLA CUENTA (esBloques). El dinero libre (aportaciones y lo que sale de cada venta) y el dinero ocioso son de la cuenta (pieza interna «cuenta», con el ocioso del plan: el mismo en todos los bloques); cada bloque solo tiene sus posiciones. Cada día: salen las posiciones de cada bloque (su dinero vuelve a la cuenta) → entran las aportaciones en la cuenta → entran las compras del día, primero las del bloque MÁS ATRASADO respecto a su % (peso − su valor ÷ patrimonio, a la apertura), pagadas con la liquidez de la cuenta y, si falta, vendiendo del ocioso solo lo necesario → al cierre, lo que queda en la liquidez pasa al ocioso (regla del 1 %).
- reparto.dineroLibre: 'tope' (por defecto) = un bloque no compra por encima de su % del patrimonio de ese día; 'prioridad' = sin tope. Dentro de un bloque con lista, el reparto entre sus valores (concentrado / compartido) calcula con el PRESUPUESTO del bloque (con tope, peso × patrimonio; sin tope, el dinero libre + lo invertido); un bloque de un valor compra lo que le deja su tope. Ojo (dicho a Sergi): con «solo prioridad» y un bloque concentrado de máx. 1, el primero que da señal se lo queda todo y el otro puede quedarse sin dinero (prueba 1 y 2).
- Impuestos de la cuenta: lotes FIFO y regla de los dos meses por valor (ya lo eran: un valor en dos bloques comparte sus lotes); el de julio sale de la liquidez de la cuenta, luego del ocioso y luego de las posiciones de todos los bloques a prorrata.
- De momento (validaPlan lo dice): solo bloques de estrategia, el mismo ocioso en todos, sin apalancar, sin «compra más acción», sin vender para volver al reparto («nunca»), y el ocioso no puede ser el valor de un bloque.
- El libro (§155) trae además porBloque (compras, ventas, costes, valor final y lo ganado de cada bloque, antes de comisiones) y curvasBloque (lo ganado día a día con cada bloque). estrategias[id].dentro de cada bloque: la parte del patrimonio en sus posiciones.
- Varias listas: los candidatos de cada bloque con lista van en datos.listas[id] (con un bloque, datos.lista, como siempre). pages/api/plan.js: con varios bloques, cuerposLista = { id: petición } (la misma que con ese bloque solo) y pide /api/multibacktest para cada uno.
- lib/planes/evalua.js: con varios bloques, las referencias son QQQ, SPY, liquidez y el mismo plan con el ocioso en liquidez (sin «comprar y mantener el valor / la lista»).
- Con UN bloque, nada de esto: el cálculo de siempre, sin tocar.
- Comprobación nueva scripts/comprobaciones/plan-bloques.js (en comunes.sh), a mano: tope (12.156 €; con prioridad 13.200 €), el más atrasado primero y el ocioso común (14.300 €, vende 30,8 del ocioso), un valor en dos bloques con impuestos FIFO de la cuenta (2020: 400 € de plusvalía, no 66,67; final 2.621 €), dos bloques iguales al 50 % = un bloque con todo (al céntimo, día a día) y la validación.
- Ninguna cifra cambia.

## 186. Varios bloques: el dinero de una venta a mitad de sesión, después de las compras del día (17/11)
Norma de Sergi (15/11): «solo lo que se podría hacer en la realidad». Con varios bloques, el dinero de una venta que NO es a la apertura (un stop a mitad de sesión, una venta al cierre) no ha llegado cuando otro bloque compra a la apertura: espera en su bloque (P.tarde) y pasa a la cuenta después de las compras del día. El tope y el «más atrasado» miran lo invertido de cada bloque (sin ese dinero que espera). Con un bloque, nada cambia (la lista de un solo bloque sigue como el Backtesting, la prueba de oro).
- Caso nuevo en plan-bloques.js (6), a mano: 1.000 €, X 70 % e Y 30 %; Y sube de 20 a 40 y salta su stop a 39 a mitad de sesión (585 €); X compra a la apertura con los 700 € que hay (70 A), no con 899,50 → final 1.355 € (con el cálculo de §185 daba 1.374,95).
- Ninguna cifra de los planes guardados cambia (todos de un bloque).

## 187. Varios bloques, parte 2: la pantalla (18/11)
Boceto bocetos/varios-bloques.html, pestaña 1 (decisiones de Sergi del 17/11, «sí, las cuatro»).
- lib/builder/planPantalla.js: los bloques en los ajustes. El bloque 1 son los campos de siempre (y la estrategia de la pantalla) con a.peso (su %); los demás, en a.bloques: [{ id, peso (%), estId, foto, activo, donde, lista, velas, filtros }]; a.dineroLibre ('tope' | 'prioridad'). planDe(a, estrategia, nombre, estrategiaDe) da una pieza por bloque (ocioso de la cuenta en todas, sin apalancar, «espera») y reparto.dineroLibre; ajustesDe hace lo contrario (ida y vuelta idéntica). foto: la estrategia guardada con el plan (se usa mientras siga siendo la elegida; si se elige otra, la de ahora). anadeBloque (el nuevo se lleva la mitad del bloque más grande y empieza con la estrategia y el valor del bloque 1), quitaBloque (su % pasa al bloque 1; sin bloques extra, los ajustes de un plan de un bloque, idénticos), repartirResto (en proporción hasta 100 %, con 2 decimales), sumaPesos, AYUDA_BLOQUES. cifrasPlan con varios bloques: la parte en valores de cada día es la suma de la de cada bloque (como con una lista), las operaciones de todos y sin «caídas frente al ocioso». Con un bloque, nada cambia (sin a.bloques).
- components/BuilderPlan.js: «Cartera» con la barra de colores por bloque, aviso rojo con «Repartir el resto» si no suman 100 %, el bloque 1 como siempre (con «Parte de tu dinero» si hay varios) y los bloques 2, 3… en filas plegables con su %, «🗑 Quitar», estrategia (SelectorEstrategia), velas, valores (el selector del Backtesting), «Reparto entre los valores del bloque» con varios valores y filtros. «+ Añadir bloque» vuelve (ya funciona). Con varios: «Reparto entre bloques» («Con tope» / «Solo prioridad»; «Vender para volver al reparto»: «Nunca», y «Cada año» / «Si se desvía» en gris, más adelante), el dinero ocioso pasa a «Tu dinero» («de la cuenta») y fuera «Compra más acción» y apalancamiento (una línea lo dice). Con un bloque con lista, una petición de candidatos por bloque (cuerposLista, con su parte del dinero inicial); /api/plan las pide (§185). Fuera, con varios bloques, la línea de la prueba del paso 2, «Acción elegida a mano» y «La estrategia, tal como la usa este plan» (son de una estrategia). Columna derecha como con una lista. «Comparar planes»: un plan de varios bloques sin listas se compara; con listas, de momento no (lo dice).
- ARREGLO DEL MOTOR (lib/planes/plan.js, encontrado al probar con precios reales): con varios bloques, todo el dinero libre iba al ocioso AL CIERRE; con un bloque, lo que hay a la apertura (aportaciones, ventas a la apertura) va al ocioso A LA APERTURA. Ahora igual: lo que sobra tras las compras del día, al ocioso a la apertura; lo que llegó a mitad de sesión, al cierre. Comprobado con precios reales (plan 7 con oro, sin impuestos ni comisión): un bloque 93.788,76 € = dos bloques iguales al 50 % 93.788,76 €, día a día. Con impuestos, 65.031,22 frente a 65.017,83 € (−13 €): con dos bloques cada uno manda su orden y Hacienda cuenta cada venta por separado (la regla de los dos meses, venta a venta): es lo que pasaría de verdad. Sin ocioso ni impuestos, dos bloques = la estrategia sola (55.706 €, la cifra de referencia del paso 1).
- COMPROBADO POR MÍ EN LA APP (plan 7, sin guardar; Sergi tiene oro, impuestos y 0,37 €): un bloque 64.625 €; «+ Añadir bloque» → 50/50 con la misma estrategia 64.312 € (dos órdenes cada vez); bloque 2 con SuperTrend 10/3 → 71.029 €, CAGR 21,68 %, −26,44 %; bloque 2 con AAPL y MSFT → 66.404 €; «Detalle» cuadra; sin errores en la consola; «Descartar cambios» → 64.625 € y sin cambios pendientes.
- plan-bloques.js: casos 7 (los ajustes: ida y vuelta, añadir, quitar, repartir) y 8 (la pantalla montada: filas, %, «Reparto entre bloques», ocioso en «Tu dinero», lo que se calcula, quitar y añadir, cuerposLista con lista), y en el 4, el ocioso que se mueve entre apertura y cierre. planes-montaje.js: «+ Añadir bloque» vuelve a estar.
- Pendiente (parte 3): «Detalle» con un piso por bloque (tabla «Qué aportó cada bloque», «Bloque a bloque», columna «Bloque»); parte 4: las filas «Solo el bloque A / B» y la portada.
- Ninguna cifra de los planes guardados cambia (todos de un bloque).

## 188. Varios bloques, parte 3: «Detalle» con un piso por bloque (18/11)
- Boceto bocetos/varios-bloques.html, pestaña 2 (aceptado el 17/11). Solo pantalla: el motor ya daba libro.porBloque, curvasBloque, la pieza de cada operación y cada movimiento, y estrategias[id].dentro (§185). Ninguna cifra cambia; con un bloque, «Detalle» igual que antes.
- lib/builder/detallePlan.js: con varios bloques, `bloques` = una fila por bloque en el orden del plan ({ n, nombre, donde, velas, peso, aporto = porBloque.ganado, aportoPct, cagr, operaciones, ganadoras, pf, caída de su curva, enEl = media de su parte del dinero cada día, dentro = días con algo dentro, valores }); sus valores salen de sus operaciones (suman lo del bloque); el «Dinero en él» y la caída de un valor solo si no está en otro bloque («—» y «en varios bloques» si lo está). `curvasBloques` («Bloque a bloque»), `dondeEsta` con la parte en valores partida por bloque (bq; los bloques suman «en valores» cada día), operaciones y movimientos con `bloque` (su número; lo de la cuenta, sin bloque), cabecera con `bloques`, «Copiar para Claude» con los bloques. Buscar «bloque 2» en el historial busca esa palabra entera (coincideBusqueda: el «2» suelto encontraría fechas y precios de otros bloques). Nunca «un valor» con varios bloques.
- components/PlanDetalle.js: COLORES_BLOQUE (y colorBloque) pasan aquí desde BuilderPlan (los mismos en los dos sitios). Línea que suma bloque a bloque (con su color y el «?» sumaBloques); cabecera «N bloques · M valores» (las velas, en cada bloque); tabla «Qué aportó cada bloque» (TablaBloques: bloques plegados al entrar, pulsar uno lo despliega, «Expandir todo / Plegar todo», fila del ocioso de la cuenta y fila «Los N bloques juntos» con el % de señales); «Cómo crece» con «El plan / Bloque a bloque / Valor a valor» (GraficoValores con el color de cada bloque); «Dónde está tu dinero cada día» con una franja por bloque; historial y «Todos los movimientos» con la columna «Bloque».
- plan-bloques.js, caso 9 (a mano, con los casos 1 y 3): +1.200 € y +956 € (12 % y 9,56 %), sus valores suman lo del bloque, 10.000 + 1.200 + 956 = 12.156 €, tiempo dentro del bloque 1 3/6, el día 0 el bloque 1 es el 60 %, curvas que acaban en lo ganado, buscar «bloque 2»; con A en dos bloques, +700 y +66,67 € y su «Dinero en él» «—», 2.000 + 766,67 − 145,67 = 2.621 €; y la pantalla montada (tabla, línea que suma, plegar y desplegar, «Bloque a bloque», franjas, columna «Bloque»).
- Pendiente (parte 4): las filas «Solo el bloque 1 / 2» en las alternativas de «Tu dinero», y la portada de Planes y «Comparar planes» con varios bloques con lista.

## 189. Panel del plan: «Tu dinero» arriba y plegado, bloques que se distinguen, ancho ajustable (18/11)
- Pedido por Sergi al ver la parte 3 (con capturas): «Tu dinero» arriba y «Cartera» debajo (eligió «arriba y plegado»); los bloques no se distinguían; mucho espacio sin usar a la izquierda; en el tono claro no se leían «Máx. activos simultáneos» ni «Criterio de entrada».
- «Tu dinero» va ARRIBA. En un plan guardado sale plegado en una línea (resumenDinero de lib/builder/planPantalla.js: «10.000 € · + 300 €/mes · 2016–2025 · impuestos de España · 0,185 € fijos por operación», y con varios bloques el ocioso de la cuenta); pulsar la cabecera o la línea lo abre. En un plan nuevo, abierto. Se recuerda por plan mientras dura la pantalla (no se guarda). inicial.dineroAbierto para las pruebas.
- Cada bloque: marco de su color (5 px a la izquierda) y cabecera teñida de su color (color-mix), el 1 azul, el 2 naranja… (los de «Detalle»).
- Las casillas y desplegables de las piezas del Backtesting (modo de asignación, etc.) llevaban un fondo oscuro escrito tal cual y, con el texto del tono, en claro no se leían: dentro del plan (.bp-mc) toman el fondo, el borde y el texto del tono. El Backtesting suelto no cambia.
- Borde del panel izquierdo ARRASTRABLE (de 300 a 760 px; se recuerda en este navegador, builder_plan_ancho_panel; doble clic = el ancho de siempre, hasta 520 px). Solo en pantallas de 1000 px o más.
- Pruebas: planes-montaje.js (la línea resumen del plan 4 y abrirla) y tesis-enlaces.js abren «Tu dinero» antes de escribir en «Dinero inicial». Ninguna cifra cambia.

## 190. Varios bloques, parte 4: «Solo el bloque N», portada y «Comparar planes» (18/11)
- Boceto bocetos/varios-bloques.html (puntos a y d de «Qué decidir», aceptados el 17/11).
- «Tu dinero»: con varios bloques, la tabla de alternativas («Frente a cada bloque solo y a no tener estrategia») lleva detrás de «Tu plan» una fila por bloque: «Solo el bloque N con todo tu dinero» = el mismo plan con ese bloque solo al 100 % y las mismas reglas (comisiones, impuestos, ocioso, venta el último día). Referencias BLOQUE_<id> en lib/planes/evalua.js (referenciasDe); con lista, datosDeReferencia le pasa los candidatos de su bloque (datos.listas[id] → datos.lista); /api/plan devuelve también sus órdenes; cifrasPlan las pone con su número (bloque) para el punto de color. «?» AYUDA_BLOQUES.soloBloque. Con un bloque, nada cambia.
- A mano (plan-bloques.js, caso 9): con el caso 1, «Solo el bloque 1» 10.000 € → 1.000 A a 10 → 12 = 12.000 €; «Solo el bloque 2» (B y C, concentrado máx. 2) 250 B a 20 → 25 (+1.250) y 1.000 C a 5 → 6 (+1.000) = 12.250 € = su plan de un bloque.
- Portada de Planes: la columna «Cartera» dice «2 bloques · «A» (60 %) + «B» (40 %)»; las cifras «al abrirlo» si CUALQUIER bloque lleva lista (antes solo miraba el primero: con lista en el bloque 2 habría intentado calcular sin sus candidatos).
- «Comparar planes»: un plan de varios bloques con listas ya se calcula: una petición de candidatos por bloque con lista (cuerposLista, la misma que arma su pantalla, con su parte del dinero inicial y la estrategia de ahora con la misma regla que la guardada; si no, lo dice por bloque). Su tarjeta: «2 bloques: A (60 %) + B (40 %) · ocioso …» (textoBloque de lib/builder/comparaPlanes.js).
- plan-bloques.js: caso 9 (las filas «Solo el bloque…», en la tabla detrás de «Tu plan»; con un bloque, ninguna) y caso 8 («Comparar planes» monta un plan guardado de dos bloques con lista y pide la petición del bloque 2 con 4.000 €).

## 191. «Qué aportó cada bloque»: el total arriba y plegado; el ocioso con su CAGR, su caída y su tiempo dentro (18/11)
- Pedido por Sergi al ver §188 (no entendía la tabla: «Los 2 bloques juntos» abajo parecía el total y no incluía el ocioso).
- La tabla empieza con «▸ Los N bloques (sin el ocioso)» plegada (como «Los N valores» con un bloque); al pulsarla, cada bloque; al pulsar un bloque, sus valores; «Expandir todo» lo abre todo. Debajo, el dinero ocioso de la cuenta.
- La fila del ocioso (en las DOS tablas, con uno o con varios bloques; celdasOcioso de components/PlanDetalle.js): «CAGR de su aportación» (la misma cuenta que un valor: (aportado + ganado con el ocioso) / aportado, al año; con las cifras de Sergi, (10.000 + 18.771) / 10.000 = 2,88 en 10 años ≈ 11,2 %), «Peor caída» de lo ganado con él (su curva diaria, caidaDeCurva) y «Tiempo dentro» (días con algo en el ocioso). Ganadoras y Profit Factor, «—» con el motivo al pasar el ratón: el ocioso entra y sale a trozos cuando los bloques sueltan o piden dinero, sin regla que acierte o falle (decidido con Sergi: no se emparejan sus compras y ventas).
- Pruebas: plan-detalle.js (el ocioso a mano: CAGR = (1.300 + 127,08) / 1.300 a la 1 / años, sin caída, con tiempo dentro) y plan-bloques.js (el total arriba y plegado, al pulsarlo los dos bloques, «Expandir todo»). Ninguna cifra del plan cambia.

## 192. Dos condiciones nuevas del catálogo: «Caída desde el máximo histórico» y «Primera vela del mes, trimestre o año» (18/11)
- Commit 1 del bloque «Con pesos» (debate del 18/11; boceto bocetos/bloque-con-pesos.html). Valen ya en las estrategias (paso 1, filtros del plan) y las usarán las reglas del bloque.
- «Caída desde el máximo histórico» (caidaDesdeMaximoHistorico, grupo «Precio y medias»): como «Caída desde el máximo» pero con el cierre más alto desde el primer dato que hay (el último día con ese máximo); se cumple cuando el mínimo de cierre desde ese día está al menos un X % por debajo y sigue cumpliéndose hasta que un cierre lo supere. Un cierre que falta: ese día «sin dato», sin tocar el máximo. Su calentamiento es HISTORIA_COMPLETA = 15.000 velas: quien la usa carga toda la historia que haya (recortaConCalentamiento toma lo que existe). Se hizo como condición aparte (no como opción de la de N velas) para no tocar la que ya existe ni sus filas.
- «Primera vela del mes, trimestre o año» (primeraVelaPeriodo, grupo nuevo «Calendario»): solo mira la fecha de la vela y la de la anterior (nada del futuro); se mira al cierre y se actúa a la apertura de la siguiente (en diario, la 2.ª sesión del periodo: el 02/01/2024 se cumple y se compra el 03/01). En velas semanales (todas en lunes) la semana cuenta para el periodo de su JUEVES (como la norma ISO): la del lunes 29/12/2025 es la primera de 2026. El «volver a los pesos cada año» del bloque «Con pesos» no usará esta condición: irá el primer día del periodo, como el rebalanceo de siempre.
- No se exportan a código (no están en EXPORTABLES de lib/editor/exporta.js). Ninguna estrategia, plan ni prueba guardada las usa: ninguna cifra cambia.
- Comprobación nueva condiciones-nuevas.js en comunes.sh (todo a mano: la serie de la caída con 10 cierres, el máximo de cada día, diarias y semanales por año/trimestre/mes, la primera semana de 2021 sacada de las diarias, una fila semanal sobre diarias que se conoce el viernes 08/01/2021, una estrategia que compra el 03/01/2024 a 103 €, la historia que pide, el catálogo y la frase).

## 193. Bloque «Con pesos», parte 1: el motor sin reglas (18/11)
- Commit 2 del bloque «Con pesos» (boceto bocetos/bloque-con-pesos.html). SIN PANTALLA: en la app nada cambia todavía.
- Pieza nueva `tipo: 'pesos'` (lib/planes/pesos.js: validación y cuentas puras; el dinero, en lib/planes/plan.js): `pesos: [{ simbolo, peso }]` (símbolos de Yahoo o 'LIQUIDEZ' = efectivo del bloque, que no rinde y no es el ocioso de la cuenta), `volver: { cada: 'nunca' | 'mes' | 'trimestre' | 'anio' | 'banda', puntos }` y `aportaciones: 'ahora' | 'partida' | 'atras' | 'liquidez'`.
- El dinero que le llega se compra en ese momento: «ahora» con la proporción que tiene el bloque, «partida» con los pesos de partida, «atras» rellenando los huecos hasta los pesos de partida (ej. 7.000 / 3.000 en 80/20 + 1.000 → todo al primero), «liquidez» a su efectivo. El primer día (el bloque aún vacío), siempre los pesos de partida.
- «Volver a los pesos»: el primer día de cada mes, trimestre o año (a la apertura, antes de las aportaciones de ese día, como el «cada año» de siempre) o, con la banda, a la apertura siguiente a un cierre en que algún peso se separa más de N puntos. Vende lo que sobra y compra lo que falta con lo cobrado.
- Regla del 1 % (decisión d del boceto): una orden del bloque cuya comisión pase del 1 % no se hace; su dinero espera en el bloque PARA ESE SÍMBOLO y se suma a su siguiente compra (con 95/5 y 300 €/mes a 0,185 €, los 15 € de un mes esperan y entran al siguiente con otros 15). En «volver a los pesos», lo que esperaba se reparte con lo demás.
- QQQ y SPY usan las series del plan (las de sus Buy&Hold, con los dividendos de lib/dividendosCartera.json); los demás símbolos, las velas de la caché (sin dividendos). Corregido lo dicho a Sergi el 18/11 («en toda la app sin dividendos»): en los planes, QQQ y SPY ya iban con dividendos.
- De momento va solo en el plan («De momento, un bloque «Con pesos» va solo en el plan»); un símbolo sin precio el primer día lo dice. /api/plan devuelve también las curvas de QQQ y SPY con este bloque; datosServidor carga sus símbolos.
- Comprobación nueva plan-pesos.js en comunes.sh: tres PRUEBAS DE ORO al céntimo (100 % A = comprar y mantener A con 300 €/mes, 0,185 € e impuestos; 50/50 «partida» = dos piezas al 50 %; 50/50 «cada año» = dos piezas con el rebalanceo anual) y a mano: «cada año» 11.550 € frente a «nunca» 11.600 €, banda de 4 puntos (vuelve) y de 5 (no), los cuatro modos de aportación, la regla del 1 % (7 órdenes, 1.598,705 €), la liquidez del bloque (11.470 €) y un símbolo que aún no cotiza.
- Con precios reales (base local, solo lectura; 2016–2025, 10.000 € + 300 €/mes, impuestos, 0,185 €): 100 % SPY = el Buy&Hold SPY del plan al céntimo (103.667,05 €); 80 % SPY + 20 % TQQQ: nunca 167.104 € (20,74 %), cada año 158.818 € (19,97 %), banda de 10 puntos con «al más atrasado» 153.551 € (19,58 %). Planes 4, 6 y 7: 88.218,04 €, 75.122,81 € y 64.625,48 € (iguales).

## 194. Bloque «Con pesos», parte 2: las reglas «si… entonces…» en el motor (18/11)
- Commit 3 del bloque «Con pesos». SIN PANTALLA todavía. Campo opcional `reglas` de la pieza (lib/planes/pesos.js: validación, series de las condiciones; el dinero, en lib/planes/plan.js). Sin reglas, todo exactamente como en §193 (la respuesta no lleva nada nuevo).
- Cada regla: `filas` (SI: condiciones del catálogo, cada una sobre su símbolo y con velas diarias o semanales; de la 2.ª en adelante «Y» u «O», con «Y» agrupado antes que «O»: A Y B O C = (A y B) o C), `accion` (pasar a unos pesos · mover un % de TODO el bloque de un símbolo a otro · mover un % de lo que hay en un símbolo · vender todo un símbolo a la liquidez del bloque), `mantenerMeses` (0–120), `despues` (volver a los pesos de partida · quedarse así · volver a los de partida cuando se cumplan otras condiciones) y `repetir` (una vez por caída · cada vez · solo una vez). Hasta 5 reglas y 6 condiciones por regla.
- Cuándo (decisiones del boceto, 18/11): cada día al cierre se miran las reglas en orden y como mucho una queda pendiente para la apertura siguiente. Mientras una regla está EN CURSO (desde que actúa hasta que se vuelve a los pesos de partida; con «quedarse», hasta que acaba «mantener») las demás esperan; durante «mantener» tampoco se vuelve a los pesos, y el dinero que llega va según los pesos de ese momento. Con «quedarse», los pesos que dejó la regla pasan a ser los de «volver a los pesos» y los de «al más atrasado».
- «Una vez por caída»: no se repite hasta que el símbolo de su PRIMERA fila cierre por encima del máximo de cierre (histórico) que tenía el día en que se cumplió.
- Fila SEMANAL: vale la última semana CERRADA y se conoce al cierre de la última sesión de esa semana → la orden, a la apertura de la sesión siguiente (normalmente el lunes). OJO: las filas semanales de los filtros de las estrategias (§149, proyectarSemanal) usan el dato desde el lunes siguiente (deciden al cierre del lunes y actúan el martes): un día más tarde. No se ha cambiado (cambiaría cifras); apuntado para igualarlo si Sergi quiere.
- Las condiciones miran las velas tal cual (sin dividendos) de su símbolo, QQQ y SPY incluidos; se cargan 60 años de historia (la caída desde el máximo histórico). Un símbolo sin velas lo dice («Faltan las velas de X (lo mira una regla del bloque)»).
- La respuesta del motor trae, por bloque con reglas, `pesos[id] = { historial: [{ cumple, actua, regla, que, movido, pesos }], estados: [regla en curso por día, 0 = ninguna] }` (para «Cuándo actuó cada regla» y la franja del «Detalle», commit 7).
- Comprobación nueva plan-pesos-reglas.js (a mano, velas inventadas): 80/20 que pasa a 60/40 al caer T un 40 % (08/03: mueve 2.540 €; vuelve el 09/04 moviendo 2.084,73 €; no se repite hasta que T marca 101; vuelve a actuar el 23/04; final 9.430,91 € frente a 9.200 € sin reglas), «cada vez» (12/04), «solo una vez», «volver cuando T cierre sobre su SMA (3)» (16/04), mover del bloque (8.549,09 €), mover de un activo (8.672,73 €), vender (8.200 €; el 22/04 se vuelve a cumplir con 0 € que vender), «quedarse» + «cada mes» (vuelve a los pesos nuevos: compra 185,61 € de S, a 60/40 serían 769,45), una fila diaria (actúa el jueves 04/03) frente a semanal (el lunes 08/03), «Y» antes que «O», validación.
- Con precios reales (2016–2025, 10.000 € + 300 €/mes, impuestos, 0,185 €): 80 % SPY + 20 % TQQQ «cada año» 158.818 €; con la regla «TQQQ cae un 40 % desde su máximo histórico → 60/40, 12 meses, vuelve, una vez por caída» 179.593 € (22,37 %), actuando en 02/2016, 11/2018, 03/2020, 01/2022 y 04/2025. Planes 4, 6 y 7 iguales.

## 195. Filas y filtros SEMANALES: el dato de la semana, al cierre del viernes (18/11; «como en la realidad»)
- Pedido por Sergi: «toda la app con sus estrategias, planes, filtros, etc. tiene que quedar como lo que haría yo en realidad; es igual que cambie resultados».
- Antes: proyectarSemanal (lib/filtros.js, la única pieza que lleva un dato semanal a las fechas diarias; la usan los filtros del Backtesting y de «Backtest de un valor», buildAlignedWeekly, el núcleo del catálogo y las filas semanales de los filtros del plan, §149) daba el dato de una semana desde el LUNES siguiente: se decidía al cierre del lunes y se actuaba el martes.
- Ahora: el día que CIERRA la semana (la sesión siguiente del activo es de otra semana; la última fecha de los datos, si es viernes) ya vale esa semana: se decide al cierre del viernes y se actúa el lunes. Si el viernes es festivo, la semana cierra el jueves. Igual que las reglas del bloque «Con pesos» (§194).
- Cifras que cambian (aceptado por Sergi): las 4 respuestas de la batería con filtro de mercado «RSI semanal del S&P 500 entre 40 y 100» (diario): V50 concentrado 959.415,58 € / 425 ops → 946.059,35 € / 436; V50 compartido 60.896,28 € / 506 → 61.634,34 € / 518; Degiro concentrado 55.266,29 € / 483 → 53.820,51 € / 494; Degiro compartido 25.148,05 € / 642 → 26.525,46 € / 667. Las otras 48 respuestas, R1–R3, planes 4/6/7, la prueba de EMA20 y todo lo guardado: iguales (ninguno usa filtros semanales sobre diario).
- Pruebas a mano actualizadas (filtros-extra.js, plan-filtros.js, plan-filtros-pantalla.js): la fila semanal compra el lunes d15 a 112 (antes, el martes d16 a 114).
- comunes.sh de este commit: todo en verde salvo bateria.js, que compara con la versión anterior y da justo esas 4 distintas (lo esperado).

## 196. Bloque «Con pesos», parte 3: junto a otros bloques, en la cuenta común (18/11)
- Commit 4 del bloque «Con pesos». SIN PANTALLA todavía. Un bloque «Con pesos» ya puede ir con bloques de estrategia (y con otros «Con pesos») en el mismo plan: esBloque / esBloques (lib/planes/plan.js) cuentan los dos tipos. Con piezas de activo o de cartera, no.
- Qué dinero coge (decidido por mí, contado a Sergi): el bloque no tiene señales, así que coge lo que le falta para su % (peso × patrimonio a la apertura − lo que vale) SOLO del DINERO NUEVO que entra ese día en la cuenta (aportaciones y lo que sale de las ventas de los otros bloques; lo de una venta a mitad de sesión cuenta como nuevo al día siguiente), en su turno del «más atrasado primero», siempre con su tope (también con «solo prioridad»). Así no hace órdenes cada día por diferencias pequeñas y el dinero que ya espera en el ocioso queda para las señales de las estrategias.
- Su liquidez (la de su peso y la que espera por la regla del 1 %) y lo que venden sus reglas se quedan en el bloque (no pasan a la cuenta). Sus reglas y «volver a los pesos» funcionan igual que solo. Los impuestos de julio, de la cuenta (liquidez, ocioso y luego todas las posiciones a prorrata, también las del bloque).
- El ocioso de la cuenta es el de los bloques de estrategia (con solo bloques «Con pesos», liquidez) y no puede estar en un bloque «Con pesos». Sin bloques de estrategia no sale la fila «El mismo plan con el ocioso en liquidez»; las filas «Solo el bloque N con todo tu dinero» salen también para los «Con pesos». En el libro, sus símbolos cuentan como «valor» y tienen su lo ganado por bloque (porBloque, curvasBloque).
- Comprobación nueva plan-pesos-bloques.js (a mano): X (lista [A], 50 %) y P (100 % B, 50 %): día 0, 500 A y 250 B; la venta de A (6.000 € nuevos) solo le da a P los 500 € que le caben (final 11.000 €, 5.500 € en la cuenta); con B a 25 no coge nada (12.250 €); con 1.000 €/mes solo coge de lo nuevo; dos bloques «Con pesos» (100 % A y 100 % B) = uno 50/50 al céntimo con 0,1 % e impuestos; lo que vende una regla se queda en el bloque; validación.
- Con precios reales (2016–2025, 10.000 € + 300 €/mes, impuestos, 0,185 €, ocioso GLD): 60 % «Prueba editor EMA20» en AAPL + 40 % «Con pesos» 80 % SPY + 20 % TQQQ (cada año, al más atrasado) = 162.328 € (estrategia +49.844, pesos +64.889, ocioso +32.049, costes 127, impuestos 30.027; descuadre 1e-9); «Solo el bloque 1» 159.093 €, «Solo el bloque 2» 158.382 €. Planes 4, 6 y 7 iguales.

## 197. Bloque «Con pesos», parte 4: la pantalla, secciones 1–3 (19/11)
- Boceto bocetos/bloque-con-pesos.html, pestaña 1 (aceptado por Sergi el 18/11). «+ Añadir bloque» pasa a ser un desplegable «+ Añadir bloque ▾» con «Con una estrategia» (lo de siempre) y «Con pesos». El bloque «Con pesos» nuevo sale en blanco: un activo sin elegir al 100 %, «volver a los pesos» nunca, el dinero que le llega «según los pesos de ahora», sin reglas (y no se calcula hasta elegir el símbolo: lo dice el aviso rojo del motor).
- Fila plegable con su color, su % y el resumen («Con pesos · 80 % SPY + 20 % TQQQ», debajo cómo vuelve a los pesos y adónde va el dinero que le llega), «Quitar» (su % pasa al bloque 1) y tres secciones con su «?» y ejemplo: 1 · Pesos de partida (por fila: buscador de símbolos con precios guardados más «Liquidez» del bloque, su %, una barrita y papelera roja; «+ Añadir activo» con lo que falte para el 100 %, como mucho 10; «Suman 100 % ✓» o en rojo lo que suman); 2 · Volver a los pesos del bloque (Nunca / Cada mes / Cada trimestre / Cada año / Si alguno se separa más de N puntos, 10 por defecto); 3 · El dinero que le llega (según los pesos de ahora / de partida / al que más se ha quedado atrás / a la liquidez del bloque).
- Ajustes (lib/builder/planPantalla.js): en a.bloques, { id, peso (%), tipo: 'pesos', pesos: [{ simbolo, peso (%) }], volver: { cada, puntos }, aportaciones, reglas? }; planDe lo convierte en la pieza «pesos» del motor (fracciones; «puntos» solo con «banda») y ajustesDe hace lo contrario (ida y vuelta idéntica). Las reglas se guardan tal cual (su pantalla, en la parte siguiente); si un plan las lleva, una línea lo dice.
- Para «Tu dinero» y «Detalle» el motor da, con varios bloques, la parte del patrimonio en cada bloque «Con pesos» cada día (ejecucion.bloquesPesos[id].dentro; sin bloque «Con pesos» la salida no cambia). cifrasPlan, detallePlan («Con pesos · 80 % SPY + 20 % TQQQ» en «Qué aportó cada bloque»), la petición de «Comparar planes», su descripción y la portada de Planes cuentan los «Con pesos» como bloques.
- Decidido por mí: de momento el bloque «Con pesos» va siempre detrás del bloque 1 de estrategia (un plan SOLO con pesos al 100 % llega en otra parte: el bloque 1 lleva la estrategia, la ruta y lo guardado del plan).
- Comprobación nueva plan-pesos-pantalla.js: ajustes (en blanco, planDe, ida y vuelta, banda, reglas tal cual, resumen, suma, quitar), motor a mano (X lista [A] 50 % + P 100 % B 50 %: P al 0,5 del patrimonio cada día; «Detalle»: X +1.000 €, P 0 €) y montaje con estado (menú, secciones, banda, «al que más se ha quedado atrás», añadir y quitar activos, «Quitar»). plan-bloques.js pulsa ahora «+ Añadir bloque ▾» → «Con una estrategia». Ninguna cifra cambia.

## 198. La comisión del plan, «por orden» (19/11)

- Pedido por Sergi: la comisión se cobra en CADA orden (compra o venta) y en la app «operación» es una compra y su venta. En «Tu dinero» del plan: «Comisión por orden», «€ fijos por orden», «€ por orden», el resumen plegado (textoComision: «0,37 € fijos por orden», «0,1 % por orden», «% con mínimo de X € por orden») y el «?» (AYUDA_PLAN.comision) reescrito con ejemplo (0,37 € por orden → comprar y vender cuestan 0,74 €; 0,185 € si el bróker cobra solo al comprar). El Backtesting suelto y los ajustes generales siguen con «por operación» (se retirarán). plan-por-dentro.js busca el texto nuevo. Ninguna cifra cambia.
- (V9.1260) En el bloque «Con pesos», el nombre largo del activo ya no tapa la casilla del %: BuscadorValor acepta anchoNombre (el nombre se corta con «…» y sale entero al pasar el ratón); los demás buscadores, igual.

## 199. Bloque «Con pesos», parte 5: la pantalla de las reglas, «Así se lee» y los ejemplos (19/11)

- Sección «4 · Reglas «si… entonces…»» del bloque (components/ReglasPesos.js; lo puro en lib/builder/reglasPesos.js), como el boceto bocetos/bloque-con-pesos.html. Cada regla: SI (filas del catálogo, las MISMAS del creador: components/BuilderFila.js, con «De quién» = los símbolos del bloque, los cuatro índices u «Otro símbolo…», «y además / o bien» y velas diarias o semanales) · ENTONCES (pasar a estos pesos, mover un % de todo el bloque, mover un % de lo que hay en un activo, vender todo un activo) · MANTENER (meses) · DESPUÉS (volver a los de partida, quedarse, volver cuando… con sus filas) · REPETIR (una vez por caída, cada vez, solo una vez); ↑ ↓ y papelera roja; «+ Añadir regla» (hasta 5) y «+ condición» (hasta 6) con el catálogo en una ventana. Los errores de validaReglasPesos salen debajo, en rojo.
- Las reglas se guardan en el ajuste del bloque en el formato del motor (§194; pesos en fracciones); filaDePantallaRegla / filasGuardadasRegla pasan las filas a la pantalla y vuelven idénticas. El catálogo de las reglas quita las condiciones que solo valen dentro del Nasdaq-100 (soloDelValor): en una regla se mira un símbolo suelto. Regla nueva: SI el primer símbolo del bloque cae un 20 % desde su máximo histórico, ENTONCES sus pesos de partida (para cambiar), volver a los de partida, una vez por caída.
- «Así se lee» (fraseBloquePesos): pesos de partida, volver a los pesos, el dinero que le llega y una frase por regla (fraseFila del creador para las condiciones). Sustituye a la línea «lleva N reglas: su pantalla llegará…».
- «Cargar un ejemplo» (EJEMPLOS_PESOS, nombres inventados): «80/20 que compra en caídas» (SPY/TQQQ, cada año; TQQQ −40 % → 60/40 12 meses), «60/40 que rota en caídas» (QQQ/TQQQ; mueve un 20 % del bloque de QQQ a TQQQ y se queda) y «Oro como refugio» (QQQ/GLD cada trimestre; SPY bajo su EMA 40 semanal → 20 QQQ / 50 GLD / 30 liquidez hasta que cierre por encima). Sus supuestos, en el «?». En un bloque en blanco se carga sin preguntar; si ya tiene algo, ventana propia «Sí, cargarlo / Cancelar». Cambia pesos, volver, dinero que le llega y reglas, no su % del plan.
- Comprobación nueva plan-reglas-pantalla.js: los tres ejemplos válidos para el motor y de ida y vuelta idéntica por los ajustes del plan, las frases, el catálogo sin las del Nasdaq-100, regla y acción nuevas, ↑ ↓, y el montaje con estado (sección 4, añadir, ENTONCES, DESPUÉS «cuando», velas, catálogo, «o bien», subir, borrar, ejemplo con y sin pregunta). Ninguna cifra cambia (el motor no se toca).
- (V9.1263) Revisado en la app (columna de 436 px): la etiqueta de cada paso (SI, ENTONCES, MANTENER…) va ENCIMA de su contenido; en las reglas el buscador no enseña el nombre del valor (BuscadorValor: anchoNombre={0} lo oculta); opciones cortas («Mover un % del bloque», «Quedarse así», «Una vez por caída»…; lo que hace cada una, en su «?»).
## 200. Bloque «Con pesos», parte 7: la fila «sin sus reglas», cuándo actuó cada regla y su franja (19/11)
- «Tu dinero»: por cada bloque «Con pesos» con reglas, fila «El bloque N sin sus reglas» (referencia SINREGLAS_<id> de lib/planes/evalua.js: el MISMO plan con ese bloque sin `reglas`; sus pesos, «volver a los pesos» y el dinero que le llega, iguales), detrás de «Solo el bloque N», con el color de su bloque y su «?» (AYUDA_PESOS.sinReglas, ejemplo 70.700 − 68.200 = 2.500 €). /api/plan cuenta sus órdenes como las demás filas. Los planes sin reglas no cambian (ninguna fila nueva).
- «Detalle»: tras «Qué aportó cada bloque», una tarjeta por bloque con reglas «Bloque N · cuándo actuó cada regla» (TarjetaReglas en components/PlanDetalle.js; datos de reglasDeBloques en lib/builder/detallePlan.js con ej.pesos[id].historial y .estados del motor, §194): la frase de cada regla («Así se lee»), una FRANJA de estado (gris = ninguna regla en curso; cada regla, su color; tooltip con las fechas) con la parte del tiempo en cada estado, y la tabla «Se cumplió / Actuó / Regla / Qué hizo / Movió / Pesos después» (las vueltas a los pesos de partida, «Acaba la regla N…», en gris). También en «Copiar para Claude».
- Portada de Planes y «Comparar planes»: el bloque dice cuántas reglas lleva («Con pesos · SPY/TQQQ · 1 regla»).
- Comprobación nueva plan-reglas-detalle.js (a mano: 30 sesiones; 80 % B + 20 % T, T cae un 50 % → 50/50 un mes y vuelta: movió 1.750 € y 2.430 €; final 10.850 € y sin reglas 9.800 €; franja 4 · 22 · 4 sesiones). Ninguna cifra de los planes guardados cambia (no llevan bloques «Con pesos»).

## 201. Bloque «Con pesos» recién añadido: el aviso, en palabras (19/11)
Visto en la app (19/11): al pulsar «+ Añadir bloque ▾» → «Con pesos», el bloque nace en blanco y arriba salía en rojo «✕ Pieza b2: «» no es un símbolo válido (en mayúsculas, como SPY, TQQQ o ^GSPC).».
- lib/planes/pesos.js (validaPiezaPesos): con el activo sin elegir, «Falta elegir el activo en «1 · Pesos de partida».» (un símbolo mal escrito sigue diciendo que no es válido).
- components/BuilderPlan.js: `enBloques(texto, plan)` (exportada) cambia en pantalla el «Pieza <id>:» del motor por «Bloque N:» (N = su puesto en plan.piezas, el mismo número de la columna izquierda); un id que no está o un texto sin pieza quedan igual. Ahora sale «✕ Bloque 2: Falta elegir el activo en «1 · Pesos de partida».».
- plan-pesos-pantalla.js: las dos pruebas del bloque en blanco miran el texto nuevo, más una de enBloques. Solo cambian textos de aviso: ninguna cifra cambia.

## 202. Plan con un aviso rojo: la columna derecha dice que espera (19/11)
Visto en la app (19/11) tras §201: con un aviso rojo arriba (el plan no es válido, p. ej. el bloque «Con pesos» en blanco), el plan no se calcula, pero la columna derecha se quedaba en «Calculando tu plan…» para siempre (con un solo bloque decía «Sin resultado todavía.»).
- components/BuilderPlan.js: en los dos `data-sin-resultado`, si hay errores de validaPlan, `ESPERA_ERRORES` = «Tu plan se calculará cuando arregles lo que sale en rojo arriba.». Sin errores, igual que antes.
- plan-pesos-pantalla.js: una prueba más (bloque en blanco → ese texto). Solo cambia un texto: ninguna cifra cambia.

## 203. El dinero ocioso con su propia regla, parte 1: el motor (19/11)
Decisiones de Sergi del 19/11 («sí, a todo»; boceto bocetos/ocioso-con-regla.html): la regla se escribe con filas del catálogo (todas a la vez, «Y»), se mira al cierre y actúa a la apertura siguiente, y mientras no se cumple el dinero espera en liquidez o en otro símbolo. Sin pantalla todavía: en la app nada cambia.
- lib/planes/ociosoRegla.js (nuevo): campo opcional de la pieza estrategia `ociosoRegla: { filas, siNo }` (filas = las de las reglas del bloque «Con pesos», validaFilas de lib/planes/pesos.js, ahora exportada); validaOciosoRegla (el ocioso no puede ser liquidez; siNo = LIQUIDEZ o un símbolo distinto del ocioso y del valor; solo «Y»), simbolosOciosoRegla, simbolosFilasOcioso y sinReglaOcioso.
- lib/planes/plan.js: validaPlan la comprueba (con varios bloques, la misma regla en todos: el ocioso es de la cuenta); con lista, siNo tampoco puede ser un valor de la lista (motivoListaNoCalculable). En el motor, `OCR` = quien tiene el ocioso (la pieza estrategia o, con varios bloques, la cuenta) con `ocReg` { dentro, fuera, serie (serieFilas), simbolos, cambio, estados }; el día i manda lo que dijo la regla al cierre de la víspera (objetivoOcioso). `cambiaOcioso` a la apertura: vende el ocioso de antes a la liquidez y cambia de símbolo; ese mismo día lo compra la lógica de siempre (un valor: aOcioso, salvo si la estrategia salió hoy dentro de la vela, que va al cierre; lista: sobranteAlOcioso a la apertura, con la regla del 1 %; varios bloques: el sobrante de la cuenta a la apertura de siempre). El último día no se cambia (se vende todo a su cierre). En el libro, los dos símbolos del ocioso son «ocioso». Salida nueva `ociosoRegla: { dentro, fuera, estados }` (1 = en el ocioso con la regla cumplida) solo si hay regla; estrategiasDe da como ocioso el de «dentro».
- lib/planes/estrategia.js (simbolosDe) y lib/planes/datosServidor.js: cargan las velas de siNo y de lo que miran las condiciones (con toda su historia, como las reglas de «Con pesos»). lib/planes/evalua.js: «el mismo plan con el ocioso en liquidez» quita la regla.
- Comprobación nueva plan-ocioso-regla.js (en comunes.sh). A mano: G a 11, 12, 9, 9, 11, 12, 13, 13 con la regla «G: cierre sobre su SMA (3)»: compra el 01/03 a 11, vende el 04/03 a 9 (8.181,82 €), vuelve el 08/03 a 12; final 10.000 × 9 × 13 / (11 × 12) = 8.863,64 € (siempre dentro, 11.818,18 €); igual con «si no se cumple, en H», con lista y con dos bloques. Sin regla, ninguna cifra cambia.

## 204. El dinero ocioso con su propia regla, parte 2: la pantalla (20/11)
Lo que se ve de §203 (boceto bocetos/ocioso-con-regla.html, pestañas 1 y 4). Donde se elige el dinero ocioso (en el bloque con uno solo; en «Tu dinero» con varios, porque es de la cuenta), si no es la liquidez, sale «Cuándo está dentro: Siempre / Solo cuando lo diga una regla». «Siempre» = lo de siempre (el plan no lleva regla: ninguna cifra cambia).
- Con «Solo cuando lo diga una regla» sale la fila de entrada «<ocioso>: cierre sobre su EMA 200, velas diarias» (decisión de Sergi, 19/11), que se cambia como cualquier fila del creador (components/BuilderFila.js: de quién —el ocioso, los índices u «Otro símbolo…»—, sus números y velas diarias/semanales); «+ condición» abre el catálogo (sin las condiciones que solo valen dentro del Nasdaq-100); varias filas, siempre «y además». Debajo «Si no se cumple: Espera en liquidez / En otro símbolo…» (buscador de los símbolos con precios guardados) y «Así se lee».
- components/OciosoRegla.js (nuevo) y lib/builder/ociosoReglaPantalla.js (nuevo, puro: filaOciosoDefecto, reglaOciosoNueva, conY, ociosoReglaDelPlan, fraseOciosoRegla, AYUDA_OCIOSO_REGLA). Las filas se pasan a pantalla y vuelven con las de lib/builder/reglasPesos.js.
- lib/builder/planPantalla.js: ajuste nuevo a.ociosoRegla (null por defecto) = { filas, siNo } en el formato del motor; planDe lo pone en la pieza (con varios bloques, en todas las de estrategia; nunca en las de «Con pesos») solo si el ocioso no es la liquidez; ajustesDe lo lee de la pieza. Sin regla, la pieza no lleva el campo: los planes guardados no cambian (huella idéntica).
- Los avisos rojos de arriba son los del motor (validaOciosoRegla), p. ej. «Si no se cumple» igual que el ocioso.
- Comprobación nueva plan-ocioso-regla-pantalla.js (en comunes.sh): lo puro (fila por defecto, frases, ida y vuelta con uno y con varios bloques) y el montaje con estado.
- Falta (parte 3): la fila «El mismo plan con el ocioso siempre dentro», la cifra «En el ocioso: en <símbolo> X % · esperando Y %», la franja en «Detalle» y «por la regla del ocioso» en «Todos los movimientos».

## 205. El dinero ocioso con su propia regla, parte 3: «¿aporta algo?» y «Detalle» (20/11)
Lo que falta del boceto bocetos/ocioso-con-regla.html (pestañas 1 y 3). Solo con regla: sin ella, nada cambia.
- lib/planes/evalua.js: referencia nueva OCIOSO_SIEMPRE «El mismo plan con el dinero ocioso siempre dentro» (las piezas con sinReglaOcioso), con un bloque y con varios; pages/api/plan.js le cuenta sus órdenes. En «Tu dinero» es la primera fila tras «Tu plan» (ORDEN_ALTERNATIVAS) y su explicación va en el «?» de la tabla (AYUDA_OCIOSO_SIEMPRE).
- «En el ocioso»: debajo, «en oro X % · esperando Y %» (reparteOciosoRegla de lib/builder/ociosoReglaPantalla.js, con los estados del motor y la franja de la estrategia: con un valor, parte del tiempo; con lista o varios bloques, parte del dinero de media). cifrasPlan da cifras.ociosoRegla.
- lib/planes/plan.js: el libro marca con regla: true las órdenes del ocioso que manda su regla (la venta del ocioso de antes en cambiaOcioso y la compra del nuevo ese mismo día); en «Historial › Todos los movimientos» dicen «· por la regla del ocioso». Las cifras no cambian.
- «Detalle»: tarjeta «El dinero ocioso, día a día» (franjaOciosoRegla de lib/builder/detallePlan.js, FranjaOciosoRegla de components/PlanDetalle.js): por día, en el ocioso (amarillo), esperando (naranja) o sin dinero libre (gris, menos del 1 % del patrimonio en el ocioso o en liquidez), con la parte de los días de cada uno.
- plan-ocioso-regla.js, apartado 5 (a mano con las velas de §203): «siempre dentro» 11.818,18 € frente a 8.863,64 €; en G 6 de 8 días y esperando 2; franja 1 1 1 2 2 1 1 1; las órdenes del 04 y el 08 «por la regla».
## 206. Dibujar sobre los gráficos, parte 1: la tabla de los dibujos (20/11)

Primera parte de «Dibujar sobre los gráficos» (boceto bocetos/dibujar-graficos.html; decisiones de Sergi del 20/11: barra lateral, primero el gráfico grande de un valor, dibujos guardados en la base por valor). Solo la base: la app todavía no la usa y ninguna cifra cambia.
- sql/dibujos_grafico.sql (con REVERSIÓN): tabla public.dibujos_grafico, una fila por usuario y valor (clave user_id + simbolo) con dibujos jsonb (lista; como mucho 200 KB por valor) y updated_at del disparador. Cada punto de un dibujo irá por FECHA y PRECIO, para que valga igual en diario y en semanal.
- RLS «dueño» como builder_pestanas: cada usuario lee, crea, cambia y borra solo lo suyo; permisos por columnas (simbolo y dibujos; el upsert de PostgREST manda los dos); anon, nada. Símbolo en mayúsculas y sin espacios.
- Aplicada el 20/11 en Supabase LOCAL (postgres-meta). La nube no se toca.
- scripts/comprobaciones/dibujosSeguridad.js (no va en comunes.sh): dos usuarios simulados y anon en una transacción que se deshace, más la clave anon por HTTP: 25/25.
- Sin comunes.sh en este commit: no cambia nada que la app ejecute (como §147).
## 207. Dibujar sobre los gráficos, parte 2: las cuentas (20/11)

Las cuentas de los dibujos, puras y sin pantalla (lib/dibujos/geometria.js). La app todavía no las usa: nada cambia.
- Fecha ↔ vela: escala(fechas) e intervaloDe (semanal si la mediana de los últimos 20 huecos es de 4 días o más); indiceDeFecha da el sitio con decimales entre dos velas (un miércoles en semanal: 2/7 tras su lunes); a la derecha de la última vela se cuenta en sesiones de lunes a viernes (diario) o en semanas (semanal), y a la izquierda de la primera igual hacia atrás; fechaDeIndice redondea a la vela (los puntos se ponen siempre en una vela, también futura). Vela → fecha → vela da la misma vela.
- precioEnRecta (también la línea que se alarga hacia la derecha), paralela (canal: por el 3.er punto), iman (apertura, máximo, mínimo o cierre más cercano), nivelesFibonacci (como TradingView y el boceto: 0 en el segundo punto, 1 en el primero), medir (diferencia, %, velas).
- Posición larga/corta: posicionValida, objetivoPorDefecto (2 R), accionesPorRiesgo (redondeo hacia abajo: 100 € con entrada 182,40 y stop 178,00 → 22 acciones, 4.012,80 €, 96,80 € de riesgo), cifrasPosicion (% y R:R) y resultadoPosicion (desde la vela siguiente a la de entrada; si una vela toca stop y objetivo, cuenta el stop; «abierta» / «futuro»). Como en el boceto, la entrada se da por hecha en su vela.
- Lo que se guarda (§206): PUNTOS_DE por tipo (tendencia 2, rayo 2, horizontal 1, vertical 1, canal 3, rectangulo 2, fibonacci 2, larga/corta 3: entrada, stop —su fecha marca el final de la caja— y objetivo, texto 1; «medir» no se guarda), limpiaDibujo / limpiaDibujos (fuera lo que no vale y los ids repetidos; color #rrggbb, grosor 1–4, texto ≤ 200 letras, arriesgo ≥ 0; como mucho 300 por valor, que caben en los 200 KB).
- Comprobación nueva scripts/comprobaciones/dibujos.js en comunes.sh (51, todas a mano).
## 208. Dibujar sobre los gráficos, parte 3: la barra lateral y las herramientas (20/11)

En el gráfico grande de un valor (CandleChart de pages/index.js, la primera instancia; la de pantalla completa llega con la parte 4) sale a la izquierda la BARRA LATERAL del boceto (opción A). Los dibujos viven en MEMORIA, por valor: al cambiar de valor y volver siguen, al recargar se pierden (la parte 4 los guarda en la base). Ninguna cifra cambia.
- CandleChart: prop nueva `dibujar` (por defecto apagada). Sin ella, el HTML sale carácter a carácter el de antes (comprobado con 4 casos). Con ella, una fila: el hueco de la barra y el gráfico de siempre; dentro del contenedor de las velas se monta components/DibujosGrafico.js.
- components/DibujosGrafico.js: la barra (cursor, línea de tendencia, línea que se alarga hacia la derecha, horizontal, vertical, canal paralelo, Fibonacci, rectángulo, texto; imán, deshacer, borrar todo en rojo y un «?») va por un portal al hueco de la izquierda; la capa es un SVG encima de las velas, recortado al panel, con las etiquetas de la horizontal (precio) y de la vertical (fecha) en los ejes. Todo el estado vive en este componente: mover el ratón o desplazar el gráfico no vuelve a pintar CandleChart (que rehace su gráfico entero al cambiar sus props). Se redibuja cuando cambia la vista (se mira cada fotograma una firma con la posición de dos velas y dos precios, el ancho y el alto).
- Cómo se coge el ratón sin romper el gráfico: con una herramienta elegida, oyentes en fase de CAPTURA sobre el contenedor se quedan los clics (mousedown, mouseup, click, dblclick, pointer y toques): lightweight-charts no arrastra, no pone la alarma del doble clic ni la regla. El movimiento y la rueda sí le llegan (su cruz sigue y se puede acercar mientras se dibuja). Con el cursor, cada dibujo lleva una franja invisible de 10 px que lo elige y lo mueve; fuera de ella el gráfico funciona como siempre. El doble clic justo después de terminar un dibujo (medio segundo) tampoco pone alarma.
- Píxeles ↔ velas: la vela i está en x0 + i × separación (logicalToCoordinate de las velas 0 y 1): lineal, con decimales y también a la derecha de la última. Precios con priceToCoordinate / coordinateToPrice de la serie de velas (vale con escala logarítmica). Los puntos se ponen en una vela (fechaDeIndice) y se guardan por fecha y precio.
- Herramientas: las de dos puntos con dos clics o arrastrando; el canal con un tercer clic donde va la paralela; texto con un cuadro propio (Intro guarda, Esc cancela; doble clic o ✎ para cambiarlo). Vista previa mientras se pone y una línea de ayuda abajo. Al terminar, vuelve el cursor y el dibujo queda elegido.
- Elegido: asas para tirar de cada punto (la horizontal solo cambia de precio, la vertical solo de fecha) y barrita arriba con 6 colores, grosor 1–4, duplicar (5 velas a la derecha) y papelera roja. Arrastrar el dibujo entero lo mueve por velas enteras y precio.
- Imán: mientras se mantiene Ctrl, o con su botón encendido; pega el punto a la apertura, máximo, mínimo o cierre de su vela (iman de lib/dibujos/geometria.js). Teclado: Esc cancela o quita la elección, Supr borra lo elegido, Ctrl+Z deshace (60 pasos; también «borrar todo»), Alt+T/A/H/V/C/F/R/X eligen herramienta (solo con el ratón encima del gráfico; nunca dentro de un cuadro de texto).
- lib/dibujos/pantalla.js (puro): HERRAMIENTAS, ATAJOS, colores por tipo, formas(dibujo, conversor) → trazos, etiquetas de eje, franjas para el ratón y asas; provisional (vista previa), mueve, mueveAsa, duplica, creaDibujo (pasa por limpiaDibujo: todo dibujo tiene ya la forma que se guardará).
- Decidido por mí: el doble clic sigue poniendo la alarma de precio con el cursor; la regla 📏 se queda hasta que «Medir» (parte 5) haga lo mismo; duplicar desplaza 5 velas.
- Comprobación nueva scripts/comprobaciones/dibujos-pantalla.js en comunes.sh: cifras de cada forma a mano (conversor x = 10·i, y = 200 − p), CandleChart sin `dibujar` idéntico al commit anterior, y el montaje con estado (clics, vista previa, arrastrar, imán con Ctrl y con el botón, mover, deshacer, Supr, Alt+F, Esc, borrar todo y deshacer, texto, memoria por valor).
## 209. Dibujar sobre los gráficos, parte 4: se guardan con cada valor (20/11)

Los dibujos se GUARDAN en la base por valor (tabla dibujos_grafico de §206) y se puede dibujar también en el gráfico a pantalla completa. Ninguna cifra cambia.
- lib/dibujos/guardados.js: leerDibujos / guardarDibujos (upsert por usuario y valor; sin dibujos, la fila se BORRA) y simboloDe (mayúsculas, sin espacios, 1–30 letras, lo que pide la base). Lo leído y lo guardado pasa siempre por limpiaDibujos.
- components/DibujosGrafico.js: al abrir un valor se leen sus dibujos (la primera vez en la visita; después, de la memoria); cada cambio se guarda 800 ms después del último (un arrastre, al soltar: no a cada paso); al cambiar de valor o cerrar el gráfico, lo pendiente se guarda ya. Si se dibuja algo mientras se lee, se junta con lo leído y se guarda la suma. Si la base falla, aviso rojo de una línea abajo a la izquierda.
- Dos instancias a la vez (el gráfico normal y el de pantalla completa, pages/index.js ~8007, ahora también con `dibujar`): se avisan entre sí, lo dibujado en una sale en la otra.
- Prop opcional `ctx` (para las pruebas); por defecto ctxConSesion() de lib/supabase.js, como los planes.
- Visto en la app: una horizontal o vertical FUERA de la vista sacaba su etiqueta fuera del gráfico, y su franja invisible podía coger clics fuera de él. Ahora sin etiqueta fuera de la vista, y lo que coge el ratón va recortado al panel como el dibujo.
- dibujos-pantalla.js amplía su apartado 4 con una base de mentira: guardar, leer, borrar la fila vacía, «^GSPC» en la dirección, error, y en el componente leer al abrir, guardar a los 800 ms, no guardar mientras se arrastra y sí al soltar, dos instancias, guardar al cambiar de valor, juntar lo dibujado mientras se lee y el aviso rojo.
## 210. Dibujar sobre los gráficos: lo pedido por Sergi al ver la parte 3, y la 🎯 de alertas (20/11)

Pedido por Sergi al ver la barra (20/11). Ninguna cifra cambia.
- Cada tipo de dibujo RECUERDA el último color, grosor y (en el texto) tamaño de letra elegidos: los nuevos de ese tipo salen así. Se guarda en el navegador (localStorage «dibujos.estilo»; estiloRecordado en lib/dibujos/pantalla.js solo deja pasar lo que vale).
- TEXTO con tamaño de letra: campo `tam` (8–48; sin él, 13) en limpiaDibujo; en la barrita del texto, «A− 13 A+» recorre 10, 11, 13, 16, 20, 24 y 32. La franja del ratón y el recuadro de elegido van a la medida de la letra.
- FLECHAS del teclado con un dibujo elegido: ← → una vela, ↑ ↓ un píxel de precio a la escala de ese momento (con Mayús, 10). Una serie de pulsaciones seguidas (menos de 0,8 s entre una y otra) se deshace de una vez. Se guarda como cualquier cambio (800 ms).
- La barra de arriba del gráfico de Watchlist (absoluta, 30 px, encima de las velas) tapaba el primer botón de la barra lateral y la barrita del dibujo elegido: prop nueva `dibujarArriba` de CandleChart (30 en el gráfico normal; a pantalla completa esa barra va fuera, 0) que los baja.
- 🎯 ALERTA DE PRECIO en la barra lateral (opción A del boceto bocetos/grafico-indicadores-alertas.html, elegida por Sergi): con ella elegida, un clic en el gráfico (con Ctrl o el imán, pegado a la vela) abre la ventana de alarma de precio de siempre (la del doble clic, PriceAlarmQuickForm) con ese precio redondeado a 2 decimales; propone «baja hasta» si está por debajo del último cierre (prop opcional `condInicial`). No crea ningún dibujo y vuelve el cursor. Funciona también en Watchlist y Risk, donde el doble clic sigue apagado. Prop nueva `onAlertaPrecio` de CandleChart (sin ella no sale la 🎯).
- dibujos-pantalla.js, apartado 5: todo lo de arriba con cifras a mano (p. ej. horizontal en 150: ↑ ↑ Mayús+↓ → 142; 🎯 en 123,456 → 123,46 con último cierre 109; con Ctrl, 103,6 → 103).
## 211. Dibujar sobre los gráficos, parte 5: posición larga y corta, «Medir» y 🔒 «seguir dibujando» (20/11)

Ninguna cifra cambia.
- POSICIÓN LARGA / CORTA (herramientas «larga» y «corta», Alt+L / Alt+S): clic en la entrada y clic en el stop; colocaPosicion (lib/dibujos/pantalla.js) pone el stop a un 3 % si cae al otro lado, la caja hasta la vela del stop y como poco 12 velas, y el objetivo a 2 R (larga 100 / 95 → 110; corta 100 / 104 → 92). Se pinta como en el boceto: zona verde (objetivo) y roja (stop), rótulos «Objetivo … · gana … % · … R», «Stop … · pierde … %», «Entrada … · N acciones (… €) arriesgando … €» (accionesPorRiesgo: redondeo hacia abajo) y, debajo, si después tocó antes el stop o el objetivo (resultadoPosicion con las velas del gráfico; en la misma vela, el stop). Asas: entrada, stop, objetivo y borde derecho; una posición que no vale (stop al otro lado) no se acepta. «Arriesgo … €» en su barrita; la posición nueva sale con el último que se escribió (el mismo para larga y corta) o, si no hay, con el del PERFIL DE RIESGO activo (prop `arriesgoDefecto` de CandleChart: % del patrimonio —aportaciones − retiradas + resultado cerrado + flotante, como el panel Risk— o € fijos).
- MEDIR (Alt+M, o Mayús + arrastrar con el cursor, como TradingView): caja y línea discontinua con «+10,00 (+10,00 %) · 4 velas» (formasMedir). No se guarda; el siguiente clic en el gráfico o Esc lo quita. SUSTITUYE a la regla 📏 de la barra de arriba del gráfico (botón retirado en las dos instancias de pages/index.js; pedido por Sergi con una flecha en su captura). El código de la regla en CandleChart se queda (rulerActive siempre apagado).
- 🔒 SEGUIR DIBUJANDO (pregunta de Sergi: «¿no tendría más sentido seguir dibujando?»): por defecto, como TradingView, tras cada dibujo vuelve el cursor; con el candado encendido la herramienta sigue elegida hasta pulsar el cursor o Esc. Se recuerda en el navegador (localStorage «dibujos.seguir»). «Medir» vuelve siempre al cursor.
- Respondido a Sergi (sin cambios): «borrar todo» borra solo los dibujos del valor abierto; las líneas de alarma ya se arrastran arriba y abajo con el cursor (comprobado: sale la flecha ↕ sobre la línea); «Al tocar el precio» irá con la pestaña «Alertas» (hay que cambiar también la comprobación diaria de las alarmas).
- dibujos-pantalla.js, apartado 6, con cifras a mano (p. ej. 100 € de riesgo con 5 € por acción → 20 acciones, 2.000 €; con las velas de la prueba el objetivo 110 lo toca la vela del 10/01/2024).
## 212. Gráfico de un valor: botón y ventana «📈 Indicadores» (20/11)

Opción A del punto 3 de bocetos/grafico-indicadores-alertas.html (pestaña 2), aceptada por Sergi («adelante con todo»). Ninguna cifra cambia.
- Botón «📈 Indicadores» en la barra de arriba del gráfico (pages/index.js, normal y pantalla completa), justo después del valor. Abre components/VentanaIndicadores.js: grupos a la izquierda (Todos, ☆ Favoritos, Sobre el precio, En panel aparte), buscador con ✕ sin mayúsculas ni acentos que busca también por otras palabras («ema», «movil», «bandas», «oscilador»…; lib/indicadoresVentana.js) y la lista con dónde va cada uno y su ☆ (favoritos en el navegador, localStorage «indicadores.favoritos»). Un clic añade el indicador con sus valores por defecto (nuevoIndicador + ponIndicadores, lo mismo que hacía «+ Indicador») y la ventana sigue abierta; abajo, lo que ya hay en el gráfico. Esc, la ✕ o un clic fuera la cierran.
- Fuera «+ Indicador» de la leyenda de CandleChart (y su estado indMenu). La lista de la leyenda (ocultar, ⚙, ✕, doble clic para configurar) se queda igual.
- Comprobación nueva scripts/comprobaciones/indicadores-ventana.js en comunes.sh.
## 213. Dibujar: Ctrl+Z arreglado, borrar de un valor o de todos y el ojo para ocultar lo de la estrategia (20/11)

Pedido por Sergi tras probar la barra. Ninguna cifra cambia.
- CTRL+Z (y los atajos Alt+letra) no funcionaban si el ratón ya estaba encima del gráfico al montarse (no llega «mouseenter»): ahora cuenta como «encima» también al mover el ratón por el gráfico y al estar sobre la barra lateral.
- PAPELERA de la barra: abre la ventana propia «Borrar dibujos» con «Los de este valor (N)» (se deshace con Ctrl+Z) y «Los de todos los valores (M valores, K dibujos)» con la lista de los otros y ⚠ «No se puede deshacer» (lib/dibujos/guardados.js: resumenDibujos y borrarTodosLosDibujos, DELETE con `simbolo=not.is.null`; la RLS solo deja borrar los del usuario). Cancelar, ✕ o clic fuera la cierran.
- 👁 OJO en la barra (solo con `dibujar`): oculta lo que pinta la ESTRATEGIA para dibujar más limpio: operaciones (etiquetas, flechas, líneas de entrada y salida), eventos (customMarkers), cambios de pendiente, zonas de filtro y marcas del razonamiento. Se quedan las velas, las medias e indicadores de la estrategia y las órdenes y operaciones reales. Lo lleva un envoltorio de CandleChart (propsDelGrafico, exportada; sin `dibujar` pasa las props tal cual) y se recuerda en el navegador (localStorage «dibujos.sinEstrategia»).
- Visto el 20/11 tras reiniciar: la tabla dibujos_grafico estaba vacía (Sergi había borrado los de ^GSPC con la papelera, que entonces borraba los del valor); el resto de los datos, intacto.
- dibujos-pantalla.js: apartados 7 (Ctrl+Z sin «mouseenter» y sobre la barra) y 8 (propsDelGrafico y el ojo), ventana de borrar en los apartados 3 y 4 (con «todos los valores» en la base de mentira).
## 214. Gráfico de un valor: las líneas de alarma ya no desaparecen al rehacerse el gráfico (20/11)

Visto al probar el 👁 (§213): al rehacerse el gráfico entero (cambian las operaciones, las etiquetas % / All o «Razonamiento»), las líneas de las alarmas de precio desaparecían hasta cambiar de valor. Su efecto en CandleChart solo dependía de priceAlarms, ackedAlarms y data; ahora también de chartReadyTick, como ya hacían las órdenes pendientes, las operaciones reales y las líneas de Risk. Fallo de antes (también pasaba al pulsar «Razonamiento»). Comprobado en la app con ^GSPC (7.640,12 y 6.025,17 siguen con el ojo encendido y apagado). Comprobado también Ctrl+Z en la app (§213).

## 215. Alertas desde cero, parte 1: las tablas de las alertas (20/11)

Sergi (20/11): lo de hoy en alertas (🔔 del menú, tabla «alarms») era una idea sin desarrollar; se rehace desde cero y totalmente funcional, para el 100 % de los valores y que avise al tocar un precio. Boceto bocetos/alertas-desde-cero.html, aceptado entero («Sí, a todo»): tarea de Windows cada 15 min en horario de Wall Street + pasada a las 22:15 aunque la app esté cerrada; aviso dentro de la app + notificación de Windows (Telegram, más adelante); tipos «Toca el precio», «Cierra por encima / por debajo», «Se mueve un %», «Condición del catálogo» y después «Señal de una estrategia»; tras saltar «Una vez» por defecto; pestaña «Alertas» junto a «Resumen» + pantalla con todas. Esta parte es solo la base: la app todavía no la usa y ninguna cifra cambia.
- AUDITORÍA de lo de hoy (solo lectura): la tabla alarms no tiene columna para los números de las alertas técnicas y upsertAlarm (pages/index.js) los descarta: «RSI por debajo de 25» se comprobaba con el 30 de fábrica. Solo se comprobaban al abrir la app, si la Watchlist tenía ≤ 50 valores, y con el último precio; «vista» se guardaba en el navegador.
- sql/alertas.sql (con REVERSIÓN): public.alertas (simbolo, tipo, regla jsonb ≤ 50 KB con el formato de cada tipo explicado en el archivo, despues una_vez / una_al_dia / cada_vez, activa, armada, caduca, nota ≤ 2000 letras, ultimo_salto, origen = id de la alarma vieja, creada y actualizada del disparador) y public.alertas_saltos (historial «Saltaron»: alerta_id con borrado en cascada, simbolo, cuando, precio, detalle jsonb, visto). RLS «dueño» con permisos por columnas; un salto solo se puede apuntar en una alerta propia; del salto, el usuario solo cambia «visto». anon, nada.
- Copiadas las 3 alarmas activas de hoy: CNL y CRDO como «Toca el precio» (sube hasta 19,16 y 111,12; la vieja comparaba el último precio con el nivel), ALAB como «Condición del catálogo» (EMA 10 cruza por debajo de la EMA 11, diarias, «cada vez»). La tabla alarms y la 🔔 siguen igual hasta que lo nuevo tenga todo (norma del mapa).
- Aplicada el 20/11 en Supabase LOCAL (postgres-meta). La nube no se toca.
- scripts/comprobaciones/alertasSeguridad.js (no va en comunes.sh): dos usuarios simulados y anon en una transacción que se deshace, más la clave anon por HTTP: 38/38.
- Sin comunes.sh en este commit: no cambia nada que la app ejecute (como §206).

## 216. Alertas desde cero, parte 2: el motor (21/11)

lib/alertas/motor.js, PURO (no lee la base ni Yahoo): recibe una fila de public.alertas y lo que se sabe del día ({ fecha, dia: { abre, maximo, minimo, ahora }, cerrada, cierreAyer, velasDe }) y dice si se cumple y qué cambia en la alerta. Lo usarán el comprobador de Windows (parte 3) y la pantalla. La app todavía no lo usa: ninguna cifra cambia.
- Cuándo salta: «toca» sube = el máximo del día llega al nivel (≥), baja = el mínimo baja a él (≤); salta al nivel, o a la apertura si abrió más allá. El DÍA EN QUE SE CREA solo cuenta el precio de ahora (el máximo de antes de crearla no vale). «cierra» = cierre estrictamente al otro lado del nivel, solo con la vela cerrada (pasada de las 22:15). «movimiento» = X % desde el cierre de ayer con el máximo / mínimo del día; con «ambos» y los dos tocados, cuenta el más cerca del precio de ahora. «condicion» = filas del catálogo con serieFilas de lib/planes/pesos.js (las mismas que el ocioso con regla y las reglas de «Con pesos»; quien 'valor' = el símbolo de la alerta; todas con «Y»), solo al cierre y solo si ya está la vela de hoy. «estrategia», todavía no. Si falta un dato, «no se sabe» y la alerta no cambia.
- Después de saltar: una_vez → activa = false; una_al_dia → como mucho una por sesión (el día de ultimo_salto en la hora de Nueva York, diaNY); cada_vez → armada = false al saltar y true en cuanto una pasada ve que ya no se cumple. caduca (incluido): después de ese día se apaga sin saltar.
- sentidoToca(nivel, ahora): la dirección de «Toca el precio» se pone sola (nivel ≥ precio de ahora → al subir).
- La alerta de ALAB copiada en §215 (mediaVsMedia sin «comparacion») es válida para validaFilas.
- Comprobación nueva scripts/comprobaciones/alertas.js en comunes.sh (46, todo a mano con velas inventadas: «Cierra por encima de 250» con máximo 252 y cierre 248 no salta; cae un 5 % desde 100 con mínimo 95 salta a 95; el cierre 12 cruza su SMA 3 = 10,33; una semana de «cada vez» salta el 16 y el 19).

## 217. Alertas desde cero, parte 3: el comprobador y la notificación de Windows (21/11)

scripts/alertas/: el comprobador que mira las alertas aunque la app esté cerrada (con el PC encendido). La app todavía no lo usa: ninguna cifra ni pantalla cambia.
- comprobador.js: lee las alertas encendidas de la base LOCAL con la clave de servicio (se niega si NEXT_PUBLIC_SUPABASE_URL no es 127.0.0.1); pide a Yahoo una vez por símbolo las velas diarias (range=5d; range=max para los símbolos que miran las condiciones del catálogo) y el precio de ahora; la vela está «cerrada» salvo que sea la de la sesión en curso (currentTradingPeriod.regular de Yahoo) y aún no haya terminado; cada día en la hora de su bolsa (exchangeTimezoneName). Con el motor (lib/alertas/motor.js): si salta, apunta el salto en alertas_saltos (con user_id de la alerta, precio y detalle con el texto del aviso), cambia la alerta (activa / armada / ultimo_salto) y avisa. Si la base está apagada, no hace nada. Registro en Documentos\TradingSimulator_alertas\_registro.txt (2.000 líneas). Opciones de prueba: --ensayo, --usuario, --precios, --ahora, --sin-aviso, --sin-registro.
- notificacion.ps1: notificación de Windows con sonido, remitente «Windows PowerShell» (sin instalar nada); textos en base64 para los acentos; pulsarla abre http://localhost:3000. Como mucho 3; si saltan más, una que lo resume.
- Tarea de Windows «TradingSimulator - alertas» (instalaTarea.ps1, sin ventana por comprobador.vbs): lunes a viernes de 09:00 a 23:00, cada 15 min (bolsas europeas y Wall Street, también las semanas en que EE. UU. cambia la hora antes que España, y las pasadas tras el cierre). Instalada el 21/11; la primera, el lunes 23/11 a las 09:00.
- Motor, retoques: una alerta creada el día de la sesión O DESPUÉS (un sábado, con la vela del viernes) solo mira el precio de ahora en «toca» y «movimiento»; diaNY(ts, zona) con la hora de cada bolsa (ctx.zona); fraseSalto y fmt (números a la española) para el texto del aviso.
- scripts/comprobaciones/alertasComprobador.js (no va en comunes.sh; necesita la base encendida): usuario simulado con 8 alertas y precios inventados → saltan ZA (a 100), ZC (a 95) y ZF (a 12); ZB no se mira (sesión abierta), ZD se rearma, ZE caduca, ZG no, ZH sin precios; la segunda pasada no hace saltar nada; borra el usuario al acabar y comprueba que las alertas y saltos de Sergi siguen idénticos (md5). 18/18.
- Ensayo con las 3 alertas de Sergi y Yahoo de verdad (sábado 21/11, sin escribir): saltaría «CRDO tocó 111,12» (el viernes 20/11 su máximo fue 114,18; cerró en 99,86). Notificación de prueba enviada a su pantalla.
- Sin comunes.sh en este commit: no cambia nada que la app ejecute (como §206); alertas.js (52) en verde.

## 218. Alertas desde cero, parte 4: pestaña «Alertas», ventana «Nueva alerta» y líneas del gráfico (21/11)

Lo primero de las alertas nuevas que se ve en la app (boceto bocetos/alertas-desde-cero.html, partes 2 y 3).
- lib/alertas/guardadas.js: leer / guardar (valida con validaAlerta) / cambiar / borrar alertas y leer / marcar vistos los saltos, por REST con ctxConSesion (la RLS deja solo lo del usuario).
- lib/alertas/pantalla.js (puro): resumenAlerta («Toca 235,00»…), asiSeLee (la frase exacta, con ejemplo numérico en «movimiento» y la condición con fraseFilasRegla), distancia (% que le falta al precio de ahora), lineasDeAlertas (las encendidas de precio de un valor con la forma de las alarmas de siempre: price_above / price_below), reglaArrastrada (arrastrar «toca» al otro lado del precio cambia la dirección sola), alertaNueva.
- components/PanelAlertas.js: useAlertas (todas las alertas y los últimos 200 saltos; recarga cada minuto y al volver a la pestaña del navegador), PanelAlertas (las de ESE valor: encendidas, apagadas, ⏸ / ↻, ✎, 🗑 roja con «Borrar / No»; «Saltaron» con «✓ Vista» y «✓ Todas vistas»; «?» con el ejemplo de «Toca 100») y VentanaAlerta («Nueva alerta» / «Cambiar alerta»: toca, cierra, movimiento; «Condición del catálogo» apagada hasta la parte 6; después de saltar; caduca; nota; «Así se lee»; Esc o fuera cierra).
- pages/index.js: el panel derecho sale también SIN backtest (solo «Alertas»); con backtest, pestañas «Resumen · X» / «Alertas (N) · N sin ver», recordada en el navegador (panelDerecho). Las líneas del gráfico (normal y pantalla completa) son las alertas nuevas; 🎯, doble clic (decidido por mí: también en la Watchlist; en Risk no) y «+ Nueva» abren la ventana nueva; arrastrar una línea cambia la alerta nueva. La 🔔 de siempre y la tabla alarms siguen igual (norma del mapa); sus líneas ya no se pintan (las 3 se copiaron en §215).
- La alerta de CRDO (copiada de la vieja) se apagó a petición de Sergi (21/11: era una prueba).
- Visto por mí en la app (sesión de Sergi, nada guardado): pestaña «Alertas» de CNL con «Toca 19,16 · +98,34 % del precio» y la línea verde en el gráfico; ventana «Nueva alerta» abierta y cancelada. Arreglado ahí mismo: sin sesión no se piden las alertas (un 401 antes de entrar podía sacar «Tu sesión ha caducado»: useAlertas({ activo })); las casillas de «Después de saltar» salían en columna (label global de styles/globals.css: flexDirection row); «+ Nueva» deja el precio vacío (antes proponía el de ahora: «−0,0000 %»); distancias siempre con 2 decimales; mientras carga otro valor, el precio de ahora no se toma del gráfico anterior.
- Comprobación alertas.js: 65 (también la pantalla: frases, distancias, líneas, arrastre y montaje renderToString del panel y la ventana).

## 219. Alertas: líneas amarillas discontinuas, elegir la línea y moverla con las flechas (21/11)

Pedido por Sergi al ver la parte 4 (captura con ^GSPC: arrastró la línea a 6.547,03 y la pestaña seguía en 7.007,97).
- FALLO arreglado: arrastrar una línea no guardaba nada. Los oyentes del gráfico (components/CandleChart.js) se montan una vez y usaban la primera onAlarmPriceDrag, con la lista de alertas aún vacía. Ahora leen la de ahora por alarmaCbRef.
- Pulsar una línea la ELIGE (más gruesa): la página abre la pestaña «Alertas» con esa alerta resaltada (prop onAlarmaElegida). Con una elegida, ↑ ↓ la mueven un 0,1 % del precio por pulsación (Mayúsculas: 1 %; como poco 0,01) y se guarda 0,5 s después de la última; Esc la suelta; en un cuadro de texto, las flechas no.
- Colores (pedido por Sergi: el verde y el rojo se confundían con las operaciones): prop estiloAlertas { color, grosor, trazo }: por defecto AMARILLAS (#ffd166), grosor 1 y DISCONTINUAS, con ▲ / ▼ junto al precio (avisa al subir / al bajar). En la pestaña, «Líneas ▾»: 6 colores, grosor 1–3 y trazo discontinuo / continuo / de puntos; uno para todas, recordado en el navegador (alertas.estiloLineas), como los dibujos. Sin la prop, CandleChart pinta como siempre.
- En la lista, ▲ / ▼ / % / ◆ en el color de las líneas en vez del punto verde o rojo.
- La campanita (dicho a Sergi): las que saltan se ven en «Alertas · N sin ver» (rojo) y con la notificación de Windows; la 🔔 con número en la barra de arriba llega en la parte 5.

## 220. Alertas, parte 5: la pestaña con TODAS las alertas, la 🔔 con número y borrar sin preguntar (21/11)

Pedido por Sergi al probar §219 (captura con AUGO y dos alertas), metido en la parte 5 del boceto.
- La pestaña «Alertas» enseña TODAS las alertas de la app: «En <valor> (N)» (las del gráfico, con lo que les falta al precio), «En otros valores (N)» (con el valor delante: pulsarlo abre su gráfico), «Apagadas (N)» plegadas con «Ver ▾», y «Saltaron» de todos los valores (pulsar el aviso abre su gráfico). La cuenta de la pestaña también es de todas.
- DECIDIDO (Sergi, 21/11): la papelera de una alerta la BORRA DIRECTAMENTE, sin preguntar (excepción a la norma de avisar al borrar).
- Sin ▲ / ▼ en la etiqueta de la línea del gráfico (tapaba las velas); se quedan en la lista.
- 🔔 en la barra de arriba (junto a «← Atrás»): número de alertas encendidas, o «N sin ver» en rojo si saltaron y no las has visto; pulsarla abre la pestaña «Alertas» (y un gráfico si la sección no lo tiene, pasando por la guardia de cambios sin guardar). La 🔔 del menú de la izquierda (tabla alarms vieja) sigue igual.
- Decidido por mí: NO hace falta otra pantalla con todas: la pestaña ya lo es (el boceto ponía una pantalla aparte en «Seguir › Alertas»).
- También pedido por Sergi (21/11) y metido aquí: al CREAR una alerta queda elegida (las flechas ↑ ↓ ya la mueven sin tocarla) y se abre «Alertas» (prop alarmaElegidaId de CandleChart, controlada por la página; solo en el gráfico normal); pulsar una alerta de la lista abre el gráfico de su valor con su línea elegida; pulsar en cualquier otro punto del gráfico vuelve a «Resumen» (onAlarmaElegida(null)); con una línea elegida, Supr la BORRA sin preguntar (onAlarmaBorrar). Esc la suelta.
- OJO (21/11): el commit de esta parte se subió con 1 fallo de comunes.sh (tesis.js: «los sitios que cambian de pestaña» pasaban de 21 a 22 por la 🔔, que SÍ pasa por salirDeTesis). Arreglada la comprobación en el commit siguiente (22 y comprueba que la 🔔 pasa por la guardia); tesis.js suelta en verde.

## 221. Alertas, parte 6: «Condición del catálogo» en la ventana (21/11)

- components/FilasAlerta.js: las filas del creador (BuilderFila, como el ocioso con regla §204 y las reglas de «Con pesos» §199), todas con «Y», con «de quién» (el valor de la alerta primero, los índices y «Otro símbolo…» ESCRITO A MANO: el comprobador pide a Yahoo cualquier símbolo), sus números y «velas diarias / semanales»; «+ condición» abre el catálogo (catalogoRegla, sin las «solo del valor»). Se guarda en regla.filas con el símbolo de verdad (la de ALAB copiada con «valor» se sigue leyendo y se puede cambiar).
- VentanaAlerta: «Condición del catálogo» ya se puede elegir (más ancha, 620 px); ✎ también en las de condición; la ventana va con zIndex 990 (por debajo de los «?», 1000, para que se lean encima) y Esc con el catálogo abierto cierra solo el catálogo.
- «Señal de una estrategia» queda para más adelante (hace falta que el comprobador ejecute una estrategia entera).
- alertas.js: 70.

## 222. Alertas: iconos 🎯 / ⚡ y la 🔔 junto a la pestaña (21/11)

Pedido por Sergi al ver la parte 6 (captura con AUGO y las dos 🔔).
- En la lista de la pestaña, los iconos de la 🔔 de siempre, algo más grandes (14 px): 🎯 alerta de precio (toca, cierra, se mueve un %) y ⚡ alerta técnica (condición; y «señal de una estrategia» cuando llegue). Si avisa al subir o al bajar, en el tooltip del icono.
- La 🔔 va en la pestaña «Alertas (N) 🔔» (con «N sin ver» en rojo). En la barra de arriba solo sale cuando alguna saltó y no la has visto (para enterarte desde cualquier sección; decidido por mí, dicho a Sergi).
- También (Sergi, 21/11): el resumen de cada alerta va en UNA línea con «…» (la frase entera, «Así se lee», al pasar el ratón); y la 🔔 (en la pestaña y arriba) se BALANCEA mientras haya alguna que saltó y no has visto (@keyframes campanaAlerta).
- comunes.sh: 1 fallo INTERMITENTE en screener.js (1 de 268, dentro de la batería; repetido suelto, 268/268). Nada de esta parte toca el screener.

## 223. Alertas: retirada la 🔔 vieja del menú; las que saltaron, arriba y parpadeando (21/11)

Con el OK de Sergi (21/11, norma del mapa: lo nuevo ya tiene todo lo del panel viejo).
- Fuera la entrada «🔔 Alertas» del menú de la izquierda. La tabla alarms se queda en la base (sin borrar) y el código del panel viejo sigue en pages/index.js sin forma de llegar a él (retirarlo del todo, más adelante). La campanita del filtro de condiciones de la Watchlist (círculos) NO se toca.
- Las que saltaron y no has visto van ARRIBA de todo en la pestaña («SALTARON · N SIN VER»), parpadeando entre rojo y amarillo como el panel viejo (@keyframes alertaParpadeo), con «✓ Vista» en verde; su alerta, si sigue en la lista, parpadea también. Abajo, «Saltaron antes (ya vistas)».
- Fuera de la pestaña (pedido por Sergi con captura): el valor y el precio de la cabecera y el texto «Ninguna encendida. Pulsa…».

## 224. Replay, parte 1: la tabla de las simulaciones (21/11)

Primer commit del Replay (boceto bocetos/replay-simulacion.html v2, aceptado por Sergi el 21/11: «sí, a todo», con el nombre «Paper trading»). Solo la base: la app todavía no la usa y ninguna cifra cambia. El TradeLog y la operativa real no se tocan (las simulaciones van aparte, a propósito).
- sql/simulaciones.sql (con REVERSIÓN): public.simulaciones (id, tipo replay / paper que no cambia, nombre 1–120 letras, estado jsonb objeto ≤ 1 MB con todo lo de dentro —valores, velas, desde, hoy, capital, comisión, ajustes, órdenes, operaciones, retrocesos—, creada y actualizada del disparador). El formato del estado lo decide la app (lib/replay/, parte 2). RLS «dueño» con permisos por columnas: al crear tipo, nombre y estado; al cambiar, solo nombre y estado. anon, nada.
- Aplicada el 21/11 en Supabase LOCAL (postgres-meta). La nube no se toca.
- scripts/comprobaciones/simulacionesSeguridad.js (no va en comunes.sh): dos usuarios simulados y anon en una transacción que se deshace, más la clave anon por HTTP: 31/31.
- Sin comunes.sh en este commit: no cambia nada que la app ejecute (como §206 y §215).

## 225. Replay, parte 2: el motor (21/11)

lib/replay/motor.js, PURO (no lee la base ni Yahoo): recibe el «estado» de una simulación (sql/simulaciones.sql, §224) y las velas de sus valores y lo RECALCULA todo desde la primera vela hasta la de hoy: liquidez, posiciones, operaciones, órdenes vivas, marcas para el gráfico, curva del capital y avisos. La app todavía no lo usa: ninguna cifra cambia.
- Las acciones de Sergi se guardan con la fecha de la vela que veía (orden, cerrar, cancelar, mover). Como todo se recalcula, RETROCEDER (irA) solo quita las acciones de las velas que vuelven a ocultarse (las de la vela a la que vuelves se quedan: se decidieron viéndola) y suma un retroceso.
- En cada vela: 1) lo pendiente (a mercado y «cerrar» a la apertura; LÍMITE largo por debajo / STOP largo por encima, a la entrada o a la apertura si abrió más allá; viven hasta cumplirse o cancelarse); 2) stop y objetivo (hueco → apertura; los dos en la misma vela → el stop; entrando a mitad de vela se mira el stop sin hueco y el objetivo no); 3) las acciones de esa vela, para la vela siguiente de su valor (con ejecución «al cierre», a mercado y «cerrar» al cierre de esa misma vela); 4) terminada → todo se cierra al cierre de hoy; 5) el dinero al cierre.
- Tamaño con el dinero total del momento de ejecutarse: «invertir X %» (÷ precio) o «arriesgar X %» (÷ distancia al stop; sin stop, aviso), redondeado hacia abajo. Decidido por mí: sin apalancamiento (un largo no cuesta más que la liquidez; un corto no vale más que el dinero total); orden del lado contrario = cierra lo abierto (no da la vuelta); del mismo lado = compra más con precio medio; stop u objetivo al otro lado de la entrada no se pone (aviso). Comisión fija por orden; cortos sin coste de préstamo; sin impuestos. Un valor que no cotiza un día: sus órdenes esperan y se valora con su último cierre.
- cifras: final, ganancia, ganadoras, factor de beneficio, peor caída (%, €, fecha), caída más larga (velas), medias ganadora y perdedora, comisiones, órdenes y Buy&Hold del primer valor (compra al cierre de la primera vela que ves y vende hoy, pagando las dos comisiones). También calendario, siguiente, claseDe y etiqueta («#3 +4,2 %»).
- Comprobación scripts/comprobaciones/replay.js (42, en comunes.sh), con velas inventadas y todas las cuentas a mano.

## 226. Replay, parte 3: el modo Replay en el gráfico grande (21/11)

Botón «⏪ Replay» junto a «📈 Indicadores» en las dos barras del gráfico grande de un valor (normal y pantalla completa). Abre la ventana «Replay de <valor>» (components/Replay.js, VentanaReplay): el día en que empiezas (calendario y atajos «Hace 1 año / 2 / 5 años / Al azar»; nunca la primera ni la última vela) y cuántas velas quedan por descubrir. Todavía no se opera (parte 4).
- pages/index.js: estado `replay` = el de lib/replay/motor.js ({ valores, desde, hoy, acciones, retrocesos }); el gráfico recibe solo las velas hasta hoy (recortaVelas), así que las medias, el RSI y los demás indicadores se calculan sin ver el futuro; `propsReplay` oculta lo que diría el futuro o es de hoy: operaciones y marcas de la estrategia (trades, visuals, customMarkers, razonamiento, filterZones, slopeChanges), órdenes y posiciones reales, alertas, dibujos y las líneas de Risk. Listas vacías SIEMPRE la misma (VACIO_REPLAY): una nueva en cada pintado rehacía el gráfico entero. Cambiar de valor sale del Replay.
- Barra de abajo (BarraReplay): ◀ ▶/⏸ ▶| ▶▶ (cinco), velocidad 1/2/5/10 velas por segundo, «Hoy: vie 06/01/2023 · vela 3 de 8», retrocesos y «✕ Salir». Teclas → (Mayús: cinco), ← y espacio (en captura: no abren el buscador de símbolos; escribiendo en una casilla no cuentan). A pantalla completa, solo la barra de la pantalla completa escucha las teclas. Al avanzar, la ventana visible se mueve los mismos días (desplazaRango sobre savedRangeRef): misma anchura, pegada a la última vela.
- lib/replay/grafico.js (puro): recortaVelas, velaDeInicio, inicioHace, inicioAlAzar, vecina, desplazaRango, posicion. Retroceder usa irA del motor (suma un retroceso).
- Límites dichos a Sergi: las velas son las que ya carga el gráfico (con una estrategia de periodo corto, el Replay empieza dentro de ese periodo); el panel «Resumen» del backtest sigue a la derecha con las cifras del periodo entero (lo sustituye el panel de operar, parte 4).
- Comprobación scripts/comprobaciones/replay-grafico.js (27, en comunes.sh). COMPROBADO POR MÍ EN LA APP (^GSPC, sesión de Sergi): empezar «hace 1 año» (jue 20/11/2025, vela 1 de 252), → ×3, Mayús+→, ← → vela 8 y 1 retroceso, espacio reproduce y para sin abrir el buscador, «✕ Salir» vuelve al gráfico de siempre; consola sin errores.

## 227. Replay: la barra con el aspecto del boceto, ▶▶ con casilla, «Ver» y fuera el resumen del backtest (21/11)

Pedido por Sergi al ver §226 (con captura del boceto): le gustaban más los controles del boceto y ▶▶ avanzaba siempre 5 (no había casilla para elegirlo; ▶| sí iba de una en una, comprobado en la app). Tachó también el «Resumen» del panel derecho.
- BarraReplay con los colores y la letra del boceto (fondo #2c303b, botones #353945, borde #4c5263, letra del sistema 13 px, recuadro redondeado): ◀ · ▶/⏸ · velocidad (1 vela/s, 2/s, 5/s, 10/s) · ▶| · «▶▶ N» con su casilla (2–200, 5 de entrada; Mayús + → y Mayús + ← usan la misma N) · 📈 Indicadores (la ventana de siempre) · «Ver» 60 / 120 / 250 / 500 / Libre · «?» · «Hoy en el replay: …» en ámbar, vela N de M, retrocesos, ✕ Salir.
- «Ver N» (120 de entrada): la ventana enseña las N últimas velas hasta hoy y, al avanzar, sigue a la última (rangoVer en lib/replay/grafico.js; al cambiarlo, setRange del gráfico). «Libre»: la anchura que dejes con la rueda (desplazaRango, como en §226).
- Mientras dura el Replay se ocultan el resumen del backtest (panel derecho), las métricas en cuadrícula y la sección Equity + barras + historial de debajo del gráfico, y las alertas (dirían el futuro o son de hoy). El panel derecho dice «REPLAY · <valor>» y que allí irá el panel para operar.
- Señal ⏮ / ⏭, el selector de señal y «a ciegas» del boceto llegan en sus partes (5 y después).
- replay-grafico.js: 29 (casilla de ▶▶ con 3 y su mínimo de 2, Mayús + ←, rangoVer). COMPROBADO POR MÍ EN LA APP (^GSPC): barra como el boceto, casilla 3 → ▶▶ 3 → vela 4, «Ver 60» enseña 60 velas; panel derecho «REPLAY»; consola sin errores.

## 228. Replay, parte 4a: operar con el panel (21/11)

Primera mitad del commit 4 del Replay (la segunda, 4b: 🎯 / doble clic con líneas de entrada, stop y objetivo arrastrables, «SIN ENVIAR» y la ventana al avanzar). Todo sale del motor (lib/replay/motor.js, §225), que se recalcula en cada cambio.
- Ventana de empezar: «Dinero inicial» (10.000), «Comisión por orden» (0,185 €, cada compra y cada venta) y «A mercado: a la apertura de la vela siguiente / al cierre de la vela que ves»; se recuerdan en el navegador (replay.ajustes).
- Panel derecho (components/PanelReplay.js, PanelOperar), en lugar del «Resumen»: cifras (tu dinero, ganancia € y %, liquidez, Buy&Hold del valor, peor caída, operaciones y % que ganan), posición abierta (#n, lado, acciones, precio medio, stop, objetivo, ganancia de ahora, «Cerrar a mercado»), «Nueva orden» (Comprar / Vender en corto · A mercado / En un precio con «Orden límite: compra si baja hasta X (ahora Y)» u «Orden stop: … si sube …» · Stop · Objetivo · Invertir / Arriesgar X % del dinero · «Enviar orden», con «?» y ejemplo numérico), órdenes vivas con ✕ (cancela sin preguntar), avisos del motor y «Terminar» / «Reabrir» (cierra todo al cierre de hoy; terminada no se avanza).
- lib/replay/orden.js: compruebaOrden (stop y objetivo contra la ENTRADA; en un precio, límite o stop según el precio de ahora; arriesgar sin stop, no), nuevaAccion (fecha de hoy, id siguiente), textoOrden, explicaPrecio, marcasDe (▲ «#n» en la entrada y «#n ±x %» verde o rojo en la salida, en el gráfico).
- Debajo del gráfico (ResultadosReplay): pestañas «Operaciones · N» (tabla como el boceto + la abierta; «Con comisiones (0,185 € por orden), sin impuestos. N órdenes, X € de comisiones») y «Curva del capital» (tu dinero y Buy&Hold, peor caída %, € y fecha, caída más larga en velas, factor de beneficio).
- Aviso del motor más claro: «no llega el dinero para una acción de ^GSPC a 6.555,77 (sube el %)» (visto en la app: el 20 % de 10.000 € no llega para una acción del S&P 500). Cifras con separador de miles también en las de 4 cifras (5.050 €; es-ES no lo pone solo).
- Comprobación scripts/comprobaciones/replay-operar.js (en comunes.sh). COMPROBADO POR MÍ EN LA APP (^GSPC, desde el 20/11/2025, 10.000 €, 0,185 €): compra a mercado invirtiendo 100 % con stop 6.400 y objetivo 6.900 → 1 acción el 21/11 a 6.555,77, vendida el 10/12 en el objetivo a 6.900: +343,86 € (= 344,23 − 0,37 de comisiones); curva con peor caída −0,4 % (−36 €) el 01/12/2025; marca «#1» en el gráfico.

## 229. Replay, parte 4b: marcar la orden en el gráfico (21/11)
Lo que en el boceto (bocetos/replay-simulacion.html v2) se hace con 🎯 o doble clic, ahora en la app. Nada fuera del Replay cambia: las props nuevas del gráfico son opcionales.
- 🎯 junto a «⏪ Replay» (en las dos barras del gráfico) y «🎯 Marcar en el gráfico» en el panel: tres clics seguidos rellenan Entrada, Stop y Objetivo (el modo de captura del Risk management, riskMode + onRiskPrice, con su texto propio «▶ Clic para marcar el STOP · Esc cancela»). Doble clic en el gráfico: la Entrada en ese precio y sigue con el Stop. Esc o pulsar otra vez 🎯 cancela y borra el borrador. Precios redondeados a 2 decimales (4 si valen menos de 1).
- El lado sale del stop (o del objetivo): por debajo de la entrada = compra, por encima = corto. Límite o stop según el precio de ahora, como al escribirla (claseDe).
- El formulario del panel vive en pages/index.js (formReplay) para que el gráfico lo rellene; PanelOperar acepta form/onForm (sin ellos, guarda el suyo, como antes). Con algún precio puesto es un BORRADOR: «SIN ENVIAR» en el panel y en la primera línea del gráfico, % del stop y del objetivo junto a sus casillas, «≈ N acciones (€) · arriesgas X € · R:R 1 : Y» (con el dinero de ahora) y «Descartar».
- Líneas del gráfico (prop nueva lineasReplay/onLineaReplay de CandleChart, price lines actualizadas en su sitio por id): borrador (sólidas, gruesas), órdenes vivas (discontinuas: entrada, stop, objetivo) y posición abierta (precio medio fijo; stop y objetivo). Se arrastran: las del borrador cambian el formulario; las de una orden viva o de la posición, al soltar, añaden la acción «mover» del motor (dos «mover» del mismo día y la misma cosa se juntan en uno). No se mueven al otro lado (aviso y la línea vuelve): stop de la posición por encima del precio de ahora en una compra, entrada de una orden viva más allá de su stop u objetivo, etc. Mover la entrada de una orden viva recalcula si es límite o stop.
- Al avanzar (→, ▶|, ▶▶, ▶) con un borrador: ventana «Tienes una orden marcada sin enviar» con «Enviarla y avanzar» (si le falta algo lo dice y no avanza) / «Avanzar sin enviarla» (se borra) / «Cancelar». ▶ deja de reproducir. Retroceder no pregunta.
- Puro en lib/replay/borrador.js (conClic, dobleClic, empiezaMarca, ladoDe, estima, lineasDe, accionMover, anade). Comprobación scripts/comprobaciones/replay-marcar.js (en comunes.sh), a mano: stop de la posición movido de 98 a 102 → vende el 04/01 a 102 y gana (102 − 101) × 49 − 2 = 47 € (sin moverlo, −149 €); orden límite subida de 90 a 97 → compra el 05/01 a 97 con 2.000 ÷ 97 = 20 acciones; arriesgar 1 % con entrada 100 y stop 97 → 33 acciones, 99 €.
- Sin la franja verde/roja entre entrada, stop y objetivo del boceto (solo las líneas con su %): proponerla si Sergi la echa de menos.
- COMPROBADO POR MÍ EN LA APP (^GSPC desde el 20/11/2025): 🎯 y tres clics (Entrada 6.600,14 · Stop 6.405,84 −2,9 % · Objetivo 6.903,74 +4,6 %); doble clic; arrastrar el stop del borrador a 6.464,54 (−2,1 %, R:R 1 : 2,2); al avanzar, la ventana «Tienes una orden marcada sin enviar»; enviada al 100 %: orden stop cumplida el 21/11 a 6.600,14; stop de la posición arrastrado a 6.513,12; objetivo arrastrado por debajo del precio → vuelve a su sitio con el aviso; consola sin errores. Visto ahí y arreglado: el arrastre se enganchaba solo al montar el gráfico (cuando aún no había contenedor); ahora se vuelve a enganchar con cada cambio de velas, como el de las líneas de riesgo.

## 230. Replay: barra de dibujar, casillas de las órdenes enviadas y hueco a la derecha (21/11)
Pedido por Sergi al probar §229 (captura con SMCI).
- La barra de dibujar sale también en el Replay, a la izquierda como siempre (sin la 🎯 de alertas). Los dibujos son los mismos guardados del valor: uno hecho en otra fecha puede verse en el Replay (decirlo a Sergi).
- Lo que confundía: al arrastrar las líneas de una orden YA ENVIADA cambiaba la orden, pero no había casillas donde verlo (las de «Nueva orden» son para otra orden). Ahora cada orden viva tiene sus casillas Entrada / Stop / Objetivo y la posición abierta las de Stop / Objetivo, con su %: van con la línea mientras se arrastra (estado arrastreReplay en pages/index.js) y se pueden escribir (Enter o salir de la casilla; vacía = quitar el stop o el objetivo; Esc deja el que había). Así también se añade un stop u objetivo a una orden o posición que no lo tenía. Las dos vías pasan por moverReplay → accionMover (lib/replay/borrador.js, que ahora acepta null = quitar y avisa si no es un número).
- Hueco vacío a la derecha de la última vela (prop nueva margenDerecha de CandleChart, en el Replay 0,22 del ancho visible, con setVisibleLogicalRange tras fijar la ventana y en setRange): las etiquetas de las líneas y la del precio quedan sobre el hueco y no tapan las últimas velas. Decidido por mí en lugar de mover las etiquetas a la izquierda (lightweight-charts las pinta siempre pegadas al eje). Etiquetas más cortas en las órdenes vivas: «Stop −3,2 % ⇕» / «Objetivo +3,8 % ⇕» (antes «Stop (compra stop) ⇕»).
- Comprobación replay-marcar.js ampliada (casillas de la orden viva, escribir 104,5 y Enter, casilla que va con la línea, quitar con casilla vacía). COMPROBADO POR MÍ EN LA APP (^GSPC): barra de dibujar a la izquierda, hueco a la derecha con las etiquetas encima, orden enviada con sus casillas, entrada arrastrada a 6.647,44 (casilla y % al día), stop escrito 6.500 + Enter → línea y texto de la orden cambian; consola sin errores.

## 231. Replay, parte 5: saltar a la señal (21/11)
Como en el boceto (bocetos/replay-simulacion.html v2: «⏮ Señal», «Señal ⏭» y el selector «Señal:»).
- En la barra del Replay: «⏮ Señal» (vuelve a la anterior, cuenta como retroceso), «Señal ⏭» (avanza hasta la próxima vela con señal y se para: esa vela es la última que ves; con una orden marcada sin enviar, pregunta como al avanzar) y el selector «Señal: elige… / Una condición del catálogo… / Estrategia «…»» (solo las de tarjetas), con «N señales en total», «?» con ejemplo y avisos («No hay más señales desde aquí…», «Desde que empezó el Replay no se dio esa señal»). Las velas con señal que ya se ven llevan un ▲ morado (#bc8cff). La señal elegida se queda para el siguiente Replay.
- Condición del catálogo: ventana con las filas de las alertas (components/FilasAlerta.js, ahora con prop para='señal' en el título del catálogo; todas con «Y», de quién, números, diarias/semanales). La señal es la vela en que PASA a cumplirse (la anterior no): una condición «de estado» da una señal por tramo. Con «Otro símbolo…» o índices, sus velas se piden a /api/velas (sin la vela en curso).
- Estrategia de tarjetas: el mismo criterio que «Da señal de compra con…» del screener (lib/screener/senales.js): con orden al cierre o a la apertura, la vela con señal de compra y filtro de mercado sin la operación abierta; con orden en un nivel, la vela en que compró. Sus índices del filtro, por /api/velas.
- Sin mirar el futuro: se calcula una vez con todas las velas del valor, pero cada fecha solo depende de lo sabido a su cierre (indicadores hacia atrás; una fila semanal vale la semana cerrada); la prueba lo comprueba cortando las velas.
- Puro en lib/replay/senales.js (senalesCondicion, senalesEstrategia, siguienteSenal, anteriorSenal, marcasSenal, simbolosSenal). En pages/index.js: irAFechaReplay (avanzar y la ventana «sin enviar» van ahora a una FECHA), saltaSenalReplay, barraSenalReplay; el gráfico pone sus marcas solo al rehacerse, así que una copia nueva de las velas al cambiar las señales (velasGraficoReplay) hace que los ▲ salgan sin avanzar.
- Comprobación scripts/comprobaciones/replay-senales.js (en comunes.sh), a mano: «nuevo máximo de 2 velas» con velas planas y subidas en las velas 10, 12 y 30 → estrategia 10 y 30 (la 12 con la operación abierta no cuenta); como condición, 10, 12 y 30; «cierre sobre la SMA 3» (de estado) → 10 (105 > 101,67), 12 (110 > 105) y 30.
- COMPROBADO POR MÍ EN LA APP (^GSPC desde el 20/11/2025): «Estrategia «Prueba editor EMA20»» → 150 señales, ▲ morados al elegirla, «Señal ⏭» salta al 25/11/2025 (vela 4); condición «RSI (14) cruza hacia arriba 30» → 22 señales, salta al 23/03/2026 tras la caída, con su ▲.

## 232. Replay, parte 6: se guarda solo, «Mis replays» y Seguir › Simulaciones (21/11)
- Decidido por mí (como los dibujos, §209): cada Replay se GUARDA SOLO en la tabla public.simulaciones (sql/simulaciones.sql, §224) 1,2 s después de cada cambio y también al salir o al cambiar de valor, en cuanto tiene algo (has avanzado alguna vela u operado; uno recién empezado no se guarda). Primero se crea la fila (POST con return=representation) y luego se actualiza (PATCH). sesionReplayRef evita que un guardado que llega tarde se cuele en otro Replay. No hay «cambios sin guardar» que preguntar.
- Panel del Replay: nombre (por defecto «^GSPC · desde 20/11/2025»; ✎ para cambiarlo, Enter guarda, Esc deja el que había), estado «se guarda solo en cuanto avances u operes» / «guardando…» / «✓ guardado» / «⚠ No se pudo guardar…», y «📂 Mis replays».
- «Mis replays» (components/MisReplays.js): también desde el menú, Seguir › Simulaciones (⏪; abre la ventana sin cambiar de pantalla). Cada fila: nombre, valor, «desde … · vas por el … · N operaciones», % ganado o perdido (resumen que se calcula al guardar), fecha del último guardado, «Abrir» y papelera roja que pregunta en la fila («¿Borrarlo? Sí / No»; el que está abierto no se puede borrar). Buscador con ✕ sin mayúsculas ni acentos. «?» con ejemplo.
- Abrir: si es otro valor, cambia a él (pantalla Watchlist) y, cuando llega su gráfico (displayedSimbolo), abre el Replay en la vela en que ibas, con sus órdenes, operaciones y retrocesos.
- lib/replay/guardados.js (nombreDe, hayQueGuardar, paraGuardar con resumen { final, pct, operaciones }, deGuardado, leer/crear/guardar/borrarSimulacion, filtraSimulaciones). Comprobación scripts/comprobaciones/replay-guardar.js (en comunes.sh; fetch de mentira; a mano: compra 50 % stop 98 → 9.851 €, −1,49 %, 1 operación).
- ARREGLO de paso (components/CandleChart.js): si el gráfico se rehacía antes de que llegara la librería (justo al abrir la página), la creación vieja terminaba tarde y sus etiquetas de la estrategia se colaban en el gráfico nuevo (visto al empezar un Replay nada más cargar: etiquetas y flechas de operaciones FUTURAS). Ahora una creación anulada no hace nada (efectoVivo).
- COMPROBADO POR MÍ EN LA APP (^GSPC): empezar, avanzar → «✓ guardado»; ✎ → «Prueba de Claude (borrar)»; salir; Seguir › Simulaciones → los dos replays de prueba con «desde 20/11/2025 · vas por el 24/11/2025»; «Abrir» → vuelve al 24/11/2025 (vela 3) con su nombre; borrados los dos (la tabla queda con 0 filas).
- «Abrir» de «Mis replays» cambia de pantalla siempre por la guardia de Tesis (salirDeTesis): si hay una tesis con cambios sin guardar, pregunta antes. tesis.js cuenta ahora 24 sitios que cambian de pestaña (los dos nuevos, revisados).

## 233. Replay: lo marcado ES la orden, quitar operaciones, valor al azar y hueco de 10 velas (21/11)
Pedido por Sergi al probarlo (captura con DAN): al pulsar «Enviar orden» las líneas pasaban a puntos (la orden ya estaba puesta) y, al volver a pulsarlo, salía «Falta el precio de entrada»; quiere que lo marcado en el gráfico cuente como la orden.
- FUERA «Enviar orden» para las órdenes en un precio y la ventana «Tienes una orden marcada sin enviar» (VentanaSinEnviar, §229). 🎯 o doble clic: Entrada → Stop → Objetivo y la orden SE PONE SOLA al marcar el Objetivo (lib/replay/borrador.js conClic da listo y ordenDeMarca la comprueba con compruebaOrden). Enter: ponerla con lo marcado (sin objetivo; tras la entrada, sin stop ni objetivo). Esc: cancelar. Avanzar o «Señal ⏭» mientras se marca: se pone con lo marcado si ya hay entrada; retroceder cancela. Objetivo marcado al otro lado de la entrada: se pone sin él y lo avisa. Mientras se marca, la primera línea dice «MARCANDO» y el panel enseña lo marcado y qué hace Enter.
- Panel «Nueva orden»: Comprar / Vender en corto, Invertir o Arriesgar %, «🎯 Marcar en el gráfico» (la orden en un precio) y, aparte, «A mercado» con Stop y Objetivo opcionales y el botón «Comprar a mercado» / «Vender en corto a mercado». Sin casilla de entrada ni «En un precio». «?» al día.
- QUITAR OPERACIONES del historial (pestaña «Operaciones»): papelera roja en cada una, también en la abierta, que pregunta en la fila («¿Quitarla? Sí / No»). quitaOperacion (borrador.js) borra las órdenes que la abrieron o ampliaron (el motor apunta ids en cada operación y en la posición) y sus «mover» y «cerrar»; el motor lo recalcula todo, así que desaparece del gráfico y de la curva del capital. Cuenta en «borradas» (la barra dice «· N operaciones quitadas», como los retrocesos).
- «🎲 Valor al azar» en la ventana de empezar: cambia a un valor al azar de la Watchlist; la ventana sigue abierta (se rehace con su clave), dice «Cargando las velas de X…» y propone la fecha de hace un año cuando llegan.
- Hueco a la derecha: 10 velas (margenDerecha ≥ 1 = número de velas; antes una fracción del ancho, 0,22).
- Pruebas a mano: replay-marcar.js (lo marcado es la orden: compra stop a 100, stop 97, objetivo 106; objetivo al otro lado → sin objetivo; quitar la operación 1 → la orden 2 compra 20 a 96 = 2.000 € ÷ 96; papelera con pregunta) y replay-operar.js (corto a mercado con stop 110). COMPROBADO POR MÍ EN LA APP: «🎲 Valor al azar» → SOFI con su fecha; 🎯 y tres clics → «Compra stop a 26,05 · stop 24,00 · objetivo 30,07» directamente en «Órdenes vivas»; ▶▶ → #1 +15,4 % (10.305 €); quitarla → 10.000 €, 0 operaciones, «1 operación quitada»; hueco de ~10 velas. Borrado mi replay de SOFI; el de Sergi (DAN · desde 17/08/2018) se queda.

## 234. Replay: barra |◀ ▶|, nombre de la condición, «🎯 Compra / 🎯 Venta» con «Stop a X %» y R:R, flechas, indicadores de la señal, paneles alineados y la línea de cada operación (22/11)
Pedido por Sergi el 22/11 (captura de AMAT en semanales; «sí, a todo» a mis recomendaciones). Ninguna cifra de la app cambia: solo el Replay.
- BARRA (components/Replay.js BarraReplay): «|◀» y «▶|» juntos (una vela atrás / adelante), luego «▶▶ N» con su casilla y, aparte, «▶ / ⏸» reproducir con su velocidad. El selector de señal dice QUÉ condición es («Condición: …», la frase de fraseFilasRegla de lib/builder/reglasPesos.js, la misma de las alertas) en vez de «Tu condición del catálogo»; el tooltip del selector la da entera.
- PANEL «Nueva orden» (components/PanelReplay.js) sin textos fijos (todo en el «?» y en tooltips): botón VERDE «🎯 Compra» y ROJO «🎯 Venta» (el lado lo da el botón: ladoFijo; un stop al otro lado ya no lo convierte en corto: la orden no se pone y lo dice), «Invertir / Arriesgar X % del dinero», «Stop a X %» y «R:R 1 : N» (opcionales; vacíos = se marcan a mano). Con «Stop a X %» el stop sale solo al marcar la entrada; con R:R, el objetivo sale solo a N veces la distancia al stop; con los dos, UN clic pone la orden entera. Ej. 10 % y 1 : 2: compra en 100 → stop 90, objetivo 120; corto en 100 → stop 110, objetivo 80; solo 1 : 2 con entrada 100 y stop 95 → objetivo 110. Arrastrar la entrada o el stop del borrador rehace lo que sale solo. A mercado: botones «Compra a mercado» (verde) y «Venta a mercado» (rojo); stop y objetivo vacíos salen de «Stop a X %» y R:R (se ven en gris en la casilla, «90 (solo)»). Doble clic y el 🎯 de arriba siguen: con «Stop a X %», el lado del último botón; sin él, el lado sale del stop (como antes). El tamaño, «Stop a X %» y el R:R se recuerdan en el navegador (replay.orden).
- lib/replay/borrador.js: FORM_INICIAL con stopPct y rr; stopAuto, objetivoAuto, conAuto, mueveBorrador, deMercado; empiezaMarca(f, lado) y dobleClic(f, precio, ahora) (conClic de la entrada). Sin stopPct ni rr, todo como antes.
- FLECHAS: un clic en una línea del Replay (borrador, orden viva o posición) la ELIGE (más gruesa, «▸ … · ↑↓»); ↑ ↓ la mueven un 0,1 % (Mayús 1 %), como las alertas; Esc o un clic en el gráfico fuera de las líneas dejan de elegirla (CandleChart avisa con onLineaReplay(null)). Un clic sin mover ya no crea un «mover» con el mismo precio.
- INDICADORES DE LA SEÑAL (lib/replay/senales.js graficoSenal → prop grafico de CandleChart, solo series sobre el precio, sin eventos ni órdenes): con una condición, las medias EMA/SMA de las filas del propio valor (p. ej. las dos EMA del cruce; mediasDe se exporta de lib/editor/interprete.js); con una estrategia de tarjetas, sus series sobre el precio (medias, máximo de la ruptura, swings, SuperTrend). Calculados solo con las velas que ya se ven. RSI y otros osciladores de la condición: no (se pueden poner con «📈 Indicadores»).
- PANELES ALINEADOS: con hueco a la derecha (margenDerecha, solo el Replay) los paneles de abajo (RSI, MACD, volumen, los de «📈 Indicadores») se sincronizan por POSICIÓN (rango lógico) con una serie vacía que tiene una posición por vela; antes se sincronizaban por fechas y, sin fechas en el hueco, quedaban desplazados. Sin margenDerecha, como siempre.
- LÍNEA Y ETIQUETA DE CADA OPERACIÓN (pedido por Sergi el 22/11: «como en la Watchlist»): tradesDe (lib/replay/orden.js) pasa las operaciones CERRADAS del valor como trades de CandleChart: la línea verde o roja de la entrada a la salida (lineaOperacion), la línea discontinua de la entrada y la caja «#n ±x %» (con el número de la operación del Replay: t.num; sin num, como siempre idx + 1). Con «% + € + días» de la barra, en el Replay sale «Solo %». El punto de la salida ya no lleva texto. El 👁 (ocultar lo de la estrategia) no oculta tus operaciones del Replay.
- Pruebas a mano: replay-marcar.js (10 % y 1 : 2, compra y corto; solo R:R; solo stop %; el lado del botón; arrastrar entrada y stop; a mercado con stop a mano; doble clic), replay-operar.js (botones de mercado; operación para el gráfico #1 de 101 a 98), replay-grafico.js (orden de la barra), replay-senales.js (SMA 3 de la condición = 101,67 en la vela 10; cruce → EMA 10 y EMA 20; estrategia → su EMA 5 solo con las velas que se ven).
## 235. Replay: el zoom se respeta al avanzar (22/11)
Visto por Sergi el 22/11 (captura de AMAT con «Ver Libre»): al acercar el gráfico con la rueda, cada ▶ o ▶| volvía a alejarlo, y «Ver N» no se aplicaba. Causas: 1) el gráfico se rehace en cada vela y el zoom se guardaba en FECHAS; 2) los paneles de abajo (volumen, RSI…) nacen con su zoom por defecto y se lo devolvían al gráfico principal justo después de ponerse; 3) el gráfico del Replay estaba enlazado con los demás gráficos de la página (chartSyncRef), que también le devolvían el suyo.
- El zoom del Replay se recuerda en VELAS (anchoReplayRef en pages/index.js, prop anchoReplayRef de CandleChart): al rehacerse, se ven las mismas N velas pegadas a la última, más el hueco de 10. Cada zoom o desplazamiento tuyo cambia N (subscribeVisibleLogicalRangeChange, tras el arranque) y «Ver» pasa a «Libre» (onAnchoReplay); «Ver N» pone N al momento (api verVelas).
- Paneles: al crearse solo RECIBEN el zoom del gráfico; pasados 400 ms, moverlos mueve también el gráfico (solo con margenDerecha).
- El Replay ya no se enlaza con otros gráficos (syncRef null en propsReplay).
- COMPROBADO POR MÍ EN LA APP (^GSPC): Ver 120 → 120 velas + 10 de hueco; tras ▶| sigue igual; zoom a 40 velas → «Libre» y 40 tras 3 velas; «Ver 60» al momento y tras avanzar. De paso, V9.1300: Stop a 10 % y R:R 1 : 2, «🎯 Compra» y un clic → «Compra stop a 6.828,26 · stop 6.145,43 · objetivo 8.193,92». Borrados mis 3 replays de prueba (quedan los de Sergi: DAN, DDOG, AMAT).
## 236. Replay: las órdenes y operaciones como cajas de «Posición larga / corta» (22/11)
Pedido por Sergi el 22/11 (con captura de AMAT): líneas continuas en vez de puntos, zona roja y verde como la «Posición larga» de los dibujos, y que no ocupen todo el ancho sino que vayan de la entrada a la salida y se queden en el tiempo.
- lib/replay/borrador.js cajasDe: una caja por operación cerrada (de su vela de entrada a la de salida; tenue y sin textos, junto a la línea verde/roja y la caja «#n ±x %»), por la posición abierta (de su entrada hasta el hueco de la derecha), por cada orden sin ejecutar (desde la vela en que se puso, texto «… · sin ejecutar») y por la orden que se marca (desde hoy, «MARCANDO» / «SIN ENVIAR»). El motor guarda en cada operación cerrada su stop y su objetivo al salir.
- components/CandleChart.js (prop opcional cajasReplay; sin ella, nada): capa SVG que dibuja zona roja (entrada–stop), verde (entrada–objetivo), líneas continuas y el texto dentro a la derecha. Se redibuja solo si cambia algo, en cada fotograma y cada 250 ms (con la pestaña en segundo plano no hay fotogramas). La posición de cada fecha va por número de vela y el final del hueco con el ancho de una vela (el gráfico no da coordenadas para el hueco vacío). Mientras se arrastra una línea, la caja la sigue (lee el precio de la línea del gráfico).
- Las líneas del Replay (lineasDe) siguen para arrastrar y para el precio en el eje, pero sin línea ni título (soloEje: lineVisible false); la elegida se ve más gruesa y con «▸ … · ↑↓» en la caja.
- Pruebas a mano en replay-marcar.js (cajas: cerrada solo del valor, posición, orden viva con «sin ejecutar» y −5 %/+10 %, la que se marca; el motor guarda stop y objetivo). COMPROBADO POR MÍ EN LA APP (^GSPC): #1 largo por objetivo +1,7 % y #2 corto por stop −2,1 % con su caja tenue; posición #3 con zona verde y roja hasta el hueco y «Stop −4,5 %», «Objetivo +10,6 %». Borrados mis 5 replays de prueba (quedan los de Sergi, COGT incluido).
## 237. Los «?» de ayuda se abren solo con clic; sin flechas en las cajas del Replay (22/11)
Pedido por Sergi el 22/11 (captura de AAPL).
- components/BuilderAyuda.js: soloClic pasa a ser true por defecto: TODOS los «?» de la app se abren con un clic (y se cierran tocando fuera o con Esc), no al pasar el ratón. Ninguna pantalla pasaba soloClic={false}.
- Cajas del Replay (§236): fuera «⇕» y «· ↑↓» de los textos; la línea elegida sigue con «▸» y más gruesa.
- Respondido a Sergi (sin cambio): su orden 7 de AAPL era una compra STOP a 139,10 (18/01/2023); el 20/01 bajó la entrada a 136,48, por debajo del precio (cierre 137,87), y pasó a ser LÍMITE («Compra límite · sin ejecutar»): compra solo si el precio BAJA hasta 136,48. Desde el 23/01 el mínimo no bajó de 137,90 → no entró, como en un bróker. La caja se dibuja con los niveles de AHORA desde la vela en que se puso la orden.
## 238. Replay: la caja de una orden sin ejecutar empieza en su último cambio (22/11)
Pedido por Sergi el 22/11 (tras ver que la caja de su orden 7 de AAPL, bajada el 20/01, se dibujaba desde el 18/01 con los niveles nuevos y parecía que el precio la había tocado).
- lib/replay/motor.js: un «mover» de una orden viva apunta su fecha en la orden (cambiada). lib/replay/borrador.js cajasDe: la caja de la orden viva empieza en cambiada (si no hay, en el día en que se puso). La de la posición abierta sigue empezando en su entrada.
- Prueba a mano en replay-marcar.js: límite a 90 puesta el 02/01 y bajada a 89 el 04/01 → caja desde el 04/01 con entrada 89; sin cambios, desde el 02/01.
## 239. Replay: seguir con uno guardado, barra más corta y sin destellos al reproducir (22/11)
Pedido por Sergi el 22/11 (capturas de INTC).
- Al pulsar «⏪ Replay», la ventana de empezar enseña arriba «Seguir con uno guardado» (los de este valor; «Ver todos (N)» para los demás) con «Seguir», y debajo «Empezar uno nuevo» como siempre (components/Replay.js SeguirGuardado; pages/index.js abreVentanaReplay lee tus replays y abre el elegido con abreReplayGuardado).
- Barra: «▶» primero, con las velas por segundo DENTRO del mismo botón (desplegable tras una rayita); luego «|◀» y «▶|»; «▶▶» con su número dentro (se escribe ahí, sin las flechitas del navegador).
- Destellos al reproducir: en cada vela el gráfico se rehace y quedaba un instante en blanco. Con margenDerecha (solo el Replay), antes de borrarlo se pone encima una FOTO suya (takeScreenshot, canvas absoluto) que se quita en cuanto el nuevo está colocado (applyInitialRange + 40 ms; como mucho 1,5 s).
- Respondido a Sergi (sin cambio): dos filas «Cierre > EMA 20» y «Cierre < EMA 20» unidas con «y además» no se cumplen nunca a la vez → 0 señales; para el cruce hacia arriba basta una fila (la señal es la vela en que pasa a cumplirse).
- COMPROBADO POR MÍ EN LA APP (^GSPC): la ventana lista los 10 replays guardados de Sergi con «Ver todos»; ▶ a 2/s durante 3 s avanza 7 velas y la foto sale y se va (no queda ninguna); barra «▶ 2/s · |◀ · ▶| · ▶▶ 5». Borrado mi replay de prueba.
## 240. Replay: señal con «y además» / «o bien» (24/11)
Pedido por Sergi el 23/11 (ejemplo: pararse en cada cruce de la EMA 20, hacia arriba y hacia abajo).
- En la ventana «Señal: una condición del catálogo», entre fila y fila un selector «y además / o bien» (components/FilasAlerta.js, prop nueva conO; solo la señal del Replay: las alertas siguen todas con «Y», su motor no se toca). «?» con el ejemplo. «y además» une antes que «o bien»: (A y B) o C, como las reglas del bloque «Con pesos».
- Motor (lib/replay/senales.js gruposFilas + senalesCondicion): las filas se parten en grupos por «o bien» y la señal es la vela en que CUALQUIER grupo pasa a cumplirse, mirando cada grupo por separado. Mirar la unión entera no sirve: «cierre > EMA 20 o bien cierre < EMA 20» se cumple casi siempre y daría una sola señal. Con todo «y además», un solo grupo: lo de siempre (ninguna señal cambia).
- Prueba (replay-senales.js, velas inventadas): A = cierre sobre la SMA 3 → 10, 12, 30; B = cierre bajo la SMA 3 → 11, 13, 31; A o bien B → 10, 11, 12, 13, 30, 31 (la unión entera daría solo 10 y 30); A y además B → ninguna; (A y B) o bien A → 10, 12, 30; la ventana con conO tiene el selector y guarda union «O»; sin conO, el texto «y además» de siempre.
## 241. Replay: empezar «Hace 1 / 5 / 10 años» (24/11)
Pedido por Sergi el 24/11 (más tiempo para probar las señales).
- La ventana de empezar ofrece «Hace 1 año», «Hace 5 años», «Hace 10 años» y «Al azar» (antes 1, 2 y 5). El Replay usa las velas que tiene cargadas el gráfico (su periodo): si no hay tantos años (lib/replay/grafico.js anosCargados, con 0,1 años de margen), el botón sale apagado y su tooltip dice cuántos hay y que se amplíe el periodo del gráfico.
- Prueba en replay-grafico.js: velas semanales del 02/01/2015 al 30/12/2022 = 7,99 años → «Hace 5 años» encendido (pone el 29/12/2017), «Hace 10 años» apagado con su aviso; ya no hay «Hace 2 años».
## 242. Replay: toda la historia guardada del valor y texto de la ventana de empezar (24/11)
Visto por Sergi el 24/11 (captura NVDA): con «Hace 10 años» el gráfico enseñaba UNA vela, y la ventana decía «Verás hasta el…» (se leía como «hasta» en vez de «desde»).
- Causa: el Replay usaba las velas del gráfico, que son las del periodo elegido (10 años): empezar hace 10 años era empezar en la primera vela, sin nada detrás.
- Ahora el Replay pide TODA la historia guardada del valor (/api/velas, diarias desde que hay datos; con el gráfico en semanales, semanas hechas con las diarias: lib/replay/grafico.js historiaReplay; solo velas cerradas). pages/index.js: historiaRep / baseReplay sustituyen a result.chartData en todo el Replay (ventana, avanzar, rangos, motor, señales, guardar, resultados). Mientras llega o si falla, la del gráfico. La ventana dice «Cargando las velas…» hasta tenerla.
- Texto: «Empiezas el lun 28/11/2016: verás las velas hasta ese día y quedan 2.510 por descubrir (hay datos desde el …).»
- Prueba en replay-grafico.js: historia diaria sin la vela en curso; semanal 01/01 (abre 10, máx 15, mín 9, cierra 14, vol 300) y la semana abierta fuera; textos nuevos.
## 243. «Condición con pasos»: el motor (24/11)
Boceto bocetos/condiciones-con-pasos.html aceptado por Sergi el 24/11 («sí, a todo»). Parte 1: el MOTOR, sin pantalla (en la app nada cambia).
- lib/condiciones/conPasos.js: validaConPasos, senalesConPasos, simbolosConPasos, grupos. def = { mientras (tramo), paso1 { filas, daSenal }, paso2, anula, veces: cada | primera, empieza: paso1 | tramo | maxHist | nunca }. Filas del catálogo (serieFilas de lib/planes/pesos.js, con «y además / o bien», otro símbolo, diarias o semanales) o de MOVIMIENTO { mov: cae | sube | mueve, pct, desde, quien }, con referencias maxHist, maxTramo / minTramo, maxSenal / minSenal, senal, paso1, compra (las del Replay, opciones.compras). Todo con el CIERRE.
- Orden en cada vela: tramo → puntos de referencia con el cierre de hoy → «vuelve a empezar con un máximo histórico nuevo» → con paso 2: se anula (gana si cae el mismo día), paso 2, paso 1 (arma); sin paso 2: paso 1. Un paso pasa a cumplirse cuando cualquiera de sus grupos pasa a cumplirse (§240). Tras una señal o armar el paso 1, lo de hoy se vuelve a mirar con los puntos nuevos (así «±10 % desde la última señal» no salta en la vela de la señal). Margen de 1e-9 × la referencia: un cierre justo en el umbral cuenta.
- Devuelve también el «por qué» de cada señal (paso, y en las filas de movimiento: referencia, su fecha, cierre y cambio en %: para la línea del gráfico), los eventos (tramo, armado, anulado, reinicio, señal) y los tramos.
- Prueba con-pasos.js (en comunes.sh), a mano: ejemplo 1 → k4, k10, k12, k16 (k14 no: máximo histórico nuevo); ejemplo 2 → k3, k5, k21 desde el máximo del tramo y k3, k6, k21 desde el máximo desde la última señal; ejemplo 3 → k3, k21 (primera), k3, k6, k21 (cada vez), anulado en k11; «desde tu última compra» (85 → 76,5); solo catálogo = senalesCondicion; validaciones.

## §244 · La «Condición con pasos» en la señal del Replay (pantalla, parte 1 de 3)
- En la ventana de la señal del Replay (components/Replay.js VentanaSenal), arriba dos pestañas: «Una condición» (las filas del catálogo de siempre, §231/§240) y «Condición con pasos» (components/EditorConPasos.js, boceto bocetos/condiciones-con-pasos.html pestaña 1, aceptado por Sergi el 24/11). onAceptar recibe ahora la señal entera: { tipo: 'condicion', filas } o { tipo: 'pasos', def }.
- El editor: «+ Mientras… (un tramo)» (nace con «cierre sobre la EMA 200»), «Paso 1 · Primero», «+ Paso 2 · Después…» (con «este paso también da señal» en el paso 1), «+ Se anula si…» (solo con paso 2), «Cuántas veces» (cada vez / solo la primera) con «vuelve a empezar» (solo las opciones que valen), «Así se lee», los errores de validaConPasos en rojo (y «Usar esta señal» apagado) y «Cargar un ejemplo…» con los 3 de Sergi.
- Cada paso usa FilasAlerta (con «y además / o bien») con una prop nueva `movimientos` (la lista de «desde dónde» que vale en esa sección): filas «el cierre de X cae / sube / se mueve un N % desde…» y botón «+ cae / sube un %». Sin la prop (alertas), todo igual. En «Mientras…» no hay movimientos.
- lib/replay/conPasosPantalla.js (puro): textos (REF_TEXTO, fraseMovimiento, fraseFilasPasos, fraseConPasos, textoCortoConPasos), referenciasPara (el tramo solo con «Mientras…», «el precio del paso 1» solo en el paso 2 y «se anula si»), opcionesEmpieza, ajustaConPasos (tras cada cambio: quitar el paso 2 quita «se anula si» y «también da señal»; una referencia que ya no vale pasa a «su máximo histórico»; «vuelve a empezar» a una opción que vale), conPasosNueva (cae un 10 % desde su máximo histórico, cada vez), EJEMPLOS_CON_PASOS, filasCatalogoConPasos, AYUDA_PASOS.
- pages/index.js: senalReplay { tipo: 'pasos', def } → senalesConPasos(def, …, { simbolo, compras }).senales; «tu última compra» = las compras del Replay (marcas 'compra' del motor; el cálculo del Replay sube antes de las señales; las señales solo se rehacen al cambiar las compras si la señal es con pasos). El selector de la barra dice «Con pasos: …». lib/replay/senales.js: simbolosSenal y graficoSenal también con pasos (las medias de todas sus filas del catálogo).
- Ninguna cifra cambia (nada de esto toca estrategias, planes ni alertas). Prueba nueva con-pasos-pantalla.js (en comunes.sh): textos, ejemplos válidos, el arreglo, el ejemplo 1 con velas inventadas a mano (cierres 100, 95, 90, 92, 99, 89,1, 120, 108 → velas 2, 4, 5 y 7), «desde tu última compra» (95 → 90,25: velas 2 y 5) y la ventana montada.
- Faltan (partes 2 y 3): el minigráfico de la ventana (velas inventadas / reales con el escenario) y los indicadores de la condición en el gráfico (osciladores en paneles) + «Por qué saltó».

## §245 · La «Condición con pasos»: el minigráfico de la ventana (parte 2 de 3)
- Debajo del editor de pasos, «Así se vería» (components/MiniGraficoPasos.js, SVG propio) con dos modos (decidido por Sergi el 24/11): «Velas inventadas» (por defecto, para no enseñar el futuro del Replay) y «Velas reales».
- Inventadas: velasInventadas(semilla) (760 velas, tramos de ~70 velas con su tendencia, como el boceto; generador mulberry32) y buscaInventadas: prueba semillas (hasta 40) hasta que el escenario dé al menos una señal; «🎲 Otras velas» busca desde la siguiente. Todos los símbolos de la condición usan las mismas velas; «tu última compra» no existe (si solo salta con ella, lo dice).
- Reales: las velas del valor del Replay con TODA su historia (baseReplay), con la raya «hoy en el Replay» y la línea «aquí ves también lo de después de hoy»; las de otros símbolos de la condición y las del «🎲 Valor al azar» (otro de la Watchlist) se piden por /api/velas (cargaVelas). Con tu valor usa las compras del Replay; con otro, ninguna.
- Se ve una ventana de 250 velas con la señal elegida a un cuarto del final (ventanaDe) y ◀ ▶ entre señales («señal k de N · fecha»). Marcas (dibujoEscenario, de los eventos y el detalle del motor): sombreado azul = dentro del tramo; ● = paso 1 armado; ▲ = señal (con el porqué al pasar el ratón); ✕ = anulado; en los «cae / sube un %», línea discontinua desde el precio de referencia (desde el borde si cae antes de la ventana) hasta el cierre de la señal, con el % («−10,5 %»). Las medias de las filas del catálogo, con graficoSenal. Escala logarítmica.
- Arreglo de paso: las listas vacías por defecto de las props son constantes (si no, el escenario se recalculaba en cada repintado y ▶ volvía a la señal 1).
- Prueba con-pasos-grafico.js (en comunes.sh): velas inventadas deterministas, búsqueda, ventana, marcas y líneas a mano (ejemplo 1: ● 2 y 7; ▲ 2, 4, 5, 7; 100 → 90 −10 %, 90 → 99 +10 %, 99 → 89,1 −10 %, 120 → 108 −10 %), tramos recortados y el componente montado (inventadas, otras velas, reales, ▶, valor al azar, volver). Ninguna cifra cambia.

## §246 · La «Condición con pasos»: el precio exacto, cada nivel una vez, escalones y «últimas N velas» (pedido por Sergi el 24/11)
- Visto por Sergi en el minigráfico (§245): con «cae un 10 % desde su máximo histórico, cada vez», salían 3 señales del mismo máximo (el cierre rebotaba sobre el −10 % y volvía a cruzarlo); la referencia era el CIERRE más alto y no el máximo de la vela; no se veía el punto exacto. Decidido con él (24/11, «sí, a todas tus recomendaciones»):
- Los puntos de referencia que son MÁXIMOS se miden con el máximo de cada vela, y los MÍNIMOS con el mínimo (máximo histórico, del tramo, desde la última señal, de las últimas N velas).
- Cada fila de movimiento elige «el precio de» (cuando: 'toca', por defecto) o «el cierre de» ('cierra'). Con «toca», se cumple en cuanto el precio LLEGA al nivel dentro de la vela (mínimo ≤ nivel al caer; máximo ≥ nivel al subir) y su precio es el NIVEL EXACTO (o la apertura, si la vela ya abre pasado el nivel); los puntos de referencia son los de hasta la vela anterior (lo que se sabía al abrir). Con «cierra», el cierre, con la vela de hoy incluida (como antes). El precio de la señal (y del paso 1) es el de su fila: «desde la última señal» mide desde ese precio.
- CADA NIVEL SALTA UNA SOLA VEZ: con el mismo punto de referencia (precio y fecha), un nivel que ya hizo saltar un paso no vuelve a contar aunque rebote y vuelva a caer; hace falta un punto nuevo (un máximo nuevo…). Cambia lo que daban antes los ejemplos que rebotaban (prueba: ejemplo 2 «desde el máximo del tramo» k3, k5, k21 → k3, k21; ejemplo 3 «cada vez» k3, k6, k21 → k3, k21).
- «… y luego cada X % más» (escalones: true): desde el MISMO punto, niveles −10 %, −20 %, −30 %… (máximo 120 → 108, 96, 84); cada escalón una vez; si una vela pasa varios, salta una vez con el más hondo. No es lo mismo que «desde la última señal» (108 → 97,20 → 87,48).
- Referencias nuevas «el máximo / el mínimo de las últimas N velas» (maxN / minN con n de 2 a 5000; al elegirlas nacen con 252 ≈ un año en diario).
- Pantalla (components/FilasAlerta.js, textos en lib/replay/conPasosPantalla.js): desplegable «el precio de / el cierre de», casilla de las velas y «y luego cada X % más»; «Así se lee» y el «?» con el ejemplo (máximo 120, vela con mínimo 106 y cierre 107: «el precio de» → señal a 108,00; «el cierre de» → 107).
- Minigráfico: punto en la referencia, línea discontinua hasta la vela de la señal, raya y punto en el precio exacto con «108,00 · −10,0 %»; solo la señal elegida con ◀ ▶ lleva texto y las demás se ven tenues; el porqué dice «a 108,00».
- Pruebas: con-pasos.js (velas con máximo y mínimo a mano: 112 → 100,80 exacto; «cierra» 100,50; escalones con hueco a 88; máximo nuevo 125 → 112,50; últimas 2 velas 120 → 100 y 110 → 99), con-pasos-pantalla.js (textos y los campos nuevos montados) y con-pasos-grafico.js.

## §247 · El minigráfico también en «Una condición» (pedido por Sergi el 24/11)
- La ventana de la señal del Replay enseña «Así se vería» también en la pestaña «Una condición» (la de siempre, del catálogo), con los mismos dos modos (velas inventadas / reales, 🎲) y ◀ ▶; solo hay ▲ (no hay tramos, pasos ni líneas). La ventana mide 720 px en las dos pestañas.
- lib/replay/conPasosGrafico.js: la señal es { tipo: 'pasos', def } o { tipo: 'condicion', filas } (comoSenal, senalValida); escenario, buscaInventadas y otrosSimbolos aceptan las dos (una def sola sigue valiendo: con pasos). «Una condición» usa senalesCondicion, la misma que salta en el Replay. components/MiniGraficoPasos.js: prop senal (o def, como antes).
- Prueba con-pasos-grafico.js: «cierre de A sobre su SMA 2» con cierres 10, 11, 12, 11, 10, 11, 12 → ▲ en las velas 1 y 5, sin líneas; velas inventadas; la ventana montada en «Una condición» con 2 señales en las reales. Ninguna cifra cambia.

## §248 · Replay: entradas y salidas de una estrategia (pedido por Sergi el 24/11)
- Con una estrategia de tarjetas como señal del Replay, el gráfico lleva ▲ morado en sus entradas (como antes) y ▼ morado encima de la vela en sus SALIDAS (la fecha de venta de cada operación cerrada), solo hasta «hoy».
- En la barra, junto al selector de la señal, «▲▼ Entradas y salidas» (por defecto) / «▲ Solo entradas» / «▼ Solo salidas»: a qué saltan «Señal ⏭» y «⏮ Señal» (no se guarda: vuelve a «las dos» al recargar). El recuento dice «N entradas · M salidas». Con una condición, todo igual.
- lib/replay/senales.js: entradasYSalidasEstrategia (las entradas, igual que antes; senalesEstrategia sigue dando solo las entradas), fechasDeSalto, marcasSalida, TIPOS_SALTO. pages/index.js: resSenalReplay (lo calculado) y fechasSenalReplay (a qué salta, según tipoSaltoReplay).
- Pruebas: replay-senales.js (a mano: entradas 10 y 30, salidas 14 y 34 por el tope de 3 velas; a qué salta; ▼ solo hasta hoy) y replay-grafico.js (el selector montado). Ninguna cifra cambia.
- Arreglo (visto por mí en la app al comprobar §246–248): la casilla «y luego cada X % más» (y la de «este paso también da señal») salía ENCIMA de su texto: el estilo general de styles/globals.css pone las etiquetas en columna; ahora van en fila y con la letra de la ventana.

## §249 · Replay: cifras nuevas de la cuenta (parte 1a del panel de operar; boceto bocetos/replay-operar-multiactivo.html, aceptado por Sergi el 24/11)
- lib/replay/motor.js: cada punto de la curva lleva `invertido` = lo que vale lo abierto al cierre (en valor absoluto: un corto también ocupa dinero).
- cifras() da además: `cagr` (con los días de calendario de «desde» a «hoy»; con menos de 90 días, null: un mes bueno daría un CAGR absurdo), `dias`, `invertidoMedia` (media, vela a vela, de invertido ÷ tu dinero, en %) y `tiempoDentro` (% de velas que acaban con algo abierto). Son las cifras de «Detalle» del plan que pidió Sergi para la tarjeta del Replay.
- Pruebas a mano en replay.js (apartado 15): 49 acciones a 101 → invertido 0 / 5.096 / 4.851 / 4.704 / 5.292 / 5.439; invertido de media 41,75 %; tiempo dentro 5 de 6 = 83,3 %; 7 días sin CAGR; 10.000 → 12.100 en 730 días = 10,0 %. En pantalla aún no sale nada (llega con el panel de operar sobre el gráfico). Ninguna cifra cambia.

## §250 · Replay: el panel de operar DENTRO del gráfico y la tarjeta ⚙ «Valores por defecto» (parte 1b; boceto bocetos/replay-operar-multiactivo.html, aceptado por Sergi el 24/11)
- components/PanelReplay.js · PanelGrafico (nuevo, pieza que servirá para cualquier gráfico, también los del Replay con varios valores): arriba a la derecha del gráfico (pages/index.js lo pone en las dos instancias: normal, top 36, y pantalla completa, top 6; right 72 para no tapar el eje). Botones «🎯 Compra» / «🎯 Venta» (con el tipo «En un precio») o «Compra» / «Venta» (con «A mercado»), «Cerrar ✕» con posición y ⚙. Debajo, la guía mientras se marca (con la estimación ≈ acciones · arriesgas · R:R), la posición (#n, lado, acciones, precio, ganancia) con casillas Stop y Objetivo, y cada orden viva con su texto, ✕ (cancelar) y casillas Entrada · Stop · Objetivo. Cada casilla: escribir + Enter, 🎯 (el próximo clic en el gráfico la mueve: capturaLineaReplay en pages/index.js; Esc cancela) o ✕ (quitar el stop o el objetivo).
- PanelOperar (derecha): ya sin «Nueva orden», ni posición, ni órdenes vivas (van dentro del gráfico). Quedan el nombre, las CIFRAS (tu dinero, ganancia, CAGR, peor caída, operaciones, ganadoras, profit factor, invertido de media, tiempo con algo dentro, liquidez, Buy&Hold y «Tú, frente a él»; §249), avisos y Terminar. Con ⚙, en lugar de las cifras, TarjetaDefecto: tipo de orden (En un precio / A mercado), stop inicial (A un % / Lo marco yo / Sin stop), objetivo (Por R:R / Lo marco yo / Sin objetivo), tamaño (invertir / arriesgar un %) y, de solo lectura, la comisión y cuándo van las órdenes a mercado (se eligen al empezar). Al elegir «A un %» o «Por R:R» con la casilla vacía se rellena con 5 % y 1 : 2.
- lib/replay/borrador.js: formulario con tipo, stopModo y tpModo (modoStop/modoObjetivo los deducen en los formularios de antes: con un % → «pct», sin él → «marco»). Con «Sin stop», tras la entrada no se pide el stop; con «Sin objetivo», tampoco el objetivo; sin stop no hay R:R. pages/index.js recuerda los 7 ajustes en el navegador (replay.orden); sin nada guardado, stop a 5 % y R:R 1 : 2 (★ del boceto). Con lo guardado de Sergi (stop y objetivo vacíos) sigue como estaba: se marcan a mano.
- Pruebas: replay-operar.js (cifras nuevas 25,1 % y 50,0 %; ⚙ con sus valores, cambiar modos y el relleno; panel del gráfico: posición, «Cerrar ✕», 🎯 Compra / Venta o Compra / Venta a mercado con stop 109,20 = 104 × 1,05 en corto; arriesgar sin stop → aviso; orden viva y ✕; terminada) y replay-marcar.js (casillas de la orden viva en el panel del gráfico, 🎯 y ✕ de una casilla; los modos: sin stop → lista con un clic; 5 % sin objetivo → 95; «Lo marco yo» aunque haya un % guardado). COMPROBADO POR MÍ EN LA APP (^GSPC, hace 1 año): con 5 % y R:R 2, un clic en 6.496,41 → stop 6.171,59 y objetivo 7.146,05 (6.496,41 + 2 × 324,82); el 🎯 del stop lo movió a 6.286,90 (−3,2 %); cancelada y el Replay de prueba borrado; los ajustes de Sergi, como estaban. Ninguna cifra cambia.

## §251 · Replay: la tabla de operaciones, con la última arriba y ordenable (pedido por Sergi el 24/11)
- components/PanelReplay.js (ResultadosReplay): por defecto, la ÚLTIMA operación arriba (# ▼); pulsar el título de una columna ordena por ella (otra vez, al revés; ▼ / ▲ y en azul la columna elegida); con empate, la más nueva primero. La posición abierta va siempre arriba. COLUMNAS_OPS y ordenaOps (exportadas).
- Columna nueva «Capital invertido» (acciones × precio de entrada) y todas las cifras centradas (pedido por Sergi el 24/11, apuntado en «LO SIGUIENTE»).
- Pruebas en replay-operar.js: #3, #2, #1 por defecto; por resultado #2, #3, #1 y al revés #1, #3, #2; capital invertido de #1 = 49 × 101 = 4.949 €; ▼ / ▲ al pulsar. Ninguna cifra cambia.

## §252 · Replay, parte 2: stop que sigue al precio, stop por ATR y «Ejecutar solo» (boceto bocetos/replay-operar-multiactivo.html, aceptado por Sergi el 24/11)
- lib/replay/motor.js: calcula(estado, velas, extra). STOP QUE SIGUE (orden.sigue = { tipo, n, k }; TIPOS_SIGUE para la pantalla): los MISMOS stops que suben de las tarjetas, con las mismas funciones de lib/condiciones/indicadores.js (minimoMovil → minimoPrevio, swingMinimo → swingPrevio, supertrend → supertrendPrevio, emaMinimo → minimoBajoMedia, este solo en largos y desde la vela de la entrada), más «a un % del máximo» (pctMax: el extremo desde la entrada − / + n %; NUEVO: no está aún en las tarjetas). Al cierre de cada vela con la posición abierta, candidato para la vela siguiente; el stop solo se mueve a favor (en corto, con maximoPrevio y los swings de máximos). STOP Y OBJETIVO RELATIVOS (orden.stopRel = { pct } | { dist }, orden.rr): se fijan con el precio al que se entra. «EJECUTAR SOLO»: estado.auto = tramos [{ desde, hasta, sale, orden: { tam, stop: { modo, pct?, k? }, rr, sigue } }] (los valores de ⚙ al encenderlo; si cambian con él encendido, tramo nuevo desde hoy); extra.senales = { SIM: { entradas, salidas } }. Cada vela con señal en un tramo, sin posición ni orden automática pendiente en ese valor, compra a mercado (apertura siguiente o cierre); sin dinero, se salta y se cuenta (r.sinDinero, cifras.sinDinero, aviso). Con «sale: estrategia», cada salida cierra lo que abrió «Ejecutar solo» (motivo «salida de la estrategia»). Las órdenes automáticas no salen como órdenes vivas; la posición y la operación llevan auto: true. irA: al retroceder, los tramos que empezaban después se quitan y los que acababan después vuelven a estar encendidos.
- lib/replay/borrador.js: stopModo «atr» (stopAtr veces el ATR (14) de hoy; atrHoy lo pone pages/index.js con atr() de indicadores). lib/replay/orden.js: sigueDe (la orden lleva sigue solo si hay uno) y configAuto (lo que guarda un tramo).
- Pantalla: tarjeta ⚙ con «Stop: A X veces el ATR», «Stop que sigue al precio» (con sus casillas y «?» con ejemplos) y «Ejecutar solo» (casilla apagada sin señal elegida en la barra; con una estrategia, «Sale con: El stop y el objetivo de aquí / Las salidas de la estrategia»; «?» con ejemplo). En el gráfico, «🤖 Solo» mientras está encendido; la posición dice 🤖 y qué stop sigue; en la tabla, las operaciones automáticas llevan 🤖 en lugar de la papelera. Cifra «Señales sin dinero». Con una «Condición con pasos» como señal, «Ejecutar solo» la calcula sin «tu última compra» (si no, sus propias compras cambiarían sus señales). Al elegir «A X veces el ATR» con la casilla vacía, se rellena con 2.
- Pruebas a mano: replay.js apartados 16–17 (5 % del máximo 105 → stop 99,75; mínimo de 2 velas 98 → 99 y no baja de 99,5; corto 5 % del mínimo 100 → 105; «Ejecutar solo» d2 a 101 × 49, stop 97,97, objetivo 107,06, sale el d4 a 97 con hueco; segunda señal 44 a 109, stop 105,73, objetivo 115,54; apagado; sale con la estrategia el d4 a 97; ATR; sin dinero; retroceder) y replay-operar.js (2 × ATR 2,5 → stop 95 y objetivo 110; sigue en la orden; configAuto; la tarjeta). COMPROBADO POR MÍ EN LA APP (^GSPC, hace 1 año, «Prueba editor EMA20», invertir 90 %, «Ejecutar solo» saliendo con la estrategia): 13 operaciones 🤖 hasta el 14/09/2026, +567 €, la #13 de 7.750,19 a 7.594,74 = −155,45 − 2 × 0,185 = −155,82 €. Replay de prueba borrado y ajustes de Sergi como estaban. Ninguna cifra de antes cambia.

## §253 · Replay con varios valores, parte 3a: lo que no se ve (boceto bocetos/replay-operar-multiactivo.html, pestaña 2, aceptado por Sergi el 24/11)
- Decidido por mí: el Replay con varios valores va en una PANTALLA PROPIA (parte 3b) que reutiliza el motor, el panel de operar, la tarjeta ⚙, las cifras y la tabla; el Replay de un valor, atado al gráfico grande de la Watchlist, no se toca.
- lib/replay/motor.js: buyHoldLista(estado, velas, valores) = Buy&Hold a partes iguales (capital ÷ n por valor; compra al cierre de su primera vela desde «desde» —un valor que aún no cotiza entra el día que empieza, como en el Backtesting; mientras, su parte espera en liquidez—; vende al cierre de hoy con la comisión de las dos órdenes; curva sin la venta final). cifras() la usa como «Buy&Hold» cuando hay varios valores; con uno, el de siempre (dan lo mismo).
- lib/replay/varios.js (nuevo): POR_PAGINA (Grandes · 4 / Pequeños · 6), ordenRejilla (★ primero con posición, orden viva o señal hoy; o alfabético), pagina, porValor, conSenalHoy y siguienteSenalVarios (la próxima vela en que CUALQUIER valor da señal). lib/replay/guardados.js: nombre «8 valores · desde …».
- Prueba nueva replay-varios.js (en comunes.sh), a mano: A y B a partes iguales 5.537 + 5.691 = 11.228 €; el d3 (B sin vela) 10.147 €; C entra el d4 y da 11.033 €; una cuenta para los dos (A 38 y B 76 acciones, liquidez 2.094 €); orden de la rejilla, páginas, por valor, señales y nombre. En pantalla aún no cambia nada. Ninguna cifra cambia.

## §254 · Replay con varios valores, parte 3b: la pantalla (boceto bocetos/replay-operar-multiactivo.html, pestaña 2, aceptado por Sergi el 24/11)
- components/ReplayVarios.js (nuevo): pantalla propia encima de la app (position fixed). VentanaVarios para empezar: valores de una lista de la Watchlist («Toda la Watchlist» y cada lista con 2 o más; propone la primera que cabe) o a mano (como mucho 30), día de empezar (Hace 1 / 5 / 10 años), dinero, comisión y a mercado (los de replay.ajustes). Carga las velas diarias de todos y del S&P 500 (^GSPC) por /api/velas, de 4 en 4; un valor sin precios guardados no sale (aviso). «Desde» = el primer día con vela de cualquiera (primerDia).
- Arriba: «Señal:» (las estrategias de tarjetas; sus entradas y salidas valor a valor con entradasYSalidasEstrategia, con las velas de sus referencias), «▲ hoy en N», Grandes · 4 / Pequeños · 6, orden (★ primero con señal, posición u orden / alfabético), páginas y «✕ Salir». Cada gráfico (GraficoVarios, SVG): velas hasta hoy, ▲ morados de la señal, operaciones con su línea y «#n ±x %», posición y órdenes con sus líneas, borde morado y «▲ señal hoy» si hoy da la señal; un valor que aún no cotiza lo dice. Su panel de operar es COMPACTO (PanelGrafico compacto: 🎯 Compra / 🎯 Venta o Compra / Venta, «Cerrar ✕» y una línea con lo que hay); con doble clic se amplía con el panel entero (casillas, 🎯, ✕, ⚙); Esc vuelve. Un clic en el gráfico, mientras se marca, pone la orden (con los valores de ⚙).
- Abajo: ▶|, ▶ 2/s, ▶▶ 5, «Señal ⏭» (la próxima vela en que CUALQUIER valor da la señal), «⚙ Valores por defecto», hoy y las velas que quedan; la tabla de operaciones (todas las posiciones abiertas arriba, «Por valor» y la curva con el Buy&Hold de la lista). A la derecha, PanelOperar: cifras (Buy&Hold de la lista y Buy&Hold S&P 500) o la tarjeta ⚙ con «Ejecutar solo» («en cualquier valor»; con dinero para pocas, por orden alfabético y las demás «sin dinero»). Se guarda solo (tabla simulaciones) y se abre desde «📂 Mis replays» (pages/index.js lo abre en esta pantalla si tiene varios valores), que tiene «＋ Con varios valores»; también desde la ventana del Replay («Varios valores…»).
- components/PanelReplay.js: PanelGrafico compacto; ResultadosReplay con varios (todas las abiertas, «Por valor», curva del Buy&Hold de la lista); PanelOperar con el nombre del Buy&Hold y la cifra del S&P 500 (indice).
- Pruebas: replay-varios.js (primerDia; la pantalla montada: 3 valores, C «aún no cotiza», cifras con la lista y el S&P 500, ▶▶ 5 al 09/01, panel compacto, Pequeños · 6; compacto «Largo 48 · −241 €» = 48 × (99 − 104) − 1; «Por valor»). COMPROBADO POR MÍ EN LA APP (lista «Degiro», 12 valores, desde 24/11/2025, «Prueba editor EMA20», «Ejecutar solo» invertir 25 % saliendo con la estrategia, 25 veces «Señal ⏭» hasta el 02/02/2026): una cuenta con 5 posiciones a la vez, 22 operaciones, 7 señales sin dinero, +183 € frente a 9.928 € de la lista y 10.271 € del S&P 500; a mano, 🎯 Compra en V con un clic: entrada 325,65 y stop 309,37 (= × 0,95), cancelada con ✕ en el ampliado. Replay de prueba borrado y ajustes de Sergi como estaban. Pendiente (parte 3c): vista del screener congelada como fuente, condición del catálogo como señal, velas semanales. Ninguna cifra cambia.

## §255 · Replay con varios valores: una copia del de un valor (pedido por Sergi el 25/11 al ver §254)
- Sergi: «tiene que ser una copia de lo que hay ahora en un valor, pero con varios valores». Cambios en components/ReplayVarios.js: (1) cada gráfico es el MISMO del Replay de un valor (GraficoValor = CandleChart con las mismas props: velas hasta hoy, operaciones con su línea y caja, ▲▼ de la señal, indicadores de la señal (graficoSenal) y los del gráfico de siempre (indicadoresUsuario, «📈 Indicadores» de la barra, su ventana con zIndice por encima), líneas y cajas de la posición y las órdenes que se ARRASTRAN, 🎯 / clic y doble clic para marcar, ↑ ↓ para la línea elegida, Enter / Esc, «Ver N velas»); (2) cada gráfico lleva el panel de operar ENTERO (PanelGrafico, con ⚙ junto a Compra / Venta; reducido con scale 0,85 / 0,72 para que quepa); (3) la rejilla enseña TODOS los valores, 4 o 6 por fila (como «Charts» del screener), sin páginas, bajando con la rueda; (4) ⤢ o doble clic en el nombre amplía un gráfico DENTRO de la zona de la rejilla (alto 600; «← Rejilla» o Esc vuelve) y el panel de la derecha sigue siempre a la vista; (5) abajo, la MISMA barra del de un valor (BarraReplay: ▶ con velocidad, |◀ ▶|, ▶▶ N, ⏮ Señal / Señal ⏭ de CUALQUIER valor, elegir la señal, 📈 Indicadores, Ver, hoy, vela N de M, retrocesos, ✕ Salir) sobre el calendario común. lib/replay/varios.js: anteriorSenalVarios. Para las pruebas, Grafico se puede cambiar por uno de mentira.
- Pruebas: replay-varios.js (con un gráfico de mentira: lo que recibe cada gráfico, panel entero con ⚙, ▶▶ 5 y |◀ con su retroceso, Pequeños · 6 sin páginas, ⤢ y «← Rejilla» con el panel derecho a la vista). COMPROBADO POR MÍ EN LA APP (Degiro, 12 valores, «Prueba editor EMA20»): 12 gráficos de velas con su ⚙, 4 por fila; «Ejecutar solo» con 10 × «Señal ⏭» abrió 6 posiciones; ampliar AAPL y volver; Replay de prueba borrado. Ninguna cifra cambia.

## §256 · Replay con varios valores: minigráficos más limpios (pedido por Sergi el 25/11 al ver §255)
- components/CandleChart.js, prop opcional nueva `mini` (sin ella, el HTML de siempre carácter a carácter): (1) la RUEDA no acerca ni mueve el gráfico hasta hacer clic en él, para poder bajar la página con la rueda; al salir del gráfico se apaga (como ruedaTrasClic de §167; al soltar un arrastre de línea no se vuelve a encender sola) y, encendida, una etiqueta pequeña «rueda: acercar»; (2) ejes con letra de 10 y eje de precios más estrecho (mínimo 40 en lugar de 70, también en los paneles de abajo); (3) sin la leyenda de arriba (OHLC y medias) ni la lista de indicadores.
- components/ReplayVarios.js: los gráficos de la rejilla van con `mini`; el ampliado, como el de un valor. El DOBLE CLIC en un minigráfico solo lo AMPLÍA (no pone una orden; Sergi lo corrigió el 25/11); en el ampliado, el doble clic pone la orden como en el Replay de un valor. «Por fila: 2 · 4 · 6» (nuevo 2 por fila, 400 px de alto, panel sin reducir) en lugar de «Grandes · 4 / Pequeños · 6».
- Pruebas en replay-varios.js: mini en la rejilla y no en el ampliado, 2 por fila, doble clic que amplía sin orden, CandleChart sin mini idéntico al commit anterior (4 casos) y con mini sin leyenda ni lista de indicadores. Ninguna cifra cambia. Pendiente: el panel de operar en la cabecera de cada minigráfico (boceto bocetos/replay-cabecera-minigraficos.html, formas A y B, a elegir por Sergi).

## §257 · El Replay, solo en la Watchlist (pedido por Sergi el 25/11)
- pages/index.js: los botones «⏪ Replay» y 🎯 de las dos barras del gráfico (normal y a pantalla completa) solo salen con sidePanel === 'watchlist' (ya no en Risk Mgmt ni en Fundamentals, que comparten el gráfico). Si hay un Replay abierto y se cambia de sección, se guarda y se cierra (saleReplay) y se cierra la ventana de empezar. Prueba en replay-grafico.js. Ninguna cifra cambia.

## §258 · Replay con varios valores: el panel de operar en la cabecera de cada minigráfico (forma B, elegida por Sergi el 25/11)
- Boceto bocetos/replay-cabecera-minigraficos.html (A · todo encima del gráfico / B · una línea de cabecera): Sergi eligió la B. components/PanelReplay.js, PanelGrafico con props opcionales nuevas: cabecera (los botones en línea, sin caja: con nada abierto «🎯 Compra / 🎯 Venta» o «Compra / Venta» a mercado; con posición «L 48 · −241 €» (🤖 si es automática) con ✎ y ✕ (cerrar); con orden viva su texto y ✎; marcando, «▶ marca la Entrada · Esc» y Cancelar; ⚙ siempre), onEditar / editando (✎) y sinBotones (el panel entero sin su fila de botones, para desplegarlo debajo de la cabecera). components/ReplayVarios.js: en la rejilla, cabecera = nombre · precio · ▲ (señal hoy) · panel en línea · ⤢; ✎ despliega debajo Entrada / Stop / Objetivo (estado editando por valor); el gráfico queda libre (ya no hay panel encima). Ampliado, el panel encima del gráfico como en el Replay de un valor. Fuera la escala 0,85 / 0,72 del panel.
- Pruebas en replay-varios.js: botones y ⚙ en la cabecera, sin casillas a la vista; con una posición, «L 48 · −241 €» con ✎ y ✕ y ✎ que despliega Stop y Objetivo. Ninguna cifra cambia.

## §259 · Replay con varios valores: pestañas arriba y el orden en la misma línea (pedido por Sergi el 25/11 con captura)
- components/ReplayVarios.js: en la barra de arriba, pestañas «Gráficos» / «Operaciones · N» / «Por valor» / «Curva del capital»: se ve la rejilla O la tabla elegida, sin bajar hasta abajo. Con «Gráficos», «Por fila: 2 · 4 · 6» y el selector de orden en la MISMA línea (width auto: styles/globals.css pone los select al 100 % y lo bajaba a una línea propia, que quitaba sitio a los gráficos). components/PanelReplay.js, ResultadosReplay con props opcionales vista / onVista / sinPestanas (el Replay de un valor, igual). Pruebas en replay-varios.js. Ninguna cifra cambia.
## §260 · Replay con varios valores: la señal puede ser una condición del catálogo o una «Condición con pasos» (pedido por Sergi el 25/11)
- lib/replay/varios.js (puro): aCadaValor / deCadaValor (en la condición, las filas del primer valor pasan a «quien: 'valor'» = CADA valor, y al revés para volver a abrir la ventana), simbolosSenalVarios (velas aparte: índices, «Otro símbolo…»; los de la lista ya están) y senalesVarios (por valor, con SUS velas, la misma función del Replay de un valor: senalesCondicion, senalesConPasos o entradasYSalidasEstrategia; una fila de otro símbolo es la misma para todos; un valor que falla se queda sin señales).
- components/ReplayVarios.js: el selector de la barra es el del Replay de un valor («Una condición (del catálogo o con pasos)…», su frase y «Cambiar la condición…», más las estrategias); abre la MISMA ventana (VentanaSenal, con prop nueva «nota»: «lo que pongas en «AAPL» se mira en CADA valor de la lista»), con el primer valor y sus velas para el minigráfico. Para el motor («Ejecutar solo»), la condición con pasos va sin «tu última compra» (como en el de un valor); los ▲ y «Señal ⏭», con las compras de cada valor. «Ejecutar solo» vale con cualquier señal (con una condición, solo sale con el panel). Las medias de la condición se dibujan en cada gráfico (graficoSenal con «valor»).
- Pruebas en replay-varios.js (a mano: SMA 2 sobre A, B y C inventados → A el 03/01 y 08/01, B el 03/01, C el 08/01; una fila fija en A es la misma para B). La señal no se guarda con el Replay (como antes). Ninguna cifra cambia.
## §261 · Replay con varios valores: velas diarias o semanales (pedido por Sergi el 25/11)
- components/ReplayVarios.js: la ventana de empezar (VentanaVarios) lleva «Velas: Diarias / Semanales» (se recuerda en el navegador, replay.varios.velas) y el estado guarda intervalo (los guardados de antes, diarias). Las velas de la lista y del S&P 500 se piden en ese intervalo (pages/index.js cargaVelasVarios(simbolo, intervalo) con historiaReplay: semanas hechas con las diarias, sin la semana en curso). Las referencias de la señal y el minigráfico de su ventana, diarias, como en el Replay de un valor (cada fila de la condición dice con qué velas se mira). La cabecera dice «velas semanales».
- Pruebas en replay-varios.js. Ninguna cifra cambia.
