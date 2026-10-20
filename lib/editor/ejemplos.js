// lib/editor/ejemplos.js — dos estrategias de siempre escritas como DEFINICIONES del editor (formato 1). Son la prueba de
// aceptación del intérprete (docs/editor-visual.md, decisión 3: sus operaciones, byte a byte las mismas que las de su
// code_js) y las plantillas de la pantalla. Reproducen los code_js con sus parámetros declarados (la reentrada de la 1 V50
// no está en el motor 1: su definición no la declara).

const P_EMA_R = { nombre: 'emaR', tipo: 'entero', defecto: 10, min: 2, max: 100, paso: 1, ventana: true, sugerido: { min: 5, max: 20, paso: 1 }, descripcion: 'Periodo de la EMA rápida' }
const P_EMA_L = { nombre: 'emaL', tipo: 'entero', defecto: 11, min: 3, max: 200, paso: 1, ventana: true, sugerido: { min: 8, max: 40, paso: 2 }, descripcion: 'Periodo de la EMA lenta' }
const mediaR = (lado) => ({ c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$emaR', lado } })
const cruceEmas = (lado) => ({ c: 'cruza', de: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: '$emaR', tipoLenta: 'EMA', periodoLenta: '$emaL', lado, comparacion: '≥' } } })

// 1 V50 EMA10/11: el cruce alcista de las EMAs (rápida ≥ lenta tras estar por debajo) pone una orden de compra stop en el
// máximo de la vela del cruce, que solo baja y se cancela con un cierre bajo la EMA rápida. Stop técnico (el menor entre la
// EMA rápida y el mínimo de la vela que fija la orden), que se retira cuando el trailing lo supera; trailing al mínimo de
// cada vela que cierra bajo la EMA rápida (solo por encima de la entrada con sinPerdidas); salida de emergencia a la
// apertura con el cruce bajista (con sinPerdidas).
export const DEF_V50 = Object.freeze({
  tipo: 'editor', formato: 1, motor: 1, nombre: '1 V50 EMA10/11 (editor)',
  parametros: {
    version: 1,
    lista: [P_EMA_R, P_EMA_L,
      { nombre: 'sinPerdidas', tipo: 'sino', defecto: true, descripcion: 'El trailing solo sube a mínimos por encima de la entrada y, si la EMA rápida cruza bajo la lenta, sale en la apertura siguiente' },
      { nombre: 'stopLoss', tipo: 'opcion', defecto: 'tecnico_ema', opciones: ['tecnico_ema', 'ninguno'], descripcion: 'tecnico_ema: stop técnico inicial; ninguno: sin él, solo el trailing' }],
    restricciones: [{ tipo: 'menor', a: 'emaR', b: 'emaL' }],
  },
  entrada: {
    senal: cruceEmas('encima'),
    orden: { tipo: 'stop', nivel: { campo: 'high', velas: 1 }, ajuste: 'soloBaja' },
    cancelar: mediaR('debajo'),
    revisaSalidasEnLaVelaDeEntrada: true,
  },
  stops: [
    { id: 'tecnico', tipo: 'nivel', de: [{ media: { tipo: 'EMA', periodo: '$emaR' } }, { campo: 'low' }], motivo: 'stop',
      activa: { param: 'stopLoss', igual: 'tecnico_ema' }, historialAlEntrar: true, retiraSiSupera: 'trailing' },
    { id: 'trailing', tipo: 'trailing', si: mediaR('debajo'), nivel: { campo: 'low', velas: 1 }, soloSobreEntrada: '$sinPerdidas',
      historial: 'cadaVez', fechaHistorial: 'vela', motivo: 'trailing_exit' },
  ],
  salidas: [
    { tipo: 'condicion', si: cruceEmas('debajo'), precio: 'apertura', motivo: 'stop_emergencia', activa: '$sinPerdidas' },
  ],
})

// 23 EMA20 breakouts (semanal): una vela que cierra sobre la EMA pone una orden de compra stop en su máximo, que solo baja
// y se cancela con un cierre bajo la EMA. Sin stop inicial; el stop sube al mínimo de cada vela que cierra bajo la EMA (si
// es más alto) y el día de la entrada no se mira.
export const DEF_23 = Object.freeze({
  tipo: 'editor', formato: 1, motor: 1, nombre: '23 EMA20 breakouts (editor)',
  parametros: {
    version: 1,
    lista: [{ nombre: 'ema', tipo: 'entero', defecto: 20, min: 2, max: 200, paso: 1, ventana: true, sugerido: { min: 5, max: 50, paso: 1 }, descripcion: 'Periodo de la EMA de la ruptura' }],
    alias: { ema: ['emaPeriod'] },
  },
  entrada: {
    senal: { c: 'NO', de: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$ema', lado: 'debajo' } } },
    orden: { tipo: 'stop', nivel: { campo: 'high', velas: 1 }, ajuste: 'soloBaja' },
    cancelar: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$ema', lado: 'debajo' } },
    revisaSalidasEnLaVelaDeEntrada: false,
  },
  stops: [
    { id: 'trailing', tipo: 'trailing', si: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$ema', lado: 'debajo' } }, nivel: { campo: 'low', velas: 1 },
      historial: 'siSube', fechaHistorial: 'anterior', motivo: 'stop' },
  ],
  salidas: [],
})

export const EJEMPLOS = Object.freeze({ v50: DEF_V50, e23: DEF_23 })
