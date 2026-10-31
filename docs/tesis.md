# Tesis de inversión (V9.1092)

Pestaña **💡 Tesis** del menú izquierdo, justo después de «Watchlist». Sirve para escribir y revisar ideas de inversión en texto
libre. Es una pantalla **aislada**: no toca el motor, el Builder ni ninguna cifra.

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
  4 estados, «Creada · Revisada», «✓ Marcar como revisada hoy» (solo revisada_en, sin tocar el texto). El cuadro de texto ocupa casi
  todo el alto (mínimo 400 px), con su propia barra vertical y se estira desde la esquina.
- «Relacionado»: fichas «Estrategia · nombre» / «Plan · nombre» con × para quitar; «(borrado)» en gris si ya no existe. «+ Añadir
  estrategia o plan»: las estrategias de tarjetas y los planes guardados.
- **«Abrir» solo en las estrategias** (paso 1 del Builder, con `abrirEnBuilder`). El Builder no sabe abrir un plan guardado concreto
  desde fuera, y añadirlo era tocar el Builder: los planes enlazados se ven, pero sin «Abrir».
- Con cambios sin guardar, al elegir otra tesis, crear una nueva, pulsar «Abrir» o salir por el menú: «Tienes cambios sin guardar en
  «X». ¿Guardarlos?» (Guardar / Descartar / Cancelar). Al cerrar o recargar la ventana, el aviso del navegador.
- Menos de 1000 px de ancho: una sola columna.

## Comprobaciones

`scripts/comprobaciones/tesis.js` (en `comunes.sh`): la capa de la base con un fetch falso (crear, cambiar, marcar revisada, borrar,
errores, 401 → renueva y reintenta), las piezas puras y el montaje con `renderToString` y estado (lista vacía, tres tesis, filtros,
búsqueda, cambios sin guardar, nueva, las dos preguntas, «(borrado)», la lista para añadir).
