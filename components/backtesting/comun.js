// components/backtesting/comun.js — lo que comparten pages/index.js y «La cartera por dentro» del Backtesting (useCarteraPorDentro.js y,
// más adelante, el plan): colores de las series, saneado de curvas, capital de una respuesta, nombre de un indicador y apiFetch.
// Se sacó de pages/index.js TAL CUAL (fase 4 de «el plan con lista», docs/builder.md §82); solo se añadió «export».
import { fetchConSesion } from '../../lib/supabase'
import { loadSettings } from '../../lib/settings'

// ── MultiCartChart ───────────────────────────────────────────
// ── Colores de las series ───────────────────────────────────────────────────
// Cada gráfico dibuja a la vez unas series con paleta y otras con color FIJO por significado. Una serie
// de paleta que repita uno de esos colores fijos se lee como si fuera esa otra cosa, así que cada paleta
// excluye los fijos con los que convive:
//   modo Estrategias → B&H Diversificado #a0b4c8, B&H SP500 #9b72ff y la cartera combinada #ffd166
//   modo Activos     → Total estrategia #00e5a0 y No invertido #8aadcc  (allí no hay B&H, pero se
//                      excluyen igualmente los suyos para que un activo nunca se disfrace de benchmark)
export const MC_COLOR_TOTAL='#00e5a0', MC_COLOR_CAJA='#8aadcc'
// Estrategias, por orden de ejecución. Ocho tonos sin dos verdes próximos: antes convivían #00e5a0,
// #4ecdc4 y #c8f7c5, y además #9b72ff era EXACTAMENTE el del B&H SP500.
// ── Modo Activos del gráfico de equity ──────────────────────────────────────
// Doce tonos repartidos por el círculo cromático, saltándose la banda del verde (la del total) y la del
// violeta (la del SP500). Los ocho primeros son de familias distintas; los cuatro últimos repiten familia
// con una luminosidad muy distinta —marrón frente a naranja, oliva frente a lima, petróleo frente a cian,
// púrpura frente a magenta—, que es lo que se puede hacer con doce colores quitando dos bandas enteras.
export const COLORES_ACTIVO=[
  '#00d4ff', // cian
  '#ff9a3c', // naranja
  '#e879f9', // magenta
  '#c3e63a', // lima
  '#5ea8ff', // azul
  '#ff5c5c', // rojo
  '#ffd166', // amarillo
  '#ff6bb5', // rosa
  '#b5651d', // marrón
  '#7a9b2e', // oliva
  '#0090b3', // petróleo
  '#c04ad6', // púrpura
]
// Hash estable del símbolo: el mismo activo pide siempre el mismo color, entre ejecuciones y entre
// estrategias. No basta por sí solo, porque dos símbolos distintos pueden caer en el mismo índice.
export const _hashSimbolo=(sym)=>{let h=0;const s=String(sym);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h}
// Asignación sin colisiones DENTRO de un mismo gráfico: cada activo pide el color de su hash y, si ya lo
// tiene otro, se lleva el siguiente libre de la paleta. El orden es alfabético para que el reparto no
// dependa del orden en que venga la respuesta. A partir del activo número 13 empieza otra vuelta: los
// mismos colores, pero con trazo discontinuo, que es lo que los separa de la vuelta anterior.
export const asignaColoresActivos=(simbolos)=>{
  const n=COLORES_ACTIVO.length
  const usados=new Set()
  const out={}
  ;[...simbolos].sort().forEach((sym,i)=>{
    if(i%n===0) usados.clear()            // cada vuelta reparte la paleta entera otra vez
    let k=_hashSimbolo(sym)%n
    for(let j=0;j<n&&usados.has(k);j++) k=(k+1)%n
    usados.add(k)
    out[sym]={color:COLORES_ACTIVO[k],dashed:i>=n}
  })
  return out
}
// Saneado antes de entregar una serie a lightweight-charts: fechas únicas y ascendentes y valores
// finitos. Una sola fecha repetida o un NaN matan la línea en silencio, sin error ni aviso.
// Ids de las dos series que no son un activo. Por defecto la caja va OCULTA —es capital, no resultado,
// y su escala tapa el resto— y todo lo demás visible, así que el estado solo guarda lo que el usuario
// cambia: `undefined` significa "como viene de fábrica".
export const MC_ID_CAJA='__caja__', MC_ID_TOTAL='__totalEstrategia__'
// Centinela de "todas las estrategias" para mcHistStratId. Un id imposible para una estrategia real, que
// son uuid de Supabase.
export const MC_TODAS='__todas__'
// ── Nombre legible de un indicador ──────────────────────────────────────────
// La clave del vocabulario NO describe el indicador: `ema3` es la EMA20 en la estrategia que la usa. El
// tipo sale de la clave y el PERIODO de los params de la estrategia, que es el único sitio donde está.
// `params` lleva el nombre del parámetro en cada familia, así que hace falta la tabla: no hay regla.
export const NOMBRE_INDICADOR={
  emaR:      {tipo:'EMA', periodos:['emaPeriod','emaR','ma_fast','emaFast','emaRapida']},
  emaL:      {tipo:'EMA', periodos:['emaL','ma_slow','emaSlow','emaLenta']},
  emaFast:   {tipo:'EMA', periodos:['emaPeriod','ma_fast','emaFast']},
  emaSlow:   {tipo:'EMA', periodos:['ma_slow','emaSlow']},
  ema3:      {tipo:'EMA', periodos:['emaPeriod','ema3Period','maPeriod']},
  bbUpper:   {tipo:'BB sup',   periodos:['bbPeriod'], extra:['bbStdDev']},
  bbMid:     {tipo:'BB media', periodos:['bbPeriod'], extra:['bbStdDev']},
  bbLower:   {tipo:'BB inf',   periodos:['bbPeriod'], extra:['bbStdDev']},
  rsi:       {tipo:'RSI',        periodos:['rsiPeriod']},
  rsiMA:     {tipo:'MA del RSI', periodos:['maPeriod','rsiMaPeriod']},
  macdLine:  {tipo:'MACD',        periodos:['macdFast'], extra:['macdSlow','macdSignal']},
  signalLine:{tipo:'Señal MACD',  periodos:['macdSignal']},
  histogram: {tipo:'Histograma MACD', periodos:[]},
  volume:    {tipo:'Volumen',        periodos:[]},
  volumeAvg: {tipo:'Media de volumen', periodos:['volumePeriod','volPeriod']},
}
// Devuelve SIEMPRE algo legible. Si no se encuentra el periodo, se queda el tipo a secas: un nombre
// incompleto es mejor que uno que engaña, y la clave cruda no sale nunca.
export const nombreIndicador=(clave, params, intervalo) => {
  const def=NOMBRE_INDICADOR[clave]
  if(!def) return String(clave)                       // clave fuera de la tabla: al menos no se inventa
  const num=(k)=>{const v=params?.[k];const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
  const periodo=(def.periodos||[]).map(num).find(v=>v!=null)??null
  const extras=(def.extra||[]).map(num).filter(v=>v!=null)
  let txt=def.tipo
  if(periodo!=null) txt+=` ${[periodo,...extras].join('·')}`
  if(intervalo==='semanal'||intervalo==='diario') txt+=` (${intervalo})`
  return txt
}
export const mcVisibleActivo=(estado,id)=>estado[id]!==undefined?estado[id]:id!==MC_ID_CAJA
export const saneaCurva=(datos)=>{
  const porFecha=new Map()
  for(const p of datos||[]) if(p&&typeof p.date==='string'&&Number.isFinite(p.value)) porFecha.set(p.date,p.value)
  return [...porFecha.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>({date,value}))
}
// Capital inicial de UNA respuesta concreta, nunca del formulario: un resultado que lleve rato en
// memoria pudo ejecutarse con otro capital del que hay tecleado ahora. La fuente buena es n × slotCapital,
// que es como el motor lo reparte (slotCapital = capitalIni / n, división exacta); si esos dos campos no
// viajan —respuesta anterior a V9.760— cae al primer punto de la curva compuesta, que arranca en el
// capital. Devuelve null cuando no hay forma de saberlo, para que quien llame decida.
export const capitalDeRespuesta=(r)=>{
  if(!r) return null
  if(Number.isFinite(r.n)&&Number.isFinite(r.slotCapital)) return r.n*r.slotCapital
  return Number.isFinite(r.compoundCurve?.[0]?.value)?r.compoundCurve[0].value:null
}
// apiFetch — wrapper de fetch que añade el JWT activo en x-supa-jwt.
//
// TODA llamada a una ruta de /api/ que hable con Supabase pasa por aquí. Hoy da igual —el servidor
// acepta peticiones sin JWT y cae a la clave anónima—, pero en cuanto empiece a exigirlo, una llamada
// que se haya quedado fuera no falla de forma visible: devuelve 401 y la interfaz enseña una lista
// vacía, indistinguible de «no hay datos».
//
// Las rutas que NO hablan con Supabase pueden seguir usando fetch a secas: /api/search, /api/markets,
// /api/chartdata, /api/closes, /api/sp500history, /api/fundamentales y /api/status son proxies a Yahoo
// sin nada del usuario, y mandarles un JWT no aporta nada.
// El reintento ante 401/403 lo pone fetchConSesion, compartido con lib/conditions.js: un 401 sin
// tratar no se ve como error, se ve como una lista vacía.
export function apiFetch(url, opts={}) {
  return fetchConSesion(url, opts, (jwt)=>{
    const headers={...(opts.headers||{})}
    if(jwt) headers['x-supa-jwt']=jwt
    // Caché de precios (Ajustes → Integraciones, apagada por defecto): con ella encendida, las rutas de
    // backtest —datos (también el ranking), multibacktest y asset-detail— leen las velas de la caché en
    // vez de descargarlas enteras de Yahoo. Ver lib/cachePreciosServidor.js.
    if(loadSettings()?.precios?.usarCache===true) headers['x-cache-precios']='1'
    return headers
  })
}
