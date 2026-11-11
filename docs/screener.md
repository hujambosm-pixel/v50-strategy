# Screener

Buscador de valores en dos pisos (decidido con Sergi el 07–08/11; boceto `bocetos/screener.html`, diseño A «Panel + tabla»):

1. **Fundamentales**: «¿qué empresas son buenas?», con las cuentas que presentan a la SEC (EDGAR).
2. **Técnico**: «¿cuáles están hoy en buen momento?» (parte 2: §9 y §11).

Las **vistas** son conjuntos de filtros con nombre, que se guardan como los planes. «Guardar como lista» crea una lista de la Watchlist, que se puede usar en «Una lista» del plan.

## 1. Datos

| Dato | Fuente | Tabla | Ritmo |
|---|---|---|---|
| Universo: S&P 500 (con su sector GICS) | Wikipedia, «List of S&P 500 companies» | `screener_empresas` | cada carga |
| Universo: Nasdaq-100 | `universo_miembros` (miembros actuales) | `screener_empresas` | cada carga |
| Universo: tus listas | listas de la Watchlist (solo los valores que la SEC conoce) | `screener_empresas` | cada carga |
| CIK, nombre | `company_tickers.json` de la SEC | `screener_empresas` | cada carga |
| Código de actividad (SIC) | `submissions` de la SEC | `screener_empresas` | cada carga |
| Cuentas | `companyfacts` de la SEC | `screener_cuentas` | cada carga |
| Último cierre | Yahoo, chart v8 | `screener_empresas` | cada carga |
| PEG esperado | Yahoo, `trailingPegRatio` (solo hoy) | `screener_empresas` | cada carga |

- **Carga**: `node scripts/cargaScreener.js`, desde el ordenador de Sergi, una vez por semana (la primera tardó una hora para 599 empresas: los `companyfacts` pesan de 1 a 5 MB cada uno). Más adelante se lanzará sola, con las Alertas. Opciones: `--solo AAPL,MSFT` y `--ensayo` (lo descarga todo y no escribe nada).
- **La SEC exige un contacto**: `SEC_UA=<nombre> <correo>` en `.env.local`, que no está en git. Sin esa línea, el script para sin hacer ninguna petición.
- **Esquema**: `sql/screener.sql` (con REVERSIÓN). Empresas y cuentas son públicas: las lee cualquier usuario con sesión y solo escribe la Management API. Las vistas son de cada usuario (RLS dueño, como `planes_inversion`).
- Las empresas que salen del universo se quedan en la base con sus marcas a `false`: servirán para probar vistas en el pasado sin sesgo de supervivencia.

## 2. Lector de EDGAR (`lib/screener/edgar.js`)

- **Conceptos**: cada concepto tiene una lista de partidas XBRL por orden de preferencia, de `us-gaap` y de `ifrs-full`. Para cada fecha de cierre se usa la primera partida que tenga dato, así la serie no se corta cuando la empresa cambia de partida (por ejemplo, las ventas en 2018 con la ASC 606).
- **FY (anual)**:
  - Flujos: de 350 a 380 días, sacados de un 10-K, 20-F o 40-F (y sus enmiendas).
  - Saldos: de esos mismos documentos, en un fin de ejercicio.
  - Lo anual se toma SOLO de documentos anuales. Un 10-Q repite el balance del cierre del ejercicio y, si no, lo tapaba (fallo visto con MSFT y corregido antes del primer commit).
- **TTM (últimos 12 meses)**, si hay un 10-Q posterior al último ejercicio:
  - Flujo: ejercicio + lo que va de año − el mismo tramo del año anterior.
  - Saldo: el del último trimestre.
  - Acciones: la media del último trimestre.
  - No hay TTM del BPA: el PER se calcula con capitalización ÷ beneficio.
  - Los que presentan 20-F (por ejemplo, ASML) no tienen 10-Q, así que usan el último ejercicio.
- **CIK anterior** (`CIK_ANTERIOR` en `lib/screener/universo.js`): cuando una empresa estrena número en la SEC y aún no ha presentado cuentas anuales con él, se leen las de su número anterior. Hoy: ExxonMobil (XOM), del 2115436 al 34088. Hay que revisarlo en cada carga y quitar la entrada cuando la nueva tenga su 10-K. Las empresas recién separadas (HONA, VYLR) y SpaceX (SPCX) no tienen cuentas anuales todavía: salen sin datos y con aviso.
- **Correcciones**: si la misma cifra sale en varios documentos, vale la del más reciente. `conocido_desde` guarda el día del primero, para probar en el pasado más adelante.

## 3. Cifras de cada empresa (`lib/screener/metricas.js`)

- Las calcula la carga, con las cuentas de la base, y las guarda en `screener_empresas.metricas`, para que la pantalla no tenga que leer las ~150.000 filas de cuentas. Si cambia una fórmula: `node scripts/cargaScreener.js --metricas` (no descarga nada).
- **«El último» dato** de cada concepto es el más reciente entre FY y TTM. Si es de más de 400 días antes que la fecha de referencia (la más reciente de ventas y activos), la empresa ya no lo presenta:
  - inversiones a corto, papel comercial y deuda a corto o a largo cuentan 0;
  - lo demás queda sin dato («—», y no pasa el filtro).
