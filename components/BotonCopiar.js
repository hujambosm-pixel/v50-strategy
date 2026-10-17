// «📋 Copiar para Claude»: copia al portapapeles el texto que devuelve `obtenerTexto()` (lib/exportaTexto.js) y dice
// «Copiado ✓». Si el portapapeles falla (permiso del navegador), enseña el texto en un cuadro seleccionable.
import { useState } from 'react'
import { MONO } from '../lib/utils'

// Las celdas de la primera tabla dentro de `raiz`, tal como están pintadas (texto de cada celda). Una fila es «de activo» si
// su título empieza por «Ver el rendimiento de» o «Quitar la selección de» (las filas por activo de la comparativa).
// Una etiqueta pegada al valor en la misma celda (p. ej. el % de señales ejecutadas junto a las Ops) lleva
// data-etiqueta-copiar con lo que significa: se copia aparte, entre paréntesis («317 (31% de las señales ejecutadas)»),
// en vez de pegada al número («31731%»). Con el atributo vacío, solo el paréntesis («B&H Diversif. (43 activos)»). Las
// celdas sin esas etiquetas se copian como siempre.
const textoCelda = (el) => {
  if (!el.querySelector?.('[data-etiqueta-copiar]')) return el.textContent || ''
  const c = el.cloneNode(true)
  c.querySelectorAll('[data-etiqueta-copiar]').forEach(e => {
    e.textContent = ` (${[(e.textContent || '').trim(), e.getAttribute('data-etiqueta-copiar')].filter(Boolean).join(' ')}) `
  })
  return c.textContent || ''
}
export function leeTabla(raiz) {
  const t = raiz?.querySelector?.('table')
  if (!t) return null
  const limpia = (el) => textoCelda(el).replace(/\s+/g, ' ').trim()
  return { cabeceras: [...t.querySelectorAll('thead th')].map(limpia),
    filas: [...t.querySelectorAll('tbody > tr')].map(tr => ({ celdas: [...tr.children].map(limpia), activo: /^(Ver el rendimiento de|Quitar la selección de)/.test(tr.getAttribute('title') || '') })) }
}

// obtenerTexto puede devolver una promesa (V9.992: «Copiar lote completo» lee las pruebas del registro); etiqueta: el texto del botón.
export default function BotonCopiar({ obtenerTexto, estilo = null, etiqueta = '📋 Copiar para Claude', titulo = null }) {
  const [estado, setEstado] = useState(null)   // null | 'copiado' | { manual: texto } | { error }
  const copia = async () => {
    let texto
    try { setEstado(null); texto = await obtenerTexto() } catch (e) { setEstado({ error: e?.message || 'no se pudo generar el texto' }); return }
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(texto)
      setEstado('copiado'); setTimeout(() => setEstado(e => e === 'copiado' ? null : e), 2500)
    } catch (_) { setEstado({ manual: texto }) }
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, ...(estilo || {}) }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button onClick={copia} title={titulo || 'Copia los resultados en Markdown (solo números, sin gráficos) para pegarlos en una conversación con Claude'}
          style={{ fontFamily: MONO, fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
          {etiqueta}</button>
        {estado === 'copiado' && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)' }}>Copiado ✓</span>}
        {estado?.error && <span style={{ fontFamily: MONO, fontSize: 11, color: '#ff4d6d' }}>{estado.error}</span>}
      </span>
      {estado?.manual && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-legible)' }}>El navegador no deja copiar: selecciona el texto (Ctrl+A dentro del cuadro) y cópialo a mano.
            <button onClick={() => setEstado(null)} style={{ marginLeft: 8, fontFamily: MONO, fontSize: 11, background: 'none', border: 'none', color: 'var(--text-legible)', cursor: 'pointer' }}>✕</button></span>
          <textarea readOnly value={estado.manual} onFocus={e => e.target.select()} rows={12}
            style={{ width: '100%', minWidth: 320, fontFamily: MONO, fontSize: 11, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </span>)}
    </span>
  )
}
