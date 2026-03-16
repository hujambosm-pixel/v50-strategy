import { useState } from 'react'
import { MONO } from '../lib/utils'

export default function MetricRow({label,value,color,tip}){
  const [hov,setHov]=useState(false)
  return(
    <tr style={{borderBottom:'1px solid rgba(26,45,69,0.5)',position:'relative',background:hov?'rgba(0,212,255,0.03)':'transparent'}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <td style={{padding:'4px 6px 4px 10px',fontFamily:MONO,fontSize:10,color:'#4a7a95',whiteSpace:'nowrap'}}>
        {label}
        {tip&&<span style={{marginLeft:3,color:hov?'#3a6a8a':'#2a4060',cursor:'help',fontSize:9}}>ⓘ</span>}
      </td>
      <td style={{padding:'4px 10px 4px 4px',textAlign:'right',fontFamily:MONO,fontSize:10,fontWeight:700,color:color,whiteSpace:'nowrap'}}>{value}</td>
      <td style={{padding:0,border:'none',position:'relative'}}>
        {hov&&tip&&(
          <div style={{position:'fixed',right:10,zIndex:999,pointerEvents:'none',width:240}}>
            <div style={{background:'#0a1520',border:'1px solid #1a4060',borderRadius:5,padding:'8px 10px',fontFamily:MONO,fontSize:9,color:'#8abccc',lineHeight:1.6,boxShadow:'0 6px 24px rgba(0,0,0,0.7)'}}>
              <div style={{color:'#4a8aaa',fontWeight:700,marginBottom:3,fontSize:10}}>{label}</div>
              {tip}
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}
