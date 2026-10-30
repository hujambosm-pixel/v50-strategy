# Planes de inversión — diseño

Fase de diseño (solo documentación; V9.1030, 21/10/2026). No se construye nada hasta que se respondan las preguntas
del §7.

Un **plan de inversión** es cómo invertiría Sergi de verdad: un capital inicial más **aportaciones periódicas**, repartido
entre una o varias **piezas** (la mezcla 50 % QQQ + 50 % ETF apalancado, un filtro de tendencia del mercado, una estrategia
del editor, una rotación por momentum…), con **reglas de calendario** (rebalanceo, fechas de aportación), **costes** e
**impuestos**. La pregunta que contesta no es «¿qué estrategia tiene ventaja?» (eso lo hacen el laboratorio y los lotes),
sino «si hago esto durante años, con mi dinero y mis aportaciones, ¿qué me queda después de impuestos, cuánto sufro por el
camino y qué habría sacado haciendo algo más simple con el mismo dinero?».

---

## 1. Qué hay ya en la app que se puede reutilizar

| Pieza | Dónde | Qué aporta al plan | Lo que le falta |
|---|---|---|---|
| Máquina de estados de cartera | `lib/laboratorioCartera.js` (`simula`, `ejecutaPeriodoCartera`) | Estados con pesos (QQQ, ETF, liquidez), transiciones por condición (caída desde el máximo, medias diarias y semanales, cruces, O / NO / histéresis, «una semana de cada N»), rebalanceo por calendario (`primerDiaHabil`, `calendario`), `inicio` según una media, referencia en otro ticker (`regla.referencia`, V9.1018). Es justo «la mezcla 50/50» y «el filtro de tendencia» de CARTERA_2 y CARTERA_3 | Trabaja con UNA unidad de capital (fracciones): no hay entradas de dinero. Los impuestos usan `CAPITAL_EUR = 10.000` fijo para los tramos |
| Precios de rentabilidad total | `preciosTotales` + `lib/dividendosCartera.json` | QQQ, QLD, TQQQ y SPY con los dividendos reinvertidos | Solo esos cuatro: la caché de velas no trae dividendos (las acciones de una estrategia irían sin dividendos) |
| ETF sintéticos ×2 / ×3 | `lib/etfSintetico.js`, `lib/etfSinteticos.json` | Historia desde 1999 (dot-com y 2008) para el apalancado, calibrada con QLD y TQQQ | — |
| Impuestos en caja (cálculo 2) | `simula({ impuestosEnCaja })`, `liquidaAnio`, `lib/afterTaxSim.js` (`calcImpuestoTramos`) | Plusvalías FIFO por activo, tramos del ahorro, compensación de pérdidas de 4 años, pago el primer día hábil del año siguiente con la liquidez (o vendiendo a prorrata) y liquidación final | Tramos sobre un importe fijo; sin regla de los dos meses, sin dividendos (retención), sin divisa. Es de la persona, no de cada pieza: con varias piezas hay que sumarlas |
| Costes por operación | `config.costes`, `COSTES_DEFECTO` | Comisión % con mínimo en € y media horquilla por activo | El mínimo en € solo tiene sentido con importes reales (hoy, sobre 10.000 €) |
| Medidas de una curva | `medidas`, `bajoAgua`, `bajoAguaCorto`, `compraMantiene`, `mitadMitad` | CAGR, caída máxima, CAGR / caída, peor año, tiempo bajo el agua, comprar y mantener QQQ y SPY, 50/50 | Todas suponen que no entra dinero: son medidas «por tiempo» |
| Azar de cartera | `programaAzar` (ciclos y bloques FUERA), calibración (`scripts/calibracionCartera*.js`), criterios 5–7 | La prueba de que los MOMENTOS que elige una regla son mejores que el azar | Con aportaciones el resultado depende también de cuándo entra el dinero: hay que separar las dos cosas (§4) |
| Editor visual, modo Cartera | `components/EditorCartera.js` | Pantalla para declarar la regla de una pieza de cartera, con frase, diagrama y validación | — |
| Estrategias del editor | `lib/editor/*` (intérprete, multibacktest con `definicionEditor`) | Una pieza «estrategia»: entradas y salidas de un valor sobre un universo | El multibacktest reparte un capital fijo (concentrado / compartido): no recibe dinero a mitad |
| Universo dinámico | `universo_screener` (momentum y volatilidad, N = 10, 20, 30), `lib/screener.js` | La base de una «rotación por momentum»: los N con más momentum de cada año | Selección ANUAL; una rotación mensual necesitaría su propio cálculo |
| Lotes y registro | `editor_lotes` (inmutable, huella), `lab_pruebas`, `lib/lotesLab.js` (LOTES y huellas en el código) | Declarar antes de mirar, congelar, contar cuántas cosas se probaron | Un tipo de lote para planes |
| Aportaciones reales | tabla `capital_contributions` y `computeBuyAndHold` (TradeLog, `pages/index.js`) | La idea de la referencia «lo mismo aportado al índice» ya existe para la cartera real | Es del diario, no del simulador; `capital_contributions` está sin RLS (es de antes de la autenticación) |

