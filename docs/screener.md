# Screener

Buscador de valores en dos pisos (decidido con Sergi el 07–08/11; boceto `bocetos/screener.html`, diseño A «Panel + tabla»):

1. **Fundamentales**: «¿qué empresas son buenas?», con las cuentas que presentan a la SEC (EDGAR).
2. **Técnico**: «¿cuáles están hoy en buen momento?» (parte 2, más adelante).

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

## 9. Comprobación

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
- Balance anual que no tapa el 10-Q.
- El universo y los tramos SIC.
- La tabla de Wikipedia, y que esté vacía si cambia la página.
