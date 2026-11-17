// lib/builder/estilo.js — el ESTILO del Builder (el boceto aprobado; docs/builder.md, tanda 1b), en un solo sitio para
// poder reutilizarlo después en el Laboratorio y el Lab. cartera. Solo lo usa el Builder: el resto de la app no cambia.
// Tokens (colores, letra, radios) y estilos ya montados (tarjeta, cabecera, botones, chips de estado).
//
// §176 (☀/☾ en el Builder, parte 1): los colores son VARIABLES CSS con su color de antes de reserva: «var(--bd-fondo, #0f1419)».
// Donde nadie pone las variables (Tesis y lo demás que usa B) se ve exactamente igual que antes. El Builder las pone en su
// pantalla con varsBuilder(tema) (components/BuilderPanel.js).
// §177: los tonos son los del screener (lib/temas.js): oscuro «Finviz» y claro «Papel gris» (decisión de Sergi, 17/11).
import { PALETAS, temaValido } from '../temas'

// Los colores de antes (la reserva de cada variable). La clave es el nombre de la variable: --bd-<clave>.
const OSCURO = Object.freeze({
  fondo: '#0f1419', tarjeta: '#161f29', cabecera: '#1b2836', borde: '#263040',
  texto: '#e6edf3', titulo: '#ffffff', secundario: '#9fb0c3', apagado: '#8b9bad', resultado: '#d6dfe8',
  verde: '#3fb950', sobreVerde: '#06210f', enlace: '#79c0ff',
  siguienteFondo: '#13283f', siguienteBorde: '#2d5b8c',
  pasoFondo: '#14301f', pasoBorde: '#2f7d45',
  boton: '#263040', desactivado: '#59636e', sobreDesactivado: '#1c2128', botonVerde: '#3fb950', botonVerdeTexto: '#06210f',
  chipSupera: '#14301f', chipSuperaTexto: '#56d364', chipNoSupera: '#3b1d22', chipNoSuperaTexto: '#ff8b8b',
  chipBorrador: '#3a3220', chipBorradorTexto: '#f2cc60', chipNeutro: '#263040', chipNeutroTexto: '#c9d4df',
  cVerde: '#7ee2a0', cRojo: '#ff8b8b', cAmarillo: '#f2cc60', cAzul: '#58a6ff', cMorado: '#d2a8ff', cMoradoCaja: '#a371f7', cNaranja: '#f0883e', cNaranjaVivo: '#ff9f43', cCian: '#56d4dd',
  cDorado: '#e3b341', cAzulClaro: '#a5d6ff', cRojoClaro: '#ffa198', cVerdeClaro: '#b4f1b4', cGrisLinea: '#6e7681', cGrisClaro: '#d0d7de', cGris: '#4b5868', cRojoFuerte: '#f85149',
  cRejilla: '#1b2430', cEjeCero: '#3a4656', cMarca: '#5a4a12', cFondoNo: '#3b1d22', cHover: '#1f3350', cFondoAmpliado: 'rgba(8,12,18,0.97)',
  cVerdeAzulado: '#3dd6c3', cGrisSuave: '#9fb0c3', cSi: '#56d364', cNo: '#ff9b9b', cCajaVerde: '#14301f', cAvisoFondo: '#3a3220', cVerdeVivo: '#3fb950', sombra: 'rgba(0,0,0,0.45)',
  cCambioBorde: '#d9a53a', cCambioTexto: '#e0c27a', cAzulFranja: '#8db8ff', cCifraSube: '#00e5a0', cCifraBaja: '#ff4d6d', cCifraCuenta: '#ffd166',
})
// Los dos tonos de la app (lib/temas.js). botonVerdeTexto: el texto del botón verde (en lib/temas.js, sobreVerde).
export const TEMAS_BUILDER = Object.freeze({ oscuro: { ...PALETAS.oscuro, botonVerdeTexto: PALETAS.oscuro.sobreVerde }, claro: { ...PALETAS.claro, botonVerdeTexto: PALETAS.claro.sobreVerde } })
// Las variables CSS de un tono, para el style del contenedor de la pantalla: { '--bd-fondo': '#22262f', … }.
export const varsBuilder = (t) => Object.fromEntries(Object.entries(TEMAS_BUILDER[temaValido(t)]).map(([k, v]) => ['--bd-' + k, v]))
const c = (k) => `var(--bd-${k}, ${OSCURO[k]})`

export const B = Object.freeze({
  letra: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  base: 14,
  fondo: c('fondo'), tarjeta: c('tarjeta'), cabecera: c('cabecera'), borde: c('borde'),
  texto: c('texto'), titulo: c('titulo'), secundario: c('secundario'), apagado: c('apagado'), resultado: c('resultado'),
  verde: c('verde'), sobreVerde: c('sobreVerde'), enlace: c('enlace'),
  siguienteFondo: c('siguienteFondo'), siguienteBorde: c('siguienteBorde'),
  pasoFondo: c('pasoFondo'), pasoBorde: c('pasoBorde'),
  radioTarjeta: 12, radioBoton: 8, aire: 16,
})

