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
| Backtesting (`multi`) | El multibacktest: varias estrategias o una sobre una lista o el universo dinámico del Nasdaq-100; modos de reparto; la prueba contra el azar de la cartera (A / B) | `pages/index.js`, `components/AzarCarteraPanel.js` |
| Optimización | Rejilla de parámetros, robustez, walk-forward, azar | `components/OptimizacionPanel.js` |
| **Laboratorio** | Ver §1.1 | `components/LaboratorioPanel.js` |
| **Lab. cartera** | Ver §1.2 | `components/CarteraPanel.js` |
| TradeLog, Risk Mgmt | El diario real (con aportaciones) y la gestión del riesgo | — (fuera del Builder) |

### 1.1 Laboratorio (señales, salidas y estrategias del catálogo)

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
