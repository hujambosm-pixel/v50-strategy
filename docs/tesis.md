# Tesis de inversión (V9.1092; editor de texto, V9.1093; salir sin guardar, fechas y buscador, 01/11/2026)

Pestaña **💡 Tesis** del menú izquierdo, justo después de «Watchlist». Sirve para escribir y revisar ideas de inversión con un
editor tipo Word. Es una pantalla **aislada**: no toca el motor, el Builder ni ninguna cifra.

## Piezas

- **Tabla** `public.tesis_inversion` (`sql/tesis_inversion.sql`, creada el 31/10/2026 con la Management API en una transacción):
  id, user_id (`auth.uid()`), titulo (1–200, sin espacios a los lados), texto (≤ 100 KB), estado (`idea`, `estudio`, `marcha`,
  `descartada`), relacionados (jsonb, `[{ tipo: 'estrategia' | 'plan', id }]`), created_at, updated_at (disparador al cambiar),
  revisada_en (admite vacío desde el 01/11/2026; ver «Las fechas»). RLS «dueño» con cuatro políticas, como `planes_inversion`: cada usuario lee, crea, cambia y borra SOLO lo suyo;
  permisos por columnas (al crear y cambiar, solo titulo, texto, estado, relacionados y revisada_en); `anon`, nada. Sin historial.
  Comprobado con dos usuarios en una transacción deshecha: B no ve, no cambia y no borra las de A.
- **`lib/tesis.js`**: leer, crear, cambiar, marcar revisada y borrar (PostgREST), los nombres de los planes guardados y las piezas puras
  (estados y colores, cuentas, búsqueda sin tildes, orden, «creada hoy» / «revisada hace X días», fechas en hora de Madrid, salir sin guardar).
- **`components/TesisPanel.js`**: la pantalla, con el estilo del Builder (`lib/builder/estilo`). El token se pide en cada llamada con
  `ctxConSesion()` (renueva la sesión y reintenta una vez ante 401).
- **`pages/index.js`**: la entrada del menú, la barra lateral a 0 (como el Builder), el montaje y la pregunta de «cambios sin guardar»
  al salir de la pestaña por el menú, el logo o «Cerrar sesión» (`tesisSalida` y `salirDeTesis`).

## La pantalla

- Arriba, «Mis tesis de inversión» con su «?» y «+ Nueva tesis» (en Idea, título «Nueva tesis» seleccionado; no se guarda hasta
  pulsar «Guardar»).
- Izquierda (360 px): el buscador (ver «El buscador»); filtros por estado con sus cuentas (de lo que encuentra la búsqueda); la lista por
  revisada_en, o por created_at si aún no se ha revisado, la más reciente arriba, con su etiqueta de color (Idea gris, En estudio azul, En marcha verde, Descartada rojo).
- Derecha: título editable, «● sin guardar», «Guardar» (solo con cambios; no toca las fechas), «Descartar cambios» (solo con cambios),
  papelera roja (con aviso), los 4 estados, «Creada · Revisada», «✓ Marcar como revisada hoy» (solo revisada_en, sin tocar el texto). El editor ocupa casi todo el
  alto (mínimo 400 px), con su propia barra vertical y se estira desde la esquina.
- «Relacionado»: fichas «Estrategia · nombre» / «Plan · nombre» con × para quitar; «(borrado)» en gris si ya no existe. «+ Añadir
  estrategia o plan»: las estrategias de tarjetas y los planes guardados.
- **«Abrir» solo en las estrategias** (paso 1 del Builder, con `abrirEnBuilder`). El Builder no sabe abrir un plan guardado concreto
  desde fuera, y añadirlo era tocar el Builder: los planes enlazados se ven, pero sin «Abrir».
- Menos de 1000 px de ancho: una sola columna.

## Salir sin guardar

- **«Descartar cambios»**, junto a «Guardar» y solo con cambios: vuelve a lo último guardado (texto, título, estado y enlaces), con el
  editor nuevo, y quita «● sin guardar». Una tesis nueva que nunca se guardó desaparece y se abre la más reciente.