Conclusión: el **motor de estados de cartera** es la base natural (ya hace calendario, rebalanceo, impuestos en caja y
costes); lo que falta en todas partes es el **dinero que entra** y medir con él.

---

## 2. El formato de un plan

Un plan es datos (como la `regla` de la cartera y las definiciones del editor), con su huella y su versión del cálculo:

```js
{
  tipo: 'plan', formato: 1, calculo: 1, nombre, descripcion?,
  dinero: {
    capitalInicial: 10000,                         // €
    aportaciones: { importe: 500, frecuencia: 'mensual' | 'trimestral' | 'anual',
                    dia: 'primerDiaHabil',          // la primera vela con datos del periodo (decisión 6 del catálogo)
                    crecimientoAnual: 0 },          // % que sube la aportación cada año (0 = siempre igual)
    extraordinarias: [{ fecha, importe }],          // opcional
  },
  piezas: [                                          // de 1 a ~5; cada una es una SUBCARTERA con su dinero
    { id: 'base', tipo: 'cartera', regla: { … },   // la máquina de estados de hoy (QQQ, ETF, liquidez)
      etf: 'QLD' | 'TQQQ' | 'x2' | 'x3', peso: 0.7 },
    { id: 'satelite', tipo: 'estrategia', definicion: { … }, valores: { … },   // del editor
      universo: { tipo: 'ndx', regla: 'momentum', n: 30 }, maxPosiciones: 5, peso: 0.3 },
    // 'activo' (comprar y mantener un ticker), 'rotacion' (los N mejores por momentum cada mes) — fases posteriores
  ],
  reparto: {
    rebalanceo: { calendario: 'anual' | 'trimestral' | 'nunca', banda: 0.05 },   // entre PIEZAS; banda opcional (±5 pp)
    aportacionesA: 'pesos' | 'infraponderada',      // la aportación se reparte con los pesos o va a la pieza que más se ha quedado atrás
  },
  impuestos: { regimen: 'ES-ahorro-2026', pagoEn: 'caja' },   // el cálculo 2 de la cartera, sobre importes reales
  costes: { comisionPct, comisionMinEur, horquillaPct: { … } },
  periodo: { desde, hasta }, iniciosRodantes?: 'anual',      // ver §3
}
```

**Las piezas son subcarteras.** Cada una lleva su propio dinero y su propia lógica, y solo se tocan entre ellas al
aportar y al rebalancear (que vende en una y compra en otra: realiza plusvalías). Así cada pieza reutiliza su motor tal
cual, y el plan solo añade el reparto, los flujos y los impuestos de la persona.

**Huella**: la del JSON canónico del plan sin nombre ni descripción (como las demás). **Versión del cálculo**: `calculo: 1`
desde el principio, para poder corregir sin mover lo guardado.

