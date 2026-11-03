// scripts/comprobaciones/domFalso.js — un DOM mínimo para montar componentes DE VERDAD en Node (con estado y efectos), sin añadir dependencias: lo justo para react-dom/client. No pinta ni mide nada.
// Lo usan las comprobaciones (planes-pantalla.js): pon() antes de cargar react-dom, monta(elemento, reactDomClient) y, para pulsar, pulsa(nodo) (llama al manejador que React guarda en el nodo).
class Nodo {
  constructor(tipo, nombre, doc) { this.nodeType = tipo; this.nodeName = nombre; this.tagName = nombre; this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.attrs = {}; this.oyentes = {}
    const st = {}; Object.defineProperty(st, 'setProperty', { enumerable: false, value: (k, v) => { st[k] = v } }); this.style = st }
  get firstChild() { return this.childNodes[0] || null }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null }
  get nextSibling() { const h = this.parentNode?.childNodes; return h ? h[h.indexOf(this) + 1] || null : null }
  get previousSibling() { const h = this.parentNode?.childNodes; return h ? h[h.indexOf(this) - 1] || null : null }
  get options() { return this.todos(n => n.nodeName === 'OPTION') }
  get clientWidth() { return 1000 }
  get clientHeight() { return 600 }
  appendChild(n) { n.parentNode?.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n }
  insertBefore(n, ref) { n.parentNode?.removeChild(n); n.parentNode = this; const k = ref ? this.childNodes.indexOf(ref) : -1; if (k < 0) this.childNodes.push(n); else this.childNodes.splice(k, 0, n); return n }
  removeChild(n) { const k = this.childNodes.indexOf(n); if (k >= 0) this.childNodes.splice(k, 1); n.parentNode = null; return n }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null }
  hasAttribute(k) { return k in this.attrs }
  removeAttribute(k) { delete this.attrs[k] }
  setAttributeNS(_, k, v) { this.attrs[k] = String(v) }
  addEventListener(t, f) { (this.oyentes[t] ||= []).push(f) }
  removeEventListener(t, f) { this.oyentes[t] = (this.oyentes[t] || []).filter(x => x !== f) }
  dispatchEvent() { return true }
  focus() { this.ownerDocument.activeElement = this }
  blur() {}
  scrollIntoView() { this.alaVista = true }
  setSelectionRange() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600 } }
  set textContent(t) { this.childNodes.forEach(c => { c.parentNode = null }); this.childNodes = []; if (t !== '' && t != null) { const x = this.ownerDocument.createTextNode(t); x.parentNode = this; this.childNodes.push(x) } }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(c => c.textContent).join('') }
  set nodeValue(t) { this.data = t }
  get nodeValue() { return this.data }
  todos(f) { const out = []; const va = (n) => { for (const c of n.childNodes) { if (c.nodeType === 1 && f(c)) out.push(c); va(c) } }; va(this); return out }
  busca(f) { return this.todos(f)[0] || null }
  conAtributo(k, v) { return this.todos(n => n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v))) }
}
function pon() {
  if (globalThis.__domFalso) return globalThis.__domFalso
  const doc = new Nodo(9, '#document', null)
  doc.createElement = (t) => new Nodo(1, String(t).toUpperCase(), doc)
  doc.createElementNS = (ns, t) => { const n = new Nodo(1, t, doc); n.namespaceURI = ns; return n }
  doc.createTextNode = (t) => { const n = new Nodo(3, '#text', doc); n.data = String(t); return n }
  doc.createComment = (t) => { const n = new Nodo(8, '#comment', doc); n.data = String(t); return n }
  doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body'); doc.appendChild(doc.documentElement); doc.documentElement.appendChild(doc.body); doc.activeElement = doc.body; doc.head = doc.createElement('head')
  const almacen = new Map()
  const win = { document: doc, navigator: { userAgent: 'node' }, addEventListener: () => {}, removeEventListener: () => {}, scrollY: 0, innerWidth: 1200, innerHeight: 800, location: { href: 'http://localhost/', search: '', pathname: '/' }, getSelection: () => null, HTMLIFrameElement: class {}, HTMLElement: Nodo, Node: Nodo,
    localStorage: { getItem: k => almacen.has(k) ? almacen.get(k) : null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k), clear: () => almacen.clear() }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f, 0), cancelAnimationFrame: clearTimeout }
  doc.defaultView = win; win.window = win
  Object.assign(globalThis, { window: win, document: doc, localStorage: win.localStorage, HTMLElement: Nodo, HTMLIFrameElement: win.HTMLIFrameElement, requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame, IS_REACT_ACT_ENVIRONMENT: false })
  globalThis.__domFalso = { doc, almacen }
  return globalThis.__domFalso
}
// Monta un elemento en un contenedor nuevo. Devuelve { raiz (el nodo), pinta(elemento), quita() }.
function monta(elemento, reactDomClient) {
  const raiz = document.createElement('div'); document.body.appendChild(raiz)
  const r = reactDomClient.createRoot(raiz)
  r.render(elemento)
  return { raiz, pinta: (e) => r.render(e), quita: () => r.unmount() }
}
const espera = (ms = 20) => new Promise(ok => setTimeout(ok, ms))
const propsDe = (n) => { const k = Object.keys(n).find(x => x.startsWith('__reactProps$')); return k ? n[k] : {} }
const pulsa = (n) => { const e = { preventDefault() {}, stopPropagation() {}, target: n, currentTarget: n }; propsDe(n).onClick?.(e) }
const escribe = (n, valor) => { n.value = valor; propsDe(n).onChange?.({ target: n, currentTarget: n, preventDefault() {}, stopPropagation() {} }) }
module.exports = { pon, monta, espera, pulsa, escribe, propsDe }
