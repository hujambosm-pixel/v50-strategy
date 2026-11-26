-- sql/screener_fotos.sql — las FOTOS SEMANALES del screener (docs/screener.md §29; paso 4 de «la lista del screener de cada día»,
-- con OK de Sergi del 25/11/2026 al cambio en la base).
--
-- POR QUÉ. Para saber qué empresas pasaban una vista del screener un día del pasado (y usarlo en el Replay) hay que calcular las
-- cifras de las ~600 empresas con lo que se sabía ese día (lib/screener/enFecha.js). Es un cálculo pesado (cuentas de todas,
-- 5 años de velas de cada una): se hace UNA vez por semana y se guarda aquí.
--
-- QUÉ. Una fila por LUNES (`fecha`): la lista de ese lunes se decide con el cierre del viernes anterior y las cuentas que la SEC
-- había publicado hasta ese viernes (`cierre` = ese viernes, o el último día con mercado antes del lunes).
--   · campos: los ids de los filtros guardados, en orden (CAMPOS_FOTO de lib/screener/enFecha.js: todos los del screener menos
--     el PEG esperado, que en el pasado no existe, y «Da señal de compra con…», que se calcula aparte).
--   · datos: { "AAPL": [valor de cada campo], … }; un valor es un número, null (sin dato: no pasa) o "sd" (sin dato pero pasa:
--     sin deuda a corto, no paga intereses). Las empresas sin precio ni cuentas ese día no están.
-- Un cambio de las fórmulas obliga a rehacer las fotos (scripts/fotosScreener.js --desde …): no se arreglan a mano.
--
-- QUIÉN. Datos públicos, iguales para todos: los lee cualquier usuario con sesión; nadie los escribe desde la app (solo el script,
-- que conecta como postgres). anon, nada.
--
-- REVERSIÓN (no la usa nada más que la fuente «Vista del screener» del Replay, que sin fotos lo dice):
--   DROP TABLE public.screener_fotos;

CREATE TABLE public.screener_fotos (
  fecha    date PRIMARY KEY,
  cierre   date NOT NULL,
  campos   text[] NOT NULL,
  datos    jsonb NOT NULL,
  hecha    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screener_fotos_lunes CHECK (extract(isodow FROM fecha) = 1),
  CONSTRAINT screener_fotos_cierre CHECK (cierre < fecha AND cierre >= fecha - 10),
  CONSTRAINT screener_fotos_datos CHECK (jsonb_typeof(datos) = 'object' AND octet_length(datos::text) <= 1048576)
);

ALTER TABLE public.screener_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY screener_fotos_lectura ON public.screener_fotos FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.screener_fotos FROM anon;
REVOKE ALL ON public.screener_fotos FROM authenticated;
GRANT SELECT ON public.screener_fotos TO authenticated;
