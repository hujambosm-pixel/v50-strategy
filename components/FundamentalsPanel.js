// components/FundamentalsPanel.js — ficha fundamental a pantalla completa (zona principal).
//
// Presentacional: recibe la respuesta ya normalizada de /api/fundamentales y la pinta. Quien pide los
// datos es index.js, al abrir la sección y al cambiar de símbolo.
//
// Maqueta: DOS MITADES. A la izquierda, una sola tarjeta con los números repartidos en secciones; a la
// derecha, los gráficos. Todo dentro del alto de pantalla (100vh − 56 px de cabecera), sin scroll: por
// eso los datos van en secciones de una misma tarjeta y no en seis cajas con su borde y su cabecera,
// que gastaban altura en marcos y dejaban huecos bajo las cortas.
//
// Dos reglas que gobiernan el panel:
//  · Lo que no llega NO se dibuja. El endpoint distingue "sin dato" (null) de cero, así que un campo
//    nulo se omite y una sección sin campos desaparece. Nada de "no disponible" repetido.
//  · Si no hay gráficos —un índice o un futuro solo traen Mercado—, la mitad derecha no existe y la
//    tarjeta de datos ocupa todo el ancho, repartiendo sus secciones en más columnas. Así no queda
//    media pantalla vacía.
import dynamic from 'next/dynamic'
import { MONO } from '../lib/utils'

// recharts fuera del render de servidor, igual que McMonthlyGainsChart.
const GraficoAnual = dynamic(() => import('./FundamentalsAnnualChart'), { ssr: false })

// ── Formato ─────────────────────────────────────────────────────────────────
const MONEDAS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF', CAD: 'CA$', AUD: 'AU$' }
const simboloMoneda = (m) => MONEDAS[m] || (m ? ` ${m}` : '')
const dec = (v, d = 2) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
// Escala española: 1e12 = billón (B), 1e9 = mil millones (mM), 1e6 = millón (M).
function magnitud(v) {
  const a = Math.abs(v)
  if (a >= 1e12) return { n: v / 1e12, s: 'B' }
  if (a >= 1e9)  return { n: v / 1e9,  s: 'mM' }
  if (a >= 1e6)  return { n: v / 1e6,  s: 'M' }
  if (a >= 1e3)  return { n: v / 1e3,  s: 'mil' }
  return { n: v, s: '' }
}
const fGrande = (v, moneda) => { if (v == null) return null; const { n, s } = magnitud(v); return `${dec(n, Math.abs(n) >= 100 ? 0 : 2)}${s ? ' ' + s : ''}${simboloMoneda(moneda)}` }
// Versión corta para el eje del gráfico: ahí conviven varias marcas y los decimales de unas contra los
// enteros de otras ("55,00 mM$" junto a "220 mM$") ensucian la lectura.
const fGrandeEje = (v, moneda) => {
  if (v == null) return ''
  if (v === 0) return '0'
  const { n, s } = magnitud(v)
  return `${dec(n, Math.abs(n) >= 10 ? 0 : 1)}${s ? ' ' + s : ''}${simboloMoneda(moneda)}`
}
const fCantidad = (v) => { if (v == null) return null; const { n, s } = magnitud(v); return s ? `${dec(n, Math.abs(n) >= 100 ? 0 : 2)} ${s}` : dec(n, 0) }
const fPrecio = (v, moneda) => v == null ? null : `${dec(v, Math.abs(v) >= 1000 ? 2 : Math.abs(v) < 1 ? 4 : 2)}${simboloMoneda(moneda)}`
const fRatio = (v) => v == null ? null : dec(v, 2)
// Yahoo da las rentabilidades en tanto por uno (0,0047 = 0,47 %).
const fPctFrac = (v, signo = false) => v == null ? null : `${signo && v > 0 ? '+' : ''}${dec(v * 100, 2)} %`
const fPct = (v, signo = false) => v == null ? null : `${signo && v > 0 ? '+' : ''}${dec(v, 2)} %`
const fFecha = (iso) => { if (!iso) return null; const [a, m, d] = String(iso).split('-'); return d ? `${d}/${m}/${a}` : iso }
const CONSENSO = { strong_buy: 'Compra fuerte', buy: 'Compra', hold: 'Mantener', underperform: 'Infraponderar', sell: 'Venta', strong_sell: 'Venta fuerte' }
const COLOR_CONSENSO = { strong_buy: '#00e5a0', buy: '#00e5a0', hold: '#ffd166', underperform: '#ff9f43', sell: '#ff5d5d', strong_sell: '#ff5d5d' }
const TIPOS = { accion: 'Acción', etf: 'ETF', fondo: 'Fondo', indice: 'Índice', futuro: 'Futuro', cripto: 'Cripto', divisa: 'Divisa', otro: '—' }
const VERDE = '#00e5a0', ROJO = '#ff5d5d'

