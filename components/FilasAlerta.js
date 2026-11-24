// components/FilasAlerta.js — «Condición del catálogo» en la ventana «Nueva alerta» (docs/builder.md §221; boceto
// bocetos/alertas-desde-cero.html). Las condiciones son las filas del creador de estrategias (components/BuilderFila.js, como el dinero
// ocioso con regla y las reglas del bloque «Con pesos»: de quién, sus números y con qué velas se mira), TODAS con «Y». No calcula nada:
// solo cambia las filas (onCambia(filas)), en el formato del motor de alertas (lib/alertas/motor.js: [{ quien, si, velas, union? }]).
//   simbolo: el valor de la alerta (sale el primero en «de quién»). «Otro símbolo…» se escribe a mano: el comprobador pide a Yahoo
//   cualquier símbolo (AAPL, ^GSPC, GC=F, BTC-USD…).
import { useState, useEffect } from 'react'
import { B, C, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import { Fila, entrada, mini } from './BuilderFila'
import { nombreCond, explicacionCond } from '../lib/builder/tarjetas'
import { OTRO_REGLA, MAX_FILAS_REGLA, filaDePantallaRegla, filasGuardadasRegla, catalogoRegla, filaNuevaRegla, opcionesQuienRegla, erroresFilaRegla, AYUDA_REGLAS } from '../lib/builder/reglasPesos'

// Todas con «Y» (la primera sin unión).
const conY = (fs) => fs.map((f, k) => { const { union, ...r } = f; return k ? { ...r, union: 'Y' } : r })
const SIMBOLO = /^[A-Z0-9.^=-]{1,30}$/

// §240: conO (solo la señal del Replay; las alertas siguen todas con «Y»): entre fila y fila, «y además» / «o bien».
const AYUDA_UNION = '«Y ADEMÁS»: la señal pide que se cumplan las dos filas a la vez.\n«O BIEN»: basta con una de ellas.\n\n' +
  'Con «o bien», la señal es la vela en que CUALQUIERA de las partes pasa a cumplirse, mirando cada parte por separado. ' +
  'Ejemplo: «el cierre está por encima de la EMA 20» o bien «el cierre está por debajo de la EMA 20» da una señal en cada cruce: ' +
  'si cruza hacia arriba el día 10 y hacia abajo el día 25, señales el 10 y el 25.\n\n' +
  '«Y además» une antes que «o bien»: A y además B, o bien C = (A y B a la vez) o bien C.'
export default function FilasAlerta({ simbolo, filas, onCambia, inicial = null, para = 'alerta', conO = false }) {   // para: lo que sale en el título del catálogo (§231: 'señal' en el Replay)
  const sim = String(simbolo || '').toUpperCase()
  const [catalogo, setCatalogo] = useState(!!inicial?.catalogo)
  const [buscar, setBuscar] = useState(inicial?.buscar || '')
  const [otro, setOtro] = useState(null)       // la fila que está eligiendo «Otro símbolo…»
  const [otroTxt, setOtroTxt] = useState('')
  const fs = (filas || []).map(filaDePantallaRegla)
  const ponFilas = (f) => { const g = filasGuardadasRegla(f(fs)); onCambia(conO ? g : conY(g)) }
  const cierra = () => { setCatalogo(false); setBuscar('') }
  useEffect(() => {
    if (!catalogo) return
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cierra() } }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [catalogo])
  const elige = (clave) => { ponFilas(xs => [...xs, filaDePantallaRegla(filaNuevaRegla(clave, xs[0]?.quien || sim))]); cierra() }
  const busqueda = catalogoRegla(buscar)
  const ponOtro = (j) => { const s = otroTxt.trim().toUpperCase(); if (!SIMBOLO.test(s)) return; ponFilas(xs => xs.map((y, p) => p === j ? { ...y, quien: s } : y)); setOtro(null); setOtroTxt('') }
  const condicion = (id) => (
    <div key={id} data-cond-alerta={id} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <button type="button" onClick={() => elige(id)} title="Añadir esta condición" style={{ ...S.enlace, color: B.texto, padding: '5px 8px', borderRadius: 5, flex: '1 1 auto', minWidth: 0 }}>{nombreCond(id)}</button>
      <Ayuda texto={explicacionCond(id)} etiqueta={nombreCond(id)}/>
    </div>
  )
  return (
    <div data-filas-alerta={fs.length}>
      {fs.map((f, j) => (
        <div key={j} data-fila-alerta={j}>
          {j > 0 && (conO
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <select data-union-alerta={j} aria-label="Cómo se une esta fila con la anterior" value={f.union === 'O' ? 'O' : 'Y'} style={mini}
                  onChange={e => ponFilas(xs => xs.map((y, p) => p === j ? { ...y, union: e.target.value } : y))}>
                  <option value="Y">y además</option><option value="O">o bien</option></select>
                {j === 1 && <Ayuda texto={AYUDA_UNION} etiqueta="y además / o bien" zIndice={10100}/>}
              </div>
            : <div style={{ ...S.apagado, marginTop: 6 }}>y además</div>)}
          {f.rara ? (
            <div data-fila-rara style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: B.secundario }}>
              <span style={{ flex: 1 }}>Una condición que aquí no se puede editar.</span>
              <button type="button" style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1 }} aria-label="Quitar esta condición" onClick={() => ponFilas(xs => xs.filter((_, q) => q !== j))}>×</button>
            </div>
          ) : (
            <Fila f={f} errores={erroresFilaRegla(f)} valores={{}} tarjeta="filtro" color={C.azul} enVarias intervalo={f.velas === 'semanales' ? 'semanal' : 'diario'}
              quien={f.quien} opcionesDeQuien={opcionesQuienRegla([sim].filter(Boolean), f.quien)} ayudaQuien={AYUDA_REGLAS.quien}
              onQuien={q => { if (q === OTRO_REGLA) { setOtro(j); setOtroTxt('') } else { setOtro(null); ponFilas(xs => xs.map((y, p) => p === j ? { ...y, quien: q } : y)) } }}
              extra={<select data-velas-alerta style={mini} aria-label="Con qué velas se mira" title="Con qué velas se mira esta condición (semanales: la semana ya cerrada)" value={f.velas} onChange={e => ponFilas(xs => xs.map((y, p) => p === j ? { ...y, velas: e.target.value } : y))}>
                <option value="diarias">velas diarias</option><option value="semanales">velas semanales</option></select>}
              onCambia={g => ponFilas(xs => xs.map((y, p) => p === j ? { ...g, quien: f.quien, velas: f.velas, union: conO && f.union === 'O' ? 'O' : 'Y' } : y))}
              onQuita={() => { setOtro(null); ponFilas(xs => xs.filter((_, p) => p !== j)) }}/>
          )}
          {otro === j && (
            <div data-otro-simbolo-alerta style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={S.secundario}>Símbolo:</span>
              <input autoFocus value={otroTxt} onChange={e => setOtroTxt(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') ponOtro(j) }} placeholder="QQQ, ^GSPC, GC=F…" aria-label="Símbolo de la condición" style={{ ...entrada, width: 130 }}/>
              <button type="button" style={{ ...S.boton, padding: '3px 10px', fontSize: 13 }} disabled={!SIMBOLO.test(otroTxt.trim())} onClick={() => ponOtro(j)}>Poner</button>
              <button type="button" style={{ ...S.enlace, fontSize: 13, color: B.secundario }} onClick={() => setOtro(null)}>Cancelar</button>
            </div>
          )}
        </div>
      ))}
      {!fs.length && <div style={{ color: C.rojo, fontSize: 12 }}>Pon al menos una condición.</div>}
      <div style={{ marginTop: 8 }}><button type="button" data-boton="anadir-condicion-alerta" disabled={fs.length >= MAX_FILAS_REGLA} title={fs.length >= MAX_FILAS_REGLA ? `Como mucho ${MAX_FILAS_REGLA} condiciones` : 'Una condición del catálogo, sobre este valor u otro símbolo'}
        style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }} onClick={() => setCatalogo(true)}>+ condición</button></div>

      {catalogo && (
        <div data-catalogo-alerta role="dialog" aria-modal="true" aria-label="Añadir condición" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 995, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) cierra() }}>
          <div style={{ ...S.tarjeta, padding: 20, maxWidth: 680, width: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: B.titulo, fontWeight: 700, fontSize: 16 }}>Añadir condición · {para} de {sim}</div>
            <div style={{ ...S.secundario, fontSize: 13, margin: '4px 0 10px' }}>El mismo catálogo que al crear una estrategia. Después eliges de qué símbolo es, sus números y con qué velas se mira.</div>
            <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque><input aria-label="Buscar condiciones" placeholder="Buscar: media, caída, RSI…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="catalogo-alerta" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/></ConLimpiar>
            <div style={{ overflowY: 'auto', marginTop: 10, minHeight: 0 }}>
              {!busqueda.grupos.length && !busqueda.explicacion.length && <div style={S.apagado}>Nada coincide con «{buscar}».</div>}
              {busqueda.grupos.map(g => (
                <div key={g.id} style={{ marginBottom: 10 }}>
                  <div style={{ color: B.secundario, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px' }}>{g.titulo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 14px' }}>{g.conds.map(condicion)}</div>
                </div>
              ))}
              {buscar.trim() && busqueda.explicacion.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ color: B.secundario, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px' }}>Lo mencionan en su explicación</div>
                  {busqueda.explicacion.map(x => (
                    <div key={x.clave}>{condicion(x.clave)}<div style={{ ...S.apagado, padding: '0 8px 4px' }}>{x.antes}<mark style={{ background: C.marca, color: B.titulo, borderRadius: 3, padding: '0 2px' }}>{x.palabra}</mark>{x.despues}</div></div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" data-respuesta="cancelar-catalogo-alerta" style={S.boton} onClick={cierra}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
