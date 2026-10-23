// components/BuilderGuia.js — la guía del Builder, «Cómo se prueba una estrategia» (tanda 2c; V9.1041): una página fija que
// explica, en español sencillo, qué es una prueba y cómo se prueba una estrategia contra el azar. Los textos, en
// lib/builder/ayuda.js (los mismos que los «?»). Se abre con el botón «Guía: cómo se prueba una estrategia» (arriba a la
// derecha del Builder y al final de «Cómo funciona esta prueba»).
import { B, S } from '../lib/builder/estilo'
import { GUIA } from '../lib/builder/ayuda'

export default function BuilderGuia({ onVolver, volverTexto = '← Builder' }) {
  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>{volverTexto}</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
      </div>
      <div style={{ maxWidth: 760 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: B.titulo }}>Cómo se prueba una estrategia</div>
        <div style={{ ...S.secundario, marginTop: 4 }}>Qué es una prueba, qué hace cada laboratorio contra el azar y cómo leer sus resultados.</div>
        <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {GUIA.map((x, k) => (
            <li key={x.titulo} data-guia={k + 1} style={{ ...S.tarjeta, marginTop: 16 }}>
              <div style={S.cabeceraTarjeta}>{k + 1}. {x.titulo}</div>
              <div style={S.cuerpo}>{x.parrafos.map((p, j) => <p key={j} style={{ margin: j ? '10px 0 0' : 0 }}>{p}</p>)}</div>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 16 }}><button style={S.boton} onClick={() => onVolver?.()}>{volverTexto}</button></div>
      </div>
    </div>
  )
}
