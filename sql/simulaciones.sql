-- sql/simulaciones.sql — las SIMULACIONES: «Replay» (operar a mano en el pasado, vela a vela) y, más adelante, «Paper trading»
-- (operar de mentira en el presente). docs/builder.md §224; boceto bocetos/replay-simulacion.html (v2), aceptado por Sergi el 21/11.
-- Parte 1 del Replay: solo la base. La app todavía no la usa; el TradeLog y la operativa real no se tocan (van aparte, a propósito).
--
-- QUÉ. Una fila por simulación:
--   tipo    'replay' | 'paper' (se pone al crearla y no cambia).
--   nombre  el que ve Sergi en Seguir › Simulaciones (1–120 letras).
--   estado  todo lo de dentro, en un objeto (≤ 1 MB). El formato lo decide la app (lib/replay/); la base solo exige que sea un objeto:
--           { version, valores: [símbolos], velas: 'diario' | 'semanal', desde, hoy (fecha en la que vas), capitalInicial,
--             comision, ajustes: { aCiegas, tamano… }, ordenes: [...], operaciones: [...], retrocesos, terminada }
--   creada / actualizada  las pone la base (la segunda, el disparador en cada cambio).
--
-- QUIÉN. RLS «dueño»: cada usuario lee, crea, cambia y borra SOLO lo suyo. Permisos por columnas: al crear, tipo, nombre y estado;
-- al cambiar, solo nombre y estado (el dueño lo pone auth.uid(); las fechas, la base). anon, nada.
--
-- REVERSIÓN: DROP TABLE public.simulaciones; DROP FUNCTION public.simulaciones_al_cambiar(); (no los usa nada más).

CREATE TABLE public.simulaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo         text NOT NULL DEFAULT 'replay',
  nombre       text NOT NULL,
  estado       jsonb NOT NULL DEFAULT '{}'::jsonb,
  creada       timestamptz NOT NULL DEFAULT now(),
  actualizada  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulaciones_tipo CHECK (tipo IN ('replay', 'paper')),
  CONSTRAINT simulaciones_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  CONSTRAINT simulaciones_estado CHECK (jsonb_typeof(estado) = 'object' AND octet_length(estado::text) <= 1048576)
);
CREATE INDEX simulaciones_usuario ON public.simulaciones (user_id, actualizada DESC);

CREATE FUNCTION public.simulaciones_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizada := now();
  RETURN NEW;
END $$;
CREATE TRIGGER simulaciones_al_cambiar BEFORE UPDATE ON public.simulaciones FOR EACH ROW EXECUTE FUNCTION public.simulaciones_al_cambiar();

ALTER TABLE public.simulaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY simulaciones_leer ON public.simulaciones FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY simulaciones_insertar ON public.simulaciones FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY simulaciones_cambiar ON public.simulaciones FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY simulaciones_borrar ON public.simulaciones FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.simulaciones FROM anon;
REVOKE ALL ON public.simulaciones FROM authenticated;
GRANT SELECT, DELETE ON public.simulaciones TO authenticated;
GRANT INSERT (tipo, nombre, estado), UPDATE (nombre, estado) ON public.simulaciones TO authenticated;
REVOKE ALL ON FUNCTION public.simulaciones_al_cambiar() FROM PUBLIC, anon, authenticated;
