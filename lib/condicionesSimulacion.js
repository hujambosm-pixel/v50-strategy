// lib/condicionesSimulacion.js — las condiciones de la simulación, en un solo sitio.
//
// QUÉ SON. Lo que define CÓMO se mide una estrategia, no QUÉ hace: el periodo, el capital inicial y la
// temporalidad de las velas. Dos de las tres vivían en columnas de la tabla `strategies` (`years` y
// `capital_ini`) y la tercera en `params.intervalo`, así que cambiar el periodo de un backtest obligaba
// a editar la estrategia, y dos estrategias podían acabar medidas en periodos distintos sin que nada lo
// avisara. Medido en el audit previo: de las 45 estrategias activas y habilitadas, una
// (`23.0 EMA20 breakouts (open)`) lleva `years = 20` frente a 5, y el ranking la comparaba con las
// otras 44 como si midiera lo mismo.
//
// LA TEMPORALIDAD ES LA EXCEPCIÓN, y se queda siendo de la estrategia. Una estrategia semanal
// ejecutada en diario no es la misma estrategia con otra ventana: es otra estrategia. Así que la
// temporalidad de la fila es su VALOR POR DEFECTO —de ahí `temporalidadDeEstrategia`— y el panel
// permite cambiarla para explorar, sin que ese cambio sea la estrategia.
//
// ESTE MÓDULO NO ARMA PETICIONES, a propósito. Las dos pantallas siguen construyendo su cuerpo como
// siempre; lo único que cambia es de dónde salen los valores. Era la forma de añadir el panel sin
// mover ni un byte de lo que viaja al servidor, y está verificado que no se mueve.

export const TEMPORALIDADES = ['diario', 'semanal']

// Los defaults son los valores que el código ya usaba cuando la fila no decía nada: `years || 5`,
// `capital_ini || 10000` e `intervalo` 'diario' cuando `params` no trae el campo (21 filas de 78 no lo
// traen).
//
// NO HAY «CAPITAL POR OPERACIÓN». El motor recibe un `allocation_pct` y la columna sigue en la tabla,
// pero en el backtest individual siempre se entra con el 100 % del capital disponible, así que no es una
// condición que haya nada que elegir: viaja como 100 fijo. En el multibacktest el reparto lo decide su
// modo de asignación —slots, pool compartido, concentrado o position sizing—, que tiene su propio panel.
export const CONDICIONES_DEFAULT = Object.freeze({
  years: 5,
  capitalIni: 10000,
  temporalidad: 'diario',
})

// La temporalidad que declara una estrategia en sus `params`. `params` es una columna de TEXTO, no
// jsonb, así que hay que parsearla a mano y un JSON roto no puede tumbar la pantalla: cae al default.
export function temporalidadDeEstrategia(estrategia) {
  try {
    const p = typeof estrategia?.params === 'string'
      ? JSON.parse(estrategia.params || '{}')
      : (estrategia?.params || {})
    return TEMPORALIDADES.includes(p.intervalo) ? p.intervalo : CONDICIONES_DEFAULT.temporalidad
  } catch (_) { return CONDICIONES_DEFAULT.temporalidad }
}

// Saneado de los campos numéricos. Cada uno cae a SU default si no es un número utilizable, sin
// invalidar el resto: un capital en blanco no debe dejar el periodo a medias.
export function saneaAnios(v) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : CONDICIONES_DEFAULT.years
}
export function saneaCapital(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : CONDICIONES_DEFAULT.capitalIni
}

// Las condiciones que declara la fila de una estrategia: `years`, `capital_ini` y la temporalidad.
//
// YA NO LA LLAMA NADIE, y se deja a propósito para que Sergi decida. El panel «Condiciones
// simulación» recuerda el capital y el periodo entre sesiones, así que cargar una estrategia ya no
// los devuelve a los de su fila —solo la temporalidad vuelve a ser la suya, con
// `temporalidadDeEstrategia`—. Las columnas `years` y `capital_ini` siguen en la tabla y las sigue
// leyendo el editor de estrategias.
export function condicionesIniciales(estrategia) {
  return {
    years: saneaAnios(estrategia?.years ?? CONDICIONES_DEFAULT.years),
    capitalIni: saneaCapital(estrategia?.capital_ini ?? CONDICIONES_DEFAULT.capitalIni),
    temporalidad: temporalidadDeEstrategia(estrategia),
  }
}

