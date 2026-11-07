#!/usr/bin/env bash
# scripts/comprobaciones/comunes.sh — las comprobaciones comunes de cada commit (docs/builder.md, §22): guardián, build, batería
# V9.949 (52 + 44) byte a byte, huellas de las pruebas del
# editor; las pruebas sintéticas del motor (sinteticas.js, V9.1079); la huella del azar re-simulado (azar-reglas.js, §43); la prueba contra el azar del paso 2 (prueba-azar.js, §44); la pieza «estrategia» de los planes (planes-estrategia.js, §47); la pantalla del paso 3 (planes-pantalla.js, §53–§55, y planes-montaje.js, §56, con estado y efectos sobre un DOM mínimo); la pantalla «Tesis» (tesis.js, tesis-enlaces.js y tesisArchivos.js, docs/tesis.md); las piezas del panel izquierdo del Backtesting (backtesting-panel.js, §76); y sus resultados, «La cartera por dentro» (backtesting-resultados.js, §78), con su estado y cálculos en un hook (backtesting-hook.js, §82) y la petición a /api/multibacktest (peticion-mc.js, §83); y «Una lista» en el bloque del plan (plan-lista.js, §80), con su pestaña «La cartera por dentro» (plan-por-dentro.js, §84) y «Tu dinero» con lista y su prueba de oro (plan-tu-dinero-lista.js, §89). Compara el árbol de trabajo con una copia de la versión anterior (por defecto HEAD) hecha con git archive.
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
paso plan-por-dentro node "$DIR/plan-por-dentro.js" < /dev/null
tail -1 "$SAL/plan-por-dentro.txt"
paso plan-tu-dinero-lista node "$DIR/plan-tu-dinero-lista.js" < /dev/null
tail -1 "$SAL/plan-tu-dinero-lista.txt"
echo "comparado con $REF · salidas en scripts/comprobaciones/salida/ · fallos: $fallos"
exit $([ $fallos -eq 0 ] && echo 0 || echo 1)