- **Fórmulas** (en la cabecera del archivo): ROCE, ROA, ROE, ROE frente a hace 3 ejercicios (los dos anuales), caja ≥ deuda a corto (caja + inversiones a corto frente a deuda a corto + papel comercial), cobertura de intereses, deuda neta, D/E, ventas en 5 años, flujo de caja libre, PER y P/S, PEG pasado y esperado, y crecimiento esperado.
  - Beneficio operativo: si la empresa no lo declara, se usa beneficio antes de impuestos + intereses (la aproximación habitual del EBIT; `piezas.ebitAprox`).
  - Cobertura de intereses: sin gasto de intereses declarado, «no paga intereses» (la cubre).
  - PER y P/S (con precio × acciones diluidas): solo con cuentas en dólares.
  - PEG pasado: usa el crecimiento del BENEFICIO NETO en 5 ejercicios, porque el BPA de hace 5 años de la SEC no está ajustado por los splits.
  - P/S del sector: la mediana del universo cargado, que la calcula la pantalla.
- Comprobado con calculadora en AAPL, MSFT y KO (10/11). Por ejemplo, el PER de KO: 414.209 M$ ÷ 14.630 M$ de beneficio de los últimos 12 meses = 28,3.

## 4. Sectores (`lib/screener/sectores.js`)

- **Fuente**: GICS (oficial) para los miembros del S&P 500; para el resto, los tramos SIC agrupados en los mismos 11 sectores (una aproximación). La pantalla dice de cuál sale.
- **Quitados por defecto**: Financieras, Energía, Utilities, Materiales e Inmobiliario.

## 5. Pantalla (`components/ScreenerPanel.js`, menú 🔎 Screener)

- Lee las empresas con su columna `metricas` (`lib/screener/datos.js`, por páginas de 1.000) y filtra y ordena en el navegador (`lib/screener/filtros.js`).
- **Arriba**:
  - Las pestañas de las vistas. En la parte 1, las 3 de ejemplo (`lib/screener/vista.js`), sin guardar todavía.
  - El universo (S&P 500 · Nasdaq-100 · Tus listas) y la fecha de los datos.
  - El embudo: Universo (sin los sectores quitados) → 1 · pasan Fundamentales → 2 · pasan también Técnico. Hoy el 2 es igual al 1.
- **Panel izquierdo** (como el Backtesting), con las pestañas «1 · Fundamentales» / «2 · Técnico»:
  - Sectores que se quitan, en chips.
  - Los grupos Rentabilidad / Deuda / Crecimiento / Precio.
  - Cada filtro tiene casilla, ≥/≤, valor, unidad, fuente (Yahoo en amarillo), «?» (título, explicación y ejemplo inventado que cuadra) y «−N»: cuántos de los que llegan a su piso no pasan ese filtro, mirado solo.
  - El piso técnico enseña sus filtros sin poder encenderlos.
- **Tabla**:
  - Columnas: valor, sector (`*` si es aproximado por SIC), precio, una columna por filtro encendido (en rojo la cifra que no pasa) y «Crec. exigido» = PER ÷ PEG razonable (editable, 2 por defecto).
  - Se ordena pulsando la cabecera; las celdas sin dato van siempre al final.
  - Buscador con ✕, sin distinguir mayúsculas ni acentos.
  - «Ver también los que no pasan (en gris)».
- **Un dato que falta no pasa el filtro**, salvo «no paga intereses» en la cobertura.

## 6. Vistas guardadas (`lib/screener/vistasBase.js`)

- Se guardan en `screener_vistas` (cada usuario, las suyas). La primera vez que se abre el screener sin ninguna, se crean las 3 de ejemplo.
- **Arriba**:
  - Pestañas con «●» si tienen cambios sin guardar.
  - «+ Nueva vista ▾», con «Desde cero (sin filtros)» o «Copia de esta vista».
  - Nombre editable, ⧉ duplicar, papelera roja (ventana propia, «No se puede deshacer»), «Descartar cambios» y «Guardar».
- **Con cambios sin guardar**:
  - Cambiar de pestaña, crear una vista o salir de la pantalla (menú, logo o «Salir»; `screenerSalida` en `pages/index.js`, como en Tesis) pregunta «Guardar / Salir sin guardar / Cancelar».
  - «Descartar» devuelve lo guardado; en una vista nueva sin guardar, la quita.
- **Sin sesión** (o si la base falla): las 3 de ejemplo funcionan, con el aviso de que no se pueden guardar.
- **Pendiente**: enlazar una vista con una tesis («Relacionado» y 🔗). Va después de la parte 1.
- **Seguridad**: `node scripts/comprobaciones/screenerSeguridad.js` (en la base de verdad, todo con ROLLBACK; la lanza Claude aparte). Comprueba:
  - Cada usuario ve solo sus vistas y no puede ponerles otro dueño.
  - Se rechaza un tipo distinto de «vista_screener».
  - anon no lee nada.
  - Con sesión se leen empresas y cuentas, pero no se escriben.

## 7. «Guardar como lista» y el cajón de un valor

