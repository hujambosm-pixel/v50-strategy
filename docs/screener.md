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

## 5. Comprobación

`scripts/comprobaciones/screener.js` (en `comunes.sh`) usa empresas inventadas y cuentas hechas a mano. Cubre:
- Ventas corregidas en un documento posterior.
- Cambio de partida.
- TTM = 120 + 100 − 85 = 135.
- Una empresa inventada con todas sus cifras hechas a mano (ROCE 25 %, PER 33,33, PEG pasado 2,24…), sin intereses, con cuentas en euros y con patrimonio negativo.
- Las medianas por sector.
- Balance anual que no tapa el 10-Q.
- El universo y los tramos SIC.
- La tabla de Wikipedia, y que esté vacía si cambia la página.
