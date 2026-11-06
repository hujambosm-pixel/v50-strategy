// components/backtesting/PanelUniverso.js — Backtesting, panel izquierdo. Universo: la lista manual de siempre o el Nasdaq-100 con los N más volátiles del año anterior o con más momentum (su regla en una frase, el aviso de 2016–2018 y «Regenerar universo»). Elemento 13 del inventario.
// Fase 1 de «el plan con lista» (docs/builder.md §76): el bloque se sacó de pages/index.js TAL CUAL; el estado sigue allí y llega
// por props con el mismo nombre que tenía.
import AvisoUniverso from '../AvisoUniverso'
import { MONO } from '../../lib/utils'
import { reglaDeUniverso, FRASE_REGLA } from '../../lib/universoMc'

export default function PanelUniverso({ mcUniverso, mcUniversoDatos, setMcUniverso, setMcUniversoDatos }) {
  return (
    <div style={{padding:'5px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
      <label style={{display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>
        Universo
        <select value={mcUniverso} onChange={e=>setMcUniverso(e.target.value)}
          style={{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 5px',borderRadius:4,minWidth:0}}>
          <option value="manual">Lista manual</option>
          {[10,20,30].map(n=><option key={n} value={`ndx_vol_${n}`}>Nasdaq-100 · {n} más volátiles</option>)}
          {[10,20,30].map(n=><option key={`m${n}`} value={`ndx_mom_${n}`}>Nasdaq-100 · {n} con más momentum</option>)}
        </select>
      </label>
      {mcUniverso!=='manual'&&(
        <div style={{fontFamily:MONO,fontSize:10,color:'#a8ccdf',lineHeight:1.5}}>
          {/* Con volatilidad, el texto de siempre tal cual; con momentum, su regla en una frase (lib/universoMc.js). */}
          {reglaDeUniverso(mcUniverso)==='momentum'?(<>
          Cada 1 de enero, los {mcUniverso.split('_').pop()} miembros del Nasdaq-100 {FRASE_REGLA.momentum}. Solo pueden recibir
          ENTRADAS mientras están en el universo; las posiciones abiertas siguen hasta su salida normal. Los activos son los del universo
          en el periodo elegido. Solo con Capital concentrado y una estrategia.
          </>):(<>
          Cada 1 de enero, los {mcUniverso.split('_').pop()} miembros del Nasdaq-100 con mayor volatilidad del año anterior. Solo pueden recibir
          ENTRADAS mientras están en el universo; las posiciones abiertas siguen hasta su salida normal. Los activos son los del universo
          en el periodo elegido. Solo con Capital concentrado y una estrategia.
          </>)}
          <div style={{color:'#ffd166',marginTop:3}}>
            El universo empieza el 01/01/2016. En 2016–2018, entre el 14 % y el 22 % de los miembros elegibles no tienen datos de precios
            (deslistados): no se pueden medir ni elegir, así que esos años salen sesgados.
          </div>
          {/* V9.994: si falta el año en curso en universo_screener, aviso y «Regenerar universo» (components/AvisoUniverso.js). */}
          <AvisoUniverso datos={mcUniversoDatos[mcUniverso]} onRecarga={()=>setMcUniversoDatos({})}/>
        </div>
      )}
    </div>
  )
}
