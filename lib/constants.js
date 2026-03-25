export const DEFAULT_DEFINITION = {
  filter:   { conditions:[], logic:'AND' },
  setup:    { type:'ema_cross_up', ma_type:'EMA', ma_fast:10, ma_slow:11 },
  trigger:  { type:'breakout_high', rolling:true, max_candles:null },
  abort:    { conditions:[{type:'ema_cross_down'},{type:'close_below_ma',ma_type:'EMA',ma_period:10}] },
  stop:     { type:'min_ma_low_signal', ma_type:'EMA', ma_period:10 },
  exit:     { type:'breakout_low_after_close_below_ma', ma_type:'EMA', ma_period:10 },
  management: { sin_perdidas:true, reentry:true },
  sizing:   { type:'fixed_capital', amount:(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital??1000}catch(_){return 1000}})(), years:5 },
}

export const WATCHLIST_DEFAULT=[
  {id:null,symbol:'^GSPC',name:'S&P 500',group_name:'Índices',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'^NDX',name:'Nasdaq 100',group_name:'Índices',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'^IBEX',name:'IBEX 35',group_name:'Índices',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'^GDAXI',name:'DAX 40',group_name:'Índices',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'AAPL',name:'Apple',group_name:'Acciones',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'MSFT',name:'Microsoft',group_name:'Acciones',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'NVDA',name:'Nvidia',group_name:'Acciones',list_ids:[],favorite:false,observations:''},
  {id:null,symbol:'BTC-USD',name:'Bitcoin',group_name:'Crypto',list_ids:[],favorite:false,observations:''},
]
