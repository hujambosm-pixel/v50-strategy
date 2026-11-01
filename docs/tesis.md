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
- **Imágenes: todavía no** (`imagenEnPegado`). No hay nodo de imagen. Una imagen sola no entra y sale «Las imágenes llegarán en la
  próxima versión.»; un HTML con `<img>` entra sin ella y con el aviso. Word y Excel añaden una «foto» de lo copiado junto al texto: ahí
  se pega el texto, sin aviso.
- **Colores**: `HOJA`, `COLORES_LETRA` y `COLORES_RESALTE` en `lib/tesis.js`; la prueba mide los contrastes (hoja, ≥ 7:1).
- Al abrir otra tesis, el editor se monta de nuevo (`hoja`, su `key`): «deshacer» no trae el texto de la anterior.

## Comprobaciones

`scripts/comprobaciones/tesis.js` (en `comunes.sh`): la capa de la base con un fetch falso (crear, cambiar, marcar revisada, borrar,
errores, 401 → renueva y reintenta), las piezas puras y el montaje con `renderToString` y estado (lista vacía, tres tesis, filtros,
búsqueda, cambios sin guardar, nueva, las dos preguntas, «(borrado)», la lista para añadir). Desde V9.1093, además, el editor: **TipTap
necesita un navegador (un DOM) para montarse y Node no lo tiene**, así que la pantalla se monta con un sustituto (`deps.Editor`) y de
TipTap se comprueba su esquema real (qué admite, sin imágenes); más la conversión, el texto sin etiquetas, «● sin guardar», el pegado
de Word, las imágenes, los enlaces, los contrastes y que TipTap no se carga fuera de la pestaña. Desde el 01/11/2026, además, las fechas en
hora de Madrid (23:30 UTC y el cambio de hora de octubre, con el ordenador en Nueva York a propósito), «Revisada: —», que guardar no toca
las fechas, los tooltips, «Descartar cambios», los tres caminos de la ventana (también guardar que falla) y el buscador.
