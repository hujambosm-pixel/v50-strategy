// components/FundamentalsPanel.js — ficha fundamental a pantalla completa (zona principal).
//
// Presentacional: recibe la respuesta ya normalizada de /api/fundamentales y la pinta. Quien pide los
// datos es index.js, al abrir la sección y al cambiar de símbolo.
//
// Dos reglas que gobiernan todo el panel:
//  · Lo que no llega NO se dibuja. El endpoint distingue "sin dato" (null) de cero, así que un campo
//    nulo se omite y un bloque entero sin campos desaparece: un índice se queda en Mercado y un ETF
//    enseña Mercado más su bloque propio. Nada de "no disponible" repetido por toda la pantalla.
//  · El ancho es variable (la barra lateral se pliega, pero la ventana puede estrecharse): las tarjetas
//    fluyen con grid auto-fit y los pares etiqueta-valor se reparten dentro de cada tarjeta.
import { MONO } from '../lib/utils'

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

const C = {
  panel:   { flex: 1, overflowY: 'auto', padding: '16px 20px 28px', fontFamily: MONO, color: 'var(--text)' },
  rejilla: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 14, alignItems: 'start' },
  tarjeta: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px 13px' },
  titulo:  { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, marginBottom: 9 },
  fila:    { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderBottom: '1px solid rgba(26,45,69,0.5)' },
  etiqueta:{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' },
  valor:   { fontSize: 12, color: 'var(--text)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' },
  chip:    { fontSize: 10, background: 'rgba(255,209,102,0.12)', color: '#ffd166', borderRadius: 2, padding: '1px 5px', lineHeight: '15px', cursor: 'help', whiteSpace: 'nowrap' },
}
const Fila = ({ k, v, color }) => v == null ? null : (
  <div style={C.fila}><span style={C.etiqueta}>{k}</span><span style={{ ...C.valor, ...(color ? { color } : {}) }}>{v}</span></div>
)
// Una tarjeta solo existe si alguna de sus filas tiene valor, o si trae un extra CON datos: `extra` se
// pasa ya resuelto a null cuando no hay nada que dibujar (un elemento que devuelve null sigue siendo
// truthy aquí, y dejaba tarjetas con solo el título).
const Tarjeta = ({ titulo, filas, extra = null }) => {
  const vivas = filas.filter(f => f && f.v != null)
  if (!vivas.length && !extra) return null
  return (
    <div style={C.tarjeta}>
      <div style={C.titulo}>{titulo}</div>
      {vivas.map(f => <Fila key={f.k} k={f.k} v={f.v} color={f.color} />)}
      {extra}
    </div>
  )
}
// Barra de posición dentro de un rango (precio dentro del rango de 52 semanas, p. ej.).
function BarraRango({ min, max, actual, moneda }) {
  if (min == null || max == null || max <= min) return null
  const pos = actual == null ? null : Math.max(0, Math.min(100, ((actual - min) / (max - min)) * 100))
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#1a3d5a,#243d5c)' }}>
        {pos != null && <div style={{ position: 'absolute', left: `calc(${pos}% - 3px)`, top: -2, width: 6, height: 8, borderRadius: 2, background: 'var(--accent)' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
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
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {filas.map(([nombre, n, color]) => (
        <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', width: 82, flexShrink: 0 }}>{nombre}</span>
          <div style={{ flex: 1, height: 6, background: 'rgba(26,45,69,0.6)', borderRadius: 3, overflow: 'hidden', minWidth: 30 }}>
            <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text2)', width: 18, textAlign: 'right', flexShrink: 0 }}>{n}</span>
        </div>
      ))}
    </div>
  )
}

export default function FundamentalsPanel({ ficha, cargando, error, symbol }) {
  if (cargando) return <div className="loading"><div className="spinner" /><div className="loading-text">Cargando fundamentales de {symbol}…</div></div>
  if (error)    return <div className="error-msg">⚠ {error}</div>
  if (!ficha)   return null

  const { moneda, mercado: m, valoracion: v, negocio: neg, dividendo: div, analistas: an, eventos: ev, fondo, historicoAnual: hist, origen } = ficha
  const variacion = m?.precio != null && m?.cierrePrevio ? ((m.precio / m.cierrePrevio - 1) * 100) : null
  const colorVar = variacion == null ? undefined : variacion > 0 ? '#00e5a0' : variacion < 0 ? '#ff5d5d' : 'var(--text2)'
  const margen = neg?.ingresosTtm && neg?.beneficioNetoTtm != null && neg.ingresosTtm !== 0 ? (neg.beneficioNetoTtm / neg.ingresosTtm) * 100 : null
  const potencial = an?.objetivoMedio != null && m?.precio ? ((an.objetivoMedio / m.precio - 1) * 100) : null
  const degradado = origen?.via === 'degradado'

  return (
    <div style={C.panel}>
      {/* ── Cabecera: identidad, precio y variación del día ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 14 }}>
        <span style={{ fontSize: 21, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>{ficha.symbol}</span>
        {ficha.nombre && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ficha.nombre}</span>}
        <span style={{ fontSize: 10, color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px' }}>{TIPOS[ficha.tipo] || ficha.tipo}</span>
        <span style={{ flex: 1 }} />
        {m?.precio != null && <span style={{ fontSize: 22, fontWeight: 700 }}>{fPrecio(m.precio, moneda)}</span>}
        {variacion != null && <span style={{ fontSize: 13, fontWeight: 600, color: colorVar }}>{fPct(variacion, true)}</span>}
        {degradado && (
          <span title={`Yahoo no sirvió la ficha completa (vía ${origen.via}).\n\nFaltan: ${(origen.faltan || []).join(', ') || '—'}.\nLo que se muestra viene de las fuentes que no piden autenticación.`} style={C.chip}>
            ⚠ Ficha incompleta
          </span>
        )}
      </div>

      <div style={C.rejilla}>
        <Tarjeta titulo="Mercado" filas={[
          { k: 'Apertura', v: fPrecio(m?.apertura, moneda) },
          { k: 'Cierre anterior', v: fPrecio(m?.cierrePrevio, moneda) },
          { k: 'Rango del día', v: m?.minDia != null && m?.maxDia != null ? `${fPrecio(m.minDia, moneda)} – ${fPrecio(m.maxDia, moneda)}` : null },
          { k: 'Rango 52 semanas', v: m?.min52Semanas != null && m?.max52Semanas != null ? `${fPrecio(m.min52Semanas, moneda)} – ${fPrecio(m.max52Semanas, moneda)}` : null },
          { k: 'Volumen', v: fCantidad(m?.volumen) },
          { k: 'Volumen medio', v: fCantidad(m?.volumenMedio) },
        ]} extra={m?.min52Semanas != null && m?.max52Semanas != null
          ? <BarraRango min={m.min52Semanas} max={m.max52Semanas} actual={m.precio} moneda={moneda} /> : null} />

        <Tarjeta titulo="Valoración" filas={[
          { k: 'Capitalización', v: fGrande(v?.capitalizacion, moneda) },
          { k: 'PER', v: fRatio(v?.per) },
          { k: 'PER adelantado', v: fRatio(v?.perAdelantado) },
          { k: 'BPA (TTM)', v: fPrecio(v?.bpa, moneda) },
          { k: 'Acciones', v: fCantidad(v?.acciones) },
          { k: 'Beta', v: fRatio(v?.beta) },
        ]} />

        <Tarjeta titulo="Negocio (TTM)" filas={[
          { k: 'Ingresos', v: fGrande(neg?.ingresosTtm, moneda) },
          { k: 'Beneficio neto', v: fGrande(neg?.beneficioNetoTtm, moneda) },
          { k: 'Margen neto', v: fPct(margen), color: margen == null ? undefined : margen >= 0 ? '#00e5a0' : '#ff5d5d' },
        ]} />

        <Tarjeta titulo="Dividendo" filas={[
          { k: 'Dividendo anual', v: fPrecio(div?.importe, moneda) },
          { k: 'Rentabilidad', v: fPctFrac(div?.rentabilidad) },
          { k: 'Fecha ex-dividendo', v: fFecha(div?.exDividendo) },
          { k: 'Payout', v: fPctFrac(div?.payout) },
        ]} />

        <Tarjeta titulo="Analistas" filas={[
          { k: 'Consenso', v: an?.consenso ? (CONSENSO[an.consenso] || an.consenso) : null, color: COLOR_CONSENSO[an?.consenso] },
          { k: 'Nota media', v: an?.consensoMedia != null ? `${fRatio(an.consensoMedia)} / 5` : null },
          { k: 'Analistas', v: an?.numAnalistas != null ? String(an.numAnalistas) : null },
          { k: 'Precio objetivo', v: fPrecio(an?.objetivoMedio, moneda) },
          { k: 'Potencial', v: fPct(potencial, true), color: potencial == null ? undefined : potencial >= 0 ? '#00e5a0' : '#ff5d5d' },
          { k: 'Rango objetivo', v: an?.objetivoMin != null && an?.objetivoMax != null ? `${fPrecio(an.objetivoMin, moneda)} – ${fPrecio(an.objetivoMax, moneda)}` : null },
        ]} extra={hayDistribucion(an?.distribucion) ? <Distribucion d={an.distribucion} /> : null} />

        <Tarjeta titulo="Próximos eventos" filas={[
          { k: 'Resultados', v: ev?.proximosResultados ? `${fFecha(ev.proximosResultados)}${ev.resultadosEstimado ? ' (est.)' : ''}` : null },
        ]} />

        <Tarjeta titulo="Fondo" filas={[
          { k: 'Patrimonio', v: fGrande(fondo?.patrimonio, moneda) },
          { k: 'Rentabilidad', v: fPctFrac(fondo?.rentabilidad) },
          { k: 'Comisión anual', v: fPctFrac(fondo?.comisionAnual) },
          { k: 'Beta 3 años', v: fRatio(fondo?.beta3Anios) },
          { k: 'Rentabilidad YTD', v: fPctFrac(fondo?.rentabilidadYtd, true), color: fondo?.rentabilidadYtd == null ? undefined : fondo.rentabilidadYtd >= 0 ? '#00e5a0' : '#ff5d5d' },
          { k: 'Categoría', v: fondo?.categoria || null },
        ]} />
      </div>

      {/* ── Histórico anual: tabla compacta (el gráfico de barras llega en el commit siguiente) ── */}
      {hist?.length > 0 && (
        <div style={{ ...C.tarjeta, marginTop: 14 }}>
          <div style={C.titulo}>Histórico anual</div>
          <div style={{ overflowX: 'auto' }}>
            {/* Tope de ancho: a pantalla completa, una tabla de 4 columnas al 100 % deja los números
                tan separados que cuesta seguir la fila. */}
            <table style={{ width: '100%', maxWidth: 760, borderCollapse: 'collapse', fontSize: 12, minWidth: 380 }}>
              <thead>
                <tr>
                  {['Año', 'Ingresos', 'Beneficio', 'BPA'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--text3)', fontWeight: 600, padding: '4px 10px 6px 0', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.map(a => (
                  <tr key={a.fecha || a.anio}>
                    <td style={{ padding: '4px 10px 4px 0', color: 'var(--text2)', borderBottom: '1px solid rgba(26,45,69,0.5)' }}>{a.anio}</td>
                    <td style={{ padding: '4px 10px 4px 0', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid rgba(26,45,69,0.5)' }}>{fGrande(a.ingresos, moneda) || '—'}</td>
                    <td style={{ padding: '4px 10px 4px 0', textAlign: 'right', fontWeight: 600, color: a.beneficio == null ? undefined : a.beneficio >= 0 ? '#00e5a0' : '#ff5d5d', borderBottom: '1px solid rgba(26,45,69,0.5)' }}>{fGrande(a.beneficio, moneda) || '—'}</td>
                    <td style={{ padding: '4px 10px 4px 0', textAlign: 'right', borderBottom: '1px solid rgba(26,45,69,0.5)' }}>{fPrecio(a.bpa, moneda) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