- **La ventana**: con cambios sin guardar, al elegir otra tesis, crear una nueva, pulsar «Abrir», o salir por el menú izquierdo, el logo de
  arriba o «Cerrar sesión»: «Tienes
  cambios sin guardar en «X».» y tres botones (`respondeSalida`): «Guardar» (guarda y continúa), «Salir sin guardar» (descarta y
  continúa), «Cancelar» (te quedas). Si guardar falla, no continúa: la ventana sigue abierta y muestra el error. Sin título o con más de
  100 KB, «Guardar» está apagado y dice por qué. Es una ventana de la app, sin `confirm()`.
- Una nueva sin tocar se deja sin preguntar. Al cerrar o recargar la ventana, el aviso del navegador, como siempre.
- **Salidas revisadas una a una** (`pages/index.js`, todos los `setSidePanel` y lo que se ve con Tesis abierta). Pasan por `salirDeTesis`: el
  menú, el logo y «Cerrar sesión». No sacan de Tesis: el desplegable de estrategias de arriba (carga la estrategia, sin cambiar de pestaña),
  el buscador de símbolos, Ajustes y Contraseña (ventanas encima), y SP500, TradingView y Supabase (pestaña nueva). La barra lateral con
  más botones está a 0 en Tesis, y los demás `setSidePanel` están dentro de otras pestañas. Una salida nueva tiene que pasar por `salirDeTesis`;
  la prueba cuenta los `setSidePanel` para avisar si aparece uno.
- **Lo que no puede preguntar**: que la sesión caduque o se cierre en otra ventana. No lo pide nadie desde esta pantalla: la app vuelve al
  acceso y lo no guardado se pierde.

## Las fechas

- **created_at** lo pone la base al crear y no cambia nunca: la pantalla no lo envía y la base no da permiso para cambiarlo.
- **revisada_en** está vacía hasta pulsar «✓ Marcar como revisada hoy», lo ÚNICO que la cambia: crear, guardar texto o cambiar el estado
  no la tocan. Vacía se ve «Revisada: —» y en la lista «creada hace X días».
- **Hora de Madrid**: la base guarda en UTC y la pantalla enseña siempre Madrid (`Europe/Madrid` con `Intl`, también el cambio de hora),
  esté donde esté el ordenador. También cuenta en días de Madrid «hace X días». Encima de cada fecha, un tooltip con día y hora:
  «Creada el 01/11/2026 a las 00:21».
- **Cambio en la base, 01/11/2026** (`sql/tesis_inversion.sql`, con la reversión): revisada_en pasó a admitir vacío y sin valor por
  defecto. Las tesis 3, 4 y 5 («Breakouts blueprint», «Growth investing» y «Métricas para screener»), que nunca se revisaron, pasaron a vacío,
  con el disparador parado para no mover updated_at; created_at y el contenido siguen idénticos. Copia antes:
  `backups/datos_completos_20261101-1415`. Eran «Creada 01/11/2026» porque se crearon a las 00:21 y 00:22 de Madrid (23:21 y 23:22 UTC
  del 31/10): no había fallo.

## El buscador

- **Por defecto, solo en los títulos** (`buscaTesis`). El icono de la hoja con líneas, al lado, enciende «Buscar también en el texto»;
  encendido se ve resaltado. Tooltip según lo que hace ahora: «Buscar solo en títulos» / «Buscar también en el texto». Se recuerda en
  este navegador (`localStorage`, clave `tesis_buscar_en_texto`, con try/catch: si no se puede, apagado y sin fallar).
- Sin distinguir mayúsculas ni acentos (`coincide` y `trozosResaltados` de `lib/builder/buscar`, los del Builder). Varias palabras: tienen
  que estar todas. En el texto, solo lo visible (`textoSinEtiquetas`): nunca etiquetas ni direcciones de enlaces.
- **Lo encontrado, resaltado**: en el título si está allí. Si una palabra está solo en el texto, bajo el título sale una línea corta con
  ese trozo (`lineaCoincidencia`). Se pinta con React, sin interpretar nada como HTML.
- La **✕** dentro del cuadro, solo con algo escrito, lo borra y vuelve a mostrar todas.

## El editor de texto (V9.1093)