- **«☰ Guardar como lista (N)»** (`lib/screener/lista.js`), junto al embudo:
  - Guarda los N que pasan como una lista FIJA de la Watchlist, con el nombre propuesto «<vista> · dd/mm/aaaa» (editable).
  - Se hace igual que la Watchlist: una fila en `watchlist_lists` con `user_id`; los valores que faltan se añaden a `watchlist` en el grupo «Screener» (los que ya estaban se reutilizan); y una fila en `watchlist_list_members` por valor.
  - Un nombre repetido (sin distinguir mayúsculas) no se guarda y lo dice.
  - Si algo falla a mitad, la lista creada se borra.
  - Al terminar, la app relee la Watchlist, así la lista sale enseguida en «Una lista» del plan y en el Backtesting.
- **El cajón de un valor**: se abre al pulsar una fila; Esc o ✕ lo cierran. Lleva:
  - Si pasa la vista.
  - Enlaces a su ficha de Fundamentals y a su gráfico (con la guardia de cambios sin guardar).
  - «Crecimiento que exige el precio» (PER ÷ PEG razonable) frente al esperado (PER ÷ PEG esperado de Yahoo).
  - Cada filtro fundamental con ✓/✗ (solo los encendidos), su fuente, la cuenta con sus cifras y el valor.
  - Las fechas de las cuentas, del precio y del PEG.
- Al ir a la ficha o al gráfico y volver, todo sigue igual: el screener queda montado y oculto (docs/builder.md §104).
- **Pendiente** (más adelante): «Añadir a una lista» desde el cajón, la lista VIVA (que cambie sola) y «🔔 Avísame si entra o sale un valor» (con las Alertas).

## 8. Cambios del 10/11 tras verlo Sergi (V9.1167)

- **Columnas numéricas.** Los tres filtros que eran de sí o no pasan a ser números que se pueden ordenar. Conservan su id, así que las vistas guardadas siguen con ellos encendidos: `normalizaVista` pone el op y el valor por defecto si estaban vacíos.
  - «Cambio del ROE en 3 años», en puntos (`roeMejora`): ROE del último ejercicio − ROE de 3 ejercicios antes. Solo cuenta si el ROE de ahora es positivo. Filtro por defecto: ≥ 0.
  - «Caja / deuda a corto plazo», en veces (`cajaCubre`): sin deuda a corto, «sin deuda a corto» (pasa y se ordena como la mejor). Filtro por defecto: ≥ 1.
  - «Precio/ventas frente a su sector», en % (`psSector`): P/S ÷ mediana del sector − 1. Filtro por defecto: ≤ 0.
- **Tabla.** Ya no lleva ✓ ni ✗: en rojo lo que no pasa. Cada celda tiene un tooltip con de dónde sale la cifra (por ejemplo, «ROE 117,9 % (2026) frente a 156,1 % (2023)»). El cajón conserva ✓ y ✗.
- **«Recomendado»** en el «?» de cada filtro (`RECOMENDADO` en filtros.js): referencias habituales y los umbrales de las tesis de Sergi, no recomendaciones de inversión.
- **Crecimiento exigido: opción B.** Casilla «ver crecimiento exigido» guardada con la vista (`verExigido`, apagada por defecto). Encendida, aparecen el «PEG razonable» y dos columnas: «Crec. exigido» (PER ÷ PEG razonable), en rojo si es mayor que «Crec. esperado» (PER ÷ PEG esperado de Yahoo).
  - Ojo: el esperado es una aproximación, porque mezcla nuestro PER con el PEG de Yahoo, que usa el suyo. A veces sale raro; por ejemplo, ADI con PER 46 y PEG esperado 0,54 da un 85,6 %.
- **Panel de filtros.** Ahora mide 440 px y se puede ocultar (◀ / «▶ Filtros»). La app recuerda si estaba oculto en el navegador (`screener.panelOculto`).

## 9. Parte 2 · Técnico, fase 2a (precios, EMA 200, máximo de 52 semanas, volumen, sector y mercado)

- **Base** (`sql/screener_tecnico.sql`, con REVERSIÓN). Columna `screener_empresas.tecnico` (jsonb): `{ fecha, cierre, ema200, max52, volUlt, volMedio50, cierre3m, velas, en }`. Son PRECIOS, no las cifras de los filtros, para poder cambiar una fórmula sin volver a descargar.
  - Solo se escribe con `guardar_tecnico_screener(simbolo, tecnico)`, de tipo SECURITY DEFINER. Exige un usuario con sesión y solo toca esa columna de una empresa que ya está en el screener.
  - Valida el JSON: es un objeto de 2 KB como mucho, la fecha no es futura, el cierre es mayor que 0 y los demás valores son números no negativos. Las claves de más se quitan. Devuelve false si el símbolo no está en el screener.
  - La tabla sigue sin permisos de escritura para la app. Lo comprueba `screenerSeguridad.js` (20 pruebas, todas con ROLLBACK).
- **Cálculo** (`lib/screener/tecnico.js`, lógica pura). `tecnicoDe(velas cerradas)` usa los últimos 5 años (≈ 1.260 velas).
  - EMA 200: la MISMA función que el Builder (`media()` → `calcEMA`, que arranca con la media simple). Con 5 años, lo que pesa el arranque es despreciable (≈ 0,003 %).
  - Máximo (high) de las últimas 252 velas, contando la última.
  - Volumen de la última vela y media de las 50 anteriores, sin contarla.
  - Cierre de 63 velas antes.
