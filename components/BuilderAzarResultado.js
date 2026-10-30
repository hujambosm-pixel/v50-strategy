// components/BuilderAzarResultado.js — la pantalla «Resultado de la prueba» del paso 2 (opción A del boceto; docs/builder.md, §46). Se abre
// al terminar una prueba y con «Ver» en «Pruebas anteriores» (components/BuilderAzar.js). Se dibuja SOLO con lo guardado: la fila de
// pruebas_azar (`prueba`) y su resultado (`resultado`, lib/pruebaAzar.js formato 1); nunca recalcula. Las cifras y los textos, en
// lib/resultadoAzar.js.
//   onVolver: a la pantalla de confirmación; onPaso1: abre la estrategia en el paso 1; onPaso3: el paso 3 (§48: el botón «Paso 3 ·
//   Convertirla en plan» está siempre activo, también si la prueba no pasa; el plan lo avisa en rojo).
import { B, S, CHIPS } from '../lib/builder/estilo'
import BotonCopiar from './BotonCopiar'
import { REGLA_AZAR_REGLAS } from '../lib/azarReglas'
import { textoParaClaude } from '../lib/pruebaAzar'
import { histogramaCopias, textosResultado, numero, pctTexto } from '../lib/resultadoAzar'

const R = REGLA_AZAR_REGLAS
const NARANJA = '#f0883e', GRIS_BARRA = '#4b5868', AMARILLO = '#f2cc60'
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fecha = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const celda = { padding: '8px 10px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
// La caja del veredicto: [fondo, borde, color del título].
const CAJA = { pasa: [CHIPS.supera[0], B.pasoBorde, CHIPS.supera[1]], noPasa: [CHIPS.noSupera[0], '#8b3a42', CHIPS.noSupera[1]], sinVeredicto: [CHIPS.neutro[0], '#4b5868', CHIPS.neutro[1]] }
const TITULO = { pasa: 'Pasa', noPasa: 'No pasa', sinVeredicto: 'Sin veredicto' }

// El histograma de los CAGR de las copias de un periodo, en SVG. V9.1086: SIN viewBox, para que los textos no escalen con el ancho:
// las x van en % del ancho y las y en píxeles (alto fijo ALTO_HISTOGRAMA); los textos, 12–13 px como el resto de la pantalla. La
// etiqueta del listón va al lado de su línea (no encima), en el lado contrario a la línea de tu estrategia si cabe.
export const ALTO_HISTOGRAMA = 172
export function ladoListon(posListon, posEstrategia, hueco = 0.32) {
  const izq = posListon >= hueco, der = 1 - posListon >= hueco
  if (posEstrategia != null && posEstrategia > posListon && izq) return 'izquierda'
  if ((posEstrategia == null || posEstrategia <= posListon) && der) return 'derecha'
  return der ? 'derecha' : 'izquierda'
}
export function Histograma({ periodo }) {
  const h = histogramaCopias(periodo.cagrCopias, periodo.cagr)
  if (!h) return null
  const yTop = 44, yBase = 132, x = (f) => `${(3 + f * 94).toFixed(3)}%`, anchoB = 94 / h.barras.length
  const gana = periodo.percentil != null && periodo.percentil >= R.gana, color = gana ? B.verde : NARANJA
  const xE = h.posEstrategia == null ? null : x(h.posEstrategia), xL = x(h.posListon)
  const ancla = (f) => f > 0.62 ? 'end' : f < 0.38 ? 'start' : 'middle'
  const lado = ladoListon(h.posListon, h.posEstrategia)
  const resumen = `Histograma de los ${miles(h.copias)} CAGR de las copias en ${periodo.nombre}: de ${numero(h.minimo)} % a ${numero(h.maximo)} % al año, mediana ${numero(h.mediana)} %. `
    + `Listón del ${R.gana} %: ${numero(h.liston)} %. Tu estrategia: ${numero(periodo.cagr, 2)} % al año${h.fuera ? `, fuera del rango por la ${h.fuera}` : ''}, gana al ${pctTexto(periodo.percentil)} % de las copias.`
  return (
    <svg data-histograma={periodo.nombre} role="img" aria-label={resumen} width="100%" height={ALTO_HISTOGRAMA} style={{ width: '100%', height: ALTO_HISTOGRAMA, display: 'block', overflow: 'visible' }}>
      {h.barras.map((b, i) => b.n ? <rect key={i} data-barra={b.n} x={`${(3 + (i + 0.08) * anchoB).toFixed(3)}%`} width={`${(anchoB * 0.84).toFixed(3)}%`} y={yBase - (yBase - yTop) * b.n / h.maxN} height={(yBase - yTop) * b.n / h.maxN} fill={GRIS_BARRA}/> : null)}
      <line x1="3%" x2="97%" y1={yBase} y2={yBase} stroke={B.borde}/>
      {[['minimo', h.posMinimo, h.minimo], ['mediana', h.posMediana, h.mediana], ['maximo', h.posMaximo, h.maximo]].map(([k, f, v]) => (
        <g key={k} data-marca={k}><line x1={x(f)} x2={x(f)} y1={yBase} y2={yBase + 4} stroke={B.apagado}/>
          <text x={x(f)} y={yBase + 17} fontSize="12" fill={B.apagado} textAnchor={k === 'minimo' ? 'start' : k === 'maximo' ? 'end' : 'middle'}>{numero(v)}</text></g>
      ))}
      <text x="50%" y={ALTO_HISTOGRAMA - 4} fontSize="12" fill={B.apagado} textAnchor="middle">% al año</text>
      <g data-liston={numero(h.liston, 4)} data-pos={h.posListon.toFixed(4)} data-lado={lado}>
        <line x1={xL} x2={xL} y1={22} y2={yBase} stroke={B.secundario} strokeWidth="1.5" strokeDasharray="4 3"/>
        <text x={xL} dx={lado === 'derecha' ? 6 : -6} y={36} fontSize="12" fill={B.secundario} textAnchor={lado === 'derecha' ? 'start' : 'end'}>Listón del {R.gana} %</text>
      </g>
      {xE != null && <g data-estrategia={numero(periodo.cagr, 2)} data-pos={h.posEstrategia.toFixed(4)} data-fuera={h.fuera || ''}>
        <line x1={xE} x2={xE} y1={4} y2={yBase} stroke={color} strokeWidth="3.5"/>
        {h.fuera && <svg x={xE} y={0} overflow="visible">{h.fuera === 'derecha' ? <path d="M 1 74 l 8 5 l -8 5 z" fill={color}/> : <path d="M -1 74 l -8 5 l 8 5 z" fill={color}/>}</svg>}
        <text x={xE} dx={h.posEstrategia > 0.62 ? -6 : h.posEstrategia < 0.38 ? 6 : 0} y={15} fontSize="13" fontWeight="700" fill={color} textAnchor={ancla(h.posEstrategia)}>Tu estrategia {numero(periodo.cagr, 2)} %</text>
      </g>}
    </svg>
  )
}

function TarjetaPeriodo({ periodo: p, informativo }) {
  return (
    <div data-periodo-resultado={p.nombre} style={S.tarjeta}>
      <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>{p.nombre}</span>
        <span data-pasa-periodo={p.gana ? 'si' : 'no'} style={S.chip(p.gana ? 'supera' : 'noSupera')}>{p.gana ? 'Pasa este periodo' : 'No pasa este periodo'}</span>
      </div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {informativo && <div data-informativo style={{ ...S.chip('neutro'), alignSelf: 'flex-start' }}>Solo informativo: la prueba no es fiable</div>}
        <div><div style={S.secundario}>Gana a</div><div data-gana-a style={{ fontSize: 26, fontWeight: 700, color: B.titulo }}>{pctTexto(p.percentil)} % de las copias</div></div>
        <Histograma periodo={p}/>
        <div style={{ ...S.secundario, fontSize: 13 }}>Cada barra gris = cuántas copias ganaron esa cifra al año. Para pasar, la línea de tu estrategia tiene que quedar a la derecha del listón del {R.gana} %.</div>
        <div style={{ overflowX: 'auto' }}><table data-tabla="periodo" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{['', 'Tu estrategia', 'Copia típica'].map(t => <th key={t} style={{ ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }}>{t}</th>)}</tr></thead>
          <tbody>
            <tr data-fila="cagr"><td style={celda}>Ganancia al año (CAGR)</td><td style={celda}>{numero(p.cagr, 2)} %</td><td style={celda}>{numero(p.copiaTipica.cagr, 2)} %</td></tr>
            <tr data-fila="caida"><td style={celda}>Caída máxima</td><td style={celda}>{numero(p.caida, 2)} %</td><td style={celda}>{numero(p.copiaTipica.caida, 2)} %</td></tr>
            <tr data-fila="operaciones"><td style={celda}>Operaciones</td><td style={celda}>{p.operaciones}</td><td style={celda}>{p.copiaTipica.operaciones}</td></tr>
          </tbody>
        </table></div>
        <div style={S.apagado}>Copia típica = la copia que queda justo en el medio de las {miles(R.copias)} (la mediana).</div>
      </div>
    </div>
  )
}

export default function BuilderAzarResultado({ prueba, resultado, onPaso1, onPaso3 = null }) {
  const t = textosResultado(resultado), [fondo, borde, colorTitulo] = CAJA[resultado.veredicto] || CAJA.sinVeredicto
  const nombre = prueba.estrategia_nombre, velas = prueba.velas || resultado.velas
  const sinVer = resultado.veredicto === 'sinVeredicto'
  return (
    <div data-pantalla="resultado-azar" data-caso={t.caso}>
      <div data-linea-superior style={S.apagado}>{nombre} · Prueba confirmada el {fecha(prueba.creada_en)} · {prueba.valor} · velas {velas} · congelada</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: B.titulo, marginTop: 6 }}>Resultado de la prueba</div>
      <div style={{ ...S.secundario, marginTop: 4, marginBottom: 16 }}>{nombre} en {prueba.valor}, velas {velas}, contra {miles(R.copias)} copias que compran en fechas al azar.</div>

      <div data-veredicto={resultado.veredicto} style={{ background: fondo, border: `1px solid ${borde}`, borderRadius: B.radioTarjeta, padding: B.aire, marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: colorTitulo }}>{TITULO[resultado.veredicto] || resultado.texto}</div>
        <div data-texto-veredicto style={{ color: B.texto, marginTop: 6 }}>{t.texto}</div>
        {t.avisos.map(a => <div key={a} data-aviso-pocas style={{ color: AMARILLO, marginTop: 6 }}>{a}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
        {resultado.periodos.map(p => <TarjetaPeriodo key={p.nombre} periodo={p} informativo={sinVer}/>)}
      </div>

      <div data-tarjeta="fiable" style={{ ...S.tarjeta, marginTop: 16 }}>
        <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'center', gap: 10 }}>¿La prueba era fiable? <span data-fiable={t.fiable ? 'si' : 'no'} style={S.chip(t.fiable ? 'supera' : 'noSupera')}>{t.fiable ? 'Sí' : 'No'}</span></div>
        <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resultado.periodos.map(p => <div key={p.nombre} data-fiable-periodo={p.nombre}>{p.nombre}: aprobó por error {p.fiabilidad.aprobados} de {p.fiabilidad.mercados} mercados ficticios ({pctTexto(p.aprobadosFalsos)} %).</div>)}
          <div style={{ ...S.secundario, fontSize: 13 }}>En mercados ficticios ninguna estrategia tiene ventaja, así que lo normal es aprobar por error unas 5 de cada 100 veces. El límite es {R.sinVeredicto} de cada 100: por debajo, la prueba sirve; desde {R.sinVeredicto}, la app no da veredicto.</div>
        </div>
      </div>

      <div data-tarjeta="y-ahora" style={{ ...S.tarjeta, marginTop: 16 }}>
        <div style={S.cabeceraTarjeta}>¿Y ahora?</div>
        <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-texto-y-ahora>{resultado.veredicto === 'pasa'
            ? 'Ha pasado. Ahora puedes convertirla en un plan (paso 3): con tu dinero, aportaciones, comisiones e impuestos.'
            : `Esta prueba queda guardada tal cual. Puedes volver al paso 1, crear «${nombre} · versión 2» y probarla aparte. También puedes ver cómo sería un plan con ella (paso 3), que avisará de que no ha superado al azar.`}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button data-boton="paso1" style={S.boton} onClick={() => onPaso1?.()}>Volver al paso 1</button>
            <BotonCopiar obtenerTexto={() => textoParaClaude(prueba, resultado)} titulo="Copia en texto plano la configuración, la huella y las cifras del resultado"/>
            <button data-boton="paso3" style={resultado.veredicto === 'pasa' ? S.botonVerde : S.boton} onClick={() => onPaso3?.()}>Paso 3 · Convertirla en plan</button>
          </div>
        </div>
      </div>
    </div>
  )
}
