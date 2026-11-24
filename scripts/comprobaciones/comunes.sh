#!/usr/bin/env bash
# scripts/comprobaciones/comunes.sh — las comprobaciones comunes de cada commit (docs/builder.md, §22): guardián, build, batería
# V9.949 (52 + 44) byte a byte, huellas de las pruebas del
# editor; las pruebas sintéticas del motor (sinteticas.js, V9.1079); la huella del azar re-simulado (azar-reglas.js, §43); la prueba contra el azar del paso 2 (prueba-azar.js, §44); la pieza «estrategia» de los planes (planes-estrategia.js, §47); la pantalla del paso 3 (planes-pantalla.js, §53–§55, y planes-montaje.js, §56, con estado y efectos sobre un DOM mínimo); la pantalla «Tesis» (tesis.js, tesis-enlaces.js y tesisArchivos.js, docs/tesis.md); las piezas del panel izquierdo del Backtesting (backtesting-panel.js, §76); y sus resultados, «La cartera por dentro» (backtesting-resultados.js, §78), con su estado y cálculos en un hook (backtesting-hook.js, §82) y la petición a /api/multibacktest (peticion-mc.js, §83); y «Una lista» en el bloque del plan (plan-lista.js, §80), con su pestaña «La cartera por dentro» (plan-por-dentro.js, §84) y «Tu dinero» con lista y su prueba de oro (plan-tu-dinero-lista.js, §89); y el screener (screener.js y screener-senales.js, docs/screener.md); y el motor de rotación (rotacion.js, §125); y «Comparar planes» (comparar-planes.js, §128); y las velas del plan, diarias o semanales (plan-velas.js, §145); y las filas de filtro extra del intérprete (filtros-extra.js, §149) y los filtros del plan (plan-filtros.js, §150) con su pantalla (plan-filtros-pantalla.js, §152); y los planes con varios bloques (plan-bloques.js, §185); y las condiciones «Caída desde el máximo histórico» y «Primera vela del mes, trimestre o año» (condiciones-nuevas.js, §192); y el bloque «Con pesos» del plan (plan-pesos.js, §193) con sus reglas (plan-pesos-reglas.js, §194) y junto a otros bloques (plan-pesos-bloques.js, §196) y su pantalla (plan-pesos-pantalla.js, §197), con sus reglas (plan-reglas-pantalla.js, §199) y lo que se ve de ellas en «Tu dinero» y «Detalle» (plan-reglas-detalle.js, §200); y el dinero ocioso con su propia regla (plan-ocioso-regla.js, §203) y su pantalla (plan-ocioso-regla-pantalla.js, §204); y las cuentas de los dibujos sobre el gráfico (dibujos.js, §207) y su pantalla (dibujos-pantalla.js, §208); y la ventana «Indicadores» del gráfico (indicadores-ventana.js, §212); y el motor de las alertas (alertas.js, §216); y el motor del Replay (replay.js, §225) y su modo en el gráfico (replay-grafico.js, §226) y operar (replay-operar.js, §228), marcando la orden en el gráfico (replay-marcar.js, §229) y saltando a la señal (replay-senales.js, §231), y guardar y abrir (replay-guardar.js, §232); y el motor de la «Condición con pasos» (con-pasos.js, §243) y su pantalla en la señal del Replay (con-pasos-pantalla.js, §244). Compara el árbol de trabajo con una copia de la versión anterior (por defecto HEAD) hecha con git archive.
# Uso, desde cualquier sitio:   bash scripts/comprobaciones/comunes.sh [referencia de git]      (unos 15 minutos)
# Necesita: npm install; una copia en backups/ (npm run backup); las fotos de precios en scripts/comprobaciones/datos/ (o en la
# carpeta de COMPROBACIONES_DATOS); y, para el guardián y las políticas, «supabase login» (solo lectura). Termina en 0 si todo va bien.
set -u
REF=${1:-HEAD}
DIR=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$DIR/../.." && pwd)
SAL="$DIR/salida"
VIEJO="$DIR/.viejo"
mkdir -p "$SAL"
rm -rf "$VIEJO" && mkdir -p "$VIEJO" && git -C "$RAIZ" archive "$REF" | tar -x -C "$VIEJO" || { echo "no se pudo copiar $REF"; exit 2; }
export NODE_PATH="$RAIZ/node_modules" VIEJO
cd "$RAIZ"
fallos=0
paso() { local nombre=$1; shift; "$@" > "$SAL/$nombre.txt" 2>&1; local c=$?; [ $c -ne 0 ] && fallos=$((fallos + 1)); echo "$nombre: código $c"; }
paso guardian npm run guardian
tail -2 "$SAL/guardian.txt" | head -1
paso build npm run build
paso bateria node "$DIR/bateria.js" < /dev/null
tail -1 "$SAL/bateria.txt"
paso huellas node "$DIR/huellas.js" < /dev/null
cat "$SAL/huellas.txt"
paso sinteticas node "$DIR/sinteticas.js" < /dev/null
tail -1 "$SAL/sinteticas.txt"
paso azar-reglas node "$DIR/azar-reglas.js" < /dev/null
tail -1 "$SAL/azar-reglas.txt"
paso prueba-azar node "$DIR/prueba-azar.js" < /dev/null
tail -1 "$SAL/prueba-azar.txt"
paso planes-estrategia node "$DIR/planes-estrategia.js" < /dev/null
tail -1 "$SAL/planes-estrategia.txt"
paso planes-pantalla node "$DIR/planes-pantalla.js" < /dev/null
tail -1 "$SAL/planes-pantalla.txt"
paso planes-montaje node "$DIR/planes-montaje.js" < /dev/null
tail -1 "$SAL/planes-montaje.txt"
paso version-paso2 node "$DIR/version-paso2.js" < /dev/null
tail -1 "$SAL/version-paso2.txt"
paso azar-graficos node "$DIR/azar-graficos.js" < /dev/null
tail -1 "$SAL/azar-graficos.txt"
paso borrar node "$DIR/borrar.js" < /dev/null
tail -1 "$SAL/borrar.txt"
paso catalogo node "$DIR/catalogo.js" < /dev/null
tail -1 "$SAL/catalogo.txt"
paso condiciones-nuevas node "$DIR/condiciones-nuevas.js" < /dev/null
tail -1 "$SAL/condiciones-nuevas.txt"
paso tesis-enlaces node "$DIR/tesis-enlaces.js" < /dev/null
tail -1 "$SAL/tesis-enlaces.txt"
paso tesis node "$DIR/tesis.js" < /dev/null
tail -1 "$SAL/tesis.txt"
paso tesisArchivos node "$DIR/tesisArchivos.js" < /dev/null
tail -1 "$SAL/tesisArchivos.txt"
paso backtesting-panel node "$DIR/backtesting-panel.js" < /dev/null
tail -1 "$SAL/backtesting-panel.txt"
paso backtesting-resultados node "$DIR/backtesting-resultados.js" < /dev/null
tail -1 "$SAL/backtesting-resultados.txt"
paso backtesting-hook node "$DIR/backtesting-hook.js" < /dev/null
tail -1 "$SAL/backtesting-hook.txt"
paso peticion-mc node "$DIR/peticion-mc.js" < /dev/null
tail -1 "$SAL/peticion-mc.txt"
paso plan-lista node "$DIR/plan-lista.js" < /dev/null
tail -1 "$SAL/plan-lista.txt"
paso plan-velas node "$DIR/plan-velas.js" < /dev/null
tail -1 "$SAL/plan-velas.txt"
paso plan-por-dentro node "$DIR/plan-por-dentro.js" < /dev/null
tail -1 "$SAL/plan-por-dentro.txt"
paso plan-tu-dinero-lista node "$DIR/plan-tu-dinero-lista.js" < /dev/null
tail -1 "$SAL/plan-tu-dinero-lista.txt"
paso screener node "$DIR/screener.js" < /dev/null
tail -1 "$SAL/screener.txt"
paso screener-senales node "$DIR/screener-senales.js" < /dev/null
tail -1 "$SAL/screener-senales.txt"
paso rotacion node "$DIR/rotacion.js" < /dev/null
tail -1 "$SAL/rotacion.txt"
paso comparar-planes node "$DIR/comparar-planes.js" < /dev/null
tail -1 "$SAL/comparar-planes.txt"
paso filtros-extra node "$DIR/filtros-extra.js" < /dev/null
tail -1 "$SAL/filtros-extra.txt"
paso plan-filtros node "$DIR/plan-filtros.js" < /dev/null
tail -1 "$SAL/plan-filtros.txt"
paso plan-filtros-pantalla node "$DIR/plan-filtros-pantalla.js" < /dev/null
tail -1 "$SAL/plan-filtros-pantalla.txt"
paso plan-detalle node "$DIR/plan-detalle.js" < /dev/null
tail -1 "$SAL/plan-detalle.txt"
paso plan-bloques node "$DIR/plan-bloques.js" < /dev/null
tail -1 "$SAL/plan-bloques.txt"
paso plan-pesos node "$DIR/plan-pesos.js" < /dev/null
tail -1 "$SAL/plan-pesos.txt"
paso plan-pesos-reglas node "$DIR/plan-pesos-reglas.js" < /dev/null
tail -1 "$SAL/plan-pesos-reglas.txt"
paso plan-pesos-bloques node "$DIR/plan-pesos-bloques.js" < /dev/null
tail -1 "$SAL/plan-pesos-bloques.txt"
paso plan-pesos-pantalla node "$DIR/plan-pesos-pantalla.js" < /dev/null
tail -1 "$SAL/plan-pesos-pantalla.txt"
paso plan-reglas-pantalla node "$DIR/plan-reglas-pantalla.js" < /dev/null
tail -1 "$SAL/plan-reglas-pantalla.txt"
paso plan-reglas-detalle node "$DIR/plan-reglas-detalle.js" < /dev/null
tail -1 "$SAL/plan-reglas-detalle.txt"
paso plan-ocioso-regla node "$DIR/plan-ocioso-regla.js" < /dev/null
tail -1 "$SAL/plan-ocioso-regla.txt"
paso plan-ocioso-regla-pantalla node "$DIR/plan-ocioso-regla-pantalla.js" < /dev/null
tail -1 "$SAL/plan-ocioso-regla-pantalla.txt"
paso dibujos node "$DIR/dibujos.js" < /dev/null
tail -1 "$SAL/dibujos.txt"
paso dibujos-pantalla node "$DIR/dibujos-pantalla.js" < /dev/null
tail -1 "$SAL/dibujos-pantalla.txt"
paso indicadores-ventana node "$DIR/indicadores-ventana.js" < /dev/null
tail -1 "$SAL/indicadores-ventana.txt"
paso alertas node "$DIR/alertas.js" < /dev/null
paso replay node "$DIR/replay.js" < /dev/null
paso replay-grafico node "$DIR/replay-grafico.js" < /dev/null
paso replay-operar node "$DIR/replay-operar.js" < /dev/null
paso replay-marcar node "$DIR/replay-marcar.js" < /dev/null
paso replay-senales node "$DIR/replay-senales.js" < /dev/null
paso replay-guardar node "$DIR/replay-guardar.js" < /dev/null
paso con-pasos node "$DIR/con-pasos.js" < /dev/null
paso con-pasos-pantalla node "$DIR/con-pasos-pantalla.js" < /dev/null
tail -1 "$SAL/alertas.txt"
echo "comparado con $REF · salidas en scripts/comprobaciones/salida/ · fallos: $fallos"
exit $([ $fallos -eq 0 ] && echo 0 || echo 1)