- **Editor**: [TipTap](https://tiptap.dev) 3 (`@tiptap/react`, `starter-kit`, `extension-text-style`, `extension-highlight`,
  `extension-table`, `extension-placeholder`; con versión exacta). `components/TesisEditor.js` es el único que lo importa, y
  `TesisPanel` lo carga con `next/dynamic` y `ssr: false`: va en su propio trozo, y el resto de la app ni pesa más ni lo ve en el servidor.
- **Formato guardado**: el HTML de `editor.getHTML()`, en la columna `texto` de siempre (`text`, sin cambios en la base). **El límite
  de 100 KB cuenta también las etiquetas**: una tesis con muchas tablas cabe en menos texto.
- **Tesis antiguas en texto plano**: `textoAHtml` las convierte al abrirlas (cada línea, un párrafo; todo escapado). Lo guardado no
  cambia hasta tocar el texto: `valorDelEditor` compara con lo que el editor dejó al abrir, y si es lo mismo devuelve lo guardado. Por
  eso ni abrir ni deshacer marcan «● sin guardar». Si solo cambia el título, el texto sigue en plano, y se sigue convirtiendo al abrir.
  **HTML o plano** (`esHtmlTesis`): es HTML si empieza por una etiqueta de bloque y acaba en «>».
- **Texto sin etiquetas** (`textoSinEtiquetas`): lo usa la búsqueda y lo debe usar cualquier vista previa.
- **Seguridad**: el contenido solo se pinta a través del editor, que lo lee en un documento inerte y solo deja lo que admite su esquema
  (`extensionesTesis`). Sin `dangerouslySetInnerHTML`. Enlaces: solo http, https y correo (`direccionEnlace`).
- **Pegar** (`limpiarPegado`): quita el ruido de Word, vuelve listas sus párrafos `mso-list`, sus títulos (`MsoTitle`, h4–h6) a lo
  admitido, y descarta colores de letra y de fondo (suelen ser negro, ilegible sobre la hoja gris). Lo copiado del propio editor
  (`data-pm-slice`) los conserva.
- **Imágenes**: ver «Imágenes y adjuntos». Word y Excel añaden una «foto» de lo copiado junto al texto: ahí se pega el texto, sin aviso.
- **Colores**: `HOJA`, `COLORES_LETRA` y `COLORES_RESALTE` en `lib/tesis.js`; la prueba mide los contrastes (hoja, ≥ 7:1).
- **Teclear**: el atajo de `pages/index.js` que abre el buscador de símbolos con cualquier letra no salta dentro del editor (`isContentEditable`).
- Al abrir otra tesis, el editor se monta de nuevo (`hoja`, su `key`): «deshacer» no trae el texto de la anterior.

## Imágenes y adjuntos

Imágenes dentro del texto y archivos adjuntos con visor. Boceto aprobado por Sergi: «Tesis · imágenes y adjuntos», A + B (adjuntos debajo del
texto con visor a pantalla completa, más un botón para leerlos al lado del texto).

- **Tabla** `public.tesis_adjuntos` (`sql/tesis_adjuntos.sql`, con QUÉ, QUIÉN y REVERSIÓN; creada el 02/11/2026 con la Management API en una
  transacción): una fila por archivo, con la clase (`imagen`: dentro del texto; `adjunto`: en la zona Adjuntos), la ruta, el nombre ORIGINAL
  (con tildes, hasta 200), el tipo y los bytes (hasta 50 MB). RLS «dueño»: leer, crear y borrar solo lo suyo, sin UPDATE. Al crear, la tesis tiene
  que ser suya y la ruta, de su carpeta y de esa tesis y clase (esto último, además de lo pedido: así nadie aparta una ruta ajena). `anon`, nada.
- **Bucket PRIVADO** `tesis-archivos`: 50 MB por archivo; png, jpeg, gif, webp, pdf, doc, docx, xls, xlsx, ppt, pptx, csv y txt. Nada de svg ni html
  (podrían ejecutar código). Rutas: `<user_id>/<tesis_id>/<clase>/<uuid>.<extensión>`. Políticas para `authenticated`: SELECT, INSERT y DELETE solo si el
  primer trozo de la ruta es su `auth.uid()`. Sin UPDATE: un archivo cambiado es un archivo nuevo. El bucket no tiene carpeta pública: todo se lee con URL firmadas.
