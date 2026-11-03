// components/TesisEnlace.js — «Tesis: <título> ›» o, con varias, «Tesis (N) ▾» y su lista (docs/tesis.md, «Relacionado en los dos sentidos»): en los pasos 1, 2 y 3 del Builder; con corto, la celda de «Mi trabajo» («<título>» o «N tesis ▾»).
// lista: las tesis que enlazan esa estrategia o ese plan (tesisDe de lib/tesis.js); sin ninguna, nada. onAbrir(id): esa tesis en su pestaña (la página pasa por la guardia de cambios sin guardar).
import { useState } from 'react'
import { S } from '../lib/builder/estilo'
import { menuFijo, opcionMenu, useDesplegable } from './BuilderPanel'

const enlace = { ...S.enlace, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280, display: 'inline-block', verticalAlign: 'bottom' }
export default function TesisEnlace({ lista = [], onAbrir, corto = false }) {
  const { abierto, setAbierto, caja } = useDesplegable()
  const [donde, setDonde] = useState(null)
  if (!lista.length) return null
  if (lista.length === 1) {
    const t = lista[0]
    return <button data-enlace-tesis={t.id} title={`Abrir la tesis «${t.titulo}»`} style={{ ...enlace, maxWidth: corto ? '100%' : 280 }} onClick={() => onAbrir?.(t.id)}>{corto ? t.titulo : `Tesis: ${t.titulo} ›`}</button>
  }
  return (
    <span ref={caja}>
      <button data-enlace-tesis-varias={lista.length} aria-expanded={abierto} title={lista.map(t => t.titulo).join(' · ')} style={enlace} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setDonde({ top: r.bottom + 4, left: r.left }); setAbierto(x => !x) }}>{corto ? `${lista.length} tesis ▾` : `Tesis (${lista.length}) ▾`}</button>
      {abierto && <div data-menu="tesis" style={{ ...menuFijo, position: 'fixed', ...(donde || {}), width: 280, maxWidth: '86vw' }}>
        {lista.map(t => <button key={t.id} data-enlace-tesis={t.id} title={t.titulo} style={opcionMenu} onClick={() => { setAbierto(false); onAbrir?.(t.id) }}>{t.titulo}</button>)}
      </div>}
    </span>
  )
}
