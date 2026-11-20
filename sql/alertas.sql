-- sql/alertas.sql — las ALERTAS rehechas desde cero (docs/builder.md §215; boceto bocetos/alertas-desde-cero.html, aceptado por Sergi el 20/11).
-- Parte 1: solo la base. La app todavía no la usa; la tabla vieja «alarms» y la 🔔 de hoy siguen igual hasta que lo nuevo tenga todo.
--
-- QUÉ.
--   alertas: una fila por alerta. Cada una lleva su símbolo (cualquiera de Yahoo: AAPL, ^GSPC, GC=F, BTC-USD…), así que se vigila el 100 %
--   de los valores, estén o no en la Watchlist. tipo + regla (jsonb) dicen cuándo salta; el formato de la regla lo decide la app (lib/alertas/):
--     toca        { nivel, sentido: 'sube' | 'baja' }            el máximo del día llega al nivel (sube) o el mínimo baja a él (baja)
--     cierra      { nivel, lado: 'encima' | 'debajo' }           la vela cierra al otro lado del nivel
--     movimiento  { pct, sentido: 'sube' | 'baja' | 'ambos' }    el precio se mueve X % desde el cierre de ayer
--     condicion   { filas: [{ quien, si, velas, union? }] }      filas del catálogo (como los filtros del plan), todas a la vez
--     estrategia  { estrategiaId, que: 'compra' | 'venta' }      una estrategia de tarjetas da señal hoy
--   despues: 'una_vez' (salta y se apaga) · 'una_al_dia' · 'cada_vez' (se rearma cuando deja de cumplirse: armada = false mientras tanto).
--   origen: el id de la alarma vieja de la que se copió (para no copiarla dos veces).
--   alertas_saltos: el historial «Saltaron» (cuándo, a qué precio, qué vio; visto = «✓ Vista», ahora en la base y no en el navegador).
--
-- QUIÉN. RLS «dueño»: cada usuario lee, crea, cambia y borra SOLO lo suyo; permisos por columnas (el dueño lo pone auth.uid(), las fechas el
-- disparador). Un salto solo se puede apuntar en una alerta propia. El comprobador de Windows escribe con la clave de servicio (local). anon, nada.
--
-- REVERSIÓN: DROP TABLE public.alertas_saltos; DROP TABLE public.alertas; DROP FUNCTION public.alertas_al_cambiar();
-- (no los usa nada más; la tabla vieja «alarms» no se toca).

CREATE TABLE public.alertas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  simbolo      text NOT NULL,
  tipo         text NOT NULL,
  regla        jsonb NOT NULL DEFAULT '{}'::jsonb,
  despues      text NOT NULL DEFAULT 'una_vez',
  activa       boolean NOT NULL DEFAULT true,
  armada       boolean NOT NULL DEFAULT true,
  caduca       date,
  nota         text,
  ultimo_salto timestamptz,
  origen       uuid,
  creada       timestamptz NOT NULL DEFAULT now(),
  actualizada  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alertas_simbolo CHECK (simbolo = upper(btrim(simbolo)) AND length(simbolo) BETWEEN 1 AND 30),
  CONSTRAINT alertas_tipo CHECK (tipo IN ('toca', 'cierra', 'movimiento', 'condicion', 'estrategia')),
  CONSTRAINT alertas_regla CHECK (jsonb_typeof(regla) = 'object' AND octet_length(regla::text) <= 51200),
  CONSTRAINT alertas_despues CHECK (despues IN ('una_vez', 'una_al_dia', 'cada_vez')),
  CONSTRAINT alertas_nota CHECK (nota IS NULL OR length(nota) <= 2000),
  CONSTRAINT alertas_origen UNIQUE (user_id, origen)
);
CREATE INDEX alertas_usuario ON public.alertas (user_id, activa);

CREATE TABLE public.alertas_saltos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta_id   uuid NOT NULL REFERENCES public.alertas(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  simbolo     text NOT NULL,
  cuando      timestamptz NOT NULL DEFAULT now(),
  precio      numeric,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  visto       boolean NOT NULL DEFAULT false,
  CONSTRAINT alertas_saltos_detalle CHECK (jsonb_typeof(detalle) = 'object' AND octet_length(detalle::text) <= 20480)
);
CREATE INDEX alertas_saltos_usuario ON public.alertas_saltos (user_id, cuando DESC);
CREATE INDEX alertas_saltos_alerta ON public.alertas_saltos (alerta_id);

