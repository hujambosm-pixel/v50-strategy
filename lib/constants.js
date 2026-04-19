const TYPE_MIGRATION = {
  'close_below_ma':        'price_below_ema',
  'close_above_ma':        'price_above_ema',
  'price_above_ma':        'price_above_ema',
  'price_below_ma':        'price_below_ema',
  'tecnico':               'low_setup_in',
  'atr_based':             'atr_multiple',
  'trailing_atr':          'atr_trailing',
  'breakout_low_below_ma': 'breakdown_low',
  'breakout_low':          'breakdown_low',
}

const VALID_TYPES = {
  filter:      ['sp500_above_ema','sp500_ema_fast_above_slow',
                'price_above_ema','price_below_52w_high_pct'],
  setup:       ['ema_cross_up','price_above_ema',
                'rsi_below','price_below_52w_high_pct'],
  trigger:     ['breakout_high','breakout_close',
                'open_after_n_bars','ma_direction_up',
                'rsi_cross_up','rsi_direction_up',
                'price_below_52w_high_pct'],
  abort:       ['ema_cross_down','price_below_ema'],
  exit:        ['ema_cross_down','price_below_ema',
                'rsi_above','profit_pct'],
  trigger_out: ['breakdown_low','open_after_n_bars',
                'ma_direction_down','rsi_cross_down',
                'rsi_direction_down','profit_pct'],
  stop_loss:   ['low_setup_in','below_ema',
                'fixed_pct','atr_multiple','atr_trailing'],
}

function normalizeBlock(block, sectionKey) {
  if (!block) return null
  // Extraer de estructura legacy conditions[]
  if (block.conditions?.length) {
    block = block.conditions[0]
  }
  // Migrar tipos legacy a nuevos
  if (TYPE_MIGRATION[block.type]) {
    block = { ...block, type: TYPE_MIGRATION[block.type] }
  }
  // Si el tipo no es válido para esta sección, limpiar
  const validTypes = VALID_TYPES[sectionKey] || []
  if (!validTypes.includes(block.type)) return null
  return block
}

export function normalizeDefinition(def) {
  if (!def) return { ...DEFAULT_DEFINITION }
  return {
    ...DEFAULT_DEFINITION,
    ...def,
    filter:      normalizeBlock(def?.filter,      'filter'),
    setup:       normalizeBlock(def?.setup,        'setup'),
    trigger:     normalizeBlock(def?.trigger,      'trigger'),
    abort:       normalizeBlock(def?.abort,        'abort'),
    exit:        normalizeBlock(def?.exit,         'exit'),
    trigger_out: normalizeBlock(def?.trigger_out,  'trigger_out'),
    stop_loss:   normalizeBlock(def?.stop_loss,    'stop_loss'),
    management:  def?.management || DEFAULT_DEFINITION.management,
    visuals: {
      indicators: [],
      blocks: {},
      ...def?.visuals,
    }
  }
}

export const DEFAULT_DEFINITION = {
  filter:      null,
  setup:       null,
  trigger:     null,
  abort:       null,
  exit:        null,
  trigger_out: null,
  stop_loss:   null,
  management:  { sin_perdidas: false, reentry: false },
  visuals: {
    indicators: [],
    blocks: {}
  },
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