- **`lib/tesisArchivos.js`**: `subir` (si la fila falla, borra lo subido; con `alProgreso`, por XMLHttpRequest, porque fetch no da el progreso), `listar`,
  `espacioUsado`, `urlFirmada` y `urlsFirmadas` (en lote), `descargar` (con el nombre original: el «download» de la URL firmada), `borrar` (primero el
  archivo, luego la fila) y `borrarTodoDeTesis`. Puras: `tamanoLegible`, `visorDe`, `tipoDe`, `cabe`, `avisoDe`.
- **El tipo sale de la extensión**, no de lo que diga el navegador (en Windows, un csv puede llegar como Excel y un docx, vacío).
- **El límite de 1 GB lo cuenta la pantalla** (`espacioUsado` + `cabe`), no la base: protege de llenar el espacio sin querer, no de alguien que
  use la API a mano con su propia cuenta. El de 50 MB sí lo imponen el bucket y la tabla.
- **Copias**: `npm run backup` copia la tabla (descubre todas las de `public`), pero NO los archivos del bucket.

### Imágenes dentro del texto

- **Lo que se guarda** en `texto`: `<img data-archivo="<ruta>" data-tamano="pequena|mediana|ancho">`, NUNCA una URL (las firmadas caducan). El nodo `imagenTesis`
  (`components/TesisEditor.js`) saca solo eso a `getHTML()`; la URL firmada la pone la vista del nodo (`vistaImagen`) en el `src` de la pantalla, así que no hay nada que
  quitar al guardar. Ida y vuelta: abrir y guardar no cambia ni un byte (`scripts/comprobaciones/tesis.js`). Cuentan solo su referencia en los 100 KB del texto.
- **Las URL** (`tiendaUrls`, 1 hora): cada imagen pide la suya y salen todas en un lote. Si una no carga (ha caducado), se pide una vez más; si tampoco, «Imagen no disponible».
- **Pegar y arrastrar** (`imagenEnPegado`): sin texto, las imágenes (png, jpg, gif y webp) se suben (clase `imagen`) y entran donde está el cursor, en Mediana; botón «Imagen»
  para elegirlas. Mientras sube, un hueco «Subiendo imagen…» (una decoración, nunca llega al texto) y «Guardar» apagado: la imagen aún no está en el texto.
- **Solo referencias propias** (`quitarImagenesAjenas`): al pegar, solo se quedan las de la carpeta del usuario y de esa tesis; cualquier otro `<img>` se quita y sale «Las
  imágenes pegadas junto con texto no se copian: pégalas una a una.». El nodo, además, solo lee rutas con forma de imagen (`rutaImagenValida`, nunca svg) y jamás lee el `src`.
- **La barrita** al pulsar una imagen: Pequeña (33 %), Mediana (60 %), Ancho completo, Descargar, papelera roja (la quita del texto); borde `#79c0ff`.
- **Tesis nueva sin guardar**: «Guarda la tesis antes de añadir archivos.» y no se sube nada.
- **Limpieza** (`imagenesSobrantes`): al guardar, se borran (archivo y fila) las imágenes de esa tesis que no están en el texto guardado ni en lo que se está escribiendo; al
  «Descartar cambios» o «Salir sin guardar», las que no están en el texto guardado. Si el editor se cierra mientras sube una, se borra al acabar. Al borrar la tesis, primero sus archivos.
- **Lo que queda sin limpiar hasta la próxima vez**: cerrar la ventana a mitad, o que falle la limpieza. No se pierde nada: la próxima vez que se guarde o se descarte esa tesis se limpia.
- **Deshacer tras guardar**: una imagen quitada y guardada ya no existe; si se trae con Ctrl+Z, sale «Imagen no disponible».

### La zona «Adjuntos» y el visor (opción A)