- **Cifras de los filtros** (`cifrasTecnicas`, en la pantalla). Las cuatro son números, como los demás filtros desde V9.1167.
  - Precio frente a la EMA 200 = cierre ÷ EMA − 1, en %. Por defecto, ≥ 0.
  - Distancia al máximo de 52 semanas = (máximo − cierre) ÷ máximo, en %. Por defecto, ≤ 5.
  - Volumen relativo = volumen ÷ media de 50, en veces. Por defecto, ≥ 2.
  - Su sector frente al SPY (3 meses) = variación del ETF de su sector − variación del SPY, en puntos. Por defecto, ≥ 0. Solo se calcula si los dos llegan a la misma fecha. Los ETF son XLK, XLV, XLF, XLY, XLC, XLI, XLP, XLE, XLU, XLRE y XLB; el sector «Otros» no tiene.
- **Mercado.** Línea arriba a la derecha: «Mercado (SPY): por encima / por debajo de su EMA 200 (±X %)», con su «?». Es solo informativa: no quita valores.
- **SPY y ETF.** No están en el screener (SPY sí, porque está en una lista de Sergi). La pantalla los lee de la caché de precios al abrirse (`leerReferencias`, con `leer_velas` y la misma ventana de 5 años).
- **«⟳ Actualizar precios»** (`pages/api/screener-tecnico.js`).
  - Va por tandas de 10 símbolos, dos tandas a la vez: primero el SPY y los ETF, luego las ~600 empresas. Unos 2–3 minutos, con «Actualizando N de M…» y «Parar».
  - Cada símbolo pasa por `diariasConCache` (lo guardado más lo último de Yahoo; guarda en la caché lo cerrado que falte), el mismo camino que el paso 1 del Builder. Si falla, se usa la descarga de Yahoo de siempre.
  - Se quita la vela en curso (con la sesión de NY abierta, cuenta el cierre de ayer). Después se calcula el técnico, se guarda con el token del usuario y la tabla cambia en cuanto llega cada tanda.
  - Al terminar dice «✓ Hecho» o «Parado», con cuántos se quedaron sin precios (el tooltip dice cuáles).
- **Carga desde el PC.**
  - `node scripts/llenaCachePrecios.js --screener` llena la caché con las empresas, el SPY y los ETF (20 años). Salta los que ya están al día.
  - `node scripts/cargaScreener.js --tecnico` calcula la columna con lo que hay en la caché, sin descargar nada. Escribe con la misma función, como el usuario de Sergi.
  - Diferencia conocida: la caché no guarda la vela de «hoy» (UTC). Por eso, entre el cierre de NY y la medianoche UTC, el script usa el cierre anterior y el botón ya el de hoy.
- **Pantalla.**
  - La línea «Precios: cierre del dd/mm · N sin precios» va junto al botón.
  - La pestaña «2 · Técnico» deja encender los cuatro filtros. «Da señal de compra…» llegó en la fase 2b (§11); los niveles y figuras siguen en gris.
  - El cajón de un valor tiene un apartado «2 · Técnico» con la cuenta de cada filtro.
  - La vista de ejemplo «Rentabilidad y poca deuda» lleva ahora la EMA 200 (≥ 0 %), como en el boceto. Solo afecta a las que se creen a partir de ahora.
  - Un valor sin precios no pasa un filtro técnico encendido.
- **El precio de la columna «Precio $»** y el PER siguen saliendo de la carga semanal: «Actualizar precios» no cambia ninguna cifra de los fundamentales.

## 11. Parte 2 · Técnico, fase 2b: «Da señal de compra en las últimas N velas con…»

Decidido con Sergi el 10/11 (opción B): «en las últimas N velas», N = 1 por defecto (1 = solo la última) y como mucho 20.

- **Qué cuenta como señal** (`lib/screener/senales.js`, lógica pura, con el MISMO motor que el paso 1, `lib/editor/interprete.js`):
  - Órdenes que se deciden al cierre (a la apertura siguiente, al cierre, stop o límite): la vela da señal si al cierre se cumplen la señal de compra y el filtro de mercado de la estrategia, y la estrategia no tiene ya la operación abierta. Con la compra a la apertura siguiente, una señal en la última vela = comprar mañana.
  - Órdenes en un nivel dentro de la vela (ruptura del máximo, último máximo de swing, línea del SuperTrend, línea bajista): sin la vela de mañana no se sabe si se tocará el nivel, así que cuenta la vela en que la estrategia COMPRÓ. El tooltip dice a qué precio.
  - «Operación abierta en la vela k»: comprada en k o antes (con la orden al cierre, antes de k) y sin vender al terminar k.
  - El motor solo da la serie de la señal si se le pide (`ctx.senalCompra`); sin pedirla, su resultado es el de siempre.
