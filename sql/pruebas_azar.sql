-- sql/pruebas_azar.sql — paso 2 del Builder, «Probarla contra el azar» con el azar re-simulado (docs/builder.md, §44).
--
-- QUÉ. pruebas_azar: una fila por prueba CONFIRMADA, antes de ver ningún resultado: la foto exacta de la estrategia (el JSON de
-- lib/pruebaAzar.js fotoDe: id, name, definition, params) y su huella (sha256 del JSON canónico, lib/lotesLab.js huella), el valor,
-- las velas, los periodos, la regla (copia de REGLA_AZAR_REGLAS de lib/azarReglas.js) y la semilla. Con eso, la prueba se puede
-- repetir y da exactamente lo mismo (lib/pruebaAzar.js ejecutarPrueba usa solo lo guardado, nunca la estrategia de ahora).
-- pruebas_azar_resultados: como mucho UN resultado por prueba (prueba_id único), con las cifras de cada periodo y el veredicto.
--
-- QUIÉN. Como editor_lotes y lab_pruebas: user_id = auth.uid() y RLS «dueño». De SOLO AÑADIR: el usuario puede leer e insertar
-- lo suyo, no cambiarlo ni borrarlo (sin políticas de UPDATE ni DELETE y sin esos permisos): una prueba confirmada no se retoca
-- después de ver su resultado. Un resultado solo se puede añadir a una prueba propia.
-- estrategia_id no es una clave ajena: borrar una estrategia no puede borrar ni bloquear sus pruebas.
--
-- REVERSIÓN: DROP TABLE public.pruebas_azar_resultados; DROP TABLE public.pruebas_azar; (no las usa nada más).
--
-- BORRAR UNA PRUEBA (p. ej. una de ensayo): el usuario no puede; se hace por la Management API, que conecta como postgres, con la
-- huella como guardia para no borrar otra fila por un id equivocado:
--   DELETE FROM public.pruebas_azar_resultados WHERE prueba_id = <id>;
--   DELETE FROM public.pruebas_azar WHERE id = <id> AND estrategia_huella = '<estrategia_huella de esa fila>' RETURNING id;

CREATE TABLE public.pruebas_azar (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  creada_en          timestamptz NOT NULL DEFAULT now(),
  estrategia_id      uuid NOT NULL,
  estrategia_nombre  text NOT NULL,
  estrategia_foto    jsonb NOT NULL,
  estrategia_huella  text NOT NULL,
  valor              text NOT NULL,
  velas              text NOT NULL,
  periodos           jsonb NOT NULL,
  regla              jsonb NOT NULL,
  semilla            bigint NOT NULL,
  version_app        text,
  CONSTRAINT pruebas_azar_huella CHECK (estrategia_huella ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pruebas_azar_velas CHECK (velas IN ('diarias', 'semanales')),
  CONSTRAINT pruebas_azar_nombre CHECK (length(btrim(estrategia_nombre)) BETWEEN 1 AND 200),
  CONSTRAINT pruebas_azar_valor CHECK (length(btrim(valor)) BETWEEN 1 AND 40),
  CONSTRAINT pruebas_azar_foto_tamano CHECK (octet_length(estrategia_foto::text) <= 204800),
  CONSTRAINT pruebas_azar_semilla CHECK (semilla BETWEEN 0 AND 4294967295)
);
CREATE INDEX pruebas_azar_estrategia ON public.pruebas_azar (user_id, estrategia_id, creada_en DESC);

CREATE TABLE public.pruebas_azar_resultados (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prueba_id    bigint NOT NULL REFERENCES public.pruebas_azar(id),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  resultado    jsonb NOT NULL,
  version_app  text,
  CONSTRAINT pruebas_azar_resultados_unico UNIQUE (prueba_id),
  CONSTRAINT pruebas_azar_resultados_tamano CHECK (octet_length(resultado::text) <= 204800)
);

ALTER TABLE public.pruebas_azar ENABLE ROW LEVEL SECURITY;
CREATE POLICY pruebas_azar_leer ON public.pruebas_azar FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pruebas_azar_insertar ON public.pruebas_azar FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.pruebas_azar FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pruebas_azar FROM authenticated;
GRANT SELECT, INSERT ON public.pruebas_azar TO authenticated;

ALTER TABLE public.pruebas_azar_resultados ENABLE ROW LEVEL SECURITY;
CREATE POLICY pruebas_azar_resultados_leer ON public.pruebas_azar_resultados FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pruebas_azar_resultados_insertar ON public.pruebas_azar_resultados FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.pruebas_azar p WHERE p.id = prueba_id AND p.user_id = auth.uid()));
REVOKE ALL ON public.pruebas_azar_resultados FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pruebas_azar_resultados FROM authenticated;
GRANT SELECT, INSERT ON public.pruebas_azar_resultados TO authenticated;