CREATE FUNCTION public.alertas_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizada := now();
  RETURN NEW;
END $$;
CREATE TRIGGER alertas_al_cambiar BEFORE UPDATE ON public.alertas FOR EACH ROW EXECUTE FUNCTION public.alertas_al_cambiar();

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY alertas_leer ON public.alertas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY alertas_insertar ON public.alertas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY alertas_cambiar ON public.alertas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY alertas_borrar ON public.alertas FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.alertas FROM anon;
REVOKE ALL ON public.alertas FROM authenticated;
GRANT SELECT, DELETE ON public.alertas TO authenticated;
GRANT INSERT (simbolo, tipo, regla, despues, activa, armada, caduca, nota, ultimo_salto),
      UPDATE (simbolo, tipo, regla, despues, activa, armada, caduca, nota, ultimo_salto) ON public.alertas TO authenticated;

ALTER TABLE public.alertas_saltos ENABLE ROW LEVEL SECURITY;
CREATE POLICY alertas_saltos_leer ON public.alertas_saltos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY alertas_saltos_insertar ON public.alertas_saltos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.alertas a WHERE a.id = alerta_id AND a.user_id = auth.uid()));
CREATE POLICY alertas_saltos_cambiar ON public.alertas_saltos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY alertas_saltos_borrar ON public.alertas_saltos FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.alertas_saltos FROM anon;
REVOKE ALL ON public.alertas_saltos FROM authenticated;
GRANT SELECT, DELETE ON public.alertas_saltos TO authenticated;
GRANT INSERT (alerta_id, simbolo, cuando, precio, detalle) ON public.alertas_saltos TO authenticated;
GRANT UPDATE (visto) ON public.alertas_saltos TO authenticated;
REVOKE ALL ON FUNCTION public.alertas_al_cambiar() FROM PUBLIC, anon, authenticated;

-- ── Copia de las alarmas de hoy (tabla «alarms», solo las activas) ──
-- Alarmas de precio → «Toca el precio» (la vieja comparaba el último precio con el nivel: price_above = sube hasta, price_below = baja hasta).
INSERT INTO public.alertas (user_id, simbolo, tipo, regla, despues, nota, origen, creada)
SELECT a.user_id, upper(btrim(a.symbol)), 'toca',
       jsonb_build_object('nivel', a.price_level, 'sentido', CASE WHEN a.condition_detail = 'price_below' THEN 'baja' ELSE 'sube' END),
       'una_vez', NULLIF(btrim(coalesce(a.notes, '')), ''), a.id, a.created_at
FROM public.alarms a
WHERE a.active AND a.condition = 'price_level' AND a.price_level IS NOT NULL AND a.symbol IS NOT NULL AND a.user_id IS NOT NULL
ON CONFLICT (user_id, origen) DO NOTHING;
-- Cruces de EMA → «Condición del catálogo»: la EMA rápida cruza por encima / por debajo de la lenta, velas diarias.
INSERT INTO public.alertas (user_id, simbolo, tipo, regla, despues, nota, origen, creada)
SELECT a.user_id, upper(btrim(a.symbol)), 'condicion',
       jsonb_build_object('filas', jsonb_build_array(jsonb_build_object('quien', 'valor', 'velas', 'diarias', 'si',
         jsonb_build_object('c', 'cruza', 'de', jsonb_build_object('c', 'mediaVsMedia', 'p', jsonb_build_object(
           'tipoRapida', 'EMA', 'periodoRapida', coalesce(a.ema_r, 10), 'tipoLenta', 'EMA', 'periodoLenta', coalesce(a.ema_l, 11),
           'lado', CASE WHEN a.condition = 'ema_cross_down' THEN 'debajo' ELSE 'encima' END)))))),
       'cada_vez', NULLIF(btrim(coalesce(a.notes, '')), ''), a.id, a.created_at
FROM public.alarms a
WHERE a.active AND a.condition IN ('ema_cross_up', 'ema_cross_down') AND a.symbol IS NOT NULL AND a.user_id IS NOT NULL
ON CONFLICT (user_id, origen) DO NOTHING;
