export const DEFAULT_DEFINITION = {
  filter:      null,
  setup:       null,
  trigger:     null,
  abort:       null,
  exit:        null,
  trigger_out: null,
  stop_loss:   null,
  management:  { sin_perdidas: false, reentry: false },
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
