// pages/api/asset-detail.js — indicadores y zonas de filtro de UN activo bajo UNA estrategia.
//
// Por qué un endpoint aparte y no un campo más del multibacktest: a resolución diaria, las series de
// indicadores de todos los activos no caben en la respuesta —unos 3,4 MB con 20 activos y 10 años, sobre
// un límite de 4,5 MB—, y además casi nunca se miran. Aquí se paga solo el activo que el usuario acaba de
// seleccionar, que son unas decenas de KB.
//
// REGLA: este endpoint NO reimplementa el motor. Importa de multibacktest.js las mismas funciones que usa
// el backtest —la descarga, el sandbox y los alineados—, de modo que no puede divergir de él. Si el motor
// cambia, cambia para los dos a la vez.
import { fetchData, fetchDataConMotivo, runCodeJsAsset, buildAlignedCloses, buildAlignedWeekly, calcEMA } from './multibacktest'
import { marcaBloqueadas } from '../../lib/graficoEstrategia'
import { velasCalentamiento } from '../../lib/periodo'
import { exigeAuth } from '../../lib/verificaJwt'
import { normalizaFiltrosEntrada, hayFiltrosActivos, clavesAuxiliares, construirFiltroActivoMap,
         requiereSemanalDelActivo, proyectarSemanal, fuerzaFiltrosSemanales, motivosDeBloqueo } from '../../lib/filtros'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Vocabulario FIJO de series, el mismo que consume datos.js al inyectarlas en las velas. Cualquier otra
// clave que devuelva el code_js se ignora: sin esta lista, una estrategia con un `indicators` creativo
// podría engordar la respuesta con lo que le diera la gana.
// `escala` dice sobre qué eje vive cada una. El cliente solo dibuja las de precio sobre las velas: meter
// un RSI de 0 a 100 o un volumen de millones en el eje del precio aplasta las velas contra el suelo.
const SERIES = {
  emaR:       'precio',
  emaL:       'precio',
  ema3:       'precio',
  bbUpper:    'precio',
  bbMid:      'precio',
  bbLower:    'precio',
  macdLine:   'macd',
  signalLine: 'macd',
  histogram:  'macd',
  rsi:        'rsi',
  rsiMA:      'rsi',
  volume:     'volumen',
  volumeAvg:  'volumen',
}
// Alias que datos.js acepta para la misma serie, por estrategias antiguas.
const ALIAS = { emaFast: 'emaR', emaSlow: 'emaL', rsiLine: 'rsi' }
// Los dos únicos escalares del vocabulario: niveles de sobrecompra y sobreventa del RSI.
const NIVELES = { obLevel: 'obLevel', rsiOB: 'obLevel', osLevel: 'osLevel', rsiOS: 'osLevel' }
// Claves que esta ruta ya transporta en `indicators`. Una serie que la estrategia declare en
// `grafico.series` con OTRA clave entra también en `indicators`, con su panel como escala: así pasa por
// la misma conversión y la misma proyección semanal que las demás. Ver lib/graficoEstrategia.js.
const CONOCIDAS_GRAFICO = new Set([...Object.keys(SERIES), ...Object.keys(ALIAS), ...Object.keys(NIVELES)])

const finito = (v) => typeof v === 'number' && Number.isFinite(v)

// Array por índice → [{date, value}] con las fechas de las barras del MOTOR.
// Solo se acepta un array de la MISMA longitud que las barras, que es el contrato que asume datos.js al
// inyectarlas por índice. Cualquier otra cosa —un escalar, un null, un objeto, un array de otra longitud—
// se ignora y se anota el motivo: una clave inesperada no puede tumbar la respuesta entera.
// Los valores no finitos se caen: lightweight-charts no dibuja una serie con un NaN dentro, y los
// primeros valores de cualquier media móvil son null hasta que hay periodo suficiente.
function aSerie(arr, fechas) {
  if (!Array.isArray(arr)) return { serie: null, motivo: `no es un array (${arr === null ? 'null' : typeof arr})` }
  if (arr.length !== fechas.length) return { serie: null, motivo: `longitud ${arr.length}, se esperaban ${fechas.length}` }
  const out = []
  for (let i = 0; i < arr.length; i++) if (finito(arr[i])) out.push({ date: fechas[i], value: arr[i] })
  return out.length ? { serie: out, motivo: null } : { serie: null, motivo: 'ningún valor finito' }
}