const C = {
  // overflowY auto, no hidden: a lo ancho cabe todo y no aparece barra, pero cuando la ventana se
  // estrecha y las dos mitades se apilan, preferimos hacer scroll a aplastar los gráficos.
  panel:    { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px 14px', gap: 10, fontFamily: MONO, color: 'var(--text)', overflowY: 'auto' },
  // El cuerpo hace scroll cuando su contenido no cabe. A lo ancho las dos mitades caben en una línea y
  // no aparece barra; al estrecharse se apilan, y entonces es preferible desplazar que dejar el gráfico
  // reducido a una tira de 100 px.
  cuerpo:   { display: 'flex', gap: 12, flex: 1, minHeight: 0, flexWrap: 'wrap', overflowY: 'auto' },
  tarjeta:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px 12px' },
  seccion:  { fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, marginBottom: 4 },
  fila:     { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '2px 0', borderBottom: '1px solid rgba(26,45,69,0.45)' },
  etiqueta: { fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' },
  valor:    { fontSize: 12, color: 'var(--text)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' },
  chip:     { fontSize: 10, background: 'rgba(255,209,102,0.12)', color: '#ffd166', borderRadius: 2, padding: '1px 5px', lineHeight: '15px', cursor: 'help', whiteSpace: 'nowrap' },
}
const Fila = ({ k, v, color }) => v == null ? null : (
  <div style={C.fila}><span style={C.etiqueta}>{k}</span><span style={{ ...C.valor, ...(color ? { color } : {}) }}>{v}</span></div>
)
// Sección dentro de la tarjeta de datos: un rótulo y sus pares, repartidos en las columnas que quepan.
// Sin borde propio: las separa una línea fina, que pesa mucho menos que una caja.
const Seccion = ({ titulo, filas, extra = null, primera = false, minColumna = 175 }) => {
  const vivas = (filas || []).filter(f => f && f.v != null)
  if (!vivas.length && !extra) return null
  return (
    <div style={{ paddingTop: primera ? 0 : 8, borderTop: primera ? 'none' : '1px solid var(--border)' }}>
      <div style={C.seccion}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${minColumna}px,1fr))`, columnGap: 20 }}>
        {vivas.map(f => <Fila key={f.k} k={f.k} v={f.v} color={f.color} />)}
      </div>
      {extra}
    </div>
  )
}
// Barra de posición dentro de un rango (el precio dentro del rango de 52 semanas).
function BarraRango({ min, max, actual, moneda }) {
  if (min == null || max == null || max <= min) return null
  const pos = actual == null ? null : Math.max(0, Math.min(100, ((actual - min) / (max - min)) * 100))
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#1a3d5a,#243d5c)' }}>
        {pos != null && <div style={{ position: 'absolute', left: `calc(${pos}% - 3px)`, top: -2, width: 6, height: 8, borderRadius: 2, background: 'var(--accent)' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fPrecio(min, moneda)}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fPrecio(max, moneda)}</span>
      </div>
    </div>
  )
}
// Distribución de recomendaciones: 5 barras proporcionales, las que tengan algún voto.
const filasDistribucion = (d) => !d ? []
  : [['Compra fuerte', d.compraFuerte, '#00e5a0'], ['Compra', d.compra, '#4ade80'], ['Mantener', d.mantener, '#ffd166'], ['Venta', d.venta, '#ff9f43'], ['Venta fuerte', d.ventaFuerte, '#ff5d5d']]
      .filter(([, n]) => typeof n === 'number')
const hayDistribucion = (d) => filasDistribucion(d).reduce((s, [, n]) => s + n, 0) > 0
function Distribucion({ d }) {
  const filas = filasDistribucion(d)
  const total = filas.reduce((s, [, n]) => s + n, 0)
  if (!total) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {filas.map(([nombre, n, color]) => (
        <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', width: 82, flexShrink: 0 }}>{nombre}</span>
          <div style={{ flex: 1, height: 7, background: 'rgba(26,45,69,0.6)', borderRadius: 3, overflow: 'hidden', minWidth: 30 }}>
            <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text2)', width: 18, textAlign: 'right', flexShrink: 0 }}>{n}</span>
        </div>
      ))}
    </div>
  )
}
// La media de Yahoo va de 1 (compra fuerte) a 5 (venta fuerte): cuanto MÁS BAJA, mejor. Escrita como
// "1,30 / 5" se lee como una nota escolar y engaña. Aquí no se enseña el número suelto: se enseña dónde
// cae en una escala que va de Compra a Venta, con el color del tramo. El número queda como detalle.
function EscalaConsenso({ media }) {
  if (media == null) return null
  const pos = Math.max(0, Math.min(100, ((media - 1) / 4) * 100))
  const ayuda = `Media de las recomendaciones de los analistas en la escala de Yahoo: 1 es compra fuerte y 5 venta fuerte, así que cuanto más a la izquierda, mejor. Valor exacto: ${dec(media, 2)}.`
  return (
    <div style={{ marginTop: 2 }} title={ayuda}>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'linear-gradient(90deg,#00e5a0 0%,#4ade80 25%,#ffd166 50%,#ff9f43 75%,#ff5d5d 100%)', opacity: 0.85 }}>
        <div style={{ position: 'absolute', left: `calc(${pos}% - 4px)`, top: -3, width: 8, height: 12, borderRadius: 2, background: 'var(--text)', border: '1px solid var(--bg)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--text3)' }}>
        <span>Compra fuerte</span><span>Venta fuerte</span>
      </div>
    </div>
  )
}

export default function FundamentalsPanel({ ficha, cargando, error, symbol }) {
  if (cargando) return <div className="loading"><div className="spinner" /><div className="loading-text">Cargando fundamentales de {symbol}…</div></div>
  if (error)    return <div className="error-msg">⚠ {error}</div>
  if (!ficha)   return null

  const { moneda, mercado: m, valoracion: v, negocio: neg, dividendo: div, analistas: an, eventos: ev, fondo, historicoAnual: hist, origen } = ficha
  const variacion = m?.precio != null && m?.cierrePrevio ? ((m.precio / m.cierrePrevio - 1) * 100) : null
  const colorVar = variacion == null ? undefined : variacion > 0 ? VERDE : variacion < 0 ? ROJO : 'var(--text2)'
  const margen = neg?.ingresosTtm && neg?.beneficioNetoTtm != null && neg.ingresosTtm !== 0 ? (neg.beneficioNetoTtm / neg.ingresosTtm) * 100 : null
  const potencial = an?.objetivoMedio != null && m?.precio ? ((an.objetivoMedio / m.precio - 1) * 100) : null
  const degradado = origen?.via === 'degradado'
  const hayHistorico = hist?.length > 0
  const hayAnalistas = !!(an?.consenso || an?.consensoMedia != null || hayDistribucion(an?.distribucion))
  const hayGraficos = hayHistorico || hayAnalistas
  // El BPA por año es lo único del histórico que el gráfico no puede enseñar (su escala aplastaría las
  // barras), así que baja aquí en una línea en vez de sostener una tabla entera al lado del gráfico.
  const bpaPorAnio = (hist || []).filter(a => a.bpa != null)

  return (
    <div style={C.panel}>
      {/* ── Cabecera: identidad, precio y variación del día ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 14px', flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>{ficha.symbol}</span>
        {ficha.nombre && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ficha.nombre}</span>}
        <span style={{ fontSize: 10, color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px' }}>{TIPOS[ficha.tipo] || ficha.tipo}</span>
        <span style={{ flex: 1 }} />
        {m?.precio != null && <span style={{ fontSize: 21, fontWeight: 700 }}>{fPrecio(m.precio, moneda)}</span>}
        {variacion != null && <span style={{ fontSize: 13, fontWeight: 600, color: colorVar }}>{fPct(variacion, true)}</span>}
        {degradado && (
          <span title={`Yahoo no sirvió la ficha completa (vía ${origen.via}).\n\nFaltan: ${(origen.faltan || []).join(', ') || '—'}.\nLo que se muestra viene de las fuentes que no piden autenticación.`} style={C.chip}>
            ⚠ Ficha incompleta
          </span>
        )}
      </div>

      {/* Sin gráficos, la tarjeta se queda del alto de su contenido: estirarla hasta abajo solo crearía
          una caja medio vacía. Con gráficos sí llena el alto, y reparte sus secciones para no dejar el
          hueco al final. Con flex-wrap quien manda en el eje vertical es alignContent, no alignItems. */}
      <div style={{ ...C.cuerpo, alignItems: hayGraficos ? 'stretch' : 'flex-start', alignContent: hayGraficos ? 'stretch' : 'flex-start' }}>
        {/* ── Mitad izquierda: todos los números, en una sola tarjeta ── */}
        <div style={{ ...C.tarjeta, flex: hayGraficos ? '1 1 380px' : '1 1 100%', minWidth: 290, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8, ...(hayGraficos ? { justifyContent: 'space-between' } : {}) }}>
          <Seccion primera titulo="Mercado" filas={[
            { k: 'Apertura', v: fPrecio(m?.apertura, moneda) },
            { k: 'Cierre anterior', v: fPrecio(m?.cierrePrevio, moneda) },
            { k: 'Rango del día', v: m?.minDia != null && m?.maxDia != null ? `${fPrecio(m.minDia, moneda)} – ${fPrecio(m.maxDia, moneda)}` : null },
            { k: '52 semanas', v: m?.min52Semanas != null && m?.max52Semanas != null ? `${fPrecio(m.min52Semanas, moneda)} – ${fPrecio(m.max52Semanas, moneda)}` : null },
            { k: 'Volumen', v: fCantidad(m?.volumen) },
            { k: 'Volumen medio', v: fCantidad(m?.volumenMedio) },
          ]} extra={m?.min52Semanas != null && m?.max52Semanas != null
            ? <BarraRango min={m.min52Semanas} max={m.max52Semanas} actual={m.precio} moneda={moneda} /> : null} />

          <Seccion titulo="Valoración" filas={[
            { k: 'Capitalización', v: fGrande(v?.capitalizacion, moneda) },
            { k: 'PER', v: fRatio(v?.per) },
            { k: 'PER adelantado', v: fRatio(v?.perAdelantado) },
            { k: 'BPA (TTM)', v: fPrecio(v?.bpa, moneda) },
            { k: 'Acciones', v: fCantidad(v?.acciones) },
            { k: 'Beta', v: fRatio(v?.beta) },
          ]} />

          <Seccion titulo="Negocio (TTM)" filas={[
            { k: 'Ingresos', v: fGrande(neg?.ingresosTtm, moneda) },
            { k: 'Beneficio neto', v: fGrande(neg?.beneficioNetoTtm, moneda) },
            { k: 'Margen neto', v: fPct(margen), color: margen == null ? undefined : margen >= 0 ? VERDE : ROJO },
          ]} />

          <Seccion titulo="Dividendo" filas={[
            { k: 'Dividendo anual', v: fPrecio(div?.importe, moneda) },
            { k: 'Rentabilidad', v: fPctFrac(div?.rentabilidad) },
            { k: 'Ex-dividendo', v: fFecha(div?.exDividendo) },
            { k: 'Payout', v: fPctFrac(div?.payout) },
          ]} />

          <Seccion titulo="Objetivo de los analistas" filas={[
            { k: 'Precio objetivo', v: fPrecio(an?.objetivoMedio, moneda) },
            { k: 'Potencial', v: fPct(potencial, true), color: potencial == null ? undefined : potencial >= 0 ? VERDE : ROJO },
            { k: 'Rango objetivo', v: an?.objetivoMin != null && an?.objetivoMax != null ? `${fPrecio(an.objetivoMin, moneda)} – ${fPrecio(an.objetivoMax, moneda)}` : null },
            { k: 'Analistas', v: an?.numAnalistas != null ? String(an.numAnalistas) : null },
          ]} />

          <Seccion titulo="Fondo" filas={[
            { k: 'Patrimonio', v: fGrande(fondo?.patrimonio, moneda) },
            { k: 'Rentabilidad', v: fPctFrac(fondo?.rentabilidad) },
            { k: 'Comisión anual', v: fPctFrac(fondo?.comisionAnual) },
            { k: 'Beta 3 años', v: fRatio(fondo?.beta3Anios) },
            { k: 'Rentabilidad YTD', v: fPctFrac(fondo?.rentabilidadYtd, true), color: fondo?.rentabilidadYtd == null ? undefined : fondo.rentabilidadYtd >= 0 ? VERDE : ROJO },
            { k: 'Categoría', v: fondo?.categoria || null },
          ]} />

          <Seccion titulo="Calendario" filas={[
            { k: 'Resultados', v: ev?.proximosResultados ? `${fFecha(ev.proximosResultados)}${ev.resultadosEstimado ? ' (est.)' : ''}` : null },
          ]} extra={bpaPorAnio.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 6, alignItems: 'baseline' }}>
              <span style={{ ...C.etiqueta, marginRight: 2 }}>BPA por año</span>
              {bpaPorAnio.map(a => (
                <span key={a.fecha || a.anio} style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>{a.anio}</span>{' '}
                  <span style={{ fontWeight: 600 }}>{fPrecio(a.bpa, moneda)}</span>
                </span>
              ))}
            </div>
          ) : null} />
        </div>

        {/* ── Mitad derecha: los gráficos. No existe si el activo no tiene ninguno ── */}
        {hayGraficos && (
          <div style={{ flex: '1 1 420px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {hayHistorico && (
              // El gráfico tiene alto PROPIO en píxeles (los 230 de siempre): nunca lo pide al contenedor.
              // Pedirlo creaba una referencia circular —el alto de la tarjeta salía del gráfico y el del
              // gráfico de la tarjeta— porque .app usa min-height y ningún eslabón de la cadena fija una
              // altura. Sin equilibrio, recharts se quedaba con la última medida, de hasta 1455 px.
              <div style={{ ...C.tarjeta, flex: '0 0 auto' }}>
                <div style={C.seccion}>Ingresos y beneficio por año</div>
                <GraficoAnual datos={hist} fmt={(x) => fGrande(x, moneda)} fmtEje={(x) => fGrandeEje(x, moneda)} />
              </div>
            )}
            {hayAnalistas && (
              <div style={{ ...C.tarjeta, flex: '1 1 0', minHeight: 165, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={C.seccion}>Recomendación de los analistas</span>
                  {an?.consenso && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLOR_CONSENSO[an.consenso] || 'var(--text)' }}>
                      {CONSENSO[an.consenso] || an.consenso}
                    </span>
                  )}
                </div>
                <EscalaConsenso media={an?.consensoMedia} />
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '100%' }}><Distribucion d={an?.distribucion} /></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
