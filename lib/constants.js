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
  // Normalizar bloques primero para poder derivar indicadores visuales
  const normFilter   = normalizeBlock(def?.filter,      'filter')
  const normSetup    = normalizeBlock(def?.setup,        'setup')
  const normTrigger  = normalizeBlock(def?.trigger,      'trigger')
  const normAbort    = normalizeBlock(def?.abort,        'abort')
  const normExit     = normalizeBlock(def?.exit,         'exit')
  const normTrigOut  = normalizeBlock(def?.trigger_out,  'trigger_out')
  const normStopLoss = normalizeBlock(def?.stop_loss,    'stop_loss')

  // Auto-derivar indicadores visuales si visuals.indicators está vacío (estrategias antiguas)
  const existingInds = def?.visuals?.indicators || []
  let autoInds = []
  if (existingInds.length === 0) {
    const seen = new Set()
    const BLOCKS = [
      [normFilter,   'Filter'],
      [normSetup,    'Setup In'],
      [normTrigger,  'Trigger In'],
      [normAbort,    'Abort'],
      [normExit,     'Setup Out'],
      [normTrigOut,  'Trigger Out'],
      [normStopLoss, 'Stop Loss'],
    ]
    BLOCKS.forEach(([b, label]) => {
      if (!b) return
      const t = b.type || ''
      if (t.includes('ema') || t.includes('ma_cross') || t.includes('precio_ema') ||
          t.includes('price_above_ema') || t.includes('price_below_ema') || t.includes('below_ema')) {
        const fast   = b.ma_fast  || b.ema_r  || null
        const slow   = b.ma_slow  || b.ema_l  || null
        const period = b.ma_period || b.period || null
        if (fast   && !seen.has(`ema_${fast}`)  ) { seen.add(`ema_${fast}`);   autoInds.push({ id:`ema_${fast}`,   type:'ema', period:fast,   source:label, color:'#00d4ff', lineWidth:1, visible:true }) }
        if (slow   && !seen.has(`ema_${slow}`)  ) { seen.add(`ema_${slow}`);   autoInds.push({ id:`ema_${slow}`,   type:'ema', period:slow,   source:label, color:'#f59e0b', lineWidth:1, visible:true }) }
        if (!fast && !slow && period && !seen.has(`ema_${period}`)) { seen.add(`ema_${period}`); autoInds.push({ id:`ema_${period}`, type:'ema', period, source:label, color:'#00d4ff', lineWidth:1, visible:true }) }
      }
      if (t.includes('ma_direction')) {
        const period = b.period || 10
        if (!seen.has(`ema_${period}`)) { seen.add(`ema_${period}`); autoInds.push({ id:`ema_${period}`, type:'ema', period, source:label, color:'#00d4ff', lineWidth:1, visible:true }) }
      }
    })
  }

  return {
    ...DEFAULT_DEFINITION,
    ...def,
    filter:      normFilter,
    setup:       normSetup,
    trigger:     normTrigger,
    abort:       normAbort,
    exit:        normExit,
    trigger_out: normTrigOut,
    stop_loss:   normStopLoss,
    management:  def?.management || DEFAULT_DEFINITION.management,
    visuals: {
      indicators: existingInds.length > 0 ? existingInds : autoInds,
      blocks:     def?.visuals?.blocks || {},
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