// Zonas donde el filtro impedía entrar, a partir del mapa fecha → ¿permitido?. Mismo recorrido que hace
// el multibacktest, sin sus dos restricciones: aquí las zonas son de ESTE activo y se emiten aunque haya
// filtros de ámbito activo, porque no se van a reutilizar para ningún otro.
function zonasDeMapa(barras, filtroActivoMap) {
  const zonas = []
  let ini = null
  for (const bar of barras) {
    const bloqueado = !filtroActivoMap[bar.date]
    if (bloqueado && ini === null) ini = bar.date
    else if (!bloqueado && ini !== null) { zonas.push({ from: ini, to: bar.date }); ini = null }
  }
  if (ini !== null) zonas.push({ from: ini, to: barras[barras.length - 1].date })
  return zonas
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // AUTENTICACIÓN OBLIGATORIA. Sin JWT válido no se sirve nada: 401 antes de tocar Supabase o
  // cualquier proveedor. Incluye las acciones que no hablan con la base de datos, a propósito.
  // La única excepción es que el verificador no haya podido comprobar el token (JWKS caído): ahí
  // exigeAuth deja pasar con el token del cliente y lo registra. Ver lib/verificaJwt.js.
  const auth = await exigeAuth('asset-detail', req, req.query?.action)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  // Esta ruta no miraba la cabecera: leía la estrategia SIEMPRE con la clave anónima, así que la sesión
  // del usuario no llegaba a Supabase ni aunque el cliente la mandara. Ahora se reenvía cuando llega.
  // Local a la petición, no en una variable de módulo: dos peticiones a la vez en la misma instancia se
  // pisarían el token.
  const _jwt = req.headers['x-supa-jwt'] || null
  const { symbol, strategyId, cfg: cfgInput, intervalo, intervaloVelas, filtros: filtrosCfg, isNoStrategy = false,
          comisiones = null } = req.body || {}
  if (!symbol) return res.status(400).json({ error: 'symbol requerido' })
  const cfg = cfgInput || {}
  // Testigo del paso en curso, para que un fallo diga DÓNDE se rompió y no solo qué excepción salió.
  let paso = 'inicio'

  try {
    paso = 'cargar estrategia'
    // 1. code_js y params de la estrategia, igual que el multibacktest: params de Supabase por encima
    //    del cfg del formulario.
    // `stratParams` aparte de `effectiveCfg`: el calentamiento se calcula con los periodos de la
    // ESTRATEGIA, no con las claves del cfg del formulario.
    let codeJs = null, effectiveCfg = cfg, paramsEstrategia = {}
    if (strategyId && SUPA_URL && SUPA_KEY) {
      try {
        const sr = await fetch(
          `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js,params`,
          { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_jwt}` } }
        )
        if (sr.ok) {
          const row = (await sr.json())?.[0] || {}
          codeJs = row.code_js || null
          let stratParams = {}
          try {
            stratParams = row.params ? (typeof row.params === 'string' ? JSON.parse(row.params) : row.params) : {}
          } catch(_) {}
          paramsEstrategia = stratParams
          effectiveCfg = { ...cfg, ...stratParams }
        }
      } catch(_) { codeJs = null }
    }
    if (!codeJs && !isNoStrategy) return res.status(400).json({ error: 'La estrategia no tiene código ejecutable (code_js)' })

    paso = 'descargar barras'
    // 2. Las MISMAS barras, el MISMO intervalo y el MISMO calentamiento con los que corrió el
    //    backtest. Si aqui el calentamiento fuera otro, las curvas de este panel no serian las que
    //    miró la estrategia y el panel diria una cosa y el backtest otra.
    const esSemanal = intervalo === 'semanal'
    const assetInterval = esSemanal ? '1wk' : '1d'
    // El filtro es la ventana operativa: en semanal no puede ser diario (lib/filtros.js). Se
    // normaliza AQUI, antes de descargar, porque sus periodos cuentan para el calentamiento.
    const _ff = fuerzaFiltrosSemanales(normalizaFiltrosEntrada(filtrosCfg), esSemanal)
    const filtrosLista = _ff.lista
    if (_ff.forzados.length) console.log(`[filtros] ${symbol}: estrategia semanal, filtros forzados a semanal: ${_ff.forzados.join(', ')}`)
    const nCal = velasCalentamiento(paramsEstrategia, filtrosLista, esSemanal ? 'semanal' : 'diario')
    const _cal = { calentamiento: nCal, conCalentamiento: true }
    const _d = await fetchDataConMotivo(symbol, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval, nCal)
    // `barras` es el PERIODO (las fechas que se devuelven); `barrasConCal` lleva el calentamiento y
    // es lo unico que ve la estrategia.
    const barras = _d.data
    if (!barras?.length) return res.status(404).json({ error: `Sin datos para ${symbol}` })
    const barrasConCal = _d.dataConCal ?? barras
    // SP500 diario: es lo que el motor inyecta como sp500Close en cada barra, en los dos intervalos.
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, '1d', _cal) } catch(_) {}

    paso = 'ejecutar estrategia'
    // 3. El sandbox, por el mismo camino que el backtest. El capital solo afecta a los trades, que aquí
    //    se descartan: las series de indicadores no dependen de él.
    // Los indicadores vuelven ya en la rejilla del PERIODO: runCodeJsAsset los recorta con `iDesde`.
    const { indicators = {}, filterZones: zonasSandbox = [], grafico = null } =
      // Esta ruta descarta las operaciones y solo usa las series de indicadores, asi que la
      // comision no cambia nada de lo que devuelve. Se pasa igual para que el sandbox corra con la
      // MISMA configuracion que el backtest: si algun dia esta ruta devolviera las operaciones,
      // no habria que acordarse de esto.
      codeJs ? runCodeJsAsset(barrasConCal, sp500Data, codeJs, cfg.capitalIni ?? 10000, cfg.years ?? 5, effectiveCfg,
                              { desde: _d.periodo.desde, iDesde: _d.iDesde ?? 0, hasta: _d.periodo.hasta,
                                grafico: true, conocidasGrafico: CONOCIDAS_GRAFICO }, comisiones)
             : { indicators: {}, filterZones: [] }

    paso = 'filtros'
    // 4. Filtros: se rehace el mapa fecha → ¿permitido? de ESTE activo, con las mismas piezas que el
    //    multibacktest. Si no hay ninguno activo, valen las zonas que devuelva la propia estrategia
    //    —algunas se calculan su filtro por dentro—, que es el mismo orden de preferencia de datos.js.
    // `filtrosLista` se calcula antes de la descarga: sus periodos cuentan para el calentamiento.
    const anyFiltroOn = hayFiltrosActivos(filtrosLista)
    let filterZones = Array.isArray(zonasSandbox) ? zonasSandbox : []
    if (anyFiltroOn) {
      // Fechas de la serie CON calentamiento: la EMA del filtro tiene que llegar convergida al primer
      // dia del periodo, igual que en el backtest.
      const assetDates = barrasConCal.map(d => d.date)
      const filterAuxData = {}
      // clavesAuxiliares devuelve un SET, no un array: multibacktest lo recorre con for...of y aquí se
      // llamó a .map, que un Set no tiene. De ahí el "l.map is not a function" que tumbaba el endpoint
      // entero siempre que hubiera un filtro activo. Se convierte explícitamente.
      const auxKeys = [...clavesAuxiliares(filtrosLista, '1wk', '1d')]
      await Promise.all(auxKeys.map(async akey => {
        const c = akey.lastIndexOf(':')
        const ticker = akey.slice(0, c), iv = akey.slice(c + 1)
        try { filterAuxData[akey] = await fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, iv, _cal) } catch(_) {}
      }))
      // Serie semanal del propio activo, solo si algún filtro de ámbito activo la pide y corremos en
      // diario: en semanal las barras YA son esas.
      let semanalActivo = null
      if (requiereSemanalDelActivo(filtrosLista) && !esSemanal) {
        try { semanalActivo = await fetchData(symbol, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, '1wk', _cal) } catch(_) {}
      }
      const resolveFilterData = (ticker, iv) =>
        (ticker === '^GSPC' && iv !== '1wk') ? sp500Data : (filterAuxData[`${ticker}:${iv}`] ?? sp500Data)
      const alineado = (src, semanal, periodo) => semanal
        ? buildAlignedWeekly(src, assetDates, periodo)
        : (() => { const closes = buildAlignedCloses(src, assetDates); return { closes, ema: calcEMA(closes, periodo) } })()
      const optsFiltro = {
        assetBars: barrasConCal, assetDates, alineado,
        assetSymbol: symbol,
        assetInterval: esSemanal ? 'semanal' : 'diario',
        resolveMercado: (ticker, semanal) => resolveFilterData(ticker, semanal ? '1wk' : '1d'),
        resolveSemanalActivo: () => semanalActivo,
      }
      const filtroActivoMap = construirFiltroActivoMap(filtrosLista, optsFiltro)
      filterZones = zonasDeMapa(barras, filtroActivoMap)
      // Las órdenes de `grafico` cuya entrada no permite el filtro, como bloqueadas: la misma regla con la
      // que el backtest descarta esas operaciones (entradaAlCierre como en multibacktest).
      if (grafico) marcaBloqueadas(grafico, { filtroActivoMap, assetDates,
        entradaAlCierre: effectiveCfg?.entradaAlCierre === true, motivos: motivosDeBloqueo(filtrosLista, optsFiltro) })
    }

    paso = 'convertir series'
    // 5. Series del vocabulario, con las fechas de las barras del motor.
    const fechasMotor = barras.map(d => d.date)
    const series = {}, niveles = {}, descartadas = {}
    for (const [clave, valor] of Object.entries(indicators || {})) {
      const nivel = NIVELES[clave]
      // obLevel/osLevel son ESCALARES por contrato: un número, no una serie. Van aparte.
      if (nivel) {
        if (finito(valor)) niveles[nivel] = valor
        else descartadas[clave] = `nivel no numérico (${typeof valor})`
        continue
      }
      const destino = SERIES[clave] ? clave : ALIAS[clave]
      if (!destino) { descartadas[clave] = 'fuera del vocabulario'; continue }
      if (series[destino]) continue                    // ya servida por su alias
      const { serie, motivo } = aSerie(valor, fechasMotor)
      if (serie) series[destino] = serie
      else descartadas[clave] = motivo
    }
    // Series declaradas en `grafico` con una clave fuera del vocabulario: sus valores llegan ya en la
    // rejilla del periodo, que es la de `fechasMotor`. Se mueven a `series` con su panel como escala y se
    // quitan de `grafico`, para no mandarlos dos veces.
    const escalasDeclaradas = {}
    for (const s of grafico?.series || []) {
      if (!Array.isArray(s.valores)) continue
      const { serie, motivo } = aSerie(s.valores, fechasMotor)
      // El bucle de arriba la habrá anotado como «fuera del vocabulario»: declarada, ya no lo está.
      if (serie) { series[s.clave] = serie; escalasDeclaradas[s.clave] = s.panel; delete descartadas[s.clave] }
      else descartadas[s.clave] = motivo
      delete s.valores
    }

    // 6. En semanal, las series se proyectan a las fechas DIARIAS del activo con el último valor CERRADO
    //    (proyectarSemanal). No se recalcula nada en diario a propósito: hay que dibujar lo que la
    //    estrategia miró, no una aproximación diaria que nunca existió. Sin esto, una EMA20 semanal
    //    encima de velas diarias sería otra curva: su soporte son ~100 sesiones, no 20.
    //    Las zonas no se proyectan: son rangos de fechas y el rectángulo los abarca igual, solo que con
    //    los bordes a resolución semanal, que es la resolución a la que el filtro decidió.
    paso = 'proyección semanal'
    // La proyección solo hace falta si los dos ejes NO coinciden: con velas semanales encima de barras
    // semanales, las series se dibujan directamente sobre su propio eje y quedan sin escalones. Esos
    // escalones eran correctos sobre un eje diario —arrastrar el último valor cerrado— pero no son el
    // indicador: son la traducción del indicador a otra rejilla.
    const velasSemanales = (intervaloVelas ?? 'diario') === 'semanal'
    let intervaloSalida = esSemanal ? 'semanal' : 'diario'
    if (esSemanal && !velasSemanales && Object.keys(series).length) {
      const diarias = await fetchData(symbol, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, '1d')
      const fechasDiarias = diarias?.map(d => d.date) || []
      if (fechasDiarias.length) {
        for (const [clave, s] of Object.entries(series)) {
          const porFecha = new Map(s.map(p => [p.date, p.value]))
          const valores = fechasMotor.map(f => porFecha.has(f) ? porFecha.get(f) : null)
          const proyectada = proyectarSemanal(valores, fechasMotor, fechasDiarias)
          const out = []
          for (let i = 0; i < fechasDiarias.length; i++) if (finito(proyectada[i])) out.push({ date: fechasDiarias[i], value: proyectada[i] })
          if (out.length) series[clave] = out
        }
        // Proyectadas: las fechas de salida ya son diarias, así que el intervalo que se anuncia es el de
        // las series ENTREGADAS, no el de las barras con las que se calcularon.
        intervaloSalida = 'diario'
      }
    }

    return res.status(200).json({
      symbol, strategyId: strategyId ?? null,
      intervalo: intervaloSalida,
      // El mismo campo que devuelven datos.js y multibacktest, para que las tres rutas digan en que
      // periodo y con cuanto calentamiento han corrido, y se pueda comprobar que es el mismo.
      periodo: { desde: _d.periodo.desde, hasta: _d.periodo.hasta, modo: _d.periodo.modo,
                 calentamiento: _d.periodo.calentamiento, calentamientoPedido: nCal },
      // Sobre qué eje vive cada serie, para que el cliente no tenga que saberlo.
      escalas: Object.fromEntries(Object.keys(series).map(k => [k, SERIES[k] ?? escalasDeclaradas[k]])),
      indicators: series,
      niveles,
      // Claves que llegaron y no se pudieron usar, con el motivo. Sin esto, una estrategia con un
      // `indicators` raro se traduce en un gráfico sin líneas y nadie sabe por qué.
      ...(Object.keys(descartadas).length ? { descartadas } : {}),
      filterZones,
      nBarras: barras.length,
      // Solo si la estrategia lo devuelve, y al final: sin él la respuesta es la de siempre, byte a byte.
      // Sus eventos y órdenes van con las fechas del motor: en semanal sobre velas diarias no se proyectan.
      ...(grafico ? { grafico } : {}),
    })
  } catch (e) {
    // Un error genérico y minificado es lo que ha dejado este fallo invisible: el cliente lo ignoraba en
    // silencio y no había forma de saber en qué paso se rompía. `paso` se va marcando por el camino.
    return res.status(500).json({
      error: `asset-detail (${paso}): ${e?.message || 'error desconocido'}`,
      paso, symbol: symbol ?? null,
    })
  }
}