- **Precios**: las velas diarias cerradas de los últimos 5 años por el MISMO camino que «Actualizar precios» y el paso 1 (`velasCerradasDe`, sacada tal cual de `pages/api/screener-tecnico.js`: la caché más lo último de Yahoo, con la vela de hoy si la sesión de Nueva York ya cerró). Diferencia posible con el gráfico del paso 1: el motor empieza 5 años atrás (el paso 1, en el periodo elegido); que una operación siga abierta puede depender de dónde empiece. Con 5 años casi nunca pasa.
- **Ruta** `pages/api/screener-senales.js`: POST `{ estrategia: { definition, params }, simbolos }`, como mucho 10 símbolos, con sesión. Solo estrategias de tarjetas y de velas diarias. No guarda nada en la base.
- **Pantalla**:
  - La fila «Da señal de compra en las últimas [N] velas», debajo «con [estrategia]» (solo tus estrategias de tarjetas de velas diarias).
  - Sin estrategia elegida no quita nada.
  - La vista guarda N y el id de la estrategia (`filtros.senal.estrategia`). Las vistas viejas lo completan con null.
  - Se calcula sola, medio segundo después del último cambio, SOLO para los valores que pasan los fundamentales (los únicos a los que se aplica) y que aún no tienen resultado con esa estrategia: unos segundos. Va por tandas de 10, dos a la vez.
  - Debajo dice «Calculando N de M…» o «Calculado para N · última vela del dd/mm · X sin calcular».
  - Los resultados se quedan en memoria por estrategia y regla. Se vacían al terminar «Actualizar precios».
  - Columna «Señal de compra»: «la última» / «hace N velas» (ordenable). Tooltip: la fecha de la señal o de la compra.
- **Comprobaciones**:
  - `screener-senales.js` (27 pruebas): velas inventadas con las señales calculadas a mano, incluidos operación abierta, filtro de mercado, ruptura, orden al cierre y pocas velas. Además, en 400 velas al azar, las señales sin operación abierta son justo las compras del motor, y la validación de la ruta.
  - `screener.js` (147): estrategias que sirven, vistas, filtro, celdas y la pantalla con estado y una petición falsa.
  - Cruce con precios reales (fuera de `comunes.sh`): AAPL de la prueba congelada con «Prueba editor EMA20», en los 300 últimos cortes de la serie. «Señal en la última» coincide con «el paso 1 compra al día siguiente» en 300 de 300 (18 señales).

## 12. La explicación del «−N» (V9.1170)

Sin la línea ««−N»: cuántos quita cada filtro» debajo del panel: su explicación y su ejemplo están en el tooltip del número rojo de cada filtro (solo cuando quita alguno).

## 13. Vista ↔ tesis (V9.1171)

Sin cambios en la base: la columna `relacionados` de `tesis_inversion` ya admite cualquier tipo (solo exige un array de 20 KB como mucho). La app acepta ahora un tercer tipo, `{ tipo: 'vista', id }` (`TIPOS_ENLACE` en `lib/tesis.js`).
- **En la tesis**, «Relacionado»:
  - Ficha «Screener · <nombre de la vista>», con «Abrir» y ×. Si la vista se ha borrado, «Screener · (borrado)».
  - «+ Añadir estrategia, plan o vista»: debajo de los planes, «Vistas del screener». Son las vistas GUARDADAS (`listarNombresVistas`), en el orden de sus pestañas.
  - El contador de la lista cuenta también las vistas («1 vista relacionada»; con varios tipos, «1 estrategia, 1 plan y 1 vista relacionados»).
- **«Abrir»** pasa por la guardia de la tesis, como el de un plan. Va al Screener con esa vista como pestaña activa (`abrirVistaEnScreener` en `pages/index.js`, prop `abrirVista`).
  - Si en el screener hay cambios sin guardar en otra vista, sale la ventana de siempre.
  - Si la vista ya no existe: «⚠ Esa vista del screener ya no existe (se ha borrado).».
- **En el screener**, junto a la papelera de la vista: «💡 <título> ›» o «💡 Tesis (N) ▾» (`TesisEnlace`, el mismo del Builder). Abre la tesis, con la guardia de cambios sin guardar del screener.
  - Una vista sin guardar no tiene tesis.
  - Las tesis se leen (solo lectura) cada vez que se entra en el Screener.
- **Comprobaciones**:
  - `tesis-enlaces.js`: cuentas con vistas, la ficha, lo que se guarda y la lista de elegir.
  - `tesis.js`: el sitio nuevo que cambia de pantalla (20) pasa por la guardia de la tesis.
  - `screener.js` (153): el «💡» de la vista, abrir por id, vista borrada y con cambios sin guardar.

## 14. Colores: estilo Finviz y papel gris, con el botón «☀ Claro / ☾ Oscuro»

Boceto `bocetos/screener-colores.html` (fuera de git). Sergi eligió el 11/11 dos tonos que se alternan: oscuro = «Estilo Finviz» y claro = «Papel gris».
- **`lib/screener/colores.js`**: los dos tonos en un solo sitio (`TEMAS`).
  - Oscuro: los colores medidos en una captura de Finviz (fondo 34,38,47; filas alternas 44,48,59; cabeceras 53,57,69; bordes 76,82,99; texto 243,243,245; símbolos en azul).
  - Claro: papel apagado (fondo 214,210,200; texto 51,48,43), con menos brillo y menos amarillo que el sepia de los libros electrónicos.
  - La pantalla usa variables CSS (`var(--sc-…)`): `B` y `S` con las mismas claves que `lib/builder/estilo.js`. El tono se cambia poniendo las variables en el div de la pantalla (`varsTema`).