- **`components/TesisAdjuntos.js`** solo pinta; el estado y las llamadas, en `TesisPanel`. Los adjuntos se guardan al subirlos: no pasan por «Guardar» ni por «● sin guardar».
- **La zona**, entre el editor y «Relacionado»: «Adjuntos (N)», su «?», «Ocupan X», «Arrastra archivos aquí o» y «+ Añadir archivos» (varios). Al arrastrar, recuadro azul discontinuo. Subiendo, una fila
  con «Subiendo… 62 %» y barra verde (`alProgreso`). Rejilla de hasta 4 columnas, más reciente primero; las tarjetas abren el visor, con Descargar y papelera roja. En una nueva sin guardar, el aviso en ámbar.
- **Las URL de las miniaturas** se piden en lote al abrir la tesis y otra vez al abrir el visor (pueden llevar más de una hora).
- **El visor**: encima de todo, con «‹ 1 de N ›», tipo, nombre, tamaño, «de la tesis», Descargar, Abrir en pestaña nueva y ×; abajo, la tira de miniaturas. Esc y × cierran; las flechas pasan de archivo, solo con el visor abierto.
  Imagen: ajustada, con clic a tamaño real. PDF: el visor del navegador en un iframe con la URL firmada (sin librerías; la respuesta del bucket no lleva `x-frame-options` ni CSP, comprobado con el modo `anon`). Word, Excel y demás: el aviso con «Descargar».
- **Límite conocido**: con un PDF abierto y el foco dentro de él, las teclas se las queda el visor del navegador (Esc y flechas no llegan a la app); la × y ‹ › sí funcionan.
- **Pulsar dos veces una imagen del texto**: el visor, recorriendo las imágenes de esa tesis.
- **Borrar un adjunto**: ventana propia. **Borrar una tesis**: dice cuántos archivos se van (`avisoBorrarTesis`); primero los archivos y solo si eso sale bien, la tesis. Si falla, se queda y sale el error.
- **La lista**: clip con el número de adjuntos (las imágenes del texto no cuentan); abajo, siempre a la vista, «Espacio usado (todas las tesis)» con barra verde, ámbar desde el 80 % y roja desde el 95 %. Por eso la
  columna izquierda se queda fija al desplazar la página y su lista lleva barra propia si no cabe.

### Leer al lado del texto (opción B)

- **El botón** de dos columnas («Ver al lado del texto»), en la cabecera de Adjuntos y en la barra del visor. Con la ventana de menos de 1100 px no aparece y se usa A, aunque estuviera recordado.
- **Al pulsarlo**: la lista de tesis se pliega a 44 px, con un botón de tres rayas («Mostrar la lista de tesis»; desplegada, otro igual la vuelve a plegar). A la derecha, `PanelLado`, de 560 px:
  «Adjuntos (N) · X MB», «+ Añadir», ampliar (el visor de A), × (cierra y vuelve a A); filas compactas, la abierta con fondo `#13283f`; debajo, el archivo elegido y «Descargar». El editor sigue en medio y se puede escribir mientras se lee.
- **La zona de abajo se queda** en modo B: de ahí se borran los adjuntos. Los avisos y las barras de subida salen en el panel.
- **Recordado** en este navegador (`localStorage`, clave `tesis_adjuntos_al_lado`, con try/catch).
- **Las URL no cambian a mitad de lectura**: cambiarlas recargaría el PDF y volvería a la página 1, y escribir y guardar relee la lista. Solo se firman las que faltan, y todas de nuevo, al abrir o elegir un archivo, si llevan más de 50 minutos.
  Un PDF abierto más de una hora sigue funcionando (ya está cargado); al elegir otro archivo se renuevan.
- La guardia de «cambios sin guardar» es la misma en los dos modos.

### La prueba de seguridad

`scripts/comprobaciones/tesisSeguridad.js` habla con la base de VERDAD (no va en `comunes.sh`). Tres modos:

- **`sql`**: las políticas, con dos usuarios y anon, en una transacción que termina en un error a propósito: se deshace SIEMPRE y ningún usuario
  llega a existir (la técnica de la tabla `tesis_inversion`). 32 comprobaciones.
- **`anon`**: por HTTP, sin cuentas: el bucket de verdad (rechaza svg, html, sobrescribir y más de 50 MB; es privado; la descarga lleva el nombre original) y anon no puede nada. El
  archivo de la prueba lo sube la clave de servicio a `_humo/` y lo borra.
