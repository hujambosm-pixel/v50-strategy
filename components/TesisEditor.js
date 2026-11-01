// components/TesisEditor.js — el editor de texto tipo Word de la pestaña «Tesis» (V9.1093, docs/tesis.md), con TipTap. Lo carga
// TesisPanel con next/dynamic (ssr: false), así que TipTap va en su propio trozo y el resto de la app no pesa más ni lo ve en el servidor.
// Guarda HTML (lo que da editor.getHTML()); solo se muestra lo que admiten estas extensiones: nada del contenido se ejecuta y las imágenes
// no existen (ni nodo ni botón). Las piezas puras (texto plano ↔ HTML, pegado, colores), en lib/tesis.js.
// Props: valor (lo guardado o lo que se está escribiendo), onCambio (el nuevo valor). La pantalla le pone una key nueva al abrir otra tesis.
import { useEffect, useRef, useState } from 'react'
import { EditorContent, Node as NodoTiptap, mergeAttributes, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import { Baseline, Bold, Columns3, Eraser, Highlighter, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, Minus, Redo2, Rows3, Strikethrough, Table as IconoTabla, Trash2, TriangleAlert, Underline, Undo2 } from 'lucide-react'
import { B } from '../lib/builder/estilo'
import { AVISO_IMAGEN, COLORES_LETRA, COLORES_RESALTE, HOJA, direccionEnlace, imagenEnPegado, limpiarPegado, textoAHtml, valorDelEditor } from '../lib/tesis'

const PISTA = 'Qué crees que va a pasar, qué tendría que ocurrir para entrar y qué te haría descartarla…'

// «Recuadro de aviso»: un bloque con fondo ámbar suave y borde dorado que envuelve párrafos, listas…, para destacar una conclusión.
const Recuadro = NodoTiptap.create({
  name: 'recuadro', group: 'block', content: 'block+', defining: true,
  parseHTML() { return [{ tag: 'div[data-recuadro]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-recuadro': '' }), 0] },
  addCommands() {
    return { alternaRecuadro: () => ({ state, tr, dispatch, commands }) => {
      // Con el cursor o la selección tocando un recuadro, se quita entero; si no, se pone.
      let pos = null, nodo = null
      state.doc.nodesBetween(state.selection.from, state.selection.to, (n, p) => { if (nodo) return false; if (n.type.name === this.name) { nodo = n; pos = p; return false } })
      if (!nodo) return commands.wrapIn(this.name)
      if (dispatch) tr.replaceWith(pos, pos + nodo.nodeSize, nodo.content)
      return true
    } }
  },
})

// Todo lo que admite el editor. Lo que no esté aquí (imágenes, código, fuentes, tamaños…) se descarta al abrir y al pegar.
export const extensionesTesis = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] }, blockquote: false, code: false, codeBlock: false,
    link: { openOnClick: true, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } },
  }),
  TextStyle, Color, Highlight.configure({ multicolor: true }),
  Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
  Recuadro,
  Placeholder.configure({ placeholder: PISTA }),
]

