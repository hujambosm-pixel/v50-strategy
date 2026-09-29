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

// ── Tope de símbolos por llamada ────────────────────────────────────────────
// 40. El precalentamiento que ya existía en el cliente se puso un tope de 50 "cautiously (Yahoo Finance
// rate limiting)", así que 40 se queda por debajo de lo que el proyecto ya consideraba prudente, y deja
// los 163 de la watchlist en cinco llamadas. Más alto no ahorraría gran cosa —el trabajo de red es el
// mismo— y alargaría cada respuesta.
export const TOPE_SIMBOLOS = 40

// ── Ritmo ───────────────────────────────────────────────────────────────────
// Lotes de 4 en paralelo con 200 ms de pausa entre lotes, que es el mismo cuidado que ya se tenía en el
// cliente (lotes de 3 con 200 ms). Con la caché caliente no se descarga nada y el ritmo no se nota.
const POR_LOTE = 4
const PAUSA_MS = 200

// ── Presupuesto de tiempo ───────────────────────────────────────────────────
// Una función de Vercel tiene un límite de ejecución, y 40 símbolos con la caché fría y un proveedor
// lento podrían rozarlo. En vez de arriesgarse a que la respuesta entera se pierda por plazo, se trabaja
// hasta agotar el presupuesto y lo que no dé tiempo vuelve marcado como sin dato: el cliente lo
// reintentará en la siguiente carga, ya con la caché caliente. Media respuesta útil es mejor que ninguna.
const PRESUPUESTO_MS = 8000

const espera = (ms) => new Promise(r => setTimeout(r, ms))

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

  for (let i = 0; i < pendientes.length; i += POR_LOTE) {
    // Presupuesto agotado: el resto vuelve sin dato en vez de arriesgar la respuesta entera.
    if (Date.now() - t0 > PRESUPUESTO_MS) {
      for (const sim of pendientes.slice(i)) salida[sim] = { sinDato: true, motivo: 'plazo' }
      break
    }
    const lote = pendientes.slice(i, i + POR_LOTE)
    // UN SÍMBOLO QUE FALLA NO SE LLEVA A LOS DEMÁS: cada uno va en su try y devuelve su propio motivo.
    await Promise.all(lote.map(async (sim) => {
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
    if (i + POR_LOTE < pendientes.length) await espera(PAUSA_MS)
  }

  return res.status(200).json({ precios: salida, pedidos: simbolos.length, ms: Date.now() - t0 })
}
