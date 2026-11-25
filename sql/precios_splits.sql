-- sql/precios_splits.sql — los SPLITS de cada valor (docs/screener.md §25; paso 1 de «la lista del screener de cada día»).
--
-- POR QUÉ. Los precios de Yahoo (precios_diarios) están ajustados por splits: el cierre de AAPL de 2017 sale ya dividido entre 4
-- por el split de 2020. Las acciones que da la SEC (screener_cuentas, concepto acciones_diluidas) NO: cada cifra está en las
-- acciones que había el día en que se presentó el documento del que sale (columna `presentado`). Para calcular la capitalización,
-- el PER o el P/S de una fecha pasada hay que llevar las acciones a la misma escala que los precios:
--   acciones ajustadas = acciones × (producto de los splits con fecha POSTERIOR a `presentado`)   (lib/screener/splits.js)
-- Ejemplo: AAPL 2017, 5.252 millones (del informe de oct. 2019) × 4 (split de ago. 2020) = 21.008 millones.
--
-- QUÉ. Una fila por símbolo: `splits` = lista de [fecha, numerador, denominador] ordenada por fecha (4:1 → ["2020-08-31", 4, 1];
-- un split inverso 1 por 10 → [..., 1, 10]); lista vacía = Yahoo no da ninguno. `revisado` = cuándo se le preguntó a Yahoo (así se
-- distingue «sin splits» de «no mirado»). La escribe scripts/cargaScreener.js --splits (y la carga semanal).
--
-- QUIÉN. Datos públicos, iguales para todos: los lee cualquier usuario con sesión; nadie los escribe desde la app (solo los
-- scripts, que conectan como postgres). anon, nada.
--
-- REVERSIÓN (no la usa nada más):
--   DROP TABLE public.precios_splits;

CREATE TABLE public.precios_splits (
  simbolo   text PRIMARY KEY,
  splits    jsonb NOT NULL DEFAULT '[]'::jsonb,
  revisado  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT precios_splits_simbolo CHECK (simbolo ~ '^[A-Z0-9.^=-]{1,20}$'),
  CONSTRAINT precios_splits_lista CHECK (jsonb_typeof(splits) = 'array' AND octet_length(splits::text) <= 4096)
);

ALTER TABLE public.precios_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY precios_splits_lectura ON public.precios_splits FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.precios_splits FROM anon;
REVOKE ALL ON public.precios_splits FROM authenticated;
GRANT SELECT ON public.precios_splits TO authenticated;
