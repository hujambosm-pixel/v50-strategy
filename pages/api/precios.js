// pages/api/precios.js — precios de VARIOS símbolos en una sola petición.
//
// POR QUÉ EXISTE. El precio de un activo se pedía con /api/datos en modo priceOnly, un símbolo por
// llamada. Para poner el precio junto a cada ticker de la watchlist —163 activos— eso eran 163
// peticiones del navegador, y además priceOnly devuelve SOLO el último cierre, así que la variación
// diaria ni siquiera se podía calcular sin otra ronda igual de larga.
//
// Aquí se piden por lotes y se devuelven los DOS últimos cierres, con lo que la variación se calcula en
// el cliente sin pedir nada más.
//
// NO DUPLICA LÓGICA DE DESCARGA. Usa fetchAVDetalle de ./datos, que es el mismo camino de siempre —Stooq
// primero con 3 s de plazo, Yahoo de respaldo— y la MISMA caché de 60 segundos que usa priceOnly, no una
// paralela: un símbolo que acabe de pedir el Dashboard llega aquí ya resuelto y no se vuelve a descargar.
//
// NO CAMBIA NADA DE /api/datos. Esa ruta responde exactamente igual que antes; lo único que se tocó allí
// fue guardar también el cierre ANTERIOR en la caché, que es un campo más en un valor interno.

import { fetchAVDetalle, getCachedPrice, setCachedPrice } from './datos'

// ── Tope de símbolos por llamada, y por qué 20 ──────────────────────────────
// EL COSTE DE UN SÍMBOLO NO CACHEADO NO ES "LO QUE TARDE LA RED": está fijado por los dos plazos de
// fetchAVDetalle. Desde Vercel, Stooq cuelga 10-12 s y se aborta a los 3 (ver datos.js, "Stooq hangs
// 10-12s from Vercel IPs"), y después Yahoo tiene otros 4. Peor caso por símbolo: 3 + 4 = 7 segundos.
//
// De ahí sale todo lo demás:
//   · Una función de Vercel en plan Hobby se corta a los 10 s. Ese es el techo que no se puede rozar.
//   · Si los símbolos se resuelven en RONDAS sucesivas, cada ronda suma 7 s y a la segunda se pasa del
//     límite. Por eso ya no hay rondas: los pendientes de una llamada se lanzan TODOS A LA VEZ.
//   · Con una sola ronda, el peor caso de la llamada entera es 7 s, y NO depende de cuántos símbolos
//     lleve: los plazos corren en paralelo. Quedan ~3 s de margen sobre los 10.
//
// El tope baja de 40 a 20 y el reparto pasa de 5 llamadas a 9 para los 163 de la watchlist. No es por
// tiempo —20 o 40 tardarían lo mismo— sino por no lanzar 40 peticiones simultáneas al mismo proveedor:
// 20 a la vez, y el cliente espera la respuesta antes del siguiente trozo, deja el ritmo en unas 3
// peticiones por segundo sostenidas.
export const TOPE_SIMBOLOS = 20

// ── Presupuesto ─────────────────────────────────────────────────────────────
// Red de seguridad, no el mecanismo principal. Con una sola ronda el peor caso ya está acotado en 7 s;
// esto solo cubre que el reparto de cacheados se alargue por lo que sea. Si se agota, lo que quede vuelve
// marcado sin dato y el cliente lo reintenta, en vez de arriesgar la respuesta entera al corte de los 10.
const PRESUPUESTO_MS = 7500

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const crudos = req.body?.simbolos
  if (!Array.isArray(crudos) || !crudos.length) return res.status(400).json({ error: 'simbolos requerido' })

  // Se limpia y se quitan repetidos antes de trocear: un símbolo repetido gastaría una descarga entera.
  const simbolos = [...new Set(crudos.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()))]
    .slice(0, TOPE_SIMBOLOS)

  const t0 = Date.now()
  const salida = {}

  // Lo que ya esté en caché se resuelve sin tocar la red, y sale del reparto de lotes.
  const pendientes = []
  for (const sim of simbolos) {
    const c = getCachedPrice(sim)
    if (c !== null && c.price != null) {
      salida[sim] = { precio: c.price, anterior: c.prev ?? null, fecha: c.date, origen: c.origen ?? null, deCache: true }
    } else {
      pendientes.push(sim)
    }
  }

  if (pendientes.length && Date.now() - t0 <= PRESUPUESTO_MS) {
    // TODOS A LA VEZ, no por rondas. Los plazos de Stooq y Yahoo corren en paralelo, así que veinte
    // símbolos cuestan lo mismo que uno en el peor caso: 7 s. Encadenarlos en rondas era lo que hacía que
    // solo entraran ocho de cuarenta.
    // UN SÍMBOLO QUE FALLA NO SE LLEVA A LOS DEMÁS: cada uno va en su try y devuelve su propio motivo.
    await Promise.all(pendientes.map(async (sim) => {
      try {
        const { data, origen } = await fetchAVDetalle(sim, 1)
        if (!Array.isArray(data) || !data.length) { salida[sim] = { sinDato: true, motivo: 'sin barras' }; return }
        const ultimo = data[data.length - 1]
        const previo = data.length > 1 ? data[data.length - 2] : null
        setCachedPrice(sim, ultimo.close, ultimo.date, origen, 'd', previo?.close ?? null)
        salida[sim] = { precio: ultimo.close, anterior: previo?.close ?? null, fecha: ultimo.date, origen }
      } catch (e) {
        salida[sim] = { sinDato: true, motivo: (e?.message || 'error').slice(0, 80) }
      }
    }))
  } else if (pendientes.length) {
    for (const sim of pendientes) salida[sim] = { sinDato: true, motivo: 'plazo' }
  }

  return res.status(200).json({ precios: salida, pedidos: simbolos.length, ms: Date.now() - t0 })
}