---

## 3. Cómo se ejecuta

1. **Calendario común**: las velas de todos los activos que toquen las piezas (rentabilidad total donde la hay), en el
   eje de días de bolsa del QQQ. Las decisiones, como siempre: al cierre de t, ejecución a la apertura de t+1.
2. **Cada día**, en este orden:
   - las piezas deciden y operan con SU dinero (la máquina de estados mueve QQQ / ETF / liquidez; la estrategia abre y
     cierra posiciones);
   - si es día de aportación, el dinero entra a la apertura y se reparte (con los pesos o a la infraponderada); dentro de
     una pieza de cartera se invierte con los pesos de su estado actual (o queda en liquidez si el estado es «fuera»);
   - si toca rebalancear entre piezas (calendario, o banda superada al cierre de la víspera), se vende y se compra a la
     apertura, con sus costes;
   - el primer día hábil del año, el impuesto del año anterior (de TODAS las piezas juntas: una sola persona, unos
     tramos, una compensación) se paga con la liquidez y, si no basta, vendiendo a prorrata.
3. **Lotes fiscales en euros**: cada compra es un lote FIFO con su coste en euros (aportaciones incluidas); cada venta
   realiza plusvalía o pérdida. Los tramos se aplican a importes REALES (no a 10.000 € fijos).
4. **Al final**: valor bruto, y valor neto tras liquidar todo y pagar lo pendiente (como comprar y mantener).
5. **Inicios rodantes**: con aportaciones el resultado depende mucho de cuándo se empieza (empezar en 2000 o en 2009 es
   otro mundo). Además del periodo pedido, el plan se repite empezando el 1 de enero de cada año con la misma duración
   (o hasta hoy), y se da la distribución (mediana, peor, mejor).

---

## 4. Cómo se mide

Con aportaciones, el CAGR de siempre (`medidas`) deja de tener sentido: una curva que sube porque entra dinero no es una
estrategia que gana. Se dan dos rentabilidades y se explica cuál es cuál:

- **Rentabilidad ponderada por TIEMPO (TWR)**: la de la estrategia, sin el efecto de cuándo entra el dinero. Se calcula con
  un valor liquidativo por participación (las aportaciones compran participaciones al valor del día): es comparable con el
  CAGR de los lotes y de los laboratorios. Es la que juzga las REGLAS.
- **Rentabilidad ponderada por DINERO (TIR, XIRR)**: la que de verdad consigue la persona con sus flujos (aporta más cuando
  el mercado está alto o bajo, y eso cuenta). Es la que juzga el PLAN con sus aportaciones.
- **Dinero**: total aportado, valor final bruto y neto, ganancia neta, impuestos y costes pagados (por año y en total).
- **Caída máxima**:
  - en **%** sobre el valor liquidativo (la del TWR): la principal, comparable entre planes;
  - en **€** sobre el patrimonio (pico a valle): informativa y engañosa (las aportaciones tapan las caídas);
  - **frente a lo aportado**: el peor momento en que el patrimonio estuvo por debajo de lo aportado hasta ese día, y
    cuánto tiempo (lo que más se nota en el bolsillo).
- **Tiempo bajo el agua**: del valor liquidativo (`bajoAgua`) y por debajo de lo aportado.
- **Peor año** (TWR) y peor año en € (lo que se perdió ese año sumando las aportaciones).

**Referencias con los mismos flujos** (mismas fechas e importes, mismos costes e impuestos, liquidación final igual):
1. aportar lo mismo al **QQQ** (comprar y mantener, rentabilidad total);
2. al **SPY**;
3. a la **mezcla 50 % QQQ + 50 % ETF** con rebalanceo anual (la pieza base sin reglas: dice cuánto aportan las reglas);
4. **dejarlo en liquidez** (0 %): lo aportado.

Las mismas medidas para todas, y una tabla «plan frente a referencias» (TWR, TIR, valor neto, caída en %, tiempo bajo el
agua, tiempo por debajo de lo aportado), por periodo y por inicio rodante.