// §179: el COLOR REAL de una variable, para lo que no entiende «var(…)»: los gráficos de lightweight-charts (dibujan en canvas y
// fallan con «Cannot parse color»). Lee la variable en el contenedor del tono (el de la pantalla del Builder) o, sin él o fuera del
// navegador, da el color de reserva. Un color normal se devuelve tal cual.
export const colorReal = (v, el = null) => {
  const m = typeof v === 'string' && v.match(/^var\((--[\w-]+)\s*,\s*(.+)\)$/)
  if (!m) return v
  try { const n = el || (typeof document !== 'undefined' ? document.querySelector('[data-tema-builder]') : null); const x = n && getComputedStyle(n).getPropertyValue(m[1]).trim(); if (x) return x } catch (_) {}
  return m[2].trim()
}

// §178: los colores con significado (cifras que suman o restan, avisos, líneas de los gráficos), también como variables.
export const C = Object.freeze({
  verde: c('cVerde'), rojo: c('cRojo'), amarillo: c('cAmarillo'), azul: c('cAzul'), morado: c('cMorado'), moradoCaja: c('cMoradoCaja'), naranja: c('cNaranja'), naranjaVivo: c('cNaranjaVivo'), cian: c('cCian'),
  dorado: c('cDorado'), azulClaro: c('cAzulClaro'), rojoClaro: c('cRojoClaro'), verdeClaro: c('cVerdeClaro'), grisLinea: c('cGrisLinea'), grisClaro: c('cGrisClaro'), gris: c('cGris'), rojoFuerte: c('cRojoFuerte'),
  rejilla: c('cRejilla'), ejeCero: c('cEjeCero'), marca: c('cMarca'), fondoNo: c('cFondoNo'), hover: c('cHover'), fondoAmpliado: c('cFondoAmpliado'),
  // §181 (creador): los colores de las tarjetas de la regla y de su dibujo.
  verdeAzulado: c('cVerdeAzulado'), grisSuave: c('cGrisSuave'), si: c('cSi'), no: c('cNo'), cajaVerde: c('cCajaVerde'), avisoFondo: c('cAvisoFondo'), verdeVivo: c('cVerdeVivo'),
  // §182 (gráfico de señales): lo que cambió frente a lo guardado y la leyenda de las franjas.
  cambioBorde: c('cCambioBorde'), cambioTexto: c('cCambioTexto'), azulFranja: c('cAzulFranja'),
  // Los colores de las cifras de lib/coloresCifras.js (sube, baja, cuenta), para las tablas del Builder.
  cifraSube: c('cCifraSube'), cifraBaja: c('cCifraBaja'), cifraCuenta: c('cCifraCuenta'),
})

// Chips de estado: [fondo, texto].
export const CHIPS = Object.freeze({
  supera: [c('chipSupera'), c('chipSuperaTexto')],
  noSupera: [c('chipNoSupera'), c('chipNoSuperaTexto')],
  borrador: [c('chipBorrador'), c('chipBorradorTexto')],
  neutro: [c('chipNeutro'), c('chipNeutroTexto')],   // Guardada, Congelada, Sin veredicto y el resto
})

export const S = {
  pagina: { flex: 1, overflowY: 'auto', padding: 20, minWidth: 0, background: B.fondo, color: B.texto, fontFamily: B.letra, fontSize: B.base, lineHeight: 1.45 },
  tarjeta: { background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, overflow: 'hidden' },
  cabeceraTarjeta: { background: B.cabecera, borderBottom: `1px solid ${B.borde}`, padding: '10px 16px', fontWeight: 700, color: B.titulo },
  cuerpo: { padding: B.aire },
  tituloSeccion: { fontSize: 18, fontWeight: 700, color: B.titulo, margin: '24px 0 2px' },
  subtituloSeccion: { color: B.secundario, marginBottom: 12 },
  secundario: { color: B.secundario },
  apagado: { color: B.apagado, fontSize: 12 },
  boton: { fontFamily: B.letra, fontSize: B.base, padding: '8px 14px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${B.borde}`, background: c('boton'), color: B.texto },
  botonVerde: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${c('botonVerde')}`, background: c('botonVerde'), color: c('botonVerdeTexto'), fontWeight: 700 },
  // Un botón principal desactivado: gris de verdad (no un verde apagado), para que no parezca que se puede pulsar.
  botonDesactivado: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'not-allowed', border: `1px solid ${c('desactivado')}`, background: c('desactivado'), color: c('sobreDesactivado'), fontWeight: 700 },
  enlace: { background: 'none', border: 'none', padding: 0, fontFamily: B.letra, fontSize: B.base, color: B.enlace, cursor: 'pointer', textAlign: 'left' },
  chip: (tipo) => { const [bg, fg] = CHIPS[tipo] || CHIPS.neutro; return { display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } },
}
