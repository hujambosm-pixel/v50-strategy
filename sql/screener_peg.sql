-- sql/screener_peg.sql — el HISTORIAL del PEG esperado de Yahoo (docs/screener.md §30; con OK de Sergi del 26/11/2026 al cambio
-- en la base).
--
-- POR QUÉ. El filtro «PEG esperado» (el que publica Yahoo con el crecimiento que esperan los analistas) no está en la SEC: en el
-- pasado no se podía aplicar. Yahoo guarda unos pocos valores sueltos hacia atrás (serie trailingPegRatio de fundamentals-timeseries;
-- para AAPL, 11 desde el 10/06/2024, con un hueco de más de un año entre el 19/09/2024 y el 02/10/2025). Se guardan aquí y, desde
-- ahora, la carga semanal añade el de cada semana.
--
-- QUÉ. Una fila por símbolo y fecha (`fecha` = asOfDate de Yahoo): `peg` tal como lo da Yahoo. En una fecha pasada se usa el último
-- con fecha ≤ ese cierre y como mucho 400 días antes (decisión de Sergi del 27/11/2026; lib/screener/enFecha.js pegEnFecha).
--
-- QUIÉN. Datos públicos, iguales para todos: los lee cualquier usuario con sesión; nadie los escribe desde la app (solo
-- scripts/cargaScreener.js, que conecta como postgres). anon, nada.
--
-- REVERSIÓN (solo la usan scripts/cargaScreener.js y scripts/fotosScreener.js; sin la tabla, las fotos vuelven a no guardar el PEG
-- esperado si se rehacen con la versión anterior del código):
--   DROP TABLE public.screener_peg;

CREATE TABLE public.screener_peg (
  simbolo  text NOT NULL,
  fecha    date NOT NULL,
  peg      double precision NOT NULL,
  leido    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (simbolo, fecha),
  CONSTRAINT screener_peg_simbolo CHECK (simbolo ~ '^[A-Z0-9.^=-]{1,20}$'),
  CONSTRAINT screener_peg_finito CHECK (peg > -1e6 AND peg < 1e6)
);

ALTER TABLE public.screener_peg ENABLE ROW LEVEL SECURITY;
CREATE POLICY screener_peg_lectura ON public.screener_peg FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.screener_peg FROM anon;
REVOKE ALL ON public.screener_peg FROM authenticated;
GRANT SELECT ON public.screener_peg TO authenticated;