---

## 5. Lotes oficiales y azar

- **Lote de planes**: variantes de un plan (p. ej., 60/40 frente a 70/30; aportar con pesos frente a la infraponderada)
  declaradas y congeladas antes de mirar, como los lotes del editor (tabla `editor_lotes`, con un `tipo: 'planes'` dentro
  del formato 1, o una tabla aparte; ver §7) y cada ejecución en `lab_pruebas` (`prueba: 'plan'`).
- **Criterio** (versión nueva, como los criterios 5–7): el plan «mejora» a su referencia sin reglas (la mezcla con los
  mismos flujos) si su TWR / caída en % es mejor en el periodo total y en la mayoría de los subperiodos y de los inicios
  rodantes. Batir al QQQ se enseña, pero prueba poco (lo dice la memoria de CARTERA_1: casi cualquier cosa apalancada lo
  bate en un mercado alcista).
- **Azar**: solo tiene sentido para las piezas que ELIGEN MOMENTOS (filtro de tendencia, transiciones por condición,
  estrategias). Se reutiliza el azar de cada pieza sobre el TWR (las mismas transiciones o ciclos en fechas al azar,
  `programaAzar`), con los flujos del plan iguales en lo real y en el azar: así se mide la regla, no el calendario de las
  aportaciones. Calibración en universos sintéticos sin ventaja, como CARTERA_3 (criterio 7) y el laboratorio del editor.
  Las piezas sin decisiones (mezcla fija, comprar y mantener) van sin azar: comparativas.
- **Huellas y versiones**: plan y lote con huella; `calculo` del plan; las calibraciones, por la huella de la pieza.

---

## 6. Plan en commits pequeños

| # | Commit | Qué hace | Riesgo / prueba | Tamaño |
|---|---|---|---|---|
| P1 | Medidas con flujos | `lib/planes/medidas.js`: valor liquidativo y participaciones, TWR, TIR (XIRR por Newton con respaldo de bisección), caídas en % y en €, frente a lo aportado, tiempo bajo el agua. Puro | Casos a mano (aportación constante en un activo plano: TIR 0; un solo flujo: TIR = CAGR), sin tocar nada | pequeño |
| P2 | Referencias con flujos | Aportar lo mismo a QQQ, SPY, 50/50 y liquidez, con costes, lotes FIFO e impuestos en euros | Sin flujos, la referencia QQQ = `compraMantiene` de siempre (byte a byte en la curva normalizada) | mediano |
| P3 | Flujos en la máquina de estados | `simula` acepta `flujos` (fecha, importe) y lotes en euros; sin `flujos`, el cálculo de siempre | **Toca el motor de cartera**: CARTERA_1–3 y exploraciones byte a byte sin flujos; con un flujo inicial único = la ejecución de siempre escalada | mediano |
| P4 | Impuestos sobre importes reales | Los tramos y la compensación con euros reales (`CAPITAL_EUR` solo para el cálculo 1) | Sin flujos y con 10.000 € iniciales, el cálculo 2 de siempre | pequeño |
| P5 | Plan de una pieza | `lib/planes/plan.js`: formato, validación, huella y ejecución con una pieza de cartera + aportaciones; frase en castellano | Un plan sin aportaciones = la cartera de siempre (TWR = CAGR) | mediano |
| P6 | Pantalla, primera versión | Pestaña o modo «Planes» (en el Editor): formulario del plan, ejecución, tabla frente a referencias, gráfico de patrimonio y de lo aportado, cómo leerlo, «Copiar para Claude» | Montaje y estado; consejos (por qué TWR ≠ TIR, por qué la caída en € engaña) | grande |
| P7 | Varias piezas y rebalanceo entre ellas | Subcarteras, reparto de aportaciones, rebalanceo por calendario o banda, impuestos de la persona | Con una pieza, = P5 byte a byte | grande |
| P8 | Pieza «estrategia» | El multibacktest (concentrado / compartido) con dinero que entra, para una estrategia del editor como pieza | **Toca el motor del multibacktest**: batería 52 + 44 sin flujos; es lo más arriesgado | grande |
| P9 | Inicios rodantes | Repetir el plan desde cada año y dar la distribución | Rendimiento (muchas ejecuciones): en el servidor por tandas | mediano |
| P10 | Lotes de planes y azar | Declarar y congelar variantes de planes; criterio nuevo; azar de las piezas que eligen momentos y su calibración | Lotes y calibraciones existentes intactos | grande |
| P11 | Rotación por momentum (opcional) | Pieza «rotacion»: los N con más momentum cada mes (o cada año, con el universo de hoy) | Sesgo de supervivencia del universo (2016–2018, 14–22 % sin datos) | mediano |

