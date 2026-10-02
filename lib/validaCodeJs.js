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

  return { ok: true, codigo, limpiado, error: null }
}

export default validaCodeJs
