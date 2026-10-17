// components/AvisoUniverso.js — V9.994: si en public.universo_screener falta el año en curso, lo avisa debajo del selector de
// universo del multibacktest, con el botón «Regenerar universo» (lib/regeneraUniverso.js): calcula ese año en el navegador
// y lo escribe con copia previa, registro de la escritura y huella para revertir (sql/universo_regenera.sql). Tras escribir,
// enseña el registro y las huellas, y un botón «Revertir». onRecarga: vuelve a leer el universo.
import { useState } from 'react'
import { MONO } from '../lib/utils'
import { anioQueFalta, regeneraAnio, revierteEscritura } from '../lib/regeneraUniverso'
import { getSupaUrl, getSupaH } from '../lib/supabase'

const botonAviso = { fontFamily: MONO, fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', border: '1px solid #ffb020', background: 'rgba(255,176,32,0.12)', color: '#ffd166' }

export default function AvisoUniverso({ datos, onRecarga = () => {}, hoy = undefined }) {
  const [rg, setRg] = useState(null)   // { enCurso, texto } | { resultado, revertida? } | { error }
  const falta = datos && !datos.error ? anioQueFalta(datos.filas, hoy) : null
  if (!falta && !rg) return null
  const ctx = () => ({ url: getSupaUrl(), headers: getSupaH() })
  const regenera = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Se va a calcular la selección del 1 de enero de ${falta} (las dos reglas, N = 10, 20 y 30) con los precios de la caché y a escribirla en universo_screener. Antes se guarda una copia de lo que hubiera ese año y la escritura queda registrada con su huella, para poder revertirla. ¿Seguir?`)) return
    setRg({ enCurso: true, texto: 'Empezando…' })
    try { const r = await regeneraAnio(falta, { ...ctx(), alProgreso: (t) => setRg({ enCurso: true, texto: t }) }); setRg({ resultado: r }); onRecarga() }
    catch (e) { setRg({ error: e?.message || String(e) }) }
  }
  const revierte = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Se va a deshacer la escritura ${rg.resultado.id} (vuelve lo que había en ${rg.resultado.anio}). ¿Seguir?`)) return
    try { await revierteEscritura(rg.resultado.id, ctx()); setRg({ ...rg, revertida: true }); onRecarga() } catch (e) { setRg({ ...rg, error: e?.message || String(e) }) }
  }
  return (
    <div data-prueba="universo-falta" style={{ marginTop: 4, padding: '5px 7px', border: '1px solid #ffb020', borderRadius: 4, color: '#ffd166', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
      {falta && !rg?.resultado && <div>Falta la selección de {falta} en universo_screener: desde el 01/01/{falta} el universo no tiene elegidos.</div>}
      {falta && !rg?.enCurso && !rg?.resultado && <button onClick={regenera} style={{ ...botonAviso, marginTop: 4 }}>Regenerar universo</button>}
      {rg?.enCurso && <div>{rg.texto}</div>}
      {rg?.resultado && (<div>Escrito {rg.resultado.anio}: {rg.resultado.filas} filas ({rg.resultado.filas_antes} había antes, guardadas en la copia) · registro {rg.resultado.id} · huella antes {rg.resultado.huella_antes} · después {rg.resultado.huella_despues}
        {rg.revertida ? <span> · REVERTIDA</span> : <button onClick={revierte} style={{ ...botonAviso, marginLeft: 6, padding: '1px 6px' }}>Revertir</button>}</div>)}
      {rg?.error && <div style={{ color: '#ff4d6d' }}>{rg.error}</div>}
    </div>
  )
}