**Riesgos generales**: los tres que tocan motores (P3, P8 y, en menor medida, P4) van solos y con toda la batería; el
importe mínimo de comisión y los tramos hacen que el plan dependa del tamaño (dos planes iguales con 10.000 € y con
100.000 € darán resultados distintos, y está bien: es lo real); la historia antes de 2006 solo existe para QQQ, SPY y los
sintéticos; las acciones de una estrategia van sin dividendos.

---

## 7. Preguntas

1. **Aportaciones**: ¿mensuales por defecto? ¿Importe fijo o creciendo con la inflación (o un %)? ¿Aportaciones
   extraordinarias y retiradas (p. ej., una retirada anual a partir de cierto año)?
2. **Dónde va la aportación**: ¿con los pesos objetivo, a la pieza que se ha quedado atrás (rebalancea sin vender, sin
   impuestos) o siempre a una pieza concreta? Dentro de una pieza de cartera que está «fuera» (filtro de tendencia en
   liquidez), ¿la aportación espera en liquidez o compra igualmente la parte sin apalancar?
3. **Rebalanceo entre piezas**: ¿por calendario, por bandas (±5 pp) o ambos? ¿Vale la pena el coste fiscal o prefieres
   rebalancear solo con aportaciones?
4. **Impuestos**: ¿régimen español del ahorro con los tramos de hoy para todo el periodo? ¿Hay que modelar ya la regla de
   los dos meses, la retención de dividendos o la divisa (ETF en dólares), o se deja para después? ¿Cuenta con otras
   ganancias tuyas que llenen los tramos, o el plan va solo?
5. **Piezas de la primera versión**: ¿basta con la máquina de estados (mezcla, filtro de tendencia) + comprar y mantener,
   y la estrategia del editor (P8) y la rotación (P11) después?
6. **Medida principal para el veredicto**: ¿TWR / caída en % (juzga las reglas) o TIR y valor neto (juzga el plan
   entero)? Propuesta: el veredicto por TWR / caída frente a la mezcla sin reglas, y TIR, valor neto y tiempo por debajo de
   lo aportado como información principal en pantalla.
7. **Referencias**: ¿QQQ, SPY, 50/50 y liquidez bastan? ¿Alguna cartera concreta (p. ej., un indexado MSCI World en
   euros, que no está en la caché)?
8. **Periodos**: ¿2006–hoy con datos reales, o 1999–hoy con los sintéticos (incluye 2000–2002)? ¿Inicios rodantes cada año
   y con qué duración (10 años, hasta hoy)?
9. **Dónde en la app**: ¿un modo «Planes» en la pestaña Editor (junto a Estrategia, Cartera y Lotes) o una pestaña propia?
10. **Lotes de planes**: ¿en la tabla `editor_lotes` (mismo mecanismo, `tipo: 'planes'`) o en una tabla nueva?
11. **Liquidez**: hoy al 0 % en todo (decisión tuya en CARTERA_3). En un plan con dinero esperando, ¿sigue al 0 % o se le da
    un tipo (letras, monetario)?

---

## 8. Decisiones

Respuestas de Sergi (21/10/2026) y, donde no las dio, la propuesta que se aplica por defecto (marcada «propuesta»).
Mandan sobre lo escrito antes en este documento.

