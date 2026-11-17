// lib/builder/estilo.js — el ESTILO del Builder (el boceto aprobado; docs/builder.md, tanda 1b), en un solo sitio para
// poder reutilizarlo después en el Laboratorio y el Lab. cartera. Solo lo usa el Builder: el resto de la app no cambia.
// Tokens (colores, letra, radios) y estilos ya montados (tarjeta, cabecera, botones, chips de estado).
//
// §176 (☀/☾ en el Builder, parte 1): los colores son VARIABLES CSS con su color de siempre de reserva: «var(--bd-fondo, #0f1419)».
// Donde nadie pone las variables (Tesis y lo demás que usa B) se ve exactamente igual que antes. El Builder las pone en su
// pantalla con varsBuilder(tema) (components/BuilderPanel.js); TEMAS_BUILDER.oscuro son los colores de siempre.

// Los colores de siempre (el tono oscuro de hoy). La clave es el nombre de la variable: --bd-<clave>.
const OSCURO = Object.freeze({
  fondo: '#0f1419', tarjeta: '#161f29', cabecera: '#1b2836', borde: '#263040',
  texto: '#e6edf3', titulo: '#ffffff', secundario: '#9fb0c3', apagado: '#8b9bad', resultado: '#d6dfe8',
  verde: '#3fb950', sobreVerde: '#06210f', enlace: '#79c0ff',
  siguienteFondo: '#13283f', siguienteBorde: '#2d5b8c',
  pasoFondo: '#14301f', pasoBorde: '#2f7d45',
  boton: '#263040', desactivado: '#59636e', sobreDesactivado: '#1c2128',
  chipSupera: '#14301f', chipSuperaTexto: '#56d364', chipNoSupera: '#3b1d22', chipNoSuperaTexto: '#ff8b8b',
  chipBorrador: '#3a3220', chipBorradorTexto: '#f2cc60', chipNeutro: '#263040', chipNeutroTexto: '#c9d4df',
})
// El tono claro: el «Papel gris» del screener (lib/screener/colores.js), con las claves que el screener no tiene.
const CLARO = Object.freeze({
  fondo: '#d6d2c8', tarjeta: '#dedad1', cabecera: '#cfcac0', borde: '#b3ada1',
  texto: '#33302b', titulo: '#1f1c18', secundario: '#5f5a52', apagado: '#77716a', resultado: '#3d3a34',
  verde: '#2f6f35', sobreVerde: '#ffffff', enlace: '#2f5f96',
  siguienteFondo: '#c9d3df', siguienteBorde: '#2f5f96',
  pasoFondo: '#cbd8c3', pasoBorde: '#2f6f35',
  boton: '#cfcac0', desactivado: '#b3ada1', sobreDesactivado: '#dedad1',
  chipSupera: '#cbd8c3', chipSuperaTexto: '#2f6f35', chipNoSupera: '#e3c8bf', chipNoSuperaTexto: '#a3402e',
  chipBorrador: '#e6d6a3', chipBorradorTexto: '#6b4d00', chipNeutro: '#cfcac0', chipNeutroTexto: '#5f5a52',
})
export const TEMAS_BUILDER = Object.freeze({ oscuro: OSCURO, claro: CLARO })
// Las variables CSS de un tono, para el style del contenedor de la pantalla: { '--bd-fondo': '#0f1419', … }.
export const varsBuilder = (t) => Object.fromEntries(Object.entries(TEMAS_BUILDER[t === 'claro' ? 'claro' : 'oscuro']).map(([k, v]) => ['--bd-' + k, v]))
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
  botonVerde: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${B.verde}`, background: B.verde, color: B.sobreVerde, fontWeight: 700 },
  // Un botón principal desactivado: gris de verdad (no un verde apagado), para que no parezca que se puede pulsar.
  botonDesactivado: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'not-allowed', border: `1px solid ${c('desactivado')}`, background: c('desactivado'), color: c('sobreDesactivado'), fontWeight: 700 },
  enlace: { background: 'none', border: 'none', padding: 0, fontFamily: B.letra, fontSize: B.base, color: B.enlace, cursor: 'pointer', textAlign: 'left' },
  chip: (tipo) => { const [bg, fg] = CHIPS[tipo] || CHIPS.neutro; return { display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } },
}
