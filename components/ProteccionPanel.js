// components/ProteccionPanel.js — la protección de cada panel del Builder (V9.1066; docs/builder.md, §32). Si algo falla al pintar
// lo que hay dentro, sale un aviso DENTRO del panel, con el error y un botón «Volver a intentar», en lugar de la pantalla en negro
// de toda la app («Application error: a client-side exception has occurred»). Volver a intentar vuelve a montar lo de dentro desde
// cero (su estado se pierde, como al entrar de nuevo). Es un componente de clase: solo así atrapa React los errores al pintar.
import { Component } from 'react'
import { B } from '../lib/builder/estilo'

export default class ProteccionPanel extends Component {
  constructor(props) { super(props); this.state = { error: null, intento: 0 } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(`[${this.props.nombre || 'Panel'}] ${error?.message}`, info?.componentStack || '') }
  render() {
    const { error, intento } = this.state
    if (!error) return <div key={intento} style={{ display: 'contents' }}>{this.props.children}</div>
    return (
      <div role="alert" data-panel-error={this.props.nombre || ''} style={{ border: '1px solid #ff8b8b', borderRadius: B.radioBoton, background: 'rgba(255,139,139,0.08)', padding: '14px 16px', margin: '10px 0', color: B.texto, fontFamily: B.letra, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: '#ff8b8b' }}>No se pudo enseñar «{this.props.nombre || 'este panel'}».</div>
        <div style={{ color: B.secundario, fontSize: 13, margin: '4px 0 10px' }}>El resto de la app sigue funcionando. Detalle: {String(error?.message || error)}</div>
        <button type="button" data-volver-a-intentar onClick={() => this.setState(s => ({ error: null, intento: s.intento + 1 }))}
          style={{ fontFamily: B.letra, fontSize: 13, padding: '6px 12px', borderRadius: B.radioBoton, border: `1px solid ${B.borde}`, background: B.tarjeta, color: B.titulo, cursor: 'pointer' }}>Volver a intentar</button>
      </div>
    )
  }
}