1. **Aportaciones** (propuesta): mensuales por defecto, el primer día de bolsa de cada mes (también trimestrales o
   anuales), importe fijo con un crecimiento anual opcional (0 % por defecto) y aportaciones extraordinarias opcionales.
   Retiradas: más adelante.
2. **Dónde va la aportación** (Sergi): por defecto, a la pieza que más se ha quedado atrás de su peso: se rellenan los
   huecos de las infraponderadas (rebalancear COMPRANDO, sin vender ni generar impuestos); lo que sobre, con los pesos.
   Opción: repartir siempre con los pesos. Dentro de una pieza de cartera (propuesta): con los pesos del estado en que esté
   (una pieza «fuera» con 50 % QQQ + 50 % liquidez deja la mitad en liquidez); si el estado no tiene pesos, en la misma
   proporción que lo que ya tiene la pieza (y 100 % QQQ si está vacía, como la compra inicial de la cartera).
3. **Rebalanceo entre piezas** (propuesta): por defecto, ninguno aparte del de las aportaciones (que no vende); opcional,
   por calendario (anual o trimestral) y por banda (± pp sobre el peso), que sí venden y pagan impuestos.
4. **Impuestos** (Sergi): ya, la **regla de los dos meses** (una pérdida por vender un valor no se computa si se compran
   valores homogéneos dos meses antes o después; queda aplazada hasta que se vendan esos valores). Dividendos y divisa, más
   adelante, con los productos reales en euros (ETF de acumulación). Propuesta: tramos del ahorro de hoy para todo el
   periodo, el plan solo (sin otras ganancias de la persona), FIFO por valor para TODA la persona (dos piezas con QQQ
   comparten los lotes), compensación de pérdidas de 4 años y liquidación final. El impuesto de un año se paga el primer día
   de bolsa de JULIO del siguiente (se declara hasta el 30 de junio; así la ventana de dos meses de una venta de diciembre ya
   está cerrada al calcularlo). Es distinto del cálculo 2 de la cartera (enero): el motor de planes es nuevo, no lo cambia.
5. **Piezas de la primera versión** (propuesta): la máquina de estados de cartera (mezcla, filtro de tendencia, las reglas
   del editor de cartera) y comprar y mantener un activo (QQQ, SPY o el ETF). La estrategia del editor y la rotación,
   después.
6. **Veredicto** (Sergi): por TWR. La TIR se enseña siempre, solo informativa.
7. **Referencias** (propuesta): con los mismos flujos, costes e impuestos: QQQ, SPY, 50 % QQQ + 50 % ETF del plan con
   rebalanceo anual, y liquidez (lo aportado).
8. **Periodos** (propuesta): el plan declara el suyo; los inicios rodantes, el 1 de enero de cada año con una duración de
   10 años por defecto (o la que se pida).
9. **Dónde en la app**: la pantalla definitiva irá en un futuro «Builder» guiado, que se diseñará aparte. Ahora, solo el
   motor y una ruta para probarlo (`/api/plan`).
10. **Lotes de planes** (Sergi, 22/10/2026): en la tabla `editor_lotes`, con `tipo: 'planes'`, sin cambiar los lotes que ya
    existen (sus huellas tienen que salir iguales).
11. **Liquidez** (propuesta): al 0 %, como en toda la cartera (decisión de CARTERA_3).

**Cambio de plan por estas decisiones**: el motor de planes es NUEVO (`lib/planes/`) y reutiliza de la cartera sus
condiciones y su manera de decidir (al cierre, a la apertura siguiente), pero no toca `simula`: CARTERA_1–3 y las
exploraciones no se pueden mover. P3 (flujos dentro de la máquina de estados) desaparece; en su lugar, una prueba de que
el motor nuevo, sin aportaciones ni costes ni impuestos, da la MISMA curva que el laboratorio de cartera.

---

## 9. Estado: el motor (V9.1032)

