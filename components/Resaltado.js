// components/Resaltado.js — un texto con las letras que coinciden con lo escrito en un buscador resaltadas (V9.1063; docs/builder.md,
// §29), con el mismo color que el buscador del catálogo de condiciones. Sin distinguir mayúsculas ni acentos (lib/builder/buscar.js).
import { B } from '../lib/builder/estilo'
import { trozosResaltados } from '../lib/builder/buscar'

export default function Resaltado({ texto, consulta }) {
  if (!String(consulta || '').trim()) return texto ?? null
  return trozosResaltados(texto, consulta).map((x, k) => x.marca
    ? <mark key={k} data-resaltado style={{ background: '#5a4a12', color: B.titulo, borderRadius: 3, padding: 0 }}>{x.t}</mark>
    : <span key={k}>{x.t}</span>)
}
