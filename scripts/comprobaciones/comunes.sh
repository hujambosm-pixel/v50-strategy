#!/usr/bin/env bash
# scripts/comprobaciones/comunes.sh — las comprobaciones comunes de cada commit (docs/builder.md, §22): guardián, build, batería
# V9.949 (52 + 44) byte a byte, CARTERA_1–3 y exploraciones idénticas, huellas de LOTE_1–3 / CARTERA_1–3 y de las pruebas del
# editor; las pruebas sintéticas del motor (sinteticas.js, V9.1079); y la huella del azar re-simulado (azar-reglas.js, §43). Compara el árbol de trabajo con una copia de la versión anterior (por defecto HEAD) hecha con git archive.
# Uso, desde cualquier sitio:   bash scripts/comprobaciones/comunes.sh [referencia de git]      (unos 15 minutos)
# Necesita: npm install; una copia en backups/ (npm run backup); las fotos de precios en scripts/comprobaciones/datos/ (o en la
# carpeta de COMPROBACIONES_DATOS); y, para las huellas del editor, «supabase login» (solo lectura). Termina en 0 si todo va bien.
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
paso cartera node "$DIR/cartera.js" < /dev/null
tail -1 "$SAL/cartera.txt"
paso lotes node "$DIR/lotes.js" < /dev/null
echo "lotes y carteras iguales: $(grep -c ' igual ' "$SAL/lotes.txt") de $(grep -c 'igual\|DISTINTA' "$SAL/lotes.txt")"
paso huellas node "$DIR/huellas.js" < /dev/null
cat "$SAL/huellas.txt"
paso sinteticas node "$DIR/sinteticas.js" < /dev/null
tail -1 "$SAL/sinteticas.txt"
paso azar-reglas node "$DIR/azar-reglas.js" < /dev/null
tail -1 "$SAL/azar-reglas.txt"
echo "comparado con $REF · salidas en scripts/comprobaciones/salida/ · fallos: $fallos"
exit $([ $fallos -eq 0 ] && echo 0 || echo 1)