Construido solo el MOTOR (decisión 9), sin pantalla:
- `lib/planes/plan.js`: formato 1, validación (errores en castellano), huella y `ejecutaPlan` (piezas de cartera y de comprar
  y mantener, aportaciones mensuales / trimestrales / anuales con crecimiento y extraordinarias, a la infraponderada o con los
  pesos, rebalanceo entre piezas por calendario y / o banda, costes reales en euros, lotes FIFO de la persona, impuestos del
  ahorro en euros pagados el primer día de bolsa de julio, regla de los dos meses, liquidación final).
- `lib/planes/medidas.js`: TWR (VL desde 1 a la primera apertura) y TWR neto (tras liquidar), TIR (XIRR), caída en % del
  VL, en € del patrimonio y frente a lo aportado (y días por debajo), tiempo bajo el agua, rentabilidad por año.
- `lib/planes/evalua.js`: las referencias con los mismos flujos (QQQ, SPY, 50/50 con el ETF del plan, liquidez), la
  comparación por TWR neto y los inicios rodantes (10 años por defecto).
- `pages/api/plan.js`: la ruta para probarlo (`POST { plan, rodantes? }`), con las velas de la caché, los dividendos y el
  sintético como CARTERA_3.

Comprobado: las 14 reglas de CARTERA_1–3 como plan de una pieza (sin aportaciones, costes ni impuestos) dan el mismo VL que
el laboratorio de cartera (diferencia relativa ≤ 4·10⁻¹⁵); comprar y mantener con aportaciones: TWR = el CAGR del activo;
a la infraponderada no vende nunca; costes con mínimo por orden; rebalanceo anual y por banda; identidad fiscal (la suma de
las plusvalías de todos los años = patrimonio + impuestos pagados − aportado, con y sin la regla de los dos meses); la regla
de los dos meses exacta con precios a mano (venta con pérdida en diciembre y recompra en enero: 225 € en 2020 y 1.275 €
aplazados a 2021); referencias y liquidez al 0 %; la ruta = el motor con los mismos datos.

Notas:
- Con aportaciones mensuales al MISMO ETF, la regla de los dos meses aplaza casi todas las pérdidas de las ventas (cada
  aportación es una compra de valores homogéneos dentro de la ventana). Lo aplazado tributa al vender lo recomprado.
- Simplificación: la regla se aplica al resultado neto de cada venta, no lote a lote.
- Lo que sobra al vender para pagar un impuesto se reparte por igual entre las piezas (en liquidez).
- Pendiente de construir: la pieza «estrategia» (el multibacktest con dinero que entra) y la rotación; dividendos y divisa
  con los productos reales en euros; el azar de los planes (P10).

**Lotes de planes (V9.1033, decisión 10)**: `lib/planes/lotes.js` y `pages/api/planes-lote.js` (congelar, listar y
ejecutar; sin pantalla). En `editor_lotes` con `tipo: 'planes'` dentro del formato 1; los lotes de estrategias (sin `tipo`)
no cambian: su validación y su huella son las de siempre, el modo Lotes del Editor no enseña los de planes y las huellas de
PRUEBA_EDITOR_1 (a2cdfd85) y RETROCESOS_1 (23c5006c), recalculadas con el código de hoy, salen iguales. Formato:
`{ formato: 1, tipo: 'planes', nombre, comun: { referencia: 'MEZCLA' | 'QQQ' | 'SPY', rodantes: null | { duracion } },
variantes: [{ id, nombre, plan }] }`; todas las variantes con el mismo dinero, periodo, impuestos y costes. Huella: la de
`{ formato, tipo, comun, [id y huella de cada plan] }`. Criterio (versión 1, la propuesta de §5): una variante MEJORA si su
TWR neto supera al de la referencia (por defecto la mezcla 50/50 sin reglas) en el periodo y, con inicios rodantes, en más
de la mitad de ellos. Cada ejecución, en `lab_pruebas` (`prueba: 'planLote'`), exploratoria. Sin azar todavía.

---

