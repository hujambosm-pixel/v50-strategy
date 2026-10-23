// lib/builder/plantillas.js — las plantillas de estrategia del Builder (docs/builder.md, §3). Puro.
// Cada una es una DEFINICIÓN del editor visual de hoy (lib/editor/definicion.js, formato 1, motor 1): «Usar esta plantilla»
// abre el editor con una COPIA nueva (sin id), que se guarda como estrategia al pulsar Guardar. Una plantilla que el editor de
// hoy no puede expresar va desactivada, con el motivo (no se inventa).
// `regla`: la frase de la tarjeta, con las partes clave entre ** (negrita); `como`: la estrategia guardada que es igual;
// `aviso`: la frase corta de una desactivada (el motivo entero, en `desactivada`).
import { FORMATO, MOTOR } from '../editor/definicion'

const def = (nombre, resto) => ({ tipo: 'editor', formato: FORMATO, motor: MOTOR, nombre, parametros: { version: 1, lista: [], restricciones: [] }, stops: [], salidas: [], ...resto })
const pvm = (tipo, periodo, lado) => ({ c: 'precioVsMedia', p: { tipo, periodo, lado } })

// En blanco: la misma que la plantilla en blanco del editor (components/EditorPanel.js): cruce del cierre sobre una EMA.
export const BLANCO = () => def('', {
  parametros: { version: 1, lista: [{ nombre: 'ema', tipo: 'entero', defecto: 20, min: 2, max: 400, paso: 1, ventana: true, descripcion: 'Periodo de la EMA' }], restricciones: [] },
  entrada: { senal: { c: 'cruza', de: pvm('EMA', '$ema', 'encima') }, orden: { tipo: 'apertura' } },
  stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 8, motivo: 'stop', historialAlEntrar: true }],
  salidas: [{ tipo: 'condicion', si: { c: 'cruza', de: pvm('EMA', '$ema', 'debajo') }, precio: 'apertura', motivo: 'cruce_bajista' }],
})

// Vacía (V9.1043): lo que abre «Empezar en blanco» en el editor por tarjetas. Sin condiciones y sin protección; compra a la
// apertura siguiente. No valida hasta que se le pone una condición de compra y una forma de salir.
export const VACIA = () => def('', { entrada: { orden: { tipo: 'apertura' } } })

export const PLANTILLAS = [
  {
    id: 'retrocesos', titulo: 'Comprar retrocesos',
    frase: 'Compra cuando el cierre está sobre su SMA de 200 velas y el RSI de 2 velas baja de 10; vende cuando el cierre supera su SMA de 5 velas.',
    regla: 'Compra cuando **el cierre está sobre su SMA de 200 velas** y **el RSI de 2 velas baja de 10**; vende cuando **el cierre supera su SMA de 5 velas**.',
    como: 'Retroceso líderes RSI2',
    // La definición de «Retroceso líderes RSI2» tal cual (con su parámetro nivelRSI = 10).
    definicion: () => def('Comprar retrocesos (copia)', {
      parametros: { version: 1, lista: [{ nombre: 'nivelRSI', tipo: 'entero', defecto: 10, min: 1, max: 50, paso: 1, descripcion: 'Nivel del RSI de 2 días para entrar' }], restricciones: [] },
      entrada: { senal: { c: 'Y', de: [pvm('SMA', 200, 'encima'), { c: 'rsiNivel', p: { periodo: 2, umbral: '$nivelRSI', lado: 'debajo' } }] }, orden: { tipo: 'apertura' } },
      salidas: [{ tipo: 'condicion', si: pvm('SMA', 5, 'encima'), precio: 'apertura', motivo: 'rebote' }],
    }),
    valores: { nivelRSI: 10 },
  },
  {
    id: 'rupturas', titulo: 'Rupturas',
    frase: 'Compra cuando el cierre supera el máximo de las 100 velas anteriores con el volumen por encima de su media de 20 velas; stop del 8 %.',
    regla: 'Compra cuando **el cierre supera el máximo de las 100 velas anteriores** con **el volumen sobre su media de 20 velas**; **stop del 8 %**.',
    definicion: () => def('Rupturas (copia)', {
      entrada: { senal: { c: 'Y', de: [{ c: 'nuevoMaximo', p: { n: 100 } }, { c: 'volumenAlto', p: { k: 1, n: 20 } }] }, orden: { tipo: 'apertura' } },
      stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 8, motivo: 'stop', historialAlEntrar: true }],
    }),
    valores: {},
  },
  {
    id: 'tendencia', titulo: 'Seguir la tendencia',
    frase: 'Compra cuando la EMA de 10 velas cruza por encima de la EMA de 50 velas; vende cuando la cruza por debajo.',
    regla: 'Compra cuando **la EMA de 10 velas cruza por encima de la EMA de 50 velas**; vende cuando **la cruza por debajo**.',
    definicion: () => def('Seguir la tendencia (copia)', {
      entrada: { senal: { c: 'cruza', de: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: 10, tipoLenta: 'EMA', periodoLenta: 50, lado: 'encima' } } }, orden: { tipo: 'apertura' } },
      salidas: [{ tipo: 'condicion', si: { c: 'cruza', de: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: 10, tipoLenta: 'EMA', periodoLenta: 50, lado: 'debajo' } } }, precio: 'apertura', motivo: 'cruce_bajista' }],
    }),
    valores: {},
  },
  {
    id: 'filtro', titulo: 'Filtro de mercado',
    frase: 'Solo opera cuando el QQQ cierra sobre su SMA 200; se añade a otra estrategia.',
    regla: 'Solo opera cuando **el QQQ cierra sobre su SMA 200**; se añade a otra estrategia.',
    aviso: 'Aún no disponible: hoy se activa dentro de tu estrategia, en «Filtro de mercado».',
    definicion: null,
    desactivada: 'El editor de hoy pone el filtro de mercado DENTRO de una estrategia, no como una pieza suelta que se añada a otra. Mientras tanto: abre tu estrategia en el editor y activa «Filtro de mercado» con QQQ y su SMA 200.',
  },
]