const CSS = `.ts-editor { display: flex; flex-direction: column; width: 100%; box-sizing: border-box; height: calc(100vh - 380px); min-height: 400px; resize: vertical; overflow: hidden; border: 1px solid ${B.borde}; border-radius: ${B.radioBoton}px; background: ${HOJA.fondo} }
.ts-barra { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 6px 8px; background: ${B.cabecera}; border-bottom: 1px solid ${B.borde} }
.ts-boton { display: inline-flex; align-items: center; justify-content: center; gap: 1px; min-width: 30px; height: 30px; padding: 0 5px; box-sizing: border-box; border: 1px solid transparent; border-radius: 6px; background: transparent; color: ${B.texto}; font-family: ${B.letra}; font-size: 13px; cursor: pointer }
.ts-boton:hover:not(:disabled) { background: ${B.borde} }
.ts-boton[aria-pressed="true"] { background: ${B.siguienteFondo}; border-color: ${B.siguienteBorde} }
.ts-boton:disabled { opacity: 0.35; cursor: not-allowed }
.ts-boton:focus-visible, .ts-estilo:focus-visible { outline: 2px solid ${B.enlace}; outline-offset: 1px }
.ts-sep { width: 1px; height: 20px; margin: 0 5px; background: ${B.borde} }
.ts-barra .ts-estilo { flex: none; width: auto; height: 30px; padding: 0 6px; border: 1px solid ${B.borde}; border-radius: 6px; background: ${B.fondo}; color: ${B.texto}; font-family: ${B.letra}; font-size: 13px; cursor: pointer }
.ts-zona { flex: 1; min-height: 0; overflow-y: auto; cursor: text }
.ts-zona .tiptap { min-height: 100%; box-sizing: border-box; padding: 32px 44px; outline: none; color: ${HOJA.texto}; font-family: ${B.letra}; font-size: 15px; line-height: 1.6; overflow-wrap: anywhere }
.ts-zona .tiptap > :first-child { margin-top: 0 }
.ts-zona p { margin: 0 0 0.7em }
.ts-zona h1, .ts-zona h2, .ts-zona h3 { color: ${HOJA.titulo}; line-height: 1.3; font-weight: 700; margin: 1.2em 0 0.5em }
.ts-zona h1 { font-size: 26px } .ts-zona h2 { font-size: 21px } .ts-zona h3 { font-size: 17px }
.ts-zona ul, .ts-zona ol { margin: 0 0 0.7em; padding-left: 26px }
.ts-zona ul { list-style: disc } .ts-zona ul ul { list-style: circle } .ts-zona ul ul ul { list-style: square } .ts-zona ol { list-style: decimal }
.ts-zona li > p { margin: 0 0 0.25em }
.ts-zona a { color: ${HOJA.enlace}; text-decoration: underline; cursor: pointer }
.ts-zona mark { color: inherit; padding: 0 2px; border-radius: 2px }
.ts-zona hr { border: none; border-top: 1px solid ${HOJA.borde}; margin: 1.4em 0 }
.ts-zona hr.ProseMirror-selectednode { border-top-color: ${HOJA.enlace} }
.ts-zona table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 1em }
.ts-zona th, .ts-zona td { position: relative; border: 1px solid ${HOJA.borde}; padding: 6px 10px; vertical-align: top; text-align: left }
.ts-zona th { background: ${HOJA.cabecera}; color: ${HOJA.titulo}; font-weight: 700 }
.ts-zona th p, .ts-zona td p { margin: 0 }
.ts-zona .selectedCell::after { content: ''; position: absolute; inset: 0; background: rgba(156, 194, 249, 0.18); pointer-events: none }
.ts-zona [data-recuadro] { background: ${HOJA.recuadroFondo}; border-left: 4px solid ${HOJA.recuadroBorde}; border-radius: 4px; padding: 12px 16px; margin: 0 0 1em }
.ts-zona [data-recuadro] > :last-child { margin-bottom: 0 }
.ts-zona p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; color: ${HOJA.apagado}; pointer-events: none }
.ts-menu { position: fixed; z-index: 2500; padding: 8px; background: ${B.tarjeta}; border: 1px solid ${B.borde}; border-radius: ${B.radioBoton}px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45); font-family: ${B.letra}; font-size: 13px; color: ${B.texto} }
.ts-muestras { display: grid; grid-template-columns: repeat(4, 30px); gap: 6px; margin-bottom: 8px }
.ts-muestra { width: 30px; height: 30px; border: 1px solid ${B.borde}; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 14px; background: ${HOJA.fondo} }
.ts-muestra:hover, .ts-quita:hover { outline: 2px solid ${B.enlace} }
.ts-quita { width: 100%; padding: 5px 8px; border: 1px solid ${B.borde}; border-radius: 6px; background: transparent; color: ${B.texto}; font-family: ${B.letra}; font-size: 13px; cursor: pointer }
.ts-campo { width: 260px; box-sizing: border-box; padding: 6px 8px; border: 1px solid ${B.borde}; border-radius: 6px; background: ${B.fondo}; color: ${B.texto}; font-family: ${B.letra}; font-size: 13px }
.ts-aviso { flex: none; padding: 5px 12px; background: ${HOJA.recuadroFondo}; color: #f2d675; font-size: 13px; border-bottom: 1px solid ${B.borde} }`