## 10. P8 · la pieza «estrategia», versión «una acción» (V9.1087; docs/builder.md §47)

Versión reducida de P8: UNA estrategia de TARJETAS sobre UNA acción, con velas diarias. Sin listas y sin el multibacktest (eso
vendrá con el «Modo de asignación» de `lib/mcAsignacion.js`). Se amplía el motor de siempre (`lib/planes/plan.js`); no hay otro.
- **Formato**: `{ id, tipo: 'estrategia', estrategia: { id, name, definition, params } (la foto de la estrategia, como la que
  congela el paso 2), activo: 'AAPL', peso, ocioso: 'LIQUIDEZ' | 'QQQ' | 'GLD' | <cualquier símbolo de la caché>,
  aportacionDentro?: 'espera' (por defecto) | 'compra', apalancamiento?: 1 | 2 | 3, velas?: 'diarias' }`. Como mucho una por
  plan. La foto va dentro del plan, así que la huella del plan cubre la estrategia y el motor sigue siendo puro.
- **Operaciones** (`lib/planes/estrategia.js`): EXACTAMENTE las del paso 1 y el paso 2: `preparaPeriodo` de `lib/pruebaAzar.js`
  (velas diarias cerradas, el calentamiento que pide la regla, el intérprete del editor con las referencias del filtro de
  mercado), las que entran en el periodo, y el precio ajustado a su vela como en «Backtest de un valor» (`ajustaPreciosAVela`).
  Precios de la acción sin dividendos, como el paso 1.
- **Dinero**: con una operación abierta, el de la pieza está en el valor; fuera, en el ocioso. Al entrar se vende el ocioso a la
  apertura y se compra el valor al precio de la entrada; al salir se vende al precio de la salida y se compra el ocioso a la
  apertura si la salida fue a la apertura o al cierre si fue dentro de la vela (un stop). Todo con costes, lotes FIFO de la
  persona, regla de los dos meses e impuesto de julio, en los dos sentidos. Las aportaciones con una operación abierta: con
  `espera`, al ocioso (entran con la siguiente compra); con `compra`, más valor a la apertura de ese día. El dinero que llega el
  mismo día de una entrada entra con ella.
- **Apalancamiento 2 o 3**: un sintético diario sobre el valor (`construyeSintetico`, con la comisión y el ajuste de los de QQQ)
  durante las operaciones; un precio p dentro de la vela t equivale a cierre del sintético en t − 1 × (1 + k × (p / cierre del
  valor en t − 1 − 1)). El ocioso, nunca apalancado.
- **Lo que devuelve**: en `ejecucion.estrategias[id]`, sus operaciones, la franja diaria `dentro` (1 dentro, 0 en el ocioso, al
  cierre) y, con detalle, la curva de la estrategia sola y los cierres del ocioso. **Referencias** nuevas (solo si hay pieza
  estrategia): `OCIOSO_LIQUIDEZ` (el mismo plan con el ocioso en liquidez) y `ACTIVO` (comprar y mantener el valor). Y
  `descorrelacion[id]` (`lib/planes/descorrelacion.js`): las 5 peores caídas de la estrategia sola, de pico a valle, con lo que
  hizo el ocioso en esa misma ventana.
- **Datos** (`lib/planes/datosServidor.js`): las velas del valor, del ocioso y de los índices de la regla, desde 6 años antes.
- **Un plan sin esta pieza**: resultado, referencias, inicios rodantes y huella idénticos byte a byte (comprobado con tres planes
  de piezas de cartera, de activo, costes, impuestos, aportaciones y rebalanceos).
- **Comprobado**: casos a mano (una operación; con comisiones; con una venta con ganancia y el impuesto en julio; con una
  aportación a mitad de operación en los dos modos); «Prueba editor EMA20» en AAPL 2016–2025 sin costes ni impuestos: las mismas
  123 operaciones que el paso 1 y TWR del plan = CAGR del paso 1 (18,757714592386 % en los dos, diferencia 0).