// Las condiciones del RANKING: las mismas para todas las estrategias. La temporalidad no está
// aquí a propósito, porque no es común: la pone cada estrategia con `temporalidadDeEstrategia`.
// Lee de `settings.ranking`, donde viven el resto de los ajustes del ranking, y cae a los mismos
// valores que el ranking usaba de hecho hasta ahora (5 años y 10.000 €), para que activar esto no
// cambie ningún número por sí solo.
export function condicionesDelRanking(settings) {
  const r = settings && typeof settings === 'object' ? settings.ranking : null
  return {
    years: saneaAnios(r?.rankingYears ?? CONDICIONES_DEFAULT.years),
    capitalIni: saneaCapital(r?.rankingCapital ?? CONDICIONES_DEFAULT.capitalIni),
    minTrades: (() => {
      const n = Math.round(Number(r?.minTrades))
      return Number.isFinite(n) && n >= 1 ? n : 3
    })(),
  }
}

// ── Lo que el usuario deja puesto en el panel, entre sesiones ─────────────────────────────
//
// DÓNDE VIVE. En `settings.condiciones`, con el resto de los ajustes del usuario (localStorage +
// user_settings), y no en una clave aparte: son ajustes de verdad, no un estado de interfaz como
// el plegado del panel. La fusión arreglada en 8f020e50 es lo que hace esto seguro — antes, la
// carga remota borraba de localStorage cualquier clave que la fila remota no tuviera.
//
// QUÉ SE COMPARTE Y QUÉ NO:
//   · comisiones   COMUNES a las dos pantallas. Son lo que cobra el bróker: no cambian según la
//                  pantalla desde la que mires, y tenerlas distintas solo serviría para comparar
//                  dos cosas que no son comparables.
//   · capital y periodo   POR PANTALLA. Mirar una estrategia con 10.000 € y cinco años, y una
//                  cartera con 50.000 € y dos, es lo normal.
//   · temporalidad NO SE GUARDA. Es de la estrategia, y el panel solo la cambia para explorar;
//                  al cargar una estrategia vuelve a la suya. Ver temporalidadDeEstrategia.
//
// Y lee los ajustes VIEJOS como valor inicial la primera vez: `defaultCapital` y
// `settings.comisiones` eran las secciones «Capital por defecto» y «Comisiones por defecto» de
// Ajustes, que ya no existen. Si había algo puesto ahí, no se pierde.
export function condicionesGuardadas(settings, pantalla) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const c = s.condiciones || {}
  const p = c[pantalla] || {}
  return {
    capitalIni: saneaCapital(p.capitalIni ?? s.defaultCapital ?? CONDICIONES_DEFAULT.capitalIni),
    years: saneaAnios(p.years ?? CONDICIONES_DEFAULT.years),
    modo: p.modo === 'range' ? 'range' : 'years',
    desde: typeof p.desde === 'string' ? p.desde : null,
    hasta: typeof p.hasta === 'string' ? p.hasta : null,
    // null = no hay nada guardado; comisionesDeAjustes cae entonces a las del bróker.
    comisiones: c.comisiones ?? s.comisiones ?? null,
  }
}

// Devuelven un objeto de ajustes NUEVO con lo que hay en el panel. No mutan el que reciben: quien
// llama decide cuándo guardarlo, porque guardar en cada tecla sería una escritura por pulsación.
//
// Y son DOS funciones, una por pantalla y otra para las comisiones, precisamente para poder escribir
// solo lo que el usuario ha tocado. Si fueran una sola, cambiar la comisión en el backtest individual
// escribiría también el capital y el periodo del multibacktest tal y como estén en ese momento — que,
// si los ajustes remotos aún no han llegado, son los valores por defecto. Se habrían perdido.
export function conCondiciones(settings, pantalla, { capitalIni, modo, years, desde, hasta }) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const c = { ...(s.condiciones || {}) }
  c[pantalla] = { capitalIni, modo, years, desde, hasta }
  return { ...s, condiciones: c }
}

export function conComisiones(settings, comisiones) {
  const s = settings && typeof settings === 'object' ? settings : {}
  if (!comisiones) return s
  return { ...s, condiciones: { ...(s.condiciones || {}), comisiones: { ...comisiones } } }
}

export default { TEMPORALIDADES, CONDICIONES_DEFAULT, temporalidadDeEstrategia,
                 saneaAnios, saneaCapital, condicionesIniciales, condicionesDelRanking,
                 condicionesGuardadas, conCondiciones, conComisiones }