- **Fila resaltada**: al pasar el ratón por la tabla se resalta la fila entera, y las filas van alternas (`CSS_TABLA`). La fila del cajón abierto va con el color de selección.
- **Botón** «☀ Claro / ☾ Oscuro» en la barra de arriba de la app, siempre visible, a la izquierda de la estrategia activa (`pages/index.js`, `temaApp`). Se recuerda en el navegador (`app.tema`).
  - De momento SOLO cambia el screener. Llevarlo a toda la app es un trabajo aparte: hay muchos colores fijos repartidos por las pantallas.
- Siguen con los colores de la app: las ventanas (Guardar / Salir sin guardar, Borrar, Guardar como lista), los «?» y el 💡.
- **Comprobación** `screener.js` (159): los dos tonos, las filas, sin los colores fijos de antes y el botón.

## 15. Los filtros ARRIBA, como Finviz

Boceto `bocetos/screener-arriba.html` (decidido por Sergi el 11/11: opción 1 «Rejilla como Finviz», cada filtro con un desplegable de cifras fijas). Sustituye al panel de 440 px de la izquierda; la tabla va debajo, a todo el ancho.
- **Vistas en UNA línea**: pestañas a la izquierda y, a la derecha, ⧉, 🗑, 💡, «☰ Guardar como lista (N)», «Descartar cambios» y «Guardar».
  - El nombre se cambia en la misma pestaña: ✎ o doble clic (Enter o Esc para terminar).
- **Línea de los filtros**: pestañas «Universo y sectores», «1 · Fundamentales», «2 · Técnico» y «Todos», cada una con cuántos hay encendidos (en «Universo y sectores», cuántos sectores se quitan), y su «?».
  - A la derecha: el mercado (SPY frente a su EMA 200; informativo, no es un filtro), los precios con «⟳ Actualizar precios», el embudo «Universo N → 1 · Fundamentales N → 2 · Técnico N» y «Filtros ▲».
  - «Filtros ▲» oculta la rejilla: queda una línea con los encendidos («ROCE ≥ 25 % −13 ✕»; ✕ lo quita) y la tabla sube. Se recuerda en el navegador.
- **Rejilla**: 5 columnas, todas las casillas iguales (nombre a la derecha, desplegable de 148 px, «−N» en rojo). Se rellena columna a columna en el orden del catálogo, así los de un mismo grupo quedan juntos.
  - Pulsar el NOMBRE abre su «?» (no se abre al pasar el ratón). `BuilderAyuda` acepta ahora `contenido`, `estiloBoton` y `soloClic`; sin ellos, el «?» de siempre.
  - El desplegable: «Cualquiera» (apagado), las cifras fijas (`lib/screener/opciones.js`: primero las de su sentido de siempre y unas pocas al revés; las EMA con palabras: «Por encima», «5 % o más por debajo»…) y «Otra cifra…», que abre ≥/≤ y la cifra. Una cifra que no está en la lista sale como «≥ 27 % (tuya)».
  - «Da señal de compra con [estrategia]» (elegir una la enciende; «Cualquiera» la apaga) y «… en las últimas [N velas]».
  - «Todos» enseña arriba el universo y los sectores, y debajo todos los filtros.
- La fecha de las cuentas de la SEC pasa al pie de la tabla.
- No cambia lo que se guarda: una vista sigue siendo `{ on, op, valor }` por filtro (la caja de «Otra cifra…» es de la pantalla). Ninguna cifra cambia.
- **Comprobación** `screener.js` (182): cifras fijas (las de por defecto y las de las vistas de ejemplo están en la lista), «(tuya)», contadores de las pestañas, rejilla de 5 columnas, «Todos», «Universo y sectores», «Otra cifra…», ocultar y quitar, y el nombre con ✎.

## 16. Filtros «Precio frente a la EMA 50» y «… EMA 20»

Pedidos por Sergi el 11/11, en el orden EMA 200, 50, 20 (piso Técnico, grupo «Tendencia y precio»).
- `tecnicoDe` guarda también `ema50` y `ema20` (la misma `media()` del Builder; con menos de 50 o 20 velas, sin dato). `cifrasTecnicas` da `ema50Dist` y `ema20Dist` en %.
- Desplegable con palabras, como la EMA 200: «Por encima», «Por debajo», «5 % o más por encima»…
- **Base**: `sql/screener_tecnico_ema.sql` añade `ema50` y `ema20` a las claves que acepta y guarda `guardar_tecnico_screener` (sin cambiar la tabla ni los permisos; con REVERSIÓN). Comprobado antes que la función de la base era la del archivo.
- Lo guardado antes no tiene esas medias: hasta recalcular, los dos filtros no tienen dato (no pasan). Se recalcula con `node scripts/cargaScreener.js --tecnico` (desde la caché, ~1 min) o con «⟳ Actualizar precios».
- **Comprobaciones**: `screener.js` (EMA 50 = 100 + 10 × 2 ÷ 51; EMA 20 = 100 + 10 × 2 ÷ 21 → +8,96 %; orden; vistas viejas) y `screenerSeguridad.js` (guarda las dos; negativa, rechazada).
- Al pasar el ratón por el NOMBRE de cualquier filtro, el tooltip dice su cifra recomendada («Recomendado: ≥ 25 % (30 % = muy exigente). Pulsa para ver qué es.»; pedido por Sergi el 11/11).

