// components/ReglasPesos.js — la sección «4 · Reglas «si… entonces…»» del bloque «Con pesos» del plan (docs/builder.md §199; boceto
// bocetos/bloque-con-pesos.html). Cada regla: SI (filas del catálogo, las MISMAS del creador de estrategias: components/BuilderFila.js,
// con de quién, «Y / O» y con qué velas se mira) · ENTONCES · MANTENER · DESPUÉS · REPETIR, con ↑ ↓ y papelera. No calcula nada: solo
// cambia `reglas` del bloque (formato del motor, lib/planes/pesos.js §194; lo traducen lib/builder/reglasPesos.js).
//   b: el bloque de pantalla ({ pesos (en %), reglas }); n: su número; onCambia(reglas nuevas); valores: [{ simbolo, nombre }] con
//   precios guardados y la liquidez; color: el del bloque. inicial (para las pruebas de montaje): { ventana: { k, donde }, buscar }.
import { useState, useEffect } from 'react'
import { B, C, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import BuscadorValor from './BuscadorValor'
import { Fila, Numero, entrada, mini } from './BuilderFila'
import { nombreCond, explicacionCond } from '../lib/builder/tarjetas'
import { validaReglasPesos } from '../lib/planes/pesos'
import { OTRO_REGLA, MAX_REGLAS, MAX_FILAS_REGLA, simbolosBloque, filaDePantallaRegla, filasGuardadasRegla, catalogoRegla, filaNuevaRegla, opcionesQuienRegla, erroresFilaRegla,
  reglaNueva, accionNueva, despuesNuevo, mueveRegla, ACCIONES_TEXTO, DESPUES_TEXTO, REPETIR_TEXTO, AYUDA_REGLAS } from '../lib/builder/reglasPesos'

const ROJO = C.rojo, VERDE = C.verde
const eti = { color: B.secundario, fontSize: 12, fontWeight: 700, letterSpacing: '.05em', display: 'flex', alignItems: 'center', marginBottom: 4 }
const iconoRojo = (on) => ({ ...S.boton, padding: '3px 8px', fontSize: 13, color: on ? ROJO : B.apagado, borderColor: on ? ROJO : B.borde })
const flecha = (on) => ({ ...S.boton, padding: '2px 8px', fontSize: 13, color: on ? B.texto : B.apagado })
const lista = (r, donde) => (donde === 'si' ? r?.filas : r?.despues?.filas) || []
const conLista = (r, donde, fs) => donde === 'si' ? { ...r, filas: fs } : { ...r, despues: { ...(r.despues || {}), filas: fs } }
const pct = (x) => Number.isFinite(x) ? Math.round(x * 10000) / 100 : x

export default function ReglasPesos({ b, n, onCambia, valores = [], color = C.azul, inicial = null }) {
  const [ventana, setVentana] = useState(inicial?.ventana || null)   // null | { k, donde: 'si' | 'despues' }: el catálogo abierto
  const [buscar, setBuscar] = useState(inicial?.buscar || '')
  const [otro, setOtro] = useState(null)   // { k, donde, j }: la fila que está eligiendo «Otro símbolo…»
  const rs = Array.isArray(b?.reglas) ? b.reglas : []
  const sims = simbolosBloque(b), sinLiquidez = valores.filter(v => v.simbolo !== 'LIQUIDEZ')
  const errores = validaReglasPesos({ reglas: rs })
  const pon = (x) => onCambia(x)
  const ponRegla = (k, f) => pon(rs.map((r, j) => j === k ? f(r) : r))
  const ponFilas = (k, donde, f) => ponRegla(k, r => conLista(r, donde, filasGuardadasRegla(f(lista(r, donde).map(filaDePantallaRegla)))))
  const cierra = () => { setVentana(null); setBuscar('') }
  useEffect(() => {
    if (!ventana) return
    const tecla = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [ventana])
  const elige = (clave) => {
    const { k, donde } = ventana, ya = lista(rs[k], donde)
    ponRegla(k, r => conLista(r, donde, filasGuardadasRegla([...ya, filaNuevaRegla(clave, ya[0]?.quien || sims[0] || 'SPY')].map(filaDePantallaRegla))))
    cierra()
  }

  const filas = (k, donde) => {
    const fs = lista(rs[k], donde).map(filaDePantallaRegla)
    return (
      <div data-filas-regla={`${k}-${donde}`}>
        {fs.map((f, j) => (
          <div key={j} data-fila-regla={j}>
            {j > 0 && (
              <div style={{ marginTop: 6 }}>
                <select style={mini} aria-label={`Y / O antes de la condición ${j + 1}`} data-union value={f.union} onChange={e => ponFilas(k, donde, xs => xs.map((y, q) => q === j ? { ...y, union: e.target.value } : y))}>
                  <option value="Y">y además</option><option value="O">o bien</option>
                </select>
              </div>
            )}
            {f.rara ? (
              <div data-fila-rara style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: B.secundario }}>
                <span style={{ flex: 1 }}>Una condición que aquí no se puede editar.</span>
                <button type="button" style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1 }} aria-label="Quitar esta condición" onClick={() => ponFilas(k, donde, xs => xs.filter((_, q) => q !== j))}>×</button>
              </div>
            ) : (
              <Fila f={f} errores={erroresFilaRegla(f)} valores={{}} tarjeta="filtro" color={color} enVarias intervalo={f.velas === 'semanales' ? 'semanal' : 'diario'}
                quien={f.quien} opcionesDeQuien={opcionesQuienRegla(sims, f.quien)} ayudaQuien={AYUDA_REGLAS.quien}
                onQuien={q => { if (q === OTRO_REGLA) setOtro({ k, donde, j }); else { setOtro(null); ponFilas(k, donde, xs => xs.map((y, p) => p === j ? { ...y, quien: q } : y)) } }}
                extra={<select data-velas-regla style={mini} aria-label="Con qué velas se mira" title="Con qué velas se mira esta condición (semanales: la semana ya cerrada)" value={f.velas} onChange={e => ponFilas(k, donde, xs => xs.map((y, p) => p === j ? { ...y, velas: e.target.value } : y))}>
                  <option value="diarias">velas diarias</option><option value="semanales">velas semanales</option></select>}
                onCambia={g => ponFilas(k, donde, xs => xs.map((y, p) => p === j ? { ...g, quien: f.quien, velas: f.velas, union: f.union } : y))}
                onQuita={() => { setOtro(null); ponFilas(k, donde, xs => xs.filter((_, p) => p !== j)) }}/>
            )}
            {otro && otro.k === k && otro.donde === donde && otro.j === j && (
              <div data-otro-simbolo style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <span style={S.secundario}>Símbolo:</span>
                <BuscadorValor valores={sinLiquidez} valor="" onCambia={s => { ponFilas(k, donde, xs => xs.map((y, p) => p === j ? { ...y, quien: s } : y)); setOtro(null) }} etiqueta="Símbolo de la condición"/>
                <button type="button" style={{ ...S.enlace, fontSize: 13, color: B.secundario }} onClick={() => setOtro(null)}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 8 }}><button type="button" data-boton="anadir-condicion" disabled={fs.length >= MAX_FILAS_REGLA} title={fs.length >= MAX_FILAS_REGLA ? `Como mucho ${MAX_FILAS_REGLA} condiciones` : 'Otra condición del catálogo'}
          style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }} onClick={() => setVentana({ k, donde })}>+ condición</button></div>
      </div>
    )
  }

  // ENTONCES: el tipo y sus datos.
  const accion = (k, r) => {
    const a = r.accion || {}, ponA = (f) => ponRegla(k, x => ({ ...x, accion: f(x.accion || {}) }))
    const sim = (clave, vs, et) => <span style={{ display: 'inline-flex' }}><BuscadorValor valores={vs} valor={a[clave] || ''} onCambia={s => ponA(x => ({ ...x, [clave]: s }))} etiqueta={et} anchoNombre={0}/></span>
    const ps = a.tipo === 'pesos' ? (a.pesos || []) : [], suma = ps.reduce((t, p) => t + (Number(p.peso) || 0), 0)
    return (
      <div>
        <select style={{ ...mini, fontSize: 13 }} aria-label={`Qué hace la regla ${k + 1}`} data-accion={a.tipo} value={a.tipo || 'pesos'} onChange={e => ponRegla(k, x => ({ ...x, accion: accionNueva(e.target.value, b) }))}>
          {ACCIONES_TEXTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <Ayuda texto={AYUDA_REGLAS.accion} etiqueta="Qué hace la regla"/>
        {a.tipo === 'pesos' && (
          <div data-pesos-regla style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {ps.map((p, j) => (
              <div key={j} data-peso-regla={j} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <BuscadorValor valores={valores} valor={p.simbolo || ''} onCambia={s => ponA(x => ({ ...x, pesos: x.pesos.map((y, q) => q === j ? { ...y, simbolo: s } : y) }))} etiqueta={`Activo ${j + 1} de la regla ${k + 1}`} anchoNombre={0}/>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Numero valor={pct(p.peso)} etiqueta={`Peso del activo ${j + 1} de la regla ${k + 1}`} onCambia={v => ponA(x => ({ ...x, pesos: x.pesos.map((y, q) => q === j ? { ...y, peso: typeof v === 'number' ? v / 100 : v } : y) }))}/> %</span>
                <button type="button" data-boton="quitar-peso-regla" disabled={ps.length <= 1} title="Quitar este activo" onClick={() => ponA(x => ({ ...x, pesos: x.pesos.filter((_, q) => q !== j) }))} style={iconoRojo(ps.length > 1)}>🗑</button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" data-boton="anadir-peso-regla" disabled={ps.length >= 10} onClick={() => ponA(x => ({ ...x, pesos: [...(x.pesos || []), { simbolo: '', peso: Math.max(0, Math.round((1 - suma) * 10000) / 10000) }] }))} style={{ ...S.boton, padding: '3px 9px', fontSize: 13 }}>+ activo</button>
              <span data-suma-regla={pct(suma)} style={{ color: Math.abs(suma - 1) < 1e-9 ? VERDE : ROJO, fontSize: 13 }}>{Math.abs(suma - 1) < 1e-9 ? 'Suman 100 % ✓' : `✕ Suman ${String(pct(suma)).replace('.', ',')} %`}</span>
            </div>
          </div>
        )}
        {(a.tipo === 'moverBloque' || a.tipo === 'moverActivo') && (
          <div data-mover style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            mover <Numero valor={a.pct} etiqueta={`% que mueve la regla ${k + 1}`} onCambia={v => ponA(x => ({ ...x, pct: v }))}/> % {a.tipo === 'moverBloque' ? 'de toda la parte, desde' : 'de lo que hay en'}
            {sim('de', valores, `De dónde sale el dinero (regla ${k + 1})`)} a {sim('a', valores, `A dónde va el dinero (regla ${k + 1})`)}
          </div>
        )}
        {a.tipo === 'vender' && <div data-vender style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>vender todo {sim('de', sinLiquidez, `Qué vende la regla ${k + 1}`)}</div>}
      </div>
    )
  }

  const paso = (t, ayuda, contenido) => (
    <div data-paso-regla={t} style={{ marginTop: 10 }}>
      <div style={eti}>{t}{ayuda && <Ayuda texto={ayuda} etiqueta={t}/>}</div><div style={{ minWidth: 0 }}>{contenido}</div>
    </div>
  )
  const busqueda = catalogoRegla(buscar)
  const condicion = (id) => (
    <div key={id} data-cond-regla={id} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <button type="button" onClick={() => elige(id)} title="Añadir esta condición" style={{ ...S.enlace, color: B.texto, padding: '5px 8px', borderRadius: 5, flex: '1 1 auto', minWidth: 0 }}>{nombreCond(id)}</button>
      <Ayuda texto={explicacionCond(id)} etiqueta={nombreCond(id)} zIndice={3100}/>
    </div>
  )
  return (
    <div data-reglas-pesos={rs.length}>
      {!rs.length && <div style={{ ...S.apagado, marginBottom: 6 }}>Sin reglas: la parte compra sus pesos y los mantiene.</div>}
      {rs.map((r, k) => (
        <div key={k} data-regla={k} style={{ border: `1px solid ${B.borde}`, borderLeft: `3px solid ${color}`, borderRadius: B.radioBoton, background: B.fondo, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ color: B.titulo, flex: 1 }}>Regla {k + 1}</strong>
            <button type="button" data-boton="subir-regla" disabled={k === 0} title="Subir: se mira antes" aria-label={`Subir la regla ${k + 1}`} onClick={() => pon(mueveRegla(rs, k, -1))} style={flecha(k > 0)}>↑</button>
            <button type="button" data-boton="bajar-regla" disabled={k === rs.length - 1} title="Bajar: se mira después" aria-label={`Bajar la regla ${k + 1}`} onClick={() => pon(mueveRegla(rs, k, 1))} style={flecha(k < rs.length - 1)}>↓</button>
            <button type="button" data-boton="borrar-regla" title="Borrar la regla" aria-label={`Borrar la regla ${k + 1}`} onClick={() => { setOtro(null); pon(rs.filter((_, j) => j !== k)) }} style={iconoRojo(true)}>🗑</button>
          </div>
          {paso('SI', null, filas(k, 'si'))}
          {paso('ENTONCES', null, accion(k, r))}
          {paso('MANTENER', AYUDA_REGLAS.mantener, <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>al menos <Numero valor={r.mantenerMeses} etiqueta={`Meses que mantiene la regla ${k + 1}`} onCambia={v => ponRegla(k, x => ({ ...x, mantenerMeses: v }))}/> meses <span style={S.apagado}>(0 = no)</span></span>)}
          {paso('DESPUÉS', AYUDA_REGLAS.despues, <div>
            <select style={{ ...mini, fontSize: 13 }} aria-label={`Después de la regla ${k + 1}`} data-despues={r.despues?.tipo} value={r.despues?.tipo || 'partida'} onChange={e => ponRegla(k, x => ({ ...x, despues: despuesNuevo(e.target.value, x) }))}>
              {DESPUES_TEXTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            {r.despues?.tipo === 'cuando' && filas(k, 'despues')}
          </div>)}
          {paso('REPETIR', AYUDA_REGLAS.repetir, <select style={{ ...mini, fontSize: 13, maxWidth: '100%' }} aria-label={`Repetir la regla ${k + 1}`} data-repetir={r.repetir} value={r.repetir || 'porCaida'} onChange={e => ponRegla(k, x => ({ ...x, repetir: e.target.value }))}>
            {REPETIR_TEXTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>)}
        </div>
      ))}
      <button type="button" data-boton="anadir-regla" disabled={rs.length >= MAX_REGLAS} title={rs.length >= MAX_REGLAS ? `Como mucho ${MAX_REGLAS} reglas por parte` : 'Una regla nueva (se mira después de las que ya hay)'}
        onClick={() => pon([...rs, reglaNueva(b)])} style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }}>+ Añadir regla</button>
      {errores.length > 0 && <div data-errores-reglas style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{errores.map((e, k) => <div key={k}>✕ {e}</div>)}</div>}

      {ventana && (
        <div data-catalogo-regla role="dialog" aria-modal="true" aria-label="Añadir condición" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) cierra() }}>
          <div style={{ ...S.tarjeta, padding: 20, maxWidth: 680, width: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: B.titulo, fontWeight: 700, fontSize: 16 }}>Añadir condición · regla {ventana.k + 1} de la parte {n}</div>
            <div style={{ ...S.secundario, fontSize: 13, margin: '4px 0 10px' }}>El mismo catálogo que al crear una estrategia. Después eliges de qué símbolo es, sus números y con qué velas se mira.</div>
            <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque><input aria-label="Buscar condiciones" placeholder="Buscar: caída, media, RSI…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="catalogo-regla" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/></ConLimpiar>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" data-respuesta="cancelar-catalogo-regla" style={S.boton} onClick={cierra}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