- **`usuarios`**: por HTTP y con `lib/tesisArchivos.js`: crea dos usuarios temporales con la API de administración y comprueba que B no ve, descarga, lista, firma, borra ni
  sube nada de A; borra usuarios, tesis y archivos al terminar, salga bien o mal. **Lo lanza Sergi a mano**: Claude no crea cuentas en la base de producción.
  Cuando A borra lo suyo hay cuatro comprobaciones separadas: que se borran 2; que no queda nada (la lista de A, las filas con la clave de servicio y los objetos de `storage.objects`
  con `consulta`); que ya no se puede firmar una URL nueva; y que la URL vieja deja de servir (cada 5 s hasta 90 s, con los segundos, el código HTTP y cuándo caducaba la firma). Tarda hasta minuto y medio más.

### Duración de las URL firmadas y límites conocidos

- **Duración**: 1 hora las imágenes y los adjuntos que se ven en pantalla (`urlFirmada` y `urlsFirmadas`, por defecto); 5 minutos las descargas (`descargar`). La prueba `usuarios` firma con 60 s.
- **Caché tras borrar (SOSPECHA, sin confirmar)**: la primera vez que se lanzó el modo `usuarios` falló la comprobación que juntaba borrar, lista vacía y URL vieja. La sospecha es que la URL ya pedida se sigue
  sirviendo un rato desde la caché de Storage (los archivos se suben con `max-age=3600`). Si se confirma, quien ya tenga una URL firmada podría seguir viendo un archivo borrado un rato, como mucho hasta que caduque o
  expire la caché. Las comprobaciones separadas de arriba son las que lo tienen que decidir: si el archivo ya no se puede firmar y la URL vieja sigue sirviendo, es la caché.
- **PENDIENTE: `borrar` no comprueba lo borrado** (auditoría del 03/11/2026). Devuelve cuántos archivos le pidieron, no cuántos se han borrado. Sin permiso, el bucket responde bien con una lista vacía
  y el borrado de filas responde bien con 0 filas, sin error (la propia prueba lo enseña: B llama a `borrar` con lo de A, no da error y no borra nada). Por eso, si el bucket no borrara pero la fila sí, quedaría un archivo
  huérfano sin aviso; y `borrarTodoDeTesis` no terminaría con 1000 archivos o más si las filas no se borraran. No hay indicios de que esté pasando: las políticas dejan al dueño borrar lo suyo y ese día no había huérfanos
  (1 archivo, 1 fila). Arreglo previsto, aparte: comparar lo borrado con lo pedido y, si falta algo, dar error y conservar la fila.

## Comprobaciones

`scripts/comprobaciones/tesisArchivos.js` (en `comunes.sh`): `lib/tesisArchivos.js` con un fetch falso, sus piezas puras y el SQL guardado.
`scripts/comprobaciones/tesisHuella.js`: la huella de `tesis_inversion`, `planes_inversion` y `strategies`, para comparar antes y después.

`scripts/comprobaciones/tesis.js` (en `comunes.sh`): la capa de la base con un fetch falso (crear, cambiar, marcar revisada, borrar,
errores, 401 → renueva y reintenta), las piezas puras y el montaje con `renderToString` y estado (lista vacía, tres tesis, filtros,
búsqueda, cambios sin guardar, nueva, las dos preguntas, «(borrado)», la lista para añadir). Desde V9.1093, además, el editor: **TipTap
necesita un navegador (un DOM) para montarse y Node no lo tiene**, así que la pantalla se monta con un sustituto (`deps.Editor`) y de
TipTap se comprueba su esquema real (qué admite, y de imágenes solo su referencia); más la conversión, el texto sin etiquetas, «● sin guardar», el pegado
de Word, las imágenes, los enlaces, los contrastes y que TipTap no se carga fuera de la pestaña. Desde el 01/11/2026, además, las fechas en
hora de Madrid (23:30 UTC y el cambio de hora de octubre, con el ordenador en Nueva York a propósito), «Revisada: —», que guardar no toca
las fechas, los tooltips, «Descartar cambios», los tres caminos de la ventana (también guardar que falla) y el buscador.