## 17. Desplegable de cifras que se puede editar

Pedido por Sergi el 11/11 (boceto `bocetos/screener-desplegable.html`). Sustituye al `<select>` con «Otra cifra…»: un `<select>` no admite botones dentro, así que es un desplegable propio (`components/ScreenerCifras.js`).
- Al pasar el ratón por una cifra salen ✎ (cambiarla: ≥/≤ y la cifra; Enter guarda, Esc cancela) y la papelera roja (quitarla de la lista). Abajo, «+ Añadir cifra» y «↺ Las de fábrica».
- **La lista se ordena sola** (`ordenaCifras` en `lib/screener/opciones.js`): primero las del sentido de siempre del filtro y luego las del contrario; dentro de cada grupo, de menor a mayor. En las EMA, de más cerca a más lejos de la media («Por encima», «5 % o más por encima»…, «Por debajo», «5 % o más por debajo»…). Ej.: cambiar ROCE 25 → 45 la coloca detrás de 40; añadir 12 la coloca entre 10 y 15.
- **Dónde se guardan**: en tus ajustes (`settings.screenerCifras = { id del filtro: [[op, cifra], …] }`, `saveSettingsRemote`: navegador y tu cuenta, como las comisiones). Valen en todas las vistas. Sin entrada, las de fábrica. Decidido por mí: no hace falta cambiar la base.
- Cambiar con ✎ la cifra que está elegida cambia también el filtro de esa vista. Las demás vistas que usaban la cifra vieja la conservan.
- Una cifra de la vista que no está en tu lista (la quitaste, o la vista es de antes) sale arriba en gris, «≥ 27 % · no está en tu lista», con ＋ para añadirla. Sigue funcionando igual.
- Las EMA siguen con palabras; con las cifras al revés: «Por encima o hasta 5 % por debajo» (≥ −5) y «Por debajo o hasta 5 % por encima» (≤ 5).
- «Da señal de compra… en las últimas N velas» no cambia (sus velas no se editan).
- Lo que se guarda en una vista no cambia (`{ on, op, valor }`). Ninguna cifra cambia.
- **Comprobación** `screener.js` (201): orden, añadir sin repetir, quitar, cambiar (también en las EMA), la lista con tus cifras (las raras se ignoran), «no está en tu lista», y con estado: abrir, ✎ 25 → 45 (se ordena, cambia el filtro y se guarda en tus ajustes), elegir, quitar la elegida, añadir 12 y «Las de fábrica».

## 18. Tooltips del embudo y desplegables en el tono claro

Visto por Sergi el 11/11 en la app.
- **Embudo**: al pasar el ratón por cada número, por qué no se ven los demás.
  - Universo: qué universo está elegido, cuántas empresas tiene y cuántas se quitan por los sectores (p. ej. «… 599 empresas; se quitan 205 de los sectores quitados → quedan 394»).
  - Fundamentales y Técnico: cuántos llegan, cuántos pasan y lo que quita cada filtro encendido de ese piso mirándolo solo a él, como el «−N» (uno puede fallar varios filtros: no suman exactamente). Sin filtros encendidos, lo dice.
- **Desplegables del navegador** («Da señal de compra con…», «… en las últimas N velas»): siguen el tono de la pantalla (`color-scheme` claro u oscuro). Antes, en el tono claro, su lista salía negra.
- **Comprobación** `screener.js` (204).

## 19. Los 11 sectores a la vista y desplegables claros de verdad

Visto por Sergi el 11/11 en V9.1179.
- **Sectores**: en «Universo y sectores» (y en «Todos») salen los 11 sectores, cada uno con cuántas empresas tiene en el universo elegido. Marcados, los que se miran; desmarcados, en gris, los que se quitan (sin tachar: §20). Pulsar uno lo cambia. Lo que se guarda sigue siendo `sectoresFuera` (las vistas no cambian).
  - Tooltip de cada uno: en los 5 que se quitan por defecto, «Recomendado: quitarlo.» y el motivo (`POR_QUE_FUERA` en `lib/screener/sectores.js`); en los demás, «Se mira normalmente.».
  - El «?» de «Sectores» explica las casillas y por qué se recomienda quitar los 5.
- **Desplegables del navegador** («Da señal de compra con…», «… en las últimas N velas»): el arreglo de §18 (`color-scheme`) no bastaba, porque `styles/globals.css` pinta oscuras todas las listas (`select option`). Ahora, dentro del screener, la lista lleva el fondo y el texto del tono (`CSS_TABLA`). El resto de la app no cambia.
- **Comprobación** `screener.js` (207).

## 20. Sectores quitados, solo en gris

Pedido por Sergi el 11/11 al ver V9.1180: los sectores que se quitan salen en gris, sin tachar. Ninguna cifra cambia.
- **Comprobación** `screener.js` (207).

## 21. Pestaña «Custom»: las columnas que eliges

