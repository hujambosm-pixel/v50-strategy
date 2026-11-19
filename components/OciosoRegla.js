// components/OciosoRegla.js — «Solo cuando lo diga una regla» del DINERO OCIOSO en el plan (docs/builder.md §204; boceto
// bocetos/ocioso-con-regla.html, pestañas 1 y 4). Las condiciones son las filas del creador de estrategias (components/BuilderFila.js,
// como las reglas del bloque «Con pesos»: de quién, sus números y con qué velas se mira), TODAS con «Y»; debajo, «Si no se cumple»
// (liquidez u otro símbolo) y «Así se lee». No calcula nada: solo cambia la regla (onCambia(regla nueva)), en el formato del motor
// (lib/planes/ociosoRegla.js §203).
//   regla: { filas, siNo }; ocioso: el símbolo donde espera; valores: [{ simbolo, nombre }] con precios guardados; estrategia: su nombre
//   (con un bloque); multi: con varios bloques; Segmentos: el grupo de botones de la pantalla del plan. inicial (para las pruebas de
//   montaje): { catalogo, buscar, otroSiNo }.
import { useState, useEffect } from 'react'
import { B, C, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import BuscadorValor from './BuscadorValor'
import { Fila, entrada, mini } from './BuilderFila'
import { nombreCond, explicacionCond } from '../lib/builder/tarjetas'
import { OTRO_REGLA, MAX_FILAS_REGLA, filaDePantallaRegla, filasGuardadasRegla, catalogoRegla, filaNuevaRegla, opcionesQuienRegla, erroresFilaRegla, AYUDA_REGLAS } from '../lib/builder/reglasPesos'
import { conY, nombreOcioso, fraseOciosoRegla, AYUDA_OCIOSO_REGLA } from '../lib/builder/ociosoReglaPantalla'

const eti = { color: B.secundario, fontSize: 13, display: 'flex', alignItems: 'center', margin: '10px 0 4px' }

export default function OciosoRegla({ regla, ocioso, onCambia, valores = [], estrategia = null, multi = false, Segmentos, inicial = null }) {
  const [catalogo, setCatalogo] = useState(!!inicial?.catalogo)
  const [buscar, setBuscar] = useState(inicial?.buscar || '')
  const [otro, setOtro] = useState(null)   // la fila que está eligiendo «Otro símbolo…»
  const [otroSiNo, setOtroSiNo] = useState(!!inicial?.otroSiNo)
  const fs = (regla?.filas || []).map(filaDePantallaRegla)
  const sinLiquidez = valores.filter(v => v.simbolo !== 'LIQUIDEZ')
  const ponFilas = (f) => onCambia({ ...regla, filas: conY(filasGuardadasRegla(f(fs))) })
  const cierra = () => { setCatalogo(false); setBuscar('') }
  useEffect(() => {
    if (!catalogo) return
    const tecla = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [catalogo])
  const elige = (clave) => { ponFilas(xs => [...xs, filaDePantallaRegla(filaNuevaRegla(clave, xs[0]?.quien || ocioso))]); cierra() }
  const enOtro = otroSiNo || (regla?.siNo && regla.siNo !== 'LIQUIDEZ')
  const busqueda = catalogoRegla(buscar)
  const condicion = (id) => (
    <div key={id} data-cond-ocioso={id} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <button type="button" onClick={() => elige(id)} title="Añadir esta condición" style={{ ...S.enlace, color: B.texto, padding: '5px 8px', borderRadius: 5, flex: '1 1 auto', minWidth: 0 }}>{nombreCond(id)}</button>
      <Ayuda texto={explicacionCond(id)} etiqueta={nombreCond(id)} zIndice={3100}/>
    </div>
  )
  return (
    <div data-ocioso-regla={fs.length}>
      <div style={eti}>Está en {nombreOcioso(ocioso).replace(/^el /, '')} mientras se cumpla todo esto:<Ayuda texto={AYUDA_OCIOSO_REGLA.filas} etiqueta="Las condiciones del dinero ocioso"/></div>
      {fs.map((f, j) => (
        <div key={j} data-fila-ocioso={j}>
          {j > 0 && <div style={{ ...S.apagado, marginTop: 6 }}>y además</div>}
          {f.rara ? (
            <div data-fila-rara style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: B.secundario }}>
              <span style={{ flex: 1 }}>Una condición que aquí no se puede editar.</span>
              <button type="button" style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1 }} aria-label="Quitar esta condición" onClick={() => ponFilas(xs => xs.filter((_, q) => q !== j))}>×</button>
            </div>
          ) : (
            <Fila f={f} errores={erroresFilaRegla(f)} valores={{}} tarjeta="filtro" color={C.azul} enVarias intervalo={f.velas === 'semanales' ? 'semanal' : 'diario'}
              quien={f.quien} opcionesDeQuien={opcionesQuienRegla([ocioso].filter(s => s && s !== 'LIQUIDEZ'), f.quien)} ayudaQuien={AYUDA_REGLAS.quien}
              onQuien={q => { if (q === OTRO_REGLA) setOtro(j); else { setOtro(null); ponFilas(xs => xs.map((y, p) => p === j ? { ...y, quien: q } : y)) } }}
              extra={<select data-velas-ocioso style={mini} aria-label="Con qué velas se mira" title="Con qué velas se mira esta condición (semanales: la semana ya cerrada)" value={f.velas} onChange={e => ponFilas(xs => xs.map((y, p) => p === j ? { ...y, velas: e.target.value } : y))}>
                <option value="diarias">velas diarias</option><option value="semanales">velas semanales</option></select>}
              onCambia={g => ponFilas(xs => xs.map((y, p) => p === j ? { ...g, quien: f.quien, velas: f.velas, union: 'Y' } : y))}
              onQuita={() => { setOtro(null); ponFilas(xs => xs.filter((_, p) => p !== j)) }}/>
          )}
          {otro === j && (
            <div data-otro-simbolo style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={S.secundario}>Símbolo:</span>
              <BuscadorValor valores={sinLiquidez} valor="" onCambia={s => { ponFilas(xs => xs.map((y, p) => p === j ? { ...y, quien: s } : y)); setOtro(null) }} etiqueta="Símbolo de la condición"/>
              <button type="button" style={{ ...S.enlace, fontSize: 13, color: B.secundario }} onClick={() => setOtro(null)}>Cancelar</button>
            </div>
          )}
        </div>
      ))}
      {!fs.length && <div style={{ color: C.rojo, fontSize: 13 }}>Pon al menos una condición.</div>}
      <div style={{ marginTop: 8 }}><button type="button" data-boton="anadir-condicion-ocioso" disabled={fs.length >= MAX_FILAS_REGLA} title={fs.length >= MAX_FILAS_REGLA ? `Como mucho ${MAX_FILAS_REGLA} condiciones` : 'Otra condición del catálogo, sobre el ocioso u otro símbolo'}
        style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }} onClick={() => setCatalogo(true)}>+ condición</button></div>

      <div style={eti}>Si no se cumple<Ayuda texto={AYUDA_OCIOSO_REGLA.siNo} etiqueta="Si no se cumple"/></div>
      <Segmentos etiquetaGrupo="Si no se cumple" valor={enOtro ? 'OTRO' : 'LIQUIDEZ'} opciones={[['LIQUIDEZ', 'Espera en liquidez'], ['OTRO', 'En otro símbolo…']]}
        onCambia={v => { if (v === 'OTRO') setOtroSiNo(true); else { setOtroSiNo(false); onCambia({ ...regla, siNo: 'LIQUIDEZ' }) } }}/>
      {enOtro && <div data-sino-otro style={{ marginTop: 8 }}><BuscadorValor valores={sinLiquidez} valor={regla?.siNo && regla.siNo !== 'LIQUIDEZ' ? regla.siNo : ''} onCambia={s => onCambia({ ...regla, siNo: s })} etiqueta="Símbolo donde espera si no se cumple"/></div>}

      <div data-asi-se-lee-ocioso style={{ ...S.secundario, fontSize: 13, marginTop: 10, lineHeight: 1.45 }}><strong style={{ color: B.texto }}>Así se lee:</strong> {fraseOciosoRegla(regla, ocioso, { estrategia, multi })}</div>

      {catalogo && (
        <div data-catalogo-ocioso role="dialog" aria-modal="true" aria-label="Añadir condición" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) cierra() }}>
          <div style={{ ...S.tarjeta, padding: 20, maxWidth: 680, width: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: B.titulo, fontWeight: 700, fontSize: 16 }}>Añadir condición · dinero ocioso</div>
            <div style={{ ...S.secundario, fontSize: 13, margin: '4px 0 10px' }}>El mismo catálogo que al crear una estrategia. Después eliges de qué símbolo es, sus números y con qué velas se mira.</div>
            <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque><input aria-label="Buscar condiciones" placeholder="Buscar: media, caída, RSI…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="catalogo-ocioso" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/></ConLimpiar>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" data-respuesta="cancelar-catalogo-ocioso" style={S.boton} onClick={cierra}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
