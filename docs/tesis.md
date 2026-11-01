# Tesis de inversión (V9.1092; editor de texto, V9.1093)

Pestaña **💡 Tesis** del menú izquierdo, justo después de «Watchlist». Sirve para escribir y revisar ideas de inversión con un
editor tipo Word. Es una pantalla **aislada**: no toca el motor, el Builder ni ninguna cifra.

## Piezas

- **Tabla** `public.tesis_inversion` (`sql/tesis_inversion.sql`, creada el 31/10/2026 con la Management API en una transacción):
  id, user_id (`auth.uid()`), titulo (1–200, sin espacios a los lados), texto (≤ 100 KB), estado (`idea`, `estudio`, `marcha`,
  `descartada`), relacionados (jsonb, `[{ tipo: 'estrategia' | 'plan', id }]`), created_at, updated_at (disparador al cambiar),
  revisada_en. RLS «dueño» con cuatro políticas, como `planes_inversion`: cada usuario lee, crea, cambia y borra SOLO lo suyo;
  permisos por columnas (al crear y cambiar, solo titulo, texto, estado, relacionados y revisada_en); `anon`, nada. Sin historial.
  Comprobado con dos usuarios en una transacción deshecha: B no ve, no cambia y no borra las de A.
- **`lib/tesis.js`**: leer, crear, cambiar, marcar revisada y borrar (PostgREST), los nombres de los planes guardados y las piezas puras
  (estados y colores, cuentas, búsqueda sin tildes, orden, «creada hoy» / «revisada hace X días», fechas dd/mm/aaaa).
- **`components/TesisPanel.js`**: la pantalla, con el estilo del Builder (`lib/builder/estilo`). El token se pide en cada llamada con
  `ctxConSesion()` (renueva la sesión y reintenta una vez ante 401).
- **`pages/index.js`**: la entrada del menú, la barra lateral a 0 (como el Builder), el montaje y la pregunta de «cambios sin guardar»
  al cambiar de pestaña desde el menú (`tesisSalida`).

## La pantalla

- Arriba, «Mis tesis de inversión» con su «?» y «+ Nueva tesis» (en Idea, título «Nueva tesis» seleccionado; no se guarda hasta
  pulsar «Guardar»).
- Izquierda (360 px): buscador en títulos y textos; filtros por estado con sus cuentas (de lo que encuentra la búsqueda); la lista por
  revisada_en, la más reciente arriba, con su etiqueta de color (Idea gris, En estudio azul, En marcha verde, Descartada rojo).
- Derecha: título editable, «● sin guardar», «Guardar» (solo con cambios; pone revisada_en = ahora), papelera roja (con aviso), los
  4 estados, «Creada · Revisada», «✓ Marcar como revisada hoy» (solo revisada_en, sin tocar el texto). El editor ocupa casi todo el
  alto (mínimo 400 px), con su propia barra vertical y se estira desde la esquina.
- «Relacionado»: fichas «Estrategia · nombre» / «Plan · nombre» con × para quitar; «(borrado)» en gris si ya no existe. «+ Añadir
  estrategia o plan»: las estrategias de tarjetas y los planes guardados.
- **«Abrir» solo en las estrategias** (paso 1 del Builder, con `abrirEnBuilder`). El Builder no sabe abrir un plan guardado concreto
  desde fuera, y añadirlo era tocar el Builder: los planes enlazados se ven, pero sin «Abrir».
- Con cambios sin guardar, al elegir otra tesis, crear una nueva, pulsar «Abrir» o salir por el menú: «Tienes cambios sin guardar en
  «X». ¿Guardarlos?» (Guardar / Descartar / Cancelar). Al cerrar o recargar la ventana, el aviso del navegador.
- Menos de 1000 px de ancho: una sola columna.

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
de Word, las imágenes, los enlaces, los contrastes y que TipTap no se carga fuera de la pestaña.
