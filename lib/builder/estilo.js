// lib/builder/estilo.js — el ESTILO del Builder (el boceto aprobado; docs/builder.md, tanda 1b), en un solo sitio para
// poder reutilizarlo después en el Laboratorio y el Lab. cartera. Solo lo usa el Builder: el resto de la app no cambia.
// Tokens (colores, letra, radios) y estilos ya montados (tarjeta, cabecera, botones, chips de estado).

export const B = Object.freeze({
  letra: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  base: 14,
  fondo: '#0f1419', tarjeta: '#161f29', cabecera: '#1b2836', borde: '#263040',
  texto: '#e6edf3', titulo: '#ffffff', secundario: '#9fb0c3', apagado: '#8b9bad', resultado: '#d6dfe8',
  verde: '#3fb950', sobreVerde: '#06210f', enlace: '#79c0ff',
  siguienteFondo: '#13283f', siguienteBorde: '#2d5b8c',
  pasoFondo: '#14301f', pasoBorde: '#2f7d45',
  radioTarjeta: 12, radioBoton: 8, aire: 16,
})

// Chips de estado: [fondo, texto].
export const CHIPS = Object.freeze({
  supera: ['#14301f', '#56d364'],
  noSupera: ['#3b1d22', '#ff8b8b'],
  borrador: ['#3a3220', '#f2cc60'],
  neutro: ['#263040', '#c9d4df'],   // Guardada, Congelada, Sin veredicto y el resto
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
  boton: { fontFamily: B.letra, fontSize: B.base, padding: '8px 14px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${B.borde}`, background: B.borde, color: B.texto },
  botonVerde: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${B.verde}`, background: B.verde, color: B.sobreVerde, fontWeight: 700 },
  enlace: { background: 'none', border: 'none', padding: 0, fontFamily: B.letra, fontSize: B.base, color: B.enlace, cursor: 'pointer', textAlign: 'left' },
  chip: (tipo) => { const [bg, fg] = CHIPS[tipo] || CHIPS.neutro; return { display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } },
}
