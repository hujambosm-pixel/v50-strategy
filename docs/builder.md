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

