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