Boceto bocetos/screener-charts-custom.html, opción 1 «casillas por grupos» (decidida por Sergi el 10/11). Encima de la tabla, dos pestañas: **Filtros** (la tabla de siempre, igual) y **Custom**. «Charts» va después.
- **Columnas** (): todos los filtros del catálogo y 9 más que la pantalla ya tenía: sector, precio, capitalización (M $), índice, P/S, crecimiento del beneficio pasado, crecimiento exigido, crecimiento esperado y variación en 3 meses. Ninguna cifra nueva: las mismas de siempre.
- **⚙ Columnas (N)**: ventana con casillas en 7 grupos (Básicos, Rentabilidad, Deuda, Crecimiento, Precio, Tendencia y precio, Tus estrategias), con «Todas», «Ninguna», «Las de los filtros» y «Hecho». Se cierra pulsando fuera o con Esc.
- **En la tabla**: arrastrar una cabecera cambia el orden (se suelta delante de la columna de destino si viene de la derecha y detrás si viene de la izquierda: ocupa su sitio); ✕ quita la columna; pulsar la cabecera ordena. En rojo, como en «Filtros», la cifra de un filtro encendido que no pasa (y el crecimiento exigido mayor que el esperado). Con la columna del crecimiento exigido, la caja «PEG razonable».
- **Se guardan con la vista** (): null = «las de los filtros» (sector, precio y una por filtro encendido; cambian al encender o apagar uno). En cuanto se toca algo en «Custom», la lista queda fija. Las vistas viejas y las nuevas empiezan en null: ninguna sale «con cambios» y la base no cambia. Al pie, «Ahora salen las de los filtros» o «Columnas guardadas con la vista».
- La pestaña elegida (Filtros o Custom) se recuerda en el navegador. El orden y el buscador son los mismos en las dos.
- **Arreglo**: la columna del nombre del sector se llama ahora «sec» (antes «sector», el mismo id que el filtro «Su sector frente al SPY»: con ese filtro encendido, ordenar por él ordenaba por el nombre del sector).
- **Comprobación**  (237): columnas por defecto, limpias, mover y quitar, cifras a mano (PER 40 ÷ PEG 2 = 20 %; 123.456 M $), tabla montada con el rojo, la ventana, ordenar por sector, y con estado: marcar, pulsar fuera, ✕, arrastrar, «Las de los filtros», «Todas», «Ninguna», «Hecho» y «Descartar cambios».

## 10. Comprobación

`scripts/comprobaciones/screener.js` (en `comunes.sh`) usa empresas inventadas y cuentas hechas a mano. Cubre:
- Ventas corregidas en un documento posterior.
- Cambio de partida.
- TTM = 120 + 100 − 85 = 135.
- Una empresa inventada con todas sus cifras hechas a mano (ROCE 25 %, PER 33,33, PEG pasado 2,24…), sin intereses, con cuentas en euros y con patrimonio negativo.
- Las medianas por sector.
- Filtros y vistas: universo, sectores quitados, «−N», ≤ y ≥, apagado, «no paga intereses», vistas viejas completadas y las 3 de ejemplo.
- La pantalla montada (renderToString): embudo, tabla, «−N», orden con los sin dato al final, buscador con ✕, pestaña Técnico y «Cargando…».
- Vistas guardadas: cambios (●), ventanas de salir y de borrar, las 3 de ejemplo la primera vez, cambiar y borrar por id. Con estado (DOM mínimo): cambiar el nombre, ir a otra pestaña (Cancelar / Salir sin guardar), nueva vista, descartar, apagar un filtro y descartar (78 en total).
- «Guardar como lista»: nombre propuesto, usuario del token, valores ya en la Watchlist frente a nuevos, nombre repetido, borrado si falla a mitad, sin sesión. El cajón: «crecimiento exigido» 40 ÷ 2 = 20 % frente a 12 %, la cuenta del ROCE, y abrir y cerrar con estado (93 en total).
- V9.1167, con las cifras de la captura de Sergi:
  - ROE de AAPL 117,9 − 156,1 = −38,2 pt; el de AAOI, negativo, no cuenta.
  - Caja / deuda: 56.722 ÷ 11.903 = 4,77 (AAPL) y 218 ÷ 338 = 0,64 (FICO); sin deuda a corto, la mejor.
  - P/S frente al sector: +71,3 %, +4,7 % y −5,1 %.
  - Además: los tooltips, los 14 «Recomendado», una vista vieja completada, el crecimiento exigido apagado y encendido (en rojo 20 % > 12 %) y el panel oculto (112 en total).
- Parte 2 · Técnico, con 300 velas hechas a mano:
  - EMA 200 = 100 + 10 × 2 ÷ 201 = 100,0995, y el precio frente a ella, +9,89 %.
  - Máximo 130 → 15,38 %; volumen relativo 3; 3 meses +10 %; con 150 velas, sin EMA ni máximo.
  - Sector: XLK +8 − SPY +5 = +3, y sin dato con fechas distintas o con «Otros».
  - Filtro de la EMA 200 y «−3»; línea del mercado (+5,0 %); celdas +5,0 y −5,0; el cajón.
  - «Actualizar precios» con una descarga falsa: 16 símbolos en 2 tandas, SPY primero, «✓ Hecho · 1 sin precios», y el mercado y el embudo cambian (133 en total).
- Balance anual que no tapa el 10-Q.
- El universo y los tramos SIC.
- La tabla de Wikipedia, y que esté vacía si cambia la página.
