// components/backtesting/SelectorValores.js — Backtesting, panel izquierdo. Selector de valores (solo con «Lista manual»): buscador con ✕, ★ favoritos, listas de la Watchlist («Todas»), «Todos» / «Ninguno» y la lista con casillas y el puesto del ranking. Elemento 14 del inventario.
// Fase 1 de «el plan con lista» (docs/builder.md §76): el bloque se sacó de pages/index.js TAL CUAL; el estado sigue allí y llega
// por props con el mismo nombre que tenía.
import ConLimpiar from '../LimpiarBusqueda'
import { MONO } from '../../lib/utils'
// El buscador no distingue mayúsculas ni acentos (norma de buscadores; V9.1148).
import { sinTildes } from '../../lib/builder/buscar'

export default function SelectorValores({ mcListFilter, mcOnlyFavs, mcSearch, mcSelected, mcUniverso, rankingData, setMcListFilter, setMcOnlyFavs, setMcSearch, setMcSelected, watchlist, wlLists }) {
  return (
    <div style={{display:mcUniverso==='manual'?'flex':'none',flexDirection:'column',flex:1,minHeight:0}}>
      {/* Filtros */}
      <div style={{padding:'5px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
        <ConLimpiar valor={mcSearch||''} onLimpia={()=>setMcSearch('')} bloque estilo={{flex:1,minWidth:0}}><input type="text" placeholder="🔍 Buscar..." value={mcSearch||''} onChange={e=>setMcSearch(e.target.value)}
          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:4,minWidth:0}}/></ConLimpiar>{/* V9.1065 */}
        <button onClick={()=>setMcOnlyFavs(f=>!f)}
          style={{background:mcOnlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${mcOnlyFavs?'#ffd166':'var(--border)'}`,color:mcOnlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
          ★
        </button>
        {(()=>{
          return(
            <select value={mcListFilter||''} onChange={e=>setMcListFilter(e.target.value)}
              style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 5px',borderRadius:4,maxWidth:80}}>
              <option value="">Todas</option>
              {wlLists.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          )
        })()}
      </div>
      <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontFamily:MONO,fontSize:10,color:'#cde5ff',fontWeight:700}}>{mcSelected.length} seleccionados</div>
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>{
            const filtered=[...new Map(watchlist.map(w=>[w.symbol,w])).values()].filter(w=>{
              const matchSearch=!mcSearch||sinTildes(w.symbol).includes(sinTildes(mcSearch))||sinTildes(w.name).includes(sinTildes(mcSearch))
              const matchFav=!mcOnlyFavs||w.favorite
              const matchList=!mcListFilter||(w.list_ids||[]).some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&l.name===mcListFilter})
              return matchSearch&&matchFav&&matchList
            })
            // «Todos» AÑADE los que se ven a los ya marcados (V9.1138): antes los cambiaba, y al marcar una segunda lista se
            // desmarcaba la primera. Los marcados que no se ven van delante; si todos se ven, queda igual que antes.
            const vistos=filtered.map(w=>w.symbol), _v=new Set(vistos)
            setMcSelected(prev=>[...prev.filter(s=>!_v.has(s)),...vistos])
          }}
            style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#a8ccdf',cursor:'pointer'}}>
            Todos
          </button>
          <button onClick={()=>setMcSelected([])}
            style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#ff4d6d',cursor:'pointer'}}>
            Ninguno
          </button>
        </div>
      </div>
      <div style={{overflowY:'auto',flex:1}}>
      {[...new Map(watchlist.map(w=>[w.symbol,w])).values()].filter(w=>{
        const matchSearch=!mcSearch||sinTildes(w.symbol).includes(sinTildes(mcSearch))||sinTildes(w.name).includes(sinTildes(mcSearch))
        const matchFav=!mcOnlyFavs||w.favorite
        const matchList=!mcListFilter||(w.list_ids||[]).some(lid=>{const l=wlLists.find(x=>x.id===lid);return l&&l.name===mcListFilter})
        return matchSearch&&matchFav&&matchList
      }).sort((a,b)=>{
        const ra=rankingData[(a.symbol||'').toUpperCase()]?.rank, rb=rankingData[(b.symbol||'').toUpperCase()]?.rank
        if(ra!=null&&rb!=null) return ra-rb
        if(ra!=null) return -1
        if(rb!=null) return 1
        return a.name.localeCompare(b.name)
      }).map(w=>{
        const sel=mcSelected.includes(w.symbol)
        const rd=rankingData[(w.symbol||'').toUpperCase()]
        return(
          <div key={w.symbol} onClick={()=>setMcSelected(prev=>sel?prev.filter(s=>s!==w.symbol):[...prev,w.symbol])}
            style={{display:'flex',alignItems:'center',gap:7,padding:'5px 6px',borderRadius:3,marginBottom:2,cursor:'pointer',
              background:sel?'rgba(0,212,255,0.07)':'transparent',
              border:`1px solid ${sel?'rgba(0,212,255,0.2)':'transparent'}`}}
            onMouseOver={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)'}
            onMouseOut={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.07)':'transparent'}>
            <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel?'var(--accent)':'#3d5a7a'}`,
              background:sel?'var(--accent)':'transparent',flexShrink:0,
              display:'flex',alignItems:'center',justifyContent:'center'}}>
              {sel&&<span style={{color:'#000',fontSize:11,lineHeight:1,fontWeight:900}}>✓</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:MONO,fontSize:12,color:sel?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
              <div style={{fontFamily:MONO,fontSize:11,color:'#b0d0e8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
            </div>
            {rd?.rank!=null&&<span style={{fontFamily:MONO,fontSize:9,fontWeight:700,
              color:rd.rank===1?'#ffd700':rd.rank===2?'#c0c0c0':rd.rank===3?'#cd7f32':rd.rank<=10?'#00d4ff':'#4a7a95',
              minWidth:22,textAlign:'right',flexShrink:0}}>
              {rd.rank<=3?['🥇','🥈','🥉'][rd.rank-1]:`#${rd.rank}`}
            </span>}
            {w.favorite&&<span style={{color:'#ffd166',fontSize:12}}>★</span>}
          </div>
        )
      })}
      </div>
    </div>
  )
}
