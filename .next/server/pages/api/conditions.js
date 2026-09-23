"use strict";(()=>{var e={};e.id=887,e.ids=[887],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,r)=>{Object.defineProperty(r,"l",{enumerable:!0,get:function(){return function e(r,t){return t in r?r[t]:"then"in r&&"function"==typeof r.then?r.then(r=>e(r,t)):"function"==typeof r&&"default"===t?r:void 0}}})},9879:(e,r,t)=>{t.r(r),t.d(r,{config:()=>_,default:()=>m,routeModule:()=>f});var o={};t.r(o),t.d(o,{default:()=>d});var a=t(1802),s=t(7153),n=t(6249);let i=`Eres un asistente especializado en an\xe1lisis t\xe9cnico de trading.
Tu tarea es convertir una descripci\xf3n en lenguaje natural de una condici\xf3n de mercado
en un objeto JSON estructurado.

TIPOS DISPONIBLES y sus params:
- ema_cross_up:    { ma_fast: int, ma_slow: int }         — EMA r\xe1pida cruza por encima de EMA lenta
- ema_cross_down:  { ma_fast: int, ma_slow: int }         — EMA r\xe1pida cruza por debajo de EMA lenta
- price_above_ma:  { ma_period: int, ma_type?: "EMA"|"SMA" }  — Precio > media m\xf3vil
- price_below_ma:  { ma_period: int, ma_type?: "EMA"|"SMA" }  — Precio < media m\xf3vil
- rsi_above:       { period: int, level: int }            — RSI por encima de nivel (ej. 50)
- rsi_below:       { period: int, level: int }            — RSI por debajo de nivel (ej. 30)
- rsi_cross_up:    { period: int, level: int }            — RSI cruza hacia arriba nivel
- rsi_cross_down:  { period: int, level: int }            — RSI cruza hacia abajo nivel
- macd_cross_up:   { fast: int, slow: int, signal: int }  — MACD cruza por encima de se\xf1al
- macd_cross_down: { fast: int, slow: int, signal: int }  — MACD cruza por debajo de se\xf1al

REGLAS:
- Responde \xdaNICAMENTE con JSON v\xe1lido. Sin texto adicional, sin markdown, sin backticks.
- El JSON debe tener exactamente: { "name", "description", "type", "params" }
- name: nombre corto en espa\xf1ol (m\xe1x 40 chars)
- description: explicaci\xf3n t\xe9cnica en espa\xf1ol (1-2 frases, m\xe1x 120 chars)
- Si el usuario no especifica par\xe1metros, usa los valores por defecto m\xe1s comunes.
- Si la descripci\xf3n no corresponde a ning\xfan tipo disponible, devuelve { "error": "No puedo modelar esta condici\xf3n con los tipos disponibles." }`,l=`Eres un asistente que convierte descripciones de condiciones de trading al siguiente JSON. Responde \xdaNICAMENTE con JSON v\xe1lido sin explicaciones ni markdown.`,p=`${l}
Esquema v\xe1lido: { "type": string, "ma_fast"?: number, "ma_slow"?: number, "ma_period"?: number, "ma_type"?: "EMA"|"SMA", "period"?: number, "level"?: number, "fast"?: number, "slow"?: number, "signal"?: number }
Valores de type: ema_cross_up, ema_cross_down, price_above_ma, price_below_ma, close_above_ma, close_below_ma, rsi_cross_up, rsi_cross_down, rsi_above, rsi_below, macd_cross_up, macd_cross_down
IMPORTANTE para RSI: solo existe UN par\xe1metro 'level' (n\xfamero entre 1-99). No existe 'signal', 'level2', ni ning\xfan otro par\xe1metro de nivel. Si la descripci\xf3n menciona dos niveles, usa el nivel de entrada como 'level' e ignora el segundo. Nunca incluyas campos con valor null.`,c={filter:`${l}
Esquema v\xe1lido: { "type": string, "sp500EmaR"?: number, "sp500EmaL"?: number }
Valores de type: precio_ema, ema_ema, none`,setup:p,trigger:p,abort:p,exit:p,stop:`${l}
Esquema v\xe1lido: { "type": string, "ma_period"?: number, "atr_period"?: number, "atr_mult"?: number, "pct"?: number }
Valores de type: tecnico, atr_based, fixed_pct, trailing_atr, none`},u=`Eres un asistente que convierte descripciones de estrategias de trading al siguiente esquema JSON. Responde \xdaNICAMENTE con JSON v\xe1lido, sin explicaciones, sin markdown, sin backticks.

Esquema obligatorio:
{
  "filter": { "type": null },
  "setup": {
    "indicator": null,
    "condition": null,
    "params": {}
  },
  "trigger": {
    "indicator": null,
    "condition": null,
    "params": {}
  },
  "abort": { "type": null },
  "exit": {
    "type": null,
    "params": {}
  },
  "stop": {
    "type": null,
    "params": {}
  },
  "mgmt": {
    "trailing": false,
    "reentry": false
  }
}

IMPORTANTE: cuando un campo no aplica, usa null (el valor JSON), NUNCA el string "null".
Indicadores v\xe1lidos para setup/trigger: EMA, SMA, RSI, MACD.
Valores v\xe1lidos para condition en EMA/SMA: 'crosses_above', 'crosses_below', 'price_above', 'price_below'.
Para RSI: 'below', 'above', 'crosses_above', 'crosses_below'.
Para MACD: 'crosses_signal_up', 'crosses_signal_down'.
Valores v\xe1lidos para stop.type: fixed_pct, trailing_pct, below_ma_at_signal.
Params para EMA/SMA cruce: { fast: number, slow: number }.
Params para EMA/SMA precio: { slow: number } — usa el n\xfamero de periodos mencionado exactamente.
Params para RSI: { period: number, level: number }.
Params para MACD: { fast: number, slow: number, signal: number }.

Ejemplos de periodos:
- 'precio cruza EMA 10' → params: { slow: 10 }
- 'precio sobre media 20 periodos' → params: { slow: 20 }
- 'EMA r\xe1pida 10, lenta 20' → params: { fast: 10, slow: 20 }
Siempre leer el n\xfamero de periodos exacto de la descripci\xf3n del usuario.

Si algo no se menciona, usa null.`;async function d(e,r){if("POST"===e.method&&"groq_block"===e.query.action){let{text:t,role:o}=e.body;if(!t?.trim()||!o)return r.status(400).json({error:"text y role requeridos"});let a=process.env.GROQ_API_KEY||e.headers["x-groq-key"]||"";if(!a)return r.status(400).json({error:"No hay Groq API Key configurada. A\xf1\xe1dela en ⚙ Configuraci\xf3n → Integraciones."});let s=c[o]||p;try{let e=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a}`},body:JSON.stringify({model:"llama-3.1-8b-instant",max_tokens:200,temperature:.1,messages:[{role:"system",content:s},{role:"user",content:t.trim()}]})});if(!e.ok)return r.status(502).json({error:`Groq error: ${await e.text()}`});let o=await e.json(),n=(o.choices?.[0]?.message?.content||"").replace(/```json|```/g,"").trim(),i=JSON.parse(n);if(i.error)return r.status(422).json({error:i.error});return r.status(200).json(i)}catch(e){return r.status(500).json({error:`Error parseando respuesta de Groq: ${e.message}`})}}if("POST"===e.method&&"groq_strategy"===e.query.action){let{text:t}=e.body;if(!t?.trim())return r.status(400).json({error:"text requerido"});let o=process.env.GROQ_API_KEY||e.headers["x-groq-key"]||"";if(!o)return r.status(400).json({error:"No hay Groq API Key configurada. A\xf1\xe1dela en ⚙ Configuraci\xf3n → Integraciones."});try{let e=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${o}`},body:JSON.stringify({model:"llama-3.1-8b-instant",max_tokens:600,temperature:.1,messages:[{role:"system",content:u},{role:"user",content:t.trim()}]})});if(!e.ok)return r.status(502).json({error:`Groq error: ${await e.text()}`});let a=await e.json(),s=(a.choices?.[0]?.message?.content||"").replace(/```json|```/g,"").trim(),n=JSON.parse(s);return r.status(200).json(function(e){let r,t,o;let a={};function s(e){if(!e||!e.indicator||"null"===e.indicator)return null;let r=String(e.indicator).toUpperCase(),t=e.condition||"",o=e.params||{};if("EMA"===r||"SMA"===r){let e="SMA"===r?"SMA":"EMA";if("crosses_above"===t)return{type:"ema_cross_up",ma_fast:o.fast??10,ma_slow:o.slow??20};if("crosses_below"===t)return{type:"ema_cross_down",ma_fast:o.fast??10,ma_slow:o.slow??20};if("price_above"===t)return{type:"price_above_ma",ma_period:o.slow??o.fast??50,ma_type:e};if("price_below"===t)return{type:"price_below_ma",ma_period:o.slow??o.fast??50,ma_type:e}}if("RSI"===r){if("below"===t)return{type:"rsi_below",period:o.period??14,level:o.level??30};if("above"===t)return{type:"rsi_above",period:o.period??14,level:o.level??70};if("crosses_above"===t)return{type:"rsi_cross_up",period:o.period??14,level:o.level??30};if("crosses_below"===t)return{type:"rsi_cross_down",period:o.period??14,level:o.level??70}}if("MACD"===r){if("crosses_signal_up"===t)return{type:"macd_cross_up",fast:o.fast??12,slow:o.slow??26,signal:o.signal??9};if("crosses_signal_down"===t)return{type:"macd_cross_down",fast:o.fast??12,slow:o.slow??26,signal:o.signal??9}}return null}a.filter=(r=e.filter?.type)&&"null"!==r?{type:e.filter.type}:null,a.setup=s(e.setup),a.trigger=s(e.trigger),a.abort=(t=e.abort?.type)&&"null"!==t?{type:e.abort.type}:null,a.exit=(o=e.exit?.type)&&"null"!==o?{type:e.exit.type,...e.exit.params||{}}:null;let n=e.stop;return n?.type==="below_ma_at_signal"?a.stop_loss={type:"tecnico",ma_period:n.params?.period??n.params?.ma_period??20}:n?.type==="trailing_pct"?a.stop_loss={type:"atr_based",atr_period:n.params?.period??14,atr_mult:n.params?.mult??1.5}:n?.type==="fixed_pct"?a.stop_loss={type:"tecnico",ma_period:n.params?.period??20}:a.stop_loss=null,a.management={sin_perdidas:!!e.mgmt?.trailing,reentry:!!e.mgmt?.reentry},a}(n))}catch(e){return r.status(500).json({error:`Error parseando respuesta de Groq: ${e.message}`})}}if("POST"===e.method&&"groq"===e.query.action){let{text:t}=e.body;if(!t?.trim())return r.status(400).json({error:"text requerido"});let o=process.env.GROQ_API_KEY||e.headers["x-groq-key"]||"";if(!o)return r.status(400).json({error:"No hay Groq API Key configurada. A\xf1\xe1dela en ⚙ Configuraci\xf3n → Integraciones."});try{let e=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${o}`},body:JSON.stringify({model:"llama-3.1-8b-instant",max_tokens:300,temperature:.1,messages:[{role:"system",content:i},{role:"user",content:t.trim()}]})});if(!e.ok)return r.status(502).json({error:`Groq error: ${await e.text()}`});let a=await e.json(),s=(a.choices?.[0]?.message?.content||"").replace(/```json|```/g,"").trim(),n=JSON.parse(s);return r.status(200).json(n)}catch(e){return r.status(500).json({error:`Error parseando respuesta de Groq: ${e.message}`})}}let{url:t,key:o,h:a}=function(e){let r=process.env.SUPABASE_URL||e?.headers?.["x-supa-url"]||"",t=process.env.SUPABASE_ANON_KEY||e?.headers?.["x-supa-key"]||"",o=e?.headers?.["x-supa-jwt"]||null,a={"Content-Type":"application/json",apikey:t,Authorization:`Bearer ${o||t}`};return{url:r,key:t,h:a}}(e);if(!t||!o)return r.status(500).json({error:"Supabase no configurado"});if("GET"===e.method){let e=await fetch(`${t}/rest/v1/conditions?order=created_at.asc`,{headers:a});return e.ok?r.status(200).json(await e.json()):r.status(200).json([])}if("DELETE"===e.method){let{id:o}=e.query;return o?(await fetch(`${t}/rest/v1/conditions?id=eq.${o}`,{method:"DELETE",headers:a})).ok?r.status(200).json({ok:!0}):r.status(500).json({error:"Error eliminando"}):r.status(400).json({error:"id requerido"})}if("PATCH"===e.method){let{id:o}=e.query;if(!o)return r.status(400).json({error:"id requerido"});let s={};["name","description","type","params","source","role","active"].forEach(r=>{void 0!==e.body[r]&&(s[r]=e.body[r])});let n=await fetch(`${t}/rest/v1/conditions?id=eq.${o}`,{method:"PATCH",headers:{...a,Prefer:"return=representation"},body:JSON.stringify(s)});if(!n.ok)return r.status(500).json({error:"Error actualizando"});let i=await n.json();return r.status(200).json(Array.isArray(i)?i[0]:i)}if("POST"!==e.method)return r.status(405).end();let{name:s,description:n,type:l,params:d,source:m,role:_}=e.body;if(!s||!l||!d)return r.status(400).json({error:"name, type y params son requeridos"});let f=await fetch(`${t}/rest/v1/conditions`,{method:"POST",headers:{...a,Prefer:"return=representation"},body:JSON.stringify({name:s,description:n||"",type:l,params:d,source:m||"manual",role:_||null,active:!0})});if(!f.ok){let e="";try{let r=await f.json();e=r?.message||r?.hint||JSON.stringify(r)}catch(e){}return e.includes("relation")&&e.includes("does not exist")?r.status(500).json({error:'La tabla "conditions" no existe. Ejecuta supabase_conditions_migration.sql en el SQL Editor de Supabase.'}):r.status(500).json({error:`Error guardando condici\xf3n: ${e||f.status}`})}let y=await f.json();return r.status(201).json(Array.isArray(y)?y[0]:y)}let m=(0,n.l)(o,"default"),_=(0,n.l)(o,"config"),f=new a.PagesAPIRouteModule({definition:{kind:s.x.PAGES_API,page:"/api/conditions",pathname:"/api/conditions",bundlePath:"",filename:""},userland:o})},7153:(e,r)=>{var t;Object.defineProperty(r,"x",{enumerable:!0,get:function(){return t}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(t||(t={}))},1802:(e,r,t)=>{e.exports=t(145)}};var r=require("../../webpack-api-runtime.js");r.C(e);var t=r(r.s=9879);module.exports=t})();