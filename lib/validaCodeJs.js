// lib/validaCodeJs.js — valida el code_js de una estrategia ANTES de guardarlo.
//
// POR QUÉ EXISTE. El 27 de septiembre se guardó una estrategia con el código pegado dentro de una valla
// de Markdown (```javascript … ```), tal como lo devuelve un asistente. JavaScript no lee eso como una
// valla: ``` son dos plantillas seguidas, es decir una cadena vacía etiquetando a la siguiente, o sea
// una LLAMADA a "". El sandbox de pages/api/datos.js lanzaba `TypeError: "" is not a function`, la ruta
// devolvía 500, y el cliente lo apuntaba como «fallo de descarga»: cuatro días buscando un problema de
// red que no existía. Un carácter en la base de datos, un diagnóstico entero perdido.
//
// QUÉ HACE. Dos cosas, y solo dos:
//   1. Si el texto viene envuelto en una valla, la quita y devuelve el código limpio.
//   2. Lo compila con EXACTAMENTE el mismo mecanismo que el sandbox real y comprueba que define `run`.
//
// QUÉ NO HACE. No ejecuta `run`, no toca la red ni los datos, y no juzga la lógica de la estrategia:
// compilar no es funcionar. Solo descarta lo que es imposible que funcione.

// Los cinco ayudantes que el sandbox inyecta (ver pages/api/datos.js y runCodeJsAsset). Aquí se pasan
// como funciones vacías: compilar no ejecuta nada, pero la firma tiene que coincidir para que un código
// que los declare en su cabecera no falle por el número de argumentos.
const AYUDANTES = ['calcEMA', 'calcSMA', 'calcRSI', 'calcATR', 'calcMACD']

// Quita la valla de Markdown si el texto está envuelto en una. Solo cuando la apertura está en la
// PRIMERA línea y el cierre en la última: una valla a medias es más probable que sea código con una
// plantilla dentro, y ahí no se toca nada.
export function quitaValla(texto) {
  const t = String(texto == null ? '' : texto)
  const lineas = t.split('\n')
  // Primera y última línea con contenido
  let i = 0; while (i < lineas.length && lineas[i].trim() === '') i++
  let j = lineas.length - 1; while (j >= 0 && lineas[j].trim() === '') j--
  if (i >= j) return { codigo: t, limpiado: false }
  const abre = /^```[a-zA-Z]*$/.test(lineas[i].trim())
  const cierra = lineas[j].trim() === '```'
  if (!abre || !cierra) return { codigo: t, limpiado: false }
  // Se conserva el salto final, como lo tenía el original
  return { codigo: lineas.slice(i + 1, j).join('\n') + '\n', limpiado: true }
}

// Devuelve { ok, codigo, error, limpiado }.
//   codigo  — el texto ya sin valla, que es lo que hay que guardar
//   error   — mensaje en español, listo para mostrar, con el error del compilador dentro
export function validaCodeJs(texto) {
  const { codigo, limpiado } = quitaValla(texto)

  if (!codigo.trim()) {
    return { ok: false, codigo, limpiado, error: 'El código está vacío. Una estrategia necesita una función run(bars, params).' }
  }

  // MISMO envoltorio que el sandbox: "use strict" + el código + `return run`. Si aquí compila, allí
  // compila; si aquí no, allí tampoco, y es mejor saberlo antes de guardarlo.
  const envuelto = '"use strict";\n' + codigo + '\nreturn run;'
  let devuelve
  try {
    const crea = new Function(...AYUDANTES, envuelto)
    devuelve = crea(...AYUDANTES.map(() => () => []))
  } catch (e) {
    const msg = (e && e.message) ? e.message : 'error desconocido'
    // El mensaje del compilador va entero: sin él, «no compila» no le dice nada a nadie.
    return { ok: false, codigo, limpiado,
      error: 'El código no compila: ' + msg + '. Revísalo antes de guardar.' }
  }

  if (typeof devuelve !== 'function') {
    return { ok: false, codigo, limpiado,
      error: 'El código compila pero no define una función run(bars, params)'
        + (devuelve === undefined ? '.' : ' (run es ' + typeof devuelve + ').') }
  }

  return { ok: true, codigo, limpiado, error: null, avisos: avisosCodeJs(codigo) }
}

// ── Avisos (no bloquean) ─────────────────────────────────────────────────────────────────────────────
// Patrones que suelen romper la regla de la vela cerrada: una decisión se toma con la vela CERRADA y actúa
// desde la siguiente. Son AVISOS, no errores: el código se guarda igual, porque un patrón no prueba nada
// por sí solo (el guardián, npm run guardian, es quien lo comprueba ejecutando la estrategia). Se buscan en
// el texto con expresiones regulares: pueden saltar en un comentario y no ven lo que se construye de otra
// forma.
//   1. exitPrice al cierre de la vela que decide la salida (b.close o bPrev.close).
//   2. El valor de un indicador de la vela EN CURSO —ema10[i], atr[i]— comparado con el máximo o el mínimo
//      de esa misma vela: ese valor incluye su cierre, que todavía no existe cuando el precio toca el nivel.
const ARRAYS_DE_PRECIO = new Set(['bars', 'barras', 'data', 'closes', 'highs', 'lows', 'opens', 'volumes'])
export function avisosCodeJs(codigo) {
  const avisos = []
  const lineas = String(codigo == null ? '' : codigo).split('\n')
  lineas.forEach((l, k) => {
    const linea = k + 1
    for (const m of l.matchAll(/exitPrice\s*[:=]\s*(bPrev|b)\.close\b/g)) {
      avisos.push({ linea, texto: `Línea ${linea}: exitPrice usa ${m[1]}.close, el cierre de la vela que decide la salida. Con la regla de la vela cerrada, la salida se ejecuta en la vela siguiente (su apertura o un nivel).` })
    }
    const vistos = new Set()
    for (const re of [/\bb\.(high|low)\s*(?:<=|>=|<|>)\s*([A-Za-z_$][\w$]*)\[\s*i\s*\]/g, /([A-Za-z_$][\w$]*)\[\s*i\s*\]\s*(?:<=|>=|<|>)\s*b\.(high|low)\b/g]) {
      for (const m of l.matchAll(re)) {
        const [lado, nombre] = m[1] === 'high' || m[1] === 'low' ? [m[1], m[2]] : [m[2], m[1]]
        if (ARRAYS_DE_PRECIO.has(nombre) || vistos.has(nombre)) continue
        vistos.add(nombre)
        avisos.push({ linea, texto: `Línea ${linea}: ${nombre}[i] es el valor de la vela en curso (incluye su cierre) y se compara con b.${lado} de esa misma vela. Para un nivel que actúe dentro de la vela, usa ${nombre}[i - 1].` })
      }
    }
  })
  return avisos
}

export default validaCodeJs