const Sep = () => <span className="ts-sep" aria-hidden="true"/>
const Boton = ({ id, pista, on, activo = true, accion, children, referencia }) => (
  <button ref={referencia} type="button" className="ts-boton" data-boton={id} title={pista} aria-label={pista} aria-pressed={on === undefined ? undefined : !!on} disabled={!activo}
    onMouseDown={e => e.preventDefault()} onClick={accion}>{children}</button>)
const I = { size: 16, strokeWidth: 2, 'aria-hidden': true }

export default function TesisEditor({ valor, onCambio }) {
  const base = useRef(null)      // { html, valor }: el contenido al abrir
  const ultimo = useRef(valor)   // lo último que se le ha pasado a la pantalla
  const [aviso, setAviso] = useState(false)
  const [menu, setMenu] = useState(null)   // { que: 'color' | 'resalte' | 'enlace', x, y }
  const [direccion, setDireccion] = useState('')
  const [malEnlace, setMalEnlace] = useState(false)
  const reloj = useRef(null)
  const avisa = () => { setAviso(true); clearTimeout(reloj.current); reloj.current = setTimeout(() => setAviso(false), 6000) }
  // Una imagen pegada o arrastrada no entra: sale el aviso. Si viene con texto (Word), el texto sí se pega.
  const imagen = (dt) => {
    if (!dt) return false
    const r = imagenEnPegado({ html: dt.getData('text/html'), texto: dt.getData('text/plain'), archivos: [...dt.files].map(f => f.type) })
    if (r.aviso) avisa()
    return r.bloquea
  }

  const editor = useEditor({
    extensions: extensionesTesis(),
    content: textoAHtml(valor),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,   // la barra refleja dónde está el cursor
    editorProps: {
      attributes: { 'aria-label': 'Texto de la tesis', 'data-texto-editor': '', spellcheck: 'true' },
      transformPastedHTML: limpiarPegado,
      handlePaste: (_vista, e) => imagen(e.clipboardData),
      handleDrop: (_vista, e, _trozo, movido) => (movido ? false : imagen(e.dataTransfer)),
    },
    onUpdate: ({ editor: ed }) => {
      const v = valorDelEditor(ed.getHTML(), ed.isEmpty, base.current)
      ultimo.current = v
      onCambio(v)
    },
  })
  // Lo que el editor deja del contenido al abrir es la referencia de «sin cambios» (una tesis antigua en texto plano no se marca sola).
  useEffect(() => { if (editor && !base.current) base.current = { html: editor.getHTML(), valor } }, [editor])
  // Si el valor cambia desde fuera (no por escribir), el editor lo toma sin avisar de vuelta.
  useEffect(() => {
    if (!editor || valor === ultimo.current) return
    ultimo.current = valor
    editor.commands.setContent(textoAHtml(valor), { emitUpdate: false })
    base.current = { html: editor.getHTML(), valor }
  }, [editor, valor])
  useEffect(() => () => clearTimeout(reloj.current), [])
  useEffect(() => {
    if (!menu) return
    const fuera = (e) => { if (!e.target.closest?.('[data-menu-editor]')) setMenu(null) }
    const tecla = (e) => { if (e.key === 'Escape') { setMenu(null); editor?.commands.focus() } }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [menu, editor])

  if (!editor) return <div data-texto className="ts-editor ts-texto"><style>{CSS}</style></div>

  const c = () => editor.chain().focus()
  const estilo = [1, 2, 3].find(level => editor.isActive('heading', { level })) || (editor.isActive('paragraph') ? 'p' : '')
  const cambiaEstilo = (v) => { if (v === 'p') c().setParagraph().run(); else c().setHeading({ level: Number(v) }).run() }
  const enTabla = editor.isActive('table')
  const abreMenu = (que, e) => {
    if (menu?.que === que) { setMenu(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ que, x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 4 })
    if (que === 'enlace') { setDireccion(editor.getAttributes('link').href || ''); setMalEnlace(false) }
  }
  const color = (x) => { (x ? c().setColor(x) : c().unsetColor()).run(); setMenu(null) }
  const resalte = (x) => { (x ? c().setHighlight({ color: x }) : c().unsetHighlight()).run(); setMenu(null) }
  const ponEnlace = () => {
    const href = direccionEnlace(direccion)
    if (!href) { setMalEnlace(true); return }
    if (editor.state.selection.empty && !editor.isActive('link')) c().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    else c().extendMarkRange('link').setLink({ href }).run()
    setMenu(null)
  }
  const quitaEnlace = () => { c().extendMarkRange('link').unsetLink().run(); setMenu(null) }
  const colorActual = editor.getAttributes('textStyle').color, resalteActual = editor.getAttributes('highlight').color

  return (
    <div data-texto className="ts-editor ts-texto">
      <style>{CSS}</style>
      <div className="ts-barra" role="toolbar" aria-label="Formato del texto">
        <Boton id="deshacer" pista="Deshacer (Ctrl+Z)" activo={editor.can().undo()} accion={() => c().undo().run()}><Undo2 {...I}/></Boton>
        <Boton id="rehacer" pista="Rehacer (Ctrl+Y)" activo={editor.can().redo()} accion={() => c().redo().run()}><Redo2 {...I}/></Boton>
        <Sep/>
        <select className="ts-estilo" data-estilo title="Estilo del párrafo" aria-label="Estilo del párrafo" value={estilo} onChange={e => cambiaEstilo(e.target.value)}>
          {estilo === '' && <option value="">—</option>}
          <option value="p">Texto normal</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option>
        </select>
        <Sep/>
        <Boton id="negrita" pista="Negrita (Ctrl+B)" on={editor.isActive('bold')} accion={() => c().toggleBold().run()}><Bold {...I}/></Boton>
        <Boton id="cursiva" pista="Cursiva (Ctrl+I)" on={editor.isActive('italic')} accion={() => c().toggleItalic().run()}><Italic {...I}/></Boton>
        <Boton id="subrayado" pista="Subrayado (Ctrl+U)" on={editor.isActive('underline')} accion={() => c().toggleUnderline().run()}><Underline {...I}/></Boton>
        <Boton id="tachado" pista="Tachado" on={editor.isActive('strike')} accion={() => c().toggleStrike().run()}><Strikethrough {...I}/></Boton>
        <Sep/>
        <span data-menu-editor style={{ display: 'contents' }}>
          <Boton id="color" pista="Color de letra" on={!!colorActual} accion={e => abreMenu('color', e)}><Baseline {...I} color={colorActual || 'currentColor'}/></Boton>
          <Boton id="resalte" pista="Resaltado" on={!!resalteActual} accion={e => abreMenu('resalte', e)}><Highlighter {...I}/></Boton>
        </span>
        <Sep/>
        <Boton id="vinetas" pista="Viñetas" on={editor.isActive('bulletList')} accion={() => c().toggleBulletList().run()}><List {...I}/></Boton>
        <Boton id="numerada" pista="Lista numerada" on={editor.isActive('orderedList')} accion={() => c().toggleOrderedList().run()}><ListOrdered {...I}/></Boton>
        <Boton id="sangria-mas" pista="Aumentar sangría (meter el punto dentro del anterior)" activo={editor.can().sinkListItem('listItem')} accion={() => c().sinkListItem('listItem').run()}><IndentIncrease {...I}/></Boton>
        <Boton id="sangria-menos" pista="Reducir sangría (sacar el punto)" activo={editor.can().liftListItem('listItem')} accion={() => c().liftListItem('listItem').run()}><IndentDecrease {...I}/></Boton>
        <Sep/>
        <Boton id="tabla" pista="Insertar una tabla de 3×3 con fila de cabecera" activo={!enTabla} accion={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><IconoTabla {...I}/></Boton>
        <Boton id="fila-mas" pista="Añadir una fila" activo={enTabla} accion={() => c().addRowAfter().run()}><Rows3 {...I}/>+</Boton>
        <Boton id="fila-menos" pista="Quitar la fila" activo={enTabla} accion={() => c().deleteRow().run()}><Rows3 {...I}/>−</Boton>
        <Boton id="columna-mas" pista="Añadir una columna" activo={enTabla} accion={() => c().addColumnAfter().run()}><Columns3 {...I}/>+</Boton>
        <Boton id="columna-menos" pista="Quitar la columna" activo={enTabla} accion={() => c().deleteColumn().run()}><Columns3 {...I}/>−</Boton>
        <Boton id="tabla-borrar" pista="Borrar la tabla" activo={enTabla} accion={() => c().deleteTable().run()}><Trash2 {...I}/></Boton>
        <Sep/>
        <Boton id="recuadro" pista="Recuadro de aviso, para destacar una conclusión" on={editor.isActive('recuadro')} accion={() => c().alternaRecuadro().run()}><TriangleAlert {...I}/></Boton>
        <Boton id="linea" pista="Línea separadora" accion={() => c().setHorizontalRule().run()}><Minus {...I}/></Boton>
        <span data-menu-editor style={{ display: 'contents' }}>
          <Boton id="enlace" pista="Enlace" on={editor.isActive('link')} accion={e => abreMenu('enlace', e)}><Link2 {...I}/></Boton>
        </span>
        <Boton id="quitar-formato" pista="Quitar formato" accion={() => c().unsetAllMarks().clearNodes().run()}><Eraser {...I}/></Boton>
      </div>
      {aviso && <div className="ts-aviso" data-aviso-imagen role="status">{AVISO_IMAGEN}</div>}
      <div className="ts-zona" onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); editor.commands.focus('end') } }}><EditorContent editor={editor}/></div>

      {menu && (
        <div className="ts-menu" data-menu-editor style={{ left: menu.x, top: menu.y }}>
          {menu.que === 'color' && <>
            <div className="ts-muestras">{COLORES_LETRA.map(x => <button key={x.color} type="button" className="ts-muestra" title={x.nombre} aria-label={x.nombre} style={{ color: x.color }} onMouseDown={e => e.preventDefault()} onClick={() => color(x.color)}>A</button>)}</div>
            <button type="button" className="ts-quita" onMouseDown={e => e.preventDefault()} onClick={() => color(null)}>Sin color</button>
          </>}
          {menu.que === 'resalte' && <>
            <div className="ts-muestras">{COLORES_RESALTE.map(x => <button key={x.color} type="button" className="ts-muestra" title={x.nombre} aria-label={x.nombre} style={{ background: x.color, color: HOJA.texto }} onMouseDown={e => e.preventDefault()} onClick={() => resalte(x.color)}>A</button>)}</div>
            <button type="button" className="ts-quita" onMouseDown={e => e.preventDefault()} onClick={() => resalte(null)}>Sin resaltado</button>
          </>}
          {menu.que === 'enlace' && <form onSubmit={e => { e.preventDefault(); ponEnlace() }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input className="ts-campo" autoFocus aria-label="Dirección del enlace" placeholder="https://…" value={direccion} onChange={e => { setDireccion(e.target.value); setMalEnlace(false) }}/>
            {malEnlace && <div style={{ color: '#ff8b8b' }}>Esa dirección no vale (http, https o correo).</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="ts-quita">Poner enlace</button>
              {editor.isActive('link') && <button type="button" className="ts-quita" onClick={quitaEnlace}>Quitar enlace</button>}
            </div>
          </form>}
        </div>)}
    </div>
  )
}
